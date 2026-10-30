export type GameMode = '1v1' | '2v2' | 'online' | 'practice';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'amateur' | 'pro' | 'legend';
export type ShotType = 'flat' | 'topspin' | 'slice' | 'smash' | 'lob' | 'drop';
export type Side = 'south' | 'north'; // south = Team Blue (Z > 0), north = Team Red (Z < 0)
export type PlayerRole = 'human' | 'bot';
export type SwingSide = 'forehand' | 'backhand' | 'overhead' | 'serve';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface BallState {
  position: Vector3D;
  velocity: Vector3D;
  spin: Vector3D; // rpm / angular velocity: x = topspin/backspin, y = sidespin
  radius: number;
  lastHitter: Side | null;
  bounceCount: number;
  bouncedInCourt: boolean;
  bouncedSide: Side | null;
  hitWallBeforeFloor: boolean;
  inPlay: boolean;
  trail: Vector3D[];
}

export interface PlayerCustomization {
  jerseyColor: string;
  shortsColor: string;
  skinTone: string;
  hairColor: string;
  racketSkin: string; // 'carbon' | 'neon' | 'gold' | 'pro_blue'
  name: string;
}

export interface PlayerState {
  id: string;
  name: string;
  role: PlayerRole;
  side: Side;
  team: 'blue' | 'red';
  zone: 'left' | 'right'; // doubles court half: left (x < 0) or right (x > 0)
  position: Vector3D;
  velocity: Vector3D;
  targetPosition: Vector3D;
  rotationY: number;
  racketRotation: Vector3D;
  racketSwingProgress: number; // 0 to 1
  isSwinging: boolean;
  swingSide: SwingSide;
  currentShotType: ShotType;
  swingPower: number; // 0.2 to 1.0
  isServing: boolean;
  customization: PlayerCustomization;
  score: number; // match games won
  currentPoints: number; // 0, 15, 30, 40
  hasAdvantage: boolean;
}

export interface ScoreState {
  games: [number, number]; // [south (blue), north (red)]
  points: [string, string]; // ['0' | '15' | '30' | '40' | 'AD', ...]
  rawPoints: [number, number]; // numeric counters
  servingSide: Side;
  serveAttempt: 1 | 2; // 1st or 2nd serve
  rallyCount: number;
  winner: Side | null;
  lastEventDescription: string;
}

export interface CourtDimensions {
  length: number; // 20m (Z: -10 to +10)
  width: number;  // 10m (X: -5 to +5)
  netHeight: number; // 0.88m at center, 0.92m at posts
  glassBackWallHeight: number; // 3m or 4m
  glassWallThickness: number;
  serviceLineZ: number; // 6.95m from net
}

export const COURT_CONFIG: CourtDimensions = {
  length: 20,
  width: 10,
  netHeight: 0.88,
  glassBackWallHeight: 3.5,
  glassWallThickness: 0.1,
  serviceLineZ: 6.95,
};

export interface MatchStats {
  totalRallies: number;
  longestRally: number;
  aces: [number, number];
  winners: [number, number];
  unforcedErrors: [number, number];
  smashes: [number, number];
}

export interface MultiplayerMessage {
  type: 'join' | 'joined' | 'player_state' | 'ball_state' | 'point_scored' | 'serve_trigger' | 'room_ready' | 'ping';
  roomId?: string;
  playerId?: string;
  side?: Side;
  playerState?: Partial<PlayerState>;
  ballState?: Partial<BallState>;
  scoreState?: Partial<ScoreState>;
  timestamp?: number;
}

