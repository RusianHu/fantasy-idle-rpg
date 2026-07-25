/* ============================================================
 * sprites/flora.js — 高规格植被与装饰
 * 大型树木采用「程序化树冠」生成：多阶明暗色块簇 + 受光高光 +
 * 自动描边 + 树冠摇曳帧；小件仍用像素网格。全部确定性种子生成。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, P = Game.PAL, A = Game.assets;
  var D = A.defineSprite;
  var OUT = '#16122b';

  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d', { willReadFrequently: true });
    return c;
  }

  /** 像素圆（无抗锯齿的整像素填充） */
  function pxCircle(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    var r2 = r * r;
    for (var y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (var x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** 透明邻接描边（基于 alpha 通道） */
  function outlinePass(c) {
    var ctx = c.getContext('2d');
    var img = ctx.getImageData(0, 0, c.width, c.height);
    var d = img.data, w = c.width, h = c.height;
    var solid = new Uint8Array(w * h);
    var i, x, y;
    for (i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 10 ? 1 : 0;
    ctx.fillStyle = OUT;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (solid[y * w + x]) continue;
        var near = (x > 0 && solid[y * w + x - 1]) || (x < w - 1 && solid[y * w + x + 1]) ||
          (y > 0 && solid[(y - 1) * w + x]) || (y < h - 1 && solid[(y + 1) * w + x]);
        if (near) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** 树冠摇曳帧：顶部 55% 右移 1px */
  function swayTop(src) {
    var c = mk(src.width, src.height);
    var ctx = c.getContext('2d');
    var cut = Math.floor(src.height * 0.55);
    ctx.drawImage(src, 0, 0, src.width, cut, 1, 0, src.width, cut);
    ctx.drawImage(src, 0, cut, src.width, src.height - cut, 0, cut, src.width, src.height - cut);
    return c;
  }

  /* ---------------- 阔叶树生成器 ---------------- */
  function broadleaf(id, opts) {
    var w = opts.w, h = opts.h;
    var rng = U.seededRng(U.strSeed(id));
    var c = mk(w, h);
    var ctx = c.getContext('2d');
    var pal = opts.pal;

    // 树干（底部居中，右侧暗面）
    var tw = opts.trunkW || 4;
    var tx = Math.floor(w / 2 - tw / 2);
    var th = opts.trunkH || Math.floor(h * 0.32);
    ctx.fillStyle = pal.trunk;
    ctx.fillRect(tx, h - th, tw, th);
    ctx.fillStyle = pal.trunkD;
    ctx.fillRect(tx + tw - 1, h - th, 1, th);
    // 根部外扩
    ctx.fillRect(tx - 1, h - 2, 1, 2);
    ctx.fillStyle = pal.trunk;
    ctx.fillRect(tx + tw, h - 2, 1, 2);
    if (opts.birch) {
      ctx.fillStyle = pal.trunkD;
      for (var bi = 0; bi < th; bi += 3) ctx.fillRect(tx + (bi % 2), h - th + bi, 2, 1);
    }

    // 树冠：多个色块簇（深→中→亮分层，光源左上）
    var cy = h * (opts.canopyY || 0.34);
    var cx = w / 2;
    var blobs = [];
    var n = opts.blobs || 5;
    for (var i = 0; i < n; i++) {
      blobs.push({
        x: cx + (rng() - 0.5) * w * 0.55,
        y: cy + (rng() - 0.5) * h * 0.3,
        r: (opts.rMin || 4) + rng() * ((opts.rMax || 7) - (opts.rMin || 4))
      });
    }
    blobs.push({ x: cx, y: cy, r: (opts.rMax || 7) });
    var b, j;
    for (j = 0; j < blobs.length; j++) { b = blobs[j]; pxCircle(ctx, b.x + 1, b.y + 1.2, b.r, pal.deep); }
    for (j = 0; j < blobs.length; j++) { b = blobs[j]; pxCircle(ctx, b.x, b.y, b.r * 0.93, pal.dark); }
    for (j = 0; j < blobs.length; j++) { b = blobs[j]; pxCircle(ctx, b.x - 0.6, b.y - 0.8, b.r * 0.72, pal.mid); }
    for (j = 0; j < blobs.length; j++) { b = blobs[j]; pxCircle(ctx, b.x - 1.2, b.y - 1.6, b.r * 0.42, pal.light); }

    // 顶部受光碎点（整图快照一次采样）
    var snap = ctx.getImageData(0, 0, w, h).data;
    ctx.fillStyle = pal.light;
    for (var s = 0; s < w * 0.9; s++) {
      var sx2 = (rng() * w) | 0;
      var sy2 = (cy - h * 0.12 + rng() * h * 0.2) | 0;
      if (sx2 < 0 || sy2 < 0 || sx2 >= w || sy2 >= h) continue;
      if (snap[(sy2 * w + sx2) * 4 + 3] > 10 && rng() < 0.5) ctx.fillRect(sx2, sy2, 1, 1);
    }
    // 果实/花点
    if (opts.dots) {
      ctx.fillStyle = opts.dots;
      for (var f = 0; f < (opts.dotN || 6); f++) {
        var fx = cx + (rng() - 0.5) * w * 0.6, fy = cy + (rng() - 0.5) * h * 0.28;
        ctx.fillRect(fx | 0, fy | 0, 1, 1);
      }
    }

    outlinePass(c);
    A.defineCanvas(id, {
      frames: { idle0: c, idle1: swayTop(c) },
      anchor: { x: Math.floor(w / 2), y: h - 1 }
    });
  }

  /* ---------------- 针叶树生成器（可积雪） ---------------- */
  function pine(id, opts) {
    var w = opts.w, h = opts.h;
    var c = mk(w, h);
    var ctx = c.getContext('2d');
    var pal = opts.pal;
    var tiers = opts.tiers || 4;
    var th = opts.trunkH || 5;
    var cx = Math.floor(w / 2);

    ctx.fillStyle = pal.trunk;
    ctx.fillRect(cx - 1, h - th, 3, th);
    ctx.fillStyle = pal.trunkD;
    ctx.fillRect(cx + 1, h - th, 1, th);

    var topY = 1;
    var bottomY = h - th - 1;
    var t, y;
    for (t = tiers - 1; t >= 0; t--) {
      var y0 = topY + (bottomY - topY) * t / tiers;
      var y1 = topY + (bottomY - topY) * (t + 1) / tiers + 2;
      var halfBase = (w / 2 - 1) * (0.45 + 0.55 * (t + 1) / tiers);
      for (y = Math.floor(y0); y <= Math.min(bottomY + 1, Math.floor(y1)); y++) {
        var k = (y - y0) / Math.max(1, y1 - y0);
        var half = Math.max(1, Math.round(halfBase * k));
        ctx.fillStyle = pal.dark;
        ctx.fillRect(cx - half, y, half * 2 + 1, 1);
        ctx.fillStyle = pal.mid;
        ctx.fillRect(cx - half, y, Math.max(1, half), 1);
        if (opts.snow && k < 0.45) {
          ctx.fillStyle = pal.snow;
          ctx.fillRect(cx - half, y, half * 2 + 1, 1);
        }
      }
    }
    if (opts.snow) { ctx.fillStyle = pal.snow; ctx.fillRect(cx, 0, 1, 2); }

    outlinePass(c);
    A.defineCanvas(id, {
      frames: { idle0: c, idle1: swayTop(c) },
      anchor: { x: cx, y: h - 1 }
    });
  }

  /* ================= 程序化大树 ================= */
  // 草原橡树
  broadleaf('flora_oak_big', {
    w: 24, h: 27, blobs: 6, rMin: 4.5, rMax: 7, trunkW: 4, trunkH: 9,
    pal: { light: '#9ade6f', mid: '#6fbe52', dark: '#4a9440', deep: '#33702e', trunk: '#7a5230', trunkD: '#59391f' }
  });
  broadleaf('flora_oak_small', {
    w: 17, h: 19, blobs: 4, rMin: 3.2, rMax: 5, trunkW: 3, trunkH: 6,
    pal: { light: '#9ade6f', mid: '#6fbe52', dark: '#4a9440', deep: '#33702e', trunk: '#7a5230', trunkD: '#59391f' }
  });
  // 迷雾森林巨树（更暗更密）
  broadleaf('flora_tree_forest', {
    w: 26, h: 31, blobs: 7, rMin: 5, rMax: 8, trunkW: 5, trunkH: 11, canopyY: 0.32,
    pal: { light: '#6fae5a', mid: '#4c8a42', dark: '#356b32', deep: '#234c24', trunk: '#66451f', trunkD: '#4a3016' }
  });
  // 桦树（白干黑纹、亮冠）
  broadleaf('flora_birch', {
    w: 16, h: 25, blobs: 4, rMin: 3, rMax: 4.6, trunkW: 3, trunkH: 10, birch: true, canopyY: 0.3,
    pal: { light: '#c8e88a', mid: '#96cc62', dark: '#68a44a', deep: '#487c38', trunk: '#e8e4d8', trunkD: '#5a5a52' }
  });
  // 樱色花树（草原点缀）
  broadleaf('flora_blossom', {
    w: 20, h: 23, blobs: 5, rMin: 3.6, rMax: 6, trunkW: 3, trunkH: 8, dots: '#ffd8e8', dotN: 10,
    pal: { light: '#f0a8c8', mid: '#d878a8', dark: '#b05888', deep: '#8a3f6a', trunk: '#7a5230', trunkD: '#59391f' }
  });
  // 雪松（大/中，积雪）
  pine('flora_pine_big', {
    w: 21, h: 30, tiers: 4, trunkH: 6, snow: true,
    pal: { mid: '#4c8a5c', dark: '#2f6b44', snow: '#eef6fa', trunk: '#59391f', trunkD: '#3f2a16' }
  });
  pine('flora_pine_mid', {
    w: 15, h: 21, tiers: 3, trunkH: 5, snow: true,
    pal: { mid: '#4c8a5c', dark: '#2f6b44', snow: '#eef6fa', trunk: '#59391f', trunkD: '#3f2a16' }
  });
  // 魔王城黑冠树
  broadleaf('flora_dark_tree', {
    w: 20, h: 25, blobs: 5, rMin: 3.6, rMax: 6,
    pal: { light: '#8a56c0', mid: '#5f3a8a', dark: '#43265f', deep: '#2c1840', trunk: '#3a3348', trunkD: '#241f38' }
  });

  /* ================= 网格小件 ================= */

  // 蕨类
  D({
    id: 'flora_fern',
    pal: { a: '#5fae4a', b: '#3f8236', c: '#7fce6a' },
    anchor: { x: 6, y: 8 },
    frames: {
      idle0: [
        'c....a....c..',
        '.b..aba..b...',
        '.ab.aba.ba...',
        '..babbbab....',
        '...babab.....',
        '....bbb......',
        '....bb.......',
        '....b........',
        '.............'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'sway' } }
  });

  // 浆果丛
  D({
    id: 'flora_bush_berry',
    pal: { a: '#6fbe52', b: '#4a9440', c: '#33702e', r: '#e05060', w: '#ffd0d8' },
    anchor: { x: 6, y: 8 },
    frames: {
      idle0: [
        '...aabba.....',
        '..abbbbba....',
        '.abrabbbba...',
        'aabbbarbbba..',
        'abbrbbbbrba..',
        'bbbbbarbbbb..',
        '.cbbbbbbbc...',
        '..ccbbbcc....',
        '.............'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'sway' } }
  });

  // 花丛（基底：白花；换色变体见下）
  D({
    id: 'flora_flowers',
    pal: { g: '#5fae4a', G: '#3f8236', f: '#f4f4f4', c: '#f8e060' },
    anchor: { x: 5, y: 6 },
    frames: {
      idle0: [
        '.f...c...f.',
        'gfg.gcg.gfg',
        '.g...g...g.',
        'g.f.....f.g',
        '.gfg...gfg.',
        '..g..g..g..',
        '...........'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'sway' } }
  });
  D({ id: 'flora_flowers_pink', variantOf: 'flora_flowers', pal: { g: '#5fae4a', G: '#3f8236', f: '#f0a0c8', c: '#f8e060' } });
  D({ id: 'flora_flowers_blue', variantOf: 'flora_flowers', pal: { g: '#4c8a5c', G: '#2f6b44', f: '#8ab8f0', c: '#f4f4f4' } });

  // 碎石
  D({
    id: 'flora_pebbles',
    pal: { a: P.stoneLight, b: P.stone, c: P.stoneDark },
    anchor: { x: 5, y: 4 },
    frames: {
      idle0: [
        '.ab...ba..',
        'abbc.abbc.',
        '.cc..bcc..',
        '...ab.....',
        '...cc.....'
      ]
    }
  });

  // 树桩
  D({
    id: 'flora_stump',
    pal: { a: '#c8a878', b: '#9a7848', c: '#6b4c26', d: '#59391f' },
    anchor: { x: 5, y: 7 },
    frames: {
      idle0: [
        '.aaaaaaa..',
        'abababbba.',
        'abbaabbba.',
        'cbbbbbbbc.',
        'cbbbbbbbc.',
        'cbbbbbbbc.',
        '.ddcccdd..',
        '..........'
      ]
    }
  });

  // 荧光菇（大簇，发光）
  D({
    id: 'flora_shroom_glow',
    pal: { a: '#7ae0d8', b: '#3fb8b0', c: '#26807c', d: P.bone, D: P.boneShade },
    anchor: { x: 5, y: 8 },
    frames: {
      idle0: [
        '..aaaa.....',
        '.abbbba.a..',
        'abbabba.ba.',
        '.cbbbc.aba.',
        '..dd...cbc.',
        '..dd....d..',
        '..Dd....d..',
        '.dDDd..dDd.',
        '...........'
      ]
    }
  });

  // 大水晶簇（矿坑，发光）
  D({
    id: 'flora_crystal_big',
    pal: { a: '#c8f4fa', b: '#78d0e8', c: '#3f98c0', d: '#256088', e: '#16405c' },
    anchor: { x: 7, y: 15 },
    frames: {
      idle0: [
        '.....a.........',
        '....aab...a....',
        '....abb..aab...',
        '...aabbb.abb...',
        '...abbbb.abbc..',
        '..aabbbc.bbcc..',
        '..abbbcc.bcc...',
        '..abbcccbbcc...',
        '.abbbccbbbcc...',
        '.abbcccbbccc...',
        '.bbccc.bbccd...',
        '.bccd..bccd....',
        '.ccdd..ccdd....',
        '..cdde.cdde....',
        '..ddee.ddee....',
        '...............'
      ]
    }
  });

  // 矿坑支撑木架
  D({
    id: 'flora_beam',
    pal: { d: '#8a6238', D: '#66451f', c: '#4a3016' },
    anchor: { x: 9, y: 15 },
    frames: {
      idle0: [
        'dddddddddddddddddd',
        'DdddddddddddddddDc',
        '.dd............dd.',
        '.dD............dD.',
        '.dd............dd.',
        '.dD............dD.',
        '.dd............dd.',
        '.dD............dD.',
        '.dd............dd.',
        '.dD............dD.',
        '.dd............dd.',
        '.dD............dD.',
        '.dd............dd.',
        '.dD............dD.',
        'cddc..........cddc',
        '..................'
      ]
    }
  });

  // 大岩块
  D({
    id: 'flora_rocks_big',
    pal: { a: P.stoneLight, b: P.stone, c: P.stoneDark, d: '#4c4c58' },
    anchor: { x: 8, y: 10 },
    frames: {
      idle0: [
        '.....abb........',
        '...aabbbb..ab...',
        '..abbbbbbbabbb..',
        '.abbbbbcbbbbbb..',
        'abbbbbbbcbbbbcb.',
        'abbbcbbbbbccbcb.',
        'bbbccbbcbbbccc..',
        'bccccbbccbcccd..',
        'ccccdcccccccdd..',
        '.cdd..ccdd.dd...',
        '................'
      ]
    }
  });

  // 亡灵墓地：巨枯树
  D({
    id: 'flora_deadtree_big',
    pal: { d: '#6b5a50', D: '#463a32', c: '#2c241e' },
    anchor: { x: 10, y: 25 },
    frames: {
      idle0: [
        'D.....d.........D...',
        '.D....d........D....',
        '..D...dd......D.....',
        '..DD...dd....D......',
        '...DD..dd..DD.......',
        '....DD.dd.DD........',
        '.....DDddDD.........',
        '..D...Dddd..........',
        '...DD..ddd..........',
        '....DDddd...........',
        '......ddd...........',
        '......ddD...........',
        '.....ddd.D..........',
        '.....ddd..D.........',
        '.....ddd............',
        '....dddd............',
        '....dddD............',
        '....ddd.............',
        '...cddd.............',
        '...cdddc............',
        '...cdddc............',
        '..ccdddcc...........',
        '..cdddddc...........',
        '.ccDDdDDcc..........',
        'ccc.....ccc.........',
        '....................'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'sway' } }
  });

  // 十字墓碑
  D({
    id: 'flora_grave_cross',
    pal: { a: '#a8a8b4', b: '#7c7c8c', c: '#54545f', g: '#4f7a3f' },
    anchor: { x: 5, y: 11 },
    frames: {
      idle0: [
        '....ab.....',
        '....ab.....',
        '..aaabbb...',
        '..aababb...',
        '....ab.....',
        '....ab.....',
        '....ab.....',
        '....ac.....',
        '....ac.....',
        '.g.aabc.g..',
        'ggaabbccgg.',
        '...........'
      ]
    }
  });

  // 烛火（发光，闪烁）
  D({
    id: 'flora_candle',
    pal: { w: '#f0ece0', W: '#c8c2b0', f: '#f8e060', o: '#f09030' },
    anchor: { x: 3, y: 7 },
    frames: {
      idle0: [
        '...f...',
        '..ff...',
        '..of...',
        '..ww...',
        '..wW...',
        '..ww...',
        '.wwWw..',
        '.......'
      ],
      idle1: [
        '..f....',
        '..ff...',
        '..fo...',
        '..ww...',
        '..wW...',
        '..ww...',
        '.wwWw..',
        '.......'
      ]
    }
  });

  // 骸骨堆
  D({
    id: 'flora_skulls',
    pal: { a: P.bone, b: P.boneShade, e: '#2c2418' },
    anchor: { x: 5, y: 6 },
    frames: {
      idle0: [
        '..aaa......',
        '.aaaaa.ab..',
        '.aeaea.aa..',
        '.aaaaaabab.',
        '..aba.abba.',
        '.b.ab.b.ab.',
        '...........'
      ]
    }
  });

  // 冰晶（雪山，发光）
  D({
    id: 'flora_ice_shard',
    pal: { a: '#e8f8fc', b: '#a8e0f0', c: '#5aa8cc', d: '#2f6f96' },
    anchor: { x: 6, y: 13 },
    frames: {
      idle0: [
        '.....a.......',
        '....aab......',
        '....abb..a...',
        '...aabbb.ab..',
        '...abbbb.bb..',
        '..aabbbc.bc..',
        '..abbbcc.bc..',
        '..abbccc.cc..',
        '.abbbcc.bcc..',
        '.bbccc..ccd..',
        '.bccd...cd...',
        '..cdd...cd...',
        '..ddd..ddd...',
        '.............'
      ]
    }
  });

  // 雪堆
  D({
    id: 'flora_snow_mound',
    pal: { a: '#f4fafc', b: '#dce8f0', c: '#b8ccd8' },
    anchor: { x: 6, y: 5 },
    frames: {
      idle0: [
        '....aaaa.....',
        '..aaaaaaaa...',
        '.aaaaaaaaaa..',
        'aaabaaaabaaa.',
        'bbbbbbbbbbbc.',
        '.............'
      ]
    }
  });

  // 黑曜石尖柱（熔岩）
  D({
    id: 'flora_obsidian',
    pal: { a: '#5c5468', b: '#3c3648', c: '#28222f', f: '#f09030' },
    anchor: { x: 8, y: 19 },
    frames: {
      idle0: [
        '......ab........',
        '......abb.......',
        '.....aabb.......',
        '.....abbb..b....',
        '....aabbbc.bb...',
        '....abbbbc.ab...',
        '....abbbcc.abb..',
        '...aabbbcc.abb..',
        '...abbbbccabbc..',
        '...abbbcccabbc..',
        '..aabbfccc.bbc..',
        '..abbbccc..bcc..',
        '..abbbccc..bcc..',
        '.aabbcccc.abcc..',
        '.abbbccc..abbcc.',
        '.abbcccc..bbccc.',
        'aabbccc...bbccc.',
        'abbcccc..abbccc.',
        'ccccccc..ccccccc',
        '................'
      ]
    }
  });

  // 焦木桩
  D({
    id: 'flora_char_stump',
    pal: { a: '#5c4638', b: '#3c2a20', c: '#241812', f: '#f09030' },
    anchor: { x: 5, y: 7 },
    frames: {
      idle0: [
        '.a..ab....',
        '.ab.ab.b..',
        '.abfab.ab.',
        'aabbabbab.',
        'abbbbbbba.',
        'cbbbbbbbc.',
        '.ccbbbcc..',
        '..........'
      ]
    }
  });

  // 浮空遗迹：大石柱 / 断柱 / 悬浮水晶
  D({
    id: 'flora_pillar_big',
    pal: { a: '#e0e0ea', b: '#b0b0c0', c: '#787888', v: '#78e0d8' },
    anchor: { x: 6, y: 25 },
    frames: {
      idle0: [
        'aaaaaaaaaab..',
        'abbbbbbbbc...',
        '.abbbbbbc....',
        '.abbvbbbc....',
        '.abbbbbbc....',
        '.abbbbvbc....',
        '.abbbbbbc....',
        '..abbbbc.....',
        '..abbbbc.....',
        '.abbbbbbc....',
        '.abbbbbbc....',
        '.abbvbbbc....',
        '.abbbbbbc....',
        '.abbbbbbc....',
        '.abbbbvbc....',
        '.abbbbbbc....',
        '..abbbbc.....',
        '..abbbbc.....',
        '.abbbbbbc....',
        '.abbbbbbc....',
        '.abbbbbbc....',
        '.abbbbbbc....',
        'aaaaaaaaaab..',
        'abbbbbbbbbc..',
        'bbbbbbbbbbc..',
        '.............'
      ]
    }
  });
  D({
    id: 'flora_pillar_broken',
    pal: { a: '#e0e0ea', b: '#b0b0c0', c: '#787888', v: '#78e0d8' },
    anchor: { x: 6, y: 13 },
    frames: {
      idle0: [
        '..ab.b.......',
        '.abbbbb.b....',
        '.abbbbbbc....',
        '.abbvbbbc....',
        '.abbbbbbc....',
        '..abbbbc.....',
        '..abbbbc.....',
        '.abbbbbbc....',
        '.abbbbvbc....',
        '.abbbbbbc....',
        'aaaaaaaaaab..',
        'abbbbbbbbbc..',
        'bbbbbbbbbbc..',
        '.............'
      ]
    }
  });
  D({
    id: 'flora_float_crystal',
    pal: { a: '#d8f8f4', b: '#8ae8dc', c: '#48b8b0', d: '#2a807c' },
    anchor: { x: 5, y: 11 },
    frames: {
      idle0: [
        '....a......',
        '...aab.....',
        '..aabbb....',
        '..abbbc....',
        '.aabbbcc...',
        '.abbbccc...',
        '.abbbccc...',
        '..bbccc....',
        '..bccc.....',
        '...ccd.....',
        '....d......',
        '...........'
      ]
    }
  });

  // 魔王城：魂灯 / 尖刺栅栏
  D({
    id: 'flora_lantern',
    pal: { m: '#3c3c50', M: '#28283a', v: '#b070e0', V: '#8a48c8', y: '#c8a040' },
    anchor: { x: 4, y: 12 },
    frames: {
      idle0: [
        '...y.....',
        '..mym....',
        '.mmmmm...',
        '.mvvvm...',
        '.mvVvm...',
        '.mvvvm...',
        '.mmmmm...',
        '..mMm....',
        '...m.....',
        '...m.....',
        '..mMm....',
        '.mmMmm...',
        '.........'
      ],
      idle1: [
        '...y.....',
        '..mym....',
        '.mmmmm...',
        '.mVvVm...',
        '.mvvvm...',
        '.mVvVm...',
        '.mmmmm...',
        '..mMm....',
        '...m.....',
        '...m.....',
        '..mMm....',
        '.mmMmm...',
        '.........'
      ]
    }
  });
  D({
    id: 'flora_spikes',
    pal: { m: '#4c4c60', M: '#32323f', c: '#1e1e28' },
    anchor: { x: 7, y: 8 },
    frames: {
      idle0: [
        '.m...m...m....',
        '.mm..mm..mm...',
        '.mM..mM..mM...',
        'mmmmmmmmmmmm..',
        '.mM..mM..mM...',
        '.mM..mM..mM...',
        'MmmMMmmMMmmM..',
        'cc.cc.cc.cc...',
        '..............'
      ]
    }
  });

  // 睡莲（水面点缀）
  D({
    id: 'flora_lily',
    pal: { a: '#6fbe52', b: '#4a9440', f: '#f0a0c8' },
    anchor: { x: 4, y: 3 },
    frames: {
      idle0: [
        '.aaaf....',
        'aabaa.a..',
        'abbba.ba.',
        '.aaa..a..',
        '.........'
      ]
    }
  });
})();
