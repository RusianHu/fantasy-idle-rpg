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
  var activeMimic = null;
  var MIMIC_CHANCE_PER_10000 = 1500;

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

  function mimicState() {
    var world = Game.state.world;
    var value = world.chestMimic;
    if (!value || typeof value !== 'object') {
      value = world.chestMimic = { rollOrdinal: 0, genuineOpenedSinceMimic: 0 };
    }
    value.rollOrdinal = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(value.rollOrdinal) || 0)));
    value.genuineOpenedSinceMimic = U.clamp(Math.floor(Number(value.genuineOpenedSinceMimic) || 0), 0, 2);
    return value;
  }

  function mimicRollValue(worldSeed, ordinal, rid) {
    return U.strSeed([
      worldSeed >>> 0, ordinal, rid, 'hoard-mimic'
    ].join('|')) % 10000;
  }

  function isMimicRoll(chest) {
    if (!chest || chest.rare || activeMimic) return false;
    var state = mimicState();
    if (state.genuineOpenedSinceMimic < 2) return false;
    return mimicRollValue(
      Game.state.world.worldSeed,
      state.rollOrdinal,
      Game.state.world.region
    ) < MIMIC_CHANCE_PER_10000;
  }

  function draftChestReward(chest) {
    var tier = Game.State.regionTier(Game.state.world.region);
    var reward = F.chestYield(tier, chest.rare);
    var gatherDefs = Game.world.layout && Game.world.layout.version >= 3
      ? Game.world.region.exploration.resources
      : Game.world.region.gather && Game.world.region.gather.nodes || [];
    return {
      id: chest.id, rare: chest.rare, gold: reward.gold,
      material: gatherDefs.length ? U.choice(gatherDefs).material : null,
      materialCount: U.randInt(reward.materialMin, reward.materialMax),
      crystal: reward.crystalChance && U.chance(reward.crystalChance) ? 1 : 0,
      equipment: chest.rare
        ? Game.inv.genLoot(Game.state.player.level, { rarMin: 2, luck: 1.8 })
        : null,
      x: chest.x, y: chest.y
    };
  }

  function grantChestReward(draft, source) {
    Game.player.addGold(draft.gold);
    if (draft.material) Game.inv.addMaterial(draft.material, draft.materialCount);
    if (draft.crystal) Game.player.addCrystal(draft.crystal);
    if (draft.equipment) {
      Game.inv.deliverDrops(
        [{ category: 'equipment', item: draft.equipment }],
        {
          source: source || 'chest',
          forceGround: Game.state.settings.groundLoot !== false,
          x: draft.x, y: draft.y
        }
      );
    }
    Game.state.meta.stats.chests++;
    var result = {
      outcome: 'loot',
      id: draft.id, rare: draft.rare, gold: draft.gold,
      material: draft.material, materialCount: draft.materialCount,
      crystal: draft.crystal, equipment: draft.equipment,
      source: source || 'chest'
    };
    bus.emit('chest:opened', result);
    if (Game.fx && U.motionEnabled()) {
      Game.fx.poof(draft.x, draft.y - 4);
      Game.fx.ring(draft.x, draft.y, draft.rare ? 30 : 22, draft.rare ? '#d995ff' : '#ffd36a');
    }
    return result;
  }

  function variantForTier(tier) {
    if (tier >= 7) return 'royal';
    if (tier >= 4) return 'cursed';
    return 'weathered';
  }

  function closeMimic(reason) {
    if (!activeMimic) return false;
    var mimic = activeMimic;
    activeMimic = null;
    if (Game.world && Game.world.detachActor) Game.world.detachActor(mimic.actorId, reason);
    if (Game.population) Game.population.close(mimic.spawnId, 'escaped', { despawn: true });
    bus.emit('chest:mimicEscaped', {
      chestId: mimic.chestId, actorId: mimic.actorId,
      spawnId: mimic.spawnId, variantId: mimic.variantId,
      encounterId: mimic.encounterId, reason: reason || 'encounter-ended'
    });
    return true;
  }

  function revealMimic(chest, reward) {
    var tier = Game.State.regionTier(Game.state.world.region);
    var variant = variantForTier(tier);
    var profileId = 'spawn.hoard_mimic.' + variant;
    var result = Game.population && Game.population.materialize(profileId, {
      regionId: Game.state.world.region,
      populationId: 'population.' + Game.state.world.region,
      layoutSlotKey: chest.id,
      spawnRequestKey: [
        Game.state.world.region, chest.id, mimicState().rollOrdinal, 'reveal'
      ].join(':'),
      x: chest.x, y: chest.y,
      tier: tier, modifiers: [], rewardMultiplier: 1
    });
    if (!result || !result.ok || !result.primary) {
      return { outcome: 'failed', reason: result && result.reason || 'mimic-materialize-failed' };
    }
    var actor = result.primary;
    actor.chestMimic = true;
    if (!Game.world.attachActor(actor, 'chest-mimic')) {
      Game.population.close(result.lease.spawnId, 'attach-failed', { despawn: true });
      return { outcome: 'failed', reason: 'mimic-attach-failed' };
    }
    activeMimic = {
      chestId: chest.id, actorId: actor.id,
      spawnId: result.lease.spawnId, variantId: 'hoard_mimic.' + variant,
      encounterId: null, reward: reward
    };
    var encounter = Game.world.startEncounter(actor);
    if (!encounter) {
      closeMimic('encounter-start-failed');
      return { outcome: 'failed', reason: 'mimic-encounter-failed' };
    }
    activeMimic.encounterId = encounter.id;
    removeChest(chest);
    bus.emit('chest:mimicRevealed', {
      chestId: chest.id, actorId: actor.id,
      spawnId: result.lease.spawnId,
      variantId: activeMimic.variantId,
      encounterId: encounter.id, x: chest.x, y: chest.y
    });
    if (Game.fx) {
      if (U.motionEnabled()) Game.fx.poof(chest.x, chest.y - 6);
      Game.fx.ring(chest.x, chest.y, 34, '#c85455');
    }
    return {
      outcome: 'mimic', chestId: chest.id, actorId: actor.id,
      spawnId: result.lease.spawnId, variantId: activeMimic.variantId,
      encounterId: encounter.id
    };
  }

  var Env = Game.environment = {
    chests: function () { return chests; },

    resetRegion: function () {
      if (activeMimic) closeMimic('region-reset');
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
      return true;
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
      if (!activeScene() || activeMimic || !h || !(moved > 0.01)) return;
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
      if (!activeScene() || activeMimic || chests.length || Game.world.bossEnt) return null;
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
      chest.oddity = isMimicRoll(chest);
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

    autoChestReady: function () {
      var hero = Game.world && Game.world.hero;
      if (!hero) return false;
      var vitals = hero.components && hero.components.vitals;
      var ratio = vitals && vitals.maxHp ? vitals.hp / vitals.maxHp :
        (hero.maxHp ? hero.hp / hero.maxHp : 0);
      var strategy = Game.state.settings.expeditionStrategy || 'balanced';
      var threshold = strategy === 'safe' ? .7 : (strategy === 'loot' ? .35 : .5);
      return ratio >= threshold;
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
      if (!chest || chests.indexOf(chest) < 0) {
        return { outcome: 'failed', reason: 'missing-chest' };
      }
      var state = mimicState();
      var previousState = {
        rollOrdinal: state.rollOrdinal,
        genuineOpenedSinceMimic: state.genuineOpenedSinceMimic
      };
      var mimic = !chest.rare && !!chest.oddity && isMimicRoll(chest);
      if (!chest.rare) state.rollOrdinal++;
      var reward = draftChestReward(chest);
      if (mimic) {
        state.genuineOpenedSinceMimic = 0;
        var reveal = revealMimic(chest, reward);
        if (reveal.outcome === 'mimic') return reveal;
        state.rollOrdinal = previousState.rollOrdinal;
        state.genuineOpenedSinceMimic = previousState.genuineOpenedSinceMimic;
      }
      removeChest(chest);
      state.genuineOpenedSinceMimic = Math.min(2, state.genuineOpenedSinceMimic + 1);
      return grantChestReward(reward, mimic ? 'mimic-fallback' : 'chest');
    },

    progressSnapshot: function () {
      return {
        seconds: moveProgress,
        distance: moveProgress * F.BAL.chestMoveRefSpeed,
        target: moveTarget,
        sinceChest: sinceChest,
        chestCount: chests.length
      };
    },

    mimicSnapshot: function () {
      return {
        state: Object.assign({}, mimicState()),
        active: activeMimic ? Object.assign({}, activeMimic, { reward: undefined }) : null
      };
    },

    simulateMimicSequence: function (count, options) {
      options = options || {};
      var worldSeed = Number.isFinite(options.worldSeed)
        ? options.worldSeed >>> 0 : Game.state.world.worldSeed >>> 0;
      var rid = options.regionId || Game.state.world.region;
      var ordinal = Math.max(0, Math.floor(Number(options.rollOrdinal) || 0));
      var genuine = U.clamp(Math.floor(Number(options.genuineOpenedSinceMimic) || 0), 0, 2);
      var total = U.clamp(Math.floor(Number(count) || 0), 0, 500);
      var entries = [];
      for (var index = 0; index < total; index++) {
        var rare = Array.isArray(options.rareOrdinals) &&
          options.rareOrdinals.indexOf(index) >= 0;
        var roll = rare ? null : mimicRollValue(worldSeed, ordinal, rid);
        var eligible = !rare && genuine >= 2;
        var mimic = eligible && roll < MIMIC_CHANCE_PER_10000;
        entries.push({
          index: index, rare: rare, rollOrdinal: rare ? null : ordinal,
          roll: roll, eligible: eligible, mimic: mimic,
          genuineBefore: genuine
        });
        if (!rare) ordinal++;
        genuine = mimic ? 0 : Math.min(2, genuine + 1);
      }
      return {
        worldSeed: worldSeed, regionId: rid,
        chance: MIMIC_CHANCE_PER_10000 / 10000,
        protection: 2, entries: entries,
        finalState: {
          rollOrdinal: ordinal,
          genuineOpenedSinceMimic: genuine
        }
      };
    }
  };

  bus.on('actor:defeated', function (event) {
    var actorId = event && event.targetActorIds && event.targetActorIds[0];
    if (!activeMimic || actorId !== activeMimic.actorId) return;
    var mimic = activeMimic;
    activeMimic = null;
    var reward = grantChestReward(mimic.reward, 'mimic');
    bus.emit('chest:mimicDefeated', {
      chestId: mimic.chestId, actorId: mimic.actorId,
      spawnId: mimic.spawnId, variantId: mimic.variantId,
      encounterId: mimic.encounterId, reward: reward
    });
  });

  bus.on('encounter:ended', function (event) {
    if (activeMimic && event && event.encounterId === activeMimic.encounterId) {
      closeMimic(event.payload && event.payload.reason || 'encounter-ended');
    }
  });

  nextMoveTarget();
})();
