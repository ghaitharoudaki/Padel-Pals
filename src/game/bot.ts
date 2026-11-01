import { BallState, Difficulty, HitQuality, PlayerState, ShotType, SwingSide, Vector3D } from './types';
import { evaluateContactTiming, predictBallLanding } from './physics';
import { isBajadaWindow } from './ball';

export interface BotDecision {
  targetPosition: Vector3D;
  velocity: Vector3D;
  wantsToSwing: boolean;
  shotType: ShotType;
  swingSide: SwingSide;
  power: number;
  targetAim: Vector3D;
  timingQuality: HitQuality;
  stateDescription: string;
}

function deterministicUnit(bot: PlayerState, ball: BallState, salt: number): number {
  const idSeed = bot.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const seed = idSeed * 31 + ball.bounceCount * 17 + Math.round(ball.position.x * 10) * 7 + salt * 13;
  return Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
}

export interface DifficultyConfig {
  speed: number;
  reactionTime: number; // seconds
  aimError: number;     // meters
  positionError: number;// meters
  powerMin: number;
  powerMax: number;
  smashThreshold: number; // willingness to smash overhead
  dropThreshold: number;
  lobThreshold: number;
  wallPrediction: boolean;
  perfectTimingRate: number; // chance of sweetspot
}

export function getDifficultyConfig(diff: Difficulty): DifficultyConfig {
  switch (diff) {
    case 'easy':
    case 'amateur':
      return {
        speed: 4.2,
        reactionTime: 0.30,
        aimError: 0.85,
        positionError: 0.50,
        powerMin: 0.50,
        powerMax: 0.65,
        smashThreshold: 0.25,
        dropThreshold: 0.15,
        lobThreshold: 0.30,
        wallPrediction: false,
        perfectTimingRate: 0.25,
      };
    case 'hard':
    case 'legend':
      return {
        speed: 6.0, // same as player sprint ~6 m/s
        reactionTime: 0.04,
        aimError: 0.08,
        positionError: 0.04,
        powerMin: 0.72,
        powerMax: 0.95,
        smashThreshold: 0.90,
        dropThreshold: 0.40,
        lobThreshold: 0.50,
        wallPrediction: true,
        perfectTimingRate: 0.80,
      };
    case 'medium':
    case 'pro':
    default:
      return {
        speed: 5.2,
        reactionTime: 0.14,
        aimError: 0.30,
        positionError: 0.18,
        powerMin: 0.60,
        powerMax: 0.80,
        smashThreshold: 0.65,
        dropThreshold: 0.25,
        lobThreshold: 0.40,
        wallPrediction: true,
        perfectTimingRate: 0.55,
      };
  }
}

/**
 * Tactical Bot AI using the EXACT same hit logic, timing evaluation, and rules
 */
export function updateBotAI(
  bot: PlayerState,
  ball: BallState,
  opponent: PlayerState,
  difficulty: Difficulty | DifficultyConfig,
  dt: number,
  isDoubles = true,
  teammate?: PlayerState
): BotDecision {
  const config = typeof difficulty === 'string' ? getDifficultyConfig(difficulty) : difficulty;
  const isSouth = bot.side === 'south';

  // Court lateral boundary for doubles
  const minX = -4.4;
  const maxX = 4.4;
  let homeX = 0;

  if (isDoubles) {
    homeX = bot.zone === 'left' ? -2.2 : 2.2;
  }

  // Tactical baseline home depth
  const homeZ = isSouth ? 7.0 : -7.0;
  const readyHome: Vector3D = { x: homeX, y: 0, z: homeZ };

  let targetPos: Vector3D = { ...readyHome };
  let wantsToSwing = false;
  let shotType: ShotType = 'flat';
  let swingSide: SwingSide = 'forehand';
  let power = 0.65;
  let stateDesc = 'Ready';
  let movementScale = 1;
  let timingQuality: HitQuality = 'GOOD';

  let targetAim: Vector3D = {
    x: (deterministicUnit(bot, ball, 1) - 0.5) * 3.5,
    y: 0,
    z: isSouth ? -7.0 : 7.0,
  };

  // 1. LEGAL UNDERHAND SERVE
  if (bot.isServing && !ball.inPlay) {
    wantsToSwing = true;
    shotType = 'flat';
    swingSide = 'serve';
    power = 0.64;
    // Serve diagonally into the cross service box (X: ±2.2, Z: ±4.8)
    const serveTargetX = bot.zone === 'left' ? 2.2 : -2.2;
    targetAim = {
      x: serveTargetX + (deterministicUnit(bot, ball, 2) - 0.5) * config.aimError,
      y: 0,
      z: isSouth ? -4.8 : 4.8,
    };
    return {
      targetPosition: bot.position,
      velocity: { x: 0, y: 0, z: 0 },
      wantsToSwing,
      shotType,
      swingSide,
      power,
      targetAim,
      timingQuality: 'GOOD',
      stateDescription: 'Serving Underhand',
    };
  }

  // 2. BALL APPROACH DETECTION
  const ballComingToBotSide =
    ball.lastHitter !== bot.side &&
    (isSouth ? ball.velocity.z > 0.2 : ball.velocity.z < -0.2);

  // 3. DOUBLES COURT COVERAGE & PARTNER SPACING
  let isMyBall = true;
  if (isDoubles && teammate) {
    const mateDist = Math.hypot(ball.position.x - teammate.position.x, ball.position.z - teammate.position.z);
    const myDist = Math.hypot(ball.position.x - bot.position.x, ball.position.z - bot.position.z);

    const teammateTaking =
      teammate.role !== 'human' || teammate.isSwinging || Math.hypot(teammate.velocity.x, teammate.velocity.z) > 0.2;
    if (teammateTaking && mateDist < myDist - 1.2 && mateDist < 3.2) {
      isMyBall = false;
    }
  }

  // 4. INTERCEPTION & WALL PLAY LOGIC
  if (ball.inPlay && ballComingToBotSide) {
    if (isMyBall) {
      stateDesc = 'Intercepting';

      const landing = predictBallLanding(ball);
      const reactionScale = Math.max(0.35, Math.min(1, landing.timeToBounce / Math.max(config.reactionTime, 0.01)));
      movementScale = reactionScale;

      const isDeepBall = isSouth
        ? (ball.position.z > 6.0 || (landing.z > 8.5 && ball.velocity.z > 5.0))
        : (ball.position.z < -6.0 || (landing.z < -8.5 && ball.velocity.z < -5.0));

      const isLob = ball.velocity.y > 2.0 || ball.position.y > 2.4;

      let interceptZ = isSouth
        ? Math.max(2.0, Math.min(8.6, landing.z))
        : Math.min(-2.0, Math.max(-8.6, landing.z));

      // Wall Rebound Anticipation (Padel glass play):
      // If the ball is going deep into the back glass, position 1.8m in front to strike the rebound!
      if (config.wallPrediction && isDeepBall && (isLob || landing.willReboundGlass)) {
        stateDesc = 'Anticipating Wall Rebound';
        interceptZ = isSouth ? 7.6 : -7.6;
      }

      let expectedX = landing.x;
      const errorSeed = ((bot.slot * 17 + ball.bounceCount * 31) % 101) / 100 - 0.5;
      expectedX += errorSeed * config.positionError;
      expectedX = Math.max(minX, Math.min(maxX, expectedX));

      // Side offset for proper racket hand alignment
      const forehandOffset = isSouth ? -0.45 : 0.45;
      const strikeX = Math.max(minX, Math.min(maxX, expectedX + forehandOffset));

      targetPos = {
        x: strikeX,
        y: 0,
        z: interceptZ,
      };

      // 5. EVALUATE TIMING QUALITY (Same logic as player)
      const timing = evaluateContactTiming(bot.position, ball.position, bot.side);
      timingQuality = deterministicUnit(bot, ball, 9) < config.perfectTimingRate ? 'PERFECT' : timing.quality;

      const dx = ball.position.x - bot.position.x;
      if (isSouth) {
        swingSide = dx >= 0 ? 'forehand' : 'backhand';
      } else {
        swingSide = dx <= 0 ? 'forehand' : 'backhand';
      }

      if (ball.position.y > 1.65) {
        swingSide = 'overhead';
      }

      const onBotSide = isSouth ? ball.position.z > 0.2 : ball.position.z < -0.2;
      const validGroundstroke = ball.bounceCount >= 1;
      const validVolley = ball.bounceCount === 0 && onBotSide && ball.position.y > 0.85 && Math.abs(ball.position.z) < 6.5;

      // Check for Bajada (aggressive downward wall rebound drive)
      const canBajada = isBajadaWindow(ball, bot.position, bot.side);

      if (timing.quality !== 'OUT_OF_REACH' && (validGroundstroke || validVolley || canBajada) && ball.position.y <= 2.9) {
        wantsToSwing = true;
        stateDesc = 'Swinging';

        // TACTICAL SHOT SELECTION
        if (canBajada) {
          // Bajada attack off back glass rebound!
          shotType = 'bajada';
          power = config.powerMax;
          targetAim = {
            x: opponent.position.x > 0 ? -3.0 : 3.0,
            y: 0,
            z: isSouth ? -8.2 : 8.2,
          };
        } else if (ball.position.y > 1.65 && deterministicUnit(bot, ball, 3) < config.smashThreshold) {
          // Overhead smash!
          shotType = 'smash';
          power = config.powerMax;
          targetAim = {
            x: opponent.position.x > 0 ? -3.2 : 3.2,
            y: 0,
            z: isSouth ? -8.4 : 8.4,
          };
        } else if (Math.abs(opponent.position.z) < 4.0 && deterministicUnit(bot, ball, 4) < config.lobThreshold) {
          // Opponent rushed net -> Lob over them!
          shotType = 'lob';
          power = 0.74;
          targetAim = {
            x: (deterministicUnit(bot, ball, 5) - 0.5) * 3.6,
            y: 0,
            z: isSouth ? -8.8 : 8.8,
          };
        } else if (Math.abs(opponent.position.z) > 7.0 && deterministicUnit(bot, ball, 6) < config.dropThreshold) {
          // Opponent stuck deep on baseline -> Drop shot!
          shotType = 'drop';
          power = 0.52;
          targetAim = {
            x: (deterministicUnit(bot, ball, 7) - 0.5) * 3.2,
            y: 0,
            z: isSouth ? -2.2 : 2.2,
          };
        } else {
          // Flat or topspin drive
          shotType = deterministicUnit(bot, ball, 8) < 0.6 ? 'topspin' : 'flat';
          power = (config.powerMin + config.powerMax) * 0.52;
          const targetX = opponent.position.x > 0 ? -2.8 : 2.8;
          targetAim = {
            x: targetX + (deterministicUnit(bot, ball, 10) - 0.5) * config.aimError,
            y: 0,
            z: isSouth ? -7.2 : 7.2,
          };
        }
      }
    } else {
      // Supporting partner
      stateDesc = 'Supporting Partner';
      const mateZ = teammate ? teammate.position.z : homeZ;
      const supportZ = isSouth ? (mateZ < 4.5 ? 7.2 : 5.8) : (mateZ > -4.5 ? -7.2 : -5.8);

      targetPos = {
        x: homeX,
        y: 0,
        z: supportZ,
      };
    }
  } else {
    // Ball on opponent's half
    stateDesc = 'Ready Stance';
    targetPos = {
      x: homeX,
      y: 0,
      z: isSouth ? 6.5 : -6.5,
    };
  }

  // Movement velocity towards target position
  const diffX = targetPos.x - bot.position.x;
  const diffZ = targetPos.z - bot.position.z;
  const distToTarget = Math.hypot(diffX, diffZ);

  let vx = 0;
  let vz = 0;
  if (distToTarget > 0.08) {
    const step = Math.min(distToTarget, config.speed * dt);
    vx = (diffX / distToTarget) * (step / dt) * movementScale;
    vz = (diffZ / distToTarget) * (step / dt) * movementScale;
  }

  return {
    targetPosition: targetPos,
    velocity: { x: vx, y: 0, z: vz },
    wantsToSwing,
    shotType,
    swingSide,
    power,
    targetAim,
    timingQuality,
    stateDescription: stateDesc,
  };
}
