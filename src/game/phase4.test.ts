import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CameraController } from './camera';
import { padelAudio } from './audio';

test('Index HTML imports Google Fonts Lilita One and Fredoka', () => {
  const indexPath = path.resolve(process.cwd(), 'index.html');
  const content = fs.readFileSync(indexPath, 'utf-8');
  assert.ok(content.includes('Lilita+One'), 'Lilita One font must be loaded in index.html');
  assert.ok(content.includes('Fredoka'), 'Fredoka font must be loaded in index.html');
  assert.ok(content.includes('font-brand'), 'font-brand class must be declared in index.html');
});

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

test('CameraController supports mouse parallax and menu orbit', () => {
  const cameraController = new CameraController(16 / 9);
  assert.strictEqual(typeof cameraController.setMouseParallax, 'function');
  cameraController.setMouseParallax(0.5, -0.3);
  assert.strictEqual(cameraController.mouseParallax.x, 0.5);
  assert.strictEqual(cameraController.mouseParallax.y, -0.3);

  // Update in menu mode
  cameraController.update(0.016, true, { x: 0, y: 0, z: 0 });
  assert.ok(!isNaN(cameraController.camera.position.x));
  assert.ok(!isNaN(cameraController.camera.position.y));
  assert.ok(!isNaN(cameraController.camera.position.z));
});

test('MainMenu component uses zero-pill chunky buttons and 3 big tiles for play', () => {
  const menuPath = path.resolve(process.cwd(), 'src/components/MainMenu.tsx');
  const content = fs.readFileSync(menuPath, 'utf-8');
  assert.ok(content.includes('PLAY ONLINE'), 'Must include PLAY ONLINE tile');
  assert.ok(content.includes('PLAY VS BOTS'), 'Must include PLAY VS BOTS tile');
  assert.ok(content.includes('PRACTICE'), 'Must include PRACTICE tile');
  assert.ok(content.includes('PADEL PALS'), 'Must render PADEL PALS logo');
  assert.ok(content.includes('border-4 border-slate-900'), 'Must use thick 4px borders');
  assert.ok(!content.includes('PRO 1420'), 'Must NOT have PRO 1420 AI label');
  assert.ok(!content.includes('Rank Tier'), 'Must NOT have Rank Tier AI label');
});

test('GameHUD component has minimal top-center scoreboard without giant covering banners', () => {
  const hudPath = path.resolve(process.cwd(), 'src/components/GameHUD.tsx');
  const content = fs.readFileSync(hudPath, 'utf-8');
  assert.ok(content.includes('FIRST TO 6'), 'Scoreboard must display match format');
  assert.ok(content.includes('score.servingSide'), 'Scoreboard must track serving side');
  assert.ok(!content.includes('NEXT SERVE IN 3s'), 'Must remove giant 3s countdown banner');
});
