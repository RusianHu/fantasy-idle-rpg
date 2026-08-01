'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadProductionContent } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
global.window = global;
const load = (file) => vm.runInThisContext(read(file), { filename: file });
loadProductionContent(load, global);
load('js/systems/encounter_pools.js');

const { Game } = global;
Game.state = { world: { worldSeed: 0x51A7E, layoutVersion: 4 } };
const expectedKeys = ['roaming', 'rareRoaming', 'worldAmbush', 'resourceGuardVisible',
  'resourceGuardAmbush', 'nestGuardVisible', 'nestGuardAmbush', 'bossGate', 'boss'];
const newMonsterIds = [];

for (const region of Game.content.all('regionProfile')) {
  assert.deepEqual(Object.keys(region.encounterPoolIds).sort(), expectedKeys.slice().sort());
  assert.equal(region.guardSiteProfileIds.length, 3);
  const pools = Game.encounterPools.forRegion(region.id);
  assert.equal(pools.length, 9);
  const roaming = Game.encounterPools.profile(region.encounterPoolIds.roaming);
  assert.deepEqual(roaming.entries.map((entry) => entry.weight), [18, 17, 13, 10, 16, 12, 9, 5]);
  const rare = Game.encounterPools.profile(region.encounterPoolIds.rareRoaming);
  assert.equal(rare.category, 'rare');
  assert.equal(rare.entries.length, 2);
  for (const entry of rare.entries) {
    const spawn = Game.content.get('worldSpawnProfile', entry.worldSpawnProfileId);
    const pack = Game.content.get('encounterPack', spawn.encounterPackId);
    assert.equal(spawn.lifecycle.activation, 'poolRequested');
    assert.equal(spawn.placement.source, 'encounterSite');
    assert.equal(pack.members.length, 1);
    const actorId = pack.members[0].archetypeId;
    newMonsterIds.push(actorId);
    assert.equal(Game.assets.has(actorId), true, `${actorId} has a production sprite`);
    const actor = Game.content.get('actorArchetype', actorId);
    assert.equal(actor.presentation.spriteId, actorId);
    assert.ok(actor.abilityGrantIds.includes(`${actorId}.special`));
    assert.ok(['resourceGuardVisible', 'resourceGuardAmbush', 'nestGuardVisible',
      'nestGuardAmbush'].some((key) => Game.encounterPools.profile(region.encounterPoolIds[key])
        .entries.some((poolEntry) => poolEntry.worldSpawnProfileId === entry.worldSpawnProfileId)),
    `${actorId} is reverse-reachable from rare and a special pool`);
  }
  const population = Game.content.populationView('population.' + region.id);
  assert.equal(population.channels.regular.poolProfileId, region.encounterPoolIds.roaming);
  assert.equal(population.channels.rare.capacity, 1);
  assert.equal(population.channels.rare.poolProfileId, region.encounterPoolIds.rareRoaming);
  assert.equal(population.channels.guardian.poolProfileId, region.encounterPoolIds.bossGate);
  assert.equal(population.channels.boss.poolProfileId, region.encounterPoolIds.boss);
  assert.equal(population.channels.regular.spawnRefs.length, 8,
    `${region.id} roaming weights must not be duplicated by legacy mountTo entries`);
  assert.deepEqual(population.channels.regular.spawnRefs.map((entry) => entry.weight),
    [18, 17, 13, 10, 16, 12, 9, 5]);
  const context = { worldSeed: 123, regionId: region.id, layoutVersion: 4,
    expeditionIndex: 9, siteId: `${region.id}:site:alpha` };
  assert.deepEqual(Game.encounterPools.resolve(region.encounterPoolIds.roaming, context),
    Game.encounterPools.resolve(region.encounterPoolIds.roaming, context));
  assert.ok(Game.encounterPools.resolve(region.encounterPoolIds.bossGate, context));
  const ambushHazard = region.hazardProfileIds.map((id) => Game.content.get('hazardProfile', id))
    .find((profile) => profile.category === 'ambushTrigger');
  assert.equal(ambushHazard.outcome.encounterPoolId, region.encounterPoolIds.worldAmbush);
  assert.ok(ambushHazard.outcome.encounterPackIds.length > 0, 'legacy v3 pack list remains available');
}

assert.equal(new Set(newMonsterIds).size, 16);
assert.equal(Game.content.all('encounterPoolProfile').length, 72);
assert.equal(Game.content.all('guardSiteProfile').length, 24);
console.log('Encounter pools v4 tests passed: 72 typed pools, 24 guard profiles and 16 independent monsters.');
