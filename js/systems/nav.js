/* ============================================================
 * systems/nav.js — 16px 加权导航
 * v3 使用宏观图 + 局部 EasyStar、硬阻挡与逐帧预算；v1/v2 保留旧路径兼容。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var REPATH_AFTER = 0.6;
  var TARGET_MOVE_THRESHOLD = 32;
  var LONG_ROUTE_THRESHOLD = 420;
  var LEG_REACHED_THRESHOLD = 36;
  var STILL_RECOVERY_AFTER = 1.2;

  function clonePoints(points) {
    return points && points.map(function (point) {
      return { x: point.x, y: point.y };
    });
  }

  function currentLeg(route) {
    return route && route.legs && route.legs[route.legIndex];
  }

  function requestCurrentLeg(route, ent) {
    var leg = currentLeg(route);
    if (!leg) return false;
    route.pathKey = N.pathKey(ent.x, ent.y, leg.x, leg.y);
    var solved = N.solveLeg(ent.x, ent.y, leg.x, leg.y);
    route.age = 0;
    route.index = 0;
    route.points = solved || [];
    route.pending = solved === undefined;
    route.fallback = solved === null;
    return !route.pending && !route.fallback;
  }

  function makeV3Route(ent, tx, ty, token) {
    var journey = N.planJourney(ent.x, ent.y, tx, ty);
    var route = {
      token: token,
      strategy: N.strategy(),
      targetX: tx,
      targetY: ty,
      finalX: journey.final.x,
      finalY: journey.final.y,
      age: 0,
      index: 0,
      points: [],
      pending: false,
      fallback: false,
      legs: journey.legs,
      legIndex: 0,
      macroIds: journey.macroIds,
      recoveries: 0,
      stillAge: 0,
      pathKey: null
    };
    if (route.macroIds.length > 1) N.diagnostics.longRoutes++;
    requestCurrentLeg(route, ent);
    return route;
  }

  function advanceLeg(route, ent) {
    var advanced = false;
    while (route.legIndex < route.legs.length - 1) {
      var leg = currentLeg(route);
      if (U.dist(ent.x, ent.y, leg.x, leg.y) > LEG_REACHED_THRESHOLD) break;
      route.legIndex++;
      advanced = true;
    }
    if (advanced) {
      route.points = [];
      route.index = 0;
      route.pending = false;
      route.fallback = false;
      route.stillAge = 0;
      requestCurrentLeg(route, ent);
    }
    return advanced;
  }

  var N = Game.nav = {
    finder: null,
    layout: null,
    cache: {},
    macroCache: {},
    pending: {},
    queue: [],
    diagnostics: { peakMs: 0, solved: 0, queued: 0, longRoutes: 0, recovered: 0 },

    useLayout: function (layout) {
      N.layout = layout;
      N.finder = null;
      N.cache = {};
      N.macroCache = {};
      N.pending = {};
      N.queue = [];
      N.diagnostics = { peakMs: 0, solved: 0, queued: 0, longRoutes: 0, recovered: 0 };
      if (!window.EasyStar || !window.EasyStar.js) return false;
      var finder = new window.EasyStar.js();
      finder.setGrid(layout.nav.grid);
      finder.setAcceptableTiles(1);
      finder.enableDiagonals();
      finder.enableSync();
      for (var y = 0; y < layout.nav.h; y++) {
        for (var x = 0; x < layout.nav.w; x++) {
          var hazardCost = Game.hazards && Game.hazards.navigationCost
            ? Game.hazards.navigationCost(
                x * layout.nav.cell + layout.nav.cell / 2,
                y * layout.nav.cell + layout.nav.cell / 2,
                N.strategy()
              )
            : 0;
          finder.setAdditionalPointCost(x, y, layout.nav.costs[y][x] + hazardCost);
        }
      }
      N.finder = finder;
      return true;
    },

    strategy: function () {
      var id = Game.state && Game.state.settings && Game.state.settings.expeditionStrategy;
      return id === 'safe' || id === 'loot' ? id : 'balanced';
    },

    macroRoute: function (from, to) {
      var layout = N.layout;
      if (!layout || layout.version < 3 || !layout.macro || from === to) return [from, to];
      var strategy = N.strategy();
      var key = from + '>' + to + ':' + strategy;
      if (N.macroCache[key]) return N.macroCache[key].slice();
      var count = layout.macro.centers.length, dist = [], prev = [], done = [];
      var dangerWeight = strategy === 'safe' ? 1.55 : (strategy === 'loot' ? 0.62 : 1);
      for (var i = 0; i < count; i++) { dist[i] = Infinity; prev[i] = -1; }
      dist[from] = 0;
      for (var pass = 0; pass < count; pass++) {
        var at = -1;
        for (i = 0; i < count; i++) if (!done[i] && (at < 0 || dist[i] < dist[at])) at = i;
        if (at < 0 || at === to) break;
        done[at] = true;
        for (var ei = 0; ei < layout.macro.edges.length; ei++) {
          var edge = layout.macro.edges[ei];
          var next = edge.a === at ? edge.b : (edge.b === at ? edge.a : -1);
          if (next < 0) continue;
          var cost = edge.length * (1 + edge.danger * dangerWeight * 0.38);
          if (dist[at] + cost < dist[next]) {
            dist[next] = dist[at] + cost;
            prev[next] = at;
          }
        }
      }
      var out = [], cur = to, guard = 0;
      while (cur >= 0 && guard++ < count + 2) {
        out.unshift(cur);
        if (cur === from) break;
        cur = prev[cur];
      }
      if (!out.length || out[0] !== from) out = [from, to];
      N.macroCache[key] = out.slice();
      return out;
    },

    legTarget: function (sx, sy, tx, ty) {
      var layout = N.layout;
      if (!layout || layout.version < 3 || U.dist(sx, sy, tx, ty) < LONG_ROUTE_THRESHOLD) {
        return { x: tx, y: ty };
      }
      var nav = layout.nav, cell = nav.cell;
      var sxg = U.clamp((sx / cell) | 0, 0, nav.w - 1);
      var syg = U.clamp((sy / cell) | 0, 0, nav.h - 1);
      var txg = U.clamp((tx / cell) | 0, 0, nav.w - 1);
      var tyg = U.clamp((ty / cell) | 0, 0, nav.h - 1);
      var from = nav.macroCenter[syg][sxg], to = nav.macroCenter[tyg][txg];
      var route = N.macroRoute(from, to);
      if (route.length < 2) return { x: tx, y: ty };
      var center = layout.macro.centers[route[1]];
      var projected = Game.terrain.projectPoint(center.x, center.y, 2);
      return projected || { x: tx, y: ty };
    },

    /**
     * 将一次长距离指令固定为宏观航点行程。局部 A* 可以频繁刷新，
     * 但在抵达当前航点前不会重新按 Voronoi 分区猜测下一站。
     */
    planJourney: function (sx, sy, tx, ty) {
      var layout = N.layout;
      var finalPoint = { x: tx, y: ty };
      if (layout && layout.version >= 3 && Game.terrain && Game.terrain.projectPoint) {
        finalPoint = Game.terrain.projectPoint(tx, ty, 2) ||
          Game.terrain.projectPoint(tx, ty, 1) || finalPoint;
      }
      var legs = [];
      var macroIds = [];
      if (layout && layout.version >= 3 && layout.macro &&
          U.dist(sx, sy, finalPoint.x, finalPoint.y) >= LONG_ROUTE_THRESHOLD) {
        var nav = layout.nav, cell = nav.cell;
        var sxg = U.clamp((sx / cell) | 0, 0, nav.w - 1);
        var syg = U.clamp((sy / cell) | 0, 0, nav.h - 1);
        var txg = U.clamp((finalPoint.x / cell) | 0, 0, nav.w - 1);
        var tyg = U.clamp((finalPoint.y / cell) | 0, 0, nav.h - 1);
        var from = nav.macroCenter[syg][sxg];
        var to = nav.macroCenter[tyg][txg];
        if (from !== to) {
          macroIds = N.macroRoute(from, to);
          for (var mi = 1; mi < macroIds.length; mi++) {
            var center = layout.macro.centers[macroIds[mi]];
            var projected = center && Game.terrain.projectPoint(center.x, center.y, 2);
            if (projected) {
              legs.push({
                id: 'macro:' + macroIds[mi],
                macroId: macroIds[mi],
                x: projected.x,
                y: projected.y
              });
            }
          }
        }
      }
      if (legs.length && U.dist(
        legs[legs.length - 1].x, legs[legs.length - 1].y,
        finalPoint.x, finalPoint.y
      ) <= LEG_REACHED_THRESHOLD) {
        legs[legs.length - 1] = {
          id: 'target', x: finalPoint.x, y: finalPoint.y, final: true
        };
      } else {
        legs.push({ id: 'target', x: finalPoint.x, y: finalPoint.y, final: true });
      }
      return {
        macroIds: macroIds,
        legs: legs,
        final: finalPoint
      };
    },

    solveImmediate: function (sx, sy, tx, ty) {
      var layout = N.layout;
      if (!layout || !N.finder) return null;
      var cell = layout.nav.cell;
      var ax = U.clamp((sx / cell) | 0, 0, layout.nav.w - 1);
      var ay = U.clamp((sy / cell) | 0, 0, layout.nav.h - 1);
      var bx = U.clamp((tx / cell) | 0, 0, layout.nav.w - 1);
      var by = U.clamp((ty / cell) | 0, 0, layout.nav.h - 1);
      if (layout.version >= 3 && Game.terrain && Game.terrain.projectPoint) {
        var pa = Game.terrain.projectPoint(sx, sy, 1);
        var pb = Game.terrain.projectPoint(tx, ty, 1);
        if (!pa || !pb) return null;
        ax = U.clamp((pa.x / cell) | 0, 0, layout.nav.w - 1);
        ay = U.clamp((pa.y / cell) | 0, 0, layout.nav.h - 1);
        bx = U.clamp((pb.x / cell) | 0, 0, layout.nav.w - 1);
        by = U.clamp((pb.y / cell) | 0, 0, layout.nav.h - 1);
      }
      var result = null;
      try {
        N.finder.findPath(ax, ay, bx, by, function (path) { result = path; });
        N.finder.calculate();
      } catch (e) {
        console.warn('[Nav] path solve failed', e);
        return null;
      }
      if (!result) return null;
      var points = [];
      for (var i = 1; i < result.length; i++) {
        points.push({ x: result[i].x * cell + cell / 2, y: result[i].y * cell + cell / 2 });
      }
      if (!points.length || U.dist(points[points.length - 1].x, points[points.length - 1].y, tx, ty) > 2) {
        if (layout.version < 3 || Game.terrain.isWalkable(tx, ty, 1)) points.push({ x: tx, y: ty });
      } else {
        points[points.length - 1] = { x: tx, y: ty };
      }
      return points;
    },

    solve: function (sx, sy, tx, ty) {
      var layout = N.layout;
      if (!layout || !N.finder) return null;
      if (layout.version < 3) return N.solveImmediate(sx, sy, tx, ty);
      var leg = N.legTarget(sx, sy, tx, ty);
      return N.solveLeg(sx, sy, leg.x, leg.y);
    },

    pathKey: function (sx, sy, tx, ty) {
      var cell = N.layout.nav.cell;
      return ((sx / cell) | 0) + ':' + ((sy / cell) | 0) + '>' +
        ((tx / cell) | 0) + ':' + ((ty / cell) | 0) + '@' +
        Math.round(tx) + ':' + Math.round(ty);
    },

    solveLeg: function (sx, sy, tx, ty) {
      var layout = N.layout;
      if (!layout || !N.finder) return null;
      if (layout.version < 3) return N.solveImmediate(sx, sy, tx, ty);
      var cell = layout.nav.cell;
      var key = N.pathKey(sx, sy, tx, ty);
      if (Object.prototype.hasOwnProperty.call(N.cache, key)) {
        return N.cache[key] === null ? null : clonePoints(N.cache[key]);
      }
      if (!N.pending[key]) {
        N.pending[key] = { key: key, sx: sx, sy: sy, tx: tx, ty: ty };
        N.queue.push(N.pending[key]);
        N.diagnostics.queued++;
      }
      return undefined;
    },

    update: function (budgetMs) {
      if (!N.layout || N.layout.version < 3 || !N.queue.length) return 0;
      budgetMs = budgetMs || 2;
      var clock = window.performance && performance.now ? performance : Date;
      var start = clock.now(), count = 0;
      while (N.queue.length && (count === 0 || clock.now() - start < budgetMs)) {
        var request = N.queue.shift();
        var began = clock.now();
        var points = N.solveImmediate(request.sx, request.sy, request.tx, request.ty);
        var elapsed = clock.now() - began;
        N.diagnostics.peakMs = Math.max(N.diagnostics.peakMs, elapsed);
        N.diagnostics.solved++;
        if (Object.keys(N.cache).length > 160) N.cache = {};
        N.cache[request.key] = points ? clonePoints(points) : null;
        delete N.pending[request.key];
        count++;
      }
      return count;
    },

    clear: function (ent) {
      if (ent) ent.navRoute = null;
    },

    clearAll: function (entities) {
      if (!entities) return;
      for (var i = 0; i < entities.length; i++) N.clear(entities[i]);
    },

    /**
     * 沿加权路径推进一个实体。directMove 只负责单段向量位移。
     * token 用于区分目标实例；位置抖动小于 32px 时复用路径至 0.6s 超时。
     */
    step: function (ent, tx, ty, speed, dt, token, directMove) {
      if (!ent || !Number.isFinite(tx) || !Number.isFinite(ty)) return Infinity;
      if (N.layout && N.layout.version >= 3) {
        return N.stepV3(ent, tx, ty, speed, dt, token, directMove);
      }
      var route = ent.navRoute;
      var tokenChanged = route && token !== undefined && route.token !== token;
      var targetMoved = route && U.dist(route.targetX, route.targetY, tx, ty) > TARGET_MOVE_THRESHOLD;
      if (route) route.age += dt;
      if (!route || tokenChanged || targetMoved || route.age >= REPATH_AFTER || route.index >= route.points.length) {
        var solved = N.solve(ent.x, ent.y, tx, ty);
        route = ent.navRoute = {
          token: token,
          targetX: tx,
          targetY: ty,
          age: 0,
          index: 0,
          points: solved || [],
          pending: solved === undefined,
          fallback: solved === null
        };
      }

      if (route.pending) return U.dist(ent.x, ent.y, tx, ty);
      if (route.fallback || !route.points.length) {
        // v3 禁止直线穿墙兜底；等待 AI 投影/重规划。旧版保持历史行为。
        if (!N.layout || N.layout.version < 3) directMove(ent, tx, ty, speed, dt);
        return U.dist(ent.x, ent.y, tx, ty);
      }

      while (route.index < route.points.length - 1 &&
             U.dist(ent.x, ent.y, route.points[route.index].x, route.points[route.index].y) < 5) {
        route.index++;
      }
      if (route.index < route.points.length) {
        var next = route.points[route.index];
        directMove(ent, next.x, next.y, speed, dt);
      }
      return U.dist(ent.x, ent.y, tx, ty);
    },

    stepV3: function (ent, tx, ty, speed, dt, token, directMove) {
      var route = ent.navRoute;
      var tokenChanged = route && token !== undefined && route.token !== token;
      var targetMoved = route && U.dist(route.targetX, route.targetY, tx, ty) > TARGET_MOVE_THRESHOLD;
      var strategyChanged = route && route.strategy !== N.strategy();
      if (!route || tokenChanged || targetMoved || strategyChanged || !route.legs) {
        route = ent.navRoute = makeV3Route(ent, tx, ty, token);
      }

      route.age += dt;
      advanceLeg(route, ent);

      // 首帧排队的局部路径在导航预算处理后立即接续，不再空等到 0.6 秒超时。
      if (route.pending) {
        requestCurrentLeg(route, ent);
        if (route.pending) return U.dist(ent.x, ent.y, route.finalX, route.finalY);
      }

      if (route.age >= REPATH_AFTER || route.index >= route.points.length) {
        requestCurrentLeg(route, ent);
        if (route.pending) return U.dist(ent.x, ent.y, route.finalX, route.finalY);
      }

      if (route.fallback || !route.points.length) {
        return U.dist(ent.x, ent.y, route.finalX, route.finalY);
      }

      while (route.index < route.points.length - 1 &&
             U.dist(ent.x, ent.y, route.points[route.index].x, route.points[route.index].y) < 5) {
        route.index++;
      }
      var beforeX = ent.x, beforeY = ent.y;
      var next = route.points[route.index];
      directMove(ent, next.x, next.y, speed, dt);
      var moved = U.dist(beforeX, beforeY, ent.x, ent.y);
      if (moved < 0.05) route.stillAge += dt;
      else route.stillAge = 0;

      // 处理半径与导航格罕见不一致：丢弃这一局部缓存后从当前位置重求，
      // 宏观航段保持不变，因此恢复不会把角色重新送回刚离开的分区。
      if (route.stillAge >= STILL_RECOVERY_AFTER) {
        if (route.pathKey) delete N.cache[route.pathKey];
        route.stillAge = 0;
        route.recoveries++;
        N.diagnostics.recovered++;
        requestCurrentLeg(route, ent);
      }
      return U.dist(ent.x, ent.y, route.finalX, route.finalY);
    },

    REPATH_AFTER: REPATH_AFTER,
    TARGET_MOVE_THRESHOLD: TARGET_MOVE_THRESHOLD,
    LONG_ROUTE_THRESHOLD: LONG_ROUTE_THRESHOLD,
    LEG_REACHED_THRESHOLD: LEG_REACHED_THRESHOLD
  };
})();
