'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadProductionContent } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('tech-demos/map-effects/map-effects.html');
const script = read('tech-demos/map-effects/map-effects.js');
const messages = read('tech-demos/demo-i18n.js');
const population = read('js/systems/world_population.js');
const world = read('js/systems/world.js');
const renderer = read('js/render/renderer.js');
const terrain = read('js/systems/terrain_v3.js');

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
loadProductionContent(
  (file) => vm.runInContext(read(file), sandbox, { filename: file }),
  sandbox
);
const Game = sandbox.window.Game;
const regions = Game.reg.all('region');
const nonPlayerActors = Game.content.all('actorArchetype')
  .filter((definition) => definition.category !== 'player');

const i18nKeys = new Set(
  [...html.matchAll(/data-demo-(?:i18n|page-title|i18n-aria|i18n-title|i18n-label)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((key) => key.startsWith('map.'))
);
for (const key of i18nKeys) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const occurrences = (messages.match(new RegExp("'" + escaped + "'\\s*:", 'g')) || []).length;
  assert.ok(occurrences >= 2 && occurrences % 2 === 0,
    `${key} must exist symmetrically in both demo locales`);
}

assert.match(script, /Game\.reg\.all\('region'\)/,
  'region tabs enumerate the production registry');
assert.match(script, /Game\.content\.all\('actorArchetype'\)\.filter/,
  'catalog dynamically enumerates actor definitions');
assert.match(script, /definition\.category !== 'player'/,
  'catalog explicitly excludes the player archetype');
assert.equal(nonPlayerActors.length, Game.content.all('actorArchetype').length - 1);

for (const call of [
  'Game.terrain.generate(', 'Game.terrain.validate(', 'Game.terrain.mount(',
  'Game.population.prepareRegion(', 'Game.population.mountChannel(',
  'Game.render.frame(', 'Game.nav.solveImmediate(',
  'Game.population.inspectPlacement(', 'Game.population.inspectCandidates('
]) {
  assert.ok(script.includes(call), `Lab uses production call ${call}`);
}
assert.doesNotMatch(script, /Game\.world\.init\(/,
  'Lab never constructs the complete open-world scene');
for (const excluded of [
  'js/systems/combat.js', 'js/systems/hazards.js', 'js/systems/environment.js',
  'js/systems/exploration.js', 'js/systems/expedition.js', 'js/systems/trade.js'
]) {
  assert.ok(!html.includes(excluded), `Lab excludes ${excluded}`);
}

for (const id of [
  'stage', 'stage-overlay', 'minimap', 'seed-input', 'seed-random',
  'profile-select', 'motion-toggle', 'probe-output', 'runtime-metrics',
  'catalog-scope', 'catalog-list', 'issues-panel', 'log-list'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `Lab exposes #${id}`);
}
for (const layer of [
  'terrainMaterial', 'liquid', 'decorBlocker', 'decorGround', 'decorWater',
  'decorBoss', 'tufts', 'flowers', 'camp', 'landmarks', 'resources', 'curios',
  'ecology', 'threats', 'actors', 'hazards', 'macro', 'nav', 'distance', 'danger',
  'chunks', 'candidates', 'reservations', 'formations', 'spawnOrigins', 'ids'
]) {
  assert.match(html, new RegExp(`data-layer="${layer}"`), `Lab exposes ${layer} layer`);
}

for (const method of [
  'regenerate', 'randomize', 'catalog', 'snapshot', 'logs', 'focus',
  'setCamera', 'setLayer', 'setMotion', 'probe', 'measure',
  'verifyDeterminism', 'resetPositions'
]) {
  assert.match(script, new RegExp(`${method}:`), `MapGenerationLab exposes ${method}`);
}
assert.match(script, /window\.MapGenerationLab\s*=/);
assert.match(script, /scope === 'all' \|\| item\.inRegion/,
  'catalog defaults to current-region relevance while retaining an all-definition scope');
assert.match(script, /group:\s*'unit'/,
  'catalog keeps a first-class unit group in addition to actor subcategories');
for (const category of [
  'monster', 'boss', 'npc', 'creature', 'summon', 'object',
  'resource', 'chest', 'landmark', 'boss-lair', 'curio', 'ecology',
  'threat', 'hazard-definition', 'hazard-anchor', 'camp',
  'decor-blocker', 'decor-ground', 'decor-water', 'decor-boss',
  'tuft', 'flower', 'material'
]) {
  assert.match(html, new RegExp(`<option value="${category}"`),
    `catalog exposes the ${category} category`);
}
for (const mixedCategory of ['unit', 'hazard', 'decoration']) {
  assert.doesNotMatch(html, new RegExp(`<option value="${mixedCategory}"`),
    `${mixedCategory} is a heading/group, not a mixed selectable category`);
}
assert.match(script, /data-catalog-group=/,
  'all-category view renders distinct category sections');
assert.match(script, /noPlayer:/);
assert.match(script, /fogEnabled:\s*false/);
assert.match(script, /runtimeHazards:\s*false/);
assert.match(script, /fixedStepMs:\s*50/);
assert.match(script, /Game\.mapIcons\.draw/);
assert.match(script, /setPointerCapture/);
assert.match(script, /toBlob/);

assert.match(population, /inspectPlacement:/,
  'Population publishes side-effect-free placement inspection');
assert.match(population, /inspectCandidates:/,
  'Population publishes production candidate inspection');
assert.match(population, /!context\.preview/,
  'determinism preview cannot replace the active mount plan');
assert.match(world, /updateAmbientActor:/,
  'Lab patrol preview reuses the production ambient movement entrypoint');
assert.match(world, /options\.rng/,
  'production ambient movement accepts a seeded Lab RNG');
assert.match(renderer, /terrainLayers\.material !== false/);
assert.match(renderer, /terrainLayers\.liquid !== false/);
assert.match(terrain, /placementOf\(def\)/,
  'v3 decoration roles remain data-driven');
assert.doesNotMatch(terrain, /tree\|oak|fern\|bush/,
  'v3 does not infer placement from sprite IDs');

console.log(
  `Map Generation Lab contract OK (${regions.length} regions, ` +
  `${nonPlayerActors.length} non-player actor definitions, ${i18nKeys.size} bilingual keys).`
);
