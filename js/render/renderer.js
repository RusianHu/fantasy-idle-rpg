/* ============================================================
 * render/renderer.js — Canvas 世界舞台
 * 镜头平滑跟随（lerp）+ 场景缩放（战斗推近 / Boss 拉近 / 扎营特写）
 * + 多层程序化视差远景 + 实体 y 排序绘制 + 日夜合成。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var canvas, ctx, cw = 0, ch = 0, dpr = 1;
  var cam = { x: 200, y: 200, zoom: 2 };
  var parallaxLayers = [];   // {canvas, factor, y, alpha, fast, fog}
  var parallaxRegion = null;
  var SW = 480;              // 视差条带宽（可平铺）
  var vignetteC = null;      // 暗角缓存

  function buildVignette() {
    vignetteC = document.createElement('canvas');
    vignetteC.width = cw; vignetteC.height = ch;
    var g = vignetteC.getContext('2d');
    var grad = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.42, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
    grad.addColorStop(0, 'rgba(8,6,24,0)');
    grad.addColorStop(1, 'rgba(8,6,24,0.32)');
    g.fillStyle = grad;
    g.fillRect(0, 0, cw, ch);
  }

  /* ================= 交易实体外观解析 =================
   * 前线临时营地不设固定商铺，一切交易点都是马车商棚：
   * prop.sprite 直接指定 > kind 换色兜底；未注册的精灵 ID
   * 一律落回 kind 兜底，不触发占位色块。 */
  var TRADE_SPRITE_BY_KIND = {
    merchant: 'trade_wagon',
    exchange: 'trade_wagon_exchange',
    wander: 'trade_wagon_wander',
    event: 'trade_wagon_event'
  };
  function tradePropSprite(area) {
    var prop = area.prop || {};
    if (prop.sprite && Game.assets.has(prop.sprite)) return prop.sprite;
    return TRADE_SPRITE_BY_KIND[area.kind] || 'trade_wagon';
  }

  /* ================= 视差条带生成器 ================= */
  function genLayer(layer, region, seed) {
    var h = 120;
    var c = document.createElement('canvas');
    c.width = SW; c.height = h;
    var g = c.getContext('2d');
    var rng = U.seededRng(seed);
    var i, x, y, w2;

    if (layer.type === 'hills') {
      g.fillStyle = layer.color2 || layer.color;
      g.beginPath(); g.moveTo(0, h);
      for (x = 0; x <= SW; x += 8) {
        y = h - 34 - Math.sin((x / SW) * Math.PI * 4 + 1) * 14 - Math.sin((x / SW) * Math.PI * 9) * 6;
        g.lineTo(x, y);
      }
      g.lineTo(SW, h); g.fill();
      g.fillStyle = layer.color;
      g.beginPath(); g.moveTo(0, h);
      for (x = 0; x <= SW; x += 8) {
        y = h - 20 - Math.sin((x / SW) * Math.PI * 6 + 3) * 10;
        g.lineTo(x, y);
      }
      g.lineTo(SW, h); g.fill();
    } else if (layer.type === 'mountains') {
      g.fillStyle = layer.color2 || layer.color;
      g.beginPath(); g.moveTo(0, h);
      var px = 0;
      while (px < SW + 40) {
        w2 = 50 + rng() * 60;
        g.lineTo(px + w2 / 2, h - 55 - rng() * 40);
        g.lineTo(px + w2, h - 8 - rng() * 10);
        px += w2;
      }
      g.lineTo(SW, h); g.fill();
      g.fillStyle = layer.color;
      g.beginPath(); g.moveTo(0, h);
      px = -20;
      while (px < SW + 40) {
        w2 = 70 + rng() * 70;
        var peak = h - 38 - rng() * 26;
        g.lineTo(px + w2 / 2, peak);
        g.lineTo(px + w2, h);
        px += w2;
      }
      g.fill();
    } else if (layer.type === 'trees') {
      g.fillStyle = layer.color;
      var tx = 0;
      while (tx < SW) {
        var tw = layer.pine ? 10 + rng() * 8 : 14 + rng() * 12;
        var th = (layer.tall ? 46 : 26) + rng() * (layer.tall ? 40 : 16);
        if (layer.pine || layer.tall) {
          g.beginPath();
          g.moveTo(tx, h);
          g.lineTo(tx + tw / 2, h - th);
          g.lineTo(tx + tw, h);
          g.fill();
        } else {
          g.beginPath();
          g.arc(tx + tw / 2, h - th * 0.6, tw * 0.55, 0, 6.29);
          g.fill();
          g.fillRect(tx + tw / 2 - 1, h - th * 0.5, 3, th * 0.5);
        }
        tx += tw * (0.7 + rng() * 0.5);
      }
    } else if (layer.type === 'deadtrees') {
      g.strokeStyle = layer.color;
      g.lineWidth = 2;
      var dx = 10;
      while (dx < SW) {
        var dh = 26 + rng() * 22;
        g.beginPath();
        g.moveTo(dx, h); g.lineTo(dx, h - dh);
        g.moveTo(dx, h - dh * 0.6); g.lineTo(dx - 6 - rng() * 5, h - dh * 0.8);
        g.moveTo(dx, h - dh * 0.75); g.lineTo(dx + 6 + rng() * 5, h - dh * 0.95);
        g.stroke();
        dx += 30 + rng() * 50;
      }
    } else if (layer.type === 'clouds') {
      for (i = 0; i < 7; i++) {
        x = rng() * SW; y = 14 + rng() * (h - 50);
        w2 = 24 + rng() * 40;
        g.fillStyle = layer.color;
        g.globalAlpha = 0.5 + rng() * 0.3;
        g.beginPath();
        g.ellipse(x, y, w2, w2 * 0.3, 0, 0, 6.29);
        g.ellipse(x + w2 * 0.4, y - 4, w2 * 0.5, w2 * 0.22, 0, 0, 6.29);
        g.fill();
      }
      g.globalAlpha = 1;
    } else if (layer.type === 'cavewall') {
      g.fillStyle = layer.color;
      g.fillRect(0, 0, SW, h);
      g.fillStyle = layer.color2 || '#000';
      for (i = 0; i < 9; i++) {
        x = rng() * SW; y = 20 + rng() * (h - 40);
        w2 = 14 + rng() * 26;
        g.beginPath();
        g.ellipse(x, y, w2, w2 * 0.55, 0, 0, 6.29);
        g.fill();
      }
    } else if (layer.type === 'stalactites') {
      g.fillStyle = layer.color;
      var sx = 0;
      while (sx < SW) {
        w2 = 8 + rng() * 12;
        g.beginPath();
        g.moveTo(sx, 0);
        g.lineTo(sx + w2 / 2, 18 + rng() * 30);
        g.lineTo(sx + w2, 0);
        g.fill();
        sx += w2 * (0.8 + rng() * 0.6);
      }
    } else if (layer.type === 'glow') {
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, layer.color);
      g.fillStyle = gr;
      g.fillRect(0, 0, SW, h);
    } else if (layer.type === 'spires') {
      g.fillStyle = layer.color;
      var vx = 0;
      while (vx < SW) {
        w2 = 16 + rng() * 26;
        var vh2 = 40 + rng() * 60;
        g.beginPath();
        g.moveTo(vx, h);
        g.lineTo(vx + w2 * 0.2, h - vh2 * 0.7);
        g.lineTo(vx + w2 * 0.5, h - vh2);
        g.lineTo(vx + w2 * 0.8, h - vh2 * 0.6);
        g.lineTo(vx + w2, h);
        g.fill();
        if (layer.evil && rng() < 0.7) {
          g.fillStyle = '#c060f0';
          g.fillRect(vx + w2 * 0.45, h - vh2 * 0.75, 2, 3);
          g.fillStyle = layer.color;
        }
        vx += w2 * (0.9 + rng() * 0.4);
      }
    } else if (layer.type === 'islands') {
      for (i = 0; i < 4; i++) {
        x = 30 + rng() * (SW - 60); y = 24 + rng() * (h - 70);
        w2 = 28 + rng() * 34;
        g.fillStyle = '#7a9a6a';
        g.fillRect(x - w2 / 2, y - 4, w2, 4);
        g.fillStyle = layer.color;
        g.beginPath();
        g.moveTo(x - w2 / 2, y);
        g.lineTo(x, y + w2 * 0.5);
        g.lineTo(x + w2 / 2, y);
        g.fill();
      }
    } else if (layer.type === 'fogband') {
      var fg = g.createLinearGradient(0, 0, 0, h);
      fg.addColorStop(0, 'rgba(0,0,0,0)');
      fg.addColorStop(0.5, layer.color);
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.8;
      g.fillStyle = fg;
      g.fillRect(0, 0, SW, h);
      g.globalAlpha = 1;
    }
    return { canvas: c, factor: layer.factor, y: layer.y || 80, alpha: layer.alpha !== undefined ? layer.alpha : 1, fast: layer.fast, fog: layer.type === 'fogband' };
  }

  function buildParallax(region) {
    parallaxLayers = [];
    for (var i = 0; i < region.parallax.length; i++) {
      parallaxLayers.push(genLayer(region.parallax[i], region, U.strSeed(region.id) + i * 977));
    }
    parallaxRegion = region.id;
  }

  /* ================= 帧选择 ================= */
  function heroFrame(h) {
    var d = h.dir;
    if (h.state === 'sitting' || h.state === 'recover' || h.state === 'gather') {
      return (h.animT % 1.7) < 0.9 ? 'sit0' : 'sit1';
    }
    if (h.state === 'dead') return 'walk_d0';
    if (h.state === 'fight' && h.lungeT > 0.05) return 'attack_' + d;
    if (h.moving) {
      return 'walk_' + d + (((h.animT / 0.17) | 0) % 2);
    }
    return 'walk_' + d + '0';
  }

  function monsterFrame(m) {
    return ((m.animT / 0.36) | 0) % 2 === 0 ? 'idle0' : 'idle1';
  }

  /* ================= 渲染器 ================= */
  var R = Game.render = {
    cam: cam,

    init: function (el) {
      canvas = el;
      ctx = canvas.getContext('2d');
      R.resize();
      window.addEventListener('resize', R.resize);
      // 点击/触摸交互：点怪=锁定目标，点地=移动指令，点营地=扎营/拔营
      canvas.addEventListener('pointerdown', function (e) {
        var rect = canvas.getBoundingClientRect();
        var pt = R.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (Game.world && Game.world.handleTap) Game.world.handleTap(pt.x, pt.y);
      });
    },

    /** 屏幕坐标（CSS px，相对画布）→ 世界坐标 */
    screenToWorld: function (sx, sy) {
      return {
        x: cam.x + (sx - cw / 2) / cam.zoom,
        y: cam.y + (sy - ch / 2) / cam.zoom
      };
    },

    resize: function () {
      var wrap = canvas.parentElement;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = wrap.clientWidth; ch = wrap.clientHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      vignetteC = null;
    },

    snapCamera: function (x, y) {
      cam.x = x; cam.y = y;
    },

    /* ---------- 相机 ---------- */
    updateCamera: function (dt) {
      var W = Game.world;
      var hero = W.hero;
      if (!hero) return;
      var focusX = hero.x, focusY = hero.y;
      var zoomT = 2.0;
      var mode = Game.state.world.mode;
      var endingCam = Game.ending && Game.ending.cameraTarget();
      var transitionCam = Game.transitions && Game.transitions.cameraTarget();

      if (endingCam) {
        focusX = endingCam.x; focusY = endingCam.y;
        zoomT = endingCam.zoom;
      } else if (transitionCam) {
        focusX = transitionCam.x; focusY = transitionCam.y;
        zoomT = transitionCam.zoom;
      } else if (W.cinematic && W.cinematic.ent) {
        focusX = W.cinematic.ent.x; focusY = W.cinematic.ent.y;
        zoomT = 2.9;
      } else if (W.bossEnt) {
        focusX = (hero.x + W.bossEnt.x) / 2;
        focusY = (hero.y + W.bossEnt.y) / 2;
        zoomT = 2.15;
      } else if (mode === 'rest' && (hero.state === 'sitting' || hero.state === 'recover')) {
        var cf = Game.terrain.campfirePos;
        focusX = (hero.x + cf.x) / 2; focusY = (hero.y + cf.y) / 2;
        zoomT = 2.5;
      } else if (hero.state === 'fight') {
        zoomT = 2.2;
      }
      if (cw < 400) zoomT *= 0.92;

      var cinematic = endingCam || transitionCam || W.cinematic;
      cam.zoom = U.approach(cam.zoom, zoomT, cinematic ? 5 : 2.6, dt);
      var rate = cinematic ? 6 : 3.6;
      cam.x = U.approach(cam.x, focusX, rate, dt);
      cam.y = U.approach(cam.y, focusY, rate, dt);

      // 视口收敛与边界
      var vw = cw / cam.zoom, vh = ch / cam.zoom;
      var ww = W.region.world.w, wh = W.region.world.h;
      var minX = vw / 2, maxX = ww - vw / 2;
      if (minX > maxX) { cam.x = ww / 2; } else { cam.x = U.clamp(cam.x, minX, maxX); }
      var minY = vh / 2 - 78, maxY = wh - vh / 2;
      if (minY > maxY) { cam.y = wh / 2; } else { cam.y = U.clamp(cam.y, minY, maxY); }
    },

    /* ---------- 主帧绘制 ---------- */
    frame: function (dt) {
      if (!ctx || !Game.world.region) return;
      var W = Game.world, region = W.region;
      R.updateCamera(dt);

      if (parallaxRegion !== region.id) buildParallax(region);

      var sh = Game.fx.shakeOffset();
      var z = cam.zoom;
      var t = Game.terrain.time;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      // 1) 天空渐变（屏幕空间）
      var sky = ctx.createLinearGradient(0, 0, 0, ch);
      sky.addColorStop(0, region.skyTop);
      sky.addColorStop(1, region.skyBottom);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, ch);

      // 2) 星空 / 月亮
      Game.daynight.drawSky(ctx, cam, cw, ch);

      // 3) 视差远景（锚定世界地平线）
      var horizonY = (Game.world.BOUND_TOP - 6 - cam.y) * z + ch / 2 + sh.y;
      for (var i = 0; i < parallaxLayers.length; i++) {
        var L = parallaxLayers[i];
        var destW = SW * z * 0.6, destH = L.canvas.height * z * 0.6;
        var extra = L.fast ? t * 26 : (L.fog ? t * 8 : 0);
        var off = ((-(cam.x * L.factor + extra) * z * 0.6) % destW + destW) % destW - destW;
        var dy = horizonY - destH + L.y * z * 0.12;
        ctx.globalAlpha = L.alpha;
        for (var xx = off; xx < cw; xx += destW) {
          ctx.drawImage(L.canvas, xx, dy, destW, destH);
        }
        ctx.globalAlpha = 1;
      }

      // 4) 世界变换
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cw / 2 - cam.x * z + sh.x), dpr * (ch / 2 - cam.y * z + sh.y));

      var viewL = cam.x - cw / z / 2 - 8, viewR = cam.x + cw / z / 2 + 8;
      var viewT = cam.y - ch / z / 2 - 8, viewB = cam.y + ch / z / 2 + 8;

      Game.terrain.drawGround(ctx);
      Game.terrain.drawLiquid(ctx, viewL, viewT, viewR, viewB);
      Game.terrain.drawDecals(ctx);
      Game.terrain.drawTufts(ctx, viewL, viewT, viewR, viewB);

      // 5) y 排序绘制（装饰 + 实体）
      var drawables = [];
      var j, e;
      for (j = 0; j < W.props.length; j++) {
        var p = W.props[j];
        if (p.x < viewL - 20 || p.x > viewR + 20 || p.y < viewT - 40 || p.y > viewB + 20) continue;
        drawables.push(p);
      }
      for (j = 0; j < W.entities.length; j++) drawables.push(W.entities[j]);
      for (j = 0; j < W.groundLoot.length; j++) drawables.push(W.groundLoot[j]);
      if (Game.environment) {
        var sceneChests = Game.environment.chests();
        for (j = 0; j < sceneChests.length; j++) drawables.push(sceneChests[j]);
      }
      if (Game.trade) {
        var sceneAreas = Game.trade.areas();
        for (j = 0; j < sceneAreas.length; j++) {
          if (!sceneAreas[j].prop) continue;
          drawables.push({
            kind: 'tradeProp',
            id: sceneAreas[j].id,
            area: sceneAreas[j],
            phase: j * 0.7,
            x: sceneAreas[j].x,
            y: sceneAreas[j].y
          });
        }
      }
      drawables.sort(function (a, b) { return a.y - b.y; });

      // 手动锁定目标：金色选中圈；移动指令：绿色标记
      var hero0 = W.hero;
      if (hero0 && hero0.manualTarget && hero0.target && !hero0.target.dead) {
        var mt = hero0.target;
        ctx.strokeStyle = 'rgba(240,200,80,' + (0.55 + 0.3 * Math.sin(t * 6)).toFixed(2) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(mt.x, mt.y + 1, 10, 4, 0, 0, 6.29);
        ctx.stroke();
      }
      if (hero0 && hero0.moveOrder) {
        var mo = hero0.moveOrder;
        ctx.strokeStyle = 'rgba(120,230,130,' + (0.5 + 0.3 * Math.sin(t * 7)).toFixed(2) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(mo.x, mo.y, 6, 3, 0, 0, 6.29);
        ctx.stroke();
        ctx.fillStyle = 'rgba(120,230,130,0.7)';
        ctx.fillRect(mo.x - 1, mo.y - 1, 2, 2);
      }

      for (j = 0; j < drawables.length; j++) {
        e = drawables[j];
        if (e.kind === 'hero' || e.kind === 'monster') R.drawEntity(e);
        else if (e.kind === 'groundLoot') R.drawGroundLoot(e, t);
        else if (e.kind === 'gatherNode') R.drawGatherNode(e, t);
        else if (e.kind === 'chest') R.drawChest(e, t);
        else if (e.kind === 'tradeProp') R.drawTradeProp(e, t);
        else R.drawProp(e, t);
      }
      R.drawInteractionProgress(hero0);

      // 6) 篝火光晕（半径/透明度随机抖动）
      var fxOn = !Game.particles || Game.particles.isEnabled();
      var nightF = Game.daynight.nightFactor();
      var cf = Game.terrain.campfirePos;
      if (cf) {
        var flick = 0.86 + 0.14 * Math.sin(t * 9.7) * Math.sin(t * 5.3 + 1.7);
        var campBoost = Game.transitions ? Game.transitions.campfireBoost() : 1;
        var glowR = (26 + 7 * nightF) * flick * (1 + (campBoost - 1) * 0.35);
        var alpha = Math.min(0.72, (0.16 + 0.22 * nightF) * flick * campBoost);
        var gr = ctx.createRadialGradient(cf.x, cf.y - 4, 2, cf.x, cf.y - 4, glowR);
        gr.addColorStop(0, 'rgba(255,190,90,' + alpha.toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(cf.x - glowR, cf.y - 4 - glowR, glowR * 2, glowR * 2);
        var resting = W.hero && (W.hero.state === 'sitting' || W.hero.state === 'recover');
        Game.particles.campfire(dt, cf.x, cf.y - 2, resting);
      }

      // 6.5) 发光体光晕（预渲染纹理 + lighter 合成，视口剔除）
      var glows = Game.terrain.glows;
      if (fxOn && glows && glows.length) {
        ctx.globalCompositeOperation = 'lighter';
        for (var gi = 0; gi < glows.length; gi++) {
          var gp = glows[gi];
          if (gp.x < viewL - 30 || gp.x > viewR + 30 || gp.y < viewT - 30 || gp.y > viewB + 30) continue;
          var ga = gp.flicker
            ? 0.30 + 0.16 * Math.sin(t * 11 + gp.phase) * Math.sin(t * 5.3 + gp.phase * 2)
            : 0.26 + 0.12 * Math.sin(t * 1.8 + gp.phase);
          var grr = gp.glow.r;
          var gyy = gp.y - gp.h * 0.45 + (gp.bob ? Math.sin(t * 1.3 + gp.phase) * 2.2 - 3 : 0);
          ctx.globalAlpha = ga * (0.7 + 0.55 * nightF);
          ctx.drawImage(Game.assets.glowTex(gp.glow.color, 16), gp.x - grr, gyy - grr, grr * 2, grr * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      // 7) 触发粒子 + 氛围粒子 + 形状特效
      Game.particles.draw(ctx);
      Game.fx.drawShapes(ctx);

      // 8) 屏幕空间：林间光柱 → 日夜色调 → 暗角
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (fxOn && region.rays) {
        var dayK = 1 - Math.min(1, nightF / 0.4);
        if (dayK > 0.05) {
          ctx.save();
          ctx.globalAlpha = region.rays.alpha * dayK * (0.85 + 0.15 * Math.sin(t * 0.7));
          ctx.fillStyle = region.rays.color;
          for (var ri = 0; ri < 3; ri++) {
            var bx = ((ri * 170 + t * 5) % (cw + 240)) - 120;
            ctx.beginPath();
            ctx.moveTo(bx, -20);
            ctx.lineTo(bx + 44, -20);
            ctx.lineTo(bx + 44 - ch * 0.5, ch + 20);
            ctx.lineTo(bx - ch * 0.5, ch + 20);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }
      Game.daynight.drawTint(ctx, cw, ch);
      if (Game.ending && Game.ending.isPending && Game.ending.isPending()) {
        var dawn = ctx.createLinearGradient(0, ch * 0.38, 0, ch);
        dawn.addColorStop(0, 'rgba(255,205,120,0)');
        dawn.addColorStop(1, 'rgba(255,164,72,0.16)');
        ctx.fillStyle = dawn;
        ctx.fillRect(0, 0, cw, ch);
      }
      if (fxOn) {
        if (!vignetteC) buildVignette();
        ctx.drawImage(vignetteC, 0, 0);
      }

      // 9) 飘字置于色调之上（保证可读）
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cw / 2 - cam.x * z + sh.x), dpr * (ch / 2 - cam.y * z + sh.y));
      Game.fx.drawFloats(ctx, z);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    /* ---------- 实体绘制 ---------- */
    drawEntity: function (e) {
      var A = Game.assets;
      var sp = A.sprite(e.sprite);
      e.spriteH = sp.h - 2;

      var mat = Game.terrain.materialAt(e.x, e.y);
      var sink = mat === 'water' ? 3 : 0;
      var alpha = 1;
      var sceneStyle = Game.transitions && Game.transitions.entityStyle(e);
      var visualLift = sceneStyle ? (sceneStyle.lift || 0) : 0;

      if (e.kind === 'monster' && e.dead) {
        alpha = e.finaleFade !== undefined
          ? U.clamp(e.finaleFade, 0, 1)
          : Math.max(0, e.deathT / 0.5);
        sink += Math.round((1 - alpha) * 4);
      }
      if (e.kind === 'hero' && e.state === 'dead' && !sceneStyle) {
        alpha = Math.max(0.15, e.deathT / 1.0);
      }
      if (e.kind === 'hero' && e.campWarp) {
        if (e.state === 'warpOut') {
          alpha = U.clamp(e.campWarp.t / 0.38, 0, 1);
        } else if (e.state === 'warpIn') {
          alpha = U.clamp(1 - e.campWarp.t / 0.42, 0, 1);
        }
      }
      if (sceneStyle) alpha *= U.clamp(sceneStyle.alpha, 0, 1);

      // 阴影
      ctx.globalAlpha = 0.22 * alpha;
      ctx.fillStyle = '#101024';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 1, sp.w * 0.32, 2.4, 0, 0, 6.29);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 突进位移
      var ox = 0, oy = 0;
      if (e.lungeT > 0) {
        var tgt = e.kind === 'hero' ? e.target : Game.world.hero;
        if (tgt) {
          var dd = Math.max(1, U.dist(e.x, e.y, tgt.x, tgt.y));
          var k = Math.sin((1 - e.lungeT / 0.18) * Math.PI) * 4;
          ox = (tgt.x - e.x) / dd * k;
          oy = (tgt.y - e.y) / dd * k;
        }
      }

      var frame = e.kind === 'hero' ? heroFrame(e) : monsterFrame(e);
      var flip = false;
      if (e.kind === 'monster') {
        // 怪物素材默认朝左；面向右时镜像
        flip = (e.dir === 'r');
      } else if ((e.state === 'sitting' || e.state === 'recover') && e.dir === 'l') {
        // 坐姿素材朝右；面向篝火（左）时镜像
        flip = true;
      }

      if (sceneStyle && sceneStyle.ghosts && alpha > 0.02) {
        for (var gi = sceneStyle.ghosts; gi >= 1; gi--) {
          A.draw(ctx, e.sprite, frame, e.x + ox, e.y + oy - visualLift - gi * 3, {
            alpha: Math.min(0.24, alpha * (0.08 + gi * 0.045)),
            white: 0.7,
            sinkPx: sink,
            flip: flip
          });
        }
      }

      A.draw(ctx, e.sprite, frame, e.x + ox, e.y + oy - visualLift, {
        alpha: alpha,
        white: e.flash > 0 ? Math.min(1, e.flash / 0.14) : 0,
        sinkPx: sink,
        flip: flip
      });

      // 头顶血条
      var showBar = e.kind === 'monster' ? (!e.dead && (e.hp < e.maxHp || e.engaged || e.boss)) : (e.hp < e.maxHp);
      if (showBar && alpha > 0.4) {
        var bw = e.boss ? 26 : 14;
        var bx = e.x - bw / 2, by = e.y - sp.h - 4;
        ctx.fillStyle = 'rgba(10,10,26,0.8)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        var pct = U.clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = e.kind === 'hero' ? '#5ad05a' : (e.boss ? '#e05050' : '#d8a03c');
        ctx.fillRect(bx, by, Math.round(bw * pct), 2);
      }
    },

    drawGroundLoot: function (loot, t) {
      var colors = ['#c5c9cf', '#70d070', '#63a8ed', '#bc78e8', '#f2a23c'];
      var color = colors[loot.rar] || colors[0];
      var motion = U.motionEnabled();
      var ageK = U.clamp(loot.age / loot.ttl, 0, 1);
      var blink = ageK > 0.78 && motion ? (0.45 + 0.55 * Math.abs(Math.sin(t * 9))) : 1;
      var bounce = 0;
      if (motion) {
        if (loot.age < 0.45) {
          var entry = loot.age / 0.45;
          bounce = -Math.sin(entry * Math.PI) * 10 * (1 - entry * 0.35);
        } else {
          bounce = Math.sin(t * 2.8 + loot.phase) * 1.5;
        }
      }
      var y = loot.y + bounce;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.3;
      ctx.drawImage(Game.assets.glowTex(color, 16), loot.x - 11, y - 14, 22, 22);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = blink;
      ctx.fillStyle = '#15172a';
      ctx.fillRect(Math.round(loot.x - 5), Math.round(y - 9), 10, 10);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(loot.x - 5.5), Math.round(y - 9.5), 11, 11);
      var largePotion = loot.drop.category === 'potion' &&
        loot.drop.id === 'potion_large';
      ctx.fillStyle = loot.drop.category === 'potion'
        ? (largePotion ? '#a96ddd' : '#d94f65')
        : '#e7e2cd';
      if (loot.drop.category === 'potion') {
        ctx.fillRect(
          Math.round(loot.x - (largePotion ? 3 : 2)),
          Math.round(y - (largePotion ? 8 : 7)),
          largePotion ? 7 : 5,
          largePotion ? 6 : 5
        );
        ctx.fillStyle = '#e8edf2';
        ctx.fillRect(Math.round(loot.x - 1), Math.round(y - (largePotion ? 10 : 9)), 3, 2);
      } else {
        var slot = loot.drop.item && loot.drop.item.base;
        if (slot === 'weapon') {
          ctx.fillRect(Math.round(loot.x - 1), Math.round(y - 8), 2, 7);
          ctx.fillRect(Math.round(loot.x - 3), Math.round(y - 3), 6, 1);
        } else if (slot === 'armor') {
          ctx.fillRect(Math.round(loot.x - 3), Math.round(y - 7), 6, 6);
          ctx.fillStyle = '#80899b';
          ctx.fillRect(Math.round(loot.x - 1), Math.round(y - 6), 2, 4);
        } else {
          ctx.strokeStyle = '#e7e2cd';
          ctx.beginPath();
          ctx.arc(Math.round(loot.x), Math.round(y - 4), 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    },

    drawGatherNode: function (node, t) {
      var ready = !Game.environment || Game.environment.nodeReady(node);
      var motion = U.motionEnabled();
      var spriteId = node.sprite || ('gather_' + node.nodeType);
      var sp = Game.assets.sprite(spriteId);
      var bob = ready && motion ? Math.sin(t * 1.8 + node.phase) * 0.65 : 0;
      var x = Math.round(node.x), y = Math.round(node.y + bob);
      ctx.save();
      ctx.globalAlpha = ready ? 0.22 : 0.14;
      ctx.fillStyle = '#202236';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, Math.max(7, sp.w * 0.34), 3, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!ready) {
        Game.assets.draw(ctx, spriteId, 'idle0', x, y, { alpha: 0.22 });
        ctx.globalAlpha = 0.66;
        ctx.fillStyle = '#584b43';
        ctx.fillRect(x - 5, y - 2, 10, 2);
        ctx.fillStyle = '#817266';
        ctx.fillRect(x - 2, y - 3, 4, 1);
        ctx.restore();
        return;
      }
      if (motion) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.24 + 0.1 * Math.sin(t * 2 + node.phase);
        ctx.drawImage(Game.assets.glowTex(node.accent, 16), x - 15, y - 18, 30, 30);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      var frame = Game.assets.hasFrame(spriteId, 'idle1') &&
        (((t / 0.55) + node.phase) | 0) % 2 === 1 ? 'idle1' : 'idle0';
      Game.assets.draw(ctx, spriteId, frame, x, y, {});
      ctx.restore();
    },

    drawChest: function (chest, t) {
      var motion = U.motionEnabled();
      var remain = chest.ttl - chest.age;
      var alpha = remain < 12 ? U.clamp(remain / 12, 0, 1) : 1;
      var y = chest.y + (motion ? Math.sin(t * 1.7 + chest.phase) * 1.2 : 0);
      var color = chest.rare ? '#c377e2' : '#d8a94d';
      var spriteId = chest.rare ? 'chest_rare' : 'chest_common';
      var sp = Game.assets.sprite(spriteId);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(12,13,28,0.35)';
      ctx.beginPath();
      ctx.ellipse(chest.x, y + 2, Math.max(9, sp.w * 0.35), 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (chest.rare ? 0.42 : 0.22);
      ctx.drawImage(Game.assets.glowTex(color, 16), chest.x - 18, y - 20, 36, 36);
      ctx.globalCompositeOperation = 'source-over';
      Game.assets.draw(ctx, spriteId, 'idle0', chest.x, y, { alpha: alpha });
      if (motion && (!chest.rare || (((t * 4 + chest.phase) | 0) % 9 < 2))) {
        var sx = Math.round(chest.x + (chest.rare ? 7 : 5));
        var sy = Math.round(y - (chest.rare ? 12 : 10));
        ctx.globalAlpha = alpha * (chest.rare ? 0.95 : 0.55);
        ctx.fillStyle = chest.rare ? '#fff4b0' : '#f4dd8a';
        ctx.fillRect(sx, sy - 1, 1, 3);
        ctx.fillRect(sx - 1, sy, 3, 1);
      }
      ctx.restore();
    },

    drawTradeProp: function (entity, t) {
      var A = Game.assets;
      var area = entity.area;
      var spriteId = tradePropSprite(area);
      var sp = A.sprite(spriteId);
      var x = Math.round(entity.x), y = Math.round(entity.y);
      var context = Game.trade.current();
      var active = context.available && context.areaId === area.id;
      var fxOn = !Game.particles || Game.particles.isEnabled();

      ctx.save();
      // 落地阴影（与其余营地道具一致的椭圆脚影）
      ctx.globalAlpha = 0.20;
      ctx.fillStyle = '#101024';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, Math.max(6, sp.w * 0.30), 2.8, 0, 0, 6.29);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 营业暖光：进入交易域后点亮马车，夜晚更醒目；画在精灵之下不遮细节
      if (active && fxOn) {
        var nf = Game.daynight.nightFactor();
        var pulse = U.motionEnabled() ? 0.5 + 0.5 * Math.sin(t * 2.6 + entity.phase) : 0.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.10 + 0.08 * pulse + 0.18 * nf;
        ctx.drawImage(A.glowTex('#f2b45c', 16), x - 30, y - sp.h * 0.5 - 30, 60, 60);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // 篷布垂帘双帧微动
      var frame = 'idle0';
      if (A.hasFrame(spriteId, 'idle1') &&
        (((t / 0.6) + entity.phase) | 0) % 2 === 1) frame = 'idle1';
      A.draw(ctx, spriteId, frame, x, y, {});

      // 激活态：篷下悬挂金币招牌位置的像素十字星闪烁（不用浮空面板，避免遮挡后景）
      if (active) {
        var twk = ((t / 0.16) | 0) % 8;
        if (twk < 3) {
          var sy = y - sp.h + 9;
          ctx.fillStyle = twk === 1 ? '#fff6d2' : '#f6d888';
          ctx.fillRect(x, sy - 1, 1, 3);
          ctx.fillRect(x - 1, sy, 3, 1);
        }
      }
      ctx.restore();
    },

    drawInteractionProgress: function (hero) {
      if (!hero || !hero.interactOrder || hero.interactOrder.phase !== 'act') return;
      var order = hero.interactOrder;
      var total = order.type === 'gather' ? Game.F.BAL.gatherDuration : Game.F.BAL.chestOpenDuration;
      var pct = U.clamp(1 - order.timer / total, 0, 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(10,12,28,0.82)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hero.x, hero.y - hero.spriteH - 7, 6, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = order.type === 'gather' ? '#87d57c' : '#f0c45d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hero.x, hero.y - hero.spriteH - 7, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.stroke();
      ctx.restore();
    },

    drawProp: function (p, t) {
      var A = Game.assets;
      if (p.campfire) {
        var f = 'f' + (((t / 0.14) | 0) % 4);
        A.draw(ctx, 'campfire', f, p.x, p.y, {});
        return;
      }
      var sp = A.sprite(p.sprite);
      var oy = 0;
      if (p.bob) oy = Math.sin(t * 1.3 + (p.phase || 0)) * 2.2 - 3;
      if (p.shadow) {
        ctx.globalAlpha = 0.20;
        ctx.fillStyle = '#101024';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 1, Math.max(4, sp.w * 0.30), 2.6, 0, 0, 6.29);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      var frame = 'idle0';
      if (sp.frames.idle1 && (p.sway || p.flicker)) {
        frame = (((t / (p.animSpd || 1)) + (p.phase || 0)) | 0) % 2 === 0 ? 'idle0' : 'idle1';
      }
      A.draw(ctx, p.sprite, frame, p.x, p.y + oy, { flip: !!p.flipX });
      if (p.steam && (!Game.particles || Game.particles.isEnabled())) {
        ctx.save();
        for (var si = 0; si < 3; si++) {
          var steamK = (t * 0.42 + si * 0.34 + (p.phase || 0)) % 1;
          ctx.globalAlpha = 0.36 * (1 - steamK);
          ctx.fillStyle = '#efe6d2';
          ctx.fillRect(
            Math.round(p.x - 2 + si * 2 + Math.sin(t * 2.1 + si) * 1.5),
            Math.round(p.y - 10 - steamK * 9),
            steamK < 0.55 ? 1 : 2,
            2
          );
        }
        ctx.restore();
      }
    }
  };
})();
