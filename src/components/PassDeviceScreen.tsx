import { Smartphone, ChevronRight } from 'lucide-react';

interface PassDeviceProps {
  playerName: string;
  onConfirm: () => void;
  message?: string;
}

export function PassDeviceScreen({ playerName, onConfirm, message }: PassDeviceProps) {
  return (
    <div className="min-h-screen bg-ink-900 flex flex-col items-center justify-center px-6">
      <div className="animate-pulse-glow w-20 h-20 rounded-2xl border-2 border-gold-500/40 flex items-center justify-center mb-6">
        <Smartphone size={36} className="text-gold-400" />
      </div>
      <h2 className="font-display text-xl font-bold text-gold-300 mb-2 text-center">Pasa el dispositivo</h2>
      <p className="text-sm text-ink-300 text-center mb-1">
        {message ?? `Entrega el dispositivo a ${playerName}`}
      </p>
      <p className="text-xs text-ink-400 text-center mb-8 max-w-xs">
        Asegúrate de que el otro jugador no pueda ver tus cartas antes de continuar.
      </p>
      <button
        onClick={onConfirm}
        className="px-8 py-3 rounded-xl bg-gold-400 text-ink-900 font-display font-bold hover:bg-gold-300 shadow-glow active:scale-95 transition-all duration-200 flex items-center gap-2"
      >
        Estoy listo
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
