/* ============================================================
 * systems/nav.js — EasyStar.js 16px 加权软拓扑导航
 * 所有格均可通行；失败时调用方继续使用直线移动。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var REPATH_AFTER = 0.6;
  var TARGET_MOVE_THRESHOLD = 32;

  var N = Game.nav = {
    finder: null,
    layout: null,

    useLayout: function (layout) {
      N.layout = layout;
      N.finder = null;
      if (!window.EasyStar || !window.EasyStar.js) return false;
      var finder = new window.EasyStar.js();
      finder.setGrid(layout.nav.grid);
      finder.setAcceptableTiles(1);
      finder.enableDiagonals();
      finder.enableSync();
      for (var y = 0; y < layout.nav.h; y++) {
        for (var x = 0; x < layout.nav.w; x++) {
          finder.setAdditionalPointCost(x, y, layout.nav.costs[y][x]);
        }
      }
      N.finder = finder;
      return true;
    },

    solve: function (sx, sy, tx, ty) {
      var layout = N.layout;
      if (!layout || !N.finder) return null;
      var cell = layout.nav.cell;
      var ax = U.clamp((sx / cell) | 0, 0, layout.nav.w - 1);
      var ay = U.clamp((sy / cell) | 0, 0, layout.nav.h - 1);
      var bx = U.clamp((tx / cell) | 0, 0, layout.nav.w - 1);
      var by = U.clamp((ty / cell) | 0, 0, layout.nav.h - 1);
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
        points.push({ x: tx, y: ty });
      } else {
        points[points.length - 1] = { x: tx, y: ty };
      }
      return points;
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
          fallback: !solved
        };
      }

      if (route.fallback || !route.points.length) {
        directMove(ent, tx, ty, speed, dt);
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

    REPATH_AFTER: REPATH_AFTER,
    TARGET_MOVE_THRESHOLD: TARGET_MOVE_THRESHOLD
  };
})();
