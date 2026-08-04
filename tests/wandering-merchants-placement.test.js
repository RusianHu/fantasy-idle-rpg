'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const sandbox = {
  console, window: null,
  document: {
    hidden: false,
    documentElement: { lang: 'zh-CN' },
    querySelector: () => null,
    querySelectorAll: () => []
  },
  navigator: { language: 'zh-CN' },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  Math, Number, Date, Object, Array, String, Boolean, JSON,
  Uint8Array, Uint32Array, Int16Array, setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const load = (file) => vm.runInContext(read(file), sandbox, { filename: file });

[
  'js/core/utils.js', 'js/core/eventbus.js', 'js/core/registry.js',
  'js/core/content/rules.js', 'js/core/content/schemas.js',
  'js/core/content/compiler.js', 'js/core/content/audit.js',
  'js/core/content/registry.js', 'js/i18n/i18n.js',
  'js/i18n/zh-CN.js', 'js/i18n/en.js',
  'js/i18n/combat-v2-zh-CN.js', 'js/i18n/combat-v2-en.js',
  'js/core/assets.js', 'js/sprites/palettes.js', 'js/sprites/hero.js',
  'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js',
  'js/sprites/monsters_expansion.js', 'js/sprites/monsters_guards.js', 'js/sprites/props.js',
  'js/sprites/ground-decorations/grassland.generated.js',
  'js/sprites/ground-decorations/forest.generated.js',
  'js/sprites/ground-decorations/mine.generated.js',
  'js/sprites/ground-decorations/graveyard.generated.js',
  'js/sprites/ground-decorations/snowpass.generated.js',
  'js/sprites/ground-decorations/lavacave.generated.js',
  'js/sprites/ground-decorations/skyruins.generated.js',
  'js/sprites/ground-decorations/darkcastle.generated.js',
  'js/sprites/exploration_v3.js',
  'js/data/formulas.js', 'js/data/affixes.js', 'js/data/items.js',
  'js/data/classes.js', 'js/data/skills.js', 'js/data/routes.js',
  'js/core/content/support.js', 'js/data/content/content.generated.js'
].forEach(load);

const Game = sandbox.Game;
Game.content.finalize({ strict: true });
Game.assets.sprite = () => ({ w: 16, h: 20 });
[
  'js/systems/equipment.js', 'js/systems/routes.js',
  'js/systems/state.js', 'js/systems/inventory.js',
  'js/systems/terrain.js', 'js/systems/terrain_v3.js', 'js/systems/terrain_v4.js', 'js/systems/nav.js',
  'js/systems/world_population.js', 'js/systems/world.js'
].forEach(load);

const actorStore = {};
let actorSequence = 0;
Game.actors = {
  get(id) { return actorStore[id] || null; },
  spawn(spec) {
    const archetype = Game.content.get('actorArchetype', spec.archetypeId);
    const id = spec.instanceId || `placement-actor-${++actorSequence}`;
    const actor = {
      id,
      category: archetype.category,
      rank: archetype.rank,
      tags: Array.from(archetype.tags || []),
      sprite: archetype.presentation.spriteId,
      blueprint: {
        archetypeId: archetype.id,
        resolvedProfiles: { rewardProfileId: 'reward.none' }
      },
      x: spec.transform.x,
      y: spec.transform.y,
      hp: 100,
      maxHp: 100,
      state: 'idle',
      components: {
        transform: { x: spec.transform.x, y: spec.transform.y },
        vitals: { hp: 100, maxHp: 100 },
        movement: { intent: null },
        actionState: { state: 'idle' }
      }
    };
    actorStore[id] = actor;
    return actor;
  },
  despawn(id) { delete actorStore[id]; },
  reset() { Object.keys(actorStore).forEach((id) => delete actorStore[id]); }
};

Game.state = Game.State.newGame();
Game.state.settings.autoEquip = false;
Game.player.setClass('fighter');
Game.entryState = 'active';
Game.transitions = { isActive: () => false };
Game.ending = { isActive: () => false };
load('js/systems/merchants.js');

function channelLimits(region, layout) {
  const regionProfile = Game.content.get('regionProfile', region.id);
  const view = Game.content.populationView(regionProfile.populationProfileId);
  return {
    regular: layout.threats.length,
    npc: view.channels.npc ? view.channels.npc.capacity : 0,
    guardian: layout.version >= 4 ? 0 : (layout.guardian ? 1 : 0),
    boss: 1,
    rare: layout.version >= 4 ? 1 : 0
  };
}

function prepare(region, seed, layoutVersion = 3) {
  Game.population.reset(region.id);
  Game.state.world.region = region.id;
  Game.state.world.worldSeed = seed >>> 0;
  Game.state.world.layoutVersion = layoutVersion;
  const layout = Game.terrain.generate(region, seed, layoutVersion);
  Game.terrain.mount(layout, region);
  const plan = Game.population.prepareRegion(region.id, layout, {
    tier: region.tier,
    worldSeed: seed >>> 0,
    expeditionIndex: 0,
    modifiers: [],
    rewardMultiplier: 1,
    channelLimits: channelLimits(region, layout)
  });
  assert.equal(plan.ok, true, `${region.id}:${seed} population plan`);
  Game.world.region = Object.assign({}, region, { world: layout.world });
  Game.world.layout = layout;
  Game.world.entities = [];
  Game.world.bossEnt = null;
  return { layout, plan };
}

function heroPoints(layout) {
  const corridor = layout.corridor && layout.corridor.points || [];
  return [
    { id: 'camp', x: layout.camp.x, y: layout.camp.y },
    Object.assign({ id: 'mid' }, corridor[Math.floor(corridor.length / 2)] || layout.camp),
    { id: 'boss', x: layout.bossPoint.x, y: layout.bossPoint.y }
  ];
}

const regions = Game.reg.all('region');
const seeds = [0x10203040, 0x89ABCDEF, 0xC0FFEE11, 0xF17ECAFE];
let placementCases = 0;

for (const region of regions) {
  const merchantProfile = Game.merchants.profileForRegion(region.id);
  const spawnProfile = Game.content.get('worldSpawnProfile', merchantProfile.spawnProfileId);
  assert.equal(spawnProfile.placement.source, 'walkableNav', `${region.id} merchant uses nav cells`);
  assert.ok(spawnProfile.placement.minClearance >= Game.merchants.constants.patrolRadius + 16);
  for (const seed of seeds) {
    const { layout, plan } = prepare(region, seed);
    for (const hero of heroPoints(layout)) {
      const audit = Game.merchants.inspectPlacement({
        regionId: region.id,
        seed: Game.util.strSeed(`${seed}|${region.id}|${hero.id}`),
        layout,
        heroPoint: hero,
        reservations: plan.reservations,
        full: false
      });
      assert.equal(audit.ok, true,
        `${region.id}:${seed}:${hero.id} ${JSON.stringify(audit.failureCounts)}`);
      assert.equal(audit.source, 'walkableNav');
      assert.ok(audit.sourceTotal > layout.threats.length,
        `${region.id}:${seed} merchant source must not collapse to threat slots`);
      assert.ok(audit.chosen.clearance >= spawnProfile.placement.minClearance);
      assert.ok(audit.chosen.danger <= spawnProfile.placement.maxDanger);
      assert.ok(audit.chosen.heroDistance >= Game.merchants.constants.minHeroDistance);
      assert.ok(audit.chosen.heroDistance <= Game.merchants.constants.maxHeroDistance);
      assert.ok(audit.chosen.campDistance >= audit.constraints.minCampDistance);
      assert.ok(audit.chosen.bossDistance >= audit.constraints.minBossDistance);
      const repeat = Game.merchants.inspectPlacement({
        regionId: region.id,
        seed: audit.seed,
        layout,
        heroPoint: hero,
        reservations: plan.reservations,
        full: false
      });
      assert.deepEqual(repeat.chosen, audit.chosen, `${region.id}:${seed}:${hero.id} deterministic`);
      placementCases++;
    }
  }
}

let v4PlacementCases = 0;
for (const region of regions) {
  for (const seed of seeds) {
    const { layout, plan } = prepare(region, seed, 4);
    const hero = heroPoints(layout)[1];
    const audit = Game.merchants.inspectPlacement({
      regionId: region.id,
      seed: Game.util.strSeed(`${seed}|${region.id}|v4-reservation`),
      layout,
      heroPoint: hero,
      reservations: plan.reservations,
      full: false
    });
    assert.equal(audit.ok, true, `${region.id}:${seed}:v4 ${JSON.stringify(audit.failureCounts)}`);
    for (const nest of layout.nests) {
      const nx = (audit.chosen.x - nest.x) / (nest.rx * 1.2 + audit.chosen.occupancyRadius);
      const ny = (audit.chosen.y - nest.y) / (nest.ry * 1.2 + audit.chosen.occupancyRadius);
      assert.ok(nx * nx + ny * ny > 1, `${region.id}:${seed} merchant overlaps ${nest.id}`);
    }
    const reserved = [].concat(layout.treasureSites, layout.guardSites, layout.bossGatePoint);
    reserved.forEach((site) => assert.ok(
      Game.util.dist(audit.chosen.x, audit.chosen.y, site.x, site.y) >=
        audit.chosen.occupancyRadius + (site.kind === 'guardSite' ? 72 : 64),
      `${region.id}:${seed} merchant overlaps ${site.id}`
    ));
    v4PlacementCases++;
  }
}

// Natural movement discovery is a transaction: a successful Population lease and
// world attachment must both exist before persistent encounter state is committed.
const region = Game.reg.get('region', 'graveyard');
const prepared = prepare(region, 0xA11CE55);
const hero = heroPoints(prepared.layout)[1];
Game.world.hero = {
  id: 'hero', kind: 'hero', x: hero.x, y: hero.y,
  hp: 100, maxHp: 100, state: 'idle', encounterId: null, interactOrder: null,
  components: { transform: { x: hero.x, y: hero.y } }
};
Game.state.world.mode = 'battle';
Game.state.world.worldTime = 100;

const originalMaterialize = Game.population.materialize;
const originalLease = Game.population.lease;
const originalClose = Game.population.close;
const originalAttach = Game.world.attachActor;
const leases = {};
let closeCalls = 0;
let materializeCalls = 0;
Game.population.materialize = function (profileId, context) {
  materializeCalls++;
  const actor = {
    id: `merchant-runtime-${materializeCalls}`,
    tags: ['merchant', 'wandering-merchant'],
    x: context.x, y: context.y, hp: 100, maxHp: 100, state: 'idle',
    components: {
      transform: { x: context.x, y: context.y },
      movement: { intent: null }, actionState: { state: 'idle' }
    }
  };
  actorStore[actor.id] = actor;
  const lease = { spawnId: `merchant-lease-${materializeCalls}`, actorIds: [actor.id] };
  leases[lease.spawnId] = lease;
  return { ok: true, primary: actor, actors: [actor], lease };
};
Game.population.lease = (id) => leases[id] || null;
Game.population.close = function (id) {
  const lease = leases[id];
  if (!lease) return false;
  lease.actorIds.forEach((actorId) => delete actorStore[actorId]);
  delete leases[id];
  closeCalls++;
  return true;
};

let discoveredEvents = 0;
Game.bus.on('merchant:discovered', () => { discoveredEvents++; });
const state = Game.merchants.regionState(region.id);
state.movementSeconds = state.targetSeconds;
Game.world.attachActor = () => false;
assert.equal(Game.merchants.recordHeroMovement(56), false);
assert.equal(state.ordinal, 0);
assert.equal(state.firstEncountered, false);
assert.equal(state.activeEvent, null);
assert.ok(state.movementSeconds >= state.targetSeconds, 'failed discovery preserves eligibility');
assert.equal(discoveredEvents, 0);
assert.equal(closeCalls, 1, 'attach failure closes the uncommitted lease');

Game.world.attachActor = originalAttach;
Game.state.world.worldTime += 3;
assert.equal(Game.merchants.recordHeroMovement(56), true);
assert.equal(state.ordinal, 1);
assert.equal(state.firstEncountered, true);
assert.ok(state.activeEvent);
assert.equal(discoveredEvents, 1);
const runtime = Game.merchants.runtime();
const merchant = actorStore[runtime.actorId];
assert.ok(merchant);
assert.equal(merchant.merchantPatrolRadius, Game.merchants.constants.patrolRadius);
assert.deepEqual(
  [merchant.spawnX, merchant.spawnY],
  [state.activeEvent.x, state.activeEvent.y],
  'merchant patrol remains centered on the wagon anchor'
);

const tradeArea = Game.merchants.tradeAreas()[0];
assert.deepEqual(
  [tradeArea.anchor.x, tradeArea.anchor.y, tradeArea.radius],
  [state.activeEvent.x, state.activeEvent.y, Game.merchants.constants.tradeRadius]
);

let maxPatrolDistance = 0;
const patrolRng = Game.util.seededRng(0x51515151);
for (let tick = 0; tick < 1200; tick++) {
  Game.world.updateAmbientActor(merchant, 0.05, { rng: patrolRng });
  maxPatrolDistance = Math.max(maxPatrolDistance, Game.util.dist(
    merchant.x, merchant.y, state.activeEvent.x, state.activeEvent.y
  ));
}
assert.ok(maxPatrolDistance <= Game.merchants.constants.patrolRadius + 0.5,
  `merchant left wagon patrol radius: ${maxPatrolDistance}`);
assert.deepEqual(
  [Game.merchants.tradeAreas()[0].anchor.x, Game.merchants.tradeAreas()[0].anchor.y],
  [state.activeEvent.x, state.activeEvent.y],
  'trade area stays fixed while the Actor patrols'
);

Game.population.materialize = originalMaterialize;
Game.population.lease = originalLease;
Game.population.close = originalClose;
Game.world.attachActor = originalAttach;

console.log(
  `Wandering merchant placement passed: ${placementCases} v3 and ${v4PlacementCases} v4 audits, ` +
  `transaction rollback and ${maxPatrolDistance.toFixed(2)}px max patrol.`
);
