/* ============================================================
 * systems/trade.js — 当前地图的交易区域与商品目录解析
 *
 * 区域通过 region.tradeAreas 声明交易地点：
 *   { id, anchor, radius|radiusFrom, catalogs[], priority?, nameKey? }
 * anchor 可引用运行时布局地标（如 camp），也可直接提供 {x,y}。
 * 商店系统只消费当前交易上下文，不硬编码营地，便于未来追加
 * 特殊商人、区域兑换点或仅在特定地点开放的商品目录。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;
  var lastSignature = null;
  var dynamicAreas = [];
  var dynamicSeq = 1;

  function unavailable(reason, extra) {
    var result = {
      available: false,
      reason: reason,
      regionId: Game.state && Game.state.world ? Game.state.world.region : null,
      areaId: null,
      nameKey: null,
      catalogs: [],
      nearest: null
    };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) result[key] = extra[key];
      }
    }
    return result;
  }

  function resolveArea(def, layout) {
    if (!def || !layout) return null;
    var anchorDef = def.anchor;
    var point = typeof anchorDef === 'string' ? layout[anchorDef] : anchorDef;
    if (!point || !isFinite(point.x) || !isFinite(point.y)) return null;

    var radius = Number(def.radius);
    if (def.radiusFrom && isFinite(layout[def.radiusFrom])) {
      radius = Number(layout[def.radiusFrom]);
    }
    if (!(radius > 0)) return null;

    var offset = def.offset || {};
    return {
      id: def.id,
      kind: def.kind || 'merchant',
      anchor: typeof anchorDef === 'string' ? anchorDef : null,
      x: point.x + (Number(offset.x) || 0),
      y: point.y + (Number(offset.y) || 0),
      radius: radius,
      catalogs: Array.isArray(def.catalogs) ? def.catalogs.slice() : [],
      priority: Number(def.priority) || 0,
      nameKey: def.nameKey || null,
      prop: def.prop || null
    };
  }

  function isBusy(hero) {
    if (Game.entryState !== undefined && Game.entryState !== 'active') return true;
    if (Game.transitions && Game.transitions.isActive()) return true;
    if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return true;
    return !hero || hero.state === 'dead' || hero.state === 'recover' ||
      hero.state === 'entrance' || hero.state === 'warpOut' ||
      hero.state === 'warpIn' || hero.state === 'ending';
  }

  function signature(context) {
    return [
      context.available ? '1' : '0',
      context.reason || '',
      context.regionId || '',
      context.areaId || '',
      context.catalogs.join(',')
    ].join('|');
  }

  var Trade = Game.trade = {
    /** 将区域静态声明解析为当前随机布局中的实际坐标。 */
    areas: function () {
      var world = Game.world;
      var region = world && world.region;
      var layout = world && world.layout;
      if (!region || !layout) return [];
      var out = [];
      var statics = Array.isArray(region.tradeAreas) ? region.tradeAreas : [];
      for (var i = 0; i < statics.length; i++) {
        var area = resolveArea(statics[i], layout);
        if (area) out.push(area);
      }
      for (var j = 0; j < dynamicAreas.length; j++) {
        var dyn = dynamicAreas[j];
        if (dyn.regionId && dyn.regionId !== region.id) continue;
        var resolved = resolveArea(dyn.def, layout);
        if (resolved) {
          resolved.dynamic = true;
          resolved.expiresAt = dyn.expiresAt;
          out.push(resolved);
        }
      }
      return out;
    },

    /** 返回角色在当前地图中的交易上下文；切图中或非法世界状态一律拒绝。 */
    current: function () {
      var state = Game.state;
      var world = Game.world;
      if (!state || !state.world || !world || !world.region || !world.layout) {
        return unavailable('not-ready');
      }
      if (world.region.id !== state.world.region) {
        return unavailable('region-mismatch');
      }

      var hero = world.hero;
      if (isBusy(hero)) return unavailable('busy');

      var areas = Trade.areas();
      if (!areas.length) return unavailable('no-area');

      var nearest = null;
      var active = null;
      for (var i = 0; i < areas.length; i++) {
        var area = areas[i];
        var distance = U.dist(hero.x, hero.y, area.x, area.y);
        var candidate = {
          id: area.id,
          kind: area.kind,
          anchor: area.anchor,
          x: area.x,
          y: area.y,
          radius: area.radius,
          distance: distance,
          catalogs: area.catalogs,
          priority: area.priority,
          nameKey: area.nameKey,
          prop: area.prop,
          dynamic: !!area.dynamic
        };
        if (!nearest || distance < nearest.distance) nearest = candidate;
        if (distance > area.radius) continue;
        if (!active || area.priority > active.priority ||
          (area.priority === active.priority && distance < active.distance)) {
          active = candidate;
        }
      }

      if (!active) return unavailable('outside', { nearest: nearest });
      return {
        available: true,
        reason: null,
        regionId: state.world.region,
        areaId: active.id,
        areaKind: active.kind,
        nameKey: active.nameKey,
        catalogs: active.catalogs.slice(),
        distance: active.distance,
        radius: active.radius,
        nearest: nearest
      };
    },

    areaById: function (id) {
      var areas = Trade.areas();
      for (var i = 0; i < areas.length; i++) if (areas[i].id === id) return areas[i];
      return null;
    },

    /** 玩家显式发起的一次性走近指令；不加入挂机 AI 目标序列。 */
    requestApproach: function (areaId, opts) {
      opts = opts || {};
      var area = Trade.areaById(areaId);
      if (!area || isBusy(Game.world && Game.world.hero) || Game.world.bossEnt) {
        return { ok: false, reason: 'busy' };
      }
      var current = Trade.current();
      if (current.available && current.areaId === areaId) {
        if (opts.open !== false && Game.ui && Game.ui.trade) Game.ui.trade.open(areaId);
        return { ok: true, opened: true };
      }
      if (!Game.world || !Game.world.startInteraction) return { ok: false, reason: 'not-ready' };
      var started = Game.world.startInteraction({
        type: 'trade',
        target: area,
        areaId: area.id,
        open: opts.open !== false,
        source: opts.source || 'world'
      }, true);
      return { ok: !!started, opened: false, reason: started ? null : 'busy' };
    },

    directionTo: function (point) {
      var h = Game.world && Game.world.hero;
      if (!h || !point) return '';
      var dx = point.x - h.x, dy = point.y - h.y;
      if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'east' : 'west';
      return dy >= 0 ? 'south' : 'north';
    },

    /** 临时交易域：仅运行时存在，切区/读档清空，ttl 由世界时钟驱动。 */
    registerDynamic: function (area, opts) {
      opts = opts || {};
      if (!area || (!area.anchor && !(isFinite(area.x) && isFinite(area.y)))) {
        return { ok: false, reason: 'invalid' };
      }
      var def = {};
      for (var key in area) def[key] = area[key];
      if (!def.id) def.id = 'dynamic-trade-' + (dynamicSeq++);
      if (!def.anchor) def.anchor = { x: Number(def.x), y: Number(def.y) };
      if (!(Number(def.radius) > 0)) def.radius = 54;
      var now = Game.state && Game.state.world ? Number(Game.state.world.worldTime) || 0 : 0;
      var ttl = Math.max(0, Number(opts.ttl) || 0);
      dynamicAreas.push({
        id: def.id,
        def: def,
        regionId: area.regionId || (Game.state && Game.state.world && Game.state.world.region),
        expiresAt: ttl ? now + ttl : Infinity
      });
      Trade.update();
      return { ok: true, id: def.id };
    },

    clearDynamic: function () {
      dynamicAreas.length = 0;
    },

    /** 商品目录与交易地点目录只要有交集，即可在该地点提供。 */
    allows: function (itemCatalogs, context) {
      context = context || Trade.current();
      if (!context.available) return false;
      var requested = Array.isArray(itemCatalogs) && itemCatalogs.length
        ? itemCatalogs
        : ['camp-general'];
      if (context.catalogs.indexOf('*') >= 0) return true;
      for (var i = 0; i < requested.length; i++) {
        if (context.catalogs.indexOf(requested[i]) >= 0) return true;
      }
      return false;
    },

    /** 主循环轻量轮询，只在跨越交易域边界时发事件。 */
    update: function () {
      var now = Game.state && Game.state.world ? Number(Game.state.world.worldTime) || 0 : 0;
      var expired = [];
      for (var i = dynamicAreas.length - 1; i >= 0; i--) {
        if (dynamicAreas[i].expiresAt <= now) {
          expired.push(dynamicAreas[i].id);
          dynamicAreas.splice(i, 1);
        }
      }
      var context = Trade.current();
      var next = signature(context);
      if (next !== lastSignature) {
        var previous = lastSignature;
        lastSignature = next;
        bus.emit('trade:contextChanged', {
          context: context,
          previous: previous,
          expired: expired
        });
      } else if (expired.length) {
        bus.emit('trade:contextChanged', {
          context: context,
          previous: lastSignature,
          expired: expired
        });
      }
      return context;
    },

    reset: function (opts) {
      if (opts && opts.dynamic) Trade.clearDynamic();
      lastSignature = null;
    },

    resolveArea: resolveArea,
    isBusy: isBusy
  };
})();
