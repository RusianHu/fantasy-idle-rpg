/* ============================================================
 * systems/progression.js — 区域推进 / 自动推图 / 卡关保护
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var bus = Game.bus, reg = Game.reg;

  var Prog = Game.prog = {
    finalRegion: function () {
      var list = Game.State.regionOrder();
      return list.length ? list[list.length - 1] : null;
    },

    isFinalRegion: function (rid) {
      return !!rid && rid === Prog.finalRegion();
    },

    isFinalRegionLocked: function (rid) {
      return Prog.isFinalRegion(rid) && Game.state.world.finalRegionLocked === true;
    },

    /** 区域是否已解锁（首区域恒解锁；其余需前一区域 Boss 已击败）。 */
    isUnlocked: function (rid) {
      var list = Game.State.regionOrder();
      var idx = list.indexOf(rid);
      if (idx <= 0) return idx === 0;
      if (idx === list.length - 1 && Game.state.world.finalRegionLocked === true) return false;
      var prev = list[idx - 1];
      return Game.State.regionProg(prev).cleared;
    },

    /**
     * 最终区域战败后失守。返回值为必须撤回的上一地区；
     * 首杀、cleared、结局与奖励记录一律保留。
     */
    lockFinalRegion: function (rid, opts) {
      if (!Prog.isFinalRegion(rid)) return null;
      var list = Game.State.regionOrder();
      var fallbackRid = list.length > 1 ? list[list.length - 2] : null;
      if (!fallbackRid) return null;
      var alreadyLocked = Game.state.world.finalRegionLocked === true;
      Game.state.world.finalRegionLocked = true;
      Game.state.world.deathsRow = 0;
      if (!alreadyLocked) {
        bus.emit('region:relocked', {
          rid: rid,
          fallbackRid: fallbackRid,
          byBoss: !!(opts && opts.byBoss)
        });
      }
      return fallbackRid;
    },

    currentIndex: function () {
      return Game.State.regionIndex(Game.state.world.region);
    },

    nextRegion: function () {
      var list = Game.State.regionOrder();
      var idx = Prog.currentIndex();
      return idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
    },

    prevRegion: function () {
      var list = Game.State.regionOrder();
      var idx = Prog.currentIndex();
      return idx > 0 ? list[idx - 1] : null;
    },

    /** 切换区域（需已解锁；支持随时回退刷低级区） */
    gotoRegion: function (rid) {
      if (!reg.has('region', rid)) return false;
      if (!Prog.isUnlocked(rid)) return false;
      if (rid === Game.state.world.region && Game.world.region) return false;
      Game.state.world.region = rid;
      Game.state.world.deathsRow = 0;
      Game.world.init(rid);
      var order = Game.State.regionTier(rid);
      var st = Game.state.meta.stats;
      if (order > st.highestRegion) st.highestRegion = order;
      return true;
    },

    /** 玩家可见的换区入口：校验后交由短过场导演处理。 */
    requestRegion: function (rid, opts) {
      opts = opts || {};
      if (!reg.has('region', rid)) return false;
      if (!Prog.isUnlocked(rid)) return false;
      if (rid === Game.state.world.region) return false;
      if (!Game.transitions || Game.transitions.isActive()) return false;
      return Game.transitions.startRegion(rid, opts);
    },

    init: function () {
      // Boss 击败 → 解锁下一区域；自动推进开关（默认开启）
      bus.on('boss:defeated', function (p) {
        var next = (function () {
          var list = Game.State.regionOrder();
          var idx = list.indexOf(p.rid);
          return idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
        })();
        var reopened = !!(
          next && Prog.isFinalRegion(next) && Game.state.world.finalRegionLocked === true
        );
        if (reopened) Game.state.world.finalRegionLocked = false;
        if (next) bus.emit('region:unlocked', { rid: next, reopened: reopened });
        if (next && Game.state.settings.autoAdvance) {
          // 无需确认：默认 3 秒后出发；玩家可取消本次旅行。
          Prog.requestRegion(next, { source: 'auto', boss: p });
        }
      });

      // 兼容旧调用：新死亡流程会将回退目标并入灵魂返营，不再走双重换区。
      bus.on('protect:fallback', function () {
        if (Game.transitions && Game.transitions.isDeathActive()) return;
        var prev = Prog.prevRegion();
        if (prev) {
          Prog.requestRegion(prev, { source: 'fallback' });
        }
      });
    }
  };
})();
