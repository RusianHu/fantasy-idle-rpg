/* global Game */
(function () {
  'use strict';

  var U = Game.util;
  var regions = Game.reg.all('region');
  var currentIndex = 0;
  var paused = false;
  var timeMode = 'cycle';
  var lastFrame = performance.now();

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
    var decoCount = cfg.deco.reduce(function (sum, item) { return sum + item.count; }, 0) + 2;
    var patchCount = cfg.patches.reduce(function (sum, item) { return sum + item.count; }, 0);
    var flowerCount = cfg.flowers ? cfg.flowers.count : 0;
    var materialRows = '<div class="config-row"><span>基础材质</span><div>' +
      esc(MATERIAL_NAMES[cfg.base.mat] || cfg.base.mat) + swatches(cfg.base.colors) +
      '<div class="raw-id">' + esc(cfg.base.mat) + '</div></div></div>';

    materialRows += cfg.patches.map(function (patch) {
      return '<div class="config-row"><span>' + esc(MATERIAL_NAMES[patch.mat] || patch.mat) + ' × ' + patch.count + '</span>' +
        '<div>半径 ' + patch.rMin + '–' + patch.rMax + ' px ' + swatches(patch.colors) +
        '<div class="raw-id">' + esc(patch.mat) + '</div></div></div>';
    }).join('');

    var decoRows = cfg.deco.map(function (def) {
      return spriteRow(def.sprite, DECO_NAMES[def.sprite] || def.sprite, trait('× ' + def.count) + decoTraits(def));
    }).join('');
    decoRows += spriteRow('tent', '营帐', trait('固定注入') + trait('软阴影'));
    decoRows += spriteRow('campfire', '四帧篝火', trait('固定注入') + trait('动态光晕', 'accent') + trait('火星/轻烟', 'accent'));

    var monsterRows = region.monsters.map(function (id) {
      return spriteRow(id, monsterName(id), trait('普通怪'));
    }).join('');
    monsterRows += spriteRow(region.boss, monsterName(region.boss), trait('Boss', 'boss') + trait('出生点 ' + region.bossPoint.x + ',' + region.bossPoint.y));

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
        '<div class="metric"><strong>' + cfg.tufts + '</strong><span>动态草簇</span></div>' +
        '<div class="metric"><strong>' + flowerCount + '</strong><span>烘焙花簇</span></div>' +
      '</div>' +
      '<section class="inspect-section"><h3>地表着色与材质反馈</h3><div class="row-list">' + materialRows +
        '<div class="config-row"><span>世界尺寸</span><div>' + region.world.w + ' × ' + region.world.h + ' px / 8 px 材质网格</div></div>' +
        '<div class="config-row"><span>草簇配色</span><div>' + (cfg.tuftColors ? swatches(cfg.tuftColors) : '无') + '</div></div>' +
        '<div class="config-row"><span>烘焙花簇</span><div>' + (cfg.flowers ? cfg.flowers.count + ' 组 ' + swatches(cfg.flowers.colors) : '无') + '</div></div>' +
      '</div><p class="note">地表还会由原版算法固定生成 7 块明暗色斑、材质纹理、材质边缘与纵向深度光照。</p></section>' +
      '<section class="inspect-section"><h3>动态装饰与发光体</h3><div class="sprite-list">' + decoRows + '</div></section>' +
      '<section class="inspect-section"><h3>实体与地形交互载体</h3><div class="sprite-list">' + monsterRows + '</div>' +
        '<p class="note">普通怪同时存在 7 个，由原版世界逻辑分散刷新并持续触发移动、脚步材质反馈与战斗特效；击杀 ' + region.killTarget + ' 只后触发 Boss 登场演出。</p></section>' +
      '<section class="inspect-section"><h3>固定特效锚点</h3><div class="row-list">' +
        '<div class="config-row"><span>营地点</span><div>(' + region.camp.x + ', ' + region.camp.y + ')；营帐位于 X−30 / Y−4，篝火位于 X / Y+8</div></div>' +
        '<div class="config-row"><span>Boss 点</span><div>(' + region.bossPoint.x + ', ' + region.bossPoint.y + ')</div></div>' +
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

  function setHeroPosition(x, y) {
    var hero = Game.world.hero;
    if (!hero) return;
    hero.x = U.clamp(x, 50, Game.world.region.world.w - 50);
    hero.y = U.clamp(y, Game.world.BOUND_TOP + 10, Game.world.region.world.h - 30);
    hero.target = null;
    hero.moveOrder = null;
    hero.state = 'idle';
    Game.render.snapCamera(hero.x, hero.y);
  }

  function activateRegion(index) {
    currentIndex = (index + regions.length) % regions.length;
    var region = regions[currentIndex];

    if (window.location.hash !== '#' + region.id) {
      window.history.replaceState(null, '', '#' + region.id);
    }

    Game.state.world.region = region.id;
    Game.state.world.mode = 'battle';
    Game.state.world.deathsRow = 0;
    Game.state.player.level = 1 + currentIndex * 9;
    Game.state.player.exp = 0;
    Game.state.player.skills = {};
    Game.player.recalc();
    Game.state.player.hp = Game.state.derived.maxHp;
    Game.world.init(region.id);

    document.getElementById('stage-index').textContent = String(currentIndex + 1).padStart(2, '0');
    document.getElementById('stage-region-name').textContent = regionName(region);
    document.getElementById('stage-region-id').textContent = 'region / ' + region.id;
    renderTabs();
    renderInspector(region);
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
    document.querySelector('.segmented').addEventListener('click', function (event) {
      var button = event.target.closest('[data-time]');
      if (button) setTimeMode(button.getAttribute('data-time'));
    });
    document.querySelector('.focus-actions').addEventListener('click', function (event) {
      var button = event.target.closest('[data-focus]');
      if (!button) return;
      var region = Game.world.region;
      var focus = button.getAttribute('data-focus');
      if (focus === 'camp') setHeroPosition(region.camp.x + 30, region.camp.y + 26);
      if (focus === 'center') setHeroPosition(region.world.w * 0.5, region.world.h * 0.56);
      if (focus === 'boss') setHeroPosition(region.bossPoint.x - 48, region.bossPoint.y + 12);
    });
    window.addEventListener('keydown', function (event) {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
      if (event.key === '[') activateRegion(currentIndex - 1);
      if (event.key === ']') activateRegion(currentIndex + 1);
    });
    window.addEventListener('hashchange', function () {
      var id = window.location.hash.slice(1);
      var index = regions.findIndex(function (region) { return region.id === id; });
      if (index >= 0 && index !== currentIndex) activateRegion(index);
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
    }
    Game.render.frame(paused ? 0 : dt);
    document.getElementById('runtime-count').textContent = Game.world.entities.length + ' 个实体';
    requestAnimationFrame(frame);
  }

  Game.i18n.setLocale('zh-CN');
  Game.state = Game.State.newGame();
  Game.state.world.regionOrder = Game.reg.ids('region');
  Game.state.settings.autoAdvance = false;
  Game.state.settings.autoEquip = false;
  Game.state.settings.controlMode = 'auto';
  Game.player.setClass('warrior');
  Game.render.init(document.getElementById('stage'));
  bindControls();
  var initialId = window.location.hash.slice(1);
  var initialIndex = regions.findIndex(function (region) { return region.id === initialId; });
  activateRegion(initialIndex >= 0 ? initialIndex : 0);
  requestAnimationFrame(frame);
})();
