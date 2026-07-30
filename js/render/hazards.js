/* Render-only Hazard mechanism layer. Logic and hit tests live in systems/hazards.js. */
(function () {
  'use strict';
  var Game = window.Game;
  var TAU = Math.PI * 2;
  var GLYPH_THEME = {
    spikes: { material: '#9b7547', shadow: '#3b2a24', highlight: '#ead09a', accent: '#789447' },
    darts: { material: '#6e8b3f', shadow: '#263521', highlight: '#d5eb83', accent: '#987344' },
    rocks: { material: '#778087', shadow: '#32383d', highlight: '#cbd0c8', accent: '#b28a55' },
    seal: { material: '#74558f', shadow: '#292336', highlight: '#e2c9ff', accent: '#9d76c6' },
    icicle: { material: '#87bec8', shadow: '#324a59', highlight: '#efffff', accent: '#b9e7ee' },
    flame: { material: '#d9572d', shadow: '#3c211e', highlight: '#ffe487', accent: '#ff9b36' },
    arc: { material: '#568e9f', shadow: '#273748', highlight: '#e8ffff', accent: '#78e4ed' },
    lances: { material: '#8c7d87', shadow: '#352c35', highlight: '#eee0d8', accent: '#b899a9' },
    ambush: { material: '#61734b', shadow: '#283025', highlight: '#d5df9a', accent: '#9bb765' },
    mark: { material: '#8d7951', shadow: '#2d2924', highlight: '#f0d998', accent: '#b59a57' }
  };

  function glyphOf(instance) {
    return (instance.visual || {}).glyph || 'mark';
  }

  function palette(instance) {
    var visual = instance.visual || {};
    var theme = GLYPH_THEME[glyphOf(instance)] || GLYPH_THEME.mark;
    return Object.assign({
      clue: '#7b715b',
      dormant: '#d6b35f',
      warning: '#e7a63a',
      danger: '#c94b39',
      active: '#fff0ad',
      cooldown: '#65676b',
      element: theme.highlight,
      ink: '#211a1d'
    }, theme, visual.palette || {});
  }

  function dimensions(instance) {
    var trigger = instance.profile.trigger;
    return {
      radius: trigger.radius || 16,
      width: trigger.width || trigger.length || (trigger.radius || 16) * 2,
      height: trigger.height || (trigger.radius || 8) * 2,
      length: trigger.length || trigger.radius || 36,
      angle: (trigger.angleDeg || 60) * Math.PI / 180
    };
  }

  function tick(instance) {
    return instance.previewTick != null ? instance.previewTick :
      (Game.hazards && Game.hazards.tick ? Game.hazards.tick() : 0);
  }

  function animated(instance) {
    return !instance.previewStatic && (!Game.util || !Game.util.motionEnabled || Game.util.motionEnabled());
  }

  function phaseProgress(instance) {
    if (instance.previewProgress != null) return Math.max(0, Math.min(1, instance.previewProgress));
    if (instance.phase !== 'warning') return 0;
    return Math.max(0, Math.min(1, (tick(instance) - instance.phaseSinceTick) /
      Math.max(1, instance.warningEndTick - instance.phaseSinceTick)));
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x1), Math.round(y1));
    ctx.lineTo(Math.round(x2), Math.round(y2));
    ctx.stroke();
  }

  function poly(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
    for (var i = 1; i < points.length; i++) {
      ctx.lineTo(Math.round(points[i][0]), Math.round(points[i][1]));
    }
    ctx.closePath();
  }

  function fillPoly(ctx, points, color) {
    if (color) ctx.fillStyle = color;
    poly(ctx, points);
    ctx.fill();
  }

  function pixelCirclePoints(radius) {
    var r = Math.max(3, Math.round(radius));
    var a = Math.max(2, Math.round(r * 0.44));
    var b = Math.max(a + 1, Math.round(r * 0.78));
    return [
      [-a, -r], [a, -r], [a, -r + 1], [b, -b], [r - 1, -a], [r, -a],
      [r, a], [r - 1, a], [b, b], [a, r - 1], [a, r], [-a, r],
      [-a, r - 1], [-b, b], [-r + 1, a], [-r, a], [-r, -a],
      [-r + 1, -a], [-b, -b], [-a, -r + 1]
    ];
  }

  function pathShape(ctx, instance, inset) {
    var trigger = instance.profile.trigger;
    var size = dimensions(instance);
    inset = inset || 0;
    if (trigger.shape === 'circle') {
      poly(ctx, pixelCirclePoints(Math.max(3, size.radius - inset)));
    } else if (trigger.shape === 'cone') {
      var length = Math.max(5, size.length - inset);
      var half = Math.max(4, Math.tan(size.angle / 2) * length);
      poly(ctx, [
        [1 + inset, 0],
        [Math.round(length * .28), -Math.round(half * .32)],
        [Math.round(length * .62), -Math.round(half * .7)],
        [length, -half],
        [length, half],
        [Math.round(length * .62), Math.round(half * .7)],
        [Math.round(length * .28), Math.round(half * .32)]
      ]);
    } else {
      var x = Math.round(-size.width / 2 + inset);
      var y = Math.round(-size.height / 2 + inset);
      var w = Math.max(3, Math.round(size.width - inset * 2));
      var h = Math.max(3, Math.round(size.height - inset * 2));
      poly(ctx, [[x + 2, y], [x + w - 2, y], [x + w, y + 2], [x + w, y + h - 2],
        [x + w - 2, y + h], [x + 2, y + h], [x, y + h - 2], [x, y + 2]]);
    }
  }

  function shapeBounds(instance) {
    var trigger = instance.profile.trigger;
    var size = dimensions(instance);
    if (trigger.shape === 'circle') {
      return { left: -size.radius, right: size.radius, top: -size.radius, bottom: size.radius };
    }
    if (trigger.shape === 'cone') {
      var half = Math.tan(size.angle / 2) * size.length;
      return { left: 0, right: size.length, top: -half, bottom: half };
    }
    return { left: -size.width / 2, right: size.width / 2, top: -size.height / 2, bottom: size.height / 2 };
  }

  function pointInside(instance, x, y) {
    var trigger = instance.profile.trigger;
    var size = dimensions(instance);
    if (trigger.shape === 'circle') return x * x + y * y <= size.radius * size.radius;
    if (trigger.shape === 'cone') {
      if (x < 0 || x > size.length) return false;
      return Math.abs(Math.atan2(y, Math.max(1, x))) <= size.angle / 2;
    }
    return Math.abs(x) <= size.width / 2 && Math.abs(y) <= size.height / 2;
  }

  function hashId(value) {
    var hash = 0;
    value = String(value || '');
    for (var i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) & 255;
    return hash;
  }

  function ditherField(ctx, instance, color, alpha, dense) {
    var bounds = shapeBounds(instance);
    var seed = hashId(instance.id || instance.profileId);
    var phase = animated(instance) ? Math.floor(tick(instance) / 3) : 0;
    var step = dense ? 4 : 6;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    for (var y = Math.floor(bounds.top); y <= bounds.bottom; y += step) {
      for (var x = Math.floor(bounds.left); x <= bounds.right; x += step) {
        if (!pointInside(instance, x, y)) continue;
        var cell = Math.abs(Math.floor(x / step) * 3 + Math.floor(y / step) * 5 + seed + phase);
        if (cell % (dense ? 3 : 4) !== 0) continue;
        ctx.fillRect(Math.round(x), Math.round(y), dense && cell % 2 ? 2 : 1, dense && cell % 2 ? 2 : 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function pixelDiamond(ctx, x, y, radius, color) {
    fillPoly(ctx, [[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]], color);
  }

  function pixelSpark(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - radius), Math.round(y - 1), radius * 2 + 1, 2);
    ctx.fillRect(Math.round(x - 1), Math.round(y - radius), 2, radius * 2 + 1);
    if (radius > 3) {
      ctx.fillRect(Math.round(x - radius + 1), Math.round(y - radius + 1), 2, 2);
      ctx.fillRect(Math.round(x + radius - 2), Math.round(y - radius + 1), 2, 2);
      ctx.fillRect(Math.round(x - radius + 1), Math.round(y + radius - 2), 2, 2);
      ctx.fillRect(Math.round(x + radius - 2), Math.round(y + radius - 2), 2, 2);
    }
  }

  function clue(ctx, instance, colors) {
    var id = instance.profileId || '';
    var glyph = glyphOf(instance);
    ctx.fillStyle = colors.clue;
    ctx.strokeStyle = colors.clue;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.56;

    if (/grass/.test(id)) {
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(-11, 5, 23, 3);
      ctx.fillStyle = colors.clue;
      ctx.fillRect(-9, 3, 7, 2); ctx.fillRect(4, 2, 7, 2);
      line(ctx, -7, 3, -9, -4); line(ctx, -7, 3, -3, -2);
      line(ctx, 7, 2, 5, -5); line(ctx, 7, 2, 11, -2);
      ctx.fillRect(-1, 6, 3, 2);
    } else if (/forest/.test(id)) {
      ctx.fillRect(-12, 4, 24, 2);
      ctx.fillRect(-10, 1, 5, 2); ctx.fillRect(5, -1, 5, 2);
      line(ctx, -9, 1, -5, -4); line(ctx, -5, -4, 1, 1); line(ctx, 1, 1, 6, -5);
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(-3, 5, 7, 3);
    } else if (/mine/.test(id)) {
      fillPoly(ctx, [[-13, 6], [-10, 1], [-5, 4], [-4, 7]], colors.clue);
      fillPoly(ctx, [[-2, 5], [1, 0], [6, 2], [7, 6]], colors.clue);
      ctx.fillRect(9, 4, 5, 3);
      ctx.strokeStyle = colors.shadow;
      line(ctx, -6, 2, -2, -3); line(ctx, 5, 2, 9, -3);
    } else if (/graveyard/.test(id)) {
      ctx.fillRect(-12, 2, 6, 4); ctx.fillRect(6, 2, 6, 4);
      ctx.fillRect(-8, 1, 16, 2);
      ctx.fillRect(-9, -2, 2, 3); ctx.fillRect(7, -2, 2, 3);
      ctx.fillStyle = colors.shadow;
      pixelDiamond(ctx, 0, 5, 2);
    } else if (/snow/.test(id)) {
      ctx.fillRect(-11, 1, 3, 5); ctx.fillRect(-9, 5, 6, 3);
      ctx.fillRect(3, -2, 3, 5); ctx.fillRect(5, 2, 6, 3);
      ctx.fillStyle = colors.highlight;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(-10, 1, 2, 2); ctx.fillRect(4, -2, 2, 2);
    } else if (/lava/.test(id)) {
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(-14, 5, 28, 3);
      ctx.fillStyle = colors.clue;
      for (var e = -10; e <= 10; e += 10) {
        ctx.fillRect(e, 2 + Math.abs(e) / 5, 3, 3);
        line(ctx, e + 1, 2 + Math.abs(e) / 5, e + 4, -3 + Math.abs(e) / 6);
      }
    } else if (/sky/.test(id)) {
      ctx.fillRect(-12, 4, 7, 3); ctx.fillRect(5, 2, 7, 3);
      ctx.fillRect(-10, -1, 2, 5); ctx.fillRect(8, -3, 2, 5);
      pixelDiamond(ctx, 0, 3, 3, colors.clue);
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(-2, 2, 4, 2);
    } else if (/castle/.test(id)) {
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(-14, 3, 28, 5);
      ctx.fillStyle = colors.clue;
      for (var c = -9; c <= 9; c += 9) {
        ctx.fillRect(c - 2, 1, 5, 4);
        ctx.fillStyle = colors.highlight; ctx.fillRect(c - 1, 1, 2, 1); ctx.fillStyle = colors.clue;
      }
    } else if (glyph === 'ambush') {
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(-12, 4, 24, 4);
      ctx.fillStyle = colors.clue;
      ctx.fillRect(-10, 1, 4, 4); ctx.fillRect(7, 0, 4, 5);
      ctx.fillRect(-3, 5, 2, 2); ctx.fillRect(3, 4, 2, 2);
    } else {
      ctx.fillRect(-8, 5, 5, 2); ctx.fillRect(2, 4, 7, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawSpikes(ctx, colors, energy, beat) {
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(-14, 5, 29, 4);
    ctx.fillStyle = colors.material;
    ctx.fillRect(-12, 4, 25, 3);
    for (var i = -11; i <= 9; i += 4) {
      var rank = Math.abs(i) % 3;
      var height = energy ? 10 + rank * 2 + beat : 4 + rank;
      fillPoly(ctx, [[i, 5], [i + 2, 5 - height], [i + 4, 5]], colors.shadow);
      fillPoly(ctx, [[i + 1, 4], [i + 2, 6 - height], [i + 3, 4]], colors.element);
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(i + 2, 7 - height, 1, Math.max(2, height - 5));
    }
    ctx.fillStyle = colors.accent;
    ctx.fillRect(-13, 7, 4, 2); ctx.fillRect(8, 7, 5, 2);
  }

  function drawDarts(ctx, instance, colors, energy) {
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(-17, -10, 5, 21);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(-16, -9, 3, 19);
    ctx.fillStyle = colors.material;
    ctx.fillRect(-19, -8, 3, 4); ctx.fillRect(-19, 3, 3, 4);
    for (var i = -6; i <= 6; i += 6) {
      var travel = energy && animated(instance) ? (tick(instance) * 5 + (i + 6) * 3) % 27 : 5;
      var x = -12 + travel;
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(x - 9, i, 12, 2);
      fillPoly(ctx, [[x + 3, i - 2], [x + 8, i + 1], [x + 3, i + 4]], colors.element);
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(x - 6, i, 7, 1);
      ctx.fillStyle = colors.material;
      ctx.fillRect(x - 9, i - 2, 2, 2); ctx.fillRect(x - 9, i + 2, 2, 2);
    }
  }

  function drawRocks(ctx, instance, colors, energy) {
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(-14, 6, 29, 4);
    for (var i = 0; i < 5; i++) {
      var x = -12 + i * 6;
      var fall = energy && animated(instance) ? ((tick(instance) * 4 + i * 7) % 22) - 16 : -2 + (i % 3) * 3;
      var size = 5 + i % 2;
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(x - 1, fall + 1, size + 2, size + 1);
      ctx.fillStyle = colors.material;
      ctx.fillRect(x, fall, size, size);
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(x + 1, fall + 1, Math.max(1, size - 3), 1);
      ctx.fillStyle = colors.accent;
      ctx.fillRect(x + size - 2, fall + size - 2, 2, 2);
    }
  }

  function drawSeal(ctx, instance, colors, energy) {
    var rotation = energy && animated(instance) ? (Math.floor(tick(instance) / 3) % 8) * Math.PI / 4 : 0;
    ctx.save();
    ctx.rotate(rotation);
    for (var i = 0; i < 12; i++) {
      var angle = i / 12 * TAU;
      var x = Math.round(Math.cos(angle) * 11);
      var y = Math.round(Math.sin(angle) * 11);
      pixelDiamond(ctx, x, y, i % 3 ? 2 : 3, i % 2 ? colors.material : colors.element);
    }
    ctx.restore();
    pixelDiamond(ctx, 0, 0, energy ? 7 : 5, colors.shadow);
    ctx.fillStyle = colors.material;
    ctx.fillRect(-1, -7, 3, 14);
    ctx.fillRect(-7, -1, 14, 3);
    ctx.fillStyle = colors.highlight;
    ctx.fillRect(0, -5, 1, 10);
    ctx.fillRect(-5, 0, 10, 1);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(-5, -5, 3, 3); ctx.fillRect(3, 3, 3, 3);
  }

  function drawIcicles(ctx, instance, colors, energy) {
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(-13, -9, 27, 3);
    for (var i = -9; i <= 9; i += 9) {
      var fall = energy && animated(instance) ? ((tick(instance) * 4 + i * 2) % 20) - 11 : -4;
      fillPoly(ctx, [[i - 4, fall - 5], [i + 4, fall - 5], [i + 1, fall + 8], [i - 1, fall + 8]], colors.shadow);
      fillPoly(ctx, [[i - 2, fall - 4], [i + 3, fall - 4], [i, fall + 6]], colors.element);
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(i - 1, fall - 3, 1, 6);
    }
    ctx.fillStyle = colors.accent;
    ctx.fillRect(-14, 6, 5, 2); ctx.fillRect(8, 5, 6, 2);
  }

  function drawFlames(ctx, instance, colors, energy, beat) {
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(-15, 6, 31, 4);
    for (var i = -9; i <= 9; i += 9) {
      var height = energy ? 14 + beat + ((i + 9) / 9) % 2 * 2 : 8;
      fillPoly(ctx, [
        [i - 5, 6], [i - 5, 1], [i - 2, 1], [i - 3, -height + 4],
        [i, -height], [i + 2, -height + 6], [i + 5, -height + 3], [i + 5, 6]
      ], colors.shadow);
      fillPoly(ctx, [
        [i - 3, 5], [i - 3, 1], [i, -height + 2], [i + 1, -height + 8],
        [i + 3, -height + 5], [i + 3, 5]
      ], colors.material);
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(i - 1, 0, 2, 5);
      ctx.fillStyle = colors.accent;
      ctx.fillRect(i + 1, -height + 7, 2, 4);
    }
  }

  function drawArc(ctx, instance, colors, energy) {
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(-17, -8, 6, 17); ctx.fillRect(12, -8, 6, 17);
    ctx.fillStyle = colors.material;
    ctx.fillRect(-16, -7, 4, 15); ctx.fillRect(13, -7, 4, 15);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(-18, -5, 3, 3); ctx.fillRect(-18, 3, 3, 3);
    ctx.fillRect(16, -5, 3, 3); ctx.fillRect(16, 3, 3, 3);
    var offset = energy && animated(instance) ? tick(instance) % 3 - 1 : 0;
    ctx.strokeStyle = colors.shadow;
    ctx.lineWidth = 4;
    line(ctx, -12, offset, -7, -5 + offset); line(ctx, -7, -5 + offset, -2, 4 + offset);
    line(ctx, -2, 4 + offset, 4, -4 + offset); line(ctx, 4, -4 + offset, 9, 3 + offset);
    line(ctx, 9, 3 + offset, 13, offset);
    ctx.strokeStyle = colors.element;
    ctx.lineWidth = 2;
    line(ctx, -12, offset, -7, -5 + offset); line(ctx, -7, -5 + offset, -2, 4 + offset);
    line(ctx, -2, 4 + offset, 4, -4 + offset); line(ctx, 4, -4 + offset, 9, 3 + offset);
    line(ctx, 9, 3 + offset, 13, offset);
    pixelSpark(ctx, -13, 0, energy ? 3 : 2, colors.highlight);
    pixelSpark(ctx, 14, 0, energy ? 3 : 2, colors.highlight);
  }

  function drawLances(ctx, colors, energy, beat) {
    var reach = energy ? 18 + beat : 9;
    for (var i = -7; i <= 7; i += 7) {
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(-19, i - 3, 5, 6);
      ctx.fillStyle = colors.material;
      ctx.fillRect(-18, i - 2, 4, 4);
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(-15, i - 2, reach + 9, 4);
      ctx.fillStyle = colors.accent;
      ctx.fillRect(-14, i - 1, reach + 7, 2);
      fillPoly(ctx, [[reach - 7, i - 4], [reach, i], [reach - 7, i + 4]], colors.shadow);
      fillPoly(ctx, [[reach - 7, i - 2], [reach - 2, i], [reach - 7, i + 2]], colors.element);
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(-10, i - 1, Math.max(4, reach - 3), 1);
    }
  }

  function drawAmbush(ctx, instance, colors, energy, beat) {
    var close = energy ? 8 - beat : 14;
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(-16, 5, 33, 5);
    for (var side = -1; side <= 1; side += 2) {
      var x = side * close;
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(x - 6, -5, 12, 12);
      ctx.fillStyle = colors.material;
      ctx.fillRect(x - 4, -7, 8, 13);
      ctx.fillRect(x - side * 4, -3, 8, 8);
      ctx.fillStyle = colors.accent;
      ctx.fillRect(x - 2, -8, 3, 4);
      fillPoly(ctx, [[x - side * 2, 5], [x, 0], [x + side * 5, 5]], colors.highlight);
    }
    if (energy) {
      ctx.fillStyle = colors.ink;
      ctx.fillRect(-5, -3, 11, 7);
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(-3, -1, 2, 2); ctx.fillRect(2, -1, 2, 2);
    }
  }

  function mechanism(ctx, instance, colors, alpha, energy) {
    var glyph = glyphOf(instance);
    var beat = energy && animated(instance) ? Math.floor((Math.sin(tick(instance) * .9) + 1) * 1.5) : 0;
    ctx.globalAlpha = alpha;
    if (glyph === 'spikes') drawSpikes(ctx, colors, energy, beat);
    else if (glyph === 'darts') drawDarts(ctx, instance, colors, energy);
    else if (glyph === 'rocks') drawRocks(ctx, instance, colors, energy);
    else if (glyph === 'seal') drawSeal(ctx, instance, colors, energy);
    else if (glyph === 'icicle') drawIcicles(ctx, instance, colors, energy);
    else if (glyph === 'flame') drawFlames(ctx, instance, colors, energy, beat);
    else if (glyph === 'arc') drawArc(ctx, instance, colors, energy);
    else if (glyph === 'lances') drawLances(ctx, colors, energy, beat);
    else if (glyph === 'ambush') drawAmbush(ctx, instance, colors, energy, beat);
    else pixelDiamond(ctx, 0, 0, 4, colors.element);
    ctx.globalAlpha = 1;
  }

  function cornerBracket(ctx, x, y, sx, sy, color, longArm) {
    var arm = longArm ? 8 : 5;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, sx * arm, sy * 2);
    ctx.fillRect(x, y, sx * 2, sy * arm);
    ctx.fillStyle = '#241d1c';
    ctx.fillRect(x + sx * 2, y + sy * 2, sx * 2, sy * 2);
  }

  function warningMarkers(ctx, instance, colors, progress) {
    var trigger = instance.profile.trigger;
    var size = dimensions(instance);
    var finalStage = progress >= 0.72;
    var pulse = animated(instance) ? Math.floor(tick(instance) / 3) % 2 : 0;
    var edge = finalStage ? colors.active : colors.warning;
    var shadow = colors.ink;
    var inset = Math.round(progress * 3);

    if (trigger.shape === 'circle') {
      var radius = Math.max(7, size.radius - inset);
      var count = 16;
      for (var i = 0; i < count; i++) {
        if (!finalStage && (i + pulse) % 3 === 0) continue;
        var angle = i / count * TAU;
        var x = Math.round(Math.cos(angle) * radius);
        var y = Math.round(Math.sin(angle) * radius);
        ctx.fillStyle = shadow;
        ctx.fillRect(x - 2, y - 2, 5, 5);
        ctx.fillStyle = i % 4 === 0 ? colors.danger : edge;
        ctx.fillRect(x - 1, y - 1, 3, 3);
      }
      for (var c = 0; c < 4; c++) {
        var cardinal = c * Math.PI / 2;
        var cx = Math.round(Math.cos(cardinal) * (radius + 5));
        var cy = Math.round(Math.sin(cardinal) * (radius + 5));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(cardinal);
        fillPoly(ctx, [[-3, -3], [4, 0], [-3, 3]], shadow);
        fillPoly(ctx, [[-2, -1], [2, 0], [-2, 1]], edge);
        ctx.restore();
      }
    } else if (trigger.shape === 'cone') {
      var half = Math.tan(size.angle / 2) * size.length;
      ctx.fillStyle = shadow;
      ctx.fillRect(1, -2, 7, 5);
      ctx.fillStyle = edge;
      ctx.fillRect(2, -1, 5, 3);
      for (var lane = -1; lane <= 1; lane++) {
        var endY = Math.round(half * lane);
        var startY = Math.round(endY * .18);
        ctx.strokeStyle = shadow; ctx.lineWidth = 4;
        line(ctx, 7, startY, size.length - 3, endY);
        ctx.strokeStyle = edge; ctx.lineWidth = finalStage ? 2 : 1;
        ctx.setLineDash(finalStage ? [3, 2] : [2, 4]);
        line(ctx, 7, startY, size.length - 3, endY);
        ctx.setLineDash([]);
        pixelDiamond(ctx, size.length, endY, lane ? 3 : 4, lane ? edge : colors.danger);
      }
    } else {
      var left = Math.round(-size.width / 2 + inset);
      var right = Math.round(size.width / 2 - inset);
      var top = Math.round(-size.height / 2 + inset);
      var bottom = Math.round(size.height / 2 - inset);
      cornerBracket(ctx, left, top, 1, 1, edge, finalStage);
      cornerBracket(ctx, right, top, -1, 1, edge, finalStage);
      cornerBracket(ctx, left, bottom, 1, -1, edge, finalStage);
      cornerBracket(ctx, right, bottom, -1, -1, edge, finalStage);
      for (var m = -1; m <= 1; m++) {
        var my = Math.round(m * size.height * .28);
        fillPoly(ctx, [[left - 6, my - 3], [left - 1, my], [left - 6, my + 3]], shadow);
        fillPoly(ctx, [[left - 4, my - 1], [left - 1, my], [left - 4, my + 1]], edge);
        fillPoly(ctx, [[right + 6, my - 3], [right + 1, my], [right + 6, my + 3]], shadow);
        fillPoly(ctx, [[right + 4, my - 1], [right + 1, my], [right + 4, my + 1]], edge);
      }
    }
  }

  function residue(ctx, instance, colors) {
    var glyph = glyphOf(instance);
    ctx.fillStyle = colors.cooldown;
    ctx.strokeStyle = colors.cooldown;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    if (glyph === 'flame') {
      ctx.fillRect(-15, 5, 31, 3); ctx.fillRect(-10, 2, 5, 2); ctx.fillRect(3, 1, 8, 2);
      ctx.fillStyle = colors.shadow; ctx.fillRect(-4, 3, 6, 3);
    } else if (glyph === 'rocks') {
      ctx.fillRect(-13, 1, 7, 6); ctx.fillRect(-3, 4, 6, 4); ctx.fillRect(7, 0, 5, 7);
      ctx.fillStyle = colors.shadow; ctx.fillRect(-11, 1, 3, 2); ctx.fillRect(8, 1, 2, 2);
    } else if (glyph === 'icicle') {
      fillPoly(ctx, [[-13, 6], [-7, 0], [-2, 6]], colors.cooldown);
      fillPoly(ctx, [[3, 6], [9, -2], [13, 6]], colors.cooldown);
    } else if (glyph === 'seal') {
      for (var i = 0; i < 8; i++) {
        if (i === 2 || i === 6) continue;
        var a = i / 8 * TAU;
        ctx.fillRect(Math.round(Math.cos(a) * 10) - 1, Math.round(Math.sin(a) * 10) - 1, 3, 3);
      }
      pixelDiamond(ctx, 0, 0, 3, colors.shadow);
    } else if (glyph === 'arc') {
      ctx.fillRect(-13, 3, 5, 4); ctx.fillRect(-2, 5, 4, 3); ctx.fillRect(9, 2, 5, 5);
      ctx.fillStyle = colors.shadow; ctx.fillRect(-7, 5, 4, 2); ctx.fillRect(4, 4, 3, 2);
    } else if (glyph === 'lances') {
      ctx.fillRect(-14, 4, 7, 3); ctx.fillRect(-3, 2, 9, 3); ctx.fillRect(9, 5, 5, 2);
      ctx.fillStyle = colors.shadow; ctx.fillRect(-10, 1, 2, 5); ctx.fillRect(4, 0, 2, 4);
    } else {
      ctx.fillRect(-13, 5, 7, 3); ctx.fillRect(-3, 3, 6, 4); ctx.fillRect(7, 4, 7, 3);
      ctx.fillStyle = colors.shadow; ctx.fillRect(-8, 2, 3, 3); ctx.fillRect(5, 1, 2, 4);
    }
    ctx.globalAlpha = 1;
  }

  function activeDebris(ctx, instance, colors) {
    if (!animated(instance)) return;
    var glyph = glyphOf(instance);
    var frame = tick(instance);
    var particleColor = glyph === 'flame' ? colors.highlight :
      (glyph === 'seal' || glyph === 'arc' ? colors.element : colors.accent);
    ctx.fillStyle = particleColor;
    ctx.globalAlpha = 0.82;
    for (var i = 0; i < 7; i++) {
      var x = ((i * 13 + frame * (i % 2 ? 2 : -2)) % 37) - 18;
      var y = 7 - ((frame * (2 + i % 3) + i * 5) % 23);
      if (glyph === 'rocks' || glyph === 'icicle') y = ((frame * 3 + i * 7) % 24) - 14;
      if (glyph === 'darts' || glyph === 'lances') {
        x = ((frame * 4 + i * 9) % 42) - 20;
        y = -8 + i * 3;
      }
      ctx.fillRect(Math.round(x), Math.round(y), i % 3 === 0 ? 3 : 2, i % 2 ? 1 : 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawGroundInstance(ctx, instance) {
    var colors = palette(instance);
    var progress = phaseProgress(instance);
    ctx.save();
    ctx.translate(instance.x, instance.y);
    ctx.rotate(instance.orientation || 0);

    if (instance.awareness === 'concealed' && instance.phase === 'dormant') {
      if (instance.clueVisible) clue(ctx, instance, colors);
      ctx.restore();
      return;
    }

    if (instance.phase === 'dormant') {
      ditherField(ctx, instance, colors.clue, 0.28, false);
      ctx.strokeStyle = colors.dormant;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 4]);
      pathShape(ctx, instance, 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      clue(ctx, instance, colors);
    } else if (instance.phase === 'warning') {
      ditherField(ctx, instance, progress > .72 ? colors.danger : colors.warning, .34 + progress * .18, progress > .72);
      warningMarkers(ctx, instance, colors, progress);
    } else if (instance.phase === 'active') {
      ditherField(ctx, instance, colors.danger, .62, true);
      warningMarkers(ctx, instance, colors, 1);
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 2;
      pathShape(ctx, instance, 1); ctx.stroke();
    } else if (instance.phase === 'cooldown') {
      residue(ctx, instance, colors);
      ditherField(ctx, instance, colors.cooldown, .2, false);
    }
    ctx.restore();
  }

  function warningLabel(ctx, instance, colors, progress) {
    var presentation = instance.profile.presentation || {};
    var name = Game.i18n && presentation.nameKey ? Game.i18n.t(presentation.nameKey) : '';
    var remain = Math.max(0, (instance.warningEndTick - tick(instance)) * 0.05);
    var label = instance.previewCompact ? remain.toFixed(1) + 's' :
      (name ? name + '  ' + remain.toFixed(1) + 's' : remain.toFixed(1) + 's');
    var width = Math.round(Math.max(50, Math.min(116, label.length * 6 + 25)));
    if (width % 2) width++;
    var y = -dimensions(instance).height / 2 - 19;
    var edge = progress > 0.72 ? colors.active : colors.warning;
    ctx.save();
    ctx.rotate(-(instance.orientation || 0));
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = colors.ink;
    ctx.fillRect(-width / 2 + 2, y - 7, width, 14);
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(-width / 2, y - 9, width, 14);
    ctx.fillStyle = edge;
    ctx.fillRect(-width / 2 + 2, y - 7, width - 4, 10);
    ctx.fillStyle = '#302823';
    ctx.fillRect(-width / 2 + 3, y - 6, width - 6, 8);
    ctx.fillStyle = colors.danger;
    ctx.fillRect(-width / 2 + 5, y - 6, 9, 8);
    ctx.fillStyle = colors.active;
    ctx.font = '8px "Fusion Pixel", "Microsoft YaHei", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', -width / 2 + 9, y - 2);
    ctx.fillStyle = edge;
    ctx.fillText(label, 6, y - 2);
    ctx.fillStyle = colors.ink;
    ctx.fillRect(-width / 2, y - 9, 3, 3); ctx.fillRect(width / 2 - 3, y - 9, 3, 3);
    ctx.fillRect(-width / 2, y + 2, 3, 3); ctx.fillRect(width / 2 - 3, y + 2, 3, 3);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function hitBurst(ctx, instance, colors) {
    var pulse = animated(instance) ? Math.floor((Math.sin(tick(instance) * 1.7) + 1) * 2) : 2;
    ctx.globalAlpha = 0.94;
    pixelSpark(ctx, 0, -5, 8 + pulse, colors.active);
    pixelDiamond(ctx, 0, -5, 5 + pulse, colors.danger);
    pixelDiamond(ctx, 0, -5, 2, colors.highlight);
    ctx.fillStyle = colors.element;
    ctx.fillRect(-14 - pulse, -12, 4, 3); ctx.fillRect(11 + pulse, -12, 4, 3);
    ctx.fillRect(-12 - pulse, 3, 3, 4); ctx.fillRect(10 + pulse, 3, 3, 4);
    ctx.globalAlpha = 1;
  }

  function drawOverlayInstance(ctx, instance) {
    if (instance.awareness === 'concealed' && instance.phase === 'dormant') return;
    var colors = palette(instance);
    var progress = phaseProgress(instance);
    ctx.save();
    ctx.translate(instance.x, instance.y);
    ctx.rotate(instance.orientation || 0);

    if (instance.phase === 'dormant') {
      mechanism(ctx, instance, colors, 0.74, 0);
    } else if (instance.phase === 'warning') {
      mechanism(ctx, instance, colors, 0.88, progress > 0.72 ? 1 : 0);
      warningLabel(ctx, instance, colors, progress);
    } else if (instance.phase === 'active') {
      mechanism(ctx, instance, colors, 1, 1);
      activeDebris(ctx, instance, colors);
    }
    if (instance.hitUntilTick >= tick(instance)) hitBurst(ctx, instance, colors);
    ctx.restore();
  }

  function visible(instance, left, top, right, bottom) {
    return !instance.disabled && instance.x >= left - 100 && instance.x <= right + 100 &&
      instance.y >= top - 100 && instance.y <= bottom + 100;
  }

  function visit(ctx, left, top, right, bottom, drawer) {
    if (!Game.hazards) return;
    Game.hazards.all().forEach(function (instance) {
      if (visible(instance, left, top, right, bottom)) drawer(ctx, instance);
    });
  }

  Game.hazardRender = {
    drawGround: function (ctx, left, top, right, bottom) {
      visit(ctx, left, top, right, bottom, drawGroundInstance);
    },
    drawOverlay: function (ctx, left, top, right, bottom) {
      visit(ctx, left, top, right, bottom, drawOverlayInstance);
    },
    /* Legacy bridge for tests and integrations created before the two-layer renderer. */
    draw: function (ctx, left, top, right, bottom) {
      this.drawGround(ctx, left, top, right, bottom);
      this.drawOverlay(ctx, left, top, right, bottom);
    },
    drawPreview: function (ctx, profile, options) {
      options = options || {};
      var instance = {
        id: 'hazard:preview',
        profileId: profile.id || options.profileId || '',
        profile: profile,
        visual: profile.visual || options.visual || {},
        x: options.x || 0,
        y: options.y || 0,
        orientation: options.orientation || 0,
        awareness: options.awareness || 'revealed',
        clueVisible: options.clueVisible !== false,
        phase: options.phase || 'dormant',
        phaseSinceTick: 0,
        warningEndTick: 20,
        hitUntilTick: options.hit ? 12 : -1,
        previewTick: options.tick == null ? 10 : options.tick,
        previewProgress: options.progress,
        previewStatic: options.static !== false,
        previewCompact: !!options.compact
      };
      drawGroundInstance(ctx, instance);
      drawOverlayInstance(ctx, instance);
    }
  };

  Game.bus.on('hazard:hit', function (event) {
    if (!Game.fx || !Game.state.settings.effects) return;
    var hits = event.targetActorIds || [];
    hits.forEach(function (actorId) {
      var actor = Game.actors.get(actorId);
      if (actor) Game.fx.hitSpark(actor.x, actor.y - Math.max(8, actor.spriteH * 0.5), false);
    });
    if (hits.length && Game.fx.shake) Game.fx.shake(Math.min(3, 1 + hits.length), 0.18);
  });
})();
