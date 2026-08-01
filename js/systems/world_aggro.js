/* ============================================================
 * systems/world_aggro.js — MMO 式世界感知、pack 增援与 Evade 回巢
 * 100ms 稳定扫描只负责世界生命周期；战斗内坐标仍由固定 tick 管理。
 * 所有状态均为瞬态，不参与存档。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;
  var SCAN_INTERVAL = 0.1;
  var EVADE_REPATH_AFTER = 2;
  var EVADE_PROJECT_AFTER = 4;
  var EVADE_ARRIVE_RADIUS = 6;
  var EVADE_SPEED = 38;
  var scanAccumulator = 0;
  var evaders = Object.create(null);
  var diagnostics = freshDiagnostics();

  function freshDiagnostics() {
    return {
      scans: 0,
      candidates: 0,
      losRejected: 0,
      leashRejected: 0,
      detected: 0,
      assists: 0,
      evadeStarted: 0,
      evadeCompleted: 0,
      evadeRouteResets: 0,
      evadeProjections: 0,
      lastDetectedActorId: null,
      lastAssistPackId: null
    };
  }

  function clone(value) {
    if (Game.contentCompiler && Game.contentCompiler.clone) {
      return Game.contentCompiler.clone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function readonly(value) {
    var copy = clone(value);
    return Game.contentCompiler && Game.contentCompiler.deepFreeze
      ? Game.contentCompiler.deepFreeze(copy) : copy;
  }

  function policy(actor) {
    var id = actor && actor.blueprint && actor.blueprint.resolvedProfiles &&
      actor.blueprint.resolvedProfiles.engagementPolicyId;
    return id && Game.content ? Game.content.get('engagementPolicy', id) : null;
  }

  function alive(actor) {
    return !!(actor && actor.components && actor.components.vitals &&
      actor.lifecycle === 'active' && !actor.dead && actor.hp > 0);
  }

  function stableActorKey(actor) {
    return [
      actor && actor.spawnId || '',
      actor && actor.memberSlotId || '',
      actor && actor.id || ''
    ].join('|');
  }

  function packKey(actor) {
    return actor && (actor.packAnchorId || actor.spawnId || actor.packId || actor.id);
  }

  function packDefinition(actor) {
    return actor && actor.packId && Game.content
      ? Game.content.get('encounterPack', actor.packId) : null;
  }

  function legalSpawnPoint(actor) {
    if (Game.terrain && Game.terrain.isWalkable &&
        Game.terrain.isWalkable(actor.spawnX, actor.spawnY,
          actor.components && actor.components.body &&
          actor.components.body.collisionRadius || 6)) {
      return { x: actor.spawnX, y: actor.spawnY };
    }
    return Game.terrain && Game.terrain.projectPoint
      ? Game.terrain.projectPoint(actor.spawnX, actor.spawnY, 1)
      : { x: actor.spawnX, y: actor.spawnY };
  }

  function packMembers(actor, groupAlert) {
    var ids = groupAlert === false ? [actor.id] : (actor.packMemberIds || [actor.id]);
    return ids.map(Game.actors.get).filter(function (member) {
      return alive(member) && !member.evading && !member.evadeState &&
        !member.hazardConcealed && !member.hidden && !member.encounterId;
    }).sort(function (a, b) {
      return stableActorKey(a).localeCompare(stableActorKey(b));
    });
  }

  function leashZone(actor, members) {
    if (!actor || !(actor.packLeashRadius > 0) ||
        !Number.isFinite(actor.packAnchorX) || !Number.isFinite(actor.packAnchorY)) return null;
    return {
      packId: packKey(actor),
      x: actor.packAnchorX,
      y: actor.packAnchorY,
      radius: actor.packLeashRadius,
      actorIds: (members || []).map(function (member) { return member.id; }).sort()
    };
  }

  function playerEligible(hero) {
    if (!alive(hero) || !Game.world || !Game.state || !Game.state.world) return false;
    if (!Game.player || !Game.player.hasClass || !Game.player.hasClass()) return false;
    if (Game.state.world.mode !== 'battle') return false;
    if (hero.state === 'dead' || hero.state === 'recover' || hero.state === 'entrance' ||
        hero.state === 'warpOut' || hero.state === 'warpIn' || hero.state === 'ending') return false;
    if (Game.transitions && Game.transitions.isActive && Game.transitions.isActive()) return false;
    if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return false;
    return !Game.world.cinematic;
  }

  function monsterEligible(actor, hero, forAssist) {
    if (!alive(actor) || actor === hero || actor.evading || actor.evadeState ||
        actor.hazardConcealed || actor.hidden || actor.encounterId) return false;
    if (actor.state === 'entrance') return false;
    var p = policy(actor);
    if (!p || !p.autoAggro) return false;
    if (Game.relations.resolve(actor.id, hero.id, null) !== 'hostile') return false;
    if (forAssist) {
      if (actor.boss || actor.rank === 'boss' || actor.rank === 'elite' ||
          actor.category === 'npc' || actor.category === 'summon') return false;
      var lease = actor.spawnId && Game.population && Game.population.lease(actor.spawnId);
      if (!lease || !/^regular:/.test(lease.slotId || '')) return false;
    } else if ((actor.boss || actor.rank === 'boss') &&
        (Game.world.cinematic || actor.state === 'entrance')) {
      return false;
    }
    return true;
  }

  function hasLos(actor, hero, p) {
    return !p.requiresLineOfSight || !Game.terrain || !Game.terrain.hasLineOfSight ||
      Game.terrain.hasLineOfSight(actor, hero, 4);
  }

  function detectionCandidate(actor, hero) {
    if (!monsterEligible(actor, hero, false)) return null;
    var p = policy(actor);
    var distance = U.dist(actor.x, actor.y, hero.x, hero.y);
    var radius = Math.max(Number(p.aggroRadius) || 0, Number(p.contactRadius) || 0);
    if (!(radius > 0) || distance > radius) return null;
    if (!Game.world.isWithinEncounterLeash(hero, actor)) {
      diagnostics.leashRejected++;
      return null;
    }
    if (!hasLos(actor, hero, p)) {
      diagnostics.losRejected++;
      return null;
    }
    return {
      actor: actor,
      distance: distance,
      reason: distance <= (Number(p.contactRadius) || 0) ? 'contact' : 'aggro',
      key: stableActorKey(actor)
    };
  }

  function findDetection(hero) {
    var candidates = [];
    (Game.world.entities || []).forEach(function (actor) {
      var candidate = detectionCandidate(actor, hero);
      if (candidate) candidates.push(candidate);
    });
    diagnostics.candidates += candidates.length;
    candidates.sort(function (a, b) {
      return a.distance - b.distance || a.key.localeCompare(b.key);
    });
    return candidates[0] || null;
  }

  function seedThreat(encounter, actors, hero) {
    actors.forEach(function (actor) {
      encounter.threatTables[actor.id] = encounter.threatTables[actor.id] || {};
      encounter.threatTables[actor.id][hero.id] = Math.max(
        1, Number(encounter.threatTables[actor.id][hero.id]) || 0
      );
    });
  }

  function emitDetection(candidate, encounter) {
    diagnostics.detected++;
    diagnostics.lastDetectedActorId = candidate.actor.id;
    candidate.actor.engaged = true;
    if (Game.actionBubbles) {
      Game.actionBubbles.show(candidate.actor, 'alert', {
        targetId: Game.world.hero.id,
        dedupeKey: 'aggro:' + encounter.id
      });
      Game.actionBubbles.show(Game.world.hero, 'enemy', {
        targetId: candidate.actor.id,
        dedupeKey: 'engaged:' + encounter.id
      });
    }
    bus.emit('aggro:detected', {
      encounterId: encounter.id,
      actorId: candidate.actor.id,
      targetActorId: Game.world.hero.id,
      packId: packKey(candidate.actor),
      reason: candidate.reason,
      distance: candidate.distance,
      messageKey: 'worldAggro.detected'
    });
  }

  function initialDetection(hero) {
    var candidate = findDetection(hero);
    if (!candidate) return null;
    var encounter = Game.world.startEncounter(candidate.actor, {
      reason: candidate.reason,
      initiatorActorId: candidate.actor.id
    });
    if (!encounter) return null;
    emitDetection(candidate, encounter);
    return encounter;
  }

  function assistRepresentative(encounter, hero) {
    var context = encounter.context;
    var engagement = context.engagement || {};
    var limit = Math.max(0, Number(engagement.maxAssistPacks) || 0);
    var joined = context.assistPackIds || (context.assistPackIds = []);
    if (!limit || joined.length >= limit) return null;
    var groups = Object.create(null), candidates = [];
    (Game.world.entities || []).forEach(function (actor) {
      if (!monsterEligible(actor, hero, true)) return;
      var key = packKey(actor);
      if (!key || key === context.initialPackId || joined.indexOf(key) >= 0) return;
      if (!engagement.socialGroupId || actor.socialGroupId !== engagement.socialGroupId) return;
      (groups[key] = groups[key] || []).push(actor);
    });
    Object.keys(groups).sort().forEach(function (key) {
      var members = groups[key].sort(function (a, b) {
        return U.dist(a.x, a.y, hero.x, hero.y) - U.dist(b.x, b.y, hero.x, hero.y) ||
          stableActorKey(a).localeCompare(stableActorKey(b));
      });
      for (var index = 0; index < members.length; index++) {
        var actor = members[index];
        var p = policy(actor);
        var radius = Math.max(0, Number(p.assistRadius) || 0);
        var distance = U.dist(actor.x, actor.y, hero.x, hero.y);
        if (!radius || distance > radius) continue;
        if (!Game.world.isWithinEncounterLeash(hero, actor)) {
          diagnostics.leashRejected++;
          continue;
        }
        if (!hasLos(actor, hero, p)) {
          diagnostics.losRejected++;
          continue;
        }
        candidates.push({ actor: actor, distance: distance, key: key });
        break;
      }
    });
    candidates.sort(function (a, b) {
      return a.distance - b.distance || String(a.key).localeCompare(String(b.key)) ||
        stableActorKey(a.actor).localeCompare(stableActorKey(b.actor));
    });
    return candidates[0] || null;
  }

  function joinAssist(encounter, representative, hero) {
    var context = encounter.context;
    var key = representative.key;
    var pack = packDefinition(representative.actor);
    var members = packMembers(representative.actor, !pack || pack.groupAlert !== false);
    var joined = [];
    members.forEach(function (actor) {
      if (Game.encounters.join(encounter.id, actor.id, 'enemy')) joined.push(actor);
    });
    if (!joined.length) return null;
    context.assistPackIds = context.assistPackIds || [];
    context.assistPackIds.push(key);
    context.assistPackIds.sort();
    context.assistPackActorIds = context.assistPackActorIds || {};
    context.assistPackActorIds[key] = joined.map(function (actor) { return actor.id; }).sort();
    var zone = leashZone(representative.actor, joined);
    if (zone) (context.leashZones = context.leashZones || []).push(zone);
    seedThreat(encounter, joined, hero);
    joined.forEach(function (actor) {
      actor.engaged = true;
      if (Game.actionBubbles) Game.actionBubbles.show(actor, 'alert', {
        targetId: hero.id,
        dedupeKey: 'assist:' + encounter.id + ':' + key
      });
    });
    diagnostics.assists++;
    diagnostics.lastAssistPackId = key;
    bus.emit('encounter:assistJoined', {
      encounterId: encounter.id,
      packId: key,
      actorIds: joined.map(function (actor) { return actor.id; }).sort(),
      assistCount: context.assistPackIds.length,
      maxAssistPacks: context.engagement.maxAssistPacks,
      messageKey: 'worldAggro.assistJoined'
    });
    return joined;
  }

  function checkAssist(encounter, hero) {
    if (!encounter || encounter.lifecycle !== 'active' || !encounter.context.world) return null;
    var representative = assistRepresentative(encounter, hero);
    return representative ? joinAssist(encounter, representative, hero) : null;
  }

  function activeWorldEncounter(hero) {
    var encounter = hero && hero.encounterId && Game.encounters.get(hero.encounterId);
    return encounter && encounter.lifecycle === 'active' && encounter.context.world
      ? encounter : null;
  }

  function scan() {
    diagnostics.scans++;
    var hero = Game.world && Game.world.hero;
    if (!playerEligible(hero)) return null;
    var encounter = activeWorldEncounter(hero);
    if (encounter) return checkAssist(encounter, hero);
    return initialDetection(hero);
  }

  function completeEvade(actor, state, projected) {
    if (!actor || !state) return false;
    if (actor.components && actor.components.vitals) {
      actor.hp = actor.maxHp;
      actor.components.vitals.shields = [];
    }
    if (actor.components && actor.components.actionState) {
      actor.components.actionState.state = 'idle';
      actor.components.actionState.actionId = null;
      actor.components.actionState.abilityId = null;
    }
    if (actor.components && actor.components.movement) {
      actor.components.movement.intent = null;
      actor.components.movement.path = null;
      actor.components.movement.moving = false;
    }
    if (actor.components && actor.components.targeting) {
      actor.components.targeting.currentTargetId = null;
      actor.components.targeting.priorityTargetId = null;
    }
    if (actor.components && actor.components.statuses) actor.components.statuses.length = 0;
    if (Game.nav) Game.nav.clear(actor);
    actor.engaged = false;
    actor.target = null;
    actor.evading = false;
    actor.evadeState = null;
    actor.state = 'wander';
    actor.moving = false;
    delete evaders[actor.id];
    diagnostics.evadeCompleted++;
    bus.emit('encounter:evadeCompleted', {
      encounterId: state.encounterId,
      actorId: actor.id,
      packId: state.packId,
      projected: !!projected,
      routeResets: state.routeResets,
      messageKey: 'worldAggro.evadeCompleted'
    });
    return true;
  }

  function beginEvade(encounter, reason) {
    if (!encounter || encounter.lifecycle !== 'active' || !encounter.context.world) return false;
    var boss = encounter.participants.map(Game.actors.get).some(function (actor) {
      return alive(actor) && actor.teamId === 'enemy' && (actor.boss || actor.rank === 'boss');
    });
    if (boss) {
      Game.encounters.end(encounter.id, reason || 'leash', { winnerTeamId: null });
      if (Game.world && Game.world.onBossFailed) Game.world.onBossFailed(reason || 'leash');
      return true;
    }
    var survivors = encounter.participants.map(Game.actors.get).filter(function (actor) {
      return alive(actor) && actor.teamId === 'enemy' &&
        !(actor.spawnSource && actor.spawnSource.kind === 'summon') &&
        Number.isFinite(actor.spawnX) && Number.isFinite(actor.spawnY);
    });
    // 先写入不可选中状态，再结束 Encounter。encounter:ended 的自动重规划
    // 监听器会同步执行，不能给它一个重新选中刚脱战怪物的瞬间窗口。
    var prepared = survivors.map(function (actor) {
      var point = legalSpawnPoint(actor);
      var state = {
        encounterId: encounter.id,
        packId: packKey(actor),
        targetX: point ? point.x : actor.spawnX,
        targetY: point ? point.y : actor.spawnY,
        elapsed: 0,
        stuckFor: 0,
        routeResetDone: false,
        routeResets: 0,
        lastX: actor.x,
        lastY: actor.y,
        bestDistance: U.dist(actor.x, actor.y, point ? point.x : actor.spawnX,
          point ? point.y : actor.spawnY),
        reason: reason || 'leash'
      };
      evaders[actor.id] = state;
      actor.evading = true;
      actor.evadeState = state;
      actor.engaged = false;
      actor.target = null;
      actor.state = 'evade';
      if (Game.nav) Game.nav.clear(actor);
      return { actor: actor, state: state };
    });
    Game.encounters.end(encounter.id, reason || 'leash', {
      winnerTeamId: null,
      leashActorId: encounter.context.leashActorId,
      evadeActorIds: survivors.map(function (actor) { return actor.id; }).sort()
    });
    prepared.forEach(function (entry) {
      var actor = entry.actor, state = entry.state;
      if (Game.actionBubbles) Game.actionBubbles.show(actor, 'evade', {
        dedupeKey: 'evade:' + encounter.id + ':' + actor.id
      });
      diagnostics.evadeStarted++;
      bus.emit('encounter:evadeStarted', {
        encounterId: encounter.id,
        actorId: actor.id,
        packId: state.packId,
        spawnX: actor.spawnX,
        spawnY: actor.spawnY,
        reason: state.reason,
        messageKey: 'worldAggro.evadeStarted'
      });
    });
    return true;
  }

  function updateEvader(actor, dt) {
    var state = actor && (evaders[actor.id] || actor.evadeState);
    if (!state) return false;
    if (!alive(actor)) {
      delete evaders[actor.id];
      actor.evading = false;
      actor.evadeState = null;
      return true;
    }
    dt = Math.max(0, Math.min(0.25, Number(dt) || 0));
    state.elapsed += dt;
    actor.flash = Math.max(0, actor.flash - dt);
    actor.lungeT = Math.max(0, actor.lungeT - dt);
    actor.animT += dt;
    var distance = U.dist(actor.x, actor.y, state.targetX, state.targetY);
    if (distance <= EVADE_ARRIVE_RADIUS) {
      completeEvade(actor, state, false);
      return true;
    }
    actor.state = 'evade';
    actor.moving = true;
    if (Game.world && Game.world.moveToward) {
      Game.world.moveToward(actor, state.targetX, state.targetY, EVADE_SPEED, dt,
        'evade:' + actor.id + ':' + state.routeResets);
    }
    var remaining = U.dist(actor.x, actor.y, state.targetX, state.targetY);
    if (remaining < state.bestDistance - 0.05) {
      state.bestDistance = remaining;
      state.stuckFor = 0;
      state.routeResetDone = false;
      state.lastX = actor.x;
      state.lastY = actor.y;
    } else {
      // 侧向滑动或局部振荡不算真正进展；以到巢点的最优距离衡量，
      // 才能让 2s/4s 看门狗可靠处理墙角循环。
      state.stuckFor += dt;
    }
    if (state.stuckFor >= EVADE_REPATH_AFTER && !state.routeResetDone) {
      if (Game.nav) Game.nav.clear(actor);
      state.routeResetDone = true;
      state.routeResets++;
      diagnostics.evadeRouteResets++;
    }
    if (state.stuckFor >= EVADE_PROJECT_AFTER) {
      var projected = legalSpawnPoint(actor);
      if (projected) {
        actor.x = projected.x;
        actor.y = projected.y;
      }
      diagnostics.evadeProjections++;
      completeEvade(actor, state, true);
    }
    return true;
  }

  var Aggro = Game.worldAggro = {
    scanInterval: SCAN_INTERVAL,
    policy: policy,
    packKey: packKey,
    detectionCandidate: detectionCandidate,
    findDetection: findDetection,
    scan: scan,
    checkAssist: checkAssist,
    seedThreat: seedThreat,
    beginEvade: beginEvade,
    updateEvader: updateEvader,

    update: function (dt) {
      scanAccumulator += Math.max(0, Math.min(0.25, Number(dt) || 0));
      var result = null;
      while (scanAccumulator + 1e-9 >= SCAN_INTERVAL) {
        scanAccumulator -= SCAN_INTERVAL;
        result = scan() || result;
      }
      return result;
    },

    isEvading: function (actor) {
      return !!(actor && (actor.evading || evaders[actor.id]));
    },

    snapshot: function () {
      return readonly({
        scanAccumulator: scanAccumulator,
        diagnostics: diagnostics,
        evaders: Object.keys(evaders).sort().map(function (actorId) {
          return Object.assign({ actorId: actorId }, evaders[actorId]);
        })
      });
    },

    reset: function () {
      Object.keys(evaders).forEach(function (actorId) {
        var actor = Game.actors && Game.actors.get(actorId);
        if (actor) {
          actor.evading = false;
          actor.evadeState = null;
        }
      });
      evaders = Object.create(null);
      scanAccumulator = 0;
      diagnostics = freshDiagnostics();
    },

    constants: {
      evadeRepathAfter: EVADE_REPATH_AFTER,
      evadeProjectAfter: EVADE_PROJECT_AFTER,
      evadeArriveRadius: EVADE_ARRIVE_RADIUS
    }
  };
})();
