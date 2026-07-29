/* ============================================================
 * ui/panels_misc.js — 技能 / 地图 / 设置 面板
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus, reg = Game.reg;

  var UI = Game.ui;
  var mapSub = 'region-map';

  /* ================= 技能面板（按职业过滤） ================= */
  UI.panels.skills = function (root) {
    var t = Game.i18n.t;
    var s = Game.state, p = s.player;
    var cid = p.classId;
    var clsName = cid ? t('class.' + cid + '.name') : '';

    root.appendChild(U.el('div', 'panel-title', t('ui.tab.skills') +
      (clsName ? ' <span style="font-size:11px;color:var(--ink-dim)">' + clsName + '</span>' : '') +
      '<span style="font-size:12px;color:var(--gold)">' + t('ui.spLeft', { n: p.sp }) + '</span>'));

    var autoRow = U.el('div', 'card automation-card', '<div class="row"><div class="grow">' +
      '<div class="name">' + t('settings.autoSkillUpgrade') + '</div>' +
      '<div class="desc">' + t('settings.autoSkillUpgradeHint') + '</div></div>' +
      '<button type="button" role="switch" aria-label="' + U.esc(t('settings.autoSkillUpgrade')) +
      '" aria-checked="' + (s.settings.autoSkillUpgrade ? 'true' : 'false') +
      '" class="toggle' + (s.settings.autoSkillUpgrade ? ' on' : '') + '"></button></div>');
    autoRow.querySelector('.toggle').addEventListener('click', function () {
      Game.auto.setAutoSkillUpgrade(!s.settings.autoSkillUpgrade);
      UI.tabs.rerender();
    });
    root.appendChild(autoRow);

    var list = reg.all('skill').filter(function (sk) { return sk.cls === cid; });
    if (!list.length) {
      root.appendChild(U.el('div', 'card', '<div class="desc">' + t('ui.noClassYet') + '</div>'));
      return;
    }

    list.forEach(function (sk) {
      var lv = p.skills[sk.id] || 0;
      var talent = Game.content.get('talent', sk.id);
      var unlockLevel = talent ? talent.unlockLevel : sk.unlockLv || 1;
      var maxRank = talent ? talent.maxRank : Game.SKILL_MAX_LV;
      var cost = talent
        ? (talent.costs.length === 1
          ? talent.costs[0]
          : talent.costs[Math.min(lv, talent.costs.length - 1)])
        : 1;
      var locked = p.level < unlockLevel;
      var maxed = lv >= maxRank;
      var descRank = sk.type === 'active' ? lv : Math.max(1, lv);
      var vars = sk.descVars ? sk.descVars(descRank) : {};
      var typeTxt = sk.type === 'active'
        ? t('ui.skillActive', { cd: sk.cd })
        : t('ui.skillPassive');
      var lvTxt = sk.type === 'passive' && lv === 0
        ? t('ui.skillNotLearned')
        : 'Lv.' + lv;

      var card = U.el('div', 'card' + (locked ? ' locked' : ''),
        '<div class="row">' +
        '<div class="skill-ico"><canvas width="30" height="30" data-icon="' + sk.icon + '"></canvas></div>' +
        '<div class="grow">' +
        '<div class="name">' + t('skill.' + sk.id + '.name') +
        ' <span class="skill-lv">' + lvTxt + '</span>' +
        ' <span class="badge">' + typeTxt + '</span></div>' +
        '<div class="desc">' + t('skill.' + sk.id + '.desc', vars) +
        (lv === 0 && sk.type === 'active' ? '<br>' + t('ui.skillBaseNote') : '') + '</div>' +
        (locked ? '<div class="desc" style="color:var(--danger)">' + t('ui.needLevel', { lv: unlockLevel }) + '</div>' : '') +
        '</div>' +
        '<button class="btn small up-btn">' + (maxed ? t('ui.maxed') : t('ui.upgrade')) + '</button>' +
        '</div>');
      var btn = card.querySelector('.up-btn');
      btn.disabled = locked || maxed || p.sp < cost;
      btn.addEventListener('click', function () {
        if (Game.player.upgradeSkill(sk.id)) {
          Game.ui.modals.toast(t('ui.skillUp', { name: t('skill.' + sk.id + '.name') }));
          UI.tabs.rerender();
        }
      });
      root.appendChild(card);
    });
  };

  /* ================= 地图面板 ================= */
  UI.panels.map = function (root) {
    var t = Game.i18n.t;
    var s = Game.state;
    var mapCleanup = null;

    root.appendChild(U.el('div', 'panel-title', t('ui.tab.map')));

    var seedHex = U.hex32(s.world.worldSeed);
    var seedRow = U.el('div', 'world-seed-row',
      '<div class="grow"><div class="name">' + t('ui.worldSeed') + '</div>' +
      '<div class="desc">' + t('ui.worldSeedHint') + '</div></div>' +
      '<code aria-label="' + U.esc(t('ui.worldSeed')) + '">' + seedHex + '</code>' +
      '<button class="btn small seed-copy" type="button">' + t('ui.copySeed') + '</button>');
    seedRow.querySelector('.seed-copy').addEventListener('click', function () {
      var helper = U.el('textarea');
      helper.value = seedHex;
      helper.setAttribute('readonly', 'readonly');
      helper.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
      document.body.appendChild(helper);
      helper.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(helper);
      if (navigator.clipboard) navigator.clipboard.writeText(seedHex).catch(function () {});
      Game.ui.modals.toast(t('ui.seedCopied', { seed: seedHex }));
    });
    root.appendChild(seedRow);

    var subtabs = U.el('div', 'subtabs');
    [
      ['region-map', 'explore.mapTab'],
      ['codex', 'explore.codexTab']
    ].forEach(function (def) {
      var btn = U.el('button', 'subtab' + (mapSub === def[0] ? ' active' : ''), t(def[1]));
      btn.type = 'button';
      btn.addEventListener('click', function () { mapSub = def[0]; UI.tabs.rerender(); });
      subtabs.appendChild(btn);
    });
    root.appendChild(subtabs);

    var rid = s.world.region;
    var summary = Game.collection && Game.collection.regionSummary(rid);
    if (Game.world.layout && Game.world.layout.version >= 3 && summary) {
      if (mapSub === 'region-map') {
        var mapCard = U.el('section', 'card exploration-map-card');
        var ready = summary.readiness;
        mapCard.innerHTML =
          '<div class="exploration-map-head"><div><div class="name">' +
          U.esc(t('region.' + rid + '.name')) + '</div><div class="desc">' +
          '<span data-map-coverage>' + t('explore.coverageLine', { p: Math.floor(summary.coverage * 100) }) +
          '</span></div></div><strong class="readiness-total" data-map-ready="total">' + ready.total + '/100</strong></div>' +
          '<div class="readiness-grid">' +
          '<span>' + t('explore.readyExplore') + '<b data-map-ready="exploration">' + ready.exploration + '/30</b></span>' +
          '<span>' + t('explore.readyLandmarks') + '<b data-map-ready="landmarks">' + ready.landmarks + '/25</b></span>' +
          '<span>' + t('explore.readyResources') + '<b data-map-ready="resources">' + ready.resources + '/18</b></span>' +
          '<span>' + t('explore.readyCurios') + '<b data-map-ready="curios">' + ready.curios + '/12</b></span>' +
          '<span>' + t('explore.readyGuardian') + '<b data-map-ready="guardian">' + ready.guardian + '/15</b></span>' +
          '<span>' + t('explore.readyLair') + '<b data-map-ready="lair">' + (ready.lair ? t('explore.yes') : t('explore.no')) + '</b></span>' +
          '</div>';
        var viewport = U.el('div', 'region-map-viewport');
        var canvas = document.createElement('canvas');
        canvas.width = 660; canvas.height = 396;
        canvas.setAttribute('data-live-region-map', rid);
        canvas.setAttribute('aria-label', t('explore.mapAria'));
        viewport.appendChild(canvas);
        mapCard.appendChild(viewport);
        var controls = U.el('div', 'map-zoom-controls',
          '<button class="btn small" type="button" data-zoom="-1" aria-label="' + U.esc(t('explore.zoomOut')) + '">−</button>' +
          '<button class="btn small" type="button" data-center="1">' + U.esc(t('explore.centerHero')) + '</button>' +
          '<button class="btn small" type="button" data-zoom="1" aria-label="' + U.esc(t('explore.zoomIn')) + '">+</button>');
        mapCard.appendChild(controls);
        root.appendChild(mapCard);

        var base = document.createElement('canvas');
        base.width = 660; base.height = 396;
        var view = { zoom: 1, x: 0, y: 0 };
        var pointers = Object.create(null);
        var pointerOrder = [];
        var pinch = null;
        var zoomOutButton = controls.querySelector('[data-zoom="-1"]');
        var zoomInButton = controls.querySelector('[data-zoom="1"]');
        var baseDirty = false;
        var summaryDirty = false;
        var stopped = false;
        var liveFrame = 0;
        var lastBasePaint = 0;
        var lastHeroPaint = 0;
        var BASE_REFRESH_MS = 200;
        var HERO_REFRESH_MS = 100;
        var subscribed = false;

        function paintBase() {
          Game.exploration.drawMap(base.getContext('2d'), rid, base.width, base.height, { hero: false });
          baseDirty = false;
        }

        function drawHero(g, sw, sh) {
          var world = Game.world;
          var hero = world && world.hero;
          var layout = world && world.layout;
          if (!hero || !layout || !world.region || world.region.id !== rid) return;
          var hx = hero.x / layout.world.w * base.width;
          var hy = hero.y / layout.world.h * base.height;
          var x = (hx - view.x) / sw * canvas.width;
          var y = (hy - view.y) / sh * canvas.height;
          if (x < -7 || y < -7 || x > canvas.width + 7 || y > canvas.height + 7) return;
          g.fillStyle = 'rgba(7,9,18,.88)';
          g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
        }

        function draw() {
          var g = canvas.getContext('2d');
          g.imageSmoothingEnabled = false;
          g.clearRect(0, 0, canvas.width, canvas.height);
          var sw = base.width / view.zoom, sh = base.height / view.zoom;
          view.x = U.clamp(view.x, 0, base.width - sw);
          view.y = U.clamp(view.y, 0, base.height - sh);
          g.drawImage(base, view.x, view.y, sw, sh, 0, 0, canvas.width, canvas.height);
          drawHero(g, sw, sh);
          zoomOutButton.disabled = view.zoom <= 1.0001;
          zoomInButton.disabled = view.zoom >= 2.9999;
          canvas.setAttribute('data-map-zoom', view.zoom.toFixed(4));
          canvas.setAttribute('data-map-view-x', view.x.toFixed(4));
          canvas.setAttribute('data-map-view-y', view.y.toFixed(4));
        }

        function updateSummary() {
          var next = Game.collection && Game.collection.regionSummary(rid);
          if (!next) {
            summaryDirty = false;
            return;
          }
          var nextReady = next.readiness;
          mapCard.querySelector('[data-map-coverage]').textContent =
            t('explore.coverageLine', { p: Math.floor(next.coverage * 100) });
          mapCard.querySelector('[data-map-ready="total"]').textContent = nextReady.total + '/100';
          mapCard.querySelector('[data-map-ready="exploration"]').textContent = nextReady.exploration + '/30';
          mapCard.querySelector('[data-map-ready="landmarks"]').textContent = nextReady.landmarks + '/25';
          mapCard.querySelector('[data-map-ready="resources"]').textContent = nextReady.resources + '/18';
          mapCard.querySelector('[data-map-ready="curios"]').textContent = nextReady.curios + '/12';
          mapCard.querySelector('[data-map-ready="guardian"]').textContent = nextReady.guardian + '/15';
          mapCard.querySelector('[data-map-ready="lair"]').textContent =
            nextReady.lair ? t('explore.yes') : t('explore.no');
          var regionCoverage = root.querySelector('[data-region-coverage="' + rid + '"]');
          if (regionCoverage) {
            regionCoverage.textContent = t('explore.coverageLine', {
              p: Math.floor(next.coverage * 100)
            });
          }
          summaryDirty = false;
        }

        function onMapStateChanged(payload) {
          if (payload && payload.rid && payload.rid !== rid) return;
          baseDirty = true;
          summaryDirty = true;
        }

        function subscribe() {
          if (subscribed) return;
          subscribed = true;
          Game.bus.on('readiness:changed', onMapStateChanged);
        }

        function pause() {
          if (liveFrame) cancelAnimationFrame(liveFrame);
          liveFrame = 0;
          if (subscribed) Game.bus.off('readiness:changed', onMapStateChanged);
          subscribed = false;
        }

        function resume() {
          if (stopped || document.hidden || liveFrame) return;
          baseDirty = true;
          summaryDirty = true;
          subscribe();
          liveFrame = requestAnimationFrame(liveTick);
        }

        function onVisibilityChange() {
          if (document.hidden) pause();
          else resume();
        }

        function cleanup() {
          if (stopped) return;
          stopped = true;
          pause();
          document.removeEventListener('visibilitychange', onVisibilityChange);
        }

        function liveTick(ts) {
          if (stopped) return;
          if (!canvas.isConnected || UI.tabs.current() !== 'map' || mapSub !== 'region-map') {
            cleanup();
            return;
          }
          if (summaryDirty) updateSummary();
          if (baseDirty && ts - lastBasePaint >= BASE_REFRESH_MS) {
            paintBase();
            lastBasePaint = ts;
          }
          if (ts - lastHeroPaint >= HERO_REFRESH_MS) {
            draw();
            lastHeroPaint = ts;
          }
          liveFrame = requestAnimationFrame(liveTick);
        }
        function canvasPoint(clientX, clientY) {
          var rect = canvas.getBoundingClientRect();
          return {
            x: (clientX - rect.left) / (rect.width || 1) * canvas.width,
            y: (clientY - rect.top) / (rect.height || 1) * canvas.height
          };
        }

        function mapPointAt(cx, cy) {
          return {
            x: view.x + cx / canvas.width * base.width / view.zoom,
            y: view.y + cy / canvas.height * base.height / view.zoom
          };
        }

        function setZoom(nextZoom, cx, cy, anchor) {
          nextZoom = U.clamp(nextZoom, 1, 3);
          if (!Number.isFinite(nextZoom)) return false;
          var zoomChanged = Math.abs(nextZoom - view.zoom) >= 0.0001;
          if (!zoomChanged && !anchor) return false;
          cx = cx === undefined || cx === null ? canvas.width / 2 : cx;
          cy = cy === undefined || cy === null ? canvas.height / 2 : cy;
          anchor = anchor || mapPointAt(cx, cy);
          view.zoom = nextZoom;
          view.x = anchor.x - cx / canvas.width * base.width / view.zoom;
          view.y = anchor.y - cy / canvas.height * base.height / view.zoom;
          draw();
          return zoomChanged;
        }

        function stepZoom(direction) {
          setZoom(view.zoom * (direction > 0 ? 1.35 : 1 / 1.35));
        }

        function pointerPair() {
          return [pointers[pointerOrder[0]], pointers[pointerOrder[1]]];
        }

        function beginPinch() {
          var pair = pointerPair();
          var dx = pair[1].x - pair[0].x, dy = pair[1].y - pair[0].y;
          var midpoint = canvasPoint((pair[0].x + pair[1].x) / 2, (pair[0].y + pair[1].y) / 2);
          pinch = {
            distance: Math.max(1, Math.sqrt(dx * dx + dy * dy)),
            zoom: view.zoom,
            anchor: mapPointAt(midpoint.x, midpoint.y)
          };
        }

        function removePointer(pointerId) {
          if (!pointers[pointerId]) return;
          delete pointers[pointerId];
          var index = pointerOrder.indexOf(pointerId);
          if (index >= 0) pointerOrder.splice(index, 1);
          pinch = null;
          if (pointerOrder.length === 2) beginPinch();
        }

        zoomOutButton.addEventListener('click', function () { stepZoom(-1); });
        zoomInButton.addEventListener('click', function () { stepZoom(1); });
        controls.querySelector('[data-center]').addEventListener('click', function () {
          var hero = Game.world.hero;
          view.zoom = Math.max(1.5, view.zoom);
          view.x = hero.x / Game.world.layout.world.w * base.width - base.width / view.zoom / 2;
          view.y = hero.y / Game.world.layout.world.h * base.height - base.height / view.zoom / 2;
          draw();
        });
        canvas.addEventListener('wheel', function (e) {
          var delta = e.deltaY;
          if (e.deltaMode === 1) delta *= 16;
          else if (e.deltaMode === 2) delta *= canvas.clientHeight || canvas.height;
          delta = U.clamp(delta, -240, 240);
          if (!delta) return;
          var point = canvasPoint(e.clientX, e.clientY);
          if (setZoom(view.zoom * Math.exp(-delta * 0.0015), point.x, point.y)) {
            e.preventDefault();
          }
        }, { passive: false });
        canvas.addEventListener('pointerdown', function (e) {
          if ((e.pointerType === 'mouse' && e.button !== 0) || pointerOrder.length >= 2) return;
          pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
          pointerOrder.push(e.pointerId);
          try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
          if (pointerOrder.length === 2) beginPinch();
        });
        canvas.addEventListener('pointermove', function (e) {
          var pointer = pointers[e.pointerId];
          if (!pointer) return;
          var dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
          pointer.x = e.clientX; pointer.y = e.clientY;
          if (pointerOrder.length === 1) {
            view.x -= dx / (canvas.clientWidth || 1) * base.width / view.zoom;
            view.y -= dy / (canvas.clientHeight || 1) * base.height / view.zoom;
            draw();
            return;
          }
          if (!pinch) beginPinch();
          var pair = pointerPair();
          var pdx = pair[1].x - pair[0].x, pdy = pair[1].y - pair[0].y;
          var midpoint = canvasPoint((pair[0].x + pair[1].x) / 2, (pair[0].y + pair[1].y) / 2);
          setZoom(pinch.zoom * Math.sqrt(pdx * pdx + pdy * pdy) / pinch.distance,
            midpoint.x, midpoint.y, pinch.anchor);
        });
        canvas.addEventListener('pointerup', function (e) { removePointer(e.pointerId); });
        canvas.addEventListener('pointercancel', function (e) { removePointer(e.pointerId); });
        canvas.addEventListener('lostpointercapture', function (e) { removePointer(e.pointerId); });
        paintBase();
        draw();
        lastBasePaint = performance.now();
        lastHeroPaint = lastBasePaint;
        document.addEventListener('visibilitychange', onVisibilityChange);
        if (!document.hidden) {
          subscribe();
          liveFrame = requestAnimationFrame(liveTick);
        }
        mapCleanup = cleanup;
      } else {
        var codex = U.el('section', 'exploration-codex');
        [
          ['landmarks', summary.landmarks],
          ['resources', summary.resources],
          ['curios', summary.curios],
          ['ecology', summary.ecology]
        ].forEach(function (line) {
          codex.appendChild(U.el('div', 'card codex-progress',
            '<div class="row"><div class="grow"><div class="name">' + t('explore.' + line[0]) +
            '</div><div class="desc">' + t('explore.registeredHint') + '</div></div>' +
            '<strong>' + line[1].found + '/' + line[1].total + '</strong></div>'));
        });
        var state = Game.exploration.regionState(rid);
        var content = Game.world.layout;
        var regionContent = reg.get('region', rid).exploration;
        [
          ['landmarks', content.landmarks],
          ['resources', regionContent.resources],
          ['curios', content.curios],
          ['ecology', content.ecology]
        ].forEach(function (group) {
          var list = U.el('div', 'card codex-list');
          list.appendChild(U.el('div', 'name', t('explore.' + group[0])));
          group[1].forEach(function (entry) {
            var known = !!state.discovered[group[0]][entry.defId || entry.id];
            list.appendChild(U.el('div', 'codex-entry' + (known ? ' known' : ''),
              '<span class="codex-mark"></span><span>' +
              U.esc(known ? t(entry.nameKey || 'material.' + entry.material) : t('explore.unknownEntry')) +
              '</span>'));
          });
          codex.appendChild(list);
        });

        var commissions = U.el('div', 'card commission-card');
        commissions.appendChild(U.el('div', 'name', t('explore.commissions')));
        Game.expedition.commissionDefs(rid).forEach(function (def) {
          var costs = Object.keys(def.costs).map(function (mat) {
            return t('material.' + mat) + ' ' + (s.inv.materials[mat] || 0) + '/' + def.costs[mat];
          }).join(' · ');
          var row = U.el('div', 'commission-row',
            '<div class="grow"><div class="name">' + t('explore.commission.' + def.reward) +
            '</div><div class="desc">' + U.esc(costs) + '</div></div>' +
            '<button class="btn small" type="button">' + t('explore.exchange') + '</button>');
          row.querySelector('button').addEventListener('click', function () {
            var result = Game.expedition.commission(def.id, rid);
            Game.ui.modals.toast(t(result.ok ? 'explore.exchangeDone' : 'explore.exchangeFail'),
              result.ok ? 'gold' : 'warn');
            UI.tabs.rerender();
          });
          commissions.appendChild(row);
        });
        codex.appendChild(commissions);
        root.appendChild(codex);
        var codexEvents = ['landmark:discovered', 'resource:registered', 'curio:found',
          'ecology:recorded', 'guardian:defeated'];
        var onCodexChanged = function (payload) {
          if (!payload || !payload.rid || payload.rid === rid) UI.tabs.queueRerender();
        };
        codexEvents.forEach(function (eventName) { Game.bus.on(eventName, onCodexChanged); });
        mapCleanup = function () {
          codexEvents.forEach(function (eventName) { Game.bus.off(eventName, onCodexChanged); });
        };
      }
    }

    // 自动推进开关
    var autoRow = U.el('div', 'card', '<div class="row"><div class="grow">' +
      '<div class="name">' + t('settings.autoAdvance') + '</div>' +
      '<div class="desc">' + t('settings.autoAdvanceHint') + '</div></div>' +
      '<button type="button" role="switch" aria-label="' + U.esc(t('settings.autoAdvance')) +
      '" aria-checked="' + (s.settings.autoAdvance ? 'true' : 'false') +
      '" class="toggle' + (s.settings.autoAdvance ? ' on' : '') + '"></button></div>');
    autoRow.querySelector('.toggle').addEventListener('click', function () {
      s.settings.autoAdvance = !s.settings.autoAdvance;
      this.classList.toggle('on', s.settings.autoAdvance);
      this.setAttribute('aria-checked', s.settings.autoAdvance ? 'true' : 'false');
    });
    root.appendChild(autoRow);

    Game.State.regionOrder().forEach(function (rid) {
      var r = reg.get('region', rid);
      var unlocked = Game.prog.isUnlocked(r.id);
      var finalRelocked = Game.prog.isFinalRegionLocked(r.id);
      var prog = Game.State.regionProg(r.id);
      var isCurrent = s.world.region === r.id;
      var lvMin = (Game.State.regionTier(r.id) - 1) * 8 + 1;

      var status = '';
      if (isCurrent) status = '<span class="badge" style="color:var(--gold)">' + t('ui.current') + '</span>';
      else if (finalRelocked) status = '<span class="badge" style="color:var(--danger)">🔒 ' +
        t('ui.finalRegionRelocked') + '</span>';
      else if (!unlocked) status = '<span class="badge">🔒 ' + t('ui.locked') + '</span>';
      if (prog.cleared) status += '<span class="badge" style="color:var(--ok)">✓ ' + t('ui.cleared') + '</span>';

      var card = U.el('div', 'card region-card' + (isCurrent ? ' current' : '') + (unlocked ? '' : ' locked'),
        '<div class="row">' +
        '<div class="thumb"><canvas width="26" height="26" class="region-thumb"></canvas></div>' +
        '<div class="grow">' +
        '<div class="name">' + t('region.' + r.id + '.name') + status + '</div>' +
        '<div class="desc">' + t('region.' + r.id + '.desc') + '</div>' +
        '<div class="desc">' + t('ui.recommendLv', { lv: lvMin }) + '　·　<span data-region-coverage="' +
        U.esc(r.id) + '">' +
        (Game.collection && Game.collection.regionSummary(r.id)
          ? t('explore.coverageLine', { p: Math.floor(Game.collection.regionSummary(r.id).coverage * 100) })
          : t('ui.huntGauge') + ' ' + Math.min(prog.kills, r.killTarget) + '/' + r.killTarget) + '</span></div>' +
        '</div>' +
        '<button class="btn small go-btn">' + t('ui.goRegion') + '</button>' +
        '</div>');

      // 区域缩略图：天空 + 地表 + 点缀
      var tc = card.querySelector('.region-thumb');
      var g = tc.getContext('2d');
      var grad = g.createLinearGradient(0, 0, 0, 10);
      grad.addColorStop(0, r.skyTop); grad.addColorStop(1, r.skyBottom);
      g.fillStyle = grad; g.fillRect(0, 0, 26, 10);
      g.fillStyle = r.terrain.base.colors[0]; g.fillRect(0, 10, 26, 16);
      g.fillStyle = r.terrain.base.colors[1];
      for (var i = 0; i < 14; i++) g.fillRect((i * 7) % 26, 10 + (i * 5) % 16, 2, 2);
      if (r.terrain.patches[0]) {
        g.fillStyle = r.terrain.patches[0].colors[0];
        g.fillRect(4, 16, 7, 5); g.fillRect(16, 20, 6, 4);
      }

      var btn = card.querySelector('.go-btn');
      btn.disabled = !unlocked || isCurrent;
      btn.addEventListener('click', function () {
        if (Game.prog.requestRegion(r.id, { source: 'map' })) {
          Game.ui.tabs.open('battle', true);
        }
      });
      root.appendChild(card);
    });
    return mapCleanup;
  };

  /* ================= 设置面板 ================= */
  UI.panels.settings = function (root) {
    var t = Game.i18n.t;
    var s = Game.state;

    root.appendChild(U.el('div', 'panel-title', t('ui.tab.settings')));

    function toggleRow(label, hint, value, onChange) {
      var row = U.el('div', 'setting-row', '<div><div>' + label + '</div>' +
        (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>' +
        '<button type="button" role="switch" aria-label="' + U.esc(label) +
        '" aria-checked="' + (value ? 'true' : 'false') +
        '" class="toggle' + (value ? ' on' : '') + '"></button>');
      row.querySelector('.toggle').addEventListener('click', function () {
        var v = !this.classList.contains('on');
        this.classList.toggle('on', v);
        this.setAttribute('aria-checked', v ? 'true' : 'false');
        onChange(v);
      });
      return row;
    }

    // 语言
    var langRow = U.el('div', 'setting-row', '<div>' + t('settings.language') + '</div>');
    var sel = U.el('select');
    [['zh-CN', '简体中文'], ['en', 'English']].forEach(function (pair) {
      var opt = U.el('option', '', pair[1]);
      opt.value = pair[0];
      if (Game.i18n.locale() === pair[0]) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      s.settings.lang = sel.value;
      Game.i18n.setLocale(sel.value);
    });
    langRow.appendChild(sel);
    root.appendChild(langRow);

    // 自动战斗策略与有限 Tactics：只开放可理解、可持久化的阈值。
    var strategyRow = U.el('div', 'setting-row',
      '<div><div>' + t('settings.combatStrategy') + '</div><div class="hint">' +
      t('settings.combatStrategyHint') + '</div></div>');
    var strategySelect = U.el('select');
    ['safe', 'balanced', 'aggressive'].forEach(function (id) {
      var option = U.el('option', '', t('combat.strategy.' + id));
      option.value = id;
      option.selected = s.settings.combatStrategy === id;
      strategySelect.appendChild(option);
    });
    strategySelect.addEventListener('change', function () {
      s.settings.combatStrategy = strategySelect.value;
      if (Game.world.hero) Game.combatAI.strategy(Game.world.hero.id, strategySelect.value);
      bus.emit('settings:changed', { key: 'combatStrategy', value: strategySelect.value });
    });
    strategyRow.appendChild(strategySelect);
    root.appendChild(strategyRow);

    var tacticsHead = U.el('div', '', t('settings.combatTactics'));
    tacticsHead.style.cssText = 'font-size:12px;color:var(--gold);margin:10px 0 4px;';
    root.appendChild(tacticsHead);
    [
      ['healThreshold', 'settings.tacticHeal', 20, 90, 5, 50],
      ['defenseThreshold', 'settings.tacticDefense', 20, 90, 5, 45],
      ['dodgeDamageThreshold', 'settings.tacticDodge', 5, 50, 5, 12]
    ].forEach(function (spec) {
      var current = Math.round(Number(s.settings.combatTactics[spec[0]] === undefined
        ? spec[5] / 100 : s.settings.combatTactics[spec[0]]) * 100);
      var row = U.el('div', 'setting-row', '<div><div>' + t(spec[1]) +
        '</div><div class="hint" data-tactic-value>' + current + '%</div></div>');
      var input = U.el('input');
      input.type = 'range'; input.min = spec[2]; input.max = spec[3]; input.step = spec[4];
      input.value = current;
      input.addEventListener('input', function () {
        s.settings.combatTactics[spec[0]] = Number(input.value) / 100;
        if (Game.world.hero) Game.world.hero.tactics = Object.assign({}, s.settings.combatTactics);
        row.querySelector('[data-tactic-value]').textContent = input.value + '%';
        bus.emit('settings:changed', { key: 'combatTactics', value: s.settings.combatTactics });
      });
      row.appendChild(input);
      root.appendChild(row);
    });

    // 特效
    root.appendChild(toggleRow(t('settings.effects'), t('settings.effectsHint'), s.settings.effects, function (v) {
      s.settings.effects = v;
      Game.particles.setEnabled(v);
      bus.emit('settings:changed', { key: 'effects', value: v });
    }));

    // 战利品落地拾取（运行中关闭会由 world 立即保底结算全部在地物）。
    root.appendChild(toggleRow(
      t('settings.groundLoot'),
      t('settings.groundLootHint'),
      s.settings.groundLoot !== false,
      function (v) {
        s.settings.groundLoot = v;
        bus.emit('settings:changed', { key: 'groundLoot', value: v });
      }
    ));

    // 自动回营只在自动操控生效；完整休整后自动拔营。
    root.appendChild(toggleRow(
      t('settings.autoCampRest'),
      t('settings.autoCampRestHint'),
      !!s.settings.autoCampRest,
      function (v) {
        s.settings.autoCampRest = v;
        bus.emit('settings:changed', { key: 'autoCampRest', value: v });
      }
    ));

    // 药水阈值
    var potRow = U.el('div', 'setting-row', '<div><div>' + t('settings.potion') + '</div>' +
      '<div class="hint" id="pot-val">' + Math.round(s.settings.potionThreshold * 100) + '%</div></div>');
    var slider = U.el('input');
    slider.type = 'range'; slider.min = '10'; slider.max = '90'; slider.step = '5';
    slider.value = Math.round(s.settings.potionThreshold * 100);
    slider.addEventListener('input', function () {
      s.settings.potionThreshold = slider.value / 100;
      potRow.querySelector('#pot-val').textContent = slider.value + '%';
      bus.emit('settings:changed', { key: 'potionThreshold', value: s.settings.potionThreshold });
    });
    potRow.appendChild(slider);
    root.appendChild(potRow);

    // 自动推进
    root.appendChild(toggleRow(t('settings.autoAdvance'), t('settings.autoAdvanceHint'), s.settings.autoAdvance, function (v) {
      s.settings.autoAdvance = v;
      bus.emit('settings:changed', { key: 'autoAdvance', value: v });
    }));

    // 自动技能与智能换装
    root.appendChild(toggleRow(
      t('settings.autoSkillUpgrade'),
      t('settings.autoSkillUpgradeHint'),
      s.settings.autoSkillUpgrade,
      function (v) { Game.auto.setAutoSkillUpgrade(v); }
    ));
    root.appendChild(toggleRow(
      t('settings.autoEquip'),
      t('settings.autoEquipHint'),
      s.settings.autoEquip,
      function (v) { Game.auto.setAutoEquip(v); }
    ));

    // 音频（占位）
    root.appendChild(toggleRow(t('settings.sfx'), t('settings.comingSoon'), s.settings.sfx, function (v) {
      s.settings.sfx = v;
      Game.audio.setMuted('sfx', !v);
    }));
    root.appendChild(toggleRow(t('settings.music'), t('settings.comingSoon'), s.settings.music, function (v) {
      s.settings.music = v;
      Game.audio.setMuted('bgm', !v);
    }));

    /* ---- 存档 ---- */
    var saveHead = U.el('div', '', t('settings.saveSection'));
    saveHead.style.cssText = 'font-size:12px;color:var(--gold);margin:14px 0 6px;';
    root.appendChild(saveHead);

    var ta = U.el('textarea');
    ta.placeholder = t('settings.importPlaceholder');
    root.appendChild(ta);

    var rowBtns = U.el('div', '');
    rowBtns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;';

    var btnExport = U.el('button', 'btn small', t('settings.exportCopy'));
    btnExport.addEventListener('click', function () {
      var b64 = Game.save.exportB64();
      ta.value = b64;
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard) navigator.clipboard.writeText(b64).catch(function () {});
      Game.ui.modals.toast(t('settings.exported'));
    });
    rowBtns.appendChild(btnExport);

    var btnFile = U.el('button', 'btn small', t('settings.exportFile'));
    btnFile.addEventListener('click', function () { Game.save.exportFile(); });
    rowBtns.appendChild(btnFile);

    var btnImport = U.el('button', 'btn small gold', t('settings.importBtn'));
    btnImport.addEventListener('click', function () {
      var txt = ta.value.trim();
      if (!txt) { Game.ui.modals.toast(t('settings.importEmpty'), 'warn'); return; }
      Game.ui.modals.confirm(t('settings.importConfirm'), function () {
        var r = Game.save.importB64(txt);
        Game.ui.modals.toast(r.ok ? t('settings.importOk') : t('settings.importBad'), r.ok ? '' : 'warn');
      });
    });
    rowBtns.appendChild(btnImport);

    var fileWrap = U.el('label', 'btn small', t('settings.importFile'));
    var fileInput = U.el('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        Game.ui.modals.confirm(t('settings.importConfirm'), function () {
          var r = Game.save.importFileText(String(reader.result));
          Game.ui.modals.toast(r.ok ? t('settings.importOk') : t('settings.importBad'), r.ok ? '' : 'warn');
        });
      };
      reader.readAsText(f);
      fileInput.value = '';
    });
    fileWrap.appendChild(fileInput);
    rowBtns.appendChild(fileWrap);

    root.appendChild(rowBtns);

    // 重置
    var btnReset = U.el('button', 'btn small danger', t('settings.reset'));
    btnReset.style.marginTop = '12px';
    btnReset.addEventListener('click', function () {
      Game.ui.modals.confirm(t('settings.resetConfirm1'), function () {
        Game.ui.modals.confirm(t('settings.resetConfirm2'), function () {
          Game.save.hardReset();
        });
      });
    });
    root.appendChild(btnReset);

    // 关于
    var about = U.el('div', 'card', '<div class="desc">' + t('settings.about', { v: Game.VERSION }) + '</div>');
    about.style.marginTop = '12px';
    root.appendChild(about);
  };
})();
