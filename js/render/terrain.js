/* ============================================================
 * render/terrain.js — 程序化地形（视觉升级版）
 * 底材抖动 + 色斑/纹理烘焙 + 材质补丁 + 烘焙花簇/睡莲/裂纹/反光
 * + 丛聚式装饰摆放（带阴影/发光/升降/摇曳元数据）
 * + 草簇风场（行波摇曳 + 扰动抖动 + 叶尖高光）
 * + 贴花系统（脚印/涟漪）。同区域种子随机，布局跨会话稳定。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var CELL = 8;
  var DECAL_CAP = 130;

  var T = Game.terrain = {
    ground: null,
    grid: null,
    gw: 0, gh: 0,
    props: [],
    glows: [],          // 发光道具引用（渲染光晕用）
    tufts: [],
    decals: [],
    campfirePos: null,
    waterCells: [],
    lavaCells: [],
    tuftColors: ['#3d8232', '#7ac86a'],
    time: 0,
    windT: 0,

    materialAt: function (x, y) {
      var gx = (x / CELL) | 0, gy = (y / CELL) | 0;
      if (gx < 0 || gy < 0 || gx >= T.gw || gy >= T.gh) return 'void';
      return T.grid[gy * T.gw + gx];
    },

    /** 草簇风场：行波 + 局部扰动 */
    windAt: function (x, phase, disturb) {
      return Math.sin(T.windT * 1.6 + x * 0.035 + (phase || 0)) * 1.4 +
        (disturb ? Math.sin(T.windT * 11 + phase * 7) * disturb * 2.2 : 0);
    },

    /* ================= 构建区域地形 ================= */
    build: function (region) {
      var w = region.world.w, h = region.world.h;
      var rng = U.seededRng(U.strSeed(region.id));
      var cfg = region.terrain;

      T.gw = Math.ceil(w / CELL);
      T.gh = Math.ceil(h / CELL);
      T.grid = new Array(T.gw * T.gh);
      T.decals = [];
      T.tufts = [];
      T.props = [];
      T.glows = [];
      T.waterCells = [];
      T.lavaCells = [];
      T.campfirePos = { x: region.camp.x, y: region.camp.y };
      T.tuftColors = cfg.tuftColors || ['#3d8232', '#7ac86a'];

      var colorGrid = new Array(T.gw * T.gh);
      var gx, gy, i, n;

      /* ---- 1) 底材与补丁 ---- */
      for (gy = 0; gy < T.gh; gy++) {
        for (gx = 0; gx < T.gw; gx++) {
          T.grid[gy * T.gw + gx] = cfg.base.mat;
          colorGrid[gy * T.gw + gx] = cfg.base.colors;
        }
      }
      for (i = 0; i < cfg.patches.length; i++) {
        var pd = cfg.patches[i];
        for (n = 0; n < pd.count; n++) {
          var cx = 40 + rng() * (w - 80);
          var cy = 90 + rng() * (h - 140);
          var r = pd.rMin + rng() * (pd.rMax - pd.rMin);
          var seed2 = rng() * 1000;
          for (gy = 0; gy < T.gh; gy++) {
            for (gx = 0; gx < T.gw; gx++) {
              var px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2;
              var dx = px - cx, dy = py - cy;
              var noise = Math.sin(gx * 1.7 + seed2) * Math.cos(gy * 1.3 + seed2) * 0.22 + 0.88;
              if (dx * dx + dy * dy < r * r * noise * noise) {
                T.grid[gy * T.gw + gx] = pd.mat;
                colorGrid[gy * T.gw + gx] = pd.colors;
              }
            }
          }
        }
      }

      /* ---- 2) 烘焙底图 ---- */
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      for (gy = 0; gy < T.gh; gy++) {
        for (gx = 0; gx < T.gw; gx++) {
          var idx = gy * T.gw + gx;
          var cols = colorGrid[idx];
          var mat = T.grid[idx];
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
          if (mat === 'water') T.waterCells.push(idx);
          if (mat === 'lava') T.lavaCells.push(idx);
        }
      }

      /* ---- 3) 大块色斑（打破均匀感，Octopath 式地表层次） ---- */
      var mot;
      for (mot = 0; mot < 7; mot++) {
        var isDarkMot = rng() < 0.72;
        ctx.globalAlpha = isDarkMot ? (0.08 + rng() * 0.07) : (0.04 + rng() * 0.04);
        ctx.fillStyle = isDarkMot ? '#000018' : '#ffffff';
        var mx = rng() * w, my = 90 + rng() * (h - 120), mr = 34 + rng() * 60;
        ctx.beginPath();
        ctx.ellipse(mx, my, mr, mr * 0.6, 0, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* ---- 4) 材质纹理细节 ---- */
      for (gy = 0; gy < T.gh; gy++) {
        for (gx = 0; gx < T.gw; gx++) {
          var m2 = T.grid[gy * T.gw + gx];
          var bx = gx * CELL, by = gy * CELL;
          var rr2 = rng();
          if (m2 === 'grass' && rr2 < 0.30) {
            // 草纹短笔触
            ctx.fillStyle = 'rgba(0,30,0,0.22)';
            ctx.fillRect(bx + ((rng() * 6) | 0), by + ((rng() * 5) | 0), 1, 2);
            if (rng() < 0.4) {
              ctx.fillStyle = 'rgba(200,255,160,0.25)';
              ctx.fillRect(bx + ((rng() * 6) | 0), by + ((rng() * 5) | 0), 1, 1);
            }
          } else if (m2 === 'snow' && rr2 < 0.14) {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillRect(bx + ((rng() * 7) | 0), by + ((rng() * 7) | 0), 1, 1);
          } else if ((m2 === 'stone' || m2 === 'dirt') && rr2 < 0.10) {
            ctx.fillStyle = 'rgba(0,0,10,0.28)';
            var clx = bx + ((rng() * 5) | 0), cly = by + ((rng() * 5) | 0);
            ctx.fillRect(clx, cly, 3, 1);
            ctx.fillRect(clx + 2, cly + 1, 1, 2);
          } else if (m2 === 'lava' && rr2 < 0.5) {
            ctx.fillStyle = 'rgba(40,10,0,0.5)';
            ctx.fillRect(bx + ((rng() * 5) | 0), by + ((rng() * 6) | 0), 2 + ((rng() * 3) | 0), 1);
          }
        }
      }

      /* ---- 5) 材质边缘（水岸亮边+泡沫 / 熔岩亮边 / 补丁描影） ---- */
      for (gy = 0; gy < T.gh; gy++) {
        for (gx = 0; gx < T.gw; gx++) {
          var m3 = T.grid[gy * T.gw + gx];
          var edge = false;
          if (gx > 0 && T.grid[gy * T.gw + gx - 1] !== m3) edge = true;
          else if (gy > 0 && T.grid[(gy - 1) * T.gw + gx] !== m3) edge = true;
          else if (gx < T.gw - 1 && T.grid[gy * T.gw + gx + 1] !== m3) edge = true;
          else if (gy < T.gh - 1 && T.grid[(gy + 1) * T.gw + gx] !== m3) edge = true;
          if (!edge) continue;
          if (m3 === 'water') {
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.fillRect(gx * CELL, gy * CELL, CELL, 2);
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fillRect(gx * CELL + ((rng() * 6) | 0), gy * CELL + 1, 2, 1);
          } else if (m3 === 'lava') {
            ctx.fillStyle = 'rgba(255,220,120,0.5)';
            ctx.fillRect(gx * CELL, gy * CELL, CELL, 2);
          } else {
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(gx * CELL, gy * CELL, CELL, 1);
          }
        }
      }

      /* ---- 6) 烘焙花簇（仅底材格） ---- */
      if (cfg.flowers && cfg.flowers.count) {
        var fcols = cfg.flowers.colors;
        var placedF = 0, triesF = 0;
        while (placedF < cfg.flowers.count && triesF++ < cfg.flowers.count * 14) {
          var fx = 26 + rng() * (w - 52), fy = 92 + rng() * (h - 116);
          if (T.materialAt(fx, fy) !== cfg.base.mat) continue;
          var fc = fcols[(rng() * fcols.length) | 0];
          ctx.fillStyle = fc;
          ctx.fillRect(fx | 0, fy | 0, 1, 1);
          if (rng() < 0.7) ctx.fillRect((fx | 0) + 2, (fy | 0) + 1, 1, 1);
          if (rng() < 0.5) ctx.fillRect((fx | 0) - 1, (fy | 0) + 2, 1, 1);
          ctx.fillStyle = 'rgba(20,60,20,0.5)';
          ctx.fillRect(fx | 0, (fy | 0) + 1, 1, 1);
          placedF++;
        }
      }

      /* ---- 7) 深度光照渐变 ---- */
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,0.10)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(0,0,20,0.14)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      T.ground = c;

      /* ---- 8) 草簇（风场常态摇曳） ---- */
      var tuftN = cfg.tufts || 0;
      if (Game.particles && !Game.particles.isEnabled()) tuftN = Math.floor(tuftN / 2);
      var guard = 0;
      while (T.tufts.length < tuftN && guard++ < tuftN * 12) {
        var tx = 30 + rng() * (w - 60), ty = 90 + rng() * (h - 120);
        if (T.materialAt(tx, ty) !== cfg.base.mat && T.materialAt(tx, ty) !== 'grass') continue;
        T.tufts.push({ x: tx, y: ty, phase: rng() * 6.28, disturb: 0, h: 3 + (rng() * 3 | 0) });
      }

      /* ---- 9) 装饰摆放（丛聚算法 + 元数据） ---- */
      function validSpot(x, y, waterWanted) {
        var m = T.materialAt(x, y);
        if (waterWanted) return m === 'water';
        if (m === 'water' || m === 'lava') return false;
        if (U.dist(x, y, region.camp.x, region.camp.y) < 78) return false;
        if (U.dist(x, y, region.bossPoint.x, region.bossPoint.y) < 62) return false;
        return true;
      }
      function pushProp(dd, x, y) {
        var sp = Game.assets.sprite(dd.sprite);
        var prop = {
          sprite: dd.sprite, x: x, y: y,
          phase: rng() * 6.28,
          sway: !!sp.frames.idle1,
          animSpd: dd.flicker ? 0.24 : (0.9 + rng() * 0.7),
          bob: !!dd.bob,
          shadow: dd.shadow !== undefined ? dd.shadow : sp.h >= 15,
          glow: dd.glow || null,
          flicker: !!dd.flicker,
          h: sp.h
        };
        T.props.push(prop);
        if (prop.glow) T.glows.push(prop);
      }
      for (i = 0; i < cfg.deco.length; i++) {
        var dd = cfg.deco[i];
        var placed = 0, tries = 0;
        if (dd.cluster) {
          var nClusters = Math.max(1, Math.round(dd.count / 3));
          var centers = [];
          var gTries = 0;
          while (centers.length < nClusters && gTries++ < nClusters * 24) {
            var ccx = 44 + rng() * (w - 88), ccy = 100 + rng() * (h - 136);
            if (validSpot(ccx, ccy, dd.water)) centers.push({ x: ccx, y: ccy });
          }
          while (placed < dd.count && tries++ < dd.count * 24 && centers.length) {
            var ct = centers[(rng() * centers.length) | 0];
            var ang = rng() * 6.28, rad = rng() * 46;
            var px2 = U.clamp(ct.x + Math.cos(ang) * rad, 24, w - 24);
            var py2 = U.clamp(ct.y + Math.sin(ang) * rad * 0.7, 92, h - 18);
            if (!validSpot(px2, py2, dd.water)) continue;
            pushProp(dd, px2, py2);
            placed++;
          }
        } else {
          while (placed < dd.count && tries++ < dd.count * 22) {
            var dx2 = 30 + rng() * (w - 60);
            var dy2 = 94 + rng() * (h - 122);
            if (dd.water) {
              // 水面道具：随机水格中心
              if (!T.waterCells.length) break;
              var wi = T.waterCells[(rng() * T.waterCells.length) | 0];
              dx2 = (wi % T.gw) * CELL + 4;
              dy2 = ((wi / T.gw) | 0) * CELL + 4;
              if (T.materialAt(dx2, dy2) !== 'water') continue;
            } else if (!validSpot(dx2, dy2, false)) {
              continue;
            }
            pushProp(dd, dx2, dy2);
            placed++;
          }
        }
      }

      /* ---- 10) 营地 ---- */
      T.props.push({ sprite: 'tent', x: region.camp.x - 30, y: region.camp.y - 4, shadow: true, phase: 0, animSpd: 1 });
      T.props.push({
        sprite: 'campfire', x: region.camp.x, y: region.camp.y + 8, campfire: true,
        phase: 0, animSpd: 1, shadow: false
      });
    },

    /* ================= 贴花 ================= */
    addDecal: function (d) {
      if (T.decals.length >= DECAL_CAP) T.decals.shift();
      d.t = 0;
      T.decals.push(d);
    },

    update: function (dt) {
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
    },

    disturbNear: function (x, y, r) {
      for (var i = 0; i < T.tufts.length; i++) {
        var tf = T.tufts[i];
        var dx = tf.x - x, dy = tf.y - y;
        if (dx * dx + dy * dy < r * r) tf.disturb = 1;
      }
    },

    /* ================= 绘制 ================= */
    drawGround: function (ctx) {
      if (T.ground) ctx.drawImage(T.ground, 0, 0);
    },

    drawLiquid: function (ctx, viewL, viewT, viewR, viewB) {
      var t = T.time;
      var i, idx, gx, gy, px, py;
      for (i = 0; i < T.waterCells.length; i++) {
        idx = T.waterCells[i];
        gx = idx % T.gw; gy = (idx / T.gw) | 0;
        px = gx * CELL; py = gy * CELL;
        if (px < viewL - 8 || px > viewR || py < viewT - 8 || py > viewB) continue;
        var s = Math.sin(t * 2.2 + gx * 1.4 + gy * 2.3);
        if (s > 0.86) {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(px + ((gx * 5 + ((t * 4) | 0)) % 6), py + ((gy * 3) % 6), 3, 1);
        }
      }
      for (i = 0; i < T.lavaCells.length; i++) {
        idx = T.lavaCells[i];
        gx = idx % T.gw; gy = (idx / T.gw) | 0;
        px = gx * CELL; py = gy * CELL;
        if (px < viewL - 8 || px > viewR || py < viewT - 8 || py > viewB) continue;
        var p = 0.5 + 0.5 * Math.sin(t * 1.6 + gx * 0.9 + gy * 1.7);
        if (p > 0.55) {
          ctx.fillStyle = 'rgba(255,230,120,' + (0.18 * p).toFixed(2) + ')';
          ctx.fillRect(px, py, CELL, CELL);
        }
      }
    },

    drawDecals: function (ctx) {
      for (var i = 0; i < T.decals.length; i++) {
        var d = T.decals[i];
        var k = 1 - d.t / d.life;
        if (d.type === 'footprint') {
          ctx.fillStyle = d.mat === 'snow'
            ? 'rgba(90,120,150,' + (0.4 * k).toFixed(2) + ')'
            : 'rgba(60,42,20,' + (0.35 * k).toFixed(2) + ')';
          if (d.horiz) { ctx.fillRect(d.x - 2, d.y - 1, 4, 2); }
          else { ctx.fillRect(d.x - 1, d.y - 2, 2, 4); }
        } else if (d.type === 'ripple') {
          var r = 2 + d.t / d.life * 9;
          ctx.strokeStyle = 'rgba(230,245,255,' + (0.5 * k).toFixed(2) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, r, r * 0.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },

    /** 草簇：风场行波 + 扰动 + 叶尖高光（视口剔除） */
    drawTufts: function (ctx, viewL, viewT, viewR, viewB) {
      var body = T.tuftColors[0], tip = T.tuftColors[1];
      for (var i = 0; i < T.tufts.length; i++) {
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
        // 叶尖高光
        ctx.fillStyle = tip;
        ctx.fillRect(Math.round(tf.x + sway), Math.round(tf.y - tf.h) - 1, 1, 1);
      }
    }
  };
})();
