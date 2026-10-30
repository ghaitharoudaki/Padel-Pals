import React, { useState } from 'react';
import {
  Globe2,
  Users,
  Swords,
  Dumbbell,
  Settings,
  MessageSquareHeart,
  Volume2,
  VolumeX,
  Maximize2,
  HelpCircle,
  Play,
  Shirt,
  Sparkles,
  Trophy,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { GameMode, PlayerCustomization } from '../game/types';

interface MainMenuProps {
  onStartMatch: (mode: GameMode) => void;
  onStartPractice: () => void;
  onOpenOnline: () => void;
  onOpenLocker: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenFeedback: () => void;
  onOpenControls: () => void;
  p1Custom: PlayerCustomization;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  activeOutfitName?: string;
  ballSelection?: string;
  arenaStage?: string;
  isFreeplayActive: boolean;
  onToggleFreeplay: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onStartMatch,
  onStartPractice,
  onOpenOnline,
  onOpenLocker,
  onOpenProfile,
  onOpenSettings,
  onOpenFeedback,
  onOpenControls,
  p1Custom,
  audioEnabled,
  onToggleAudio,
  activeOutfitName = 'Home Classic Blue',
  ballSelection = 'Wilson Pro 3D',
  arenaStage = 'Madrid Center Arena',
  isFreeplayActive,
  onToggleFreeplay,
}) => {
  const [activeTab, setActiveTab] = useState<'play' | 'locker' | 'profile' | 'create party'>('play');
  const [localSubMenuOpen, setLocalSubMenuOpen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none flex flex-col justify-between p-4 sm:p-6 lg:p-8 select-none text-white font-sans overflow-hidden">
      {/* 1. TOP NAVIGATION BAR */}
      <div className="pointer-events-auto flex items-center justify-between w-full">
        {/* Left: Game Title Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 shadow-xl">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8] animate-pulse" />
            <span className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-white via-cyan-200 to-amber-300 bg-clip-text text-transparent">
              PADEL PALS
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-cyan-300 border border-cyan-400/30">
              ARCADE
            </span>
          </div>
        </div>

        {/* Center: Rounded Pill Nav Buttons ("play", "locker", "profile", "create party") */}
        <div className="hidden sm:flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/15 p-1 rounded-full shadow-2xl">
          <button
            onClick={() => onStartMatch('2v2')}
            className="px-5 py-1.5 rounded-full text-xs font-black tracking-wide uppercase transition-all duration-150 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/40 hover:brightness-110 active:scale-98 flex items-center gap-1.5"
          >
            <Play className="w-3 h-3 fill-current" />
            Play
          </button>
          <button
            onClick={() => {
              setActiveTab('locker');
              onOpenLocker();
            }}
            className={`px-5 py-1.5 rounded-full text-xs font-black tracking-wide uppercase transition-all duration-150 flex items-center gap-1.5 ${
              activeTab === 'locker'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/40 scale-102'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Shirt className="w-3.5 h-3.5" />
            Locker
          </button>
          <button
            onClick={() => {
              setActiveTab('profile');
              onOpenProfile();
            }}
            className={`px-5 py-1.5 rounded-full text-xs font-black tracking-wide uppercase transition-all duration-150 flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/40 scale-102'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            Profile
          </button>
          <button
            onClick={() => {
              setActiveTab('create party');
              onOpenOnline();
            }}
            className={`px-5 py-1.5 rounded-full text-xs font-black tracking-wide uppercase transition-all duration-150 flex items-center gap-1.5 ${
              activeTab === 'create party'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/40 scale-102'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-amber-400" />
            Create Party
          </button>
        </div>

        {/* Right: Clean System Icons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleAudio}
            className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-white transition shadow-lg"
            title={audioEnabled ? 'Mute SFX' : 'Enable SFX'}
          >
            {audioEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-rose-400" />
            )}
          </button>
          <button
            onClick={onOpenControls}
            className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-cyan-300 transition shadow-lg"
            title="Controls & Shot Guide"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-white transition shadow-lg"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. MAIN BODY: LEFT-SIDE VERTICAL STACKED CARDS (3D preview visible on right) */}
      <div className="flex-1 flex items-center my-auto">
        <div className="pointer-events-auto w-full max-w-sm sm:max-w-md flex flex-col gap-2.5 py-4">
          {/* Header Subtitle */}
          <div className="px-1 text-left">
            <span className="text-[11px] font-black uppercase tracking-widest text-cyan-400">
              SELECT MATCH MODE
            </span>
          </div>

          {/* 1. ONLINE CARD */}
          <button
            onClick={onOpenOnline}
            className="group relative overflow-hidden p-4 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-white/10 hover:border-cyan-400/50 backdrop-blur-xl shadow-xl transition-all duration-200 text-left active:scale-98 flex items-center justify-between"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform shadow-inner">
                <Globe2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-black tracking-wide text-white uppercase group-hover:text-cyan-300 transition-colors">
                    Online
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold uppercase">
                    LIVE
                  </span>
                </div>
                <div className="text-xs text-zinc-400 font-medium">
                  Play matches worldwide with party codes
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
          </button>

          {/* 2. LOCAL CARD (EXPANDABLE: 4 PLAYERS 2v2 DOUBLES OR 1v1) */}
          <div className="relative">
            <div className="w-full group overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-zinc-900/80 hover:from-blue-900/60 hover:to-indigo-900/50 border border-blue-500/30 hover:border-cyan-400/60 backdrop-blur-xl shadow-xl transition-all duration-200 text-left flex items-center justify-between">
              <button
                onClick={() => onStartMatch('2v2')}
                className="flex-1 flex items-center gap-3.5 active:scale-98 transition-transform"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white group-hover:scale-105 transition-transform shadow-lg shadow-blue-500/30">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black tracking-wide text-white uppercase group-hover:text-cyan-300 transition-colors">
                      Local Doubles
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400 text-zinc-950 font-black uppercase">
                      4 PLAYERS
                    </span>
                  </div>
                  <div className="text-xs text-blue-200/80 font-medium">
                    Play 2v2 doubles locally with 3 smart AI bots
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onStartMatch('2v2')}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs uppercase shadow-md shadow-cyan-500/30 active:scale-95 transition"
                >
                  PLAY
                </button>
                <button
                  onClick={() => setLocalSubMenuOpen(prev => !prev)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-cyan-400 transition"
                  title="More modes"
                >
                  <ChevronRight
                    className={`w-5 h-5 transition-transform ${
                      localSubMenuOpen ? 'rotate-90' : 'group-hover:translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Sub-menu options for 4 Players 2v2 Doubles and 1v1 Singles */}
            {localSubMenuOpen && (
              <div className="mt-2 flex flex-col gap-2 pl-4 border-l-2 border-blue-500/40 animate-in fade-in slide-in-from-top-2 duration-200">
                <button
                  onClick={() => onStartMatch('2v2')}
                  className="p-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 border border-cyan-300/40 shadow-lg text-left flex items-center justify-between group active:scale-98"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-amber-300" />
                    <div>
                      <div className="text-sm font-black uppercase tracking-wide text-white flex items-center gap-2">
                        4 Players (2v2 Doubles)
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400 text-black font-black">
                          RECOMMENDED
                        </span>
                      </div>
                      <div className="text-[11px] text-blue-100/80">
                        Teammate & 2 opponents with realistic rotations
                      </div>
                    </div>
                  </div>
                  <Play className="w-4 h-4 text-white fill-current group-hover:translate-x-0.5 transition-transform" />
                </button>

                <button
                  onClick={() => onStartMatch('1v1')}
                  className="p-3.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 border border-white/10 hover:border-emerald-400/40 shadow-lg text-left flex items-center justify-between group active:scale-98"
                >
                  <div className="flex items-center gap-3">
                    <Swords className="w-5 h-5 text-emerald-400" />
                    <div>
                      <div className="text-sm font-black uppercase tracking-wide text-white">
                        1v1 Singles Duel
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Classic duel court coverage
                      </div>
                    </div>
                  </div>
                  <Play className="w-4 h-4 text-zinc-400 group-hover:text-emerald-400 fill-current group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            )}
          </div>

          {/* 3. PRACTICE CARD */}
          <button
            onClick={onStartPractice}
            className="group relative overflow-hidden p-4 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-white/10 hover:border-amber-400/40 backdrop-blur-xl shadow-xl transition-all duration-200 text-left active:scale-98 flex items-center justify-between"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/30 border border-amber-400/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform shadow-inner">
                <Dumbbell className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-black tracking-wide text-white uppercase group-hover:text-amber-300 transition-colors">
                    Practice
                  </span>
                </div>
                <div className="text-xs text-zinc-400 font-medium">
                  Guides & drills / solo back-glass wall rally
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
          </button>

          {/* 4. SYSTEM SETTINGS CARD */}
          <button
            onClick={onOpenSettings}
            className="group relative overflow-hidden p-3.5 rounded-2xl bg-zinc-900/70 hover:bg-zinc-800/80 border border-white/10 hover:border-white/25 backdrop-blur-xl shadow-lg transition-all duration-200 text-left active:scale-98 flex items-center justify-between"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-black tracking-wide text-zinc-200 group-hover:text-white uppercase transition-colors">
                  System Settings
                </span>
                <div className="text-[11px] text-zinc-400">Audio, graphics, camera angle</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </button>

          {/* 5. FEEDBACK & BUG REPORTS CARD */}
          <button
            onClick={onOpenFeedback}
            className="group relative overflow-hidden p-3.5 rounded-2xl bg-zinc-900/70 hover:bg-zinc-800/80 border border-white/10 hover:border-white/25 backdrop-blur-xl shadow-lg transition-all duration-200 text-left active:scale-98 flex items-center justify-between"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                <MessageSquareHeart className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-black tracking-wide text-zinc-200 group-hover:text-white uppercase transition-colors">
                  Feedback & Bug Reports
                </span>
                <div className="text-[11px] text-zinc-400">Share suggestions with the dev team</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </button>
        </div>
      </div>

      {/* 3. BOTTOM STATUS BAR */}
      <div className="pointer-events-auto w-full flex flex-col md:flex-row items-center justify-between gap-3 bg-black/70 backdrop-blur-xl border border-white/15 px-4 sm:px-6 py-2.5 rounded-2xl shadow-2xl">
        {/* Left: Player Profile Badge */}
        <div
          onClick={onOpenProfile}
          className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition group"
        >
          <div className="relative">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-md border border-white/20"
              style={{ backgroundColor: p1Custom.jerseyColor }}
            >
              {p1Custom.name.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-black flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-wide text-white uppercase group-hover:text-cyan-300 transition-colors">
                {p1Custom.name}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 font-mono font-bold">
                PRO 1420
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 font-medium">Rank Tier: Gold Master</div>
          </div>
        </div>

        {/* Center: Equipment & Arena Badges */}
        <div className="hidden lg:flex items-center gap-4 text-xs font-semibold">
          <div
            onClick={onOpenLocker}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition"
          >
            <Shirt className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-zinc-400 text-[10px] uppercase">Outfit:</span>
            <span className="text-white text-xs">{activeOutfitName}</span>
          </div>

          <div
            onClick={onOpenLocker}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-zinc-400 text-[10px] uppercase">Ball:</span>
            <span className="text-white text-xs">{ballSelection}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
            <Globe2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-400 text-[10px] uppercase">Arena:</span>
            <span className="text-white text-xs">{arenaStage}</span>
          </div>
        </div>

        {/* Right: Freeplay Quick Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleFreeplay}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
              isFreeplayActive
                ? 'bg-amber-400 text-zinc-950 shadow-lg shadow-amber-400/30'
                : 'bg-white/10 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${isFreeplayActive ? 'fill-current' : 'text-amber-400'}`} />
            <span>{isFreeplayActive ? 'FREEPLAY ON' : 'FREEPLAY'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
