import { BallState, Side, Vector3D } from './types';
import { createInitialBall } from './physics';

export function createMatchBall(servingSide: Side, serverPosition?: Vector3D): BallState {
  return createInitialBall(servingSide, serverPosition);
}
