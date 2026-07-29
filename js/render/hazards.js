/* Render-only Hazard mechanism layer. Logic and hit tests live in systems/hazards.js. */
(function () {
  'use strict';
  var Game = window.Game;

  function palette(instance) {
    var visual = instance.visual || {};
    return Object.assign({
      clue: '#7b715b',
      dormant: '#d6b35f',
      warning: '#e7a93c',
      danger: '#d9544d',
      active: '#fff1c2',
      cooldown: '#6d7078',
      element: '#9bd3e4'
    }, visual.palette || {});
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

  function pathShape(ctx, instance, inset) {
    var trigger = instance.profile.trigger;
    var size = dimensions(instance);
    inset = inset || 0;
    ctx.beginPath();
    if (trigger.shape === 'circle') {
      ctx.arc(0, 0, Math.max(2, size.radius - inset), 0, Math.PI * 2);
    } else if (trigger.shape === 'cone') {
      var length = Math.max(3, size.length - inset);
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, length, -size.angle / 2, size.angle / 2);
      ctx.closePath();
    } else {
      ctx.rect(-size.width / 2 + inset, -size.height / 2 + inset,
        Math.max(2, size.width - inset * 2), Math.max(2, size.height - inset * 2));
    }
  }

  function mechanism(ctx, instance, colors, alpha) {
    var visual = instance.visual || {};
    var glyph = visual.glyph || 'mark';
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colors.element;
    ctx.fillStyle = colors.element;
    ctx.lineWidth = 1;
    if (glyph === 'spikes') {
      for (var s = -6; s <= 6; s += 4) {
        ctx.beginPath(); ctx.moveTo(s, 4); ctx.lineTo(s + 2, -5); ctx.lineTo(s + 4, 4); ctx.stroke();
      }
    } else if (glyph === 'darts') {
      for (var d = -4; d <= 4; d += 4) {
        ctx.fillRect(-9, d, 5, 1);
        ctx.beginPath(); ctx.moveTo(-4, d - 2); ctx.lineTo(0, d); ctx.lineTo(-4, d + 2); ctx.stroke();
      }
    } else if (glyph === 'rocks') {
      ctx.fillRect(-6, -2, 5, 5); ctx.fillRect(1, -6, 6, 6); ctx.fillRect(0, 2, 4, 4);
    } else if (glyph === 'seal') {
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(0, -6); ctx.lineTo(6, 3); ctx.closePath(); ctx.stroke();
    } else if (glyph === 'icicle') {
      ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(-2, 6); ctx.lineTo(1, -7); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -5); ctx.lineTo(5, 7); ctx.lineTo(8, -5); ctx.closePath(); ctx.stroke();
    } else if (glyph === 'flame') {
      ctx.beginPath(); ctx.moveTo(0, 7); ctx.bezierCurveTo(-9, 2, -4, -4, 1, -9);
      ctx.bezierCurveTo(0, -2, 9, 0, 4, 7); ctx.closePath(); ctx.stroke();
    } else if (glyph === 'arc') {
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-4, -4); ctx.lineTo(0, 4);
      ctx.lineTo(4, -4); ctx.lineTo(9, 0); ctx.stroke();
    } else if (glyph === 'lances') {
      for (var l = -5; l <= 5; l += 5) {
        ctx.beginPath(); ctx.moveTo(-10, l); ctx.lineTo(7, l);
        ctx.lineTo(3, l - 2); ctx.moveTo(7, l); ctx.lineTo(3, l + 2); ctx.stroke();
      }
    } else if (glyph === 'ambush') {
      ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-2, 0); ctx.lineTo(-8, 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -5); ctx.lineTo(2, 0); ctx.lineTo(8, 5); ctx.stroke();
    } else {
      ctx.fillRect(-2, -2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function warningMarkers(ctx, instance, colors, progress) {
    var size = dimensions(instance);
    var finalStage = progress >= 0.75;
    ctx.strokeStyle = finalStage ? colors.danger : colors.warning;
    ctx.fillStyle = finalStage ? colors.active : colors.warning;
    ctx.lineWidth = finalStage ? 1.6 : 1.2;
    ctx.setLineDash([4, 3]);
    pathShape(ctx, instance, Math.min(size.radius, size.height / 2) * progress * 0.28);
    ctx.stroke();
    ctx.setLineDash([]);
    if (instance.profile.trigger.shape !== 'circle') {
      var edge = size.width / 2;
      for (var x = -edge + 8; x < edge; x += 12) {
        ctx.beginPath(); ctx.moveTo(x - 3, 0); ctx.lineTo(x + 2, -3); ctx.lineTo(x + 2, 3); ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.beginPath(); ctx.arc(0, 0, Math.max(3, size.radius * (1 - progress * 0.72)), 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawInstance(ctx, instance) {
    var colors = palette(instance);
    var progress = instance.phase === 'warning'
      ? Math.max(0, Math.min(1, (Game.hazards.tick() - instance.phaseSinceTick) /
          Math.max(1, instance.warningEndTick - instance.phaseSinceTick)))
      : 0;
    ctx.save();
    ctx.translate(instance.x, instance.y);
    ctx.rotate(instance.orientation || 0);

    if (instance.awareness === 'concealed' && instance.phase === 'dormant') {
      mechanism(ctx, instance, colors, 0.34);
      ctx.fillStyle = colors.clue;
      ctx.globalAlpha = 0.48;
      ctx.fillRect(-5, 5, 2, 1); ctx.fillRect(3, 6, 3, 1);
      ctx.restore();
      return;
    }

    if (instance.phase === 'dormant') {
      mechanism(ctx, instance, colors, 0.72);
      ctx.strokeStyle = colors.dormant;
      ctx.globalAlpha = 0.42;
      ctx.setLineDash([2, 4]);
      pathShape(ctx, instance, 1);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (instance.phase === 'warning') {
      ctx.fillStyle = colors.warning;
      ctx.globalAlpha = 0.08 + progress * 0.12;
      pathShape(ctx, instance, 0); ctx.fill();
      ctx.globalAlpha = 1;
      warningMarkers(ctx, instance, colors, progress);
      mechanism(ctx, instance, colors, 0.9);
    } else if (instance.phase === 'active') {
      ctx.fillStyle = colors.danger;
      ctx.globalAlpha = 0.28;
      pathShape(ctx, instance, 0); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.active;
      ctx.lineWidth = 2;
      pathShape(ctx, instance, 0); ctx.stroke();
      mechanism(ctx, instance, colors, 1);
    } else if (instance.phase === 'cooldown') {
      mechanism(ctx, instance, colors, 0.28);
      ctx.strokeStyle = colors.cooldown;
      ctx.globalAlpha = 0.25;
      pathShape(ctx, instance, 2); ctx.stroke();
    }

    if (instance.hitUntilTick >= Game.hazards.tick()) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = colors.active;
      ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7);
      ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke();
    }
    ctx.restore();
  }

  Game.hazardRender = {
    draw: function (ctx, left, top, right, bottom) {
      if (!Game.hazards) return;
      Game.hazards.all().forEach(function (instance) {
        if (instance.disabled || instance.x < left - 80 || instance.x > right + 80 ||
            instance.y < top - 80 || instance.y > bottom + 80) return;
        drawInstance(ctx, instance);
      });
    }
  };

  Game.bus.on('hazard:hit', function (event) {
    if (!Game.fx || !Game.state.settings.effects) return;
    (event.targetActorIds || []).forEach(function (actorId) {
      var actor = Game.actors.get(actorId);
      if (actor) Game.fx.hitSpark(actor.x, actor.y - Math.max(8, actor.spriteH * 0.5), false);
    });
  });
})();
