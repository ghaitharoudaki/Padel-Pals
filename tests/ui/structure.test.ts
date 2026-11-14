import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Index HTML imports Google Fonts Lilita One and Fredoka', () => {
  const indexPath = path.resolve(process.cwd(), 'index.html');
  const content = fs.readFileSync(indexPath, 'utf-8');
  assert.ok(content.includes('Lilita+One'), 'Lilita One font must be loaded in index.html');
  assert.ok(content.includes('Fredoka'), 'Fredoka font must be loaded in index.html');
  assert.ok(content.includes('font-brand'), 'font-brand class must be declared in index.html');
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
  assert.ok(content.includes('describeMatchFormat'), 'Scoreboard must display the match format');
  assert.ok(content.includes('score.servingSide'), 'Scoreboard must track serving side');
  assert.ok(!content.includes('NEXT SERVE IN 3s'), 'Must remove giant 3s countdown banner');
});
