/* Permanent-layout nest treasure. Deliberately separate from timed chests and mimics. */
(function () {
  'use strict';
  var Game = window.Game, U = Game.util, C = Game.contentCompiler;
  var regionId = null, treasures = [], byId = {};

  function stableRoll(id, suffix) {
    var exp = Game.expedition && Game.expedition.current ? Game.expedition.current(regionId).index : 0;
    return parseInt(U.fnv1a(['nest-treasure-v1', Game.state.world.worldSeed,
      regionId, exp, id, suffix].join(':')), 16) / 0xffffffff;
  }
  function sync(treasure) {
    treasure.claimed = Game.guardSites && Game.guardSites.claimedTreasure(treasure.id);
    treasure.locked = !treasure.claimed && Game.guardSites && !Game.guardSites.canInteract(treasure);
    treasure.available = !treasure.claimed && !treasure.locked;
    return treasure;
  }
  function initRegion(rid, layout) {
    regionId = rid; treasures = []; byId = {};
    if (!layout || layout.version < 4) return treasures;
    (layout.treasureSites || []).forEach(function (source) {
      var treasure = C.clone(source);
      treasure.fixedNestChest = true;
      treasure.kind = 'nestTreasure';
      treasure.sprite = 'exp_chest';
      treasure.rare = treasure.depth === 'deep';
      treasure.ttl = null; treasure.age = 0;
      sync(treasure); treasures.push(treasure); byId[treasure.id] = treasure;
    });
    return treasures;
  }
  function open(treasure) {
    treasure = typeof treasure === 'string' ? byId[treasure] : treasure;
    if (!treasure || treasures.indexOf(treasure) < 0) return { outcome: 'failed', reason: 'missing-treasure' };
    sync(treasure);
    if (treasure.claimed) return { outcome: 'failed', reason: 'claimed' };
    if (treasure.locked) return { outcome: 'failed', reason: 'guarded' };
    var tier = Game.State.regionTier(regionId), reward = Game.F.nestChestYield(tier, treasure.depth);
    var resources = Game.world.region.exploration.resources || [];
    var material = resources.length ? resources[Math.floor(stableRoll(treasure.id, 'material') * resources.length)].material : null;
    var count = reward.materialMin + Math.floor(stableRoll(treasure.id, 'count') *
      (reward.materialMax - reward.materialMin + 1));
    var equipment = stableRoll(treasure.id, 'equipment') < reward.equipmentChance
      ? Game.inv.genLoot(Game.state.player.level, { rarMin: reward.equipmentRarityMin,
        luck: treasure.depth === 'deep' ? 1.55 : 1.18 }) : null;
    Game.player.addGold(reward.gold);
    if (material) Game.inv.addMaterial(material, count);
    if (equipment) Game.inv.deliverDrops([{ category: 'equipment', item: equipment }], {
      source: 'nest-chest', forceGround: Game.state.settings.groundLoot !== false,
      x: treasure.x, y: treasure.y
    });
    Game.guardSites.markTreasureClaimed(treasure.id);
    sync(treasure);
    Game.state.meta.stats.chests++;
    var result = { outcome: 'loot', source: 'nest-chest', id: treasure.id,
      depth: treasure.depth, gold: reward.gold, material: material,
      materialCount: count, crystal: 0, equipment: equipment };
    Game.bus.emit('nestChest:opened', result);
    Game.bus.emit('chest:opened', result);
    if (Game.fx) {
      if (U.motionEnabled()) Game.fx.poof(treasure.x, treasure.y - 4);
      Game.fx.ring(treasure.x, treasure.y, treasure.depth === 'deep' ? 30 : 24, '#ffd36a');
    }
    return result;
  }

  Game.worldTreasures = {
    initRegion: initRegion,
    list: function () { treasures.forEach(sync); return treasures.filter(function (item) { return !item.claimed; }); },
    all: function () { treasures.forEach(sync); return treasures.slice(); },
    get: function (id) { return byId[id] ? sync(byId[id]) : null; },
    nearest: function (x, y, predicate) {
      var best = null, distance = Infinity;
      treasures.forEach(function (treasure) {
        sync(treasure);
        if (treasure.claimed || predicate && !predicate(treasure)) return;
        var d = U.dist(x, y, treasure.x, treasure.y);
        if (d < distance) { best = treasure; distance = d; }
      });
      return best ? { target: best, distance: distance } : null;
    },
    open: open,
    reset: function () { regionId = null; treasures = []; byId = {}; }
  };
})();
