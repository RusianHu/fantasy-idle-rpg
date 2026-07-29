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
    delete actor.encounterRewardAuthorized;
  }

  function currentParticipationState(encounter, actorId) {
    var info = encounter.participantStates[actorId];
    if (info && ['surrendered', 'escaped', 'left'].indexOf(info.state) >= 0) return info.state;
    var actor = Game.actors.get(actorId);
    if (!actor) return 'left';
    if (!actor.components.vitals || actor.components.vitals.hp <= 0 ||
        actor.components.actionState && actor.components.actionState.state === 'defeated') return 'defeated';
    return 'active';
  }

  function refreshParticipation(encounter) {
    Object.keys(encounter.participantStates).sort().forEach(function (actorId) {
      encounter.participantStates[actorId].state = currentParticipationState(encounter, actorId);
    });
  }

  function selectedParticipants(encounter, objective) {
    return Object.keys(encounter.participantStates).sort().filter(function (actorId) {
      var info = encounter.participantStates[actorId];
      if (objective.actorId && actorId !== objective.actorId) return false;
      if (objective.teamId && info.teamId !== objective.teamId) return false;
      if (objective.coalitionId && info.coalitionId !== objective.coalitionId) return false;
      if (objective.tag) {
        var actor = Game.actors.get(actorId);
        if (!actor || actor.tags.indexOf(objective.tag) < 0) return false;
      }
      return true;
    });
  }

  function objectiveResult(encounter, objective) {
    var actorIds = selectedParticipants(encounter, objective);
    var states = actorIds.map(function (actorId) { return encounter.participantStates[actorId].state; });
    var active = states.filter(function (state) { return state === 'active'; }).length;
    var minimum = Math.max(1, objective.minimum | 0 || 1);
    var status = 'ongoing';
    if (objective.type === 'eliminate') {
      status = !actorIds.length || active > 0 ? 'ongoing'
        : (states.some(function (state) { return state === 'left'; }) ? 'failure' : 'success');
    } else if (objective.type === 'survive') {
      status = active >= minimum ? 'success' : 'failure';
      if (objective.tick !== undefined && encounter.tick < objective.tick && active >= minimum) status = 'ongoing';
    } else if (objective.type === 'protect') {
      status = states.some(function (state) { return state === 'defeated' || state === 'left'; })
        ? 'failure' : (actorIds.length ? 'success' : 'ongoing');
    } else if (objective.type === 'surrender') {
      status = actorIds.length && states.every(function (state) { return state === 'surrendered'; })
        ? 'success' : (active > 0 ? 'ongoing' : 'failure');
    } else if (objective.type === 'escape') {
      status = actorIds.length && states.every(function (state) { return state === 'escaped'; })
        ? 'success' : (active > 0 ? 'ongoing' : 'failure');
    } else if (objective.type === 'timeout') {
      status = encounter.tick >= (objective.tick | 0) ? 'success' : 'ongoing';
    } else if (objective.type === 'custom') {
      var handler = Game.rules.handler('objective', objective.handlerId);
      if (!handler || handler.version !== objective.handlerVersion) {
        throw new Error('[Encounters] objective handler mismatch: ' + objective.handlerId);
      }
      var custom = handler.fn(Game.contentCompiler.deepFreeze(Game.contentCompiler.clone({
        encounterId: encounter.id,
        tick: encounter.tick,
        teams: encounter.teams,
        participantStates: encounter.participantStates,
        metrics: encounter.metrics,
        selectedActorIds: actorIds
      })), Game.contentCompiler.deepFreeze(Game.contentCompiler.clone(objective.params || {})));
      if (!custom || ['ongoing', 'success', 'failure'].indexOf(custom.status) < 0) {
        throw new Error('[Encounters] invalid objective handler result: ' + objective.handlerId);
      }
      status = custom.status;
    }
    return {
      id: objective.id, type: objective.type, required: objective.required !== false,
      status: status, actorIds: actorIds, states: states,
      details: custom && custom.details !== undefined
        ? Game.contentCompiler.clone(custom.details) : null
    };
  }

  function winningState(encounter, status, objectiveResults) {
    var activeTeams = {};
    Object.keys(encounter.participantStates).forEach(function (actorId) {
      var info = encounter.participantStates[actorId];
      var team = encounter.teams[info.teamId];
      if (info.state === 'active' && team && team.role === 'combatant' &&
          team.countsForCompletion) activeTeams[info.teamId] = true;
    });
    var winningTeamIds = Object.keys(activeTeams).sort();
    var winningCoalitionIds = [];
    winningTeamIds.forEach(function (teamId) {
      var coalitionId = encounter.teams[teamId].coalitionId || teamId;
      if (winningCoalitionIds.indexOf(coalitionId) < 0) winningCoalitionIds.push(coalitionId);
    });
    winningCoalitionIds.sort();
    var rewardAuthorizedActorIds = [];
    if (status === 'success') {
      Object.keys(encounter.participantStates).sort().forEach(function (actorId) {
        var info = encounter.participantStates[actorId];
        var team = encounter.teams[info.teamId];
        var actor = Game.actors.get(actorId);
        if (team && team.rewardEligible &&
            (!actor || actor.rewardAuthorized !== false) &&
            ['defeated', 'surrendered', 'escaped'].indexOf(info.state) >= 0) {
          rewardAuthorizedActorIds.push(actorId);
        }
      });
    }
    return {
      winningTeamIds: winningTeamIds,
      winningCoalitionIds: winningCoalitionIds,
      winnerTeamId: winningTeamIds.length === 1 ? winningTeamIds[0] : null,
      objectiveResults: objectiveResults,
      participantStates: Game.contentCompiler.clone(encounter.participantStates),
      rewardAuthorizedActorIds: rewardAuthorizedActorIds
    };
  }

  function evaluateObjectives(encounter) {
    refreshParticipation(encounter);
    var combatants = Object.keys(encounter.participantStates).filter(function (actorId) {
      var info = encounter.participantStates[actorId];
      var team = encounter.teams[info.teamId];
      return team && team.role === 'combatant' && team.countsForCompletion;
    });
    if (combatants.length && !combatants.some(function (actorId) {
      return encounter.participantStates[actorId].state === 'active';
    })) {
      return Object.assign({ done: true, status: 'draw', reason: 'draw' },
        winningState(encounter, 'draw', []));
    }
    var objectives = encounter.profile.objectives || [];
    if (!objectives.length) return { done: false, status: 'ongoing' };
    var hasObjectiveParticipants = objectives.some(function (objective) {
      return selectedParticipants(encounter, objective).length > 0;
    });
    if (!hasObjectiveParticipants) {
      var participatingTeams = Object.keys(encounter.teams).filter(function (teamId) {
         return encounter.teams[teamId].members.length &&
           encounter.teams[teamId].role === 'combatant' &&
           encounter.teams[teamId].countsForCompletion;
      });
      var legacyLiving = participatingTeams.filter(function (teamId) {
        return encounter.teams[teamId].members.some(function (actorId) {
          return encounter.participantStates[actorId] &&
            encounter.participantStates[actorId].state === 'active';
        });
      });
      if (participatingTeams.length > 1 && legacyLiving.length <= 1) {
        return Object.assign({
          done: true, status: legacyLiving.length ? 'success' : 'draw',
          reason: legacyLiving.length ? 'victory' : 'draw'
        }, winningState(encounter, legacyLiving.length ? 'success' : 'draw', []));
      }
      return { done: false, status: 'ongoing', objectiveResults: [] };
    }
    var results = objectives.map(function (objective) { return objectiveResult(encounter, objective); });
    var completionPolicy = encounter.profile.completionPolicy || {};
    if (completionPolicy.mode !== 'allRequired') {
      throw new Error('[Encounters] unsupported completion policy: ' + completionPolicy.mode);
    }
    var required = results.filter(function (result) { return result.required; });
    if (required.some(function (result) { return result.status === 'failure'; })) {
      return Object.assign({ done: true, status: 'failure', reason: 'failure' },
        winningState(encounter, 'failure', results));
    }
    if (required.length && required.every(function (result) { return result.status === 'success'; })) {
      return Object.assign({ done: true, status: 'success', reason: 'victory' },
        winningState(encounter, 'success', results));
    }
    return { done: false, status: 'ongoing', objectiveResults: results };
  }

  function createEncounter(profileId, context) {
    context = context || {};
    var profile = Game.content.get('encounterProfile', profileId);
    if (!profile) throw new Error('[Encounters] unknown profile: ' + profileId);
    var rules = Game.content.get('combatRules', profile.rulesProfileId);
    if (!rules) throw new Error('[Encounters] missing rules: ' + profile.rulesProfileId);
    var id = context.id || 'encounter:' + sequence;
    var seed = Number.isInteger(context.seed)
      ? context.seed >>> 0
      : Game.util.strSeed(id + '|' + profileId);
    var encounter = {
      id: id, profileId: profileId, profile: profile, rules: rules,
      lifecycle: 'active', tick: 0, seed: seed, rngState: seed,
      nextSequence: 1, nextSpawnSequence: 1,
      participants: [], teams: {}, participantStates: {},
      rewardAuthorizedActorIds: [], relationOverrides: [], threatTables: {},
      scheduler: [], telegraphs: [], phaseTriggered: {},
      rewardBudget: Number(context.rewardBudget) || 1,
      eventLog: [],
      context: Object.assign({ silent: false, fullLog: false, estimator: false }, context),
      result: null,
      reactionBudget: rules.reactionBudgetPerTick || 128,
      effectBudget: rules.effectBudgetPerTick || 512,
      reactionCountsTick: {}, reactionCountsEncounter: {},
      metrics: { damage: {}, healing: {}, actions: {}, defeated: [] }
    };
    (profile.teamSlots || []).forEach(function (slot) {
      encounter.teams[slot.id] = {
        id: slot.id, members: [], role: slot.role || 'combatant',
        coalitionId: slot.coalitionId || slot.id,
        countsForCompletion: slot.countsForCompletion !== false,
        rewardEligible: !!slot.rewardEligible, dynamic: false
      };
    });
    return encounter;
  }

  function joinEncounter(encounter, actor, teamId, silentLog) {
    if (!encounter || encounter.lifecycle !== 'active' || !actor) return false;
    if (actor.encounterId && actor.encounterId !== encounter.id) return false;
    if (encounter.participants.indexOf(actor.id) >= 0) return true;
    teamId = teamId || actor.teamId;
    if (!teamId) throw new Error('[Encounters] teamId required');
    encounter.teams[teamId] = encounter.teams[teamId] || {
      id: teamId, members: [], role: 'combatant', coalitionId: teamId,
      countsForCompletion: true, rewardEligible: teamId !== 'party', dynamic: true
    };
    encounter.teams[teamId].members.push(actor.id);
    encounter.participants.push(actor.id);
    if (encounter.teams[teamId].role !== 'observer') encounter.threatTables[actor.id] = {};
    encounter.participantStates[actor.id] = {
      actorId: actor.id, teamId: teamId,
      coalitionId: encounter.teams[teamId].coalitionId || teamId,
      role: encounter.teams[teamId].role, state: 'active'
    };
    actor.encounterId = encounter.id;
    actor.teamId = teamId;
    actor.encounterRewardAuthorized = !!encounter.teams[teamId].rewardEligible &&
      actor.rewardAuthorized !== false;
    if (actor.encounterRewardAuthorized &&
        encounter.rewardAuthorizedActorIds.indexOf(actor.id) < 0) {
      encounter.rewardAuthorizedActorIds.push(actor.id);
      encounter.rewardAuthorizedActorIds.sort();
    }
    if (actor.components.actionState) actor.components.actionState.state = 'idle';
    Object.keys(actor.components.resources || {}).forEach(function (id) {
      var resource = actor.components.resources[id];
      var def = Game.content.get('resource', id);
      if (def && def.reset && def.reset.encounterStart === 'initial') resource.value = def.initial;
    });
    if (!silentLog) log(encounter, {
      type: 'encounter:joined', sourceActorId: actor.id,
      payload: { teamId: teamId }
    });
    return true;
  }

  var E = Game.encounters = {
    start: function (profileId, context) {
      context = context || {};
      var encounter = createEncounter(profileId, context);
      var id = encounter.id;
      if (encounters[id]) throw new Error('[Encounters] duplicate: ' + id);
      if (!context.id) sequence++;
      encounters[id] = encounter;
      log(encounter, { type: 'encounter:started', profileId: profileId, payload: { seed: encounter.seed } });
      return encounter;
    },

    join: function (encounterId, actorId, teamId) {
      var encounter = encounters[encounterId];
      var actor = Game.actors.get(actorId);
      return joinEncounter(encounter, actor, teamId, false);
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
      if (encounter.participantStates[actorId]) {
        encounter.participantStates[actorId].state = reason === 'surrender'
          ? 'surrendered' : (reason === 'escape' ? 'escaped' : 'left');
      }
      cleanActor(Game.actors.get(actorId), reason || 'leave');
      log(encounter, {
        type: 'encounter:left', sourceActorId: actorId,
        payload: { reason: reason || 'leave' }
      });
      if (reason === 'escape' && Game.population) {
        Game.population.onActorEscaped(Game.actors.get(actorId));
      }
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
    prepareAtomicDraft: function (profileId, context) {
      return createEncounter(profileId, Object.assign({}, context || {}, { silent: true }));
    },
    mountAtomicDraft: function (encounter) {
      if (!encounter || encounters[encounter.id]) throw new Error('[Encounters] atomic mount conflict');
      encounters[encounter.id] = encounter;
      return encounter;
    },
    joinAtomic: function (encounter, actorId, teamId) {
      return joinEncounter(encounter, Game.actors.get(actorId), teamId, true);
    },
    unmountAtomic: function (id) {
      if (!encounters[id]) return false;
      delete encounters[id];
      return true;
    },
    startAtomic: function (plan) {
      if (!Game.engagement || typeof Game.engagement.commitPlan !== 'function') {
        throw new Error('[Encounters] Engagement atomic coordinator unavailable');
      }
      return Game.engagement.commitPlan(plan);
    },
    all: function () { return Object.keys(encounters).sort().map(function (id) { return encounters[id]; }); },
    snapshot: function (id) {
      var encounter = encounters[id];
      if (!encounter) return null;
      return Game.contentCompiler.deepFreeze(Game.contentCompiler.clone({
        id: encounter.id, profileId: encounter.profileId, lifecycle: encounter.lifecycle,
        tick: encounter.tick, seed: encounter.seed, rngState: encounter.rngState,
        participants: encounter.participants, teams: encounter.teams,
        participantStates: encounter.participantStates,
        rewardAuthorizedActorIds: encounter.rewardAuthorizedActorIds,
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
    evaluateObjectives: function (encounterId) {
      var encounter = encounters[encounterId];
      if (!encounter || encounter.lifecycle !== 'active') return null;
      var state = evaluateObjectives(encounter);
      if (state.done) return E.end(encounterId, state.reason, state);
      return state;
    },
    checkEnd: function (encounterId) { return E.evaluateObjectives(encounterId); },
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
