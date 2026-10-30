import React from 'react';
import { Difficulty, PlayerState, BallState, ScoreState, GameMode } from '../game/types';
import { Activity, Cpu, Shield, Zap, RefreshCw, X } from 'lucide-react';

interface DebugOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  players: PlayerState[];
  ball: BallState;
  score: ScoreState;
  gameMode: GameMode;
  botDifficulty: Difficulty;
  onChangeDifficulty: (diff: Difficulty) => void;
  fps: number;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({
  isOpen,
  onClose,
  players,
  ball,
  score,
  gameMode,
  botDifficulty,
  onChangeDifficulty,
  fps,
}) => {
  if (!isOpen) return null;

  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z).toFixed(1);

  return (
    <div className="fixed top-4 left-4 z-50 pointer-events-auto bg-black/90 backdrop-blur-xl border border-cyan-400/50 rounded-2xl p-4 text-xs font-mono text-zinc-200 shadow-2xl max-w-xl w-full border-t-2 border-t-cyan-400">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="font-bold tracking-wider text-white uppercase">
            Padel Pals Debug Overlay <span className="text-cyan-400">[F3]</span>
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
            {fps} FPS (60Hz Fixed)
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
          title="Close (F3)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Game & Ball Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 bg-zinc-900/60 p-2.5 rounded-xl border border-white/5">
        <div>
          <span className="text-[10px] text-zinc-500 block uppercase">Mode</span>
          <span className="text-white font-bold">{gameMode} (Doubles)</span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500 block uppercase">Score</span>
          <span className="text-cyan-300 font-bold">
            {score.points[0]} - {score.points[1]} (G: {score.games[0]}-{score.games[1]})
          </span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500 block uppercase">Ball Speed</span>
          <span className="text-amber-300 font-bold">{ballSpeed} m/s</span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500 block uppercase">Ball Status</span>
          <span className={ball.inPlay ? 'text-emerald-400 font-bold' : 'text-zinc-400 font-bold'}>
            {ball.inPlay ? `In Play (B:${ball.bounceCount})` : 'Dead / Waiting Serve'}
          </span>
        </div>
      </div>

      {/* Bot Difficulty Selector */}
      <div className="flex items-center justify-between mb-3 bg-zinc-900/60 px-3 py-2 rounded-xl border border-white/5">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[11px] font-bold text-zinc-300">Bot AI Difficulty:</span>
        </div>
        <div className="flex items-center gap-1.5">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => {
            const active = botDifficulty === d;
            return (
              <button
                key={d}
                onClick={() => onChangeDifficulty(d)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition ${
                  active
                    ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/40'
                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Players Real-Time Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-white/10 text-zinc-500 text-[10px] uppercase">
              <th className="pb-1.5 font-bold">Player</th>
              <th className="pb-1.5 font-bold">Team</th>
              <th className="pb-1.5 font-bold">Type</th>
              <th className="pb-1.5 font-bold">Position (X, Z)</th>
              <th className="pb-1.5 font-bold">Velocity</th>
              <th className="pb-1.5 font-bold">Action / Swing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {players.map((p) => {
              const isBlue = p.team === 'blue';
              const speed = Math.hypot(p.velocity.x, p.velocity.z).toFixed(1);
              return (
                <tr key={p.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-1.5 font-bold flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isBlue ? 'bg-blue-400' : 'bg-red-500'
                      }`}
                    />
                    <span className="text-white">{p.name}</span>
                    <span className="text-zinc-500 text-[9px]">({p.id})</span>
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        isBlue
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                          : 'bg-red-500/20 text-red-300 border border-red-400/30'
                      }`}
                    >
                      {p.team}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        p.role === 'human'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                          : 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                      }`}
                    >
                      {p.role}
                    </span>
                  </td>
                  <td className="py-1.5 text-zinc-300 font-mono">
                    {p.position.x.toFixed(2)}, {p.position.z.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-zinc-300 font-mono">
                    {speed} m/s
                  </td>
                  <td className="py-1.5">
                    {p.isSwinging ? (
                      <span className="text-amber-400 font-bold uppercase flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400 inline" />
                        {p.swingSide} ({p.currentShotType})
                      </span>
                    ) : p.isServing ? (
                      <span className="text-cyan-400 font-bold">Serving</span>
                    ) : speed !== '0.0' ? (
                      <span className="text-zinc-300">Moving</span>
                    ) : (
                      <span className="text-zinc-500">Ready</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-500">
        <span>Press <kbd className="px-1 py-0.5 rounded bg-white/10 text-zinc-300 font-bold">F3</kbd> to toggle debug view</span>
        <span>4-Player Doubles Engine</span>
      </div>
    </div>
  );
};
