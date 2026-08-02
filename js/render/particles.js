/* ============================================================
 * render/particles.js — 环境粒子 + 地形触发粒子（数据驱动）
 * 每区域专属氛围（飘絮/落叶/尘埃/磷火/飘雪/火星/流云/瘴气）；
 * 材质 → 脚步反馈映射为配置，新增材质零引擎改动；
 * 设置面板一键开关（低端设备）。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var AMBIENT_CAP = 80;
  var BURST_CAP = 70;

  var ambient = [];   // 长驻氛围粒子
  var bursts = [];    // 触发式短命粒子
  var enabled = true;
  var regionType = 'meadow';
  var world = { w: 900, h: 520 };
  var spawnAcc = 0;
  var ambientScale = 1;

  /* ---------- 氛围粒子配置表 ---------- */
  var AMBIENT_DEFS = {
    meadow: {
      rate: 6,
      make: function (p, night) {
        if (night > 0.5 && U.chance(0.45)) {
          // 流萤
          p.type = 'firefly'; p.x = U.rand(0, world.w); p.y = U.rand(90, world.h);
          p.vx = U.rand(-6, 6); p.vy = U.rand(-4, 4);
          p.life = U.rand(4, 8); p.size = 1; p.color = '#d8f080';
        } else {
          p.type = 'fleck'; p.x = U.rand(0, world.w); p.y = U.rand(60, world.h);
          p.vx = U.rand(8, 20); p.vy = U.rand(-3, 3);
          p.life = U.rand(4, 7); p.size = 1; p.color = '#e8f0d0';
        }
      }
    },
    leaves: {
      rate: 7,
      make: function (p) {
        p.type = 'leaf'; p.x = U.rand(0, world.w); p.y = U.rand(0, world.h * 0.4);
        p.vx = U.rand(-14, -4); p.vy = U.rand(9, 18);
        p.life = U.rand(5, 9); p.size = 2;
        p.color = U.chance(0.6) ? '#5f9a48' : '#9a7838';
        p.phase = U.rand(0, 6.28);
      }
    },
    dust: {
      rate: 5,
      make: function (p) {
        p.type = 'mote'; p.x = U.rand(0, world.w); p.y = U.rand(80, world.h);
        p.vx = U.rand(-4, 4); p.vy = U.rand(-3, -1);
        p.life = U.rand(5, 9); p.size = 1; p.color = '#c8b088';
      }
    },
    wisps: {
      rate: 4,
      make: function (p) {
        p.type = 'wisp'; p.x = U.rand(0, world.w); p.y = U.rand(140, world.h);
        p.vx = U.rand(-5, 5); p.vy = U.rand(-9, -4);
        p.life = U.rand(4, 7); p.size = 2; p.color = U.chance(0.7) ? '#7af0a8' : '#7ac8f0';
        p.phase = U.rand(0, 6.28);
      }
    },
    snow: {
      rate: 16,
      make: function (p) {
        p.type = 'snow'; p.x = U.rand(-40, world.w); p.y = U.rand(-20, world.h * 0.3);
        p.vx = U.rand(4, 14); p.vy = U.rand(14, 26);
        p.life = U.rand(8, 14); p.size = U.chance(0.3) ? 2 : 1; p.color = '#ffffff';
        p.phase = U.rand(0, 6.28);
      }
    },
    embers: {
      rate: 9,
      make: function (p) {
        // 优先从熔岩格上升
        var T = Game.terrain || { lavaCells: [], gw: 1 };
        if (T.lavaCells && T.lavaCells.length && U.chance(0.7)) {
          var idx = T.lavaCells[U.randInt(0, T.lavaCells.length - 1)];
          p.x = (idx % T.gw) * 8 + 4; p.y = ((idx / T.gw) | 0) * 8 + 4;
        } else { p.x = U.rand(0, world.w); p.y = U.rand(world.h * 0.5, world.h); }
        p.type = 'ember';
        p.vx = U.rand(-6, 6); p.vy = U.rand(-30, -16);
        p.life = U.rand(1.6, 3.2); p.size = 1;
        p.color = U.chance(0.5) ? '#f8d060' : '#f08838';
      }
    },
    cloudwisp: {
      rate: 3,
      make: function (p) {
        p.type = 'cloud'; p.x = U.rand(-80, world.w); p.y = U.rand(60, world.h);
        p.vx = U.rand(46, 90); p.vy = 0;
        p.life = U.rand(6, 10); p.size = U.randInt(14, 30); p.color = '#ffffff';
      }
    },
    miasma: {
      rate: 6,
      make: function (p) {
        if (U.chance(0.4)) {
          p.type = 'cloud'; p.x = U.rand(-60, world.w); p.y = U.rand(100, world.h);
          p.vx = U.rand(6, 16); p.vy = U.rand(-2, 2);
          p.life = U.rand(6, 10); p.size = U.randInt(10, 22); p.color = '#8a5ac0';
        } else {
          p.type = 'wisp'; p.x = U.rand(0, world.w); p.y = U.rand(120, world.h);
          p.vx = U.rand(-4, 4); p.vy = U.rand(-8, -3);
          p.life = U.rand(3, 6); p.size = 1; p.color = '#b070e0';
          p.phase = U.rand(0, 6.28);
        }
      }
    }
  };

  /* ---------- 材质 → 脚步反馈映射（数据配置） ---------- */
  var STEP_FX = {
    grass: function (x, y, ent) {
      Game.terrain.disturbNear(x, y, 12);
      for (var i = 0; i < 2; i++) {
        burst({ x: x + U.rand(-4, 4), y: y - U.rand(0, 3), vx: U.rand(-12, 12), vy: U.rand(-22, -8), life: 0.5, size: 1, color: U.chance(0.7) ? '#8ad06a' : '#e8f0d0', grav: 60 });
      }
    },
    snow: function (x, y, ent) {
      footprint(x, y, ent, 'snow');
      burst({ x: x, y: y - 2, vx: U.rand(-8, 8), vy: -14, life: 0.4, size: 1, color: '#ffffff', grav: 50 });
    },
    sand: function (x, y, ent) {
      footprint(x, y, ent, 'sand');
      burst({ x: x, y: y - 2, vx: U.rand(-10, 10), vy: -10, life: 0.45, size: 1, color: '#d8c090', grav: 40 });
    },
    water: function (x, y, ent) {
      Game.terrain.addDecal({ type: 'ripple', x: x, y: y, life: 0.9 });
      for (var i = 0; i < 2; i++) {
        burst({ x: x + U.rand(-3, 3), y: y - 2, vx: U.rand(-16, 16), vy: U.rand(-30, -14), life: 0.5, size: 1, color: '#bfe4ff', grav: 130 });
      }
    },
    lava: function (x, y) {
      for (var i = 0; i < 3; i++) {
        burst({ x: x + U.rand(-4, 4), y: y - 2, vx: U.rand(-14, 14), vy: U.rand(-40, -18), life: 0.6, size: 1, color: U.chance(0.5) ? '#f8d060' : '#f07030', grav: 60 });
      }
    },
    dirt: function (x, y) {
      burst({ x: x, y: y - 1, vx: U.rand(-8, 8), vy: -8, life: 0.4, size: 1, color: '#b09468', grav: 30 });
    },
    stone: function (x, y) {
      if (U.chance(0.4)) burst({ x: x, y: y - 1, vx: U.rand(-6, 6), vy: -6, life: 0.3, size: 1, color: '#b8b8c0', grav: 30 });
    },
    miasma: function (x, y) {
      burst({ x: x, y: y - 2, vx: U.rand(-6, 6), vy: U.rand(-14, -6), life: 0.8, size: 2, color: '#a060e0', fade: true });
    }
  };

  function footprint(x, y, ent, mat) {
    ent.stepSide = !ent.stepSide;
    var horiz = ent.dir === 'l' || ent.dir === 'r';
    var ox = horiz ? 0 : (ent.stepSide ? 3 : -3);
    var oy = horiz ? (ent.stepSide ? 2 : -2) : 0;
    Game.terrain.addDecal({ type: 'footprint', x: x + ox, y: y + oy, life: 4, mat: mat, horiz: horiz });
  }

  function burst(p) {
    if (!enabled) return;
    if (bursts.length >= BURST_CAP) bursts.shift();
    p.t = 0;
    bursts.push(p);
  }

  function drawParticleItem(ctx, q, isBurst) {
    if (isBurst) {
      var burstAlpha = 1 - q.t / q.life;
      ctx.globalAlpha = q.fade ? burstAlpha * 0.5 : burstAlpha;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x, q.y, q.size, q.size);
      return;
    }
    var a = Math.min(1, 2 * (1 - q.t / q.life));
    if (q.type === 'cloud') {
      ctx.globalAlpha = a * 0.16;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, q.size, q.size * 0.4, 0, 0, 6.29);
      ctx.fill();
    } else if (q.type === 'firefly') {
      var tw = 0.5 + 0.5 * Math.sin(q.t * 6);
      ctx.globalAlpha = a * tw;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x, q.y, 2, 2);
      ctx.globalAlpha = a * tw * 0.3;
      ctx.fillRect(q.x - 1, q.y - 1, 4, 4);
    } else {
      ctx.globalAlpha = a * (q.type === 'wisp' ? 0.8 : 0.7);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x, q.y, q.size, q.size);
    }
  }

  function previewStep(ctx, material, time, width, height) {
    var colors = {
      grass: '#8ad06a', snow: '#ffffff', sand: '#d8c090', water: '#bfe4ff',
      lava: '#f07030', dirt: '#b09468', stone: '#b8b8c0', miasma: '#a060e0'
    };
    var color = colors[material] || '#d2b866';
    for (var i = 0; i < 8; i++) {
      var phase = (time * 1.8 + i * 0.17) % 1;
      var x = width * (0.25 + (i % 4) * 0.17) + Math.sin(time * 2 + i) * 3;
      var y = height * 0.66 - phase * 18 + (i % 2) * 3;
      ctx.globalAlpha = 1 - phase;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), material === 'lava' ? 2 : 1, material === 'water' ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }

  var Pt = Game.particles = {
    catalog: function () {
      var out = [];
      Object.keys(AMBIENT_DEFS).forEach(function (id) {
        out.push({ id: 'ambient:' + id, kind: 'ambient', particle: id, sourceRefs: ['Game.particles.update'] });
      });
      Object.keys(STEP_FX).forEach(function (id) {
        out.push({ id: 'step:' + id, kind: 'step', material: id, sourceRefs: ['Game.particles.step'] });
      });
      out.push({ id: 'campfire', kind: 'campfire', sourceRefs: ['Game.particles.campfire'] });
      return out;
    },
    previewInfo: function (id) {
      var value = String(id || '');
      if (value.indexOf('ambient:') === 0 && AMBIENT_DEFS[value.slice(8)]) return { mode: 'production', duration: 6 };
      if (value.indexOf('step:') === 0 && STEP_FX[value.slice(5)]) return { mode: 'adapted', duration: 1 };
      if (value === 'campfire') return { mode: 'adapted', duration: 2 };
      return { mode: 'catalog', duration: 1 };
    },
    preview: function (ctx, id, time) {
      if (!ctx) return { mode: 'catalog' };
      var value = String(id || '');
      var info = this.previewInfo(value);
      var width = ctx.canvas && ctx.canvas.width || 96;
      var height = ctx.canvas && ctx.canvas.height || 96;
      var phase = ((Number(time) || 0) % info.duration + info.duration) % info.duration;
      ctx.save();
      try {
        if (value.indexOf('ambient:') === 0 && AMBIENT_DEFS[value.slice(8)]) {
          var previousWorld = world;
          world = { w: width, h: height };
          try {
            var def = AMBIENT_DEFS[value.slice(8)];
            for (var i = 0; i < 9; i++) {
              var particle = { t: 0 };
              def.make(particle, 0.7);
              particle.x = Number.isFinite(particle.x) ? particle.x : width * 0.5;
              particle.y = Number.isFinite(particle.y) ? particle.y : height * 0.5;
              particle.t = (phase + i * 0.37) % Math.max(0.1, particle.life || 1);
              drawParticleItem(ctx, particle);
            }
          } finally {
            world = previousWorld;
          }
        } else if (value.indexOf('step:') === 0 && STEP_FX[value.slice(5)]) {
          previewStep(ctx, value.slice(5), phase, width, height);
        } else if (value === 'campfire') {
          for (var ember = 0; ember < 8; ember++) {
            drawParticleItem(ctx, {
              type: 'ember', x: width * 0.5 + Math.sin(ember * 2.4) * 8,
              y: height * 0.74 - (phase * 18 + ember * 3) % 22,
              t: (phase + ember * 0.13) % 1, life: 1,
              size: ember % 4 === 0 ? 2 : 1, color: ember % 2 ? '#f08838' : '#f8d060'
            });
          }
          ctx.fillStyle = 'rgba(154,154,166,0.45)';
          ctx.fillRect(Math.round(width * 0.5) - 1, Math.round(height * 0.57 - phase * 8), 2, 4);
        }
      } finally {
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      return info;
    },
    setEnabled: function (f) { enabled = !!f; if (!f) { ambient.length = 0; bursts.length = 0; } },
    isEnabled: function () { return enabled; },
    setAmbientScale: function (value) {
      ambientScale = Number.isFinite(value) ? U.clamp(value, 0, 1) : 1;
      var keep = Math.floor(AMBIENT_CAP * ambientScale);
      if (ambient.length > keep) ambient.splice(0, ambient.length - keep);
    },

    initRegion: function (region) {
      regionType = region.particles;
      world = region.world;
      ambient.length = 0;
      bursts.length = 0;
      spawnAcc = 0;
    },

    step: function (mat, x, y, ent) {
      if (!enabled) return;
      var fn = STEP_FX[mat];
      if (fn) fn(x, y, ent);
    },

    /** 篝火粒子（火星 + 轻烟），由渲染器每帧驱动 */
    campfire: function (dt, x, y, resting) {
      if (!enabled) return;
      var rate = resting ? 14 : 8;
      if (U.chance(rate * dt)) {
        burst({ x: x + U.rand(-3, 3), y: y - 6, vx: U.rand(-5, 5), vy: U.rand(-34, -20), life: U.rand(0.5, 1.1), size: 1, color: U.chance(0.6) ? '#f8d060' : '#f08838', grav: -6 });
      }
      if (U.chance(3 * dt)) {
        burst({ x: x + U.rand(-2, 2), y: y - 10, vx: U.rand(-3, 3), vy: U.rand(-14, -8), life: U.rand(1.2, 2), size: 2, color: '#9a9aa6', fade: true });
      }
    },

    update: function (dt) {
      if (!enabled) return;
      var def = AMBIENT_DEFS[regionType];
      var night = Game.daynight ? Game.daynight.nightFactor() : 0;
      if (def) {
        spawnAcc += def.rate * ambientScale * dt;
        while (spawnAcc >= 1 && ambient.length < AMBIENT_CAP * ambientScale) {
          spawnAcc -= 1;
          var p = { t: 0 };
          def.make(p, night);
          ambient.push(p);
        }
        if (spawnAcc > 4) spawnAcc = 4;
      }
      var i, q;
      for (i = ambient.length - 1; i >= 0; i--) {
        q = ambient[i];
        q.t += dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.type === 'leaf' || q.type === 'snow') q.x += Math.sin(q.t * 3 + q.phase) * 12 * dt;
        if (q.type === 'wisp') q.x += Math.sin(q.t * 2 + q.phase) * 8 * dt;
        if (q.type === 'firefly') {
          q.vx += U.rand(-20, 20) * dt; q.vy += U.rand(-20, 20) * dt;
          q.vx = U.clamp(q.vx, -14, 14); q.vy = U.clamp(q.vy, -10, 10);
        }
        if (q.t >= q.life || q.x < -60 || q.x > world.w + 60 || q.y > world.h + 30 || q.y < -60) {
          ambient.splice(i, 1);
        }
      }
      for (i = bursts.length - 1; i >= 0; i--) {
        q = bursts[i];
        q.t += dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.grav) q.vy += q.grav * dt;
        if (q.t >= q.life) bursts.splice(i, 1);
      }
    },

    /** 世界空间绘制（实体之上） */
    draw: function (ctx) {
      if (!enabled) return;
      var i, q;
      for (i = 0; i < ambient.length; i++) {
        q = ambient[i];
        drawParticleItem(ctx, q, false);
      }
      for (i = 0; i < bursts.length; i++) {
        q = bursts[i];
        drawParticleItem(ctx, q, true);
      }
      ctx.globalAlpha = 1;
    }
  };
})();
