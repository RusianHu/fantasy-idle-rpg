/* global Game, DemoI18n */
(function () {
  'use strict';

  var U = Game.util;
  var D = DemoI18n;
  var regions = Game.reg.all('region');
  var currentIndex = 0;
  var paused = false;
  var timeMode = 'cycle';
  var lastFrame = performance.now();
  var qaRestoreAuto = false;
  var explorationMessage = '';

  var COPY = {
    'zh-CN': {
      valid: '结构验证', pass: '通过', fail: '未通过', world: '世界尺寸', walkable: '可行走率',
      connected: '主连通格', centers: '宏观中心', edges: '拓扑边', loops: '环路秩', alternate: '替代路线',
      clearance: '最小净宽', chunks: '热区块', props: '环境实体', blockers: '大型阻挡',
      resources: '资源节点', landmarks: '地标', curios: '奇物', ecology: '稀有生态', threats: '威胁领地',
      guardian: '守门精英', attempts: '生成尝试', repairs: '确定性修复', fallback: '安全回退', none: '无',
      generation: '开放地图生成报告', content: '探索内容角色', resourceCatalog: '区域资源目录',
      combat: '战斗生态与环境', qa: '运行时 QA 状态', monster: '普通怪', boss: 'Boss',
      seed: '世界种子', layout: '布局协议', strategy: '远征策略', intent: 'AI 意图', coverage: '迷雾揭示', gold: '金币',
      ready: '成熟', rare: '稀有', common: '常见', count: '数量', cooldown: '冷却', particle: '环境粒子',
      parallax: '视差层', generationNote: '所有指标来自本次 Game.terrain.generate/validate 结果，不是静态文档值。',
      contentNote: '资源、地标、奇物、生态、威胁、守门精英和巢穴均使用稳定 ID 并写入 v12 世界状态。',
      focused: '已定位并揭示资源', revealed: '已揭示全部资源并恢复节点', noReady: '没有成熟资源',
      commonChest: '普通宝箱', rareChest: '稀有宝箱', spawned: '已生成', clickOpen: '点击箱体走近开启',
      spawnFailed: '当前镜头附近没有合法宝箱落点', bossBlocks: 'Boss 登场期间不可生成宝箱',
      gatherStart: '采集中', gatherDone: '采集完成', interrupted: '采集已中断', chestOpened: '宝箱已开启',
      chestExpired: '宝箱已过期', merchantActive: '游商运行中', merchantExpired: '未注册 / 已过期',
      regionReady: '已生成开放地图', entities: '个实体', seconds: '秒', manual: '手动', auto: '自动',
      seedError: '请输入 1–8 位十六进制数字'
    },
    en: {
      valid: 'Validation', pass: 'Pass', fail: 'Failed', world: 'World size', walkable: 'Walkable ratio',
      connected: 'Connected cells', centers: 'Macro centers', edges: 'Graph edges', loops: 'Loop rank', alternate: 'Alternate routes',
      clearance: 'Minimum clearance', chunks: 'World chunks', props: 'Environment entities', blockers: 'Large blockers',
      resources: 'Resource nodes', landmarks: 'Landmarks', curios: 'Curios', ecology: 'Rare ecology', threats: 'Threat territories',
      guardian: 'Gate guardian', attempts: 'Generation attempts', repairs: 'Deterministic repairs', fallback: 'Safe fallback', none: 'None',
      generation: 'Open-map generation report', content: 'Exploration content roles', resourceCatalog: 'Region resource catalog',
      combat: 'Combat ecology & environment', qa: 'Runtime QA state', monster: 'Enemy', boss: 'Boss',
      seed: 'World seed', layout: 'Layout protocol', strategy: 'Expedition strategy', intent: 'AI intent', coverage: 'Fog revealed', gold: 'gold',
      ready: 'Ready', rare: 'Rare', common: 'Common', count: 'Count', cooldown: 'Cooldown', particle: 'World particles',
      parallax: 'Parallax layers', generationNote: 'Every metric comes from this Game.terrain.generate/validate result, not static documentation.',
      contentNote: 'Resources, landmarks, curios, ecology, threats, guardian and lair use stable IDs in the v12 world state.',
      focused: 'Focused and revealed resource', revealed: 'Revealed all resources and reset cooldowns', noReady: 'No ready resource',
      commonChest: 'Common chest', rareChest: 'Rare chest', spawned: 'Spawned', clickOpen: 'click the chest to approach and open',
      spawnFailed: 'No legal chest position near the current view', bossBlocks: 'Chests cannot spawn while a boss is active',
      gatherStart: 'Gathering', gatherDone: 'Gather complete', interrupted: 'Gather interrupted', chestOpened: 'Chest opened',
      chestExpired: 'Chest expired', merchantActive: 'Trader active', merchantExpired: 'Not registered / expired',
      regionReady: 'Generated open map', entities: 'entities', seconds: 'seconds', manual: 'Manual', auto: 'Auto',
      seedError: 'Enter 1–8 hexadecimal digits'
    }
  };

  function tr(key) {
    var locale = D.locale();
    return (COPY[locale] && COPY[locale][key]) || COPY['zh-CN'][key] || key;
  }

  function esc(value) { return U.esc(String(value)); }
  function regionName(region) { return Game.i18n.t('region.' + region.id + '.name'); }
  function contentName(item) { return item && item.nameKey ? Game.i18n.t(item.nameKey) : (item.defId || item.id); }
  function materialName(id) { return Game.i18n.t('material.' + id); }

  function queryParams() {
    try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(); }
  }

  function parseSeed(value) {
    value = String(value || '').trim();
    if (!/^[0-9a-f]{1,8}$/i.test(value)) return null;
    return parseInt(value, 16) >>> 0;
  }

  function updateUrl(regionId) {
    if (location.protocol === 'file:') return;
    var url = new URL(location.href);
    url.searchParams.set('seed', U.hex32(Game.state.world.worldSeed));
    url.searchParams.set('region', regionId);
    url.searchParams.set('lang', D.locale());
    history.replaceState(null, '', url.href);
  }

  function trait(label, cls) {
    return '<span class="trait' + (cls ? ' ' + cls : '') + '">' + esc(label) + '</span>';
  }

  function spriteRow(sprite, name, traits) {
    return '<div class="sprite-row">' +
      '<canvas class="sprite-preview" width="40" height="40" data-sprite="' + esc(sprite) + '"></canvas>' +
      '<div class="sprite-copy"><strong>' + esc(name) + '</strong><small>' + esc(sprite) + '</small></div>' +
      '<div class="trait-list">' + traits + '</div></div>';
  }

  function configRow(label, value, raw) {
    return '<div class="config-row"><span>' + esc(label) + '</span><div>' + esc(value) +
      (raw ? '<div class="raw-id">' + esc(raw) + '</div>' : '') + '</div></div>';
  }

  function metric(value, label, id) {
    return '<div class="metric"><strong' + (id ? ' id="' + id + '"' : '') + '>' + esc(value) +
      '</strong><span>' + esc(label) + '</span></div>';
  }

  function renderTabs() {
    document.getElementById('region-tabs').innerHTML = regions.map(function (region, index) {
      return '<button class="region-tab' + (index === currentIndex ? ' active' : '') + '" type="button" data-region-index="' + index + '"' +
        (index === currentIndex ? ' aria-current="page"' : '') + '><small>' + String(index + 1).padStart(2, '0') +
        ' / TIER ' + region.tier + '</small>' + esc(regionName(region)) + '</button>';
    }).join('');
  }

  function renderInspector(region) {
    var layout = Game.world.layout;
    var report = Game.terrain.validate(layout, region);
    var metrics = report.metrics;
    var cfg = region.exploration;
    var props = layout.props || [];
    var largeProps = props.filter(function (item) { return item.large; }).length;
    var ai = Game.expeditionAI.intent();
    var resourceRows = cfg.resources.map(function (def) {
      var count = layout.nodes.filter(function (node) { return node.defId === def.id; }).length;
      return spriteRow(def.sprite, materialName(def.material),
        trait(tr('count') + ' ' + count) + trait(def.rarity === 'rare' ? tr('rare') : tr('common'), def.rarity === 'rare' ? 'accent' : ''));
    }).join('');
    var landmarkRows = layout.landmarks.map(function (item) {
      return spriteRow(item.sprite, contentName(item), trait(item.bossLair ? tr('boss') : item.function, item.bossLair ? 'boss' : ''));
    }).join('');
    var monsterRows = region.monsters.map(function (id) {
      var def = Game.reg.get('monster', id);
      return spriteRow(def.sprite || id, Game.i18n.t('monster.' + id + '.name'), trait(tr('monster')));
    }).join('') + spriteRow(region.boss, Game.i18n.t('monster.' + region.boss + '.name'), trait(tr('boss'), 'boss'));

    document.getElementById('inspector').innerHTML =
      '<div class="inspector-header"><h2>' + esc(regionName(region)) + '</h2><p>' + esc(Game.i18n.t('region.' + region.id + '.desc')) + '</p></div>' +
      '<div class="metric-grid">' +
        metric(report.valid ? tr('pass') : tr('fail'), tr('valid')) +
        metric((metrics.walkableRatio * 100).toFixed(1) + '%', tr('walkable')) +
        metric(metrics.macroCenters, tr('centers')) +
        metric(metrics.loopRank, tr('loops')) +
        metric(layout.nodes.length, tr('resources'), 'inspector-node-count') +
        metric(props.length, tr('props')) +
      '</div>' +
      '<section class="inspect-section"><h3>' + esc(tr('generation')) + '</h3><div class="row-list">' +
        configRow(tr('world'), layout.world.w + ' × ' + layout.world.h + ' px', 'layout v' + layout.version) +
        configRow(tr('connected'), metrics.connectedCells + ' / ' + (layout.nav.w * layout.nav.h), 'ratio ' + metrics.connectedRatio) +
        configRow(tr('centers') + ' / ' + tr('edges'), metrics.macroCenters + ' / ' + metrics.macroEdges) +
        configRow(tr('loops') + ' / ' + tr('alternate'), metrics.loopRank + ' / ' + metrics.alternateRoutes) +
        configRow(tr('clearance'), metrics.minClearancePx + ' px') +
        configRow(tr('chunks'), layout.chunks.length + ' × 512 px') +
        configRow(tr('attempts'), layout.generation.attempts) +
        configRow(tr('repairs'), layout.generation.repairs.length ? layout.generation.repairs.join(', ') : tr('none')) +
        configRow(tr('fallback'), layout.generation.fallback || tr('none')) +
      '</div><p class="note">' + esc(tr('generationNote')) + '</p></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('content')) + '</h3><div class="metric-grid compact">' +
        metric(layout.landmarks.length, tr('landmarks')) + metric(layout.curios.length, tr('curios')) +
        metric(layout.ecology.length, tr('ecology')) + metric(layout.threats.length, tr('threats')) +
        metric(layout.guardian ? 1 : 0, tr('guardian')) + metric(largeProps, tr('blockers')) +
      '</div><div class="sprite-list">' + landmarkRows + '</div><p class="note">' + esc(tr('contentNote')) + '</p></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('resourceCatalog')) + '</h3><div class="sprite-list">' + resourceRows + '</div></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('combat')) + '</h3><div class="sprite-list">' + monsterRows + '</div><div class="row-list">' +
        configRow(tr('particle'), region.particles) + configRow(tr('parallax'), region.parallax.length) +
        configRow(tr('props'), props.length) + configRow(tr('blockers'), largeProps) + '</div></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('qa')) + '</h3><div class="row-list">' +
        configRow(tr('seed'), U.hex32(layout.worldSeed)) + configRow(tr('layout'), 'v' + layout.version) +
        configRow(tr('strategy'), Game.expeditionAI.strategy()) + configRow(tr('intent'), ai.id + (ai.reason ? ' / ' + ai.reason : '')) +
        configRow(tr('coverage'), (Game.exploration.coverage(region.id) * 100).toFixed(1) + '%') + '</div></section>';

    Array.prototype.forEach.call(document.querySelectorAll('.sprite-preview'), function (canvas) {
      Game.assets.drawToDom(canvas, canvas.getAttribute('data-sprite'), 'idle0');
    });
  }

  function setExplorationEvent(message) {
    explorationMessage = message;
    document.getElementById('exploration-event').textContent = message;
  }

  function prepareQaTarget() {
    var hero = Game.world.hero;
    if (!hero) return;
    qaRestoreAuto = qaRestoreAuto || Game.world.controlMode() === 'auto';
    Game.world.cancelInteraction('qa-target');
    if (Game.world.controlMode() === 'auto') Game.world.setControlMode('manual');
    hero.target = null;
    hero.manualTarget = false;
    hero.moveOrder = null;
    hero.state = 'idle';
    Game.world.entities.forEach(function (entity) { if (entity.kind === 'monster') entity.engaged = false; });
    Game.nav.clear(hero);
  }

  function restoreAutoAfterQa() {
    if (!qaRestoreAuto) return;
    qaRestoreAuto = false;
    Game.world.setControlMode('auto');
  }

  function setHeroPosition(x, y) {
    var hero = Game.world.hero;
    if (!hero) return;
    var point = Game.terrain.projectPoint(x, y, 1) || Game.world.layout.camp;
    Game.world.cancelInteraction('qa-focus');
    hero.x = U.clamp(point.x, 24, Game.world.layout.world.w - 24);
    hero.y = U.clamp(point.y, Game.world.BOUND_TOP + 8, Game.world.layout.world.h - 24);
    hero.target = null;
    hero.moveOrder = null;
    hero.manualTarget = false;
    hero.state = 'idle';
    Game.nav.clear(hero);
    Game.exploration.revealAt(hero.x, hero.y, { force: true, rid: Game.world.region.id });
    Game.render.snapCamera(hero.x, hero.y);
  }

  function focusReadyNode() {
    var hero = Game.world.hero;
    var nodes = Game.world.layout.nodes.filter(function (node) { return Game.environment.nodeReady(node); });
    if (!nodes.length) { setExplorationEvent(tr('noReady')); return; }
    prepareQaTarget();
    var node = nodes.reduce(function (best, candidate) {
      return !best || U.dist(hero.x, hero.y, candidate.x, candidate.y) < U.dist(hero.x, hero.y, best.x, best.y) ? candidate : best;
    }, null);
    setHeroPosition(node.x - 32, node.y + 6);
    Game.exploration.revealAt(node.x, node.y, { force: true, rid: Game.world.region.id });
    node.seenAt = Game.state.world.worldTime - Game.environment.AUTO_GATHER_REVEAL_GRACE;
    setExplorationEvent(tr('focused') + ' · ' + materialName(node.material));
  }

  function revealAllResources() {
    Game.world.layout.nodes.forEach(function (node) {
      Game.state.world.nodeCooldowns[node.id] = 0;
      Game.exploration.revealAt(node.x, node.y, { force: true, rid: Game.world.region.id });
      node.seenAt = Game.state.world.worldTime - Game.environment.AUTO_GATHER_REVEAL_GRACE;
    });
    setExplorationEvent(tr('revealed') + ' · ' + Game.world.layout.nodes.length);
  }

  function spawnQaChest(rare) {
    if (Game.world.bossEnt) { setExplorationEvent(tr('bossBlocks')); return null; }
    prepareQaTarget();
    Game.environment.resetRegion();
    var originalChance = U.chance;
    var chest = null;
    U.chance = function () { return !!rare; };
    try {
      chest = Game.environment.spawnChest();
      if (!chest) {
        var candidates = Game.world.layout.spawnCandidates.slice(0, 16);
        for (var i = 0; i < candidates.length && !chest; i++) {
          setHeroPosition(candidates[i].x, candidates[i].y);
          chest = Game.environment.spawnChest();
        }
      }
    } finally { U.chance = originalChance; }
    if (!chest) {
      restoreAutoAfterQa();
      setExplorationEvent(tr('spawnFailed'));
      return null;
    }
    Game.exploration.revealAt(chest.x, chest.y, { force: true, rid: Game.world.region.id });
    Game.render.snapCamera(Game.world.hero.x, Game.world.hero.y);
    setExplorationEvent(tr('spawned') + ' ' + (rare ? tr('rareChest') : tr('commonChest')) + ' · ' + tr('clickOpen'));
    return chest;
  }

  function updateRuntime() {
    if (!Game.world.layout) return;
    var nodes = Game.world.layout.nodes;
    var ready = nodes.filter(function (node) { return Game.environment.nodeReady(node); }).length;
    document.getElementById('gather-runtime').textContent = D.t('map.ready', { ready: ready, total: nodes.length });
    document.getElementById('discovery-runtime').textContent = Game.exploration.readiness(Game.world.region.id).total.toFixed(0) + ' / 100';
    var chest = Game.environment.chests()[0];
    document.getElementById('chest-runtime').textContent = chest
      ? (chest.rare ? tr('rareChest') : tr('commonChest')) + ' · ' + Math.max(0, Math.ceil(chest.ttl - chest.age)) + 's'
      : tr('none');
    document.getElementById('runtime-count').textContent = D.t('map.entities', { count: Game.world.entities.length });
    var area = Game.trade.areaById('qa-wanderer');
    document.getElementById('dynamic-trade-status').textContent = area
      ? tr('merchantActive') + ' · ' + Math.max(0, Math.ceil(area.expiresAt - Game.state.world.worldTime)) + 's'
      : tr('merchantExpired');
  }

  function bindEvents() {
    Game.bus.on('gather:start', function (p) { setExplorationEvent(tr('gatherStart') + ' · ' + materialName(p.material)); });
    Game.bus.on('gather:done', function (p) {
      setExplorationEvent(tr('gatherDone') + ' · +' + p.count + ' ' + materialName(p.material));
      restoreAutoAfterQa();
    });
    Game.bus.on('gather:interrupted', function () { setExplorationEvent(tr('interrupted')); restoreAutoAfterQa(); });
    Game.bus.on('chest:opened', function (p) {
      setExplorationEvent(tr('chestOpened') + ' · +' + p.gold + ' ' + tr('gold'));
      restoreAutoAfterQa();
    });
    Game.bus.on('chest:expired', function () { setExplorationEvent(tr('chestExpired')); restoreAutoAfterQa(); });
  }

  function activateRegion(index) {
    currentIndex = (index + regions.length) % regions.length;
    var region = regions[currentIndex];
    qaRestoreAuto = false;
    Game.state.settings.controlMode = 'auto';
    Game.state.world.region = region.id;
    Game.state.world.layoutVersion = 3;
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
    document.getElementById('stage-region-id').textContent = 'region / ' + region.id + ' · layout v3';
    setExplorationEvent(regionName(region) + ' · ' + tr('regionReady') + ' · ' + Game.world.layout.nodes.length + ' ' + tr('resources'));
    renderTabs();
    renderInspector(region);
    updateRuntime();
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
      this.title = paused ? D.t('common.resume') : D.t('common.pause');
      this.setAttribute('aria-label', this.title);
      document.getElementById('runtime-status').textContent = paused ? D.t('common.paused') : D.t('map.runtime');
    });
    document.getElementById('effects-toggle').addEventListener('change', function () { Game.particles.setEnabled(this.checked); });
    document.getElementById('spawn-dynamic-trade').addEventListener('click', function () {
      var hero = Game.world.hero;
      Game.trade.clearDynamic();
      Game.trade.registerDynamic({
        id: 'qa-wanderer', regionId: Game.world.region.id, kind: 'wander',
        x: U.clamp(hero.x + 74, 40, Game.world.layout.world.w - 40),
        y: U.clamp(hero.y + 22, Game.world.BOUND_TOP + 24, Game.world.layout.world.h - 24),
        radius: 62, catalogs: ['camp-general'], priority: 30,
        nameKey: 'tradeArea.generic', prop: { style: 'supply-cart' }
      }, { ttl: 20 });
      updateRuntime();
    });
    document.getElementById('focus-gather').addEventListener('click', focusReadyNode);
    document.getElementById('reset-gather').addEventListener('click', revealAllResources);
    document.getElementById('spawn-common-chest').addEventListener('click', function () { spawnQaChest(false); });
    document.getElementById('spawn-rare-chest').addEventListener('click', function () { spawnQaChest(true); });
    document.getElementById('seed-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = document.getElementById('seed-input');
      var seed = parseSeed(input.value);
      if (seed === null) {
        input.setCustomValidity(tr('seedError'));
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      Game.state.world.worldSeed = seed;
      Game.state.world.exploration = {};
      activateRegion(currentIndex);
    });
    document.querySelector('.segmented').addEventListener('click', function (event) {
      var button = event.target.closest('[data-time]');
      if (button) setTimeMode(button.getAttribute('data-time'));
    });
    document.querySelector('.focus-actions').addEventListener('click', function (event) {
      var button = event.target.closest('[data-focus]');
      if (!button) return;
      var focus = button.getAttribute('data-focus');
      if (focus === 'camp') setHeroPosition(Game.world.layout.camp.x + 24, Game.world.layout.camp.y + 18);
      if (focus === 'center') {
        var landmark = Game.world.layout.landmarks[1] || Game.world.layout.landmarks[0];
        setHeroPosition(landmark.x - 28, landmark.y + 12);
      }
      if (focus === 'boss') setHeroPosition(Game.world.layout.bossPoint.x - 48, Game.world.layout.bossPoint.y + 12);
    });
    document.querySelector('.strategy-actions').addEventListener('click', function (event) {
      var button = event.target.closest('[data-strategy]');
      if (!button) return;
      Game.expeditionAI.setStrategy(button.getAttribute('data-strategy'));
      Array.prototype.forEach.call(document.querySelectorAll('[data-strategy]'), function (item) {
        item.classList.toggle('active', item === button);
      });
      renderInspector(Game.world.region);
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
      if (timeMode === 'cycle') Game.state.world.worldTime = (Game.state.world.worldTime + dt) % Game.F.BAL.dayLength;
      Game.terrain.update(dt);
      Game.particles.update(dt);
      Game.fx.update(dt);
      Game.world.update(dt);
      Game.trade.update();
      Game.actionBubbles.update(dt);
    }
    Game.render.frame(paused ? 0 : dt);
    updateRuntime();
    requestAnimationFrame(frame);
  }

  D.init();
  Game.content.finalize({ strict: true });
  Game.state = Game.State.newGame();
  Game.i18n.setLocale(D.locale());
  Game.state.world.layoutVersion = 3;
  var params = queryParams();
  var querySeed = parseSeed(params.get('seed'));
  if (querySeed !== null) Game.state.world.worldSeed = querySeed;
  Game.state.world.regionOrder = Game.reg.ids('region');
  Game.state.settings.autoAdvance = false;
  Game.state.settings.autoEquip = false;
  Game.state.settings.autoCampRest = false;
  Game.state.settings.groundLoot = false;
  Game.state.settings.expeditionStrategy = 'balanced';
  Game.player.setClass('fighter');
  Game.render.init(document.getElementById('stage'));
  bindControls();
  bindEvents();
  var initialId = params.get('region') || location.hash.slice(1);
  var initialIndex = regions.findIndex(function (region) { return region.id === initialId; });
  activateRegion(initialIndex >= 0 ? initialIndex : 0);
  window.addEventListener('demo:locale', function () {
    renderTabs();
    document.getElementById('stage-region-name').textContent = regionName(Game.world.region);
    renderInspector(Game.world.region);
    setExplorationEvent(Game.world.region.id + ' · ' + tr('regionReady'));
    updateRuntime();
  });
  requestAnimationFrame(frame);
})();
