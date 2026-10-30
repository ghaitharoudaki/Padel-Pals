import React from 'react';
import { Gamepad2, Mouse, Keyboard, X, ShieldAlert, Sparkles, Zap } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ControlsGuideModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/15 rounded-3xl shadow-2xl p-6 sm:p-8 text-white max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition"
          aria-label="Close controls guide"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3.5 mb-6">
          <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-2xl border border-cyan-500/30">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">Controls & Mechanics Guide</h2>
            <p className="text-xs text-zinc-400">Intuitive one-key action, auto-shots, and true padel physics</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Highlight: Intuitive Auto-Shot Selection */}
          <div className="p-4 bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-sky-900/40 border border-cyan-400/30 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-sm font-black text-cyan-300">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Smart Auto-Shot System (No Number Key Spam!)</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              The game automatically detects the ideal shot type based on incoming ball height and your directional inputs:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
                <span className="font-bold text-rose-400 block">💥 Overhead Smash</span>
                <span className="text-zinc-400">Triggered automatically when ball is high overhead</span>
              </div>
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
                <span className="font-bold text-violet-400 block">🌈 Deep Lob</span>
                <span className="text-zinc-400">Hold W / Up Arrow while swinging to loft deep</span>
              </div>
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
                <span className="font-bold text-pink-400 block">🍃 Soft Drop Touch</span>
                <span className="text-zinc-400">Hold S / Down Arrow when ball is low near net</span>
              </div>
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
                <span className="font-bold text-amber-400 block">🎯 Power Drive</span>
                <span className="text-zinc-400">Standard crisp penetrating baseline drive</span>
              </div>
            </div>
          </div>

          {/* Mouse & Spacebar Controls */}
          <div className="p-4 bg-zinc-800/70 border border-white/10 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
              <Zap className="w-4 h-4" />
              One-Key & Mouse Action
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-zinc-900/70 p-2.5 rounded-xl border border-white/5">
                <span className="font-bold text-white block">SPACEBAR or Left Click</span>
                <span className="text-zinc-400">Hold to charge power, release to strike!</span>
              </div>
              <div className="bg-zinc-900/70 p-2.5 rounded-xl border border-white/5">
                <span className="font-bold text-white block">Right Click</span>
                <span className="text-zinc-400">Instant power smash or strike</span>
              </div>
              <div className="bg-zinc-900/70 p-2.5 rounded-xl border border-white/5">
                <span className="font-bold text-white block">WASD / Arrow Keys</span>
                <span className="text-zinc-400">Move player & steer shot angle in real-time</span>
              </div>
              <div className="bg-zinc-900/70 p-2.5 rounded-xl border border-white/5">
                <span className="font-bold text-white block">Shift Key</span>
                <span className="text-zinc-400">Sprint for rapid court coverage</span>
              </div>
            </div>
          </div>

          {/* Realistic Padel Rules Tip */}
          <div className="p-3.5 bg-blue-950/40 border border-blue-500/30 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-200 leading-relaxed">
              <span className="font-bold text-white block mb-0.5">Padel Glass Wall Rule:</span>
              The ball MUST bounce once on the blue court turf before touching the rear glass wall. After it bounces on the floor, you can let it rebound off the rear glass and hit it on the way back!
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl transition shadow-xl shadow-blue-600/30 active:scale-98"
          >
            Got it, Let's Play!
          </button>
        </div>
      </div>
    </div>
  );
};
