import {
  BallState,
  COURT_CONFIG,
  HitQuality,
  PhysicsEvents,
  PhysicsStepResult,
  ShotType,
  Side,
  Vector3D,
} from './types';

// Real-world padel physical constants
export const GRAVITY = 9.81; // Real Earth gravity (-9.81 m/s²)
export const BALL_RADIUS = 0.12; // Standard padel ball radius (meters)
export const BALL_MASS = 0.057; // kg (~57g)
export const MAX_BALL_SPEED = 35.0; // Hard cap ~35 m/s
export const AIR_DRAG_COEFF = 0.0055; // Quadratic drag coefficient
export const MAGNUS_COEFF = 0.0028; // Magnus effect coefficient for topspin/slice

/**
 * Factory for initial ball state
 */
export function createInitialBall(servingSide: Side = 'south', serverPos?: Vector3D): BallState {
  const zSign = servingSide === 'south' ? 1 : -1;
  const startX = serverPos ? serverPos.x : (zSign > 0 ? -1.8 : 1.8);
  const startZ = serverPos ? serverPos.z - 0.6 * zSign : 7.2 * zSign;

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
    wallHitCount: 0,
    lastWallType: null,
    isServe: false,
    serveBoxTarget: null,
    inPlay: false,
    trail: [],
  };
}

/**
 * Continuous Collision Detection (CCD) Swept-Sphere Physics Step (Fixed 60 Hz)
 * Prevents tunneling through walls, net, or floor even at max speed 35 m/s.
 */
export function stepBallPhysics(
  ball: BallState,
  dt: number,
  substeps: number = 6
): PhysicsStepResult {
  const events: PhysicsEvents = {
    bouncedFloor: false,
    bouncedGlassWall: false,
    bouncedMeshWall: false,
    hitNet: false,
    netTapeHit: false,
    netTapeRolledOver: false,
    outOfBounds: false,
    pointFault: false,
  };

  if (!ball.inPlay) {
    return { ball: { ...ball }, events };
  }

  const b: BallState = {
    ...ball,
    position: { ...ball.position },
    velocity: { ...ball.velocity },
    spin: { ...ball.spin },
    trail: [...ball.trail],
  };

  const subDt = dt / substeps;
  const halfL = COURT_CONFIG.length / 2; // 10m
  const halfW = COURT_CONFIG.width / 2; // 5m
  const r = BALL_RADIUS;

  for (let s = 0; s < substeps; s++) {
    // 1. Aerodynamic drag & Magnus effect
    let speed = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z);
    if (speed > MAX_BALL_SPEED) {
      const scale = MAX_BALL_SPEED / speed;
      b.velocity.x *= scale;
      b.velocity.y *= scale;
      b.velocity.z *= scale;
      speed = MAX_BALL_SPEED;
    }

    const drag = AIR_DRAG_COEFF * speed;
    b.velocity.x -= drag * b.velocity.x * subDt;
    b.velocity.y -= (GRAVITY + drag * b.velocity.y) * subDt;
    b.velocity.z -= drag * b.velocity.z * subDt;

    // Magnus effect:
    // +spin.x (topspin) pulls DOWNWARD
    // -spin.x (backspin/slice) provides LIFT
    // +spin.y curves laterally
    b.velocity.y -= b.spin.x * MAGNUS_COEFF * speed * subDt;
    b.velocity.x += b.spin.y * MAGNUS_COEFF * speed * subDt;

    // Gradual spin decay
    b.spin.x *= 1 - 0.08 * subDt;
    b.spin.y *= 1 - 0.08 * subDt;
    b.spin.z *= 1 - 0.08 * subDt;

    // Predict swept path
    const p0 = { ...b.position };
    const p1 = {
      x: p0.x + b.velocity.x * subDt,
      y: p0.y + b.velocity.y * subDt,
      z: p0.z + b.velocity.z * subDt,
    };

    // 2. Continuous Net Collision check at z = 0 (|x| <= 5.0)
    if ((p0.z > 0 && p1.z <= 0) || (p0.z < 0 && p1.z >= 0)) {
      const denom = p1.z - p0.z;
      const t = denom !== 0 ? (0 - p0.z) / denom : 0;
      if (t >= 0 && t <= 1) {
        const xCross = p0.x + (p1.x - p0.x) * t;
        const yCross = p0.y + (p1.y - p0.y) * t;

        if (Math.abs(xCross) <= halfW + 0.1) {
          // Curved net height: 0.88m at center to 0.92m at posts
          const netHeightAtX =
            COURT_CONFIG.netHeight + 0.04 * Math.pow(Math.abs(xCross) / halfW, 2);

          if (yCross - r <= netHeightAtX) {
            // Net collision detected!
            events.hitNet = true;
            events.collisionPos = { x: xCross, y: yCross, z: 0 };
            events.collisionNormal = { x: 0, y: 0, z: p0.z > 0 ? 1 : -1 };
            events.impactSpeed = speed;

            // Check if top white tape hit (top 5 cm)
            if (yCross >= netHeightAtX - 0.05 && b.velocity.y > -1.2) {
              events.netTapeHit = true;
              // Roll / graze over the net
              b.position.z = p0.z > 0 ? -0.08 : 0.08;
              b.position.y = netHeightAtX + r + 0.01;
              b.velocity.z *= 0.65; // slowed down
              b.velocity.y = 0.9;
              events.netTapeRolledOver = true;
            } else {
              // Net catches ball! Deflect downward and drop on hitter side
              b.position.z = p0.z > 0 ? 0.06 : -0.06;
              b.velocity.z *= -0.15;
              b.velocity.x *= 0.25;
              b.velocity.y = -0.5;
              events.pointFault = true;
              events.faultReason = 'Ball hit the net!';
            }
          }
        }
      }
    }

    // 3. Continuous Floor Collision check (y = BALL_RADIUS)
    if (p1.y - r <= 0 && b.velocity.y < 0) {
      const denom = p1.y - p0.y;
      const t = denom !== 0 ? Math.max(0, Math.min(1, (r - p0.y) / denom)) : 0;
      const xBounce = p0.x + (p1.x - p0.x) * t;
      const zBounce = p0.z + (p1.z - p0.z) * t;

      b.position.x = xBounce;
      b.position.y = r;
      b.position.z = zBounce;

      // Restitution ~0.75 on synthetic padel turf
      b.velocity.y = -b.velocity.y * 0.75;

      // Surface turf friction: slows lateral speed and transfers spin
      b.velocity.x *= 0.86;
      b.velocity.z = b.velocity.z * 0.86 + b.spin.x * 0.035;
      b.spin.x *= 0.45; // loses half spin on bounce

      events.bouncedFloor = true;
      events.collisionPos = { x: xBounce, y: r, z: zBounce };
      events.collisionNormal = { x: 0, y: 1, z: 0 };
      events.impactSpeed = speed;

      b.bounceCount += 1;

      const insideCourtX = Math.abs(xBounce) <= halfW;
      const insideCourtZ = Math.abs(zBounce) <= halfL;

      if (insideCourtX && insideCourtZ) {
        b.bouncedInCourt = true;
        b.bouncedSide = zBounce > 0 ? 'south' : 'north';

        // Check if serve bounce is in the designated service box
        if (b.isServe) {
          const expectedSide = b.lastHitter === 'south' ? 'north' : 'south';
          const inCorrectHalf = b.bouncedSide === expectedSide;
          // Service line is 6.95m from net (|z| <= 6.95)
          const inServiceDepth = Math.abs(zBounce) <= COURT_CONFIG.serviceLineZ;
          const inCorrectBox =
            b.serveBoxTarget === 'right' ? xBounce > 0 : xBounce < 0;

          if (!inCorrectHalf || !inServiceDepth || !inCorrectBox) {
            events.pointFault = true;
            events.faultReason = 'Serve out of designated service box!';
          } else if (events.netTapeRolledOver) {
            // Net tape hit and landed in service box -> LET!
            events.isLetServe = true;
            events.pointFault = true;
            events.faultReason = 'Let serve! Ball hit net tape and landed in service box.';
          }
        }
      } else {
        events.outOfBounds = true;
        events.pointFault = true;
        events.faultReason = 'Ball bounced out of court!';
      }

      // In padel, ball may bounce only once on opponent court floor before being hit!
      if (b.bounceCount >= 2) {
        events.pointFault = true;
        events.faultReason = 'Double bounce on court floor!';
      }
    } else {
      b.position.y = p1.y;
    }

    // 4. Continuous Back Glass Wall Collision check (Z = ±(10 - r), height <= 4.0m)
    const backWallZ = halfL - r;
    if (Math.abs(p1.z) >= backWallZ && b.position.y <= COURT_CONFIG.glassBackWallHeight) {
      const isNorth = p1.z < 0;
      b.position.z = isNorth ? -backWallZ : backWallZ;

      // Glass wall restitution ~0.80, slight spin loss
      b.velocity.z = (isNorth ? 1 : -1) * Math.abs(b.velocity.z) * 0.80;
      b.velocity.x *= 0.94;
      b.velocity.y = b.velocity.y * 0.92 + (isNorth ? b.spin.x : -b.spin.x) * 0.02;
      b.spin.x *= 0.88;

      events.bouncedGlassWall = true;
      events.collisionPos = { ...b.position };
      events.collisionNormal = { x: 0, y: 0, z: isNorth ? 1 : -1 };
      events.impactSpeed = speed;
      b.wallHitCount += 1;
      b.lastWallType = 'glass';

      // Rule: Hitting back glass BEFORE bouncing on opponent's turf = FAULT by hitter!
      if (b.bounceCount === 0) {
        b.hitWallBeforeFloor = true;
        events.pointFault = true;
        events.faultReason = 'Ball hit back glass without bouncing on court floor first!';
      }
    } else {
      b.position.z = p1.z;
    }

    // 5. Continuous Side Wall Collision check (X = ±(5 - r))
    // Side walls: 3m/4m glass near back (|z| >= 6.0) and 3m wire mesh fence (|z| < 6.0)
    const sideWallX = halfW - r;
    if (Math.abs(p1.x) >= sideWallX && b.position.y <= COURT_CONFIG.glassBackWallHeight) {
      const isEast = p1.x > 0;
      b.position.x = isEast ? sideWallX : -sideWallX;

      const isSideGlass = Math.abs(b.position.z) >= 6.0;

      if (isSideGlass) {
        // Glass side wall: restitution ~0.80
        b.velocity.x = (isEast ? -1 : 1) * Math.abs(b.velocity.x) * 0.80;
        b.velocity.z *= 0.94;
        b.spin.y *= 0.88;
        events.bouncedGlassWall = true;
        b.lastWallType = 'glass';
      } else {
        // Wire mesh fence: restitution ~0.60 (deader bounce) with metallic rattle
        b.velocity.x = (isEast ? -1 : 1) * Math.abs(b.velocity.x) * 0.60;
        b.velocity.z *= 0.88;
        // Minor grid vibration deflection
        b.velocity.z += Math.sin(b.position.z * 18.0) * 0.25;
        events.bouncedMeshWall = true;
        b.lastWallType = 'fence';

        // Padel Serve Rule: On a serve, ball bouncing in service box and hitting fence = FAULT!
        if (b.isServe) {
          events.pointFault = true;
          events.faultReason = 'Serve hit side wire mesh fence after bounce (Serve Fault)!';
        }
      }

      events.collisionPos = { ...b.position };
      events.collisionNormal = { x: isEast ? -1 : 1, y: 0, z: 0 };
      events.impactSpeed = speed;
      b.wallHitCount += 1;

      // Rule: Hitting side wall BEFORE bouncing on opponent's turf = FAULT!
      if (b.bounceCount === 0) {
        b.hitWallBeforeFloor = true;
        events.pointFault = true;
        events.faultReason = 'Ball hit side wall without bouncing on court floor first!';
      }
    } else {
      b.position.x = p1.x;
    }
  }

  // Update visual ball motion trail
  b.trail.push({ ...b.position });
  if (b.trail.length > 16) {
    b.trail.shift();
  }

  return { ball: b, events };
}

/**
 * Predict where and when the ball will land next on the court floor,
 * including wall rebound trajectories for bajadas and defensive wall play.
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

  const dt = 1 / 120;
  let time = 0;
  let willReboundGlass = false;
  const halfL = COURT_CONFIG.length / 2;
  const halfW = COURT_CONFIG.width / 2;
  const r = BALL_RADIUS;

  for (let step = 0; step < 360; step++) {
    time += dt;
    const speed = Math.hypot(vx, vy, vz);
    const drag = AIR_DRAG_COEFF * speed;

    vx -= drag * vx * dt;
    vy -= (GRAVITY + drag * vy) * dt;
    vz -= drag * vz * dt;

    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    // Side wall bounce prediction
    if (Math.abs(px) + r >= halfW) {
      px = Math.sign(px) * (halfW - r);
      vx *= -0.75;
      willReboundGlass = true;
    }

    // Back wall bounce prediction
    if (Math.abs(pz) + r >= halfL) {
      pz = Math.sign(pz) * (halfL - r);
      vz *= -0.80;
      willReboundGlass = true;
    }

    if (py <= r) {
      return {
        x: Math.max(-halfW + r, Math.min(halfW - r, px)),
        z: Math.max(-halfL + r, Math.min(halfL - r, pz)),
        timeToBounce: time,
        willReboundGlass,
      };
    }
  }

  return { x: px, z: pz, timeToBounce: time, willReboundGlass };
}

/**
 * Evaluates contact timing and reach quality:
 * - PERFECT: tight sweetspot (0.8m - 1.35m horizontal distance, waist height 0.85m - 1.45m)
 *   -> power shot with golden spark, crisp pop audio
 * - EARLY: ball is struck ahead of optimal plane -> pulled shot with sharper angle
 * - LATE: ball is struck behind optimal plane -> weak reach, shallower depth
 * - GOOD: solid contact within 1.85m
 * - OUT_OF_REACH: outside 2.25m horizontal or > 3.2m height
 */
export function evaluateContactTiming(
  playerPos: Vector3D,
  ballPos: Vector3D,
  playerSide: Side
): {
  quality: HitQuality;
  distance: number;
  powerMultiplier: number;
  timingOffsetZ: number;
} {
  const dx = ballPos.x - playerPos.x;
  const dy = ballPos.y - 1.1; // optimal height at 1.1m (waist to chest)
  const dz = ballPos.z - playerPos.z;
  const horizontalDist = Math.hypot(dx, dz);

  // Beyond reachable radius or too high/low
  if (horizontalDist > 2.25 || ballPos.y > 3.25 || ballPos.y < 0.1) {
    return { quality: 'OUT_OF_REACH', distance: horizontalDist, powerMultiplier: 0, timingOffsetZ: dz };
  }

  // Timing offset along court Z axis:
  // For South player (facing North / -Z): optimal hit plane is ~0.2m in front (z < player.z)
  // dz < -0.4: Early (pulled)
  // dz > +0.3: Late (jammed / reaching behind)
  const forwardSign = playerSide === 'south' ? -1 : 1;
  const relativeZ = dz * forwardSign; // positive = in front of player

  const heightDist = Math.abs(dy);

  if (horizontalDist <= 1.35 && heightDist <= 0.7) {
    if (relativeZ >= -0.25 && relativeZ <= 0.45) {
      return { quality: 'PERFECT', distance: horizontalDist, powerMultiplier: 1.25, timingOffsetZ: dz };
    } else if (relativeZ > 0.45) {
      return { quality: 'EARLY', distance: horizontalDist, powerMultiplier: 0.95, timingOffsetZ: dz };
    } else {
      return { quality: 'LATE', distance: horizontalDist, powerMultiplier: 0.85, timingOffsetZ: dz };
    }
  } else if (horizontalDist <= 1.85 && heightDist <= 1.1) {
    return { quality: 'GOOD', distance: horizontalDist, powerMultiplier: 1.0, timingOffsetZ: dz };
  } else {
    return { quality: 'LATE', distance: horizontalDist, powerMultiplier: 0.78, timingOffsetZ: dz };
  }
}

/**
 * Backward compatibility evaluator based on horizontal distance and sweetspot height
 */
export function evaluateContactQuality(
  playerPos: Vector3D,
  ballPos: Vector3D,
  ballVelocityZ: number
): { quality: HitQuality; distance: number; powerMultiplier: number } {
  const dx = ballPos.x - playerPos.x;
  const dy = ballPos.y - 1.1;
  const dz = ballPos.z - playerPos.z;
  const dist = Math.hypot(dx, dz);

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
 * Strike ball with racket incorporating:
 * - Direction from movement input held at hit time (auto-aim)
 * - Timing quality adjustments (pulled if early, weak if late, laser if perfect)
 * - Shot modifiers: lob, drop, smash, bajada, topspin, slice, flat
 */
export function strikeBallWithRacket(
  ball: BallState,
  playerSide: Side,
  shotType: ShotType,
  power: number, // 0.2 to 1.0
  targetAim: Vector3D,
  playerPos: Vector3D,
  directionalBias?: { x: number; z: number },
  timingQuality: HitQuality = 'GOOD'
): BallState {
  let aimX = targetAim.x;
  let aimZ = targetAim.z;

  // Auto-aim direction from movement input held at hit time:
  // Forward (bias.z > 0) = deep shot into opponent baseline
  // Backward (bias.z < 0) = short / drop shot
  // Left / Right (bias.x) = angled cross-court or down-the-line
  if (directionalBias) {
    aimX += directionalBias.x * 2.8;
    aimZ += directionalBias.z * 2.6 * (playerSide === 'south' ? -1 : 1);
  }

  // Timing quality modifications:
  // EARLY: pulled shot with sharper angle
  // LATE: pushed wide or weak
  if (timingQuality === 'EARLY') {
    aimX += (playerSide === 'south' ? -0.8 : 0.8);
  } else if (timingQuality === 'LATE') {
    aimX += (playerSide === 'south' ? 0.7 : -0.7);
    aimZ *= 0.85; // shallower depth
  }

  // Clamp aim to valid opponent court bounds
  aimX = Math.max(-4.4, Math.min(4.4, aimX));
  if (playerSide === 'south') {
    aimZ = Math.max(-9.4, Math.min(-1.5, aimZ));
  } else {
    aimZ = Math.max(1.5, Math.min(9.4, aimZ));
  }

  const dx = aimX - ball.position.x;
  const dz = aimZ - ball.position.z;
  const dist = Math.hypot(dx, dz);

  // Speed and trajectory tuned for arcade yet realistic padel feel
  const effectivePower = Math.min(1.0, power * (timingQuality === 'PERFECT' ? 1.25 : 1.0));
  const baseSpeed = 8.5 + effectivePower * 5.0;
  let speed = baseSpeed;
  let vy = 4.6 + effectivePower * 1.5;
  let spinX = 0;
  let spinY = (aimX - playerPos.x) * 1.8;

  switch (shotType) {
    case 'smash':
      // Steep downward spike
      speed = baseSpeed * 1.55;
      vy = ball.position.y > 1.6 ? -1.0 - effectivePower * 1.8 : 0.8;
      spinX = 22;
      break;

    case 'lob':
      // High defensive lob landing deep in back 2m
      speed = baseSpeed * 0.78;
      vy = 10.5 + effectivePower * 2.2;
      spinX = -16;
      break;

    case 'drop':
      // Soft touch drop: lands short near net
      speed = baseSpeed * 0.52;
      vy = 4.4;
      spinX = -26;
      break;

    case 'bajada':
      // Aggressive downward wall-return drive after rebounding off back glass
      speed = baseSpeed * 1.35;
      vy = -0.5 - effectivePower * 1.0;
      spinX = 26;
      break;

    case 'slice':
      // Bandeja / Vibora slice: low-skimming, checks off back glass
      speed = baseSpeed * 1.08;
      vy = 4.2 + effectivePower * 0.8;
      spinX = -32;
      break;

    case 'topspin':
      // Dips sharply into baseline
      speed = baseSpeed * 1.18;
      vy = 4.9 + effectivePower * 1.2;
      spinX = 34;
      break;

    case 'flat':
    default:
      speed = baseSpeed * 1.05;
      vy = 4.6 + effectivePower * 1.0;
      spinX = 8;
      break;
  }

  // Late reach reduces speed
  if (timingQuality === 'LATE') {
    speed *= 0.82;
    vy *= 0.9;
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
    wallHitCount: 0,
    lastWallType: null,
    isServe: false,
    inPlay: true,
  };
}

/**
 * Execute legal underhand padel serve:
 * - Must be hit below the waist (y <= 1.05m) after one bounce on server's side behind service line
 * - Directed diagonally into receiver's service box
 */
export function executePadelServe(
  ball: BallState,
  servingSide: Side,
  targetBox: 'right' | 'left',
  power: number = 0.65
): BallState {
  const zSign = servingSide === 'south' ? -1 : 1;
  const targetX = targetBox === 'right' ? 2.2 : -2.2;
  const targetZ = 4.8 * zSign; // inside 6.95m service box

  const targetAim: Vector3D = { x: targetX, y: 0, z: targetZ };
  const struck = strikeBallWithRacket(
    ball,
    servingSide,
    'flat',
    power,
    targetAim,
    ball.position
  );

  return {
    ...struck,
    isServe: true,
    serveBoxTarget: targetBox,
  };
}
