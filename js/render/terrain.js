/* ============================================================
 * render/terrain.js — 程序化地形
 * 底材抖动着色 + 材质补丁（草/水/雪/沙/熔岩…）+ 装饰物摆放 +
 * 贴花系统（脚印/涟漪，带生命周期与数量上限）+ 可摇曳草簇。
 * 同区域使用种子随机，布局跨会话稳定。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var CELL = 8;
  var DECAL_CAP = 130;

  var T = Game.terrain = {
    ground: null,       // 烘焙好的地面画布
    grid: null,         // 材质格网
    gw: 0, gh: 0,
    props: [],
    tufts: [],
    decals: [],
    campfirePos: null,
    waterCells: [],
    lavaCells: [],
    time: 0,

    materialAt: function (x, y) {
      var gx = (x / CELL) | 0, gy = (y / CELL) | 0;
      if (gx < 0 || gy < 0 || gx >= T.gw || gy >= T.gh) return 'void';
      return T.grid[gy * T.gw + gx];
    },

    /* ---------------- 构建区域地形 ---------------- */
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
      T.waterCells = [];
      T.lavaCells = [];
      T.campfirePos = { x: region.camp.x, y: region.camp.y };

      var colorGrid = new Array(T.gw * T.gh); // 每格颜色组引用
      var gx, gy, i;

      // 1) 底材
      for (gy = 0; gy < T.gh; gy++) {
        for (gx = 0; gx < T.gw; gx++) {
          T.grid[gy * T.gw + gx] = cfg.base.mat;
          colorGrid[gy * T.gw + gx] = cfg.base.colors;
        }
      }

      // 2) 材质补丁（噪声圆斑）
      for (i = 0; i < cfg.patches.length; i++) {
        var pd = cfg.patches[i];
        for (var n = 0; n < pd.count; n++) {
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

      // 3) 烘焙地面画布
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
          // 2×2 抖动纹理
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

      // 4) 材质边缘描绘（水岸亮边 / 补丁描边）
      for (gy = 0; gy < T.gh; gy++) {
        for (gx = 0; gx < T.gw; gx++) {
          var m = T.grid[gy * T.gw + gx];
          var edge = false;
          if (gx > 0 && T.grid[gy * T.gw + gx - 1] !== m) edge = true;
          else if (gy > 0 && T.grid[(gy - 1) * T.gw + gx] !== m) edge = true;
          else if (gx < T.gw - 1 && T.grid[gy * T.gw + gx + 1] !== m) edge = true;
          else if (gy < T.gh - 1 && T.grid[(gy + 1) * T.gw + gx] !== m) edge = true;
          if (!edge) continue;
          if (m === 'water') {
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.fillRect(gx * CELL, gy * CELL, CELL, 2);
          } else if (m === 'lava') {
            ctx.fillStyle = 'rgba(255,220,120,0.5)';
            ctx.fillRect(gx * CELL, gy * CELL, CELL, 2);
          } else {
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(gx * CELL, gy * CELL, CELL, 1);
          }
        }
      }

      // 5) 深度光照：顶部远处微亮、底部近处微暗
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,0.10)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(0,0,20,0.14)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      T.ground = c;

      // 6) 草簇（可摇曳）
      var tuftN = cfg.tufts || 0;
      var guard = 0;
      while (T.tufts.length < tuftN && guard++ < tuftN * 12) {
        var tx = 30 + rng() * (w - 60), ty = 90 + rng() * (h - 120);
        if (T.materialAt(tx, ty) !== 'grass') continue;
        T.tufts.push({ x: tx, y: ty, phase: rng() * 6.28, disturb: 0, h: 3 + (rng() * 3 | 0) });
      }

      // 7) 装饰物（避开水/熔岩/营地/Boss 点）
      for (i = 0; i < cfg.deco.length; i++) {
        var dd = cfg.deco[i];
        var placed = 0, tries = 0;
        while (placed < dd.count && tries++ < dd.count * 20) {
          var dx2 = 34 + rng() * (w - 68);
          var dy2 = 96 + rng() * (h - 130);
          var mat2 = T.materialAt(dx2, dy2);
          if (mat2 === 'water' || mat2 === 'lava') continue;
          if (U.dist(dx2, dy2, region.camp.x, region.camp.y) < 76) continue;
          if (U.dist(dx2, dy2, region.bossPoint.x, region.bossPoint.y) < 60) continue;
          T.props.push({ sprite: dd.sprite, x: dx2, y: dy2 });
          placed++;
        }
      }

      // 8) 营地：帐篷 + 篝火
      T.props.push({ sprite: 'tent', x: region.camp.x - 30, y: region.camp.y - 4 });
      T.props.push({ sprite: 'campfire', x: region.camp.x, y: region.camp.y + 8, campfire: true });
    },

    /* ---------------- 贴花（脚印 / 涟漪） ---------------- */
    addDecal: function (d) {
      if (T.decals.length >= DECAL_CAP) T.decals.shift();
      d.t = 0;
      T.decals.push(d);
    },

    update: function (dt) {
      T.time += dt;
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

    /* ---------------- 绘制 ---------------- */
    drawGround: function (ctx) {
      if (T.ground) ctx.drawImage(T.ground, 0, 0);
    },

    /** 水面闪光 / 熔岩脉动（仅相机可见范围） */
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

    drawTufts: function (ctx) {
      var t = T.time;
      for (var i = 0; i < T.tufts.length; i++) {
        var tf = T.tufts[i];
        var sway = Math.sin(t * 1.4 + tf.phase) * 0.6 + Math.sin(t * 9 + tf.phase) * tf.disturb * 2.2;
        ctx.strokeStyle = tf.disturb > 0.3 ? '#7ac86a' : '#3d8232';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tf.x, tf.y);
        ctx.lineTo(tf.x + sway, tf.y - tf.h);
        ctx.moveTo(tf.x + 2, tf.y);
        ctx.lineTo(tf.x + 2 + sway * 0.8, tf.y - tf.h + 1);
        ctx.stroke();
      }
    }
  };
})();
