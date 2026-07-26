/* ============================================================
 * ui/trade.js — 三入口共用的统一交易面板
 *
 * 世界实体、HUD 上下文按钮与背包发现页都复用 render()。离域时
 * 保留浏览内容但即时锁定；换区/死亡/过场则关闭独立面板。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;
  var UI = Game.ui;

  var opened = false;
  var openedAreaId = null;
  var selectedSection = null;

  function areaName(area) {
    return area && area.nameKey
      ? Game.i18n.t(area.nameKey)
      : Game.i18n.t('tradeArea.generic');
  }

  function materialCostHtml(recipe) {
    var parts = [];
    for (var id in recipe.costs) {
      parts.push(
        '<span class="exchange-cost' +
        (Game.inv.materialCount(id) < recipe.costs[id] ? ' missing' : '') + '">' +
        U.esc(Game.i18n.t('material.' + id)) + ' ' +
        Game.inv.materialCount(id) + '/' + recipe.costs[id] + '</span>'
      );
    }
    if (recipe.crystal) {
      parts.push('<span class="exchange-cost">' +
        U.esc(Game.i18n.t('ui.crystal')) + ' ' +
        Game.state.player.crystal + '/' + recipe.crystal + '</span>');
    }
    return parts.join('');
  }

  function renderOffer(root, def, locked) {
    var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
    var owned = '';
    if (def.kind === 'perm') {
      owned = '<span class="badge">' + Game.shop.ownedCount(def) + '/' + Game.F.PERM_MAX + '</span>';
    } else if (def.kind === 'potion') {
      owned = '<span class="badge">×' + Game.shop.ownedCount(def) + '</span>';
    } else if (def.kind === 'exchange') {
      var exchangeRecipe = Game.F.exchangeRecipe(def.recipe);
      if (exchangeRecipe && exchangeRecipe.reward.kind === 'perm') {
        owned = '<span class="badge">' + Game.shop.ownedCount(def) + '/' +
          exchangeRecipe.reward.max + '</span>';
      }
    }
    var buyCopy = '';
    if (def.kind === 'exchange') {
      buyCopy = t('ui.exchangeAction');
    } else {
      var price = Game.shop.price(def);
      var curIcon = def.cur === 'crystal' ? 'icon_crystal' : 'icon_gold';
      buyCopy = '<canvas width="14" height="14" data-icon="' + curIcon + '"></canvas>' + fmt(price);
    }
    var card = U.el('div', 'card trade-offer' + (locked ? ' trade-offer-locked' : ''),
      '<div class="row">' +
      '<canvas width="30" height="30" data-icon="' + def.icon + '"></canvas>' +
      '<div class="grow"><div class="name">' + t('shop.' + def.id + '.name') + owned + '</div>' +
      '<div class="desc">' + t('shop.' + def.id + '.desc') + '</div>' +
      (def.kind === 'exchange'
        ? '<div class="exchange-costs">' + materialCostHtml(Game.F.exchangeRecipe(def.recipe)) + '</div>'
        : '') +
      '</div><button class="btn small buy-btn">' + buyCopy + '</button></div>');
    var btn = card.querySelector('.buy-btn');
    btn.disabled = locked || !Game.shop.canBuy(def);
    btn.addEventListener('click', function () {
      var result = Game.shop.buy(def.id);
      if (result.ok) {
        Game.ui.modals.toast(
          result.item
            ? t('ui.gotItem', { name: UI.itemName(result.item) })
            : (def.kind === 'exchange' ? t('ui.exchanged') : t('ui.bought'))
        );
        UI.tabs.rerender();
      } else {
        Game.ui.modals.toast(
          result.reason === 'poor' || result.reason === 'materials'
            ? t('ui.cantAfford')
            : t('ui.tradeUnavailableToast'),
          'warn'
        );
      }
    });
    root.appendChild(card);
  }

  function sellEstimate(maxRar) {
    var count = 0, gold = 0;
    var items = Game.state.inv.items;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (Game.inv.isEquipped(item.uid) || item.rar > maxRar) continue;
      count++;
      gold += Game.F.sellPrice(item.ilvl, item.rar);
    }
    return { count: count, gold: gold };
  }

  function legendaryEstimate() {
    var count = 0, crystal = 0;
    var items = Game.state.inv.items;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (Game.inv.isEquipped(item.uid) || item.rar !== 4) continue;
      count++;
      crystal += Game.F.salvageCrystal(item.ilvl);
    }
    return { count: count, crystal: crystal };
  }

  function renderSell(root, locked) {
    var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
    var low = sellEstimate(1);
    var legends = legendaryEstimate();
    var lowCard = U.el('div', 'card trade-sell-card',
      '<div class="row"><div class="grow"><div class="name">' + t('ui.tradeSellLow') + '</div>' +
      '<div class="desc">' + t('ui.tradeSellEstimate', { n: low.count, g: fmt(low.gold) }) + '</div></div>' +
      '<button class="btn small">' + t('ui.sellAction') + '</button></div>');
    var lowBtn = lowCard.querySelector('button');
    lowBtn.disabled = locked || !low.count;
    lowBtn.addEventListener('click', function () {
      var result = Game.inv.sellBelow(1);
      Game.ui.modals.toast(t('ui.soldN', { n: result.count, g: fmt(result.gold) }));
      UI.tabs.rerender();
    });
    root.appendChild(lowCard);

    var legendCard = U.el('div', 'card trade-sell-card',
      '<div class="row"><div class="grow"><div class="name">' + t('ui.tradeSalvageLegend') + '</div>' +
      '<div class="desc">' + t('ui.tradeSalvageEstimate', { n: legends.count, c: fmt(legends.crystal) }) + '</div></div>' +
      '<button class="btn small">' + t('ui.salvageAction') + '</button></div>');
    var legendBtn = legendCard.querySelector('button');
    legendBtn.disabled = locked || !legends.count;
    legendBtn.addEventListener('click', function () {
      var list = Game.state.inv.items.filter(function (item) {
        return item.rar === 4 && !Game.inv.isEquipped(item.uid);
      });
      for (var i = 0; i < list.length; i++) Game.inv.sell(list[i].uid);
      Game.ui.modals.toast(t('ui.tradeSalvaged', { n: list.length, c: fmt(legends.crystal) }));
      UI.tabs.rerender();
    });
    root.appendChild(legendCard);
  }

  var TradeUI = UI.trade = {
    init: function () {},

    isOpen: function () { return opened; },

    open: function (areaId) {
      var context = Game.trade.current();
      if (!areaId && context.available) areaId = context.areaId;
      if (!areaId) return false;
      opened = true;
      openedAreaId = areaId;
      selectedSection = null;
      return UI.tabs.open('trade', true);
    },

    close: function () {
      if (!opened) return false;
      opened = false;
      openedAreaId = null;
      selectedSection = null;
      if (UI.tabs.current() === 'trade') UI.tabs.open('battle', true);
      return true;
    },

    render: function (root, opts) {
      opts = opts || {};
      var t = Game.i18n.t;
      var context = Game.trade.current();
      var targetArea = Game.trade.areaById(
        opts.areaId || openedAreaId || (context.nearest && context.nearest.id)
      );
      var active = context.available &&
        (!targetArea || context.areaId === targetArea.id);
      if (active) targetArea = Game.trade.areaById(context.areaId) || targetArea;
      var locked = !active;
      var rid = context.regionId || Game.state.world.region;
      var regionName = t('region.' + rid + '.name');

      var head = U.el('div', 'trade-panel-head kind-' + (targetArea && targetArea.kind || 'merchant'),
        '<div class="trade-status-mark" aria-hidden="true"></div>' +
        '<div class="grow"><div class="trade-kicker">' + t('ui.tradeLocationKicker') + '</div>' +
        '<div class="name">' + U.esc(areaName(targetArea)) + '</div>' +
        '<div class="desc">' + U.esc(regionName) + ' · ' +
        t('tradeKind.' + (targetArea && targetArea.kind || 'merchant')) + '</div></div>');
      if (!opts.embedded) {
        var close = U.el('button', 'btn small trade-close', t('ui.closeTrade'));
        close.addEventListener('click', function () { TradeUI.close(); });
        head.appendChild(close);
      }
      root.appendChild(head);

      if (locked) {
        var reason = context.reason === 'busy' ? t('ui.tradeBusy') : t('ui.tradeLeftArea');
        var gate = U.el('div', 'trade-lock-banner',
          '<div class="name">' + t('ui.tradeLockedBrowse') + '</div>' +
          '<div class="desc">' + reason + '</div>');
        if (targetArea) {
          var distance = Game.world.hero
            ? Math.round(U.dist(Game.world.hero.x, Game.world.hero.y, targetArea.x, targetArea.y))
            : 0;
          var direction = Game.trade.directionTo(targetArea);
          gate.querySelector('.desc').textContent += ' ' +
            t('ui.tradeDirectionDistance', { direction: t('direction.' + direction), distance: distance });
          var go = U.el('button', 'btn small trade-return-btn', t('ui.tradeGoTo'));
          go.disabled = context.reason === 'busy';
          go.addEventListener('click', function () {
            var result = Game.trade.requestApproach(targetArea.id, {
              open: true,
              source: opts.embedded ? 'bag' : 'panel'
            });
            if (result.ok && !result.opened) UI.tabs.open('battle', true);
          });
          gate.appendChild(go);
        }
        root.appendChild(gate);
      }

      if (!targetArea) {
        root.appendChild(U.el('div', 'card', '<div class="desc">' + t('ui.tradeNoArea') + '</div>'));
        return;
      }

      var browseContext = active ? context : {
        available: true,
        catalogs: targetArea.catalogs || [],
        regionId: rid,
        areaId: targetArea.id
      };
      var sections = {};
      var order = [];
      Game.shop.offers(browseContext).forEach(function (def) {
        var section = def.section || 'other';
        if (!sections[section]) {
          sections[section] = [];
          order.push(section);
        }
        sections[section].push(def);
      });
      sections.sell = [];
      order.push('sell');
      if (!selectedSection || order.indexOf(selectedSection) < 0) selectedSection = order[0];

      var tabs = U.el('div', 'trade-section-tabs');
      order.forEach(function (section) {
        var button = U.el(
          'button',
          'subtab' + (selectedSection === section ? ' active' : ''),
          t('shopSec.' + section)
        );
        button.addEventListener('click', function () {
          selectedSection = section;
          UI.tabs.rerender();
        });
        tabs.appendChild(button);
      });
      root.appendChild(tabs);

      if (selectedSection === 'sell') {
        renderSell(root, locked);
      } else {
        var offers = sections[selectedSection] || [];
        for (var i = 0; i < offers.length; i++) renderOffer(root, offers[i], locked);
        if (!offers.length) {
          root.appendChild(U.el('div', 'card', '<div class="desc">' + t('ui.tradeNoOffers') + '</div>'));
        }
      }
      UI.renderIcons(root);
    }
  };

  UI.panels.trade = function (root) {
    TradeUI.render(root, { embedded: false, areaId: openedAreaId });
  };

  bus.on('trade:contextChanged', function () {
    if (opened || (UI.tabs.current() === 'inv')) UI.tabs.queueRerender();
  });
  ['region:travelStart', 'player:death', 'game:completed'].forEach(function (event) {
    bus.on(event, function () { TradeUI.close(event); });
  });
})();
