/* ============================================================
 * ui/title.js — 开场体验
 * 标题画面：统一半分辨率 2× 像素网格的半俯视悬崖营地（雪山/密林/
 * 巨兽巢穴/蜿蜒河流/石桥/极远小比例魔王城/近岸哨戒/四人围火）
 * + 像素 LOGO + 公会远征档案；全屏职业选择：大立绘动画预览、
 * 左右浏览、六技能预览、二次确认。档案界面用稳定槽位 ID 和数组
 * 渲染，当前只开放单槽，保留未来多档扩展能力。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, reg = Game.reg;

  var titleRoot = null, titleRaf = 0, titleEnterTimer = 0;
  var titleOptions = null, titleSlots = [];
  var csRoot = null, csRaf = 0;

  var T = Game.ui.title = {

    /* ================= 标题画面 ================= */
    makeSlots: function (opts) {
      opts = opts || {};
      var defs = Game.save && Game.save.slots ? Game.save.slots() :
        [{ id: 'expedition-1', index: 1 }];
      var s = Game.state;
      var occupied = !!opts.occupied;
      var hasClass = occupied && Game.player.hasClass();
      return defs.map(function (def) {
        return {
          id: def.id,
          index: def.index,
          occupied: occupied,
          kind: !occupied ? 'empty' : (hasClass ? 'active' : 'draft'),
          classId: hasClass ? s.player.classId : null,
          level: hasClass ? s.player.level : 1,
          regionId: s.world.region,
          highestRegion: Math.max(1, Number(s.meta.stats.highestRegion) || 1),
          regionCount: Game.State.regionOrder().length,
          playSec: Number(s.meta.stats.playSec) || 0,
          savedAt: occupied ? Game.save.lastTs() : 0,
          worldSeed: s.world.worldSeed >>> 0
        };
      });
    },

    show: function (opts) {
      if (typeof opts === 'function') opts = { onSelect: opts };
      opts = opts || {};
      titleOptions = opts;
      titleSlots = Array.isArray(opts.slots) && opts.slots.length ?
        opts.slots : T.makeSlots({ occupied: false });
      var t = Game.i18n.t;
      titleRoot = U.el('div', '');
      titleRoot.id = 'title-root';
      titleRoot.innerHTML =
        '<canvas id="title-canvas"></canvas>' +
        '<div class="title-ui">' +
        '<button class="title-reveal" type="button">' +
        '<span class="title-reveal-prompt"><strong></strong><i aria-hidden="true"></i></span>' +
        '</button>' +
        '<button class="title-lang" type="button"><span aria-hidden="true">文</span><strong></strong></button>' +
        '<div class="title-logo"><span class="title-logo-main">' + t('ui.titleLogo') + '</span>' +
        '<span class="title-sub">FANTASY IDLE RPG</span></div>' +
        '<section class="title-archive" aria-labelledby="title-archive-heading" aria-hidden="true" inert>' +
        '<div class="archive-heading">' +
        '<button class="archive-view" type="button"><span aria-hidden="true"><i></i></span></button>' +
        '<span class="archive-heading-copy"><small class="archive-kicker"></small>' +
        '<strong id="title-archive-heading" class="archive-title"></strong></span>' +
        '<span class="archive-capacity"></span>' +
        '</div>' +
        '<div class="title-slots" role="list"></div>' +
        '<div class="archive-footer"><span class="archive-hint"></span><span class="archive-last"></span></div>' +
        '<button class="title-new-game" type="button"><i aria-hidden="true"></i>' +
        '<span class="title-new-game-copy"><strong></strong><small></small></span></button>' +
        '</section>' +
        '<div class="title-ver">v' + Game.VERSION + '</div>' +
        '<div class="title-entry-fx" aria-hidden="true">' +
        '<div class="entry-beam"></div><div class="entry-ring"><i></i></div>' +
        '<div class="entry-pixels"></div><div class="entry-copy"></div>' +
        '</div>' +
        '</div>';
      document.getElementById('app').appendChild(titleRoot);

      var slotsRoot = titleRoot.querySelector('.title-slots');
      titleSlots.forEach(function (slot) {
        var wrap = U.el('div', 'title-slot-wrap' + (slot.occupied ? ' has-delete' : ''));
        wrap.setAttribute('role', 'listitem');
        var button = U.el('button', 'title-slot title-start slot-' + slot.kind);
        button.type = 'button';
        button.setAttribute('data-slot-id', slot.id);
        button.setAttribute('data-slot-kind', slot.kind);
        button.innerHTML =
          '<span class="slot-number"><small>SLOT</small><b>' +
          ('0' + slot.index).slice(-2) + '</b></span>' +
          '<span class="slot-portrait"><canvas width="56" height="56"></canvas><i aria-hidden="true"></i></span>' +
          '<span class="slot-copy"><strong class="slot-name"></strong>' +
          '<span class="slot-location"></span><span class="slot-meta"></span></span>' +
          '<span class="slot-action"><span></span><i aria-hidden="true"></i></span>';
        button.addEventListener('click', function () {
          if (titleRoot.classList.contains('is-entering')) return;
          titleRoot.setAttribute('data-selected-slot', slot.id);
          if (titleOptions.onSelect) titleOptions.onSelect(slot);
        });
        wrap.appendChild(button);
        if (slot.occupied) {
          var deleteButton = U.el('button', 'slot-delete');
          deleteButton.type = 'button';
          deleteButton.innerHTML = '<i aria-hidden="true"></i>';
          deleteButton.addEventListener('click', function (event) {
            event.stopPropagation();
            if (titleRoot.classList.contains('is-entering')) return;
            if (titleOptions.onDelete) titleOptions.onDelete(slot);
          });
          wrap.appendChild(deleteButton);
        }
        slotsRoot.appendChild(wrap);
        T._drawSlotPortrait(button.querySelector('canvas'), slot);
      });

      var newGame = titleRoot.querySelector('.title-new-game');
      newGame.hidden = !titleSlots.some(function (slot) { return slot.occupied; });
      titleRoot.querySelector('.title-archive').classList.toggle('has-new-game', !newGame.hidden);
      newGame.addEventListener('click', function () {
        if (titleRoot.classList.contains('is-entering')) return;
        if (titleOptions.onNewGame) titleOptions.onNewGame();
      });

      titleRoot.querySelector('.title-reveal').addEventListener('click', function () {
        if (titleRoot.classList.contains('is-entering')) return;
        T.setArchiveOpen(true, true);
      });

      titleRoot.querySelector('.archive-view').addEventListener('click', function () {
        if (titleRoot.classList.contains('is-entering')) return;
        T.setArchiveOpen(false, true);
      });

      titleRoot.querySelector('.title-lang').addEventListener('click', function () {
        if (titleRoot.classList.contains('is-entering')) return;
        var next = Game.i18n.locale() === 'zh-CN' ? 'en' : 'zh-CN';
        Game.state.settings.lang = next;
        Game.i18n.setLocale(next);
        T._refreshTitleCopy();
      });

      T._refreshTitleCopy();
      T._runTitleScene();
    },

    setArchiveOpen: function (open, moveFocus) {
      if (!titleRoot || titleRoot.classList.contains('is-entering')) return;
      var archive = titleRoot.querySelector('.title-archive');
      var reveal = titleRoot.querySelector('.title-reveal');
      if (!archive || !reveal) return;

      titleRoot.classList.toggle('is-archive-open', !!open);
      archive.setAttribute('aria-hidden', open ? 'false' : 'true');
      reveal.setAttribute('aria-hidden', open ? 'true' : 'false');
      if (open) {
        archive.removeAttribute('inert');
        reveal.setAttribute('tabindex', '-1');
        if (moveFocus) {
          var slot = archive.querySelector('.title-slot');
          if (slot) slot.focus({ preventScroll: true });
        }
      } else {
        archive.setAttribute('inert', '');
        reveal.removeAttribute('tabindex');
        if (moveFocus) reveal.focus({ preventScroll: true });
      }
    },

    _drawSlotPortrait: function (canvas, slot) {
      if (!canvas) return;
      var g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = '#080b18';
      g.fillRect(0, 0, 56, 56);
      g.fillStyle = slot.kind === 'active' ? '#243253' : '#151a32';
      g.fillRect(3, 3, 50, 50);
      g.fillStyle = slot.kind === 'active' ? '#9b7832' : '#343a62';
      g.fillRect(6, 47, 44, 2);
      if (slot.classId) {
        g.fillStyle = '#d8b45a22';
        g.fillRect(10, 9, 36, 36);
        // 档案使用专用 12×12 职业肖像，而不是把完整站姿硬塞进小框。
        // 按精灵实际尺寸计算整数倍居中，帽檐、发梢和肩部都必须完整保留。
        var face = Game.assets.sprite('face_' + slot.classId);
        var frame = face && face.frames.icon;
        if (frame) {
          var scale = Math.max(1, Math.min(3, Math.floor(44 / Math.max(frame.width, frame.height))));
          var dw = frame.width * scale, dh = frame.height * scale;
          var dx = Math.floor((56 - dw) / 2);
          var dy = Math.floor((54 - dh) / 2);
          g.drawImage(frame, 0, 0, frame.width, frame.height, dx, dy, dw, dh);
          canvas.setAttribute('data-portrait-mode', 'face');
        }
        return;
      }
      // 空档/草稿使用字符网格绘制的公会羽剑纹章，不依赖 Emoji 或外部图标。
      var ink = slot.kind === 'draft' ? '#d8b45a' : '#6d7398';
      var hi = slot.kind === 'draft' ? '#f0d47b' : '#9da2bd';
      g.fillStyle = ink;
      g.fillRect(27, 11, 3, 25);
      g.fillRect(24, 14, 9, 3);
      g.fillRect(21, 17, 9, 3);
      g.fillRect(20, 20, 8, 3);
      g.fillRect(22, 23, 6, 3);
      g.fillRect(24, 26, 4, 12);
      g.fillRect(20, 36, 14, 3);
      g.fillRect(25, 39, 4, 5);
      g.fillStyle = hi;
      g.fillRect(28, 12, 2, 23);
      g.fillRect(22, 18, 5, 2);
    },

    _refreshTitleCopy: function () {
      if (!titleRoot) return;
      var t = Game.i18n.t;
      var locale = Game.i18n.locale();
      titleRoot.querySelector('.title-logo-main').textContent = t('ui.titleLogo');
      var reveal = titleRoot.querySelector('.title-reveal');
      reveal.querySelector('strong').textContent = t('ui.titleEnter');
      reveal.setAttribute('aria-label', t('ui.titleEnter'));
      var view = titleRoot.querySelector('.archive-view');
      view.setAttribute('aria-label', t('ui.titleViewCamp'));
      view.title = t('ui.titleViewCamp');
      titleRoot.querySelector('.archive-kicker').textContent = t('ui.titleArchiveKicker');
      titleRoot.querySelector('.archive-title').textContent = t('ui.titleArchive');
      titleRoot.querySelector('.archive-capacity').textContent =
        t('ui.titleSlotCount', { current: 1, total: titleSlots.length });
      titleRoot.querySelector('.archive-hint').textContent = t('ui.titleSlotHint');
      titleRoot.querySelector('.title-new-game strong').textContent = t('ui.titleNewGame');
      titleRoot.querySelector('.title-new-game small').textContent = t('ui.titleNewGameSub');
      titleRoot.querySelector('.title-new-game').setAttribute('aria-label', t('ui.titleNewGame'));
      var lang = titleRoot.querySelector('.title-lang');
      lang.querySelector('strong').textContent = locale === 'zh-CN' ? '中' : 'EN';
      lang.setAttribute('aria-label', t('ui.titleLanguage'));
      lang.title = t('ui.titleLanguage');

      titleSlots.forEach(function (slot) {
        var root = titleRoot.querySelector('[data-slot-id="' + slot.id + '"]');
        if (!root) return;
        var name, location, meta, action;
        if (slot.kind === 'active') {
          name = t('ui.titleSlotHero', {
            level: slot.level,
            className: t('class.' + slot.classId + '.name')
          });
          location = t('ui.titleSlotLocation', {
            region: t('region.' + slot.regionId + '.name')
          });
          meta = t('ui.titleSlotProgress', {
            time: Game.i18n.fmtDur(slot.playSec),
            current: slot.highestRegion,
            total: slot.regionCount
          });
          action = t('ui.titleContinue');
        } else if (slot.kind === 'draft') {
          name = t('ui.titleSlotDraft');
          location = t('ui.titleSlotDraftDesc');
          meta = t('ui.titleSlotSeed', { seed: U.hex32(slot.worldSeed) });
          action = t('ui.titleResumeDraft');
        } else {
          name = t('ui.titleSlotEmpty');
          location = t('ui.titleSlotEmptyDesc');
          meta = t('ui.titleSlotNewWorld');
          action = t('ui.titleCreate');
        }
        root.querySelector('.slot-name').textContent = name;
        root.querySelector('.slot-location').textContent = location;
        root.querySelector('.slot-meta').textContent = meta;
        root.querySelector('.slot-action span').textContent = action;
        root.setAttribute('aria-label', action + ' · ' + name + ' · ' + location);
        var deleteButton = root.parentNode.querySelector('.slot-delete');
        if (deleteButton) {
          deleteButton.setAttribute('aria-label', t('ui.titleDeleteSave'));
          deleteButton.title = t('ui.titleDeleteSave');
        }
      });

      var first = titleSlots[0];
      var last = '';
      if (first && first.savedAt) {
        try {
          last = new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            hour12: false
          }).format(new Date(first.savedAt));
        } catch (e) { last = ''; }
      }
      titleRoot.querySelector('.archive-last').textContent = first && first.savedAt ?
        t('ui.titleLastSave', { time: last }) : t('ui.titleLocalSave');
      var selected = titleRoot.getAttribute('data-selected-slot');
      var selectedSlot = titleSlots.filter(function (slot) { return slot.id === selected; })[0] || first;
      titleRoot.querySelector('.entry-copy').textContent = selectedSlot && selectedSlot.kind === 'empty' ?
        t('ui.titleOpeningNew') : t('ui.titleOpeningSave');
    },

    enter: function (onReady) {
      if (!titleRoot || titleRoot.classList.contains('is-entering')) return;
      var selectedId = titleRoot.getAttribute('data-selected-slot') ||
        (titleSlots[0] && titleSlots[0].id);
      var selected = selectedId && titleRoot.querySelector('[data-slot-id="' + selectedId + '"]');
      if (selected) selected.classList.add('selected');
      titleRoot.querySelectorAll('button').forEach(function (button) { button.disabled = true; });
      titleRoot.classList.add('is-entering');
      T._refreshTitleCopy();
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      titleEnterTimer = setTimeout(function () {
        titleEnterTimer = 0;
        if (onReady) onReady();
      }, reduced ? 100 : 1180);
    },

    hide: function () {
      if (titleEnterTimer) { clearTimeout(titleEnterTimer); titleEnterTimer = 0; }
      if (csRaf) { cancelAnimationFrame(csRaf); csRaf = 0; }
      if (csRoot && csRoot.parentNode) { csRoot.parentNode.removeChild(csRoot); csRoot = null; }
      if (!titleRoot) return;
      var el = titleRoot;
      titleRoot = null;
      el.classList.add('fade-out');
      setTimeout(function () {
        if (titleRaf) { cancelAnimationFrame(titleRaf); titleRaf = 0; }
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 620);
    },

    _runTitleScene: function () {
      var cv = titleRoot.querySelector('#title-canvas');
      var wrap = titleRoot;
      var g = cv.getContext('2d');
      var pixelVista = document.createElement('canvas');
      var pg = pixelVista.getContext('2d');
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
        { id: 'hero_ranger', dx: 4, dy: 57, flip: true, phase: 2.5, sentry: true }
      ];
      var t0 = performance.now();
      var lastSceneWidth = 0, lastSceneHeight = 0;

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

      function drawMistBand(w, y, tt, speed, color, alpha, phase) {
        g.save();
        g.globalAlpha = alpha;
        g.fillStyle = color;
        for (var mi = 0; mi < 8; mi++) {
          var mw = 42 + (mi % 3) * 18;
          var mx = ((mi * 71 + tt * speed + phase * 37) % (w + 150)) - 90;
          var my = y + Math.sin(mi * 1.7 + phase) * 7;
          g.fillRect(Math.round(mx), Math.round(my), mw, 3);
          g.fillRect(Math.round(mx + 12), Math.round(my - 3), mw - 20, 3);
          g.fillRect(Math.round(mx + 22), Math.round(my + 3), mw - 8, 2);
        }
        g.restore();
      }

      function drawDemonCastle(centerX, baseY, scale, tt) {
        g.save();
        var px = function (n) { return Math.round(n); };
        var back = '#15192a';
        var body = '#1d2032';
        var face = '#292b3d';
        var roof = '#0d101c';
        var glow = '#d26b7e';

        function rect(x, y, w, h, color) {
          g.fillStyle = color;
          g.fillRect(px(x), px(y), Math.max(1, px(w)), Math.max(1, px(h)));
        }

        function poly(points, color) {
          g.fillStyle = color;
          g.beginPath();
          g.moveTo(px(points[0][0]), px(points[0][1]));
          for (var pp = 1; pp < points.length; pp++) {
            g.lineTo(px(points[pp][0]), px(points[pp][1]));
          }
          g.closePath();
          g.fill();
        }

        function light(x, y) {
          g.globalAlpha = 0.58 + 0.25 * Math.sin(tt * 1.25 + x * 0.07);
          rect(x, y, 2 * scale, 3 * scale, glow);
          g.globalAlpha = 1;
        }

        function tower(dx, lift, width, height, spire, far) {
          var x = centerX + dx * scale;
          var bottom = baseY - lift * scale;
          var top = bottom - height * scale;
          var w2 = width * scale;
          rect(x - w2 / 2, top, w2, height * scale, far ? back : body);
          rect(x + w2 / 2 - 3 * scale, top + 4 * scale, 3 * scale, height * scale - 4 * scale, far ? '#0d1120' : face);
          poly([
            [x - w2 * 0.66, top],
            [x, top - spire * scale],
            [x + w2 * 0.66, top]
          ], roof);
          for (var ty = top + 18 * scale; ty < bottom - 8 * scale; ty += 21 * scale) {
            light(x - scale, ty);
          }
        }

        // 远景城塞只保留可读的天际线与微弱门火
        var cg = g.createRadialGradient(centerX, baseY - 54 * scale, 3, centerX, baseY - 54 * scale, 96 * scale);
        cg.addColorStop(0, 'rgba(178,79,104,0.15)');
        cg.addColorStop(1, 'rgba(93,54,90,0)');
        g.fillStyle = cg;
        g.fillRect(centerX - 100 * scale, baseY - 160 * scale, 200 * scale, 170 * scale);

        // 山口外墙以轻微斜角落入地形
        poly([
          [centerX - 76 * scale, baseY - 30 * scale],
          [centerX + 72 * scale, baseY - 38 * scale],
          [centerX + 82 * scale, baseY],
          [centerX - 86 * scale, baseY + 5 * scale]
        ], back);
        rect(centerX - 74 * scale, baseY - 42 * scale, 148 * scale, 14 * scale, body);
        for (var bi = 0; bi < 10; bi++) {
          rect(centerX - 72 * scale + bi * 15 * scale, baseY - 48 * scale, 5 * scale, 7 * scale, body);
        }

        tower(-52, 25, 19, 45, 19, true);
        tower(50, 29, 18, 51, 21, true);
        tower(-27, 33, 23, 69, 26, false);
        tower(31, 38, 22, 77, 29, false);
        tower(2, 43, 28, 103, 39, false);

        g.globalAlpha = 0.7 + Math.sin(tt * 1.2) * 0.12;
        rect(centerX - 5 * scale, baseY - 28 * scale, 11 * scale, 27 * scale, '#ad536d');
        rect(centerX - 2 * scale, baseY - 24 * scale, 5 * scale, 23 * scale, '#ef9a83');
        g.globalAlpha = 1;
        g.restore();
      }

      function drawPixelVista(w, h, tt) {
        var bw = Math.ceil(w / 2);
        var bh = Math.ceil(h / 2);
        if (pixelVista.width !== bw || pixelVista.height !== bh) {
          pixelVista.width = bw;
          pixelVista.height = bh;
        }
        pg.imageSmoothingEnabled = false;
        var horizonY = Math.round(bh * 0.37);
        var snowBaseY = Math.round(bh * 0.505);
        var valleyTopY = Math.round(bh * 0.495);
        var cliffY = Math.round(bh * 0.695);
        var cliffBaseY = cliffY - Math.max(22, Math.round(bh * 0.042));
        var campX = Math.round(bw * 0.46);
        var campY = Math.round(bh * 0.758);
        var cliffRidgeHalfX = Math.round(bw * 0.62);
        var sentryHalfX = Math.round(bw * 0.68);

        function rect(x, y, rw, rh, color, alpha) {
          pg.globalAlpha = alpha == null ? 1 : alpha;
          pg.fillStyle = color;
          pg.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(rw)), Math.max(1, Math.round(rh)));
          pg.globalAlpha = 1;
        }

        function poly(points, color, alpha) {
          pg.globalAlpha = alpha == null ? 1 : alpha;
          pg.fillStyle = color;
          pg.beginPath();
          pg.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
          for (var pp = 1; pp < points.length; pp++) {
            pg.lineTo(Math.round(points[pp][0]), Math.round(points[pp][1]));
          }
          pg.closePath();
          pg.fill();
          pg.globalAlpha = 1;
        }

        function pixelDisc(x, y, r, color) {
          pg.fillStyle = color;
          for (var dy = -r; dy <= r; dy++) {
            var span = Math.floor(Math.sqrt(r * r - dy * dy));
            pg.fillRect(Math.round(x - span), Math.round(y + dy), span * 2 + 1, 1);
          }
        }

        function hash01(a, b) {
          var value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
          return value - Math.floor(value);
        }

        function conifer(x, y, size, palette, seed) {
          size = Math.max(2, Math.round(size));
          var crownTop = y - size * 4 - 2;
          rect(x, y - size * 3, 1, size * 3 + 2, palette.trunk);
          rect(x - 1, y - 1, 3, 1, palette.trunk);

          // 相互覆盖的像素枝团形成不规则冷杉轮廓，不画规则三角或横条
          for (var tier = 0; tier < 4; tier++) {
            var clusterY = crownTop + 1 + tier * size;
            var radius = Math.max(1, Math.round(size * (0.5 + tier * 0.18)));
            var lean = ((seed + tier * 5) % 3) - 1;
            pixelDisc(x + lean, clusterY + radius, radius, tier < 2 ? palette.mid : palette.dark);
            if (tier > 0) {
              pixelDisc(x - 1 - lean, clusterY + radius + 1, Math.max(1, radius - 1), palette.dark);
            }
          }
          rect(x + (seed % 3) - 1, crownTop, 1, 3, palette.light, 0.68);
        }

        function broadleaf(x, y, size, palette, seed) {
          size = Math.max(2, Math.round(size));
          rect(x, y - size * 2, 1, size * 2 + 2, palette.trunk);
          pixelDisc(x - Math.max(1, size - 1), y - size * 2 - 1, size, palette.dark);
          pixelDisc(x + Math.max(1, size - 1), y - size * 2, Math.max(1, size - 1), palette.dark);
          pixelDisc(x, y - size * 3, size + (seed % 2), palette.mid);
          rect(x - size, y - size * 3 - 1, Math.max(2, size), 1, palette.light, 0.68);
          if (size > 2) rect(x + 1, y - size * 2, size, 1, palette.mid);
        }

        function forestTree(x, y, size, depth, variant) {
          var palettes = [
            { dark: '#102925', mid: '#183631', light: '#285047', trunk: '#17231f' },
            { dark: '#0d2b25', mid: '#173a30', light: '#29513f', trunk: '#18251f' },
            { dark: '#0a261f', mid: '#12362a', light: '#214936', trunk: '#142019' }
          ];
          var palette = palettes[Math.min(2, Math.floor(depth * 3))];
          if (variant % 7 === 0 || variant % 11 === 0) {
            broadleaf(x, y, Math.max(2, size - 1), palette, variant);
          } else {
            conifer(x, y, size, palette, variant);
          }
        }

        function mountain(points, color, litColor) {
          poly(points, color);
          if (!litColor || points.length < 5) return;
          var peak = points[2];
          poly([
            [peak[0], peak[1]],
            [peak[0] - 7, peak[1] + 12],
            [peak[0] - 2, peak[1] + 10],
            [peak[0] + 2, peak[1] + 15],
            [peak[0] + 9, peak[1] + 13]
          ], litColor);
        }

        // 全背景在半分辨率像素网格绘制，再由主画布整数倍放大
        var sky = pg.createLinearGradient(0, 0, 0, bh);
        sky.addColorStop(0, '#07101d');
        sky.addColorStop(0.48, '#101d31');
        sky.addColorStop(0.67, '#344656');
        sky.addColorStop(0.82, '#6f6863');
        sky.addColorStop(1, '#1b2928');
        pg.fillStyle = sky;
        pg.fillRect(0, 0, bw, bh);

        for (var si = 0; si < stars.length; si++) {
          var st = stars[si];
          var starY = Math.round(st.y * bh * 0.78);
          if (starY > horizonY - 12) continue;
          var starA = 0.38 + 0.62 * Math.abs(Math.sin(tt * 1.35 + st.tw));
          rect(st.x * bw, starY, st.s > 1 ? 2 : 1, 1, st.s > 1 ? '#fff1c4' : '#c9dcf1', starA);
        }

        // 高空像素云
        for (var cloud = 0; cloud < 7; cloud++) {
          var cloudX = ((cloud * 41 + tt * (cloud % 2 ? -0.7 : 0.45)) % (bw + 48)) - 28;
          var cloudY = horizonY - 38 + (cloud % 3) * 8;
          rect(cloudX, cloudY, 24 + cloud % 3 * 7, 2, '#27364a', 0.34);
          rect(cloudX + 7, cloudY - 2, 13 + cloud % 2 * 5, 2, '#2e3c50', 0.22);
        }

        // 最远雪山群：五座不同高度山峰和独立雪线
        mountain([
          [-18, snowBaseY + 8], [8, snowBaseY - 15], [34, horizonY + 19],
          [65, snowBaseY - 7], [92, snowBaseY + 8]
        ], '#3a4b61', '#aebdca');
        mountain([
          [38, snowBaseY + 8], [72, snowBaseY - 18], [104, horizonY + 9],
          [134, snowBaseY - 12], [163, snowBaseY + 8]
        ], '#40536a', '#c1cbd3');
        mountain([
          [112, snowBaseY + 8], [144, snowBaseY - 13], [171, horizonY + 23],
          [196, snowBaseY - 11], [222, snowBaseY + 8]
        ], '#36475d', '#a9b7c5');
        mountain([
          [176, snowBaseY + 8], [202, snowBaseY - 17], [224, horizonY + 14],
          [251, snowBaseY - 8], [bw + 20, snowBaseY + 8]
        ], '#405168', '#bdc8d0');

        // 雪线碎片让山体保持像素质感
        for (var snow = 0; snow < 18; snow++) {
          var snowX = (snow * 29 + 17) % bw;
          var snowY = horizonY + 33 + ((snow * 13) % Math.max(12, snowBaseY - horizonY - 42));
          rect(snowX, snowY, 2 + snow % 4, 1, '#8296a8', 0.45);
        }

        // 最远山口只保留一枚小月与一座小城
        var castleX = Math.round(bw * 0.79);
        var castleBase = snowBaseY - 1;
        pixelDisc(castleX + 1, castleBase - 23, 6, '#d7c8ad');
        pixelDisc(castleX + 3, castleBase - 24, 5, '#3b4657');
        poly([
          [castleX - 24, castleBase + 3], [castleX - 14, castleBase - 8],
          [castleX - 2, castleBase - 5], [castleX + 8, castleBase - 13],
          [castleX + 18, castleBase - 4], [castleX + 25, castleBase + 3]
        ], '#171d2d');
        rect(castleX - 17, castleBase - 8, 35, 7, '#171827');
        rect(castleX - 11, castleBase - 16, 5, 15, '#1e1d2b');
        rect(castleX + 8, castleBase - 18, 5, 17, '#201e2e');
        rect(castleX - 2, castleBase - 26, 7, 25, '#191824');
        poly([[castleX - 12, castleBase - 16], [castleX - 9, castleBase - 23], [castleX - 5, castleBase - 16]], '#0c101b');
        poly([[castleX + 7, castleBase - 18], [castleX + 11, castleBase - 26], [castleX + 14, castleBase - 18]], '#0c101b');
        poly([[castleX - 3, castleBase - 26], [castleX + 2, castleBase - 36], [castleX + 6, castleBase - 26]], '#090d17');
        rect(castleX, castleBase - 6, 3, 5, '#c76070', 0.82);
        rect(castleX - 9, castleBase - 13, 1, 1, '#b45467', 0.7);
        rect(castleX + 10, castleBase - 15, 1, 1, '#b45467', 0.7);

        // 远山脚雾带
        for (var mist = 0; mist < 9; mist++) {
          var mistX = ((mist * 37 + tt * (mist % 2 ? 0.65 : -0.42)) % (bw + 50)) - 24;
          var mistY = snowBaseY - 6 + (mist % 3) * 5;
          rect(mistX, mistY, 28 + mist % 4 * 8, 2, '#9ca9ad', 0.18);
        }

        // 中层山谷与密林台地
        poly([
          [0, valleyTopY + 8], [24, valleyTopY - 8], [54, valleyTopY + 2],
          [82, valleyTopY - 14], [112, valleyTopY + 1], [142, valleyTopY - 10],
          [174, valleyTopY + 5], [207, valleyTopY - 12], [bw, valleyTopY + 1],
          [bw, cliffY - 12], [0, cliffY - 12]
        ], '#233b36');
        poly([
          [0, valleyTopY + 26], [33, valleyTopY + 14], [65, valleyTopY + 30],
          [99, valleyTopY + 12], [129, valleyTopY + 27], [163, valleyTopY + 10],
          [198, valleyTopY + 24], [bw, valleyTopY + 14],
          [bw, cliffY - 8], [0, cliffY - 8]
        ], '#2d493e');
        poly([
          [0, valleyTopY + 54], [39, valleyTopY + 38], [74, valleyTopY + 55],
          [111, valleyTopY + 34], [149, valleyTopY + 51], [190, valleyTopY + 33],
          [bw, valleyTopY + 49], [bw, cliffY - 4], [0, cliffY - 4]
        ], '#365442');

        // 河流位于崖下谷底：由右侧雪山汇入河谷，横向远离视点后被近谷林冠遮没
        var riverStartY = snowBaseY + 8;
        var riverEndY = cliffBaseY - 7;
        function riverPoint(k) {
          var sweep = k < 0.52
            ? 0.71 - k * 0.17 + Math.sin(k * Math.PI * 2.15) * 0.045
            : 0.62 - (k - 0.52) * 0.58 + Math.sin((k - 0.52) * Math.PI * 1.5) * 0.055;
          var perspectiveHalf = 1.5 + Math.pow(k, 1.42) * 9;
          // 河道先随透视变宽，抵达崖口前再被岩峡收窄，避免宽河偏接窄瀑布。
          var gorgeTaper = k > 0.78
            ? U.lerp(1, 0.38, (k - 0.78) / 0.22)
            : 1;
          return {
            x: bw * sweep,
            y: riverStartY + (riverEndY - riverStartY) * k,
            half: perspectiveHalf * gorgeTaper
          };
        }
        var bankL = [], bankR = [], waterL = [], waterR = [];
        for (var ri = 0; ri <= 38; ri++) {
          var rk = ri / 38;
          var rv = riverPoint(rk);
          bankL.push([rv.x - rv.half - 2, rv.y]);
          bankR.unshift([rv.x + rv.half + 2, rv.y]);
          waterL.push([rv.x - rv.half, rv.y]);
          waterR.unshift([rv.x + rv.half, rv.y]);
        }
        poly(bankL.concat(bankR), '#182c29');
        poly(waterL.concat(waterR), '#245869');
        var innerL = [], innerR = [];
        for (var ii = 0; ii <= 38; ii++) {
          var ik = ii / 38;
          var iv = riverPoint(ik);
          innerL.push([iv.x - iv.half * 0.55, iv.y]);
          innerR.unshift([iv.x + iv.half * 0.18, iv.y]);
        }
        poly(innerL.concat(innerR), '#39798a', 0.7);
        for (var shine = 4; shine < 37; shine += 6) {
          var shineP = riverPoint(shine / 38);
          rect(shineP.x - shineP.half * 0.45, shineP.y, Math.max(2, shineP.half * 0.7), 1, '#91b6b0', 0.5);
        }

        // 河中石岛与一座低矮古桥
        var bridge = riverPoint(0.51);
        rect(bridge.x - bridge.half - 4, bridge.y - 1, bridge.half * 2 + 8, 3, '#7b7668');
        rect(bridge.x - bridge.half - 3, bridge.y - 2, bridge.half * 2 + 6, 1, '#aaa18a');
        for (var rock = 0; rock < 6; rock++) {
          var rockP = riverPoint(0.2 + rock * 0.115);
          rect(rockP.x + (rock % 2 ? -1 : 1) * rockP.half * 0.45, rockP.y + 2, 2 + rock % 2, 1, '#76918c', 0.7);
        }

        // 远河在崖沿汇聚；瀑布和真正的崖下河湾稍后叠到岩壁下方
        var gorgeJoin = riverPoint(1);

        // 密林按不规则林团组织；混合冷杉与阔叶树，避免等距三角阵列
        var treeIndex = 0;
        for (var forestBand = 0; forestBand < 5; forestBand++) {
          var bandDepth = forestBand / 4;
          var bandY = valleyTopY + 18 + forestBand * ((cliffBaseY - valleyTopY - 21) / 4);
          var fx = -9 + hash01(forestBand, 2) * 7;
          while (fx < bw + 10) {
            var spacingNoise = hash01(treeIndex + 4, forestBand + 9);
            fx += 7 + Math.floor(spacingNoise * (8 + forestBand));
            var fy = bandY + (hash01(treeIndex + 13, forestBand + 3) - 0.5) * (7 + forestBand);
            var fk = U.clamp((fy - riverStartY) / Math.max(1, riverEndY - riverStartY), 0, 1);
            var fp = riverPoint(fk);
            var size = 2 + Math.floor(bandDepth * 2.2 + hash01(treeIndex + 21, forestBand) * 1.6);
            var bankClearance = fp.half + 4 + size * 0.7;
            if (fy < riverEndY + 3 && Math.abs(fx - fp.x) < bankClearance) {
              fx += bankClearance * 0.6;
            } else if (hash01(treeIndex + 37, forestBand + 5) > 0.08) {
              forestTree(fx, fy, size, bandDepth, treeIndex + forestBand * 17);
            }
            treeIndex++;
          }
        }

        // 近谷树列收束远河，瀑布口仍保持可读
        for (var grove = 0; grove < 10; grove++) {
          var groveX = bw * 0.05 + grove * (bw * 0.086) + (grove % 3) * 2;
          var groveY = cliffBaseY - 14 + (grove % 4);
          forestTree(groveX, groveY, 3 + grove % 2, 0.86, 80 + grove);
        }
        for (var bankTree = 0; bankTree < 6; bankTree++) {
          var onLeftBank = bankTree < 3;
          var bankTreeX = onLeftBank
            ? bw * (0.025 + bankTree * 0.035)
            : bw * (0.76 + (bankTree - 3) * 0.075);
          forestTree(bankTreeX, cliffBaseY - 1 + bankTree % 3, 4 + bankTree % 2, 0.98, 110 + bankTree);
        }

        // 左侧巨兽巢穴：岩洞、骨枝和三枚卵形成独立叙事点
        var nestX = Math.round(bw * 0.18);
        var nestY = Math.round(valleyTopY + (cliffBaseY - valleyTopY) * 0.58);
        poly([
          [nestX - 25, nestY + 8], [nestX - 23, nestY - 1],
          [nestX - 16, nestY - 9], [nestX - 7, nestY - 15],
          [nestX + 4, nestY - 13], [nestX + 14, nestY - 7],
          [nestX + 23, nestY + 8]
        ], '#273830');
        pixelDisc(nestX - 1, nestY, 9, '#0a1514');
        poly([
          [nestX - 13, nestY + 3], [nestX - 8, nestY],
          [nestX + 10, nestY + 1], [nestX + 15, nestY + 5],
          [nestX + 10, nestY + 8], [nestX - 10, nestY + 8]
        ], '#68543a');
        rect(nestX - 9, nestY + 3, 20, 2, '#8b7049');
        pixelDisc(nestX - 6, nestY + 1, 2, '#c6bea0');
        pixelDisc(nestX, nestY, 3, '#d5c9a7');
        pixelDisc(nestX + 7, nestY + 2, 2, '#b8b294');
        poly([[nestX - 20, nestY + 2], [nestX - 18, nestY - 8], [nestX - 16, nestY - 8], [nestX - 18, nestY + 3]], '#b5aa8c');
        poly([[nestX + 16, nestY + 1], [nestX + 20, nestY - 7], [nestX + 22, nestY - 6], [nestX + 18, nestY + 3]], '#a69d84');

        // 崖壁：谷底止于上缘，纵向岩柱一直落到营地所在的高台边缘
        poly([
          [0, cliffBaseY + 2], [24, cliffBaseY - 3], [49, cliffBaseY + 1],
          [75, cliffBaseY - 5], [101, cliffBaseY + 2], [128, cliffBaseY - 2],
          [155, cliffBaseY + 3], [181, cliffBaseY - 4], [209, cliffBaseY + 1],
          [bw, cliffBaseY - 2], [bw, cliffY + 2], [218, cliffY - 2],
          [190, cliffY + 3], [160, cliffY - 1], [132, cliffY + 4],
          [103, cliffY], [74, cliffY + 3], [47, cliffY - 1],
          [22, cliffY + 2], [0, cliffY - 2]
        ], '#3e443d');
        poly([
          [0, cliffBaseY + 2], [24, cliffBaseY - 3], [49, cliffBaseY + 1],
          [75, cliffBaseY - 5], [101, cliffBaseY + 2], [128, cliffBaseY - 2],
          [155, cliffBaseY + 3], [181, cliffBaseY - 4], [209, cliffBaseY + 1],
          [bw, cliffBaseY - 2], [bw, cliffBaseY + 5], [207, cliffBaseY + 6],
          [181, cliffBaseY + 3], [155, cliffBaseY + 8], [128, cliffBaseY + 4],
          [101, cliffBaseY + 7], [75, cliffBaseY], [49, cliffBaseY + 6],
          [24, cliffBaseY + 2], [0, cliffBaseY + 8]
        ], '#202e2b');

        // 大块垂直岩面与断裂阴影，打破“横向道路”观感
        var cliffFaces = [
          [5, 42, '#505047'], [55, 31, '#303a35'], [93, 47, '#4b4d43'],
          [150, 35, '#2f3935'], [194, 49, '#4d4e45']
        ];
        for (var face = 0; face < cliffFaces.length; face++) {
          var faceX = cliffFaces[face][0];
          if (faceX > bw) continue;
          var faceW = Math.min(cliffFaces[face][1], bw - faceX);
          var faceTop = cliffBaseY + 6 + (face * 3) % 7;
          poly([
            [faceX, faceTop], [faceX + faceW * 0.42, faceTop - 4],
            [faceX + faceW, faceTop + 1],
            [faceX + faceW - 7, cliffY - 2 + face % 3],
            [faceX + faceW * 0.48, cliffY - 6 + (face + 1) % 4],
            [faceX + 4, cliffY + face % 2]
          ], cliffFaces[face][2], 0.68);
        }
        for (var fissure = 0; fissure < 12; fissure++) {
          var fissureX = 9 + fissure * Math.max(9, Math.floor((bw - 18) / 12));
          var fissureY = cliffBaseY + 8 + (fissure * 7) % 9;
          rect(fissureX, fissureY, 1, 5 + fissure % 8, fissure % 3 ? '#777264' : '#222e2b', 0.44);
          if (fissure % 2) rect(fissureX - 2, fissureY + 5, 3, 1, '#252f2c', 0.58);
        }

        // 瀑布穿过岩壁：先补一段对称收束的岩峡水喉，再沿同一中心线落下。
        var fallX = Math.round(gorgeJoin.x);
        var fallMouthHalf = Math.max(3, Math.round(gorgeJoin.half));
        poly([
          [fallX - fallMouthHalf - 2, riverEndY - 1],
          [fallX + fallMouthHalf + 2, riverEndY - 1],
          [fallX + 5, cliffBaseY + 1],
          [fallX - 5, cliffBaseY + 1]
        ], '#182c29');
        poly([
          [fallX - fallMouthHalf, riverEndY - 1],
          [fallX + fallMouthHalf, riverEndY - 1],
          [fallX + 3, cliffBaseY + 2],
          [fallX - 3, cliffBaseY + 2]
        ], '#2f6d7c', 0.94);
        poly([
          [fallX - 5, cliffBaseY - 3], [fallX + 5, cliffBaseY - 3],
          [fallX + 4, cliffY + 4], [fallX - 4, cliffY + 4]
        ], '#183843', 0.9);
        poly([
          [fallX - 2, cliffBaseY - 4], [fallX + 2, cliffBaseY - 4],
          [fallX + 2, cliffY + 5], [fallX - 2, cliffY + 5]
        ], '#347584', 0.92);
        for (var fall = 0; fall < 6; fall++) {
          rect(fallX - 2 + fall % 3, cliffBaseY + 2 + fall * 4, 1, 3, '#9abbb4', 0.42);
        }

        // 近景高台从崖唇向镜头延伸
        poly([
          [0, cliffY - 2], [bw * 0.1, cliffY + 2], [bw * 0.22, cliffY - 1],
          [bw * 0.36, cliffY + 3], [bw * 0.48, cliffY],
          [cliffRidgeHalfX - 13, cliffY + 1], [cliffRidgeHalfX - 7, cliffY - 3],
          [cliffRidgeHalfX + 4, cliffY - 2], [cliffRidgeHalfX + 13, cliffY - 1],
          [bw * 0.78, cliffY + 3],
          [bw * 0.9, cliffY - 2], [bw, cliffY + 2],
          [bw, bh], [0, bh]
        ], '#173126');
        poly([
          [cliffRidgeHalfX - 8, cliffY - 2], [cliffRidgeHalfX - 3, cliffY - 4],
          [cliffRidgeHalfX + 5, cliffY - 3], [cliffRidgeHalfX + 11, cliffY],
          [cliffRidgeHalfX + 6, cliffY - 1], [cliffRidgeHalfX - 5, cliffY - 1]
        ], '#365840', 0.88);
        for (var lip = 0; lip < bw; lip += 7) {
          rect(lip, cliffY + ((lip * 5) % 5) - 2, 4 + lip % 3, 1, '#31533b', 0.72);
        }
        poly([
          [0, cliffY + 12], [42, cliffY + 7], [78, cliffY + 15],
          [118, cliffY + 8], [157, cliffY + 16], [198, cliffY + 9],
          [bw, cliffY + 14], [bw, bh], [0, bh]
        ], '#142b22', 0.78);

        // 岩壁下方、营地上方的近景河湾：严格放在用户所指的屏幕层级
        var lowerRiverTop = cliffY + (bh < 500 ? 2 : 4);
        var lowerRiverBottom = cliffY + (bh < 500 ? 10 : 17);
        // 营地紧贴近岸，同时保留一条干燥的步行带与底部菜单净空。
        campY = Math.min(
          campY,
          lowerRiverBottom + (bh < 500 ? 12 : 17)
        );
        var sentryY = lowerRiverBottom + (bh < 500 ? 7 : 9);
        poly([
          [0, lowerRiverTop + 1], [bw * 0.13, lowerRiverTop - 2],
          [fallX - 8, lowerRiverTop], [fallX + 8, lowerRiverTop + 2],
          [bw * 0.64, lowerRiverTop - 1], [bw * 0.8, lowerRiverTop + 3],
          [bw, lowerRiverTop], [bw, lowerRiverBottom + 4],
          [bw * 0.78, lowerRiverBottom + 2], [bw * 0.58, lowerRiverBottom + 5],
          [bw * 0.34, lowerRiverBottom + 2], [bw * 0.14, lowerRiverBottom + 5],
          [0, lowerRiverBottom + 2]
        ], '#0d211f');
        poly([
          [bw * 0.03, lowerRiverTop + 4], [bw * 0.17, lowerRiverTop + 1],
          [fallX - 6, lowerRiverTop + 2], [fallX + 7, lowerRiverTop + 4],
          [bw * 0.62, lowerRiverTop + 2], [bw * 0.78, lowerRiverTop + 5],
          [bw * 0.96, lowerRiverTop + 3], [bw * 0.93, lowerRiverBottom],
          [bw * 0.72, lowerRiverBottom - 1], [bw * 0.52, lowerRiverBottom + 2],
          [bw * 0.28, lowerRiverBottom - 1], [bw * 0.07, lowerRiverBottom + 1]
        ], '#205565');
        poly([
          [bw * 0.08, lowerRiverTop + 6], [bw * 0.24, lowerRiverTop + 4],
          [fallX, lowerRiverTop + 5], [bw * 0.57, lowerRiverTop + 4],
          [bw * 0.73, lowerRiverTop + 7], [bw * 0.88, lowerRiverTop + 6],
          [bw * 0.69, lowerRiverBottom - 3], [bw * 0.49, lowerRiverBottom],
          [bw * 0.26, lowerRiverBottom - 3], [bw * 0.12, lowerRiverBottom - 1]
        ], '#347986', 0.72);
        pixelDisc(fallX, lowerRiverTop + 5, 4, '#8db3ad');
        pixelDisc(fallX, lowerRiverTop + 5, 2, '#c1d0c6');
        for (var lowerRipple = 0; lowerRipple < 9; lowerRipple++) {
          rect(
            bw * (0.08 + lowerRipple * 0.095),
            lowerRiverTop + 6 + (lowerRipple % 4) * 2,
            4 + lowerRipple % 5,
            1,
            '#9abbb4',
            0.44
          );
        }
        // 篝火在水面的断续暖色倒影，把近岸与营地读成同一空间。
        var fireReflection = 0.2 + 0.08 * Math.sin(tt * 4.7);
        rect(campX - 5, lowerRiverTop + 5, 10, 1, '#c28a48', fireReflection);
        rect(campX - 3, lowerRiverTop + 8, 6, 1, '#ddb164', fireReflection * 0.84);
        rect(campX - 1, lowerRiverBottom - 1, 3, 1, '#efc677', fireReflection * 0.65);
        pixelDisc(bw * 0.2, lowerRiverTop + 9, 2, '#53665f');
        pixelDisc(bw * 0.72, lowerRiverTop + 8, 2, '#455e58');

        // 近岸重新覆盖水面下缘，营地保持在干燥草地上
        poly([
          [0, lowerRiverBottom + 1], [bw * 0.16, lowerRiverBottom - 1],
          [bw * 0.34, lowerRiverBottom + 2], [bw * 0.52, lowerRiverBottom],
          [bw * 0.7, lowerRiverBottom + 3], [bw * 0.86, lowerRiverBottom],
          [bw, lowerRiverBottom + 2], [bw, bh], [0, bh]
        ], '#142b22');
        for (var shore = 0; shore < bw; shore += 11) {
          rect(shore, lowerRiverBottom + (shore % 3) - 1, 5 + shore % 4, 1, '#294b35', 0.62);
        }

        for (var patch = 0; patch < 34; patch++) {
          var patchX = (patch * 31 + 13) % bw;
          var patchY = lowerRiverBottom + 7 + ((patch * 19) % Math.max(10, bh - lowerRiverBottom - 12));
          rect(patchX, patchY, 1 + patch % 3, 1, patch % 2 ? '#294532' : '#203b2b', 0.55);
        }

        // 远空鸟群与近谷雾点
        for (var bird = 0; bird < 6; bird++) {
          var birdX = bw * 0.53 + bird * 13 + Math.sin(tt * 0.11 + bird) * 2;
          var birdY = valleyTopY - 26 + (bird % 3) * 5;
          rect(birdX - 2, birdY, 2, 1, '#0c1720');
          rect(birdX + 1, birdY, 2, 1, '#0c1720');
        }

        g.save();
        g.imageSmoothingEnabled = false;
        g.drawImage(pixelVista, 0, 0, bw, bh, 0, 0, w, h);
        g.restore();

        return {
          groundY: (lowerRiverBottom + 4) * 2,
          cx: campX * 2,
          cy: campY * 2,
          sentryX: sentryHalfX * 2,
          sentryY: sentryY * 2,
          sceneScale: U.clamp(w / 390, 0.84, 1.12) * (h < 700 ? 0.88 : 1)
        };
      }

      function frame(now) {
        if (!titleRoot) return;
        var tt = (now - t0) / 1000;
        var w = wrap.clientWidth, h = wrap.clientHeight;
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
          if (lastSceneWidth && lastSceneHeight) {
            embers.length = 0;
            fireflies.length = 0;
          }
          lastSceneWidth = w;
          lastSceneHeight = h;
        }
        g.imageSmoothingEnabled = false;

        // 半分辨率像素远景直接提供营地层所需的统一透视基准
        var pixelScene = drawPixelVista(w, h, tt);
        var groundY = pixelScene.groundY;
        var cx = pixelScene.cx;
        var cy = pixelScene.cy;
        var sceneScale = pixelScene.sceneScale;

        // 近景草叶同样锁定到 2px 网格
        for (var gi = 0; gi < grass.length; gi++) {
          var blade = grass[gi];
          var gx = Math.round(blade.x * w / 2) * 2;
          var gy = Math.round((groundY + 12 + blade.y * Math.max(20, h - groundY - 22)) / 2) * 2;
          var bladeH = Math.max(2, Math.round(blade.h / 2) * 2);
          g.globalAlpha = 0.22 + blade.y * 0.22;
          g.fillStyle = blade.y > 0.55 ? '#47613f' : '#304b35';
          g.fillRect(gx, gy - bladeH, 2, bladeH);
        }
        g.globalAlpha = 1;

        // 游侠与营地同处河湾近岸，站在水线下方的干燥草地警戒上游。
        var sentryX = pixelScene.sentryX;
        var sentryY = pixelScene.sentryY;
        var sentryGlow = g.createRadialGradient(sentryX, sentryY - 16 * sceneScale, 2, sentryX, sentryY - 16 * sceneScale, 29 * sceneScale);
        sentryGlow.addColorStop(0, 'rgba(239,176,99,0.12)');
        sentryGlow.addColorStop(1, 'rgba(239,176,99,0)');
        g.fillStyle = sentryGlow;
        g.fillRect(sentryX - 32 * sceneScale, sentryY - 52 * sceneScale, 64 * sceneScale, 62 * sceneScale);
        drawSprite('hero_ranger', 'idle_r', sentryX, sentryY, 1.82 * sceneScale, { shadowAlpha: 0.38 });

        // 营地（居中，位于菜单上方）
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

        // 四名队友围火休整，游侠已在近岸担任哨戒
        for (var hi = 0; hi < heroes.length; hi++) {
          var hd = heroes[hi];
          if (hd.sentry) continue;
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
