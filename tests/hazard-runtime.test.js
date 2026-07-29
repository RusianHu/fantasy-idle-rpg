'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PRODUCTION_CONTENT_FILES } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const sandbox = {
  console, window: null,
  document: { documentElement: { lang: 'zh-CN' }, querySelector: () => null, querySelectorAll: () => [] },
  navigator: { language: 'zh-CN' }, localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  performance: { now: () => 0 },
  Math, Number, Date, Object, Array, String, Boolean, JSON,
  Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);
function load(file) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}
PRODUCTION_CONTENT_FILES.forEach(load);
const Game = sandbox.Game;
Game.content.finalize({ strict: true });
[
  'js/systems/actors/relations.js', 'js/systems/actors/parties.js',
  'js/systems/actors/actors.js', 'js/systems/encounters.js',
  'js/systems/engagement.js', 'js/systems/combat_ai.js',
  'js/systems/combat.js', 'js/systems/hazards.js'
].forEach(load);

Game.State = { regionTier: () => 1 };
Game.transitions = { isActive: () => false };
Game.terrain = {
  isWalkable: () => true,
  sweepMove: (x, y, dx, dy) => ({ x: x + dx, y: y + dy })
};
Game.nav = { useLayout() {}, clear() {} };

function reset(regionId) {
  Game.hazards.reset();
  Game.encounters.reset();
  Game.engagement.reset();
  Game.relations.reset();
  Game.actors.reset();
  Game.state = {
    settings: { controlMode: 'manual', expeditionStrategy: 'balanced', combatStrategy: 'balanced', combatTactics: {} },
    player: { level: 20 },
    world: {
      region: regionId, regionOrder: ['grassland', 'forest', 'mine', 'graveyard', 'snowpass', 'lavacave', 'skyruins', 'darkcastle'],
      worldSeed: 0x1234abcd, worldTime: 300, layoutVersion: 3, mode: 'battle',
      hazards: { layoutVersion: 3, regions: {} }
    },
    meta: { stats: {} }
  };
  const world = Game.world = {
    entities: [], hero: null, layout: null, cinematic: null,
    attachActor(actor) {
      if (this.entities.some((entry) => entry.id === actor.id)) return false;
      this.entities.push(actor);
      return true;
    },
    detachActor(actorId) {
      const before = this.entities.length;
      this.entities = this.entities.filter((actor) => actor.id !== actorId);
      return this.entities.length !== before;
    },
    startEncounter: () => null
  };
  return world;
}

function spawnHero(id, x, y) {
  const hero = Game.actors.spawn({
    instanceId: id, archetypeId: 'adventurer', classId: 'fighter',
    level: 20, tier: 1, factionId: 'adventurers', controllerId: 'ai:player-auto',
    statValues: {
      maxHp: 1000, armor: 20, ward: 18, physicalPower: 30, magicPower: 20,
      accuracy: 0.95, gcdSpeed: 1, castSpeed: 1, autoAttackSpeed: 1,
      cooldownRate: 1, moveSpeed: 56, range: 24, critChance: 0.05,
      critMultiplier: 1.5, dodgeChance: 0, healingPower: 20, shieldPower: 1000,
      lifesteal: 0, statusPotency: 1, tenacity: 0, interruptPower: 1,
      threatMultiplier: 1, resourceRegen: 1, expMultiplier: 1,
      goldMultiplier: 1, dropMultiplier: 1
    },
    transform: { x, y }, spawnSource: { kind: 'test', sourceId: 'hazard-runtime', sequence: 1 }
  });
  hero.kind = 'hero';
  hero.partyId = 'party-player';
  return hero;
}

function advanceHazards(ticks) {
  for (let tick = 0; tick < ticks; tick++) Game.hazards.update(0.05);
}

// Damage trap: deterministic ID, warning, fixed-tick hit, persistence and strategy cost.
let world = reset('grassland');
let hero = spawnHero('hazard:hero', 300, 240);
hero.hp = hero.maxHp = 1000;
world.hero = hero;
world.entities = [hero];
const damageLayout = {
  version: 3,
  hazardAnchors: [{ id: 'anchor:0', x: 300, y: 240, clearance: 64 }],
  threats: []
};
world.layout = damageLayout;
Game.hazards.initRegion('grassland', damageLayout);
const thorn = Game.hazards.all().find((hazard) => hazard.profileId === 'hazard.grassland.thorn_stakes');
assert.ok(thorn && /^hz:3:grassland:[0-9a-f]{8}:0$/.test(thorn.id));
assert.equal(Game.hazards.forceTrigger(thorn.id, hero.id), true);
assert.equal(Game.hazards.get(thorn.id).phase, 'warning');
assert.equal(Game.hazards.navigationCost(thorn.x, thorn.y, 'safe'), 250);
const hpBeforeTrap = hero.hp;
advanceHazards(22);
assert.ok(hero.hp < hpBeforeTrap, 'Hazard damage resolves through the formal external Effect path: ' +
  JSON.stringify({ hp: hero.hp, before: hpBeforeTrap, x: hero.x, y: hero.y, dead: hero.dead, kind: hero.kind,
    partyId: hero.partyId, entities: Game.world.entities.map((actor) => actor.id), transform: hero.components.transform,
    movementTypes: hero.components.body && hero.components.body.movementTypes,
    tick: Game.hazards.tick(), snapshot: Game.hazards.snapshot(), events: Game.hazards.events() }));
assert.equal(Game.hazards.get(thorn.id).phase, 'cooldown');
assert.ok(Game.state.world.hazards.regions.grassland.discoveredHazardIds.includes(thorn.id));
assert.ok(Game.state.world.hazards.regions.grassland.hazardCooldowns[thorn.id] > Game.state.world.worldTime);
assert.ok(Game.hazards.events().some((event) => event.type === 'hazard:warning'));
assert.ok(Game.hazards.events().some((event) => event.type === 'hazard:hit'));

// Leaving during warning avoids damage and returns the revealed dormant trap to strategy-aware costs.
Game.state.world.worldTime = 1000;
Game.state.world.hazards.regions.grassland.hazardCooldowns = {};
hero.x = hero.components.transform.x = 300;
hero.y = hero.components.transform.y = 240;
Game.hazards.initRegion('grassland', damageLayout);
const avoidedThorn = Game.hazards.all().find((hazard) => hazard.profileId === 'hazard.grassland.thorn_stakes');
const hpBeforeAvoid = hero.hp;
Game.hazards.forceTrigger(avoidedThorn.id, hero.id);
hero.x = hero.components.transform.x = 420;
advanceHazards(22);
assert.equal(hero.hp, hpBeforeAvoid);
assert.equal(Game.hazards.get(avoidedThorn.id).phase, 'dormant');
assert.ok(Game.hazards.events().some((event) => event.type === 'hazard:avoided'));
assert.equal(Game.hazards.navigationCost(avoidedThorn.x, avoidedThorn.y, 'safe'), 90);
assert.equal(Game.hazards.navigationCost(avoidedThorn.x, avoidedThorn.y, 'balanced'), 24);
assert.equal(Game.hazards.navigationCost(avoidedThorn.x, avoidedThorn.y, 'loot'), 4);
assert.equal(Game.hazards.resetInstance(avoidedThorn.id), true);
assert.equal(Game.hazards.get(avoidedThorn.id).awareness, 'concealed');
assert.equal(Game.hazards.get(avoidedThorn.id).phase, 'dormant');
assert.ok(!Game.state.world.hazards.regions.grassland.discoveredHazardIds.includes(avoidedThorn.id));
assert.ok(Game.hazards.events().some((event) => event.type === 'hazard:reset'));

// A single 120px movement segment still crosses the trap and produces a warning.
hero.x = hero.components.transform.x = 240;
hero.y = hero.components.transform.y = 240;
Game.hazards.initRegion('grassland', damageLayout);
hero.x = hero.components.transform.x = 360;
advanceHazards(1);
assert.ok(Game.hazards.events().some((event) => event.type === 'hazard:warning'), 'swept trigger catches fast movement');

// External periodic Statuses continue on the world fixed tick and clean up at expiry.
const periodicHp = hero.hp;
Game.effects.resolveExternal({
  source: { kind: 'hazard', profileId: thorn.profileId, instanceId: 'periodic:test' },
  targetIds: [hero.id], effects: [{ type: 'applyStatus', statusId: 'grassland.bleeding' }],
  worldTick: 0, tick: 0, regionTier: 1
});
Game.effects.cleanupExternal(20);
assert.ok(hero.hp < periodicHp, 'out-of-encounter Hazard Status resolves periodic damage');
Game.effects.cleanupExternal(120);
assert.equal(hero.components.statuses.some((status) => status.key === 'external:periodic:test:grassland.bleeding'), false);

// Summons attach to world presentation, remain reward-ineligible, respect maxActive, and clean once.
world = reset('forest');
hero = spawnHero('summon:hero', 40, 40);
hero.hp = hero.maxHp = 1e8;
const shaman = Game.actors.spawn({
  instanceId: 'summon:shaman', archetypeId: 'shaman_mosscap', level: 20, tier: 2,
  factionId: 'forest_denizens', controllerId: 'ai:monster', transform: { x: 65, y: 40 },
  spawnSource: { kind: 'test', sourceId: 'summon-runtime', sequence: 2 }
});
shaman.maxHp = 1e8;
shaman.hp = 1e8;
world.hero = hero;
world.entities = [hero, shaman];
let encounter = Game.encounters.start('encounter.forest', { id: 'test:summon', seed: 19, silent: true, world: true });
Game.encounters.join(encounter.id, hero.id, 'party');
Game.encounters.join(encounter.id, shaman.id, 'enemy');
assert.equal(Game.combat.requestAction({
  actorId: shaman.id, targetId: hero.id, abilityId: 'shaman_mosscap.plant_spore_pod'
}).ok, true);
Game.combat.advanceToTick(encounter.id, 40);
let activeSummons = Game.actors.query({ category: 'summon' }).filter((actor) => !actor.dead);
assert.equal(activeSummons.length, 1);
const pod = activeSummons[0];
assert.equal(pod.rewardAuthorized, false);
assert.equal(pod.encounterRewardAuthorized, false);
assert.equal(pod.exp, 0);
assert.equal(pod.gold, 0);
assert.ok(world.entities.some((actor) => actor.id === pod.id));
shaman.components.cooldowns.abilities['shaman_mosscap.plant_spore_pod'] = encounter.tick;
shaman.components.cooldowns.groups.gcd = encounter.tick;
assert.equal(Game.combat.requestAction({
  actorId: shaman.id, targetId: hero.id, abilityId: 'shaman_mosscap.plant_spore_pod'
}).ok, true);
Game.combat.advanceToTick(encounter.id, encounter.tick + 24);
activeSummons = Game.actors.query({ category: 'summon' }).filter((actor) => !actor.dead);
assert.equal(activeSummons.length, 1, 'maxActive prevents a second live summon from the same action');
Game.encounters.end(encounter.id, 'test');
assert.equal(Game.actors.get(pod.id), null);
assert.equal(world.entities.some((actor) => actor.id === pod.id), false);

// Single-use summon resolves its final Effect through formal defeat without kill rewards.
encounter = Game.encounters.start('encounter.mine', { id: 'test:self-destruct', seed: 23, silent: true, world: true });
const keg = Game.actors.spawn({
  instanceId: 'summon:keg', archetypeId: 'summon.powder_keg', level: 20, tier: 3,
  factionId: 'mine_denizens', controllerId: 'ai:monster', transform: { x: 58, y: 40 },
  spawnSource: { kind: 'summon', sourceId: 'kobold_sapper.roll_keg', ownerActorId: 'owner', sequence: 1 }
});
keg.rewardAuthorized = false;
world.attachActor(keg);
Game.encounters.join(encounter.id, hero.id, 'party');
Game.encounters.join(encounter.id, keg.id, 'enemy');
assert.equal(Game.combat.requestAction({
  actorId: keg.id, targetId: hero.id, abilityId: 'summon.powder_keg.fuse_burst'
}).ok, true);
Game.combat.advanceToTick(encounter.id, 30);
assert.equal(keg.dead, true);
assert.equal(keg.rewardAuthorized, false);
Game.encounters.end(encounter.id, 'test');
assert.equal(Game.actors.get(keg.id), null);
assert.equal(world.entities.some((actor) => actor.id === keg.id), false);

// Ambush binds existing Population actors, conceals them until warning resolves,
// then enters cooldown only when the attached Encounter ends.
world = reset('forest');
hero = spawnHero('ambush:hero', 500, 320);
const ambusher = Game.actors.spawn({
  instanceId: 'ambush:actor', archetypeId: 'beetle_mossback', level: 20, tier: 2,
  factionId: 'forest_denizens', controllerId: 'ai:monster', transform: { x: 500, y: 320 },
  spawnSource: { kind: 'population', sourceId: 'spawn.forest.solo-c', sequence: 1 }
});
ambusher.threatId = 'threat:ambush:0';
ambusher.packId = 'forest.solo-c';
world.hero = hero;
world.entities = [hero, ambusher];
world.startEncounter = () => ({ id: 'ambush:encounter', context: {} });
const ambushLayout = {
  version: 3, hazardAnchors: [],
  threats: [{ id: 'threat:ambush:0', defId: 'ambush', x: 500, y: 320 }]
};
world.layout = ambushLayout;
Game.hazards.initRegion('forest', ambushLayout);
const ambush = Game.hazards.all().find((hazard) => hazard.profileId === 'hazard.forest.thicket_ambush');
assert.ok(ambush && !ambush.disabled);
assert.equal(ambusher.hazardConcealed, true);
Game.hazards.forceTrigger(ambush.id, hero.id);
advanceHazards(20);
assert.equal(ambusher.hazardConcealed, false);
assert.equal(Game.hazards.get(ambush.id).phase, 'active');
Game.bus.emit('encounter:ended', { encounterId: 'ambush:encounter' });
assert.equal(Game.hazards.get(ambush.id).phase, 'cooldown');

console.log('Hazard runtime tests passed: fixed ticks, sweep/avoidance, effects, summons, persistence and ambush lifecycle.');
