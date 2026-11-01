import React, { useState } from 'react';
import {
  Users,
  Copy,
  Check,
  Radio,
  Play,
  X,
  Bot,
  User,
  ShieldAlert,
  ArrowRightLeft,
  Wifi,
  Sparkles,
  Zap,
} from 'lucide-react';
import { LobbySlot } from '../game/multiplayer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreateRoom: (customCode?: string) => void;
  onJoinRoom: (roomId: string) => void;
  onQuickMatch: () => void;
  onSlotChange: (slot: 1 | 2 | 3 | 4) => void;
  onToggleReady: () => void;
  onToggleBotSlot: (slot: 1 | 2 | 3 | 4) => void;
  onFillBots: () => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
  currentRoomId: string | null;
  slots: LobbySlot[];
  mySlot: 1 | 2 | 3 | 4;
  isHost: boolean;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  errorMessage: string | null;
  pingMs: number;
  simulatedLatency: boolean;
  onToggleSimulatedLatency: (enabled: boolean) => void;
}

export const MultiplayerLobbyModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onCreateRoom,
  onJoinRoom,
  onQuickMatch,
  onSlotChange,
  onToggleReady,
  onToggleBotSlot,
  onFillBots,
  onStartMatch,
  onLeaveRoom,
  currentRoomId,
  slots,
  mySlot,
  isHost,
  isConnected,
  connectionStatus,
  errorMessage,
  pingMs,
  simulatedLatency,
  onToggleSimulatedLatency,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (currentRoomId) {
      navigator.clipboard.writeText(currentRoomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getPingColor = (ping: number) => {
    if (ping <= 45) return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
    if (ping <= 100) return 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10';
    if (ping <= 180) return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    return 'text-red-400 border-red-500/40 bg-red-500/10';
  };

  const mySlotObj = slots.find((s) => s.slot === mySlot);
  const isMySlotReady = mySlotObj?.isReady || false;
  const allHumansReady = slots.every((s) => s.isBot || !s.playerId || s.isReady);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-zinc-900 border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 text-white max-h-[92vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white p-2 rounded-2xl border-2 border-black transition active:scale-95 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          aria-label="Close modal"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-blue-600 text-white rounded-2xl border-3 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <Users className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-wide uppercase font-['Lilita_One',sans-serif]">
              Online Multiplayer
            </h2>
            <p className="text-xs text-zinc-400 font-medium">
              Host-authoritative 2v2 Padel with real-time prediction & zero lag
            </p>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-500/20 border-2 border-red-500/50 rounded-2xl flex items-center gap-2 text-red-300 text-sm font-semibold">
            <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Reconnecting Banner */}
        {connectionStatus === 'reconnecting' && (
          <div className="mb-4 p-3 bg-amber-500/20 border-2 border-amber-500/50 rounded-2xl flex items-center gap-2 text-amber-300 text-sm font-semibold animate-pulse">
            <Wifi className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <span>Reconnecting to match...</span>
          </div>
        )}

        {!isConnected && !currentRoomId ? (
          /* ========================================== */
          /* ROOM SELECT / CREATE / JOIN SCREEN        */
          /* ========================================== */
          <div className="space-y-5 overflow-y-auto pr-1">
            {/* Quick Match Block */}
            <div className="p-4 bg-zinc-800/80 border-3 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between">
              <div>
                <div className="font-black text-lg text-emerald-400 uppercase tracking-wide font-['Lilita_One',sans-serif]">
                  Quick Match
                </div>
                <div className="text-xs text-zinc-400">Jump right into an open match or instant host</div>
              </div>
              <button
                onClick={onQuickMatch}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-sm uppercase rounded-xl border-2 border-black transition active:scale-95 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2"
              >
                <Zap className="w-4 h-4 fill-current stroke-[2.5]" />
                Play Now
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Join By Code */}
              <div className="p-4 bg-zinc-800/50 border-3 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    Join by 5-Digit Code
                  </div>
                  <input
                    type="text"
                    maxLength={5}
                    placeholder="e.g. PADEL"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    className="w-full px-4 py-3 bg-zinc-950 border-2 border-zinc-700 rounded-xl text-center text-xl font-mono font-bold tracking-widest text-blue-400 focus:outline-none focus:border-blue-500 mb-3"
                  />
                </div>
                <button
                  onClick={() => inputCode.length >= 4 && onJoinRoom(inputCode)}
                  disabled={inputCode.length < 4}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black text-sm uppercase rounded-xl border-2 border-black transition active:scale-95 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                >
                  Join Room
                </button>
              </div>

              {/* Create Room */}
              <div className="p-4 bg-zinc-800/50 border-3 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    Create Custom Room
                  </div>
                  <div className="text-xs text-zinc-400 mb-4 leading-relaxed">
                    Host a new match with your own 5-character code. You control the room, slots, and bots.
                  </div>
                </div>
                <button
                  onClick={() => onCreateRoom()}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-sm uppercase rounded-xl border-2 border-black transition active:scale-95 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-2"
                >
                  <Radio className="w-4 h-4 stroke-[2.5]" />
                  Create Match
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================== */
          /* ACTIVE 4-SLOT LOBBY SCREEN                 */
          /* ========================================== */
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            {/* Room Info Header */}
            <div className="p-3 bg-zinc-950 border-3 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Room Code:</span>
                <span className="text-2xl font-mono font-black tracking-widest text-blue-400">
                  {currentRoomId}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs rounded-lg border border-zinc-700 transition flex items-center gap-1 text-zinc-300"
                  title="Copy room code"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="text-[10px] uppercase font-bold">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Status & Ping */}
              <div className="flex items-center gap-2">
                <div
                  className={`px-2.5 py-1 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 ${getPingColor(
                    pingMs
                  )}`}
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{pingMs > 0 ? `${pingMs}ms` : 'Local (0ms)'}</span>
                </div>
                <span className="text-xs px-2 py-1 bg-zinc-800 rounded-lg border border-zinc-700 font-bold uppercase text-zinc-300">
                  {isHost ? 'Host' : 'Client'}
                </span>
              </div>
            </div>

            {/* 4-Slot Grid (2 Teams: Blue South vs Red North) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Team Blue (South Court) */}
              <div className="p-3 bg-blue-950/40 border-3 border-blue-600/50 rounded-2xl space-y-2">
                <div className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center justify-between">
                  <span>Team Blue (Near Court)</span>
                  <span className="text-[10px] text-blue-300/70">Receives 1st</span>
                </div>
                {slots
                  .filter((s) => s.team === 'blue')
                  .map((slot) => renderSlotCard(slot))}
              </div>

              {/* Team Red (North Court) */}
              <div className="p-3 bg-red-950/40 border-3 border-red-600/50 rounded-2xl space-y-2">
                <div className="text-xs font-black uppercase tracking-wider text-red-400 flex items-center justify-between">
                  <span>Team Red (Far Court)</span>
                  <span className="text-[10px] text-red-300/70">Serves 1st</span>
                </div>
                {slots
                  .filter((s) => s.team === 'red')
                  .map((slot) => renderSlotCard(slot))}
              </div>
            </div>

            {/* Host Controls */}
            {isHost && (
              <div className="p-3 bg-zinc-800/40 border-2 border-zinc-700/60 rounded-2xl flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-400">
                  Host Controls: Setup remaining slots
                </span>
                <button
                  onClick={onFillBots}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-xs font-bold uppercase rounded-lg border border-zinc-600 flex items-center gap-1.5 transition"
                >
                  <Bot className="w-3.5 h-3.5" />
                  Fill Empty with Bots
                </button>
              </div>
            )}

            {/* Latency & Packet Loss Debug Toggle */}
            <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-medium">
                Simulate Network Latency (150ms + 5% loss)
              </span>
              <button
                onClick={() => onToggleSimulatedLatency(!simulatedLatency)}
                className={`px-2.5 py-1 rounded-lg font-bold uppercase transition ${
                  simulatedLatency
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {simulatedLatency ? 'ON (Simulating)' : 'OFF'}
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onLeaveRoom}
                className="px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold text-xs uppercase rounded-xl border-2 border-black transition active:scale-95 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Leave
              </button>

              <button
                onClick={onToggleReady}
                className={`flex-1 py-3 font-black text-sm uppercase rounded-xl border-2 border-black transition active:scale-95 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${
                  isMySlotReady
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                    : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                }`}
              >
                {isMySlotReady ? '✓ Ready (Click to Unready)' : 'Ready Up!'}
              </button>

              {isHost && (
                <button
                  onClick={onStartMatch}
                  disabled={!allHumansReady}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black text-sm uppercase rounded-xl border-2 border-black transition active:scale-95 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Match
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function renderSlotCard(slot: LobbySlot) {
    const isMe = slot.slot === mySlot && isConnected;
    const isOccupiedByOther = slot.playerId && slot.playerId !== mySlotObj?.playerId;

    return (
      <div
        key={slot.slot}
        className={`p-2.5 rounded-xl border-2 flex items-center justify-between transition ${
          isMe
            ? 'bg-zinc-800 border-amber-400 shadow-[2px_2px_0px_0px_rgba(251,191,36,0.6)]'
            : slot.isBot
            ? 'bg-zinc-900/90 border-zinc-700/60'
            : slot.playerId
            ? 'bg-zinc-800/80 border-zinc-600'
            : 'bg-zinc-900/40 border-dashed border-zinc-700 text-zinc-500'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {/* Avatar Color / Icon Badge */}
          <div
            className="w-8 h-8 rounded-lg border-2 border-black flex items-center justify-center font-bold text-xs"
            style={{
              backgroundColor: slot.appearance.jerseyPrimary || (slot.team === 'blue' ? '#2563eb' : '#dc2626'),
            }}
          >
            {slot.isBot ? (
              <Bot className="w-4 h-4 text-white" />
            ) : slot.playerId ? (
              <User className="w-4 h-4 text-white" />
            ) : (
              <span className="text-zinc-500">?</span>
            )}
          </div>

          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{slot.playerName}</span>
              {isMe && (
                <span className="px-1.5 py-0.2 bg-amber-400 text-zinc-950 font-black text-[9px] rounded uppercase">
                  YOU
                </span>
              )}
              {slot.isHost && (
                <span className="px-1.5 py-0.2 bg-blue-500 text-white font-black text-[9px] rounded uppercase">
                  HOST
                </span>
              )}
            </div>
            <div className="text-[10px] text-zinc-400 capitalize">
              {slot.zone} Zone • {slot.appearance.jerseyStyle || 'uniform'}
            </div>
          </div>
        </div>

        {/* Slot Controls / Status */}
        <div className="flex items-center gap-1.5">
          {slot.isBot ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold">
              BOT
            </span>
          ) : slot.playerId ? (
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                slot.isReady
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              }`}
            >
              {slot.isReady ? 'READY' : 'WAITING'}
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500 font-semibold uppercase">EMPTY</span>
          )}

          {/* Switch slot button if not current slot */}
          {!isMe && !isOccupiedByOther && (
            <button
              onClick={() => onSlotChange(slot.slot)}
              className="p-1 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded border border-zinc-700 transition"
              title="Switch to this slot"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Host toggle bot slot */}
          {isHost && !slot.playerId && (
            <button
              onClick={() => onToggleBotSlot(slot.slot)}
              className="p-1 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded border border-zinc-700 transition text-[10px]"
              title="Toggle Bot/Empty"
            >
              {slot.isBot ? 'Remove' : 'Add Bot'}
            </button>
          )}
        </div>
      </div>
    );
  }
};
