import { BallState, Difficulty, PlayerState, ShotType, SwingSide, Vector3D } from './types';
import { predictBallLanding } from './physics';

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

// Normalized difficulty configuration
interface DifficultyConfig {
  speed: number;
  reactionTime: number; // seconds
  aimError: number;     // meters
  positionError: number;// meters
  powerMin: number;
  powerMax: number;
  smashThreshold: number; // willingness to smash
  wallPrediction: boolean;
}

function getDifficultyConfig(diff: Difficulty): DifficultyConfig {
  switch (diff) {
    case 'easy':
    case 'amateur':
      return {
        speed: 4.4,
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
        speed: 6.0,
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
        speed: 5.2,
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
  difficulty: Difficulty,
  dt: number,
  isDoubles = true,
  teammate?: PlayerState
): BotDecision {
  const config = getDifficultyConfig(difficulty);
  const isSouth = bot.side === 'south';

  // Court zone boundaries (Doubles left/right halves)
  let minX = -4.4;
  let maxX = 4.4;
  let homeX = 0;

  if (isDoubles) {
    if (bot.zone === 'left') {
      minX = -4.4;
      maxX = 0.4;
      homeX = -2.2;
    } else {
      minX = -0.4;
      maxX = 4.4;
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

  let targetAim: Vector3D = {
    x: (Math.random() - 0.5) * 3.5,
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
      x: serveTargetX + (Math.random() - 0.5) * config.aimError,
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
  const ballComingToBotSide = isSouth
    ? (ball.velocity.z > 0.3 || ball.position.z > -0.5)
    : (ball.velocity.z < -0.3 || ball.position.z < 0.5);

  // 3. DOUBLES COURT COVERAGE & PARTNER RESPONSIBILITY
  let isMyBall = true;
  if (isDoubles && teammate) {
    const mateDist = Math.hypot(ball.position.x - teammate.position.x, ball.position.z - teammate.position.z);
    const myDist = Math.hypot(ball.position.x - bot.position.x, ball.position.z - bot.position.z);

    // Ball clearly in partner's zone
    if (bot.zone === 'left' && ball.position.x > 0.8) {
      isMyBall = false;
    } else if (bot.zone === 'right' && ball.position.x < -0.8) {
      isMyBall = false;
    } else if (mateDist < myDist - 1.1 && mateDist < 3.2) {
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
      const dz = ball.position.z - bot.position.z;
      const distToBall = Math.hypot(dx, dz);

      const onBotSide = isSouth ? ball.position.z > 0.2 : ball.position.z < -0.2;
      const validGroundstroke = ball.bounceCount === 1;
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
      if (distToBall <= 1.85 && (validGroundstroke || validVolley) && ball.position.y >= 0.25 && ball.position.y <= 2.85) {
        wantsToSwing = true;
        stateDesc = 'Swinging';

        // TACTICAL SHOT SELECTION
        if (ball.position.y > 1.6 && Math.abs(bot.position.z) < 5.2 && Math.random() < config.smashThreshold) {
          // Overhead smash opportunity!
          shotType = 'smash';
          power = config.powerMax;
          // Spike into opponent court cross corner
          targetAim = {
            x: opponent.position.x > 0 ? -3.2 : 3.2,
            y: 0,
            z: isSouth ? -8.4 : 8.4,
          };
        } else if (Math.abs(opponent.position.z) < 4.0 && Math.random() < 0.65) {
          // Opponent rushed net -> Lob over them!
          shotType = 'lob';
          power = 0.74;
          targetAim = {
            x: (Math.random() - 0.5) * 3.6,
            y: 0,
            z: isSouth ? -8.8 : 8.8,
          };
        } else if (config.wallPrediction && Math.random() < 0.45) {
          // Bandeja slice: low ball off opponent back glass
          shotType = 'slice';
          power = (config.powerMin + config.powerMax) * 0.5;
          targetAim = {
            x: opponent.position.x > 0 ? -3.4 : 3.4,
            y: 0,
            z: isSouth ? -8.6 : 8.6,
          };
        } else {
          // Fast topspin drive or flat shot
          shotType = Math.random() < 0.6 ? 'topspin' : 'flat';
          power = (config.powerMin + config.powerMax) * 0.52;
          const targetX = opponent.position.x > 0 ? -2.8 : 2.8;
          targetAim = {
            x: targetX + (Math.random() - 0.5) * config.aimError,
            y: 0,
            z: isSouth ? -7.4 : 7.4,
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
    vx = (diffX / distToTarget) * (step / dt);
    vz = (diffZ / distToTarget) * (step / dt);
  }

  const minZ = isSouth ? 1.0 : -9.4;
  const maxZ = isSouth ? 9.4 : -1.0;

  const nextPos: Vector3D = {
    x: Math.max(minX, Math.min(maxX, bot.position.x + vx * dt)),
    y: 0,
    z: Math.max(minZ, Math.min(maxZ, bot.position.z + vz * dt)),
  };

  return {
    targetPosition: nextPos,
    velocity: { x: vx, y: 0, z: vz },
    wantsToSwing,
    shotType,
    swingSide,
    power,
    targetAim,
    stateDescription: stateDesc,
  };
}
