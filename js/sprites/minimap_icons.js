/* ============================================================
 * sprites/minimap_icons.js - fixed-pixel location marker set
 *
 * The source grids are the asset: each non-empty cell is one painted pixel.
 * A one-pixel dark contour is generated at runtime so the silhouettes remain
 * readable over every region palette and at minimap scale.
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var OUTLINE = '#121425';
  var cache = {};

  var defs = {
    camp: {
      pal: { p: '#77543a', w: '#f0ddae', t: '#c99b5b', s: '#825f45', f: '#e85b32', y: '#ffd36a' },
      rows: [
        '......p......',
        '.....wpw.....',
        '....wtttw....',
        '...wtttttw...',
        '..wttsttttw..',
        '.wtttssttttw.',
        'wttttsstttttw',
        'wttttsssttttw',
        'wwwwwwpwwwwww',
        '.....pp......',
        '.........f...',
        '........fyf..',
        '.......fff...'
      ]
    },
    landmark: {
      pal: { s: '#9e9279', h: '#ded19e', w: '#6e6256', g: '#66885a', r: '#5d493b' },
      rows: [
        '.....hhh.....',
        '....hsssh....',
        '.....sss.....',
        '.....sws.....',
        '.....sws.....',
        '....sssss....',
        '.....sss.....',
        '.....sgs.....',
        '....sssss....',
        '...gsssssg...',
        '..ggsssssgg..',
        '....rrrrr....',
        '.............'
      ]
    },
    resource: {
      pal: { g: '#68ad67', l: '#a7cf72', c: '#4fc4cf', h: '#b9f1e8', b: '#767590' },
      rows: [
        '..........c..',
        '...l.....ccc.',
        '.g.l...chccc.',
        '..gl...ccccc.',
        '...g....ccc..',
        '...g.....c...',
        '..ggg........',
        '.glllg..bbb..',
        '...gg..bbhbb.',
        '.......bbbbb.',
        '........bbb..',
        '.............',
        '.............'
      ]
    },
    curio: {
      pal: { g: '#d8b95e', h: '#fff0a6', v: '#a97bd0', w: '#e4c9f3' },
      rows: [
        '......g......',
        '.....ggg.....',
        '......g......',
        '..v...g...v..',
        '.vvv..g..vvv.',
        '...vvgggvv...',
        'ggggghhgggggg',
        '...vvhggvv...',
        '.vvv..g..vvv.',
        '..v...g...v..',
        '......g......',
        '.....ggg.....',
        '......g......'
      ]
    },
    ecology: {
      pal: { a: '#78cbbf', h: '#c6f1dc' },
      rows: [
        '..h.......h..',
        '.aaa.....aaa.',
        '.aha.....aha.',
        '..a..aaa..a..',
        '.....aha.....',
        '....aaaaa....',
        '...aahaaaa...',
        '...aaaaaaa...',
        '....aaaaa....',
        '.............',
        '..h..........',
        '.aaa.........',
        '..a..........'
      ]
    },
    threat: {
      pal: { r: '#d8554e', h: '#ff9a69', d: '#8c313b' },
      rows: [
        '...h......r..',
        '..rr.....rh..',
        '.rr.....rr...',
        'rr.....rr....',
        '.dr...rh.....',
        '..rr.rr......',
        '...rrr..h....',
        '....d..rr....',
        '......rr.....',
        '.....rh......',
        '....rr.......',
        '...rd........',
        '...d.........'
      ]
    },
    guardian: {
      pal: { i: '#8793a5', h: '#dbe2db', b: '#52667e', g: '#d3af5b', w: '#f7e9ae' },
      rows: [
        '....iihii....',
        '...ihhhhhi...',
        '..ihbbgbbhi..',
        '..ihbbgbbhi..',
        '.ihhiiiiihhi.',
        '.ihibbbbbihi.',
        '.ihibwwwbihi.',
        '..ihbbbbbhi..',
        '...ihhhhhi...',
        '....ihhhi....',
        '.....ihi.....',
        '......i......',
        '.............'
      ]
    },
    lair: {
      pal: { s: '#756878', h: '#a39191', d: '#292337', r: '#d44c47', w: '#f1c36c' },
      rows: [
        '....hhhhh....',
        '...hsssssh...',
        '..hssdddssh..',
        '.hssddddddsh.',
        'hssdddddddssh',
        'hsddddddddddh',
        'ssdddrrrdddss',
        'ssdddwrdwddss',
        'ssdddddddddss',
        'sssdddddddsss',
        '.sssssssssss.',
        '..sss...sss..',
        '.............'
      ]
    },
    hero: {
      pal: { c: '#496a83', h: '#7bb6c6', f: '#e3bf91', w: '#fff3d2', g: '#d7b75c', d: '#694e57' },
      rows: [
        '.....hhh.....',
        '....hccch....',
        '...hccccch...',
        '..hccfffcch..',
        '..hcwffwcch..',
        '..hccdfdcch..',
        '...hccccch...',
        '....hccch....',
        '...ggdddgg...',
        '..gdddddddg..',
        '.gdddddddddg.',
        '...gdddddg...',
        '.............'
      ]
    }
  };

  function dimensions(def) {
    var width = 0;
    for (var i = 0; i < def.rows.length; i++) width = Math.max(width, def.rows[i].length);
    return { w: width, h: def.rows.length };
  }

  function compile(type) {
    if (cache[type]) return cache[type];
    var def = defs[type];
    if (!def || typeof document === 'undefined') return null;
    var size = dimensions(def);
    var canvas = document.createElement('canvas');
    canvas.width = size.w + 2;
    canvas.height = size.h + 2;
    var ctx = canvas.getContext('2d');
    var solid = [];
    var x, y;
    for (y = 0; y < size.h; y++) {
      solid[y] = [];
      for (x = 0; x < size.w; x++) {
        var token = def.rows[y][x] || '.';
        solid[y][x] = !!def.pal[token];
      }
    }
    ctx.fillStyle = OUTLINE;
    for (y = -1; y <= size.h; y++) {
      for (x = -1; x <= size.w; x++) {
        if (y >= 0 && y < size.h && x >= 0 && x < size.w && solid[y][x]) continue;
        var near =
          (y > 0 && x >= 0 && x < size.w && solid[y - 1][x]) ||
          (y < size.h - 1 && x >= 0 && x < size.w && solid[y + 1][x]) ||
          (x > 0 && y >= 0 && y < size.h && solid[y][x - 1]) ||
          (x < size.w - 1 && y >= 0 && y < size.h && solid[y][x + 1]);
        if (near) ctx.fillRect(x + 1, y + 1, 1, 1);
      }
    }
    for (y = 0; y < size.h; y++) {
      for (x = 0; x < size.w; x++) {
        var ch = def.rows[y][x] || '.';
        if (!def.pal[ch]) continue;
        ctx.fillStyle = def.pal[ch];
        ctx.fillRect(x + 1, y + 1, 1, 1);
      }
    }
    cache[type] = canvas;
    return canvas;
  }

  function inspect(type) {
    var def = defs[type];
    if (!def) return null;
    var size = dimensions(def);
    var pixels = 0;
    for (var y = 0; y < size.h; y++) {
      for (var x = 0; x < size.w; x++) if (def.pal[def.rows[y][x]]) pixels++;
    }
    return { width: size.w + 2, height: size.h + 2, pixels: pixels, colors: Object.keys(def.pal).length };
  }

  Game.mapIcons = {
    types: Object.keys(defs),
    inspect: inspect,
    draw: function (ctx, type, x, y, opts) {
      opts = opts || {};
      var sprite = compile(type);
      if (!sprite) return false;
      var width = Math.max(sprite.width, Math.round(opts.size || sprite.width));
      var height = Math.round(sprite.height * width / sprite.width);
      ctx.save();
      ctx.globalAlpha = opts.alpha === undefined ? 1 : opts.alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, Math.round(x - width / 2), Math.round(y - height / 2), width, height);
      ctx.restore();
      return true;
    },
    drawToDom: function (canvas, type) {
      if (!canvas) return false;
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return this.draw(ctx, type, canvas.width / 2, canvas.height / 2, {
        size: Math.min(canvas.width, canvas.height) - 2
      });
    }
  };
})();
