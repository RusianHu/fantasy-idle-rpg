/* ============================================================
 * render/exploration.js — v3 区块地表、危险情报与远征覆盖层
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;
  var T = Game.terrain;
  var legacyBake = T.bake;
  var legacyDrawGround = T.drawGround;
  var legacyUpdate = T.update;
  var queue = [];
  var chunkSeq = 0;

  function noise(x, y, seed) {
    var h = Math.imul((x | 0) ^ seed, 374761393);
    h = Math.imul(h ^ Math.imul(y | 0, 668265263), 1274126177);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  function cellNoise(gx, gy, sx, sy, seed) {
    return noise(gx * 11 + sx * 3, gy * 13 + sy * 5, seed);
  }

  function drawCampSurface(ctx, layout, chunk) {
    var camp = layout.camp;
    if (!camp) return;
    ctx.save();
    ctx.translate(-chunk.x, -chunk.y);
    ctx.globalAlpha = 0.27;
    ctx.fillStyle = '#4a321f';
    ctx.beginPath();
    ctx.ellipse(camp.x, camp.y + 12, 62, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();
    for (var cy = camp.y - 31; cy <= camp.y + 55; cy += 4) {
      for (var cx = camp.x - 62; cx <= camp.x + 62; cx += 4) {
        var pattern = ((cx * 13 + cy * 7 + layout.regionSeed) >>> 0) % 11;
        if (pattern < 3) {
          ctx.globalAlpha = pattern === 0 ? 0.16 : 0.09;
          ctx.fillStyle = pattern === 0 ? '#f1d293' : '#1d1713';
          ctx.fillRect(cx + (pattern & 1), cy, 2, 2);
        }
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(-chunk.x, -chunk.y);
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#d3ad61';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(camp.x, camp.y + 9, 15, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (var rune = 0; rune < 8; rune++) {
      var ra = rune / 8 * Math.PI * 2;
      var rx = Math.round(camp.x + Math.cos(ra) * 18);
      var ry = Math.round(camp.y + 9 + Math.sin(ra) * 10);
      ctx.fillRect(rx - 1, ry - 1, rune % 2 ? 2 : 3, 2);
    }
    for (var stone = 0; stone < 12; stone++) {
      var sa = stone / 12 * Math.PI * 2 + 0.18;
      var sx = Math.round(camp.x + Math.cos(sa) * 58);
      var sy = Math.round(camp.y + 12 + Math.sin(sa) * 40);
      ctx.fillStyle = stone % 3 === 0 ? 'rgba(232,210,166,0.32)' : 'rgba(32,26,28,0.34)';
      ctx.fillRect(sx - 2, sy - 1, 4, 2);
    }
    ctx.restore();
  }

  function drawBroadMotifs(ctx, layout, chunk) {
    ctx.save();
    ctx.translate(-chunk.x, -chunk.y);
    for (var i = 0; i < 20; i++) {
      var x = noise(i, 1, layout.seeds.details ^ 0x97a1) * layout.world.w;
      var y = 90 + noise(i, 2, layout.seeds.details ^ 0x5c31) * (layout.world.h - 120);
      var r = 38 + noise(i, 3, layout.seeds.details ^ 0xb817) * 82;
      var dark = noise(i, 4, layout.seeds.details) < 0.72;
      ctx.globalAlpha = dark
        ? (0.045 + noise(i, 5, layout.seeds.details) * 0.045)
        : (0.025 + noise(i, 6, layout.seeds.details) * 0.025);
      ctx.fillStyle = dark ? '#000018' : '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function bakeChunk(layout, chunk) {
    var c = document.createElement('canvas');
    c.width = chunk.w; c.height = chunk.h;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var cell = layout.cell;
    var gx0 = Math.floor(chunk.x / cell), gy0 = Math.floor(chunk.y / cell);
    var gx1 = Math.min(layout.gw, Math.ceil((chunk.x + chunk.w) / cell));
    var gy1 = Math.min(layout.gh, Math.ceil((chunk.y + chunk.h) / cell));
    for (var gy = gy0; gy < gy1; gy++) {
      for (var gx = gx0; gx < gx1; gx++) {
        var idx = gy * layout.gw + gx;
        var cols = layout.colorGrid[idx] || ['#242534', '#171824'];
        var mat = layout.grid[idx];
        var lx = gx * cell - chunk.x, ly = gy * cell - chunk.y;
        ctx.fillStyle = cols[0]; ctx.fillRect(lx, ly, cell, cell);
        for (var sy = 0; sy < cell; sy += 2) {
          for (var sx = 0; sx < cell; sx += 2) {
            var rv = cellNoise(gx, gy, sx, sy, layout.seeds.details);
            if (rv < 0.24) {
              ctx.fillStyle = cols[1 % cols.length];
              ctx.fillRect(lx + sx, ly + sy, 2, 2);
            } else if (rv < 0.32 && cols[2]) {
              ctx.fillStyle = cols[2];
              ctx.fillRect(lx + sx, ly + sy, 2, 2);
            }
          }
        }

        var detail = noise(gx, gy, layout.seeds.details ^ 0x3d71);
        if (mat === 'grass' && detail < 0.34) {
          var grassX = Math.floor(noise(gx, gy, layout.seeds.details ^ 0x72c1) * 6);
          var grassY = Math.floor(noise(gx, gy, layout.seeds.details ^ 0x184f) * 5);
          ctx.fillStyle = 'rgba(0,30,0,0.24)';
          ctx.fillRect(lx + grassX, ly + grassY, 1, 2);
          if (detail < 0.13) {
            ctx.fillStyle = 'rgba(205,255,165,0.30)';
            ctx.fillRect(lx + ((grassX + 3) % 7), ly + ((grassY + 2) % 6), 1, 1);
          }
        } else if (mat === 'snow' && detail < 0.18) {
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillRect(lx + ((detail * 37) | 0) % 7, ly + ((detail * 53) | 0) % 7, 1, 1);
        } else if ((mat === 'stone' || mat === 'dirt') && detail < 0.14) {
          var crackX = lx + ((detail * 43) | 0) % 5;
          var crackY = ly + ((detail * 67) | 0) % 5;
          ctx.fillStyle = 'rgba(0,0,10,0.30)';
          ctx.fillRect(crackX, crackY, 3, 1);
          ctx.fillRect(crackX + 2, crackY + 1, 1, 2);
        } else if (mat === 'lava' && detail < 0.52) {
          ctx.fillStyle = 'rgba(40,10,0,0.52)';
          ctx.fillRect(lx + ((detail * 31) | 0) % 5, ly + ((detail * 47) | 0) % 6, 2 + ((detail * 5) | 0), 1);
        } else if (mat === 'blocked') {
          ctx.fillStyle = 'rgba(4,5,12,0.22)';
          if (noise(gx, gy, layout.seeds.blockers) > 0.46) ctx.fillRect(lx, ly, cell, 2);
        }
      }
    }
    drawBroadMotifs(ctx, layout, chunk);
    drawCampSurface(ctx, layout, chunk);

    for (gy = gy0; gy < gy1; gy++) {
      for (gx = gx0; gx < gx1; gx++) {
        var edgeIdx = gy * layout.gw + gx;
        var here = layout.grid[edgeIdx];
        var edge = (gx > 0 && layout.grid[edgeIdx - 1] !== here) ||
          (gy > 0 && layout.grid[edgeIdx - layout.gw] !== here) ||
          (gx < layout.gw - 1 && layout.grid[edgeIdx + 1] !== here) ||
          (gy < layout.gh - 1 && layout.grid[edgeIdx + layout.gw] !== here);
        if (!edge) continue;
        var ex = gx * cell - chunk.x, ey = gy * cell - chunk.y;
        if (here === 'water') {
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillRect(ex, ey, cell, 2);
          ctx.fillStyle = 'rgba(255,255,255,0.52)';
          ctx.fillRect(ex + ((noise(gx, gy, layout.seeds.details) * 6) | 0), ey + 1, 2, 1);
        } else if (here === 'lava') {
          ctx.fillStyle = 'rgba(255,220,120,0.52)';
          ctx.fillRect(ex, ey, cell, 2);
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.14)';
          ctx.fillRect(ex, ey, cell, 1);
        }
      }
    }
    var flowers = layout.flowers || [];
    for (var fi = 0; fi < flowers.length; fi++) {
      var flower = flowers[fi];
      if (flower.x < chunk.x || flower.x >= chunk.x + chunk.w ||
          flower.y < chunk.y || flower.y >= chunk.y + chunk.h) continue;
      var fx = Math.floor(flower.x - chunk.x), fy = Math.floor(flower.y - chunk.y);
      ctx.fillStyle = flower.color;
      ctx.fillRect(fx, fy, 1, 1);
      if (flower.dots >= 2) ctx.fillRect(fx + 2, fy + 1, 1, 1);
      if (flower.dots >= 3) ctx.fillRect(fx - 1, fy + 2, 1, 1);
      ctx.fillStyle = 'rgba(20,45,24,0.58)';
      ctx.fillRect(fx, fy + 1, 1, 1);
    }
    var grad = ctx.createLinearGradient(0, 0, 0, chunk.h);
    grad.addColorStop(0, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,18,0.10)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, chunk.w, chunk.h);
    chunk.canvas = c;
    chunk.state = 'ready';
    chunk.lastUsed = ++chunkSeq;
    return c;
  }

  function nearestChunks(layout, x, y) {
    return layout.chunks.slice().sort(function (a, b) {
      var ad = U.dist(x, y, a.x + a.w / 2, a.y + a.h / 2);
      var bd = U.dist(x, y, b.x + b.w / 2, b.y + b.h / 2);
      return ad - bd;
    });
  }

  function evict(layout) {
    var ready = layout.chunks.filter(function (c) { return !!c.canvas; });
    if (ready.length <= 10) return;
    ready.sort(function (a, b) { return a.lastUsed - b.lastUsed; });
    for (var i = 0; i < ready.length - 10; i++) {
      ready[i].canvas = null;
      ready[i].state = 'cold';
    }
  }

  T.bake = function (region, layout) {
    if (!layout || layout.version < 3) return legacyBake(region, layout);
    T.ground = null;
    queue = nearestChunks(layout, layout.camp.x, layout.camp.y);
    // 首屏营地区块优先同步完成，其余分帧烘焙。
    for (var i = 0; i < Math.min(4, queue.length); i++) bakeChunk(layout, queue[i]);
    queue = queue.slice(4);
  };

  T.drawGround = function (ctx, viewL, viewT, viewR, viewB) {
    var layout = T.layout;
    if (!layout || layout.version < 3) return legacyDrawGround(ctx);
    viewL = viewL === undefined ? 0 : viewL;
    viewT = viewT === undefined ? 0 : viewT;
    viewR = viewR === undefined ? layout.world.w : viewR;
    viewB = viewB === undefined ? layout.world.h : viewB;
    var pad = layout.chunkSize;
    for (var i = 0; i < layout.chunks.length; i++) {
      var chunk = layout.chunks[i];
      if (chunk.x > viewR + pad || chunk.y > viewB + pad ||
          chunk.x + chunk.w < viewL - pad || chunk.y + chunk.h < viewT - pad) continue;
      if (!chunk.canvas) bakeChunk(layout, chunk);
      chunk.lastUsed = ++chunkSeq;
      ctx.drawImage(chunk.canvas, chunk.x, chunk.y);
    }
    evict(layout);
  };

  T.update = function (dt) {
    legacyUpdate(dt);
    var layout = T.layout;
    if (!layout || layout.version < 3 || !queue.length) return;
    var next = queue.shift();
    if (next && !next.canvas) bakeChunk(layout, next);
  };

  Game.explorationRender = {
    drawWorldOverlay: function (ctx, viewL, viewT, viewR, viewB) {
      var layout = Game.world && Game.world.layout;
      if (!layout || layout.version < 3 || !Game.exploration) return;
      var rid = Game.state.world.region;
      ctx.save();
      for (var i = 0; i < layout.threats.length; i++) {
        var t = layout.threats[i];
        if (!Game.exploration.isRevealed(t.x, t.y, rid)) continue;
        if (t.x + t.radius < viewL || t.x - t.radius > viewR ||
            t.y + t.radius < viewT || t.y - t.radius > viewB) continue;
        ctx.strokeStyle = 'rgba(213,91,74,' + (0.16 + t.danger * 0.16).toFixed(2) + ')';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y, t.radius, t.radius * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      var guardian = layout.guardian;
      var state = Game.exploration.regionState(rid);
      if (guardian && !state.discovered.guardian && Game.exploration.isRevealed(guardian.x, guardian.y, rid)) {
        ctx.strokeStyle = 'rgba(245,203,102,0.65)';
        ctx.beginPath();
        ctx.ellipse(guardian.x, guardian.y + 2, 18, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  };
})();
