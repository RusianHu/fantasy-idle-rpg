'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadProductionContent } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function canvasStub() {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: false,
    fillRect() {}, strokeRect() {}, drawImage() {}, translate() {}, scale() {},
    fillText() {}, clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, stroke() {}, fill() {}, save() {}, restore() {}
  };
  ctx.getImageData = (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) });
  ctx.putImageData = () => {};
  return { width: 0, height: 0, getContext: () => ctx };
}

const sandbox = { console };
sandbox.window = sandbox;
sandbox.document = { createElement: (tag) => tag === 'canvas' ? canvasStub() : {} };
vm.createContext(sandbox);
loadProductionContent((file) => vm.runInContext(read(file), sandbox, { filename: file }), sandbox);
for (const file of [
  'js/sprites/boss_landmarks.generated.js',
  'js/sprites/exploration/manifest.generated.js',
  'js/sprites/exploration/grassland.generated.js',
  'js/sprites/exploration/forest.generated.js',
  'js/sprites/exploration/mine.generated.js',
  'js/sprites/exploration/graveyard.generated.js',
  'js/sprites/exploration/snowpass.generated.js',
  'js/sprites/exploration/lavacave.generated.js',
  'js/sprites/exploration/skyruins.generated.js',
  'js/sprites/exploration/darkcastle.generated.js',
  'js/sprites/exploration/chests.generated.js',
  'js/sprites/flora.js',
  'js/sprites/minimap_icons.js'
]) vm.runInContext(read(file), sandbox, { filename: file });
for (const file of ['js/render/effects.js', 'js/render/particles.js', 'js/systems/action_bubbles.js']) {
  vm.runInContext(read(file), sandbox, { filename: file });
}
vm.runInContext(read('js/systems/equipment.js'), sandbox, { filename: 'js/systems/equipment.js' });
vm.runInContext(read('js/render/equipment_visuals.js'), sandbox, { filename: 'js/render/equipment_visuals.js' });
vm.runInContext(read('js/render/visual_catalog.js'), sandbox, { filename: 'js/render/visual_catalog.js' });

const Game = sandbox.Game;
const snapshot = Game.visualCatalog.snapshot();
const assetIds = Game.assets.ids();
const catalogAssets = snapshot.items.filter((item) => item.kind === 'asset');
const snapshotAssetIds = new Set(catalogAssets.map((item) => item.id));
assert.equal(snapshotAssetIds.size, catalogAssets.length, 'visual catalog asset IDs remain unique');
for (const id of assetIds) assert.ok(snapshotAssetIds.has(id), `registered asset ${id} is present in visual catalog`);
assert.ok(snapshot.totalItems > snapshot.totalAssets, 'catalog includes non-asset materials/effects or content references');
assert.ok(snapshot.counts.unit > 0, 'unit assets are classified');
assert.ok(snapshot.counts.terrain > 0, 'terrain materials are classified');
assert.ok(snapshot.counts.ui > 0, 'UI assets are classified');
const equipmentItems = snapshot.items.filter((item) => item.kind === 'equipment');
assert.equal(snapshot.counts.equipment, 88, 'catalog includes every procedural equipment form');
assert.equal(equipmentItems.filter((item) => item.legendaryId).length, 16);
assert.equal(new Set(equipmentItems.filter((item) => !item.legendaryId).map((item) => item.baseId)).size, 40);
assert.ok(snapshot.items.some((item) => item.key === 'fx:banner'), 'FX catalog discovers exposed visual methods');
const previewItems = snapshot.items.filter((item) => ['effect', 'particle', 'bubble'].includes(item.kind));
assert.ok(previewItems.length > 0 && previewItems.every((item) => item.preview && item.preview.mode), 'effect entries expose an explicit preview mode');
assert.ok(previewItems.some((item) => item.preview.mode === 'production'), 'at least one effect entry uses a production preview');

const regions = Game.reg.all('region');
const materialRegions = new Map();
for (const region of regions) {
  const terrain = region.terrain || {};
  for (const entry of [terrain.base, ...(terrain.patches || []), ...(terrain.road || [])]) {
    if (!entry || !entry.mat) continue;
    const set = materialRegions.get(entry.mat) || new Set();
    set.add(region.id);
    materialRegions.set(entry.mat, set);
  }
}
const repeatedMaterial = [...materialRegions.entries()].find(([, ids]) => ids.size > 1);
assert.ok(repeatedMaterial, 'at least one terrain material is shared across regions');
const repeatedMaterialItem = snapshot.items.find((item) => item.key === `material:${repeatedMaterial[0]}`);
assert.deepEqual(new Set(repeatedMaterialItem.regions), repeatedMaterial[1], 'shared terrain materials retain every region reference');
for (const regionId of repeatedMaterial[1]) {
  const regional = Game.visualCatalog.snapshot({ regionId });
  assert.ok(regional.items.some((item) => item.key === repeatedMaterialItem.key), `shared material remains visible in ${regionId}`);
}

const unitAssets = catalogAssets.filter((item) => item.group === 'unit');
assert.ok(unitAssets.length >= 5, 'catalog exposes player/actor unit visuals');
for (const item of unitAssets) {
  assert.ok(item.motion, `${item.id} exposes an action coverage matrix`);
  for (const state of Game.visualCatalog.motionStates()) {
    for (const direction of Game.visualCatalog.directions()) {
      const cell = item.motion[state][direction];
      assert.ok(cell && cell.frame, `${item.id} resolves ${state}/${direction}`);
      assert.ok(['native', 'derived', 'fallback'].includes(cell.coverage), `${item.id} coverage is explicit`);
      if (state === 'cast') {
        const hasNativeCast = item.frameNames.some((name) => /^cast(?:_|$)/.test(name));
        assert.equal(cell.coverage === 'native', hasNativeCast, `${item.id} cast coverage reflects cast frames only`);
      }
      if (state === 'defeat') {
        const hasNativeDefeat = item.frameNames.some((name) => /^(?:defeat|dead)(?:_|$)/.test(name));
        assert.equal(cell.coverage === 'native', hasNativeDefeat, `${item.id} defeat coverage reflects defeat/dead frames only`);
      }
    }
  }
}

for (const id of assetIds.slice(0, 12)) {
  for (const state of Game.visualCatalog.motionStates()) {
    for (const direction of Game.visualCatalog.directions()) {
      const result = Game.assets.resolveMotion(id, { state, direction, time: 0.37 });
      assert.ok(result.frame && result.coverage, `${id} resolves ${state}/${direction}`);
    }
  }
}

console.log(`Visual catalog contract OK (${snapshot.totalAssets} assets, ${snapshot.totalItems} entries, ${unitAssets.length} unit visuals, ${equipmentItems.length} equipment visuals).`);
