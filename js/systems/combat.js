/* Deterministic integer-tick auto-combat. No render delta or unseeded RNG enters results. */
(function () {
  'use strict';
  var Game = window.Game;
  var accumulatorMs = 0;
  var reactionDepth = 0;

  function encounterOf(actor) { return actor && Game.encounters.get(actor.encounterId); }
  function stat(actor, id) { return actor.components.statBlock.value(id); }
  function alive(actor) {
    return !!(actor && actor.components.vitals && actor.components.vitals.hp > 0 &&
      actor.components.actionState && actor.components.actionState.state !== 'defeated');
  }
  function emit(encounter, type, spec) {
    return Game.encounters.log(encounter.id, Object.assign({ type: type }, spec || {}));
  }
  function random(encounter) { return Game.encounters.random(encounter.id); }
  function ability(actor, id) {
    if (actor.abilities.indexOf(id) < 0) return null;
    return Game.content.get('ability', id);
  }
  function distance(a, b) {
    return Game.util.dist(a.components.transform.x, a.components.transform.y,
      b.components.transform.x, b.components.transform.y);
  }
  function gcdTicks(actor, encounter) {
    return Math.max(encounter.rules.gcdFloorTicks,
      Math.round(encounter.rules.baseGcdTicks / Math.max(0.1, stat(actor, 'gcdSpeed'))));
  }
  function timingTicks(actor, base, speedStat) {
    return Math.max(0, Math.round((base || 0) / Math.max(0.1, stat(actor, speedStat))));
  }

  function resourceCanPay(actor, abilityDef) {
    return (abilityDef.costs || []).every(function (cost) {
      var resource = actor.components.resources[cost.resourceId];
      return resource && resource.value - resource.reserved >= cost.amount;
    });
  }
  function reserve(actor, abilityDef) {
    var reserved = [];
    (abilityDef.costs || []).forEach(function (cost) {
      var resource = actor.components.resources[cost.resourceId];
      resource.reserved += cost.amount;
      reserved.push({ resourceId: cost.resourceId, amount: cost.amount });
    });
    actor.components.actionState.reserved = reserved;
  }
  function commitResources(actor) {
    (actor.components.actionState.reserved || []).forEach(function (cost) {
      var resource = actor.components.resources[cost.resourceId];
      resource.reserved = Math.max(0, resource.reserved - cost.amount);
      resource.value = Game.util.clamp(resource.value - cost.amount, resource.min, resource.max);
    });
    actor.components.actionState.reserved = [];
  }
  function refund(actor, abilityDef) {
    var ratio = abilityDef.timing && abilityDef.timing.refundRatio;
    if (!Number.isFinite(ratio)) ratio = 1;
    (actor.components.actionState.reserved || []).forEach(function (cost) {
      var resource = actor.components.resources[cost.resourceId];
      resource.reserved = Math.max(0, resource.reserved - cost.amount);
      if (ratio < 1) resource.value = Game.util.clamp(resource.value - cost.amount * (1 - ratio), resource.min, resource.max);
    });
    actor.components.actionState.reserved = [];
  }

  function refreshCharges(encounter, actor, abilityDef) {
    var timing = abilityDef && abilityDef.timing || {};
    var maximum = Math.max(0, Number(timing.charges) | 0);
    if (!maximum) return null;
    var charges = actor.components.cooldowns.charges;
    var state = charges[abilityDef.id];
    if (!state) {
      state = charges[abilityDef.id] = {
        current: maximum, max: maximum, nextChargeTick: 0
      };
    }
    state.max = maximum;
    state.current = Game.util.clamp(state.current, 0, maximum);
    var rechargeTicks = Math.max(1,
      timingTicks(actor, timing.rechargeTicks || timing.cooldownTicks || 1, 'cooldownRate'));
    if (state.current < maximum && !state.nextChargeTick) {
      state.nextChargeTick = encounter.tick + rechargeTicks;
    }
    while (state.current < maximum && state.nextChargeTick <= encounter.tick) {
      state.current++;
      state.nextChargeTick = state.current < maximum
        ? state.nextChargeTick + rechargeTicks
        : 0;
    }
    return state;
  }

  function cooldownInfo(encounter, actor, abilityDef) {
    var timing = abilityDef.timing || {};
    var charge = refreshCharges(encounter, actor, abilityDef);
    var abilityReady = charge
      ? (charge.current > 0 ? encounter.tick : charge.nextChargeTick)
      : actor.components.cooldowns.abilities[abilityDef.id] || 0;
    var groupReady = timing.sharedCooldownGroup
      ? actor.components.cooldowns.groups[timing.sharedCooldownGroup] || 0 : 0;
    var gcdReady = abilityDef.actionType === 'gcd'
      ? actor.components.cooldowns.groups.gcd || 0 : 0;
    return {
      readyAt: Math.max(abilityReady, groupReady, gcdReady),
      charge: charge
    };
  }

  function reserveCharge(encounter, actor, abilityDef) {
    var charge = refreshCharges(encounter, actor, abilityDef);
    if (!charge) return true;
    if (charge.current <= 0) return false;
    charge.current--;
    if (charge.current < charge.max && !charge.nextChargeTick) {
      var timing = abilityDef.timing || {};
      charge.nextChargeTick = encounter.tick + Math.max(1,
        timingTicks(actor, timing.rechargeTicks || timing.cooldownTicks || 1, 'cooldownRate'));
    }
    actor.components.actionState.reservedCharge = { abilityId: abilityDef.id };
    return true;
  }

  function commitCharge(actor) {
    actor.components.actionState.reservedCharge = null;
  }

  function refundCharge(encounter, actor, abilityDef) {
    var reserved = actor.components.actionState.reservedCharge;
    if (!reserved || !abilityDef || reserved.abilityId !== abilityDef.id) return;
    var timing = abilityDef.timing || {};
    var ratio = Number.isFinite(timing.refundRatio) ? timing.refundRatio : 1;
    var charge = refreshCharges(encounter, actor, abilityDef);
    if (charge && ratio > 0) {
      charge.current = Math.min(charge.max, charge.current + 1);
      if (charge.current >= charge.max) charge.nextChargeTick = 0;
    }
    actor.components.actionState.reservedCharge = null;
  }

  function targetList(encounter, source, primaryTarget, spec, context) {
    spec = spec || { relation: 'hostile', shape: 'single' };
    if (spec.relation === 'self') return [source];
    var relation = spec.relation || 'hostile';
    var candidates = encounter.participants.map(Game.actors.get).filter(function (target) {
      return alive(target) && Game.relations.resolve(source.id, target.id, encounter.id) === relation;
    });
    candidates = candidates.filter(function (target) {
      var hpRatio = target.hp / Math.max(1, target.maxHp);
      if (spec.minHpPct !== undefined && hpRatio < spec.minHpPct) return false;
      if (spec.maxHpPct !== undefined && hpRatio > spec.maxHpPct) return false;
      var statuses = target.components.statuses || [];
      if (spec.statusId && !statuses.some(function (status) {
        return status.statusId === spec.statusId;
      })) return false;
      if (spec.excludeStatusId && statuses.some(function (status) {
        return status.statusId === spec.excludeStatusId;
      })) return false;
      var requiredTags = spec.requiredTags || [];
      if (spec.tag) requiredTags = requiredTags.concat([spec.tag]);
      if (!requiredTags.every(function (tag) { return target.tags.indexOf(tag) >= 0; })) return false;
      if (spec.lineOfSight && Game.terrain && typeof Game.terrain.isWalkable === 'function') {
        var sightDistance = distance(source, target);
        var sightSteps = Math.max(1, Math.ceil(sightDistance / 8));
        for (var sightIndex = 1; sightIndex < sightSteps; sightIndex++) {
          var sightRatio = sightIndex / sightSteps;
          if (!Game.terrain.isWalkable(
              source.x + (target.x - source.x) * sightRatio,
              source.y + (target.y - source.y) * sightRatio, 1
            )) return false;
        }
      }
      return true;
    });
    var telegraph = context && context.telegraph;
    if (telegraph) {
      candidates = candidates.filter(function (target) {
        return Game.util.dist(telegraph.x, telegraph.y, target.x, target.y) <=
          Math.max(4, Number(telegraph.radius) || 24);
      });
      return candidates.sort(function (a, b) {
        return Game.util.dist(telegraph.x, telegraph.y, a.x, a.y) -
          Game.util.dist(telegraph.x, telegraph.y, b.x, b.y) ||
          a.id.localeCompare(b.id);
      }).slice(0, spec.maxTargets || 99);
    }
    var cx = primaryTarget ? primaryTarget.x : source.x;
    var cy = primaryTarget ? primaryTarget.y : source.y;
    var range = Number(spec.range) || stat(source, 'range') || 24;
    var radius = Number(spec.radius) || 0;
    var shape = spec.shape || 'single';
    function pointLineDistance(target, ax, ay, bx, by) {
      var vx = bx - ax, vy = by - ay;
      var lengthSq = vx * vx + vy * vy;
      if (lengthSq < 0.001) return Game.util.dist(target.x, target.y, ax, ay);
      var at = Game.util.clamp(((target.x - ax) * vx + (target.y - ay) * vy) / lengthSq, 0, 1);
      return Game.util.dist(target.x, target.y, ax + vx * at, ay + vy * at);
    }
    candidates = candidates.filter(function (target) {
      if (shape === 'single') return target.id === (primaryTarget && primaryTarget.id);
      if (shape === 'selfRadius') return distance(source, target) <= radius;
      if (shape === 'circle') return Game.util.dist(cx, cy, target.x, target.y) <= radius;
      if (shape === 'ring') {
        var ringDistance = Game.util.dist(cx, cy, target.x, target.y);
        return ringDistance >= (Number(spec.innerRadius) || radius * 0.5) && ringDistance <= radius;
      }
      if (shape === 'line') {
        var lineLength = Math.min(range, Game.util.dist(source.x, source.y, cx, cy));
        var lineDx = cx - source.x, lineDy = cy - source.y;
        var lineNorm = Math.sqrt(lineDx * lineDx + lineDy * lineDy) || 1;
        return pointLineDistance(target, source.x, source.y,
          source.x + lineDx / lineNorm * lineLength,
          source.y + lineDy / lineNorm * lineLength) <=
          (Number(spec.width) || radius || 12);
      }
      if (shape === 'cone') {
        var coneDx = target.x - source.x, coneDy = target.y - source.y;
        var coneDistance = Math.sqrt(coneDx * coneDx + coneDy * coneDy);
        if (coneDistance > range) return false;
        var facingX = cx - source.x, facingY = cy - source.y;
        var facingLength = Math.sqrt(facingX * facingX + facingY * facingY) || 1;
        var cos = (coneDx * facingX + coneDy * facingY) /
          Math.max(0.001, coneDistance * facingLength);
        return cos >= Math.cos((Number(spec.angleDeg) || 60) * Math.PI / 360);
      }
      return Game.util.dist(cx, cy, target.x, target.y) <= radius;
    });
    if (shape === 'single' && primaryTarget && candidates.indexOf(primaryTarget) < 0) return [];
    if (shape === 'single' && primaryTarget && distance(source, primaryTarget) > range) return [];
    candidates.sort(function (a, b) {
      if (spec.sort === 'lowestHp') {
        return a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp) ||
          a.id.localeCompare(b.id);
      }
      if (spec.sort === 'highestHp') {
        return b.hp / Math.max(1, b.maxHp) - a.hp / Math.max(1, a.maxHp) ||
          a.id.localeCompare(b.id);
      }
      if (spec.sort === 'highestThreat') {
        var table = encounter.threatTables[source.id] || {};
        return (table[b.id] || 0) - (table[a.id] || 0) || a.id.localeCompare(b.id);
      }
      if (spec.sort === 'seeded') {
        return Game.util.strSeed(encounter.seed + '|' + a.id) -
          Game.util.strSeed(encounter.seed + '|' + b.id) || a.id.localeCompare(b.id);
      }
      return distance(source, a) - distance(source, b) || a.id.localeCompare(b.id);
    });
    return candidates.slice(0, spec.maxTargets || 99);
  }

  function resistance(actor, damageTypeId) {
    var profileId = actor.blueprint.resolvedProfiles.resistanceProfileId;
    var profile = Game.content.get('resistanceProfile', profileId);
    return profile && Number(profile.resistances[damageTypeId]) || 0;
  }

  function triggerReactions(encounter, event) {
    if (reactionDepth >= encounter.rules.maxReactionDepth || encounter.reactionBudget <= 0) return;
    reactionDepth++;
    try {
      encounter.participants.slice().sort().forEach(function (actorId) {
        if (encounter.reactionBudget <= 0) return;
        var actor = Game.actors.get(actorId);
        if (!alive(actor)) return;
        actor.abilities.forEach(function (id) {
          if (encounter.reactionBudget <= 0) return;
          var reaction = Game.content.get('ability', id);
          if (!reaction || reaction.kind !== 'reaction' || !reaction.trigger) return;
          if (reaction.trigger.event !== event.type) return;
          if (reaction.trigger.source === 'self' && event.sourceActorId !== actor.id) return;
          if (reaction.trigger.target === 'self' && (event.targetActorIds || []).indexOf(actor.id) < 0) return;
          var reactionKey = actor.id + '|' + reaction.id;
          var limits = reaction.limits || {};
          if ((encounter.reactionCountsTick[reactionKey] || 0) >=
              (Number(limits.perTick) || Infinity)) return;
          if ((encounter.reactionCountsEncounter[reactionKey] || 0) >=
              (Number(limits.perEncounter) || Infinity)) return;
          encounter.reactionBudget--;
          encounter.reactionCountsTick[reactionKey] =
            (encounter.reactionCountsTick[reactionKey] || 0) + 1;
          encounter.reactionCountsEncounter[reactionKey] =
            (encounter.reactionCountsEncounter[reactionKey] || 0) + 1;
          applyEffects(encounter, actor, actor, reaction, reaction.effects, {
            reaction: true, parentEvent: event
          });
          emit(encounter, 'reaction:triggered', {
            phase: 'reaction', sourceActorId: actor.id, abilityId: reaction.id,
            targetActorIds: event.targetActorIds || []
          });
        });
      });
    } finally {
      reactionDepth--;
    }
  }

  function damage(encounter, source, target, abilityDef, effect, effectIndex) {
    var type = Game.content.get('damageType', effect.damageTypeId || 'slashing');
    if (!type || !alive(target)) return null;
    var accuracy = Game.util.clamp(stat(source, 'accuracy') || 1, 0.05, 1);
    var dodge = Game.util.clamp(stat(target, 'dodgeChance') || 0, 0, 0.8);
    if (random(encounter) > accuracy * (1 - dodge)) {
      return emit(encounter, 'combat:miss', {
        phase: 'commit', sourceActorId: source.id, targetActorIds: [target.id],
        abilityId: abilityDef.id, effectIndex: effectIndex, payload: {}
      });
    }
    var raw = effect.formulaId
      ? Game.rules.evaluate(effect.formulaId, {
          sourceStats: source.components.statBlock.snapshot().values,
          targetStats: target.components.statBlock.snapshot().values
        }, effect.params || {})
      : Number(effect.amount) || 0;
    var crit = effect.canCrit !== false && random(encounter) < Game.util.clamp(stat(source, 'critChance'), 0, 0.95);
    if (crit) raw *= Math.max(1, stat(source, 'critMultiplier') || 1.5);
    var afterDefense = raw;
    if (type.category === 'physical') {
      var armor = Math.max(0, stat(target, 'armor'));
      afterDefense = raw * raw / Math.max(1, raw + armor);
    } else if (type.category === 'magic') {
      var ward = Math.max(0, stat(target, 'ward'));
      afterDefense = raw * raw / Math.max(1, raw + ward);
    }
    var resist = type.category === 'true' ? 0 : Game.util.clamp(resistance(target, type.id), -0.75, 0.85);
    var finalDamage = Math.max(1, Math.round(afterDefense * (1 - resist)));
    var remaining = finalDamage;
    var absorbed = 0;
    var shields = target.components.vitals.shields;
    shields.sort(function (a, b) { return b.priority - a.priority || a.id.localeCompare(b.id); });
    for (var si = shields.length - 1; si >= 0 && remaining > 0; si--) {
      var shield = shields[si];
      if (shield.damageTypes && shield.damageTypes.indexOf(type.id) < 0) continue;
      var amount = Math.min(shield.amount, remaining);
      shield.amount -= amount;
      remaining -= amount;
      absorbed += amount;
      if (shield.amount <= 0) shields.splice(si, 1);
    }
    var damageResult = Game.units.damage(target, remaining, { source: 'combat' });
    var appliedDamage = damageResult ? damageResult.amount : remaining;
    target.components.presentation.flash = 0.14;
    encounter.metrics.damage[source.id] = (encounter.metrics.damage[source.id] || 0) + appliedDamage;
    var table = encounter.threatTables[target.id] || (encounter.threatTables[target.id] = {});
    table[source.id] = (table[source.id] || 0) +
      appliedDamage * Math.max(0, stat(source, 'threatMultiplier') || 1);
    var event = emit(encounter, 'combat:hit', {
      phase: 'commit', sourceActorId: source.id, targetActorIds: [target.id],
      abilityId: abilityDef.id, effectIndex: effectIndex,
      tags: (abilityDef.tags || []).concat([type.id]),
      payload: {
        raw: raw, afterDefense: afterDefense, resistance: resist,
        absorbed: absorbed, amount: appliedDamage, crit: crit, damageTypeId: type.id
      }
    });
    var lifesteal = Game.util.clamp(stat(source, 'lifesteal') || 0, 0, 1);
    if (lifesteal > 0 && appliedDamage > 0) heal(encounter, source, source, abilityDef, {
      amount: appliedDamage * lifesteal, threatScale: 0
    }, effectIndex);
    triggerReactions(encounter, event);
    if (target.components.vitals.hp <= 0) Game.combat.defeat(target.id, {
      encounterId: encounter.id, sourceActorId: source.id, abilityId: abilityDef.id
    });
    return event;
  }

  function heal(encounter, source, target, abilityDef, effect, effectIndex) {
    if (!alive(target)) return null;
    var amount = effect.formulaId
      ? Game.rules.evaluate(effect.formulaId, {
          sourceStats: source.components.statBlock.snapshot().values,
          targetStats: target.components.statBlock.snapshot().values
        }, effect.params || {})
      : Number(effect.amount) || stat(source, 'healingPower') * (Number(effect.coefficient) || 1);
    amount = Math.max(0, Math.round(amount));
    var healResult = Game.units.heal(target, amount, { source: 'combat' });
    var effective = healResult ? healResult.delta : 0;
    encounter.metrics.healing[source.id] = (encounter.metrics.healing[source.id] || 0) + effective;
    Object.keys(encounter.threatTables).forEach(function (observerId) {
      var observer = Game.actors.get(observerId);
      if (!observer || Game.relations.resolve(observer.id, source.id, encounter.id) !== 'hostile') return;
      encounter.threatTables[observerId][source.id] =
        (encounter.threatTables[observerId][source.id] || 0) +
        effective * (effect.threatScale === undefined ? 0.5 : effect.threatScale);
    });
    var event = emit(encounter, 'combat:healed', {
      phase: 'commit', sourceActorId: source.id, targetActorIds: [target.id],
      abilityId: abilityDef.id, effectIndex: effectIndex,
      payload: { requested: amount, amount: effective }
    });
    triggerReactions(encounter, event);
    return event;
  }

  function shield(encounter, source, target, abilityDef, effect, effectIndex) {
    if (!alive(target)) return null;
    var amount = Math.max(1, Math.round((Number(effect.amount) || stat(source, 'shieldPower')) *
      (Number(effect.coefficient) || 1)));
    var id = encounter.id + ':shield:' + encounter.nextSequence;
    target.components.vitals.shields.push({
      id: id, sourceActorId: source.id, abilityId: abilityDef.id,
      amount: amount, priority: Number(effect.priority) || 0,
      expiresTick: effect.durationTicks ? encounter.tick + effect.durationTicks : 0,
      damageTypes: effect.damageTypes || null
    });
    return emit(encounter, 'combat:shielded', {
      sourceActorId: source.id, targetActorIds: [target.id], abilityId: abilityDef.id,
      effectIndex: effectIndex, payload: { id: id, amount: amount }
    });
  }

  function statusIdentity(encounter, source, target, def, abilityDef) {
    var mode = def.uniqueBy || 'global';
    if (mode === 'source') return def.id + '|' + source.id;
    if (mode === 'ability') return def.id + '|' + source.id + '|' + abilityDef.id;
    return def.id;
  }

  function applyStatus(encounter, source, target, abilityDef, effect, effectIndex) {
    var def = Game.content.get('status', effect.statusId);
    if (!def || !target.components.statuses) return null;
    var potency = stat(source, 'statusPotency') || 1;
    var tenacity = stat(target, 'tenacity') || 0;
    var duration = Math.max(1, Math.round((effect.durationTicks || def.durationTicks) *
      Math.max(0.2, potency / Math.max(0.1, 1 + tenacity))));
    var key = statusIdentity(encounter, source, target, def, abilityDef);
    var found = target.components.statuses.filter(function (status) { return status.key === key; })[0];
    if (found && def.stacking === 'refresh') {
      found.expiresTick = encounter.tick + duration;
      found.stacks = Math.min(def.maxStacks || 1, found.stacks + (effect.stacks || 1));
    } else if (found && def.stacking === 'stack') {
      found.stacks = Math.min(def.maxStacks || 1, found.stacks + (effect.stacks || 1));
      found.expiresTick = encounter.tick + duration;
    } else {
      var id = encounter.id + ':status:' + encounter.nextSequence;
      found = {
        id: id, key: key, statusId: def.id, sourceActorId: source.id,
        sourceAbilityId: abilityDef.id, appliedTick: encounter.tick,
        expiresTick: encounter.tick + duration,
        nextPeriodicTick: def.periodicIntervalTicks ? encounter.tick + def.periodicIntervalTicks : 0,
        stacks: effect.stacks || 1,
        potencySnapshot: potency,
        shieldState: null
      };
      target.components.statuses.push(found);
    }
    target.components.modifierLedger.removeSource(found.id);
    (def.modifiers || []).forEach(function (modifier) {
      target.components.modifierLedger.add(Object.assign({}, modifier, {
        sourceId: found.id,
        value: Number(modifier.value) * found.stacks
      }));
    });
    if ((def.modifiers || []).some(function (modifier) { return modifier.stat === 'maxHp'; })) {
      Game.units.reconcile(target, { hpPolicy: 'preserveRatio' });
    }
    var event = emit(encounter, 'status:applied', {
      sourceActorId: source.id, targetActorIds: [target.id], abilityId: abilityDef.id,
      effectIndex: effectIndex, payload: { statusId: def.id, stacks: found.stacks, durationTicks: duration }
    });
    triggerReactions(encounter, event);
    return event;
  }

  function removeStatus(encounter, target, predicate, reason) {
    var removed = [];
    for (var i = target.components.statuses.length - 1; i >= 0; i--) {
      var status = target.components.statuses[i];
      var def = Game.content.get('status', status.statusId);
      if (!predicate(status, def)) continue;
      target.components.statuses.splice(i, 1);
      target.components.modifierLedger.removeSource(status.id);
      if (def && (def.modifiers || []).some(function (modifier) { return modifier.stat === 'maxHp'; })) {
        Game.units.reconcile(target, { hpPolicy: 'preserveRatio' });
      }
      removed.push(status);
      emit(encounter, 'status:removed', {
        targetActorIds: [target.id], payload: { statusId: status.statusId, reason: reason }
      });
    }
    return removed;
  }

  function modifyResource(encounter, target, effect) {
    var resource = target.components.resources[effect.resourceId];
    if (!resource) return;
    var amount = Number(effect.amount) || 0;
    resource.value = Game.util.clamp(resource.value + amount, resource.min, resource.max);
    emit(encounter, 'resource:changed', {
      targetActorIds: [target.id],
      payload: { resourceId: resource.id, amount: amount, value: resource.value }
    });
  }

  function applyEffect(encounter, source, primaryTarget, abilityDef, effect, effectIndex, context) {
    if (!effect || encounter.effectBudget-- <= 0) return;
    var targets = targetList(encounter, source, primaryTarget, effect.target || abilityDef.target, context);
    if (!targets.length && (effect.target && effect.target.relation === 'self')) targets = [source];
    if (effect.type === 'damage') targets.forEach(function (target) { damage(encounter, source, target, abilityDef, effect, effectIndex); });
    else if (effect.type === 'heal') targets.forEach(function (target) { heal(encounter, source, target, abilityDef, effect, effectIndex); });
    else if (effect.type === 'shield') targets.forEach(function (target) { shield(encounter, source, target, abilityDef, effect, effectIndex); });
    else if (effect.type === 'applyStatus') targets.forEach(function (target) { applyStatus(encounter, source, target, abilityDef, effect, effectIndex); });
    else if (effect.type === 'removeStatus') targets.forEach(function (target) {
      removeStatus(encounter, target, function (status) { return !effect.statusId || status.statusId === effect.statusId; }, 'effect');
    });
    else if (effect.type === 'dispel') targets.forEach(function (target) {
      removeStatus(encounter, target, function (status, def) {
        return !effect.category || def.dispelCategory === effect.category;
      }, 'dispel');
    });
    else if (effect.type === 'modifyResource') targets.forEach(function (target) { modifyResource(encounter, target, effect); });
    else if (effect.type === 'setCombo') targets.forEach(function (target) {
      var combo = target.components.comboState;
      if (!combo) return;
      if (effect.mode === 'consume') combo.step = 0;
      else combo.step = Game.util.clamp((combo.step || 0) + (effect.step || 1), 0, effect.max || 3);
      combo.id = effect.comboId || combo.id;
      combo.expiresTick = encounter.tick + (effect.durationTicks || 120);
    });
    else if (effect.type === 'markTarget') {
      source.components.comboState.markedTargetId = primaryTarget && primaryTarget.id || null;
      source.components.targeting.priorityTargetId = primaryTarget && primaryTarget.id || null;
    }
    else if (effect.type === 'interrupt') targets.forEach(function (target) {
      Game.combat.interrupt(source.id, target.id, effect.power || stat(source, 'interruptPower'));
    });
    else if (effect.type === 'modifyCooldown') targets.forEach(function (target) {
      var current = target.components.cooldowns.abilities[effect.abilityId] || 0;
      target.components.cooldowns.abilities[effect.abilityId] = Math.max(encounter.tick, current + (effect.ticks || 0));
    });
    else if (effect.type === 'modifyThreat') targets.forEach(function (target) {
      var table = encounter.threatTables[target.id] || (encounter.threatTables[target.id] = {});
      table[source.id] = Math.max(0, (table[source.id] || 0) + (effect.amount || 0));
      if (effect.taunt) {
        var max = 0;
        Object.keys(table).forEach(function (id) { max = Math.max(max, table[id]); });
        table[source.id] = max + Math.max(1, effect.amount || 1);
      }
    });
    else if (effect.type === 'movement' || effect.type === 'knockback' || effect.type === 'pull') {
      if (effect.type === 'movement') {
        var moveTarget = primaryTarget && primaryTarget.id !== source.id
          ? primaryTarget
          : encounter.participants.map(Game.actors.get).filter(function (actor) {
              return alive(actor) &&
                Game.relations.resolve(source.id, actor.id, encounter.id) === 'hostile';
            }).sort(function (a, b) {
              return distance(source, a) - distance(source, b) || a.id.localeCompare(b.id);
            })[0];
        var moveDx, moveDy, maxMove = Math.max(0, Number(effect.distance) || 0);
        if (moveTarget && primaryTarget && primaryTarget.id !== source.id) {
          moveDx = moveTarget.x - source.x;
          moveDy = moveTarget.y - source.y;
          maxMove = Math.min(maxMove, Math.max(0, distance(source, moveTarget) -
            collisionRadius(source) - collisionRadius(moveTarget) - 2));
        } else if (moveTarget) {
          moveDx = source.x - moveTarget.x;
          moveDy = source.y - moveTarget.y;
        } else {
          var directions = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] };
          var facing = directions[source.dir] || [1, 0];
          moveDx = facing[0];
          moveDy = facing[1];
        }
        var moveLength = Math.sqrt(moveDx * moveDx + moveDy * moveDy) || 1;
        source.x += moveDx / moveLength * maxMove;
        source.y += moveDy / moveLength * maxMove;
      } else {
        targets.forEach(function (target) {
          var forcedDx = effect.type === 'pull' ? source.x - target.x : target.x - source.x;
          var forcedDy = effect.type === 'pull' ? source.y - target.y : target.y - source.y;
          var forcedLength = Math.sqrt(forcedDx * forcedDx + forcedDy * forcedDy);
          if (forcedLength < 0.001) {
            forcedDx = target.id.localeCompare(source.id) < 0 ? -1 : 1;
            forcedDy = 0;
            forcedLength = 1;
          }
          var forcedDistance = Math.max(0, Number(effect.distance) || 0);
          if (effect.type === 'pull') {
            forcedDistance = Math.min(forcedDistance, Math.max(0, distance(source, target) -
              collisionRadius(source) - collisionRadius(target) - 2));
          }
          target.x += forcedDx / forcedLength * forcedDistance;
          target.y += forcedDy / forcedLength * forcedDistance;
        });
      }
    } else if (effect.type === 'summon') {
      var maxActive = Math.max(1, Number(effect.maxActive) || 2);
      var activeSummons = encounter.participants.map(Game.actors.get).filter(function (actor) {
        return alive(actor) && actor.spawnSource && actor.spawnSource.kind === 'summon' &&
          actor.spawnSource.sourceId === abilityDef.id &&
          actor.spawnSource.ownerActorId === source.id;
      }).length;
      var count = Math.min(effect.count || 1, Math.max(0, maxActive - activeSummons));
      for (var si = 0; si < count; si++) {
        var sequence = encounter.nextSpawnSequence++;
        var summoned = Game.actors.spawn({
          instanceId: encounter.id + ':summon:' + sequence,
          archetypeId: effect.archetypeId,
          level: source.level, tier: source.tier,
          transform: { x: source.x + (si ? 18 : -18), y: source.y + 12, direction: source.dir },
          factionId: effect.inheritFaction !== false ? source.factionId : effect.factionId,
          controllerId: effect.inheritController !== false ? source.controllerId : effect.controllerId,
          encounterId: encounter.id,
          spawnSource: {
            kind: 'summon', sourceId: abilityDef.id,
            ownerActorId: source.id, sequence: sequence
          }
        });
        Game.encounters.join(encounter.id, summoned.id, effect.inheritTeam !== false ? source.teamId : effect.teamId);
      }
    } else if (effect.type === 'changeTeam') {
      targets.forEach(function (target) {
        var previousTeamId = target.teamId;
        target.teamId = effect.teamId || source.teamId;
        if (effect.durationTicks) Game.encounters.schedule(encounter.id, {
          dueTick: encounter.tick + effect.durationTicks, phase: 'cleanup',
          kind: 'restoreTeam', actorId: target.id, teamId: previousTeamId
        });
      });
    } else if (effect.type === 'conditional') {
      var pass = effect.condition === 'targetBelowHalf'
        ? primaryTarget && primaryTarget.hp / primaryTarget.maxHp < 0.5
        : effect.condition !== 'never';
      if (pass) applyEffects(encounter, source, primaryTarget, abilityDef, effect.then || [], context);
      else applyEffects(encounter, source, primaryTarget, abilityDef, effect.else || [], context);
    } else if (effect.type === 'sequence') {
      applyEffects(encounter, source, primaryTarget, abilityDef, effect.effects || [], context);
    } else if (effect.type === 'repeat') {
      var repeats = Math.min(effect.times || 1, encounter.rules.maxRepeat || 8);
      for (var ri = 0; ri < repeats; ri++) applyEffects(encounter, source, primaryTarget, abilityDef, effect.effects || [], context);
    } else if (effect.type === 'triggerAbility') {
      var triggered = Game.content.get('ability', effect.abilityId);
      if (triggered) applyEffects(encounter, source, primaryTarget, triggered, triggered.effects || [], context);
    }
  }

  function applyEffects(encounter, source, target, abilityDef, effects, context) {
    (effects || []).forEach(function (effect, index) {
      if (encounter.effectBudget > 0) applyEffect(encounter, source, target, abilityDef, effect, index, context);
    });
  }

  function beginRecovery(encounter, actor, abilityDef, actionToken) {
    var timing = abilityDef.timing || {};
    var lockTicks = timing.animationLockTicks === undefined
      ? (abilityDef.actionType === 'ogcd'
        ? encounter.rules.defaultOgcdLockTicks
        : encounter.rules.defaultGcdLockTicks)
      : timingTicks(actor, timing.animationLockTicks, 'castSpeed');
    actor.components.actionState.state = 'recovering';
    actor.components.actionState.recoveryUntilTick = encounter.tick + lockTicks;
    Game.encounters.schedule(encounter.id, {
      dueTick: actor.components.actionState.recoveryUntilTick,
      phase: 'cleanup', kind: 'actionReady',
      actorId: actor.id, actionToken: actionToken
    });
  }

  function resolveAction(encounter, item) {
    var actor = Game.actors.get(item.actorId);
    var target = Game.actors.get(item.targetId);
    var def = actor && Game.content.get('ability', item.abilityId);
    if (!alive(actor) || !def || actor.components.actionState.actionId !== item.actionToken) return;
    if (!target || !alive(target)) target = Game.combatAI.chooseTarget(encounter, actor, def.target);
    if (!target && def.target.relation !== 'self') {
      Game.combat.cancelAction(actor.id, 'invalid-target');
      return;
    }
    actor.components.actionState.state = 'resolving';
    commitResources(actor);
    commitCharge(actor);
    applyEffects(encounter, actor, target || actor, def, def.effects || [], {
      telegraph: item.telegraph || null
    });
    var event = emit(encounter, 'action:resolved', {
      phase: 'resolve', sourceActorId: actor.id,
      targetActorIds: target ? [target.id] : [actor.id],
      abilityId: def.id, payload: {}
    });
    triggerReactions(encounter, event);
    beginRecovery(encounter, actor, def, item.actionToken);
  }

  function beginChannel(encounter, item) {
    var actor = Game.actors.get(item.actorId);
    var target = Game.actors.get(item.targetId);
    var def = actor && Game.content.get('ability', item.abilityId);
    if (!alive(actor) || !def ||
        actor.components.actionState.actionId !== item.actionToken) return;
    if (!target || !alive(target)) target = Game.combatAI.chooseTarget(encounter, actor, def.target);
    if (!target && def.target.relation !== 'self') {
      Game.combat.cancelAction(actor.id, 'invalid-target');
      return;
    }
    var timing = def.timing || {};
    var channelTicks = Math.max(1, timingTicks(actor, timing.channelTicks || 1, 'castSpeed'));
    var interval = Math.max(1,
      timingTicks(actor, timing.channelIntervalTicks || channelTicks, 'castSpeed'));
    var state = actor.components.actionState;
    state.state = 'channeling';
    state.channelStartedTick = encounter.tick;
    state.resolvesTick = encounter.tick + channelTicks;
    commitResources(actor);
    commitCharge(actor);
    emit(encounter, 'action:channelStarted', {
      phase: 'resolve', sourceActorId: actor.id,
      targetActorIds: target ? [target.id] : [actor.id],
      abilityId: def.id,
      payload: { channelTicks: channelTicks, intervalTicks: interval }
    });
    var pulse = interval;
    while (pulse < channelTicks) {
      Game.encounters.schedule(encounter.id, {
        dueTick: encounter.tick + pulse, phase: 'resolve', kind: 'channelPulse',
        actorId: actor.id, targetId: target && target.id,
        abilityId: def.id, actionToken: item.actionToken,
        telegraph: item.telegraph || null, finalPulse: false
      });
      pulse += interval;
    }
    Game.encounters.schedule(encounter.id, {
      dueTick: encounter.tick + channelTicks, phase: 'resolve', kind: 'channelPulse',
      actorId: actor.id, targetId: target && target.id,
      abilityId: def.id, actionToken: item.actionToken,
      telegraph: item.telegraph || null, finalPulse: true
    });
  }

  function resolveChannelPulse(encounter, item) {
    var actor = Game.actors.get(item.actorId);
    var target = Game.actors.get(item.targetId);
    var def = actor && Game.content.get('ability', item.abilityId);
    if (!alive(actor) || !def || actor.components.actionState.state !== 'channeling' ||
        actor.components.actionState.actionId !== item.actionToken) return;
    if (!target || !alive(target)) target = Game.combatAI.chooseTarget(encounter, actor, def.target);
    if (!target && def.target.relation !== 'self') {
      Game.combat.cancelAction(actor.id, 'invalid-target');
      return;
    }
    applyEffects(encounter, actor, target || actor, def, def.effects || [], {
      telegraph: item.telegraph || null, channel: true
    });
    var event = emit(encounter, item.finalPulse ? 'action:resolved' : 'action:channelTick', {
      phase: 'resolve', sourceActorId: actor.id,
      targetActorIds: target ? [target.id] : [actor.id],
      abilityId: def.id, payload: { finalPulse: !!item.finalPulse }
    });
    triggerReactions(encounter, event);
    if (item.finalPulse) beginRecovery(encounter, actor, def, item.actionToken);
  }

  function periodicStatuses(encounter, actor) {
    (actor.components.statuses || []).slice().sort(function (a, b) {
      return a.nextPeriodicTick - b.nextPeriodicTick || a.id.localeCompare(b.id);
    }).forEach(function (status) {
      var def = Game.content.get('status', status.statusId);
      if (!def || !status.nextPeriodicTick || status.nextPeriodicTick > encounter.tick) return;
      var source = Game.actors.get(status.sourceActorId) || actor;
      applyEffects(encounter, source, actor, {
        id: status.sourceAbilityId || status.statusId,
        target: { relation: source.id === actor.id ? 'self' : Game.relations.resolve(source.id, actor.id, encounter.id), shape: 'single' },
        tags: ['periodic']
      }, def.periodic || [], { periodic: true });
      status.nextPeriodicTick += def.periodicIntervalTicks;
    });
  }

  function expireStatuses(encounter, actor) {
    removeStatus(encounter, actor, function (status) {
      return status.expiresTick > 0 && status.expiresTick <= encounter.tick;
    }, 'expired');
    var shields = actor.components.vitals && actor.components.vitals.shields || [];
    for (var i = shields.length - 1; i >= 0; i--) {
      if (shields[i].expiresTick > 0 && shields[i].expiresTick <= encounter.tick) shields.splice(i, 1);
    }
  }

  function resourceTick(encounter, actor) {
    Object.keys(actor.components.resources || {}).forEach(function (id) {
      var resource = actor.components.resources[id];
      if (resource.regenPerTick) {
        resource.value = Game.util.clamp(resource.value + resource.regenPerTick, resource.min, resource.max);
      }
    });
    (actor.abilities || []).forEach(function (id) {
      var def = Game.content.get('ability', id);
      if (def && def.kind === 'action') refreshCharges(encounter, actor, def);
    });
  }

  function collisionRadius(actor) {
    return Math.max(0, Number(actor && actor.components && actor.components.body &&
      actor.components.body.collisionRadius) || 0);
  }

  function movementTick(encounter, actor) {
    var intent = actor.components.movement && actor.components.movement.intent;
    if (!intent || !Number.isFinite(intent.x) || !Number.isFinite(intent.y)) return;
    var target = intent.targetId ? Game.actors.get(intent.targetId) : null;
    if (target && alive(target) &&
        Game.relations.resolve(actor.id, target.id, encounter.id) === 'hostile') {
      // Range-following intents track the actor, but stop at an engagement ring.
      // A centre-point destination made opposing sprites converge on the same feet.
      intent.x = target.x;
      intent.y = target.y;
    } else if (intent.targetId) {
      actor.components.movement.intent = null;
      actor.components.movement.moving = false;
      return;
    }
    var dx = intent.x - actor.x;
    var dy = intent.y - actor.y;
    var distanceLeft = Math.sqrt(dx * dx + dy * dy);
    var minimumSeparation = target
      ? collisionRadius(actor) + collisionRadius(target) + 2
      : 0;
    var stopDistance = intent.reason === 'range'
      ? Math.max(minimumSeparation, Number(intent.stopRange) ||
        stat(actor, 'range') || minimumSeparation)
      : 2;

    // Recover old saves or forced movement that already placed both feet together.
    // Actor IDs provide a deterministic direction when the centres are identical.
    if (target && distanceLeft < minimumSeparation) {
      var awayX = actor.x - target.x;
      var awayY = actor.y - target.y;
      var awayLength = Math.sqrt(awayX * awayX + awayY * awayY);
      if (awayLength < 0.001) {
        awayX = actor.id.localeCompare(target.id) < 0 ? -1 : 1;
        awayY = 0;
        awayLength = 1;
      }
      var correction = minimumSeparation - distanceLeft;
      actor.x += awayX / awayLength * correction;
      actor.y += awayY / awayLength * correction;
      dx = target.x - actor.x;
      dy = target.y - actor.y;
      distanceLeft = Math.sqrt(dx * dx + dy * dy);
    }

    if (distanceLeft <= stopDistance) {
      actor.components.movement.intent = null;
      actor.components.movement.moving = false;
      return;
    }
    var step = Math.min(distanceLeft - stopDistance,
      Math.max(0, stat(actor, 'moveSpeed')) * encounter.rules.tickMs / 1000);
    actor.x += dx / distanceLeft * step;
    actor.y += dy / distanceLeft * step;
    actor.dir = Game.util.dirOf(dx, dy);
    actor.components.movement.moving = true;
  }

  function separateCombatants(actors) {
    // Movement intents solve range against one target. A crowded pack still
    // needs a deterministic physical pass so two allies cannot select the
    // same point on that target's engagement ring and render on top of each
    // other. Equal pair displacement keeps the encounter centre stable.
    var maxPasses = 12;
    for (var pass = 0; pass < maxPasses; pass++) {
      var corrected = false;
      for (var ai = 0; ai < actors.length; ai++) {
        var left = actors[ai];
        for (var bi = ai + 1; bi < actors.length; bi++) {
          var right = actors[bi];
          var minimum = collisionRadius(left) + collisionRadius(right) + 2;
          if (minimum <= 0) continue;
          var dx = right.x - left.x;
          var dy = right.y - left.y;
          var current = Math.sqrt(dx * dx + dy * dy);
          if (current + 0.01 >= minimum) continue;
          var directionLength = current;
          if (current < 0.001) {
            var seed = Game.util.strSeed(left.id + '|' + right.id);
            var angle = seed / 4294967296 * Math.PI * 2;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            directionLength = 1;
          }
          var correction = (minimum - current) * 0.5;
          var nx = dx / directionLength;
          var ny = dy / directionLength;
          left.x -= nx * correction;
          left.y -= ny * correction;
          right.x += nx * correction;
          right.y += ny * correction;
          corrected = true;
        }
      }
      if (!corrected) break;
    }
  }

  function phaseRules(encounter) {
    (encounter.profile.phaseRules || []).forEach(function (rule) {
      if (encounter.phaseTriggered[rule.id]) return;
      var actor = rule.actorId ? Game.actors.get(rule.actorId) :
        encounter.participants.map(Game.actors.get).filter(function (a) { return a && a.rank === 'boss'; })[0];
      if (!actor || !alive(actor)) return;
      if (rule.hpPct !== undefined && actor.hp / actor.maxHp > rule.hpPct) return;
      encounter.phaseTriggered[rule.id] = encounter.tick;
      if (rule.statusId) applyStatus(encounter, actor, actor, { id: 'encounter-phase', target: { relation: 'self', shape: 'single' } },
        { statusId: rule.statusId, durationTicks: rule.durationTicks || 999999 }, 0);
      if (rule.abilityId) {
        var phaseAbility = Game.content.get('ability', rule.abilityId);
        if (phaseAbility) applyEffects(encounter, actor, actor, phaseAbility, phaseAbility.effects, {});
      }
      emit(encounter, 'boss:phase', {
        sourceActorId: actor.id,
        payload: { phaseId: rule.id, hpPct: actor.hp / actor.maxHp }
      });
    });
  }

  function processCleanup(encounter, item) {
    if (item.kind === 'actionReady') {
      var actor = Game.actors.get(item.actorId);
      if (actor && actor.components.actionState.actionId === item.actionToken &&
          actor.components.actionState.state !== 'defeated') {
        actor.components.actionState.state = 'idle';
        actor.components.actionState.actionId = null;
        actor.components.actionState.abilityId = null;
        actor.components.actionState.channelStartedTick = 0;
        actor.components.actionState.reservedCharge = null;
        var queued = actor.components.actionState.queued;
        actor.components.actionState.queued = null;
        if (queued) Game.combat.requestAction(queued);
      }
    } else if (item.kind === 'restoreTeam') {
      var teamActor = Game.actors.get(item.actorId);
      if (teamActor) teamActor.teamId = item.teamId;
    }
  }

  function telegraphResolve(encounter, item) {
    var at = encounter.telegraphs.findIndex(function (x) { return x.id === item.telegraphId; });
    if (at >= 0) item.telegraph = encounter.telegraphs.splice(at, 1)[0];
    if (item.channel) beginChannel(encounter, item);
    else resolveAction(encounter, item);
  }

  function fixedTick(encounter) {
    if (!encounter || encounter.lifecycle !== 'active') return;
    encounter.tick++;
    encounter.reactionBudget = encounter.rules.reactionBudgetPerTick || 128;
    encounter.effectBudget = encounter.rules.effectBudgetPerTick || 512;
    encounter.reactionCountsTick = {};
    reactionDepth = 0;
    var actors = encounter.participants.slice().sort().map(Game.actors.get).filter(alive);
    actors.forEach(function (actor) { expireStatuses(encounter, actor); });
    actors.forEach(function (actor) { periodicStatuses(encounter, actor); });
    actors.forEach(function (actor) { movementTick(encounter, actor); });
    separateCombatants(actors);
    if (encounter.context.leashActorId && encounter.context.leashAnchor &&
        encounter.context.leashRadius > 0) {
      var leashActor = Game.actors.get(encounter.context.leashActorId);
      if (!alive(leashActor) || Game.util.dist(
          leashActor.x, leashActor.y,
          encounter.context.leashAnchor.x, encounter.context.leashAnchor.y
        ) > encounter.context.leashRadius) {
        Game.encounters.end(encounter.id, 'leash', {
          winnerTeamId: null,
          leashActorId: encounter.context.leashActorId
        });
        return;
      }
    }
    actors.forEach(function (actor) { resourceTick(encounter, actor); });
    Game.encounters.due(encounter.id, 'resolve').forEach(function (item) {
      if (item.kind === 'telegraphResolve') telegraphResolve(encounter, item);
      else if (item.kind === 'channelStart') beginChannel(encounter, item);
      else if (item.kind === 'channelPulse') resolveChannelPulse(encounter, item);
      else resolveAction(encounter, item);
    });
    Game.encounters.due(encounter.id, 'cleanup').forEach(function (item) { processCleanup(encounter, item); });
    phaseRules(encounter);
    if (encounter.tick % (encounter.rules.aiIntervalTicks || 2) === 0) {
      actors.forEach(function (actor) {
        if (!alive(actor) || actor.components.actionState.state === 'casting' ||
            actor.components.actionState.state === 'channeling') return;
        var intent = Game.combatAI.decide(encounter.id, actor.id);
        actor.components.movement.intent = intent && intent.type === 'move' ? intent : null;
        if (intent && intent.type === 'action') Game.combat.requestAction(intent);
      });
    }
    Game.encounters.checkEnd(encounter.id);
  }

  var C = Game.combat = {
    requestAction: function (command) {
      command = command || {};
      var actor = Game.actors.get(command.actorId);
      var encounter = encounterOf(actor);
      if (!encounter || encounter.lifecycle !== 'active' || !alive(actor)) return { ok: false, reason: 'encounter' };
      var def = ability(actor, command.abilityId);
      if (!def || def.kind !== 'action') return { ok: false, reason: 'ability' };
      var target = Game.actors.get(command.targetId);
      if (def.target.relation === 'self') target = actor;
      if (!target || !alive(target)) return { ok: false, reason: 'target' };
      var relation = Game.relations.resolve(actor.id, target.id, encounter.id);
      if (def.target.relation !== 'self' && relation !== def.target.relation) return { ok: false, reason: 'relation' };
      var state = actor.components.actionState;
      var timing = def.timing || {};
      var readiness = cooldownInfo(encounter, actor, def);
      var readyAt = readiness.readyAt;
      if (readyAt > encounter.tick) {
        if (timing.queueable !== false && def.actionType === 'gcd' &&
            readyAt - encounter.tick <= encounter.rules.queueWindowTicks) {
          state.queued = Object.assign({}, command);
          state.state = state.state === 'idle' ? 'queued' : state.state;
          return { ok: true, queued: true };
        }
        return { ok: false, reason: 'cooldown' };
      }
      if (state.state !== 'idle' && state.state !== 'queued') {
        if (timing.queueable !== false && def.actionType === 'gcd') {
          state.queued = Object.assign({}, command);
          return { ok: true, queued: true };
        }
        return { ok: false, reason: 'busy' };
      }
      if (!resourceCanPay(actor, def)) return { ok: false, reason: 'resource' };
      if (def.target.relation !== 'self' &&
          distance(actor, target) > (def.target.range || stat(actor, 'range') || 24)) {
        actor.components.movement.intent = {
          type: 'move', reason: 'range', targetId: target.id,
          x: target.x, y: target.y,
          stopRange: def.target.range || stat(actor, 'range') || 24
        };
        return { ok: false, reason: 'range' };
      }
      reserve(actor, def);
      if (!reserveCharge(encounter, actor, def)) {
        refund(actor, def);
        return { ok: false, reason: 'cooldown' };
      }
      var token = encounter.id + ':action:' + encounter.nextSequence;
      var castTicks = timingTicks(actor, timing.castTicks || 0, 'castSpeed');
      var channelTicks = timingTicks(actor, timing.channelTicks || 0, 'castSpeed');
      state.state = castTicks > 0 ? 'casting' : (channelTicks > 0 ? 'channeling' : 'resolving');
      state.actionId = token;
      state.abilityId = def.id;
      state.targetIds = [target.id];
      state.startedTick = encounter.tick;
      state.channelStartedTick = 0;
      state.resolvesTick = encounter.tick + castTicks + channelTicks;
      actor.components.movement.intent = null;
      var cooldown = timingTicks(actor, timing.cooldownTicks || 0, 'cooldownRate');
      if (!readiness.charge) {
        actor.components.cooldowns.abilities[def.id] = encounter.tick + cooldown;
      }
      if (timing.sharedCooldownGroup) actor.components.cooldowns.groups[timing.sharedCooldownGroup] = encounter.tick + cooldown;
      if (def.actionType === 'gcd') actor.components.cooldowns.groups.gcd = encounter.tick + gcdTicks(actor, encounter);
      encounter.metrics.actions[actor.id] = (encounter.metrics.actions[actor.id] || 0) + 1;
      emit(encounter, 'action:started', {
        sourceActorId: actor.id, targetActorIds: [target.id], abilityId: def.id,
        payload: {
          castTicks: castTicks, channelTicks: channelTicks,
          actionType: def.actionType,
          chargesRemaining: readiness.charge ? readiness.charge.current : null
        }
      });
      if (def.telegraph) {
        var telegraph = {
          id: encounter.id + ':telegraph:' + encounter.nextSequence,
          sourceActorId: actor.id, abilityId: def.id, targetIds: [target.id],
          visibleTick: encounter.tick, resolveTick: encounter.tick + Math.max(1, castTicks),
          shape: def.telegraph.shape || def.target.shape,
          x: target.x, y: target.y, radius: def.telegraph.radius || def.target.radius || 24,
          interruptible: timing.interruptible !== false,
          expectedDamagePct: def.telegraph.expectedDamagePct || 0.12
        };
        encounter.telegraphs.push(telegraph);
        emit(encounter, 'telegraph:started', {
          sourceActorId: actor.id, targetActorIds: [target.id], abilityId: def.id,
          payload: telegraph
        });
        Game.encounters.schedule(encounter.id, {
          dueTick: telegraph.resolveTick, phase: 'resolve', kind: 'telegraphResolve',
          telegraphId: telegraph.id, actorId: actor.id, targetId: target.id,
          abilityId: def.id, actionToken: token, channel: channelTicks > 0
        });
      } else {
        Game.encounters.schedule(encounter.id, {
          dueTick: encounter.tick + castTicks, phase: 'resolve',
          kind: channelTicks > 0 ? 'channelStart' : 'actionResolve',
          actorId: actor.id, targetId: target.id, abilityId: def.id, actionToken: token
        });
      }
      return { ok: true, queued: false, actionToken: token };
    },

    cancelAction: function (actorId, reason) {
      var actor = Game.actors.get(actorId);
      var encounter = encounterOf(actor);
      if (!encounter || !actor.components.actionState.actionId) return false;
      var def = Game.content.get('ability', actor.components.actionState.abilityId);
      refund(actor, def || { timing: {} });
      refundCharge(encounter, actor, def);
      var token = actor.components.actionState.actionId;
      actor.components.actionState.state = reason === 'interrupt' ? 'interrupted' : 'idle';
      actor.components.actionState.actionId = null;
      actor.components.actionState.abilityId = null;
      actor.components.actionState.queued = null;
      actor.components.actionState.channelStartedTick = 0;
      encounter.scheduler = encounter.scheduler.filter(function (item) { return item.actionToken !== token; });
      encounter.telegraphs = encounter.telegraphs.filter(function (item) { return item.sourceActorId !== actorId; });
      emit(encounter, reason === 'interrupt' ? 'action:interrupted' : 'action:cancelled', {
        sourceActorId: actor.id, payload: { reason: reason || 'cancelled' }
      });
      actor.components.actionState.state = 'idle';
      return true;
    },

    interrupt: function (sourceActorId, targetActorId, power) {
      var source = Game.actors.get(sourceActorId);
      var target = Game.actors.get(targetActorId);
      var encounter = encounterOf(source);
      if (!encounter || !target || target.encounterId !== encounter.id ||
          (target.components.actionState.state !== 'casting' &&
           target.components.actionState.state !== 'channeling')) return false;
      var chance = Game.util.clamp((power || stat(source, 'interruptPower')) /
        Math.max(0.1, 1 + stat(target, 'tenacity')), 0.1, 1);
      return random(encounter) <= chance ? C.cancelAction(targetActorId, 'interrupt') : false;
    },

    isAbilityReady: function (encounterId, actorId, abilityId) {
      var encounter = Game.encounters.get(encounterId);
      var actor = Game.actors.get(actorId);
      var def = actor && ability(actor, abilityId);
      if (!encounter || !def) return false;
      return cooldownInfo(encounter, actor, def).readyAt <= encounter.tick;
    },
    tickFixed: function (encounterId) { fixedTick(Game.encounters.get(encounterId)); },
    advanceToTick: function (encounterId, targetTick) {
      var encounter = Game.encounters.get(encounterId);
      if (!encounter) return null;
      while (encounter.lifecycle === 'active' && encounter.tick < targetTick) fixedTick(encounter);
      return encounter.tick;
    },
    update: function (dt) {
      accumulatorMs += Math.max(0, dt) * 1000;
      var active = Game.encounters.all().filter(function (encounter) { return encounter.lifecycle === 'active' && !encounter.context.estimator; });
      if (!active.length) { accumulatorMs = Math.min(accumulatorMs, 50); return; }
      var tickMs = active[0].rules.tickMs;
      var steps = 0;
      while (accumulatorMs >= tickMs && steps < (active[0].rules.maxCatchupTicks || 20)) {
        active.forEach(fixedTick);
        accumulatorMs -= tickMs;
        steps++;
      }
    },
    queryTargets: function (context, targetSpec) {
      var encounter = Game.encounters.get(context.encounterId);
      var source = Game.actors.get(context.sourceActorId);
      var target = Game.actors.get(context.targetActorId);
      return encounter && source ? targetList(encounter, source, target, targetSpec) : [];
    },
    applyEffect: function (context, effect) {
      var encounter = Game.encounters.get(context.encounterId);
      var source = Game.actors.get(context.sourceActorId);
      var target = Game.actors.get(context.targetActorId);
      var def = Game.content.get('ability', context.abilityId) || {
        id: context.abilityId || 'system', target: { relation: 'self', shape: 'single' }, tags: []
      };
      if (encounter && source) return applyEffect(encounter, source, target || source, def, effect, context.effectIndex || 0, context);
    },
    dealDamage: function (context) {
      return C.applyEffect(context, Object.assign({ type: 'damage' }, context.effect || {}));
    },
    heal: function (context) {
      return C.applyEffect(context, Object.assign({ type: 'heal' }, context.effect || {}));
    },
    applyStatus: function (context) {
      return C.applyEffect(context, Object.assign({ type: 'applyStatus' }, context.effect || {}));
    },
    removeStatus: function (context) {
      return C.applyEffect(context, Object.assign({ type: 'removeStatus' }, context.effect || {}));
    },
    modifyResource: function (context) {
      return C.applyEffect(context, Object.assign({ type: 'modifyResource' }, context.effect || {}));
    },
    modifyThreat: function (context) {
      return C.applyEffect(context, Object.assign({ type: 'modifyThreat' }, context.effect || {}));
    },
    defeat: function (actorId, context) {
      context = context || {};
      var actor = Game.actors.get(actorId);
      var encounter = Game.encounters.get(context.encounterId || actor && actor.encounterId);
      if (!actor || !encounter || actor.components.actionState.state === 'defeated') return false;
      Game.units.setHp(actor, 0, { source: 'defeat' });
      actor.components.actionState.state = 'defeated';
      actor.components.actionState.abilityId = null;
      actor.components.movement.intent = null;
      actor.dead = true;
      actor.deathT = 0.5;
      encounter.metrics.defeated.push(actor.id);
      emit(encounter, 'actor:defeated', {
        sourceActorId: context.sourceActorId || null,
        targetActorIds: [actor.id], abilityId: context.abilityId || null,
        payload: { category: actor.category, rank: actor.rank }
      });
      triggerReactions(encounter, encounter.eventLog[encounter.eventLog.length - 1]);
      return true;
    },
    potionTick: function () {
      if (!Game.items || Game.items.cdLeft('potion') > 0) return;
      if (Game.player.hpPct() >= Game.state.settings.potionThreshold) return;
      Game.inv.consumePotion({ source: 'auto' });
    },
    inspect: function (encounterId) { return Game.encounters.snapshot(encounterId); },
    resetClock: function () { accumulatorMs = 0; }
  };
})();
