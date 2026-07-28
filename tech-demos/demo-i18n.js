/* global Game */
(function () {
  'use strict';

  var STORAGE_KEY = 'firpg_demo_lang';
  var DEFAULT_LOCALE = 'zh-CN';
  var messages = {
    'zh-CN': {
      'common.demoHub': '演示中心',
      'common.backGame': '返回游戏',
      'common.language': '语言',
      'common.build': '构建',
      'common.previous': '上一个',
      'common.next': '下一个',
      'common.pause': '暂停演示',
      'common.resume': '继续演示',
      'common.running': '运行中',
      'common.paused': '已暂停',
      'common.dayCycle': '循环',
      'common.day': '昼间',
      'common.dusk': '黄昏',
      'common.night': '夜晚',
      'common.effects': '环境效果',
      'common.motion': '动态效果',
      'common.apply': '应用',
      'common.region': '区域',
      'common.seed': '世界种子',
      'common.generate': '生成',
      'common.status': '状态',
      'common.source': '生产链路',
      'hub.title': '技术演示中心',
      'hub.subtitle': '直接运行当前生产代码的独立 QA 工作台',
      'hub.overview': '当前能力',
      'hub.overviewValue': '开放探索 v3 · 存档 v12 · Actor · 确定性战斗',
      'hub.units.title': 'Actor / Combat Lab',
      'hub.units.desc': '正式内容自动枚举、1–4 对 1–8、双方肖像、固定 tick、关系、威胁、预警与事件检查。',
      'hub.map.title': '世界现场',
      'hub.map.desc': '八区开放地图、探索 AI、资源、宝箱、动态交易域、日夜与环境特效。',
      'hub.explore.title': '生成器审计',
      'hub.explore.desc': '宏观拓扑、硬阻挡、距离场、内容分布、验证与多种子批量审计。',
      'hub.open': '打开工作台',
      'hub.query': '支持 seed、region 与 lang URL 参数',
      'hub.contract': '所有页面直接加载生产注册表与系统模块，支持 file:// 直开。',
      'units.pageTitle': '角色与怪物技术验证 · 幻境远征',
      'units.title': '角色与怪物技术验证',
      'units.stageAria': '角色与怪物实时画布',
      'units.runtime': '开放探索 v3 战斗循环运行中',
      'units.battleDemo': '战斗演示',
      'units.category': '分类切换',
      'units.bubbleAnchors': '气泡锚点',
      'units.bubbleTypes': '图形气泡类型',
      'units.bubbleScenesAria': '接敌气泡布局场景',
      'units.bubbleWalkScenesAria': '行走气泡朝向场景',
      'units.battleRuntime': '战斗运行状态',
      'units.inspector': '角色与怪物属性明细',
      'units.heroes': '职业',
      'units.monsters': '普通怪',
      'units.bosses': 'Boss',
      'units.catalogAria': '区域、职业与怪物注册表目录',
      'units.catalogTitle': '角色与怪物自动目录',
      'units.catalogSummary': '{regions} 张地图 · {monsters} 个怪物选项 · {classes} 个职业',
      'units.catalogComplete': '注册映射完整',
      'units.catalogIssues': '{count} 个映射问题',
      'units.themeMaps': '主题地图',
      'units.themeMapsHint': '直接读取区域注册表',
      'units.themeMapsAria': '选择怪物所属主题地图',
      'units.regionRoster': '{region} 出场单位',
      'units.regionCounts': '{normal} 普通 · {boss} Boss',
      'units.classOptions': '职业选项',
      'units.classOption': '职业 {slot}',
      'units.normalOption': '普通 {slot}',
      'units.bossOption': 'Boss',
      'units.monsterFallback': '{name} 的生产怪物配置，由 {region} 的区域选项加载。',
      'units.time': '日夜阶段',
      'units.bubbles': '实体图形气泡',
      'units.bubbleStatus': '自动轮播 · 等待气泡',
      'units.auto': '自动轮播',
      'units.hero': '主角',
      'units.monster': '怪物',
      'units.both': '双锚点',
      'units.resource': '资源',
      'units.gather': '采集',
      'units.enemy': '接敌',
      'units.alert': '警戒',
      'units.chest': '宝箱',
      'units.loot': '掉落',
      'units.clear': '清空气泡',
      'units.bubbleScenes': '斜向接敌布局',
      'units.bubbleCenter': '纵向接敌',
      'units.bubbleLeftEdge': '左沿翻转',
      'units.bubbleRightEdge': '右沿翻转',
      'units.bubbleWalkScenes': '行走气泡布局',
      'units.bubbleWalkLeft': '向左行走',
      'units.bubbleWalkRight': '向右行走',
      'units.bubbleWalkVertical': '上下行走',
      'units.battleTitle': '战斗循环演示',
      'units.battleCopy': '直接调用 v3 世界、战斗与渲染系统。',
      'units.waiting': '等待战斗指令',
      'units.target': '目标',
      'units.heroState': '主角状态',
      'units.control': '操控',
      'units.none': '无',
      'units.autoControl': '自动',
      'units.manualControl': '手动',
      'units.demo': '演示',
      'units.spawn': '刷新陪练',
      'units.spawnBoss': '召唤 Boss',
      'units.switchControl': '切换自动/手动',
      'units.resetHero': '重置主角',
      'units.hint': '点击怪物锁定接敌，点击空白处移动；手动模式支持 WASD / 方向键。',
      'map.pageTitle': '开放世界现场技术验证 · 幻境远征',
      'map.title': '开放世界现场技术验证',
      'map.stageAria': '开放探索 v3 实时世界画布',
      'map.regionNav': '开放世界验证区域',
      'map.time': '日夜阶段',
      'map.camera': '镜头视点',
      'map.strategyAria': '远征策略',
      'map.tradeQa': '动态交易域接口验证',
      'map.runtimeAria': '探索交互运行状态',
      'map.inspector': '开放世界生成与运行指标',
      'map.runtime': '开放探索 v3 运行中',
      'map.entities': '{count} 个实体',
      'map.seedFormat': '1–8 位十六进制',
      'map.camera': '镜头视点',
      'map.camp': '营地',
      'map.landmark': '地标',
      'map.lair': 'Boss 巢穴',
      'map.strategy': '远征策略',
      'map.safe': '安全',
      'map.balanced': '均衡',
      'map.loot': '掠夺',
      'map.merchant': '注入临时游商',
      'map.merchantIdle': '未注册',
      'map.interactions': '资源 / 宝箱 / 交易域',
      'map.interactionCopy': '验证 v3 资源揭示、节点冷却、宝箱与动态交易域的生产链路。',
      'map.waiting': '等待交互',
      'map.nodes': '资源节点',
      'map.readiness': '准备度',
      'map.chest': '场上宝箱',
      'map.ready': '{ready} / {total} 成熟',
      'map.focusResource': '定位成熟资源',
      'map.revealResources': '揭示附近资源',
      'map.spawnCommon': '生成普通宝箱',
      'map.spawnRare': '生成稀有宝箱',
      'map.chestVariants': '宝箱变体',
      'map.hint': '定位后点击画布中的资源或宝箱，实际走完寻路与交互链路。',
      'explore.pageTitle': '开放探索 v3 生成器审计 · 幻境远征',
      'explore.title': '开放探索 v3 生成器审计',
      'explore.subtitle': '宏观图、硬阻挡、距离场、内容角色与结构验证',
      'explore.audit': '批量审计 32 种子',
      'explore.distance': '距离场',
      'explore.graph': '宏观拓扑',
      'explore.content': '内容角色',
      'explore.chunks': '区块边界',
      'explore.camp': '营地',
      'explore.lair': 'Boss 巢穴',
      'explore.landmark': '地标',
      'explore.resource': '资源',
      'explore.curio': '奇物',
      'explore.threat': '威胁',
      'explore.auditIdle': '可对当前区域连续验证 32 个确定性种子。',
      'explore.auditRunning': '正在审计…',
      'explore.auditDone': '32 / 32 通过 · 最慢 {max}ms · 平均 {avg}ms',
      'explore.auditFailed': '{count} 个布局未通过验证'
    },
    en: {
      'common.demoHub': 'Demo Hub',
      'common.backGame': 'Back to Game',
      'common.language': 'Language',
      'common.build': 'Build',
      'common.previous': 'Previous',
      'common.next': 'Next',
      'common.pause': 'Pause demo',
      'common.resume': 'Resume demo',
      'common.running': 'Running',
      'common.paused': 'Paused',
      'common.dayCycle': 'Cycle',
      'common.day': 'Day',
      'common.dusk': 'Dusk',
      'common.night': 'Night',
      'common.effects': 'World effects',
      'common.motion': 'Motion effects',
      'common.apply': 'Apply',
      'common.region': 'Region',
      'common.seed': 'World seed',
      'common.generate': 'Generate',
      'common.status': 'Status',
      'common.source': 'Production path',
      'hub.title': 'Technical Demo Hub',
      'hub.subtitle': 'Standalone QA workbenches running the current production code',
      'hub.overview': 'Current systems',
      'hub.overviewValue': 'Open exploration v3 · save v12 · Actors · deterministic combat',
      'hub.units.title': 'Actor / Combat Lab',
      'hub.units.desc': 'Production content enumeration, 1–4 vs 1–8, both portrait slots, fixed ticks, relations, threat, telegraphs, and events.',
      'hub.map.title': 'Live World',
      'hub.map.desc': 'Eight open regions, expedition AI, resources, chests, dynamic trade, time and effects.',
      'hub.explore.title': 'Generator Audit',
      'hub.explore.desc': 'Macro topology, hard blockers, distance fields, content placement and batch validation.',
      'hub.open': 'Open workbench',
      'hub.query': 'Supports seed, region and lang URL parameters',
      'hub.contract': 'Every page loads production registries and systems directly and works over file://.',
      'units.pageTitle': 'Units & Combat QA · Fantasy Expedition',
      'units.title': 'Units & Combat QA',
      'units.stageAria': 'Live units and combat canvas',
      'units.runtime': 'Open exploration v3 combat running',
      'units.battleDemo': 'Combat demo',
      'units.category': 'Unit category',
      'units.bubbleAnchors': 'Bubble anchors',
      'units.bubbleTypes': 'Action bubble types',
      'units.bubbleScenesAria': 'Engagement bubble layout scenes',
      'units.bubbleWalkScenesAria': 'Movement bubble direction scenes',
      'units.battleRuntime': 'Combat runtime state',
      'units.inspector': 'Unit and combat statistics',
      'units.heroes': 'Classes',
      'units.monsters': 'Enemies',
      'units.bosses': 'Bosses',
      'units.catalogAria': 'Region, class and monster registry catalog',
      'units.catalogTitle': 'Auto-discovered Unit Catalog',
      'units.catalogSummary': '{regions} maps · {monsters} monster options · {classes} classes',
      'units.catalogComplete': 'Registry mapping complete',
      'units.catalogIssues': '{count} mapping issues',
      'units.themeMaps': 'Theme maps',
      'units.themeMapsHint': 'Read directly from the region registry',
      'units.themeMapsAria': 'Choose a monster theme map',
      'units.regionRoster': '{region} roster',
      'units.regionCounts': '{normal} normal · {boss} boss',
      'units.classOptions': 'Class options',
      'units.classOption': 'Class {slot}',
      'units.normalOption': 'Normal {slot}',
      'units.bossOption': 'Boss',
      'units.monsterFallback': 'Production monster configuration for {name}, loaded from the {region} region option.',
      'units.time': 'Time of day',
      'units.bubbles': 'Entity Action Bubbles',
      'units.bubbleStatus': 'Auto sequence · waiting',
      'units.auto': 'Auto sequence',
      'units.hero': 'Hero',
      'units.monster': 'Enemy',
      'units.both': 'Both anchors',
      'units.resource': 'Resource',
      'units.gather': 'Gather',
      'units.enemy': 'Engage',
      'units.alert': 'Alert',
      'units.chest': 'Chest',
      'units.loot': 'Loot',
      'units.clear': 'Clear bubbles',
      'units.bubbleScenes': 'Diagonal engagement layout',
      'units.bubbleCenter': 'Vertical encounter',
      'units.bubbleLeftEdge': 'Left edge flip',
      'units.bubbleRightEdge': 'Right edge flip',
      'units.bubbleWalkScenes': 'Movement bubble layout',
      'units.bubbleWalkLeft': 'Walk left',
      'units.bubbleWalkRight': 'Walk right',
      'units.bubbleWalkVertical': 'Walk vertically',
      'units.battleTitle': 'Combat Loop',
      'units.battleCopy': 'Calls the v3 world, combat and renderer directly.',
      'units.waiting': 'Waiting for a combat action',
      'units.target': 'Target',
      'units.heroState': 'Hero state',
      'units.control': 'Control',
      'units.none': 'None',
      'units.autoControl': 'Auto',
      'units.manualControl': 'Manual',
      'units.demo': 'Demo',
      'units.spawn': 'Spawn sparring unit',
      'units.spawnBoss': 'Summon boss',
      'units.switchControl': 'Toggle auto/manual',
      'units.resetHero': 'Reset hero',
      'units.hint': 'Click an enemy to engage or empty ground to move. Manual mode supports WASD and arrow keys.',
      'map.pageTitle': 'Live Open World QA · Fantasy Expedition',
      'map.title': 'Live Open World QA',
      'map.stageAria': 'Live open exploration v3 canvas',
      'map.regionNav': 'Open-world QA regions',
      'map.time': 'Time of day',
      'map.camera': 'Camera focus',
      'map.strategyAria': 'Expedition strategy',
      'map.tradeQa': 'Dynamic trade area QA',
      'map.runtimeAria': 'Exploration interaction state',
      'map.inspector': 'Open-world generation and runtime metrics',
      'map.runtime': 'Open exploration v3 running',
      'map.entities': '{count} entities',
      'map.seedFormat': '1–8 hex digits',
      'map.camera': 'Camera focus',
      'map.camp': 'Camp',
      'map.landmark': 'Landmark',
      'map.lair': 'Boss lair',
      'map.strategy': 'Expedition strategy',
      'map.safe': 'Safe',
      'map.balanced': 'Balanced',
      'map.loot': 'Loot',
      'map.merchant': 'Inject roaming trader',
      'map.merchantIdle': 'Not registered',
      'map.interactions': 'Resources / Chests / Trade',
      'map.interactionCopy': 'Exercises v3 discovery, node cooldowns, chests and dynamic trade through production systems.',
      'map.waiting': 'Waiting for interaction',
      'map.nodes': 'Resource nodes',
      'map.readiness': 'Readiness',
      'map.chest': 'Active chest',
      'map.ready': '{ready} / {total} ready',
      'map.focusResource': 'Focus ready resource',
      'map.revealResources': 'Reveal nearby resources',
      'map.spawnCommon': 'Spawn common chest',
      'map.spawnRare': 'Spawn rare chest',
      'map.chestVariants': 'Chest variants',
      'map.hint': 'Focus a target, then click it on the canvas to exercise real navigation and interaction.',
      'explore.pageTitle': 'Open Exploration v3 Generator Audit · Fantasy Expedition',
      'explore.title': 'Open Exploration v3 Generator Audit',
      'explore.subtitle': 'Macro graph, hard blockers, distance field, content roles and validation',
      'explore.audit': 'Audit 32 seeds',
      'explore.distance': 'Distance field',
      'explore.graph': 'Macro topology',
      'explore.content': 'Content roles',
      'explore.chunks': 'Chunk bounds',
      'explore.camp': 'Camp',
      'explore.lair': 'Boss lair',
      'explore.landmark': 'Landmark',
      'explore.resource': 'Resource',
      'explore.curio': 'Curio',
      'explore.threat': 'Threat',
      'explore.auditIdle': 'Validate 32 deterministic seeds for the selected region.',
      'explore.auditRunning': 'Auditing…',
      'explore.auditDone': '32 / 32 passed · slowest {max}ms · average {avg}ms',
      'explore.auditFailed': '{count} layouts failed validation'
    }
  };

  function paramsLocale() {
    try {
      var value = new URLSearchParams(location.search).get('lang');
      return value === 'en' || value === 'zh-CN' ? value : null;
    } catch (_) { return null; }
  }

  function storedLocale() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === 'en' || value === 'zh-CN' ? value : null;
    } catch (_) { return null; }
  }

  var locale = paramsLocale() || storedLocale() || DEFAULT_LOCALE;

  function t(key, vars) {
    var value = (messages[locale] && messages[locale][key]) ||
      (messages[DEFAULT_LOCALE] && messages[DEFAULT_LOCALE][key]) || key;
    vars = vars || {};
    return String(value).replace(/\{(\w+)\}/g, function (_, name) {
      return vars[name] === undefined ? '{' + name + '}' : String(vars[name]);
    });
  }

  function apply(root) {
    root = root || document;
    document.documentElement.lang = locale;
    Array.prototype.forEach.call(root.querySelectorAll('[data-demo-i18n]'), function (node) {
      node.textContent = t(node.getAttribute('data-demo-i18n'));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-demo-i18n-title]'), function (node) {
      node.title = t(node.getAttribute('data-demo-i18n-title'));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-demo-i18n-aria]'), function (node) {
      node.setAttribute('aria-label', t(node.getAttribute('data-demo-i18n-aria')));
    });
    var select = root.querySelector('[data-demo-locale]');
    if (select) select.value = locale;
    var pageTitle = document.querySelector('[data-demo-page-title]');
    if (pageTitle) document.title = t(pageTitle.getAttribute('data-demo-page-title'));
  }

  function setLocale(next, updateUrl) {
    if (next !== 'en' && next !== 'zh-CN') return locale;
    locale = next;
    try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) { /* file:// privacy mode */ }
    if (window.Game && Game.i18n) Game.i18n.setLocale(locale);
    if (updateUrl !== false && location.protocol !== 'file:') {
      var url = new URL(location.href);
      url.searchParams.set('lang', locale);
      history.replaceState(null, '', url.href);
    }
    apply(document);
    window.dispatchEvent(new CustomEvent('demo:locale', { detail: { locale: locale } }));
    return locale;
  }

  function init() {
    var select = document.querySelector('[data-demo-locale]');
    if (select && !select.dataset.bound) {
      select.dataset.bound = '1';
      select.addEventListener('change', function () { setLocale(this.value); });
    }
    try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) { /* file:// privacy mode */ }
    if (window.Game && Game.i18n) Game.i18n.setLocale(locale);
    apply(document);
  }

  window.DemoI18n = {
    t: t,
    apply: apply,
    init: init,
    locale: function () { return locale; },
    setLocale: setLocale
  };
})();
