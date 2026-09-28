import type { Action, Difficulty, FieldMonster, GameState } from './types';
import { canAttack, getEffectiveAtk, getEffectiveDef } from './types';

export function nextCpuAction(state: GameState): Action {
  const cpu = state.players[1];
  const human = state.players[0];

  if (cpu.cardsPlayedThisTurn === 0 && cpu.field.some((slot) => slot === null)) {
    const monsters = cpu.hand.filter((card) => card.type === 'monster');
    if (monsters.length > 0) {
      const monster = state.difficulty === 'easy'
        ? monsters[0]
        : [...monsters].sort((a, b) => b.atk - a.atk)[0];
      const position = state.difficulty === 'easy' || monster.atk >= monster.def ? 'attack' : 'defense';
      return { type: 'SUMMON_MONSTER', card: monster, position };
    }
  }

  if (state.difficulty !== 'easy' && canAttack(state)) {
    const attackers = cpu.field.filter(
      (slot): slot is FieldMonster => !!slot && slot.position === 'attack' && !slot.hasAttacked,
    );
    const targets = human.field.filter((slot): slot is FieldMonster => !!slot);

    for (const attacker of attackers) {
      if (targets.length === 0) {
        return { type: 'DIRECT_ATTACK', attackerUid: attacker.uid };
      }
      const atk = getEffectiveAtk(attacker);
      const beatable = targets.find((t) =>
        t.position === 'attack' ? getEffectiveAtk(t) < atk : getEffectiveDef(t) < atk,
      );
      const target = beatable ?? (state.difficulty === 'normal' ? targets[0] : null);
      if (target) {
        return { type: 'DECLARE_ATTACK', attackerUid: attacker.uid, defenderUid: target.uid };
      }
    }
  }

  return { type: 'END_TURN' };
}

export function cpuDelay(difficulty: Difficulty): number {
  return difficulty === 'easy' ? 450 : difficulty === 'hard' ? 850 : 650;
}
