/* global Game, DemoI18n */
(function () {
  'use strict';

  var U = Game.util;
  var D = DemoI18n;
  var regions = [];
  var profiles = [];
  var currentIndex = 0;
  var paused = false;
  var timeMode = 'cycle';
  var lastFrame = performance.now();
  var lastUiUpdate = 0;
  var feed = [];
  var routeAudit = null;
  var mimicAudit = null;
  var labEnvironmentVisibility = 1;
  var EVENT_TYPES = [
    'hazard:clue', 'hazard:revealed', 'hazard:warning', 'hazard:activated',
    'hazard:hit', 'hazard:avoided', 'hazard:escapeRequested', 'hazard:riskAccepted',
    'hazard:ambushStarted', 'hazard:cooldown', 'hazard:reset'
  ];

  function queryParams() {
    try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(); }
  }

  function parseSeed(value) {
    value = String(value || '').trim();
    return /^[0-9a-f]{1,8}$/i.test(value) ? parseInt(value, 16) >>> 0 : null;
  }

  function regionName(region) {
    return Game.i18n.t('region.' + region.id + '.name');
  }

  function profileName(profile) {
    if (!profile) return '—';
    var value = Game.i18n.t(profile.presentation.nameKey);
    return value === profile.presentation.nameKey ? profile.id : value;
  }

  function selectedInstance() {
    return Game.hazards.get(document.getElementById('hazard-select').value);
  }

  function selectedProfile() {
    return Game.content.get('hazardProfile', document.getElementById('profile-select').value);
  }

  function updateUrl() {
    if (location.protocol === 'file:') return;
    var url = new URL(location.href);
    url.searchParams.set('seed', U.hex32(Game.state.world.worldSeed));
    url.searchParams.set('region', Game.world.region.id);
    url.searchParams.set('lang', D.locale());
    history.replaceState(null, '', url.href);
  }

  function setHeroPosition(x, y) {
    var hero = Game.world.hero;
    if (!hero) return;
    var point = Game.terrain.projectPoint(x, y, 1) || Game.world.layout.camp;
    Game.world.cancelInteraction('hazard-lab');
    hero.x = U.clamp(point.x, 24, Game.world.layout.world.w - 24);
    hero.y = U.clamp(point.y, Game.world.BOUND_TOP + 8, Game.world.layout.world.h - 24);
    hero.target = null;
    hero.moveOrder = null;
    hero.manualTarget = false;
    hero.state = 'idle';
    Game.nav.clear(hero);
    Game.exploration.revealAt(hero.x, hero.y, { force: true, rid: Game.world.region.id });
    Game.render.snapCamera(hero.x, hero.y);
  }

  function prepareManual() {
    if (Game.world.controlMode() !== 'manual') Game.world.setControlMode('manual');
    var hero = Game.world.hero;
    if (!hero) return;
    hero.target = null;
    hero.manualTarget = false;
    hero.moveOrder = null;
    hero.state = 'idle';
    Game.nav.clear(hero);
  }

  function outsideDistance(instance) {
    var trigger = instance.profile.trigger;
    var triggerRadius = trigger.shape === 'circle' ? trigger.radius :
      (trigger.shape === 'cone' ? trigger.length : Math.max(trigger.width || 0, trigger.height || 0) / 2);
    return Math.max(instance.profile.detection.clueRadius + 28, triggerRadius + 42);
  }

  function resetAtOutside(instance) {
    prepareManual();
    setHeroPosition(instance.x + outsideDistance(instance), instance.y);
    Game.hazards.update(.05);
    if (!Game.hazards.resetInstance(instance.id)) {
      activateRegion(currentIndex, instance.id);
      instance = selectedInstance();
      prepareManual();
      setHeroPosition(instance.x + outsideDistance(instance), instance.y);
      Game.hazards.update(.05);
      Game.hazards.resetInstance(instance.id);
    }
    Game.state.player.hp = Game.state.derived.maxHp;
    return instance;
  }

  function showClue() {
    var instance = selectedInstance();
    if (!instance) return false;
    paused = true;
    instance = resetAtOutside(instance);
    var detection = instance.profile.detection;
    var distance = Math.max(detection.revealRadius + 6, detection.clueRadius - 4);
    setHeroPosition(instance.x + distance, instance.y);
    Game.hazards.update(.05);
    callout(D.t('hazard.clueShown') + ' · ' + profileName(instance.profile));
    syncPauseUi();
    updateRuntime(true);
    return instance.clueVisible && instance.awareness === 'concealed';
  }

  function revealHazard() {
    var instance = selectedInstance();
    if (!instance) return false;
    paused = true;
    instance = resetAtOutside(instance);
    var detection = instance.profile.detection;
    var trigger = instance.profile.trigger;
    var triggerRadius = trigger.shape === 'circle' ? trigger.radius :
      (trigger.shape === 'cone' ? trigger.length : Math.max(trigger.width || 0, trigger.height || 0) / 2);
    var distance = Math.max(triggerRadius + 7, detection.revealRadius - 3);
    setHeroPosition(instance.x + distance, instance.y);
    Game.hazards.forceReveal(instance.id, 'forced');
    Game.hazards.update(.05);
    callout(D.t('hazard.revealed') + ' · ' + profileName(instance.profile));
    syncPauseUi();
    updateRuntime(true);
    return instance.awareness === 'revealed';
  }

  function triggerHazard() {
    var instance = selectedInstance();
    if (!instance) return false;
    paused = true;
    instance = resetAtOutside(instance);
    prepareManual();
    setHeroPosition(instance.x, instance.y);
    Game.hazards.update(.05);
    var triggered = instance.phase === 'warning' || Game.hazards.forceTrigger(instance.id, Game.world.hero.id);
    callout(D.t(triggered ? 'hazard.triggered' : 'hazard.disabled') + ' · ' + profileName(instance.profile));
    syncPauseUi();
    updateRuntime(true);
    return triggered;
  }

  function stepUntil(test, limit) {
    var steps = 0;
    while (!test() && steps < limit) {
      Game.hazards.update(.05);
      steps++;
    }
    return steps;
  }

  function advanceHazard() {
    var instance = selectedInstance();
    if (!instance) return 0;
    paused = true;
    if (instance.phase === 'dormant') triggerHazard();
    instance = selectedInstance();
    var start = instance.phase;
    var steps = stepUntil(function () { return instance.phase !== start; }, 180);
    callout(D.t('hazard.advanced') + ' · ' + start + ' → ' + instance.phase);
    syncPauseUi();
    updateRuntime(true);
    return steps;
  }

  function resolveHazard() {
    var instance = selectedInstance();
    if (!instance) return 0;
    paused = true;
    if (instance.phase === 'dormant') triggerHazard();
    instance = selectedInstance();
    var steps = stepUntil(function () {
      return instance.phase === 'cooldown' || instance.lockEncounterId ||
        Game.hazards.events().some(function (event) {
          return event.instanceId === instance.id && (event.type === 'hazard:hit' || event.type === 'hazard:ambushStarted');
        });
    }, 220);
    callout(D.t('hazard.resolved') + ' · ' + profileName(instance.profile));
    syncPauseUi();
    updateRuntime(true);
    return steps;
  }

  function resetHazard() {
    var instance = selectedInstance();
    if (!instance) return false;
    paused = true;
    resetAtOutside(instance);
    callout(D.t('hazard.resetDone') + ' · ' + profileName(instance.profile));
    syncPauseUi();
    updateRuntime(true);
    return true;
  }

  function focusHazard() {
    var instance = selectedInstance();
    if (!instance) return false;
    prepareManual();
    setHeroPosition(instance.x + outsideDistance(instance) * .55, instance.y + 12);
    updateRuntime(true);
    return true;
  }

  function shapeText(profile) {
    var trigger = profile.trigger;
    if (trigger.shape === 'circle') return 'circle · r' + trigger.radius;
    if (trigger.shape === 'cone') return 'cone · ' + trigger.length + 'px / ' + trigger.angleDeg + '°';
    return trigger.shape + ' · ' + (trigger.width || trigger.length) + '×' + (trigger.height || trigger.radius * 2);
  }

  function renderTabs() {
    document.getElementById('region-tabs').innerHTML = regions.map(function (region, index) {
      return '<button type="button" data-region-index="' + index + '" class="' +
        (index === currentIndex ? 'active' : '') + '"' + (index === currentIndex ? ' aria-current="page"' : '') +
        '><small>' + String(index + 1).padStart(2, '0') + ' / T' + region.tier + '</small><span>' +
        U.esc(regionName(region)) + '</span></button>';
    }).join('');
  }

  function refreshSelects(preferredId) {
    var instances = Game.hazards.all();
    var select = document.getElementById('hazard-select');
    select.innerHTML = instances.map(function (instance, index) {
      return '<option value="' + U.esc(instance.id) + '"' + (instance.disabled ? ' disabled' : '') + '>' +
        U.esc(profileName(instance.profile)) + ' · ' + (index + 1) +
        (instance.disabled ? ' · ' + U.esc(D.t('hazard.unavailable')) : '') + '</option>';
    }).join('');
    var available = instances.filter(function (instance) { return !instance.disabled; });
    var preferred = instances.some(function (instance) { return instance.id === preferredId && !instance.disabled; })
      ? preferredId : (available[0] && available[0].id);
    if (preferred) select.value = preferred;

    var profileSelect = document.getElementById('profile-select');
    var previousProfile = profileSelect.value;
    profileSelect.innerHTML = profiles.map(function (profile) {
      var region = Game.reg.get('region', profile.regionId);
      return '<option value="' + U.esc(profile.id) + '">' + U.esc(regionName(region)) + ' · ' +
        U.esc(profileName(profile)) + '</option>';
    }).join('');
    var instance = selectedInstance();
    profileSelect.value = profiles.some(function (profile) { return profile.id === previousProfile; })
      ? previousProfile : (instance ? instance.profileId : profiles[0].id);
  }

  function callout(message) {
    document.getElementById('event-callout').textContent = message;
  }

  function eventText(type, instance) {
    var profile = instance && (instance.profile || instance);
    var presentation = profile && profile.presentation || {};
    var key = type === 'hazard:warning' ? presentation.warningKey :
      (type === 'hazard:hit' ? presentation.hitKey :
        (type === 'hazard:ambushStarted' ? presentation.ambushKey : ''));
    if (key) {
      var translated = Game.i18n.t(key);
      if (translated !== key) return translated;
    }
    return D.t('hazard.event.' + type.split(':')[1]);
  }

  function pushEvent(type, event) {
    var instance = Game.hazards.get(event.instanceId);
    var text = eventText(type, instance);
    feed.unshift({
      tick: event.tick,
      type: type,
      profileId: event.profileId
    });
    feed = feed.slice(0, 7);
    callout(text);
    renderFeed();
  }

  function renderFeed() {
    document.getElementById('event-feed').innerHTML = feed.length ? feed.map(function (item) {
      var profile = Game.content.get('hazardProfile', item.profileId);
      return '<li><b>t' + item.tick + '</b> · ' + U.esc(item.type) + ' · ' +
        U.esc(profile ? profileName(profile) : item.profileId) +
        '<br>' + U.esc(eventText(item.type, profile)) + '</li>';
    }).join('') : '<li>' + U.esc(D.t('hazard.noEvents')) + '</li>';
  }

  function renderContactSheet() {
    var canvas = document.getElementById('contact-sheet');
    var ctx = canvas.getContext('2d');
    var profile = selectedProfile();
    if (!profile) return;
    var visual = Game.content.get('hazardVisualProfile', profile.visualProfileId);
    var states = [
      { label: D.t('hazard.phase.clue'), phase: 'dormant', awareness: 'concealed', clueVisible: true },
      { label: D.t('hazard.phase.dormant'), phase: 'dormant' },
      { label: D.t('hazard.phase.warningEarly'), phase: 'warning', progress: .28 },
      { label: D.t('hazard.phase.warningLate'), phase: 'warning', progress: .84 },
      { label: D.t('hazard.phase.active'), phase: 'active', hit: true },
      { label: D.t('hazard.phase.cooldown'), phase: 'cooldown' }
    ];
    var cellW = canvas.width / 3;
    var cellH = canvas.height / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    states.forEach(function (state, index) {
      var col = index % 3, row = Math.floor(index / 3);
      var x = col * cellW, y = row * cellH;
      ctx.fillStyle = index % 2 ? '#17150f' : '#11120e';
      ctx.fillRect(x, y, cellW, cellH);
      ctx.fillStyle = '#1d2018';
      for (var py = y + 5; py < y + cellH - 5; py += 8) {
        for (var px = x + 5 + ((py / 8) % 2 ? 4 : 0); px < x + cellW - 5; px += 8) {
          ctx.fillRect(px, py, 1, 1);
        }
      }
      ctx.strokeStyle = '#3d3829';
      ctx.strokeRect(x + .5, y + .5, cellW - 1, cellH - 1);
      ctx.fillStyle = '#aa8d4c';
      ctx.fillRect(x + 8, y + 8, 3, 11);
      ctx.fillRect(x + 8, y + 8, 11, 3);
      ctx.fillRect(x + cellW - 11, y + 8, 3, 11);
      ctx.fillRect(x + cellW - 19, y + 8, 11, 3);
      ctx.fillStyle = '#d4c49c';
      ctx.font = '9px "Fusion Pixel", Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('0' + (index + 1) + '  ' + state.label.toUpperCase(), x + 24, y + 10);
      var cone = profile.trigger.shape === 'cone';
      var wide = profile.trigger.shape === 'rect' && (profile.trigger.width || profile.trigger.length) > 52;
      ctx.save();
      ctx.translate(x + cellW * (cone ? .3 : .5), y + cellH * .6);
      var previewScale = cone ? 1.55 : (wide ? 1.78 : 2.05);
      ctx.scale(previewScale, previewScale);
      Game.hazardRender.drawPreview(ctx, profile, {
        visual: visual,
        phase: state.phase,
        awareness: state.awareness || 'revealed',
        clueVisible: state.clueVisible,
        progress: state.progress,
        hit: state.hit,
        compact: true,
        static: !document.getElementById('effects-toggle').checked
      });
      ctx.restore();
    });
    renderProfileDetails(profile);
  }

  function renderProfileDetails(profile) {
    var detection = profile.detection;
    var lifecycle = profile.lifecycle;
    var desc = Game.i18n.t(profile.presentation.descKey);
    document.getElementById('profile-details').innerHTML =
      '<div><span>' + U.esc(D.t('hazard.profileId')) + '</span><strong>' + U.esc(profile.id) + '</strong></div>' +
      '<div><span>' + U.esc(D.t('hazard.shape')) + '</span><strong>' + U.esc(shapeText(profile)) + '</strong></div>' +
      '<div><span>' + U.esc(D.t('hazard.detection')) + '</span><strong>' +
        detection.clueRadius + ' / ' + detection.revealRadius + ' px · ' +
        Math.round(detection.revealChance * 100) + '%</strong></div>' +
      '<div><span>' + U.esc(D.t('hazard.lifecycle')) + '</span><strong>' +
        (lifecycle.warningTicks * .05).toFixed(2) + 's / ' + (lifecycle.activeTicks * .05).toFixed(2) + 's</strong></div>' +
      '<p>' + U.esc(desc) + '</p>';
  }

  function updateRuntime(force) {
    var now = performance.now();
    if (!force && now - lastUiUpdate < 100) return;
    lastUiUpdate = now;
    var instance = selectedInstance();
    if (!instance) return;
    var detection = instance.profile.detection;
    var lifecycle = instance.profile.lifecycle;
    document.getElementById('hazard-state').textContent =
      instance.awareness + ' / ' + instance.phase + (instance.clueVisible ? ' / clue' : '');
    document.getElementById('hazard-ranges').textContent =
      detection.clueRadius + ' / ' + detection.revealRadius + ' / ' + shapeText(instance.profile);
    document.getElementById('hazard-timing').textContent =
      (lifecycle.warningTicks * .05).toFixed(2) + 's / ' + (lifecycle.activeTicks * .05).toFixed(2) + 's';
    document.getElementById('hazard-costs').textContent = ['safe', 'balanced', 'loot'].map(function (strategy) {
      return strategy.charAt(0).toUpperCase() + ':' +
        Game.hazards.navigationCost(instance.x, instance.y, strategy);
    }).join(' / ');
    var detectionContext = Game.hazards.detectionContext(
      instance.id, Game.world.hero && Game.world.hero.id);
    document.getElementById('hazard-detection-check').textContent =
      (detectionContext.effectiveChance * 100).toFixed(1) + '% / ' +
      (detectionContext.roll * 100).toFixed(1) + '% · ' +
      (detectionContext.detectable ? D.t('hazard.detectable') : D.t('hazard.concealedByRoll'));
    document.getElementById('hazard-detection-sources').textContent = [
      detectionContext.strategy + ' ×' + detectionContext.strategyMultiplier.toFixed(2),
      'expedition:vision ×' + detectionContext.expeditionVision.toFixed(2)
    ].concat(detectionContext.sources.map(function (source) {
        return source.id + ' ×' + source.multiplier.toFixed(2);
      })).join(' · ');
    document.getElementById('tick-status').textContent = 'tick ' + Game.hazards.tick();
  }

  function pointLabel(point, fallback) {
    if (!point) return fallback || '—';
    return point.id || point.defId || point.kind || fallback || 'point';
  }

  function macroCenterFor(point) {
    var layout = Game.world.layout;
    var nav = layout.nav;
    var gx = U.clamp((point.x / nav.cell) | 0, 0, nav.w - 1);
    var gy = U.clamp((point.y / nav.cell) | 0, 0, nav.h - 1);
    var id = nav.macroCenter[gy][gx];
    return { id: id, point: layout.macro.centers[id] };
  }

  function potentialRouteDefinitions(scope) {
    var layout = Game.world.layout;
    var routes = [];
    if (scope !== 'objectives') {
      (layout.macro.edges || []).forEach(function (edge, index) {
        var from = layout.macro.centers[edge.a];
        var to = layout.macro.centers[edge.b];
        routes.push({
          id: 'macro:' + edge.a + '>' + edge.b + ':' + index,
          kind: 'macro',
          label: edge.a + ' → ' + edge.b,
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          interaction: false
        });
      });
    }
    if (scope !== 'macro') {
      var targets = []
        .concat((layout.landmarks || []).map(function (target) {
          return { target: target, kind: 'landmark', interaction: false };
        }))
        .concat((layout.nodes || []).map(function (target) {
          return { target: target, kind: 'resource', interaction: true };
        }))
        .concat((layout.curios || []).map(function (target) {
          return { target: target, kind: 'curio', interaction: false };
        }))
        .concat((layout.ecology || []).map(function (target) {
          return { target: target, kind: 'ecology', interaction: false };
        }))
        .concat((layout.threats || []).map(function (target) {
          return { target: target, kind: 'threat', interaction: false };
        }));
      if (layout.guardian) targets.push({ target: layout.guardian, kind: 'guardian', interaction: false });
      if (layout.bossLair) targets.push({ target: layout.bossLair, kind: 'boss', interaction: false });
      targets.forEach(function (entry, index) {
        var macro = macroCenterFor(entry.target);
        if (!macro.point || U.dist(macro.point.x, macro.point.y, entry.target.x, entry.target.y) < 6) return;
        routes.push({
          id: 'approach:' + entry.kind + ':' + pointLabel(entry.target, index),
          kind: 'approach',
          targetKind: entry.kind,
          label: entry.kind + ' · ' + pointLabel(entry.target, String(index + 1)),
          from: { x: macro.point.x, y: macro.point.y },
          to: { x: entry.target.x, y: entry.target.y },
          interaction: entry.interaction
        });
      });
    }
    return routes;
  }

  function pathPrefix(points, distanceLimit) {
    if (!points.length) return [];
    var out = [{ x: points[0].x, y: points[0].y }];
    var walked = 0;
    for (var index = 1; index < points.length; index++) {
      var from = points[index - 1];
      var to = points[index];
      var length = U.dist(from.x, from.y, to.x, to.y);
      if (walked + length <= distanceLimit + .001) {
        out.push({ x: to.x, y: to.y });
        walked += length;
        continue;
      }
      var ratio = length > 0 ? U.clamp((distanceLimit - walked) / length, 0, 1) : 0;
      out.push({
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio
      });
      break;
    }
    return out;
  }

  function appendPath(target, source) {
    if (!source || !source.length) return;
    var start = target.length && U.dist(
      target[target.length - 1].x, target[target.length - 1].y,
      source[0].x, source[0].y
    ) < .1 ? 1 : 0;
    for (var index = start; index < source.length; index++) {
      target.push({ x: source[index].x, y: source[index].y });
    }
  }

  function solveVirtualPath(from, to, revealedIds, strategy) {
    var revealed = revealedIds || {};
    var instances = Game.hazards.all();
    Game.state.settings.expeditionStrategy = strategy;
    instances.forEach(function (instance) {
      instance.awareness = revealed[instance.id] ? 'revealed' : 'concealed';
      instance.phase = 'dormant';
    });
    Game.nav.useLayout(Game.world.layout);
    var solved = Game.nav.solveImmediate(from.x, from.y, to.x, to.y);
    if (!solved) return { points: [{ x: from.x, y: from.y }], failed: true };
    return {
      points: [{ x: from.x, y: from.y }].concat(solved.map(function (point) {
        return { x: point.x, y: point.y };
      })),
      failed: false
    };
  }

  function simulatePotentialRoute(definition, strategy) {
    var baseline = solveVirtualPath(definition.from, definition.to, {}, strategy);
    var baselineInspection = Game.hazards.inspectPath(baseline.points);
    var baselineTriggers = baselineInspection.interactions.filter(function (entry) {
      return !!entry.trigger;
    });
    var baselineReveals = baselineInspection.interactions.filter(function (entry) {
      return !!entry.reveal;
    });
    var revealed = {};
    var current = { x: definition.from.x, y: definition.from.y };
    var autoPoints = [{ x: current.x, y: current.y }];
    var events = [];
    var failed = baseline.failed;
    var limit = Game.hazards.all().length + 3;

    for (var pass = 0; !failed && pass < limit; pass++) {
      var nextPath = solveVirtualPath(current, definition.to, revealed, strategy);
      if (nextPath.failed) {
        failed = true;
        break;
      }
      var inspection = Game.hazards.inspectPath(nextPath.points);
      var nextEvent = null;
      inspection.interactions.forEach(function (entry) {
        var candidate = null;
        if (!revealed[entry.instanceId] && entry.reveal) {
          var detection = Game.hazards.detectionContext(
            entry.instanceId, Game.world.hero && Game.world.hero.id);
          if (detection.detectable) {
            candidate = {
              type: 'reveal', distanceAlong: entry.reveal.distanceAlong,
              point: entry.reveal.point, instanceId: entry.instanceId,
              profileId: entry.profileId, detection: detection
            };
          } else if (entry.trigger) {
            candidate = {
              type: 'warning', distanceAlong: entry.trigger.distanceAlong,
              point: entry.trigger.point, instanceId: entry.instanceId,
              profileId: entry.profileId, missed: true,
              response: strategy === 'loot' ? 'risk' : 'escape',
              detection: detection
            };
          }
        } else if (revealed[entry.instanceId] && entry.trigger) {
          candidate = {
            type: 'warning', distanceAlong: entry.trigger.distanceAlong,
            point: entry.trigger.point, instanceId: entry.instanceId,
            profileId: entry.profileId, missed: false,
            response: strategy === 'loot' ? 'risk' : 'escape'
          };
        }
        if (candidate && (!nextEvent || candidate.distanceAlong < nextEvent.distanceAlong)) {
          nextEvent = candidate;
        }
      });
      if (!nextEvent) {
        appendPath(autoPoints, nextPath.points);
        current = { x: definition.to.x, y: definition.to.y };
        break;
      }
      var prefix = pathPrefix(nextPath.points, nextEvent.distanceAlong);
      appendPath(autoPoints, prefix);
      events.push(nextEvent);
      current = { x: nextEvent.point.x, y: nextEvent.point.y };
      if (nextEvent.type === 'warning') break;
      revealed[nextEvent.instanceId] = true;
    }

    var warningIds = {};
    events.forEach(function (event) {
      if (event.type === 'warning') warningIds[event.instanceId] = true;
    });
    var rerouted = baselineTriggers.filter(function (entry) { return !warningIds[entry.instanceId]; });
    return {
      definition: definition,
      baseline: baseline,
      baselineInspection: baselineInspection,
      baselineTriggers: baselineTriggers,
      baselineReveals: baselineReveals,
      autoPoints: autoPoints,
      events: events,
      warningIds: warningIds,
      rerouted: rerouted,
      failed: failed,
      interactionCovered: definition.interaction && baselineReveals.length > 0
    };
  }

  function auditInstanceStats(instances, results) {
    return instances.map(function (instance) {
      var stat = {
        instance: instance,
        minDistance: Infinity,
        revealLinks: 0,
        detectedLinks: 0,
        missedLinks: 0,
        triggerLinks: 0,
        warningLinks: 0,
        escapeLinks: 0,
        reroutedLinks: 0,
        interactionLinks: 0
      };
      results.forEach(function (result) {
        var pathEntry = result.baselineInspection.interactions.find(function (entry) {
          return entry.instanceId === instance.id;
        });
        if (pathEntry && Number.isFinite(pathEntry.minCenterDistance)) {
          stat.minDistance = Math.min(stat.minDistance, pathEntry.minCenterDistance);
        }
        if (pathEntry && pathEntry.reveal) stat.revealLinks++;
        if (pathEntry && pathEntry.trigger) {
          stat.triggerLinks++;
        }
        if (result.interactionCovered && pathEntry && pathEntry.reveal) stat.interactionLinks++;
        if (result.warningIds[instance.id]) stat.warningLinks++;
        result.events.forEach(function (event) {
          if (event.instanceId !== instance.id) return;
          if (event.type === 'reveal') stat.detectedLinks++;
          if (event.type === 'warning' && event.missed) stat.missedLinks++;
          if (event.type === 'warning' && event.response === 'escape') stat.escapeLinks++;
        });
        if (result.rerouted.some(function (entry) { return entry.instanceId === instance.id; })) {
          stat.reroutedLinks++;
        }
      });
      if (!Number.isFinite(stat.minDistance)) stat.minDistance = null;
      return stat;
    });
  }

  function drawPath(ctx, points, transform, color, width, dash) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    points.forEach(function (point, index) {
      var p = transform(point);
      if (index) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawHazardShape(ctx, instance, transform, scale) {
    var center = transform(instance);
    var trigger = instance.profile.trigger;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(instance.orientation);
    ctx.strokeStyle = instance.disabled ? '#685657' : '#d95850';
    ctx.lineWidth = instance.id === (selectedInstance() && selectedInstance().id) ? 2.1 : 1.2;
    ctx.beginPath();
    if (trigger.shape === 'circle') {
      ctx.ellipse(0, 0, trigger.radius * scale.x, trigger.radius * scale.y, 0, 0, Math.PI * 2);
    } else if (trigger.shape === 'cone') {
      var angle = (trigger.angleDeg || 60) * Math.PI / 360;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * trigger.length * scale.x, Math.sin(angle) * trigger.length * scale.y);
      ctx.lineTo(Math.cos(angle) * trigger.length * scale.x, -Math.sin(angle) * trigger.length * scale.y);
      ctx.closePath();
    } else {
      ctx.rect(
        -(trigger.width || trigger.length || 40) * scale.x / 2,
        -(trigger.height || trigger.radius * 2 || 16) * scale.y / 2,
        (trigger.width || trigger.length || 40) * scale.x,
        (trigger.height || trigger.radius * 2 || 16) * scale.y
      );
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRouteAudit() {
    var canvas = document.getElementById('route-audit-map');
    var ctx = canvas.getContext('2d');
    var layout = Game.world.layout;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0b0d0b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!routeAudit || !layout) return;
    var pad = 24;
    var scale = {
      x: (canvas.width - pad * 2) / layout.world.w,
      y: (canvas.height - pad * 2) / layout.world.h
    };
    function transform(point) {
      return { x: pad + point.x * scale.x, y: pad + point.y * scale.y };
    }
    var nav = layout.nav;
    ctx.fillStyle = '#171a17';
    for (var gy = 0; gy < nav.h; gy++) {
      for (var gx = 0; gx < nav.w; gx++) {
        if (nav.grid[gy][gx] === 1) continue;
        var x = pad + gx * nav.cell * scale.x;
        var y = pad + gy * nav.cell * scale.y;
        ctx.fillRect(x, y, Math.ceil(nav.cell * scale.x), Math.ceil(nav.cell * scale.y));
      }
    }
    ctx.strokeStyle = '#34392f';
    ctx.lineWidth = 1;
    (layout.macro.edges || []).forEach(function (edge) {
      var from = transform(layout.macro.centers[edge.a]);
      var to = transform(layout.macro.centers[edge.b]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });
    routeAudit.results.forEach(function (result) {
      drawPath(ctx, result.baseline.points, transform, 'rgba(90, 146, 170, .25)', 1, [3, 4]);
    });
    routeAudit.results.forEach(function (result) {
      var color = result.events.some(function (event) { return event.type === 'warning'; })
        ? 'rgba(219, 85, 77, .72)' : 'rgba(224, 184, 86, .38)';
      drawPath(ctx, result.autoPoints, transform, color,
        result.events.some(function (event) { return event.type === 'warning'; }) ? 1.8 : 1.15);
    });
    var selected = selectedInstance();
    Game.hazards.all().forEach(function (instance, index) {
      var center = transform(instance);
      ctx.save();
      ctx.strokeStyle = instance.id === (selected && selected.id)
        ? 'rgba(255, 220, 118, .9)' : 'rgba(218, 176, 77, .28)';
      ctx.lineWidth = instance.id === (selected && selected.id) ? 1.6 : .8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(center.x, center.y,
        instance.profile.detection.revealRadius * scale.x,
        instance.profile.detection.revealRadius * scale.y, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawHazardShape(ctx, instance, transform, scale);
      ctx.fillStyle = instance.disabled ? '#8c6f70' : '#f0d276';
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(index + 1), center.x, center.y - 7);
    });
    var camp = transform(layout.camp);
    var boss = transform(layout.bossPoint);
    ctx.fillStyle = '#7ed0a0';
    ctx.fillRect(camp.x - 4, camp.y - 4, 8, 8);
    ctx.fillStyle = '#c57972';
    ctx.fillRect(boss.x - 4, boss.y - 4, 8, 8);
    ctx.strokeStyle = '#565a4c';
    ctx.strokeRect(pad + .5, pad + .5, canvas.width - pad * 2 - 1, canvas.height - pad * 2 - 1);
  }

  function auditStatus(stat) {
    if (stat.instance.disabled) return D.t('hazard.auditStatusDisabled');
    if (stat.warningLinks) return D.t('hazard.auditStatusWarning');
    if (stat.reroutedLinks) return D.t('hazard.auditStatusRerouted');
    if (stat.interactionLinks) return D.t('hazard.auditStatusInteraction');
    if (stat.revealLinks) return D.t('hazard.auditStatusClueOnly');
    return D.t('hazard.auditStatusOffRoute');
  }

  function renderRouteAudit() {
    if (!routeAudit) return;
    var summary = routeAudit.summary;
    document.getElementById('audit-placement-count').textContent =
      summary.activePlacements + ' / ' + summary.placements;
    document.getElementById('audit-link-count').textContent = summary.links;
    document.getElementById('audit-baseline-count').textContent = summary.baselineCrossings;
    document.getElementById('audit-detection-count').textContent = summary.detections;
    document.getElementById('audit-reroute-count').textContent = summary.reroutes;
    document.getElementById('audit-warning-count').textContent = summary.missedWarnings;
    document.getElementById('audit-escape-count').textContent = summary.escapes;
    document.getElementById('audit-suppressed-count').textContent =
      summary.interactionCoverage;
    var verdictKey = summary.warnings ? 'hazard.auditVerdictWarning' :
      (summary.reroutes ? 'hazard.auditVerdictReroute' :
        (summary.baselineCrossings ? 'hazard.auditVerdictCoverage' : 'hazard.auditVerdictNoCoverage'));
    document.getElementById('audit-verdict').textContent = D.t(verdictKey);

    var logItems = routeAudit.results.map(function (result) {
      var warnings = result.events.filter(function (event) { return event.type === 'warning'; });
      var reveals = result.events.filter(function (event) { return event.type === 'reveal'; });
      var kind = result.definition.kind === 'macro' ? D.t('hazard.auditMacro') : D.t('hazard.auditApproach');
      var text;
      var className = 'is-clear';
      var rank = 4;
      if (warnings.length) {
        text = D.t(warnings.some(function (event) { return event.missed; })
          ? 'hazard.auditLogMissed' : 'hazard.auditLogWarning') + ' · ' +
          warnings.map(function (event) {
            return profileName(Game.content.get('hazardProfile', event.profileId));
          }).join(', ');
        className = 'is-warning';
        rank = 1;
      } else if (result.rerouted.length) {
        text = D.t('hazard.auditLogReroute') + ' · ' +
          result.rerouted.map(function (entry) {
            return profileName(Game.content.get('hazardProfile', entry.profileId));
          }).join(', ');
        rank = 2;
      } else if (reveals.length) {
        text = D.t('hazard.auditLogReveal') + ' · ' +
          reveals.map(function (event) {
            return profileName(Game.content.get('hazardProfile', event.profileId));
          }).join(', ');
        rank = 3;
      } else {
        text = D.t('hazard.auditLogClear');
      }
      return {
        rank: rank,
        html: '<li class="' + className + '"><b>' + U.esc(kind + ' ' + result.definition.label) +
          '</b><br>' + U.esc(text) + '</li>'
      };
    }).sort(function (a, b) { return a.rank - b.rank; });
    var relevantCount = logItems.filter(function (item) { return item.rank < 4; }).length;
    document.getElementById('route-audit-log').innerHTML = logItems
      .slice(0, Math.max(18, Math.min(logItems.length, relevantCount + 6)))
      .map(function (item) { return item.html; }).join('');

    var selected = selectedInstance();
    document.getElementById('placement-audit').innerHTML = routeAudit.instanceStats.map(function (stat, index) {
      var detection = routeAudit.detectionContexts[stat.instance.id];
      return '<article class="' + (selected && stat.instance.id === selected.id ? 'is-selected' : '') + '">' +
        '<small>#' + String(index + 1).padStart(2, '0') + ' · ' + U.esc(stat.instance.id) + '</small>' +
        '<strong>' + U.esc(profileName(stat.instance.profile)) + '</strong>' +
        '<span>' + U.esc(auditStatus(stat)) + '</span>' +
        '<span>min ' + (stat.minDistance === null ? '—' : Math.round(stat.minDistance) + 'px') +
        ' · roll ' + (detection.roll * 100).toFixed(1) + '%' +
        ' / chance ' + (detection.effectiveChance * 100).toFixed(1) + '%' +
        ' · reveal ' + stat.revealLinks + ' · detected ' + stat.detectedLinks +
        ' · missed ' + stat.missedLinks + ' · trigger ' + stat.triggerLinks +
        ' · replan ' + stat.reroutedLinks + ' · warning ' + stat.warningLinks +
        ' · escape ' + stat.escapeLinks +
        (stat.interactionLinks ? ' · interact ' + stat.interactionLinks : '') +
        (stat.instance.placement ? ' · planned ' +
          stat.instance.placement.triggerRouteIds.length + '/' +
          stat.instance.placement.revealRouteIds.length +
          (stat.instance.placement.fallback ? ' · fallback' : '') : '') +
        '</span></article>';
    }).join('');
    drawRouteAudit();
  }

  function runRouteAudit() {
    var layout = Game.world.layout;
    if (!layout || layout.version < 3) return null;
    var strategy = document.getElementById('audit-strategy').value;
    var scope = document.getElementById('audit-scope').value;
    var instances = Game.hazards.all();
    var originalStrategy = Game.state.settings.expeditionStrategy;
    var detectionContexts = {};
    var originals = instances.map(function (instance) {
      return { instance: instance, awareness: instance.awareness, phase: instance.phase };
    });
    var routes = potentialRouteDefinitions(scope);
    var results;
    try {
      results = routes.map(function (definition) {
        return simulatePotentialRoute(definition, strategy);
      });
      Game.state.settings.expeditionStrategy = strategy;
      instances.forEach(function (instance) {
        detectionContexts[instance.id] = Game.hazards.detectionContext(
          instance.id, Game.world.hero && Game.world.hero.id);
      });
    } finally {
      originals.forEach(function (saved) {
        saved.instance.awareness = saved.awareness;
        saved.instance.phase = saved.phase;
      });
      Game.state.settings.expeditionStrategy = originalStrategy;
      Game.nav.useLayout(layout);
      if (Game.world.hero) Game.nav.clear(Game.world.hero);
    }
    var baselineCrossings = results.reduce(function (total, result) {
      return total + result.baselineTriggers.length;
    }, 0);
    var warnings = results.reduce(function (total, result) {
      return total + Object.keys(result.warningIds).length;
    }, 0);
    var detections = results.reduce(function (total, result) {
      return total + result.events.filter(function (event) {
        return event.type === 'reveal';
      }).length;
    }, 0);
    var missedWarnings = results.reduce(function (total, result) {
      return total + result.events.filter(function (event) {
        return event.type === 'warning' && event.missed;
      }).length;
    }, 0);
    var escapes = results.reduce(function (total, result) {
      return total + result.events.filter(function (event) {
        return event.type === 'warning' && event.response === 'escape';
      }).length;
    }, 0);
    var reroutes = results.reduce(function (total, result) {
      return total + result.rerouted.length;
    }, 0);
    var interactionCoverage = results.reduce(function (total, result) {
      return total + (result.interactionCovered ? 1 : 0);
    }, 0);
    routeAudit = {
      regionId: Game.world.region.id,
      seed: Game.state.world.worldSeed >>> 0,
      strategy: strategy,
      environmentVisibility: labEnvironmentVisibility,
      scope: scope,
      routes: routes,
      results: results,
      instanceStats: auditInstanceStats(instances, results),
      detectionContexts: detectionContexts,
      summary: {
        placements: instances.length,
        activePlacements: instances.filter(function (instance) { return !instance.disabled; }).length,
        links: routes.length,
        baselineCrossings: baselineCrossings,
        detections: detections,
        reroutes: reroutes,
        warnings: warnings,
        missedWarnings: missedWarnings,
        escapes: escapes,
        interactionCoverage: interactionCoverage
      }
    };
    renderRouteAudit();
    return routeAudit;
  }

  function drawMimicSheet() {
    var canvas = document.getElementById('mimic-sheet');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var variants = [
      { id: 'mimic_weathered', label: D.t('hazard.mimicWeathered'), tiers: 'T1–T3', hp: '1.25×', dps: '0.90×' },
      { id: 'mimic_cursed', label: D.t('hazard.mimicCursed'), tiers: 'T4–T6', hp: '1.35×', dps: '0.95×' },
      { id: 'mimic_royal', label: D.t('hazard.mimicRoyal'), tiers: 'T7–T8', hp: '1.45×', dps: '1.00×' }
    ];
    var width = canvas.width / variants.length;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0c0e0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    variants.forEach(function (variant, index) {
      var left = index * width;
      var center = left + width / 2;
      ctx.fillStyle = index % 2 ? '#151713' : '#11130f';
      ctx.fillRect(left + 1, 1, width - 2, canvas.height - 2);
      ctx.strokeStyle = '#3c3b31';
      ctx.strokeRect(left + .5, .5, width - 1, canvas.height - 1);
      ctx.fillStyle = '#b99a50';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(variant.tiers, center, 27);
      Game.assets.draw(ctx, variant.id, 'idle0', center, 153, { scale: 4 });
      ctx.fillStyle = '#efe4bc';
      ctx.font = '600 17px Georgia, "STSong", serif';
      ctx.fillText(variant.label, center, 190);
      ctx.fillStyle = '#8f9285';
      ctx.font = '10px Consolas, monospace';
      ctx.fillText('HP ' + variant.hp + ' · DPS ' + variant.dps, center, 211);
      ctx.fillText(index === 0 ? 'Locktongue' :
        (index === 1 ? 'Locktongue + Clasp' : 'Locktongue + Clasp + Coinstorm'), center, 229);
    });
  }

  function runMimicAudit() {
    var count = Number(document.getElementById('mimic-samples').value) || 24;
    var genuine = Number(document.getElementById('mimic-genuine-start').value) || 0;
    mimicAudit = Game.environment.simulateMimicSequence(count, {
      worldSeed: Game.state.world.worldSeed,
      regionId: Game.world.region.id,
      rollOrdinal: 0,
      genuineOpenedSinceMimic: genuine
    });
    var mimics = mimicAudit.entries.filter(function (entry) { return entry.mimic; }).length;
    var eligible = mimicAudit.entries.filter(function (entry) { return entry.eligible; }).length;
    document.getElementById('mimic-verdict').textContent =
      D.t('hazard.mimicVerdict') + ' · ' + mimics + ' / ' + count +
      ' · ' + D.t('hazard.mimicEligible') + ' ' + eligible +
      ' · seed ' + U.hex32(mimicAudit.worldSeed);
    document.getElementById('mimic-log').innerHTML = mimicAudit.entries.map(function (entry) {
      var label;
      var className = '';
      if (entry.mimic) {
        label = D.t('hazard.mimicLogMimic');
        className = 'is-mimic';
      } else if (!entry.eligible) {
        label = D.t('hazard.mimicLogProtected') + ' ' + entry.genuineBefore + '/2';
        className = 'is-protected';
      } else {
        label = D.t('hazard.mimicLogGenuine');
      }
      return '<li class="' + className + '"><b>#' + String(entry.index + 1).padStart(2, '0') +
        '</b> · roll ' + (entry.roll === null ? '—' : String(entry.roll).padStart(4, '0')) +
        ' · ' + U.esc(label) + '</li>';
    }).join('');
    drawMimicSheet();
    return mimicAudit;
  }

  function activateRegion(index, preferredId) {
    currentIndex = (index + regions.length) % regions.length;
    var region = regions[currentIndex];
    feed = [];
    Game.state.settings.controlMode = 'manual';
    Game.state.world.region = region.id;
    Game.state.world.layoutVersion = 3;
    Game.state.world.mode = 'battle';
    Game.state.world.deathsRow = 0;
    Game.state.player.level = 1 + Math.max(0, region.tier - 1) * 9;
    Game.state.player.exp = 0;
    Game.state.player.skills = {};
    Game.player.recalc();
    Game.state.player.hp = Game.state.derived.maxHp;
    Game.world.init(region.id);
    document.getElementById('region-name').textContent = regionName(region);
    document.getElementById('seed-input').value = U.hex32(Game.state.world.worldSeed);
    renderTabs();
    refreshSelects(preferredId);
    renderFeed();
    focusHazard();
    renderContactSheet();
    callout(regionName(region) + ' · ' + D.t('hazard.regionReady'));
    updateUrl();
    updateRuntime(true);
    runRouteAudit();
    runMimicAudit();
  }

  function setTimeMode(mode) {
    timeMode = mode;
    var dayLength = Game.F.BAL.dayLength;
    if (mode === 'day') Game.state.world.worldTime = dayLength * .28;
    if (mode === 'night') Game.state.world.worldTime = dayLength * .82;
    Array.prototype.forEach.call(document.querySelectorAll('[data-time]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-time') === mode);
    });
  }

  function syncPauseUi() {
    var button = document.getElementById('toggle-play');
    button.textContent = paused ? D.t('common.resume') : D.t('common.pause');
    document.getElementById('runtime-status').textContent = paused ? D.t('common.paused') : D.t('common.running');
  }

  function bindControls() {
    document.getElementById('region-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('[data-region-index]');
      if (button) activateRegion(Number(button.getAttribute('data-region-index')));
    });
    document.getElementById('prev-region').addEventListener('click', function () { activateRegion(currentIndex - 1); });
    document.getElementById('next-region').addEventListener('click', function () { activateRegion(currentIndex + 1); });
    document.getElementById('toggle-play').addEventListener('click', function () {
      paused = !paused;
      syncPauseUi();
    });
    document.getElementById('hazard-select').addEventListener('change', function () {
      var instance = selectedInstance();
      if (instance) document.getElementById('profile-select').value = instance.profileId;
      focusHazard();
      renderContactSheet();
      updateRuntime(true);
      renderRouteAudit();
    });
    document.getElementById('profile-select').addEventListener('change', renderContactSheet);
    document.getElementById('show-clue').addEventListener('click', showClue);
    document.getElementById('reveal-hazard').addEventListener('click', revealHazard);
    document.getElementById('trigger-hazard').addEventListener('click', triggerHazard);
    document.getElementById('advance-hazard').addEventListener('click', advanceHazard);
    document.getElementById('resolve-hazard').addEventListener('click', resolveHazard);
    document.getElementById('reset-hazard').addEventListener('click', resetHazard);
    document.getElementById('run-route-audit').addEventListener('click', runRouteAudit);
    document.getElementById('audit-scope').addEventListener('change', runRouteAudit);
    document.getElementById('audit-strategy').addEventListener('change', runRouteAudit);
    document.getElementById('audit-visibility').addEventListener('change', function () {
      var value = Number(this.value);
      labEnvironmentVisibility = Number.isFinite(value) ? U.clamp(value, 0, 4) : 1;
      this.value = String(labEnvironmentVisibility);
      updateRuntime(true);
      runRouteAudit();
    });
    document.getElementById('run-mimic-audit').addEventListener('click', runMimicAudit);
    document.getElementById('mimic-samples').addEventListener('change', runMimicAudit);
    document.getElementById('mimic-genuine-start').addEventListener('change', runMimicAudit);
    document.getElementById('route-audit-map').addEventListener('click', function (event) {
      var rect = this.getBoundingClientRect();
      var layout = Game.world.layout;
      var padX = 24 / this.width * rect.width;
      var padY = 24 / this.height * rect.height;
      var x = (event.clientX - rect.left - padX) /
        Math.max(1, rect.width - padX * 2) * layout.world.w;
      var y = (event.clientY - rect.top - padY) /
        Math.max(1, rect.height - padY * 2) * layout.world.h;
      var nearest = Game.hazards.all().reduce(function (best, instance) {
        var distance = U.dist(x, y, instance.x, instance.y);
        return !best || distance < best.distance ? { instance: instance, distance: distance } : best;
      }, null);
      if (nearest && nearest.distance <= 140) {
        document.getElementById('hazard-select').value = nearest.instance.id;
        document.getElementById('hazard-select').dispatchEvent(new Event('change'));
      }
    });
    document.getElementById('effects-toggle').addEventListener('change', function () {
      Game.state.settings.effects = this.checked;
      Game.particles.setEnabled(this.checked);
      renderContactSheet();
    });
    document.querySelector('.segmented').addEventListener('click', function (event) {
      var button = event.target.closest('[data-time]');
      if (button) setTimeMode(button.getAttribute('data-time'));
    });
    document.getElementById('seed-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = document.getElementById('seed-input');
      var seed = parseSeed(input.value);
      if (seed === null) {
        input.setCustomValidity(D.t('hazard.seedError'));
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      Game.state.world.worldSeed = seed;
      Game.state.world.exploration = {};
      Game.state.world.hazards = { layoutVersion: 3, regions: {} };
      activateRegion(currentIndex);
    });
  }

  function bindEvents() {
    EVENT_TYPES.forEach(function (type) {
      Game.bus.on(type, function (event) { pushEvent(type, event); });
    });
  }

  function frame(now) {
    var dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!paused) {
      if (timeMode === 'cycle') {
        Game.state.world.worldTime = (Game.state.world.worldTime + dt) % Game.F.BAL.dayLength;
      }
      Game.terrain.update(dt);
      Game.particles.update(dt);
      Game.fx.update(dt);
      Game.world.update(dt);
      Game.trade.update();
      Game.actionBubbles.update(dt);
    }
    Game.render.frame(paused ? 0 : dt);
    updateRuntime();
    requestAnimationFrame(frame);
  }

  D.init();
  Game.content.finalize({ strict: true });
  regions = Game.reg.all('region');
  profiles = Game.content.all('hazardProfile').sort(function (a, b) {
    return a.regionId.localeCompare(b.regionId) || a.id.localeCompare(b.id);
  });
  Game.ui.modals.init();
  Game.state = Game.State.newGame();
  Game.i18n.setLocale(D.locale());
  Game.state.world.layoutVersion = 3;
  Game.state.world.regionOrder = Game.reg.ids('region');
  Game.state.settings.autoAdvance = false;
  Game.state.settings.autoEquip = false;
  Game.state.settings.autoCampRest = false;
  Game.state.settings.groundLoot = false;
  Game.state.settings.controlMode = 'manual';
  Game.player.setClass('fighter');
  var params = queryParams();
  var seed = parseSeed(params.get('seed'));
  if (seed !== null) Game.state.world.worldSeed = seed;
  Game.render.init(document.getElementById('stage'));
  bindEvents();
  bindControls();
  Game.hazards.registerDetectionModifierSource('lab:weather-visibility', function () {
    return labEnvironmentVisibility;
  });
  var initialId = params.get('region') || location.hash.slice(1);
  var initialIndex = regions.findIndex(function (region) { return region.id === initialId; });
  activateRegion(initialIndex >= 0 ? initialIndex : 0);

  window.HazardEffectsLab = {
    catalog: function () {
      return profiles.map(function (profile) {
        return {
          id: profile.id,
          regionId: profile.regionId,
          category: profile.category,
          trigger: profile.trigger,
          detection: profile.detection,
          lifecycle: profile.lifecycle,
          visualProfileId: profile.visualProfileId
        };
      });
    },
    snapshot: function () { return Game.hazards.snapshot(); },
    detection: function (instanceId) {
      return Game.hazards.detectionContext(
        instanceId || selectedInstance().id, Game.world.hero && Game.world.hero.id);
    },
    events: function () { return Game.hazards.events(); },
    select: function (id) {
      var select = document.getElementById('hazard-select');
      select.value = id;
      if (select.value !== id) return false;
      select.dispatchEvent(new Event('change'));
      return true;
    },
    clue: showClue,
    reveal: revealHazard,
    trigger: triggerHazard,
    advance: advanceHazard,
    resolve: resolveHazard,
    reset: resetHazard,
    audit: runRouteAudit,
    auditReport: function () { return routeAudit; },
    visibility: function (value) {
      var input = document.getElementById('audit-visibility');
      if (value === undefined) return labEnvironmentVisibility;
      input.value = String(value);
      input.dispatchEvent(new Event('change'));
      return labEnvironmentVisibility;
    },
    mimicAudit: runMimicAudit,
    mimicReport: function () { return mimicAudit; },
    region: function (id) {
      var index = regions.findIndex(function (region) { return region.id === id; });
      if (index < 0) return false;
      activateRegion(index);
      return true;
    }
  };

  window.addEventListener('demo:locale', function () {
    Game.i18n.setLocale(D.locale());
    document.getElementById('region-name').textContent = regionName(Game.world.region);
    renderTabs();
    refreshSelects(selectedInstance() && selectedInstance().id);
    renderContactSheet();
    renderFeed();
    if (feed.length) {
      callout(eventText(feed[0].type, Game.content.get('hazardProfile', feed[0].profileId)));
    }
    syncPauseUi();
    updateRuntime(true);
    renderRouteAudit();
    runMimicAudit();
  });
  requestAnimationFrame(frame);
})();
