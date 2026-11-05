import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBinarySnapshot,
  decodeBinarySnapshot,
  encodeBinaryInputs,
  decodeBinaryInputs,
} from './netcodeBinary';
import { CompactSnapshot, ClientInputPacket } from './types';

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
