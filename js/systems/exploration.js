/* ============================================================
 * systems/exploration.js — 永久迷雾、发现记录、准备度与区域图鉴
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus, reg = Game.reg;
  var FOG_CELL = 32;
  var FOG_VERSION = 1;
  var FOV_RADIUS = 80;
  var cache = {};
  var pendingFog = null;
  var pendingFogT = 0;
  var milestones = [0.10, 0.25, 0.40, 0.55, 0.75, 0.95];
  var milestonePoints = [3, 5, 5, 5, 6, 6];

  function blankDiscovery() {
    return {
      landmarks: {}, resources: {}, curios: {}, ecology: {}, threats: {},
      guardian: false, curioChoices: {}
    };
  }

  function freshRegionState(rid) {
    var region = reg.get('region', rid);
    var w = region && region.exploration ? region.exploration.world.w : 2400;
    var h = region && region.exploration ? region.exploration.world.h : 1440;
    return {
      fog: { v: FOG_VERSION, w: Math.ceil(w / FOG_CELL), h: Math.ceil(h / FOG_CELL), data: '' },
      discovered: blankDiscovery(),
      milestones: {},
      resourceCounts: {},
      threatCooldowns: {},
      expeditionIndex: 0,
      expedition: null,
      bossRetryAt: 0,
      completionRewarded: false,
      migrationGift: false,
      landmarkEffects: {}
    };
  }

  function regionState(rid) {
    if (!Game.state || !Game.state.world) return freshRegionState(rid);
    var all = Game.state.world.exploration || (Game.state.world.exploration = {});
    var out = all[rid] || (all[rid] = freshRegionState(rid));
    var expected = freshRegionState(rid);
    if (!out.fog || out.fog.v !== FOG_VERSION ||
        out.fog.w !== expected.fog.w || out.fog.h !== expected.fog.h ||
        typeof out.fog.data !== 'string') {
      out.fog = expected.fog;
      delete cache[rid];
    }
    out.discovered = out.discovered || blankDiscovery();
    var fresh = blankDiscovery();
    for (var k in fresh) {
      if (out.discovered[k] === undefined) out.discovered[k] = fresh[k];
    }
    out.milestones = out.milestones || {};
    out.resourceCounts = out.resourceCounts || {};
    out.threatCooldowns = out.threatCooldowns || {};
    out.landmarkEffects = out.landmarkEffects || {};
    out.expeditionIndex = Math.max(0, Number(out.expeditionIndex) || 0);
    out.bossRetryAt = Math.max(0, Number(out.bossRetryAt) || 0);
    return out;
  }

  function encode(bytes) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      var n = (a << 16) | (b << 8) | c;
      out += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63] +
        (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=') +
        (i + 2 < bytes.length ? alphabet[n & 63] : '=');
    }
    return out;
  }

  function decode(text, length) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var clean = String(text || '').replace(/[^A-Za-z0-9+/=]/g, '');
    var out = new Uint8Array(length);
    var oi = 0;
    for (var i = 0; i < clean.length && oi < length; i += 4) {
      var a = alphabet.indexOf(clean[i]), b = alphabet.indexOf(clean[i + 1]);
      var c = clean[i + 2] === '=' ? 0 : alphabet.indexOf(clean[i + 2]);
      var d = clean[i + 3] === '=' ? 0 : alphabet.indexOf(clean[i + 3]);
      if (a < 0 || b < 0 || c < 0 || d < 0) return new Uint8Array(length);
      var n = (a << 18) | (b << 12) | (c << 6) | d;
      out[oi++] = (n >>> 16) & 255;
      if (clean[i + 2] !== '=' && oi < length) out[oi++] = (n >>> 8) & 255;
      if (clean[i + 3] !== '=' && oi < length) out[oi++] = n & 255;
    }
    return out;
  }

  function fogBytes(rid) {
    var rs = regionState(rid);
    var length = Math.ceil(rs.fog.w * rs.fog.h / 8);
    if (!cache[rid] || cache[rid].length !== length) {
      cache[rid] = decode(rs.fog.data, length);
    }
    return cache[rid];
  }

  function bitGet(bytes, index) {
    return !!(bytes[index >> 3] & (1 << (index & 7)));
  }

  function bitSet(bytes, index) {
    var mask = 1 << (index & 7);
    var at = index >> 3;
    if (bytes[at] & mask) return false;
    bytes[at] |= mask;
    return true;
  }

  function flushFog(rid) {
    if (!Game.state || !Game.state.world) return;
    if (rid) {
      var one = regionState(rid);
      if (cache[rid]) one.fog.data = encode(cache[rid]);
      return;
    }
    for (var key in cache) regionState(key).fog.data = encode(cache[key]);
  }

  function lineVisible(layout, x0, y0, x1, y1) {
    if (!layout || !layout.nav || layout.version < 3) return true;
    var nav = layout.nav;
    var ax = Math.floor(x0 / nav.cell), ay = Math.floor(y0 / nav.cell);
    var bx = Math.floor(x1 / nav.cell), by = Math.floor(y1 / nav.cell);
    var dx = Math.abs(bx - ax), sx = ax < bx ? 1 : -1;
    var dy = -Math.abs(by - ay), sy = ay < by ? 1 : -1;
    var err = dx + dy, guard = 0;
    while (guard++ < 256) {
      if (ax === bx && ay === by) return true;
      if (ax < 0 || ay < 0 || ax >= nav.w || ay >= nav.h) return false;
      if (!(ax === Math.floor(x0 / nav.cell) && ay === Math.floor(y0 / nav.cell)) && !nav.grid[ay][ax]) return false;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; ax += sx; }
      if (e2 <= dx) { err += dx; ay += sy; }
    }
    return false;
  }

  function visibleCell(rid, gx, gy) {
    var rs = regionState(rid);
    if (gx < 0 || gy < 0 || gx >= rs.fog.w || gy >= rs.fog.h) return false;
    return bitGet(fogBytes(rid), gy * rs.fog.w + gx);
  }

  function canReveal() {
    var W = Game.world, hero = W && W.hero;
    if (!hero || !Game.state || Game.state.world.mode !== 'battle') return false;
    if (Game.transitions && Game.transitions.isActive()) return false;
    if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return false;
    return hero.state !== 'dead' && hero.state !== 'recover' && hero.state !== 'entrance' &&
      hero.state !== 'warpOut' && hero.state !== 'warpIn' && hero.state !== 'sitting';
  }

  function expBudget(rid) {
    var tier = Game.State.regionTier(rid);
    var start = (tier - 1) * 8 + 1;
    var total = 0;
    for (var lv = start; lv < start + 8; lv++) total += Game.F.expNeed(lv);
    return total;
  }

  function rewardExp(rid, share) {
    if (!Game.player || !Game.player.addExp) return 0;
    var amount = Math.max(1, Math.round(expBudget(rid) * share));
    Game.player.addExp(amount);
    return amount;
  }

  function contentMap(layout, kind) {
    if (!layout) return [];
    if (kind === 'landmarks') return layout.landmarks || [];
    if (kind === 'resources') return layout.nodes || [];
    if (kind === 'curios') return layout.curios || [];
    if (kind === 'ecology') return layout.ecology || [];
    if (kind === 'threats') return layout.threats || [];
    return [];
  }

  function discoverVisible(rid, x, y) {
    var layout = Game.world && Game.world.layout;
    if (!layout || layout.version < 3) return;
    var rs = regionState(rid);
    ['landmarks', 'resources', 'curios', 'ecology', 'threats'].forEach(function (kind) {
      var list = contentMap(layout, kind);
      for (var i = 0; i < list.length; i++) {
        var ent = list[i];
        var radius = kind === 'threats' ? Math.max(90, ent.radius * 0.7) : (kind === 'ecology' ? 56 : 70);
        if (U.dist(x, y, ent.x, ent.y) > radius) continue;
        if (kind === 'ecology' && Game.expedition && !Game.expedition.isEcologyActive(ent.defId)) continue;
        Collection.record(kind, ent.defId, {
          rid: rid, entity: ent, x: ent.x, y: ent.y
        });
      }
    });
  }

  function coverage(rid) {
    var rs = regionState(rid);
    var layout = Game.world && Game.world.layout && Game.world.region &&
      Game.world.region.id === rid ? Game.world.layout : null;
    var bytes = fogBytes(rid), known = 0, total = 0;
    for (var gy = 0; gy < rs.fog.h; gy++) {
      for (var gx = 0; gx < rs.fog.w; gx++) {
        var walkable = true;
        if (layout && layout.version >= 3) {
          var nx = U.clamp(Math.floor((gx * FOG_CELL + FOG_CELL / 2) / layout.nav.cell), 0, layout.nav.w - 1);
          var ny = U.clamp(Math.floor((gy * FOG_CELL + FOG_CELL / 2) / layout.nav.cell), 0, layout.nav.h - 1);
          walkable = !!layout.nav.grid[ny][nx];
        }
        if (!walkable) continue;
        total++;
        if (bitGet(bytes, gy * rs.fog.w + gx)) known++;
      }
    }
    return total ? known / total : 0;
  }

  function awardMilestones(rid, value) {
    var rs = regionState(rid);
    for (var i = 0; i < milestones.length; i++) {
      var key = String(Math.round(milestones[i] * 100));
      if (value + 0.0001 < milestones[i] || rs.milestones[key]) continue;
      rs.milestones[key] = true;
      var exp = rewardExp(rid, 0.55 * ([0.07, 0.12, 0.15, 0.18, 0.21, 0.27][i]));
      bus.emit('exploration:milestone', { rid: rid, value: milestones[i], exp: exp });
    }
  }

  function readiness(rid) {
    var rs = regionState(rid);
    var region = reg.get('region', rid);
    var cfg = region && region.exploration;
    if (!cfg) return { total: 0, exploration: 0, landmarks: 0, resources: 0, curios: 0, guardian: 0, lair: false };
    var cov = coverage(rid), explorePoints = 0;
    for (var i = 0; i < milestones.length; i++) if (cov + 0.0001 >= milestones[i]) explorePoints += milestonePoints[i];
    var landmarkCount = Object.keys(rs.discovered.landmarks).length;
    var resourceCount = Object.keys(rs.discovered.resources).length;
    var curioCount = Object.keys(rs.discovered.curios).length;
    var landmarkPoints = Math.round(25 * Math.min(landmarkCount, 4) / 4);
    var resourcePoints = Math.round(18 * Math.min(resourceCount, 5) / 5);
    var curioPoints = Math.round(12 * Math.min(curioCount, 3) / 3);
    var guardianPoints = rs.discovered.guardian ? 15 : 0;
    var lairDef = cfg.landmarks[3] && cfg.landmarks[3].id;
    var lair = !!(lairDef && rs.discovered.landmarks[lairDef]);
    return {
      total: Math.min(100, explorePoints + landmarkPoints + resourcePoints + curioPoints + guardianPoints),
      exploration: explorePoints,
      landmarks: landmarkPoints,
      resources: resourcePoints,
      curios: curioPoints,
      guardian: guardianPoints,
      lair: lair,
      coverage: cov
    };
  }

  function isComplete(rid) {
    var rs = regionState(rid), region = reg.get('region', rid);
    if (!region || !region.exploration) return false;
    var cfg = region.exploration;
    return coverage(rid) >= 0.95 &&
      Object.keys(rs.discovered.landmarks).length >= cfg.landmarks.length &&
      Object.keys(rs.discovered.resources).length >= cfg.resources.length &&
      Object.keys(rs.discovered.curios).length >= cfg.curios.length &&
      Object.keys(rs.discovered.ecology).length >= cfg.ecology.length;
  }

  function checkCompletion(rid) {
    var rs = regionState(rid);
    if (rs.completionRewarded || !isComplete(rid)) return false;
    rs.completionRewarded = true;
    var tier = Game.State.regionTier(rid);
    if (Game.player) {
      Game.player.addCrystal(8 + tier * 4);
      rewardExp(rid, 0.08);
    }
    if (Game.inv && Game.inv.genLoot && Game.inv.addItems) {
      Game.inv.addItems([Game.inv.genLoot(Game.state.player.level, { rarMin: 2, luck: 2 })], {
        source: 'region-complete'
      });
    }
    bus.emit('region:completed100', { rid: rid });
    return true;
  }

  function applyLandmarkEffect(rid, id, entity) {
    var state = regionState(rid);
    if (state.landmarkEffects[id]) return state.landmarkEffects[id];
    var region = reg.get('region', rid), def = null;
    var defs = region && region.exploration && region.exploration.landmarks || [];
    for (var i = 0; i < defs.length; i++) if (defs[i].id === id) { def = defs[i]; break; }
    var fn = entity && entity.function || def && def.function || 'intel';
    var effect = { function: fn };
    if (fn === 'intel' && entity && Game.world && Game.world.layout) {
      var camp = Game.world.layout.camp;
      var angle = Math.atan2(entity.y - camp.y, entity.x - camp.x);
      effect.direction = Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
    } else if (fn === 'shelter') {
      effect.x = entity && entity.x;
      effect.y = entity && entity.y;
      if (Game.expedition) {
        var expedition = Game.expedition.current(rid);
        expedition.curioEffects['landmark:' + id] = 'ward';
      }
    } else if (fn === 'shortcut') {
      effect.x = entity && entity.x;
      effect.y = entity && entity.y;
      effect.radius = 260;
    }
    state.landmarkEffects[id] = effect;
    bus.emit('landmark:activated', { rid: rid, id: id, function: fn, effect: effect });
    return effect;
  }

  var Collection = Game.collection = {
    record: function (kind, id, opts) {
      opts = opts || {};
      var rid = opts.rid || (Game.state && Game.state.world.region);
      if (!rid || !id) return false;
      var rs = regionState(rid);
      if (kind === 'guardian') {
        if (rs.discovered.guardian) return false;
        rs.discovered.guardian = true;
      } else {
        var bucket = rs.discovered[kind];
        if (!bucket || bucket[id]) return false;
        bucket[id] = true;
      }
      // 探索里程碑占 55%；首次收集/交互合计约 24%；战斗承担余下约 20%。
      var shares = { landmarks: 0.015, resources: 0.014, curios: 0.02, ecology: 0.015, guardian: 0.02, threats: 0 };
      var exp = rewardExp(rid, shares[kind] || 0);
      var eventName = {
        landmarks: 'landmark:discovered',
        resources: 'resource:registered',
        curios: 'curio:found',
        ecology: 'ecology:recorded',
        threats: 'threat:discovered',
        guardian: 'guardian:defeated'
      }[kind];
      if (eventName) bus.emit(eventName, { rid: rid, id: id, exp: exp, entity: opts.entity || null });
      if (kind === 'landmarks') applyLandmarkEffect(rid, id, opts.entity || null);
      if (kind === 'curios' && Game.expedition) Game.expedition.offerCurio(id, opts.entity);
      var ready = readiness(rid);
      bus.emit('readiness:changed', { rid: rid, readiness: ready });
      checkCompletion(rid);
      return true;
    },

    regionSummary: function (rid) {
      var rs = regionState(rid), region = reg.get('region', rid);
      var cfg = region && region.exploration;
      if (!cfg) return null;
      return {
        rid: rid,
        coverage: coverage(rid),
        readiness: readiness(rid),
        complete: isComplete(rid),
        landmarks: { found: Object.keys(rs.discovered.landmarks).length, total: cfg.landmarks.length },
        resources: { found: Object.keys(rs.discovered.resources).length, total: cfg.resources.length },
        curios: { found: Object.keys(rs.discovered.curios).length, total: cfg.curios.length },
        ecology: { found: Object.keys(rs.discovered.ecology).length, total: cfg.ecology.length },
        threats: { found: Object.keys(rs.discovered.threats).length, total: 3 },
        guardian: !!rs.discovered.guardian
      };
    }
  };

  var E = Game.exploration = {
    FOG_CELL: FOG_CELL,
    FOV_RADIUS: FOV_RADIUS,
    regionState: regionState,
    flush: flushFog,

    revealAt: function (x, y, opts) {
      opts = opts || {};
      if (!opts.force && !canReveal()) return 0;
      var rid = opts.rid || Game.state.world.region;
      var rs = regionState(rid), bytes = fogBytes(rid);
      var layout = Game.world && Game.world.layout;
      var cx = Math.floor(x / FOG_CELL), cy = Math.floor(y / FOG_CELL);
      var radius = Math.ceil(FOV_RADIUS / FOG_CELL);
      var changed = 0;
      for (var gy = cy - radius; gy <= cy + radius; gy++) {
        for (var gx = cx - radius; gx <= cx + radius; gx++) {
          if (gx < 0 || gy < 0 || gx >= rs.fog.w || gy >= rs.fog.h) continue;
          var tx = gx * FOG_CELL + FOG_CELL / 2, ty = gy * FOG_CELL + FOG_CELL / 2;
          if (U.dist(x, y, tx, ty) > FOV_RADIUS + FOG_CELL * 0.45) continue;
          if (!lineVisible(layout, x, y, tx, ty)) continue;
          if (bitSet(bytes, gy * rs.fog.w + gx)) changed++;
        }
      }
      if (changed) {
        pendingFog = pendingFog || { rid: rid, cells: 0 };
        pendingFog.cells += changed;
        pendingFogT = 0.12;
        var cov = coverage(rid);
        awardMilestones(rid, cov);
      }
      discoverVisible(rid, x, y);
      return changed;
    },

    update: function (dt) {
      if (pendingFog) {
        pendingFogT -= dt;
        if (pendingFogT <= 0) {
          flushFog(pendingFog.rid);
          pendingFog.coverage = coverage(pendingFog.rid);
          bus.emit('fog:revealed', pendingFog);
          bus.emit('readiness:changed', {
            rid: pendingFog.rid,
            readiness: readiness(pendingFog.rid)
          });
          pendingFog = null;
        }
      }
      var rid = Game.state && Game.state.world.region;
      if (rid) checkCompletion(rid);
    },

    coverage: coverage,
    readiness: readiness,
    isComplete: isComplete,

    isRevealed: function (x, y, rid) {
      rid = rid || (Game.state && Game.state.world.region);
      if (!rid) return false;
      return visibleCell(rid, Math.floor(x / FOG_CELL), Math.floor(y / FOG_CELL));
    },

    nextObjective: function (rid, fromX, fromY) {
      rid = rid || Game.state.world.region;
      var rs = regionState(rid), layout = Game.world && Game.world.layout;
      if (!layout || layout.version < 3) return null;
      var best = null, bestScore = -Infinity;
      for (var gy = 1; gy < rs.fog.h - 1; gy++) {
        for (var gx = 1; gx < rs.fog.w - 1; gx++) {
          if (visibleCell(rid, gx, gy)) continue;
          var knownNeighbor = visibleCell(rid, gx - 1, gy) || visibleCell(rid, gx + 1, gy) ||
            visibleCell(rid, gx, gy - 1) || visibleCell(rid, gx, gy + 1);
          if (!knownNeighbor) continue;
          var x = gx * FOG_CELL + FOG_CELL / 2, y = gy * FOG_CELL + FOG_CELL / 2;
          var p = Game.terrain.projectPoint(x, y, 2);
          if (!p) continue;
          var travel = U.dist(fromX, fromY, p.x, p.y);
          var danger = Game.terrain.dangerAt(p.x, p.y);
          var unknownAround = 0;
          for (var oy = -2; oy <= 2; oy++) {
            for (var ox = -2; ox <= 2; ox++) if (!visibleCell(rid, gx + ox, gy + oy)) unknownAround++;
          }
          var score = unknownAround * 8 - travel * 0.045 - danger * 90;
          if (score > bestScore) {
            bestScore = score;
            best = { kind: 'frontier', x: p.x, y: p.y, gx: gx, gy: gy, score: score };
          }
        }
      }
      return best;
    },

    drawFog: function (ctx, viewL, viewT, viewR, viewB) {
      var layout = Game.world && Game.world.layout;
      if (!layout || layout.version < 3 || !Game.state) return;
      var rid = Game.state.world.region, rs = regionState(rid);
      var minX = Math.max(0, Math.floor(viewL / FOG_CELL));
      var maxX = Math.min(rs.fog.w - 1, Math.ceil(viewR / FOG_CELL));
      var minY = Math.max(0, Math.floor(viewT / FOG_CELL));
      var maxY = Math.min(rs.fog.h - 1, Math.ceil(viewB / FOG_CELL));
      ctx.save();
      ctx.fillStyle = 'rgba(8,9,18,0.84)';
      for (var gy = minY; gy <= maxY; gy++) {
        for (var gx = minX; gx <= maxX; gx++) {
          if (!visibleCell(rid, gx, gy)) {
            ctx.fillRect(gx * FOG_CELL - 1, gy * FOG_CELL - 1, FOG_CELL + 2, FOG_CELL + 2);
          }
        }
      }
      ctx.restore();
    },

    drawMap: function (ctx, rid, width, height) {
      var layout = Game.world && Game.world.region && Game.world.region.id === rid ? Game.world.layout : null;
      if (!layout || layout.version < 3) return false;
      var rs = regionState(rid), sx = width / layout.world.w, sy = height / layout.world.h;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#111522'; ctx.fillRect(0, 0, width, height);
      for (var gy = 0; gy < rs.fog.h; gy++) {
        for (var gx = 0; gx < rs.fog.w; gx++) {
          if (!visibleCell(rid, gx, gy)) continue;
          var nx = U.clamp(Math.floor((gx * FOG_CELL + 16) / layout.nav.cell), 0, layout.nav.w - 1);
          var ny = U.clamp(Math.floor((gy * FOG_CELL + 16) / layout.nav.cell), 0, layout.nav.h - 1);
          ctx.fillStyle = layout.nav.grid[ny][nx]
            ? (layout.nav.danger[ny][nx] > 0.28 ? '#64563e' : '#526b58')
            : '#292d39';
          ctx.fillRect(Math.floor(gx * FOG_CELL * sx), Math.floor(gy * FOG_CELL * sy),
            Math.ceil(FOG_CELL * sx) + 1, Math.ceil(FOG_CELL * sy) + 1);
        }
      }
      var rsd = rs.discovered;
      function mark(list, bucket, color, radius) {
        ctx.fillStyle = color;
        for (var i = 0; i < list.length; i++) {
          if (!bucket[list[i].defId]) continue;
          ctx.beginPath();
          ctx.arc(list[i].x * sx, list[i].y * sy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      mark(layout.landmarks, rsd.landmarks, '#f4d379', 3);
      mark(layout.nodes, rsd.resources, '#75d18b', 2);
      mark(layout.curios, rsd.curios, '#c48cf0', 2.5);
      mark(layout.ecology, rsd.ecology, '#7ddce0', 2);
      if (Game.world && Game.world.hero) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(Game.world.hero.x * sx, Game.world.hero.y * sy, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      return true;
    },

    serializeFog: function (rid) {
      flushFog(rid);
      var fog = regionState(rid).fog;
      return { v: fog.v, w: fog.w, h: fog.h, data: fog.data };
    },

    validateFog: function (rid, fog) {
      var expected = freshRegionState(rid).fog;
      return !!fog && fog.v === expected.v && fog.w === expected.w &&
        fog.h === expected.h && typeof fog.data === 'string';
    },

    dangerFactor: function (x, y, rid) {
      rid = rid || (Game.state && Game.state.world.region);
      if (!rid) return 1;
      var effects = regionState(rid).landmarkEffects;
      var factor = 1;
      for (var id in effects) {
        var effect = effects[id];
        if (effect.function === 'shortcut' && Number.isFinite(effect.x) &&
            U.dist(x, y, effect.x, effect.y) <= (effect.radius || 260)) {
          factor = Math.min(factor, 0.68);
        } else if (effect.function === 'shelter' && Number.isFinite(effect.x) &&
                   U.dist(x, y, effect.x, effect.y) <= 150) {
          factor = Math.min(factor, 0.82);
        }
      }
      return factor;
    }
  };

  bus.on('save:before', function () { flushFog(); });
  bus.on('region:changed', function (p) {
    if (p && p.rid) {
      regionState(p.rid);
      if (Game.world && Game.world.hero) E.revealAt(Game.world.hero.x, Game.world.hero.y, { force: true, rid: p.rid });
    }
  });
})();
