/* ============================================================
 * ui/panels_main.js — Tab 框架 + 角色（属性/统计/成就）+ 背包（背包/商店）
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus, reg = Game.reg;
  var $ = U.$;

  var TABS = ['battle', 'char', 'inv', 'skills', 'map', 'settings'];
  var ICONS = {
    battle: 'icon_nav_battle',
    char: 'icon_nav_char',
    inv: 'icon_nav_inv',
    skills: 'icon_nav_skills',
    map: 'icon_nav_map',
    settings: 'icon_nav_settings'
  };
  var current = 'battle';
  var charSub = 'attr';
  var invSub = 'bag';
  var refreshTimer = null;

  var UI = Game.ui = Game.ui || {};
  UI.panels = {};

  /* ================= 公共辅助 ================= */
  UI.itemName = function (item) {
    var t = Game.i18n.t;
    var tier = U.clamp(Math.ceil(item.ilvl / 8), 1, 8);
    var baseName = item.base === 'weapon'
      ? t('item.weapon.' + (Game.state.player.classId || 'fighter'))
      : t('item.base.' + item.base);
    return t('item.pattern', { mat: t('item.mat.' + tier), base: baseName });
  };

  UI.itemIcon = function (item) {
    if (item.base === 'weapon') {
      return 'icon_w_' + (Game.state.player.classId || 'fighter');
    }
    var slot = reg.get('slot', item.base);
    return slot ? slot.icon : 'icon_weapon';
  };

  UI.renderIcons = function (root) {
    var list = root.querySelectorAll('canvas[data-icon]');
    for (var i = 0; i < list.length; i++) {
      Game.assets.drawToDom(list[i], list[i].getAttribute('data-icon'), 'icon');
    }
  };

  UI.affixLine = function (af) {
    var def = reg.get('affix', af.id);
    if (!def) return '';
    var t = Game.i18n.t;
    var v = def.kind === 'pct' ? '+' + Math.round(af.v * 100) + '%' : '+' + (def.dec ? af.v.toFixed(1) : Game.i18n.fmtNum(af.v));
    return t('affix.' + af.id) + ' ' + v;
  };

  /* ================= Tab 框架 ================= */
  UI.tabs = {
    init: function () {
      var bar = $('#tabbar');
      bar.innerHTML = '';
      TABS.forEach(function (tab) {
        var b = U.el('button', 'tab-btn',
          '<span class="tab-ico"><canvas width="24" height="24" aria-hidden="true"></canvas></span>' +
          '<span class="tab-label"></span><span class="tab-dot"></span>');
        b.setAttribute('data-tab', tab);
        Game.assets.drawToDom(b.querySelector('canvas'), ICONS[tab], 'icon');
        b.addEventListener('click', function () { UI.tabs.open(tab); });
        bar.appendChild(b);
      });
      UI.tabs.relabel();
      UI.tabs.open('battle');

      bus.on('locale:changed', function () { UI.tabs.relabel(); UI.tabs.rerender(); });
      var rerenderOn = ['item:dropped', 'item:equipped', 'gold:changed', 'crystal:changed',
        'skill:upgraded', 'achievement:unlocked', 'player:levelup', 'shop:bought',
        'region:changed', 'boss:defeated', 'potion:used', 'potion:dropped',
        'skills:autoAllocated', 'equipment:autoChanged', 'slot:lockChanged',
        'trade:contextChanged'];
      rerenderOn.forEach(function (evt) {
        bus.on(evt, function () {
          if (current !== 'battle' && current !== 'settings') UI.tabs.queueRerender();
        });
      });
    },

    relabel: function () {
      var t = Game.i18n.t;
      U.$$('#tabbar .tab-btn').forEach(function (b) {
        b.querySelector('.tab-label').textContent = t('ui.tab.' + b.getAttribute('data-tab'));
      });
    },

    open: function (tab, force) {
      if (!force && Game.transitions && Game.transitions.isActive()) return false;
      current = tab;
      U.$$('#tabbar .tab-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === tab);
      });
      var pc = $('#panel-container');
      if (tab === 'battle') {
        pc.classList.add('hidden');
        return true;
      }
      pc.classList.remove('hidden');
      UI.tabs.rerender();
      return true;
    },

    queueRerender: function () {
      if (refreshTimer) return;
      refreshTimer = setTimeout(function () {
        refreshTimer = null;
        if (current !== 'battle') UI.tabs.rerender();
      }, 120);
    },

    rerender: function () {
      if (current === 'battle') return;
      var inner = $('#panel-inner');
      var fn = UI.panels[current];
      if (fn) {
        inner.innerHTML = '';
        fn(inner);
        UI.renderIcons(inner);
      }
    },

    current: function () { return current; }
  };

  /* ================= 角色面板 ================= */
  UI.panels.char = function (root) {
    var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
    var s = Game.state, p = s.player;

    var clsName = Game.player.hasClass() ? Game.i18n.t('class.' + p.classId + '.name') : '';
    var head = U.el('div', 'panel-title', t('ui.tab.char') +
      ' <span style="font-size:11px;color:var(--ink-dim)">' +
      (clsName ? clsName + ' · ' : '') + 'Lv.' + p.level + '</span>');
    root.appendChild(head);

    var subs = U.el('div', 'subtabs');
    [['attr', t('ui.sub.attr')], ['stats', t('ui.sub.stats')], ['ach', t('ui.sub.ach')]].forEach(function (pair) {
      var b = U.el('button', 'subtab' + (charSub === pair[0] ? ' active' : ''), pair[1]);
      b.addEventListener('click', function () { charSub = pair[0]; UI.tabs.rerender(); });
      subs.appendChild(b);
    });
    root.appendChild(subs);

    if (charSub === 'attr') {
      var d = Game.player.derived();
      var need = Game.F.expNeed(p.level);
      var rows = [
        [t('stat.hp'), fmt(Math.ceil(p.hp)) + ' / ' + fmt(d.maxHp)],
        [t('stat.atk'), fmt(d.atk)],
        [t('stat.def'), fmt(d.def)],
        [t('stat.spd'), d.spd.toFixed(1)],
        [t('stat.crit'), Math.round(d.crit * 100) + '%'],
        [t('stat.critDmg'), Math.round(d.critDmg * 100) + '%'],
        [t('stat.goldMul'), '+' + Math.round((d.goldMul - 1) * 100) + '%'],
        [t('stat.expMul'), '+' + Math.round((d.expMul - 1) * 100) + '%']
      ];
      rows.push([t('stat.attackType'), t(d.projectile ? 'ui.trait.ranged' : 'ui.trait.melee')]);
      if (d.dodge > 0) rows.push([t('stat.dodge'), Math.round(d.dodge * 100) + '%']);
      if (d.lifesteal > 0) rows.push([t('stat.lifesteal'), Math.round(d.lifesteal * 100) + '%']);
      if (d.cdr > 0) rows.push([t('stat.cdr'), Math.round(d.cdr * 100) + '%']);
      if (d.healPow > 1.001) rows.push([t('stat.healPow'), '+' + Math.round((d.healPow - 1) * 100) + '%']);
      var grid = U.el('div', 'stat-grid');
      rows.forEach(function (r) {
        grid.appendChild(U.el('div', 'stat-row', '<span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span>'));
      });
      root.appendChild(grid);

      var extra = U.el('div', 'card', '<div class="row"><div class="grow">' +
        '<div class="name">' + t('ui.expProgress') + '</div>' +
        '<div class="desc">' + fmt(p.exp) + ' / ' + fmt(need) + '　·　' + t('ui.spLeft', { n: p.sp }) + '</div>' +
        '</div></div>');
      extra.style.marginTop = '10px';
      root.appendChild(extra);

      var growth = U.el('div', 'card', '<div class="desc">' + t('ui.growthNote') + '</div>');
      root.appendChild(growth);
    } else if (charSub === 'stats') {
      var st = s.meta.stats;
      var fd = Game.i18n.fmtDur;
      var items = [
        ['kills', fmt(st.kills)], ['bossKills', fmt(st.bossKills)],
        ['goldEarned', fmt(st.goldEarned)], ['expEarned', fmt(st.expEarned)],
        ['drops', fmt(st.drops)], ['legendaries', fmt(st.legendaries)],
        ['potions', fmt(st.potions)], ['deaths', fmt(st.deaths)],
        ['maxHit', fmt(st.maxHit)], ['sells', fmt(st.sells)],
        ['playSec', fd(st.playSec)], ['restSec', fd(st.restSec)],
        ['offlineSec', fd(st.offlineSec)], ['highestRegion', st.highestRegion + ' / ' + reg.ids('region').length]
      ];
      var grid2 = U.el('div', 'stat-grid');
      items.forEach(function (r) {
        grid2.appendChild(U.el('div', 'stat-row', '<span class="k">' + t('statPage.' + r[0]) + '</span><span class="v">' + r[1] + '</span>'));
      });
      root.appendChild(grid2);
    } else {
      var done = s.meta.ach;
      var list = reg.all('achievement');
      var doneN = Game.meta.achievedCount();
      root.appendChild(U.el('div', 'card', '<div class="desc">' + t('ui.achProgress', { a: doneN, b: list.length }) + '</div>'));
      list.forEach(function (a) {
        var isDone = !!done[a.id];
        var prog = Game.meta.achProgress(a);
        var rew = [];
        if (a.reward.gold) rew.push(fmt(a.reward.gold) + ' ' + t('ui.gold'));
        if (a.reward.crystal) rew.push(fmt(a.reward.crystal) + ' ' + t('ui.crystal'));
        var card = U.el('div', 'card ach-card' + (isDone ? ' done' : ''),
          '<div class="row"><div class="grow">' +
          '<div class="name">' + (isDone ? '✓ ' : '') + t('ach.' + a.id + '.name') + '</div>' +
          '<div class="desc">' + t('ach.' + a.id + '.desc') + '</div>' +
          '<div class="prog"><b>' + fmt(prog) + '</b> / ' + fmt(a.threshold) + '　·　' + rew.join('　') + '</div>' +
          '</div></div>');
        root.appendChild(card);
      });
    }
  };

  /* ================= 背包面板 ================= */
  UI.panels.inv = function (root) {
    var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
    var s = Game.state;

    root.appendChild(U.el('div', 'panel-title', t('ui.tab.inv')));

    var subs = U.el('div', 'subtabs');
    var tradeContext = Game.trade.current();
    [['bag', t('ui.sub.bag')], ['shop', t('ui.sub.shop')]].forEach(function (pair) {
      var isShop = pair[0] === 'shop';
      var cls = 'subtab' + (invSub === pair[0] ? ' active' : '') +
        (isShop && !tradeContext.available ? ' trade-locked' : '');
      var b = U.el('button', cls, pair[1]);
      if (isShop) {
        b.title = t(tradeContext.available ? 'ui.tradeShopOpenHint' : 'ui.tradeShopLockedHint');
        b.setAttribute('aria-label', pair[1] + ' · ' + b.title);
      }
      b.addEventListener('click', function () { invSub = pair[0]; UI.tabs.rerender(); });
      subs.appendChild(b);
    });
    root.appendChild(subs);

    if (invSub === 'bag') renderBag(root);
    else renderShop(root);
  };

  function renderBag(root) {
    var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
    var s = Game.state;
    var inv = s.inv;

    // 智能换装快捷开关
    var autoRow = U.el('div', 'card automation-card', '<div class="row"><div class="grow">' +
      '<div class="name">' + t('settings.autoEquip') + '</div>' +
      '<div class="desc">' + t('settings.autoEquipHint') + '</div></div>' +
      '<button type="button" role="switch" aria-label="' + U.esc(t('settings.autoEquip')) +
      '" aria-checked="' + (s.settings.autoEquip ? 'true' : 'false') +
      '" class="toggle' + (s.settings.autoEquip ? ' on' : '') + '"></button></div>');
    autoRow.querySelector('.toggle').addEventListener('click', function () {
      Game.auto.setAutoEquip(!s.settings.autoEquip);
      UI.tabs.rerender();
    });
    root.appendChild(autoRow);

    // 已装备
    var strip = U.el('div', 'equip-strip');
    reg.ids('slot').forEach(function (slotId) {
      var uid = inv.equipped[slotId];
      var item = uid ? Game.inv.byUid(uid) : null;
      var slotDef = reg.get('slot', slotId);
      var cls = 'inv-slot' + (item ? ' r' + item.rar : '');
      var wrap = U.el('div', 'equip-slot-wrap' + (inv.lockedSlots[slotId] ? ' locked' : ''));
      var el = U.el('button', cls,
        '<canvas width="28" height="28" data-icon="' + slotDef.icon + '"></canvas>' +
        '<span class="slot-label">' + (item ? UI.itemName(item) : t('slot.' + slotId)) + '</span>');
      el.setAttribute('aria-label', item
        ? UI.itemName(item) + ' · ' + t('ui.equippedTag')
        : t('slot.' + slotId));
      if (item) {
        el.addEventListener('click', function () { Game.ui.modals.itemDetail(item); });
      }
      var locked = !!inv.lockedSlots[slotId];
      var lockBtn = U.el('button', 'slot-lock-btn' + (locked ? ' on' : ''),
        (locked ? '🔒 ' + t('ui.slotLocked') : '🔓 ' + t('ui.slotUnlocked')));
      lockBtn.title = locked
        ? t('ui.unlockSlotNamed', { slot: t('slot.' + slotId) })
        : t('ui.lockSlotNamed', { slot: t('slot.' + slotId) });
      lockBtn.setAttribute('aria-label', lockBtn.title);
      lockBtn.setAttribute('data-slot', slotId);
      lockBtn.addEventListener('click', function () {
        Game.auto.setSlotLocked(slotId, !Game.state.inv.lockedSlots[slotId]);
        UI.tabs.rerender();
      });
      wrap.appendChild(el);
      wrap.appendChild(lockBtn);
      strip.appendChild(wrap);
    });
    root.appendChild(strip);

    // 药水
    var pots = U.el('div', 'card', '<div class="row">' +
      '<canvas width="22" height="22" data-icon="icon_potion_small"></canvas><span style="font-size:12px">×' + Game.inv.potionCount('potion_small') + '</span>' +
      '<canvas width="22" height="22" data-icon="icon_potion_large" style="margin-left:12px"></canvas><span style="font-size:12px">×' + Game.inv.potionCount('potion_large') + '</span>' +
      '<div class="grow"></div><span class="desc" style="font-size:10px">' + t('ui.potionAuto', { p: Math.round(s.settings.potionThreshold * 100) }) + '</span></div>');
    root.appendChild(pots);

    // 一键出售
    var sellBar = U.el('div', '');
    sellBar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
    var btnSell = U.el('button', 'btn small', t('ui.sellLow'));
    btnSell.addEventListener('click', function () {
      var r = Game.inv.sellBelow(1);
      Game.ui.modals.toast(r.count > 0 ? t('ui.soldN', { n: r.count, g: fmt(r.gold) }) : t('ui.nothingToSell'));
      UI.tabs.rerender();
    });
    sellBar.appendChild(btnSell);
    var cap = U.el('span', '', inv.items.length + ' / ' + Game.inv.CAP);
    cap.style.cssText = 'font-size:11px;color:var(--ink-dim);align-self:center;margin-left:auto;';
    sellBar.appendChild(cap);
    root.appendChild(sellBar);

    // 物品网格（稀有度降序 → 等级降序）
    var items = inv.items.slice().sort(function (a, b) {
      if (Game.inv.isEquipped(b.uid) - Game.inv.isEquipped(a.uid) !== 0) return Game.inv.isEquipped(b.uid) - Game.inv.isEquipped(a.uid);
      if (b.rar !== a.rar) return b.rar - a.rar;
      return b.ilvl - a.ilvl;
    });
    var grid = U.el('div', 'inv-grid');
    if (!items.length) {
      root.appendChild(U.el('div', 'card', '<div class="desc">' + t('ui.bagEmpty') + '</div>'));
    }
    items.forEach(function (item) {
      var slot = U.el('button', 'inv-slot r' + item.rar + (Game.inv.isEquipped(item.uid) ? ' equipped' : ''),
        '<canvas width="30" height="30" data-icon="' + UI.itemIcon(item) + '"></canvas>' +
        '<span class="ilvl">' + item.ilvl + '</span>');
      slot.setAttribute('data-uid', item.uid);
      slot.setAttribute('aria-label',
        UI.itemName(item) + ' · ' + t('rarity.r' + item.rar) + ' · ' + t('ui.itemLevel', { lv: item.ilvl }) +
        (Game.inv.isEquipped(item.uid) ? ' · ' + t('ui.equippedTag') : ''));
      slot.addEventListener('click', function () { Game.ui.modals.itemDetail(item); });
      grid.appendChild(slot);
    });
    root.appendChild(grid);
  }

  function renderShop(root) {
    var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
    var context = Game.trade.current();
    var rid = context.regionId || (Game.state && Game.state.world && Game.state.world.region);
    var regionName = rid ? t('region.' + rid + '.name') : '';

    if (!context.available) {
      var reasonKey = context.reason === 'busy'
        ? 'ui.tradeBusy'
        : (context.reason === 'no-area' ? 'ui.tradeNoArea' : 'ui.tradeOutsideCamp');
      var gate = U.el('div', 'card trade-gate-card',
        '<div class="trade-status-mark" aria-hidden="true"></div>' +
        '<div class="name">' + t('ui.tradeUnavailableTitle') + '</div>' +
        '<div class="desc">' + t(reasonKey, { region: regionName }) + '</div>');
      if (context.nearest && context.nearest.anchor === 'camp') {
        var returnBtn = U.el('button', 'btn small trade-return-btn', t('ui.tradeReturnCamp'));
        returnBtn.addEventListener('click', function () {
          if (Game.state.world.mode !== 'rest') Game.world.setMode('rest');
          UI.tabs.open('battle');
        });
        gate.appendChild(returnBtn);
      }
      root.appendChild(gate);
      return;
    }

    var contextName = context.nameKey ? t(context.nameKey) : t('tradeArea.generic');
    root.appendChild(U.el('div', 'card trade-context-card',
      '<div class="trade-status-mark" aria-hidden="true"></div>' +
      '<div class="grow"><div class="name">' + contextName + '</div>' +
      '<div class="desc">' + t('ui.tradeCampAccess', { region: regionName }) + '</div></div>'));

    var sections = {};
    var sectionOrder = ['consume', 'gear', 'perm'];
    Game.shop.offers(context).forEach(function (d) {
      (sections[d.section] = sections[d.section] || []).push(d);
      if (sectionOrder.indexOf(d.section) < 0) sectionOrder.push(d.section);
    });

    var offerCount = 0;
    sectionOrder.forEach(function (sec) {
      if (!sections[sec] || !sections[sec].length) return;
      var head = U.el('div', 'shop-section-title', t('shopSec.' + sec));
      root.appendChild(head);
      sections[sec].forEach(function (d) {
        offerCount++;
        var price = Game.shop.price(d);
        var curIcon = d.cur === 'crystal' ? 'icon_crystal' : 'icon_gold';
        var ownedTxt = '';
        if (d.kind === 'perm') {
          var owned = Game.shop.ownedCount(d);
          ownedTxt = '<span class="badge">' + owned + '/' + Game.F.PERM_MAX + '</span>';
        } else if (d.kind === 'potion') {
          ownedTxt = '<span class="badge">×' + Game.shop.ownedCount(d) + '</span>';
        }
        var card = U.el('div', 'card',
          '<div class="row">' +
          '<canvas width="30" height="30" data-icon="' + d.icon + '"></canvas>' +
          '<div class="grow"><div class="name">' + t('shop.' + d.id + '.name') + ownedTxt + '</div>' +
          '<div class="desc">' + t('shop.' + d.id + '.desc') + '</div></div>' +
          '<button class="btn small buy-btn"><canvas width="14" height="14" data-icon="' + curIcon + '"></canvas>' + fmt(price) + '</button>' +
          '</div>');
        var btn = card.querySelector('.buy-btn');
        if (!Game.shop.canBuy(d)) btn.disabled = true;
        btn.addEventListener('click', function () {
          var r = Game.shop.buy(d.id);
          if (r.ok) {
            if (r.item) Game.ui.modals.toast(t('ui.gotItem', { name: UI.itemName(r.item) }), 'r' + r.item.rar);
            else Game.ui.modals.toast(t('ui.bought'));
            UI.tabs.rerender();
          } else if (r.reason !== 'poor') {
            Game.ui.modals.toast(t('ui.tradeUnavailableToast'), 'warn');
            UI.tabs.rerender();
          } else {
            Game.ui.modals.toast(t('ui.cantAfford'), 'warn');
          }
        });
        root.appendChild(card);
      });
    });
    if (!offerCount) {
      root.appendChild(U.el('div', 'card', '<div class="desc">' + t('ui.tradeNoOffers') + '</div>'));
    }
  }
})();
