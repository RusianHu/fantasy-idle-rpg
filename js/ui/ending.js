/* ============================================================
 * ui/ending.js — 最终通关全屏演出、后日谈与通关摘要
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;

  var root = null;
  var storyApi = null;
  var cinematicAdvance = null;
  var summaryHandlers = null;
  var locked = [];

  function lockBackground(flag) {
    var ids = ['hud', 'stage-wrap', 'tabbar'];
    if (flag) {
      locked = [];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (!el) continue;
        locked.push({ el: el, aria: el.getAttribute('aria-hidden') });
        el.inert = true;
        el.setAttribute('aria-hidden', 'true');
      }
      return;
    }
    for (var j = 0; j < locked.length; j++) {
      locked[j].el.inert = false;
      if (locked[j].aria === null) locked[j].el.removeAttribute('aria-hidden');
      else locked[j].el.setAttribute('aria-hidden', locked[j].aria);
    }
    locked = [];
  }

  function removeCinematicAdvance() {
    if (root && cinematicAdvance) root.removeEventListener('click', cinematicAdvance);
    cinematicAdvance = null;
  }

  function ensureRoot() {
    if (root && root.parentNode) return root;
    root = U.el('section', 'ending-root');
    root.id = 'ending-root';
    root.setAttribute('aria-live', 'polite');
    document.getElementById('app').appendChild(root);
    lockBackground(true);
    return root;
  }

  function backdrop() {
    return '<div class="ending-scene-shade"></div>' +
      '<div class="ending-dawn-wash"></div>' +
      '<div class="ending-horizon" aria-hidden="true"></div>' +
      '<div class="ending-cinematic-title"><strong>' +
      U.esc(Game.i18n.t('ending.dawnTitle')) + '</strong></div>';
  }

  function statRow(label, value, id) {
    return '<div class="ending-stat" data-ending-stat="' + id + '">' +
      '<span>' + U.esc(label) + '</span><strong>' + U.esc(value) + '</strong></div>';
  }

  var EndingUI = Game.ui.ending = {
    showCinematic: function (onAdvance, reduced) {
      EndingUI.close();
      var el = ensureRoot();
      el.className = 'ending-root cinematic' + (reduced ? ' reduced' : '');
      el.innerHTML = backdrop();
      cinematicAdvance = function () { if (onAdvance) onAdvance(); };
      el.addEventListener('click', cinematicAdvance);
    },

    setCinematicPhase: function (name) {
      var el = ensureRoot();
      el.classList.remove('impact', 'dissolve', 'dawn');
      if (name) el.classList.add(name);
      el.setAttribute('data-ending-visual', name || '');
    },

    showEpilogue: function (startLine, opts) {
      opts = opts || {};
      var el = ensureRoot();
      removeCinematicAdvance();
      if (storyApi) storyApi.close();
      storyApi = null;
      el.className = 'ending-root epilogue dawn' + (opts.restored ? ' restored' : '');
      el.innerHTML = backdrop();
      var lines = [];
      for (var i = 1; i <= 6; i++) lines.push(Game.i18n.t('ending.lines.' + i));
      storyApi = Game.ui.modals.story(lines, {
        container: el,
        maskClass: 'ending-story',
        boxClass: 'ending-story-box',
        startIndex: startLine,
        onLine: opts.onLine,
        onDone: function () {
          storyApi = null;
          if (opts.onDone) opts.onDone();
        }
      });
    },

    advanceStory: function () {
      return storyApi ? storyApi.advance() : false;
    },

    showSummary: function (handlers) {
      summaryHandlers = handlers || summaryHandlers || {};
      var el = ensureRoot();
      removeCinematicAdvance();
      if (storyApi) storyApi.close();
      storyApi = null;
      el.className = 'ending-root summary dawn';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      var t = Game.i18n.t, fmt = Game.i18n.fmtNum, p = Game.state.player;
      var cls = t('class.' + (p.classId || 'fighter') + '.name');
      var stats = Game.state.meta.stats;
      var html = '<div class="ending-summary-shade"></div>' +
        '<div class="ending-summary-shell">' +
        '<div class="ending-summary-heading"><div class="ending-summary-kicker">' +
        U.esc(t('ending.dawnTitle')) + '</div><h2 id="ending-summary-title">' +
        U.esc(t('ending.summaryTitle')) + '</h2><p>' + U.esc(t('ending.summarySubtitle')) + '</p></div>' +
        '<div class="ending-summary-panel jrpg-box" aria-labelledby="ending-summary-title">' +
        '<div class="ending-stats">' +
        statRow(t('ending.statClass'), t('ending.classLevel', { cls: cls, level: p.level }), 'class') +
        statRow(t('ending.statPlayTime'), Game.i18n.fmtDur(stats.playSec), 'play') +
        statRow(t('ending.statKills'), fmt(stats.kills), 'kills') +
        statRow(t('ending.statBossKills'), fmt(stats.bossKills), 'bosses') +
        statRow(t('ending.statWorldSeed'), U.hex32(Game.state.world.worldSeed), 'seed') +
        '</div><div class="ending-actions">' +
        '<button id="ending-continue" class="btn gold" type="button">' + U.esc(t('ending.continue')) + '</button>' +
        '<button id="ending-restart" class="btn danger" type="button">' + U.esc(t('ending.restart')) + '</button>' +
        '</div></div></div>';
      el.innerHTML = html;
      var btnContinue = document.getElementById('ending-continue');
      var btnRestart = document.getElementById('ending-restart');
      btnContinue.addEventListener('click', function () {
        if (summaryHandlers.onContinue) summaryHandlers.onContinue();
      });
      btnRestart.addEventListener('click', function () {
        Game.ui.modals.confirm(t('ending.restartConfirm'), function () {
          if (summaryHandlers.onRestart) summaryHandlers.onRestart();
        }, function () {
          setTimeout(function () { if (btnRestart.parentNode) btnRestart.focus(); }, 0);
        });
      });
      setTimeout(function () { if (btnContinue.parentNode) btnContinue.focus(); }, 0);
    },

    close: function () {
      removeCinematicAdvance();
      if (storyApi) storyApi.close();
      storyApi = null;
      summaryHandlers = null;
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
      lockBackground(false);
    }
  };

  bus.on('locale:changed', function () {
    if (root && root.classList.contains('summary') && summaryHandlers) {
      EndingUI.showSummary(summaryHandlers);
    }
  });
})();
