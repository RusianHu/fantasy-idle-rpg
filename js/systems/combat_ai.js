/* Deterministic tactics/rotation AI. It returns intents and never mutates economy or UI. */
(function () {
  'use strict';
  var Game = window.Game;

  function stats(actor) { return actor.components.statBlock; }
  function hpPct(actor) {
    var vitals = actor.components.vitals;
    return vitals ? vitals.hp / Math.max(1, vitals.maxHp) : 0;
  }
  function living(encounter, relation, source) {
    return encounter.participants.map(Game.actors.get).filter(function (target) {
      var participant = target && encounter.participantStates[target.id];
      return target && (!participant || participant.role !== 'observer') &&
        target.components.vitals && target.components.vitals.hp > 0 &&
        Game.relations.resolve(source.id, target.id, encounter.id) === relation;
    }).sort(function (a, b) { return a.id.localeCompare(b.id); });
  }
  function distance(a, b) {
    return Game.util.dist(a.components.transform.x, a.components.transform.y,
      b.components.transform.x, b.components.transform.y);
  }

  function chooseTarget(encounter, actor, targetSpec) {
    targetSpec = targetSpec || { relation: 'hostile', shape: 'single' };
    var relation = targetSpec.relation || 'hostile';
    if (relation === 'self') return actor;
    var list = living(encounter, relation, actor);
    if (!list.length) return null;
    if (relation === 'ally' && targetSpec.sort === 'lowestHp') {
      return list.sort(function (a, b) { return hpPct(a) - hpPct(b) || a.id.localeCompare(b.id); })[0];
    }
    var priority = actor.components.targeting && actor.components.targeting.priorityTargetId;
    if (priority) {
      var selected = list.filter(function (target) { return target.id === priority; })[0];
      if (selected) return selected;
    }
    if (actor.controllerId === 'ai:monster') {
      var table = encounter.threatTables[actor.id] || {};
      list.sort(function (a, b) {
        return (table[b.id] || 0) - (table[a.id] || 0) ||
          distance(actor, a) - distance(actor, b) ||
          a.id.localeCompare(b.id);
      });
      return list[0];
    }
    return list.sort(function (a, b) {
      return distance(actor, a) - distance(actor, b) || a.id.localeCompare(b.id);
    })[0];
  }

  function resourceReady(actor, ability) {
    return (ability.costs || []).every(function (cost) {
      var resource = actor.components.resources && actor.components.resources[cost.resourceId];
      return resource && resource.value - resource.reserved >= cost.amount;
    });
  }

  function cooldownReady(encounter, actor, ability) {
    if (Game.combat && Game.combat.isAbilityReady) {
      return Game.combat.isAbilityReady(encounter.id, actor.id, ability.id);
    }
    var timing = ability.timing || {};
    var abilityReady = actor.components.cooldowns.abilities[ability.id] || 0;
    var groupReady = timing.sharedCooldownGroup
      ? actor.components.cooldowns.groups[timing.sharedCooldownGroup] || 0 : 0;
    var gcdReady = ability.actionType === 'gcd'
      ? actor.components.cooldowns.groups.gcd || 0 : 0;
    return Math.max(abilityReady, groupReady, gcdReady) <= encounter.tick;
  }

  function abilityUtility(encounter, actor, ability, target, tactics) {
    var hints = ability.aiHints || {};
    var score = Number(hints.priority) || 10;
    var health = hpPct(actor);
    if (hints.role === 'heal') {
      if (!target || hpPct(target) > (tactics.healThreshold || 0.5)) return -Infinity;
      score += (1 - hpPct(target)) * 200;
    }
    if (hints.role === 'defensive') {
      if (health > (tactics.defenseThreshold || 0.45)) return -Infinity;
      score += (1 - health) * 160;
    }
    if (hints.role === 'interrupt') {
      if (!target || !target.components.actionState ||
          target.components.actionState.state !== 'casting') return -Infinity;
      score += 250;
    }
    if (hints.minTargets) {
      var hostileCount = living(encounter, 'hostile', actor).filter(function (enemy) {
        return distance(actor, enemy) <= (ability.target.radius || ability.target.range || 60);
      }).length;
      if (hostileCount < hints.minTargets) return -Infinity;
      score += hostileCount * 12;
    }
    if (hints.comboStep) {
      var combo = actor.components.comboState;
      if ((combo.step || 0) + 1 !== hints.comboStep) return -Infinity;
      score += 60;
    }
    if (hints.finisher && actor.components.comboState.step < (hints.minCombo || 1)) return -Infinity;
    if (hints.resourceDump) {
      var resource = actor.components.resources[hints.resourceDump];
      if (!resource || resource.value < (hints.resourceAt || resource.max * 0.55)) return -Infinity;
      score += resource.value / Math.max(1, resource.max) * 80;
    }
    if (tactics.disabledAbilities && tactics.disabledAbilities[ability.id]) return -Infinity;
    return score;
  }

  function telegraphIntent(encounter, actor, tactics) {
    var delay = tactics.reactionDelayTicks || 8;
    var threats = encounter.telegraphs.filter(function (telegraph) {
      if (encounter.tick < telegraph.visibleTick + delay || encounter.tick >= telegraph.resolveTick) return false;
      return telegraph.targetIds.indexOf(actor.id) >= 0 || telegraph.shape !== 'single';
    });
    if (!threats.length) return null;
    threats.sort(function (a, b) {
      return b.expectedDamagePct - a.expectedDamagePct ||
        a.resolveTick - b.resolveTick || a.id.localeCompare(b.id);
    });
    var danger = threats[0];
    if (danger.expectedDamagePct < tactics.dodgeDamageThreshold) return null;
    var source = Game.actors.get(danger.sourceActorId);
    var dx = actor.x - (source ? source.x : danger.x);
    var dy = actor.y - (source ? source.y : danger.y);
    if (Math.abs(dx) + Math.abs(dy) < 0.01) dx = actor.id.localeCompare(danger.sourceActorId) < 0 ? -1 : 1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      type: 'move',
      reason: 'telegraph',
      x: actor.x + dx / len * (danger.radius + 18),
      y: actor.y + dy / len * (danger.radius + 18),
      telegraphId: danger.id
    };
  }

  Game.combatAI = {
    decide: function (encounterId, actorId) {
      var encounter = Game.encounters.get(encounterId);
      var actor = Game.actors.get(actorId);
      if (!encounter || !actor || !actor.components.actionState ||
          actor.components.actionState.state === 'defeated') return null;
      var tacticId = actor.tacticsProfileId ||
        actor.blueprint.resolvedProfiles.tacticsProfileIds[0] || 'balanced';
      var tactics = Game.content.get('tacticsProfile', tacticId) ||
        Game.content.get('tacticsProfile', 'balanced');
      var override = actor.tactics || {};
      tactics = Object.assign({}, tactics || {}, override);
      var move = telegraphIntent(encounter, actor, tactics);
      if (move) return move;

      var abilities = actor.abilities.map(function (id) { return Game.actors.ability(actor, id); })
        .filter(function (ability) { return ability && ability.kind === 'action'; });
      var candidates = [];
      abilities.forEach(function (ability) {
        var target = chooseTarget(encounter, actor, ability.target);
        if (!target && ability.target && ability.target.relation !== 'self') return;
        if (!resourceReady(actor, ability)) return;
        if (!cooldownReady(encounter, actor, ability)) return;
        var utility = abilityUtility(encounter, actor, ability, target || actor, tactics);
        if (Number.isFinite(utility)) candidates.push({ ability: ability, target: target || actor, utility: utility });
      });
      candidates.sort(function (a, b) {
        return b.utility - a.utility || a.ability.id.localeCompare(b.ability.id) ||
          a.target.id.localeCompare(b.target.id);
      });
      if (!candidates.length) {
        var hostile = chooseTarget(encounter, actor, { relation: 'hostile' });
        return hostile ? {
          type: 'move', reason: 'range', targetId: hostile.id,
          x: hostile.x, y: hostile.y,
          stopRange: stats(actor).value('range')
        } : null;
      }
      return {
        type: 'action',
        actorId: actor.id,
        abilityId: candidates[0].ability.id,
        targetId: candidates[0].target.id,
        utility: candidates[0].utility
      };
    },

    chooseTarget: chooseTarget,
    strategy: function (actorId, profileId) {
      var actor = Game.actors.get(actorId);
      if (!actor || !Game.content.has('tacticsProfile', profileId)) return false;
      actor.tacticsProfileId = profileId;
      return true;
    },
    setPriorityTarget: function (actorId, targetId) {
      var actor = Game.actors.get(actorId);
      if (!actor || !actor.components.targeting) return false;
      actor.components.targeting.priorityTargetId = targetId || null;
      return true;
    }
  };
})();
