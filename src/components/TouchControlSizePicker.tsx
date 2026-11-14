import React from 'react';
import { Hand } from 'lucide-react';
import { padelAudio } from '../game/audio';
import { TOUCH_CONTROL_SIZES, TouchControlSize } from './touchControlSize';

interface Props {
  value: TouchControlSize;
  onChange: (size: TouchControlSize) => void;
  /** Compact variant for the pause menu. */
  compact?: boolean;
}

/** Segmented picker for the size of the on-screen touch controls. */
export const TouchControlSizePicker: React.FC<Props> = ({ value, onChange, compact = false }) => (
  <div
    className={`rounded-2xl bg-slate-50 border-3 border-slate-900 space-y-2 w-full ${compact ? 'p-2.5' : 'p-4'}`}
    role="radiogroup"
    aria-label="Touch controls size"
  >
    <div className={`flex items-center gap-2 font-brand uppercase text-slate-900 ${compact ? 'text-sm' : 'text-lg'}`}>
      <Hand className="w-5 h-5 text-amber-500 stroke-[2.5]" />
      <span>Touch Controls Size</span>
    </div>
    <div className="grid grid-cols-3 gap-2">
      {TOUCH_CONTROL_SIZES.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            role="radio"
            aria-checked={selected}
            onClick={() => {
              padelAudio.playClickPop();
              onChange(opt.id);
            }}
            className={`rounded-xl border-3 border-slate-900 font-brand uppercase transition text-center ${
              compact ? 'py-1.5 px-1 text-xs' : 'py-2.5 px-2 text-sm'
            } ${selected ? 'bg-amber-400 text-slate-950' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
            style={{ boxShadow: selected ? '3px 3px 0px #0f172a' : 'none' }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
    {!compact && (
      <p className="text-[11px] font-bold text-slate-500">
        Joystick and HIT / LOB / JUMP buttons on phones and tablets.
      </p>
    )}
  </div>
);
