'use strict';

const assert = require('node:assert/strict');
const { bootEquipmentRuntime } = require('./helpers/equipment-runtime');

const { Game } = bootEquipmentRuntime();

function generate(overrides = {}) {
  return Game.loot.generateEquipment({
    worldSeed: 9981, sourceType: 'test', sourceId: 'generation', ordinal: 7,
    seed: 77123, uid: 'eq:test', classId: 'fighter', itemLevel: 24,
    slotId: 'weapon', rarityId: 'legendary', regionId: 'grassland',
    ...overrides
  });
}

const first = generate();
const second = generate();
assert.equal(JSON.stringify(first), JSON.stringify(second));
assert.equal(Game.equipment.validateItem(first).ok, true);
assert.equal(first.classId, 'fighter');
assert.equal(Game.equipment.slotOf(first), 'weapon');

function invalidMutation(mutator, reason) {
  const item = generate({ uid: `invalid:${reason}` });
  mutator(item);
  assert.equal(Game.equipment.validateItem(item).ok, false, reason);
}
invalidMutation((item) => { item.affixes[1].definitionId = item.affixes[0].definitionId; },
  'duplicate affix definitions must be rejected');
invalidMutation((item) => { item.affixes[0].values.rolls[0] = 1e9; },
  'out-of-range stored rolls must be rejected');
invalidMutation((item) => {
  item.affixes[0].definitionId = 'normal.power';
  item.affixes[0].values.rolls = [Math.round(Game.equipment.budget(item.itemLevel) * .18)];
  item.affixes[1].definitionId = 'normal.crit_chance';
  item.affixes[1].values.rolls = [.04];
  item.affixes[2].definitionId = 'normal.crit_damage';
  item.affixes[2].values.rolls = [.12];
}, 'family limits must be enforced');
invalidMutation((item) => { item.reforge.lockedAffixInstanceId = item.affixes[3].instanceId; },
  'legendary affixes cannot be the reforge lock');

const rarityCounts = [0, 0, 0, 0, 0];
for (let seed = 1; seed <= 20000; seed++) {
  const item = Game.loot.generateEquipment({
    seed, uid: `dist:${seed}`, classId: 'fighter', itemLevel: 20,
    slotId: 'weapon', regionId: 'grassland'
  });
  rarityCounts[Game.equipment.rarityRank(item)]++;
}
const rarityRatios = rarityCounts.map((count) => count / 20000);
assert.ok(rarityRatios[0] > .45 && rarityRatios[0] < .51);
assert.ok(rarityRatios[1] > .27 && rarityRatios[1] < .33);
assert.ok(rarityRatios[2] > .12 && rarityRatios[2] < .18);
assert.ok(rarityRatios[3] > .045 && rarityRatios[3] < .075);
assert.ok(rarityRatios[4] > .006 && rarityRatios[4] < .016);

let pity = Game.loot.defaultState();
for (let attempt = 1; attempt <= 9; attempt++) {
  const plan = Game.loot.plan({
    worldSeed: 42, sourceType: 'regular', sourceId: 'pity',
    classId: 'fighter', playerLevel: 20, dropMultiplier: 0
  }, pity);
  assert.equal(plan.items.length, 0);
  pity = plan.nextState;
}
const forcedTenth = Game.loot.plan({
  worldSeed: 42, sourceType: 'regular', sourceId: 'pity',
  classId: 'fighter', playerLevel: 20, dropMultiplier: 0
}, pity);
assert.equal(forcedTenth.items.length, 1);
assert.equal(forcedTenth.nextState.eligibleMisses, 0);

const epicPity = Game.loot.defaultState();
epicPity.dropsSinceEpic = 11;
const forcedEpic = Game.loot.plan({
  worldSeed: 42, sourceType: 'regular', sourceId: 'epic-pity',
  classId: 'fighter', playerLevel: 20, forceDrop: true
}, epicPity);
assert.ok(Game.equipment.rarityRank(forcedEpic.items[0]) >= 3);

const legendaryPity = Game.loot.defaultState();
legendaryPity.dropsSinceLegendary = 39;
const forcedLegendary = Game.loot.plan({
  worldSeed: 42, sourceType: 'regular', sourceId: 'legendary-pity',
  classId: 'fighter', playerLevel: 20, forceDrop: true
}, legendaryPity);
assert.equal(Game.equipment.rarityRank(forcedLegendary.items[0]), 4);

const firstKillBoss = Game.loot.plan({
  worldSeed: 81, sourceType: 'boss', sourceId: 'boss:first', firstKill: true,
  classId: 'fighter', playerLevel: 20
}, Game.loot.defaultState());
assert.ok(firstKillBoss.items.length >= 2);
assert.ok(firstKillBoss.items.some((item) => Game.equipment.rarityRank(item) >= 3));
assert.ok(firstKillBoss.items.every((item) => Game.equipment.rarityRank(item) >= 2));

const slotCounts = { weapon: 0, head: 0, body: 0, feet: 0, accessory: 0 };
const equipped = { weapon: null, head: 'used:h', body: 'used:b', feet: 'used:f', accessory: 'used:a' };
for (let seed = 1; seed <= 5000; seed++) {
  const item = Game.loot.generateEquipment({
    seed: seed * 17, uid: `slot:${seed}`, classId: 'fighter', itemLevel: 20,
    equipped, slotDrought: {}, regionId: 'grassland'
  });
  slotCounts[Game.equipment.slotOf(item)]++;
}
assert.ok(slotCounts.weapon / 5000 > .28, 'an empty slot must receive a meaningful sampling boost');

Game.state.inv.materials = { herb: 999, berry: 999 };
const reforgeItem = generate({ uid: 'eq:reforge', rarityId: 'legendary' });
Game.state.inv.items = [reforgeItem];
const normalRows = reforgeItem.affixes.filter((roll) =>
  Game.content.get('itemAffix', roll.definitionId).kind === 'normal');
const locked = JSON.parse(JSON.stringify(normalRows[0]));
const legendaryBefore = JSON.stringify(reforgeItem.affixes.filter((roll) =>
  Game.content.get('itemAffix', roll.definitionId).kind === 'legendary'));
const quote = Game.reforge.quote(reforgeItem, locked.instanceId);
assert.equal(quote.ok, true);
assert.ok(quote.gold > 0 && quote.materialCount >= 2);
const reforged = Game.reforge.execute(reforgeItem.uid, locked.instanceId);
assert.equal(reforged.ok, true);
assert.equal(reforgeItem.reforge.count, 1);
assert.equal(reforgeItem.reforge.lockedAffixInstanceId, locked.instanceId);
assert.equal(JSON.stringify(reforgeItem.affixes.find((roll) => roll.instanceId === locked.instanceId)),
  JSON.stringify(locked));
assert.equal(JSON.stringify(reforgeItem.affixes.filter((roll) =>
  Game.content.get('itemAffix', roll.definitionId).kind === 'legendary')), legendaryBefore);

const singleAffix = generate({ uid: 'eq:single', rarityId: 'fine' });
assert.equal(Game.reforge.quote(singleAffix, singleAffix.affixes[0].instanceId).reason,
  'nothing-to-reroll');
Game.world.hero.encounterId = 'active';
assert.equal(Game.reforge.quote(reforgeItem, null).reason, 'encounter-active');
Game.world.hero.encounterId = null;

const rollbackItem = generate({ uid: 'eq:rollback', rarityId: 'epic' });
Game.state.inv.items.push(rollbackItem);
const rollbackSnapshot = JSON.stringify(rollbackItem);
const goldSnapshot = Game.state.player.gold;
const materialSnapshot = JSON.stringify(Game.state.inv.materials);
Game.player.recalc = () => { throw new Error('fixture failure'); };
const rolledBack = Game.reforge.execute(rollbackItem.uid, null);
assert.equal(rolledBack.reason, 'rollback');
assert.equal(JSON.stringify(rollbackItem), rollbackSnapshot);
assert.equal(Game.state.player.gold, goldSnapshot);
assert.equal(JSON.stringify(Game.state.inv.materials), materialSnapshot);
Game.player.recalc = () => {};

const commitState = JSON.stringify(Game.state.inv.loot);
const commitItems = Game.state.inv.items.slice();
const commitPlan = Game.loot.plan({
  worldSeed: 99, sourceType: 'boss', sourceId: 'commit-rollback',
  classId: 'fighter', playerLevel: 20
}, Game.state.inv.loot);
Game.inv.addItems = () => { throw new Error('inventory failure'); };
assert.throws(() => Game.loot.commit(commitPlan));
assert.equal(JSON.stringify(Game.state.inv.loot), commitState);
assert.deepEqual(Array.from(Game.state.inv.items), Array.from(commitItems));

console.log(`Equipment generation tests passed: rarity distribution ${rarityCounts.join('/')}, pity, slot weighting, reforge and rollback.`);
