'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { bootEquipmentRuntime } = require('./helpers/equipment-runtime');

const { Game, sandbox } = bootEquipmentRuntime();
const root = path.resolve(__dirname, '..');
const load = (file) => vm.runInContext(
  fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });

Game.F.atkInterval = (speed) => 1 / Math.max(.1, Number(speed) || 1);
Game.F.skillVal = (value) => Number(value) || 0;
Game.State = {
  regionOrder: () => ['grassland'],
  regionTier: () => 1
};
Game.reg.register('region', { id: 'grassland' });
Game.population = {
  offlineSummary: () => ({ armor: 0 }),
  channelProfiles: () => [],
  summarizePack: () => null
};
Game.prog = { isUnlocked: () => true };
Game.player.hasClass = () => true;
Game.player.classDef = () => Game.builds.classProjection(Game.state.player.classId);
Game.state.player.skills = {};
Game.state.player.perms = {};
Game.state.player.sp = 0;
Game.state.settings = {
  autoEquip: true, autoSkillUpgrade: false, combatStrategy: 'balanced'
};
Game.state.inv.lockedSlots = {
  weapon: false, head: true, body: false, feet: false, accessory: false
};
Game.state.world.regionProg = { grassland: { cleared: false } };
Game.inv.itemStats = Game.equipment.itemStats;

const estimatorSeeds = [];
Game.combatEstimator = {
  evaluateCurrent(opts) {
    estimatorSeeds.push(Array.from(opts.sampleSeeds));
    const compiled = Game.builds.compileActorRecord({
      classId: Game.state.player.classId,
      level: Game.state.player.level,
      talentRanks: {}, permanentUpgrades: {},
      loadout: { equipment: opts.equipped }
    }, opts.equipped);
    return {
      averageDps: compiled.values.physicalPower + compiled.values.maxHp * .001,
      failureRate: 0
    };
  }
};

const slots = Game.equipment.SLOT_IDS;
const current = {};
const upgrades = {};
for (const [index, slot] of slots.entries()) {
  const oldItem = Game.loot.generateEquipment({
    seed: 100 + index, uid: `old:${slot}`, classId: 'fighter', itemLevel: 1,
    slotId: slot, rarityId: 'common', regionId: 'grassland'
  });
  const upgrade = Game.loot.generateEquipment({
    seed: 200 + index, uid: `new:${slot}`, classId: 'fighter', itemLevel: 80,
    slotId: slot, rarityId: 'epic', regionId: 'grassland'
  });
  current[slot] = oldItem.uid;
  upgrades[slot] = upgrade.uid;
  Game.state.inv.items.push(oldItem, upgrade);
}
Game.state.inv.equipped = { ...current };
load('js/systems/automation.js');

const result = Game.auto.optimizeEquipment({ reason: 'test' });
assert.equal(result.changes.length, 4, 'all unlocked slots should upgrade');
assert.equal(Game.state.inv.equipped.head, current.head, 'locked slot must remain unchanged');
for (const slot of slots.filter((slot) => slot !== 'head')) {
  assert.equal(Game.state.inv.equipped[slot], upgrades[slot]);
}
assert.ok(result.gain >= .001);
assert.ok(estimatorSeeds.length >= 2);
assert.ok(estimatorSeeds.every((seeds) => JSON.stringify(seeds) === '[11,29,47]'));
assert.equal(Game.auto.equipmentJobDiagnostics.budgetMs, 4);
assert.equal(Game.auto.equipmentJobDiagnostics.result, result);

const stable = Game.auto.optimizeEquipment({ reason: 'tie' });
assert.equal(stable.changes.length, 0, 'the same best loadout must not churn on ties');

Game.world.hero.encounterId = 'active';
assert.equal(Game.auto.optimizeEquipment({ reason: 'combat' }).reason, 'encounter-active');

console.log('Equipment auto-equip tests passed: five-slot beam search, lock, threshold, seeds and combat guard.');
