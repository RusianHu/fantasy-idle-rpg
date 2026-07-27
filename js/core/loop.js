/* ============================================================
 * core/loop.js — 主循环
 * requestAnimationFrame 驱动；页面不可见期间用时间戳补偿：
 * 短隙（<90s）快进模拟，长隙走离线结算弹窗。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var running = false;
  var lastFrame = 0;
  var autosaveT = 0;
  var hiddenAt = 0;

  var SIM_STEP = 0.1;
  var CATCHUP_MAX = 90;      // 秒；快进模拟的上限
  var OFFLINE_GAP = 300;     // 秒；隐藏超过 5 分钟才走离线结算弹窗
  var AUTOSAVE_EVERY = 15;

  function step(dt) {
    var st = Game.state;
    // 标题与建角流程只保留背景渲染所需的视觉更新，严禁在遮罩后战斗、
    // 增长游玩统计或推进世界时间。
    if (Game.entryState !== undefined && Game.entryState !== 'active') {
      Game.terrain.update(dt);
      Game.particles.update(dt);
      Game.fx.update(dt);
      return;
    }
    if (!Game.State.isAdventureStarted()) {
      Game.terrain.update(dt);
      Game.particles.update(dt);
      Game.fx.update(dt);
      return;
    }
    if (Game.ending && Game.ending.isActive()) {
      Game.terrain.update(dt);
      Game.ending.update(dt);
      Game.particles.update(dt);
      Game.fx.update(dt);
      return;
    }
    st.world.worldTime += dt;
    Game.terrain.update(dt);
    if (Game.transitions) Game.transitions.update(dt);
    if (!Game.transitions || !Game.transitions.blocksWorld()) {
      Game.world.update(dt);
    } else if (Game.environment) {
      // 节点冷却属于世界时钟；旅行/死亡导演只暂停实体，不冻结环境冷却。
      Game.environment.update(dt);
    }
    if (Game.trade) Game.trade.update();
    Game.particles.update(dt);
    Game.fx.update(dt);
    Game.meta.tick(dt);
  }

  function frame(ts) {
    if (!running) return;
    var dt = (ts - lastFrame) / 1000;
    lastFrame = ts;
    if (dt < 0) dt = 0.016;
    if (dt > 0.25) dt = 0.25;

    step(dt);
    Game.render.frame(dt);
    Game.ui.hud.tick(dt);

    autosaveT += dt;
    if (autosaveT >= AUTOSAVE_EVERY) {
      autosaveT = 0;
      Game.save.save('auto');
    }
    requestAnimationFrame(frame);
  }

  var L = Game.loop = {
    start: function () {
      if (running) return;
      running = true;
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    },

    /** 快进补偿（隐藏页返回的短间隙） */
    catchup: function (seconds) {
      var n = Math.min(seconds, CATCHUP_MAX) / SIM_STEP;
      for (var i = 0; i < n; i++) step(SIM_STEP);
    },

    init: function () {
      document.addEventListener('visibilitychange', function () {
        if (Game.entryState !== undefined && Game.entryState !== 'active') {
          hiddenAt = 0;
          lastFrame = performance.now();
          return;
        }
        if (document.hidden) {
          if (Game.transitions) Game.transitions.settleBeforeSave();
          hiddenAt = U.now();
          Game.save.save('hidden');
        } else {
          var gap = (U.now() - hiddenAt) / 1000;
          lastFrame = performance.now();
          if (Game.ending && Game.ending.isPending()) return;
          if (gap > OFFLINE_GAP) {
            var sum = Game.offline.settle(gap);
            if (sum) {
              Game.ui.modals.offline(sum, function () {
                Game.offline.apply(sum);
                Game.save.save('offline');
              });
            }
          } else if (gap > 2) {
            L.catchup(gap);
          }
        }
      });
      window.addEventListener('pagehide', function () {
        if (Game.entryState !== undefined && Game.entryState !== 'active') return;
        if (Game.transitions) Game.transitions.settleBeforeSave();
        Game.save.save('pagehide');
      });
      window.addEventListener('beforeunload', function () {
        if (Game.entryState !== undefined && Game.entryState !== 'active') return;
        if (Game.transitions) Game.transitions.settleBeforeSave();
        Game.save.save('unload');
      });

      // 关键事件即时保存
      var saveOn = ['player:levelup', 'boss:defeated', 'item:equipped', 'region:changed',
        'achievement:unlocked', 'shop:bought', 'skill:upgraded',
        'skills:autoAllocated', 'equipment:autoChanged', 'slot:lockChanged', 'settings:changed',
        'item:pickedUp', 'item:used', 'gather:done', 'chest:opened', 'camp:autoReturn',
        'region:relocked', 'landmark:discovered', 'resource:registered',
        'curio:found', 'curio:chosen', 'ecology:recorded', 'guardian:defeated',
        'expedition:finished', 'commission:completed', 'region:completed100'];
      saveOn.forEach(function (evt) {
        Game.bus.on(evt, function () {
          // 轻微防抖：合并密集事件
          clearTimeout(L._evtSaveT);
          L._evtSaveT = setTimeout(function () { Game.save.save('event'); }, 800);
        });
      });
    }
  };
})();
