import { BallState, PlayerState, ScoreState, Side } from '../types';
import { createInitialBall } from './physics';
import { setPlayerPosition } from './player';
import { getServePosition, getServeTargetBox } from './rules';

export interface RosterRefs {
  p1: PlayerState;
  p2: PlayerState;
  p3: PlayerState;
  p4: PlayerState;
}

/**
 * Place every player for the next serve and return the fresh (dead) ball.
 * Deterministic from the score, so host and online clients arrive at the same layout:
 * - the server (slot 1 or 2) stands diagonally opposite the target service box,
 * - in doubles the serving pair swaps lanes when needed and the partner waits at the net,
 * - the receiver lines up behind the target box, their partner a step closer.
 */
export function arrangeServe(roster: RosterRefs, state: ScoreState, isDoubles: boolean): BallState {
  const { p1, p2, p3, p4 } = roster;
  const box = getServeTargetBox(state);
  const serverX = getServePosition(box, isDoubles);
  const receiverX = box === 'right' ? (isDoubles ? 2.2 : 1.4) : isDoubles ? -2.2 : -1.4;
  const servingSouth = state.servingSide === 'south';
  const server = servingSouth ? p1 : p2;
  const serverPartner = servingSouth ? p3 : p4;
  const receivingPair = servingSouth ? [p2, p4] : [p1, p3];
  const sign = (side: Side) => (side === 'south' ? 1 : -1);

  setPlayerPosition(server, { x: serverX, y: 0, z: 8.0 * sign(server.side) });

  if (isDoubles) {
    server.zone = serverX > 0 ? 'right' : 'left';
    serverPartner.zone = serverX > 0 ? 'left' : 'right';
    setPlayerPosition(serverPartner, { x: -serverX * 1.05, y: 0, z: 4.2 * sign(serverPartner.side) });

    const receiverZone = receiverX > 0 ? 'right' : 'left';
    const receiver = receivingPair.find((p) => p.zone === receiverZone) || receivingPair[0];
    const receiverPartner = receivingPair.find((p) => p !== receiver) || receivingPair[1];
    setPlayerPosition(receiver, { x: receiverX, y: 0, z: 8.2 * sign(receiver.side) });
    setPlayerPosition(receiverPartner, { x: -receiverX, y: 0, z: 6.2 * sign(receiverPartner.side) });
  } else {
    const receiver = receivingPair[0];
    setPlayerPosition(receiver, { x: receiverX, y: 0, z: 8.2 * sign(receiver.side) });
    // Off-court singles partners stay parked out of the way.
    setPlayerPosition(p3, { x: 2.0, y: 0, z: 7.2 });
    setPlayerPosition(p4, { x: 2.0, y: 0, z: -7.2 });
  }

  p1.isServing = servingSouth;
  p2.isServing = !servingSouth;
  p3.isServing = false;
  p4.isServing = false;
  [p1, p2, p3, p4].forEach((p) => {
    p.isSwinging = false;
    p.racketSwingProgress = 0;
  });

  return createInitialBall(state.servingSide, server.position);
}
