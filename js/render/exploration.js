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
        var lx = gx * cell - chunk.x, ly = gy * cell - chunk.y;
        ctx.fillStyle = cols[0]; ctx.fillRect(lx, ly, cell, cell);
        var rv = noise(gx, gy, layout.seeds.details);
        if (rv < 0.55) {
          ctx.fillStyle = cols[1 % cols.length];
          ctx.fillRect(lx + ((rv * 17) | 0) % 6, ly + ((rv * 29) | 0) % 6, 2, 2);
        }
        if (layout.grid[idx] === 'blocked') {
          ctx.fillStyle = 'rgba(4,5,12,0.18)';
          if (noise(gx, gy, layout.seeds.blockers) > 0.6) ctx.fillRect(lx, ly, cell, 2);
        }
      }
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
