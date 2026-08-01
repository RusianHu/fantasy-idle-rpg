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
['js/data/formulas.js', 'js/systems/terrain.js', 'js/systems/terrain_v3.js',
  'js/systems/terrain_v4.js', 'js/systems/encounter_pools.js'].forEach(load);

const { Game } = global;
const region = Game.reg.get('region', 'grassland');
const layout = Game.terrain.generate(region, 0xA17B00, 4);
let expeditionIndex = 4;
let hpPct = 1;
let actorSequence = 0;
let encounterSequence = 0;
let submitFails = false;
const actors = new Map();
const hazards = new Map();
const closedSpawns = [];
const events = [];

Game.state = {
  settings: { expeditionStrategy: 'balanced', groundLoot: true },
  player: { level: 9 }, inv: { materials: {} },
  world: { worldSeed: 0xA17B00, layoutVersion: 4, worldTime: 100,
    region: 'grassland', guardSites: { version: 1, layoutVersion: 4, regions: {} } },
  meta: { stats: { chests: 0 } }
};
Game.State = { regionTier: () => 1 };
Game.expedition = { current: () => ({ index: expeditionIndex }) };
Game.player = {
  hpPct: () => hpPct,
  addGold: (amount) => { Game.state.player.gold = (Game.state.player.gold || 0) + amount; }
};
Game.actors = { get: (id) => actors.get(id) || null };
Game.population = {
  materialize(spawnProfileId, options) {
    const spawn = Game.content.get('worldSpawnProfile', spawnProfileId);
    const pack = Game.content.get('encounterPack', spawn.encounterPackId);
    const actor = {
      id: `guard-actor-${++actorSequence}`, archetypeId: pack.members[0].archetypeId,
      hp: 100, maxHp: 100, dead: false, exp: 10, gold: 5,
      x: options.x, y: options.y, category: 'monster'
    };
    actors.set(actor.id, actor);
    return { ok: true, lease: { spawnId: `lease-${actorSequence}` }, actors: [actor], primary: actor };
  },
  close(spawnId) { closedSpawns.push(spawnId); return true; }
};
Game.hazards = {
  registerDynamic(profileId, options) { hazards.set(options.id, Object.assign({ profileId }, options)); return options.id; },
  unregisterDynamic(id) { return hazards.delete(id); }
};
Game.nav = { clear() {} };
Game.world = {
  layout, region, hero: { moveOrder: { type: 'gather' }, target: { id: 'old-target' } },
  attachActor() {}, cancelInteraction() {},
  startEncounter(primary) {
    if (submitFails) return null;
    return { id: `guard-encounter-${++encounterSequence}`, context: {}, primary };
  }
};
Game.collection = { record() {} };
Game.inv = {
  materials: Game.state.inv.materials,
  genLoot: () => ({ id: 'guard-test-equipment', rarity: 'uncommon' }),
  addMaterial(id, amount) { Game.state.inv.materials[id] = (Game.state.inv.materials[id] || 0) + amount; },
  deliverDrops() {}
};
Game.fx = null;
['guardSite:revealed', 'guardSite:engaged', 'guardSite:cleared', 'nestChest:opened']
  .forEach((type) => Game.bus.on(type, (event) => events.push({ type, event })));

load('js/systems/guard_sites.js');
load('js/systems/world_treasures.js');

Game.guardSites.initRegion('grassland', layout);
const resourceSites = layout.nodes.map((node) => Game.guardSites.forTarget(node)).filter(Boolean);
assert.equal(resourceSites.length, Math.round(layout.nodes.length * 0.3));
assert.equal(Object.isFrozen(resourceSites[0]), true, 'forTarget exposes a read-only runtime view');
assert.ok(resourceSites.some((site) => site.mode === 'visible'));
assert.ok(resourceSites.some((site) => site.mode === 'ambush'));
assert.equal(Game.guardSites.snapshot().some((site) => site.state === 'concealed'), false,
  'concealed ambushes do not leak through the read-only snapshot');
assert.ok(hazards.size > 0, 'concealed guards reuse dynamic Hazard instances');

let concealed = resourceSites.find((site) => site.state === 'concealed');
assert.ok(concealed && !Game.guardSites.canInteract(concealed.targetId));
const concealedHazard = hazards.get(`guard-hazard:${concealed.id}`);
concealedHazard.onReveal();
concealed = Game.guardSites.forTarget(concealed.targetId);
assert.equal(concealed.state, 'revealed');
assert.ok(Game.guardSites.snapshot().some((site) => site.id === concealed.id));

Game.world.hero.x = concealed.x + Game.guardSites.triggerRadius(concealed) + 4;
Game.world.hero.y = concealed.y;
assert.equal(Game.guardSites.trigger(concealed, { targetId: concealed.targetId }), false,
  'a target click cannot engage a guard remotely');
Game.world.hero.x = concealed.x;
Game.world.hero.y = concealed.y;

submitFails = true;
assert.equal(Game.guardSites.trigger(concealed, { targetId: concealed.targetId }), false);
assert.equal(concealed.state, 'revealed', 'failed Encounter submission consumes no target or guard');
assert.equal(Game.guardSites.canInteract(concealed.targetId), false);
submitFails = false;
assert.equal(Game.guardSites.trigger(concealed, { targetId: concealed.targetId }), true);
concealed = Game.guardSites.forTarget(concealed.targetId);
assert.equal(concealed.state, 'engaged');
concealed.actorIds.forEach((id) => assert.equal(actors.get(id).guardRewardMultiplier, 1.15));
for (const id of concealed.actorIds) { const actor = actors.get(id); actor.hp = 0; actor.dead = true; }
Game.bus.emit('actor:defeated', { targetActorIds: concealed.actorIds.slice() });
concealed = Game.guardSites.forTarget(concealed.targetId);
assert.equal(concealed.state, 'cleared');
assert.equal(Game.guardSites.canInteract(concealed.targetId), true);

let retreatSite = resourceSites.find((site) => site.id !== concealed.id && site.state !== 'cleared');
if (retreatSite.state === 'concealed') {
  Game.guardSites.reveal(retreatSite, 'test');
  retreatSite = Game.guardSites.forTarget(retreatSite.targetId);
}
Game.world.hero.x = retreatSite.x;
Game.world.hero.y = retreatSite.y;
Game.guardSites.trigger(retreatSite, { targetId: retreatSite.targetId });
retreatSite = Game.guardSites.forTarget(retreatSite.targetId);
const retreatEncounter = retreatSite.encounterId;
Game.bus.emit('encounter:ended', { encounterId: retreatEncounter, payload: { reason: 'escaped' } });
retreatSite = Game.guardSites.forTarget(retreatSite.targetId);
assert.equal(retreatSite.state, 'revealed');
assert.equal(Game.guardSites.canInteract(retreatSite.targetId), false);
Game.state.world.worldTime += 3;
Game.guardSites.update();
retreatSite = Game.guardSites.forTarget(retreatSite.targetId);
assert.ok(retreatSite.actorIds.length > 0, 'escaped guard is restored through Population lifecycle');
assert.ok(closedSpawns.length > 0);

const nestTreasure = layout.treasureSites[0];
let nestSite = Game.guardSites.forTarget(nestTreasure);
if (nestSite.state === 'concealed') {
  Game.guardSites.reveal(nestSite, 'test');
  nestSite = Game.guardSites.forTarget(nestTreasure);
}
Game.world.hero.x = nestSite.x;
Game.world.hero.y = nestSite.y;
Game.guardSites.trigger(nestSite, { targetId: nestTreasure.id });
nestSite = Game.guardSites.forTarget(nestTreasure);
nestSite.actorIds.forEach((id) => assert.equal(actors.get(id).guardRewardMultiplier, 1.5));
for (const id of nestSite.actorIds) { const actor = actors.get(id); actor.hp = 0; actor.dead = true; }
Game.bus.emit('actor:defeated', { targetActorIds: nestSite.actorIds.slice() });
Game.worldTreasures.initRegion('grassland', layout);
const chest = Game.worldTreasures.get(nestTreasure.id);
assert.equal(chest.ttl, null);
assert.equal(chest.locked, false);
const reward = Game.worldTreasures.open(chest);
assert.equal(reward.outcome, 'loot');
assert.equal(reward.crystal, 0);
assert.ok(reward.materialCount >= (chest.depth === 'deep' ? 3 : 2));
assert.equal(Game.worldTreasures.open(chest).reason, 'claimed');

let bossGateSite = Game.guardSites.forTarget(layout.bossGatePoint);
Game.world.hero.x = bossGateSite.x;
Game.world.hero.y = bossGateSite.y;
assert.equal(Game.guardSites.trigger(bossGateSite, { targetId: bossGateSite.targetId }), true);
bossGateSite = Game.guardSites.forTarget(layout.bossGatePoint);
bossGateSite.actorIds.forEach((id) => assert.equal(actors.get(id).guardRewardMultiplier, 2.2));

hpPct = 0.64;
Game.state.settings.expeditionStrategy = 'balanced';
assert.equal(Game.guardSites.autoEligible(retreatSite), false);
hpPct = 0.65;
assert.equal(Game.guardSites.autoEligible(retreatSite), true);
assert.equal(Game.guardSites.blocksOffline(retreatSite.targetId), true);

expeditionIndex++;
Game.guardSites.resetExpedition('grassland');
assert.equal(Game.guardSites.claimedTreasure(nestTreasure.id), false);
assert.equal(Game.guardSites.canInteract(nestTreasure.id), false);
assert.ok(events.some((entry) => entry.type === 'guardSite:revealed'));
assert.ok(events.some((entry) => entry.type === 'guardSite:engaged'));
assert.ok(events.some((entry) => entry.type === 'guardSite:cleared'));
assert.ok(events.some((entry) => entry.type === 'nestChest:opened'));

console.log('Guard sites v4 tests passed: selection, conceal/reveal, atomic submit, retreat, clear, treasure and expedition reset.');
