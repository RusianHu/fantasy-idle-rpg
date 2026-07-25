/* ============================================================
 * data/regions.js — 八大区域注册表
 * 每个区域：怪物、Boss、讨伐数、地形配置（底材/材质补丁/装饰）、
 * 环境粒子、视差远景层。新增区域 = 新增一条注册，零引擎改动。
 *
 * 材质 ID（render/particles 按材质映射反馈效果）：
 *   grass 草丛 | dirt 泥土 | water 浅水 | snow 雪地 |
 *   sand 沙土 | lava 熔岩地 | stone 石面 | miasma 瘴气地
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  var W = 900, H = 520; // 每区域世界尺寸（世界像素）

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
          { sprite: 'deco_tree', count: 7 },
          { sprite: 'deco_bush', count: 9 },
          { sprite: 'deco_rock', count: 4 }
        ],
        tufts: 60
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
          { sprite: 'deco_tree', count: 16 },
          { sprite: 'deco_shroom_glow', count: 7 },
          { sprite: 'deco_bush', count: 6 }
        ],
        tufts: 46
      },
      particles: 'leaves',
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
          { sprite: 'deco_rock', count: 10 },
          { sprite: 'deco_crystal', count: 6 },
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
          { sprite: 'deco_tombstone', count: 10 },
          { sprite: 'deco_dead_tree', count: 6 },
          { sprite: 'deco_bone', count: 5 }
        ],
        tufts: 20
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
          { sprite: 'deco_pine_snow', count: 10 },
          { sprite: 'deco_rock', count: 5 }
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
          { sprite: 'deco_lava_rock', count: 10 },
          { sprite: 'deco_rock', count: 4 }
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
          { sprite: 'deco_pillar', count: 9 },
          { sprite: 'deco_crystal', count: 5 }
        ],
        tufts: 24
      },
      particles: 'cloudwisp',
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
          { sprite: 'deco_banner_evil', count: 7 },
          { sprite: 'deco_pillar', count: 5 },
          { sprite: 'deco_bone', count: 4 }
        ],
        tufts: 0
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
