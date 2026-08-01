/* Typed, deterministic encounter-pool resolution shared by world population and guard sites. */
(function () {
  'use strict';
  var Game = window.Game;
  var C = Game.contentCompiler;

  function normalizedContext(pool, context) {
    context = context || {};
    return {
      worldSeed: context.worldSeed !== undefined ? context.worldSeed :
        Game.state && Game.state.world && Game.state.world.worldSeed || 0,
      regionId: context.regionId || pool.regionId,
      layoutVersion: context.layoutVersion ||
        Game.state && Game.state.world && Game.state.world.layoutVersion || 4,
      expeditionIndex: Number.isInteger(context.expeditionIndex) ? context.expeditionIndex :
        Game.expedition && Game.expedition.index ? Game.expedition.index(pool.regionId) : 0,
      siteId: context.siteId || context.layoutSlotKey || 'pool',
      ordinal: Number.isInteger(context.ordinal) ? context.ordinal : 0
    };
  }

  function rollFor(pool, context) {
    var key = [
      'encounter-pool-v1', pool.id, context.worldSeed, context.regionId,
      context.layoutVersion, context.expeditionIndex, context.siteId, context.ordinal
    ].join(':');
    return parseInt(Game.util.fnv1a(key), 16) / 0xffffffff;
  }

  function resolve(poolId, context) {
    var pool = Game.content.get('encounterPoolProfile', poolId);
    if (!pool || !pool.entries || !pool.entries.length) return null;
    var normalized = normalizedContext(pool, context);
    var entries = pool.entries.filter(function (entry) {
      return !!Game.content.get('worldSpawnProfile', entry.worldSpawnProfileId);
    });
    if (!entries.length) return null;
    var total = entries.reduce(function (sum, entry) { return sum + entry.weight; }, 0);
    var cursor = rollFor(pool, normalized) * total;
    var selected = entries[entries.length - 1];
    for (var i = 0; i < entries.length; i++) {
      cursor -= entries[i].weight;
      if (cursor < 0) { selected = entries[i]; break; }
    }
    return C.deepFreeze(C.clone({
      poolId: pool.id,
      category: pool.category,
      roles: pool.roles,
      worldSpawnProfileId: selected.worldSpawnProfileId,
      weight: selected.weight,
      context: normalized
    }));
  }

  Game.encounterPools = {
    resolve: resolve,
    profile: function (poolId) {
      return Game.content.get('encounterPoolProfile', poolId) || null;
    },
    forRegion: function (regionId) {
      return Game.content.all('encounterPoolProfile').filter(function (pool) {
        return pool.regionId === regionId;
      });
    },
    snapshot: function (poolId, context, count) {
      count = Math.max(1, Math.min(64, count | 0 || 1));
      var out = [];
      for (var i = 0; i < count; i++) {
        out.push(resolve(poolId, Object.assign({}, context || {}, { ordinal: i })));
      }
      return C.deepFreeze(C.clone(out));
    }
  };
})();
