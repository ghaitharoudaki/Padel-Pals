import React from 'react';
import { Wifi, Activity, Shield, Users, Server, Radio, ArrowUpDown } from 'lucide-react';

export interface NetDebugStats {
  peerId: string | null;
  role: 'HOST' | 'CLIENT';
  slot: 1 | 2 | 3 | 4;
  side: 'south' | 'north';
  team: 'blue' | 'red';
  roomCode: string | null;
  pingMs: number;
  snapshotRateHz: number;
  packetLossPercent: number;
  simulatedLatencyMs: number;
  mode: '1v1' | '2v2';
  connectionStatus: string;
  channelType: string;
}

interface Props {
  visible: boolean;
  onToggle: () => void;
  stats: NetDebugStats;
}

export const NetDebugOverlay: React.FC<Props> = ({ visible, onToggle, stats }) => {
  if (!visible) return null;

  const getPingColor = (ping: number) => {
    if (ping <= 50) return 'text-emerald-400';
    if (ping <= 110) return 'text-yellow-400';
    if (ping <= 180) return 'text-amber-400';
    return 'text-red-400';
  };

  const getLossColor = (loss: number) => {
    if (loss === 0) return 'text-emerald-400';
    if (loss <= 5) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="fixed top-16 right-4 z-50 pointer-events-auto font-mono text-xs animate-in fade-in duration-150 select-none">
      <div className="bg-zinc-950/90 border-2 border-emerald-500/70 rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-zinc-200 backdrop-blur-md w-72 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-1.5 font-black uppercase text-emerald-400 tracking-wider text-[11px]">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span>NET DEBUG (F4)</span>
          </div>
          <button
            onClick={onToggle}
            className="text-zinc-500 hover:text-zinc-300 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800"
          >
            Hide
          </button>
        </div>

        {/* Core Stats */}
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase flex items-center gap-1">
              <Server className="w-3 h-3" /> Role:
            </span>
            <span className="font-bold text-white bg-zinc-800 px-1.5 py-0.5 rounded">
              {stats.role}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase flex items-center gap-1">
              <Users className="w-3 h-3" /> Slot:
            </span>
            <span
              className={`font-bold px-1.5 py-0.5 rounded ${
                stats.team === 'blue'
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                  : 'bg-red-600/30 text-red-300 border border-red-500/40'
              }`}
            >
              P{stats.slot} (Team {stats.team.toUpperCase()} - {stats.side.toUpperCase()})
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase flex items-center gap-1">
              <Shield className="w-3 h-3" /> Room Code:
            </span>
            <span className="font-bold tracking-widest text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
              {stats.roomCode || 'NONE'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase flex items-center gap-1">
              <Wifi className="w-3 h-3" /> RTT / Ping:
            </span>
            <span className={`font-bold ${getPingColor(stats.pingMs)}`}>
              {stats.pingMs} ms {stats.simulatedLatencyMs > 0 && `(+${stats.simulatedLatencyMs}ms sim)`}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase flex items-center gap-1">
              <Activity className="w-3 h-3" /> Snapshot Rate:
            </span>
            <span className="font-bold text-cyan-400">
              {stats.snapshotRateHz} Hz
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> Packet Loss:
            </span>
            <span className={`font-bold ${getLossColor(stats.packetLossPercent)}`}>
              {stats.packetLossPercent.toFixed(1)}%
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase">Mode:</span>
            <span className="font-bold text-zinc-300">
              {stats.mode === '1v1' ? '1v1 Singles' : '2v2 Doubles'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase">Transport:</span>
            <span className="text-[10px] text-zinc-400 truncate max-w-[150px]">
              {stats.channelType}
            </span>
          </div>
        </div>

        {/* Peer ID Footer */}
        {stats.peerId && (
          <div className="pt-2 border-t border-zinc-800 text-[9px] text-zinc-500 truncate">
            Peer: {stats.peerId}
          </div>
        )}
      </div>
    </div>
  );
};
