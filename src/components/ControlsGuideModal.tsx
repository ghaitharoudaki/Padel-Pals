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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div
        className="w-full max-w-lg bg-white border-4 border-slate-900 rounded-3xl p-6 sm:p-8 relative text-slate-950 max-h-[90vh] overflow-y-auto animate-in slide-in-from-right-8 duration-250 ease-out"
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
          {/* Easy Directional Aiming (3x2 Grid) */}
          <div className="p-4 bg-amber-50 border-3 border-slate-900 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-950">
              <Sparkles className="w-5 h-5 text-amber-500 fill-current" />
              <span>Easy Directional Aiming (3x2 Grid)</span>
            </div>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">
              No tricky mouse aiming needed! Simply hold your movement keys or joystick in the direction you want the ball to go. Watch the yellow target reticle snap across the opponent&apos;s court:
            </p>
            <div className="grid grid-cols-3 gap-1.5 text-center text-xs pt-1 font-brand">
              <div className="bg-white p-2 rounded-xl border-2 border-slate-900">
                <span className="text-indigo-600 block text-xs">W + A</span>
                <span className="text-[10px] text-slate-600 font-sans font-bold">Short Left</span>
              </div>
              <div className="bg-white p-2 rounded-xl border-2 border-slate-900">
                <span className="text-indigo-600 block text-xs">W / Up</span>
                <span className="text-[10px] text-slate-600 font-sans font-bold">Short Center</span>
              </div>
              <div className="bg-white p-2 rounded-xl border-2 border-slate-900">
                <span className="text-indigo-600 block text-xs">W + D</span>
                <span className="text-[10px] text-slate-600 font-sans font-bold">Short Right</span>
              </div>
              <div className="bg-white p-2 rounded-xl border-2 border-slate-900">
                <span className="text-emerald-600 block text-xs">A / Left</span>
                <span className="text-[10px] text-slate-600 font-sans font-bold">Deep Left</span>
              </div>
              <div className="bg-amber-100 p-2 rounded-xl border-2 border-slate-900">
                <span className="text-amber-700 block text-xs">None (Neutral)</span>
                <span className="text-[10px] text-slate-700 font-sans font-bold">Deep Center (Default)</span>
              </div>
              <div className="bg-white p-2 rounded-xl border-2 border-slate-900">
                <span className="text-emerald-600 block text-xs">D / Right</span>
                <span className="text-[10px] text-slate-600 font-sans font-bold">Deep Right</span>
              </div>
            </div>
          </div>

          {/* Shot Type Shortcuts */}
          <div className="p-4 bg-slate-50 border-3 border-slate-900 rounded-2xl space-y-2.5">
            <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-950">
              <Zap className="w-5 h-5 text-cyan-500 fill-current" />
              <span>Shot Types &amp; Shortcuts</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-slate-950 block">SPACE / CLICK</span>
                <span className="text-[11px] font-bold text-slate-600">Hold to charge power, release to strike</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-indigo-600 block">SHIFT + HIT (LOB)</span>
                <span className="text-[11px] font-bold text-slate-600">High arc defensive lob over opponents</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-pink-600 block">CTRL + HIT (DROP)</span>
                <span className="text-[11px] font-bold text-slate-600">Soft drop shot that dies close to the net</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border-2 border-slate-900">
                <span className="font-brand text-sm text-rose-600 block">SMASH (OVERHEAD)</span>
                <span className="text-[11px] font-bold text-slate-600">Jump and hit when ball is above head height</span>
              </div>
            </div>
          </div>

          {/* Mobile & Touch Controls */}
          <div className="p-4 bg-emerald-50 border-3 border-slate-900 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-950">
              <Gamepad2 className="w-5 h-5 text-emerald-600" />
              <span>Mobile / Touch Controls</span>
            </div>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">
              On touch devices, use the floating on-screen joystick on the left to move and select your 3x2 aim zone. Tap or hold the chunky &quot;HIT&quot; button to charge your drive, or press &quot;LOB&quot; for an instant lob shot!
            </p>
          </div>

          {/* Glass Wall Rules Tip */}
          <div className="p-3.5 bg-cyan-100 border-3 border-slate-900 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-cyan-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs font-bold text-slate-800 leading-relaxed">
              <span className="font-brand text-sm uppercase text-slate-950 block mb-0.5">
                Smart Aim Assist &amp; Glass Wall Rule:
              </span>
              Aim Assist automatically adjusts elevation to clear the net and keeps normal shots within court boundaries. The ball must bounce once on the floor before hitting the glass wall!
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
