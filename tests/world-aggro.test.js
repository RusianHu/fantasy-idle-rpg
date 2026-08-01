'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sandbox = {
  console, Math, Number, Date, Object, Array, String, Boolean, JSON,
  setTimeout, clearTimeout, window: null
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['js/core/utils.js', 'js/core/eventbus.js']) {
  vm.runInContext(read(file), sandbox, { filename: file });
}

const Game = sandbox.Game;
const actors = new Map();
const policies = {
  hostile: {
    id: 'hostile', autoAggro: true, aggroRadius: 64, contactRadius: 34,
    assistRadius: 96, maxAssistPacks: 1, requiresLineOfSight: true
  },
  neutral: {
    id: 'neutral', autoAggro: false, aggroRadius: 64, contactRadius: 34,
    assistRadius: 0, maxAssistPacks: 0, requiresLineOfSight: true
  }
};
const events = [];
['aggro:detected', 'encounter:assistJoined', 'encounter:evadeStarted',
  'encounter:evadeCompleted'].forEach((name) => {
  Game.bus.on(name, (payload) => events.push({ name, payload }));
});

Game.contentCompiler = {
  clone: (value) => JSON.parse(JSON.stringify(value)),
  deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(Game.contentCompiler.deepFreeze);
    }
    return value;
  }
};
Game.content = {
  get(type, id) {
    if (type === 'engagementPolicy') return policies[id] || null;
    if (type === 'encounterPack') return { id, groupAlert: true };
    return null;
  }
};
Game.state = {
  settings: { controlMode: 'manual' },
  world: { mode: 'battle', worldTime: 10 }
};
Game.player = { hasClass: () => true };
Game.transitions = { isActive: () => false };
Game.ending = { isActive: () => false };
Game.relations = {
  resolve(sourceId) { return sourceId.startsWith('neutral') ? 'neutral' : 'hostile'; }
};
Game.actors = {
  get: (id) => actors.get(id) || null,
  despawn(id) { actors.delete(id); }
};
Game.population = {
  lease(spawnId) {
    return { slotId: spawnId.startsWith('guardian') ? 'guardian:test' : 'regular:test' };
  }
};
Game.nav = { clear(actor) { if (actor) actor.navRoute = null; } };
Game.terrain = {
  hasLineOfSight(from) { return !from.losBlocked; },
  projectPoint(x, y) { return { x, y }; }
};
Game.actionBubbles = { show() {} };

function actor(id, x, options = {}) {
  const value = {
    id, kind: 'monster', category: 'monster', rank: options.rank || 'normal',
    x, y: options.y || 100, spawnX: options.spawnX ?? x, spawnY: options.spawnY ?? (options.y || 100),
    packAnchorX: options.packAnchorX ?? x, packAnchorY: options.packAnchorY ?? (options.y || 100),
    packLeashRadius: options.packLeashRadius ?? 130,
    packAnchorId: options.packAnchorId || `pack:${id}`,
    packId: options.packId || `encounter-pack:${id}`,
    packMemberIds: options.packMemberIds || [id],
    spawnId: options.spawnId || `regular:${id}`,
    memberSlotId: options.memberSlotId || 'member',
    socialGroupId: options.socialGroupId || 'hostile:test',
    encounterId: options.encounterId || null,
    teamId: options.teamId || null,
    lifecycle: options.lifecycle || 'active', dead: !!options.dead,
    hp: options.hp ?? 100, maxHp: 100,
    blueprint: { resolvedProfiles: { engagementPolicyId: options.policy || 'hostile' } },
    components: {
      vitals: { hp: options.hp ?? 100, maxHp: 100, shields: [] },
      actionState: { state: 'idle' }, movement: { intent: null, path: null, moving: false },
      statuses: []
    }
  };
  Object.defineProperties(value, {
    hp: {
      get() { return this.components.vitals.hp; },
      set(next) { this.components.vitals.hp = next; }, configurable: true
    },
    maxHp: { get() { return this.components.vitals.maxHp; }, configurable: true }
  });
  actors.set(id, value);
  return value;
}

const hero = actor('hero', 100, { spawnId: 'hero', packAnchorId: 'hero' });
hero.kind = 'hero';
hero.category = 'player';
hero.state = 'idle';
let started = null;
const joined = [];
const ended = [];
Game.encounters = {
  get: (id) => started && started.id === id ? started : null,
  join(id, actorId, teamId) {
    const target = actors.get(actorId);
    if (!started || started.id !== id || target.encounterId) return false;
    started.participants.push(actorId);
    started.threatTables[actorId] = {};
    target.encounterId = id;
    target.teamId = teamId;
    joined.push(actorId);
    return true;
  },
  end(id, reason, result) {
    if (!started || started.id !== id) return null;
    started.lifecycle = 'ended';
    started.participants.forEach((actorId) => {
      const target = actors.get(actorId);
      if (target) { target.encounterId = null; target.teamId = null; }
    });
    ended.push({ id, reason, result });
    return { reason, ...result };
  }
};
Game.world = {
  hero, entities: [hero], cinematic: null,
  isWithinEncounterLeash(source, target) {
    return Game.util.dist(source.x, source.y,
      target.packAnchorX, target.packAnchorY) <= target.packLeashRadius - 8;
  },
  startEncounter(target, options) {
    started = {
      id: 'world:test', lifecycle: 'active', participants: [hero.id, target.id],
      threatTables: { [target.id]: {} },
      context: {
        world: true, initialPackId: target.packAnchorId, assistPackIds: [],
        assistPackActorIds: {}, leashActorId: hero.id,
        leashZones: [{
          packId: target.packAnchorId, x: target.packAnchorX, y: target.packAnchorY,
          radius: target.packLeashRadius, actorIds: target.packMemberIds.slice()
        }],
        engagement: {
          reason: options.reason, initiatorActorId: options.initiatorActorId,
          socialGroupId: target.socialGroupId, maxAssistPacks: 1
        }
      }
    };
    hero.encounterId = started.id; hero.teamId = 'party';
    target.encounterId = started.id; target.teamId = 'enemy';
    Game.worldAggro.seedThreat(started, [target], hero);
    Game.world.lastStart = { target, options };
    return started;
  },
  moveToward(target, tx, ty) {
    if (target.blockReturn) return Game.util.dist(target.x, target.y, tx, ty);
    const distance = Game.util.dist(target.x, target.y, tx, ty);
    if (distance <= 5) return distance;
    target.x += (tx - target.x) / distance * Math.min(8, distance);
    target.y += (ty - target.y) / distance * Math.min(8, distance);
    return Game.util.dist(target.x, target.y, tx, ty);
  }
};

vm.runInContext(read('js/systems/world_aggro.js'), sandbox,
  { filename: 'js/systems/world_aggro.js' });
const Aggro = Game.worldAggro;

// Both manual and auto world modes allow monster-side perception. Equal-distance
// candidates resolve by stable Population identity, not insertion order.
const fartherKey = actor('monster-b', 140, { spawnId: 'regular:b' });
const stableWinner = actor('monster-a', 60, { spawnId: 'regular:a' });
Game.world.entities.push(fartherKey, stableWinner);
assert.equal(Aggro.findDetection(hero).actor.id, 'monster-a');
Aggro.update(0.1);
assert.equal(Game.world.lastStart.target.id, 'monster-a');
assert.equal(Game.world.lastStart.options.initiatorActorId, 'monster-a');
assert.equal(events.filter((event) => event.name === 'aggro:detected').length, 1);

// Reset the fixture and verify the exclusion gates independently.
Aggro.reset();
hero.encounterId = null;
fartherKey.encounterId = null; fartherKey.teamId = null;
stableWinner.encounterId = null; stableWinner.teamId = null;
stableWinner.losBlocked = true;
assert.equal(Aggro.detectionCandidate(stableWinner, hero), null, 'hard wall blocks LOS');
stableWinner.losBlocked = false;
stableWinner.blueprint.resolvedProfiles.engagementPolicyId = 'neutral';
assert.equal(Aggro.detectionCandidate(stableWinner, hero), null, 'autoAggro:false stays passive');
stableWinner.blueprint.resolvedProfiles.engagementPolicyId = 'hostile';
stableWinner.packAnchorX = 300;
assert.equal(Aggro.detectionCandidate(stableWinner, hero), null, 'outside leash entry is rejected');
stableWinner.packAnchorX = stableWinner.x;
Game.state.settings.controlMode = 'auto';
assert.equal(Aggro.detectionCandidate(stableWinner, hero).actor.id, stableWinner.id,
  'auto mode uses the same monster perception');

// Initial pack is already active. Only the nearest regular pack from the same
// social group may assist; a third pack and guardian cannot chain into combat.
started = {
  id: 'world:assist', lifecycle: 'active', participants: [hero.id, stableWinner.id],
  threatTables: { [stableWinner.id]: { [hero.id]: 1 } },
  context: {
    world: true, initialPackId: stableWinner.packAnchorId,
    assistPackIds: [], assistPackActorIds: {}, leashZones: [],
    engagement: { socialGroupId: 'hostile:test', maxAssistPacks: 1 }
  }
};
hero.encounterId = started.id; hero.teamId = 'party';
stableWinner.encounterId = started.id; stableWinner.teamId = 'enemy';
const assistA1 = actor('assist-a1', 150, {
  spawnId: 'regular:assist-a', packAnchorId: 'pack:assist-a',
  packMemberIds: ['assist-a1', 'assist-a2']
});
const assistA2 = actor('assist-a2', 153, {
  spawnId: 'regular:assist-a', packAnchorId: 'pack:assist-a',
  packMemberIds: ['assist-a1', 'assist-a2'], memberSlotId: 'member-b'
});
const assistB = actor('assist-b', 170, {
  spawnId: 'regular:assist-b', packAnchorId: 'pack:assist-b'
});
const guardian = actor('guardian', 145, {
  spawnId: 'guardian:gate', packAnchorId: 'pack:guardian', rank: 'elite'
});
Game.world.entities = [hero, stableWinner, assistA1, assistA2, assistB, guardian];
const assisted = Aggro.checkAssist(started, hero);
assert.deepEqual([...assisted].map((value) => value.id).sort(), ['assist-a1', 'assist-a2']);
assert.deepEqual(Array.from(started.context.assistPackIds), ['pack:assist-a']);
assert.equal(started.threatTables['assist-a1'][hero.id], 1, 'assist receives base threat');
assert.equal(started.context.leashZones.length, 1, 'assist contributes its leash zone');
assert.equal(Aggro.checkAssist(started, hero), null, 'assist cap prevents chain propagation');
assert.equal(assistB.encounterId, null);
assert.equal(guardian.encounterId, null);

// Summons are encounter participants but are not world packs and despawn through
// encounter cleanup. Defeated members never enter Evade or regain health.
const defeated = actor('defeated', 125, { hp: 0, dead: true, encounterId: started.id, teamId: 'enemy' });
const summon = actor('summon', 128, { encounterId: started.id, teamId: 'enemy' });
summon.spawnSource = { kind: 'summon' };
summon.rewardAuthorized = false;
started.participants.push(defeated.id, summon.id);
for (const id of [assistA1.id, assistA2.id]) {
  const value = actors.get(id);
  value.x += 80;
  value.hp = 25;
}
assert.equal(Aggro.beginEvade(started, 'leash'), true);
assert.equal(ended.at(-1).reason, 'leash');
assert.equal(Aggro.isEvading(assistA1), true);
assert.equal(Aggro.isEvading(defeated), false);
assert.equal(Aggro.isEvading(summon), false);
assert.equal(assistA1.hp, 25, 'Evade does not heal before reaching home');

for (let i = 0; i < 30 && Aggro.isEvading(assistA1); i++) {
  Aggro.updateEvader(assistA1, 0.1);
}
assert.equal(Aggro.isEvading(assistA1), false);
assert.equal(assistA1.hp, assistA1.maxHp, 'arrival restores full health');
assert.ok(Game.util.dist(assistA1.x, assistA1.y, assistA1.spawnX, assistA1.spawnY) <= 6);

assistA2.blockReturn = true;
for (let i = 0; i < 45 && Aggro.isEvading(assistA2); i++) {
  Aggro.updateEvader(assistA2, 0.1);
}
assert.equal(Aggro.isEvading(assistA2), false, '4s watchdog projects a blocked evader home');
assert.equal(assistA2.hp, assistA2.maxHp);
const snapshot = Aggro.snapshot();
assert.equal(snapshot.diagnostics.evadeRouteResets >= 1, true);
assert.equal(snapshot.diagnostics.evadeProjections >= 1, true);
assert.equal(Object.isFrozen(snapshot), true, 'snapshot is read-only');
assert.equal(events.some((event) => event.name === 'encounter:assistJoined'), true);
assert.equal(events.some((event) => event.name === 'encounter:evadeStarted'), true);
assert.equal(events.some((event) => event.name === 'encounter:evadeCompleted'), true);

console.log('world aggro, assist and Evade tests passed');
