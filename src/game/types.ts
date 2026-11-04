import * as THREE from 'three';

export type GameMode = '1v1' | '2v2' | 'online' | 'practice';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'amateur' | 'pro' | 'legend';
export type ShotType = 'flat' | 'topspin' | 'slice' | 'smash' | 'lob' | 'drop' | 'bajada';
export type Side = 'south' | 'north'; // south = Team Blue (Z > 0), north = Team Red (Z < 0)
export type PlayerRole = 'human' | 'bot';
export type SwingSide = 'forehand' | 'backhand' | 'overhead' | 'serve';
export type HitQuality = 'PERFECT' | 'GOOD' | 'EARLY' | 'LATE' | 'OUT_OF_REACH';
export type CameraPreset = 'broadcast' | 'high' | 'close';
export type MatchLength = '1_game' | '3_games' | '1_set';
export type AimAssist = 'low' | 'medium' | 'high';
export type AimTargetZone =
  | 'left_short'
  | 'center_short'
  | 'right_short'
  | 'left_deep'
  | 'center_deep'
  | 'right_deep';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export type ScreenState =
  | 'BOOT'
  | 'MENU'
  | 'MODE_SELECT'
  | 'LOCKER'
  | 'SETTINGS'
  | 'HOW_TO_PLAY'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'PAUSED'
  | 'POINT_SCORED'
  | 'MATCH_END'
  | 'RESULTS';

export interface BallState {
  position: Vector3D;
  velocity: Vector3D;
  spin: Vector3D; // angular velocity: x = topspin(+)/backspin(-), y = sidespin
  radius: number;
  lastHitter: Side | null;
  bounceCount: number;
  bouncesOnSide: { south: number; north: number };
  bouncedInCourt: boolean;
  bouncedSide: Side | null;
  hitWallBeforeFloor: boolean;
  wallHitCount: number;
  lastWallType: 'glass' | 'fence' | null;
  isServe: boolean;
  serveBoxTarget: 'left' | 'right' | null;
  inPlay: boolean;
  trail: Vector3D[];
}

export type HairStyle = 'spiky' | 'short' | 'long' | 'ponytail' | 'bun' | 'mohawk' | 'curly' | 'bald';
export type EyeType = 'half_lidded' | 'confident' | 'anime' | 'fierce' | 'chill';
export type EyebrowType = 'angled' | 'straight' | 'soft' | 'thick';
export type MouthType = 'smirk' | 'smile' | 'determined' | 'open';
export type HeadwearType = 'none' | 'headband' | 'cap' | 'sweatband';
export type JerseyStyle = 'captain' | 'classic' | 'stripes' | 'split';
export type RacketPattern = 'carbon' | 'clean' | 'lightning' | 'checker' | 'gradient';

export interface PlayerAppearance {
  name: string;
  number: number;
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
  hairSecondaryColor?: string;
  eyeType: EyeType;
  eyebrowType: EyebrowType;
  mouthType: MouthType;
  headwear: HeadwearType;
  headwearColor: string;
  jerseyStyle: JerseyStyle;
  jerseyPrimary: string;
  jerseySecondary: string;
  shortsColor: string;
  shoesColor: string;
  shoesSoleColor: string;
  socksColor: string;
  racketColor: string;
  racketPattern: RacketPattern;
  wristbandColor: string;
  // Backwards compatibility properties
  jerseyColor?: string;
  racketSkin?: string;
}

export type PlayerCustomization = PlayerAppearance;

export const DEFAULT_APPEARANCE: PlayerAppearance = {
  name: 'Kage',
  number: 5,
  skinTone: '#fed7aa',
  hairStyle: 'spiky',
  hairColor: '#d4af37', // Blonde anime hair with darker tips
  hairSecondaryColor: '#451a03',
  eyeType: 'half_lidded',
  eyebrowType: 'angled',
  mouthType: 'smirk',
  headwear: 'none',
  headwearColor: '#dc2626',
  jerseyStyle: 'captain',
  jerseyPrimary: '#dc2626', // Captain uniform #5 red
  jerseySecondary: '#18181b', // Black side stripe
  shortsColor: '#dc2626',
  shoesColor: '#ffffff',
  shoesSoleColor: '#18181b',
  socksColor: '#dc2626',
  racketColor: '#dc2626',
  racketPattern: 'carbon',
  wristbandColor: '#18181b',
  jerseyColor: '#dc2626',
  racketSkin: 'carbon',
};

export interface PlayerState {
  id: string;
  slot: 1 | 2 | 3 | 4;
  name: string;
  role: PlayerRole;
  isBot: boolean;
  side: Side;
  team: 'blue' | 'red';
  zone: 'left' | 'right'; // left (x < 0) or right (x > 0)
  position: Vector3D;
  velocity: Vector3D;
  state: string;
  mesh: THREE.Object3D;
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
  isSprinting: boolean;
  isJumping: boolean;
  jumpY: number;
}

export interface ScoreState {
  games: [number, number]; // [south, north]
  points: [string, string]; // ['0' | '15' | '30' | '40' | 'AD', ...]
  rawPoints: [number, number];
  servingSide: Side;
  serveAttempt: 1 | 2; // 1st or 2nd serve
  rallyCount: number;
  winner: Side | null;
  lastEventDescription: string;
  isTiebreak: boolean;
  tiebreakPoints: [number, number];
  targetGames: number; // 1, 3, or 6
  matchLength: MatchLength;
  goldenPoint: boolean;
  switchedSides: boolean;
}

export interface CourtDimensions {
  length: number; // 20m (Z: -10 to +10)
  width: number;  // 10m (X: -5 to +5)
  netHeight: number; // 0.88m at center
  netPostHeight: number; // 0.92m at posts
  glassBackWallHeight: number; // 4m high
  sideGlassHeight: number; // 3m high
  fenceHeight: number; // 3m high
  glassWallThickness: number;
  serviceLineZ: number; // 6.95m from net
}

export const COURT_CONFIG: CourtDimensions = {
  length: 20,
  width: 10,
  netHeight: 0.88,
  netPostHeight: 0.92,
  glassBackWallHeight: 4.0,
  sideGlassHeight: 3.0,
  fenceHeight: 3.0,
  glassWallThickness: 0.1,
  serviceLineZ: 6.95,
};

export interface PhysicsEvents {
  bouncedFloor: boolean;
  bouncedGlassWall: boolean;
  bouncedMeshWall: boolean;
  hitNet: boolean;
  netTapeHit: boolean;
  netTapeRolledOver: boolean;
  outOfBounds: boolean;
  pointFault: boolean;
  faultWinner?: Side;
  faultReason?: string;
  shortReason?: string;
  isLetServe?: boolean;
  collisionPos?: Vector3D;
  collisionNormal?: Vector3D;
  impactSpeed?: number;
}

export interface PhysicsStepResult {
  ball: BallState;
  events: PhysicsEvents;
}
