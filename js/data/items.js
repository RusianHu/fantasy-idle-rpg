/* ============================================================
 * data/items.js — 装备槽位 / 药水 / 商店条目
 * 装备名由「材质 × 槽位」i18n 组合（item.mat.N + item.base.slot）。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  /* ---------- 装备槽位（3 槽） ---------- */
  Game.register('slot', { id: 'weapon', icon: 'icon_weapon', primary: 'atk' });
  Game.register('slot', { id: 'armor',  icon: 'icon_armor',  primary: 'hpdef' });
  Game.register('slot', { id: 'ring',   icon: 'icon_ring',   primary: 'mixed' });

  /* ---------- 药水 ---------- */
  Game.register('potion', { id: 'potion_small', icon: 'icon_potion_small' });
  Game.register('potion', { id: 'potion_large', icon: 'icon_potion_large' });
  Game.register('itemUse', {
    id: 'potion_small', category: 'potion', ref: 'potion_small',
    icon: 'icon_potion_small', effect: 'heal', cdGroup: 'potion'
  });
  Game.register('itemUse', {
    id: 'potion_large', category: 'potion', ref: 'potion_large',
    icon: 'icon_potion_large', effect: 'heal', cdGroup: 'potion'
  });

  /* ---------- 素材（不占装备背包容量） ---------- */
  [
    'herb', 'berry', 'mushroom', 'resin', 'ore', 'crystal_cluster',
    'ghost_flower', 'grave_dust', 'ice_crystal', 'frost_herb',
    'fire_core', 'obsidian', 'rune_stone', 'aether_shard',
    'miasma_crystal', 'demon_horn'
  ].forEach(function (id) {
    Game.register('material', { id: id, icon: 'icon_material' });
  });

  /* ---------- 商店条目 ----------
   * cur: 'gold' | 'crystal'；kind: potion | gearbox | perm
   * catalogs 决定条目会在哪类交易地点出现。
   */
  Game.register('shopItem', {
    id: 'shop_potion_small', kind: 'potion', ref: 'potion_small',
    cur: 'gold', icon: 'icon_potion_small', section: 'consume',
    catalogs: ['camp-general']
  });
  Game.register('shopItem', {
    id: 'shop_potion_large', kind: 'potion', ref: 'potion_large',
    cur: 'gold', icon: 'icon_potion_large', section: 'consume',
    catalogs: ['camp-general']
  });
  Game.register('shopItem', {
    id: 'shop_gear_gold', kind: 'gearbox', quality: 'normal',
    cur: 'gold', icon: 'icon_chest', section: 'gear',
    catalogs: ['camp-general']
  });
  Game.register('shopItem', {
    id: 'shop_gear_crystal', kind: 'gearbox', quality: 'epic',
    cur: 'crystal', price: 30, icon: 'icon_chest', section: 'gear',
    catalogs: ['camp-general']
  });
  Game.register('shopItem', {
    id: 'perm_atk', kind: 'perm', stat: 'atk', pct: 0.05,
    cur: 'crystal', icon: 'icon_orb_buff', section: 'perm',
    catalogs: ['camp-general']
  });
  Game.register('shopItem', {
    id: 'perm_hp', kind: 'perm', stat: 'hp', pct: 0.05,
    cur: 'crystal', icon: 'icon_orb_buff', section: 'perm',
    catalogs: ['camp-general']
  });
  Game.register('shopItem', {
    id: 'perm_gold', kind: 'perm', stat: 'goldMul', pct: 0.10,
    cur: 'crystal', icon: 'icon_orb_buff', section: 'perm',
    catalogs: ['camp-general']
  });
  Game.register('shopItem', {
    id: 'perm_exp', kind: 'perm', stat: 'expMul', pct: 0.10,
    cur: 'crystal', icon: 'icon_orb_buff', section: 'perm',
    catalogs: ['camp-general']
  });

  /* ---------- 营地以物换物 ---------- */
  [
    { id: 'exchange_potion', icon: 'icon_potion_small' },
    { id: 'exchange_gold', icon: 'icon_gold' },
    { id: 'exchange_gear', icon: 'icon_chest' },
    { id: 'exchange_vitality', icon: 'icon_orb_buff', stat: 'hp', pct: 0.01 }
  ].forEach(function (def) {
    Game.register('shopItem', {
      id: def.id, kind: 'exchange', recipe: def.id,
      cur: 'materials', icon: def.icon, section: 'exchange',
      catalogs: ['camp-exchange'], stat: def.stat, pct: def.pct
    });
  });
})();
