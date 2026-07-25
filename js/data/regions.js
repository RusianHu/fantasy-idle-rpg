/* ============================================================
 * data/regions.js — 八大区域注册表
 * 每个区域：怪物、Boss、讨伐数、地形配置（底材/材质补丁/装饰丛聚/
 * 草簇配色/花簇/发光体）、环境粒子、视差远景层、林间光柱。
 * 新增区域 = 新增一条注册，零引擎改动。
 *
 * 材质 ID：grass | dirt | water | snow | sand | lava | stone | miasma
 * 装饰字段：{sprite, count, cluster?, water?, shadow?, bob?,
 *            glow?:{color, r}, flicker?}
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  var W = 900, H = 520;

  var R = [
    {
      id: 'grassland', tier: 1,
      monsters: ['slime_green', 'wolf_gray'], boss: 'slime_king',
      killTarget: 10,
      world: { w: W, h: H },
      camp: { x: 120, y: 130 }, bossPoint: { x: 640, y: 260 },
      terrain: {
        base: { mat: 'grass', colors: ['#4f9a3f', '#468c37', '#5aa848'] },
        patches: [
          { mat: 'dirt', colors: ['#8a6a44', '#7c5e3a'], count: 3, rMin: 30, rMax: 55 },
          { mat: 'water', colors: ['#3f7ab0', '#3a70a4'], count: 1, rMin: 38, rMax: 55 },
          { mat: 'sand', colors: ['#c8b078', '#bca46c'], count: 1, rMin: 24, rMax: 36 }
        ],
        deco: [
          { sprite: 'flora_oak_big', count: 5, cluster: true },
          { sprite: 'flora_oak_small', count: 5, cluster: true },
          { sprite: 'flora_blossom', count: 2 },
          { sprite: 'flora_bush_berry', count: 6 },
          { sprite: 'flora_flowers', count: 4 },
          { sprite: 'flora_flowers_pink', count: 4 },
          { sprite: 'flora_pebbles', count: 4 },
          { sprite: 'flora_stump', count: 2 },
          { sprite: 'flora_lily', count: 3, water: true }
        ],
        tufts: 150,
        tuftColors: ['#3d8232', '#8ad06a'],
        flowers: { count: 44, colors: ['#f4f4f4', '#f8e060', '#f0a0c8'] }
      },
      particles: 'meadow',
      skyTop: '#79c0e8', skyBottom: '#a8dca0',
      parallax: [
        { type: 'clouds', color: '#ffffff', factor: 0.15, y: 18, alpha: 0.8 },
        { type: 'hills', color: '#3f8a54', color2: '#2f7044', factor: 0.3, y: 84 },
        { type: 'trees', color: '#2c6038', factor: 0.5, y: 96 }
      ]
    },
    {
      id: 'forest', tier: 2,
      monsters: ['mushroom_toxic', 'treant_sapling'], boss: 'elder_treant',
      killTarget: 10,
      world: { w: W, h: H },
      camp: { x: 130, y: 140 }, bossPoint: { x: 650, y: 250 },
      terrain: {
        base: { mat: 'grass', colors: ['#3a7a30', '#336c2a', '#428838'] },
        patches: [
          { mat: 'dirt', colors: ['#6b543c', '#5f4a34'], count: 3, rMin: 26, rMax: 44 },
          { mat: 'water', colors: ['#356a9a', '#30618c'], count: 2, rMin: 30, rMax: 44 }
        ],
        deco: [
          { sprite: 'flora_tree_forest', count: 10, cluster: true },
          { sprite: 'flora_birch', count: 5, cluster: true },
          { sprite: 'flora_fern', count: 8 },
          { sprite: 'flora_shroom_glow', count: 6, glow: { color: '#5ad8cc', r: 15 } },
          { sprite: 'flora_bush_berry', count: 3 },
          { sprite: 'flora_lily', count: 3, water: true }
        ],
        tufts: 120,
        tuftColors: ['#2f6b28', '#6fae5a'],
        flowers: { count: 22, colors: ['#8ab8f0', '#e8f0d0'] }
      },
      particles: 'leaves',
      rays: { color: '#fff2c8', alpha: 0.11 },
      skyTop: '#4a7a6a', skyBottom: '#38604e',
      parallax: [
        { type: 'fogband', color: '#a8c8b8', factor: 0.12, y: 60, alpha: 0.35 },
        { type: 'trees', color: '#1e4426', factor: 0.3, y: 78, tall: true },
        { type: 'trees', color: '#163420', factor: 0.55, y: 92, tall: true }
      ]
    },
    {
      id: 'mine', tier: 3,
      monsters: ['cave_bat', 'kobold_miner'], boss: 'stone_golem',
      killTarget: 11,
      world: { w: W, h: H },
      camp: { x: 120, y: 135 }, bossPoint: { x: 660, y: 270 },
      terrain: {
        base: { mat: 'dirt', colors: ['#6b5a48', '#5f5040', '#77654f'] },
        patches: [
          { mat: 'stone', colors: ['#7a7a86', '#6e6e7a'], count: 4, rMin: 30, rMax: 50 },
          { mat: 'sand', colors: ['#9a8058', '#8e7650'], count: 2, rMin: 24, rMax: 40 }
        ],
        deco: [
          { sprite: 'flora_rocks_big', count: 6, cluster: true },
          { sprite: 'deco_rock', count: 6 },
          { sprite: 'flora_crystal_big', count: 5, glow: { color: '#78d0e8', r: 20 } },
          { sprite: 'flora_beam', count: 3 },
          { sprite: 'flora_pebbles', count: 6 },
          { sprite: 'deco_bone', count: 3 }
        ],
        tufts: 0
      },
      particles: 'dust',
      skyTop: '#2c2420', skyBottom: '#463830',
      parallax: [
        { type: 'cavewall', color: '#38302a', color2: '#241e1a', factor: 0.2, y: 88 },
        { type: 'stalactites', color: '#1c1714', factor: 0.4, y: 40 }
      ]
    },
    {
      id: 'graveyard', tier: 4,
      monsters: ['skeleton_soldier', 'ghost_wisp'], boss: 'necromancer',
      killTarget: 11,
      world: { w: W, h: H },
      camp: { x: 125, y: 130 }, bossPoint: { x: 640, y: 260 },
      terrain: {
        base: { mat: 'dirt', colors: ['#4c4452', '#443c4a', '#544c5c'] },
        patches: [
          { mat: 'grass', colors: ['#565f46', '#4c543e'], count: 4, rMin: 26, rMax: 46 },
          { mat: 'water', colors: ['#2c3c50', '#283648'], count: 1, rMin: 26, rMax: 38 }
        ],
        deco: [
          { sprite: 'flora_deadtree_big', count: 4 },
          { sprite: 'deco_dead_tree', count: 4 },
          { sprite: 'deco_tombstone', count: 6, cluster: true },
          { sprite: 'flora_grave_cross', count: 5, cluster: true },
          { sprite: 'flora_candle', count: 6, glow: { color: '#f8c860', r: 13 }, flicker: true },
          { sprite: 'flora_skulls', count: 4 }
        ],
        tufts: 46,
        tuftColors: ['#4c543e', '#7a8560'],
        flowers: { count: 12, colors: ['#8a86a8'] }
      },
      particles: 'wisps',
      skyTop: '#2a2438', skyBottom: '#403852',
      parallax: [
        { type: 'fogband', color: '#8a86a8', factor: 0.1, y: 66, alpha: 0.3 },
        { type: 'hills', color: '#322c40', color2: '#282334', factor: 0.28, y: 84 },
        { type: 'deadtrees', color: '#1e1a28', factor: 0.5, y: 92 }
      ]
    },
    {
      id: 'snowpass', tier: 5,
      monsters: ['ice_wolf', 'yeti_small'], boss: 'frost_giant',
      killTarget: 12,
      world: { w: W, h: H },
      camp: { x: 120, y: 135 }, bossPoint: { x: 650, y: 255 },
      terrain: {
        base: { mat: 'snow', colors: ['#dce8f0', '#d2e0ea', '#e6f0f6'] },
        patches: [
          { mat: 'water', colors: ['#8ac4e0', '#7eb8d6'], count: 2, rMin: 26, rMax: 40 },
          { mat: 'stone', colors: ['#8a92a0', '#7e8694'], count: 3, rMin: 24, rMax: 40 }
        ],
        deco: [
          { sprite: 'flora_pine_big', count: 7, cluster: true },
          { sprite: 'flora_pine_mid', count: 6, cluster: true },
          { sprite: 'deco_pine_snow', count: 3 },
          { sprite: 'flora_ice_shard', count: 4, glow: { color: '#a8e0f0', r: 15 } },
          { sprite: 'flora_snow_mound', count: 6 },
          { sprite: 'deco_rock', count: 3 }
        ],
        tufts: 0
      },
      particles: 'snow',
      skyTop: '#a8c8e0', skyBottom: '#d8e8f4',
      parallax: [
        { type: 'mountains', color: '#c8d8ea', color2: '#a8bcd4', factor: 0.22, y: 80 },
        { type: 'trees', color: '#5c7a8c', factor: 0.5, y: 94, pine: true }
      ]
    },
    {
      id: 'lavacave', tier: 6,
      monsters: ['fire_imp', 'lava_lizard'], boss: 'flame_demon',
      killTarget: 12,
      world: { w: W, h: H },
      camp: { x: 118, y: 132 }, bossPoint: { x: 655, y: 265 },
      terrain: {
        base: { mat: 'stone', colors: ['#4c3630', '#42302a', '#563c34'] },
        patches: [
          { mat: 'lava', colors: ['#e86428', '#d85820'], count: 4, rMin: 24, rMax: 42 },
          { mat: 'dirt', colors: ['#5c4638', '#523e32'], count: 3, rMin: 26, rMax: 40 }
        ],
        deco: [
          { sprite: 'flora_obsidian', count: 5, cluster: true },
          { sprite: 'deco_lava_rock', count: 8, glow: { color: '#f09030', r: 13 } },
          { sprite: 'flora_char_stump', count: 5 },
          { sprite: 'flora_rocks_big', count: 3 }
        ],
        tufts: 0
      },
      particles: 'embers',
      skyTop: '#38160c', skyBottom: '#6a2410',
      parallax: [
        { type: 'glow', color: '#f07030', factor: 0.1, y: 78, alpha: 0.4 },
        { type: 'spires', color: '#2c1410', factor: 0.3, y: 86 }
      ]
    },
    {
      id: 'skyruins', tier: 7,
      monsters: ['guardian_orb', 'harpy'], boss: 'ruin_guardian',
      killTarget: 13,
      world: { w: W, h: H },
      camp: { x: 125, y: 138 }, bossPoint: { x: 645, y: 255 },
      terrain: {
        base: { mat: 'stone', colors: ['#8a92a8', '#7e869c', '#969eb4'] },
        patches: [
          { mat: 'grass', colors: ['#6a9a6a', '#5f8c5f'], count: 3, rMin: 24, rMax: 40 },
          { mat: 'water', colors: ['#78b8d8', '#6cacce'], count: 2, rMin: 22, rMax: 34 }
        ],
        deco: [
          { sprite: 'flora_pillar_big', count: 5, cluster: true },
          { sprite: 'flora_pillar_broken', count: 5 },
          { sprite: 'deco_pillar', count: 3 },
          { sprite: 'flora_float_crystal', count: 5, bob: true, glow: { color: '#8ae8dc', r: 15 } },
          { sprite: 'flora_flowers_blue', count: 5 },
          { sprite: 'deco_crystal', count: 3, glow: { color: '#68c8e8', r: 11 } }
        ],
        tufts: 64,
        tuftColors: ['#5f8c5f', '#a0cca0'],
        flowers: { count: 16, colors: ['#c8e8ff', '#f4f4f4'] }
      },
      particles: 'cloudwisp',
      rays: { color: '#ffffff', alpha: 0.09 },
      skyTop: '#5a8ac8', skyBottom: '#a8c8e8',
      parallax: [
        { type: 'clouds', color: '#ffffff', factor: 0.35, y: 40, alpha: 0.9, fast: true },
        { type: 'islands', color: '#6a7a94', color2: '#56647c', factor: 0.2, y: 70 },
        { type: 'clouds', color: '#e8f0f8', factor: 0.6, y: 100, alpha: 0.7, fast: true }
      ]
    },
    {
      id: 'darkcastle', tier: 8,
      monsters: ['demon_soldier', 'gargoyle'], boss: 'demon_lord',
      killTarget: 14,
      world: { w: W, h: H },
      camp: { x: 122, y: 132 }, bossPoint: { x: 650, y: 258 },
      terrain: {
        base: { mat: 'stone', colors: ['#3c3448', '#342c40', '#443c52'] },
        patches: [
          { mat: 'miasma', colors: ['#5c3a7a', '#50336c'], count: 4, rMin: 24, rMax: 40 },
          { mat: 'dirt', colors: ['#463c4a', '#3e3442'], count: 2, rMin: 26, rMax: 38 }
        ],
        deco: [
          { sprite: 'flora_dark_tree', count: 4 },
          { sprite: 'deco_banner_evil', count: 6, cluster: true },
          { sprite: 'flora_lantern', count: 6, glow: { color: '#b070e0', r: 15 }, flicker: true },
          { sprite: 'flora_spikes', count: 4 },
          { sprite: 'deco_pillar', count: 3 },
          { sprite: 'deco_bone', count: 4 }
        ],
        tufts: 30,
        tuftColors: ['#43265f', '#8a56c0']
      },
      particles: 'miasma',
      skyTop: '#1c1028', skyBottom: '#38204a',
      parallax: [
        { type: 'spires', color: '#241830', factor: 0.22, y: 78, evil: true },
        { type: 'fogband', color: '#6a3a9a', factor: 0.1, y: 92, alpha: 0.25 }
      ]
    }
  ];

  for (var i = 0; i < R.length; i++) {
    R[i].order = i;
    Game.register('region', R[i]);
  }
})();
