/* ============================================================
 * ui/hud.js — 顶部状态栏 + 战斗覆盖层（区域名/讨伐条/Boss条/扎营钮）
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;
  var $ = U.$;

  var els = {};
  var throttle = 0;
  var campIcon = '';
  var controlIcon = '';
  var potionIcon = '';

  function defName(type, id, fallback) {
    var def = Game.content.get(type, id);
    var key = def && def.presentation && def.presentation.nameKey;
    return key ? Game.i18n.t(key) : (fallback || id || '');
  }

  function actorName(actor, t) {
    if (!actor) return '';
    if (actor.actorRecordId) {
      return t('class.' + (Game.state.player.classId || 'fighter') + '.name');
    }
    var archetype = actor.blueprint &&
      Game.content.get('actorArchetype', actor.blueprint.archetypeId);
    return archetype && archetype.identity && archetype.identity.nameKey
      ? t(archetype.identity.nameKey)
      : actor.id;
  }

  function updateCombatV2() {
    var root = els.combatV2;
    var hero = Game.world && Game.world.hero;
    var encounter = hero && hero.encounterId && Game.encounters.get(hero.encounterId);
    if (!root) return;
    root.classList.toggle('hidden', !encounter || encounter.lifecycle !== 'active');
    if (!encounter || encounter.lifecycle !== 'active') return;
    var tick = encounter.tick;
    var t = Game.i18n.t;
    var allies = encounter.participants.map(Game.actors.get).filter(function (actor) {
      return actor && actor.teamId === hero.teamId;
    }).slice(0, 4);
    els.combatPartyMembers.innerHTML = allies.map(function (actor) {
      var hp = Game.units.vitals(actor);
      var pct = U.clamp(hp.hpPct * 100, 0, 100);
      var name = actorName(actor, t);
      return '<div class="combat-v2-member"><b>' + U.esc(name) + '</b><span>' +
        Math.ceil(hp.hp) + '/' + Math.ceil(hp.maxHp) +
        '</span><i style="--hp:' + pct + '%"></i></div>';
    }).join('');
    var portraitAlly = allies.filter(function (actor) { return actor.id === hero.id; })[0] || allies[0];
    var allyName = actorName(portraitAlly, t);
    Game.ui.combatPortraits.draw(
      els.combatPartyPortrait,
      portraitAlly,
      t('combat.ui.allyPortrait', { name: allyName })
    );

    var action = hero.components.actionState;
    els.combatActionName.textContent = action.abilityId
      ? defName('ability', action.abilityId) : t('combat.ui.ready');
    var actionSpan = Math.max(1, action.resolvesTick - action.startedTick);
    var actionPct = action.state === 'casting' || action.state === 'channeling'
      ? U.clamp((tick - action.startedTick) / actionSpan * 100, 0, 100)
      : (action.state === 'recovering' ? 100 : 0);
    els.combatActionFill.style.width = actionPct + '%';
    var gcdReady = hero.components.cooldowns.groups.gcd || 0;
    els.combatGcd.textContent = gcdReady > tick
      ? t('combat.ui.gcd', { s: ((gcdReady - tick) * encounter.rules.tickMs / 1000).toFixed(1) })
      : t('combat.ui.gcdReady');

    var resources = Object.keys(hero.components.resources || {}).map(function (id) {
      return hero.components.resources[id];
    });
    var resource = resources[0];
    els.combatResourceName.textContent = resource
      ? t('combat.resource.' + resource.id + '.name') + ' ' + Math.floor(resource.value) + '/' + resource.max
      : t('combat.ui.noResource');
    els.combatResourceFill.style.width = resource
      ? U.clamp(resource.value / Math.max(1, resource.max) * 100, 0, 100) + '%' : '0%';
    var combo = hero.components.comboState;
    els.combatCombo.textContent = combo && combo.step
      ? t('combat.ui.combo', { n: combo.step }) : '';
    els.combatStatuses.innerHTML = (hero.components.statuses || []).slice(0, 5).map(function (status) {
      return '<span title="' + status.statusId + '">' + defName('status', status.statusId) +
        ' ' + Math.max(0, Math.ceil((status.expiresTick - tick) * encounter.rules.tickMs / 1000)) + 's</span>';
    }).join('');

    var enemies = encounter.participants.map(Game.actors.get).filter(function (actor) {
      return actor && actor.teamId !== hero.teamId && actor.hp > 0;
    }).sort(function (a, b) {
      var ap = a.id === hero.components.targeting.priorityTargetId ? 1 : 0;
      var bp = b.id === hero.components.targeting.priorityTargetId ? 1 : 0;
      var ac = a.components.actionState.state === 'casting' ? 1 : 0;
      var bc = b.components.actionState.state === 'casting' ? 1 : 0;
      return bp - ap || bc - ac || a.id.localeCompare(b.id);
    });
    var enemy = enemies[0];
    var enemyName = actorName(enemy, t);
    els.combatEnemyName.textContent = enemyName;
    if (enemy) {
      Game.ui.combatPortraits.draw(
        els.combatEnemyPortrait,
        enemy,
        t('combat.ui.enemyPortrait', { name: enemyName })
      );
      var enemyAction = enemy.components.actionState;
      var enemyAbility = enemyAction.abilityId &&
        Game.actors.ability(enemy, enemyAction.abilityId);
      var canInterrupt = enemyAction.state === 'casting' && enemyAbility &&
        (!enemyAbility.timing || enemyAbility.timing.interruptible !== false);
      els.combatEnemyCast.textContent = enemyAction.abilityId
        ? defName('ability', enemyAction.abilityId) +
          (canInterrupt ? ' · ' + t('combat.ui.interruptible') : '')
        : t('combat.ui.enemyReady');
      var enemySpan = Math.max(1, enemyAction.resolvesTick - enemyAction.startedTick);
      var enemyPct = enemyAction.state === 'casting'
        ? U.clamp((tick - enemyAction.startedTick) / enemySpan * 100, 0, 100) : 0;
      els.combatEnemyCastFill.style.width = enemyPct + '%';
    } else {
      Game.ui.combatPortraits.clear(els.combatEnemyPortrait);
      els.combatEnemyCast.textContent = '';
      els.combatEnemyCastFill.style.width = '0%';
    }
    var phases = Object.keys(encounter.phaseTriggered || {});
    els.combatPhase.textContent = phases.length
      ? t('combat.ui.phase', { n: phases.length + 1 }) : '';
    var telegraph = encounter.telegraphs.slice().sort(function (a, b) {
      return a.resolveTick - b.resolveTick || a.id.localeCompare(b.id);
    })[0];
    els.combatTelegraph.textContent = telegraph
      ? t('combat.ui.telegraph', {
          ability: defName('ability', telegraph.abilityId),
          s: Math.max(0, (telegraph.resolveTick - tick) * encounter.rules.tickMs / 1000).toFixed(1)
        })
      : '';
    els.combatTelegraph.classList.toggle('danger', !!telegraph);
    var strategy = Game.state.settings.combatStrategy || 'balanced';
    els.combatStrategy.setAttribute('aria-label', t('combat.ui.strategyGroup'));
    els.combatStrategyButtons.forEach(function (button) {
      var id = button.getAttribute('data-combat-strategy');
      button.textContent = t('combat.strategy.' + id);
      button.classList.toggle('active', id === strategy);
      button.setAttribute('aria-pressed', id === strategy ? 'true' : 'false');
    });
    els.combatTactics.textContent = t('combat.ui.tactics');
    els.combatTactics.setAttribute('aria-label', t('combat.ui.tactics'));
  }

  var Hud = Game.ui = Game.ui || {};
  Hud.hud = {
    init: function () {
      els = {
        level: $('#hud-level'),
        hpFill: $('#hud-hp-fill'), hpText: $('#hud-hp-text'),
        expFill: $('#hud-exp-fill'), expText: $('#hud-exp-text'),
        gold: $('#hud-gold'), crystal: $('#hud-crystal'),
        battleOverlay: $('#battle-overlay'),
        regionChip: $('#region-chip'),
        regionKicker: $('#region-kicker'),
        regionName: $('#region-name'),
        gauge: $('#hunt-gauge'), gaugeFill: $('#hunt-fill'), gaugeText: $('#hunt-text'),
        huntActions: $('#hunt-actions'),
        btnBossHunt: $('#btn-boss-hunt'),
        bossHuntIcon: $('#boss-hunt-icon'),
        bossHuntLabel: $('#boss-hunt-label'),
        autoBossSwitch: $('#auto-boss-switch'),
        autoBossLabel: $('#auto-boss-label'),
        bossBar: $('#boss-bar'), bossName: $('#boss-name'), bossFill: $('#boss-hp-fill'),
        buffChips: $('#buff-chips'),
        expeditionHud: $('#expedition-hud'),
        expeditionStrategy: $('#expedition-strategy'),
        expeditionStrategyIcon: $('#expedition-strategy-icon'),
        expeditionStrategyLabel: $('#expedition-strategy-label'),
        expeditionIntentLabel: $('#expedition-intent-label'),
        expeditionIntentTarget: $('#expedition-intent-target'),
        expeditionReadinessLabel: $('#expedition-readiness-label'),
        expeditionReadinessValue: $('#expedition-readiness-value'),
        controlSwitch: $('#control-switch'),
        controlIcon: $('#control-mode-icon'),
        controlTitle: $('#control-title'),
        controlModeLabel: $('#control-mode-label'),
        btnCamp: $('#btn-camp'),
        campIcon: $('#camp-action-icon'),
        campLabel: $('#camp-action-label'),
        btnPotion: $('#btn-potion'),
        potionIcon: $('#quick-potion-icon'),
        potionLabel: $('#quick-potion-label'),
        potionCount: $('#quick-potion-count'),
        potionCd: $('#quick-potion-cd'),
        btnTrade: $('#btn-trade'),
        tradeLabel: $('#trade-button-label'),
        combatV2: $('#combat-v2-hud'),
        combatPartyMembers: $('#combat-v2-party-members'),
        combatPartyPortrait: $('#combat-v2-party-portrait'),
        combatActionName: $('#combat-v2-action-name'),
        combatActionFill: $('#combat-v2-action-fill'),
        combatGcd: $('#combat-v2-gcd'),
        combatResourceName: $('#combat-v2-resource-name'),
        combatResourceFill: $('#combat-v2-resource-fill'),
        combatCombo: $('#combat-v2-combo'),
        combatStatuses: $('#combat-v2-statuses'),
        combatEnemyName: $('#combat-v2-enemy-name'),
        combatEnemyCast: $('#combat-v2-enemy-cast'),
        combatEnemyCastFill: $('#combat-v2-enemy-cast-fill'),
        combatEnemyPortrait: $('#combat-v2-enemy-portrait'),
        combatPhase: $('#combat-v2-phase'),
        combatTelegraph: $('#combat-v2-telegraph'),
        combatStrategy: $('#combat-v2-strategy'),
        combatStrategyButtons: Array.prototype.slice.call(document.querySelectorAll('[data-combat-strategy]')),
        combatTactics: $('#combat-v2-tactics')
      };

      Hud.hud.drawAvatar();
      Game.assets.drawToDom($('#icon-gold'), 'icon_gold', 'icon');
      Game.assets.drawToDom($('#icon-crystal'), 'icon_crystal', 'icon');
      Game.assets.drawToDom(els.bossHuntIcon, 'icon_boss_hunt', 'icon');

      els.expeditionStrategy.addEventListener('click', function () {
        var order = ['safe', 'balanced', 'loot'];
        var at = order.indexOf(Game.expeditionAI.strategy());
        Game.expeditionAI.setStrategy(order[(at + 1) % order.length]);
        Hud.hud.update(true);
      });

      els.btnBossHunt.addEventListener('click', function () {
        var layout = Game.world.layout;
        if (layout && layout.version >= 3 && Game.exploration) {
          var readiness = Game.exploration.readiness(Game.state.world.region);
          if (!readiness.lair || readiness.total < 70) {
            Game.ui.tabs.open('map');
            return;
          }
        }
        if (!Game.world.trySpawnBoss({ manual: true }) && Game.ui.modals) {
          var gi = Game.world.gaugeInfo();
          Game.ui.modals.toast(Game.i18n.t(
            gi.kills < gi.target ? 'ui.bossHuntLocked' : 'ui.bossHuntBusy',
            { n: Math.max(0, gi.target - gi.kills) }
          ), 'warn');
        }
        Hud.hud.update(true);
      });
      els.autoBossSwitch.addEventListener('click', function () {
        var enabled = Game.state.settings.autoBoss === false;
        Game.state.settings.autoBoss = enabled;
        bus.emit('settings:changed', { key: 'autoBoss', value: enabled });
        if (enabled) Game.world.trySpawnBoss();
        if (Game.ui.modals) {
          Game.ui.modals.toast(Game.i18n.t(enabled ? 'ui.autoBossOn' : 'ui.autoBossOff'));
        }
        Hud.hud.update(true);
      });
      els.btnCamp.addEventListener('click', function () {
        var mode = Game.state.world.mode;
        Game.world.setMode(mode === 'rest' ? 'battle' : 'rest');
        Hud.hud.update(true);
      });
      els.controlSwitch.addEventListener('click', function () {
        var mode = Game.world.toggleControlMode();
        if (Game.ui.modals && Game.ui.modals.toast) {
          Game.ui.modals.toast(Game.i18n.t(
            mode === 'manual' ? 'ui.controlChangedManual' : 'ui.controlChangedAuto'
          ));
        }
        Hud.hud.update(true);
      });
      els.btnPotion.addEventListener('click', function () {
        var pid = Game.inv.potionCount('potion_small') > 0
          ? 'potion_small'
          : 'potion_large';
        var result = Game.items.use('potion', pid, { source: 'manual' });
        if (!result.ok) {
          Game.ui.modals.toast(Game.i18n.t('item.reject.' + result.reason, {
            s: result.left ? Math.ceil(result.left) : 0
          }), 'warn');
        }
        Hud.hud.update(true);
      });
      els.btnTrade.addEventListener('click', function () {
        var context = Game.trade.current();
        if (context.available) Game.ui.trade.open(context.areaId);
      });
      els.combatStrategyButtons.forEach(function (button) {
        button.addEventListener('click', function () {
          var strategy = button.getAttribute('data-combat-strategy');
          Game.state.settings.combatStrategy = strategy;
          if (Game.world.hero) Game.combatAI.strategy(Game.world.hero.id, strategy);
          bus.emit('settings:changed', { key: 'combatStrategy', value: strategy });
          Hud.hud.update(true);
        });
      });
      els.combatTactics.addEventListener('click', function () {
        Game.ui.tabs.open('settings');
      });

      bus.on('mode:changed', function () { Hud.hud.update(true); });
      bus.on('control:changed', function () { Hud.hud.update(true); });
      bus.on('locale:changed', function () { Hud.hud.update(true); });
      bus.on('region:changed', function () { Hud.hud.update(true); });
      bus.on('weather:changed', function () { Hud.hud.update(true); });
      bus.on('boss:spawned', function () { Hud.hud.update(true); });
      bus.on('boss:failed', function () { Hud.hud.update(true); });
      bus.on('boss:defeated', function () { Hud.hud.update(true); });
      bus.on('class:chosen', function () { Hud.hud.drawAvatar(); Hud.hud.update(true); });
      bus.on('trade:contextChanged', function () { Hud.hud.update(true); });
      bus.on('item:used', function () { Hud.hud.update(true); });
      bus.on('potion:dropped', function () { Hud.hud.update(true); });
      bus.on('camp:autoReturn', function () {
        if (Game.ui.modals) Game.ui.modals.toast(Game.i18n.t('ui.autoCampReturning'));
        Hud.hud.update(true);
      });
      bus.on('readiness:changed', function () { Hud.hud.update(true); });
      bus.on('ai:intentChanged', function () { Hud.hud.update(true); });
      bus.on('ai:strategyChanged', function () { Hud.hud.update(true); });

      Hud.hud.update(true);
    },

    drawAvatar: function () {
      var cid = Game.player.hasClass() ? Game.state.player.classId : 'fighter';
      Game.assets.drawToDom($('#avatar-canvas'), 'face_' + cid, 'icon');
    },

    /** 每帧节流刷新 */
    tick: function (dt) {
      throttle -= dt;
      if (throttle <= 0) {
        throttle = 0.2;
        Hud.hud.update();
      }
    },

    update: function (force) {
      var s = Game.state;
      if (!s) return;
      var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
      var p = s.player;
      var playerVitals = Game.units.playerSnapshot();

      els.level.textContent = p.level;
      var hpPct = U.clamp(playerVitals.hpPct * 100, 0, 100);
      els.hpFill.style.width = hpPct + '%';
      els.hpText.textContent = fmt(Math.ceil(playerVitals.hp)) + ' / ' +
        fmt(Math.ceil(playerVitals.maxHp));
      var need = Game.F.expNeed(p.level);
      els.expFill.style.width = U.clamp(p.exp / need * 100, 0, 100) + '%';
      els.expText.textContent = 'EXP ' + fmt(p.exp) + ' / ' + fmt(need);
      els.gold.textContent = fmt(p.gold);
      els.crystal.textContent = fmt(p.crystal);

      // 战斗覆盖层
      var W = Game.world;
      if (!W.region) return;
      var mode = s.world.mode;
      var tier = Game.State.regionTier(W.region.id);
      var routeSize = Game.State.regionOrder().length;

      els.battleOverlay.classList.toggle('camp-mode', mode === 'rest');
      els.regionKicker.textContent = t(mode === 'rest' ? 'ui.campKicker' : 'ui.regionKicker', {
        n: tier,
        total: routeSize
      });
      els.regionName.textContent = t('region.' + W.region.id + '.name');

      // 世界舞台自动 / 手动操控开关
      var controlMode = W.controlMode();
      var manual = controlMode === 'manual';
      var controlText = t(manual ? 'ui.controlManual' : 'ui.controlAuto');
      els.controlTitle.textContent = t('ui.controlTitle');
      els.controlModeLabel.textContent = controlText;
      els.controlSwitch.classList.toggle('manual', manual);
      els.controlSwitch.setAttribute('aria-checked', manual ? 'true' : 'false');
      els.controlSwitch.setAttribute('aria-label', t('ui.controlAria', { mode: controlText }));
      els.controlSwitch.title = t(manual ? 'ui.controlManualHint' : 'ui.controlAutoHint');
      var nextControlIcon = manual ? 'icon_control_manual' : 'icon_control_auto';
      if (controlIcon !== nextControlIcon || force) {
        Game.assets.drawToDom(els.controlIcon, nextControlIcon, 'icon');
        controlIcon = nextControlIcon;
      }

      var gi = W.gaugeInfo();
      var boss = W.bossEnt;
      var v3 = W.layout && W.layout.version >= 3 && Game.exploration;

      els.expeditionHud.classList.toggle('hidden', !v3 || mode === 'rest');
      if (v3) {
        var strategy = Game.expeditionAI.strategy();
        var intent = Game.expeditionAI.intent();
        var readiness = gi.readiness;
        Game.assets.drawToDom(els.expeditionStrategyIcon, 'icon_strategy_' + strategy, 'icon');
        els.expeditionStrategyLabel.textContent = t('explore.strategy.' + strategy);
        els.expeditionStrategy.setAttribute('aria-label', t('explore.strategyAria', {
          strategy: t('explore.strategy.' + strategy)
        }));
        els.expeditionIntentLabel.textContent = t('explore.aiIntent');
        els.expeditionIntentTarget.textContent = t('explore.intent.' + (intent.id || 'idle')) +
          (intent.distance > 1 ? ' · ' + Math.round(intent.distance) + 'm' : '');
        els.expeditionReadinessLabel.textContent = t('explore.readiness');
        els.expeditionReadinessValue.textContent = readiness.total + '/100';
        els.expeditionReadinessValue.classList.toggle('ready', readiness.total >= 70 && readiness.lair);
      }

      // 讨伐条下方的紧凑 Boss 操作组：自动讨伐默认开启，关闭后满进度待命。
      var autoBoss = s.settings.autoBoss !== false;
      var bossReady = mode === 'battle' && !boss && (v3
        ? gi.readiness.total >= 70 && gi.readiness.lair
        : gi.kills >= gi.target) &&
        W.hero && W.hero.state !== 'dead' && W.hero.state !== 'recover' &&
        (!Game.transitions || !Game.transitions.isActive());
      els.huntActions.classList.toggle('hidden', !!boss || mode === 'rest');
      var bossActionKey = !v3 ? 'ui.bossHunt'
        : (!gi.readiness.lair ? 'explore.searchClues'
          : (gi.readiness.total < 70 ? 'explore.viewReadiness'
            : (U.dist(W.hero.x, W.hero.y, W.layout.bossPoint.x, W.layout.bossPoint.y) > 74
              ? 'explore.goLair' : 'explore.challengeBoss')));
      els.bossHuntLabel.textContent = t(bossActionKey);
      els.btnBossHunt.disabled = v3 ? false : !bossReady;
      els.btnBossHunt.classList.toggle('ready', bossReady);
      els.btnBossHunt.setAttribute('aria-label', t(bossActionKey));
      els.btnBossHunt.title = bossReady
        ? t('ui.bossHuntReady')
        : t(v3 ? 'explore.readinessHint' : (gi.kills < gi.target ? 'ui.bossHuntLocked' : 'ui.bossHuntBusy'), {
          n: Math.max(0, (gi.required || gi.target) - gi.kills),
          value: gi.readiness ? gi.readiness.total : gi.kills
        });
      els.autoBossLabel.textContent = t('ui.autoBossShort');
      els.autoBossSwitch.classList.toggle('on', autoBoss);
      els.autoBossSwitch.setAttribute('aria-checked', autoBoss ? 'true' : 'false');
      els.autoBossSwitch.setAttribute('aria-label', t('ui.autoBossAria', {
        state: t(autoBoss ? 'ui.switchOn' : 'ui.switchOff')
      }));
      els.autoBossSwitch.title = t('ui.autoBossHint');

      if (boss) {
        var bossVitals = Game.units.vitals(boss);
        els.gauge.classList.add('hidden');
        els.gauge.classList.remove('resting', 'full');
        els.bossBar.classList.remove('hidden');
        els.bossName.textContent = t('monster.' + boss.mid + '.name');
        els.bossFill.style.width = U.clamp(bossVitals.hpPct * 100, 0, 100) + '%';
      } else {
        els.gauge.classList.remove('hidden');
        els.bossBar.classList.add('hidden');
        var restPct = U.clamp(s.world.restBuffT / Game.F.BAL.restBuffCap * 100, 0, 100);
        var gaugePct = mode === 'rest' ? restPct : gi.kills / gi.target * 100;
        els.gaugeFill.style.width = gaugePct + '%';
        els.gaugeText.textContent = mode === 'rest'
          ? t('ui.restGauge', { p: Math.floor(restPct) })
          : (v3 ? t('explore.readiness') : t('ui.huntGauge')) + ' ' + gi.kills + '/' + gi.target;
        els.gauge.classList.toggle('resting', mode === 'rest');
        els.gauge.classList.toggle('full', mode === 'rest' ? restPct >= 100 :
          (v3 ? gi.kills >= 70 && gi.lair : gi.kills >= gi.target));
      }

      // 返回营地按钮：距离、传送阶段与 Boss 撤离均有独立表达。
      var campAction = W.campActionState();
      var campText = t(campAction.label);
      els.campLabel.textContent = campText;
      els.btnCamp.setAttribute('aria-label', campText);
      els.btnCamp.title = t(campAction.hint);
      els.btnCamp.setAttribute('data-action', campAction.id);
      els.btnCamp.classList.toggle('is-warping', campAction.id === 'cancel-warp');
      els.btnCamp.classList.toggle('boss-retreat', campAction.id === 'boss-retreat');
      var lowHp = mode === 'battle' && playerVitals.hp > 0 &&
        playerVitals.hpPct <= s.settings.potionThreshold;
      els.btnCamp.classList.toggle('low-hp', lowHp);
      if (campIcon !== campAction.icon || force) {
        Game.assets.drawToDom(els.campIcon, campAction.icon, 'icon');
        campIcon = campAction.icon;
      }

      // 主动用药快捷入口：自动优先序下一瓶、数量与共享冷却。
      var nextPotion = Game.inv.potionCount('potion_small') > 0
        ? 'potion_small'
        : 'potion_large';
      var potionCount = Game.inv.potionCount(nextPotion);
      var potionCd = Game.items.cdLeft('potion');
      var nextIcon = nextPotion === 'potion_small' ? 'icon_potion_small' : 'icon_potion_large';
      if (potionIcon !== nextIcon || force) {
        Game.assets.drawToDom(els.potionIcon, nextIcon, 'icon');
        potionIcon = nextIcon;
      }
      els.potionLabel.textContent = t('ui.quickPotion');
      els.potionCount.textContent = '×' + potionCount;
      els.potionCd.textContent = potionCd > 0 ? Math.ceil(potionCd) + 's' : '';
      els.btnPotion.disabled = false;
      els.btnPotion.classList.toggle('empty', potionCount <= 0);
      els.btnPotion.setAttribute('aria-disabled', potionCount <= 0 ? 'true' : 'false');
      els.btnPotion.classList.toggle('cooling', potionCd > 0);
      els.btnPotion.classList.toggle('low-hp', lowHp);
      els.btnPotion.setAttribute('aria-label', t('item.quickAria', {
        name: t('item.' + nextPotion + '.name'),
        count: potionCount,
        cd: potionCd > 0 ? Math.ceil(potionCd) : 0
      }));
      els.btnPotion.title = potionCount > 0 ? t('item.quickHint') : t('item.reject.empty');
      var itemCooldowns = document.querySelectorAll('.item-use-cd[data-cd-group]');
      for (var ci = 0; ci < itemCooldowns.length; ci++) {
        var cdEl = itemCooldowns[ci];
        var group = cdEl.getAttribute('data-cd-group');
        var maxCd = Number(cdEl.getAttribute('data-cd-max')) || 1;
        cdEl.style.setProperty('--cd', U.clamp(Game.items.cdLeft(group) / maxCd, 0, 1));
      }

      // 进入交易域才显示上下文入口；不改变挂机行为。
      var tradeContext = Game.trade.current();
      els.btnTrade.classList.toggle('hidden', !tradeContext.available);
      if (tradeContext.available) {
        var tradeName = tradeContext.nameKey ? t(tradeContext.nameKey) : t('tradeArea.generic');
        els.tradeLabel.textContent = t('ui.tradeHud', { name: tradeName });
        els.btnTrade.setAttribute('aria-label', t('ui.tradeHudAria', { name: tradeName }));
      }

      // 增益 chips
      var chips = '';
      var currentWeather = Game.weather && Game.weather.current
        ? Game.weather.current() : null;
      if (currentWeather) {
        var weatherKind = currentWeather.kind === 'storm' || currentWeather.kind === 'blizzard'
          ? 'storm' : currentWeather.precipitation.type;
        if (currentWeather.fogDensity > 0.45 && ['rain', 'snow'].indexOf(weatherKind) < 0) {
          weatherKind = 'fog';
        }
        chips += '<div class="buff-chip weather-chip" aria-label="' +
          U.esc(t('weather.label') + '：' + t(currentWeather.stateNameKey)) + '">' +
          '<span class="weather-mark weather-' + U.esc(weatherKind) + '" aria-hidden="true"></span>' +
          U.esc(t(currentWeather.stateNameKey)) + '</div>';
      }
      var hero = W.hero;
      if (hero && hero.shield > 0) {
        chips += '<div class="buff-chip shield"><span class="buff-chip-mark"></span>' +
          Game.i18n.fmtNum(Math.ceil(hero.shield)) + '</div>';
      }
      if (hero && hero.buffs && hero.buffs.length) {
        for (var bi = 0; bi < hero.buffs.length; bi++) {
          var bf = hero.buffs[bi];
          chips += '<div class="buff-chip">' + t('skill.' + bf.sid + '.name') + ' ' + Math.ceil(bf.t) + 's</div>';
        }
      }
      if (s.world.restBuffT > 0) {
        chips += '<div class="buff-chip rested"><span class="buff-chip-mark"></span>' +
          t('ui.restBuff') + ' ' + Game.i18n.fmtDur(s.world.restBuffT) + '</div>';
      }
      if (mode === 'rest') {
        chips += '<div class="buff-chip rest"><span class="buff-chip-mark"></span>' + t('ui.restingChip') + '</div>';
      }
      if (hero && hero.state === 'recover') {
        chips += '<div class="buff-chip rest">' + t('ui.recovering', { s: Math.ceil(hero.recoverT) }) + '</div>';
      }
      if (els.buffChips.innerHTML !== chips) els.buffChips.innerHTML = chips;
      updateCombatV2();
    }
  };
})();
