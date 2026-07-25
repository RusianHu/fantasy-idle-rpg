/* ============================================================
 * ui/title.js — 开场体验
 * 标题画面：夜晚篝火营地全景（星空/月亮/远山/篝火光晕/五职业围坐）
 * + 像素 LOGO + 菜单；全屏职业选择：大立绘动画预览、左右浏览、
 * 六技能预览、二次确认。仅新玩家与迁移补选时出现，老玩家零打扰。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, reg = Game.reg;

  var titleRoot = null, titleRaf = 0;
  var csRoot = null, csRaf = 0;

  var T = Game.ui.title = {

    /* ================= 标题画面 ================= */
    show: function (onStart) {
      var t = Game.i18n.t;
      titleRoot = U.el('div', '');
      titleRoot.id = 'title-root';
      titleRoot.innerHTML =
        '<canvas id="title-canvas"></canvas>' +
        '<div class="title-ui">' +
        '<div class="title-logo">' + t('ui.titleLogo') +
        '<span class="title-sub">FANTASY IDLE RPG</span></div>' +
        '<div class="title-menu">' +
        '<button class="btn gold title-start">✦ ' + t('ui.titleStart') + ' ✦</button>' +
        '<button class="btn small title-lang">中文 / EN</button>' +
        '</div>' +
        '<div class="title-ver">v' + Game.VERSION + '</div>' +
        '</div>';
      document.getElementById('app').appendChild(titleRoot);

      titleRoot.querySelector('.title-start').addEventListener('click', function () {
        onStart();
      });
      titleRoot.querySelector('.title-lang').addEventListener('click', function () {
        var next = Game.i18n.locale() === 'zh-CN' ? 'en' : 'zh-CN';
        Game.state.settings.lang = next;
        Game.i18n.setLocale(next);
        titleRoot.querySelector('.title-logo').innerHTML =
          Game.i18n.t('ui.titleLogo') + '<span class="title-sub">FANTASY IDLE RPG</span>';
        titleRoot.querySelector('.title-start').innerHTML = '✦ ' + Game.i18n.t('ui.titleStart') + ' ✦';
      });

      T._runTitleScene();
    },

    hide: function () {
      if (csRaf) { cancelAnimationFrame(csRaf); csRaf = 0; }
      if (csRoot && csRoot.parentNode) { csRoot.parentNode.removeChild(csRoot); csRoot = null; }
      if (!titleRoot) return;
      var el = titleRoot;
      titleRoot = null;
      el.classList.add('fade-out');
      setTimeout(function () {
        if (titleRaf) { cancelAnimationFrame(titleRaf); titleRaf = 0; }
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 750);
    },

    _runTitleScene: function () {
      var cv = titleRoot.querySelector('#title-canvas');
      var wrap = titleRoot;
      var g = cv.getContext('2d');
      var embers = [];
      var rng = U.seededRng(20260725);
      var stars = [];
      for (var i = 0; i < 70; i++) stars.push({ x: rng(), y: rng() * 0.55, tw: rng() * 6.28, s: rng() < 0.25 ? 2 : 1 });
      var heroes = [
        { id: 'hero_fighter', dx: -52, frame: 'walk_r0' },
        { id: 'hero_rogue', dx: -30, frame: 'walk_r0' },
        { id: 'hero_mage', dx: 32, frame: 'walk_l0' },
        { id: 'hero_cleric', dx: 54, frame: 'walk_l0' },
        { id: 'hero_ranger', dx: 0, frame: 'sit0' }
      ];
      var t0 = performance.now();

      function frame(now) {
        if (!titleRoot) return;
        var tt = (now - t0) / 1000;
        var w = wrap.clientWidth, h = wrap.clientHeight;
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        g.imageSmoothingEnabled = false;

        // 夜空
        var sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#070a1e');
        sky.addColorStop(0.55, '#101736');
        sky.addColorStop(1, '#1a2545');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
        // 星
        for (var si = 0; si < stars.length; si++) {
          var st = stars[si];
          g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(tt * 1.6 + st.tw));
          g.fillStyle = '#dce8ff';
          g.fillRect((st.x * w) | 0, (st.y * h) | 0, st.s, st.s);
        }
        g.globalAlpha = 1;
        // 月亮
        g.fillStyle = '#f0ecd8';
        g.beginPath(); g.arc(w * 0.78, h * 0.14, 13, 0, 6.29); g.fill();
        g.fillStyle = 'rgba(200,196,170,0.7)';
        g.fillRect(w * 0.78 - 4, h * 0.14 - 3, 4, 3);
        g.globalAlpha = 0.15;
        g.beginPath(); g.arc(w * 0.78, h * 0.14, 21, 0, 6.29); g.fill();
        g.globalAlpha = 1;

        // 远山两层
        function hills(color, amp, base, phase) {
          g.fillStyle = color;
          g.beginPath();
          g.moveTo(0, h);
          for (var x = 0; x <= w; x += 8) {
            g.lineTo(x, base - Math.sin(x * 0.008 + phase) * amp - Math.sin(x * 0.02 + phase * 2) * amp * 0.4);
          }
          g.lineTo(w, h);
          g.fill();
        }
        hills('#131c33', 26, h * 0.62, 1);
        hills('#0d1426', 20, h * 0.70, 3);

        // 地面
        g.fillStyle = '#152218';
        g.fillRect(0, h * 0.74, w, h);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, h * 0.74, w, 2);

        // 营地（居中，位于菜单上方）
        var cx = w / 2, cy = h * 0.76;
        var S = 3;
        // 篝火光晕
        var flick = 0.85 + 0.15 * Math.sin(tt * 9.3) * Math.sin(tt * 5.1 + 1);
        var gr = g.createRadialGradient(cx, cy - 8, 4, cx, cy - 8, 90 * flick);
        gr.addColorStop(0, 'rgba(255,190,90,0.34)');
        gr.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = gr;
        g.fillRect(cx - 100, cy - 108, 200, 200);
        // 五职业围坐 + 篝火
        for (var hi = 0; hi < heroes.length; hi++) {
          var hd = heroes[hi];
          var f = hd.frame;
          if (f.indexOf('walk') === 0) {
            f = f.slice(0, -1) + (((tt / 0.5 + hi) | 0) % 2);
          } else if (f === 'sit0') {
            f = ((tt / 1.4 + hi) | 0) % 2 === 0 ? 'sit0' : 'sit1';
          }
          var spr = Game.assets.sprite(hd.id);
          var fr = spr.frames[f] || spr.frames.idle0;
          var hx = cx + hd.dx * (S / 2.4);
          var hy = cy + (hd.dx === 0 ? 16 : 4);
          g.globalAlpha = 0.25;
          g.fillStyle = '#000';
          g.beginPath(); g.ellipse(hx, hy + 2, 8, 2.6, 0, 0, 6.29); g.fill();
          g.globalAlpha = 1;
          g.drawImage(fr, Math.round(hx - spr.anchor.x * 1.6), Math.round(hy - spr.anchor.y * 1.6),
            Math.round(fr.width * 1.6), Math.round(fr.height * 1.6));
        }
        var cfr = Game.assets.frame('campfire', 'f' + (((tt / 0.14) | 0) % 4));
        g.drawImage(cfr, Math.round(cx - cfr.width * S / 2), Math.round(cy - 8 - cfr.height * S + 10),
          cfr.width * S, cfr.height * S);

        // 火星
        if (Math.random() < 0.35) {
          embers.push({ x: cx + U.rand(-5, 5), y: cy - 26, vx: U.rand(-6, 6), vy: U.rand(-40, -22), t: 0, life: U.rand(0.8, 1.6) });
        }
        for (var ei = embers.length - 1; ei >= 0; ei--) {
          var em = embers[ei];
          em.t += 1 / 60;
          em.x += em.vx / 60; em.y += em.vy / 60;
          if (em.t > em.life) { embers.splice(ei, 1); continue; }
          g.globalAlpha = 1 - em.t / em.life;
          g.fillStyle = Math.random() < 0.5 ? '#f8d060' : '#f08838';
          g.fillRect(em.x | 0, em.y | 0, 2, 2);
        }
        g.globalAlpha = 1;

        // 暗角
        var vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
        vg.addColorStop(0, 'rgba(5,6,15,0)');
        vg.addColorStop(1, 'rgba(5,6,15,0.55)');
        g.fillStyle = vg;
        g.fillRect(0, 0, w, h);

        titleRaf = requestAnimationFrame(frame);
      }
      titleRaf = requestAnimationFrame(frame);
    },

    /* ================= 全屏职业选择 ================= */
    classSelect: function (onPick) {
      var t = Game.i18n.t;
      var classes = reg.all('class');
      var idx = 0;
      var dims = ['hp', 'atk', 'def', 'spd', 'burst'];

      csRoot = U.el('div', '');
      csRoot.id = 'class-root';
      csRoot.innerHTML =
        '<div class="cs-inner jrpg-box">' +
        '<h2>' + t('ui.classTitle') + '</h2>' +
        '<div class="cs-stage">' +
        '<button class="cs-arrow" data-dir="-1">◀</button>' +
        '<canvas class="cs-canvas" width="132" height="128"></canvas>' +
        '<button class="cs-arrow" data-dir="1">▶</button>' +
        '</div>' +
        '<div class="cs-name"></div>' +
        '<div class="cs-desc"></div>' +
        '<div class="cs-dots"></div>' +
        '<div class="cs-skills"></div>' +
        '<button class="btn gold cs-confirm"></button>' +
        '<div class="cs-hint">' + t('ui.classHint2') + '</div>' +
        '</div>';
      document.getElementById('app').appendChild(csRoot);

      var cv = csRoot.querySelector('.cs-canvas');
      var g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;

      function renderInfo() {
        var cls = classes[idx];
        var traits = (cls.traits || []).map(function (tr) {
          return '<span class="badge">' + t('ui.trait.' + tr) + '</span>';
        }).join('');
        csRoot.querySelector('.cs-name').innerHTML =
          t('class.' + cls.id + '.name') + ' ' + traits +
          '<span class="cs-page">' + (idx + 1) + '/' + classes.length + '</span>';
        csRoot.querySelector('.cs-desc').textContent = t('class.' + cls.id + '.desc');
        csRoot.querySelector('.cs-dots').innerHTML = dims.map(function (k) {
          var n = cls.statDots[k] || 0;
          var full = '', empty = '';
          for (var i2 = 0; i2 < n; i2++) full += '●';
          for (var j2 = n; j2 < 5; j2++) empty += '●';
          return '<span>' + t('ui.dim.' + k) + ' <b>' + full + '</b><i>' + empty + '</i></span>';
        }).join('');

        var skillsHtml = '<div class="cs-skill-head">' + t('ui.csSkills') + '</div>';
        (cls.skills || []).forEach(function (sid) {
          var sk = reg.get('skill', sid);
          if (!sk) return;
          var previewRank = sk.type === 'active' ? 0 : 1;
          var vars = sk.descVars ? sk.descVars(previewRank) : {};
          var typeTxt = sk.type === 'active' ? t('ui.skillActive', { cd: sk.cd }) : t('ui.skillPassive');
          skillsHtml += '<div class="cs-skill-row">' +
            '<canvas width="20" height="20" data-icon="' + sk.icon + '"></canvas>' +
            '<div><b>' + t('skill.' + sid + '.name') + '</b> <em>' + typeTxt + '</em><br>' +
            '<span>' + t('skill.' + sid + '.desc', vars) + '</span></div></div>';
        });
        csRoot.querySelector('.cs-skills').innerHTML = skillsHtml;
        Game.ui.renderIcons(csRoot.querySelector('.cs-skills'));

        csRoot.querySelector('.cs-confirm').textContent =
          t('ui.csConfirmBtn', { name: t('class.' + cls.id + '.name') });
      }

      function step(dir) {
        idx = (idx + dir + classes.length) % classes.length;
        renderInfo();
      }

      U.$$('#class-root .cs-arrow').forEach(function (b) {
        b.addEventListener('click', function () { step(parseInt(b.getAttribute('data-dir'), 10)); });
      });
      // 触摸滑动切换
      var swipeX = null;
      csRoot.addEventListener('touchstart', function (e) { swipeX = e.touches[0].clientX; }, { passive: true });
      csRoot.addEventListener('touchend', function (e) {
        if (swipeX === null) return;
        var dx = e.changedTouches[0].clientX - swipeX;
        if (Math.abs(dx) > 46) step(dx < 0 ? 1 : -1);
        swipeX = null;
      }, { passive: true });

      csRoot.querySelector('.cs-confirm').addEventListener('click', function () {
        var cls = classes[idx];
        Game.ui.modals.confirm(t('ui.classConfirm', { name: t('class.' + cls.id + '.name') }), function () {
          if (csRaf) { cancelAnimationFrame(csRaf); csRaf = 0; }
          if (csRoot && csRoot.parentNode) csRoot.parentNode.removeChild(csRoot);
          csRoot = null;
          onPick(cls.id);
        });
      });

      // 立绘动画：行走四方向轮播 + 周期性攻击演示
      var t0 = performance.now();
      var DIRS = ['d', 'r', 'u', 'l'];
      function anim(now) {
        if (!csRoot) return;
        var tt = (now - t0) / 1000;
        var cls = classes[idx];
        var cycle = tt % 10;
        var frame;
        if (cycle > 8.6) {
          frame = 'attack_r';
        } else {
          var dir = DIRS[((cycle / 2.15) | 0) % 4];
          frame = 'walk_' + dir + (((tt / 0.28) | 0) % 2);
        }
        var spr = Game.assets.sprite('hero_' + cls.id);
        var fr = spr.frames[frame] || spr.frames.walk_d0;
        g.clearRect(0, 0, cv.width, cv.height);
        // 展示台
        g.fillStyle = 'rgba(216,180,90,0.12)';
        g.beginPath(); g.ellipse(cv.width / 2, cv.height - 14, 34, 9, 0, 0, 6.29); g.fill();
        g.strokeStyle = 'rgba(216,180,90,0.4)';
        g.beginPath(); g.ellipse(cv.width / 2, cv.height - 14, 34, 9, 0, 0, 6.29); g.stroke();
        var S = 5;
        g.drawImage(fr,
          Math.round(cv.width / 2 - spr.anchor.x * S),
          Math.round(cv.height - 16 - spr.anchor.y * S),
          fr.width * S, fr.height * S);
        csRaf = requestAnimationFrame(anim);
      }
      renderInfo();
      csRaf = requestAnimationFrame(anim);
    }
  };
})();
