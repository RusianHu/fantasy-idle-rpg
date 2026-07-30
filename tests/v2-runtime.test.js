'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

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
  localStorage: { getItem: () => null, setItem: () => {} },
  matchMedia: () => ({ matches: false }),
  Math, Number, Date, Object, Array, String, Boolean, JSON, Uint32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(file) { vm.runInContext(read(file), sandbox, { filename: file }); }

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
Game.content.registerPack({
  id: 'fixture.runtime-actions', version: '1.0.0', schemaVersion: 1,
  requires: [{ id: 'core.combat', range: '^2.0.0' }],
  definitions: {
    status: [
      {
        id: 'fixture.stack-multiply', stacking: 'stack', maxStacks: 3,
        durationTicks: 50,
        modifiers: [{
          stat: 'armor', phase: 'status', operation: 'multiply', value: 0.9
        }],
        presentation: {
          nameKey: 'combat.status.ranger_marked.name', icon: 'icon_skill_guard'
        }
      },
      {
        id: 'fixture.stack-dot', stacking: 'stack', maxStacks: 3,
        durationTicks: 50, periodicIntervalTicks: 1,
        periodic: [{
          type: 'damage', damageTypeId: 'true', amount: 4, canCrit: false
        }],
        presentation: {
          nameKey: 'combat.status.rogue_poison.name', icon: 'icon_skill_poison'
        }
      },
      {
        id: 'fixture.unique', stacking: 'unique', maxStacks: 1,
        durationTicks: 50,
        presentation: {
          nameKey: 'combat.status.fighter_guard.name', icon: 'icon_skill_guard'
        }
      }
    ],
    ability: [
      {
        id: 'fixture.channel-charge', kind: 'action', actionType: 'ogcd',
        timing: {
          castTicks: 2, channelTicks: 6, channelIntervalTicks: 2,
          animationLockTicks: 1, cooldownTicks: 0,
          charges: 2, rechargeTicks: 10, interruptible: true,
          queueable: false, refundRatio: 1
        },
        target: { relation: 'hostile', shape: 'single', range: 24 },
        effects: [{ type: 'damage', damageTypeId: 'true', amount: 1, canCrit: false }],
        aiHints: { priority: 999, role: 'defensive' },
        presentation: { nameKey: 'combat.ability.fighter_slash.name', icon: 'icon_skill_strike' }
      },
      {
        id: 'fixture.apply-status', kind: 'action', actionType: 'ogcd',
        timing: { castTicks: 0, animationLockTicks: 0, cooldownTicks: 0 },
        target: { relation: 'hostile', shape: 'single', range: 100 },
        effects: [],
        presentation: { nameKey: 'combat.ability.fighter_guard.name', icon: 'icon_skill_guard' }
      }
    ]
  }
});
const audit = Game.content.finalize({ strict: true });
assert.equal(audit.ok, true);
assert.equal(audit.counts.class, 5);
assert.equal(audit.counts.talent, 30);
assert.equal(audit.counts.actorArchetype, 54);
assert.equal(audit.counts.encounterProfile, 16);

[
  'js/systems/actors/relations.js', 'js/systems/actors/parties.js',
  'js/systems/actors/actors.js', 'js/systems/world_population.js',
  'js/systems/encounters.js', 'js/systems/engagement.js',
  'js/systems/combat_ai.js', 'js/systems/combat.js',
  'js/systems/combat_estimator.js'
].forEach(load);
Game.State = { regionTier: (id) => Game.content.all('encounterProfile')
  .filter((profile) => !/\.boss$/.test(profile.id))
  .map((profile) => profile.regionId).indexOf(id) + 1 };

function party(classId, tier) {
  const base = {
    fighter: [190, 25, 10, 1.02, 24],
    rogue: [135, 31, 7, 1.18, 24],
    mage: [118, 35, 6, 1.08, 92],
    cleric: [150, 27, 8, 1.03, 82],
    ranger: [132, 32, 7, 1.12, 112]
  }[classId];
  return [{
    // First-clear calibration: roughly eight character levels plus one equipment
    // step per region. The values are explicit so this release matrix is immutable.
    archetypeId: 'adventurer', classId, level: 5 + (tier - 1) * 8,
    factionId: 'adventurers', controllerId: 'ai:player-auto',
    statValues: {
      maxHp: base[0] * Math.pow(1.95, tier - 1),
      armor: base[2] * Math.pow(1.85, tier - 1),
      ward: base[2] * .75 * Math.pow(1.85, tier - 1),
      physicalPower: base[1] * Math.pow(1.88, tier - 1),
      magicPower: base[1] * Math.pow(1.88, tier - 1),
      accuracy: .94, gcdSpeed: base[3], castSpeed: base[3],
      autoAttackSpeed: base[3], cooldownRate: 1, moveSpeed: 56,
      range: base[4], critChance: .1, critMultiplier: 1.55,
      dodgeChance: .04, healingPower: base[1] * Math.pow(1.88, tier - 1),
      shieldPower: base[0] * Math.pow(1.95, tier - 1),
      lifesteal: .03, statusPotency: 1, tenacity: .1,
      interruptPower: 1.2, threatMultiplier: 1,
      resourceRegen: 1, expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
    }
  }];
}

const classes = ['fighter', 'rogue', 'mage', 'cleric', 'ranger'];
const regions = ['grassland', 'forest', 'mine', 'graveyard', 'snowpass', 'lavacave', 'skyruins', 'darkcastle'];
const signatures = {};
const matrixSeeds = Array.from({ length: 100 }, (_, index) => (index + 1) * 7919);
let matrixSamples = 0;
for (const classId of classes) {
  for (let index = 0; index < regions.length; index++) {
    const regionId = regions[index];
    const spec = {
      partySnapshot: party(classId, index + 1),
      encounterProfileId: `encounter.${regionId}`,
      tier: index + 1,
      tacticsProfile: 'balanced',
      sampleSeeds: matrixSeeds,
      maxTicks: 12000
    };
    const first = Game.combatEstimator.evaluate(spec);
    assert.ok(first.averageTicks > 0 && first.averageTicks <= 12000,
      `${classId}/${regionId} must terminate or hit the explicit bound`);
    assert.equal(first.resourceStable, true);
    assert.ok(Number.isFinite(first.averageDps));
    assert.ok(first.failureRate >= 0 && first.failureRate <= 1);
    assert.ok(first.failureRate <= .25,
      `${classId}/${regionId} first-clear build must not be mechanically hard-locked`);
    matrixSamples += first.samples.length;
  }
}
assert.equal(matrixSamples, 5 * 8 * 100);

// Seed replay is identical after cache invalidation; volatile actor IDs are reduced to totals.
function sampleSignature(sample) {
  return JSON.stringify({
    ticks: sample.ticks, seconds: sample.seconds, winner: sample.winnerTeamId,
    damage: Object.values(sample.damage).sort((a, b) => a - b),
    healing: Object.values(sample.healing).sort((a, b) => a - b),
    actions: Object.values(sample.actions).sort((a, b) => a - b),
    enemyCount: sample.enemyCount, resourceStable: sample.resourceStable
  });
}
const replaySpec = {
  partySnapshot: party('fighter', 1), encounterProfileId: 'encounter.grassland',
  tier: 1, tacticsProfile: 'balanced', sampleSeeds: [20260728], maxTicks: 12000
};
Game.combatEstimator.invalidate();
const replayA = Game.combatEstimator.evaluate(replaySpec);
Game.combatEstimator.invalidate();
const replayB = Game.combatEstimator.evaluate(replaySpec);
assert.equal(sampleSignature(replayA.samples[0]), sampleSignature(replayB.samples[0]));

// Relation override, fixed-tick movement, phase state, and cancellation bookkeeping.
const encounter = Game.encounters.start('encounter.grassland', { id: 'test:manual', seed: 7, silent: true });
const fighter = Game.actors.spawn({
  instanceId: 'test:fighter', archetypeId: 'adventurer', classId: 'fighter',
  level: 1, tier: 1, factionId: 'adventurers',
  statValues: party('fighter', 1)[0].statValues,
  transform: { x: 0, y: 0 }, spawnSource: { kind: 'test', sourceId: 'runtime', sequence: 1 }
});
const slime = Game.actors.spawn({
  instanceId: 'test:slime', archetypeId: 'slime_green', level: 1, tier: 1,
  transform: { x: 70, y: 0 }, spawnSource: { kind: 'test', sourceId: 'runtime', sequence: 2 }
});
Game.encounters.join(encounter.id, fighter.id, 'party');
Game.encounters.join(encounter.id, slime.id, 'enemy');
assert.equal(Game.relations.resolve(fighter.id, slime.id, encounter.id), 'hostile');
const overrideId = Game.relations.setOverride('actor', fighter.id, slime.id, 'ally',
  { encounterId: encounter.id });
assert.equal(Game.relations.resolve(fighter.id, slime.id, encounter.id), 'ally');
Game.relations.clearOverride(overrideId);
const fighterMate = Game.actors.spawn({
  instanceId: 'test:fighter-mate', archetypeId: 'adventurer', classId: 'fighter',
  level: 1, tier: 1, factionId: 'adventurers',
  statValues: party('fighter', 1)[0].statValues,
  transform: { x: 35, y: 20 },
  spawnSource: { kind: 'test', sourceId: 'runtime-crowd', sequence: 3 }
});
const slimeMate = Game.actors.spawn({
  instanceId: 'test:slime-mate', archetypeId: 'slime_green', level: 1, tier: 1,
  transform: { x: 35, y: 20 },
  spawnSource: { kind: 'test', sourceId: 'runtime-crowd', sequence: 4 }
});
Game.encounters.join(encounter.id, fighterMate.id, 'party');
Game.encounters.join(encounter.id, slimeMate.id, 'enemy');
[fighter, slime, fighterMate, slimeMate].forEach((actor) => {
  actor.x = 35;
  actor.y = 20;
});
fighter.components.movement.intent = {
  type: 'move', reason: 'range', targetId: slime.id, x: slime.x, y: slime.y, stopRange: 24
};
slime.components.movement.intent = {
  type: 'move', reason: 'range', targetId: fighter.id, x: fighter.x, y: fighter.y, stopRange: 24
};
Game.combat.tickFixed(encounter.id);
const contactDistance = Game.util.dist(fighter.x, fighter.y, slime.x, slime.y);
const minimumContactDistance = fighter.components.body.collisionRadius +
  slime.components.body.collisionRadius + 2;
assert.ok(contactDistance >= minimumContactDistance,
  'overlapping combatants deterministically recover to their collision-safe engagement ring');
const crowdedCombatants = [fighter, slime, fighterMate, slimeMate];
for (let left = 0; left < crowdedCombatants.length; left++) {
  for (let right = left + 1; right < crowdedCombatants.length; right++) {
    const a = crowdedCombatants[left];
    const b = crowdedCombatants[right];
    const minimum = a.components.body.collisionRadius +
      b.components.body.collisionRadius + 2;
    assert.ok(Game.util.dist(a.x, a.y, b.x, b.y) >= minimum - .02,
      `crowded encounter separates ${a.id}/${b.id}`);
  }
}
Game.actors.despawn(fighterMate.id, 'test');
Game.actors.despawn(slimeMate.id, 'test');
fighter.x = 0;
fighter.y = 0;
slime.x = 70;
slime.y = 0;
fighter.components.movement.intent = null;
slime.components.movement.intent = null;
Game.combat.advanceToTick(encounter.id, 30);
assert.ok(fighter.x > 0 || slime.x < 70, 'fixed ticks execute movement intents');
if (fighter.hp > 0 && slime.hp > 0) {
  assert.ok(Game.util.dist(fighter.x, fighter.y, slime.x, slime.y) >= minimumContactDistance,
    'range chasing never overlaps living combatants');
}
Game.encounters.end(encounter.id, 'test');
assert.equal(fighter.encounterId, null);
assert.equal(fighter.components.actionState.abilityId, null);

// Charge reservation/refund, channel intervals, channel interruption, and recharge.
const channelEncounter = Game.encounters.start('encounter.grassland', {
  id: 'test:channel-charge', seed: 17, silent: true
});
const channeler = Game.actors.spawn({
  instanceId: 'test:channeler', archetypeId: 'adventurer', classId: 'fighter',
  level: 1, tier: 1, factionId: 'adventurers',
  statValues: party('fighter', 1)[0].statValues,
  transform: { x: 0, y: 0 },
  spawnSource: { kind: 'test', sourceId: 'runtime-channel', sequence: 1 }
});
const channelTarget = Game.actors.spawn({
  instanceId: 'test:channel-target', archetypeId: 'slime_green',
  level: 1, tier: 1, transform: { x: 20, y: 0 },
  spawnSource: { kind: 'test', sourceId: 'runtime-channel', sequence: 2 }
});
channeler.abilities = ['fixture.channel-charge'];
channelTarget.hp = channelTarget.maxHp = 1e9;
Game.encounters.join(channelEncounter.id, channeler.id, 'party');
Game.encounters.join(channelEncounter.id, channelTarget.id, 'enemy');
const channelCommand = {
  actorId: channeler.id, targetId: channelTarget.id, abilityId: 'fixture.channel-charge'
};
assert.equal(Game.combat.requestAction(channelCommand).ok, true);
assert.equal(channeler.components.cooldowns.charges['fixture.channel-charge'].current, 1);
assert.equal(Game.combat.cancelAction(channeler.id, 'test-refund'), true);
assert.equal(channeler.components.cooldowns.charges['fixture.channel-charge'].current, 2,
  'cancelled casts refund their reserved charge');
assert.equal(Game.combat.requestAction(channelCommand).ok, true);
Game.combat.advanceToTick(channelEncounter.id, 2);
assert.equal(channeler.components.actionState.state, 'channeling');
assert.equal(Game.combat.interrupt(channeler.id, channeler.id, 999), true);
assert.equal(channeler.components.cooldowns.charges['fixture.channel-charge'].current, 1,
  'a charge committed at channel start is not refunded by a channel interrupt');
assert.equal(Game.combat.requestAction(channelCommand).ok, true);
const targetHpBeforeChannel = channelTarget.hp;
Game.combat.advanceToTick(channelEncounter.id, 10);
assert.equal(targetHpBeforeChannel - channelTarget.hp, 3,
  'a six-tick channel resolves at two-tick intervals including its final pulse');
assert.equal(channelEncounter.eventLog.filter((event) =>
  event.type === 'action:channelTick').length, 2);
assert.equal(channelEncounter.eventLog.filter((event) =>
  event.type === 'action:resolved' && event.abilityId === 'fixture.channel-charge').length, 1);
assert.equal(channeler.components.cooldowns.charges['fixture.channel-charge'].current, 1);
Game.combat.advanceToTick(channelEncounter.id, 20);
assert.equal(channeler.components.cooldowns.charges['fixture.channel-charge'].current, 2,
  'charges deterministically refill on their integer-tick schedule');
Game.encounters.end(channelEncounter.id, 'test');
assert.deepEqual(Object.keys(channeler.components.cooldowns.charges), [],
  'encounter cleanup removes tick-relative charge state');
const leashEncounter = Game.encounters.start('encounter.grassland', {
  id: 'test:leash', seed: 19, silent: true,
  leashActorId: channeler.id, leashAnchor: { x: 0, y: 0 }, leashRadius: 30
});
channeler.x = 80;
channeler.y = 0;
channelTarget.x = 0;
channelTarget.y = 0;
Game.encounters.join(leashEncounter.id, channeler.id, 'party');
Game.encounters.join(leashEncounter.id, channelTarget.id, 'enemy');
Game.combat.tickFixed(leashEncounter.id);
assert.equal(leashEncounter.lifecycle, 'ended');
assert.equal(leashEncounter.result.reason, 'leash');
assert.equal(channeler.encounterId, null);

// Status contracts: multiplicative stacks exponentiate, periodic effects scale
// with stacks, and unique reapplication never creates duplicate instances.
const statusEncounter = Game.encounters.start('encounter.grassland', {
  id: 'test:status-contracts', seed: 23, silent: true
});
channeler.x = 0;
channeler.y = 0;
channelTarget.x = 10;
channelTarget.y = 0;
Game.encounters.join(statusEncounter.id, channeler.id, 'party');
Game.encounters.join(statusEncounter.id, channelTarget.id, 'enemy');
const baseArmor = Game.units.stat(channelTarget, 'armor');
function applyFixtureStatus(statusId) {
  return Game.combat.applyStatus({
    encounterId: statusEncounter.id,
    sourceActorId: channeler.id,
    targetActorId: channelTarget.id,
    abilityId: 'fixture.apply-status',
    effect: {
      statusId,
      target: { relation: 'hostile', shape: 'single', range: 100 }
    }
  });
}
applyFixtureStatus('fixture.stack-multiply');
applyFixtureStatus('fixture.stack-multiply');
assert.ok(Math.abs(Game.units.stat(channelTarget, 'armor') - baseArmor * 0.81) < 1e-9,
  'two 0.9 multiplicative stacks resolve to 0.9^2');
applyFixtureStatus('fixture.stack-dot');
applyFixtureStatus('fixture.stack-dot');
applyFixtureStatus('fixture.unique');
applyFixtureStatus('fixture.unique');
assert.equal(channelTarget.components.statuses.filter((status) =>
  status.statusId === 'fixture.unique').length, 1);
const beforePeriodic = channelTarget.hp;
Game.combat.tickFixed(statusEncounter.id);
assert.equal(beforePeriodic - channelTarget.hp, 8,
  'two periodic stacks must execute two deterministic pulses');
Game.encounters.end(statusEncounter.id, 'test');

// Every Boss enters its immutable 50% phase rule.
for (let index = 0; index < regions.length; index++) {
  const regionId = regions[index];
  const bossEncounter = Game.encounters.start(`encounter.${regionId}.boss`, {
    id: `test:boss:${regionId}`, seed: 100 + index, silent: true
  });
  const player = Game.actors.spawn({
    instanceId: `test:boss-player:${regionId}`, archetypeId: 'adventurer',
    classId: 'fighter', tier: index + 1, level: 40,
    statValues: party('fighter', index + 1)[0].statValues,
    transform: { x: 100, y: 100 },
    spawnSource: { kind: 'test', sourceId: regionId, sequence: 10 }
  });
  const bossId = bossEncounter.profile.packs[0].members[0];
  const boss = Game.actors.spawn({
    instanceId: `test:boss-enemy:${regionId}`,
    archetypeId: typeof bossId === 'string' ? bossId : bossId.archetypeId,
    tier: index + 1, level: 40, transform: { x: 118, y: 100 },
    spawnSource: { kind: 'test', sourceId: regionId, sequence: 20 }
  });
  Game.encounters.join(bossEncounter.id, player.id, 'party');
  Game.encounters.join(bossEncounter.id, boss.id, 'enemy');
  boss.hp = boss.maxHp * .49;
  Game.combat.tickFixed(bossEncounter.id);
  assert.equal(Object.keys(bossEncounter.phaseTriggered).length, 1, `${regionId} phase`);
  Game.encounters.end(bossEncounter.id, 'test');
  Game.actors.despawn(player.id, 'test');
  Game.actors.despawn(boss.id, 'test');
  Game.encounters.remove(bossEncounter.id);
}

// All 16 production profiles preserve the legacy two-team termination projection.
const compatibilityProfiles = Game.content.all('encounterProfile');
assert.equal(compatibilityProfiles.length, 16);
for (let profileIndex = 0; profileIndex < compatibilityProfiles.length; profileIndex++) {
  const profile = compatibilityProfiles[profileIndex];
  const compatibility = Game.encounters.start(profile.id, {
    id: `test:termination:${profile.id}`,
    seed: 700 + profileIndex,
    silent: true
  });
  const compatibilityHero = Game.actors.spawn({
    instanceId: `test:termination:hero:${profile.id}`,
    archetypeId: 'adventurer',
    classId: 'fighter',
    tier: profileIndex % 8 + 1,
    level: 40,
    factionId: 'adventurers',
    statValues: party('fighter', profileIndex % 8 + 1)[0].statValues,
    transform: { x: 100, y: 100 },
    spawnSource: { kind: 'test', sourceId: profile.id, sequence: 1 }
  });
  Game.encounters.join(compatibility.id, compatibilityHero.id, 'party');
  const compatibilityPack = Game.content.get('encounterPack', profile.encounterPackIds[0]);
  const compatibilityEnemies = compatibilityPack.members.map((member, memberIndex) => {
    const actor = Game.actors.spawn({
      instanceId: `test:termination:enemy:${profile.id}:${member.slotId}`,
      archetypeId: member.archetypeId,
      variantId: member.variantId || null,
      tier: profileIndex % 8 + 1,
      level: 40,
      transform: { x: 118 + memberIndex * 8, y: 100 + memberIndex * 8 },
      spawnSource: {
        kind: 'test',
        sourceId: profile.id,
        sequence: 100 + memberIndex
      }
    });
    Game.encounters.join(compatibility.id, actor.id, 'enemy');
    return actor;
  });
  const ongoing = Game.encounters.evaluateObjectives(compatibility.id);
  assert.equal(ongoing.done, false, `${profile.id} starts ongoing`);
  compatibility.tick = 37;
  const expectedRewardIds = Array.from(compatibilityEnemies)
    .filter((actor) => actor.encounterRewardAuthorized)
    .map((actor) => actor.id)
    .sort();
  compatibilityEnemies.forEach((actor) => Game.units.defeat(actor, { commit: false }));
  const legacyLivingTeams = ['party', 'enemy'].filter((teamId) =>
    compatibility.teams[teamId].members.some((actorId) => {
      const actor = Game.actors.get(actorId);
      return actor && actor.components.vitals.hp > 0;
    })
  );
  const legacyResult = {
    done: legacyLivingTeams.length <= 1,
    winnerTeamId: legacyLivingTeams.length === 1 ? legacyLivingTeams[0] : null,
    tick: compatibility.tick
  };
  const objectiveResult = Game.encounters.evaluateObjectives(compatibility.id);
  assert.equal(objectiveResult.done, legacyResult.done, `${profile.id} termination`);
  assert.equal(objectiveResult.winnerTeamId, legacyResult.winnerTeamId,
    `${profile.id} winner projection`);
  assert.equal(compatibility.tick, legacyResult.tick, `${profile.id} ending tick`);
  assert.deepEqual(
    Array.from(objectiveResult.rewardAuthorizedActorIds),
    expectedRewardIds,
    `${profile.id} reward authorization`
  );
  Game.actors.despawn(compatibilityHero.id, 'test');
  compatibilityEnemies.forEach((actor) => Game.actors.despawn(actor.id, 'test'));
  Game.encounters.remove(compatibility.id);
}

// Formal 4+8 Lab budget: active combat step P95 <= 2ms.
const perfEncounter = Game.encounters.start('encounter.grassland', {
  id: 'test:performance', seed: 88, silent: true, fullLog: false
});
for (let index = 0; index < 4; index++) {
  const actor = Game.actors.spawn({
    instanceId: `perf:ally:${index}`, archetypeId: 'adventurer',
    classId: classes[index], tier: 1, level: 40,
    statValues: party(classes[index], 1)[0].statValues,
    transform: { x: 100, y: 100 + index * 12 },
    spawnSource: { kind: 'test', sourceId: 'performance', sequence: index + 1 }
  });
  Game.encounters.join(perfEncounter.id, actor.id, 'party');
  actor.hp = actor.maxHp = 1e9;
}
for (let index = 0; index < 8; index++) {
  const actor = Game.actors.spawn({
    instanceId: `perf:enemy:${index}`, archetypeId: index % 2 ? 'wolf_gray' : 'slime_green',
    tier: 1, level: 40, transform: { x: 120, y: 100 + index * 10 },
    spawnSource: { kind: 'test', sourceId: 'performance', sequence: 100 + index }
  });
  Game.encounters.join(perfEncounter.id, actor.id, 'enemy');
  actor.hp = actor.maxHp = 1e9;
}
const stepTimes = [];
for (let index = 0; index < 800; index++) {
  const started = performance.now();
  Game.combat.tickFixed(perfEncounter.id);
  stepTimes.push(performance.now() - started);
}
stepTimes.sort((a, b) => a - b);
const p95 = stepTimes[Math.floor(stepTimes.length * .95)];
assert.ok(p95 <= 2, `4+8 fixed step p95 ${p95.toFixed(3)}ms`);
Game.encounters.end(perfEncounter.id, 'test');

// Five class rotations remain live and bounded for an exact ten minutes (12,000 × 50 ms).
for (let index = 0; index < classes.length; index++) {
  const classId = classes[index];
  const stableEncounter = Game.encounters.start('encounter.grassland', {
    id: `test:stability:${classId}`, seed: 5000 + index, silent: true, fullLog: false
  });
  const player = Game.actors.spawn({
    instanceId: `stability:player:${classId}`, archetypeId: 'adventurer',
    classId, tier: 1, level: 40, statValues: party(classId, 1)[0].statValues,
    transform: { x: 100, y: 100 },
    spawnSource: { kind: 'test', sourceId: 'ten-minute-stability', sequence: index + 1 }
  });
  const enemy = Game.actors.spawn({
    instanceId: `stability:enemy:${classId}`, archetypeId: 'slime_green',
    tier: 1, level: 40, transform: { x: 118, y: 100 },
    spawnSource: { kind: 'test', sourceId: 'ten-minute-stability', sequence: 100 + index }
  });
  Game.encounters.join(stableEncounter.id, player.id, 'party');
  Game.encounters.join(stableEncounter.id, enemy.id, 'enemy');
  player.hp = player.maxHp = 1e12;
  enemy.hp = enemy.maxHp = 1e12;
  for (let tick = 0; tick < 12000; tick++) Game.combat.tickFixed(stableEncounter.id);
  assert.equal(stableEncounter.tick, 12000, `${classId} must execute the full ten-minute timeline`);
  assert.ok((stableEncounter.metrics.actions[player.id] || 0) >= 100,
    `${classId} rotation must not permanently idle`);
  assert.ok(stableEncounter.scheduler.length < 32, `${classId} scheduler must remain bounded`);
  assert.ok(stableEncounter.eventLog.length <= stableEncounter.rules.eventLogSize,
    `${classId} event ring buffer must remain bounded`);
  Object.keys(player.components.resources || {}).forEach((resourceId) => {
    const resource = player.components.resources[resourceId];
    const def = Game.content.get('resource', resourceId);
    const actionReservation = (player.components.actionState.reserved || [])
      .filter((cost) => cost.resourceId === resourceId)
      .reduce((total, cost) => total + cost.amount, 0);
    assert.ok(Number.isFinite(resource.value), `${classId}/${resourceId} remains finite`);
    assert.ok(resource.value >= def.min && resource.value <= def.max,
      `${classId}/${resourceId} remains within declared bounds`);
    assert.equal(resource.reserved, actionReservation,
      `${classId}/${resourceId} reservation ledger must match the active action`);
    assert.ok(resource.reserved >= 0 && resource.reserved <= resource.value,
      `${classId}/${resourceId} reservation remains payable`);
  });
  Game.encounters.end(stableEncounter.id, 'test');
  Object.keys(player.components.resources || {}).forEach((resourceId) => {
    assert.equal(player.components.resources[resourceId].reserved, 0,
      `${classId}/${resourceId} clears reservation on encounter end`);
  });
  Game.actors.despawn(player.id, 'test');
  Game.actors.despawn(enemy.id, 'test');
  Game.encounters.remove(stableEncounter.id);
}

console.log(`V2 runtime tests passed: ${matrixSamples} balance samples, 5×10-minute rotations, 8 Boss phases, 4+8 p95=${p95.toFixed(3)}ms.`);
