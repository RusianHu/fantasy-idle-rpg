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
advanceHazards(33);
assert.ok(hero.hp < hpBeforeTrap, 'Hazard damage resolves through the formal external Effect path: ' +
  JSON.stringify({ hp: hero.hp, before: hpBeforeTrap, x: hero.x, y: hero.y, dead: hero.dead, kind: hero.kind,
    partyId: hero.partyId, entities: Game.world.entities.map((actor) => actor.id), transform: hero.components.transform,
    movementTypes: hero.components.body && hero.components.body.movementTypes,
    tick: Game.hazards.tick(), snapshot: Game.hazards.snapshot(), events: Game.hazards.events() }));
assert.equal(Game.hazards.get(thorn.id).phase, 'active',
  'single-pulse damage keeps the active presentation window open for activeTicks');
const activeEndTick = Game.hazards.get(thorn.id).activeEndTick;
assert.ok(activeEndTick > Game.hazards.tick());
advanceHazards(activeEndTick - Game.hazards.tick());
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
advanceHazards(32);
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

// The expanded clue radius exposes only an environmental clue. The stable roll
// narrowly fails balanced detection for this fixture, then succeeds when the
// strategy improves to safe without rerolling the Hazard.
hero.x = hero.components.transform.x = 392;
hero.y = hero.components.transform.y = 240;
Game.hazards.initRegion('grassland', damageLayout);
const clueThorn = Game.hazards.all().find((hazard) => hazard.profileId === 'hazard.grassland.thorn_stakes');
const routeInspection = Game.hazards.inspectPath([
  { x: 200, y: 240 }, { x: 400, y: 240 }
], { instanceIds: [clueThorn.id] });
assert.equal(routeInspection.interactions.length, 1);
assert.ok(routeInspection.interactions[0].clue.distanceAlong <
  routeInspection.interactions[0].reveal.distanceAlong);
assert.ok(routeInspection.interactions[0].reveal.distanceAlong <
  routeInspection.interactions[0].trigger.distanceAlong);
assert.ok(routeInspection.interactions[0].minCenterDistance <= 0.01);
advanceHazards(1);
assert.equal(clueThorn.clueVisible, true);
assert.equal(clueThorn.awareness, 'concealed');
assert.ok(Game.hazards.events().some((event) => event.type === 'hazard:clue'));
hero.x = hero.components.transform.x = 360;
advanceHazards(1);
const balancedDetection = Game.hazards.detectionContext(clueThorn.id, hero.id);
assert.equal(balancedDetection.baseChance, 0.25);
assert.equal(balancedDetection.roll,
  Game.util.strSeed(clueThorn.id + '|hazard-detection-v1') / 4294967296);
assert.equal(balancedDetection.strategy, 'balanced');
assert.equal(balancedDetection.strategyMultiplier, 1);
assert.ok(balancedDetection.roll >= balancedDetection.effectiveChance);
assert.equal(clueThorn.awareness, 'concealed');
assert.equal(Game.hazards.navigationCost(clueThorn.x, clueThorn.y, 'balanced'), 0);
Game.state.settings.expeditionStrategy = 'safe';
advanceHazards(1);
const safeDetection = Game.hazards.detectionContext(clueThorn.id, hero.id);
assert.equal(safeDetection.roll, balancedDetection.roll, 'strategy changes never reroll a Hazard');
assert.equal(safeDetection.strategyMultiplier, 1.6);
assert.ok(safeDetection.roll < safeDetection.effectiveChance);
assert.equal(clueThorn.awareness, 'revealed');
assert.ok(Game.hazards.events().some((event) => event.type === 'hazard:revealed'));
const proximityReveal = Game.hazards.events().find((event) =>
  event.type === 'hazard:revealed' && event.instanceId === clueThorn.id);
assert.equal(proximityReveal.reason, 'proximity');
assert.equal(proximityReveal.detection.roll, balancedDetection.roll);
assert.equal(proximityReveal.detection.expeditionVision, 1);
assert.deepEqual(Array.from(proximityReveal.detection.sources), []);
assert.equal(Game.hazards.snapshot()[0].clueVisible, true);
Game.state.settings.expeditionStrategy = 'balanced';

// Environment sources compose in stable ID order, accept zero, can be removed,
// and isolate invalid or throwing providers without interrupting the fixed tick.
assert.equal(Game.hazards.resetInstance(clueThorn.id), true);
Game.expedition = { currentModifier: () => ({ vision: 0.5 }) };
let fogDetection = Game.hazards.detectionContext(clueThorn.id, hero.id);
assert.equal(fogDetection.expeditionVision, 0.5);
assert.equal(fogDetection.effectiveChance, 0.125);
Game.expedition.currentModifier = () => ({ vision: 2 });
const insightDetection = Game.hazards.detectionContext(clueThorn.id, hero.id);
assert.equal(insightDetection.expeditionVision, 2);
assert.equal(insightDetection.effectiveChance, 0.5);
delete Game.expedition;
assert.equal(Game.hazards.registerDetectionModifierSource('weather:z', () => 0.5), true);
let providerContextSeen = null;
assert.equal(Game.hazards.registerDetectionModifierSource('weather:a', (context) => {
  providerContextSeen = context;
  return 2;
}), true);
let composedDetection = Game.hazards.detectionContext(clueThorn.id, hero.id);
assert.deepEqual(Array.from(composedDetection.sources, (source) => source.id),
  ['weather:a', 'weather:z']);
assert.equal(composedDetection.environmentMultiplier, 1);
assert.equal(providerContextSeen.instanceId, clueThorn.id);
assert.equal(providerContextSeen.region.id, 'grassland');
assert.equal(providerContextSeen.actor, hero);
assert.equal(providerContextSeen.strategy, 'balanced');
assert.ok(Number.isFinite(providerContextSeen.worldTick));
assert.ok(Number.isFinite(providerContextSeen.worldTime));
assert.equal(Game.hazards.registerDetectionModifierSource('weather:blackout', () => 0), true);
assert.equal(Game.hazards.detectionContext(clueThorn.id, hero.id).effectiveChance, 0);
assert.equal(Game.hazards.unregisterDetectionModifierSource('weather:blackout'), true);
const originalWarn = sandbox.console.warn;
let providerWarnings = 0;
sandbox.console.warn = () => { providerWarnings++; };
Game.hazards.registerDetectionModifierSource('weather:invalid', () => 5);
Game.hazards.registerDetectionModifierSource('weather:throwing', () => { throw new Error('fixture'); });
composedDetection = Game.hazards.detectionContext(clueThorn.id, hero.id);
Game.hazards.detectionContext(clueThorn.id, hero.id);
sandbox.console.warn = originalWarn;
assert.equal(providerWarnings, 2, 'each broken source warns at most once');
assert.equal(composedDetection.environmentMultiplier, 1);
['weather:a', 'weather:z', 'weather:invalid', 'weather:throwing'].forEach((sourceId) => {
  assert.equal(Game.hazards.unregisterDetectionModifierSource(sourceId), true);
});
assert.equal(Game.hazards.unregisterDetectionModifierSource('weather:missing'), false);

// A party uses the highest legal Actor-specific chance and reports that detector.
const scout = spawnHero('hazard:scout', hero.x, hero.y);
world.entities.push(scout);
Game.hazards.registerDetectionModifierSource('party:scout', (context) =>
  context.actorId === scout.id ? 2 : 1);
advanceHazards(1);
const partyReveal = Game.hazards.events().filter((event) =>
  event.type === 'hazard:revealed' && event.instanceId === clueThorn.id).at(-1);
assert.equal(partyReveal.detection.actorId, scout.id);
assert.equal(Game.hazards.unregisterDetectionModifierSource('party:scout'), true);
world.entities = world.entities.filter((actor) => actor.id !== scout.id);
assert.equal(Game.hazards.resetInstance(clueThorn.id), true);
assert.equal(Game.hazards.forceReveal(clueThorn.id, 'qa'), true);
assert.equal(clueThorn.awareness, 'revealed');

// A single 120px movement segment still crosses the trap and produces a warning.
hero.x = hero.components.transform.x = 240;
hero.y = hero.components.transform.y = 240;
Game.hazards.initRegion('grassland', damageLayout);
hero.x = hero.components.transform.x = 360;
advanceHazards(1);
assert.ok(Game.hazards.events().some((event) => event.type === 'hazard:warning'), 'swept trigger catches fast movement');

// Auto escape owns the warning response even while a lower-priority chest or
// gathering interaction is active.
world = reset('grassland');
hero = spawnHero('hazard:auto-interaction', 300, 240);
world.hero = hero;
world.entities = [hero];
world.layout = damageLayout;
let cancelledFor = null;
world.cancelInteraction = (reason) => {
  cancelledFor = reason;
  hero.interactOrder = null;
  return true;
};
Game.state.settings.controlMode = 'auto';
hero.interactOrder = { type: 'chest', target: { id: 'test-chest' } };
Game.hazards.initRegion('grassland', damageLayout);
const autoThorn = Game.hazards.all().find((hazard) => hazard.profileId === 'hazard.grassland.thorn_stakes');
assert.equal(Game.hazards.forceTrigger(autoThorn.id, hero.id), true);
assert.equal(cancelledFor, 'hazard');
assert.equal(hero.interactOrder, null);
assert.equal(hero.moveOrder.hazardEscapeId, autoThorn.id);
assert.ok(Game.hazards.events().some((event) => event.type === 'hazard:escapeRequested'));

// Directional placement is aligned to sampled route geometry and publishes its
// coverage metadata for the Hazard Lab.
world = reset('lavacave');
hero = spawnHero('hazard:route-placement', 0, 0);
world.hero = hero;
world.entities = [hero];
const routeLayout = {
  version: 3,
  macro: {
    centers: [{ x: 0, y: 200 }, { x: 400, y: 200 }],
    edges: [{ a: 0, b: 1, kind: 'main' }]
  },
  hazardAnchors: [
    { id: 'route-anchor', x: 200, y: 200, clearance: 64 },
    { id: 'off-route-anchor', x: 200, y: 360, clearance: 64 }
  ],
  threats: [], landmarks: [], nodes: [], curios: [], ecology: []
};
world.layout = routeLayout;
Game.hazards.initRegion('lavacave', routeLayout);
const flameVent = Game.hazards.all().find((hazard) =>
  hazard.profileId === 'hazard.lavacave.flame_vent' && hazard.anchorId === 'route-anchor');
assert.ok(flameVent);
assert.ok(flameVent.placement.triggerRouteIds.length > 0);
assert.ok(Math.abs(Math.sin(flameVent.orientation)) < 0.6,
  `cone orientation follows route axis: ${flameVent.orientation}`);

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
advanceHazards(30);
assert.equal(ambusher.hazardConcealed, false);
assert.equal(Game.hazards.get(ambush.id).phase, 'active');
Game.bus.emit('encounter:ended', { encounterId: 'ambush:encounter' });
assert.equal(Game.hazards.get(ambush.id).phase, 'cooldown');

console.log('Hazard runtime tests passed: fixed ticks, sweep/avoidance, effects, summons, persistence and ambush lifecycle.');
