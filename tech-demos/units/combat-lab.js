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
  var lastSummonSnapshot = null;
  var lastSelfDestructResult = null;
  var allyTeamId = 'party';
  var enemyTeamId = 'enemy';
  var canvas = $('stage');
  var ctx = canvas.getContext('2d');

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
  function reset() {
    updateUrl();
    scenarioPreset($('scenario').value);
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
    lastSummonSnapshot = null;
    lastSelfDestructResult = null;
    charmOverride = null;
    var profile = Game.content.get('encounterProfile', $('encounter').value) ||
      Game.content.get('encounterProfile', 'encounter.grassland');
    configureTeamIds(profile);
    var tier = Number($('tier').value) || tierFor(profile);
    $('tier').value = tier;
    Game.state = {
      world: {
        region: profile.regionId,
        worldSeed: Number($('seed').value) >>> 0,
        worldTime: 300,
        social: {
          spawnVariants: {},
          memories: { spawnId: {}, socialGroupId: {}, factionId: {} }
        }
      },
      player: { level: Number($('level').value) || 20 }
    };
    Game.parties.create({ id: 'lab-party', maxMembers: 4 });
    if ($('scenario').value === 'engagement') {
      resetEngagementScenario(tier);
    } else {
      encounter = Game.encounters.start(profile.id, {
        id: 'lab:encounter', seed: Number($('seed').value) >>> 0,
        fullLog: true, silent: true, lab: true
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
        item.contact && item.contact.overlapping
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
        trace: movementTrace.slice()
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
    $('movement-trace').textContent = JSON.stringify(movementTrace.slice(-35), null, 2);
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
  function boot() {
    var initial = params();
    $('locale').value = initial.lang === 'en' ? 'en' : 'zh-CN';
    var audit = Game.content.finalize({ strict: true });
    $('fingerprint').textContent = 'content ' + audit.fingerprint + ' · ' + audit.packs.length + ' packs';
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
    $('locale').addEventListener('change', function () { translate(); updateUrl(); });
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
      }
    };
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
