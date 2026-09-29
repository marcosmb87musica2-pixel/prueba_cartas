import { Trophy, RotateCcw, Skull } from 'lucide-react';

interface GameOverProps {
  winnerName: string;
  loserName: string;
  onRestart: () => void;
}

export function GameOverScreen({ winnerName, loserName, onRestart }: GameOverProps) {
  return (
    <div className="bg-ink-900 flex flex-col items-center justify-center px-6 animate-fade-in" style={{ minHeight: '100dvh' }}>
      <div className="animate-burst w-24 h-24 rounded-full bg-gold-400/10 border-2 border-gold-400/40 flex items-center justify-center mb-6">
        <Trophy size={48} className="text-gold-300" />
      </div>
      <h1 className="font-display text-3xl font-black text-gold-300 mb-2 text-center">¡Victoria!</h1>
      <p className="text-lg text-white font-display font-bold mb-1">{winnerName}</p>
      <div className="flex items-center gap-1.5 text-sm text-ink-300 mb-8">
        <Skull size={14} className="text-crimson-400" />
        <span>{loserName} ha sido derrotado</span>
      </div>
      <button
        onClick={onRestart}
        className="px-8 py-3 rounded-xl bg-gold-400 text-ink-900 font-display font-bold hover:bg-gold-300 shadow-glow active:scale-95 transition-all duration-200 flex items-center gap-2"
      >
        <RotateCcw size={18} />
        Nueva partida
      </button>
    </div>
  );
}
