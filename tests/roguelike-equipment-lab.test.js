'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { bootEquipmentRuntime } = require('./helpers/equipment-runtime');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const { Game, sandbox } = bootEquipmentRuntime();

function canvasStub() {
  const canvas = { width: 0, height: 0, fills: [] };
  const context = {
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    fillRect(x, y, width, height) {
      canvas.fills.push({ x, y, width, height, color: this.fillStyle });
    },
    clearRect() { canvas.fills = []; },
    drawImage(source) { canvas.drawnFrom = source; }
  };
  canvas.getContext = () => context;
  return canvas;
}

sandbox.document.createElement = (tag) => tag === 'canvas' ? canvasStub() : {};
vm.runInContext(read('js/render/equipment_visuals.js'), sandbox,
  { filename: 'equipment_visuals.js' });

const bases = Game.content.all('itemBase');
assert.equal(bases.length, 40);
assert.equal(Game.content.all('itemVisualProfile').length, 40);
const visualSignatures = new Set();
for (const [baseIndex, base] of bases.entries()) {
  for (let rank = 0; rank < 5; rank++) {
    const item = Game.loot.generateEquipment({
      seed: 100003 + baseIndex * 101 + rank,
      uid: `visual:${base.id}:${rank}`,
      classId: 'fighter', itemLevel: 30,
      slotId: base.slotId, baseId: base.id,
      rarityId: Game.equipment.RARITY_IDS[rank], regionId: 'grassland'
    });
    const first = Game.equipmentVisuals.renderFrame(item);
    const second = Game.equipmentVisuals.renderFrame(item);
    assert.deepEqual(second.descriptor, first.descriptor, `${base.id}/${rank} descriptor is deterministic`);
    assert.equal(second.canvas, first.canvas, `${base.id}/${rank} cached frame is deterministic`);
    const icon = first.canvas;
    assert.ok(icon.fills.length > 0, `${base.id}/${rank} renders non-empty pixels`);
    assert.equal(first.descriptor.baseId, base.id);
    assert.equal(first.descriptor.rarityRank, rank);
    visualSignatures.add(JSON.stringify([
      first.descriptor.slotId, first.descriptor.profileFamily, first.descriptor.rarityId
    ]));
    if (rank === 4) {
      const frame0 = Game.equipmentVisuals.renderFrame(item, { phase: 1 }).canvas;
      const frame1 = Game.equipmentVisuals.renderFrame(item, { phase: 2 }).canvas;
      assert.notDeepEqual(frame0.fills, frame1.fills, `${base.id} legendary frames differ`);
    }
  }
}
assert.ok(visualSignatures.size >= 100, 'slot, base family and rarity semantics produce varied descriptors');

const weaponForms = new Set();
for (const classId of ['fighter', 'rogue', 'mage', 'cleric', 'ranger']) {
  const item = Game.loot.generateEquipment({
    seed: 991 + classId.length, uid: `weapon-form:${classId}`,
    classId, itemLevel: 30, slotId: 'weapon', baseId: 'weapon.vanguard',
    rarityId: 'legendary', regionId: 'grassland'
  });
  const visual = Game.equipmentVisuals.renderFrame(item);
  weaponForms.add(visual.canvas.fills
    .map((entry) => `${entry.x}:${entry.y}:${entry.color}`).join('|'));
}
assert.equal(weaponForms.size, 5, 'all five classes have distinct weapon forms');

const familyItem = Game.loot.generateEquipment({
  seed: 771, uid: 'family-marks', classId: 'fighter', itemLevel: 30,
  slotId: 'accessory', baseId: 'accessory.compass', rarityId: 'legendary', regionId: 'grassland'
});
familyItem.affixes = ['normal.power', 'normal.health', 'normal.lifesteal',
  'normal.haste', 'normal.gold', 'legendary.apex'].map((definitionId, index) => ({
    instanceId: `family:${index}`, definitionId, values: { rolls: [] }
  }));
const familyDescriptor = Game.equipmentVisuals.descriptorFor(familyItem);
assert.deepEqual(new Set(familyDescriptor.families),
  new Set(['offense', 'defense', 'sustain', 'tempo', 'economy']));
assert.equal(familyDescriptor.legendaryId, 'legendary.apex');

for (let seed = 0; seed < 140; seed++) {
  const item = Game.loot.generateEquipment({
    seed, uid: `cache:${seed}`, classId: 'mage', itemLevel: 22,
    rarityId: 'legendary', regionId: 'forest'
  });
  Game.equipmentVisuals.renderFrame(item, { material: seed % 2 === 0 });
}
const visualDiagnostics = Game.equipmentVisuals.diagnostics();
assert.equal(visualDiagnostics.cacheLimit, 128);
assert.ok(visualDiagnostics.cachedFrames <= 128, 'production visual LRU remains bounded');
assert.equal(Game.equipmentVisuals.catalog().length, 88, 'catalog includes 72 base/class forms and 16 legendary effects');

const mini = Game.equipmentVisuals.renderFrame(familyItem, { size: 'mini' });
assert.equal(mini.canvas.width, 10);
assert.equal(mini.canvas.height, 10);
assert.ok(mini.canvas.fills.length > 0, 'semantic ground icon is non-empty');
const withoutAffixes = Game.equipmentVisuals.renderFrame(familyItem, { affixes: false, legendary: false });
assert.notDeepEqual(withoutAffixes.canvas.fills, Game.equipmentVisuals.renderFrame(familyItem).canvas.fills,
  'layer controls alter composed pixels');

const changedAffixes = JSON.parse(JSON.stringify(familyItem));
changedAffixes.affixes = [{ instanceId: 'changed:0', definitionId: 'normal.armor', values: { rolls: [] } }];
const changedDescriptor = Game.equipmentVisuals.descriptorFor(changedAffixes);
for (const key of ['coreSeed', 'silhouetteVariant', 'partVariant', 'trimVariant', 'detailVariant']) {
  assert.equal(changedDescriptor[key], familyDescriptor[key], `affix changes preserve ${key}`);
}
assert.notDeepEqual(changedDescriptor.families, familyDescriptor.families,
  'affix-family marks update without changing the core silhouette');

const lootState = Game.loot.defaultState();
const baseline = Game.loot.inspectPlan({
  worldSeed: 1234, sourceType: 'boss', sourceId: 'lab-contract',
  classId: 'fighter', playerLevel: 30, dropMultiplier: 1,
  rarityLuck: 0, minimumRank: 0
}, lootState);
const experimentDefault = Game.loot.inspectPlan({
  worldSeed: 1234, sourceType: 'boss', sourceId: 'lab-contract',
  classId: 'fighter', playerLevel: 30, dropMultiplier: 1,
  rarityLuck: 0, minimumRank: 0
}, lootState);
assert.deepEqual(experimentDefault.plan, baseline.plan,
  'default experiment inputs reproduce the production baseline');
const original = baseline.plan.items[0];
for (let candidate = 1; candidate <= 3; candidate++) {
  const alternative = Game.loot.inspectGeneration({
    seed: Game.util.strSeed(`${original.origin.seed}|lab-candidate|${candidate}|${Game.content.fingerprint()}`),
    uid: `${original.uid}:candidate:${candidate}`, classId: original.classId,
    itemLevel: original.itemLevel, slotId: Game.equipment.slotOf(original),
    rarityId: original.rarityId, regionId: original.origin.regionId
  }).item;
  assert.equal(Game.equipment.slotOf(alternative), Game.equipment.slotOf(original));
  assert.equal(alternative.rarityId, original.rarityId);
  assert.equal(alternative.itemLevel, original.itemLevel);
  assert.equal(Game.equipment.validateItem(alternative).ok, true);
}
assert.deepEqual(baseline.plan.nextState, experimentDefault.plan.nextState,
  'candidate generation does not advance loot ordinals or pity');

const legendary = Game.loot.generateEquipment({
  seed: 8831, uid: 'effect-contract', classId: 'fighter', itemLevel: 35,
  slotId: 'weapon', rarityId: 'legendary', regionId: 'grassland'
});
const compiledItem = Game.equipment.compileItem(legendary, { classId: 'fighter' });
assert.ok(compiledItem.modifiers.length > 0);
assert.equal(compiledItem.effects.length, 1);
assert.ok(compiledItem.modifiers.every((modifier) => modifier.sourceId.startsWith('equipment:')));
const common = Game.loot.generateEquipment({
  seed: 8832, uid: 'effect-baseline', classId: 'fighter', itemLevel: 35,
  slotId: 'weapon', rarityId: 'common', regionId: 'grassland'
});
const record = { classId: 'fighter', level: 35, talentRanks: {}, permanentUpgrades: {} };
const before = Game.builds.compileActorRecord(record, { weapon: common });
const after = Game.builds.compileActorRecord(record, { weapon: legendary });
assert.notDeepEqual(after.values, before.values, 'effect inspector build deltas come from production compilation');

const html = read('tech-demos/roguelike-equipment/roguelike-equipment.html');
const script = read('tech-demos/roguelike-equipment/roguelike-equipment.js');
const messages = read('tech-demos/demo-i18n.js');
for (const id of ['panel-drop', 'panel-generation', 'panel-effects', 'drop-trace',
  'generation-trace', 'gear-preview', 'variant-wall', 'modifier-table', 'build-delta', 'effect-flow']) {
  assert.match(html, new RegExp(`id="${id}"`), `Lab exposes #${id}`);
}
assert.match(script, /Game\.loot\.inspectPlan/);
assert.match(script, /Game\.loot\.inspectGeneration/);
assert.match(script, /Game\.equipment\.compileItem/);
assert.match(script, /Game\.builds\.compileActorRecord/);
assert.doesNotMatch(html + script, /firpg_save|firpg_save_backup/,
  'Lab never reads or writes formal save keys');
for (const key of ['hub.gearLab.title', 'hub.gearLab.desc', 'gearLab.title',
  'gearLab.tabDrop', 'gearLab.tabGeneration', 'gearLab.tabEffects', 'gearLab.reducedMotion']) {
  assert.ok((messages.match(new RegExp(`'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*:`, 'g')) || []).length >= 2,
    `${key} is bilingual`);
}

console.log('Roguelike equipment Lab tests passed: production procedural visuals, Trace integration, candidates and static effects.');
