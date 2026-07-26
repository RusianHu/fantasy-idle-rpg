/* ============================================================
 * render/effects.js — 特效：伤害飘字 / 受击火花 / 技能特效 /
 * 死亡烟雾 / Zzz 气泡 / 回营传送 / 震屏 / Boss 横幅
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var floats = [];   // 飘字（世界空间）
  var shapes = [];   // 简单形状特效
  var projs = [];    // 弹道（法弹/箭矢）
  var shake = { p: 0, t: 0, d: 0 };
  var bannerEl = null;

  var PROJ_STYLE = {
    bolt: { color: '#b06af0', glow: '#e0c0ff', speed: 240 },
    fire: { color: '#f09030', glow: '#f8e060', speed: 220 },
    arrow: { color: '#a0722f', glow: '#d8c090', speed: 300 }
  };

  function capShapes() {
    if (shapes.length > 150) shapes.splice(0, shapes.length - 150);
  }

  var FX = Game.fx = {
    /* ---------- 弹道 ---------- */
    projectile: function (x, y, target, kind, onHit) {
      var st = PROJ_STYLE[kind] || PROJ_STYLE.bolt;
      projs.push({
        x: x, y: y, target: target, kind: kind,
        speed: st.speed, onHit: onHit, t: 0, trail: []
      });
    },
    /* ---------- 飘字 ---------- */
    floatText: function (x, y, txt, opts) {
      opts = opts || {};
      if (floats.length > 40) floats.shift();
      floats.push({
        x: x, y: y, txt: txt,
        color: opts.color || '#ffffff',
        crit: !!opts.crit, small: !!opts.small,
        t: 0, life: opts.crit ? 1.1 : 0.9,
        vy: opts.crit ? -26 : -22
      });
    },

    /* ---------- 形状特效 ---------- */
    hitSpark: function (x, y, strong) {
      shapes.push({ kind: 'spark', x: x, y: y, t: 0, life: 0.22, strong: strong });
    },
    slash: function (x, y, big) {
      shapes.push({ kind: 'slash', x: x, y: y, t: 0, life: 0.26, big: big });
    },
    ring: function (x, y, r, color) {
      shapes.push({ kind: 'ring', x: x, y: y, r: r, color: color || '#7ad0f0', t: 0, life: 0.4 });
    },
    heal: function (x, y) {
      for (var i = 0; i < 5; i++) {
        shapes.push({ kind: 'healp', x: x + U.rand(-8, 8), y: y + U.rand(-4, 8), t: 0, life: U.rand(0.5, 0.9), vy: U.rand(-26, -14) });
      }
    },
    poof: function (x, y) {
      for (var i = 0; i < 6; i++) {
        shapes.push({ kind: 'poof', x: x + U.rand(-6, 6), y: y + U.rand(-6, 6), t: 0, life: U.rand(0.3, 0.6), vx: U.rand(-20, 20), vy: U.rand(-24, -6), s: U.randInt(2, 4) });
      }
    },
    zzz: function (x, y) {
      shapes.push({ kind: 'zzz', x: x, y: y, t: 0, life: 2.2 });
    },
    teleport: function (x, y, phase) {
      var life = phase === 'out' ? 0.46 : 0.52;
      shapes.push({ kind: 'teleport', x: x, y: y, phase: phase, t: 0, life: life });
      for (var i = 0; i < 12; i++) {
        var angle = i / 12 * Math.PI * 2 + U.rand(-0.18, 0.18);
        var radius = U.rand(5, 18);
        shapes.push({
          kind: 'warpp',
          x: x + Math.cos(angle) * radius,
          y: y - U.rand(0, 24) + Math.sin(angle) * radius * 0.22,
          phase: phase,
          t: 0,
          life: U.rand(0.34, 0.62),
          vx: Math.cos(angle) * U.rand(4, 14),
          vy: phase === 'out' ? U.rand(-34, -18) : U.rand(-22, -8),
          s: U.chance(0.28) ? 2 : 1
        });
      }
    },
    goldBurst: function (x, y) {
      for (var i = 0; i < 7; i++) {
        shapes.push({
          kind: 'coinp',
          x: x + U.rand(-4, 4), y: y + U.rand(-6, 2),
          t: 0, life: U.rand(0.45, 0.75),
          vx: U.rand(-24, 24), vy: U.rand(-34, -16),
          s: U.chance(0.3) ? 2 : 1
        });
      }
      capShapes();
    },

    finaleBurst: function (x, y, phase) {
      var impact = phase === 'impact';
      var count = impact ? 26 : 38;
      if (impact) {
        shapes.push({ kind: 'ring', x: x, y: y + 8, r: 28, color: '#f3d77d', t: 0, life: 0.65 });
        shapes.push({ kind: 'ring', x: x, y: y + 8, r: 18, color: '#ffffff', t: 0, life: 0.42 });
      }
      for (var i = 0; i < count; i++) {
        var angle = impact ? U.rand(0, Math.PI * 2) : U.rand(-Math.PI * 0.88, -Math.PI * 0.12);
        var speed = impact ? U.rand(22, 68) : U.rand(12, 38);
        shapes.push({
          kind: 'finalp',
          x: x + U.rand(-8, 8), y: y + U.rand(-12, 12),
          t: 0, life: U.rand(0.8, impact ? 1.5 : 2.2),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - (impact ? 0 : U.rand(8, 24)),
          s: U.chance(0.28) ? 2 : 1,
          color: impact
            ? (U.chance(0.55) ? '#f3d77d' : '#fff4c0')
            : (U.chance(0.68) ? '#a665d8' : '#e0b8ff')
        });
      }
      capShapes();
    },

    travelBurst: function (x, y, phase) {
      var inward = phase === 'out';
      for (var i = 0; i < 18; i++) {
        var angle = i / 18 * Math.PI * 2 + U.rand(-0.12, 0.12);
        var radius = inward ? U.rand(15, 27) : U.rand(3, 12);
        shapes.push({
          kind: 'travelp',
          x: x + Math.cos(angle) * radius,
          y: y - U.rand(2, 22) + Math.sin(angle) * radius * 0.25,
          t: 0,
          life: U.rand(0.38, 0.72),
          vx: Math.cos(angle) * (inward ? -U.rand(10, 24) : U.rand(12, 28)),
          vy: U.rand(-28, -10),
          color: U.chance(0.55) ? '#92e9ff' : '#f2d57b',
          s: U.chance(0.2) ? 2 : 1
        });
      }
      capShapes();
    },

    soulReturn: function (x, y, phase) {
      var outward = phase === 'out';
      shapes.push({ kind: 'ring', x: x, y: y + 9, r: outward ? 25 : 20, color: '#9ddff0', t: 0, life: 0.72 });
      shapes.push({ kind: 'ring', x: x, y: y + 9, r: outward ? 16 : 12, color: '#dfc8ff', t: 0, life: 0.52 });
      for (var i = 0; i < 24; i++) {
        var angle = U.rand(0, Math.PI * 2);
        var radius = outward ? U.rand(2, 12) : U.rand(16, 30);
        shapes.push({
          kind: 'soulp',
          x: x + Math.cos(angle) * radius,
          y: y + Math.sin(angle) * radius * 0.45,
          t: 0,
          life: U.rand(0.55, 1.05),
          vx: Math.cos(angle) * (outward ? U.rand(-4, 8) : -U.rand(8, 20)),
          vy: outward ? U.rand(-38, -16) : U.rand(-16, -6),
          s: U.chance(0.24) ? 2 : 1
        });
      }
      capShapes();
    },

    revivePulse: function (x, y, step) {
      var color = step >= 3 ? '#fff0a2' : (step === 2 ? '#80e0d3' : '#83b8ee');
      shapes.push({ kind: 'ring', x: x, y: y + 9, r: 18 + step * 5, color: color, t: 0, life: 0.7 });
      for (var i = 0; i < 10 + step * 2; i++) {
        shapes.push({
          kind: 'revivep',
          x: x + U.rand(-15, 15),
          y: y + U.rand(-1, 14),
          t: 0,
          life: U.rand(0.55, 0.95),
          vx: U.rand(-5, 5),
          vy: U.rand(-34, -16),
          color: color,
          s: U.chance(0.18) ? 2 : 1
        });
      }
      capShapes();
    },

    /* ---------- 震屏 ---------- */
    shake: function (power, dur) {
      shake.p = Math.max(shake.p, power);
      shake.t = shake.d = Math.max(shake.t, dur);
    },
    shakeOffset: function () {
      if (shake.t <= 0) return { x: 0, y: 0 };
      var k = shake.t / shake.d;
      var p = shake.p * k;
      return { x: U.rand(-p, p), y: U.rand(-p, p) };
    },

    /* ---------- Boss 横幅（DOM） ---------- */
    banner: function (key, vars) {
      if (!bannerEl) {
        bannerEl = document.createElement('div');
        bannerEl.style.cssText =
          'position:absolute;left:0;right:0;top:34%;text-align:center;z-index:16;' +
          'pointer-events:none;font-size:18px;color:#f0c060;' +
          'text-shadow:2px 2px 0 #000,0 0 12px #a04010;transition:opacity .4s;';
        var wrap = document.getElementById('stage-wrap');
        if (wrap) wrap.appendChild(bannerEl);
      }
      bannerEl.innerHTML = Game.util.esc(Game.i18n.t(key, vars));
      bannerEl.style.opacity = '1';
      clearTimeout(bannerEl._t);
      bannerEl._t = setTimeout(function () { bannerEl.style.opacity = '0'; }, 2100);
    },

    flashScreen: function () {
      var wrap = document.getElementById('stage-wrap');
      if (!wrap) return;
      wrap.classList.remove('flash-red');
      void wrap.offsetWidth;
      wrap.classList.add('flash-red');
    },

    /* ---------- 更新与绘制 ---------- */
    update: function (dt) {
      if (shake.t > 0) shake.t -= dt;
      var i, f;
      // 弹道：追踪目标当前位置，命中时结算；目标死亡则消散
      for (i = projs.length - 1; i >= 0; i--) {
        var p = projs[i];
        p.t += dt;
        var tgt = p.target;
        if (!tgt || tgt.dead || tgt.hp <= 0 || p.t > 2.5) {
          projs.splice(i, 1);
          continue;
        }
        var tx = tgt.x, ty = tgt.y - (tgt.spriteH || 14) * 0.5;
        var dx = tx - p.x, dy = ty - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var step = p.speed * dt;
        p.trail.unshift({ x: p.x, y: p.y });
        if (p.trail.length > 5) p.trail.pop();
        if (dist <= step + 3) {
          projs.splice(i, 1);
          if (p.onHit) p.onHit();
        } else {
          p.vx = dx / dist; p.vy = dy / dist;
          p.x += p.vx * step;
          p.y += p.vy * step;
        }
      }
      for (i = floats.length - 1; i >= 0; i--) {
        f = floats[i];
        f.t += dt;
        f.y += f.vy * dt;
        f.vy *= (1 - 1.6 * dt);
        if (f.t >= f.life) floats.splice(i, 1);
      }
      for (i = shapes.length - 1; i >= 0; i--) {
        f = shapes[i];
        f.t += dt;
        if (f.vx) f.x += f.vx * dt;
        if (f.vy) f.y += f.vy * dt;
        if (f.t >= f.life) shapes.splice(i, 1);
      }
    },

    /** 世界空间：形状特效 + 弹道 */
    drawShapes: function (ctx) {
      // 弹道
      for (var pi = 0; pi < projs.length; pi++) {
        var p = projs[pi];
        var st = PROJ_STYLE[p.kind] || PROJ_STYLE.bolt;
        if (p.kind === 'arrow') {
          var vx = p.vx || 1, vy = p.vy || 0;
          ctx.strokeStyle = st.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x - vx * 4, p.y - vy * 4);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.fillStyle = '#e8ecf4';
          ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
        } else {
          for (var ti = 0; ti < p.trail.length; ti++) {
            ctx.globalAlpha = 0.5 * (1 - ti / p.trail.length);
            ctx.fillStyle = st.color;
            ctx.fillRect(Math.round(p.trail[ti].x) - 1, Math.round(p.trail[ti].y) - 1, 2, 2);
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = st.glow;
          ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
          ctx.fillStyle = st.color;
          ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        }
      }
      for (var i = 0; i < shapes.length; i++) {
        var s = shapes[i];
        var k = 1 - s.t / s.life;
        if (s.kind === 'spark') {
          ctx.strokeStyle = 'rgba(255,240,180,' + k.toFixed(2) + ')';
          ctx.lineWidth = 1;
          var n = s.strong ? 4 : 3;
          for (var j = 0; j < n; j++) {
            var ang = j / n * 6.28 + s.t * 8;
            var r1 = 2 + s.t * 26, r2 = r1 + 4;
            ctx.beginPath();
            ctx.moveTo(s.x + Math.cos(ang) * r1, s.y + Math.sin(ang) * r1);
            ctx.lineTo(s.x + Math.cos(ang) * r2, s.y + Math.sin(ang) * r2);
            ctx.stroke();
          }
        } else if (s.kind === 'slash') {
          ctx.strokeStyle = 'rgba(255,255,255,' + k.toFixed(2) + ')';
          ctx.lineWidth = s.big ? 3 : 2;
          ctx.beginPath();
          var prog = s.t / s.life;
          ctx.arc(s.x, s.y, s.big ? 14 : 10, -0.9 + prog * 1.6, 0.4 + prog * 1.6);
          ctx.stroke();
        } else if (s.kind === 'ring') {
          var rr = s.r * (s.t / s.life);
          ctx.strokeStyle = s.color;
          ctx.globalAlpha = k * 0.8;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, rr, rr * 0.6, 0, 0, 6.29);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (s.kind === 'healp') {
          ctx.fillStyle = 'rgba(126,240,126,' + k.toFixed(2) + ')';
          ctx.fillRect(s.x - 1, s.y, 3, 1);
          ctx.fillRect(s.x, s.y - 1, 1, 3);
        } else if (s.kind === 'poof') {
          ctx.fillStyle = 'rgba(220,220,230,' + (k * 0.8).toFixed(2) + ')';
          ctx.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
        } else if (s.kind === 'coinp') {
          ctx.globalAlpha = Math.max(0, k);
          ctx.fillStyle = '#f3d36b';
          ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s + 1, s.s);
          ctx.fillStyle = '#fff0a0';
          ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
          ctx.globalAlpha = 1;
        } else if (s.kind === 'zzz') {
          var zk = s.t / s.life;
          ctx.globalAlpha = zk < 0.8 ? 1 - zk * 0.6 : (1 - zk) * 2;
          ctx.fillStyle = '#cfe0ff';
          ctx.font = 'bold 7px monospace';
          ctx.fillText('z', s.x + zk * 8, s.y - zk * 14);
          if (zk > 0.3) ctx.fillText('z', s.x + 3 + zk * 8, s.y - 4 - zk * 14);
          ctx.globalAlpha = 1;
        } else if (s.kind === 'teleport') {
          var wp = s.t / s.life;
          var wa = Math.sin(Math.PI * Math.min(1, wp));
          var wr = s.phase === 'out' ? 20 - wp * 8 : 7 + wp * 15;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = wa * 0.9;

          var beam = ctx.createLinearGradient(s.x, s.y - 46, s.x, s.y + 2);
          beam.addColorStop(0, 'rgba(120,218,255,0)');
          beam.addColorStop(0.45, 'rgba(150,226,255,' + (wa * 0.20).toFixed(3) + ')');
          beam.addColorStop(1, 'rgba(246,220,128,0)');
          ctx.fillStyle = beam;
          ctx.fillRect(Math.round(s.x - 6), Math.round(s.y - 46), 12, 48);

          ctx.strokeStyle = '#8ce6ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y + 1, wr, wr * 0.34, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = wa * 0.65;
          ctx.strokeStyle = '#f2d57b';
          ctx.beginPath();
          ctx.ellipse(s.x, s.y + 1, Math.max(3, wr - 5), Math.max(1.5, wr * 0.22), 0, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#d8f6ff';
          for (var wi = 0; wi < 8; wi++) {
            var wang = wi / 8 * Math.PI * 2 + wp * (s.phase === 'out' ? 2.8 : -2.2);
            var wx = s.x + Math.cos(wang) * (wr + 2);
            var wy = s.y + 1 + Math.sin(wang) * (wr * 0.34 + 1);
            ctx.fillRect(Math.round(wx) - 1, Math.round(wy) - 1, 2, 2);
          }
          ctx.restore();
        } else if (s.kind === 'warpp') {
          var pk = 1 - s.t / s.life;
          ctx.globalAlpha = Math.max(0, pk);
          ctx.fillStyle = s.phase === 'out' ? '#a7ecff' : '#f3dc8a';
          ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
          if (s.s > 1) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
          }
          ctx.globalAlpha = 1;
        } else if (s.kind === 'travelp') {
          var tk = 1 - s.t / s.life;
          ctx.globalAlpha = Math.max(0, tk);
          ctx.fillStyle = s.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
          if (s.s > 1 && tk > 0.45) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
          }
          ctx.globalAlpha = 1;
        } else if (s.kind === 'soulp') {
          var sk = 1 - s.t / s.life;
          ctx.globalAlpha = Math.max(0, sk * 0.9);
          ctx.fillStyle = sk > 0.5 ? '#d9f7ff' : '#a79adf';
          ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s + 1);
          ctx.globalAlpha = 1;
        } else if (s.kind === 'revivep') {
          var rk = 1 - s.t / s.life;
          ctx.globalAlpha = Math.max(0, rk);
          ctx.fillStyle = s.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
          ctx.globalAlpha = 1;
        } else if (s.kind === 'finalp') {
          var fk = 1 - s.t / s.life;
          ctx.globalAlpha = Math.max(0, fk);
          ctx.fillStyle = s.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
          if (s.s > 1 && fk > 0.45) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
          }
          ctx.globalAlpha = 1;
        }
      }
    },

    /** 世界空间：飘字（最后绘制，位于色调层之上由渲染器安排） */
    drawFloats: function (ctx, zoom) {
      ctx.textAlign = 'center';
      for (var i = 0; i < floats.length; i++) {
        var f = floats[i];
        var k = 1 - f.t / f.life;
        var size = f.crit ? 9 : (f.small ? 6 : 7);
        ctx.font = 'bold ' + size + 'px ' + (f.crit ? '' : '') + 'monospace';
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = '#16122b';
        ctx.fillText(f.txt, f.x + 1, f.y + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.txt, f.x, f.y);
        if (f.crit) {
          ctx.fillStyle = 'rgba(255,216,90,0.5)';
          ctx.fillText(f.txt, f.x, f.y - 1);
        }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  };
})();
