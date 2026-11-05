import {
  AimAssist,
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
    bouncesOnSide: { south: 0, north: 0 },
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
    let p1 = {
      x: p0.x + b.velocity.x * subDt,
      y: p0.y + b.velocity.y * subDt,
      z: p0.z + b.velocity.z * subDt,
    };

    // Lobs remain playable inside the court envelope. A high lob may rebound
    // off the glass, but must not escape above the back-wall height and become
    // an artificial point fault.
    if (b.lastShotType === 'lob' && p1.y > COURT_CONFIG.glassBackWallHeight - r) {
      p1 = { ...p1, y: COURT_CONFIG.glassBackWallHeight - r };
      b.velocity.y = -Math.abs(b.velocity.y) * 0.45;
    }

    // 2. Continuous Net Collision check at z = 0 (|x| <= 5.0)
    if ((p0.z > 0 && p1.z <= 0) || (p0.z < 0 && p1.z >= 0)) {
      // Net crossing: reset the receiving side's bounce count
      if (p0.z > 0 && p1.z <= 0) {
        b.bouncesOnSide.north = 0;
      } else {
        b.bouncesOnSide.south = 0;
      }

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
              // Fault against hitter who hit into net
              events.faultWinner = b.lastHitter === 'south' ? 'north' : 'south';
              events.faultReason = 'Ball hit the net!';
              events.shortReason = 'Net';
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
        const bounceSide: Side = zBounce > 0 ? 'south' : 'north';
        b.bouncedSide = bounceSide;
        b.bouncesOnSide[bounceSide] = (b.bouncesOnSide[bounceSide] || 0) + 1;

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
            events.faultWinner = b.lastHitter === 'south' ? 'north' : 'south';
            events.faultReason = 'Serve out of designated service box!';
            events.shortReason = 'Out';
          } else if (events.netTapeRolledOver) {
            // Net tape hit and landed in service box -> LET!
            events.isLetServe = true;
            events.pointFault = true;
            events.faultReason = 'Let serve! Ball hit net tape and landed in service box.';
            events.shortReason = 'Let';
          }
        }

        // DOUBLE BOUNCE RULE:
        // In padel, ball may bounce only once on a side before being returned!
        // If it bounces a 2nd time on a side without being hit by that side,
        // that side fails to return -> the OTHER team gets the point!
        if (b.bouncesOnSide[bounceSide] >= 2) {
          events.pointFault = true;
          events.faultWinner = bounceSide === 'south' ? 'north' : 'south';
          events.faultReason = `Double bounce on ${bounceSide === 'south' ? 'South' : 'North'} side!`;
          events.shortReason = 'Double bounce';
        }
      } else {
        events.outOfBounds = true;
        events.pointFault = true;
        // Ball landed out of court -> fault against last hitter
        events.faultWinner = b.lastHitter === 'south' ? 'north' : 'south';
        events.faultReason = 'Ball bounced out of court!';
        events.shortReason = 'Out';
      }
    } else {
      b.position.y = p1.y;
    }

    // Out of bounds check: ball flew beyond the court cage
    if (Math.abs(p1.x) > halfW + 0.5 || Math.abs(p1.z) > halfL + 0.5) {
      events.outOfBounds = true;
      events.pointFault = true;
      events.faultWinner = b.lastHitter === 'south' ? 'north' : 'south';
      events.faultReason = 'Ball hit out of court!';
      events.shortReason = 'Out';
      b.position.x = p1.x;
      b.position.z = p1.z;
    } else {
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
        events.faultWinner = b.lastHitter === 'south' ? 'north' : 'south';
        events.faultReason = 'Ball hit back glass without bouncing on court floor first!';
        events.shortReason = 'Wall first';
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
          events.faultWinner = b.lastHitter === 'south' ? 'north' : 'south';
          events.faultReason = 'Serve hit side wire mesh fence after bounce (Serve Fault)!';
          events.shortReason = 'Serve fault';
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
        events.faultWinner = b.lastHitter === 'south' ? 'north' : 'south';
        events.faultReason = 'Ball hit side wall without bouncing on court floor first!';
        events.shortReason = 'Wall first';
      }
    } else {
      b.position.x = p1.x;
    }
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
 * Strike ball with racket:
 * - Solves trajectory with aerodynamic drag compensation and 2-pass landing refinement
 * - Guarantees the ball lands and bounces precisely on the target spot marked by the reticle
 * - Ensures safe net clearance (>1.04m above floor) for all standard shots crossing the net
 * - Zero lateral spin (spinY = 0) to prevent unwanted sideways curve drift
 */
export function strikeBallWithRacket(
  ball: BallState,
  playerSide: Side,
  shotType: ShotType,
  power: number, // 0.2 to 1.0
  targetAim: Vector3D,
  playerPos: Vector3D,
  directionalBias?: { x: number; z: number },
  timingQuality: HitQuality = 'GOOD',
  aimAssist: AimAssist = 'high'
): BallState {
  let aimX = targetAim ? targetAim.x : 0;
  let aimZ = targetAim ? targetAim.z : (playerSide === 'south' ? -7.5 : 7.5);

  // If directional bias is provided without explicit targetAim coordinates
  if (directionalBias && (!targetAim || (targetAim.x === 0 && targetAim.z === 0))) {
    aimX += directionalBias.x;
    aimZ += directionalBias.z * (playerSide === 'south' ? -1 : 1);
  }

  // Timing quality minor deflection: subtle enough not to miss the intended zone
  if (aimAssist !== 'high') {
    if (timingQuality === 'EARLY') {
      aimX += (playerSide === 'south' ? -0.25 : 0.25);
    } else if (timingQuality === 'LATE') {
      aimX += (playerSide === 'south' ? 0.25 : -0.25);
      aimZ *= 0.94;
    }
  }

  // Legal court boundary clamps
  const clampX = aimAssist === 'high' ? 4.2 : 4.5;
  const clampZNear = 1.6;
  const clampZFar = aimAssist === 'high' ? 9.0 : 9.5;

  aimX = Math.max(-clampX, Math.min(clampX, aimX));
  if (playerSide === 'south') {
    aimZ = Math.max(-clampZFar, Math.min(-clampZNear, aimZ));
  } else {
    aimZ = Math.max(clampZNear, Math.min(clampZFar, aimZ));
  }

  const startX = ball.position.x;
  const startY = Math.max(0.15, ball.position.y);
  const startZ = ball.position.z;

  const dx = aimX - startX;
  const dz = aimZ - startZ;
  const dist = Math.hypot(dx, dz);

  const effectivePower = Math.min(1.0, power * (timingQuality === 'PERFECT' ? 1.15 : 1.0));

  // Determine base flight time and speed profile per shot type
  let spinX = 0;
  let flightTime = 0.8;

  switch (shotType) {
    case 'smash': {
      const smashSpeed = 19.0 + effectivePower * 4.5;
      flightTime = Math.max(0.35, dist / smashSpeed);
      spinX = 18;
      break;
    }
    case 'lob': {
      flightTime = 1.40 + (dist / 14.0) * 0.35;
      spinX = -12;
      break;
    }
    case 'drop': {
      const dropSpeed = 9.0 + effectivePower * 2.2;
      flightTime = Math.max(0.5, dist / dropSpeed);
      spinX = -18;
      break;
    }
    case 'bajada': {
      const bajadaSpeed = 16.0 + effectivePower * 3.5;
      flightTime = Math.max(0.4, dist / bajadaSpeed);
      spinX = 20;
      break;
    }
    case 'topspin': {
      const topSpeed = 14.0 + effectivePower * 3.0;
      flightTime = Math.max(0.45, dist / topSpeed);
      spinX = 22;
      break;
    }
    case 'slice': {
      const sliceSpeed = 13.5 + effectivePower * 2.5;
      flightTime = Math.max(0.45, dist / sliceSpeed);
      spinX = -20;
      break;
    }
    case 'flat':
    default: {
      const flatSpeed = 13.0 + effectivePower * 3.0;
      flightTime = Math.max(0.45, dist / flatSpeed);
      spinX = 4;
      break;
    }
  }

  // Vertical velocity vy to reach BALL_RADIUS (0.033) at t = flightTime
  const targetFloorY = BALL_RADIUS;
  let vy = (targetFloorY - startY + 0.5 * GRAVITY * flightTime * flightTime) / flightTime;

  // Safe Net Clearance: Net is at Z=0, height 0.92m
  const crossesNet = (startZ > 0 && aimZ < 0) || (startZ < 0 && aimZ > 0);
  if (crossesNet && dist > 0.5 && shotType !== 'smash') {
    const fracToNet = Math.abs(startZ) / (Math.abs(startZ) + Math.abs(aimZ));
    const tNet = flightTime * fracToNet;
    const estHeightAtNet = startY + vy * tNet - 0.5 * GRAVITY * tNet * tNet;
    const minNetHeight = 1.05; // 13cm clearance over 0.92m padel net
    if (estHeightAtNet < minNetHeight && tNet > 0.05) {
      vy = (minNetHeight - startY + 0.5 * GRAVITY * tNet * tNet) / tNet;
      // Recalculate flight time with new launch angle
      const discr = vy * vy + 2 * GRAVITY * (startY - targetFloorY);
      if (discr >= 0) {
        flightTime = (vy + Math.sqrt(discr)) / GRAVITY;
      }
    }
  }

  // Horizontal trajectory with air drag compensation
  const dirX = dist > 0.01 ? dx / dist : 0;
  const dirZ = dist > 0.01 ? dz / dist : (playerSide === 'south' ? -1 : 1);

  // Aerodynamic drag empirical compensation factor
  const dragFactor = 1.0 + 0.0075 * dist + 0.00015 * dist * dist;
  let vx = dirX * (dist / flightTime) * dragFactor;
  let vz = dirZ * (dist / flightTime) * dragFactor;

  // 2-Pass Precision Refinement using predictBallLanding
  const dummyBall: BallState = {
    ...ball,
    position: { x: startX, y: startY, z: startZ },
    velocity: { x: vx, y: vy, z: vz },
    spin: { x: spinX, y: 0, z: 0 },
    inPlay: true,
  };

  const pred1 = predictBallLanding(dummyBall);
  const errX1 = aimX - pred1.x;
  const errZ1 = aimZ - pred1.z;
  const errDist1 = Math.hypot(errX1, errZ1);

  if (errDist1 > 0.04 && pred1.timeToBounce > 0.1) {
    vx += errX1 / pred1.timeToBounce;
    vz += errZ1 / pred1.timeToBounce;
    dummyBall.velocity.x = vx;
    dummyBall.velocity.z = vz;

    const pred2 = predictBallLanding(dummyBall);
    const errX2 = aimX - pred2.x;
    const errZ2 = aimZ - pred2.z;
    if (Math.hypot(errX2, errZ2) > 0.04 && pred2.timeToBounce > 0.1) {
      vx += errX2 / pred2.timeToBounce;
      vz += errZ2 / pred2.timeToBounce;
    }
  }

  return {
    ...ball,
    velocity: { x: vx, y: vy, z: vz },
    spin: { x: spinX, y: 0, z: 0 }, // Clean in-line flight without sideways curve drift
    lastHitter: playerSide,
    bounceCount: 0,
    bouncesOnSide: { south: 0, north: 0 },
    bouncedInCourt: false,
    bouncedSide: null,
    hitWallBeforeFloor: false,
    wallHitCount: 0,
    lastWallType: null,
    isServe: false,
    lastShotType: shotType,
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
