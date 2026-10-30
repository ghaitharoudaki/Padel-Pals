import React from 'react';
import { PlayerCustomization } from '../game/types';
import { Sparkles, X, Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customization: PlayerCustomization;
  onChange: (custom: PlayerCustomization) => void;
}

const RACKET_SKINS = [
  { id: 'carbon', name: 'Carbon Stealth', color: '#27272a', desc: 'Raw high-modulus 12K carbon fiber' },
  { id: 'pro_blue', name: 'Pro Tour Blue', color: '#0284c7', desc: 'Official World Padel Tour tournament finish' },
  { id: 'neon', name: 'Neon Volt', color: '#16a34a', desc: 'High-visibility fluorescent power frame' },
  { id: 'gold', name: 'Gold Champion', color: '#d97706', desc: 'Limited edition metallic titanium-gold' },
];

const JERSEY_COLORS = [
  { name: 'Navy Blue', hex: '#1e3a8a' },
  { name: 'Crimson Red', hex: '#dc2626' },
  { name: 'Emerald Green', hex: '#059669' },
  { name: 'Obsidian Black', hex: '#18181b' },
  { name: 'Pure White', hex: '#f8fafc' },
  { name: 'Electric Purple', hex: '#7c3aed' },
];

const SHORTS_COLORS = [
  { name: 'Slate Dark', hex: '#1e293b' },
  { name: 'White Sport', hex: '#f1f5f9' },
  { name: 'Midnight', hex: '#0f172a' },
  { name: 'Royal', hex: '#1d4ed8' },
];

const SKIN_TONES = [
  { name: 'Fair', hex: '#fcd34d' },
  { name: 'Warm Tan', hex: '#f59e0b' },
  { name: 'Caramel', hex: '#d97706' },
  { name: 'Deep Bronze', hex: '#78350f' },
];

export const CustomizerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  customization,
  onChange,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] text-white overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Avatar & Padel Racket</h2>
              <p className="text-xs text-zinc-400">Customize your 3D athlete and equipment appearance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition"
            aria-label="Close avatar customizer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Player Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Player Display Name
            </label>
            <input
              type="text"
              maxLength={14}
              value={customization.name}
              onChange={(e) => onChange({ ...customization, name: e.target.value })}
              className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white font-medium focus:outline-none focus:border-amber-500 text-sm"
            />
          </div>

          {/* Racket Skin Selection */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Padel Racket Model & Skin
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RACKET_SKINS.map((skin) => (
                <button
                  key={skin.id}
                  onClick={() => onChange({ ...customization, racketSkin: skin.id })}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition ${
                    customization.racketSkin === skin.id
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-zinc-800 bg-zinc-800/60 hover:border-zinc-700'
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full border border-zinc-600 flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: skin.color }}
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1">
                      {skin.name}
                      {customization.racketSkin === skin.id && <Check className="w-3 h-3 text-amber-400" />}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{skin.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Jersey Color */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Jersey Color
            </label>
            <div className="flex flex-wrap gap-2">
              {JERSEY_COLORS.map((col) => (
                <button
                  key={col.hex}
                  onClick={() => onChange({ ...customization, jerseyColor: col.hex })}
                  className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition transform active:scale-90 ${
                    customization.jerseyColor === col.hex ? 'border-amber-400 scale-105' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: col.hex }}
                  title={col.name}
                  aria-label={`Select jersey color ${col.name}`}
                >
                  {customization.jerseyColor === col.hex && (
                    <Check className={`w-3.5 h-3.5 ${col.hex === '#f8fafc' ? 'text-zinc-900' : 'text-white'}`} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Shorts Color */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Athletic Shorts Color
            </label>
            <div className="flex flex-wrap gap-2">
              {SHORTS_COLORS.map((col) => (
                <button
                  key={col.hex}
                  onClick={() => onChange({ ...customization, shortsColor: col.hex })}
                  className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition transform active:scale-90 ${
                    customization.shortsColor === col.hex ? 'border-amber-400 scale-105' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: col.hex }}
                  title={col.name}
                  aria-label={`Select shorts color ${col.name}`}
                >
                  {customization.shortsColor === col.hex && (
                    <Check className={`w-3.5 h-3.5 ${col.hex === '#f1f5f9' ? 'text-zinc-900' : 'text-white'}`} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Skin Tone */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Athlete Skin Tone
            </label>
            <div className="flex flex-wrap gap-2">
              {SKIN_TONES.map((tone) => (
                <button
                  key={tone.hex}
                  onClick={() => onChange({ ...customization, skinTone: tone.hex })}
                  className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition transform active:scale-90 ${
                    customization.skinTone === tone.hex ? 'border-amber-400 scale-105' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: tone.hex }}
                  title={tone.name}
                  aria-label={`Select skin tone ${tone.name}`}
                >
                  {customization.skinTone === tone.hex && (
                    <Check className="w-3.5 h-3.5 text-zinc-900" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pinned Action Footer */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl transition shadow-lg shadow-amber-500/25 text-sm"
          >
            Apply & Return to Court
          </button>
        </div>
      </div>
    </div>
  );
};
