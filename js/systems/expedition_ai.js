/* ============================================================
 * systems/expedition_ai.js — 基于已知情报的自动远征决策器
 * 与 automation.js（技能/装备养成）严格分离。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;
  var thinkT = 0;
  var current = { id: 'idle', target: null, distance: 0, danger: 0, reason: null };
  var WATCHDOG_POLICY = {
    sampleWindow: 0.25,
    minProgress: 0.5,
    routeResetAfter: 0.75,
    cacheRecoveryAfter: 2,
    cancelAfter: 6
  };
  var progress = { watchdog: createMovementWatchdog(), blocked: {} };
  var trace = [];
  var TRACE_LIMIT = 80;

  function createMovementWatchdog() {
    var state = {
      x: null, y: null, sampleAge: 0,
      still: 0, recoveryTier: 0, lastProgress: 0
    };

    function reset(x, y) {
      state.x = Number.isFinite(x) ? x : null;
      state.y = Number.isFinite(y) ? y : null;
      state.sampleAge = 0;
      state.still = 0;
      state.recoveryTier = 0;
      state.lastProgress = 0;
    }

    return {
      reset: reset,
      update: function (x, y, dt, expected) {
        dt = Math.max(0, Number.isFinite(dt) ? dt : 0);
        if (!expected || !Number.isFinite(x) || !Number.isFinite(y)) {
          reset(x, y);
          return { action: null, sampled: false, progress: 0, still: 0, recoveryTier: 0 };
        }
        if (state.x === null || state.y === null) {
          reset(x, y);
          return { action: null, sampled: false, progress: 0, still: 0, recoveryTier: 0 };
        }

        state.sampleAge += dt;
        if (state.sampleAge + 1e-9 < WATCHDOG_POLICY.sampleWindow) {
          return {
            action: null, sampled: false, progress: state.lastProgress,
            still: state.still, recoveryTier: state.recoveryTier
          };
        }

        var elapsed = state.sampleAge;
        var moved = U.dist(x, y, state.x, state.y);
        state.x = x;
        state.y = y;
        state.sampleAge = 0;
        state.lastProgress = moved;
        if (moved >= WATCHDOG_POLICY.minProgress) {
          state.still = 0;
          state.recoveryTier = 0;
          return {
            action: null, sampled: true, progress: moved,
            elapsed: elapsed, still: 0, recoveryTier: 0
          };
        }

        state.still += elapsed;
        var nextTier = state.still + 1e-9 >= WATCHDOG_POLICY.cancelAfter ? 3 :
          (state.still + 1e-9 >= WATCHDOG_POLICY.cacheRecoveryAfter ? 2 :
            (state.still + 1e-9 >= WATCHDOG_POLICY.routeResetAfter ? 1 : 0));
        var action = null;
        if (nextTier > state.recoveryTier) {
          state.recoveryTier = nextTier;
          action = nextTier === 3 ? 'cancel' :
            (nextTier === 2 ? 'cache-recovery' : 'route-reset');
        }
        return {
          action: action, sampled: true, progress: moved, elapsed: elapsed,
          still: state.still, recoveryTier: state.recoveryTier
        };
      },
      snapshot: function () {
        return {
          sampleAge: state.sampleAge,
          still: state.still,
          recoveryTier: state.recoveryTier,
          lastProgress: state.lastProgress
        };
      }
    };
  }

  var STRATEGIES = {
    safe: { hp: 0.58, danger: 1.55, resource: 0.8, route: 1.35, engage: 42 },
    balanced: { hp: 0.36, danger: 1.0, resource: 1.0, route: 1.6, engage: 72 },
    loot: { hp: 0.24, danger: 0.62, resource: 1.45, route: 1.9, engage: 96 }
  };

  function strategy() {
    var id = Game.state && Game.state.settings.expeditionStrategy;
    return STRATEGIES[id] ? id : 'balanced';
  }

  function showIntentBubble(next) {
    var bubbles = Game.actionBubbles;
    var hero = Game.world && Game.world.hero;
    if (!bubbles || !hero || !Game.state ||
        Game.world.controlMode() !== 'auto' || Game.state.world.mode !== 'battle') return;
    var target = next.target;
    var targetId = target && (target.id || target.threatId || target.mid) || next.id;

    if (next.id === 'combat' || next.id === 'guardian') {
      bubbles.show(hero, 'enemy', {
        targetId: targetId,
        dedupeKey: 'enemy:' + targetId
      });
      if (target && target.components && target.components.transform && target.kind !== 'hero') {
        bubbles.show(target, 'alert', {
          targetId: targetId,
          dedupeKey: 'alert:' + targetId
        });
      }
    } else if (next.id === 'gather' || next.id === 'circuit' ||
        (next.id === 'discovery' && target && target.kind === 'gatherNode')) {
      bubbles.show(hero, 'resource', {
        targetId: targetId,
        dedupeKey: 'resource:' + targetId
      });
    } else if (next.id === 'chest') {
      bubbles.show(hero, 'chest', {
        targetId: targetId,
        dedupeKey: 'chest:' + targetId
      });
    } else if (next.id === 'loot') {
      bubbles.show(hero, 'loot', {
        targetId: targetId,
        dedupeKey: 'loot:' + targetId
      });
    }
  }

  function emitIntent(next) {
    function targetKey(target) {
      return target && (target.id || target.threatId || target.mid) || '';
    }
    var oldKey = current.id + ':' + targetKey(current.target);
    var newKey = next.id + ':' + targetKey(next.target);
    if (oldKey !== newKey) {
      trace.push({
        at: Game.state && Game.state.world ? +(Game.state.world.worldTime || 0).toFixed(2) : 0,
        from: current.id,
        to: next.id,
        target: targetKey(next.target) || null,
        reason: next.reason || null
      });
      if (trace.length > TRACE_LIMIT) trace.splice(0, trace.length - TRACE_LIMIT);
    }
    current = next;
    if (oldKey !== newKey) {
      bus.emit('ai:intentChanged', { intent: current, strategy: strategy() });
      showIntentBubble(current);
    }
    return current;
  }

  function blocked(id) {
    var now = Game.state && Game.state.world ? Game.state.world.worldTime || 0 : 0;
    if (!id || !progress.blocked[id]) return false;
    if (progress.blocked[id] <= now) {
      delete progress.blocked[id];
      return false;
    }
    return true;
  }

  function visible(ent) {
    return ent && Game.exploration.isRevealed(ent.x, ent.y);
  }

  function nearest(list, hero, predicate) {
    var best = null, bestCost = Infinity;
    var st = STRATEGIES[strategy()];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if ((predicate && !predicate(e)) || blocked(e.id)) continue;
      var distance = U.dist(hero.x, hero.y, e.x, e.y);
      var danger = Game.terrain.dangerAt(e.x, e.y);
      var cost = distance * (1 + danger * st.danger);
      if (cost < bestCost) { bestCost = cost; best = e; }
    }
    return best ? { target: best, distance: U.dist(hero.x, hero.y, best.x, best.y), cost: bestCost } : null;
  }

  function setMove(hero, target, prefix) {
    if (!target) return false;
    var projected = Game.terrain.projectPoint(target.x, target.y, 2);
    if (!projected) return false;
    var orderId = prefix + ':' + (target.id || Math.round(projected.x) + ':' + Math.round(projected.y));
    if (hero.moveOrder && hero.moveOrder.ai && hero.moveOrder.id === orderId &&
        U.dist(hero.moveOrder.x, hero.moveOrder.y, projected.x, projected.y) < 4) {
      hero.moveOrder.targetRef = target;
      return true;
    }
    hero.moveOrder = {
      x: projected.x, y: projected.y,
      id: orderId,
      ai: true, targetRef: target
    };
    hero.target = null;
    hero.manualTarget = false;
    if (Game.nav) Game.nav.clear(hero);
    return true;
  }

  function hasPotion() {
    var p = Game.state.inv.potions || {};
    return (p.potion_small || 0) + (p.potion_large || 0) > 0;
  }

  function survival(hero) {
    var threshold = STRATEGIES[strategy()].hp;
    if (Game.player.hpPct() >= threshold || hasPotion() || Game.world.bossEnt) return false;
    if (Game.state.world.mode !== 'rest') Game.world.setMode('rest', { auto: true, survival: true });
    emitIntent({ id: 'survival', target: Game.world.layout.camp, distance: U.dist(hero.x, hero.y, Game.world.layout.camp.x, Game.world.layout.camp.y), danger: 0, reason: 'low-hp' });
    return true;
  }

  function expiringLoot(hero) {
    var drops = Game.world.groundLoot || [];
    var urgent = drops.filter(function (d) { return d.ttl - d.age < 18; });
    return nearest(urgent, hero);
  }

  function interactionIntent(order, reason) {
    var target = order && order.target;
    var id = order && order.type === 'chest'
      ? (order.phase === 'act' ? 'chest' : 'chest-approach') :
      (order && order.type === 'gather' ? 'gather' : 'loot');
    return {
      id: id,
      target: target || null,
      distance: target ? U.dist(Game.world.hero.x, Game.world.hero.y, target.x, target.y) : 0,
      danger: target ? Game.terrain.dangerAt(target.x, target.y) : 0,
      reason: reason || (order && order.explicit ? 'player' : 'ambient')
    };
  }

  function nearbyThreat(hero) {
    var radius = STRATEGIES[strategy()].engage;
    return nearest(Game.world.entities || [], hero, function (e) {
      if (!Game.world.isHostileActor(hero, e) || e.boss) return false;
      if (!visible(e)) return false;
      return U.dist(hero.x, hero.y, e.x, e.y) <= radius;
    });
  }

  function nearbyMatureNode(hero) {
    if (!Game.environment) return null;
    return nearest(Game.world.layout.nodes || [], hero, function (node) {
      return U.dist(hero.x, hero.y, node.x, node.y) <= 120 &&
        Game.environment.autoNodeReady(node) &&
        (!Game.guardSites || Game.guardSites.autoEligible(node));
    });
  }

  // 永久宝藏（巢穴固定箱）的机会性近场绕行：仅当已揭雾、未领取、未被临时
  // 屏蔽且守卫状态允许自动挑战时，才在 120px 内短程绕行，与沿途成熟资源一致。
  // 远程宝藏不在此处抢占航段，仍由下方安全/均衡/掠夺策略在航段结束后排序。
  function nearbyMatureTreasure(hero) {
    if (!Game.worldTreasures) return null;
    return nearest(Game.worldTreasures.list(), hero, function (treasure) {
      return visible(treasure) &&
        U.dist(hero.x, hero.y, treasure.x, treasure.y) <= 120 &&
        (!Game.guardSites || Game.guardSites.autoEligible(treasure));
    });
  }

  function preservedTravel(hero) {
    var order = hero.moveOrder;
    if (!order || !order.ai) return null;
    var target = order.targetRef || order;
    if (target.id && blocked(target.id)) return null;
    var id = current.id;
    if (!id || id === 'idle') {
      id = order.id.indexOf('ai-frontier:') === 0 ? 'frontier' :
        (order.id.indexOf('ai-discovery:') === 0 ? 'discovery' :
          (order.id.indexOf('ai-boss:') === 0 ? 'boss' : 'camp'));
    }
    return {
      id: id,
      target: target,
      distance: U.dist(hero.x, hero.y, order.x, order.y),
      danger: Game.terrain.dangerAt(order.x, order.y),
      reason: current.reason || 'travel'
    };
  }

  function guardResumeTarget(hero) {
    if (!Game.guardSites || !Game.guardSites.peekResumeTargetId) return null;
    var id = Game.guardSites.peekResumeTargetId();
    if (!id) return null;
    var target = (Game.world.layout.nodes || []).filter(function (node) { return node.id === id; })[0];
    var type = 'gather';
    if (!target && Game.worldTreasures) { target = Game.worldTreasures.get(id); type = 'chest'; }
    var valid = target && Game.guardSites.canInteract(target) &&
      (type !== 'gather' || !Game.environment || Game.environment.autoNodeReady(target)) &&
      (type !== 'chest' || !target.claimed);
    if (!valid) { Game.guardSites.consumeResumeTargetId(); return null; }
    return { target: target, type: type, distance: U.dist(hero.x, hero.y, target.x, target.y) };
  }

  function movementExpectation(hero, intentId) {
    var aiMoveOrder = !!(hero && hero.moveOrder && hero.moveOrder.ai);
    var routeIntent = intentId === 'frontier' || intentId === 'discovery' ||
      intentId === 'boss';
    var interactionApproach = !!(hero && hero.interactOrder &&
      hero.interactOrder.phase !== 'act');
    var inCombat = !!(hero && hero.target && !hero.target.dead);
    return {
      expected: !inCombat && (interactionApproach || aiMoveOrder || routeIntent),
      source: inCombat ? 'combat' : (interactionApproach ? 'interaction-approach' :
        (aiMoveOrder ? 'move-order' : (routeIntent ? 'route-intent' : 'none'))),
      interactionApproach: interactionApproach
    };
  }

  function visibleMissing(kind, list, hero) {
    var rs = Game.exploration.regionState(Game.state.world.region);
    var bucket = rs.discovered[kind] || {};
    return nearest(list, hero, function (e) { return visible(e) && !bucket[e.defId]; });
  }

  function matureNode(hero, fullCircuit) {
    var rs = Game.exploration.regionState(Game.state.world.region);
    return nearest(Game.world.layout.nodes || [], hero, function (n) {
      if (!visible(n) || !rs.discovered.resources[n.defId] || !Game.environment.autoNodeReady(n) ||
          (Game.guardSites && !Game.guardSites.autoEligible(n))) return false;
      if (fullCircuit) return true;
      var direct = U.dist(hero.x, hero.y, n.x, n.y);
      var frontier = Game.exploration.nextObjective(Game.state.world.region, hero.x, hero.y);
      var route = frontier ? U.dist(hero.x, hero.y, frontier.x, frontier.y) : direct;
      return direct <= route * 0.15 + 90;
    });
  }

  function guardianTarget(hero) {
    var layout = Game.world.layout, state = Game.exploration.regionState(Game.state.world.region);
    var gateSite = null;
    if (layout.version >= 4 && Game.guardSites) {
      gateSite = Game.guardSites.snapshot().filter(function (site) {
        return site.targetKind === 'bossGate' && !site.cleared;
      })[0];
      if (!gateSite) return null;
      if (!Game.guardSites.autoEligible(gateSite)) return { target: gateSite,
        distance: U.dist(hero.x, hero.y, gateSite.x, gateSite.y), blockedHealth: true };
    } else if (state.discovered.guardian) return null;
    if (!visible(layout.guardian)) return null;
    var entity = null;
    for (var i = 0; i < Game.world.entities.length; i++) {
      if (Game.world.entities[i].guardian && !Game.world.entities[i].dead &&
          (!gateSite || Game.world.entities[i].guardSiteId === gateSite.id)) entity = Game.world.entities[i];
    }
    return entity ? { target: entity, distance: U.dist(hero.x, hero.y, entity.x, entity.y) } : null;
  }

  function nestTreasureTarget(hero) {
    if (!Game.worldTreasures) return null;
    return nearest(Game.worldTreasures.list(), hero, function (treasure) {
      return visible(treasure) && (!Game.guardSites || Game.guardSites.autoEligible(treasure));
    });
  }

  function hasHealthBlockedGuardTarget() {
    if (!Game.guardSites) return false;
    var snapshots = Game.guardSites.snapshot();
    for (var i = 0; i < snapshots.length; i++) {
      var site = snapshots[i];
      if (site.cleared || !site.revealed || !Game.exploration.isRevealed(site.x, site.y)) continue;
      if (!Game.guardSites.autoEligible(site)) return true;
    }
    return false;
  }

  function bossObjective(hero) {
    var ready = Game.exploration.readiness(Game.state.world.region);
    var retryAt = Game.exploration.regionState(Game.state.world.region).bossRetryAt || 0;
    if (!ready.lair || ready.total < 70 || (Game.state.world.worldTime || 0) < retryAt ||
        (Game.world.layout.version >= 4 && Game.guardSites && !Game.guardSites.isBossGateCleared())) return null;
    var lair = Game.world.layout.bossLair;
    return { target: lair, distance: U.dist(hero.x, hero.y, lair.x, lair.y), ready: ready };
  }

  function replan(hero, reason, force) {
    var layout = Game.world.layout;
    if (!layout || layout.version < 3 || Game.world.controlMode() !== 'auto') {
      return emitIntent({ id: 'idle', target: null, distance: 0, danger: 0, reason: reason || null });
    }
    if (survival(hero)) return current;
    if (hero.target && !hero.target.dead) {
      return emitIntent({ id: 'combat', target: hero.target, distance: U.dist(hero.x, hero.y, hero.target.x, hero.target.y), danger: 1, reason: reason || null });
    }
    // 玩家点选指令由 world 保留；AI 只在其完成后恢复。
    if (hero.moveOrder && !hero.moveOrder.ai) {
      return emitIntent({ id: 'player-order', target: hero.moveOrder, distance: U.dist(hero.x, hero.y, hero.moveOrder.x, hero.moveOrder.y), danger: Game.terrain.dangerAt(hero.moveOrder.x, hero.moveOrder.y), reason: null });
    }
    if (hero.interactOrder && hero.interactOrder.explicit) {
      return emitIntent({ id: 'player-order', target: hero.interactOrder.target, distance: 0, danger: 0, reason: null });
    }
    if (hero.interactOrder) return emitIntent(interactionIntent(hero.interactOrder));

    var guardResume = guardResumeTarget(hero);
    if (guardResume) {
      if (Game.world.startInteraction({ type: guardResume.type, target: guardResume.target }, false)) {
        Game.guardSites.consumeResumeTargetId();
        return emitIntent(interactionIntent(hero.interactOrder, 'guard-resume'));
      }
      if (hero.target && !hero.target.dead) return emitIntent({ id: 'combat', target: hero.target,
        distance: U.dist(hero.x, hero.y, hero.target.x, hero.target.y), danger: 1, reason: 'guard-trigger' });
    }

    var loot = expiringLoot(hero);
    if (loot) {
      if (Game.world.startInteraction({ type: 'loot', target: loot.target }, false)) {
        return emitIntent({ id: 'loot', target: loot.target, distance: loot.distance, danger: Game.terrain.dangerAt(loot.target.x, loot.target.y), reason: 'expiring' });
      }
    }

    var threat = nearbyThreat(hero);
    if (threat) {
      hero.target = threat.target;
      hero.moveOrder = null;
      if (Game.nav) Game.nav.clear(hero);
      return emitIntent({
        id: 'combat', target: threat.target, distance: threat.distance,
        danger: Game.terrain.dangerAt(threat.target.x, threat.target.y),
        reason: 'route-encounter'
      });
    }

    var closeTreasure = nearbyMatureTreasure(hero);
    if (closeTreasure) {
      if (Game.world.startInteraction({ type: 'chest', target: closeTreasure.target }, false)) {
        return emitIntent(interactionIntent(hero.interactOrder, 'along-route-treasure'));
      }
      if (hero.target && !hero.target.dead) return emitIntent({ id: 'combat', target: hero.target,
        distance: U.dist(hero.x, hero.y, hero.target.x, hero.target.y), danger: 1, reason: 'guard-trigger' });
    }

    var closeNode = nearbyMatureNode(hero);
    if (closeNode && Game.world.startInteraction({ type: 'gather', target: closeNode.target }, false)) {
      return emitIntent({
        id: 'gather', target: closeNode.target, distance: closeNode.distance,
        danger: Game.terrain.dangerAt(closeNode.target.x, closeNode.target.y),
        reason: 'along-route'
      });
    }

    // 已开始的航段保持到抵达；沿途紧急掉落、接敌和近场宝藏/新资源仍可在
    // 上方抢占，避免已进入视野的前沿每 0.35 秒跳到别处。远程永久宝藏只能
    // 在没有待保留航段时（即下方 preservedTravel 返回空之后）参与策略排序。
    var travel = !force && preservedTravel(hero);
    if (travel) {
      return emitIntent(travel);
    }

    // 未知前沿优先；只能读取迷雾边界，不读取未发现奖励坐标。
    // 达到典型首杀覆盖区间后停止无止境扫边角，继续处理已知内容并讨伐。
    var boss = bossObjective(hero);
    var frontier = boss && boss.ready.coverage >= 0.60
      ? null
      : Game.exploration.nextObjective(Game.state.world.region, hero.x, hero.y, blocked);
    if (frontier) {
      setMove(hero, frontier, 'ai-frontier');
      return emitIntent({ id: 'frontier', target: frontier, distance: U.dist(hero.x, hero.y, frontier.x, frontier.y), danger: Game.terrain.dangerAt(frontier.x, frontier.y), reason: reason || null });
    }

    var missing = visibleMissing('landmarks', layout.landmarks, hero) ||
      visibleMissing('resources', layout.nodes, hero) ||
      visibleMissing('curios', layout.curios, hero) ||
      visibleMissing('ecology', layout.ecology, hero);
    if (missing) {
      setMove(hero, missing.target, 'ai-discovery');
      return emitIntent({ id: 'discovery', target: missing.target, distance: missing.distance, danger: Game.terrain.dangerAt(missing.target.x, missing.target.y), reason: null });
    }

    var prog = Game.State.regionProg(Game.state.world.region);
    var nestTreasure = strategy() === 'loot' ? nestTreasureTarget(hero) : null;
    if (nestTreasure) {
      if (Game.world.startInteraction({ type: 'chest', target: nestTreasure.target }, false)) {
        return emitIntent(interactionIntent(hero.interactOrder, 'nest-priority'));
      }
      if (hero.target && !hero.target.dead) return emitIntent({ id: 'combat', target: hero.target,
        distance: U.dist(hero.x, hero.y, hero.target.x, hero.target.y), danger: 1, reason: 'guard-trigger' });
    }
    var node = matureNode(hero, !!prog.firstKill);
    if (node) {
      if (Game.world.startInteraction({ type: 'gather', target: node.target }, false)) {
        return emitIntent({ id: 'gather', target: node.target, distance: node.distance, danger: Game.terrain.dangerAt(node.target.x, node.target.y), reason: null });
      }
      if (hero.target && !hero.target.dead) return emitIntent({ id: 'combat', target: hero.target,
        distance: U.dist(hero.x, hero.y, hero.target.x, hero.target.y), danger: 1, reason: 'guard-trigger' });
    }

    nestTreasure = nestTreasureTarget(hero);
    if (nestTreasure) {
      if (Game.world.startInteraction({ type: 'chest', target: nestTreasure.target }, false)) {
        return emitIntent(interactionIntent(hero.interactOrder, 'nest'));
      }
      if (hero.target && !hero.target.dead) return emitIntent({ id: 'combat', target: hero.target,
        distance: U.dist(hero.x, hero.y, hero.target.x, hero.target.y), danger: 1, reason: 'guard-trigger' });
    }

    var guardian = guardianTarget(hero);
    if (guardian) {
      if (guardian.blockedHealth) {
        setMove(hero, layout.camp, 'ai-camp-guard-health');
        return emitIntent({ id: 'camp', target: layout.camp,
          distance: U.dist(hero.x, hero.y, layout.camp.x, layout.camp.y), danger: 0,
          reason: 'guard-health' });
      }
      hero.target = guardian.target;
      return emitIntent({ id: 'guardian', target: guardian.target, distance: guardian.distance, danger: 0.9, reason: null });
    }

    if (hasHealthBlockedGuardTarget()) {
      setMove(hero, layout.camp, 'ai-camp-guard-health');
      return emitIntent({ id: 'camp', target: layout.camp,
        distance: U.dist(hero.x, hero.y, layout.camp.x, layout.camp.y), danger: 0,
        reason: 'guard-health' });
    }

    if (boss) {
      if (boss.distance <= 74 && Game.player.hpPct() >= 0.8) {
        Game.world.trySpawnBoss();
      } else {
        setMove(hero, boss.target, 'ai-boss');
      }
      return emitIntent({ id: 'boss', target: boss.target, distance: boss.distance, danger: 1, reason: null });
    }

    // 已清区域保持完整采集巡回；其它情况回到最近已知前沿或营地。
    if (prog.firstKill) {
      node = matureNode(hero, true);
      if (node) {
        if (Game.world.startInteraction({ type: 'gather', target: node.target }, false)) {
          return emitIntent({ id: 'circuit', target: node.target, distance: node.distance, danger: Game.terrain.dangerAt(node.target.x, node.target.y), reason: null });
        }
      }
    }
    setMove(hero, layout.camp, 'ai-camp');
    return emitIntent({ id: 'camp', target: layout.camp, distance: U.dist(hero.x, hero.y, layout.camp.x, layout.camp.y), danger: 0, reason: 'no-known-target' });
  }

  var AI = Game.expeditionAI = {
    strategies: STRATEGIES,

    setStrategy: function (id) {
      if (!STRATEGIES[id]) return false;
      Game.state.settings.expeditionStrategy = id;
      thinkT = 0;
      bus.emit('settings:changed', { key: 'expeditionStrategy', value: id });
      bus.emit('ai:strategyChanged', { strategy: id });
      if (Game.world && Game.world.hero) replan(Game.world.hero, 'strategy', true);
      return id;
    },

    strategy: strategy,
    intent: function () { return current; },
    trace: function () { return trace.slice(); },
    isTargetBlocked: blocked,
    watchdogPolicy: WATCHDOG_POLICY,
    createMovementWatchdog: createMovementWatchdog,
    movementExpectation: function (hero, intentId) {
      return movementExpectation(hero, intentId === undefined ? current.id : intentId);
    },
    diagnostics: function () {
      var hero = Game.world && Game.world.hero;
      var expectation = movementExpectation(hero, current.id);
      var watchdog = progress.watchdog.snapshot();
      return {
        intent: current.id,
        target: current.target && (current.target.id || current.target.threatId ||
          current.target.mid) || null,
        thinkIn: thinkT,
        still: watchdog.still,
        recoveryTier: watchdog.recoveryTier,
        watchdogSampleAge: watchdog.sampleAge,
        watchdogProgress: watchdog.lastProgress,
        movementExpected: expectation.expected,
        movementSource: expectation.source,
        interactionApproach: expectation.interactionApproach,
        blocked: Object.assign({}, progress.blocked)
      };
    },
    pause: function (reason) {
      var hero = Game.world && Game.world.hero;
      thinkT = 0;
      progress.watchdog.reset(hero && hero.x, hero && hero.y);
      return emitIntent({
        id: 'interaction', target: null, distance: 0, danger: 0,
        reason: reason || 'interaction-pause'
      });
    },
    replan: function (reason) {
      return Game.world && Game.world.hero ? replan(Game.world.hero, reason, true) : current;
    },

    update: function (hero, dt) {
      if (!hero || !Game.world.layout || Game.world.layout.version < 3) return false;
      if (Game.world.controlMode() !== 'auto' || Game.state.world.mode !== 'battle') return false;
      if (Game.interactions && Game.interactions.isPaused &&
          Game.interactions.isPaused('autoExplore')) {
        AI.pause('deep-interaction');
        return true;
      }
      thinkT -= dt;

      if (!hero.target && Game.world.contactThreat) {
        var contact = Game.world.contactThreat(hero);
        if (contact) {
          hero.target = contact;
          hero.moveOrder = null;
          if (Game.nav) Game.nav.clear(hero);
          emitIntent({ id: 'combat', target: contact, distance: U.dist(hero.x, hero.y, contact.x, contact.y), danger: 1, reason: 'contact' });
        }
      }
      if (hero.interactOrder && !hero.target) {
        if (hero.interactOrder.explicit) {
          emitIntent({
            id: 'player-order',
            target: hero.interactOrder.target,
            distance: hero.interactOrder.target
              ? U.dist(hero.x, hero.y, hero.interactOrder.target.x, hero.interactOrder.target.y)
              : 0,
            danger: 0,
            reason: 'player'
          });
        } else {
          emitIntent(interactionIntent(hero.interactOrder));
        }
      } else if (hero.moveOrder && !hero.moveOrder.ai && !hero.target) {
        emitIntent({
          id: 'player-order',
          target: hero.moveOrder,
          distance: U.dist(hero.x, hero.y, hero.moveOrder.x, hero.moveOrder.y),
          danger: Game.terrain.dangerAt(hero.moveOrder.x, hero.moveOrder.y),
          reason: 'player'
        });
      }

      var moveExpectation = movementExpectation(hero, current.id);
      var watchdog = progress.watchdog.update(
        hero.x, hero.y, dt, moveExpectation.expected
      );

      if (watchdog.action === 'cancel') {
        var interactionTarget = hero.interactOrder && hero.interactOrder.target;
        var tid = interactionTarget && interactionTarget.id ||
          (current.target && current.target.id);
        if (tid) progress.blocked[tid] = (Game.state.world.worldTime || 0) + 30;
        if (Game.nav) Game.nav.recover(hero);
        if (hero.interactOrder) Game.world.cancelInteraction('stuck-fallback');
        hero.moveOrder = null;
        progress.watchdog.reset(hero.x, hero.y);
        thinkT = 0;
        replan(hero, 'stuck-fallback', true);
        return true;
      }
      if (watchdog.action === 'cache-recovery') {
        if (hero.moveOrder) {
          var projected = Game.terrain.projectPoint(hero.moveOrder.x, hero.moveOrder.y, 3);
          if (projected) { hero.moveOrder.x = projected.x; hero.moveOrder.y = projected.y; }
        }
        if (Game.nav) Game.nav.recover(hero);
        thinkT = 0;
      } else if (watchdog.action === 'route-reset') {
        if (Game.nav) Game.nav.clear(hero);
        thinkT = Math.min(thinkT, 0);
      }

      if (survival(hero)) return true;
      if (thinkT <= 0 && !hero.target && !hero.interactOrder &&
          (!hero.moveOrder || hero.moveOrder.ai)) {
        thinkT = 0.35;
        replan(hero, null, false);
      }
      if (current.target && Number.isFinite(current.target.x)) {
        current.distance = U.dist(hero.x, hero.y, current.target.x, current.target.y);
        current.danger = Game.terrain.dangerAt(current.target.x, current.target.y);
      }
      return true;
    },

    reset: function () {
      thinkT = 0;
      current = { id: 'idle', target: null, distance: 0, danger: 0, reason: null };
      progress = { watchdog: createMovementWatchdog(), blocked: {} };
      trace = [];
    }
  };

  bus.on('gather:start', function (payload) {
    var hero = Game.world && Game.world.hero;
    if (!hero || !Game.actionBubbles || Game.world.controlMode() !== 'auto' ||
        Game.state.world.mode !== 'battle' ||
        (hero.interactOrder && hero.interactOrder.explicit)) return;
    var id = payload && payload.id || 'node';
    Game.actionBubbles.show(hero, 'gather', {
      targetId: id,
      dedupeKey: 'gather:' + id
    });
  });

  bus.on('item:pickedUp', function (payload) {
    var hero = Game.world && Game.world.hero;
    if (!hero || !Game.actionBubbles || Game.world.controlMode() !== 'auto' ||
        Game.state.world.mode !== 'battle' ||
        (payload && payload.reason === 'click')) return;
    var id = payload && payload.id || 'loot';
    Game.actionBubbles.show(hero, 'loot', {
      targetId: id,
      dedupeKey: 'loot:' + id
    });
  });
})();
