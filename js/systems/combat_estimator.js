/* Headless accelerated simulation using production content, actors, AI and combat rules. */
(function () {
  'use strict';
  var Game = window.Game;
  var cache = {};

  function stableKey(spec) {
    return Game.util.fnv1a(Game.contentCompiler.stableStringify({
      fingerprint: Game.content.fingerprint(),
      party: spec.partySnapshot,
      encounterProfileId: spec.encounterProfileId,
      tacticsProfile: spec.tacticsProfile,
      sampleSeeds: spec.sampleSeeds,
      maxTicks: spec.maxTicks
    }));
  }

  function spawnActor(encounter, spec, teamId, index) {
    var actor = Game.actors.spawn({
      instanceId: encounter.id + ':' + teamId + ':' + index,
      archetypeId: spec.archetypeId,
      classId: spec.classId || null,
      level: spec.level || 1,
      tier: spec.tier || 1,
      transform: { x: teamId === 'party' ? 120 + index * 18 : 180 + index * 22, y: 160 + index * 20, direction: 'r' },
      factionId: spec.factionId,
      controllerId: spec.controllerId || (teamId === 'party' ? 'ai:player-auto' : 'ai:monster'),
      statValues: spec.statValues,
      talentRanks: spec.talentRanks,
      encounterId: encounter.id,
      spawnSource: { kind: 'estimator', sourceId: encounter.profileId, sequence: index + (teamId === 'party' ? 1 : 100) }
    });
    actor.tacticsProfileId = spec.tacticsProfileId;
    if (spec.statMultipliers) {
      var modifiers = Object.keys(spec.statMultipliers).map(function (statId) {
        return {
          stat: statId, phase: 'multiply',
          operation: 'multiply', value: spec.statMultipliers[statId]
        };
      });
      Game.units.setModifierSource(actor, 'estimator-override', modifiers, {
        hpPolicy: 'full', commit: false
      });
    }
    Game.encounters.join(encounter.id, actor.id, teamId);
    return actor;
  }

  function enemySpecs(profile, packId, tier) {
    var pack = profile.packs.filter(function (candidate) { return !packId || candidate.id === packId; })[0] || profile.packs[0];
    return (pack && pack.members || []).map(function (member) {
      return typeof member === 'string'
        ? { archetypeId: member, tier: tier }
        : Object.assign({ tier: tier }, member);
    });
  }

  function one(spec, seed, sampleIndex, evaluationKey) {
    var profile = Game.content.get('encounterProfile', spec.encounterProfileId);
    var encounter = Game.encounters.start(profile.id, {
      id: 'estimator:' + evaluationKey + ':' + sampleIndex,
      seed: seed, estimator: true, silent: true, fullLog: false
    });
    var spawned = [];
    (spec.partySnapshot || []).forEach(function (member, index) {
      var actor = spawnActor(encounter, Object.assign({}, member, {
        tacticsProfileId: spec.tacticsProfile || member.tacticsProfileId
      }), 'party', index);
      spawned.push(actor);
    });
    enemySpecs(profile, spec.packId, spec.tier || 1).forEach(function (member, index) {
      var actor = spawnActor(encounter, member, 'enemy', index);
      spawned.push(actor);
    });
    var maxTicks = spec.maxTicks || 12000;
    Game.combat.advanceToTick(encounter.id, maxTicks);
    if (encounter.lifecycle === 'active') Game.encounters.end(encounter.id, 'timeout', { winnerTeamId: null });
    var result = {
      ticks: encounter.tick,
      seconds: encounter.tick * encounter.rules.tickMs / 1000,
      winnerTeamId: encounter.result && encounter.result.winnerTeamId || null,
      damage: Object.assign({}, encounter.metrics.damage),
      healing: Object.assign({}, encounter.metrics.healing),
      actions: Object.assign({}, encounter.metrics.actions),
      enemyCount: enemySpecs(profile, spec.packId, spec.tier || 1).length,
      resourceStable: spawned.filter(function (actor) { return actor.teamId === null && actor.category === 'player'; }).every(function (actor) {
        return Object.keys(actor.components.resources || {}).every(function (id) {
          return Number.isFinite(actor.components.resources[id].value);
        });
      })
    };
    spawned.forEach(function (actor) { Game.actors.despawn(actor.id, 'estimator'); });
    Game.encounters.remove(encounter.id);
    return result;
  }

  Game.combatEstimator = {
    evaluate: function (spec) {
      spec = Object.assign({ sampleSeeds: [1, 2, 3], maxTicks: 12000 }, spec || {});
      var key = stableKey(spec);
      if (cache[key]) return Game.contentCompiler.clone(cache[key]);
      var samples = spec.sampleSeeds.map(function (seed, index) {
        return one(spec, seed >>> 0, index, key);
      });
      var wins = samples.filter(function (sample) { return sample.winnerTeamId === 'party'; }).length;
      var summary = {
        key: key,
        contentFingerprint: Game.content.fingerprint(),
        samples: samples,
        averageTicks: Math.round(samples.reduce(function (sum, x) { return sum + x.ticks; }, 0) / Math.max(1, samples.length)),
        averageSeconds: samples.reduce(function (sum, x) { return sum + x.seconds; }, 0) / Math.max(1, samples.length),
        failureRate: 1 - wins / Math.max(1, samples.length),
        averageDps: samples.reduce(function (sum, sample) {
          var dealt = Object.keys(sample.damage).filter(function (actorId) {
            return actorId.indexOf(':party:') >= 0;
          }).reduce(function (damageSum, actorId) { return damageSum + sample.damage[actorId]; }, 0);
          return sum + dealt / Math.max(0.05, sample.seconds);
        }, 0) / Math.max(1, samples.length),
        enemyCount: samples[0] && samples[0].enemyCount || 1,
        resourceStable: samples.every(function (sample) { return sample.resourceStable; })
      };
      cache[key] = Game.contentCompiler.deepFreeze(summary);
      return Game.contentCompiler.clone(summary);
    },
    invalidate: function () { cache = {}; },
    cacheSize: function () { return Object.keys(cache).length; },
    partySnapshotFromState: function (opts) {
      opts = opts || {};
      var baseOpts = Object.assign({}, opts, { skills: {} });
      var derived = Game.player.previewDerived(baseOpts);
      var classId = opts.classId === undefined ? Game.state.player.classId : opts.classId;
      var ranks = opts.skills || Game.state.player.skills;
      return [{
        archetypeId: 'adventurer',
        classId: classId,
        level: opts.level || Game.state.player.level,
        talentRanks: Game.contentCompiler.clone(ranks || {}),
        factionId: 'adventurers',
        controllerId: 'ai:player-auto',
        statValues: {
          maxHp: derived.maxHp,
          armor: derived.def,
          ward: Math.max(0, Math.round(derived.def * 0.65)),
          physicalPower: derived.atk,
          magicPower: derived.atk,
          accuracy: 0.94,
          gcdSpeed: 1 + Math.max(0, derived.spd - 10) * 0.012,
          castSpeed: 1 + Math.max(0, derived.spd - 10) * 0.009,
          autoAttackSpeed: 1 + Math.max(0, derived.spd - 10) * 0.018,
          cooldownRate: 1 + derived.cdr,
          moveSpeed: 56,
          range: derived.range,
          critChance: derived.crit,
          critMultiplier: derived.critDmg,
          dodgeChance: derived.dodge,
          healingPower: derived.atk * derived.healPow,
          shieldPower: derived.maxHp,
          lifesteal: derived.lifesteal,
          statusPotency: 1,
          tenacity: 0,
          interruptPower: 1,
          threatMultiplier: classId === 'fighter' ? 2.2 : 1,
          resourceRegen: 1,
          expMultiplier: derived.expMul,
          goldMultiplier: derived.goldMul,
          dropMultiplier: derived.dropMul
        }
      }];
    },
    evaluateCurrent: function (opts) {
      opts = opts || {};
      var regionId = opts.regionId || Game.state.world.region;
      var profile = Game.content.get('encounterProfile', 'encounter.' + regionId);
      if (!profile) return null;
      return Game.combatEstimator.evaluate({
        partySnapshot: Game.combatEstimator.partySnapshotFromState(opts),
        encounterProfileId: profile.id,
        packId: opts.packId || profile.packs[0].id,
        tier: opts.tier || Game.State.regionTier(regionId),
        tacticsProfile: opts.tacticsProfile || Game.state.settings.combatStrategy || 'balanced',
        sampleSeeds: opts.sampleSeeds || [11, 29, 47],
        maxTicks: opts.maxTicks || 12000
      });
    },
    evaluateRegion: function (partySnapshot, regionId, tacticsProfile) {
      var profile = Game.content.get('encounterProfile', 'encounter.' + regionId);
      if (!profile) return null;
      return profile.packs.map(function (pack) {
        return Game.combatEstimator.evaluate({
          partySnapshot: partySnapshot,
          encounterProfileId: profile.id,
          packId: pack.id,
          tier: Game.State && Game.State.regionTier ? Game.State.regionTier(regionId) : 1,
          tacticsProfile: tacticsProfile || 'balanced',
          sampleSeeds: [11, 29, 47]
        });
      });
    }
  };
})();
