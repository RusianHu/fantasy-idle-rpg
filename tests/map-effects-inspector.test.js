'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadProductionContent } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const mapScript = read('tech-demos/map-effects/map-effects.js');
const messages = read('tech-demos/demo-i18n.js');
const terrain = read('js/systems/terrain_v3.js');
const renderer = read('js/render/renderer.js');

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
loadProductionContent(
  (file) => vm.runInContext(read(file), sandbox, { filename: file }),
  sandbox
);
const regions = sandbox.window.Game.reg.all('region');

const required = new Set(
  [...mapScript.matchAll(/\btr\('([^']+)'/g)].map((match) => match[1])
);
function add(group, values) {
  for (const value of values) required.add(group + '.' + value);
}

for (const region of regions) {
  add('preset', [region.exploration.macroPreset, region.exploration.blockerTheme]);
  add('role', region.terrain.deco.map((def) => def.placement));
  add('material', [region.terrain.base.mat, ...region.terrain.patches.map((patch) => patch.mat)]);
  add('particle', [region.particles]);
  add('parallax', region.parallax.map((layer) => layer.type));
  add('anomaly', region.exploration.anomalies);
  add('affix', region.exploration.affixes);
  add('function', region.exploration.landmarks.map((landmark) => landmark.function));
}

for (const key of required) {
  const full = 'map.inspector.' + key;
  const escaped = full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const occurrences = (messages.match(new RegExp("'" + escaped + "'\\s*:", 'g')) || []).length;
  assert.equal(occurrences, 2, `${full} must exist in both demo locales`);
}

assert.match(mapScript, /Game\.reg\.all\('region'\)/, 'region tabs enumerate the production registry');
for (const source of ['cfg.resources.map', 'layout.landmarks.map', 'layout.curios.map',
  'layout.ecology.map', 'layout.threats.forEach', 'region.monsters.map', 'region.terrain.deco.map']) {
  assert.ok(mapScript.includes(source), `inspector must enumerate ${source}`);
}
for (const source of [
  'Game.population.mountPlan()', 'mountPlan.reservations.map',
  'mountPlan.failures.map', 'mountPlan.respawnSchedules.map', 'Game.population.leases()'
]) {
  assert.ok(mapScript.includes(source), `Population inspector must enumerate ${source}`);
}
assert.doesNotMatch(mapScript, /var COPY\s*=/, 'inspector copy belongs in DemoI18n');
assert.doesNotMatch(mapScript, /currentIndex\s*\*\s*9/, 'region tuning must use tier, not registry position');
assert.match(terrain, /placementOf\(def\)/, 'v3 decoration roles must be data-driven');
assert.doesNotMatch(terrain, /tree\|oak|fern\|bush/, 'v3 must not infer placement from sprite IDs');
assert.match(renderer, /canvas\.addEventListener\('click'/,
  'world interactions open after a complete tap so modal actions cannot receive the same gesture');

console.log(`Map-effects inspector contract OK (${regions.length} regions, ${required.size} bilingual keys).`);
