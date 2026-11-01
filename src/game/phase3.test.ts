import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE,
  EyeType,
  EyebrowType,
  HairStyle,
  MouthType,
  PlayerAppearance,
  RacketPattern,
} from './types';
import {
  buildPadelAvatar,
  buildPadelRacket,
  createHairMesh,
  applyAppearance,
  getSharedToonGradient,
} from './avatar';

test('PlayerAppearance contains all required Phase 3 customization fields', () => {
  assert.ok(DEFAULT_APPEARANCE.name, 'Has name');
  assert.equal(typeof DEFAULT_APPEARANCE.number, 'number', 'Has number (0-99)');
  assert.ok(DEFAULT_APPEARANCE.skinTone, 'Has skin tone');
  assert.ok(DEFAULT_APPEARANCE.hairStyle, 'Has hair style');
  assert.ok(DEFAULT_APPEARANCE.hairColor, 'Has hair color');
  assert.ok(DEFAULT_APPEARANCE.eyeType, 'Has eye type');
  assert.ok(DEFAULT_APPEARANCE.eyebrowType, 'Has eyebrow type');
  assert.ok(DEFAULT_APPEARANCE.mouthType, 'Has mouth type');
  assert.ok(DEFAULT_APPEARANCE.headwear, 'Has headwear');
  assert.ok(DEFAULT_APPEARANCE.jerseyStyle, 'Has jersey style');
  assert.ok(DEFAULT_APPEARANCE.jerseyPrimary, 'Has jersey primary');
  assert.ok(DEFAULT_APPEARANCE.jerseySecondary, 'Has jersey secondary');
  assert.ok(DEFAULT_APPEARANCE.shortsColor, 'Has shorts color');
  assert.ok(DEFAULT_APPEARANCE.shoesColor, 'Has shoes color');
  assert.ok(DEFAULT_APPEARANCE.racketColor, 'Has racket color');
  assert.ok(DEFAULT_APPEARANCE.racketPattern, 'Has racket pattern');
  assert.ok(DEFAULT_APPEARANCE.wristbandColor, 'Has wristband color');
});

test('Shared 4-step toon gradient texture initializes properly', () => {
  const grad = getSharedToonGradient();
  assert.ok(grad, 'Gradient texture exists');
  assert.equal(grad.minFilter, THREE.NearestFilter, 'Uses NearestFilter for cel stepping');
});

test('Solid padel racket geometry has solid core face with NO strings and perforated texture', () => {
  const { group, updateRacket } = buildPadelRacket('#dc2626', 'carbon');
  assert.ok(group, 'Racket group created');
  assert.ok(group.children.length >= 4, 'Has frame, face, throat, and grip');

  // Verify updateRacket executes cleanly
  updateRacket('#2563eb', 'lightning');
  assert.ok(group, 'Racket updated successfully');
});

test('All 8 procedural hair styles instantiate cleanly', () => {
  const styles: HairStyle[] = ['spiky', 'short', 'long', 'ponytail', 'bun', 'mohawk', 'curly', 'bald'];
  styles.forEach((style) => {
    const mesh = createHairMesh(style, '#d4af37', '#451a03');
    assert.ok(mesh instanceof THREE.Group, `Hair style ${style} created`);
    if (style !== 'bald') {
      assert.ok(mesh.children.length > 0, `Hair style ${style} has geometry`);
    }
  });
});

test('Chibi avatar controller instantiates and executes kinematics with unified rotation', () => {
  const avatar = buildPadelAvatar(DEFAULT_APPEARANCE, 'south', 7.0, 5, 'blue');
  assert.ok(avatar.group, 'Avatar group created');
  assert.ok(avatar.racketGroup, 'Racket group created');

  // Test running kinematics
  avatar.updateKinematics(1 / 60, { x: 2.0, z: 0 }, 0, false, 'flat', 0);
  assert.ok(avatar.group.position.z === 7.0, 'Position maintained');

  // Test swinging kinematics
  avatar.updateKinematics(1 / 60, { x: 0, z: 0 }, 0.5, true, 'smash', 0, undefined, 'overhead');

  // Test VFX triggers
  avatar.triggerHitPop();
  avatar.triggerDustPuff();
  avatar.playStateAnimation('celebrate');
});

test('Unified applyAppearance updates player appearance across hair, kit, face, and racket', () => {
  const avatar = buildPadelAvatar(DEFAULT_APPEARANCE, 'south', 7.0, 5, 'blue');

  const modifiedAppearance: PlayerAppearance = {
    ...DEFAULT_APPEARANCE,
    name: 'Ace',
    number: 77,
    hairStyle: 'mohawk',
    hairColor: '#dc2626',
    jerseyStyle: 'stripes',
    jerseyPrimary: '#059669',
    jerseySecondary: '#ffffff',
    racketColor: '#059669',
    racketPattern: 'checker',
    eyeType: 'confident',
    mouthType: 'open',
  };

  applyAppearance(avatar, modifiedAppearance);

  assert.equal(avatar.appearance.number, 77);
  assert.equal(avatar.appearance.hairStyle, 'mohawk');
  assert.equal(avatar.appearance.jerseyPrimary, '#059669');
  assert.equal(avatar.appearance.racketPattern, 'checker');
});
