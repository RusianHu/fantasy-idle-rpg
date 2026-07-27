/* global Game */
(function () {
  'use strict';

  var U = Game.util;
  var F = Game.F;
  var regions = Game.reg.all('region');
  var classes = Game.reg.all('class');
  var monsters = Game.reg.all('monster');
  var normalMonsters = monsters.filter(function (m) { return !m.boss; });
  var bossMonsters = monsters.filter(function (m) { return m.boss; });

  var HERO_KINDS = [
    { type: 'hero', id: 'fighter', sprite: 'hero_fighter', face: 'face_fighter', index: 0 },
    { type: 'hero', id: 'rogue',   sprite: 'hero_rogue',   face: 'face_rogue',   index: 1 },
    { type: 'hero', id: 'mage',    sprite: 'hero_mage',    face: 'face_mage',    index: 2 },
    { type: 'hero', id: 'cleric',  sprite: 'hero_cleric',  face: 'face_cleric',  index: 3 },
    { type: 'hero', id: 'ranger',  sprite: 'hero_ranger',  face: 'face_ranger',  index: 4 }
  ];
  var ALL_UNITS = [];
  HERO_KINDS.forEach(function (h) { ALL_UNITS.push(h); });
  normalMonsters.forEach(function (m, i) { ALL_UNITS.push({ type: 'monster', id: m.id, sprite: m.sprite || m.id, index: i }); });
  bossMonsters.forEach(function (m, i) { ALL_UNITS.push({ type: 'boss', id: m.id, sprite: m.sprite || m.id, index: i }); });

  var currentIndex = 0;
  var currentGroup = 'hero';
  var paused = false;
  var timeMode = 'cycle';
  var lastFrame = performance.now();
  var battleMessage = '等待战斗指令';
  var bubbleAnchor = 'hero';
  var bubbleAuto = true;
  var bubbleAutoT = 0.35;
  var bubbleSequence = 0;
  var bubbleDemoSeq = 0;
  var BUBBLE_LABELS = {
    resource: '资源', gather: '采集', enemy: '接敌',
    alert: '警戒', chest: '宝箱', loot: '掉落'
  };
  var AUTO_BUBBLES = [
    { hero: 'resource' },
    { hero: 'gather' },
    { hero: 'enemy', monster: 'alert' },
    { hero: 'chest' },
    { hero: 'loot' }
  ];

  function esc(value) { return U.esc(String(value)); }

  function className(id) {
    return Game.i18n.t('class.' + id + '.name');
  }

  function monsterName(id) {
    return Game.i18n.t('monster.' + id + '.name');
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

  function groupUnits(group) {
    return ALL_UNITS.filter(function (u) {
      if (group === 'hero') return u.type === 'hero';
      if (group === 'monster') return u.type === 'monster';
      return u.type === 'boss';
    });
  }

  function unitFor(group, index) {
    var list = groupUnits(group);
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

  function statRow(label, value, note) {
    return '<div class="config-row"><span>' + esc(label) + '</span><div>' + esc(value) +
      (note ? ' <span class="raw-id">' + esc(note) + '</span>' : '') + '</div></div>';
  }

  function fmtPct(v) { return (Math.round(v * 1000) / 10) + '%'; }

  function renderTabs() {
    var root = document.getElementById('inspector');
    var list = groupUnits(currentGroup);
    var tabs = document.createElement('div');
    tabs.className = 'unit-tabs';
    tabs.innerHTML = list.map(function (u) {
      var active = u === currentUnit() ? ' active' : '';
      var title = u.type === 'hero' ? className(u.id) : monsterName(u.id);
      var subtitle = u.type === 'hero' ? 'Lv.60' : ('T' + (Game.reg.get('monster', u.id).tier || '-' ));
      return '<button class="unit-tab' + active + '" type="button" data-global="' + ALL_UNITS.indexOf(u) + '"' +
        (active ? ' aria-current="page"' : '') + '>' +
        '<small>' + esc(subtitle) + '</small>' + esc(title) + '</button>';
    }).join('');
    root.insertBefore(tabs, root.firstChild);
  }

  function renderHeroInspector(unit) {
    var cls = Game.reg.get('class', unit.id);
    var d = F.playerBase(cls, 60);
    var preview = Game.player.previewDerived({ classId: unit.id, level: 60 });
    var skills = Game.reg.all('skill').filter(function (s) { return s.cls === unit.id; });
    var statRows =
      statRow('最大生命', preview.maxHp) +
      statRow('攻击', preview.atk) +
      statRow('防御', preview.def) +
      statRow('速度', preview.spd) +
      statRow('暴击率', fmtPct(preview.crit)) +
      statRow('暴击伤害', '×' + preview.critDmg.toFixed(2)) +
      statRow('攻击距离', cls.range + ' px') +
      statRow('弹道', cls.projectile || '无') +
      statRow('成长', 'HP×' + cls.grow.hp + ' / ATK×' + cls.grow.atk + ' / DEF×' + cls.grow.def);

    var skillRows = skills.map(function (s) {
      var kind = s.type === 'active' ? (s.kind || '主动') : '被动';
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
        '<div class="metric"><strong>' + d.atk + '</strong><span>裸攻 Lv.60</span></div>' +
        '<div class="metric"><strong>' + d.hp + '</strong><span>裸血 Lv.60</span></div>' +
        '<div class="metric"><strong>' + d.def + '</strong><span>裸防 Lv.60</span></div>' +
      '</div>' +
      '<section class="inspect-section"><h3>Lv.60 派生属性（含被动/装备位占位）</h3>' +
        '<div class="row-list">' + statRows + '</div>' +
      '</section>' +
      '<section class="inspect-section"><h3>职业技能</h3>' + skillRows + '</section>' +
      '<p class="note">派生属性按 Lv.60、无永久强化、三槽空位计算；右侧舞台中的主角会自动装备与等级匹配的占位装备并投入等额技能点。</p>';
  }

  function renderMonsterInspector(unit) {
    var def = Game.reg.get('monster', unit.id);
    var tier = def.tier || Game.State.regionTier(unit.id);
    var st = F.monsterStats(tier, def.mods, def.boss);
    var traits = def.boss ? trait('Boss', 'boss') + trait('讨伐目标', 'accent') : trait('普通怪');
    var region = regions.find(function (r) { return (def.boss ? r.boss : r.monsters.indexOf(unit.id)) >= 0; });

    var statRows =
      statRow('生命', st.hp) +
      statRow('攻击', st.atk) +
      statRow('防御', st.def) +
      statRow('速度', st.spd) +
      statRow('经验', st.exp) +
      statRow('金币', st.gold) +
      statRow('攻击间隔', F.atkInterval(st.spd).toFixed(2) + 's') +
      statRow('区域', region ? Game.i18n.t('region.' + region.id + '.name') : '-') +
      statRow('经典阶位', 'Tier ' + tier);

    document.getElementById('inspector').innerHTML =
      '<div class="inspector-header">' +
        '<h2>' + esc(monsterName(unit.id)) + '</h2>' +
        '<p>' + esc(Game.i18n.t('monster.' + unit.id + '.desc')) + '</p>' +
      '</div>' +
      '<div class="metric-grid">' +
        '<div class="metric"><strong>' + st.hp + '</strong><span>HP</span></div>' +
        '<div class="metric"><strong>' + st.atk + '</strong><span>ATK</span></div>' +
        '<div class="metric"><strong>' + st.def + '</strong><span>DEF</span></div>' +
      '</div>' +
      '<section class="inspect-section"><h3>' + (def.boss ? 'Boss' : '普通怪') + ' 面板</h3>' +
        spriteRow(unit.sprite, monsterName(unit.id), traits) +
        '<div class="row-list">' + statRows + '</div>' +
      '</section>' +
      '<p class="note">属性由 formulas.monsterStats 按区域经典阶位与变体系数推导；Boss 额外乘以 bossHp/bossAtk/bossDef。</p>';
  }

  function renderInspector() {
    var unit = currentUnit();
    if (unit.type === 'hero') renderHeroInspector(unit);
    else renderMonsterInspector(unit);

    Array.prototype.forEach.call(document.querySelectorAll('.sprite-preview, .skill-row canvas'), function (canvas) {
      Game.assets.drawToDom(canvas, canvas.getAttribute('data-sprite'), 'idle0');
    });
  }

  function updateHeader() {
    var unit = currentUnit();
    var title, subtitle;
    if (unit.type === 'hero') {
      title = className(unit.id);
      subtitle = 'class / ' + unit.id + ' · ' + unit.sprite;
    } else {
      title = monsterName(unit.id);
      subtitle = (unit.type === 'boss' ? 'boss' : 'monster') + ' / ' + unit.id + ' · ' + unit.sprite;
    }
    document.getElementById('stage-title').textContent = title;
    document.getElementById('stage-subtitle').textContent = subtitle;
    document.getElementById('stage-index').textContent = String(unit.index + 1).padStart(2, '0');
  }

  function setupStageForUnit(unit) {
    var region = regions[0];
    Game.state.world.region = region.id;
    Game.state.world.mode = 'battle';
    Game.state.world.deathsRow = 0;
    Game.state.settings.controlMode = 'auto';
    Game.world.init(region.id);

    Game.player.setClass(unit.type === 'hero' ? unit.id : 'fighter');
    var level = unit.type === 'hero' ? 60 : Math.max(1, (unit.type === 'boss' ? 70 : 55));
    Game.state.player.level = level;
    Game.state.player.exp = 0;
    Game.state.player.skills = {};
    Game.state.player.hp = 1;
    Game.player.recalc();

    var hero = Game.world.hero;
    hero.x = 200;
    hero.y = 280;
    hero.dir = 'r';
    hero.state = 'idle';
    hero.target = null;
    hero.moveOrder = null;
    hero.manualTarget = false;
    hero.campWarp = null;
    Game.nav.clear(hero);

    if (unit.type !== 'hero') {
      spawnSparring(unit.id, unit.type === 'boss');
    } else {
      clearSparring();
    }
    Game.state.player.hp = Game.state.derived.maxHp;
    Game.world.syncHeroStats();
    Game.render.snapCamera(hero.x, hero.y);
  }

  function clearSparring() {
    Game.world.entities = Game.world.entities.filter(function (e) { return e.kind === 'hero'; });
    Game.world.bossEnt = null;
    Game.world.cinematic = null;
  }

  function spawnSparring(mid, isBoss) {
    clearSparring();
    var ent = Game.world.makeMonster(mid, isBoss);
    ent.x = 620;
    ent.y = 290;
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
    return ent;
  }

  function bubbleMonster() {
    var monster = Game.world.entities.find(function (entity) {
      return entity.kind === 'monster' && !entity.dead && entity.hp > 0;
    });
    if (!monster) {
      var unit = currentUnit();
      var def = unit.type === 'hero' ? normalMonsters[0] : Game.reg.get('monster', unit.id);
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
      output.textContent = bubbleAuto ? '自动轮播 · 等待气泡' : '手动检查 · 当前无气泡';
      return;
    }
    output.textContent = active.map(function (bubble) {
      var anchorName = bubble.entityKind === 'monster' ? '怪物' : '主角';
      return anchorName + ' · ' + (BUBBLE_LABELS[bubble.type] || bubble.type);
    }).join(' / ');
  }

  function activateUnit(index) {
    currentIndex = (index + ALL_UNITS.length) % ALL_UNITS.length;
    var unit = currentUnit();
    currentGroup = unit.type === 'hero' ? 'hero' : (unit.type === 'boss' ? 'boss' : 'monster');
    setupStageForUnit(unit);
    bubbleAutoT = 0.2;
    updateHeader();
    renderInspector();
    setBattleEvent(unit.type === 'hero' ? className(unit.id) + '已入场' : monsterName(unit.id) + '已入场');
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
    document.getElementById('prev-unit').addEventListener('click', function () {
      var list = groupUnits(currentGroup);
      var local = list.indexOf(currentUnit());
      activateUnit(unitGlobalIndex(currentGroup, local - 1));
    });
    document.getElementById('next-unit').addEventListener('click', function () {
      var list = groupUnits(currentGroup);
      var local = list.indexOf(currentUnit());
      activateUnit(unitGlobalIndex(currentGroup, local + 1));
    });
    document.getElementById('toggle-play').addEventListener('click', function () {
      paused = !paused;
      this.textContent = paused ? '▶' : 'Ⅱ';
      this.title = paused ? '继续演示' : '暂停演示';
      this.setAttribute('aria-label', this.title);
      document.getElementById('runtime-status').textContent = paused ? '战斗循环已暂停' : '原版战斗循环运行中';
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
        var list = normalMonsters;
        var pick = list[Math.floor(Math.random() * list.length)];
        spawnSparring(pick.id, false);
        setBattleEvent('已刷新普通陪练：' + monsterName(pick.id));
      } else {
        spawnSparring(unit.id, unit.type === 'boss');
        setBattleEvent('已刷新：' + monsterName(unit.id));
      }
    });
    document.getElementById('spawn-boss').addEventListener('click', function () {
      var pick = bossMonsters[Math.floor(Math.random() * bossMonsters.length)];
      spawnSparring(pick.id, true);
      setBattleEvent('已召唤 Boss：' + monsterName(pick.id));
    });
    document.getElementById('toggle-control').addEventListener('click', function () {
      Game.world.toggleControlMode();
    });
    document.getElementById('reset-hero').addEventListener('click', function () {
      var hero = Game.world.hero;
      if (!hero) return;
      hero.x = 200;
      hero.y = 280;
      hero.dir = 'r';
      hero.state = 'idle';
      hero.target = null;
      hero.moveOrder = null;
      hero.manualTarget = false;
      hero.hp = Game.state.derived.maxHp;
      Game.nav.clear(hero);
      Game.render.snapCamera(hero.x, hero.y);
      setBattleEvent('主角已重置');
    });
    document.getElementById('inspector').addEventListener('click', function (event) {
      var button = event.target.closest('[data-global]');
      if (!button) return;
      activateUnit(Number(button.getAttribute('data-global')));
    });
    window.addEventListener('keydown', function (event) {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
      if (event.key === '[') activateUnit(currentIndex - 1);
      if (event.key === ']') activateUnit(currentIndex + 1);
    });
  }

  function bindBattleEvents() {
    Game.bus.on('combat:hit', function (p) {
      if (p.from === 'hero') setBattleEvent('命中 · ' + (p.crit ? '暴击' : '普攻'));
    });
    Game.bus.on('combat:miss', function () { setBattleEvent('闪避'); });
    Game.bus.on('monster:killed', function (p) {
      setBattleEvent('击败 · ' + monsterName(p.mid) + (p.boss ? ' (Boss)' : ''));
    });
    Game.bus.on('player:death', function () { setBattleEvent('主角阵亡，正在重整'); });
    Game.bus.on('boss:spawned', function (p) { setBattleEvent('Boss 登场 · ' + monsterName(p.mid)); });
    Game.bus.on('control:changed', function (p) {
      document.getElementById('control-runtime').textContent = p.mode === 'manual' ? '手动' : '自动';
    });
  }

  function updateBattleQa() {
    var hero = Game.world.hero;
    var target = hero ? hero.target : null;
    var targetName = target ? (target.boss ? 'Boss ' : '') + monsterName(target.mid) : '无';
    var rt = document.getElementById('target-runtime');
    if (rt) rt.textContent = targetName;
    var hr = document.getElementById('hero-runtime');
    if (hr && hero) hr.textContent = hero.state;
    var cr = document.getElementById('control-runtime');
    if (cr) cr.textContent = Game.world.controlMode() === 'manual' ? '手动' : '自动';
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

  Game.i18n.setLocale('zh-CN');
  Game.state = Game.State.newGame();
  Game.state.world.regionOrder = Game.reg.ids('region');
  Game.state.settings.autoAdvance = false;
  Game.state.settings.autoEquip = false;
  Game.state.settings.autoCampRest = false;
  Game.state.settings.groundLoot = false;
  Game.state.settings.effects = true;
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
    snapshot: function () { return Game.actionBubbles.active(); }
  };
  bindControls();
  bindBattleEvents();
  paintBubbleControls();
  activateUnit(0);
  requestAnimationFrame(frame);
})();
