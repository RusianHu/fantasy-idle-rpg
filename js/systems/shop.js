/* ============================================================
 * systems/shop.js — 商店交易（金币 + 魔晶石双货币闭环）
 * 产出：金币=击杀/出售/离线；魔晶石=Boss 首杀/成就/分解传说。
 * 消耗：药水、装备补给（金币）；稀有装备箱、永久强化（魔晶石）。
 * 地点/目录权限由 Game.trade 统一解析，UI 与 buy() 均不得绕过。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  var Shop = Game.shop = {
    /** 当前交易地点实际提供的条目。 */
    offers: function (context) {
      context = context || Game.trade.current();
      var all = reg.all('shopItem');
      var out = [];
      for (var i = 0; i < all.length; i++) {
        if (Game.trade.allows(all[i].catalogs, context)) out.push(all[i]);
      }
      return out;
    },

    availability: function (def, context) {
      context = context || Game.trade.current();
      if (!def) return { ok: false, reason: 'missing', context: context };
      if (!context.available) {
        return { ok: false, reason: context.reason || 'unavailable', context: context };
      }
      if (!Game.trade.allows(def.catalogs, context)) {
        return { ok: false, reason: 'not-offered', context: context };
      }
      return { ok: true, context: context };
    },

    /** 单项当前价格 */
    price: function (def) {
      var s = Game.state;
      if (def.kind === 'potion') {
        return F.potionPrice(def.ref, Game.State.regionTier(s.world.region));
      }
      if (def.kind === 'gearbox') {
        return def.cur === 'crystal' ? def.price : F.gearBoxPrice(s.player.level);
      }
      if (def.kind === 'perm') {
        return F.permPrice(s.player.perms[def.id] || 0);
      }
      return def.price || 0;
    },

    ownedCount: function (def) {
      if (def.kind === 'perm') return Game.state.player.perms[def.id] || 0;
      if (def.kind === 'potion') return Game.inv.potionCount(def.ref);
      return 0;
    },

    canBuy: function (def) {
      if (!Shop.availability(def).ok) return false;
      var s = Game.state, p = s.player;
      if (def.kind === 'perm' && (p.perms[def.id] || 0) >= F.PERM_MAX) return false;
      var price = Shop.price(def);
      return def.cur === 'crystal' ? p.crystal >= price : p.gold >= price;
    },

    /** 购买；返回 {ok, item?} */
    buy: function (sid) {
      var def = reg.get('shopItem', sid);
      if (!def) return { ok: false };
      var access = Shop.availability(def);
      if (!access.ok) return { ok: false, reason: access.reason };
      if (!Shop.canBuy(def)) return { ok: false, reason: 'poor' };
      var price = Shop.price(def);
      var p = Game.state.player;

      if (def.cur === 'crystal') Game.player.addCrystal(-price);
      else Game.player.addGold(-price, { raw: true });

      var result = { ok: true };
      if (def.kind === 'potion') {
        Game.inv.addPotion(def.ref, 1);
      } else if (def.kind === 'gearbox') {
        var item;
        if (def.quality === 'epic') {
          // 魔晶石箱：史诗保底，20% 出传说
          item = Game.inv.genLoot(p.level, { rar: U.chance(0.2) ? 4 : 3 });
        } else {
          item = Game.inv.genLoot(p.level, { luck: 1.4 });
        }
        result.item = Game.inv.addItem(item, { source: 'shop' });
      } else if (def.kind === 'perm') {
        p.perms[def.id] = (p.perms[def.id] || 0) + 1;
        Game.player.recalc();
      }
      bus.emit('shop:bought', {
        sid: sid,
        rid: access.context.regionId,
        areaId: access.context.areaId
      });
      return result;
    }
  };
})();
