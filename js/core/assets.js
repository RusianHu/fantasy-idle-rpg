/* ============================================================
 * core/assets.js — 资产清单与像素精灵工厂
 *
 * 素材以「像素网格字符画 + 调色板」的形式存放于 js/sprites/（assets 数据层），
 * 启动后按需编译为 offscreen canvas；渲染永远保持锐利（整数像素）。
 * - 自动描边：不透明像素外圈自动生成深色轮廓（16-bit 观感的关键）
 * - 帧合成：squash（压缩呼吸帧）/ bob（位移帧）/ flip（镜像）
 * - 白闪缓存：受击闪白用剪影叠加
 * - 占位降级：任何缺失的精灵 ID 自动落到「色块 + 首字母」，不白屏
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var defs = {};    // id -> 定义
  var order = [];   // 注册顺序；图鉴与审计不得依赖对象键排序
  var built = {};   // id -> { frames: {name: canvas}, white: {name: canvas}, w, h, anchor }
  var OUTLINE = '#16122b';

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function remember(id) {
    if (order.indexOf(id) < 0) order.push(id);
  }

  /** 字符网格 -> canvas（含 1px 外扩自动描边） */
  function gridToCanvas(rows, pal, noOutline) {
    var gh = rows.length, gw = 0, y, x;
    for (y = 0; y < gh; y++) gw = Math.max(gw, rows[y].length);
    var w = gw + 2, h = gh + 2;
    var c = makeCanvas(w, h);
    var ctx = c.getContext('2d');
    var solid = [];
    for (y = 0; y < gh; y++) {
      solid.push([]);
      var row = rows[y];
      for (x = 0; x < gw; x++) {
        var ch = row[x] || '.';
        if (ch === '.' || ch === ' ') { solid[y].push(false); continue; }
        var col = pal[ch];
        if (!col) { solid[y].push(false); continue; }
        ctx.fillStyle = col;
        ctx.fillRect(x + 1, y + 1, 1, 1);
        solid[y].push(true);
      }
    }
    if (!noOutline) {
      ctx.fillStyle = OUTLINE;
      for (y = -1; y <= gh; y++) {
        for (x = -1; x <= gw; x++) {
          var here = y >= 0 && y < gh && solid[y][x];
          if (here) continue;
          var near =
            (y > 0 && x >= 0 && x < gw && solid[y - 1][x]) ||
            (y < gh - 1 && y + 1 >= 0 && x >= 0 && x < gw && solid[y + 1][x]) ||
            (x > 0 && y >= 0 && y < gh && solid[y][x - 1]) ||
            (x < gw - 1 && y >= 0 && y < gh && solid[y][x + 1]);
          if (near) ctx.fillRect(x + 1, y + 1, 1, 1);
        }
      }
    }
    return c;
  }

  function flipCanvas(src) {
    var c = makeCanvas(src.width, src.height);
    var ctx = c.getContext('2d');
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
    return c;
  }

  /** 垂直压缩 1px（底部对齐）——呼吸/待机第二帧 */
  function squashCanvas(src) {
    var c = makeCanvas(src.width, src.height);
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var cut = Math.floor(src.height * 0.35);
    // 上半部分下移 1px，下半部分保持 —— 产生「蹲伏呼吸」效果
    ctx.drawImage(src, 0, 0, src.width, cut, 0, 1, src.width, cut);
    ctx.drawImage(src, 0, cut, src.width, src.height - cut, 0, cut, src.width, src.height - cut);
    return c;
  }

  function bobCanvas(src, dy) {
    var c = makeCanvas(src.width, src.height);
    var ctx = c.getContext('2d');
    ctx.drawImage(src, 0, dy);
    return c;
  }

  /** 树冠摇曳帧：顶部 55% 右移 1px（底部固定，风吹树梢） */
  function swayCanvas(src) {
    var c = makeCanvas(src.width, src.height);
    var ctx = c.getContext('2d');
    var cut = Math.floor(src.height * 0.55);
    ctx.drawImage(src, 0, 0, src.width, cut, 1, 0, src.width, cut);
    ctx.drawImage(src, 0, cut, src.width, src.height - cut, 0, cut, src.width, src.height - cut);
    return c;
  }

  function whiteOf(src) {
    var c = makeCanvas(src.width, src.height);
    var ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function buildSprite(id) {
    var d = defs[id];
    if (!d) return null;
    var frames = {}, name;
    var srcDef = d;
    // variantOf：复用其它精灵的网格，仅替换调色板（如 冰狼=灰狼 换色）
    if (d.variantOf && defs[d.variantOf]) {
      srcDef = defs[d.variantOf];
    }
    var pal = d.pal || srcDef.pal;
    for (name in srcDef.frames) {
      frames[name] = gridToCanvas(srcDef.frames[name], pal, d.noOutline);
    }
    var derive = d.derive || srcDef.derive || {};
    for (name in derive) {
      var op = derive[name];
      var from = frames[op.from];
      if (!from) continue;
      if (op.op === 'squash') frames[name] = squashCanvas(from);
      else if (op.op === 'bob') frames[name] = bobCanvas(from, op.dy || 1);
      else if (op.op === 'sway') frames[name] = swayCanvas(from);
      else if (op.op === 'flip') frames[name] = flipCanvas(from);
    }
    // 通用规则：任何 *_r* 帧自动生成对应 *_l* 镜像帧
    for (name in frames) {
      if (name.indexOf('_r') >= 0) {
        var lname = name.replace('_r', '_l');
        if (!frames[lname]) frames[lname] = flipCanvas(frames[name]);
      }
    }
    var first = frames[Object.keys(frames)[0]];
    var anchor = d.anchor || srcDef.anchor || { x: Math.floor(first.width / 2), y: first.height - 1 };
    var b = built[id] = {
      id: id,
      frames: frames,
      white: {},
      w: first.width,
      h: first.height,
      anchor: { x: anchor.x + 1, y: anchor.y + 1 }, // 补偿描边外扩 1px
      source: d.source || srcDef.source || null,
      variantOf: d.variantOf || null,
      motion: d.motion || srcDef.motion || null
    };
    return b;
  }

  function placeholder(id) {
    var c = makeCanvas(18, 18);
    var ctx = c.getContext('2d');
    var seed = U.strSeed(id);
    var hue = seed % 360;
    ctx.fillStyle = 'hsl(' + hue + ',45%,40%)';
    ctx.fillRect(1, 1, 16, 16);
    ctx.strokeStyle = '#16122b';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 16, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((id[0] || '?').toUpperCase(), 9, 10);
    return {
      id: id,
      frames: { idle0: c },
      white: {},
      w: 18, h: 18,
      anchor: { x: 9, y: 17 },
      isPlaceholder: true
    };
  }

  var A = Game.assets = {
    defineSprite: function (d) {
      if (!d || !d.id) return;
      remember(d.id);
      defs[d.id] = d;
    },

    /** 直接注册已绘制画布帧（程序化植被等）；anchor 为画布坐标 */
    defineCanvas: function (id, obj) {
      remember(id);
      var first = obj.frames[Object.keys(obj.frames)[0]];
      built[id] = {
        id: id,
        frames: obj.frames,
        white: {},
        w: first.width, h: first.height,
        anchor: obj.anchor || { x: Math.floor(first.width / 2), y: first.height - 1 },
        source: obj.source || null,
        variantOf: obj.variantOf || null,
        motion: obj.motion || null
      };
    },

    sprite: function (id) {
      var b = built[id];
      if (b) return b;
      if (defs[id]) return buildSprite(id);
      console.warn('[Assets] 缺失精灵，使用占位：', id);
      return (built[id] = placeholder(id));
    },

    /** 精灵 ID 是否已注册（不触发占位降级与告警） */
    has: function (id) {
      return !!(built[id] || defs[id]);
    },

    frame: function (id, name) {
      var s = A.sprite(id);
      return s.frames[name] || s.frames.idle0 || s.frames[Object.keys(s.frames)[0]];
    },

    hasFrame: function (id, name) {
      var s = A.sprite(id);
      return !!s.frames[name];
    },

    /** 所有注册精灵的稳定 ID；不会触发缺失精灵占位。 */
    ids: function () { return order.slice(); },

    /** 只读资产描述，供 QA 图鉴与审计使用。 */
    describe: function (id) {
      if (!A.has(id)) return null;
      var s = A.sprite(id);
      return {
        id: id,
        frameNames: Object.keys(s.frames),
        width: s.w,
        height: s.h,
        anchor: { x: s.anchor.x, y: s.anchor.y },
        source: s.source || null,
        variantOf: s.variantOf || null,
        motion: s.motion || null,
        placeholder: !!s.isPlaceholder
      };
    },

    catalog: function () {
      return order.map(function (id) { return A.describe(id); });
    },

    /**
     * 统一语义动作解析。原生帧优先，随后使用命名约定和安全回退；
     * 结果带 coverage，演示页可明确区分 native / derived / fallback。
     */
    resolveMotion: function (id, request) {
      request = request || {};
      var s = A.sprite(id), frames = s.frames || {};
      var state = request.state || 'idle';
      var dir = request.direction || 'd';
      var reduced = !!request.reducedMotion;
      var time = Number(request.time) || 0;
      var speed = Number(request.speed) || (state === 'move' ? 0.17 : 0.36);
      var phase = reduced ? 0 : Math.max(0, Math.floor(time / speed));
      var requestedNames = [];
      var native = false;
      var derived = false;
      var flip = false;

      function add(name) { if (name && requestedNames.indexOf(name) < 0) requestedNames.push(name); }
      function dirNames(prefix, direction, suffix) {
        suffix = suffix || '';
        add(prefix + '_' + direction + suffix);
        if (direction === 'l') add(prefix + '_r' + suffix);
        if (direction === 'r') add(prefix + '_l' + suffix);
      }
      function findFrame(names) {
        for (var i = 0; i < names.length; i++) {
          if (frames[names[i]]) {
            return names[i];
          }
        }
        return null;
      }

      function chooseNative(names) {
        var frameName = findFrame(names);
        if (frameName) native = true;
        return frameName;
      }

      function chooseDerived(names) {
        var frameName = findFrame(names);
        if (frameName) derived = true;
        return frameName;
      }

      var frame = null;
      if (state === 'sit' || state === 'gather') {
        frame = chooseNative([phase % 2 ? 'sit1' : 'sit0', 'sit0']);
        if (!frame) frame = chooseDerived(['idle_' + dir, 'walk_' + dir + '0', 'idle0']);
        if (dir === 'l' && frame && frame.indexOf('_r') >= 0) flip = true;
      } else if (state === 'move') {
        dirNames('walk', dir, String(phase % 2));
        dirNames('move', dir, String(phase % 2));
        dirNames('walk', dir, '');
        frame = chooseNative(requestedNames);
        if (!frame) frame = chooseDerived([phase % 2 ? 'idle1' : 'idle0', 'idle0']);
      } else if (state === 'attack' || state === 'cast' || state === 'hurt') {
        // Only the requested semantic state counts as native. Reusing an
        // attack pose for cast, or an idle pose for hurt, is derived motion.
        dirNames(state, dir, String(phase % 2));
        dirNames(state, dir, '');
        if (state === 'hurt') {
          dirNames('hit', dir, String(phase % 2));
          dirNames('hit', dir, '');
        }
        frame = chooseNative(requestedNames);
        if (!frame && (state === 'attack' || state === 'cast')) {
          requestedNames.length = 0;
          dirNames('attack', dir, String(phase % 2));
          dirNames('attack', dir, '');
          frame = chooseDerived(requestedNames);
        }
        if (!frame) frame = chooseDerived([phase % 2 ? 'idle1' : 'idle0', 'idle0']);
      } else if (state === 'defeat') {
        frame = chooseNative(['defeat_' + dir, 'dead_' + dir]);
        if (!frame) frame = chooseDerived(['walk_' + dir + '0', 'idle_' + dir, 'idle0', 'idle1']);
      } else {
        dirNames('idle', dir, String(phase % 2));
        dirNames('idle', dir, '');
        frame = chooseNative(requestedNames);
        if (!frame) {
          requestedNames.length = 0;
          dirNames('walk', dir, '0');
          frame = chooseDerived(requestedNames);
        }
        if (!frame) frame = chooseDerived([phase % 2 ? 'idle1' : 'idle0', 'idle0']);
      }

      if (!frame) {
        frame = Object.keys(frames)[0] || 'idle0';
        if (!derived) derived = true;
      }
      // Generic creature sprites are authored facing left. The compiled asset
      // already exposes *_l mirrors for directional frames; only apply a final
      // mirror when the selected frame is the undirected base pose.
      if (frame.indexOf('_r') >= 0 && dir === 'l') flip = true;
      else if (frame.indexOf('_l') >= 0 && dir === 'r') flip = true;
      else if (frame.indexOf('_r') < 0 && frame.indexOf('_l') < 0 && dir === 'r') flip = true;
      if (native && !derived) return { frame: frame, flip: flip, coverage: 'native', state: state, direction: dir };
      return { frame: frame, flip: flip, coverage: derived ? 'derived' : 'fallback', state: state, direction: dir };
    },

    /**
     * 世界坐标绘制（脚底锚点对齐）
     * opts: { flip, alpha, white(0..1), sinkPx, scale }
     */
    draw: function (ctx, id, frameName, x, y, opts) {
      opts = opts || {};
      var s = A.sprite(id);
      var f = s.frames[frameName] || s.frames.idle0 || s.frames[Object.keys(s.frames)[0]];
      if (!f) return;
      var anchorX = s.anchor.x;
      if (opts.flip) {
        var b = built[id];
        if (!b._mirror) b._mirror = {};
        if (!b._mirror[frameName]) b._mirror[frameName] = flipCanvas(f);
        f = b._mirror[frameName];
        anchorX = f.width - s.anchor.x;
      }
      var sc = opts.scale || 1;
      var sink = opts.sinkPx || 0;
      var dx = Math.round(x - anchorX * sc);
      var dy = Math.round(y - s.anchor.y * sc);
      var sh = f.height - sink;
      if (sh <= 0) return;
      if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
      ctx.drawImage(f, 0, 0, f.width, sh, dx, dy, Math.round(f.width * sc), Math.round(sh * sc));
      if (opts.white) {
        var key = (opts.flip ? 'M:' : '') + frameName;
        var s2 = built[id];
        if (!s2.white[key]) s2.white[key] = whiteOf(f);
        ctx.globalAlpha = (opts.alpha !== undefined ? opts.alpha : 1) * opts.white;
        ctx.drawImage(s2.white[key], 0, 0, f.width, sh, dx, dy, Math.round(f.width * sc), Math.round(sh * sc));
      }
      if (opts.alpha !== undefined || opts.white) ctx.globalAlpha = 1;
    },

    /** 将某帧绘制到 DOM canvas（背包图标等），整数倍缩放居中 */
    drawToDom: function (canvasEl, id, frameName) {
      var f = A.frame(id, frameName || 'icon');
      var ctx = canvasEl.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      var k = Math.max(1, Math.floor(Math.min(canvasEl.width / f.width, canvasEl.height / f.height)));
      var w = f.width * k, h = f.height * k;
      ctx.drawImage(f, Math.floor((canvasEl.width - w) / 2), Math.floor((canvasEl.height - h) / 2), w, h);
    },

    /** 光晕纹理：径向渐变预渲染并按 (color, r) 缓存，运行时仅 drawImage */
    glowTex: (function () {
      var cache = {};
      return function (color, r) {
        var key = color + '_' + r;
        if (cache[key]) return cache[key];
        var c = makeCanvas(r * 2, r * 2);
        var ctx = c.getContext('2d');
        var g = ctx.createRadialGradient(r, r, 1, r, r, r);
        g.addColorStop(0, color);
        g.addColorStop(0.5, color.length === 7 ? color + '66' : color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, r * 2, r * 2);
        return (cache[key] = c);
      };
    })(),

    OUTLINE: OUTLINE
  };
})();
