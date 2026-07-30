/* ============================================================
 * regions/catalog.support.js — 八大区域确定性作者数据
 * 每个区域：怪物、Boss、讨伐数、地形配置（底材/材质补丁/装饰丛聚/
 * 草簇配色/花簇/发光体）、环境粒子、视差远景层、林间光柱。
 * 新增区域 = 新增一条注册，零引擎改动。
 * tradeAreas 由运行时地标解析交易范围与商品目录；当前区域默认
 * 在各自营地提供 camp-general，未来可按区域追加特殊交易地点。
 *
 * 材质 ID：grass | dirt | water | snow | sand | lava | stone | miasma
 * 装饰字段：{sprite, count, placement?, cluster?, water?, shadow?, bob?,
 *            glow?:{color, r}, flicker?, v3Only?, nameKey?, distribution?}
 * distribution 只服务 v3 生态装饰生成；v1/v2 继续只读取历史字段。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  Game.contentSupport.register({
    id: 'authoring.region-catalog',
    version: '1.0.0',
    requires: [],
    capabilities: ['authoring.write'],
    sourceFile: 'js/data/packs/regions/catalog.support.js',
    install: function (capabilities) {

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
          { sprite: 'flora_oak_big', count: 5, cluster: true, placement: 'blocker', sway: true },
          { sprite: 'flora_oak_small', count: 5, cluster: true, placement: 'blocker', sway: true },
          { sprite: 'flora_blossom', count: 2, placement: 'ground', sway: true },
          { sprite: 'flora_bush_berry', count: 6, placement: 'ground' },
          { sprite: 'flora_flowers', count: 4, placement: 'ground' },
          { sprite: 'flora_flowers_pink', count: 4, placement: 'ground' },
          { sprite: 'flora_pebbles', count: 4, placement: 'ground' },
          { sprite: 'flora_stump', count: 2, placement: 'ground' },
          { sprite: 'flora_lily', count: 3, water: true, placement: 'water' },
          { sprite: 'deco_grassland_clover', count: 4, placement: 'ground', v3Only: true, shadow: false, nameKey: 'decor.grassland.clover' },
          { sprite: 'deco_grassland_wild_wheat', count: 4, placement: 'ground', v3Only: true, sway: true, nameKey: 'decor.grassland.wildWheat' },
          { sprite: 'deco_grassland_dandelions', count: 4, placement: 'ground', v3Only: true, sway: true, nameKey: 'decor.grassland.dandelions' },
          { sprite: 'deco_grassland_burrow', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.grassland.burrow' },
          { sprite: 'deco_grassland_fallen_branch', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.grassland.fallenBranch' },
          { sprite: 'deco_grassland_fairy_ring', count: 4, placement: 'ground', v3Only: true, shadow: false, glow: { color: '#c8f0b0', r: 9 }, nameKey: 'decor.grassland.fairyRing' }
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
          { sprite: 'flora_tree_forest', count: 10, cluster: true, placement: 'blocker', sway: true },
          { sprite: 'flora_birch', count: 5, cluster: true, placement: 'blocker', sway: true },
          { sprite: 'flora_fern', count: 8, placement: 'ground', sway: true },
          { sprite: 'flora_shroom_glow', count: 6, placement: 'ground', glow: { color: '#5ad8cc', r: 15 } },
          { sprite: 'flora_bush_berry', count: 3, placement: 'ground' },
          { sprite: 'flora_lily', count: 3, water: true, placement: 'water' },
          { sprite: 'deco_forest_mossy_log', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.forest.mossyLog' },
          { sprite: 'deco_forest_red_shrooms', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.forest.redShrooms' },
          { sprite: 'deco_forest_cones_acorns', count: 4, placement: 'ground', v3Only: true, shadow: false, nameKey: 'decor.forest.conesAcorns' },
          { sprite: 'deco_forest_root_knot', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.forest.rootKnot' },
          { sprite: 'deco_forest_leaf_pile', count: 4, placement: 'ground', v3Only: true, shadow: false, nameKey: 'decor.forest.leafPile' },
          { sprite: 'deco_forest_fern_stones', count: 4, placement: 'ground', v3Only: true, sway: true, nameKey: 'decor.forest.fernStones' }
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
          { sprite: 'flora_rocks_big', count: 6, cluster: true, placement: 'blocker' },
          { sprite: 'deco_rock', count: 6, placement: 'ground' },
          { sprite: 'flora_crystal_big', count: 5, placement: 'blocker', glow: { color: '#78d0e8', r: 20 } },
          { sprite: 'flora_beam', count: 3, placement: 'blocker' },
          { sprite: 'flora_pebbles', count: 6, placement: 'ground' },
          { sprite: 'deco_bone', count: 3, placement: 'ground' },
          { sprite: 'deco_mine_broken_rail', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.mine.brokenRail' },
          { sprite: 'deco_mine_coal_pile', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.mine.coalPile' },
          { sprite: 'deco_mine_discarded_pick', count: 4, placement: 'ground', v3Only: true, shadow: false, nameKey: 'decor.mine.discardedPick' },
          { sprite: 'deco_mine_lantern', count: 4, placement: 'ground', v3Only: true, flicker: true, glow: { color: '#f2b94e', r: 12 }, nameKey: 'decor.mine.lantern' },
          { sprite: 'deco_mine_timber_scraps', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.mine.timberScraps' },
          { sprite: 'deco_mine_copper_rubble', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.mine.copperRubble' }
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
          { sprite: 'flora_deadtree_big', count: 4, placement: 'blocker', sway: true },
          { sprite: 'deco_dead_tree', count: 4, placement: 'blocker', sway: true },
          { sprite: 'deco_tombstone', count: 6, cluster: true, placement: 'blocker' },
          { sprite: 'flora_grave_cross', count: 5, cluster: true, placement: 'blocker' },
          { sprite: 'flora_candle', count: 6, placement: 'ground', glow: { color: '#f8c860', r: 13 }, flicker: true },
          { sprite: 'flora_skulls', count: 4, placement: 'ground' },
          { sprite: 'deco_graveyard_cracked_slab', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.graveyard.crackedSlab' },
          { sprite: 'deco_graveyard_wilted_flowers', count: 4, placement: 'ground', v3Only: true, sway: true, nameKey: 'decor.graveyard.wiltedFlowers' },
          { sprite: 'deco_graveyard_chain_coil', count: 4, placement: 'ground', v3Only: true, shadow: false, nameKey: 'decor.graveyard.chainCoil' },
          { sprite: 'deco_graveyard_urn_shards', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.graveyard.urnShards' },
          { sprite: 'deco_graveyard_ectoplasm', count: 4, placement: 'ground', v3Only: true, shadow: false, bob: true, glow: { color: '#78dca8', r: 12 }, nameKey: 'decor.graveyard.ectoplasm' },
          { sprite: 'deco_graveyard_fresh_mound', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.graveyard.freshMound' }
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
          { sprite: 'flora_pine_big', count: 7, cluster: true, placement: 'blocker', sway: true },
          { sprite: 'flora_pine_mid', count: 6, cluster: true, placement: 'blocker', sway: true },
          { sprite: 'deco_pine_snow', count: 3, placement: 'blocker', sway: true },
          { sprite: 'flora_ice_shard', count: 4, placement: 'ground', glow: { color: '#a8e0f0', r: 15 } },
          { sprite: 'flora_snow_mound', count: 6, placement: 'ground' },
          { sprite: 'deco_rock', count: 3, placement: 'ground' },
          { sprite: 'deco_snowpass_ice_spikes', count: 4, placement: 'ground', v3Only: true, glow: { color: '#a8e8f8', r: 11 }, nameKey: 'decor.snowpass.iceSpikes' },
          { sprite: 'deco_snowpass_snow_bones', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.snowpass.snowBones' },
          { sprite: 'deco_snowpass_frost_shrub', count: 4, placement: 'ground', v3Only: true, sway: true, nameKey: 'decor.snowpass.frostShrub' },
          { sprite: 'deco_snowpass_trail_cairn', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.snowpass.trailCairn' },
          { sprite: 'deco_snowpass_frozen_puddle', count: 4, placement: 'ground', v3Only: true, shadow: false, nameKey: 'decor.snowpass.frozenPuddle' },
          { sprite: 'deco_snowpass_broken_sled', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.snowpass.brokenSled' }
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
          { sprite: 'flora_obsidian', count: 5, cluster: true, placement: 'blocker' },
          { sprite: 'deco_lava_rock', count: 8, placement: 'blocker', glow: { color: '#f09030', r: 13 } },
          { sprite: 'flora_char_stump', count: 5, placement: 'ground' },
          { sprite: 'flora_rocks_big', count: 3, placement: 'blocker' },
          { sprite: 'deco_lavacave_ember_vent', count: 4, placement: 'ground', v3Only: true, flicker: true, glow: { color: '#f06a28', r: 13 }, nameKey: 'decor.lavacave.emberVent' },
          { sprite: 'deco_lavacave_sulfur_crystals', count: 4, placement: 'ground', v3Only: true, glow: { color: '#e8c83f', r: 10 }, nameKey: 'decor.lavacave.sulfurCrystals' },
          { sprite: 'deco_lavacave_lava_crust', count: 4, placement: 'ground', v3Only: true, shadow: false, glow: { color: '#dc5424', r: 9 }, nameKey: 'decor.lavacave.lavaCrust' },
          { sprite: 'deco_lavacave_basalt_shards', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.lavacave.basaltShards' },
          { sprite: 'deco_lavacave_scorched_bones', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.lavacave.scorchedBones' },
          { sprite: 'deco_lavacave_ash_mound', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.lavacave.ashMound' }
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
          { sprite: 'flora_pillar_big', count: 5, cluster: true, placement: 'blocker' },
          { sprite: 'flora_pillar_broken', count: 5, placement: 'blocker' },
          { sprite: 'deco_pillar', count: 3, placement: 'blocker' },
          { sprite: 'flora_float_crystal', count: 5, placement: 'ground', bob: true, glow: { color: '#8ae8dc', r: 15 } },
          { sprite: 'flora_flowers_blue', count: 5, placement: 'ground' },
          { sprite: 'deco_crystal', count: 3, placement: 'ground', glow: { color: '#68c8e8', r: 11 } },
          { sprite: 'deco_skyruins_rune_tile', count: 4, placement: 'ground', v3Only: true, shadow: false, glow: { color: '#64dbe8', r: 10 }, nameKey: 'decor.skyruins.runeTile' },
          { sprite: 'deco_skyruins_gear_fragment', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.skyruins.gearFragment' },
          { sprite: 'deco_skyruins_marble_rubble', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.skyruins.marbleRubble' },
          { sprite: 'deco_skyruins_aether_motes', count: 4, placement: 'ground', v3Only: true, bob: true, shadow: false, glow: { color: '#52d9ee', r: 13 }, nameKey: 'decor.skyruins.aetherMotes' },
          { sprite: 'deco_skyruins_cloud_grass', count: 4, placement: 'ground', v3Only: true, sway: true, nameKey: 'decor.skyruins.cloudGrass' },
          { sprite: 'deco_skyruins_mosaic', count: 4, placement: 'ground', v3Only: true, shadow: false, nameKey: 'decor.skyruins.mosaic' }
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
          { sprite: 'flora_dark_tree', count: 4, placement: 'blocker', sway: true },
          { sprite: 'deco_banner_evil', count: 6, cluster: true, placement: 'blocker' },
          { sprite: 'flora_lantern', count: 6, placement: 'ground', glow: { color: '#b070e0', r: 15 }, flicker: true },
          { sprite: 'flora_spikes', count: 4, placement: 'blocker' },
          { sprite: 'deco_pillar', count: 3, placement: 'blocker' },
          { sprite: 'deco_bone', count: 4, placement: 'ground' },
          { sprite: 'deco_darkcastle_ritual_rune', count: 4, placement: 'ground', v3Only: true, shadow: false, flicker: true, glow: { color: '#e64248', r: 13 }, nameKey: 'decor.darkcastle.ritualRune' },
          { sprite: 'deco_darkcastle_iron_chain', count: 4, placement: 'ground', v3Only: true, shadow: false, nameKey: 'decor.darkcastle.ironChain' },
          { sprite: 'deco_darkcastle_banner_scrap', count: 4, placement: 'ground', v3Only: true, sway: true, nameKey: 'decor.darkcastle.bannerScrap' },
          { sprite: 'deco_darkcastle_claw_marks', count: 4, placement: 'ground', v3Only: true, shadow: false, nameKey: 'decor.darkcastle.clawMarks' },
          { sprite: 'deco_darkcastle_purple_fungus', count: 4, placement: 'ground', v3Only: true, glow: { color: '#a252bd', r: 10 }, nameKey: 'decor.darkcastle.purpleFungus' },
          { sprite: 'deco_darkcastle_gargoyle_fragment', count: 4, placement: 'ground', v3Only: true, nameKey: 'decor.darkcastle.gargoyleFragment' }
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

  /*
   * v3 装饰不是逐点独立随机，而由以下作者数据驱动：
   * - pattern: blob / edgeBand / line / ring / arc / row / trail / scatter / field
   * - anchor: blocker-edge / water-edge / lava-edge / route / landmark / parent
   * - clusters / members / radius: 多尺度簇群结构
   * - solitaryRate: 保留少量离群实例，避免所有物件机械抱团
   *
   * 未列出的旧装饰仍获得 placement 对应的通用生态默认值。引擎不得根据
   * sprite ID 猜测语义；下表是唯一的造型与栖息地作者入口。
   */
  var DECOR_DISTRIBUTIONS = {
    deco_grassland_clover: {
      pattern: 'blob', clusters: [4, 7], members: [4, 9], radius: [30, 72],
      fieldScale: 230, solitaryRate: 0.12
    },
    deco_grassland_wild_wheat: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [38, 116],
      clusters: [4, 7], members: [4, 8], radius: [38, 88], aspect: 0.42,
      fieldScale: 280, solitaryRate: 0.08
    },
    deco_grassland_dandelions: {
      pattern: 'blob', clusters: [4, 7], members: [4, 8], radius: [28, 64],
      fieldScale: 190, solitaryRate: 0.1
    },
    deco_grassland_burrow: {
      pattern: 'scatter', anchor: 'blocker-edge', anchorRange: [46, 132],
      clusters: [2, 4], members: [1, 2], radius: [54, 110],
      fieldScale: 320, solitaryRate: 0.62
    },
    deco_grassland_fallen_branch: {
      pattern: 'trail', anchor: 'blocker-edge', anchorRange: [24, 92],
      clusters: [3, 5], members: [2, 5], radius: [34, 82], aspect: 0.28,
      fieldScale: 240, solitaryRate: 0.22
    },
    deco_grassland_fairy_ring: {
      pattern: 'ring', clusters: [2, 4], members: [4, 7], radius: [24, 48],
      fieldScale: 360, solitaryRate: 0.18
    },

    deco_forest_mossy_log: {
      pattern: 'line', anchor: 'blocker-edge', anchorRange: [22, 82],
      clusters: [3, 5], members: [2, 5], radius: [34, 76], aspect: 0.24,
      fieldScale: 250, solitaryRate: 0.14
    },
    deco_forest_red_shrooms: {
      pattern: 'arc', anchor: 'parent', parent: 'deco_forest_mossy_log',
      anchorRange: [12, 54], clusters: [3, 6], members: [3, 7],
      radius: [18, 46], fieldScale: 160, solitaryRate: 0.06
    },
    deco_forest_cones_acorns: {
      pattern: 'blob', anchor: 'blocker-edge', anchorRange: [14, 76],
      clusters: [4, 7], members: [3, 7], radius: [22, 54],
      fieldScale: 180, solitaryRate: 0.12
    },
    deco_forest_root_knot: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [8, 48],
      clusters: [3, 6], members: [2, 5], radius: [28, 66], aspect: 0.32,
      fieldScale: 210, solitaryRate: 0.1
    },
    deco_forest_leaf_pile: {
      pattern: 'trail', anchor: 'route', anchorRange: [28, 104],
      clusters: [3, 6], members: [3, 7], radius: [34, 82], aspect: 0.3,
      fieldScale: 240, solitaryRate: 0.12
    },
    deco_forest_fern_stones: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [18, 74],
      clusters: [4, 7], members: [3, 7], radius: [30, 72], aspect: 0.38,
      fieldScale: 190, solitaryRate: 0.08
    },

    deco_mine_broken_rail: {
      pattern: 'line', anchor: 'route', anchorRange: [18, 78],
      clusters: [3, 5], members: [4, 9], radius: [54, 118], aspect: 0.18,
      fieldScale: 310, solitaryRate: 0.03
    },
    deco_mine_coal_pile: {
      pattern: 'blob', anchor: 'blocker-edge', anchorRange: [16, 72],
      clusters: [3, 6], members: [3, 7], radius: [24, 60],
      fieldScale: 200, solitaryRate: 0.12
    },
    deco_mine_discarded_pick: {
      pattern: 'scatter', anchor: 'parent', parent: 'deco_mine_broken_rail',
      anchorRange: [12, 62], clusters: [2, 4], members: [1, 3],
      radius: [30, 72], fieldScale: 260, solitaryRate: 0.42
    },
    deco_mine_lantern: {
      pattern: 'line', anchor: 'parent', parent: 'deco_mine_broken_rail',
      anchorRange: [18, 74], clusters: [2, 4], members: [2, 4],
      radius: [32, 76], aspect: 0.18, fieldScale: 280, solitaryRate: 0.22
    },
    deco_mine_timber_scraps: {
      pattern: 'trail', anchor: 'parent', parent: 'deco_mine_broken_rail',
      anchorRange: [10, 58], clusters: [3, 5], members: [3, 7],
      radius: [32, 76], aspect: 0.26, fieldScale: 220, solitaryRate: 0.08
    },
    deco_mine_copper_rubble: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [12, 64],
      clusters: [3, 6], members: [3, 7], radius: [28, 68], aspect: 0.36,
      fieldScale: 180, solitaryRate: 0.1
    },

    deco_graveyard_cracked_slab: {
      pattern: 'row', anchor: 'route', anchorRange: [42, 132],
      clusters: [3, 5], members: [4, 8], radius: [52, 106], aspect: 0.2,
      fieldScale: 330, solitaryRate: 0.04
    },
    deco_graveyard_wilted_flowers: {
      pattern: 'arc', anchor: 'parent', parent: 'deco_graveyard_cracked_slab',
      anchorRange: [8, 44], clusters: [3, 6], members: [2, 5],
      radius: [18, 42], fieldScale: 190, solitaryRate: 0.08
    },
    deco_graveyard_chain_coil: {
      pattern: 'scatter', anchor: 'parent', parent: 'deco_graveyard_cracked_slab',
      anchorRange: [12, 60], clusters: [2, 4], members: [1, 3],
      radius: [28, 64], fieldScale: 250, solitaryRate: 0.38
    },
    deco_graveyard_urn_shards: {
      pattern: 'blob', anchor: 'parent', parent: 'deco_graveyard_cracked_slab',
      anchorRange: [8, 52], clusters: [3, 5], members: [2, 5],
      radius: [20, 48], fieldScale: 170, solitaryRate: 0.12
    },
    deco_graveyard_ectoplasm: {
      pattern: 'blob', anchor: 'water-edge', anchorRange: [18, 112],
      clusters: [3, 5], members: [3, 6], radius: [24, 58],
      fieldScale: 260, solitaryRate: 0.1
    },
    deco_graveyard_fresh_mound: {
      pattern: 'row', anchor: 'route', anchorRange: [48, 138],
      clusters: [3, 5], members: [3, 7], radius: [46, 98], aspect: 0.22,
      fieldScale: 300, solitaryRate: 0.06
    },

    deco_snowpass_ice_spikes: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [8, 64],
      clusters: [4, 7], members: [3, 7], radius: [32, 78], aspect: 0.34,
      fieldScale: 220, solitaryRate: 0.08
    },
    deco_snowpass_snow_bones: {
      pattern: 'trail', anchor: 'route', anchorRange: [26, 116],
      clusters: [2, 4], members: [2, 5], radius: [38, 88], aspect: 0.24,
      fieldScale: 310, solitaryRate: 0.26
    },
    deco_snowpass_frost_shrub: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [28, 104],
      clusters: [4, 7], members: [3, 7], radius: [34, 82], aspect: 0.4,
      fieldScale: 240, solitaryRate: 0.1
    },
    deco_snowpass_trail_cairn: {
      pattern: 'trail', anchor: 'route', anchorRange: [18, 68],
      clusters: [3, 5], members: [1, 3], radius: [58, 118], aspect: 0.12,
      fieldScale: 380, solitaryRate: 0.44
    },
    deco_snowpass_frozen_puddle: {
      pattern: 'blob', anchor: 'water-edge', anchorRange: [10, 86],
      clusters: [3, 5], members: [2, 5], radius: [28, 64],
      fieldScale: 250, solitaryRate: 0.14
    },
    deco_snowpass_broken_sled: {
      pattern: 'line', anchor: 'route', anchorRange: [22, 92],
      clusters: [2, 4], members: [1, 3], radius: [46, 96], aspect: 0.18,
      fieldScale: 340, solitaryRate: 0.46
    },

    deco_lavacave_ember_vent: {
      pattern: 'edgeBand', anchor: 'lava-edge', anchorRange: [8, 62],
      clusters: [3, 6], members: [3, 7], radius: [30, 70], aspect: 0.34,
      fieldScale: 230, solitaryRate: 0.08
    },
    deco_lavacave_sulfur_crystals: {
      pattern: 'edgeBand', anchor: 'lava-edge', anchorRange: [16, 96],
      clusters: [3, 6], members: [3, 7], radius: [30, 72], aspect: 0.38,
      fieldScale: 190, solitaryRate: 0.1
    },
    deco_lavacave_lava_crust: {
      pattern: 'arc', anchor: 'lava-edge', anchorRange: [6, 48],
      clusters: [3, 5], members: [3, 7], radius: [26, 58],
      fieldScale: 170, solitaryRate: 0.06
    },
    deco_lavacave_basalt_shards: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [10, 70],
      clusters: [4, 7], members: [3, 7], radius: [30, 72], aspect: 0.36,
      fieldScale: 210, solitaryRate: 0.1
    },
    deco_lavacave_scorched_bones: {
      pattern: 'trail', anchor: 'route', anchorRange: [34, 126],
      clusters: [2, 4], members: [2, 5], radius: [38, 88], aspect: 0.24,
      fieldScale: 320, solitaryRate: 0.28
    },
    deco_lavacave_ash_mound: {
      pattern: 'arc', anchor: 'parent', parent: 'deco_lavacave_ember_vent',
      anchorRange: [12, 72], clusters: [3, 6], members: [3, 7],
      radius: [28, 68], fieldScale: 220, solitaryRate: 0.08
    },

    deco_skyruins_rune_tile: {
      pattern: 'row', anchor: 'landmark', anchorRange: [34, 150],
      clusters: [3, 5], members: [4, 8], radius: [50, 104], aspect: 0.18,
      fieldScale: 330, solitaryRate: 0.04
    },
    deco_skyruins_gear_fragment: {
      pattern: 'scatter', anchor: 'parent', parent: 'deco_skyruins_rune_tile',
      anchorRange: [12, 66], clusters: [2, 4], members: [1, 4],
      radius: [28, 68], fieldScale: 250, solitaryRate: 0.28
    },
    deco_skyruins_marble_rubble: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [10, 72],
      clusters: [4, 7], members: [3, 8], radius: [32, 78], aspect: 0.34,
      fieldScale: 210, solitaryRate: 0.08
    },
    deco_skyruins_aether_motes: {
      pattern: 'arc', anchor: 'landmark', anchorRange: [30, 142],
      clusters: [3, 6], members: [3, 7], radius: [32, 76],
      fieldScale: 280, solitaryRate: 0.08
    },
    deco_skyruins_cloud_grass: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [24, 104],
      clusters: [4, 7], members: [3, 7], radius: [34, 82], aspect: 0.4,
      fieldScale: 220, solitaryRate: 0.1
    },
    deco_skyruins_mosaic: {
      pattern: 'row', anchor: 'landmark', anchorRange: [20, 118],
      clusters: [3, 5], members: [3, 7], radius: [46, 96], aspect: 0.2,
      fieldScale: 300, solitaryRate: 0.05
    },

    deco_darkcastle_ritual_rune: {
      pattern: 'ring', anchor: 'landmark', anchorRange: [38, 154],
      clusters: [2, 4], members: [5, 9], radius: [32, 70],
      fieldScale: 380, solitaryRate: 0.02
    },
    deco_darkcastle_iron_chain: {
      pattern: 'arc', anchor: 'parent', parent: 'deco_darkcastle_ritual_rune',
      anchorRange: [10, 66], clusters: [3, 5], members: [3, 7],
      radius: [26, 62], fieldScale: 220, solitaryRate: 0.06
    },
    deco_darkcastle_banner_scrap: {
      pattern: 'trail', anchor: 'blocker-edge', anchorRange: [18, 82],
      clusters: [3, 5], members: [2, 5], radius: [38, 88], aspect: 0.24,
      fieldScale: 280, solitaryRate: 0.18
    },
    deco_darkcastle_claw_marks: {
      pattern: 'line', anchor: 'route', anchorRange: [24, 96],
      clusters: [3, 5], members: [3, 7], radius: [44, 96], aspect: 0.16,
      fieldScale: 310, solitaryRate: 0.08
    },
    deco_darkcastle_purple_fungus: {
      pattern: 'edgeBand', anchor: 'blocker-edge', anchorRange: [8, 62],
      clusters: [4, 7], members: [3, 7], radius: [28, 68], aspect: 0.36,
      fieldScale: 190, solitaryRate: 0.08
    },
    deco_darkcastle_gargoyle_fragment: {
      pattern: 'scatter', anchor: 'landmark', anchorRange: [38, 156],
      clusters: [2, 4], members: [1, 4], radius: [46, 104],
      fieldScale: 350, solitaryRate: 0.36
    }
  };

  var DEFAULT_DISTRIBUTIONS = {
    blocker: {
      pattern: 'field', fieldScale: 240, fieldStrength: 0.88,
      minSpacing: 22, solitaryRate: 0
    },
    ground: {
      pattern: 'blob', clusters: [4, 7], members: [3, 7],
      radius: [30, 72], fieldScale: 240, fieldStrength: 0.82,
      minSpacing: 15, solitaryRate: 0.14
    },
    water: {
      pattern: 'blob', anchor: 'water-edge', anchorRange: [0, 56],
      clusters: [1, 3], members: [2, 5], radius: [24, 58],
      fieldScale: 180, fieldStrength: 0.76, minSpacing: 15,
      solitaryRate: 0.12, materials: ['water']
    }
  };

  R.forEach(function (region) {
    (region.terrain.deco || []).forEach(function (definition) {
      var placement = definition.placement || (definition.water ? 'water' : 'ground');
      definition.distribution = Object.assign(
        {},
        DEFAULT_DISTRIBUTIONS[placement] || DEFAULT_DISTRIBUTIONS.ground,
        DECOR_DISTRIBUTIONS[definition.sprite] || {}
      );
    });
  });

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

  /* v3 开放远征内容。所有区域差异均由注册表声明，生成器不判断区域 ID。 */
  var PRESETS = {
    grassland: 'open-field',
    forest: 'porous-forest',
    mine: 'eroded-cavern',
    graveyard: 'ruined-fortress',
    snowpass: 'ridge-pass',
    lavacave: 'eroded-cavern',
    skyruins: 'island-chain',
    darkcastle: 'ruined-fortress'
  };

  var EXTRA_RESOURCES = {
    grassland: [
      ['moon_dew', 'gather_moon_dew', '#5f8fc1', '#d8f3ff', 'common'],
      ['river_reed', 'gather_river_reed', '#6f9853', '#d8d67d', 'common'],
      ['sunseed', 'gather_sunseed', '#b27b38', '#ffe27a', 'rare']
    ],
    forest: [
      ['silk_moss', 'gather_silk_moss', '#487c69', '#a9f2cf', 'common'],
      ['ancient_bark', 'gather_ancient_bark', '#745138', '#d5a56c', 'common'],
      ['glow_spore', 'gather_glow_spore', '#576f9c', '#b9edff', 'rare']
    ],
    mine: [
      ['coal_shard', 'gather_coal_shard', '#3b3c48', '#9da1b2', 'common'],
      ['cave_salt', 'gather_cave_salt', '#9b8f82', '#f1e4d4', 'common'],
      ['deep_geode', 'gather_deep_geode', '#565074', '#d0a8ff', 'rare']
    ],
    graveyard: [
      ['bone_fragment', 'gather_bone_fragment', '#a39786', '#eee2cc', 'common'],
      ['spirit_wax', 'gather_spirit_wax', '#786d85', '#e6ddff', 'common'],
      ['nightshade', 'gather_nightshade', '#543d69', '#ce8cff', 'rare']
    ],
    snowpass: [
      ['snow_lotus', 'gather_snow_lotus', '#93afc1', '#f6fbff', 'common'],
      ['frozen_ore', 'gather_frozen_ore', '#617f96', '#bdeaff', 'common'],
      ['griffin_feather', 'gather_griffin_feather', '#a79562', '#fff0a8', 'rare']
    ],
    lavacave: [
      ['magma_bloom', 'gather_magma_bloom', '#9f372d', '#ffb04f', 'common'],
      ['sulfur_stone', 'gather_sulfur_stone', '#8a6b2d', '#f5d85b', 'common'],
      ['ember_scale', 'gather_ember_scale', '#8c2f37', '#ffc05e', 'rare']
    ],
    skyruins: [
      ['cloud_silk', 'gather_cloud_silk', '#8ca4bd', '#f2fbff', 'common'],
      ['star_metal', 'gather_star_metal', '#64718c', '#d8e5ff', 'common'],
      ['wind_crystal', 'gather_wind_crystal', '#4b9a9b', '#bafff3', 'rare']
    ],
    darkcastle: [
      ['void_ash', 'gather_void_ash', '#443b52', '#a79ab8', 'common'],
      ['blood_rose', 'gather_blood_rose', '#812e43', '#ff8aa1', 'common'],
      ['fallen_sigil', 'gather_fallen_sigil', '#59416f', '#d99cff', 'rare']
    ]
  };

  var CONTENT_IDS = {
    grassland: {
      landmarks: ['river_watch', 'old_waystone', 'windmill_ruin', 'slime_nest'],
      curios: ['sun_dial', 'wanderer_pack', 'silver_bell'],
      ecology: ['golden_hare', 'brook_sprite']
    },
    forest: {
      landmarks: ['whisper_grove', 'moss_shrine', 'sunken_bridge', 'elder_hollow'],
      curios: ['root_crown', 'green_lantern', 'hunter_totem'],
      ecology: ['moon_moth', 'antler_owl']
    },
    mine: {
      landmarks: ['lift_ruin', 'echo_gallery', 'foreman_post', 'golem_foundry'],
      curios: ['miners_dice', 'blue_lamp', 'sealed_charge'],
      ecology: ['crystal_beetle', 'blind_newt']
    },
    graveyard: {
      landmarks: ['mourning_gate', 'bell_crypt', 'saint_court', 'black_mausoleum'],
      curios: ['votive_chain', 'empty_mask', 'last_letter'],
      ecology: ['candle_crow', 'pale_fox']
    },
    snowpass: {
      landmarks: ['ice_bridge', 'pilgrim_shelter', 'signal_peak', 'giant_crater'],
      curios: ['warm_stone', 'storm_compass', 'white_banner'],
      ecology: ['aurora_stag', 'snow_wisp']
    },
    lavacave: {
      landmarks: ['basalt_gate', 'forge_ruin', 'ember_lake', 'demon_caldera'],
      curios: ['smiths_tongs', 'ash_hourglass', 'cinder_idol'],
      ecology: ['glass_salamander', 'ember_moth']
    },
    skyruins: {
      landmarks: ['broken_aqueduct', 'star_archive', 'wind_bridge', 'guardian_core'],
      curios: ['sky_chart', 'singing_key', 'cloud_prism'],
      ecology: ['ribbon_ray', 'clockwork_swallow']
    },
    darkcastle: {
      landmarks: ['fallen_bastion', 'silent_throne', 'miasma_well', 'demon_keep'],
      curios: ['oath_blade', 'cracked_crown', 'dawn_reliquary'],
      ecology: ['void_raven', 'red_moon_bat']
    }
  };

  // Boss 领地由内容数据声明；生成器只解释通用的地表纹样、装饰池和
  // 正面净空，不按区域 ID 写视觉特判。
  var BOSS_TERRITORIES = {
    grassland: {
      sprite: 'boss_lair_grassland',
      radius: 126, squash: 0.64, decorCount: 9, approachClearance: 0.72,
      ground: {
        fill: '#416447', edge: '#91a85e', accent: '#65b9d4',
        marks: ['pools', 'stones']
      },
      aura: { color: '#64c8e8', radius: 46, alpha: 0.12 },
      decor: [
        { sprite: 'boss_decor_grassland_1', count: 3, glow: { color: '#5ec6e8', r: 13 } },
        { sprite: 'boss_decor_grassland_2', count: 2, sway: true },
        { sprite: 'boss_decor_grassland_3', count: 3 }
      ]
    },
    forest: {
      sprite: 'boss_lair_forest',
      radius: 132, squash: 0.66, decorCount: 10, approachClearance: 0.74,
      ground: {
        fill: '#304c32', edge: '#778751', accent: '#55c4a8',
        marks: ['roots', 'wisps']
      },
      aura: { color: '#54d6bd', radius: 48, alpha: 0.13 },
      decor: [
        { sprite: 'boss_decor_forest_1', count: 3, bob: true, glow: { color: '#65d7c3', r: 14 } },
        { sprite: 'boss_decor_forest_2', count: 3 },
        { sprite: 'boss_decor_forest_3', count: 2, sway: true, glow: { color: '#58cbb5', r: 13 } }
      ]
    },
    mine: {
      sprite: 'boss_lair_mine',
      radius: 128, squash: 0.62, decorCount: 9, approachClearance: 0.68,
      ground: {
        fill: '#494249', edge: '#8f7455', accent: '#4bc7dc',
        marks: ['rails', 'circuits']
      },
      aura: { color: '#42cfe8', radius: 45, alpha: 0.13 },
      decor: [
        { sprite: 'boss_decor_mine_1', count: 3, bob: true, glow: { color: '#49d7ed', r: 15 } },
        { sprite: 'boss_decor_mine_2', count: 3 },
        { sprite: 'boss_decor_mine_3', count: 2, flicker: true, glow: { color: '#f29a42', r: 14 } }
      ]
    },
    graveyard: {
      sprite: 'boss_lair_graveyard',
      radius: 130, squash: 0.64, decorCount: 10, approachClearance: 0.74,
      ground: {
        fill: '#383440', edge: '#80758c', accent: '#a36cdb',
        marks: ['graves', 'candles']
      },
      aura: { color: '#aa78e8', radius: 46, alpha: 0.13 },
      decor: [
        { sprite: 'boss_decor_graveyard_1', count: 4, flicker: true, glow: { color: '#ad79ea', r: 14 } },
        { sprite: 'boss_decor_graveyard_2', count: 2 },
        { sprite: 'boss_decor_graveyard_3', count: 2, sway: true }
      ]
    },
    snowpass: {
      sprite: 'boss_lair_snowpass',
      radius: 138, squash: 0.62, decorCount: 9, approachClearance: 0.70,
      ground: {
        fill: '#b8cad8', edge: '#f1f6fb', accent: '#72c4e3',
        marks: ['runes', 'cracks']
      },
      aura: { color: '#90dcf4', radius: 48, alpha: 0.12 },
      decor: [
        { sprite: 'boss_decor_snowpass_1', count: 3, glow: { color: '#8bd8f0', r: 13 } },
        { sprite: 'boss_decor_snowpass_2', count: 3 },
        { sprite: 'boss_decor_snowpass_3', count: 2, sway: true }
      ]
    },
    lavacave: {
      sprite: 'boss_lair_lavacave',
      radius: 130, squash: 0.63, decorCount: 10, approachClearance: 0.72,
      ground: {
        fill: '#37282a', edge: '#91452d', accent: '#f07b2a',
        marks: ['cracks', 'sigil']
      },
      aura: { color: '#f0792e', radius: 49, alpha: 0.15 },
      decor: [
        { sprite: 'boss_decor_lavacave_1', count: 3, flicker: true, glow: { color: '#f28a32', r: 15 } },
        { sprite: 'boss_decor_lavacave_2', count: 3 },
        { sprite: 'boss_decor_lavacave_3', count: 2, bob: true, glow: { color: '#ff9a38', r: 14 } }
      ]
    },
    skyruins: {
      sprite: 'boss_lair_skyruins',
      radius: 134, squash: 0.64, decorCount: 9, approachClearance: 0.72,
      ground: {
        fill: '#7c8392', edge: '#d9c99e', accent: '#60d2e3',
        marks: ['rings', 'runes']
      },
      aura: { color: '#63d9e8', radius: 50, alpha: 0.14 },
      decor: [
        { sprite: 'boss_decor_skyruins_1', count: 3, bob: true, glow: { color: '#65dce9', r: 14 } },
        { sprite: 'boss_decor_skyruins_2', count: 3, bob: true },
        { sprite: 'boss_decor_skyruins_3', count: 2, bob: true, glow: { color: '#63d7e6', r: 15 } }
      ]
    },
    darkcastle: {
      sprite: 'boss_lair_darkcastle',
      radius: 140, squash: 0.62, decorCount: 11, approachClearance: 0.76,
      ground: {
        fill: '#30263b', edge: '#744281', accent: '#c83e5c',
        marks: ['sigil', 'spikes']
      },
      aura: { color: '#aa55d8', radius: 52, alpha: 0.16 },
      decor: [
        { sprite: 'boss_decor_darkcastle_1', count: 4, flicker: true, glow: { color: '#a95bd9', r: 16 } },
        { sprite: 'boss_decor_darkcastle_2', count: 3, sway: true },
        { sprite: 'boss_decor_darkcastle_3', count: 2, bob: true, glow: { color: '#d84b68', r: 13 } }
      ]
    }
  };

  function makeExploration(region) {
    var rid = region.id;
    var ids = CONTENT_IDS[rid];
    var bossTerritory = BOSS_TERRITORIES[rid];
    var baseResources = GATHER[rid].map(function (x) {
      return {
        id: x.id, material: x.material, sprite: x.sprite,
        color: x.color, accent: x.accent, rarity: 'common',
        nameKey: 'material.' + x.material
      };
    });
    var extras = EXTRA_RESOURCES[rid].map(function (x) {
      return {
        id: x[0], material: x[0], sprite: x[1],
        color: x[2], accent: x[3], rarity: x[4],
        nameKey: 'material.' + x[0]
      };
    });
    var landmarks = ids.landmarks.map(function (id, index) {
      var landmark = {
        id: id,
        nameKey: 'explore.content.' + rid + '.' + id,
        function: index === 0 ? 'intel' : (index === 1 ? 'shelter' : (index === 2 ? 'shortcut' : 'boss')),
        sprite: index === 3 ? bossTerritory.sprite : 'exp_landmark'
      };
      if (index === 3) landmark.territory = bossTerritory;
      return landmark;
    });
    return {
      world: { w: 2400, h: 1440 },
      macroPreset: PRESETS[rid],
      blockerTheme: PRESETS[rid],
      landmarks: landmarks,
      resources: baseResources.concat(extras),
      curios: ids.curios.map(function (id, index) {
        return {
          id: id, nameKey: 'explore.content.' + rid + '.' + id,
          sprite: 'exp_curio', choices: index % 2 ? ['ward', 'haste'] : ['scout', 'fortune']
        };
      }),
      ecology: ids.ecology.map(function (id) {
        return { id: id, nameKey: 'explore.content.' + rid + '.' + id, sprite: 'exp_ecology' };
      }),
      threats: [
        { id: 'patrol', nameKey: 'explore.threat.patrol' },
        { id: 'nest', nameKey: 'explore.threat.nest' },
        { id: 'ambush', nameKey: 'explore.threat.ambush' }
      ],
      affixes: ['alert', 'sturdy', 'swift', 'miasma', 'sentry'],
      guardian: {
        nameKey: 'explore.guardian.' + rid,
        monster: region.monsters[1] || region.monsters[0],
        sprite: 'exp_guardian_mark'
      },
      anomalies: ['dense_fog', 'rich_veins', 'restless', 'tailwind', 'miasma_tide'],
      commissions: [
        { id: rid + '_supplies', reward: 'potions', costs: [0, 1, 2] },
        { id: rid + '_coffer', reward: 'gold', costs: [1, 2, 3] },
        { id: rid + '_relic', reward: 'gear', costs: [2, 3, 4] },
        { id: rid + '_mastery', reward: 'perm', costs: [0, 3, 4], cap: 3 }
      ]
    };
  }

  for (var i = 0; i < R.length; i++) {
    R[i].order = i;
    R[i].layout = LAYOUTS[R[i].id];
    R[i].gather = {
      count: [3, 5],
      cooldown: [90, 150],
      nodes: GATHER[R[i].id]
    };
    R[i].exploration = makeExploration(R[i]);
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
  }
      capabilities.authoring.provideValue({
        id: 'region.catalog', version: 1, value: R
      });
      capabilities.authoring.provideFactory({
        id: 'region.by-id', version: 1, fn: function (id) {
        for (var ri = 0; ri < R.length; ri++) if (R[ri].id === id) return R[ri];
        return null;
        }
      });
    }
  });
})();
