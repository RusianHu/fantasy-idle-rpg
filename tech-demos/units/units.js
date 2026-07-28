/* global Game */
(function () {
  'use strict';

  var U = Game.util;
  var F = Game.F;
  var D = window.DemoI18n;
  var regions = Game.reg.all('region');
  var classes = Game.reg.all('class');
  var monsters = Game.reg.all('monster');
  var monsterById = {};
  monsters.forEach(function (monster) { monsterById[monster.id] = monster; });

  var HERO_KINDS = classes.map(function (cls, index) {
    return {
      type: 'hero',
      id: cls.id,
      sprite: cls.sprite || ('hero_' + cls.id),
      face: cls.face || ('face_' + cls.id),
      index: index,
      optionIndex: index
    };
  });
  var REGION_CATALOG = regions.map(function (region, regionIndex) {
    var normal = (region.monsters || []).map(function (mid, optionIndex) {
      var def = monsterById[mid];
      return def ? {
        type: def.boss ? 'boss' : 'monster',
        id: mid,
        sprite: def.sprite || mid,
        index: optionIndex,
        optionIndex: optionIndex,
        regionId: region.id,
        regionIndex: regionIndex
      } : null;
    }).filter(Boolean);
    var bossDef = monsterById[region.boss];
    var boss = bossDef ? [{
      type: 'boss',
      id: bossDef.id,
      sprite: bossDef.sprite || bossDef.id,
      index: 0,
      optionIndex: 0,
      regionId: region.id,
      regionIndex: regionIndex
    }] : [];
    return {
      id: region.id,
      region: region,
      index: regionIndex,
      normal: normal,
      boss: boss,
      units: normal.concat(boss)
    };
  });
  var ALL_UNITS = [];
  HERO_KINDS.forEach(function (h) { ALL_UNITS.push(h); });
  REGION_CATALOG.forEach(function (entry) {
    entry.units.forEach(function (unit) { ALL_UNITS.push(unit); });
  });

  var currentIndex = 0;
  var currentGroup = 'hero';
  var currentRegionId = regions[0] ? regions[0].id : '';
  var paused = false;
  var timeMode = 'cycle';
  var lastFrame = performance.now();
  var battleMessage = '';
  var bubbleAnchor = 'hero';
  var bubbleAuto = true;
  var bubbleAutoT = 0.35;
  var bubbleSequence = 0;
  var bubbleDemoSeq = 0;
  var bubbleScene = null;
  var bubbleWalkScene = null;
  var AUTO_BUBBLES = [
    { hero: 'resource' },
    { hero: 'gather' },
    { hero: 'enemy', monster: 'alert' },
    { hero: 'chest' },
    { hero: 'loot' }
  ];

  var COPY = {
    'zh-CN': {
      maxHp: '最大生命', atk: '攻击', def: '防御', speed: '速度', crit: '暴击率', critDmg: '暴击伤害',
      range: '攻击距离', projectile: '弹道', growth: '成长', none: '无', active: '主动', passive: '被动',
      baseAtk: '裸攻 Lv.60', baseHp: '裸血 Lv.60', baseDef: '裸防 Lv.60',
      derived: 'Lv.60 派生属性（含被动/装备位占位）', skills: '职业技能',
      heroNote: '派生属性按 Lv.60、无永久强化、三槽空位计算；舞台使用相同生产公式。',
      hp: '生命', exp: '经验', gold: '金币', interval: '攻击间隔', region: '区域', tier: '经典阶位',
      normal: '普通怪', target: '讨伐目标', panel: '面板',
      monsterNote: '属性由 formulas.monsterStats 按区域阶位与变体系数推导，Boss 叠加首领倍率。',
      entered: '已入场', spawned: '已刷新', spawnNormal: '已刷新普通陪练', summoned: '已召唤 Boss',
      reset: '主角已重置', hit: '命中', critical: '暴击', basic: '普攻', dodge: '闪避', defeated: '击败',
      death: '主角阵亡，正在重整', bossEntered: 'Boss 登场', noBubble: '手动检查 · 当前无气泡',
      autoWaiting: '自动轮播 · 等待气泡', hero: '主角', monster: '怪物', manual: '手动', auto: '自动', noneTarget: '无',
      leftSide: '左侧', rightSide: '右侧', registryOptions: '注册表选项', registryId: '注册 ID',
      spriteId: '精灵 ID', faceId: '头像 ID', role: '出场类型', modifiers: '变体系数',
      classTraits: '职业特征', weapon: '武器', optionSlot: '区域选项', defaultMods: '默认公式'
    },
    en: {
      maxHp: 'Max HP', atk: 'Attack', def: 'Defense', speed: 'Speed', crit: 'Critical chance', critDmg: 'Critical damage',
      range: 'Attack range', projectile: 'Projectile', growth: 'Growth', none: 'None', active: 'Active', passive: 'Passive',
      baseAtk: 'Base ATK Lv.60', baseHp: 'Base HP Lv.60', baseDef: 'Base DEF Lv.60',
      derived: 'Lv.60 derived stats (passives, empty gear slots)', skills: 'Class skills',
      heroNote: 'Stats use the production Lv.60 formula with no permanent upgrades and empty gear slots.',
      hp: 'HP', exp: 'EXP', gold: 'Gold', interval: 'Attack interval', region: 'Region', tier: 'Classic tier',
      normal: 'Enemy', target: 'Hunt target', panel: 'panel',
      monsterNote: 'formulas.monsterStats derives these values from region tier and variant modifiers; bosses add boss multipliers.',
      entered: 'entered the stage', spawned: 'Respawned', spawnNormal: 'Spawned sparring enemy', summoned: 'Summoned boss',
      reset: 'Hero reset', hit: 'Hit', critical: 'critical', basic: 'basic attack', dodge: 'Dodged', defeated: 'Defeated',
      death: 'Hero down; regrouping', bossEntered: 'Boss entered', noBubble: 'Manual check · no active bubble',
      autoWaiting: 'Auto sequence · waiting', hero: 'Hero', monster: 'Enemy', manual: 'Manual', auto: 'Auto', noneTarget: 'None',
      leftSide: 'left', rightSide: 'right', registryOptions: 'Registry options', registryId: 'Registry ID',
      spriteId: 'Sprite ID', faceId: 'Portrait ID', role: 'Encounter role', modifiers: 'Variant modifiers',
      classTraits: 'Class traits', weapon: 'Weapon', optionSlot: 'Region option', defaultMods: 'Formula defaults'
    }
  };

  function tr(key) {
    var locale = D ? D.locale() : 'zh-CN';
    return (COPY[locale] && COPY[locale][key]) || COPY['zh-CN'][key] || key;
  }

  function bubbleLabel(type) {
    return D ? D.t('units.' + type) : type;
  }

  function esc(value) { return U.esc(String(value)); }

  function className(id) {
    return Game.i18n.t('class.' + id + '.name');
  }

  function monsterName(id) {
    return Game.i18n.t('monster.' + id + '.name');
  }

  function monsterDescription(id, regionId) {
    var key = 'monster.' + id + '.desc';
    var translated = Game.i18n.t(key);
    return translated === key
      ? D.t('units.monsterFallback', { name: monsterName(id), region: regionName(regionId) })
      : translated;
  }

  function regionName(id) {
    return Game.i18n.t('region.' + id + '.name');
  }

  function trait(label, cls) {
    return '<span class="trait' + (cls ? ' ' + cls : '') + '"' + '>' + esc(label) + '</span>';
  }

  function swatch(color) {
    return '<i class="swatch" style="background:' + esc(color) + '" title="' + esc(color) + '"' + '></i>';
  }

  function spriteRow(sprite, name, traits) {
    return '<div class="sprite-row">' +
      '<canvas class="sprite-preview" width="40" height="40" data-sprite="' + esc(sprite) + '"></canvas>' +
      '<div class="sprite-copy"><strong>' + esc(name) + '</strong><small>' + esc(sprite) + '</small></div>' +
      '<div class="trait-list">' + traits + '</div>' +
    '</div>';
  }

  function currentUnit() { return ALL_UNITS[currentIndex]; }

  function currentCatalog() {
    return REGION_CATALOG.find(function (entry) { return entry.id === currentRegionId; }) || REGION_CATALOG[0];
  }

  function groupUnits(group) {
    if (group === 'hero') return HERO_KINDS;
    var catalog = currentCatalog();
    if (!catalog) return [];
    return group === 'monster' ? catalog.normal : catalog.boss;
  }

  function unitFor(group, index) {
    var list = groupUnits(group);
    if (!list.length) return HERO_KINDS[0];
    return list[(index + list.length) % list.length];
  }

  function unitGlobalIndex(group, localIndex) {
    var list = groupUnits(group);
    var target = list[(localIndex + list.length) % list.length];
    return ALL_UNITS.indexOf(target);
  }

  function setGroup(group) {
    currentGroup = group;
    var unit = unitFor(group, 0);
    activateUnit(ALL_UNITS.indexOf(unit));
  }

  function setRegion(regionId, preserveUnit) {
    var next = REGION_CATALOG.find(function (entry) { return entry.id === regionId; });
    if (!next) return false;
    currentRegionId = next.id;
    var unit = preserveUnit && currentGroup === 'hero' ? currentUnit() : unitFor(currentGroup, 0);
    activateUnit(ALL_UNITS.indexOf(unit));
    return true;
  }

  function statRow(label, value, note) {
    return '<div class="config-row"><span>' + esc(label) + '</span><div>' + esc(value) +
      (note ? ' <span class="raw-id">' + esc(note) + '</span>' : '') + '</div></div>';
  }

  function fmtPct(v) { return (Math.round(v * 1000) / 10) + '%'; }

  function optionLabel(unit) {
    if (unit.type === 'hero') return D.t('units.classOption', { slot: unit.optionIndex + 1 });
    if (unit.type === 'boss') return D.t('units.bossOption');
    return D.t('units.normalOption', { slot: unit.optionIndex + 1 });
  }

  function renderUnitOption(unit) {
    var active = unit === currentUnit() ? ' active' : '';
    var title = unit.type === 'hero' ? className(unit.id) : monsterName(unit.id);
    return '<button class="registry-unit' + active + '" type="button" data-global="' + ALL_UNITS.indexOf(unit) + '"' +
      (active ? ' aria-current="true"' : '') + '>' +
      '<canvas width="32" height="32" data-sprite="' + esc(unit.sprite) + '" aria-hidden="true"></canvas>' +
      '<span><small>' + esc(optionLabel(unit)) + '</small><strong>' + esc(title) + '</strong>' +
      '<code>' + esc(unit.id) + '</code></span></button>';
  }

  function renderCatalog() {
    var root = document.getElementById('inspector');
    var catalog = currentCatalog();
    if (!catalog) return;
    var totalOptions = REGION_CATALOG.reduce(function (sum, entry) { return sum + entry.units.length; }, 0);
    var audit = catalogSnapshot();
    var regionButtons = REGION_CATALOG.map(function (entry) {
      var selected = entry.id === catalog.id;
      return '<button class="registry-region' + (selected ? ' active' : '') + '" type="button" role="tab"' +
        ' aria-selected="' + (selected ? 'true' : 'false') + '" data-region="' + esc(entry.id) + '">' +
        '<small>' + String(entry.index + 1).padStart(2, '0') + ' · T' + esc(entry.region.tier) + '</small>' +
        '<strong>' + esc(regionName(entry.id)) + '</strong>' +
        '<span>' + esc(D.t('units.regionCounts', {
          normal: entry.normal.length,
          boss: entry.boss.length
        })) + '</span></button>';
    }).join('');
    var classOptions = HERO_KINDS.map(renderUnitOption).join('');
    var regionOptions = catalog.units.map(renderUnitOption).join('');
    var block = document.createElement('section');
    block.className = 'registry-catalog';
    block.setAttribute('aria-label', D.t('units.catalogAria'));
    block.innerHTML =
      '<div class="registry-heading"><div><p>REGISTRY / AUTO DISCOVERY</p><h2>' +
        esc(D.t('units.catalogTitle')) + '</h2></div><output>' +
        '<span>' + esc(D.t('units.catalogSummary', {
          regions: REGION_CATALOG.length,
          monsters: totalOptions,
          classes: HERO_KINDS.length
        })) + '</span><strong class="' + (audit.complete ? 'complete' : 'issues') + '">' +
        esc(audit.complete ? D.t('units.catalogComplete') : D.t('units.catalogIssues', {
          count: audit.issues.length + audit.missing.length + audit.unmapped.length
        })) + '</strong></output></div>' +
      '<div class="registry-section-head"><strong>' + esc(D.t('units.themeMaps')) +
        '</strong><span>' + esc(D.t('units.themeMapsHint')) + '</span></div>' +
      '<div class="registry-regions" role="tablist" aria-label="' + esc(D.t('units.themeMapsAria')) + '">' +
        regionButtons + '</div>' +
      '<div class="registry-section-head current"><strong>' +
        esc(D.t('units.regionRoster', { region: regionName(catalog.id) })) + '</strong><span>' +
        esc(D.t('units.regionCounts', {
          normal: catalog.normal.length,
          boss: catalog.boss.length
        })) + '</span></div>' +
      '<div class="registry-units">' + regionOptions + '</div>' +
      '<div class="registry-section-head"><strong>' + esc(D.t('units.classOptions')) +
        '</strong><span>' + HERO_KINDS.length + '</span></div>' +
      '<div class="registry-units classes">' + classOptions + '</div>';
    root.insertBefore(block, root.firstChild);
  }

  function renderHeroInspector(unit) {
    var cls = Game.reg.get('class', unit.id);
    var d = F.playerBase(cls, 60);
    var preview = Game.player.previewDerived({ classId: unit.id, level: 60 });
    var skills = Game.reg.all('skill').filter(function (s) { return s.cls === unit.id; });
    var classTraits = (cls.traits || []).map(function (value) { return trait(value); }).join('');
    var statRows =
      statRow(tr('maxHp'), preview.maxHp) +
      statRow(tr('atk'), preview.atk) +
      statRow(tr('def'), preview.def) +
      statRow(tr('speed'), preview.spd) +
      statRow(tr('crit'), fmtPct(preview.crit)) +
      statRow(tr('critDmg'), '×' + preview.critDmg.toFixed(2)) +
      statRow(tr('range'), cls.range + ' px') +
      statRow(tr('projectile'), cls.projectile || tr('none')) +
      statRow(tr('growth'), 'HP×' + cls.grow.hp + ' / ATK×' + cls.grow.atk + ' / DEF×' + cls.grow.def);

    var skillRows = skills.map(function (s) {
      var kind = s.type === 'active' ? (s.kind || tr('active')) : tr('passive');
      var desc = Game.i18n.t('skill.' + s.id + '.desc', s.descVars ? s.descVars(10) : {});
      return '<div class="skill-row">' +
        '<canvas width="24" height="24" data-sprite="' + esc(s.icon || 'icon_skill_strike') + '"></canvas>' +
        '<div><strong>' + esc(Game.i18n.t('skill.' + s.id + '.name')) + '</strong>' +
        '<small>' + esc(kind) + (s.cd ? ' · CD ' + s.cd + 's' : '') + ' · ' + esc(desc) + '</small></div>' +
      '</div>';
    }).join('');

    document.getElementById('inspector').innerHTML =
      '<div class="inspector-header">' +
        '<h2>' + esc(className(unit.id)) + '</h2>' +
        '<p>' + esc(Game.i18n.t('class.' + unit.id + '.desc')) + '</p>' +
      '</div>' +
      '<div class="metric-grid">' +
        '<div class="metric"><strong>' + d.atk + '</strong><span>' + esc(tr('baseAtk')) + '</span></div>' +
        '<div class="metric"><strong>' + d.hp + '</strong><span>' + esc(tr('baseHp')) + '</span></div>' +
        '<div class="metric"><strong>' + d.def + '</strong><span>' + esc(tr('baseDef')) + '</span></div>' +
      '</div>' +
      '<section class="inspect-section"><h3>' + esc(tr('registryOptions')) + '</h3>' +
        spriteRow(unit.sprite, className(unit.id), classTraits) +
        '<div class="row-list registry-raw">' +
          statRow(tr('registryId'), cls.id) +
          statRow(tr('spriteId'), unit.sprite) +
          statRow(tr('faceId'), unit.face) +
          statRow(tr('weapon'), cls.weapon || tr('none')) +
          statRow(tr('classTraits'), (cls.traits || []).join(' · ') || tr('none')) +
        '</div>' +
      '</section>' +
      '<section class="inspect-section"><h3>' + esc(tr('derived')) + '</h3>' +
        '<div class="row-list">' + statRows + '</div>' +
      '</section>' +
      '<section class="inspect-section"><h3>' + esc(tr('skills')) + '</h3>' + skillRows + '</section>' +
      '<p class="note">' + esc(tr('heroNote')) + '</p>';
  }

  function renderMonsterInspector(unit) {
    var def = Game.reg.get('monster', unit.id);
    var tier = def.tier || Game.State.regionTier(unit.id);
    var st = F.monsterStats(tier, def.mods, def.boss);
    var traits = def.boss ? trait('Boss', 'boss') + trait(tr('target'), 'accent') : trait(tr('normal'));
    var region = regions.find(function (r) { return r.id === unit.regionId; });
    var modifiers = def.mods && Object.keys(def.mods).length
      ? Object.keys(def.mods).map(function (key) { return key + ': ' + def.mods[key]; }).join(' · ')
      : tr('defaultMods');

    var statRows =
      statRow(tr('hp'), st.hp) +
      statRow(tr('atk'), st.atk) +
      statRow(tr('def'), st.def) +
      statRow(tr('speed'), st.spd) +
      statRow(tr('exp'), st.exp) +
      statRow(tr('gold'), st.gold) +
      statRow(tr('interval'), F.atkInterval(st.spd).toFixed(2) + 's') +
      statRow(tr('region'), region ? Game.i18n.t('region.' + region.id + '.name') : '-') +
      statRow(tr('tier'), 'Tier ' + tier);

    document.getElementById('inspector').innerHTML =
      '<div class="inspector-header">' +
        '<h2>' + esc(monsterName(unit.id)) + '</h2>' +
        '<p>' + esc(monsterDescription(unit.id, unit.regionId)) + '</p>' +
      '</div>' +
      '<div class="metric-grid">' +
        '<div class="metric"><strong>' + st.hp + '</strong><span>HP</span></div>' +
        '<div class="metric"><strong>' + st.atk + '</strong><span>ATK</span></div>' +
        '<div class="metric"><strong>' + st.def + '</strong><span>DEF</span></div>' +
      '</div>' +
      '<section class="inspect-section"><h3>' + (def.boss ? 'Boss' : esc(tr('normal'))) + ' ' + esc(tr('panel')) + '</h3>' +
        spriteRow(unit.sprite, monsterName(unit.id), traits) +
        '<div class="row-list registry-raw">' +
          statRow(tr('registryId'), def.id) +
          statRow(tr('spriteId'), def.sprite) +
          statRow(tr('role'), def.boss ? 'Boss' : tr('normal')) +
          statRow(tr('optionSlot'), region ? (region.id + ' / ' + (unit.optionIndex + 1)) : '-') +
          statRow(tr('modifiers'), modifiers + (def.scale ? ' · scale: ' + def.scale : '')) +
        '</div>' +
        '<div class="row-list stat-rows">' + statRows + '</div>' +
      '</section>' +
      '<p class="note">' + esc(tr('monsterNote')) + '</p>';
  }

  function renderInspector() {
    var unit = currentUnit();
    if (unit.type === 'hero') renderHeroInspector(unit);
    else renderMonsterInspector(unit);
    renderCatalog();

    Array.prototype.forEach.call(document.querySelectorAll('#inspector [data-sprite]'), function (canvas) {
      Game.assets.drawToDom(canvas, canvas.getAttribute('data-sprite'), 'idle0');
    });
  }

  function updateHeader() {
    var unit = currentUnit();
    var title, subtitle;
    if (unit.type === 'hero') {
      title = className(unit.id);
      subtitle = 'class / ' + unit.id + ' · ' + unit.sprite + ' · ' + currentRegionId;
    } else {
      title = monsterName(unit.id) + ' · ' + regionName(currentRegionId);
      subtitle = (unit.type === 'boss' ? 'boss' : 'monster') + ' / ' + unit.id + ' · ' + unit.sprite +
        ' · region/' + currentRegionId;
    }
    document.getElementById('stage-title').textContent = title;
    document.getElementById('stage-subtitle').textContent = subtitle;
    document.getElementById('stage-index').textContent = String(unit.index + 1).padStart(2, '0');
  }

  function setupStageForUnit(unit) {
    var region = regions.find(function (entry) { return entry.id === currentRegionId; }) || regions[0];
    var classId = unit.type === 'hero' ? unit.id : 'fighter';
    var level = unit.type === 'hero' ? 60 : Math.max(1, (unit.type === 'boss' ? 70 : 55));
    Game.player.setClass(classId);
    Game.state.player.level = level;
    Game.state.player.exp = 0;
    Game.state.player.skills = {};
    Game.player.recalc();
    Game.state.player.hp = Game.state.derived.maxHp;
    Game.state.world.region = region.id;
    Game.state.world.layoutVersion = 3;
    Game.state.world.mode = 'battle';
    Game.state.world.deathsRow = 0;
    Game.state.settings.controlMode = 'auto';
    Game.world.init(region.id);

    var hero = Game.world.hero;
    clearSparring();
    var start = Game.terrain.projectPoint(Game.world.layout.camp.x + 34, Game.world.layout.camp.y + 18, 1) || Game.world.layout.camp;
    hero.x = start.x;
    hero.y = start.y;
    hero.dir = 'r';
    hero.state = 'idle';
    hero.target = null;
    hero.moveOrder = null;
    hero.manualTarget = false;
    hero.campWarp = null;
    Game.nav.clear(hero);

    Game.exploration.revealAt(hero.x, hero.y, { force: true, rid: region.id });
    if (unit.type !== 'hero') spawnSparring(unit.id, unit.type === 'boss');
    Game.state.player.hp = Game.state.derived.maxHp;
    Game.world.syncHeroStats();
    Game.render.snapCamera(hero.x, hero.y);
  }

  function clearSparring() {
    if (Game.actionBubbles) Game.actionBubbles.clear();
    Game.world.entities = Game.world.entities.filter(function (e) { return e.kind === 'hero'; });
    Game.world.bossEnt = null;
    Game.world.cinematic = null;
  }

  function spawnSparring(mid, isBoss) {
    clearSparring();
    var ent = Game.world.makeMonster(mid, isBoss);
    var hero = Game.world.hero;
    var target = Game.terrain.projectPoint(hero.x + 92, hero.y + 6, 1) || { x: hero.x + 72, y: hero.y };
    ent.x = target.x;
    ent.y = target.y;
    ent.spawnX = ent.x;
    ent.spawnY = ent.y;
    ent.dir = 'l';
    ent.state = isBoss ? 'fight' : 'wander';
    ent.engaged = isBoss;
    Game.world.entities.push(ent);
    if (isBoss) {
      Game.world.bossEnt = ent;
      Game.world.cinematic = { ent: ent, t: 1.5 };
      Game.fx.shake(5, 0.9);
      Game.fx.banner('ui.bossAppear', { name: Game.i18n.t('monster.' + mid + '.name') });
    }
    Game.exploration.revealAt(ent.x, ent.y, { force: true, rid: Game.world.region.id });
    return ent;
  }

  function bubbleMonster() {
    var monster = Game.world.entities.find(function (entity) {
      return entity.kind === 'monster' && !entity.dead && entity.hp > 0;
    });
    if (!monster) {
      var unit = currentUnit();
      var fallback = currentCatalog() && currentCatalog().normal[0];
      var def = unit.type === 'hero' && fallback ? Game.reg.get('monster', fallback.id) : Game.reg.get('monster', unit.id);
      monster = spawnSparring(def.id, !!def.boss);
    }
    var hero = Game.world.hero;
    if (hero && U.dist(hero.x, hero.y, monster.x, monster.y) > 120) {
      monster.x = hero.x + 88;
      monster.y = hero.y + 6;
      monster.spawnX = monster.x;
      monster.spawnY = monster.y;
    }
    return monster;
  }

  function setBubbleAnchor(anchor) {
    bubbleAnchor = /^(hero|monster|both)$/.test(anchor) ? anchor : 'hero';
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-anchor]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-bubble-anchor') === bubbleAnchor);
    });
    updateBubbleQa();
    return bubbleAnchor;
  }

  function setBubbleAuto(enabled) {
    bubbleAuto = !!enabled;
    bubbleAutoT = bubbleAuto ? 0.2 : 0;
    var button = document.getElementById('toggle-bubble-auto');
    if (button) {
      button.classList.toggle('active', bubbleAuto);
      button.setAttribute('aria-checked', bubbleAuto ? 'true' : 'false');
    }
    updateBubbleQa();
    return bubbleAuto;
  }

  function setPaused(enabled) {
    paused = !!enabled;
    var button = document.getElementById('toggle-play');
    button.textContent = paused ? '▶' : 'Ⅱ';
    button.title = paused ? D.t('common.resume') : D.t('common.pause');
    button.setAttribute('aria-label', button.title);
    document.getElementById('runtime-status').textContent = paused ? D.t('common.paused') : D.t('units.runtime');
    return paused;
  }

  function setBubbleScene(scene) {
    scene = /^(center|left|right)$/.test(scene) ? scene : 'center';
    bubbleScene = scene;
    bubbleWalkScene = null;
    setBubbleAuto(false);
    setPaused(true);
    setBubbleAnchor('both');

    var hero = Game.world.hero;
    var monster = bubbleMonster();
    Game.world.cinematic = null;
    Game.world.bossEnt = null;
    hero.target = monster;
    hero.manualTarget = true;
    hero.moveOrder = null;
    hero.state = 'fight';
    hero.hp = Math.max(1, Math.round(hero.maxHp * 0.62));
    monster.state = 'fight';
    monster.engaged = true;
    monster.hp = Math.max(1, Math.round(monster.maxHp * 0.62));
    monster.y = hero.y + (scene === 'center' ? -30 : 34);
    Game.nav.clear(hero);
    Game.nav.clear(monster);
    Game.render.snapCamera(hero.x, hero.y);
    Game.render.frame(0);

    var stage = document.getElementById('stage');
    var viewY = stage.parentElement.clientHeight / 2;
    var viewLeft = Game.render.screenToWorld(0, viewY).x;
    var viewRight = Game.render.screenToWorld(stage.parentElement.clientWidth, viewY).x;
    if (scene === 'center') monster.x = hero.x;
    if (scene === 'left') monster.x = viewLeft + 10;
    if (scene === 'right') monster.x = viewRight - 10;
    monster.spawnX = monster.x;
    monster.spawnY = monster.y;
    hero.dir = monster.x >= hero.x ? 'r' : 'l';
    monster.dir = monster.x >= hero.x ? 'l' : 'r';
    Game.exploration.revealAt(monster.x, monster.y, { force: true, rid: Game.world.region.id });

    Game.actionBubbles.clear();
    var targetId = 'units-layout:' + scene + ':' + (++bubbleDemoSeq);
    Game.actionBubbles.show(hero, 'enemy', { targetId: targetId + ':hero', duration: 30 });
    Game.actionBubbles.show(monster, 'alert', { targetId: targetId + ':monster', duration: 30 });
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-type]'), function (button) {
      button.classList.toggle('active', /^(enemy|alert)$/.test(button.getAttribute('data-bubble-type')));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-scene]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-bubble-scene') === scene);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-walk]'), function (button) {
      button.classList.remove('active');
    });
    Game.render.frame(0);
    updateBubbleQa();
    return Game.render.actionBubbleLayouts();
  }

  function setWalkBubbleScene(scene) {
    scene = /^(l|r|vertical)$/.test(scene) ? scene : 'vertical';
    bubbleScene = null;
    bubbleWalkScene = scene;
    setBubbleAuto(false);
    setPaused(true);
    setBubbleAnchor('hero');
    clearSparring();

    var hero = Game.world.hero;
    hero.target = null;
    hero.manualTarget = false;
    hero.moveOrder = null;
    hero.state = 'idle';
    hero.moving = true;
    hero.dir = scene === 'vertical' ? 'u' : scene;
    hero.hp = hero.maxHp;
    Game.nav.clear(hero);
    Game.render.snapCamera(hero.x, hero.y);
    Game.actionBubbles.show(hero, 'resource', {
      targetId: 'units-walk:' + scene + ':' + (++bubbleDemoSeq),
      duration: 30
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-type]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-bubble-type') === 'resource');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-scene]'), function (button) {
      button.classList.remove('active');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-walk]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-bubble-walk') === scene);
    });
    Game.render.frame(0);
    updateBubbleQa();
    return Game.render.actionBubbleLayouts();
  }

  function showBubble(type, anchor, replace) {
    if (!Game.actionBubbles.type(type)) return false;
    anchor = anchor || bubbleAnchor;
    var hero = Game.world.hero;
    var monster = (anchor === 'monster' || anchor === 'both') ? bubbleMonster() : null;
    // 生成陪练可能触发正式世界的清理事件；所有锚点就绪后再提交本次气泡。
    if (replace !== false) Game.actionBubbles.clear();
    var shown = [];
    var targetId = 'units-demo:' + (++bubbleDemoSeq);
    if (anchor === 'hero' || anchor === 'both') {
      shown.push(Game.actionBubbles.show(hero, type, {
        targetId: targetId + ':hero',
        duration: 3
      }));
    }
    if (anchor === 'monster' || anchor === 'both') {
      shown.push(Game.actionBubbles.show(monster, type, {
        targetId: targetId + ':monster',
        duration: 3
      }));
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-type]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-bubble-type') === type);
    });
    updateBubbleQa();
    return shown.some(Boolean);
  }

  function showAutomaticBubble() {
    var scene = AUTO_BUBBLES[bubbleSequence % AUTO_BUBBLES.length];
    bubbleSequence++;
    Game.actionBubbles.clear();
    var hero = Game.world.hero;
    var monster = scene.monster ? bubbleMonster() : null;
    var targetId = 'units-auto:' + bubbleSequence;
    if (scene.hero) {
      Game.actionBubbles.show(hero, scene.hero, {
        targetId: targetId + ':hero',
        duration: 2.25
      });
    }
    if (scene.monster && monster) {
      Game.actionBubbles.show(monster, scene.monster, {
        targetId: targetId + ':monster',
        duration: 2.25
      });
    }
    var activeType = scene.hero || scene.monster;
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-type]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-bubble-type') === activeType);
    });
    updateBubbleQa();
  }

  function paintBubbleControls() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-bubble-type]'), function (button) {
      Game.render.drawActionBubbleIcon(
        button.querySelector('canvas'),
        button.getAttribute('data-bubble-type')
      );
    });
  }

  function updateBubbleQa() {
    var output = document.getElementById('bubble-status');
    if (!output || !Game.actionBubbles) return;
    var active = Game.actionBubbles.active().filter(function (bubble) {
      return bubble.state === 'visible';
    });
    if (!active.length) {
      output.textContent = bubbleAuto ? tr('autoWaiting') : tr('noBubble');
      return;
    }
    output.textContent = active.map(function (bubble) {
      var anchorName = bubble.entityKind === 'monster' ? tr('monster') : tr('hero');
      var layout = Game.render.actionBubbleLayouts().find(function (item) { return item.id === bubble.id; });
      var side = layout && layout.side ? ' · ' + tr(layout.side === 'left' ? 'leftSide' : 'rightSide') : '';
      return anchorName + ' · ' + bubbleLabel(bubble.type) + side;
    }).join(' / ');
  }

  function syncSelectionUi() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-kind]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-kind') === currentGroup);
    });
    if (location.protocol !== 'file:') {
      var url = new URL(location.href);
      url.searchParams.set('region', currentRegionId);
      url.searchParams.set('unit', currentUnit().id);
      history.replaceState(null, '', url.href);
    }
  }

  function activateUnit(index) {
    if (index < 0 || !ALL_UNITS[index]) index = 0;
    currentIndex = (index + ALL_UNITS.length) % ALL_UNITS.length;
    var unit = currentUnit();
    currentGroup = unit.type === 'hero' ? 'hero' : (unit.type === 'boss' ? 'boss' : 'monster');
    if (unit.regionId) currentRegionId = unit.regionId;
    setupStageForUnit(unit);
    bubbleAutoT = 0.2;
    updateHeader();
    renderInspector();
    syncSelectionUi();
    setBattleEvent((unit.type === 'hero' ? className(unit.id) : monsterName(unit.id)) + ' · ' + tr('entered'));
  }

  function setBattleEvent(message) {
    battleMessage = message;
    var output = document.getElementById('battle-event');
    if (output) output.textContent = message;
  }

  function setTimeMode(mode) {
    timeMode = mode;
    var dayLength = F.BAL.dayLength;
    if (mode === 'day') Game.state.world.worldTime = dayLength * 0.28;
    if (mode === 'dusk') Game.state.world.worldTime = dayLength * 0.56;
    if (mode === 'night') Game.state.world.worldTime = dayLength * 0.82;
    Array.prototype.forEach.call(document.querySelectorAll('[data-time]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-time') === mode);
    });
  }

  function bindControls() {
    function stepUnit(delta) {
      var list = groupUnits(currentGroup);
      var local = list.indexOf(currentUnit());
      activateUnit(unitGlobalIndex(currentGroup, local + delta));
    }
    document.getElementById('prev-unit').addEventListener('click', function () {
      stepUnit(-1);
    });
    document.getElementById('next-unit').addEventListener('click', function () {
      stepUnit(1);
    });
    document.getElementById('toggle-play').addEventListener('click', function () {
      setPaused(!paused);
    });
    document.querySelector('.mode-controls').addEventListener('click', function (event) {
      var button = event.target.closest('[data-kind]');
      if (!button) return;
      Array.prototype.forEach.call(document.querySelectorAll('[data-kind]'), function (b) { b.classList.remove('active'); });
      button.classList.add('active');
      setGroup(button.getAttribute('data-kind'));
    });
    document.querySelector('.segmented').addEventListener('click', function (event) {
      var button = event.target.closest('[data-time]');
      if (button) setTimeMode(button.getAttribute('data-time'));
    });
    document.getElementById('effects-toggle').addEventListener('change', function () {
      Game.particles.setEnabled(this.checked);
    });
    document.getElementById('motion-toggle').addEventListener('change', function () {
      if (!Game.state || !Game.state.settings) return;
      Game.state.settings.effects = this.checked;
    });
    document.querySelector('.bubble-anchor-controls').addEventListener('click', function (event) {
      var button = event.target.closest('[data-bubble-anchor]');
      if (button) setBubbleAnchor(button.getAttribute('data-bubble-anchor'));
    });
    document.querySelector('.bubble-type-controls').addEventListener('click', function (event) {
      var button = event.target.closest('[data-bubble-type]');
      if (!button) return;
      setBubbleAuto(false);
      showBubble(button.getAttribute('data-bubble-type'));
    });
    document.querySelector('.bubble-scene-controls').addEventListener('click', function (event) {
      var button = event.target.closest('[data-bubble-scene]');
      if (button) setBubbleScene(button.getAttribute('data-bubble-scene'));
    });
    document.querySelector('.bubble-walk-controls').addEventListener('click', function (event) {
      var button = event.target.closest('[data-bubble-walk]');
      if (button) setWalkBubbleScene(button.getAttribute('data-bubble-walk'));
    });
    document.getElementById('toggle-bubble-auto').addEventListener('click', function () {
      setBubbleAuto(this.getAttribute('aria-checked') !== 'true');
    });
    document.getElementById('clear-bubbles').addEventListener('click', function () {
      setBubbleAuto(false);
      Game.actionBubbles.clear();
      updateBubbleQa();
    });
    document.getElementById('spawn-sparring').addEventListener('click', function () {
      var unit = currentUnit();
      if (unit.type === 'hero') {
        var list = currentCatalog().normal;
        var pick = list[Math.floor(Math.random() * list.length)];
        spawnSparring(pick.id, false);
        setBattleEvent(tr('spawnNormal') + ' · ' + monsterName(pick.id));
      } else {
        spawnSparring(unit.id, unit.type === 'boss');
        setBattleEvent(tr('spawned') + ' · ' + monsterName(unit.id));
      }
    });
    document.getElementById('spawn-boss').addEventListener('click', function () {
      var list = currentCatalog().boss;
      var pick = list[Math.floor(Math.random() * list.length)];
      spawnSparring(pick.id, true);
      setBattleEvent(tr('summoned') + ' · ' + monsterName(pick.id));
    });
    document.getElementById('toggle-control').addEventListener('click', function () {
      Game.world.toggleControlMode();
    });
    document.getElementById('reset-hero').addEventListener('click', function () {
      var hero = Game.world.hero;
      if (!hero) return;
      var start = Game.terrain.projectPoint(Game.world.layout.camp.x + 34, Game.world.layout.camp.y + 18, 1) || Game.world.layout.camp;
      hero.x = start.x;
      hero.y = start.y;
      hero.dir = 'r';
      hero.state = 'idle';
      hero.target = null;
      hero.moveOrder = null;
      hero.manualTarget = false;
      hero.hp = Game.state.derived.maxHp;
      Game.nav.clear(hero);
      Game.render.snapCamera(hero.x, hero.y);
      Game.exploration.revealAt(hero.x, hero.y, { force: true, rid: Game.world.region.id });
      setBattleEvent(tr('reset'));
    });
    document.getElementById('inspector').addEventListener('click', function (event) {
      var regionButton = event.target.closest('[data-region]');
      if (regionButton) {
        setRegion(regionButton.getAttribute('data-region'), currentGroup === 'hero');
        return;
      }
      var button = event.target.closest('[data-global]');
      if (!button) return;
      activateUnit(Number(button.getAttribute('data-global')));
    });
    window.addEventListener('keydown', function (event) {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
      if (event.key === '[') stepUnit(-1);
      if (event.key === ']') stepUnit(1);
    });
  }

  function bindBattleEvents() {
    Game.bus.on('combat:hit', function (p) {
      if (p.from === 'hero') setBattleEvent(tr('hit') + ' · ' + (p.crit ? tr('critical') : tr('basic')));
    });
    Game.bus.on('combat:miss', function () { setBattleEvent(tr('dodge')); });
    Game.bus.on('monster:killed', function (p) {
      setBattleEvent(tr('defeated') + ' · ' + monsterName(p.mid) + (p.boss ? ' (Boss)' : ''));
    });
    Game.bus.on('player:death', function () { setBattleEvent(tr('death')); });
    Game.bus.on('boss:spawned', function (p) { setBattleEvent(tr('bossEntered') + ' · ' + monsterName(p.mid)); });
    Game.bus.on('control:changed', function (p) {
      document.getElementById('control-runtime').textContent = p.mode === 'manual' ? tr('manual') : tr('auto');
    });
  }

  function updateBattleQa() {
    var hero = Game.world.hero;
    var target = hero ? hero.target : null;
    var targetName = target ? (target.boss ? 'Boss ' : '') + monsterName(target.mid) : tr('noneTarget');
    var rt = document.getElementById('target-runtime');
    if (rt) rt.textContent = targetName;
    var hr = document.getElementById('hero-runtime');
    if (hr && hero) hr.textContent = hero.state;
    var cr = document.getElementById('control-runtime');
    if (cr) cr.textContent = Game.world.controlMode() === 'manual' ? tr('manual') : tr('auto');
    var ev = document.getElementById('battle-event');
    if (ev) ev.textContent = battleMessage;
    updateBubbleQa();
  }

  function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!paused) {
      if (timeMode === 'cycle') {
        Game.state.world.worldTime = (Game.state.world.worldTime + dt) % F.BAL.dayLength;
      }
      Game.terrain.update(dt);
      Game.particles.update(dt);
      Game.fx.update(dt);
      Game.world.update(dt);
      Game.actionBubbles.update(dt);
      if (bubbleAuto) {
        bubbleAutoT -= dt;
        if (bubbleAutoT <= 0) {
          showAutomaticBubble();
          bubbleAutoT = 2.55;
        }
      }
    }
    Game.render.frame(paused ? 0 : dt);
    updateBattleQa();
    requestAnimationFrame(frame);
  }

  function unitOptionSnapshot(unit) {
    var def = unit.type === 'hero' ? Game.reg.get('class', unit.id) : Game.reg.get('monster', unit.id);
    return {
      id: unit.id,
      type: unit.type,
      sprite: unit.sprite,
      regionId: unit.regionId || null,
      optionIndex: unit.optionIndex,
      tier: def.tier || null,
      boss: !!def.boss,
      mods: def.mods || null,
      scale: def.scale || null
    };
  }

  function catalogSnapshot() {
    var mapped = {};
    var missing = [];
    var issues = [];
    REGION_CATALOG.forEach(function (entry) {
      (entry.region.monsters || []).forEach(function (mid) {
        var def = monsterById[mid];
        if (!def) {
          missing.push({ regionId: entry.id, monsterId: mid, role: 'normal' });
          return;
        }
        mapped[mid] = true;
        if (def.boss) issues.push({ regionId: entry.id, monsterId: mid, issue: 'normal-marked-boss' });
        if (def.tier !== entry.region.tier) issues.push({ regionId: entry.id, monsterId: mid, issue: 'tier-mismatch' });
      });
      if (entry.region.boss) {
        var bossDef = monsterById[entry.region.boss];
        if (!bossDef) missing.push({ regionId: entry.id, monsterId: entry.region.boss, role: 'boss' });
        else {
          mapped[bossDef.id] = true;
          if (!bossDef.boss) issues.push({ regionId: entry.id, monsterId: bossDef.id, issue: 'boss-not-marked' });
          if (bossDef.tier !== entry.region.tier) issues.push({ regionId: entry.id, monsterId: bossDef.id, issue: 'tier-mismatch' });
        }
      }
    });
    var unmapped = monsters.filter(function (def) { return !mapped[def.id]; }).map(function (def) { return def.id; });
    return {
      complete: missing.length === 0 && issues.length === 0 && unmapped.length === 0,
      regionCount: REGION_CATALOG.length,
      classCount: HERO_KINDS.length,
      monsterDefinitionCount: monsters.length,
      monsterOptionCount: REGION_CATALOG.reduce(function (sum, entry) { return sum + entry.units.length; }, 0),
      missing: missing,
      issues: issues,
      unmapped: unmapped,
      classes: HERO_KINDS.map(unitOptionSnapshot),
      regions: REGION_CATALOG.map(function (entry) {
        return {
          id: entry.id,
          tier: entry.region.tier,
          normal: entry.normal.map(unitOptionSnapshot),
          boss: entry.boss.map(unitOptionSnapshot)
        };
      })
    };
  }

  function selectionSnapshot() {
    var unit = currentUnit();
    return {
      regionId: currentRegionId,
      worldRegionId: Game.world.region && Game.world.region.id,
      group: currentGroup,
      unit: unitOptionSnapshot(unit)
    };
  }

  function selectUnit(id, regionId) {
    if (regionId && !REGION_CATALOG.some(function (entry) { return entry.id === regionId; })) return null;
    if (regionId) currentRegionId = regionId;
    var index = ALL_UNITS.findIndex(function (unit) {
      return unit.id === id && (!unit.regionId || !regionId || unit.regionId === regionId);
    });
    if (index < 0) return null;
    activateUnit(index);
    return selectionSnapshot();
  }

  D.init();
  Game.state = Game.State.newGame();
  Game.i18n.setLocale(D.locale());
  Game.state.world.regionOrder = Game.reg.ids('region');
  Game.state.settings.autoAdvance = false;
  Game.state.settings.autoEquip = false;
  Game.state.settings.autoCampRest = false;
  Game.state.settings.groundLoot = false;
  Game.state.settings.effects = true;
  Game.state.settings.expeditionStrategy = 'balanced';
  Game.render.init(document.getElementById('stage'));
  Game.unitsBubbleDemo = {
    show: function (type, anchor) {
      setBubbleAuto(false);
      return showBubble(type, anchor);
    },
    setAnchor: setBubbleAnchor,
    setAuto: setBubbleAuto,
    clear: function () {
      Game.actionBubbles.clear();
      updateBubbleQa();
    },
    snapshot: function () { return Game.actionBubbles.active(); },
    setScene: setBubbleScene,
    setWalkScene: setWalkBubbleScene,
    scene: function () { return bubbleScene; },
    walkScene: function () { return bubbleWalkScene; },
    layouts: function () { return Game.render.actionBubbleLayouts(); },
    catalog: catalogSnapshot,
    selection: selectionSnapshot,
    selectRegion: function (regionId) {
      return setRegion(regionId, currentGroup === 'hero') ? selectionSnapshot() : null;
    },
    selectUnit: selectUnit
  };
  bindControls();
  bindBattleEvents();
  paintBubbleControls();
  var initialParams = new URLSearchParams(location.search);
  var initialRegion = initialParams.get('region');
  var hasInitialRegion = REGION_CATALOG.some(function (entry) { return entry.id === initialRegion; });
  if (hasInitialRegion) currentRegionId = initialRegion;
  var initialUnit = initialParams.get('unit');
  var initialIndex = initialUnit ? ALL_UNITS.findIndex(function (unit) {
    return unit.id === initialUnit && (!unit.regionId || unit.regionId === currentRegionId);
  }) : 0;
  if (initialIndex < 0 && initialUnit && !hasInitialRegion) {
    initialIndex = ALL_UNITS.findIndex(function (unit) { return unit.id === initialUnit; });
  }
  activateUnit(initialIndex < 0 ? 0 : initialIndex);
  window.addEventListener('demo:locale', function () {
    activateUnit(currentIndex);
    paintBubbleControls();
  });
  requestAnimationFrame(frame);
})();
