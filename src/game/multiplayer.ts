import Peer, { DataConnection } from 'peerjs';
import type {
  BallState,
  CompactPlayerSnapshot,
  CompactSnapshot,
  ClientInputPacket,
  Difficulty,
  MatchLength,
  PlayerAppearance,
  PlayerState,
  RoomConfig,
  ScoreState,
  ShotType,
  Side,
  SwingSide,
  Vector3D,
} from './types';
import {
  encodeBinarySnapshot,
  decodeBinarySnapshot,
  encodeBinaryInputs,
  decodeBinaryInputs,
  BINARY_SNAPSHOT_MAGIC,
  BINARY_INPUT_MAGIC,
} from './netcodeBinary';

export interface LobbySlot {
  slot: 1 | 2 | 3 | 4;
  side: Side;
  team: 'blue' | 'red';
  zone: 'left' | 'right';
  playerId: string | null;
  playerName: string;
  appearance: PlayerAppearance;
  isBot: boolean;
  isReady: boolean;
  isHost: boolean;
  ping: number;
}

export type { CompactPlayerSnapshot, CompactSnapshot, ClientInputPacket };

export interface MultiplayerCallbacks {
  onLobbyUpdated?: (
    slots: LobbySlot[],
    isHost: boolean,
    mySlot: 1 | 2 | 3 | 4,
    config: RoomConfig
  ) => void;
  onMatchStarted?: (config: RoomConfig, slots: LobbySlot[], servingSide: Side, seed: number) => void;
  onSnapshotReceived?: (snapshot: CompactSnapshot) => void;
  onClientInputReceived?: (playerId: string, slot: 1 | 2 | 3 | 4, input: ClientInputPacket) => void;
  onPointScoredReceived?: (winner: Side, scoreState: ScoreState) => void;
  onHostDisconnected?: () => void;
  onPingUpdated?: (pingMs: number) => void;
  onConnectionStatusChanged?: (
    status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected',
    error?: string
  ) => void;
  onStatsUpdated?: (stats: { snapshotRateHz: number; packetLossPercent: number }) => void;
}

// Helper to quantize floats to save bandwidth
export function q(num: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Generate a clean 5-character alphanumeric room code (avoiding ambiguous characters like 0/O, 1/I)
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Host-Authoritative Netcode Client for Padel Pals.
 * Dual-channel WebRTC (Reliable + Unreliable) with binary DataView serialization
 * and instant BroadcastChannel multi-tab support for Google AI Studio sandbox.
 */
export class MultiplayerClient {
  public callbacks: MultiplayerCallbacks = {};
  public currentRoomId: string | null = null;
  public myPlayerId: string;
  public mySlot: 1 | 2 | 3 | 4 = 1;
  public mySide: Side = 'south';
  public isHost: boolean = false;
  public isConnected: boolean = false;
  public isInMatch: boolean = false;
  public pingMs: number = 0;

  // Single source of truth room configuration
  public roomConfig: RoomConfig = {
    mode: '2v2',
    matchLength: '1_set',
    difficulty: 'pro',
    onClientLeave: 'replace_with_bot',
    goldenPoint: false,
  };

  // Lobby slots state
  public slots: LobbySlot[] = [];

  // Debug options for netcode testing
  public simulatedLatencyMs: number = 0;
  public simulatedPacketLossRate: number = 0;

  // Networking transports
  private broadcastChannel: BroadcastChannel | null = null;
  private peer: Peer | null = null;
  private reliableConnections: Map<string, DataConnection> = new Map();
  private unreliableConnections: Map<string, DataConnection> = new Map();
  private connectionPlayerIds: Map<string, string> = new Map();
  private joinRequestIds: Set<string> = new Set();
  private hostReliableConn: DataConnection | null = null;
  private hostUnreliableConn: DataConnection | null = null;

  // Heartbeat & watchdog
  private heartbeatInterval: any = null;
  private watchdogInterval: any = null;
  private joinTimeoutTimer: any = null;
  private lastPacketReceivedTime: number = Date.now();

  // Clock Synchronization (5-sample median offset)
  private clockOffsets: number[] = [];
  private medianClockOffset: number = 0;

  // Input & snapshot sequence tracking
  private snapshotSeq: number = 0;
  private inputSeq: number = 0;
  private ackedInputSeq: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  private inputHistory: ClientInputPacket[] = [];

  // Adaptive Snapshot Interpolation Buffer (~60ms to ~160ms)
  private snapshotBuffer: CompactSnapshot[] = [];
  private adaptiveBufferDelayMs: number = 90;

  // Metrics tracking (for F4 overlay)
  private snapshotsReceivedLastSecond: number = 0;
  private lastRateCheckTime: number = performance.now();
  public currentSnapshotRateHz: number = 0;
  public currentPacketLossPercent: number = 0;
  private expectedSnapSeq: number = 0;
  private lostSnapCount: number = 0;
  private totalSnapCount: number = 0;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
    this.myPlayerId = 'p_' + Math.random().toString(36).substring(2, 8);
  }

  public static generateRoomCode(): string {
    return generateRoomCode();
  }

  /**
   * Initialize lobby slots based on mode (1v1: 2 slots, 2v2: 4 slots)
   */
  private createInitialSlots(hostAppearance: PlayerAppearance, mode: '1v1' | '2v2'): LobbySlot[] {
    const is1v1 = mode === '1v1';
    const s1: LobbySlot = {
      slot: 1,
      side: 'south',
      team: 'blue',
      zone: 'left',
      playerId: this.isHost ? this.myPlayerId : null,
      playerName: hostAppearance.name || 'Player 1',
      appearance: { ...hostAppearance },
      isBot: false,
      isReady: true,
      isHost: true,
      ping: 0,
    };

    const s2: LobbySlot = {
      slot: 2,
      side: 'north',
      team: 'red',
      zone: is1v1 ? 'left' : 'left',
      playerId: null,
      playerName: 'Alejandro (Bot)',
      appearance: {
        ...hostAppearance,
        name: 'Alejandro',
        number: 5,
        jerseyPrimary: '#dc2626',
        jerseySecondary: '#18181b',
        shortsColor: '#dc2626',
        hairColor: '#d4af37',
      },
      isBot: true,
      isReady: true,
      isHost: false,
      ping: 0,
    };

    if (is1v1) {
      return [s1, s2];
    }

    const s3: LobbySlot = {
      slot: 3,
      side: 'south',
      team: 'blue',
      zone: 'right',
      playerId: null,
      playerName: 'Carlos (Bot)',
      appearance: {
        ...hostAppearance,
        name: 'Carlos',
        number: 4,
        jerseyPrimary: '#2563eb',
        jerseySecondary: '#ffffff',
        shortsColor: '#ffffff',
        hairColor: '#451a03',
      },
      isBot: true,
      isReady: true,
      isHost: false,
      ping: 0,
    };

    const s4: LobbySlot = {
      slot: 4,
      side: 'north',
      team: 'red',
      zone: 'right',
      playerId: null,
      playerName: 'Mateo (Bot)',
      appearance: {
        ...hostAppearance,
        name: 'Mateo',
        number: 10,
        jerseyPrimary: '#ef4444',
        jerseySecondary: '#18181b',
        shortsColor: '#18181b',
        hairColor: '#18181b',
      },
      isBot: true,
      isReady: true,
      isHost: false,
      ping: 0,
    };

    return [s1, s2, s3, s4];
  }

  /**
   * Set or update RoomConfig from host
   */
  public updateRoomConfig(partial: Partial<RoomConfig>) {
    if (!this.isHost) return;
    const oldMode = this.roomConfig.mode;
    this.roomConfig = { ...this.roomConfig, ...partial };

    // If mode changed (e.g. 1v1 <-> 2v2), adapt lobby slots
    if (partial.mode && partial.mode !== oldMode) {
      const hostSlot = this.slots.find((s) => s.isHost) || this.slots[0];
      const hostApp = hostSlot?.appearance || { name: 'Player 1' } as PlayerAppearance;
      this.slots = this.createInitialSlots(hostApp, partial.mode);
    }

    this.broadcastLobbyState();
  }

  /**
   * Host creates a new room with a clean 5-character code
   */
  public createRoom(roomCode: string, appearance: PlayerAppearance, mode: '1v1' | '2v2' = '2v2') {
    this.disconnect();
    this.currentRoomId = roomCode.toUpperCase().trim();
    this.isHost = true;
    this.isInMatch = false;
    this.mySlot = 1;
    this.mySide = 'south';
    this.roomConfig.mode = mode;
    this.slots = this.createInitialSlots(appearance, mode);

    this.callbacks.onConnectionStatusChanged?.('connecting');
    this.initTransports(true, this.currentRoomId, appearance);
  }

  /**
   * Client joins an existing room by code
   */
  public joinRoom(roomCode: string, appearance: PlayerAppearance) {
    this.disconnect();
    const cleanCode = roomCode.toUpperCase().trim();
    if (cleanCode.length < 4 || cleanCode.length > 8) {
      this.callbacks.onConnectionStatusChanged?.(
        'disconnected',
        'Invalid room code length (5 characters required)'
      );
      return;
    }

    this.currentRoomId = cleanCode;
    this.isHost = false;
    this.isInMatch = false;
    this.callbacks.onConnectionStatusChanged?.('connecting');

    // 6-second timeout watchdog for invalid room code or network blocks
    this.joinTimeoutTimer = setTimeout(() => {
      if (!this.isConnected) {
        this.callbacks.onConnectionStatusChanged?.(
          'disconnected',
          `Could not connect to room "${cleanCode}". The room code may be incorrect or peer-to-peer is blocked by the network.`
        );
      }
    }, 6000);

    this.initTransports(false, this.currentRoomId, appearance);
  }

  /**
   * Initialize dual-channel WebRTC connections and BroadcastChannel
   */
  private initTransports(asHost: boolean, roomId: string, appearance: PlayerAppearance) {
    // 1. BroadcastChannel (Instant local multi-tab sandbox connectivity)
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel(`padel_pals_net_${roomId}`);
        this.broadcastChannel.onmessage = (event) => {
          this.handleIncomingRawMessage(event.data);
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel fallback unavailable:', e);
    }

    // 2. WebRTC PeerJS with dual data channels (Reliable + Unreliable)
    try {
      const PeerCtor = (Peer as any)?.default || (Peer as any)?.Peer || Peer;
      const hasWebRTC =
        typeof window !== 'undefined' &&
        (typeof (window as any).RTCPeerConnection !== 'undefined' ||
          typeof (window as any).webkitRTCPeerConnection !== 'undefined');

      if (typeof PeerCtor === 'function' && hasWebRTC) {
        const peerId = asHost
          ? `padelpals-${roomId.toLowerCase()}`
          : `padelpals-${roomId.toLowerCase()}-${this.myPlayerId}`;

        const peer = new PeerCtor(peerId, {
          debug: 0,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
            ],
          },
        });
        this.peer = peer;

        peer.on('open', () => {
          this.isConnected = true;
          if (this.joinTimeoutTimer) clearTimeout(this.joinTimeoutTimer);
          this.callbacks.onConnectionStatusChanged?.('connected');

          if (asHost) {
            this.broadcastLobbyState();
          } else {
            // Client connects two data channels to the host:
            // 1. Reliable ordered channel for lobby and match events
            const hostPeerId = `padelpals-${roomId.toLowerCase()}`;
            const relConn = peer.connect(hostPeerId, { reliable: true, label: 'reliable' });
            this.setupConnection(relConn, appearance, true);
            this.hostReliableConn = relConn;

            // 2. Unreliable unordered channel for high-frequency binary inputs and snapshots
            const unrelConn = peer.connect(hostPeerId, {
              reliable: false,
              ordered: false,
              label: 'unreliable',
            });
            this.setupConnection(unrelConn, appearance, false);
            this.hostUnreliableConn = unrelConn;

            // Send join request
            this.sendReliableMessage({
              type: 'request_join',
              playerId: this.myPlayerId,
              appearance,
            });
          }
        });

        peer.on('connection', (conn: DataConnection) => {
          const isRel = conn.label !== 'unreliable';
          this.setupConnection(conn, appearance, isRel);
        });

        peer.on('error', (err: any) => {
          if (asHost && err.type === 'unavailable-id') {
            this.isConnected = false;
            this.callbacks.onConnectionStatusChanged?.(
              'disconnected',
              `Room code "${roomId}" is already in use. Choose a new room code.`
            );
            try {
              peer.destroy();
            } catch {}
            return;
          }
          if (err.type === 'peer-unavailable') {
            this.callbacks.onConnectionStatusChanged?.(
              'disconnected',
              `Room "${roomId}" not found. Verify the room code.`
            );
          }
        });
      }
    } catch (e) {
      console.warn('PeerJS initialization skipped:', e);
    }

    if (asHost) {
      this.isConnected = true;
      this.callbacks.onConnectionStatusChanged?.('connected');
      this.callbacks.onLobbyUpdated?.(this.slots, true, 1, this.roomConfig);
    } else {
      setTimeout(() => {
        this.sendReliableMessage({
          type: 'request_join',
          playerId: this.myPlayerId,
          appearance,
        });
      }, 50);
    }

    this.startHeartbeat();
  }

  private setupConnection(conn: DataConnection, appearance: PlayerAppearance, isReliable: boolean) {
    conn.on('open', () => {
      this.isConnected = true;
      if (this.joinTimeoutTimer) clearTimeout(this.joinTimeoutTimer);
      this.callbacks.onConnectionStatusChanged?.('connected');

      if (isReliable) {
        this.reliableConnections.set(conn.peer, conn);
      } else {
        this.unreliableConnections.set(conn.peer, conn);
      }

      if (!this.isHost) {
        if (isReliable) this.hostReliableConn = conn;
        else this.hostUnreliableConn = conn;

        this.sendReliableMessage({
          type: 'request_join',
          playerId: this.myPlayerId,
          appearance,
        });
      } else {
        this.broadcastLobbyState();
      }
    });

    conn.on('data', (data: any) => {
      this.handleIncomingRawMessage(data, conn.peer);
    });

    conn.on('close', () => {
      this.reliableConnections.delete(conn.peer);
      this.unreliableConnections.delete(conn.peer);
      if (this.isHost && isReliable) {
        const playerId = this.connectionPlayerIds.get(conn.peer);
        if (playerId) {
          this.connectionPlayerIds.delete(conn.peer);
          const slot = this.slots.find((candidate) => candidate.playerId === playerId);
          if (slot) {
            if (this.isInMatch && this.roomConfig.onClientLeave === 'end_match') {
              this.isInMatch = false;
              this.sendReliableMessage({
                type: 'match_ended',
                reason: `${slot.playerName} disconnected`,
              });
            } else {
              slot.playerId = null;
              slot.isBot = true;
              slot.isReady = true;
              slot.playerName = `${slot.appearance.name} (Bot)`;
              this.broadcastLobbyState();
            }
          }
        }
      }
      if (!this.isHost && conn === this.hostReliableConn) {
        this.callbacks.onHostDisconnected?.();
        this.callbacks.onConnectionStatusChanged?.('disconnected', 'Host disconnected');
      }
    });
  }

  /**
   * Heartbeat & connection health watchdog
   */
  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);

    this.heartbeatInterval = setInterval(() => {
      if (!this.isConnected) return;
      this.sendReliableMessage({
        type: 'ping',
        from: this.myPlayerId,
        t0: performance.now(),
      });

      // Update rate calculation
      const now = performance.now();
      const elapsed = (now - this.lastRateCheckTime) / 1000;
      if (elapsed >= 1.0) {
        this.currentSnapshotRateHz = Math.round(this.snapshotsReceivedLastSecond / elapsed);
        this.snapshotsReceivedLastSecond = 0;
        this.lastRateCheckTime = now;

        if (this.totalSnapCount > 0) {
          this.currentPacketLossPercent = Math.min(
            100,
            (this.lostSnapCount / this.totalSnapCount) * 100
          );
        }
        this.callbacks.onStatsUpdated?.({
          snapshotRateHz: this.currentSnapshotRateHz,
          packetLossPercent: this.currentPacketLossPercent,
        });
      }
    }, 1000);

    this.watchdogInterval = setInterval(() => {
      if (!this.isConnected) return;
      const timeSinceLast = Date.now() - this.lastPacketReceivedTime;
      if (timeSinceLast > 3800) {
        this.callbacks.onConnectionStatusChanged?.('reconnecting');
      }
    }, 1000);
  }

  /**
   * Send reliable message (Lobby, Events, Rules, Start)
   */
  public sendReliableMessage(msg: any, targetPeer?: string) {
    if (this.simulatedPacketLossRate > 0 && Math.random() < this.simulatedPacketLossRate) {
      return;
    }

    const deliver = () => {
      if (!targetPeer && this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage(msg);
        } catch {}
      }

      if (this.isHost) {
        if (targetPeer) {
          const conn = this.reliableConnections.get(targetPeer);
          if (conn?.open) conn.send(msg);
        } else {
          this.reliableConnections.forEach((conn) => {
            if (conn.open) conn.send(msg);
          });
        }
      } else if (this.hostReliableConn && this.hostReliableConn.open) {
        this.hostReliableConn.send(msg);
      }
    };

    if (this.simulatedLatencyMs > 0) {
      const jitter = (Math.random() - 0.5) * 20;
      setTimeout(deliver, Math.max(5, this.simulatedLatencyMs + jitter));
    } else {
      deliver();
    }
  }

  /**
   * Send unreliable binary packet (Inputs and Snapshots)
   */
  private sendUnreliablePacket(data: Uint8Array | ArrayBuffer | any) {
    if (this.simulatedPacketLossRate > 0 && Math.random() < this.simulatedPacketLossRate) {
      return;
    }

    const deliver = () => {
      if (this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage(data);
        } catch {}
      }

      if (this.isHost) {
        this.unreliableConnections.forEach((conn) => {
          if (conn.open) conn.send(data);
          else {
            // Fallback to reliable connection if unreliable is not ready
            const rel = this.reliableConnections.get(conn.peer);
            if (rel && rel.open) rel.send(data);
          }
        });
      } else {
        if (this.hostUnreliableConn && this.hostUnreliableConn.open) {
          this.hostUnreliableConn.send(data);
        } else if (this.hostReliableConn && this.hostReliableConn.open) {
          this.hostReliableConn.send(data);
        }
      }
    };

    if (this.simulatedLatencyMs > 0) {
      const jitter = (Math.random() - 0.5) * 20;
      setTimeout(deliver, Math.max(5, this.simulatedLatencyMs + jitter));
    } else {
      deliver();
    }
  }

  /**
   * Main incoming message dispatcher (handles binary buffers and JSON)
   */
  private handleIncomingRawMessage(data: any, sourcePeer?: string) {
    this.lastPacketReceivedTime = Date.now();

    // 1. Check for binary packet (ArrayBuffer or Uint8Array)
    if (data instanceof ArrayBuffer || data instanceof Uint8Array || data?.byteLength) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (bytes.length >= 2) {
        const magic = bytes[0] | (bytes[1] << 8);

        // Binary Snapshot from Host
        if (magic === BINARY_SNAPSHOT_MAGIC) {
          if (this.isHost) return;
          const snapshot = decodeBinarySnapshot(bytes);
          if (snapshot) {
            this.handleDecodedSnapshot(snapshot);
          }
          return;
        }

        // Binary Input from Client
        if (magic === BINARY_INPUT_MAGIC) {
          if (!this.isHost) return;
          const decoded = decodeBinaryInputs(bytes);
          if (decoded && decoded.inputs.length > 0) {
            const latest = decoded.inputs[0];
            this.ackedInputSeq[decoded.slot] = latest.seq;
            this.callbacks.onClientInputReceived?.(
              `slot_${decoded.slot}`,
              decoded.slot,
              latest
            );
          }
          return;
        }
      }
    }

    // 2. Reliable JSON / Event message
    if (!data || typeof data !== 'object') return;
    if (data.from === this.myPlayerId) return; // Ignore own echoes

    switch (data.type) {
      case 'request_join': {
        if (!this.isHost) return;
        this.handleClientJoinRequest(data.playerId, data.appearance, sourcePeer);
        break;
      }
      case 'join_response': {
        if (data.accepted) {
          if (this.joinTimeoutTimer) clearTimeout(this.joinTimeoutTimer);
          if (data.config) this.roomConfig = data.config;
          if (data.slots) this.slots = data.slots;
          if (data.assignedSlot) this.mySlot = data.assignedSlot;
          const found = this.slots.find((s) => s.slot === this.mySlot);
          if (found) this.mySide = found.side;
          this.callbacks.onLobbyUpdated?.(this.slots, false, this.mySlot, this.roomConfig);
          this.callbacks.onConnectionStatusChanged?.('connected');
        } else {
          this.callbacks.onConnectionStatusChanged?.(
            'disconnected',
            data.error || 'Could not join room'
          );
        }
        break;
      }
      case 'lobby_state': {
        if (this.joinTimeoutTimer) clearTimeout(this.joinTimeoutTimer);
        if (data.config) this.roomConfig = data.config;
        this.slots = data.slots;

        const found = this.slots.find((s) => s.playerId === this.myPlayerId);
        if (found) {
          this.mySlot = found.slot;
          this.mySide = found.side;
        }
        this.callbacks.onLobbyUpdated?.(this.slots, this.isHost, this.mySlot, this.roomConfig);
        this.callbacks.onConnectionStatusChanged?.('connected');
        break;
      }
      case 'slot_change_request': {
        if (!this.isHost) return;
        this.handleSlotChangeRequest(data.playerId, data.targetSlot);
        break;
      }
      case 'toggle_ready_request': {
        if (!this.isHost) return;
        const slot = this.slots.find((s) => s.playerId === data.playerId);
        if (slot) {
          slot.isReady = !slot.isReady;
          this.broadcastLobbyState();
        }
        break;
      }
      case 'toggle_bot_slot': {
        if (!this.isHost) return;
        const slot = this.slots.find((s) => s.slot === data.slot);
        if (slot && !slot.playerId) {
          slot.isBot = !slot.isBot;
          slot.isReady = slot.isBot;
          slot.playerName = slot.isBot ? `${slot.appearance.name} (Bot)` : 'Empty';
          this.broadcastLobbyState();
        }
        break;
      }
      case 'start_match': {
        this.isInMatch = true;
        if (data.config) this.roomConfig = data.config;
        if (data.slots) this.slots = data.slots;
        this.callbacks.onMatchStarted?.(
          this.roomConfig,
          this.slots,
          data.servingSide || 'south',
          data.seed || 12345
        );
        break;
      }
      case 'client_input': {
        // Fallback if client sent non-binary input
        if (!this.isHost) return;
        this.ackedInputSeq[data.slot] = data.input.seq;
        this.callbacks.onClientInputReceived?.(data.playerId, data.slot, data.input);
        break;
      }
      case 'world_snapshot': {
        // Fallback if snapshot was sent as JSON
        if (this.isHost) return;
        this.handleDecodedSnapshot(data.snapshot);
        break;
      }
      case 'point_scored': {
        this.callbacks.onPointScoredReceived?.(data.winner, data.scoreState);
        break;
      }
      case 'ping': {
        this.sendReliableMessage({
          type: 'pong',
          for: data.from,
          t0: data.t0,
          tServer: performance.now(),
        });
        break;
      }
      case 'pong': {
        if (data.for === this.myPlayerId) {
          const t1 = performance.now();
          const rtt = Math.max(1, t1 - data.t0);
          this.pingMs = Math.round(rtt / 2);

          // Clock sync offset calculation
          const offset = data.tServer - (data.t0 + rtt / 2);
          this.clockOffsets.push(offset);
          if (this.clockOffsets.length > 5) this.clockOffsets.shift();

          const sorted = [...this.clockOffsets].sort((a, b) => a - b);
          this.medianClockOffset = sorted[Math.floor(sorted.length / 2)];

          // Adapt buffer delay dynamically based on ping
          this.adaptiveBufferDelayMs = Math.max(65, Math.min(160, this.pingMs + 35));

          this.callbacks.onPingUpdated?.(this.pingMs);
        }
        break;
      }
      case 'host_leave': {
        this.callbacks.onHostDisconnected?.();
        this.callbacks.onConnectionStatusChanged?.('disconnected', 'Host has left the match');
        break;
      }
    }
  }

  private handleDecodedSnapshot(snapshot: CompactSnapshot) {
    this.snapshotsReceivedLastSecond++;
    this.totalSnapCount++;

    if (this.expectedSnapSeq > 0 && snapshot.seq > this.expectedSnapSeq) {
      this.lostSnapCount += snapshot.seq - this.expectedSnapSeq;
    }
    this.expectedSnapSeq = snapshot.seq + 1;

    this.addSnapshotToBuffer(snapshot);
    this.callbacks.onSnapshotReceived?.(snapshot);
  }

  /**
   * Process client join request on Host
   */
  private handleClientJoinRequest(
    playerId: string,
    appearance: PlayerAppearance,
    sourcePeer?: string
  ) {
    if (this.joinRequestIds.has(playerId)) {
      if (sourcePeer && !this.connectionPlayerIds.has(sourcePeer)) {
        this.connectionPlayerIds.set(sourcePeer, playerId);
      }
      return;
    }
    this.joinRequestIds.add(playerId);
    // If room is already in an active match, check config
    if (this.isInMatch) {
      this.sendReliableMessage({
        type: 'join_response',
        accepted: false,
        error: `Match already in progress in room ${this.currentRoomId}.`,
      });
      return;
    }

    let existing = this.slots.find((s) => s.playerId === playerId);
    if (!existing) {
      // Find first available slot (prefers slot where playerId is null)
      const emptySlot =
        this.slots.find((s) => s.playerId === null && !s.isBot) ||
        this.slots.find((s) => s.playerId === null);

      if (!emptySlot) {
        this.sendReliableMessage({
          type: 'join_response',
          accepted: false,
          error: `Room ${this.currentRoomId} is full (all slots occupied).`,
        });
        return;
      }

      emptySlot.playerId = playerId;
      emptySlot.playerName = appearance.name || `Player ${emptySlot.slot}`;
      emptySlot.appearance = { ...appearance };
      emptySlot.isBot = false;
      emptySlot.isReady = false;
      emptySlot.isHost = false;

      if (sourcePeer) this.connectionPlayerIds.set(sourcePeer, playerId);

      // Send direct confirmation
      this.sendReliableMessage({
        type: 'join_response',
        accepted: true,
        assignedSlot: emptySlot.slot,
        config: this.roomConfig,
        slots: this.slots,
      }, sourcePeer);
    }

    this.broadcastLobbyState();
  }

  private handleSlotChangeRequest(playerId: string, targetSlot: 1 | 2 | 3 | 4) {
    const current = this.slots.find((s) => s.playerId === playerId);
    const target = this.slots.find((s) => s.slot === targetSlot);
    if (!current || !target) return;
    if (target.playerId && target.playerId !== playerId) return;

    target.playerId = current.playerId;
    target.playerName = current.playerName;
    target.appearance = current.appearance;
    target.isBot = false;
    target.isReady = false;
    target.isHost = current.isHost;

    current.playerId = null;
    current.isBot = true;
    current.isReady = true;
    current.playerName = `${current.appearance.name} (Bot)`;

    this.broadcastLobbyState();
  }

  public broadcastLobbyState() {
    this.sendReliableMessage({
      type: 'lobby_state',
      from: this.myPlayerId,
      config: this.roomConfig,
      slots: this.slots,
    });
    this.callbacks.onLobbyUpdated?.(this.slots, true, this.mySlot, this.roomConfig);
  }

  // ==========================================
  // LOBBY ACTIONS
  // ==========================================

  public requestSlotChange(targetSlot: 1 | 2 | 3 | 4) {
    if (this.isHost) {
      this.handleSlotChangeRequest(this.myPlayerId, targetSlot);
    } else {
      this.sendReliableMessage({
        type: 'slot_change_request',
        from: this.myPlayerId,
        playerId: this.myPlayerId,
        targetSlot,
      });
    }
  }

  public toggleReady() {
    if (this.isHost) {
      const slot = this.slots.find((s) => s.slot === this.mySlot);
      if (slot) {
        slot.isReady = !slot.isReady;
        this.broadcastLobbyState();
      }
    } else {
      this.sendReliableMessage({
        type: 'toggle_ready_request',
        from: this.myPlayerId,
        playerId: this.myPlayerId,
      });
    }
  }

  public toggleBotSlot(slotNum: 1 | 2 | 3 | 4) {
    if (!this.isHost) return;
    const slot = this.slots.find((s) => s.slot === slotNum);
    if (slot && !slot.playerId) {
      slot.isBot = !slot.isBot;
      slot.isReady = slot.isBot;
      slot.playerName = slot.isBot ? `${slot.appearance.name} (Bot)` : 'Empty';
      this.broadcastLobbyState();
    }
  }

  public fillAllEmptySlotsWithBots() {
    if (!this.isHost) return;
    this.slots.forEach((s) => {
      if (!s.playerId) {
        s.isBot = true;
        s.isReady = true;
        s.playerName = `${s.appearance.name} (Bot)`;
      }
    });
    this.broadcastLobbyState();
  }

  public startMatch() {
    if (!this.isHost) return;
    this.isInMatch = true;
    const seed = Math.floor(Math.random() * 1000000);
    this.sendReliableMessage({
      type: 'start_match',
      from: this.myPlayerId,
      config: this.roomConfig,
      slots: this.slots,
      servingSide: 'south',
      seed,
    });
    this.callbacks.onMatchStarted?.(this.roomConfig, this.slots, 'south', seed);
  }

  // ==========================================
  // GAMEPLAY NETCODE: INPUTS & SNAPSHOTS
  // ==========================================

  public getServerTime(): number {
    return performance.now() + this.medianClockOffset;
  }

  /**
   * Client sends input packet at 60 Hz with up to 3 historical packets for loss resilience
   */
  public sendInput(input: Omit<ClientInputPacket, 'seq' | 'timestamp'>) {
    this.inputSeq++;
    const packet: ClientInputPacket = {
      ...input,
      seq: this.inputSeq,
      timestamp: performance.now(),
    };

    this.inputHistory.unshift(packet);
    if (this.inputHistory.length > 3) this.inputHistory.pop();

    // Binary encoding (zero allocations)
    const binary = encodeBinaryInputs(this.mySlot, packet.timestamp, this.inputHistory);
    this.sendUnreliablePacket(binary);
  }

  /**
   * Host broadcasts authoritative snapshot at 30 Hz using binary DataView
   */
  public broadcastSnapshot(ball: BallState, players: PlayerState[], score: ScoreState) {
    if (!this.isHost) return;
    this.snapshotSeq++;

    const compactPlayers: CompactPlayerSnapshot[] = players.map((p) => ({
      s: p.slot,
      x: q(p.position.x, 2),
      y: q(p.position.y, 2),
      z: q(p.position.z, 2),
      vx: q(p.velocity.x, 2),
      vz: q(p.velocity.z, 2),
      sw: p.isSwinging,
      sp: q(p.racketSwingProgress, 2),
      ss: p.swingSide,
      st: p.currentShotType,
    }));

    const snapshot: CompactSnapshot = {
      seq: this.snapshotSeq,
      t: performance.now(),
      ackSeq: { ...this.ackedInputSeq },
      b: [
        q(ball.position.x, 2),
        q(ball.position.y, 2),
        q(ball.position.z, 2),
        q(ball.velocity.x, 2),
        q(ball.velocity.y, 2),
        q(ball.velocity.z, 2),
        ball.inPlay,
        ball.lastHitter,
        ball.bounceCount,
      ],
      p: compactPlayers,
      sc: {
        g: [score.games[0], score.games[1]],
        pts: [score.points[0], score.points[1]],
        raw: [score.rawPoints[0], score.rawPoints[1]],
        s: score.servingSide,
        r: score.rallyCount,
      },
    };

    const binary = encodeBinarySnapshot(snapshot);
    this.sendUnreliablePacket(binary);
  }

  public broadcastPointScored(winner: Side, scoreState: ScoreState) {
    if (!this.isHost) return;
    this.sendReliableMessage({
      type: 'point_scored',
      winner,
      scoreState,
    });
  }

  // ==========================================
  // ADAPTIVE INTERPOLATION BUFFER
  // ==========================================

  private addSnapshotToBuffer(snapshot: CompactSnapshot) {
    this.snapshotBuffer.push(snapshot);
    const maxBufferSize = 25;
    if (this.snapshotBuffer.length > maxBufferSize) {
      this.snapshotBuffer.shift();
    }
  }

  /**
   * Interpolate remote player state with smooth extrapolation fallback
   */
  public getInterpolatedPlayer(slot: 1 | 2 | 3 | 4): CompactPlayerSnapshot | null {
    if (this.snapshotBuffer.length === 0) return null;

    const renderTime = (this.isHost ? performance.now() : this.getServerTime()) - this.adaptiveBufferDelayMs;

    // Find two bounding snapshots
    let s0: CompactSnapshot | null = null;
    let s1: CompactSnapshot | null = null;

    for (let i = this.snapshotBuffer.length - 1; i >= 0; i--) {
      const snap = this.snapshotBuffer[i];
      if (snap.t <= renderTime) {
        s0 = snap;
        s1 = this.snapshotBuffer[i + 1] || null;
        break;
      }
    }

    if (!s0) {
      s0 = this.snapshotBuffer[0];
      s1 = this.snapshotBuffer[1] || s0;
    }

    const p0 = s0.p.find((p) => p.s === slot);
    if (!p0) return null;

    if (!s1 || s0 === s1) {
      // Extrapolate up to 100ms if late snapshot
      const deltaT = Math.min(0.1, Math.max(0, (renderTime - s0.t) / 1000));
      return {
        ...p0,
        x: p0.x + p0.vx * deltaT,
        z: p0.z + p0.vz * deltaT,
      };
    }

    const p1 = s1.p.find((p) => p.s === slot);
    if (!p1) return p0;

    const timeSpan = Math.max(1, s1.t - s0.t);
    const alpha = Math.max(0, Math.min(1, (renderTime - s0.t) / timeSpan));

    return {
      s: slot,
      x: p0.x + (p1.x - p0.x) * alpha,
      y: p0.y + (p1.y - p0.y) * alpha,
      z: p0.z + (p1.z - p0.z) * alpha,
      vx: p0.vx + (p1.vx - p0.vx) * alpha,
      vz: p0.vz + (p1.vz - p0.vz) * alpha,
      sw: alpha > 0.5 ? p1.sw : p0.sw,
      sp: p0.sp + (p1.sp - p0.sp) * alpha,
      ss: alpha > 0.5 ? p1.ss : p0.ss,
      st: alpha > 0.5 ? p1.st : p0.st,
    };
  }

  /**
   * Smooth ball position without teleportation (never jumps unless error > 2.0m)
   */
  public getSmoothedBall(currentPos: Vector3D, dt: number): Vector3D | null {
    if (this.snapshotBuffer.length === 0) return null;

    const latest = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    const b = latest.b;
    const target: Vector3D = { x: b[0], y: b[1], z: b[2] };

    const dist = Math.hypot(target.x - currentPos.x, target.z - currentPos.z);
    if (dist > 2.0) {
      // Large divergence: snap
      return target;
    }

    // Smooth exponential blend
    const blendFactor = Math.min(1.0, dt * 18.0);
    return {
      x: currentPos.x + (target.x - currentPos.x) * blendFactor,
      y: currentPos.y + (target.y - currentPos.y) * blendFactor,
      z: currentPos.z + (target.z - currentPos.z) * blendFactor,
    };
  }

  public getDebugStats() {
    return {
      snapshotRateHz: this.currentSnapshotRateHz,
      packetLossPercent: this.currentPacketLossPercent,
      bufferHealthMs: Math.round(this.adaptiveBufferDelayMs),
      transport: this.peer
        ? 'WebRTC Dual-Channel (Reliable + Unreliable)'
        : 'BroadcastChannel (Local Tab)',
    };
  }

  public disconnect() {
    if (this.joinTimeoutTimer) clearTimeout(this.joinTimeoutTimer);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);

    if (this.isHost) {
      this.sendReliableMessage({ type: 'host_leave' });
    }

    this.reliableConnections.forEach((conn) => conn.close());
    this.unreliableConnections.forEach((conn) => conn.close());
    this.reliableConnections.clear();
    this.unreliableConnections.clear();
    this.connectionPlayerIds.clear();
    this.joinRequestIds.clear();

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.broadcastChannel = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    this.isConnected = false;
    this.isHost = false;
    this.isInMatch = false;
    this.snapshotBuffer = [];
    this.currentRoomId = null;
    this.callbacks.onConnectionStatusChanged?.('disconnected');
  }
}
