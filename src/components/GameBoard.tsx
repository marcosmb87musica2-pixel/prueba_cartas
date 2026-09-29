import { useState } from 'react';
import {
  Swords,
  Shield,
  Play,
  X,
  Eye,
  ChevronRight,
  Zap,
  AlertTriangle,
  Dices,
  RotateCw,
  LogOut,
} from 'lucide-react';
import type { Card, MonsterCard, TrapCard, MagicCard } from '@/game/cardData';
import type { Action, GameState, FieldMonster, PlayerState } from '@/game/types';
import { canAttack, MAX_HAND_SIZE } from '@/game/types';
import { CardView, CardBack } from './CardView';

interface GameBoardProps {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  onExit: () => void;
}

function LPBar({ player, isCurrent }: { player: PlayerState; isCurrent: boolean }) {
  const pct = Math.max(0, Math.min(100, player.lp));
  return (
    <div className={`flex items-center gap-2 ${isCurrent ? 'opacity-100' : 'opacity-60'}`}>
      <span className={`text-xs font-display font-bold ${isCurrent ? 'text-gold-300' : 'text-ink-300'}`}>
        {player.name}
      </span>
      <div className="flex-1 h-3 rounded-full bg-ink-700 overflow-hidden border border-ink-500">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct > 50 ? 'bg-emerald-500' : pct > 25 ? 'bg-gold-400' : 'bg-crimson-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-bold text-white tabular-nums w-8 text-right">{player.lp}</span>
    </div>
  );
}

function FieldSlot({
  fm,
  isOpponent,
  onClick,
  selectable,
  showTrap,
  showMagic,
}: {
  fm: FieldMonster | null;
  isOpponent: boolean;
  onClick?: () => void;
  selectable?: boolean;
  showTrap?: boolean;
  showMagic?: boolean;
}) {
  if (!fm) {
    return (
      <div
        className={`w-[52px] h-[78px] sm:w-16 sm:h-24 rounded-lg border-2 border-dashed flex items-center justify-center ${
          selectable ? 'border-gold-400/60 bg-gold-400/5 animate-pulse' : 'border-ink-500/40'
        }`}
        onClick={onClick}
      >
        {selectable && <span className="text-gold-400/40 text-xs">+</span>}
      </div>
    );
  }
  return (
    <div className={`relative ${fm.position === 'defense' ? 'rotate-90 scale-[0.8]' : ''} transition-transform`}>
      <CardView
        card={fm.card}
        size="sm"
        faceDown={isOpponent && fm.faceDown}
        isField
        fieldMonster={fm}
        showTrap={showTrap}
        showMagic={showMagic}
        onClick={onClick}
        className={selectable ? 'ring-2 ring-gold-300 animate-pulse' : ''}
      />
    </div>
  );
}

export function GameBoard({ state, dispatch, onExit }: GameBoardProps) {
  const [showLog, setShowLog] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [selectedHandCard, setSelectedHandCard] = useState<string | null>(null);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);

  const cp = state.currentPlayer;
  const isCpuTurn = state.mode === 'cpu' && cp === 1;
  const viewer = state.mode === 'cpu' ? 0 : cp;
  const me = state.players[viewer];
  const opp = state.players[viewer === 0 ? 1 : 0];
  const sel = state.selection;

  const canPlayMore = me.cardsPlayedThisTurn < 3;
  const attackAllowed = canAttack(state);

  const handleHandCardClick = (card: Card) => {
    setSelectedFieldUid(null);
    if (selectedHandCard === card.id) {
      setSelectedHandCard(null);
    } else {
      setSelectedHandCard(card.id);
    }
  };

  const handlePlayMonster = (card: MonsterCard, position: 'attack' | 'defense') => {
    if (!canPlayMore) return;
    if (!me.field.some((f) => f === null)) return;
    dispatch({ type: 'SUMMON_MONSTER', card, position });
    setSelectedHandCard(null);
  };

  const handlePlayTrap = (card: TrapCard) => {
    if (!canPlayMore) return;
    dispatch({ type: 'SELECT_TRAP_PLACE', card });
    setSelectedHandCard(null);
  };

  const handlePlayMagic = (card: MagicCard) => {
    if (!canPlayMore) return;
    dispatch({ type: 'SELECT_MAGIC', card });
    setSelectedHandCard(null);
  };

  const handleOpponentFieldClick = (uid: string) => {
    if (sel.kind === 'attack') {
      dispatch({ type: 'DECLARE_ATTACK', attackerUid: sel.attackerUid, defenderUid: uid });
    } else if (sel.kind === 'place-magic') {
      dispatch({ type: 'PLACE_MAGIC_ON_MONSTER', card: sel.card, side: 'enemy', fieldUid: uid });
    }
  };

  const handleMyFieldClick = (uid: string) => {
    if (sel.kind === 'place-trap') {
      dispatch({ type: 'PLACE_TRAP_ON_MONSTER', card: sel.card, fieldUid: uid });
    } else if (sel.kind === 'place-magic') {
      dispatch({ type: 'PLACE_MAGIC_ON_MONSTER', card: sel.card, side: 'self', fieldUid: uid });
    } else if (sel.kind === 'direct-attack') {
      dispatch({ type: 'DIRECT_ATTACK', attackerUid: uid });
    }
  };

  const selectedCard = selectedHandCard ? me.hand.find((c) => c.id === selectedHandCard) : null;
  const selectedField = selectedFieldUid ? me.field.find((f) => f?.uid === selectedFieldUid) : null;

  const isOpponentSlotSelectable = (): boolean => {
    if (sel.kind === 'attack') return true;
    if (sel.kind === 'place-magic') return true;
    return false;
  };

  const isMySlotSelectable = (): boolean => {
    if (sel.kind === 'place-trap') return true;
    if (sel.kind === 'place-magic') return true;
    if (sel.kind === 'direct-attack') return true;
    return false;
  };

  const trapPrompt = state.phase === 'trap-response' && state.pendingTrap;
  const dicePrompt = state.phase === 'dice-roll' && state.pendingDice;

  const selectionPromptText = (): string => {
    switch (sel.kind) {
      case 'attack': return 'Selecciona el monstruo enemigo a atacar';
      case 'place-trap': return 'Selecciona tu monstruo para colocar la trampa';
      case 'place-magic': return 'Coloca la magica en un monstruo (tuyo o rival)';
      case 'direct-attack': return 'Selecciona tu monstruo para atacar directamente';
      default: return '';
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-ink-900 flex flex-col w-full max-w-6xl mx-auto pt-[env(safe-area-inset-top)]">
      {/* Opponent info */}
      <div className="px-3 pt-2 pb-1 bg-ink-800/60">
        <LPBar player={opp} isCurrent={false} />
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-[10px] text-ink-400 truncate">
            Mazo {opp.deck.length} · Mano {opp.hand.length}/{MAX_HAND_SIZE} · Cem. {opp.graveyard.length}
          </span>
          <div className="flex items-center gap-2 flex-none">
            <span className="text-[10px] text-ink-400 whitespace-nowrap">T{state.turnCount + 1}</span>
            {confirmExit ? (
              <div className="flex items-center gap-1" role="group" aria-label="Confirmar finalizar partida">
                <span className="text-[10px] text-ink-300">¿Seguro?</span>
                <button
                  type="button"
                  onClick={onExit}
                  className="px-3 py-1.5 rounded text-xs font-bold bg-red-600 text-white hover:bg-red-500"
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmExit(false)}
                  className="px-3 py-1.5 rounded text-xs font-bold bg-ink-700 text-ink-200 hover:bg-ink-600"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmExit(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-bold whitespace-nowrap border border-red-500/60 text-red-400 hover:bg-red-500/10"
              >
                <LogOut className="w-3 h-3" aria-hidden="true" />
                Finalizar partida
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Opponent hand */}
      <div className="flex justify-center py-1.5 bg-ink-800/30 min-h-[2.75rem] sm:min-h-[3.5rem]" aria-label={`El rival tiene ${opp.hand.length} cartas en mano`}>
        <div className="flex -space-x-3">
          {Array.from({ length: opp.hand.length }).map((_, i) => (
            <CardBack key={i} size="xs" />
          ))}
        </div>
      </div>

      {/* Opponent field */}
      <div className="px-2 py-2 sm:px-3 bg-ink-800/20">
        <div className="grid grid-cols-6 gap-1 place-items-center">
          {opp.field.map((fm, i) => (
            <FieldSlot
              key={i}
              fm={fm}
              isOpponent
              onClick={fm ? () => handleOpponentFieldClick(fm.uid) : undefined}
              selectable={fm ? isOpponentSlotSelectable() : false}
              showTrap={false}
              showMagic={false}
            />
          ))}
        </div>
      </div>

      {/* Center status */}
      <div className="px-3 py-1 flex items-center justify-center min-h-[2rem]">
        {state.lastCombat && !trapPrompt && !dicePrompt && (
          <div className="text-center animate-fade-in">
            <span className="text-xs text-gold-200 text-shadow-strong">{state.lastCombat.log}</span>
          </div>
        )}
        {trapPrompt && (
          <div className="text-center animate-burst">
            <div className="flex items-center gap-1.5 justify-center text-crimson-300 font-display font-bold text-sm">
              <AlertTriangle size={16} /> ¡Trampa activada!
            </div>
          </div>
        )}
        {dicePrompt && (
          <div className="text-center animate-burst">
            <div className="flex items-center gap-1.5 justify-center text-gold-300 font-display font-bold text-sm">
              <Dices size={16} /> ¡Tira el dado!
            </div>
          </div>
        )}
      </div>

      {/* Player field */}
      <div className="px-2 py-2 sm:px-3 bg-ink-800/20 border-t border-ink-600/50">
        <div className="grid grid-cols-6 gap-1 place-items-center">
          {me.field.map((fm, i) => (
            <FieldSlot
              key={i}
              fm={fm}
              isOpponent={false}
              onClick={fm ? () => {
                if (sel.kind === 'place-trap' || sel.kind === 'place-magic' || sel.kind === 'direct-attack') {
                  handleMyFieldClick(fm.uid);
                } else if (sel.kind === 'attack') {
                  // ignore, already attacking
                } else {
                  setSelectedHandCard(null);
                  setSelectedFieldUid(selectedFieldUid === fm.uid ? null : fm.uid);
                }
              } : undefined}
              selectable={isMySlotSelectable()}
              showTrap={true}
              showMagic={true}
            />
          ))}
        </div>
      </div>

      {/* Trap response modal */}
      {trapPrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-ink-700 rounded-2xl border-2 border-crimson-500/50 p-5 max-w-xs w-full shadow-glow-crimson">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-crimson-400" />
              <h3 className="font-display font-bold text-crimson-300">Trampa del rival</h3>
            </div>
            <p className="text-sm text-white mb-1 font-semibold">{state.pendingTrap!.trap.name}</p>
            <p className="text-xs text-ink-300 mb-4">{state.pendingTrap!.trap.description}</p>
            <p className="text-xs text-ink-400 mb-4">
              Tu {state.pendingTrap!.attackerCard.name} ataca a {state.pendingTrap!.defenderCard.name}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => dispatch({ type: 'RESOLVE_TRAP', activate: true })}
                className="flex-1 py-3 rounded-lg bg-crimson-500 text-white font-display font-bold text-sm hover:bg-crimson-600 active:scale-95 transition-all"
              >
                Activar trampa
              </button>
              <button
                onClick={() => dispatch({ type: 'RESOLVE_TRAP', activate: false })}
                className="flex-1 py-3 rounded-lg bg-ink-500 text-ink-200 font-display font-bold text-sm hover:bg-ink-400 active:scale-95 transition-all"
              >
                No activar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dice roll modal */}
      {dicePrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-ink-700 rounded-2xl border-2 border-gold-500/50 p-6 max-w-xs w-full text-center shadow-glow">
            <Dices size={48} className="text-gold-400 mx-auto mb-3" />
            <h3 className="font-display font-bold text-gold-300 mb-1">Tira el dado</h3>
            <p className="text-xs text-ink-300 mb-4">{state.pendingDice!.reason}</p>
            {state.diceResult !== null ? (
              <div className="text-5xl font-display font-black text-gold-300 mb-4 animate-burst">
                {state.diceResult}
              </div>
            ) : (
              <button
                onClick={() => {
                  const roll = Math.floor(Math.random() * 6) + 1;
                  dispatch({ type: 'ROLL_DICE', roll });
                }}
                className="px-8 py-3 rounded-xl bg-gold-400 text-ink-900 font-display font-bold hover:bg-gold-300 shadow-glow active:scale-95 transition-all flex items-center gap-2 mx-auto"
              >
                <Dices size={20} /> Tirar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Selection prompt bar */}
      {sel.kind !== 'none' && !trapPrompt && !dicePrompt && (
        <div className="px-3 py-1.5 bg-gold-500/10 border-t border-gold-500/30 flex items-center justify-between">
          <span className="text-xs text-gold-200">{selectionPromptText()}</span>
          <button
            onClick={() => dispatch({ type: 'CANCEL_SELECTION' })}
            className="text-xs text-ink-300 hover:text-white flex items-center gap-1"
          >
            <X size={12} /> Cancelar
          </button>
        </div>
      )}

      {/* Player info */}
      <div className="px-3 py-1 bg-ink-800/60 border-t border-ink-600">
        <LPBar player={me} isCurrent={true} />
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-[10px] text-ink-400 truncate">
            Mazo {me.deck.length} ·{' '}
            <span className={me.hand.length >= MAX_HAND_SIZE ? 'text-crimson-400 font-semibold' : ''}>
              Mano {me.hand.length}/{MAX_HAND_SIZE}
            </span>{' '}
            · Cem. {me.graveyard.length}
          </span>
          <span className="text-[10px] text-gold-400 font-semibold whitespace-nowrap">
            Cartas: {me.cardsPlayedThisTurn}/3
          </span>
        </div>
      </div>

      {/* Hand */}
      <div className="bg-ink-800/40 py-2 sm:py-3 overflow-x-auto overscroll-x-contain touch-pan-x snap-x">
        <div className="flex gap-1.5 items-end w-max mx-auto px-3 py-1">
          {me.hand.length === 0 && (
            <span className="text-xs text-ink-400 py-8">No tienes cartas en mano</span>
          )}
          {me.hand.map((card) => (
            <div key={card.id} className="snap-center flex-none">
              <CardView
                card={card}
                size="md"
                onClick={() => handleHandCardClick(card)}
                selected={selectedHandCard === card.id}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Selected field monster action panel */}
      {selectedField && !selectedCard && (
        <div className="fixed bottom-0 left-0 right-0 max-w-6xl mx-auto bg-ink-700 border-t-2 border-azure-500/40 rounded-t-2xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-card-hover z-40 animate-slide-up">
          <div className="flex items-start gap-3 mb-2">
            <CardView card={selectedField.card} size="sm" fieldMonster={selectedField} isField />
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-sm text-white truncate">{selectedField.card.name}</h3>
              <p className="text-[10px] text-ink-300 mt-0.5">
                Monstruo · ATQ {selectedField.card.atk + selectedField.tempAtkModifier} / DEF {selectedField.card.def + selectedField.tempDefModifier}
              </p>
              <p className="text-[10px] text-ink-400 mt-0.5">
                Posicion: {selectedField.position === 'attack' ? 'Ataque' : 'Defensa'}
                {selectedField.hasChangedPosition && ' · Ya cambiada este turno'}
                {selectedField.hasAttacked && ' · Ya atacó'}
              </p>
              {selectedField.trap && (
                <p className="text-[10px] text-crimson-300 mt-0.5">Trampa: {selectedField.trap.name}</p>
              )}
              {selectedField.magic && (
                <p className="text-[10px] text-gold-300 mt-0.5">Magica: {selectedField.magic.name}</p>
              )}
            </div>
            <button onClick={() => setSelectedFieldUid(null)} className="text-ink-300 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-2">
            {selectedField.position === 'attack' && !selectedField.hasAttacked && attackAllowed && (
              <button
                onClick={() => {
                  dispatch({ type: 'START_ATTACK', attackerUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className="flex-1 py-3 rounded-lg bg-crimson-600 text-white font-display font-bold text-xs hover:bg-crimson-500 active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <Swords size={14} /> Atacar
              </button>
            )}
            {!selectedField.hasChangedPosition && (
              <button
                onClick={() => {
                  dispatch({ type: 'CHANGE_POSITION', fieldUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className="flex-1 py-3 rounded-lg bg-azure-600 text-white font-display font-bold text-xs hover:bg-azure-500 active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <RotateCw size={14} /> {selectedField.position === 'attack' ? 'A Defensa' : 'A Ataque'}
              </button>
            )}
            {selectedField.hasChangedPosition && (
              <p className="flex-1 text-[10px] text-ink-400 text-center py-2">Ya has cambiado la posicion de este monstruo este turno</p>
            )}
          </div>
        </div>
      )}

      {/* Selected card action panel */}
      {selectedCard && (
        <div className="fixed bottom-0 left-0 right-0 max-w-6xl mx-auto bg-ink-700 border-t-2 border-gold-500/40 rounded-t-2xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-card-hover z-40 animate-slide-up">
          <div className="flex items-start gap-3 mb-2">
            <CardView card={selectedCard} size="sm" />
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-sm text-white truncate">{selectedCard.name}</h3>
              <p className="text-[10px] text-ink-300 mt-0.5">
                {selectedCard.type === 'monster' && `Monstruo · ATQ ${selectedCard.atk} / DEF ${selectedCard.def}`}
                {selectedCard.type === 'trap' && `Trampa · ${selectedCard.description}`}
                {selectedCard.type === 'magic' && `Magica · ${selectedCard.description}`}
              </p>
            </div>
            <button onClick={() => setSelectedHandCard(null)} className="text-ink-300 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-2">
            {selectedCard.type === 'monster' && (
              <>
                <button
                  onClick={() => handlePlayMonster(selectedCard, 'attack')}
                  disabled={!canPlayMore || !me.field.some((f) => f === null)}
                  className="flex-1 py-3 rounded-lg bg-crimson-600 text-white font-display font-bold text-xs hover:bg-crimson-500 active:scale-95 transition-all flex items-center justify-center gap-1 disabled:opacity-40"
                >
                  <Swords size={14} /> Ataque
                </button>
                <button
                  onClick={() => handlePlayMonster(selectedCard, 'defense')}
                  disabled={!canPlayMore || !me.field.some((f) => f === null)}
                  className="flex-1 py-3 rounded-lg bg-azure-600 text-white font-display font-bold text-xs hover:bg-azure-500 active:scale-95 transition-all flex items-center justify-center gap-1 disabled:opacity-40"
                >
                  <Shield size={14} /> Defensa
                </button>
              </>
            )}
            {selectedCard.type === 'trap' && (
              <button
                onClick={() => handlePlayTrap(selectedCard)}
                disabled={!canPlayMore || !me.field.some((f) => f !== null && !f.trap)}
                className="flex-1 py-3 rounded-lg bg-crimson-500 text-white font-display font-bold text-xs hover:bg-crimson-600 active:scale-95 transition-all flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <Zap size={14} /> Colocar trampa
              </button>
            )}
            {selectedCard.type === 'magic' && (
              <button
                onClick={() => handlePlayMagic(selectedCard)}
                disabled={!canPlayMore}
                className="flex-1 py-3 rounded-lg bg-gold-500 text-ink-900 font-display font-bold text-xs hover:bg-gold-400 active:scale-95 transition-all flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <Play size={14} /> Usar magica
              </button>
            )}
          </div>
          {!canPlayMore && (
            <p className="text-[10px] text-crimson-400 text-center mt-1.5">Ya has jugado 3 cartas este turno</p>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-ink-800 border-t border-ink-600 flex items-center gap-2">
        <button
          onClick={() => setShowLog(true)}
          className="px-3 py-2.5 rounded-lg bg-ink-600 text-ink-200 text-xs font-semibold hover:bg-ink-500 active:scale-95 transition-all flex items-center gap-1"
        >
          <Eye size={14} /> Registro
        </button>
        <div className="flex-1 min-w-0 text-center">
          <span className="text-[11px] sm:text-xs text-ink-300 leading-tight">
            {attackAllowed ? 'Puedes atacar' : 'Sin ataque este turno'}
          </span>
        </div>
        <button
          onClick={() => {
            setSelectedHandCard(null);
            dispatch({ type: 'END_TURN' });
          }}
          className="px-4 py-2.5 whitespace-nowrap rounded-lg bg-gold-400 text-ink-900 font-display font-bold text-xs hover:bg-gold-300 shadow-glow active:scale-95 transition-all flex items-center gap-1"
        >
          Terminar turno
          <ChevronRight size={14} />
        </button>
      </div>

      {isCpuTurn && !trapPrompt && !dicePrompt && (
        <div className="fixed inset-0 z-40 flex items-end justify-center pb-24 bg-black/20" aria-live="polite">
          <div className="rounded-full border border-azure-400/40 bg-ink-800/90 px-4 py-2 text-xs font-display font-bold text-azure-300 shadow-glow animate-pulse">
            Turno de la CPU...
          </div>
        </div>
      )}

      {/* Log modal */}
      {showLog && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 animate-fade-in" onClick={() => setShowLog(false)}>
          <div className="bg-ink-700 rounded-t-2xl border-t-2 border-gold-500/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-w-6xl w-full max-h-[70dvh] overscroll-contain overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-gold-300">Registro de juego</h3>
              <button onClick={() => setShowLog(false)} className="text-ink-300 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-1">
              {state.log.slice().reverse().map((entry, i) => (
                <div key={i} className="text-xs text-ink-200 py-1 border-b border-ink-600/50">{entry}</div>
              ))}
              {state.log.length === 0 && <p className="text-xs text-ink-400">Sin eventos todavía</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
