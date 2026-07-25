/* ============================================================
 * ui/modals.js — 弹窗：序章 / 离线结算 / 装备详情对比 / 确认 / Toast
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus, reg = Game.reg;

  var root = null;

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
        M.toast('🗺 ' + t('ui.regionUnlocked', { name: t('region.' + p.rid + '.name') }));
      });
      bus.on('prog:autoAdvance', function (p) {
        M.toast(t('ui.autoAdvanced', { name: t('region.' + p.rid + '.name') }));
      });
      bus.on('prog:fellback', function (p) {
        M.toast(t('ui.fellback', { name: t('region.' + p.rid + '.name') }), 'warn', 4200);
      });
      bus.on('boss:defeated', function (p) {
        if (p.first) M.toast('💎 ' + t('ui.bossFirstKill', { n: Game.F.bossCrystal(p.tier) }), 'gold', 3600);
        else M.toast(t('ui.bossKilled'));
      });
      bus.on('boss:failed', function () {
        M.toast(t('ui.bossFailed'), 'warn', 3600);
      });
      bus.on('item:dropped', function (p) {
        if (p.offline) return;
        if (p.item && p.item.rar >= 3) {
          M.toast('✨ ' + t('ui.rareDrop', { name: Game.ui.itemName(p.item) }), 'r' + p.item.rar, 3200);
        }
      });
      bus.on('player:death', function () {
        Game.fx.flashScreen();
        M.toast(t('ui.heroDown'), 'warn');
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
        var diff = Game.inv.score(item) - Game.inv.score(equipped);
        var arrow = diff >= 0 ? '<span style="color:var(--ok)">▲ +' + fmt(Math.round(diff)) + '</span>'
          : '<span style="color:var(--danger)">▼ ' + fmt(Math.round(diff)) + '</span>';
        html += '<hr style="border-color:var(--panel-line);margin:8px 0">' +
          '<div style="font-size:11px;color:var(--ink-dim)">' + t('ui.compareWith') +
          ' <span class="rar-r' + equipped.rar + '">' + Game.ui.itemName(equipped) + '</span>' +
          '（' + t('ui.score') + ' ' + arrow + '）</div>';
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

    /* ---------------- 职业选择（新档 / 旧档迁移补选） ---------------- */
    classSelect: function (onDone) {
      var t = Game.i18n.t;
      var mask = U.el('div', 'modal-mask');
      var box = U.el('div', 'modal jrpg-box');
      box.innerHTML = '<h3>' + t('ui.classTitle') + '</h3>' +
        '<div style="text-align:center;font-size:10px;color:var(--ink-dim);margin-bottom:10px;">' +
        t('ui.classHint') + '</div>';
      var wrap = U.el('div', '');

      var dims = ['hp', 'atk', 'def', 'spd', 'burst'];
      reg.all('class').forEach(function (cls) {
        var dotHtml = dims.map(function (k) {
          var n = cls.statDots[k] || 0;
          var full = '', empty = '';
          for (var i = 0; i < n; i++) full += '●';
          for (var j = n; j < 5; j++) empty += '●';
          return '<span style="font-size:8px;color:var(--ink-dim)">' + t('ui.dim.' + k) +
            '<span style="color:var(--gold)">' + full + '</span><span style="opacity:.25">' + empty + '</span></span>';
        }).join(' ');
        var traits = (cls.traits || []).map(function (tr) {
          return '<span class="badge">' + t('ui.trait.' + tr) + '</span>';
        }).join('');

        var card = U.el('div', 'card');
        card.innerHTML = '<div class="row">' +
          '<canvas width="40" height="56" data-hero="hero_' + cls.id + '"></canvas>' +
          '<div class="grow">' +
          '<div class="name">' + t('class.' + cls.id + '.name') + traits + '</div>' +
          '<div class="desc">' + t('class.' + cls.id + '.desc') + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">' + dotHtml + '</div>' +
          '</div>' +
          '<button class="btn small gold pick-btn">' + t('ui.classPick') + '</button>' +
          '</div>';
        card.querySelector('.pick-btn').addEventListener('click', function () {
          M.confirm(t('ui.classConfirm', { name: t('class.' + cls.id + '.name') }), function () {
            if (mask.parentNode) mask.parentNode.removeChild(mask);
            onDone(cls.id);
          });
        });
        wrap.appendChild(card);
      });

      box.appendChild(wrap);
      mask.appendChild(box);
      root.appendChild(mask);
      var cvs = wrap.querySelectorAll('canvas[data-hero]');
      for (var i = 0; i < cvs.length; i++) {
        Game.assets.drawToDom(cvs[i], cvs[i].getAttribute('data-hero'), 'walk_d0');
      }
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
      var mask = U.el('div', 'prologue-mask');
      var box = U.el('div', 'prologue-box jrpg-box');
      var textEl = U.el('div', '');
      var tip = U.el('div', 'prologue-tip', t('ui.prologueTip'));
      box.appendChild(textEl);
      box.appendChild(tip);
      mask.appendChild(box);
      root.appendChild(mask);

      var li = 0, ci = 0, timer = null, typing = false, finished = false;

      function typeLine() {
        typing = true;
        ci = 0;
        textEl.innerHTML = '';
        var line = lines[li];
        timer = setInterval(function () {
          ci++;
          textEl.innerHTML = U.esc(line.slice(0, ci)) + '<span class="cursor">▌</span>';
          if (ci >= line.length) {
            clearInterval(timer);
            typing = false;
            textEl.innerHTML = U.esc(line) + ' <span class="cursor">▼</span>';
          }
        }, 42);
      }

      function advance() {
        if (finished) return;
        if (typing) {
          clearInterval(timer);
          typing = false;
          textEl.innerHTML = U.esc(lines[li]) + ' <span class="cursor">▼</span>';
          return;
        }
        li++;
        if (li >= lines.length) {
          finished = true;
          if (mask.parentNode) mask.parentNode.removeChild(mask);
          onDone();
          return;
        }
        typeLine();
      }

      mask.addEventListener('click', advance);
      typeLine();
    },

    /* ---------------- 离线结算 ---------------- */
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
        html += '<div class="row"><span>' + t('offline.kills') + '</span><span class="v">' + fmt(sum.kills) + '</span></div>';
        html += '<div class="row"><span>' + t('offline.exp') + '</span><span class="v">+' + fmt(sum.expShow) + '</span></div>';
        html += '<div class="row"><span>' + t('offline.gold') + '</span><span class="v">+' + fmt(sum.goldShow) + '</span></div>';
        if (sum.items > 0) html += '<div class="row"><span>' + t('offline.items') + '</span><span class="v">×' + sum.items + '</span></div>';
        if (sum.potions > 0) html += '<div class="row"><span>' + t('offline.potions') + '</span><span class="v">×' + sum.potions + '</span></div>';
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
