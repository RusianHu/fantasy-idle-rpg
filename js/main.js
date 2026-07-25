/* ============================================================
 * main.js — 启动引导
 * 顺序：i18n → 系统监听 → 读档/新档 → 世界 → 渲染/UI →
 *       离线结算 / 序章 → 主循环
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  function loadFont() {
    if (!window.FontFace) return;
    try {
      var ff = new FontFace('FusionPixel', 'url(assets/fonts/fusion-pixel.woff2)');
      ff.load().then(function (f) {
        document.fonts.add(f);
      }).catch(function () { /* 字体缺失：回退系统字体 */ });
    } catch (e) { /* 忽略 */ }
  }

  function boot() {
    loadFont();
    Game.i18n.detect();

    // 系统监听器
    Game.audio.init();
    Game.prog.init();
    Game.meta.init();

    // 读档 / 新档
    var data = Game.save.load();
    var isNew = !data;
    if (data) {
      Game.save.applyLoaded(data);
      Game.i18n.setLocale(Game.state.settings.lang);
    } else {
      Game.state = Game.State.newGame();
      Game.state.settings.lang = Game.i18n.locale();
    }

    Game.particles.setEnabled(Game.state.settings.effects);
    Game.audio.setMuted('sfx', !Game.state.settings.sfx);
    Game.audio.setMuted('bgm', !Game.state.settings.music);

    Game.player.recalc();
    if (isNew) {
      // 公会配发：一把铜剑（初始装备）
      var starter = Game.inv.genLoot(1, { base: 'weapon', rar: 0 });
      Game.inv.addItem(starter, { silent: true });
      Game.inv.equip(starter.uid);
      Game.state.player.hp = Game.state.derived.maxHp;
    }

    // 世界与渲染
    Game.world.init(Game.state.world.region);
    Game.render.init(document.getElementById('stage'));
    Game.ui.hud.init();
    Game.ui.tabs.init();
    Game.ui.modals.init();
    Game.loop.init();

    // 离线结算（防系统时间回调：ts 在未来 → 收益按 0）
    if (!isNew) {
      var elapsed = (U.now() - Game.save.lastTs()) / 1000;
      if (elapsed > 0) {
        var sum = Game.offline.settle(elapsed);
        if (sum) {
          Game.ui.modals.offline(sum, function () {
            Game.offline.apply(sum);
            Game.save.save('offline');
          });
        }
      }
    }

    // 序章（仅首次）
    if (!Game.state.meta.prologueDone) {
      Game.ui.modals.prologue(function () {
        Game.state.meta.prologueDone = true;
        Game.save.save('prologue');
      });
    }

    Game.loop.start();
    Game.save.save('boot');
    Game.audio.playBgm('bgm_field');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
