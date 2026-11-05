import React from 'react';
import { ScoreState, ShotType, GameMode, Side } from '../game/types';
import {
  Volume2,
  VolumeX,
  HelpCircle,
  LogOut,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { padelAudio } from '../game/audio';

interface Props {
  score: ScoreState;
  gameMode: GameMode;
  onChangeMode?: (mode: GameMode) => void;
  onExitToMenu: () => void;
  currentShot: ShotType;
  onSelectShot: (shot: ShotType) => void;
  chargePower: number;
  hitFeedback: string | null;
  pointBanner: { text: string; subtext: string; winner: Side } | null;
  onOpenMultiplayer: () => void;
  onOpenCustomizer: () => void;
  onOpenControls: () => void;
  onRestartMatch: () => void;
  p1Name: string;
  p2Name: string;
  pingMs?: number;
  connectionStatus?: string;
  onlinePlayerLabel?: string;
  onToggleNetDebug?: () => void;
  onTouchJoystick?: (x: number, z: number) => void;
  onTouchHitStart?: () => void;
  onTouchHitEnd?: () => void;
  onTouchLob?: () => void;
}

const SHOT_INFO: Record<ShotType, { label: string; icon: string; bg: string }> = {
  flat: { label: 'Flat Drive', icon: '🎯', bg: 'bg-amber-400 text-slate-950' },
  topspin: { label: 'Topspin Dip', icon: '⚡', bg: 'bg-cyan-400 text-slate-950' },
  slice: { label: 'Bandeja Slice', icon: '🌀', bg: 'bg-emerald-400 text-slate-950' },
  smash: { label: 'Overhead Smash', icon: '💥', bg: 'bg-rose-500 text-white' },
  lob: { label: 'Deep Lob', icon: '🌈', bg: 'bg-indigo-400 text-white' },
  drop: { label: 'Drop Shot', icon: '🍃', bg: 'bg-pink-400 text-slate-950' },
  bajada: { label: 'Bajada Return', icon: '⚡', bg: 'bg-amber-500 text-slate-950' },
};

export const GameHUD: React.FC<Props> = ({
  score,
  gameMode,
  onExitToMenu,
  currentShot,
  chargePower,
  hitFeedback,
  pointBanner,
  onOpenControls,
  onRestartMatch,
  p1Name,
  p2Name,
  pingMs,
  connectionStatus,
  onlinePlayerLabel,
  onToggleNetDebug,
  onTouchJoystick,
  onTouchHitStart,
  onTouchHitEnd,
  onTouchLob,
}) => {
  const shot = SHOT_INFO[currentShot] || SHOT_INFO.flat;
  const isOnline = gameMode.startsWith('online');
  const [stickActive, setStickActive] = React.useState(false);
  const [stickOffset, setStickOffset] = React.useState({ x: 0, y: 0 });
  const stickBaseRef = React.useRef<HTMLDivElement>(null);

  const handlePointerDownStick = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setStickActive(true);
    handleStickMove(e);
  };

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!stickBaseRef.current) return;
    const rect = stickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawDx = e.clientX - centerX;
    const rawDy = e.clientY - centerY;
    const maxRadius = 42;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(rawDy, rawDx);
    const offsetX = Math.cos(angle) * clampedDist;
    const offsetY = Math.sin(angle) * clampedDist;

    setStickOffset({ x: offsetX, y: offsetY });
    const normX = offsetX / maxRadius;
    const normZ = offsetY / maxRadius;
    onTouchJoystick?.(normX, normZ);
  };

  const handlePointerUpStick = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setStickActive(false);
    setStickOffset({ x: 0, y: 0 });
    onTouchJoystick?.(0, 0);
  };

  const handleSoundToggle = () => {
    padelAudio.enabled = !padelAudio.enabled;
    if (padelAudio.enabled) {
      padelAudio.playClickPop();
    }
  };

  return (
    <div className="fixed inset-0 z-30 pointer-events-none select-none font-sans overflow-hidden">
      {/* 1. TOP BAR: EXIT (LEFT) + COMPACT SCOREBOARD (CENTER) + UTILITIES (RIGHT) */}
      <div className="flex items-start justify-between p-3 sm:p-5 w-full">
        {/* Left: Exit match button & Ping badge */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onMouseEnter={() => padelAudio.playHoverTick()}
            onClick={() => {
              padelAudio.playBackWhoosh();
              onExitToMenu();
            }}
            className="py-2 px-3.5 bg-white hover:bg-slate-100 text-slate-950 border-3 border-slate-900 rounded-xl font-brand text-sm uppercase tracking-wide flex items-center gap-2 transition active:scale-95"
            style={{ boxShadow: '3px 3px 0px #0f172a' }}
            title="Exit Match to Main Menu"
          >
            <LogOut className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">MENU</span>
          </button>

          {isOnline && (
            <button
              onClick={onToggleNetDebug}
              className={`py-1.5 px-3 rounded-xl border-3 border-slate-900 text-xs font-mono font-bold flex items-center gap-1.5 bg-slate-950 transition active:scale-95 ${
                (pingMs || 0) <= 60
                  ? 'text-emerald-400'
                  : (pingMs || 0) <= 120
                  ? 'text-yellow-400'
                  : 'text-rose-400'
              }`}
              style={{ boxShadow: '3px 3px 0px #0f172a' }}
              title="Click or press F4 to toggle Net Debug"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  (pingMs || 0) <= 60
                    ? 'bg-emerald-400 animate-pulse'
                    : (pingMs || 0) <= 120
                    ? 'bg-yellow-400'
                    : 'bg-rose-400'
                }`}
              />
              <span>{pingMs !== undefined ? `${pingMs}ms` : '0ms'}</span>
              <span className="text-[10px] text-zinc-400 ml-1">F4</span>
            </button>
          )}

          {isOnline && onlinePlayerLabel && (
            <div
              className={`py-1.5 px-3 rounded-xl border-3 border-slate-900 text-xs font-brand uppercase tracking-wider font-black ${
                onlinePlayerLabel.includes('Blue')
                  ? 'bg-blue-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
              style={{ boxShadow: '3px 3px 0px #0f172a' }}
            >
              {onlinePlayerLabel}
            </div>
          )}
        </div>

        {/* Center: Small Minimal Scoreboard (Never obstructs the court) */}
        <div className="pointer-events-auto flex flex-col items-center">
          <div
            className="bg-slate-950 border-4 border-slate-900 rounded-2xl p-1.5 flex items-center gap-3 text-white"
            style={{ boxShadow: '4px 4px 0px #0f172a' }}
          >
            {/* Team South (Player / Blue) */}
            <div className="flex items-center gap-2.5 bg-blue-600 px-3 py-1 rounded-xl border-2 border-slate-900">
              <div className="relative">
                <span className="font-brand text-sm sm:text-base uppercase tracking-wide truncate max-w-[80px] sm:max-w-[110px] block">
                  {p1Name}
                </span>
                {score.servingSide === 'south' && (
                  <div
                    className="absolute -top-1 -right-2 w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900"
                    title="Serving"
                  />
                )}
              </div>
              <div className="bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800 font-brand text-xs text-amber-300">
                G:{score.games[0]}
              </div>
              <div className="bg-white text-slate-950 px-2 py-0.5 rounded-lg font-brand text-base sm:text-lg min-w-[28px] text-center border-2 border-slate-900">
                {score.points[0]}
              </div>
            </div>

            {/* Match Rally Info Divider */}
            <div className="text-center px-1">
              <div className="font-brand text-xs text-amber-400 tracking-wider">
                FIRST TO 6
              </div>
              <div className="text-[10px] font-black text-slate-400 tracking-wider">
                RALLY {score.rallyCount}
              </div>
            </div>

            {/* Team North (Opponent / Red) */}
            <div className="flex items-center gap-2.5 bg-rose-600 px-3 py-1 rounded-xl border-2 border-slate-900">
              <div className="bg-white text-slate-950 px-2 py-0.5 rounded-lg font-brand text-base sm:text-lg min-w-[28px] text-center border-2 border-slate-900">
                {score.points[1]}
              </div>
              <div className="bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800 font-brand text-xs text-amber-300">
                G:{score.games[1]}
              </div>
              <div className="relative">
                <span className="font-brand text-sm sm:text-base uppercase tracking-wide truncate max-w-[80px] sm:max-w-[110px] block">
                  {p2Name}
                </span>
                {score.servingSide === 'north' && (
                  <div
                    className="absolute -top-1 -left-2 w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900"
                    title="Serving"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Minimal Point Scored Toast Banner (Right underneath scoreboard, non-intrusive) */}
          {pointBanner && (
            <div className="mt-2 animate-in zoom-in-95 fade-in duration-150">
              <div
                className={`py-1.5 px-4 rounded-xl border-3 border-slate-900 font-brand text-sm sm:text-base uppercase flex items-center gap-2 ${
                  pointBanner.winner === 'south'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-rose-500 text-white'
                }`}
                style={{ boxShadow: '3px 3px 0px #0f172a' }}
              >
                <span>⚡ {pointBanner.text}</span>
                <span className="text-xs font-bold opacity-90">({pointBanner.subtext})</span>
              </div>
            </div>
          )}

          {/* Minimal Hit Feedback Toast */}
          {hitFeedback && !pointBanner && (
            <div className="mt-1.5 animate-in fade-in duration-100">
              <span
                className="inline-block py-1 px-3 bg-white text-slate-950 font-brand text-xs uppercase border-2 border-slate-900 rounded-lg"
                style={{ boxShadow: '2px 2px 0px #0f172a' }}
              >
                {hitFeedback}
              </span>
            </div>
          )}
        </div>

        {/* Right: Sound, Restart, Controls Guide */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onMouseEnter={() => padelAudio.playHoverTick()}
            onClick={handleSoundToggle}
            className="w-10 h-10 bg-white hover:bg-slate-100 text-slate-950 border-3 border-slate-900 rounded-xl flex items-center justify-center transition active:scale-95"
            style={{ boxShadow: '3px 3px 0px #0f172a' }}
            title={padelAudio.enabled ? 'Mute' : 'Unmute'}
          >
            {padelAudio.enabled ? <Volume2 className="w-5 h-5 stroke-[2.5]" /> : <VolumeX className="w-5 h-5 stroke-[2.5] text-rose-600" />}
          </button>
          <button
            onMouseEnter={() => padelAudio.playHoverTick()}
            onClick={() => {
              padelAudio.playClickPop();
              onRestartMatch();
            }}
            className="w-10 h-10 bg-white hover:bg-slate-100 text-slate-950 border-3 border-slate-900 rounded-xl flex items-center justify-center transition active:scale-95"
            style={{ boxShadow: '3px 3px 0px #0f172a' }}
            title="Restart Match"
          >
            <RotateCcw className="w-5 h-5 stroke-[2.5] text-cyan-600" />
          </button>
          <button
            onMouseEnter={() => padelAudio.playHoverTick()}
            onClick={() => {
              padelAudio.playClickPop();
              onOpenControls();
            }}
            className="w-10 h-10 bg-white hover:bg-slate-100 text-slate-950 border-3 border-slate-900 rounded-xl flex items-center justify-center transition active:scale-95"
            style={{ boxShadow: '3px 3px 0px #0f172a' }}
            title="Controls & Rules Guide"
          >
            <HelpCircle className="w-5 h-5 stroke-[2.5] text-amber-600" />
          </button>
        </div>
      </div>

      {/* 2. BOTTOM-LEFT: JOYSTICK & SHOT/POWER DISPLAY */}
      <div className="fixed bottom-4 left-4 pointer-events-auto flex flex-col gap-3 items-start">
        {/* Compact Active Shot Badge & Power Gauge */}
        <div
          className="bg-white border-4 border-slate-900 rounded-2xl p-2.5 flex flex-col gap-2 text-slate-950 min-w-[170px]"
          style={{ boxShadow: '4px 4px 0px #0f172a' }}
        >
          {/* Active Shot Badge */}
          <div className={`px-2.5 py-1.5 rounded-xl border-2 border-slate-900 font-brand text-sm uppercase flex items-center gap-2 ${shot.bg}`}>
            <span className="text-base">{shot.icon}</span>
            <span className="leading-none">{shot.label}</span>
          </div>

          {/* Shot Power Gauge */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border-2 border-slate-900">
            <Zap className="w-3.5 h-3.5 text-amber-500 fill-current" />
            <div className="flex-1 h-3 bg-slate-300 rounded-lg overflow-hidden border border-slate-400">
              <div
                className="h-full bg-amber-400 transition-all duration-75"
                style={{ width: `${Math.round(chargePower * 100)}%` }}
              />
            </div>
            <span className="font-brand text-xs text-slate-950 w-7 text-right">
              {Math.round(chargePower * 100)}%
            </span>
          </div>
        </div>

        {/* Virtual Joystick (Visible on mobile/touch, supports drag & auto-aim zone steering) */}
        <div
          ref={stickBaseRef}
          onPointerDown={handlePointerDownStick}
          onPointerMove={stickActive ? handleStickMove : undefined}
          onPointerUp={handlePointerUpStick}
          onPointerCancel={handlePointerUpStick}
          className="w-24 h-24 rounded-full bg-slate-900/60 backdrop-blur-sm border-4 border-slate-900 relative flex items-center justify-center touch-none select-none cursor-pointer sm:hidden"
          style={{ boxShadow: '3px 3px 0px #0f172a' }}
          title="Virtual Joystick (Move & 3x2 Aim)"
        >
          {/* Directional ticks on the joystick base */}
          <div className="absolute top-1 text-[9px] font-brand text-slate-300">W</div>
          <div className="absolute bottom-1 text-[9px] font-brand text-slate-300">S</div>
          <div className="absolute left-1.5 text-[9px] font-brand text-slate-300">A</div>
          <div className="absolute right-1.5 text-[9px] font-brand text-slate-300">D</div>

          {/* Thumb Knob */}
          <div
            className={`w-11 h-11 rounded-full border-3 border-slate-900 flex items-center justify-center transition-transform duration-75 shadow-lg ${
              stickActive ? 'bg-amber-400 scale-105' : 'bg-white'
            }`}
            style={{
              transform: `translate(${stickOffset.x}px, ${stickOffset.y}px)`,
            }}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-slate-900/30" />
          </div>
        </div>
      </div>

      {/* 3. BOTTOM-RIGHT: TOUCH ACTION BUTTONS & DESKTOP KEY HINTS */}
      <div className="fixed bottom-4 right-4 pointer-events-auto flex flex-col items-end gap-3">
        {/* On-screen Touch Action Buttons (HIT and LOB) */}
        <div className="flex items-end gap-2.5 sm:hidden">
          {/* LOB Button */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              onTouchLob?.();
            }}
            className="w-14 h-14 rounded-2xl bg-indigo-500 active:bg-indigo-600 text-white border-4 border-slate-900 font-brand text-sm uppercase flex flex-col items-center justify-center leading-none transition active:scale-90"
            style={{ boxShadow: '3px 3px 0px #0f172a' }}
            title="Lob Shot"
          >
            <span className="text-base">🌈</span>
            <span>LOB</span>
          </button>

          {/* HIT Button (Hold to charge power, release to strike) */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              onTouchHitStart?.();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              onTouchHitEnd?.();
            }}
            onPointerCancel={(e) => {
              e.preventDefault();
              onTouchHitEnd?.();
            }}
            className="w-20 h-20 rounded-2xl bg-amber-400 active:bg-amber-500 text-slate-950 border-4 border-slate-900 font-brand text-xl uppercase flex flex-col items-center justify-center leading-none transition active:scale-95"
            style={{ boxShadow: '4px 4px 0px #0f172a' }}
            title="Hit / Hold to Charge"
          >
            <span className="text-2xl">🎾</span>
            <span className="mt-0.5 tracking-wider">HIT</span>
          </button>
        </div>

        {/* Desktop Key Bindings Hint */}
        <div className="pointer-events-none hidden sm:block">
          <div
            className="bg-white border-3 border-slate-900 rounded-xl py-1.5 px-3 text-slate-950 font-bold text-xs uppercase flex items-center gap-2"
            style={{ boxShadow: '3px 3px 0px #0f172a' }}
          >
            <span className="bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded font-mono text-[10px]">
              SPACE / CLICK
            </span>
            <span>Hit</span>
            <span className="text-slate-400">•</span>
            <span className="bg-slate-900 text-indigo-400 px-1.5 py-0.5 rounded font-mono text-[10px]">
              SHIFT
            </span>
            <span>Lob</span>
            <span className="text-slate-400">•</span>
            <span className="bg-slate-900 text-cyan-400 px-1.5 py-0.5 rounded font-mono text-[10px]">
              WASD
            </span>
            <span>Move &amp; 3x2 Aim</span>
          </div>
        </div>
      </div>
    </div>
  );
};
