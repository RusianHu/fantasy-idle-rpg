/* ============================================================
 * ui/modals.js — 弹窗：序章 / 离线结算 / 装备详情对比 / 确认 / Toast
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus, reg = Game.reg;

  var root = null;
  var deferredToasts = [];
  var activePauseModals = [];

  function removePauseModal(handle) {
    var index = activePauseModals.indexOf(handle);
    if (index >= 0) activePauseModals.splice(index, 1);
  }

  function maintainPauseModal(handle) {
    if (!handle || handle.closed) return false;
    if (!handle.mask || !handle.mask.isConnected) {
      handle.close('disconnected');
      return false;
    }
    var pause = handle.pause;
    var valid = true;
    if (pause.guard) {
      try { valid = pause.guard() !== false; }
      catch (e) { valid = false; }
    }
    if (!valid) {
      handle.close('invalid');
      return false;
    }
    if (!Game.interactions || !Game.interactions.acquirePause) return false;
    var context = typeof pause.context === 'function'
      ? pause.context() : pause.context;
    Game.interactions.acquirePause(pause.id, {
      kind: pause.kind || 'modal-interaction',
      scopes: pause.scopes || ['autoExplore'],
      ttl: pause.ttl,
      context: context || null
    });
    return true;
  }

  /* 移动行商交互链共享的有效性校验：第一层 actorActions、攻击二次确认
   * 与交谈窗口都复用同一份 guard，避免各处对“事件仍可用 / Actor 仍存活 /
   * 玩家未进战斗”的判断漂移。仅持有 autoExplore 有限暂停。 */
  function merchantGuard(actor, profileId) {
    return function () {
      var active = Game.merchants && Game.merchants.activeEvent();
      var hero = Game.world && Game.world.hero;
      if (!active || active.state !== 'available') return false;
      if (!actor) return false;
      var liveActor = Game.actors && Game.actors.get ? Game.actors.get(actor.id) : actor;
      if (!liveActor) return false;
      if (actor.dead || actor.lifecycle !== 'active' || actor.hp <= 0) return false;
      if (actor.merchantEventId !== active.id) return false;
      var pid = profileId || actor.merchantProfileId;
      if (pid && active.merchantProfileId !== pid) return false;
      if (!hero || hero.encounterId ||
          hero.state === 'dead' || hero.state === 'recover') return false;
      if (Game.transitions && Game.transitions.isActive()) return false;
      if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return false;
      return true;
    };
  }

  function merchantPauseSpec(id, kind, actor, profileId) {
    return {
      id: id,
      kind: kind,
      scopes: ['autoExplore'],
      ttl: 2,
      context: function () {
        var active = Game.merchants && Game.merchants.activeEvent();
        return {
          actorId: actor && actor.id || null,
          eventId: active && active.id || null,
          merchantProfileId: profileId || (actor && actor.merchantProfileId) ||
            (active && active.merchantProfileId) || null,
          regionId: Game.state && Game.state.world && Game.state.world.region || null
        };
      },
      guard: merchantGuard(actor, profileId)
    };
  }

  Game.ui = Game.ui || {};
  var M = Game.ui.modals = {
    init: function () {
      root = document.getElementById('modal-root');

      /* ---- 事件驱动的 Toast ---- */
      var t = function (k, v) { return Game.i18n.t(k, v); };
      var fmt = function (value) { return Game.i18n.fmtNum(value); };
      var lastLevelToast = 0;

      bus.on('player:levelup', function (p) {
        var now = Date.now();
        if (now - lastLevelToast > 1500) {
          lastLevelToast = now;
          M.toast(t('ui.levelUp', { lv: p.level }), 'gold');
        }
      });
      bus.on('achievement:unlocked', function (p) {
        M.toast('🏆 ' + t('ui.achUnlocked', { name: t('ach.' + p.aid + '.name') }), 'gold');
      });
      bus.on('region:unlocked', function (p) {
        M.toast('🗺 ' + t(p.reopened ? 'ui.regionReopened' : 'ui.regionUnlocked', {
          name: t('region.' + p.rid + '.name')
        }));
      });
      bus.on('prog:autoAdvance', function (p) {
        if (p && p.cinematic) return;
        M.toast(t('ui.autoAdvanced', { name: t('region.' + p.rid + '.name') }));
      });
      bus.on('prog:fellback', function (p) {
        M.toast(t(p.finalRegionLost ? 'ui.finalRegionLostToast' : 'ui.fellback', {
          name: t('region.' + p.rid + '.name')
        }), 'warn', p.finalRegionLost ? 5200 : 4200);
      });
      bus.on('boss:defeated', function (p) {
        if (p.first && Game.ending && Game.ending.isActive()) return;
        if (Game.transitions && Game.transitions.isRegionActive()) return;
        if (p.first) M.toast('💎 ' + t('ui.bossFirstKill', { n: Game.F.bossCrystal(p.tier) }), 'gold', 3600);
        else M.toast(t('ui.bossKilled'));
      });
      bus.on('boss:failed', function (p) {
        if (p && p.reason === 'defeat' && Game.prog && Game.prog.isFinalRegion(p.rid)) return;
        M.toast(t(p && p.reason === 'retreat' ? 'ui.bossRetreated' : 'ui.bossFailed'), 'warn', 3600);
      });
      bus.on('item:dropped', function (p) {
        if (p.offline) return;
        if (p.item && p.item.rar >= 3) {
          M.toast('✨ ' + t('ui.rareDrop', { name: Game.ui.itemName(p.item) }), 'r' + p.item.rar, 3200);
        }
      });
      bus.on('player:death', function () {
        if (Game.transitions && Game.transitions.isDeathActive()) return;
        Game.fx.flashScreen();
        M.toast(t('ui.heroDown'), 'warn');
      });
      bus.on('automation:summary', function (p) {
        if (!p || (!p.skillPoints && !p.gearCount)) return;
        var msg;
        if (p.skillPoints && p.gearCount) {
          msg = t('ui.autoBothSummary', { s: p.skillPoints, g: p.gearCount });
        } else if (p.skillPoints) {
          msg = t('ui.autoSkillSummary', { n: p.skillPoints });
        } else {
          msg = t('ui.autoGearSummary', {
            n: p.gearCount,
            p: Math.max(0, p.gain * 100).toFixed(1)
          });
        }
        M.toast(msg, 'gold', 3200);
      });
      bus.on('guardSite:revealed', function (p) {
        if (p && p.reason !== 'region-init' && p.mode === 'ambush') M.toast(t('ui.guardRevealed'));
      });
      bus.on('guardSite:engaged', function (p) {
        M.toast(t(p && p.mode === 'ambush' ? 'ui.guardAmbush' : 'ui.guardEngaged'), 'warn');
      });
      bus.on('guardSite:cleared', function () { M.toast(t('ui.guardCleared')); });
      bus.on('nest:discovered', function () { M.toast(t('ui.nestDiscovered')); });
      bus.on('nestChest:opened', function (p) {
        M.toast(t('ui.nestChestOpened', {
          gold: fmt(p && p.gold || 0), count: p && p.materialCount || 0
        }), 'gold');
      });
      bus.on('merchant:discovered', function (p) {
        var profile = Game.content.get('merchantProfile', p.merchantProfileId);
        M.toast(t('merchant.ui.discovered', {
          name: profile ? t(profile.presentation.nameKey) : t('tradeKind.wander')
        }), 'gold', 4200);
        if (Game.fx) Game.fx.ring(p.x, p.y - 16, 18, '#f0c860');
      });
      bus.on('merchant:surrendered', function (p) {
        M.merchantSurrender(p);
      });
      bus.on('merchant:departed', function (p) {
        if (p.reason === 'expired') M.toast(t('merchant.ui.expired'));
        else if (p.reason === 'escaped') M.toast(t('merchant.ui.escaped'), 'warn', 4200);
      });
      bus.on('merchant:attackRejected', function () {
        M.toast(t('ui.actorTargetUnavailable'), 'warn');
      });
    },

    /* ---------------- 基础弹窗 ---------------- */
    show: function (contentEl, opts) {
      opts = opts || {};
      var mask = U.el('div', 'modal-mask');
      var box = U.el('div', 'modal jrpg-box');
      box.appendChild(contentEl);
      mask.appendChild(box);
      root.appendChild(mask);
      var closed = false;
      var pauseHandle = null;
      var api = {
        close: function (reason) {
          if (closed) return false;
          closed = true;
          if (pauseHandle) {
            pauseHandle.closed = true;
            removePauseModal(pauseHandle);
            if (Game.interactions && Game.interactions.releasePause) {
              Game.interactions.releasePause(pauseHandle.pause.id, reason || 'modal-closed');
            }
          }
          if (mask.parentNode) mask.parentNode.removeChild(mask);
          if (opts.onClose) opts.onClose(reason || 'modal-closed');
          return true;
        }
      };
      if (opts.pause && typeof opts.pause.id === 'string' && opts.pause.id) {
        pauseHandle = {
          mask: mask,
          pause: opts.pause,
          close: api.close,
          closed: false
        };
        activePauseModals.push(pauseHandle);
        maintainPauseModal(pauseHandle);
      }
      if (opts.dismissable !== false) {
        mask.addEventListener('click', function (e) {
          if (e.target === mask) api.close();
        });
      }
      return api;
    },

    updateInteractionPauses: function () {
      activePauseModals.slice().forEach(maintainPauseModal);
      return activePauseModals.length;
    },

    closeInteractionModals: function (reason) {
      var closing = activePauseModals.slice();
      closing.forEach(function (handle) {
        if (handle && !handle.closed) handle.close(reason || 'combat');
      });
      return closing.length;
    },

    confirm: function (msg, onOk, onCancel, options) {
      var t = Game.i18n.t;
      var c = U.el('div', '');
      c.innerHTML = '<h3>' + t('ui.confirmTitle') + '</h3><div class="modal-body">' + msg + '</div>';
      var btns = U.el('div', 'modal-btns');
      var no = U.el('button', 'btn', t('ui.cancel'));
      var yes = U.el('button', 'btn gold', t('ui.ok'));
      btns.appendChild(no); btns.appendChild(yes);
      c.appendChild(btns);
      var showOpts = { dismissable: false };
      if (options && options.pause) showOpts.pause = options.pause;
      var api = M.show(c, showOpts);
      no.addEventListener('click', function () { api.close(); if (onCancel) onCancel(); });
      yes.addEventListener('click', function () { api.close(); if (onOk) onOk(); });
      return api;
    },

    actorActions: function (actor, handlers) {
      if (!actor || !actor.blueprint) return null;
      handlers = handlers || {};
      var archetype = Game.content.get('actorArchetype', actor.blueprint.archetypeId);
      var interactionId = actor.blueprint.resolvedProfiles.interactionProfileId;
      var profile = interactionId && Game.content.get('interactionProfile', interactionId);
      if (!archetype || !profile || !(profile.actions || []).length) return null;
      var t = Game.i18n.t;
      var name = t(archetype.identity.nameKey);
      var isMerchant = !!(actor.tags &&
        actor.tags.indexOf('wandering-merchant') >= 0 && Game.merchants);
      var actionsPause = isMerchant
        ? merchantPauseSpec('ui:merchant-actions', 'merchant-actions', actor, actor.merchantProfileId)
        : null;
      var descriptionKey = archetype.identity.loreKey || archetype.identity.descKey;
      var c = U.el('div', 'actor-actions');
      var heading = U.el('h3', '');
      heading.textContent = t('ui.actorActionsTitle', { name: name });
      c.appendChild(heading);
      if (descriptionKey) {
        var body = U.el('div', 'modal-body actor-action-description');
        body.textContent = t(descriptionKey);
        c.appendChild(body);
      }
      var list = U.el('div', 'actor-action-list');
      c.appendChild(list);
      var api = M.show(c, actionsPause ? { pause: actionsPause } : null);
      (profile.actions || []).forEach(function (action) {
        if (['inspect', 'talk', 'trade', 'attack'].indexOf(action.kind) < 0) return;
        var labelKeys = {
          inspect: 'ui.actorObserve',
          talk: 'merchant.ui.talk',
          trade: 'merchant.ui.trade',
          attack: 'ui.actorAttack'
        };
        var iconIds = {
          inspect: 'icon_nav_map',
          talk: 'icon_nav_char',
          trade: 'icon_gold',
          attack: 'icon_skill_strike'
        };
        var labelKey = labelKeys[action.kind];
        var button = U.el('button',
          'btn actor-action-btn' + (action.kind === 'attack' ? ' danger' : ''));
        button.type = 'button';
        button.setAttribute('aria-label', t(labelKey));
        var icon = U.el('canvas', 'actor-action-icon');
        icon.width = 18;
        icon.height = 18;
        button.appendChild(icon);
        var label = U.el('span', 'actor-action-label');
        label.textContent = t(labelKey);
        button.appendChild(label);
        Game.assets.drawToDom(
          icon,
          iconIds[action.kind],
          'icon'
        );
        button.addEventListener('click', function () {
          api.close();
          if (action.kind === 'inspect' && handlers.observe) return handlers.observe(actor);
          if (action.kind === 'talk' && handlers.talk) return handlers.talk(actor);
          if (action.kind === 'trade' && handlers.trade) return handlers.trade(actor);
          var submit = function () {
            if (handlers.attack) handlers.attack(actor);
          };
          if (action.requiresConfirmation) {
            /* 攻击二次确认属于同一交互链：确认窗等待期间以独立租约
             * ui:merchant-attack-confirm 续接第一层暂停，避免确认窗
             * 关闭到 Engagement 提交之间出现可观察的暂停断档。 */
            var confirmOpts = isMerchant
              ? { pause: merchantPauseSpec('ui:merchant-attack-confirm', 'merchant-attack-confirm', actor, actor.merchantProfileId) }
              : null;
            M.confirm(t(isMerchant
              ? 'merchant.ui.attackConfirm'
              : 'ui.actorAttackConfirm', { name: name }), submit, null, confirmOpts);
          } else {
            submit();
          }
        });
        list.appendChild(button);
      });
      return api;
    },

    merchantDialogue: function (dialogue, actor) {
      if (!dialogue) return null;
      var t = Game.i18n.t;
      var c = U.el('div', 'merchant-dialogue');
      c.innerHTML =
        '<div class="merchant-dialogue-head">' +
        '<canvas class="merchant-dialogue-portrait" width="48" height="48"></canvas>' +
        '<div class="grow"><div class="merchant-dialogue-kicker">' +
        t('merchant.ui.roadGuild') + '</div><h3>' +
        U.esc(t(dialogue.nameKey)) + '</h3></div></div>' +
        '<div class="modal-body merchant-dialogue-line">“' +
        U.esc(dialogue.text) + '”</div>';
      var portrait = c.querySelector('canvas');
      Game.assets.drawToDom(portrait, dialogue.portraitId, 'icon');
      var actions = U.el('div', 'modal-btns merchant-dialogue-actions');
      var closeButton = U.el('button', 'btn', t('merchant.ui.leave'));
      actions.appendChild(closeButton);
      var event = Game.merchants && Game.merchants.activeEvent();
      if (event && event.state === 'available') {
        var tradeButton = U.el('button', 'btn gold', t('merchant.ui.openShop'));
        actions.appendChild(tradeButton);
        tradeButton.addEventListener('click', function () {
          api.close();
          Game.merchants.openTrade(actor);
        });
      }
      c.appendChild(actions);
      var api = M.show(c, {
        pause: merchantPauseSpec('ui:merchant-dialogue', 'merchant-dialogue', actor, dialogue.profileId)
      });
      closeButton.addEventListener('click', function () { api.close(); });
      return api;
    },

    merchantSurrender: function (payload) {
      if (!payload || !Game.merchants) return null;
      var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
      var c = U.el('div', 'merchant-surrender');
      c.innerHTML =
        '<h3>' + t('merchant.ui.surrenderTitle') + '</h3>' +
        '<div class="modal-body">' + t('merchant.ui.surrenderBody', {
          debt: fmt(payload.debtGold)
        }) + '</div>';
      var choices = U.el('div', 'merchant-rob-choices');
      (payload.eligibleOffers || []).forEach(function (offer) {
        var name = offer.kind === 'gear'
          ? Game.ui.itemName(offer.item)
          : (offer.kind === 'potion'
            ? t('shop.shop_' + offer.ref + '.name')
            : t('material.' + offer.materialId));
        var button = U.el(
          'button',
          'btn merchant-rob-choice',
            t('merchant.ui.robOffer', {
              name: name,
              debt: fmt(offer.robberyDebt)
            })
        );
        button.addEventListener('click', function () {
          M.confirm(t('merchant.ui.robConfirm', { name: name }), function () {
            var result = Game.merchants.resolveSurrender('rob', offer.id);
            if (result.ok) {
              api.close();
              M.toast(t('merchant.ui.robbed', {
                debt: fmt(result.debtGold)
              }), 'warn', 4200);
              if (Game.ui.tabs) Game.ui.tabs.queueRerender();
            }
          });
        });
        choices.appendChild(button);
      });
      c.appendChild(choices);
      var actions = U.el('div', 'modal-btns');
      var spare = U.el('button', 'btn gold', t('merchant.ui.spare'));
      actions.appendChild(spare);
      c.appendChild(actions);
      var api = M.show(c, {
        dismissable: false,
        pause: {
          id: 'ui:merchant-surrender',
          kind: 'merchant-surrender',
          scopes: ['autoExplore'],
          context: function () {
            return {
              eventId: payload.eventId,
              merchantProfileId: payload.merchantProfileId,
              regionId: Game.state && Game.state.world && Game.state.world.region || null
            };
          },
          guard: function () {
            var event = Game.merchants && Game.merchants.activeEvent();
            var hero = Game.world && Game.world.hero;
            return !!(event && event.id === payload.eventId &&
              event.state === 'surrendered' && hero && !hero.encounterId &&
              hero.state !== 'dead' && hero.state !== 'recover' &&
              !(Game.transitions && Game.transitions.isActive()) &&
              !(Game.ending && Game.ending.isActive && Game.ending.isActive()));
          }
        },
        onClose: function () {
          if (Game.merchants && Game.merchants.resetSurrenderPrompt) {
            Game.merchants.resetSurrenderPrompt(payload.eventId);
          }
        }
      });
      spare.addEventListener('click', function () {
        var result = Game.merchants.resolveSurrender('spare');
        if (result.ok) {
          api.close();
          M.toast(t('merchant.ui.spared', {
            debt: fmt(result.debtGold)
          }), 'gold', 3800);
          if (Game.ui.tabs) Game.ui.tabs.queueRerender();
        }
      });
      return api;
    },

    toast: function (msg, cls, life) {
      if (Game.ending && Game.ending.isActive()) return;
      if (Game.transitions && Game.transitions.isActive()) {
        if (deferredToasts.length < 4) deferredToasts.push({ msg: msg, cls: cls, life: life });
        return;
      }
      var box = document.getElementById('toasts');
      if (!box) return;
      var el = U.el('div', 'toast jrpg-box', msg);
      if (cls === 'gold') el.style.color = 'var(--gold)';
      else if (cls === 'warn') el.style.color = '#ff9a8a';
      else if (cls && cls[0] === 'r') el.style.color = 'var(--' + cls + ')';
      el.style.setProperty('--toast-life', ((life || 2400) / 1000) + 's');
      box.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, (life || 2400) + 400);
      while (box.children.length > 4) box.removeChild(box.firstChild);
    },

    clearToasts: function () {
      var box = document.getElementById('toasts');
      if (box) box.replaceChildren();
    },

    clearDeferredToasts: function () {
      deferredToasts = [];
    },

    flushDeferredToasts: function () {
      if (!deferredToasts.length) return;
      var list = deferredToasts.slice(0, 3);
      deferredToasts = [];
      for (var i = 0; i < list.length; i++) {
        M.toast(list[i].msg, list[i].cls, list[i].life);
      }
    },

    /* ---------------- 装备详情（含对比） ---------------- */
    itemDetail: function (item) {
      var t = Game.i18n.t, fmt = Game.i18n.fmtNum;
      var isV2 = !!(Game.equipment && Game.equipment.isV2(item));
      var slotId = Game.equipment ? Game.equipment.slotOf(item) : item.base;
      var rarityRank = Game.equipment ? Game.equipment.rarityRank(item) : item.rar;
      var itemLevel = Game.equipment ? Game.equipment.levelOf(item) : item.ilvl;
      var equippedUid = Game.state.inv.equipped[slotId];
      var equipped = equippedUid ? Game.inv.byUid(equippedUid) : null;
      var isEquipped = equippedUid === item.uid;

      function statValues(it) {
        var st = Game.inv.itemStats(it);
        return [
          ['atk', 'equipment.stat.power', st.atk, 'flat'],
          ['hp', 'stat.hp', st.hp, 'flat'],
          ['def', 'equipment.stat.armor', st.def, 'flat'],
          ['ward', 'equipment.stat.ward', st.ward, 'flat'],
          ['crit', 'equipment.stat.critChance', st.crit, 'pct'],
          ['critDmg', 'equipment.stat.critMultiplier', st.critDmg, 'mult'],
          ['dodge', 'equipment.stat.dodgeChance', st.dodge, 'pct'],
          ['lifesteal', 'equipment.stat.lifesteal', st.lifesteal, 'pct'],
          ['cdr', 'equipment.stat.cooldownRate', st.cdr, 'pct'],
          ['healPow', 'equipment.stat.healingPower', st.healPow, 'pct'],
          ['regen', 'equipment.stat.healthRegenPct', st.regen, 'pct'],
          ['goldMul', 'equipment.stat.goldMultiplier', st.goldMul, 'pct'],
          ['expMul', 'equipment.stat.expMultiplier', st.expMul, 'pct'],
          ['dropMul', 'equipment.stat.dropMultiplier', st.dropMul, 'pct'],
          ['rarityLuck', 'equipment.stat.rarityLuck', st.rarityLuck, 'pct']
        ];
      }

      function signed(value, kind) {
        var sign = value >= 0 ? '+' : '';
        if (kind === 'flat') return sign + fmt(value);
        if (kind === 'mult') return sign + value.toFixed(2) + 'x';
        return sign + (value * 100).toFixed(1) + '%';
      }

      function compareStatHtml() {
        var baseValues = equipped && !isEquipped ? statValues(equipped) : [];
        var old = {};
        baseValues.forEach(function (row) { old[row[0]] = row[2]; });
        var rows = statValues(item).map(function (row) {
          return [row[1], row[2] - (old[row[0]] || 0), row[3]];
        }).filter(function (row) { return Math.abs(row[1]) > 1e-9; });
        if (!rows.length) return '';
        return '<section class="item-detail-section"><h4>' + t('ui.itemSingleCompare') +
          '</h4><div class="item-stat-diff">' + rows.map(function (row) {
            return '<span>' + U.esc(t(row[0])) + '</span><strong class="' +
              (row[1] >= 0 ? 'positive' : 'negative') + '">' + signed(row[1], row[2]) + '</strong>';
          }).join('') + '</div></section>';
      }

      function simulationHtml() {
        if (!equipped || isEquipped || !Game.auto) return '';
        var diff = Game.auto.compareItem(item);
        if (!diff) return '';
        function pct(value) {
          var positive = value >= 0;
          return '<span class="' + (positive ? 'positive' : 'negative') + '">' +
            (positive ? '+' : '') + (value * 100).toFixed(1) + '%</span>';
        }
        return '<section class="item-detail-section"><h4>' + t('ui.itemBuildCompare') + '</h4>' +
          '<div class="compare-caption">' + t('ui.compareWith') + ' <span class="rar-r' +
          (Game.equipment ? Game.equipment.rarityRank(equipped) : equipped.rar) + '">' +
          U.esc(Game.ui.itemName(equipped)) + '</span></div><div class="compare-grid">' +
          '<span>' + t('ui.compareOverall') + '</span>' + pct(diff.overall) +
          '<span>' + t('ui.compareOffense') + '</span>' + pct(diff.offense) +
          '<span>' + t('ui.compareSurvival') + '</span>' + pct(diff.survival) +
          '<span>' + t('ui.compareEconomy') + '</span>' + pct(diff.economy) +
          '</div></section>';
      }

      function formalSections() {
        if (!isV2) return '';
        var base = Game.content.get('itemBase', item.baseId);
        var implicitValues = (item.implicitRolls || []).map(function (roll) {
          return roll.values && roll.values.value;
        });
        var normal = [], legendary = [];
        (item.affixes || []).forEach(function (roll) {
          var def = Game.content.get('itemAffix', roll.definitionId);
          (def && def.kind === 'legendary' ? legendary : normal).push({ roll: roll, def: def });
        });
        var implicit = Game.ui.modifierLines(base, implicitValues).map(function (line) {
          return '<div class="item-modifier">' + U.esc(line) + '</div>';
        }).join('');
        var normalHtml = normal.length ? normal.map(function (entry) {
          return '<div class="item-modifier affix">' + U.esc(Game.ui.affixLine(entry.roll)) + '</div>';
        }).join('') : '<div class="item-empty-affix">' + t('ui.itemNoAffixes') + '</div>';
        var legendaryHtml = legendary.map(function (entry) {
          var name = Game.ui.affixLine(entry.roll);
          var descKey = entry.def && entry.def.presentation && entry.def.presentation.descKey;
          return '<div class="legendary-effect"><strong>' + U.esc(name) + '</strong>' +
            (descKey ? '<p>' + U.esc(t(descKey)) + '</p>' : '') + '</div>';
        }).join('');
        return '<section class="item-detail-section"><h4>' + t('ui.itemImplicitTitle') + '</h4>' +
          implicit + '</section><section class="item-detail-section"><h4>' +
          t('ui.itemAffixTitle') + '</h4>' + normalHtml + '</section>' +
          (legendaryHtml ? '<section class="item-detail-section legendary"><h4>' +
            t('ui.itemLegendaryTitle') + '</h4>' + legendaryHtml + '</section>' : '');
      }

      var c = U.el('div', '');
      var html = '<h3 class="rar-r' + rarityRank + '">' + U.esc(Game.ui.itemName(item)) + '</h3>' +
        '<div class="modal-body">' +
        '<div class="item-detail-icon">' +
        '<canvas width="40" height="40" data-icon="' + Game.ui.itemIcon(item) + '"></canvas></div>' +
        '<div class="item-detail-meta rar-r' + rarityRank + '">' +
        t('rarity.r' + rarityRank) + ' · ' + t('ui.itemLevel', { lv: itemLevel }) +
        (isEquipped ? ' · ' + t('ui.equippedTag') : '') + '</div>' +
        formalSections() + compareStatHtml() + simulationHtml();
      if (Game.state.inv.lockedSlots[slotId]) {
        html += '<div class="locked-note"><span class="lock-glyph" aria-hidden="true"></span>' +
          t('ui.lockedSlotHint') + '</div>';
      }
      html += '</div>';
      c.innerHTML = html;

      var selectedLockId = isV2 && item.reforge && item.reforge.lockedAffixInstanceId || null;
      var reforgeBox = null;
      var reforgeButton = null;
      var reforgeCost = null;
      if (isV2) {
        var normalAffixes = (item.affixes || []).filter(function (roll) {
          var def = Game.content.get('itemAffix', roll.definitionId);
          return def && def.kind === 'normal';
        });
        reforgeBox = U.el('section', 'item-detail-section reforge-panel');
        reforgeBox.appendChild(U.el('h4', '', t('ui.reforgeTitle')));
        reforgeBox.appendChild(U.el('p', 'reforge-hint', t('ui.reforgeLockHint')));
        var choices = U.el('div', 'reforge-affix-list');
        var options = [{ instanceId: null, label: t('ui.reforgeNoLock') }].concat(
          normalAffixes.map(function (roll) {
            return { instanceId: roll.instanceId, label: Game.ui.affixLine(roll) };
          })
        );
        options.forEach(function (option) {
          var button = U.el('button', 'reforge-affix-choice',
            '<span class="choice-mark" aria-hidden="true"></span><span>' + U.esc(option.label) + '</span>');
          button.type = 'button';
          button.classList.toggle('selected', selectedLockId === option.instanceId);
          button.setAttribute('aria-pressed', selectedLockId === option.instanceId ? 'true' : 'false');
          button.addEventListener('click', function () {
            selectedLockId = option.instanceId;
            Array.prototype.forEach.call(choices.children, function (node) {
              var active = node === button;
              node.classList.toggle('selected', active);
              node.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            updateReforgeQuote();
          });
          choices.appendChild(button);
        });
        reforgeBox.appendChild(choices);
        reforgeCost = U.el('div', 'reforge-cost');
        reforgeBox.appendChild(reforgeCost);
        reforgeButton = U.el('button', 'btn gold reforge-submit', t('ui.reforgeAction'));
        reforgeBox.appendChild(reforgeButton);
        c.querySelector('.modal-body').appendChild(reforgeBox);

        function updateReforgeQuote() {
          var quote = Game.reforge.quote(item, selectedLockId);
          if (!quote.ok) {
            reforgeCost.textContent = t('ui.reforgeUnavailable', {
              reason: Game.ui.equipmentError(quote.reason)
            });
            reforgeButton.disabled = true;
            return;
          }
          var materialName = quote.materialId ? t('material.' + quote.materialId) : '-';
          reforgeCost.textContent = t('ui.reforgeCost', {
            n: (item.reforge && item.reforge.count || 0) + 1,
            gold: fmt(quote.gold), count: quote.materialCount, material: materialName
          });
          reforgeButton.disabled = Game.state.player.gold < quote.gold ||
            !!quote.materialId && Game.inv.materialCount(quote.materialId) < quote.materialCount;
        }
        updateReforgeQuote();
      }

      var btns = U.el('div', 'modal-btns');
      var sellTxt = rarityRank === 4
        ? t('ui.salvage', { n: Game.equipment ? Game.equipment.salvageCrystal(item) : Game.F.salvageCrystal(itemLevel) })
        : t('ui.sellFor', { g: fmt(Game.equipment ? Game.equipment.sellPrice(item) : Game.F.sellPrice(itemLevel, rarityRank)) });
      var btnSell = U.el('button', 'btn danger', sellTxt);
      btns.appendChild(btnSell);
      var btnEquip = U.el('button', 'btn gold', isEquipped ? t('ui.unequip') : t('ui.equip'));
      btns.appendChild(btnEquip);
      c.appendChild(btns);

      var api = M.show(c);
      Game.ui.renderIcons(c);

      if (reforgeButton) reforgeButton.addEventListener('click', function () {
        var result = Game.reforge.execute(item.uid, selectedLockId);
        if (!result.ok) {
          M.toast(t('ui.operationRejected', { reason: Game.ui.equipmentError(result.reason) }), 'warn');
          updateReforgeQuote();
          return;
        }
        M.toast(t('ui.reforgeDone'), 'gold');
        api.close();
        Game.ui.tabs.queueRerender();
        M.itemDetail(item);
      });

      btnSell.addEventListener('click', function () {
        var r = Game.inv.sell(item.uid);
        if (r && r.ok === false) {
          M.toast(t('ui.operationRejected', { reason: Game.ui.equipmentError(r.reason) }), 'warn');
          return;
        }
        if (r) {
          M.toast(r.crystal
            ? '+' + r.crystal + ' ' + t('ui.crystal')
            : '+' + fmt(r.gold) + ' ' + t('ui.gold'));
        }
        api.close();
        Game.ui.tabs.queueRerender();
      });
      btnEquip.addEventListener('click', function () {
        var result = isEquipped ? Game.inv.unequip(slotId) : Game.inv.equip(item.uid);
        if (result && result.ok === false) {
          M.toast(t('ui.operationRejected', { reason: Game.ui.equipmentError(result.reason) }), 'warn');
          return;
        }
        api.close();
        Game.ui.tabs.queueRerender();
      });
    },

    /* ---------------- 通用逐字叙事（序章 / 后日谈共享） ---------------- */
    story: function (lines, opts) {
      opts = opts || {};
      lines = Array.isArray(lines) ? lines.filter(Boolean) : [];
      var mount = opts.container || root;
      var mask = U.el('div', opts.maskClass || 'prologue-mask');
      var box = U.el('div', (opts.boxClass || 'prologue-box') + ' jrpg-box');
      var textEl = U.el('div', 'story-text');
      box.appendChild(textEl);
      if (opts.tip) box.appendChild(U.el('div', 'prologue-tip', opts.tip));
      mask.appendChild(box);
      mask.setAttribute('role', 'dialog');
      mask.setAttribute('aria-modal', 'true');
      mask.setAttribute('tabindex', '-1');
      mount.appendChild(mask);

      var li = Math.max(0, Math.min(lines.length - 1, Number(opts.startIndex) || 0));
      var ci = 0, timer = null, typing = false, finished = false;

      function completeLine() {
        clearInterval(timer);
        timer = null;
        typing = false;
        textEl.innerHTML = U.esc(lines[li]) + ' <span class="cursor">▼</span>';
      }

      function typeLine() {
        if (!lines.length) return finish();
        typing = true;
        ci = 0;
        mask.setAttribute('data-story-line', String(li));
        textEl.innerHTML = '';
        if (opts.onLine) opts.onLine(li);
        var line = lines[li];
        timer = setInterval(function () {
          ci++;
          textEl.innerHTML = U.esc(line.slice(0, ci)) + '<span class="cursor">▌</span>';
          if (ci >= line.length) completeLine();
        }, opts.speed || 42);
      }

      function close() {
        clearInterval(timer);
        timer = null;
        document.removeEventListener('keydown', onKeyDown);
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }

      function finish() {
        if (finished) return;
        finished = true;
        close();
        if (opts.onDone) opts.onDone();
      }

      function advance() {
        if (finished) return false;
        if (typing) {
          completeLine();
          return true;
        }
        li++;
        if (li >= lines.length) finish();
        else typeLine();
        return true;
      }

      function onKeyDown(e) {
        if (e.code !== 'Enter' && e.code !== 'Space') return;
        e.preventDefault();
        e.stopPropagation();
        advance();
      }

      mask.addEventListener('click', advance);
      document.addEventListener('keydown', onKeyDown);
      setTimeout(function () { if (mask.parentNode) mask.focus(); }, 0);
      typeLine();
      return { advance: advance, close: close, line: function () { return li; } };
    },

    /* ---------------- 序章 ---------------- */
    prologue: function (onDone) {
      var t = Game.i18n.t;
      var lines = [];
      for (var i = 1; i <= 5; i++) {
        var key = 'prologue.' + i;
        var txt = t(key);
        if (txt !== key) lines.push(txt);
      }
      return M.story(lines, {
        tip: t('ui.prologueTip'),
        onDone: onDone
      });
    },

    /* ---------------- 离线结算 ---------------- */
    curioChoice: function (entity, choices, onChoose) {
      var t = Game.i18n.t;
      var c = U.el('div', 'curio-choice');
      c.innerHTML = '<h3>' + t('explore.curioTitle') + '</h3>' +
        '<div class="modal-body"><div class="name">' +
        U.esc(t(entity && entity.nameKey || 'explore.curioUnknown')) + '</div>' +
        '<div class="desc">' + t('explore.curioPrompt') + '</div></div>';
      var btns = U.el('div', 'modal-btns curio-buttons');
      var api = M.show(c, { dismissable: false });
      choices.forEach(function (choice) {
        var btn = U.el('button', 'btn', '<strong>' + U.esc(t('explore.curio.' + choice)) +
          '</strong><small>' + U.esc(t('explore.curio.' + choice + 'Hint')) + '</small>');
        btn.addEventListener('click', function () {
          api.close();
          if (onChoose) onChoose(choice);
        });
        btns.appendChild(btn);
      });
      c.appendChild(btns);
      return api;
    },

    offline: function (sum, onOk) {
      var t = Game.i18n.t, fmt = Game.i18n.fmtNum, fd = Game.i18n.fmtDur;
      var c = U.el('div', '');
      var html = '<h3>' + t('offline.title') + '</h3><div class="modal-body">';
      html += '<div style="text-align:center;color:var(--ink-dim);font-size:11px;margin-bottom:6px;">' +
        t('offline.away', { d: fd(sum.seconds) }) + '</div>';
      html += '<div class="offline-lines">';
      if (sum.type === 'rest') {
        html += '<div class="row"><span>' + t('offline.restMode') + '</span><span class="v">☕</span></div>';
        html += '<div class="row"><span>' + t('offline.hpRestored') + '</span><span class="v">100%</span></div>';
        html += '<div class="row"><span>' + t('offline.buffFull') + '</span><span class="v">' + fd(Game.F.BAL.restBuffCap) + '</span></div>';
        html += '<div style="font-size:10px;color:var(--ink-dim);margin-top:6px;">' + t('offline.restNote') + '</div>';
      } else {
        if (sum.type === 'expedition') {
          html += '<div class="row"><span>' + t('offline.knownRoute') +
            '</span><span class="v">' + fmt(sum.knownResources) + '</span></div>';
          html += '<div class="row"><span>' + t('offline.routeLoops') +
            '</span><span class="v">' + fmt(sum.routeLoops) + '</span></div>';
          var materialTotal = 0;
          for (var mat in sum.materials) materialTotal += sum.materials[mat] || 0;
          html += '<div class="row"><span>' + t('offline.materials') +
            '</span><span class="v">+' + fmt(materialTotal) + '</span></div>';
        }
        html += '<div class="row"><span>' + t('offline.kills') + '</span><span class="v">' + fmt(sum.kills) + '</span></div>';
        html += '<div class="row"><span>' + t('offline.exp') + '</span><span class="v">+' + fmt(sum.expShow) + '</span></div>';
        html += '<div class="row"><span>' + t('offline.gold') + '</span><span class="v">+' + fmt(sum.goldShow) + '</span></div>';
        if (sum.items > 0) html += '<div class="row"><span>' + t('offline.items') + '</span><span class="v">×' + sum.items + '</span></div>';
        if (sum.potions > 0) html += '<div class="row"><span>' + t('offline.potions') + '</span><span class="v">×' + sum.potions + '</span></div>';
        if (sum.type === 'expedition') {
          html += '<div style="font-size:10px;color:var(--ink-dim);margin-top:6px;">' +
            t('offline.noDiscoveries') + '</div>';
        }
      }
      html += '</div></div>';
      c.innerHTML = html;

      var btns = U.el('div', 'modal-btns');
      var ok = U.el('button', 'btn gold', t('offline.claim'));
      btns.appendChild(ok);
      c.appendChild(btns);
      var api = M.show(c, { dismissable: false });
      ok.addEventListener('click', function () {
        api.close();
        if (onOk) onOk();
      });
    }
  };
})();
