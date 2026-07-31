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
const merchants = read('js/systems/merchants.js');
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
const groundManifest = Game.GROUND_DECORATION_SPRITES;

assert.ok(groundManifest, 'ground-decoration asset manifest is loaded');
assert.equal(Object.keys(groundManifest.regions).length, 8);
assert.equal(Object.keys(groundManifest.assets).length, 48);
assert.equal(new Set(Object.keys(groundManifest.assets)).size, 48);

for (const region of regions) {
  const themedGroundDecor = (region.terrain.deco || [])
    .filter((definition) => definition.v3Only);
  assert.equal(themedGroundDecor.length, 6,
    `${region.id} registers exactly six new v3 ground decorations`);
  assert.deepEqual(
    Array.from(groundManifest.regions[region.id]),
    Array.from(themedGroundDecor, (definition) => definition.sprite),
    `${region.id} generated module follows region catalog order`
  );
  for (const definition of themedGroundDecor) {
    const asset = groundManifest.assets[definition.sprite];
    assert.equal(definition.placement, 'ground',
      `${definition.sprite} remains a non-blocking ground decoration`);
    assert.ok(Game.assets.has(definition.sprite),
      `${definition.sprite} has a production pixel sprite`);
    assert.ok(asset, `${definition.sprite} has independent source metadata`);
    assert.ok(fs.existsSync(path.join(ROOT, asset.source.path)),
      `${definition.sprite} source PNG exists`);
    assert.ok(fs.existsSync(path.join(ROOT, asset.png)),
      `${definition.sprite} production PNG exists`);
    assert.equal(
      require('node:crypto').createHash('sha256')
        .update(fs.readFileSync(path.join(ROOT, asset.source.path)))
        .digest('hex'),
      asset.source.sha256,
      `${definition.sprite} source hash matches the generated manifest`
    );
    assert.ok(definition.nameKey,
      `${definition.sprite} exposes a localized catalog name`);
    assert.ok(definition.distribution,
      `${definition.sprite} exposes a data-authored v3 distribution profile`);
    assert.ok([
      'blob', 'edgeBand', 'line', 'ring', 'arc', 'row', 'trail', 'scatter'
    ].includes(definition.distribution.pattern),
    `${definition.sprite} uses a supported semantic shape grammar`);
    assert.ok(Game.i18n.has('zh-CN', definition.nameKey),
      `${definition.nameKey} exists in zh-CN`);
    assert.ok(Game.i18n.has('en', definition.nameKey),
      `${definition.nameKey} exists in English`);
  }
}

const propSource = read('js/sprites/props.js');
assert.doesNotMatch(propSource, /deco_(?:grassland|forest|mine|graveyard|snowpass|lavacave|skyruins|darkcastle)_/,
  'theme decorations no longer live in the monolithic props source');
for (const region of regions) {
  const modulePath = `js/sprites/ground-decorations/${region.id}.generated.js`;
  assert.ok(fs.existsSync(path.join(ROOT, modulePath)), `${region.id} module exists`);
  assert.ok(html.indexOf(modulePath) > html.indexOf('js/sprites/props.js'),
    `${region.id} module loads after the shared props module`);
}

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
  'Game.terrain.decorationField(', 'Game.terrain.decorSuitability(',
  'Game.population.prepareRegion(', 'Game.population.mountChannel(',
  'Game.render.frame(', 'Game.nav.solveImmediate(',
  'Game.population.inspectPlacement(', 'Game.population.inspectCandidates(',
  'Game.merchants.inspectPlacement(', 'Game.merchants.configurePatrolActor('
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
  'merchant-audit-metrics', 'merchant-audit-detail', 'focus-merchant',
  'decor-ecology-metrics', 'decor-pattern-summary',
  'catalog-scope', 'catalog-list', 'issues-panel', 'log-list'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `Lab exposes #${id}`);
}
for (const layer of [
  'terrainMaterial', 'liquid', 'decorBlocker', 'decorGround', 'decorWater',
  'decorBoss', 'tufts', 'flowers', 'camp', 'landmarks', 'resources', 'curios',
  'ecology', 'threats', 'actors', 'hazards', 'macro', 'nav', 'distance', 'danger',
  'decorHabitat', 'decorClusters', 'decorGroups',
  'merchantAudit',
  'chunks', 'candidates', 'reservations', 'formations', 'spawnOrigins', 'ids'
]) {
  assert.match(html, new RegExp(`data-layer="${layer}"`), `Lab exposes ${layer} layer`);
}

for (const method of [
  'regenerate', 'randomize', 'catalog', 'snapshot', 'logs', 'focus',
  'setCamera', 'setLayer', 'setMotion', 'probe', 'measure',
  'verifyDeterminism', 'decorationReport', 'resetPositions', 'merchantAudit'
]) {
  assert.match(script, new RegExp(`${method}:`), `MapGenerationLab exposes ${method}`);
}
assert.match(script, /window\.MapGenerationLab\s*=/);
assert.match(script, /scope === 'all' \|\| item\.inRegion/,
  'catalog defaults to current-region relevance while retaining an all-definition scope');
assert.match(script, /definition\.nameKey \? nameFromKey\(definition\.nameKey, definition\.sprite\)/,
  'decoration definitions expose localized names in the generated catalog');
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
assert.match(script, /item\._labChannel === 'merchant'[\s\S]+Game\.mapIcons\.draw\(minimapCtx, 'merchant'/,
  'the generator audit minimap previews the production merchant marker');
assert.match(script, /setPointerCapture/);
assert.match(script, /toBlob/);

assert.match(population, /inspectPlacement:/,
  'Population publishes side-effect-free placement inspection');
assert.match(population, /inspectCandidates:/,
  'Population publishes production candidate inspection');
assert.match(population, /inspectPlacements:/,
  'Population publishes batch placement inspection for large nav candidate sets');
assert.match(population, /!context\.preview/,
  'determinism preview cannot replace the active mount plan');
assert.match(world, /updateAmbientActor:/,
  'Lab patrol preview reuses the production ambient movement entrypoint');
assert.match(world, /options\.rng/,
  'production ambient movement accepts a seeded Lab RNG');
assert.match(world, /merchantPatrolRadius/,
  'production ambient movement honors the merchant wagon patrol radius');
assert.match(merchants, /sourceTotal/,
  'merchant audit reports the production nav candidate population');
assert.match(merchants, /state\.activeEvent = event[\s\S]+merchant:discovered/,
  'merchant discovery commits state before broadcasting only after materialization succeeds');
assert.match(script,
  /function rerunMerchantAudit[\s\S]+runAudit\(\);[\s\S]+refreshGenerationReportHash\(\);/,
  'moving the merchant QA anchor refreshes both placement issues and the aggregate report hash');
assert.ok(html.indexOf('js/systems/merchants.js') > html.indexOf('js/systems/world.js'),
  'Map Generation Lab loads the production merchant domain after the world runtime');
assert.match(renderer, /terrainLayers\.material !== false/);
assert.match(renderer, /terrainLayers\.liquid !== false/);
assert.match(terrain, /placementOf\(def\)/,
  'v3 decoration roles remain data-driven');
assert.match(terrain, /habitat-cluster-grammar/,
  'v3 publishes the habitat, cluster and grammar generation method');
assert.match(terrain, /T\.decorationField\s*=/,
  'production terrain exposes a read-only habitat diagnostic field');
assert.match(terrain, /T\.decorationSnapshot\s*=/,
  'production terrain exposes deterministic decoration snapshots');
assert.doesNotMatch(terrain, /tree\|oak|fern\|bush/,
  'v3 does not infer placement from sprite IDs');

console.log(
  `Map Generation Lab contract OK (${regions.length} regions, ` +
  `${nonPlayerActors.length} non-player actor definitions, ${i18nKeys.size} bilingual keys).`
);
