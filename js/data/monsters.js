/* ============================================================
 * data/monsters.js — 怪物注册（16 普通怪 + 8 Boss）
 * 属性由 formulas.monsterStats(tier, mods, boss) 统一推导。
 * sprite 缺省等于 id（资产清单化：内容只写资产 ID）。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  var M = [
    /* R1 新手草原 */
    { id: 'slime_green', tier: 1, mods: { hp: 0.9, atk: 0.9, spd: -1 } },
    { id: 'wolf_gray', tier: 1, mods: { hp: 1.05, atk: 1.1, spd: 1.5 } },
    { id: 'slime_king', tier: 1, boss: true, scale: 1 },

    /* R2 迷雾森林 */
    { id: 'mushroom_toxic', tier: 2, mods: { hp: 1.0, atk: 0.95, spd: -1.5 } },
    { id: 'treant_sapling', tier: 2, mods: { hp: 1.2, atk: 1.0, spd: -2 } },
    { id: 'elder_treant', tier: 2, boss: true },

    /* R3 废弃矿坑 */
    { id: 'cave_bat', tier: 3, mods: { hp: 0.8, atk: 0.95, spd: 3 } },
    { id: 'kobold_miner', tier: 3, mods: { hp: 1.1, atk: 1.05 } },
    { id: 'stone_golem', tier: 3, boss: true, mods: { spd: -2 } },

    /* R4 亡灵墓地 */
    { id: 'skeleton_soldier', tier: 4, mods: { hp: 1.0, atk: 1.1 } },
    { id: 'ghost_wisp', tier: 4, mods: { hp: 0.85, atk: 0.95, spd: 2, def: 1.4 } },
    { id: 'necromancer', tier: 4, boss: true },

    /* R5 雪山隘口 */
    { id: 'ice_wolf', tier: 5, mods: { hp: 1.0, atk: 1.1, spd: 2.5 } },
    { id: 'yeti_small', tier: 5, mods: { hp: 1.25, atk: 1.0, spd: -1.5 } },
    { id: 'frost_giant', tier: 5, boss: true, mods: { spd: -1.5 } },

    /* R6 熔岩洞窟 */
    { id: 'fire_imp', tier: 6, mods: { hp: 0.9, atk: 1.15, spd: 2 } },
    { id: 'lava_lizard', tier: 6, mods: { hp: 1.15, atk: 1.0 } },
    { id: 'flame_demon', tier: 6, boss: true },

    /* R7 浮空遗迹 */
    { id: 'guardian_orb', tier: 7, mods: { hp: 0.95, atk: 1.05, def: 1.5, spd: 1 } },
    { id: 'harpy', tier: 7, mods: { hp: 1.0, atk: 1.15, spd: 3 } },
    { id: 'ruin_guardian', tier: 7, boss: true },

    /* R8 魔王城 */
    { id: 'demon_soldier', tier: 8, mods: { hp: 1.1, atk: 1.1 } },
    { id: 'gargoyle', tier: 8, mods: { hp: 1.2, atk: 1.0, def: 1.6 } },
    { id: 'demon_lord', tier: 8, boss: true, mods: { hp: 1.3, atk: 1.15 } }
  ];

  for (var i = 0; i < M.length; i++) {
    var d = M[i];
    d.sprite = d.sprite || d.id;
    Game.register('monster', d);
  }
})();
