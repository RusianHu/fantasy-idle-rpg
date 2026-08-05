/* Deterministic production equipment pixel renderer. */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;
  var CACHE_LIMIT = 128;
  var cache = {};
  var cacheOrder = [];
  var cacheHits = 0;
  var cacheMisses = 0;
  var bindings = [];
  var animationTimer = null;
  var FAMILY_ORDER = ['offense', 'defense', 'sustain', 'tempo', 'economy'];

  var PALETTES = [
    [
      { main: '#aeb5b2', light: '#e2e6e2', dark: '#626b68', accent: '#f3f0d2' },
      { main: '#b58d65', light: '#e2c29a', dark: '#664b3c', accent: '#e7d8b0' },
      { main: '#87909d', light: '#cdd4dc', dark: '#4d5360', accent: '#d8c995' }
    ],
    [
      { main: '#68a875', light: '#b9ddae', dark: '#386647', accent: '#e0d48a' },
      { main: '#6f9b8a', light: '#b9d8c7', dark: '#3e6057', accent: '#d6b878' },
      { main: '#8aa85e', light: '#d0df9e', dark: '#4d683b', accent: '#e7c980' }
    ],
    [
      { main: '#578bc2', light: '#add4ed', dark: '#31537e', accent: '#e6c66d' },
      { main: '#4b9da8', light: '#a9dfe0', dark: '#2e5d70', accent: '#efcf86' },
      { main: '#6c7fc4', light: '#bdc7ed', dark: '#424b80', accent: '#e5be79' }
    ],
    [
      { main: '#9b63b2', light: '#d8afe5', dark: '#613d73', accent: '#edc76d' },
      { main: '#b15483', light: '#e5aac9', dark: '#713653', accent: '#75d0c2' },
      { main: '#7462b6', light: '#c1b3e5', dark: '#483a77', accent: '#e6bd68' }
    ],
    [
      { main: '#cf8739', light: '#f2d071', dark: '#7b4b25', accent: '#fff0a8' },
      { main: '#c45c46', light: '#efaa7d', dark: '#76352e', accent: '#f8df8a' },
      { main: '#d0ac45', light: '#f2e099', dark: '#776225', accent: '#fff5c2' }
    ]
  ];
  var FAMILY_COLORS = {
    offense: '#e4675d', defense: '#67a6d5', sustain: '#69bd76',
    tempo: '#e4ca62', economy: '#d7944e'
  };

  function key(x, y) { return x + ':' + y; }
  function add(points, x, y, channel, size) {
    size = size || 20;
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    points[key(x, y)] = { x: x, y: y, channel: channel || 'main' };
  }
  function line(points, x0, y0, x1, y1, channel, size) {
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    while (true) {
      add(points, x0, y0, channel, size);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function rect(points, x, y, w, h, channel, size) {
    for (var py = y; py < y + h; py++) {
      for (var px = x; px < x + w; px++) add(points, px, py, channel, size);
    }
  }
  function diamond(points, cx, cy, radius, channel, size) {
    for (var y = -radius; y <= radius; y++) {
      var half = radius - Math.abs(y);
      for (var x = -half; x <= half; x++) add(points, cx + x, cy + y, channel, size);
    }
  }
  function ring(points, cx, cy, radius, channel, size) {
    for (var y = -radius; y <= radius; y++) {
      for (var x = -radius; x <= radius; x++) {
        var d = x * x + y * y;
        if (d >= (radius - 1) * (radius - 1) && d <= radius * radius + 1) {
          add(points, cx + x, cy + y, channel, size);
        }
      }
    }
  }
  function mirror(points, axis) {
    Object.keys(points).forEach(function (pointKey) {
      var p = points[pointKey];
      add(points, axis * 2 - p.x, p.y, p.channel);
    });
  }
  function familyHash(descriptor) { return U.strSeed(descriptor.profileFamily || descriptor.baseId || 'fallback'); }

  function weaponShape(points, d) {
    var v = d.silhouetteVariant, part = d.partVariant, trim = d.trimVariant;
    var bias = familyHash(d) % 4;
    if (d.classId === 'rogue') {
      line(points, 4, 16, 11 + (v === 2 ? 2 : 0), 4 + v, 'main');
      line(points, 8, 17, 16 - v, 7 - (bias % 2), 'dark');
      line(points, 5, 15, 11 + (v === 2 ? 2 : 0), 5 + v, 'light');
      rect(points, 2 + part, 14, 5, 2, 'accent');
      if (trim % 2) { add(points, 14, 6, 'accent'); add(points, 15, 6, 'light'); }
    } else if (d.classId === 'mage') {
      line(points, 6 + v, 17, 12 - (v % 2), 6, 'dark');
      line(points, 7 + v, 16, 12 - (v % 2), 7, 'main');
      if (part === 0) diamond(points, 13, 4, 2 + (bias % 2), 'accent');
      else if (part === 1) ring(points, 13, 5, 3, 'main');
      else if (part === 2) { line(points, 10, 6, 15, 2, 'accent'); line(points, 12, 7, 16, 5, 'light'); }
      else { rect(points, 11, 3, 5, 4, 'accent'); rect(points, 12, 4, 2, 2, 'light'); }
    } else if (d.classId === 'cleric') {
      line(points, 6 + v, 17, 11, 7 - (bias % 2), 'dark');
      line(points, 7 + v, 16, 12, 7 - (bias % 2), 'main');
      if (part % 2) diamond(points, 12, 4, 3, 'main');
      else rect(points, 9, 3, 7, 5 + (v % 2), 'main');
      rect(points, 11, 4, 2 + (trim % 2), 2, 'light');
      if (trim > 1) { add(points, 9, 2, 'accent'); add(points, 16, 4, 'accent'); }
    } else if (d.classId === 'ranger') {
      var left = 5 + (v === 1 ? 1 : 0), curve = 2 + (bias % 2);
      for (var y = 3; y <= 16; y++) {
        var dist = Math.abs(9 - y);
        add(points, left + Math.floor(dist / curve), y, y % 3 ? 'main' : 'light');
      }
      line(points, left + 2 + v, 3, left + 2 + v, 16, 'dark');
      line(points, 8, 15 - trim, 16, 5 + part, 'accent');
      if (part === 3) rect(points, 8, 9, 7, 2, 'main');
    } else {
      var x0 = 4 + v, y0 = 17, x1 = 14 + (bias % 2), y1 = 2 + v;
      line(points, x0, y0, x1, y1, 'main');
      line(points, x0 + 1, y0 - 1, x1, y1 + 1, 'light');
      if (part === 0) rect(points, x0 - 1, 13, 7, 2, 'accent');
      else if (part === 1) line(points, 3, 14, 10, 15, 'accent');
      else if (part === 2) diamond(points, 7, 13, 2, 'accent');
      else { rect(points, 3, 13, 4, 3, 'dark'); add(points, 2, 16, 'accent'); }
      if (d.profileFamily === 'executioner' || d.profileFamily === 'bulwark') {
        rect(points, 12, 3 + v, 4 + (trim % 2), 3, 'dark');
      }
    }
    if (trim === 0) { add(points, 3, 17, 'dark'); add(points, 4, 16, 'accent'); }
    else if (trim === 1) { add(points, 9, 10, 'accent'); add(points, 10, 9, 'light'); }
    else if (trim === 2) { add(points, 15, 3, 'accent'); add(points, 16, 2, 'light'); }
    else { line(points, 7, 14, 10, 11, 'accent'); }
  }

  function headShape(points, d) {
    var family = d.profileFamily, v = d.silhouetteVariant, part = d.partVariant;
    var left = 4 + (v === 1 ? 1 : 0), right = 15 - (v === 2 ? 1 : 0);
    if (family === 'arcane_circlet') {
      line(points, 4, 8 + v, 15, 8 + v, 'main');
      diamond(points, 10, 6 + v, 2, 'accent');
      add(points, 4, 7 + v, 'light'); add(points, 15, 7 + v, 'light');
    } else if (family === 'war_mask') {
      diamond(points, 10, 10, 6 - (v % 2), 'main');
      rect(points, 6, 8, 8, 5, 'dark');
      add(points, 7, 9, 'accent'); add(points, 12, 9, 'accent');
    } else {
      for (var y = 5 + v; y <= 15; y++) {
        var inset = y < 8 ? Math.max(0, 8 - y) : 0;
        for (var x = left + inset; x <= right - inset; x++) {
          add(points, x, y, family.indexOf('hood') >= 0 || family.indexOf('veil') >= 0 ? 'dark' : 'main');
        }
      }
      if (family === 'greathelm' || family === 'chain_coif') {
        rect(points, left - 1, 8 + v, right - left + 3, 2, 'light');
        rect(points, 8, 10, 4, 5, 'dark');
      } else if (family === 'mystic_hood' || family === 'oracle_veil') {
        line(points, left, 8, 9, 4 + v, 'main'); line(points, right, 8, 10, 4 + v, 'main');
        rect(points, 8, 10, 4, 3, 'accent');
      } else {
        rect(points, left - 1, 7 + v, right - left + 3, 3, 'main');
        rect(points, 7, 5 + v, 7, 2, 'light');
      }
    }
    if (part === 0) { add(points, 3, 9, 'accent'); add(points, 16, 9, 'accent'); }
    else if (part === 1) { line(points, 8, 4, 10, 1, 'accent'); line(points, 11, 4, 13, 1, 'accent'); }
    else if (part === 2) rect(points, 9, 4, 2, 3, 'light');
    else { add(points, 5, 13, 'accent'); add(points, 14, 13, 'accent'); }
    if (d.trimVariant === 1) line(points, 6, 14, 13, 14, 'accent');
    if (d.trimVariant === 2) { add(points, 6, 7, 'light'); add(points, 13, 7, 'light'); }
    if (d.trimVariant === 3) diamond(points, 10, 8, 1, 'accent');
  }

  function bodyShape(points, d) {
    var family = d.profileFamily, v = d.silhouetteVariant, part = d.partVariant;
    var shoulder = 3 + (v === 1 ? 1 : 0), width = 14 - (v === 2 ? 1 : 0);
    rect(points, 7, 3 + v, 6, 3, 'light');
    rect(points, shoulder, 7, width, 8 + (v === 2 ? 1 : 0),
      family === 'vestment' || family === 'battlerobe' ? 'dark' : 'main');
    rect(points, 1 + v, 7, 3, 6, 'main'); rect(points, 16 - v, 7, 3, 6, 'main');
    if (family === 'plate' || family === 'scale' || family === 'sanctified_mail') {
      line(points, 5, 8, 14, 14, 'dark'); line(points, 14, 8, 5, 14, 'dark');
      rect(points, 8, 8, 4, 5, 'accent');
    } else if (family === 'vestment' || family === 'battlerobe') {
      rect(points, 8, 5, 4, 11, 'accent');
      line(points, 4, 15, 15, 15, 'light');
    } else if (family === 'leathers' || family === 'traveler_coat') {
      line(points, 5, 8, 11, 15, 'accent');
      rect(points, 5, 11, 4, 2, 'dark'); rect(points, 12, 9, 3, 4, 'dark');
    } else {
      for (var y = 8; y <= 14; y += 2) line(points, 5, y, 14, y, y % 4 ? 'accent' : 'dark');
    }
    if (part === 0) { rect(points, 2, 6, 4, 3, 'light'); rect(points, 14, 6, 4, 3, 'light'); }
    else if (part === 1) diamond(points, 10, 10, 2, 'accent');
    else if (part === 2) { rect(points, 5, 13, 10, 2, 'dark'); add(points, 10, 13, 'light'); }
    else { line(points, 3, 8, 7, 5, 'accent'); line(points, 16, 8, 12, 5, 'accent'); }
    if (d.trimVariant === 1) line(points, 5, 10, 14, 10, 'light');
    if (d.trimVariant === 2) { add(points, 6, 12, 'accent'); add(points, 13, 12, 'accent'); }
    if (d.trimVariant === 3) line(points, 10, 7, 10, 15, 'accent');
  }

  function feetShape(points, d) {
    var family = d.profileFamily, v = d.silhouetteVariant;
    var top = 4 + v, height = 10 - (v === 2 ? 1 : 0);
    rect(points, 3, top, 6, height, 'main'); rect(points, 11, top, 6, height, 'main');
    rect(points, 2, 13, 8, 4, 'dark'); rect(points, 10, 13, 8, 4, 'dark');
    if (family === 'swift_boots' || family === 'shadow_treads' || family === 'trail_shoes') {
      line(points, 1, 7, 5, 11, 'accent'); line(points, 18, 7, 14, 11, 'accent');
    } else if (family === 'pilgrim_steps' || family === 'arcane_sandals') {
      line(points, 3, 7, 8, 12, 'accent'); line(points, 16, 7, 11, 12, 'accent');
      add(points, 5, 5, 'light'); add(points, 14, 5, 'light');
    } else {
      rect(points, 3, 6 + v, 6, 2, 'light'); rect(points, 11, 6 + v, 6, 2, 'light');
    }
    if (d.partVariant === 1) { rect(points, 4, 9, 5, 2, 'dark'); rect(points, 11, 9, 5, 2, 'dark'); }
    if (d.partVariant === 2) { add(points, 2, 16, 'accent'); add(points, 17, 16, 'accent'); }
    if (d.partVariant === 3) { diamond(points, 6, 9, 1, 'accent'); diamond(points, 14, 9, 1, 'accent'); }
    if (d.trimVariant === 1) { line(points, 3, 12, 9, 12, 'accent'); line(points, 10, 12, 16, 12, 'accent'); }
    if (d.trimVariant === 2) { add(points, 4, 5, 'light'); add(points, 15, 5, 'light'); }
    if (d.trimVariant === 3) { add(points, 3, 15, 'accent'); add(points, 16, 15, 'accent'); }
  }

  function accessoryShape(points, d) {
    var family = d.profileFamily, v = d.silhouetteVariant, part = d.partVariant;
    if (family === 'signet') {
      ring(points, 10, 11, 5 + (v % 2), 'main');
      diamond(points, 10, 5, 2 + (part % 2), 'accent');
    } else if (family === 'hourglass') {
      rect(points, 5, 3 + v, 10, 2, 'main'); rect(points, 5, 15 - v, 10, 2, 'main');
      line(points, 6, 5 + v, 13, 14 - v, 'dark'); line(points, 13, 5 + v, 6, 14 - v, 'dark');
      diamond(points, 10, 10, 1 + (part % 2), 'accent');
    } else if (family === 'compass') {
      ring(points, 10, 10, 6 - (v % 2), 'main');
      line(points, 10, 4, 10, 16, 'light'); line(points, 4, 10, 16, 10, 'dark');
      line(points, 10, 10, 13 + (part % 2), 6, 'accent');
    } else if (family === 'brooch') {
      diamond(points, 10, 10, 6 - (v % 2), 'main');
      diamond(points, 10, 10, 2 + (part % 2), 'accent');
    } else if (family === 'prayer_beads') {
      for (var a = 0; a < 10; a++) {
        var angle = a * Math.PI * 2 / 10;
        add(points, Math.round(10 + Math.cos(angle) * (6 - v % 2)),
          Math.round(9 + Math.sin(angle) * (6 - v % 2)), a % 3 ? 'main' : 'light');
      }
      diamond(points, 10, 16, 2, 'accent');
    } else if (family === 'lantern') {
      line(points, 7, 4, 13, 4, 'main'); line(points, 8, 3, 12, 3, 'light');
      rect(points, 6 + v % 2, 6, 8 - v % 2, 9, 'dark');
      diamond(points, 10, 10, 3, 'accent'); rect(points, 7, 15, 6, 2, 'main');
    } else {
      line(points, 5, 3 + v, 10, 8, 'main'); line(points, 15, 3 + v, 10, 8, 'main');
      diamond(points, 10, 12, 4 + (part % 2), family === 'talisman' ? 'accent' : 'main');
      diamond(points, 10, 11, 1 + (d.trimVariant % 2), 'light');
    }
    if (d.trimVariant === 1) { add(points, 4, 10, 'accent'); add(points, 16, 10, 'accent'); }
    if (d.trimVariant === 2) { add(points, 10, 2, 'light'); add(points, 10, 18, 'accent'); }
    if (d.trimVariant === 3) ring(points, 10, 10, 3, 'light');
  }

  function corePoints(descriptor) {
    var points = {};
    if (descriptor.slotId === 'weapon') weaponShape(points, descriptor);
    else if (descriptor.slotId === 'head') headShape(points, descriptor);
    else if (descriptor.slotId === 'body') bodyShape(points, descriptor);
    else if (descriptor.slotId === 'feet') feetShape(points, descriptor);
    else accessoryShape(points, descriptor);
    if (descriptor.detailVariant === 0) add(points, 2, 3, 'accent');
    else if (descriptor.detailVariant === 1) add(points, 17, 4, 'accent');
    else if (descriptor.detailVariant === 2) { add(points, 2, 16, 'accent'); add(points, 17, 16, 'accent'); }
    else { add(points, 9, 2, 'light'); add(points, 11, 2, 'light'); }
    return points;
  }

  function drawFamilyMarks(points, families) {
    families.forEach(function (family, index) {
      var x = index % 2 ? 17 : 2;
      var y = 4 + Math.floor(index / 2) * 5;
      var channel = 'family:' + family;
      if (family === 'offense') line(points, x === 2 ? 1 : 18, y + 2, x === 2 ? 4 : 15, y, channel);
      else if (family === 'defense') { add(points, x, y, channel); add(points, x + (x > 10 ? -1 : 1), y + 1, channel); add(points, x, y + 2, channel); }
      else if (family === 'sustain') diamond(points, x, y + 1, 1, channel);
      else if (family === 'tempo') { add(points, x, y, channel); add(points, x, y + 2, channel); add(points, x + (x > 10 ? -1 : 1), y + 1, channel); }
      else ring(points, x, y + 1, 1, channel);
    });
  }

  function drawLegendary(points, descriptor, phase) {
    if (!descriptor.legendaryId || phase < 1) return;
    var motifSeed = U.strSeed(descriptor.legendaryId);
    var shift = phase % 2;
    var positions = [[2, 2], [17, 3], [3, 17], [16, 16], [10, 1], [10, 18], [1, 10], [18, 10]];
    for (var i = 0; i < 6; i++) {
      var p = positions[(i + (motifSeed % positions.length) + shift) % positions.length];
      add(points, p[0] + (i % 2 ? shift : 0), p[1] - (i % 3 ? 0 : shift), 'legendary');
    }
    if (motifSeed % 3 === 0) ring(points, 10, 10, 8 - shift, 'legendary');
    else if (motifSeed % 3 === 1) { add(points, 5 + shift, 2, 'legendary'); add(points, 14 - shift, 17, 'legendary'); }
    else { add(points, 2, 6 + shift, 'legendary'); add(points, 17, 13 - shift, 'legendary'); }
  }

  function miniPoints(points) {
    var buckets = {};
    Object.keys(points).forEach(function (pointKey) {
      var p = points[pointKey], mx = Math.floor(p.x / 2), my = Math.floor(p.y / 2);
      var bucketKey = key(mx, my);
      var b = buckets[bucketKey] || (buckets[bucketKey] = { x: mx, y: my, channels: {}, count: 0 });
      b.channels[p.channel] = (b.channels[p.channel] || 0) + 1;
      b.count++;
    });
    var output = {};
    Object.keys(buckets).forEach(function (bucketKey) {
      var b = buckets[bucketKey], selected = 'main', count = -1;
      Object.keys(b.channels).forEach(function (channel) {
        var weight = b.channels[channel] + (channel === 'accent' || channel === 'legendary' ? .5 : 0);
        if (weight > count) { selected = channel; count = weight; }
      });
      add(output, b.x, b.y, selected, 10);
    });
    return output;
  }

  function makeCanvas(size) {
    var canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    return canvas;
  }
  function paint(points, descriptor, size, options) {
    options = options || {};
    var canvas = makeCanvas(size), ctx = canvas.getContext('2d');
    var palette = PALETTES[descriptor.rarityRank][descriptor.paletteVariant];
    if (options.material === false) {
      palette = { main: '#8f9691', light: '#d5dad5', dark: '#505752', accent: '#b9bdb5' };
    }
    if (options.outline !== false) {
      ctx.fillStyle = '#17131f';
      Object.keys(points).forEach(function (pointKey) {
        var p = points[pointKey];
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (delta) {
          var nx = p.x + delta[0], ny = p.y + delta[1];
          if (nx >= 0 && ny >= 0 && nx < size && ny < size && !points[key(nx, ny)]) {
            ctx.fillRect(nx, ny, 1, 1);
          }
        });
      });
    }
    Object.keys(points).forEach(function (pointKey) {
      var p = points[pointKey];
      if (p.channel.indexOf('family:') === 0) ctx.fillStyle = FAMILY_COLORS[p.channel.slice(7)] || palette.accent;
      else if (p.channel === 'legendary') ctx.fillStyle = descriptor.legendaryColor;
      else ctx.fillStyle = palette[p.channel] || palette.main;
      ctx.fillRect(p.x, p.y, 1, 1);
    });
    return canvas;
  }

  function descriptorFor(item) {
    item = item || {};
    var base = Game.content && item.baseId ? Game.content.get('itemBase', item.baseId) : null;
    var slotId = Game.equipment && Game.equipment.slotOf ? Game.equipment.slotOf(item) : item.base || 'accessory';
    if (['weapon', 'head', 'body', 'feet', 'accessory'].indexOf(slotId) < 0) slotId = 'accessory';
    var profile = base && Game.content.get('itemVisualProfile', base.visualProfileId);
    profile = profile || {
      id: 'visual.fallback.' + slotId, slotId: slotId, family: 'fallback',
      silhouetteVariants: [0, 1, 2], partSets: [0, 1, 2, 3], trimSets: [0, 1, 2, 3]
    };
    var classId = item.classId || Game.state && Game.state.player && Game.state.player.classId || 'fighter';
    var originSeed = Number(item.origin && item.origin.seed) >>> 0;
    var coreSeed = U.strSeed(['gear-visual:v1', item.uid || '', originSeed, item.baseId || '', classId].join('|'));
    var random = U.seededRng(coreSeed);
    function choice(list) { return list[Math.floor(random() * list.length)] || 0; }
    var affixDefinitions = (item.affixes || []).map(function (roll) {
      return Game.content && Game.content.get('itemAffix', roll.definitionId);
    }).filter(Boolean);
    var families = [];
    FAMILY_ORDER.forEach(function (family) {
      if (affixDefinitions.some(function (definition) { return definition.kind === 'normal' && definition.family === family; })) {
        families.push(family);
      }
    });
    var legendary = affixDefinitions.filter(function (definition) { return definition.kind === 'legendary'; })[0];
    var rarityRank = Game.equipment && Game.equipment.rarityRank ? Game.equipment.rarityRank(item) : Math.max(0, Math.min(4, item.rar | 0));
    var motif = legendary && legendary.presentation && legendary.presentation.visualMotif || null;
    var motifSeed = U.strSeed(motif || 'none');
    return {
      version: 1, baseId: item.baseId || null, visualProfileId: profile.id,
      slotId: slotId, classId: classId, rarityId: item.rarityId || null, rarityRank: rarityRank,
      profileFamily: profile.family, coreSeed: coreSeed,
      silhouetteVariant: choice(profile.silhouetteVariants), partVariant: choice(profile.partSets),
      trimVariant: choice(profile.trimSets), detailVariant: Math.floor(random() * 4),
      paletteVariant: Math.floor(random() * PALETTES[rarityRank].length),
      families: families, legendaryId: legendary && legendary.id || null,
      legendaryMotif: motif,
      legendaryColor: motifSeed % 2 ? '#fff0a1' : '#f4c95f'
    };
  }

  function touchCache(cacheKey, value) {
    var old = cacheOrder.indexOf(cacheKey);
    if (old >= 0) cacheOrder.splice(old, 1);
    cacheOrder.push(cacheKey);
    cache[cacheKey] = value;
    while (cacheOrder.length > CACHE_LIMIT) delete cache[cacheOrder.shift()];
    return value;
  }
  function renderFrame(item, options) {
    options = options || {};
    var descriptor = descriptorFor(item);
    var size = options.size === 'mini' ? 10 : 20;
    var requestedPhase = options.phase | 0;
    var phase = descriptor.legendaryId
      ? (options.reducedMotion ? 1 : (requestedPhase === 2 ? 2 : 1))
      : 0;
    var layerFlags = [options.outline !== false, options.material !== false,
      options.affixes !== false, options.legendary !== false];
    var signature = JSON.stringify([descriptor, size, phase, layerFlags]);
    if (cache[signature]) {
      cacheHits++;
      touchCache(signature, cache[signature]);
      return { canvas: cache[signature], descriptor: descriptor, size: size, phase: phase };
    }
    cacheMisses++;
    var points = corePoints(descriptor);
    if (options.affixes !== false) drawFamilyMarks(points, descriptor.families);
    if (options.legendary !== false) drawLegendary(points, descriptor, phase);
    if (size === 10) points = miniPoints(points);
    var canvas = paint(points, descriptor, size, options);
    touchCache(signature, canvas);
    return { canvas: canvas, descriptor: descriptor, size: size, phase: phase };
  }

  function drawToDom(target, item, options) {
    options = options || {};
    var result = renderFrame(item, options), source = result.canvas;
    var ctx = target.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, target.width, target.height);
    var scale = Math.max(1, Math.floor(Math.min(target.width / source.width, target.height / source.height)));
    var width = source.width * scale, height = source.height * scale;
    ctx.drawImage(source, Math.floor((target.width - width) / 2), Math.floor((target.height - height) / 2), width, height);
    return result;
  }

  function motionEnabled(options) {
    if (options && options.reducedMotion) return false;
    return !U.motionEnabled || U.motionEnabled();
  }
  function scheduleAnimation() {
    if (animationTimer || !bindings.length) return;
    function tick() {
      animationTimer = null;
      bindings = bindings.filter(function (binding) {
        if (binding.disposed || binding.canvas.isConnected === false) return false;
        var descriptor = descriptorFor(binding.item);
        if (descriptor.legendaryId && motionEnabled(binding.options)) {
          drawToDom(binding.canvas, binding.item, Object.assign({}, binding.options, {
            phase: Math.floor(Date.now() / 480) % 2 + 1
          }));
        }
        return true;
      });
      if (bindings.length) animationTimer = setTimeout(tick, 480);
    }
    animationTimer = setTimeout(tick, 480);
  }
  function bind(target, item, options) {
    options = options || {};
    var result = drawToDom(target, item, options);
    if (!result.descriptor.legendaryId || !motionEnabled(options)) return function () {};
    var binding = { canvas: target, item: item, options: options, disposed: false };
    bindings.push(binding);
    scheduleAnimation();
    return function () { binding.disposed = true; };
  }

  function sampleItem(base, classId, seed, rarityId, legendaryId) {
    var item = {
      schemaVersion: 2, generationVersion: 1,
      uid: 'visual-catalog:' + base.id + ':' + classId + ':' + seed + ':' + (legendaryId || rarityId),
      baseId: base.id, base: base.slotId, classId: classId, itemLevel: 30,
      rarityId: rarityId, rar: Game.equipment.RARITY_IDS.indexOf(rarityId),
      origin: { seed: seed >>> 0, sourceType: 'visual-catalog', sourceId: base.id, ordinal: 0 },
      affixes: [], implicitRolls: [], reforge: { count: 0, lockedAffixInstanceId: null }
    };
    if (legendaryId) item.affixes.push({ instanceId: item.uid + ':legendary', definitionId: legendaryId, values: { rolls: [] } });
    return item;
  }
  function catalog() {
    var entries = [];
    var classes = ['fighter', 'rogue', 'mage', 'cleric', 'ranger'];
    var bases = Game.content.all('itemBase');
    bases.forEach(function (base, index) {
      var classIds = base.slotId === 'weapon' ? classes : ['fighter'];
      classIds.forEach(function (classId, classIndex) {
        var entryId = 'equipment:' + base.id + ':' + classId;
        entries.push({
          key: entryId, id: entryId,
          kind: 'equipment', group: 'equipment', baseId: base.id, classId: classId,
          name: Game.i18n.t(base.presentation && base.presentation.nameKey),
          nameKey: base.presentation && base.presentation.nameKey,
          width: 20, height: 20, anchor: { x: 10, y: 19 }, frameNames: ['icon'],
          sourceRefs: ['itemBase.' + base.id, 'itemVisualProfile.' + base.visualProfileId],
          item: sampleItem(base, classId, U.strSeed(['catalog', base.id, classId, index, classIndex].join('|')), 'rare')
        });
      });
    });
    Game.content.all('itemAffix').filter(function (definition) { return definition.kind === 'legendary'; })
      .forEach(function (definition, index) {
        var base = bases[index % bases.length];
        var entryId = 'equipment-effect:' + definition.id;
        entries.push({
          key: entryId, id: entryId,
          kind: 'equipment', group: 'equipment', baseId: base.id, classId: 'fighter',
          name: Game.i18n.t(definition.presentation && definition.presentation.nameKey),
          nameKey: definition.presentation && definition.presentation.nameKey,
          legendaryId: definition.id,
          width: 20, height: 20, anchor: { x: 10, y: 19 }, frameNames: ['legendary0', 'legendary1'],
          sourceRefs: ['itemAffix.' + definition.id, 'itemBase.' + base.id],
          preview: { mode: 'production', duration: .96 },
          item: sampleItem(base, 'fighter', U.strSeed(['legendary-catalog', definition.id].join('|')), 'legendary', definition.id)
        });
      });
    return entries;
  }

  Game.equipmentVisuals = {
    VERSION: 1,
    CACHE_LIMIT: CACHE_LIMIT,
    descriptorFor: descriptorFor,
    renderFrame: renderFrame,
    drawToDom: drawToDom,
    drawWorld: function (ctx, item, x, y, options) {
      options = options || {};
      var phase = motionEnabled(options) ? Math.floor((Number(options.time) || 0) / .48) % 2 + 1 : 0;
      var result = renderFrame(item, { size: 'mini', phase: phase, reducedMotion: !motionEnabled(options) });
      ctx.imageSmoothingEnabled = false;
      if (options.alpha !== undefined) ctx.globalAlpha = options.alpha;
      ctx.drawImage(result.canvas, Math.round(x - 5), Math.round(y - 10));
      if (options.alpha !== undefined) ctx.globalAlpha = 1;
      return result;
    },
    bind: bind,
    catalog: catalog,
    resetCache: function () {
      cache = {}; cacheOrder = []; cacheHits = 0; cacheMisses = 0;
      bindings.forEach(function (binding) { binding.disposed = true; });
      bindings = [];
      if (animationTimer) clearTimeout(animationTimer);
      animationTimer = null;
    },
    diagnostics: function () {
      return {
        version: 1, cacheLimit: CACHE_LIMIT, cachedFrames: cacheOrder.length,
        cacheHits: cacheHits, cacheMisses: cacheMisses,
        activeBindings: bindings.filter(function (binding) { return !binding.disposed; }).length
      };
    }
  };
})();
