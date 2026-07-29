/* ============================================================
 * systems/items.js — 注册表驱动的统一物品使用接口
 *
 * Game.items.use(category, id, opts)
 *   校验库存/角色状态/冷却 → 执行效果 → 扣减 → 写共享冷却
 *   → item:used。首发效果仅 heal；后续食物、卷轴只需注册 itemUse
 *   并在 handlers 中追加效果处理器。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  function hero() {
    return Game.world && Game.world.hero;
  }

  function countFor(category, id) {
    if (!Game.state || !Game.state.inv) return 0;
    var bucket = Game.state.inv[category + 's'] || Game.state.inv[category];
    return bucket && bucket[id] || 0;
  }

  function changeCount(category, id, delta) {
    var bucket = Game.state.inv[category + 's'] || Game.state.inv[category];
    if (!bucket) return false;
    bucket[id] = Math.max(0, (bucket[id] || 0) + delta);
    return true;
  }

  function disabledReason(h) {
    if (!Game.state || !Game.state.player || !h) return 'not-ready';
    var snapshot = Game.units && Game.units.vitals(h);
    if ((snapshot ? !snapshot.alive : Game.state.player.hp <= 0) || h.state === 'dead') return 'dead';
    if (Game.entryState !== undefined && Game.entryState !== 'active') return 'busy';
    if (Game.transitions && Game.transitions.isActive()) return 'busy';
    if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return 'busy';
    var blocked = {
      recover: true, entrance: true, warpOut: true, warpIn: true,
      ending: true
    };
    return blocked[h.state] ? 'busy' : null;
  }

  function healHandler(def) {
    var d = Game.player.derived();
    var snapshot = Game.units && Game.units.playerSnapshot();
    var hp = snapshot ? snapshot.hp : Game.state.player.hp;
    var maxHp = snapshot ? snapshot.maxHp : d.maxHp;
    if (hp >= maxHp - 0.001) return { ok: false, reason: 'full' };
    var pct = F.potionHeal[def.ref || def.id];
    if (!(pct > 0)) return { ok: false, reason: 'unsupported' };
    var before = hp;
    var planned = Math.round(maxHp * pct * (d.healPow || 1));
    var healed = Game.player.heal(planned, { raw: true, source: 'item' });
    return {
      ok: true,
      effect: {
        kind: 'heal',
        amount: Math.max(0, Math.round(healed - before)),
        requested: planned
      }
    };
  }
  healHandler.describe = function (def) {
    return {
      key: 'item.healDesc',
      params: { p: Math.round((F.potionHeal[def.ref || def.id] || 0) * 100) }
    };
  };

  var handlers = {
    heal: healHandler
  };

  var Items = Game.items = {
    handlers: handlers,

    count: countFor,

    describe: function (def) {
      var handler = def && handlers[def.effect];
      return handler && handler.describe
        ? handler.describe(def)
        : { key: def && def.descKey || 'item.usableDesc', params: {} };
    },

    cdLeft: function (group) {
      var h = hero();
      if (!h || !group) return 0;
      var grouped = h.itemCd && h.itemCd[group] || 0;
      if (group === 'potion') grouped = Math.max(grouped, h.potionCd || 0);
      return Math.max(0, grouped);
    },

    update: function (dt) {
      var h = hero();
      if (!h) return;
      h.itemCd = h.itemCd || {};
      for (var group in h.itemCd) {
        h.itemCd[group] = Math.max(0, h.itemCd[group] - dt);
      }
      h.potionCd = h.itemCd.potion || 0;
    },

    use: function (category, id, opts) {
      opts = opts || {};
      var def = reg.get('itemUse', id);
      if (!def || def.category !== category) {
        return { ok: false, reason: 'missing', category: category, id: id };
      }
      if (countFor(category, def.ref || id) <= 0) {
        return { ok: false, reason: 'empty', category: category, id: id };
      }
      var h = hero();
      var stateReason = disabledReason(h);
      if (stateReason) return { ok: false, reason: stateReason, category: category, id: id };
      var group = def.cdGroup || null;
      var left = Items.cdLeft(group);
      if (left > 0) {
        return { ok: false, reason: 'cooldown', left: left, group: group, category: category, id: id };
      }
      var handler = handlers[def.effect];
      if (!handler) return { ok: false, reason: 'unsupported', category: category, id: id };

      var result = handler(def, opts);
      if (!result || !result.ok) {
        return result || { ok: false, reason: 'failed', category: category, id: id };
      }
      changeCount(category, def.ref || id, -1);
      if (group) {
        h.itemCd = h.itemCd || {};
        h.itemCd[group] = group === 'potion' ? F.BAL.potionCd : (def.cooldown || 0);
        if (group === 'potion') h.potionCd = h.itemCd[group];
      }

      var payload = {
        category: category,
        id: id,
        source: opts.source || 'manual',
        effect: result.effect
      };
      if (category === 'potion') {
        Game.state.meta.stats.potions++;
        bus.emit('potion:used', {
          pid: id,
          heal: result.effect.amount,
          source: payload.source
        });
      }
      bus.emit('item:used', payload);

      if (Game.fx && result.effect.kind === 'heal') {
        if (U.motionEnabled()) Game.fx.heal(h.x, h.y - 10);
        Game.fx.floatText(
          h.x, h.y - h.spriteH - 4,
          '+' + Game.i18n.fmtNum(result.effect.amount),
          { color: '#7ef07e' }
        );
      }
      return {
        ok: true,
        category: category,
        id: id,
        source: payload.source,
        effect: result.effect,
        cdGroup: group
      };
    }
  };
})();
