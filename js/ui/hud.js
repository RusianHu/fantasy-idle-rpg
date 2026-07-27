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
        tradeLabel: $('#trade-button-label')
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

      bus.on('mode:changed', function () { Hud.hud.update(true); });
      bus.on('control:changed', function () { Hud.hud.update(true); });
      bus.on('locale:changed', function () { Hud.hud.update(true); });
      bus.on('region:changed', function () { Hud.hud.update(true); });
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
      var d = Game.player.derived();

      els.level.textContent = p.level;
      var hpPct = U.clamp(p.hp / d.maxHp * 100, 0, 100);
      els.hpFill.style.width = hpPct + '%';
      els.hpText.textContent = fmt(Math.ceil(p.hp)) + ' / ' + fmt(d.maxHp);
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
        els.gauge.classList.add('hidden');
        els.gauge.classList.remove('resting', 'full');
        els.bossBar.classList.remove('hidden');
        els.bossName.textContent = t('monster.' + boss.mid + '.name');
        els.bossFill.style.width = U.clamp(boss.hp / boss.maxHp * 100, 0, 100) + '%';
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
      var lowHp = mode === 'battle' && p.hp > 0 && hpPct / 100 <= s.settings.potionThreshold;
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
    }
  };
})();
