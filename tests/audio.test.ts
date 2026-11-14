import test from 'node:test';
import { padelAudio, PadelAudioController } from '../src/game/audio';
import assert from 'node:assert/strict';

test('WebAudio Controller provides UI sound effects and volume controls', () => {
  assert.strictEqual(typeof padelAudio.playHoverTick, 'function', 'playHoverTick must exist');
  assert.strictEqual(typeof padelAudio.playClickPop, 'function', 'playClickPop must exist');
  assert.strictEqual(typeof padelAudio.playBackWhoosh, 'function', 'playBackWhoosh must exist');
  assert.strictEqual(typeof padelAudio.startMenuMusic, 'function', 'startMenuMusic must exist');
  assert.strictEqual(typeof padelAudio.stopMenuMusic, 'function', 'stopMenuMusic must exist');
  assert.strictEqual(typeof padelAudio.setSfxVolume, 'function', 'setSfxVolume must exist');
  assert.strictEqual(typeof padelAudio.setMusicVolume, 'function', 'setMusicVolume must exist');

  padelAudio.setSfxVolume(0.8);
  assert.strictEqual(padelAudio.sfxVolume, 0.8);

  padelAudio.setMusicVolume(0.6);
  assert.strictEqual(padelAudio.musicVolume, 0.6);
});

test('Audio: PadelAudioController initializes cleanly and respects volume controls', () => {
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

test('Audio: Procedural audio methods execute without errors in all environments', () => {
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
