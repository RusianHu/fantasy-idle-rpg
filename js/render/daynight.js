/* ============================================================
 * render/daynight.js — 全局日夜循环（纯氛围层，不影响数值）
 * 游戏内时钟驱动：黎明→白昼→黄昏→夜晚平滑过渡；
 * 夜晚出现星空与月亮（绘制于天空远景层）。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  // 关键帧：{t, 色调, 透明度, 夜晚系数}
  var STOPS = [
    { t: 0.00, c: [255, 150, 80], a: 0.20, n: 0.35 },  // 黎明
    { t: 0.10, c: [255, 210, 130], a: 0.06, n: 0.05 },
    { t: 0.42, c: [255, 255, 255], a: 0.00, n: 0.00 }, // 白昼
    { t: 0.52, c: [255, 140, 70], a: 0.16, n: 0.10 },  // 黄昏
    { t: 0.62, c: [50, 60, 130], a: 0.30, n: 0.75 },
    { t: 0.90, c: [24, 32, 90], a: 0.36, n: 1.00 },    // 深夜
    { t: 1.00, c: [255, 150, 80], a: 0.20, n: 0.35 }
  ];

  var stars = null;

  function sample() {
    var dayLen = Game.F.BAL.dayLength;
    var t = (Game.state ? Game.state.world.worldTime : 300) % dayLen / dayLen;
    var i = 0;
    while (i < STOPS.length - 1 && STOPS[i + 1].t < t) i++;
    var a = STOPS[i], b = STOPS[Math.min(i + 1, STOPS.length - 1)];
    var k = (t - a.t) / Math.max(0.0001, b.t - a.t);
    return {
      t: t,
      r: U.lerp(a.c[0], b.c[0], k),
      g: U.lerp(a.c[1], b.c[1], k),
      b: U.lerp(a.c[2], b.c[2], k),
      a: U.lerp(a.a, b.a, k),
      n: U.lerp(a.n, b.n, k)
    };
  }

  var DN = Game.daynight = {
    nightFactor: function (options) {
      var visibility = options && Number.isFinite(options.celestialVisibility)
        ? U.clamp(options.celestialVisibility, 0, 1) : 1;
      return sample().n * visibility;
    },
    phase: function () { return sample().t; },

    /** 天空层：星星 + 月亮（在视差层之前、天空渐变之后绘制，屏幕空间） */
    drawSky: function (ctx, cam, cw, ch, options) {
      var s = sample();
      var visibility = options && Number.isFinite(options.celestialVisibility)
        ? U.clamp(options.celestialVisibility, 0, 1) : 1;
      s.n *= visibility;
      if (s.n <= 0.05) return;
      if (!stars) {
        stars = [];
        var rng = U.seededRng(20260725);
        for (var i = 0; i < 60; i++) {
          stars.push({ x: rng(), y: rng() * 0.5, tw: rng() * 6.28, s: rng() < 0.2 ? 2 : 1 });
        }
      }
      var t = Game.terrain.time;
      for (var j = 0; j < stars.length; j++) {
        var st = stars[j];
        var sx = ((st.x * cw * 1.4 - cam.x * 0.06) % (cw + 20) + cw + 20) % (cw + 20) - 10;
        var sy = st.y * ch * 0.9;
        var tw = 0.55 + 0.45 * Math.sin(t * 2 + st.tw);
        ctx.globalAlpha = s.n * tw * 0.9;
        ctx.fillStyle = '#e8f0ff';
        ctx.fillRect(sx, sy, st.s, st.s);
      }
      // 月亮
      var mx = cw * 0.78 - cam.x * 0.04;
      var my = ch * 0.16;
      ctx.globalAlpha = s.n;
      ctx.fillStyle = '#f0ecd8';
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, 6.29);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,196,170,0.7)';
      ctx.fillRect(mx - 3, my - 2, 3, 2);
      ctx.fillRect(mx + 2, my + 3, 2, 2);
      ctx.globalAlpha = s.n * 0.18;
      ctx.beginPath();
      ctx.arc(mx, my, 14, 0, 6.29);
      ctx.fill();
      ctx.globalAlpha = 1;
    },

    /** 全屏色调覆盖层（世界之上、UI 之下） */
    drawTint: function (ctx, cw, ch, options) {
      var s = sample();
      var influence = options && Number.isFinite(options.tintInfluence)
        ? U.clamp(options.tintInfluence, 0, 1) : 1;
      s.a *= influence;
      if (s.a <= 0.005) return;
      ctx.fillStyle = 'rgba(' + (s.r | 0) + ',' + (s.g | 0) + ',' + (s.b | 0) + ',' + s.a.toFixed(3) + ')';
      ctx.fillRect(0, 0, cw, ch);
    }
  };
})();
