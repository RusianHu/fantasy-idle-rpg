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
  var panelCleanup = null;

  var UI = Game.ui = Game.ui || {};
  UI.panels = {};

  /* ================= 公共辅助 ================= */
  UI.itemName = function (item) {
    var t = Game.i18n.t;
    var tier = U.clamp(Math.ceil(item.ilvl / 8), 1, 8);
    var baseName;
    if (Game.equipment && Game.equipment.isV2(item)) {
      var base = Game.content.get('itemBase', item.baseId);
      baseName = base && base.presentation && base.presentation.nameKey
        ? t(base.presentation.nameKey) : t('item.base.' + Game.equipment.slotOf(item));
      if (Game.equipment.slotOf(item) === 'weapon') {
        baseName += ' · ' + t('item.weapon.' + (item.classId || Game.state.player.classId || 'fighter'));
      }
    } else {
      baseName = item.base === 'weapon'
        ? t('item.weapon.' + (Game.state.player.classId || 'fighter'))
        : t('item.base.' + item.base);
    }
    return t('item.pattern', { mat: t('item.mat.' + tier), base: baseName });
  };

  UI.itemIcon = function (item) {
    var slotId = Game.equipment ? Game.equipment.slotOf(item) : item.base;
    if (slotId === 'weapon') {
      return 'icon_w_' + (Game.state.player.classId || 'fighter');
    }
    var slot = reg.get('slot', slotId) || Game.content && Game.content.get('itemSlot', slotId);
    return slot ? slot.icon : 'icon_weapon';
  };

  UI.renderIcons = function (root) {
    var list = root.querySelectorAll('canvas[data-icon]');
    for (var i = 0; i < list.length; i++) {
      Game.assets.drawToDom(list[i], list[i].getAttribute('data-icon'), 'icon');
    }
  };

  function cleanupPanel() {
    if (!panelCleanup) return;
    var cleanup = panelCleanup;
    panelCleanup = null;
    cleanup();
  }

  UI.affixLine = function (af) {
    if (af && af.definitionId && Game.content) {
      var formal = Game.content.get('itemAffix', af.definitionId);
      if (!formal) return '';
      var parts = UI.modifierLines(formal, af.values && af.values.rolls || []).join(' · ');
      return Game.i18n.t(formal.presentation && formal.presentation.nameKey || formal.id) +
        (parts ? ' ' + parts : '');
    }
    var def = reg.get('affix', af.id);
    if (!def) return '';
    var t = Game.i18n.t;
    var v = def.kind === 'pct' ? '+' + Math.round(af.v * 100) + '%' : '+' + (def.dec ? af.v.toFixed(1) : Game.i18n.fmtNum(af.v));
    return t('affix.' + af.id) + ' ' + v;
  };

  UI.modifierLines = function (definition, values) {
    values = values || [];
    var modifiers = definition && (definition.implicitModifiers || definition.modifiers) || [];
    return modifiers.map(function (modifier, index) {
      var value = Number(values[index]);
      if (!Number.isFinite(value)) value = Number(modifier.value) || 0;
      var key = modifier.stat === 'classPower' ? 'power' : modifier.stat;
      var label = Game.i18n.t('equipment.stat.' + key);
      var percentStats = ['critChance', 'damageDoneMultiplier', 'dodgeChance', 'damageReduction',
        'tenacity', 'lifesteal', 'healthRegenPct', 'healingPower', 'shieldPower',
        'statusPotency', 'resourceRegen', 'haste', 'gcdSpeed', 'castSpeed', 'autoAttackSpeed',
        'cooldownRate', 'moveSpeed', 'goldMultiplier', 'expMultiplier', 'dropMultiplier',
        'rarityLuck', 'healingReceivedMultiplier'];
      var sign = value >= 0 ? '+' : '';
      var display = modifier.stat === 'critMultiplier'
        ? sign + value.toFixed(2) + 'x'
        : percentStats.indexOf(modifier.stat) >= 0 || modifier.operation === 'addPct'
          ? sign + (value * 100).toFixed(1) + '%' : sign + Game.i18n.fmtNum(value);
      return label + ' ' + display;
    });
  };

  UI.critChanceText = function (chance) {
    chance = Math.max(0, Number(chance) || 0);
    var guaranteed = Math.floor(chance + 1e-9);
    var fraction = Math.max(0, Math.min(99.9, (chance - guaranteed) * 100));
    if (!guaranteed) return Game.i18n.t('equipment.crit.chance', {
      chance: Math.round(chance * 1000) / 10
    });
    if (fraction < .05) return Game.i18n.t('equipment.crit.guaranteed', { tier: guaranteed });
    return Game.i18n.t('equipment.crit.overflow', {
      tier: guaranteed, chance: Math.round(fraction * 10) / 10
    });
  };

  UI.equipmentError = function (reason) {
    var key = 'equipment.error.' + (reason || 'unknown');
    return Game.i18n.t(key) === key ? Game.i18n.t('equipment.error.unknown') : Game.i18n.t(key);
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
        'trade:contextChanged', 'region:unlocked', 'region:relocked'];
      var mapRerenderOn = ['region:changed', 'boss:defeated', 'region:unlocked', 'region:relocked'];
      rerenderOn.forEach(function (evt) {
        bus.on(evt, function () {
          if (current === 'battle' || current === 'settings') return;
          if (current === 'map' && mapRerenderOn.indexOf(evt) < 0) return;
          UI.tabs.queueRerender();
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
        cleanupPanel();
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
        cleanupPanel();
        inner.innerHTML = '';
        panelCleanup = fn(inner) || null;
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
      var vitals = Game.units.playerSnapshot();
      var need = Game.F.expNeed(p.level);
      var rows = [
        [t('stat.hp'), fmt(Math.ceil(vitals.hp)) + ' / ' + fmt(Math.ceil(vitals.maxHp))],
        [t('stat.atk'), fmt(d.atk)],
        [t('stat.def'), fmt(d.def)],
        [t('stat.spd'), d.spd.toFixed(1)],
        [t('stat.crit'), UI.critChanceText(d.crit)],
        [t('stat.critDmg'), 'x' + d.critDmg.toFixed(2)],
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
        ['pickups', fmt(st.pickups)], ['gathers', fmt(st.gathers)],
        ['materials', fmt(st.materials)], ['chests', fmt(st.chests)],
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
    (Game.equipment ? Game.equipment.SLOT_IDS : reg.ids('slot')).forEach(function (slotId) {
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
        '<span class="lock-glyph" aria-hidden="true"></span><span>' +
        (locked ? t('ui.slotLocked') : t('ui.slotUnlocked')) + '</span>');
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

    // 可用物品由 itemUse 注册表自动渲染；首发为共享冷却的两种药水。
    var useGrid = U.el('div', 'item-use-grid');
    reg.all('itemUse').forEach(function (def) {
      var count = Game.items.count(def.category, def.ref || def.id);
      var cd = Game.items.cdLeft(def.cdGroup);
      var description = Game.items.describe(def);
      var card = U.el('button', 'item-use-card' + (!count ? ' empty' : ''),
        '<canvas width="30" height="30" data-icon="' + def.icon + '"></canvas>' +
        '<span class="item-use-copy"><strong>' + t('item.' + def.id + '.name') + '</strong>' +
        '<small>' + t(description.key, description.params) + '</small></span>' +
        '<span class="item-use-count">×' + count + '</span>' +
        '<span class="item-use-cd" data-cd-group="' +
        U.esc(def.cdGroup || '') + '" data-cd-max="' +
        (def.cdGroup === 'potion' ? Game.F.BAL.potionCd : (def.cooldown || 0)) +
        '" style="--cd:' +
        U.clamp(cd / Math.max(1, def.cdGroup === 'potion'
          ? Game.F.BAL.potionCd
          : (def.cooldown || 1)), 0, 1) + '"></span>');
      card.disabled = !count;
      card.setAttribute('aria-label', t('item.useAria', {
        name: t('item.' + def.id + '.name'),
        count: count
      }));
      card.addEventListener('click', function () {
        var result = Game.items.use(def.category, def.id, { source: 'manual' });
        if (!result.ok) {
          Game.ui.modals.toast(t('item.reject.' + result.reason, {
            s: result.left ? Math.ceil(result.left) : 0
          }), 'warn');
        }
        UI.tabs.rerender();
      });
      useGrid.appendChild(card);
    });
    root.appendChild(useGrid);
    root.appendChild(U.el('div', 'item-use-hint desc',
      t('ui.potionAuto', { p: Math.round(s.settings.potionThreshold * 100) })));

    // 素材字典独立展示，不占 100 格装备容量。
    var materialDefs = reg.all('material').filter(function (def) {
      return Game.inv.materialCount(def.id) > 0;
    });
    if (materialDefs.length) {
      root.appendChild(U.el('div', 'shop-section-title', t('ui.materialsTitle')));
      var materialGrid = U.el('div', 'material-grid');
      materialDefs.forEach(function (def) {
        materialGrid.appendChild(U.el('div', 'material-chip',
          '<span class="material-mark"></span><span>' +
          t('material.' + def.id) + '</span><strong>×' +
          fmt(Game.inv.materialCount(def.id)) + '</strong>'));
      });
      root.appendChild(materialGrid);
    }

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
    UI.trade.render(root, { embedded: true });
  }
})();
