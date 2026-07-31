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
  var MOVE_SPEED_REF = 56;
  var runtime = {
    regionId: null,
    eventId: null,
    actorId: null,
    spawnId: null,
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

  function legalPlacement(profile, seed) {
    var world = Game.world, layout = world && world.layout, hero = world && world.hero;
    if (!layout || !hero) return null;
    var points = (layout.spawnCandidates || []).concat(layout.threats || []);
    if (!points.length) return null;
    var start = seed % points.length;
    for (var i = 0; i < points.length; i++) {
      var point = points[(start + i) % points.length];
      var distance = U.dist(hero.x, hero.y, point.x, point.y);
      if (distance < 120 || distance > 520) continue;
      if (layout.camp && U.dist(point.x, point.y, layout.camp.x, layout.camp.y) <
          Math.max(130, Number(layout.campSafeRadius) || 0)) continue;
      if (layout.bossPoint && U.dist(point.x, point.y, layout.bossPoint.x, layout.bossPoint.y) <
          Math.max(90, Number(layout.bossSafeRadius) || 0)) continue;
      var inspected = Game.population.inspectPlacement(
        profile.spawnProfileId,
        { key: point.id || 'merchant:' + i, x: point.x, y: point.y },
        layout
      );
      if (inspected.ok) return {
        x: inspected.candidate.x,
        y: inspected.candidate.y,
        anchorKey: point.id || 'candidate:' + ((start + i) % points.length)
      };
    }
    return null;
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
    if (!event || event.state !== 'available' || !Game.world || !Game.world.layout) return null;
    if (runtime.eventId === event.id && runtime.actorId) {
      return Game.actors.get(runtime.actorId);
    }
    closeRuntime('merchant-remount');
    var profile = Game.content.get('merchantProfile', event.merchantProfileId);
    var result = Game.population.materialize(profile.spawnProfileId, {
      regionId: Game.state.world.region,
      populationId: 'merchant-runtime',
      layoutSlotKey: event.anchorKey || event.id,
      spawnRequestKey: event.id,
      x: event.x,
      y: event.y,
      tier: Game.State.regionTier(Game.state.world.region),
      rewardMultiplier: 0
    });
    if (!result.ok) return null;
    var actor = result.primary;
    actor.merchantEventId = event.id;
    actor.merchantProfileId = event.merchantProfileId;
    actor.spawnX = event.x;
    actor.spawnY = event.y;
    actor.wanderT = 999999;
    runtime.regionId = Game.state.world.region;
    runtime.eventId = event.id;
    runtime.actorId = actor.id;
    runtime.spawnId = result.lease.spawnId;
    Game.world.attachActor(actor, 'merchant-event');
    return actor;
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
    var placement = options.placement || legalPlacement(profile, seed);
    if (!placement) return { ok: false, reason: 'placement' };
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
    state.ordinal = ordinal;
    state.firstEncountered = true;
    state.movementSeconds = 0;
    state.activeEvent = event;
    materializeEvent(event);
    bus.emit('merchant:discovered', {
      rid: rid, eventId: event.id, merchantProfileId: profile.id,
      x: event.x, y: event.y, remainingSeconds: event.remainingSeconds
    });
    return { ok: true, event: event, actor: Game.actors.get(runtime.actorId) };
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
    state.cooldownUntil = (Number(Game.state.world.worldTime) || 0) + RECUR_COOLDOWN;
    state.targetSeconds = targetFor(rid, state.ordinal, true);
    bus.emit('merchant:departed', {
      rid: rid,
      eventId: event.id,
      merchantProfileId: event.merchantProfileId,
      reason: reason || 'departed'
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
    return discover().ok;
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
    if (!offer || eligible.indexOf(offer) < 0) offer = eligible[0];
    if (!offer) return { ok: false, reason: 'no-loot' };
    var displayedPrice = Math.max(1, Math.round(offer.basePrice * priceMultiplier()));
    var reward = grantOffer(offer, 'merchant-robbery');
    offer.quantity--;
    guild().trust = U.clamp(guild().trust - 15, -100, 100);
    guild().debtGold += displayedPrice * 2;
    var robbed = Object.assign(reward, {
      choice: 'rob', trust: guild().trust,
      debtAdded: displayedPrice * 2,
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
      radius: 58,
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
      }).map(decoratedOffer),
      trust: guild().trust,
      debtGold: guild().debtGold
    };
  }

  function update(dt) {
    if (catchupPaused) return;
    var event = activeEvent();
    if (!event) return;
    if (event.state === 'surrendered') {
      if (runtime.surrenderPromptedEventId !== event.id &&
          Game.entryState === 'active' && Game.ui && Game.ui.modals) {
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
      if (!runtime.actorId) materializeEvent(event);
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
    var outcome = payload.encounterId && Game.encounters.checkEnd(payload.encounterId);
    if (outcome && outcome.done) {
      Game.encounters.end(payload.encounterId, 'merchant-escaped', outcome);
    }
    closeRuntime('merchant-escaped');
    finishEvent('escaped');
  }

  var Merchants = Game.merchants = {
    constants: {
      eventTtl: EVENT_TTL,
      recurringCooldown: RECUR_COOLDOWN,
      movementSpeedRef: MOVE_SPEED_REF
    },
    state: rootState,
    guild: guild,
    regionState: regionState,
    profileForRegion: profileForRegion,
    activeEvent: activeEvent,
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
    payRestitution: payRestitution,
    recordHeroMovement: recordHeroMovement,
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
  bus.on('player:death', function () {
    var event = activeEvent();
    if (event && event.state === 'assault') finishEvent('escaped-on-defeat');
  });
  bus.on('region:travelStart', function () {
    var event = activeEvent();
    if (event && event.state === 'assault') finishEvent('escaped-on-travel');
  });
})();
