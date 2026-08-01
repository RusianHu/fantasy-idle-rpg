/* Map layout v4: deterministic semi-open nests layered over the immutable v3 generator. */
(function () {
  'use strict';
  var Game = window.Game, U = Game.util, T = Game.terrain;
  var generateV3 = T.generate, validateV3 = T.validate, mountV3 = T.mount, buildV3 = T.build;

  function nestSeed(worldSeed, regionId, attempt) {
    return U.strSeed((worldSeed >>> 0) + ':' + regionId + ':4:nests:' + (attempt || 0));
  }
  function angleDelta(a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }
  function pointInside(nest, x, y, scale) {
    scale = scale || 1;
    var nx = (x - nest.x) / (nest.rx * scale);
    var ny = (y - nest.y) / (nest.ry * scale);
    return nx * nx + ny * ny <= 1;
  }
  function projected(nav, x, y, minClearance, predicate) {
    var gx = U.clamp(Math.floor(x / nav.cell), 0, nav.w - 1);
    var gy = U.clamp(Math.floor(y / nav.cell), 0, nav.h - 1);
    var limit = 32;
    for (var radius = 0; radius <= limit; radius++) {
      for (var oy = -radius; oy <= radius; oy++) for (var ox = -radius; ox <= radius; ox++) {
        if (radius && Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
        var nx = gx + ox, ny = gy + oy;
        if (nx < 1 || ny < 1 || nx >= nav.w - 1 || ny >= nav.h - 1 || !nav.grid[ny][nx]) continue;
        if (nav.distance && nav.distance[ny][nx] < (minClearance || 1)) continue;
        var point = { x: nx * nav.cell + nav.cell / 2, y: ny * nav.cell + nav.cell / 2 };
        if (!predicate || predicate(point)) return point;
      }
    }
    return { x: x, y: y };
  }
  function computeDistance(nav) {
    var total = nav.w * nav.h, queue = new Int32Array(total), head = 0, tail = 0;
    var flatDistance = new Int16Array(total);
    flatDistance.fill(32767);
    for (var y = 0; y < nav.h; y++) for (var x = 0; x < nav.w; x++) {
      var index = y * nav.w + x;
      if (!nav.grid[y][x] || x === 0 || y === 0 || x === nav.w - 1 || y === nav.h - 1) {
        flatDistance[index] = 0; queue[tail++] = index;
      }
    }
    while (head < tail) {
      var at = queue[head++], ax = at % nav.w, ay = (at / nav.w) | 0;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (offset) {
        var nx = ax + offset[0], ny = ay + offset[1];
        if (nx < 0 || ny < 0 || nx >= nav.w || ny >= nav.h) return;
        var ni = ny * nav.w + nx;
        if (flatDistance[ni] <= flatDistance[at] + 1) return;
        flatDistance[ni] = flatDistance[at] + 1; queue[tail++] = ni;
      });
    }
    nav.distance = new Array(nav.h);
    var open = 0;
    for (y = 0; y < nav.h; y++) {
      nav.distance[y] = new Array(nav.w);
      for (x = 0; x < nav.w; x++) {
        var idx = y * nav.w + x;
        nav.distance[y][x] = flatDistance[idx];
        nav.flat[idx] = nav.grid[y][x] ? 1 : 0;
        if (nav.costs && nav.costs[y]) nav.costs[y][x] = nav.grid[y][x] ? Math.max(1, nav.costs[y][x] || 1) : 0;
        if (nav.grid[y][x]) open++;
      }
    }
    nav.walkableRatio = open / Math.max(1, nav.w * nav.h);
  }
  function rasterNest(nav, nest) {
    var thickness = 18;
    var minX = U.clamp(Math.floor((nest.x - nest.rx - thickness) / nav.cell), 1, nav.w - 2);
    var maxX = U.clamp(Math.ceil((nest.x + nest.rx + thickness) / nav.cell), 1, nav.w - 2);
    var minY = U.clamp(Math.floor((nest.y - nest.ry - thickness) / nav.cell), 1, nav.h - 2);
    var maxY = U.clamp(Math.ceil((nest.y + nest.ry + thickness) / nav.cell), 1, nav.h - 2);
    for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
      var wx = x * nav.cell + nav.cell / 2, wy = y * nav.cell + nav.cell / 2;
      var dx = wx - nest.x, dy = wy - nest.y;
      var radial = Math.sqrt(Math.pow(dx / nest.rx, 2) + Math.pow(dy / nest.ry, 2));
      var angle = Math.atan2(dy / nest.ry, dx / nest.rx);
      var atRadius = Math.sqrt(dx * dx + dy * dy);
      var mainOpen = angleDelta(angle, nest.mainEntrance.angle) <=
        Math.asin(Math.min(0.92, nest.mainEntrance.width / Math.max(80, atRadius * 2)));
      var sideOpen = angleDelta(angle, nest.sideOpening.angle) <=
        Math.asin(Math.min(0.92, nest.sideOpening.width / Math.max(80, atRadius * 2)));
      if (radial < 0.82 || mainOpen || sideOpen) nav.grid[y][x] = 1;
      else if (radial <= 1.13) nav.grid[y][x] = 0;
    }
    [nest.mainEntrance, nest.sideOpening].forEach(function (opening) {
      var half = Math.max(2, Math.ceil(opening.width / nav.cell / 2));
      var length = nest.rx + 64;
      for (var step = 0; step <= length; step += nav.cell / 2) {
        var cx = nest.x + Math.cos(opening.angle) * step;
        var cy = nest.y + Math.sin(opening.angle) * step;
        var px = -Math.sin(opening.angle), py = Math.cos(opening.angle);
        for (var offset = -half; offset <= half; offset++) {
          var gx = Math.floor((cx + px * offset * nav.cell) / nav.cell);
          var gy = Math.floor((cy + py * offset * nav.cell) / nav.cell);
          if (gx > 0 && gy > 0 && gx < nav.w - 1 && gy < nav.h - 1) nav.grid[gy][gx] = 1;
        }
      }
    });
  }
  function syncSurface(layout, region) {
    var nav = layout.nav, ratio = nav.cell / layout.cell;
    var blockedColors = [U.shade(region.terrain.base.colors[0], 0.48),
      U.shade(region.terrain.base.colors[1] || region.terrain.base.colors[0], 0.38), '#171525'];
    for (var y = 0; y < nav.h; y++) for (var x = 0; x < nav.w; x++) {
      for (var oy = 0; oy < ratio; oy++) for (var ox = 0; ox < ratio; ox++) {
        var sx = x * ratio + ox, sy = y * ratio + oy, index = sy * layout.gw + sx;
        if (index < 0 || index >= layout.grid.length) continue;
        if (nav.grid[y][x]) {
          if (layout.grid[index] === 'blocked' || layout.grid[index] === 'void') {
            layout.grid[index] = region.terrain.base.mat;
            layout.colorGrid[index] = region.terrain.base.colors;
          }
        } else {
          layout.grid[index] = 'blocked'; layout.colorGrid[index] = blockedColors;
        }
      }
    }
  }
  function relocateConflicts(layout, nests) {
    var nav = layout.nav;
    var lists = [layout.landmarks, layout.nodes, layout.curios, layout.ecology,
      layout.threats, layout.hazardAnchors];
    lists.forEach(function (list) {
      (list || []).forEach(function (item) {
        var conflict = nests.some(function (nest) { return pointInside(nest, item.x, item.y, 1.25); });
        if (!conflict) return;
        var next = projected(nav, item.x, item.y, 2, function (point) {
          return nests.every(function (nest) { return !pointInside(nest, point.x, point.y, 1.28); });
        });
        item.x = next.x; item.y = next.y;
      });
    });
  }
  function chooseCenters(layout, count) {
    var candidates = (layout.macro.centers || []).slice(2).filter(function (center) {
      return U.dist(center.x, center.y, layout.camp.x, layout.camp.y) > 420 &&
        U.dist(center.x, center.y, layout.bossPoint.x, layout.bossPoint.y) > 260;
    });
    candidates.sort(function (a, b) { return a.x - b.x || a.id.localeCompare(b.id); });
    if (count === 1) return [candidates[Math.max(0, Math.floor(candidates.length * 0.76))] || layout.macro.centers[3]];
    return [
      candidates[Math.max(0, Math.floor(candidates.length * 0.42))] || layout.macro.centers[2],
      candidates[Math.max(0, Math.floor(candidates.length * 0.82))] || layout.macro.centers[3]
    ];
  }
  function decorate(region, layout) {
    var independentNestSeed = nestSeed(layout.worldSeed, region.id, layout.attempt);
    var rng = U.seededRng(independentNestSeed);
    var count = 1 + (rng() < 0.5 ? 1 : 0), centers = chooseCenters(layout, count);
    var nests = centers.map(function (center, index) {
      var rx = Math.round(96 + rng() * 36), ry = Math.round(76 + rng() * 28);
      var mainAngle = Math.atan2(layout.camp.y - center.y, layout.camp.x - center.x);
      var sideAngle = mainAngle + (rng() < 0.5 ? -1 : 1) * (1.72 + rng() * 0.42);
      return {
        kind: 'nest', id: region.id + ':nest:' + index,
        defId: region.id + ':nest:' + index,
        depth: count === 1 || index === count - 1 ? 'deep' : 'mid',
        x: center.x, y: center.y, rx: rx, ry: ry, wallThickness: 18,
        mainEntrance: { angle: mainAngle, width: 72 },
        sideOpening: { angle: sideAngle, width: 56 },
        geometryVersion: 1
      };
    });
    nests.forEach(function (nest) { rasterNest(layout.nav, nest); });
    computeDistance(layout.nav);
    relocateConflicts(layout, nests);
    var connected = reachability(layout);
    function inCampComponent(point) {
      var gx = Math.floor(point.x / layout.nav.cell), gy = Math.floor(point.y / layout.nav.cell);
      return !!connected[gy * layout.nav.w + gx];
    }
    var treasures = [], guardSites = [];
    nests.forEach(function (nest, index) {
      var backAngle = nest.mainEntrance.angle + Math.PI;
      var chestPoint = projected(layout.nav,
        nest.x + Math.cos(backAngle) * nest.rx * 0.58,
        nest.y + Math.sin(backAngle) * nest.ry * 0.58, 2, inCampComponent);
      var guardPoint = projected(layout.nav,
        nest.x + Math.cos(backAngle) * nest.rx * 0.16,
        nest.y + Math.sin(backAngle) * nest.ry * 0.16, 2, inCampComponent);
      var mode = count > 1 ? (index === 0 ? 'visible' : 'ambush') : (rng() < 0.5 ? 'visible' : 'ambush');
      var treasureId = region.id + ':nest-treasure:' + index;
      treasures.push({ kind: 'nestTreasure', id: treasureId, nestId: nest.id,
        depth: nest.depth, x: chestPoint.x, y: chestPoint.y, locked: true, ttl: null });
      guardSites.push({ kind: 'guardSite', id: region.id + ':nest-guard:' + index,
        targetKind: 'nestTreasure', targetId: treasureId, nestId: nest.id,
        mode: mode, x: guardPoint.x, y: guardPoint.y,
        profileId: 'guard-site.' + region.id + '.nest' });
      nest.treasureSiteId = treasureId;
      nest.guardSiteId = region.id + ':nest-guard:' + index;
    });
    var bossAngle = Math.atan2(layout.camp.y - layout.bossPoint.y, layout.camp.x - layout.bossPoint.x);
    var gate = projected(layout.nav, layout.bossPoint.x + Math.cos(bossAngle) * 78,
      layout.bossPoint.y + Math.sin(bossAngle) * 78, 2, inCampComponent);
    layout.bossGatePoint = { kind: 'bossGate', id: region.id + ':boss-gate', x: gate.x, y: gate.y };
    layout.guardian.x = gate.x; layout.guardian.y = gate.y; layout.guardian.radius = 168;
    layout.guardian.bossGate = true;
    guardSites.push({ kind: 'guardSite', id: region.id + ':boss-gate-guard',
      targetKind: 'bossGate', targetId: layout.bossGatePoint.id, mode: 'visible',
      x: gate.x, y: gate.y, profileId: 'guard-site.' + region.id + '.bossGate' });
    var rareCenter = (layout.macro.centers || []).filter(function (center) {
      return center.x > layout.world.w * 0.42 && center.x < layout.world.w * 0.76;
    })[0] || layout.macro.centers[2];
    var rarePoint = projected(layout.nav, rareCenter.x + 46, rareCenter.y - 38, 2,
      function (point) { return inCampComponent(point) && nests.every(function (nest) {
        return !pointInside(nest, point.x, point.y, 1.2);
      }); });
    layout.rareThreats = [{ kind: 'rareThreat', id: region.id + ':rare:0',
      x: rarePoint.x, y: rarePoint.y, radius: 128, danger: 0.72 }];
    layout.nests = nests; layout.treasureSites = treasures; layout.guardSites = guardSites;
    layout.version = 4;
    // Keep the entire v3 base seed identity intact. Nest geometry owns a
    // dedicated stream so adding future nest draws cannot perturb v3 terrain.
    layout.seeds.nests = independentNestSeed;
    layout.generation.v4 = { nestCount: nests.length, treasureCount: treasures.length,
      guardSiteCount: guardSites.length };
    syncSurface(layout, region);
    return layout;
  }
  function reachability(layout) {
    var nav = layout.nav, sx = Math.floor(layout.camp.x / nav.cell), sy = Math.floor(layout.camp.y / nav.cell);
    var seen = new Uint8Array(nav.w * nav.h), queue = [sy * nav.w + sx], head = 0;
    seen[queue[0]] = 1;
    while (head < queue.length) {
      var at = queue[head++], x = at % nav.w, y = (at / nav.w) | 0;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (offset) {
        var nx = x + offset[0], ny = y + offset[1], ni = ny * nav.w + nx;
        if (nx < 0 || ny < 0 || nx >= nav.w || ny >= nav.h || seen[ni] || !nav.grid[ny][nx]) return;
        seen[ni] = 1; queue.push(ni);
      });
    }
    return seen;
  }
  function validateV4(layout) {
    var failures = [], seen = reachability(layout), nav = layout.nav;
    if (!layout.nests || layout.nests.length < 1 || layout.nests.length > 2) failures.push({ code: 'nest-count' });
    (layout.nests || []).forEach(function (nest) {
      if (nest.mainEntrance.width < 64) failures.push({ code: 'nest-main-opening', id: nest.id });
      if (nest.sideOpening.width < 48) failures.push({ code: 'nest-side-opening', id: nest.id });
    });
    var targets = [].concat(layout.treasureSites || [], layout.guardSites || [], layout.rareThreats || [], layout.bossGatePoint || []);
    targets.forEach(function (target) {
      var gx = Math.floor(target.x / nav.cell), gy = Math.floor(target.y / nav.cell);
      if (!seen[gy * nav.w + gx]) failures.push({ code: 'unreachable-v4-target', id: target.id });
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) failures.push({ code: 'nan-v4-target', id: target.id });
    });
    if ((layout.treasureSites || []).length !== (layout.nests || []).length) failures.push({ code: 'nest-treasure-count' });
    var metrics = Object.assign({}, layout.generation && layout.generation.metrics || {}, {
      nests: (layout.nests || []).length, nestTreasures: (layout.treasureSites || []).length,
      guardSites: (layout.guardSites || []).length, rareThreats: (layout.rareThreats || []).length,
      connectedV4Targets: targets.length - failures.filter(function (f) { return f.code === 'unreachable-v4-target'; }).length
    });
    return { valid: failures.length === 0, failures: failures, suggestions: [], metrics: metrics };
  }

  T.generate = function (region, worldSeed, layoutVersion) {
    layoutVersion = layoutVersion === undefined ? 4 : layoutVersion;
    if (layoutVersion !== 4) return generateV3.call(T, region, worldSeed, layoutVersion);
    worldSeed = worldSeed === undefined && Game.state ? Game.state.world.worldSeed : worldSeed;
    return decorate(region, generateV3.call(T, region, worldSeed, 3));
  };
  T.validate = function (layout) {
    return layout && layout.version === 4 ? validateV4(layout) : validateV3.call(T, layout);
  };
  T.mount = function (layout, region) { return mountV3.call(T, layout, region); };
  T.build = function (region, worldSeed, layoutVersion) {
    layoutVersion = layoutVersion === undefined ?
      (Game.state ? Game.state.world.layoutVersion : 4) : layoutVersion;
    if (layoutVersion !== 4) return buildV3.call(T, region, worldSeed, layoutVersion);
    return mountV3.call(T, T.generate(region, worldSeed, 4), region);
  };
  T.snapshotV4 = function (layout) {
    layout = layout || T.layout;
    var base = T.snapshotV3(layout);
    base.nests = (layout.nests || []).map(function (nest) {
      return [nest.id, nest.depth, nest.x, nest.y, nest.rx, nest.ry,
        +nest.mainEntrance.angle.toFixed(6), nest.mainEntrance.width,
        +nest.sideOpening.angle.toFixed(6), nest.sideOpening.width];
    });
    base.treasures = (layout.treasureSites || []).map(function (site) {
      return [site.id, site.nestId, site.depth, site.x, site.y];
    });
    base.guards = (layout.guardSites || []).map(function (site) {
      return [site.id, site.targetKind, site.targetId, site.mode, site.x, site.y];
    });
    base.rareThreats = (layout.rareThreats || []).map(function (site) {
      return [site.id, site.x, site.y, site.radius];
    });
    base.bossGate = layout.bossGatePoint ?
      [layout.bossGatePoint.id, layout.bossGatePoint.x, layout.bossGatePoint.y] : null;
    return base;
  };
  T.v4 = { validate: validateV4, nestSeed: nestSeed };
})();
