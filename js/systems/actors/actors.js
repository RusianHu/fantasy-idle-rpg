/* Unified runtime ActorInstance factory and component capability boundary. */
(function () {
  'use strict';
  var Game = window.Game;
  var instances = {};
  var order = [];
  var worldSequence = 1;

  function clone(value) { return Game.contentCompiler.clone(value); }

  function uniqueId(spec) {
    if (spec.instanceId) return spec.instanceId;
    if (spec.encounterId) {
      var seq = spec.spawnSource && spec.spawnSource.sequence;
      if (!Number.isInteger(seq)) throw new Error('[Actors] encounter spawn sequence required');
      return spec.encounterId + ':actor:' + seq;
    }
    return 'world:actor:' + worldSequence++;
  }

  function statProfile(blueprint) {
    return Game.content.get('statProfile', blueprint.resolvedProfiles.statProfileId) ||
      { stats: {} };
  }

  function presentationFor(archetype, blueprint) {
    var classDef = blueprint.classId && Game.content.get('class', blueprint.classId);
    var base = archetype.presentation || {};
    var overlay = classDef && classDef.presentation || {};
    return {
      spriteId: overlay.spriteId || base.spriteId,
      portraitId: overlay.portraitId || base.portraitId || null,
      scale: overlay.scale || base.scale || 1
    };
  }

  function baseStats(blueprint, spec, record) {
    if (record && Game.player && record.id === 'player-main') {
      var derived = Game.player.previewDerived({
        classId: record.classId,
        level: record.level,
        skills: record.talentRanks,
        equipped: record.loadout.equipment
      });
      return {
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
        threatMultiplier: blueprint.classId === 'fighter' ? 2.2 : 1,
        resourceRegen: 1,
        expMultiplier: derived.expMul,
        goldMultiplier: derived.goldMul,
        dropMultiplier: derived.dropMul
      };
    }
    var profile = statProfile(blueprint);
    var level = Math.max(1, spec.level || record && record.level || 1);
    var tier = Math.max(1, spec.tier || 1);
    var out = {};
    Object.keys(profile.stats || {}).forEach(function (id) {
      var value = profile.stats[id];
      if (typeof value === 'number') out[id] = value;
      else {
        var base = Number(value.base) || 0;
        var perLevel = Number(value.perLevel) || 0;
        var tierScale = Number(value.tierScale) || 1;
        out[id] = (base + perLevel * (level - 1)) * Math.pow(tierScale, tier - 1);
      }
    });
    Object.keys(spec.statValues || {}).forEach(function (id) {
      if (Number.isFinite(spec.statValues[id])) out[id] = spec.statValues[id];
    });
    return out;
  }

  function modifierLedger(base) {
    var entries = [];
    var dirty = true;
    var cache = clone(base);
    function recompute() {
      var out = clone(base);
      var phases = ['equipmentFlat', 'otherFlat', 'addPct', 'multiply', 'status'];
      phases.forEach(function (phase) {
        entries.filter(function (entry) { return entry.phase === phase; }).sort(function (a, b) {
          return (a.sourceId || '').localeCompare(b.sourceId || '') || a.stat.localeCompare(b.stat);
        }).forEach(function (entry) {
          var current = Number(out[entry.stat]) || 0;
          if (entry.operation === 'add') out[entry.stat] = current + entry.value;
          else if (entry.operation === 'multiply') out[entry.stat] = current * entry.value;
          else if (entry.operation === 'addPct') out[entry.stat] = current * (1 + entry.value);
          else if (entry.operation === 'set') out[entry.stat] = entry.value;
        });
      });
      Object.keys(out).forEach(function (id) {
        var def = Game.content.get('stat', id);
        if (def) out[id] = Game.util.clamp(out[id], def.min, def.max);
      });
      cache = out;
      dirty = false;
    }
    return {
      setBase: function (next) {
        base = clone(next || {});
        dirty = true;
      },
      add: function (entry) {
        if (!entry || !entry.sourceId || !entry.stat) throw new Error('[Modifiers] invalid entry');
        entries.push(Object.assign({ phase: 'otherFlat', operation: 'add', value: 0 }, entry));
        dirty = true;
      },
      removeSource: function (sourceId) {
        var before = entries.length;
        entries = entries.filter(function (entry) { return entry.sourceId !== sourceId; });
        dirty = dirty || before !== entries.length;
      },
      value: function (id) { if (dirty) recompute(); return Number(cache[id]) || 0; },
      snapshot: function () {
        if (dirty) recompute();
        return { values: clone(cache), entries: clone(entries) };
      },
      markDirty: function () { dirty = true; }
    };
  }

  function resourceComponents(blueprint) {
    var out = {};
    (blueprint.resolvedProfiles.resourceProfileIds || []).forEach(function (profileId) {
      var profile = Game.content.get('resourceProfile', profileId);
      (profile && profile.resourceIds || []).forEach(function (id) {
        var def = Game.content.get('resource', id);
        if (def) out[id] = {
          id: id, value: def.initial, reserved: 0, min: def.min, max: def.max,
          regenPerTick: Number(def.regenPerTick) || 0, reset: def.reset || {}
        };
      });
    });
    return out;
  }

  function defineCompatibility(instance) {
    var c = instance.components;
    Object.defineProperties(instance, {
      x: { enumerable: true, get: function () { return c.transform.x; }, set: function (v) { c.transform.x = v; } },
      y: { enumerable: true, get: function () { return c.transform.y; }, set: function (v) { c.transform.y = v; } },
      dir: { enumerable: true, get: function () { return c.transform.direction; }, set: function (v) { c.transform.direction = v; } },
      hp: {
        enumerable: true,
        get: function () { return c.vitals ? c.vitals.hp : undefined; },
        set: function (v) { if (c.vitals) c.vitals.hp = v; }
      },
      maxHp: {
        enumerable: true,
        get: function () { return c.vitals ? c.vitals.maxHp : undefined; },
        set: function (v) { if (c.vitals) c.vitals.maxHp = Math.max(1, Number(v) || 1); }
      },
      state: {
        enumerable: true,
        get: function () { return c.presentation.state; },
        set: function (v) { c.presentation.state = v; }
      },
      sprite: { enumerable: true, get: function () { return c.presentation.spriteId; }, set: function (v) { c.presentation.spriteId = v; } }
    });
    ['animT', 'animF', 'flash', 'lungeT'].forEach(function (key) {
      Object.defineProperty(instance, key, {
        enumerable: true,
        get: function () { return c.presentation[key]; },
        set: function (value) { c.presentation[key] = value; }
      });
    });
  }

  function applyBuildModifiers(components, blueprint, record, spec) {
    blueprint.resolvedTraits.forEach(function (traitId) {
      var trait = Game.content.get('trait', traitId);
      (trait && trait.modifiers || []).forEach(function (modifier, index) {
        components.modifierLedger.add(Object.assign({}, modifier, {
          sourceId: 'trait:' + traitId + ':' + index
        }));
      });
    });
    Object.keys(record && record.talentRanks || {}).sort().forEach(function (talentId) {
      var talent = Game.content.get('talent', talentId);
      var rank = Math.max(0, record.talentRanks[talentId] | 0);
      (talent && talent.modifiers || []).forEach(function (modifier, index) {
        components.modifierLedger.add({
          sourceId: 'talent:' + talentId + ':' + index,
          stat: modifier.stat,
          phase: modifier.phase || 'addPct',
          operation: modifier.operation || 'addPct',
          value: Number(modifier.perRank || modifier.value || 0) * rank
        });
      });
    });
    (spec.modifiers || []).forEach(function (modifier, index) {
      components.modifierLedger.add(Object.assign({}, modifier, {
        sourceId: modifier.sourceId || 'spawn:' + index
      }));
    });
  }

  var A = Game.actors = {
    spawn: function (spec) {
      spec = spec || {};
      var record = spec.actorRecordId && Game.roster.getRecord(spec.actorRecordId);
      if (spec.actorRecordId && !record) throw new Error('[Actors] missing record: ' + spec.actorRecordId);
      if (record && spec.archetypeId && record.archetypeId !== spec.archetypeId) {
        throw new Error('[Actors] record/archetype conflict');
      }
      if (record && spec.level && record.level !== spec.level) throw new Error('[Actors] record/level conflict');
      var archetypeId = record ? record.archetypeId : spec.archetypeId;
      if (!archetypeId) throw new Error('[Actors] archetypeId required');
      var blueprint = Game.content.compileBlueprint({
        archetypeId: archetypeId,
        classId: record && record.classId || spec.classId || null,
        variantId: spec.variantId || null
      });
      var id = uniqueId(spec);
      if (instances[id]) throw new Error('[Actors] duplicate instance: ' + id);
      var archetype = Game.content.get('actorArchetype', blueprint.archetypeId);
      var actorPresentation = presentationFor(archetype, blueprint);
      var stats = baseStats(blueprint, spec, record);
      var combatCapable = !!blueprint.resolvedProfiles.statProfileId &&
        (blueprint.resolvedAbilityGrants.length > 0 || archetype.category === 'player');
      var components = {
        transform: {
          x: spec.transform && Number(spec.transform.x) || 0,
          y: spec.transform && Number(spec.transform.y) || 0,
          direction: spec.transform && spec.transform.direction || 'd'
        },
        body: clone(archetype.body),
        statBlock: modifierLedger(stats),
        modifierLedger: null,
        presentation: {
          spriteId: actorPresentation.spriteId,
          portraitId: actorPresentation.portraitId,
          scale: actorPresentation.scale,
          state: 'idle',
          animT: 0, animF: 0, flash: 0, lungeT: 0
        },
        movement: {
          intent: null, path: null, moving: false,
          speed: stats.moveSpeed || 0
        }
      };
      components.modifierLedger = components.statBlock;
      applyBuildModifiers(components, blueprint, record, spec);
      if (combatCapable) {
        var maxHp = components.statBlock.value('maxHp');
        components.vitals = {
          hp: record ? Number(record.persistentResources.hp) || maxHp : maxHp,
          maxHp: maxHp,
          shields: []
        };
        components.resources = resourceComponents(blueprint);
        components.actionState = {
          state: 'idle', actionId: null, abilityId: null, targetIds: [], startedTick: 0,
          resolvesTick: 0, channelStartedTick: 0, recoveryUntilTick: 0,
          reserved: [], reservedCharge: null, queued: null
        };
        components.cooldowns = { abilities: {}, groups: {}, charges: {} };
        components.comboState = { id: null, step: 0, expiresTick: 0, markedTargetId: null };
        components.statuses = [];
        components.targeting = { currentTargetId: null, priorityTargetId: null };
      }
      var instance = {
        id: id,
        blueprintKey: blueprint.key,
        blueprint: blueprint,
        actorRecordId: record && record.id || null,
        level: record && record.level || Math.max(1, spec.level | 0 || 1),
        tier: Math.max(1, spec.tier | 0 || 1),
        partyId: spec.partyId || null,
        teamId: spec.teamId || null,
        factionId: spec.factionId || archetype.defaultFactionId,
        controllerId: spec.controllerId || 'ai:monster',
        encounterId: spec.encounterId || null,
        spawnSource: clone(spec.spawnSource || { kind: 'world', sourceId: 'unknown', sequence: worldSequence }),
        lifecycle: 'active',
        category: archetype.category,
        rank: archetype.rank,
        components: components,
        tags: blueprint.resolvedTags.slice(),
        abilities: blueprint.resolvedAbilityGrants.slice(),
        traits: blueprint.resolvedTraits.slice(),
        // Presentation compatibility only. Combat and relation code never read it.
        kind: archetype.category === 'player' ? 'hero' : (archetype.category === 'monster' || archetype.category === 'summon' ? 'monster' : 'actor'),
        mid: archetype.category === 'monster' ? archetype.id : null,
        boss: archetype.rank === 'boss',
        spriteH: 20,
        dead: false,
        deathT: 0,
        target: null,
        moveOrder: null,
        interactOrder: null,
        manualTarget: false,
        navRoute: null
      };
      instance.buffs = [];
      instance.itemCd = { potion: 0 };
      instance.potionCd = 0;
      instance.stepAcc = 0;
      instance.moving = false;
      instance.wanderT = 1;
      instance.wx = 0;
      instance.wy = 0;
      instance.engaged = false;
      instance.dots = [];
      defineCompatibility(instance);
      instances[id] = instance;
      order.push(id);
      if (spec.partyId && Game.parties.get(spec.partyId)) Game.parties.addMember(spec.partyId, id);
      return instance;
    },

    get: function (id) { return instances[id] || null; },
    refresh: function (id) {
      var actor = instances[id];
      if (!actor) return null;
      var record = actor.actorRecordId && Game.roster.getRecord(actor.actorRecordId);
      var beforeMax = actor.components.vitals && actor.components.vitals.maxHp || 0;
      var beforeHp = actor.components.vitals && actor.components.vitals.hp || 0;
      if (record && actor.blueprint.classId !== record.classId) {
        actor.blueprint = Game.content.compileBlueprint({
          archetypeId: record.archetypeId,
          classId: record.classId
        });
        actor.blueprintKey = actor.blueprint.key;
        actor.abilities = actor.blueprint.resolvedAbilityGrants.slice();
        actor.traits = actor.blueprint.resolvedTraits.slice();
      }
      var stats = baseStats(actor.blueprint, {
        level: actor.level,
        tier: actor.tier
      }, record);
      var archetype = Game.content.get('actorArchetype', actor.blueprint.archetypeId);
      var actorPresentation = presentationFor(archetype, actor.blueprint);
      actor.components.presentation.spriteId = actorPresentation.spriteId;
      actor.components.presentation.portraitId = actorPresentation.portraitId;
      actor.components.presentation.scale = actorPresentation.scale;
      actor.components.statBlock = modifierLedger(stats);
      actor.components.modifierLedger = actor.components.statBlock;
      applyBuildModifiers(actor.components, actor.blueprint, record, {});
      actor.components.movement.speed = stats.moveSpeed || 0;
      if (!actor.components.actionState && actor.blueprint.resolvedAbilityGrants.length) {
        actor.components.resources = resourceComponents(actor.blueprint);
        actor.components.actionState = {
          state: 'idle', actionId: null, abilityId: null, targetIds: [], startedTick: 0,
          resolvesTick: 0, channelStartedTick: 0, recoveryUntilTick: 0,
          reserved: [], reservedCharge: null, queued: null
        };
        actor.components.cooldowns = { abilities: {}, groups: {}, charges: {} };
        actor.components.comboState = { id: null, step: 0, expiresTick: 0, markedTargetId: null };
        actor.components.statuses = [];
        actor.components.targeting = { currentTargetId: null, priorityTargetId: null };
      } else if (actor.components.resources) {
        actor.components.resources = resourceComponents(actor.blueprint);
      }
      if (actor.components.vitals) {
        actor.components.vitals.maxHp = stats.maxHp;
        actor.components.vitals.hp = beforeMax > 0
          ? Game.util.clamp(beforeHp / beforeMax * stats.maxHp, 0, stats.maxHp)
          : stats.maxHp;
      }
      return actor;
    },
    query: function (filter) {
      filter = filter || {};
      return order.map(function (id) { return instances[id]; }).filter(function (actor) {
        if (!actor) return false;
        return Object.keys(filter).every(function (key) {
          if (key === 'hasComponent') return !!actor.components[filter[key]];
          return actor[key] === filter[key];
        });
      });
    },
    despawn: function (id, reason) {
      var actor = instances[id];
      if (!actor) return false;
      if (actor.encounterId && Game.encounters && Game.encounters.get(actor.encounterId)) {
        Game.encounters.leave(actor.encounterId, id, reason || 'despawn');
      }
      if (actor.partyId && Game.parties.get(actor.partyId)) Game.parties.removeMember(actor.partyId, id);
      actor.lifecycle = 'despawned';
      delete instances[id];
      order.splice(order.indexOf(id), 1);
      return true;
    },
    snapshot: function (id) {
      var actor = instances[id];
      if (!actor) return null;
      var out = {
        id: actor.id, blueprintKey: actor.blueprintKey, actorRecordId: actor.actorRecordId,
        level: actor.level, tier: actor.tier, partyId: actor.partyId, teamId: actor.teamId,
        factionId: actor.factionId, controllerId: actor.controllerId,
        encounterId: actor.encounterId, lifecycle: actor.lifecycle,
        category: actor.category, rank: actor.rank, tags: actor.tags.slice(),
        abilities: actor.abilities.slice(), traits: actor.traits.slice(),
        components: {
          transform: clone(actor.components.transform),
          vitals: clone(actor.components.vitals),
          resources: clone(actor.components.resources),
          actionState: clone(actor.components.actionState),
          cooldowns: clone(actor.components.cooldowns),
          comboState: clone(actor.components.comboState),
          statuses: clone(actor.components.statuses),
          statBlock: actor.components.statBlock.snapshot()
        }
      };
      return Game.contentCompiler.deepFreeze(out);
    },
    inspect: function (idOrArchetype) {
      var actor = instances[idOrArchetype];
      var archetypeId = actor ? actor.blueprint.archetypeId : idOrArchetype;
      var card = Game.content.get('actorArchetype', archetypeId);
      if (!card) return null;
      var blueprint = actor ? actor.blueprint : Game.content.compileBlueprint({ archetypeId: archetypeId });
      return {
        card: card, blueprint: blueprint,
        source: Game.content.inspect('actorArchetype', archetypeId).source,
        runtime: actor ? A.snapshot(actor.id) : null
      };
    },
    reset: function () {
      instances = {};
      order = [];
      worldSequence = 1;
    }
  };
})();
