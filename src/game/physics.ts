import { BallState, COURT_CONFIG, ShotType, Side, Vector3D } from './types';

// Tuned for strategic, readable, fun sports pacing (Just Volleyball style crisp arc)
export const GRAVITY = 11.2; // Crisp, predictable gravity arc
export const BALL_RADIUS = 0.12;
export const BALL_MASS = 0.057;
export const AIR_DRAG_COEFF = 0.005; // Mild drag for crisp ball flight
export const MAGNUS_COEFF = 0.0022;

export function createInitialBall(servingSide: Side = 'south', serverPos?: Vector3D): BallState {
  const zSign = servingSide === 'south' ? 1 : -1;
  const startX = serverPos ? serverPos.x : (zSign > 0 ? -1.8 : 1.8);
  const startZ = serverPos ? serverPos.z - 0.6 * zSign : 6.8 * zSign;

  return {
    position: { x: startX, y: 0.95, z: startZ },
    velocity: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    radius: BALL_RADIUS,
    lastHitter: null,
    bounceCount: 0,
    bouncedInCourt: false,
    bouncedSide: null,
    hitWallBeforeFloor: false,
    inPlay: false,
    trail: [],
  };
}

export interface PhysicsStepResult {
  ball: BallState;
  events: {
    bouncedFloor: boolean;
    bouncedGlassWall: boolean;
    bouncedMeshWall: boolean;
    hitNet: boolean;
    outOfBounds: boolean;
    pointFault: boolean;
    faultReason?: string;
  };
}

/**
 * Step ball physics deterministically with dt (delta seconds)
 */
export function stepBallPhysics(
  ball: BallState,
  dt: number,
  substeps: number = 4
): PhysicsStepResult {
  if (!ball.inPlay) {
    return {
      ball: { ...ball },
      events: {
        bouncedFloor: false,
        bouncedGlassWall: false,
        bouncedMeshWall: false,
        hitNet: false,
        outOfBounds: false,
        pointFault: false,
      },
    };
  }

  // Clone ball state
  const b: BallState = {
    ...ball,
    position: { ...ball.position },
    velocity: { ...ball.velocity },
    spin: { ...ball.spin },
    trail: [...ball.trail],
  };

  const subDt = dt / substeps;
  let bouncedFloor = false;
  let bouncedGlassWall = false;
  let bouncedMeshWall = false;
  let hitNet = false;
  let outOfBounds = false;
  let pointFault = false;
  let faultReason: string | undefined;

  for (let s = 0; s < substeps; s++) {
    // 1. Aerodynamic drag force
    const speed = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z);
    const drag = AIR_DRAG_COEFF * speed;
    b.velocity.x -= drag * b.velocity.x * subDt;
    b.velocity.y -= (GRAVITY + drag * b.velocity.y) * subDt;
    b.velocity.z -= drag * b.velocity.z * subDt;

    // 2. Magnus spin effect
    b.velocity.y -= b.spin.x * MAGNUS_COEFF * speed * subDt;
    b.velocity.x += b.spin.y * MAGNUS_COEFF * speed * subDt;

    // Gradual spin decay
    b.spin.x *= 1 - 0.05 * subDt;
    b.spin.y *= 1 - 0.05 * subDt;
    b.spin.z *= 1 - 0.05 * subDt;

    // 3. Integrate position
    const oldZ = b.position.z;
    b.position.x += b.velocity.x * subDt;
    b.position.y += b.velocity.y * subDt;
    b.position.z += b.velocity.z * subDt;

    // 4. Net Collision check at z = 0 (court width: X from -5 to +5)
    if ((oldZ > 0 && b.position.z <= 0) || (oldZ < 0 && b.position.z >= 0)) {
      if (Math.abs(b.position.x) <= COURT_CONFIG.width / 2) {
        const netH = COURT_CONFIG.netHeight + 0.04 * Math.pow(Math.abs(b.position.x) / 5, 2);
        if (b.position.y <= netH) {
          // If very close to top tape cord (top 6cm) and moving with upward/flat momentum, graze over
          if (b.position.y >= netH - 0.06 && b.velocity.y > -1.2) {
            b.velocity.y = 1.35;
            b.velocity.z *= 0.72;
            b.position.y = netH + 0.02;
            hitNet = true;
          } else {
            // Net barrier stop & deflect downward
            b.position.z = oldZ > 0 ? 0.06 : -0.06;
            b.velocity.z *= -0.22;
            b.velocity.x *= 0.35;
            b.velocity.y *= 0.5;
            hitNet = true;
            pointFault = true;
            faultReason = 'Ball hit the net!';
          }
        }
      }
    }

    // 5. Floor Bounce (y = 0)
    if (b.position.y - b.radius <= 0) {
      b.position.y = b.radius;
      if (b.velocity.y < 0) {
        // High, satisfying, readable felt-on-turf bounce (~0.76 restitution)
        b.velocity.y = -b.velocity.y * 0.76;
        b.velocity.x *= 0.88;
        // Topspin rolls forward; backspin checks up
        b.velocity.z = b.velocity.z * 0.88 + b.spin.x * 0.035;
        b.spin.x *= 0.45;
        bouncedFloor = true;
        b.bounceCount += 1;

        const insideX = Math.abs(b.position.x) <= COURT_CONFIG.width / 2;
        const insideZ = Math.abs(b.position.z) <= COURT_CONFIG.length / 2;

        if (insideX && insideZ) {
          b.bouncedInCourt = true;
          b.bouncedSide = b.position.z > 0 ? 'south' : 'north';
        } else {
          outOfBounds = true;
          pointFault = true;
          faultReason = 'Out of bounds!';
        }

        if (b.bounceCount >= 2) {
          pointFault = true;
          faultReason = 'Double bounce!';
        }
      }
    }

    // 6. Wall Collisions (Padel court: Back glass at Z = ±10, side walls at X = ±5)
    // Accurate damping: Glass ~0.75, Wire Mesh ~0.60
    const halfLength = COURT_CONFIG.length / 2; // 10m
    const halfWidth = COURT_CONFIG.width / 2;   // 5m

    // Back walls (Tempered Glass) at Z = ±10
    if (b.position.z + b.radius >= halfLength && b.position.y <= COURT_CONFIG.glassBackWallHeight) {
      b.position.z = halfLength - b.radius;
      b.velocity.z = -Math.abs(b.velocity.z) * 0.75; // Realistic glass damping (~0.75)
      b.velocity.y = b.velocity.y * 0.90 - b.spin.x * 0.03;
      b.velocity.x *= 0.92;
      bouncedGlassWall = true;
      if (b.bounceCount === 0) {
        b.hitWallBeforeFloor = true;
        pointFault = true;
        faultReason = 'Ball hit back glass without bouncing on court floor!';
      }
    } else if (b.position.z - b.radius <= -halfLength && b.position.y <= COURT_CONFIG.glassBackWallHeight) {
      b.position.z = -halfLength + b.radius;
      b.velocity.z = Math.abs(b.velocity.z) * 0.75; // Realistic glass damping (~0.75)
      b.velocity.y = b.velocity.y * 0.90 + b.spin.x * 0.03;
      b.velocity.x *= 0.92;
      bouncedGlassWall = true;
      if (b.bounceCount === 0) {
        b.hitWallBeforeFloor = true;
        pointFault = true;
        faultReason = 'Ball hit back glass without bouncing on court floor!';
      }
    }

    // Side walls: Glass near back corners (|Z| > 6) and metal wire mesh (|Z| <= 6)
    if (Math.abs(b.position.x) + b.radius >= halfWidth && b.position.y <= COURT_CONFIG.glassBackWallHeight) {
      const isEast = b.position.x > 0;
      b.position.x = isEast ? halfWidth - b.radius : -halfWidth + b.radius;

      const isNearGlass = Math.abs(b.position.z) > 6;
      if (isNearGlass) {
        // Corner glass damping ~0.75
        b.velocity.x = (isEast ? -1 : 1) * Math.abs(b.velocity.x) * 0.75;
        b.velocity.z *= 0.92;
        bouncedGlassWall = true;
      } else {
        // Wire mesh damping ~0.60 with realistic minor grid deflection
        const deflection = (Math.random() - 0.5) * 0.6;
        b.velocity.x = (isEast ? -1 : 1) * Math.abs(b.velocity.x) * 0.60;
        b.velocity.z = b.velocity.z * 0.85 + deflection;
        bouncedMeshWall = true;
      }

      if (b.bounceCount === 0) {
        b.hitWallBeforeFloor = true;
        pointFault = true;
        faultReason = 'Ball hit side wall without bouncing on court floor!';
      }
    }
  }

  // Update motion trail
  b.trail.push({ ...b.position });
  if (b.trail.length > 14) {
    b.trail.shift();
  }

  return {
    ball: b,
    events: {
      bouncedFloor,
      bouncedGlassWall,
      bouncedMeshWall,
      hitNet,
      outOfBounds,
      pointFault,
      faultReason,
    },
  };
}

/**
 * Predict where and when the ball will land next on the court floor.
 */
export function predictBallLanding(ball: BallState): {
  x: number;
  z: number;
  timeToBounce: number;
  willReboundGlass: boolean;
} {
  if (!ball.inPlay) {
    return { x: ball.position.x, z: ball.position.z, timeToBounce: 0, willReboundGlass: false };
  }

  let px = ball.position.x;
  let py = ball.position.y;
  let pz = ball.position.z;
  let vx = ball.velocity.x;
  let vy = ball.velocity.y;
  let vz = ball.velocity.z;

  const dt = 0.04;
  let time = 0;
  let willReboundGlass = false;

  for (let step = 0; step < 90; step++) {
    time += dt;
    vy -= GRAVITY * dt;
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    if (Math.abs(pz) >= 9.8) {
      willReboundGlass = true;
    }

    if (py <= ball.radius) {
      return {
        x: Math.max(-4.8, Math.min(4.8, px)),
        z: Math.max(-9.8, Math.min(9.8, pz)),
        timeToBounce: time,
        willReboundGlass,
      };
    }
  }

  return { x: px, z: pz, timeToBounce: time, willReboundGlass };
}

export type HitQuality = 'PERFECT' | 'GOOD' | 'LATE' | 'OUT_OF_REACH';

/**
 * Tight, skill-based contact evaluation:
 * - Sweetspot: within 1.25m horizontal, waist-to-chest height -> maximum power and crisp pop
 * - Good: within 1.80m -> solid drive
 * - Late/Reach: within 2.20m -> reduced power
 * - Out of reach: > 2.20m or outside vertical zone -> miss
 */
export function evaluateContactQuality(
  playerPos: Vector3D,
  ballPos: Vector3D,
  ballVelocityZ: number
): { quality: HitQuality; distance: number; powerMultiplier: number } {
  const dx = ballPos.x - playerPos.x;
  const dy = ballPos.y - 1.1; // Optimal contact height at 1.1m (waist/chest)
  const dz = ballPos.z - playerPos.z;
  const dist = Math.hypot(dx, dz);

  // Tight skill-based reach limit (up to 2.2m horizontal, 3.2m height)
  if (dist > 2.2 || ballPos.y > 3.2 || ballPos.y < 0.1) {
    return { quality: 'OUT_OF_REACH', distance: dist, powerMultiplier: 0 };
  }

  const heightDist = Math.abs(dy);
  if (dist <= 1.25 && heightDist <= 0.7) {
    return { quality: 'PERFECT', distance: dist, powerMultiplier: 1.20 };
  } else if (dist <= 1.80 && heightDist <= 1.2) {
    return { quality: 'GOOD', distance: dist, powerMultiplier: 1.0 };
  } else {
    return { quality: 'LATE', distance: dist, powerMultiplier: 0.82 };
  }
}

/**
 * Execute a padel racket strike with intuitive flight arc and directional steering
 */
export function strikeBallWithRacket(
  ball: BallState,
  playerSide: Side,
  shotType: ShotType,
  power: number, // 0.2 to 1.0
  targetAim: Vector3D,
  playerPos: Vector3D,
  directionalBias?: { x: number; z: number } // Optional keyboard WASD directional steering
): BallState {
  let aimX = targetAim.x;
  let aimZ = targetAim.z;

  // If player held arrow/WASD keys, steer shot down-the-line or cross-court
  if (directionalBias) {
    aimX += directionalBias.x * 2.5;
    aimZ += directionalBias.z * 2.0 * (playerSide === 'south' ? -1 : 1);
  }

  // Clamp aim safely to inside opponent's court
  aimX = Math.max(-4.4, Math.min(4.4, aimX));
  if (playerSide === 'south') {
    aimZ = Math.max(-9.4, Math.min(-1.5, aimZ));
  } else {
    aimZ = Math.max(1.5, Math.min(9.4, aimZ));
  }

  const dx = aimX - ball.position.x;
  const dz = aimZ - ball.position.z;
  const dist = Math.hypot(dx, dz);

  // Distinct shot physics parameters
  const baseSpeed = 12.0 + power * 5.5;
  let speed = baseSpeed;
  let vy = 3.8 + power * 1.2;
  let spinX = 0;
  let spinY = (aimX - playerPos.x) * 1.8;

  switch (shotType) {
    case 'smash':
      // Fast downward drive toward opponent's court floor
      speed = baseSpeed * 1.45;
      // If contacting high in the air, spike steeply downward; otherwise direct drive
      vy = ball.position.y > 1.6 ? -0.8 - power * 1.2 : 1.4;
      spinX = 16;
      break;
    case 'lob':
      // High defensive lob with deep court landing (near back 2m)
      speed = baseSpeed * 0.82;
      vy = 9.8 + power * 2.2;
      spinX = -14;
      break;
    case 'slice':
      // Bandeja / Vibora slice: low-skimming trajectory that checks and skids off back glass
      speed = baseSpeed * 1.05;
      vy = 3.2 + power * 0.7;
      spinX = -32;
      break;
    case 'drop':
      // Soft touch drop: lands short just past the net
      speed = baseSpeed * 0.54;
      vy = 3.4;
      spinX = -28;
      break;
    case 'topspin':
      // Heavy topspin: dips sharply into baseline
      speed = baseSpeed * 1.14;
      vy = 4.2 + power * 1.1;
      spinX = 32;
      break;
    case 'flat':
    default:
      // Balanced direct drive
      speed = baseSpeed * 1.02;
      vy = 3.6 + power * 1.0;
      spinX = 6;
      break;
  }

  const dirX = dist > 0.01 ? dx / dist : 0;
  const dirZ = dist > 0.01 ? dz / dist : (playerSide === 'south' ? -1 : 1);

  const vx = dirX * speed;
  const vz = dirZ * speed;

  return {
    ...ball,
    velocity: { x: vx, y: vy, z: vz },
    spin: { x: spinX, y: spinY, z: 0 },
    lastHitter: playerSide,
    bounceCount: 0,
    bouncedInCourt: false,
    bouncedSide: null,
    hitWallBeforeFloor: false,
    inPlay: true,
  };
}

/**
 * Execute an underhand padel serve with slow, readable arc
 */
export function executePadelServe(
  ball: BallState,
  servingSide: Side,
  targetBox: 'right' | 'left',
  power: number = 0.65
): BallState {
  const zSign = servingSide === 'south' ? -1 : 1;
  const targetX = targetBox === 'right' ? 2.2 : -2.2;
  const targetZ = 5.2 * zSign;

  const targetAim: Vector3D = { x: targetX, y: 0, z: targetZ };
  return strikeBallWithRacket(ball, servingSide, 'flat', power, targetAim, ball.position);
}
