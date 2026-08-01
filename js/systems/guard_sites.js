/* Expedition-scoped guard sites for resources, nest treasure and boss gates. */
(function () {
  'use strict';
  var Game = window.Game, U = Game.util, C = Game.contentCompiler;
  var regionId = null, layout = null, sites = [], byId = {}, byTarget = {};
  var pendingResumeTargetId = null;
  var HEALTH = {
    safe: { resource: 0.8, nestTreasure: 0.9, bossGate: 0.9 },
    balanced: { resource: 0.65, nestTreasure: 0.75, bossGate: 0.8 },
    loot: { resource: 0.5, nestTreasure: 0.6, bossGate: 0.8 }
  };

  function expeditionIndex(rid) {
    if (Game.expedition && Game.expedition.current) return Game.expedition.current(rid).index;
    var state = Game.exploration && Game.exploration.regionState(rid);
    return state ? state.expeditionIndex : 0;
  }
  function root() {
    Game.state.world.guardSites = Game.state.world.guardSites ||
      { version: 1, layoutVersion: 4, regions: {} };
    Game.state.world.guardSites.regions = Game.state.world.guardSites.regions || {};
    return Game.state.world.guardSites;
  }
  function saved(rid) {
    var index = expeditionIndex(rid);
    var value = root().regions[rid];
    if (!value || value.expeditionIndex !== index) {
      value = root().regions[rid] = {
        expeditionIndex: index, revealedIds: [], clearedIds: [], claimedTreasureIds: []
      };
    }
    ['revealedIds', 'clearedIds', 'claimedTreasureIds'].forEach(function (field) {
      value[field] = Array.isArray(value[field]) ? value[field] : [];
    });
    return value;
  }
  function remember(list, id) {
    if (list.indexOf(id) < 0) { list.push(id); list.sort(); }
  }
  function roll(key) {
    return parseInt(U.fnv1a([
      'guard-sites-v1', Game.state.world.worldSeed, regionId,
      layout && layout.version, expeditionIndex(regionId), key
    ].join(':')), 16) / 0xffffffff;
  }
  function profileFor(site) {
    return Game.content.get('guardSiteProfile', site.profileId);
  }
  function lookupTarget(target) {
    return byTarget[typeof target === 'string' ? target : target && target.id] || null;
  }
  function readonlySite(site) {
    return site ? C.deepFreeze(C.clone(site)) : null;
  }
  function regionalPools() {
    var region = Game.content.get('regionProfile', regionId);
    return region && region.encounterPoolIds || {};
  }
  function modeForOrdinal(index, count, key) {
    if (count > 1) return index % 2 ? 'ambush' : 'visible';
    return roll(key) < 0.5 ? 'visible' : 'ambush';
  }
  function buildSites() {
    var result = [], resourceProfileId = 'guard-site.' + regionId + '.resource';
    var resourceProfile = Game.content.get('guardSiteProfile', resourceProfileId);
    var nodes = (layout.nodes || []).slice().sort(function (a, b) {
      return roll('node:' + a.id) - roll('node:' + b.id) || a.id.localeCompare(b.id);
    });
    var count = Math.round(nodes.length * (resourceProfile ? resourceProfile.coverage : 0.3));
    nodes.slice(0, count).forEach(function (node, index) {
      var angle = roll('offset:' + node.id) * Math.PI * 2;
      result.push({
        kind: 'guardSite', id: regionId + ':resource-guard:' + node.id.split(':').pop() + ':' + index,
        targetKind: 'resource', targetId: node.id,
        mode: modeForOrdinal(index, count, node.id),
        x: node.x + Math.cos(angle) * 30, y: node.y + Math.sin(angle) * 22,
        profileId: resourceProfileId
      });
    });
    var fixedSites = (layout.guardSites || []).map(function (site) { return C.clone(site); });
    var nestSites = fixedSites.filter(function (site) { return site.targetKind === 'nestTreasure'; })
      .sort(function (a, b) { return a.id.localeCompare(b.id); });
    var nestFlip = roll('nest-mode-order') < 0.5 ? 0 : 1;
    nestSites.forEach(function (site, index) {
      site.mode = nestSites.length > 1
        ? ((index + nestFlip) % 2 ? 'ambush' : 'visible')
        : (roll('nest-mode:' + site.id) < 0.5 ? 'visible' : 'ambush');
    });
    fixedSites.forEach(function (site) { result.push(site); });
    return result;
  }
  function ambushHazardProfileId() {
    var region = Game.content.get('regionProfile', regionId);
    var ids = region && region.hazardProfileIds || [];
    for (var i = 0; i < ids.length; i++) {
      var profile = Game.content.get('hazardProfile', ids[i]);
      if (profile && profile.category === 'ambushTrigger') return profile.id;
    }
    return null;
  }
  function unregisterHazard(site) {
    if (site.hazardInstanceId && Game.hazards) Game.hazards.unregisterDynamic(site.hazardInstanceId);
    site.hazardInstanceId = null;
  }
  function registerHazard(site) {
    if (site.state !== 'concealed' || !Game.hazards || !Game.hazards.registerDynamic) return;
    var profileId = ambushHazardProfileId();
    if (!profileId) return;
    site.hazardInstanceId = 'guard-hazard:' + site.id;
    Game.hazards.registerDynamic(profileId, {
      id: site.hazardInstanceId, x: site.x, y: site.y,
      detectionRoll: roll('detect:' + site.id),
      onReveal: function () { reveal(site, 'detected'); },
      onTrigger: function () { return trigger(site.id, { reason: 'ambush' }); }
    });
  }
  function poolIdFor(site) {
    var profile = profileFor(site), pools = regionalPools();
    if (profile) return site.mode === 'ambush' ? profile.ambushPoolId : profile.visiblePoolId;
    if (site.targetKind === 'bossGate') return pools.bossGate;
    if (site.targetKind === 'nestTreasure') return site.mode === 'ambush' ? pools.nestGuardAmbush : pools.nestGuardVisible;
    return site.mode === 'ambush' ? pools.resourceGuardAmbush : pools.resourceGuardVisible;
  }
  function materialize(site) {
    if (site.actorIds.length) {
      var active = site.actorIds.map(Game.actors.get).filter(function (actor) {
        return actor && !actor.dead && actor.hp > 0;
      });
      if (active.length) return { ok: true, actors: active, primary: active[0] };
      site.actorIds = [];
    }
    var poolId = poolIdFor(site);
    var resolution = Game.encounterPools.resolve(poolId, {
      regionId: regionId, layoutVersion: layout.version,
      expeditionIndex: expeditionIndex(regionId), siteId: site.id
    });
    if (!resolution) return { ok: false, reason: 'pool-unresolved' };
    var result = Game.population.materialize(resolution.worldSpawnProfileId, {
      regionId: regionId, populationId: 'population.' + regionId,
      layoutSlotKey: site.id, spawnRequestKey: [regionId, 'guard', expeditionIndex(regionId), site.id].join(':'),
      x: site.x, y: site.y, tier: Game.State.regionTier(regionId),
      expeditionIndex: expeditionIndex(regionId), siteId: site.id
    });
    if (!result || !result.ok) return result || { ok: false, reason: 'materialize-failed' };
    site.spawnId = result.lease.spawnId;
    site.actorIds = result.actors.map(function (actor) {
      actor.guardSiteId = site.id;
      actor.guardian = site.targetKind === 'bossGate';
      actor.territory = { id: site.id, x: site.x, y: site.y,
        radius: site.targetKind === 'bossGate' ? 168 : 118 };
      actor.packAnchorX = site.x; actor.packAnchorY = site.y;
      actor.packLeashRadius = site.targetKind === 'bossGate' ? 190 :
        (site.targetKind === 'nestTreasure' ? 164 : 144);
      var rewardScale = site.targetKind === 'bossGate' ? 2.2 :
        (site.targetKind === 'nestTreasure' ? 1.5 : 1.15);
      actor.guardRewardMultiplier = rewardScale;
      actor.exp = Math.round(actor.exp * rewardScale);
      actor.gold = Math.round(actor.gold * rewardScale);
      if (Game.world) Game.world.attachActor(actor, 'guard-site');
      return actor.id;
    });
    return result;
  }
  function reveal(site, reason) {
    if (!site || site.state === 'cleared') return false;
    unregisterHazard(site);
    site.state = 'revealed';
    remember(saved(regionId).revealedIds, site.id);
    var result = materialize(site);
    if (!result || !result.ok) { site.rearmAt = Game.state.world.worldTime + 1; return false; }
    Game.bus.emit('guardSite:revealed', { regionId: regionId, siteId: site.id,
      targetId: site.targetId, targetKind: site.targetKind, mode: site.mode,
      reason: reason || 'visible' });
    return true;
  }
  function trigger(siteId, options) {
    var site = byId[siteId];
    if (!site || site.state === 'cleared' || site.state === 'engaged') return !!site && site.state === 'cleared';
    options = options || {};
    var profile = profileFor(site);
    var triggerRadius = profile && profile.triggerRadius || 42;
    if (!options.force && Game.world && Game.world.hero &&
        U.dist(Game.world.hero.x, Game.world.hero.y, site.x, site.y) > triggerRadius) {
      return false;
    }
    if (Game.world && Game.world.hero) {
      site.resumeTargetId = options.targetId || site.targetId;
      Game.world.cancelInteraction('guard-site');
      Game.world.hero.moveOrder = null; Game.world.hero.target = null;
      if (Game.nav) Game.nav.clear(Game.world.hero);
    }
    if (Game.expeditionAI && Game.expeditionAI.pause) Game.expeditionAI.pause('guard-submit');
    if (site.state === 'concealed' && !reveal(site, options.reason || 'ambush')) return false;
    var result = materialize(site);
    if (!result || !result.ok || !result.primary) return false;
    result.actors.forEach(function (actor) { actor.hazardConcealed = false; actor.hidden = false; });
    var encounter = Game.world && Game.world.startEncounter(result.primary, {
      reason: 'guard-site', guardSiteCommit: true
    });
    if (!encounter) {
      site.state = 'revealed'; site.rearmAt = Game.state.world.worldTime + 0.5;
      return false;
    }
    site.state = 'engaged'; site.encounterId = encounter.id;
    encounter.context.guardSiteId = site.id;
    Game.bus.emit('guardSite:engaged', { regionId: regionId, siteId: site.id,
      targetId: site.targetId, targetKind: site.targetKind, mode: site.mode,
      encounterId: encounter.id });
    return true;
  }
  function clearSite(site, reason) {
    if (!site || site.state === 'cleared') return false;
    unregisterHazard(site);
    site.state = 'cleared'; site.encounterId = null; site.rearmAt = 0;
    pendingResumeTargetId = site.resumeTargetId || null;
    remember(saved(regionId).clearedIds, site.id);
    if (site.targetKind === 'bossGate' && Game.collection) {
      Game.collection.record('guardian', site.id, { rid: regionId, entity: site });
    }
    Game.bus.emit('guardSite:cleared', { regionId: regionId, siteId: site.id,
      targetId: site.targetId, targetKind: site.targetKind, mode: site.mode,
      reason: reason || 'defeated',
      resumeTargetId: site.resumeTargetId || null });
    return true;
  }
  function initialize(rid, nextLayout) {
    regionId = rid; layout = nextLayout; sites = []; byId = {}; byTarget = {};
    pendingResumeTargetId = null;
    if (!layout || layout.version < 4) return [];
    var state = saved(rid);
    sites = buildSites();
    var validIds = {};
    sites.forEach(function (site) {
      site.actorIds = []; site.spawnId = null; site.encounterId = null;
      site.resumeTargetId = null; site.rearmAt = 0; site.hazardInstanceId = null;
      site.state = state.clearedIds.indexOf(site.id) >= 0 ? 'cleared' :
        (site.mode === 'ambush' && state.revealedIds.indexOf(site.id) < 0 ? 'concealed' : 'revealed');
      byId[site.id] = site; byTarget[site.targetId] = site; validIds[site.id] = true;
    });
    state.revealedIds = state.revealedIds.filter(function (id) { return validIds[id]; });
    state.clearedIds = state.clearedIds.filter(function (id) { return validIds[id]; });
    var treasureIds = {};
    (layout.treasureSites || []).forEach(function (treasure) { treasureIds[treasure.id] = true; });
    state.claimedTreasureIds = state.claimedTreasureIds.filter(function (id) { return treasureIds[id]; });
    sites.forEach(function (site) {
      if (site.state === 'revealed') reveal(site, 'region-init');
      else if (site.state === 'concealed') registerHazard(site);
    });
    Game.bus.emit('guardSites:regionReady', { regionId: rid, expeditionIndex: expeditionIndex(rid), count: sites.length });
    return sites;
  }

  var G = Game.guardSites = {
    initRegion: initialize,
    preview: function (rid, nextLayout) {
      var previousRegion = regionId, previousLayout = layout;
      regionId = rid; layout = nextLayout;
      var result = buildSites().map(function (site) { return C.clone(site); });
      regionId = previousRegion; layout = previousLayout;
      return C.deepFreeze(result);
    },
    contract: C.deepFreeze({
      states: ['inactive', 'concealed', 'revealed', 'engaged', 'cleared'],
      treasureStates: ['locked', 'available', 'claimed'],
      victory: ['engaged', 'cleared'],
      retreat: ['engaged', 'revealed'],
      reloadTransientPolicy: 'drop-actor-encounter-lease',
      offlinePolicy: 'block'
    }),
    snapshot: function () {
      return C.deepFreeze(C.clone(sites.filter(function (site) {
        return site.state !== 'concealed';
      }).map(function (site) {
        return { id: site.id, targetId: site.targetId, targetKind: site.targetKind,
          mode: site.mode, state: site.state, x: site.x, y: site.y,
          revealed: site.state !== 'concealed', cleared: site.state === 'cleared' };
      })));
    },
    forTarget: function (target) { return readonlySite(lookupTarget(target)); },
    canInteract: function (target) {
      var site = lookupTarget(target);
      return !site || site.state === 'cleared';
    },
    trigger: function (siteOrId, options) { return trigger(typeof siteOrId === 'string' ? siteOrId : siteOrId && siteOrId.id, options); },
    reveal: function (siteOrId, reason) {
      return reveal(byId[typeof siteOrId === 'string' ? siteOrId : siteOrId && siteOrId.id], reason);
    },
    triggerRadius: function (siteOrId) {
      var site = typeof siteOrId === 'string' ? byId[siteOrId] : siteOrId;
      var profile = site && profileFor(site);
      return profile && profile.triggerRadius || 42;
    },
    isBossGateCleared: function () {
      var site = sites.filter(function (candidate) { return candidate.targetKind === 'bossGate'; })[0];
      return !site || site.state === 'cleared';
    },
    autoThreshold: function (targetKind) {
      var strategy = Game.state.settings.expeditionStrategy || 'balanced';
      return (HEALTH[strategy] || HEALTH.balanced)[targetKind] || 0;
    },
    autoEligible: function (siteOrTarget) {
      var site = siteOrTarget && siteOrTarget.targetKind ? siteOrTarget : lookupTarget(siteOrTarget);
      if (!site || site.state === 'cleared') return true;
      if (site.state === 'concealed') return true;
      return Game.player.hpPct() >= G.autoThreshold(site.targetKind);
    },
    blocksOffline: function (target) { var site = lookupTarget(target); return !!site && site.state !== 'cleared'; },
    claimedTreasure: function (id) { return saved(regionId).claimedTreasureIds.indexOf(id) >= 0; },
    markTreasureClaimed: function (id) { remember(saved(regionId).claimedTreasureIds, id); },
    peekResumeTargetId: function () { return pendingResumeTargetId; },
    consumeResumeTargetId: function () {
      var id = pendingResumeTargetId; pendingResumeTargetId = null; return id;
    },
    update: function () {
      if (!regionId || !layout || layout.version < 4) return;
      sites.forEach(function (site) {
        if (!site.rearmAt || Game.state.world.worldTime < site.rearmAt || site.state === 'cleared') return;
        site.rearmAt = 0;
        if (site.state === 'concealed') registerHazard(site); else materialize(site);
      });
    },
    resetExpedition: function (rid) {
      rid = rid || regionId;
      delete root().regions[rid];
      if (rid === regionId && Game.world && Game.world.layout) return initialize(rid, Game.world.layout);
      return true;
    },
    reset: function () { regionId = null; layout = null; sites = []; byId = {}; byTarget = {}; pendingResumeTargetId = null; }
  };

  Game.bus.on('actor:defeated', function (event) {
    var ids = event && event.targetActorIds || [];
    ids.forEach(function (id) {
      var actor = Game.actors && Game.actors.get(id), site = actor && byId[actor.guardSiteId];
      if (!site || site.state === 'cleared') return;
      var alive = site.actorIds.some(function (actorId) {
        var member = Game.actors.get(actorId);
        return member && !member.dead && member.hp > 0;
      });
      if (!alive) clearSite(site, 'victory');
    });
  });
  Game.bus.on('encounter:ended', function (event) {
    var encounterId = event && event.encounterId;
    sites.forEach(function (site) {
      if (site.encounterId !== encounterId || site.state === 'cleared') return;
      site.encounterId = null; site.state = 'revealed';
      if (site.spawnId) Game.population.close(site.spawnId, 'guard-reset', { despawn: true });
      site.actorIds = []; site.spawnId = null; site.rearmAt = Game.state.world.worldTime + 2;
    });
  });
  Game.bus.on('expedition:started', function (event) {
    if (event && event.rid === regionId && layout && layout.version >= 4) initialize(regionId, layout);
  });
})();
