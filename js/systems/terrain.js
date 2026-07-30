/* ============================================================
 * systems/terrain.js — 受约束区域布局生成器（v1 兼容 / v2 高密度）
 * 只生成运行时数据；区域注册对象保持只读，渲染烘焙由 render/terrain.js 扩展。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var CELL = 8;
  var NAV_CELL = 16;
  var BOUND_TOP = 68;
  var MATERIAL_COST = {
    grass: 1, dirt: 1, stone: 1,
    snow: 1.15, sand: 1.15, miasma: 1.3,
    water: 1.4, lava: 1.6, void: 1.6
  };

  function seedFor(worldSeed, regionId, layoutVersion, stream) {
    return U.strSeed((worldSeed >>> 0) + ':' + regionId + ':' + layoutVersion + ':' + stream);
  }

  function pctRange(zone, key, fallback) {
    var value = zone && zone[key];
    return Array.isArray(value) && value.length === 2 ? value : fallback;
  }

  function pointSegmentDistance(px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    if (!len2) return U.dist(px, py, a.x, a.y);
    var t = U.clamp(((px - a.x) * dx + (py - a.y) * dy) / len2, 0, 1);
    return U.dist(px, py, a.x + dx * t, a.y + dy * t);
  }

  function distanceToPath(x, y, points) {
    var best = Infinity;
    for (var i = 1; i < points.length; i++) {
      best = Math.min(best, pointSegmentDistance(x, y, points[i - 1], points[i]));
    }
    return best;
  }

  function spriteInfo(id) {
    if (Game.assets && Game.assets.sprite) return Game.assets.sprite(id);
    return { w: 16, h: /tree|pillar|rocks_big|crystal_big|obsidian|beam/.test(id) ? 20 : 10, frames: {} };
  }

  function isLargeDecor(def) {
    if (def.large !== undefined) return !!def.large;
    var sp = spriteInfo(def.sprite);
    return sp.w >= 16 || sp.h >= 18;
  }

  function materialPalette(region, mat) {
    var cfg = region.terrain;
    if (cfg.base.mat === mat) return cfg.base.colors;
    for (var i = 0; i < cfg.patches.length; i++) {
      if (cfg.patches[i].mat === mat) return cfg.patches[i].colors;
    }
    if (region.layout.road.mat === mat) return region.layout.road.colors;
    return cfg.base.colors;
  }

  function finitePoint(p) {
    return p && Number.isFinite(p.x) && Number.isFinite(p.y);
  }

  function scaledCount(count, density) {
    if (!count) return 0;
    return Math.max(1, Math.round(count * density));
  }

  var T = Game.terrain = {
    CELL: CELL,
    NAV_CELL: NAV_CELL,
    MATERIAL_COST: MATERIAL_COST,
    layout: null,
    ground: null,
    grid: null,
    colorGrid: null,
    gw: 0,
    gh: 0,
    props: [],
    nodes: [],
    glows: [],
    tufts: [],
    flowers: [],
    decals: [],
    campfirePos: null,
    waterCells: [],
    lavaCells: [],
    tuftColors: ['#3d8232', '#7ac86a'],
    time: 0,
    windT: 0,

    materialAt: function (x, y) {
      var gx = (x / CELL) | 0, gy = (y / CELL) | 0;
      if (!T.grid || gx < 0 || gy < 0 || gx >= T.gw || gy >= T.gh) return 'void';
      return T.grid[gy * T.gw + gx];
    },

    costAt: function (x, y) {
      var nav = T.layout && T.layout.nav;
      if (!nav) return MATERIAL_COST[T.materialAt(x, y)] || 1;
      var gx = U.clamp((x / NAV_CELL) | 0, 0, nav.w - 1);
      var gy = U.clamp((y / NAV_CELL) | 0, 0, nav.h - 1);
      return nav.costs[gy][gx];
    },

    windAt: function (x, phase, disturb) {
      return Math.sin(T.windT * 1.6 + x * 0.035 + (phase || 0)) * 1.4 +
        (disturb ? Math.sin(T.windT * 11 + phase * 7) * disturb * 2.2 : 0);
    },

    /** 生成并挂载布局；v1 保持历史结果，v2 使用区域高密度配置。 */
    build: function (region, worldSeed, layoutVersion) {
      worldSeed = worldSeed === undefined && Game.state ? Game.state.world.worldSeed : worldSeed;
      layoutVersion = layoutVersion === undefined
        ? (Game.state ? Game.state.world.layoutVersion : 2)
        : layoutVersion;
      worldSeed = worldSeed >>> 0;
      layoutVersion = layoutVersion || 2;
      if (layoutVersion !== 1 && layoutVersion !== 2) {
        throw new Error('Unsupported terrain layout version: ' + layoutVersion);
      }
      if (!region || !region.layout) throw new Error('Region layout constraints are required');

      var w = region.world.w, h = region.world.h;
      var cfg = region.terrain, lc = region.layout;
      var dense = layoutVersion >= 2;
      var patchDensity = dense ? (lc.patchDensity || 1) : 1;
      var decorDensity = dense ? (lc.decorDensity || 1) : 1;
      var detailDensity = dense ? (lc.detailDensity || 1) : 1;
      var waterDecorDensity = dense ? (lc.waterDecorDensity || decorDensity) : 1;
      var landmarkRng = U.seededRng(seedFor(worldSeed, region.id, layoutVersion, 'landmarks'));
      var terrainRng = U.seededRng(seedFor(worldSeed, region.id, layoutVersion, 'terrain'));
      var decorRng = U.seededRng(seedFor(worldSeed, region.id, layoutVersion, 'decor'));
      var detailRng = U.seededRng(seedFor(worldSeed, region.id, layoutVersion, 'details'));
      // nodes 是独立附加流；不得消费 landmarks/terrain/decor/details，
      // 因而不会扰动 v1/v2 既有布局快照和关键点。
      var nodeRng = U.seededRng(seedFor(worldSeed, region.id, layoutVersion, 'nodes'));

      var campX = pctRange(lc.campZone, 'x', [0.10, 0.20]);
      var campY = pctRange(lc.campZone, 'y', [0.27, 0.70]);
      var bossX = pctRange(lc.bossZone, 'x', [0.70, 0.85]);
      var bossY = pctRange(lc.bossZone, 'y', [0.27, 0.70]);
      var camp = {
        x: Math.round(w * (campX[0] + landmarkRng() * (campX[1] - campX[0]))),
        y: Math.round(h * (campY[0] + landmarkRng() * (campY[1] - campY[0])))
      };
      var bossPoint = {
        x: Math.round(w * (bossX[0] + landmarkRng() * (bossX[1] - bossX[0]))),
        y: Math.round(h * (bossY[0] + landmarkRng() * (bossY[1] - bossY[0])))
      };
      var controlCount = 2 + (landmarkRng() < 0.5 ? 0 : 1);
      var path = [camp];
      for (var ci = 1; ci <= controlCount; ci++) {
        var ratio = ci / (controlCount + 1);
        var baseY = camp.y + (bossPoint.y - camp.y) * ratio;
        path.push({
          x: Math.round(camp.x + (bossPoint.x - camp.x) * ratio + (landmarkRng() - 0.5) * 42),
          y: Math.round(U.clamp(baseY + (landmarkRng() - 0.5) * 150, BOUND_TOP + 34, h - 34))
        });
      }
      path.push(bossPoint);

      var roadWidth = U.clamp(lc.road.width || 48, 40, 64);
      var campSafe = lc.campSafeRadius || 80;
      var bossSafe = lc.bossSafeRadius || 70;
      var needsWaterDecor = cfg.deco.some(function (def) { return !def.v3Only && !!def.water; });

      var gw = Math.ceil(w / CELL), gh = Math.ceil(h / CELL);
      var grid = new Array(gw * gh);
      var colorGrid = new Array(gw * gh);
      var patches = [];
      var gx, gy, i, n;
      for (gy = 0; gy < gh; gy++) {
        for (gx = 0; gx < gw; gx++) {
          grid[gy * gw + gx] = cfg.base.mat;
          colorGrid[gy * gw + gx] = cfg.base.colors;
        }
      }
      for (i = 0; i < cfg.patches.length; i++) {
        var pd = cfg.patches[i];
        var patchCount = scaledCount(pd.count, patchDensity);
        for (n = 0; n < patchCount; n++) {
          var patchR = pd.rMin + terrainRng() * (pd.rMax - pd.rMin);
          var patchX = 0, patchY = 0;
          for (var patchTry = 0; patchTry < 80; patchTry++) {
            patchX = 40 + terrainRng() * (w - 80);
            patchY = BOUND_TOP + 22 + terrainRng() * (h - BOUND_TOP - 54);
            if (pd.mat !== 'water' || !needsWaterDecor || (
              U.dist(patchX, patchY, camp.x, camp.y) > campSafe + patchR + 10 &&
              U.dist(patchX, patchY, bossPoint.x, bossPoint.y) > bossSafe + patchR + 10 &&
              distanceToPath(patchX, patchY, path) > roadWidth / 2 + patchR + 8
            )) break;
          }
          var patch = {
            mat: pd.mat,
            x: patchX,
            y: patchY,
            r: patchR,
            shape: terrainRng() * 1000
          };
          patches.push(patch);
          for (gy = 0; gy < gh; gy++) {
            for (gx = 0; gx < gw; gx++) {
              var px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2;
              var dx = px - patch.x, dy = py - patch.y;
              var noise = Math.sin(gx * 1.7 + patch.shape) * Math.cos(gy * 1.3 + patch.shape) * 0.22 + 0.88;
              if (dx * dx + dy * dy < patch.r * patch.r * noise * noise) {
                grid[gy * gw + gx] = pd.mat;
                colorGrid[gy * gw + gx] = pd.colors;
              }
            }
          }
        }
      }

      for (gy = 0; gy < gh; gy++) {
        for (gx = 0; gx < gw; gx++) {
          var wx = gx * CELL + CELL / 2, wy = gy * CELL + CELL / 2;
          if (distanceToPath(wx, wy, path) <= roadWidth / 2 ||
              U.dist(wx, wy, camp.x, camp.y) <= campSafe ||
              U.dist(wx, wy, bossPoint.x, bossPoint.y) <= bossSafe) {
            grid[gy * gw + gx] = lc.road.mat;
            colorGrid[gy * gw + gx] = lc.road.colors;
          }
        }
      }

      var waterCells = [], lavaCells = [];
      for (i = 0; i < grid.length; i++) {
        if (grid[i] === 'water') waterCells.push(i);
        if (grid[i] === 'lava') lavaCells.push(i);
      }

      function gridMaterialAt(x, y) {
        var xg = (x / CELL) | 0, yg = (y / CELL) | 0;
        if (xg < 0 || yg < 0 || xg >= gw || yg >= gh) return 'void';
        return grid[yg * gw + xg];
      }
      function outsideSafe(x, y) {
        return U.dist(x, y, camp.x, camp.y) >= campSafe &&
          U.dist(x, y, bossPoint.x, bossPoint.y) >= bossSafe;
      }

      var tufts = [];
      var tuftN = scaledCount(cfg.tufts || 0, detailDensity);
      var detailGuard = 0;
      while (tufts.length < tuftN && detailGuard++ < Math.max(1, tuftN * 30)) {
        var tx = 30 + detailRng() * (w - 60), ty = BOUND_TOP + 22 + detailRng() * (h - BOUND_TOP - 42);
        var tm = gridMaterialAt(tx, ty);
        if (tm !== cfg.base.mat && tm !== 'grass') continue;
        tufts.push({ x: tx, y: ty, phase: detailRng() * 6.28, disturb: 0, h: 3 + (detailRng() * 3 | 0) });
      }

      var flowers = [];
      if (cfg.flowers && cfg.flowers.count) {
        var flowerN = scaledCount(cfg.flowers.count, detailDensity);
        var flowerGuard = 0;
        while (flowers.length < flowerN && flowerGuard++ < flowerN * 40) {
          var fx = 26 + detailRng() * (w - 52), fy = BOUND_TOP + 20 + detailRng() * (h - BOUND_TOP - 36);
          if (gridMaterialAt(fx, fy) !== cfg.base.mat) continue;
          flowers.push({
            x: fx, y: fy,
            color: cfg.flowers.colors[(detailRng() * cfg.flowers.colors.length) | 0],
            dots: 1 + (detailRng() < 0.7 ? 1 : 0) + (detailRng() < 0.5 ? 1 : 0)
          });
        }
      }

      var props = [], glows = [];
      var minSpacing = lc.decorSpacing || 12;
      function hasSpacing(x, y, spacing) {
        for (var pi = 0; pi < props.length; pi++) {
          if (U.dist(x, y, props[pi].x, props[pi].y) < spacing) return false;
        }
        return true;
      }
      function validSpot(def, x, y, relaxed) {
        var mat = gridMaterialAt(x, y);
        if (def.water ? mat !== 'water' : (mat === 'water' || mat === 'lava')) return false;
        if (!outsideSafe(x, y)) return false;
        if (isLargeDecor(def) && distanceToPath(x, y, path) < roadWidth / 2 + 10) return false;
        return relaxed || hasSpacing(x, y, minSpacing);
      }
      function pushProp(def, x, y) {
        var sp = spriteInfo(def.sprite);
        var prop = {
          sprite: def.sprite, x: x, y: y,
          phase: decorRng() * 6.28,
          flipX: decorRng() < 0.5,
          sway: !!(sp.frames && sp.frames.idle1),
          animSpd: def.flicker ? 0.24 : (0.9 + decorRng() * 0.7),
          bob: !!def.bob,
          shadow: def.shadow !== undefined ? def.shadow : sp.h >= 15,
          glow: def.glow || null,
          flicker: !!def.flicker,
          large: isLargeDecor(def),
          h: sp.h
        };
        props.push(prop);
        if (prop.glow) glows.push(prop);
      }
      function fallbackSpot(def, ordinal) {
        var cols = Math.floor((w - 48) / 12);
        var total = cols * Math.floor((h - BOUND_TOP - 28) / 12);
        var start = ((decorRng() * total) | 0) + ordinal * 37;
        for (var fi = 0; fi < total; fi++) {
          var at = (start + fi * 53) % total;
          var x = 24 + (at % cols) * 12;
          var y = BOUND_TOP + 14 + ((at / cols) | 0) * 12;
          if (validSpot(def, x, y, !dense)) return { x: x, y: y };
        }
        return { x: w * 0.5, y: h - 24 };
      }

      for (i = 0; i < cfg.deco.length; i++) {
        var dd = cfg.deco[i];
        // v3Only 装饰扩展正式开放地图的主题细节，但不得改写 v1/v2
        // 的历史布局、随机流消费或黄金快照。
        if (dd.v3Only) continue;
        var decorCount = scaledCount(dd.count, dd.water ? waterDecorDensity : decorDensity);
        var centers = [];
        if (dd.cluster) {
          var centerCount = Math.max(1, Math.round(decorCount / 3));
          var centerGuard = 0;
          while (centers.length < centerCount && centerGuard++ < centerCount * 80) {
            var ccx, ccy;
            var routeClusterCount = dense && isLargeDecor(dd) ? Math.ceil(centerCount * 0.65) : 0;
            if (centers.length < routeClusterCount && path.length > 2) {
              var anchorIndex = 1 + (centers.length % (path.length - 2));
              var anchor = path[anchorIndex];
              var prevAnchor = path[anchorIndex - 1], nextAnchor = path[anchorIndex + 1];
              var tangentX = nextAnchor.x - prevAnchor.x, tangentY = nextAnchor.y - prevAnchor.y;
              var tangentLen = Math.max(1, Math.sqrt(tangentX * tangentX + tangentY * tangentY));
              tangentX /= tangentLen;
              tangentY /= tangentLen;
              var side = ((centers.length + i) % 2) ? 1 : -1;
              var offset = roadWidth / 2 + 24 + decorRng() * 48;
              var along = (decorRng() - 0.5) * 76;
              ccx = U.clamp(anchor.x + tangentX * along - tangentY * offset * side, 36, w - 36);
              ccy = U.clamp(anchor.y + tangentY * along + tangentX * offset * side, BOUND_TOP + 28, h - 26);
            } else {
              ccx = 36 + decorRng() * (w - 72);
              ccy = BOUND_TOP + 28 + decorRng() * (h - BOUND_TOP - 54);
            }
            if (validSpot(dd, ccx, ccy, true)) centers.push({ x: ccx, y: ccy });
          }
        }
        for (n = 0; n < decorCount; n++) {
          var placed = null;
          for (var tries = 0; tries < 160 && !placed; tries++) {
            var dx2, dy2;
            if (dd.water && waterCells.length) {
              var wi = waterCells[(decorRng() * waterCells.length) | 0];
              dx2 = (wi % gw) * CELL + 4;
              dy2 = ((wi / gw) | 0) * CELL + 4;
            } else if (centers.length) {
              var ct = centers[(decorRng() * centers.length) | 0];
              var angle = decorRng() * Math.PI * 2, radius = decorRng() * 48;
              dx2 = U.clamp(ct.x + Math.cos(angle) * radius, 24, w - 24);
              dy2 = U.clamp(ct.y + Math.sin(angle) * radius * 0.7, BOUND_TOP + 12, h - 18);
            } else {
              dx2 = 30 + decorRng() * (w - 60);
              dy2 = BOUND_TOP + 24 + decorRng() * (h - BOUND_TOP - 46);
            }
            if (validSpot(dd, dx2, dy2, false)) placed = { x: dx2, y: dy2 };
          }
          if (!placed) placed = fallbackSpot(dd, props.length + n);
          pushProp(dd, placed.x, placed.y);
        }
      }

      function addCampProp(prop) {
        prop.campProp = true;
        props.push(prop);
        if (prop.glow) glows.push(prop);
      }
      if (dense) {
        addCampProp({ sprite: 'camp_banner', x: camp.x - 50, y: camp.y - 5, shadow: true, phase: 0.35, sway: true, animSpd: 1.2, large: true });
        addCampProp({ sprite: 'tent', x: camp.x - 30, y: camp.y - 4, shadow: true, phase: 0, animSpd: 1, large: true });
        addCampProp({ sprite: 'camp_lantern', x: camp.x + 48, y: camp.y + 4, shadow: true, phase: 0.7, flicker: true, animSpd: 0.45, large: true, glow: { color: '#f3b84f', r: 18 } });
        addCampProp({ sprite: 'campfire', x: camp.x, y: camp.y + 8, campfire: true, phase: 0, animSpd: 1, shadow: false, large: false });
        addCampProp({ sprite: 'camp_cookpot', x: camp.x + 1, y: camp.y + 13, shadow: true, steam: true, phase: 0.2, large: false });
        // 补给箱斜靠交易摊位（camp-supply 交易域锚点 camp + (-45,+19)）左前方，组成补给角
        addCampProp({ sprite: 'camp_supply', x: camp.x - 62, y: camp.y + 25, shadow: true, phase: 0, large: false });
        addCampProp({ sprite: 'camp_bedroll', x: camp.x - 13, y: camp.y + 29, shadow: true, phase: 0, large: false });
        addCampProp({ sprite: 'camp_log', x: camp.x + 29, y: camp.y + 27, shadow: true, phase: 0, large: false });
      } else {
        props.push({ sprite: 'tent', x: camp.x - 30, y: camp.y - 4, shadow: true, phase: 0, flipX: false, animSpd: 1, large: true });
        props.push({ sprite: 'campfire', x: camp.x, y: camp.y + 8, campfire: true, phase: 0, flipX: false, animSpd: 1, shadow: false, large: false });
      }

      /* ---------- 独立采集节点流（不进入导航代价与旧 props 快照） ---------- */
      var nodes = [];
      function validNodeSpot(nx, ny) {
        var nmat = gridMaterialAt(nx, ny);
        if (nmat === 'water' || nmat === 'lava' || nmat === 'void') return false;
        if (U.dist(nx, ny, camp.x, camp.y) < campSafe + 18) return false;
        if (U.dist(nx, ny, bossPoint.x, bossPoint.y) < bossSafe + 18) return false;
        if (distanceToPath(nx, ny, path) < roadWidth / 2 + 16) return false;
        if (!hasSpacing(nx, ny, minSpacing + 8)) return false;
        for (var nsi = 0; nsi < nodes.length; nsi++) {
          if (U.dist(nx, ny, nodes[nsi].x, nodes[nsi].y) < 58) return false;
        }
        return true;
      }

      function fallbackNode(ordinal) {
        var step = 14;
        var cols = Math.floor((w - 68) / step) + 1;
        var rows = Math.floor((h - BOUND_TOP - 54) / step) + 1;
        var total = cols * rows;
        var start = (ordinal * 137) % total;
        for (var scan = 0; scan < total; scan++) {
          var cell = (start + scan) % total;
          var x = 34 + cell % cols * step;
          var y = BOUND_TOP + 28 + Math.floor(cell / cols) * step;
          if (validNodeSpot(x, y)) return { x: x, y: y };
        }
        throw new Error('No legal gather node spot for ' + region.id);
      }

      var gather = region.gather;
      if (gather && Array.isArray(gather.nodes) && gather.nodes.length) {
        var countRange = gather.count || [3, 5];
        var nodeCount = Math.max(0, Math.floor(countRange[0] +
          nodeRng() * (countRange[1] - countRange[0] + 1)));
        for (var ni = 0; ni < nodeCount; ni++) {
          var nd = gather.nodes[ni % gather.nodes.length];
          var placedNode = null;
          for (var nt = 0; nt < 220; nt++) {
            var nx = 34 + nodeRng() * (w - 68);
            var ny = BOUND_TOP + 28 + nodeRng() * (h - BOUND_TOP - 54);
            if (!validNodeSpot(nx, ny)) continue;
            placedNode = { x: nx, y: ny };
            break;
          }
          if (!placedNode) placedNode = fallbackNode(ni);
          var cdRange = gather.cooldown || [90, 150];
          nodes.push({
            kind: 'gatherNode',
            id: region.id + ':' + nd.id + ':' + ni,
            nodeType: nd.id,
            sprite: nd.sprite,
            material: nd.material,
            color: nd.color,
            accent: nd.accent,
            x: placedNode.x,
            y: placedNode.y,
            phase: nodeRng() * Math.PI * 2,
            cooldown: Math.round(cdRange[0] + nodeRng() * (cdRange[1] - cdRange[0]))
          });
        }
      }

      var nw = Math.ceil(w / NAV_CELL), nh = Math.ceil(h / NAV_CELL);
      var navGrid = [], navCosts = [];
      for (gy = 0; gy < nh; gy++) {
        var gridRow = [], costRow = [];
        for (gx = 0; gx < nw; gx++) {
          var sum = 0, count = 0;
          for (var sy = 0; sy < 2; sy++) {
            for (var sx = 0; sx < 2; sx++) {
              var mgx = gx * 2 + sx, mgy = gy * 2 + sy;
              if (mgx < gw && mgy < gh) {
                sum += MATERIAL_COST[grid[mgy * gw + mgx]] || 1;
                count++;
              }
            }
          }
          gridRow.push(1);
          costRow.push(sum / Math.max(1, count));
        }
        navGrid.push(gridRow);
        navCosts.push(costRow);
      }
      for (i = 0; i < props.length; i++) {
        var avoid = props[i];
        if (!avoid.large || avoid.campProp || avoid.campfire || avoid.sprite === 'tent') continue;
        var asp = spriteInfo(avoid.sprite);
        var avoidR = Math.max(22, Math.min(42, Math.max(asp.w, asp.h) * 1.25));
        for (gy = 0; gy < nh; gy++) {
          for (gx = 0; gx < nw; gx++) {
            var ncx = gx * NAV_CELL + NAV_CELL / 2;
            var ncy = gy * NAV_CELL + NAV_CELL / 2;
            var nd = U.dist(ncx, ncy, avoid.x, avoid.y);
            if (nd < avoidR) {
              navCosts[gy][gx] += 0.65 * (1 - nd / avoidR);
              if (dense) navCosts[gy][gx] = Math.min(2.8, navCosts[gy][gx]);
            }
          }
        }
      }

      var spawnCandidates = [];
      for (gy = Math.ceil(BOUND_TOP / NAV_CELL); gy < nh; gy++) {
        for (gx = 1; gx < nw - 1; gx++) {
          var sc = { x: gx * NAV_CELL + NAV_CELL / 2, y: gy * NAV_CELL + NAV_CELL / 2 };
          if (navCosts[gy][gx] <= 1.16 &&
              U.dist(sc.x, sc.y, camp.x, camp.y) >= campSafe + 28 &&
              U.dist(sc.x, sc.y, bossPoint.x, bossPoint.y) >= bossSafe + 18) {
            spawnCandidates.push(sc);
          }
        }
      }
      var corridorCandidates = [];
      for (i = 1; i < path.length; i++) {
        var a = path[i - 1], b = path[i];
        var segLen = U.dist(a.x, a.y, b.x, b.y);
        var steps = Math.max(1, Math.floor(segLen / 28));
        for (n = 1; n < steps; n++) {
          var cr = n / steps;
          var cp = { x: a.x + (b.x - a.x) * cr, y: a.y + (b.y - a.y) * cr };
          if (U.dist(cp.x, cp.y, camp.x, camp.y) >= campSafe + 20 &&
              U.dist(cp.x, cp.y, bossPoint.x, bossPoint.y) >= bossSafe + 12) corridorCandidates.push(cp);
        }
      }
      if (!spawnCandidates.length) spawnCandidates = corridorCandidates.slice();

      var layout = {
        version: layoutVersion,
        worldSeed: worldSeed,
        regionSeed: seedFor(worldSeed, region.id, layoutVersion, 'root'),
        seeds: {
          landmarks: seedFor(worldSeed, region.id, layoutVersion, 'landmarks'),
          terrain: seedFor(worldSeed, region.id, layoutVersion, 'terrain'),
          decor: seedFor(worldSeed, region.id, layoutVersion, 'decor'),
          details: seedFor(worldSeed, region.id, layoutVersion, 'details'),
          nodes: seedFor(worldSeed, region.id, layoutVersion, 'nodes')
        },
        world: { w: w, h: h },
        camp: camp,
        bossPoint: bossPoint,
        campSafeRadius: campSafe,
        bossSafeRadius: bossSafe,
        density: {
          patches: patchDensity,
          decor: decorDensity,
          details: detailDensity,
          waterDecor: waterDecorDensity
        },
        corridor: { points: path, width: roadWidth, mat: lc.road.mat },
        patches: patches,
        cell: CELL,
        gw: gw,
        gh: gh,
        grid: grid,
        colorGrid: colorGrid,
        props: props,
        nodes: nodes,
        glows: glows,
        tufts: tufts,
        flowers: flowers,
        waterCells: waterCells,
        lavaCells: lavaCells,
        spawnCandidates: spawnCandidates,
        corridorCandidates: corridorCandidates,
        nav: { cell: NAV_CELL, w: nw, h: nh, grid: navGrid, costs: navCosts }
      };
      if (!finitePoint(camp) || !finitePoint(bossPoint)) throw new Error('Terrain landmarks must be finite');

      T.layout = layout;
      T.grid = grid;
      T.colorGrid = colorGrid;
      T.gw = gw;
      T.gh = gh;
      T.props = props;
      T.nodes = nodes;
      T.glows = glows;
      T.tufts = tufts;
      T.flowers = flowers;
      T.decals = [];
      T.waterCells = waterCells;
      T.lavaCells = lavaCells;
      T.campfirePos = { x: camp.x, y: camp.y };
      T.tuftColors = cfg.tuftColors || ['#3d8232', '#7ac86a'];
      if (typeof T.bake === 'function') T.bake(region, layout);
      if (Game.nav && typeof Game.nav.useLayout === 'function') Game.nav.useLayout(layout);
      return layout;
    },

    /** 用于确定性测试和 QA，不包含 Canvas 或临时动画状态。 */
    snapshot: function (layout) {
      layout = layout || T.layout;
      return {
        version: layout.version,
        worldSeed: layout.worldSeed,
        camp: layout.camp,
        bossPoint: layout.bossPoint,
        corridor: layout.corridor,
        grid: layout.grid,
        props: layout.props.map(function (p) {
          return { sprite: p.sprite, x: p.x, y: p.y, flipX: p.flipX };
        }),
        tufts: layout.tufts.map(function (p) { return { x: p.x, y: p.y, h: p.h }; }),
        flowers: layout.flowers,
        spawnCandidates: layout.spawnCandidates,
        navCosts: layout.nav.costs
      };
    },

    materialPalette: materialPalette,
    distanceToPath: distanceToPath
  };
})();
