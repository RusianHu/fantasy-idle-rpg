/* ============================================================
 * ui/panels_main.js — Tab 框架 + 角色（属性/统计/成就）+ 背包（背包/商店）
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus, reg = Game.reg;
  var $ = U.$;

  var TABS = ['battle', 'char', 'inv', 'skills', 'map', 'settings'];
  var ICONS = { battle: '⚔', char: '👤', inv: '🎒', skills: '✦', map: '🗺', settings: '⚙' };
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
    return t('item.pattern', { mat: t('item.mat.' + tier), base: t('item.base.' + item.base) });
  };

  UI.itemIcon = function (item) {
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
        var b = U.el('button', 'tab-btn', '<span class="tab-ico">' + ICONS[tab] + '</span><span class="tab-label"></span><span class="tab-dot"></span>');
        b.setAttribute('data-tab', tab);
        b.addEventListener('click', function () { UI.tabs.open(tab); });
        bar.appendChild(b);
      });
      UI.tabs.relabel();
      UI.tabs.open('battle');

      bus.on('locale:changed', function () { UI.tabs.relabel(); UI.tabs.rerender(); });
      var rerenderOn = ['item:dropped', 'item:equipped', 'gold:changed', 'crystal:changed',
        'skill:upgraded', 'achievement:unlocked', 'player:levelup', 'shop:bought',
        'region:changed', 'boss:defeated', 'potion:used', 'potion:dropped'];
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

    open: function (tab) {
      current = tab;
      U.$$('#tabbar .tab-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === tab);
      });
      var pc = $('#panel-container');
      if (tab === 'battle') {
        pc.classList.add('hidden');
        return;
      }
      pc.classList.remove('hidden');
      UI.tabs.rerender();
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

    var head = U.el('div', 'panel-title', t('ui.tab.char') + ' <span style="font-size:11px;color:var(--ink-dim)">Lv.' + p.level + '</span>');
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
    [['bag', t('ui.sub.bag')], ['shop', t('ui.sub.shop')]].forEach(function (pair) {
      var b = U.el('button', 'subtab' + (invSub === pair[0] ? ' active' : ''), pair[1]);
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

    // 已装备
    var strip = U.el('div', 'equip-strip');
    reg.ids('slot').forEach(function (slotId) {
      var uid = inv.equipped[slotId];
      var item = uid ? Game.inv.byUid(uid) : null;
      var slotDef = reg.get('slot', slotId);
      var cls = 'inv-slot' + (item ? ' r' + item.rar : '');
      var el = U.el('button', cls,
        '<canvas width="28" height="28" data-icon="' + slotDef.icon + '"></canvas>' +
        '<span class="slot-label">' + (item ? UI.itemName(item) : t('slot.' + slotId)) + '</span>');
      if (item) {
        el.addEventListener('click', function () { Game.ui.modals.itemDetail(item); });
      }
      strip.appendChild(el);
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
      slot.addEventListener('click', function () { Game.ui.modals.itemDetail(item); });
      grid.appendChild(slot);
    });
    root.appendChild(grid);
  }

  function renderShop(root) {
    var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
    var sections = { consume: [], gear: [], perm: [] };
    reg.all('shopItem').forEach(function (d) { (sections[d.section] = sections[d.section] || []).push(d); });

    ['consume', 'gear', 'perm'].forEach(function (sec) {
      if (!sections[sec] || !sections[sec].length) return;
      var head = U.el('div', '', t('shopSec.' + sec));
      head.style.cssText = 'font-size:12px;color:var(--gold);margin:10px 0 6px;';
      root.appendChild(head);
      sections[sec].forEach(function (d) {
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
          } else {
            Game.ui.modals.toast(t('ui.cantAfford'), 'warn');
          }
        });
        root.appendChild(card);
      });
    });
  }
})();
