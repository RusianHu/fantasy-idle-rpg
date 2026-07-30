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
    documentElement: { lang: 'zh-CN' },
    querySelector: () => null,
    querySelectorAll: () => []
  },
  navigator: { language: 'zh-CN' },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  Math, Number, Date, Object, Array, String, Boolean, JSON, Uint8Array, Uint32Array,
  setTimeout, clearTimeout
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
  'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js', 'js/sprites/monsters_expansion.js',
  'js/sprites/props.js', 'js/sprites/exploration_v3.js',
  'js/core/content/support.js', 'js/data/content/content.generated.js'
].forEach(load);

const Game = sandbox.Game;
Game.rules.registerHandler('objective', {
  id: 'fixture.objective.reach-tick', version: 1,
  deterministic: true, access: ['tick'],
  fn: (context, params) => ({
    status: context.tick >= params.tick ? 'success' : 'ongoing',
    details: { evaluatedTick: context.tick }
  })
});
const standardTeams = [
  {
    id: 'heroes', role: 'combatant', coalitionId: 'heroes',
    countsForCompletion: true, rewardEligible: false
  },
  {
    id: 'foes', role: 'combatant', coalitionId: 'foes',
    countsForCompletion: true, rewardEligible: true
  }
];

Game.content.registerPack({
  id: 'fixture.ecosystem-v14', version: '1.0.0', schemaVersion: 1,
  requires: [
    { id: 'core.combat', range: '^2.0.0' },
    { id: 'world.meadow-fox', range: '^1.0.0' }
  ],
  definitions: {
    actorVariant: [
      {
        id: 'creature.meadow_fox.cornered',
        patch: true,
        archetypeId: 'creature.meadow_fox',
        overrides: {},
        transitions: [
          {
            from: null,
            to: 'creature.meadow_fox.cornered',
            triggerId: 'provoked',
            timing: 'outOfEncounter',
            activeAction: 'defer',
            persistence: 'none'
          },
          {
            from: 'creature.meadow_fox.cornered',
            to: 'fixture.meadow_fox.enraged',
            triggerId: 'rage',
            timing: 'cleanup',
            activeAction: 'cancel',
            persistence: 'none'
          }
        ]
      },
      {
        id: 'fixture.meadow_fox.enraged',
        archetypeId: 'creature.meadow_fox',
        overrides: {
          statProfileId: 'stats.meadow_fox',
          abilityGrantIds: ['meadow_fox.bite'],
          aiProfileId: 'ai.monster.standard',
          resistanceProfileId: 'resist.standard',
          rewardProfileId: 'reward.none',
          interactionProfileId: 'interaction.hostile',
          engagementPolicyId: 'engagement.neutral-provokable'
        },
        transitions: [{
          from: 'fixture.meadow_fox.enraged',
          to: 'fixture.meadow_fox.alert',
          triggerId: 'alert',
          timing: 'cleanup',
          activeAction: 'defer',
          persistence: 'none'
        }]
      },
      {
        id: 'fixture.meadow_fox.alert',
        archetypeId: 'creature.meadow_fox',
        overrides: {
          statProfileId: 'stats.meadow_fox',
          abilityGrantIds: ['meadow_fox.bite'],
          aiProfileId: 'ai.monster.standard',
          resistanceProfileId: 'resist.standard',
          rewardProfileId: 'reward.none',
          interactionProfileId: 'interaction.hostile',
          engagementPolicyId: 'engagement.neutral-provokable'
        },
        transitions: []
      }
    ],
    encounterProfile: [
      {
        id: 'fixture.encounter.protect',
        regionId: 'grassland',
        rulesProfileId: 'core.rules.standard-v1',
        teamSlots: standardTeams.concat([
          {
            id: 'vip', role: 'objective', coalitionId: 'heroes',
            countsForCompletion: false, rewardEligible: false
          },
          {
            id: 'watchers', role: 'observer', coalitionId: 'neutral',
            countsForCompletion: false, rewardEligible: false
          }
        ]),
        relationMatrix: {
          heroes: { foes: 'hostile' },
          foes: { heroes: 'hostile', vip: 'hostile' },
          vip: { foes: 'hostile' }
        },
        objectives: [
          { id: 'eliminate-foes', type: 'eliminate', teamId: 'foes', required: true },
          { id: 'protect-vip', type: 'protect', teamId: 'vip', required: true }
        ]
      },
      {
        id: 'fixture.encounter.surrender',
        regionId: 'grassland',
        rulesProfileId: 'core.rules.standard-v1',
        teamSlots: standardTeams,
        relationMatrix: {
          heroes: { foes: 'hostile' },
          foes: { heroes: 'hostile' }
        },
        objectives: [
          { id: 'foes-surrender', type: 'surrender', teamId: 'foes', required: true }
        ]
      },
      {
        id: 'fixture.encounter.escape',
        regionId: 'grassland',
        rulesProfileId: 'core.rules.standard-v1',
        teamSlots: standardTeams,
        relationMatrix: {
          heroes: { foes: 'hostile' },
          foes: { heroes: 'hostile' }
        },
        objectives: [
          { id: 'foes-escape', type: 'escape', teamId: 'foes', required: true }
        ]
      },
      {
        id: 'fixture.encounter.custom',
        regionId: 'grassland',
        rulesProfileId: 'core.rules.standard-v1',
        teamSlots: standardTeams,
        relationMatrix: {
          heroes: { foes: 'hostile' },
          foes: { heroes: 'hostile' }
        },
        objectives: [{
          id: 'reach-tick', type: 'custom', required: true,
          handlerId: 'fixture.objective.reach-tick', handlerVersion: 1,
          params: { tick: 3 }
        }]
      }
    ],
    worldSpawnProfile: [
      {
        id: 'fixture.spawn.worldtime-fox',
        actorRef: { archetypeId: 'creature.meadow_fox' },
        mountTo: [{
          populationId: 'population.grassland', channel: 'npc',
          mode: 'required', count: 1
        }],
        identity: { scope: 'regionStable', socialGroupId: 'social.fixture-wildlife' },
        placement: {
          selector: 'candidate', source: 'spawnCandidates', required: true,
          onFailure: 'rejectRegionMount', occupancyRadius: 7
        },
        lifecycle: {
          activation: 'regionActive', unload: 'despawn', onDefeat: 'closeLease',
          onEscape: 'closeLease',
          respawn: { mode: 'worldTime', delay: 5, resetVariant: true }
        },
        offlineEligible: false
      }
    ]
  }
});

const audit = Game.content.finalize({ strict: true });
assert.equal(audit.ok, true);
Game.assets.sprite = () => ({ w: 16, h: 20 });

[
  'js/systems/actors/relations.js', 'js/systems/actors/parties.js',
  'js/systems/actors/actors.js', 'js/systems/world_population.js',
  'js/systems/encounters.js', 'js/systems/engagement.js',
  'js/systems/combat_ai.js', 'js/systems/combat.js'
].forEach(load);

function emptySocial() {
  return {
    spawnVariants: {},
    memories: { spawnId: {}, socialGroupId: {}, factionId: {} }
  };
}

function resetRuntime() {
  Game.engagement.reset();
  Game.encounters.reset();
  Game.relations.reset();
  Game.actors.reset();
  Game.state = {
    world: {
      region: 'grassland',
      worldSeed: 0x12345678,
      worldTime: 300,
      social: emptySocial()
    },
    player: { level: 12 }
  };
  Game.population.reset('grassland');
}

function spawnHero(id) {
  const hero = Game.actors.spawn({
    instanceId: id || 'fixture:hero',
    archetypeId: 'adventurer',
    classId: 'fighter',
    factionId: 'adventurers',
    controllerId: 'ai:player-auto',
    tier: 1,
    statValues: {
      maxHp: 180, armor: 12, ward: 8,
      physicalPower: 24, magicPower: 12,
      accuracy: 0.95, gcdSpeed: 1, castSpeed: 1,
      autoAttackSpeed: 1, cooldownRate: 1, moveSpeed: 56,
      range: 24, critChance: 0.1, critMultiplier: 1.5,
      dodgeChance: 0.04, healingPower: 20, shieldPower: 180,
      lifesteal: 0, statusPotency: 1, tenacity: 0.1,
      interruptPower: 1, threatMultiplier: 1, resourceRegen: 1,
      expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
    },
    transform: { x: 20, y: 20 }
  });
  hero.actorRecordId = id || 'fixture:hero';
  return hero;
}

function materializeFox(slotKey) {
  return Game.population.materialize('spawn.grassland.meadow-fox', {
    regionId: 'grassland',
    populationId: 'population.grassland',
    layoutSlotKey: slotKey || 'candidate:fox',
    spawnRequestKey: 'grassland:population.grassland:' + (slotKey || 'candidate:fox'),
    x: 80,
    y: 20,
    tier: 1
  });
}

function combatActor(id, x) {
  return Game.actors.spawn({
    instanceId: id,
    archetypeId: 'wolf_gray',
    factionId: 'wild',
    tier: 1,
    transform: { x: x || 50, y: 50 }
  });
}

function setActorPosition(actor, x, y) {
  actor.x = x;
  actor.y = y;
  actor.components.transform.x = x;
  actor.components.transform.y = y;
}

// Population identity, lease exclusivity, placement rollback and same-slot respawn.
resetRuntime();
const allocationA = Game.population.allocate('grassland', 'npc', 2, {
  tier: 1, worldSeed: 99, layoutVersion: 3
});
const allocationB = Game.population.allocate('grassland', 'npc', 2, {
  tier: 1, worldSeed: 99, layoutVersion: 3
});
assert.deepEqual(Array.from(allocationA), Array.from(allocationB));
assert.deepEqual(Array.from(allocationA), [
  'fixture.spawn.worldtime-fox',
  'spawn.grassland.meadow-fox'
]);

const failedPlacement = Game.population.materialize('spawn.grassland.meadow-fox', {
  regionId: 'grassland',
  populationId: 'population.grassland',
  layoutSlotKey: 'candidate:failure',
  spawnRequestKey: 'failure',
  x: NaN,
  y: 20,
  tier: 1
});
assert.equal(failedPlacement.ok, false);
assert.equal(failedPlacement.reason, 'placement-failed');

const firstFox = materializeFox('candidate:failure');
assert.equal(firstFox.ok, true, firstFox.error && firstFox.error.stack || firstFox.reason);
assert.equal(firstFox.lease.generation, 1);
assert.equal(firstFox.primary.spawnId, firstFox.lease.spawnId);
assert.equal(firstFox.primary.memberSlotId, 'actor');
assert.equal(Game.population.materialize('spawn.grassland.meadow-fox', {
  regionId: 'grassland',
  populationId: 'population.grassland',
  layoutSlotKey: 'candidate:failure',
  spawnRequestKey: 'failure',
  x: 80,
  y: 20,
  tier: 1
}).reason, 'lease-active');
const closedLease = Game.contentCompiler.clone(firstFox.lease);
assert.equal(Game.population.close(firstFox.lease.spawnId, 'test-close', { despawn: true }), true);
const secondFox = Game.population.respawn(closedLease);
assert.equal(secondFox.ok, true);
assert.equal(secondFox.lease.spawnId, firstFox.lease.spawnId);
assert.equal(secondFox.lease.generation, 2);

// PopulationMountPlan is deterministic, immutable, and synthesizes stable v1/v2 slot keys.
resetRuntime();
const planLayout = {
  version: 2,
  camp: { x: 0, y: 0 },
  bossPoint: { x: 640, y: 320 },
  spawnCandidates: [
    { x: 180, y: 40 },
    { x: 240, y: 40 },
    { x: 300, y: 40 }
  ],
  corridorCandidates: [], threats: [], guardian: null
};
const layoutBeforePlan = JSON.stringify(planLayout);
const planContext = {
  tier: 1, worldSeed: 0x10203040, expeditionIndex: 3,
  channelLimits: { boss: 0, guardian: 0, npc: 2, rare: 0, regular: 0 }
};
const mountPlanA = Game.population.prepareRegion('grassland', planLayout, planContext);
const mountPlanB = Game.population.prepareRegion('grassland', planLayout, planContext);
assert.equal(mountPlanA.ok, true);
assert.deepEqual(mountPlanA, mountPlanB);
assert.equal(Object.isFrozen(mountPlanA), true);
assert.equal(Object.isFrozen(mountPlanA.slots), true);
assert.throws(() => mountPlanA.slots.push({}), /not extensible|read only/);
assert.equal(JSON.stringify(planLayout), layoutBeforePlan, 'Population planning must not mutate layout');
assert.deepEqual(
  Array.from(mountPlanA.slots, (slot) => slot.layoutSlotKey).sort(),
  ['candidate:1', 'candidate:2'],
  'v1/v2 candidate keys derive only from the frozen candidate order'
);
assert.deepEqual(
  Array.from(mountPlanA.reservations, (entry) => entry.slotId).sort(),
  Array.from(mountPlanA.slots, (entry) => entry.id).sort()
);

// A higher-priority boss reservation can reject a required NPC while optional failures stay skippable.
const blockedLayout = {
  version: 2,
  camp: { x: 0, y: 0 },
  bossPoint: { x: 300, y: 40 },
  spawnCandidates: [{ x: 300, y: 40 }],
  corridorCandidates: [], threats: [], guardian: null
};
const rejectedPlan = Game.population.prepareRegion('grassland', blockedLayout, {
  tier: 1, worldSeed: 9,
  channelLimits: { boss: 1, guardian: 0, npc: 2, rare: 0, regular: 0 }
});
assert.equal(rejectedPlan.ok, false);
assert.equal(rejectedPlan.reason, 'region-mount-rejected');
assert.ok(rejectedPlan.failures.some((failure) =>
  failure.profileId === 'fixture.spawn.worldtime-fox' && failure.required));
assert.ok(rejectedPlan.failures.some((failure) =>
  failure.profileId === 'spawn.grassland.meadow-fox' && !failure.required));
assert.deepEqual(
  Array.from(Game.population.mountPlan().slots, (slot) => slot.id),
  Array.from(mountPlanB.slots, (slot) => slot.id),
  'a rejected plan must not replace the active mount plan'
);

// Delay respawn remains simulation-time based and reuses the logical slot with a new generation.
const delaySlot = mountPlanB.slots.find((slot) =>
  slot.profileId === 'spawn.grassland.meadow-fox');
const delayedFox = Game.population.materializeSlot(delaySlot.id);
assert.equal(delayedFox.ok, true);
const delayedSpawnId = delayedFox.lease.spawnId;
assert.equal(Game.population.close(delayedSpawnId, 'defeated', {
  despawn: true, delay: 2
}), true);
assert.equal(Game.population.mountPlan().respawnSchedules[0].mode, 'delay');
assert.equal(Game.population.update(1, Game.state.world.worldTime).spawned.length, 0);
const delayedRespawn = Game.population.update(1, Game.state.world.worldTime).spawned[0];
assert.equal(delayedRespawn.lease.spawnId, delayedSpawnId);
assert.equal(delayedRespawn.lease.generation, 2);

// Escape closes the lease; worldTime respawn waits on the absolute clock and resets saved Variant.
const worldTimeSlot = mountPlanB.slots.find((slot) =>
  slot.profileId === 'fixture.spawn.worldtime-fox');
const worldTimeFox = Game.population.materializeSlot(worldTimeSlot.id);
assert.equal(worldTimeFox.ok, true);
const worldTimeSpawnId = worldTimeFox.lease.spawnId;
Game.state.world.social.spawnVariants[worldTimeSpawnId] = 'creature.meadow_fox.cornered';
Game.population.onActorEscaped(worldTimeFox.primary);
assert.equal(Game.population.lease(worldTimeSpawnId), null);
assert.equal(Game.state.world.social.spawnVariants[worldTimeSpawnId], undefined);
const worldTimeSchedule = Game.population.mountPlan().respawnSchedules[0];
assert.equal(worldTimeSchedule.mode, 'worldTime');
assert.equal(worldTimeSchedule.eligibleAtWorldTime, 305);
assert.equal(Game.population.update(100, 304).spawned.length, 0,
  'worldTime schedules ignore elapsed simulation dt');
const worldTimeRespawn = Game.population.update(0, 305).spawned[0];
assert.equal(worldTimeRespawn.lease.spawnId, worldTimeSpawnId);
assert.equal(worldTimeRespawn.lease.generation, 2);
assert.equal(worldTimeRespawn.primary.variantId, null);

// Every Engagement commit primitive must restore Actor, Relation, social and ordinal state.
[
  'before-variant', 'after-variant', 'after-relation',
  'after-encounter-mount', 'after-join', 'after-metadata'
].forEach((stage) => {
  resetRuntime();
  const hero = spawnHero();
  const foxResult = materializeFox();
  const fox = foxResult.primary;
  hero.components.cooldowns.abilities['fighter.slash'] = 17;
  const heroBefore = JSON.stringify(Game.actors.snapshot(hero.id));
  const foxBefore = JSON.stringify(Game.actors.snapshot(fox.id));
  let rejected = 0;
  let combatEvents = 0;
  Game.bus.on('engagement:rejected', () => { rejected++; });
  Game.bus.on('combat:event', () => { combatEvents++; });
  Game.engagement.setFaultInjector((point) => {
    if (point === stage) throw new Error('fault:' + stage);
  });
  Game.engagement.requestAttack(
    { actorRecordId: hero.actorRecordId },
    Game.population.stableKey(fox),
    { commandId: 'fault-' + stage, requestedTick: 1 }
  );
  const result = Game.engagement.processCommands(1)[0];
  assert.equal(result.ok, false, stage);
  assert.equal(result.reason, 'commit-rollback', stage);
  assert.equal(Game.encounters.all().length, 0, stage);
  assert.deepEqual(Game.relations.snapshot(), [], stage);
  assert.deepEqual(JSON.parse(JSON.stringify(Game.state.world.social)), emptySocial(), stage);
  assert.equal(JSON.stringify(Game.actors.snapshot(hero.id)), heroBefore, stage);
  assert.equal(JSON.stringify(Game.actors.snapshot(fox.id)), foxBefore, stage);
  assert.equal(rejected, 1, stage);
  assert.equal(combatEvents, 0, stage);
  assert.equal(Game.engagement.revision(), 0, stage);
  assert.deepEqual(JSON.parse(JSON.stringify(Game.engagement.snapshot().ordinals)), {}, stage);
  Game.engagement.setFaultInjector(null);
  Game.engagement.requestAttack(
    { actorRecordId: hero.actorRecordId },
    Game.population.stableKey(fox),
    { commandId: 'retry-' + stage, requestedTick: 2 }
  );
  const retry = Game.engagement.processCommands(2)[0];
  assert.equal(retry.ok, true, stage + ':retry');
  assert.deepEqual(Object.values(Game.engagement.snapshot().ordinals), [1],
    stage + ':failed commit must not consume ordinal');
  assert.equal(Game.engagement.revision(), 1, stage + ':retry');
});

// Success is idempotent, publishes only after complete state and persists stable-key memory.
resetRuntime();
const hero = spawnHero();
const foxResult = materializeFox();
const fox = foxResult.primary;
const nearbyFox = materializeFox('candidate:nearby').primary;
const targetKey = Game.population.stableKey(fox);
const observed = [];
const observeVariant = (event) => observed.push('variant:' + event.actorId);
const observeRelation = () => observed.push('relation');
const observeStarted = () => observed.push('encounter:started');
const observeJoined = (event) => observed.push('encounter:joined:' + event.sourceActorId);
const observeCommitted = (event) => {
  const active = Game.encounters.get(event.encounterId);
  assert.ok(active);
  assert.equal(fox.variantId, 'creature.meadow_fox.cornered');
  assert.equal(Game.relations.resolve(hero.id, fox.id, active.id), 'hostile');
  observed.push('engagement:committed');
};
Game.bus.on('actor:variantChanged', observeVariant);
Game.bus.on('relation:changed', observeRelation);
Game.bus.on('encounter:started', observeStarted);
Game.bus.on('encounter:joined', observeJoined);
Game.bus.on('engagement:committed', observeCommitted);
const queuedA = Game.engagement.requestAttack(
  { actorRecordId: hero.actorRecordId },
  targetKey,
  { commandId: 'success-command', requestedTick: 2 }
);
const queuedB = Game.engagement.requestAttack(
  { actorRecordId: hero.actorRecordId },
  targetKey,
  { commandId: 'success-command', requestedTick: 2 }
);
assert.equal(queuedA.commandId, queuedB.commandId);
assert.equal(Game.engagement.queued().length, 1);
const success = Game.engagement.processCommands(2)[0];
assert.equal(success.ok, true, success.reason + ':' + success.details);
assert.equal(Game.engagement.result('success-command').encounterId, success.encounterId);
assert.deepEqual(
  Array.from(success.variantChangedActorIds).sort(),
  [fox.id, nearbyFox.id].sort()
);
assert.equal(nearbyFox.variantId, 'creature.meadow_fox.cornered');
assert.equal(nearbyFox.encounterId, success.encounterId);
assert.equal(fox.encounterRewardAuthorized, false);
assert.equal(nearbyFox.encounterRewardAuthorized, false);
const committedEncounter = Game.encounters.get(success.encounterId);
assert.deepEqual(
  observed,
  Array.from(committedEncounter.eventLog, (event) => {
    if (event.type === 'actor:variantChanged') return 'variant:' + event.actorId;
    if (event.type === 'relation:changed') return 'relation';
    if (event.type === 'encounter:joined') return event.type + ':' + event.sourceActorId;
    return event.type;
  })
);
assert.deepEqual(
  committedEncounter.eventLog.map((event) => event.sequence),
  committedEncounter.eventLog.map((_, index) => index + 1),
  'committed Encounter events have one continuous sequence before publication'
);
Game.bus.off('actor:variantChanged', observeVariant);
Game.bus.off('relation:changed', observeRelation);
Game.bus.off('encounter:started', observeStarted);
Game.bus.off('encounter:joined', observeJoined);
Game.bus.off('engagement:committed', observeCommitted);
assert.equal(Game.relations.resolve(hero.id, fox.id, null), 'hostile');
assert.ok(Game.state.world.social.memories.spawnId[fox.spawnId]);
assert.ok(Game.state.world.social.memories.socialGroupId[fox.socialGroupId]);
Game.state.world.worldTime = 481;
Game.relations.expire(Game.state.world.worldTime);
assert.equal(Game.relations.resolve(hero.id, fox.id, null), 'neutral');

// Old generations and region cancellation cannot affect the current lease.
resetRuntime();
const staleHero = spawnHero();
const staleFox = materializeFox();
const staleKey = Game.population.stableKey(staleFox.primary);
const staleLease = Game.contentCompiler.clone(staleFox.lease);
Game.population.close(staleLease.spawnId, 'respawn', { despawn: true });
const currentFox = Game.population.respawn(staleLease);
Game.engagement.requestAttack(
  { actorRecordId: staleHero.actorRecordId },
  staleKey,
  { commandId: 'stale-command', requestedTick: 1 }
);
assert.equal(Game.engagement.processCommands(1)[0].reason, 'stale-generation');
Game.engagement.requestAttack(
  { actorRecordId: staleHero.actorRecordId },
  Game.population.stableKey(currentFox.primary),
  { commandId: 'cancel-command', requestedTick: 5 }
);
assert.equal(Game.engagement.cancelAll('region-changed')[0].reason, 'region-changed');
assert.equal(Game.engagement.queued().length, 0);

// Command ordering is stable, and same-tick competitors observe the previous commit.
resetRuntime();
[
  {
    commandId: 'order-target-z', requestedTick: 8,
    sourceKey: { actorRecordId: 'source-a' },
    targetKey: { spawnId: 'spawn-z', spawnGeneration: 1 }
  },
  {
    commandId: 'order-tick-first', requestedTick: 7,
    sourceKey: { actorRecordId: 'source-z' },
    targetKey: { spawnId: 'spawn-a', spawnGeneration: 1 }
  },
  {
    commandId: 'order-source-first', requestedTick: 8,
    sourceKey: { actorRecordId: 'source-a' },
    targetKey: { spawnId: 'spawn-a', spawnGeneration: 1 }
  }
].forEach((command) => Game.engagement.enqueue(command));
assert.deepEqual(
  Array.from(Game.engagement.queued(), (command) => command.commandId),
  ['order-tick-first', 'order-source-first', 'order-target-z']
);
Game.engagement.reset();

const competingHero = spawnHero('competing:hero');
const competingFox = materializeFox('candidate:competing').primary;
['competing-b', 'competing-a'].forEach((commandId) => {
  Game.engagement.requestAttack(
    { actorRecordId: competingHero.actorRecordId },
    Game.population.stableKey(competingFox),
    { commandId, requestedTick: 1 }
  );
});
const competingResults = Game.engagement.processCommands(1);
assert.deepEqual(Array.from(competingResults, (result) => result.commandId),
  ['competing-a', 'competing-b']);
assert.equal(competingResults[0].ok, true);
assert.equal(competingResults[1].reason, 'occupied');
assert.equal(Game.engagement.revision(), 1);

// Every outbox listener is isolated: exceptions neither roll back nor stop later listeners.
[
  'actor:variantChanged',
  'relation:changed',
  'encounter:started',
  'encounter:joined',
  'engagement:committed'
].forEach((eventType, index) => {
  resetRuntime();
  const listenerHero = spawnHero('listener:hero:' + index);
  const listenerFox = materializeFox('candidate:listener:' + index).primary;
  let laterListenerCalls = 0;
  let listenerErrors = 0;
  const throws = () => { throw new Error('listener-fault:' + eventType); };
  const continues = () => { laterListenerCalls++; };
  const originalError = console.error;
  console.error = () => { listenerErrors++; };
  Game.bus.on(eventType, throws);
  Game.bus.on(eventType, continues);
  let listenerResult;
  try {
    Game.engagement.requestAttack(
      { actorRecordId: listenerHero.actorRecordId },
      Game.population.stableKey(listenerFox),
      { commandId: 'listener-' + index, requestedTick: 1 }
    );
    listenerResult = Game.engagement.processCommands(1)[0];
  } finally {
    Game.bus.off(eventType, throws);
    Game.bus.off(eventType, continues);
    console.error = originalError;
  }
  assert.equal(listenerResult.ok, true, eventType);
  assert.ok(Game.encounters.get(listenerResult.encounterId), eventType);
  assert.equal(listenerFox.variantId, 'creature.meadow_fox.cornered', eventType);
  assert.equal(Game.relations.resolve(
    listenerHero.id, listenerFox.id, listenerResult.encounterId
  ), 'hostile', eventType);
  assert.ok(listenerErrors >= 1, eventType);
  assert.ok(laterListenerCalls >= 1, eventType);
  assert.equal(Game.engagement.revision(), 1, eventType);
});

// Opening Actions use the normal combat request path after the Engagement commit.
function openingCase(id, abilityId, configure) {
  resetRuntime();
  const openingHero = spawnHero('opening:hero:' + id);
  const openingFox = materializeFox('candidate:opening:' + id).primary;
  if (configure) configure(openingHero, openingFox);
  Game.engagement.requestAttack(
    { actorRecordId: openingHero.actorRecordId },
    Game.population.stableKey(openingFox),
    {
      commandId: 'opening-' + id,
      requestedTick: 1,
      openingAbilityId: abilityId
    }
  );
  return {
    hero: openingHero,
    fox: openingFox,
    result: Game.engagement.processCommands(1)[0]
  };
}

const openingSuccess = openingCase('success', 'fighter.vanguard_slash', (source, target) => {
  setActorPosition(source, 20, 20);
  setActorPosition(target, 38, 20);
});
assert.equal(openingSuccess.result.ok, true);
assert.deepEqual(
  JSON.parse(JSON.stringify(openingSuccess.result.openingAction)),
  {
    ok: true,
    queued: false,
    actionToken: openingSuccess.result.encounterId + ':action:7'
  }
);
assert.equal(openingSuccess.hero.components.actionState.abilityId, 'fighter.vanguard_slash');

const openingRange = openingCase('range', 'fighter.vanguard_slash');
assert.equal(openingRange.result.ok, true);
assert.equal(openingRange.result.openingAction.reason, 'range');
assert.equal(openingRange.hero.components.movement.intent.reason, 'range');

const openingCooldown = openingCase('cooldown', 'fighter.vanguard_slash', (source, target) => {
  setActorPosition(source, 20, 20);
  setActorPosition(target, 38, 20);
  source.components.cooldowns.groups.gcd = 100;
});
assert.equal(openingCooldown.result.ok, true);
assert.equal(openingCooldown.result.openingAction.reason, 'cooldown');

const openingResource = openingCase('resource', 'fighter.heavy_slash', (source, target) => {
  setActorPosition(source, 20, 20);
  setActorPosition(target, 38, 20);
  source.components.resources.rage.value = 0;
});
assert.equal(openingResource.result.ok, true);
assert.equal(openingResource.result.openingAction.reason, 'resource');

let busyListener;
const openingBusy = openingCase('busy', 'fighter.auto_attack', (source, target) => {
  setActorPosition(source, 20, 20);
  setActorPosition(target, 38, 20);
  busyListener = () => { source.components.actionState.state = 'casting'; };
  Game.bus.on('engagement:committed', busyListener);
});
Game.bus.off('engagement:committed', busyListener);
assert.equal(openingBusy.result.ok, true);
assert.equal(openingBusy.result.openingAction.reason, 'busy');

const invalidOpening = openingCase('invalid', 'removed.ability');
assert.equal(invalidOpening.result.ok, false);
assert.equal(invalidOpening.result.reason, 'opening-ability');
assert.equal(Game.encounters.all().length, 0);
assert.equal(invalidOpening.fox.variantId, null);
assert.deepEqual(Game.relations.snapshot(), []);

// Cleanup Variants support cancel and defer without changing Actor identity.
resetRuntime();
const variantHero = spawnHero();
const variantFoxResult = materializeFox();
const variantFox = variantFoxResult.primary;
Game.engagement.requestAttack(
  { actorRecordId: variantHero.actorRecordId },
  Game.population.stableKey(variantFox),
  { commandId: 'variant-engage', requestedTick: 1 }
);
const variantEngagement = Game.engagement.processCommands(1)[0];
assert.equal(variantEngagement.ok, true);
const stableActorId = variantFox.id;
variantFox.components.actionState.state = 'casting';
assert.equal(Game.actors.transitionVariant(
  variantFox.id,
  'fixture.meadow_fox.enraged',
  { triggerId: 'rage' }
).scheduled, true);
Game.combat.tickFixed(variantEngagement.encounterId);
assert.equal(variantFox.id, stableActorId);
assert.equal(variantFox.variantId, 'fixture.meadow_fox.enraged');
variantFox.components.actionState.state = 'casting';
assert.equal(Game.actors.transitionVariant(
  variantFox.id,
  'fixture.meadow_fox.alert',
  { triggerId: 'alert' }
).scheduled, true);
Game.combat.tickFixed(variantEngagement.encounterId);
assert.equal(variantFox.variantId, 'fixture.meadow_fox.enraged');
variantFox.components.actionState.state = 'idle';
Game.combat.tickFixed(variantEngagement.encounterId);
assert.equal(variantFox.variantId, 'fixture.meadow_fox.alert');

// Objective roles: observer does not block, protected Actors gate success, and reward authorization is explicit.
resetRuntime();
const objectiveHero = combatActor('objective:hero', 10);
const objectiveFoe = combatActor('objective:foe', 30);
const objectiveVip = combatActor('objective:vip', 20);
const objectiveWatcher = combatActor('objective:watcher', 40);
const protect = Game.encounters.start('fixture.encounter.protect', {
  id: 'fixture:protect-success',
  seed: 1,
  silent: true
});
Game.encounters.join(protect.id, objectiveHero.id, 'heroes');
Game.encounters.join(protect.id, objectiveFoe.id, 'foes');
Game.encounters.join(protect.id, objectiveVip.id, 'vip');
Game.encounters.join(protect.id, objectiveWatcher.id, 'watchers');
assert.equal(objectiveFoe.encounterRewardAuthorized, true);
assert.equal(objectiveVip.encounterRewardAuthorized, false);
assert.equal(objectiveWatcher.encounterRewardAuthorized, false);
assert.equal(protect.threatTables[objectiveWatcher.id], undefined);
assert.equal(Game.relations.resolve(
  objectiveHero.id, objectiveWatcher.id, protect.id
), 'neutral');
Game.units.defeat(objectiveFoe, { commit: false });
const protectedResult = Game.encounters.evaluateObjectives(protect.id);
assert.equal(protectedResult.status, 'success');
assert.deepEqual(Array.from(protectedResult.winningTeamIds), ['heroes']);
assert.deepEqual(Array.from(protectedResult.rewardAuthorizedActorIds), [objectiveFoe.id]);
assert.equal(protectedResult.participantStates[objectiveWatcher.id].state, 'active');

resetRuntime();
const failureHero = combatActor('failure:hero', 10);
const failureFoe = combatActor('failure:foe', 30);
const failureVip = combatActor('failure:vip', 20);
const failedProtect = Game.encounters.start('fixture.encounter.protect', {
  id: 'fixture:protect-failure',
  seed: 2,
  silent: true
});
Game.encounters.join(failedProtect.id, failureHero.id, 'heroes');
Game.encounters.join(failedProtect.id, failureFoe.id, 'foes');
Game.encounters.join(failedProtect.id, failureVip.id, 'vip');
Game.units.defeat(failureVip, { commit: false });
assert.equal(Game.encounters.evaluateObjectives(failedProtect.id).status, 'failure');

['surrender', 'escape'].forEach((kind) => {
  resetRuntime();
  const actorA = combatActor(kind + ':hero', 10);
  const actorB = combatActor(kind + ':foe', 30);
  const encounter = Game.encounters.start('fixture.encounter.' + kind, {
    id: 'fixture:' + kind,
    seed: 3,
    silent: true
  });
  Game.encounters.join(encounter.id, actorA.id, 'heroes');
  Game.encounters.join(encounter.id, actorB.id, 'foes');
  Game.encounters.leave(encounter.id, actorB.id, kind);
  const result = Game.encounters.evaluateObjectives(encounter.id);
  assert.equal(result.status, 'success', kind);
  assert.equal(result.participantStates[actorB.id].state, kind === 'surrender'
    ? 'surrendered' : 'escaped');
});

resetRuntime();
const customHero = combatActor('custom:hero', 10);
const customFoe = combatActor('custom:foe', 30);
const customEncounter = Game.encounters.start('fixture.encounter.custom', {
  id: 'fixture:custom', seed: 4, silent: true
});
Game.encounters.join(customEncounter.id, customHero.id, 'heroes');
Game.encounters.join(customEncounter.id, customFoe.id, 'foes');
assert.equal(Game.encounters.evaluateObjectives(customEncounter.id).status, 'ongoing');
customEncounter.tick = 3;
const customResult = Game.encounters.evaluateObjectives(customEncounter.id);
assert.equal(customResult.status, 'success');
assert.equal(customResult.objectiveResults[0].details.evaluatedTick, 3);

// Ambush territories receive a pack that the corresponding HazardProfile can
// actually reveal; random regular allocation may not silently disable them.
resetRuntime();
const ambushPlan = Game.population.prepareRegion('grassland', {
  version: 3,
  threats: [
    { id: 'threat:ambush:a', defId: 'ambush', x: 120, y: 100 },
    { id: 'threat:patrol:a', defId: 'patrol', x: 260, y: 100 },
    { id: 'threat:ambush:b', defId: 'ambush', x: 400, y: 100 }
  ],
  guardian: null
}, {
  tier: 1, worldSeed: 0x12345678, expeditionIndex: 0,
  channelLimits: { boss: 0, guardian: 0, npc: 0, rare: 0, regular: 3 }
});
assert.equal(ambushPlan.ok, true);
const ambushHazard = Game.content.all('hazardProfile').find((profile) =>
  profile.regionId === 'grassland' && profile.category === 'ambushTrigger');
ambushPlan.slots.filter((slot) => slot.threat && slot.threat.defId === 'ambush').forEach((slot) => {
  const spawn = Game.content.get('worldSpawnProfile', slot.profileId);
  const pack = Game.content.get('encounterPack', spawn.encounterPackId);
  assert.equal(pack.ambushEligible, true);
  assert.ok(pack.members.length <= 2);
  assert.ok(ambushHazard.outcome.encounterPackIds.includes(pack.id));
});

console.log(
  'Unit ecosystem v14 tests passed: Population leases, ambush allocation, Engagement atomicity, social memory, Variants and Objectives.'
);
