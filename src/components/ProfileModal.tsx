import React from 'react';
import { Trophy, Award, Flame, Zap, X, Shield, Star } from 'lucide-react';
import { PlayerCustomization } from '../game/types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  customization: PlayerCustomization;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  customization,
}) => {
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

        {/* Header Avatar Badge */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-xl border-2 border-white/20"
            style={{ backgroundColor: customization.jerseyColor }}
          >
            {customization.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black uppercase tracking-wide">{customization.name}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-black font-black uppercase">
                PRO 1420
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-medium">World Padel Tour Arcade Division</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <Trophy className="w-6 h-6 text-amber-400" />
            <div>
              <div className="text-[10px] text-zinc-400 font-bold uppercase">Matches Won</div>
              <div className="text-lg font-black text-white">28 / 34</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <Flame className="w-6 h-6 text-rose-400" />
            <div>
              <div className="text-[10px] text-zinc-400 font-bold uppercase">Win Rate</div>
              <div className="text-lg font-black text-emerald-400">82.4%</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <Zap className="w-6 h-6 text-cyan-400" />
            <div>
              <div className="text-[10px] text-zinc-400 font-bold uppercase">Smash Killshots</div>
              <div className="text-lg font-black text-white">142</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <Shield className="w-6 h-6 text-indigo-400" />
            <div>
              <div className="text-[10px] text-zinc-400 font-bold uppercase">Glass Rebounds</div>
              <div className="text-lg font-black text-white">89</div>
            </div>
          </div>
        </div>

        {/* Badges / Mastery */}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-400">
            Player Achievements
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-blue-500/20 border border-blue-400/40 text-blue-300 text-xs font-bold flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
              Court Master
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-bold flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-purple-400" />
              Bandeja King
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              Overhead Spiker
            </span>
          </div>
        </div>

        {/* Close Button */}
        <div className="mt-8">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase tracking-wider transition"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
};
