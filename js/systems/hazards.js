/* Deterministic world hazards: placement, awareness, fixed-tick triggers and outcomes. */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;
  var TICK_MS = 50;
  var accumulatorMs = 0;
  var worldTick = 0;
  var regionId = null;
  var layout = null;
  var instances = [];
  var byId = {};
  var previousPositions = {};
  var eventLog = [];
  var MAX_EVENTS = 160;
  var DETECTION_STRATEGY_MULTIPLIERS = {
    safe: 1.6,
    balanced: 1,
    loot: 0.6
  };
  var detectionModifierSources = {};
  var warnedDetectionSources = {};

  function clone(value) {
    return Game.contentCompiler.clone(value);
  }

  function worldTime() {
    return Math.max(0, Number(Game.state && Game.state.world && Game.state.world.worldTime) || 0);
  }

  function savedRegion(rid) {
    Game.state = Game.state || {};
    Game.state.world = Game.state.world || {};
    var root = Game.state.world.hazards || (Game.state.world.hazards = {
      layoutVersion: Game.state.world.layoutVersion || 3,
      regions: {}
    });
    root.regions = root.regions || {};
    return root.regions[rid] || (root.regions[rid] = {
      discoveredHazardIds: [],
      hazardCooldowns: {}
    });
  }

  function emit(instance, type, payload) {
    var event = Object.assign({
      type: type,
      instanceId: instance.id,
      profileId: instance.profileId,
      regionId: instance.regionId,
      tick: worldTick,
      shape: clone(instance.profile.trigger),
      position: { x: instance.x, y: instance.y },
      orientation: instance.orientation,
      awareness: instance.awareness,
      phase: instance.phase,
      progress: phaseProgress(instance),
      targetActorIds: []
    }, payload || {});
    eventLog.push(event);
    if (eventLog.length > MAX_EVENTS) eventLog.splice(0, eventLog.length - MAX_EVENTS);
    Game.bus.emit(type, event);
    return event;
  }

  function phaseDuration(instance) {
    var lifecycle = instance.profile.lifecycle;
    if (instance.phase === 'warning') return Math.max(1, instance.warningEndTick - instance.phaseSinceTick);
    if (instance.phase === 'active') return Math.max(1,
      (instance.activeEndTick || (instance.phaseSinceTick + lifecycle.activeTicks)) - instance.phaseSinceTick);
    if (instance.phase === 'cooldown') return Math.max(1, lifecycle.cooldownTicks || 1);
    return 1;
  }

  function phaseProgress(instance) {
    if (instance.phase === 'cooldown') {
      return U.clamp(1 - (instance.cooldownUntilWorldTime - worldTime()) /
        Math.max(0.05, instance.profile.lifecycle.cooldownTicks / 20), 0, 1);
    }
    return U.clamp((worldTick - instance.phaseSinceTick) / phaseDuration(instance), 0, 1);
  }

  function reveal(instance, reason, detection) {
    if (instance.awareness === 'revealed') return false;
    instance.awareness = 'revealed';
    instance.revealUntilTick = worldTick + Math.max(0, instance.profile.lifecycle.revealTicks || 0);
    var saved = savedRegion(instance.regionId);
    if (saved.discoveredHazardIds.indexOf(instance.id) < 0) {
      saved.discoveredHazardIds.push(instance.id);
      saved.discoveredHazardIds.sort();
    }
    var payload = { reason: reason || 'proximity' };
    if (detection) {
      payload.detection = {
        actorId: detection.actorId,
        baseChance: detection.baseChance,
        roll: detection.roll,
        strategy: detection.strategy,
        strategyMultiplier: detection.strategyMultiplier,
        expeditionVision: detection.expeditionVision,
        environmentMultiplier: detection.environmentMultiplier,
        effectiveChance: detection.effectiveChance,
        sources: clone(detection.sources)
      };
    }
    emit(instance, 'hazard:revealed', payload);
    refreshNavigation();
    return true;
  }

  function warnDetectionSource(sourceId, reason, error) {
    if (warnedDetectionSources[sourceId]) return;
    warnedDetectionSources[sourceId] = true;
    if (window.console && console.warn) {
      console.warn('[Hazards] detection modifier source "' + sourceId + '" ' + reason,
        error || '');
    }
  }

  function strategyId() {
    var configured = Game.state && Game.state.settings &&
      Game.state.settings.expeditionStrategy;
    return DETECTION_STRATEGY_MULTIPLIERS[configured] ? configured : 'balanced';
  }

  function providerContext(instance, actor, strategy) {
    return {
      instanceId: instance.id,
      profileId: instance.profileId,
      regionId: instance.regionId,
      category: instance.profile.category,
      position: { x: instance.x, y: instance.y },
      region: Game.world && Game.world.region &&
        Game.world.region.id === instance.regionId
        ? Game.world.region
        : Game.reg && Game.reg.get('region', instance.regionId),
      actorId: actor && actor.id || null,
      actor: actor || null,
      strategy: strategy,
      worldTick: worldTick,
      worldTime: worldTime()
    };
  }

  function sourceMultiplier(sourceId, provider, context) {
    var value;
    try {
      value = provider(context);
    } catch (error) {
      warnDetectionSource(sourceId, 'threw and was ignored.', error);
      return 1;
    }
    if (!Number.isFinite(value) || value < 0 || value > 4) {
      warnDetectionSource(sourceId, 'returned an invalid multiplier and was ignored.');
      return 1;
    }
    return value;
  }

  function detectionContext(instance, actor) {
    if (typeof instance === 'string') instance = byId[instance];
    if (!instance) return null;
    if (typeof actor === 'string') {
      actor = Game.actors && Game.actors.get ? Game.actors.get(actor) : null;
    }
    actor = actor || Game.world && Game.world.hero || null;
    var strategy = strategyId();
    var context = providerContext(instance, actor, strategy);
    var sources = [];
    var expeditionVision = 1;
    try {
      expeditionVision = Game.expedition && Game.expedition.currentModifier
        ? Game.expedition.currentModifier(instance.regionId).vision
        : 1;
    } catch (error) {
      warnDetectionSource('expedition:vision', 'threw and was ignored.', error);
      expeditionVision = 1;
    }
    if (!Number.isFinite(expeditionVision) || expeditionVision < 0 || expeditionVision > 4) {
      warnDetectionSource('expedition:vision',
        'returned an invalid multiplier and was ignored.');
      expeditionVision = 1;
    }
    Object.keys(detectionModifierSources).sort().forEach(function (sourceId) {
      sources.push({
        id: sourceId,
        multiplier: sourceMultiplier(sourceId, detectionModifierSources[sourceId], context)
      });
    });
    var environmentMultiplier = sources.reduce(function (product, source) {
      return product * source.multiplier;
    }, 1);
    var configuredChance = instance.profile.detection.revealChance;
    var baseChance = Number.isFinite(configuredChance)
      ? U.clamp(configuredChance, 0, 1)
      : 1;
    var strategyMultiplier = DETECTION_STRATEGY_MULTIPLIERS[strategy];
    var effectiveChance = U.clamp(
      baseChance * strategyMultiplier * expeditionVision * environmentMultiplier, 0, 0.85);
    return {
      instanceId: instance.id,
      actorId: actor && actor.id || null,
      baseChance: baseChance,
      roll: instance.detectionRoll,
      strategy: strategy,
      strategyMultiplier: strategyMultiplier,
      expeditionVision: expeditionVision,
      environmentMultiplier: environmentMultiplier,
      effectiveChance: effectiveChance,
      detectable: instance.detectionRoll < effectiveChance,
      sources: sources
    };
  }

  function setPhase(instance, phase, payload) {
    if (instance.phase === phase) return false;
    instance.phase = phase;
    instance.phaseSinceTick = worldTick;
    if (phase === 'warning') emit(instance, 'hazard:warning', payload);
    else if (phase === 'active') emit(instance, 'hazard:activated', payload);
    else if (phase === 'cooldown') emit(instance, 'hazard:cooldown', payload);
    refreshNavigation();
    return true;
  }

  function stableInstanceId(profile, ordinal) {
    var layoutVersion = Game.state.world.layoutVersion || layout.version || 3;
    var source = [
      Game.state.world.worldSeed >>> 0,
      layoutVersion,
      regionId,
      profile.id,
      ordinal
    ].join('|');
    return 'hz:' + layoutVersion + ':' + regionId + ':' +
      ('00000000' + U.fnv1a(source)).slice(-8) + ':' + ordinal;
  }

  function countFor(profile) {
    var count = profile.placement.count;
    if (!Array.isArray(count)) return Math.max(1, count | 0);
    var minimum = Math.max(1, count[0] | 0);
    var maximum = Math.max(minimum, count[1] | 0);
    var rng = U.seededRng(U.strSeed([
      Game.state.world.worldSeed, regionId, profile.id, 'count'
    ].join('|')));
    return minimum + Math.floor(rng() * (maximum - minimum + 1));
  }

  function pointSegmentDistance(point, from, to) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return U.dist(point.x, point.y, from.x, from.y);
    var ratio = U.clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq, 0, 1);
    return U.dist(point.x, point.y, from.x + dx * ratio, from.y + dy * ratio);
  }

  function routeDefinitions() {
    var routes = [];
    var macro = layout.macro || {};
    var centers = macro.centers || [];
    (macro.edges || []).forEach(function (edge, index) {
      var from = centers[edge.a];
      var to = centers[edge.b];
      if (!from || !to) return;
      routes.push({
        id: 'macro:' + edge.a + '>' + edge.b + ':' + index,
        from: from, to: to, weight: edge.kind === 'alternate' ? 1 : 1.25
      });
    });
    function nearestCenter(point) {
      if (!point || !centers.length) return null;
      return centers.reduce(function (best, center) {
        var distance = U.dist(point.x, point.y, center.x, center.y);
        return !best || distance < best.distance ? { point: center, distance: distance } : best;
      }, null);
    }
    [
      ['landmark', layout.landmarks || [], 1.25],
      ['resource', layout.nodes || [], 1.15],
      ['curio', layout.curios || [], 1],
      ['ecology', layout.ecology || [], .9],
      ['threat', layout.threats || [], 1.3],
      ['guardian', layout.guardian ? [layout.guardian] : [], 1.4],
      ['boss', layout.bossLair ? [layout.bossLair] : [], 1.4]
    ].forEach(function (group) {
      group[1].forEach(function (target, index) {
        var nearest = nearestCenter(target);
        if (!nearest || nearest.distance < 6) return;
        routes.push({
          id: 'approach:' + group[0] + ':' + (target.id || index),
          from: nearest.point, to: target, weight: group[2]
        });
      });
    });
    return routes;
  }

  function walkableEscape(profile, anchor) {
    if (!profile.placement.requireWalkableEscape || !Game.terrain ||
        typeof Game.terrain.isWalkable !== 'function') return true;
    var radius = Math.max(
      profile.trigger.radius || 0,
      profile.trigger.length || 0,
      (profile.trigger.width || 0) / 2,
      (profile.trigger.height || 0) / 2,
      16
    ) + 24;
    var exits = 0;
    for (var index = 0; index < 12; index++) {
      var angle = Math.PI * 2 * index / 12;
      if (Game.terrain.isWalkable(
          anchor.x + Math.cos(angle) * radius,
          anchor.y + Math.sin(angle) * radius, 8)) exits++;
    }
    return exits >= 2;
  }

  function validAnchor(profile, anchor) {
    var placement = profile.placement || {};
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return false;
    if (layout.camp && Number.isFinite(placement.minCampDistance) &&
        U.dist(anchor.x, anchor.y, layout.camp.x, layout.camp.y) < placement.minCampDistance) return false;
    if (Number.isFinite(placement.minLandmarkDistance) && (layout.landmarks || []).some(function (landmark) {
      return U.dist(anchor.x, anchor.y, landmark.x, landmark.y) < placement.minLandmarkDistance;
    })) return false;
    return walkableEscape(profile, anchor);
  }

  function routeMetrics(profile, anchor, routes) {
    var triggerReach = Math.max(
      profile.trigger.radius || 0,
      profile.trigger.length || 0,
      (profile.trigger.width || 0) / 2,
      (profile.trigger.height || 0) / 2,
      16
    );
    var revealReach = Math.max(triggerReach, profile.detection.revealRadius || 0);
    var metrics = { triggerRouteIds: [], revealRouteIds: [], minRouteDistance: Infinity };
    routes.forEach(function (route) {
      var distance = pointSegmentDistance(anchor, route.from, route.to);
      metrics.minRouteDistance = Math.min(metrics.minRouteDistance, distance);
      if (distance <= triggerReach + 8) metrics.triggerRouteIds.push(route.id);
      if (distance <= revealReach) metrics.revealRouteIds.push(route.id);
    });
    return metrics;
  }

  function bestOrientation(profile, anchor, routes, id) {
    if (profile.trigger.shape === 'circle') return 0;
    var best = null;
    var offset = U.strSeed(id + ':orientation') % 16;
    for (var ordinal = 0; ordinal < 16; ordinal++) {
      var orientation = Math.PI * 2 * ((ordinal + offset) % 16) / 16;
      var probe = { x: anchor.x, y: anchor.y, orientation: orientation, profile: profile };
      var score = 0;
      routes.forEach(function (route) {
        var length = U.dist(route.from.x, route.from.y, route.to.x, route.to.y);
        var steps = Math.max(1, Math.ceil(length / 6));
        for (var step = 0; step <= steps; step++) {
          var ratio = step / steps;
          if (contains(probe,
              route.from.x + (route.to.x - route.from.x) * ratio,
              route.from.y + (route.to.y - route.from.y) * ratio)) score += route.weight;
        }
      });
      if (!best || score > best.score) best = { orientation: orientation, score: score };
    }
    return best ? best.orientation : 0;
  }

  function selectAnchors(profile) {
    var source;
    if (profile.placement.source === 'threatTerritory') {
      source = (layout.threats || []).filter(function (threat) {
        return threat.defId === 'ambush';
      }).map(function (threat) {
        return { id: threat.id + ':hazard', threatId: threat.id, x: threat.x, y: threat.y };
      });
    } else {
      source = (layout.hazardAnchors || []).map(function (anchor) {
        return Object.assign({}, anchor);
      });
    }
    var routes = routeDefinitions();
    var candidates = source.filter(function (anchor) {
      return validAnchor(profile, anchor);
    }).map(function (anchor) {
      anchor.routeMetrics = routeMetrics(profile, anchor, routes);
      anchor.tieBreak = U.strSeed([
        Game.state.world.worldSeed, regionId, profile.id, anchor.id
      ].join('|'));
      return anchor;
    });
    var selected = [];
    var coveredTrigger = {};
    var coveredReveal = {};
    var targetCount = Math.min(countFor(profile), candidates.length);
    var minSpacing = Math.max(0, Number(profile.placement.minSpacing) || 0);
    while (selected.length < targetCount) {
      var best = null;
      candidates.forEach(function (candidate) {
        if (selected.indexOf(candidate) >= 0) return;
        if (selected.some(function (placed) {
          return U.dist(candidate.x, candidate.y, placed.x, placed.y) < minSpacing;
        })) return;
        var freshTrigger = candidate.routeMetrics.triggerRouteIds.filter(function (id) {
          return !coveredTrigger[id];
        }).length;
        var freshReveal = candidate.routeMetrics.revealRouteIds.filter(function (id) {
          return !coveredReveal[id];
        }).length;
        var score = freshTrigger * 20000 + freshReveal * 2500 +
          candidate.routeMetrics.triggerRouteIds.length * 400 +
          candidate.routeMetrics.revealRouteIds.length * 40 +
          200 / (1 + candidate.routeMetrics.minRouteDistance);
        if (!best || score > best.score ||
            (score === best.score && candidate.tieBreak < best.anchor.tieBreak)) {
          best = { anchor: candidate, score: score };
        }
      });
      if (!best) break;
      var chosen = best.anchor;
      chosen.routeMetrics.triggerRouteIds.forEach(function (id) { coveredTrigger[id] = true; });
      chosen.routeMetrics.revealRouteIds.forEach(function (id) { coveredReveal[id] = true; });
      chosen.placementFallback = chosen.routeMetrics.revealRouteIds.length === 0;
      selected.push(chosen);
    }
    selected.forEach(function (anchor, ordinal) {
      var id = stableInstanceId(profile, ordinal);
      anchor.orientation = bestOrientation(profile, anchor, routes, id);
    });
    return selected;
  }

  function makeInstance(profile, ordinal, anchor) {
    var id = stableInstanceId(profile, ordinal);
    var saved = savedRegion(regionId);
    var cooldownUntil = Number(saved.hazardCooldowns[id]) || 0;
    var discovered = saved.discoveredHazardIds.indexOf(id) >= 0;
    var instance = {
      id: id,
      profileId: profile.id,
      profile: profile,
      visual: Game.content.get('hazardVisualProfile', profile.visualProfileId),
      regionId: regionId,
      x: anchor.x,
      y: anchor.y,
      orientation: Number(anchor.orientation) || 0,
      anchorId: anchor.id,
      threatId: anchor.threatId || null,
      placement: {
        triggerRouteIds: anchor.routeMetrics ? anchor.routeMetrics.triggerRouteIds.slice() : [],
        revealRouteIds: anchor.routeMetrics ? anchor.routeMetrics.revealRouteIds.slice() : [],
        minRouteDistance: anchor.routeMetrics && Number.isFinite(anchor.routeMetrics.minRouteDistance)
          ? anchor.routeMetrics.minRouteDistance : null,
        fallback: !!anchor.placementFallback
      },
      awareness: discovered ? 'revealed' : 'concealed',
      detectionRoll: U.strSeed(id + '|hazard-detection-v1') / 4294967296,
      clueVisible: false,
      clueNotified: false,
      revealUntilTick: 0,
      phase: cooldownUntil > worldTime() ? 'cooldown' : 'dormant',
      phaseSinceTick: worldTick,
      cooldownUntilWorldTime: cooldownUntil,
      triggerOrdinal: 0,
      warningEndTick: 0,
      activeEndTick: 0,
      nextPulseTick: 0,
      pulsesApplied: 0,
      pulsesComplete: false,
      armedAfterExit: true,
      insideActors: {},
      actorIds: [],
      lockEncounterId: null,
      disabled: false,
      hitUntilTick: 0
    };
    instances.push(instance);
    byId[id] = instance;
    return instance;
  }

  function buildInstances() {
    var profiles = Game.content.all('hazardProfile').filter(function (profile) {
      return profile.regionId === regionId;
    }).sort(function (a, b) { return a.id.localeCompare(b.id); });
    profiles.forEach(function (profile) {
      var anchors = selectAnchors(profile);
      anchors.forEach(function (anchor, index) { makeInstance(profile, index, anchor); });
    });
    var valid = {};
    instances.forEach(function (instance) { valid[instance.id] = true; });
    var saved = savedRegion(regionId);
    saved.discoveredHazardIds = saved.discoveredHazardIds.filter(function (id) { return valid[id]; });
    Object.keys(saved.hazardCooldowns).forEach(function (id) {
      if (!valid[id] || saved.hazardCooldowns[id] <= worldTime()) delete saved.hazardCooldowns[id];
    });
  }

  function bindWorldActors() {
    instances.filter(function (instance) {
      return instance.profile.category === 'ambushTrigger';
    }).forEach(function (instance) {
      var actors = (Game.world.entities || []).filter(function (actor) {
        return actor && actor.threatId === instance.threatId && actor.components && actor.components.vitals;
      }).sort(function (a, b) { return a.id.localeCompare(b.id); });
      var allowed = instance.profile.outcome.encounterPackIds || [];
      var pack = actors[0] && Game.content.get('encounterPack', actors[0].packId);
      if (!actors.length || actors.length > 2 || !pack || !pack.ambushEligible ||
          allowed.indexOf(pack.id) < 0) {
        instance.disabled = true;
        return;
      }
      instance.actorIds = actors.map(function (actor) {
        actor.hazardConcealed = true;
        actor.hazardInstanceId = instance.id;
        actor.state = 'idle';
        return actor.id;
      });
    });
  }

  function localPoint(instance, x, y) {
    var dx = x - instance.x;
    var dy = y - instance.y;
    var cos = Math.cos(-instance.orientation);
    var sin = Math.sin(-instance.orientation);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  }

  function contains(instance, x, y) {
    var trigger = instance.profile.trigger;
    var point = localPoint(instance, x, y);
    if (trigger.shape === 'circle') {
      return point.x * point.x + point.y * point.y <= trigger.radius * trigger.radius;
    }
    if (trigger.shape === 'cone') {
      var length = trigger.length || trigger.radius || 36;
      var distance = Math.sqrt(point.x * point.x + point.y * point.y);
      if (distance > length || point.x < 0) return false;
      return Math.abs(Math.atan2(point.y, point.x)) <= (trigger.angleDeg || 60) * Math.PI / 360;
    }
    var width = trigger.width || trigger.length || 40;
    var height = trigger.height || trigger.radius * 2 || 16;
    return Math.abs(point.x) <= width / 2 && Math.abs(point.y) <= height / 2;
  }

  function sweptContains(instance, previous, current) {
    if (!previous) return contains(instance, current.x, current.y);
    var distance = U.dist(previous.x, previous.y, current.x, current.y);
    var steps = Math.max(1, Math.ceil(distance / 5));
    for (var step = 0; step <= steps; step++) {
      var ratio = step / steps;
      if (contains(instance,
          previous.x + (current.x - previous.x) * ratio,
          previous.y + (current.y - previous.y) * ratio)) return true;
    }
    return false;
  }

  function movementAllowed(instance, actor) {
    var movement = actor.components.body && actor.components.body.movementTypes || ['ground'];
    return movement.some(function (type) {
      return instance.profile.trigger.movementTypes.indexOf(type) >= 0;
    });
  }

  function triggerRadius(instance) {
    var trigger = instance.profile.trigger;
    if (trigger.shape === 'circle') return trigger.radius || 16;
    if (trigger.shape === 'cone') return trigger.length || trigger.radius || 36;
    if (trigger.shape === 'line') return trigger.length || trigger.width || trigger.radius || 36;
    return Math.max(trigger.width || 0, trigger.height || 0, (trigger.radius || 0) * 2) / 2 || 16;
  }

  function hazardDistance(instance, x, y) {
    if (contains(instance, x, y)) return 0;
    var trigger = instance.profile.trigger;
    var point = localPoint(instance, x, y);
    if (trigger.shape === 'circle') {
      return Math.max(0, Math.sqrt(point.x * point.x + point.y * point.y) - (trigger.radius || 16));
    }
    if (trigger.shape === 'cone') {
      var length = trigger.length || trigger.radius || 36;
      var halfAngle = (trigger.angleDeg || 60) * Math.PI / 360;
      var upper = { x: Math.cos(halfAngle) * length, y: Math.sin(halfAngle) * length };
      var lower = { x: Math.cos(-halfAngle) * length, y: Math.sin(-halfAngle) * length };
      var local = { x: point.x, y: point.y };
      var distance = Math.min(
        pointSegmentDistance(local, { x: 0, y: 0 }, upper),
        pointSegmentDistance(local, { x: 0, y: 0 }, lower)
      );
      for (var sample = 0; sample <= 12; sample++) {
        var angle = -halfAngle + (halfAngle * 2 * sample / 12);
        distance = Math.min(distance, U.dist(
          local.x, local.y, Math.cos(angle) * length, Math.sin(angle) * length));
      }
      return distance;
    }
    var width = trigger.width || trigger.length || 40;
    var height = trigger.height || trigger.radius * 2 || 16;
    var dx = Math.max(Math.abs(point.x) - width / 2, 0);
    var dy = Math.max(Math.abs(point.y) - height / 2, 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function candidateTouchesDanger(x, y, ignoreId) {
    return instances.some(function (other) {
      if (other.id === ignoreId || other.disabled || other.phase === 'cooldown') return false;
      if (other.awareness === 'concealed') return false;
      return hazardDistance(other, x, y) <= 10;
    });
  }

  function playerActors() {
    return (Game.world.entities || []).filter(function (actor) {
      return actor && actor.components && actor.components.vitals && !actor.dead &&
        (actor.kind === 'hero' || actor.partyId === 'party-player');
    });
  }

  function targetsInside(instance) {
    return playerActors().filter(function (actor) {
      return movementAllowed(instance, actor) && contains(instance, actor.x, actor.y);
    });
  }

  function activeHazardCount() {
    return instances.filter(function (instance) {
      return instance.phase === 'warning' || instance.phase === 'active';
    }).length;
  }

  function requestEscape(instance, actor) {
    if (!actor || Game.state.settings.controlMode === 'manual') return;
    var strategy = Game.state.settings.expeditionStrategy || 'balanced';
    var vitals = actor.components && actor.components.vitals;
    var hpRatio = vitals && vitals.maxHp ? vitals.hp / vitals.maxHp :
      (actor.maxHp ? actor.hp / actor.maxHp : 1);
    if (strategy === 'loot' && hpRatio >=
        (instance.profile.category === 'ambushTrigger' ? .55 : .4)) {
      emit(instance, 'hazard:riskAccepted', {
        strategy: strategy, hpRatio: hpRatio, targetActorIds: [actor.id]
      });
      return;
    }
    var radius = triggerRadius(instance);
    var best = null;
    for (var i = 0; i < 16; i++) {
      var angle = Math.PI * 2 * i / 16;
      var candidate = {
        x: instance.x + Math.cos(angle) * (radius + 26),
        y: instance.y + Math.sin(angle) * (radius + 26)
      };
      if (!Game.terrain.isWalkable(candidate.x, candidate.y, 8)) continue;
      if (contains(instance, candidate.x, candidate.y)) continue;
      if (candidateTouchesDanger(candidate.x, candidate.y, instance.id)) continue;
      var distance = U.dist(actor.x, actor.y, candidate.x, candidate.y);
      if (!best || distance < best.distance) best = { x: candidate.x, y: candidate.y, distance: distance };
    }
    if (!best) return;
    if (Game.world && actor === Game.world.hero && actor.interactOrder) {
      Game.world.cancelInteraction('hazard');
    }
    actor.target = null;
    actor.manualTarget = false;
    actor.moveOrder = {
      x: best.x, y: best.y,
      id: 'hazard-escape:' + instance.id,
      ai: true, hazardEscapeId: instance.id
    };
    if (Game.nav) Game.nav.clear(actor);
    emit(instance, 'hazard:escapeRequested', {
      strategy: strategy, hpRatio: hpRatio,
      targetActorIds: [actor.id], destination: { x: best.x, y: best.y }
    });
  }

  function startWarning(instance, actors) {
    if (instance.disabled || instance.phase !== 'dormant' || !instance.armedAfterExit ||
        activeHazardCount() >= 2 || instance.cooldownUntilWorldTime > worldTime()) return false;
    reveal(instance, 'trigger');
    instance.triggerOrdinal++;
    instance.warningEndTick = worldTick + instance.profile.lifecycle.warningTicks +
      Math.max(0, instance.revealUntilTick - worldTick);
    instance.pulsesApplied = 0;
    instance.pulsesComplete = false;
    instance.nextPulseTick = 0;
    instance.activeEndTick = 0;
    instance.armedAfterExit = false;
    setPhase(instance, 'warning', {
      triggerOrdinal: instance.triggerOrdinal,
      targetActorIds: actors.map(function (actor) { return actor.id; })
    });
    actors.forEach(function (actor) { requestEscape(instance, actor); });
    return true;
  }

  function beginCooldown(instance, reason) {
    instance.cooldownUntilWorldTime = worldTime() + instance.profile.lifecycle.cooldownTicks / 20;
    savedRegion(instance.regionId).hazardCooldowns[instance.id] = instance.cooldownUntilWorldTime;
    instance.lockEncounterId = null;
    setPhase(instance, 'cooldown', { reason: reason || 'resolved' });
  }

  function activateDamage(instance) {
    setPhase(instance, 'active');
    instance.nextPulseTick = worldTick;
    instance.pulsesApplied = 0;
    instance.pulsesComplete = false;
    var outcome = instance.profile.outcome;
    var pulseSpan = Math.max(1, ((outcome.pulses || 1) - 1) *
      Math.max(1, outcome.intervalTicks || 1) + 1);
    instance.activeEndTick = worldTick + Math.max(
      instance.profile.lifecycle.activeTicks || 1, pulseSpan);
  }

  function applyDamagePulse(instance) {
    var targets = targetsInside(instance);
    var outcome = instance.profile.outcome;
    var encounterId = Game.world.hero && Game.world.hero.encounterId || null;
    var events = Game.effects.resolveExternal({
      source: {
        kind: 'hazard', profileId: instance.profileId,
        instanceId: instance.id
      },
      targetIds: targets.map(function (actor) { return actor.id; }),
      effects: outcome.effects,
      position: { x: instance.x, y: instance.y },
      encounterId: encounterId,
      tick: encounterId && Game.encounters.get(encounterId)
        ? Game.encounters.get(encounterId).tick : worldTick,
      worldTick: worldTick,
      regionTier: Game.State.regionTier(instance.regionId),
      pulse: instance.pulsesApplied
    });
    instance.hitUntilTick = worldTick + 6;
    emit(instance, 'hazard:hit', {
      pulse: instance.pulsesApplied,
      targetActorIds: targets.map(function (actor) { return actor.id; }),
      results: events.map(function (event) { return event && event.payload; })
    });
    instance.pulsesApplied++;
    instance.nextPulseTick = worldTick + Math.max(1, outcome.intervalTicks || 1);
    if (instance.pulsesApplied >= (outcome.pulses || 1)) instance.pulsesComplete = true;
  }

  function revealAmbushActors(instance, visible) {
    instance.actorIds.forEach(function (actorId) {
      var actor = Game.actors.get(actorId);
      if (actor) actor.hazardConcealed = !visible;
    });
  }

  function activateAmbush(instance) {
    var actors = instance.actorIds.map(Game.actors.get).filter(function (actor) {
      return actor && !actor.dead;
    });
    if (!actors.length) {
      instance.disabled = true;
      instance.phase = 'dormant';
      return false;
    }
    revealAmbushActors(instance, true);
    setPhase(instance, 'active', { targetActorIds: actors.map(function (actor) { return actor.id; }) });
    var encounter = Game.world.startEncounter(actors[0]);
    if (!encounter) {
      revealAmbushActors(instance, false);
      instance.phase = 'dormant';
      instance.phaseSinceTick = worldTick;
      instance.armedAfterExit = false;
      refreshNavigation();
      return false;
    }
    instance.lockEncounterId = encounter.id;
    encounter.context.hazardInstanceId = instance.id;
    emit(instance, 'hazard:ambushStarted', {
      encounterId: encounter.id,
      targetActorIds: actors.map(function (actor) { return actor.id; })
    });
    return true;
  }

  function paused() {
    var world = Game.world;
    var hero = world && world.hero;
    return !world || !hero || Game.state.world.mode !== 'battle' ||
      !!world.cinematic ||
      (Game.transitions && Game.transitions.isActive());
  }

  function fixedTick() {
    worldTick++;
    if (Game.effects) Game.effects.cleanupExternal(worldTick);
    if (paused()) {
      playerActors().forEach(function (actor) {
        previousPositions[actor.id] = { x: actor.x, y: actor.y };
      });
      return;
    }
    var actors = playerActors();
    instances.forEach(function (instance) {
      if (instance.disabled) return;
      var nearestDistance = Infinity;
      var proximityActors = [];
      actors.forEach(function (actor) {
        var distance = U.dist(actor.x, actor.y, instance.x, instance.y);
        if (distance < nearestDistance) nearestDistance = distance;
        if (movementAllowed(instance, actor) &&
            distance <= instance.profile.detection.revealRadius) {
          proximityActors.push(actor);
        }
      });
      var clueVisible = nearestDistance <= instance.profile.detection.clueRadius;
      if (clueVisible && !instance.clueNotified && instance.awareness === 'concealed') {
        instance.clueNotified = true;
        emit(instance, 'hazard:clue', { distance: nearestDistance });
      } else if (!clueVisible) {
        instance.clueNotified = false;
      }
      instance.clueVisible = clueVisible;
      if (instance.awareness === 'concealed' && proximityActors.length) {
        var successfulDetection = null;
        proximityActors.forEach(function (actor) {
          var detection = detectionContext(instance, actor);
          if (!detection.detectable) return;
          if (!successfulDetection ||
              detection.effectiveChance > successfulDetection.effectiveChance) {
            successfulDetection = detection;
          }
        });
        if (successfulDetection) reveal(instance, 'proximity', successfulDetection);
      }

      var crossing = actors.filter(function (actor) {
        return movementAllowed(instance, actor) && sweptContains(instance,
          previousPositions[actor.id], { x: actor.x, y: actor.y });
      });
      var inside = targetsInside(instance);

      if (instance.phase === 'cooldown') {
        if (worldTime() >= instance.cooldownUntilWorldTime && !inside.length) {
          delete savedRegion(instance.regionId).hazardCooldowns[instance.id];
          instance.phase = 'dormant';
          instance.phaseSinceTick = worldTick;
          instance.armedAfterExit = true;
          refreshNavigation();
        }
        return;
      }
      if (instance.phase === 'dormant') {
        if (!inside.length) instance.armedAfterExit = true;
        if (crossing.length) startWarning(instance, crossing);
        return;
      }
      if (instance.phase === 'warning' && worldTick >= instance.warningEndTick) {
        if (!inside.length) {
          instance.phase = 'dormant';
          instance.phaseSinceTick = worldTick;
          instance.armedAfterExit = true;
          emit(instance, 'hazard:avoided', {});
          refreshNavigation();
        } else if (instance.profile.category === 'damageTrap') {
          activateDamage(instance);
        } else {
          activateAmbush(instance);
        }
        return;
      }
      if (instance.phase === 'active' && instance.profile.category === 'damageTrap' &&
          !instance.pulsesComplete && worldTick >= instance.nextPulseTick) {
        applyDamagePulse(instance);
      }
      if (instance.phase === 'active' && instance.profile.category === 'damageTrap' &&
          instance.pulsesComplete && worldTick >= instance.activeEndTick) {
        beginCooldown(instance, 'active-complete');
      }
    });
    actors.forEach(function (actor) {
      previousPositions[actor.id] = { x: actor.x, y: actor.y };
    });
  }

  function refreshNavigation() {
    if (!Game.nav || !layout || Game.nav._hazardRefresh) return;
    Game.nav._hazardRefresh = true;
    try {
      Game.nav.useLayout(layout);
      if (Game.world && Game.world.hero) Game.nav.clear(Game.world.hero);
    } finally {
      Game.nav._hazardRefresh = false;
    }
  }

  function inspectPath(points, options) {
    options = options || {};
    var allowed = {};
    var restrict = Array.isArray(options.instanceIds) && options.instanceIds.length;
    if (restrict) options.instanceIds.forEach(function (id) { allowed[id] = true; });
    var path = (points || []).filter(function (point) {
      return point && Number.isFinite(point.x) && Number.isFinite(point.y);
    }).map(function (point) {
      return { x: Number(point.x), y: Number(point.y) };
    });
    var candidates = instances.filter(function (instance) {
      return (!restrict || allowed[instance.id]) && (options.includeDisabled || !instance.disabled);
    });
    var results = candidates.map(function (instance) {
      return {
        instanceId: instance.id,
        profileId: instance.profileId,
        category: instance.profile.category,
        minCenterDistance: Infinity,
        clue: null,
        reveal: null,
        trigger: null
      };
    });
    var totalLength = 0;
    var sampleStep = U.clamp(Number(options.sampleStep) || 4, 1, 8);

    function inspectPoint(point, distanceAlong) {
      candidates.forEach(function (instance, index) {
        var result = results[index];
        var distance = U.dist(point.x, point.y, instance.x, instance.y);
        result.minCenterDistance = Math.min(result.minCenterDistance, distance);
        if (!result.clue && distance <= instance.profile.detection.clueRadius) {
          result.clue = { distanceAlong: distanceAlong, point: { x: point.x, y: point.y } };
        }
        if (!result.reveal && distance <= instance.profile.detection.revealRadius) {
          result.reveal = { distanceAlong: distanceAlong, point: { x: point.x, y: point.y } };
        }
        if (!result.trigger && contains(instance, point.x, point.y)) {
          result.trigger = { distanceAlong: distanceAlong, point: { x: point.x, y: point.y } };
        }
      });
    }

    if (path.length) inspectPoint(path[0], 0);
    for (var pi = 1; pi < path.length; pi++) {
      var from = path[pi - 1];
      var to = path[pi];
      var segmentLength = U.dist(from.x, from.y, to.x, to.y);
      var steps = Math.max(1, Math.ceil(segmentLength / sampleStep));
      for (var step = 1; step <= steps; step++) {
        var ratio = step / steps;
        inspectPoint({
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio
        }, totalLength + segmentLength * ratio);
      }
      totalLength += segmentLength;
    }
    results.forEach(function (result) {
      if (!Number.isFinite(result.minCenterDistance)) result.minCenterDistance = null;
    });
    return {
      length: totalLength,
      points: path,
      interactions: results
    };
  }

  var H = Game.hazards = {
    initRegion: function (rid, nextLayout) {
      regionId = rid;
      layout = nextLayout;
      accumulatorMs = 0;
      worldTick = 0;
      instances = [];
      byId = {};
      previousPositions = {};
      eventLog = [];
      buildInstances();
      bindWorldActors();
      playerActors().forEach(function (actor) {
        previousPositions[actor.id] = { x: actor.x, y: actor.y };
      });
      refreshNavigation();
      Game.bus.emit('hazards:regionReady', {
        regionId: rid,
        count: instances.length,
        activeCount: instances.filter(function (instance) { return !instance.disabled; }).length
      });
      return instances.slice();
    },

    update: function (dt) {
      accumulatorMs += Math.max(0, Number(dt) || 0) * 1000;
      var steps = 0;
      while (accumulatorMs >= TICK_MS && steps < 20) {
        fixedTick();
        accumulatorMs -= TICK_MS;
        steps++;
      }
      return steps;
    },

    all: function () { return instances.slice(); },
    get: function (id) { return byId[id] || null; },
    events: function () { return eventLog.slice(); },
    tick: function () { return worldTick; },

    registerDetectionModifierSource: function (sourceId, provider) {
      if (typeof sourceId !== 'string' || !sourceId.trim() || typeof provider !== 'function') {
        return false;
      }
      sourceId = sourceId.trim();
      detectionModifierSources[sourceId] = provider;
      delete warnedDetectionSources[sourceId];
      return true;
    },

    unregisterDetectionModifierSource: function (sourceId) {
      if (typeof sourceId !== 'string') return false;
      sourceId = sourceId.trim();
      if (!Object.prototype.hasOwnProperty.call(detectionModifierSources, sourceId)) return false;
      delete detectionModifierSources[sourceId];
      delete warnedDetectionSources[sourceId];
      return true;
    },

    detectionContext: function (instanceId, actorId) {
      return detectionContext(instanceId, actorId);
    },

    forceReveal: function (id, reason) {
      var instance = byId[id];
      return instance ? reveal(instance, reason || 'forced') : false;
    },

    forceTrigger: function (id, actorId) {
      var instance = byId[id];
      var actor = Game.actors.get(actorId) || Game.world.hero;
      if (!instance || !actor) return false;
      reveal(instance, 'forced');
      return startWarning(instance, [actor]);
    },

    resetInstance: function (id) {
      var instance = byId[id];
      if (!instance || instance.lockEncounterId) return false;
      var saved = savedRegion(instance.regionId);
      var discoveredIndex = saved.discoveredHazardIds.indexOf(instance.id);
      if (discoveredIndex >= 0) saved.discoveredHazardIds.splice(discoveredIndex, 1);
      delete saved.hazardCooldowns[instance.id];
      instance.awareness = 'concealed';
      instance.phase = 'dormant';
      instance.phaseSinceTick = worldTick;
      instance.cooldownUntilWorldTime = 0;
      instance.triggerOrdinal = 0;
      instance.warningEndTick = 0;
      instance.activeEndTick = 0;
      instance.pulsesApplied = 0;
      instance.pulsesComplete = false;
      instance.nextPulseTick = 0;
      instance.hitUntilTick = 0;
      instance.revealUntilTick = 0;
      instance.clueVisible = false;
      instance.clueNotified = false;
      instance.armedAfterExit = targetsInside(instance).length === 0;
      revealAmbushActors(instance, false);
      emit(instance, 'hazard:reset', {});
      refreshNavigation();
      return true;
    },

    navigationCost: function (x, y, strategy) {
      var cost = 0;
      instances.forEach(function (instance) {
        if (instance.disabled || instance.awareness !== 'revealed') return;
        if (hazardDistance(instance, x, y) > 12) return;
        if (instance.phase === 'warning' || instance.phase === 'active') cost += 250;
        else if (instance.phase === 'dormant') {
          cost += strategy === 'safe' ? 90 : (strategy === 'loot' ? 4 : 24);
        }
      });
      return cost;
    },

    inspectPath: inspectPath,

    snapshot: function () {
      return instances.map(function (instance) {
        return {
          id: instance.id,
          profileId: instance.profileId,
          regionId: instance.regionId,
          x: instance.x,
          y: instance.y,
          orientation: instance.orientation,
          placement: clone(instance.placement),
          awareness: instance.awareness,
          phase: instance.phase,
          phaseSinceTick: instance.phaseSinceTick,
          clueVisible: instance.clueVisible,
          warningEndTick: instance.warningEndTick,
          activeEndTick: instance.activeEndTick,
          cooldownUntilWorldTime: instance.cooldownUntilWorldTime,
          triggerOrdinal: instance.triggerOrdinal,
          threatId: instance.threatId,
          actorIds: instance.actorIds.slice(),
          disabled: instance.disabled
        };
      });
    },

    reset: function () {
      instances.forEach(function (instance) { revealAmbushActors(instance, true); });
      regionId = null;
      layout = null;
      instances = [];
      byId = {};
      previousPositions = {};
      accumulatorMs = 0;
      worldTick = 0;
      eventLog = [];
    }
  };

  Game.bus.on('encounter:ended', function (event) {
    var encounterId = event && event.encounterId;
    if (!encounterId) return;
    instances.forEach(function (instance) {
      if (instance.lockEncounterId === encounterId) beginCooldown(instance, 'encounter-ended');
    });
  });
})();
