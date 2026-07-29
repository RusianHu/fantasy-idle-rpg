/* Stable-key Engagement commands with detached prepare and atomic commit. */
(function () {
  'use strict';
  var Game = window.Game;
  var C = Game.contentCompiler;
  var queue = [];
  var results = {};
  var revision = 0;
  var clockTick = 0;
  var commandSequence = 1;
  var ordinals = {};
  var faultInjector = null;

  function keyText(key) { return C.stableStringify(key || {}); }

  function commandSort(a, b) {
    return a.requestedTick - b.requestedTick ||
      keyText(a.sourceKey).localeCompare(keyText(b.sourceKey)) ||
      keyText(a.targetKey).localeCompare(keyText(b.targetKey)) ||
      a.commandId.localeCompare(b.commandId);
  }

  function resolveKey(key) {
    if (!key) return { actor: null, reason: 'missing-key' };
    if (key.actorRecordId) {
      var actors = Game.actors.query({ actorRecordId: key.actorRecordId });
      return actors[0] ? { actor: actors[0] } : { actor: null, reason: 'spawn-unloaded' };
    }
    if (!key.spawnId) return { actor: null, reason: 'missing-key' };
    var lease = Game.population.lease(key.spawnId);
    if (!lease) return { actor: null, reason: 'spawn-unloaded' };
    if (lease.generation !== key.spawnGeneration) return { actor: null, reason: 'stale-generation' };
    var actor = Game.population.resolveActor(key);
    return actor ? { actor: actor } : { actor: null, reason: 'spawn-unloaded' };
  }

  function fault(stage, plan) {
    if (faultInjector) faultInjector(stage, plan);
  }

  function reject(command, reason, details) {
    var result = C.deepFreeze(C.clone({
      ok: false, commandId: command.commandId, reason: reason,
      tick: clockTick, details: details || null
    }));
    results[command.commandId] = result;
    if (Game.bus) Game.bus.emit('engagement:rejected', result);
    return result;
  }

  function combatCapable(archetypeId, variantId) {
    try {
      var blueprint = Game.content.compileBlueprint({
        archetypeId: archetypeId, variantId: variantId || null
      });
      return !!blueprint.resolvedProfiles.statProfileId &&
        blueprint.resolvedAbilityGrants.length > 0;
    } catch (error) {
      return false;
    }
  }

  function regionMatches(actor) {
    if (!actor.spawnId) return true;
    var lease = Game.population.lease(actor.spawnId);
    return !!lease && lease.context && lease.context.regionId === Game.state.world.region;
  }

  function groupActors(target, policy) {
    var actors = [target];
    if (!policy || policy.groupPropagation === 'none' || !target.socialGroupId) return actors;
    Game.actors.query().forEach(function (actor) {
      if (actor === target || actor.socialGroupId !== target.socialGroupId ||
          !actor.spawnId || actor.dead || actor.lifecycle !== 'active' ||
          actor.components.vitals && actor.components.vitals.hp <= 0) return;
      if (Game.util.dist(actor.x, actor.y, target.x, target.y) >
          Math.max(24, Number(policy.alertRadius) || 120)) return;
      actors.push(actor);
    });
    return actors.sort(function (a, b) {
      return keyText(Game.population.stableKey(a)).localeCompare(
        keyText(Game.population.stableKey(b))
      );
    });
  }

  function memoryJournal(writes) {
    var social = Game.state.world.social;
    return (writes || []).map(function (write) {
      var bucket = social.memories[write.kind];
      return {
        kind: write.kind, id: write.id,
        existed: Object.prototype.hasOwnProperty.call(bucket, write.id),
        before: C.clone(bucket[write.id])
      };
    });
  }

  function eventDraft(encounterId, sequence, type, spec) {
    return Object.assign({
      encounterId: encounterId, tick: 0, phase: 'commit',
      sequence: sequence, type: type
    }, spec || {});
  }

  function prepare(command) {
    var sourceResolved = resolveKey(command.sourceKey);
    if (!sourceResolved.actor) return { ok: false, reason: sourceResolved.reason };
    var targetResolved = resolveKey(command.targetKey);
    if (!targetResolved.actor) return { ok: false, reason: targetResolved.reason };
    var source = sourceResolved.actor;
    var target = targetResolved.actor;
    if (source.id === target.id) return { ok: false, reason: 'self-target' };
    if (!regionMatches(source) || !regionMatches(target)) return { ok: false, reason: 'region-changed' };
    if (source.encounterId || target.encounterId) return { ok: false, reason: 'occupied' };
    if (!source.components.vitals || !source.components.actionState) {
      return { ok: false, reason: 'source-not-combat-capable' };
    }
    var policy = Game.content.get(
      'engagementPolicy', target.blueprint.resolvedProfiles.engagementPolicyId
    );
    if (command.kind !== 'attack' || !policy || !policy.manualAttack) {
      return { ok: false, reason: 'protected-target' };
    }
    var spawnProfile = target.worldSpawnProfileId &&
      Game.content.get('worldSpawnProfile', target.worldSpawnProfileId);
    var targetVariantId = spawnProfile && spawnProfile.onProvokedVariantId ||
      target.variantId || null;
    if (!combatCapable(target.blueprint.archetypeId, targetVariantId)) {
      return { ok: false, reason: 'target-not-combat-capable' };
    }
    var group = groupActors(target, policy);
    if (group.some(function (actor) { return actor.encounterId; })) {
      return { ok: false, reason: 'occupied' };
    }
    var profileId = command.encounterProfileId || 'encounter.' + Game.state.world.region;
    if (!Game.content.has('encounterProfile', profileId)) {
      return { ok: false, reason: 'missing-encounter-profile' };
    }
    if (command.openingAbilityId && !Game.actors.ability(source, command.openingAbilityId)) {
      return { ok: false, reason: 'opening-ability' };
    }

    var groupPlans = [];
    var variantDrafts = [];
    for (var gi = 0; gi < group.length; gi++) {
      var actor = group[gi];
      var profile = actor.worldSpawnProfileId &&
        Game.content.get('worldSpawnProfile', actor.worldSpawnProfileId);
      var nextVariantId = actor === target ? targetVariantId :
        (profile && profile.onProvokedVariantId || actor.variantId || null);
      var capable = combatCapable(actor.blueprint.archetypeId, nextVariantId);
      if (nextVariantId && actor.variantId !== nextVariantId) {
        var preparedVariant = Game.actors.prepareVariantTransition(actor.id, nextVariantId, {
          triggerId: 'provoked', internal: true
        });
        if (!preparedVariant.ok) return {
          ok: false, reason: preparedVariant.reason, details: String(preparedVariant.error || '')
        };
        variantDrafts.push(preparedVariant.draft);
      }
      groupPlans.push({
        actorId: actor.id,
        expectedRuntimeRevision: actor.runtimeRevision,
        nextVariantId: nextVariantId,
        combatCapable: capable
      });
    }

    var stableSpawn = target.spawnId || target.id;
    var ordinal = (ordinals[stableSpawn] || 0) + 1;
    var encounterId = 'engagement:' + Game.util.fnv1a([
      Game.state.world.region, stableSpawn, ordinal, profileId
    ].join('|'));
    var seed = Game.util.strSeed([
      Game.state.world.worldSeed, Game.state.world.region,
      stableSpawn, ordinal, profileId
    ].join('|'));
    var encounterDraft = Game.encounters.prepareAtomicDraft(profileId, {
      id: encounterId, seed: seed, silent: true,
      stableSpawn: stableSpawn, engagementCommandId: command.commandId, world: true
    });
    var relationPrepared = Game.relations.prepareOverride(
      'actor', source.id, target.id, 'hostile', {
        encounterId: encounterId, ownerId: encounterId, lifetimeScope: 'encounter',
        sourceKey: command.sourceKey, targetKey: command.targetKey, symmetric: true
      }
    );
    var memoryWrites = Game.relations.prepareMemory(source.id, target.id, 'hostile', policy);
    var joinPlans = [{ actorId: source.id, teamId: 'party' }].concat(
      groupPlans.filter(function (item) { return item.combatCapable; }).map(function (item) {
        return { actorId: item.actorId, teamId: 'enemy' };
      })
    );
    var outbox = [];
    variantDrafts.forEach(function (draft) {
      outbox.push(eventDraft(encounterId, outbox.length + 1, 'actor:variantChanged', {
        actorId: draft.actorId,
        sourceActorId: draft.actorId,
        payload: {
          actorId: draft.actorId, oldVariantId: draft.oldVariantId,
          newVariantId: draft.newVariantId, triggerId: draft.edge.triggerId,
          summary: C.clone(draft.summary)
        }
      }));
    });
    outbox.push(eventDraft(encounterId, outbox.length + 1, 'relation:changed', {
      sourceActorId: source.id, targetActorId: target.id,
      payload: { sourceKey: C.clone(command.sourceKey), targetKey: C.clone(command.targetKey), relation: 'hostile' }
    }));
    outbox.push(eventDraft(encounterId, outbox.length + 1, 'encounter:started', {
      profileId: profileId, payload: { seed: seed }
    }));
    joinPlans.forEach(function (join) {
      outbox.push(eventDraft(encounterId, outbox.length + 1, 'encounter:joined', {
        sourceActorId: join.actorId, payload: { teamId: join.teamId }
      }));
    });
    outbox.push(eventDraft(encounterId, outbox.length + 1, 'engagement:committed', {
      payload: {
        ok: true, commandId: command.commandId, tick: clockTick,
        encounterId: encounterId, revision: revision + 1, seed: seed,
        variantChangedActorIds: variantDrafts.map(function (draft) { return draft.actorId; })
      }
    }));
    encounterDraft.eventLog = outbox.map(C.clone);
    encounterDraft.nextSequence = outbox.length + 1;

    var affected = [source].concat(group).filter(function (actor, index, list) {
      return list.indexOf(actor) === index;
    });
    var plan = {
      version: 1, kind: 'engagement.start',
      command: C.clone(command), expectedRevision: revision,
      sourceId: source.id, targetId: target.id,
      sourceKey: C.clone(command.sourceKey), targetKey: C.clone(command.targetKey),
      actorPreconditions: affected.map(function (actor) {
        return { actorId: actor.id, runtimeRevision: actor.runtimeRevision, encounterId: actor.encounterId || null };
      }),
      groupPlans: groupPlans, variantDrafts: variantDrafts,
      policyId: policy.id, profileId: profileId,
      encounterId: encounterId, encounterDraft: encounterDraft,
      stableSpawn: stableSpawn, ordinal: ordinal, seed: seed,
      relationPrepared: relationPrepared, memoryWrites: memoryWrites,
      joinPlans: joinPlans,
      targetWrites: { sourceId: source.id, targetId: target.id },
      mutationJournal: {
        actors: affected.map(function (actor) { return Game.actors.captureTransactionState(actor.id); }),
        memories: memoryJournal(memoryWrites),
        ordinalExisted: Object.prototype.hasOwnProperty.call(ordinals, stableSpawn),
        ordinalBefore: ordinals[stableSpawn], revisionBefore: revision
      },
      eventOutbox: outbox,
      openingAction: command.openingAbilityId ? {
        actorId: source.id, targetId: target.id, abilityId: command.openingAbilityId
      } : null
    };
    return { ok: true, plan: Object.freeze(plan) };
  }

  function restoreMemories(journal) {
    var social = Game.state.world.social;
    (journal || []).forEach(function (entry) {
      if (entry.existed) social.memories[entry.kind][entry.id] = C.clone(entry.before);
      else delete social.memories[entry.kind][entry.id];
    });
  }

  function publishOutbox(plan) {
    plan.eventOutbox.forEach(function (event) {
      Game.bus.emit(event.type, event);
      Game.bus.emit('combat:event', event);
    });
  }

  function commitPlan(plan) {
    var command = plan && plan.command;
    var mounted = false;
    var relationCommitted = false;
    try {
      if (!plan || plan.version !== 1 || plan.kind !== 'engagement.start') throw new Error('invalid-plan');
      if (plan.expectedRevision !== revision) throw new Error('revision-mismatch');
      if (Game.encounters.get(plan.encounterId)) throw new Error('encounter-conflict');
      var sourceResolved = resolveKey(plan.sourceKey);
      var targetResolved = resolveKey(plan.targetKey);
      if (!sourceResolved.actor || !targetResolved.actor) {
        throw new Error(sourceResolved.reason || targetResolved.reason || 'spawn-unloaded');
      }
      if (sourceResolved.actor.id !== plan.sourceId || targetResolved.actor.id !== plan.targetId) {
        throw new Error('precondition');
      }
      plan.actorPreconditions.forEach(function (expected) {
        var actor = Game.actors.get(expected.actorId);
        if (!actor || actor.runtimeRevision !== expected.runtimeRevision ||
            (actor.encounterId || null) !== expected.encounterId) throw new Error('precondition');
      });

      fault('before-variant', plan);
      plan.variantDrafts.forEach(function (draft) {
        var result = Game.actors.commitPreparedVariant(draft, { silent: true });
        if (!result.ok) throw new Error(result.reason);
      });
      fault('after-variant', plan);

      Game.relations.commitPreparedOverride(plan.relationPrepared);
      relationCommitted = true;
      Game.relations.commitPreparedMemory(plan.memoryWrites);
      fault('after-relation', plan);

      Game.encounters.mountAtomicDraft(plan.encounterDraft);
      mounted = true;
      fault('after-encounter-mount', plan);
      plan.joinPlans.forEach(function (join) {
        if (!Game.encounters.joinAtomic(plan.encounterDraft, join.actorId, join.teamId)) {
          throw new Error('join-' + join.teamId);
        }
      });
      var source = Game.actors.get(plan.targetWrites.sourceId);
      var target = Game.actors.get(plan.targetWrites.targetId);
      if (!source || !target || !target.encounterId) throw new Error('join-target');
      source.components.targeting.priorityTargetId = target.id;
      target.components.targeting.priorityTargetId = source.id;
      source.target = target;
      target.engaged = true;
      fault('after-join', plan);

      ordinals[plan.stableSpawn] = plan.ordinal;
      revision++;
      fault('after-metadata', plan);
      var result = C.deepFreeze(C.clone({
        ok: true, commandId: command.commandId, tick: clockTick,
        encounterId: plan.encounterId, revision: revision, seed: plan.seed,
        variantChanged: plan.variantDrafts.length > 0,
        variantChangedActorIds: plan.variantDrafts.map(function (draft) { return draft.actorId; })
      }));
      results[command.commandId] = result;
      plan.encounterDraft.context.silent = false;
      publishOutbox(plan);
      if (plan.openingAction) {
        var openingAction = Game.combat.requestAction(C.clone(plan.openingAction));
        result = C.deepFreeze(C.clone(Object.assign({}, result, { openingAction: openingAction })));
        results[command.commandId] = result;
      }
      return result;
    } catch (error) {
      if (mounted) Game.encounters.unmountAtomic(plan.encounterId);
      if (relationCommitted) Game.relations.rollbackPreparedOverride(plan.relationPrepared);
      restoreMemories(plan && plan.mutationJournal && plan.mutationJournal.memories);
      (plan && plan.mutationJournal && plan.mutationJournal.actors || []).slice().reverse().forEach(function (state) {
        Game.actors.restoreTransactionState(state);
      });
      if (plan && plan.mutationJournal) {
        revision = plan.mutationJournal.revisionBefore;
        if (plan.mutationJournal.ordinalExisted) {
          ordinals[plan.stableSpawn] = plan.mutationJournal.ordinalBefore;
        } else delete ordinals[plan.stableSpawn];
      }
      var message = String(error && error.message || error);
      var reason = ['revision-mismatch', 'stale-generation', 'spawn-unloaded'].indexOf(message) >= 0
        ? message : 'commit-rollback';
      return reject(command || { commandId: 'invalid-plan' }, reason, message);
    }
  }

  var E = Game.engagement = {
    canInitiate: function (spec) {
      spec = spec || {};
      var command = {
        commandId: spec.commandId || 'engagement-preview',
        requestedTick: Number.isInteger(spec.requestedTick) ? spec.requestedTick : clockTick + 1,
        sourceKey: C.clone(spec.sourceKey || null), targetKey: C.clone(spec.targetKey || null),
        kind: spec.kind || 'attack', openingAbilityId: spec.openingAbilityId || null,
        encounterProfileId: spec.encounterProfileId || null
      };
      var prepared = prepare(command);
      return prepared.ok ? { ok: true, command: C.deepFreeze(C.clone(command)) } :
        { ok: false, reason: prepared.reason, details: prepared.details || null };
    },

    requestAttack: function (sourceKey, targetKey, options) {
      return E.enqueue(Object.assign({}, options || {}, {
        sourceKey: sourceKey, targetKey: targetKey, kind: 'attack'
      }));
    },
    provoke: function (sourceKey, targetKey, options) {
      return E.requestAttack(sourceKey, targetKey, options);
    },
    forgive: function (key) { return Game.relations.forgive(key); },

    enqueue: function (spec) {
      spec = spec || {};
      var commandId = spec.commandId || 'engagement-command-' + commandSequence++;
      if (results[commandId]) return results[commandId];
      var existing = queue.filter(function (command) { return command.commandId === commandId; })[0];
      if (existing) return { ok: true, queued: true, commandId: commandId };
      var command = {
        commandId: commandId,
        requestedTick: Number.isInteger(spec.requestedTick) ? spec.requestedTick : clockTick + 1,
        sourceKey: C.clone(spec.sourceKey || null), targetKey: C.clone(spec.targetKey || null),
        kind: spec.kind || 'attack', openingAbilityId: spec.openingAbilityId || null,
        encounterProfileId: spec.encounterProfileId || null
      };
      queue.push(command);
      queue.sort(commandSort);
      return { ok: true, queued: true, commandId: commandId };
    },

    processCommands: function (tick) {
      clockTick = Math.max(clockTick, tick | 0);
      var due = queue.filter(function (command) { return command.requestedTick <= clockTick; }).sort(commandSort);
      queue = queue.filter(function (command) { return command.requestedTick > clockTick; });
      return due.map(function (command) {
        if (results[command.commandId]) return results[command.commandId];
        var prepared = prepare(command);
        return prepared.ok ? Game.encounters.startAtomic(prepared.plan) :
          reject(command, prepared.reason, prepared.details);
      });
    },
    advanceTick: function () { clockTick++; return E.processCommands(clockTick); },
    prepare: function (command) { return prepare(command); },
    commitPlan: commitPlan,
    revision: function () { return revision; },
    clockTick: function () { return clockTick; },
    result: function (commandId) { return results[commandId] || null; },
    queued: function () { return C.deepFreeze(C.clone(queue)); },
    snapshot: function () {
      return C.deepFreeze(C.clone({
        tick: clockTick, revision: revision, queue: queue,
        results: results, ordinals: ordinals
      }));
    },

    cancelForSpawn: function (spawnId, generation, reason) {
      var cancelled = [];
      queue = queue.filter(function (command) {
        var matches = [command.sourceKey, command.targetKey].some(function (key) {
          return key && key.spawnId === spawnId &&
            (generation === undefined || key.spawnGeneration === generation);
        });
        if (matches) {
          cancelled.push(reject(command, reason || 'spawn-unloaded'));
          return false;
        }
        return true;
      });
      return cancelled;
    },
    cancelAll: function (reason) {
      var pending = queue.slice();
      queue = [];
      return pending.map(function (command) { return reject(command, reason || 'region-changed'); });
    },
    reset: function () {
      queue = []; results = {}; revision = 0; clockTick = 0;
      commandSequence = 1; ordinals = {}; faultInjector = null;
    },
    setFaultInjector: function (fn) { faultInjector = typeof fn === 'function' ? fn : null; }
  };
})();
