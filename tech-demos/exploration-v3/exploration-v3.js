(function () {
  'use strict';
  var Game = window.Game;
  var canvas = document.getElementById('layout');
  var ctx = canvas.getContext('2d');
  var regionSelect = document.getElementById('region');
  var seedInput = document.getElementById('seed');
  var latest = null;

  Game.reg.all('region').forEach(function (r) {
    var option = document.createElement('option');
    option.value = r.id; option.textContent = r.id + ' · ' + r.exploration.macroPreset;
    regionSelect.appendChild(option);
  });
  var query = new URLSearchParams(location.search);
  if (Game.reg.has('region', query.get('region'))) regionSelect.value = query.get('region');
  if (/^[0-9a-f]{8}$/i.test(query.get('seed') || '')) seedInput.value = query.get('seed').toUpperCase();

  function colorForMaterial(mat) {
    return mat === 'blocked' ? '#151927' : '#3d5e4f';
  }

  function draw() {
    var layout = latest;
    if (!layout) return;
    var sx = canvas.width / layout.world.w, sy = canvas.height / layout.world.h;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var showDistance = document.getElementById('show-distance').checked;
    for (var y = 0; y < layout.nav.h; y++) {
      for (var x = 0; x < layout.nav.w; x++) {
        if (showDistance && layout.nav.grid[y][x]) {
          var d = Math.min(8, layout.nav.distance[y][x]);
          ctx.fillStyle = 'hsl(' + (190 - d * 11) + ',45%,' + (20 + d * 4) + '%)';
        } else {
          ctx.fillStyle = layout.nav.grid[y][x] ? '#354f47' : '#121623';
        }
        ctx.fillRect(x * layout.nav.cell * sx, y * layout.nav.cell * sy,
          Math.ceil(layout.nav.cell * sx) + 1, Math.ceil(layout.nav.cell * sy) + 1);
      }
    }
    if (document.getElementById('show-graph').checked) {
      ctx.lineWidth = 2;
      layout.macro.edges.forEach(function (e) {
        var a = layout.macro.centers[e.a], b = layout.macro.centers[e.b];
        ctx.strokeStyle = e.kind === 'alternate' ? '#6ebcc8aa' : (e.kind === 'loop' ? '#c7a65aaa' : '#8590a8aa');
        ctx.beginPath(); ctx.moveTo(a.x * sx, a.y * sy); ctx.lineTo(b.x * sx, b.y * sy); ctx.stroke();
      });
      layout.macro.centers.forEach(function (c) {
        ctx.fillStyle = c.role === 'camp' ? '#69d891' : (c.role === 'boss' ? '#ef705e' : '#bac2d4');
        ctx.fillRect(c.x * sx - 3, c.y * sy - 3, 6, 6);
      });
    }
    if (document.getElementById('show-content').checked) {
      function marks(list, color, radius) {
        ctx.fillStyle = color;
        list.forEach(function (p) {
          ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, radius, 0, Math.PI * 2); ctx.fill();
        });
      }
      marks(layout.landmarks, '#f0ce69', 4);
      marks(layout.nodes, '#62bde0', 2);
      marks(layout.curios, '#be83e8', 3);
      marks(layout.ecology, '#83e1d9', 2);
      marks(layout.threats, '#d6594f', 4);
      marks([layout.guardian], '#ffffff', 4);
    }
  }

  function generate() {
    var seed = parseInt(seedInput.value, 16);
    if (!Number.isFinite(seed)) seed = 0x12345678;
    seed >>>= 0;
    seedInput.value = Game.util.hex32(seed);
    var region = Game.reg.get('region', regionSelect.value);
    var started = performance.now();
    latest = Game.terrain.generate(region, seed, 3);
    var report = Game.terrain.validate(latest, region);
    var elapsed = performance.now() - started;
    var values = Object.assign({ generateMs: elapsed.toFixed(1), valid: report.valid }, report.metrics);
    var metrics = document.getElementById('metrics');
    metrics.innerHTML = '';
    ['valid', 'generateMs', 'walkableRatio', 'macroCenters', 'loopRank', 'resources', 'threats', 'chunks'].forEach(function (key) {
      var el = document.createElement('div');
      el.className = 'metric';
      el.innerHTML = '<span>' + key + '</span><strong>' + values[key] + '</strong>';
      metrics.appendChild(el);
    });
    document.getElementById('report').textContent = JSON.stringify({
      seed: Game.util.hex32(seed), region: region.id, preset: latest.preset,
      attempt: latest.attempt, repairs: latest.generation.repairs,
      fallback: latest.generation.fallback, failures: report.failures,
      metrics: report.metrics
    }, null, 2);
    history.replaceState(null, '', '?seed=' + Game.util.hex32(seed) + '&region=' + region.id);
    draw();
  }

  document.getElementById('generate').addEventListener('click', generate);
  ['show-distance', 'show-graph', 'show-content'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', draw);
  });
  generate();
})();
