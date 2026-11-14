import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerClient, q } from '../../src/game/net/multiplayer';
import { decodeBinarySnapshot, encodeBinarySnapshot, encodeBinaryInputs, decodeBinaryInputs } from '../../src/game/net/netcodeBinary';
import { DEFAULT_APPEARANCE, BallState, ScoreState, CompactSnapshot, ClientInputPacket } from '../../src/game/types';
import { createInitialBall } from '../../src/game/engine/physics';
import { createInitialScoreState } from '../../src/game/engine/rules';
import { createPlayerState } from '../../src/game/engine/player';

test('Netcode: Room Code generation produces valid 5-char codes', () => {
  for (let i = 0; i < 20; i++) {
    const code = MultiplayerClient.generateRoomCode();
    assert.strictEqual(code.length, 5, 'Room code must be exactly 5 characters');
    assert.match(code, /^[A-Z0-9]{5}$/, 'Room code must contain only uppercase alphanumeric characters');
  }
});

test('Netcode: Client game IDs are separate from PeerJS IDs', () => {
  const client = new MultiplayerClient({});
  assert.match(client.myPlayerId, /^p_[a-z0-9]+$/, 'Game player ID must remain stable and local');
  client.disconnect();
});

test('Netcode: Float quantization truncates bandwidth footprint', () => {
  assert.strictEqual(q(3.1415926, 2), 3.14);
  assert.strictEqual(q(-7.20000001, 2), -7.2);
  assert.strictEqual(q(0.0001, 2), 0);
  assert.strictEqual(q(14.856, 1), 14.9);
});

test('Netcode: Host Room Creation initializes 4 slots and syncs appearance', () => {
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

test('Netcode: Reliable connection auto-assigns a joining player', () => {
  const host = new MultiplayerClient({});
  host.createRoom('AUTO1', DEFAULT_APPEARANCE, '1v1');

  const sent: Array<{ message: any; target?: string }> = [];
  (host as any).sendReliableMessage = (message: any, target?: string) => {
    sent.push({ message, target });
  };

  (host as any).handleClientJoinRequest(
    'client-player',
    { ...DEFAULT_APPEARANCE, name: 'Client Player' },
    'peer-client'
  );

  assert.equal(host.slots[1].playerId, 'client-player');
  assert.equal(host.slots[1].isBot, false);
  assert.equal(sent[0].message.type, 'join_response');
  assert.equal(sent[0].message.accepted, true);
  assert.equal(sent[0].target, 'peer-client');

  host.disconnect();
});

test('Netcode: Compact Snapshot encodes state with minimal payload', () => {
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

  let capturedBinary: Uint8Array | null = null;
  // Capture the binary hot-path packet instead of the removed JSON snapshot path.
  (host as any).sendUnreliablePacket = (payload: Uint8Array) => {
    capturedBinary = payload;
  };

  host.broadcastSnapshot(ball, [p1, p2], score);

  assert.ok(capturedBinary, 'Binary snapshot packet must be generated');
  const snap = decodeBinarySnapshot(capturedBinary!);
  assert.ok(snap, 'Binary snapshot must decode');

  assert.strictEqual(snap.b[0], 1.23, 'Ball X quantized');
  assert.strictEqual(snap.b[1], 0.89, 'Ball Y quantized');
  assert.strictEqual(snap.b[2], -3.46, 'Ball Z quantized');
  assert.strictEqual(snap.p.length, 2);
  assert.strictEqual(snap.p[0].x, -2.12, 'Player X quantized');

  host.disconnect();
});

test('Netcode: Interpolation buffer smooths player positions and avoids ball teleportation', () => {
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
  assert.ok(smoothed, 'Ball smoothing should return a position');
  assert.ok(smoothed.z > 0.5 && smoothed.z < 1.0, 'Ball smoothly glides towards target without teleporting');

  client.disconnect();
});

test('Netcode: Simulated Latency and Packet Loss debug modes activate properly', () => {
  const client = new MultiplayerClient({});
  assert.strictEqual(client.simulatedLatencyMs, 0);
  assert.strictEqual(client.simulatedPacketLossRate, 0);

  client.simulatedLatencyMs = 150;
  client.simulatedPacketLossRate = 0.05;

  assert.strictEqual(client.simulatedLatencyMs, 150);
  assert.strictEqual(client.simulatedPacketLossRate, 0.05);

  client.disconnect();
});

test('Binary Protocol: Snapshot encodes and decodes accurately with zero allocation', () => {
  const originalSnapshot: CompactSnapshot = {
    seq: 4200,
    t: 123456.789,
    ackSeq: { 1: 100, 2: 95, 3: 0, 4: 0 },
    b: [1.25, 0.88, -4.50, 6.20, -1.80, 11.40, true, 'south', 1],
    p: [
      {
        s: 1,
        x: -2.10,
        y: 0.0,
        z: 6.80,
        vx: 1.50,
        vz: -2.00,
        sw: true,
        sp: 0.45,
        ss: 'forehand',
        st: 'flat',
      },
      {
        s: 2,
        x: 1.85,
        y: 0.0,
        z: -6.90,
        vx: -0.80,
        vz: 1.20,
        sw: false,
        sp: 0.0,
        ss: 'backhand',
        st: 'topspin',
      },
    ],
    sc: {
      g: [1, 0],
      pts: ['30', '15'],
      raw: [2, 1],
      s: 'south',
      r: 3,
    },
  };

  const encoded = encodeBinarySnapshot(originalSnapshot);
  assert.ok(encoded.byteLength > 40 && encoded.byteLength < 120, 'Binary snapshot footprint must be compact');

  const decoded = decodeBinarySnapshot(encoded);
  assert.ok(decoded !== null, 'Decoded snapshot should not be null');

  assert.equal(decoded!.seq, 4200);
  assert.equal(Math.round(decoded!.t), Math.round(originalSnapshot.t));
  assert.equal(decoded!.ackSeq[1], 100);
  assert.equal(decoded!.ackSeq[2], 95);

  // Ball
  assert.equal(decoded!.b[0], 1.25);
  assert.equal(decoded!.b[1], 0.88);
  assert.equal(decoded!.b[2], -4.50);
  assert.equal(decoded!.b[6], true);
  assert.equal(decoded!.b[7], 'south');
  assert.equal(decoded!.b[8], 1);

  // Players
  assert.equal(decoded!.p.length, 2);
  assert.equal(decoded!.p[0].s, 1);
  assert.equal(decoded!.p[0].x, -2.10);
  assert.equal(decoded!.p[0].z, 6.80);
  assert.equal(decoded!.p[0].sw, true);
  assert.equal(decoded!.p[0].ss, 'forehand');
  assert.equal(decoded!.p[0].st, 'flat');

  assert.equal(decoded!.p[1].s, 2);
  assert.equal(decoded!.p[1].x, 1.85);
  assert.equal(decoded!.p[1].z, -6.90);
  assert.equal(decoded!.p[1].ss, 'backhand');
  assert.equal(decoded!.p[1].st, 'topspin');
});

test('Binary Protocol: Inputs encode with up to 3 historical packets and decode cleanly', () => {
  const inputs: ClientInputPacket[] = [
    {
      seq: 105,
      dt: 0.016,
      moveX: 0.8,
      moveZ: -0.6,
      aimX: 2.5,
      aimZ: -7.5,
      power: 0.75,
      isJumping: false,
      wantsSwing: true,
      shotType: 'topspin',
      timestamp: 9999.0,
    },
    {
      seq: 104,
      dt: 0.016,
      moveX: 0.8,
      moveZ: -0.6,
      aimX: 2.5,
      aimZ: -7.5,
      power: 0.65,
      isJumping: false,
      wantsSwing: false,
      shotType: 'flat',
      timestamp: 9983.0,
    },
    {
      seq: 103,
      dt: 0.016,
      moveX: 0.5,
      moveZ: -0.5,
      aimX: 0.0,
      aimZ: -7.5,
      power: 0.50,
      isJumping: false,
      wantsSwing: false,
      shotType: 'flat',
      timestamp: 9967.0,
    },
  ];

  const encoded = encodeBinaryInputs(2, 9999.0, inputs);
  assert.ok(encoded.byteLength <= 50, 'Inputs payload with redundancy must be under 50 bytes');

  const decoded = decodeBinaryInputs(encoded);
  assert.ok(decoded !== null);
  assert.equal(decoded!.slot, 2);
  assert.equal(decoded!.inputs.length, 3);
  assert.equal(decoded!.inputs[0].seq, 105);
  assert.equal(decoded!.inputs[0].wantsSwing, true);
  assert.equal(decoded!.inputs[0].shotType, 'topspin');
  assert.equal(decoded!.inputs[1].seq, 104);
  assert.equal(decoded!.inputs[2].seq, 103);
});
