import React from 'react';
import { Trophy, RotateCcw, Palette } from 'lucide-react';
import { ScoreState, Side } from '../game/types';

interface Props {
  isOpen: boolean;
  score: ScoreState;
  p1Name: string;
  p2Name: string;
  onRematch: () => void;
  onOpenCustomizer: () => void;
}

export const MatchOverModal: React.FC<Props> = ({
  isOpen,
  score,
  p1Name,
  p2Name,
  onRematch,
  onOpenCustomizer,
}) => {
  if (!isOpen || !score.winner) return null;

  const winnerName = score.winner === 'south' ? p1Name : p2Name;
  const isP1Winner = score.winner === 'south';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-zinc-900 border border-amber-500/40 rounded-3xl shadow-2xl p-7 text-white text-center">
        {/* Trophy icon */}
        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-600 to-yellow-400 p-4 shadow-xl shadow-amber-500/25 flex items-center justify-center mb-4">
          <Trophy className="w-12 h-12 text-zinc-950" />
        </div>

        <h2 className="text-2xl font-black tracking-tight text-white mb-1">
          {winnerName} Triumphs!
        </h2>
        <p className="text-xs text-amber-400/90 font-medium uppercase tracking-wider mb-6">
          Padel Tournament Champion
        </p>

        {/* Final Scoreboard */}
        <div className="p-4 bg-zinc-800/80 border border-zinc-700/80 rounded-2xl mb-6 flex items-center justify-around">
          <div className="text-center">
            <div className="text-xs font-semibold text-zinc-400 mb-1">{p1Name}</div>
            <div className={`text-3xl font-black font-mono ${isP1Winner ? 'text-amber-400' : 'text-zinc-500'}`}>
              {score.games[0]}
            </div>
          </div>
          <div className="text-zinc-600 font-bold text-sm uppercase">Games</div>
          <div className="text-center">
            <div className="text-xs font-semibold text-zinc-400 mb-1">{p2Name}</div>
            <div className={`text-3xl font-black font-mono ${!isP1Winner ? 'text-blue-400' : 'text-zinc-500'}`}>
              {score.games[1]}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onRematch}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-zinc-950 font-black rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 transition transform active:scale-98"
          >
            <RotateCcw className="w-5 h-5" />
            Play Rematch
          </button>

          <button
            onClick={onOpenCustomizer}
            className="w-full py-3 bg-zinc-800 hover:bg-zinc-700/80 text-white font-semibold rounded-xl border border-zinc-700 flex items-center justify-center gap-2 transition"
          >
            <Palette className="w-4 h-4 text-amber-400" />
            Customize Outfit & Racket
          </button>
        </div>
      </div>
    </div>
  );
};
