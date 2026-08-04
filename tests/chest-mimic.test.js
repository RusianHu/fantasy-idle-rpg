'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const sandbox = {
  console, window: null,
  document: {
    documentElement: { lang: 'zh-CN' },
    querySelector: () => null,
    querySelectorAll: () => []
  },
  navigator: { language: 'zh-CN' },
  localStorage: { getItem: () => null, setItem() {} },
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

load('js/core/utils.js');
load('js/core/eventbus.js');
load('js/data/formulas.js');
const Game = sandbox.Game;

let gold = 0;
let materials = 0;
let crystals = 0;
let closeCalls = 0;
let detachCalls = 0;
let encounterSequence = 0;
const attached = [];
const opened = [];
const revealed = [];
const escaped = [];

Game.transitions = { isActive: () => false };
Game.ending = { isActive: () => false };
Game.terrain = {
  isWalkable: () => true,
  costAt: () => 1,
  distanceToPath: () => 99
};
Game.State = { regionTier: () => 1 };
Game.player = {
  addGold(value) { gold += value; },
  addCrystal(value) { crystals += value; },
  derived() { return { dropMul: 1, rarityLuck: 0 }; }
};
Game.inv = {
  addMaterial(id, value) { if (id) materials += value; },
  deliverDrops() {}
};
Game.loot = {
  plan(context, state) { return { items: [], nextState: state || {} }; },
  accept(plan) {
    Game.state.inv.loot = plan.nextState;
    return plan.items.slice();
  }
};
Game.fx = { ring() {}, poof() {} };
Game.population = {
  materialize(profileId, context) {
    const actor = {
      id: `actor:${profileId}:${context.spawnRequestKey}`,
      x: context.x, y: context.y
    };
    return {
      ok: true,
      lease: { spawnId: `lease:${profileId}:${context.spawnRequestKey}` },
      primary: actor,
      actors: [actor]
    };
  },
  close() {
    closeCalls++;
    return true;
  }
};

Game.state = {
  settings: {
    effects: false, groundLoot: false,
    expeditionStrategy: 'balanced'
  },
  player: { level: 1, classId: 'fighter' },
  inv: { loot: {} },
  world: {
    mode: 'battle', region: 'grassland', worldSeed: 0x1234abcd,
    nodeCooldowns: {},
    chestMimic: { rollOrdinal: 0, genuineOpenedSinceMimic: 0 }
  },
  meta: { stats: { chests: 0 } }
};
Game.world = {
  BOUND_TOP: 0,
  bossEnt: null,
  hero: {
    id: 'hero', x: 240, y: 180, hp: 100, maxHp: 100,
    components: { vitals: { hp: 100, maxHp: 100 } }
  },
  layout: {
    version: 3,
    world: { w: 900, h: 520 },
    camp: { x: 60, y: 60 },
    campSafeRadius: 40,
    bossPoint: { x: 820, y: 420 },
    bossSafeRadius: 60,
    spawnCandidates: []
  },
  region: {
    exploration: { resources: [{ material: 'herb' }] }
  },
  attachActor(actor) {
    attached.push(actor);
    return true;
  },
  detachActor() {
    detachCalls++;
    return true;
  },
  startEncounter(actor) {
    encounterSequence++;
    return { id: `mimic-encounter:${encounterSequence}`, actorId: actor.id };
  },
  cancelInteraction() {}
};

load('js/systems/environment.js');

Game.bus.on('chest:opened', (event) => opened.push(event));
Game.bus.on('chest:mimicRevealed', (event) => revealed.push(event));
Game.bus.on('chest:mimicEscaped', (event) => escaped.push(event));

function firstMimicOrdinal(seed, rid) {
  for (let ordinal = 0; ordinal < 10000; ordinal++) {
    const roll = Game.util.strSeed([seed >>> 0, ordinal, rid, 'hoard-mimic'].join('|')) % 10000;
    if (roll < 1500) return ordinal;
  }
  throw new Error('No deterministic Mimic ordinal found');
}

// Auto mode observes per-strategy HP gates; manual click routing is outside Env.
Game.world.hero.components.vitals.hp = 49;
assert.equal(Game.environment.autoChestReady(), false);
Game.world.hero.components.vitals.hp = 50;
assert.equal(Game.environment.autoChestReady(), true);
Game.state.settings.expeditionStrategy = 'safe';
Game.world.hero.components.vitals.hp = 69;
assert.equal(Game.environment.autoChestReady(), false);
Game.world.hero.components.vitals.hp = 70;
assert.equal(Game.environment.autoChestReady(), true);
Game.state.settings.expeditionStrategy = 'loot';
Game.world.hero.components.vitals.hp = 35;
assert.equal(Game.environment.autoChestReady(), true);

// The production sequence simulator enforces at least two genuine openings after
// every Mimic before another roll can be eligible.
const sequence = Game.environment.simulateMimicSequence(120, {
  worldSeed: Game.state.world.worldSeed,
  regionId: 'grassland',
  rollOrdinal: 0,
  genuineOpenedSinceMimic: 2
});
const mimicIndexes = sequence.entries.filter((entry) => entry.mimic).map((entry) => entry.index);
for (let index = 1; index < mimicIndexes.length; index++) {
  assert.ok(mimicIndexes[index] - mimicIndexes[index - 1] >= 3);
}

// An eligible deterministic roll commits only when openChest is called (the
// world interaction owns the preceding 0.8 second opening timer).
Game.F.BAL.chestRareChance = 0;
Game.state.world.chestMimic.rollOrdinal = firstMimicOrdinal(
  Game.state.world.worldSeed, Game.state.world.region
);
Game.state.world.chestMimic.genuineOpenedSinceMimic = 2;
const chest = Game.environment.spawnChest();
assert.ok(chest && chest.oddity, 'eligible chest exposes only the subtle production tell');
const outcome = Game.environment.openChest(chest);
assert.equal(outcome.outcome, 'mimic');
assert.equal(Game.environment.chests().length, 0);
assert.equal(attached.length, 1);
assert.equal(revealed.length, 1);
assert.equal(Game.state.world.chestMimic.genuineOpenedSinceMimic, 0);
assert.equal(Game.state.meta.stats.chests, 0, 'Mimic reveal does not count as an opened chest');

// Victory grants the deferred common chest reward once. The normal world kill
// listener independently owns monster EXP/gold/drop/kill settlement.
Game.bus.emit('actor:defeated', {
  targetActorIds: [outcome.actorId],
  sourceActorId: 'hero'
});
assert.equal(Game.state.meta.stats.chests, 1);
assert.equal(opened.length, 1);
assert.equal(opened[0].source, 'mimic');
assert.ok(gold > 0 && materials > 0);
assert.equal(crystals, 0, 'common chest draft never grants rare crystal rewards');

// A second reveal that ends without defeat removes only the ephemeral actor and
// emits no chest reward.
Game.environment.resetRegion();
Game.state.world.chestMimic.rollOrdinal = firstMimicOrdinal(
  Game.state.world.worldSeed, Game.state.world.region
);
Game.state.world.chestMimic.genuineOpenedSinceMimic = 2;
const retreatChest = Game.environment.spawnChest();
const retreatOutcome = Game.environment.openChest(retreatChest);
assert.equal(retreatOutcome.outcome, 'mimic');
Game.bus.emit('encounter:ended', {
  encounterId: retreatOutcome.encounterId,
  payload: { reason: 'player-defeated' }
});
assert.equal(escaped.length, 1);
assert.equal(Game.state.meta.stats.chests, 1);
assert.ok(closeCalls >= 1 && detachCalls >= 1);

console.log('Chest Mimic tests passed: HP gates, deterministic protection, reveal transaction, victory reward and retreat cleanup.');
