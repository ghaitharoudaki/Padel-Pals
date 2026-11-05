import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MultiplayerClient,
  LobbySlot,
  CompactSnapshot,
  q,
} from './multiplayer';
import { DEFAULT_APPEARANCE, PlayerState, BallState, ScoreState } from './types';
import { createInitialBall } from './physics';
import { createInitialScoreState } from './rules';
import { createPlayerState } from './player';

test('Phase 6 - Netcode: Room Code generation produces valid 5-char codes', () => {
  for (let i = 0; i < 20; i++) {
    const code = MultiplayerClient.generateRoomCode();
    assert.strictEqual(code.length, 5, 'Room code must be exactly 5 characters');
    assert.match(code, /^[A-Z0-9]{5}$/, 'Room code must contain only uppercase alphanumeric characters');
  }
});

test('Phase 6 - Netcode: Float quantization truncates bandwidth footprint', () => {
  assert.strictEqual(q(3.1415926, 2), 3.14);
  assert.strictEqual(q(-7.20000001, 2), -7.2);
  assert.strictEqual(q(0.0001, 2), 0);
  assert.strictEqual(q(14.856, 1), 14.9);
});

test('Phase 6 - Netcode: Host Room Creation initializes 4 slots and syncs appearance', () => {
  const client = new MultiplayerClient({});
  client.createRoom('TEST5', DEFAULT_APPEARANCE);

  assert.strictEqual(client.currentRoomId, 'TEST5');
  assert.strictEqual(client.isHost, true);
  assert.strictEqual(client.mySlot, 1);
  assert.strictEqual(client.mySide, 'south');
  assert.strictEqual(client.slots.length, 4, 'Must have 4 slots in lobby');

  // Slot 1 is host
  assert.strictEqual(client.slots[0].isHost, true);
  assert.strictEqual(client.slots[0].team, 'blue');
  assert.strictEqual(client.slots[0].playerName, DEFAULT_APPEARANCE.name);

  // Other slots initialized as bots
  assert.strictEqual(client.slots[1].team, 'red');
  assert.strictEqual(client.slots[2].team, 'blue');
  assert.strictEqual(client.slots[3].team, 'red');

  client.disconnect();
});

test('Phase 6 - Netcode: Compact Snapshot encodes state with minimal payload', () => {
  const host = new MultiplayerClient({});
  host.createRoom('SNAP1', DEFAULT_APPEARANCE);

  const ball: BallState = createInitialBall('south');
  ball.position = { x: 1.2345, y: 0.8888, z: -3.4567 };
  ball.velocity = { x: 4.5678, y: -2.3456, z: 12.8765 };

  const p1 = createPlayerState({
    id: 'p1',
    slot: 1,
    name: 'P1',
    side: 'south',
    team: 'blue',
    zone: 'left',
    isBot: false,
    position: { x: -2.123, y: 0, z: 7.234 },
    customization: DEFAULT_APPEARANCE,
  });

  const p2 = createPlayerState({
    id: 'p2',
    slot: 2,
    name: 'P2',
    side: 'north',
    team: 'red',
    zone: 'left',
    isBot: true,
    position: { x: -2.0, y: 0, z: -7.2 },
    customization: DEFAULT_APPEARANCE,
  });

  const score: ScoreState = createInitialScoreState('south', '1_set', false);

  let capturedMsg: any = null;
  // Monkey-patch sendTransportMessage to capture snapshot
  (host as any).sendTransportMessage = (msg: any) => {
    capturedMsg = msg;
  };

  host.broadcastSnapshot(ball, [p1, p2], score);

  assert.ok(capturedMsg, 'Snapshot message must be generated');
  assert.strictEqual(capturedMsg.type, 'world_snapshot');
  const snap: CompactSnapshot = capturedMsg.snapshot;

  assert.strictEqual(snap.b[0], 1.23, 'Ball X quantized');
  assert.strictEqual(snap.b[1], 0.89, 'Ball Y quantized');
  assert.strictEqual(snap.b[2], -3.46, 'Ball Z quantized');
  assert.strictEqual(snap.p.length, 2);
  assert.strictEqual(snap.p[0].x, -2.12, 'Player X quantized');

  host.disconnect();
});

test('Phase 6 - Netcode: Interpolation buffer smooths player positions and avoids ball teleportation', () => {
  const client = new MultiplayerClient({});
  const now = Date.now();

  const snap1: CompactSnapshot = {
    seq: 1,
    t: now - 150,
    ackSeq: {},
    b: [0, 1.0, 0, 0, 0, 10, true, 'south', 0],
    p: [
      { s: 2, x: 0, y: 0, z: -7.0, vx: 2, vz: 0, sw: false, sp: 0, ss: 'forehand', st: 'flat' },
    ],
    sc: { g: [0, 0], pts: ['0', '0'], raw: [0, 0], s: 'south', r: 0 },
  };

  const snap2: CompactSnapshot = {
    seq: 2,
    t: now - 50,
    ackSeq: {},
    b: [0, 1.0, 1.0, 0, 0, 10, true, 'south', 0],
    p: [
      { s: 2, x: 1.0, y: 0, z: -7.0, vx: 2, vz: 0, sw: false, sp: 0, ss: 'forehand', st: 'flat' },
    ],
    sc: { g: [0, 0], pts: ['0', '0'], raw: [0, 0], s: 'south', r: 0 },
  };

  (client as any).addSnapshotToBuffer(snap1);
  (client as any).addSnapshotToBuffer(snap2);

  // Player interpolation at renderTime = now - 90ms
  const interp = client.getInterpolatedPlayer(2);
  assert.ok(interp, 'Interpolated remote player must exist');
  assert.ok(interp.x >= 0 && interp.x <= 1.0, `X should be smoothly interpolated between 0 and 1.0, got ${interp.x}`);

  // Ball smoothing check: never snaps instantly to new target
  const currentBall = { x: 0, y: 1.0, z: 0.5 };
  const smoothed = client.getSmoothedBall(currentBall, 0.016);
  assert.ok(smoothed.z > 0.5 && smoothed.z < 1.0, 'Ball smoothly glides towards target without teleporting');

  client.disconnect();
});

test('Phase 6 - Netcode: Simulated Latency and Packet Loss debug modes activate properly', () => {
  const client = new MultiplayerClient({});
  assert.strictEqual(client.simulatedLatencyMs, 0);
  assert.strictEqual(client.simulatedPacketLossRate, 0);

  client.simulatedLatencyMs = 150;
  client.simulatedPacketLossRate = 0.05;

  assert.strictEqual(client.simulatedLatencyMs, 150);
  assert.strictEqual(client.simulatedPacketLossRate, 0.05);

  client.disconnect();
});
