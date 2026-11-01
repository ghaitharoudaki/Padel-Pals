import { BallState, Difficulty, PlayerState, ShotType, SwingSide, Vector3D } from './types';
import { evaluateContactQuality, predictBallLanding } from './physics';

export interface BotDecision {
  targetPosition: Vector3D;
  velocity: Vector3D;
  wantsToSwing: boolean;
  shotType: ShotType;
  swingSide: SwingSide;
  power: number;
  targetAim: Vector3D;
  stateDescription: string;
}

function deterministicUnit(bot: PlayerState, ball: BallState, salt: number): number {
  const idSeed = bot.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const seed = idSeed * 31 + ball.bounceCount * 17 + Math.round(ball.position.x * 10) * 7 + salt * 13;
  return Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
}

// Normalized difficulty configuration
export interface DifficultyConfig {
  speed: number;
  reactionTime: number; // seconds
  aimError: number;     // meters
  positionError: number;// meters
  powerMin: number;
  powerMax: number;
  smashThreshold: number; // willingness to smash
  wallPrediction: boolean;
}

export function getDifficultyConfig(diff: Difficulty): DifficultyConfig {
  switch (diff) {
    case 'easy':
    case 'amateur':
      return {
        speed: 4.5,
        reactionTime: 0.32,
        aimError: 0.9,
        positionError: 0.55,
        powerMin: 0.50,
        powerMax: 0.68,
        smashThreshold: 0.3,
        wallPrediction: false,
      };
    case 'hard':
    case 'legend':
      return {
        speed: 8.0,
        reactionTime: 0.03,
        aimError: 0.05,
        positionError: 0.02,
        powerMin: 0.75,
        powerMax: 0.95,
        smashThreshold: 0.95,
        wallPrediction: true,
      };
    case 'medium':
    case 'pro':
    default:
      return {
        speed: 6.0,
        reactionTime: 0.12,
        aimError: 0.35,
        positionError: 0.20,
        powerMin: 0.62,
        powerMax: 0.82,
        smashThreshold: 0.70,
        wallPrediction: true,
      };
  }
}

/**
 * Tactical Bot AI for 4-Player Doubles Padel
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

  // Doubles partners share the full width; zones are preferred home lanes,
  // not hard walls, so either player can cover a cross-court return.
  const minX = -4.4;
  const maxX = 4.4;
  let homeX = 0;

  if (isDoubles) {
    if (bot.zone === 'left') {
      homeX = -2.2;
    } else {
      homeX = 2.2;
    }
  }

  // Tactical baseline home depth
  const homeZ = isSouth ? 6.8 : -6.8;
  const readyHome: Vector3D = { x: homeX, y: 0, z: homeZ };

  let targetPos: Vector3D = { ...readyHome };
  let wantsToSwing = false;
  let shotType: ShotType = 'flat';
  let swingSide: SwingSide = 'forehand';
  let power = 0.65;
  let stateDesc = 'Ready';
  let movementScale = 1;

  let targetAim: Vector3D = {
    x: (deterministicUnit(bot, ball, 1) - 0.5) * 3.5,
    y: 0,
    z: isSouth ? -7.0 : 7.0,
  };

  // 1. SERVING STATE
  if (bot.isServing && !ball.inPlay) {
    wantsToSwing = true;
    shotType = 'flat';
    swingSide = 'serve';
    power = 0.64;
    // Serve diagonally into the cross service box
    const serveTargetX = bot.zone === 'left' ? 2.2 : -2.2;
    targetAim = {
      x: serveTargetX + (deterministicUnit(bot, ball, 2) - 0.5) * config.aimError,
      y: 0,
      z: isSouth ? -5.5 : 5.5,
    };
    return {
      targetPosition: bot.position,
      velocity: { x: 0, y: 0, z: 0 },
      wantsToSwing,
      shotType,
      swingSide,
      power,
      targetAim,
      stateDescription: 'Serving',
    };
  }

  // 2. CHECK BALL APPROACH DIRECTION
  const ballComingToBotSide =
    ball.lastHitter !== bot.side &&
    (isSouth ? ball.velocity.z > 0.3 : ball.velocity.z < -0.3);

  // 3. DOUBLES COURT COVERAGE & PARTNER RESPONSIBILITY
  let isMyBall = true;
  if (isDoubles && teammate) {
    const mateDist = Math.hypot(ball.position.x - teammate.position.x, ball.position.z - teammate.position.z);
    const myDist = Math.hypot(ball.position.x - bot.position.x, ball.position.z - bot.position.z);

    const teammateIsActivelyTaking =
      teammate.role !== 'human' || teammate.isSwinging || Math.hypot(teammate.velocity.x, teammate.velocity.z) > 0.2;
    if (teammateIsActivelyTaking && mateDist < myDist - 1.1 && mateDist < 3.2) {
      // Partner is significantly closer to intercept, avoid double-committing
      isMyBall = false;
    }
  }

  // 4. INTERCEPTION & POSITIONING LOGIC
  if (ball.inPlay && ballComingToBotSide) {
    if (isMyBall) {
      stateDesc = 'Intercepting';

      // Ball trajectory prediction
      const landing = predictBallLanding(ball);
      const reactionScale = Math.max(0.35, Math.min(1, landing.timeToBounce / Math.max(config.reactionTime, 0.01)));
      movementScale = reactionScale;
      const isDeepBall = isSouth
        ? (ball.position.z > 6.0 || (landing.z > 8.5 && ball.velocity.z > 5.0))
        : (ball.position.z < -6.0 || (landing.z < -8.5 && ball.velocity.z < -5.0));

      const isLob = ball.velocity.y > 2.0 || ball.position.y > 2.4;

      let interceptZ = isSouth
        ? Math.max(2.4, Math.min(8.6, landing.z))
        : Math.min(-2.4, Math.max(-8.6, landing.z));

      // Padel Wall Rebound Play:
      // If the ball is going deep into the back glass, backpedal and wait for the rebound!
      if (config.wallPrediction && isDeepBall && isLob) {
        stateDesc = 'Anticipating Rebound';
        // Stand 1.8m in front of back glass to strike ball as it rebounds out
        interceptZ = isSouth ? 7.6 : -7.6;
      }

      // Intercept X based on predicted landing with slight lateral offset for clean racket strike
      let expectedX = landing.x;
      const errorSeed = ((bot.slot * 17 + ball.bounceCount * 31) % 101) / 100 - 0.5;
      expectedX += errorSeed * config.positionError;
      expectedX = Math.max(minX, Math.min(maxX, expectedX));

      // Offset standing position slightly based on forehand vs backhand side
      // In Three.js: South player looks towards -Z; racket in right hand (+X in local space).
      // North player looks towards +Z; racket in right hand (-X in world space).
      const forehandOffset = isSouth ? -0.45 : 0.45;
      const strikeX = Math.max(minX, Math.min(maxX, expectedX + forehandOffset));

      targetPos = {
        x: strikeX,
        y: 0,
        z: interceptZ,
      };

      // 5. CONTACT WINDOW EVALUATION
      const dx = ball.position.x - bot.position.x;

      const onBotSide = isSouth ? ball.position.z > 0.2 : ball.position.z < -0.2;
      const validGroundstroke = ball.bounceCount >= 1;
      const validVolley = ball.bounceCount === 0 && onBotSide && ball.position.y > 0.85 && Math.abs(ball.position.z) < 6.2;

      // Determine Forehand vs Backhand based on ball position relative to player
      if (isSouth) {
        swingSide = dx >= 0 ? 'forehand' : 'backhand';
      } else {
        swingSide = dx <= 0 ? 'forehand' : 'backhand';
      }

      // Overhead check
      if (ball.position.y > 1.65) {
        swingSide = 'overhead';
      }

      // Contact Range Check: tight 1.8m skill zone
      const contact = evaluateContactQuality(bot.position, ball.position, ball.velocity.z);
      if (contact.quality !== 'OUT_OF_REACH' && (validGroundstroke || validVolley) && ball.position.y <= 2.85) {
        wantsToSwing = true;
        stateDesc = 'Swinging';

        // TACTICAL SHOT SELECTION
        if (ball.position.y > 1.6 && Math.abs(bot.position.z) < 5.2 && deterministicUnit(bot, ball, 3) < config.smashThreshold) {
          // Overhead smash opportunity!
          shotType = 'smash';
          power = config.powerMax;
          // Spike into opponent court cross corner
          targetAim = {
            x: opponent.position.x > 0 ? -3.2 : 3.2,
            y: 0,
            z: isSouth ? -8.4 : 8.4,
          };
        } else if (Math.abs(opponent.position.z) < 4.0 && deterministicUnit(bot, ball, 4) < 0.65) {
          // Opponent rushed net -> Lob over them!
          shotType = 'lob';
          power = 0.74;
          targetAim = {
            x: (deterministicUnit(bot, ball, 5) - 0.5) * 3.6,
            y: 0,
            z: isSouth ? -8.8 : 8.8,
          };
        } else if (config.wallPrediction && deterministicUnit(bot, ball, 6) < 0.45) {
          // Bandeja slice: low ball off opponent back glass
          shotType = 'slice';
          power = (config.powerMin + config.powerMax) * 0.5;
          targetAim = {
            x: opponent.position.x > 0 ? -3.4 : 3.4,
            y: 0,
            z: isSouth ? -6.8 : 6.8,
          };
        } else {
          // Fast topspin drive or flat shot
          shotType = deterministicUnit(bot, ball, 7) < 0.6 ? 'topspin' : 'flat';
          power = (config.powerMin + config.powerMax) * 0.52;
          const targetX = opponent.position.x > 0 ? -2.8 : 2.8;
          targetAim = {
            x: targetX + (deterministicUnit(bot, ball, 8) - 0.5) * config.aimError,
            y: 0,
            z: isSouth ? -6.8 : 6.8,
          };
        }
      }
    } else {
      // Supporting positioning: partner is taking the shot
      stateDesc = 'Supporting Partner';
      // If teammate is forward, cover the back; if teammate is back, move slightly forward
      const mateZ = teammate ? teammate.position.z : homeZ;
      const supportZ = isSouth
        ? (mateZ < 4.5 ? 7.2 : 5.8)
        : (mateZ > -4.5 ? -7.2 : -5.8);

      targetPos = {
        x: homeX,
        y: 0,
        z: supportZ,
      };
    }
  } else {
    // Ball is on opponent's half -> maintain active ready stance
    stateDesc = 'Ready Stance';
    targetPos = {
      x: homeX,
      y: 0,
      z: isSouth ? 6.4 : -6.4,
    };
  }

  // 6. SMOOTH MOVEMENT & KINEMATICS VELOCITY CALCULATION
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
    stateDescription: stateDesc,
  };
}
