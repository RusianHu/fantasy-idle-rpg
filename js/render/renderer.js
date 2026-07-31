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
  var lastBubbleLayouts = [];
  var viewScale = 1;         // 会话级视野倍率；刷新后恢复默认，不进入存档。
  var viewOffset = { x: 0, y: 0 };
  var viewOffsetHold = 0;
  var authoredCamera = { x: 200, y: 200, zoom: 2, directed: false };
  var stagePointers = Object.create(null);
  var stagePointerOrder = [];
  var stagePinch = null;
  var suppressStageTapUntil = 0;
  var VIEW_SCALE_MIN = 0.75;
  var VIEW_SCALE_MAX = 1.35;
  var TAP_MOVE_THRESHOLD = 8;

  function stageInputAllowed() {
    if (!canvas || !Game.world || !Game.world.region || !Game.world.hero) return false;
    if (Game.entryState !== undefined && Game.entryState !== 'active') return false;
    if (Game.transitions && Game.transitions.isActive()) return false;
    if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return false;
    if (Game.world.cinematic) return false;
    var panel = document.getElementById('panel-container');
    if (panel && !panel.classList.contains('hidden')) return false;
    var modal = document.getElementById('modal-root');
    if (modal && modal.children.length) return false;
    return true;
  }

  function viewScaleBounds() {
    return {
      min: VIEW_SCALE_MIN,
      // Boss 战维持导演构图的近景上限，但仍允许玩家缩远观察。
      max: Game.world && Game.world.bossEnt ? 1 : VIEW_SCALE_MAX
    };
  }

  function effectiveViewScale() {
    var bounds = viewScaleBounds();
    return U.clamp(viewScale, bounds.min, bounds.max);
  }

  function clampCameraPosition(x, y, zoom) {
    var W = Game.world;
    if (!W || !W.region || !W.region.world) return { x: x, y: y };
    var vw = cw / zoom, vh = ch / zoom;
    var ww = W.region.world.w, wh = W.region.world.h;
    var minX = vw / 2, maxX = ww - vw / 2;
    var minY = vh / 2 - 78, maxY = wh - vh / 2;
    return {
      x: minX > maxX ? ww / 2 : U.clamp(x, minX, maxX),
      y: minY > maxY ? wh / 2 : U.clamp(y, minY, maxY)
    };
  }

  function markStageGesture() {
    suppressStageTapUntil = Date.now() + 450;
  }

  function stageCanvasPoint(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function setStageViewScale(nextScale, sx, sy, anchor) {
    if (!stageInputAllowed() || authoredCamera.directed) return false;
    var bounds = viewScaleBounds();
    nextScale = U.clamp(nextScale, bounds.min, bounds.max);
    if (!Number.isFinite(nextScale)) return false;
    var currentScale = effectiveViewScale();
    if (Math.abs(nextScale - currentScale) < 0.0001) return false;
    sx = sx === undefined || sx === null ? cw / 2 : sx;
    sy = sy === undefined || sy === null ? ch / 2 : sy;
    anchor = anchor || R.screenToWorld(sx, sy);

    viewScale = nextScale;
    var nextZoom = authoredCamera.zoom * effectiveViewScale();
    var next = clampCameraPosition(
      anchor.x - (sx - cw / 2) / nextZoom,
      anchor.y - (sy - ch / 2) / nextZoom,
      nextZoom
    );
    cam.zoom = nextZoom;
    cam.x = next.x;
    cam.y = next.y;
    viewOffset.x = cam.x - authoredCamera.x;
    viewOffset.y = cam.y - authoredCamera.y;
    viewOffsetHold = 0.36;
    canvas.setAttribute('data-stage-view-scale', effectiveViewScale().toFixed(4));
    return true;
  }

  function stagePointerPair() {
    return [stagePointers[stagePointerOrder[0]], stagePointers[stagePointerOrder[1]]];
  }

  function beginStagePinch() {
    var pair = stagePointerPair();
    if (!pair[0] || !pair[1]) return;
    var dx = pair[1].x - pair[0].x, dy = pair[1].y - pair[0].y;
    var midpoint = stageCanvasPoint((pair[0].x + pair[1].x) / 2, (pair[0].y + pair[1].y) / 2);
    stagePinch = {
      distance: Math.max(1, Math.sqrt(dx * dx + dy * dy)),
      scale: effectiveViewScale(),
      anchor: R.screenToWorld(midpoint.x, midpoint.y)
    };
    markStageGesture();
  }

  function removeStagePointer(pointerId, cancelled) {
    var pointer = stagePointers[pointerId];
    if (!pointer) return;
    if (stagePinch || pointer.moved || cancelled) markStageGesture();
    delete stagePointers[pointerId];
    var index = stagePointerOrder.indexOf(pointerId);
    if (index >= 0) stagePointerOrder.splice(index, 1);
    stagePinch = null;
    if (stagePointerOrder.length === 2) beginStagePinch();
    else if (stagePointerOrder.length === 1) {
      var remaining = stagePointers[stagePointerOrder[0]];
      remaining.startX = remaining.x;
      remaining.startY = remaining.y;
    }
  }

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

  function isActorEntity(entity) {
    return !!(entity && entity.components && entity.components.transform &&
      entity.components.presentation);
  }

  function isNonHeroActor(entity) {
    return isActorEntity(entity) && entity.kind !== 'hero';
  }

  function drawBubbleIcon(graphics, icon, x, y, accent, ink) {
    var px;
    graphics.fillStyle = ink;
    if (icon === 'resource') {
      graphics.fillRect(x + 3, y + 1, 1, 7);
      graphics.fillStyle = accent;
      graphics.fillRect(x + 1, y + 1, 3, 2);
      graphics.fillRect(x, y + 2, 4, 2);
      graphics.fillRect(x + 4, y + 3, 3, 2);
      graphics.fillRect(x + 4, y + 5, 2, 1);
    } else if (icon === 'gather') {
      graphics.fillStyle = '#75502d';
      for (px = 0; px < 5; px++) graphics.fillRect(x + 5 - px, y + 3 + px, 1, 1);
      graphics.fillStyle = accent;
      graphics.fillRect(x + 1, y + 1, 6, 1);
      graphics.fillRect(x, y + 2, 3, 1);
      graphics.fillStyle = ink;
      graphics.fillRect(x + 5, y + 2, 2, 1);
    } else if (icon === 'enemy') {
      for (px = 0; px < 5; px++) {
        graphics.fillRect(x + 1 + px, y + 1 + px, 1, 1);
        graphics.fillRect(x + 5 - px, y + 1 + px, 1, 1);
      }
      graphics.fillStyle = accent;
      graphics.fillRect(x, y + 6, 3, 1);
      graphics.fillRect(x + 5, y + 6, 3, 1);
      graphics.fillStyle = '#f5e9c7';
      graphics.fillRect(x + 1, y + 1, 1, 1);
      graphics.fillRect(x + 6, y + 1, 1, 1);
    } else if (icon === 'alert') {
      graphics.fillRect(x + 3, y, 2, 5);
      graphics.fillStyle = accent;
      graphics.fillRect(x + 3, y + 6, 2, 2);
      graphics.fillStyle = '#f7e7c7';
      graphics.fillRect(x + 3, y, 1, 3);
    } else if (icon === 'chest') {
      graphics.fillRect(x, y + 2, 8, 6);
      graphics.fillStyle = accent;
      graphics.fillRect(x + 1, y + 1, 6, 2);
      graphics.fillRect(x + 1, y + 4, 6, 3);
      graphics.fillStyle = '#f2cd65';
      graphics.fillRect(x + 3, y + 3, 2, 3);
      graphics.fillStyle = '#fff1a8';
      graphics.fillRect(x + 4, y + 4, 1, 1);
    } else if (icon === 'loot') {
      graphics.fillStyle = accent;
      graphics.fillRect(x + 2, y + 2, 5, 5);
      graphics.fillRect(x + 3, y + 1, 3, 1);
      graphics.fillStyle = ink;
      graphics.fillRect(x + 3, y, 3, 1);
      graphics.fillRect(x + 1, y + 7, 7, 1);
      graphics.fillStyle = '#f4d56c';
      graphics.fillRect(x, y + 1, 1, 3);
      graphics.fillRect(x - 1, y + 2, 3, 1);
    }
  }

  function rectsOverlap(a, b) {
    return !!(a && b && a.x < b.x + b.w && a.x + a.w > b.x &&
      a.y < b.y + b.h && a.y + a.h > b.y);
  }

  function healthBarRect(anchor) {
    if (!isActorEntity(anchor) || !anchor.components.vitals) return null;
    var visible = isNonHeroActor(anchor)
      ? (!anchor.dead && (anchor.hp < anchor.maxHp || anchor.engaged || anchor.boss))
      : anchor.hp < anchor.maxHp;
    if (!visible) return null;
    var sprite = anchor.sprite ? Game.assets.sprite(anchor.sprite) : null;
    var spriteH = sprite ? sprite.h : (anchor.spriteH || 18);
    var width = anchor.boss ? 26 : 14;
    return {
      x: anchor.x - width / 2 - 1,
      y: anchor.y - spriteH - 5,
      w: width + 2,
      h: 4
    };
  }

  function preferredBubbleSide(bubble, anchor, left, right) {
    if (bubble.side === 'left' || bubble.side === 'right') return bubble.side;
    if (bubble.placement === 'directional') {
      return anchor.dir === 'r' ? 'left' : 'right';
    }
    var opponent = null;
    if (anchor.kind === 'hero' && anchor.target && Number.isFinite(anchor.target.x)) {
      opponent = anchor.target;
    } else if (isNonHeroActor(anchor) && Game.world && Game.world.hero &&
        (anchor.engaged || bubble.type === 'alert')) {
      opponent = Game.world.hero;
    }
    if (opponent) {
      if (Math.abs(opponent.x - anchor.x) >= 1) {
        return opponent.x > anchor.x ? 'left' : 'right';
      }
      return isNonHeroActor(anchor) ? 'right' : 'left';
    }
    if (anchor.dir === 'r') return 'left';
    if (anchor.dir === 'l') return 'right';
    return anchor.x < (left + right) / 2 ? 'right' : 'left';
  }

  function sideBubbleLayout(bubble, anchor, left, top, right, bottom) {
    var w = 15;
    var h = 14;
    var tailReach = 6;
    var margin = 2;
    var sprite = anchor.sprite ? Game.assets.sprite(anchor.sprite) : null;
    var entityH = anchor.bubbleOffsetY || anchor.spriteH || (sprite && sprite.h) || 18;
    var healthBar = healthBarRect(anchor);
    var spriteHalfW = ((sprite && sprite.w) || 14) / 2;
    var clearHalfW = Math.max(spriteHalfW, healthBar ? healthBar.w / 2 : 0) + 1;
    var positions = {
      left: Math.round(anchor.x - clearHalfW - tailReach - w),
      right: Math.round(anchor.x + clearHalfW + tailReach)
    };
    function fits(side) {
      var x = positions[side];
      var minX = side === 'right' ? x - tailReach : x;
      var maxX = side === 'left' ? x + w + tailReach : x + w;
      return minX >= left + margin && maxX <= right - margin;
    }

    var preferred = preferredBubbleSide(bubble, anchor, left, right);
    var opposite = preferred === 'left' ? 'right' : 'left';
    var side = fits(preferred) ? preferred : (fits(opposite) ? opposite :
      (anchor.x < (left + right) / 2 ? 'right' : 'left'));
    var x = positions[side];
    if (side === 'left') {
      x = U.clamp(x, left + margin, right - margin - w - tailReach);
    } else {
      x = U.clamp(x, left + margin + tailReach, right - margin - w);
    }
    var y = Math.round(U.clamp(
      Math.round(anchor.y - entityH - h + 3),
      Math.ceil(top + margin),
      Math.floor(bottom - margin - h - 2)
    ));
    var body = { x: x, y: y, w: w, h: h };
    var tail = side === 'left'
      ? { x: x + w - 2, y: y + h - 6, w: tailReach + 2, h: 8 }
      : { x: x - tailReach, y: y + h - 6, w: tailReach + 2, h: 8 };
    var bounds = {
      x: Math.min(body.x, tail.x),
      y: Math.min(body.y, tail.y),
      w: Math.max(body.x + body.w, tail.x + tail.w) - Math.min(body.x, tail.x),
      h: Math.max(body.y + body.h, tail.y + tail.h) - Math.min(body.y, tail.y)
    };
    return {
      mode: 'side', side: side, preferredSide: preferred, flipped: side !== preferred,
      x: x, y: y, w: w, h: h,
      body: body, tail: tail, bounds: bounds, healthBar: healthBar,
      overlapsHealthBar: rectsOverlap(body, healthBar) || rectsOverlap(tail, healthBar),
      withinViewport: bounds.x >= left && bounds.x + bounds.w <= right &&
        bounds.y >= top && bounds.y + bounds.h <= bottom
    };
  }

  function aboveBubbleLayout(anchor, left, top, right) {
    var w = 15;
    var h = 14;
    var centerX = U.clamp(anchor.x, left + w / 2 + 2, right - w / 2 - 2);
    var entityH = anchor.bubbleOffsetY || anchor.spriteH || 18;
    var y = Math.max(Math.round(top + 2), Math.round(anchor.y - entityH - h - 14));
    var x = Math.round(centerX - w / 2);
    var tailX = U.clamp(Math.round(anchor.x), x + 6, x + w - 6);
    var body = { x: x, y: y, w: w, h: h };
    var tail = { x: tailX - 3, y: y + h - 1, w: 6, h: 6 };
    var healthBar = healthBarRect(anchor);
    return {
      mode: 'above', side: null, preferredSide: null, flipped: false,
      x: x, y: y, w: w, h: h, tailX: tailX,
      body: body, tail: tail,
      bounds: { x: x, y: y, w: w, h: h + 5 },
      healthBar: healthBar,
      overlapsHealthBar: rectsOverlap(body, healthBar) || rectsOverlap(tail, healthBar),
      withinViewport: true
    };
  }

  function drawSidePixelBubble(bubble, layout) {
    var x = layout.x;
    var y = layout.y;
    var w = layout.w;
    var h = layout.h;
    var border = '#392c27';

    ctx.fillStyle = 'rgba(20,16,20,0.38)';
    ctx.fillRect(x + 2, y + 3, w, h - 2);

    ctx.fillStyle = border;
    ctx.fillRect(x + 2, y, w - 4, h);
    ctx.fillRect(x, y + 2, w, h - 4);
    if (layout.side === 'left') {
      ctx.fillRect(x + w - 2, y + h - 6, 3, 4);
      ctx.fillRect(x + w, y + h - 4, 3, 4);
      ctx.fillRect(x + w + 2, y + h - 2, 3, 3);
      ctx.fillRect(x + w + 4, y + h, 2, 2);
    } else {
      ctx.fillRect(x - 1, y + h - 6, 3, 4);
      ctx.fillRect(x - 3, y + h - 4, 3, 4);
      ctx.fillRect(x - 5, y + h - 2, 3, 3);
      ctx.fillRect(x - 6, y + h, 2, 2);
    }

    ctx.fillStyle = bubble.style.paper;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    if (layout.side === 'left') {
      ctx.fillRect(x + w - 1, y + h - 4, 2, 2);
      ctx.fillRect(x + w + 1, y + h - 2, 2, 2);
    } else {
      ctx.fillRect(x - 1, y + h - 4, 2, 2);
      ctx.fillRect(x - 3, y + h - 2, 2, 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillRect(x + 4, y + 2, Math.max(4, w - 9), 1);
    drawBubbleIcon(ctx, bubble.icon, x + 4, y + 3, bubble.style.accent, bubble.style.ink);
  }

  function drawAbovePixelBubble(bubble, layout) {
    var x = layout.x;
    var y = layout.y;
    var w = layout.w;
    var h = layout.h;
    var tailX = layout.tailX;
    var border = '#392c27';

    ctx.fillStyle = 'rgba(20,16,20,0.38)';
    ctx.fillRect(x + 2, y + 3, w, h - 2);
    ctx.fillRect(tailX, y + h + 1, 3, 3);

    ctx.fillStyle = border;
    ctx.fillRect(x + 2, y, w - 4, h);
    ctx.fillRect(x, y + 2, w, h - 4);
    ctx.fillRect(tailX - 3, y + h - 1, 6, 2);
    ctx.fillRect(tailX - 2, y + h + 1, 4, 2);
    ctx.fillRect(tailX - 1, y + h + 3, 2, 2);

    ctx.fillStyle = bubble.style.paper;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillRect(tailX - 1, y + h - 1, 2, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillRect(x + 4, y + 2, Math.max(4, w - 9), 1);
    drawBubbleIcon(ctx, bubble.icon, x + 4, y + 3, bubble.style.accent, bubble.style.ink);
  }

  function drawPixelBubble(bubble, anchor, left, top, right, bottom) {
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
    if (anchor.x < left - 48 || anchor.x > right + 48 ||
        anchor.y < top - 48 || anchor.y > bottom + 48) return;

    ctx.save();
    var usesDiagonalSide = bubble.placement === 'side' ||
      (bubble.placement === 'directional' && (anchor.dir === 'l' || anchor.dir === 'r'));
    var layout = usesDiagonalSide
      ? sideBubbleLayout(bubble, anchor, left, top, right, bottom)
      : aboveBubbleLayout(anchor, left, top, right);
    var motion = U.motionEnabled();
    var fadeIn = motion ? U.clamp((bubble.age + 0.06) / 0.14, 0, 1) : 1;
    var fadeOut = bubble.duration - bubble.age < 0.32
      ? U.clamp((bubble.duration - bubble.age) / 0.32, 0, 1)
      : 1;
    ctx.globalAlpha = fadeIn * fadeOut;
    // 阶梯角与像素尾巴保持硬边；接敌气泡的尾巴向单位斜下方收束。
    if (layout.mode === 'side') drawSidePixelBubble(bubble, layout);
    else drawAbovePixelBubble(bubble, layout);
    lastBubbleLayouts.push({
      id: bubble.id,
      type: bubble.type,
      entityKind: anchor.kind || 'entity',
      placement: bubble.placement,
      mode: layout.mode,
      side: layout.side,
      preferredSide: layout.preferredSide,
      flipped: layout.flipped,
      body: layout.body,
      tail: layout.tail,
      bounds: layout.bounds,
      healthBar: layout.healthBar,
      overlapsHealthBar: layout.overlapsHealthBar,
      withinViewport: layout.withinViewport
    });
    ctx.restore();
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
      canvas.addEventListener('click', function (e) {
        if (Date.now() < suppressStageTapUntil) {
          e.preventDefault();
          return;
        }
        var rect = canvas.getBoundingClientRect();
        var pt = R.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (Game.world && Game.world.handleTap) Game.world.handleTap(pt.x, pt.y);
      });
      canvas.addEventListener('wheel', function (e) {
        if (!stageInputAllowed()) return;
        var delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= canvas.clientHeight || ch;
        delta = U.clamp(delta, -240, 240);
        if (!delta) return;
        var point = stageCanvasPoint(e.clientX, e.clientY);
        if (setStageViewScale(effectiveViewScale() * Math.exp(-delta * 0.0015), point.x, point.y)) {
          e.preventDefault();
        }
      }, { passive: false });
      canvas.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'touch' || !stageInputAllowed() || stagePointerOrder.length >= 2) return;
        stagePointers[e.pointerId] = {
          x: e.clientX, y: e.clientY,
          startX: e.clientX, startY: e.clientY,
          moved: false
        };
        stagePointerOrder.push(e.pointerId);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        if (stagePointerOrder.length === 2) beginStagePinch();
      });
      canvas.addEventListener('pointermove', function (e) {
        var pointer = stagePointers[e.pointerId];
        if (!pointer) return;
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        if (Math.sqrt(
          Math.pow(pointer.x - pointer.startX, 2) +
          Math.pow(pointer.y - pointer.startY, 2)
        ) > TAP_MOVE_THRESHOLD) {
          pointer.moved = true;
          markStageGesture();
        }
        if (stagePointerOrder.length < 2) return;
        if (!stagePinch) beginStagePinch();
        var pair = stagePointerPair();
        var dx = pair[1].x - pair[0].x, dy = pair[1].y - pair[0].y;
        var midpoint = stageCanvasPoint((pair[0].x + pair[1].x) / 2, (pair[0].y + pair[1].y) / 2);
        setStageViewScale(
          stagePinch.scale * Math.sqrt(dx * dx + dy * dy) / stagePinch.distance,
          midpoint.x, midpoint.y, stagePinch.anchor
        );
      });
      canvas.addEventListener('pointerup', function (e) { removeStagePointer(e.pointerId, false); });
      canvas.addEventListener('pointercancel', function (e) { removeStagePointer(e.pointerId, true); });
      canvas.addEventListener('lostpointercapture', function (e) { removeStagePointer(e.pointerId, true); });
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
      viewOffset.x = 0; viewOffset.y = 0; viewOffsetHold = 0;
      vignetteC = null;
    },

    snapCamera: function (x, y) {
      cam.x = x; cam.y = y;
      viewOffset.x = 0; viewOffset.y = 0; viewOffsetHold = 0;
    },

    viewScale: function () {
      return effectiveViewScale();
    },

    setViewScale: function (scale, sx, sy) {
      return setStageViewScale(scale, sx, sy);
    },

    resetViewScale: function () {
      return setStageViewScale(1, cw / 2, ch / 2);
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
      authoredCamera.x = focusX;
      authoredCamera.y = focusY;
      authoredCamera.zoom = zoomT;
      authoredCamera.directed = !!cinematic;
      if (cinematic) {
        viewOffset.x = 0; viewOffset.y = 0; viewOffsetHold = 0;
      } else {
        if (stagePinch) viewOffsetHold = 0.12;
        else if (viewOffsetHold > 0) viewOffsetHold = Math.max(0, viewOffsetHold - dt);
        else {
          viewOffset.x = U.approach(viewOffset.x, 0, 5.2, dt);
          viewOffset.y = U.approach(viewOffset.y, 0, 5.2, dt);
        }
        focusX += viewOffset.x;
        focusY += viewOffset.y;
        zoomT *= effectiveViewScale();
      }
      if (canvas) canvas.setAttribute('data-stage-view-scale', effectiveViewScale().toFixed(4));
      cam.zoom = U.approach(cam.zoom, zoomT, cinematic ? 5 : 2.6, dt);
      var rate = cinematic ? 6 : 3.6;
      cam.x = U.approach(cam.x, focusX, rate, dt);
      cam.y = U.approach(cam.y, focusY, rate, dt);

      // 视口收敛与边界
      var clamped = clampCameraPosition(cam.x, cam.y, cam.zoom);
      cam.x = clamped.x;
      cam.y = clamped.y;
    },

    /* ---------- 主帧绘制 ---------- */
    frame: function (dt) {
      if (!ctx || !Game.world.region) return;
      var W = Game.world, region = W.region;
      R.updateCamera(dt);
      if (Game.weatherRender) Game.weatherRender.update(dt);

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
      var weatherState = Game.weather && Game.weather.current ? Game.weather.current() : null;
      var climateLight = weatherState ? {
        celestialVisibility: weatherState.celestialVisibility,
        tintInfluence: weatherState.tintInfluence
      } : null;
      Game.daynight.drawSky(ctx, cam, cw, ch, climateLight);
      if (Game.weatherRender) Game.weatherRender.drawSky(ctx, cw, ch);

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

      var terrainLayers = Game.terrain.renderLayers || {};
      if (terrainLayers.material !== false) {
        Game.terrain.drawGround(ctx, viewL, viewT, viewR, viewB);
      }
      if (terrainLayers.liquid !== false) {
        Game.terrain.drawLiquid(ctx, viewL, viewT, viewR, viewB);
      }
      Game.terrain.drawDecals(ctx);
      Game.terrain.drawTufts(ctx, viewL, viewT, viewR, viewB);
      if (Game.weatherRender) Game.weatherRender.drawSurface(ctx, viewL, viewT, viewR, viewB);
      if (Game.explorationRender) Game.explorationRender.drawWorldOverlay(ctx, viewL, viewT, viewR, viewB, t);
      if (Game.hazardRender) Game.hazardRender.drawGround(ctx, viewL, viewT, viewR, viewB);

      // 5) y 排序绘制（装饰 + 实体）
      var drawables = [];
      var j, e;
      var visibleProps = Game.terrain.spatialQuery && W.layout.version >= 3
        ? Game.terrain.spatialQuery(viewL - 48, viewT - 76, viewR + 48, viewB + 28, false)
        : W.props;
      visibleProps = visibleProps || W.props;
      for (j = 0; j < visibleProps.length; j++) {
        var p = visibleProps[j];
        if (p.kind === 'ecology' && Game.expedition && !Game.expedition.isEcologyActive(p.defId)) continue;
        if (p.x < viewL - 48 || p.x > viewR + 48 || p.y < viewT - 76 || p.y > viewB + 28) continue;
        drawables.push(p);
      }
      var visibleDynamic = Game.terrain.spatialQuery && W.layout.version >= 3
        ? Game.terrain.spatialQuery(viewL - 30, viewT - 60, viewR + 30, viewB + 30, true)
        : W.entities.concat(W.groundLoot);
      visibleDynamic = visibleDynamic || W.entities.concat(W.groundLoot);
      for (j = 0; j < visibleDynamic.length; j++) {
        if (!visibleDynamic[j].hazardConcealed) drawables.push(visibleDynamic[j]);
      }
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

      // 手动锁定目标：金色选中圈；玩家移动与 AI 航段使用不同标记。
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
        if (mo.ai) {
          ctx.strokeStyle = 'rgba(105,190,225,' + (0.34 + 0.18 * Math.sin(t * 4)).toFixed(2) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mo.x, mo.y - 5);
          ctx.lineTo(mo.x + 5, mo.y);
          ctx.lineTo(mo.x, mo.y + 5);
          ctx.lineTo(mo.x - 5, mo.y);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(120,230,130,' + (0.5 + 0.3 * Math.sin(t * 7)).toFixed(2) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(mo.x, mo.y, 6, 3, 0, 0, 6.29);
          ctx.stroke();
          ctx.fillStyle = 'rgba(120,230,130,0.7)';
          ctx.fillRect(mo.x - 1, mo.y - 1, 2, 2);
        }
      }

      // Encounter 预警与 priority target 直接读取确定性战斗状态。
      var activeEncounter = hero0 && hero0.encounterId && Game.encounters.get(hero0.encounterId);
      if (activeEncounter) {
        var priorityId = hero0.components.targeting && hero0.components.targeting.priorityTargetId;
        var priorityActor = priorityId && Game.actors.get(priorityId);
        if (priorityActor && !priorityActor.dead) {
          ctx.strokeStyle = 'rgba(255,213,92,' + (0.58 + 0.24 * Math.sin(t * 7)).toFixed(2) + ')';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(priorityActor.x, priorityActor.y + 1, priorityActor.boss ? 16 : 11,
            priorityActor.boss ? 6 : 4, 0, 0, 6.29);
          ctx.stroke();
        }
        activeEncounter.telegraphs.forEach(function (telegraph) {
          var remain = Math.max(0, telegraph.resolveTick - activeEncounter.tick);
          var total = Math.max(1, telegraph.resolveTick - telegraph.visibleTick);
          var pulse = 0.3 + 0.45 * (1 - remain / total);
          ctx.fillStyle = 'rgba(232,77,65,' + (pulse * 0.32).toFixed(2) + ')';
          ctx.strokeStyle = 'rgba(255,137,120,' + Math.min(1, pulse + 0.2).toFixed(2) + ')';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(telegraph.x, telegraph.y, telegraph.radius || 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }

      for (j = 0; j < drawables.length; j++) {
        e = drawables[j];
        if (isActorEntity(e)) R.drawEntity(e);
        else if (e.kind === 'groundLoot') R.drawGroundLoot(e, t);
        else if (e.kind === 'gatherNode') R.drawGatherNode(e, t);
        else if (e.kind === 'chest') R.drawChest(e, t);
        else if (e.kind === 'tradeProp') R.drawTradeProp(e, t);
        else R.drawProp(e, t);
      }
      R.drawInteractionProgress(hero0);

      // 6) 篝火光晕（半径/透明度随机抖动）
      var fxOn = !Game.particles || Game.particles.isEnabled();
      var nightF = Game.daynight.nightFactor(climateLight);
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
      if (Game.weatherRender) Game.weatherRender.drawWorld(ctx, viewL, viewT, viewR, viewB);
      Game.fx.drawShapes(ctx);
      if (Game.exploration) Game.exploration.drawFog(ctx, viewL, viewT, viewR, viewB);
      if (Game.hazardRender) Game.hazardRender.drawOverlay(ctx, viewL, viewT, viewR, viewB);

      // 8) 屏幕空间：林间光柱 → 日夜色调 → 暗角
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (fxOn && region.rays) {
        var dayK = 1 - Math.min(1, nightF / 0.4);
        if (weatherState) dayK *= 1 - weatherState.cloudCover * weatherState.intensity * 0.82;
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
      Game.daynight.drawTint(ctx, cw, ch, climateLight);
      if (Game.weatherRender) Game.weatherRender.drawScreen(ctx, cw, ch);
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
      R.drawActionBubbles();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    drawActionBubbles: function () {
      lastBubbleLayouts = [];
      if (!Game.actionBubbles) return;
      var left = cam.x - cw / cam.zoom / 2;
      var right = cam.x + cw / cam.zoom / 2;
      var top = cam.y - ch / cam.zoom / 2;
      var bottom = cam.y + ch / cam.zoom / 2;
      Game.actionBubbles.visit(function (bubble, anchor) {
        drawPixelBubble(bubble, anchor, left, top, right, bottom);
      });
    },

    actionBubbleLayouts: function () {
      return JSON.parse(JSON.stringify(lastBubbleLayouts));
    },

    drawActionBubbleIcon: function (target, type) {
      if (!target || !Game.actionBubbles) return false;
      var def = Game.actionBubbles.type(type);
      if (!def) return false;
      var graphics = target.getContext && target.getContext('2d');
      if (!graphics) return false;
      graphics.clearRect(0, 0, target.width, target.height);
      graphics.imageSmoothingEnabled = false;
      var scale = Math.max(1, Math.floor(Math.min(target.width, target.height) / 12));
      graphics.save();
      graphics.scale(scale, scale);
      var x = Math.floor(target.width / scale / 2) - 4;
      var y = Math.floor(target.height / scale / 2) - 4;
      drawBubbleIcon(graphics, def.icon, x, y, def.accent, def.ink);
      graphics.restore();
      return true;
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

      if (isNonHeroActor(e) && e.dead) {
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
      if (e.lungeT > 0 && !e.presentationNoLunge) {
        var tgt = e.presentationTargetId && Game.actors
          ? Game.actors.get(e.presentationTargetId)
          : (e.kind === 'hero' ? e.target : Game.world.hero);
        if (tgt) {
          var dd = Math.max(1, U.dist(e.x, e.y, tgt.x, tgt.y));
          var k = Math.sin((1 - e.lungeT / 0.18) * Math.PI) * 4;
          ox = (tgt.x - e.x) / dd * k;
          oy = (tgt.y - e.y) / dd * k;
        }
      }

      var frame = e.kind === 'hero' ? heroFrame(e) : monsterFrame(e);
      var flip = false;
      if (isNonHeroActor(e)) {
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
      var showBar = !!e.components.vitals && (isNonHeroActor(e)
        ? (!e.dead && (e.hp < e.maxHp || e.engaged || e.boss))
        : (e.hp < e.maxHp));
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
      var scale = sp.w <= 13 && sp.h <= 13 ? 2 : 1;
      // v3 首发存档中的节点可能没有 phase。动画输入一旦是 undefined，
      // Math.sin 会返回 NaN，继而令整张资源精灵的 y 坐标失效、完全不落到 Canvas。
      // 生成器会为新布局写入 phase；这里仍保留稳定回退，兼容已生成的旧布局。
      var phase = Number.isFinite(node.phase)
        ? node.phase
        : (U.strSeed(String(node.id || spriteId)) % 628) / 100;
      var bob = ready && motion ? Math.sin(t * 1.8 + phase) * 0.65 : 0;
      var x = Math.round(node.x), y = Math.round(node.y + bob);
      ctx.save();
      ctx.globalAlpha = ready ? 0.34 : 0.14;
      ctx.fillStyle = '#202236';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, Math.max(8, sp.w * scale * 0.38), 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!ready) {
        // 枯竭节点只保留明确的地面痕迹，不再用半透明原精灵造成“采完才出现”的错觉。
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = '#332b29';
        ctx.fillRect(x - 6, y - 2, 12, 3);
        ctx.fillStyle = '#6f5d48';
        ctx.fillRect(x - 4, y - 3, 8, 2);
        ctx.fillStyle = '#9a7d59';
        ctx.fillRect(x - 1, y - 5, 3, 2);
        ctx.globalAlpha = 0.44;
        ctx.strokeStyle = '#8d7558';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y + 1, 8, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (motion) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.30 + 0.12 * Math.sin(t * 2 + phase);
        ctx.drawImage(Game.assets.glowTex(node.accent, 16), x - 20, y - 24, 40, 40);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = node.rarity === 'rare' ? 'rgba(255,218,110,0.86)' : (node.accent || '#9de5a0');
      ctx.globalAlpha = 0.70;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, Math.max(8, sp.w * scale * 0.40), 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      var frame = Game.assets.hasFrame(spriteId, 'idle1') &&
        (((t / 0.55) + phase) | 0) % 2 === 1 ? 'idle1' : 'idle0';
      Game.assets.draw(ctx, spriteId, frame, x, y, { scale: scale });
      var sparkle = ((t * 3 + phase) | 0) % 7;
      if (sparkle < 2) {
        ctx.fillStyle = node.rarity === 'rare' ? '#fff2ad' : (node.accent || '#d8f09a');
        ctx.fillRect(x + Math.max(6, sp.w * scale * 0.35), y - sp.h * scale + 1, 1, 3);
        ctx.fillRect(x + Math.max(5, sp.w * scale * 0.35) - 1, y - sp.h * scale + 2, 3, 1);
      }
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
      if (chest.oddity) {
        var tell = motion ? (((t * 3 + chest.phase) | 0) % 13 === 0) : true;
        if (tell) {
          ctx.globalAlpha = alpha * .72;
          ctx.fillStyle = '#7f3037';
          ctx.fillRect(Math.round(chest.x + 3), Math.round(y - 8), 1, 1);
        }
      }
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
