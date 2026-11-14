import React from 'react';
import { ScoreState, ShotType, GameMode, Side } from '../game/types';
import { describeMatchFormat } from '../game/engine/rules';
import { Volume2, VolumeX, HelpCircle, LogOut, Pause, Zap, WifiOff } from 'lucide-react';
import { padelAudio } from '../game/audio';

interface Props {
  score: ScoreState;
  gameMode: GameMode;
  onExitToMenu: () => void;
  onPause: () => void;
  currentShot: ShotType;
  chargePower: number;
  hitFeedback: string | null;
  pointBanner: { text: string; subtext: string; winner: Side } | null;
  onOpenControls: () => void;
  p1Name: string;
  p2Name: string;
  localSide: Side;
  isMyServe: boolean;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  pingMs?: number;
  connectionStatus?: string;
  onlinePlayerLabel?: string;
  onToggleNetDebug?: () => void;
  onTouchJoystick?: (x: number, z: number) => void;
  onTouchHitStart?: () => void;
  onTouchHitEnd?: () => void;
  onTouchLob?: () => void;
  onTouchJump?: () => void;
}

const SHOT_INFO: Record<ShotType, { label: string; icon: string; bg: string }> = {
  flat: { label: 'Flat Drive', icon: '🎯', bg: 'bg-amber-400 text-slate-950' },
  topspin: { label: 'Topspin', icon: '⚡', bg: 'bg-cyan-400 text-slate-950' },
  slice: { label: 'Slice', icon: '🌀', bg: 'bg-emerald-400 text-slate-950' },
  smash: { label: 'Smash', icon: '💥', bg: 'bg-rose-500 text-white' },
  lob: { label: 'Lob', icon: '🌈', bg: 'bg-indigo-400 text-white' },
  drop: { label: 'Drop Shot', icon: '🍃', bg: 'bg-pink-400 text-slate-950' },
  bajada: { label: 'Bajada', icon: '⚡', bg: 'bg-amber-500 text-slate-950' },
};

const CHUNKY = { boxShadow: '3px 3px 0px #0f172a' };

/** True on touch-first devices (phones/tablets), regardless of screen width. */
function useCoarsePointer(): boolean {
  const query = '(pointer: coarse), (any-pointer: coarse) and (hover: none)';
  const [coarse, setCoarse] = React.useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
  );
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setCoarse(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return coarse;
}

/** Phone held upright (narrow portrait screen). */
function usePortraitPhone(): boolean {
  const query = '(orientation: portrait) and (max-width: 600px)';
  const [match, setMatch] = React.useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
  );
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatch(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return match;
}

export const GameHUD: React.FC<Props> = ({
  score,
  gameMode,
  onExitToMenu,
  onPause,
  currentShot,
  chargePower,
  hitFeedback,
  pointBanner,
  onOpenControls,
  p1Name,
  p2Name,
  localSide,
  isMyServe,
  audioEnabled,
  onToggleAudio,
  pingMs,
  connectionStatus,
  onlinePlayerLabel,
  onToggleNetDebug,
  onTouchJoystick,
  onTouchHitStart,
  onTouchHitEnd,
  onTouchLob,
  onTouchJump,
}) => {
  const shot = SHOT_INFO[currentShot] || SHOT_INFO.flat;
  const isOnline = gameMode.startsWith('online');
  const isTouch = useCoarsePointer();
  const [stickActive, setStickActive] = React.useState(false);
  const [stickOffset, setStickOffset] = React.useState({ x: 0, y: 0 });
  const stickBaseRef = React.useRef<HTMLDivElement>(null);
  const ping = pingMs || 0;
  const pingTone = ping <= 60 ? 'text-emerald-400' : ping <= 120 ? 'text-yellow-400' : 'text-rose-400';
  const pingDot = ping <= 60 ? 'bg-emerald-400' : ping <= 120 ? 'bg-yellow-400' : 'bg-rose-400';

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!stickBaseRef.current) return;
    const rect = stickBaseRef.current.getBoundingClientRect();
    const rawDx = e.clientX - (rect.left + rect.width / 2);
    const rawDy = e.clientY - (rect.top + rect.height / 2);
    const maxRadius = 42;
    const dist = Math.min(Math.hypot(rawDx, rawDy), maxRadius);
    const angle = Math.atan2(rawDy, rawDx);
    const offsetX = Math.cos(angle) * dist;
    const offsetY = Math.sin(angle) * dist;
    setStickOffset({ x: offsetX, y: offsetY });
    onTouchJoystick?.(offsetX / maxRadius, offsetY / maxRadius);
  };

  const handlePointerDownStick = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setStickActive(true);
    handleStickMove(e);
  };

  const handlePointerUpStick = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setStickActive(false);
    setStickOffset({ x: 0, y: 0 });
    onTouchJoystick?.(0, 0);
  };

  const formatLabel = describeMatchFormat(score);
  const isPortraitPhone = usePortraitPhone();
  const [showRotateTip, setShowRotateTip] = React.useState(true);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setShowRotateTip(false), 6000);
    return () => window.clearTimeout(timer);
  }, []);
  const youSouth = localSide === 'south';

  const teamBlock = (side: Side) => {
    const isSouth = side === 'south';
    const idx = isSouth ? 0 : 1;
    const name = isSouth ? p1Name : p2Name;
    const isYou = localSide === side;
    const serving = score.servingSide === side;
    return (
      <div
        className={`flex items-center gap-2 px-2 sm:px-3 py-1 rounded-xl border-2 border-slate-900 ${
          isSouth ? 'bg-blue-600 flex-row' : 'bg-rose-600 flex-row-reverse'
        }`}
      >
        <div className={`flex flex-col ${isSouth ? 'items-start' : 'items-end'} min-w-0`}>
          <span className="font-brand text-xs sm:text-sm uppercase tracking-wide truncate max-w-[64px] sm:max-w-[150px] leading-tight">
            {name}
          </span>
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-white/80 leading-none mt-0.5">
            {isYou && <span className="bg-white text-slate-950 px-1 rounded">YOU</span>}
            {serving && (
              <span className="flex items-center gap-0.5 text-amber-300" title="Serving">
                <span className="w-2 h-2 rounded-full bg-amber-300 border border-slate-900" />
                {score.serveAttempt === 2 ? '2ND SERVE' : 'SERVE'}
              </span>
            )}
          </span>
        </div>
        <div
          className="bg-slate-900 px-1.5 sm:px-2 py-0.5 rounded-lg border border-slate-800 font-brand text-[11px] sm:text-xs text-amber-300"
          title="Games"
        >
          {score.games[idx]}
        </div>
        <div className="bg-white text-slate-950 px-2 py-0.5 rounded-lg font-brand text-base sm:text-lg min-w-[34px] text-center border-2 border-slate-900">
          {score.points[idx]}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-30 pointer-events-none select-none font-sans overflow-hidden">
      {/* TOP BAR */}
      <div className="safe-top grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr] items-start gap-2 p-2 sm:p-4 w-full">
        {/* Left: menu, pause, online status */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 justify-self-start max-sm:row-start-2">
          <button
            onMouseEnter={() => padelAudio.playHoverTick()}
            onClick={() => {
              padelAudio.playClickPop();
              onPause();
            }}
            className="w-10 h-10 bg-white hover:bg-slate-100 text-slate-950 border-3 border-slate-900 rounded-xl flex items-center justify-center transition active:scale-95"
            style={CHUNKY}
            title="Pause (Esc / P)"
            aria-label="Pause"
          >
            <Pause className="w-5 h-5 stroke-[2.5] fill-current" />
          </button>
          <button
            onMouseEnter={() => padelAudio.playHoverTick()}
            onClick={() => {
              padelAudio.playBackWhoosh();
              onExitToMenu();
            }}
            className="hidden sm:flex h-10 px-3 bg-white hover:bg-slate-100 text-slate-950 border-3 border-slate-900 rounded-xl font-brand text-sm uppercase tracking-wide items-center gap-2 transition active:scale-95"
            style={CHUNKY}
            title={isOnline ? 'Leave the online match' : 'Quit to main menu'}
          >
            <LogOut className="w-4 h-4 stroke-[2.5]" />
            {isOnline ? 'LEAVE' : 'MENU'}
          </button>

          {isOnline && (
            <button
              onClick={onToggleNetDebug}
              className={`h-8 px-2.5 rounded-xl border-3 border-slate-900 text-xs font-mono font-bold flex items-center gap-1.5 bg-slate-950 transition active:scale-95 ${pingTone}`}
              style={CHUNKY}
              title="Connection quality (F4 for details)"
            >
              {connectionStatus === 'reconnecting' || connectionStatus === 'disconnected' ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-rose-400">{connectionStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE'}</span>
                </>
              ) : (
                <>
                  <span className={`w-2 h-2 rounded-full ${pingDot}`} />
                  <span>{ping}ms</span>
                </>
              )}
            </button>
          )}

          {isOnline && onlinePlayerLabel && (
            <div
              className={`hidden md:block h-8 leading-[1.6rem] px-2.5 rounded-xl border-3 border-slate-900 text-xs font-brand uppercase tracking-wider ${
                localSide === 'south' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'
              }`}
              style={CHUNKY}
            >
              {onlinePlayerLabel}
            </div>
          )}
        </div>

        {/* Center: scoreboard */}
        <div className="pointer-events-auto flex flex-col items-center min-w-0 justify-self-center max-sm:col-span-2 max-sm:row-start-1">
          <div
            className="bg-slate-950 border-4 border-slate-900 rounded-2xl p-1 sm:p-1.5 flex items-center gap-1.5 sm:gap-3 text-white"
            style={{ boxShadow: '4px 4px 0px #0f172a' }}
          >
            {teamBlock(youSouth ? 'south' : 'north')}
            <div className="text-center px-0.5 sm:px-1">
              <div className="font-brand text-[10px] sm:text-xs text-amber-400 tracking-wider whitespace-nowrap">
                {formatLabel}
              </div>
              <div className="text-[9px] sm:text-[10px] font-black text-slate-400 tracking-wider whitespace-nowrap">
                RALLY {score.rallyCount}
              </div>
            </div>
            {teamBlock(youSouth ? 'north' : 'south')}
          </div>

          {pointBanner && (
            <div className="mt-2 animate-in zoom-in-95">
              <div
                className={`py-1.5 px-4 rounded-xl border-3 border-slate-900 font-brand text-sm sm:text-base uppercase flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 text-center ${
                  pointBanner.winner === localSide ? 'bg-amber-400 text-slate-950' : 'bg-rose-500 text-white'
                }`}
                style={CHUNKY}
              >
                <span>{pointBanner.text}</span>
                <span className="text-xs font-bold opacity-90 normal-case sm:uppercase">{pointBanner.subtext}</span>
              </div>
            </div>
          )}

          {hitFeedback && !pointBanner && (
            <div className="mt-1.5 animate-in">
              <span
                className="inline-block py-1 px-3 bg-white text-slate-950 font-brand text-xs uppercase border-2 border-slate-900 rounded-lg"
                style={{ boxShadow: '2px 2px 0px #0f172a' }}
              >
                {hitFeedback}
              </span>
            </div>
          )}
        </div>

        {/* Right: sound + help */}
        <div className="pointer-events-auto flex items-center gap-2 justify-self-end max-sm:row-start-2">
          <button
            onMouseEnter={() => padelAudio.playHoverTick()}
            onClick={onToggleAudio}
            className="w-10 h-10 bg-white hover:bg-slate-100 text-slate-950 border-3 border-slate-900 rounded-xl flex items-center justify-center transition active:scale-95"
            style={CHUNKY}
            title={audioEnabled ? 'Mute' : 'Unmute'}
            aria-label={audioEnabled ? 'Mute' : 'Unmute'}
          >
            {audioEnabled ? (
              <Volume2 className="w-5 h-5 stroke-[2.5]" />
            ) : (
              <VolumeX className="w-5 h-5 stroke-[2.5] text-rose-600" />
            )}
          </button>
          <button
            onMouseEnter={() => padelAudio.playHoverTick()}
            onClick={() => {
              padelAudio.playClickPop();
              onOpenControls();
            }}
            className="w-10 h-10 bg-white hover:bg-slate-100 text-slate-950 border-3 border-slate-900 rounded-xl flex items-center justify-center transition active:scale-95"
            style={CHUNKY}
            title="Controls & rules"
            aria-label="Controls and rules"
          >
            <HelpCircle className="w-5 h-5 stroke-[2.5] text-amber-600" />
          </button>
        </div>
      </div>

      {isTouch && isPortraitPhone && showRotateTip && (
        <div className="fixed left-1/2 -translate-x-1/2 top-[45%] pointer-events-auto animate-slide-up">
          <button
            onClick={() => setShowRotateTip(false)}
            className="bg-slate-950/90 text-white border-3 border-slate-900 rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-wide flex items-center gap-2"
            style={CHUNKY}
          >
            <span className="text-lg">📱↻</span> Rotate for a wider view
          </button>
        </div>
      )}

      {/* SERVE PROMPT */}
      {isMyServe && !pointBanner && (
        <div className={`fixed left-1/2 -translate-x-1/2 pointer-events-none ${isTouch ? 'top-32 sm:top-24 short:top-20' : 'bottom-24'}`}>
          <div
            className="animate-serve-pulse bg-amber-400 text-slate-950 border-4 border-slate-900 rounded-2xl px-4 py-2 font-brand uppercase tracking-wide text-center"
            style={{ boxShadow: '4px 4px 0px #0f172a' }}
          >
            <div className="text-lg sm:text-xl leading-none">Your serve!</div>
            <div className="text-[11px] font-sans font-black mt-1 opacity-80">
              {isTouch ? 'Tap HIT to serve' : 'Press SPACE or click to serve'}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM-LEFT: shot & power, joystick on touch */}
      <div className="fixed safe-bl pointer-events-auto flex flex-col gap-3 short:gap-2 items-start">
        <div
          className={`bg-white border-4 border-slate-900 rounded-2xl text-slate-950 ${
            isTouch ? 'p-1 flex flex-row items-center gap-1.5 w-[150px]' : 'p-2 flex flex-col gap-1.5 min-w-[150px]'
          }`}
          style={{ boxShadow: isTouch ? '3px 3px 0px #0f172a' : '4px 4px 0px #0f172a' }}
        >
          <div
            className={`${isTouch ? 'hidden' : 'flex'} px-2.5 py-1 rounded-xl border-2 border-slate-900 font-brand text-sm uppercase items-center gap-2 ${shot.bg}`}
          >
            <span className="text-base">{shot.icon}</span>
            <span className="leading-none">{shot.label}</span>
          </div>
          <div
            className={`flex items-center gap-2 bg-slate-100 rounded-xl border-2 border-slate-900 ${isTouch ? 'p-1 flex-1' : 'p-1.5'}`}
            title="Shot power"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500 fill-current" />
            <div className="flex-1 h-3 bg-slate-300 rounded-lg overflow-hidden border border-slate-400">
              <div
                className={`h-full transition-all duration-75 ${chargePower >= 0.95 ? 'bg-rose-500' : 'bg-amber-400'}`}
                style={{ width: `${Math.round(chargePower * 100)}%` }}
              />
            </div>
            <span className="font-brand text-xs text-slate-950 w-8 text-right">{Math.round(chargePower * 100)}%</span>
          </div>
        </div>

        {isTouch && (
          <div
            ref={stickBaseRef}
            onPointerDown={handlePointerDownStick}
            onPointerMove={stickActive ? handleStickMove : undefined}
            onPointerUp={handlePointerUpStick}
            onPointerCancel={handlePointerUpStick}
            className="w-28 h-28 short:w-24 short:h-24 rounded-full bg-slate-900/60 backdrop-blur-sm border-4 border-slate-900 relative flex items-center justify-center touch-none select-none"
            style={CHUNKY}
            aria-label="Movement joystick"
          >
            <div
              className={`w-12 h-12 rounded-full border-3 border-slate-900 flex items-center justify-center shadow-lg ${
                stickActive ? 'bg-amber-400' : 'bg-white'
              }`}
              style={{ transform: `translate(${stickOffset.x}px, ${stickOffset.y}px)` }}
            >
              <div className="w-3.5 h-3.5 rounded-full bg-slate-900/30" />
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM-RIGHT: touch buttons or desktop key hints */}
      <div className="fixed safe-br pointer-events-auto flex flex-col items-end gap-3">
        {isTouch ? (
          <div className="flex items-end gap-2.5">
            <div className="flex flex-col gap-2.5 short:gap-2">
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTouchJump?.();
                }}
                className="w-14 h-14 short:w-12 short:h-12 rounded-2xl bg-rose-500 active:bg-rose-600 text-white border-4 border-slate-900 font-brand text-xs uppercase flex flex-col items-center justify-center leading-none transition active:scale-90"
                style={CHUNKY}
                aria-label="Jump for a smash"
              >
                <span className="text-base">💥</span>
                <span>JUMP</span>
              </button>
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTouchLob?.();
                }}
                className="w-14 h-14 short:w-12 short:h-12 rounded-2xl bg-indigo-500 active:bg-indigo-600 text-white border-4 border-slate-900 font-brand text-xs uppercase flex flex-col items-center justify-center leading-none transition active:scale-90"
                style={CHUNKY}
                aria-label="Lob"
              >
                <span className="text-base">🌈</span>
                <span>LOB</span>
              </button>
            </div>
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
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
              className="w-24 h-24 short:w-20 short:h-20 rounded-3xl bg-amber-400 active:bg-amber-500 text-slate-950 border-4 border-slate-900 font-brand text-xl uppercase flex flex-col items-center justify-center leading-none transition active:scale-95 touch-none"
              style={{ boxShadow: '4px 4px 0px #0f172a' }}
              aria-label="Hit (hold to charge)"
            >
              <span className="text-3xl">🎾</span>
              <span className="mt-1 tracking-wider">HIT</span>
            </button>
          </div>
        ) : (
          <div className="pointer-events-none hidden md:block">
            <div
              className="bg-white/95 border-3 border-slate-900 rounded-xl py-1.5 px-3 text-slate-950 font-bold text-[11px] uppercase grid grid-cols-[auto_auto] gap-x-2 gap-y-1 items-center"
              style={CHUNKY}
            >
              <Kbd tone="text-cyan-400">WASD</Kbd>
              <span>Move + aim</span>
              <Kbd tone="text-amber-400">SPACE / CLICK</Kbd>
              <span>Hold, release to hit</span>
              <Kbd tone="text-indigo-400">Q / F</Kbd>
              <span>Lob / drop (hold)</span>
              <Kbd tone="text-rose-400">E</Kbd>
              <span>Jump smash</span>
              <Kbd tone="text-emerald-400">SHIFT</Kbd>
              <span>Sprint</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Kbd: React.FC<{ tone: string; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`bg-slate-900 ${tone} px-1.5 py-0.5 rounded font-mono text-[10px] text-center`}>{children}</span>
);
