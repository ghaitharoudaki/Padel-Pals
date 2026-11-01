import { BallState, Side, Vector3D } from './types';
import { createInitialBall, predictBallLanding } from './physics';

export function createMatchBall(servingSide: Side, serverPosition?: Vector3D): BallState {
  return createInitialBall(servingSide, serverPosition);
}

/**
 * Drop ball on server's half to execute legal underhand serve bounce
 */
export function dropServeBall(servingSide: Side, serverPosition: Vector3D): BallState {
  const zOffset = servingSide === 'south' ? -0.4 : 0.4;
  return {
    ...createInitialBall(servingSide, serverPosition),
    position: {
      x: serverPosition.x + (servingSide === 'south' ? 0.35 : -0.35),
      y: 0.95, // dropped from waist
      z: serverPosition.z + zOffset,
    },
    velocity: { x: 0, y: -0.8, z: 0 },
    inPlay: true,
    isServe: true,
  };
}

/**
 * Check if the ball is currently in a wall-return / bajada window
 * (ball rebounded off back glass and is dropping in front of player)
 */
export function isBajadaWindow(ball: BallState, playerPos: Vector3D, playerSide: Side): boolean {
  if (!ball.inPlay || ball.wallHitCount === 0 || ball.lastWallType !== 'glass') {
    return false;
  }
  const isSouth = playerSide === 'south';
  const movingTowardFront = isSouth ? ball.velocity.z < -0.5 : ball.velocity.z > 0.5;
  const inFrontOfPlayer = isSouth
    ? ball.position.z < playerPos.z + 0.8 && ball.position.z > playerPos.z - 2.0
    : ball.position.z > playerPos.z - 0.8 && ball.position.z < playerPos.z + 2.0;
  const reachableHeight = ball.position.y >= 0.8 && ball.position.y <= 2.2;

  return movingTowardFront && inFrontOfPlayer && reachableHeight;
}
