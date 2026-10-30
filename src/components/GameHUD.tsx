import React, { useState } from 'react';
import { ScoreState, ShotType, GameMode, Side } from '../game/types';
import {
  Volume2,
  VolumeX,
  HelpCircle,
  Palette,
  Users,
  LogOut,
  Zap,
  RotateCcw,
  Sparkles,
  Trophy,
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
}

const SHOT_DETAILS: Record<
  ShotType,
  { label: string; tag: string; badge: string; color: string; bg: string; icon: string; desc: string }
> = {
  flat: {
    label: 'Flat Drive',
    tag: 'POWER DRIVE',
    badge: 'DEFAULT',
    color: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
    bg: 'from-amber-400 to-yellow-500',
    icon: '🎯',
    desc: 'Direct fast shot down the line or cross-court',
  },
  topspin: {
    label: 'Topspin Dip',
    tag: 'TOPSPIN ANGLE',
    badge: 'LATERAL',
    color: 'text-sky-400 border-sky-400/40 bg-sky-400/10',
    bg: 'from-cyan-400 to-blue-500',
    icon: '⚡',
    desc: 'Sharp dipping baseline arc that bounces high',
  },
  slice: {
    label: 'Bandeja Slice',
    tag: 'BANDEJA CUT',
    badge: 'OVERHEAD CUT',
    color: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
    bg: 'from-emerald-400 to-teal-500',
    icon: '🌀',
    desc: 'Low-skidding spin that dies off the back glass',
  },
  smash: {
    label: 'Overhead Smash',
    tag: 'POWER SPIKE',
    badge: 'HIGH BALL',
    color: 'text-rose-400 border-rose-400/40 bg-rose-400/10',
    bg: 'from-rose-500 to-red-600',
    icon: '💥',
    desc: 'High leaping spike driving hard into the opponent turf',
  },
  lob: {
    label: 'Deep Lob',
    tag: 'DEFENSIVE LOB',
    badge: 'HOLD UP/W',
    color: 'text-violet-400 border-violet-400/40 bg-violet-400/10',
    bg: 'from-violet-400 to-purple-600',
    icon: '🌈',
    desc: 'High parabolic arc sailing over opponents to the glass',
  },
  drop: {
    label: 'Drop Shot',
    tag: 'SOFT TOUCH',
    badge: 'HOLD DOWN/S',
    color: 'text-pink-400 border-pink-400/40 bg-pink-400/10',
    bg: 'from-pink-400 to-rose-500',
    icon: '🍃',
    desc: 'Delicate short graze dropping right over the net',
  },
};

export const GameHUD: React.FC<Props> = ({
  score,
  gameMode,
  onChangeMode,
  onExitToMenu,
  currentShot,
  onSelectShot,
  chargePower,
  hitFeedback,
  pointBanner,
  onOpenMultiplayer,
  onOpenCustomizer,
  onOpenControls,
  onRestartMatch,
  p1Name,
  p2Name,
}) => {
  const [audioEnabled, setAudioEnabled] = useState(true);

  const toggleAudio = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    padelAudio.enabled = next;
  };

  const shotInfo = SHOT_DETAILS[currentShot] || SHOT_DETAILS.flat;

  return (
    <>
      {/* 1. TOP HEADER: EXIT BUTTON (LEFT) + NINTENDO-STYLE ARCADE SCORE HUD (CENTER) + ACTIONS (RIGHT) */}
      <div className="fixed top-3 inset-x-0 z-30 flex items-center justify-between px-3 sm:px-6 pointer-events-none select-none">
        {/* Left: Exit to Menu Pill */}
        <div className="pointer-events-auto">
          <button
            onClick={onExitToMenu}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-950/90 hover:bg-zinc-900 text-zinc-200 hover:text-white border-2 border-white/20 hover:border-white/40 rounded-full shadow-2xl backdrop-blur-md transition-all transform active:scale-95 group text-xs font-black uppercase tracking-wider"
            title="Exit match and return to main menu"
          >
            <LogOut className="w-4 h-4 text-rose-400 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>

        {/* Center: Nintendo-Sports Style Arcade Score Bug (Mario Tennis / Switch Sports Inspired) */}
        <div className="pointer-events-auto max-w-lg sm:max-w-xl w-full mx-2">
          <div className="relative bg-zinc-950/95 border-2 border-white/25 rounded-full p-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.7)] backdrop-blur-xl flex items-center justify-between">
            {/* TEAM BLUE (South / Player) */}
            <div className="flex-1 flex items-center gap-2.5 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 rounded-full py-1.5 px-3.5 shadow-md border border-blue-400/40">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white flex items-center justify-center font-black text-sm text-white drop-shadow">
                  {p1Name.charAt(0).toUpperCase()}
                </div>
                {score.servingSide === 'south' && (
                  <div
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-black flex items-center justify-center animate-bounce shadow"
                    title="Serving"
                  >
                    <div className="w-1 h-1 rounded-full bg-black" />
                  </div>
                )}
              </div>

              <div className="text-left flex-1 min-w-0">
                <div className="text-xs font-black uppercase tracking-wider text-white truncate drop-shadow">
                  {p1Name}
                </div>
                <div className="text-[10px] font-black tracking-wide text-blue-200 flex items-center gap-1">
                  <span>GAMES:</span>
                  <span className="text-white bg-black/30 px-1.5 py-0.2 rounded font-mono font-bold">
                    {score.games[0]} / 6
                  </span>
                </div>
              </div>

              {/* Big Tennis Point Display */}
              <div className="min-w-[42px] text-center bg-black/40 px-2 py-0.5 rounded-xl border border-white/20">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  {score.points[0]}
                </span>
              </div>
            </div>

            {/* CENTER MATCH INFO DIVIDER */}
            <div className="px-2.5 flex flex-col items-center justify-center">
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest drop-shadow">
                FIRST TO 6
              </span>
              <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                RALLY {score.rallyCount}
              </div>
            </div>

            {/* TEAM RED (North / Opponent) */}
            <div className="flex-1 flex items-center gap-2.5 bg-gradient-to-l from-rose-700 via-rose-600 to-red-600 rounded-full py-1.5 px-3.5 shadow-md border border-rose-400/40 text-right justify-end">
              {/* Big Tennis Point Display */}
              <div className="min-w-[42px] text-center bg-black/40 px-2 py-0.5 rounded-xl border border-white/20">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  {score.points[1]}
                </span>
              </div>

              <div className="text-right flex-1 min-w-0">
                <div className="text-xs font-black uppercase tracking-wider text-white truncate drop-shadow">
                  {p2Name}
                </div>
                <div className="text-[10px] font-black tracking-wide text-rose-200 flex items-center justify-end gap-1">
                  <span>GAMES:</span>
                  <span className="text-white bg-black/30 px-1.5 py-0.2 rounded font-mono font-bold">
                    {score.games[1]} / 6
                  </span>
                </div>
              </div>

              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white flex items-center justify-center font-black text-sm text-white drop-shadow">
                  {p2Name.charAt(0).toUpperCase()}
                </div>
                {score.servingSide === 'north' && (
                  <div
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-black flex items-center justify-center animate-bounce shadow"
                    title="Serving"
                  >
                    <div className="w-1 h-1 rounded-full bg-black" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Sound & Restart Pills */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={toggleAudio}
            className="p-2.5 rounded-full bg-zinc-950/90 hover:bg-zinc-900 border-2 border-white/20 text-zinc-300 hover:text-white backdrop-blur-md shadow-2xl transition"
            title={audioEnabled ? 'Mute SFX' : 'Enable SFX'}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>
          <button
            onClick={onRestartMatch}
            className="p-2.5 rounded-full bg-zinc-950/90 hover:bg-zinc-900 border-2 border-white/20 text-zinc-300 hover:text-white backdrop-blur-md shadow-2xl transition"
            title="Restart Match"
          >
            <RotateCcw className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </div>

      {/* 2. LARGE POINT SCORED PAUSE NOTIFICATION BANNER (3-Second Freeze Indicator) */}
      {pointBanner && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center animate-in zoom-in-95 fade-in duration-200">
          <div
            className={`px-8 py-5 rounded-3xl border-4 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl flex flex-col items-center gap-2 max-w-md w-full mx-4 ${
              pointBanner.winner === 'south'
                ? 'bg-gradient-to-b from-blue-950/95 via-blue-900/90 to-zinc-950/95 border-blue-400 shadow-blue-500/30'
                : 'bg-gradient-to-b from-rose-950/95 via-rose-900/90 to-zinc-950/95 border-rose-400 shadow-rose-500/30'
            }`}
          >
            {/* Star badge */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400 text-amber-300 text-xs font-black uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>POINT SCORED</span>
              <Sparkles className="w-3.5 h-3.5 fill-current" />
            </div>

            {/* Giant Title */}
            <div className="text-2xl sm:text-3xl font-black uppercase tracking-wide text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] text-center">
              {pointBanner.text}
            </div>

            {/* Reason Subtext */}
            <div className="text-xs sm:text-sm font-bold text-zinc-300 text-center uppercase tracking-wider">
              {pointBanner.subtext}
            </div>

            {/* 3-Second Pause Countdown Bar */}
            <div className="w-full mt-2 flex items-center gap-2">
              <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden border border-white/20">
                <div
                  className={`h-full ${
                    pointBanner.winner === 'south' ? 'bg-cyan-400' : 'bg-rose-400'
                  } animate-[pulse_1s_infinite]`}
                  style={{ width: '100%' }}
                />
              </div>
              <span className="text-[10px] font-mono font-black text-zinc-300">NEXT SERVE IN 3s</span>
            </div>
          </div>
        </div>
      )}

      {/* Hit Feedback Float Banner */}
      {hitFeedback && !pointBanner && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div className="px-5 py-1.5 rounded-full bg-zinc-950/90 border border-amber-400/60 shadow-xl backdrop-blur-md flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
            <span className="text-xs sm:text-sm font-black tracking-wider text-amber-300 uppercase">
              {hitFeedback}
            </span>
          </div>
        </div>
      )}

      {/* 3. BOTTOM-LEFT CORNER: STREAMLINED SHOT TYPE & POWER GAUGE */}
      <div className="fixed bottom-4 left-4 z-30 select-none pointer-events-auto">
        <div className="bg-zinc-950/90 backdrop-blur-md border-2 border-white/20 rounded-2xl shadow-2xl p-3 flex flex-col gap-2.5 text-white max-w-[240px]">
          {/* Active Shot Type Indicator */}
          <div className={`px-3 py-2 rounded-xl border flex items-center gap-2.5 shadow-md ${shotInfo.color}`}>
            <span className="text-xl">{shotInfo.icon}</span>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-wide uppercase text-white">{shotInfo.label}</span>
              </div>
              <div className="text-[10px] text-zinc-300 font-semibold">{shotInfo.tag}</div>
            </div>
          </div>

          {/* Hold & Release Shot Power Gauge */}
          <div className="flex items-center gap-2.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex items-center gap-1 text-[10px] text-zinc-300 font-bold uppercase">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>{Math.round(chargePower * 100)}%</span>
            </div>
            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full bg-gradient-to-r ${shotInfo.bg} transition-all duration-75`}
                style={{ width: `${Math.round(chargePower * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. BOTTOM-RIGHT CORNER: QUICK ACTIONS & CONTROLS CHEAT SHEET */}
      <div className="fixed bottom-4 right-4 z-30 select-none pointer-events-auto">
        <div className="bg-zinc-950/90 backdrop-blur-md border-2 border-white/20 rounded-2xl shadow-2xl p-2.5 flex items-center gap-2 text-white">
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-zinc-400 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/10 mr-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 font-mono font-bold text-[9px]">
              SPACE / CLICK
            </kbd>
            <span>Hit</span>
            <span className="text-zinc-600">•</span>
            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 font-mono font-bold text-[9px]">
              WASD
            </kbd>
            <span>Steer</span>
          </div>

          <button
            onClick={onOpenCustomizer}
            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-zinc-300 hover:text-white transition active:scale-95"
            title="Customize Avatar & Racket"
          >
            <Palette className="w-4 h-4 text-amber-400" />
          </button>

          <button
            onClick={onOpenMultiplayer}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-600/30 transition active:scale-95"
            title="Online Multiplayer Room"
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Online</span>
          </button>

          <button
            onClick={onOpenControls}
            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-zinc-300 hover:text-white transition active:scale-95"
            title="Controls & Rules Guide"
          >
            <HelpCircle className="w-4 h-4 text-indigo-400" />
          </button>
        </div>
      </div>
    </>
  );
};
