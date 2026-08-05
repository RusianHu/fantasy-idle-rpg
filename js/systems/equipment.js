/* Formal equipment compilation, deterministic loot and camp reforging. */
(function () {
  'use strict';
  var Game = window.Game;
  var MAX_VALUE = 1e300;
  var SLOT_IDS = ['weapon', 'head', 'body', 'feet', 'accessory'];
  var RARITY_IDS = ['common', 'fine', 'rare', 'epic', 'legendary'];
  var PRIMARY_POWER = {
    fighter: 'physicalPower', rogue: 'physicalPower', ranger: 'physicalPower',
    mage: 'magicPower', cleric: 'magicPower'
  };
  var REGION_MATERIALS = {
    grassland: ['herb', 'berry'], forest: ['mushroom', 'resin'],
    mine: ['ore', 'crystal_cluster'], graveyard: ['ghost_flower', 'grave_dust'],
    snowpass: ['ice_crystal', 'frost_herb'], lavacave: ['fire_core', 'obsidian'],
    skyruins: ['rune_stone', 'aether_shard'], darkcastle: ['miasma_crystal', 'demon_horn']
  };

  function clone(value) {
    if (Game.contentCompiler) return Game.contentCompiler.clone(value);
    return JSON.parse(JSON.stringify(value));
  }
  function hashSeed(value) { return Game.util.strSeed(String(value)); }
  function rngFor(seed) { return Game.util.seededRng(Number(seed) >>> 0); }
  function slotOf(item) {
    if (!item) return null;
    if (item.baseId) {
      var def = Game.content.get('itemBase', item.baseId);
      if (def) return def.slotId;
    }
    return item.base || null;
  }
  function levelOf(item) { return Math.max(1, Math.round(item && (item.itemLevel || item.ilvl) || 1)); }
  function rarityIdOf(item) {
    if (item && RARITY_IDS.indexOf(item.rarityId) >= 0) return item.rarityId;
    return RARITY_IDS[Game.util.clamp(item && item.rar | 0, 0, 4)];
  }
  function rarityRank(item) { return Math.max(0, RARITY_IDS.indexOf(rarityIdOf(item))); }
  function budget(itemLevel) {
    return (5 + itemLevel * 1.35) * Math.pow(1.045, itemLevel);
  }
  function quantize(value, percent) {
    if (!Number.isFinite(value)) return 0;
    return percent ? +value.toFixed(3) : Math.max(1, Math.round(value));
  }
  function traceContext(value) {
    var out = {};
    Object.keys(value || {}).forEach(function (key) {
      if (typeof value[key] === 'function') return;
      out[key] = clone(value[key]);
    });
    return out;
  }
  function createTrace(context, stateBefore) {
    return {
      schemaVersion: 1,
      seed: null,
      context: traceContext(context || {}),
      stateBefore: stateBefore === undefined ? null : clone(stateBefore),
      stateAfter: null,
      decisions: []
    };
  }
  function addDecision(trace, entry) {
    if (!trace) return;
    trace.decisions.push(Object.assign({
      stage: '', key: '', roll: null, threshold: null,
      candidates: [], selected: null, reason: null, values: {}
    }, entry || {}));
  }
  function weightedChoice(rows, random, weightFor, trace, meta) {
    var weights = rows.map(function (row) { return Math.max(0, weightFor(row)); });
    var total = weights.reduce(function (sum, weight) { return sum + weight; }, 0);
    var selected = rows[0] || null;
    var rawRoll = null;
    if (!(total > 0)) return rows[0] || null;
    rawRoll = random();
    var roll = rawRoll * total;
    for (var i = 0; i < rows.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { selected = rows[i]; break; }
    }
    if (roll > 0) selected = rows[rows.length - 1] || null;
    meta = meta || {};
    addDecision(trace, {
      stage: meta.stage || 'weighted-choice', key: meta.key || '',
      roll: rawRoll, threshold: total,
      candidates: rows.map(function (row, index) {
        return { id: meta.idFor ? meta.idFor(row) : row && row.id || String(row), weight: weights[index] };
      }),
      selected: selected && (meta.idFor ? meta.idFor(selected) : selected.id || String(selected)),
      reason: meta.reason || 'weighted', values: meta.values || {}
    });
    return selected;
  }
  function expandStat(stat, classId) {
    if (stat === 'classPower') {
      var classDef = Game.content.get('class', classId);
      return [classDef && classDef.primaryPowerStat || PRIMARY_POWER[classId] || 'physicalPower'];
    }
    if (stat === 'haste') return ['gcdSpeed', 'castSpeed', 'autoAttackSpeed'];
    return [stat];
  }
  function rolledValue(modifier, itemLevel, rarity, random, implicit, trace, meta) {
    var roll = modifier.roll || {};
    var kind = roll.kind || 'fixed';
    var value, valueRoll = null, implicitRoll = null;
    if (kind === 'budget') value = budget(itemLevel) * (Number(roll.coefficient) || 0);
    else if (kind === 'budgetRange') {
      valueRoll = random();
      value = budget(itemLevel) *
        (Number(roll.min) + valueRoll * (Number(roll.max) - Number(roll.min)));
    } else if (kind === 'range') {
      valueRoll = random();
      value = Number(roll.min) + valueRoll * (Number(roll.max) - Number(roll.min));
    }
    else value = Number(roll.value) || 0;
    if (implicit) {
      if (kind === 'budget') value *= Number(rarity.implicitMultiplier) || 1;
      implicitRoll = random();
      value *= .9 + implicitRoll * .2;
    }
    var result = quantize(value, kind === 'range' || kind === 'fixed' && Math.abs(value) < 1);
    meta = meta || {};
    addDecision(trace, {
      stage: implicit ? 'implicit-roll' : 'affix-roll',
      key: meta.key || modifier.stat || '', roll: valueRoll,
      selected: result, reason: kind,
      values: {
        definitionId: meta.definitionId || null, modifierIndex: meta.modifierIndex,
        stat: modifier.stat, operation: modifier.operation || 'add', kind: kind,
        valueRoll: valueRoll, implicitRoll: implicitRoll, itemLevel: itemLevel,
        rarityId: rarity.id, result: result
      }
    });
    return result;
  }
  function rollDefinition(definition, itemLevel, rarity, random, implicit, trace, keyPrefix) {
    return (definition.implicitModifiers || definition.modifiers || []).map(function (modifier, index) {
      if (Number.isFinite(modifier.value)) {
        addDecision(trace, {
          stage: implicit ? 'implicit-roll' : 'affix-roll',
          key: (keyPrefix || definition.id) + ':' + index,
          selected: Number(modifier.value), reason: 'fixed-value',
          values: { definitionId: definition.id, modifierIndex: index, stat: modifier.stat,
            operation: modifier.operation || 'add', result: Number(modifier.value) }
        });
        return Number(modifier.value);
      }
      return rolledValue(modifier, itemLevel, rarity, random, implicit, trace, {
        key: (keyPrefix || definition.id) + ':' + index,
        definitionId: definition.id, modifierIndex: index
      });
    });
  }
  function compileRolledModifiers(definition, values, classId, sourcePrefix) {
    var definitions = definition.implicitModifiers || definition.modifiers || [];
    var out = [];
    definitions.forEach(function (modifier, index) {
      var value = Number.isFinite(modifier.value) ? Number(modifier.value) : Number(values[index]);
      if (!Number.isFinite(value)) return;
      expandStat(modifier.stat, classId).forEach(function (statId) {
        out.push({
          sourceId: sourcePrefix + ':' + index + ':' + statId,
          stat: statId, phase: modifier.phase || 'equipmentFlat',
          operation: modifier.operation || 'add', value: value
        });
      });
    });
    return out;
  }
  function encounterActive() {
    var hero = Game.world && Game.world.hero;
    return !!(hero && hero.encounterId);
  }
  function defaultLootState() {
    return {
      schemaVersion: 1, eligibleMisses: 0, dropsSinceEpic: 0,
      dropsSinceLegendary: 0, sourceOrdinals: {}, slotDrought: {
        weapon: 0, head: 0, body: 0, feet: 0, accessory: 0
      }
    };
  }
  function normalizeLootState(value) {
    var out = Object.assign(defaultLootState(), clone(value || {}));
    out.sourceOrdinals = Object.assign({}, out.sourceOrdinals || {});
    out.slotDrought = Object.assign(defaultLootState().slotDrought, out.slotDrought || {});
    return out;
  }
  function rollBounds(modifier, itemLevel, rarity, implicit) {
    if (Number.isFinite(modifier.value)) return [Number(modifier.value), Number(modifier.value), 1e-9];
    var roll = modifier.roll || {};
    var kind = roll.kind || 'fixed';
    var low, high;
    if (kind === 'budget') low = high = budget(itemLevel) * (Number(roll.coefficient) || 0);
    else if (kind === 'budgetRange') {
      low = budget(itemLevel) * Number(roll.min);
      high = budget(itemLevel) * Number(roll.max);
    } else if (kind === 'range') {
      low = Number(roll.min); high = Number(roll.max);
    } else low = high = Number(roll.value) || 0;
    if (implicit) {
      if (kind === 'budget') {
        low *= Number(rarity.implicitMultiplier) || 1;
        high *= Number(rarity.implicitMultiplier) || 1;
      }
      var scaledLow = Math.min(low * .9, low * 1.1, high * .9, high * 1.1);
      var scaledHigh = Math.max(low * .9, low * 1.1, high * .9, high * 1.1);
      low = scaledLow; high = scaledHigh;
    }
    return [Math.min(low, high), Math.max(low, high), kind === 'range' || kind === 'fixed' && Math.abs(high) < 1 ? .0011 : 1.001];
  }
  function validRolls(definition, values, itemLevel, rarity, implicit) {
    var modifiers = definition.implicitModifiers || definition.modifiers || [];
    if (!Array.isArray(values) || values.length !== modifiers.length) return false;
    return values.every(function (value, index) {
      if (!Number.isFinite(value)) return false;
      var bounds = rollBounds(modifiers[index], itemLevel, rarity, implicit);
      return value >= bounds[0] - bounds[2] && value <= bounds[1] + bounds[2];
    });
  }

  var Equipment = Game.equipment = {
    SLOT_IDS: SLOT_IDS.slice(),
    RARITY_IDS: RARITY_IDS.slice(),
    MAX_COMBAT_VALUE: MAX_VALUE,
    slotOf: slotOf,
    levelOf: levelOf,
    rarityIdOf: rarityIdOf,
    rarityRank: rarityRank,
    budget: budget,
    isV2: function (item) { return !!(item && item.schemaVersion === 2 && item.baseId); },
    compileItem: function (item, actorContext) {
      actorContext = actorContext || {};
      if (!Equipment.isV2(item)) return { modifiers: [], effects: [], errors: ['legacy-item'] };
      var base = Game.content.get('itemBase', item.baseId);
      if (!base) return { modifiers: [], effects: [], errors: ['missing-base'] };
      var classId = actorContext.classId || item.classId;
      var modifiers = [], effects = [], errors = [];
      (item.implicitRolls || []).forEach(function (rolled, index) {
        if (rolled.definitionId !== base.id + ':' + index) errors.push('implicit-definition');
      });
      var implicitValues = (item.implicitRolls || []).map(function (rolled) {
        return rolled.values && rolled.values.value;
      });
      modifiers = modifiers.concat(compileRolledModifiers(
        base, implicitValues, classId, 'equipment:' + item.uid + ':implicit'
      ));
      (item.affixes || []).forEach(function (rolled) {
        var def = Game.content.get('itemAffix', rolled.definitionId);
        if (!def) { errors.push('missing-affix:' + rolled.definitionId); return; }
        modifiers = modifiers.concat(compileRolledModifiers(
          def, rolled.values && rolled.values.rolls || [], classId,
          'equipment:' + item.uid + ':' + rolled.instanceId
        ));
        if (def.effectProfileId) {
          var profile = Game.content.get('effectProfile', def.effectProfileId);
          if (profile) effects.push({
            sourceId: 'equipment:' + item.uid + ':' + rolled.instanceId,
            affixId: def.id, profile: clone(profile)
          });
        }
      });
      return { modifiers: modifiers, effects: effects, errors: errors };
    },
    validateItem: function (item) {
      if (!Equipment.isV2(item)) return { ok: false, reason: 'schema' };
      var base = Game.content.get('itemBase', item.baseId);
      var rarity = Game.content.get('itemRarity', item.rarityId);
      var classDef = Game.content.get('class', item.classId);
      var profile = classDef && Game.content.get('equipmentProfile', classDef.equipmentProfileId);
      if (!item.uid || item.generationVersion !== 1 || !base || !rarity || !classDef ||
          !profile || profile.slots.indexOf(base.slotId) < 0 ||
          base.classIds.length && base.classIds.indexOf(classDef.id) < 0 ||
          !Number.isInteger(item.itemLevel) || item.itemLevel < 1) {
        return { ok: false, reason: 'reference' };
      }
      if (!item.origin || !Number.isFinite(item.origin.seed) ||
          !Number.isInteger(item.origin.ordinal) || item.origin.ordinal < 0 ||
          typeof item.origin.sourceType !== 'string') {
        return { ok: false, reason: 'origin' };
      }
      var seenInstances = {}, seenDefinitions = {}, familyCounts = {};
      var normalPool = Game.content.get('itemAffixPool', 'equipment.normal');
      var legendaryPool = Game.content.get('itemAffixPool', 'equipment.legendary');
      if (!Array.isArray(item.implicitRolls) || item.implicitRolls.length !== base.implicitModifiers.length) {
        return { ok: false, reason: 'implicit-count' };
      }
      for (var implicitIndex = 0; implicitIndex < item.implicitRolls.length; implicitIndex++) {
        var implicitRoll = item.implicitRolls[implicitIndex];
        if (!implicitRoll || implicitRoll.definitionId !== base.id + ':' + implicitIndex ||
            !implicitRoll.values || !validRolls({
              implicitModifiers: [base.implicitModifiers[implicitIndex]]
            }, [implicitRoll.values.value], item.itemLevel, rarity, true)) {
          return { ok: false, reason: 'implicit-roll' };
        }
      }
      if (!Array.isArray(item.affixes) || item.affixes.length !==
          rarity.normalAffixCount + (rarity.legendaryAffixCount || 0)) {
        return { ok: false, reason: 'affix-count' };
      }
      var kindCounts = { normal: 0, legendary: 0 };
      for (var i = 0; i < item.affixes.length; i++) {
        var rolled = item.affixes[i];
        var def = rolled && Game.content.get('itemAffix', rolled.definitionId);
        var pool = def && def.kind === 'legendary' ? legendaryPool : normalPool;
        if (!rolled || !rolled.instanceId || seenInstances[rolled.instanceId] ||
            seenDefinitions[rolled.definitionId] || !def || !pool ||
            pool.affixIds.indexOf(def.id) < 0 ||
            (def.slots.length && def.slots.indexOf(base.slotId) < 0) ||
            !rolled.values || !Array.isArray(rolled.values.rolls) ||
            !validRolls(def, rolled.values.rolls, item.itemLevel, rarity, false)) {
          return { ok: false, reason: 'affix-reference' };
        }
        seenInstances[rolled.instanceId] = true;
        seenDefinitions[rolled.definitionId] = true;
        kindCounts[def.kind] = (kindCounts[def.kind] || 0) + 1;
        familyCounts[def.family] = (familyCounts[def.family] || 0) + 1;
        if (familyCounts[def.family] > (pool.familyLimits[def.family] || Infinity)) {
          return { ok: false, reason: 'family-limit' };
        }
      }
      if (kindCounts.normal !== rarity.normalAffixCount ||
          kindCounts.legendary !== (rarity.legendaryAffixCount || 0)) {
        return { ok: false, reason: 'affix-kind-count' };
      }
      var lockId = item.reforge && item.reforge.lockedAffixInstanceId;
      if (!item.reforge || !Number.isInteger(item.reforge.count) || item.reforge.count < 0 ||
          lockId && !item.affixes.some(function (rolled) {
            var def = Game.content.get('itemAffix', rolled.definitionId);
            return rolled.instanceId === lockId && def && def.kind === 'normal';
          })) {
        return { ok: false, reason: 'reforge' };
      }
      return { ok: true };
    },
    itemStats: function (item) {
      var compiled = Equipment.compileItem(item, { classId: item.classId || Game.state && Game.state.player.classId });
      var stats = {
        atk: 0, hp: 0, def: 0, ward: 0, spd: 0, crit: 0, critDmg: 0,
        goldMul: 0, expMul: 0, dropMul: 0, rarityLuck: 0,
        dodge: 0, lifesteal: 0, cdr: 0, healPow: 0, regen: 0,
        atkPct: 0, hpPct: 0, formalModifiers: compiled.modifiers
      };
      compiled.modifiers.forEach(function (mod) {
        var value = mod.value;
        if (mod.stat === 'physicalPower' || mod.stat === 'magicPower') {
          if (mod.operation === 'addPct') stats.atkPct += value; else stats.atk += value;
        } else if (mod.stat === 'maxHp') {
          if (mod.operation === 'addPct') stats.hpPct += value; else stats.hp += value;
        } else if (mod.stat === 'armor') stats.def += value;
        else if (mod.stat === 'ward') stats.ward += value;
        else if (mod.stat === 'critChance') stats.crit += value;
        else if (mod.stat === 'critMultiplier') stats.critDmg += value;
        else if (mod.stat === 'goldMultiplier') stats.goldMul += value;
        else if (mod.stat === 'expMultiplier') stats.expMul += value;
        else if (mod.stat === 'dropMultiplier') stats.dropMul += value;
        else if (mod.stat === 'rarityLuck') stats.rarityLuck += value;
        else if (mod.stat === 'dodgeChance') stats.dodge += value;
        else if (mod.stat === 'lifesteal') stats.lifesteal += value;
        else if (mod.stat === 'cooldownRate') stats.cdr += value;
        else if (mod.stat === 'healingPower') stats.healPow += value;
        else if (mod.stat === 'healthRegenPct') stats.regen += value;
        else if (mod.stat === 'moveSpeed') stats.spd += value;
      });
      return stats;
    },
    sellPrice: function (item) {
      var rarity = Game.content.get('itemRarity', rarityIdOf(item));
      return Math.max(1, Math.round(3 * Math.pow(1.14, levelOf(item)) *
        (rarity && rarity.sellMultiplier || 1)));
    },
    salvageCrystal: function (item) { return 12 + Math.floor(levelOf(item) / 8); },
    normalizeCompatibility: function (item) {
      if (!item) return item;
      item.base = slotOf(item);
      item.ilvl = levelOf(item);
      item.rar = rarityRank(item);
      return item;
    }
  };

  function chooseRarity(context, random, minimumRank, trace, keyPrefix) {
    var table = Game.content.get('lootTable', 'equipment.standard');
    var luck = Math.max(0, Number(context.rarityLuck) || 0);
    var rows = RARITY_IDS.map(function (id, rank) {
      return { id: id, rank: rank, weight: Number(table.rarityWeights[rank]) || 0 };
    }).filter(function (row) { return row.rank >= minimumRank; });
    return weightedChoice(rows, random, function (row) {
      return row.weight * Math.exp(row.rank * luck);
    }, trace, {
      stage: 'rarity', key: (keyPrefix || 'item') + '.rarity',
      idFor: function (row) { return row.id; }, values: { minimumRank: minimumRank, rarityLuck: luck }
    }).id;
  }
  function chooseSlot(context, random, trace, keyPrefix) {
    if (context.slotId && SLOT_IDS.indexOf(context.slotId) >= 0) {
      addDecision(trace, {
        stage: 'slot', key: (keyPrefix || 'item') + '.slot', selected: context.slotId,
        reason: 'forced', values: { slotDrought: clone(context.slotDrought || {}) }
      });
      return context.slotId;
    }
    var equipped = context.equipped || Game.state && Game.state.inv.equipped || {};
    var drought = context.slotDrought || {};
    var levels = SLOT_IDS.map(function (slot) {
      var item = equipped[slot] && Game.inv && Game.inv.byUid
        ? Game.inv.byUid(equipped[slot]) : null;
      return { slot: slot, level: item ? levelOf(item) : -1 };
    }).sort(function (a, b) { return a.level - b.level || a.slot.localeCompare(b.slot); });
    var weak = {}; weak[levels[0].slot] = true; weak[levels[1].slot] = true;
    return weightedChoice(SLOT_IDS, random, function (slot) {
      return (equipped[slot] ? 1 : 3) * (weak[slot] ? 1.5 : 1) *
        (1 + Math.min(1, .1 * Math.max(0, Number(drought[slot]) || 0)));
    }, trace, {
      stage: 'slot', key: (keyPrefix || 'item') + '.slot',
      idFor: function (slot) { return slot; },
      values: { weakSlots: Object.keys(weak), slotDrought: clone(drought) }
    });
  }
  function chooseAffixes(base, rarity, itemLevel, random, poolId, uid, excludedIds, trace, keyPrefix) {
    var pool = Game.content.get('itemAffixPool', poolId);
    excludedIds = excludedIds || [];
    var candidates = (pool.affixIds || []).map(function (id) {
      return Game.content.get('itemAffix', id);
    }).filter(function (def) {
      return def && excludedIds.indexOf(def.id) < 0 &&
        (!def.slots.length || def.slots.indexOf(base.slotId) >= 0);
    });
    var count = poolId === 'equipment.legendary' ? rarity.legendaryAffixCount : rarity.normalAffixCount;
    var familyCounts = {}, selected = [];
    while (selected.length < count && candidates.length) {
      var valid = candidates.filter(function (def) {
        return (familyCounts[def.family] || 0) < (pool.familyLimits[def.family] || Infinity);
      });
      if (!valid.length) break;
      addDecision(trace, {
        stage: 'affix-filter',
        key: (keyPrefix || 'item') + '.' + poolId + '.' + selected.length + '.filter',
        candidates: candidates.map(function (def) {
          return {
            id: def.id, family: def.family, weight: Number(def.weight) || 0,
            eligible: valid.indexOf(def) >= 0,
            excludedReason: valid.indexOf(def) >= 0 ? null : 'family-limit'
          };
        }),
        selected: null, reason: 'slot-and-family',
        values: { familyCounts: clone(familyCounts), familyLimits: clone(pool.familyLimits) }
      });
      var picked = weightedChoice(valid, random, function (def) { return def.weight; }, trace, {
        stage: poolId === 'equipment.legendary' ? 'legendary-affix' : 'normal-affix',
        key: (keyPrefix || 'item') + '.' + poolId + '.' + selected.length,
        idFor: function (def) { return def.id; },
        values: { familyCounts: clone(familyCounts), familyLimits: clone(pool.familyLimits) }
      });
      candidates.splice(candidates.indexOf(picked), 1);
      familyCounts[picked.family] = (familyCounts[picked.family] || 0) + 1;
      selected.push({
        instanceId: uid + ':' + (poolId === 'equipment.legendary' ? 'l' : 'a') + selected.length,
        definitionId: picked.id,
        values: { rolls: rollDefinition(picked, itemLevel, rarity, random, false, trace,
          (keyPrefix || 'item') + '.' + picked.id) }
      });
    }
    return selected;
  }

  function generateEquipmentInternal(context, trace, keyPrefix) {
    context = context || {};
    keyPrefix = keyPrefix || 'item';
    var seed = Number.isFinite(context.seed) ? Number(context.seed) >>> 0 : hashSeed([
      context.worldSeed || 0, context.sourceType || 'loot', context.sourceId || '',
      context.ordinal || 0, context.classId || ''
    ].join('|'));
    var random = typeof context.rng === 'function' ? context.rng : rngFor(seed);
    var classId = context.classId || Game.state && Game.state.player.classId || 'fighter';
    var slotId = chooseSlot(context, random, trace, keyPrefix);
    var bases = Game.content.all('itemBase').filter(function (def) {
      return def.slotId === slotId && (!def.classIds.length || def.classIds.indexOf(classId) >= 0);
    });
    var baseRoll = null;
    var base;
    if (context.baseId) {
      base = Game.content.get('itemBase', context.baseId);
      addDecision(trace, {
        stage: 'base', key: keyPrefix + '.base',
        candidates: bases.map(function (def) { return { id: def.id, eligible: def.id === context.baseId }; }),
        selected: base && base.id || context.baseId, reason: 'forced'
      });
    } else {
      baseRoll = random();
      base = bases[Math.floor(baseRoll * bases.length)];
      addDecision(trace, {
        stage: 'base', key: keyPrefix + '.base', roll: baseRoll, threshold: bases.length,
        candidates: bases.map(function (def) { return { id: def.id, weight: 1 }; }),
        selected: base && base.id, reason: 'uniform'
      });
    }
    if (!base || base.slotId !== slotId) throw new Error('[Loot] no usable base for ' + slotId);
    var itemLevel = Math.max(1, Math.round(context.itemLevel || context.ilvl || 1));
    var minimumRank = Game.util.clamp(context.minimumRank === undefined ?
      (context.rarMin === undefined ? 0 : context.rarMin) : context.minimumRank, 0, 4);
    var forcedRarity = context.rarityId || (context.rar !== undefined ? RARITY_IDS[context.rar] : null);
    var rarityId = forcedRarity || chooseRarity(context, random, minimumRank, trace, keyPrefix);
    if (forcedRarity) addDecision(trace, {
      stage: 'rarity', key: keyPrefix + '.rarity', selected: rarityId, reason: 'forced',
      values: { minimumRank: minimumRank, rarityLuck: Math.max(0, Number(context.rarityLuck) || 0) }
    });
    var rarity = Game.content.get('itemRarity', rarityId);
    var origin = Object.assign({
      sourceType: context.sourceType || 'loot', sourceId: context.sourceId || null,
      regionId: context.regionId || Game.state && Game.state.world.region || null,
      tier: Math.max(1, context.tier | 0 || 1), ordinal: Math.max(0, context.ordinal | 0),
      seed: seed, materialId: null
    }, context.origin || {});
    var materials = REGION_MATERIALS[origin.regionId] || [];
    var materialRoll = null;
    if (!origin.materialId) {
      materialRoll = random();
      origin.materialId = materials[Math.floor(materialRoll * Math.max(1, materials.length))] || null;
    }
    addDecision(trace, {
      stage: 'material', key: keyPrefix + '.material', roll: materialRoll,
      candidates: materials.map(function (id) { return { id: id, weight: 1 }; }),
      selected: origin.materialId, reason: context.origin && context.origin.materialId ? 'forced' : 'uniform'
    });
    var uid = context.uid || 'eq:' + ('00000000' + Game.util.fnv1a([
      seed, origin.sourceType, origin.sourceId, origin.ordinal, base.id, classId
    ].join('|'))).slice(-8);
    var implicitValues = rollDefinition(base, itemLevel, rarity, random, true, trace, keyPrefix + '.implicit');
    var item = {
      schemaVersion: 2, generationVersion: 1, uid: uid,
      baseId: base.id, classId: classId, itemLevel: itemLevel, rarityId: rarityId,
      contentFingerprint: Game.content.fingerprint(), origin: origin,
      implicitRolls: implicitValues.map(function (value, index) {
        return { definitionId: base.id + ':' + index, values: { value: value } };
      }),
      affixes: [], reforge: { count: 0, lockedAffixInstanceId: null }
    };
    item.affixes = chooseAffixes(base, rarity, itemLevel, random,
      'equipment.normal', uid, null, trace, keyPrefix);
    item.affixes = item.affixes.concat(chooseAffixes(base, rarity, itemLevel, random,
      'equipment.legendary', uid, null, trace, keyPrefix));
    addDecision(trace, {
      stage: 'item-complete', key: keyPrefix, selected: uid, reason: 'generated',
      values: { seed: seed, classId: classId, slotId: slotId, baseId: base.id,
        rarityId: rarityId, itemLevel: itemLevel, affixCount: item.affixes.length }
    });
    return Equipment.normalizeCompatibility(item);
  }

  var Loot = Game.loot = {
    RARITY_IDS: RARITY_IDS.slice(),
    defaultState: defaultLootState,
    normalizeState: normalizeLootState,
    generateEquipment: function (context) {
      return generateEquipmentInternal(context || {}, null, 'item');
    },
    inspectGeneration: function (context) {
      context = context || {};
      var trace = createTrace(context);
      var item = generateEquipmentInternal(context, trace, 'item');
      trace.seed = item.origin.seed;
      return { item: item, trace: trace };
    },
    plan: function (context, stateValue) {
      return planInternal(context, stateValue, null);
    },
    inspectPlan: function (context, stateValue) {
      context = context || {};
      var before = normalizeLootState(stateValue);
      var trace = createTrace(context, before);
      var plan = planInternal(context, stateValue, trace);
      trace.seed = plan.seed;
      trace.stateAfter = clone(plan.nextState);
      return { plan: plan, trace: trace };
    },
    commit: function (plan, opts) {
      if (!plan || !Game.state) return [];
      var before = {
        loot: clone(Game.state.inv.loot),
        items: Game.state.inv.items.slice(),
        equipped: clone(Game.state.inv.equipped),
        gold: Game.state.player.gold
      };
      try {
        Game.state.inv.loot = normalizeLootState(plan.nextState);
        return Game.inv.addItems(plan.items || [], opts || { source: plan.sourceType });
      } catch (error) {
        Game.state.inv.loot = before.loot;
        Game.state.inv.items = before.items;
        Game.state.inv.equipped = before.equipped;
        Game.state.player.gold = before.gold;
        throw error;
      }
    },
    accept: function (plan) {
      if (!plan || !Game.state) return [];
      Game.state.inv.loot = normalizeLootState(plan.nextState);
      return (plan.items || []).slice();
    }
  };

  function planInternal(context, stateValue, trace) {
      context = context || {};
      var state = normalizeLootState(stateValue);
      var table = Game.content.get('lootTable', 'equipment.standard');
      var sourceType = context.sourceType || 'regular';
      var sourceKey = sourceType + ':' + (context.sourceId || sourceType);
      var ordinal = state.sourceOrdinals[sourceKey] || 0;
      state.sourceOrdinals[sourceKey] = ordinal + 1;
      var seed = hashSeed([
        context.worldSeed || Game.state && Game.state.world.worldSeed || 0,
        context.expeditionIndex || 0, sourceKey, ordinal,
        context.classId || Game.state && Game.state.player.classId || '',
        Game.content.fingerprint()
      ].join('|'));
      var random = rngFor(seed);
      var baseChance = Number(table.equipmentChance[sourceType]);
      if (!Number.isFinite(baseChance)) baseChance = 0;
      var dropMultiplier = Math.max(0, Number(context.dropMultiplier) || 1);
      var chance = 1 - Math.pow(1 - baseChance, dropMultiplier);
      var eligible = context.eligible !== false && baseChance > 0 && baseChance < 1;
      var dropRoll = null;
      var chanceHit = false;
      if (context.forceDrop !== true) {
        dropRoll = random();
        chanceHit = dropRoll < chance;
      }
      var pityHit = eligible && state.eligibleMisses >= table.equipmentPity - 1;
      var dropped = context.forceDrop === true || chanceHit || pityHit;
      addDecision(trace, {
        stage: 'drop', key: sourceKey + ':' + ordinal, roll: dropRoll, threshold: chance,
        candidates: [{ id: 'drop', weight: chance }, { id: 'miss', weight: Math.max(0, 1 - chance) }],
        selected: dropped ? 'drop' : 'miss',
        reason: context.forceDrop === true ? 'forced' : chanceHit ? 'chance' : pityHit ? 'equipment-pity' : 'miss',
        values: { baseChance: baseChance, dropMultiplier: dropMultiplier, effectiveChance: chance,
          eligible: eligible, eligibleMissesBefore: state.eligibleMisses,
          equipmentPity: table.equipmentPity }
      });
      if (eligible) state.eligibleMisses = dropped ? 0 : state.eligibleMisses + 1;
      var items = [];
      if (dropped) {
        var sourceMinimum = ['boss', 'rareChest', 'mimic', 'expedition'].indexOf(sourceType) >= 0
          ? 2 : 0;
        var minRank = Math.max(sourceMinimum, context.minimumRank | 0);
        if (state.dropsSinceLegendary >= table.legendaryPity - 1) minRank = 4;
        else if (state.dropsSinceEpic >= table.epicPity - 1) minRank = Math.max(minRank, 3);
        addDecision(trace, {
          stage: 'pity', key: sourceKey + ':' + ordinal + '.rarity-floor', selected: minRank,
          reason: state.dropsSinceLegendary >= table.legendaryPity - 1 ? 'legendary-pity' :
            state.dropsSinceEpic >= table.epicPity - 1 ? 'epic-pity' :
              sourceMinimum ? 'source-minimum' : 'none',
          values: { sourceMinimum: sourceMinimum, requestedMinimum: context.minimumRank | 0,
            dropsSinceEpic: state.dropsSinceEpic, dropsSinceLegendary: state.dropsSinceLegendary,
            epicPity: table.epicPity, legendaryPity: table.legendaryPity }
        });
        var playerLevel = Math.max(1, context.playerLevel || context.itemLevel ||
          Game.state && Game.state.player.level || 1);
        var sourceBonus = sourceType === 'boss' ? 2 :
          ['rare', 'guardian', 'chest', 'rareChest', 'mimic', 'expedition', 'nestShallow', 'nestDeep']
            .indexOf(sourceType) >= 0 ? 1 : 0;
        var levelDelta = sourceBonus ? sourceBonus :
          weightedChoice([-1, 0, 1], random, function (value) {
            return value === 0 ? 50 : 25;
          });
        var itemLevel = context.itemLevel === undefined
          ? Math.max(1, playerLevel + levelDelta)
          : Math.max(1, context.itemLevel | 0);
        var requests = [{ minimumRank: minRank }];
        if (sourceType === 'boss' && random() < .35) requests.push({ minimumRank: 2 });
        if (sourceType === 'boss' && context.firstKill) requests.push({ minimumRank: 3 });
        requests.forEach(function (request, dropIndex) {
          var item = generateEquipmentInternal(Object.assign({}, context, request, {
            seed: hashSeed([seed, 'item', dropIndex, Game.content.fingerprint()].join('|')),
            itemLevel: itemLevel, ordinal: ordinal * 3 + dropIndex,
            slotDrought: state.slotDrought
          }), trace, 'item.' + dropIndex);
          items.push(item);
          var rank = rarityRank(item);
          state.dropsSinceEpic = rank >= 3 ? 0 : state.dropsSinceEpic + 1;
          state.dropsSinceLegendary = rank >= 4 ? 0 : state.dropsSinceLegendary + 1;
          SLOT_IDS.forEach(function (slot) {
            state.slotDrought[slot] = slot === slotOf(item) ? 0 : state.slotDrought[slot] + 1;
          });
        });
      }
      return { seed: seed, sourceType: sourceType, ordinal: ordinal, items: items, nextState: state };
  }

  Game.reforge = {
    quote: function (item, lockId) {
      if (!Equipment.isV2(item)) return { ok: false, reason: 'legacy-item' };
      if (encounterActive()) return { ok: false, reason: 'encounter-active' };
      if (!Game.state || !Game.state.world || Game.state.world.mode !== 'rest') {
        return { ok: false, reason: 'not-at-camp' };
      }
      var normal = item.affixes.filter(function (rolled) {
        var def = Game.content.get('itemAffix', rolled.definitionId);
        return def && def.kind === 'normal';
      });
      if (lockId && !normal.some(function (x) { return x.instanceId === lockId; })) {
        return { ok: false, reason: 'invalid-lock' };
      }
      if (!normal.length) return { ok: false, reason: 'no-affixes' };
      if (lockId && normal.length === 1) return { ok: false, reason: 'nothing-to-reroll' };
      var profile = Game.content.get('reforgeProfile', 'equipment.standard');
      var n = Math.max(0, item.reforge && item.reforge.count | 0);
      var factor = profile.goldBaseFactor + profile.goldLinearFactor * n + profile.goldQuadraticFactor * n * n;
      var gold = Math.ceil(Game.F.gearBoxPrice(levelOf(item)) * factor * (lockId ? 1.5 : 1));
      var materialCount = Math.min(profile.materialMax, 1 + Math.floor(n / 2)) + (lockId ? 1 : 0);
      return {
        ok: true, gold: gold, materialId: item.origin && item.origin.materialId,
        materialCount: materialCount, lockId: lockId || null
      };
    },
    execute: function (uid, lockId) {
      var item = typeof uid === 'string' ? Game.inv.byUid(uid) : uid;
      var quote = Game.reforge.quote(item, lockId);
      if (!quote.ok) return quote;
      if (Game.state.player.gold < quote.gold) return { ok: false, reason: 'gold' };
      if (quote.materialId && Game.inv.materialCount(quote.materialId) < quote.materialCount) {
        return { ok: false, reason: 'materials', materialId: quote.materialId };
      }
      var before = clone(item);
      var goldBefore = Game.state.player.gold;
      var materialsBefore = clone(Game.state.inv.materials);
      var normal = item.affixes.filter(function (rolled) {
        var def = Game.content.get('itemAffix', rolled.definitionId);
        return def && def.kind === 'normal';
      });
      var legendaryRows = item.affixes.filter(function (rolled) {
        var def = Game.content.get('itemAffix', rolled.definitionId);
        return def && def.kind === 'legendary';
      });
      var locked = normal.filter(function (rolled) { return rolled.instanceId === lockId; });
      var rarity = Game.content.get('itemRarity', rarityIdOf(item));
      var base = Game.content.get('itemBase', item.baseId);
      var count = Math.max(0, item.reforge.count | 0) + 1;
      var random = rngFor(hashSeed([
        Game.state.world.worldSeed, item.uid, count
      ].join('|')));
      var rerolled = null;
      var desiredRarity = Object.assign({}, rarity, {
        normalAffixCount: rarity.normalAffixCount - locked.length
      });
      var excluded = locked.map(function (rolled) { return rolled.definitionId; });
      for (var attempt = 0; attempt < 16; attempt++) {
        rerolled = chooseAffixes(base, desiredRarity, levelOf(item), random,
          'equipment.normal', item.uid + ':r' + count + ':' + attempt, excluded);
        if (JSON.stringify(normal.filter(function (rolled) {
          return rolled.instanceId !== lockId;
        }).map(function (rolled) {
          return { definitionId: rolled.definitionId, values: rolled.values };
        })) !== JSON.stringify(rerolled.map(function (rolled) {
          return { definitionId: rolled.definitionId, values: rolled.values };
        }))) break;
      }
      item.affixes = locked.concat(rerolled, legendaryRows);
      item.reforge = { count: count, lockedAffixInstanceId: lockId || null };
      var same = JSON.stringify(before.affixes) === JSON.stringify(item.affixes);
      if (same) { Object.assign(item, before); return { ok: false, reason: 'unchanged' }; }
      try {
        Game.state.player.gold -= quote.gold;
        if (quote.materialId) {
          Game.state.inv.materials[quote.materialId] =
            Game.inv.materialCount(quote.materialId) - quote.materialCount;
        }
        Game.player.recalc();
        if (Game.world && Game.world.hero) Game.world.syncHeroStats();
        Game.bus.emit('gold:changed', { delta: -quote.gold, total: Game.state.player.gold });
        if (quote.materialId) Game.bus.emit('material:changed', {
          id: quote.materialId, delta: -quote.materialCount,
          total: Game.state.inv.materials[quote.materialId]
        });
        Game.bus.emit('item:reforged', { item: item, before: before, quote: quote });
        return { ok: true, item: item, quote: quote };
      } catch (error) {
        Object.assign(item, before);
        Game.state.player.gold = goldBefore;
        Game.state.inv.materials = materialsBefore;
        return { ok: false, reason: 'rollback', error: String(error && error.message || error) };
      }
    }
  };

  function formalClass(classId) {
    return Game.content.get('class', classId) || Game.content.all('class')[0] || null;
  }

  function classBaseValues(classDef, level) {
    classDef = classDef || {};
    var base = classDef.baseStats || {};
    var growth = classDef.growth || {};
    var g = Math.max(0, (level | 0) - 1);
    function grow(id, fallback, growthId) {
      return Number(base[id] === undefined ? fallback : base[id]) *
        Math.pow(Number(growth[growthId || id]) || 1, g);
    }
    var maxHp = Math.max(1, Math.round(grow('maxHp', 100)));
    var armor = Math.max(0, Math.round(grow('armor', 4)));
    var ward = Math.max(0, Math.round(grow('ward', armor * .65)));
    var power = Math.max(0, Math.round(grow('power', 10)));
    var speed = Number(base.speed === undefined ? 10 : base.speed) +
      (Number(growth.speedPerLevel) || .25) * g;
    var primary = classDef.primaryPowerStat || 'physicalPower';
    var values = {
      maxHp: maxHp, armor: armor, ward: ward,
      physicalPower: power, magicPower: power, accuracy: .94,
      gcdSpeed: 1 + Math.max(0, speed - 10) * .012,
      castSpeed: 1 + Math.max(0, speed - 10) * .009,
      autoAttackSpeed: 1 + Math.max(0, speed - 10) * .018,
      cooldownRate: 1, moveSpeed: 56, range: Number(base.range) || 24,
      critChance: Math.max(0, Number(base.critChance) || .05) +
        (Number(growth.critChancePerLevel) || .001) * g,
      critMultiplier: Math.max(1, Number(base.critMultiplier) || 1.5) +
        (Number(growth.critMultiplierPerLevel) || .01) * g,
      critAvoidance: 0, dodgeChance: 0,
      healingPower: power * (classDef.id === 'cleric' ? 1.1 : 1),
      shieldPower: maxHp, lifesteal: 0, statusPotency: 1,
      tenacity: 0, interruptPower: 1,
      threatMultiplier: classDef.id === 'fighter' ? 2.2 : 1,
      resourceRegen: 1, healthRegenPct: 0,
      damageDoneMultiplier: 1, damageReduction: 0,
      healingReceivedMultiplier: 1, expMultiplier: 1,
      goldMultiplier: 1, dropMultiplier: 1, rarityLuck: 0
    };
    values[primary] = power;
    return values;
  }

  function applyModifiers(baseValues, modifiers) {
    var values = clone(baseValues);
    ['equipmentFlat', 'otherFlat', 'addPct', 'multiply', 'status', 'override'].forEach(function (phase) {
      var pct = {};
      modifiers.filter(function (mod) { return (mod.phase || 'otherFlat') === phase; })
        .slice().sort(function (a, b) {
          return String(a.sourceId || '').localeCompare(String(b.sourceId || '')) ||
            String(a.stat || '').localeCompare(String(b.stat || ''));
        }).forEach(function (mod) {
          var current = Number(values[mod.stat]) || 0;
          var value = Number(mod.value) || 0;
          if (mod.operation === 'add') values[mod.stat] = current + value;
          else if (mod.operation === 'addPct') pct[mod.stat] = (pct[mod.stat] || 0) + value;
          else if (mod.operation === 'multiply') values[mod.stat] = current * value;
          else if (mod.operation === 'set') values[mod.stat] = value;
        });
      Object.keys(pct).sort().forEach(function (stat) {
        values[stat] = (Number(values[stat]) || 0) * (1 + pct[stat]);
      });
    });
    Object.keys(values).forEach(function (statId) {
      var statDef = Game.content.get('stat', statId);
      if (!statDef) return;
      values[statId] = Math.max(statDef.min, values[statId]);
      if (statDef.max !== null && statDef.max !== undefined) {
        values[statId] = Math.min(statDef.max, values[statId]);
      }
    });
    values.maxHp = Math.max(1, Math.round(values.maxHp));
    return values;
  }

  function permanentModifiers(record) {
    var out = [];
    Object.keys(record.permanentUpgrades || {}).sort().forEach(function (id) {
      var count = Math.max(0, record.permanentUpgrades[id] | 0);
      if (!count) return;
      var def = Game.reg.get('shopItem', id);
      if (!def && /^commission_/.test(id)) {
        out.push({ sourceId: 'permanent:' + id + ':hp', stat: 'maxHp', phase: 'addPct', operation: 'addPct', value: .01 * count });
        out.push({ sourceId: 'permanent:' + id + ':power', stat: 'classPower', phase: 'addPct', operation: 'addPct', value: .01 * count });
        return;
      }
      if (!def || !def.stat) return;
      var stat = def.stat === 'atk' ? 'classPower' : def.stat === 'hp' ? 'maxHp' :
        def.stat === 'goldMul' ? 'goldMultiplier' :
        def.stat === 'expMul' ? 'expMultiplier' : def.stat;
      out.push({
        sourceId: 'permanent:' + id, stat: stat, phase: 'addPct',
        operation: stat === 'maxHp' || stat === 'classPower' ? 'addPct' : 'add',
        value: (Number(def.pct) || 0) * count
      });
    });
    return out;
  }

  function expandClassPowerModifiers(modifiers, classId) {
    var out = [];
    modifiers.forEach(function (modifier) {
      expandStat(modifier.stat, classId).forEach(function (statId) {
        out.push(Object.assign({}, modifier, { stat: statId }));
      });
    });
    return out;
  }

  function installClassProjections() {
    Game.content.all('class').forEach(function (classDef) {
      Game.reg.register('class', Game.builds.classProjection(classDef.id));
    });
  }

  Game.builds = {
    installClassProjections: installClassProjections,
    classDefinition: formalClass,
    classProjection: function (classId) {
      var def = formalClass(classId);
      if (!def) return null;
      var base = def.baseStats || {}, growth = def.growth || {};
      return Object.assign({}, def, {
        base: {
          hp: base.maxHp, atk: base.power, def: base.armor, spd: base.speed,
          crit: base.critChance, critDmg: base.critMultiplier
        },
        grow: { hp: growth.maxHp, atk: growth.power, def: growth.armor },
        range: base.range, projectile: def.id === 'mage' ? 'bolt' :
          def.id === 'ranger' ? 'arrow' : null,
        weapon: def.weaponAppearance,
        evalWeights: clone(def.evaluationWeights || {}),
        skills: (Game.content.get('talentTree', def.talentTreeId) || {}).talentIds || [],
        traits: (def.tags || []).slice(), statDots: clone(def.statDots || {}),
        extra: def.id === 'cleric' ? { healPow: .1 } : {}
      });
    },
    baseValues: function (classId, level) {
      return classBaseValues(formalClass(classId), level);
    },
    applyModifiers: applyModifiers,
    compileActorRecord: function (record, loadout) {
      record = record || {};
      var classDef = formalClass(record.classId);
      if (!classDef) throw new Error('[Builds] missing class ' + record.classId);
      if (loadout === undefined) loadout = record.loadout && record.loadout.equipment || {};
      var baseValues = classBaseValues(classDef, Math.max(1, record.level | 0));
      var modifiers = [], effects = [], uniqueEffects = {};
      SLOT_IDS.forEach(function (slot) {
        var ref = loadout[slot];
        var item = typeof ref === 'string' ? Game.inv && Game.inv.byUid(ref) : ref;
        if (!item || item.classId && item.classId !== record.classId) return;
        var compiled = Equipment.compileItem(item, { classId: record.classId });
        modifiers = modifiers.concat(compiled.modifiers);
        compiled.effects.forEach(function (effect) {
          var unique = effect.profile.uniqueEquipped !== false;
          if (unique && uniqueEffects[effect.affixId]) return;
          uniqueEffects[effect.affixId] = true;
          effects.push(effect);
        });
      });
      Object.keys(record.talentRanks || {}).sort().forEach(function (talentId) {
        var talent = Game.content.get('talent', talentId);
        if (!talent || talent.classId !== record.classId) return;
        var rank = Game.util.clamp(record.talentRanks[talentId] | 0, 0, talent.maxRank || 0);
        (talent.modifiers || []).forEach(function (modifier, index) {
          modifiers.push({
            sourceId: 'talent:' + talentId + ':' + index,
            stat: modifier.stat, phase: modifier.phase || 'addPct',
            operation: modifier.operation || 'addPct',
            value: Number(modifier.perRank || modifier.value || 0) * rank
          });
        });
      });
      modifiers = modifiers.concat(permanentModifiers(record));
      modifiers = expandClassPowerModifiers(modifiers, record.classId);
      return {
        classId: record.classId, baseValues: baseValues,
        values: applyModifiers(baseValues, modifiers), modifiers: modifiers,
        equipmentEffects: effects,
        abilityGrantIds: (classDef.baseAbilityGrantIds || []).slice(),
        traitGrantIds: (classDef.traitIds || []).slice()
      };
    },
    projectDerived: function (compiled) {
      var values = compiled.values;
      var classDef = formalClass(compiled.classId);
      var power = values[classDef.primaryPowerStat] || 0;
      return {
        maxHp: values.maxHp, atk: power, def: values.armor, ward: values.ward,
        spd: +(10 + (values.autoAttackSpeed - 1) / .018).toFixed(2),
        crit: values.critChance, critDmg: values.critMultiplier,
        goldMul: values.goldMultiplier, expMul: values.expMultiplier,
        dropMul: values.dropMultiplier, rarityLuck: values.rarityLuck,
        damageDoneMultiplier: values.damageDoneMultiplier,
        damageReduction: values.damageReduction,
        healingReceivedMultiplier: values.healingReceivedMultiplier,
        dodge: values.dodgeChance, lifesteal: values.lifesteal,
        cdr: Math.max(0, values.cooldownRate - 1),
        healPow: power > 0 ? values.healingPower / power : 1,
        regen: values.healthRegenPct, range: values.range,
        projectile: classDef.id === 'mage' ? 'bolt' : classDef.id === 'ranger' ? 'arrow' : null
      };
    }
  };

  if (Game.content.isFinalized()) installClassProjections();

  function saturatingMultiply(left, right) {
    left = Number(left) || 0; right = Number(right) || 0;
    if (!left || !right) return { value: 0, saturated: false };
    var sign = Math.sign(left) * Math.sign(right);
    var log = Math.log(Math.abs(left)) + Math.log(Math.abs(right));
    if (!Number.isFinite(log) || log >= Math.log(MAX_VALUE)) {
      return { value: sign * MAX_VALUE, saturated: true };
    }
    return { value: left * right, saturated: false };
  }
  function saturatingPow(base, exponent) {
    base = Math.max(1, Number(base) || 1);
    exponent = Math.max(0, Number(exponent) || 0);
    var log = Math.log(base) * exponent;
    if (!Number.isFinite(log) || log >= Math.log(MAX_VALUE)) {
      return { value: MAX_VALUE, saturated: true };
    }
    return { value: Math.pow(base, exponent), saturated: false };
  }
  Game.combatMath = {
    MAX_VALUE: MAX_VALUE,
    saturatingMultiply: saturatingMultiply,
    saturatingPow: saturatingPow,
    resolveCrit: function (spec) {
      spec = spec || {};
      var chance = Math.max(0, (Number(spec.critChance) || 0) +
        (Number(spec.critChanceBonus) || 0) - (Number(spec.critAvoidance) || 0));
      var roll = typeof spec.random === 'function' ? spec.random() : 0;
      var tier = 0;
      if (spec.canCrit !== false) {
        if (spec.healing) tier = roll < Math.min(1, chance) ? 1 : 0;
        else {
          var guaranteed = Math.floor(chance);
          tier = guaranteed + (roll + 1e-12 < chance - guaranteed ? 1 : 0);
        }
      }
      var multiplier = spec.healing ? 1.5 : Math.max(1, Number(spec.critMultiplier) || 1.5);
      var applied = saturatingPow(multiplier, tier);
      return {
        isCritical: tier > 0, critTier: tier, critChance: chance,
        critMultiplier: multiplier, critMultiplierApplied: applied.value,
        numericSaturated: applied.saturated, roll: roll
      };
    },
    mitigate: function (raw, defense, tier) {
      raw = Math.max(0, Number(raw) || 0);
      defense = Math.max(0, Number(defense) || 0);
      tier = Math.max(1, Number(tier) || 1);
      var constant = 16 * Math.pow(1.9, tier - 1);
      var reduction = Math.min(.8, defense / Math.max(1e-12, defense + constant));
      return { amount: raw * (1 - reduction), reduction: reduction, constant: constant };
    }
  };
})();
