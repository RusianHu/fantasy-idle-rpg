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
  var progress = { x: 0, y: 0, still: 0, blocked: {} };

  var STRATEGIES = {
    safe: { hp: 0.58, danger: 1.55, resource: 0.8, route: 1.35 },
    balanced: { hp: 0.36, danger: 1.0, resource: 1.0, route: 1.6 },
    loot: { hp: 0.24, danger: 0.62, resource: 1.45, route: 1.9 }
  };

  function strategy() {
    var id = Game.state && Game.state.settings.expeditionStrategy;
    return STRATEGIES[id] ? id : 'balanced';
  }

  function emitIntent(next) {
    var oldKey = current.id + ':' + (current.target && current.target.id || '');
    var newKey = next.id + ':' + (next.target && next.target.id || '');
    current = next;
    if (oldKey !== newKey) bus.emit('ai:intentChanged', { intent: current, strategy: strategy() });
    return current;
  }

  function blocked(id) {
    var now = Game.state.world.worldTime || 0;
    return id && progress.blocked[id] > now;
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
    hero.moveOrder = {
      x: projected.x, y: projected.y,
      id: prefix + ':' + (target.id || Math.round(projected.x) + ':' + Math.round(projected.y)),
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

  function visibleMissing(kind, list, hero) {
    var rs = Game.exploration.regionState(Game.state.world.region);
    var bucket = rs.discovered[kind] || {};
    return nearest(list, hero, function (e) { return visible(e) && !bucket[e.defId]; });
  }

  function matureNode(hero, fullCircuit) {
    var rs = Game.exploration.regionState(Game.state.world.region);
    return nearest(Game.world.layout.nodes || [], hero, function (n) {
      if (!visible(n) || !rs.discovered.resources[n.defId] || !Game.environment.autoNodeReady(n)) return false;
      if (fullCircuit) return true;
      var direct = U.dist(hero.x, hero.y, n.x, n.y);
      var frontier = Game.exploration.nextObjective(Game.state.world.region, hero.x, hero.y);
      var route = frontier ? U.dist(hero.x, hero.y, frontier.x, frontier.y) : direct;
      return direct <= route * 0.15 + 90;
    });
  }

  function guardianTarget(hero) {
    var layout = Game.world.layout, state = Game.exploration.regionState(Game.state.world.region);
    if (state.discovered.guardian || !visible(layout.guardian)) return null;
    var entity = null;
    for (var i = 0; i < Game.world.entities.length; i++) {
      if (Game.world.entities[i].guardian && !Game.world.entities[i].dead) entity = Game.world.entities[i];
    }
    return entity ? { target: entity, distance: U.dist(hero.x, hero.y, entity.x, entity.y) } : null;
  }

  function bossObjective(hero) {
    var ready = Game.exploration.readiness(Game.state.world.region);
    var retryAt = Game.exploration.regionState(Game.state.world.region).bossRetryAt || 0;
    if (!ready.lair || ready.total < 70 || (Game.state.world.worldTime || 0) < retryAt) return null;
    var lair = Game.world.layout.bossLair;
    return { target: lair, distance: U.dist(hero.x, hero.y, lair.x, lair.y), ready: ready };
  }

  function replan(hero, reason) {
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

    var loot = expiringLoot(hero);
    if (loot) {
      Game.world.startInteraction({ type: 'loot', target: loot.target }, false);
      return emitIntent({ id: 'loot', target: loot.target, distance: loot.distance, danger: Game.terrain.dangerAt(loot.target.x, loot.target.y), reason: 'expiring' });
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
    var node = matureNode(hero, !!prog.firstKill);
    if (node) {
      Game.world.startInteraction({ type: 'gather', target: node.target }, false);
      return emitIntent({ id: 'gather', target: node.target, distance: node.distance, danger: Game.terrain.dangerAt(node.target.x, node.target.y), reason: null });
    }

    var guardian = guardianTarget(hero);
    if (guardian) {
      hero.target = guardian.target;
      return emitIntent({ id: 'guardian', target: guardian.target, distance: guardian.distance, danger: 0.9, reason: null });
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
        Game.world.startInteraction({ type: 'gather', target: node.target }, false);
        return emitIntent({ id: 'circuit', target: node.target, distance: node.distance, danger: Game.terrain.dangerAt(node.target.x, node.target.y), reason: null });
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
      if (Game.world && Game.world.hero) replan(Game.world.hero, 'strategy');
      return id;
    },

    strategy: strategy,
    intent: function () { return current; },
    replan: function (reason) {
      return Game.world && Game.world.hero ? replan(Game.world.hero, reason) : current;
    },

    update: function (hero, dt) {
      if (!hero || !Game.world.layout || Game.world.layout.version < 3) return false;
      if (Game.world.controlMode() !== 'auto' || Game.state.world.mode !== 'battle') return false;
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

      var moved = U.dist(hero.x, hero.y, progress.x, progress.y);
      var expectsMove = (hero.moveOrder && hero.moveOrder.ai) ||
        current.id === 'frontier' || current.id === 'discovery' || current.id === 'boss';
      if (expectsMove && moved < 0.6) progress.still += dt;
      else progress.still = 0;
      progress.x = hero.x; progress.y = hero.y;

      if (progress.still >= 6) {
        var tid = current.target && current.target.id;
        if (tid) progress.blocked[tid] = (Game.state.world.worldTime || 0) + 30;
        hero.moveOrder = null;
        var camp = Game.terrain.projectPoint(Game.world.layout.camp.x, Game.world.layout.camp.y, 2);
        if (camp) setMove(hero, camp, 'ai-stuck-camp');
        progress.still = 0;
        thinkT = 0;
        replan(hero, 'stuck-fallback');
        return true;
      }
      if (progress.still >= 2) {
        if (hero.moveOrder) {
          var projected = Game.terrain.projectPoint(hero.moveOrder.x, hero.moveOrder.y, 3);
          if (projected) { hero.moveOrder.x = projected.x; hero.moveOrder.y = projected.y; }
        }
        if (Game.nav) Game.nav.clear(hero);
        thinkT = 0;
      } else if (progress.still >= 0.75) {
        if (Game.nav) Game.nav.clear(hero);
        thinkT = Math.min(thinkT, 0);
      }

      if (survival(hero)) return true;
      if (thinkT <= 0 && !hero.target && !hero.interactOrder &&
          (!hero.moveOrder || hero.moveOrder.ai)) {
        thinkT = 0.35;
        replan(hero, null);
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
      progress = { x: 0, y: 0, still: 0, blocked: {} };
    }
  };
})();
