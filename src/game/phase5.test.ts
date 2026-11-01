import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrowdSystem } from './crowd';
import { padelAudio, PadelAudioController } from './audio';

test('Phase 5 - Crowd: InstancedMesh with 300+ low-poly chibi spectators', () => {
  const crowd = createCrowdSystem();
  assert.ok(crowd.group, 'Crowd group should exist');
  assert.ok(crowd.getFanCount() >= 300, `Expected >= 300 spectators, got ${crowd.getFanCount()}`);

  // Check that all child meshes are InstancedMeshes
  const instancedMeshes = crowd.group.children.filter((child) => child instanceof THREE.InstancedMesh);
  assert.ok(instancedMeshes.length >= 5, 'Should have separate InstancedMeshes for body, head, hair, left hand, right hand');

  // Verify spectator count across instanced meshes
  const bodyMesh = instancedMeshes[0] as THREE.InstancedMesh;
  assert.strictEqual(bodyMesh.count, crowd.getFanCount(), 'Body mesh instance count matches total fans');

  // Verify vertex colors / instance colors were applied
  assert.ok(bodyMesh.instanceColor, 'Body mesh must have per-instance colors assigned');
  assert.ok(bodyMesh.instanceMatrix, 'Body mesh must have per-instance transform matrices');

  crowd.dispose();
});

test('Phase 5 - Crowd: Procedural kinematics & reaction state machine updates instance matrices', () => {
  const crowd = createCrowdSystem();
  const fanCount = crowd.getFanCount();

  // Test idle update
  crowd.update(0.5, 0.016);

  const instancedMeshes = crowd.group.children.filter((child) => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
  const bodyMesh = instancedMeshes[0];

  const initialMatrix = new THREE.Matrix4();
  bodyMesh.getMatrixAt(0, initialMatrix);
  const elements = initialMatrix.elements;

  // Verify valid non-NaN matrix values
  for (let i = 0; i < 16; i++) {
    assert.ok(!Number.isNaN(elements[i]), `Matrix element ${i} should be a valid number`);
  }

  // Test cheer reaction
  crowd.triggerReaction('cheer', 2.0);
  crowd.update(0.6, 0.016);
  bodyMesh.getMatrixAt(0, initialMatrix);
  assert.ok(!Number.isNaN(initialMatrix.elements[13]), 'Y translation should be valid during cheer');

  // Test smash reaction (hands up in anticipation)
  crowd.triggerReaction('smash', 1.5);
  crowd.update(0.7, 0.016);

  // Test miss reaction (heads in hands on missed shots)
  crowd.triggerReaction('miss', 2.0);
  crowd.update(0.8, 0.016);

  crowd.dispose();
});

test('Phase 5 - Audio: PadelAudioController initializes cleanly and respects volume controls', () => {
  const audio = new PadelAudioController();
  assert.strictEqual(audio.enabled, true);

  audio.setSfxVolume(0.4);
  assert.strictEqual(audio.sfxVolume, 0.4);

  // Clamp checks
  audio.setSfxVolume(-0.5);
  assert.strictEqual(audio.sfxVolume, 0.0);

  audio.setSfxVolume(1.5);
  assert.strictEqual(audio.sfxVolume, 1.0);

  audio.setMusicVolume(0.3);
  assert.strictEqual(audio.musicVolume, 0.3);

  audio.setMusicVolume(-0.2);
  assert.strictEqual(audio.musicVolume, 0.0);

  audio.setMusicVolume(2.0);
  assert.strictEqual(audio.musicVolume, 1.0);
});

test('Phase 5 - Audio: Procedural audio methods execute without errors in all environments', () => {
  const audio = new PadelAudioController();

  // Spatial listener update
  assert.doesNotThrow(() => {
    audio.updateListener({ x: 0, y: 5, z: 12 }, { x: 0, y: -0.3, z: -1 });
  });

  // SFX with 3D positions
  assert.doesNotThrow(() => {
    audio.playRacketHit(0.8, 'smash', 'PERFECT', { x: 0, y: 1.8, z: 3 });
    audio.playRacketHit(0.5, 'flat', 'GOOD', { x: -2, y: 0.9, z: -5 });
    audio.playTurfBounce(6.0, { x: 1, y: 0, z: -3 });
    audio.playGlassRebound(8.5, { x: 4.9, y: 1.2, z: -8 });
    audio.playMeshFenceRebound({ x: -4.9, y: 1.0, z: 2 });
    audio.playNetHit({ x: 0, y: 0.88, z: 0 });
    audio.playFootstep('turf', { x: -1.5, y: 0, z: 6 });
  });

  // Crowd sound synthesis
  assert.doesNotThrow(() => {
    audio.updateRallyTension(4, true);
    audio.updateRallyTension(12, true);
    audio.updateRallyTension(0, false);
    audio.playCrowdCheer(1.2);
    audio.playBigRoar();
    audio.playCrowdOoooh();
    audio.playCrowdGroan();
    audio.playGamePointChant();
    audio.playRefereeWhistle('start');
    audio.playRefereeWhistle('end');
  });
});
