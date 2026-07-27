/* ============================================================
 * systems/environment.js — 采集节点与随机宝箱
 *
 * 节点位置来自 terrain 的独立 nodes 种子流；冷却持久化于
 * world.nodeCooldowns。宝箱由合法移动发现，全部临时状态仅驻内存。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus;

  var chests = [];
  var moveProgress = 0;
  var moveTarget = 0;
  var sinceChest = F.BAL.chestMinGap;
  var chestSeq = 1;
  var AUTO_GATHER_REVEAL_GRACE = 2.4;

  function nextMoveTarget() {
    moveTarget = U.rand(F.BAL.chestMoveMin, F.BAL.chestMoveMax);
  }

  function activeScene() {
    if (!Game.state || !Game.world || !Game.world.hero || !Game.world.layout) return false;
    if (Game.state.world.mode !== 'battle') return false;
    if (Game.transitions && Game.transitions.isActive()) return false;
    if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return false;
    return true;
  }

  function removeChest(chest) {
    var at = chests.indexOf(chest);
    if (at >= 0) chests.splice(at, 1);
  }

  var Env = Game.environment = {
    AUTO_GATHER_REVEAL_GRACE: AUTO_GATHER_REVEAL_GRACE,
    chests: function () { return chests; },

    resetRegion: function () {
      chests.length = 0;
      moveProgress = 0;
      sinceChest = F.BAL.chestMinGap;
      nextMoveTarget();
    },

    nodeReady: function (node) {
      if (!node || !Game.state || !Game.state.world) return false;
      return (Game.state.world.nodeCooldowns[node.id] || 0) <= 0;
    },

    nodeCooldown: function (node) {
      return Math.max(0, Game.state.world.nodeCooldowns[node.id] || 0);
    },

    autoNodeReady: function (node) {
      if (!Env.nodeReady(node)) return false;
      var layout = Game.world && Game.world.layout;
      if (!layout || layout.version < 3) return true;
      if (!Game.exploration || !Game.exploration.isRevealed(node.x, node.y)) return false;
      var now = Game.state && Game.state.world && Game.state.world.worldTime || 0;
      return node.seenAt !== undefined && now - node.seenAt >= AUTO_GATHER_REVEAL_GRACE;
    },

    update: function (dt) {
      if (!Game.state || !Game.state.world) return;
      var cds = Game.state.world.nodeCooldowns;
      for (var id in cds) {
        if (cds[id] > 0) cds[id] = Math.max(0, cds[id] - dt);
      }
      sinceChest += dt;
      for (var i = chests.length - 1; i >= 0; i--) {
        var chest = chests[i];
        chest.age += dt;
        if (chest.age < chest.ttl) continue;
        chests.splice(i, 1);
        bus.emit('chest:expired', { id: chest.id, rid: Game.state.world.region });
        if (Game.world.hero && Game.world.hero.interactOrder &&
            Game.world.hero.interactOrder.target === chest) {
          Game.world.cancelInteraction('expired');
        }
      }
    },

    restoreOffline: function (seconds) {
      if (!Game.state || !Game.state.world || !(seconds > 0)) return;
      var cds = Game.state.world.nodeCooldowns;
      for (var id in cds) cds[id] = Math.max(0, (cds[id] || 0) - seconds);
    },

    /** 仅真实、合法的战斗位移调用；单帧累积有硬上限。 */
    recordHeroMovement: function (moved, dt) {
      var h = Game.world && Game.world.hero;
      if (!activeScene() || !h || !(moved > 0.01)) return;
      if (h.state === 'dead' || h.state === 'recover' || h.state === 'entrance' ||
          h.state === 'warpOut' || h.state === 'warpIn' || h.state === 'sitting') return;
      // 走近交易点、拾取物、宝箱或采集点是交互指令，不用于刷出下一只宝箱。
      if (h.interactOrder) return;
      if (Game.world.bossEnt) return;
      // 以实际移动距离折算“标准移动秒”，不同地形、寻路绕行与截断位移
      // 都按真正走过的路程计数；后台大 dt 仍受单帧上限保护。
      moveProgress += Math.min(
        Math.max(0, moved) / F.BAL.chestMoveRefSpeed,
        F.BAL.chestMoveFrameCap
      );
      if (chests.length || sinceChest < F.BAL.chestMinGap || moveProgress < moveTarget) return;
      if (Env.spawnChest()) {
        moveProgress = 0;
        sinceChest = 0;
        nextMoveTarget();
      }
    },

    isLegalChestSpot: function (x, y) {
      var layout = Game.world && Game.world.layout;
      if (!layout || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (x < 24 || x > layout.world.w - 24 ||
          y < Game.world.BOUND_TOP + 12 || y > layout.world.h - 20) return false;
      if (U.dist(x, y, layout.camp.x, layout.camp.y) < layout.campSafeRadius + 12) return false;
      if (U.dist(x, y, layout.bossPoint.x, layout.bossPoint.y) < layout.bossSafeRadius + 12) return false;
      if (layout.version >= 3) return Game.terrain.isWalkable(x, y, 10);
      if (Game.terrain.costAt(x, y) > 1.6) return false;
      return Game.terrain.distanceToPath(x, y, layout.corridor.points) >=
        layout.corridor.width / 2 + 12;
    },

    spawnChest: function () {
      if (!activeScene() || chests.length || Game.world.bossEnt) return null;
      var h = Game.world.hero;
      var point = null;
      for (var tries = 0; tries < 100; tries++) {
        var angle = U.rand(0, Math.PI * 2);
        var radius = U.rand(60, 140);
        var x = h.x + Math.cos(angle) * radius;
        var y = h.y + Math.sin(angle) * radius * 0.72;
        if (Env.isLegalChestSpot(x, y)) {
          point = { x: x, y: y };
          break;
        }
      }
      if (!point) {
        var candidates = Game.world.layout.spawnCandidates || [];
        var eligible = candidates.filter(function (p) {
          var d = U.dist(h.x, h.y, p.x, p.y);
          return d >= 60 && d <= 160 && Env.isLegalChestSpot(p.x, p.y);
        });
        if (eligible.length) point = U.choice(eligible);
      }
      if (!point) return null;
      var chest = {
        kind: 'chest',
        id: 'chest:' + (chestSeq++),
        x: point.x, y: point.y,
        rare: U.chance(F.BAL.chestRareChance),
        age: 0, ttl: F.BAL.chestTtl,
        phase: U.rand(0, Math.PI * 2)
      };
      chests.push(chest);
      bus.emit('chest:spawned', {
        id: chest.id, rare: chest.rare, x: chest.x, y: chest.y,
        rid: Game.state.world.region
      });
      if (Game.fx && U.motionEnabled()) {
        Game.fx.ring(chest.x, chest.y, chest.rare ? 24 : 18, chest.rare ? '#d995ff' : '#f0c25e');
      }
      return chest;
    },

    nearestChest: function (x, y) {
      var best = null, dist = Infinity;
      for (var i = 0; i < chests.length; i++) {
        var d = U.dist(x, y, chests[i].x, chests[i].y);
        if (d < dist) { dist = d; best = chests[i]; }
      }
      return best ? { target: best, distance: dist } : null;
    },

    nearestNode: function (x, y, maxDistance) {
      var nodes = Game.world && Game.world.layout && Game.world.layout.nodes || [];
      var best = null, dist = Infinity;
      for (var i = 0; i < nodes.length; i++) {
        // v3 自动互动只能使用玩家已经亲眼发现且充分展示过的节点。
        if (!Env.autoNodeReady(nodes[i])) continue;
        var d = U.dist(x, y, nodes[i].x, nodes[i].y);
        if (d <= maxDistance && d < dist) { dist = d; best = nodes[i]; }
      }
      return best ? { target: best, distance: dist } : null;
    },

    completeGather: function (node) {
      if (!node || !Env.nodeReady(node)) return null;
      var tier = Game.State.regionTier(Game.state.world.region);
      var y = F.gatherYield(tier);
      var count = U.randInt(y.min, y.max);
      var expeditionMult = Game.expedition ? Game.expedition.currentModifier().gather : 1;
      count = Math.max(1, Math.round(count * expeditionMult));
      Game.state.world.nodeCooldowns[node.id] = node.cooldown;
      Game.inv.addMaterial(node.material, count);
      if (y.gold > 0) Game.player.addGold(y.gold);
      var crystal = 0;
      if (y.crystalChance > 0 && U.chance(y.crystalChance)) {
        crystal = 1;
        Game.player.addCrystal(1);
      }
      Game.state.meta.stats.gathers++;
      if (Game.collection && Game.world.layout && Game.world.layout.version >= 3) {
        Game.collection.record('resources', node.defId, {
          rid: Game.state.world.region, entity: node
        });
        var repeatExp = Math.max(1, Math.round(Game.F.expNeed(Game.state.player.level) * 0.018));
        Game.player.addExp(repeatExp);
      }
      var explorationState = Game.exploration && Game.exploration.regionState(Game.state.world.region);
      if (explorationState) {
        explorationState.resourceCounts[node.defId] = (explorationState.resourceCounts[node.defId] || 0) + count;
      }
      var result = {
        id: node.id, material: node.material, count: count,
        gold: y.gold, crystal: crystal, cooldown: node.cooldown
      };
      bus.emit('gather:done', result);
      if (Game.fx) {
        if (U.motionEnabled()) Game.fx.poof(node.x, node.y - 5);
        Game.fx.floatText(
          node.x, node.y - 18,
          '+' + count + ' ' + Game.i18n.t('material.' + node.material),
          { color: node.accent || '#b8ef9a', small: true }
        );
      }
      return result;
    },

    interruptGather: function (order, reason) {
      if (!order || order.type !== 'gather') return;
      bus.emit('gather:interrupted', {
        id: order.target && order.target.id,
        reason: reason || 'combat'
      });
    },

    openChest: function (chest) {
      if (!chest || chests.indexOf(chest) < 0) return null;
      var tier = Game.State.regionTier(Game.state.world.region);
      var reward = F.chestYield(tier, chest.rare);
      Game.player.addGold(reward.gold);
      var gatherDefs = Game.world.layout && Game.world.layout.version >= 3
        ? Game.world.region.exploration.resources
        : Game.world.region.gather && Game.world.region.gather.nodes || [];
      var mat = gatherDefs.length ? U.choice(gatherDefs).material : null;
      var materialCount = U.randInt(reward.materialMin, reward.materialMax);
      if (mat) Game.inv.addMaterial(mat, materialCount);
      var crystal = 0;
      if (reward.crystalChance && U.chance(reward.crystalChance)) {
        crystal = 1;
        Game.player.addCrystal(1);
      }
      var equipment = null;
      if (chest.rare) {
        equipment = Game.inv.genLoot(Game.state.player.level, { rarMin: 2, luck: 1.8 });
        Game.inv.deliverDrops(
          [{ category: 'equipment', item: equipment }],
          {
            source: 'chest',
            forceGround: Game.state.settings.groundLoot !== false,
            x: chest.x,
            y: chest.y
          }
        );
      }
      removeChest(chest);
      Game.state.meta.stats.chests++;
      var result = {
        id: chest.id, rare: chest.rare, gold: reward.gold,
        material: mat, materialCount: materialCount,
        crystal: crystal, equipment: equipment
      };
      bus.emit('chest:opened', result);
      if (Game.fx && U.motionEnabled()) {
        Game.fx.poof(chest.x, chest.y - 4);
        Game.fx.ring(chest.x, chest.y, chest.rare ? 30 : 22, chest.rare ? '#d995ff' : '#ffd36a');
      }
      return result;
    },

    progressSnapshot: function () {
      return {
        seconds: moveProgress,
        distance: moveProgress * F.BAL.chestMoveRefSpeed,
        target: moveTarget,
        sinceChest: sinceChest,
        chestCount: chests.length
      };
    }
  };

  nextMoveTarget();
})();
