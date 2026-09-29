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
      <span className="font-display font-bold whitespace-nowrap" style={{ fontSize: 'var(--ui-text-sm)' }}>
        <span className={isCurrent ? 'text-gold-300' : 'text-ink-300'}>{player.name}</span>
      </span>
      <div className="flex-1 rounded-full bg-ink-700 overflow-hidden border border-ink-500" style={{ height: 'var(--lp-bar-h)' }}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct > 50 ? 'bg-emerald-500' : pct > 25 ? 'bg-gold-400' : 'bg-crimson-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-bold text-white tabular-nums text-right" style={{ fontSize: 'var(--ui-text-sm)', minWidth: '2.5em' }}>{player.lp}</span>
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
        className="rounded-lg border-2 border-dashed flex items-center justify-center"
        style={{ width: 'var(--card-field-w)', height: 'var(--card-field-h)' }}
        onClick={onClick}
      >
        <span className={`text-gold-400/40 ${selectable ? 'border-gold-400/60 bg-gold-400/5 animate-pulse' : 'border-ink-500/40'}`} style={{ fontSize: 'var(--ui-text-sm)' }}>
          {selectable ? '+' : ''}
        </span>
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

  const uiXs = { fontSize: 'var(--ui-text-xs)' } as const;
  const uiSm = { fontSize: 'var(--ui-text-sm)' } as const;
  const uiBase = { fontSize: 'var(--ui-text-base)' } as const;

  return (
    <div
      className="bg-ink-900 flex flex-col w-full"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Opponent info */}
      <div className="px-2 sm:px-3 pt-1.5 pb-1 bg-ink-800/60 flex-none">
        <LPBar player={opp} isCurrent={false} />
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-ink-400 truncate" style={uiXs}>
            Mazo {opp.deck.length} · Mano {opp.hand.length}/{MAX_HAND_SIZE} · Cem. {opp.graveyard.length}
          </span>
          <div className="flex items-center gap-2 flex-none">
            <span className="text-ink-400 whitespace-nowrap" style={uiXs}>T{state.turnCount + 1}</span>
            {confirmExit ? (
              <div className="flex items-center gap-1" role="group" aria-label="Confirmar finalizar partida">
                <span className="text-ink-300" style={uiXs}>¿Seguro?</span>
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded font-bold bg-red-600 text-white hover:bg-red-500"
                  style={{ ...uiXs, padding: '0.3em 0.7em' }}
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmExit(false)}
                  className="rounded font-bold bg-ink-700 text-ink-200 hover:bg-ink-600"
                  style={{ ...uiXs, padding: '0.3em 0.7em' }}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmExit(true)}
                className="flex items-center gap-1 rounded font-bold whitespace-nowrap border border-red-500/60 text-red-400 hover:bg-red-500/10"
                style={{ ...uiXs, padding: '0.3em 0.6em' }}
              >
                <LogOut style={{ width: '1em', height: '1em' }} aria-hidden="true" />
                Finalizar partida
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Opponent hand */}
      <div className="flex justify-center py-1 bg-ink-800/30 flex-none" aria-label={`El rival tiene ${opp.hand.length} cartas en mano`}>
        <div className="flex" style={{ gap: 'calc(var(--card-back-w) * -0.3)' }}>
          {Array.from({ length: opp.hand.length }).map((_, i) => (
            <CardBack key={i} size="xs" />
          ))}
        </div>
      </div>

      {/* Opponent field */}
      <div className="px-1 sm:px-2 py-1 bg-ink-800/20 flex-none">
        <div className="grid grid-cols-6 place-items-center w-full" style={{ gap: 'var(--field-gap)' }}>
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
      <div className="px-3 py-1 flex items-center justify-center min-h-[2rem] flex-none">
        {state.lastCombat && !trapPrompt && !dicePrompt && (
          <div className="text-center animate-fade-in">
            <span className="text-gold-200 text-shadow-strong" style={uiSm}>{state.lastCombat.log}</span>
          </div>
        )}
        {trapPrompt && (
          <div className="text-center animate-burst">
            <div className="flex items-center gap-1.5 justify-center text-crimson-300 font-display font-bold" style={uiBase}>
              <AlertTriangle size={16} /> ¡Trampa activada!
            </div>
          </div>
        )}
        {dicePrompt && (
          <div className="text-center animate-burst">
            <div className="flex items-center gap-1.5 justify-center text-gold-300 font-display font-bold" style={uiBase}>
              <Dices size={16} /> ¡Tira el dado!
            </div>
          </div>
        )}
      </div>

      {/* Player field */}
      <div className="px-1 sm:px-2 py-1 bg-ink-800/20 border-t border-ink-600/50 flex-none">
        <div className="grid grid-cols-6 place-items-center w-full" style={{ gap: 'var(--field-gap)' }}>
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
              <h3 className="font-display font-bold text-crimson-300" style={uiBase}>Trampa del rival</h3>
            </div>
            <p className="text-white mb-1 font-semibold" style={uiSm}>{state.pendingTrap!.trap.name}</p>
            <p className="text-ink-300 mb-4" style={uiXs}>{state.pendingTrap!.trap.description}</p>
            <p className="text-ink-400 mb-4" style={uiXs}>
              Tu {state.pendingTrap!.attackerCard.name} ataca a {state.pendingTrap!.defenderCard.name}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => dispatch({ type: 'RESOLVE_TRAP', activate: true })}
                className="flex-1 rounded-lg bg-crimson-500 text-white font-display font-bold hover:bg-crimson-600 active:scale-95 transition-all"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                Activar trampa
              </button>
              <button
                onClick={() => dispatch({ type: 'RESOLVE_TRAP', activate: false })}
                className="flex-1 rounded-lg bg-ink-500 text-ink-200 font-display font-bold hover:bg-ink-400 active:scale-95 transition-all"
                style={{ ...uiSm, padding: '0.7em 0' }}
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
            <h3 className="font-display font-bold text-gold-300 mb-1" style={uiBase}>Tira el dado</h3>
            <p className="text-ink-300 mb-4" style={uiXs}>{state.pendingDice!.reason}</p>
            {state.diceResult !== null ? (
              <div className="font-display font-black text-gold-300 mb-4 animate-burst" style={{ fontSize: 'clamp(2rem, 8vw, 3rem)' }}>
                {state.diceResult}
              </div>
            ) : (
              <button
                onClick={() => {
                  const roll = Math.floor(Math.random() * 6) + 1;
                  dispatch({ type: 'ROLL_DICE', roll });
                }}
                className="rounded-xl bg-gold-400 text-ink-900 font-display font-bold hover:bg-gold-300 shadow-glow active:scale-95 transition-all flex items-center gap-2 mx-auto"
                style={{ ...uiSm, padding: '0.6em 1.5em' }}
              >
                <Dices size={20} /> Tirar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Selection prompt bar */}
      {sel.kind !== 'none' && !trapPrompt && !dicePrompt && (
        <div className="px-3 py-1.5 bg-gold-500/10 border-t border-gold-500/30 flex items-center justify-between flex-none">
          <span className="text-gold-200" style={uiXs}>{selectionPromptText()}</span>
          <button
            onClick={() => dispatch({ type: 'CANCEL_SELECTION' })}
            className="text-ink-300 hover:text-white flex items-center gap-1"
            style={uiXs}
          >
            <X size={12} /> Cancelar
          </button>
        </div>
      )}

      {/* Player info */}
      <div className="px-2 sm:px-3 py-1 bg-ink-800/60 border-t border-ink-600 flex-none">
        <LPBar player={me} isCurrent={true} />
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-ink-400 truncate" style={uiXs}>
            Mazo {me.deck.length} ·{' '}
            <span className={me.hand.length >= MAX_HAND_SIZE ? 'text-crimson-400 font-semibold' : ''}>
              Mano {me.hand.length}/{MAX_HAND_SIZE}
            </span>{' '}
            · Cem. {me.graveyard.length}
          </span>
          <span className="text-gold-400 font-semibold whitespace-nowrap" style={uiXs}>
            Cartas: {me.cardsPlayedThisTurn}/3
          </span>
        </div>
      </div>

      {/* Hand */}
      <div className="bg-ink-800/40 py-1 overflow-x-auto overscroll-x-contain touch-pan-x snap-x flex-1 min-h-0 flex items-center">
        <div className="flex items-end w-max mx-auto px-2 py-0.5" style={{ gap: 'var(--field-gap)' }}>
          {me.hand.length === 0 && (
            <span className="text-ink-400" style={uiSm}>No tienes cartas en mano</span>
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
        <div className="fixed bottom-0 left-0 right-0 bg-ink-700 border-t-2 border-azure-500/40 rounded-t-2xl p-3 shadow-card-hover z-40 animate-slide-up"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-start gap-3 mb-2">
            <CardView card={selectedField.card} size="lg" fieldMonster={selectedField} isField />
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-white" style={uiBase}>{selectedField.card.name}</h3>
              <p className="text-ink-300 mt-1" style={uiXs}>
                Monstruo · ATQ {selectedField.card.atk + selectedField.tempAtkModifier} / DEF {selectedField.card.def + selectedField.tempDefModifier}
              </p>
              <p className="text-ink-400 mt-0.5" style={uiXs}>
                Posicion: {selectedField.position === 'attack' ? 'Ataque' : 'Defensa'}
                {selectedField.hasChangedPosition && ' · Ya cambiada este turno'}
                {selectedField.hasAttacked && ' · Ya atacó'}
              </p>
              {selectedField.trap && (
                <p className="text-crimson-300 mt-0.5" style={uiXs}>Trampa: {selectedField.trap.name}</p>
              )}
              {selectedField.magic && (
                <p className="text-gold-300 mt-0.5" style={uiXs}>Magica: {selectedField.magic.name}</p>
              )}
            </div>
            <button onClick={() => setSelectedFieldUid(null)} className="text-ink-300 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <div className="flex gap-2">
            {selectedField.position === 'attack' && !selectedField.hasAttacked && attackAllowed && (
              <button
                onClick={() => {
                  dispatch({ type: 'START_ATTACK', attackerUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className="flex-1 rounded-lg bg-crimson-600 text-white font-display font-bold hover:bg-crimson-500 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <Swords size={16} /> Atacar
              </button>
            )}
            {!selectedField.hasChangedPosition && (
              <button
                onClick={() => {
                  dispatch({ type: 'CHANGE_POSITION', fieldUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className="flex-1 rounded-lg bg-azure-600 text-white font-display font-bold hover:bg-azure-500 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <RotateCw size={16} /> {selectedField.position === 'attack' ? 'A Defensa' : 'A Ataque'}
              </button>
            )}
            {selectedField.hasChangedPosition && (
              <p className="flex-1 text-ink-400 text-center" style={uiXs}>Ya has cambiado la posicion de este monstruo este turno</p>
            )}
          </div>
        </div>
      )}

      {/* Selected card action panel */}
      {selectedCard && (
        <div className="fixed bottom-0 left-0 right-0 bg-ink-700 border-t-2 border-gold-500/40 rounded-t-2xl p-3 shadow-card-hover z-40 animate-slide-up"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-start gap-3 mb-2">
            <CardView card={selectedCard} size="lg" />
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-white" style={uiBase}>{selectedCard.name}</h3>
              <p className="text-ink-300 mt-1" style={uiXs}>
                {selectedCard.type === 'monster' && `Monstruo · ATQ ${selectedCard.atk} / DEF ${selectedCard.def}`}
                {selectedCard.type === 'trap' && `Trampa · ${selectedCard.description}`}
                {selectedCard.type === 'magic' && `Magica · ${selectedCard.description}`}
              </p>
            </div>
            <button onClick={() => setSelectedHandCard(null)} className="text-ink-300 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <div className="flex gap-2">
            {selectedCard.type === 'monster' && (
              <>
                <button
                  onClick={() => handlePlayMonster(selectedCard, 'attack')}
                  disabled={!canPlayMore || !me.field.some((f) => f === null)}
                  className="flex-1 rounded-lg bg-crimson-600 text-white font-display font-bold hover:bg-crimson-500 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Swords size={16} /> Ataque
                </button>
                <button
                  onClick={() => handlePlayMonster(selectedCard, 'defense')}
                  disabled={!canPlayMore || !me.field.some((f) => f === null)}
                  className="flex-1 rounded-lg bg-azure-600 text-white font-display font-bold hover:bg-azure-500 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Shield size={16} /> Defensa
                </button>
              </>
            )}
            {selectedCard.type === 'trap' && (
              <button
                onClick={() => handlePlayTrap(selectedCard)}
                disabled={!canPlayMore || !me.field.some((f) => f !== null && !f.trap)}
                className="flex-1 rounded-lg bg-crimson-500 text-white font-display font-bold hover:bg-crimson-600 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <Zap size={16} /> Colocar trampa
              </button>
            )}
            {selectedCard.type === 'magic' && (
              <button
                onClick={() => handlePlayMagic(selectedCard)}
                disabled={!canPlayMore}
                className="flex-1 rounded-lg bg-gold-500 text-ink-900 font-display font-bold hover:bg-gold-400 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <Play size={16} /> Usar magica
              </button>
            )}
          </div>
          {!canPlayMore && (
            <p className="text-crimson-400 text-center mt-1.5" style={uiXs}>Ya has jugado 3 cartas este turno</p>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="px-2 sm:px-3 pt-1.5 pb-1 bg-ink-800 border-t border-ink-600 flex items-center gap-2 flex-none"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => setShowLog(true)}
          className="rounded-lg bg-ink-600 text-ink-200 font-semibold hover:bg-ink-500 active:scale-95 transition-all flex items-center gap-1"
          style={{ ...uiXs, padding: '0.5em 0.8em' }}
        >
          <Eye size={14} /> Registro
        </button>
        <div className="flex-1 min-w-0 text-center">
          <span className="text-ink-300 leading-tight" style={uiXs}>
            {attackAllowed ? 'Puedes atacar' : 'Sin ataque este turno'}
          </span>
        </div>
        <button
          onClick={() => {
            setSelectedHandCard(null);
            dispatch({ type: 'END_TURN' });
          }}
          className="whitespace-nowrap rounded-lg bg-gold-400 text-ink-900 font-display font-bold hover:bg-gold-300 shadow-glow active:scale-95 transition-all flex items-center gap-1"
          style={{ ...uiXs, padding: '0.5em 1em' }}
        >
          Terminar turno
          <ChevronRight size={14} />
        </button>
      </div>

      {isCpuTurn && !trapPrompt && !dicePrompt && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/20" aria-live="polite" style={{ paddingBottom: '15vh' }}>
          <div className="rounded-full border border-azure-400/40 bg-ink-800/90 px-4 py-2 font-display font-bold text-azure-300 shadow-glow animate-pulse" style={uiSm}>
            Turno de la CPU...
          </div>
        </div>
      )}

      {/* Log modal */}
      {showLog && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 animate-fade-in" onClick={() => setShowLog(false)}>
          <div className="bg-ink-700 rounded-t-2xl border-t-2 border-gold-500/40 p-4 w-full overscroll-contain overflow-y-auto"
            style={{ maxWidth: '100%', maxHeight: '70dvh', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-gold-300" style={uiBase}>Registro de juego</h3>
              <button onClick={() => setShowLog(false)} className="text-ink-300 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-1">
              {state.log.slice().reverse().map((entry, i) => (
                <div key={i} className="text-ink-200 py-1 border-b border-ink-600/50" style={uiXs}>{entry}</div>
              ))}
              {state.log.length === 0 && <p className="text-ink-400" style={uiXs}>Sin eventos todavía</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
