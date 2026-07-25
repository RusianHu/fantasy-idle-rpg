/* ============================================================
 * systems/shop.js — 商店（金币 + 魔晶石双货币闭环）
 * 产出：金币=击杀/出售/离线；魔晶石=Boss 首杀/成就/分解传说。
 * 消耗：药水、装备补给（金币）；稀有装备箱、永久强化（魔晶石）。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  var Shop = Game.shop = {
    /** 单项当前价格 */
    price: function (def) {
      var s = Game.state;
      if (def.kind === 'potion') {
        var region = reg.get('region', s.world.region);
        return F.potionPrice(def.ref, region ? region.tier : 1);
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
      var s = Game.state, p = s.player;
      if (def.kind === 'perm' && (p.perms[def.id] || 0) >= F.PERM_MAX) return false;
      var price = Shop.price(def);
      return def.cur === 'crystal' ? p.crystal >= price : p.gold >= price;
    },

    /** 购买；返回 {ok, item?} */
    buy: function (sid) {
      var def = reg.get('shopItem', sid);
      if (!def) return { ok: false };
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
        Game.inv.addItem(item);
        result.item = item;
      } else if (def.kind === 'perm') {
        p.perms[def.id] = (p.perms[def.id] || 0) + 1;
        Game.player.recalc();
      }
      bus.emit('shop:bought', { sid: sid });
      return result;
    }
  };
})();
