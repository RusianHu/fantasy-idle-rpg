/* ============================================================
 * systems/ending.js — 最终通关演出 / 后日谈 / 继续或重开
 * 末区 Boss 首杀触发；演出期间暂停数值模拟，但保留渲染与氛围。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;

  var initialized = false;
  var phase = 'idle';
  var elapsed = 0;
  var rid = null;
  var boss = null;
  var reduced = false;
  var dissolveStarted = false;
  var dawnStarted = false;

  function meta() {
    return Game.state && Game.state.meta;
  }

  function finalRegionId() {
    var order = Game.State.regionOrder();
    return order.length ? order[order.length - 1] : null;
  }

  function findDefeatedBoss(mid) {
    var list = Game.world && Game.world.entities || [];
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].boss && list[i].dead && list[i].mid === mid) return list[i];
    }
    return null;
  }

  function lockHero() {
    var hero = Game.world && Game.world.hero;
    if (!hero) return;
    hero.target = null;
    hero.manualTarget = false;
    hero.moveOrder = null;
    hero.moving = false;
    hero.state = 'ending';
    if (Game.nav) Game.nav.clear(hero);
  }

  function removeDefeatedBoss() {
    if (!boss || !Game.world) return;
    var i = Game.world.entities.indexOf(boss);
    if (i >= 0) Game.world.entities.splice(i, 1);
    boss = null;
  }

  function save(reason) {
    if (Game.save && Game.save.save) Game.save.save(reason);
  }

  function setCinematicPhase(name) {
    if (Game.ui && Game.ui.ending) Game.ui.ending.setCinematicPhase(name);
  }

  function beginDissolve() {
    if (dissolveStarted) return;
    dissolveStarted = true;
    setCinematicPhase('dissolve');
    if (!reduced && boss && Game.fx && Game.fx.finaleBurst) {
      Game.fx.finaleBurst(boss.x, boss.y - (boss.spriteH || 20) * 0.45, 'miasma');
    }
  }

  function beginDawn() {
    if (dawnStarted) return;
    dawnStarted = true;
    setCinematicPhase('dawn');
  }

  function beginEpilogue(startLine, restored) {
    phase = 'epilogue';
    elapsed = 0;
    removeDefeatedBoss();
    if (Game.world) Game.world.cinematic = null;
    var m = meta();
    if (!m) return;
    m.endingPhase = 'epilogue';
    m.endingLine = Math.max(0, Math.min(5, Number(startLine) || 0));
    save('ending-epilogue');

    if (Game.ui && Game.ui.ending) {
      Game.ui.ending.showEpilogue(m.endingLine, {
        restored: !!restored,
        onLine: function (line) {
          m.endingLine = line;
          m.endingPhase = 'epilogue';
          save('ending-progress');
        },
        onDone: function () { E.showSummary(); }
      });
    }
  }

  function resetRuntime() {
    if (Game.ui && Game.ui.ending) Game.ui.ending.close();
    phase = 'idle';
    elapsed = 0;
    rid = null;
    boss = null;
    reduced = false;
    dissolveStarted = false;
    dawnStarted = false;
  }

  var E = Game.ending = {
    init: function () {
      if (initialized) return;
      initialized = true;
      bus.on('boss:defeated', function (p) {
        if (E.willHandleBoss(p)) E.trigger(p);
      });
    },

    phase: function () { return phase; },
    isActive: function () { return phase !== 'idle'; },
    isPending: function () {
      var m = meta();
      return !!(m && m.completedAt && !m.endingAcknowledged);
    },
    willHandleBoss: function (p) {
      return !!(p && p.first && p.rid === finalRegionId() && meta() && !meta().completedAt);
    },

    trigger: function (p) {
      if (!E.willHandleBoss(p)) return false;
      var m = meta();
      m.completedAt = U.now();
      m.endingAcknowledged = false;
      m.endingPhase = 'cinematic';
      m.endingLine = 0;

      phase = 'cinematic';
      elapsed = 0;
      rid = p.rid;
      boss = findDefeatedBoss(p.mid);
      reduced = !Game.state.settings.effects || !!(
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
      dissolveStarted = false;
      dawnStarted = false;
      lockHero();
      if (Game.ui && Game.ui.modals && Game.ui.modals.clearToasts) {
        Game.ui.modals.clearToasts();
      }

      if (boss) {
        boss.finaleFade = 1;
        boss.deathT = Math.max(boss.deathT, 0.5);
      }
      if (Game.ui && Game.ui.ending) Game.ui.ending.showCinematic(E.advance, reduced);
      if (reduced) {
        beginDawn();
      } else {
        setCinematicPhase('impact');
        if (Game.fx) {
          Game.fx.shake(8, 0.8);
          if (boss && Game.fx.finaleBurst) {
            Game.fx.finaleBurst(boss.x, boss.y - (boss.spriteH || 20) * 0.45, 'impact');
          }
        }
      }

      var payload = { rid: p.rid, mid: p.mid, tier: p.tier, completedAt: m.completedAt };
      bus.emit('game:completed', payload);
      save('completed');
      return true;
    },

    update: function (dt) {
      if (phase !== 'cinematic') return;
      elapsed += dt;
      if (boss) boss.finaleFade = U.clamp(1 - elapsed / (reduced ? 0.9 : 3.1), 0, 1);

      if (reduced) {
        if (elapsed >= 0.9) beginEpilogue(0, false);
        return;
      }
      if (elapsed >= 1.2) beginDissolve();
      if (elapsed >= 3.2) beginDawn();
      if (elapsed >= 4.5) beginEpilogue(0, false);
    },

    advance: function () {
      if (phase === 'epilogue' && Game.ui && Game.ui.ending) {
        return Game.ui.ending.advanceStory();
      }
      if (phase !== 'cinematic' || elapsed < 1) return false;
      if (reduced) {
        beginEpilogue(0, false);
      } else if (elapsed < 1.2) {
        elapsed = 1.2;
        beginDissolve();
      } else if (elapsed < 3.2) {
        elapsed = 3.2;
        beginDawn();
      } else {
        beginEpilogue(0, false);
      }
      return true;
    },

    cameraTarget: function () {
      if (phase !== 'cinematic') return null;
      var hero = Game.world && Game.world.hero;
      if (!hero) return null;
      if (!boss) return { x: hero.x, y: hero.y, zoom: 2.35 };
      var k = U.clamp((elapsed - 1.2) / 2, 0, 1);
      return {
        x: U.lerp(boss.x, hero.x, k),
        y: U.lerp(boss.y, hero.y, k),
        zoom: U.lerp(2.8, 2.35, k)
      };
    },

    showSummary: function () {
      if (!E.isPending()) return false;
      phase = 'summary';
      elapsed = 0;
      removeDefeatedBoss();
      var m = meta();
      m.endingPhase = 'summary';
      m.endingLine = 5;
      save('ending-summary');
      if (Game.ui && Game.ui.ending) {
        Game.ui.ending.showSummary({
          onContinue: E.continueGame,
          onRestart: function () { Game.save.hardReset(); }
        });
      }
      return true;
    },

    continueGame: function () {
      if (!E.isPending()) return false;
      var currentRid = Game.state.world.region;
      var m = meta();
      m.endingAcknowledged = true;
      m.endingPhase = null;
      m.endingLine = 0;
      removeDefeatedBoss();
      if (Game.world) {
        Game.world.cinematic = null;
        var hero = Game.world.hero;
        if (hero) {
          hero.state = 'idle';
          hero.target = null;
          hero.manualTarget = false;
          hero.moveOrder = null;
          hero.moving = false;
          if (Game.nav) Game.nav.clear(hero);
        }
      }
      resetRuntime();
      bus.emit('game:continued', { rid: currentRid });
      save('ending-continued');
      return true;
    },

    restorePending: function () {
      resetRuntime();
      if (!E.isPending()) return false;
      rid = Game.state.world.region;
      lockHero();
      var m = meta();
      if (m.endingPhase === 'summary') {
        return E.showSummary();
      }
      beginEpilogue(m.endingLine || 0, true);
      return true;
    },

    resetRuntime: resetRuntime
  };
})();
