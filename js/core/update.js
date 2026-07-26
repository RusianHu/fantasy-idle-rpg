/* ============================================================
 * core/update.js — 长开页面发布版本检查
 * version.json 必须由服务器 no-store；发现新版本后由玩家确认重载。
 * ============================================================ */
(function () {
  'use strict';

  var Game = window.Game;
  var CHECK_INTERVAL = 5 * 60 * 1000;
  var lastCheck = 0;
  var checking = false;
  var availableBuild = '';
  var notice = null;

  function text(key, vars) {
    return Game.i18n && Game.i18n.t ? Game.i18n.t(key, vars) : key;
  }

  function refreshNoticeText() {
    if (!notice || !availableBuild) return;
    notice.textContent = text('ui.updateAvailable', { version: availableBuild });
  }

  function reloadSafely() {
    if (!notice) return;
    notice.disabled = true;
    notice.textContent = text('ui.updateApplying');
    try {
      if (Game.transitions) Game.transitions.settleBeforeSave();
      if (Game.save) Game.save.save('app-update');
    } catch (e) {
      console.warn('[Update] 保存当前状态失败，将继续由页面卸载钩子兜底', e);
    }
    window.location.reload();
  }

  function showNotice(buildId) {
    availableBuild = buildId;
    if (notice) {
      refreshNoticeText();
      return;
    }
    notice = document.createElement('button');
    notice.id = 'app-update-notice';
    notice.className = 'jrpg-box';
    notice.type = 'button';
    notice.setAttribute('aria-live', 'polite');
    notice.addEventListener('click', reloadSafely);
    document.body.appendChild(notice);
    refreshNoticeText();
  }

  function versionUrl() {
    var url = new URL('version.json', document.baseURI);
    url.searchParams.set('_', String(Date.now()));
    return url.href;
  }

  function check(force) {
    if (!window.fetch || window.location.protocol === 'file:' || document.hidden) return;
    var now = Date.now();
    if (checking || availableBuild || (!force && now - lastCheck < CHECK_INTERVAL)) return;
    checking = true;
    lastCheck = now;
    fetch(versionUrl(), {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (release) {
      var buildId = release && String(release.buildId || '');
      if (buildId && buildId !== Game.BUILD_ID) showNotice(buildId);
    }).catch(function () {
      /* 网络离线或发布切换中的短暂失败不打扰挂机。 */
    }).then(function () {
      checking = false;
    });
  }

  function init() {
    setTimeout(function () { check(true); }, 5000);
    setInterval(function () { check(false); }, CHECK_INTERVAL);
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) check(true);
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check(true);
    });
    if (Game.bus) Game.bus.on('locale:changed', refreshNoticeText);
  }

  Game.updateChecker = {
    check: function () { check(true); },
    availableBuild: function () { return availableBuild; }
  };

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init, { once: true });
})();
