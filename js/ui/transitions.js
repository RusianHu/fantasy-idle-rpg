/* ============================================================
 * ui/transitions.js — 区域旅行与死亡重整的舞台内非模态演出层
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;

  var root = null;
  var els = {};
  var lastSnapshot = null;

  function t(key, vars) { return Game.i18n.t(key, vars); }
  function regionName(rid) { return rid ? t('region.' + rid + '.name') : ''; }

  function setLocked(flag) {
    var app = document.getElementById('app');
    var stage = document.getElementById('stage-wrap');
    if (app) app.classList.toggle('scene-locked', flag);
    if (stage) stage.setAttribute('aria-busy', flag ? 'true' : 'false');
    ['control-switch', 'btn-camp'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !!flag;
    });
    U.$$('#tabbar .tab-btn').forEach(function (btn) { btn.disabled = !!flag; });
  }

  function phaseCopy(s) {
    if (s.kind === 'region') {
      if (s.phase === 'countdown') return t('ui.travelCountdown', { s: Math.max(1, Math.ceil(s.timeLeft)) });
      if (s.phase === 'depart') return t('ui.travelDeparting');
      if (s.phase === 'swap') return t('ui.travelCrossing');
      return t(s.arrivalMode === 'rest' ? 'ui.travelArriveRest' : 'ui.travelArriveBattle');
    }
    if (s.phase === 'down') return t('ui.recoveryDown');
    if (s.phase === 'soul') return t('ui.recoverySoul');
    if (s.phase === 'land') return t('ui.recoveryCamp');
    if (s.phase === 'recover') return t('ui.recovering', { s: Math.max(1, Math.ceil(s.timeLeft)) });
    return t(s.arrivalMode === 'rest' ? 'ui.recoveryRiseRest' : 'ui.recoveryRiseBattle');
  }

  function progressValue(s) {
    if (s.kind === 'region' && s.phase === 'countdown') return 1 - s.phaseProgress;
    if (s.kind === 'death' && s.phase === 'recover') return s.recoveryPct;
    return s.phaseProgress;
  }

  function renderRegion(s) {
    els.eyebrow.textContent = s.phase === 'arrive'
      ? t(s.firstEntry ? 'ui.travelNewRegion' : 'ui.travelRegionArrived')
      : t(s.source === 'auto' ? 'ui.regionPurified' : 'ui.travelRouteTitle');
    els.from.textContent = regionName(s.fromRid);
    els.to.textContent = regionName(s.toRid);
    els.route.classList.remove('hidden');
    els.title.textContent = s.phase === 'arrive'
      ? t('ui.regionOrdinal', { n: Game.State.regionTier(s.toRid), name: regionName(s.toRid) })
      : t('ui.travelDestination', { name: regionName(s.toRid) });
    if (s.boss && s.boss.first) {
      els.sub.textContent = t('ui.travelReward', { n: Game.F.bossCrystal(s.boss.tier) });
    } else {
      els.sub.textContent = s.firstEntry ? t('ui.travelFirstEntry') : t('ui.travelRouteReady');
    }
    els.actions.classList.toggle('hidden', !s.cancellable);
    els.hint.textContent = s.phase === 'arrive' && s.phaseProgress >= 0.35
      ? t('ui.travelFastForwardHint')
      : (s.cancellable ? t('ui.travelCancelHint') : '');
  }

  function renderDeath(s) {
    els.eyebrow.textContent = s.fallbackRid ? t('ui.recoveryFallbackTitle') : t('ui.recoveryTitle');
    els.route.classList.toggle('hidden', !s.fallbackRid);
    els.from.textContent = regionName(s.fromRid);
    els.to.textContent = regionName(s.fallbackRid);
    els.title.textContent = s.fallbackRid
      ? t('ui.recoveryFallback', { name: regionName(s.fallbackRid) })
      : t('ui.recoveryAtCamp');
    els.sub.textContent = s.byBoss ? t('ui.recoveryBossNote') : t('ui.recoveryNoPenalty');
    els.actions.classList.add('hidden');
    var canFast = s.phase === 'soul' || (s.phase === 'down' && s.phaseProgress >= 0.9);
    els.hint.textContent = canFast ? t('ui.recoveryFastForwardHint') : '';
  }

  var UI = Game.ui = Game.ui || {};
  UI.transitions = {
    init: function () {
      root = document.getElementById('transition-root');
      if (!root) return;
      root.innerHTML =
        '<div class="transition-shade"></div>' +
        '<div class="transition-pixel-curtain" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div class="transition-beam" aria-hidden="true"></div>' +
        '<section class="transition-card jrpg-box" role="status">' +
          '<div class="transition-eyebrow"></div>' +
          '<div class="transition-route"><span class="transition-from"></span><b aria-hidden="true">◇</b><span class="transition-to"></span></div>' +
          '<h2 class="transition-title"></h2>' +
          '<p class="transition-sub"></p>' +
          '<div class="transition-phase"></div>' +
          '<div class="transition-meter"><span></span></div>' +
          '<div class="transition-actions">' +
            '<button class="btn gold travel-now" type="button"></button>' +
            '<button class="btn travel-stay" type="button"></button>' +
          '</div>' +
          '<div class="transition-hint"></div>' +
        '</section>';
      els = {
        eyebrow: root.querySelector('.transition-eyebrow'),
        route: root.querySelector('.transition-route'),
        from: root.querySelector('.transition-from'),
        to: root.querySelector('.transition-to'),
        title: root.querySelector('.transition-title'),
        sub: root.querySelector('.transition-sub'),
        phase: root.querySelector('.transition-phase'),
        meter: root.querySelector('.transition-meter span'),
        actions: root.querySelector('.transition-actions'),
        now: root.querySelector('.travel-now'),
        stay: root.querySelector('.travel-stay'),
        hint: root.querySelector('.transition-hint')
      };
      els.now.addEventListener('click', function (e) {
        e.stopPropagation();
        Game.transitions.departNow();
      });
      els.stay.addEventListener('click', function (e) {
        e.stopPropagation();
        Game.transitions.cancel('button');
      });
      root.addEventListener('pointerdown', function (e) {
        if (e.target.closest && e.target.closest('button')) return;
        if (Game.transitions) Game.transitions.fastForward();
      });
      bus.on('locale:changed', function () {
        if (lastSnapshot) UI.transitions.render(lastSnapshot);
      });
    },

    show: function (snapshot) {
      if (!root) return;
      root.classList.remove('hidden');
      setLocked(true);
      UI.transitions.render(snapshot);
    },

    render: function (snapshot) {
      if (!root || !snapshot) return;
      lastSnapshot = snapshot;
      root.className = 'transition-root kind-' + snapshot.kind + ' phase-' + snapshot.phase +
        (snapshot.reduced ? ' reduced' : '');
      root.setAttribute('data-phase', snapshot.phase);
      root.setAttribute('aria-label', phaseCopy(snapshot));
      els.now.textContent = t('ui.travelNow');
      els.stay.textContent = t('ui.stayRegion');
      if (snapshot.kind === 'region') renderRegion(snapshot);
      else renderDeath(snapshot);
      els.phase.textContent = phaseCopy(snapshot);
      els.meter.style.width = Math.round(progressValue(snapshot) * 100) + '%';
    },

    hide: function () {
      if (!root) return;
      root.className = 'transition-root hidden';
      root.removeAttribute('data-phase');
      lastSnapshot = null;
      setLocked(false);
    }
  };
})();
