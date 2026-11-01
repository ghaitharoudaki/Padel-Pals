import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  BallState,
  COURT_CONFIG,
  Difficulty,
  GameMode,
  PlayerCustomization,
  PlayerState,
  ScoreState,
  ShotType,
  Side,
  Vector3D,
} from './game/types';
import { advancePlayer, createPlayerState, getPlayerRoster, setPlayerPosition } from './game/player';
import {
  createInitialBall,
  stepBallPhysics,
  strikeBallWithRacket,
  executePadelServe,
  predictBallLanding,
  evaluateContactQuality,
} from './game/physics';
import { awardPoint, createInitialScoreState, getServeTargetBox } from './game/rules';
import { buildPadelCourt, CourtVisuals } from './game/court';
import { buildPadelAvatar, AvatarController } from './game/avatar';
import { updateBotAI } from './game/bot';
import { padelAudio } from './game/audio';
import { FixedTimestepLoop } from './game/loop';
import { CameraController } from './game/camera';
import { InputManager } from './game/input';
import { MultiplayerClient } from './game/multiplayer';
import { GameHUD } from './components/GameHUD';
import { DebugOverlay } from './components/DebugOverlay';
import { MultiplayerLobbyModal } from './components/MultiplayerLobbyModal';
import { CustomizerModal } from './components/CustomizerModal';
import { ControlsGuideModal } from './components/ControlsGuideModal';
import { MatchOverModal } from './components/MatchOverModal';
import { MainMenu } from './components/MainMenu';
import { ProfileModal } from './components/ProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { FeedbackModal } from './components/FeedbackModal';

const DEFAULT_P1_CUSTOM: PlayerCustomization = {
  name: 'Player 1',
  jerseyColor: '#2563eb', // Vibrant classic blue matching screenshot left character
  shortsColor: '#ffffff', // White athletic shorts
  skinTone: '#fed7aa',
  hairColor: '#09090b', // Spiky black anime hair
  racketSkin: 'carbon',
};

const DEFAULT_P2_CUSTOM: PlayerCustomization = {
  name: 'Alejandro',
  jerseyColor: '#dc2626', // Vibrant crimson red captain uniform #5 matching screenshot
  shortsColor: '#dc2626',
  skinTone: '#fed7aa',
  hairColor: '#eab308', // Blonde/amber ombre anime hair
  racketSkin: 'neon',
};

const DEFAULT_P3_CUSTOM: PlayerCustomization = {
  name: 'Carlos',
  jerseyColor: '#3b82f6', // Team Blue partner #4
  shortsColor: '#ffffff',
  skinTone: '#fde047',
  hairColor: '#451a03',
  racketSkin: 'gold',
};

const DEFAULT_P4_CUSTOM: PlayerCustomization = {
  name: 'Mateo',
  jerseyColor: '#ef4444', // Team Red partner #10
  shortsColor: '#ffffff',
  skinTone: '#d97706',
  hairColor: '#172554',
  racketSkin: 'neon',
};

/**
 * Intelligent auto-shot determination based on ball height, court position, and directional steering
 */
function computeAutoShot(
  ball: BallState,
  playerPos: Vector3D,
  keys: Record<string, boolean>,
  power: number
): ShotType {
  const isUp = keys['w'] || keys['arrowup'];
  const isDown = keys['s'] || keys['arrowdown'];
  const isSide = keys['a'] || keys['d'] || keys['arrowleft'] || keys['arrowright'];

  if (ball.position.y > 1.65) {
    return playerPos.z < 6.5 || power > 0.75 ? 'smash' : 'slice';
  }
  if (isUp) return 'lob';
  if (isDown) return ball.position.y < 0.95 || playerPos.z < 6.0 ? 'drop' : 'slice';
  if (ball.position.y < 0.55 && playerPos.z < 5.0) return 'drop';
  if (isSide && power > 0.65) return 'topspin';
  return 'flat';
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);

  // High-Level Game State
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [gameMode, setGameMode] = useState<GameMode>('2v2');
  const [botDifficulty, setBotDifficulty] = useState<Difficulty>('medium');
  const [currentShot, setCurrentShot] = useState<ShotType>('flat');
  const [chargePower, setChargePower] = useState<number>(0.65);
  const [hitFeedback, setHitFeedback] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreState>(() => createInitialScoreState('south'));
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [pointBanner, setPointBanner] = useState<{ text: string; subtext: string; winner: Side } | null>(null);

  // Debug HUD (F3)
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);
  const [debugPlayers, setDebugPlayers] = useState<PlayerState[]>([]);

  // Modals
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isFreeplayActive, setIsFreeplayActive] = useState(false);

  // Customization
  const [p1Custom, setP1Custom] = useState<PlayerCustomization>(DEFAULT_P1_CUSTOM);
  const [p2Custom, setP2Custom] = useState<PlayerCustomization>(DEFAULT_P2_CUSTOM);

  // Multiplayer
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState<number>(1);
  const [mySide, setMySide] = useState<Side>('south');
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  // Four authoritative player slots. Online mode can replace any bot slot with
  // a remote human later without changing the simulation or render loop.
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
  const gameStateRef = useRef<'menu' | 'playing' | 'gameover'>(gameState);
  const botDifficultyRef = useRef<Difficulty>(botDifficulty);

  // Sync refs
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
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

  const mouseAimRef = useRef<Vector3D>({ x: 0, y: 0, z: -6.0 });
  const multiplayerClientRef = useRef<MultiplayerClient | null>(null);
  const pointResetTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const isFrozenRef = useRef<boolean>(false);

  // Flash hit feedback
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

  // URL autostart check (?autostart=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      setGameState('playing');
    }
  }, []);

  // Main Three.js Scene and 60Hz Fixed-Timestep Loop
  useEffect(() => {
    if (!mountRef.current) return;

    // Detect Software WebGL
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

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mountRef.current.appendChild(renderer.domElement);

    // Studio Arena Lighting
    const ambientLight = new THREE.AmbientLight(0x93c5fd, 0.65);
    scene.add(ambientLight);

    const mainSun = new THREE.DirectionalLight(0xffffff, 1.8);
    mainSun.position.set(12, 24, 14);
    scene.add(mainSun);

    const arenaFill = new THREE.DirectionalLight(0x38bdf8, 0.6);
    arenaFill.position.set(-14, 18, -12);
    scene.add(arenaFill);

    // Padel Court Arena
    const courtVisuals: CourtVisuals = buildPadelCourt(renderer);
    scene.add(courtVisuals.group);

    // Optic Yellow Padel Ball
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
      opacity: 0.6,
      linewidth: 2,
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    scene.add(trailLine);

    // 4 Player Avatars (All 4 initialized and permanently in scene graph)
    const p1Avatar: AvatarController = buildPadelAvatar(p1Ref.current.customization, 'south', 7.2, '7');
    const p2Avatar: AvatarController = buildPadelAvatar(p2Ref.current.customization, 'north', -7.2, '5');
    const p3Avatar: AvatarController = buildPadelAvatar(p3Ref.current.customization, 'south', 7.2, '4');
    const p4Avatar: AvatarController = buildPadelAvatar(p4Ref.current.customization, 'north', -7.2, '10');

    const avatars: Record<string, AvatarController> = {
      p1: p1Avatar,
      p2: p2Avatar,
      p3: p3Avatar,
      p4: p4Avatar,
    };
    const players = getPlayerRoster([p1Ref.current, p2Ref.current, p3Ref.current, p4Ref.current]);
    players.forEach((player) => {
      const avatar = avatars[player.id];
      player.mesh = avatar.group;
      avatar.group.name = `player-${player.id}`;
      avatar.group.position.set(player.position.x, player.position.y, player.position.z);
      avatar.setVisible(true);
      scene.add(player.mesh);
      console.info(`[spawn] ${player.id} team=${player.team} slot=${player.slot} bot=${player.isBot}`);
    });

    // Point scoring handler with freeze & 3s notification pause
    function onPointFinished(winner: Side, reason: string) {
      if (pointResetTimerRef.current) return;

      isFrozenRef.current = true;
      ballRef.current.inPlay = false;
      ballRef.current.velocity = { x: 0, y: 0, z: 0 };

      padelAudio.playPointWhistle();
      courtVisuals.triggerCheerBurst(ballRef.current.position.x, ballRef.current.position.z);
      const result = awardPoint(scoreRef.current, winner, 6); // First to 6 Games
      setScore(result.nextState);
      scoreRef.current = result.nextState;

      const winnerName =
        winner === 'south'
          ? p1Custom.name
          : gameModeRef.current === 'online'
          ? p2Custom.name
          : 'Alejandro';

      setPointBanner({
        text: `${winnerName.toUpperCase()} SCORED!`,
        subtext: `${reason} • SCORE: ${result.nextState.points[0]} - ${result.nextState.points[1]}`,
        winner,
      });

      if (result.matchWon) {
        padelAudio.playVictoryCheer();
        setGameState('gameover');
      }

      multiplayerClientRef.current?.sendPointScored(winner, result.nextState);

      pointResetTimerRef.current = window.setTimeout(() => {
        pointResetTimerRef.current = null;
        isFrozenRef.current = false;
        setPointBanner(null);

        const nextServing = result.nextState.servingSide;
        p1Ref.current.isServing = nextServing === 'south';
        p2Ref.current.isServing = nextServing === 'north';

        const isD = gameModeRef.current !== '1v1';
        setPlayerPosition(p1Ref.current, { x: isD ? -2.0 : 0, y: 0, z: 7.2 });
        setPlayerPosition(p3Ref.current, { x: 2.0, y: 0, z: 7.2 });
        setPlayerPosition(p2Ref.current, { x: isD ? -2.0 : 0, y: 0, z: -7.2 });
        setPlayerPosition(p4Ref.current, { x: 2.0, y: 0, z: -7.2 });

        const freshBall = createInitialBall(
          nextServing,
          nextServing === 'south' ? p1Ref.current.position : p2Ref.current.position
        );
        ballRef.current = freshBall;
      }, 3000);
    }

    // Swing execution logic
    function executeSwing(shot: ShotType, power: number, bias?: { x: number; z: number }) {
      const p1 = p1Ref.current;
      const b = ballRef.current;

      // Underhand serve
      if (p1.isServing && !b.inPlay) {
        p1.isSwinging = true;
        p1.racketSwingProgress = 0;
        p1.swingSide = 'serve';
        const targetBox = getServeTargetBox(scoreRef.current.rawPoints[0] + scoreRef.current.rawPoints[1]);
        const newBall = executePadelServe(b, 'south', targetBox, power);
        ballRef.current = newBall;
        p1.isServing = false;
        padelAudio.playRacketHit(power, shot, 'GOOD');
        triggerHitFeedback('SERVE IN!');
        multiplayerClientRef.current?.sendBallState(newBall);
        return;
      }

      p1.isSwinging = true;
      p1.racketSwingProgress = 0;

      // Detect forehand vs backhand based on ball position relative to player
      const dx = b.position.x - p1.position.x;
      p1.swingSide = b.position.y > 1.65 ? 'overhead' : (dx >= 0 ? 'forehand' : 'backhand');

      const contact = evaluateContactQuality(p1.position, b.position, b.velocity.z);

      if (contact.quality !== 'OUT_OF_REACH') {
        const effectivePower = Math.min(1.0, power * contact.powerMultiplier);
        const struck = strikeBallWithRacket(
          b,
          'south',
          shot,
          effectivePower,
          mouseAimRef.current,
          p1.position,
          bias
        );
        ballRef.current = struck;
        padelAudio.playRacketHit(effectivePower, shot, contact.quality);

        if (contact.quality === 'PERFECT') {
          triggerHitFeedback(shot === 'smash' ? 'SMASH! ⚡' : 'PERFECT SWEETSPOT! 🎯');
        } else if (contact.quality === 'GOOD') {
          triggerHitFeedback(shot === 'slice' ? 'BANDEJA SLICE' : 'CLEAN HIT');
        } else {
          triggerHitFeedback('LATE REACH');
        }

        multiplayerClientRef.current?.sendBallState(struck);
      } else {
        triggerHitFeedback('MISSED CONTACT');
      }
    }

    // Unified Input Manager
    const inputManager = new InputManager({
      mountElement: mountRef.current,
      camera: cameraController.camera,
      onSwing: (defaultShot, power, bias) => {
        executeSwing(currentShotRef.current, power, bias);
      },
      onChargeChange: (p) => {
        chargePowerRef.current = p;
        setChargePower(p);
      },
      onShotPreviewChange: (shot) => {
        currentShotRef.current = shot;
        setCurrentShot(shot);
      },
      onAimChange: (aim) => {
        mouseAimRef.current = aim;
        courtVisuals.updateAim(aim.x, aim.z, gameStateRef.current === 'playing');
      },
      onToggleDebug: () => {
        setShowDebug((prev) => !prev);
      },
    });

    // Resize handler
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraController.updateAspect(w, h);
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let lastDebugSync = 0;
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

    // 60 Hz Fixed-Timestep Loop Instance
    const gameLoop = new FixedTimestepLoop(
      {
        // 1. FIXED 60Hz PHYSICS & AI UPDATE
        fixedUpdate: (fixedDt) => {
          const isDoubles = gameModeRef.current !== '1v1';
          const p1 = p1Ref.current;
          const p2 = p2Ref.current;
          const p3 = p3Ref.current;
          const p4 = p4Ref.current;
          const keys = inputManager.getKeys();
          players.forEach((player) => {
            previousPositions[player.id] = { ...player.position };
          });
          previousBallPosition = { ...ballRef.current.position };

          // A. Player 1 Movement & Auto-shot
          if (isFrozenRef.current) {
            p1.state = 'Frozen';
            p1.velocity.x = 0;
            p1.velocity.z = 0;
          } else {
            const sprint = keys['shift'] ? 1.35 : 1.0;
            const maxSpeed = 5.5 * sprint;
            const accel = 28.0;

            let targetVx = 0;
            let targetVz = 0;
            if (keys['w'] || keys['arrowup']) targetVz -= maxSpeed;
            if (keys['s'] || keys['arrowdown']) targetVz += maxSpeed;
            if (keys['a'] || keys['arrowleft']) targetVx -= maxSpeed;
            if (keys['d'] || keys['arrowright']) targetVx += maxSpeed;

            p1.velocity.x += (targetVx - p1.velocity.x) * Math.min(1, accel * fixedDt);
            p1.velocity.z += (targetVz - p1.velocity.z) * Math.min(1, accel * fixedDt);

            const p1MaxX = isDoubles ? 0.4 : 4.4;
            p1.position.x = Math.max(-4.4, Math.min(p1MaxX, p1.position.x + p1.velocity.x * fixedDt));
            p1.position.z = Math.max(1.2, Math.min(9.2, p1.position.z + p1.velocity.z * fixedDt));
            p1.state = Math.hypot(p1.velocity.x, p1.velocity.z) > 0.1 ? 'Moving' : 'Ready';

            // Auto-shot selection
            const autoShot = computeAutoShot(ballRef.current, p1.position, keys, chargePowerRef.current);
            if (currentShotRef.current !== autoShot) {
              currentShotRef.current = autoShot;
              setCurrentShot(autoShot);
            }
          }

          if (p1.isSwinging) {
            p1.racketSwingProgress += fixedDt * 4.6;
            if (p1.racketSwingProgress >= 1.0) {
              p1.isSwinging = false;
              p1.racketSwingProgress = 0;
            }
          }

          // B. South Teammate (P3 Carlos) AI Update
          if (isDoubles && p3.isBot) {
            const p3Decision = updateBotAI(p3, ballRef.current, p2, botDifficultyRef.current, fixedDt, true, p1);
            p3.velocity = p3Decision.velocity;
            advancePlayer(p3, fixedDt);
            p3.swingSide = p3Decision.swingSide;
            p3.currentShotType = p3Decision.shotType;
            p3.state = p3Decision.stateDescription;

            if (p3Decision.wantsToSwing) {
              p3.isSwinging = true;
              p3.racketSwingProgress = 0;
              const struck = strikeBallWithRacket(
                ballRef.current,
                'south',
                p3Decision.shotType,
                p3Decision.power,
                p3Decision.targetAim,
                p3.position
              );
              ballRef.current = struck;
              padelAudio.playRacketHit(p3Decision.power, p3Decision.shotType, 'GOOD');
            }

            if (p3.isSwinging) {
              p3.racketSwingProgress += fixedDt * 4.6;
              if (p3.racketSwingProgress >= 1.0) {
                p3.isSwinging = false;
                p3.racketSwingProgress = 0;
              }
            }
          }

          // C. North Opponent (P2 Alejandro) AI Update
          if (p2.isBot) {
            const p2Decision = updateBotAI(p2, ballRef.current, p1, botDifficultyRef.current, fixedDt, isDoubles, p4);
            p2.velocity = p2Decision.velocity;
            advancePlayer(p2, fixedDt);
            p2.swingSide = p2Decision.swingSide;
            p2.currentShotType = p2Decision.shotType;
            p2.state = p2Decision.stateDescription;

            if (p2Decision.wantsToSwing) {
              p2.isSwinging = true;
              p2.racketSwingProgress = 0;
              if (p2.isServing && !ballRef.current.inPlay) {
                const struck = executePadelServe(ballRef.current, 'north', p2.zone, p2Decision.power);
                ballRef.current = struck;
                p2.isServing = false;
                padelAudio.playRacketHit(p2Decision.power, p2Decision.shotType, 'GOOD');
              } else {
                const struck = strikeBallWithRacket(
                  ballRef.current,
                  'north',
                  p2Decision.shotType,
                  p2Decision.power,
                  p2Decision.targetAim,
                  p2.position
                );
                ballRef.current = struck;
                padelAudio.playRacketHit(p2Decision.power, p2Decision.shotType, 'GOOD');
              }
            }

            if (p2.isSwinging) {
              p2.racketSwingProgress += fixedDt * 4.6;
              if (p2.racketSwingProgress >= 1.0) {
                p2.isSwinging = false;
                p2.racketSwingProgress = 0;
              }
            }

            // D. North Partner (P4 Mateo) AI Update
            if (isDoubles && p4.isBot) {
              const p4Decision = updateBotAI(p4, ballRef.current, p3, botDifficultyRef.current, fixedDt, true, p2);
              p4.velocity = p4Decision.velocity;
              advancePlayer(p4, fixedDt);
              p4.swingSide = p4Decision.swingSide;
              p4.currentShotType = p4Decision.shotType;
              p4.state = p4Decision.stateDescription;

              if (p4Decision.wantsToSwing) {
                p4.isSwinging = true;
                p4.racketSwingProgress = 0;
                const struck = strikeBallWithRacket(
                  ballRef.current,
                  'north',
                  p4Decision.shotType,
                  p4Decision.power,
                  p4Decision.targetAim,
                  p4.position
                );
                ballRef.current = struck;
                padelAudio.playRacketHit(p4Decision.power, p4Decision.shotType, 'GOOD');
              }

              if (p4.isSwinging) {
                p4.racketSwingProgress += fixedDt * 4.6;
                if (p4.racketSwingProgress >= 1.0) {
                  p4.isSwinging = false;
                  p4.racketSwingProgress = 0;
                }
              }
            }
          }

          // E. Ball Physics Step
          if (!isFrozenRef.current) {
            const phys = stepBallPhysics(ballRef.current, fixedDt);
            ballRef.current = phys.ball;

            if (phys.events.bouncedFloor) {
              padelAudio.playTurfBounce(Math.abs(phys.ball.velocity.y));
            }
            if (phys.events.bouncedGlassWall) {
              padelAudio.playGlassRebound();
            }
            if (phys.events.bouncedMeshWall) {
              padelAudio.playMeshFenceRebound();
            }

            if (phys.events.pointFault) {
              const winner: Side = ballRef.current.lastHitter === 'south' ? 'north' : 'south';
              onPointFinished(winner, phys.events.faultReason || 'Point concluded');
            }
          }
        },

        // 2. INTERPOLATED RENDERING & VISUAL UPDATE
        render: (alpha, dt) => {
          const now = performance.now();
          const isMenu = gameStateRef.current === 'menu';
          const isDoubles = gameModeRef.current !== '1v1';
          const p1 = p1Ref.current;
          const p2 = p2Ref.current;
          const p3 = p3Ref.current;
          const p4 = p4Ref.current;

          inputManager.update(now, ballRef.current.position, p1.position, currentShotRef.current);

          // Ball Visuals
          const renderedBallPosition = interpolatePosition(
            previousBallPosition,
            ballRef.current.position,
            alpha
          );
          ballMesh.position.set(renderedBallPosition.x, renderedBallPosition.y, renderedBallPosition.z);

          const trail = ballRef.current.trail;
          for (let i = 0; i < trail.length && i < maxTrailPoints; i++) {
            trailPositions[i * 3] = trail[i].x;
            trailPositions[i * 3 + 1] = trail[i].y;
            trailPositions[i * 3 + 2] = trail[i].z;
          }
          trailGeo.attributes.position.needsUpdate = true;
          trailGeo.setDrawRange(0, Math.min(trail.length, maxTrailPoints));

          // Dynamic Landing Ring
          const landing = predictBallLanding(ballRef.current);
          courtVisuals.updateLandingPrediction(
            landing.x,
            landing.z,
            landing.timeToBounce,
            ballRef.current.inPlay
          );

          if (isMenu) {
            // In Menu Mode: P1 on 3D preview stage, P2, P3, P4 hidden
            p1Avatar.setVisible(true);
            p2Avatar.setVisible(false);
            p3Avatar.setVisible(false);
            p4Avatar.setVisible(false);

            p1.position.x = 1.5;
            p1.position.y = 0;
            p1.position.z = 4.0;
            p1Avatar.group.position.set(1.5, 0, 4.0);
            p1Avatar.updateKinematics(dt, { x: 0, z: 0 }, 0, false, 'flat', -0.2);

            const previewBounce = Math.abs(Math.sin((now / 1000) * 3.2)) * 0.42;
            ballMesh.position.set(2.25, 0.12 + previewBounce, 4.05);
            courtVisuals.updateAim(0, 0, false);
            courtVisuals.updateLandingPrediction(0, 0, 0, false);
          } else {
            // IN PLAYING MODE: ALL 4 AVATARS ARE 100% VISIBLE AND ANIMATED EVERY FRAME!
            p1Avatar.setVisible(true);
            p2Avatar.setVisible(true);
            p3Avatar.setVisible(isDoubles);
            p4Avatar.setVisible(isDoubles);
            players.forEach((player) => {
              const avatar = avatars[player.id];
              avatar.group.visible = player.id === 'p1' || isDoubles;
              const renderedPosition = interpolatePosition(previousPositions[player.id], player.position, alpha);
              avatar.group.position.set(renderedPosition.x, renderedPosition.y, renderedPosition.z);
            });

            // P1 Avatar
            const p1TargetAngle = Math.atan2(
              mouseAimRef.current.x - p1.position.x,
              mouseAimRef.current.z - p1.position.z
            );
            p1Avatar.updateKinematics(
              dt,
              p1.velocity,
              p1.racketSwingProgress,
              p1.isSwinging,
              currentShotRef.current,
              p1TargetAngle,
              ballRef.current.position,
              p1.swingSide
            );

            // P2 Avatar (Opponent Bot)
            const p2TargetAngle = Math.atan2(
              p1.position.x - p2.position.x,
              p1.position.z - p2.position.z
            );
            p2Avatar.updateKinematics(
              dt,
              p2.velocity,
              p2.racketSwingProgress,
              p2.isSwinging,
              p2.currentShotType,
              p2TargetAngle,
              ballRef.current.position,
              p2.swingSide
            );

            // P3 Avatar (Teammate Bot in 2v2)
            if (isDoubles) {
              const p3TargetAngle = Math.atan2(
                ballRef.current.position.x - p3.position.x,
                ballRef.current.position.z - p3.position.z
              );
              p3Avatar.updateKinematics(
                dt,
                p3.velocity,
                p3.racketSwingProgress,
                p3.isSwinging,
                p3.currentShotType,
                p3TargetAngle,
                ballRef.current.position,
                p3.swingSide
              );

              // P4 Avatar (Opponent Bot in 2v2)
              const p4TargetAngle = Math.atan2(
                p3.position.x - p4.position.x,
                p3.position.z - p4.position.z
              );
              p4Avatar.updateKinematics(
                dt,
                p4.velocity,
                p4.racketSwingProgress,
                p4.isSwinging,
                p4.currentShotType,
                p4TargetAngle,
                ballRef.current.position,
                p4.swingSide
              );
            }
          }

          // Real-time Dynamic Shadows
          courtVisuals.updateShadows(
            ballMesh.position,
            p1Avatar.group.position,
            p2Avatar.group.position,
            p3Avatar.group.position,
            p4Avatar.group.position,
            isDoubles
          );

          // Camera
          cameraController.update(dt, isMenu, p1.position);

          // Crowd & Confetti
          const isCheering = isMenu ? Math.sin(now / 2000) > 0.4 : feedbackTimerRef.current !== null;
          courtVisuals.updateCrowd(now / 1000, dt, isCheering);

          // Render
          renderer.render(scene, cameraController.camera);

          // Periodically sync debug player data (10 Hz)
          if (now - lastDebugSync > 100) {
            lastDebugSync = now;
            setFps(gameLoop.currentFps);
            setDebugPlayers([
              { ...p1 },
              { ...p3 },
              { ...p2 },
              { ...p4 },
            ]);
          }
        },
      },
      isSoftwareGl,
      renderer
    );

    gameLoop.start();

    return () => {
      gameLoop.stop();
      inputManager.dispose();
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Mode change handler (Defaults to 4 Players 2v2 doubles)
  const handleModeChange = (mode: GameMode) => {
    setGameMode(mode);
    gameModeRef.current = mode;

    const isD = mode !== '1v1';
    setPlayerPosition(p1Ref.current, { x: isD ? -2.0 : 0, y: 0, z: 7.2 });
    setPlayerPosition(p3Ref.current, { x: 2.0, y: 0, z: 7.2 });
    setPlayerPosition(p2Ref.current, { x: isD ? -2.0 : 0, y: 0, z: -7.2 });
    setPlayerPosition(p4Ref.current, { x: 2.0, y: 0, z: -7.2 });
    ballRef.current = createInitialBall('south', p1Ref.current.position);
  };

  // Online Multiplayer Room
  const handleJoinMultiplayerRoom = (roomId: string) => {
    setCurrentRoomId(roomId);

    if (!multiplayerClientRef.current) {
      multiplayerClientRef.current = new MultiplayerClient({
        onConnected: (player) => {
          setIsWsConnected(true);
          setMySide(player.side);
        },
        onPlayerJoined: (player) => {
          setPlayerCount(2);
          setP2Custom((prev) => ({ ...prev, name: player.name }));
        },
        onPlayerLeft: () => {
          setPlayerCount(1);
        },
        onRemotePlayerState: (state) => {
          if (state.position) p2Ref.current.position = state.position as Vector3D;
          if (state.velocity) p2Ref.current.velocity = state.velocity as Vector3D;
          if (state.isSwinging !== undefined) p2Ref.current.isSwinging = state.isSwinging;
          if (state.racketSwingProgress !== undefined)
            p2Ref.current.racketSwingProgress = state.racketSwingProgress;
        },
        onRemoteBallState: (remoteBall) => {
          ballRef.current = { ...ballRef.current, ...remoteBall };
        },
        onRoomReady: () => {
          setGameState('playing');
          setShowMultiplayer(false);
          handleModeChange('online');
        },
        onRemotePointScored: (data) => {
          setScore(data.scoreState);
          scoreRef.current = data.scoreState;
        },
        onDisconnect: () => {
          setIsWsConnected(false);
        },
      });
    }

    multiplayerClientRef.current.connect(roomId, p1Custom.name, p1Custom);
  };

  const restartMatch = () => {
    const initScore = createInitialScoreState('south');
    setScore(initScore);
    scoreRef.current = initScore;
    const isD = gameMode !== '1v1';
    setPlayerPosition(p1Ref.current, { x: isD ? -2.0 : 0, y: 0, z: 7.2 });
    p1Ref.current.isServing = true;
    setPlayerPosition(p3Ref.current, { x: 2.0, y: 0, z: 7.2 });
    setPlayerPosition(p2Ref.current, { x: isD ? -2.0 : 0, y: 0, z: -7.2 });
    p2Ref.current.isServing = false;
    setPlayerPosition(p4Ref.current, { x: 2.0, y: 0, z: -7.2 });
    ballRef.current = createInitialBall('south');
    setGameState('playing');
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-950 font-sans select-none text-white">
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-crosshair" />

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

      {/* Just Volleyball Style Main Menu */}
      {gameState === 'menu' && (
        <MainMenu
          onStartMatch={(mode) => {
            handleModeChange(mode);
            setGameState('playing');
          }}
          onStartPractice={() => {
            handleModeChange('2v2');
            setGameState('playing');
          }}
          onOpenOnline={() => setShowMultiplayer(true)}
          onOpenLocker={() => setShowCustomizer(true)}
          onOpenProfile={() => setShowProfile(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenFeedback={() => setShowFeedback(true)}
          onOpenControls={() => setShowControls(true)}
          p1Custom={p1Custom}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleSound}
          activeOutfitName={p1Custom.jerseyColor === '#2563eb' ? 'Home Classic Blue' : `${p1Custom.name} Kit`}
          ballSelection="Wilson Pro 3D"
          arenaStage="Madrid Center Arena"
          isFreeplayActive={isFreeplayActive}
          onToggleFreeplay={() => {
            const next = !isFreeplayActive;
            setIsFreeplayActive(next);
            if (next) {
              handleModeChange('2v2');
              setGameState('playing');
            }
          }}
        />
      )}

      {/* Active Game HUD */}
      {gameState === 'playing' && (
        <GameHUD
          score={score}
          gameMode={gameMode}
          onChangeMode={handleModeChange}
          onExitToMenu={() => setGameState('menu')}
          currentShot={currentShot}
          onSelectShot={setCurrentShot}
          chargePower={chargePower}
          hitFeedback={hitFeedback}
          pointBanner={pointBanner}
          onOpenMultiplayer={() => setShowMultiplayer(true)}
          onOpenCustomizer={() => setShowCustomizer(true)}
          onOpenControls={() => setShowControls(true)}
          onRestartMatch={restartMatch}
          p1Name={p1Custom.name}
          p2Name={gameMode === 'online' ? p2Custom.name : 'Alejandro'}
        />
      )}

      {/* Match Over Modal */}
      <MatchOverModal
        isOpen={gameState === 'gameover'}
        score={score}
        p1Name={p1Custom.name}
        p2Name={gameMode === 'online' ? p2Custom.name : 'Alejandro'}
        onRematch={restartMatch}
        onOpenCustomizer={() => setShowCustomizer(true)}
      />

      {/* Online Multiplayer Lobby Modal */}
      <MultiplayerLobbyModal
        isOpen={showMultiplayer}
        onClose={() => setShowMultiplayer(false)}
        onJoinRoom={handleJoinMultiplayerRoom}
        currentRoomId={currentRoomId}
        playerCount={playerCount}
        mySide={mySide}
        isConnected={isWsConnected}
        onStartMatch={() => {
          setShowMultiplayer(false);
          handleModeChange('online');
          setGameState('playing');
        }}
      />

      {/* Avatar & Racket Customizer Modal */}
      <CustomizerModal
        isOpen={showCustomizer}
        onClose={() => setShowCustomizer(false)}
        customization={p1Custom}
        onChange={setP1Custom}
      />

      {/* Controls & Rules Guide Modal */}
      <ControlsGuideModal
        isOpen={showControls}
        onClose={() => setShowControls(false)}
      />

      {/* Career Profile Modal */}
      <ProfileModal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        customization={p1Custom}
      />

      {/* System Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        audioEnabled={audioEnabled}
        onToggleAudio={toggleSound}
      />

      {/* Feedback & Bug Reports Modal */}
      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
      />
    </div>
  );
}
