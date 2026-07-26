/* ============================================================
 * systems/transitions.js — 区域旅行 / 死亡重整短过场导演
 * 战斗模拟在过场期间暂停；日夜、环境与渲染继续运行。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;

  var REGION_TIME = {
    countdown: 3.0,
    depart: 0.45,
    swap: 0.18,
    arrive: 0.85
  };
  var DEATH_TIME = {
    down: 0.65,
    soul: 0.8,
    land: 0.45,
    recover: 4.2,
    rise: 0.75
  };
  var active = null;
  var initialized = false;

  function effectsReduced() {
    return !Game.state.settings.effects || !!(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function ui() {
    return Game.ui && Game.ui.transitions;
  }

  function currentHero() {
    return Game.world && Game.world.hero;
  }

  function clearHeroOrders(hero) {
    if (!hero) return;
    hero.target = null;
    hero.manualTarget = false;
    hero.moveOrder = null;
    hero.moving = false;
    hero.campWarp = null;
    if (Game.nav) Game.nav.clear(hero);
  }

  function emitModeChange(oldMode, mode, reason) {
    if (oldMode === mode) return;
    bus.emit(mode === 'rest' ? 'rest:start' : 'rest:end', { reason: reason || 'transition' });
    bus.emit('mode:changed', { mode: mode, transition: true, reason: reason || 'transition' });
  }

  function setModeForWorld(mode, reason) {
    var oldMode = Game.state.world.mode;
    Game.state.world.mode = mode;
    emitModeChange(oldMode, mode, reason);
  }

  function clearStageNotices() {
    if (!Game.ui || !Game.ui.modals) return;
    if (Game.ui.modals.clearToasts) Game.ui.modals.clearToasts();
    if (Game.ui.modals.clearDeferredToasts) Game.ui.modals.clearDeferredToasts();
  }

  function syncUi() {
    if (ui() && ui().render) ui().render(T.snapshot());
  }

  function setPhase(name, duration) {
    if (!active) return;
    active.phase = name;
    active.elapsed = 0;
    active.duration = duration;
    syncUi();
  }

  function firstEntry(rid) {
    return Game.State.regionTier(rid) > (Game.state.meta.stats.highestRegion || 1);
  }

  function arrivalMode(rid, source, modeBefore) {
    if (source === 'auto') {
      return Game.world.controlMode() === 'manual' ? 'rest' : 'battle';
    }
    if (source === 'map' && firstEntry(rid)) return 'rest';
    return modeBefore === 'rest' ? 'rest' : 'battle';
  }

  function beginRegionDepart() {
    if (!active || active.kind !== 'region') return false;
    var hero = currentHero();
    setPhase('depart', REGION_TIME.depart);
    if (!active.reduced && Game.fx && hero) {
      Game.fx.teleport(hero.x, hero.y, 'out');
      if (Game.fx.travelBurst) Game.fx.travelBurst(hero.x, hero.y, 'out');
    }
    return true;
  }

  function commitRegion(a) {
    if (!a || a.swapped) return;
    a.swapped = true;
    var oldMode = Game.state.world.mode;
    Game.state.world.mode = a.arrivalMode;
    Game.prog.gotoRegion(a.toRid);

    var hero = currentHero();
    if (hero) {
      clearHeroOrders(hero);
      var rest = Game.world.campRestPoint();
      hero.x = U.clamp(rest.x + 44, 18, Game.world.region.world.w - 18);
      hero.y = U.clamp(rest.y + 7, Game.world.BOUND_TOP, Game.world.region.world.h - 14);
      hero.state = 'arrival';
      hero.dir = 'l';
      hero.stepAcc = 0;
    }
    var camp = Game.terrain.campfirePos;
    if (camp && Game.render) Game.render.snapCamera(camp.x, camp.y);
    emitModeChange(oldMode, a.arrivalMode, 'region-arrival');
  }

  function finishRegion(a, settled) {
    if (!a) return;
    if (!a.swapped) commitRegion(a);
    var hero = currentHero();
    if (hero) {
      hero.state = a.arrivalMode === 'rest' ? 'goCamp' : 'idle';
      hero.moving = false;
    }
    var payload = {
      rid: a.toRid,
      fromRid: a.fromRid,
      source: a.source,
      arrivalMode: a.arrivalMode,
      firstEntry: a.firstEntry,
      settled: !!settled
    };
    active = null;
    if (ui() && ui().hide) ui().hide();
    bus.emit('region:arrived', payload);
    if (a.source === 'auto') {
      bus.emit('prog:autoAdvance', { rid: a.toRid, cinematic: true });
    }
    if (Game.ui && Game.ui.modals && Game.ui.modals.flushDeferredToasts) {
      Game.ui.modals.flushDeferredToasts();
    }
  }

  function advanceRegion() {
    if (!active || active.kind !== 'region') return;
    var a = active;
    if (a.phase === 'countdown') {
      beginRegionDepart();
    } else if (a.phase === 'depart') {
      setPhase('swap', REGION_TIME.swap);
      commitRegion(a);
    } else if (a.phase === 'swap') {
      setPhase('arrive', REGION_TIME.arrive);
      var hero = currentHero();
      if (!a.reduced && Game.fx && hero) {
        Game.fx.teleport(hero.x, hero.y, 'in');
        if (Game.fx.travelBurst) Game.fx.travelBurst(hero.x, hero.y, 'in');
      }
    } else if (a.phase === 'arrive') {
      finishRegion(a, false);
    }
  }

  function landDeath(a) {
    if (!a || a.landed) return;
    a.landed = true;
    var oldMode = Game.state.world.mode;
    if (a.fallbackRid && Game.state.world.region !== a.fallbackRid) {
      Game.state.player.hp = 0;
      Game.state.world.mode = 'rest';
      Game.prog.gotoRegion(a.fallbackRid);
      a.fallbackCommitted = true;
    }

    var hero = currentHero();
    Game.state.world.mode = 'rest';
    if (hero) {
      clearHeroOrders(hero);
      var rest = Game.world.campRestPoint();
      hero.x = rest.x + 4;
      hero.y = rest.y + 2;
      hero.state = 'recover';
      hero.recoverT = DEATH_TIME.recover;
      hero.dir = 'l';
      hero.stepAcc = 0;
    }
    emitModeChange(oldMode, 'rest', 'death-recovery');
    var camp = Game.terrain.campfirePos;
    if (camp && Game.render) Game.render.snapCamera(camp.x, camp.y);
    if (!a.reduced && Game.fx && hero) {
      if (Game.fx.soulReturn) Game.fx.soulReturn(hero.x, hero.y - 8, 'in');
      else Game.fx.teleport(hero.x, hero.y, 'in');
    }
  }

  function enterDeathPhase(name) {
    if (!active || active.kind !== 'death') return;
    var a = active, hero = currentHero();
    if (name === 'down') {
      setPhase('down', DEATH_TIME.down);
    } else if (name === 'soul') {
      setPhase('soul', DEATH_TIME.soul);
      if (!a.reduced && Game.fx && hero) {
        if (Game.fx.soulReturn) Game.fx.soulReturn(hero.x, hero.y - 8, 'out');
        else Game.fx.teleport(hero.x, hero.y, 'out');
      }
    } else if (name === 'land') {
      setPhase('land', DEATH_TIME.land);
      landDeath(a);
    } else if (name === 'recover') {
      setPhase('recover', DEATH_TIME.recover);
      hero = currentHero();
      if (hero) {
        hero.state = 'recover';
        hero.recoverT = DEATH_TIME.recover;
      }
      a.healPct = 0;
      a.pulseStep = 0;
    } else if (name === 'rise') {
      setPhase('rise', DEATH_TIME.rise);
      hero = currentHero();
      Game.state.player.hp = hero ? hero.maxHp : Game.player.derived().maxHp;
      if (hero) {
        hero.state = 'revive';
        hero.recoverT = 0;
      }
      if (!a.reduced && Game.fx && hero && Game.fx.revivePulse) {
        Game.fx.revivePulse(hero.x, hero.y - 8, 3);
      }
    }
  }

  function finishDeath(a, settled) {
    if (!a) return;
    if (!a.landed) landDeath(a);
    var hero = currentHero();
    var finalMode = a.arrivalMode;
    var oldMode = Game.state.world.mode;
    Game.state.player.hp = hero ? hero.maxHp : Game.player.derived().maxHp;
    Game.state.world.mode = finalMode;
    if (hero) {
      var rest = Game.world.campRestPoint();
      if (finalMode === 'rest') {
        hero.x = rest.x;
        hero.y = rest.y;
        hero.state = 'sitting';
        hero.dir = 'l';
      } else {
        hero.state = 'idle';
      }
      hero.moving = false;
      hero.recoverT = 0;
    }
    emitModeChange(oldMode, finalMode, 'death-revived');
    var payload = {
      rid: Game.state.world.region,
      byBoss: a.byBoss,
      fallbackRid: a.fallbackRid,
      autoResume: finalMode === 'battle',
      restored: a.restored,
      settled: !!settled
    };
    active = null;
    if (ui() && ui().hide) ui().hide();
    bus.emit('player:revived', payload);
    if (a.fallbackRid) {
      bus.emit('prog:fellback', { rid: a.fallbackRid, cinematic: true });
    }
    if (Game.ui && Game.ui.modals && Game.ui.modals.flushDeferredToasts) {
      Game.ui.modals.flushDeferredToasts();
    }
  }

  function advanceDeath() {
    if (!active || active.kind !== 'death') return;
    var a = active;
    if (a.phase === 'down') enterDeathPhase('soul');
    else if (a.phase === 'soul') enterDeathPhase('land');
    else if (a.phase === 'land') enterDeathPhase('recover');
    else if (a.phase === 'recover') enterDeathPhase('rise');
    else if (a.phase === 'rise') finishDeath(a, false);
  }

  function updateRecovery(a) {
    if (!a || a.phase !== 'recover') return;
    var hero = currentHero();
    if (!hero) return;
    var pct = U.clamp(a.elapsed / Math.max(0.01, a.duration), 0, 1);
    Game.state.player.hp = hero.maxHp * pct;
    hero.recoverT = Math.max(0, a.duration - a.elapsed);
    a.healPct = pct;
    var step = Math.min(3, Math.floor(pct * 3 + 0.0001));
    if (step > a.pulseStep) {
      a.pulseStep = step;
      if (!a.reduced && Game.fx && Game.fx.revivePulse) {
        Game.fx.revivePulse(hero.x, hero.y - 8, step);
      }
    }
  }

  function updateActive(dt) {
    var guard = 0;
    dt = Math.max(0, dt);
    while (active && dt >= 0 && guard++ < 12) {
      var a = active;
      var left = Math.max(0, a.duration - a.elapsed);
      var used = Math.min(dt, left);
      a.elapsed += used;
      dt -= used;
      if (a.kind === 'death') updateRecovery(a);
      syncUi();
      if (!active || a.elapsed + 0.000001 < a.duration) break;
      if (a.kind === 'region') advanceRegion();
      else advanceDeath();
      if (used === 0 && dt === 0) break;
    }
  }

  var T = Game.transitions = {
    init: function () {
      if (initialized) return;
      initialized = true;
      document.addEventListener('keydown', function (e) {
        if (!active) return;
        if (e.code === 'Escape' && active.kind === 'region' && active.phase === 'countdown') {
          e.preventDefault();
          T.cancel('escape');
        }
      });
    },

    startRegion: function (rid, opts) {
      opts = opts || {};
      if (active || !Game.state || !Game.world || !Game.world.hero) return false;
      if (!Game.reg.has('region', rid) || rid === Game.state.world.region) return false;
      if (!Game.prog.isUnlocked(rid)) return false;

      var source = opts.source || 'map';
      var modeBefore = Game.state.world.mode;
      var hero = currentHero();
      active = {
        kind: 'region',
        phase: source === 'auto' ? 'countdown' : 'depart',
        elapsed: 0,
        duration: source === 'auto' ? REGION_TIME.countdown : REGION_TIME.depart,
        fromRid: Game.state.world.region,
        toRid: rid,
        source: source,
        modeBefore: modeBefore,
        arrivalMode: arrivalMode(rid, source, modeBefore),
        firstEntry: firstEntry(rid),
        cancellable: source === 'auto',
        boss: opts.boss || null,
        swapped: false,
        reduced: effectsReduced(),
        focusX: hero.x,
        focusY: hero.y
      };
      clearHeroOrders(hero);
      hero.state = 'travel';
      clearStageNotices();
      if (ui() && ui().show) ui().show(T.snapshot());
      if (source !== 'auto' && !active.reduced && Game.fx) {
        Game.fx.teleport(hero.x, hero.y, 'out');
        if (Game.fx.travelBurst) Game.fx.travelBurst(hero.x, hero.y, 'out');
      }
      bus.emit('region:travelStart', {
        fromRid: active.fromRid,
        toRid: rid,
        source: source,
        cancellable: active.cancellable,
        arrivalMode: active.arrivalMode
      });
      return true;
    },

    startDeath: function (opts) {
      opts = opts || {};
      if (active || !Game.state || !Game.world || !Game.world.hero) return false;
      var hero = currentHero();
      clearHeroOrders(hero);
      hero.shield = 0;
      hero.buffs = [];
      hero.state = 'dead';
      hero.deathT = DEATH_TIME.down;
      active = {
        kind: 'death',
        phase: 'down',
        elapsed: 0,
        duration: DEATH_TIME.down,
        fromRid: Game.state.world.region,
        fallbackRid: opts.fallbackRid || null,
        byBoss: !!opts.byBoss,
        restored: !!opts.restored,
        arrivalMode: Game.world.controlMode() === 'manual' ? 'rest' : 'battle',
        deathX: hero.x,
        deathY: hero.y,
        landed: false,
        fallbackCommitted: false,
        healPct: 0,
        pulseStep: 0,
        reduced: effectsReduced()
      };
      clearStageNotices();
      if (ui() && ui().show) ui().show(T.snapshot());
      if (Game.fx && !active.reduced) {
        Game.fx.flashScreen();
        Game.fx.shake(4, 0.5);
      }
      bus.emit('player:reviveStart', {
        rid: active.fromRid,
        byBoss: active.byBoss,
        fallbackRid: active.fallbackRid,
        restored: active.restored
      });
      if (active.restored) enterDeathPhase('land');
      return true;
    },

    restoreZeroHp: function () {
      if (!Game.state || Game.state.player.hp > 0 || active) return false;
      if (Game.ending && Game.ending.isPending && Game.ending.isPending()) return false;
      return T.startDeath({ restored: true });
    },

    departNow: function () {
      if (!active || active.kind !== 'region' || active.phase !== 'countdown') return false;
      return beginRegionDepart();
    },

    fastForward: function () {
      if (!active) return false;
      if (active.kind === 'region') {
        if (active.phase === 'countdown') return T.departNow();
        if (active.phase === 'arrive' && active.elapsed >= 0.35) {
          active.elapsed = active.duration;
          return true;
        }
      } else if (active.kind === 'death') {
        if (active.phase === 'down' && active.elapsed >= 0.6) {
          active.elapsed = active.duration;
          return true;
        }
        if (active.phase === 'soul') {
          active.elapsed = active.duration;
          return true;
        }
      }
      return false;
    },

    cancel: function (reason) {
      if (!active || active.kind !== 'region' || active.phase !== 'countdown') return false;
      var a = active, hero = currentHero();
      if (hero) {
        hero.state = a.modeBefore === 'rest' ? 'goCamp' : 'idle';
        hero.moving = false;
      }
      active = null;
      if (ui() && ui().hide) ui().hide();
      bus.emit('region:travelCancelled', {
        fromRid: a.fromRid,
        toRid: a.toRid,
        source: a.source,
        reason: reason || 'player'
      });
      return true;
    },

    update: function (dt) {
      if (!active) return;
      updateActive(dt);
    },

    isActive: function () { return !!active; },
    isRegionActive: function () { return !!active && active.kind === 'region'; },
    isDeathActive: function () { return !!active && active.kind === 'death'; },
    blocksWorld: function () { return !!active; },

    snapshot: function () {
      if (!active) return null;
      return {
        kind: active.kind,
        phase: active.phase,
        phaseProgress: U.clamp(active.elapsed / Math.max(0.01, active.duration), 0, 1),
        timeLeft: Math.max(0, active.duration - active.elapsed),
        fromRid: active.fromRid,
        toRid: active.toRid || null,
        source: active.source || null,
        arrivalMode: active.arrivalMode,
        firstEntry: !!active.firstEntry,
        cancellable: !!active.cancellable && active.phase === 'countdown',
        boss: active.boss,
        byBoss: !!active.byBoss,
        fallbackRid: active.fallbackRid || null,
        recoveryPct: active.healPct || 0,
        reduced: !!active.reduced
      };
    },

    cameraTarget: function () {
      if (!active) return null;
      if (active.kind === 'region') {
        if (!active.swapped) {
          return {
            x: active.focusX,
            y: active.focusY,
            zoom: active.phase === 'countdown' ? 2.35 : 2.75
          };
        }
        var camp = Game.terrain.campfirePos;
        if (!camp) return null;
        var k = active.phase === 'arrive'
          ? U.clamp(active.elapsed / active.duration, 0, 1)
          : 0;
        return { x: camp.x, y: camp.y, zoom: U.lerp(2.7, 2.35, k) };
      }
      if (!active.landed) {
        return { x: active.deathX, y: active.deathY, zoom: active.phase === 'down' ? 2.5 : 2.75 };
      }
      var cf = Game.terrain.campfirePos;
      return cf ? { x: cf.x, y: cf.y, zoom: active.phase === 'rise' ? 2.4 : 2.7 } : null;
    },

    entityStyle: function (ent) {
      if (!active || ent !== currentHero()) return null;
      if (active.reduced) {
        var hidden = active.kind === 'region'
          ? active.phase === 'swap'
          : active.phase === 'soul';
        return { alpha: hidden ? 0 : 1, ghosts: 0, lift: 0 };
      }
      var p = U.clamp(active.elapsed / Math.max(0.01, active.duration), 0, 1);
      if (active.kind === 'region') {
        if (active.phase === 'depart') return { alpha: 1 - p, ghosts: p > 0.18 ? 2 : 0, lift: p * 12 };
        if (active.phase === 'swap') return { alpha: 0, ghosts: 0, lift: 0 };
        if (active.phase === 'arrive') return { alpha: p, ghosts: p < 0.75 ? 2 : 0, lift: (1 - p) * 10 };
        return { alpha: 1, ghosts: 0, lift: 0 };
      }
      if (active.phase === 'down') return { alpha: 1 - p * 0.18, ghosts: 0, lift: 0 };
      if (active.phase === 'soul') return { alpha: 1 - p, ghosts: 3, lift: p * 16 };
      if (active.phase === 'land') return { alpha: p, ghosts: 2, lift: (1 - p) * 12 };
      return { alpha: 1, ghosts: active.phase === 'rise' ? 2 : 0, lift: 0 };
    },

    campfireBoost: function () {
      if (!active || active.kind !== 'death' || !active.landed) return 1;
      if (active.phase === 'recover') return 1.25 + (active.healPct || 0) * 0.55;
      if (active.phase === 'rise') return 1.8;
      return 1.2;
    },

    settleBeforeSave: function () {
      if (!active) return false;
      var a = active;
      if (a.kind === 'region') finishRegion(a, true);
      else finishDeath(a, true);
      return true;
    },

    _times: { region: REGION_TIME, death: DEATH_TIME }
  };
})();
