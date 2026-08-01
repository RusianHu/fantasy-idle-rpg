/* global Game, DemoI18n */
(function () {
  'use strict';
  var canvas = document.getElementById('layout');
  var ctx = canvas.getContext('2d');
  var regionSelect = document.getElementById('region');
  var seedInput = document.getElementById('seed');
  var auditButton = document.getElementById('audit');
  var auditStatus = document.getElementById('audit-status');
  var autoScenario = document.getElementById('auto-scenario');
  var autoPolicy = document.getElementById('auto-policy');
  var runAutoButton = document.getElementById('run-auto');
  var auditAutoButton = document.getElementById('audit-auto');
  var autoStatus = document.getElementById('auto-status');
  var D = DemoI18n;
  var latest = null;
  var latestRoute = null;
  var latestBaseReport = null;
  var latestAutoResult = null;
  var latestAutoRun = null;
  var guardExpeditionIndex = 1;
  var guardRuntimeSequence = 0;
  var guardAuditHealth = 0.8;

  Game.content.finalize({ strict: true });
  D.init();
  Game.i18n.setLocale(D.locale());
  Game.state = {
    settings: { expeditionStrategy: 'balanced' },
    world: { worldTime: 0, region: 'grassland', worldSeed: 0, layoutVersion: 4,
      guardSites: { version: 1, layoutVersion: 4, regions: {} } },
    inv: { potions: {} }
  };
  Game.expedition = { current: function () { return { index: guardExpeditionIndex }; } };
  Game.player = { hpPct: function () { return guardAuditHealth; } };

  function regionName(region) {
    return Game.i18n.t('region.' + region.id + '.name');
  }

  function buildRegionOptions(selected) {
    regionSelect.innerHTML = '';
    Game.reg.all('region').forEach(function (region) {
      var option = document.createElement('option');
      option.value = region.id;
      option.textContent = regionName(region) + ' · ' + region.exploration.macroPreset;
      regionSelect.appendChild(option);
    });
    if (selected && Game.reg.has('region', selected)) regionSelect.value = selected;
  }

  var query = new URLSearchParams(location.search);
  buildRegionOptions(query.get('region'));
  if (/^[0-9a-f]{1,8}$/i.test(query.get('seed') || '')) seedInput.value = query.get('seed').toUpperCase();
  if (Game.autoRouteAudit.scenarios[query.get('scenario')]) {
    autoScenario.value = query.get('scenario');
  }
  if (['compare', 'legacy', 'current'].indexOf(query.get('policy')) >= 0) {
    autoPolicy.value = query.get('policy');
  }

  function markerSize() {
    var cssWidth = Math.max(1, canvas.getBoundingClientRect().width);
    return Math.max(17, Math.min(48, Math.round(15 * canvas.width / cssWidth)));
  }

  function marks(list, type, sx, sy) {
    var size = markerSize();
    (list || []).forEach(function (point) {
      if (!point) return;
      Game.mapIcons.draw(ctx, typeof type === 'function' ? type(point) : type,
        point.x * sx, point.y * sy, { size: size });
    });
  }

  function drawLegend() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-map-icon]'), function (icon) {
      Game.mapIcons.drawToDom(icon, icon.getAttribute('data-map-icon'));
    });
  }

  function draw() {
    var layout = latest;
    if (!layout) return;
    var sx = canvas.width / layout.world.w;
    var sy = canvas.height / layout.world.h;
    var showDistance = document.getElementById('show-distance').checked;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var y = 0; y < layout.nav.h; y++) {
      for (var x = 0; x < layout.nav.w; x++) {
        if (showDistance && layout.nav.grid[y][x]) {
          var distance = Math.min(8, layout.nav.distance[y][x]);
          ctx.fillStyle = 'hsl(' + (176 - distance * 9) + ',34%,' + (18 + distance * 4) + '%)';
        } else {
          ctx.fillStyle = layout.nav.grid[y][x] ? '#354d43' : '#111614';
        }
        ctx.fillRect(
          x * layout.nav.cell * sx,
          y * layout.nav.cell * sy,
          Math.ceil(layout.nav.cell * sx) + 1,
          Math.ceil(layout.nav.cell * sy) + 1
        );
      }
    }

    if (document.getElementById('show-graph').checked) {
      ctx.lineWidth = 2;
      layout.macro.edges.forEach(function (edge) {
        var a = layout.macro.centers[edge.a];
        var b = layout.macro.centers[edge.b];
        ctx.strokeStyle = edge.kind === 'alternate' ? '#63b8c5cc' : (edge.kind === 'loop' ? '#d0ad57cc' : '#929c93cc');
        ctx.beginPath();
        ctx.moveTo(a.x * sx, a.y * sy);
        ctx.lineTo(b.x * sx, b.y * sy);
        ctx.stroke();
      });
      layout.macro.centers.forEach(function (center) {
        ctx.fillStyle = center.role === 'camp' ? '#69d891' : (center.role === 'boss' ? '#ef705e' : '#d7d8d0');
        ctx.fillRect(center.x * sx - 3, center.y * sy - 3, 6, 6);
      });
    }

    if (document.getElementById('show-route').checked && latestRoute) {
      ctx.save();
      ctx.strokeStyle = latestRoute.reached ? '#7ee0c2' : '#ef705e';
      ctx.lineWidth = Math.max(2, Math.round(3 * canvas.width /
        Math.max(1, canvas.getBoundingClientRect().width)));
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      latestRoute.samples.forEach(function (point, index) {
        if (index) ctx.lineTo(point.x * sx, point.y * sy);
        else ctx.moveTo(point.x * sx, point.y * sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      latestRoute.legs.forEach(function (point, index) {
        ctx.fillStyle = index === latestRoute.legs.length - 1 ? '#ef705e' : '#f0cf6d';
        ctx.beginPath();
        ctx.arc(point.x * sx, point.y * sy, index === latestRoute.legs.length - 1 ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    if (document.getElementById('show-auto-route').checked && latestAutoRun &&
        latestAutoRun.samples.length) {
      var stateColors = {
        travel: '#7ee0c2', approach: '#f0cf6d', act: '#cf8ddb',
        combat: '#ef705e', reached: '#86c99c'
      };
      ctx.save();
      ctx.lineWidth = Math.max(2, Math.round(2 * canvas.width /
        Math.max(1, canvas.getBoundingClientRect().width)));
      ctx.setLineDash([]);
      for (var ai = 1; ai < latestAutoRun.samples.length; ai++) {
        var previous = latestAutoRun.samples[ai - 1];
        var sample = latestAutoRun.samples[ai];
        ctx.strokeStyle = stateColors[sample.state] || '#b8c0b9';
        ctx.beginPath();
        ctx.moveTo(previous.x * sx, previous.y * sy);
        ctx.lineTo(sample.x * sx, sample.y * sy);
        ctx.stroke();
      }
      if (latestAutoRun.target) {
        ctx.strokeStyle = latestAutoRun.passed ? '#86c99c' : '#ef705e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(latestAutoRun.target.x * sx, latestAutoRun.target.y * sy, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (document.getElementById('show-content').checked) {
      marks([layout.camp], 'camp', sx, sy);
      marks(layout.landmarks, function (point) { return point.bossLair ? 'lair' : 'landmark'; }, sx, sy);
      marks(layout.nodes, 'resource', sx, sy);
      marks(layout.curios, 'curio', sx, sy);
      marks(layout.ecology, 'ecology', sx, sy);
      marks(layout.threats, 'threat', sx, sy);
      marks([layout.guardian], 'guardian', sx, sy);
      marks(layout.nests || [], 'nest', sx, sy);
      marks(layout.treasureSites || [], 'chestLocked', sx, sy);
      marks(layout.guardSites || [], 'guardian', sx, sy);
      marks([{ x: layout.camp.x + 54, y: layout.camp.y + 36 }], 'hero', sx, sy);
    }

    if (document.getElementById('show-chunks').checked) {
      ctx.strokeStyle = '#d8c67680';
      ctx.lineWidth = 1;
      layout.chunks.forEach(function (chunk) {
        ctx.strokeRect(
          Math.round(chunk.x * sx) + 0.5,
          Math.round(chunk.y * sy) + 0.5,
          Math.round(chunk.w * sx),
          Math.round(chunk.h * sy)
        );
      });
    }
  }

  function renderMetrics(values) {
    var root = document.getElementById('metrics');
    root.innerHTML = '';
    [
      'valid', 'route', 'routeSeconds', 'routeLegs', 'navigationMs',
      'generateMs', 'walkableRatio', 'macroCenters', 'loopRank',
      'resources', 'threats', 'chunks'
    ].forEach(function (key) {
      var element = document.createElement('div');
      element.className = 'metric';
      element.innerHTML = '<span>' + key + '</span><strong>' + values[key] + '</strong>';
      root.appendChild(element);
    });
  }

  function compactAutoRun(run) {
    return {
      scenario: run.scenario,
      policy: run.policy,
      passed: run.passed,
      expectedLegacyGap: run.expectedLegacyGap,
      terminal: run.terminal,
      reason: run.reason,
      duration: run.duration,
      remaining: run.remaining,
      interaction: run.interaction,
      watchdog: run.watchdog,
      navigation: run.navigation,
      transitions: run.transitions,
      target: run.target,
      logs: run.logs
    };
  }

  function compactAutoResult(result) {
    if (!result) return null;
    if (result.legacy && result.current) {
      return {
        scenario: result.scenario,
        reproduced: result.reproduced,
        legacy: compactAutoRun(result.legacy),
        current: compactAutoRun(result.current)
      };
    }
    if (result.batch) return result;
    return compactAutoRun(result);
  }

  function renderFullReport() {
    if (!latestBaseReport) return;
    var report = Object.assign({}, latestBaseReport);
    if (latestAutoResult) report.autoNavigation = compactAutoResult(latestAutoResult);
    document.getElementById('report').textContent = JSON.stringify(report, null, 2);
  }

  function policyLabel(policy) {
    return D.t(policy === 'legacy'
      ? 'explore.policyLegacy' : 'explore.policyCurrent');
  }

  function metric(root, label, value, tone) {
    var item = document.createElement('div');
    item.className = 'auto-metric';
    if (tone) item.setAttribute('data-tone', tone);
    var name = document.createElement('span');
    var strong = document.createElement('strong');
    name.textContent = label;
    strong.textContent = value;
    item.appendChild(name);
    item.appendChild(strong);
    root.appendChild(item);
  }

  function navLabel(nav) {
    if (!nav) return '-';
    if (nav.fallback) return 'fallback';
    if (nav.pending) return 'pending';
    return nav.legs ? ((nav.leg + 1) + '/' + nav.legs) : 'local';
  }

  function renderAutoLogs(runs) {
    var root = document.getElementById('auto-log');
    root.innerHTML = '';
    var rows = [];
    runs.forEach(function (run) {
      run.logs.forEach(function (entry) {
        rows.push({ policy: run.policy, entry: entry });
      });
    });
    rows.sort(function (a, b) {
      return a.entry.t - b.entry.t || a.policy.localeCompare(b.policy);
    });
    rows.slice(0, 160).forEach(function (row) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-policy', row.policy);
      [
        row.entry.t.toFixed(2) + 's',
        policyLabel(row.policy),
        row.entry.event,
        row.entry.state,
        row.entry.distance.toFixed(1),
        navLabel(row.entry.nav)
      ].forEach(function (value) {
        var td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      root.appendChild(tr);
    });
  }

  function renderAutoResult(result) {
    var metrics = document.getElementById('auto-metrics');
    var report = document.getElementById('auto-report');
    metrics.innerHTML = '';
    latestAutoResult = result;
    var runs;
    if (result.legacy && result.current) {
      runs = [result.legacy, result.current];
      latestAutoRun = result.current;
      metric(metrics, D.t('explore.metricLegacy'),
        D.t(result.legacy.passed ? 'explore.verdictPass' : 'explore.verdictFail'),
        result.legacy.passed ? 'pass' : 'fail');
      metric(metrics, D.t('explore.metricCurrent'),
        D.t(result.current.passed ? 'explore.verdictPass' : 'explore.verdictFail'),
        result.current.passed ? 'pass' : 'fail');
      metric(metrics, D.t('explore.metricCoverage'),
        Math.round(result.current.watchdog.productionCoverage * 100) + '%',
        result.current.watchdog.productionCoverage < 1 ? 'fail' : 'pass');
      metric(metrics, D.t('explore.metricPhysicalStill'),
        result.legacy.watchdog.maxPhysicalStill.toFixed(2) + 's');
      metric(metrics, D.t('explore.metricCacheReset'),
        String(result.current.watchdog.cacheInvalidations));
      metric(metrics, D.t('explore.metricResume'),
        result.current.navigation.resumeLatency === null
          ? '-' : result.current.navigation.resumeLatency.toFixed(2) + 's');
      autoStatus.textContent = D.t(result.reproduced
        ? 'explore.autoReproduced' :
        (result.current.passed
          ? 'explore.autoPassed' : 'explore.autoUnexpected'));
      autoStatus.setAttribute('data-state', result.reproduced ? 'fail' :
        (result.current.passed ? 'pass' : 'fail'));
    } else {
      runs = [result];
      latestAutoRun = result;
      metric(metrics, D.t('explore.metricVerdict'),
        D.t(result.passed ? 'explore.verdictPass' : 'explore.verdictFail'),
        result.passed ? 'pass' : 'fail');
      metric(metrics, D.t('explore.metricTerminal'), result.terminal);
      metric(metrics, D.t('explore.metricCoverage'),
        Math.round(result.watchdog.productionCoverage * 100) + '%',
        result.watchdog.productionCoverage < 1 ? 'fail' : 'pass');
      metric(metrics, D.t('explore.metricPhysicalStill'),
        result.watchdog.maxPhysicalStill.toFixed(2) + 's');
      metric(metrics, D.t('explore.metricFallbacks'),
        String(result.navigation.fallbackCount));
      metric(metrics, D.t('explore.metricDuration'), result.duration.toFixed(2) + 's');
      autoStatus.textContent = D.t(result.passed
        ? 'explore.autoPassed' : 'explore.autoFailed');
      autoStatus.setAttribute('data-state', result.passed ? 'pass' : 'fail');
    }
    renderAutoLogs(runs);
    report.textContent = JSON.stringify(compactAutoResult(result), null, 2);
    renderFullReport();
    draw();
  }

  function runAutoAudit() {
    if (!latest) return;
    autoStatus.textContent = D.t('explore.autoRunning');
    autoStatus.setAttribute('data-state', 'running');
    var base = Game.autoRouteAudit.baseline(latest);
    var scenario = autoScenario.value;
    var policy = autoPolicy.value;
    var result = policy === 'compare'
      ? Game.autoRouteAudit.compare(latest, scenario, base)
      : Game.autoRouteAudit.run(latest, scenario, policy, base);
    if (location.protocol !== 'file:') {
      var url = new URL(location.href);
      url.searchParams.set('scenario', scenario);
      url.searchParams.set('policy', policy);
      history.replaceState(null, '', url.href);
    }
    renderAutoResult(result);
  }

  function renderAutoBatch(batch) {
    var metrics = document.getElementById('auto-metrics');
    metrics.innerHTML = '';
    metric(metrics, D.t('explore.metricSeeds'), batch.seeds + '/32',
      batch.seeds === 32 ? 'pass' : 'fail');
    metric(metrics, D.t('explore.metricLegacyGaps'), batch.legacyGaps + '/64',
      batch.legacyGaps === 64 ? 'pass' : 'fail');
    metric(metrics, D.t('explore.metricCurrentRecovered'), batch.currentRecovered + '/64',
      batch.currentRecovered === 64 ? 'pass' : 'fail');
    metric(metrics, D.t('explore.metricNormal'), batch.normalPassed + '/128',
      batch.normalPassed === 128 ? 'pass' : 'fail');
    metric(metrics, D.t('explore.metricUnexpected'), String(batch.unexpected.length),
      batch.unexpected.length ? 'fail' : 'pass');
    metric(metrics, D.t('explore.metricLongest'), batch.longest.toFixed(2) + 's');
    autoStatus.textContent = batch.unexpected.length
      ? D.t('explore.autoBatchFailed', { count: batch.unexpected.length })
      : D.t('explore.autoBatchDone', {
        reproduced: batch.legacyGaps,
        recovered: batch.currentRecovered
      });
    autoStatus.setAttribute('data-state', batch.unexpected.length ? 'fail' : 'pass');
    document.getElementById('auto-log').innerHTML = '';
    document.getElementById('auto-report').textContent = JSON.stringify(batch, null, 2);
    latestAutoResult = { batch: batch };
    renderFullReport();
  }

  function auditAutoSeeds() {
    runAutoButton.disabled = true;
    auditAutoButton.disabled = true;
    autoStatus.textContent = D.t('explore.autoBatchRunning');
    autoStatus.setAttribute('data-state', 'running');
    requestAnimationFrame(function () {
      setTimeout(function () {
        var baseSeed = normalizedSeed();
        var region = Game.reg.get('region', regionSelect.value);
        var batch = {
          seeds: 0, legacyGaps: 0, currentRecovered: 0,
          normalPassed: 0, longest: 0, unexpected: []
        };
        var normalScenarios = [
          'gather-resume', 'chest-resume', 'gather-threat', 'chest-expiry'
        ];
        var fallbackScenarios = ['gather-fallback', 'chest-fallback'];
        try {
          for (var i = 0; i < 32; i++) {
            var seed = (baseSeed + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
            var layout = Game.terrain.generate(region, seed, 4);
            var base = Game.autoRouteAudit.baseline(layout);
            var seedOk = base.reached;
            normalScenarios.forEach(function (scenario) {
              var run = Game.autoRouteAudit.run(layout, scenario, 'current', base);
              batch.longest = Math.max(batch.longest, run.duration);
              if (run.passed) batch.normalPassed++;
              else {
                seedOk = false;
                batch.unexpected.push({
                  seed: Game.util.hex32(seed), scenario: scenario,
                  policy: 'current', reason: run.reason
                });
              }
            });
            fallbackScenarios.forEach(function (scenario) {
              var comparison = Game.autoRouteAudit.compare(layout, scenario, base);
              batch.longest = Math.max(
                batch.longest, comparison.legacy.duration, comparison.current.duration
              );
              if (comparison.reproduced) batch.legacyGaps++;
              else {
                seedOk = false;
                batch.unexpected.push({
                  seed: Game.util.hex32(seed), scenario: scenario,
                  policy: 'legacy', reason: comparison.legacy.passed
                    ? 'gap-not-reproduced' : comparison.legacy.reason
                });
              }
              if (comparison.current.passed) batch.currentRecovered++;
              else {
                seedOk = false;
                batch.unexpected.push({
                  seed: Game.util.hex32(seed), scenario: scenario,
                  policy: 'current', reason: comparison.current.reason
                });
              }
            });
            if (seedOk) batch.seeds++;
          }
          renderAutoBatch(batch);
        } finally {
          if (latest) {
            Game.terrain.layout = latest;
            Game.nav.useLayout(latest);
          }
          runAutoButton.disabled = false;
          auditAutoButton.disabled = false;
        }
      }, 20);
    });
  }

  function normalizedSeed() {
    var seed = parseInt(seedInput.value, 16);
    if (!Number.isFinite(seed)) seed = 0x12345678;
    return seed >>> 0;
  }

  function simulateLongRoute(layout) {
    Game.terrain.layout = layout;
    Game.nav.useLayout(layout);
    var hero = { x: layout.camp.x, y: layout.camp.y, navRoute: null };
    var target = layout.bossPoint;
    var samples = [{ x: hero.x, y: hero.y }];
    var legs = [];
    var remaining = Game.util.dist(hero.x, hero.y, target.x, target.y);
    var started = performance.now();

    function directMove(ent, tx, ty, speed, dt) {
      var dx = tx - ent.x, dy = ty - ent.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 0.5) return 0;
      var step = Math.min(distance, speed * Math.min(dt, 0.25));
      var swept = Game.terrain.sweepMove(
        ent.x, ent.y, dx / distance * step, dy / distance * step, 7
      );
      ent.x = swept.x;
      ent.y = swept.y;
      return distance - swept.moved;
    }

    var tick = 0;
    for (; tick < 3600; tick++) {
      Game.nav.update(2);
      remaining = Game.nav.step(
        hero, target.x, target.y, 56, 0.05, 'audit:camp-to-lair', directMove
      );
      if (!legs.length && hero.navRoute) {
        legs = hero.navRoute.legs.map(function (point) {
          return { id: point.id, x: point.x, y: point.y };
        });
      }
      if (tick % 5 === 0) samples.push({ x: hero.x, y: hero.y });
      if (remaining < 5) break;
    }
    samples.push({ x: hero.x, y: hero.y });
    return {
      reached: remaining < 5,
      travelSeconds: +(tick * 0.05).toFixed(2),
      navigationMs: +(performance.now() - started).toFixed(2),
      remaining: +remaining.toFixed(2),
      legs: legs,
      macroIds: hero.navRoute ? hero.navRoute.macroIds.slice() : [],
      recoveries: hero.navRoute ? hero.navRoute.recoveries : 0,
      peakSolveMs: +Game.nav.diagnostics.peakMs.toFixed(3),
      samples: samples
    };
  }

  function generate() {
    var seed = normalizedSeed();
    seedInput.value = Game.util.hex32(seed);
    var region = Game.reg.get('region', regionSelect.value);
    Game.state.world.region = region.id;
    Game.state.world.worldSeed = seed;
    var started = performance.now();
    latest = Game.terrain.generate(region, seed, 4);
    var report = Game.terrain.validate(latest, region);
    var elapsed = performance.now() - started;
    latestRoute = simulateLongRoute(latest);
    var regionProfile = Game.content.get('regionProfile', region.id);
    var population = regionProfile &&
      Game.content.populationView(regionProfile.populationProfileId);
    renderMetrics(Object.assign({
      generateMs: elapsed.toFixed(1),
      valid: report.valid,
      route: D.t(latestRoute.reached ? 'explore.routePass' : 'explore.routeFail'),
      routeSeconds: latestRoute.travelSeconds.toFixed(1),
      routeLegs: latestRoute.legs.length,
      navigationMs: latestRoute.navigationMs.toFixed(1)
    }, report.metrics));
    latestBaseReport = {
      seed: Game.util.hex32(seed),
      region: region.id,
      layoutVersion: latest.version,
      preset: latest.preset,
      attempt: latest.attempt,
      attempts: latest.generation.attempts,
      repairs: latest.generation.repairs,
      fallback: latest.generation.fallback,
      failures: report.failures,
      metrics: report.metrics,
      navigation: {
        reached: latestRoute.reached,
        travelSeconds: latestRoute.travelSeconds,
        navigationMs: latestRoute.navigationMs,
        remaining: latestRoute.remaining,
        macroIds: latestRoute.macroIds,
        legs: latestRoute.legs,
        recoveries: latestRoute.recoveries,
        peakSolveMs: latestRoute.peakSolveMs
      },
      contentIds: {
        landmarks: latest.landmarks.map(function (item) { return item.defId; }),
        resources: Array.from(new Set(latest.nodes.map(function (item) { return item.defId; }))),
        curios: latest.curios.map(function (item) { return item.defId; }),
        ecology: latest.ecology.map(function (item) { return item.defId; }),
        guardian: latest.guardian.defId,
        nests: latest.nests.map(function (item) { return item.id; }),
        treasures: latest.treasureSites.map(function (item) { return item.id; }),
        guardSites: latest.guardSites.map(function (item) { return item.id; })
      },
      population: population && {
        id: population.id,
        sourceFingerprint: population.sourceFingerprint,
        channels: Object.keys(population.channels).sort().reduce(function (out, channel) {
          out[channel] = {
            capacity: population.channels[channel].capacity,
            selection: population.channels[channel].selection,
            spawnProfiles: population.channels[channel].spawnRefs.map(function (entry) {
              var profile = Game.content.get('worldSpawnProfile', entry.profileId);
              return {
                id: entry.profileId,
                mode: entry.mode,
                identity: profile && profile.identity,
                placement: profile && profile.placement
              };
            })
          };
          return out;
        }, {})
      }
    };
    latestAutoResult = null;
    renderFullReport();
    if (location.protocol !== 'file:') {
      var url = new URL(location.href);
      url.searchParams.set('seed', Game.util.hex32(seed));
      url.searchParams.set('region', region.id);
      url.searchParams.set('lang', D.locale());
      history.replaceState(null, '', url.href);
    }
    draw();
    runAutoAudit();
    runGuardAudit('victory');
    return report;
  }

  function guardRuntimeReset() {
    var rid = regionSelect.value, region = Game.reg.get('region', rid);
    if (!latest || !region) return null;
    if (Game.encounters) Game.encounters.reset();
    if (Game.guardSites) Game.guardSites.reset();
    if (Game.population) Game.population.reset(rid);
    if (Game.actors) Game.actors.reset();
    if (Game.parties) Game.parties.reset();
    if (Game.relations && Game.relations.reset) Game.relations.reset();
    Game.state.world.region = rid;
    Game.state.world.worldSeed = latest.worldSeed;
    Game.state.world.layoutVersion = 4;
    Game.state.world.worldTime = 100;
    Game.state.world.guardSites = { version: 1, layoutVersion: 4, regions: {} };
    Game.world.region = region;
    Game.world.layout = latest;
    Game.world.entities = [];
    Game.world.props = [];
    Game.world.groundLoot = [];
    Game.world.encounterSequence = 1;
    Game.world.encounterOrdinals = {};
    var hero = Game.actors.spawn({
      id: 'guard-audit:hero:' + (++guardRuntimeSequence), archetypeId: 'adventurer',
      classId: 'fighter', level: 10, tier: Game.State.regionTier(rid),
      factionId: 'adventurers', controllerId: 'ai:player-auto',
      transform: { x: latest.camp.x, y: latest.camp.y + 24, direction: 'd' },
      spawnSource: { kind: 'lab', sourceId: 'exploration-v4-guard-audit', sequence: guardRuntimeSequence }
    });
    hero.x = latest.camp.x; hero.y = latest.camp.y + 24;
    Game.world.hero = hero;
    Game.world.entities.push(hero);
    Game.guardSites.initRegion(rid, latest);
    return hero;
  }

  function siteForGuardKind(targetKind) {
    var snapshots = (latest.nodes || []).concat(latest.treasureSites || [], latest.bossGatePoint || []);
    for (var i = 0; i < snapshots.length; i++) {
      var site = Game.guardSites.forTarget(snapshots[i]);
      if (site && site.targetKind === targetKind && site.state !== 'cleared') return site;
    }
    return null;
  }

  function moveHeroTo(site) {
    var hero = Game.world.hero;
    hero.x = site.x; hero.y = site.y;
    hero.components.transform.x = site.x; hero.components.transform.y = site.y;
    return hero;
  }

  function killGuardActors(site) {
    var ids = site.actorIds.slice();
    ids.forEach(function (id) {
      var actor = Game.actors.get(id);
      if (!actor) return;
      actor.dead = true; actor.hp = 0;
      if (actor.components.vitals) actor.components.vitals.hp = 0;
    });
    // Exercise the real Population lease callback before the EventBus victory
    // signal, matching production world.onEntityKilled ordering. Guard sites
    // must suppress the profile's generic guardian respawn timer.
    if (ids.length && Game.population && Game.population.onActorDefeated) {
      Game.population.onActorDefeated(Game.actors.get(ids[0]));
    }
    Game.bus.emit('actor:defeated', { targetActorIds: ids });
    return ids;
  }

  function runGuardAudit(scenario) {
    if (!latest) return null;
    var strategy = document.getElementById('guard-strategy').value;
    var health = Game.util.clamp(Number(document.getElementById('guard-health').value) || 0.8, 0.1, 1);
    var targetKind = document.getElementById('guard-kind').value;
    Game.state.settings.expeditionStrategy = strategy;
    guardAuditHealth = health;
    var hero = guardRuntimeReset();
    var site = siteForGuardKind(targetKind);
    if (!hero || !site) return null;
    var beforeSnapshot = Game.guardSites.snapshot();
    var initial = site.state;
    var profile = Game.content.get('guardSiteProfile', site.profileId);
    var poolId = site.mode === 'ambush' ? profile.ambushPoolId : profile.visiblePoolId;
    var resolution = Game.encounterPools.resolve(poolId, {
      worldSeed: latest.worldSeed, regionId: regionSelect.value, layoutVersion: 4,
      expeditionIndex: guardExpeditionIndex, siteId: site.id
    });
    var threshold = Game.guardSites.autoThreshold(targetKind);
    var autoEligible = Game.guardSites.autoEligible(site);
    var result = {
      productionModules: ['terrain_v4', 'actors', 'population.materialize', 'encounters',
        'world.startEncounter', 'guard_sites'],
      scenario: scenario || 'victory', strategy: strategy, health: health, threshold: threshold,
      autoEligible: autoEligible, expeditionIndex: guardExpeditionIndex, siteId: site.id,
      initialState: initial, poolId: poolId, resolution: resolution,
      concealedExposed: initial === 'concealed' &&
        beforeSnapshot.some(function (candidate) { return candidate.id === site.id; }),
      contract: Game.guardSites.contract
    };
    if (!autoEligible) {
      result.outcome = 'health-blocked';
      result.state = Game.guardSites.forTarget(site.targetId).state;
    } else if (scenario === 'expedition') {
      guardExpeditionIndex++;
      Game.guardSites.resetExpedition(regionSelect.value);
      var rearmed = siteForGuardKind(targetKind);
      result.outcome = 'expedition-reset';
      result.expeditionIndex = guardExpeditionIndex;
      result.state = rearmed && rearmed.state;
      result.canInteract = rearmed && Game.guardSites.canInteract(rearmed.targetId);
    } else {
      moveHeroTo(site);
      result.triggered = Game.guardSites.trigger(site, { targetId: site.targetId, reason: 'lab-' + scenario });
      var engaged = Game.guardSites.forTarget(site.targetId);
      result.afterTrigger = engaged && { state: engaged.state, encounterId: engaged.encounterId,
        actorIds: engaged.actorIds.slice(), spawnId: engaged.spawnId };
      if (scenario === 'retreat' || scenario === 'defeat') {
        Game.encounters.end(engaged.encounterId,
          scenario === 'defeat' ? 'party-defeated' : 'escape');
        Game.state.world.worldTime += 3;
        Game.guardSites.update();
        var restored = Game.guardSites.forTarget(site.targetId);
        result.outcome = scenario === 'defeat' ? 'party-defeated-and-rearmed' : 'retreated-and-rearmed';
        result.state = restored && restored.state;
        result.actorCount = restored && restored.actorIds.length;
        result.canInteract = restored && Game.guardSites.canInteract(restored.targetId);
      } else if (scenario === 'reload') {
        var persisted = JSON.parse(JSON.stringify(Game.state.world.guardSites));
        Game.encounters.end(engaged.encounterId, 'lab-reload');
        Game.guardSites.reset();
        Game.population.reset(regionSelect.value);
        Game.world.entities = [hero];
        Game.state.world.guardSites = persisted;
        Game.guardSites.initRegion(regionSelect.value, latest);
        var restoredAfterLoad = Game.guardSites.forTarget(site.targetId);
        result.outcome = 'save-and-reload';
        result.persisted = persisted;
        result.state = restoredAfterLoad && restoredAfterLoad.state;
        result.actorCount = restoredAfterLoad && restoredAfterLoad.actorIds.length;
      } else {
        var actorIds = killGuardActors(engaged);
        var encounterEnded = Game.encounters.end(engaged.encounterId, 'victory', {
          done: true, status: 'success', reason: 'victory'
        });
        Game.state.world.worldTime += 121;
        var postVictoryPopulation = Game.population && Game.population.update
          ? Game.population.update(121, Game.state.world.worldTime) : { spawned: [] };
        Game.guardSites.update();
        var cleared = Game.guardSites.forTarget(site.targetId);
        result.outcome = 'victory';
        result.defeatedActorIds = actorIds;
        result.encounterEnded = encounterEnded;
        result.postVictoryWorldTime = Game.state.world.worldTime;
        result.postVictorySpawned = (postVictoryPopulation.spawned || []).map(function (spawn) {
          return spawn.lease && spawn.lease.spawnId;
        });
        result.state = cleared && cleared.state;
        result.canInteract = cleared && Game.guardSites.canInteract(cleared.targetId);
        result.resumeTargetId = Game.guardSites.consumeResumeTargetId();
      }
    }
    result.passed = result.outcome === 'health-blocked' ||
      (result.outcome === 'victory' && result.state === 'cleared' && result.canInteract &&
        result.postVictorySpawned && result.postVictorySpawned.length === 0) ||
      ((result.outcome === 'party-defeated-and-rearmed' || result.outcome === 'retreated-and-rearmed') &&
        result.state === 'revealed' && result.actorCount > 0 && !result.canInteract) ||
      (result.outcome === 'save-and-reload' && result.state === 'revealed' && result.actorCount > 0) ||
      (result.outcome === 'expedition-reset' && result.state !== 'cleared' && !result.canInteract);
    document.getElementById('guard-audit-report').textContent = JSON.stringify(result, null, 2);
    document.getElementById('guard-audit-status').textContent =
      (result.outcome === 'health-blocked' ? 'CAMP RECOVERY' : (result.passed ? 'PASS' : 'FAIL')) +
      ' · E' + result.expeditionIndex + ' · ' + site.id;
    return result;
  }

  function auditSeeds() {
    auditButton.disabled = true;
    auditStatus.textContent = D.t('explore.auditRunning');
    requestAnimationFrame(function () {
      setTimeout(function () {
        var base = normalizedSeed();
        var region = Game.reg.get('region', regionSelect.value);
        var failures = [];
        var routeFailures = [];
        var totalMs = 0;
        var maxMs = 0;
        var maxRouteSeconds = 0;
        try {
          for (var i = 0; i < 32; i++) {
            var seed = (base + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
            var started = performance.now();
            var layout = Game.terrain.generate(region, seed, 4);
            var report = Game.terrain.validate(layout, region);
            var elapsed = performance.now() - started;
            totalMs += elapsed;
            maxMs = Math.max(maxMs, elapsed);
            if (!report.valid) failures.push({ seed: Game.util.hex32(seed), failures: report.failures });
            var route = simulateLongRoute(layout);
            maxRouteSeconds = Math.max(maxRouteSeconds, route.travelSeconds);
            if (!route.reached) {
              routeFailures.push({
                seed: Game.util.hex32(seed),
                remaining: route.remaining,
                macroIds: route.macroIds
              });
            }
          }
          auditStatus.textContent = failures.length || routeFailures.length
            ? D.t('explore.auditFailed', {
              count: failures.length,
              routes: routeFailures.length
            })
            : D.t('explore.auditDone', {
              max: maxMs.toFixed(1),
              avg: (totalMs / 32).toFixed(1),
              routeMax: maxRouteSeconds.toFixed(1)
            });
          if (failures.length || routeFailures.length) {
            document.getElementById('report').textContent = JSON.stringify({
              layouts: failures,
              routes: routeFailures
            }, null, 2);
          }
        } finally {
          if (latest) {
            Game.terrain.layout = latest;
            Game.nav.useLayout(latest);
          }
          auditButton.disabled = false;
        }
      }, 20);
    });
  }

  document.getElementById('generate').addEventListener('click', generate);
  auditButton.addEventListener('click', auditSeeds);
  runAutoButton.addEventListener('click', runAutoAudit);
  auditAutoButton.addEventListener('click', auditAutoSeeds);
  document.querySelector('.guard-audit').addEventListener('click', function (event) {
    var button = event.target.closest('[data-guard-audit]');
    if (button) runGuardAudit(button.getAttribute('data-guard-audit'));
  });
  ['guard-strategy', 'guard-health', 'guard-kind'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', function () { runGuardAudit('victory'); });
  });
  regionSelect.addEventListener('change', generate);
  seedInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') generate(); });
  ['show-distance', 'show-graph', 'show-route', 'show-auto-route', 'show-content', 'show-chunks'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', draw);
  });
  window.addEventListener('demo:locale', function () {
    var selected = regionSelect.value;
    var preservedBatch = latestAutoResult && latestAutoResult.batch;
    buildRegionOptions(selected);
    generate();
    if (preservedBatch) renderAutoBatch(preservedBatch);
  });
  drawLegend();
  generate();
})();
