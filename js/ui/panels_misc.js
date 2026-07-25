/* ============================================================
 * ui/panels_misc.js — 技能 / 地图 / 设置 面板
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus, reg = Game.reg;

  var UI = Game.ui;

  /* ================= 技能面板（按职业过滤） ================= */
  UI.panels.skills = function (root) {
    var t = Game.i18n.t;
    var s = Game.state, p = s.player;
    var cid = p.classId;
    var clsName = cid ? t('class.' + cid + '.name') : '';

    root.appendChild(U.el('div', 'panel-title', t('ui.tab.skills') +
      (clsName ? ' <span style="font-size:11px;color:var(--ink-dim)">' + clsName + '</span>' : '') +
      '<span style="font-size:12px;color:var(--gold)">' + t('ui.spLeft', { n: p.sp }) + '</span>'));

    var list = reg.all('skill').filter(function (sk) { return sk.cls === cid; });
    if (!list.length) {
      root.appendChild(U.el('div', 'card', '<div class="desc">' + t('ui.noClassYet') + '</div>'));
      return;
    }

    list.forEach(function (sk) {
      var lv = p.skills[sk.id] || 0;
      var locked = p.level < (sk.unlockLv || 1);
      var maxed = lv >= Game.SKILL_MAX_LV;
      var showLv = Math.max(1, lv);
      var vars = sk.descVars ? sk.descVars(showLv) : {};
      var typeTxt = sk.type === 'active'
        ? t('ui.skillActive', { cd: sk.cd })
        : t('ui.skillPassive');
      var lvTxt = sk.type === 'passive' && lv === 0
        ? t('ui.skillNotLearned')
        : 'Lv.' + lv;

      var card = U.el('div', 'card' + (locked ? ' locked' : ''),
        '<div class="row">' +
        '<div class="skill-ico"><canvas width="30" height="30" data-icon="' + sk.icon + '"></canvas></div>' +
        '<div class="grow">' +
        '<div class="name">' + t('skill.' + sk.id + '.name') +
        ' <span class="skill-lv">' + lvTxt + '</span>' +
        ' <span class="badge">' + typeTxt + '</span></div>' +
        '<div class="desc">' + t('skill.' + sk.id + '.desc', vars) +
        (lv === 0 && sk.type === 'active' ? '<br>' + t('ui.skillBaseNote') : '') + '</div>' +
        (locked ? '<div class="desc" style="color:var(--danger)">' + t('ui.needLevel', { lv: sk.unlockLv }) + '</div>' : '') +
        '</div>' +
        '<button class="btn small up-btn">' + (maxed ? t('ui.maxed') : t('ui.upgrade')) + '</button>' +
        '</div>');
      var btn = card.querySelector('.up-btn');
      btn.disabled = locked || maxed || p.sp < 1;
      btn.addEventListener('click', function () {
        if (Game.player.upgradeSkill(sk.id)) {
          Game.ui.modals.toast(t('ui.skillUp', { name: t('skill.' + sk.id + '.name') }));
          UI.tabs.rerender();
        }
      });
      root.appendChild(card);
    });
  };

  /* ================= 地图面板 ================= */
  UI.panels.map = function (root) {
    var t = Game.i18n.t;
    var s = Game.state;

    root.appendChild(U.el('div', 'panel-title', t('ui.tab.map')));

    // 自动推进开关
    var autoRow = U.el('div', 'card', '<div class="row"><div class="grow">' +
      '<div class="name">' + t('settings.autoAdvance') + '</div>' +
      '<div class="desc">' + t('settings.autoAdvanceHint') + '</div></div>' +
      '<div class="toggle' + (s.settings.autoAdvance ? ' on' : '') + '"></div></div>');
    autoRow.querySelector('.toggle').addEventListener('click', function () {
      s.settings.autoAdvance = !s.settings.autoAdvance;
      this.classList.toggle('on', s.settings.autoAdvance);
    });
    root.appendChild(autoRow);

    Game.State.regionOrder().forEach(function (rid) {
      var r = reg.get('region', rid);
      var unlocked = Game.prog.isUnlocked(r.id);
      var prog = Game.State.regionProg(r.id);
      var isCurrent = s.world.region === r.id;
      var lvMin = (Game.State.regionTier(r.id) - 1) * 8 + 1;

      var status = '';
      if (isCurrent) status = '<span class="badge" style="color:var(--gold)">' + t('ui.current') + '</span>';
      else if (!unlocked) status = '<span class="badge">🔒 ' + t('ui.locked') + '</span>';
      if (prog.cleared) status += '<span class="badge" style="color:var(--ok)">✓ ' + t('ui.cleared') + '</span>';

      var card = U.el('div', 'card region-card' + (isCurrent ? ' current' : '') + (unlocked ? '' : ' locked'),
        '<div class="row">' +
        '<div class="thumb"><canvas width="26" height="26" class="region-thumb"></canvas></div>' +
        '<div class="grow">' +
        '<div class="name">' + t('region.' + r.id + '.name') + status + '</div>' +
        '<div class="desc">' + t('region.' + r.id + '.desc') + '</div>' +
        '<div class="desc">' + t('ui.recommendLv', { lv: lvMin }) + '　·　' +
        t('ui.huntGauge') + ' ' + Math.min(prog.kills, r.killTarget) + '/' + r.killTarget + '</div>' +
        '</div>' +
        '<button class="btn small go-btn">' + t('ui.goRegion') + '</button>' +
        '</div>');

      // 区域缩略图：天空 + 地表 + 点缀
      var tc = card.querySelector('.region-thumb');
      var g = tc.getContext('2d');
      var grad = g.createLinearGradient(0, 0, 0, 10);
      grad.addColorStop(0, r.skyTop); grad.addColorStop(1, r.skyBottom);
      g.fillStyle = grad; g.fillRect(0, 0, 26, 10);
      g.fillStyle = r.terrain.base.colors[0]; g.fillRect(0, 10, 26, 16);
      g.fillStyle = r.terrain.base.colors[1];
      for (var i = 0; i < 14; i++) g.fillRect((i * 7) % 26, 10 + (i * 5) % 16, 2, 2);
      if (r.terrain.patches[0]) {
        g.fillStyle = r.terrain.patches[0].colors[0];
        g.fillRect(4, 16, 7, 5); g.fillRect(16, 20, 6, 4);
      }

      var btn = card.querySelector('.go-btn');
      btn.disabled = !unlocked || isCurrent;
      btn.addEventListener('click', function () {
        if (Game.prog.gotoRegion(r.id)) {
          Game.ui.tabs.open('battle');
          Game.ui.modals.toast(t('ui.movedTo', { name: t('region.' + r.id + '.name') }));
        }
      });
      root.appendChild(card);
    });
  };

  /* ================= 设置面板 ================= */
  UI.panels.settings = function (root) {
    var t = Game.i18n.t;
    var s = Game.state;

    root.appendChild(U.el('div', 'panel-title', t('ui.tab.settings')));

    function toggleRow(label, hint, value, onChange) {
      var row = U.el('div', 'setting-row', '<div><div>' + label + '</div>' +
        (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>' +
        '<div class="toggle' + (value ? ' on' : '') + '"></div>');
      row.querySelector('.toggle').addEventListener('click', function () {
        var v = !this.classList.contains('on');
        this.classList.toggle('on', v);
        onChange(v);
      });
      return row;
    }

    // 语言
    var langRow = U.el('div', 'setting-row', '<div>' + t('settings.language') + '</div>');
    var sel = U.el('select');
    [['zh-CN', '简体中文'], ['en', 'English']].forEach(function (pair) {
      var opt = U.el('option', '', pair[1]);
      opt.value = pair[0];
      if (Game.i18n.locale() === pair[0]) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      s.settings.lang = sel.value;
      Game.i18n.setLocale(sel.value);
    });
    langRow.appendChild(sel);
    root.appendChild(langRow);

    // 特效
    root.appendChild(toggleRow(t('settings.effects'), t('settings.effectsHint'), s.settings.effects, function (v) {
      s.settings.effects = v;
      Game.particles.setEnabled(v);
    }));

    // 药水阈值
    var potRow = U.el('div', 'setting-row', '<div><div>' + t('settings.potion') + '</div>' +
      '<div class="hint" id="pot-val">' + Math.round(s.settings.potionThreshold * 100) + '%</div></div>');
    var slider = U.el('input');
    slider.type = 'range'; slider.min = '10'; slider.max = '90'; slider.step = '5';
    slider.value = Math.round(s.settings.potionThreshold * 100);
    slider.addEventListener('input', function () {
      s.settings.potionThreshold = slider.value / 100;
      potRow.querySelector('#pot-val').textContent = slider.value + '%';
    });
    potRow.appendChild(slider);
    root.appendChild(potRow);

    // 自动推进
    root.appendChild(toggleRow(t('settings.autoAdvance'), t('settings.autoAdvanceHint'), s.settings.autoAdvance, function (v) {
      s.settings.autoAdvance = v;
    }));

    // 音频（占位）
    root.appendChild(toggleRow(t('settings.sfx'), t('settings.comingSoon'), s.settings.sfx, function (v) {
      s.settings.sfx = v;
      Game.audio.setMuted('sfx', !v);
    }));
    root.appendChild(toggleRow(t('settings.music'), t('settings.comingSoon'), s.settings.music, function (v) {
      s.settings.music = v;
      Game.audio.setMuted('bgm', !v);
    }));

    /* ---- 存档 ---- */
    var saveHead = U.el('div', '', t('settings.saveSection'));
    saveHead.style.cssText = 'font-size:12px;color:var(--gold);margin:14px 0 6px;';
    root.appendChild(saveHead);

    var ta = U.el('textarea');
    ta.placeholder = t('settings.importPlaceholder');
    root.appendChild(ta);

    var rowBtns = U.el('div', '');
    rowBtns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;';

    var btnExport = U.el('button', 'btn small', t('settings.exportCopy'));
    btnExport.addEventListener('click', function () {
      var b64 = Game.save.exportB64();
      ta.value = b64;
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard) navigator.clipboard.writeText(b64).catch(function () {});
      Game.ui.modals.toast(t('settings.exported'));
    });
    rowBtns.appendChild(btnExport);

    var btnFile = U.el('button', 'btn small', t('settings.exportFile'));
    btnFile.addEventListener('click', function () { Game.save.exportFile(); });
    rowBtns.appendChild(btnFile);

    var btnImport = U.el('button', 'btn small gold', t('settings.importBtn'));
    btnImport.addEventListener('click', function () {
      var txt = ta.value.trim();
      if (!txt) { Game.ui.modals.toast(t('settings.importEmpty'), 'warn'); return; }
      Game.ui.modals.confirm(t('settings.importConfirm'), function () {
        var r = Game.save.importB64(txt);
        Game.ui.modals.toast(r.ok ? t('settings.importOk') : t('settings.importBad'), r.ok ? '' : 'warn');
      });
    });
    rowBtns.appendChild(btnImport);

    var fileWrap = U.el('label', 'btn small', t('settings.importFile'));
    var fileInput = U.el('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        Game.ui.modals.confirm(t('settings.importConfirm'), function () {
          var r = Game.save.importFileText(String(reader.result));
          Game.ui.modals.toast(r.ok ? t('settings.importOk') : t('settings.importBad'), r.ok ? '' : 'warn');
        });
      };
      reader.readAsText(f);
      fileInput.value = '';
    });
    fileWrap.appendChild(fileInput);
    rowBtns.appendChild(fileWrap);

    root.appendChild(rowBtns);

    // 重置
    var btnReset = U.el('button', 'btn small danger', t('settings.reset'));
    btnReset.style.marginTop = '12px';
    btnReset.addEventListener('click', function () {
      Game.ui.modals.confirm(t('settings.resetConfirm1'), function () {
        Game.ui.modals.confirm(t('settings.resetConfirm2'), function () {
          Game.save.hardReset();
        });
      });
    });
    root.appendChild(btnReset);

    // 关于
    var about = U.el('div', 'card', '<div class="desc">' + t('settings.about', { v: Game.VERSION }) + '</div>');
    about.style.marginTop = '12px';
    root.appendChild(about);
  };
})();
