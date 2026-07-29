/* Encounter aggregate: participants, teams, RNG, scheduler, threat, telegraphs and victory. */
(function () {
  'use strict';
  var Game = window.Game;
  var encounters = {};
  var sequence = 1;
  var phaseOrder = { expire: 10, periodic: 20, resolve: 30, reaction: 40, commit: 50, cleanup: 60 };

  function nextRandom(encounter) {
    var a = encounter.rngState >>> 0;
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    encounter.rngState = a >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function scheduleSort(a, b) {
    return a.dueTick - b.dueTick ||
      (phaseOrder[a.phase] || 99) - (phaseOrder[b.phase] || 99) ||
      a.sequence - b.sequence;
  }

  function log(encounter, event) {
    var full = Object.assign({
      encounterId: encounter.id,
      tick: encounter.tick,
      phase: event.phase || 'commit',
      sequence: encounter.nextSequence++
    }, event);
    encounter.eventLog.push(full);
    if (!encounter.context.fullLog && encounter.eventLog.length > encounter.rules.eventLogSize) {
      encounter.eventLog.splice(0, encounter.eventLog.length - encounter.rules.eventLogSize);
    }
    if (!encounter.context.silent && Game.bus) {
      Game.bus.emit(full.type, full);
      Game.bus.emit('combat:event', full);
    }
    return full;
  }

  function cleanActor(actor, reason) {
    if (!actor) return;
    if (actor.components.actionState) {
      actor.components.actionState.state = actor.components.vitals && actor.components.vitals.hp <= 0 ? 'defeated' : 'idle';
      actor.components.actionState.actionId = null;
      actor.components.actionState.abilityId = null;
      actor.components.actionState.queued = null;
      actor.components.actionState.reserved = [];
      actor.components.actionState.reservedCharge = null;
    }
    if (actor.components.resources) {
      Object.keys(actor.components.resources).forEach(function (id) {
        var resource = actor.components.resources[id];
        resource.reserved = 0;
        var def = Game.content.get('resource', id);
        var policy = def && def.reset && def.reset[reason] || def && def.reset && def.reset.encounterEnd;
        if (policy === 'initial') resource.value = def.initial;
        else if (policy === 'min') resource.value = def.min;
      });
    }
    (actor.components.statuses || []).forEach(function (status) {
      Game.units.removeModifierSource(actor, status.id, {
        hpPolicy: 'preserveRatio'
      });
    });
    if (actor.components.statuses) actor.components.statuses.length = 0;
    if (actor.components.vitals) actor.components.vitals.shields.length = 0;
    if (actor.components.cooldowns) {
      actor.components.cooldowns.abilities = {};
      actor.components.cooldowns.groups = {};
      actor.components.cooldowns.charges = {};
    }
    if (actor.components.comboState) {
      actor.components.comboState.id = null;
      actor.components.comboState.step = 0;
      actor.components.comboState.expiresTick = 0;
      actor.components.comboState.markedTargetId = null;
    }
    if (actor.components.movement) {
      actor.components.movement.intent = null;
      actor.components.movement.path = null;
      actor.components.movement.moving = false;
    }
    actor.encounterId = null;
    actor.teamId = null;
  }

  function endState(encounter) {
    var livingTeams = {};
    encounter.participants.forEach(function (actorId) {
      var actor = Game.actors.get(actorId);
      if (actor && actor.components.vitals && actor.components.vitals.hp > 0 &&
          actor.components.actionState.state !== 'defeated') {
        livingTeams[actor.teamId] = true;
      }
    });
    var teams = Object.keys(livingTeams);
    if (teams.length === 0) return { done: true, reason: 'draw', winnerTeamId: null };
    if (teams.length === 1 && Object.keys(encounter.teams).length > 1) {
      return { done: true, reason: 'victory', winnerTeamId: teams[0] };
    }
    return { done: false };
  }

  var E = Game.encounters = {
    start: function (profileId, context) {
      context = context || {};
      var profile = Game.content.get('encounterProfile', profileId);
      if (!profile) throw new Error('[Encounters] unknown profile: ' + profileId);
      var rules = Game.content.get('combatRules', profile.rulesProfileId);
      if (!rules) throw new Error('[Encounters] missing rules: ' + profile.rulesProfileId);
      var id = context.id || 'encounter:' + sequence++;
      if (encounters[id]) throw new Error('[Encounters] duplicate: ' + id);
      var seed = Number.isInteger(context.seed)
        ? context.seed >>> 0
        : Game.util.strSeed(id + '|' + profileId);
      var encounter = {
        id: id,
        profileId: profileId,
        profile: profile,
        rules: rules,
        lifecycle: 'active',
        tick: 0,
        seed: seed,
        rngState: seed,
        nextSequence: 1,
        nextSpawnSequence: 1,
        participants: [],
        teams: {},
        relationOverrides: [],
        threatTables: {},
        scheduler: [],
        telegraphs: [],
        phaseTriggered: {},
        rewardBudget: Number(context.rewardBudget) || 1,
        eventLog: [],
        context: Object.assign({ silent: false, fullLog: false, estimator: false }, context),
        result: null,
        reactionBudget: rules.reactionBudgetPerTick || 128,
        effectBudget: rules.effectBudgetPerTick || 512,
        reactionCountsTick: {},
        reactionCountsEncounter: {},
        metrics: { damage: {}, healing: {}, actions: {}, defeated: [] }
      };
      encounters[id] = encounter;
      log(encounter, { type: 'encounter:started', profileId: profileId, payload: { seed: seed } });
      return encounter;
    },

    join: function (encounterId, actorId, teamId) {
      var encounter = encounters[encounterId];
      var actor = Game.actors.get(actorId);
      if (!encounter || encounter.lifecycle !== 'active' || !actor) return false;
      if (actor.encounterId && actor.encounterId !== encounterId) return false;
      if (encounter.participants.indexOf(actorId) >= 0) return true;
      teamId = teamId || actor.teamId;
      if (!teamId) throw new Error('[Encounters] teamId required');
      encounter.teams[teamId] = encounter.teams[teamId] || { id: teamId, members: [] };
      encounter.teams[teamId].members.push(actorId);
      encounter.participants.push(actorId);
      encounter.threatTables[actorId] = {};
      actor.encounterId = encounterId;
      actor.teamId = teamId;
      if (actor.components.actionState) actor.components.actionState.state = 'idle';
      Object.keys(actor.components.resources || {}).forEach(function (id) {
        var resource = actor.components.resources[id];
        var def = Game.content.get('resource', id);
        if (def && def.reset && def.reset.encounterStart === 'initial') resource.value = def.initial;
      });
      log(encounter, {
        type: 'encounter:joined', sourceActorId: actorId,
        payload: { teamId: teamId }
      });
      return true;
    },

    leave: function (encounterId, actorId, reason) {
      var encounter = encounters[encounterId];
      if (!encounter) return false;
      var at = encounter.participants.indexOf(actorId);
      if (at < 0) return false;
      encounter.participants.splice(at, 1);
      Object.keys(encounter.teams).forEach(function (teamId) {
        var members = encounter.teams[teamId].members;
        var memberAt = members.indexOf(actorId);
        if (memberAt >= 0) members.splice(memberAt, 1);
      });
      delete encounter.threatTables[actorId];
      cleanActor(Game.actors.get(actorId), reason || 'leave');
      log(encounter, {
        type: 'encounter:left', sourceActorId: actorId,
        payload: { reason: reason || 'leave' }
      });
      return true;
    },

    end: function (encounterId, reason, result) {
      var encounter = encounters[encounterId];
      if (!encounter || encounter.lifecycle === 'ended') return encounter && encounter.result;
      encounter.lifecycle = 'ended';
      encounter.result = Object.assign({ reason: reason || 'ended' }, result || {});
      var temporaryActors = [];
      encounter.participants.slice().forEach(function (actorId) {
        var actor = Game.actors.get(actorId);
        if (actor && actor.spawnSource && actor.spawnSource.kind === 'summon') {
          temporaryActors.push(actor.id);
        }
        cleanActor(actor, 'encounterEnd');
      });
      Game.relations.clearEncounter(encounterId);
      encounter.telegraphs.length = 0;
      encounter.scheduler.length = 0;
      log(encounter, { type: 'encounter:ended', payload: encounter.result });
      temporaryActors.forEach(function (actorId) {
        Game.actors.despawn(actorId, 'encounterEnd');
      });
      return encounter.result;
    },

    get: function (id) { return encounters[id] || null; },
    all: function () { return Object.keys(encounters).sort().map(function (id) { return encounters[id]; }); },
    snapshot: function (id) {
      var encounter = encounters[id];
      if (!encounter) return null;
      return Game.contentCompiler.deepFreeze(Game.contentCompiler.clone({
        id: encounter.id, profileId: encounter.profileId, lifecycle: encounter.lifecycle,
        tick: encounter.tick, seed: encounter.seed, rngState: encounter.rngState,
        participants: encounter.participants, teams: encounter.teams,
        threatTables: encounter.threatTables, scheduler: encounter.scheduler,
        telegraphs: encounter.telegraphs, phaseTriggered: encounter.phaseTriggered,
        reactionCountsEncounter: encounter.reactionCountsEncounter,
        rewardBudget: encounter.rewardBudget,
        eventLog: encounter.eventLog, result: encounter.result, metrics: encounter.metrics
      }));
    },
    random: function (encounterId) {
      var encounter = encounters[encounterId];
      if (!encounter) throw new Error('[Encounters] missing encounter');
      return nextRandom(encounter);
    },
    schedule: function (encounterId, spec) {
      var encounter = encounters[encounterId];
      if (!encounter || encounter.lifecycle !== 'active') return null;
      var item = Object.assign({
        dueTick: encounter.tick,
        phase: 'resolve',
        sequence: encounter.nextSequence++
      }, spec || {});
      item.dueTick = Math.max(encounter.tick, item.dueTick | 0);
      encounter.scheduler.push(item);
      encounter.scheduler.sort(scheduleSort);
      return item;
    },
    due: function (encounterId, phase) {
      var encounter = encounters[encounterId];
      var out = [];
      if (!encounter) return out;
      for (var i = encounter.scheduler.length - 1; i >= 0; i--) {
        var item = encounter.scheduler[i];
        if (item.dueTick <= encounter.tick && item.phase === phase) {
          out.push(item);
          encounter.scheduler.splice(i, 1);
        }
      }
      return out.sort(scheduleSort);
    },
    log: function (encounterId, event) {
      var encounter = encounters[encounterId];
      return encounter ? log(encounter, event) : null;
    },
    checkEnd: function (encounterId) {
      var encounter = encounters[encounterId];
      if (!encounter || encounter.lifecycle !== 'active') return null;
      var state = endState(encounter);
      if (state.done) return E.end(encounterId, state.reason, state);
      return null;
    },
    remove: function (id) {
      if (encounters[id] && encounters[id].lifecycle === 'active') E.end(id, 'removed');
      delete encounters[id];
    },
    reset: function () {
      Object.keys(encounters).forEach(function (id) {
        if (encounters[id].lifecycle === 'active') E.end(id, 'reset');
      });
      encounters = {};
      sequence = 1;
    }
  };
})();
