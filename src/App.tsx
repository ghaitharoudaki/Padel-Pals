import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  AimAssist,
  BallState,
  CameraPreset,
  COURT_CONFIG,
  Difficulty,
  GameMode,
  HitQuality,
  MatchLength,
  PlayerAppearance,
  DEFAULT_APPEARANCE,
  PlayerCustomization,
  PlayerState,
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
} from './game/player';
import {
  createInitialBall,
  stepBallPhysics,
  strikeBallWithRacket,
  executePadelServe,
  predictBallLanding,
  evaluateContactTiming,
} from './game/physics';
import { isBajadaWindow } from './game/ball';
import {
  awardPoint,
  createInitialScoreState,
  getServePosition,
  getServeTargetBox,
  handleServeFault,
  handleLetServe,
} from './game/rules';
import { buildPadelCourt, CourtVisuals } from './game/court';
import { createCrowdSystem, CrowdSystem } from './game/crowd';
import { buildPadelAvatar, AvatarController, applyAppearance } from './game/avatar';
import { updateBotAI } from './game/bot';
import { padelAudio } from './game/audio';
import { FixedTimestepLoop } from './game/loop';
import { CameraController } from './game/camera';
import { InputManager, SwingIntent } from './game/input';
import { MultiplayerClient, LobbySlot, ClientInputPacket } from './game/multiplayer';
import { GameHUD } from './components/GameHUD';
import { DebugOverlay } from './components/DebugOverlay';
import { MultiplayerLobbyModal } from './components/MultiplayerLobbyModal';
import { CustomizerModal } from './components/CustomizerModal';
import { ControlsGuideModal } from './components/ControlsGuideModal';
import { MatchOverModal } from './components/MatchOverModal';
import { MainMenu } from './components/MainMenu';
import { CountdownOverlay } from './components/CountdownOverlay';
import { PauseOverlay } from './components/PauseOverlay';
import { ProfileModal } from './components/ProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { FeedbackModal } from './components/FeedbackModal';

const isSinglesMode = (mode: GameMode): boolean => mode === '1v1' || mode === 'online-1v1';
const isOnlineMode = (mode: GameMode): boolean =>
  mode === 'online' || mode === 'online-1v1' || mode === 'online-2v2';

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

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);

  // Screen State Machine: BOOT -> MENU -> MODE_SELECT -> LOCKER -> SETTINGS -> HOW_TO_PLAY -> COUNTDOWN -> PLAYING -> PAUSED -> POINT_SCORED -> MATCH_END -> RESULTS
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
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('broadcast');
  const [score, setScore] = useState<ScoreState>(() =>
    createInitialScoreState('south', '1_set', false)
  );
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [pointBanner, setPointBanner] = useState<{ text: string; subtext: string; winner: Side } | null>(
    null
  );
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
  const [fps, setFps] = useState<number>(60);
  const [debugPlayers, setDebugPlayers] = useState<PlayerState[]>([]);

  // Modals
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Customization
  const [p1Custom, setP1Custom] = useState<PlayerCustomization>(DEFAULT_P1_CUSTOM);
  const [p2Custom, setP2Custom] = useState<PlayerCustomization>(DEFAULT_P2_CUSTOM);

  // Guard against double clicks on match start
  const isStartingMatchRef = useRef<boolean>(false);
  const [isMatchTransitioning, setIsMatchTransitioning] = useState<boolean>(false);

  // Multiplayer Netcode State
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [lobbySlots, setLobbySlots] = useState<LobbySlot[]>([]);
  const [mySlot, setMySlot] = useState<1 | 2 | 3 | 4>(1);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isNetConnected, setIsNetConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('disconnected');
  const [netErrorMessage, setNetErrorMessage] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState<number>(0);
  const [simulatedLatency, setSimulatedLatency] = useState<boolean>(false);

  // Authoritative player slots
  const p1Ref = useRef<PlayerState>(
    createPlayerState({
      id: 'p1',
      slot: 1,
      name: 'Player 1',
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

  const ballRef = useRef<BallState>(createInitialBall('south'));
  const scoreRef = useRef<ScoreState>(score);
  const currentShotRef = useRef<ShotType>(currentShot);
  const chargePowerRef = useRef<number>(chargePower);
  const gameModeRef = useRef<GameMode>(gameMode);
  const screenStateRef = useRef<ScreenState>(screenState);
  const botDifficultyRef = useRef<Difficulty>(botDifficulty);
  const cameraPresetRef = useRef<CameraPreset>(cameraPreset);
  const cameraControllerRef = useRef<CameraController | null>(null);

  // Hit-stop freeze frame and slow-motion for bajada
  const hitStopUntilRef = useRef<number>(0);
  const slowMotionUntilRef = useRef<number>(0);
  const slowMotionFactorRef = useRef<number>(1.0);

  // Sync refs
  useEffect(() => {
    screenStateRef.current = screenState;
  }, [screenState]);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
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
    cameraPresetRef.current = cameraPreset;
    cameraControllerRef.current?.setPreset(cameraPreset);
  }, [cameraPreset]);

  const mouseAimRef = useRef<Vector3D>({ x: 0, y: 0, z: -6.0 });
  const multiplayerClientRef = useRef<MultiplayerClient | null>(null);
  const onlineModeRef = useRef<GameMode>('online-2v2');
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

  // URL autostart check (?autostart=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startMatchWithCountdown('2v2');
    }
  }, []);

  // Menu Music loop
  useEffect(() => {
    if (isMenuScreen(screenState) && audioEnabled) {
      padelAudio.startMenuMusic();
    } else {
      padelAudio.stopMenuMusic();
    }
  }, [screenState, audioEnabled]);

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

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
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

    // Point scoring handler with pause & side switch
    function onPointFinished(winner: Side, reason: string) {
      if (pointResetTimerRef.current) return;

      isFrozenRef.current = true;
      ballRef.current.inPlay = false;
      ballRef.current.velocity = { x: 0, y: 0, z: 0 };

      // Referee whistle tweet on point end
      padelAudio.playRefereeWhistle('end');
      courtVisuals.triggerCheerBurst(ballRef.current.position.x, ballRef.current.position.z);

      p1Avatar.playStateAnimation(winner === 'south' ? 'celebrate' : 'sad');
      p3Avatar.playStateAnimation(winner === 'south' ? 'celebrate' : 'sad');
      p2Avatar.playStateAnimation(winner === 'north' ? 'celebrate' : 'sad');
      p4Avatar.playStateAnimation(winner === 'north' ? 'celebrate' : 'sad');

      const targetGames = scoreRef.current.targetGames;
      const result = awardPoint(scoreRef.current, winner, targetGames, scoreRef.current.goldenPoint);
      setScore(result.nextState);
      scoreRef.current = result.nextState;

      // Crowd reaction & procedural audio based on match outcome
      const reasonLower = reason.toLowerCase();
      const isDoubleFault = reasonLower.includes('double fault');
      const isUnforcedError =
        reasonLower.includes('fault') || reasonLower.includes('out') || reasonLower.includes('net');
      const isSmashWinner = reasonLower.includes('smash') || currentShotRef.current === 'smash';
      const isLongRally = scoreRef.current.rallyCount >= 8;

      if (isDoubleFault || (isUnforcedError && !isSmashWinner && !isLongRally)) {
        // Boo/groan on double faults and unforced errors, fans put heads in hands
        padelAudio.playCrowdGroan();
        crowdSystem.triggerReaction('miss', 2.2);
      } else if (isSmashWinner || isLongRally) {
        // Big roar on smash winner or 8+ hit rally
        padelAudio.playBigRoar();
        crowdSystem.triggerReaction('cheer', 3.2);
      } else {
        // Cheer + clap on standard point won
        padelAudio.playCrowdCheer();
        crowdSystem.triggerReaction('cheer', 2.5);
      }

      const winnerName =
        winner === 'south'
          ? p1Custom.name
          : gameModeRef.current === 'online'
          ? p2Custom.name
          : 'Alejandro';

      let subtext = `${reason} • SCORE: ${result.nextState.points[0]} - ${result.nextState.points[1]}`;
      if (result.sideSwitch) {
        subtext += ' [SWITCH ENDS]';
      }

      setPointBanner({
        text: `${winnerName.toUpperCase()} SCORED!`,
        subtext,
        winner,
      });

      if (result.matchWon) {
        padelAudio.playVictoryCheer();
        setScreenState('MATCH_END');
        screenStateRef.current = 'MATCH_END';
      } else {
        setScreenState('POINT_SCORED');
        screenStateRef.current = 'POINT_SCORED';
      }

      multiplayerClientRef.current?.broadcastPointScored(winner, result.nextState);

      pointResetTimerRef.current = window.setTimeout(() => {
        pointResetTimerRef.current = null;
        isFrozenRef.current = false;
        setPointBanner(null);
        setScreenState('PLAYING');
        screenStateRef.current = 'PLAYING';

        const nextServing = result.nextState.servingSide;
        p1Ref.current.isServing = nextServing === p1Ref.current.side;
        p2Ref.current.isServing = nextServing === p2Ref.current.side;

        // Referee whistle for new serve / point start
        padelAudio.playRefereeWhistle('start');

        // Check if next point is Game Point / Match Point: trigger stadium chant
        const isGamePoint =
          (result.nextState.rawPoints[0] >= 3 && result.nextState.rawPoints[0] > result.nextState.rawPoints[1]) ||
          (result.nextState.rawPoints[1] >= 3 && result.nextState.rawPoints[1] > result.nextState.rawPoints[0]) ||
          (result.nextState.goldenPoint && result.nextState.rawPoints[0] === 3 && result.nextState.rawPoints[1] === 3);
        if (isGamePoint) {
          padelAudio.playGamePointChant();
        }

        const isD = gameModeRef.current !== '1v1';
        const serveX = getServePosition(getServeTargetBox(result.nextState));
        setPlayerPosition(p1Ref.current, {
          x: isD ? serveX : 0,
          y: 0,
          z: p1Ref.current.side === 'south' ? 7.2 : -7.2,
        });
        setPlayerPosition(p3Ref.current, { x: 2.0, y: 0, z: 7.2 });
        setPlayerPosition(p2Ref.current, {
          x: isD ? serveX : 0,
          y: 0,
          z: p2Ref.current.side === 'south' ? 7.2 : -7.2,
        });
        setPlayerPosition(p4Ref.current, { x: 2.0, y: 0, z: -7.2 });

        const freshBall = createInitialBall(
          nextServing,
          nextServing === 'south' ? p1Ref.current.position : p2Ref.current.position
        );
        ballRef.current = freshBall;
      }, 3000);
    }

    // Swing execution with ONE hit button and auto-aim
    function executeSwing(intent: SwingIntent) {
      const p1 = p1Ref.current;
      const b = ballRef.current;

      // 1. Legal Underhand Serve
      if (p1.isServing && !b.inPlay) {
        p1.isSwinging = true;
        p1.racketSwingProgress = 0;
        p1.swingSide = 'serve';

        const targetBox = getServeTargetBox(scoreRef.current);
        const newBall = executePadelServe(b, p1.side, targetBox, intent.power);
        ballRef.current = newBall;
        p1.isServing = false;
        padelAudio.playRacketHit(intent.power, 'flat', 'GOOD', p1.position);
        padelAudio.updateRallyTension(scoreRef.current.rallyCount, true);
        triggerHitFeedback('UNDERHAND SERVE IN!');
        if (isOnlineMode(gameModeRef.current) && !multiplayerClientRef.current?.isHost) {
          multiplayerClientRef.current?.sendInput({
            dt: 0.016,
            moveX: 0,
            moveZ: 0,
            isJumping: false,
            wantsSwing: true,
            shotType: 'flat',
            power: intent.power,
            aimX: targetBox === 'left' ? -2.5 : 2.5,
            aimZ: -6.0,
          });
        }
        return;
      }

      p1.isSwinging = true;
      p1.racketSwingProgress = 0;

      // Forehand vs Backhand detection
      const dx = b.position.x - p1.position.x;
      p1.swingSide = b.position.y > 1.65 ? 'overhead' : (dx >= 0 ? 'forehand' : 'backhand');

      // Check contact timing quality
      const timing = evaluateContactTiming(p1.position, b.position, p1.side);

      if (timing.quality !== 'OUT_OF_REACH') {
        // Determine shot type using modifiers
        const isBajadaEligible = isBajadaWindow(b, p1.position, p1.side);
        let selectedShot: ShotType = intent.shot;

        if (intent.isJumpHit || p1.isJumping || b.position.y > 1.65) {
          selectedShot = 'smash';
        } else if (isBajadaEligible) {
          selectedShot = 'bajada';
        } else if (selectedShot === 'flat' && intent.power > 0.75) {
          selectedShot = 'topspin';
        }

        const effectivePower = Math.min(1.0, intent.power * timing.powerMultiplier);
        const aimTarget = intent.targetAim || mouseAimRef.current;
        const struck = strikeBallWithRacket(
          b,
          p1.side,
          selectedShot,
          effectivePower,
          aimTarget,
          p1.position,
          intent.bias,
          timing.quality,
          aimAssistRef.current
        );
        ballRef.current = struck;
        currentShotRef.current = selectedShot;
        setCurrentShot(selectedShot);

        padelAudio.playRacketHit(effectivePower, selectedShot, timing.quality, p1.position);
        p1Avatar.triggerHitPop();

        // Crowd reaction on smashes: hands up in the air!
        if (selectedShot === 'smash') {
          crowdSystem.triggerReaction('smash', 1.5);
        }

        // Feel Fix 1: Hit-Stop freeze (40-70 ms)
        if (timing.quality === 'PERFECT' || selectedShot === 'smash') {
          hitStopUntilRef.current = performance.now() + 65;
        } else {
          hitStopUntilRef.current = performance.now() + 40;
        }

        // Feel Fix 2: Golden spark VFX on PERFECT hit
        if (timing.quality === 'PERFECT') {
          triggerSparkBurstRef.current?.(b.position);
          triggerHitFeedback(selectedShot === 'smash' ? 'SMASH! ⚡' : 'PERFECT SWEETSPOT! 🎯');
        } else if (timing.quality === 'EARLY') {
          triggerHitFeedback('EARLY (PULLED)');
        } else if (timing.quality === 'LATE') {
          triggerHitFeedback('LATE REACH');
        } else {
          triggerHitFeedback('CLEAN HIT');
        }

        // Feel Fix 3: Camera shake on smashes
        if (selectedShot === 'smash') {
          cameraController.triggerShake(0.42, 0.25);
        }

        // Feel Fix 4: Bajada slow-motion arcade window (~120ms at 0.35x speed)
        if (selectedShot === 'bajada') {
          slowMotionUntilRef.current = performance.now() + 140;
          slowMotionFactorRef.current = 0.35;
          triggerHitFeedback('BAJADA! 💥');
        }

        if (isOnlineMode(gameModeRef.current) && !multiplayerClientRef.current?.isHost) {
          multiplayerClientRef.current?.sendInput({
            dt: 0.016,
            moveX: 0,
            moveZ: 0,
            isJumping: p1.isJumping,
            wantsSwing: true,
            shotType: selectedShot,
            power: effectivePower,
            aimX: mouseAimRef.current.x,
            aimZ: mouseAimRef.current.z,
            bias: intent.bias,
          });
        }
      } else {
        triggerHitFeedback('WHIFF (MISSED)');
      }
    }

    // Unified Input Manager
    const inputManager = new InputManager({
      mountElement: mountRef.current,
      camera: cameraController.camera,
      onSwing: (intent) => {
        // Contextualize shot type from modifiers held at hit time
        const isBajada = isBajadaWindow(ballRef.current, p1Ref.current.position, 'south');
        const isHigh = p1Ref.current.isJumping || ballRef.current.position.y > 1.65;
        const resolvedShot = inputManager.determineShotType(isHigh, isBajada);
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
        if (!p1Ref.current.isJumping) {
          p1Ref.current.isJumping = true;
          p1Ref.current.jumpY = 0.75;
        }
      },
    });
    inputManagerRef.current = inputManager;

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraController.updateAspect(w, h);
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

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
    let lastInputSendTime = 0;
    const camForwardVec = new THREE.Vector3();
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

    // 60 Hz Fixed-Timestep Loop
    const gameLoop = new FixedTimestepLoop(
      {
        fixedUpdate: (fixedDt) => {
          const now = performance.now();

          // Only simulate match physics, AI, and audio when in PLAYING or POINT_SCORED states
          if (screenStateRef.current !== 'PLAYING' && screenStateRef.current !== 'POINT_SCORED') {
            return;
          }

          // Hit-stop freeze frame check (40-70 ms)
          if (now < hitStopUntilRef.current) {
            return;
          }

          // Slow-motion window (for bajada)
          let effectiveDt = fixedDt;
          if (now < slowMotionUntilRef.current) {
            effectiveDt *= slowMotionFactorRef.current;
          }

          const isDoubles = !isSinglesMode(gameModeRef.current);
          const p1 = p1Ref.current;
          const p2 = p2Ref.current;
          const p3 = p3Ref.current;
          const p4 = p4Ref.current;

          players.forEach((player) => {
            previousPositions[player.id] = { ...player.position };
          });
          previousBallPosition = { ...ballRef.current.position };

          // Online Client-Side Prediction & Interpolation
          const onlineMatch = isOnlineMode(gameModeRef.current);
          const isOnlineClient =
            onlineMatch && !multiplayerClientRef.current?.isHost;

          if (isOnlineClient) {
            // 1. Send client input at 30-60 Hz
            if (now - lastInputSendTime > 20) {
              const moveInput = inputManager.getMovementInput();
              multiplayerClientRef.current?.sendInput({
                dt: effectiveDt,
                moveX: moveInput.x,
                moveZ: moveInput.z,
                isJumping: p1.isJumping,
                wantsSwing: false,
                shotType: currentShotRef.current,
                power: chargePowerRef.current,
                aimX: mouseAimRef.current.x,
                aimZ: mouseAimRef.current.z,
              });
              lastInputSendTime = now;
            }

            // 2. Client-side prediction for local player movement
            if (!isFrozenRef.current) {
              const moveInput = inputManager.getMovementInput();
              updatePlayerMovement(p1, moveInput, effectiveDt, isDoubles);
            }
            if (p1.isSwinging) {
              p1.racketSwingProgress += effectiveDt * 4.8;
              if (p1.racketSwingProgress >= 1.0) {
                p1.isSwinging = false;
                p1.racketSwingProgress = 0;
              }
            }

            // 3. Interpolate remote players from buffer
            const remoteHumanSlot = multiplayerClientRef.current?.mySlot === 2 ? 1 : 2;
            const interpP2 = multiplayerClientRef.current?.getInterpolatedPlayer(remoteHumanSlot);
            if (interpP2) {
              p2.position.x = interpP2.x;
              p2.position.y = interpP2.y;
              p2.position.z = interpP2.z;
              p2.velocity.x = interpP2.vx;
              p2.velocity.z = interpP2.vz;
              p2.isSwinging = interpP2.sw;
              p2.racketSwingProgress = interpP2.sp;
              p2.swingSide = interpP2.ss;
              p2.currentShotType = interpP2.st;
            }

            const interpP3 = multiplayerClientRef.current?.getInterpolatedPlayer(3);
            if (interpP3) {
              p3.position.x = interpP3.x;
              p3.position.y = interpP3.y;
              p3.position.z = interpP3.z;
              p3.velocity.x = interpP3.vx;
              p3.velocity.z = interpP3.vz;
              p3.isSwinging = interpP3.sw;
              p3.racketSwingProgress = interpP3.sp;
              p3.swingSide = interpP3.ss;
              p3.currentShotType = interpP3.st;
            }

            const interpP4 = multiplayerClientRef.current?.getInterpolatedPlayer(4);
            if (interpP4) {
              p4.position.x = interpP4.x;
              p4.position.y = interpP4.y;
              p4.position.z = interpP4.z;
              p4.velocity.x = interpP4.vx;
              p4.velocity.z = interpP4.vz;
              p4.isSwinging = interpP4.sw;
              p4.racketSwingProgress = interpP4.sp;
              p4.swingSide = interpP4.ss;
              p4.currentShotType = interpP4.st;
            }

            // 4. Smooth ball position from authoritative host (never teleport)
            const smoothedBall = multiplayerClientRef.current?.getSmoothedBall(
              ballRef.current.position,
              effectiveDt
            );
            if (smoothedBall) {
              ballRef.current.position.x = smoothedBall.x;
              ballRef.current.position.y = smoothedBall.y;
              ballRef.current.position.z = smoothedBall.z;
            }
            return;
          }

          // A. Player 1 Movement (WASD/arrows, acceleration, sprint ~6m/s, strict half-court)
          if (isFrozenRef.current) {
            p1.state = 'Frozen';
            p1.velocity.x = 0;
            p1.velocity.z = 0;
          } else {
            const moveInput = inputManager.getMovementInput();
            updatePlayerMovement(p1, moveInput, effectiveDt, isDoubles);
          }

          if (p1.isSwinging) {
            p1.racketSwingProgress += effectiveDt * 4.8;
            if (p1.racketSwingProgress >= 1.0) {
              p1.isSwinging = false;
              p1.racketSwingProgress = 0;
            }
          }

          // B. Teammate (P3 Carlos) AI Update
          if (isDoubles && p3.isBot && !isOnlineClient) {
            const p3Decision = updateBotAI(p3, ballRef.current, p2, botDifficultyRef.current, effectiveDt, true, p1);
            p3.velocity = p3Decision.velocity;
            advancePlayer(p3, effectiveDt);
            p3.swingSide = p3Decision.swingSide;
            p3.currentShotType = p3Decision.shotType;
            p3.state = p3Decision.stateDescription;

            if (p3Decision.wantsToSwing) {
              p3.isSwinging = true;
              p3.racketSwingProgress = 0;
              const struck = strikeBallWithRacket(
                ballRef.current,
                p3.side,
                p3Decision.shotType,
                p3Decision.power,
                p3Decision.targetAim,
                p3.position,
                undefined,
                p3Decision.timingQuality
              );
              ballRef.current = struck;
              padelAudio.playRacketHit(p3Decision.power, p3Decision.shotType, p3Decision.timingQuality, p3.position);
              p3Avatar.triggerHitPop();
              if (p3Decision.shotType === 'smash') {
                crowdSystem.triggerReaction('smash', 1.4);
              }
            }

            if (p3.isSwinging) {
              p3.racketSwingProgress += effectiveDt * 4.8;
              if (p3.racketSwingProgress >= 1.0) {
                p3.isSwinging = false;
                p3.racketSwingProgress = 0;
              }
            }
          }

          // C. North Opponent (P2 Alejandro) AI Update
          if (p2.isBot && !isOnlineClient) {
            const p2Decision = updateBotAI(p2, ballRef.current, p1, botDifficultyRef.current, effectiveDt, isDoubles, p4);
            p2.velocity = p2Decision.velocity;
            advancePlayer(p2, effectiveDt);
            p2.swingSide = p2Decision.swingSide;
            p2.currentShotType = p2Decision.shotType;
            p2.state = p2Decision.stateDescription;

            if (p2Decision.wantsToSwing) {
              p2.isSwinging = true;
              p2.racketSwingProgress = 0;
              if (p2.isServing && !ballRef.current.inPlay) {
                const targetBox = getServeTargetBox(scoreRef.current);
                const struck = executePadelServe(ballRef.current, p2.side, targetBox, p2Decision.power);
                ballRef.current = struck;
                p2.isServing = false;
                padelAudio.playRacketHit(p2Decision.power, p2Decision.shotType, 'GOOD', p2.position);
                padelAudio.updateRallyTension(scoreRef.current.rallyCount, true);
              } else {
                const struck = strikeBallWithRacket(
                  ballRef.current,
                  p2.side,
                  p2Decision.shotType,
                  p2Decision.power,
                  p2Decision.targetAim,
                  p2.position,
                  undefined,
                  p2Decision.timingQuality
                );
                ballRef.current = struck;
                padelAudio.playRacketHit(p2Decision.power, p2Decision.shotType, p2Decision.timingQuality, p2.position);
                p2Avatar.triggerHitPop();
                if (p2Decision.shotType === 'smash') {
                  crowdSystem.triggerReaction('smash', 1.4);
                }
              }
            }

            if (p2.isSwinging) {
              p2.racketSwingProgress += effectiveDt * 4.8;
              if (p2.racketSwingProgress >= 1.0) {
                p2.isSwinging = false;
                p2.racketSwingProgress = 0;
              }
            }

            // D. North Partner (P4 Mateo) AI Update
            if (isDoubles && p4.isBot && !isOnlineClient) {
              const p4Decision = updateBotAI(p4, ballRef.current, p3, botDifficultyRef.current, effectiveDt, true, p2);
              p4.velocity = p4Decision.velocity;
              advancePlayer(p4, effectiveDt);
              p4.swingSide = p4Decision.swingSide;
              p4.currentShotType = p4Decision.shotType;
              p4.state = p4Decision.stateDescription;

              if (p4Decision.wantsToSwing) {
                p4.isSwinging = true;
                p4.racketSwingProgress = 0;
                const struck = strikeBallWithRacket(
                  ballRef.current,
                  p4.side,
                  p4Decision.shotType,
                  p4Decision.power,
                  p4Decision.targetAim,
                  p4.position,
                  undefined,
                  p4Decision.timingQuality
                );
                ballRef.current = struck;
                padelAudio.playRacketHit(p4Decision.power, p4Decision.shotType, p4Decision.timingQuality, p4.position);
                p4Avatar.triggerHitPop();
                if (p4Decision.shotType === 'smash') {
                  crowdSystem.triggerReaction('smash', 1.4);
                }
              }

              if (p4.isSwinging) {
                p4.racketSwingProgress += effectiveDt * 4.8;
                if (p4.racketSwingProgress >= 1.0) {
                  p4.isSwinging = false;
                  p4.racketSwingProgress = 0;
                }
              }
            }
          }

          // E. Continuous Collision Detection (CCD) Ball Physics
          if (!isFrozenRef.current) {
            const phys = stepBallPhysics(ballRef.current, effectiveDt);
            ballRef.current = phys.ball;

            padelAudio.updateRallyTension(scoreRef.current.rallyCount, ballRef.current.inPlay);

            if (phys.events.bouncedFloor) {
              padelAudio.playTurfBounce(Math.abs(phys.ball.velocity.y), phys.ball.position);
            }
            if (phys.events.bouncedGlassWall) {
              padelAudio.playGlassRebound(
                Math.hypot(phys.ball.velocity.x, phys.ball.velocity.z),
                phys.ball.position
              );
            }
            if (phys.events.bouncedMeshWall) {
              padelAudio.playMeshFenceRebound(phys.ball.position);
            }
            if (phys.events.hitNet || phys.events.netTapeHit) {
              padelAudio.playNetHit(phys.ball.position);
              padelAudio.playCrowdOoooh();
              crowdSystem.triggerReaction('smash', 1.0);
            }

            // Let serve handling
            if (phys.events.isLetServe) {
              const replayed = handleLetServe(scoreRef.current);
              setScore(replayed);
              scoreRef.current = replayed;
              triggerHitFeedback('LET! REPLAY SERVE');
              // Reset serve ball to server
              ballRef.current = createInitialBall(
                replayed.servingSide,
                replayed.servingSide === 'south' ? p1Ref.current.position : p2Ref.current.position
              );
              return;
            }

            // Point concluded / fault handling
            if (phys.events.pointFault) {
              if (ballRef.current.isServe) {
                // Serve Fault
                const faultRes = handleServeFault(scoreRef.current, scoreRef.current.targetGames);
                setScore(faultRes.nextState);
                scoreRef.current = faultRes.nextState;

                if (faultRes.nextState.serveAttempt === 2) {
                  // 1st serve fault -> 2nd serve
                  triggerHitFeedback('1ST SERVE FAULT');
                  ballRef.current = createInitialBall(
                    faultRes.nextState.servingSide,
                    faultRes.nextState.servingSide === 'south'
                      ? p1Ref.current.position
                      : p2Ref.current.position
                  );
                } else {
                  // Double fault point to opponent!
                  const winner: Side = faultRes.nextState.servingSide === 'south' ? 'north' : 'south';
                  onPointFinished(winner, 'Double fault! Point to receiver');
                }
              } else {
                // Rally fault: awarded deterministically to faultWinner
                const winner: Side =
                  phys.events.faultWinner ||
                  (ballRef.current.lastHitter === 'south' ? 'north' : 'south');
                const reason =
                  phys.events.shortReason ||
                  phys.events.faultReason ||
                  'Point concluded';
                onPointFinished(winner, reason);
              }
            }
          }

          // Host Authoritative: Broadcast 30 Hz snapshot in online mode
          if (onlineMatch && multiplayerClientRef.current?.isHost) {
            if (now - lastSnapshotBroadcastTime > 33) {
              multiplayerClientRef.current?.broadcastSnapshot(
                ballRef.current,
                [p1Ref.current, p2Ref.current, p3Ref.current, p4Ref.current],
                scoreRef.current
              );
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

          inputManager.update(now);

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

          const isMatchActive = currentScreen === 'PLAYING';

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
            scene.background = new THREE.Color(0x1a120c);
            scene.fog?.color.set(0x1a120c);
            ambientLight.color.set(0xffd8b0);
            ambientLight.intensity = 0.9;
            mainSun.color.set(0xffaa44);
            mainSun.position.set(18, 10, 14);
            mainSun.intensity = 2.2;
            arenaFill.color.set(0xff7722);
          } else {
            scene.background = new THREE.Color(0x0a0f1d);
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

            // P1 Avatar
            const p1TargetAngle = isMatchActive
              ? Math.atan2(
                  mouseAimRef.current.x - p1.position.x,
                  mouseAimRef.current.z - p1.position.z
                )
              : p1.side === 'south'
              ? Math.PI
              : 0;
            p1Avatar.updateKinematics(
              dt,
              isMatchActive ? p1.velocity : { x: 0, z: 0 },
              p1.racketSwingProgress,
              p1.isSwinging,
              currentShotRef.current,
              p1TargetAngle,
              ballRef.current.position,
              p1.swingSide
            );

            // P2 Avatar (Opponent Bot)
            const p2TargetAngle = isMatchActive
              ? Math.atan2(
                  p1.position.x - p2.position.x,
                  p1.position.z - p2.position.z
                )
              : p2.side === 'south'
              ? Math.PI
              : 0;
            p2Avatar.updateKinematics(
              dt,
              isMatchActive ? p2.velocity : { x: 0, z: 0 },
              p2.racketSwingProgress,
              p2.isSwinging,
              p2.currentShotType,
              p2TargetAngle,
              ballRef.current.position,
              p2.swingSide
            );

            // P3 Avatar (Teammate Bot)
            if (isDoubles) {
              const p3TargetAngle = isMatchActive
                ? Math.atan2(
                    ballRef.current.position.x - p3.position.x,
                    ballRef.current.position.z - p3.position.z
                  )
                : p3.side === 'south'
                ? Math.PI
                : 0;
              p3Avatar.updateKinematics(
                dt,
                isMatchActive ? p3.velocity : { x: 0, z: 0 },
                p3.racketSwingProgress,
                p3.isSwinging,
                p3.currentShotType,
                p3TargetAngle,
                ballRef.current.position,
                p3.swingSide
              );

              // P4 Avatar (Opponent Partner)
              const p4TargetAngle = isMatchActive
                ? Math.atan2(
                    p3.position.x - p4.position.x,
                    p3.position.z - p4.position.z
                  )
                : p4.side === 'south'
                ? Math.PI
                : 0;
              p4Avatar.updateKinematics(
                dt,
                isMatchActive ? p4.velocity : { x: 0, z: 0 },
                p4.racketSwingProgress,
                p4.isSwinging,
                p4.currentShotType,
                p4TargetAngle,
                ballRef.current.position,
                p4.swingSide
              );
            }
          }

          courtVisuals.updateShadows(
            ballMesh.position,
            p1Avatar.group.position,
            p2Avatar.group.position,
            p3Avatar.group.position,
            p4Avatar.group.position,
            isDoubles
          );

          // Camera update smoothly following ball and player
          cameraController.update(dt, isMenu, p1.position, ballMesh.position);

          // Spatial Audio Listener sync to 3D Camera
          cameraController.camera.getWorldDirection(camForwardVec);
          padelAudio.updateListener(cameraController.camera.position, camForwardVec);

          // Footstep audio on player athletic run
          if (!isMenu && !isFrozenRef.current && Math.hypot(p1.velocity.x, p1.velocity.z) > 2.0) {
            if (now - lastFootstepTime > 320) {
              padelAudio.playFootstep('turf', p1.position);
              lastFootstepTime = now;
            }
          }

          const isCheering = isMenu ? Math.sin(now / 2000) > 0.4 : feedbackTimerRef.current !== null;
          courtVisuals.updateCrowd(now / 1000, dt, isCheering);

          // 300+ Low-Poly Chibi Crowd Animation
          crowdSystem.update(now / 1000, dt);

          renderer.render(scene, cameraController.camera);

          if (now - lastDebugSync > 100) {
            lastDebugSync = now;
            setFps(gameLoop.currentFps);
            setDebugPlayers([{ ...p1 }, { ...p3 }, { ...p2 }, { ...p4 }]);
          }
        },
      },
      isSoftwareGl,
      renderer
    );

    gameLoop.start();

    return () => {
      gameLoop.stop();
      crowdSystem.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      confettiGeo.dispose();
      confettiMat.dispose();
      multiplayerClientRef.current?.disconnect();
      inputManager.dispose();
      inputManagerRef.current = null;
      window.removeEventListener('resize', handleResize);
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

    const isD = !isSinglesMode(mode);
    const localIsNorth = isOnlineMode(mode) && multiplayerClientRef.current?.mySlot === 2;
    p1Ref.current.side = localIsNorth ? 'north' : 'south';
    p1Ref.current.team = localIsNorth ? 'red' : 'blue';
    p2Ref.current.side = localIsNorth ? 'south' : 'north';
    p2Ref.current.team = localIsNorth ? 'blue' : 'red';
    setPlayerPosition(p1Ref.current, { x: isD ? -2.0 : 0, y: 0, z: localIsNorth ? -7.2 : 7.2 });
    setPlayerPosition(p3Ref.current, { x: 2.0, y: 0, z: 7.2 });
    setPlayerPosition(p2Ref.current, { x: isD ? -2.0 : 0, y: 0, z: localIsNorth ? 7.2 : -7.2 });
    setPlayerPosition(p4Ref.current, { x: 2.0, y: 0, z: -7.2 });
    const servingSide = scoreRef.current.servingSide;
    const server = servingSide === p1Ref.current.side ? p1Ref.current : p2Ref.current;
    ballRef.current = createInitialBall(servingSide, server.position);
  };

  const ensureMultiplayerClient = () => {
    if (!multiplayerClientRef.current) {
      multiplayerClientRef.current = new MultiplayerClient({
        onLobbyUpdated: (slots, hostStatus, assignedSlot) => {
          setLobbySlots([...slots]);
          setIsHost(hostStatus);
          setMySlot(assignedSlot);
          setIsNetConnected(true);

          // Sync appearances for all 4 slots
          slots.forEach((s) => {
            if (s.slot === 1) {
              p1Ref.current.name = s.playerName;
              p1Ref.current.customization = s.appearance;
              avatarsRef.current.p1?.applyAppearance(s.appearance);
            } else if (s.slot === 2) {
              p2Ref.current.name = s.playerName;
              p2Ref.current.customization = s.appearance;
              p2Ref.current.isBot = s.isBot;
              setP2Custom(s.appearance);
              avatarsRef.current.p2?.applyAppearance(s.appearance);
            } else if (s.slot === 3) {
              p3Ref.current.name = s.playerName;
              p3Ref.current.customization = s.appearance;
              p3Ref.current.isBot = s.isBot;
              avatarsRef.current.p3?.applyAppearance(s.appearance);
            } else if (s.slot === 4) {
              p4Ref.current.name = s.playerName;
              p4Ref.current.customization = s.appearance;
              p4Ref.current.isBot = s.isBot;
              avatarsRef.current.p4?.applyAppearance(s.appearance);
            }
          });
        },
        onMatchStarted: () => {
          setShowMultiplayer(false);
          handleModeChange(onlineModeRef.current);
          startMatchWithCountdown(onlineModeRef.current);
        },
        onSnapshotReceived: (snapshot) => {
          if (multiplayerClientRef.current?.isHost) return;

          // Remote players position & animation updates
          snapshot.p.forEach((ps) => {
            const clientIsNorth = multiplayerClientRef.current?.mySlot === 2;
            const target = clientIsNorth
              ? ps.s === 2
                ? p1Ref.current
                : ps.s === 1
                ? p2Ref.current
                : ps.s === 3
                ? p3Ref.current
                : p4Ref.current
              : ps.s === 1
              ? p1Ref.current
              : ps.s === 2
              ? p2Ref.current
              : ps.s === 3
              ? p3Ref.current
              : p4Ref.current;

            // Don't overwrite local prediction for my own slot unless divergence is large
            if (ps.s === multiplayerClientRef.current?.mySlot) {
              const dx = target.position.x - ps.x;
              const dz = target.position.z - ps.z;
              if (Math.hypot(dx, dz) > 0.45) {
                target.position.x = ps.x;
                target.position.z = ps.z;
              }
            } else {
              target.position.x = ps.x;
              target.position.y = ps.y;
              target.position.z = ps.z;
              target.velocity.x = ps.vx;
              target.velocity.z = ps.vz;
              target.isSwinging = ps.sw;
              target.racketSwingProgress = ps.sp;
              target.swingSide = ps.ss;
              target.currentShotType = ps.st;
            }
          });

          // Ball state
          const b = snapshot.b;
          ballRef.current.velocity.x = b[3];
          ballRef.current.velocity.y = b[4];
          ballRef.current.velocity.z = b[5];
          ballRef.current.inPlay = b[6];
          ballRef.current.lastHitter = b[7];
          ballRef.current.bounceCount = b[8];

          // Score state
          scoreRef.current.games = snapshot.sc.g;
          scoreRef.current.points = snapshot.sc.pts;
          scoreRef.current.rawPoints = snapshot.sc.raw;
          scoreRef.current.servingSide = snapshot.sc.s;
          scoreRef.current.rallyCount = snapshot.sc.r;
          setScore({ ...scoreRef.current });
        },
        onClientInputReceived: (_playerId, slot, input) => {
          if (!multiplayerClientRef.current?.isHost) return;

          const target =
            slot === 1
              ? p1Ref.current
              : slot === 2
              ? p2Ref.current
              : slot === 3
              ? p3Ref.current
              : p4Ref.current;

          target.velocity.x = input.moveX * 5.5;
          target.velocity.z = input.moveZ * 5.5;
          if (input.isJumping && !target.isJumping) {
            target.isJumping = true;
            target.jumpY = 0.75;
          }

          if (input.wantsSwing) {
            target.isSwinging = true;
            target.racketSwingProgress = 0;
            target.currentShotType = input.shotType;
            const struck = strikeBallWithRacket(
              ballRef.current,
              target.side,
              input.shotType,
              input.power,
              { x: input.aimX, y: 0, z: input.aimZ },
              target.position,
              input.bias,
              'GOOD'
            );
            ballRef.current = struck;
            padelAudio.playRacketHit(input.power, input.shotType, 'GOOD', target.position);
          }
        },
        onPointScoredReceived: (_winner, nextScore) => {
          setScore(nextScore);
          scoreRef.current = nextScore;
        },
        onHostDisconnected: () => {
          triggerHitFeedback('HOST LEFT - RETURNING TO LOBBY');
          setScreenState('MENU');
          setShowMultiplayer(true);
          setConnectionStatus('disconnected');
          setNetErrorMessage('The host left the match.');
        },
        onPingUpdated: (p) => setPingMs(p),
        onConnectionStatusChanged: (status, err) => {
          setConnectionStatus(status);
          if (err) setNetErrorMessage(err);
          if (status === 'connected') {
            setIsNetConnected(true);
            setNetErrorMessage(null);
          }
        },
      });
    }
    return multiplayerClientRef.current;
  };

  const handleCreateRoom = (customCode?: string) => {
    const client = ensureMultiplayerClient();
    const code = customCode || MultiplayerClient.generateRoomCode();
    setCurrentRoomId(code);
    client.createRoom(code, p1Custom);
  };

  const handleJoinRoom = (code: string) => {
    const client = ensureMultiplayerClient();
    const clean = code.toUpperCase().trim();
    setCurrentRoomId(clean);
    client.joinRoom(clean, p1Custom);
  };

  const handleQuickMatch = () => {
    handleCreateRoom();
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

  const handleStartMultiplayerMatch = (mode: '1v1' | '2v2') => {
    onlineModeRef.current = mode === '1v1' ? 'online-1v1' : 'online-2v2';
    multiplayerClientRef.current?.startMatch();
  };

  const handleLeaveRoom = () => {
    multiplayerClientRef.current?.disconnect();
    setCurrentRoomId(null);
    setLobbySlots([]);
    setIsNetConnected(false);
    setConnectionStatus('disconnected');
  };

  const handleToggleSimulatedLatency = (enabled: boolean) => {
    setSimulatedLatency(enabled);
    if (multiplayerClientRef.current) {
      multiplayerClientRef.current.simulatedLatencyMs = enabled ? 150 : 0;
      multiplayerClientRef.current.simulatedPacketLossRate = enabled ? 0.05 : 0;
    }
  };

  // Start match flow with clean countdown transition and double-click guard
  const startMatchWithCountdown = (mode: GameMode, diff?: Difficulty, len?: MatchLength) => {
    if (isStartingMatchRef.current) return;
    isStartingMatchRef.current = true;

    if (diff) {
      setBotDifficulty(diff);
      botDifficultyRef.current = diff;
    }
    if (len) {
      setMatchLength(len);
    }
    handleModeChange(mode);

    const targetLength = len || matchLength;
    const initScore = createInitialScoreState('south', targetLength, goldenPoint);
    setScore(initScore);
    scoreRef.current = initScore;

    const isD = !isSinglesMode(mode);
    setPlayerPosition(p1Ref.current, { x: isD ? -2.0 : 0, y: 0, z: 7.2 });
    p1Ref.current.isServing = true;
    p1Ref.current.velocity = { x: 0, y: 0, z: 0 };
    setPlayerPosition(p3Ref.current, { x: 2.0, y: 0, z: 7.2 });
    p3Ref.current.velocity = { x: 0, y: 0, z: 0 };
    setPlayerPosition(p2Ref.current, { x: isD ? -2.0 : 0, y: 0, z: -7.2 });
    p2Ref.current.isServing = false;
    p2Ref.current.velocity = { x: 0, y: 0, z: 0 };
    setPlayerPosition(p4Ref.current, { x: 2.0, y: 0, z: -7.2 });
    p4Ref.current.velocity = { x: 0, y: 0, z: 0 };

    const servingSide = scoreRef.current.servingSide;
    const server = servingSide === p1Ref.current.side ? p1Ref.current : p2Ref.current;
    ballRef.current = createInitialBall(servingSide, server.position);
    isFrozenRef.current = false;
    setPointBanner(null);

    // Stop menu music
    padelAudio.stopMenuMusic();

    if (isMenuScreen(screenStateRef.current)) {
      // Smooth camera push-in towards court, fade into countdown (Phase C)
      setIsMatchTransitioning(true);
      cameraControllerRef.current?.startPlayPushIn(() => {
        cameraControllerRef.current?.snapToMatchPreset();
        setScreenState('COUNTDOWN');
        screenStateRef.current = 'COUNTDOWN';
        setIsMatchTransitioning(false);
        isStartingMatchRef.current = false;
      });
    } else {
      cameraControllerRef.current?.snapToMatchPreset();
      setScreenState('COUNTDOWN');
      screenStateRef.current = 'COUNTDOWN';
      isStartingMatchRef.current = false;
    }
  };

  const handleCountdownComplete = useCallback(() => {
    isStartingMatchRef.current = false;
    setScreenState('PLAYING');
    screenStateRef.current = 'PLAYING';
    padelAudio.playRefereeWhistle('start');
  }, []);

  const quitToMenu = () => {
    isStartingMatchRef.current = false;
    setIsMatchTransitioning(false);
    if (pointResetTimerRef.current) {
      clearTimeout(pointResetTimerRef.current);
      pointResetTimerRef.current = null;
    }
    isFrozenRef.current = false;
    setPointBanner(null);
    padelAudio.stopAllCrowdAudio();
    cameraControllerRef.current?.snapToMenuOrbit();
    setScreenState('MENU');
  };

  // Keyboard shortcut: ESC toggles pause during match play
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (screenStateRef.current === 'PLAYING') {
          setScreenState('PAUSED');
        } else if (screenStateRef.current === 'PAUSED') {
          setScreenState('PLAYING');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-950 font-sans select-none text-white">
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-crosshair" />

      {/* Smooth Match Transition Push-In Fade (Phase C) */}
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
          onOpenModeSelect={() => setScreenState('MODE_SELECT')}
          onBackToMainMenu={() => setScreenState('MENU')}
          onStartMatch={(mode, diff, len) => {
            startMatchWithCountdown(mode, diff, len);
          }}
          onStartPractice={() => {
            startMatchWithCountdown('1v1', 'easy', '1_game');
          }}
          onOpenOnline={() => setShowMultiplayer(true)}
          onOpenLocker={() => setScreenState('LOCKER')}
          onOpenSettings={() => setScreenState('SETTINGS')}
          onOpenControls={() => setScreenState('HOW_TO_PLAY')}
          p1Custom={p1Custom}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleSound}
        />
      )}

      {/* 2. Locker / Customizer */}
      {screenState === 'LOCKER' && (
        <CustomizerModal
          isOpen={true}
          onClose={() => setScreenState('MENU')}
          appearance={p1Custom}
          onChange={(next) => {
            setP1Custom(next);
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
          onClose={() => setScreenState('MENU')}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleSound}
          cameraPreset={cameraPreset}
          onSelectCameraPreset={setCameraPreset}
          matchLength={matchLength}
          onSelectMatchLength={(len) => {
            setMatchLength(len);
            setScore((prev) => ({
              ...prev,
              matchLength: len,
              targetGames: len === '1_game' ? 1 : len === '3_games' ? 3 : 6,
            }));
          }}
          goldenPoint={goldenPoint}
          onToggleGoldenPoint={() => {
            setGoldenPoint((prev) => {
              const next = !prev;
              setScore((s) => ({ ...s, goldenPoint: next }));
              return next;
            });
          }}
          aimAssist={aimAssist}
          onSelectAimAssist={setAimAssist}
        />
      )}

      {/* 4. Controls & How to Play */}
      {screenState === 'HOW_TO_PLAY' && (
        <ControlsGuideModal
          isOpen={true}
          onClose={() => setScreenState('MENU')}
        />
      )}

      {/* 5. Match Start 3-2-1 Countdown */}
      {screenState === 'COUNTDOWN' && (
        <CountdownOverlay
          onComplete={handleCountdownComplete}
          p1Name={p1Custom.name}
          p2Name={isOnlineMode(gameMode) ? p2Custom.name : 'Alejandro'}
          gameMode={gameMode}
        />
      )}

      {/* 6. Active Game Match HUD */}
      {(screenState === 'PLAYING' || screenState === 'POINT_SCORED') && (
        <GameHUD
          score={score}
          gameMode={gameMode}
          onChangeMode={handleModeChange}
          onExitToMenu={quitToMenu}
          currentShot={currentShot}
          onSelectShot={setCurrentShot}
          chargePower={chargePower}
          hitFeedback={hitFeedback}
          pointBanner={pointBanner}
          onOpenMultiplayer={() => setShowMultiplayer(true)}
          onOpenCustomizer={() => setScreenState('LOCKER')}
          onOpenControls={() => setScreenState('HOW_TO_PLAY')}
          onRestartMatch={() => startMatchWithCountdown(gameMode, botDifficulty, matchLength)}
          p1Name={p1Custom.name}
          p2Name={isOnlineMode(gameMode) ? p2Custom.name : 'Alejandro'}
          pingMs={pingMs}
          connectionStatus={connectionStatus}
          onTouchJoystick={(x, z) => inputManagerRef.current?.setVirtualStick(x, z)}
          onTouchHitStart={() => inputManagerRef.current?.startTouchCharge()}
          onTouchHitEnd={() => inputManagerRef.current?.releaseTouchCharge()}
          onTouchLob={() => inputManagerRef.current?.triggerTouchLob()}
        />
      )}

      {/* 7. Pause Overlay */}
      {screenState === 'PAUSED' && (
        <PauseOverlay
          onResume={() => setScreenState('PLAYING')}
          onRestart={() => startMatchWithCountdown(gameMode, botDifficulty, matchLength)}
          onQuitToMenu={quitToMenu}
        />
      )}

      {/* 8. Match Over / Results Modal */}
      {(screenState === 'MATCH_END' || screenState === 'RESULTS') && (
        <MatchOverModal
          isOpen={true}
          score={score}
          p1Name={p1Custom.name}
          p2Name={isOnlineMode(gameMode) ? p2Custom.name : 'Alejandro'}
          onRematch={() => startMatchWithCountdown(gameMode, botDifficulty, matchLength)}
          onOpenCustomizer={() => setScreenState('LOCKER')}
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
        currentRoomId={currentRoomId}
        slots={lobbySlots}
        mySlot={mySlot}
        isHost={isHost}
        isConnected={isNetConnected}
        connectionStatus={connectionStatus}
        errorMessage={netErrorMessage}
        pingMs={pingMs}
        simulatedLatency={simulatedLatency}
        onToggleSimulatedLatency={handleToggleSimulatedLatency}
      />

      {/* Career Profile Modal */}
      <ProfileModal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        customization={p1Custom}
      />

      {/* Feedback & Bug Reports Modal */}
      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
      />
    </div>
  );
}
