/* ============================================================
 * data/regions.js — 八大区域注册表
 * 每个区域：怪物、Boss、讨伐数、地形配置（底材/材质补丁/装饰丛聚/
 * 草簇配色/花簇/发光体）、环境粒子、视差远景层、林间光柱。
 * 新增区域 = 新增一条注册，零引擎改动。
 * tradeAreas 由运行时地标解析交易范围与商品目录；当前区域默认
 * 在各自营地提供 camp-general，未来可按区域追加特殊交易地点。
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

  function layout(roadMat, roadColors, roadWidth, decorSpacing, density) {
    density = density || {};
    return {
      campZone: { x: [0.10, 0.20], y: [0.27, 0.70] },
      bossZone: { x: [0.70, 0.85], y: [0.27, 0.70] },
      campSafeRadius: 80,
      bossSafeRadius: 70,
      road: { mat: roadMat, colors: roadColors, width: roadWidth },
      decorSpacing: decorSpacing,
      patchDensity: density.patches || 1,
      decorDensity: density.decor || 1,
      detailDensity: density.details || 1,
      waterDecorDensity: density.waterDecor || 1
    };
  }

  var LAYOUTS = {
    grassland: layout('dirt', ['#96734a', '#82623e', '#aa8456'], 52, 12,
      { patches: 1.9, decor: 3.4, details: 2.2, waterDecor: 1.8 }),
    forest: layout('dirt', ['#755d42', '#654e37', '#856b4d'], 44, 13,
      { patches: 2.0, decor: 4.0, details: 2.4, waterDecor: 1.8 }),
    mine: layout('stone', ['#85818a', '#716e78', '#96919c'], 48, 12,
      { patches: 2.0, decor: 3.5, details: 2.0, waterDecor: 1.8 }),
    graveyard: layout('dirt', ['#5c5260', '#4c4452', '#6a6070'], 44, 12,
      { patches: 2.0, decor: 3.5, details: 2.2, waterDecor: 1.8 }),
    snowpass: layout('stone', ['#aeb7c2', '#969faa', '#c0c8d0'], 48, 13,
      { patches: 2.1, decor: 3.5, details: 2.0, waterDecor: 1.8 }),
    lavacave: layout('dirt', ['#6a5040', '#584234', '#7a5c48'], 56, 14,
      { patches: 2.1, decor: 4.5, details: 2.0, waterDecor: 1.8 }),
    skyruins: layout('stone', ['#a0a8ba', '#8e96aa', '#b2bac8'], 64, 13,
      { patches: 2.1, decor: 3.8, details: 2.2, waterDecor: 1.8 }),
    darkcastle: layout('stone', ['#51475d', '#433a50', '#60556c'], 52, 14,
      { patches: 2.1, decor: 3.8, details: 2.2, waterDecor: 1.8 })
  };

  /*
   * 节点内容完全由区域注册表提供。引擎只读取节点类型、产物与冷却，
   * 因而未来新增区域或替换产物无需修改 terrain/environment。
   */
  var GATHER = {
    grassland: [
      { id: 'herb_patch', sprite: 'gather_herb_patch', material: 'herb', color: '#7bd46a', accent: '#d8f09a' },
      { id: 'berry_bush', sprite: 'gather_berry_bush', material: 'berry', color: '#4f9b48', accent: '#dc5976' }
    ],
    forest: [
      { id: 'mushroom_ring', sprite: 'gather_mushroom_ring', material: 'mushroom', color: '#8b6bc0', accent: '#e6b5ef' },
      { id: 'resin_tree', sprite: 'gather_resin_tree', material: 'resin', color: '#7e5b36', accent: '#edba5c' }
    ],
    mine: [
      { id: 'ore_vein', sprite: 'gather_ore_vein', material: 'ore', color: '#7c8290', accent: '#d7c483' },
      { id: 'crystal_cluster', sprite: 'gather_crystal_cluster', material: 'crystal_cluster', color: '#4fa5be', accent: '#b8f1ff' }
    ],
    graveyard: [
      { id: 'ghost_flower', sprite: 'gather_ghost_flower', material: 'ghost_flower', color: '#6c688f', accent: '#c7bcff' },
      { id: 'grave_dust', sprite: 'gather_grave_dust', material: 'grave_dust', color: '#77717d', accent: '#d1cad7' }
    ],
    snowpass: [
      { id: 'ice_crystal', sprite: 'gather_ice_crystal', material: 'ice_crystal', color: '#7eb6d8', accent: '#e5f7ff' },
      { id: 'frost_herb', sprite: 'gather_frost_herb', material: 'frost_herb', color: '#729c8e', accent: '#d5fff2' }
    ],
    lavacave: [
      { id: 'fire_core', sprite: 'gather_fire_core', material: 'fire_core', color: '#a63e24', accent: '#ffca52' },
      { id: 'obsidian_outcrop', sprite: 'gather_obsidian_outcrop', material: 'obsidian', color: '#403348', accent: '#c064e6' }
    ],
    skyruins: [
      { id: 'rune_stone', sprite: 'gather_rune_stone', material: 'rune_stone', color: '#777f9c', accent: '#ebd67f' },
      { id: 'aether_shard', sprite: 'gather_aether_shard', material: 'aether_shard', color: '#55a8a7', accent: '#bafff4' }
    ],
    darkcastle: [
      { id: 'miasma_crystal', sprite: 'gather_miasma_crystal', material: 'miasma_crystal', color: '#63347e', accent: '#d585ff' },
      { id: 'demon_horn', sprite: 'gather_demon_horn', material: 'demon_horn', color: '#6e3c45', accent: '#ec9a82' }
    ]
  };

  for (var i = 0; i < R.length; i++) {
    R[i].order = i;
    R[i].layout = LAYOUTS[R[i].id];
    R[i].gather = {
      count: [3, 5],
      cooldown: [90, 150],
      nodes: GATHER[R[i].id]
    };
    var tradeAreas = (R[i].tradeAreas || []).slice();
    var hasCampSupply = false;
    for (var ti = 0; ti < tradeAreas.length; ti++) {
      if (tradeAreas[ti].id === 'camp-supply') { hasCampSupply = true; break; }
    }
    if (!hasCampSupply) {
      tradeAreas.unshift({
        id: 'camp-supply',
        kind: 'merchant',
        anchor: 'camp',
        offset: { x: -45, y: 19 },
        radiusFrom: 'campSafeRadius',
        catalogs: ['camp-general', 'camp-exchange'],
        priority: 10,
        nameKey: 'tradeArea.camp',
        prop: { style: 'supply-cart' }
      });
    }
    R[i].tradeAreas = tradeAreas;
    Game.register('region', R[i]);
  }
})();
