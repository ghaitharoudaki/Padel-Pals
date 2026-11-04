import React from 'react';
import { Play, RotateCcw, Home } from 'lucide-react';
import { padelAudio } from '../game/audio';

interface PauseOverlayProps {
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
}

export const PauseOverlay: React.FC<PauseOverlayProps> = ({
  onResume,
  onRestart,
  onQuitToMenu,
}) => {
  const handleHover = () => padelAudio.playHoverTick();
  const handleClick = (fn: () => void) => {
    padelAudio.playClickPop();
    fn();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150 select-none font-sans">
      <div
        className="w-full max-w-sm bg-amber-400 border-4 border-slate-900 rounded-3xl p-6 sm:p-8 flex flex-col items-center gap-4 text-slate-950"
        style={{ boxShadow: '10px 10px 0px #0f172a' }}
      >
        <h2
          className="font-brand text-5xl uppercase tracking-wider text-slate-950 mb-2"
          style={{ WebkitTextStroke: '2px #0f172a' }}
        >
          PAUSED
        </h2>

        {/* RESUME BUTTON */}
        <button
          onMouseEnter={handleHover}
          onClick={() => handleClick(onResume)}
          className="w-full py-4 px-6 bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-4 border-slate-900 rounded-2xl font-brand text-2xl uppercase tracking-wider transition active:translate-y-1 active:translate-x-1 flex items-center justify-center gap-3"
          style={{ boxShadow: '5px 5px 0px #0f172a' }}
        >
          <Play className="w-6 h-6 fill-current" />
          RESUME
        </button>

        {/* RESTART BUTTON */}
        <button
          onMouseEnter={handleHover}
          onClick={() => handleClick(onRestart)}
          className="w-full py-3.5 px-6 bg-cyan-400 hover:bg-cyan-300 text-slate-950 border-4 border-slate-900 rounded-2xl font-brand text-xl uppercase tracking-wider transition active:translate-y-1 active:translate-x-1 flex items-center justify-center gap-3"
          style={{ boxShadow: '5px 5px 0px #0f172a' }}
        >
          <RotateCcw className="w-6 h-6 stroke-[3]" />
          RESTART MATCH
        </button>

        {/* QUIT TO MENU BUTTON */}
        <button
          onMouseEnter={handleHover}
          onClick={() => handleClick(onQuitToMenu)}
          className="w-full py-3.5 px-6 bg-rose-500 hover:bg-rose-400 text-white border-4 border-slate-900 rounded-2xl font-brand text-xl uppercase tracking-wider transition active:translate-y-1 active:translate-x-1 flex items-center justify-center gap-3"
          style={{ boxShadow: '5px 5px 0px #0f172a' }}
        >
          <Home className="w-6 h-6 stroke-[3]" />
          QUIT TO MENU
        </button>
      </div>
    </div>
  );
};
