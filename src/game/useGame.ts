import { useEffect, useReducer } from 'react';
import { nextCpuAction, cpuDelay } from './cpu';
import {
  buildDeck,
  rollDie,
  type MagicCard,
  type MonsterCard,
  type TrapCard,
} from './cardData';
import {
  type Action,
  type CombatResult,
  type FieldMonster,
  type GameState,
  type PlayerState,
  type Position,
  MAX_HAND_SIZE,
  canAttack,
  createPlayer,
  drawCards,
  getEffectiveAtk,
  getFirstEmptySlot,
  hasEmptySlot,
  resolveCombat,
  shuffleDeck,
} from './types';

function genUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function initialState(): GameState {
  return {
    phase: 'start',
    mode: 'local',
    difficulty: 'normal',
    currentPlayer: 0,
    turnCount: 0,
    players: [
      createPlayer(0, 'Jugador 1', []),
      createPlayer(1, 'Jugador 2', []),
    ],
    selection: { kind: 'none' },
    log: [],
    winner: null,
    pendingTrap: null,
    pendingDice: null,
    lastCombat: null,
    passTarget: 0,
    diceResult: null,
  };
}

function addLog(state: GameState, msg: string): string[] {
  return [...state.log.slice(-50), msg];
}

function checkWinner(players: [PlayerState, PlayerState]): 0 | 1 | null {
  if (players[0].lp <= 0 && players[1].lp <= 0) return players[0].lp >= players[1].lp ? 0 : 1;
  if (players[1].lp <= 0) return 0;
  if (players[0].lp <= 0) return 1;
  return null;
}

const MAX_CARDS_PER_TURN = 3;

function hasCardInHand(player: PlayerState, cardId: string): boolean {
  return player.hand.some((card) => card.id === cardId);
}

function playCardFromHand(player: PlayerState, cardId: string): PlayerState {
  return { ...player, hand: player.hand.filter((c) => c.id !== cardId), cardsPlayedThisTurn: player.cardsPlayedThisTurn + 1 };
}

function findFieldMonster(player: PlayerState, uid: string): FieldMonster | null {
  return player.field.find((f) => f?.uid === uid) ?? null;
}

function updateFieldMonster(player: PlayerState, uid: string, updater: (fm: FieldMonster) => FieldMonster): PlayerState {
  return { ...player, field: player.field.map((f) => (f?.uid === uid ? updater(f) : f)) };
}

function removeFieldMonster(player: PlayerState, uid: string): PlayerState {
  const fm = findFieldMonster(player, uid);
  const graveyard = fm ? [...player.graveyard, fm.card, ...(fm.trap ? [fm.trap] : []), ...(fm.magic ? [fm.magic] : [])] : player.graveyard;
  return { ...player, field: player.field.map((f) => (f?.uid === uid ? null : f)), graveyard };
}

function applyDamage(player: PlayerState, dmg: number): PlayerState {
  return { ...player, lp: Math.max(0, player.lp - dmg) };
}

function applyHeal(player: PlayerState, heal: number): PlayerState {
  return { ...player, lp: Math.min(999, player.lp + heal) };
}

// --- Trap resolution ---
function applyTrapEffect(
  state: GameState,
  trap: TrapCard,
  attackerPlayer: 0 | 1,
  defenderPlayer: 0 | 1,
  attackerUid: string,
  defenderUid: string,
): { state: GameState; negateAttack: boolean; destroyAttacker: boolean; skipCombat: boolean } {
  const players = [...state.players] as [PlayerState, PlayerState];
  let negateAttack = false;
  let destroyAttacker = false;
  let skipCombat = false;
  const log: string[] = [];
  const effect = trap.effect;
  const attacker = findFieldMonster(players[attackerPlayer], attackerUid);
  const defender = findFieldMonster(players[defenderPlayer], defenderUid);

  switch (effect.kind) {
    case 'heal_per_turn':
      // passive — handled at turn start, not on attack
      log.push(`¡${trap.name}! (Efecto pasivo, no se activa en combate.)`);
      break;
    case 'destroy_2_self_1_opp': {
      const selfFms = players[defenderPlayer].field.filter(Boolean) as FieldMonster[];
      const oppFms = players[attackerPlayer].field.filter(Boolean) as FieldMonster[];
      const selfDestroy = selfFms.slice(0, 2);
      const oppDestroy = oppFms.slice(0, 1);
      selfDestroy.forEach((f) => { players[defenderPlayer] = removeFieldMonster(players[defenderPlayer], f.uid); });
      oppDestroy.forEach((f) => { players[attackerPlayer] = removeFieldMonster(players[attackerPlayer], f.uid); });
      log.push(`¡${trap.name}! Destruyes ${selfDestroy.length} tuyos y ${oppDestroy.length} del rival.`);
      negateAttack = true;
      skipCombat = true;
      break;
    }
    case 'dice_count_field':
      // needs dice — set up pending dice
      return { state: { ...state, phase: 'dice-roll', pendingDice: { reason: trap.name, onRoll: (roll: number) => ({ type: 'ROLL_DICE', roll }) } }, negateAttack: true, destroyAttacker: false, skipCombat: true };
    case 'reflect_damage':
      // handled in combat resolution — mark defender
      if (defender) {
        players[defenderPlayer] = updateFieldMonster(players[defenderPlayer], defenderUid, (fm) => ({ ...fm, pendingEffect: 'death', pendingTurns: -1 }));
        log.push(`¡${trap.name}! El daño será devuelto al adversario.`);
      }
      break;
    case 'negate_destroy_card': {
      negateAttack = true;
      skipCombat = true;
      // destroy a trap or magic from opponent's field
      const oppField = players[attackerPlayer].field.filter(Boolean) as FieldMonster[];
      const target = oppField.find((f) => f.trap || f.magic);
      if (target) {
        players[attackerPlayer] = updateFieldMonster(players[attackerPlayer], target.uid, (fm) => ({ ...fm, trap: null, magic: null }));
        log.push(`¡${trap.name}! Ataque negado y carta especial del rival destruida.`);
      } else {
        log.push(`¡${trap.name}! Ataque negado.`);
      }
      break;
    }
    case 'dice_4plus_destroy':
      return { state: { ...state, phase: 'dice-roll', pendingDice: { reason: trap.name, onRoll: (roll: number) => ({ type: 'ROLL_DICE', roll }) } }, negateAttack: true, destroyAttacker: false, skipCombat: true };
    case 'swap_attacker': {
      // swap attacker with defender's monster (the trap owner's monster)
      // simplest: the defender's monster takes the attacker's place conceptually — we negate and swap
      if (attacker && defender) {
        // swap positions: attacker becomes defender's, defender becomes attacker's
        const atkCard = attacker.card;
        const defCard = defender.card;
        players[attackerPlayer] = updateFieldMonster(players[attackerPlayer], attackerUid, (fm) => ({ ...fm, card: defCard, atk: defCard.atk, def: defCard.def }));
        players[defenderPlayer] = updateFieldMonster(players[defenderPlayer], defenderUid, (fm) => ({ ...fm, card: atkCard, atk: atkCard.atk, def: atkCard.def }));
        log.push(`¡${trap.name}! Los Monstruos se intercambian.`);
      }
      negateAttack = true;
      skipCombat = true;
      break;
    }
    case 'destroy_attacker':
      if (attacker) {
        players[attackerPlayer] = removeFieldMonster(players[attackerPlayer], attackerUid);
        log.push(`¡${trap.name}! ${attacker.card.name} es destruido.`);
        destroyAttacker = true;
        negateAttack = true;
        skipCombat = true;
      }
      break;
    case 'three_turns_kill':
      if (attacker) {
        players[attackerPlayer] = updateFieldMonster(players[attackerPlayer], attackerUid, (fm) => ({ ...fm, pendingEffect: 'three_turns', pendingTurns: 3 }));
        log.push(`¡${trap.name}! ${attacker.card.name} morirá en 3 turnos.`);
        negateAttack = true;
        skipCombat = true;
      }
      break;
    case 'control_two_turns':
      if (attacker) {
        players[attackerPlayer] = updateFieldMonster(players[attackerPlayer], attackerUid, (fm) => ({ ...fm, pendingEffect: 'control', pendingTurns: 2, controlledBy: defenderPlayer }));
        log.push(`¡${trap.name}! ${attacker.card.name} es controlado por 2 turnos.`);
        negateAttack = true;
        skipCombat = true;
      }
      break;
    case 'death_after_two_turns':
      if (attacker) {
        players[attackerPlayer] = updateFieldMonster(players[attackerPlayer], attackerUid, (fm) => ({ ...fm, pendingEffect: 'death', pendingTurns: 2 }));
        log.push(`¡${trap.name}! ${attacker.card.name} morirá en 2 turnos.`);
        negateAttack = true;
        skipCombat = true;
      }
      break;
    case 'damage_per_turn':
      log.push(`¡${trap.name}! (Efecto pasivo, no se activa en combate.)`);
      break;
  }

  return { state: { ...state, players, log: addLog(state, log.join(' ')) }, negateAttack, destroyAttacker, skipCombat };
}

// --- Magic resolution ---
function applyMagicEffect(state: GameState, card: MagicCard, targetUid?: string, side?: 'self' | 'enemy'): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  const me = state.currentPlayer;
  const opp = (me === 0 ? 1 : 0) as 0 | 1;
  const log: string[] = [];
  const eff = card.effect;

  switch (eff.kind) {
    case 'direct_attack': {
      // needs a monster to attack directly — handled via selection
      if (targetUid) {
        const attacker = findFieldMonster(players[me], targetUid);
        if (attacker) {
          const dmg = getEffectiveAtk(attacker);
          players[opp] = applyDamage(players[opp], dmg);
          players[me] = updateFieldMonster(players[me], targetUid, (fm) => ({ ...fm, hasAttacked: true }));
          log.push(`${card.name}: ${attacker.card.name} ataca directamente. ${dmg} PV al rival.`);
        }
      }
      break;
    }
    case 'steal_hand_card': {
      const oppHand = players[opp].hand;
      if (players[me].hand.length >= MAX_HAND_SIZE) {
        log.push(`${card.name}: Tu mano está llena (máximo ${MAX_HAND_SIZE} cartas).`);
      } else if (oppHand.length > 0) {
        const idx = Math.floor(Math.random() * oppHand.length);
        const stolen = oppHand[idx];
        players[opp] = { ...players[opp], hand: oppHand.filter((_, i) => i !== idx) };
        players[me] = { ...players[me], hand: [...players[me].hand, stolen] };
        log.push(`${card.name}: Robas una carta de la mano del rival.`);
      } else {
        log.push(`${card.name}: El rival no tiene cartas en mano.`);
      }
      break;
    }
    case 'hand_swap': {
      for (let i = 0; i < 2; i++) {
        const p = players[i];
        const graveyard = [...p.graveyard, ...p.hand];
        players[i] = { ...p, hand: [], graveyard };
        players[i] = drawCards(players[i], 5);
      }
      log.push(`${card.name}: Todos se descartan y roban 5 cartas.`);
      break;
    }
    case 'atk_boost': {
      if (targetUid) {
        const targetSide = side === 'self' ? me : opp;
        players[targetSide] = updateFieldMonster(players[targetSide], targetUid, (fm) => ({
          ...fm,
          magic: card,
          tempAtkModifier: fm.tempAtkModifier + eff.amount,
        }));
        log.push(`${card.name}: +${eff.amount} ATQ colocada.`);
      }
      break;
    }
    case 'revive_monster': {
      const monsters = players[me].graveyard.filter((c) => c.type === 'monster') as MonsterCard[];
      if (monsters.length > 0 && hasEmptySlot(players[me])) {
        // revive the strongest
        const sorted = [...monsters].sort((a, b) => b.atk - a.atk);
        const revived = sorted[0];
        const slot = getFirstEmptySlot(players[me]);
        const fm: FieldMonster = {
          uid: genUid(),
          card: revived,
          position: 'attack',
          faceDown: false,
          trap: null,
          magic: null,
          hasAttacked: true,
          hasChangedPosition: false,
          pendingTurns: 0,
          pendingEffect: null,
          controlledBy: null,
          tempAtkModifier: 0,
          tempDefModifier: 0,
          diceProtection: false,
        };
        players[me] = {
          ...players[me],
          graveyard: players[me].graveyard.filter((c) => c.id !== revived.id),
          field: players[me].field.map((f, i) => (i === slot ? fm : f)) as (FieldMonster | null)[],
        };
        log.push(`${card.name}: ${revived.name} revivido del cementerio.`);
      } else {
        log.push(`${card.name}: No hay Monstruos en el cementerio o campo lleno.`);
      }
      break;
    }
    case 'destroy_all_field': {
      for (let i = 0; i < 2; i++) {
        const count = players[i].field.filter(Boolean).length;
        const allFms = players[i].field.filter(Boolean) as FieldMonster[];
        allFms.forEach((f) => { players[i] = removeFieldMonster(players[i], f.uid); });
        log.push(`${card.name}: ${count} cartas destruidas del Jugador ${i + 1}.`);
      }
      break;
    }
    case 'switch_all_opp_position': {
      players[opp] = {
        ...players[opp],
        field: players[opp].field.map((f) =>
          f ? { ...f, position: f.position === 'attack' ? 'defense' as Position : 'attack' as Position, faceDown: f.position === 'attack' } : f,
        ),
      };
      log.push(`${card.name}: Todos los Monstruos del rival cambian de posición.`);
      break;
    }
    case 'def_reduce': {
      if (targetUid) {
        const targetSide = side === 'self' ? me : opp;
        players[targetSide] = updateFieldMonster(players[targetSide], targetUid, (fm) => ({
          ...fm,
          magic: card,
          tempDefModifier: fm.tempDefModifier - eff.amount,
        }));
        log.push(`${card.name}: -${eff.amount} DEF colocada.`);
      }
      break;
    }
    case 'dice_protection': {
      if (targetUid) {
        const targetSide = side === 'self' ? me : opp;
        players[targetSide] = updateFieldMonster(players[targetSide], targetUid, (fm) => ({
          ...fm,
          magic: card,
          diceProtection: true,
        }));
        log.push(`${card.name}: Protección por dado colocada.`);
      }
      break;
    }
    case 'draw_cards': {
      players[me] = drawCards(players[me], eff.amount);
      log.push(`${card.name}: Robas ${eff.amount} cartas.`);
      break;
    }
    case 'dice_damage': {
      return { ...state, phase: 'dice-roll', pendingDice: { reason: card.name, onRoll: (roll: number) => ({ type: 'ROLL_DICE', roll }) }, diceResult: null, selection: { kind: 'none' } };
    }
    case 'clean_opp_field': {
      const allFms = players[opp].field.filter(Boolean) as FieldMonster[];
      allFms.forEach((f) => { players[opp] = removeFieldMonster(players[opp], f.uid); });
      log.push(`${card.name}: Campo del rival limpiado.`);
      break;
    }
  }

  // Only consume card from hand if it's an instant magic (not field-placed)
  if (card.placement === 'instant') {
    players[me] = playCardFromHand(players[me], card.id);
  } else if (targetUid) {
    players[me] = playCardFromHand(players[me], card.id);
  }

  const winner = checkWinner(players);
  return { ...state, players, log: addLog(state, log.join(' ')), winner, selection: { kind: 'none' } };
}

// --- Turn start/end effects ---
function applyTurnStartEffects(state: GameState, playerIdx: 0 | 1): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  const log: string[] = [];
  const p = players[playerIdx];

  for (const fm of p.field) {
    if (!fm) continue;
    // Trap 1: +5 PV per turn
    if (fm.trap?.effect.kind === 'heal_per_turn') {
      players[playerIdx] = applyHeal(players[playerIdx], (fm.trap.effect as { amount: number }).amount);
      log.push(`${fm.trap.name}: +${(fm.trap.effect as { amount: number }).amount} PV.`);
    }
    // Trap 12: -5 PV to opponent per turn
    if (fm.trap?.effect.kind === 'damage_per_turn') {
      const oppIdx = (playerIdx === 0 ? 1 : 0) as 0 | 1;
      players[oppIdx] = applyDamage(players[oppIdx], (fm.trap.effect as { amount: number }).amount);
      log.push(`${fm.trap.name}: Rival pierde ${(fm.trap.effect as { amount: number }).amount} PV.`);
    }
    // Pending effects countdown
    if (fm.pendingEffect && fm.pendingTurns > 0) {
      const newTurns = fm.pendingTurns - 1;
      if (newTurns === 0) {
        if (fm.pendingEffect === 'death' || fm.pendingEffect === 'three_turns') {
          players[playerIdx] = removeFieldMonster(players[playerIdx], fm.uid);
          log.push(`${fm.card.name} muere por efecto pendiente.`);
        } else if (fm.pendingEffect === 'control') {
          players[playerIdx] = updateFieldMonster(players[playerIdx], fm.uid, (f) => ({ ...f, pendingEffect: null, pendingTurns: 0, controlledBy: null }));
          log.push(`${fm.card.name} recupera el control.`);
        }
      } else {
        players[playerIdx] = updateFieldMonster(players[playerIdx], fm.uid, (f) => ({ ...f, pendingTurns: newTurns }));
      }
    }
  }

  return { ...state, players, log: log.length > 0 ? addLog(state, log.join(' ')) : state.log };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const mode = action.mode ?? 'local';
      const difficulty = action.difficulty ?? 'normal';
      const deck = shuffleDeck(buildDeck());
      let p1 = createPlayer(0, 'Jugador 1', deck);
      p1 = drawCards(p1, 7);
      const deck2 = shuffleDeck(buildDeck());
      let p2 = createPlayer(1, mode === 'cpu' ? 'CPU' : 'Jugador 2', deck2);
      p2 = drawCards(p2, 7);
      return {
        ...initialState(),
        mode,
        difficulty,
        phase: mode === 'cpu' ? 'playing' : 'pass',
        passTarget: 0,
        players: [p1, p2],
        currentPlayer: 0,
        log: ['¡La partida comienza!'],
      };
    }
    case 'CONFIRM_START': {
      return { ...state, phase: 'playing', passTarget: 0 };
    }
    case 'CONFIRM_PASS': {
      return { ...state, phase: 'playing' };
    }
    case 'SUMMON_MONSTER': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      if (state.players[cp].cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return state;
      if (!hasCardInHand(state.players[cp], action.card.id)) return state;
      if (!hasEmptySlot(state.players[cp])) return state;
      const slot = getFirstEmptySlot(state.players[cp]);
      const fm: FieldMonster = {
        uid: genUid(),
        card: action.card,
        position: action.position,
        faceDown: action.position === 'defense',
        trap: null,
        magic: null,
        hasAttacked: false,
        hasChangedPosition: false,
        pendingTurns: 0,
        pendingEffect: null,
        controlledBy: null,
        tempAtkModifier: 0,
        tempDefModifier: 0,
        diceProtection: false,
      };
      const players = [...state.players] as [PlayerState, PlayerState];
      players[cp] = {
        ...players[cp],
        field: players[cp].field.map((f, i) => (i === slot ? fm : f)) as (FieldMonster | null)[],
        hand: players[cp].hand.filter((c) => c.id !== action.card.id),
        cardsPlayedThisTurn: players[cp].cardsPlayedThisTurn + 1,
      };
      const posText = action.position === 'attack' ? 'Ataque' : 'Defensa (boca abajo)';
      return { ...state, players, selection: { kind: 'none' }, log: addLog(state, `${players[cp].name} invoca ${action.card.name} en ${posText}.`) };
    }
    case 'SELECT_TRAP_PLACE': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      if (state.players[cp].cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return state;
      if (!hasCardInHand(state.players[cp], action.card.id)) return state;
      return { ...state, selection: { kind: 'place-trap', card: action.card } };
    }
    case 'PLACE_TRAP_ON_MONSTER': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      const fm = findFieldMonster(state.players[cp], action.fieldUid);
      if (!hasCardInHand(state.players[cp], action.card.id) || !fm || fm.trap) return state;
      const players = [...state.players] as [PlayerState, PlayerState];
      players[cp] = updateFieldMonster(players[cp], action.fieldUid, (f) => ({ ...f, trap: action.card }));
      players[cp] = playCardFromHand(players[cp], action.card.id);
      return { ...state, players, selection: { kind: 'none' }, log: addLog(state, `${players[cp].name} coloca ${action.card.name} bajo ${fm.card.name}.`) };
    }
    case 'SELECT_MAGIC': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      if (state.players[cp].cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) return state;
      if (!hasCardInHand(state.players[cp], action.card.id)) return state;
      const eff = action.card.effect;
      // Instant magics that need no target
      if (eff.kind === 'steal_hand_card' || eff.kind === 'hand_swap' || eff.kind === 'revive_monster' ||
          eff.kind === 'destroy_all_field' || eff.kind === 'switch_all_opp_position' ||
          eff.kind === 'draw_cards' || eff.kind === 'clean_opp_field') {
        return applyMagicEffect(state, action.card);
      }
      // Dice damage needs a roll
      if (eff.kind === 'dice_damage') {
        return applyMagicEffect(state, action.card);
      }
      // Direct attack: auto-use strongest available attacker, no monster selection needed
      if (eff.kind === 'direct_attack') {
        const myField = state.players[cp].field.filter(Boolean) as FieldMonster[];
        const available = myField
          .filter((f) => f.position === 'attack' && !f.hasAttacked)
          .sort((a, b) => getEffectiveAtk(b) - getEffectiveAtk(a));
        if (available.length === 0) {
          return { ...state, log: addLog(state, `${action.card.name}: No tienes Monstruos en ataque disponibles.`) };
        }
        return applyMagicEffect(state, action.card, available[0].uid);
      }
      // Field-placed magics need target
      if (eff.kind === 'atk_boost' || eff.kind === 'def_reduce' || eff.kind === 'dice_protection') {
        return { ...state, selection: { kind: 'place-magic', card: action.card } };
      }
      return state;
    }
    case 'PLACE_MAGIC_ON_MONSTER': {
      return applyMagicEffect(state, action.card, action.fieldUid, action.side);
    }
    case 'MAGIC_TARGET_MONSTER': {
      return applyMagicEffect(state, action.card, action.fieldUid, action.side);
    }
    case 'MAGIC_INSTANT': {
      return applyMagicEffect(state, action.card);
    }
    case 'START_ATTACK': {
      if (state.phase !== 'playing') return state;
      if (!canAttack(state)) return state;
      const cp = state.currentPlayer;
      const attacker = findFieldMonster(state.players[cp], action.attackerUid);
      if (!attacker || attacker.position !== 'attack' || attacker.hasAttacked) return state;
      const opp = (cp === 0 ? 1 : 0) as 0 | 1;
      const hasOppMonsters = state.players[opp].field.some((f) => f !== null);
      if (!hasOppMonsters) {
        // direct attack
        return executeDirectAttack(state, action.attackerUid);
      }
      return { ...state, selection: { kind: 'attack', attackerUid: action.attackerUid } };
    }
    case 'DECLARE_ATTACK': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      const opp = (cp === 0 ? 1 : 0) as 0 | 1;
      const attacker = findFieldMonster(state.players[cp], action.attackerUid);
      const defender = findFieldMonster(state.players[opp], action.defenderUid);
      if (!attacker || !defender) return state;

      if (defender.trap) {
        return {
          ...state,
          phase: 'trap-response',
          pendingTrap: {
            attackerUid: action.attackerUid,
            defenderUid: action.defenderUid,
            trap: defender.trap,
            defenderPlayer: opp,
            attackerPlayer: cp,
            attackerCard: attacker.card,
            defenderCard: defender.card,
            defenderPosition: defender.position,
          },
        };
      }
      return executeCombat(state, action.attackerUid, action.defenderUid);
    }
    case 'DIRECT_ATTACK': {
      return executeDirectAttack(state, action.attackerUid);
    }
    case 'RESOLVE_TRAP': {
      if (state.phase !== 'trap-response' || !state.pendingTrap) return state;
      const pt = state.pendingTrap;
      if (action.activate) {
        const result = applyTrapEffect(state, pt.trap, pt.attackerPlayer, pt.defenderPlayer, pt.attackerUid, pt.defenderUid);
        let newState = result.state;
        // Remove the trap from the defender
        if (newState.phase !== 'dice-roll') {
          const players = [...newState.players] as [PlayerState, PlayerState];
          if (findFieldMonster(players[pt.defenderPlayer], pt.defenderUid)) {
            players[pt.defenderPlayer] = updateFieldMonster(players[pt.defenderPlayer], pt.defenderUid, (fm) => ({ ...fm, trap: null }));
            newState = { ...newState, players };
          }
        }
        if (result.negateAttack) {
          if (!result.destroyAttacker && newState.phase !== 'dice-roll') {
            const players = [...newState.players] as [PlayerState, PlayerState];
            if (findFieldMonster(players[pt.attackerPlayer], pt.attackerUid)) {
              players[pt.attackerPlayer] = updateFieldMonster(players[pt.attackerPlayer], pt.attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
              newState = { ...newState, players };
            }
          }
          newState = { ...newState, phase: 'playing', pendingTrap: null, selection: { kind: 'none' } };
          const winner = checkWinner(newState.players);
          if (winner !== null) return { ...newState, phase: 'game-over', winner };
          return newState;
        }
        if (newState.phase === 'dice-roll') return newState;
        return executeCombat({ ...newState, phase: 'playing', pendingTrap: null, selection: { kind: 'none' } }, pt.attackerUid, pt.defenderUid);
      } else {
        // Don't activate — remove trap and proceed with combat
        const players = [...state.players] as [PlayerState, PlayerState];
        players[pt.defenderPlayer] = updateFieldMonster(players[pt.defenderPlayer], pt.defenderUid, (fm) => ({ ...fm, trap: null }));
        return executeCombat({ ...state, players, phase: 'playing', pendingTrap: null, selection: { kind: 'none' } }, pt.attackerUid, pt.defenderUid);
      }
    }
    case 'CHANGE_POSITION': {
      if (state.phase !== 'playing') return state;
      const cp = state.currentPlayer;
      const fm = findFieldMonster(state.players[cp], action.fieldUid);
      if (!fm || fm.hasChangedPosition) return state;
      const players = [...state.players] as [PlayerState, PlayerState];
      players[cp] = updateFieldMonster(players[cp], action.fieldUid, (f) => ({
        ...f,
        position: f.position === 'attack' ? 'defense' : 'attack',
        faceDown: f.position === 'attack',
        hasChangedPosition: true,
      }));
      return { ...state, players, log: addLog(state, `${fm.card.name} cambia a ${fm.position === 'attack' ? 'Defensa' : 'Ataque'}.`) };
    }
    case 'END_TURN': {
      if (state.phase !== 'playing') return state;
      const nextPlayer = (state.currentPlayer === 0 ? 1 : 0) as 0 | 1;
      // Reset current player's field
      const players = [...state.players] as [PlayerState, PlayerState];
      players[state.currentPlayer] = {
        ...players[state.currentPlayer],
        field: players[state.currentPlayer].field.map((f) =>
          f ? { ...f, hasAttacked: false, hasChangedPosition: false } : f,
        ),
      };
      // Draw 2 for next player
      players[nextPlayer] = drawCards(players[nextPlayer], 2);
      players[nextPlayer] = { ...players[nextPlayer], cardsPlayedThisTurn: 0 };
      const newTurn = state.turnCount + 1;
      let newState: GameState = {
        ...state,
        players,
        currentPlayer: nextPlayer,
        turnCount: newTurn,
        selection: { kind: 'none' },
        passTarget: nextPlayer,
        phase: state.mode === 'cpu' ? 'playing' : 'pass',
        log: addLog(state, `Turno de ${players[nextPlayer].name}.`),
      };
      // Apply turn start passive effects
      newState = applyTurnStartEffects(newState, nextPlayer);
      const winner = checkWinner(newState.players);
      if (winner !== null) return { ...newState, phase: 'game-over', winner };
      return newState;
    }
    case 'ROLL_DICE': {
      if (state.phase !== 'dice-roll' || !state.pendingDice) return state;
      const roll = action.roll;
      const reason = state.pendingDice.reason;
      const players = [...state.players] as [PlayerState, PlayerState];
      const log: string[] = [`🎲 Dado: ${roll} (${reason})`];

      // Handle trap 3 (dice_count_field) or trap 6 (dice_4plus_destroy) or magic 11 (dice_damage)
      if (reason.includes('conteo') || reason.includes('Dado y conteo')) {
        // Trap 3: count from the trap's monster
        const pt = state.pendingTrap;
        if (pt) {
          // Build a list of all field monsters in order: defender's field then attacker's field
          const allMonsters: { fm: FieldMonster; player: 0 | 1 }[] = [];
          for (const f of players[pt.defenderPlayer].field) if (f) allMonsters.push({ fm: f, player: pt.defenderPlayer });
          for (const f of players[pt.attackerPlayer].field) if (f) allMonsters.push({ fm: f, player: pt.attackerPlayer });
          if (allMonsters.length > 0) {
            // Find the trap monster as starting point
            const startIdx = allMonsters.findIndex((m) => m.fm.uid === pt.defenderUid);
            const targetIdx = ((startIdx >= 0 ? startIdx : 0) + roll - 1) % allMonsters.length;
            const target = allMonsters[targetIdx];
            players[target.player] = removeFieldMonster(players[target.player], target.fm.uid);
            log.push(`${target.fm.card.name} destruido por conteo.`);
          }
          // Remove trap
          if (findFieldMonster(players[pt.defenderPlayer], pt.defenderUid)) {
            players[pt.defenderPlayer] = updateFieldMonster(players[pt.defenderPlayer], pt.defenderUid, (fm) => ({ ...fm, trap: null }));
          }
          // Mark attacker as having attacked
          if (findFieldMonster(players[pt.attackerPlayer], pt.attackerUid)) {
            players[pt.attackerPlayer] = updateFieldMonster(players[pt.attackerPlayer], pt.attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
          }
        }
      } else if (reason.includes('4+') || reason.includes('Dado 4')) {
        const pt = state.pendingTrap;
        if (pt) {
          if (roll >= 4) {
            players[pt.attackerPlayer] = removeFieldMonster(players[pt.attackerPlayer], pt.attackerUid);
            log.push(`¡${roll} ≥ 4! Atacante destruido.`);
          } else {
            log.push(`${roll} < 4. Sin efecto.`);
            if (findFieldMonster(players[pt.attackerPlayer], pt.attackerUid)) {
              players[pt.attackerPlayer] = updateFieldMonster(players[pt.attackerPlayer], pt.attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
            }
          }
          if (findFieldMonster(players[pt.defenderPlayer], pt.defenderUid)) {
            players[pt.defenderPlayer] = updateFieldMonster(players[pt.defenderPlayer], pt.defenderUid, (fm) => ({ ...fm, trap: null }));
          }
        }
      } else if (reason.includes('dado') || reason.includes('Daño por dado')) {
        // Magic 11: dice damage
        const cp = state.currentPlayer;
        const opp = (cp === 0 ? 1 : 0) as 0 | 1;
        players[opp] = applyDamage(players[opp], roll);
        log.push(`${roll} PV de daño al rival.`);
        // consume the magic card
        const me = state.currentPlayer;
        const magicCard = state.players[me].hand.find((c) => c.type === 'magic' && c.name.includes('dado'));
        if (magicCard) players[me] = playCardFromHand(players[me], magicCard.id);
      }

      const winner = checkWinner(players);
      return {
        ...state,
        players,
        phase: winner !== null ? 'game-over' : 'playing',
        pendingTrap: null,
        pendingDice: null,
        diceResult: roll,
        selection: { kind: 'none' },
        log: addLog(state, log.join(' ')),
        winner,
      };
    }
    case 'CANCEL_SELECTION': {
      return { ...state, selection: { kind: 'none' } };
    }
    case 'RESTART': {
      return initialState();
    }
    default:
      return state;
  }
}

function executeDirectAttack(state: GameState, attackerUid: string): GameState {
  const cp = state.currentPlayer;
  const opp = (cp === 0 ? 1 : 0) as 0 | 1;
  const players = [...state.players] as [PlayerState, PlayerState];
  const attacker = findFieldMonster(players[cp], attackerUid);
  if (!attacker) return state;
  const dmg = getEffectiveAtk(attacker);
  players[opp] = applyDamage(players[opp], dmg);
  players[cp] = updateFieldMonster(players[cp], attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
  const winner = checkWinner(players);
  return {
    ...state,
    players,
    phase: winner !== null ? 'game-over' : 'playing',
    selection: { kind: 'none' },
    log: addLog(state, `${attacker.card.name} ataca directamente. ${dmg} PV al rival.`),
    winner,
  };
}

function executeCombat(state: GameState, attackerUid: string, defenderUid: string): GameState {
  const cp = state.currentPlayer;
  const opp = (cp === 0 ? 1 : 0) as 0 | 1;
  const players = [...state.players] as [PlayerState, PlayerState];
  const attacker = findFieldMonster(players[cp], attackerUid);
  const defender = findFieldMonster(players[opp], defenderUid);
  if (!attacker || !defender) return state;

  if (defender.faceDown) {
    players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, faceDown: false }));
  }

  const result: CombatResult = resolveCombat(attacker, defender);
  const hasReflect = defender.trap?.effect.kind === 'reflect_damage';

  if (result.attackerDestroyed) {
    // Check dice protection
    if (attacker.diceProtection) {
      const roll = rollDie();
      if (roll < 4) {
        players[cp] = removeFieldMonster(players[cp], attackerUid);
        players[cp] = applyDamage(players[cp], result.attackerDamage);
        if (defender.trap) players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, trap: null }));
      } else {
        players[cp] = updateFieldMonster(players[cp], attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
        if (defender.trap) players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, trap: null }));
      }
    } else {
      players[cp] = removeFieldMonster(players[cp], attackerUid);
      if (hasReflect) {
        players[opp] = applyDamage(players[opp], result.attackerDamage);
      } else {
        players[cp] = applyDamage(players[cp], result.attackerDamage);
      }
      if (defender.trap) players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, trap: null }));
    }
  } else {
    players[cp] = updateFieldMonster(players[cp], attackerUid, (fm) => ({ ...fm, hasAttacked: true }));
    if (result.attackerDamage > 0) {
      if (hasReflect) {
        players[opp] = applyDamage(players[opp], result.attackerDamage);
      } else {
        players[cp] = applyDamage(players[cp], result.attackerDamage);
      }
    }
    if (defender.trap) players[opp] = updateFieldMonster(players[opp], defenderUid, (fm) => ({ ...fm, trap: null }));
  }

  if (result.defenderDestroyed) {
    if (defender.diceProtection) {
      const roll = rollDie();
      if (roll < 4) {
        players[opp] = removeFieldMonster(players[opp], defenderUid);
        players[opp] = applyDamage(players[opp], result.defenderDamage);
      }
    } else {
      players[opp] = removeFieldMonster(players[opp], defenderUid);
      players[opp] = applyDamage(players[opp], result.defenderDamage);
    }
  }

  const winner = checkWinner(players);
  return {
    ...state,
    players,
    phase: winner !== null ? 'game-over' : 'playing',
    selection: { kind: 'none' },
    lastCombat: result,
    log: addLog(state, result.log),
    winner,
  };
}

export function useGame() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  useEffect(() => {
    if (state.mode !== 'cpu' || state.currentPlayer !== 1) return;
    if (state.phase !== 'playing' && state.phase !== 'pass') return;

    const timer = window.setTimeout(() => {
      if (state.phase === 'pass') {
        dispatch({ type: 'CONFIRM_PASS' });
        return;
      }
      dispatch(nextCpuAction(state));
    }, cpuDelay(state.difficulty));

    return () => window.clearTimeout(timer);
  }, [state]);

  return { state, dispatch };
}
