'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'js/sprites/minimap_icons.js'), 'utf8');
const context = { window: { Game: {} } };
vm.runInNewContext(source, context, { filename: 'minimap_icons.js' });

const icons = context.window.Game.mapIcons;
const expected = ['camp', 'landmark', 'resource', 'curio', 'ecology', 'threat', 'guardian', 'lair', 'hero'];
assert.deepEqual(Array.from(icons.types), expected);

const signatures = new Set();
for (const type of expected) {
  const info = icons.inspect(type);
  assert.ok(info, `${type} must be inspectable`);
  assert.ok(info.width >= 13 && info.width <= 16, `${type} width must stay minimap-sized`);
  assert.ok(info.height >= 13 && info.height <= 16, `${type} height must stay minimap-sized`);
  assert.ok(info.pixels >= 20, `${type} must contain a readable non-empty silhouette`);
  assert.ok(info.colors >= 2, `${type} must use more than a one-note dot color`);
  signatures.add(`${info.width}:${info.height}:${info.pixels}:${info.colors}`);
}
assert.ok(signatures.size >= 7, 'icon silhouettes must have distinct pixel profiles');
assert.doesNotMatch(source, /\.arc\s*\(/, 'location icons must not fall back to circular markers');

const demoHtml = fs.readFileSync(path.join(ROOT, 'tech-demos/exploration-v3/exploration-v3.html'), 'utf8');
const demoJs = fs.readFileSync(path.join(ROOT, 'tech-demos/exploration-v3/exploration-v3.js'), 'utf8');
for (const type of expected) assert.match(demoHtml, new RegExp(`data-map-icon="${type}"`));
assert.match(demoHtml, /sprites\/minimap_icons\.js\?v=/);
assert.match(demoJs, /Game\.mapIcons\.draw\(/);

const explorationSource = fs.readFileSync(path.join(ROOT, 'js/systems/exploration.js'), 'utf8');
const drawMapSource = explorationSource.slice(
  explorationSource.indexOf('drawMap: function'),
  explorationSource.indexOf('serializeFog: function')
);
assert.match(drawMapSource, /Game\.mapIcons\.draw\(/);
assert.doesNotMatch(drawMapSource, /\.arc\s*\(/,
  'production minimap location markers must not regress to circles');

console.log('Minimap icon set OK: 9 hand-pixelled location silhouettes.');
