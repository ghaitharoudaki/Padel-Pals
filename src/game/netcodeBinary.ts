import type {
  BallState,
  CompactPlayerSnapshot,
  CompactSnapshot,
  ClientInputPacket,
  ShotType,
  Side,
  SwingSide,
} from './types';

// Magic headers for binary packet validation
export const BINARY_SNAPSHOT_MAGIC = 0x5053; // 'PS' (Padel Snapshot)
export const BINARY_INPUT_MAGIC = 0x5049;    // 'PI' (Padel Input)

const SHOT_TYPES: ShotType[] = ['flat', 'topspin', 'slice', 'lob', 'drop', 'smash', 'bajada'];
const SWING_SIDES: SwingSide[] = ['forehand', 'backhand', 'overhead', 'serve'];

/**
 * Pre-allocated reusable buffer & view for host snapshot broadcast (zero-GC hot path)
 */
const hostSnapshotBuffer = new ArrayBuffer(256);
const hostSnapshotView = new DataView(hostSnapshotBuffer);
const hostSnapshotBytes = new Uint8Array(hostSnapshotBuffer);

/**
 * Pre-allocated reusable buffer & view for client input send (zero-GC hot path)
 */
const clientInputBuffer = new ArrayBuffer(128);
const clientInputView = new DataView(clientInputBuffer);
const clientInputBytes = new Uint8Array(clientInputBuffer);

/**
 * Encode authoritative match snapshot into a binary Uint8Array slice
 */
export function encodeBinarySnapshot(snapshot: CompactSnapshot): Uint8Array {
  const v = hostSnapshotView;
  let o = 0;

  // Header
  v.setUint16(o, BINARY_SNAPSHOT_MAGIC, true); o += 2;
  v.setUint32(o, snapshot.seq, true); o += 4;
  v.setFloat64(o, snapshot.t, true); o += 8;

  // Acknowledged sequences for slots 1..4
  v.setUint16(o, snapshot.ackSeq[1] || 0, true); o += 2;
  v.setUint16(o, snapshot.ackSeq[2] || 0, true); o += 2;
  v.setUint16(o, snapshot.ackSeq[3] || 0, true); o += 2;
  v.setUint16(o, snapshot.ackSeq[4] || 0, true); o += 2;

  // Ball state (quantized to centimeters and cm/s)
  const b = snapshot.b;
  v.setInt16(o, Math.round(b[0] * 100), true); o += 2; // x
  v.setInt16(o, Math.round(b[1] * 100), true); o += 2; // y
  v.setInt16(o, Math.round(b[2] * 100), true); o += 2; // z
  v.setInt16(o, Math.round(b[3] * 100), true); o += 2; // vx
  v.setInt16(o, Math.round(b[4] * 100), true); o += 2; // vy
  v.setInt16(o, Math.round(b[5] * 100), true); o += 2; // vz

  const inPlayBit = b[6] ? 1 : 0;
  const lastHitterBits = b[7] === 'south' ? 1 : b[7] === 'north' ? 2 : 0;
  const bounceBits = Math.min(7, b[8]);
  const ballFlags = inPlayBit | (lastHitterBits << 1) | (bounceBits << 3);
  v.setUint8(o, ballFlags); o += 1;

  // Score state
  const sc = snapshot.sc;
  v.setUint8(o, sc.g[0]); o += 1;
  v.setUint8(o, sc.g[1]); o += 1;
  v.setUint8(o, sc.raw[0]); o += 1;
  v.setUint8(o, sc.raw[1]); o += 1;
  v.setUint8(o, sc.s === 'south' ? 1 : 2); o += 1;
  v.setUint8(o, Math.min(255, sc.r)); o += 1;

  // Players
  const pList = snapshot.p;
  v.setUint8(o, pList.length); o += 1;

  for (let i = 0; i < pList.length; i++) {
    const p = pList[i];
    v.setUint8(o, p.s); o += 1;
    v.setInt16(o, Math.round(p.x * 100), true); o += 2;
    v.setInt16(o, Math.round(p.y * 100), true); o += 2;
    v.setInt16(o, Math.round(p.z * 100), true); o += 2;
    v.setInt16(o, Math.round(p.vx * 100), true); o += 2;
    v.setInt16(o, Math.round(p.vz * 100), true); o += 2;

    const spByte = Math.min(255, Math.round(p.sp * 255));
    v.setUint8(o, spByte); o += 1;

    const swBit = p.sw ? 1 : 0;
    const ssIndex = Math.max(0, SWING_SIDES.indexOf(p.ss));
    const stIndex = Math.max(0, SHOT_TYPES.indexOf(p.st));
    const pFlags = swBit | (ssIndex << 1) | (stIndex << 3);
    v.setUint8(o, pFlags); o += 1;
  }

  // Return a subarray view of the encoded bytes (zero allocations)
  return hostSnapshotBytes.subarray(0, o);
}

/**
 * Decode binary snapshot payload from ArrayBuffer / Uint8Array
 */
export function decodeBinarySnapshot(input: ArrayBuffer | Uint8Array): CompactSnapshot | null {
  const v =
    input instanceof Uint8Array
      ? new DataView(input.buffer, input.byteOffset, input.byteLength)
      : new DataView(input);

  if (v.byteLength < 42) return null;

  let o = 0;
  const magic = v.getUint16(o, true); o += 2;
  if (magic !== BINARY_SNAPSHOT_MAGIC) return null;

  const seq = v.getUint32(o, true); o += 4;
  const t = v.getFloat64(o, true); o += 8;

  const ackSeq: Record<number, number> = {
    1: v.getUint16(o, true),
    2: v.getUint16(o + 2, true),
    3: v.getUint16(o + 4, true),
    4: v.getUint16(o + 6, true),
  };
  o += 8;

  // Ball
  const bx = v.getInt16(o, true) / 100; o += 2;
  const by = v.getInt16(o, true) / 100; o += 2;
  const bz = v.getInt16(o, true) / 100; o += 2;
  const bvx = v.getInt16(o, true) / 100; o += 2;
  const bvy = v.getInt16(o, true) / 100; o += 2;
  const bvz = v.getInt16(o, true) / 100; o += 2;

  const ballFlags = v.getUint8(o); o += 1;
  const inPlay = (ballFlags & 1) !== 0;
  const lastHitterCode = (ballFlags >> 1) & 3;
  const lastHitter: Side | null = lastHitterCode === 1 ? 'south' : lastHitterCode === 2 ? 'north' : null;
  const bounceCount = (ballFlags >> 3) & 7;

  // Score
  const g0 = v.getUint8(o); o += 1;
  const g1 = v.getUint8(o); o += 1;
  const raw0 = v.getUint8(o); o += 1;
  const raw1 = v.getUint8(o); o += 1;
  const servingSide: Side = v.getUint8(o) === 1 ? 'south' : 'north'; o += 1;
  const rallyCount = v.getUint8(o); o += 1;

  // Player count
  const pCount = v.getUint8(o); o += 1;
  const players: CompactPlayerSnapshot[] = [];

  for (let i = 0; i < pCount; i++) {
    const slot = v.getUint8(o) as 1 | 2 | 3 | 4; o += 1;
    const px = v.getInt16(o, true) / 100; o += 2;
    const py = v.getInt16(o, true) / 100; o += 2;
    const pz = v.getInt16(o, true) / 100; o += 2;
    const pvx = v.getInt16(o, true) / 100; o += 2;
    const pvz = v.getInt16(o, true) / 100; o += 2;
    const sp = v.getUint8(o) / 255; o += 1;

    const pFlags = v.getUint8(o); o += 1;
    const sw = (pFlags & 1) !== 0;
    const ssIndex = (pFlags >> 1) & 3;
    const stIndex = (pFlags >> 3) & 15;

    players.push({
      s: slot,
      x: px,
      y: py,
      z: pz,
      vx: pvx,
      vz: pvz,
      sw,
      sp,
      ss: SWING_SIDES[ssIndex] || 'forehand',
      st: SHOT_TYPES[stIndex] || 'flat',
    });
  }

  // Derive tennis point display labels
  const ptsLabels: [string, string] = [
    raw0 === 0 ? '0' : raw0 === 1 ? '15' : raw0 === 2 ? '30' : raw0 === 3 ? '40' : 'AD',
    raw1 === 0 ? '0' : raw1 === 1 ? '15' : raw1 === 2 ? '30' : raw1 === 3 ? '40' : 'AD',
  ];

  return {
    seq,
    t,
    ackSeq,
    b: [bx, by, bz, bvx, bvy, bvz, inPlay, lastHitter, bounceCount],
    p: players,
    sc: {
      g: [g0, g1],
      pts: ptsLabels,
      raw: [raw0, raw1],
      s: servingSide,
      r: rallyCount,
    },
  };
}

/**
 * Encode client inputs (current + up to 2 historical inputs) into binary slice
 */
export function encodeBinaryInputs(
  slot: 1 | 2 | 3 | 4,
  clientTime: number,
  inputs: ClientInputPacket[]
): Uint8Array {
  const v = clientInputView;
  let o = 0;

  v.setUint16(o, BINARY_INPUT_MAGIC, true); o += 2;
  v.setUint8(o, slot); o += 1;
  v.setFloat64(o, clientTime, true); o += 8;

  const count = Math.min(3, inputs.length);
  v.setUint8(o, count); o += 1;

  for (let i = 0; i < count; i++) {
    const inp = inputs[i];
    v.setUint16(o, inp.seq, true); o += 2;
    v.setUint8(o, Math.min(255, Math.round(inp.dt * 1000))); o += 1; // ms

    const mx = Math.max(-127, Math.min(127, Math.round(inp.moveX * 127)));
    const mz = Math.max(-127, Math.min(127, Math.round(inp.moveZ * 127)));
    v.setInt8(o, mx); o += 1;
    v.setInt8(o, mz); o += 1;

    v.setInt16(o, Math.round(inp.aimX * 100), true); o += 2;
    v.setInt16(o, Math.round(inp.aimZ * 100), true); o += 2;

    const pwr = Math.min(255, Math.round(inp.power * 255));
    v.setUint8(o, pwr); o += 1;

    const jBit = inp.isJumping ? 1 : 0;
    const wBit = inp.wantsSwing ? 1 : 0;
    const stIndex = Math.max(0, SHOT_TYPES.indexOf(inp.shotType));
    const flags = jBit | (wBit << 1) | (stIndex << 2);
    v.setUint8(o, flags); o += 1;
  }

  return clientInputBytes.subarray(0, o);
}

/**
 * Decode binary client input payload from ArrayBuffer / Uint8Array
 */
export function decodeBinaryInputs(
  input: ArrayBuffer | Uint8Array
): { slot: 1 | 2 | 3 | 4; clientTime: number; inputs: ClientInputPacket[] } | null {
  const v =
    input instanceof Uint8Array
      ? new DataView(input.buffer, input.byteOffset, input.byteLength)
      : new DataView(input);

  if (v.byteLength < 12) return null;

  let o = 0;
  const magic = v.getUint16(o, true); o += 2;
  if (magic !== BINARY_INPUT_MAGIC) return null;

  const slot = v.getUint8(o) as 1 | 2 | 3 | 4; o += 1;
  const clientTime = v.getFloat64(o, true); o += 8;
  const count = v.getUint8(o); o += 1;

  const inputs: ClientInputPacket[] = [];
  for (let i = 0; i < count; i++) {
    if (o + 11 > v.byteLength) break;
    const seq = v.getUint16(o, true); o += 2;
    const dt = v.getUint8(o) / 1000; o += 1;
    const moveX = v.getInt8(o) / 127; o += 1;
    const moveZ = v.getInt8(o) / 127; o += 1;
    const aimX = v.getInt16(o, true) / 100; o += 2;
    const aimZ = v.getInt16(o, true) / 100; o += 2;
    const power = v.getUint8(o) / 255; o += 1;

    const flags = v.getUint8(o); o += 1;
    const isJumping = (flags & 1) !== 0;
    const wantsSwing = (flags & 2) !== 0;
    const stIndex = (flags >> 2) & 15;

    inputs.push({
      seq,
      dt,
      moveX,
      moveZ,
      aimX,
      aimZ,
      power,
      isJumping,
      wantsSwing,
      shotType: SHOT_TYPES[stIndex] || 'flat',
      timestamp: clientTime,
    });
  }

  return { slot, clientTime, inputs };
}
