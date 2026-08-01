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

  Game.ui = Game.ui || {};
  var M = Game.ui.modals = {
    init: function () {
      root = document.getElementById('modal-root');

      /* ---- 事件驱动的 Toast ---- */
      var t = function (k, v) { return Game.i18n.t(k, v); };
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

    confirm: function (msg, onOk, onCancel) {
      var t = Game.i18n.t;
      var c = U.el('div', '');
      c.innerHTML = '<h3>' + t('ui.confirmTitle') + '</h3><div class="modal-body">' + msg + '</div>';
      var btns = U.el('div', 'modal-btns');
      var no = U.el('button', 'btn', t('ui.cancel'));
      var yes = U.el('button', 'btn gold', t('ui.ok'));
      btns.appendChild(no); btns.appendChild(yes);
      c.appendChild(btns);
      var api = M.show(c, { dismissable: false });
      no.addEventListener('click', function () { api.close(); if (onCancel) onCancel(); });
      yes.addEventListener('click', function () { api.close(); if (onOk) onOk(); });
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
      var api = M.show(c);
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
            var isMerchant = actor.tags &&
              actor.tags.indexOf('wandering-merchant') >= 0;
            M.confirm(t(isMerchant
              ? 'merchant.ui.attackConfirm'
              : 'ui.actorAttackConfirm', { name: name }), submit);
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
        pause: {
          id: 'ui:merchant-dialogue',
          kind: 'merchant-dialogue',
          scopes: ['autoExplore'],
          context: function () {
            var active = Game.merchants && Game.merchants.activeEvent();
            return {
              actorId: actor && actor.id || null,
              eventId: active && active.id || null,
              merchantProfileId: dialogue.profileId,
              regionId: Game.state && Game.state.world && Game.state.world.region || null
            };
          },
          guard: function () {
            var active = Game.merchants && Game.merchants.activeEvent();
            var hero = Game.world && Game.world.hero;
            var liveActor = actor && Game.actors && Game.actors.get
              ? Game.actors.get(actor.id) : actor;
            return !!(active && active.state === 'available' && actor && liveActor &&
              !actor.dead && actor.merchantEventId === active.id &&
              active.merchantProfileId === dialogue.profileId && hero &&
              !hero.encounterId && hero.state !== 'dead' && hero.state !== 'recover' &&
              !(Game.transitions && Game.transitions.isActive()) &&
              !(Game.ending && Game.ending.isActive && Game.ending.isActive()));
          }
        }
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
      var equippedUid = Game.state.inv.equipped[item.base];
      var equipped = equippedUid ? Game.inv.byUid(equippedUid) : null;
      var isEquipped = equippedUid === item.uid;

      function statLines(it) {
        var st = Game.inv.itemStats(it);
        var lines = [];
        if (st.atk) lines.push(t('stat.atk') + ' +' + fmt(st.atk));
        if (st.hp) lines.push(t('stat.hp') + ' +' + fmt(st.hp));
        if (st.def) lines.push(t('stat.def') + ' +' + fmt(st.def));
        return lines;
      }

      var c = U.el('div', '');
      var html = '<h3 class="rar-r' + item.rar + '">' + Game.ui.itemName(item) + '</h3>' +
        '<div class="modal-body">' +
        '<div style="text-align:center;margin-bottom:8px;">' +
        '<canvas width="40" height="40" data-icon="' + Game.ui.itemIcon(item) + '"></canvas></div>' +
        '<div style="text-align:center;font-size:11px;" class="rar-r' + item.rar + '">' +
        t('rarity.r' + item.rar) + ' · ' + t('ui.itemLevel', { lv: item.ilvl }) +
        (isEquipped ? ' · ' + t('ui.equippedTag') : '') + '</div><hr style="border-color:var(--panel-line);margin:8px 0">';

      statLines(item).forEach(function (l) { html += '<div>' + l + '</div>'; });
      item.affixes.forEach(function (af) {
        html += '<div style="color:#8ad0ff">' + Game.ui.affixLine(af) + '</div>';
      });

      // 对比
      if (equipped && !isEquipped) {
        var diff = Game.auto.compareItem(item);
        function pct(v) {
          var positive = v >= 0;
          return '<span style="color:var(--' + (positive ? 'ok' : 'danger') + ')">' +
            (positive ? '▲ +' : '▼ ') + (v * 100).toFixed(1) + '%</span>';
        }
        html += '<hr style="border-color:var(--panel-line);margin:8px 0">' +
          '<div style="font-size:11px;color:var(--ink-dim)">' + t('ui.compareWith') +
          ' <span class="rar-r' + equipped.rar + '">' + Game.ui.itemName(equipped) + '</span>' +
          '</div><div class="compare-grid">' +
          '<span>' + t('ui.compareOverall') + '</span>' + pct(diff.overall) +
          '<span>' + t('ui.compareOffense') + '</span>' + pct(diff.offense) +
          '<span>' + t('ui.compareSurvival') + '</span>' + pct(diff.survival) +
          '<span>' + t('ui.compareEconomy') + '</span>' + pct(diff.economy) +
          '</div>';
      }
      if (Game.state.inv.lockedSlots[item.base]) {
        html += '<div class="locked-note">🔒 ' + t('ui.lockedSlotHint') + '</div>';
      }
      html += '</div>';
      c.innerHTML = html;

      var btns = U.el('div', 'modal-btns');
      var sellTxt = item.rar === 4
        ? t('ui.salvage', { n: Game.F.salvageCrystal(item.ilvl) })
        : t('ui.sellFor', { g: fmt(Game.F.sellPrice(item.ilvl, item.rar)) });
      var btnSell = U.el('button', 'btn danger', sellTxt);
      btns.appendChild(btnSell);
      var btnEquip = U.el('button', 'btn gold', isEquipped ? t('ui.unequip') : t('ui.equip'));
      btns.appendChild(btnEquip);
      c.appendChild(btns);

      var api = M.show(c);
      Game.ui.renderIcons(c);

      btnSell.addEventListener('click', function () {
        var r = Game.inv.sell(item.uid);
        if (r) {
          M.toast(r.crystal ? '💎 +' + r.crystal : '🪙 +' + fmt(r.gold));
        }
        api.close();
        Game.ui.tabs.queueRerender();
      });
      btnEquip.addEventListener('click', function () {
        if (isEquipped) Game.inv.unequip(item.base);
        else Game.inv.equip(item.uid);
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
