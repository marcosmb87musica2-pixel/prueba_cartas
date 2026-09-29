import { Sword, Shield, CheckCircle2 } from 'lucide-react';
import type { Card, MonsterCard, TrapCard, MagicCard } from '@/game/cardData';
import { SUIT_COLORS } from '@/game/cardData';
import type { FieldMonster } from '@/game/types';
import { getEffectiveAtk, getEffectiveDef } from '@/game/types';

const SUIT_SYMBOL: Record<string, string> = {
  espadas: '⚔️',
  bastos: '🌿',
  copas: '🥂',
  oros: '🪙',
};

function suitColors(suit: string): { from: string; to: string; accent: string } {
  return SUIT_COLORS[suit as keyof typeof SUIT_COLORS] ?? SUIT_COLORS.espadas;
}

interface CardViewProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  isField?: boolean;
  fieldMonster?: FieldMonster;
  showTrap?: boolean;
  showMagic?: boolean;
  className?: string;
}

export function CardView({
  card,
  size = 'md',
  onClick,
  selected = false,
  disabled = false,
  faceDown = false,
  isField = false,
  fieldMonster,
  showTrap = false,
  showMagic = false,
  className = '',
}: CardViewProps) {
  const sizes = {
    sm: { w: 'w-[56px] sm:w-[68px]', h: 'h-[84px] sm:h-[102px]', text: 'text-[9px] sm:text-[10px]', num: 'text-sm sm:text-base', emoji: 'text-xl sm:text-2xl', bar: 'h-5 sm:h-6' },
    md: { w: 'w-20 sm:w-24', h: 'h-28 sm:h-32', text: 'text-[11px] sm:text-xs', num: 'text-base sm:text-lg', emoji: 'text-3xl sm:text-4xl', bar: 'h-6 sm:h-7' },
    lg: { w: 'w-28', h: 'h-40', text: 'text-sm', num: 'text-xl', emoji: 'text-5xl', bar: 'h-8' },
  };
  const s = sizes[size];

  if (faceDown) {
    return (
      <div
        className={`${s.w} ${s.h} rounded-lg card-back border border-gold-700/40 shadow-card flex items-center justify-center ${className}`}
        onClick={onClick}
      >
        <div className="w-8 h-8 rounded-full border-2 border-gold-500/30 flex items-center justify-center">
          <span className="text-gold-500/40 text-xs font-display">B</span>
        </div>
      </div>
    );
  }

  if (card.type === 'monster') {
    const mc = card as MonsterCard;
    const colors = suitColors(mc.suit);
    const accent = colors.accent;
    const atk = fieldMonster ? getEffectiveAtk(fieldMonster) : mc.atk;
    const def = fieldMonster ? getEffectiveDef(fieldMonster) : mc.def;
    const isDef = fieldMonster?.position === 'defense';

    return (
      <div
        className={`${s.w} ${s.h} rounded-lg border-2 shadow-card relative overflow-hidden cursor-pointer transition-all duration-200 ${
          selected ? 'ring-2 ring-gold-300 scale-105 shadow-glow' : ''
        } ${disabled ? 'opacity-50' : 'hover:scale-105'} ${isDef ? 'rotate-0' : ''} ${className}`}
        style={{
          borderColor: accent + '80',
          ['--card-bg-from' as string]: colors.from,
          ['--card-bg-to' as string]: colors.to,
        }}
        onClick={onClick}
      >
        <div className="card-face w-full h-full flex flex-col p-1">
          <img src={card.image ?? `/cards/${card.suit}-${card.number}.webp`} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-75" />
          {/* 4-corner numbers */}
          <div className="flex justify-between items-start">
            <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{mc.number}</span>
            <span className={`${s.text}`}>{SUIT_SYMBOL[mc.suit]}</span>
            <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{mc.number}</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className={`${s.emoji}`}>{SUIT_SYMBOL[mc.suit]}</span>
          </div>
          <div className={`${s.text} text-center font-display font-semibold text-white/90 truncate px-0.5`}>{mc.name}</div>
          <div className="flex justify-between items-start">
            <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{mc.number}</span>
            <span className={`${s.text}`}>{SUIT_SYMBOL[mc.suit]}</span>
            <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{mc.number}</span>
          </div>
          <div className={`flex justify-between items-center ${s.bar} px-1 mt-0.5`}>
            <div className="flex items-center gap-0.5">
              <Sword size={12} className="text-crimson-400" />
              <span className={`${s.text} font-bold text-white`}>{atk}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <span className={`${s.text} font-bold text-white`}>{def}</span>
              <Shield size={12} className="text-azure-400" />
            </div>
          </div>
        </div>
        {showTrap && fieldMonster?.trap && (
          <div className="absolute top-0 right-0 w-4 h-4 bg-crimson-500 rounded-bl-md rounded-tr-lg flex items-center justify-center">
            <span className="text-[8px] text-white font-bold">T</span>
          </div>
        )}
        {showMagic && fieldMonster?.magic && (
          <div className="absolute top-0 left-0 w-4 h-4 bg-gold-400 rounded-br-md rounded-tl-lg flex items-center justify-center">
            <span className="text-[8px] text-ink-900 font-bold">M</span>
          </div>
        )}
        {isField && fieldMonster?.hasAttacked && (
          <div className="absolute top-1 left-1 z-10 flex items-center justify-center">
            <div className="bg-crimson-500 rounded-full p-0.5 shadow-lg ring-2 ring-crimson-300/50">
              <CheckCircle2 size={12} className="text-white" />
            </div>
          </div>
        )}
        {fieldMonster?.pendingEffect && (
          <div className="absolute bottom-0 left-0 px-1 bg-violet-500/80 rounded-tr-md">
            <span className="text-[8px] text-white font-bold">{fieldMonster.pendingTurns}</span>
          </div>
        )}
      </div>
    );
  }

  if (card.type === 'trap') {
    const tc = card as TrapCard;
    const colors = suitColors('copas');
    return (
      <div
        className={`${s.w} ${s.h} rounded-lg border-2 shadow-card relative overflow-hidden cursor-pointer transition-all duration-200 ${
          selected ? 'ring-2 ring-crimson-400 scale-105 shadow-glow-crimson' : ''
        } ${disabled ? 'opacity-50' : 'hover:scale-105'} ${className}`}
        style={{
          borderColor: colors.accent + '80',
          ['--card-bg-from' as string]: colors.from,
          ['--card-bg-to' as string]: colors.to,
        }}
        onClick={onClick}
      >
        <div className="card-face w-full h-full flex flex-col p-1">
          <img src={card.image ?? `/cards/${card.suit}-${card.number}.webp`} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-75" />
          <div className="flex justify-between items-start">
            <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{tc.number}</span>
            <span className={`${s.text}`}>🥂</span>
            <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{tc.number}</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className={`${s.emoji}`}>🥂</span>
          </div>
          <div className={`${s.text} text-center font-display font-semibold text-white/90 leading-tight`}>{tc.name}</div>
          <div className="flex justify-between items-start">
            <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{tc.number}</span>
            <span className={`${s.text}`}>🥂</span>
            <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{tc.number}</span>
          </div>
        </div>
      </div>
    );
  }

  const mg = card as MagicCard;
  const colors = suitColors('oros');
  return (
    <div
      className={`${s.w} ${s.h} rounded-lg border-2 shadow-card relative overflow-hidden cursor-pointer transition-all duration-200 ${
        selected ? 'ring-2 ring-gold-400 scale-105 shadow-glow' : ''
      } ${disabled ? 'opacity-50' : 'hover:scale-105'} ${className}`}
      style={{
        borderColor: colors.accent + '80',
        ['--card-bg-from' as string]: colors.from,
        ['--card-bg-to' as string]: colors.to,
      }}
      onClick={onClick}
    >
      <div className="card-face w-full h-full flex flex-col p-1">
          <img src={card.image ?? `/cards/${card.suit}-${card.number}.webp`} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-75" />
        <div className="flex justify-between items-start">
          <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{mg.number}</span>
          <span className={`${s.text}`}>🪙</span>
          <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{mg.number}</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className={`${s.emoji}`}>🪙</span>
        </div>
        <div className={`${s.text} text-center font-display font-semibold text-white/90 leading-tight`}>{mg.name}</div>
        <div className="flex justify-between items-start">
          <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{mg.number}</span>
          <span className={`${s.text}`}>🪙</span>
          <span className={`${s.num} font-bold text-white text-shadow-strong leading-none`}>{mg.number}</span>
        </div>
      </div>
    </div>
  );
}

export function CardBack({ size = 'md' }: { size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const sizes = { xs: 'w-8 h-12 sm:w-10 sm:h-14', sm: 'w-[56px] h-[84px] sm:w-[68px] sm:h-[102px]', md: 'w-20 h-28 sm:w-24 sm:h-32', lg: 'w-28 h-40' };
  if (size === 'xs') {
    return <div className={`${sizes.xs} rounded card-back border border-gold-700/40 shadow-card`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-lg card-back border border-gold-700/40 shadow-card flex items-center justify-center`}>
      <div className="w-8 h-8 rounded-full border-2 border-gold-500/30 flex items-center justify-center">
        <span className="text-gold-500/40 text-xs font-display">B</span>
      </div>
    </div>
  );
}
