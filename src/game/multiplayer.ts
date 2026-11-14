import Peer, { DataConnection } from 'peerjs';
import type {
  BallState,
  CompactPlayerSnapshot,
  CompactSnapshot,
  ClientInputPacket,
  PlayerAppearance,
  PlayerState,
  RoomConfig,
  ScoreState,
  ShotType,
  Side,
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
import { GRAVITY, BALL_RADIUS } from './physics';

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

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** A swing sent reliably from a client to the host. */
export interface RemoteSwing {
  slot: 1 | 2 | 3 | 4;
  shot: ShotType;
  power: number;
  aimX: number;
  aimZ: number;
  bias?: { x: number; z: number };
  posX: number;
  posZ: number;
  isJumping: boolean;
  isServe: boolean;
}

/** Visual / audio effects the host forwards so clients see and hear the same rally. */
export type MatchFx =
  | { k: 'hit'; slot: 1 | 2 | 3 | 4; shot: ShotType; quality: string; power: number; pos: Vector3D }
  | { k: 'bounce'; speed: number; pos: Vector3D }
  | { k: 'glass'; speed: number; pos: Vector3D }
  | { k: 'fence'; pos: Vector3D }
  | { k: 'net'; pos: Vector3D }
  | { k: 'text'; text: string };

export interface PointEvent {
  rally?: number;
  smash?: boolean;
  winner: Side;
  reason: string;
  bannerText: string;
  bannerSubtext: string;
  matchWon: boolean;
  score: ScoreState;
}

export interface MultiplayerCallbacks {
  onLobbyUpdated?: (
    slots: LobbySlot[],
    isHost: boolean,
    mySlot: 1 | 2 | 3 | 4,
    config: RoomConfig
  ) => void;
  onMatchStarted?: (
    config: RoomConfig,
    slots: LobbySlot[],
    servingSide: Side,
    seed: number,
    resume?: boolean
  ) => void;
  onSnapshotReceived?: (snapshot: CompactSnapshot) => void;
  onClientInputReceived?: (playerId: string, slot: 1 | 2 | 3 | 4, input: ClientInputPacket) => void;
  onRemoteSwing?: (swing: RemoteSwing, rttMs: number) => void;
  onScoreReceived?: (score: ScoreState) => void;
  onPointScoredReceived?: (winner: Side, scoreState: ScoreState, event?: PointEvent) => void;
  onPointResetReceived?: () => void;
  onFxReceived?: (fx: MatchFx) => void;
  onMatchEnded?: (reason: string) => void;
  onHostDisconnected?: () => void;
  onPingUpdated?: (pingMs: number) => void;
  onConnectionStatusChanged?: (status: ConnectionStatus, error?: string) => void;
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

const BOT_TEMPLATES: Record<2 | 3 | 4, Partial<PlayerAppearance>> = {
  2: {
    name: 'Alejandro',
    number: 5,
    hairStyle: 'spiky',
    jerseyPrimary: '#dc2626',
    jerseySecondary: '#18181b',
    shortsColor: '#dc2626',
    socksColor: '#dc2626',
    racketColor: '#dc2626',
    hairColor: '#d4af37',
  },
  3: {
    name: 'Carlos',
    number: 4,
    hairStyle: 'short',
    jerseyPrimary: '#2563eb',
    jerseySecondary: '#ffffff',
    shortsColor: '#ffffff',
    socksColor: '#2563eb',
    racketColor: '#2563eb',
    hairColor: '#451a03',
  },
  4: {
    name: 'Mateo',
    number: 10,
    hairStyle: 'mohawk',
    jerseyPrimary: '#ef4444',
    jerseySecondary: '#18181b',
    shortsColor: '#18181b',
    socksColor: '#ef4444',
    racketColor: '#ef4444',
    hairColor: '#18181b',
  },
};

type TransportKind = 'relay' | 'webrtc';

const RELAY_CONNECT_TIMEOUT_MS = 4500;
const SNAPSHOT_INTERVAL_MS = 1000 / 30;

/**
 * Host-authoritative netcode client for Padel Pals.
 *
 * Transports (tried in order):
 *  1. WebSocket relay on the game server (/ws) - works on any network.
 *  2. PeerJS WebRTC (public signaling + STUN/TURN) - used when no relay server is reachable,
 *     e.g. when the client is deployed as a static site.
 *
 * The host's browser simulates the match. Clients stream inputs/swings to the host and
 * render interpolated snapshots plus reliable score/effect events.
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
  public isPublicRoom = false;

  // Single source of truth room configuration
  public roomConfig: RoomConfig = {
    mode: '2v2',
    matchLength: '1_set',
    difficulty: 'pro',
    onClientLeave: 'replace_with_bot',
    goldenPoint: false,
  };

  public slots: LobbySlot[] = [];

  // Debug options for netcode testing
  public simulatedLatencyMs: number = 0;
  public simulatedPacketLossRate: number = 0;

  // Transport state
  private transport: TransportKind | null = null;
  private relay: WebSocket | null = null;
  private relayPeerId: string | null = null;
  private peer: Peer | null = null;
  private reliableConnections: Map<string, DataConnection> = new Map();
  private unreliableConnections: Map<string, DataConnection> = new Map();
  private hostReliableConn: DataConnection | null = null;
  private hostUnreliableConn: DataConnection | null = null;
  /** peer id -> game player id */
  private connectionPlayerIds: Map<string, string> = new Map();
  /** players that dropped mid-match -> the slot they held (for rejoin) */
  private departedPlayers: Map<string, 1 | 2 | 3 | 4> = new Map();
  private peerRtt: Map<string, number> = new Map();
  private sessionId = 0;
  private lastAppearance: PlayerAppearance | null = null;

  // Timers
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private joinTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionRetryCount = 0;
  private reconnectAttempts = 0;
  private lastPacketReceivedTime: number = Date.now();
  private hasJoinedRoom = false;
  private lastSnapshotTime = 0;

  // Sequence tracking
  private snapshotSeq: number = 0;
  private inputSeq: number = 0;
  private ackedInputSeq: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  private inputHistory: ClientInputPacket[] = [];

  // Snapshot interpolation buffer + host clock estimation (derived from snapshots themselves)
  private snapshotBuffer: CompactSnapshot[] = [];
  private snapshotReceivedAt: number[] = [];
  private clockSamples: number[] = [];
  private hostClockOffset: number | null = null;
  private adaptiveBufferDelayMs: number = 90;

  // Metrics (F4 overlay)
  private snapshotsReceivedLastSecond: number = 0;
  private lastRateCheckTime: number = typeof performance !== 'undefined' ? performance.now() : 0;
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

  // ==========================================
  // LOBBY SETUP
  // ==========================================

  private createBotAppearance(base: PlayerAppearance, slot: 2 | 3 | 4): PlayerAppearance {
    return { ...base, ...BOT_TEMPLATES[slot] } as PlayerAppearance;
  }

  /**
   * Initialize lobby slots based on mode (1v1: 2 slots, 2v2: 4 slots)
   */
  private createInitialSlots(hostAppearance: PlayerAppearance, mode: '1v1' | '2v2'): LobbySlot[] {
    const makeBot = (slot: 2 | 3 | 4, side: Side, team: 'blue' | 'red', zone: 'left' | 'right'): LobbySlot => {
      const appearance = this.createBotAppearance(hostAppearance, slot);
      return {
        slot,
        side,
        team,
        zone,
        playerId: null,
        playerName: `${appearance.name} (Bot)`,
        appearance,
        isBot: true,
        isReady: true,
        isHost: false,
        ping: 0,
      };
    };

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

    if (mode === '1v1') {
      return [s1, makeBot(2, 'north', 'red', 'left')];
    }
    return [
      s1,
      makeBot(2, 'north', 'red', 'left'),
      makeBot(3, 'south', 'blue', 'right'),
      makeBot(4, 'north', 'red', 'right'),
    ];
  }

  /**
   * Set or update RoomConfig from host
   */
  public updateRoomConfig(partial: Partial<RoomConfig>) {
    if (!this.isHost) return;
    const oldMode = this.roomConfig.mode;
    this.roomConfig = { ...this.roomConfig, ...partial };

    // If mode changed (1v1 <-> 2v2), rebuild slots but keep connected humans seated.
    if (partial.mode && partial.mode !== oldMode) {
      const previous = this.slots;
      const hostSlot = previous.find((s) => s.isHost) || previous[0];
      const hostApp = hostSlot?.appearance || ({ name: 'Player 1' } as PlayerAppearance);
      this.slots = this.createInitialSlots(hostApp, partial.mode);

      const humans = previous.filter((s) => s.playerId && !s.isHost);
      humans.forEach((human) => {
        const target = this.slots.find((s) => s.playerId === null);
        if (target) {
          target.playerId = human.playerId;
          target.playerName = human.playerName;
          target.appearance = human.appearance;
          target.isBot = false;
          target.isReady = human.isReady;
          target.ping = human.ping;
        } else {
          // No seat left (2v2 -> 1v1): tell the player and drop them.
          const peerId = this.findPeerForPlayer(human.playerId!);
          if (peerId) {
            this.sendReliableMessage(
              { type: 'kicked', reason: 'The host switched to 1v1 and the room is now full.' },
              peerId
            );
          }
        }
      });
    }

    this.broadcastLobbyState();
  }

  /**
   * Host creates a new room with a clean 5-character code
   */
  public createRoom(
    roomCode: string,
    appearance: PlayerAppearance,
    mode: '1v1' | '2v2' = '2v2',
    options: { isPublic?: boolean } = {}
  ) {
    this.disconnect(true);
    const session = ++this.sessionId;
    this.currentRoomId = roomCode.toUpperCase().trim();
    this.isHost = true;
    this.isInMatch = false;
    this.isPublicRoom = !!options.isPublic;
    this.mySlot = 1;
    this.mySide = 'south';
    this.roomConfig = { ...this.roomConfig, mode };
    this.slots = this.createInitialSlots(appearance, mode);
    this.lastAppearance = appearance;

    this.callbacks.onConnectionStatusChanged?.('connecting');
    this.callbacks.onLobbyUpdated?.(this.slots, true, 1, this.roomConfig);
    void this.initTransports(true, this.currentRoomId, appearance, session);
  }

  /**
   * Client joins an existing room by code
   */
  public joinRoom(roomCode: string, appearance: PlayerAppearance) {
    this.disconnect(true);
    const cleanCode = roomCode.toUpperCase().trim();
    if (!/^[A-Z0-9]{4,8}$/.test(cleanCode)) {
      this.failWith('Room codes are 4-8 letters or numbers (e.g. "K7QPA").');
      return;
    }

    const session = ++this.sessionId;
    this.currentRoomId = cleanCode;
    this.isHost = false;
    this.isInMatch = false;
    this.lastAppearance = appearance;
    this.callbacks.onConnectionStatusChanged?.('connecting');

    this.joinTimeoutTimer = setTimeout(() => {
      if (session !== this.sessionId) return;
      if (!this.hasJoinedRoom) {
        this.failWith(
          `Could not reach room "${cleanCode}". Check the code and that the host is still in the lobby.`
        );
      }
    }, 20000);

    void this.initTransports(false, this.currentRoomId, appearance, session);
  }

  /**
   * Quick match: join an open public room for this mode, or host a new public one.
   */
  public async quickMatch(appearance: PlayerAppearance, mode: '1v1' | '2v2' = '2v2') {
    let roomId: string | null = null;
    try {
      const base = this.getHttpBase();
      if (base && typeof fetch !== 'undefined') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${base}/api/quickmatch?mode=${mode}`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const body = await res.json();
          if (typeof body.roomId === 'string') roomId = body.roomId;
        }
      }
    } catch {
      roomId = null;
    }

    if (roomId) {
      this.joinRoom(roomId, appearance);
    } else {
      this.createRoom(generateRoomCode(), appearance, mode, { isPublic: true });
    }
    return roomId;
  }

  // ==========================================
  // TRANSPORTS
  // ==========================================

  private getRelayUrl(): string | null {
    const configured = (import.meta as any)?.env?.VITE_RELAY_URL as string | undefined;
    if (configured && configured.trim()) return configured.trim();
    if (typeof window === 'undefined' || !window.location?.host) return null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  private getHttpBase(): string | null {
    const relay = this.getRelayUrl();
    if (!relay) return null;
    try {
      const url = new URL(relay);
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      url.pathname = '';
      url.search = '';
      return url.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  }

  private async initTransports(
    asHost: boolean,
    roomId: string,
    appearance: PlayerAppearance,
    session: number
  ) {
    if (typeof window === 'undefined') return;

    const relayOk = await this.tryRelay(asHost, roomId, appearance, session);
    if (session !== this.sessionId) return;
    if (!relayOk) {
      await this.initPeerJs(asHost, roomId, appearance, session);
    }
    if (session !== this.sessionId) return;
    this.startHeartbeat();
  }

  /**
   * Try the WebSocket relay. Resolves true once the relay socket is open and the room
   * request has been sent (outcome is reported through relay messages), false if no relay
   * server is reachable so the caller can fall back to WebRTC.
   */
  private tryRelay(
    asHost: boolean,
    roomId: string,
    appearance: PlayerAppearance,
    session: number
  ): Promise<boolean> {
    const url = this.getRelayUrl();
    if (!url || typeof WebSocket === 'undefined') return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        resolve(false);
        return;
      }
      ws.binaryType = 'arraybuffer';

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {}
        resolve(false);
      }, RELAY_CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        if (settled || session !== this.sessionId) {
          try {
            ws.close();
          } catch {}
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.relay = ws;
        this.transport = 'relay';
        this.reconnectAttempts = 0;
        this.sendRelayRoomRequest(asHost, roomId, appearance);
        resolve(true);
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(false);
        }
      };

      ws.onclose = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(false);
          return;
        }
        if (this.relay === ws) this.handleRelayClosed(session);
      };

      ws.onmessage = (event) => {
        if (session !== this.sessionId) return;
        this.handleRelayFrame(event.data);
      };
    });
  }

  private sendRelayRoomRequest(asHost: boolean, roomId: string, appearance: PlayerAppearance) {
    if (!this.relay || this.relay.readyState !== WebSocket.OPEN) return;
    if (asHost) {
      this.relay.send(
        JSON.stringify({
          op: 'host',
          room: roomId,
          mode: this.roomConfig.mode,
          isPublic: this.isPublicRoom,
        })
      );
    } else {
      this.relay.send(
        JSON.stringify({
          op: 'join',
          room: roomId,
          meta: { playerId: this.myPlayerId, appearance },
        })
      );
    }
  }

  private handleRelayFrame(raw: unknown) {
    this.lastPacketReceivedTime = Date.now();
    if (typeof raw !== 'string') {
      if (!this.isHost) {
        this.handleIncomingRawMessage(raw, 'host');
        return;
      }
      // Host: the relay prefixes client frames with the sender's peer id.
      const bytes = new Uint8Array(raw as ArrayBuffer);
      if (bytes.length < 2 || bytes[0] !== 0xff) return;
      const idLength = bytes[1];
      if (bytes.length < 2 + idLength) return;
      const peerId = new TextDecoder().decode(bytes.subarray(2, 2 + idLength));
      this.handleIncomingRawMessage(bytes.subarray(2 + idLength), peerId);
      return;
    }

    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.op) {
      case 'hosted': {
        this.relayPeerId = msg.peer;
        this.isConnected = true;
        this.callbacks.onConnectionStatusChanged?.('connected');
        this.broadcastLobbyState();
        break;
      }
      case 'joined': {
        this.relayPeerId = msg.peer;
        // Wait for the host's join_response before reporting "connected".
        break;
      }
      case 'peer_join': {
        if (!this.isHost) return;
        const meta = msg.meta || {};
        if (typeof meta.playerId !== 'string') return;
        this.handleClientJoinRequest(
          meta.playerId,
          (meta.appearance as PlayerAppearance) || this.lastAppearance!,
          msg.peer
        );
        break;
      }
      case 'peer_leave': {
        if (!this.isHost) return;
        this.handlePeerLeft(msg.peer);
        break;
      }
      case 'host_left': {
        this.handleHostGone('The host left the room.');
        break;
      }
      case 'msg': {
        this.handleIncomingRawMessage(msg.data, msg.from);
        break;
      }
      case 'error': {
        this.failWith(msg.message || 'Connection error.');
        break;
      }
    }
  }

  private handleRelayClosed(session: number) {
    this.relay = null;
    if (session !== this.sessionId || !this.currentRoomId) return;

    const roomId = this.currentRoomId;
    const appearance = this.lastAppearance;
    const wasHost = this.isHost;

    if (wasHost) {
      // Host cannot transparently recover the room (clients were dropped by the server).
      this.isConnected = false;
      this.failWith('Lost connection to the game server. Create a new room to keep playing online.');
      return;
    }

    this.isConnected = false;
    this.hasJoinedRoom = false;
    if (this.reconnectAttempts >= 4 || !appearance) {
      this.failWith('Lost connection to the game server.');
      this.callbacks.onHostDisconnected?.();
      return;
    }

    this.reconnectAttempts++;
    this.callbacks.onConnectionStatusChanged?.('reconnecting', 'Connection dropped. Reconnecting...');
    const delay = 600 * this.reconnectAttempts;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (session !== this.sessionId) return;
      void this.tryRelay(false, roomId, appearance, session).then((ok) => {
        if (!ok && session === this.sessionId) this.handleRelayClosed(session);
      });
    }, delay);
  }

  private getIceServers(): RTCIceServer[] {
    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
        username: 'peerjs',
        credential: 'peerjsp',
      },
    ];
    return iceServers;
  }

  private async getConfiguredIceServers(): Promise<RTCIceServer[]> {
    const iceServers = this.getIceServers();
    const credentialsUrl = ((import.meta as any)?.env?.VITE_TURN_CREDENTIALS_URL || '').trim();
    if (!credentialsUrl || typeof fetch === 'undefined') return iceServers;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(credentialsUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`TURN credentials request failed (${response.status})`);
      const payload = await response.json();
      const configured = Array.isArray(payload) ? payload : payload.iceServers;
      if (Array.isArray(configured)) iceServers.push(...configured);
    } catch (error) {
      console.warn('TURN credentials unavailable; continuing with default ICE servers:', error);
    }
    return iceServers;
  }

  private async initPeerJs(
    asHost: boolean,
    roomId: string,
    appearance: PlayerAppearance,
    session: number
  ) {
    try {
      const PeerCtor = (Peer as any)?.default || (Peer as any)?.Peer || Peer;
      const hasWebRTC = typeof (window as any).RTCPeerConnection !== 'undefined';
      if (typeof PeerCtor !== 'function' || !hasWebRTC) {
        this.failWith('Online play needs the Padel Pals server or a browser with WebRTC support.');
        return;
      }

      const iceServers = await this.getConfiguredIceServers();
      if (session !== this.sessionId) return;

      // Only the host needs a stable discoverable ID.
      const peerId = asHost ? `padelpals-${roomId.toLowerCase()}` : undefined;
      const peer: Peer = new PeerCtor(peerId, { debug: 0, config: { iceServers } });
      this.peer = peer;
      this.transport = 'webrtc';

      peer.on('open', () => {
        if (session !== this.sessionId) return;
        if (asHost) {
          this.isConnected = true;
          this.callbacks.onConnectionStatusChanged?.('connected');
          this.broadcastLobbyState();
        } else {
          this.connectToHost(peer, roomId, appearance);
        }
      });

      peer.on('connection', (conn: DataConnection) => {
        this.setupConnection(conn, appearance, conn.label !== 'unreliable');
      });

      peer.on('error', (err: any) => {
        if (session !== this.sessionId) return;
        if (asHost && err.type === 'unavailable-id') {
          this.isConnected = false;
          this.failWith(`Room code "${roomId}" is already in use. Choose a new room code.`);
          return;
        }
        if (err.type === 'peer-unavailable' && !asHost) {
          this.callbacks.onConnectionStatusChanged?.(
            'reconnecting',
            `Room "${roomId}" is not online yet. Retrying...`
          );
          this.scheduleHostRetry(roomId, appearance);
          return;
        }
        this.callbacks.onConnectionStatusChanged?.('disconnected', this.getPeerErrorMessage(err));
      });

      peer.on('disconnected', () => {
        if (session !== this.sessionId) return;
        // Signaling dropped; existing data channels keep working, so just try to reconnect.
        try {
          peer.reconnect();
        } catch {}
      });
    } catch (e) {
      console.warn('PeerJS initialization failed:', e);
      this.failWith('Could not start an online session in this browser.');
    }
  }

  private getPeerErrorMessage(err: any): string {
    const type = err?.type || 'unknown error';
    if (['network', 'webrtc', 'socket-error', 'socket-closed', 'server-error'].includes(type)) {
      return 'Could not reach the matchmaking service. Check your connection and try again.';
    }
    return `Peer connection failed (${type}). Check the network or firewall and try again.`;
  }

  private connectToHost(peer: Peer, roomId: string, appearance: PlayerAppearance) {
    const hostPeerId = `padelpals-${roomId.toLowerCase()}`;
    const relConn = peer.connect(hostPeerId, {
      reliable: true,
      label: 'reliable',
      metadata: { playerId: this.myPlayerId, appearance },
    });
    this.hostReliableConn = relConn;
    this.setupConnection(relConn, appearance, true);

    relConn.on('open', () => {
      if (this.hostUnreliableConn || !this.peer) return;
      const unrelConn = this.peer.connect(hostPeerId, {
        reliable: false,
        label: 'unreliable',
        metadata: { playerId: this.myPlayerId },
      });
      this.hostUnreliableConn = unrelConn;
      this.setupConnection(unrelConn, appearance, false);
    });
  }

  private scheduleHostRetry(roomId: string, appearance: PlayerAppearance) {
    if (this.connectionRetryTimer || this.connectionRetryCount >= 12 || !this.peer) return;
    this.connectionRetryCount++;
    this.connectionRetryTimer = setTimeout(() => {
      this.connectionRetryTimer = null;
      if (!this.hasJoinedRoom && this.peer) {
        this.connectToHost(this.peer, roomId, appearance);
      }
    }, 1200);
  }

  private setupConnection(conn: DataConnection, appearance: PlayerAppearance, isReliable: boolean) {
    conn.on('open', () => {
      this.lastPacketReceivedTime = Date.now();
      if (isReliable) this.reliableConnections.set(conn.peer, conn);
      else this.unreliableConnections.set(conn.peer, conn);

      if (!this.isHost) {
        if (isReliable) this.hostReliableConn = conn;
        else this.hostUnreliableConn = conn;
      } else if (isReliable && conn.metadata?.playerId) {
        const remoteAppearance = conn.metadata.appearance as PlayerAppearance | undefined;
        this.handleClientJoinRequest(conn.metadata.playerId, remoteAppearance || appearance, conn.peer);
      }
    });

    conn.on('data', (data: any) => {
      this.handleIncomingRawMessage(data, this.isHost ? conn.peer : 'host');
    });

    conn.on('error', () => {
      if (!this.isHost && conn === this.hostReliableConn && !this.hasJoinedRoom) {
        this.scheduleHostRetry(this.currentRoomId || '', appearance);
      }
    });

    conn.on('close', () => {
      this.reliableConnections.delete(conn.peer);
      this.unreliableConnections.delete(conn.peer);
      if (this.isHost && isReliable) {
        this.handlePeerLeft(conn.peer);
      }
      if (!this.isHost && conn === this.hostReliableConn) {
        this.handleHostGone('Lost connection to the host.');
      }
    });
  }

  private findPeerForPlayer(playerId: string): string | null {
    for (const [peerId, pid] of this.connectionPlayerIds.entries()) {
      if (pid === playerId) return peerId;
    }
    return null;
  }

  /** Tear down, then report a terminal error (so listeners see the cleared room state). */
  private failWith(message: string) {
    this.disconnect(true);
    this.callbacks.onConnectionStatusChanged?.('disconnected', message);
  }

  private handleHostGone(message: string) {
    const wasJoined = this.hasJoinedRoom || this.isInMatch;
    this.isConnected = false;
    this.hasJoinedRoom = false;
    this.isInMatch = false;
    this.failWith(message);
    if (wasJoined) this.callbacks.onHostDisconnected?.();
  }

  /** Host: a client's connection dropped. */
  private handlePeerLeft(peerId: string) {
    const playerId = this.connectionPlayerIds.get(peerId);
    this.peerRtt.delete(peerId);
    if (!playerId) return;
    this.connectionPlayerIds.delete(peerId);
    const slot = this.slots.find((candidate) => candidate.playerId === playerId);
    if (!slot) return;

    if (this.isInMatch && this.roomConfig.onClientLeave === 'end_match') {
      this.isInMatch = false;
      const reason = `${slot.playerName} disconnected`;
      this.sendReliableMessage({ type: 'match_ended', reason });
      this.callbacks.onMatchEnded?.(reason);
    }

    if (this.isInMatch) this.departedPlayers.set(playerId, slot.slot);
    slot.playerId = null;
    slot.isBot = true;
    slot.isReady = true;
    slot.ping = 0;
    slot.playerName = `${slot.appearance.name} (Bot)`;
    this.broadcastLobbyState();
  }

  // ==========================================
  // HEARTBEAT
  // ==========================================

  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    this.heartbeatInterval = setInterval(() => {
      const now = performance.now();

      if (this.isConnected || this.hasJoinedRoom) {
        this.sendReliableMessage({ type: 'ping', from: this.myPlayerId, t0: now });
      }

      // Snapshot rate / loss stats
      const elapsed = (now - this.lastRateCheckTime) / 1000;
      if (elapsed >= 1.0) {
        this.currentSnapshotRateHz = Math.round(this.snapshotsReceivedLastSecond / elapsed);
        this.snapshotsReceivedLastSecond = 0;
        this.lastRateCheckTime = now;
        if (this.totalSnapCount > 0) {
          this.currentPacketLossPercent = Math.min(100, (this.lostSnapCount / this.totalSnapCount) * 100);
        }
        this.callbacks.onStatsUpdated?.({
          snapshotRateHz: this.currentSnapshotRateHz,
          packetLossPercent: this.currentPacketLossPercent,
        });
      }

      // Client watchdog: host silent for too long
      if (!this.isHost && this.hasJoinedRoom) {
        const silentFor = Date.now() - this.lastPacketReceivedTime;
        if (silentFor > 8000) {
          this.handleHostGone('The host stopped responding.');
        } else if (silentFor > 3500) {
          this.callbacks.onConnectionStatusChanged?.('reconnecting', 'Waiting for the host...');
        }
      }

      // Host: advertise whether quick match players may join
      if (this.isHost) this.sendRelayStatus();
    }, 1000);
  }

  private sendRelayStatus() {
    if (!this.relay || this.relay.readyState !== WebSocket.OPEN || !this.isHost) return;
    const hasSeat = this.slots.some((s) => !s.playerId);
    this.relay.send(
      JSON.stringify({ op: 'status', open: !this.isInMatch && hasSeat, mode: this.roomConfig.mode })
    );
  }

  // ==========================================
  // SENDING
  // ==========================================

  private withSimulatedNetwork(deliver: () => void) {
    if (this.simulatedPacketLossRate > 0 && Math.random() < this.simulatedPacketLossRate) return;
    if (this.simulatedLatencyMs > 0) {
      const jitter = (Math.random() - 0.5) * 20;
      setTimeout(deliver, Math.max(5, this.simulatedLatencyMs + jitter));
    } else {
      deliver();
    }
  }

  /**
   * Send reliable message (lobby, events, rules, start).
   * Host: to `targetPeer` or every client. Client: always to the host.
   */
  public sendReliableMessage(msg: any, targetPeer?: string) {
    const deliver = () => {
      if (this.transport === 'relay') {
        if (!this.relay || this.relay.readyState !== WebSocket.OPEN) return;
        const envelope: Record<string, unknown> = { op: 'msg', data: msg };
        if (this.isHost && targetPeer) envelope.to = targetPeer;
        this.relay.send(JSON.stringify(envelope));
        return;
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
      } else if (this.hostReliableConn?.open) {
        this.hostReliableConn.send(msg);
      }
    };

    // Lobby/control traffic is never artificially dropped; only delayed.
    if (this.simulatedLatencyMs > 0) {
      setTimeout(deliver, this.simulatedLatencyMs);
    } else {
      deliver();
    }
  }

  /**
   * Send binary packet (inputs and snapshots). Host: every client. Client: host.
   */
  private sendUnreliablePacket(data: Uint8Array) {
    // Encoders reuse a shared buffer, so copy before any async delivery.
    const bytes = data.slice();
    this.withSimulatedNetwork(() => {
      if (this.transport === 'relay') {
        if (this.relay?.readyState === WebSocket.OPEN) this.relay.send(bytes);
        return;
      }

      if (this.isHost) {
        this.reliableConnections.forEach((rel, peerId) => {
          const unrel = this.unreliableConnections.get(peerId);
          if (unrel?.open) unrel.send(bytes);
          else if (rel.open) rel.send(bytes);
        });
      } else if (this.hostUnreliableConn?.open) {
        this.hostUnreliableConn.send(bytes);
      } else if (this.hostReliableConn?.open) {
        this.hostReliableConn.send(bytes);
      }
    });
  }

  // ==========================================
  // RECEIVING
  // ==========================================

  private handleIncomingRawMessage(data: any, sourcePeer?: string) {
    this.lastPacketReceivedTime = Date.now();

    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const bytes =
        data instanceof Uint8Array
          ? data
          : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength);
      if (bytes.length < 2) return;
      const magic = bytes[0] | (bytes[1] << 8);

      if (magic === BINARY_SNAPSHOT_MAGIC) {
        if (this.isHost) return;
        const snapshot = decodeBinarySnapshot(bytes);
        if (snapshot) this.handleDecodedSnapshot(snapshot);
        return;
      }

      if (magic === BINARY_INPUT_MAGIC) {
        if (!this.isHost) return;
        const decoded = decodeBinaryInputs(bytes);
        if (decoded && decoded.inputs.length > 0) {
          // Ignore spoofed slots: a peer may only drive the slot its player holds.
          const playerId = sourcePeer ? this.connectionPlayerIds.get(sourcePeer) : undefined;
          const owner = this.slots.find((s) => s.slot === decoded.slot);
          if (!playerId || owner?.playerId !== playerId) return;
          const latest = decoded.inputs[0];
          if (latest.seq <= (this.ackedInputSeq[decoded.slot] || 0) && latest.seq > 100) return;
          this.ackedInputSeq[decoded.slot] = latest.seq;
          this.callbacks.onClientInputReceived?.(`slot_${decoded.slot}`, decoded.slot, latest);
        }
        return;
      }
      return;
    }

    if (!data || typeof data !== 'object') return;
    if (data.from && data.from === this.myPlayerId) return;

    switch (data.type) {
      case 'join_response': {
        if (this.isHost) return;
        if (data.accepted) {
          if (this.joinTimeoutTimer) clearTimeout(this.joinTimeoutTimer);
          if (this.connectionRetryTimer) clearTimeout(this.connectionRetryTimer);
          this.joinTimeoutTimer = null;
          this.connectionRetryTimer = null;
          this.connectionRetryCount = 0;
          this.reconnectAttempts = 0;
          this.hasJoinedRoom = true;
          this.isConnected = true;
          if (data.config) this.roomConfig = data.config;
          if (data.slots) this.slots = data.slots;
          if (data.assignedSlot) this.mySlot = data.assignedSlot;
          const found = this.slots.find((s) => s.slot === this.mySlot);
          if (found) this.mySide = found.side;
          this.callbacks.onConnectionStatusChanged?.('connected');
          this.callbacks.onLobbyUpdated?.(this.slots, false, this.mySlot, this.roomConfig);
          if (data.matchInProgress) {
            this.isInMatch = true;
            this.callbacks.onMatchStarted?.(this.roomConfig, this.slots, 'south', data.seed || 1, true);
            if (data.score) this.callbacks.onScoreReceived?.(data.score);
          }
        } else {
          this.failWith(data.error || 'Could not join room');
        }
        break;
      }
      case 'lobby_state': {
        if (this.isHost) return;
        if (data.config) this.roomConfig = data.config;
        if (Array.isArray(data.slots)) this.slots = data.slots;
        const found = this.slots.find((s) => s.playerId === this.myPlayerId);
        if (found) {
          this.mySlot = found.slot;
          this.mySide = found.side;
        }
        this.callbacks.onLobbyUpdated?.(this.slots, false, this.mySlot, this.roomConfig);
        break;
      }
      case 'kicked': {
        if (this.isHost) return;
        this.failWith(data.reason || 'Removed from the room.');
        break;
      }
      case 'slot_change_request': {
        if (!this.isHost) return;
        const playerId = sourcePeer ? this.connectionPlayerIds.get(sourcePeer) : data.playerId;
        if (playerId) this.handleSlotChangeRequest(playerId, data.targetSlot);
        break;
      }
      case 'toggle_ready_request': {
        if (!this.isHost) return;
        const playerId = sourcePeer ? this.connectionPlayerIds.get(sourcePeer) : data.playerId;
        const slot = this.slots.find((s) => s.playerId === playerId);
        if (slot) {
          slot.isReady = !slot.isReady;
          this.broadcastLobbyState();
        }
        break;
      }
      case 'start_match': {
        if (this.isHost) return;
        this.isInMatch = true;
        if (data.config) this.roomConfig = data.config;
        if (data.slots) this.slots = data.slots;
        const found = this.slots.find((s) => s.playerId === this.myPlayerId);
        if (found) {
          this.mySlot = found.slot;
          this.mySide = found.side;
        }
        this.snapshotBuffer = [];
        this.snapshotReceivedAt = [];
        this.callbacks.onMatchStarted?.(this.roomConfig, this.slots, data.servingSide || 'south', data.seed || 12345);
        break;
      }
      case 'swing': {
        if (!this.isHost) return;
        const playerId = sourcePeer ? this.connectionPlayerIds.get(sourcePeer) : undefined;
        const owner = this.slots.find((s) => s.slot === data.swing?.slot);
        if (!data.swing || !playerId || owner?.playerId !== playerId) return;
        const rtt = sourcePeer ? this.peerRtt.get(sourcePeer) ?? 80 : 80;
        this.callbacks.onRemoteSwing?.(data.swing as RemoteSwing, rtt);
        break;
      }
      case 'score': {
        if (this.isHost) return;
        if (data.score) this.callbacks.onScoreReceived?.(data.score);
        break;
      }
      case 'point_scored': {
        if (this.isHost) return;
        this.callbacks.onPointScoredReceived?.(data.winner, data.scoreState, data.event);
        break;
      }
      case 'point_reset': {
        if (this.isHost) return;
        this.callbacks.onPointResetReceived?.();
        break;
      }
      case 'fx': {
        if (this.isHost) return;
        if (data.fx) this.callbacks.onFxReceived?.(data.fx as MatchFx);
        break;
      }
      case 'match_ended': {
        if (this.isHost) return;
        this.isInMatch = false;
        this.callbacks.onMatchEnded?.(data.reason || 'The match ended.');
        break;
      }
      case 'return_to_lobby': {
        if (this.isHost) return;
        this.isInMatch = false;
        this.callbacks.onMatchEnded?.('');
        this.callbacks.onLobbyUpdated?.(this.slots, false, this.mySlot, this.roomConfig);
        break;
      }
      case 'ping': {
        // Reply only to the sender.
        this.sendReliableMessage(
          { type: 'pong', for: data.from, t0: data.t0, tServer: performance.now() },
          this.isHost ? sourcePeer : undefined
        );
        break;
      }
      case 'pong': {
        if (data.for !== this.myPlayerId) return;
        const rtt = Math.max(1, performance.now() - data.t0);
        if (this.isHost && sourcePeer) {
          this.peerRtt.set(sourcePeer, rtt);
          const playerId = this.connectionPlayerIds.get(sourcePeer);
          const slot = this.slots.find((s) => s.playerId === playerId);
          const newPing = Math.round(rtt / 2);
          const changed = !!slot && Math.abs(slot.ping - newPing) >= 15;
          if (slot) slot.ping = newPing;
          const worst = Math.max(0, ...Array.from(this.peerRtt.values()));
          this.pingMs = Math.round(worst / 2);
          if (changed && !this.isInMatch) this.broadcastLobbyState();
        } else {
          this.pingMs = Math.round(rtt / 2);
          this.adaptiveBufferDelayMs = Math.max(70, Math.min(180, 2 * SNAPSHOT_INTERVAL_MS + this.getJitterMs()));
        }
        this.callbacks.onPingUpdated?.(this.pingMs);
        break;
      }
      case 'host_leave': {
        if (this.isHost) return;
        this.handleHostGone('The host left the room.');
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
    if (snapshot.seq < this.expectedSnapSeq - 1) return; // stale/out-of-order
    this.expectedSnapSeq = snapshot.seq + 1;

    this.addSnapshotToBuffer(snapshot);
    this.callbacks.onSnapshotReceived?.(snapshot);
  }

  // ==========================================
  // HOST: JOIN / SLOT MANAGEMENT
  // ==========================================

  /**
   * Process client join request on Host
   */
  private handleClientJoinRequest(playerId: string, appearance: PlayerAppearance, sourcePeer?: string) {
    // Duplicate request from a player that is already seated (e.g. reconnect on another channel)
    const seated = this.slots.find((slot) => slot.playerId === playerId);
    if (seated) {
      if (sourcePeer) this.connectionPlayerIds.set(sourcePeer, playerId);
      this.sendReliableMessage(
        {
          type: 'join_response',
          accepted: true,
          assignedSlot: seated.slot,
          config: this.roomConfig,
          slots: this.slots,
          matchInProgress: this.isInMatch,
        },
        sourcePeer
      );
      return;
    }

    let target: LobbySlot | undefined;
    if (this.isInMatch) {
      // Only players who dropped out of this match may come back, into their old seat.
      const previousSlot = this.departedPlayers.get(playerId);
      target = previousSlot ? this.slots.find((s) => s.slot === previousSlot && !s.playerId) : undefined;
      if (!target) {
        this.sendReliableMessage(
          {
            type: 'join_response',
            accepted: false,
            error: `A match is already in progress in room ${this.currentRoomId}.`,
          },
          sourcePeer
        );
        return;
      }
      this.departedPlayers.delete(playerId);
    } else {
      target = this.slots.find((s) => s.playerId === null && !s.isBot) || this.slots.find((s) => s.playerId === null);
    }

    if (!target) {
      this.sendReliableMessage(
        {
          type: 'join_response',
          accepted: false,
          error: `Room ${this.currentRoomId} is full.`,
        },
        sourcePeer
      );
      return;
    }

    const safeAppearance: PlayerAppearance = { ...(this.lastAppearance || ({} as PlayerAppearance)), ...appearance };
    target.playerId = playerId;
    target.playerName = (safeAppearance.name || `Player ${target.slot}`).slice(0, 16);
    target.appearance = safeAppearance;
    target.isBot = false;
    target.isReady = this.isInMatch;
    target.isHost = false;

    if (sourcePeer) this.connectionPlayerIds.set(sourcePeer, playerId);

    this.sendReliableMessage(
      {
        type: 'join_response',
        accepted: true,
        assignedSlot: target.slot,
        config: this.roomConfig,
        slots: this.slots,
        matchInProgress: this.isInMatch,
      },
      sourcePeer
    );
    this.broadcastLobbyState();
  }

  private handleSlotChangeRequest(playerId: string, targetSlot: 1 | 2 | 3 | 4) {
    if (this.isInMatch) return;
    const current = this.slots.find((s) => s.playerId === playerId);
    const target = this.slots.find((s) => s.slot === targetSlot);
    if (!current || !target || current === target) return;
    if (target.playerId && target.playerId !== playerId) return;

    // The host always simulates slot 1 locally, so slot 1 cannot be taken by clients.
    if (target.slot === 1 || current.isHost) return;

    target.playerId = current.playerId;
    target.playerName = current.playerName;
    target.appearance = current.appearance;
    target.isBot = false;
    target.isReady = false;
    target.isHost = current.isHost;
    target.ping = current.ping;

    const vacatedAppearance = this.createBotAppearance(current.appearance, current.slot as 2 | 3 | 4);
    current.playerId = null;
    current.isBot = true;
    current.isReady = true;
    current.isHost = false;
    current.ping = 0;
    current.appearance = vacatedAppearance;
    current.playerName = `${vacatedAppearance.name} (Bot)`;

    this.broadcastLobbyState();
  }

  public broadcastLobbyState() {
    if (!this.isHost) return;
    this.sendReliableMessage({
      type: 'lobby_state',
      from: this.myPlayerId,
      config: this.roomConfig,
      slots: this.slots,
    });
    this.sendRelayStatus();
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
      this.sendReliableMessage({ type: 'toggle_ready_request', from: this.myPlayerId, playerId: this.myPlayerId });
    }
  }

  public toggleBotSlot(slotNum: 1 | 2 | 3 | 4) {
    if (!this.isHost || this.isInMatch) return;
    const slot = this.slots.find((s) => s.slot === slotNum);
    if (slot && !slot.playerId && slot.slot !== 1) {
      slot.isBot = !slot.isBot;
      slot.isReady = slot.isBot;
      slot.playerName = slot.isBot ? `${slot.appearance.name} (Bot)` : 'Open Slot';
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

  /** Host: can the match start right now? */
  public canStartMatch(): boolean {
    if (!this.isHost) return false;
    return this.slots.every((s) => (s.playerId ? s.isReady || s.isHost : s.isBot));
  }

  public startMatch() {
    if (!this.isHost) return;
    // Any empty seat that isn't a bot is filled by a bot so the match is always playable.
    this.slots.forEach((s) => {
      if (!s.playerId && !s.isBot) {
        s.isBot = true;
        s.isReady = true;
        s.playerName = `${s.appearance.name} (Bot)`;
      }
    });
    this.isInMatch = true;
    this.departedPlayers.clear();
    const seed = Math.floor(Math.random() * 1000000);
    this.sendReliableMessage({
      type: 'start_match',
      from: this.myPlayerId,
      config: this.roomConfig,
      slots: this.slots,
      servingSide: 'south',
      seed,
    });
    this.sendRelayStatus();
    this.callbacks.onMatchStarted?.(this.roomConfig, this.slots, 'south', seed);
  }

  /** Host: leave the match but keep the room (everyone returns to the lobby). */
  public returnToLobby() {
    if (!this.isHost) return;
    this.isInMatch = false;
    this.departedPlayers.clear();
    this.slots.forEach((s) => {
      if (s.playerId && !s.isHost) s.isReady = false;
    });
    this.sendReliableMessage({ type: 'return_to_lobby', from: this.myPlayerId });
    this.broadcastLobbyState();
  }

  // ==========================================
  // GAMEPLAY NETCODE
  // ==========================================

  /** Estimated host clock (ms) on this machine. */
  public getServerTime(): number {
    const now = performance.now();
    if (this.isHost || this.hostClockOffset === null) return now;
    return now + this.hostClockOffset;
  }

  /**
   * Client: movement input packet (binary, ~60 Hz) with 3-packet history redundancy.
   */
  public sendInput(input: Omit<ClientInputPacket, 'seq' | 'timestamp'>): number {
    if (this.isHost) return 0;
    this.inputSeq = (this.inputSeq + 1) % 65536;
    if (this.inputSeq === 0) this.inputSeq = 1;
    const packet: ClientInputPacket = { ...input, seq: this.inputSeq, timestamp: performance.now() };

    this.inputHistory.unshift(packet);
    if (this.inputHistory.length > 3) this.inputHistory.pop();

    const binary = encodeBinaryInputs(this.mySlot, packet.timestamp, this.inputHistory);
    this.sendUnreliablePacket(binary);
    return this.inputSeq;
  }

  /** Client: swings go over the reliable channel so they are never lost. */
  public sendSwing(swing: Omit<RemoteSwing, 'slot'>) {
    if (this.isHost) return;
    this.sendReliableMessage({ type: 'swing', from: this.myPlayerId, swing: { ...swing, slot: this.mySlot } });
  }

  /**
   * Host broadcasts authoritative snapshot (~30 Hz) using binary DataView encoding.
   */
  public broadcastSnapshot(ball: BallState, players: PlayerState[], score: ScoreState) {
    if (!this.isHost) return;
    this.snapshotSeq++;
    this.lastSnapshotTime = performance.now();

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
      t: this.lastSnapshotTime,
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

    this.sendUnreliablePacket(encodeBinarySnapshot(snapshot));
  }

  public broadcastScore(score: ScoreState) {
    if (!this.isHost || !this.isInMatch) return;
    this.sendReliableMessage({ type: 'score', score });
  }

  public broadcastPointScored(winner: Side, scoreState: ScoreState, event?: PointEvent) {
    if (!this.isHost) return;
    if (event?.matchWon) this.isInMatch = false;
    this.sendReliableMessage({ type: 'point_scored', winner, scoreState, event });
    if (event?.matchWon) this.sendRelayStatus();
  }

  public broadcastPointReset() {
    if (!this.isHost) return;
    this.sendReliableMessage({ type: 'point_reset' });
  }

  public broadcastFx(fx: MatchFx) {
    if (!this.isHost || !this.isInMatch) return;
    this.sendReliableMessage({ type: 'fx', fx });
  }

  // ==========================================
  // INTERPOLATION
  // ==========================================

  private addSnapshotToBuffer(snapshot: CompactSnapshot) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.snapshotBuffer.push(snapshot);
    this.snapshotReceivedAt.push(now);
    if (this.snapshotBuffer.length > 30) {
      this.snapshotBuffer.shift();
      this.snapshotReceivedAt.shift();
    }

    // Host clock offset estimate: the least-delayed sample over the recent window.
    this.clockSamples.push(snapshot.t - now);
    if (this.clockSamples.length > 90) this.clockSamples.shift();
    this.hostClockOffset = Math.max(...this.clockSamples);
    this.adaptiveBufferDelayMs = Math.max(70, Math.min(180, 2 * SNAPSHOT_INTERVAL_MS + this.getJitterMs()));
  }

  private getJitterMs(): number {
    if (this.clockSamples.length < 4) return 30;
    const sorted = [...this.clockSamples].sort((a, b) => a - b);
    const max = sorted[sorted.length - 1];
    const p20 = sorted[Math.floor(sorted.length * 0.2)];
    return Math.min(100, Math.max(0, max - p20));
  }

  /**
   * Interpolate remote player state with smooth extrapolation fallback
   */
  public getInterpolatedPlayer(slot: 1 | 2 | 3 | 4): CompactPlayerSnapshot | null {
    if (this.snapshotBuffer.length === 0) return null;
    const renderTime = this.getServerTime() - this.adaptiveBufferDelayMs;

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
      const deltaT = Math.min(0.1, Math.max(0, (renderTime - s0.t) / 1000));
      return { ...p0, x: p0.x + p0.vx * deltaT, z: p0.z + p0.vz * deltaT };
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
      sp: p1.sp < p0.sp ? p1.sp : p0.sp + (p1.sp - p0.sp) * alpha,
      ss: alpha > 0.5 ? p1.ss : p0.ss,
      st: alpha > 0.5 ? p1.st : p0.st,
    };
  }

  /** Latest authoritative ball snapshot data, if any. */
  public getLatestBallSnapshot(): CompactSnapshot['b'] | null {
    if (this.snapshotBuffer.length === 0) return null;
    return this.snapshotBuffer[this.snapshotBuffer.length - 1].b;
  }

  /**
   * Ball position for clients: extrapolate the latest authoritative state to "now" on the
   * host clock, then blend smoothly (snapping only on large divergence).
   */
  public getSmoothedBall(currentPos: Vector3D, dt: number): Vector3D | null {
    if (this.snapshotBuffer.length === 0) return null;
    const lastIndex = this.snapshotBuffer.length - 1;
    const latest = this.snapshotBuffer[lastIndex];
    const b = latest.b;
    const receivedAt = this.snapshotReceivedAt[lastIndex] ?? performance.now();

    const target: Vector3D = { x: b[0], y: b[1], z: b[2] };
    if (b[6]) {
      const age = Math.min(0.12, Math.max(0, (performance.now() - receivedAt) / 1000));
      target.x += b[3] * age;
      target.z += b[5] * age;
      target.y = Math.max(BALL_RADIUS, b[1] + b[4] * age - 0.5 * GRAVITY * age * age);
    }

    const dist = Math.hypot(target.x - currentPos.x, target.y - currentPos.y, target.z - currentPos.z);
    if (dist > 1.5) return target;

    const blendFactor = Math.min(1.0, dt * 20.0);
    return {
      x: currentPos.x + (target.x - currentPos.x) * blendFactor,
      y: currentPos.y + (target.y - currentPos.y) * blendFactor,
      z: currentPos.z + (target.z - currentPos.z) * blendFactor,
    };
  }

  public getDebugStats() {
    return {
      snapshotRateHz: this.isHost ? (this.isInMatch ? 30 : 0) : this.currentSnapshotRateHz,
      packetLossPercent: this.currentPacketLossPercent,
      bufferHealthMs: Math.round(this.adaptiveBufferDelayMs),
      transport:
        this.transport === 'relay'
          ? 'WebSocket relay (game server)'
          : this.transport === 'webrtc'
          ? 'WebRTC peer-to-peer (PeerJS)'
          : 'Not connected',
    };
  }

  /**
   * Leave the room and tear down every transport.
   * @param silent when true, does not emit a final "disconnected" status (used internally
   *               before starting a new session or after reporting a specific error).
   */
  public disconnect(silent: boolean = false) {
    this.sessionId++;
    if (this.joinTimeoutTimer) clearTimeout(this.joinTimeoutTimer);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.connectionRetryTimer) clearTimeout(this.connectionRetryTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.joinTimeoutTimer = null;
    this.heartbeatInterval = null;
    this.connectionRetryTimer = null;
    this.reconnectTimer = null;

    if (this.isHost && (this.isConnected || this.relay)) {
      try {
        this.sendReliableMessage({ type: 'host_leave' });
      } catch {}
    }

    if (this.relay) {
      const ws = this.relay;
      this.relay = null;
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'leave' }));
        ws.close();
      } catch {}
    }

    this.reliableConnections.forEach((conn) => {
      try {
        conn.close();
      } catch {}
    });
    this.unreliableConnections.forEach((conn) => {
      try {
        conn.close();
      } catch {}
    });
    this.reliableConnections.clear();
    this.unreliableConnections.clear();
    this.connectionPlayerIds.clear();
    this.departedPlayers.clear();
    this.peerRtt.clear();
    this.hostReliableConn = null;
    this.hostUnreliableConn = null;

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    this.transport = null;
    this.relayPeerId = null;
    this.isConnected = false;
    this.isHost = false;
    this.isInMatch = false;
    this.isPublicRoom = false;
    this.hasJoinedRoom = false;
    this.connectionRetryCount = 0;
    this.reconnectAttempts = 0;
    this.snapshotBuffer = [];
    this.snapshotReceivedAt = [];
    this.clockSamples = [];
    this.hostClockOffset = null;
    this.expectedSnapSeq = 0;
    this.lostSnapCount = 0;
    this.totalSnapCount = 0;
    this.ackedInputSeq = { 1: 0, 2: 0, 3: 0, 4: 0 };
    this.inputHistory = [];
    this.currentRoomId = null;
    this.pingMs = 0;
    if (!silent) this.callbacks.onConnectionStatusChanged?.('disconnected');
  }
}
