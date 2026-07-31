'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sandbox = {
  console, setTimeout, clearTimeout, performance: { now: () => 0 },
  Math, Number, Date, Object, Array, String, Boolean, JSON, isFinite,
  document: { addEventListener() {} }
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);
for (const file of ['js/core/utils.js', 'js/core/eventbus.js', 'js/core/registry.js']) {
  vm.runInContext(read(file), sandbox, { filename: file });
}

const Game = sandbox.Game;
const actors = new Map();
const encounters = new Map();
let encounterStarts = 0;

Game.F = { BAL: {} };
Game.state = {
  settings: { combatStrategy: 'balanced', combatTactics: {} },
  player: { hp: 100 },
  world: { mode: 'battle', worldTime: 12 },
  meta: { stats: {} }
};
Game.relations = { resolve: () => 'hostile' };
Game.actors = { get: (id) => actors.get(id) || null };
Game.encounters = {
  start(profileId, context) {
    encounterStarts++;
    const encounter = {
      id: context.id, profileId, context, lifecycle: 'active',
      participants: [], teams: {}
    };
    encounters.set(encounter.id, encounter);
    return encounter;
  },
  join(id, actorId, teamId) {
    const encounter = encounters.get(id);
    const actor = actors.get(actorId);
    encounter.participants.push(actorId);
    encounter.teams[teamId] = encounter.teams[teamId] || { id: teamId, members: [] };
    encounter.teams[teamId].members.push(actorId);
    actor.encounterId = id;
    actor.teamId = teamId;
    return true;
  },
  get: (id) => encounters.get(id) || null,
  all: () => Array.from(encounters.values()),
  end(id, reason) {
    const encounter = encounters.get(id);
    if (encounter) encounter.lifecycle = 'ended';
    for (const actorId of encounter ? encounter.participants : []) {
      const actor = actors.get(actorId);
      actor.encounterId = null;
      actor.teamId = null;
    }
    return { reason };
  }
};
Game.combatAI = { strategy() {} };
Game.nav = { finder: null, clear(ent) { if (ent) ent.navRoute = null; } };
Game.terrain = { costAt: () => 1 };
Game.particles = null;

vm.runInContext(read('js/systems/world.js'), sandbox, { filename: 'js/systems/world.js' });
const W = Game.world;
W.region = { id: 'grassland', world: { w: 900, h: 520 } };
W.layout = { version: 2 };

const hero = {
  id: 'player-world', kind: 'hero', x: 199, y: 180, encounterId: null,
  components: {
    vitals: { hp: 100, maxHp: 100, shields: [] },
    targeting: { currentTargetId: null, priorityTargetId: null },
    movement: { intent: null }
  },
  target: null, moveOrder: null
};
Object.defineProperties(hero, {
  hp: { get() { return this.components.vitals.hp; }, set(value) { this.components.vitals.hp = value; } },
  maxHp: { get() { return this.components.vitals.maxHp; } }
});
const monster = {
  id: 'monster-a', kind: 'monster', category: 'monster', rank: 'normal',
  x: 127, y: 180, spawnX: 127, spawnY: 180, hp: 100, maxHp: 100,
  dead: false, packId: 'grassland.solo-a', packAnchorId: 'threat-a',
  packAnchorX: 0, packAnchorY: 180, packLeashRadius: 144,
  packMemberIds: ['monster-a'], territory: { radius: 165 },
  rewardScale: 1, components: { vitals: { hp: 100, maxHp: 100 } }
};
actors.set(hero.id, hero);
actors.set(monster.id, monster);
W.hero = hero;
W.entities = [hero, monster];

// Reproduces the reported geometry: the bubble can appear at 72px, but the
// hero is already outside the pack leash and must not create a one-tick fight.
assert.equal(Game.util.dist(hero.x, hero.y, monster.x, monster.y), 72);
assert.equal(W.isWithinEncounterLeash(hero, monster), false);
assert.equal(W.startEncounter(monster), null);
assert.equal(encounterStarts, 0, 'invalid leash entry never emits an encounter start');
assert.equal(hero.encounterId, null);

hero.x = 130;
assert.equal(W.isWithinEncounterLeash(hero, monster), true);
const encounter = W.startEncounter(monster);
assert.ok(encounter && encounter.lifecycle === 'active');
assert.equal(encounterStarts, 1);
assert.equal(hero.encounterId, encounter.id);

W.endEncounter('test-reset');
monster.spawnX = 28;
monster.x = 28;
assert.equal(W.monsterPatrolRadius(monster), 108,
  'pack spacing and entry margin are reserved inside the shared leash');

const originalRand = Game.util.rand;
Game.util.rand = (_min, max) => max;
monster.wx = 0;
monster.wy = 0;
monster.wanderT = 1;
W.wanderTick(monster, 0, 26, monster.spawnX, monster.spawnY,
  W.monsterPatrolRadius(monster));
Game.util.rand = originalRand;
assert.ok(Game.util.dist(monster.wx, monster.wy, monster.spawnX, monster.spawnY) <= 108.001,
  'stale targets are replanned and square samples are projected into the patrol radius');

const entranceBoss = {
  id: 'boss-entrance', kind: 'monster', boss: true,
  x: 320, y: 240, spawnX: 320, spawnY: 240,
  encounterId: null, state: 'entrance', moving: true,
  flash: 0, lungeT: 0, animT: 0,
  components: { transform: {}, vitals: { hp: 100, maxHp: 100 } }
};
let bossWandered = false;
const originalWanderTick = W.wanderTick;
W.wanderTick = () => { bossWandered = true; };
W.bossEnt = entranceBoss;
W.cinematic = { ent: entranceBoss, t: 1 };
W.updateMonster(entranceBoss, 0.5);
assert.deepEqual([entranceBoss.x, entranceBoss.y], [320, 240]);
assert.equal(entranceBoss.state, 'entrance');
assert.equal(entranceBoss.moving, false);
assert.equal(bossWandered, false, 'Boss cannot patrol during its entrance cinematic');
W.cinematic = null;
W.updateMonster(entranceBoss, 0.5);
assert.equal(entranceBoss.state, 'idle');
assert.equal(bossWandered, false, 'summoned Boss guards the entrance until an Encounter starts');
W.bossEnt = null;
W.wanderTick = originalWanderTick;

console.log('world encounter leash tests passed');
