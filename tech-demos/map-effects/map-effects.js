/* global Game */
(function () {
  'use strict';

  var U = Game.util;
  var regions = Game.reg.all('region');
  var currentIndex = 0;
  var paused = false;
  var timeMode = 'cycle';
  var lastFrame = performance.now();
  var explorationMessage = '等待交互';
  var qaRestoreAuto = false;

  function queryParams() {
    try { return new URLSearchParams(window.location.search); } catch (e) { return new URLSearchParams(); }
  }

  function parseSeed(value) {
    value = String(value || '').trim().replace(/^0x/i, '');
    return /^[0-9a-fA-F]{1,8}$/.test(value) ? (parseInt(value, 16) >>> 0) : null;
  }

  function updateUrl(regionId) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('seed', U.hex32(Game.state.world.worldSeed));
      url.searchParams.set('region', regionId);
      url.hash = '';
      window.history.replaceState(null, '', url.href);
    } catch (e) { window.location.hash = regionId; }
  }

  var MATERIAL_NAMES = {
    grass: '草地', dirt: '泥土', water: '浅水', snow: '雪地',
    sand: '沙土', lava: '熔岩', stone: '石地', miasma: '瘴气地'
  };

  var DECO_NAMES = {
    flora_oak_big: '大型橡树', flora_oak_small: '小型橡树', flora_blossom: '花树',
    flora_bush_berry: '浆果灌木', flora_flowers: '白金花簇', flora_flowers_pink: '粉金花簇',
    flora_pebbles: '碎石', flora_stump: '树桩', flora_lily: '睡莲',
    flora_tree_forest: '森林大树', flora_birch: '白桦树', flora_fern: '蕨丛',
    flora_shroom_glow: '发光蘑菇', flora_rocks_big: '大型岩组', deco_rock: '岩石',
    flora_crystal_big: '大型水晶', flora_beam: '矿坑木梁', deco_bone: '散落骨骸',
    flora_deadtree_big: '大型枯树', deco_dead_tree: '枯树', deco_tombstone: '墓碑',
    flora_grave_cross: '墓地十字架', flora_candle: '烛台', flora_skulls: '骷髅堆',
    flora_pine_big: '大型雪松', flora_pine_mid: '中型雪松', deco_pine_snow: '覆雪松树',
    flora_ice_shard: '冰晶簇', flora_snow_mound: '雪堆', flora_obsidian: '黑曜石簇',
    deco_lava_rock: '熔岩石', flora_char_stump: '焦黑树桩', flora_pillar_big: '大型遗迹柱',
    flora_pillar_broken: '断裂遗迹柱', deco_pillar: '石柱', flora_float_crystal: '浮空水晶',
    flora_flowers_blue: '蓝白花簇', deco_crystal: '水晶簇', flora_dark_tree: '暗影枯树',
    deco_banner_evil: '魔族旗帜', flora_lantern: '魂灯', flora_spikes: '魔城尖刺',
    tent: '营帐', campfire: '篝火'
  };

  var PARTICLE_NAMES = {
    meadow: '草原飘絮；夜间混入流萤', leaves: '旋落树叶', dust: '缓升洞窟尘埃',
    wisps: '青绿与蓝色磷火', snow: '持续飘雪', embers: '熔岩火星上升',
    cloudwisp: '高速流云', miasma: '紫色瘴气云与幽光'
  };

  var PARALLAX_NAMES = {
    clouds: '云层', hills: '丘陵', trees: '树林', fogband: '雾带',
    cavewall: '洞壁', stalactites: '钟乳石', deadtrees: '枯树林', mountains: '雪山',
    glow: '熔岩天光', spires: '尖塔/岩峰', islands: '浮空岛'
  };

  function esc(value) { return U.esc(String(value)); }

  function regionName(region) {
    return Game.i18n.t('region.' + region.id + '.name');
  }

  function monsterName(id) {
    return Game.i18n.t('monster.' + id + '.name');
  }

  function materialName(id) {
    return Game.i18n.t('material.' + id);
  }

  function swatches(colors) {
    return '<span class="swatches">' + colors.map(function (color) {
      return '<i class="swatch" style="background:' + esc(color) + '" title="' + esc(color) + '"></i>';
    }).join('') + '</span>';
  }

  function trait(label, cls) {
    return '<span class="trait' + (cls ? ' ' + cls : '') + '">' + esc(label) + '</span>';
  }

  function decoTraits(def) {
    var out = [];
    var sprite = Game.assets.sprite(def.sprite);
    if (def.cluster) out.push(trait('丛聚'));
    if (def.water) out.push(trait('水面'));
    if (def.bob) out.push(trait('浮动', 'accent'));
    if (def.flicker) out.push(trait('闪烁', 'accent'));
    if (def.glow) out.push(trait('发光 r' + def.glow.r, 'accent'));
    if (sprite.frames.idle1) out.push(trait('双帧摇曳'));
    if (def.shadow !== false && sprite.h >= 15) out.push(trait('软阴影'));
    return out.join('');
  }

  function spriteRow(sprite, name, traits) {
    return '<div class="sprite-row">' +
      '<canvas class="sprite-preview" width="40" height="40" data-sprite="' + esc(sprite) + '"></canvas>' +
      '<div class="sprite-copy"><strong>' + esc(name) + '</strong><small>' + esc(sprite) + '</small></div>' +
      '<div class="trait-list">' + traits + '</div>' +
    '</div>';
  }

  function renderTabs() {
    var root = document.getElementById('region-tabs');
    root.innerHTML = regions.map(function (region, index) {
      return '<button class="region-tab' + (index === currentIndex ? ' active' : '') + '" type="button" data-region-index="' + index + '"' +
        (index === currentIndex ? ' aria-current="page"' : '') + '>' +
        '<small>0' + (index + 1) + ' / TIER ' + region.tier + '</small>' + esc(regionName(region)) + '</button>';
    }).join('');
  }

  function renderInspector(region) {
    var cfg = region.terrain;
    var layout = Game.world.layout;
    var decoCount = layout.props.length;
    var patchCount = layout.patches.length;
    var flowerCount = layout.flowers.length;
    var nodes = layout.nodes || [];
    var readyNodeCount = nodes.filter(function (node) {
      return Game.environment.nodeReady(node);
    }).length;
    var tier = Game.State.regionTier(region.id);
    var gatherYield = Game.F.gatherYield(tier);
    var commonChest = Game.F.chestYield(tier, false);
    var rareChest = Game.F.chestYield(tier, true);
    var propCounts = layout.props.reduce(function (counts, prop) {
      counts[prop.sprite] = (counts[prop.sprite] || 0) + 1;
      return counts;
    }, {});
    var materialRows = '<div class="config-row"><span>基础材质</span><div>' +
      esc(MATERIAL_NAMES[cfg.base.mat] || cfg.base.mat) + swatches(cfg.base.colors) +
      '<div class="raw-id">' + esc(cfg.base.mat) + '</div></div></div>';

    materialRows += cfg.patches.map(function (patch) {
      var generated = layout.patches.filter(function (item) { return item.mat === patch.mat; }).length;
      return '<div class="config-row"><span>' + esc(MATERIAL_NAMES[patch.mat] || patch.mat) + ' × ' + generated + '</span>' +
        '<div>半径 ' + patch.rMin + '–' + patch.rMax + ' px ' + swatches(patch.colors) +
        '<div class="raw-id">原始 ' + patch.count + ' / ' + esc(patch.mat) + '</div></div></div>';
    }).join('');

    var decoRows = cfg.deco.map(function (def) {
      return spriteRow(def.sprite, DECO_NAMES[def.sprite] || def.sprite,
        trait('× ' + (propCounts[def.sprite] || 0)) + decoTraits(def));
    }).join('');
    decoRows += spriteRow('tent', '营帐', trait('固定注入') + trait('软阴影'));
    decoRows += spriteRow('campfire', '四帧篝火', trait('固定注入') + trait('动态光晕', 'accent') + trait('火星/轻烟', 'accent'));

    var gatherRows = region.gather.nodes.map(function (def) {
      var generated = nodes.filter(function (node) { return node.nodeType === def.id; });
      var positions = generated.map(function (node) {
        return '(' + Math.round(node.x) + ',' + Math.round(node.y) + ')';
      }).join(' / ');
      return spriteRow(def.sprite, materialName(def.material),
        trait('× ' + generated.length) +
        trait(def.id + ' → ' + def.material) +
        (positions ? trait(positions) : ''));
    }).join('');
    var chestRows =
      spriteRow('chest_common', '普通探索宝箱', trait('木质 / 黄铜') + trait('区域金币与素材')) +
      spriteRow('chest_rare', '稀有探索宝箱', trait('紫晶 / 暗金', 'accent') + trait('追加装备与魔晶石', 'accent'));

    var monsterRows = region.monsters.map(function (id) {
      return spriteRow(id, monsterName(id), trait('普通怪'));
    }).join('');
    monsterRows += spriteRow(region.boss, monsterName(region.boss), trait('Boss', 'boss') + trait('出生点 ' + layout.bossPoint.x + ',' + layout.bossPoint.y));

    var parallaxRows = region.parallax.map(function (layer, index) {
      var extra = [];
      extra.push('系数 ' + layer.factor);
      extra.push('Y ' + layer.y);
      if (layer.alpha !== undefined) extra.push('透明度 ' + layer.alpha);
      if (layer.fast) extra.push('高速滚动');
      if (layer.pine) extra.push('针叶轮廓');
      if (layer.tall) extra.push('高树轮廓');
      if (layer.evil) extra.push('魔光窗');
      return '<div class="config-row"><span>第 ' + (index + 1) + ' 层 · ' + esc(PARALLAX_NAMES[layer.type] || layer.type) + '</span>' +
        '<div>' + esc(extra.join(' / ')) + '<div class="raw-id">' + esc(layer.type) + '</div></div></div>';
    }).join('');

    var rays = region.rays
      ? '<div class="config-row"><span>场景光柱</span><div>' + esc(region.rays.color) + ' / alpha ' + region.rays.alpha + '</div></div>'
      : '<div class="config-row"><span>场景光柱</span><div>无</div></div>';

    document.getElementById('inspector').innerHTML =
      '<div class="inspector-header"><h2>' + esc(regionName(region)) + '</h2><p>' +
      esc(Game.i18n.t('region.' + region.id + '.desc')) + '</p></div>' +
      '<div class="metric-grid">' +
        '<div class="metric"><strong>' + decoCount + '</strong><span>装饰实例</span></div>' +
        '<div class="metric"><strong>' + patchCount + '</strong><span>材质斑块</span></div>' +
        '<div class="metric"><strong>' + layout.tufts.length + '</strong><span>动态草簇</span></div>' +
        '<div class="metric"><strong>' + flowerCount + '</strong><span>烘焙花簇</span></div>' +
        '<div class="metric"><strong>' + nodes.length + '</strong><span>采集节点</span></div>' +
        '<div class="metric"><strong id="inspector-ready-count">' + readyNodeCount + '</strong><span>当前成熟</span></div>' +
      '</div>' +
      '<section class="inspect-section"><h3>地表着色与材质反馈</h3><div class="row-list">' + materialRows +
        '<div class="config-row"><span>世界尺寸</span><div>' + region.world.w + ' × ' + region.world.h + ' px / 8 px 材质网格</div></div>' +
        '<div class="config-row"><span>草簇配色</span><div>' + (cfg.tuftColors ? swatches(cfg.tuftColors) : '无') + '</div></div>' +
        '<div class="config-row"><span>烘焙花簇</span><div>' + (cfg.flowers ? layout.flowers.length + ' 组 ' + swatches(cfg.flowers.colors) : '无') + '</div></div>' +
        '<div class="config-row"><span>v2 密度倍率</span><div>斑块 ×' + layout.density.patches + ' / 装饰 ×' + layout.density.decor + ' / 细节 ×' + layout.density.details + '</div></div>' +
      '</div><p class="note">地表还会生成 ' + Math.round(7 * layout.density.details) + ' 块明暗色斑、材质纹理、材质边缘与纵向深度光照。</p></section>' +
      '<section class="inspect-section"><h3>动态装饰与发光体</h3><div class="sprite-list">' + decoRows + '</div></section>' +
      '<section class="inspect-section"><h3>实体与地形交互载体</h3><div class="sprite-list">' + monsterRows + '</div>' +
        '<p class="note">普通怪同时存在 7 个，由原版世界逻辑分散刷新并持续触发移动、脚步材质反馈与战斗特效；击杀 ' + region.killTarget + ' 只后触发 Boss 登场演出。</p></section>' +
      '<section class="inspect-section"><h3>可采集物与探索宝箱</h3><div class="sprite-list exploration-sprite-list">' +
        gatherRows + chestRows + '</div><div class="row-list exploration-rule-list">' +
        '<div class="config-row"><span>采集产出</span><div>' + gatherYield.min + '–' + gatherYield.max +
          ' 份主题素材 + ' + gatherYield.gold + ' 金币' +
          (gatherYield.crystalChance > 0 ? ' / 魔晶石 ' + (gatherYield.crystalChance * 100).toFixed(1) + '%' : '') + '</div></div>' +
        '<div class="config-row"><span>采集规则</span><div>' + Game.F.BAL.gatherDuration.toFixed(1) +
          ' 秒交互 / 节点冷却 ' + region.gather.cooldown[0] + '–' + region.gather.cooldown[1] + ' 秒 / 接敌中断</div></div>' +
        '<div class="config-row"><span>普通宝箱</span><div>' + commonChest.gold + ' 金币 / ' +
          commonChest.materialMin + '–' + commonChest.materialMax + ' 份区域素材</div></div>' +
        '<div class="config-row"><span>稀有宝箱</span><div>' + rareChest.gold + ' 金币 / ' +
          rareChest.materialMin + '–' + rareChest.materialMax + ' 份区域素材 / 稀有以上装备 / 魔晶石 ' +
          Math.round(rareChest.crystalChance * 100) + '%</div></div>' +
        '<div class="config-row"><span>发现与保留</span><div>合法移动 ' + Game.F.BAL.chestMoveMin + '–' +
          Game.F.BAL.chestMoveMax + ' 等效秒 / 稀有率 ' + Math.round(Game.F.BAL.chestRareChance * 100) +
          '% / 最短间隔 ' + Game.F.BAL.chestMinGap + ' 秒 / 保留 ' + Game.F.BAL.chestTtl + ' 秒</div></div>' +
      '</div><p class="note">自动 AI 优先级为接敌战斗 → 地面掉落 → 宝箱 → 成熟采集节点 → 游走；节点冷却写入存档，宝箱与发现进度仅驻内存。</p></section>' +
      '<section class="inspect-section"><h3>固定特效锚点</h3><div class="row-list">' +
        '<div class="config-row"><span>世界种子</span><div><code>' + U.hex32(layout.worldSeed) + '</code> / layout v' + layout.version + '</div></div>' +
        '<div class="config-row"><span>营地点</span><div>(' + layout.camp.x + ', ' + layout.camp.y + ')；安全半径 ' + layout.campSafeRadius + ' px</div></div>' +
        '<div class="config-row"><span>Boss 点</span><div>(' + layout.bossPoint.x + ', ' + layout.bossPoint.y + ')；战斗半径 ' + layout.bossSafeRadius + ' px</div></div>' +
        '<div class="config-row"><span>主走廊</span><div>' + layout.corridor.points.length + ' 个点 / ' + layout.corridor.width + ' px / ' + esc(layout.corridor.mat) + '</div></div>' +
        '<div class="config-row"><span>导航与出生</span><div>' + layout.nav.w + ' × ' + layout.nav.h + ' 格 / 低代价候选 ' + layout.spawnCandidates.length + '</div></div>' +
      '</div></section>' +
      '<section class="inspect-section"><h3>天空、视差与环境粒子</h3><div class="row-list">' +
        '<div class="config-row"><span>天空渐变</span><div>' + swatches([region.skyTop, region.skyBottom]) + ' ' + esc(region.skyTop + ' → ' + region.skyBottom) + '</div></div>' +
        '<div class="config-row"><span>环境粒子</span><div>' + esc(PARTICLE_NAMES[region.particles] || region.particles) + '<div class="raw-id">' + esc(region.particles) + '</div></div></div>' +
        rays + parallaxRows +
      '</div><p class="note">所有区域共用 20 分钟日夜循环、夜间星空与月亮、全屏色调、暗角、篝火光晕及材质脚步反馈。</p></section>';

    Array.prototype.forEach.call(document.querySelectorAll('.sprite-preview'), function (canvas) {
      Game.assets.drawToDom(canvas, canvas.getAttribute('data-sprite'), 'idle0');
    });
  }

  function setExplorationEvent(message) {
    explorationMessage = message;
    var output = document.getElementById('exploration-event');
    if (output) output.textContent = message;
  }

  function restoreAutoAfterQa() {
    if (!qaRestoreAuto) return;
    qaRestoreAuto = false;
    Game.world.setControlMode('auto');
  }

  function prepareQaTarget() {
    var hero = Game.world.hero;
    if (!hero) return;
    var shouldRestoreAuto = qaRestoreAuto || Game.world.controlMode() === 'auto';
    qaRestoreAuto = false;
    Game.world.cancelInteraction('qa-target');
    if (Game.world.controlMode() === 'auto') {
      Game.world.setControlMode('manual');
    }
    qaRestoreAuto = shouldRestoreAuto;
    hero.target = null;
    hero.manualTarget = false;
    hero.moveOrder = null;
    hero.state = 'idle';
    Game.world.entities.forEach(function (entity) {
      if (entity.kind === 'monster') entity.engaged = false;
    });
    Game.nav.clear(hero);
  }

  function readyNodes() {
    return (Game.world.layout.nodes || []).filter(function (node) {
      return Game.environment.nodeReady(node);
    });
  }

  function focusReadyNode() {
    var nodes = readyNodes();
    if (!nodes.length) {
      setExplorationEvent('当前区域没有成熟节点，可先恢复全部节点');
      return;
    }
    prepareQaTarget();
    var hero = Game.world.hero;
    var node = nodes.reduce(function (best, candidate) {
      if (!best) return candidate;
      return U.dist(hero.x, hero.y, candidate.x, candidate.y) <
        U.dist(hero.x, hero.y, best.x, best.y) ? candidate : best;
    }, null);
    setHeroPosition(node.x - 34, node.y + 8);
    setExplorationEvent('已定位 ' + materialName(node.material) + '，点击画布中的发光节点开始采集');
  }

  function resetGatherNodes() {
    var nodes = Game.world.layout.nodes || [];
    nodes.forEach(function (node) {
      Game.state.world.nodeCooldowns[node.id] = 0;
    });
    setExplorationEvent('已恢复本区域全部 ' + nodes.length + ' 个采集节点');
  }

  function spawnQaChest(rare) {
    if (Game.world.bossEnt) {
      setExplorationEvent('Boss 登场期间不会生成宝箱，请先切换区域或结束战斗');
      return null;
    }
    prepareQaTarget();
    Game.environment.resetRegion();

    var originalChance = U.chance;
    var chest = null;
    U.chance = function () { return !!rare; };
    try {
      chest = Game.environment.spawnChest();
      if (!chest) {
        var candidates = (Game.world.layout.spawnCandidates || []).slice(0, 12);
        for (var i = 0; i < candidates.length && !chest; i++) {
          setHeroPosition(candidates[i].x, candidates[i].y);
          chest = Game.environment.spawnChest();
        }
      }
    } finally {
      U.chance = originalChance;
    }

    if (!chest) {
      restoreAutoAfterQa();
      setExplorationEvent('当前镜头附近没有合法宝箱落点，请切换区域后重试');
      return null;
    }
    Game.render.snapCamera(Game.world.hero.x, Game.world.hero.y);
    setExplorationEvent('已生成' + (rare ? '稀有' : '普通') + '宝箱，点击画布中的箱体走近开启');
    return chest;
  }

  function updateExplorationQa() {
    if (!Game.world.layout || !Game.environment) return;
    var nodes = Game.world.layout.nodes || [];
    var mature = nodes.filter(function (node) {
      return Game.environment.nodeReady(node);
    }).length;
    document.getElementById('gather-runtime').textContent = mature + ' / ' + nodes.length + ' 成熟';
    var inspectorReady = document.getElementById('inspector-ready-count');
    if (inspectorReady) inspectorReady.textContent = mature;

    var progress = Game.environment.progressSnapshot();
    document.getElementById('discovery-runtime').textContent =
      Math.floor(progress.seconds) + ' / ' + Math.ceil(progress.target) + ' 秒';

    var chest = Game.environment.chests()[0];
    document.getElementById('chest-runtime').textContent = chest
      ? (chest.rare ? '稀有' : '普通') + ' · ' + Math.max(0, Math.ceil(chest.ttl - chest.age)) + 's'
      : '无';
    document.getElementById('exploration-event').textContent = explorationMessage;
  }

  function bindExplorationEvents() {
    Game.bus.on('gather:start', function (payload) {
      setExplorationEvent('采集中 · ' + materialName(payload.material));
    });
    Game.bus.on('gather:done', function (payload) {
      setExplorationEvent('采集完成 · +' + payload.count + ' ' + materialName(payload.material) +
        ' / +' + payload.gold + ' 金币');
      restoreAutoAfterQa();
    });
    Game.bus.on('gather:interrupted', function () {
      setExplorationEvent('采集被接敌或新指令中断，节点仍保持成熟');
      restoreAutoAfterQa();
    });
    Game.bus.on('chest:spawned', function (payload) {
      setExplorationEvent('探索发现' + (payload.rare ? '稀有' : '普通') + '宝箱，点击箱体走近开启');
    });
    Game.bus.on('chest:opened', function (payload) {
      setExplorationEvent((payload.rare ? '稀有' : '普通') + '宝箱已开启 · +' +
        payload.gold + ' 金币 / +' + payload.materialCount + ' ' + materialName(payload.material));
      restoreAutoAfterQa();
    });
    Game.bus.on('chest:expired', function () {
      setExplorationEvent('宝箱已在 90 秒时限结束后消失');
      restoreAutoAfterQa();
    });
  }

  function setHeroPosition(x, y) {
    var hero = Game.world.hero;
    if (!hero) return;
    Game.world.cancelInteraction('qa-focus');
    hero.x = U.clamp(x, 50, Game.world.region.world.w - 50);
    hero.y = U.clamp(y, Game.world.BOUND_TOP + 10, Game.world.region.world.h - 30);
    hero.target = null;
    hero.moveOrder = null;
    hero.manualTarget = false;
    hero.state = 'idle';
    Game.nav.clear(hero);
    Game.render.snapCamera(hero.x, hero.y);
  }

  function activateRegion(index) {
    currentIndex = (index + regions.length) % regions.length;
    var region = regions[currentIndex];

    qaRestoreAuto = false;
    Game.state.settings.controlMode = 'auto';
    Game.state.world.region = region.id;
    Game.state.world.mode = 'battle';
    Game.state.world.deathsRow = 0;
    Game.state.player.level = 1 + currentIndex * 9;
    Game.state.player.exp = 0;
    Game.state.player.skills = {};
    Game.player.recalc();
    Game.state.player.hp = Game.state.derived.maxHp;
    Game.world.init(region.id);
    updateUrl(region.id);
    document.getElementById('seed-input').value = U.hex32(Game.state.world.worldSeed);

    document.getElementById('stage-index').textContent = String(currentIndex + 1).padStart(2, '0');
    document.getElementById('stage-region-name').textContent = regionName(region);
    document.getElementById('stage-region-id').textContent = 'region / ' + region.id;
    setExplorationEvent(regionName(region) + '已生成 ' + (Game.world.layout.nodes || []).length + ' 个采集节点');
    renderTabs();
    renderInspector(region);
    updateExplorationQa();
  }

  function setTimeMode(mode) {
    timeMode = mode;
    var dayLength = Game.F.BAL.dayLength;
    if (mode === 'day') Game.state.world.worldTime = dayLength * 0.28;
    if (mode === 'dusk') Game.state.world.worldTime = dayLength * 0.56;
    if (mode === 'night') Game.state.world.worldTime = dayLength * 0.82;
    Array.prototype.forEach.call(document.querySelectorAll('[data-time]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-time') === mode);
    });
  }

  function bindControls() {
    document.getElementById('region-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('[data-region-index]');
      if (button) activateRegion(Number(button.getAttribute('data-region-index')));
    });
    document.getElementById('prev-region').addEventListener('click', function () { activateRegion(currentIndex - 1); });
    document.getElementById('next-region').addEventListener('click', function () { activateRegion(currentIndex + 1); });
    document.getElementById('toggle-play').addEventListener('click', function () {
      paused = !paused;
      this.textContent = paused ? '\u25b6' : '\u2161';
      this.title = paused ? '继续演示' : '暂停演示';
      this.setAttribute('aria-label', this.title);
      document.getElementById('runtime-status').textContent = paused ? '特效已暂停' : '原版特效运行中';
    });
    document.getElementById('effects-toggle').addEventListener('change', function () {
      Game.particles.setEnabled(this.checked);
    });
    document.getElementById('spawn-dynamic-trade').addEventListener('click', function () {
      var hero = Game.world.hero;
      Game.trade.clearDynamic();
      Game.trade.registerDynamic({
        id: 'qa-wanderer',
        regionId: Game.world.region.id,
        kind: 'wander',
        x: U.clamp(hero.x + 74, 40, Game.world.region.world.w - 40),
        y: U.clamp(hero.y + 22, Game.world.BOUND_TOP + 24, Game.world.region.world.h - 24),
        radius: 62,
        catalogs: ['camp-general'],
        priority: 30,
        nameKey: 'tradeArea.generic',
        prop: { style: 'supply-cart' }
      }, { ttl: 20 });
      document.getElementById('dynamic-trade-status').textContent = '已注册 · TTL 20s';
    });
    document.getElementById('focus-gather').addEventListener('click', focusReadyNode);
    document.getElementById('reset-gather').addEventListener('click', resetGatherNodes);
    document.getElementById('spawn-common-chest').addEventListener('click', function () {
      spawnQaChest(false);
    });
    document.getElementById('spawn-rare-chest').addEventListener('click', function () {
      spawnQaChest(true);
    });
    document.getElementById('seed-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = document.getElementById('seed-input');
      var seed = parseSeed(input.value);
      if (seed === null) {
        input.setCustomValidity('请输入 1–8 位十六进制数字');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      Game.state.world.worldSeed = seed;
      activateRegion(currentIndex);
    });
    document.querySelector('.segmented').addEventListener('click', function (event) {
      var button = event.target.closest('[data-time]');
      if (button) setTimeMode(button.getAttribute('data-time'));
    });
    document.querySelector('.focus-actions').addEventListener('click', function (event) {
      var button = event.target.closest('[data-focus]');
      if (!button) return;
      var region = Game.world.region;
      var layout = Game.world.layout;
      var focus = button.getAttribute('data-focus');
      if (focus === 'camp') setHeroPosition(layout.camp.x + 30, layout.camp.y + 26);
      if (focus === 'center') setHeroPosition(region.world.w * 0.5, region.world.h * 0.56);
      if (focus === 'boss') setHeroPosition(layout.bossPoint.x - 48, layout.bossPoint.y + 12);
    });
    window.addEventListener('keydown', function (event) {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
      if (event.key === '[') activateRegion(currentIndex - 1);
      if (event.key === ']') activateRegion(currentIndex + 1);
    });
  }

  function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!paused) {
      if (timeMode === 'cycle') {
        Game.state.world.worldTime = (Game.state.world.worldTime + dt) % Game.F.BAL.dayLength;
      }
      Game.terrain.update(dt);
      Game.particles.update(dt);
      Game.fx.update(dt);
      Game.world.update(dt);
      Game.trade.update();
    }
    Game.render.frame(paused ? 0 : dt);
    document.getElementById('runtime-count').textContent = Game.world.entities.length + ' 个实体';
    updateExplorationQa();
    var qaArea = Game.trade.areaById('qa-wanderer');
    if (!qaArea) {
      document.getElementById('dynamic-trade-status').textContent = '未注册 / 已过期';
    } else {
      document.getElementById('dynamic-trade-status').textContent =
        '运行中 · 剩余 ' + Math.max(0, Math.ceil(qaArea.expiresAt - Game.state.world.worldTime)) + 's';
    }
    requestAnimationFrame(frame);
  }

  Game.i18n.setLocale('zh-CN');
  Game.state = Game.State.newGame();
  // 该实验室专门保留 v1/v2 的 900×520 地表与旧探索交互回归；
  // 开放地图 v3 使用相邻的 exploration-v3 实验室。
  Game.state.world.layoutVersion = 2;
  var params = queryParams();
  var querySeed = parseSeed(params.get('seed'));
  if (querySeed !== null) Game.state.world.worldSeed = querySeed;
  Game.state.world.regionOrder = Game.reg.ids('region');
  Game.state.settings.autoAdvance = false;
  Game.state.settings.autoEquip = false;
  Game.state.settings.controlMode = 'auto';
  Game.player.setClass('fighter');
  Game.render.init(document.getElementById('stage'));
  bindControls();
  bindExplorationEvents();
  var initialId = params.get('region') || window.location.hash.slice(1);
  var initialIndex = regions.findIndex(function (region) { return region.id === initialId; });
  activateRegion(initialIndex >= 0 ? initialIndex : 0);
  requestAnimationFrame(frame);
})();
