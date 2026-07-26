/* ============================================================
 * render/terrain.js — 运行时布局的地表烘焙与交互贴花
 * 生成契约位于 systems/terrain.js；本文件不消费关键布局随机流。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;
  var T = Game.terrain;
  var CELL = T.CELL;
  var DECAL_CAP = 130;

  T.bake = function (region, layout) {
    var w = layout.world.w, h = layout.world.h;
    var rng = U.seededRng(layout.seeds.details);
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');
    var gx, gy, idx;

    for (gy = 0; gy < layout.gh; gy++) {
      for (gx = 0; gx < layout.gw; gx++) {
        idx = gy * layout.gw + gx;
        var cols = layout.colorGrid[idx];
        var mat = layout.grid[idx];
        ctx.fillStyle = cols[0];
        ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
        for (var sy = 0; sy < CELL; sy += 2) {
          for (var sx = 0; sx < CELL; sx += 2) {
            var rv = rng();
            if (rv < 0.24) {
              ctx.fillStyle = cols[1 % cols.length];
              ctx.fillRect(gx * CELL + sx, gy * CELL + sy, 2, 2);
            } else if (rv < 0.32 && cols[2]) {
              ctx.fillStyle = cols[2];
              ctx.fillRect(gx * CELL + sx, gy * CELL + sy, 2, 2);
            }
          }
        }

        var bx = gx * CELL, by = gy * CELL;
        var detail = rng();
        if (mat === 'grass' && detail < 0.30) {
          ctx.fillStyle = 'rgba(0,30,0,0.22)';
          ctx.fillRect(bx + ((rng() * 6) | 0), by + ((rng() * 5) | 0), 1, 2);
          if (rng() < 0.4) {
            ctx.fillStyle = 'rgba(200,255,160,0.25)';
            ctx.fillRect(bx + ((rng() * 6) | 0), by + ((rng() * 5) | 0), 1, 1);
          }
        } else if (mat === 'snow' && detail < 0.14) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(bx + ((rng() * 7) | 0), by + ((rng() * 7) | 0), 1, 1);
        } else if ((mat === 'stone' || mat === 'dirt') && detail < 0.10) {
          ctx.fillStyle = 'rgba(0,0,10,0.28)';
          var crackX = bx + ((rng() * 5) | 0), crackY = by + ((rng() * 5) | 0);
          ctx.fillRect(crackX, crackY, 3, 1);
          ctx.fillRect(crackX + 2, crackY + 1, 1, 2);
        } else if (mat === 'lava' && detail < 0.5) {
          ctx.fillStyle = 'rgba(40,10,0,0.5)';
          ctx.fillRect(bx + ((rng() * 5) | 0), by + ((rng() * 6) | 0), 2 + ((rng() * 3) | 0), 1);
        }
      }
    }

    var motifCount = layout.version >= 2
      ? Math.round(7 * (layout.density ? layout.density.details : 1))
      : 7;
    for (var motif = 0; motif < motifCount; motif++) {
      var dark = rng() < 0.72;
      ctx.globalAlpha = dark ? (0.08 + rng() * 0.07) : (0.04 + rng() * 0.04);
      ctx.fillStyle = dark ? '#000018' : '#ffffff';
      var mx = rng() * w, my = 90 + rng() * (h - 120), mr = 34 + rng() * 60;
      ctx.beginPath();
      ctx.ellipse(mx, my, mr, mr * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 营地使用稳定的磨损地垫与刻印，建立独立于区域材质的视觉中心。
    var camp = layout.camp;
    if (camp) {
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = '#4a321f';
      ctx.beginPath();
      ctx.ellipse(camp.x, camp.y + 12, 56, 38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.clip();
      for (var cy = camp.y - 25; cy <= camp.y + 49; cy += 4) {
        for (var cx = camp.x - 54; cx <= camp.x + 54; cx += 4) {
          var pattern = ((cx * 13 + cy * 7 + layout.regionSeed) >>> 0) % 11;
          if (pattern < 3) {
            ctx.globalAlpha = pattern === 0 ? 0.13 : 0.08;
            ctx.fillStyle = pattern === 0 ? '#f1d293' : '#1d1713';
            ctx.fillRect(cx + (pattern & 1), cy, 2, 2);
          }
        }
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.28;
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
      ctx.restore();

      for (var stone = 0; stone < 12; stone++) {
        var sa = stone / 12 * Math.PI * 2 + 0.18;
        var sx2 = Math.round(camp.x + Math.cos(sa) * 54);
        var sy2 = Math.round(camp.y + 12 + Math.sin(sa) * 36);
        ctx.fillStyle = stone % 3 === 0 ? 'rgba(232,210,166,0.28)' : 'rgba(32,26,28,0.30)';
        ctx.fillRect(sx2 - 2, sy2 - 1, 4, 2);
      }
    }

    for (gy = 0; gy < layout.gh; gy++) {
      for (gx = 0; gx < layout.gw; gx++) {
        idx = gy * layout.gw + gx;
        var here = layout.grid[idx];
        var edge = (gx > 0 && layout.grid[idx - 1] !== here) ||
          (gy > 0 && layout.grid[idx - layout.gw] !== here) ||
          (gx < layout.gw - 1 && layout.grid[idx + 1] !== here) ||
          (gy < layout.gh - 1 && layout.grid[idx + layout.gw] !== here);
        if (!edge) continue;
        if (here === 'water') {
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillRect(gx * CELL, gy * CELL, CELL, 2);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(gx * CELL + ((rng() * 6) | 0), gy * CELL + 1, 2, 1);
        } else if (here === 'lava') {
          ctx.fillStyle = 'rgba(255,220,120,0.5)';
          ctx.fillRect(gx * CELL, gy * CELL, CELL, 2);
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(gx * CELL, gy * CELL, CELL, 1);
        }
      }
    }

    for (var fi = 0; fi < layout.flowers.length; fi++) {
      var flower = layout.flowers[fi];
      var fx = flower.x | 0, fy = flower.y | 0;
      ctx.fillStyle = flower.color;
      ctx.fillRect(fx, fy, 1, 1);
      if (flower.dots >= 2) ctx.fillRect(fx + 2, fy + 1, 1, 1);
      if (flower.dots >= 3) ctx.fillRect(fx - 1, fy + 2, 1, 1);
      ctx.fillStyle = 'rgba(20,60,20,0.5)';
      ctx.fillRect(fx, fy + 1, 1, 1);
    }

    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,20,0.14)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    T.ground = c;
  };

  T.addDecal = function (d) {
    if (T.decals.length >= DECAL_CAP) T.decals.shift();
    d.t = 0;
    T.decals.push(d);
  };

  T.update = function (dt) {
    T.time += dt;
    T.windT += dt;
    for (var i = T.decals.length - 1; i >= 0; i--) {
      var d = T.decals[i];
      d.t += dt;
      if (d.t >= d.life) T.decals.splice(i, 1);
    }
    for (var j = 0; j < T.tufts.length; j++) {
      var tf = T.tufts[j];
      if (tf.disturb > 0) tf.disturb = Math.max(0, tf.disturb - dt * 2.2);
    }
  };

  T.disturbNear = function (x, y, r) {
    for (var i = 0; i < T.tufts.length; i++) {
      var tf = T.tufts[i];
      var dx = tf.x - x, dy = tf.y - y;
      if (dx * dx + dy * dy < r * r) tf.disturb = 1;
    }
  };

  T.drawGround = function (ctx) {
    if (T.ground) ctx.drawImage(T.ground, 0, 0);
  };

  T.drawLiquid = function (ctx, viewL, viewT, viewR, viewB) {
    var t = T.time;
    var lists = [{ cells: T.waterCells, mat: 'water' }, { cells: T.lavaCells, mat: 'lava' }];
    for (var li = 0; li < lists.length; li++) {
      var list = lists[li];
      for (var i = 0; i < list.cells.length; i++) {
        var idx = list.cells[i];
        var gx = idx % T.gw, gy = (idx / T.gw) | 0;
        var px = gx * CELL, py = gy * CELL;
        if (px < viewL - 8 || px > viewR || py < viewT - 8 || py > viewB) continue;
        if (list.mat === 'water') {
          if (Math.sin(t * 2.2 + gx * 1.4 + gy * 2.3) > 0.86) {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(px + ((gx * 5 + ((t * 4) | 0)) % 6), py + ((gy * 3) % 6), 3, 1);
          }
        } else {
          var pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + gx * 0.9 + gy * 1.7);
          if (pulse > 0.55) {
            ctx.fillStyle = 'rgba(255,230,120,' + (0.18 * pulse).toFixed(2) + ')';
            ctx.fillRect(px, py, CELL, CELL);
          }
        }
      }
    }
  };

  T.drawDecals = function (ctx) {
    for (var i = 0; i < T.decals.length; i++) {
      var d = T.decals[i];
      var k = 1 - d.t / d.life;
      if (d.type === 'footprint') {
        ctx.fillStyle = d.mat === 'snow'
          ? 'rgba(90,120,150,' + (0.4 * k).toFixed(2) + ')'
          : 'rgba(60,42,20,' + (0.35 * k).toFixed(2) + ')';
        if (d.horiz) ctx.fillRect(d.x - 2, d.y - 1, 4, 2);
        else ctx.fillRect(d.x - 1, d.y - 2, 2, 4);
      } else if (d.type === 'ripple') {
        var r = 2 + d.t / d.life * 9;
        ctx.strokeStyle = 'rgba(230,245,255,' + (0.5 * k).toFixed(2) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, r, r * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };

  T.drawTufts = function (ctx, viewL, viewT, viewR, viewB) {
    var body = T.tuftColors[0], tip = T.tuftColors[1];
    var stride = Game.particles && !Game.particles.isEnabled() ? 2 : 1;
    for (var i = 0; i < T.tufts.length; i += stride) {
      var tf = T.tufts[i];
      if (tf.x < viewL || tf.x > viewR || tf.y < viewT || tf.y > viewB) continue;
      var sway = T.windAt(tf.x, tf.phase, tf.disturb);
      ctx.strokeStyle = tf.disturb > 0.3 ? tip : body;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tf.x, tf.y);
      ctx.lineTo(tf.x + sway, tf.y - tf.h);
      ctx.moveTo(tf.x + 2, tf.y);
      ctx.lineTo(tf.x + 2 + sway * 0.8, tf.y - tf.h + 1);
      ctx.stroke();
      ctx.fillStyle = tip;
      ctx.fillRect(Math.round(tf.x + sway), Math.round(tf.y - tf.h) - 1, 1, 1);
    }
  };
})();
