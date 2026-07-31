/* ============================================================
 * render/weather.js — shared parameterized weather renderer
 * Sky veil, wet surface response, world precipitation and screen lightning.
 * No region-specific render engines or persistent particle queues.
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;
  var layers = { sky: true, surface: true, precipitation: true, screen: true };
  var reducedMotionOverride = false;
  var lightning = { t: 0, life: 0.48, seed: 0, exposure: 'open', intensity: 0 };
  var frameCost = 0;
  var costSamples = [];
  var PRECIPITATION_FIELD_SIZE = 256;
  var PRECIPITATION_MOTION = {
    rain: { candidates: 82, speed: [150, 235], windSpeed: 24, length: [7, 14] },
    drip: { candidates: 46, speed: [62, 96], windSpeed: 8, length: [3, 6] },
    snow: { candidates: 62, speed: [14, 28], windSpeed: 10, length: [1, 2], wobble: 5 },
    ash: { candidates: 54, speed: [9, 19], windSpeed: 12, length: [1, 1], wobble: 3 },
    dust: { candidates: 50, speed: [13, 25], windSpeed: 22, length: [1, 2], wobble: 4 },
    steam: { candidates: 38, speed: [7, 14], windSpeed: 7, length: [6, 10], wobble: 5 },
    motes: { candidates: 42, speed: [6, 13], windSpeed: 6, length: [1, 2], wobble: 4 }
  };

  function clock() {
    return window.performance && performance.now ? performance.now() : Date.now();
  }

  function recordCost(started) {
    frameCost += Math.max(0, clock() - started);
  }

  function percentile(values, ratio) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  }

  function weather() {
    return Game.weather && Game.weather.current ? Game.weather.current() : null;
  }

  function effectsOn() {
    return !(Game.state && Game.state.settings && Game.state.settings.effects === false);
  }

  function movingOn() {
    return effectsOn() && !reducedMotionOverride && U.motionEnabled();
  }

  function hashUnit(seed, index, salt) {
    var h = U.strSeed(seed + '|' + index + '|' + (salt || 0));
    return (h >>> 0) / 4294967296;
  }

  function precipitationColor(type) {
    if (type === 'snow') return '#f4f8ff';
    if (type === 'ash') return '#b8aaa3';
    if (type === 'dust') return '#c7b18c';
    if (type === 'steam') return '#e1ddd5';
    if (type === 'motes') return '#b8f2dc';
    if (type === 'drip') return '#8bc6d8';
    return '#a8c9df';
  }

  function positiveMod(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  /*
   * Build an origin-anchored, repeating world field. View bounds only cull the
   * field; they never participate in particle positions, so camera tracking
   * cannot drag the rain curtain along with the hero.
   */
  function precipitationPoints(w, viewL, viewT, viewR, viewB) {
    if (!w || !w.precipitation || w.precipitation.type === 'none') return [];
    var type = w.precipitation.type;
    var motion = PRECIPITATION_MOTION[type] || PRECIPITATION_MOTION.rain;
    var density = U.clamp(w.precipitation.density, 0, 1.35);
    if (density <= 0.01) return [];
    var fieldSize = PRECIPITATION_FIELD_SIZE;
    var pad = Math.max(18, motion.length[1] + Math.abs(w.wind) * 4);
    var firstTileX = Math.floor((viewL - pad) / fieldSize);
    var lastTileX = Math.floor((viewR + pad) / fieldSize);
    var firstTileY = Math.floor((viewT - pad) / fieldSize);
    var lastTileY = Math.floor((viewB + pad) / fieldSize);
    var count = Math.max(1, Math.ceil(motion.candidates * density));
    var seed = w.worldSeed + '|' + w.regionId + '|' + w.slotIndex + '|' + type;
    var time = w.worldTime;
    var points = [];

    for (var tileY = firstTileY; tileY <= lastTileY; tileY++) {
      for (var tileX = firstTileX; tileX <= lastTileX; tileX++) {
        var tileSeed = seed + '|' + tileX + '|' + tileY;
        for (var i = 0; i < count; i++) {
          var depth = 0.45 + hashUnit(tileSeed, i, 5) * 0.75;
          var speed = U.lerp(motion.speed[0], motion.speed[1],
            depth * 0.72 + hashUnit(tileSeed, i, 6) * 0.28);
          var phase = hashUnit(tileSeed, i, 7) * Math.PI * 2;
          var localX = hashUnit(tileSeed, i, 1) * fieldSize +
            time * w.wind * motion.windSpeed;
          if (motion.wobble) {
            localX += Math.sin(time * (0.7 + depth * 0.45) + phase) *
              motion.wobble * depth;
          }
          localX = positiveMod(localX, fieldSize);
          var localY = positiveMod(
            hashUnit(tileSeed, i, 2) * fieldSize + time * speed,
            fieldSize
          );
          var x = tileX * fieldSize + localX;
          var y = tileY * fieldSize + localY;
          if (x < viewL - pad || x > viewR + pad ||
              y < viewT - pad || y > viewB + pad) continue;
          points.push({
            id: tileX + ':' + tileY + ':' + i,
            x: x,
            y: y,
            depth: depth,
            speed: speed,
            length: U.lerp(motion.length[0], motion.length[1], depth),
            phase: phase
          });
        }
      }
    }
    return points;
  }

  function drawBolt(ctx, width, height, seed, alpha, violet) {
    var rng = U.seededRng(seed);
    var x = width * (0.24 + rng() * 0.52);
    var y = -4;
    var segments = 8;
    ctx.strokeStyle = violet
      ? 'rgba(222,166,255,' + alpha.toFixed(3) + ')'
      : 'rgba(232,242,255,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (var i = 1; i <= segments; i++) {
      x += (rng() - 0.5) * 24;
      y = height * 0.7 * i / segments;
      ctx.lineTo(Math.round(x), Math.round(y));
      if (i > 2 && i < 7 && rng() < 0.45) {
        var bx = x, by = y;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + (rng() - 0.5) * 34, by + 18 + rng() * 24);
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(1, alpha * 0.72).toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  Game.bus.on('weather:lightning', function (payload) {
    if (!effectsOn() || reducedMotionOverride || !U.motionEnabled()) return;
    lightning.t = lightning.life;
    lightning.seed = payload.seed >>> 0;
    lightning.exposure = payload.exposure;
    lightning.intensity = payload.intensity;
    if (payload.exposure !== 'canopy' && Game.fx && Game.fx.shake) {
      Game.fx.shake(1.2 + payload.intensity * 1.2, 0.16);
    }
  });

  Game.weatherRender = {
    setLayers: function (next) {
      Object.keys(layers).forEach(function (key) {
        if (next && next[key] !== undefined) layers[key] = next[key] !== false;
      });
      return Object.assign({}, layers);
    },

    layers: function () { return Object.assign({}, layers); },

    setReducedMotion: function (value) {
      reducedMotionOverride = value === true;
      if (reducedMotionOverride) lightning.t = 0;
      return reducedMotionOverride;
    },

    update: function (dt) {
      if (frameCost > 0 || costSamples.length) {
        costSamples.push(frameCost);
        if (costSamples.length > 240) costSamples.shift();
      }
      frameCost = 0;
      lightning.t = Math.max(0, lightning.t - Math.max(0, dt || 0));
    },

    drawSky: function (ctx, width, height) {
      if (!layers.sky) return;
      var w = weather();
      if (!w) return;
      var started = clock();
      var cover = U.clamp(w.cloudCover * (0.45 + w.intensity * 0.55), 0, 1);
      var rgb = U.hex2rgb(w.tint || '#667788');
      ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' +
        (0.08 + cover * 0.30).toFixed(3) + ')';
      ctx.fillRect(0, 0, width, height);
      if (cover > 0.18) {
        var band = ctx.createLinearGradient(0, 0, 0, height * 0.72);
        band.addColorStop(0, 'rgba(28,34,46,' + (cover * 0.34).toFixed(3) + ')');
        band.addColorStop(1, 'rgba(66,76,84,0)');
        ctx.fillStyle = band;
        ctx.fillRect(0, 0, width, height * 0.76);
      }
      if (w.fogDensity > 0.08) {
        var fog = ctx.createLinearGradient(0, height * 0.28, 0, height);
        fog.addColorStop(0, 'rgba(196,206,207,0)');
        fog.addColorStop(1, 'rgba(166,179,181,' +
          (w.fogDensity * (effectsOn() ? 0.25 : 0.17)).toFixed(3) + ')');
        ctx.fillStyle = fog;
        ctx.fillRect(0, 0, width, height);
      }
      recordCost(started);
    },

    drawSurface: function (ctx, viewL, viewT, viewR, viewB) {
      if (!layers.surface || !effectsOn()) return;
      var w = weather();
      if (!w || w.wetness <= 0.01) return;
      var started = clock();
      var width = viewR - viewL, height = viewB - viewT;
      var seed = w.worldSeed + '|' + w.regionId + '|wet';
      ctx.save();
      ctx.strokeStyle = 'rgba(190,220,230,' + (w.wetness * 0.18).toFixed(3) + ')';
      ctx.fillStyle = 'rgba(215,232,236,' + (w.wetness * 0.11).toFixed(3) + ')';
      ctx.lineWidth = 0.7;
      for (var i = 0; i < 42; i++) {
        var x = viewL + hashUnit(seed, i, 1) * width;
        var y = viewT + hashUnit(seed, i, 2) * height;
        var material = Game.terrain && Game.terrain.materialAt
          ? Game.terrain.materialAt(x, y) : 'dirt';
        if (material === 'water') {
          ctx.beginPath();
          ctx.ellipse(Math.round(x), Math.round(y), 3 + hashUnit(seed, i, 3) * 3, 1.2, 0, 0, 6.29);
          ctx.stroke();
        } else if (material === 'dirt' || material === 'stone') {
          ctx.fillRect(Math.round(x), Math.round(y), 3 + (i % 4), 1);
        }
      }
      ctx.restore();
      recordCost(started);
    },

    drawWorld: function (ctx, viewL, viewT, viewR, viewB) {
      if (!layers.precipitation || !movingOn()) return;
      var w = weather();
      if (!w || w.precipitation.type === 'none' || w.precipitation.density <= 0.01) return;
      var started = clock();
      var type = w.precipitation.type;
      var density = U.clamp(w.precipitation.density, 0, 1.35);
      var color = precipitationColor(type);
      var wind = w.wind;
      var points = precipitationPoints(w, viewL, viewT, viewR, viewB);
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = type === 'rain' || type === 'drip' ? 0.8 : 1;
      for (var i = 0; i < points.length; i++) {
        var point = points[i];
        var alpha = (0.25 + point.depth * 0.48) * Math.min(1, density);
        ctx.globalAlpha = alpha;
        if (type === 'rain' || type === 'drip') {
          ctx.beginPath();
          ctx.moveTo(Math.round(point.x), Math.round(point.y));
          ctx.lineTo(
            Math.round(point.x + wind * (type === 'rain' ? 4.2 : 1.8)),
            Math.round(point.y + point.length)
          );
          ctx.stroke();
        } else if (type === 'steam') {
          ctx.globalAlpha = alpha * 0.25;
          ctx.beginPath();
          ctx.ellipse(point.x, point.y, point.length,
            2 + point.depth * 2, 0, 0, 6.29);
          ctx.fill();
        } else {
          var size = type === 'snow' ?
            (hashUnit(point.id, i, 4) > 0.72 ? 2 : 1) :
            (type === 'ash' ? 1 : 2);
          ctx.fillRect(Math.round(point.x), Math.round(point.y), size, size);
        }
      }
      ctx.restore();
      recordCost(started);
    },

    inspectPrecipitation: function (bounds) {
      var w = weather();
      bounds = bounds || {};
      var left = Number(bounds.left) || 0;
      var top = Number(bounds.top) || 0;
      var right = Number.isFinite(bounds.right) ? bounds.right : left + 256;
      var bottom = Number.isFinite(bounds.bottom) ? bounds.bottom : top + 256;
      var type = w && w.precipitation ? w.precipitation.type : 'none';
      var motion = PRECIPITATION_MOTION[type] || null;
      return {
        coordinateSpace: 'world',
        fieldSize: PRECIPITATION_FIELD_SIZE,
        type: type,
        speedRange: motion ? motion.speed.slice() : [0, 0],
        points: precipitationPoints(w, left, top, right, bottom).map(function (point) {
          return {
            id: point.id,
            x: Number(point.x.toFixed(3)),
            y: Number(point.y.toFixed(3)),
            speed: Number(point.speed.toFixed(3))
          };
        })
      };
    },

    drawScreen: function (ctx, width, height) {
      if (!layers.screen || !effectsOn() || lightning.t <= 0 ||
          reducedMotionOverride || !U.motionEnabled()) return;
      var w = weather();
      if (!w) return;
      var started = clock();
      var progress = lightning.t / lightning.life;
      var canopy = lightning.exposure === 'canopy';
      var flashAlpha = Math.min(0.42, progress * lightning.intensity * (canopy ? 0.14 : 0.34));
      ctx.save();
      ctx.fillStyle = w.regionId === 'darkcastle'
        ? 'rgba(213,164,255,' + flashAlpha.toFixed(3) + ')'
        : 'rgba(226,238,255,' + flashAlpha.toFixed(3) + ')';
      ctx.fillRect(0, 0, width, height);
      if (!canopy && lightning.exposure !== 'underground') {
        drawBolt(ctx, width, height, lightning.seed, progress * 0.9,
          w.regionId === 'darkcastle');
      }
      ctx.restore();
      recordCost(started);
    },

    diagnostics: function () {
      var average = costSamples.reduce(function (sum, value) { return sum + value; }, 0) /
        Math.max(1, costSamples.length);
      return {
        layers: Object.assign({}, layers),
        reducedMotion: reducedMotionOverride,
        lightningActive: lightning.t > 0,
        deterministicParticles: true,
        precipitationCoordinateSpace: 'world',
        queuedParticles: 0,
        frameCostSamples: costSamples.length,
        averageFrameCostMs: Number(average.toFixed(3)),
        p95FrameCostMs: Number(percentile(costSamples, 0.95).toFixed(3))
      };
    }
  };
})();
