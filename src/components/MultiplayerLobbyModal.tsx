import React, { useState } from 'react';
import { Users, Copy, Check, Radio, Play, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onJoinRoom: (roomId: string) => void;
  currentRoomId: string | null;
  playerCount: number;
  mySide: 'south' | 'north';
  isConnected: boolean;
  onStartMatch: () => void;
}

export const MultiplayerLobbyModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onJoinRoom,
  currentRoomId,
  playerCount,
  mySide,
  isConnected,
  onStartMatch,
}) => {
  const [inputRoom, setInputRoom] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (currentRoomId) {
      navigator.clipboard.writeText(currentRoomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const generateRandomRoom = () => {
    const code = 'PADEL-' + Math.floor(1000 + Math.random() * 9000);
    setInputRoom(code);
    onJoinRoom(code);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl p-6 text-white">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
          aria-label="Close multiplayer lobby"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Online Multiplayer</h2>
            <p className="text-xs text-zinc-400">Play real-time 3D Padel against a friend anywhere</p>
          </div>
        </div>

        {!isConnected ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="room-code-input" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                Room Code
              </label>
              <div className="flex gap-2">
                <input
                  id="room-code-input"
                  type="text"
                  placeholder="e.g. PADEL-5821"
                  value={inputRoom}
                  onChange={(e) => setInputRoom(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-2.5 bg-zinc-800/90 border border-zinc-700 rounded-xl text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => inputRoom.trim() && onJoinRoom(inputRoom.trim())}
                  disabled={!inputRoom.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition shadow-lg shadow-blue-600/30"
                >
                  Join
                </button>
              </div>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-zinc-800"></div>
              <span className="flex-shrink mx-4 text-xs font-medium text-zinc-500 uppercase">Or</span>
              <div className="flex-grow border-t border-zinc-800"></div>
            </div>

            <button
              onClick={generateRandomRoom}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700/80 text-white font-medium rounded-xl border border-zinc-700 flex items-center justify-center gap-2 transition"
            >
              <Radio className="w-4 h-4 text-emerald-400" />
              Create New Match Room
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="p-4 bg-zinc-800/80 border border-zinc-700 rounded-xl">
              <div className="text-xs text-zinc-400 font-medium mb-1">Active Room Code</div>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-mono font-bold tracking-wider text-blue-400">
                  {currentRoomId}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-xs rounded-lg transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/60 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">Your Court Side:</span>
                <span className="font-semibold text-emerald-400">
                  {mySide === 'south' ? 'Player 1 (Near Court)' : 'Player 2 (Far Court)'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">Players Connected:</span>
                <span className="font-semibold text-white">
                  {playerCount} / 2 {playerCount === 2 ? '• Ready!' : '• Waiting for friend...'}
                </span>
              </div>
            </div>

            {playerCount < 2 ? (
              <div className="text-center py-2 text-xs text-zinc-400 flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                Share room code with your opponent to begin...
              </div>
            ) : (
              <button
                onClick={onStartMatch}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition transform active:scale-98"
              >
                <Play className="w-5 h-5 fill-current" />
                Start Match Now
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
