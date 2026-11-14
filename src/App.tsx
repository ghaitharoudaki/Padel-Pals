import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  AimAssist,
  BallState,
  CameraPreset,
  Difficulty,
  GameMode,
  HitQuality,
  MatchLength,
  PlayerAppearance,
  DEFAULT_APPEARANCE,
  PlayerCustomization,
  PlayerState,
  RoomConfig,
  ScoreState,
  ScreenState,
  ShotType,
  Side,
  Vector3D,
} from './game/types';
import {
  createPlayerState,
  getPlayerRoster,
  setPlayerPosition,
  updatePlayerMovement,
  advancePlayer,
} from './game/engine/player';
import {
  createInitialBall,
  stepBallPhysics,
  strikeBallWithRacket,
  executePadelServe,
  predictBallLanding,
  evaluateContactTiming,
  canPlayerStrikeBall,
} from './game/engine/physics';
import { isBajadaWindow } from './game/engine/ball';
import { arrangeServe, RosterRefs } from './game/engine/serve';
import {
  awardPoint,
  createInitialScoreState,
  getServePosition,
  getServeTargetBox,
  handleServeFault,
  handleLetServe,
} from './game/engine/rules';
import { buildPadelCourt, CourtVisuals } from './game/scene/court';
import { createCrowdSystem } from './game/scene/crowd';
import { buildPadelAvatar, AvatarController } from './game/scene/avatar';
import { updateBotAI } from './game/engine/bot';
import { padelAudio } from './game/audio';
import { FixedTimestepLoop } from './game/engine/loop';
import { CameraController } from './game/scene/camera';
import { AdaptiveResolution, detectDeviceProfile, getQualityOptions } from './game/scene/quality';
import { InputManager, SwingIntent } from './game/engine/input';
import {
  MultiplayerClient,
  LobbySlot,
  ClientInputPacket,
  ConnectionStatus,
  CompactSnapshot,
  MatchFx,
  PointEvent,
  RemoteSwing,
} from './game/net/multiplayer';
import { GameHUD } from './components/GameHUD';
import { DebugOverlay } from './components/DebugOverlay';
import { NetDebugOverlay } from './components/NetDebugOverlay';
import { MultiplayerLobbyModal } from './components/MultiplayerLobbyModal';
import { CustomizerModal } from './components/CustomizerModal';
import { ControlsGuideModal } from './components/ControlsGuideModal';
import { MatchOverModal } from './components/MatchOverModal';
import { MainMenu } from './components/MainMenu';
import { CountdownOverlay } from './components/CountdownOverlay';
import { PauseOverlay } from './components/PauseOverlay';
import { SettingsModal } from './components/SettingsModal';
import {
  TouchControlSize,
  loadTouchControlSize,
  saveTouchControlSize,
  touchControlScale,
} from './components/touchControlSize';

const isSinglesMode = (mode: GameMode): boolean => mode === '1v1' || mode === 'online-1v1';
const isOnlineMode = (mode: GameMode): boolean =>
  mode === 'online' || mode === 'online-1v1' || mode === 'online-2v2';

const SHOT_TYPES: ShotType[] = ['flat', 'topspin', 'slice', 'smash', 'lob', 'drop', 'bajada'];
const QUALITY_RANK: Record<string, number> = { PERFECT: 0, GOOD: 1, EARLY: 2, LATE: 3 };
const QUALITY_POWER: Record<string, number> = { PERFECT: 1.25, GOOD: 1.0, EARLY: 0.95, LATE: 0.85 };
const POINT_RESET_DELAY_MS = 2600;
const SNAPSHOT_INTERVAL_MS = 33;

const stripBotSuffix = (name: string) => name.replace(/\s*\(Bot\)\s*$/i, '').trim();

const loadSavedAppearance = (): PlayerAppearance => {
  try {
    const saved = localStorage.getItem('padel_pals_player_appearance');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_APPEARANCE, ...parsed };
    }
  } catch {}
  return DEFAULT_APPEARANCE;
};

const DEFAULT_P1_CUSTOM: PlayerAppearance = loadSavedAppearance();

const DEFAULT_P2_CUSTOM: PlayerAppearance = {
  ...DEFAULT_APPEARANCE,
  name: 'Alejandro',
  number: 5,
  hairStyle: 'spiky',
  hairColor: '#d4af37',
  eyeType: 'half_lidded',
  eyebrowType: 'angled',
  mouthType: 'smirk',
  jerseyStyle: 'captain',
  jerseyPrimary: '#dc2626',
  jerseySecondary: '#18181b',
  shortsColor: '#dc2626',
  socksColor: '#dc2626',
  shoesColor: '#ffffff',
  racketColor: '#dc2626',
  racketPattern: 'carbon',
};

const DEFAULT_P3_CUSTOM: PlayerAppearance = {
  ...DEFAULT_APPEARANCE,
  name: 'Carlos',
  number: 4,
  hairStyle: 'short',
  hairColor: '#451a03',
  eyeType: 'confident',
  eyebrowType: 'straight',
  mouthType: 'smile',
  jerseyStyle: 'classic',
  jerseyPrimary: '#2563eb',
  jerseySecondary: '#ffffff',
  shortsColor: '#ffffff',
  socksColor: '#2563eb',
  shoesColor: '#ffffff',
  racketColor: '#2563eb',
  racketPattern: 'clean',
};

const DEFAULT_P4_CUSTOM: PlayerAppearance = {
  ...DEFAULT_APPEARANCE,
  name: 'Mateo',
  number: 10,
  hairStyle: 'mohawk',
  hairColor: '#18181b',
  eyeType: 'fierce',
  eyebrowType: 'thick',
  mouthType: 'determined',
  jerseyStyle: 'split',
  jerseyPrimary: '#ef4444',
  jerseySecondary: '#18181b',
  shortsColor: '#18181b',
  socksColor: '#ef4444',
  shoesColor: '#ffffff',
  racketColor: '#ef4444',
  racketPattern: 'lightning',
};

/** Scene-scoped functions the React layer (and network callbacks) call into. */
interface SceneApi {
  executeSwing: (intent: SwingIntent) => void;
  handleRemoteSwing: (swing: RemoteSwing, rttMs: number) => void;
  presentPoint: (event: PointEvent) => void;
  playFx: (fx: MatchFx) => void;
  onClientSnapshot: (snapshot: CompactSnapshot) => void;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [screenState, setScreenState] = useState<ScreenState>('MENU');
  const [gameMode, setGameMode] = useState<GameMode>('2v2');
  const [botDifficulty, setBotDifficulty] = useState<Difficulty>('medium');
  const [currentShot, setCurrentShot] = useState<ShotType>('flat');
  const [chargePower, setChargePower] = useState<number>(0.65);
  const [hitFeedback, setHitFeedback] = useState<string | null>(null);
  const [matchLength, setMatchLength] = useState<MatchLength>('1_set');
  const [goldenPoint, setGoldenPoint] = useState<boolean>(false);
  const [aimAssist, setAimAssist] = useState<AimAssist>(() => {
    try {
      return (localStorage.getItem('padel_aim_assist') as AimAssist) || 'high';
    } catch {
      return 'high';
    }
  });
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(() => {
    try {
      return (localStorage.getItem('padel_camera_preset') as CameraPreset) || 'broadcast';
    } catch {
      return 'broadcast';
    }
  });
  const [score, setScore] = useState<ScoreState>(() => createInitialScoreState('south', '1_set', false));
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [pointBanner, setPointBanner] = useState<{ text: string; subtext: string; winner: Side } | null>(null);
  const [teamNames, setTeamNames] = useState<{ south: string; north: string }>({ south: 'Blue', north: 'Red' });
  const [isMyServe, setIsMyServe] = useState(false);
  const [showControlsOverlay, setShowControlsOverlay] = useState(false);
  const [localSide, setLocalSide] = useState<Side>('south');
  const [touchControlSize, setTouchControlSize] = useState<TouchControlSize>(() => loadTouchControlSize());
  const isTouchDevice =
    typeof window !== 'undefined' &&
    ((typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches) ||
      (navigator.maxTouchPoints || 0) > 0);
  const handleTouchControlSize = (size: TouchControlSize) => {
    setTouchControlSize(size);
    saveTouchControlSize(size);
  };
  const aimAssistRef = useRef<AimAssist>(aimAssist);
  const inputManagerRef = useRef<InputManager | null>(null);

  useEffect(() => {
    aimAssistRef.current = aimAssist;
    try {
      localStorage.setItem('padel_aim_assist', aimAssist);
    } catch {}
  }, [aimAssist]);

  // Debug HUD (F3)
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const showDebugRef = useRef(false);
  const [fps, setFps] = useState<number>(60);
  const [debugPlayers, setDebugPlayers] = useState<PlayerState[]>([]);
  useEffect(() => {
    showDebugRef.current = showDebug;
  }, [showDebug]);

  // Modals
  const [showMultiplayer, setShowMultiplayer] = useState(false);

  // Customization
  const [p1Custom, setP1Custom] = useState<PlayerCustomization>(DEFAULT_P1_CUSTOM);
  const p1CustomRef = useRef<PlayerCustomization>(DEFAULT_P1_CUSTOM);
  useEffect(() => {
    p1CustomRef.current = p1Custom;
    try {
      localStorage.setItem('padel_pals_player_appearance', JSON.stringify(p1Custom));
    } catch {}
  }, [p1Custom]);

  // Guard against double clicks on match start
  const isStartingMatchRef = useRef<boolean>(false);
  const [isMatchTransitioning, setIsMatchTransitioning] = useState<boolean>(false);

  // Multiplayer state
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [lobbySlots, setLobbySlots] = useState<LobbySlot[]>([]);
  const [mySlot, setMySlot] = useState<1 | 2 | 3 | 4>(1);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isNetConnected, setIsNetConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [netErrorMessage, setNetErrorMessage] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState<number>(0);
  const [simulatedLatency, setSimulatedLatency] = useState<boolean>(false);
  const [showNetDebug, setShowNetDebug] = useState<boolean>(false);
  const [isQuickMatching, setIsQuickMatching] = useState(false);
  const [roomConfig, setRoomConfig] = useState<RoomConfig>({
    mode: '2v2',
    matchLength: '1_set',
    difficulty: 'pro',
    onClientLeave: 'replace_with_bot',
    goldenPoint: false,
  });

  // F4 Key listener for Net Debug Overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        setShowNetDebug((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Authoritative player slots
  const p1Ref = useRef<PlayerState>(
    createPlayerState({
      id: 'p1',
      slot: 1,
      name: DEFAULT_P1_CUSTOM.name,
      side: 'south',
      team: 'blue',
      zone: 'left',
      isBot: false,
      position: { x: -2.0, y: 0, z: 7.2 },
      customization: DEFAULT_P1_CUSTOM,
    })
  );
  const p2Ref = useRef<PlayerState>(
    createPlayerState({
      id: 'p2',
      slot: 2,
      name: 'Alejandro',
      side: 'north',
      team: 'red',
      zone: 'left',
      isBot: true,
      position: { x: -2.0, y: 0, z: -7.2 },
      customization: DEFAULT_P2_CUSTOM,
    })
  );
  const p3Ref = useRef<PlayerState>(
    createPlayerState({
      id: 'p3',
      slot: 3,
      name: 'Carlos',
      side: 'south',
      team: 'blue',
      zone: 'right',
      isBot: true,
      position: { x: 2.0, y: 0, z: 7.2 },
      customization: DEFAULT_P3_CUSTOM,
    })
  );
  const p4Ref = useRef<PlayerState>(
    createPlayerState({
      id: 'p4',
      slot: 4,
      name: 'Mateo',
      side: 'north',
      team: 'red',
      zone: 'right',
      isBot: true,
      position: { x: 2.0, y: 0, z: -7.2 },
      customization: DEFAULT_P4_CUSTOM,
    })
  );
  const roster = (): RosterRefs => ({ p1: p1Ref.current, p2: p2Ref.current, p3: p3Ref.current, p4: p4Ref.current });

  const ballRef = useRef<BallState>(createInitialBall('south'));
  const scoreRef = useRef<ScoreState>(score);
  const currentShotRef = useRef<ShotType>(currentShot);
  const chargePowerRef = useRef<number>(chargePower);
  const gameModeRef = useRef<GameMode>(gameMode);
  const screenStateRef = useRef<ScreenState>(screenState);
  const botDifficultyRef = useRef<Difficulty>(botDifficulty);
  const cameraPresetRef = useRef<CameraPreset>(cameraPreset);
  const cameraControllerRef = useRef<CameraController | null>(null);
  const teamNamesRef = useRef(teamNames);
  const serveReadyAtRef = useRef<number>(0);
  const remoteInputsRef = useRef<Partial<Record<1 | 2 | 3 | 4, ClientInputPacket & { receivedAt: number }>>>({});
  const sceneApiRef = useRef<SceneApi | null>(null);

  // Hit-stop freeze frame and slow-motion for bajada (offline only)
  const hitStopUntilRef = useRef<number>(0);
  const slowMotionUntilRef = useRef<number>(0);
  const slowMotionFactorRef = useRef<number>(1.0);

  // Sync refs
  useEffect(() => {
    screenStateRef.current = screenState;
  }, [screenState]);
  useEffect(() => {
    currentShotRef.current = currentShot;
  }, [currentShot]);
  useEffect(() => {
    chargePowerRef.current = chargePower;
  }, [chargePower]);
  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);
  useEffect(() => {
    botDifficultyRef.current = botDifficulty;
  }, [botDifficulty]);
  useEffect(() => {
    teamNamesRef.current = teamNames;
  }, [teamNames]);
  useEffect(() => {
    cameraPresetRef.current = cameraPreset;
    cameraControllerRef.current?.setPreset(cameraPreset);
    try {
      localStorage.setItem('padel_camera_preset', cameraPreset);
    } catch {}
  }, [cameraPreset]);

  const changeScreen = useCallback((next: ScreenState) => {
    screenStateRef.current = next;
    setScreenState(next);
  }, []);

  const mouseAimRef = useRef<Vector3D>({ x: 0, y: 0, z: -6.0 });
  const multiplayerClientRef = useRef<MultiplayerClient | null>(null);
  const pointResetTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const isFrozenRef = useRef<boolean>(false);
  const avatarsRef = useRef<Record<string, AvatarController>>({});

  // Spark burst callback
  const triggerSparkBurstRef = useRef<((pos: Vector3D) => void) | null>(null);

  const triggerHitFeedback = (text: string) => {
    setHitFeedback(text);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      feedbackTimerRef.current = null;
      setHitFeedback(null);
    }, 1200);
  };

  const toggleSound = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    padelAudio.enabled = next;
  };

  const isMenuScreen = (s: ScreenState): boolean =>
    s === 'BOOT' || s === 'MENU' || s === 'MODE_SELECT' || s === 'LOCKER' || s === 'SETTINGS' || s === 'HOW_TO_PLAY';

  /** Team labels for scoreboards/banners, e.g. "Kage & Carlos" in doubles. */
  const refreshTeamNames = (mode: GameMode = gameModeRef.current) => {
    const doubles = !isSinglesMode(mode);
    const n = (p: PlayerState) => stripBotSuffix(p.name || p.customization.name || 'Player');
    const next = {
      south: doubles ? `${n(p1Ref.current)} & ${n(p3Ref.current)}` : n(p1Ref.current),
      north: doubles ? `${n(p2Ref.current)} & ${n(p4Ref.current)}` : n(p2Ref.current),
    };
    teamNamesRef.current = next;
    setTeamNames(next);
  };

  /** Put the local player's own look back on the roster after leaving an online room. */
  const restoreLocalRoster = () => {
    const local = p1CustomRef.current;
    const defs: Array<[PlayerState, PlayerAppearance, string]> = [
      [p1Ref.current, local, 'p1'],
      [p2Ref.current, DEFAULT_P2_CUSTOM, 'p2'],
      [p3Ref.current, DEFAULT_P3_CUSTOM, 'p3'],
      [p4Ref.current, DEFAULT_P4_CUSTOM, 'p4'],
    ];
    defs.forEach(([player, appearance, id], index) => {
      player.customization = appearance;
      player.name = appearance.name;
      player.isBot = index !== 0;
      avatarsRef.current[id]?.applyAppearance(appearance);
    });
    remoteInputsRef.current = {};
  };

  // Latest-closure holder so long-lived callbacks (network, scene loop) never use stale state.
  const latestRef = useRef<{
    startMatchWithCountdown: (mode: GameMode, diff?: Difficulty, len?: MatchLength, golden?: boolean) => void;
    returnToOnlineLobby: (message?: string | null) => void;
  } | null>(null);

  // Menu music loop
  useEffect(() => {
    if (isMenuScreen(screenState) && audioEnabled) {
      padelAudio.startMenuMusic();
    } else {
      padelAudio.stopMenuMusic();
    }
  }, [screenState, audioEnabled]);

  // Auto-pause offline matches when the tab is hidden
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && screenStateRef.current === 'PLAYING' && !isOnlineMode(gameModeRef.current)) {
        changeScreen('PAUSED');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [changeScreen]);

  // Main Three.js Scene and 60Hz Fixed-Timestep Loop
  useEffect(() => {
    if (!mountRef.current) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.Fog(0x0a0f1d, 35, 80);

    const cameraController = new CameraController(
      mountRef.current.clientWidth / mountRef.current.clientHeight
    );
    cameraController.setPreset(cameraPresetRef.current);
    cameraControllerRef.current = cameraController;

    const deviceProfile = detectDeviceProfile();
    const adaptiveResolution = new AdaptiveResolution(getQualityOptions(deviceProfile, isSoftwareGl));
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(adaptiveResolution.pixelRatio);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mountRef.current.appendChild(renderer.domElement);

    // Arena Lighting
    const ambientLight = new THREE.AmbientLight(0x93c5fd, 0.7);
    scene.add(ambientLight);

    const mainSun = new THREE.DirectionalLight(0xffffff, 1.85);
    mainSun.position.set(12, 24, 14);
    scene.add(mainSun);

    const arenaFill = new THREE.DirectionalLight(0x38bdf8, 0.65);
    arenaFill.position.set(-14, 18, -12);
    scene.add(arenaFill);

    // Padel Court Arena
    const courtVisuals: CourtVisuals = buildPadelCourt(renderer);
    scene.add(courtVisuals.group);

    // 300+ Low-Poly Chibi Crowd System (Toon InstancedMesh)
    const crowdSystem = createCrowdSystem();
    scene.add(crowdSystem.group);

    // Padel Ball
    const ballGeo = new THREE.SphereGeometry(0.12, 20, 20);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xccff00,
      roughness: 0.35,
      metalness: 0.05,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    scene.add(ballMesh);

    // Ball Flight Trail
    const maxTrailPoints = 18;
    const trailPositions = new Float32Array(maxTrailPoints * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xccff00,
      transparent: true,
      opacity: 0.65,
      linewidth: 2,
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    scene.add(trailLine);

    // Golden Spark Particle System (for PERFECT sweetspot & smash hits)
    const sparkCount = 36;
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkVelocities: Vector3D[] = [];
    for (let i = 0; i < sparkCount; i++) {
      sparkVelocities.push({ x: 0, y: 0, z: 0 });
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xfacc15,
      size: 0.16,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    scene.add(sparkPoints);
    let sparkLife = 0;

    triggerSparkBurstRef.current = (pos: Vector3D) => {
      sparkLife = 0.35;
      sparkMat.opacity = 1.0;
      for (let i = 0; i < sparkCount; i++) {
        sparkPositions[i * 3] = pos.x;
        sparkPositions[i * 3 + 1] = pos.y;
        sparkPositions[i * 3 + 2] = pos.z;
        const angle = Math.random() * Math.PI * 2;
        const speed = 3.5 + Math.random() * 5.5;
        sparkVelocities[i] = {
          x: Math.cos(angle) * speed,
          y: (Math.random() - 0.2) * speed * 0.8,
          z: Math.sin(angle) * speed,
        };
      }
      sparkGeo.attributes.position.needsUpdate = true;
    };

    // Ambient Floating Dust Motes in Golden Hour Beams (Phase C)
    const dustCount = 80;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.25) * 6.5;
      dustPositions[i * 3 + 1] = 0.25 + Math.random() * 3.6;
      dustPositions[i * 3 + 2] = 1.0 + Math.random() * 5.5;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xffe8c8,
      size: 0.045,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    scene.add(dustPoints);

    // Drifting Festive Paper Confetti (Subtle tournament atmosphere)
    const confettiCount = 28;
    const confettiGeo = new THREE.PlaneGeometry(0.06, 0.04);
    const confettiMat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const confettiMesh = new THREE.InstancedMesh(confettiGeo, confettiMat, confettiCount);
    const confettiColors = [
      new THREE.Color(0xfbbf24), // gold
      new THREE.Color(0x38bdf8), // sky blue
      new THREE.Color(0xf43f5e), // rose
      new THREE.Color(0x34d399), // emerald
      new THREE.Color(0xa78bfa), // purple
    ];
    const confettiData = Array.from({ length: confettiCount }, (_, i) => {
      confettiMesh.setColorAt(i, confettiColors[i % confettiColors.length]);
      return {
        x: (Math.random() - 0.35) * 6.0,
        y: 0.6 + Math.random() * 3.4,
        z: 1.5 + Math.random() * 5.0,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.10 - Math.random() * 0.15,
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
        rotZ: Math.random() * Math.PI,
        vRotX: (Math.random() - 0.5) * 2.2,
        vRotY: (Math.random() - 0.5) * 2.6,
      };
    });
    if (confettiMesh.instanceColor) confettiMesh.instanceColor.needsUpdate = true;
    scene.add(confettiMesh);

    // 4 Player Avatars
    const p1Avatar: AvatarController = buildPadelAvatar(p1Ref.current.customization, 'south', 7.2, p1Ref.current.customization.number || 5, 'blue');
    const p2Avatar: AvatarController = buildPadelAvatar(p2Ref.current.customization, 'north', -7.2, p2Ref.current.customization.number || 5, 'red');
    const p3Avatar: AvatarController = buildPadelAvatar(p3Ref.current.customization, 'south', 7.2, p3Ref.current.customization.number || 4, 'blue');
    const p4Avatar: AvatarController = buildPadelAvatar(p4Ref.current.customization, 'north', -7.2, p4Ref.current.customization.number || 10, 'red');

    const avatars: Record<string, AvatarController> = {
      p1: p1Avatar,
      p2: p2Avatar,
      p3: p3Avatar,
      p4: p4Avatar,
    };
    avatarsRef.current = avatars;
    const players = getPlayerRoster([p1Ref.current, p2Ref.current, p3Ref.current, p4Ref.current]);
    players.forEach((player) => {
      const avatar = avatars[player.id];
      player.mesh = avatar.group;
      avatar.group.name = `player-${player.id}`;
      avatar.group.position.set(player.position.x, player.position.y, player.position.z);
      avatar.setVisible(true);
      scene.add(player.mesh);
    });

    const avatarList = [p1Avatar, p2Avatar, p3Avatar, p4Avatar];
    const playerForSlot = (slot: 1 | 2 | 3 | 4): PlayerState =>
      [p1Ref.current, p2Ref.current, p3Ref.current, p4Ref.current][slot - 1];
    const avatarForSlot = (slot: 1 | 2 | 3 | 4): AvatarController => avatarList[slot - 1];
    const isOnlineHost = () => isOnlineMode(gameModeRef.current) && !!multiplayerClientRef.current?.isHost;
    const isOnlineClient = () => isOnlineMode(gameModeRef.current) && !multiplayerClientRef.current?.isHost;
    const getLocalSlot = (): 1 | 2 | 3 | 4 => (isOnlineClient() ? multiplayerClientRef.current?.mySlot || 2 : 1);

    // Recent authoritative ball positions (host) for lag-compensated remote swings.
    const ballHistory: Array<{ t: number; pos: Vector3D }> = [];
    // Client-side prediction history for reconciliation against host acks.
    const pendingInputs: Array<{ seq: number; x: number; z: number; sprint: boolean; dt: number }> = [];

    function commitScore(next: ScoreState, broadcast = true) {
      scoreRef.current = next;
      setScore(next);
      if (broadcast && isOnlineHost()) multiplayerClientRef.current?.broadcastScore(next);
    }

    function emitFx(fx: MatchFx) {
      if (isOnlineHost()) multiplayerClientRef.current?.broadcastFx(fx);
    }

    function announce(text: string) {
      triggerHitFeedback(text);
      emitFx({ k: 'text', text });
    }

    function tickSwing(player: PlayerState, dt: number) {
      if (!player.isSwinging) return;
      player.racketSwingProgress += dt * 4.8;
      if (player.racketSwingProgress >= 1.0) {
        player.isSwinging = false;
        player.racketSwingProgress = 0;
      }
    }

    function resetForServe() {
      ballRef.current = arrangeServe(roster(), scoreRef.current, !isSinglesMode(gameModeRef.current));
      serveReadyAtRef.current = performance.now() + 900;
      ballHistory.length = 0;
      pendingInputs.length = 0;
      if (isOnlineHost()) multiplayerClientRef.current?.broadcastPointReset();
    }

    /** Shared point presentation for the host/offline game and online clients. */
    function presentPoint(ev: PointEvent) {
      isFrozenRef.current = true;
      padelAudio.playRefereeWhistle('end');
      courtVisuals.triggerCheerBurst(ballRef.current.position.x, ballRef.current.position.z);

      p1Avatar.playStateAnimation(ev.winner === 'south' ? 'celebrate' : 'sad');
      p3Avatar.playStateAnimation(ev.winner === 'south' ? 'celebrate' : 'sad');
      p2Avatar.playStateAnimation(ev.winner === 'north' ? 'celebrate' : 'sad');
      p4Avatar.playStateAnimation(ev.winner === 'north' ? 'celebrate' : 'sad');

      const reasonLower = ev.reason.toLowerCase();
      const isError =
        reasonLower.includes('fault') || reasonLower.includes('out') || reasonLower.includes('net');
      const isBigPoint = !!ev.smash || (ev.rally ?? 0) >= 8;
      if (isBigPoint) {
        padelAudio.playBigRoar();
        crowdSystem.triggerReaction('cheer', 3.2);
      } else if (isError) {
        padelAudio.playCrowdGroan();
        crowdSystem.triggerReaction('miss', 2.2);
      } else {
        padelAudio.playCrowdCheer();
        crowdSystem.triggerReaction('cheer', 2.5);
      }

      setPointBanner({ text: ev.bannerText, subtext: ev.bannerSubtext, winner: ev.winner });
      commitScore(ev.score, false);

      if (ev.matchWon) {
        padelAudio.playVictoryCheer();
        changeScreen('MATCH_END');
      } else if (screenStateRef.current === 'PLAYING') {
        changeScreen('POINT_SCORED');
      }
    }

    // Point scoring (host / offline authority)
    function onPointFinished(winner: Side, reason: string) {
      if (pointResetTimerRef.current || isFrozenRef.current) return;

      const rally = scoreRef.current.rallyCount;
      const smash = ballRef.current.lastShotType === 'smash' && winner === ballRef.current.lastHitter;
      ballRef.current = { ...ballRef.current, inPlay: false, velocity: { x: 0, y: 0, z: 0 } };

      const result = awardPoint(scoreRef.current, winner, scoreRef.current.targetGames, scoreRef.current.goldenPoint);
      const next = result.nextState;
      const name = (teamNamesRef.current[winner] || (winner === 'south' ? 'Blue' : 'Red')).toUpperCase();

      let bannerText = `POINT ${name}`;
      let bannerSubtext = `${reason} • ${next.points[0]} - ${next.points[1]}`;
      if (result.matchWon) {
        bannerText = `${name} WIN!`;
        bannerSubtext = `${reason} • Final ${next.games[0]} - ${next.games[1]}`;
      } else if (result.gameWon) {
        bannerText = `GAME ${name}`;
        bannerSubtext = `${reason} • Games ${next.games[0]} - ${next.games[1]}`;
      } else if (next.isTiebreak) {
        bannerSubtext = `${reason} • Tiebreak ${next.tiebreakPoints[0]} - ${next.tiebreakPoints[1]}`;
      }

      const event: PointEvent = {
        winner,
        reason,
        bannerText,
        bannerSubtext,
        matchWon: result.matchWon,
        score: next,
        rally,
        smash,
      };
      presentPoint(event);
      if (isOnlineHost()) multiplayerClientRef.current?.broadcastPointScored(winner, next, event);

      if (result.matchWon) return;

      pointResetTimerRef.current = window.setTimeout(() => {
        pointResetTimerRef.current = null;
        isFrozenRef.current = false;
        setPointBanner(null);
        if (screenStateRef.current === 'POINT_SCORED') changeScreen('PLAYING');
        padelAudio.playRefereeWhistle('start');

        const s = scoreRef.current;
        const isGamePoint =
          (s.rawPoints[0] >= 3 && s.rawPoints[0] > s.rawPoints[1]) ||
          (s.rawPoints[1] >= 3 && s.rawPoints[1] > s.rawPoints[0]) ||
          (s.goldenPoint && s.rawPoints[0] === 3 && s.rawPoints[1] === 3);
        if (isGamePoint) padelAudio.playGamePointChant();

        resetForServe();
      }, POINT_RESET_DELAY_MS);
    }

    /** Host/offline: apply a legal strike for `player` and broadcast the effect. */
    function performHit(
      player: PlayerState,
      slot: 1 | 2 | 3 | 4,
      shot: ShotType,
      power: number,
      aim: Vector3D,
      quality: HitQuality,
      opts: { bias?: { x: number; z: number }; aimAssist?: AimAssist } = {}
    ) {
      ballRef.current = strikeBallWithRacket(
        ballRef.current,
        player.side,
        shot,
        power,
        aim,
        player.position,
        opts.bias,
        quality,
        opts.aimAssist ?? 'high'
      );
      player.isSwinging = true;
      player.racketSwingProgress = 0;
      player.currentShotType = shot;
      commitScore({ ...scoreRef.current, rallyCount: scoreRef.current.rallyCount + 1 });
      padelAudio.playRacketHit(power, shot, quality, player.position);
      avatarForSlot(slot).triggerHitPop();
      if (shot === 'smash') crowdSystem.triggerReaction('smash', 1.4);
      emitFx({ k: 'hit', slot, shot, quality, power, pos: { ...ballRef.current.position } });
    }

    /** Host/offline: execute the underhand serve for `player`. */
    function performServe(player: PlayerState, slot: 1 | 2 | 3 | 4, power: number) {
      const targetBox = getServeTargetBox(scoreRef.current);
      ballRef.current = executePadelServe(ballRef.current, player.side, targetBox, power);
      player.isServing = false;
      player.isSwinging = true;
      player.racketSwingProgress = 0;
      player.swingSide = 'serve';
      padelAudio.playRacketHit(power, 'flat', 'GOOD', player.position);
      padelAudio.updateRallyTension(scoreRef.current.rallyCount, true);
      avatarForSlot(slot).triggerHitPop();
      emitFx({ k: 'hit', slot, shot: 'flat', quality: 'GOOD', power, pos: { ...ballRef.current.position } });
    }

    /**
     * Swing buffer (arcade-tennis style): a shot pressed a moment before the ball arrives is held
     * and fires automatically as soon as the ball enters your reach, instead of whiffing.
     */
    const SWING_BUFFER_MS = 320;
    let bufferedSwing: { intent: SwingIntent; until: number } | null = null;

    function isBallComingTo(player: PlayerState, b: BallState): boolean {
      if (!b.inPlay || b.lastHitter === player.side) return false;
      const towardsMe = player.side === 'south' ? b.velocity.z > 0.3 : b.velocity.z < -0.3;
      const onMySide = player.side === 'south' ? b.position.z > 0 : b.position.z < 0;
      return towardsMe || onMySide;
    }

    function processBufferedSwing(now: number) {
      if (!bufferedSwing) return;
      if (screenStateRef.current !== 'PLAYING' || isFrozenRef.current) {
        bufferedSwing = null;
        return;
      }
      const local = playerForSlot(getLocalSlot());
      const b = ballRef.current;
      const timing = evaluateContactTiming(local.position, b.position, local.side);
      if (timing.quality !== 'OUT_OF_REACH' && canPlayerStrikeBall(b, local.side)) {
        const { intent } = bufferedSwing;
        bufferedSwing = null;
        executeSwing(intent, true);
      } else if (now > bufferedSwing.until || !isBallComingTo(local, b)) {
        bufferedSwing = null;
        local.isSwinging = true;
        local.racketSwingProgress = 0;
        triggerHitFeedback('WHIFF!');
      }
    }

    // Local player's swing (dedicated shot buttons, context drive on the main hit button)
    function executeSwing(intent: SwingIntent, fromBuffer = false) {
      if (isFrozenRef.current) return;
      const onlineClient = isOnlineClient();
      const slot = getLocalSlot();
      const localPlayer = playerForSlot(slot);
      const localAvatar = avatarForSlot(slot);
      const b = ballRef.current;

      // 1. Legal underhand serve
      if (localPlayer.isServing && !b.inPlay) {
        if (!onlineClient && performance.now() < serveReadyAtRef.current - 500) return;
        localPlayer.isSwinging = true;
        localPlayer.racketSwingProgress = 0;
        localPlayer.swingSide = 'serve';
        if (onlineClient) {
          multiplayerClientRef.current?.sendSwing({
            shot: 'flat',
            power: intent.power,
            aimX: 0,
            aimZ: 0,
            posX: localPlayer.position.x,
            posZ: localPlayer.position.z,
            isJumping: false,
            isServe: true,
          });
          localAvatar.triggerHitPop();
          setIsMyServe(false);
          return;
        }
        performServe(localPlayer, slot, intent.power);
        setIsMyServe(false);
        return;
      }

      // Too early? Hold the swing and let it fire when the ball arrives.
      if (!fromBuffer) {
        const early = evaluateContactTiming(localPlayer.position, b.position, localPlayer.side);
        if (early.quality === 'OUT_OF_REACH' && isBallComingTo(localPlayer, b)) {
          bufferedSwing = { intent, until: performance.now() + SWING_BUFFER_MS };
          return;
        }
      }
      bufferedSwing = null;

      localPlayer.isSwinging = true;
      localPlayer.racketSwingProgress = 0;
      const dx = b.position.x - localPlayer.position.x;
      const facingSign = localPlayer.side === 'south' ? 1 : -1;
      localPlayer.swingSide = b.position.y > 1.65 ? 'overhead' : dx * facingSign >= 0 ? 'forehand' : 'backhand';

      // Shot selection: explicit (lob/drop/smash buttons) wins, otherwise context.
      let selectedShot: ShotType = intent.shot;
      const isBajadaEligible = isBajadaWindow(b, localPlayer.position, localPlayer.side);
      if (selectedShot === 'flat' || selectedShot === 'topspin') {
        if (intent.isJumpHit || localPlayer.isJumping || b.position.y > 1.65) {
          selectedShot = 'smash';
        } else if (isBajadaEligible) {
          selectedShot = 'bajada';
        } else if (intent.power > 0.75) {
          selectedShot = 'topspin';
        }
      } else if (selectedShot === 'smash' && b.position.y < 1.3 && !localPlayer.isJumping) {
        // You can't smash a ball at knee height - play a drive instead.
        selectedShot = intent.power > 0.75 ? 'topspin' : 'flat';
      }

      const aimTarget = intent.targetAim || mouseAimRef.current;
      const timing = evaluateContactTiming(localPlayer.position, b.position, localPlayer.side);
      const legal = canPlayerStrikeBall(b, localPlayer.side);

      currentShotRef.current = selectedShot;
      setCurrentShot(selectedShot);

      if (onlineClient) {
        // The host decides (with lag compensation); we only predict the animation.
        multiplayerClientRef.current?.sendSwing({
          shot: selectedShot,
          power: intent.power,
          aimX: aimTarget.x,
          aimZ: aimTarget.z,
          bias: intent.bias,
          posX: localPlayer.position.x,
          posZ: localPlayer.position.z,
          isJumping: localPlayer.isJumping,
          isServe: false,
        });
        return;
      }

      if (timing.quality === 'OUT_OF_REACH' || !legal) {
        if (b.inPlay && timing.quality !== 'OUT_OF_REACH' && b.lastHitter === localPlayer.side) {
          triggerHitFeedback("PARTNER'S BALL");
        } else if (b.inPlay && b.isServe && b.bounceCount === 0 && timing.quality !== 'OUT_OF_REACH') {
          triggerHitFeedback('LET THE SERVE BOUNCE');
        } else {
          triggerHitFeedback('WHIFF!');
        }
        return;
      }

      const effectivePower = Math.min(1.0, intent.power * timing.powerMultiplier);
      performHit(localPlayer, slot, selectedShot, effectivePower, aimTarget, timing.quality, {
        bias: intent.bias,
        aimAssist: aimAssistRef.current,
      });

      const online = isOnlineMode(gameModeRef.current);
      // Feel: hit-stop (offline only so online clients never stutter)
      if (!online) {
        hitStopUntilRef.current =
          performance.now() + (timing.quality === 'PERFECT' || selectedShot === 'smash' ? 65 : 40);
      }

      if (timing.quality === 'PERFECT') {
        triggerSparkBurstRef.current?.(b.position);
        triggerHitFeedback(selectedShot === 'smash' ? 'SMASH! ⚡' : 'PERFECT! 🎯');
      } else if (timing.quality === 'EARLY') {
        triggerHitFeedback('EARLY');
      } else if (timing.quality === 'LATE') {
        triggerHitFeedback('LATE');
      } else {
        triggerHitFeedback('CLEAN HIT');
      }

      if (selectedShot === 'smash') cameraController.triggerShake(0.42, 0.25);
      if (selectedShot === 'bajada') {
        if (!online) {
          slowMotionUntilRef.current = performance.now() + 140;
          slowMotionFactorRef.current = 0.35;
        }
        triggerHitFeedback('BAJADA! 💥');
      }
    }

    /** Host: a client asked to swing. Rewind the ball to what that player saw. */
    function handleRemoteSwing(swing: RemoteSwing, rttMs: number) {
      if (!isOnlineHost() || isFrozenRef.current) return;
      const screen = screenStateRef.current;
      if (screen !== 'PLAYING' && screen !== 'PAUSED') return;
      if (![2, 3, 4].includes(swing.slot)) return;
      const player = playerForSlot(swing.slot);
      if (player.isBot) return;
      const b = ballRef.current;
      const power = Math.max(0.3, Math.min(1, Number(swing.power) || 0.6));

      if (swing.isServe || (player.isServing && !b.inPlay)) {
        if (player.isServing && !b.inPlay) performServe(player, swing.slot, power);
        return;
      }

      player.isSwinging = true;
      player.racketSwingProgress = 0;
      const shot: ShotType = SHOT_TYPES.includes(swing.shot) ? swing.shot : 'flat';

      // Trust the client's predicted position when it agrees with ours.
      const clientPos: Vector3D = { x: Number(swing.posX), y: player.position.y, z: Number(swing.posZ) };
      const agrees =
        Number.isFinite(clientPos.x) &&
        Number.isFinite(clientPos.z) &&
        Math.hypot(clientPos.x - player.position.x, clientPos.z - player.position.z) < 1.25;
      const hitFrom = agrees ? clientPos : player.position;

      const now = performance.now();
      const rewindWindow = Math.min(320, rttMs / 2 + 110);
      const candidates = [{ t: now, pos: b.position }];
      for (let i = ballHistory.length - 1; i >= 0; i--) candidates.push(ballHistory[i]);

      let best: HitQuality | null = null;
      for (const c of candidates) {
        if (now - c.t > rewindWindow) break;
        if (!canPlayerStrikeBall(b, player.side, c.pos)) continue;
        const timing = evaluateContactTiming(hitFrom, c.pos, player.side);
        if (timing.quality === 'OUT_OF_REACH') continue;
        if (best === null || QUALITY_RANK[timing.quality] < QUALITY_RANK[best]) best = timing.quality;
      }
      if (!best) return;

      const aim: Vector3D = {
        x: Number.isFinite(swing.aimX) ? swing.aimX : 0,
        y: 0,
        z: Number.isFinite(swing.aimZ) ? swing.aimZ : player.side === 'south' ? -7 : 7,
      };
      const hitPower = Math.min(1, power * (QUALITY_POWER[best] ?? 1));
      performHit(player, swing.slot, shot, hitPower, aim, best, { bias: swing.bias });
      multiplayerClientRef.current?.broadcastSnapshot(
        ballRef.current,
        [p1Ref.current, p2Ref.current, p3Ref.current, p4Ref.current],
        scoreRef.current
      );
    }

    /** Client: play an effect the host reported. */
    function playFx(fx: MatchFx) {
      switch (fx.k) {
        case 'hit': {
          padelAudio.playRacketHit(fx.power, fx.shot, fx.quality as HitQuality, fx.pos);
          const player = playerForSlot(fx.slot);
          if (fx.slot !== getLocalSlot()) {
            player.isSwinging = true;
            player.racketSwingProgress = 0;
          }
          avatarForSlot(fx.slot).triggerHitPop();
          if (fx.shot === 'smash') crowdSystem.triggerReaction('smash', 1.4);
          if (fx.slot === getLocalSlot()) {
            const q = fx.quality;
            triggerHitFeedback(q === 'PERFECT' ? 'PERFECT! 🎯' : q === 'EARLY' ? 'EARLY' : q === 'LATE' ? 'LATE' : 'CLEAN HIT');
            if (fx.shot === 'smash') cameraController.triggerShake(0.42, 0.25);
          }
          break;
        }
        case 'bounce':
          padelAudio.playTurfBounce(fx.speed, fx.pos);
          break;
        case 'glass':
          padelAudio.playGlassRebound(fx.speed, fx.pos);
          break;
        case 'fence':
          padelAudio.playMeshFenceRebound(fx.pos);
          break;
        case 'net':
          padelAudio.playNetHit(fx.pos);
          padelAudio.playCrowdOoooh();
          crowdSystem.triggerReaction('smash', 1.0);
          break;
        case 'text':
          triggerHitFeedback(fx.text);
          break;
      }
    }

    /** Client: authoritative snapshot arrived - update ball state and reconcile our player. */
    function onClientSnapshot(snapshot: CompactSnapshot) {
      const client = multiplayerClientRef.current;
      if (!client || client.isHost) return;
      const b = snapshot.b;
      const ball = ballRef.current;
      ball.velocity = { x: b[3], y: b[4], z: b[5] };
      if (!b[6]) {
        ball.position = { x: b[0], y: b[1], z: b[2] };
        ball.trail = [];
      }
      ball.inPlay = b[6];
      ball.lastHitter = b[7];
      ball.bounceCount = b[8];

      // Server reconciliation: start from the host's position and replay unacked inputs.
      const slot = client.mySlot;
      const local = playerForSlot(slot);
      const own = snapshot.p.find((p) => p.s === slot);
      if (!own) return;
      const ack = snapshot.ackSeq[slot] || 0;
      while (pendingInputs.length && pendingInputs[0].seq <= ack && ack - pendingInputs[0].seq < 30000) {
        pendingInputs.shift();
      }
      const isDoubles = !isSinglesMode(gameModeRef.current);
      const ghost: PlayerState = {
        ...local,
        position: { x: own.x, y: local.position.y, z: own.z },
        velocity: { x: own.vx, y: 0, z: own.vz },
      };
      for (const inp of pendingInputs) {
        updatePlayerMovement(ghost, { x: inp.x, z: inp.z, sprint: inp.sprint }, inp.dt, isDoubles);
      }
      const err = Math.hypot(ghost.position.x - local.position.x, ghost.position.z - local.position.z);
      if (err > 1.5) {
        local.position.x = ghost.position.x;
        local.position.z = ghost.position.z;
      } else if (err > 0.05) {
        local.position.x += (ghost.position.x - local.position.x) * 0.3;
        local.position.z += (ghost.position.z - local.position.z) * 0.3;
      }
    }

    sceneApiRef.current = { executeSwing, handleRemoteSwing, presentPoint, playFx, onClientSnapshot };

    // Unified Input Manager
    const inputManager = new InputManager({
      mountElement: mountRef.current,
      camera: cameraController.camera,
      onSwing: (intent) => {
        const local = playerForSlot(getLocalSlot());
        const isBajada = isBajadaWindow(ballRef.current, local.position, local.side);
        const isHigh = local.isJumping || ballRef.current.position.y > 1.65;
        // Keep shots forced by a dedicated button (right-click smash, touch lob).
        const resolvedShot = intent.shot !== 'flat' ? intent.shot : inputManager.determineShotType(isHigh, isBajada);
        executeSwing({ ...intent, shot: resolvedShot });
      },
      onChargeChange: (p) => {
        chargePowerRef.current = p;
        setChargePower(p);
      },
      onAimChange: (aim) => {
        mouseAimRef.current = aim;
        courtVisuals.updateAim(aim.x, aim.z, screenStateRef.current === 'PLAYING');
      },
      onToggleDebug: () => {
        setShowDebug((prev) => !prev);
      },
      onJumpRequest: () => {
        const local = playerForSlot(getLocalSlot());
        if (!local.isJumping && local.jumpY <= 0.05) {
          local.isJumping = true;
          local.jumpY = 0.75;
        }
      },
    });
    inputManagerRef.current = inputManager;

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      if (w <= 0 || h <= 0) return;
      cameraController.updateAspect(w, h);
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    // Catches rotation, iOS toolbar collapse and split-screen changes that skip 'resize'.
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(mountRef.current);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMenuScreen(screenStateRef.current)) return;
      const normX = (e.clientX / window.innerWidth) * 2 - 1;
      const normY = -(e.clientY / window.innerHeight) * 2 + 1;
      cameraController.setMouseParallax(normX, normY);
    };
    window.addEventListener('mousemove', handleMouseMove);

    let lastDebugSync = 0;
    let lastFootstepTime = 0;
    let lastSnapshotBroadcastTime = 0;
    let lastServeHint = false;
    const camForwardVec = new THREE.Vector3();
    const menuBackground = new THREE.Color(0x1a120c);
    const matchBackground = new THREE.Color(0x0a0f1d);
    const previousPositions: Record<string, Vector3D> = {};
    players.forEach((player) => {
      previousPositions[player.id] = { ...player.position };
    });
    let previousBallPosition: Vector3D = { ...ballRef.current.position };

    const interpolatePosition = (previous: Vector3D | undefined, current: Vector3D, alpha: number): Vector3D => {
      if (!previous) return { ...current };
      return {
        x: previous.x + (current.x - previous.x) * alpha,
        y: previous.y + (current.y - previous.y) * alpha,
        z: previous.z + (current.z - previous.z) * alpha,
      };
    };

    function stepBot(
      bot: PlayerState,
      slot: 1 | 2 | 3 | 4,
      opponent: PlayerState,
      teammate: PlayerState | undefined,
      isDoubles: boolean,
      dt: number,
      now: number
    ) {
      const decision = updateBotAI(bot, ballRef.current, opponent, botDifficultyRef.current, dt, isDoubles, teammate);
      bot.velocity = decision.velocity;
      advancePlayer(bot, dt);
      bot.swingSide = decision.swingSide;
      bot.state = decision.stateDescription;

      if (!decision.wantsToSwing || isFrozenRef.current) return;
      if (bot.isServing && !ballRef.current.inPlay) {
        if (now >= serveReadyAtRef.current) performServe(bot, slot, decision.power);
      } else if (ballRef.current.inPlay && canPlayerStrikeBall(ballRef.current, bot.side)) {
        performHit(bot, slot, decision.shotType, decision.power, decision.targetAim, decision.timingQuality);
      }
    }

    /** Host: drive a remote human from their latest input (same movement model as the client). */
    function stepRemoteHuman(player: PlayerState, slot: 1 | 2 | 3 | 4, isDoubles: boolean, dt: number, now: number) {
      const input = remoteInputsRef.current[slot];
      const fresh = !!input && now - input.receivedAt < 300;
      const clamp = (v: number) => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
      const move =
        fresh && !isFrozenRef.current
          ? { x: clamp(input!.moveX), z: clamp(input!.moveZ), sprint: !!input!.sprint, jump: !!input!.isJumping }
          : { x: 0, z: 0, sprint: false };
      updatePlayerMovement(player, move, dt, isDoubles);
    }

    /** Online client: predict our player, interpolate everyone else, smooth the ball. */
    function stepClient(dt: number, now: number, isDoubles: boolean) {
      const client = multiplayerClientRef.current;
      if (!client) return;
      const slot = client.mySlot;
      const local = playerForSlot(slot);
      inputManager.setPlayerSide(local.side);

      const move = isFrozenRef.current ? { x: 0, z: 0, sprint: false } : inputManager.getMovementInput();
      // One input per fixed tick so host simulation and client replay stay step-aligned.
      {
        const seq = client.sendInput({
          dt,
          moveX: move.x,
          moveZ: move.z,
          sprint: move.sprint,
          isJumping: local.isJumping,
          wantsSwing: false,
          shotType: currentShotRef.current,
          power: chargePowerRef.current,
          aimX: mouseAimRef.current.x,
          aimZ: mouseAimRef.current.z,
        });
        if (seq) {
          pendingInputs.push({ seq, x: move.x, z: move.z, sprint: move.sprint, dt });
          if (pendingInputs.length > 90) pendingInputs.shift();
        }
      }
      updatePlayerMovement(local, move, dt, isDoubles);
      tickSwing(local, dt);

      const ball = ballRef.current;
      local.isServing =
        !ball.inPlay &&
        !isFrozenRef.current &&
        (slot === 1 || slot === 2) &&
        scoreRef.current.servingSide === local.side;

      ([1, 2, 3, 4] as const).forEach((s) => {
        if (s === slot) return;
        const p = playerForSlot(s);
        const interp = client.getInterpolatedPlayer(s);
        if (!interp) return;
        p.position.x = interp.x;
        p.position.y = interp.y;
        p.position.z = interp.z;
        p.velocity.x = interp.vx;
        p.velocity.z = interp.vz;
        if (!p.isSwinging || interp.sw) {
          p.isSwinging = interp.sw;
          p.racketSwingProgress = interp.sp;
        } else {
          tickSwing(p, dt);
        }
        p.swingSide = interp.ss;
        p.currentShotType = interp.st;
      });

      const smoothed = client.getSmoothedBall(ball.position, dt);
      if (smoothed) {
        ball.position = smoothed;
        if (ball.inPlay) {
          ball.trail.push({ ...smoothed });
          if (ball.trail.length > 16) ball.trail.shift();
        }
      }
    }

    // 60 Hz Fixed-Timestep Loop
    const gameLoop = new FixedTimestepLoop(
      {
        fixedUpdate: (fixedDt) => {
          const now = performance.now();
          const screen = screenStateRef.current;
          const online = isOnlineMode(gameModeRef.current);

          // Simulate during play; online matches keep running under the pause menu.
          const simulate =
            screen === 'PLAYING' || screen === 'POINT_SCORED' || (online && screen === 'PAUSED');
          if (!simulate) return;

          if (!online && now < hitStopUntilRef.current) return;
          let effectiveDt = fixedDt;
          if (!online && now < slowMotionUntilRef.current) effectiveDt *= slowMotionFactorRef.current;

          const isDoubles = !isSinglesMode(gameModeRef.current);
          const p1 = p1Ref.current;
          const p2 = p2Ref.current;
          const p3 = p3Ref.current;
          const p4 = p4Ref.current;

          players.forEach((player) => {
            previousPositions[player.id] = { ...player.position };
          });
          previousBallPosition = { ...ballRef.current.position };

          if (online && !multiplayerClientRef.current?.isHost) {
            stepClient(effectiveDt, now, isDoubles);
            return;
          }

          // A. Local player (slot 1)
          inputManager.setPlayerSide(p1.side);
          if (isFrozenRef.current) {
            updatePlayerMovement(p1, { x: 0, z: 0, sprint: false }, effectiveDt, isDoubles);
          } else {
            updatePlayerMovement(p1, inputManager.getMovementInput(), effectiveDt, isDoubles);
          }
          tickSwing(p1, effectiveDt);

          // B. Everyone else: bots or remote humans
          if (isDoubles) {
            if (p3.isBot) stepBot(p3, 3, p2, p1, true, effectiveDt, now);
            else stepRemoteHuman(p3, 3, true, effectiveDt, now);
            tickSwing(p3, effectiveDt);
          }
          if (p2.isBot) stepBot(p2, 2, p1, isDoubles ? p4 : undefined, isDoubles, effectiveDt, now);
          else stepRemoteHuman(p2, 2, isDoubles, effectiveDt, now);
          tickSwing(p2, effectiveDt);
          if (isDoubles) {
            if (p4.isBot) stepBot(p4, 4, p3, p2, true, effectiveDt, now);
            else stepRemoteHuman(p4, 4, true, effectiveDt, now);
            tickSwing(p4, effectiveDt);
          }

          // C. Ball physics (CCD) and rules
          if (!isFrozenRef.current) {
            const phys = stepBallPhysics(ballRef.current, effectiveDt);
            ballRef.current = phys.ball;
            const ev = phys.events;
            const pos = { ...phys.ball.position };

            padelAudio.updateRallyTension(scoreRef.current.rallyCount, ballRef.current.inPlay);

            if (ev.bouncedFloor) {
              const speed = Math.abs(phys.ball.velocity.y);
              padelAudio.playTurfBounce(speed, pos);
              emitFx({ k: 'bounce', speed, pos });
            }
            if (ev.bouncedGlassWall) {
              const speed = Math.hypot(phys.ball.velocity.x, phys.ball.velocity.z);
              padelAudio.playGlassRebound(speed, pos);
              emitFx({ k: 'glass', speed, pos });
            }
            if (ev.bouncedMeshWall) {
              padelAudio.playMeshFenceRebound(pos);
              emitFx({ k: 'fence', pos });
            }
            if (ev.hitNet || ev.netTapeHit) {
              padelAudio.playNetHit(pos);
              padelAudio.playCrowdOoooh();
              crowdSystem.triggerReaction('smash', 1.0);
              emitFx({ k: 'net', pos });
            }

            if (ev.isLetServe) {
              commitScore(handleLetServe(scoreRef.current));
              announce('LET! REPLAY SERVE');
              resetForServe();
            } else if (ev.pointFault) {
              const servingSide = scoreRef.current.servingSide;
              if (ballRef.current.isServe && ev.faultWinner === servingSide) {
                // Valid serve the receiver never returned.
                onPointFinished(servingSide, 'Ace!');
              } else if (ballRef.current.isServe) {
                const faultRes = handleServeFault(scoreRef.current, scoreRef.current.targetGames);
                if (scoreRef.current.serveAttempt === 1) {
                  commitScore(faultRes.nextState);
                  announce('FAULT! SECOND SERVE');
                  resetForServe();
                } else {
                  // Double fault: award exactly one point to the receiver.
                  const receiver: Side = scoreRef.current.servingSide === 'south' ? 'north' : 'south';
                  onPointFinished(receiver, 'Double fault');
                }
              } else {
                const winner: Side =
                  ev.faultWinner || (ballRef.current.lastHitter === 'south' ? 'north' : 'south');
                onPointFinished(winner, ev.shortReason || ev.faultReason || 'Point');
              }
            }
          }

          // D. Host: lag-compensation history + 30 Hz authoritative snapshots
          if (online && multiplayerClientRef.current?.isHost) {
            ballHistory.push({ t: now, pos: { ...ballRef.current.position } });
            if (ballHistory.length > 24) ballHistory.shift();
            if (now - lastSnapshotBroadcastTime >= SNAPSHOT_INTERVAL_MS) {
              multiplayerClientRef.current.broadcastSnapshot(ballRef.current, [p1, p2, p3, p4], scoreRef.current);
              lastSnapshotBroadcastTime = now;
            }
          }
        },

        render: (alpha, dt) => {
          const now = performance.now();
          const currentScreen = screenStateRef.current;
          const isMenu = isMenuScreen(currentScreen);
          const isDoubles = !isSinglesMode(gameModeRef.current);
          const p1 = p1Ref.current;
          const p2 = p2Ref.current;
          const p3 = p3Ref.current;
          const p4 = p4Ref.current;

          // Only accept inputs during active match play
          inputManager.setEnabled(currentScreen === 'PLAYING');

          // Back wall occlusion fix: hide South baseline frame during match play
          courtVisuals.setNearWallVisible(isMenu);

          inputManager.update(now, dt);
          processBufferedSwing(now);

          // Animate golden spark particles if active
          if (sparkLife > 0) {
            sparkLife -= dt;
            sparkMat.opacity = Math.max(0, sparkLife / 0.35);
            for (let i = 0; i < sparkCount; i++) {
              sparkPositions[i * 3] += sparkVelocities[i].x * dt;
              sparkPositions[i * 3 + 1] += sparkVelocities[i].y * dt;
              sparkPositions[i * 3 + 2] += sparkVelocities[i].z * dt;
            }
            sparkGeo.attributes.position.needsUpdate = true;
          }

          const isMatchActive =
            currentScreen === 'PLAYING' ||
            currentScreen === 'POINT_SCORED' ||
            (currentScreen === 'PAUSED' && isOnlineMode(gameModeRef.current));

          // Ball Visuals
          const renderedBallPosition = isMatchActive
            ? interpolatePosition(previousBallPosition, ballRef.current.position, alpha)
            : { ...ballRef.current.position };
          ballMesh.position.set(renderedBallPosition.x, renderedBallPosition.y, renderedBallPosition.z);
          if (!isMatchActive) {
            previousBallPosition = { ...ballRef.current.position };
          }

          const trail = ballRef.current.trail;
          for (let i = 0; i < trail.length && i < maxTrailPoints; i++) {
            trailPositions[i * 3] = trail[i].x;
            trailPositions[i * 3 + 1] = trail[i].y;
            trailPositions[i * 3 + 2] = trail[i].z;
          }
          trailGeo.attributes.position.needsUpdate = true;
          trailGeo.setDrawRange(0, Math.min(trail.length, maxTrailPoints));

          // Dynamic Landing Ring on court floor
          const landing = predictBallLanding(ballRef.current);
          courtVisuals.updateLandingPrediction(
            landing.x,
            landing.z,
            landing.timeToBounce,
            ballRef.current.inPlay
          );

          // Golden hour lighting transition for menu vs vibrant daytime for match
          if (isMenu) {
            scene.background = menuBackground;
            scene.fog?.color.set(0x1a120c);
            ambientLight.color.set(0xffd8b0);
            ambientLight.intensity = 0.9;
            mainSun.color.set(0xffaa44);
            mainSun.position.set(18, 10, 14);
            mainSun.intensity = 2.2;
            arenaFill.color.set(0xff7722);
          } else {
            scene.background = matchBackground;
            scene.fog?.color.set(0x0a0f1d);
            ambientLight.color.set(0x93c5fd);
            ambientLight.intensity = 0.7;
            mainSun.color.set(0xffffff);
            mainSun.position.set(12, 24, 14);
            mainSun.intensity = 1.85;
            arenaFill.color.set(0x38bdf8);
          }

          dustPoints.visible = isMenu;
          confettiMesh.visible = isMenu;

          if (isMenu) {
            // 1. Ambient dust particles slow upward float
            const dPos = dustGeo.attributes.position.array as Float32Array;
            for (let i = 0; i < dustCount; i++) {
              dPos[i * 3 + 1] += dt * 0.16;
              dPos[i * 3] += Math.sin((now / 1000) * 0.7 + i) * dt * 0.05;
              if (dPos[i * 3 + 1] > 4.2) {
                dPos[i * 3 + 1] = 0.25;
              }
            }
            dustGeo.attributes.position.needsUpdate = true;

            // 2. Ambient drifting confetti ribbons
            const dummyMat4 = new THREE.Matrix4();
            const dummyPos = new THREE.Vector3();
            const dummyEuler = new THREE.Euler();
            const dummyQuat = new THREE.Quaternion();
            const dummyScale = new THREE.Vector3(1, 1, 1);
            for (let i = 0; i < confettiCount; i++) {
              const c = confettiData[i];
              c.y += c.vy * dt;
              c.x += c.vx * dt + Math.sin((now / 1000) * 1.1 + i) * dt * 0.08;
              c.rotX += c.vRotX * dt;
              c.rotY += c.vRotY * dt;
              if (c.y < 0.15) {
                c.y = 3.6;
                c.x = (Math.random() - 0.35) * 6.0;
              }
              dummyPos.set(c.x, c.y, c.z);
              dummyEuler.set(c.rotX, c.rotY, c.rotZ);
              dummyQuat.setFromEuler(dummyEuler);
              dummyMat4.compose(dummyPos, dummyQuat, dummyScale);
              confettiMesh.setMatrixAt(i, dummyMat4);
            }
            confettiMesh.instanceMatrix.needsUpdate = true;

            p1Avatar.setVisible(true);
            p2Avatar.setVisible(false);
            p3Avatar.setVisible(false);
            p4Avatar.setVisible(false);

            // Framed character at (1.35, 0, 4.0): sits at ~59% screen width, perfectly clear of left menu
            p1.position.x = 1.35;
            p1.position.y = 0;
            p1.position.z = 4.0;
            p1Avatar.group.position.set(1.35, 0, 4.0);

            // Eased parabolic ball bounce loop synchronized with character knees
            const bouncePeriod = 0.76;
            const bounceCycle = ((now / 1000) % bouncePeriod) / bouncePeriod; // 0..1
            // 4 * u * (1 - u): 0 at racket contact, 1 at peak apex
            const bounceArc = 4.0 * bounceCycle * (1.0 - bounceCycle);
            const racketFaceY = 0.94;
            const apexHeight = 0.44;
            const ballBounceY = racketFaceY + bounceArc * apexHeight;
            // Racket face center is at X=1.71, Z=4.15
            ballMesh.position.set(1.71, ballBounceY, 4.15);

            // Procedural relaxed idle: side racket, knee cushion, head following mouse, blinking
            p1Avatar.updateMenuIdle(dt, now / 1000, bounceCycle, cameraController.mouseParallax);
            courtVisuals.updateAim(0, 0, false);
            courtVisuals.updateLandingPrediction(0, 0, 0, false);
          } else {
            players.forEach((player) => {
              const avatar = avatars[player.id];
              const isVisible = player.id === 'p1' || player.id === 'p2' || isDoubles;
              avatar.setVisible(isVisible);
              if (!isMatchActive) {
                previousPositions[player.id] = { ...player.position };
                avatar.group.position.set(player.position.x, player.position.y, player.position.z);
              } else {
                const renderedPosition = interpolatePosition(previousPositions[player.id], player.position, alpha);
                avatar.group.position.set(renderedPosition.x, renderedPosition.y, renderedPosition.z);
              }
            });

            // Local human faces their aim reticle; everyone else tracks the ball.
            const localSlot = getLocalSlot();
            ([1, 2, 3, 4] as const).forEach((slot) => {
              if ((slot === 3 || slot === 4) && !isDoubles) return;
              const player = playerForSlot(slot);
              const avatar = avatarForSlot(slot);
              const lookAt = slot === localSlot ? mouseAimRef.current : ballRef.current.position;
              const targetAngle = isMatchActive
                ? Math.atan2(lookAt.x - player.position.x, lookAt.z - player.position.z)
                : player.side === 'south'
                ? Math.PI
                : 0;
              avatar.updateKinematics(
                dt,
                isMatchActive ? player.velocity : { x: 0, z: 0 },
                player.racketSwingProgress,
                player.isSwinging,
                slot === localSlot ? currentShotRef.current : player.currentShotType,
                targetAngle,
                ballRef.current.position,
                player.swingSide
              );
            });
          }

          courtVisuals.updateShadows(
            ballMesh.position,
            p1Avatar.group.position,
            p2Avatar.group.position,
            p3Avatar.group.position,
            p4Avatar.group.position,
            isDoubles
          );

          const myPlayer = playerForSlot(getLocalSlot());

          // Camera update smoothly following ball and player
          cameraController.update(dt, isMenu, myPlayer.position, ballMesh.position, myPlayer.side);

          // Spatial Audio Listener sync to 3D Camera
          cameraController.camera.getWorldDirection(camForwardVec);
          padelAudio.updateListener(cameraController.camera.position, camForwardVec);

          // Footstep audio on player athletic run
          if (!isMenu && !isFrozenRef.current && Math.hypot(myPlayer.velocity.x, myPlayer.velocity.z) > 2.0) {
            if (now - lastFootstepTime > 320) {
              padelAudio.playFootstep('turf', myPlayer.position);
              lastFootstepTime = now;
            }
          }

          const isCheering = isMenu ? Math.sin(now / 2000) > 0.4 : feedbackTimerRef.current !== null;
          courtVisuals.updateCrowd(now / 1000, dt, isCheering);

          // 300+ Low-Poly Chibi Crowd Animation
          crowdSystem.update(now / 1000, dt);

          renderer.render(scene, cameraController.camera);

          // Adaptive resolution: trade sharpness for a steady frame rate on slower devices.
          const nextPixelRatio = adaptiveResolution.sample(dt);
          if (nextPixelRatio !== null) {
            renderer.setPixelRatio(nextPixelRatio);
            handleResize();
          }


          // HUD serve prompt for the local player
          const serveHint =
            (currentScreen === 'PLAYING' || currentScreen === 'PAUSED') &&
            myPlayer.isServing &&
            !ballRef.current.inPlay &&
            !isFrozenRef.current;
          if (serveHint !== lastServeHint) {
            lastServeHint = serveHint;
            setIsMyServe(serveHint);
          }

          if (showDebugRef.current && now - lastDebugSync > 100) {
            lastDebugSync = now;
            setFps(gameLoop.currentFps);
            setDebugPlayers([{ ...p1 }, { ...p3 }, { ...p2 }, { ...p4 }]);
          }
        },
      },
      isSoftwareGl,
      renderer
    );

    // ?debug=1 exposes live state for automated QA / troubleshooting.
    if (new URLSearchParams(window.location.search).get('debug') === '1') {
      (window as any).__padelDebug = {
        players: () =>
          [p1Ref.current, p2Ref.current, p3Ref.current, p4Ref.current].map((p) => ({
            id: p.id,
            pos: { ...p.position },
            zone: p.zone,
            serving: p.isServing,
            avatar: avatars[p.id].group.position.toArray(),
            scale: avatars[p.id].group.scale.toArray(),
          })),
        ball: () => ({ ...ballRef.current.position, inPlay: ballRef.current.inPlay }),
        camera: () => cameraController.camera.position.toArray(),
        fps: () => gameLoop.currentFps,
        pixelRatio: () => renderer.getPixelRatio(),
        fov: () => cameraController.camera.fov,
        screen: () => screenStateRef.current,
        score: () => ({ points: [...scoreRef.current.points], games: [...scoreRef.current.games], rally: scoreRef.current.rallyCount }),
        shot: () => currentShotRef.current,
        lastHitter: () => ballRef.current.lastHitter,
      };
    }

    gameLoop.keepAliveWhenHidden = () => isOnlineHost() && !isMenuScreen(screenStateRef.current);
    gameLoop.start();

    return () => {
      gameLoop.stop();
      sceneApiRef.current = null;
      crowdSystem.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      confettiGeo.dispose();
      confettiMat.dispose();
      multiplayerClientRef.current?.disconnect(true);
      inputManager.dispose();
      inputManagerRef.current = null;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      resizeObserver?.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleModeChange = (mode: GameMode) => {
    setGameMode(mode);
    gameModeRef.current = mode;

    // Fixed authoritative slots: 1/3 South (Blue), 2/4 North (Red)
    p1Ref.current.side = 'south';
    p1Ref.current.team = 'blue';
    p1Ref.current.zone = 'left';
    p2Ref.current.side = 'north';
    p2Ref.current.team = 'red';
    p2Ref.current.zone = 'left';
    p3Ref.current.side = 'south';
    p3Ref.current.team = 'blue';
    p3Ref.current.zone = 'right';
    p4Ref.current.side = 'north';
    p4Ref.current.team = 'red';
    p4Ref.current.zone = 'right';
  };

  /** Apply lobby slot data (names, looks, bot/human) onto the roster. */
  const applySlotsToRoster = (slots: LobbySlot[]) => {
    slots.forEach((s) => {
      const player =
        s.slot === 1 ? p1Ref.current : s.slot === 2 ? p2Ref.current : s.slot === 3 ? p3Ref.current : p4Ref.current;
      player.name = stripBotSuffix(s.playerName) || s.appearance.name;
      player.customization = s.appearance;
      // Slot 1 is always simulated locally by the host.
      player.isBot = s.slot === 1 ? false : s.isBot || !s.playerId;
      avatarsRef.current[`p${s.slot}`]?.applyAppearance(s.appearance);
    });
  };

  const ensureMultiplayerClient = () => {
    if (!multiplayerClientRef.current) {
      multiplayerClientRef.current = new MultiplayerClient({
        onLobbyUpdated: (slots, hostStatus, assignedSlot, config) => {
          setLobbySlots(slots.map((s) => ({ ...s })));
          setIsHost(hostStatus);
          setMySlot(assignedSlot);
          if (config) setRoomConfig(config);
          applySlotsToRoster(slots);
          if (isOnlineMode(gameModeRef.current)) refreshTeamNames();
        },
        onMatchStarted: (config, slots, _servingSide, _seed, resume) => {
          setShowMultiplayer(false);
          setNetErrorMessage(null);
          const targetMode: GameMode = config.mode === '1v1' ? 'online-1v1' : 'online-2v2';
          setRoomConfig(config);
          applySlotsToRoster(slots);
          const client = multiplayerClientRef.current;
          const mine = client ? slots.find((s) => s.slot === client.mySlot) : undefined;
          setLocalSide(client?.isHost ? 'south' : mine?.side || 'north');
          latestRef.current?.startMatchWithCountdown(
            targetMode,
            config.difficulty,
            config.matchLength,
            config.goldenPoint
          );
          if (resume) triggerHitFeedback('RECONNECTED!');
        },
        onSnapshotReceived: (snapshot) => {
          sceneApiRef.current?.onClientSnapshot(snapshot);
        },
        onClientInputReceived: (_playerId, slot, input) => {
          if (!multiplayerClientRef.current?.isHost) return;
          remoteInputsRef.current[slot] = { ...input, receivedAt: performance.now() };
        },
        onRemoteSwing: (swing, rtt) => {
          sceneApiRef.current?.handleRemoteSwing(swing, rtt);
        },
        onScoreReceived: (next) => {
          if (multiplayerClientRef.current?.isHost) return;
          scoreRef.current = next;
          setScore(next);
        },
        onPointScoredReceived: (winner, nextScore, event) => {
          if (multiplayerClientRef.current?.isHost) return;
          if (pointResetTimerRef.current) {
            clearTimeout(pointResetTimerRef.current);
            pointResetTimerRef.current = null;
          }
          sceneApiRef.current?.presentPoint(
            event || {
              winner,
              reason: 'Point',
              bannerText: `POINT ${(teamNamesRef.current[winner] || '').toUpperCase()}`,
              bannerSubtext: `${nextScore.points[0]} - ${nextScore.points[1]}`,
              matchWon: !!nextScore.winner,
              score: nextScore,
            }
          );
        },
        onPointResetReceived: () => {
          if (multiplayerClientRef.current?.isHost) return;
          isFrozenRef.current = false;
          setPointBanner(null);
          if (screenStateRef.current === 'POINT_SCORED') changeScreen('PLAYING');
          ballRef.current = arrangeServe(roster(), scoreRef.current, !isSinglesMode(gameModeRef.current));
        },
        onFxReceived: (fx) => {
          sceneApiRef.current?.playFx(fx);
        },
        onMatchEnded: (reason) => {
          latestRef.current?.returnToOnlineLobby(reason || null);
        },
        onHostDisconnected: () => {
          if (pointResetTimerRef.current) {
            clearTimeout(pointResetTimerRef.current);
            pointResetTimerRef.current = null;
          }
          isFrozenRef.current = false;
          setPointBanner(null);
          setCurrentRoomId(null);
          setLobbySlots([]);
          restoreLocalRoster();
          if (!isMenuScreen(screenStateRef.current)) {
            cameraControllerRef.current?.snapToMenuOrbit();
            changeScreen('MENU');
          }
          setGameMode('2v2');
          gameModeRef.current = '2v2';
          setShowMultiplayer(true);
        },
        onPingUpdated: (p) => setPingMs(p),
        onConnectionStatusChanged: (status, err) => {
          setConnectionStatus(status);
          if (err) setNetErrorMessage(err);
          if (status === 'connected') {
            setIsNetConnected(true);
            setNetErrorMessage(null);
            setIsQuickMatching(false);
          } else if (status === 'disconnected') {
            setIsNetConnected(false);
            setIsQuickMatching(false);
            // A failed join/create returns to the room picker (the error stays visible).
            if (!multiplayerClientRef.current?.currentRoomId) {
              setCurrentRoomId(null);
              setLobbySlots([]);
            }
          }
        },
      });
    }
    return multiplayerClientRef.current;
  };

  const handleCreateRoom = (mode: '1v1' | '2v2' = '2v2', customCode?: string) => {
    const client = ensureMultiplayerClient();
    const code = customCode || MultiplayerClient.generateRoomCode();
    setNetErrorMessage(null);
    setCurrentRoomId(code);
    client.createRoom(code, p1CustomRef.current, mode);
  };

  const handleJoinRoom = (code: string) => {
    const client = ensureMultiplayerClient();
    const clean = code.toUpperCase().trim();
    setNetErrorMessage(null);
    setCurrentRoomId(clean);
    client.joinRoom(clean, p1CustomRef.current);
  };

  const handleUpdateRoomConfig = (partial: Partial<RoomConfig>) => {
    setRoomConfig((prev) => ({ ...prev, ...partial }));
    multiplayerClientRef.current?.updateRoomConfig(partial);
  };

  const handleQuickMatch = async (mode: '1v1' | '2v2') => {
    const client = ensureMultiplayerClient();
    setNetErrorMessage(null);
    setIsQuickMatching(true);
    try {
      const joined = await client.quickMatch(p1CustomRef.current, mode);
      setCurrentRoomId(client.currentRoomId || joined);
    } catch {
      setIsQuickMatching(false);
    }
  };

  const handleSlotChange = (slot: 1 | 2 | 3 | 4) => {
    multiplayerClientRef.current?.requestSlotChange(slot);
  };

  const handleToggleReady = () => {
    multiplayerClientRef.current?.toggleReady();
  };

  const handleToggleBotSlot = (slot: 1 | 2 | 3 | 4) => {
    multiplayerClientRef.current?.toggleBotSlot(slot);
  };

  const handleFillBots = () => {
    multiplayerClientRef.current?.fillAllEmptySlotsWithBots();
  };

  const handleStartMultiplayerMatch = () => {
    multiplayerClientRef.current?.startMatch();
  };

  const handleLeaveRoom = () => {
    multiplayerClientRef.current?.disconnect();
    setCurrentRoomId(null);
    setLobbySlots([]);
    setIsNetConnected(false);
    setIsQuickMatching(false);
    setConnectionStatus('disconnected');
    setNetErrorMessage(null);
    restoreLocalRoster();
  };

  const handleToggleSimulatedLatency = (enabled: boolean) => {
    setSimulatedLatency(enabled);
    if (multiplayerClientRef.current) {
      multiplayerClientRef.current.simulatedLatencyMs = enabled ? 150 : 0;
      multiplayerClientRef.current.simulatedPacketLossRate = enabled ? 0.05 : 0;
    }
  };

  // Start match flow with camera push-in, countdown and double-click guard
  const startMatchWithCountdown = (mode: GameMode, diff?: Difficulty, len?: MatchLength, golden?: boolean) => {
    if (isStartingMatchRef.current) return;
    isStartingMatchRef.current = true;

    if (pointResetTimerRef.current) {
      clearTimeout(pointResetTimerRef.current);
      pointResetTimerRef.current = null;
    }
    if (diff) {
      setBotDifficulty(diff);
      botDifficultyRef.current = diff;
    }
    const targetLength = len || matchLength;
    if (len) setMatchLength(len);
    const targetGolden = golden ?? goldenPoint;

    handleModeChange(mode);
    if (!isOnlineMode(mode)) {
      // Offline: you are slot 1 and everyone else is a bot.
      p1Ref.current.isBot = false;
      p1Ref.current.name = p1CustomRef.current.name;
      p1Ref.current.customization = p1CustomRef.current;
      avatarsRef.current.p1?.applyAppearance(p1CustomRef.current);
      p2Ref.current.isBot = true;
      p3Ref.current.isBot = true;
      p4Ref.current.isBot = true;
      setLocalSide('south');
    }
    refreshTeamNames(mode);

    const initScore = createInitialScoreState('south', targetLength, targetGolden);
    scoreRef.current = initScore;
    setScore(initScore);
    remoteInputsRef.current = {};

    ballRef.current = arrangeServe(roster(), initScore, !isSinglesMode(mode));
    serveReadyAtRef.current = performance.now() + 4500;
    isFrozenRef.current = false;
    setPointBanner(null);
    setShowControlsOverlay(false);
    padelAudio.stopMenuMusic();

    if (isMenuScreen(screenStateRef.current)) {
      setIsMatchTransitioning(true);
      cameraControllerRef.current?.startPlayPushIn(() => {
        cameraControllerRef.current?.snapToMatchPreset();
        // The menu pose overrides the local player during the push-in; place everyone again.
        ballRef.current = arrangeServe(roster(), scoreRef.current, !isSinglesMode(mode));
        changeScreen('COUNTDOWN');
        setIsMatchTransitioning(false);
        isStartingMatchRef.current = false;
      });
    } else {
      cameraControllerRef.current?.snapToMatchPreset();
      changeScreen('COUNTDOWN');
      isStartingMatchRef.current = false;
    }
  };

  const handleCountdownComplete = useCallback(() => {
    isStartingMatchRef.current = false;
    serveReadyAtRef.current = performance.now() + 700;
    changeScreen('PLAYING');
    padelAudio.playRefereeWhistle('start');
  }, [changeScreen]);

  /** Online: leave the court and show the room lobby again (room stays open). */
  const returnToOnlineLobby = (message?: string | null) => {
    if (pointResetTimerRef.current) {
      clearTimeout(pointResetTimerRef.current);
      pointResetTimerRef.current = null;
    }
    isFrozenRef.current = false;
    isStartingMatchRef.current = false;
    setIsMatchTransitioning(false);
    setPointBanner(null);
    padelAudio.stopAllCrowdAudio();
    cameraControllerRef.current?.snapToMenuOrbit();
    changeScreen('MENU');
    if (message) setNetErrorMessage(message);
    setShowMultiplayer(true);
  };

  const quitToMenu = () => {
    isStartingMatchRef.current = false;
    setIsMatchTransitioning(false);
    if (pointResetTimerRef.current) {
      clearTimeout(pointResetTimerRef.current);
      pointResetTimerRef.current = null;
    }
    isFrozenRef.current = false;
    setPointBanner(null);
    setShowControlsOverlay(false);
    padelAudio.stopAllCrowdAudio();

    if (isOnlineMode(gameModeRef.current)) {
      // Leaving an online match leaves the room (host closes it for everyone).
      handleLeaveRoom();
      setGameMode('2v2');
      gameModeRef.current = '2v2';
    }
    cameraControllerRef.current?.snapToMenuOrbit();
    changeScreen('MENU');
  };

  const handleRematch = () => {
    if (isOnlineMode(gameModeRef.current)) {
      const client = multiplayerClientRef.current;
      if (client?.isHost) client.startMatch();
      return;
    }
    startMatchWithCountdown(gameMode, botDifficulty, matchLength);
  };

  const handleHostBackToLobby = () => {
    const client = multiplayerClientRef.current;
    if (client?.isHost) client.returnToLobby();
    returnToOnlineLobby(null);
  };

  latestRef.current = { startMatchWithCountdown, returnToOnlineLobby };

  // URL autostart check (?autostart=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const timer = window.setTimeout(() => latestRef.current?.startMatchWithCountdown('2v2'), 50);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const pauseGame = useCallback(() => {
    if (screenStateRef.current === 'PLAYING') changeScreen('PAUSED');
  }, [changeScreen]);

  const resumeGame = useCallback(() => {
    setShowControlsOverlay(false);
    if (screenStateRef.current === 'PAUSED') changeScreen('PLAYING');
  }, [changeScreen]);

  // Keyboard shortcut: ESC / P toggles pause during match play
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (screenStateRef.current === 'PLAYING') {
          changeScreen('PAUSED');
        } else if (screenStateRef.current === 'PAUSED') {
          setShowControlsOverlay(false);
          changeScreen('PLAYING');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeScreen]);

  const isOnline = isOnlineMode(gameMode);
  const onlineRoleLabel = isOnline
    ? `P${isHost ? 1 : mySlot} • ${(isHost ? 1 : mySlot) % 2 === 1 ? 'Team Blue' : 'Team Red'}`
    : undefined;

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-zinc-950 font-sans select-none text-white">
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-crosshair touch-none" />

      {/* Match transition push-in fade */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950 pointer-events-none transition-opacity duration-300 ${
          isMatchTransitioning ? 'opacity-90' : 'opacity-0'
        }`}
      />

      {/* Real-Time F3 Debug Overlay */}
      <DebugOverlay
        isOpen={showDebug}
        onClose={() => setShowDebug(false)}
        players={debugPlayers}
        ball={ballRef.current}
        score={score}
        gameMode={gameMode}
        botDifficulty={botDifficulty}
        onChangeDifficulty={setBotDifficulty}
        fps={fps}
      />

      {/* 1. Main Menu & Mode Select */}
      {(screenState === 'MENU' || screenState === 'MODE_SELECT') && (
        <MainMenu
          screenState={screenState}
          onOpenModeSelect={() => changeScreen('MODE_SELECT')}
          onBackToMainMenu={() => changeScreen('MENU')}
          onStartMatch={(mode, diff, len) => {
            startMatchWithCountdown(mode, diff, len);
          }}
          onStartPractice={() => {
            startMatchWithCountdown('1v1', 'easy', '1_game');
          }}
          onOpenOnline={() => setShowMultiplayer(true)}
          onOpenLocker={() => changeScreen('LOCKER')}
          onOpenSettings={() => changeScreen('SETTINGS')}
          onOpenControls={() => changeScreen('HOW_TO_PLAY')}
          p1Custom={p1Custom}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleSound}
        />
      )}

      {/* 2. Locker / Customizer */}
      {screenState === 'LOCKER' && (
        <CustomizerModal
          isOpen={true}
          onClose={() => changeScreen('MENU')}
          appearance={p1Custom}
          onChange={(next) => {
            setP1Custom(next);
            p1CustomRef.current = next;
            p1Ref.current.customization = next;
            p1Ref.current.name = next.name;
            avatarsRef.current.p1?.applyAppearance(next);
          }}
        />
      )}

      {/* 3. Settings */}
      {screenState === 'SETTINGS' && (
        <SettingsModal
          isOpen={true}
          onClose={() => changeScreen('MENU')}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleSound}
          cameraPreset={cameraPreset}
          onSelectCameraPreset={setCameraPreset}
          matchLength={matchLength}
          onSelectMatchLength={(len) => setMatchLength(len)}
          goldenPoint={goldenPoint}
          onToggleGoldenPoint={() => setGoldenPoint((prev) => !prev)}
          aimAssist={aimAssist}
          onSelectAimAssist={setAimAssist}
          touchControlSize={touchControlSize}
          onSelectTouchControlSize={isTouchDevice ? handleTouchControlSize : undefined}
        />
      )}

      {/* 4. Controls & How to Play (menu) */}
      {screenState === 'HOW_TO_PLAY' && (
        <ControlsGuideModal isOpen={true} onClose={() => changeScreen('MENU')} />
      )}

      {/* 5. Match Start Countdown */}
      {screenState === 'COUNTDOWN' && (
        <CountdownOverlay
          onComplete={handleCountdownComplete}
          p1Name={teamNames.south}
          p2Name={teamNames.north}
          gameMode={isOnline ? `online ${roomConfig.mode}` : gameMode}
          localTeam={localSide}
        />
      )}

      {/* 6. Active Game Match HUD */}
      {(screenState === 'PLAYING' || screenState === 'POINT_SCORED' || screenState === 'PAUSED') && (
        <GameHUD
          score={score}
          gameMode={gameMode}
          onExitToMenu={quitToMenu}
          onPause={pauseGame}
          currentShot={currentShot}
          chargePower={chargePower}
          hitFeedback={hitFeedback}
          pointBanner={pointBanner}
          onOpenControls={() => {
            pauseGame();
            setShowControlsOverlay(true);
          }}
          p1Name={teamNames.south}
          p2Name={teamNames.north}
          localSide={localSide}
          isMyServe={isMyServe && screenState === 'PLAYING'}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleSound}
          pingMs={pingMs}
          connectionStatus={connectionStatus}
          onlinePlayerLabel={onlineRoleLabel}
          onToggleNetDebug={() => setShowNetDebug((prev) => !prev)}
          onTouchJoystick={(x, z) => inputManagerRef.current?.setVirtualStick(x, z)}
          onTouchHitStart={() => inputManagerRef.current?.startTouchCharge()}
          onTouchHitEnd={() => inputManagerRef.current?.releaseTouchCharge()}
          onTouchLob={() => inputManagerRef.current?.triggerTouchLob()}
          touchScale={touchControlScale(touchControlSize)}
          onTouchJump={() => {
            const slot = isOnline && !isHost ? mySlot : 1;
            const local = slot === 1 ? p1Ref.current : slot === 2 ? p2Ref.current : slot === 3 ? p3Ref.current : p4Ref.current;
            if (!local.isJumping && local.jumpY <= 0.05) {
              local.isJumping = true;
              local.jumpY = 0.75;
            }
          }}
        />
      )}

      {/* 7. Pause Overlay */}
      {screenState === 'PAUSED' && !showControlsOverlay && (
        <PauseOverlay
          onResume={resumeGame}
          onRestart={isOnline ? undefined : () => startMatchWithCountdown(gameMode, botDifficulty, matchLength)}
          onShowControls={() => setShowControlsOverlay(true)}
          onQuitToMenu={quitToMenu}
          isOnline={isOnline}
          isHost={isHost}
          touchControlSize={isTouchDevice ? touchControlSize : undefined}
          onSelectTouchControlSize={isTouchDevice ? handleTouchControlSize : undefined}
        />
      )}

      {/* Controls guide opened from inside a match (keeps the match paused, not lost) */}
      {screenState === 'PAUSED' && showControlsOverlay && (
        <ControlsGuideModal isOpen={true} onClose={() => setShowControlsOverlay(false)} />
      )}

      {/* 8. Match Over / Results Modal */}
      {(screenState === 'MATCH_END' || screenState === 'RESULTS') && (
        <MatchOverModal
          isOpen={true}
          score={score}
          p1Name={teamNames.south}
          p2Name={teamNames.north}
          localSide={localSide}
          isOnline={isOnline}
          isHost={isHost}
          onRematch={handleRematch}
          onBackToLobby={isOnline && isHost ? handleHostBackToLobby : undefined}
          onExitToMenu={quitToMenu}
        />
      )}

      {/* Online Multiplayer Lobby Modal */}
      <MultiplayerLobbyModal
        isOpen={showMultiplayer}
        onClose={() => setShowMultiplayer(false)}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onQuickMatch={handleQuickMatch}
        onSlotChange={handleSlotChange}
        onToggleReady={handleToggleReady}
        onToggleBotSlot={handleToggleBotSlot}
        onFillBots={handleFillBots}
        onStartMatch={handleStartMultiplayerMatch}
        onLeaveRoom={handleLeaveRoom}
        onUpdateConfig={handleUpdateRoomConfig}
        currentRoomId={currentRoomId}
        roomConfig={roomConfig}
        slots={lobbySlots}
        mySlot={mySlot}
        isHost={isHost}
        isConnected={isNetConnected}
        isQuickMatching={isQuickMatching}
        connectionStatus={connectionStatus}
        errorMessage={netErrorMessage}
        pingMs={pingMs}
        simulatedLatency={simulatedLatency}
        onToggleSimulatedLatency={handleToggleSimulatedLatency}
      />

      {/* F4 Net Debug HUD Overlay */}
      <NetDebugOverlay
        visible={showNetDebug}
        onToggle={() => setShowNetDebug((prev) => !prev)}
        stats={{
          peerId: multiplayerClientRef.current?.myPlayerId || null,
          role: !isOnline ? 'OFFLINE' : isHost ? 'HOST' : 'CLIENT',
          mySlot: mySlot,
          team: mySlot === 1 || mySlot === 3 ? 'blue' : 'red',
          side: mySlot === 1 || mySlot === 3 ? 'south' : 'north',
          roomCode: currentRoomId,
          pingMs: pingMs,
          snapshotRateHz: multiplayerClientRef.current?.getDebugStats()?.snapshotRateHz ?? 0,
          packetLossPercent: multiplayerClientRef.current?.getDebugStats()?.packetLossPercent ?? 0,
          bufferHealthMs: multiplayerClientRef.current?.getDebugStats()?.bufferHealthMs ?? 0,
          simulatedLatencyMs: multiplayerClientRef.current?.simulatedLatencyMs ?? 0,
          connectionStatus,
          mode: roomConfig.mode,
          channelType: multiplayerClientRef.current?.getDebugStats()?.transport ?? 'Not connected',
        }}
      />
    </div>
  );
}
