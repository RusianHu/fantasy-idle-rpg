'use strict';

const assert = require('node:assert/strict');
const { bootEquipmentRuntime } = require('./helpers/equipment-runtime');

const { Game } = bootEquipmentRuntime();
const slots = Game.content.all('itemSlot');
const bases = Game.content.all('itemBase');
const affixes = Game.content.all('itemAffix');
const normal = affixes.filter((entry) => entry.kind === 'normal');
const legendary = affixes.filter((entry) => entry.kind === 'legendary');

assert.deepEqual(Array.from(slots.map((entry) => entry.id)),
  ['weapon', 'head', 'body', 'feet', 'accessory']);
assert.equal(bases.length, 40);
assert.equal(Game.content.all('itemVisualProfile').length, 40);
for (const slot of slots) {
  assert.equal(bases.filter((entry) => entry.slotId === slot.id).length, 8,
    `${slot.id} has exactly eight item bases`);
}
assert.equal(normal.length, 24);
assert.equal(legendary.length, 16);
assert.equal(Game.content.all('itemRarity').length, 5);
assert.equal(Game.content.all('itemAffixPool').length, 2);
assert.equal(Game.content.all('lootTable').length, 1);
assert.equal(Game.content.all('reforgeProfile').length, 1);
assert.equal(Game.content.all('effectProfile').length, 16);

for (const classDef of Game.content.all('class')) {
  assert.ok(classDef.equipmentProfileId);
  assert.ok(['physicalPower', 'magicPower'].includes(classDef.primaryPowerStat));
  assert.ok(classDef.baseStats && classDef.growth);
}

for (const entry of legendary) {
  assert.ok(entry.effectProfileId);
  assert.equal(entry.uniqueEquipped, true);
  assert.ok(Game.content.get('effectProfile', entry.effectProfileId));
  assert.equal(Game.i18n.has('zh-CN', entry.presentation.nameKey), true);
  assert.equal(Game.i18n.has('en', entry.presentation.nameKey), true);
  assert.equal(Game.i18n.has('zh-CN', entry.presentation.descKey), true);
  assert.equal(Game.i18n.has('en', entry.presentation.descKey), true);
}

const expectedAffixCounts = [0, 1, 2, 3, 4];
for (let rarity = 0; rarity < 5; rarity++) {
  for (const slot of Game.equipment.SLOT_IDS) {
    for (let seed = 1; seed <= 40; seed++) {
      const item = Game.loot.generateEquipment({
        seed: seed * 104729 + rarity,
        uid: `content:${slot}:${rarity}:${seed}`,
        classId: 'fighter', itemLevel: 30, slotId: slot,
        rarityId: Game.equipment.RARITY_IDS[rarity], regionId: 'grassland'
      });
      assert.equal(Game.equipment.validateItem(item).ok, true);
      assert.equal(item.affixes.length, expectedAffixCounts[rarity]);
      assert.equal(new Set(item.affixes.map((roll) => roll.definitionId)).size,
        item.affixes.length);
      const families = {};
      for (const roll of item.affixes) {
        const definition = Game.content.get('itemAffix', roll.definitionId);
        assert.ok(definition.slots.includes(slot));
        families[definition.family] = (families[definition.family] || 0) + 1;
      }
      assert.ok((families.offense || 0) <= 2);
      assert.ok((families.defense || 0) <= 2);
      assert.ok((families.sustain || 0) <= 1);
      assert.ok((families.tempo || 0) <= 1);
      assert.ok((families.economy || 0) <= 1);
      assert.ok((families.legendary || 0) <= 1);
    }
  }
}

console.log('Equipment content tests passed: 5 slots, 40 bases, 40 visual profiles, 24 normal affixes and 16 legendary effects.');
