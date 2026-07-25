/* ============================================================
 * render/effects.js — 特效：伤害飘字 / 受击火花 / 技能特效 /
 * 死亡烟雾 / Zzz 气泡 / 震屏 / Boss 横幅
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var floats = [];   // 飘字（世界空间）
  var shapes = [];   // 简单形状特效
  var shake = { p: 0, t: 0, d: 0 };
  var bannerEl = null;

  var FX = Game.fx = {
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

    /** 世界空间：形状特效 */
    drawShapes: function (ctx) {
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
        } else if (s.kind === 'zzz') {
          var zk = s.t / s.life;
          ctx.globalAlpha = zk < 0.8 ? 1 - zk * 0.6 : (1 - zk) * 2;
          ctx.fillStyle = '#cfe0ff';
          ctx.font = 'bold 7px monospace';
          ctx.fillText('z', s.x + zk * 8, s.y - zk * 14);
          if (zk > 0.3) ctx.fillText('z', s.x + 3 + zk * 8, s.y - 4 - zk * 14);
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
