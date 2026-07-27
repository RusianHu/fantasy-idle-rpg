/* ============================================================
 * systems/expedition.js — 稳定世界上的动态远征层与区域委托
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus, reg = Game.reg;

  function rs(rid) {
    return Game.exploration.regionState(rid || Game.state.world.region);
  }

  function generate(rid, index) {
    var region = reg.get('region', rid);
    var cfg = region.exploration;
    var seed = U.strSeed((Game.state.world.worldSeed >>> 0) + ':' + rid + ':expedition:' + index);
    var rng = U.seededRng(seed);
    var anomalies = (cfg.anomalies || []).slice();
    var selected = [];
    var count = 1 + (rng() > 0.52 ? 1 : 0);
    while (selected.length < count && anomalies.length) {
      selected.push(anomalies.splice(Math.floor(rng() * anomalies.length), 1)[0]);
    }
    var eco = cfg.ecology.map(function (e) { return e.id; });
    var activeEcology = [];
    if (eco.length) activeEcology.push(eco[Math.floor(rng() * eco.length)]);
    if (eco.length > 1 && rng() > 0.72) {
      var other = eco.filter(function (id) { return activeEcology.indexOf(id) < 0; });
      if (other.length) activeEcology.push(other[Math.floor(rng() * other.length)]);
    }
    var threatAffixes = {};
    var layout = Game.world && Game.world.layout;
    var threats = layout && layout.threats || [];
    var affixes = cfg.affixes || ['alert', 'sturdy', 'swift'];
    for (var i = 0; i < threats.length; i++) {
      threatAffixes[threats[i].id] = affixes[Math.floor(rng() * affixes.length)];
    }
    return {
      v: 1,
      index: index,
      seed: seed,
      startedAt: Game.state.world.worldTime || 0,
      anomalies: selected,
      activeEcology: activeEcology,
      threatAffixes: threatAffixes,
      curioEffects: {},
      choices: {},
      finished: false
    };
  }

  function modifiers(exp) {
    var out = { move: 1, danger: 1, gather: 1, exp: 1, drop: 1, vision: 1 };
    if (!exp) return out;
    for (var i = 0; i < exp.anomalies.length; i++) {
      var id = exp.anomalies[i];
      if (id === 'dense_fog') { out.vision *= 0.85; out.drop *= 1.08; }
      else if (id === 'rich_veins') { out.gather *= 1.25; out.danger *= 1.08; }
      else if (id === 'restless') { out.danger *= 1.18; out.exp *= 1.12; }
      else if (id === 'tailwind') { out.move *= 1.12; out.drop *= 0.96; }
      else if (id === 'miasma_tide') { out.danger *= 1.25; out.drop *= 1.16; }
    }
    for (var key in exp.curioEffects) {
      var effect = exp.curioEffects[key];
      if (effect === 'scout') out.vision *= 1.18;
      else if (effect === 'fortune') out.drop *= 1.16;
      else if (effect === 'ward') out.danger *= 0.82;
      else if (effect === 'haste') out.move *= 1.12;
    }
    return out;
  }

  function autoChoice(choices) {
    var strategy = Game.state.settings.expeditionStrategy || 'balanced';
    var order = strategy === 'safe'
      ? ['ward', 'scout', 'haste', 'fortune']
      : (strategy === 'loot'
        ? ['fortune', 'haste', 'scout', 'ward']
        : ['scout', 'ward', 'fortune', 'haste']);
    for (var i = 0; i < order.length; i++) if (choices.indexOf(order[i]) >= 0) return order[i];
    return choices[0];
  }

  function materialCost(region, indexes, scale) {
    var resources = region.exploration.resources;
    var costs = {};
    for (var i = 0; i < indexes.length; i++) {
      var def = resources[indexes[i] % resources.length];
      costs[def.material] = Math.max(1, Math.round((2 + i) * scale));
    }
    return costs;
  }

  var X = Game.expedition = {
    start: function (rid) {
      rid = rid || Game.state.world.region;
      var state = rs(rid);
      if (state.expedition && !state.expedition.finished) return state.expedition;
      state.expedition = generate(rid, state.expeditionIndex);
      bus.emit('expedition:started', {
        rid: rid, index: state.expeditionIndex, expedition: state.expedition
      });
      return state.expedition;
    },

    finish: function (reason, rid) {
      rid = rid || Game.state.world.region;
      var state = rs(rid);
      var current = state.expedition || X.start(rid);
      if (current.finished) return false;
      current.finished = true;
      current.finishedAt = Game.state.world.worldTime || 0;
      current.reason = reason || 'ended';
      state.expeditionIndex++;
      bus.emit('expedition:finished', {
        rid: rid, index: current.index, reason: current.reason
      });
      // 下一轮只在当前远征结算后生成，探索期间绝不重排。
      state.expedition = generate(rid, state.expeditionIndex);
      bus.emit('expedition:started', {
        rid: rid, index: state.expeditionIndex, expedition: state.expedition
      });
      return true;
    },

    current: function (rid) {
      rid = rid || Game.state.world.region;
      var state = rs(rid);
      return state.expedition && !state.expedition.finished ? state.expedition : X.start(rid);
    },

    currentModifier: function (rid) {
      return modifiers(X.current(rid));
    },

    isEcologyActive: function (id, rid) {
      return X.current(rid).activeEcology.indexOf(id) >= 0;
    },

    threatAffix: function (threatId, rid) {
      return X.current(rid).threatAffixes[threatId] || 'alert';
    },

    offerCurio: function (id, entity) {
      var rid = Game.state.world.region;
      var state = rs(rid), exp = X.current(rid);
      if (exp.choices[id]) return exp.choices[id];
      var choices = entity && entity.choices && entity.choices.length ? entity.choices : ['scout', 'fortune'];
      if (Game.world && Game.world.controlMode() === 'manual' &&
          Game.ui && Game.ui.modals && Game.ui.modals.curioChoice) {
        Game.ui.modals.curioChoice(entity, choices, function (choice) {
          X.chooseCurio(id, choice, choices);
        });
        return null;
      }
      return X.chooseCurio(id, autoChoice(choices), choices);
    },

    chooseCurio: function (id, choice, choices) {
      var rid = Game.state.world.region;
      var state = rs(rid), exp = X.current(rid);
      choices = choices || ['scout', 'fortune'];
      if (exp.choices[id] || choices.indexOf(choice) < 0) return false;
      exp.choices[id] = choice;
      exp.curioEffects[id] = choice;
      state.discovered.curioChoices[id] = choice;
      bus.emit('curio:chosen', { rid: rid, id: id, choice: choice });
      return choice;
    },

    commissionDefs: function (rid) {
      rid = rid || Game.state.world.region;
      var region = reg.get('region', rid);
      var tier = Game.State.regionTier(rid);
      return region.exploration.commissions.map(function (def, index) {
        return {
          id: def.id,
          reward: def.reward,
          cap: def.cap || null,
          costs: materialCost(region, def.costs, 1 + tier * 0.2 + index * 0.15)
        };
      });
    },

    commission: function (id, rid) {
      rid = rid || Game.state.world.region;
      var defs = X.commissionDefs(rid), def = null;
      for (var i = 0; i < defs.length; i++) if (defs[i].id === id) { def = defs[i]; break; }
      if (!def) return { ok: false, reason: 'missing' };
      var materials = Game.state.inv.materials;
      for (var mat in def.costs) {
        if ((materials[mat] || 0) < def.costs[mat]) return { ok: false, reason: 'cost', material: mat };
      }
      var permKey = 'commission_' + rid;
      if (def.reward === 'perm' && (Game.state.player.perms[permKey] || 0) >= def.cap) {
        return { ok: false, reason: 'cap' };
      }
      for (mat in def.costs) materials[mat] -= def.costs[mat];
      var tier = Game.State.regionTier(rid);
      if (def.reward === 'potions') {
        Game.inv.addPotion('potion_small', 2 + Math.floor(tier / 3));
      } else if (def.reward === 'gold') {
        Game.player.addGold(Math.round(180 * Math.pow(1.8, tier - 1)));
      } else if (def.reward === 'gear') {
        Game.inv.addItems([Game.inv.genLoot(Game.state.player.level, { rarMin: 2, luck: 1.6 })], {
          source: 'commission'
        });
      } else if (def.reward === 'perm') {
        Game.state.player.perms[permKey] = (Game.state.player.perms[permKey] || 0) + 1;
        Game.player.recalc();
      }
      bus.emit('commission:completed', { rid: rid, id: id, reward: def.reward });
      return { ok: true, reward: def.reward };
    }
  };
})();
