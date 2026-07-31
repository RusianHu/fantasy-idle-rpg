/* ============================================================
 * systems/merchants.js — 移动行商事件领域
 *
 * 权威状态位于 state.world.merchants；世界 Actor、交易半径与战斗
 * Encounter 都是可随切区销毁的运行时投影。库存按事件种子确定，
 * 普通货架仅允许一次付费重排，珍藏与稀有槽不受议价影响。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus;

  var EVENT_TTL = 360;
  var RECUR_COOLDOWN = 600;
  var OFFENSE_COOLDOWN_STEP = 120;
  var MAX_OFFENSE_COOLDOWN_STEPS = 3;
  var MOVE_SPEED_REF = 56;
  var PATROL_RADIUS = 32;
  var TRADE_RADIUS = 58;
  var MIN_HERO_DISTANCE = 120;
  var MAX_HERO_DISTANCE = 520;
  var SPAWN_RETRY_SECONDS = 2;
  var BOSS_GUARANTEE_HOLD_SECONDS = 1.5;
  var runtime = {
    regionId: null,
    eventId: null,
    actorId: null,
    spawnId: null,
    materializeOrdinal: 0,
    placementRetryUntil: 0,
    materializeRetryUntil: 0,
    bossGuaranteeUntil: 0,
    lastPlacementAudit: null,
    lastFailure: null,
    surrenderPromptedEventId: null,
    pendingAttack: {}
  };
  var catchupPaused = false;

  function clone(value) {
    return Game.contentCompiler
      ? Game.contentCompiler.clone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function rootState() {
    var world = Game.state && Game.state.world;
    if (!world) return null;
    if (!world.merchants || typeof world.merchants !== 'object') {
      world.merchants = {
        version: 1,
        guild: {
          trust: 50, debtGold: 0, offenses: 0,
          metProfileIds: [], lastLines: {}
        },
        regions: {}
      };
    }
    return world.merchants;
  }

  function guild() {
    var root = rootState();
    return root && root.guild;
  }

  function profileForRegion(regionId) {
    var profiles = Game.content.all('merchantProfile');
    for (var i = 0; i < profiles.length; i++) {
      if (profiles[i].regionIds.indexOf(regionId) >= 0) return profiles[i];
    }
    return null;
  }

  function targetFor(regionId, ordinal, recurring) {
    var seed = U.strSeed([
      Game.state.world.worldSeed, regionId, ordinal,
      recurring ? 'merchant-recurring' : 'merchant-first'
    ].join('|'));
    var rng = U.seededRng(seed);
    return Math.round((recurring ? 150 : 50) + rng() * (recurring ? 90 : 30));
  }

  function regionState(regionId) {
    var root = rootState();
    if (!root) return null;
    var states = root.regions;
    if (!states[regionId]) {
      states[regionId] = {
        ordinal: 0,
        firstEncountered: false,
        movementSeconds: 0,
        targetSeconds: targetFor(regionId, 0, false),
        cooldownUntil: 0,
        activeEvent: null
      };
    }
    return states[regionId];
  }

  function activeEvent(regionId) {
    var rid = regionId || Game.state && Game.state.world && Game.state.world.region;
    var state = rid && regionState(rid);
    return state && state.activeEvent || null;
  }

  function actorForEvent(eventId) {
    var event = activeEvent();
    if (!event || (eventId && event.id !== eventId) ||
        runtime.eventId !== event.id || !runtime.actorId ||
        !Game.actors || !Game.actors.get) return null;
    var actor = Game.actors.get(runtime.actorId);
    if (!actor || actor.dead || actor.hp <= 0 || actor.lifecycle !== 'active' ||
        actor.merchantEventId !== event.id) return null;
    return actor;
  }

  function trustBand(value) {
    var trust = value === undefined ? guild().trust : Number(value);
    if (trust >= 75) return 'favored';
    if (trust >= 40) return 'normal';
    if (trust >= 20) return 'wary';
    return 'refused';
  }

  function priceMultiplier() {
    var band = trustBand();
    return band === 'favored' ? 0.9 : (band === 'wary' ? 1.15 : 1);
  }

  function stockLevel() {
    var playerLevel = Math.max(1, Game.state.player.level | 0);
    var tier = Game.State.regionTier(Game.state.world.region);
    return Math.max(playerLevel, 1 + (tier - 1) * 6);
  }

  function offerId(eventId, index) {
    return eventId + ':offer:' + index;
  }

  function gearPrice(item, role) {
    var baseline = F.gearBoxPrice(Math.max(1, item.ilvl));
    var rarity = [0.72, 0.95, 1.35, 2.25, 4][item.rar] || 1;
    var roleMultiplier = role === 'signature' ? 1.18 : (role === 'rare' ? 1.32 : 1);
    return Math.max(1, Math.round(baseline * rarity * roleMultiplier));
  }

  function gearOffer(eventId, index, role, rng, rarity, pool) {
    var level = stockLevel();
    var item = Game.inv.genLoot(level, {
      rng: rng,
      allocateUid: false,
      rar: rarity
    });
    if (role === 'signature') {
      var selected = [];
      (pool.signatureAffixes || []).forEach(function (affixId) {
        var def = Game.reg.get('affix', affixId);
        if (def && selected.length < F.RARITY[item.rar].affixes) {
          selected.push({ id: affixId, v: Game.inv.rollAffixValue(def, level, rng) });
        }
      });
      var fallback = Game.reg.all('affix').filter(function (def) {
        return !selected.some(function (affix) { return affix.id === def.id; });
      });
      while (selected.length < F.RARITY[item.rar].affixes && fallback.length) {
        var at = Math.floor(rng() * fallback.length);
        var chosen = fallback.splice(at, 1)[0];
        selected.push({ id: chosen.id, v: Game.inv.rollAffixValue(chosen, level, rng) });
      }
      item.affixes = selected;
    }
    return {
      id: offerId(eventId, index),
      role: role,
      kind: 'gear',
      cur: 'gold',
      basePrice: gearPrice(item, role),
      quantity: 1,
      maxQuantity: 1,
      eligibleRobbery: role === 'travel',
      icon: item.base === 'weapon'
        ? 'icon_w_' + (Game.state.player.classId || 'fighter')
        : (Game.reg.get('slot', item.base) || {}).icon || 'icon_chest',
      item: item
    };
  }

  function potionOffer(eventId, index, role, potionId, count) {
    var tier = Game.State.regionTier(Game.state.world.region);
    return {
      id: offerId(eventId, index),
      role: role,
      kind: 'potion',
      ref: potionId,
      count: count,
      cur: 'gold',
      basePrice: Math.max(1, Math.round(F.potionPrice(potionId, tier) * count * 0.92)),
      quantity: role === 'staple' ? 4 : 2,
      maxQuantity: role === 'staple' ? 4 : 2,
      eligibleRobbery: role !== 'signature' && role !== 'rare',
      icon: potionId === 'potion_large' ? 'icon_potion_large' : 'icon_potion_small'
    };
  }

  function materialOffer(eventId, index, role, materialId, count) {
    var tier = Game.State.regionTier(Game.state.world.region);
    var unit = Math.max(6, Math.round(F.gearBoxPrice(stockLevel()) * (0.035 + tier * 0.003)));
    return {
      id: offerId(eventId, index),
      role: role,
      kind: 'material',
      materialId: materialId,
      count: count,
      cur: 'gold',
      basePrice: unit * count,
      quantity: role === 'staple' ? 3 : 2,
      maxQuantity: role === 'staple' ? 3 : 2,
      eligibleRobbery: role !== 'signature' && role !== 'rare',
      icon: 'icon_chest'
    };
  }

  function rareRarity(rng) {
    var tier = Game.State.regionTier(Game.state.world.region);
    if (tier <= 2) return 2;
    if (tier <= 5) return rng() < 0.3 ? 3 : 2;
    return rng() < 0.12 ? 4 : 3;
  }

  function generateStock(eventId, profile, seed, revision) {
    var pool = Game.content.get('merchantStockPool', profile.stockPoolId);
    var rng = U.seededRng(U.strSeed([seed, revision || 1, 'stock'].join('|')));
    var materials = (pool.materials || []).slice();
    var firstMaterial = materials[Math.floor(rng() * materials.length)] || 'herb';
    var remaining = materials.filter(function (id) { return id !== firstMaterial; });
    var secondMaterial = remaining[Math.floor(rng() * remaining.length)] || firstMaterial;
    var offers = [
      potionOffer(eventId, 0, 'staple', 'potion_small', 1),
      materialOffer(eventId, 1, 'staple', firstMaterial, 2 + Math.floor(rng() * 3)),
      gearOffer(eventId, 2, 'travel', rng, Math.min(2, F.rollRarity(1.25, rng)), pool),
      potionOffer(eventId, 3, 'travel', 'potion_large', 1),
      materialOffer(eventId, 4, 'travel', secondMaterial, 3 + Math.floor(rng() * 3)),
      gearOffer(eventId, 5, 'travel', rng, Math.max(1, F.rollRarity(1.4, rng)), pool),
      gearOffer(eventId, 6, 'signature', rng, Math.max(2, rareRarity(rng)), pool),
      gearOffer(eventId, 7, 'rare', rng, rareRarity(rng), pool)
    ];
    return offers;
  }

  function offerById(event, id) {
    if (!event) return null;
    for (var i = 0; i < event.offers.length; i++) {
      if (event.offers[i].id === id) return event.offers[i];
    }
    return null;
  }

  function decoratedOffer(offer) {
    var out = clone(offer);
    out.dynamic = true;
    out.section = offer.role === 'staple'
      ? 'merchantStaple'
      : (offer.role === 'travel'
        ? 'merchantTravel'
        : (offer.role === 'signature' ? 'merchantSignature' : 'merchantRare'));
    out.price = Math.max(1, Math.round(offer.basePrice * priceMultiplier()));
    out.soldOut = offer.quantity <= 0;
    return out;
  }

  function robberyDebtFor(offer) {
    return offer ? Math.max(2, Math.round(Number(offer.basePrice) || 0) * 2) : 0;
  }

  function decoratedRobberyOffer(offer) {
    var out = decoratedOffer(offer);
    out.robberyDebt = robberyDebtFor(offer);
    return out;
  }

  function currentEventForTrade(context) {
    context = context || Game.trade && Game.trade.current();
    if (!context || !context.available || context.providerType !== 'merchant') return null;
    var event = activeEvent(context.regionId);
    return event && event.id === context.eventId ? event : null;
  }

  function visibleOffers(context) {
    var event = currentEventForTrade(context);
    if (!event || event.state !== 'available' || trustBand() === 'refused') return [];
    var hideCabinet = trustBand() === 'wary';
    return event.offers.filter(function (offer) {
      return !(hideCabinet && (offer.role === 'signature' || offer.role === 'rare'));
    }).map(decoratedOffer);
  }

  function canBuy(offer, context) {
    var event = currentEventForTrade(context);
    var source = event && offerById(event, offer && offer.id);
    if (!source) return { ok: false, reason: 'not-offered' };
    if (event.state !== 'available') return { ok: false, reason: 'unavailable' };
    if (trustBand() === 'refused') return { ok: false, reason: 'refused' };
    if (trustBand() === 'wary' &&
        (source.role === 'signature' || source.role === 'rare')) {
      return { ok: false, reason: 'hidden' };
    }
    if (source.quantity <= 0) return { ok: false, reason: 'sold-out' };
    var price = Math.max(1, Math.round(source.basePrice * priceMultiplier()));
    if (source.cur === 'crystal'
        ? Game.state.player.crystal < price
        : Game.state.player.gold < price) {
      return { ok: false, reason: 'poor' };
    }
    return { ok: true, event: event, offer: source, price: price };
  }

  function grantOffer(offer, source) {
    source = source || 'merchant';
    var result = { ok: true, offer: offer };
    if (offer.kind === 'potion') {
      Game.inv.addPotion(offer.ref, offer.count);
      result.potion = { id: offer.ref, count: offer.count };
    } else if (offer.kind === 'material') {
      Game.inv.addMaterial(offer.materialId, offer.count);
      result.material = { id: offer.materialId, count: offer.count };
    } else if (offer.kind === 'gear') {
      result.item = Game.inv.addItem(
        Game.inv.materializePreview(offer.item),
        { source: source }
      );
    }
    return result;
  }

  function buy(offerId, context) {
    var event = currentEventForTrade(context);
    var preview = event && decoratedOffer(offerById(event, offerId));
    var access = canBuy(preview, context);
    if (!access.ok) {
      if (access.reason === 'poor') bus.emit('merchant:dialogueHint', { state: 'poor' });
      return access;
    }
    if (access.offer.cur === 'crystal') Game.player.addCrystal(-access.price);
    else Game.player.addGold(-access.price, { raw: true });
    var result = grantOffer(access.offer, 'merchant');
    access.offer.quantity--;
    event.purchasedAny = true;
    event.stockRevision++;
    if (!event.purchaseRewarded) {
      event.purchaseRewarded = true;
      guild().trust = U.clamp(guild().trust + 5, -100, 100);
    }
    result.price = access.price;
    result.eventId = event.id;
    result.offerId = offerId;
    result.remaining = access.offer.quantity;
    bus.emit('merchant:stockChanged', {
      eventId: event.id, offerId: offerId, reason: 'purchase'
    });
    bus.emit('shop:bought', {
      sid: offerId,
      rid: Game.state.world.region,
      areaId: context && context.areaId || Game.trade.current().areaId,
      merchant: true
    });
    return result;
  }

  function haggleFee() {
    return Math.max(25, Math.round(F.gearBoxPrice(stockLevel()) * 0.18));
  }

  function haggle(context) {
    var event = currentEventForTrade(context);
    if (!event) return { ok: false, reason: 'unavailable' };
    if (trustBand() === 'refused') return { ok: false, reason: 'refused' };
    if (event.purchasedAny) return { ok: false, reason: 'after-purchase' };
    if (event.haggled) return { ok: false, reason: 'used' };
    var fee = haggleFee();
    if (Game.state.player.gold < fee) return { ok: false, reason: 'poor', fee: fee };
    var profile = Game.content.get('merchantProfile', event.merchantProfileId);
    var replacement = generateStock(event.id, profile, event.seed, event.stockRevision + 1);
    Game.player.addGold(-fee, { raw: true });
    for (var i = 0; i < event.offers.length; i++) {
      if (event.offers[i].role === 'travel') event.offers[i] = replacement[i];
    }
    event.haggled = true;
    event.stockRevision++;
    bus.emit('merchant:stockChanged', {
      eventId: event.id, reason: 'haggle', fee: fee
    });
    bus.emit('merchant:dialogueHint', { state: 'haggle' });
    return { ok: true, fee: fee, offers: visibleOffers(context) };
  }

  function worldTime() {
    return Number(Game.state && Game.state.world && Game.state.world.worldTime) || 0;
  }

  function recordSpawnFailure(kind, reason, detail, eventId) {
    runtime.lastFailure = {
      kind: kind,
      reason: reason || 'unknown',
      eventId: eventId || null,
      atWorldTime: worldTime(),
      detail: detail || null
    };
    bus.emit('merchant:spawnFailed', clone(runtime.lastFailure));
  }

  function placementSourcePoints(spawnProfile, layout) {
    var placement = spawnProfile && spawnProfile.placement || {};
    var source = placement.source;
    var points = [];
    var nav = layout && layout.nav;
    if (source === 'walkableNav' && nav && nav.grid && nav.cell) {
      nav.grid.forEach(function (row, y) {
        row.forEach(function (walkable, x) {
          if (!walkable) return;
          points.push({
            key: 'nav:' + x + ':' + y,
            x: x * nav.cell + nav.cell / 2,
            y: y * nav.cell + nav.cell / 2,
            navX: x,
            navY: y
          });
        });
      });
      return points;
    }
    var fallback = layout && layout[source] || layout && layout.spawnCandidates || [];
    var seen = {};
    fallback.forEach(function (point, index) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      var key = point.id || source + ':' + index;
      var coordinateKey = point.x + ':' + point.y;
      if (seen[coordinateKey]) return;
      seen[coordinateKey] = true;
      points.push({ key: key, x: point.x, y: point.y });
    });
    return points;
  }

  function incrementCount(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
  }

  function placementAudit(options) {
    options = options || {};
    var rid = options.regionId || Game.state && Game.state.world && Game.state.world.region;
    var profile = options.profile || profileForRegion(rid);
    var spawnProfile = profile && Game.content.get('worldSpawnProfile', profile.spawnProfileId);
    var layout = options.layout || Game.world && Game.world.layout;
    var hero = options.heroPoint || Game.world && Game.world.hero;
    var seed = Number(options.seed) >>> 0;
    var full = options.full !== false;
    var report = {
      ok: false,
      reason: null,
      regionId: rid || null,
      merchantProfileId: profile && profile.id || null,
      spawnProfileId: spawnProfile && spawnProfile.id || null,
      selector: spawnProfile && spawnProfile.placement && spawnProfile.placement.selector || null,
      source: spawnProfile && spawnProfile.placement && spawnProfile.placement.source || null,
      seed: seed,
      heroPoint: hero && { x: hero.x, y: hero.y } || null,
      constraints: null,
      sourceTotal: 0,
      distanceEligible: 0,
      inspectedCount: 0,
      validCount: 0,
      failureCounts: {},
      candidates: [],
      chosenIndex: -1,
      chosen: null
    };
    if (!profile || !spawnProfile) {
      report.reason = profile ? 'missing-spawn-profile' : 'missing-merchant-profile';
      return report;
    }
    if (!layout) {
      report.reason = 'missing-layout';
      return report;
    }
    if (!hero || !Number.isFinite(hero.x) || !Number.isFinite(hero.y)) {
      report.reason = 'missing-hero-point';
      return report;
    }
    if (!Game.population || !Game.population.inspectPlacement) {
      report.reason = 'missing-population-inspector';
      return report;
    }
    var placement = spawnProfile.placement || {};
    var minCampDistance = Math.max(
      Number(placement.minCampDistance) || 0,
      (Number(layout.campSafeRadius) || 0) + PATROL_RADIUS
    );
    var minBossDistance = Math.max(
      90,
      (Number(layout.bossSafeRadius) || 0) + PATROL_RADIUS
    );
    report.constraints = {
      minHeroDistance: MIN_HERO_DISTANCE,
      maxHeroDistance: MAX_HERO_DISTANCE,
      minCampDistance: minCampDistance,
      minBossDistance: minBossDistance,
      minClearance: Number(placement.minClearance) || 0,
      maxDanger: Number.isFinite(placement.maxDanger) ? placement.maxDanger : null,
      occupancyRadius: Number(placement.occupancyRadius) || 0,
      patrolRadius: PATROL_RADIUS,
      tradeRadius: TRADE_RADIUS
    };
    var points = placementSourcePoints(spawnProfile, layout);
    report.sourceTotal = points.length;
    var eligible = [];
    points.forEach(function (point) {
      var heroDistance = U.dist(hero.x, hero.y, point.x, point.y);
      if (heroDistance < MIN_HERO_DISTANCE || heroDistance > MAX_HERO_DISTANCE) {
        incrementCount(report.failureCounts, 'heroDistance');
        return;
      }
      var campDistance = layout.camp
        ? U.dist(point.x, point.y, layout.camp.x, layout.camp.y)
        : Infinity;
      if (campDistance < minCampDistance) {
        incrementCount(report.failureCounts, 'campPatrol');
        return;
      }
      var bossDistance = layout.bossPoint
        ? U.dist(point.x, point.y, layout.bossPoint.x, layout.bossPoint.y)
        : Infinity;
      if (bossDistance < minBossDistance) {
        incrementCount(report.failureCounts, 'bossPatrol');
        return;
      }
      eligible.push(Object.assign({}, point, {
        heroDistance: heroDistance,
        campDistance: campDistance,
        bossDistance: bossDistance,
        rank: U.strSeed([seed, rid, point.key, 'merchant-placement'].join('|'))
      }));
    });
    report.distanceEligible = eligible.length;
    eligible.sort(function (left, right) {
      return left.rank - right.rank || left.key.localeCompare(right.key);
    });
    var reservations = options.reservations;
    var inspections;
    if (full && Game.population.inspectPlacements) {
      inspections = Game.population.inspectPlacements(
        spawnProfile.id,
        eligible,
        layout,
        reservations
      ).inspections;
    } else {
      inspections = [];
      for (var pi = 0; pi < eligible.length; pi++) {
        inspections.push(Game.population.inspectPlacement(
          spawnProfile.id,
          eligible[pi],
          layout,
          reservations
        ));
        if (!full && inspections[inspections.length - 1].ok) break;
      }
    }
    inspections.forEach(function (inspection) {
      var point = inspection.point || {};
      var entry = clone(inspection);
      entry.heroDistance = point.heroDistance;
      entry.campDistance = point.campDistance;
      entry.bossDistance = point.bossDistance;
      report.inspectedCount++;
      if (entry.ok) report.validCount++;
      else (entry.failures || []).forEach(function (failure) {
        incrementCount(report.failureCounts, failure);
      });
      report.candidates.push(entry);
      if (report.chosenIndex < 0 && entry.ok) {
        report.chosenIndex = report.candidates.length - 1;
        report.chosen = {
          x: entry.candidate.x,
          y: entry.candidate.y,
          anchorKey: point.key || 'merchant-nav',
          navX: point.navX,
          navY: point.navY,
          heroDistance: point.heroDistance,
          campDistance: point.campDistance,
          bossDistance: point.bossDistance,
          clearance: entry.candidate.clearance,
          danger: entry.candidate.danger,
          occupancyRadius: entry.candidate.occupancyRadius
        };
      }
    });
    report.ok = !!report.chosen;
    report.reason = report.ok ? null : 'no-legal-placement';
    return report;
  }

  function placementAuditSummary(report) {
    return report && clone({
      ok: report.ok,
      reason: report.reason,
      regionId: report.regionId,
      merchantProfileId: report.merchantProfileId,
      spawnProfileId: report.spawnProfileId,
      selector: report.selector,
      source: report.source,
      seed: report.seed,
      sourceTotal: report.sourceTotal,
      distanceEligible: report.distanceEligible,
      inspectedCount: report.inspectedCount,
      validCount: report.validCount,
      failureCounts: report.failureCounts,
      constraints: report.constraints,
      chosen: report.chosen
    });
  }

  function legalPlacement(profile, seed) {
    var report = placementAudit({ profile: profile, seed: seed, full: false });
    runtime.lastPlacementAudit = placementAuditSummary(report);
    return { placement: report.chosen, report: report };
  }

  function configurePatrolActor(actor, anchor) {
    if (!actor || !anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return false;
    actor.spawnX = anchor.x;
    actor.spawnY = anchor.y;
    actor.merchantWagonX = anchor.x;
    actor.merchantWagonY = anchor.y;
    actor.merchantPatrolRadius = PATROL_RADIUS;
    actor.wanderT = 0;
    actor.wx = anchor.x;
    actor.wy = anchor.y;
    return true;
  }

  function closeRuntime(reason) {
    var actorId = runtime.actorId;
    var spawnId = runtime.spawnId;
    runtime.actorId = null;
    runtime.spawnId = null;
    runtime.eventId = null;
    if (actorId && Game.world) Game.world.detachActor(actorId, reason || 'merchant-close');
    if (spawnId && Game.population && Game.population.lease(spawnId)) {
      Game.population.close(spawnId, reason || 'merchant-close', { despawn: true });
    } else if (actorId && Game.actors && Game.actors.get(actorId)) {
      Game.actors.despawn(actorId, reason || 'merchant-close');
    }
  }

  function materializeEvent(event) {
    if (!event || event.state !== 'available' || !Game.world || !Game.world.layout) {
      return { ok: false, reason: 'unavailable' };
    }
    if (runtime.eventId === event.id && runtime.actorId) {
      var existing = Game.actors.get(runtime.actorId);
      if (existing) return { ok: true, actor: existing, reused: true };
    }
    closeRuntime('merchant-remount');
    var profile = Game.content.get('merchantProfile', event.merchantProfileId);
    if (!profile) return { ok: false, reason: 'missing-profile' };
    var requestOrdinal = ++runtime.materializeOrdinal;
    var result = Game.population.materialize(profile.spawnProfileId, {
      regionId: Game.state.world.region,
      populationId: 'merchant-runtime',
      layoutSlotKey: event.anchorKey || event.id,
      spawnRequestKey: event.id + ':mount:' + requestOrdinal,
      x: event.x,
      y: event.y,
      tier: Game.State.regionTier(Game.state.world.region),
      rewardMultiplier: 0
    });
    if (!result.ok || !result.primary || !result.lease) {
      recordSpawnFailure('materialize', result.reason || 'materialize-failed', null, event.id);
      runtime.materializeRetryUntil = worldTime() + SPAWN_RETRY_SECONDS;
      return { ok: false, reason: result.reason || 'materialize-failed' };
    }
    var actor = result.primary;
    actor.merchantEventId = event.id;
    actor.merchantProfileId = event.merchantProfileId;
    configurePatrolActor(actor, event);
    if (!Game.world.attachActor(actor, 'merchant-event')) {
      Game.population.close(result.lease.spawnId, 'merchant-attach-failed', { despawn: true });
      recordSpawnFailure('materialize', 'attach-failed', null, event.id);
      runtime.materializeRetryUntil = worldTime() + SPAWN_RETRY_SECONDS;
      return { ok: false, reason: 'attach-failed' };
    }
    runtime.regionId = Game.state.world.region;
    runtime.eventId = event.id;
    runtime.actorId = actor.id;
    runtime.spawnId = result.lease.spawnId;
    runtime.materializeRetryUntil = 0;
    runtime.lastFailure = null;
    return { ok: true, actor: actor, lease: result.lease };
  }

  function discover(options) {
    options = options || {};
    var rid = options.regionId || Game.state.world.region;
    var state = regionState(rid);
    var profile = profileForRegion(rid);
    if (!state || !profile || state.activeEvent) return { ok: false, reason: 'unavailable' };
    var ordinal = state.ordinal + 1;
    var seed = U.strSeed([
      Game.state.world.worldSeed, rid, ordinal,
      Game.state.world.expedition && Game.state.world.expedition.index || 0,
      'wandering-merchant'
    ].join('|'));
    var placementResult = options.placement
      ? { placement: options.placement, report: null }
      : legalPlacement(profile, seed);
    var placement = placementResult.placement;
    if (!placement) {
      runtime.placementRetryUntil = worldTime() + SPAWN_RETRY_SECONDS;
      recordSpawnFailure(
        'placement',
        placementResult.report && placementResult.report.reason || 'placement-failed',
        placementAuditSummary(placementResult.report)
      );
      return {
        ok: false,
        reason: 'placement',
        audit: placementAuditSummary(placementResult.report)
      };
    }
    var eventId = 'merchant:' + rid + ':' + ordinal + ':' + U.hex32(seed);
    var event = {
      id: eventId,
      merchantProfileId: profile.id,
      seed: seed,
      x: placement.x,
      y: placement.y,
      anchorKey: placement.anchorKey || 'debug',
      state: 'available',
      remainingSeconds: EVENT_TTL,
      stockRevision: 1,
      haggled: false,
      purchasedAny: false,
      purchaseRewarded: false,
      offenseApplied: false,
      offenseBaseDebt: 0,
      offers: generateStock(eventId, profile, seed, 1)
    };
    var materialized = materializeEvent(event);
    if (!materialized.ok) {
      runtime.placementRetryUntil = worldTime() + SPAWN_RETRY_SECONDS;
      return { ok: false, reason: 'materialize', detail: materialized.reason };
    }
    state.ordinal = ordinal;
    state.firstEncountered = true;
    state.movementSeconds = 0;
    state.activeEvent = event;
    runtime.placementRetryUntil = 0;
    runtime.lastFailure = null;
    bus.emit('merchant:discovered', {
      rid: rid, eventId: event.id, merchantProfileId: profile.id,
      x: event.x, y: event.y, remainingSeconds: event.remainingSeconds
    });
    return { ok: true, event: event, actor: materialized.actor };
  }

  function finishEvent(reason) {
    var rid = Game.state.world.region;
    var state = regionState(rid);
    var event = state && state.activeEvent;
    if (!event) return false;
    if (runtime.surrenderPromptedEventId === event.id) {
      runtime.surrenderPromptedEventId = null;
    }
    closeRuntime('merchant-' + (reason || 'closed'));
    state.activeEvent = null;
    state.movementSeconds = 0;
    var offenseSteps = event.offenseApplied
      ? Math.min(MAX_OFFENSE_COOLDOWN_STEPS, Math.max(1, guild().offenses | 0))
      : 0;
    var cooldownSeconds = RECUR_COOLDOWN + offenseSteps * OFFENSE_COOLDOWN_STEP;
    state.cooldownUntil = (Number(Game.state.world.worldTime) || 0) + cooldownSeconds;
    state.targetSeconds = targetFor(rid, state.ordinal, true);
    bus.emit('merchant:departed', {
      rid: rid,
      eventId: event.id,
      merchantProfileId: event.merchantProfileId,
      reason: reason || 'departed',
      cooldownSeconds: cooldownSeconds
    });
    return true;
  }

  function eligibleDiscovery() {
    var world = Game.world, state = Game.state;
    if (!world || !world.hero || !world.layout || !state || !Game.State.isAdventureStarted()) return false;
    if (state.world.mode !== 'battle' || world.bossEnt || world.hero.encounterId ||
        world.hero.interactOrder || world.hero.state === 'dead' ||
        world.hero.state === 'recover' || world.hero.state === 'entrance') return false;
    if (Game.entryState !== undefined && Game.entryState !== 'active') return false;
    if (Game.transitions && Game.transitions.isActive()) return false;
    if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return false;
    return true;
  }

  function recordHeroMovement(moved) {
    if (catchupPaused || !(moved > 0.01) || !eligibleDiscovery()) return false;
    var rid = Game.state.world.region;
    var state = regionState(rid);
    if (state.activeEvent || Game.state.world.worldTime < state.cooldownUntil) return false;
    state.movementSeconds += Math.min(moved / MOVE_SPEED_REF, 0.25);
    if (state.movementSeconds < state.targetSeconds) return false;
    if (worldTime() < runtime.placementRetryUntil) return false;
    return discover().ok;
  }

  function allowBossChallenge(regionId) {
    var rid = regionId || Game.state.world.region;
    var state = regionState(rid);
    if (!state) return true;
    if (state.firstEncountered) return worldTime() >= runtime.bossGuaranteeUntil;
    var result = discover({ regionId: rid });
    if (!result.ok) return true;
    runtime.bossGuaranteeUntil = worldTime() + BOSS_GUARANTEE_HOLD_SECONDS;
    return false;
  }

  function dialogueState(actor, forcedState) {
    if (forcedState) return forcedState;
    var event = activeEvent();
    var g = guild();
    if (event && event.state === 'assault') return 'assault';
    if (trustBand() === 'refused') return 'refused';
    var hero = Game.world && Game.world.hero;
    if (hero && hero.hp / Math.max(1, hero.maxHp) < 0.35) return 'lowHp';
    if (trustBand() === 'favored') return 'favored';
    if (trustBand() === 'wary') return 'wary';
    var profileId = actor && actor.merchantProfileId || event && event.merchantProfileId;
    if (profileId && g.metProfileIds.indexOf(profileId) < 0) return 'first';
    var weather = Game.weather && Game.weather.current && Game.weather.current();
    if (weather && ['storm', 'blizzard', 'ash', 'rain', 'snow'].indexOf(weather.kind) >= 0) {
      return 'weather';
    }
    return U.strSeed([
      event && event.id, event && event.stockRevision,
      Math.floor(Game.state.world.worldTime / 30)
    ].join('|')) % 3 === 0 ? 'region' : 'return';
  }

  function talk(actor, forcedState) {
    var event = activeEvent();
    var profileId = actor && actor.merchantProfileId || event && event.merchantProfileId;
    var profile = profileId && Game.content.get('merchantProfile', profileId);
    var dialogue = profile && Game.content.get('dialogueProfile', profile.dialogueProfileId);
    if (!profile || !dialogue) return null;
    var state = dialogueState(actor, forcedState);
    var lines = (dialogue.states[state] || dialogue.states.return || []).map(function (line) {
      return typeof line === 'string' ? line : line && line.lineKey;
    }).filter(Boolean);
    if (!lines.length) return null;
    var last = guild().lastLines[profileId];
    var candidates = lines.filter(function (key) { return key !== last; });
    if (!candidates.length) candidates = lines;
    var eventSeed = event && event.seed || U.strSeed(profileId);
    var key = candidates[U.strSeed([
      eventSeed, state, event && event.stockRevision || 0,
      Math.floor(Game.state.world.worldTime)
    ].join('|')) % candidates.length];
    guild().lastLines[profileId] = key;
    if (guild().metProfileIds.indexOf(profileId) < 0) guild().metProfileIds.push(profileId);
    var result = {
      state: state,
      key: key,
      text: Game.i18n.t(key),
      profileId: profileId,
      nameKey: profile.presentation.nameKey,
      portraitId: profile.presentation.portraitId
    };
    bus.emit('merchant:talked', result);
    return result;
  }

  function openTrade(actor) {
    var event = activeEvent();
    if (!event || event.state !== 'available' ||
        actor && actor.merchantEventId !== event.id) return { ok: false, reason: 'unavailable' };
    var area = tradeAreas()[0];
    if (!area) return { ok: false, reason: 'unavailable' };
    var current = Game.trade.current();
    if (!current.available || current.areaId !== area.id) {
      return Game.trade.requestApproach(area.id, {
        open: true, source: 'merchant-actor'
      });
    }
    if (Game.ui && Game.ui.trade) Game.ui.trade.open(area.id);
    return { ok: true, opened: true };
  }

  function attack(actor) {
    var event = activeEvent();
    var hero = Game.world && Game.world.hero;
    if (!event || event.state !== 'available' || !actor ||
        actor.id !== runtime.actorId || !hero) return { ok: false, reason: 'unavailable' };
    var sourceKey = hero.actorRecordId ? { actorRecordId: hero.actorRecordId } : null;
    var targetKey = Game.population.stableKey(actor);
    if (!sourceKey || !targetKey) return { ok: false, reason: 'target' };
    var result = Game.engagement.enqueue({
      sourceKey: sourceKey,
      targetKey: targetKey,
      kind: 'attack',
      encounterProfileId: 'encounter.merchant-assault.' + Game.state.world.region
    });
    if (result.ok && result.commandId) {
      runtime.pendingAttack[result.commandId] = event.id;
      bus.emit('merchant:attackQueued', {
        commandId: result.commandId, eventId: event.id
      });
    }
    return result;
  }

  function applyOffense(event, encounterId) {
    if (!event || event.offenseApplied) return;
    var baseDebt = F.gearBoxPrice(Math.max(1, Game.state.player.level));
    event.offenseApplied = true;
    event.offenseBaseDebt = baseDebt;
    event.state = 'assault';
    guild().trust = U.clamp(guild().trust - 25, -100, 100);
    guild().debtGold += baseDebt;
    guild().offenses++;
    bus.emit('merchant:assaultStarted', {
      eventId: event.id,
      encounterId: encounterId,
      debtAdded: baseDebt,
      trust: guild().trust
    });
  }

  function resolveSurrender(choice, offerId) {
    var event = activeEvent();
    if (!event || event.state !== 'surrendered') {
      return { ok: false, reason: 'unavailable' };
    }
    if (choice === 'spare') {
      var forgiven = Math.floor((event.offenseBaseDebt || 0) / 2);
      guild().debtGold = Math.max(0, guild().debtGold - forgiven);
      guild().trust = U.clamp(guild().trust + 10, -100, 100);
      var spared = {
        ok: true, choice: 'spare', trust: guild().trust,
        debtGold: guild().debtGold, forgiven: forgiven,
        dialogue: talk(null, 'spared')
      };
      finishEvent('spared');
      bus.emit('merchant:assaultResolved', spared);
      return spared;
    }
    if (choice !== 'rob') return { ok: false, reason: 'choice' };
    var eligible = event.offers.filter(function (offer) {
      return offer.quantity > 0 && offer.cur === 'gold' && offer.eligibleRobbery;
    });
    var offer = offerId && offerById(event, offerId);
    if (offerId && (!offer || eligible.indexOf(offer) < 0)) {
      return { ok: false, reason: 'offer' };
    }
    if (!offer) offer = eligible[0];
    if (!offer) return { ok: false, reason: 'no-loot' };
    var robberyDebt = robberyDebtFor(offer);
    var reward = grantOffer(offer, 'merchant-robbery');
    offer.quantity--;
    guild().trust = U.clamp(guild().trust - 15, -100, 100);
    guild().debtGold += robberyDebt;
    var robbed = Object.assign(reward, {
      choice: 'rob', trust: guild().trust,
      debtAdded: robberyDebt,
      debtGold: guild().debtGold,
      offerId: offer.id
    });
    finishEvent('robbed');
    bus.emit('merchant:assaultResolved', robbed);
    return robbed;
  }

  function payRestitution(context) {
    if (context && !currentEventForTrade(context)) return { ok: false, reason: 'unavailable' };
    var amount = Math.round(guild().debtGold || 0);
    if (!(amount > 0)) return { ok: false, reason: 'no-debt' };
    if (Game.state.player.gold < amount) return { ok: false, reason: 'poor', amount: amount };
    Game.player.addGold(-amount, { raw: true });
    guild().debtGold = 0;
    guild().trust = Math.max(20, guild().trust);
    var dialogue = talk(null, 'restitution');
    var result = { ok: true, amount: amount, trust: guild().trust, dialogue: dialogue };
    bus.emit('merchant:restitutionPaid', result);
    bus.emit('merchant:stockChanged', {
      eventId: activeEvent() && activeEvent().id, reason: 'restitution'
    });
    return result;
  }

  function tradeAreas() {
    var event = activeEvent();
    if (!event || event.state !== 'available') return [];
    var profile = Game.content.get('merchantProfile', event.merchantProfileId);
    return [{
      id: 'merchant-trade:' + event.id,
      kind: 'wander',
      anchor: { x: event.x, y: event.y },
      radius: TRADE_RADIUS,
      catalogs: ['merchant-event'],
      priority: 80,
      nameKey: profile.presentation.nameKey,
      prop: { sprite: profile.presentation.wagonSpriteId || 'trade_wagon_wander' },
      providerType: 'merchant',
      providerId: profile.id,
      eventId: event.id,
      offerSetId: event.id,
      merchantProfileId: profile.id
    }];
  }

  function enterRegion(regionId) {
    if (runtime.regionId !== regionId) runtime.surrenderPromptedEventId = null;
    closeRuntime('merchant-region');
    runtime.regionId = regionId;
    var event = activeEvent(regionId);
    if (!event) return;
    if (event.state === 'assault') {
      finishEvent('escaped-on-reload');
      return;
    }
    if (event.state === 'available') materializeEvent(event);
  }

  function surrenderPayload(event) {
    return {
      eventId: event.id,
      merchantProfileId: event.merchantProfileId,
      eligibleOffers: event.offers.filter(function (offer) {
        return offer.quantity > 0 && offer.cur === 'gold' && offer.eligibleRobbery;
      }).map(decoratedRobberyOffer),
      trust: guild().trust,
      debtGold: guild().debtGold
    };
  }

  function resetSurrenderPrompt(eventId) {
    if (!eventId || runtime.surrenderPromptedEventId === eventId) {
      runtime.surrenderPromptedEventId = null;
      return true;
    }
    return false;
  }

  function canPromptSurrender() {
    var hero = Game.world && Game.world.hero;
    return Game.entryState === 'active' && hero && hero.state !== 'dead' &&
      hero.state !== 'recover' && !hero.encounterId &&
      !(Game.transitions && Game.transitions.isActive()) &&
      !(Game.ending && Game.ending.isActive && Game.ending.isActive()) &&
      Game.ui && Game.ui.modals;
  }

  function update(dt) {
    if (catchupPaused) return;
    var event = activeEvent();
    if (!event) return;
    if (event.state === 'surrendered') {
      if (runtime.surrenderPromptedEventId !== event.id &&
          canPromptSurrender()) {
        runtime.surrenderPromptedEventId = event.id;
        bus.emit('merchant:surrendered', surrenderPayload(event));
      }
      return;
    }
    if (event.state === 'available') {
      var paused = typeof document !== 'undefined' && document.hidden ||
        Game.ui && Game.ui.trade && Game.ui.trade.isOpen() ||
        Game.world && Game.world.hero && Game.world.hero.encounterId ||
        Game.transitions && Game.transitions.isActive();
      if (!paused) {
        event.remainingSeconds = Math.max(0, event.remainingSeconds - Math.max(0, dt || 0));
        if (event.remainingSeconds <= 0) {
          finishEvent('expired');
          return;
        }
      }
      if (!runtime.actorId && worldTime() >= runtime.materializeRetryUntil) materializeEvent(event);
      return;
    }
    if (event.state !== 'assault') return;
    var actor = runtime.actorId && Game.actors.get(runtime.actorId);
    if (!actor || !actor.encounterId || actor.hp / Math.max(1, actor.maxHp) > 0.4) return;
    var state = actor.components.actionState;
    if (state && (state.state === 'casting' || state.state === 'channeling') &&
        state.abilityId === 'merchant.escape') return;
    Game.combat.requestAction({
      actorId: actor.id,
      targetId: actor.id,
      abilityId: 'merchant.escape'
    });
  }

  function onCommitted(payload) {
    var detail = payload && payload.payload || payload || {};
    var eventId = runtime.pendingAttack[detail.commandId];
    if (!eventId) return;
    delete runtime.pendingAttack[detail.commandId];
    var event = activeEvent();
    if (!event || event.id !== eventId) return;
    applyOffense(event, detail.encounterId || payload.encounterId);
  }

  function onRejected(payload) {
    var commandId = payload && payload.commandId;
    if (!commandId || !runtime.pendingAttack[commandId]) return;
    delete runtime.pendingAttack[commandId];
    bus.emit('merchant:attackRejected', payload);
  }

  function onCombatHit(payload) {
    var event = activeEvent();
    if (!event || event.state !== 'assault' || !runtime.actorId ||
        !payload.targetActorIds || payload.targetActorIds.indexOf(runtime.actorId) < 0) return;
    var actor = Game.actors.get(runtime.actorId);
    if (!actor || actor.hp > 0) return;
    actor.hp = 1;
    event.state = 'surrendered';
    var encounterId = actor.encounterId || payload.encounterId;
    if (encounterId) {
      Game.encounters.leave(encounterId, actor.id, 'surrender');
      var outcome = Game.encounters.checkEnd(encounterId);
      if (outcome && outcome.done) Game.encounters.end(encounterId, outcome.reason, outcome);
    }
    closeRuntime('merchant-surrender');
    runtime.surrenderPromptedEventId = event.id;
    bus.emit('merchant:surrendered', surrenderPayload(event));
  }

  function onEncounterLeft(payload) {
    var event = activeEvent();
    if (!event || event.state !== 'assault' || payload.sourceActorId !== runtime.actorId ||
        !payload.payload || payload.payload.reason !== 'escape') return;
    if (payload.encounterId) {
      Game.encounters.end(payload.encounterId, 'merchant-escaped', {
        done: true,
        status: 'failure',
        reason: 'merchant-escaped',
        rewardAuthorizedActorIds: []
      });
    }
    closeRuntime('merchant-escaped');
    finishEvent('escaped');
  }

  function onEncounterEnded(payload) {
    var event = activeEvent();
    if (!event || event.state !== 'assault' || !payload || !payload.encounterId) return;
    var encounter = Game.encounters && Game.encounters.get(payload.encounterId);
    if (!encounter || encounter.profileId !==
        'encounter.merchant-assault.' + Game.state.world.region) return;
    var reason = payload.payload && payload.payload.reason;
    if (reason === 'merchant-escaped') return;
    if (reason === 'retreat') finishEvent('escaped-on-retreat');
    else if (reason === 'travel' || reason === 'region-change') finishEvent('escaped-on-travel');
    else if (reason === 'player-defeated') finishEvent('escaped-on-defeat');
    else finishEvent('escaped-on-encounter-end');
  }

  var Merchants = Game.merchants = {
    constants: {
      eventTtl: EVENT_TTL,
      recurringCooldown: RECUR_COOLDOWN,
      offenseCooldownStep: OFFENSE_COOLDOWN_STEP,
      maxOffenseCooldownSteps: MAX_OFFENSE_COOLDOWN_STEPS,
      movementSpeedRef: MOVE_SPEED_REF,
      patrolRadius: PATROL_RADIUS,
      tradeRadius: TRADE_RADIUS,
      minHeroDistance: MIN_HERO_DISTANCE,
      maxHeroDistance: MAX_HERO_DISTANCE
    },
    state: rootState,
    guild: guild,
    regionState: regionState,
    profileForRegion: profileForRegion,
    activeEvent: activeEvent,
    actorForEvent: actorForEvent,
    trustBand: trustBand,
    priceMultiplier: priceMultiplier,
    tradeAreas: tradeAreas,
    offers: visibleOffers,
    canBuy: canBuy,
    buy: buy,
    haggle: haggle,
    haggleFee: haggleFee,
    talk: talk,
    openTrade: openTrade,
    attack: attack,
    resolveSurrender: resolveSurrender,
    robberyDebtFor: robberyDebtFor,
    payRestitution: payRestitution,
    resetSurrenderPrompt: resetSurrenderPrompt,
    recordHeroMovement: recordHeroMovement,
    allowBossChallenge: allowBossChallenge,
    inspectPlacement: function (options) { return clone(placementAudit(options)); },
    configurePatrolActor: configurePatrolActor,
    discover: discover,
    finishEvent: finishEvent,
    enterRegion: enterRegion,
    update: update,
    setCatchupPaused: function (paused) { catchupPaused = !!paused; },
    runtime: function () { return clone(runtime); },
    inspect: function () {
      return clone({
        guild: guild(),
        region: regionState(Game.state.world.region),
        runtime: runtime
      });
    },
    debugForceDiscover: function () {
      var hero = Game.world && Game.world.hero;
      return discover({
        placement: hero ? {
          x: hero.x + 72, y: hero.y + 18, anchorKey: 'debug-near-hero'
        } : null
      });
    },
    debugSetTrust: function (value) {
      guild().trust = U.clamp(Number(value) || 0, -100, 100);
      bus.emit('merchant:stockChanged', {
        eventId: activeEvent() && activeEvent().id,
        reason: 'debug-trust'
      });
      return guild().trust;
    },
    debugCommitAssault: function () {
      var event = activeEvent();
      if (!event || event.state !== 'available') return { ok: false, reason: 'unavailable' };
      applyOffense(event, 'merchant-demo');
      return { ok: true, event: clone(event), guild: clone(guild()) };
    },
    debugForceSurrender: function () {
      var event = activeEvent();
      if (!event || event.state !== 'assault') return { ok: false, reason: 'unavailable' };
      event.state = 'surrendered';
      closeRuntime('merchant-demo-surrender');
      var payload = surrenderPayload(event);
      runtime.surrenderPromptedEventId = event.id;
      bus.emit('merchant:surrendered', payload);
      return Object.assign({ ok: true }, payload);
    }
  };

  bus.on('region:changed', function (payload) {
    Merchants.enterRegion(payload.rid);
  });
  bus.on('engagement:committed', onCommitted);
  bus.on('engagement:rejected', onRejected);
  bus.on('combat:hit', onCombatHit);
  bus.on('encounter:left', onEncounterLeft);
  bus.on('encounter:ended', onEncounterEnded);
  bus.on('player:death', function () {
    var event = activeEvent();
    if (event && event.state === 'assault') finishEvent('escaped-on-defeat');
  });
  bus.on('region:travelStart', function () {
    var event = activeEvent();
    if (event && event.state === 'assault') finishEvent('escaped-on-travel');
  });
})();
