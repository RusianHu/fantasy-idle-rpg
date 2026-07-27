/* global Game, DemoI18n */
(function () {
  'use strict';
  var canvas = document.getElementById('layout');
  var ctx = canvas.getContext('2d');
  var regionSelect = document.getElementById('region');
  var seedInput = document.getElementById('seed');
  var auditButton = document.getElementById('audit');
  var auditStatus = document.getElementById('audit-status');
  var D = DemoI18n;
  var latest = null;

  D.init();
  Game.i18n.setLocale(D.locale());

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

  function marks(list, color, radius, sx, sy) {
    ctx.fillStyle = color;
    (list || []).forEach(function (point) {
      if (!point) return;
      ctx.beginPath();
      ctx.arc(point.x * sx, point.y * sy, radius, 0, Math.PI * 2);
      ctx.fill();
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

    if (document.getElementById('show-content').checked) {
      marks(layout.landmarks, '#f0ce69', 4, sx, sy);
      marks(layout.nodes, '#62bde0', 2, sx, sy);
      marks(layout.curios, '#be83e8', 3, sx, sy);
      marks(layout.ecology, '#83e1d9', 2, sx, sy);
      marks(layout.threats, '#d6594f', 4, sx, sy);
      marks([layout.guardian], '#ffffff', 4, sx, sy);
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
    ['valid', 'generateMs', 'walkableRatio', 'macroCenters', 'loopRank', 'resources', 'threats', 'chunks'].forEach(function (key) {
      var element = document.createElement('div');
      element.className = 'metric';
      element.innerHTML = '<span>' + key + '</span><strong>' + values[key] + '</strong>';
      root.appendChild(element);
    });
  }

  function normalizedSeed() {
    var seed = parseInt(seedInput.value, 16);
    if (!Number.isFinite(seed)) seed = 0x12345678;
    return seed >>> 0;
  }

  function generate() {
    var seed = normalizedSeed();
    seedInput.value = Game.util.hex32(seed);
    var region = Game.reg.get('region', regionSelect.value);
    var started = performance.now();
    latest = Game.terrain.generate(region, seed, 3);
    var report = Game.terrain.validate(latest, region);
    var elapsed = performance.now() - started;
    renderMetrics(Object.assign({ generateMs: elapsed.toFixed(1), valid: report.valid }, report.metrics));
    document.getElementById('report').textContent = JSON.stringify({
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
      contentIds: {
        landmarks: latest.landmarks.map(function (item) { return item.defId; }),
        resources: Array.from(new Set(latest.nodes.map(function (item) { return item.defId; }))),
        curios: latest.curios.map(function (item) { return item.defId; }),
        ecology: latest.ecology.map(function (item) { return item.defId; }),
        guardian: latest.guardian.defId
      }
    }, null, 2);
    if (location.protocol !== 'file:') {
      var url = new URL(location.href);
      url.searchParams.set('seed', Game.util.hex32(seed));
      url.searchParams.set('region', region.id);
      url.searchParams.set('lang', D.locale());
      history.replaceState(null, '', url.href);
    }
    draw();
    return report;
  }

  function auditSeeds() {
    auditButton.disabled = true;
    auditStatus.textContent = D.t('explore.auditRunning');
    requestAnimationFrame(function () {
      setTimeout(function () {
        var base = normalizedSeed();
        var region = Game.reg.get('region', regionSelect.value);
        var failures = [];
        var totalMs = 0;
        var maxMs = 0;
        try {
          for (var i = 0; i < 32; i++) {
            var seed = (base + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
            var started = performance.now();
            var layout = Game.terrain.generate(region, seed, 3);
            var report = Game.terrain.validate(layout, region);
            var elapsed = performance.now() - started;
            totalMs += elapsed;
            maxMs = Math.max(maxMs, elapsed);
            if (!report.valid) failures.push({ seed: Game.util.hex32(seed), failures: report.failures });
          }
          auditStatus.textContent = failures.length
            ? D.t('explore.auditFailed', { count: failures.length })
            : D.t('explore.auditDone', { max: maxMs.toFixed(1), avg: (totalMs / 32).toFixed(1) });
          if (failures.length) document.getElementById('report').textContent = JSON.stringify(failures, null, 2);
        } finally {
          auditButton.disabled = false;
        }
      }, 20);
    });
  }

  document.getElementById('generate').addEventListener('click', generate);
  auditButton.addEventListener('click', auditSeeds);
  regionSelect.addEventListener('change', generate);
  seedInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') generate(); });
  ['show-distance', 'show-graph', 'show-content', 'show-chunks'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', draw);
  });
  window.addEventListener('demo:locale', function () {
    var selected = regionSelect.value;
    buildRegionOptions(selected);
    generate();
  });
  generate();
})();
