import React from 'react';
import { Gamepad2, X, Sparkles, Zap, ShieldAlert, Check } from 'lucide-react';
import { padelAudio } from '../game/audio';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ControlsGuideModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 font-sans">
      <div
        className="w-full max-w-lg bg-white border-4 border-slate-900 rounded-3xl p-6 sm:p-8 relative text-slate-950 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '8px 8px 0px #0f172a' }}
      >
        <button
          onClick={() => {
            padelAudio.playBackWhoosh();
            onClose();
          }}
          className="absolute top-5 right-5 w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border-3 border-slate-900 flex items-center justify-center transition active:scale-95"
          style={{ boxShadow: '3px 3px 0px #0f172a' }}
          title="Close Guide"
        >
          <X className="w-5 h-5 stroke-[3]" />
        </button>

        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-400 border-3 border-slate-900 flex items-center justify-center shadow">
            <Gamepad2 className="w-7 h-7 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="font-brand text-3xl uppercase tracking-wide leading-none">
              HOW TO PLAY
            </h2>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              Controls, smart auto-shots & glass wall rules
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Smart Auto-Shot System */}
          <div className="p-4 bg-amber-50 border-3 border-slate-900 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-950">
              <Sparkles className="w-5 h-5 text-amber-500 fill-current" />
              <span>Smart Auto-Shots (No Key Spam!)</span>
            </div>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">
              The game automatically triggers the perfect shot based on ball height and your movement direction:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-rose-600 uppercase block">💥 Smash</span>
                <span className="text-[11px] font-bold text-slate-600">Triggered automatically when ball is high</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-indigo-600 uppercase block">🌈 Deep Lob</span>
                <span className="text-[11px] font-bold text-slate-600">Hold W / Up arrow while swinging</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-pink-600 uppercase block">🍃 Soft Drop</span>
                <span className="text-[11px] font-bold text-slate-600">Hold S / Down arrow near the net</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-amber-600 uppercase block">🎯 Power Drive</span>
                <span className="text-[11px] font-bold text-slate-600">Standard crisp penetrating baseline drive</span>
              </div>
            </div>
          </div>

          {/* Key Actions */}
          <div className="p-4 bg-slate-50 border-3 border-slate-900 rounded-2xl space-y-2.5">
            <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-950">
              <Zap className="w-5 h-5 text-cyan-500 fill-current" />
              <span>Key Bindings</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-slate-950 block">SPACE / LEFT CLICK</span>
                <span className="text-[11px] font-bold text-slate-600">Hold to charge power, release to swing</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-slate-950 block">WASD / ARROWS</span>
                <span className="text-[11px] font-bold text-slate-600">Move player & steer shot angle in real time</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-slate-950 block">SHIFT KEY</span>
                <span className="text-[11px] font-bold text-slate-600">Sprint for rapid court coverage</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-slate-950 block">RIGHT CLICK</span>
                <span className="text-[11px] font-bold text-slate-600">Instant smash or drive</span>
              </div>
            </div>
          </div>

          {/* Glass Wall Rules Tip */}
          <div className="p-3.5 bg-cyan-100 border-3 border-slate-900 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-cyan-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs font-bold text-slate-800 leading-relaxed">
              <span className="font-brand text-sm uppercase text-slate-950 block mb-0.5">
                Padel Glass Wall Rule:
              </span>
              The ball MUST bounce once on the court turf before contacting the rear glass wall. After it bounces off the glass, you can hit it on the rebound!
            </div>
          </div>

          <button
            onClick={() => {
              padelAudio.playClickPop();
              onClose();
            }}
            className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-brand text-xl uppercase tracking-wider rounded-2xl border-4 border-slate-900 transition active:scale-98 flex items-center justify-center gap-2"
            style={{ boxShadow: '4px 4px 0px #0f172a' }}
          >
            <Check className="w-6 h-6 stroke-[3]" />
            GOT IT, LET'S PLAY!
          </button>
        </div>
      </div>
    </div>
  );
};
