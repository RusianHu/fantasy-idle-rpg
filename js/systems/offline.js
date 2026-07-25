/* ============================================================
 * systems/offline.js — 离线收益结算（不设时长上限）
 * 离线时处于休息模式：不产生战斗收益，HP 回满、休整增益积满；
 * 战斗模式：按 formulas.offlineGains 公式折算。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  var Off = Game.offline = {
    /** 计算离线摘要（elapsed 秒）；不足 60s 或时间戳异常返回 null */
    settle: function (elapsedSec) {
      if (!elapsedSec || elapsedSec < 60) return null;
      elapsedSec = Math.floor(elapsedSec);
      var mode = Game.state.world.mode;

      if (mode === 'rest') {
        return { type: 'rest', seconds: elapsedSec };
      }

      var region = reg.get('region', Game.state.world.region) || reg.all('region')[0];
      var m1 = reg.get('monster', region.monsters[0]);
      var m2 = reg.get('monster', region.monsters[1] || region.monsters[0]);
      var s1 = F.monsterStats(m1.tier, m1.mods, false);
      var s2 = F.monsterStats(m2.tier, m2.mods, false);
      var mHp = (s1.hp + s2.hp) / 2;
      var mExp = (s1.exp + s2.exp) / 2;
      var mGold = (s1.gold + s2.gold) / 2;

      var dps = Game.player.estimateDps();
      var g = F.offlineGains(elapsedSec, dps, mHp, mExp, mGold, {});
      var d = Game.player.derived();

      return {
        type: 'battle',
        seconds: elapsedSec,
        kills: g.kills,
        expBase: g.exp, goldBase: g.gold,
        // 展示值（含乘区，与实际入账一致）
        expShow: Math.round(g.exp * d.expMul),
        goldShow: Math.round(g.gold * d.goldMul),
        items: g.items,
        potions: g.potions
      };
    },

    /** 确认后入账 */
    apply: function (sum) {
      if (!sum) return;
      var s = Game.state;
      s.meta.stats.offlineSec += sum.seconds;

      if (sum.type === 'rest') {
        s.player.hp = Game.player.derived().maxHp;
        s.world.restBuffT = F.BAL.restBuffCap;
        s.meta.stats.restSec += sum.seconds;
        bus.emit('offline:settled', { summary: sum });
        return;
      }

      Game.player.addExp(sum.expBase);
      Game.player.addGold(sum.goldBase);
      s.meta.stats.kills += sum.kills;

      var lv = s.player.level;
      var gotItems = [];
      for (var i = 0; i < sum.items; i++) {
        var item = Game.inv.genLoot(lv);
        if (Game.inv.addItem(item, { silent: true })) {
          gotItems.push(item);
          bus.emit('item:dropped', { item: item, offline: true });
        }
      }
      if (sum.potions > 0) Game.inv.addPotion('potion_small', sum.potions);
      sum.gotItems = gotItems;
      bus.emit('offline:settled', { summary: sum });
    }
  };
})();
