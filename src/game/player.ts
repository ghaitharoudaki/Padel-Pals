import * as THREE from 'three';
import { PlayerCustomization, PlayerState, Side, Vector3D } from './types';

export interface PlayerSlotDefinition {
  id: string;
  slot: 1 | 2 | 3 | 4;
  name: string;
  side: Side;
  team: 'blue' | 'red';
  zone: 'left' | 'right';
  isBot: boolean;
  position: Vector3D;
  customization: PlayerCustomization;
}

export function createPlayerState(
  definition: PlayerSlotDefinition,
  customization = definition.customization
): PlayerState {
  const position = { ...definition.position };
  return {
    id: definition.id,
    slot: definition.slot,
    name: definition.name,
    role: definition.isBot ? 'bot' : 'human',
    isBot: definition.isBot,
    side: definition.side,
    team: definition.team,
    zone: definition.zone,
    position,
    velocity: { x: 0, y: 0, z: 0 },
    state: 'Ready',
    mesh: new THREE.Group(),
    targetPosition: { ...position },
    rotationY: definition.side === 'south' ? Math.PI : 0,
    racketRotation: { x: 0, y: 0, z: 0 },
    racketSwingProgress: 0,
    isSwinging: false,
    swingSide: 'forehand',
    currentShotType: 'flat',
    swingPower: 0.65,
    isServing: definition.slot === 1,
    customization,
    score: 0,
    currentPoints: 0,
    hasAdvantage: false,
    isSprinting: false,
    isJumping: false,
    jumpY: 0,
  };
}

export function setPlayerPosition(player: PlayerState, position: Vector3D) {
  player.position = { ...position };
  player.targetPosition = { ...position };
  player.velocity = { x: 0, y: 0, z: 0 };
  player.jumpY = 0;
  player.isJumping = false;
}

/**
 * Kinematic movement with crisp acceleration and deceleration (no ice sliding)
 * Walk: 4.2 m/s, Sprint: 6.0 m/s
 * Strictly limited to player's half of the court.
 */
export function updatePlayerMovement(
  player: PlayerState,
  input: { x: number; z: number; sprint: boolean; jump?: boolean },
  dt: number,
  isDoubles: boolean
) {
  const isSouth = player.side === 'south';

  // Movement physics tuning
  const maxSpeed = input.sprint ? 6.0 : 4.2;
  const accel = 36.0; // Sharp athletic acceleration
  const decel = 32.0; // Crisp stop, eliminates ice sliding

  player.isSprinting = input.sprint;

  // Jump physics (for overhead smashes)
  if (input.jump && !player.isJumping && player.jumpY <= 0.05) {
    player.isJumping = true;
    player.jumpY = 0.75;
  }
  if (player.jumpY > 0) {
    player.jumpY = Math.max(0, player.jumpY - 4.5 * dt);
    if (player.jumpY === 0) player.isJumping = false;
  }

  // Calculate target velocity
  const targetVx = input.x * maxSpeed;
  const targetVz = input.z * maxSpeed;

  const currentVx = player.velocity.x;
  const currentVz = player.velocity.z;

  const rateX = Math.abs(targetVx) > Math.abs(currentVx) ? accel : decel;
  const rateZ = Math.abs(targetVz) > Math.abs(currentVz) ? accel : decel;

  player.velocity.x += (targetVx - currentVx) * Math.min(1, rateX * dt);
  player.velocity.z += (targetVz - currentVz) * Math.min(1, rateZ * dt);

  // Position integration
  player.position.x += player.velocity.x * dt;
  player.position.z += player.velocity.z * dt;
  player.position.y = player.jumpY;

  // Strictly enforce court boundaries and player half
  // Net is at Z = 0. Players cannot cross the net into opponent's half!
  const minX = -4.4;
  const maxX = isDoubles ? (player.zone === 'left' ? 0.4 : 4.4) : 4.4;
  const minXBound = isDoubles ? (player.zone === 'right' ? -0.4 : -4.4) : minX;

  const minZ = isSouth ? 1.0 : -9.4; // 1.0m behind net for South
  const maxZ = isSouth ? 9.4 : -1.0; // 1.0m behind net for North

  player.position.x = Math.max(minXBound, Math.min(maxX, player.position.x));
  player.position.z = Math.max(minZ, Math.min(maxZ, player.position.z));

  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  player.state = player.isJumping ? 'Jumping' : speed > 0.2 ? (input.sprint ? 'Sprinting' : 'Moving') : 'Ready';
}

export function advancePlayer(player: PlayerState, dt: number) {
  const isSouth = player.side === 'south';
  const minX = -4.4;
  const maxX = 4.4;
  const minZ = isSouth ? 1.0 : -9.4;
  const maxZ = isSouth ? 9.4 : -1.0;

  player.position.x = Math.max(minX, Math.min(maxX, player.position.x + player.velocity.x * dt));
  player.position.z = Math.max(minZ, Math.min(maxZ, player.position.z + player.velocity.z * dt));
  player.position.y = player.jumpY;
}

export function getPlayerRoster(players: PlayerState[]): PlayerState[] {
  return players.slice().sort((a, b) => a.slot - b.slot);
}
