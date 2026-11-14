import React from 'react';
import { Play, RotateCcw, Home, Gamepad2 } from 'lucide-react';
import { padelAudio } from '../game/audio';

interface PauseOverlayProps {
  onResume: () => void;
  onRestart?: () => void;
  onShowControls?: () => void;
  onQuitToMenu: () => void;
  isOnline?: boolean;
  isHost?: boolean;
}

export const PauseOverlay: React.FC<PauseOverlayProps> = ({
  onResume,
  onRestart,
  onShowControls,
  onQuitToMenu,
  isOnline = false,
  isHost = false,
}) => {
  const [confirmQuit, setConfirmQuit] = React.useState(false);
  const handleHover = () => padelAudio.playHoverTick();
  const handleClick = (fn: () => void) => {
    padelAudio.playClickPop();
    fn();
  };

  const quitLabel = isOnline ? 'LEAVE MATCH' : 'QUIT TO MENU';
  const quitWarning = isOnline
    ? isHost
      ? 'You are the host: leaving closes the room for everyone.'
      : 'A bot will take over your spot.'
    : 'Your match progress will be lost.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in select-none font-sans"
      role="dialog"
      aria-modal="true"
      aria-label="Paused"
    >
      <div
        className="w-full max-w-sm bg-amber-400 border-4 border-slate-900 rounded-3xl p-6 sm:p-8 flex flex-col items-center gap-3.5 text-slate-950 animate-in zoom-in-95"
        style={{ boxShadow: '10px 10px 0px #0f172a' }}
      >
        <h2 className="font-brand text-5xl uppercase tracking-wider text-slate-950 mb-1">PAUSED</h2>
        {isOnline && (
          <p className="text-xs font-black uppercase tracking-wide text-slate-800 -mt-2 mb-1 text-center">
            Online match keeps running
          </p>
        )}

        {!confirmQuit ? (
          <>
            <button
              autoFocus
              onMouseEnter={handleHover}
              onClick={() => handleClick(onResume)}
              className="w-full py-4 px-6 bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-4 border-slate-900 rounded-2xl font-brand text-2xl uppercase tracking-wider transition active:translate-y-1 active:translate-x-1 flex items-center justify-center gap-3"
              style={{ boxShadow: '5px 5px 0px #0f172a' }}
            >
              <Play className="w-6 h-6 fill-current" />
              RESUME
            </button>

            {onRestart && (
              <button
                onMouseEnter={handleHover}
                onClick={() => handleClick(onRestart)}
                className="w-full py-3 px-6 bg-cyan-400 hover:bg-cyan-300 text-slate-950 border-4 border-slate-900 rounded-2xl font-brand text-xl uppercase tracking-wider transition active:translate-y-1 active:translate-x-1 flex items-center justify-center gap-3"
                style={{ boxShadow: '5px 5px 0px #0f172a' }}
              >
                <RotateCcw className="w-6 h-6 stroke-[3]" />
                RESTART MATCH
              </button>
            )}

            {onShowControls && (
              <button
                onMouseEnter={handleHover}
                onClick={() => handleClick(onShowControls)}
                className="w-full py-3 px-6 bg-white hover:bg-slate-100 text-slate-950 border-4 border-slate-900 rounded-2xl font-brand text-xl uppercase tracking-wider transition active:translate-y-1 active:translate-x-1 flex items-center justify-center gap-3"
                style={{ boxShadow: '5px 5px 0px #0f172a' }}
              >
                <Gamepad2 className="w-6 h-6 stroke-[2.5]" />
                CONTROLS
              </button>
            )}

            <button
              onMouseEnter={handleHover}
              onClick={() => handleClick(() => setConfirmQuit(true))}
              className="w-full py-3 px-6 bg-rose-500 hover:bg-rose-400 text-white border-4 border-slate-900 rounded-2xl font-brand text-xl uppercase tracking-wider transition active:translate-y-1 active:translate-x-1 flex items-center justify-center gap-3"
              style={{ boxShadow: '5px 5px 0px #0f172a' }}
            >
              <Home className="w-6 h-6 stroke-[3]" />
              {quitLabel}
            </button>
          </>
        ) : (
          <>
            <p className="text-center font-bold text-sm text-slate-900">{quitWarning}</p>
            <button
              autoFocus
              onMouseEnter={handleHover}
              onClick={() => handleClick(onQuitToMenu)}
              className="w-full py-3.5 px-6 bg-rose-500 hover:bg-rose-400 text-white border-4 border-slate-900 rounded-2xl font-brand text-xl uppercase tracking-wider transition active:translate-y-1 active:translate-x-1 flex items-center justify-center gap-3"
              style={{ boxShadow: '5px 5px 0px #0f172a' }}
            >
              <Home className="w-6 h-6 stroke-[3]" />
              YES, {quitLabel}
            </button>
            <button
              onMouseEnter={handleHover}
              onClick={() => handleClick(() => setConfirmQuit(false))}
              className="w-full py-3 px-6 bg-white hover:bg-slate-100 text-slate-950 border-4 border-slate-900 rounded-2xl font-brand text-lg uppercase tracking-wider transition"
              style={{ boxShadow: '5px 5px 0px #0f172a' }}
            >
              KEEP PLAYING
            </button>
          </>
        )}

        <p className="text-[11px] font-black uppercase tracking-wider text-slate-800/80">Esc or P to resume</p>
      </div>
    </div>
  );
};
