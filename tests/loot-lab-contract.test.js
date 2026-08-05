'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('tech-demos/loot-lab/loot-lab.html');
const script = read('tech-demos/loot-lab/loot-lab.js');
const styles = read('tech-demos/loot-lab/loot-lab.css');
const messages = read('tech-demos/demo-i18n.js');

for (const id of ['enemy', 'source', 'drop-multiplier', 'enemy-canvas', 'latest-drop',
  'kill-one', 'kill-ten', 'reset-kills', 'probability-track', 'probability-threshold',
  'probability-roll', 'theoretical-rate', 'observed-rate', 'pity-progress', 'kill-history']) {
  assert.match(html, new RegExp(`id="${id}"`), `Loot Lab exposes #${id}`);
}
assert.match(html, /js\/render\/equipment_visuals\.js\?v=/,
  'Loot Lab loads the production equipment renderer');
assert.match(script, /Game\.content\.all\('actorArchetype'\)/,
  'hostile choices come from compiled actor content');
assert.match(script, /Game\.loot\.inspectPlan\(observationContext\(\), observationState\)/,
  'each observed defeat uses production loot Trace and continuous state');
assert.match(script, /decision\.threshold/);
assert.match(script, /decision\.roll/);
assert.match(script, /decision\.reason/);
assert.match(script, /Game\.equipmentVisuals\.drawToDom/);
assert.match(script, /Game\.assets\.drawToDom/);
assert.doesNotMatch(html + script, /firpg_save|firpg_save_backup/,
  'Loot Lab never reads or writes formal save keys');
assert.match(styles, /prefers-reduced-motion/);
assert.match(styles, /image-rendering:\s*pixelated/);

for (const key of ['loot.enemy', 'loot.findMultiplier', 'loot.observatory',
  'loot.observatoryHint', 'loot.killOne', 'loot.killTen', 'loot.theoreticalRate',
  'loot.observedRate', 'loot.pityProgress', 'loot.observatorySummary']) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.ok((messages.match(new RegExp(`'${escaped}'\\s*:`, 'g')) || []).length >= 2,
    `${key} is bilingual`);
}

console.log('Loot Lab contract OK: hostile actors, production Trace, probability, pity, and pixel equipment rendering.');
