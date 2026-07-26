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
    Game.ending.init();
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
    if (isNew) Game.state.player.hp = Game.state.derived.maxHp;

    // 世界与渲染
    Game.world.init(Game.state.world.region);
    Game.render.init(document.getElementById('stage'));
    Game.ui.hud.init();
    Game.ui.tabs.init();
    Game.ui.modals.init();
    Game.ui.transitions.init();
    Game.transitions.init();
    Game.auto.init();
    Game.loop.init();
    if (!isNew && Game.player.hasClass() && Game.state.player.hp <= 0) {
      Game.transitions.restoreZeroHp();
    }

    // 选职业（新档全屏选择；v1 旧档迁移补选，等价一次免费洗点）
    function classFlow(cb) {
      if (Game.player.hasClass()) { if (cb) cb(); return; }
      Game.ui.title.classSelect(function (cid) {
        Game.player.setClass(cid);
        // 公会配发：职业武器（仅背包为空时）
        if (!Game.state.inv.items.length) {
          var starter = Game.inv.genLoot(1, { base: 'weapon', rar: 0 });
          Game.inv.addItem(starter, { silent: true, skipAuto: true, source: 'starter' });
          Game.inv.equip(starter.uid);
        }
        Game.state.player.hp = Game.state.derived.maxHp;
        Game.world.syncHeroStats();
        Game.ui.hud.update(true);
        Game.save.save('class');
        if (cb) cb();
      });
    }

    // 离线结算（防系统时间回调：ts 在未来 → 收益按 0）
    function settleOffline() {
      if (isNew) return;
      if (Game.transitions.isActive()) return;
      if (Game.ending.isPending()) {
        Game.ending.restorePending();
        return;
      }
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

    // 新玩家：标题画面 → 序章 → 选职业 → 淡入世界并鸣锣开场
    // 迁移档（无职业）：直接全屏补选；老玩家：秒进 + 离线结算
    if (!Game.state.meta.prologueDone) {
      Game.ui.title.show(function () {
        Game.ui.modals.prologue(function () {
          Game.state.meta.prologueDone = true;
          Game.save.save('prologue');
          classFlow(function () {
            Game.ui.title.hide();
            setTimeout(function () {
              Game.fx.banner('ui.adventureBegin');
              if (Game.world.hero) Game.fx.poof(Game.world.hero.x, Game.world.hero.y - 10);
            }, 500);
          });
        });
      });
    } else {
      classFlow(settleOffline);
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
