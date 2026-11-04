import React, { useState } from 'react';
import {
  Play,
  Shirt,
  Settings,
  HelpCircle,
  Volume2,
  VolumeX,
  Maximize2,
  Users,
  Swords,
  Dumbbell,
  ArrowLeft,
  Globe2,
} from 'lucide-react';
import { GameMode, Difficulty, MatchLength, PlayerCustomization } from '../game/types';
import { padelAudio } from '../game/audio';

interface MainMenuProps {
  screenState?: 'MENU' | 'MODE_SELECT';
  onOpenModeSelect?: () => void;
  onBackToMainMenu?: () => void;
  onStartMatch: (mode: GameMode, difficulty?: Difficulty, matchLength?: MatchLength) => void;
  onStartPractice: () => void;
  onOpenOnline: () => void;
  onOpenLocker: () => void;
  onOpenSettings: () => void;
  onOpenControls: () => void;
  p1Custom: PlayerCustomization;
  audioEnabled: boolean;
  onToggleAudio: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  screenState = 'MENU',
  onOpenModeSelect,
  onBackToMainMenu,
  onStartMatch,
  onStartPractice,
  onOpenOnline,
  onOpenLocker,
  onOpenSettings,
  onOpenControls,
  p1Custom,
  audioEnabled,
  onToggleAudio,
}) => {
  const [playSubMenu, setPlaySubMenu] = useState<'main' | 'bots'>('main');
  const isPlayModalOpen = screenState === 'MODE_SELECT';

  // Play vs Bots configuration state
  const [selectedMode, setSelectedMode] = useState<GameMode>('2v2');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [selectedMatchLength, setSelectedMatchLength] = useState<MatchLength>('1_set');

  const handleHover = () => {
    padelAudio.playHoverTick();
  };

  const handleClick = (action: () => void) => {
    padelAudio.playClickPop();
    action();
  };

  const handleBack = () => {
    padelAudio.playBackWhoosh();
    if (playSubMenu === 'bots') {
      setPlaySubMenu('main');
    } else {
      onBackToMainMenu?.();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <>
      {/* Subtle Cinematic Golden-Hour Vignette */}
      <div className="pointer-events-none fixed inset-0 z-20 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(10,15,29,0.52)_100%)]" />

      {/* Embedded CSS Keyframes for Logo Squash-Drop and Staggered Overshoot Slide-In */}
      <style>{`
        @keyframes menuLogoDropSquash {
          0% {
            opacity: 0;
            transform: translateY(-80px) scale(0.92, 1.25);
          }
          62% {
            opacity: 1;
            transform: translateY(12px) scale(1.14, 0.88);
          }
          82% {
            transform: translateY(-5px) scale(0.97, 1.03);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1, 1);
          }
        }
        @keyframes menuButtonSlideOvershoot {
          0% {
            opacity: 0;
            transform: translateX(-140px) scale(0.92);
          }
          70% {
            opacity: 1;
            transform: translateX(12px) scale(1.02);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
        @keyframes subScreenSlideInRight {
          0% {
            opacity: 0;
            transform: translateX(80px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .anim-logo-drop {
          animation: menuLogoDropSquash 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .anim-btn-1 {
          animation: menuButtonSlideOvershoot 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.06s both;
        }
        .anim-btn-2 {
          animation: menuButtonSlideOvershoot 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.14s both;
        }
        .anim-btn-3 {
          animation: menuButtonSlideOvershoot 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.22s both;
        }
        .anim-btn-4 {
          animation: menuButtonSlideOvershoot 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.30s both;
        }
        .anim-subscreen-in {
          animation: subScreenSlideInRight 0.24s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>

      <div className="absolute inset-0 z-40 pointer-events-none flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden font-sans">
        {/* 1. TOP BAR: LOGO + TAGLINE (LEFT) & COMPACT UTILITY BUTTONS (RIGHT) */}
        <div className="pointer-events-auto flex items-start justify-between w-full">
          {/* LOGO DROPPING IN WITH SQUASH AND STRETCH */}
          <div className="flex flex-col items-start anim-logo-drop">
            <h1
              className="font-brand text-6xl sm:text-7xl lg:text-8xl tracking-wider text-amber-400 uppercase select-none leading-none cursor-default"
              style={{
                WebkitTextStroke: '4px #0f172a',
                filter: 'drop-shadow(6px 6px 0px #0f172a)',
              }}
            >
              PADEL PALS
            </h1>
            {/* ONE Short Tagline Only (No pill chips) */}
            <p className="font-brand text-sm sm:text-base tracking-widest text-amber-300 uppercase drop-shadow mt-1 select-none">
              ARCADE DOUBLES PADEL
            </p>
          </div>

          {/* Right Chunky Utility Block Buttons */}
          <div className="flex items-center gap-3">
            <button
              onMouseEnter={handleHover}
              onClick={() => handleClick(onToggleAudio)}
              className="w-12 h-12 bg-amber-400 hover:bg-amber-300 text-slate-950 border-4 border-slate-900 rounded-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              style={{ boxShadow: '4px 4px 0px #0f172a' }}
              title={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
            >
              {audioEnabled ? (
                <Volume2 className="w-6 h-6 stroke-[2.5]" />
              ) : (
                <VolumeX className="w-6 h-6 stroke-[2.5] text-rose-600" />
              )}
            </button>
            <button
              onMouseEnter={handleHover}
              onClick={() => handleClick(toggleFullscreen)}
              className="w-12 h-12 bg-cyan-400 hover:bg-cyan-300 text-slate-950 border-4 border-slate-900 rounded-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              style={{ boxShadow: '4px 4px 0px #0f172a' }}
              title="Toggle Fullscreen"
            >
              <Maximize2 className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* 2. MAIN MENU VERTICAL LIST (LEFT SIDE - NO SUB-LABELS, LARGE CLEAN ICONS & LABELS) */}
        {!isPlayModalOpen && (
          <div className="pointer-events-auto my-auto flex flex-col gap-4 max-w-xs sm:max-w-sm w-full py-4">
            {/* PLAY BUTTON */}
            <button
              onMouseEnter={handleHover}
              onClick={() => {
                handleClick(() => {
                  setPlaySubMenu('main');
                  onOpenModeSelect?.();
                });
              }}
              className="anim-btn-1 group relative w-full py-4 px-6 bg-amber-400 hover:bg-amber-300 text-slate-950 border-4 border-slate-900 rounded-2xl -rotate-1 hover:rotate-0 hover:scale-102 transition-all active:scale-95 active:translate-y-1 active:translate-x-1 cursor-pointer flex items-center gap-4"
              style={{ boxShadow: '6px 6px 0px #0f172a' }}
            >
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center border-2 border-slate-900 shadow">
                <Play className="w-7 h-7 fill-current ml-0.5" />
              </div>
              <span className="font-brand text-4xl sm:text-5xl uppercase tracking-wide leading-none">
                PLAY
              </span>
            </button>

            {/* LOCKER BUTTON */}
            <button
              onMouseEnter={handleHover}
              onClick={() => handleClick(onOpenLocker)}
              className="anim-btn-2 group relative w-full py-3.5 px-6 bg-rose-500 hover:bg-rose-400 text-white border-4 border-slate-900 rounded-2xl rotate-1 hover:rotate-0 hover:scale-102 transition-all active:scale-95 active:translate-y-1 active:translate-x-1 cursor-pointer flex items-center gap-4"
              style={{ boxShadow: '6px 6px 0px #0f172a' }}
            >
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-rose-400 flex items-center justify-center border-2 border-slate-900 shadow">
                <Shirt className="w-6 h-6 stroke-[2.5]" />
              </div>
              <span className="font-brand text-3xl sm:text-4xl uppercase tracking-wide leading-none">
                LOCKER
              </span>
            </button>

            {/* SETTINGS BUTTON */}
            <button
              onMouseEnter={handleHover}
              onClick={() => handleClick(onOpenSettings)}
              className="anim-btn-3 group relative w-full py-3.5 px-6 bg-cyan-400 hover:bg-cyan-300 text-slate-950 border-4 border-slate-900 rounded-2xl -rotate-1 hover:rotate-0 hover:scale-102 transition-all active:scale-95 active:translate-y-1 active:translate-x-1 cursor-pointer flex items-center gap-4"
              style={{ boxShadow: '6px 6px 0px #0f172a' }}
            >
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-cyan-400 flex items-center justify-center border-2 border-slate-900 shadow">
                <Settings className="w-6 h-6 stroke-[2.5]" />
              </div>
              <span className="font-brand text-3xl sm:text-4xl uppercase tracking-wide leading-none">
                SETTINGS
              </span>
            </button>

            {/* HOW TO PLAY BUTTON */}
            <button
              onMouseEnter={handleHover}
              onClick={() => handleClick(onOpenControls)}
              className="anim-btn-4 group relative w-full py-3.5 px-6 bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-4 border-slate-900 rounded-2xl rotate-1 hover:rotate-0 hover:scale-102 transition-all active:scale-95 active:translate-y-1 active:translate-x-1 cursor-pointer flex items-center gap-4"
              style={{ boxShadow: '6px 6px 0px #0f172a' }}
            >
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center border-2 border-slate-900 shadow">
                <HelpCircle className="w-6 h-6 stroke-[2.5]" />
              </div>
              <span className="font-brand text-3xl sm:text-4xl uppercase tracking-wide leading-none">
                HOW TO PLAY
              </span>
            </button>
          </div>
        )}

        {/* 3. PLAY SUBMENU: 3 BIG TILES (SLIDES IN FROM RIGHT WITH QUICK EASE-OUT) */}
        {isPlayModalOpen && (
          <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150">
            <div
              className="anim-subscreen-in w-full max-w-4xl bg-amber-400 border-4 border-slate-900 rounded-3xl p-6 sm:p-10 relative text-slate-950"
              style={{ boxShadow: '10px 10px 0px #0f172a' }}
            >
              {/* Top Bar inside Play Modal: Title & Back Button */}
              <div className="flex items-center justify-between mb-8">
                <button
                  onMouseEnter={handleHover}
                  onClick={handleBack}
                  className="py-2.5 px-5 bg-white hover:bg-slate-100 text-slate-950 border-4 border-slate-900 rounded-2xl font-black text-sm uppercase flex items-center gap-2 transition active:scale-95 cursor-pointer"
                  style={{ boxShadow: '4px 4px 0px #0f172a' }}
                >
                  <ArrowLeft className="w-5 h-5 stroke-[3]" />
                  BACK
                </button>

                <h2
                  className="font-brand text-4xl sm:text-5xl uppercase tracking-wide text-slate-950 text-center"
                  style={{ WebkitTextStroke: '1px #0f172a' }}
                >
                  {playSubMenu === 'bots' ? 'PLAY VS BOTS' : 'SELECT MATCH MODE'}
                </h2>

                <div className="w-24 hidden sm:block" />
              </div>

              {/* MAIN 3 TILES */}
              {playSubMenu === 'main' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* TILE 1: PLAY ONLINE */}
                  <button
                    onMouseEnter={handleHover}
                    onClick={() => {
                      onBackToMainMenu?.();
                      handleClick(onOpenOnline);
                    }}
                    className="group bg-white hover:bg-slate-50 border-4 border-slate-900 rounded-3xl p-6 text-left flex flex-col justify-between transition-transform hover:-translate-y-1 active:translate-y-1 cursor-pointer"
                    style={{ boxShadow: '6px 6px 0px #0f172a' }}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-cyan-400 text-slate-950 border-4 border-slate-900 flex items-center justify-center mb-6 shadow">
                      <Globe2 className="w-9 h-9 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="font-brand text-3xl uppercase tracking-wide text-slate-950 mb-1">
                        PLAY ONLINE
                      </div>
                      <p className="text-sm font-bold text-slate-700 leading-snug">
                        Create a room, join with party code, or play worldwide!
                      </p>
                    </div>
                    <div className="mt-6 py-2.5 px-4 bg-cyan-400 border-3 border-slate-900 rounded-xl text-center font-black text-xs uppercase tracking-wider text-slate-950 group-hover:bg-cyan-300">
                      ENTER LOBBY →
                    </div>
                  </button>

                  {/* TILE 2: PLAY VS BOTS */}
                  <button
                    onMouseEnter={handleHover}
                    onClick={() => {
                      padelAudio.playClickPop();
                      setPlaySubMenu('bots');
                    }}
                    className="group bg-white hover:bg-slate-50 border-4 border-slate-900 rounded-3xl p-6 text-left flex flex-col justify-between transition-transform hover:-translate-y-1 active:translate-y-1 cursor-pointer"
                    style={{ boxShadow: '6px 6px 0px #0f172a' }}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-rose-500 text-white border-4 border-slate-900 flex items-center justify-center mb-6 shadow">
                      <Users className="w-9 h-9 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="font-brand text-3xl uppercase tracking-wide text-slate-950 mb-1">
                        PLAY VS BOTS
                      </div>
                      <p className="text-sm font-bold text-slate-700 leading-snug">
                        Play 2v2 doubles or 1v1 singles against smart AI bots!
                      </p>
                    </div>
                    <div className="mt-6 py-2.5 px-4 bg-rose-500 border-3 border-slate-900 rounded-xl text-center font-black text-xs uppercase tracking-wider text-white group-hover:bg-rose-400">
                      CONFIGURE MATCH →
                    </div>
                  </button>

                  {/* TILE 3: PRACTICE */}
                  <button
                    onMouseEnter={handleHover}
                    onClick={() => {
                      onBackToMainMenu?.();
                      handleClick(onStartPractice);
                    }}
                    className="group bg-white hover:bg-slate-50 border-4 border-slate-900 rounded-3xl p-6 text-left flex flex-col justify-between transition-transform hover:-translate-y-1 active:translate-y-1 cursor-pointer"
                    style={{ boxShadow: '6px 6px 0px #0f172a' }}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-emerald-400 text-slate-950 border-4 border-slate-900 flex items-center justify-center mb-6 shadow">
                      <Dumbbell className="w-9 h-9 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="font-brand text-3xl uppercase tracking-wide text-slate-950 mb-1">
                        PRACTICE
                      </div>
                      <p className="text-sm font-bold text-slate-700 leading-snug">
                        Solo wall rally drills and underhand serve training!
                      </p>
                    </div>
                    <div className="mt-6 py-2.5 px-4 bg-emerald-400 border-3 border-slate-900 rounded-xl text-center font-black text-xs uppercase tracking-wider text-slate-950 group-hover:bg-emerald-300">
                      START PRACTICE →
                    </div>
                  </button>
                </div>
              )}

              {/* CONFIGURE VS BOTS SUBMENU */}
              {playSubMenu === 'bots' && (
                <div
                  className="bg-white border-4 border-slate-900 rounded-3xl p-6 sm:p-8 space-y-6"
                  style={{ boxShadow: '6px 6px 0px #0f172a' }}
                >
                  {/* 1. Format: 2v2 Doubles vs 1v1 Singles */}
                  <div>
                    <label className="block font-brand text-xl uppercase tracking-wide mb-2 text-slate-900">
                      Match Format
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onMouseEnter={handleHover}
                        onClick={() => {
                          padelAudio.playClickPop();
                          setSelectedMode('2v2');
                        }}
                        className={`py-3.5 px-4 rounded-2xl border-4 border-slate-900 font-brand text-xl uppercase tracking-wide transition flex items-center justify-center gap-3 cursor-pointer ${
                          selectedMode === '2v2'
                            ? 'bg-amber-400 text-slate-950 scale-102'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        style={{ boxShadow: selectedMode === '2v2' ? '4px 4px 0px #0f172a' : 'none' }}
                      >
                        <Users className="w-6 h-6 stroke-[2.5]" />
                        4-Player 2v2 Doubles
                      </button>
                      <button
                        onMouseEnter={handleHover}
                        onClick={() => {
                          padelAudio.playClickPop();
                          setSelectedMode('1v1');
                        }}
                        className={`py-3.5 px-4 rounded-2xl border-4 border-slate-900 font-brand text-xl uppercase tracking-wide transition flex items-center justify-center gap-3 cursor-pointer ${
                          selectedMode === '1v1'
                            ? 'bg-amber-400 text-slate-950 scale-102'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        style={{ boxShadow: selectedMode === '1v1' ? '4px 4px 0px #0f172a' : 'none' }}
                      >
                        <Swords className="w-6 h-6 stroke-[2.5]" />
                        1v1 Singles Duel
                      </button>
                    </div>
                  </div>

                  {/* 2. Bot Difficulty */}
                  <div>
                    <label className="block font-brand text-xl uppercase tracking-wide mb-2 text-slate-900">
                      AI Bot Difficulty
                    </label>
                    <div className="grid grid-cols-3 gap-4">
                      {(['easy', 'medium', 'hard'] as const).map((diff) => (
                        <button
                          key={diff}
                          onMouseEnter={handleHover}
                          onClick={() => {
                            padelAudio.playClickPop();
                            setSelectedDifficulty(diff);
                          }}
                          className={`py-3 px-3 rounded-2xl border-4 border-slate-900 font-brand text-lg uppercase tracking-wide transition text-center cursor-pointer ${
                            selectedDifficulty === diff
                              ? 'bg-rose-500 text-white scale-102'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          style={{ boxShadow: selectedDifficulty === diff ? '4px 4px 0px #0f172a' : 'none' }}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Match Length */}
                  <div>
                    <label className="block font-brand text-xl uppercase tracking-wide mb-2 text-slate-900">
                      Match Length
                    </label>
                    <div className="grid grid-cols-3 gap-4">
                      {(
                        [
                          { id: '1_game', label: '1 Game (Quick)' },
                          { id: '3_games', label: '3 Games' },
                          { id: '1_set', label: '1 Set (6 Games)' },
                        ] as const
                      ).map((len) => (
                        <button
                          key={len.id}
                          onMouseEnter={handleHover}
                          onClick={() => {
                            padelAudio.playClickPop();
                            setSelectedMatchLength(len.id);
                          }}
                          className={`py-3 px-3 rounded-2xl border-4 border-slate-900 font-brand text-base sm:text-lg uppercase tracking-wide transition text-center cursor-pointer ${
                            selectedMatchLength === len.id
                              ? 'bg-cyan-400 text-slate-950 scale-102'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          style={{ boxShadow: selectedMatchLength === len.id ? '4px 4px 0px #0f172a' : 'none' }}
                        >
                          {len.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* BIG START MATCH BUTTON */}
                  <button
                    onMouseEnter={handleHover}
                    onClick={() => {
                      handleClick(() =>
                        onStartMatch(selectedMode, selectedDifficulty, selectedMatchLength)
                      );
                    }}
                    className="w-full py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 border-4 border-slate-900 font-brand text-3xl uppercase tracking-wider transition active:translate-y-1 active:translate-x-1 flex items-center justify-center gap-3 cursor-pointer"
                    style={{ boxShadow: '6px 6px 0px #0f172a' }}
                  >
                    <Play className="w-8 h-8 fill-current" />
                    START MATCH!
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. BOTTOM BAR: ACTIVE PLAYER BADGE ONLY (REMOVED CLUTTER PILLS) */}
        <div className="pointer-events-auto flex items-center justify-between w-full">
          <div
            onClick={() => handleClick(onOpenLocker)}
            className="cursor-pointer group flex items-center gap-3.5 bg-white border-4 border-slate-900 rounded-2xl py-2 px-4 transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
            style={{ boxShadow: '4px 4px 0px #0f172a' }}
            title="Open Character Locker"
          >
            <div
              className="w-10 h-10 rounded-xl border-3 border-slate-900 flex items-center justify-center font-brand text-xl text-white shadow"
              style={{ backgroundColor: p1Custom.jerseyPrimary }}
            >
              {p1Custom.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-brand text-xl uppercase tracking-wide text-slate-950 leading-none group-hover:text-amber-500 transition-colors">
                {p1Custom.name} #{p1Custom.number}
              </div>
              <div className="text-[11px] font-black text-slate-600 uppercase tracking-wider mt-0.5">
                CLICK TO CUSTOMIZE AVATAR
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
