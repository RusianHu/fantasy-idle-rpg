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
    if (instance.phase === 'active') return Math.max(1, lifecycle.activeTicks || 1);
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

  function reveal(instance, reason) {
    if (instance.awareness === 'revealed') return false;
    instance.awareness = 'revealed';
    var saved = savedRegion(instance.regionId);
    if (saved.discoveredHazardIds.indexOf(instance.id) < 0) {
      saved.discoveredHazardIds.push(instance.id);
      saved.discoveredHazardIds.sort();
    }
    emit(instance, 'hazard:revealed', { reason: reason || 'proximity' });
    refreshNavigation();
    return true;
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

  function makeInstance(profile, ordinal, anchor) {
    var id = stableInstanceId(profile, ordinal);
    var saved = savedRegion(regionId);
    var cooldownUntil = Number(saved.hazardCooldowns[id]) || 0;
    var discovered = saved.discoveredHazardIds.indexOf(id) >= 0;
    var orientation = (U.strSeed(id + ':orientation') % 4) * Math.PI / 2;
    var instance = {
      id: id,
      profileId: profile.id,
      profile: profile,
      visual: Game.content.get('hazardVisualProfile', profile.visualProfileId),
      regionId: regionId,
      x: anchor.x,
      y: anchor.y,
      orientation: orientation,
      anchorId: anchor.id,
      threatId: anchor.threatId || null,
      awareness: discovered ? 'revealed' : 'concealed',
      phase: cooldownUntil > worldTime() ? 'cooldown' : 'dormant',
      phaseSinceTick: worldTick,
      cooldownUntilWorldTime: cooldownUntil,
      triggerOrdinal: 0,
      warningEndTick: 0,
      nextPulseTick: 0,
      pulsesApplied: 0,
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
      var anchors;
      if (profile.placement.source === 'threatTerritory') {
        anchors = (layout.threats || []).filter(function (threat) {
          return threat.defId === 'ambush';
        }).map(function (threat) {
          return { id: threat.id + ':hazard', threatId: threat.id, x: threat.x, y: threat.y };
        });
      } else {
        anchors = (layout.hazardAnchors || []).slice();
        var offset = anchors.length ? U.strSeed(profile.id + ':' + Game.state.world.worldSeed) % anchors.length : 0;
        anchors = anchors.slice(offset).concat(anchors.slice(0, offset)).slice(0, countFor(profile));
      }
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
    var trigger = instance.profile.trigger;
    var radius = trigger.radius || Math.max(trigger.width || 0, trigger.height || 0, trigger.length || 0) / 2 || 24;
    var best = null;
    for (var i = 0; i < 16; i++) {
      var angle = Math.PI * 2 * i / 16;
      var candidate = {
        x: instance.x + Math.cos(angle) * (radius + 26),
        y: instance.y + Math.sin(angle) * (radius + 26)
      };
      if (!Game.terrain.isWalkable(candidate.x, candidate.y, 8)) continue;
      if (contains(instance, candidate.x, candidate.y)) continue;
      var distance = U.dist(actor.x, actor.y, candidate.x, candidate.y);
      if (!best || distance < best.distance) best = { x: candidate.x, y: candidate.y, distance: distance };
    }
    if (!best) return;
    actor.target = null;
    actor.manualTarget = false;
    actor.moveOrder = {
      x: best.x, y: best.y,
      id: 'hazard-escape:' + instance.id,
      ai: true, hazardEscapeId: instance.id
    };
    if (Game.nav) Game.nav.clear(actor);
  }

  function startWarning(instance, actors) {
    if (instance.disabled || instance.phase !== 'dormant' || !instance.armedAfterExit ||
        activeHazardCount() >= 2 || instance.cooldownUntilWorldTime > worldTime()) return false;
    var wasConcealed = instance.awareness === 'concealed';
    reveal(instance, 'trigger');
    instance.triggerOrdinal++;
    instance.warningEndTick = worldTick + instance.profile.lifecycle.warningTicks +
      (wasConcealed ? instance.profile.lifecycle.revealTicks : 0);
    instance.pulsesApplied = 0;
    instance.nextPulseTick = 0;
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
    instance.hitUntilTick = worldTick + 3;
    emit(instance, 'hazard:hit', {
      pulse: instance.pulsesApplied,
      targetActorIds: targets.map(function (actor) { return actor.id; }),
      results: events.map(function (event) { return event && event.payload; })
    });
    instance.pulsesApplied++;
    instance.nextPulseTick = worldTick + Math.max(1, outcome.intervalTicks || 1);
    if (instance.pulsesApplied >= (outcome.pulses || 1)) beginCooldown(instance, 'pulses-complete');
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
      !!world.cinematic || !!hero.interactOrder ||
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
      var proximityActor = actors.filter(function (actor) {
        return U.dist(actor.x, actor.y, instance.x, instance.y) <= instance.profile.detection.revealRadius;
      })[0];
      if (proximityActor) reveal(instance, 'proximity');

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
          worldTick >= instance.nextPulseTick) {
        applyDamagePulse(instance);
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

  function approximateRadius(instance) {
    var trigger = instance.profile.trigger;
    if (trigger.shape === 'circle') return trigger.radius;
    return Math.max(trigger.radius || 0, trigger.width || 0, trigger.height || 0,
      trigger.length || 0) / 2;
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
      instance.pulsesApplied = 0;
      instance.nextPulseTick = 0;
      instance.hitUntilTick = 0;
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
        var radius = approximateRadius(instance) + 12;
        if (U.dist(x, y, instance.x, instance.y) > radius) return;
        if (instance.phase === 'warning' || instance.phase === 'active') cost += 250;
        else if (instance.phase === 'dormant') {
          cost += strategy === 'safe' ? 90 : (strategy === 'loot' ? 4 : 24);
        }
      });
      return cost;
    },

    snapshot: function () {
      return instances.map(function (instance) {
        return {
          id: instance.id,
          profileId: instance.profileId,
          regionId: instance.regionId,
          x: instance.x,
          y: instance.y,
          orientation: instance.orientation,
          awareness: instance.awareness,
          phase: instance.phase,
          phaseSinceTick: instance.phaseSinceTick,
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
