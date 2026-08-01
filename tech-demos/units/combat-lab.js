(function () {
  'use strict';
  var Game = window.Game;
  Game.content.registerPack({
    id: 'lab.ecosystem-scenarios', version: '1.0.0', schemaVersion: 1,
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    definitions: {
      encounterProfile: [
        {
          id: 'lab.encounter.three-team',
          regionId: 'grassland',
          rulesProfileId: 'core.rules.standard-v1',
          teamSlots: [
            { id: 'team-allies', role: 'combatant', coalitionId: 'allies', countsForCompletion: true, rewardEligible: false },
            { id: 'team-enemies', role: 'combatant', coalitionId: 'enemies', countsForCompletion: true, rewardEligible: true },
            { id: 'team-rivals', role: 'combatant', coalitionId: 'rivals', countsForCompletion: true, rewardEligible: true },
            { id: 'team-observers', role: 'observer', coalitionId: 'neutral', countsForCompletion: false, rewardEligible: false }
          ],
          relationMatrix: {
            'team-allies': { 'team-enemies': 'hostile', 'team-rivals': 'hostile' },
            'team-enemies': { 'team-allies': 'hostile', 'team-rivals': 'hostile' },
            'team-rivals': { 'team-allies': 'hostile', 'team-enemies': 'hostile' }
          },
          objectives: [
            { id: 'eliminate-enemies', type: 'eliminate', teamId: 'team-enemies', required: true },
            { id: 'eliminate-rivals', type: 'eliminate', teamId: 'team-rivals', required: true },
            { id: 'allies-survive', type: 'survive', teamId: 'team-allies', required: true, minimum: 1 }
          ]
        },
        {
          id: 'lab.encounter.surrender',
          regionId: 'grassland',
          rulesProfileId: 'core.rules.standard-v1',
          teamSlots: [
            { id: 'team-allies', role: 'combatant', coalitionId: 'allies', countsForCompletion: true, rewardEligible: false },
            { id: 'team-enemies', role: 'combatant', coalitionId: 'enemies', countsForCompletion: true, rewardEligible: true }
          ],
          relationMatrix: {
            'team-allies': { 'team-enemies': 'hostile' },
            'team-enemies': { 'team-allies': 'hostile' }
          },
          objectives: [
            { id: 'enemy-surrenders', type: 'surrender', teamId: 'team-enemies', required: true }
          ]
        }
      ]
    }
  });
  var $ = function (id) { return document.getElementById(id); };
  var encounter = null;
  var paused = false;
  var accumulator = 0;
  var lastTime = performance.now();
  var inspectTab = 'runtime';
  var charmOverride = null;
  var uiTick = 0;
  var bubbleLayouts = [];
  var bubbleScene = null;
  var bubbleWalkScene = null;
  var presentationCursor = 0;
  var movementTrace = [];
  var movementSignatures = {};
  var lastTerrainAudit = null;
  var lastMmoAudit = null;
  var mmoState = null;
  var labTerrainLayout = null;
  var lastSummonSnapshot = null;
  var lastSelfDestructResult = null;
  var allyTeamId = 'party';
  var enemyTeamId = 'enemy';
  var canvas = $('stage');
  var ctx = canvas.getContext('2d');

  ['aggro:detected', 'encounter:assistJoined', 'encounter:evadeStarted',
    'encounter:evadeCompleted'].forEach(function (eventName) {
    Game.bus.on(eventName, function (payload) {
      if (!mmoState) return;
      mmoState.timeline.push({ type: eventName, payload: payload || null });
      renderMmoTimeline();
    });
  });

  var copy = {
    'zh-CN': {
      title: 'Actor / 确定性战斗实验室', language: '语言', hub: '演示中心', game: '正式游戏',
      encounter: '遭遇', actor: '主 Actor', class: '职业', faction: '阵营', controller: '控制器',
      level: '等级', tier: '阶级', strategy: '策略', allies: '友方 1–4', enemies: '敌方 1–8',
      seed: '种子', scenario: '场景', reset: '重建', pause: '暂停', resume: '继续',
      step: '单步 50ms', speed: '速度', inspector: '深度检查', inspectActor: '运行时 Actor',
      tools: '运行时工具', forceAction: '指定 Action', applyStatus: '施加状态', dispel: '驱散',
      interrupt: '打断', move: '移动目标', charm: '魅惑/恢复', summonUnit: '召唤物',
      summon: '召唤', selfDestruct: '触发自毁',
      participants: 'Actor / Party / Relation', scheduler: 'Scheduler / Telegraph',
      threat: 'Threat / Resources', events: 'CombatEvent', presentationEvents: '攻击表现日志',
      movementTrace: '位移 / 接敌追踪', impact: '运行至下一次命中',
      catalog: '生产内容目录', catalogType: '类型',
      portraits: '双方肖像槽 QA', allyPortrait: '友方肖像', enemyPortrait: '敌方肖像',
      portraitReady: '生产渲染器 · 双方非空', portraitPartial: '等待双方战斗 Actor',
      ecosystem: 'Population / Engagement / Objective / Variant',
      terrainAudit: '运行地形回归', terrainReady: '地形回归待运行',
      terrainPassed: '地形寻路 / 位移回归通过', terrainFailed: '地形寻路 / 位移回归失败',
      mmoAudit: '一键 MMO 接敌回归', mmoTitle: 'MMO 感知 / 增援 / Evade',
      mmoReady: 'MMO 接敌回归待运行', mmoPassed: 'MMO 接敌 / 回巢回归通过',
      mmoFailed: 'MMO 接敌 / 回巢回归失败',
      provoke: '中立群体挑衅', surrenderAction: '目标投降', forgive: '赎罪 / 清除记忆'
    },
    en: {
      title: 'Actor / Deterministic Combat Lab', language: 'Language', hub: 'Demo hub', game: 'Production game',
      encounter: 'Encounter', actor: 'Primary Actor', class: 'Class', faction: 'Faction', controller: 'Controller',
      level: 'Level', tier: 'Tier', strategy: 'Strategy', allies: 'Allies 1–4', enemies: 'Enemies 1–8',
      seed: 'Seed', scenario: 'Scenario', reset: 'Rebuild', pause: 'Pause', resume: 'Resume',
      step: 'Single 50ms tick', speed: 'Speed', inspector: 'Deep inspector', inspectActor: 'Runtime Actor',
      tools: 'Runtime tools', forceAction: 'Request Action', applyStatus: 'Apply status', dispel: 'Dispel',
      interrupt: 'Interrupt', move: 'Move target', charm: 'Charm / restore', summonUnit: 'Summon unit',
      summon: 'Summon', selfDestruct: 'Trigger self-destruct',
      participants: 'Actor / Party / Relation', scheduler: 'Scheduler / Telegraph',
      threat: 'Threat / Resources', events: 'CombatEvent', presentationEvents: 'Attack Presentation Log',
      movementTrace: 'Movement / Contact Trace', impact: 'Run to next impact',
      catalog: 'Production content catalog', catalogType: 'Type',
      portraits: 'Combat portrait slots QA', allyPortrait: 'Ally portrait', enemyPortrait: 'Enemy portrait',
      portraitReady: 'Production renderer · both populated', portraitPartial: 'Waiting for both combat Actors',
      ecosystem: 'Population / Engagement / Objective / Variant',
      terrainAudit: 'Run terrain regression', terrainReady: 'Terrain regression ready',
      terrainPassed: 'Terrain routing / displacement passed', terrainFailed: 'Terrain routing / displacement failed',
      mmoAudit: 'Run MMO aggro regression', mmoTitle: 'MMO aggro / assist / Evade',
      mmoReady: 'MMO aggro regression ready', mmoPassed: 'MMO aggro / Evade regression passed',
      mmoFailed: 'MMO aggro / Evade regression failed',
      provoke: 'Provoke neutral group', surrenderAction: 'Target surrenders', forgive: 'Atone / clear memory'
    }
  };
  var scenarioLabels = {
    default: ['基础 1–3 人遭遇', 'Basic 1–3 pack'],
    gcd: ['GCD / oGCD / queue', 'GCD / oGCD / queue'],
    resource: ['资源耗尽与恢复', 'Resource drain / recovery'],
    combo: ['Combo / 标记', 'Combo / mark'],
    interrupt: ['打断与施法取消', 'Interrupt / cast cancel'],
    overlap: ['重叠预警与走位', 'Overlapping telegraphs'],
    healing: ['友方治疗与治疗威胁', 'Ally heal / healing threat'],
    taunt: ['威胁与嘲讽', 'Threat / taunt'],
    neutral: ['中立不可攻击', 'Neutral untargetable'],
    aoe: ['AOE 友伤过滤', 'AOE friendly-fire filter'],
    charm: ['魅惑与易主', 'Charm / team change'],
    summon: ['召唤与继承', 'Summon / inheritance'],
    boss: ['Boss 50% phase', 'Boss 50% phase'],
    engagement: ['中立群体 / 外部命令', 'Neutral group / external command'],
    terrain: ['不可通行区寻路 / 位移', 'Impassable routing / displacement'],
    mmoAggro: ['MMO 接敌 / 增援 / Evade', 'MMO aggro / assist / Evade'],
    threeTeam: ['三阵营与中立观察者', 'Three teams and neutral observer'],
    surrender: ['投降目标', 'Surrender objective']
  };
  var classStats = {
    fighter: [240, 32, 16, 1.03, 26], rogue: [172, 40, 10, 1.18, 26],
    mage: [154, 44, 9, 1.1, 96], cleric: [196, 35, 12, 1.05, 84],
    ranger: [170, 41, 10, 1.13, 112]
  };

  function locale() { return $('locale').value || 'zh-CN'; }
  function tr(key) { return copy[locale()][key] || key; }
  function translate() {
    document.documentElement.lang = locale();
    Game.i18n.setLocale(locale());
    document.querySelectorAll('[data-lab]').forEach(function (node) {
      node.textContent = tr(node.getAttribute('data-lab'));
    });
    $('pause').textContent = paused ? tr('resume') : tr('pause');
    if ($('terrain-audit-status')) {
      $('terrain-audit-status').textContent = !lastTerrainAudit
        ? tr('terrainReady')
        : (lastTerrainAudit.passed ? tr('terrainPassed') : tr('terrainFailed'));
    }
    if ($('mmo-audit-status')) {
      $('mmo-audit-status').textContent = !lastMmoAudit
        ? tr('mmoReady')
        : (lastMmoAudit.passed ? tr('mmoPassed') : tr('mmoFailed'));
    }
    renderMmoTimeline();
    refreshLocalizedDefinitionSelects();
    fillScenarios($('scenario').value);
    updateCatalog();
    updateUi(true);
  }
  function labelFor(type, def) {
    var key = def && (def.presentation && def.presentation.nameKey ||
      def.identity && def.identity.nameKey);
    var text = key ? Game.i18n.t(key) : def.id;
    return text === key ? def.id : text + ' · ' + def.id;
  }
  function fillSelect(select, values, selected, mapper) {
    select.innerHTML = '';
    values.forEach(function (value) {
      var option = document.createElement('option');
      option.value = typeof value === 'string' ? value : value.id;
      option.textContent = mapper ? mapper(value) : option.value;
      option.selected = option.value === selected;
      select.appendChild(option);
    });
  }
  function fillScenarios(selected) {
    var values = Object.keys(scenarioLabels);
    fillSelect($('scenario'), values, selected || 'default', function (id) {
      return scenarioLabels[id][locale() === 'en' ? 1 : 0];
    });
  }
  function refreshLocalizedDefinitionSelects() {
    [
      ['encounter', 'encounterProfile'],
      ['actor', 'actorArchetype'],
      ['tool-status', 'status'],
      ['summon-archetype', 'actorArchetype', function (def) { return def.category === 'summon'; }]
    ].forEach(function (entry) {
      var select = $(entry[0]);
      if (!select) return;
      var selected = select.value;
      var definitions = Game.content.all(entry[1]);
      if (entry[2]) definitions = definitions.filter(entry[2]);
      fillSelect(select, definitions, selected || definitions[0] && definitions[0].id, function (def) {
        return labelFor(entry[1], def);
      });
    });
  }
  function params() {
    var query = new URLSearchParams(location.search);
    return {
      lang: query.get('lang') || 'zh-CN',
      encounter: query.get('encounter') || (query.get('region') ? 'encounter.' + query.get('region') : 'encounter.grassland'),
      actor: query.get('unit') || 'adventurer',
      classId: query.get('class') || 'fighter',
      strategy: query.get('strategy') || 'balanced',
      seed: query.get('seed') || '20260728',
      scenario: query.get('scenario') || 'default'
    };
  }
  function updateUrl() {
    var query = new URLSearchParams();
    query.set('encounter', $('encounter').value);
    query.set('unit', $('actor').value);
    query.set('class', $('class').value);
    query.set('strategy', $('strategy').value);
    query.set('seed', $('seed').value);
    query.set('scenario', $('scenario').value);
    query.set('lang', locale());
    history.replaceState(null, '', '?' + query.toString());
  }
  function stats(classId, tier) {
    var base = classStats[classId] || classStats.fighter;
    var powerScale = Math.pow(1.52, tier - 1);
    var hpScale = Math.pow(1.56, tier - 1);
    return {
      maxHp: base[0] * hpScale, armor: base[2] * Math.pow(1.46, tier - 1),
      ward: base[2] * .75 * Math.pow(1.46, tier - 1),
      physicalPower: base[1] * powerScale, magicPower: base[1] * powerScale,
      accuracy: .94, gcdSpeed: base[3], castSpeed: base[3], autoAttackSpeed: base[3],
      cooldownRate: 1, moveSpeed: 58, range: base[4], critChance: .1,
      critMultiplier: 1.55, dodgeChance: .04, healingPower: base[1] * powerScale,
      shieldPower: base[0] * hpScale, lifesteal: .03, statusPotency: 1,
      tenacity: .12, interruptPower: 1.3, threatMultiplier: classId === 'fighter' ? 2.2 : 1,
      resourceRegen: 1, expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
    };
  }
  function tierFor(profile) {
    var ids = ['grassland', 'forest', 'mine', 'graveyard', 'snowpass', 'lavacave', 'skyruins', 'darkcastle'];
    return Math.max(1, ids.indexOf(profile.regionId) + 1);
  }
  function configureTeamIds(profile) {
    var slots = profile.teamSlots || [];
    var combatants = slots.filter(function (slot) { return slot.role === 'combatant'; });
    allyTeamId = slots.some(function (slot) { return slot.id === 'party'; })
      ? 'party' : (combatants[0] && combatants[0].id || 'party');
    enemyTeamId = slots.some(function (slot) { return slot.id === 'enemy'; })
      ? 'enemy' : (combatants.filter(function (slot) { return slot.id !== allyTeamId; })[0] || {}).id || 'enemy';
  }
  function spawnAlly(index, archetypeId, classId, tier) {
    var archetype = Game.content.get('actorArchetype', archetypeId);
    var spec = {
      instanceId: 'lab:ally:' + index, archetypeId: archetypeId,
      classId: archetype.category === 'player' ? classId : null,
      level: Number($('level').value) || tier * 5, tier: tier,
      factionId: index === 0 ? $('faction').value : 'adventurers',
      controllerId: index === 0 ? $('controller').value : 'ai:player-auto',
      transform: { x: 260 - index * 25, y: 130 + index * 75, direction: 'r' },
      spawnSource: { kind: 'lab', sourceId: $('scenario').value, sequence: index + 1 }
    };
    if (archetype.category === 'player') spec.statValues = stats(classId, tier);
    var actor = Game.actors.spawn(spec);
    if (archetype.category === 'player') actor.sprite = 'hero_' + classId;
    actor.tacticsProfileId = $('strategy').value;
    if (actor.components.actionState) Game.encounters.join(encounter.id, actor.id, allyTeamId);
    return actor;
  }
  function enemyPool(profile) {
    var base = Game.content.get('encounterProfile', 'encounter.' + profile.regionId);
    var ids = [];
    (base && base.packs || profile.packs).forEach(function (pack) {
      (pack.members || []).forEach(function (member) {
        var id = typeof member === 'string' ? member : member.archetypeId;
        if (ids.indexOf(id) < 0) ids.push(id);
      });
    });
    if (/\.boss$/.test(profile.id)) {
      var boss = profile.packs[0].members[0];
      boss = typeof boss === 'string' ? boss : boss.archetypeId;
      ids.unshift(boss);
    }
    return ids;
  }
  function spawnEnemy(index, archetypeId, tier) {
    var actor = Game.actors.spawn({
      instanceId: 'lab:enemy:' + index, archetypeId: archetypeId,
      level: Number($('level').value) || tier * 5, tier: tier,
      transform: { x: 700 + index % 2 * 34, y: 75 + index * 48, direction: 'l' },
      controllerId: 'ai:monster',
      spawnSource: { kind: 'lab', sourceId: $('scenario').value, sequence: 100 + index }
    });
    Game.encounters.join(encounter.id, actor.id, enemyTeamId);
    return actor;
  }
  function addNeutral() {
    return Game.actors.spawn({
      instanceId: 'lab:neutral', archetypeId: 'npc.guild_scout',
      factionId: 'neutral', controllerId: 'scripted',
      transform: { x: 480, y: 420 },
      spawnSource: { kind: 'lab', sourceId: 'neutral', sequence: 300 }
    });
  }

  function buildLabTerrainArena() {
    var cell = 16, w = canvas.width / cell, h = canvas.height / cell;
    var grid = [], costs = [], distance = [];
    for (var y = 0; y < h; y++) {
      var row = [], costRow = [], distanceRow = [];
      for (var x = 0; x < w; x++) {
        var border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        var divider = (x === 29 || x === 30) && y <= 22;
        var open = !border && !divider;
        row.push(open ? 1 : 0);
        costRow.push(1);
        distanceRow.push(open ? 1 : 0);
      }
      grid.push(row);
      costs.push(costRow);
      distance.push(distanceRow);
    }
    return {
      version: 3,
      regionId: 'lab-terrain',
      world: { w: canvas.width, h: canvas.height },
      nav: { cell: cell, w: w, h: h, grid: grid, costs: costs, distance: distance }
    };
  }

  function configureLabTerrain(enabled) {
    if (!enabled) {
      labTerrainLayout = null;
      Game.terrain.layout = null;
      if (Game.nav) {
        Game.nav.layout = null;
        Game.nav.finder = null;
      }
      return null;
    }
    labTerrainLayout = buildLabTerrainArena();
    Game.terrain.layout = labTerrainLayout;
    if (!Game.nav || !Game.nav.useLayout(labTerrainLayout)) {
      throw new Error('Combat Lab terrain scenario requires production navigation');
    }
    return labTerrainLayout;
  }

  function scenarioPreset(id) {
    var preset = {
      gcd: { classId: 'fighter', allies: 1, enemies: 2 },
      resource: { classId: 'rogue', allies: 1, enemies: 3 },
      combo: { classId: 'ranger', allies: 1, enemies: 3 },
      interrupt: { classId: 'cleric', allies: 1, enemies: 2 },
      overlap: { classId: 'mage', allies: 1, enemies: 4 },
      healing: { classId: 'cleric', allies: 4, enemies: 4 },
      taunt: { classId: 'fighter', allies: 4, enemies: 4 },
      neutral: { classId: 'ranger', allies: 2, enemies: 2 },
      aoe: { classId: 'mage', allies: 4, enemies: 8 },
      charm: { classId: 'rogue', allies: 2, enemies: 3 },
      summon: { classId: 'mage', allies: 2, enemies: 4 },
      boss: { classId: 'fighter', allies: 4, enemies: 1, boss: true },
      engagement: { classId: 'fighter', allies: 1, enemies: 1, engagement: true },
      terrain: { classId: 'fighter', allies: 1, enemies: 1 },
      mmoAggro: { classId: 'fighter', allies: 1, enemies: 6, encounterId: 'encounter.forest' },
      threeTeam: { classId: 'fighter', allies: 2, enemies: 4, encounterId: 'lab.encounter.three-team' },
      surrender: { classId: 'cleric', allies: 2, enemies: 2, encounterId: 'lab.encounter.surrender' }
    }[id];
    if (!preset) return;
    $('class').value = preset.classId;
    $('allies').value = preset.allies;
    $('enemies').value = preset.enemies;
    if (preset.encounterId) $('encounter').value = preset.encounterId;
    if (preset.boss && !/\.boss$/.test($('encounter').value)) $('encounter').value += '.boss';
  }
  function resetEngagementScenario(tier) {
    Game.population.reset('grassland');
    var hero = Game.actors.spawn({
      instanceId: 'lab:ally:0',
      archetypeId: 'adventurer',
      classId: $('class').value,
      level: Number($('level').value) || 20,
      tier: tier,
      factionId: 'adventurers',
      controllerId: 'player:manual',
      statValues: stats($('class').value, tier),
      transform: { x: 260, y: 240, direction: 'r' },
      spawnSource: { kind: 'lab', sourceId: 'engagement', sequence: 1 }
    });
    hero.actorRecordId = 'lab-primary';
    hero.sprite = 'hero_' + $('class').value;
    Game.parties.addMember('lab-party', hero.id);
    var foxes = ['lab-fox-a', 'lab-fox-b'].map(function (slotKey, index) {
      return Game.population.materialize('spawn.grassland.meadow-fox', {
        regionId: 'grassland',
        populationId: 'population.grassland',
        layoutSlotKey: slotKey,
        spawnRequestKey: 'lab:' + slotKey,
        x: 655 + index * 54,
        y: 210 + index * 58,
        tier: 1
      }).primary;
    });
    Game.engagement.enqueue({
      commandId: 'lab-neutral-provocation',
      requestedTick: 1,
      sourceKey: { actorRecordId: hero.actorRecordId },
      targetKey: Game.population.stableKey(foxes[0]),
      kind: 'attack'
    });
    var result = Game.engagement.processCommands(1)[0];
    encounter = result && result.ok ? Game.encounters.get(result.encounterId) : null;
  }

  function materializeMmoPack(profileId, key, x, y) {
    var result = Game.population.materialize(profileId, {
      regionId: 'forest',
      populationId: 'population.forest',
      layoutSlotKey: key,
      spawnRequestKey: 'mmo-lab:' + key,
      planSlotId: 'regular:mmo-lab:' + key,
      x: x, y: y, tier: 2
    });
    if (!result || !result.ok) throw new Error('MMO Lab Population failed: ' + key);
    return {
      id: result.lease.groupId,
      profileId: profileId,
      primary: result.primary,
      actors: result.actors,
      x: x, y: y,
      leashRadius: result.primary.packLeashRadius
    };
  }

  function setupMmoAggroScenario(tier) {
    Game.population.reset('forest');
    Game.worldAggro.reset();
    encounter = null;
    paused = true;
    var hero = Game.actors.spawn({
      instanceId: 'lab:ally:0', archetypeId: 'adventurer',
      classId: $('class').value, level: Number($('level').value) || 20, tier: tier,
      factionId: 'adventurers', controllerId: 'player:manual',
      statValues: stats($('class').value, tier),
      transform: { x: 300, y: 240, direction: 'r' },
      spawnSource: { kind: 'lab', sourceId: 'mmo-aggro', sequence: 1 }
    });
    hero.actorRecordId = 'lab-primary';
    hero.sprite = 'hero_' + $('class').value;
    hero.state = 'gather';
    hero.interactOrder = {
      type: 'gather', phase: 'act', elapsed: 1.25,
      target: { id: 'mmo-herb', x: 306, y: 244 }
    };
    hero.moveOrder = { id: 'gather-route', x: 306, y: 244 };
    Game.parties.addMember('lab-party', hero.id);

    // pack A 含正式召唤者；pack B 可增援；pack C 位于硬墙后方且同时
    // 验证最多一个世界 pack 的上限。
    var packs = [
      materializeMmoPack('spawn.forest.duo-summoner', 'initial', 350, 240),
      materializeMmoPack('spawn.forest.duo', 'assist', 390, 286),
      materializeMmoPack('spawn.forest.duo-mixed', 'blocked', 548, 240)
    ];
    Game.world.region = { id: 'forest', world: labTerrainLayout.world };
    Game.world.layout = labTerrainLayout;
    Game.world.hero = hero;
    Game.world.entities = [hero];
    packs.forEach(function (pack) {
      Array.prototype.push.apply(Game.world.entities, pack.actors);
    });
    Game.world.encounterSequence = 1;
    Game.world.encounterOrdinals = {};
    Game.world.compatSpawnSequence = 1;
    Game.world.groundLoot = [];
    Game.world.cinematic = null;
    Game.world.bossEnt = null;
    Game.player = Game.player || {};
    Game.player.hasClass = function () { return true; };
    Game.environment = Game.environment || {};
    mmoState = {
      hero: hero,
      packs: packs,
      gatheringInterrupted: false,
      timeline: [{ type: 'gather:started', payload: { elapsed: 1.25 } }]
    };
    Game.environment.interruptGather = function () {
      if (mmoState) mmoState.gatheringInterrupted = true;
    };
    refreshRuntimeSelects();
    renderMmoTimeline();
    draw();
    updateUi(true);
    return mmoState;
  }

  function mmoTimelineLabel(type) {
    var labels = {
      'gather:started': ['采集中', 'Gathering'],
      'aggro:detected': ['发现玩家并即时接敌', 'Player detected; Encounter started'],
      'encounter:assistJoined': ['邻近 pack 增援', 'Nearby pack assisted'],
      'encounter:evadeStarted': ['脱离 leash，开始回巢', 'Leash left; Evade started'],
      'encounter:evadeCompleted': ['合法出生点满状态恢复', 'Home reached; full reset']
    };
    var entry = labels[type];
    return entry ? entry[locale() === 'en' ? 1 : 0] : type;
  }

  function mmoCheckLabel(id) {
    var labels = {
      modes: ['手动 / 自动均可被敌方感知', 'Enemy perception works in manual / auto'],
      los: ['硬墙阻断 LOS', 'Hard wall blocks LOS'],
      interrupt: ['采集与世界路线即时中断', 'Gathering and world route interrupted'],
      initialPack: ['初始 pack 整组入战并写入威胁', 'Initial pack joined with base threat'],
      assist: ['仅最近常规 pack 增援一次', 'Only nearest regular pack assisted once'],
      summon: ['召唤继承 / maxActive / 零奖励', 'Summon inheritance / maxActive / zero reward'],
      leash: ['多 leash zone 越界结束 Encounter', 'Leaving all leash zones ended Encounter'],
      evade: ['存活怪合法回巢并满状态恢复', 'Survivors returned legally at full state'],
      defeated: ['已击败成员未复活', 'Defeated member did not revive']
    };
    var entry = labels[id];
    return entry ? entry[locale() === 'en' ? 1 : 0] : id;
  }

  function renderMmoTimeline() {
    var root = $('mmo-timeline');
    if (!root) return;
    var rows = [];
    if (lastMmoAudit && lastMmoAudit.checks) {
      lastMmoAudit.checks.forEach(function (check) {
        rows.push('<li class="' + (check.pass ? 'pass' : 'fail') + '">' +
          (check.pass ? 'PASS · ' : 'FAIL · ') + mmoCheckLabel(check.id) + '</li>');
      });
    } else if (mmoState && mmoState.timeline.length) {
      mmoState.timeline.slice(-12).forEach(function (entry) {
        rows.push('<li>' + mmoTimelineLabel(entry.type) + '</li>');
      });
    } else {
      rows.push('<li>' + tr('mmoReady') + '</li>');
    }
    root.innerHTML = rows.join('');
  }
  function reset() {
    updateUrl();
    scenarioPreset($('scenario').value);
    if (Game.worldAggro) Game.worldAggro.reset();
    Game.engagement.reset();
    Game.encounters.reset();
    Game.relations.reset();
    Game.population.reset(null);
    Game.parties.reset();
    Game.actors.reset();
    Game.combat.resetClock();
    Game.fx.reset();
    Game.combatPresentation.reset();
    presentationCursor = 0;
    movementTrace = [];
    movementSignatures = {};
    lastTerrainAudit = null;
    lastMmoAudit = null;
    mmoState = null;
    if ($('terrain-audit-status')) $('terrain-audit-status').textContent = tr('terrainReady');
    lastSummonSnapshot = null;
    lastSelfDestructResult = null;
    charmOverride = null;
    var profile = Game.content.get('encounterProfile', $('encounter').value) ||
      Game.content.get('encounterProfile', 'encounter.grassland');
    var terrainScenario = $('scenario').value === 'terrain' ||
      $('scenario').value === 'mmoAggro';
    configureLabTerrain(terrainScenario);
    configureTeamIds(profile);
    var tier = Number($('tier').value) || tierFor(profile);
    $('tier').value = tier;
    Game.state = {
      world: {
          region: profile.regionId,
          worldSeed: Number($('seed').value) >>> 0,
          worldTime: 300,
          mode: 'battle',
        social: {
          spawnVariants: {},
          memories: { spawnId: {}, socialGroupId: {}, factionId: {} }
        }
      },
      player: { level: Number($('level').value) || 20 },
      settings: {
        controlMode: 'manual', combatStrategy: $('strategy').value,
        combatTactics: {}, expeditionStrategy: 'balanced'
      },
      meta: { stats: {} }
    };
    Game.parties.create({ id: 'lab-party', maxMembers: 4 });
    if ($('scenario').value === 'mmoAggro') {
      setupMmoAggroScenario(tier);
      return;
    } else if ($('scenario').value === 'engagement') {
      resetEngagementScenario(tier);
    } else {
      encounter = Game.encounters.start(profile.id, {
        id: 'lab:encounter', seed: Number($('seed').value) >>> 0,
        fullLog: true, silent: true, lab: true,
        terrainCollision: terrainScenario
      });
    }
    if ($('scenario').value === 'engagement') {
      pumpPresentation();
      traceMovement(true);
      refreshRuntimeSelects();
      updateUi(true);
      return;
    }
    var allyCount = Math.max(1, Math.min(4, Number($('allies').value) || 1));
    var classes = Game.content.all('class').map(function (def) { return def.id; });
    for (var ai = 0; ai < allyCount; ai++) {
      var archetypeId = ai === 0 ? $('actor').value : 'adventurer';
      var ally = spawnAlly(ai, archetypeId, ai === 0 ? $('class').value : classes[ai % classes.length], tier);
      if (ally.components.actionState) Game.parties.addMember('lab-party', ally.id);
    }
    var pool = enemyPool(profile);
    var enemyCount = Math.max(1, Math.min(8, Number($('enemies').value) || 1));
    for (var ei = 0; ei < enemyCount; ei++) spawnEnemy(ei, pool[ei % pool.length], tier);
    if ($('scenario').value === 'neutral') addNeutral();
    if ($('scenario').value === 'threeTeam') {
      Game.actors.query({ teamId: enemyTeamId }).filter(function (_, index) {
        return index % 2 === 1;
      }).forEach(function (actor) {
        Game.encounters.leave(encounter.id, actor.id, 'lab-reteam');
        Game.encounters.join(encounter.id, actor.id, 'team-rivals');
      });
      var observer = addNeutral();
      Game.encounters.join(encounter.id, observer.id, 'team-observers');
    }
    applyScenario($('scenario').value);
    pumpPresentation();
    traceMovement(true);
    refreshRuntimeSelects();
    updateUi(true);
  }
  function applyScenario(id) {
    var allies = Game.actors.query({ teamId: allyTeamId });
    var enemies = Game.actors.query({ teamId: enemyTeamId });
    if (id === 'boss' && enemies[0]) enemies[0].hp = enemies[0].maxHp * .49;
    if (id === 'healing' && allies[1]) allies[1].hp *= .32;
    if (id === 'charm' && enemies[0]) {
      charmOverride = Game.relations.setOverride('actor', allies[0].id, enemies[0].id, 'ally',
        { encounterId: encounter.id, symmetric: true });
    }
    if (id === 'summon') {
      var summonRequest = doSummon();
      if (summonRequest && summonRequest.ok && summonRequest.mode === 'action') {
        var controllers = {};
        Game.actors.query().forEach(function (actor) {
          controllers[actor.id] = actor.controllerId;
          if (actor.id !== summonRequest.sourceActorId) actor.controllerId = 'scripted';
        });
        for (var summonTick = 0; summonTick < 80 && encounter.lifecycle === 'active' &&
            !Game.actors.query({ category: 'summon' }).some(function (actor) {
              return !actor.dead && actor.blueprint.archetypeId === $('summon-archetype').value;
            }); summonTick++) stepCombat();
        var summonedActor = Game.actors.query({ category: 'summon' }).filter(function (actor) {
          return !actor.dead && actor.blueprint.archetypeId === $('summon-archetype').value;
        })[0];
        if (summonedActor) {
          lastSummonSnapshot = compactActor(summonedActor);
          paused = true;
        }
        Game.actors.query().forEach(function (actor) {
          if (controllers[actor.id]) actor.controllerId = controllers[actor.id];
        });
      }
    }
    if (id === 'terrain' && allies[0] && enemies[0]) {
      allies[0].x = 260;
      allies[0].y = 160;
      allies[0].controllerId = 'ai:player-auto';
      enemies[0].x = 700;
      enemies[0].y = 160;
      enemies[0].controllerId = 'ai:monster';
      allies[0].components.movement.path = null;
      enemies[0].components.movement.path = null;
    }
    if ((id === 'interrupt' || id === 'overlap') && enemies.length) {
      enemies.slice(0, id === 'overlap' ? 3 : 1).forEach(function (enemy) {
        enemy.x = allies[0].x + 22;
        enemy.y = allies[0].y + (enemy.id.charCodeAt(enemy.id.length - 1) % 3 - 1) * 18;
        var cast = enemy.abilities.map(function (abilityId) { return Game.content.get('ability', abilityId); })
          .filter(function (ability) { return ability && ability.kind === 'action' && ability.timing.castTicks > 0; })[0];
        var target = allies[0];
        if (cast && target) Game.combat.requestAction({ actorId: enemy.id, abilityId: cast.id, targetId: target.id });
      });
    }
  }
  function refreshRuntimeSelects() {
    var actors = Game.actors.query().sort(function (a, b) { return a.id.localeCompare(b.id); });
    ['inspect-actor', 'tool-source', 'tool-target'].forEach(function (id) {
      var previous = $(id).value;
      fillSelect($(id), actors, previous || actors[0] && actors[0].id, function (actor) {
        return actor.id + ' · ' + actor.blueprint.archetypeId;
      });
    });
    refreshAbilities();
  }
  function refreshAbilities() {
    var actor = Game.actors.get($('tool-source').value);
    var defs = (actor && actor.abilities || []).map(function (id) { return Game.content.get('ability', id); })
      .filter(function (def) { return def && def.kind === 'action'; });
    fillSelect($('tool-ability'), defs, $('tool-ability').value, function (def) { return labelFor('ability', def); });
  }
  function relationTarget(source, target) {
    return Game.relations.resolve(source.id, target.id, encounter && encounter.id);
  }
  function applyToolEffect(type, extra) {
    var source = Game.actors.get($('tool-source').value);
    var target = Game.actors.get($('tool-target').value);
    if (!source || !target || !encounter) return;
    var effect = Object.assign({
      type: type,
      target: { relation: relationTarget(source, target), shape: 'single', range: 9999 }
    }, extra || {});
    Game.combat.applyEffect({
      encounterId: encounter.id, sourceActorId: source.id, targetActorId: target.id,
      abilityId: 'lab.system'
    }, effect);
    updateUi(true);
  }

  function abilityWithEffect(actor, type, archetypeId) {
    if (!actor) return null;
    return (actor.abilities || []).map(function (id) { return Game.content.get('ability', id); })
      .filter(function (def) {
        return def && def.kind === 'action' && (def.effects || []).some(function (effect) {
          return effect.type === type && (!archetypeId || effect.archetypeId === archetypeId);
        });
      })[0] || null;
  }

  function hostileTarget(source, abilityDef) {
    var relation = abilityDef && abilityDef.target && abilityDef.target.relation || 'hostile';
    if (relation === 'self') return source;
    return encounter.participants.map(Game.actors.get).filter(function (actor) {
      return actor && !actor.dead && actor.id !== source.id &&
        Game.relations.resolve(source.id, actor.id, encounter.id) === relation;
    })[0] || null;
  }

  function doSummon() {
    if (!encounter) return { ok: false, reason: 'encounter' };
    var archetypeId = $('summon-archetype').value;
    var existing = Game.actors.query({ category: 'summon' }).filter(function (actor) {
      return !actor.dead && actor.blueprint.archetypeId === archetypeId;
    })[0];
    if (existing) return { ok: false, reason: 'maxActive', actorId: existing.id };
    var actors = encounter.participants.map(Game.actors.get).filter(Boolean);
    var source = actors.filter(function (actor) {
      return abilityWithEffect(actor, 'summon', archetypeId);
    })[0];
    if (source) {
      var summonAbility = abilityWithEffect(source, 'summon', archetypeId);
      var target = hostileTarget(source, summonAbility);
      if (target) {
        var range = summonAbility.target.range || 48;
        source.x = target.x + Math.max(8, range - 4) * (source.x <= target.x ? -1 : 1);
        source.y = target.y;
      }
      var request = Game.combat.requestAction({
        actorId: source.id,
        targetId: target && target.id || source.id,
        abilityId: summonAbility.id
      });
      updateUi(true);
      return Object.assign({ mode: 'action', abilityId: summonAbility.id, sourceActorId: source.id }, request);
    }
    source = Game.actors.get($('tool-source').value) || Game.actors.query({ teamId: allyTeamId })[0];
    if (!source) return { ok: false, reason: 'source' };
    var sequence = encounter.nextSpawnSequence++;
    var actor = Game.actors.spawn({
      instanceId: encounter.id + ':lab-summon:' + sequence, archetypeId: archetypeId,
      level: source.level, tier: source.tier, factionId: source.factionId,
      controllerId: source.controllerId,
      transform: { x: source.x + 34, y: source.y + 28 },
      encounterId: encounter.id,
      spawnSource: {
        kind: 'summon', sourceId: 'lab.manual-summon',
        ownerActorId: source.id, sequence: sequence
      }
    });
    Game.encounters.join(encounter.id, actor.id, source.teamId);
    actor.rewardAuthorized = false;
    actor.encounterRewardAuthorized = false;
    actor.exp = 0;
    actor.gold = 0;
    lastSummonSnapshot = compactActor(actor);
    refreshRuntimeSelects();
    updateUi(true);
    return { ok: true, mode: 'manual-fallback', actorId: actor.id, sourceActorId: source.id };
  }

  function triggerSelfDestruct() {
    if (!encounter) return { ok: false, reason: 'encounter' };
    var selectedId = $('summon-archetype').value;
    var summon = Game.actors.query({ category: 'summon' }).filter(function (actor) {
      return !actor.dead && actor.blueprint.archetypeId === selectedId && abilityWithEffect(actor, 'selfDestruct');
    })[0] || Game.actors.query({ category: 'summon' }).filter(function (actor) {
      return !actor.dead && abilityWithEffect(actor, 'selfDestruct');
    })[0];
    if (!summon) return { ok: false, reason: 'selfDestructSummon' };
    var abilityDef = abilityWithEffect(summon, 'selfDestruct');
    var target = hostileTarget(summon, abilityDef);
    if (!target) return { ok: false, reason: 'target' };
    summon.x = target.x + Math.max(8, (abilityDef.target.range || 36) - 4);
    summon.y = target.y;
    var controllers = {};
    Game.actors.query().forEach(function (actor) {
      controllers[actor.id] = actor.controllerId;
      if (actor.id !== summon.id) actor.controllerId = 'scripted';
    });
    var request = Game.combat.requestAction({
      actorId: summon.id, targetId: target.id, abilityId: abilityDef.id
    });
    for (var tick = 0; request.ok && tick < 60 && Game.actors.get(summon.id) &&
        !Game.actors.get(summon.id).dead; tick++) stepCombat();
    Game.actors.query().forEach(function (actor) {
      if (controllers[actor.id]) actor.controllerId = controllers[actor.id];
    });
    lastSelfDestructResult = {
      actorId: summon.id,
      abilityId: abilityDef.id,
      request: request,
      removed: !Game.actors.get(summon.id),
      defeated: !!(Game.actors.get(summon.id) && Game.actors.get(summon.id).dead),
      tick: encounter.tick
    };
    paused = true;
    updateUi(true);
    return lastSelfDestructResult;
  }
  function bubbleAnchors() {
    return {
      hero: Game.actors.query({ teamId: allyTeamId }).filter(function (actor) {
        return actor.components.vitals;
      })[0] || null,
      enemy: Game.actors.query({ teamId: enemyTeamId }).filter(function (actor) {
        return actor.components.vitals;
      })[0] || null
    };
  }
  function layoutBubble(bubble, anchor, type) {
    var placement = bubble.placement === 'directional'
      ? (bubbleWalkScene === 'vertical' ? 'above' : 'side') : bubble.placement;
    var side = bubble.side;
    if (side === 'auto') {
      if (bubbleWalkScene === 'l') side = 'right';
      else if (bubbleWalkScene === 'r') side = 'left';
      else side = anchor.x > canvas.width * .68 ? 'left' : 'right';
    }
    var body = { w: 92, h: 34 };
    body.x = placement === 'above' ? anchor.x - body.w / 2
      : anchor.x + (side === 'left' ? -body.w - 34 : 34);
    body.y = placement === 'above' ? anchor.y - 92 : anchor.y - 80;
    var intendedX = body.x;
    body.x = Game.util.clamp(body.x, 4, canvas.width - body.w - 4);
    body.y = Game.util.clamp(body.y, 4, canvas.height - body.h - 4);
    var tail = {
      x: side === 'left' ? body.x + body.w - 9 : body.x + 5,
      y: body.y + body.h - 2, w: 9, h: 10
    };
    var healthBar = { x: anchor.x - 30, y: anchor.y - 35, w: 60, h: 5 };
    var overlapsHealthBar = !(body.x + body.w < healthBar.x ||
      body.x > healthBar.x + healthBar.w ||
      body.y + body.h < healthBar.y ||
      body.y > healthBar.y + healthBar.h);
    return {
      id: bubble.id, type: bubble.type, entityKind: anchor.kind,
      mode: placement === 'above' ? 'above' : 'side',
      placement: bubble.placement, side: placement === 'above' ? null : side,
      flipped: intendedX !== body.x, body: body, tail: tail,
      healthBar: healthBar, overlapsHealthBar: overlapsHealthBar,
      withinViewport: body.x >= 0 && body.y >= 0 &&
        body.x + body.w <= canvas.width && body.y + body.h + tail.h <= canvas.height,
      accent: type.accent, paper: type.paper, ink: type.ink
    };
  }
  function drawActionBubbles() {
    bubbleLayouts = [];
    if (!Game.actionBubbles) return;
    Game.actionBubbles.visit(function (bubble, anchor, type) {
      var layout = layoutBubble(bubble, anchor, type);
      bubbleLayouts.push(layout);
      ctx.save();
      ctx.fillStyle = layout.paper; ctx.strokeStyle = layout.accent; ctx.lineWidth = 2;
      ctx.fillRect(layout.body.x, layout.body.y, layout.body.w, layout.body.h);
      ctx.strokeRect(layout.body.x, layout.body.y, layout.body.w, layout.body.h);
      ctx.beginPath();
      ctx.moveTo(layout.tail.x, layout.tail.y);
      ctx.lineTo(layout.tail.x + layout.tail.w, layout.tail.y);
      ctx.lineTo(anchor.x, anchor.y - 20);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = layout.ink; ctx.textAlign = 'center'; ctx.font = '700 11px ui-monospace';
      ctx.fillText(bubble.type.toUpperCase(), layout.body.x + layout.body.w / 2, layout.body.y + 21);
      ctx.restore();
    });
  }
  function activateBubbleScene(scene, walk) {
    var anchors = bubbleAnchors();
    if (!anchors.hero) return [];
    paused = true;
    bubbleScene = walk ? null : scene;
    bubbleWalkScene = walk ? scene : null;
    Game.actionBubbles.clear();
    if (walk) {
      anchors.hero.x = scene === 'l' ? 170 : (scene === 'r' ? 790 : 480);
      anchors.hero.y = 260;
      anchors.hero.dir = scene === 'l' ? 'l' : 'r';
      Game.actionBubbles.show(anchors.hero, 'resource', {
        duration: 999, placement: 'directional', dedupeKey: 'qa-walk-' + scene
      });
    } else if (anchors.enemy) {
      var positions = {
        center: [330, 630], left: [36, 160], right: [800, 924]
      }[scene] || [330, 630];
      anchors.hero.x = positions[0]; anchors.hero.y = 260;
      anchors.enemy.x = positions[1]; anchors.enemy.y = 220;
      Game.actionBubbles.show(anchors.hero, 'enemy', {
        duration: 999, placement: 'side', dedupeKey: 'qa-hero-' + scene
      });
      Game.actionBubbles.show(anchors.enemy, 'alert', {
        duration: 999, placement: 'side', dedupeKey: 'qa-enemy-' + scene
      });
    }
    document.querySelectorAll('[data-bubble-scene],[data-bubble-walk]').forEach(function (button) {
      button.classList.toggle('active',
        (!walk && button.getAttribute('data-bubble-scene') === scene) ||
        (walk && button.getAttribute('data-bubble-walk') === scene));
    });
    $('bubble-status').textContent = (walk ? 'walk ' : 'encounter ') + scene;
    draw();
    return bubbleLayouts.slice();
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#171f3c'); gradient.addColorStop(1, '#090c18');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(100,120,170,.12)';
    for (var gx = 0; gx <= canvas.width; gx += 32) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
    }
    for (var gy = 0; gy <= canvas.height; gy += 32) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
    }
    if (labTerrainLayout && ((encounter && encounter.context.terrainCollision) ||
        $('scenario').value === 'mmoAggro')) {
      var nav = labTerrainLayout.nav;
      for (var ty = 0; ty < nav.h; ty++) {
        for (var tx = 0; tx < nav.w; tx++) {
          if (nav.grid[ty][tx]) continue;
          ctx.fillStyle = (tx === 29 || tx === 30) && ty <= 22
            ? '#3b4058' : '#202538';
          ctx.fillRect(tx * nav.cell, ty * nav.cell, nav.cell, nav.cell);
          ctx.strokeStyle = 'rgba(151,164,202,.18)';
          ctx.strokeRect(tx * nav.cell + .5, ty * nav.cell + .5, nav.cell - 1, nav.cell - 1);
        }
      }
      Game.actors.query().forEach(function (actor) {
        var path = actor.components.movement && actor.components.movement.path;
        if (!path || path.failed || !path.points.length) return;
        ctx.save();
        ctx.strokeStyle = actor.teamId === allyTeamId
          ? 'rgba(104,174,231,.55)' : 'rgba(239,117,105,.55)';
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(actor.x, actor.y);
        for (var pi = path.index; pi < path.points.length; pi++) {
          ctx.lineTo(path.points[pi].x, path.points[pi].y);
        }
        ctx.stroke();
        ctx.restore();
      });
    }
    drawMmoOverlay();
    if (encounter) encounter.telegraphs.forEach(function (telegraph) {
      ctx.fillStyle = 'rgba(239,117,105,.18)'; ctx.strokeStyle = '#ef7569'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(telegraph.x, telegraph.y, telegraph.radius || 28, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
    var stageActors = Game.actors.query().sort(function (a, b) {
      return a.y - b.y || a.id.localeCompare(b.id);
    });
    var badges = {};
    [
      [allyTeamId, 'A'],
      [enemyTeamId, 'E']
    ].forEach(function (entry) {
      Game.actors.query({ teamId: entry[0] })
        .sort(function (a, b) { return a.id.localeCompare(b.id); })
        .forEach(function (actor, index) {
          badges[actor.id] = entry[1] + (index + 1);
        });
    });
    stageActors.filter(function (actor) { return !badges[actor.id]; })
      .forEach(function (actor, index) { badges[actor.id] = 'N' + (index + 1); });
    stageActors.forEach(function (actor) {
      var combat = actor.components.vitals;
      var relation = encounter && actor.teamId === allyTeamId ? 'ally'
        : encounter && actor.teamId === enemyTeamId ? 'enemy' : 'neutral';
      ctx.save();
      ctx.strokeStyle = relation === 'ally' ? '#68aee7' : relation === 'enemy' ? '#ef7569' : '#e7c45b';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(actor.x, actor.y + 4, 24, 10, 0, 0, Math.PI * 2); ctx.stroke();
      var drawX = actor.x;
      var drawY = actor.y;
      var attackTarget = actor.presentationTargetId && Game.actors.get(actor.presentationTargetId);
      if (actor.lungeT > 0 && !actor.presentationNoLunge && attackTarget) {
        var lungeDistance = Math.max(1,
          Game.util.dist(actor.x, actor.y, attackTarget.x, attackTarget.y));
        var lunge = Math.sin((1 - actor.lungeT / .18) * Math.PI) * 4;
        drawX += (attackTarget.x - actor.x) / lungeDistance * lunge;
        drawY += (attackTarget.y - actor.y) / lungeDistance * lunge;
      }
      var frame = actor.kind === 'hero' && actor.lungeT > .05
        ? 'attack_' + actor.dir : 'idle0';
      Game.assets.draw(ctx, actor.sprite, frame, drawX, drawY, {
        scale: 2, alpha: actor.dead ? .35 : 1, flip: actor.dir === 'l',
        white: actor.flash > 0 ? Math.min(1, actor.flash / .14) : 0
      });
      var badge = badges[actor.id];
      var badgeWidth = 8 + badge.length * 7;
      ctx.fillStyle = '#0a0e1d';
      ctx.fillRect(actor.x - badgeWidth / 2, actor.y - 50, badgeWidth, 13);
      ctx.strokeStyle = relation === 'ally' ? '#68aee7' :
        relation === 'enemy' ? '#ef7569' : '#e7c45b';
      ctx.strokeRect(actor.x - badgeWidth / 2, actor.y - 50, badgeWidth, 13);
      ctx.fillStyle = '#edf0ff'; ctx.textAlign = 'center'; ctx.font = '10px ui-monospace';
      ctx.fillText(badge, actor.x, actor.y - 40);
      if (combat) {
        var hpPct = Math.max(0, combat.hp / Math.max(1, combat.maxHp));
        ctx.fillStyle = '#242c48'; ctx.fillRect(actor.x - 30, actor.y - 35, 60, 5);
        ctx.fillStyle = relation === 'enemy' ? '#ef7569' : '#6ed28a';
        ctx.fillRect(actor.x - 30, actor.y - 35, 60 * hpPct, 5);
        var state = actor.components.actionState;
        if (state && state.abilityId) {
          ctx.fillStyle = '#e7c45b'; ctx.font = '9px ui-monospace';
          var shortState = {
            casting: 'CAST', channeling: 'CHAN', resolving: 'ACT',
            recovering: 'LOCK', queued: 'QUEUE'
          }[state.state] || state.state.toUpperCase();
          ctx.fillText(shortState, actor.x, actor.y + 26);
        }
      }
      ctx.restore();
    });
    Game.fx.drawShapes(ctx);
    Game.fx.drawFloats(ctx, 1);
    drawActionBubbles();
  }

  function drawMmoOverlay() {
    if ($('scenario').value !== 'mmoAggro' || !mmoState) return;
    var hero = mmoState.hero;
    mmoState.packs.forEach(function (pack, index) {
      var representative = pack.actors.filter(function (actor) { return !actor.dead; })[0] ||
        pack.primary;
      var p = representative && Game.worldAggro.policy(representative) || {};
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(237,240,255,.32)';
      ctx.beginPath(); ctx.arc(pack.x, pack.y, pack.leashRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(239,117,105,.65)';
      ctx.beginPath(); ctx.arc(pack.x, pack.y, Number(p.aggroRadius) || 64, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(231,196,91,.42)';
      ctx.beginPath(); ctx.arc(pack.x, pack.y, Number(p.assistRadius) || 96, 0, Math.PI * 2); ctx.stroke();
      if (representative && hero) {
        var visible = Game.terrain.hasLineOfSight(representative, hero, 4);
        ctx.setLineDash([]);
        ctx.strokeStyle = visible ? 'rgba(110,210,138,.8)' : 'rgba(239,117,105,.88)';
        ctx.beginPath(); ctx.moveTo(hero.x, hero.y); ctx.lineTo(representative.x, representative.y); ctx.stroke();
      }
      ctx.fillStyle = '#edf0ff';
      ctx.font = '10px ui-monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PACK ' + String.fromCharCode(65 + index), pack.x, pack.y - 12);
      ctx.restore();
    });
  }

  function bodyRadius(actor) {
    return Math.max(0, Number(actor && actor.components.body &&
      actor.components.body.collisionRadius) || 0);
  }

  function hostileContact(actor) {
    if (!encounter || !actor || !actor.components.vitals || actor.dead) return null;
    var targetId = actor.components.movement.intent &&
      actor.components.movement.intent.targetId ||
      actor.components.actionState && actor.components.actionState.targetIds[0] ||
      actor.presentationTargetId;
    var target = targetId && Game.actors.get(targetId);
    if (!target || !target.components.vitals || target.dead ||
        Game.relations.resolve(actor.id, target.id, encounter.id) !== 'hostile') {
      target = encounter.participants.map(Game.actors.get).filter(function (other) {
        return other && other.id !== actor.id && other.components.vitals && !other.dead &&
          Game.relations.resolve(actor.id, other.id, encounter.id) === 'hostile';
      }).sort(function (a, b) {
        return Game.util.dist(actor.x, actor.y, a.x, a.y) -
          Game.util.dist(actor.x, actor.y, b.x, b.y) ||
          a.id.localeCompare(b.id);
      })[0];
    }
    if (!target) return null;
    var distance = Game.util.dist(actor.x, actor.y, target.x, target.y);
    var minimum = bodyRadius(actor) + bodyRadius(target) + 2;
    return {
      targetActorId: target.id,
      distance: Math.round(distance * 100) / 100,
      minimum: minimum,
      gap: Math.round((distance - minimum) * 100) / 100,
      overlapping: distance + .01 < minimum
    };
  }

  function movementSnapshot() {
    return Game.actors.query().filter(function (actor) {
      return actor.components.vitals && !actor.dead;
    }).sort(function (a, b) {
      return a.id.localeCompare(b.id);
    }).map(function (actor) {
      var intent = actor.components.movement.intent;
      var path = actor.components.movement.path;
      var terrainEnabled = !!(encounter && encounter.context.terrainCollision && labTerrainLayout);
      var action = actor.components.actionState;
      return {
        actorId: actor.id,
        x: Math.round(actor.x * 100) / 100,
        y: Math.round(actor.y * 100) / 100,
        moving: !!actor.components.movement.moving,
        intent: intent && {
          reason: intent.reason, targetActorId: intent.targetId,
          stopRange: intent.stopRange
        },
        path: path && {
          targetActorId: path.targetId,
          plannedTick: path.plannedTick,
          expiresTick: path.expiresTick,
          waypoint: path.index + 1,
          waypointCount: path.points.length,
          failed: path.failed
        },
        terrain: {
          enabled: terrainEnabled,
          legal: !terrainEnabled || Game.terrain.isWalkable(
            actor.x, actor.y, bodyRadius(actor)
          )
        },
        action: action && {
          state: action.state, abilityId: action.abilityId,
          targetActorId: action.targetIds[0] || null
        },
        contact: hostileContact(actor)
      };
    });
  }

  function physicalOverlaps() {
    var actors = Game.actors.query().filter(function (actor) {
      return actor.components.vitals && !actor.dead;
    }).sort(function (a, b) {
      return a.id.localeCompare(b.id);
    });
    var overlaps = [];
    for (var left = 0; left < actors.length; left++) {
      for (var right = left + 1; right < actors.length; right++) {
        var a = actors[left];
        var b = actors[right];
        var distance = Game.util.dist(a.x, a.y, b.x, b.y);
        var minimum = bodyRadius(a) + bodyRadius(b) + 2;
        if (distance + .01 < minimum) {
          overlaps.push({
            actorIds: [a.id, b.id],
            distance: Math.round(distance * 100) / 100,
            minimum: minimum,
            penetration: Math.round((minimum - distance) * 100) / 100
          });
        }
      }
    }
    return overlaps;
  }

  function traceMovement(force) {
    movementSnapshot().forEach(function (item) {
      var signature = JSON.stringify([
        item.moving,
        item.intent && item.intent.reason,
        item.intent && item.intent.targetActorId,
        item.action && item.action.state,
        item.action && item.action.abilityId,
        item.contact && item.contact.overlapping,
        item.path && item.path.waypoint,
        item.terrain && item.terrain.legal
      ]);
      var periodicPrimary = encounter && encounter.tick % 10 === 0 &&
        item.actorId === 'lab:ally:0';
      if (!force && !periodicPrimary &&
          movementSignatures[item.actorId] === signature &&
          !(item.contact && item.contact.overlapping)) return;
      movementSignatures[item.actorId] = signature;
      movementTrace.push(Object.assign({
        tick: encounter ? encounter.tick : 0
      }, item));
      if (movementTrace.length > 160) {
        movementTrace.splice(0, movementTrace.length - 160);
      }
    });
  }

  function pumpPresentation() {
    if (!encounter) return;
    while (presentationCursor < encounter.eventLog.length) {
      Game.combatPresentation.consume(encounter.eventLog[presentationCursor++]);
    }
  }

  function stepCombat() {
    if (!encounter || encounter.lifecycle !== 'active') return false;
    Game.combat.tickFixed(encounter.id);
    pumpPresentation();
    traceMovement(false);
    return true;
  }

  function updatePresentation(dt) {
    Game.actors.query().forEach(function (actor) {
      actor.flash = Math.max(0, (Number(actor.flash) || 0) - dt);
      actor.lungeT = Math.max(0, (Number(actor.lungeT) || 0) - dt);
      if (actor.lungeT <= 0) actor.presentationNoLunge = false;
    });
    Game.fx.update(dt);
  }

  function presentationDiagnostics() {
    return {
      adapter: Game.combatPresentation.snapshot(),
      fx: Game.fx.inspect(),
      movement: {
        current: movementSnapshot(),
        overlaps: physicalOverlaps(),
        trace: movementTrace.slice(),
        terrainMetrics: encounter && encounter.metrics.movement || null,
        terrainAudit: lastTerrainAudit
      },
      panel: $('presentation-events').textContent
    };
  }

  function runToImpact(maxTicks) {
    paused = true;
    $('pause').textContent = tr('resume');
    var start = Game.combatPresentation.snapshot().recordCount;
    var limit = Math.max(1, Number(maxTicks) || 500);
    for (var index = 0; index < limit &&
        encounter && encounter.lifecycle === 'active'; index++) {
      stepCombat();
      updatePresentation(.05);
      var records = Game.combatPresentation.snapshot().records.slice(start);
      if (records.some(function (record) {
        return record.visual === 'melee-impact' ||
          record.visual === 'projectile-impact' ||
          record.visual === 'miss' ||
          record.visual === 'heal' ||
          record.visual === 'shield';
      })) break;
    }
    draw();
    updateUi(true);
    return presentationDiagnostics();
  }

  function runTerrainAudit() {
    if ($('scenario').value !== 'terrain' || !encounter || encounter.lifecycle !== 'active') {
      $('scenario').value = 'terrain';
      reset();
    }
    paused = true;
    $('pause').textContent = tr('resume');
    var ally = Game.actors.query({ teamId: allyTeamId })[0];
    var enemy = Game.actors.query({ teamId: enemyTeamId })[0];
    if (!ally || !enemy || !encounter || !labTerrainLayout) {
      lastTerrainAudit = { passed: false, reason: 'setup' };
      $('terrain-audit-status').textContent = tr('terrainFailed');
      return lastTerrainAudit;
    }
    function legal(actor) {
      return Game.terrain.isWalkable(actor.x, actor.y, bodyRadius(actor));
    }
    function clearRuntimeMovement(actor) {
      actor.components.movement.intent = null;
      actor.components.movement.path = null;
      actor.components.movement.moving = false;
    }

    // First reproduce the old failure: a retreat and a knockback point directly
    // into the wall. Both must be shortened by the production swept collision.
    ally.x = 456; ally.y = 200;
    enemy.x = 420; enemy.y = 200;
    var retreatStart = ally.x;
    Game.combat.applyEffect({
      encounterId: encounter.id, sourceActorId: ally.id,
      targetActorId: ally.id, abilityId: 'lab.terrain-retreat'
    }, {
      type: 'movement', distance: 40,
      target: { relation: 'self', shape: 'single', range: 9999 }
    });
    var retreat = {
      requested: 40,
      moved: +(ally.x - retreatStart).toFixed(2),
      legal: legal(ally),
      clamped: ally.x < 464
    };

    ally.x = 420; ally.y = 200;
    enemy.x = 456; enemy.y = 200;
    var knockbackStart = enemy.x;
    Game.combat.applyEffect({
      encounterId: encounter.id, sourceActorId: ally.id,
      targetActorId: enemy.id, abilityId: 'lab.terrain-knockback'
    }, {
      type: 'knockback', distance: 40,
      target: { relation: 'hostile', shape: 'single', range: 9999 }
    });
    var knockback = {
      requested: 40,
      moved: +(enemy.x - knockbackStart).toFixed(2),
      legal: legal(enemy),
      clamped: enemy.x < 464
    };

    ally.x = 472; ally.y = 200;
    clearRuntimeMovement(ally);
    var embeddedBefore = !legal(ally);
    stepCombat();
    var embeddedRecovery = {
      reproduced: embeddedBefore,
      legal: legal(ally),
      x: +ally.x.toFixed(2),
      y: +ally.y.toFixed(2)
    };

    ally.x = 260; ally.y = 160;
    enemy.x = 700; enemy.y = 160;
    ally.controllerId = 'ai:player-auto';
    enemy.controllerId = 'ai:monster';
    clearRuntimeMovement(ally);
    clearRuntimeMovement(enemy);
    movementTrace = [];
    movementSignatures = {};
    traceMovement(true);

    var usedOpening = false;
    var illegalSamples = 0;
    var actionStarted = false;
    var ticks = 0;
    for (; ticks < 1400 && encounter.lifecycle === 'active'; ticks++) {
      stepCombat();
      [ally, enemy].forEach(function (actor) {
        if (!legal(actor)) illegalSamples++;
        if (actor.y >= 23 * 16 && actor.x >= 27 * 16 && actor.x <= 32 * 16) {
          usedOpening = true;
        }
      });
      actionStarted = actionStarted || Object.keys(encounter.metrics.actions).some(function (actorId) {
        return encounter.metrics.actions[actorId] > 0;
      });
      if (usedOpening && actionStarted) break;
    }
    var metrics = encounter.metrics.movement || {};
    lastTerrainAudit = {
      passed: retreat.clamped && retreat.legal && knockback.clamped && knockback.legal &&
        embeddedRecovery.reproduced && embeddedRecovery.legal &&
        illegalSamples === 0 && usedOpening && actionStarted &&
        metrics.pathReplans > 0 && metrics.pathFailures === 0,
      ticks: ticks + 1,
      retreat: retreat,
      knockback: knockback,
      embeddedRecovery: embeddedRecovery,
      route: {
        usedOpening: usedOpening,
        actionStarted: actionStarted,
        illegalSamples: illegalSamples
      },
      metrics: Object.assign({}, metrics),
      overlaps: physicalOverlaps()
    };
    $('terrain-audit-status').textContent = lastTerrainAudit.passed
      ? tr('terrainPassed') : tr('terrainFailed');
    updatePresentation(.05);
    draw();
    updateUi(true);
    return lastTerrainAudit;
  }

  function runMmoAggroAudit() {
    if ($('scenario').value !== 'mmoAggro' || !mmoState) {
      $('scenario').value = 'mmoAggro';
      reset();
    }
    paused = true;
    $('pause').textContent = tr('resume');
    var hero = mmoState.hero;
    var initialPack = mmoState.packs[0];
    var assistPack = mmoState.packs[1];
    var blockedPack = mmoState.packs[2];
    var checks = [];
    function check(id, pass, details) {
      checks.push({ id: id, pass: !!pass, details: details || null });
      return !!pass;
    }

    Game.state.settings.controlMode = 'manual';
    var manualCandidate = Game.worldAggro.findDetection(hero);
    Game.state.settings.controlMode = 'auto';
    var autoCandidate = Game.worldAggro.findDetection(hero);
    Game.state.settings.controlMode = 'manual';
    check('modes', !!manualCandidate && !!autoCandidate &&
      manualCandidate.actor.id === autoCandidate.actor.id, {
        manual: manualCandidate && manualCandidate.actor.id,
        auto: autoCandidate && autoCandidate.actor.id
      });
    check('los', !Game.terrain.hasLineOfSight(blockedPack.primary, hero, 4), {
      actorId: blockedPack.primary.id
    });

    Game.worldAggro.scan();
    encounter = hero.encounterId && Game.encounters.get(hero.encounterId);
    var initialIds = initialPack.actors.map(function (actor) { return actor.id; }).sort();
    check('interrupt', mmoState.gatheringInterrupted && !hero.interactOrder && !hero.moveOrder);
    check('initialPack', !!encounter && initialIds.every(function (actorId) {
      return encounter.participants.indexOf(actorId) >= 0 &&
        encounter.threatTables[actorId] && encounter.threatTables[actorId][hero.id] >= 1;
    }), { actorIds: initialIds });

    Game.worldAggro.scan();
    Game.worldAggro.scan();
    var assistIds = assistPack.actors.map(function (actor) { return actor.id; }).sort();
    check('assist', !!encounter && encounter.context.assistPackIds.length === 1 &&
      assistIds.every(function (actorId) { return encounter.participants.indexOf(actorId) >= 0; }) &&
      blockedPack.actors.every(function (actor) { return !actor.encounterId; }), {
        assistPackIds: encounter && encounter.context.assistPackIds.slice(),
        leashZones: encounter && encounter.context.leashZones.length
      });

    var summoner = encounter && encounter.participants.map(Game.actors.get).filter(function (actor) {
      return actor && actor.blueprint.archetypeId === 'shaman_mosscap';
    })[0];
    var summonAbility = Game.content.get('ability', 'shaman_mosscap.plant_spore_pod');
    var summonEffect = summonAbility && summonAbility.effects.filter(function (effect) {
      return effect.type === 'summon';
    })[0];
    if (summoner && summonEffect) {
      Game.combat.applyEffect({
        encounterId: encounter.id,
        sourceActorId: summoner.id,
        targetActorId: hero.id,
        abilityId: summonAbility.id
      }, summonEffect);
      Game.combat.applyEffect({
        encounterId: encounter.id,
        sourceActorId: summoner.id,
        targetActorId: hero.id,
        abilityId: summonAbility.id
      }, summonEffect);
    }
    var summons = Game.actors.query({ category: 'summon' }).filter(function (actor) {
      return !actor.dead;
    });
    var summon = summons[0];
    check('summon', summons.length === 1 && summon && summoner &&
      summon.teamId === summoner.teamId && summon.factionId === summoner.factionId &&
      summon.controllerId === summoner.controllerId && summon.rewardAuthorized === false &&
      Number(summon.exp) === 0 && Number(summon.gold) === 0 &&
      encounter.context.assistPackIds.length === 1, summon && compactActor(summon));

    var defeated = initialPack.actors.filter(function (actor) {
      return actor !== summoner;
    })[0];
    if (defeated) {
      defeated.hp = 0;
      defeated.dead = true;
      defeated.lifecycle = 'defeated';
      defeated.components.actionState.state = 'defeated';
    }
    var survivors = encounter.participants.map(Game.actors.get).filter(function (actor) {
      return actor && actor.teamId === enemyTeamId && actor !== defeated &&
        actor.category !== 'summon' && !actor.dead;
    });
    survivors.forEach(function (actor) {
      actor.hp = actor.maxHp * .35;
      actor.x = Math.min(448, actor.x + 36);
    });
    hero.x = 900;
    hero.y = 400;
    Game.combat.tickFixed(encounter.id);
    var leashEnded = encounter.lifecycle === 'ended' && encounter.result &&
      encounter.result.reason === 'leash';
    check('leash', leashEnded && encounter.context.leashZones.length === 2 &&
      Game.actors.query({ category: 'summon' }).length === 0, {
        result: encounter.result,
        leashZones: encounter.context.leashZones
      });

    for (var tick = 0; tick < 180 && survivors.some(function (actor) {
      return Game.worldAggro.isEvading(actor);
    }); tick++) {
      if (Game.nav) Game.nav.update(32);
      survivors.forEach(function (actor) { Game.worldAggro.updateEvader(actor, .1); });
    }
    var returned = survivors.every(function (actor) {
      return !Game.worldAggro.isEvading(actor) && actor.hp === actor.maxHp &&
        Game.util.dist(actor.x, actor.y, actor.spawnX, actor.spawnY) <= 6 &&
        Game.terrain.isWalkable(actor.x, actor.y,
          actor.components.body && actor.components.body.collisionRadius || 6);
    });
    check('evade', returned, Game.worldAggro.snapshot());
    check('defeated', !defeated || (defeated.dead && defeated.hp === 0 &&
      !Game.worldAggro.isEvading(defeated)));

    lastMmoAudit = {
      passed: checks.every(function (entry) { return entry.pass; }),
      checks: checks,
      events: mmoState.timeline.slice(),
      snapshot: Game.worldAggro.snapshot(),
      encounter: encounter && {
        id: encounter.id,
        lifecycle: encounter.lifecycle,
        result: encounter.result,
        initialPackId: encounter.context.initialPackId,
        assistPackIds: encounter.context.assistPackIds.slice(),
        leashZones: encounter.context.leashZones.slice()
      }
    };
    $('mmo-audit-status').textContent = lastMmoAudit.passed
      ? tr('mmoPassed') : tr('mmoFailed');
    renderMmoTimeline();
    updatePresentation(.05);
    draw();
    updateUi(true);
    return lastMmoAudit;
  }

  function compactActor(actor) {
    if (!actor) return null;
    return {
      id: actor.id, archetype: actor.blueprint.archetypeId, classId: actor.blueprint.classId,
      category: actor.category, rank: actor.rank, partyId: actor.partyId,
      teamId: actor.teamId, factionId: actor.factionId, controllerId: actor.controllerId,
      hp: actor.components.vitals && [Math.round(actor.hp), Math.round(actor.maxHp)],
      action: actor.components.actionState && {
        state: actor.components.actionState.state,
        abilityId: actor.components.actionState.abilityId,
        queued: actor.components.actionState.queued
      },
      resources: actor.components.resources,
      combo: actor.components.comboState,
      statuses: actor.components.statuses,
      spawnSource: actor.spawnSource || null,
      rewards: {
        authorized: actor.rewardAuthorized !== false,
        encounterAuthorized: actor.encounterRewardAuthorized !== false,
        exp: Number(actor.exp) || 0,
        gold: Number(actor.gold) || 0
      }
    };
  }
  function updateInspector() {
    var actor = Game.actors.get($('inspect-actor').value);
    var value;
    if (inspectTab === 'runtime') value = actor && Game.actors.snapshot(actor.id);
    else if (inspectTab === 'blueprint') value = actor && actor.blueprint;
    else if (inspectTab === 'card') value = actor && Game.content.inspect('actorArchetype', actor.blueprint.archetypeId);
    else value = Game.content.audit();
    $('inspect-output').textContent = JSON.stringify(value, null, 2);
  }
  function updateCatalog() {
    var type = $('catalog-type').value || Game.contentSchemas.definitionTypes[0];
    var defs = Game.content.all(type);
    $('catalog-output').textContent = JSON.stringify(defs, null, 2);
  }
  function actorDisplayName(actor) {
    if (!actor || !actor.blueprint) return '';
    var archetype = Game.content.get('actorArchetype', actor.blueprint.archetypeId);
    var key = archetype && archetype.identity && archetype.identity.nameKey;
    var text = key && Game.i18n.t(key);
    return text && text !== key ? text : actor.blueprint.archetypeId;
  }
  function portraitActors() {
    function teamActors(teamId) {
      var ids = encounter && encounter.teams[teamId] && encounter.teams[teamId].members || [];
      var actors = ids.map(Game.actors.get).filter(Boolean);
      return actors.length ? actors : Game.actors.query({ teamId: teamId });
    }
    var allies = teamActors(allyTeamId).filter(function (actor) {
      return actor.components.vitals;
    }).sort(function (a, b) {
      return Number(a.dead) - Number(b.dead) || a.id.localeCompare(b.id);
    });
    var ally = allies.filter(function (actor) { return actor.id === 'lab:ally:0'; })[0] || allies[0];
    var targetId = ally && ally.components.targeting &&
      (ally.components.targeting.priorityTargetId || ally.components.targeting.currentTargetId);
    var enemies = teamActors(enemyTeamId).filter(function (actor) {
      return actor.components.vitals;
    }).sort(function (a, b) {
      if (a.dead !== b.dead) return Number(a.dead) - Number(b.dead);
      if (a.id === targetId) return -1;
      if (b.id === targetId) return 1;
      return a.id.localeCompare(b.id);
    });
    return { ally: ally || null, enemy: enemies[0] || null };
  }
  function opaquePixels(canvas) {
    var data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    var count = 0;
    for (var at = 3; at < data.length; at += 4) if (data[at]) count++;
    return count;
  }
  function portraitCanvasSnapshot(canvas) {
    var rect = canvas.getBoundingClientRect();
    var card = canvas.closest('.portrait-qa-card').getBoundingClientRect();
    return {
      actorId: canvas.getAttribute('data-actor-id') || null,
      source: canvas.getAttribute('data-portrait-source') || null,
      mode: canvas.getAttribute('data-portrait-mode') || null,
      label: canvas.getAttribute('aria-label') || null,
      width: rect.width,
      height: rect.height,
      opaquePixels: opaquePixels(canvas),
      withinCard: rect.left >= card.left && rect.right <= card.right &&
        rect.top >= card.top && rect.bottom <= card.bottom
    };
  }
  function updatePortraitQa() {
    var pair = portraitActors();
    [
      ['ally', pair.ally, 'allyPortrait'],
      ['enemy', pair.enemy, 'enemyPortrait']
    ].forEach(function (entry) {
      var side = entry[0];
      var actor = entry[1];
      var name = actorDisplayName(actor);
      var canvas = $('portrait-qa-' + side);
      var source = Game.ui.combatPortraits.draw(
        canvas,
        actor,
        name ? tr(entry[2]) + ' · ' + name : tr(entry[2])
      );
      $('portrait-qa-' + side + '-name').textContent = name || '—';
      $('portrait-qa-' + side + '-source').textContent = source
        ? source.sourceKind + ' · ' + (source.assetId || 'pixel-fallback')
        : '—';
    });
    $('portrait-status').textContent = pair.ally && pair.enemy
      ? tr('portraitReady') : tr('portraitPartial');
    return {
      ally: portraitCanvasSnapshot($('portrait-qa-ally')),
      enemy: portraitCanvasSnapshot($('portrait-qa-enemy')),
      status: $('portrait-status').textContent
    };
  }
  function updateUi(force) {
    if (!encounter) return;
    $('clock').textContent = 'tick ' + encounter.tick + ' · ' +
      (encounter.tick * encounter.rules.tickMs / 1000).toFixed(2) + 's · ' + encounter.lifecycle;
    var actors = encounter.participants.map(Game.actors.get).filter(Boolean);
    $('summary').innerHTML = [
      'actors ' + actors.length,
      'scheduler ' + encounter.scheduler.length,
      'telegraphs ' + encounter.telegraphs.length,
      'events ' + encounter.eventLog.length,
      'visuals ' + Game.combatPresentation.snapshot().recordCount,
      'nav ' + (encounter.metrics.movement
        ? encounter.metrics.movement.pathReplans + '/' + encounter.metrics.movement.pathFailures
        : '—'),
      'result ' + (encounter.result && encounter.result.winnerTeamId || '—')
    ].map(function (value) { return '<span>' + value + '</span>'; }).join('');
    $('participants').textContent = JSON.stringify(Game.actors.query().map(compactActor), null, 2);
    $('scheduler').textContent = JSON.stringify({
      scheduler: encounter.scheduler.slice(0, 30), telegraphs: encounter.telegraphs,
      phaseTriggered: encounter.phaseTriggered
    }, null, 2);
    $('threat').textContent = JSON.stringify(encounter.threatTables, null, 2);
    $('events').textContent = JSON.stringify(encounter.eventLog.slice(-35), null, 2);
    $('presentation-events').textContent = JSON.stringify(
      Game.combatPresentation.snapshot().records.slice(-35), null, 2);
    $('movement-trace').textContent = JSON.stringify({
      terrainEnabled: !!encounter.context.terrainCollision,
      metrics: encounter.metrics.movement || null,
      terrainAudit: lastTerrainAudit,
      trace: movementTrace.slice(-35)
    }, null, 2);
    $('ecosystem').textContent = JSON.stringify({
      population: Game.content.populationView('population.' + (encounter.profile.regionId || 'grassland')),
      leases: Game.population.leases(),
      externalCommand: Game.engagement.snapshot(),
      objectiveEvaluation: {
        objectives: encounter.profile.objectives,
        participantStates: encounter.participantStates,
        result: encounter.result
      },
      variantCleanup: encounter.scheduler.filter(function (item) {
        return item.kind === 'variantTransition';
      }),
      combatNavigation: {
        terrainEnabled: !!encounter.context.terrainCollision,
        metrics: encounter.metrics.movement || null,
        audit: lastTerrainAudit
      },
      worldAggro: Game.worldAggro && Game.worldAggro.snapshot(),
      mmoAudit: lastMmoAudit,
      social: Game.state && Game.state.world && Game.state.world.social,
      summonDiagnostics: {
        selectedArchetypeId: $('summon-archetype').value,
        lastSpawn: lastSummonSnapshot,
        lastSelfDestruct: lastSelfDestructResult,
        live: Game.actors.query({ category: 'summon' }).filter(function (actor) {
          return !actor.dead;
        }).map(compactActor)
      }
    }, null, 2);
    updatePortraitQa();
    updateInspector();
    if (force) refreshRuntimeSelects();
  }
  function loop(now) {
    var dt = Math.min(.1, (now - lastTime) / 1000);
    lastTime = now;
    if (!paused && encounter && encounter.lifecycle === 'active') {
      accumulator += dt * Number($('speed').value);
      while (accumulator >= .05 && encounter.lifecycle === 'active') {
        stepCombat();
        accumulator -= .05;
      }
    }
    updatePresentation(dt);
    draw();
    uiTick -= dt;
    if (uiTick <= 0) { uiTick = .15; updateUi(false); }
    requestAnimationFrame(loop);
  }
  function renderGuardContactSheet() {
    var sheet = $('guard-contact-sheet'), status = $('guard-contact-status');
    if (!sheet || !status) return;
    sheet.innerHTML = '';
    var actors = Game.content.all('actorArchetype').filter(function (def) {
      return (def.tags || []).indexOf('encounter-pool') >= 0;
    }).sort(function (a, b) { return a.legacy.tier - b.legacy.tier || a.id.localeCompare(b.id); });
    var ready = 0;
    actors.forEach(function (def) {
      var card = document.createElement('article'); card.className = 'guard-contact-card';
      var canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 88;
      canvas.setAttribute('aria-label', def.id + ' idle frames');
      var context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
      context.fillStyle = '#080b17'; context.fillRect(0, 0, canvas.width, canvas.height);
      var sprite = Game.assets.sprite(def.presentation.spriteId);
      var frames = [sprite.frames.idle0, sprite.frames.idle1 || sprite.frames.idle0];
      frames.forEach(function (frame, index) {
        var scale = 3, x = index ? 94 : 24, y = 70 - frame.height * scale;
        context.drawImage(frame, x, y, frame.width * scale, frame.height * scale);
        context.fillStyle = '#7f8bb5'; context.font = '9px ui-monospace';
        context.fillText('idle' + index, index ? 101 : 31, 83);
      });
      if (!sprite.isPlaceholder && frames[0] && frames[1]) ready++;
      var info = document.createElement('div');
      var name = document.createElement('strong'); name.textContent = Game.i18n.t(def.identity.nameKey);
      var id = document.createElement('code'); id.textContent = def.id;
      var special = Game.content.get('ability', def.id + '.special');
      var ability = document.createElement('small'); ability.textContent = special ? Game.i18n.t(special.presentation.nameKey) : 'missing special';
      var role = document.createElement('small');
      role.textContent = (def.tags.indexOf('territory-guardian') >= 0 ? 'GUARD' : 'HUNTER') +
        ' · T' + def.legacy.tier + ' · ' + frames.map(function (frame) { return frame.width + '×' + frame.height; }).join('/');
      info.appendChild(name); info.appendChild(id); info.appendChild(ability); info.appendChild(role);
      card.appendChild(canvas); card.appendChild(info); sheet.appendChild(card);
    });
    status.textContent = ready + '/' + actors.length + ' sprites · no placeholders';
    status.classList.toggle('fail', ready !== actors.length);
  }
  function boot() {
    var initial = params();
    $('locale').value = initial.lang === 'en' ? 'en' : 'zh-CN';
    var audit = Game.content.finalize({ strict: true });
    $('fingerprint').textContent = 'content ' + audit.fingerprint + ' · ' + audit.packs.length + ' packs';
    renderGuardContactSheet();
    fillSelect($('encounter'), Game.content.all('encounterProfile'), initial.encounter, function (def) { return labelFor('encounterProfile', def); });
    fillSelect($('actor'), Game.content.all('actorArchetype'), initial.actor, function (def) { return labelFor('actorArchetype', def); });
    fillSelect($('class'), Game.content.all('class'), initial.classId, function (def) { return def.id; });
    fillSelect($('faction'), Game.content.all('faction'), 'adventurers', function (def) { return def.id; });
    fillSelect($('controller'), ['ai:player-auto', 'ai:monster', 'player:manual', 'scripted'], 'ai:player-auto');
    fillSelect($('strategy'), Game.content.all('tacticsProfile'), initial.strategy, function (def) { return def.id; });
    fillScenarios(initial.scenario);
    $('seed').value = initial.seed;
    fillSelect($('tool-status'), Game.content.all('status'), null, function (def) { return labelFor('status', def); });
    var summons = Game.content.all('actorArchetype').filter(function (def) { return def.category === 'summon'; });
    var initialEncounter = Game.content.get('encounterProfile', $('encounter').value);
    var regionProfile = initialEncounter && Game.content.get('regionProfile', initialEncounter.regionId);
    var defaultSummon = regionProfile && regionProfile.projection.summons[0];
    fillSelect($('summon-archetype'), summons, defaultSummon || summons[0] && summons[0].id, function (def) {
      return labelFor('actorArchetype', def);
    });
    fillSelect($('catalog-type'), Game.contentSchemas.definitionTypes, 'actorArchetype');
    $('catalog-counts').innerHTML = Game.contentSchemas.definitionTypes.map(function (type) {
      return '<span>' + type + ' ' + Game.content.all(type).length + '</span>';
    }).join('');
    [
      ['reset', reset], ['pause', function () { paused = !paused; translate(); }],
      ['step', function () {
        stepCombat(); updatePresentation(.05); draw(); updateUi(true);
      }],
      ['impact', function () { runToImpact(500); }],
      ['terrain-audit', runTerrainAudit],
      ['mmo-audit', runMmoAggroAudit],
      ['force-action', function () {
        Game.combat.requestAction({
          actorId: $('tool-source').value, targetId: $('tool-target').value,
          abilityId: $('tool-ability').value
        }); updateUi(true);
      }],
      ['apply-status', function () { applyToolEffect('applyStatus', { statusId: $('tool-status').value, durationTicks: 160 }); }],
      ['dispel', function () { applyToolEffect('removeStatus', { statusId: $('tool-status').value }); }],
      ['interrupt', function () { Game.combat.cancelAction($('tool-target').value, 'interrupt'); updateUi(true); }],
      ['move', function () {
        var target = Game.actors.get($('tool-target').value);
        if (target) { target.x = target.x > 480 ? 480 : 720; target.y = 240; } updateUi(true);
      }],
      ['charm', function () {
        if (charmOverride) { Game.relations.clearOverride(charmOverride); charmOverride = null; }
        else {
          charmOverride = Game.relations.setOverride('actor', $('tool-source').value, $('tool-target').value, 'ally',
            { encounterId: encounter.id, symmetric: true });
        }
        updateUi(true);
      }],
      ['summon', doSummon],
      ['self-destruct', triggerSelfDestruct]
      ,['lab-provoke', function () {
        $('scenario').value = 'engagement';
        reset();
      }]
      ,['lab-surrender', function () {
        var target = Game.actors.get($('tool-target').value);
        if (target && target.encounterId) {
          var encounterId = target.encounterId;
          Game.encounters.leave(encounterId, target.id, 'surrender');
          Game.encounters.evaluateObjectives(encounterId);
        }
        updateUi(true);
      }]
      ,['lab-forgive', function () {
        var target = Game.actors.get($('tool-target').value) ||
          Game.actors.query().filter(function (actor) { return actor.spawnId; })[0];
        if (target) Game.engagement.forgive({
          spawnId: target.spawnId,
          socialGroupId: target.socialGroupId,
          factionId: target.factionId
        });
        updateUi(true);
      }]
    ].forEach(function (entry) { $(entry[0]).addEventListener('click', entry[1]); });
    $('locale').addEventListener('change', function () { translate(); renderGuardContactSheet(); updateUrl(); });
    $('tool-source').addEventListener('change', refreshAbilities);
    $('inspect-actor').addEventListener('change', updateInspector);
    $('catalog-type').addEventListener('change', updateCatalog);
    document.querySelectorAll('[data-inspect]').forEach(function (button) {
      button.addEventListener('click', function () {
        inspectTab = button.getAttribute('data-inspect');
        document.querySelectorAll('[data-inspect]').forEach(function (other) {
          other.classList.toggle('active', other === button);
        });
        updateInspector();
      });
    });
    document.querySelectorAll('[data-bubble-scene]').forEach(function (button) {
      button.addEventListener('click', function () {
        activateBubbleScene(button.getAttribute('data-bubble-scene'), false);
      });
    });
    document.querySelectorAll('[data-bubble-walk]').forEach(function (button) {
      button.addEventListener('click', function () {
        activateBubbleScene(button.getAttribute('data-bubble-walk'), true);
      });
    });
    reset();
    translate();
    Game.unitsBubbleDemo = {
      setScene: function (scene) { return activateBubbleScene(scene, false); },
      setWalkScene: function (scene) { return activateBubbleScene(scene, true); },
      layouts: function () { return bubbleLayouts.slice(); },
      snapshot: function () { return Game.actionBubbles.active(); },
      rebuild: reset,
      stepUntilImpact: runToImpact,
      terrainAudit: runTerrainAudit,
      mmoAggroAudit: runMmoAggroAudit,
      presentation: presentationDiagnostics,
      portraits: updatePortraitQa,
      summon: doSummon,
      selfDestruct: triggerSelfDestruct,
      summons: function () {
        return {
          selectedArchetypeId: $('summon-archetype').value,
          lastSpawn: lastSummonSnapshot,
          lastSelfDestruct: lastSelfDestructResult,
          live: Game.actors.query({ category: 'summon' }).filter(function (actor) {
            return !actor.dead;
          }).map(compactActor)
        };
      },
      catalog: function () {
        return {
          complete: true,
          actorCount: Game.content.all('actorArchetype').length,
          classCount: Game.content.all('class').length,
          monsterCount: Game.content.all('actorArchetype').filter(function (def) {
            return def.category === 'monster';
          }).length,
          summonCount: Game.content.all('actorArchetype').filter(function (def) {
            return def.category === 'summon';
          }).length,
          encounterCount: Game.content.all('encounterProfile').length,
          fingerprint: Game.content.fingerprint()
        };
      },
      guardContactSheet: function () {
        return Game.content.all('actorArchetype').filter(function (def) {
          return (def.tags || []).indexOf('encounter-pool') >= 0;
        }).map(function (def) {
          return { id: def.id, spriteReady: Game.assets.has(def.presentation.spriteId),
            specialAbilityId: def.id + '.special' };
        });
      }
    };
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
