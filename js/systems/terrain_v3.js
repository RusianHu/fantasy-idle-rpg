/* ============================================================
 * systems/terrain_v3.js — 开放远征布局 v3
 *
 * v1/v2 生成器永久保留在 terrain.js。本模块仅在 layoutVersion=3
 * 时接管 generate/validate/repair/mount，并为大地图提供硬阻挡、
 * 合法点投影、距离场、宏观拓扑、区块与空间桶元数据。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;
  var T = Game.terrain;
  var legacyBuild = T.build;

  var WORLD_W = 2400;
  var WORLD_H = 1440;
  var NAV = 16;
  var CELL = 8;
  var BOUND_TOP = 68;
  var CHUNK = 512;
  var STREAMS = ['macro', 'field', 'blockers', 'landmarks', 'resources', 'curios', 'threats', 'hazards', 'details'];

  function seedFor(worldSeed, regionId, stream, attempt) {
    return U.strSeed((worldSeed >>> 0) + ':' + regionId + ':3:' + stream + ':' + (attempt || 0));
  }

  function hash2(x, y, seed) {
    var h = Math.imul((x | 0) ^ seed, 374761393);
    h = Math.imul(h ^ Math.imul(y | 0, 668265263), 1274126177);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  function smoothNoise(x, y, scale, seed) {
    var fx = x / scale, fy = y / scale;
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var tx = fx - x0, ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    var a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
    var c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  }

  function edgeKey(a, b) {
    return a < b ? a + ':' + b : b + ':' + a;
  }

  function pointOnEdge(a, b, bend, t) {
    var mx = (a.x + b.x) * 0.5 + bend.x;
    var my = (a.y + b.y) * 0.5 + bend.y;
    var q = 1 - t;
    return {
      x: q * q * a.x + 2 * q * t * mx + t * t * b.x,
      y: q * q * a.y + 2 * q * t * my + t * t * b.y
    };
  }

  function makeMacro(region, worldSeed, attempt) {
    var rng = U.seededRng(seedFor(worldSeed, region.id, 'macro', attempt));
    var count = 14 + Math.floor(rng() * 5);
    var centers = [
      { id: 'm0', role: 'camp', x: Math.round(WORLD_W * (0.085 + rng() * 0.045)), y: Math.round(260 + rng() * 900) },
      { id: 'm1', role: 'boss', x: Math.round(WORLD_W * (0.84 + rng() * 0.07)), y: Math.round(250 + rng() * 920) }
    ];
    var upper = centers[0].y > WORLD_H * 0.5 ? 250 : 1130;
    centers.push({ id: 'm2', role: 'alternate', x: Math.round(WORLD_W * 0.36), y: upper });
    centers.push({ id: 'm3', role: 'alternate', x: Math.round(WORLD_W * 0.68), y: U.clamp(upper + (rng() - 0.5) * 180, 180, WORLD_H - 150) });

    var cols = 5, rows = 3;
    for (var i = centers.length; i < count; i++) {
      var slot = i - 4;
      var col = slot % cols;
      var row = Math.floor(slot / cols) % rows;
      var x = 390 + col * 370 + (rng() - 0.5) * 190;
      var y = 220 + row * 440 + (rng() - 0.5) * 230;
      var tries = 0;
      while (tries++ < 20) {
        var clear = true;
        for (var ci = 0; ci < centers.length; ci++) {
          if (U.dist(x, y, centers[ci].x, centers[ci].y) < 185) { clear = false; break; }
        }
        if (clear) break;
        x = 250 + rng() * (WORLD_W - 500);
        y = 160 + rng() * (WORLD_H - 290);
      }
      centers.push({
        id: 'm' + i,
        role: 'basin',
        x: Math.round(U.clamp(x, 150, WORLD_W - 150)),
        y: Math.round(U.clamp(y, BOUND_TOP + 90, WORLD_H - 100))
      });
    }

    var candidates = [];
    for (var a = 0; a < centers.length; a++) {
      for (var b = a + 1; b < centers.length; b++) {
        candidates.push({ a: a, b: b, d: U.dist(centers[a].x, centers[a].y, centers[b].x, centers[b].y) });
      }
    }
    candidates.sort(function (a, b) { return a.d - b.d; });

    var parent = centers.map(function (_, idx) { return idx; });
    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function join(a, b) {
      a = find(a); b = find(b);
      if (a === b) return false;
      parent[b] = a;
      return true;
    }

    var edges = [], used = {};
    function addEdge(a, b, kind) {
      var key = edgeKey(a, b);
      if (used[key]) return false;
      used[key] = true;
      var ca = centers[a], cb = centers[b];
      var dx = cb.x - ca.x, dy = cb.y - ca.y;
      var len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      var side = rng() < 0.5 ? -1 : 1;
      var bendMag = Math.min(110, len * (0.08 + rng() * 0.08));
      edges.push({
        id: 'e' + edges.length,
        a: a, b: b,
        kind: kind || 'main',
        width: kind === 'alternate' ? 72 : (64 + Math.floor(rng() * 33)),
        danger: +(0.15 + rng() * 0.75).toFixed(2),
        bend: { x: -dy / len * bendMag * side, y: dx / len * bendMag * side },
        length: Math.round(len)
      });
      return true;
    }

    for (var c = 0; c < candidates.length && edges.length < centers.length - 1; c++) {
      if (join(candidates[c].a, candidates[c].b)) addEdge(candidates[c].a, candidates[c].b, 'main');
    }
    // 明确建立一条与主树显著不同的营地—巢穴路线。
    addEdge(0, 2, 'alternate');
    addEdge(2, 3, 'alternate');
    addEdge(3, 1, 'alternate');

    var loopsWanted = 3 + Math.floor(rng() * 3);
    for (c = 0; c < candidates.length && loopsWanted > 0; c++) {
      var ce = candidates[c];
      if (ce.d < 220 || ce.d > 720 || used[edgeKey(ce.a, ce.b)]) continue;
      addEdge(ce.a, ce.b, 'loop');
      loopsWanted--;
    }

    return {
      preset: region.exploration && region.exploration.macroPreset || 'open-field',
      centers: centers,
      edges: edges,
      loopRank: Math.max(0, edges.length - centers.length + 1),
      alternateRoute: [0, 2, 3, 1]
    };
  }

  function rasterField(region, worldSeed, attempt, macro) {
    var rng = U.seededRng(seedFor(worldSeed, region.id, 'blockers', attempt));
    var nw = Math.ceil(WORLD_W / NAV), nh = Math.ceil(WORLD_H / NAV);
    var flat = new Array(nw * nh);
    var protectedCells = new Uint8Array(nw * nh);
    var i;
    for (i = 0; i < flat.length; i++) flat[i] = 1;

    // 大块自然阻挡。形状按区域 preset 调整，但不写死区域 ID。
    var preset = macro.preset;
    var blockerCount = preset === 'open-field' ? 42
      : (preset === 'porous-forest' ? 42
        : (preset === 'ridge-pass' ? 31
          : (preset === 'island-chain' ? 35
            : (preset === 'ruined-fortress' ? 40 : 32))));
    var blockers = [];
    for (i = 0; i < blockerCount; i++) {
      var longAxis = (preset === 'ridge-pass' || preset === 'island-chain') && i < 8;
      blockers.push({
        x: 80 + rng() * (WORLD_W - 160),
        y: BOUND_TOP + 50 + rng() * (WORLD_H - BOUND_TOP - 100),
        rx: longAxis ? 70 + rng() * 110 : 55 + rng() * 150,
        ry: longAxis ? 150 + rng() * 240 : 45 + rng() * 125,
        phase: rng() * 20
      });
    }

    for (var gy = 0; gy < nh; gy++) {
      for (var gx = 0; gx < nw; gx++) {
        var wx = gx * NAV + NAV / 2, wy = gy * NAV + NAV / 2;
        if (gx < 2 || gy < Math.ceil(BOUND_TOP / NAV) || gx >= nw - 2 || gy >= nh - 2) {
          flat[gy * nw + gx] = 0;
          continue;
        }
        for (var bi = 0; bi < blockers.length; bi++) {
          var bl = blockers[bi];
          var wobble = 1 + Math.sin(gx * 0.31 + gy * 0.19 + bl.phase) * 0.13;
          var dx = (wx - bl.x) / (bl.rx * wobble);
          var dy = (wy - bl.y) / (bl.ry * wobble);
          if (dx * dx + dy * dy < 1) { flat[gy * nw + gx] = 0; break; }
        }
      }
    }

    function carveDisc(x, y, radius) {
      var minX = Math.max(1, Math.floor((x - radius) / NAV));
      var maxX = Math.min(nw - 2, Math.ceil((x + radius) / NAV));
      var minY = Math.max(Math.ceil(BOUND_TOP / NAV), Math.floor((y - radius) / NAV));
      var maxY = Math.min(nh - 2, Math.ceil((y + radius) / NAV));
      for (var yy = minY; yy <= maxY; yy++) {
        for (var xx = minX; xx <= maxX; xx++) {
          if (U.dist(xx * NAV + NAV / 2, yy * NAV + NAV / 2, x, y) <= radius) {
            flat[yy * nw + xx] = 1;
            protectedCells[yy * nw + xx] = 1;
          }
        }
      }
    }

    for (i = 0; i < macro.centers.length; i++) {
      var center = macro.centers[i];
      carveDisc(center.x, center.y, center.role === 'camp' ? 128 : (center.role === 'boss' ? 112 : 88 + (i % 3) * 22));
    }
    for (i = 0; i < macro.edges.length; i++) {
      var edge = macro.edges[i];
      var a = macro.centers[edge.a], b = macro.centers[edge.b];
      var samples = Math.max(8, Math.ceil(edge.length / 34));
      for (var s = 0; s <= samples; s++) {
        var p = pointOnEdge(a, b, edge.bend, s / samples);
        // 16px 距离场至少保留 3 格（48px）净宽，给 7px 圆形碰撞体
        // 和网格取整留下余量。
        carveDisc(p.x, p.y, edge.width / 2 + 18);
      }
    }

    // 只保留营地所在主连通分量，避免“看似可走但永远到不了”。
    var startX = Math.floor(macro.centers[0].x / NAV), startY = Math.floor(macro.centers[0].y / NAV);
    var seen = new Uint8Array(nw * nh);
    var queue = [startY * nw + startX], qi = 0;
    seen[queue[0]] = 1;
    while (qi < queue.length) {
      var at = queue[qi++], x0 = at % nw, y0 = (at / nw) | 0;
      var ns = [at - 1, at + 1, at - nw, at + nw];
      for (var ni = 0; ni < 4; ni++) {
        var nx = ns[ni] % nw, ny = (ns[ni] / nw) | 0;
        if (nx < 0 || ny < 0 || nx >= nw || ny >= nh || seen[ns[ni]] || !flat[ns[ni]]) continue;
        seen[ns[ni]] = 1;
        queue.push(ns[ni]);
      }
    }
    for (i = 0; i < flat.length; i++) if (flat[i] && !seen[i]) flat[i] = 0;

    var walkable = 0;
    for (i = 0; i < flat.length; i++) walkable += flat[i] ? 1 : 0;
    var usable = nw * (nh - Math.ceil(BOUND_TOP / NAV));
    var ratio = walkable / usable;
    // 目标 60–70%。不足时沿主连通边界确定性扩张；过高时保留，
    // validate 会记录指标，避免为了数字破坏已经形成的连续空间。
    var passes = 0;
    while (ratio < 0.60 && passes++ < 8) {
      var changed = 0;
      var next = flat.slice();
      for (gy = Math.ceil(BOUND_TOP / NAV) + 1; gy < nh - 2; gy++) {
        for (gx = 2; gx < nw - 2; gx++) {
          var idx = gy * nw + gx;
          if (flat[idx]) continue;
          var adjacent = flat[idx - 1] + flat[idx + 1] + flat[idx - nw] + flat[idx + nw];
          if (adjacent >= 2 && hash2(gx, gy, worldSeed ^ attempt) > 0.28) {
            next[idx] = 1; changed++;
          }
        }
      }
      flat = next;
      walkable += changed;
      ratio = walkable / usable;
      if (!changed) break;
    }
    if (ratio > 0.70) {
      var removable = [];
      for (gy = Math.ceil(BOUND_TOP / NAV) + 1; gy < nh - 2; gy++) {
        for (gx = 2; gx < nw - 2; gx++) {
          var ridx = gy * nw + gx;
          if (flat[ridx] && !protectedCells[ridx]) {
            removable.push({ idx: ridx, score: hash2(gx, gy, worldSeed ^ 0x74b2) });
          }
        }
      }
      removable.sort(function (a, b) { return a.score - b.score; });
      var desired = Math.ceil(usable * 0.695);
      for (var rm = 0; rm < removable.length && walkable > desired; rm++) {
        flat[removable[rm].idx] = 0;
        walkable--;
      }
      ratio = walkable / usable;
    }
    // 关闭过度开阔区域后再次裁掉孤岛；宏观连接带全部受保护。
    seen = new Uint8Array(nw * nh);
    queue = [startY * nw + startX]; qi = 0;
    seen[queue[0]] = 1;
    while (qi < queue.length) {
      var cat = queue[qi++], cx0 = cat % nw, cy0 = (cat / nw) | 0;
      var cns = [cat - 1, cat + 1, cat - nw, cat + nw];
      for (var cni = 0; cni < 4; cni++) {
        var cnx = cns[cni] % nw, cny = (cns[cni] / nw) | 0;
        if (cnx < 0 || cny < 0 || cnx >= nw || cny >= nh ||
            seen[cns[cni]] || !flat[cns[cni]]) continue;
        seen[cns[cni]] = 1; queue.push(cns[cni]);
      }
    }
    walkable = 0;
    for (i = 0; i < flat.length; i++) {
      if (flat[i] && !seen[i]) flat[i] = 0;
      if (flat[i]) walkable++;
    }
    ratio = walkable / usable;

    // Boss 点不是普通空地上的一组装饰，而是导航层真实存在的战斗房：
    // 中央保持开阔，外围用不可通行的椭圆墙带分隔；所有实际接入 Boss
    // 中心的宏观道路都会在墙带上切出门洞，视觉层复用同一份几何数据。
    var bossCenter = macro.centers[1];
    var bossDef = region.exploration && region.exploration.landmarks &&
      region.exploration.landmarks[3];
    var territory = bossDef && bossDef.territory || {};
    var arenaRx = U.clamp(territory.radius || 126, 104, 160);
    var arenaSquash = U.clamp(territory.squash || 0.64, 0.52, 0.78);
    var arenaRy = arenaRx * arenaSquash;
    var wallThickness = U.clamp(territory.wallThickness || 24, 18, 32);
    var doorHalfAngle = U.clamp(territory.doorHalfAngle || 0.56, 0.42, 0.72);
    var arenaDoors = [];

    function normalizedArenaAngle(x, y) {
      return Math.atan2((y - bossCenter.y) / arenaRy, (x - bossCenter.x) / arenaRx);
    }
    function angleDelta(a, b) {
      return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    }
    function addArenaDoor(angle, edgeId, kind) {
      for (var adi = 0; adi < arenaDoors.length; adi++) {
        if (angleDelta(angle, arenaDoors[adi].angle) < 0.12) return;
      }
      arenaDoors.push({ angle: angle, edgeId: edgeId || null, kind: kind || 'main' });
    }

    for (var aei = 0; aei < macro.edges.length; aei++) {
      var arenaEdge = macro.edges[aei];
      if (arenaEdge.a !== 1 && arenaEdge.b !== 1) continue;
      var edgeA = macro.centers[arenaEdge.a], edgeB = macro.centers[arenaEdge.b];
      // 在曲线上搜索与椭圆墙带的实际交点，让门洞精确接上弯曲道路。
      var arenaSample = bossCenter;
      var arenaSampleError = Infinity;
      for (var asi = 1; asi <= 32; asi++) {
        var arenaT = arenaEdge.a === 1 ? asi / 32 : 1 - asi / 32;
        var sampleCandidate = pointOnEdge(edgeA, edgeB, arenaEdge.bend, arenaT);
        var sampleNx = (sampleCandidate.x - bossCenter.x) / arenaRx;
        var sampleNy = (sampleCandidate.y - bossCenter.y) / arenaRy;
        var sampleError = Math.abs(Math.sqrt(sampleNx * sampleNx + sampleNy * sampleNy) - 1);
        if (sampleError < arenaSampleError) {
          arenaSampleError = sampleError;
          arenaSample = sampleCandidate;
        }
      }
      addArenaDoor(normalizedArenaAngle(arenaSample.x, arenaSample.y), arenaEdge.id, arenaEdge.kind);
    }
    // 极端拓扑下仍至少保留一个面向营地的主入口。
    if (!arenaDoors.length) {
      addArenaDoor(normalizedArenaAngle(macro.centers[0].x, macro.centers[0].y), null, 'main');
    }

    var wallNorm = wallThickness / Math.max(1, Math.min(arenaRx, arenaRy)) * 0.55;
    var arenaMinX = Math.max(2, Math.floor((bossCenter.x - arenaRx - wallThickness) / NAV));
    var arenaMaxX = Math.min(nw - 3, Math.ceil((bossCenter.x + arenaRx + wallThickness) / NAV));
    var arenaMinY = Math.max(Math.ceil(BOUND_TOP / NAV) + 1,
      Math.floor((bossCenter.y - arenaRy - wallThickness) / NAV));
    var arenaMaxY = Math.min(nh - 3, Math.ceil((bossCenter.y + arenaRy + wallThickness) / NAV));
    for (gy = arenaMinY; gy <= arenaMaxY; gy++) {
      for (gx = arenaMinX; gx <= arenaMaxX; gx++) {
        var arenaWx = gx * NAV + NAV / 2;
        var arenaWy = gy * NAV + NAV / 2;
        var arenaNx = (arenaWx - bossCenter.x) / arenaRx;
        var arenaNy = (arenaWy - bossCenter.y) / arenaRy;
        var arenaNorm = Math.sqrt(arenaNx * arenaNx + arenaNy * arenaNy);
        var arenaIdx = gy * nw + gx;
        if (arenaNorm < 1 - wallNorm) {
          flat[arenaIdx] = 1;
          protectedCells[arenaIdx] = 1;
          continue;
        }
        if (Math.abs(arenaNorm - 1) > wallNorm) continue;
        var arenaAngle = Math.atan2(arenaNy, arenaNx);
        var throughDoor = false;
        for (var doorIndex = 0; doorIndex < arenaDoors.length; doorIndex++) {
          if (angleDelta(arenaAngle, arenaDoors[doorIndex].angle) <= doorHalfAngle) {
            throughDoor = true;
            break;
          }
        }
        flat[arenaIdx] = throughDoor ? 1 : 0;
        protectedCells[arenaIdx] = 1;
      }
    }

    walkable = 0;
    for (i = 0; i < flat.length; i++) if (flat[i]) walkable++;
    ratio = walkable / usable;
    var bossArena = {
      x: bossCenter.x, y: bossCenter.y,
      rx: arenaRx, ry: arenaRy,
      wallThickness: wallThickness,
      doorHalfAngle: doorHalfAngle,
      floorScale: 1 - wallNorm * 1.25,
      doors: arenaDoors
    };

    var grid = [], costs = [], centersAt = [], danger = [];
    var matChoices = [region.terrain.base.mat];
    for (i = 0; i < region.terrain.patches.length; i++) {
      var pm = region.terrain.patches[i].mat;
      if (pm !== 'lava' && pm !== 'void') matChoices.push(pm);
    }
    for (gy = 0; gy < nh; gy++) {
      var row = [], costRow = [], centerRow = [], dangerRow = [];
      for (gx = 0; gx < nw; gx++) {
        var open = flat[gy * nw + gx] ? 1 : 0;
        row.push(open);
        var soft = 1 + hash2(gx >> 2, gy >> 2, worldSeed) * 0.18;
        costRow.push(open ? +soft.toFixed(2) : 0);
        var bestCenter = 0, bestD = Infinity;
        for (var mc = 0; mc < macro.centers.length; mc++) {
          var md = U.dist(gx * NAV, gy * NAV, macro.centers[mc].x, macro.centers[mc].y);
          if (md < bestD) { bestD = md; bestCenter = mc; }
        }
        centerRow.push(bestCenter);
        dangerRow.push(open ? +(hash2(gx >> 1, gy >> 1, worldSeed ^ 0x93a4) * 0.38).toFixed(2) : 1);
      }
      grid.push(row); costs.push(costRow); centersAt.push(centerRow); danger.push(dangerRow);
    }

    // 多源 BFS 阻挡距离（单位：导航格）。
    var distance = [];
    var dq = [], dqi = 0;
    for (gy = 0; gy < nh; gy++) {
      distance[gy] = [];
      for (gx = 0; gx < nw; gx++) {
        if (!grid[gy][gx]) { distance[gy][gx] = 0; dq.push(gy * nw + gx); }
        else distance[gy][gx] = 999;
      }
    }
    while (dqi < dq.length) {
      var da = dq[dqi++], dx0 = da % nw, dy0 = (da / nw) | 0;
      var dd = distance[dy0][dx0] + 1;
      var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (var di = 0; di < dirs.length; di++) {
        var xx0 = dx0 + dirs[di][0], yy0 = dy0 + dirs[di][1];
        if (xx0 < 0 || yy0 < 0 || xx0 >= nw || yy0 >= nh || distance[yy0][xx0] <= dd) continue;
        distance[yy0][xx0] = dd; dq.push(yy0 * nw + xx0);
      }
    }

    return {
      cell: NAV, w: nw, h: nh, grid: grid, flat: flat, costs: costs,
      macroCenter: centersAt, danger: danger, distance: distance,
      blockers: blockers, bossArena: bossArena, walkableRatio: ratio
    };
  }

  function project(nav, x, y, minDistance) {
    var gx = U.clamp(Math.floor(x / nav.cell), 0, nav.w - 1);
    var gy = U.clamp(Math.floor(y / nav.cell), 0, nav.h - 1);
    minDistance = minDistance || 1;
    if (nav.grid[gy][gx] && nav.distance[gy][gx] >= minDistance) {
      return { x: gx * nav.cell + nav.cell / 2, y: gy * nav.cell + nav.cell / 2, gx: gx, gy: gy };
    }
    for (var r = 1; r < Math.max(nav.w, nav.h); r++) {
      for (var yy = gy - r; yy <= gy + r; yy++) {
        for (var xx = gx - r; xx <= gx + r; xx++) {
          if (xx < 0 || yy < 0 || xx >= nav.w || yy >= nav.h) continue;
          if (Math.abs(xx - gx) !== r && Math.abs(yy - gy) !== r) continue;
          if (nav.grid[yy][xx] && nav.distance[yy][xx] >= minDistance) {
            return { x: xx * nav.cell + nav.cell / 2, y: yy * nav.cell + nav.cell / 2, gx: xx, gy: yy };
          }
        }
      }
    }
    return null;
  }

  function pointNearCenter(nav, center, rng, radius, minDistance) {
    for (var tries = 0; tries < 60; tries++) {
      var a = rng() * Math.PI * 2;
      var rr = 24 + rng() * radius;
      var p = project(nav, center.x + Math.cos(a) * rr, center.y + Math.sin(a) * rr, minDistance || 2);
      if (p) return p;
    }
    return project(nav, center.x, center.y, minDistance || 2);
  }

  function contentFor(region, worldSeed, attempt, macro, nav) {
    var cfg = region.exploration;
    var landmarkRng = U.seededRng(seedFor(worldSeed, region.id, 'landmarks', attempt));
    var resourceRng = U.seededRng(seedFor(worldSeed, region.id, 'resources', attempt));
    var curioRng = U.seededRng(seedFor(worldSeed, region.id, 'curios', attempt));
    var threatRng = U.seededRng(seedFor(worldSeed, region.id, 'threats', attempt));
    var used = {};

    function reserve(p, radius) {
      if (!p) return null;
      for (var key in used) {
        var q = used[key];
        if (U.dist(p.x, p.y, q.x, q.y) < Math.max(radius || 40, q.radius || 40)) return null;
      }
      used['p' + Object.keys(used).length] = { x: p.x, y: p.y, radius: radius || 40 };
      return p;
    }
    function findPoint(center, rng, radius, spacing) {
      for (var n = 0; n < 80; n++) {
        var p = pointNearCenter(nav, center, rng, radius, 2);
        if (reserve(p, spacing)) return p;
      }
      return project(nav, center.x, center.y, 1);
    }

    var camp = project(nav, macro.centers[0].x, macro.centers[0].y, 3);
    var bossPoint = project(nav, macro.centers[1].x, macro.centers[1].y, 4);
    reserve(camp, 120); reserve(bossPoint, 105);

    var landmarkDefs = cfg.landmarks || [];
    var landmarks = [];
    for (var li = 0; li < 3; li++) {
      var lcenter = macro.centers[4 + (li * 3) % Math.max(1, macro.centers.length - 4)] || macro.centers[2 + li];
      var lp = findPoint(lcenter, landmarkRng, 100, 95);
      var ld = landmarkDefs[li] || { id: 'landmark_' + li, function: 'intel', sprite: 'exp_landmark' };
      landmarks.push({
        kind: 'landmark', id: region.id + ':landmark:' + ld.id,
        defId: ld.id, nameKey: ld.nameKey, function: ld.function || 'intel',
        sprite: ld.sprite || 'exp_landmark', x: lp.x, y: lp.y, discovered: false
      });
    }
    var lairDef = landmarkDefs[3] || { id: 'boss_lair', function: 'boss', sprite: 'exp_boss_lair' };
    var approachAngle = Math.atan2(camp.y - bossPoint.y, camp.x - bossPoint.x);
    landmarks.push({
      kind: 'landmark', id: region.id + ':landmark:' + lairDef.id,
      defId: lairDef.id, nameKey: lairDef.nameKey, function: 'boss',
      sprite: lairDef.sprite || 'exp_boss_lair', x: bossPoint.x, y: bossPoint.y, discovered: false,
      bossLair: true, territory: lairDef.territory || null,
      approachAngle: approachAngle, shadow: true, large: true
    });

    var resourceDefs = cfg.resources || [];
    var nodes = [];
    var counts = [4, 4, 4, 3, 3];
    if (resourceRng() > 0.55) counts[Math.floor(resourceRng() * counts.length)]++;
    for (var ri = 0; ri < resourceDefs.length; ri++) {
      var rd = resourceDefs[ri];
      for (var rn = 0; rn < counts[ri % counts.length]; rn++) {
        var rc = macro.centers[2 + ((ri * 3 + rn * 2) % Math.max(1, macro.centers.length - 2))];
        var rp = findPoint(rc, resourceRng, 135, 38);
        nodes.push({
          kind: 'gatherNode',
          id: region.id + ':resource:' + rd.id + ':' + rn,
          defId: rd.id, nameKey: rd.nameKey,
          sprite: rd.sprite, material: rd.material,
          color: rd.color, accent: rd.accent,
          rarity: rd.rarity || 'common',
          x: rp.x, y: rp.y,
          phase: (U.strSeed(region.id + ':resource:' + rd.id + ':' + rn) % 628) / 100,
          cooldown: rd.rarity === 'rare'
            ? Math.round(900 + resourceRng() * 600)
            : Math.round(480 + resourceRng() * 240)
        });
      }
    }

    var curios = [];
    var curioDefs = cfg.curios || [];
    for (var ui = 0; ui < 3; ui++) {
      var uc = macro.centers[3 + ((ui * 4 + 2) % Math.max(1, macro.centers.length - 3))];
      var up = findPoint(uc, curioRng, 105, 80);
      var ud = curioDefs[ui] || { id: 'curio_' + ui, sprite: 'exp_curio' };
      curios.push({
        kind: 'curio', id: region.id + ':curio:' + ud.id, defId: ud.id,
        nameKey: ud.nameKey, sprite: ud.sprite || 'exp_curio',
        choices: ud.choices || ['scout', 'fortune'], x: up.x, y: up.y
      });
    }

    var ecology = [];
    var ecoDefs = cfg.ecology || [];
    for (var ei = 0; ei < 2; ei++) {
      var ec = macro.centers[5 + ((ei * 5) % Math.max(1, macro.centers.length - 5))] || macro.centers[2 + ei];
      var ep = findPoint(ec, curioRng, 90, 65);
      var ed = ecoDefs[ei] || { id: 'ecology_' + ei };
      ecology.push({
        kind: 'ecology', id: region.id + ':ecology:' + ed.id, defId: ed.id,
        nameKey: ed.nameKey, sprite: ed.sprite || 'exp_ecology', x: ep.x, y: ep.y
      });
    }

    var threats = [];
    var threatDefs = cfg.threats || [];
    var threatCount = 6 + Math.floor(threatRng() * 4);
    for (var ti = 0; ti < threatCount; ti++) {
      var tc = macro.centers[2 + (ti % Math.max(1, macro.centers.length - 2))];
      var tp = pointNearCenter(nav, tc, threatRng, 72, 3);
      var td = threatDefs[ti % threatDefs.length] || { id: 'patrol' };
      threats.push({
        kind: 'threat', id: region.id + ':threat:' + ti, defId: td.id,
        nameKey: td.nameKey, x: tp.x, y: tp.y,
        radius: 100 + Math.round(threatRng() * 65),
        danger: +(0.3 + threatRng() * 0.65).toFixed(2),
        affix: (cfg.affixes || ['alert', 'sturdy', 'swift'])[ti % (cfg.affixes || ['alert']).length],
        monster: region.monsters[ti % region.monsters.length],
        respawn: Math.round(180 + threatRng() * 120)
      });
    }

    var guardianCenter = macro.centers[Math.max(4, macro.centers.length - 2)];
    var gp = findPoint(guardianCenter, threatRng, 75, 95);
    var guardian = {
      kind: 'guardian', id: region.id + ':guardian',
      nameKey: cfg.guardian && cfg.guardian.nameKey,
      sprite: cfg.guardian && cfg.guardian.sprite,
      monster: cfg.guardian && cfg.guardian.monster || region.monsters[1] || region.monsters[0],
      x: gp.x, y: gp.y, radius: 120
    };

    return {
      camp: camp, bossPoint: bossPoint, landmarks: landmarks, nodes: nodes,
      curios: curios, ecology: ecology, threats: threats, guardian: guardian
    };
  }

  function hazardAnchorsFor(region, worldSeed, attempt, macro, nav, content) {
    var rng = U.seededRng(seedFor(worldSeed, region.id, 'hazards', attempt));
    var anchors = [];
    var protectedPoints = [content.camp, content.bossPoint]
      .concat(content.landmarks || [], content.nodes || [], content.curios || []);
    function clear(point) {
      if (!point || U.dist(point.x, point.y, content.camp.x, content.camp.y) < 180) return false;
      if (U.dist(point.x, point.y, content.bossPoint.x, content.bossPoint.y) < 120) return false;
      for (var pi = 0; pi < protectedPoints.length; pi++) {
        var protectedPoint = protectedPoints[pi];
        if (!protectedPoint) continue;
        var spacing = protectedPoint.kind === 'gatherNode' ? 48 : 64;
        if (U.dist(point.x, point.y, protectedPoint.x, protectedPoint.y) < spacing) return false;
      }
      for (var ai = 0; ai < anchors.length; ai++) {
        if (U.dist(point.x, point.y, anchors[ai].x, anchors[ai].y) < 104) return false;
      }
      return true;
    }
    var targetCount = 8 + Math.floor(rng() * 3);
    for (var tries = 0; tries < 360 && anchors.length < targetCount; tries++) {
      var center = macro.centers[2 + (tries % Math.max(1, macro.centers.length - 2))];
      var point = pointNearCenter(nav, center, rng, 115, 3);
      if (!clear(point)) continue;
      anchors.push({
        kind: 'hazardAnchor',
        id: region.id + ':hazard-anchor:' + anchors.length,
        x: point.x, y: point.y,
        clearance: nav.distance[point.gy][point.gx] * nav.cell
      });
    }
    return anchors;
  }

  function legacySurface(region, worldSeed, attempt, macro, nav, content) {
    var gw = Math.ceil(WORLD_W / CELL), gh = Math.ceil(WORLD_H / CELL);
    var grid = new Array(gw * gh), colors = new Array(gw * gh);
    var water = [], lava = [];
    var base = region.terrain.base;
    var blockedPalette = [
      U.shade(base.colors[0], 0.48),
      U.shade(base.colors[1] || base.colors[0], 0.38),
      '#171525'
    ];
    var patchMats = region.terrain.patches.map(function (p) { return p; });
    for (var gy = 0; gy < gh; gy++) {
      for (var gx = 0; gx < gw; gx++) {
        var ngX = U.clamp(Math.floor((gx * CELL) / NAV), 0, nav.w - 1);
        var ngY = U.clamp(Math.floor((gy * CELL) / NAV), 0, nav.h - 1);
        var open = nav.grid[ngY][ngX];
        var idx = gy * gw + gx;
        if (!open) {
          grid[idx] = 'blocked';
          colors[idx] = blockedPalette;
          continue;
        }
        var wx = gx * CELL + CELL / 2, wy = gy * CELL + CELL / 2;
        var campGround = region.layout && region.layout.road && region.layout.road.mat || base.mat;
        if (campGround === 'water' || campGround === 'lava' || campGround === 'void') campGround = base.mat;
        var inCamp = U.dist(wx, wy, content.camp.x, content.camp.y) <= 92;
        var lair = content.landmarks[3];
        var territory = lair && lair.territory;
        var arena = nav.bossArena;
        var lairRx = arena ? arena.rx * arena.floorScale : 116;
        var lairRy = arena ? arena.ry * arena.floorScale : 76;
        var lairNx = (wx - content.bossPoint.x) / lairRx;
        var lairNy = (wy - content.bossPoint.y) / lairRy;
        var inLair = lairNx * lairNx + lairNy * lairNy <= 1;
        var broad = smoothNoise(gx, gy, 15, worldSeed ^ 0xa913);
        var fine = smoothNoise(gx + 37, gy - 19, 5.5, worldSeed ^ 0x4b71);
        var choose = broad * 0.72 + fine * 0.28;
        var typeNoise = smoothNoise(gx - 23, gy + 41, 18, worldSeed ^ 0x91d3);
        var pd = patchMats.length && choose > 0.67
          ? patchMats[Math.min(patchMats.length - 1, Math.floor(typeNoise * patchMats.length))]
          : null;
        var mat = inCamp ? campGround : (inLair ? base.mat : (pd ? pd.mat : base.mat));
        grid[idx] = mat;
        var lairGround = territory && territory.ground;
        var lairColors = lairGround
          ? [lairGround.fill, U.shade(lairGround.fill, 0.76), lairGround.edge]
          : base.colors;
        colors[idx] = inCamp
          ? (region.layout && region.layout.road && region.layout.road.colors || base.colors)
          : (inLair ? lairColors : (pd ? pd.colors : base.colors));
        if (mat === 'water') water.push(idx);
        if (mat === 'lava') lava.push(idx);
      }
    }

    var rng = U.seededRng(seedFor(worldSeed, region.id, 'details', attempt));
    var props = [], glows = [], tufts = [], flowers = [];
    var deco = region.terrain.deco || [];
    function placementOf(def) {
      return def.placement || (def.water ? 'water' : 'ground');
    }
    var blockerDeco = deco.filter(function (d) { return placementOf(d) === 'blocker'; });
    var groundDeco = deco.filter(function (d) { return placementOf(d) === 'ground'; });
    var waterDeco = deco.filter(function (d) { return placementOf(d) === 'water'; });
    if (!blockerDeco.length) blockerDeco = [{ sprite: 'deco_rock', count: 1, placement: 'blocker' }];
    function weighted(pool) {
      if (!pool.length) return null;
      var total = 0;
      for (var wi = 0; wi < pool.length; wi++) total += Math.max(1, pool[wi].count || 1);
      var roll = rng() * total;
      for (wi = 0; wi < pool.length; wi++) {
        roll -= Math.max(1, pool[wi].count || 1);
        if (roll <= 0) return pool[wi];
      }
      return pool[pool.length - 1];
    }
    var propBuckets = {};
    function propSpace(x, y, spacing) {
      var bx = Math.floor(x / 32), by = Math.floor(y / 32);
      for (var yy = by - 1; yy <= by + 1; yy++) {
        for (var xx = bx - 1; xx <= bx + 1; xx++) {
          var bucket = propBuckets[xx + ':' + yy] || [];
          for (var si = 0; si < bucket.length; si++) {
            if (U.dist(x, y, bucket[si].x, bucket[si].y) < spacing) return false;
          }
        }
      }
      return true;
    }
    function clearOfContent(x, y, radius) {
      var clearArena = nav.bossArena;
      if (clearArena) {
        var clearArenaX = (x - clearArena.x) / (clearArena.rx + 34);
        var clearArenaY = (y - clearArena.y) / (clearArena.ry + 28);
        if (clearArenaX * clearArenaX + clearArenaY * clearArenaY < 1) return false;
      }
      if (U.dist(x, y, content.camp.x, content.camp.y) < 155 ||
          U.dist(x, y, content.bossPoint.x, content.bossPoint.y) < 120) return false;
      var important = content.landmarks.concat(content.nodes, content.curios, content.ecology, [content.guardian]);
      for (var ci = 0; ci < important.length; ci++) {
        if (U.dist(x, y, important[ci].x, important[ci].y) < radius) return false;
      }
      return true;
    }
    function addDecor(def, x, y, blockerProp) {
      if (!def) return false;
      var spacing = blockerProp ? 22 : 15;
      if (!propSpace(x, y, spacing) || !clearOfContent(x, y, blockerProp ? 28 : 20)) return false;
      var sprite = def.sprite || 'deco_rock';
      var large = blockerProp || !!def.large;
      var prop = {
        sprite: sprite, x: x, y: y,
        phase: rng() * 6.28, flipX: rng() < 0.5,
        sway: !!def.sway,
        animSpd: def.flicker ? 0.24 : (0.9 + rng() * 0.7),
        bob: !!def.bob, shadow: def.shadow !== false,
        glow: def.glow || null, flicker: !!def.flicker,
        large: large, h: large ? 22 : 12, blockerProp: !!blockerProp
      };
      props.push(prop);
      var key = Math.floor(x / 32) + ':' + Math.floor(y / 32);
      (propBuckets[key] = propBuckets[key] || []).push(prop);
      if (prop.glow) glows.push(prop);
      return true;
    }

    // 让硬阻挡在视觉上对应密林、岩群、墓碑或遗迹，而不是大片空色块。
    for (var by = Math.ceil(BOUND_TOP / NAV) + 1; by < nav.h - 2; by += 2) {
      for (var bx = 2; bx < nav.w - 2; bx += 2) {
        if (nav.grid[by][bx] || rng() > 0.58) continue;
        addDecor(
          weighted(blockerDeco),
          bx * NAV + NAV / 2 + (rng() - 0.5) * 20,
          by * NAV + NAV / 2 + (rng() - 0.5) * 20,
          true
        );
      }
    }
    // 小型地表物只放在宽阔可行走区，不与导航碰撞语义冲突。
    if (groundDeco.length) {
      for (by = Math.ceil(BOUND_TOP / NAV) + 2; by < nav.h - 2; by += 3) {
        for (bx = 3; bx < nav.w - 3; bx += 3) {
          if (!nav.grid[by][bx] || nav.distance[by][bx] < 3 || rng() > 0.52) continue;
          addDecor(
            weighted(groundDeco),
            bx * NAV + NAV / 2 + (rng() - 0.5) * 24,
            by * NAV + NAV / 2 + (rng() - 0.5) * 24,
            false
          );
        }
      }
    }
    if (waterDeco.length) {
      for (var wpi = 0; wpi < 150; wpi++) {
        var wpx = 24 + rng() * (WORLD_W - 48), wpy = BOUND_TOP + 18 + rng() * (WORLD_H - BOUND_TOP - 36);
        var wgx = U.clamp(Math.floor(wpx / CELL), 0, gw - 1);
        var wgy = U.clamp(Math.floor(wpy / CELL), 0, gh - 1);
        if (grid[wgy * gw + wgx] === 'water') addDecor(weighted(waterDeco), wpx, wpy, false);
      }
    }

    // Boss 领地装饰使用独立的 landmarks 随机流，不改变既有地表物、
    // 花簇或资源坐标。装饰贴着不可通行墙带排布，中央战斗房保持开阔。
    // 它们仍是非碰撞视觉实体，真正的分隔由 nav.bossArena 墙格承担。
    lair = content.landmarks[3];
    territory = lair && lair.territory;
    if (territory && territory.decor && territory.decor.length) {
      var territoryRng = U.seededRng(seedFor(worldSeed, region.id, 'landmarks', attempt) ^ 0x71c3a95d);
      var territoryDeck = [];
      for (var tdi = 0; tdi < territory.decor.length; tdi++) {
        var repeats = Math.max(1, territory.decor[tdi].count || 1);
        for (var tdr = 0; tdr < repeats; tdr++) territoryDeck.push(territory.decor[tdi]);
      }
      var territoryCount = U.clamp(territory.decorCount || 8, 4, 14);
      var clearAngle = U.clamp(territory.approachClearance || 0.7, 0.45, 1.1);
      var arc = Math.PI * 2 - clearAngle * 2;
      var territoryRadius = U.clamp(territory.radius || 126, 96, 156);
      var territorySquash = U.clamp(territory.squash || 0.64, 0.52, 0.78);
      var placedTerritory = 0;
      for (var tdi2 = 0; tdi2 < territoryCount; tdi2++) {
        var unit = (tdi2 + 0.5) / territoryCount;
        var angle = lair.approachAngle + clearAngle + unit * arc +
          (territoryRng() - 0.5) * 0.22;
        var ring = territoryRadius * (0.88 + (tdi2 % 2) * 0.10 + territoryRng() * 0.06);
        var territoryX = lair.x + Math.cos(angle) * ring;
        var territoryY = lair.y + Math.sin(angle) * ring * territorySquash;
        if (!propSpace(territoryX, territoryY, 23)) continue;
        var territoryDef = territoryDeck[(tdi2 + Math.floor(territoryRng() * territoryDeck.length)) % territoryDeck.length];
        var territoryProp = {
          kind: 'bossDecor',
          id: region.id + ':boss-decor:' + placedTerritory,
          sprite: territoryDef.sprite,
          x: territoryX, y: territoryY,
          phase: territoryRng() * 6.28,
          flipX: territoryRng() < 0.5,
          sway: !!territoryDef.sway,
          bob: !!territoryDef.bob,
          flicker: !!territoryDef.flicker,
          animSpd: territoryDef.flicker ? 0.24 : (0.85 + territoryRng() * 0.65),
          shadow: territoryDef.shadow !== false,
          glow: territoryDef.glow || null,
          h: 18, bossTerritoryId: lair.id
        };
        props.push(territoryProp);
        var territoryKey = Math.floor(territoryX / 32) + ':' + Math.floor(territoryY / 32);
        (propBuckets[territoryKey] = propBuckets[territoryKey] || []).push(territoryProp);
        if (territoryProp.glow) glows.push(territoryProp);
        placedTerritory++;
      }
      lair.territoryDecorCount = placedTerritory;
    }

    var tuftTarget = Math.round((region.terrain.tufts || 0) * 6);
    for (var ti = 0, tuftGuard = 0; ti < tuftTarget && tuftGuard < tuftTarget * 8; tuftGuard++) {
      var tx = 20 + rng() * (WORLD_W - 40), ty = BOUND_TOP + rng() * (WORLD_H - BOUND_TOP - 20);
      var tgx = Math.floor(tx / NAV), tgy = Math.floor(ty / NAV);
      var smx = U.clamp(Math.floor(tx / CELL), 0, gw - 1);
      var smy = U.clamp(Math.floor(ty / CELL), 0, gh - 1);
      var smat = grid[smy * gw + smx];
      if (nav.grid[tgy] && nav.grid[tgy][tgx] && nav.distance[tgy][tgx] > 1 &&
          (smat === base.mat || smat === 'grass')) {
        tufts.push({ x: tx, y: ty, phase: rng() * 6.28, disturb: 0, h: 3 + (rng() * 3 | 0) });
        ti++;
      }
    }
    if (region.terrain.flowers) {
      var flowerTarget = Math.round((region.terrain.flowers.count || 0) * 5);
      for (var fi = 0, flowerGuard = 0; fi < flowerTarget && flowerGuard < flowerTarget * 8; flowerGuard++) {
        var fx = 20 + rng() * (WORLD_W - 40), fy = BOUND_TOP + rng() * (WORLD_H - BOUND_TOP - 20);
        var fgx = Math.floor(fx / NAV), fgy = Math.floor(fy / NAV);
        var fsx = U.clamp(Math.floor(fx / CELL), 0, gw - 1);
        var fsy = U.clamp(Math.floor(fy / CELL), 0, gh - 1);
        if (nav.grid[fgy] && nav.grid[fgy][fgx] && grid[fsy * gw + fsx] === base.mat) {
          flowers.push({
            x: fx, y: fy,
            color: region.terrain.flowers.colors[fi % region.terrain.flowers.colors.length],
            dots: 1 + (fi % 3)
          });
          fi++;
        }
      }
    }

    // 稳定营地组件。
    var camp = content.camp;
    [
      { sprite: 'camp_banner', x: -50, y: -5, large: true },
      { sprite: 'tent', x: -30, y: -4, large: true },
      { sprite: 'camp_lantern', x: 48, y: 4, large: true, glow: { color: '#f3b84f', r: 18 } },
      { sprite: 'campfire', x: 0, y: 8, campfire: true },
      { sprite: 'camp_cookpot', x: 1, y: 13 },
      { sprite: 'camp_supply', x: -62, y: 25 }
    ].forEach(function (p) {
      var cp = {
        sprite: p.sprite, x: camp.x + p.x, y: camp.y + p.y,
        shadow: !p.campfire, phase: 0, animSpd: 1, large: !!p.large,
        campProp: true, campfire: !!p.campfire, glow: p.glow || null, h: p.large ? 20 : 12
      };
      props.push(cp); if (cp.glow) glows.push(cp);
    });

    return {
      cell: CELL, gw: gw, gh: gh, grid: grid, colorGrid: colors,
      props: props, glows: glows, tufts: tufts, flowers: flowers,
      waterCells: water, lavaCells: lava
    };
  }

  function shortestMacroPath(macro) {
    var n = macro.centers.length, dist = [], prev = [], used = [];
    for (var i = 0; i < n; i++) { dist[i] = Infinity; prev[i] = -1; }
    dist[0] = 0;
    for (var k = 0; k < n; k++) {
      var at = -1;
      for (i = 0; i < n; i++) if (!used[i] && (at < 0 || dist[i] < dist[at])) at = i;
      if (at < 0) break;
      used[at] = true;
      for (var ei = 0; ei < macro.edges.length; ei++) {
        var e = macro.edges[ei];
        var to = e.a === at ? e.b : (e.b === at ? e.a : -1);
        if (to < 0) continue;
        if (dist[at] + e.length < dist[to]) {
          dist[to] = dist[at] + e.length; prev[to] = at;
        }
      }
    }
    var ids = [], cur = 1, guard = 0;
    while (cur >= 0 && guard++ < n + 2) { ids.unshift(cur); if (cur === 0) break; cur = prev[cur]; }
    if (!ids.length || ids[0] !== 0) ids = [0, 1];
    return ids.map(function (id) { return { x: macro.centers[id].x, y: macro.centers[id].y }; });
  }

  function generateCandidate(region, worldSeed, attempt) {
    if (!region || !region.exploration) throw new Error('Region exploration constraints are required for layout v3');
    var seeds = {};
    STREAMS.forEach(function (s) { seeds[s] = seedFor(worldSeed, region.id, s, attempt); });
    var macro = makeMacro(region, worldSeed, attempt);
    var nav = rasterField(region, worldSeed, attempt, macro);
    var content = contentFor(region, worldSeed, attempt, macro, nav);
    var hazardAnchors = hazardAnchorsFor(region, worldSeed, attempt, macro, nav, content);
    var surface = legacySurface(region, worldSeed, attempt, macro, nav, content);
    var corridor = shortestMacroPath(macro);
    var chunks = [];
    for (var cy = 0; cy < Math.ceil(WORLD_H / CHUNK); cy++) {
      for (var cx = 0; cx < Math.ceil(WORLD_W / CHUNK); cx++) {
        chunks.push({
          id: cx + ':' + cy, x: cx * CHUNK, y: cy * CHUNK,
          w: Math.min(CHUNK, WORLD_W - cx * CHUNK),
          h: Math.min(CHUNK, WORLD_H - cy * CHUNK),
          state: 'cold'
        });
      }
    }
    var layout = {
      version: 3,
      worldSeed: worldSeed >>> 0,
      regionSeed: seedFor(worldSeed, region.id, 'root', attempt),
      seeds: seeds,
      attempt: attempt,
      preset: macro.preset,
      world: { w: WORLD_W, h: WORLD_H },
      camp: content.camp,
      bossPoint: content.bossPoint,
      bossLair: content.landmarks[3],
      bossArena: nav.bossArena,
      campSafeRadius: 120,
      bossSafeRadius: 105,
      corridor: { points: corridor, width: 72, mat: region.layout.road.mat },
      macro: macro,
      nav: nav,
      landmarks: content.landmarks,
      nodes: content.nodes,
      curios: content.curios,
      ecology: content.ecology,
      threats: content.threats,
      hazardAnchors: hazardAnchors,
      guardian: content.guardian,
      chunks: chunks,
      chunkSize: CHUNK,
      spatial: { cell: 192, buckets: {} },
      density: { patches: 1, decor: 1, details: 1, waterDecor: 1 },
      patches: nav.blockers,
      spawnCandidates: content.threats.map(function (x) { return { x: x.x, y: x.y, threatId: x.id }; }),
      corridorCandidates: corridor.slice(1, -1),
      cell: surface.cell,
      gw: surface.gw, gh: surface.gh, grid: surface.grid, colorGrid: surface.colorGrid,
      props: surface.props, glows: surface.glows, tufts: surface.tufts, flowers: surface.flowers,
      waterCells: surface.waterCells, lavaCells: surface.lavaCells,
      generation: { attempts: attempt + 1, repairs: [], fallback: null, metrics: null }
    };
    return layout;
  }

  function allTargets(layout) {
    return []
      .concat(layout.landmarks || [])
      .concat(layout.nodes || [])
      .concat(layout.curios || [])
      .concat(layout.ecology || [])
      .concat(layout.threats || [])
      .concat(layout.guardian || []);
  }

  function reachable(nav, start) {
    var sx = U.clamp(Math.floor(start.x / nav.cell), 0, nav.w - 1);
    var sy = U.clamp(Math.floor(start.y / nav.cell), 0, nav.h - 1);
    var seen = new Uint8Array(nav.w * nav.h);
    var q = [sy * nav.w + sx], qi = 0;
    seen[q[0]] = 1;
    while (qi < q.length) {
      var at = q[qi++], x = at % nav.w, y = (at / nav.w) | 0;
      var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (var i = 0; i < dirs.length; i++) {
        var nx = x + dirs[i][0], ny = y + dirs[i][1], ni = ny * nav.w + nx;
        if (nx < 0 || ny < 0 || nx >= nav.w || ny >= nav.h || seen[ni] || !nav.grid[ny][nx]) continue;
        seen[ni] = 1; q.push(ni);
      }
    }
    return { seen: seen, count: q.length };
  }

  function validate(layout) {
    var failures = [], repairs = [], nav = layout.nav;
    var reach = reachable(nav, layout.camp);
    var targets = allTargets(layout);
    var unreachable = [];
    for (var i = 0; i < targets.length; i++) {
      var gx = U.clamp(Math.floor(targets[i].x / nav.cell), 0, nav.w - 1);
      var gy = U.clamp(Math.floor(targets[i].y / nav.cell), 0, nav.h - 1);
      if (!reach.seen[gy * nav.w + gx]) unreachable.push(targets[i].id);
      if (nav.distance[gy][gx] < 1) repairs.push({ type: 'project', id: targets[i].id });
    }
    if (unreachable.length) failures.push({ code: 'unreachable-content', ids: unreachable });
    if (layout.macro.loopRank < 2) failures.push({ code: 'loop-rank', value: layout.macro.loopRank });
    if (layout.nav.walkableRatio < 0.60 || layout.nav.walkableRatio > 0.70) {
      failures.push({ code: 'walkable-ratio', value: layout.nav.walkableRatio });
    }
    if ((layout.nodes || []).length < 16 || (layout.nodes || []).length > 22) {
      failures.push({ code: 'resource-count', value: layout.nodes.length });
    }
    if ((layout.threats || []).length < 6 || (layout.threats || []).length > 9) {
      failures.push({ code: 'threat-count', value: layout.threats.length });
    }
    var minClearance = 999;
    for (var mei = 0; mei < layout.macro.edges.length; mei++) {
      var me = layout.macro.edges[mei];
      var ma = layout.macro.centers[me.a], mb = layout.macro.centers[me.b];
      var samples = Math.max(8, Math.ceil(me.length / 20));
      for (var ms = 0; ms <= samples; ms++) {
        var mp = pointOnEdge(ma, mb, me.bend, ms / samples);
        var mgx = U.clamp(Math.floor(mp.x / nav.cell), 0, nav.w - 1);
        var mgy = U.clamp(Math.floor(mp.y / nav.cell), 0, nav.h - 1);
        minClearance = Math.min(minClearance, nav.distance[mgy][mgx] * nav.cell);
      }
    }
    if (minClearance < 48) failures.push({ code: 'route-clearance', value: minClearance });
    var metrics = {
      walkableRatio: +layout.nav.walkableRatio.toFixed(4),
      connectedCells: reach.count,
      connectedRatio: +(reach.count / Math.max(1, nav.w * nav.h)).toFixed(4),
      macroCenters: layout.macro.centers.length,
      macroEdges: layout.macro.edges.length,
      loopRank: layout.macro.loopRank,
      alternateRoutes: layout.macro.alternateRoute ? 2 : 1,
      minClearancePx: minClearance,
      landmarks: layout.landmarks.length,
      resources: layout.nodes.length,
      curios: layout.curios.length,
      ecology: layout.ecology.length,
      threats: layout.threats.length,
      chunks: layout.chunks.length
    };
    return { valid: failures.length === 0, failures: failures, suggestions: repairs, metrics: metrics };
  }

  function repair(layout, report) {
    if (!report || report.valid) return layout;
    var nav = layout.nav;
    var targets = allTargets(layout);
    for (var i = 0; i < targets.length; i++) {
      var p = project(nav, targets[i].x, targets[i].y, 2);
      if (p) { targets[i].x = p.x; targets[i].y = p.y; }
    }
    layout.generation.repairs.push('project-content');
    return layout;
  }

  function safeTemplate(region, worldSeed) {
    var layout = generateCandidate(region, worldSeed, 99);
    var nav = layout.nav;
    var openCount = 0;
    for (var y = Math.ceil(BOUND_TOP / NAV); y < nav.h - 2; y++) {
      for (var x = 2; x < nav.w - 2; x++) {
        var keepBlocked = (x % 12 < 5 && y % 12 < 9) && x > 10 && x < nav.w - 10;
        nav.grid[y][x] = keepBlocked ? 0 : 1;
        nav.flat[y * nav.w + x] = nav.grid[y][x];
        nav.costs[y][x] = nav.grid[y][x] ? 1 : 0;
        if (nav.grid[y][x]) openCount++;
      }
    }
    nav.walkableRatio = openCount / (nav.w * (nav.h - Math.ceil(BOUND_TOP / NAV)));
    var targets = allTargets(layout);
    for (var ti = 0; ti < targets.length; ti++) {
      var pp = project(nav, targets[ti].x, targets[ti].y, 1);
      if (pp) { targets[ti].x = pp.x; targets[ti].y = pp.y; }
    }
    layout.generation.fallback = 'safe-open-' + layout.preset;
    layout.generation.repairs.push('safe-template');
    return layout;
  }

  function mount(region, layout) {
    T.layout = layout;
    T.grid = layout.grid;
    T.colorGrid = layout.colorGrid;
    T.gw = layout.gw;
    T.gh = layout.gh;
    T.props = layout.props;
    T.nodes = layout.nodes;
    T.glows = layout.glows;
    T.tufts = layout.tufts;
    T.flowers = layout.flowers;
    T.decals = [];
    T.waterCells = layout.waterCells;
    T.lavaCells = layout.lavaCells;
    T.campfirePos = { x: layout.camp.x, y: layout.camp.y };
    T.tuftColors = region.terrain.tuftColors || ['#3d8232', '#7ac86a'];
    buildSpatial(layout);
    if (typeof T.bake === 'function') T.bake(region, layout);
    if (Game.nav && typeof Game.nav.useLayout === 'function') Game.nav.useLayout(layout);
    return layout;
  }

  function spatialKey(cell, x, y) {
    return Math.floor(x / cell) + ':' + Math.floor(y / cell);
  }

  function insertSpatial(target, cell, item) {
    if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return;
    var key = spatialKey(cell, item.x, item.y);
    (target[key] = target[key] || []).push(item);
  }

  function buildSpatial(layout) {
    var spatial = layout.spatial || (layout.spatial = { cell: 192, buckets: {} });
    spatial.buckets = {};
    spatial.dynamic = {};
    var list = (layout.props || []).concat(
      layout.nodes || [], layout.landmarks || [], layout.curios || [], layout.ecology || []
    );
    for (var i = 0; i < list.length; i++) insertSpatial(spatial.buckets, spatial.cell, list[i]);
    return spatial;
  }

  T.generate = function (region, worldSeed, layoutVersion) {
    layoutVersion = layoutVersion === undefined ? 3 : layoutVersion;
    if (layoutVersion !== 3) return legacyBuild.call(T, region, worldSeed, layoutVersion);
    worldSeed = worldSeed === undefined && Game.state ? Game.state.world.worldSeed : worldSeed;
    worldSeed = worldSeed >>> 0;
    var last = null, report = null;
    for (var attempt = 0; attempt < 4; attempt++) {
      last = generateCandidate(region, worldSeed, attempt);
      report = validate(last, region);
      last.generation.metrics = report.metrics;
      if (report.valid) return last;
      last = repair(last, report);
      report = validate(last, region);
      last.generation.metrics = report.metrics;
      if (report.valid) return last;
    }
    last = safeTemplate(region, worldSeed);
    report = validate(last, region);
    last.generation.metrics = report.metrics;
    return last;
  };

  T.validate = validate;
  T.repair = repair;
  T.mount = function (layout, region) {
    region = region || (Game.world && Game.world.region) || Game.reg.get('region', Game.state.world.region);
    return mount(region, layout);
  };

  T.build = function (region, worldSeed, layoutVersion) {
    layoutVersion = layoutVersion === undefined
      ? (Game.state ? Game.state.world.layoutVersion : 3)
      : layoutVersion;
    if (layoutVersion !== 3) return legacyBuild.call(T, region, worldSeed, layoutVersion);
    return mount(region, T.generate(region, worldSeed, 3));
  };

  T.projectPoint = function (x, y, minClearance) {
    var nav = T.layout && T.layout.nav;
    if (!nav || T.layout.version < 3) return { x: x, y: y };
    return project(nav, x, y, minClearance || 1);
  };

  T.isWalkable = function (x, y, radius) {
    var nav = T.layout && T.layout.nav;
    if (!nav || T.layout.version < 3) return T.costAt(x, y) <= 2.8;
    var gx = Math.floor(x / nav.cell), gy = Math.floor(y / nav.cell);
    if (gx < 0 || gy < 0 || gx >= nav.w || gy >= nav.h || !nav.grid[gy][gx]) return false;
    return nav.distance[gy][gx] * nav.cell >= (radius || 0);
  };

  T.dangerAt = function (x, y) {
    var nav = T.layout && T.layout.nav;
    if (!nav || !nav.danger) return 0;
    var gx = U.clamp(Math.floor(x / nav.cell), 0, nav.w - 1);
    var gy = U.clamp(Math.floor(y / nav.cell), 0, nav.h - 1);
    var value = nav.danger[gy][gx] || 0;
    if (Game.exploration && Game.exploration.dangerFactor) {
      value *= Game.exploration.dangerFactor(x, y);
    }
    return value;
  };

  /** 圆形扫掠碰撞：分步、分轴修正并自然沿墙滑动。 */
  T.sweepMove = function (x, y, dx, dy, radius) {
    var layout = T.layout;
    if (!layout || layout.version < 3) return { x: x + dx, y: y + dy, moved: Math.sqrt(dx * dx + dy * dy) };
    radius = radius || 7;
    var total = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(total / 6));
    var sx = dx / steps, sy = dy / steps;
    var px = x, py = y;
    for (var i = 0; i < steps; i++) {
      var nx = px + sx, ny = py + sy;
      if (T.isWalkable(nx, ny, radius)) { px = nx; py = ny; continue; }
      if (T.isWalkable(nx, py, radius)) px = nx;
      if (T.isWalkable(px, ny, radius)) py = ny;
    }
    return { x: px, y: py, moved: U.dist(x, y, px, py) };
  };

  T.rebuildDynamicSpatial = function (items) {
    var layout = T.layout;
    if (!layout || layout.version < 3 || !layout.spatial) return false;
    var target = layout.spatial.dynamic = {};
    for (var i = 0; i < (items || []).length; i++) {
      insertSpatial(target, layout.spatial.cell, items[i]);
    }
    return true;
  };

  T.spatialQuery = function (left, top, right, bottom, dynamic) {
    var layout = T.layout;
    if (!layout || layout.version < 3 || !layout.spatial) return null;
    var spatial = layout.spatial, source = dynamic ? spatial.dynamic : spatial.buckets;
    var minX = Math.floor(left / spatial.cell), maxX = Math.floor(right / spatial.cell);
    var minY = Math.floor(top / spatial.cell), maxY = Math.floor(bottom / spatial.cell);
    var out = [], seen = {};
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var bucket = source[x + ':' + y] || [];
        for (var i = 0; i < bucket.length; i++) {
          var item = bucket[i];
          var id = item.id || item.kind + ':' + item.x + ':' + item.y;
          if (!seen[id]) { seen[id] = true; out.push(item); }
        }
      }
    }
    return out;
  };

  T.snapshotV3 = function (layout) {
    layout = layout || T.layout;
    return {
      version: layout.version,
      worldSeed: layout.worldSeed,
      preset: layout.preset,
      camp: layout.camp,
      bossPoint: layout.bossPoint,
      centers: layout.macro.centers.map(function (c) { return [c.x, c.y, c.role]; }),
      edges: layout.macro.edges.map(function (e) { return [e.a, e.b, e.kind, e.width]; }),
      content: {
        landmarks: layout.landmarks.map(function (x) { return [x.defId, x.x, x.y]; }),
        resources: layout.nodes.map(function (x) { return [x.defId, x.x, x.y]; }),
        curios: layout.curios.map(function (x) { return [x.defId, x.x, x.y]; }),
        ecology: layout.ecology.map(function (x) { return [x.defId, x.x, x.y]; }),
        threats: layout.threats.map(function (x) { return [x.defId, x.x, x.y, x.affix]; }),
        hazards: (layout.hazardAnchors || []).map(function (x) { return [x.x, x.y, x.clearance]; }),
        guardian: [layout.guardian.x, layout.guardian.y]
      },
      metrics: layout.generation.metrics
    };
  };

  /** 仅供大样本拓扑模糊测试；不生成网格、内容或运行时对象。 */
  T.fastTopology = function (region, worldSeed) {
    var macro = makeMacro(region, worldSeed >>> 0, 0);
    return {
      preset: macro.preset,
      centers: macro.centers.length,
      edges: macro.edges.length,
      loopRank: macro.loopRank,
      alternateRoute: macro.alternateRoute.slice(),
      signature: macro.centers.map(function (c) {
        return Math.round(c.x / 32) + ',' + Math.round(c.y / 32);
      }).join('|') + '/' + macro.edges.map(function (e) {
        return edgeKey(e.a, e.b);
      }).sort().join('|')
    };
  };
})();
