/* ============================================================
 * ui/title.js — 开场体验
 * 标题画面：夜晚前线营地全景（星空/月亮/远山/帐篷/旗帜/营灯/
 * 补给/铺盖/炊具/篝火光晕/五职业围火坐席）
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
      var fireflies = [];
      var rng = U.seededRng(20260725);
      var stars = [];
      var grass = [];
      for (var i = 0; i < 84; i++) {
        stars.push({ x: rng(), y: rng() * 0.58, tw: rng() * 6.28, s: rng() < 0.2 ? 2 : 1 });
      }
      for (i = 0; i < 52; i++) {
        grass.push({ x: rng(), y: rng(), h: 2 + ((rng() * 4) | 0), p: rng() * 6.28 });
      }
      var heroes = [
        { id: 'hero_rogue', dx: -43, dy: -1, flip: false, phase: 0.2 },
        { id: 'hero_mage', dx: 43, dy: -1, flip: true, phase: 0.8 },
        { id: 'hero_fighter', dx: -72, dy: 31, flip: false, phase: 1.4 },
        { id: 'hero_cleric', dx: 72, dy: 31, flip: true, phase: 1.9 },
        { id: 'hero_ranger', dx: 4, dy: 57, flip: true, phase: 2.5 }
      ];
      var t0 = performance.now();

      function drawShadow(x, y, rx, alpha) {
        g.globalAlpha = alpha || 0.28;
        g.fillStyle = '#04050b';
        g.beginPath();
        g.ellipse(x, y + 2, rx, Math.max(2, rx * 0.24), 0, 0, 6.29);
        g.fill();
        g.globalAlpha = 1;
      }

      function drawSprite(id, frameName, x, y, scale, opts) {
        opts = opts || {};
        if (opts.shadow !== false) {
          var sp = Game.assets.sprite(id);
          drawShadow(x, y, Math.max(5, sp.w * scale * 0.26), opts.shadowAlpha || 0.25);
        }
        Game.assets.draw(g, id, frameName, x, y, {
          scale: scale,
          flip: !!opts.flip,
          alpha: opts.alpha
        });
      }

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
        hills('#151f3a', 26, h * 0.59, 1);
        hills('#0c1429', 20, h * 0.67, 3);

        // 地面
        var groundY = h * (h < 700 ? 0.60 : 0.68);
        var ground = g.createLinearGradient(0, groundY, 0, h);
        ground.addColorStop(0, '#17281e');
        ground.addColorStop(0.55, '#112219');
        ground.addColorStop(1, '#0b1712');
        g.fillStyle = ground;
        g.fillRect(0, groundY, w, h - groundY);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(0, groundY, w, 2);

        // 地平线灌木与树桩剪影
        g.fillStyle = '#0a1711';
        for (var bx = -12; bx < w + 18; bx += 24) {
          var bh = 5 + ((bx * 7 + 19) & 7);
          g.fillRect(bx, groundY - bh, 18, bh + 2);
          if (((bx / 24) | 0) % 3 === 0) {
            g.fillRect(bx + 8, groundY - bh - 8, 2, 9);
            g.fillRect(bx + 4, groundY - bh - 6, 6, 2);
          }
        }

        // 草叶与夜间微光
        for (var gi = 0; gi < grass.length; gi++) {
          var blade = grass[gi];
          var gx = blade.x * w;
          var gy = groundY + 12 + blade.y * Math.max(20, h - groundY - 22);
          var sway = Math.sin(tt * 1.2 + blade.p) * 1.4;
          g.globalAlpha = 0.22 + blade.y * 0.22;
          g.strokeStyle = blade.y > 0.55 ? '#47613f' : '#304b35';
          g.beginPath();
          g.moveTo(gx, gy);
          g.lineTo(gx + sway, gy - blade.h);
          g.stroke();
        }
        g.globalAlpha = 1;

        // 营地（居中，位于菜单上方）
        var cx = w / 2;
        var cy = h * (h < 700 ? 0.67 : 0.735);
        var sceneScale = U.clamp(w / 390, 0.84, 1.12) * (h < 700 ? 0.88 : 1);
        var propScale = 2.35 * sceneScale;
        var heroScale = 2.15 * sceneScale;
        var fireScale = 3.1 * sceneScale;

        // 磨损营地地垫 + 营火刻印
        var clearing = g.createRadialGradient(cx, cy + 27 * sceneScale, 12, cx, cy + 27 * sceneScale, 116 * sceneScale);
        clearing.addColorStop(0, 'rgba(91,67,42,0.82)');
        clearing.addColorStop(0.55, 'rgba(69,53,36,0.66)');
        clearing.addColorStop(1, 'rgba(32,31,25,0)');
        g.fillStyle = clearing;
        g.beginPath();
        g.ellipse(cx, cy + 27 * sceneScale, 148 * sceneScale, 76 * sceneScale, 0, 0, 6.29);
        g.fill();
        g.globalAlpha = 0.28;
        g.strokeStyle = '#b68d4b';
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(cx, cy + 18 * sceneScale, 28 * sceneScale, 14 * sceneScale, 0, 0, 6.29);
        g.stroke();
        for (var rune = 0; rune < 8; rune++) {
          var ra = rune / 8 * Math.PI * 2;
          g.fillStyle = rune % 2 ? '#b98d48' : '#dbc06d';
          g.fillRect(
            Math.round(cx + Math.cos(ra) * 35 * sceneScale) - 1,
            Math.round(cy + 18 * sceneScale + Math.sin(ra) * 18 * sceneScale) - 1,
            3,
            2
          );
        }
        g.globalAlpha = 1;

        // 篝火光晕
        var flick = 0.85 + 0.15 * Math.sin(tt * 9.3) * Math.sin(tt * 5.1 + 1);
        var fireY = cy + 20 * sceneScale;
        var gr = g.createRadialGradient(cx, fireY - 18 * sceneScale, 4, cx, fireY - 18 * sceneScale, 126 * sceneScale * flick);
        gr.addColorStop(0, 'rgba(255,190,90,0.44)');
        gr.addColorStop(0.45, 'rgba(225,122,42,0.15)');
        gr.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = gr;
        g.fillRect(cx - 140 * sceneScale, fireY - 150 * sceneScale, 280 * sceneScale, 250 * sceneScale);

        // 后景：公会旗、帐篷与营灯
        var swayFrame = (((tt / 1.1) | 0) % 2) ? 'idle1' : 'idle0';
        var lanternFrame = (((tt / 0.45) | 0) % 2) ? 'idle1' : 'idle0';
        drawSprite('camp_banner', swayFrame, cx - 128 * sceneScale, cy + 4 * sceneScale, propScale, { shadowAlpha: 0.3 });
        drawSprite('tent', 'idle0', cx - 86 * sceneScale, cy + 9 * sceneScale, 2.75 * sceneScale, { shadowAlpha: 0.34 });

        var lanternX = cx + 126 * sceneScale, lanternY = cy + 7 * sceneScale;
        var lg = g.createRadialGradient(lanternX, lanternY - 27 * sceneScale, 2, lanternX, lanternY - 27 * sceneScale, 46 * sceneScale);
        lg.addColorStop(0, 'rgba(255,205,96,0.40)');
        lg.addColorStop(1, 'rgba(240,145,40,0)');
        g.fillStyle = lg;
        g.fillRect(lanternX - 48 * sceneScale, lanternY - 74 * sceneScale, 96 * sceneScale, 96 * sceneScale);
        drawSprite('camp_lantern', lanternFrame, lanternX, lanternY, propScale, { shadowAlpha: 0.3 });

        // 中景：补给、铺盖和两段坐木
        drawSprite('camp_supply', 'idle0', cx - 112 * sceneScale, cy + 45 * sceneScale, propScale, { shadowAlpha: 0.28 });
        drawSprite('camp_bedroll', 'idle0', cx + 95 * sceneScale, cy + 53 * sceneScale, 2.15 * sceneScale, { shadowAlpha: 0.22 });
        drawSprite('camp_log', 'idle0', cx - 58 * sceneScale, cy + 42 * sceneScale, 2.15 * sceneScale, { shadowAlpha: 0.25 });
        drawSprite('camp_log', 'idle0', cx + 58 * sceneScale, cy + 42 * sceneScale, 2.15 * sceneScale, { shadowAlpha: 0.25, flip: true });

        // 五职业围坐，全部使用坐姿帧并朝向篝火
        for (var hi = 0; hi < heroes.length; hi++) {
          var hd = heroes[hi];
          var sitFrame = ((tt / 1.45 + hd.phase) | 0) % 2 === 0 ? 'sit0' : 'sit1';
          drawSprite(
            hd.id,
            sitFrame,
            cx + hd.dx * sceneScale,
            cy + hd.dy * sceneScale,
            heroScale,
            { flip: hd.flip, shadowAlpha: 0.32 }
          );
        }

        // 篝火与炊具置于队伍中央
        drawSprite('campfire', 'f' + (((tt / 0.14) | 0) % 4), cx, fireY, fireScale, { shadow: false });
        drawSprite('camp_cookpot', 'idle0', cx + 2 * sceneScale, fireY + 7 * sceneScale, 2.35 * sceneScale, { shadowAlpha: 0.18 });

        // 炊烟
        for (var smoke = 0; smoke < 3; smoke++) {
          var smokeK = (tt * 0.23 + smoke * 0.34) % 1;
          g.globalAlpha = 0.2 * (1 - smokeK);
          g.fillStyle = '#e7dfd0';
          g.fillRect(
            Math.round(cx - 3 + smoke * 3 + Math.sin(tt * 1.4 + smoke) * 3),
            Math.round(fireY - 49 * sceneScale - smokeK * 38 * sceneScale),
            smokeK > 0.55 ? 3 : 2,
            3
          );
        }
        g.globalAlpha = 1;

        // 火星
        if (Math.random() < 0.35) {
          embers.push({ x: cx + U.rand(-7, 7), y: fireY - 35 * sceneScale, vx: U.rand(-7, 7), vy: U.rand(-44, -24), t: 0, life: U.rand(0.8, 1.6) });
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

        // 营地边缘流萤
        if (fireflies.length < 10 && Math.random() < 0.05) {
          fireflies.push({
            x: cx + U.rand(-150, 150) * sceneScale,
            y: cy + U.rand(-40, 70) * sceneScale,
            p: U.rand(0, 6.28),
            life: U.rand(5, 9)
          });
        }
        for (var fi = fireflies.length - 1; fi >= 0; fi--) {
          var fly = fireflies[fi];
          fly.life -= 1 / 60;
          if (fly.life <= 0) { fireflies.splice(fi, 1); continue; }
          fly.x += Math.sin(tt * 1.1 + fly.p) * 0.14;
          fly.y += Math.cos(tt * 0.9 + fly.p) * 0.08;
          g.globalAlpha = 0.2 + 0.6 * Math.max(0, Math.sin(tt * 2.2 + fly.p));
          g.fillStyle = '#d7ee8a';
          g.fillRect(fly.x | 0, fly.y | 0, 2, 2);
        }
        g.globalAlpha = 1;

        // 暗角
        var vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
        vg.addColorStop(0, 'rgba(5,6,15,0)');
        vg.addColorStop(1, 'rgba(5,6,15,0.48)');
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
