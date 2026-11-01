import React, { useState } from 'react';
import { Settings, Volume2, Music, Eye, Award, X, Check, Zap } from 'lucide-react';
import { CameraPreset, MatchLength } from '../game/types';
import { padelAudio } from '../game/audio';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  cameraPreset?: CameraPreset;
  onSelectCameraPreset?: (preset: CameraPreset) => void;
  matchLength?: MatchLength;
  onSelectMatchLength?: (len: MatchLength) => void;
  goldenPoint?: boolean;
  onToggleGoldenPoint?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  audioEnabled,
  onToggleAudio,
  cameraPreset = 'broadcast',
  onSelectCameraPreset,
  matchLength = '1_set',
  onSelectMatchLength,
  goldenPoint = false,
  onToggleGoldenPoint,
}) => {
  const [sfxVol, setSfxVol] = useState(Math.round(padelAudio.sfxVolume * 100));
  const [musicVol, setMusicVol] = useState(Math.round(padelAudio.musicVolume * 100));

  if (!isOpen) return null;

  const handleSfxChange = (val: number) => {
    setSfxVol(val);
    padelAudio.setSfxVolume(val / 100);
    padelAudio.playHoverTick();
  };

  const handleMusicChange = (val: number) => {
    setMusicVol(val);
    padelAudio.setMusicVolume(val / 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 font-sans">
      <div
        className="w-full max-w-lg bg-white border-4 border-slate-900 rounded-3xl p-6 sm:p-8 relative text-slate-950 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '8px 8px 0px #0f172a' }}
      >
        {/* Close Button */}
        <button
          onClick={() => {
            padelAudio.playBackWhoosh();
            onClose();
          }}
          className="absolute top-5 right-5 w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border-3 border-slate-900 flex items-center justify-center transition active:scale-95"
          style={{ boxShadow: '3px 3px 0px #0f172a' }}
          title="Close Settings"
        >
          <X className="w-5 h-5 stroke-[3]" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-cyan-400 border-3 border-slate-900 flex items-center justify-center shadow">
            <Settings className="w-7 h-7 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="font-brand text-3xl uppercase tracking-wide leading-none">
              MATCH SETTINGS
            </h2>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              Volume sliders, camera perspectives & match rules
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* SFX Volume Slider */}
          <div className="p-4 rounded-2xl bg-amber-50 border-3 border-slate-900 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-900">
                <Volume2 className="w-5 h-5 text-amber-600 stroke-[2.5]" />
                <span>Sound Effects (SFX)</span>
              </div>
              <span className="font-brand text-lg text-slate-950 bg-amber-300 px-2.5 py-0.5 rounded-lg border-2 border-slate-900">
                {sfxVol}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={sfxVol}
              onChange={(e) => handleSfxChange(Number(e.target.value))}
              className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500 border-2 border-slate-900"
            />
          </div>

          {/* Music Volume Slider */}
          <div className="p-4 rounded-2xl bg-cyan-50 border-3 border-slate-900 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-900">
                <Music className="w-5 h-5 text-cyan-600 stroke-[2.5]" />
                <span>Menu & Match Music</span>
              </div>
              <span className="font-brand text-lg text-slate-950 bg-cyan-300 px-2.5 py-0.5 rounded-lg border-2 border-slate-900">
                {musicVol}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={musicVol}
              onChange={(e) => handleMusicChange(Number(e.target.value))}
              className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-cyan-500 border-2 border-slate-900"
            />
          </div>

          {/* Camera View Angle Selector */}
          <div className="p-4 rounded-2xl bg-slate-50 border-3 border-slate-900 space-y-2">
            <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-900">
              <Eye className="w-5 h-5 text-rose-500 stroke-[2.5]" />
              <span>Camera Perspective</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'broadcast', label: 'Broadcast', desc: 'TV View' },
                  { id: 'high', label: 'High', desc: 'Tactical' },
                  { id: 'close', label: 'Close', desc: 'Dynamic' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    padelAudio.playClickPop();
                    onSelectCameraPreset?.(opt.id);
                  }}
                  className={`py-2.5 px-2 rounded-xl border-3 border-slate-900 font-brand text-sm uppercase transition text-center ${
                    cameraPreset === opt.id
                      ? 'bg-rose-500 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                  style={{ boxShadow: cameraPreset === opt.id ? '3px 3px 0px #0f172a' : 'none' }}
                >
                  <div>{opt.label}</div>
                  <div className="text-[10px] font-bold opacity-80">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Match Length Selector */}
          <div className="p-4 rounded-2xl bg-slate-50 border-3 border-slate-900 space-y-2">
            <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-900">
              <Award className="w-5 h-5 text-emerald-600 stroke-[2.5]" />
              <span>Match Length</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: '1_game', label: '1 Game', desc: 'Quick Play' },
                  { id: '3_games', label: '3 Games', desc: 'Short Match' },
                  { id: '1_set', label: '1 Set (6 Games)', desc: 'Standard Set' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    padelAudio.playClickPop();
                    onSelectMatchLength?.(m.id);
                  }}
                  className={`py-2.5 px-2 rounded-xl border-3 border-slate-900 font-brand text-xs sm:text-sm uppercase transition text-center ${
                    matchLength === m.id
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                  style={{ boxShadow: matchLength === m.id ? '3px 3px 0px #0f172a' : 'none' }}
                >
                  <div>{m.label}</div>
                  <div className="text-[10px] font-bold opacity-80">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Golden Point (Punto de Oro) */}
          <div className="p-4 rounded-2xl bg-slate-50 border-3 border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-amber-500 fill-current" />
              <div>
                <div className="font-brand text-lg uppercase text-slate-900 leading-none">
                  Golden Point (Punto de Oro)
                </div>
                <div className="text-xs font-bold text-slate-600 mt-0.5">
                  Deciding sudden-death point at 40-40 deuce
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                padelAudio.playClickPop();
                onToggleGoldenPoint?.();
              }}
              className={`py-1.5 px-3.5 rounded-xl border-3 border-slate-900 font-brand text-xs uppercase tracking-wider transition ${
                goldenPoint ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-600'
              }`}
              style={{ boxShadow: '2px 2px 0px #0f172a' }}
            >
              {goldenPoint ? 'ENABLED' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Done / Close Button */}
        <div className="mt-6">
          <button
            onClick={() => {
              padelAudio.playClickPop();
              onClose();
            }}
            className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 border-4 border-slate-900 font-brand text-xl uppercase tracking-wider transition active:scale-98 flex items-center justify-center gap-2"
            style={{ boxShadow: '4px 4px 0px #0f172a' }}
          >
            <Check className="w-6 h-6 stroke-[3]" />
            SAVE & RETURN
          </button>
        </div>
      </div>
    </div>
  );
};
