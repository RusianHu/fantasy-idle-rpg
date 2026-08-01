/* Compiled Population materialization, stable Spawn identity, and leases. */
(function () {
  'use strict';
  var Game = window.Game;
  var C = Game.contentCompiler;
  var leases = {};
  var generations = {};
  var sessionRequests = {};
  var regionId = null;
  var activePlan = null;
  var slotRuntime = {};
  var respawnSchedules = [];
  var channelOrder = ['boss', 'guardian', 'npc', 'rare', 'regular'];

  function populationFor(rid) {
    var region = Game.content.get('regionProfile', rid);
    return region && Game.content.populationView(region.populationProfileId);
  }

  function conditionAllows(entry, view, tier) {
    var condition = entry.condition || {};
    if (condition.minTier !== undefined && tier < condition.minTier) return false;
    if (condition.maxTier !== undefined && tier > condition.maxTier) return false;
    var flags = condition.flags || {};
    return Object.keys(flags).every(function (flag) {
      return !!view.flags[flag] === !!flags[flag];
    });
  }

  function weightedPick(entries, counts, seed) {
    var eligible = entries.filter(function (entry) {
      return entry.mode === 'weighted' && (!entry.maxCount || (counts[entry.profileId] || 0) < entry.maxCount);
    });
    var total = eligible.reduce(function (sum, entry) { return sum + entry.weight; }, 0);
    if (!total) return null;
    var roll = seed % total;
    for (var i = 0; i < eligible.length; i++) {
      roll -= eligible[i].weight;
      if (roll < 0) return eligible[i];
    }
    return eligible[0] || null;
  }

  function allocate(view, channel, slotCount, context) {
    var config = view.channels[channel];
    if (!config) return [];
    var tier = context.tier || 1;
    var entries = config.spawnRefs.filter(function (entry) { return conditionAllows(entry, view, tier); });
    var limit = Math.min(config.capacity, slotCount);
    var output = [];
    var counts = {};
    var required = entries.filter(function (entry) {
      return entry.mode === 'required';
    }).sort(function (a, b) {
      return (b.priority || 0) - (a.priority || 0) ||
        a.profileId.localeCompare(b.profileId);
    });
    required.forEach(function (entry, requiredIndex) {
      var min = Array.isArray(entry.count) ? entry.count[0] : entry.count;
      var max = Array.isArray(entry.count) ? entry.count[1] : entry.count;
      var remainingMinimum = required.slice(requiredIndex + 1).reduce(function (sum, next) {
        return sum + (Array.isArray(next.count) ? next.count[0] : next.count);
      }, 0);
      var available = Math.max(0, limit - output.length - remainingMinimum);
      var extra = Math.max(0, Math.min((max | 0) - (min | 0), available - (min | 0)));
      var amount = Math.max(1, min | 0);
      if (extra) {
        amount += Game.util.strSeed([
          context.worldSeed, view.regionId, context.layoutVersion, view.id,
          entry.profileId, 'required-count'
        ].join('|')) % (extra + 1);
      }
      for (var r = 0; r < amount && output.length < limit; r++) {
        output.push(entry.profileId);
        counts[entry.profileId] = (counts[entry.profileId] || 0) + 1;
      }
    });
    while (output.length < limit) {
      var ordinal = output.length;
      var seed = Game.util.strSeed([
        context.worldSeed, view.regionId, context.layoutVersion, view.id,
        view.sourceFingerprint, channel, ordinal, context.expeditionIndex || 0
      ].join('|'));
      var selected = weightedPick(entries, counts, seed);
      if (!selected) break;
      output.push(selected.profileId);
      counts[selected.profileId] = (counts[selected.profileId] || 0) + 1;
    }
    return output;
  }

  function ambushProfileForThreat(view, rid, threat, currentProfile, counts, context) {
    if (!threat || threat.defId !== 'ambush') return currentProfile;
    var hazard = Game.content.all('hazardProfile').filter(function (profile) {
      return profile.regionId === rid && profile.category === 'ambushTrigger';
    })[0];
    var allowed = hazard && hazard.outcome && hazard.outcome.encounterPackIds || [];
    function compatible(profile) {
      var pack = profile && Game.content.get('encounterPack', profile.encounterPackId);
      return !!pack && pack.ambushEligible === true && (pack.members || []).length <= 2 &&
        allowed.indexOf(pack.id) >= 0;
    }
    if (compatible(currentProfile)) return currentProfile;
    var config = view.channels.regular;
    var entries = config.spawnRefs.filter(function (entry) {
      if (!conditionAllows(entry, view, context.tier || 1)) return false;
      if (entry.maxCount && (counts[entry.profileId] || 0) >= entry.maxCount) return false;
      return compatible(Game.content.get('worldSpawnProfile', entry.profileId));
    });
    var total = entries.reduce(function (sum, entry) {
      return sum + (entry.mode === 'weighted' ? entry.weight : 1);
    }, 0);
    if (!total) return null;
    var roll = Game.util.strSeed([
      context.worldSeed, rid, context.layoutVersion, view.id,
      threat.id, context.expeditionIndex || 0, 'ambush-pack'
    ].join('|')) % total;
    for (var index = 0; index < entries.length; index++) {
      roll -= entries[index].mode === 'weighted' ? entries[index].weight : 1;
      if (roll < 0) return Game.content.get('worldSpawnProfile', entries[index].profileId);
    }
    return Game.content.get('worldSpawnProfile', entries[0].profileId);
  }

  function stableSpawnId(profile, context) {
    var scope = profile.identity.scope;
    if (scope === 'worldStable') return 'world:' + profile.identity.persistentKey;
    if (scope === 'regionStable') {
      return [context.regionId, context.populationId, profile.id, context.layoutSlotKey].join(':');
    }
    if (!context.spawnRequestKey) throw new Error('[Population] ephemeral spawnRequestKey required');
    var key = 'session:' + profile.id + ':' + context.spawnRequestKey;
    if (sessionRequests[key]) throw new Error('[Population] duplicate spawnRequestKey: ' + key);
    return key;
  }

  function rewardValue(value, tier) {
    if (typeof value === 'number') return value;
    return (Number(value && value.base) || 0) *
      Math.pow(Number(value && value.tierScale) || 1, tier - 1);
  }

  function scaledValue(value, tier) {
    if (typeof value === 'number') return value;
    return (Number(value && value.base) || 0) *
      Math.pow(Number(value && value.tierScale) || 1, tier - 1);
  }

  function summarizePack(packId, tier) {
    var pack = Game.content.get('encounterPack', packId);
    if (!pack) return null;
    var totals = { hp: 0, armor: 0, power: 0, speed: 0, exp: 0, gold: 0 };
    var count = 0;
    (pack.members || []).forEach(function (member) {
      var blueprint = Game.content.compileBlueprint({
        archetypeId: member.archetypeId, variantId: member.variantId || null
      });
      var stats = Game.content.get('statProfile', blueprint.resolvedProfiles.statProfileId);
      var reward = Game.content.get('rewardProfile', blueprint.resolvedProfiles.rewardProfileId);
      if (!stats) return;
      var values = stats.stats || {};
      totals.hp += scaledValue(values.maxHp, tier);
      totals.armor += scaledValue(values.armor, tier);
      totals.power += Math.max(
        scaledValue(values.physicalPower, tier), scaledValue(values.magicPower, tier)
      );
      totals.speed += Math.max(0.1, scaledValue(values.autoAttackSpeed, tier) || 1);
      totals.exp += rewardValue(reward && reward.exp, tier);
      totals.gold += rewardValue(reward && reward.gold, tier);
      count++;
    });
    if (!count) return null;
    return {
      packId: pack.id, memberCount: count,
      hp: totals.hp / count, armor: totals.armor / count,
      power: totals.power / count, speed: totals.speed / count,
      exp: totals.exp / count, gold: totals.gold / count
    };
  }

  function actorSpec(profile, member, context, generation, spawnId, index) {
    var archetype = Game.content.get('actorArchetype', member.archetypeId);
    var variantId = member.variantId || null;
    var saved = Game.state && Game.state.world && Game.state.world.social &&
      Game.state.world.social.spawnVariants && Game.state.world.social.spawnVariants[spawnId];
    if (saved && Game.content.has('actorVariant', saved)) variantId = saved;
    return {
      instanceId: 'spawn:' + Game.util.fnv1a(spawnId) + ':' + generation + ':' + member.slotId,
      archetypeId: member.archetypeId,
      variantId: variantId,
      level: Math.max(1, Game.state && Game.state.player && Game.state.player.level || 1),
      tier: context.tier,
      factionId: archetype.defaultFactionId,
      controllerId: 'ai:monster',
      modifiers: C.clone(context.modifiers || []),
      transform: { x: context.x, y: context.y, direction: 'l' },
      spawnSource: {
        kind: 'worldPopulation', sourceId: profile.id, sequence: index,
        spawnId: spawnId, generation: generation, memberSlotId: member.slotId
      }
    };
  }

  function decorate(actor, profile, pack, member, context, lease) {
    var reward = Game.content.get('rewardProfile', actor.blueprint.resolvedProfiles.rewardProfileId);
    actor.spawnId = lease.spawnId;
    actor.groupId = lease.groupId;
    actor.socialGroupId = profile.identity.socialGroupId || null;
    actor.spawnGeneration = lease.generation;
    actor.memberSlotId = member.slotId;
    actor.worldSpawnProfileId = profile.id;
    actor.layoutSlotKey = context.layoutSlotKey;
    actor.x = context.x; actor.y = context.y;
    actor.spawnX = context.x; actor.spawnY = context.y;
    actor.packId = pack && pack.id || null;
    actor.packAnchorId = lease.groupId;
    // pack 共享同一个 lease 锚点；成员自身 spawnX/Y 仍保留阵型偏移。
    // 否则由不同成员发现玩家时会生成不同 leash zone。
    actor.packAnchorX = Number.isFinite(lease.context.x) ? lease.context.x : context.x;
    actor.packAnchorY = Number.isFinite(lease.context.y) ? lease.context.y : context.y;
    actor.packLeashRadius = pack && pack.leashRadius || 0;
    actor.packPrimary = context.memberIndex === 0;
    actor.rewardScale = (pack && pack.rewardBudget || 1) / Math.max(1, pack && pack.members.length || 1);
    actor.rewardAuthorized = !!(Game.content.get('engagementPolicy', actor.blueprint.resolvedProfiles.engagementPolicyId) || {}).rewardEligible;
    actor.exp = Math.round(rewardValue(reward && reward.exp, context.tier) * actor.rewardScale * (context.rewardMultiplier || 1));
    actor.gold = Math.round(rewardValue(reward && reward.gold, context.tier) * actor.rewardScale);
    actor.state = actor.components.vitals ? 'wander' : 'idle';
    actor.animT = (Game.util.strSeed(actor.id) % 300) / 1000;
    actor.wanderT = 0.5 + (Game.util.strSeed(actor.id + ':wander') % 1500) / 1000;
    actor.spriteH = Game.assets.sprite(actor.sprite).h;
    actor.threatId = context.threat && context.threat.id || null;
    actor.territory = context.threat || null;
    actor.affix = context.affix || null;
    return actor;
  }

  function materialize(profileId, context) {
    var profile = Game.content.get('worldSpawnProfile', profileId);
    if (!profile) return { ok: false, reason: 'missing-profile' };
    context = context || {};
    var spawnId;
    try {
      spawnId = stableSpawnId(profile, context);
    } catch (identityError) {
      return { ok: false, reason: 'invalid-identity', error: identityError };
    }
    if (leases[spawnId] && ['active', 'materializing'].indexOf(leases[spawnId].state) >= 0) {
      return { ok: false, reason: 'lease-active', lease: leases[spawnId] };
    }
    if (!Number.isFinite(context.x) || !Number.isFinite(context.y)) {
      return { ok: false, reason: 'placement-failed' };
    }
    var generation = ((generations[spawnId] || 0) + 1) >>> 0;
    var lease = {
      spawnId: spawnId, groupId: spawnId + ':group', generation: generation,
      profileId: profile.id, layoutSlotKey: context.layoutSlotKey,
      slotId: context.planSlotId || null,
      actorIds: [], state: 'materializing',
      context: C.clone({
        regionId: context.regionId, populationId: context.populationId,
        layoutSlotKey: context.layoutSlotKey, spawnRequestKey: context.spawnRequestKey,
        x: context.x, y: context.y, threat: context.threat || null,
        tier: context.tier, modifiers: context.modifiers || [],
        affix: context.affix || null, rewardMultiplier: context.rewardMultiplier || 1,
        planSlotId: context.planSlotId || null
      })
    };
    leases[spawnId] = lease;
    var pack = profile.encounterPackId && Game.content.get('encounterPack', profile.encounterPackId);
    var members = pack ? pack.members : [{
      slotId: 'actor', archetypeId: profile.actorRef.archetypeId,
      variantId: profile.actorRef.variantId || null
    }];
    var actors = [];
    try {
      members.forEach(function (member, index) {
        var spacing = pack && pack.formation && pack.formation.spacing || 0;
        var angle = members.length === 1 ? 0 : Math.PI * 2 * index / members.length;
        var memberContext = C.merge(C.clone(context), {
          x: context.x + Math.cos(angle) * (index ? spacing : 0),
          y: context.y + Math.sin(angle) * (index ? spacing * 0.65 : 0),
          memberIndex: index
        });
        var actor = Game.actors.spawn(actorSpec(profile, member, memberContext, generation, spawnId, index));
        decorate(actor, profile, pack, member, memberContext, lease);
        actors.push(actor);
        lease.actorIds.push(actor.id);
      });
      actors.forEach(function (actor) { actor.packMemberIds = lease.actorIds.slice(); });
      lease.state = 'active';
      generations[spawnId] = generation;
      if (profile.identity.scope === 'ephemeral') sessionRequests[spawnId] = true;
      return { ok: true, lease: lease, actors: actors, primary: actors[0] || null };
    } catch (error) {
      actors.forEach(function (actor) { Game.actors.despawn(actor.id, 'materialize-rollback'); });
      delete leases[spawnId];
      return { ok: false, reason: 'materialize-failed', error: error };
    }
  }

  function defaultSlots(channel, layout) {
    if (channel === 'boss') {
      var bossAnchor = layout.bossSpawnPoint || layout.bossPoint;
      return bossAnchor ? [{ key: 'boss', x: bossAnchor.x, y: bossAnchor.y }] : [];
    }
    if (channel === 'guardian') return layout.guardian ? [{
      key: layout.guardian.id || (regionId + ':guardian'), x: layout.guardian.x,
      y: layout.guardian.y, threat: layout.guardian
    }] : [];
    if (channel === 'regular' && layout.version >= 3) return (layout.threats || []).map(function (entry) {
      return { key: entry.id, x: entry.x, y: entry.y, threat: entry };
    });
    var candidates = layout.spawnCandidates || [];
    return candidates.map(function (entry, index) {
      return { key: 'candidate:' + index, x: entry.x, y: entry.y, threat: entry };
    });
  }

  function pointFrom(entry, key, kind) {
    return entry && Number.isFinite(entry.x) && Number.isFinite(entry.y) ? {
      key: key, x: entry.x, y: entry.y, threat: kind === 'threat' || kind === 'guardian' ? entry : null,
      sourceKind: kind, sourceId: entry.id || null
    } : null;
  }

  function candidatePool(profile, layout, channel, context) {
    var placement = profile.placement || {};
    var source = placement.source;
    var points = [];
    if (placement.selector === 'anchor') {
      var anchor = source === 'summoner' ? context.origin : layout[source];
      if (!anchor && source === 'bossSpawnPoint') anchor = layout.bossPoint;
      var fixed = pointFrom(anchor, source === 'summoner' ? context.originKey || 'origin' : source, 'anchor');
      if (fixed) points.push(fixed);
    } else if (placement.selector === 'layoutEntity') {
      var list;
      if (source === 'guardian') list = layout.guardian ? [layout.guardian] : [];
      else if (source === 'threat') list = layout.threats || [];
      else if (source === 'landmark') list = layout.landmarks || [];
      else if (source === 'ecology') list = layout.ecology || [];
      else list = [];
      if (source === 'threat' && !list.length) list = layout.spawnCandidates || [];
      list.filter(function (entry) {
        return (!placement.id || entry.id === placement.id) &&
          (!placement.tag || (entry.tags || []).indexOf(placement.tag) >= 0);
      }).forEach(function (entry, index) {
        points.push(pointFrom(entry, entry.id || (source === 'threat' && !layout.threats ?
          'candidate:' + index : source + ':' + index), source));
      });
    } else if (placement.selector === 'candidate') {
      var candidates = [];
      if (source === 'walkableNav') {
        var nav = layout.nav || {};
        (nav.grid || []).forEach(function (row, y) {
          row.forEach(function (walkable, x) {
            if (walkable) candidates.push({
              x: x * nav.cell + nav.cell / 2,
              y: y * nav.cell + nav.cell / 2,
              navX: x, navY: y
            });
          });
        });
      } else candidates = layout[source] || [];
      candidates.forEach(function (entry, index) {
        var prefix = source === 'corridorCandidates' ? 'corridor' :
          (source === 'walkableNav' ? 'nav:' + entry.navX + ':' + entry.navY : 'candidate');
        points.push(pointFrom(entry, source === 'walkableNav' ? prefix : prefix + ':' + index, 'candidate'));
      });
      if (channel === 'npc') points.reverse();
    }
    return points.filter(Boolean);
  }

  function navValue(layout, point, field, fallback) {
    var nav = layout.nav || {};
    if (!nav.grid || !nav.cell) return fallback;
    var x = Math.floor(point.x / nav.cell);
    var y = Math.floor(point.y / nav.cell);
    if (!nav.grid[y] || !nav.grid[y][x]) return field === 'walkable' ? false : fallback;
    if (field === 'walkable') return true;
    return nav[field] && nav[field][y] && nav[field][y][x] !== undefined
      ? nav[field][y][x] : fallback;
  }

  function inspectPlacement(profile, point, layout, reservations) {
    var placement = profile.placement || {};
    var offset = placement.offset || {};
    reservations = reservations || [];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return {
        ok: false,
        profileId: profile.id,
        point: point || null,
        candidate: null,
        checks: [],
        failures: ['invalid-point']
      };
    }
    var candidate = Object.assign({}, point, {
      x: point.x + (Number(offset.x) || 0),
      y: point.y + (Number(offset.y) || 0)
    });
    var clearance = navValue(layout, candidate, 'distance', Infinity);
    var clearancePx = clearance * ((layout.nav && layout.nav.cell) || 1);
    var danger = navValue(layout, candidate, 'danger', 0);
    var campDistance = layout.camp
      ? Game.util.dist(candidate.x, candidate.y, layout.camp.x, layout.camp.y)
      : Infinity;
    var radius = Number(placement.occupancyRadius) || 0;
    var overlap = reservations.filter(function (reservation) {
      return Game.util.dist(candidate.x, candidate.y, reservation.x, reservation.y) <
        radius + reservation.occupancyRadius;
    }).map(function (reservation) {
      return reservation.slotId || reservation.id || null;
    });
    var checks = [
      {
        id: 'walkable',
        enforced: false,
        pass: navValue(layout, candidate, 'walkable', true) !== false,
        actual: navValue(layout, candidate, 'walkable', true),
        expected: true
      },
      {
        id: 'minClearance',
        enforced: Number.isFinite(placement.minClearance),
        pass: !Number.isFinite(placement.minClearance) || clearancePx >= placement.minClearance,
        actual: clearancePx,
        expected: Number.isFinite(placement.minClearance) ? placement.minClearance : null
      },
      {
        id: 'maxDanger',
        enforced: Number.isFinite(placement.maxDanger),
        pass: !Number.isFinite(placement.maxDanger) || danger <= placement.maxDanger,
        actual: danger,
        expected: Number.isFinite(placement.maxDanger) ? placement.maxDanger : null
      },
      {
        id: 'minCampDistance',
        enforced: Number.isFinite(placement.minCampDistance) && !!layout.camp,
        pass: !Number.isFinite(placement.minCampDistance) || !layout.camp ||
          campDistance >= placement.minCampDistance,
        actual: campDistance,
        expected: Number.isFinite(placement.minCampDistance) ? placement.minCampDistance : null
      },
      {
        id: 'occupancy',
        enforced: true,
        pass: overlap.length === 0,
        actual: overlap,
        expected: []
      }
    ];
    var failures = checks.filter(function (check) {
      return check.enforced && !check.pass;
    }).map(function (check) { return check.id; });
    candidate.occupancyRadius = radius;
    candidate.danger = danger;
    candidate.clearance = clearancePx;
    candidate.campDistance = campDistance;
    return {
      ok: failures.length === 0,
      profileId: profile.id,
      point: C.clone(point),
      candidate: candidate,
      checks: checks,
      failures: failures
    };
  }

  function legalPlacement(profile, point, layout, reservations) {
    var inspection = inspectPlacement(profile, point, layout, reservations);
    return inspection.ok ? inspection.candidate : null;
  }

  function prepareRegion(rid, layout, context) {
    context = context || {};
    var view = populationFor(rid);
    if (!view || !layout) return C.deepFreeze({
      ok: false, regionId: rid, reason: 'missing-population-or-layout', slots: [], failures: []
    });
    var reservations = [];
    var slots = [];
    var failures = [];
    channelOrder.forEach(function (channel) {
      var config = view.channels[channel];
      if (!config || !config.capacity) return;
      var limit = context.channelLimits && context.channelLimits[channel];
      if (!Number.isInteger(limit)) limit = config.capacity;
      var profileIds = allocate(view, channel, Math.max(0, limit), {
        tier: context.tier || 1,
        worldSeed: context.worldSeed || 0,
        layoutVersion: layout.version,
        expeditionIndex: context.expeditionIndex || 0
      });
      var profileCounts = {};
      profileIds.forEach(function (selectedProfileId, selectionOrdinal) {
        var profileId = selectedProfileId;
        var profile = Game.content.get('worldSpawnProfile', profileId);
        if (!profile) return;
        var pool = candidatePool(profile, layout, channel, context);
        var chosen = null;
        for (var candidateIndex = 0; candidateIndex < pool.length && !chosen; candidateIndex++) {
          chosen = legalPlacement(profile, pool[candidateIndex], layout, reservations);
        }
        if (!chosen) {
          failures.push({
            channel: channel, profileId: profileId, ordinal: profileCounts[profileId] || 0,
            required: !!profile.placement.required,
            reason: 'placement-failed', onFailure: profile.placement.onFailure
          });
          return;
        }
        if (channel === 'regular' && chosen.threat && chosen.threat.defId === 'ambush') {
          var ambushProfile = ambushProfileForThreat(view, rid, chosen.threat, profile, profileCounts, {
            tier: context.tier || 1,
            worldSeed: context.worldSeed || 0,
            layoutVersion: layout.version,
            expeditionIndex: context.expeditionIndex || 0
          });
          if (!ambushProfile) {
            failures.push({
              channel: channel, profileId: profileId, ordinal: 0,
              required: false, reason: 'ambush-pack-unavailable', onFailure: 'skipOptional'
            });
            return;
          }
          profile = ambushProfile;
          profileId = profile.id;
          chosen = legalPlacement(profile, chosen, layout, reservations);
          if (!chosen) {
            failures.push({
              channel: channel, profileId: profileId, ordinal: 0,
              required: !!profile.placement.required,
              reason: 'ambush-placement-failed', onFailure: profile.placement.onFailure
            });
            return;
          }
        }
        var ordinal = profileCounts[profileId] || 0;
        profileCounts[profileId] = ordinal + 1;
        var slotId = [channel, profileId, ordinal].join(':');
        var slot = {
          id: slotId, channel: channel, profileId: profileId,
          selectionOrdinal: selectionOrdinal, profileOrdinal: ordinal,
          layoutSlotKey: chosen.key, x: chosen.x, y: chosen.y,
          threat: chosen.threat || null, sourceKind: chosen.sourceKind,
          sourceId: chosen.sourceId, occupancyRadius: chosen.occupancyRadius,
          activation: profile.lifecycle.activation,
          required: !!profile.placement.required
        };
        reservations.push({
          slotId: slotId, x: chosen.x, y: chosen.y,
          occupancyRadius: chosen.occupancyRadius
        });
        slots.push(slot);
      });
    });
    var rejected = failures.some(function (failure) {
      return failure.required && failure.onFailure !== 'skipOptional';
    });
    var plan = {
      ok: !rejected,
      reason: rejected ? 'region-mount-rejected' : null,
      regionId: rid, populationId: view.id,
      layoutVersion: layout.version,
      contentFingerprint: Game.content.fingerprint(),
      context: C.clone({
        tier: context.tier || 1, worldSeed: context.worldSeed || 0,
        expeditionIndex: context.expeditionIndex || 0,
        modifiers: context.modifiers || [], rewardMultiplier: context.rewardMultiplier || 1
      }),
      slots: slots,
      reservations: reservations,
      failures: failures
    };
    // Read-only tooling may request a deterministic preview without replacing
    // the live plan or its slot runtime. The exact production allocator and
    // placement predicates are still used, so Lab diagnostics cannot drift.
    if (plan.ok && !context.preview) {
      activePlan = C.deepFreeze(C.clone(plan));
      slotRuntime = {};
      slots.forEach(function (slot) { slotRuntime[slot.id] = { state: 'planned', spawnId: null }; });
    }
    return C.deepFreeze(C.clone(plan));
  }

  function planSlot(slotId) {
    if (!activePlan) return null;
    return activePlan.slots.filter(function (slot) { return slot.id === slotId; })[0] || null;
  }

  function materializeSlot(slotId, overrides) {
    var slot = planSlot(slotId);
    if (!slot) return { ok: false, reason: 'missing-plan-slot' };
    var runtime = slotRuntime[slotId];
    if (!runtime || runtime.state === 'active' || runtime.state === 'materializing') {
      return { ok: false, reason: 'slot-active' };
    }
    runtime.state = 'materializing';
    var context = C.merge(C.clone(activePlan.context), C.merge({
      regionId: activePlan.regionId,
      populationId: activePlan.populationId,
      layoutSlotKey: slot.layoutSlotKey,
      planSlotId: slot.id,
      spawnRequestKey: [activePlan.regionId, activePlan.populationId, slot.layoutSlotKey].join(':'),
      x: slot.x, y: slot.y, threat: slot.threat || null,
      affix: overrides && overrides.affix || null
    }, overrides || {}));
    var result = materialize(slot.profileId, context);
    runtime.state = result.ok ? 'active' : 'planned';
    runtime.spawnId = result.ok ? result.lease.spawnId : null;
    if (result.ok) result.slotId = slotId;
    return result;
  }

  function scheduleRespawn(lease, profile, reason, options) {
    var respawn = profile.lifecycle && profile.lifecycle.respawn || { mode: 'none' };
    if (respawn.mode === 'none') return;
    var delay = Number(options && options.delay);
    if (!Number.isFinite(delay)) delay = Number(respawn.delay) || 0;
    if (respawn.resetVariant && Game.state && Game.state.world && Game.state.world.social) {
      delete Game.state.world.social.spawnVariants[lease.spawnId];
    }
    respawnSchedules.push({
      spawnId: lease.spawnId,
      generation: lease.generation,
      profileId: lease.profileId,
      slotId: lease.slotId || null,
      reason: reason,
      mode: respawn.mode,
      remaining: delay,
      eligibleAtWorldTime: respawn.mode === 'worldTime'
        ? Number(Game.state && Game.state.world && Game.state.world.worldTime || 0) + delay : null,
      context: C.clone(lease.context)
    });
  }

  var P = Game.population = {
    reset: function (rid) {
      Object.keys(leases).forEach(function (spawnId) {
        P.close(spawnId, 'region-reset', { despawn: true });
      });
      leases = {};
      generations = {};
      sessionRequests = {};
      activePlan = null;
      slotRuntime = {};
      respawnSchedules = [];
      regionId = rid || null;
    },

    prepareRegion: prepareRegion,
    materializeSlot: materializeSlot,
    inspectPlacement: function (profileId, point, layout, reservations) {
      var profile = Game.content.get('worldSpawnProfile', profileId);
      if (!profile) return C.deepFreeze({
        ok: false, profileId: profileId, point: point || null,
        candidate: null, checks: [], failures: ['missing-profile']
      });
      return C.deepFreeze(C.clone(inspectPlacement(
        profile, point, layout, reservations || activePlan && activePlan.reservations || []
      )));
    },
    inspectPlacements: function (profileId, points, layout, reservations) {
      var profile = Game.content.get('worldSpawnProfile', profileId);
      if (!profile) return C.deepFreeze({
        ok: false, profileId: profileId, reason: 'missing-profile', inspections: []
      });
      if (!layout) return C.deepFreeze({
        ok: false, profileId: profileId, reason: 'missing-layout', inspections: []
      });
      var occupied = reservations || activePlan && activePlan.reservations || [];
      var inspections = (points || []).map(function (point) {
        return inspectPlacement(profile, point, layout, occupied);
      });
      return C.deepFreeze(C.clone({
        ok: true,
        profileId: profileId,
        inspections: inspections
      }));
    },
    inspectCandidates: function (profileId, layout, channel, context, reservations) {
      var profile = Game.content.get('worldSpawnProfile', profileId);
      if (!profile || !layout) return C.deepFreeze({
        ok: false, profileId: profileId, channel: channel || null,
        reason: profile ? 'missing-layout' : 'missing-profile',
        candidates: [], chosenIndex: -1
      });
      context = context || {};
      var pool = candidatePool(profile, layout, channel || 'regular', context);
      var occupied = reservations || activePlan && activePlan.reservations || [];
      var candidates = pool.map(function (point) {
        return inspectPlacement(profile, point, layout, occupied);
      });
      var chosenIndex = -1;
      for (var ci = 0; ci < candidates.length; ci++) {
        if (candidates[ci].ok) { chosenIndex = ci; break; }
      }
      return C.deepFreeze(C.clone({
        ok: chosenIndex >= 0,
        profileId: profileId,
        channel: channel || 'regular',
        selector: profile.placement && profile.placement.selector || null,
        source: profile.placement && profile.placement.source || null,
        candidates: candidates,
        chosenIndex: chosenIndex
      }));
    },
    mountPlan: function () {
      if (!activePlan) return null;
      var plan = C.clone(activePlan);
      plan.runtime = C.clone(slotRuntime);
      plan.respawnSchedules = C.clone(respawnSchedules);
      return C.deepFreeze(plan);
    },

    allocate: function (rid, channel, slotCount, context) {
      var view = populationFor(rid);
      return view ? allocate(view, channel, slotCount, context || {}) : [];
    },

    materialize: materialize,

    respawn: function (leaseOrSpec) {
      if (!leaseOrSpec || !leaseOrSpec.profileId || !leaseOrSpec.context) {
        return { ok: false, reason: 'invalid-respawn' };
      }
      return materialize(leaseOrSpec.profileId, C.clone(leaseOrSpec.context));
    },

    mountChannel: function (rid, channel, layout, options) {
      options = options || {};
      if (!activePlan || activePlan.regionId !== rid || activePlan.layoutVersion !== layout.version) {
        var limits = {};
        if (options.slots) limits[channel] = options.slots.length;
        var prepared = prepareRegion(rid, layout, Object.assign({}, options, { channelLimits: limits }));
        if (!prepared.ok) return [];
      }
      var plannedSlots = activePlan.slots.filter(function (slot) {
        return slot.channel === channel && slotRuntime[slot.id] && slotRuntime[slot.id].state === 'planned';
      });
      var view = populationFor(rid);
      if (!view) return [];
      var results = [];
      plannedSlots.forEach(function (slot) {
        var result = materializeSlot(slot.id, {
          affix: options.affixFor && options.affixFor(slot) || null
        });
        if (result.ok) results.push(result);
      });
      return results;
    },

    close: function (spawnId, reason, options) {
      var lease = leases[spawnId];
      if (!lease) return false;
      options = options || {};
      lease.state = reason || 'closed';
      if (options.despawn) lease.actorIds.slice().forEach(function (actorId) {
        if (Game.actors.get(actorId)) Game.actors.despawn(actorId, reason || 'spawn-close');
      });
      delete leases[spawnId];
      if (Game.engagement) Game.engagement.cancelForSpawn(spawnId, lease.generation, reason || 'spawn-close');
      if (lease.slotId && slotRuntime[lease.slotId]) {
        slotRuntime[lease.slotId].state = 'closed';
        slotRuntime[lease.slotId].spawnId = null;
      }
      var profile = Game.content.get('worldSpawnProfile', lease.profileId);
      if (profile && (options.scheduleRespawn || reason === 'defeated' || reason === 'escaped')) {
        scheduleRespawn(lease, profile, reason, options);
      }
      return true;
    },

    onActorDefeated: function (actor) {
      if (!actor || !actor.spawnId || !leases[actor.spawnId]) return null;
      var lease = leases[actor.spawnId];
      var defeated = lease.actorIds.every(function (actorId) {
        var member = Game.actors.get(actorId);
        return !member || member.dead || member.hp <= 0;
      });
      if (defeated) P.close(actor.spawnId, 'defeated', {
        delay: lease.context && lease.context.threat && lease.context.threat.respawn
      });
      return defeated ? lease : null;
    },

    onActorEscaped: function (actor) {
      if (!actor || !actor.spawnId || !leases[actor.spawnId]) return null;
      var lease = leases[actor.spawnId];
      P.close(actor.spawnId, 'escaped', { despawn: true });
      return lease;
    },

    update: function (dt, worldTime) {
      var spawned = [];
      for (var i = respawnSchedules.length - 1; i >= 0; i--) {
        var schedule = respawnSchedules[i];
        if (schedule.mode === 'delay') schedule.remaining -= Math.max(0, Number(dt) || 0);
        var eligible = schedule.mode === 'worldTime'
          ? Number(worldTime) >= schedule.eligibleAtWorldTime
          : schedule.remaining <= 0;
        if (!eligible) continue;
        respawnSchedules.splice(i, 1);
        var result;
        if (schedule.slotId && planSlot(schedule.slotId)) {
          if (slotRuntime[schedule.slotId]) slotRuntime[schedule.slotId].state = 'planned';
          result = materializeSlot(schedule.slotId);
        } else {
          result = materialize(schedule.profileId, C.clone(schedule.context));
        }
        if (result && result.ok) spawned.push(result);
      }
      return { spawned: spawned, schedules: respawnSchedules.length };
    },

    lease: function (spawnId) { return leases[spawnId] || null; },
    leases: function () {
      return Object.keys(leases).sort().map(function (id) { return C.deepFreeze(C.clone(leases[id])); });
    },
    resolveActor: function (key) {
      if (!key || !key.spawnId) return null;
      var lease = leases[key.spawnId];
      if (!lease) return null;
      if (lease.generation !== key.spawnGeneration) return null;
      var found = lease.actorIds.map(Game.actors.get).filter(Boolean).filter(function (actor) {
        return !key.memberSlotId || actor.memberSlotId === key.memberSlotId;
      });
      return found[0] || null;
    },
    stableKey: function (actor) {
      if (actor && actor.actorRecordId) return { actorRecordId: actor.actorRecordId };
      return actor && actor.spawnId ? {
        spawnId: actor.spawnId, memberSlotId: actor.memberSlotId,
        spawnGeneration: actor.spawnGeneration
      } : null;
    },

    summarizePack: summarizePack,
    offlineSummary: function (rid, tier) {
      var view = populationFor(rid);
      if (!view || !view.offlineEligible || !view.offlineRepresentative) return null;
      var ids = [
        view.offlineRepresentative.encounterPackId,
        view.offlineRepresentative.secondaryEncounterPackId
      ].filter(Boolean);
      var summaries = ids.map(function (id) { return summarizePack(id, tier || 1); }).filter(Boolean);
      if (!summaries.length) return null;
      var total = summaries.reduce(function (out, summary) {
        out.hp += summary.hp;
        out.armor += summary.armor;
        out.exp += summary.exp;
        out.gold += summary.gold;
        out.memberCount += summary.memberCount;
        return out;
      }, { hp: 0, armor: 0, exp: 0, gold: 0, memberCount: 0, samples: summaries.length });
      total.hp /= summaries.length;
      total.armor /= summaries.length;
      total.exp /= summaries.length;
      total.gold /= summaries.length;
      return total;
    },

    channelProfiles: function (rid, channel) {
      var view = populationFor(rid);
      return view && view.channels[channel]
        ? view.channels[channel].spawnRefs.map(function (entry) { return entry.profileId; })
        : [];
    }
  };
})();
