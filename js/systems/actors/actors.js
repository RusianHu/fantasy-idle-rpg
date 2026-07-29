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
    var base = blueprint.resolvedPresentation || archetype.presentation || {};
    var overlay = classDef && classDef.presentation || {};
    return {
      spriteId: overlay.spriteId || base.spriteId,
      portraitId: overlay.portraitId || base.portraitId || null,
      scale: overlay.scale || base.scale || 1
    };
  }

  function baseStats(blueprint, spec, record) {
    if (record && record.classId && Game.player) {
      // Every classed ActorRecord uses the same base/equipment/permanent builder.
      // Talents are deliberately excluded here: the Actor ledger and ability/status
      // books below are their sole runtime owners.
      var derived = Game.player.previewDerived({
        classId: record.classId,
        level: record.level,
        skills: {},
        equipped: record.loadout.equipment,
        perms: record.permanentUpgrades
      });
      var recordStats = {
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
      Object.keys(spec.statValues || {}).forEach(function (id) {
        if (Number.isFinite(spec.statValues[id])) recordStats[id] = spec.statValues[id];
      });
      return recordStats;
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
      var phases = ['equipmentFlat', 'otherFlat', 'addPct', 'multiply', 'status', 'override'];
      phases.forEach(function (phase) {
        var phaseEntries = entries.filter(function (entry) {
          return entry.phase === phase;
        }).sort(function (a, b) {
          return (a.sourceId || '').localeCompare(b.sourceId || '') || a.stat.localeCompare(b.stat);
        });
        var additivePct = {};
        phaseEntries.forEach(function (entry) {
          if (entry.operation === 'addPct') {
            additivePct[entry.stat] = (additivePct[entry.stat] || 0) + entry.value;
            return;
          }
          var current = Number(out[entry.stat]) || 0;
          if (entry.operation === 'add') out[entry.stat] = current + entry.value;
          else if (entry.operation === 'multiply') out[entry.stat] = current * entry.value;
          else if (entry.operation === 'set') out[entry.stat] = entry.value;
        });
        Object.keys(additivePct).sort().forEach(function (statId) {
          out[statId] = (Number(out[statId]) || 0) * (1 + additivePct[statId]);
        });
      });
      Object.keys(out).forEach(function (id) {
        var def = Game.content.get('stat', id);
        if (def) out[id] = Game.util.clamp(out[id], def.min, def.max);
        if (id === 'maxHp') out[id] = Math.round(out[id]);
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
      sourceEntries: function (sourceId) {
        return clone(entries.filter(function (entry) { return entry.sourceId === sourceId; }));
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

  function talentRanks(record, spec) {
    return record && record.talentRanks || spec && spec.talentRanks || {};
  }

  function classTalents(blueprint) {
    var classDef = blueprint.classId && Game.content.get('class', blueprint.classId);
    var tree = classDef && Game.content.get('talentTree', classDef.talentTreeId);
    return (tree && tree.talentIds || []).map(function (id) {
      return Game.content.get('talent', id);
    }).filter(Boolean);
  }

  function valueAt(root, path) {
    var parts = String(path || '').split('.');
    var value = root;
    for (var i = 0; i < parts.length; i++) {
      if (value === undefined || value === null) return undefined;
      value = value[parts[i]];
    }
    return value;
  }

  function setValueAt(root, path, value) {
    var parts = String(path || '').split('.');
    var target = root;
    for (var i = 0; i < parts.length - 1; i++) target = target[parts[i]];
    target[parts[parts.length - 1]] = value;
  }

  function applyTalentPatch(book, talent, patch, rank) {
    var targetType = patch.target || 'ability';
    var targetId = patch.id || (talent.grants && talent.grants.modifyAbilityId);
    var source = targetType === 'status'
      ? Game.content.get('status', targetId)
      : Game.content.get('ability', targetId);
    if (!source) return;
    var bucket = targetType === 'status' ? book.statuses : book.abilities;
    var target = bucket[targetId] || (bucket[targetId] = clone(source));
    var current = Number(valueAt(target, patch.path));
    if (!Number.isFinite(current)) return;
    var base = Number.isFinite(patch.baseValue) ? patch.baseValue : current;
    var perRank = Number(patch.perRank) || 0;
    var next = patch.operation === 'multiply'
      ? base * Math.pow(perRank || 1, rank)
      : base + perRank * rank;
    setValueAt(target, patch.path, next);
  }

  function buildRuntimeContent(blueprint, record, spec) {
    var book = { abilities: {}, statuses: {} };
    var ranks = talentRanks(record, spec);
    classTalents(blueprint).forEach(function (talent) {
      var rank = Game.util.clamp(ranks[talent.id] | 0, 0, talent.maxRank || 0);
      (talent.grants && talent.grants.patches || []).forEach(function (patch) {
        applyTalentPatch(book, talent, patch, rank);
      });
    });
    return book;
  }

  function defineCompatibility(instance) {
    Object.defineProperties(instance, {
      x: { enumerable: true, get: function () { return instance.components.transform.x; }, set: function (v) { instance.components.transform.x = v; } },
      y: { enumerable: true, get: function () { return instance.components.transform.y; }, set: function (v) { instance.components.transform.y = v; } },
      dir: { enumerable: true, get: function () { return instance.components.transform.direction; }, set: function (v) { instance.components.transform.direction = v; } },
      hp: {
        enumerable: true,
        get: function () { return instance.components.vitals ? instance.components.vitals.hp : undefined; },
        set: function (v) {
          if (!instance.components.vitals) return;
          if (Game.units) Game.units.setHp(instance, v, { source: 'compat' });
          else instance.components.vitals.hp = v;
        }
      },
      maxHp: {
        enumerable: true,
        get: function () { return instance.components.vitals ? instance.components.vitals.maxHp : undefined; },
        set: function (v) {
          if (!instance.components.vitals) return;
          if (Game.units) Game.units.overrideMaxHp(instance, v, {
            hpPolicy: 'preserveAbsolute', source: 'compat'
          });
          else instance.components.vitals.maxHp = Math.max(1, Number(v) || 1);
        }
      },
      state: {
        enumerable: true,
        get: function () { return instance.components.presentation.state; },
        set: function (v) { instance.components.presentation.state = v; }
      },
      sprite: { enumerable: true, get: function () { return instance.components.presentation.spriteId; }, set: function (v) { instance.components.presentation.spriteId = v; } }
    });
    ['animT', 'animF', 'flash', 'lungeT'].forEach(function (key) {
      Object.defineProperty(instance, key, {
        enumerable: true,
        get: function () { return instance.components.presentation[key]; },
        set: function (value) { instance.components.presentation[key] = value; }
      });
    });
  }

  function bindRuntimeState(instance) {
    var keys = [
      'blueprintKey', 'blueprint', 'variantId', 'buildSpec', 'category', 'rank',
      'components', 'tags', 'abilities', 'traits'
    ];
    var runtimeState = {};
    keys.forEach(function (key) { runtimeState[key] = instance[key]; });
    instance.runtimeState = runtimeState;
    instance.runtimeRevision = 0;
    keys.forEach(function (key) {
      delete instance[key];
      Object.defineProperty(instance, key, {
        enumerable: true,
        configurable: false,
        get: function () { return instance.runtimeState[key]; },
        set: function (value) { instance.runtimeState[key] = value; }
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
    Object.keys(talentRanks(record, spec)).sort().forEach(function (talentId) {
      var talent = Game.content.get('talent', talentId);
      var rank = Game.util.clamp(talentRanks(record, spec)[talentId] | 0, 0,
        talent && talent.maxRank || 0);
      if (!talent || talent.classId !== blueprint.classId) return;
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

  function stackedModifier(modifier, stacks) {
    var out = Object.assign({}, modifier);
    var value = Number(modifier.value) || 0;
    if (modifier.operation === 'multiply') out.value = Math.pow(value, stacks);
    else if (modifier.operation === 'set') out.value = value;
    else out.value = value * stacks;
    return out;
  }

  function applyStatusModifiers(components) {
    (components.statuses || []).forEach(function (status) {
      var def = Game.content.get('status', status.statusId);
      var modifiers = status.modifierSnapshot || def && def.modifiers || [];
      modifiers.forEach(function (modifier) {
        components.modifierLedger.add(Object.assign(
          stackedModifier(modifier, Math.max(1, status.stacks || 1)),
          { sourceId: status.id }
        ));
      });
    });
  }

  function actorFrom(ref) {
    if (!ref) return null;
    if (typeof ref === 'string') return instances[ref] || null;
    return ref.components ? ref : null;
  }

  function primaryActor() {
    var primaryRecordId = Game.state && Game.state.roster &&
      Game.state.roster.primaryActorId || 'player-main';
    for (var i = 0; i < order.length; i++) {
      var actor = instances[order[i]];
      if (actor && actor.actorRecordId === primaryRecordId) return actor;
    }
    return null;
  }

  function commitPersistentHp(actor) {
    if (!actor || !actor.actorRecordId || !actor.components.vitals ||
        !Game.roster || !Game.state) return false;
    var record = Game.roster.getRecord(actor.actorRecordId);
    if (!record) return false;
    record.persistentResources.hp = actor.components.vitals.hp;
    return true;
  }

  function reconcileVitals(actor, opts) {
    opts = opts || {};
    if (!actor || !actor.components.vitals || !actor.components.statBlock) return null;
    var vitals = actor.components.vitals;
    var beforeMax = Math.max(1, Number(opts.beforeMax) || Number(vitals.maxHp) || 1);
    var beforeHp = Number.isFinite(opts.hp) ? opts.hp
      : (Number.isFinite(opts.beforeHp) ? opts.beforeHp : Number(vitals.hp) || 0);
    var nextMax = Math.max(1, actor.components.statBlock.value('maxHp'));
    var policy = opts.hpPolicy || 'preserveAbsolute';
    var nextHp;
    if (policy === 'full') nextHp = nextMax;
    else if (policy === 'zero') nextHp = 0;
    else if (policy === 'preserveRatio') nextHp = beforeHp / beforeMax * nextMax;
    else nextHp = beforeHp;
    vitals.maxHp = nextMax;
    vitals.hp = Game.util.clamp(nextHp, 0, nextMax);
    if (opts.commit !== false) commitPersistentHp(actor);
    return vitals;
  }

  function transitionEdge(actor, toVariantId, opts) {
    var fromVariantId = actor.variantId || null;
    var edges = [];
    Game.content.all('actorVariant').forEach(function (variant) {
      if (variant.archetypeId !== actor.blueprint.archetypeId) return;
      (variant.transitions || []).forEach(function (edge) {
        if ((edge.from || null) === fromVariantId && edge.to === toVariantId &&
            (!opts.triggerId || edge.triggerId === opts.triggerId)) edges.push(edge);
      });
    });
    if (edges.length) return edges[0];
    return opts.internal ? {
      timing: actor.encounterId ? 'cleanup' : 'outOfEncounter',
      activeAction: 'defer', persistence: 'none', triggerId: opts.triggerId || 'internal'
    } : null;
  }

  function effectsContainCombo(effects, out) {
    (effects || []).forEach(function (effect) {
      if (effect.type === 'setCombo' && effect.comboId) out[effect.comboId] = true;
      effectsContainCombo(effect.effects, out);
      effectsContainCombo(effect.then, out);
      effectsContainCombo(effect.else, out);
    });
  }

  function runtimeAbility(state, abilityId) {
    return state.components.runtimeContent &&
      state.components.runtimeContent.abilities[abilityId] || Game.content.get('ability', abilityId);
  }

  function blueprintCapabilities(state) {
    var abilityIds = {};
    var groupIds = { gcd: true };
    var comboIds = {};
    (state.abilities || []).forEach(function (abilityId) {
      abilityIds[abilityId] = true;
      var ability = runtimeAbility(state, abilityId);
      if (!ability) return;
      if (ability.timing && ability.timing.sharedCooldownGroup) {
        groupIds[ability.timing.sharedCooldownGroup] = true;
      }
      effectsContainCombo(ability.effects, comboIds);
    });
    return { abilityIds: abilityIds, groupIds: groupIds, comboIds: comboIds };
  }

  function buildVariantRuntime(actor, toVariantId, edge) {
    var record = actor.actorRecordId && Game.roster && Game.roster.getRecord(actor.actorRecordId);
    var buildSpec = clone(actor.buildSpec);
    buildSpec.variantId = toVariantId;
    var blueprint = Game.content.compileBlueprint({
      archetypeId: actor.blueprint.archetypeId,
      classId: record && record.classId || buildSpec.classId || null,
      variantId: toVariantId
    });
    var archetype = Game.content.get('actorArchetype', blueprint.archetypeId);
    var presentation = presentationFor(archetype, blueprint);
    var components = {};
    Object.keys(actor.components).forEach(function (key) {
      if (key !== 'statBlock' && key !== 'modifierLedger') components[key] = clone(actor.components[key]);
    });
    components.presentation.spriteId = presentation.spriteId;
    components.presentation.portraitId = presentation.portraitId;
    components.presentation.scale = presentation.scale;
    components.body = clone(blueprint.resolvedBody || archetype.body);
    components.statBlock = modifierLedger(baseStats(blueprint, Object.assign({}, buildSpec, {
      level: actor.level, tier: actor.tier
    }), record));
    components.modifierLedger = components.statBlock;
    components.runtimeContent = buildRuntimeContent(blueprint, record, buildSpec);
    applyBuildModifiers(components, blueprint, record, buildSpec);

    var external = actor.components.modifierLedger.snapshot().entries.filter(function (entry) {
      return !/^(trait|talent|spawn):/.test(entry.sourceId) &&
        !(actor.components.statuses || []).some(function (status) { return status.id === entry.sourceId; });
    });
    external.forEach(function (entry) { components.modifierLedger.add(entry); });
    components.statuses = (actor.components.statuses || []).filter(function (status) {
      var definition = Game.content.get('status', status.statusId || status.definitionId);
      return definition && !definition.removeOnVariantChange;
    }).map(clone);
    applyStatusModifiers(components);

    var nextResources = resourceComponents(blueprint);
    Object.keys(nextResources).forEach(function (resourceId) {
      var previous = actor.components.resources && actor.components.resources[resourceId];
      if (!previous) return;
      nextResources[resourceId].value = Game.util.clamp(previous.value,
        nextResources[resourceId].min, nextResources[resourceId].max);
      nextResources[resourceId].reserved = Game.util.clamp(previous.reserved || 0,
        0, nextResources[resourceId].value);
    });
    components.resources = nextResources;
    if (!components.actionState) {
      components.actionState = {
        state: 'idle', actionId: null, abilityId: null, targetIds: [], startedTick: 0,
        resolvesTick: 0, channelStartedTick: 0, recoveryUntilTick: 0,
        reserved: [], reservedCharge: null, queued: null
      };
      components.cooldowns = { abilities: {}, groups: {}, charges: {} };
      components.comboState = { id: null, step: 0, expiresTick: 0, markedTargetId: null };
      components.targeting = { currentTargetId: null, priorityTargetId: null };
    }

    var beforeMax = Math.max(1, actor.components.vitals && actor.components.vitals.maxHp || 1);
    var beforeHp = actor.components.vitals && actor.components.vitals.hp || 0;
    var nextMax = Math.max(1, components.statBlock.value('maxHp'));
    components.vitals = {
      hp: actor.components.vitals
        ? Game.util.clamp(beforeHp / beforeMax * nextMax, 0, nextMax)
        : nextMax,
      maxHp: nextMax,
      shields: clone(actor.components.vitals && actor.components.vitals.shields || [])
    };

    var state = {
      blueprintKey: blueprint.key, blueprint: blueprint, variantId: blueprint.variantId,
      buildSpec: buildSpec, category: archetype.category, rank: archetype.rank,
      components: components, tags: blueprint.resolvedTags.slice(),
      abilities: blueprint.resolvedAbilityGrants.slice(), traits: blueprint.resolvedTraits.slice()
    };
    var capabilities = blueprintCapabilities(state);
    var previousCooldowns = actor.components.cooldowns || { abilities: {}, groups: {}, charges: {} };
    components.cooldowns = { abilities: {}, groups: {}, charges: {} };
    Object.keys(previousCooldowns.abilities || {}).forEach(function (abilityId) {
      if (capabilities.abilityIds[abilityId]) components.cooldowns.abilities[abilityId] = previousCooldowns.abilities[abilityId];
    });
    Object.keys(previousCooldowns.groups || {}).forEach(function (groupId) {
      if (capabilities.groupIds[groupId]) components.cooldowns.groups[groupId] = previousCooldowns.groups[groupId];
    });
    Object.keys(previousCooldowns.charges || {}).forEach(function (abilityId) {
      if (!capabilities.abilityIds[abilityId]) return;
      var ability = runtimeAbility(state, abilityId);
      var maximum = ability && ability.timing && ability.timing.charges | 0;
      if (!maximum) return;
      var charge = clone(previousCooldowns.charges[abilityId]);
      charge.max = maximum;
      charge.current = Game.util.clamp(charge.current, 0, maximum);
      if (charge.current >= maximum) charge.nextChargeTick = 0;
      components.cooldowns.charges[abilityId] = charge;
    });
    if (components.comboState && components.comboState.id &&
        !capabilities.comboIds[components.comboState.id]) {
      components.comboState = { id: null, step: 0, expiresTick: 0, markedTargetId: null };
    }
    if (edge.activeAction === 'cancel' && components.actionState &&
        components.actionState.state !== 'idle' && components.actionState.state !== 'defeated') {
      (components.actionState.reserved || []).forEach(function (cost) {
        var resource = components.resources[cost.resourceId];
        if (resource) resource.reserved = Math.max(0, resource.reserved - cost.amount);
      });
      components.actionState = Object.assign({}, components.actionState, {
        state: 'idle', actionId: null, abilityId: null, targetIds: [], reserved: [],
        reservedCharge: null, queued: null
      });
    }
    var statValues = components.modifierLedger.snapshot().values;
    Object.keys(statValues).forEach(function (id) {
      if (!Number.isFinite(statValues[id])) throw new Error('non-finite stat: ' + id);
    });
    return state;
  }

  function prepareVariantTransition(actor, toVariantId, opts) {
    opts = opts || {};
    if (!actor) return { ok: false, reason: 'missing-actor' };
    var targetVariant = Game.content.get('actorVariant', toVariantId);
    if (!targetVariant || targetVariant.archetypeId !== actor.blueprint.archetypeId) {
      return { ok: false, reason: 'variant-archetype' };
    }
    var edge = transitionEdge(actor, toVariantId, opts);
    if (!edge) return { ok: false, reason: 'transition-edge' };
    var actionState = actor.components.actionState;
    if (actionState && actionState.state !== 'idle' && actionState.state !== 'defeated' &&
        edge.activeAction === 'defer') return { ok: false, reason: 'active-action-defer' };
    try {
      var nextRuntimeState = buildVariantRuntime(actor, toVariantId, edge);
      return {
        ok: true,
        draft: {
          actorId: actor.id,
          expectedRuntimeRevision: actor.runtimeRevision,
          oldRuntimeState: actor.runtimeState,
          nextRuntimeState: nextRuntimeState,
          oldVariantId: actor.variantId || null,
          newVariantId: toVariantId,
          edge: clone(edge),
          summary: {
            hpRatio: nextRuntimeState.components.vitals.hp /
              Math.max(1, nextRuntimeState.components.vitals.maxHp),
            resources: Object.keys(nextRuntimeState.components.resources || {}).sort(),
            statusesRemoved: (actor.components.statuses || []).length -
              (nextRuntimeState.components.statuses || []).length
          }
        }
      };
    } catch (error) {
      return { ok: false, reason: 'transition-prepare', error: error };
    }
  }

  var A = Game.actors = {
    spawn: function (spec) {
      spec = spec || {};
      var record = spec.actorRecordId && Game.roster.getRecord(spec.actorRecordId);
      if (spec.actorRecordId && !record) throw new Error('[Actors] missing record: ' + spec.actorRecordId);
      if (record && A.query({ actorRecordId: record.id }).length) {
        throw new Error('[Actors] record already has a live instance: ' + record.id);
      }
      if (record && spec.archetypeId && record.archetypeId !== spec.archetypeId) {
        throw new Error('[Actors] record/archetype conflict');
      }
      if (record && spec.level && record.level !== spec.level) throw new Error('[Actors] record/level conflict');
      var archetypeId = record ? record.archetypeId : spec.archetypeId;
      if (!archetypeId) throw new Error('[Actors] archetypeId required');
      var blueprint = Game.content.compileBlueprint({
        archetypeId: archetypeId,
        classId: record && record.classId || spec.classId || null,
        variantId: record && record.variantId || spec.variantId || null
      });
      var id = uniqueId(spec);
      if (instances[id]) throw new Error('[Actors] duplicate instance: ' + id);
      var archetype = Game.content.get('actorArchetype', blueprint.archetypeId);
      var actorPresentation = presentationFor(archetype, blueprint);
      var buildSpec = {
        archetypeId: archetypeId,
        classId: record && record.classId || spec.classId || null,
        variantId: record && record.variantId || spec.variantId || null,
        statValues: clone(spec.statValues || {}),
        modifiers: clone(spec.modifiers || []),
        talentRanks: clone(spec.talentRanks || {})
      };
      var stats = baseStats(blueprint, buildSpec, record);
      var combatCapable = !!blueprint.resolvedProfiles.statProfileId &&
        (blueprint.resolvedAbilityGrants.length > 0 || archetype.category === 'player');
      var components = {
        transform: {
          x: spec.transform && Number(spec.transform.x) || 0,
          y: spec.transform && Number(spec.transform.y) || 0,
          direction: spec.transform && spec.transform.direction || 'd'
        },
        body: clone(blueprint.resolvedBody || archetype.body),
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
      components.runtimeContent = buildRuntimeContent(blueprint, record, buildSpec);
      applyBuildModifiers(components, blueprint, record, buildSpec);
      if (combatCapable) {
        var maxHp = components.statBlock.value('maxHp');
        var storedHp = record && record.persistentResources.hp;
        components.vitals = {
          hp: record && Number.isFinite(storedHp)
            ? Game.util.clamp(storedHp, 0, maxHp)
            : maxHp,
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
        variantId: blueprint.variantId,
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
        buildSpec: buildSpec,
        category: archetype.category,
        rank: archetype.rank,
        components: components,
        tags: blueprint.resolvedTags.slice(),
        abilities: blueprint.resolvedAbilityGrants.slice(),
        traits: blueprint.resolvedTraits.slice(),
        // Presentation compatibility only. Combat and relation code never read it.
        kind: archetype.category === 'player' ? 'hero' : (archetype.category === 'monster' || archetype.category === 'summon' ? 'monster' : 'actor'),
        mid: archetype.category === 'monster' || archetype.category === 'summon'
          ? archetype.id : null,
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
      bindRuntimeState(instance);
      defineCompatibility(instance);
      if (components.vitals && components.vitals.hp <= 0) {
        instance.lifecycle = 'defeated';
        instance.dead = true;
        components.actionState.state = 'defeated';
        components.presentation.state = 'dead';
      }
      instances[id] = instance;
      order.push(id);
      if (record && components.vitals) commitPersistentHp(instance);
      if (spec.partyId && Game.parties.get(spec.partyId)) Game.parties.addMember(spec.partyId, id);
      return instance;
    },

    get: function (id) { return instances[id] || null; },
    ability: function (ref, abilityId) {
      var actor = actorFrom(ref);
      if (!actor) return null;
      return actor.components.runtimeContent &&
        actor.components.runtimeContent.abilities[abilityId] ||
        Game.content.get('ability', abilityId);
    },
    status: function (ref, statusId) {
      var actor = actorFrom(ref);
      return actor && actor.components.runtimeContent &&
        actor.components.runtimeContent.statuses[statusId] ||
        Game.content.get('status', statusId);
    },
    refresh: function (id, opts) {
      opts = opts || {};
      var actor = instances[id];
      if (!actor) return null;
      var record = actor.actorRecordId && Game.roster &&
        Game.roster.getRecord(actor.actorRecordId);
      var hadVitals = !!actor.components.vitals;
      var beforeMax = actor.components.vitals && actor.components.vitals.maxHp || 0;
      var beforeHp = actor.components.vitals && actor.components.vitals.hp || 0;
      var previousEntries = actor.components.modifierLedger.snapshot().entries;
      var previousResources = clone(actor.components.resources || {});
      var buildSpec = actor.buildSpec || {};
      actor.blueprint = Game.content.compileBlueprint({
        archetypeId: record && record.archetypeId || buildSpec.archetypeId ||
          actor.blueprint.archetypeId,
        classId: record && record.classId || buildSpec.classId || null,
        variantId: buildSpec.variantId || null
      });
      actor.blueprintKey = actor.blueprint.key;
      actor.variantId = actor.blueprint.variantId;
      actor.abilities = actor.blueprint.resolvedAbilityGrants.slice();
      actor.traits = actor.blueprint.resolvedTraits.slice();
      if (record) actor.level = record.level;
      var stats = baseStats(actor.blueprint, Object.assign({}, buildSpec, {
        level: actor.level, tier: actor.tier
      }), record);
      var archetype = Game.content.get('actorArchetype', actor.blueprint.archetypeId);
      var actorPresentation = presentationFor(archetype, actor.blueprint);
      actor.components.presentation.spriteId = actorPresentation.spriteId;
      actor.components.presentation.portraitId = actorPresentation.portraitId;
      actor.components.presentation.scale = actorPresentation.scale;
      actor.components.body = clone(actor.blueprint.resolvedBody || archetype.body);
      actor.components.statBlock = modifierLedger(stats);
      actor.components.modifierLedger = actor.components.statBlock;
      actor.components.runtimeContent = buildRuntimeContent(actor.blueprint, record, buildSpec);
      applyBuildModifiers(actor.components, actor.blueprint, record, buildSpec);
      applyStatusModifiers(actor.components);

      // Refresh owns the sources it can deterministically rebuild. Any remaining
      // source is an external runtime modifier and must survive the rebuild.
      var rebuiltSources = {};
      actor.components.modifierLedger.snapshot().entries.forEach(function (entry) {
        rebuiltSources[entry.sourceId] = true;
      });
      var statusSources = {};
      (actor.components.statuses || []).forEach(function (status) {
        statusSources[status.id] = true;
      });
      previousEntries.forEach(function (entry) {
        var managed = /^(trait|talent|spawn):/.test(entry.sourceId) ||
          statusSources[entry.sourceId];
        if (!managed && !rebuiltSources[entry.sourceId]) {
          actor.components.modifierLedger.add(entry);
        }
      });
      actor.components.movement.speed = actor.components.statBlock.value('moveSpeed');

      var combatCapable = !!actor.blueprint.resolvedProfiles.statProfileId &&
        (actor.blueprint.resolvedAbilityGrants.length > 0 || archetype.category === 'player');
      if (!actor.components.actionState && combatCapable) {
        var initialMaxHp = Math.max(1, actor.components.statBlock.value('maxHp'));
        actor.components.vitals = {
          hp: Number.isFinite(opts.hp)
            ? Game.util.clamp(opts.hp, 0, initialMaxHp)
            : initialMaxHp,
          maxHp: initialMaxHp,
          shields: []
        };
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
        var rebuiltResources = resourceComponents(actor.blueprint);
        Object.keys(rebuiltResources).forEach(function (resourceId) {
          var previous = previousResources[resourceId];
          if (!previous) return;
          rebuiltResources[resourceId].value = Game.util.clamp(
            previous.value, rebuiltResources[resourceId].min, rebuiltResources[resourceId].max
          );
          rebuiltResources[resourceId].reserved = Game.util.clamp(
            previous.reserved, 0, rebuiltResources[resourceId].value
          );
        });
        actor.components.resources = rebuiltResources;
      }
      if (hadVitals && actor.components.vitals) {
        reconcileVitals(actor, {
          beforeMax: beforeMax,
          beforeHp: beforeHp,
          hp: opts.hp,
          hpPolicy: opts.hpPolicy || 'preserveAbsolute'
        });
      }
      return actor;
    },
    prepareVariantTransition: function (id, toVariantId, opts) {
      return prepareVariantTransition(instances[id], toVariantId, opts || {});
    },

    commitPreparedVariant: function (draft, opts) {
      opts = opts || {};
      var actor = draft && instances[draft.actorId];
      if (!actor || actor.runtimeRevision !== draft.expectedRuntimeRevision ||
          actor.runtimeState !== draft.oldRuntimeState) {
        return { ok: false, reason: 'runtime-revision' };
      }
      var record = actor.actorRecordId && Game.roster && Game.roster.getRecord(actor.actorRecordId);
      var oldRecordVariant = record && record.variantId || null;
      var social = Game.state && Game.state.world && Game.state.world.social;
      var hadSpawnVariant = !!(social && actor.spawnId &&
        Object.prototype.hasOwnProperty.call(social.spawnVariants, actor.spawnId));
      var oldSpawnVariant = hadSpawnVariant ? social.spawnVariants[actor.spawnId] : null;
      try {
        if (draft.edge.activeAction === 'cancel' && actor.encounterId && Game.combat &&
            actor.components.actionState && actor.components.actionState.actionId) {
          Game.combat.cancelAction(actor.id, 'variant-change');
        }
        actor.runtimeState = draft.nextRuntimeState;
        actor.runtimeRevision++;
        if (draft.edge.persistence === 'actorRecord' && record) {
          record.variantId = draft.newVariantId;
        } else if (draft.edge.persistence === 'worldSpawn' && actor.spawnId && social) {
          social.spawnVariants[actor.spawnId] = draft.newVariantId;
        }
        if (!opts.silent && Game.bus) Game.bus.emit('actor:variantChanged', {
          actorId: actor.id, oldVariantId: draft.oldVariantId,
          newVariantId: draft.newVariantId,
          triggerId: draft.edge.triggerId, summary: clone(draft.summary)
        });
        return {
          ok: true, oldVariantId: draft.oldVariantId,
          newVariantId: draft.newVariantId, summary: clone(draft.summary),
          runtimeRevision: actor.runtimeRevision
        };
      } catch (error) {
        actor.runtimeState = draft.oldRuntimeState;
        actor.runtimeRevision = draft.expectedRuntimeRevision;
        if (record) record.variantId = oldRecordVariant;
        if (social && actor.spawnId) {
          if (hadSpawnVariant) social.spawnVariants[actor.spawnId] = oldSpawnVariant;
          else delete social.spawnVariants[actor.spawnId];
        }
        return { ok: false, reason: 'transition-rollback', error: error };
      }
    },

    transitionVariant: function (id, toVariantId, opts) {
      opts = opts || {};
      var actor = instances[id];
      if (!actor) return { ok: false, reason: 'missing-actor' };
      var edge = transitionEdge(actor, toVariantId, opts);
      if (!edge) return { ok: false, reason: 'transition-edge' };
      if (actor.encounterId && !opts.fromCleanup) {
        var encounter = Game.encounters && Game.encounters.get(actor.encounterId);
        if (!encounter || edge.timing !== 'cleanup') return { ok: false, reason: 'transition-timing' };
        Game.encounters.schedule(encounter.id, {
          dueTick: encounter.tick, phase: 'cleanup', kind: 'variantTransition',
          actorId: actor.id, toVariantId: toVariantId, triggerId: edge.triggerId,
          activeAction: edge.activeAction, persistence: edge.persistence
        });
        return {
          ok: true, scheduled: true,
          fromVariantId: actor.variantId || null, toVariantId: toVariantId
        };
      }
      var prepared = prepareVariantTransition(actor, toVariantId, opts);
      return prepared.ok ? A.commitPreparedVariant(prepared.draft, opts) : prepared;
    },
    captureTransactionState: function (id) {
      var actor = instances[id];
      if (!actor) return null;
      var componentState = {};
      Object.keys(actor.components).forEach(function (key) {
        if (key === 'statBlock' || key === 'modifierLedger') return;
        componentState[key] = clone(actor.components[key]);
      });
      var record = actor.actorRecordId && Game.roster &&
        Game.roster.getRecord(actor.actorRecordId);
      return {
        actorId: actor.id,
        runtimeRevision: actor.runtimeRevision,
        buildSpec: clone(actor.buildSpec),
        components: componentState,
        modifierEntries: actor.components.modifierLedger.snapshot().entries,
        encounterId: actor.encounterId,
        teamId: actor.teamId,
        targetId: actor.target && actor.target.id || null,
        engaged: !!actor.engaged,
        manualTarget: !!actor.manualTarget,
        moveOrder: clone(actor.moveOrder),
        interactOrder: clone(actor.interactOrder),
        lifecycle: actor.lifecycle,
        dead: !!actor.dead,
        record: record ? {
          variantId: record.variantId || null,
          persistentResources: clone(record.persistentResources || {})
        } : null
      };
    },
    restoreTransactionState: function (snapshot) {
      var actor = snapshot && instances[snapshot.actorId];
      if (!actor) return false;
      var record = actor.actorRecordId && Game.roster &&
        Game.roster.getRecord(actor.actorRecordId);
      if (record && snapshot.record) {
        record.variantId = snapshot.record.variantId || null;
        record.persistentResources = clone(snapshot.record.persistentResources || {});
      }
      actor.buildSpec = clone(snapshot.buildSpec);
      actor.blueprint = Game.content.compileBlueprint({
        archetypeId: actor.buildSpec.archetypeId,
        classId: actor.buildSpec.classId || null,
        variantId: actor.buildSpec.variantId || null
      });
      actor.blueprintKey = actor.blueprint.key;
      actor.variantId = actor.blueprint.variantId;
      actor.abilities = actor.blueprint.resolvedAbilityGrants.slice();
      actor.traits = actor.blueprint.resolvedTraits.slice();
      actor.tags = actor.blueprint.resolvedTags.slice();
      var archetype = Game.content.get('actorArchetype', actor.blueprint.archetypeId);
      actor.category = archetype.category;
      actor.rank = archetype.rank;
      actor.kind = archetype.category === 'player' ? 'hero'
        : (archetype.category === 'monster' || archetype.category === 'summon'
          ? 'monster' : 'actor');
      actor.mid = archetype.category === 'monster' ? archetype.id : null;
      actor.boss = archetype.rank === 'boss';

      Object.keys(actor.components).forEach(function (key) {
        if (key !== 'statBlock' && key !== 'modifierLedger' &&
            !Object.prototype.hasOwnProperty.call(snapshot.components, key)) {
          delete actor.components[key];
        }
      });
      Object.keys(snapshot.components).forEach(function (key) {
        actor.components[key] = clone(snapshot.components[key]);
      });
      var stats = baseStats(actor.blueprint, Object.assign({}, actor.buildSpec, {
        level: actor.level, tier: actor.tier
      }), record);
      var ledger = modifierLedger(stats);
      (snapshot.modifierEntries || []).forEach(function (entry) {
        ledger.add(clone(entry));
      });
      actor.components.statBlock = ledger;
      actor.components.modifierLedger = ledger;
      actor.encounterId = snapshot.encounterId || null;
      actor.teamId = snapshot.teamId || null;
      actor.target = snapshot.targetId ? instances[snapshot.targetId] || null : null;
      actor.engaged = !!snapshot.engaged;
      actor.manualTarget = !!snapshot.manualTarget;
      actor.moveOrder = clone(snapshot.moveOrder);
      actor.interactOrder = clone(snapshot.interactOrder);
      actor.lifecycle = snapshot.lifecycle;
      actor.dead = !!snapshot.dead;
      actor.runtimeRevision = snapshot.runtimeRevision || 0;
      return true;
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
        id: actor.id, blueprintKey: actor.blueprintKey, variantId: actor.variantId,
        runtimeRevision: actor.runtimeRevision, actorRecordId: actor.actorRecordId,
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
          runtimeContent: clone(actor.components.runtimeContent),
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

  /**
   * Unified runtime unit-state boundary.
   * ActorRecord owns persistence, ActorInstance owns live state, and StatBlock is
   * the only source of derived runtime maxima. Callers receive readonly snapshots
   * and mutate vitals through commands instead of writing component fields.
   */
  Game.units = {
    get: actorFrom,
    primary: primaryActor,

    vitals: function (ref) {
      var actor = actorFrom(ref);
      if (!actor || !actor.components.vitals) return null;
      var vitals = actor.components.vitals;
      return Game.contentCompiler.deepFreeze({
        id: actor.id,
        actorRecordId: actor.actorRecordId,
        hp: vitals.hp,
        maxHp: vitals.maxHp,
        hpPct: vitals.hp / Math.max(1, vitals.maxHp),
        alive: vitals.hp > 0 && !actor.dead,
        lifecycle: actor.lifecycle
      });
    },

    snapshot: function (ref) {
      var actor = actorFrom(ref);
      var vitalSnapshot = Game.units.vitals(actor);
      if (!actor || !vitalSnapshot) return null;
      var stats = actor.components.statBlock
        ? actor.components.statBlock.snapshot().values : {};
      return Game.contentCompiler.deepFreeze(Object.assign({}, vitalSnapshot, {
        stats: clone(stats),
        resources: clone(actor.components.resources || {}),
        statuses: clone(actor.components.statuses || [])
      }));
    },

    playerSnapshot: function () {
      var actor = primaryActor();
      if (actor) return Game.units.vitals(actor);
      if (!Game.state || !Game.state.player || !Game.player) return null;
      var d = Game.player.derived();
      var hp = Game.util.clamp(Number(Game.state.player.hp) || 0, 0, d.maxHp);
      var recordId = Game.state.roster && Game.state.roster.primaryActorId || 'player-main';
      return Game.contentCompiler.deepFreeze({
        id: recordId,
        actorRecordId: recordId,
        hp: hp,
        maxHp: d.maxHp,
        hpPct: hp / Math.max(1, d.maxHp),
        alive: hp > 0,
        lifecycle: 'persistent',
        stats: clone(d),
        resources: {},
        statuses: []
      });
    },

    stat: function (ref, id) {
      var actor = actorFrom(ref);
      return actor && actor.components.statBlock
        ? actor.components.statBlock.value(id) : 0;
    },

    stackModifier: function (modifier, stacks) {
      return stackedModifier(modifier, Math.max(1, stacks | 0));
    },

    setHp: function (ref, value, opts) {
      opts = opts || {};
      var actor = actorFrom(ref);
      if (!actor || !actor.components.vitals) return null;
      var vitals = actor.components.vitals;
      var before = vitals.hp;
      vitals.hp = Game.util.clamp(Number(value) || 0, 0, vitals.maxHp);
      if (actor.dead && vitals.hp > 0 && actor.lifecycle === 'defeated') {
        actor.lifecycle = 'reviving';
      }
      if (opts.commit !== false) commitPersistentHp(actor);
      return {
        before: before, hp: vitals.hp, maxHp: vitals.maxHp,
        delta: vitals.hp - before
      };
    },

    heal: function (ref, amount, opts) {
      var actor = actorFrom(ref);
      if (!actor || !actor.components.vitals) return null;
      return Game.units.setHp(actor, actor.components.vitals.hp + Math.max(0, Number(amount) || 0), opts);
    },

    damage: function (ref, amount, opts) {
      var actor = actorFrom(ref);
      if (!actor || !actor.components.vitals) return null;
      var result = Game.units.setHp(
        actor,
        actor.components.vitals.hp - Math.max(0, Number(amount) || 0),
        opts
      );
      if (result) result.amount = result.before - result.hp;
      return result;
    },

    restore: function (ref, opts) {
      var actor = actorFrom(ref);
      if (!actor || !actor.components.vitals) return null;
      return Game.units.revive(actor, Object.assign({}, opts, { hpPolicy: 'full' }));
    },

    defeat: function (ref, opts) {
      opts = opts || {};
      var actor = actorFrom(ref);
      if (!actor || !actor.components.vitals) return null;
      var result = Game.units.setHp(actor, 0, opts);
      actor.lifecycle = 'defeated';
      actor.dead = true;
      actor.deathT = Number.isFinite(opts.deathT) ? opts.deathT : 0.5;
      if (actor.components.actionState) {
        actor.components.actionState.state = 'defeated';
        actor.components.actionState.actionId = null;
        actor.components.actionState.abilityId = null;
        actor.components.actionState.targetIds = [];
        actor.components.actionState.queued = null;
        actor.components.actionState.reserved = [];
        actor.components.actionState.reservedCharge = null;
      }
      if (actor.components.movement) {
        actor.components.movement.intent = null;
        actor.components.movement.moving = false;
      }
      Object.keys(actor.components.resources || {}).forEach(function (resourceId) {
        actor.components.resources[resourceId].reserved = 0;
      });
      if (actor.components.presentation) {
        actor.components.presentation.state = opts.presentationState || 'dead';
      }
      return result;
    },

    revive: function (ref, opts) {
      opts = opts || {};
      var actor = actorFrom(ref);
      if (!actor || !actor.components.vitals) return null;
      var hp = opts.hpPolicy === 'preserveAbsolute'
        ? actor.components.vitals.hp
        : actor.components.vitals.maxHp;
      var result = Game.units.setHp(actor, hp, opts);
      actor.lifecycle = 'active';
      actor.dead = false;
      actor.deathT = 0;
      if (actor.components.actionState) {
        actor.components.actionState.state = 'idle';
        actor.components.actionState.actionId = null;
        actor.components.actionState.abilityId = null;
        actor.components.actionState.targetIds = [];
        actor.components.actionState.queued = null;
        actor.components.actionState.reserved = [];
        actor.components.actionState.reservedCharge = null;
      }
      Object.keys(actor.components.resources || {}).forEach(function (resourceId) {
        actor.components.resources[resourceId].reserved = 0;
      });
      if (actor.components.presentation) {
        actor.components.presentation.state = opts.presentationState || 'idle';
      }
      return result;
    },

    commit: function (ref) {
      return commitPersistentHp(actorFrom(ref));
    },

    reconcile: function (ref, opts) {
      return reconcileVitals(actorFrom(ref), opts);
    },

    rebuildStats: function (ref, opts) {
      var actor = actorFrom(ref);
      return actor ? A.refresh(actor.id, opts) : null;
    },

    setModifierSource: function (ref, sourceId, modifiers, opts) {
      opts = opts || {};
      var actor = actorFrom(ref);
      if (!actor || !actor.components.modifierLedger || !sourceId) return null;
      var beforeMax = actor.components.vitals && actor.components.vitals.maxHp;
      var beforeHp = actor.components.vitals && actor.components.vitals.hp;
      actor.components.modifierLedger.removeSource(sourceId);
      (modifiers || []).forEach(function (modifier) {
        actor.components.modifierLedger.add(Object.assign({}, modifier, { sourceId: sourceId }));
      });
      if (actor.components.movement) {
        actor.components.movement.speed = actor.components.statBlock.value('moveSpeed');
      }
      if (actor.components.vitals) {
        reconcileVitals(actor, {
          beforeMax: beforeMax,
          beforeHp: beforeHp,
          hpPolicy: opts.hpPolicy || 'preserveAbsolute',
          commit: opts.commit
        });
      }
      return actor.components.modifierLedger.sourceEntries(sourceId);
    },

    removeModifierSource: function (ref, sourceId, opts) {
      return Game.units.setModifierSource(ref, sourceId, [], opts);
    },

    overrideMaxHp: function (ref, value, opts) {
      opts = opts || {};
      var actor = actorFrom(ref);
      if (!actor || !actor.components.statBlock || !actor.components.vitals) return null;
      var sourceId = 'unit:maxHpOverride:' + (opts.source || 'explicit');
      Game.units.setModifierSource(actor, sourceId, [{
        stat: 'maxHp',
        phase: 'override',
        operation: 'set',
        value: Math.max(1, Number(value) || 1)
      }], {
        hpPolicy: opts.hpPolicy || 'preserveAbsolute',
        commit: opts.commit
      });
      return actor.components.vitals;
    },

    assertInvariant: function (ref) {
      var actor = actorFrom(ref);
      if (!actor || !actor.components.vitals || !actor.components.statBlock) return true;
      var resolved = actor.components.statBlock.value('maxHp');
      if (Math.abs(actor.components.vitals.maxHp - resolved) > 0.0001) {
        throw new Error('[Units] maxHp invariant failed for ' + actor.id);
      }
      if (actor.components.vitals.hp < 0 || actor.components.vitals.hp > resolved) {
        throw new Error('[Units] hp bounds failed for ' + actor.id);
      }
      var values = actor.components.statBlock.snapshot().values;
      Object.keys(values).forEach(function (id) {
        if (!Number.isFinite(values[id])) {
          throw new Error('[Units] non-finite stat ' + id + ' for ' + actor.id);
        }
      });
      Object.keys(actor.components.resources || {}).forEach(function (id) {
        var resource = actor.components.resources[id];
        if (!Number.isFinite(resource.value) || resource.value < resource.min ||
            resource.value > resource.max || resource.reserved < 0 ||
            resource.reserved > resource.value) {
          throw new Error('[Units] resource bounds failed for ' + actor.id + ':' + id);
        }
      });
      var defeatedState = actor.components.actionState &&
        actor.components.actionState.state === 'defeated';
      if (actor.dead && (!defeatedState ||
          ['defeated', 'reviving'].indexOf(actor.lifecycle) < 0)) {
        throw new Error('[Units] defeated lifecycle mismatch for ' + actor.id);
      }
      if (!actor.dead && (actor.components.vitals.hp <= 0 || defeatedState ||
          actor.lifecycle === 'defeated' || actor.lifecycle === 'reviving')) {
        throw new Error('[Units] active lifecycle mismatch for ' + actor.id);
      }
      if (actor.actorRecordId && A.query({ actorRecordId: actor.actorRecordId }).length !== 1) {
        throw new Error('[Units] duplicate live record for ' + actor.actorRecordId);
      }
      if (actor.actorRecordId && Game.roster) {
        var record = Game.roster.getRecord(actor.actorRecordId);
        if (!record || Math.abs(record.persistentResources.hp -
            actor.components.vitals.hp) > 0.0001) {
          throw new Error('[Units] record HP mismatch for ' + actor.actorRecordId);
        }
      }
      return true;
    }
  };
})();
