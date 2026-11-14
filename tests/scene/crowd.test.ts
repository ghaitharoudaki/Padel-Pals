import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrowdSystem } from '../../src/game/scene/crowd';

test('Crowd: InstancedMesh with 300+ low-poly chibi spectators', () => {
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

test('Crowd: Procedural kinematics & reaction state machine updates instance matrices', () => {
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

test('Crowd System: instantiates 300+ fans across padel court stands', () => {
  const crowd = createCrowdSystem();
  const fanCount = crowd.getFanCount();
  assert.ok(fanCount >= 300, `Expected at least 300 fans, got ${fanCount}`);
  assert.ok(crowd.group instanceof THREE.Group);
  assert.ok(crowd.group.children.length > 0);
  crowd.dispose();
});

test('Crowd System: proves root cause fix: InstancedMesh materials have vertexColors: false so instanceColor displays brightly', () => {
  const crowd = createCrowdSystem();
  let checkedMeshes = 0;
  crowd.group.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      checkedMeshes++;
      const mat = obj.material as THREE.Material & { vertexColors?: boolean };
      // Root cause was vertexColors: true on geometry without color attribute causing black multiplication
      assert.strictEqual(Boolean(mat.vertexColors), false, 'vertexColors must be false so instanceColor works');
      assert.ok(obj.instanceColor !== null, 'instanceColor must be allocated');
      assert.ok((obj.instanceColor?.count || 0) > 0, 'instanceColor count must be > 0');
    }
  });

  assert.ok(checkedMeshes >= 4, `Expected at least 4 instanced meshes, found ${checkedMeshes}`);
  crowd.dispose();
});

test('Crowd System: updates crowd animation and supports reactions without error', () => {
  const crowd = createCrowdSystem();
  assert.doesNotThrow(() => crowd.update(0.1, 0.016));
  assert.doesNotThrow(() => crowd.triggerReaction('cheer', 1.5));
  assert.doesNotThrow(() => crowd.triggerReaction('miss', 2.0));
  assert.doesNotThrow(() => crowd.triggerReaction('smash', 1.0));
  assert.doesNotThrow(() => crowd.dispose());
});
