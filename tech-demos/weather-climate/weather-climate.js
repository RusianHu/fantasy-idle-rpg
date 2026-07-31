/* global Game, DemoI18n */
(function () {
  'use strict';

  var U = Game.util;
  var D = DemoI18n;
  var PARTICLE_PRESETS = [
    'meadow', 'leaves', 'dust', 'wisps',
    'snow', 'embers', 'cloudwisp', 'miasma'
  ];
  var PHASES = [
    { id: 'dawn', ratio: 0.02, canvasId: 'phase-dawn' },
    { id: 'day', ratio: 0.30, canvasId: 'phase-day' },
    { id: 'dusk', ratio: 0.54, canvasId: 'phase-dusk' },
    { id: 'night', ratio: 0.80, canvasId: 'phase-night' }
  ];
  var FUTURE_HOOKS = {
    timeline: 'production',
    weatherState: 'production',
    intensity: 'production',
    visibilityProvider: 'weather:visibility',
    renderLayer: 'production-four-layer'
  };
  var regions = [];
  var region = null;
  var regionIndex = 0;
  var layout = null;
  var validation = null;
  var requestedSeed = 0x1234ABCD;
  var particlePreset = 'region';
  var effectsEnabled = true;
  var weatherMode = 'timeline';
  var forcedFront = 'volatile';
  var forcedIntensity = 0.8;
  var forcedTransition = 1;
  var reducedMotion = false;
  var playbackSpeed = 1;
  var frameSamples = [];
  var lastFrameAt = performance.now();
  var lastUiAt = 0;
  var lastReportAt = 0;
  var lastDeterminism = null;
  var stage = document.getElementById('stage');

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function parseSeed(value) {
    if (Number.isFinite(value)) return Number(value) >>> 0;
    var clean = String(value || '').trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,8}$/i.test(clean)) return null;
    return parseInt(clean, 16) >>> 0;
  }

  function seedHex(value) {
    return U.hex32(value >>> 0);
  }

  function dayLength() {
    return Game.F.BAL.dayLength;
  }

  function normalizeTime(value) {
    var length = dayLength();
    value = Number(value);
    if (!Number.isFinite(value)) value = 0;
    return ((value % length) + length) % length;
  }

  function regionName(item) {
    var key = 'region.' + item.id + '.name';
    var value = Game.i18n.t(key);
    return value === key ? item.id : value;
  }

  function particleLabel(id) {
    return D.t('weather.particle.' + id);
  }

  function phaseId(value) {
    var ratio = normalizeTime(value) / dayLength();
    if (ratio < 0.10 || ratio >= 0.96) return 'dawn';
    if (ratio < 0.50) return 'day';
    if (ratio < 0.63) return 'dusk';
    return 'night';
  }

  function phaseLabel(value) {
    var id = phaseId(value);
    if (id === 'dawn') return D.t('weather.dawn');
    if (id === 'day') return D.t('common.day');
    if (id === 'dusk') return D.t('common.dusk');
    return D.t('common.night');
  }

  function currentParticleId() {
    return particlePreset === 'region' ? region.particles : particlePreset;
  }

  function shallowParticleRegion() {
    return Object.assign({}, region, {
      world: layout.world,
      particles: currentParticleId()
    });
  }

  function mountWorld(nextLayout) {
    layout = nextLayout;
    var displayRegion = Object.assign({}, region, { world: layout.world });
    Game.world = {
      BOUND_TOP: 68,
      region: displayRegion,
      layout: layout,
      props: (layout.props || []).concat(
        layout.nodes || [], layout.landmarks || [],
        layout.curios || [], layout.ecology || []
      ),
      entities: [],
      groundLoot: [],
      hero: null,
      bossEnt: null,
      cinematic: null
    };
    Game.state.world.region = region.id;
    Game.state.world.worldSeed = requestedSeed >>> 0;
    Game.terrain.mount(layout, region);
    if (Game.terrain.rebuildDynamicSpatial) Game.terrain.rebuildDynamicSpatial([]);
    Game.weather.enterRegion(region.id, {
      worldSeed: requestedSeed,
      worldTime: Game.state.world.worldTime
    });
    applyWeatherPreview();
  }

  function generateLayout(seed) {
    var next = Game.terrain.generate(region, seed >>> 0, 3);
    var report = Game.terrain.validate(next, region);
    if (!report.valid) {
      next = Game.terrain.repair(next, report);
      report = Game.terrain.validate(next, region);
    }
    return { layout: next, validation: report };
  }

  function applyParticles() {
    Game.state.settings.effects = effectsEnabled;
    Game.particles.setEnabled(effectsEnabled);
    Game.particles.initRegion(shallowParticleRegion());
    document.getElementById('effects-toggle').checked = effectsEnabled;
    document.getElementById('particle-badge').textContent = currentParticleId();
  }

  function applyWeatherPreview() {
    if (!Game.weather || !Game.state) return null;
    if (weatherMode === 'forced') {
      Game.weather.setPreview({
        mode: 'forced',
        front: forcedFront,
        intensity: forcedIntensity,
        transitionProgress: forcedTransition
      });
    } else {
      Game.weather.clearPreview();
    }
    if (Game.weatherRender) Game.weatherRender.setReducedMotion(reducedMotion);
    return Game.weather.current();
  }

  function renderWeatherBoards() {
    var data = Game.weather.inspect();
    if (!data) return;
    document.getElementById('front-board').innerHTML = data.fronts.map(function (item) {
      return '<div class="front-card' + (item.front === data.front ? ' active' : '') + '">' +
        '<b>' + U.esc(item.front) + '</b><span>' +
        U.esc(Game.i18n.t(item.state.nameKey)) + '</span><small>' +
        item.visibility.toFixed(2) + '× · ' + item.intensity[0].toFixed(2) +
        '–' + item.intensity[1].toFixed(2) + '</small></div>';
    }).join('');
    var rows = regions.map(function (item) {
      var regionProfile = Game.content.get('regionProfile', item.id);
      var climate = Game.content.get('climateProfile', regionProfile.climateProfileId);
      return '<tr><td>' + U.esc(regionName(item)) + '</td><td>' +
        U.esc(climate.exposure) + '</td><td>' +
        climate.factors.precipitation.toFixed(2) + '</td><td>' +
        climate.factors.celestial.toFixed(2) + '</td><td>' +
        climate.factors.tint.toFixed(2) + '</td></tr>';
    }).join('');
    document.querySelector('#exposure-audit tbody').innerHTML = rows;
  }

  function updateWeatherUi() {
    var current = Game.weather.current();
    if (!current) return;
    document.getElementById('weather-mode').value = weatherMode;
    document.getElementById('weather-front').value = forcedFront;
    document.getElementById('weather-intensity').value = forcedIntensity;
    document.getElementById('intensity-output').textContent = forcedIntensity.toFixed(2);
    document.getElementById('weather-transition').value = forcedTransition;
    document.getElementById('transition-output').textContent =
      Math.round(forcedTransition * 100) + '%';
    document.getElementById('reduced-motion').checked = reducedMotion;
    document.getElementById('weather-state-badge').textContent =
      current.front.toUpperCase() + ' · ' + Game.i18n.t(current.stateNameKey);
    renderWeatherBoards();
  }

  function setCamera(target) {
    if (!layout) return null;
    var point;
    if (target === 'camp') point = layout.camp;
    else if (target === 'lair' || target === 'boss') point = layout.bossPoint;
    else if (target === 'center') point = { x: layout.world.w / 2, y: layout.world.h / 2 };
    else if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) point = target;
    if (!point) return null;
    Game.render.snapCamera(point.x, point.y);
    if (target && Number.isFinite(target.zoom)) Game.render.cam.zoom = target.zoom;
    else if (target === 'center') Game.render.cam.zoom = 1.15;
    else Game.render.cam.zoom = 2;
    return clone(Game.render.cam);
  }

  function renderRegionTabs() {
    var root = document.getElementById('region-tabs');
    root.innerHTML = regions.map(function (item, index) {
      return '<button type="button" class="region-tab' +
        (index === regionIndex ? ' active' : '') +
        '" data-region-id="' + U.esc(item.id) + '">' +
        '<small>' + String(index + 1).padStart(2, '0') + ' / TIER ' + item.tier + '</small>' +
        U.esc(regionName(item)) + '</button>';
    }).join('');
  }

  function renderParticleOptions() {
    var select = document.getElementById('particle-select');
    select.innerHTML = ['region'].concat(PARTICLE_PRESETS).map(function (id) {
      var label = id === 'region'
        ? D.t('weather.particleRegion', { particle: particleLabel(region.particles) })
        : particleLabel(id);
      return '<option value="' + id + '">' + U.esc(label) + '</option>';
    }).join('');
    select.value = particlePreset;
  }

  function updateHeader() {
    var climate = Game.content.get('climateProfile', 'climate.' + region.id);
    document.getElementById('region-index').textContent =
      String(regionIndex + 1).padStart(2, '0');
    document.getElementById('region-name').textContent = regionName(region);
    document.getElementById('region-meta').textContent =
      region.id + ' · ' + climate.exposure + ' · ' + region.particles + ' · layout v3';
    document.getElementById('seed-input').value = seedHex(requestedSeed);
    renderRegionTabs();
    renderParticleOptions();
  }

  function syncUrlAndLinks() {
    var params = new URLSearchParams();
    params.set('seed', seedHex(requestedSeed));
    params.set('region', region.id);
    params.set('time', String(Math.round(Game.state.world.worldTime)));
    params.set('particle', particlePreset);
    params.set('mode', weatherMode);
    params.set('front', forcedFront);
    params.set('state', Game.weather.current().stateId);
    params.set('intensity', forcedIntensity.toFixed(2));
    params.set('lang', D.locale());
    if (location.protocol !== 'file:') {
      history.replaceState(null, '', location.pathname + '?' + params.toString());
    }
    var common = new URLSearchParams({
      seed: seedHex(requestedSeed),
      region: region.id,
      lang: D.locale()
    });
    document.getElementById('map-lab-link').href =
      '../map-effects/map-effects.html?' + common.toString();
    document.getElementById('hazard-lab-link').href =
      '../hazards/hazards.html?' + common.toString();
  }

  function regenerate(options) {
    options = options || {};
    if (options.regionId) {
      var found = regions.findIndex(function (item) { return item.id === options.regionId; });
      if (found >= 0) regionIndex = found;
    }
    if (options.seed !== undefined) {
      var nextSeed = parseSeed(options.seed);
      if (nextSeed !== null) requestedSeed = nextSeed;
    }
    region = regions[regionIndex];
    var result = generateLayout(requestedSeed);
    validation = result.validation;
    mountWorld(result.layout);
    applyParticles();
    updateHeader();
    setCamera(options.camera || 'camp');
    Game.render.frame(0);
    capturePhases();
    updateWeatherUi();
    renderDiagnostics();
    syncUrlAndLinks();
    return snapshot();
  }

  function setRegion(id) {
    var found = regions.findIndex(function (item) {
      return item.id === id || item === id;
    });
    if (found < 0 && Number.isInteger(id) && regions[id]) found = id;
    if (found < 0) return false;
    regionIndex = found;
    regenerate({ camera: 'camp' });
    return true;
  }

  function setSeed(value) {
    var parsed = parseSeed(value);
    if (parsed === null) return false;
    requestedSeed = parsed;
    regenerate({ seed: parsed, camera: 'camp' });
    return true;
  }

  function setWorldTime(value) {
    Game.state.world.worldTime = normalizeTime(value);
    Game.weather.update(0, Game.state.world.worldTime);
    updateTimeUi();
    Game.render.frame(0);
    syncUrlAndLinks();
    return Game.state.world.worldTime;
  }

  function setParticlePreset(value) {
    if (value !== 'region' && PARTICLE_PRESETS.indexOf(value) < 0) return false;
    particlePreset = value;
    renderParticleOptions();
    applyParticles();
    syncUrlAndLinks();
    return currentParticleId();
  }

  function setEffects(value) {
    effectsEnabled = !!value;
    applyParticles();
    Game.bus.emit('settings:changed', { key: 'effects', value: effectsEnabled });
    Game.weather.update(0, Game.state.world.worldTime);
    return effectsEnabled;
  }

  function setWeatherMode(value) {
    if (['timeline', 'forced'].indexOf(value) < 0) return false;
    weatherMode = value;
    applyWeatherPreview();
    updateWeatherUi();
    syncUrlAndLinks();
    return weatherMode;
  }

  function setWeatherFront(value) {
    if (Game.weather.constants.fronts.indexOf(value) < 0) return false;
    forcedFront = value;
    if (weatherMode !== 'forced') weatherMode = 'forced';
    applyWeatherPreview();
    updateWeatherUi();
    syncUrlAndLinks();
    return clone(Game.weather.current());
  }

  function setWeatherIntensity(value) {
    value = Number(value);
    if (!Number.isFinite(value)) return false;
    forcedIntensity = U.clamp(value, 0, 1);
    applyWeatherPreview();
    updateWeatherUi();
    syncUrlAndLinks();
    return forcedIntensity;
  }

  function setTransitionProgress(value) {
    value = Number(value);
    if (!Number.isFinite(value)) return false;
    forcedTransition = U.clamp(value, 0, 1);
    applyWeatherPreview();
    updateWeatherUi();
    return forcedTransition;
  }

  function setReducedMotion(value) {
    reducedMotion = !!value;
    Game.weatherRender.setReducedMotion(reducedMotion);
    updateWeatherUi();
    return reducedMotion;
  }

  function formatClock(value) {
    var minutes = normalizeTime(value) / dayLength() * 20;
    var whole = Math.floor(minutes);
    var seconds = Math.floor((minutes - whole) * 60);
    return String(whole).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function updateTimeUi() {
    var time = normalizeTime(Game.state.world.worldTime);
    document.getElementById('time-slider').value = Math.round(time);
    document.getElementById('time-output').textContent =
      formatClock(time) + ' · ' + Math.round(time) + 's';
    var ratio = Math.round(Game.daynight.phase() * 100);
    document.getElementById('phase-badge').textContent =
      phaseLabel(time).toUpperCase() + ' · ' + ratio + '%';
    var currentWeather = Game.weather && Game.weather.current();
    if (currentWeather) {
      document.getElementById('weather-state-badge').textContent =
        currentWeather.front.toUpperCase() + ' · ' +
        Game.i18n.t(currentWeather.stateNameKey);
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-speed]'), function (button) {
      button.classList.toggle('active', Number(button.dataset.speed) === playbackSpeed);
    });
  }

  function canvasStats(canvas) {
    if (!canvas.width || !canvas.height) return { sampled: 0, visible: 0, colors: 0, hash: '0' };
    var pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    var stride = Math.max(4, Math.floor(pixels.length / 1800 / 4) * 4);
    var visible = 0;
    var samples = [];
    var colors = {};
    for (var i = 0; i < pixels.length; i += stride) {
      if (pixels[i + 3]) visible++;
      var rgb = pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2];
      colors[rgb] = true;
      samples.push(rgb + ',' + pixels[i + 3]);
    }
    return {
      sampled: samples.length,
      visible: visible,
      colors: Object.keys(colors).length,
      hash: U.fnv1a(samples.join('|'))
    };
  }

  function layoutHash(value) {
    return U.fnv1a(JSON.stringify({
      seed: value.worldSeed >>> 0,
      world: value.world,
      camp: value.camp,
      bossPoint: value.bossPoint,
      macro: value.macro && value.macro.centers,
      props: (value.props || []).map(function (item) {
        return [item.id || item.sprite, Math.round(item.x), Math.round(item.y)];
      }),
      nodes: (value.nodes || []).map(function (item) {
        return [item.id || item.defId, Math.round(item.x), Math.round(item.y)];
      })
    }));
  }

  function framePercentile(percentile) {
    if (!frameSamples.length) return 0;
    var sorted = frameSamples.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))];
  }

  function windSamples() {
    var points = [
      layout.camp,
      { x: layout.world.w / 2, y: layout.world.h / 2 },
      layout.bossPoint
    ];
    return points.map(function (point, index) {
      return Number(Game.terrain.windAt(point.x, index * 1.7, 0.18).toFixed(3));
    });
  }

  function snapshot() {
    if (!layout) return null;
    var canvas = canvasStats(stage);
    var currentWeather = Game.weather.inspect();
    var renderWeather = Game.weatherRender.diagnostics();
    return {
      lab: 'weather-climate-production',
      productionWeatherSystem: true,
      noPlayer: Game.world.hero === null,
      fogEnabled: false,
      saveWrites: false,
      populationStarted: false,
      combatStarted: false,
      regionId: region.id,
      seed: requestedSeed >>> 0,
      seedHex: seedHex(requestedSeed),
      layoutVersion: layout.version,
      layoutHash: layoutHash(layout),
      validation: {
        valid: !!(validation && validation.valid),
        failures: clone(validation && validation.failures || [])
      },
      worldTime: Number(Game.state.world.worldTime.toFixed(3)),
      dayLength: dayLength(),
      daynight: {
        phase: Number(Game.daynight.phase().toFixed(5)),
        phaseId: phaseId(Game.state.world.worldTime),
        nightFactor: Number(Game.daynight.nightFactor().toFixed(5))
      },
      weather: {
        mode: weatherMode,
        front: currentWeather.front,
        previousFront: currentWeather.previousFront,
        stateId: currentWeather.stateId,
        stateNameKey: currentWeather.stateNameKey,
        kind: currentWeather.kind,
        intensity: Number(currentWeather.intensity.toFixed(4)),
        transitionProgress: Number(currentWeather.transitionProgress.toFixed(4)),
        visibilityMultiplier: Number(currentWeather.visibilityMultiplier.toFixed(4)),
        wind: Number(currentWeather.wind.toFixed(4)),
        wetness: Number(currentWeather.wetness.toFixed(4)),
        cloudCover: Number(currentWeather.cloudCover.toFixed(4)),
        fogDensity: Number(currentWeather.fogDensity.toFixed(4)),
        precipitation: clone(currentWeather.precipitation),
        lightning: currentWeather.lightning,
        exposure: currentWeather.exposure,
        celestialVisibility: Number(currentWeather.celestialVisibility.toFixed(4)),
        tintInfluence: Number(currentWeather.tintInfluence.toFixed(4)),
        nextSwitchIn: Number(currentWeather.nextSwitchIn.toFixed(3)),
        nextLightningAt: currentWeather.nextLightningAt,
        lightningSequence: currentWeather.lightningSequence.slice(),
        render: renderWeather
      },
      atmosphere: {
        registeredParticle: region.particles,
        previewMode: particlePreset,
        activeParticle: currentParticleId(),
        effects: effectsEnabled,
        skyTop: region.skyTop,
        skyBottom: region.skyBottom,
        parallaxLayers: (region.parallax || []).length,
        parallaxTypes: (region.parallax || []).map(function (item) { return item.type; }),
        rays: region.rays ? clone(region.rays) : null,
        windSamples: windSamples()
      },
      camera: {
        x: Number(Game.render.cam.x.toFixed(2)),
        y: Number(Game.render.cam.y.toFixed(2)),
        zoom: Number(Game.render.cam.zoom.toFixed(3))
      },
      canvas: canvas,
      performance: {
        samples: frameSamples.length,
        averageMs: Number((frameSamples.reduce(function (sum, value) {
          return sum + value;
        }, 0) / Math.max(1, frameSamples.length)).toFixed(3)),
        p95Ms: Number(framePercentile(0.95).toFixed(3))
      },
      futureHooks: clone(FUTURE_HOOKS)
    };
  }

  function report() {
    return {
      snapshot: snapshot(),
      productionCapabilities: [
        'deterministic-300s-fronts',
        '24s-linear-transition',
        'eight-climate-profiles',
        'rain-snow-ash-steam-fog-motes',
        'wet-surface-response',
        'deterministic-lightning',
        'weather-visibility-provider',
        'daynight-exposure-controls'
      ],
      degradationContracts: [
        'effects-off-static-sky-and-hud',
        'reduced-motion-no-fast-particles-flash-shake',
        'underground-no-celestial-external-rain-lightning'
      ],
      intentionallyUnaffected: [
        'combat', 'movement', 'rewards', 'navigation', 'offline-estimation',
        'save-schema-v16'
      ],
      futureHooks: clone(FUTURE_HOOKS),
      lastDeterminism: clone(lastDeterminism)
    };
  }

  function metric(value, label) {
    return '<div class="metric"><strong title="' + U.esc(String(value)) + '">' +
      U.esc(String(value)) + '</strong><span>' + U.esc(label) + '</span></div>';
  }

  function renderDiagnostics() {
    if (!layout) return;
    var data = snapshot();
    var metrics = [
      [data.weather.front + ' / ' + data.weather.stateId, 'Front / regional state'],
      [data.weather.intensity.toFixed(3), 'Weather intensity'],
      [data.weather.visibilityMultiplier.toFixed(3) + '×', 'Hazard visibility'],
      [data.weather.wind.toFixed(3), 'Weather wind'],
      [data.weather.wetness.toFixed(3), 'Surface wetness'],
      [data.weather.nextSwitchIn.toFixed(1) + 's', 'Next front switch'],
      [data.weather.exposure + ' · ' + data.weather.celestialVisibility.toFixed(2),
        'Exposure / celestial'],
      [data.canvas.visible + ' px · ' + data.performance.averageMs +
        ' / ' + data.performance.p95Ms + ' ms',
        D.t('weather.metricFrame')]
    ];
    document.getElementById('metrics').innerHTML = metrics.map(function (entry) {
      return metric(entry[0], entry[1]);
    }).join('');
    document.getElementById('frame-badge').textContent =
      data.performance.p95Ms.toFixed(2) + ' ms P95';
    document.getElementById('report').textContent = JSON.stringify(report(), null, 2);
  }

  function capturePhases() {
    if (!layout) return [];
    var originalTime = Game.state.world.worldTime;
    var originalEffects = effectsEnabled;
    var captures = [];
    Game.particles.setEnabled(false);
    PHASES.forEach(function (phase) {
      Game.state.world.worldTime = phase.ratio * dayLength();
      Game.weather.update(0, Game.state.world.worldTime);
      Game.render.frame(0);
      var target = document.getElementById(phase.canvasId);
      var context = target.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, target.width, target.height);
      context.drawImage(stage, 0, 0, target.width, target.height);
      captures.push({
        id: phase.id,
        worldTime: Game.state.world.worldTime,
        hash: canvasStats(target).hash
      });
    });
    Game.state.world.worldTime = originalTime;
    Game.weather.update(0, originalTime);
    effectsEnabled = originalEffects;
    applyParticles();
    Game.render.frame(0);
    updateTimeUi();
    return captures;
  }

  function deterministicStaticPass() {
    var result = generateLayout(requestedSeed);
    validation = result.validation;
    mountWorld(result.layout);
    Game.particles.setEnabled(false);
    Game.render.snapCamera(layout.camp.x, layout.camp.y);
    Game.render.cam.zoom = 2;
    Game.render.frame(0);
    var weatherInspect = Game.weather.inspect();
    return {
      layoutHash: layoutHash(layout),
      camera: clone(Game.render.cam),
      daynight: {
        phase: Game.daynight.phase(),
        nightFactor: Game.daynight.nightFactor()
      },
      weather: {
        front: weatherInspect.front,
        stateId: weatherInspect.stateId,
        intensity: weatherInspect.intensity,
        transitionProgress: weatherInspect.transitionProgress,
        visibilityMultiplier: weatherInspect.visibilityMultiplier,
        lightningSequence: weatherInspect.lightningSequence
      },
      canvasHash: canvasStats(stage).hash
    };
  }

  function verifyDeterminism() {
    var originalTime = Game.state.world.worldTime;
    var originalCamera = clone(Game.render.cam);
    var originalEffects = effectsEnabled;
    var first = deterministicStaticPass();
    var second = deterministicStaticPass();
    Game.state.world.worldTime = normalizeTime(originalTime + dayLength() / 2);
    Game.weather.update(0, Game.state.world.worldTime);
    Game.render.frame(0);
    var alternateTimeHash = canvasStats(stage).hash;
    var alternateSeed = Game.terrain.generate(region, (requestedSeed + 1) >>> 0, 3);
    var alternateSeedHash = layoutHash(alternateSeed);
    var grassWeather = Game.weather.sample({
      worldSeed: requestedSeed, worldTime: originalTime, regionId: 'grassland'
    });
    var mineWeather = Game.weather.sample({
      worldSeed: requestedSeed, worldTime: originalTime, regionId: 'mine'
    });
    var same = JSON.stringify(first) === JSON.stringify(second);
    lastDeterminism = {
      sameInputsMatch: same,
      timeChangesCanvas: alternateTimeHash !== second.canvasHash,
      seedChangesLayout: alternateSeedHash !== second.layoutHash,
      crossRegionFrontMatches: grassWeather.front === mineWeather.front,
      crossRegionMicroclimateDiffers: grassWeather.stateId !== mineWeather.stateId,
      first: first,
      second: second,
      alternateTimeHash: alternateTimeHash,
      alternateSeedLayoutHash: alternateSeedHash
    };
    Game.state.world.worldTime = originalTime;
    Game.weather.update(0, originalTime);
    effectsEnabled = originalEffects;
    mountWorld(layout);
    Game.render.snapCamera(originalCamera.x, originalCamera.y);
    Game.render.cam.zoom = originalCamera.zoom;
    applyParticles();
    Game.render.frame(0);
    renderDiagnostics();
    var passed = lastDeterminism.sameInputsMatch &&
      lastDeterminism.timeChangesCanvas && lastDeterminism.seedChangesLayout &&
      lastDeterminism.crossRegionFrontMatches &&
      lastDeterminism.crossRegionMicroclimateDiffers;
    document.getElementById('verify-status').textContent =
      passed ? D.t('weather.verifyPassed') : D.t('weather.verifyFailed');
    return clone(lastDeterminism);
  }

  function bindEvents() {
    document.getElementById('region-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('[data-region-id]');
      if (button) setRegion(button.dataset.regionId);
    });
    document.getElementById('previous-region').addEventListener('click', function () {
      setRegion((regionIndex - 1 + regions.length) % regions.length);
    });
    document.getElementById('next-region').addEventListener('click', function () {
      setRegion((regionIndex + 1) % regions.length);
    });
    document.getElementById('regenerate').addEventListener('click', function () {
      regenerate({ seed: requestedSeed, camera: 'camp' });
    });
    document.getElementById('seed-form').addEventListener('submit', function (event) {
      event.preventDefault();
      if (!setSeed(document.getElementById('seed-input').value)) {
        document.getElementById('verify-status').textContent = D.t('weather.seedError');
      }
    });
    document.getElementById('particle-select').addEventListener('change', function () {
      setParticlePreset(this.value);
    });
    document.getElementById('effects-toggle').addEventListener('change', function () {
      setEffects(this.checked);
    });
    document.getElementById('weather-mode').addEventListener('change', function () {
      setWeatherMode(this.value);
    });
    document.getElementById('weather-front').addEventListener('change', function () {
      setWeatherFront(this.value);
    });
    document.getElementById('weather-intensity').addEventListener('input', function () {
      setWeatherIntensity(this.value);
    });
    document.getElementById('weather-transition').addEventListener('input', function () {
      setTransitionProgress(this.value);
    });
    document.getElementById('reduced-motion').addEventListener('change', function () {
      setReducedMotion(this.checked);
    });
    document.getElementById('trigger-lightning').addEventListener('click', function () {
      Game.weather.triggerLightning();
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-weather-layer]'), function (input) {
      input.addEventListener('change', function () {
        var next = {};
        next[input.dataset.weatherLayer] = input.checked;
        Game.weatherRender.setLayers(next);
        renderDiagnostics();
      });
    });
    document.getElementById('time-slider').addEventListener('input', function () {
      playbackSpeed = 0;
      setWorldTime(this.value);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-time-phase]'), function (button) {
      button.addEventListener('click', function () {
        var selected = PHASES.filter(function (phase) {
          return phase.id === button.dataset.timePhase;
        })[0];
        if (selected) setWorldTime(selected.ratio * dayLength());
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-speed]'), function (button) {
      button.addEventListener('click', function () {
        playbackSpeed = Number(button.dataset.speed);
        updateTimeUi();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-camera]'), function (button) {
      button.addEventListener('click', function () { setCamera(button.dataset.camera); });
    });
    document.getElementById('capture-phases').addEventListener('click', capturePhases);
    document.getElementById('verify-determinism').addEventListener('click', verifyDeterminism);
    window.addEventListener('demo:locale', function () {
      Game.i18n.setLocale(D.locale());
      updateHeader();
      updateTimeUi();
      updateWeatherUi();
      renderDiagnostics();
      syncUrlAndLinks();
    });
  }

  function frame(timestamp) {
    var dt = Math.min(0.1, Math.max(0, (timestamp - lastFrameAt) / 1000));
    lastFrameAt = timestamp;
    var began = performance.now();
    if (layout) {
      if (playbackSpeed > 0) {
        Game.state.world.worldTime = normalizeTime(
          Game.state.world.worldTime + dt * playbackSpeed
        );
      }
      Game.weather.update(dt, Game.state.world.worldTime);
      Game.terrain.update(dt);
      Game.particles.update(dt);
      Game.fx.update(dt);
      Game.render.frame(dt);
    }
    frameSamples.push(performance.now() - began);
    if (frameSamples.length > 240) frameSamples.shift();
    if (timestamp - lastUiAt > 180) {
      updateTimeUi();
      lastUiAt = timestamp;
    }
    if (timestamp - lastReportAt > 850) {
      renderDiagnostics();
      syncUrlAndLinks();
      lastReportAt = timestamp;
    }
    requestAnimationFrame(frame);
  }

  function init() {
    D.init();
    var audit = Game.content.finalize({ strict: true });
    if (!audit.ok) throw new Error('[WeatherClimateLab] content registry audit failed');
    Game.i18n.setLocale(D.locale());
    Game.state = {
      settings: { effects: true },
      world: {
        worldTime: 300,
        worldSeed: requestedSeed,
        layoutVersion: 3,
        mode: 'battle',
        region: 'grassland'
      }
    };
    Game.weather.init();
    Game.render.init(stage);
    regions = Game.reg.all('region');
    var params = new URLSearchParams(location.search);
    var requestedRegion = params.get('region');
    var found = regions.findIndex(function (item) { return item.id === requestedRegion; });
    regionIndex = found >= 0 ? found : 0;
    var seed = parseSeed(params.get('seed'));
    if (seed !== null) requestedSeed = seed;
    var time = Number(params.get('time'));
    if (Number.isFinite(time) && params.has('time')) Game.state.world.worldTime = normalizeTime(time);
    var requestedParticle = params.get('particle');
    if (requestedParticle === 'region' || PARTICLE_PRESETS.indexOf(requestedParticle) >= 0) {
      particlePreset = requestedParticle;
    }
    if (['timeline', 'forced'].indexOf(params.get('mode')) >= 0) {
      weatherMode = params.get('mode');
    }
    if (Game.weather.constants.fronts.indexOf(params.get('front')) >= 0) {
      forcedFront = params.get('front');
    }
    var requestedState = params.get('state');
    if (requestedState) {
      var requestedProfile = Game.content.get('climateProfile',
        'climate.' + regions[regionIndex].id);
      Game.weather.constants.fronts.some(function (front) {
        if (requestedProfile.states[front].id !== requestedState) return false;
        forcedFront = front;
        return true;
      });
    }
    var urlIntensity = Number(params.get('intensity'));
    if (Number.isFinite(urlIntensity) && params.has('intensity')) {
      forcedIntensity = U.clamp(urlIntensity, 0, 1);
    }
    bindEvents();
    regenerate({ seed: requestedSeed, camera: 'camp' });
    updateTimeUi();
    window.WeatherClimateLab = {
      regions: function () {
        return regions.map(function (item) {
          return { id: item.id, tier: item.tier, particles: item.particles };
        });
      },
      particlePresets: function () { return PARTICLE_PRESETS.slice(); },
      snapshot: snapshot,
      report: report,
      setRegion: setRegion,
      setSeed: setSeed,
      setWorldTime: setWorldTime,
      setParticlePreset: setParticlePreset,
      setEffects: setEffects,
      setWeatherMode: setWeatherMode,
      setWeatherFront: setWeatherFront,
      setWeatherIntensity: setWeatherIntensity,
      setTransitionProgress: setTransitionProgress,
      setReducedMotion: setReducedMotion,
      setRenderLayers: Game.weatherRender.setLayers,
      triggerLightning: Game.weather.triggerLightning,
      setCamera: setCamera,
      capturePhases: capturePhases,
      verifyDeterminism: verifyDeterminism
    };
    requestAnimationFrame(frame);
  }

  init();
})();
