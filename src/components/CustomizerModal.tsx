import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE,
  EyeType,
  EyebrowType,
  Eyewear,
  FacialHair,
  HairStyle,
  HeadwearType,
  JerseyStyle,
  MouthType,
  PlayerAppearance,
  RacketPattern,
} from '../game/types';
import { buildPadelAvatar, AvatarController } from '../game/scene/avatar';
import {
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
  Check,
  X,
  Shirt,
  User,
  Smile,
  CircleDot,
  Crown,
  Plus,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  appearance: PlayerAppearance;
  onChange: (app: PlayerAppearance) => void;
}

const STORAGE_KEY = 'padel_pals_player_appearance';

const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'spiky', label: 'Spiky Anime' },
  { id: 'short', label: 'Sport Crop' },
  { id: 'long', label: 'Long Locks' },
  { id: 'ponytail', label: 'High Ponytail' },
  { id: 'bun', label: 'Top Knot Bun' },
  { id: 'mohawk', label: 'Punk Mohawk' },
  { id: 'curly', label: 'Curly Puffs' },
  { id: 'afro', label: 'Big Afro' },
  { id: 'buzz', label: 'Buzz Cut' },
  { id: 'undercut', label: 'Two-Tone Undercut' },
  { id: 'slickback', label: 'Slicked Back' },
  { id: 'side_part', label: 'Side Part' },
  { id: 'wavy', label: 'Wavy Flow' },
  { id: 'braids', label: 'Cornrow Braids' },
  { id: 'pigtails', label: 'Pigtails' },
  { id: 'twin_buns', label: 'Twin Buns' },
  { id: 'dreads', label: 'Dreadlocks' },
  { id: 'bob', label: 'Bob Cut' },
  { id: 'faux_hawk', label: 'Faux Hawk' },
  { id: 'bald', label: 'Clean Shaved' },
];

const EYE_TYPES: { id: EyeType; label: string }[] = [
  { id: 'half_lidded', label: 'Smirk (Reference)' },
  { id: 'confident', label: 'Confident' },
  { id: 'anime', label: 'Anime Sparkle' },
  { id: 'fierce', label: 'Fierce' },
  { id: 'chill', label: 'Chill Closed' },
];

const EYEBROW_TYPES: { id: EyebrowType; label: string }[] = [
  { id: 'angled', label: 'Angled Sharp' },
  { id: 'straight', label: 'Straight Bold' },
  { id: 'soft', label: 'Soft Curved' },
  { id: 'thick', label: 'Thick Manga' },
];

const MOUTH_TYPES: { id: MouthType; label: string }[] = [
  { id: 'smirk', label: 'Side Smirk' },
  { id: 'smile', label: 'Confident Smile' },
  { id: 'open', label: 'Open Grin' },
  { id: 'determined', label: 'Determined' },
];

const HEADWEAR_TYPES: { id: HeadwearType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'headband', label: 'Pro Headband' },
  { id: 'cap', label: 'Tournament Cap' },
  { id: 'sweatband', label: 'Plush Sweatband' },
  { id: 'backwards_cap', label: 'Backwards Cap' },
  { id: 'visor', label: 'Sun Visor' },
  { id: 'bandana', label: 'Bandana' },
  { id: 'beanie', label: 'Pom Beanie' },
];

const FACIAL_HAIR_TYPES: { id: FacialHair; label: string }[] = [
  { id: 'none', label: 'Clean' },
  { id: 'stubble', label: 'Stubble' },
  { id: 'mustache', label: 'Mustache' },
  { id: 'goatee', label: 'Goatee' },
  { id: 'beard', label: 'Full Beard' },
];

const EYEWEAR_TYPES: { id: Eyewear; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'sport_shades', label: 'Sport Shades' },
  { id: 'round_glasses', label: 'Round Glasses' },
  { id: 'square_glasses', label: 'Square Frames' },
  { id: 'goggles', label: 'Pro Goggles' },
];

const JERSEY_STYLES: { id: JerseyStyle; label: string }[] = [
  { id: 'captain', label: 'Captain Uniform' },
  { id: 'classic', label: 'Classic Pro' },
  { id: 'stripes', label: 'Vertical Stripes' },
  { id: 'split', label: 'Dual Split' },
];

const RACKET_PATTERNS: { id: RacketPattern; label: string }[] = [
  { id: 'carbon', label: '12K Carbon' },
  { id: 'clean', label: 'Solid Clean' },
  { id: 'lightning', label: 'Volt Lightning' },
  { id: 'checker', label: 'Championship Check' },
  { id: 'gradient', label: 'Aero Gradient' },
];

const COLOR_PALETTE = [
  { name: 'Red', hex: '#dc2626' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Sky Cyan', hex: '#0284c7' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Gold Yellow', hex: '#d97706' },
  { name: 'Blonde Gold', hex: '#d4af37' },
  { name: 'Dark Brown', hex: '#451a03' },
  { name: 'Obsidian', hex: '#18181b' },
  { name: 'Pure White', hex: '#ffffff' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Pink Volt', hex: '#db2777' },
];

const SKIN_TONES = [
  { name: 'Chibi Fair', hex: '#fed7aa' },
  { name: 'Warm Tan', hex: '#fcd34d' },
  { name: 'Sun Tan', hex: '#f59e0b' },
  { name: 'Caramel', hex: '#d97706' },
  { name: 'Deep Bronze', hex: '#78350f' },
];

type Swatch = { name: string; hex: string };

/** Preset swatches plus a free colour picker for any custom shade. */
const ColorRow: React.FC<{
  label: string;
  value: string | undefined;
  onPick: (hex: string) => void;
  palette?: Swatch[];
}> = ({ label, value, onPick, palette = COLOR_PALETTE }) => {
  const current = (value || '#000000').toLowerCase();
  const isCustom = !palette.some((c) => c.hex.toLowerCase() === current);
  return (
    <div>
      <label className="text-xs font-black uppercase tracking-wider text-zinc-500 mb-2 block">{label}</label>
      <div className="flex flex-wrap gap-2 items-center">
        {palette.map((c) => {
          const selected = c.hex.toLowerCase() === current;
          return (
            <button
              key={c.hex}
              onClick={() => onPick(c.hex)}
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition ${
                selected ? 'border-blue-600 scale-110 shadow-md' : 'border-black/15'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
              aria-label={`${label}: ${c.name}`}
            >
              {selected && <Check className={`w-3.5 h-3.5 ${isLight(c.hex) ? 'text-black' : 'text-white'}`} />}
            </button>
          );
        })}
        <label
          className={`relative w-7 h-7 rounded-full border-2 cursor-pointer overflow-hidden flex items-center justify-center transition ${
            isCustom ? 'border-blue-600 scale-110 shadow-md' : 'border-black/15'
          }`}
          style={{
            background: isCustom
              ? current
              : 'conic-gradient(#ef4444, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #ef4444)',
          }}
          title="Custom colour"
        >
          {isCustom ? (
            <Check className={`w-3.5 h-3.5 ${isLight(current) ? 'text-black' : 'text-white'}`} />
          ) : (
            <Plus className="w-3.5 h-3.5 text-white drop-shadow" />
          )}
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(current) ? current : '#000000'}
            onChange={(e) => onPick(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label={`${label}: custom colour`}
          />
        </label>
      </div>
    </div>
  );
};

function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r * 0.299 + g * 0.587 + b * 0.114 > 170;
}

function OptionGrid<T extends string>({
  label,
  options,
  value,
  onPick,
  cols = 2,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T | undefined;
  onPick: (id: T) => void;
  cols?: number;
}) {
  return (
    <div>
      <label className="text-xs font-black uppercase tracking-wider text-zinc-500 mb-2 block">{label}</label>
      <div className={`grid gap-2 ${cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            className={`p-2.5 rounded-xl border text-left text-xs font-bold transition flex items-center justify-between ${
              value === o.id
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
            }`}
          >
            <span>{o.label}</span>
            {value === o.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export const CustomizerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  appearance,
  onChange,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const avatarControllerRef = useRef<AvatarController | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rotationGroupRef = useRef<THREE.Group | null>(null);

  // Locker controls
  const [spin, setSpin] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'hair' | 'face' | 'jersey' | 'gear'>('jersey');

  // Undo / Redo History Stack
  const [history, setHistory] = useState<PlayerAppearance[]>([appearance]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Synchronize internal state with changes
  const applyChange = (updater: Partial<PlayerAppearance>) => {
    const next: PlayerAppearance = {
      ...appearance,
      ...updater,
      // Sync legacy properties
      jerseyColor: updater.jerseyPrimary || appearance.jerseyPrimary,
      racketSkin: updater.racketPattern || appearance.racketPattern,
    };

    // Update 3D preview
    avatarControllerRef.current?.applyAppearance(next);

    // Save to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}

    onChange(next);

    // Push into history stack
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(next);
    if (newHistory.length > 25) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      avatarControllerRef.current?.applyAppearance(prev);
      onChange(prev);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
      } catch {}
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      avatarControllerRef.current?.applyAppearance(next);
      onChange(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
    }
  };

  const handleRandomize = () => {
    const randomItem = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randomHair = randomItem(HAIR_STYLES).id;
    const randomHairColor = randomItem(['#d4af37', '#18181b', '#451a03', '#dc2626', '#0284c7', '#ffffff']);
    const randomSkin = randomItem(SKIN_TONES).hex;
    const randomEyes = randomItem(EYE_TYPES).id;
    const randomEyebrow = randomItem(EYEBROW_TYPES).id;
    const randomMouth = randomItem(MOUTH_TYPES).id;
    const randomJerseyStyle = randomItem(JERSEY_STYLES).id;
    const randomPrimary = randomItem(['#dc2626', '#2563eb', '#059669', '#18181b', '#7c3aed', '#d97706']);
    const randomSecondary = randomItem(['#18181b', '#ffffff', '#dc2626', '#2563eb']);
    const randomPattern = randomItem(RACKET_PATTERNS).id;
    const randomNumber = Math.floor(Math.random() * 99) + 1;

    applyChange({
      hairStyle: randomHair,
      hairColor: randomHairColor,
      hairSecondaryColor: randomItem(['#451a03', '#18181b', '#dc2626', '#0284c7', '#db2777', '#ffffff']),
      headwear: Math.random() < 0.5 ? 'none' : randomItem(HEADWEAR_TYPES).id,
      headwearColor: randomItem(['#dc2626', '#2563eb', '#18181b', '#ffffff', '#059669']),
      facialHair: Math.random() < 0.6 ? 'none' : randomItem(FACIAL_HAIR_TYPES).id,
      eyewear: Math.random() < 0.6 ? 'none' : randomItem(EYEWEAR_TYPES).id,
      skinTone: randomSkin,
      eyeType: randomEyes,
      eyebrowType: randomEyebrow,
      mouthType: randomMouth,
      jerseyStyle: randomJerseyStyle,
      jerseyPrimary: randomPrimary,
      jerseySecondary: randomSecondary,
      shortsColor: randomItem([randomPrimary, randomSecondary, '#ffffff']),
      socksColor: randomPrimary,
      shoesColor: '#ffffff',
      racketColor: randomPrimary,
      racketPattern: randomPattern,
      wristbandColor: randomSecondary,
      number: randomNumber,
    });
  };

  const handleReset = () => {
    applyChange(DEFAULT_APPEARANCE);
  };

  // Dedicated Three.js Preview Stage (Live Rotating Turntable)
  useEffect(() => {
    if (!isOpen || !mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.set(0, 0.95, 3.8);
    camera.lookAt(0, 0.72, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Ambient & Directional Lights
    const amb = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(amb);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(4, 8, 6);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.6);
    fill.position.set(-4, 3, -2);
    scene.add(fill);

    // Turntable Rotation Group
    const rotationGroup = new THREE.Group();
    scene.add(rotationGroup);
    rotationGroupRef.current = rotationGroup;

    // Padel Pal Chibi Avatar
    const avatar = buildPadelAvatar(appearance, 'south', 0, appearance.number);
    avatarControllerRef.current = avatar;
    avatar.setVisible(true);
    rotationGroup.add(avatar.group);

    // Initial appearance sync
    avatar.applyAppearance(appearance);

    let animationFrameId: number;
    let lastTime = performance.now();
    let currentAngle = 0;

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      if (spin) {
        currentAngle += dt * 1.2;
        rotationGroup.rotation.y = currentAngle;
      }

      // Idle breathing bounce
      avatar.updateKinematics(dt, { x: 0, z: 0 }, 0, false, 'flat', 0);

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    // Drag to rotate character
    let isDragging = false;
    let prevMouseX = 0;
    const dom = renderer.domElement;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      isDragging = true;
      prevMouseX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging || !rotationGroupRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const deltaX = clientX - prevMouseX;
      prevMouseX = clientX;
      currentAngle += deltaX * 0.015;
      rotationGroupRef.current.rotation.y = currentAngle;
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    dom.addEventListener('mousedown', onPointerDown);
    dom.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);

    return () => {
      cancelAnimationFrame(animationFrameId);
      dom.removeEventListener('mousedown', onPointerDown);
      dom.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchend', onPointerUp);
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="pp-overlay z-50 bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-200">
      {/* Exact reference container: Clean bright pastel card layout */}
      <div className="relative w-full max-w-5xl h-[92vh] max-h-[820px] bg-gradient-to-b from-[#eef2f9] to-[#dfe7f3] text-zinc-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/60 animate-in slide-in-from-right-10 duration-250 ease-out">
        
        {/* Subtle background watermark volleyball / padel circles matching reference */}
        <div className="absolute inset-0 pointer-events-none opacity-15 overflow-hidden">
          <div className="absolute top-10 left-12 w-28 h-28 rounded-full border-4 border-zinc-500" />
          <div className="absolute top-28 right-24 w-36 h-36 rounded-full border-4 border-zinc-500" />
          <div className="absolute bottom-20 left-20 w-32 h-32 rounded-full border-4 border-zinc-500" />
          <div className="absolute bottom-16 right-36 w-40 h-40 rounded-full border-4 border-zinc-500" />
        </div>

        {/* TOP BAR (Matches Reference Header) */}
        <div className="relative z-10 flex items-center justify-between gap-2 px-4 sm:px-6 py-4 short:py-2 border-b border-black/5 bg-white/40 backdrop-blur-sm">
          {/* Brand Title: "locker" lowercase */}
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">locker</h1>
          </div>

          {/* Center Pill: "showing: captain uniform" */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex px-4 py-1.5 rounded-full bg-white shadow-sm border border-black/10 items-center gap-2 text-xs sm:text-sm font-bold text-blue-600">
              <User className="w-4 h-4 text-blue-500 fill-current" />
              <span>showing: {appearance.jerseyStyle} uniform</span>
            </div>

            {/* Spin Pill: "spin: off" / "spin: on" */}
            <button
              onClick={() => setSpin(!spin)}
              className={`px-4 py-1.5 rounded-full border text-xs sm:text-sm font-bold flex items-center gap-2 transition shadow-sm active:scale-95 ${
                spin
                  ? 'bg-blue-600 border-blue-600 text-white shadow-blue-500/30'
                  : 'bg-white border-black/10 text-blue-600 hover:bg-blue-50'
              }`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${spin ? 'animate-spin' : ''}`} />
              <span>spin: {spin ? 'on' : 'off'}</span>
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 hover:bg-white text-zinc-600 hover:text-zinc-900 flex items-center justify-center transition shadow-sm border border-black/10"
            aria-label="Close locker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MAIN BODY: Split between 3D Preview (Left/Center) and Customizer Tabs (Right) */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col md:flex-row short:flex-row overflow-hidden">
          
          {/* 3D Character Turntable Preview Stage */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden min-h-[240px] short:min-h-0">
            <div
              ref={mountRef}
              className="w-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center"
            />

            {/* Quick rotation hint */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none text-[11px] font-semibold text-zinc-500/80 bg-white/60 px-3 py-1 rounded-full backdrop-blur-xs">
              Drag to rotate avatar • Click options to preview instantly
            </div>
          </div>

          {/* RIGHT SIDE: CUSTOMIZER OPTIONS PANEL */}
          <div className="w-full md:w-96 short:w-[55%] short:max-w-96 min-h-0 bg-white/85 backdrop-blur-md border-t md:border-t-0 md:border-l short:border-t-0 short:border-l border-black/10 flex flex-col overflow-hidden shadow-lg">
            
            {/* Category Navigation Tabs */}
            <div className="flex border-b border-black/10 bg-zinc-100/70 p-1.5 gap-1">
              <button
                onClick={() => setActiveTab('jersey')}
                className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                  activeTab === 'jersey'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Shirt className="w-3.5 h-3.5" />
                Kit
              </button>
              <button
                onClick={() => setActiveTab('hair')}
                className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                  activeTab === 'hair'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Crown className="w-3.5 h-3.5" />
                Hair
              </button>
              <button
                onClick={() => setActiveTab('face')}
                className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                  activeTab === 'face'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Smile className="w-3.5 h-3.5" />
                Face
              </button>
              <button
                onClick={() => setActiveTab('gear')}
                className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                  activeTab === 'gear'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <CircleDot className="w-3.5 h-3.5" />
                Racket
              </button>
            </div>

            {/* Scrollable Customization Controls */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
              
              {/* TAB 1: KIT & UNIFORM */}
              {activeTab === 'jersey' && (
                <div className="space-y-4">
                  {/* Jersey Style */}
                  <OptionGrid label="Uniform Cut & Style" options={JERSEY_STYLES} value={appearance.jerseyStyle} cols={2} onPick={(id) => applyChange({ jerseyStyle: id })} />

                  {/* Jersey Number */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                        Jersey Number (0-99)
                      </label>
                      <span className="text-sm font-black text-blue-600">#{appearance.number}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={99}
                      value={appearance.number}
                      onChange={(e) => applyChange({ number: parseInt(e.target.value) || 0 })}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  {/* Primary Color */}
                  <ColorRow label="Primary Uniform Color" value={appearance.jerseyPrimary} onPick={(hex) => applyChange({ jerseyPrimary: hex, shortsColor: hex })} />

                  {/* Secondary Color (Stripes & Collar) */}
                  <ColorRow label="Secondary Accent Color" value={appearance.jerseySecondary} onPick={(hex) => applyChange({ jerseySecondary: hex, wristbandColor: hex })} />

                  {/* Shorts Color */}
                  <ColorRow label="Shorts Color" value={appearance.shortsColor} onPick={(hex) => applyChange({ shortsColor: hex })} />
                  <ColorRow label="Socks Color" value={appearance.socksColor} onPick={(hex) => applyChange({ socksColor: hex })} />
                  <ColorRow label="Shoes Color" value={appearance.shoesColor} onPick={(hex) => applyChange({ shoesColor: hex })} />
                  <ColorRow label="Shoe Sole Color" value={appearance.shoesSoleColor} onPick={(hex) => applyChange({ shoesSoleColor: hex })} />
                  <ColorRow label="Wristband Color" value={appearance.wristbandColor} onPick={(hex) => applyChange({ wristbandColor: hex })} />
                </div>
              )}

              {/* TAB 2: HAIR & HEADWEAR */}
              {activeTab === 'hair' && (
                <div className="space-y-4">
                  {/* Hair Style (8+ options) */}
                  <OptionGrid label="Hair Style (3D Meshes)" options={HAIR_STYLES} value={appearance.hairStyle} cols={2} onPick={(id) => applyChange({ hairStyle: id })} />

                  {/* Hair Color */}
                  <ColorRow label="Hair Color" value={appearance.hairColor} onPick={(hex) => applyChange({ hairColor: hex })} />
                  <ColorRow label="Highlight / Two-Tone Color" value={appearance.hairSecondaryColor} onPick={(hex) => applyChange({ hairSecondaryColor: hex })} />

                  {/* Headwear Accessories */}
                  <OptionGrid label="Headwear" options={HEADWEAR_TYPES} value={appearance.headwear} cols={2} onPick={(id) => applyChange({ headwear: id })} />
                  {appearance.headwear !== 'none' && (
                    <ColorRow label="Headwear Color" value={appearance.headwearColor} onPick={(hex) => applyChange({ headwearColor: hex })} />
                  )}
                </div>
              )}

              {/* TAB 3: FACE & SKIN */}
              {activeTab === 'face' && (
                <div className="space-y-4">
                  {/* Skin Tone */}
                  <ColorRow label="Skin Tone" palette={SKIN_TONES} value={appearance.skinTone} onPick={(hex) => applyChange({ skinTone: hex })} />

                  {/* Eyes Expression */}
                  <OptionGrid label="Eyes Expression" options={EYE_TYPES} value={appearance.eyeType} cols={1} onPick={(id) => applyChange({ eyeType: id })} />

                  {/* Mouth Expression */}
                  <OptionGrid label="Mouth Expression" options={MOUTH_TYPES} value={appearance.mouthType} cols={2} onPick={(id) => applyChange({ mouthType: id })} />

                  {/* Eyebrows */}
                  <OptionGrid label="Eyebrows" options={EYEBROW_TYPES} value={appearance.eyebrowType} cols={2} onPick={(id) => applyChange({ eyebrowType: id })} />
                  <OptionGrid label="Facial Hair (uses hair color)" options={FACIAL_HAIR_TYPES} value={appearance.facialHair || 'none'} cols={2} onPick={(id) => applyChange({ facialHair: id })} />
                  <OptionGrid label="Eyewear" options={EYEWEAR_TYPES} value={appearance.eyewear || 'none'} cols={2} onPick={(id) => applyChange({ eyewear: id })} />
                  {(appearance.eyewear || 'none') !== 'none' && (
                    <ColorRow label="Eyewear Frame Color" value={appearance.eyewearColor || '#18181b'} onPick={(hex) => applyChange({ eyewearColor: hex })} />
                  )}
                </div>
              )}

              {/* TAB 4: SOLID PADEL RACKET (NO Strings, Perforated) */}
              {activeTab === 'gear' && (
                <div className="space-y-4">
                  {/* Racket Color */}
                  <ColorRow label="Racket Frame & Face Color" value={appearance.racketColor} onPick={(hex) => applyChange({ racketColor: hex })} />

                  {/* Racket Pattern */}
                  <OptionGrid label="Racket Sweetspot Surface Pattern" options={RACKET_PATTERNS} value={appearance.racketPattern} cols={1} onPick={(id) => applyChange({ racketPattern: id })} />

                  {/* Player Name */}
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-zinc-500 mb-1.5 block">
                      Athlete Name Tag
                    </label>
                    <input
                      type="text"
                      maxLength={14}
                      value={appearance.name}
                      onChange={(e) => applyChange({ name: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-100 border border-zinc-300 rounded-xl font-bold text-zinc-900 focus:outline-none focus:border-blue-600 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Save & Apply Confirmation Button */}
            <div className="p-3 border-t border-black/10 bg-zinc-50">
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider shadow-md shadow-blue-500/20 active:scale-98 transition flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Save & Apply to Game
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM CONTROLS BAR (Matches Reference Image exactly: undo, randomize, reset) */}
        <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-3.5 short:py-1.5 border-t border-black/5 bg-white/40 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {/* "undo" button */}
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className={`px-4 py-1.5 rounded-full border text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95 ${
                historyIndex > 0
                  ? 'bg-white border-black/10 text-blue-600 hover:bg-blue-50'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed'
              }`}
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>undo</span>
            </button>

            {/* "redo" button */}
            {historyIndex < history.length - 1 && (
              <button
                onClick={handleRedo}
                className="px-4 py-1.5 rounded-full border bg-white border-black/10 text-blue-600 hover:bg-blue-50 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span>redo</span>
              </button>
            )}

            {/* "randomize" button */}
            <button
              onClick={handleRandomize}
              className="px-4 py-1.5 rounded-full border bg-white border-black/10 text-blue-600 hover:bg-blue-50 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>randomize</span>
            </button>

            {/* "reset" button */}
            <button
              onClick={handleReset}
              className="px-4 py-1.5 rounded-full border bg-white border-black/10 text-blue-600 hover:bg-blue-50 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>reset</span>
            </button>
          </div>

          <div className="text-xs font-bold text-zinc-500 hidden sm:block">
            Padel Pals • Locker Room
          </div>
        </div>

      </div>
    </div>
  );
};
