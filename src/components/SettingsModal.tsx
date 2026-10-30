import React, { useState } from 'react';
import { Settings, Volume2, Eye, Compass, X, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  audioEnabled,
  onToggleAudio,
}) => {
  const [sfxVolume, setSfxVolume] = useState(85);
  const [cameraElevation, setCameraElevation] = useState<'high' | 'ultra' | 'broadcast'>('high');
  const [invertAim, setInvertAim] = useState(false);
  const [showTrajectoryRings, setShowTrajectoryRings] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-zinc-900 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-cyan-400 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-wide">System Settings</h2>
            <p className="text-xs text-zinc-400 font-medium">Configure audio, camera view & control behavior</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Audio SFX Toggle & Slider */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Volume2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold">Sound Effects & Crowd</span>
              </div>
              <button
                onClick={onToggleAudio}
                className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                  audioEnabled
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {audioEnabled ? 'ENABLED' : 'MUTED'}
              </button>
            </div>

            {audioEnabled && (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sfxVolume}
                  onChange={e => setSfxVolume(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                />
                <span className="text-xs font-mono font-bold text-zinc-400 w-8">{sfxVolume}%</span>
              </div>
            )}
          </div>

          {/* Camera Elevation */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Eye className="w-5 h-5 text-cyan-400" />
              <span className="text-sm font-bold">Camera Angle Preset</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['high', 'ultra', 'broadcast'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => setCameraElevation(preset)}
                  className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wide transition border ${
                    cameraElevation === preset
                      ? 'bg-blue-600 text-white border-cyan-400/60 shadow-lg shadow-blue-600/30'
                      : 'bg-zinc-800/80 text-zinc-400 border-white/5 hover:text-white'
                  }`}
                >
                  {preset === 'high' ? 'High Baseline' : preset === 'ultra' ? 'Stadium 4K' : 'TV Broadcast'}
                </button>
              ))}
            </div>
          </div>

          {/* Trajectory Guide Ring Toggle */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Compass className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-sm font-bold">Ball Landing Prediction Ring</div>
                <div className="text-[11px] text-zinc-400">Shows timing ring for court landing point</div>
              </div>
            </div>
            <button
              onClick={() => setShowTrajectoryRings(prev => !prev)}
              className={`w-10 h-6 rounded-full transition-colors relative flex items-center p-1 ${
                showTrajectoryRings ? 'bg-cyan-500' : 'bg-zinc-800'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  showTrajectoryRings ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Save & Close */}
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/30 transition flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
