/* ============================================================
 * systems/meta.js — 统计计数器 + 成就（事件总线监听器实现）
 * 战斗核心不感知统计与成就；本模块只订阅事件、累计、发奖。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var bus = Game.bus, reg = Game.reg;

  var achCheckT = 0;

  var Meta = Game.meta = {
    stats: function () { return Game.state.meta.stats; },

    init: function () {
      bus.on('item:dropped', function (p) {
        var st = Meta.stats();
        st.drops++;
        if (p.item && p.item.rar === 4) st.legendaries++;
      });
      // 其余计数（kills/bossKills/deaths/potions/gold/exp/maxHit）在产生处累计
    },

    /** 主循环节拍：游玩时长 + 定期成就检查 */
    tick: function (dt) {
      var st = Meta.stats();
      st.playSec += dt;
      achCheckT += dt;
      if (achCheckT >= 1) {
        achCheckT = 0;
        Meta.checkAchievements();
      }
    },

    checkAchievements: function () {
      var s = Game.state;
      var st = s.meta.stats;
      var done = s.meta.ach;
      var list = reg.all('achievement');
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (done[a.id]) continue;
        var v = st[a.stat] || 0;
        if (v < a.threshold) continue;
        done[a.id] = true;
        if (a.reward) {
          if (a.reward.gold) Game.player.addGold(a.reward.gold, { raw: true });
          if (a.reward.crystal) Game.player.addCrystal(a.reward.crystal);
        }
        bus.emit('achievement:unlocked', { aid: a.id, reward: a.reward });
      }
    },

    /** 成就进度（UI 用） */
    achProgress: function (a) {
      var st = Meta.stats();
      return Math.min(st[a.stat] || 0, a.threshold);
    },

    achievedCount: function () {
      var done = Game.state.meta.ach, n = 0;
      for (var k in done) if (done[k]) n++;
      return n;
    }
  };
})();
