import React from 'react';
import { Trophy, RotateCcw, Home, Users, Frown } from 'lucide-react';
import { ScoreState, Side } from '../game/types';
import { padelAudio } from '../game/audio';

interface Props {
  isOpen: boolean;
  score: ScoreState;
  p1Name: string;
  p2Name: string;
  localSide: Side;
  isOnline?: boolean;
  isHost?: boolean;
  onRematch: () => void;
  onBackToLobby?: () => void;
  onExitToMenu: () => void;
}

export const MatchOverModal: React.FC<Props> = ({
  isOpen,
  score,
  p1Name,
  p2Name,
  localSide,
  isOnline = false,
  isHost = false,
  onRematch,
  onBackToLobby,
  onExitToMenu,
}) => {
  if (!isOpen || !score.winner) return null;

  const youWon = score.winner === localSide;
  const winnerName = score.winner === 'south' ? p1Name : p2Name;
  const canRematch = !isOnline || isHost;
  const click = (fn: () => void) => {
    padelAudio.playClickPop();
    fn();
  };

  return (
    <div
      className="pp-overlay z-50 bg-slate-950/80 backdrop-blur-sm animate-in"
      role="dialog"
      aria-modal="true"
      aria-label="Match over"
    >
      <div
        className={`relative w-full max-w-md border-4 border-slate-900 rounded-3xl p-6 sm:p-7 short:p-4 text-slate-950 text-center animate-in zoom-in-95 ${
          youWon ? 'bg-amber-400' : 'bg-white'
        }`}
        style={{ boxShadow: '10px 10px 0px #0f172a' }}
      >
        <div
          className={`mx-auto w-20 h-20 short:hidden rounded-2xl border-4 border-slate-900 flex items-center justify-center mb-4 ${
            youWon ? 'bg-white' : 'bg-slate-200'
          }`}
          style={{ boxShadow: '4px 4px 0px #0f172a' }}
        >
          {youWon ? <Trophy className="w-11 h-11 text-amber-500" /> : <Frown className="w-11 h-11 text-slate-500" />}
        </div>

        <h2 className="font-brand text-4xl uppercase tracking-wide leading-none mb-1">
          {youWon ? 'Victory!' : 'Defeat'}
        </h2>
        <p className="text-sm font-black uppercase tracking-wider text-slate-700 mb-5 short:mb-3">
          {winnerName} {winnerName.includes('&') ? 'win' : 'wins'} the match
        </p>

        <div
          className="p-3 bg-slate-950 text-white border-4 border-slate-900 rounded-2xl mb-6 short:mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2"
          style={{ boxShadow: '4px 4px 0px #0f172a' }}
        >
          <div className="text-center min-w-0">
            <div className="text-[11px] font-black uppercase text-blue-300 truncate">{p1Name}</div>
            <div className={`font-brand text-4xl ${score.winner === 'south' ? 'text-amber-400' : 'text-slate-500'}`}>
              {score.games[0]}
            </div>
          </div>
          <div className="text-slate-500 font-black text-xs uppercase">Games</div>
          <div className="text-center min-w-0">
            <div className="text-[11px] font-black uppercase text-rose-300 truncate">{p2Name}</div>
            <div className={`font-brand text-4xl ${score.winner === 'north' ? 'text-amber-400' : 'text-slate-500'}`}>
              {score.games[1]}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {canRematch ? (
            <button
              autoFocus
              onClick={() => click(onRematch)}
              className="w-full py-3.5 short:py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-brand text-xl uppercase tracking-wider rounded-2xl border-4 border-slate-900 flex items-center justify-center gap-2 transition active:translate-y-0.5"
              style={{ boxShadow: '4px 4px 0px #0f172a' }}
            >
              <RotateCcw className="w-5 h-5 stroke-[3]" />
              {isOnline ? 'Rematch (everyone)' : 'Play Again'}
            </button>
          ) : (
            <div className="w-full py-3 bg-slate-100 border-4 border-dashed border-slate-400 rounded-2xl font-black text-sm uppercase tracking-wide text-slate-600">
              Waiting for the host to start a rematch…
            </div>
          )}

          {onBackToLobby && (
            <button
              onClick={() => click(onBackToLobby)}
              className="w-full py-3 short:py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-brand text-lg uppercase tracking-wider rounded-2xl border-4 border-slate-900 flex items-center justify-center gap-2 transition"
              style={{ boxShadow: '4px 4px 0px #0f172a' }}
            >
              <Users className="w-5 h-5 stroke-[2.5]" />
              Back to Lobby
            </button>
          )}

          <button
            onClick={() => click(onExitToMenu)}
            className="w-full py-3 short:py-2 bg-white hover:bg-slate-100 text-slate-950 font-brand text-lg uppercase tracking-wider rounded-2xl border-4 border-slate-900 flex items-center justify-center gap-2 transition"
            style={{ boxShadow: '4px 4px 0px #0f172a' }}
          >
            <Home className="w-5 h-5 stroke-[2.5]" />
            {isOnline ? 'Leave Room' : 'Main Menu'}
          </button>
        </div>
      </div>
    </div>
  );
};
