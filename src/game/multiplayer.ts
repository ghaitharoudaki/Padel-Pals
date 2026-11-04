import Peer, { DataConnection } from 'peerjs';
import {
  BallState,
  PlayerAppearance,
  PlayerCustomization,
  PlayerState,
  ScoreState,
  ShotType,
  Side,
  SwingSide,
  Vector3D,
} from './types';

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

export interface CompactPlayerSnapshot {
  s: 1 | 2 | 3 | 4;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  sw: boolean;
  sp: number;
  ss: SwingSide;
  st: ShotType;
}

export interface CompactSnapshot {
  seq: number;
  t: number;
  ackSeq: Record<string, number>;
  // Ball: [x, y, z, vx, vy, vz, inPlay, lastHitter, bounceCount]
  b: [number, number, number, number, number, number, boolean, Side | null, number];
  p: CompactPlayerSnapshot[];
  sc: {
    g: [number, number];
    pts: [string, string];
    raw: [number, number];
    s: Side;
    r: number;
  };
}

export interface ClientInputPacket {
  seq: number;
  dt: number;
  moveX: number;
  moveZ: number;
  isJumping: boolean;
  wantsSwing: boolean;
  shotType: ShotType;
  power: number;
  aimX: number;
  aimZ: number;
  bias?: { x: number; z: number };
  timestamp: number;
}

export interface MultiplayerCallbacks {
  onLobbyUpdated?: (slots: LobbySlot[], isHost: boolean, mySlot: 1 | 2 | 3 | 4) => void;
  onMatchStarted?: (servingSide: Side) => void;
  onSnapshotReceived?: (snapshot: CompactSnapshot) => void;
  onClientInputReceived?: (playerId: string, slot: 1 | 2 | 3 | 4, input: ClientInputPacket) => void;
  onPointScoredReceived?: (winner: Side, scoreState: ScoreState) => void;
  onHostDisconnected?: () => void;
  onPingUpdated?: (pingMs: number) => void;
  onConnectionStatusChanged?: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected', error?: string) => void;
}

// Helper to quantize floats to save bandwidth
export function q(num: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Generate a clean 5-character alphanumeric room code (no ambiguous characters like 0/O, 1/I)
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
 * Hybrid WebRTC (PeerJS) + BroadcastChannel for 100% reliable sandbox & cross-tab execution.
 */
export class MultiplayerClient {
  public callbacks: MultiplayerCallbacks = {};
  public currentRoomId: string | null = null;
  public myPlayerId: string;
  public mySlot: 1 | 2 | 3 | 4 = 1;
  public mySide: Side = 'south';
  public isHost: boolean = false;
  public isConnected: boolean = false;
  public pingMs: number = 0;

  // Debug options for netcode testing
  public simulatedLatencyMs: number = 0;
  public simulatedPacketLossRate: number = 0;

  // Networking transports
  private broadcastChannel: BroadcastChannel | null = null;
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;

  // Lobby state
  public slots: LobbySlot[] = [];

  // Heartbeat & ping
  private pingInterval: any = null;
  private lastPacketReceivedTime: number = Date.now();
  private connectionHealthCheck: any = null;

  // Snapshot sequence
  private snapshotSeq: number = 0;
  private inputSeq: number = 0;
  private ackedInputSeq: Record<string, number> = {};

  // Snapshot Interpolation Buffer (~100ms)
  private snapshotBuffer: CompactSnapshot[] = [];
  private readonly bufferDelayMs: number = 90;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
    this.myPlayerId = 'p_' + Math.random().toString(36).substring(2, 8);
  }

  /**
   * Helper: Generate a clean 5-character alphanumeric room code
   */
  public static generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Initialize standard 4-slot padel court lobby
   */
  private createInitialSlots(hostAppearance: PlayerAppearance): LobbySlot[] {
    return [
      {
        slot: 1,
        side: 'south',
        team: 'blue',
        zone: 'left',
        playerId: this.myPlayerId,
        playerName: hostAppearance.name || 'Player 1',
        appearance: { ...hostAppearance },
        isBot: false,
        isReady: true,
        isHost: true,
        ping: 0,
      },
      {
        slot: 2,
        side: 'north',
        team: 'red',
        zone: 'left',
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
      },
      {
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
      },
      {
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
      },
    ];
  }

  /**
   * Create a new room as Host
   */
  public createRoom(roomCode: string, appearance: PlayerAppearance) {
    this.disconnect();
    this.currentRoomId = roomCode.toUpperCase().trim();
    this.isHost = true;
    this.mySlot = 1;
    this.mySide = 'south';
    this.slots = this.createInitialSlots(appearance);

    this.callbacks.onConnectionStatusChanged?.('connecting');
    this.initTransports(true, this.currentRoomId, appearance);
  }

  /**
   * Join an existing room as Client
   */
  public joinRoom(roomCode: string, appearance: PlayerAppearance) {
    this.disconnect();
    const cleanCode = roomCode.toUpperCase().trim();
    if (cleanCode.length < 4 || cleanCode.length > 8) {
      this.callbacks.onConnectionStatusChanged?.('disconnected', 'Invalid room code length (5 chars required)');
      return;
    }

    this.currentRoomId = cleanCode;
    this.isHost = false;
    this.callbacks.onConnectionStatusChanged?.('connecting');
    this.initTransports(false, this.currentRoomId, appearance);
  }

  /**
   * Initialize dual transports: BroadcastChannel (instant sandbox 2-tab) + PeerJS (WebRTC)
   */
  private initTransports(asHost: boolean, roomId: string, appearance: PlayerAppearance) {
    // 1. BroadcastChannel (Guarantees instant sandbox multi-tab connectivity)
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel(`padel_pals_net_${roomId}`);
        this.broadcastChannel.onmessage = (event) => {
          this.handleIncomingRawMessage(event.data);
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel not available:', e);
    }

    // 2. WebRTC PeerJS
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
            ],
          },
        });
        this.peer = peer;

        peer.on('open', () => {
          this.isConnected = true;
          this.callbacks.onConnectionStatusChanged?.('connected');

          if (asHost) {
            // Host broadcast initial lobby state
            this.broadcastLobbyState();
          } else {
            // Client connects to host peer
            const hostPeerId = `padelpals-${roomId.toLowerCase()}`;
            const conn = peer.connect(hostPeerId, { reliable: true });
            this.setupConnection(conn, appearance);
            this.hostConnection = conn;

            // Also broadcast join request via BroadcastChannel
            this.sendTransportMessage({
              type: 'request_join',
              playerId: this.myPlayerId,
              appearance,
            });
          }
        });

        peer.on('connection', (conn: any) => {
          this.setupConnection(conn, appearance);
        });

        peer.on('error', (err: any) => {
          // If host ID is already taken, try joining as client
          if (asHost && err.type === 'unavailable-id') {
            console.warn('Room host ID already active; switching to join mode');
            this.isHost = false;
            this.joinRoom(roomId, appearance);
            return;
          }
          console.warn('PeerJS warning:', err.type, err.message);
        });
    }
  } catch (e) {
    console.warn('PeerJS initialization skipped:', e);
  }

    // If Host, mark connected and start ping ticker
    if (asHost) {
      this.isConnected = true;
      this.callbacks.onConnectionStatusChanged?.('connected');
      this.callbacks.onLobbyUpdated?.(this.slots, true, 1);
    } else {
      // Send join ping over BroadcastChannel
      setTimeout(() => {
        this.sendTransportMessage({
          type: 'request_join',
          playerId: this.myPlayerId,
          appearance,
        });
      }, 50);
    }

    // Ping ticker & reconnection watchdog
    this.startHeartbeat();
  }

  private setupConnection(conn: DataConnection, appearance: PlayerAppearance) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.isConnected = true;
      this.callbacks.onConnectionStatusChanged?.('connected');

      if (!this.isHost) {
        this.hostConnection = conn;
        this.sendTransportMessage({
          type: 'request_join',
          playerId: this.myPlayerId,
          appearance,
        });
      } else {
        this.broadcastLobbyState();
      }
    });

    conn.on('data', (data) => {
      this.handleIncomingRawMessage(data);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      if (!this.isHost && conn === this.hostConnection) {
        this.callbacks.onHostDisconnected?.();
        this.callbacks.onConnectionStatusChanged?.('disconnected', 'Host disconnected');
      }
    });
  }

  private startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.connectionHealthCheck) clearInterval(this.connectionHealthCheck);

    this.pingInterval = setInterval(() => {
      if (!this.isConnected) return;
      this.sendTransportMessage({
        type: 'ping',
        from: this.myPlayerId,
        t: Date.now(),
      });
    }, 1200);

    // Watchdog for connection loss
    this.connectionHealthCheck = setInterval(() => {
      if (!this.isConnected) return;
      const timeSinceLast = Date.now() - this.lastPacketReceivedTime;
      if (timeSinceLast > 3500) {
        this.callbacks.onConnectionStatusChanged?.('reconnecting');
      }
    }, 1000);
  }

  /**
   * Internal transport sender (with simulated latency & packet loss support)
   */
  private sendTransportMessage(msg: any) {
    if (this.simulatedPacketLossRate > 0 && Math.random() < this.simulatedPacketLossRate) {
      return; // Simulate dropped packet
    }

    const deliver = () => {
      // 1. BroadcastChannel
      if (this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage(msg);
        } catch {}
      }

      // 2. WebRTC PeerJS
      if (this.isHost) {
        this.connections.forEach((conn) => {
          if (conn.open) {
            conn.send(msg);
          }
        });
      } else if (this.hostConnection && this.hostConnection.open) {
        this.hostConnection.send(msg);
      }
    };

    if (this.simulatedLatencyMs > 0) {
      const jitter = (Math.random() - 0.5) * 30;
      setTimeout(deliver, Math.max(10, this.simulatedLatencyMs + jitter));
    } else {
      deliver();
    }
  }

  /**
   * Core Message Dispatcher
   */
  private handleIncomingRawMessage(msg: any) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.from === this.myPlayerId) return; // Ignore own echoes
    this.lastPacketReceivedTime = Date.now();

    switch (msg.type) {
      case 'request_join': {
        if (!this.isHost) return;
        this.handleClientJoinRequest(msg.playerId, msg.appearance);
        break;
      }
      case 'lobby_state': {
        this.slots = msg.slots;
        // Find my slot
        const found = this.slots.find((s) => s.playerId === this.myPlayerId);
        if (found) {
          this.mySlot = found.slot;
          this.mySide = found.side;
        }
        this.callbacks.onLobbyUpdated?.(this.slots, this.isHost, this.mySlot);
        this.callbacks.onConnectionStatusChanged?.('connected');
        break;
      }
      case 'slot_change_request': {
        if (!this.isHost) return;
        this.handleSlotChangeRequest(msg.playerId, msg.targetSlot);
        break;
      }
      case 'toggle_ready_request': {
        if (!this.isHost) return;
        const slot = this.slots.find((s) => s.playerId === msg.playerId);
        if (slot) {
          slot.isReady = !slot.isReady;
          this.broadcastLobbyState();
        }
        break;
      }
      case 'toggle_bot_slot': {
        if (!this.isHost) return;
        const slot = this.slots.find((s) => s.slot === msg.slot);
        if (slot && !slot.playerId) {
          slot.isBot = !slot.isBot;
          slot.isReady = slot.isBot;
          slot.playerName = slot.isBot ? `${slot.appearance.name} (Bot)` : 'Empty';
          this.broadcastLobbyState();
        }
        break;
      }
      case 'start_match': {
        this.callbacks.onMatchStarted?.(msg.servingSide || 'south');
        break;
      }
      case 'client_input': {
        if (!this.isHost) return;
        this.ackedInputSeq[msg.playerId] = msg.input.seq;
        this.callbacks.onClientInputReceived?.(msg.playerId, msg.slot, msg.input);
        break;
      }
      case 'world_snapshot': {
        if (this.isHost) return; // Only clients consume host snapshots
        this.addSnapshotToBuffer(msg.snapshot);
        this.callbacks.onSnapshotReceived?.(msg.snapshot);
        break;
      }
      case 'point_scored': {
        this.callbacks.onPointScoredReceived?.(msg.winner, msg.scoreState);
        break;
      }
      case 'ping': {
        this.sendTransportMessage({
          type: 'pong',
          for: msg.from,
          t: msg.t,
          serverT: Date.now(),
        });
        break;
      }
      case 'pong': {
        if (msg.for === this.myPlayerId) {
          const rtt = Math.max(1, Date.now() - msg.t);
          this.pingMs = Math.round(rtt / 2);
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

  private handleClientJoinRequest(playerId: string, appearance: PlayerAppearance) {
    // Check if player is already in a slot
    let existing = this.slots.find((s) => s.playerId === playerId);
    if (!existing) {
      // Find first empty slot (prefer human or replace bot)
      const emptySlot =
        this.slots.find((s) => s.playerId === null && !s.isBot) ||
        this.slots.find((s) => s.playerId === null);

      if (!emptySlot) {
        // Room full!
        return;
      }
      emptySlot.playerId = playerId;
      emptySlot.playerName = appearance.name || `Player ${emptySlot.slot}`;
      emptySlot.appearance = { ...appearance };
      emptySlot.isBot = false;
      emptySlot.isReady = false;
      emptySlot.isHost = false;
    }
    this.broadcastLobbyState();
  }

  private handleSlotChangeRequest(playerId: string, targetSlot: 1 | 2 | 3 | 4) {
    const current = this.slots.find((s) => s.playerId === playerId);
    const target = this.slots.find((s) => s.slot === targetSlot);
    if (!current || !target) return;
    if (target.playerId && target.playerId !== playerId) return; // Slot occupied by another human

    // Swap or move
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
    this.sendTransportMessage({
      type: 'lobby_state',
      from: this.myPlayerId,
      slots: this.slots,
    });
    this.callbacks.onLobbyUpdated?.(this.slots, true, this.mySlot);
  }

  // ==========================================
  // LOBBY ACTIONS
  // ==========================================

  public requestSlotChange(targetSlot: 1 | 2 | 3 | 4) {
    if (this.isHost) {
      this.handleSlotChangeRequest(this.myPlayerId, targetSlot);
    } else {
      this.sendTransportMessage({
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
      this.sendTransportMessage({
        type: 'toggle_ready_request',
        from: this.myPlayerId,
        playerId: this.myPlayerId,
      });
    }
  }

  public toggleBotSlot(slotNum: 1 | 2 | 3 | 4) {
    if (!this.isHost) return;
    this.handleIncomingRawMessage({
      type: 'toggle_bot_slot',
      slot: slotNum,
    });
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
    this.sendTransportMessage({
      type: 'start_match',
      from: this.myPlayerId,
      servingSide: 'south',
    });
    this.callbacks.onMatchStarted?.('south');
  }

  // ==========================================
  // GAMEPLAY NETCODE: INPUTS & SNAPSHOTS
  // ==========================================

  /**
   * Client sends input packet at 30-60 Hz
   */
  public sendInput(input: Omit<ClientInputPacket, 'seq' | 'timestamp'>) {
    this.inputSeq++;
    const packet: ClientInputPacket = {
      ...input,
      seq: this.inputSeq,
      timestamp: Date.now(),
    };

    this.sendTransportMessage({
      type: 'client_input',
      from: this.myPlayerId,
      playerId: this.myPlayerId,
      slot: this.mySlot,
      input: packet,
    });

    return this.inputSeq;
  }

  /**
   * Host broadcasts compact world snapshot at 20-30 Hz
   */
  public broadcastSnapshot(
    ball: BallState,
    players: PlayerState[],
    score: ScoreState
  ) {
    if (!this.isHost) return;
    this.snapshotSeq++;

    const compactPlayers: CompactPlayerSnapshot[] = players.map((p) => ({
      s: p.slot,
      x: q(p.position.x),
      y: q(p.position.y),
      z: q(p.position.z),
      vx: q(p.velocity.x),
      vz: q(p.velocity.z),
      sw: p.isSwinging,
      sp: q(p.racketSwingProgress, 2),
      ss: p.swingSide,
      st: p.currentShotType,
    }));

    const compactSnapshot: CompactSnapshot = {
      seq: this.snapshotSeq,
      t: Date.now(),
      ackSeq: { ...this.ackedInputSeq },
      b: [
        q(ball.position.x),
        q(ball.position.y),
        q(ball.position.z),
        q(ball.velocity.x),
        q(ball.velocity.y),
        q(ball.velocity.z),
        ball.inPlay,
        ball.lastHitter,
        ball.bounceCount,
      ],
      p: compactPlayers,
      sc: {
        g: score.games,
        pts: score.points,
        raw: score.rawPoints,
        s: score.servingSide,
        r: score.rallyCount,
      },
    };

    this.sendTransportMessage({
      type: 'world_snapshot',
      from: this.myPlayerId,
      snapshot: compactSnapshot,
    });
  }

  public broadcastPointScored(winner: Side, scoreState: ScoreState) {
    if (!this.isHost) return;
    this.sendTransportMessage({
      type: 'point_scored',
      from: this.myPlayerId,
      winner,
      scoreState,
    });
  }

  // ==========================================
  // CLIENT SNAPSHOT INTERPOLATION BUFFER (~100ms)
  // ==========================================

  private addSnapshotToBuffer(s: CompactSnapshot) {
    this.snapshotBuffer.push(s);
    if (this.snapshotBuffer.length > 20) {
      this.snapshotBuffer.shift();
    }
  }

  /**
   * Interpolate remote player position from buffer
   */
  public getInterpolatedPlayer(slot: 1 | 2 | 3 | 4): CompactPlayerSnapshot | null {
    if (this.snapshotBuffer.length === 0) return null;
    if (this.snapshotBuffer.length === 1) {
      return this.snapshotBuffer[0].p.find((p) => p.s === slot) || null;
    }

    const renderTime = Date.now() - this.bufferDelayMs;

    // Find two snapshots flanking renderTime
    let s0 = this.snapshotBuffer[0];
    let s1 = this.snapshotBuffer[this.snapshotBuffer.length - 1];

    for (let i = this.snapshotBuffer.length - 1; i >= 0; i--) {
      if (this.snapshotBuffer[i].t <= renderTime) {
        s0 = this.snapshotBuffer[i];
        s1 = this.snapshotBuffer[Math.min(this.snapshotBuffer.length - 1, i + 1)];
        break;
      }
    }

    const p0 = s0.p.find((p) => p.s === slot);
    const p1 = s1.p.find((p) => p.s === slot);
    if (!p0 || !p1) return p0 || p1 || null;

    const range = s1.t - s0.t;
    const alpha = range <= 0 ? 0 : Math.max(0, Math.min(1, (renderTime - s0.t) / range));

    return {
      s: slot,
      x: p0.x + (p1.x - p0.x) * alpha,
      y: p0.y + (p1.y - p0.y) * alpha,
      z: p0.z + (p1.z - p0.z) * alpha,
      vx: p0.vx + (p1.vx - p0.vx) * alpha,
      vz: p0.vz + (p1.vz - p0.vz) * alpha,
      sw: p1.sw,
      sp: p1.sp,
      ss: p1.ss,
      st: p1.st,
    };
  }

  /**
   * Smoothly correct ball position (never teleport)
   */
  public getSmoothedBall(currentBall: Vector3D, dt: number): Vector3D {
    if (this.snapshotBuffer.length === 0) return { ...currentBall };
    const latest = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    const target: Vector3D = { x: latest.b[0], y: latest.b[1], z: latest.b[2] };

    // Exponential smoothing factor (~12 / second)
    const blend = 1.0 - Math.exp(-14.0 * dt);
    return {
      x: currentBall.x + (target.x - currentBall.x) * blend,
      y: currentBall.y + (target.y - currentBall.y) * blend,
      z: currentBall.z + (target.z - currentBall.z) * blend,
    };
  }

  public getLatestBallState(): {
    position: Vector3D;
    velocity: Vector3D;
    inPlay: boolean;
    lastHitter: Side | null;
    bounceCount: number;
  } | null {
    if (this.snapshotBuffer.length === 0) return null;
    const s = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    return {
      position: { x: s.b[0], y: s.b[1], z: s.b[2] },
      velocity: { x: s.b[3], y: s.b[4], z: s.b[5] },
      inPlay: s.b[6],
      lastHitter: s.b[7],
      bounceCount: s.b[8],
    };
  }

  public disconnect() {
    if (this.isHost) {
      this.sendTransportMessage({ type: 'host_leave', from: this.myPlayerId });
    }
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.connectionHealthCheck) clearInterval(this.connectionHealthCheck);

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

    this.connections.clear();
    this.hostConnection = null;
    this.isConnected = false;
    this.isHost = false;
    this.currentRoomId = null;
    this.snapshotBuffer = [];
    this.callbacks.onConnectionStatusChanged?.('disconnected');
  }
}
