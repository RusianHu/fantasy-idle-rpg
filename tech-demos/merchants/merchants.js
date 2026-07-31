/* global Game, DemoI18n */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var logs = [];
  var regionIds = [
    'grassland', 'forest', 'mine', 'graveyard',
    'snowpass', 'lavacave', 'skyruins', 'darkcastle'
  ];

  function tr(key, vars) { return DemoI18n.t('merchant.' + key, vars); }
  function gameText(key, vars) { return Game.i18n.t(key, vars); }
  function fmt(value) { return Game.i18n.fmtNum(value); }
  function hexSeed(value) {
    var clean = String(value || '').trim().replace(/^0x/i, '');
    return /^[0-9a-f]{1,8}$/i.test(clean) ? parseInt(clean, 16) >>> 0 : null;
  }
  function active() { return Game.merchants.activeEvent(); }
  function context() {
    var event = active();
    return event ? {
      available: true,
      providerType: 'merchant',
      providerId: event.merchantProfileId,
      eventId: event.id,
      offerSetId: event.id,
      regionId: Game.state.world.region,
      areaId: 'merchant-demo:' + event.id,
      catalogs: ['merchant-event']
    } : { available: false };
  }
  function offerName(offer) {
    if (offer.kind === 'gear') {
      var tier = Game.util.clamp(Math.ceil(offer.item.ilvl / 8), 1, 8);
      var base = offer.item.base === 'weapon'
        ? gameText('item.weapon.' + Game.state.player.classId)
        : gameText('item.base.' + offer.item.base);
      return gameText('item.pattern', {
        mat: gameText('item.mat.' + tier),
        base: base
      });
    }
    if (offer.kind === 'potion') {
      return gameText('shop.shop_' + offer.ref + '.name') + ' ×' + offer.count;
    }
    return gameText('material.' + offer.materialId) + ' ×' + offer.count;
  }
  function offerDetails(offer) {
    if (offer.kind === 'gear') {
      return gameText('rarity.r' + offer.item.rar) + ' · Lv.' + offer.item.ilvl +
        (offer.item.affixes.length
          ? ' · ' + offer.item.affixes.map(function (affix) {
            var def = Game.reg.get('affix', affix.id);
            var value = def.kind === 'pct'
              ? Math.round(affix.v * 100) + '%'
              : (def.dec ? affix.v.toFixed(1) : Math.round(affix.v));
            return gameText('affix.' + affix.id) + ' +' + value;
          }).join(' / ')
          : '');
    }
    return tr('bundle', { stock: offer.quantity });
  }
  function addLog(type, payload) {
    logs.unshift({
      at: new Date().toLocaleTimeString(),
      type: type,
      payload: payload || null
    });
    logs = logs.slice(0, 24);
    renderLog();
  }
  function renderLog() {
    $('event-log').innerHTML = logs.map(function (entry) {
      return '<li><strong>' + entry.at + ' ' + entry.type + '</strong>' +
        (entry.payload ? ' ' + JSON.stringify(entry.payload) : '') + '</li>';
    }).join('');
  }
  function setupWorld() {
    Game.world = {
      region: Game.reg.get('region', Game.state.world.region),
      layout: {
        version: 3,
        world: { w: 900, h: 520 },
        camp: { x: 80, y: 260 },
        bossPoint: { x: 820, y: 260 },
        spawnCandidates: []
      },
      hero: {
        id: 'merchant-demo-hero',
        kind: 'hero',
        actorRecordId: 'player-main',
        x: 320, y: 250,
        hp: 100, maxHp: 100,
        state: 'idle', interactOrder: null, encounterId: null
      },
      entities: [],
      bossEnt: null,
      attachActor: function (actor) {
        if (!this.entities.some(function (entry) { return entry.id === actor.id; })) {
          this.entities.push(actor);
        }
        return true;
      },
      detachActor: function (actorId) {
        this.entities = this.entities.filter(function (actor) { return actor.id !== actorId; });
        return true;
      }
    };
    Game.transitions = { isActive: function () { return false; } };
    Game.ending = { isActive: function () { return false; } };
    Game.entryState = 'active';
  }
  function resetScenario() {
    var seed = hexSeed($('seed').value);
    if (seed === null) {
      $('seed').setCustomValidity(tr('seedError'));
      $('seed').reportValidity();
      return;
    }
    $('seed').setCustomValidity('');
    var existing = active();
    if (existing) Game.merchants.finishEvent('demo-reset');
    Game.population.reset($('region').value);
    Game.actors.reset();
    Game.parties.reset();
    Game.parties.create({ id: 'party-player', maxMembers: 4 });
    Game.state.world.worldSeed = seed;
    Game.state.world.region = $('region').value;
    delete Game.state.world.merchants.regions[$('region').value];
    Game.world.region = Game.reg.get('region', $('region').value);
    Game.world.entities = [];
    Game.merchants.enterRegion($('region').value);
    var result = Game.merchants.debugForceDiscover();
    if (result.ok) {
      Game.world.hero.x = result.event.x;
      Game.world.hero.y = result.event.y;
      addLog('merchant:discovered', {
        eventId: result.event.id,
        seed: Game.util.hex32(result.event.seed)
      });
    }
    render();
  }
  function renderHero(event) {
    if (!event) {
      $('merchant-name').textContent = tr('noEvent');
      $('merchant-line').textContent = tr('noEventHint');
      $('event-badges').innerHTML = '';
      return;
    }
    var profile = Game.content.get('merchantProfile', event.merchantProfileId);
    $('merchant-name').textContent = gameText(profile.presentation.nameKey);
    var dialogue = Game.merchants.talk(null);
    $('merchant-line').textContent = dialogue ? '“' + dialogue.text + '”' : '—';
    Game.assets.drawToDom($('wagon'), profile.presentation.wagonSpriteId, 'sprite');
    Game.assets.drawToDom($('portrait'), profile.presentation.portraitId, 'icon');
    $('event-badges').innerHTML = [
      event.state.toUpperCase(),
      Game.util.hex32(event.seed),
      Math.ceil(event.remainingSeconds) + 's'
    ].map(function (value) { return '<span>' + value + '</span>'; }).join('');
  }
  function renderStock(event) {
    var root = $('stock-grid');
    root.innerHTML = '';
    if (!event) return;
    var band = Game.merchants.trustBand();
    event.offers.forEach(function (source) {
      var offer = Object.assign({}, source, {
        price: Math.max(1, Math.round(source.basePrice * Game.merchants.priceMultiplier()))
      });
      var hidden = band === 'wary' &&
        (offer.role === 'signature' || offer.role === 'rare');
      var card = document.createElement('article');
      card.className = 'offer ' + offer.role + (hidden ? ' hidden-stock' : '');
      card.innerHTML =
        '<canvas width="38" height="38"></canvas>' +
        '<div><div class="role">' + tr('role.' + offer.role) + '</div>' +
        '<h3>' + offerName(offer) + '</h3><p>' +
        (hidden ? tr('cabinetHidden') : offerDetails(offer)) + '</p></div>' +
        '<div class="price">' + fmt(offer.price) + ' G<br>' +
        tr('stockLeft', { n: offer.quantity }) + '</div>';
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = tr('buy');
      button.disabled = hidden || event.state !== 'available' ||
        !Game.merchants.canBuy(offer, context()).ok;
      button.addEventListener('click', function () {
        var result = Game.merchants.buy(offer.id, context());
        addLog('merchant:buy', {
          ok: result.ok,
          offerId: offer.id,
          price: result.price || null,
          reason: result.reason || null
        });
        render();
      });
      card.appendChild(button);
      root.appendChild(card);
      Game.assets.drawToDom(card.querySelector('canvas'), offer.icon, 'icon');
    });
  }
  function renderLedger() {
    var data = Game.merchants.guild();
    var band = Game.merchants.trustBand();
    var event = active();
    var rows = [
      [tr('ledgerTrust'), Math.round(data.trust) + ' / ' + gameText('merchant.ui.band.' + band)],
      [tr('ledgerDebt'), fmt(data.debtGold)],
      [tr('ledgerOffenses'), data.offenses],
      [tr('ledgerDiscount'), Math.round((1 - Game.merchants.priceMultiplier()) * 100) + '%'],
      [tr('ledgerState'), event ? event.state : '—']
    ];
    $('ledger').innerHTML = rows.map(function (row) {
      return '<div><dt>' + row[0] + '</dt><dd>' + row[1] + '</dd></div>';
    }).join('');
    $('restitution').disabled = !(data.debtGold > 0) ||
      Game.state.player.gold < data.debtGold;
  }
  function renderReport() {
    var snapshot = Game.merchants.inspect();
    var event = active();
    $('report').textContent = JSON.stringify({
      checks: {
        slotCount: event ? event.offers.length : 0,
        roles: event ? event.offers.reduce(function (out, offer) {
          out[offer.role] = (out[offer.role] || 0) + 1;
          return out;
        }, {}) : {},
        eventLocked: !!event,
        haggleSpent: !!(event && event.haggled),
        ordinaryRobberyOnly: event ? event.offers.filter(function (offer) {
          return offer.eligibleRobbery;
        }).every(function (offer) {
          return offer.cur === 'gold' &&
            offer.role !== 'signature' && offer.role !== 'rare';
        }) : true,
        normalRewardsDisabled: true,
        offlineDiscoveryDisabled: true
      },
      economy: {
        gold: Game.state.player.gold,
        potions: Game.state.inv.potions,
        materials: Game.state.inv.materials,
        items: Game.state.inv.items.length
      },
      domain: snapshot
    }, null, 2);
  }
  function render() {
    $('trust-value').textContent = Math.round(Game.merchants.guild().trust);
    $('trust').value = Math.round(Game.merchants.guild().trust);
    $('gold').value = Math.round(Game.state.player.gold);
    var event = active();
    renderHero(event);
    renderStock(event);
    renderLedger();
    renderReport();
    $('haggle').disabled = !event || event.state !== 'available' ||
      event.haggled || event.purchasedAny ||
      Game.state.player.gold < Game.merchants.haggleFee() ||
      Game.merchants.trustBand() === 'refused';
    $('attack').disabled = !event || event.state !== 'available';
    $('surrender').disabled = !event || event.state !== 'assault';
    $('spare').disabled = !event || event.state !== 'surrendered';
    $('rob').disabled = !event || event.state !== 'surrendered';
  }
  function bind() {
    $('new-event').addEventListener('click', resetScenario);
    $('region').addEventListener('change', resetScenario);
    $('trust').addEventListener('input', function () {
      Game.merchants.debugSetTrust(this.value);
      render();
    });
    $('gold').addEventListener('change', function () {
      Game.state.player.gold = Math.max(0, Number(this.value) || 0);
      render();
    });
    $('haggle').addEventListener('click', function () {
      var result = Game.merchants.haggle(context());
      addLog('merchant:haggle', result);
      render();
    });
    $('attack').addEventListener('click', function () {
      var result = Game.merchants.debugCommitAssault();
      addLog('merchant:assaultStarted', result);
      render();
    });
    $('surrender').addEventListener('click', function () {
      var result = Game.merchants.debugForceSurrender();
      addLog('merchant:surrendered', result);
      render();
    });
    $('spare').addEventListener('click', function () {
      var result = Game.merchants.resolveSurrender('spare');
      addLog('merchant:spared', result);
      render();
    });
    $('rob').addEventListener('click', function () {
      var event = active();
      var eligible = event && event.offers.filter(function (offer) {
        return offer.quantity > 0 && offer.eligibleRobbery;
      })[0];
      var result = Game.merchants.resolveSurrender('rob', eligible && eligible.id);
      addLog('merchant:robbed', result);
      render();
    });
    $('restitution').addEventListener('click', function () {
      var result = Game.merchants.payRestitution();
      addLog('merchant:restitutionPaid', result);
      render();
    });
    window.addEventListener('demo:locale', function () {
      Game.i18n.setLocale(DemoI18n.locale());
      populateRegions();
      render();
    });
  }
  function populateRegions() {
    var current = $('region').value || 'grassland';
    $('region').innerHTML = regionIds.map(function (id) {
      return '<option value="' + id + '">' +
        gameText('region.' + id + '.name') + '</option>';
    }).join('');
    $('region').value = current;
  }
  function boot() {
    var audit = Game.content.finalize({ strict: true });
    Game.state = Game.State.newGame();
    Game.state.settings.autoEquip = false;
    Game.player.setClass('fighter');
    Game.state.player.gold = 100000;
    setupWorld();
    Game.population.reset(Game.state.world.region);
    Game.parties.create({ id: 'party-player', maxMembers: 4 });
    DemoI18n.init();
    Game.i18n.setLocale(DemoI18n.locale());
    populateRegions();
    try {
      var params = new URLSearchParams(location.search);
      var requestedRegion = params.get('region');
      var requestedSeed = params.get('seed');
      if (regionIds.indexOf(requestedRegion) >= 0) $('region').value = requestedRegion;
      if (requestedSeed && hexSeed(requestedSeed) !== null) $('seed').value = requestedSeed;
    } catch (_) { /* file:// and legacy browser fallback */ }
    bind();
    $('build-id').textContent = Game.BUILD_ID;
    addLog('content:ready', {
      fingerprint: audit.fingerprint,
      merchantProfiles: Game.content.all('merchantProfile').length
    });
    resetScenario();
  }
  boot();
})();
