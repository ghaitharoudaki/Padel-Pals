import { BallState, PlayerCustomization, PlayerState, ScoreState, Side } from './types';

export interface MultiplayerCallbacks {
  onConnected?: (data: { roomId: string; playerId: string; side: Side; playerCount: number }) => void;
  onPlayerJoined?: (player: { id: string; side: Side; name: string; customization?: PlayerCustomization }) => void;
  onPlayerLeft?: (data: { playerId: string; side: Side }) => void;
  onRemotePlayerState?: (state: Partial<PlayerState>) => void;
  onRemoteBallState?: (ball: Partial<BallState>) => void;
  onRoomReady?: (data: { roomId: string; servingSide: Side }) => void;
  onRemotePointScored?: (data: { winner: Side; scoreState: ScoreState }) => void;
  onDisconnect?: () => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks = {};
  public currentRoomId: string | null = null;
  public mySide: Side = 'south';
  public myPlayerId: string = '';
  public isConnected: boolean = false;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(roomId: string, playerName: string, customization: PlayerCustomization) {
    this.disconnect();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.currentRoomId = roomId;
        this.ws?.send(JSON.stringify({
          type: 'join',
          roomId,
          name: playerName,
          customization,
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'joined':
              this.myPlayerId = msg.playerId;
              this.mySide = msg.side;
              this.callbacks.onConnected?.(msg);
              break;
            case 'player_joined':
              this.callbacks.onPlayerJoined?.(msg.player);
              break;
            case 'player_left':
              this.callbacks.onPlayerLeft?.(msg);
              break;
            case 'player_state':
              this.callbacks.onRemotePlayerState?.(msg.playerState);
              break;
            case 'ball_state':
              this.callbacks.onRemoteBallState?.(msg.ballState);
              break;
            case 'room_ready':
              this.callbacks.onRoomReady?.(msg);
              break;
            case 'point_scored':
              this.callbacks.onRemotePointScored?.(msg);
              break;
          }
        } catch (e) {
          console.error('Error handling WS message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.callbacks.onDisconnect?.();
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket warning/error:', err);
      };
    } catch (e) {
      console.error('WebSocket connection failed:', e);
    }
  }

  public sendPlayerState(state: Partial<PlayerState>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'player_state',
        roomId: this.currentRoomId,
        playerId: this.myPlayerId,
        playerState: state,
        timestamp: Date.now(),
      }));
    }
  }

  public sendBallState(ball: Partial<BallState>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'ball_state',
        roomId: this.currentRoomId,
        playerId: this.myPlayerId,
        ballState: ball,
        timestamp: Date.now(),
      }));
    }
  }

  public sendPointScored(winner: Side, scoreState: ScoreState) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'point_scored',
        roomId: this.currentRoomId,
        winner,
        scoreState,
      }));
    }
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}
