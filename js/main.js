/* ============================================================
 * main.js — 启动引导
 * 顺序：i18n → 系统监听 → 读档/新档预览 → 世界/渲染预热 →
 *       标题存档选择 → 离线结算 / 序章 → 主循环
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  function loadFont() {
    if (!window.FontFace) return;
    try {
      var fontUrl = 'assets/fonts/fusion-pixel.woff2?v=' + encodeURIComponent(Game.BUILD_ID);
      var ff = new FontFace('FusionPixel', 'url(' + fontUrl + ')');
      ff.load().then(function (f) {
        document.fonts.add(f);
      }).catch(function () { /* 字体缺失：回退系统字体 */ });
    } catch (e) { /* 忽略 */ }
  }

  function boot() {
    loadFont();
    Game.i18n.detect();
    Game.entryState = 'menu';

    try {
      var contentAudit = Game.content.finalize({ strict: true });
      console.info('[Content] ready', contentAudit.fingerprint, contentAudit.counts);
    } catch (contentError) {
      console.error(contentError);
      document.body.innerHTML = '<main class="boot-error" role="alert"><h1>Content audit failed</h1>' +
        '<p>' + String(contentError && contentError.message || contentError) + '</p></main>';
      return;
    }

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
        if (Game.units.primary()) Game.units.restore(Game.units.primary(), { source: 'class' });
        else Game.state.player.hp = Game.state.derived.maxHp;
        Game.world.syncHeroStats();
        Game.ui.hud.update(true);
        Game.save.save('class');
        if (cb) cb();
      });
    }

    // 离线结算（防系统时间回调：ts 在未来 → 收益按 0）
    function settleOffline() {
      if (isNew) return;
      if (!Game.State.isAdventureStarted()) return;
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

    function activateSession() {
      if (Game.entryState === 'active') return;
      Game.entryState = 'active';
      Game.loop.start();
      Game.save.save('boot');
      Game.audio.playBgm('bgm_field');
    }

    function startSelectedSlot() {
      if (isNew && Game.save && Game.save.beginNewGame) Game.save.beginNewGame();
      if (!Game.state.meta.prologueDone) {
        Game.ui.modals.prologue(function () {
          Game.state.meta.prologueDone = true;
          Game.save.save('prologue');
          classFlow(function () {
            activateSession();
            Game.ui.title.hide();
            setTimeout(function () {
              Game.fx.banner('ui.adventureBegin');
              if (Game.world.hero) Game.fx.poof(Game.world.hero.x, Game.world.hero.y - 10);
            }, 500);
          });
        });
      } else {
        classFlow(function () {
          activateSession();
          Game.ui.title.hide();
          setTimeout(settleOffline, 240);
        });
      }
    }

    function replaceWithNewGame() {
      Game.ui.modals.confirm(Game.i18n.t('ui.titleNewGameConfirm'), function () {
        try { sessionStorage.setItem('firpg_start_new', '1'); } catch (e) {}
        Game.save.hardReset();
      });
    }

    function deleteExistingSave() {
      Game.ui.modals.confirm(Game.i18n.t('ui.titleDeleteConfirm'), function () {
        Game.save.hardReset();
      });
    }

    // 新档、建角草稿、正式角色都先进入同一档案门厅。世界与 Canvas 已在
    // 背后预热，但主循环、离线结算和自动存档要等玩家明确选择后才启动。
    Game.ui.title.show({
      slots: Game.ui.title.makeSlots({ occupied: !isNew }),
      onNewGame: replaceWithNewGame,
      onDelete: deleteExistingSave,
      onSelect: function () {
        if (Game.entryState !== 'menu') return;
        Game.entryState = 'opening';
        Game.ui.title.enter(startSelectedSlot);
      }
    });

    // “开始新游戏”确认覆盖后会刷新以彻底清理旧世界；刷新完成自动衔接
    // 空档的进入动画，避免让玩家重复点击。
    var continueFresh = false;
    try {
      continueFresh = isNew && sessionStorage.getItem('firpg_start_new') === '1';
      if (continueFresh) sessionStorage.removeItem('firpg_start_new');
    } catch (e) {}
    if (continueFresh) {
      setTimeout(function () {
        Game.ui.title.setArchiveOpen(true, false);
        var freshSlot = document.querySelector('#title-root .slot-empty');
        if (freshSlot) freshSlot.click();
      }, 220);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
