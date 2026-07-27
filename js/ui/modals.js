/* ============================================================
 * ui/modals.js — 弹窗：序章 / 离线结算 / 装备详情对比 / 确认 / Toast
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus, reg = Game.reg;

  var root = null;
  var deferredToasts = [];

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
    },

    /* ---------------- 基础弹窗 ---------------- */
    show: function (contentEl, opts) {
      opts = opts || {};
      var mask = U.el('div', 'modal-mask');
      var box = U.el('div', 'modal jrpg-box');
      box.appendChild(contentEl);
      mask.appendChild(box);
      root.appendChild(mask);
      var api = {
        close: function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }
      };
      if (opts.dismissable !== false) {
        mask.addEventListener('click', function (e) {
          if (e.target === mask) api.close();
        });
      }
      return api;
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
