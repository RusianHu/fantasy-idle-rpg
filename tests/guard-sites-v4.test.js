'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadProductionContent } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const demoHtml = read('tech-demos/exploration-v3/exploration-v3.html');
const demoSource = read('tech-demos/exploration-v3/exploration-v3.js');
[
  'js/systems/actors/actors.js',
  'js/systems/world_population.js',
  'js/systems/encounters.js',
  'js/systems/world.js',
  'js/systems/guard_sites.js'
].forEach((modulePath) => assert.match(demoHtml, new RegExp(modulePath.replace(/[./]/g, '\\$&') + '\\?v=')));
const guardAuditSource = demoSource.slice(
  demoSource.indexOf('function guardRuntimeReset()'),
  demoSource.indexOf('function auditSeeds()')
);
assert.match(guardAuditSource, /Game\.actors\.spawn\(/);
assert.match(guardAuditSource, /Game\.guardSites\.initRegion\(/);
assert.match(guardAuditSource, /Game\.guardSites\.trigger\(/);
assert.match(guardAuditSource, /Game\.encounters\.end\(/);
assert.match(guardAuditSource, /Game\.guardSites\.autoEligible\(/);
assert.match(guardAuditSource, /party-defeated/);
assert.match(guardAuditSource, /Game\.bus\.emit\('actor:defeated'/);
assert.match(guardAuditSource, /Game\.population\.onActorDefeated\(/,
  'the exploration guard audit must exercise the production Population defeat callback');
assert.match(guardAuditSource, /Game\.encounters\.end\(engaged\.encounterId, 'victory'/,
  'the exploration victory audit must close the real Encounter');
assert.match(demoSource, /Game\.player\s*=\s*\{\s*hpPct:/);
assert.doesNotMatch(guardAuditSource, /Game\.guardSites\.preview\(/,
  'the exploration demo must exercise the production guard transaction, not preview it');
assert.doesNotMatch(guardAuditSource, /hiddenLeak/,
  'visible guard snapshots must not be mislabeled as concealed-information leaks');

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
const cancelledInteractions = [];
const aiPauses = [];

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
  attachActor() {}, cancelInteraction(reason) { cancelledInteractions.push(reason); },
  startEncounter(primary) {
    if (submitFails) return null;
    return { id: `guard-encounter-${++encounterSequence}`, context: {}, primary };
  }
};
Game.expeditionAI = { pause(reason) { aiPauses.push(reason); } };
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
assert.equal(cancelledInteractions.at(-1), 'guard-site');
assert.equal(aiPauses.at(-1), 'guard-submit');
concealed.actorIds.forEach((id) => assert.equal(actors.get(id).guardRewardMultiplier, 1.15));
const concealedActorIds = concealed.actorIds.slice();
for (const id of concealedActorIds) {
  const actor = actors.get(id);
  actor.hp = 0;
  actor.dead = true;
  actors.delete(id);
}
Game.bus.emit('actor:defeated', { targetActorIds: concealedActorIds });
concealed = Game.guardSites.forTarget(concealed.targetId);
assert.equal(concealed.state, 'cleared');
assert.equal(Game.guardSites.canInteract(concealed.targetId), true);
assert.equal(concealed.actorIds.length, 0,
  'victory clears transient actor ids even if world cleanup ran first');

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

let defeatSite = resourceSites.find((site) =>
  site.id !== concealed.id && site.id !== retreatSite.id && site.state !== 'cleared');
assert.ok(defeatSite, 'the fixture exposes a separate party-defeat guard');
if (defeatSite.state === 'concealed') {
  Game.guardSites.reveal(defeatSite, 'test-party-defeat');
  defeatSite = Game.guardSites.forTarget(defeatSite.targetId);
}
Game.world.hero.x = defeatSite.x;
Game.world.hero.y = defeatSite.y;
assert.equal(Game.guardSites.trigger(defeatSite, { targetId: defeatSite.targetId }), true);
defeatSite = Game.guardSites.forTarget(defeatSite.targetId);
Game.bus.emit('encounter:ended', {
  encounterId: defeatSite.encounterId,
  payload: { reason: 'party-defeated' }
});
defeatSite = Game.guardSites.forTarget(defeatSite.targetId);
assert.equal(defeatSite.state, 'revealed', 'party defeat unlocks no guarded target');
assert.equal(Game.guardSites.canInteract(defeatSite.targetId), false);
Game.state.world.worldTime += 3;
Game.guardSites.update();
defeatSite = Game.guardSites.forTarget(defeatSite.targetId);
assert.ok(defeatSite.actorIds.length > 0, 'party-defeated guards rearm through Population');

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
bossGateSite.actorIds.forEach((id) => {
  const actor = actors.get(id);
  actor.hp = 0;
  actor.dead = true;
  assert.equal(actor.populationRespawnManaged, false,
    'guard-site actors delegate rearming to the guard transaction');
});
const bossGateEncounterId = bossGateSite.encounterId;
const actorSequenceBeforeBossVictory = actorSequence;
Game.bus.emit('encounter:ended', {
  encounterId: bossGateEncounterId,
  payload: { reason: 'victory', status: 'success' }
});
bossGateSite = Game.guardSites.forTarget(layout.bossGatePoint);
assert.equal(bossGateSite.state, 'cleared',
  'an authoritative victory end clears the gate even without actor:defeated ordering');
assert.equal(bossGateSite.actorIds.length, 0);
assert.equal(Game.guardSites.isBossGateCleared(), true);
Game.state.world.worldTime += 3;
Game.guardSites.update();
assert.equal(actorSequence, actorSequenceBeforeBossVictory,
  'a cleared Boss gate never enters the guard rearm branch');

hpPct = 0.64;
Game.state.settings.expeditionStrategy = 'balanced';
assert.equal(Game.guardSites.autoEligible(retreatSite), false);
hpPct = 0.65;
assert.equal(Game.guardSites.autoEligible(retreatSite), true);
assert.equal(Game.guardSites.blocksOffline(retreatSite.targetId), true);

const thresholds = {
  safe: { resource: 0.8, nestTreasure: 0.9, bossGate: 0.9 },
  balanced: { resource: 0.65, nestTreasure: 0.75, bossGate: 0.8 },
  loot: { resource: 0.5, nestTreasure: 0.6, bossGate: 0.8 }
};
for (const [strategy, kinds] of Object.entries(thresholds)) {
  Game.state.settings.expeditionStrategy = strategy;
  for (const [kind, threshold] of Object.entries(kinds)) {
    assert.equal(Game.guardSites.autoThreshold(kind), threshold, `${strategy}/${kind} threshold`);
  }
}

const persisted = JSON.parse(JSON.stringify(Game.state.world.guardSites));
Game.guardSites.reset();
Game.state.world.guardSites = persisted;
Game.guardSites.initRegion('grassland', layout);
assert.equal(Game.guardSites.forTarget(concealed.targetId).state, 'cleared',
  'victory remains cleared after save/load initialization');
assert.equal(Game.guardSites.forTarget(layout.bossGatePoint).state, 'cleared',
  'Boss gate victory remains cleared after save/load initialization');
assert.equal(Game.guardSites.forTarget(layout.bossGatePoint).actorIds.length, 0,
  'save/load never rematerializes a cleared Boss gate');
assert.equal(Game.guardSites.forTarget(defeatSite.targetId).state, 'revealed',
  'transient defeat actors are dropped while revealed state survives save/load');
assert.equal(Game.guardSites.forTarget(defeatSite.targetId).actorIds.length > 0, true,
  'save/load rematerializes revealed guards from the production pool');

expeditionIndex++;
Game.guardSites.resetExpedition('grassland');
assert.equal(Game.guardSites.claimedTreasure(nestTreasure.id), false);
assert.equal(Game.guardSites.canInteract(nestTreasure.id), false);
assert.ok(events.some((entry) => entry.type === 'guardSite:revealed'));
assert.ok(events.some((entry) => entry.type === 'guardSite:engaged'));
assert.ok(events.some((entry) => entry.type === 'guardSite:cleared'));
assert.ok(events.some((entry) => entry.type === 'nestChest:opened'));

console.log('Guard sites v4 tests passed: selection, conceal/reveal, atomic submit, victory, retreat, party defeat, save/load, strategies, treasure and expedition reset.');
