'use strict';

const assert = require('node:assert/strict');
const { bootEquipmentRuntime } = require('./helpers/equipment-runtime');

const { Game } = bootEquipmentRuntime();

const generationContext = {
  seed: 0x12ab34cd,
  uid: 'eq:trace:generation',
  classId: 'rogue',
  itemLevel: 37,
  slotId: 'weapon',
  rarityId: 'legendary',
  sourceType: 'boss',
  sourceId: 'trace-generation',
  regionId: 'forest',
  tier: 4,
  ordinal: 8
};

const generated = Game.loot.generateEquipment(generationContext);
const inspectedGeneration = Game.loot.inspectGeneration(generationContext);
assert.deepEqual(inspectedGeneration.item, generated,
  'generation diagnostics must return the exact production item');
assert.equal(inspectedGeneration.trace.schemaVersion, 1);
assert.equal(inspectedGeneration.trace.seed, generated.origin.seed);
assert.equal(inspectedGeneration.trace.stateBefore, null);
assert.equal(inspectedGeneration.trace.stateAfter, null);
assert.equal(Object.hasOwn(inspectedGeneration.item, 'trace'), false,
  'diagnostics must not leak into authoritative item instances');

const generationStages = new Set(inspectedGeneration.trace.decisions.map((row) => row.stage));
for (const stage of [
  'slot', 'base', 'rarity', 'material', 'implicit-roll', 'affix-filter',
  'normal-affix', 'affix-roll', 'legendary-affix', 'item-complete'
]) assert.ok(generationStages.has(stage), `generation trace includes ${stage}`);

const selectedSlot = inspectedGeneration.trace.decisions.find((row) => row.stage === 'slot');
const selectedBase = inspectedGeneration.trace.decisions.find((row) => row.stage === 'base');
const selectedRarity = inspectedGeneration.trace.decisions.find((row) => row.stage === 'rarity');
assert.equal(selectedSlot.selected, Game.equipment.slotOf(generated));
assert.equal(selectedBase.selected, generated.baseId);
assert.equal(selectedRarity.selected, generated.rarityId);
const tracedAffixes = inspectedGeneration.trace.decisions
  .filter((row) => row.stage === 'normal-affix' || row.stage === 'legendary-affix')
  .map((row) => row.selected);
assert.deepEqual(tracedAffixes, generated.affixes.map((row) => row.definitionId));
for (const decision of inspectedGeneration.trace.decisions) {
  for (const key of ['stage', 'key', 'roll', 'threshold', 'candidates', 'selected', 'reason', 'values']) {
    assert.equal(Object.hasOwn(decision, key), true, `trace decision exposes ${key}`);
  }
}

const state = Game.loot.defaultState();
state.eligibleMisses = 9;
state.dropsSinceEpic = 11;
state.dropsSinceLegendary = 39;
state.slotDrought.weapon = 6;
const stateSnapshot = JSON.stringify(state);
const globalSnapshot = JSON.stringify(Game.state);
const planContext = {
  worldSeed: 0x55667788,
  sourceType: 'regular',
  sourceId: 'trace-plan',
  classId: 'fighter',
  playerLevel: 28,
  regionId: 'grassland',
  tier: 3,
  dropMultiplier: 1,
  rarityLuck: .25
};

const planned = Game.loot.plan(planContext, state);
const inspectedPlan = Game.loot.inspectPlan(planContext, state);
assert.deepEqual(inspectedPlan.plan, planned,
  'plan diagnostics must return the exact production plan');
assert.equal(JSON.stringify(state), stateSnapshot, 'inspection must not mutate the supplied loot state');
assert.equal(JSON.stringify(Game.state), globalSnapshot, 'inspection must not mutate global runtime state');
assert.deepEqual(inspectedPlan.trace.stateBefore, state);
assert.deepEqual(inspectedPlan.trace.stateAfter, planned.nextState);
const dropDecision = inspectedPlan.trace.decisions.find((row) => row.stage === 'drop');
assert.equal(dropDecision.selected, 'drop');
assert.equal(dropDecision.reason, 'equipment-pity');
const pityDecision = inspectedPlan.trace.decisions.find((row) => row.stage === 'pity');
assert.equal(pityDecision.reason, 'legendary-pity');
assert.ok(planned.items.every((item) => item.rarityId === 'legendary'));

function sequenceRng(values) {
  let at = 0;
  return () => values[at++ % values.length];
}
const customContext = {
  rng: sequenceRng([.91, .12, .64, .33, .78, .42, .07, .55, .29, .84, .18, .49]),
  uid: 'eq:trace:custom', classId: 'mage', itemLevel: 21,
  slotId: 'accessory', rarityId: 'epic', regionId: 'mine'
};
const customDirect = Game.loot.generateEquipment(customContext);
const customInspected = Game.loot.inspectGeneration({
  ...customContext,
  rng: sequenceRng([.91, .12, .64, .33, .78, .42, .07, .55, .29, .84, .18, .49])
});
assert.deepEqual(customInspected.item, customDirect,
  'trace capture must not consume additional values from caller-provided RNG');

console.log('Equipment trace tests passed: production-equivalent plan/generation diagnostics and immutable state.');
