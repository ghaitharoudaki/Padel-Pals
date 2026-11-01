import * as THREE from 'three';
import { PlayerCustomization, PlayerState, Side } from './types';

export interface PlayerSlotDefinition {
  id: string;
  slot: 1 | 2 | 3 | 4;
  name: string;
  side: Side;
  team: 'blue' | 'red';
  zone: 'left' | 'right';
  isBot: boolean;
  position: { x: number; y: number; z: number };
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
  };
}

export function setPlayerPosition(player: PlayerState, position: { x: number; y: number; z: number }) {
  player.position = { ...position };
  player.targetPosition = { ...position };
  player.velocity = { x: 0, y: 0, z: 0 };
}

export function advancePlayer(player: PlayerState, dt: number) {
  const minX = -4.4;
  const maxX = 4.4;
  const minZ = player.side === 'south' ? 1.0 : -9.4;
  const maxZ = player.side === 'south' ? 9.4 : -1.0;
  player.position = {
    x: Math.max(minX, Math.min(maxX, player.position.x + player.velocity.x * dt)),
    y: 0,
    z: Math.max(minZ, Math.min(maxZ, player.position.z + player.velocity.z * dt)),
  };
}

export function getPlayerRoster(players: PlayerState[]): PlayerState[] {
  return players.slice().sort((a, b) => a.slot - b.slot);
}
