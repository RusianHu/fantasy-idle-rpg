(function () {
  'use strict';
  var D = window.DemoI18n;
  var regions = [];
  var currentRegion = null;
  var snapshot = null;
  var selected = null;
  var paused = false;
  var reducedMotion = false;
  var lastFrame = 0;
  var previewTime = 0;
  var lastPreviewPaint = -1;
  var cardObserver = null;
  var visibleCardIndexes = {};
  var animatedCardButtons = [];
  var previewPaintCount = 0;
  var categoryFromUrl = 'all';
  var assetFromUrl = '';
  var region = null;
  var previewPopup = null;
  var previewScale = 1;
  var previewSpeed = 1;
  var previewBackdrop = 'checker';
  var previewGrid = false;
  var previewGuides = false;
  var compareKeys = [];
  var lastTimeUiPaint = -1;
  var MAX_COMPARE = 4;

  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function copy(value) { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }
  function tr(key, vars) { return D.t(key, vars); }
  function nameRegion(item) { return Game.i18n && item.nameKey ? Game.i18n.t(item.nameKey) : item.id; }
  function paintSpriteCanvas(canvas, item, frame, motion, options) {
    if (!canvas || !item || !item.spriteId || !Game.assets || !Game.assets.frame) return;
    var source = Game.assets.frame(item.spriteId, frame || 'idle0');
    if (!source) return;
    options = options || {};
    var ctx = canvas.getContext('2d');
    var k = Math.max(1, Math.floor(Math.min(canvas.width / source.width, canvas.height / source.height)));
    var w = source.width * k;
    var h = source.height * k;
    var offsetX = motion && motion.offsetX ? motion.offsetX : 0;
    var offsetY = motion && motion.offsetY ? motion.offsetY : 0;
    var alpha = motion && motion.alpha !== undefined ? motion.alpha : 1;
    var x = Math.floor((canvas.width - w) / 2) + offsetX;
    var y = Math.floor((canvas.height - h) / 2) + offsetY;
    var actualX = motion && motion.flip ? canvas.width - x - w : x;
    if (canvas.id === 'preview-canvas') {
      canvas.style.setProperty('--pixel-grid-size', k + 'px');
      canvas.style.setProperty('--grid-x', actualX + 'px');
      canvas.style.setProperty('--grid-y', y + 'px');
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    if (motion && motion.flip) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, x, y, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (options.guides) {
      var anchor = item.anchor || { x: Math.floor(source.width / 2), y: source.height - 1 };
      var anchorSourceX = motion && motion.flip ? Math.max(0, source.width - 1 - anchor.x) : anchor.x;
      var anchorX = actualX + anchorSourceX * k;
      var anchorY = y + anchor.y * k;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(240, 214, 128, .78)';
      ctx.strokeRect(actualX + .5, y + .5, Math.max(1, w - 1), Math.max(1, h - 1));
      ctx.beginPath();
      ctx.moveTo(0, Math.round(anchorY) + .5);
      ctx.lineTo(canvas.width, Math.round(anchorY) + .5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#83dac5';
      ctx.beginPath();
      ctx.moveTo(Math.round(anchorX) - 6, Math.round(anchorY) + .5);
      ctx.lineTo(Math.round(anchorX) + 6, Math.round(anchorY) + .5);
      ctx.moveTo(Math.round(anchorX) + .5, Math.round(anchorY) - 6);
      ctx.lineTo(Math.round(anchorX) + .5, Math.round(anchorY) + 6);
      ctx.stroke();
      ctx.restore();
    }
  }
  function canvasPaint(canvas, item, frame, motion, options) {
    if (!canvas || !item) return;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (item.kind === 'asset') {
      paintSpriteCanvas(canvas, item, frame || 'idle0', motion, options);
    } else if (item.kind === 'map-icon' && Game.mapIcons) {
      Game.mapIcons.drawToDom(canvas, item.id);
    } else if (item.kind === 'material') {
      ctx.fillStyle = (item.colors && item.colors[0]) || '#526b50';
      ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
      ctx.fillStyle = (item.colors && item.colors[1]) || '#9ab47a';
      for (var i = 0; i < 12; i++) ctx.fillRect(12 + (i * 13) % (canvas.width - 22), 12 + (i * 7) % (canvas.height - 22), 2, 2);
    } else if (item.kind === 'effect' && Game.fx && Game.fx.preview) {
      Game.fx.preview(ctx, item.id, previewTime);
    } else if (item.kind === 'particle' && Game.particles && Game.particles.preview) {
      Game.particles.preview(ctx, item.id, previewTime);
    } else if (item.kind === 'bubble' && Game.render && Game.render.drawBubblePreview) {
      Game.render.drawBubblePreview(ctx, item.id, previewTime);
    } else if (item.kind === 'particle' || item.kind === 'effect' || item.kind === 'bubble') {
      ctx.fillStyle = '#d2b866';
      ctx.fillRect(Math.floor(canvas.width / 2) - 2, Math.floor(canvas.height / 2) - 2, 4, 4);
      ctx.strokeStyle = '#8ed3c2';
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      ctx.fillStyle = '#8ed3c2';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CATALOG', canvas.width / 2, canvas.height - 12);
      ctx.textAlign = 'left';
    }
  }
  function motionFor(item) {
    if (!item || !item.motion) return null;
    var state = $('motion-select').value || 'idle';
    var direction = $('direction-select').value || 'd';
    return item.motion[state] && item.motion[state][direction] || null;
  }
  function isAnimatedItem(item) {
    var flags = item && item.flags || {};
    return !!(item && item.kind === 'asset' && (item.motion || flags.sway || flags.bob || flags.flicker));
  }
  function shouldAnimatePreview(item) {
    return !!(item && (isAnimatedItem(item) || item.preview));
  }
  function previewMotion(item, time) {
    if (!item || item.kind !== 'asset') return null;
    var state = $('motion-select').value || 'idle';
    var direction = $('direction-select').value || 'd';
    if (item.motion && Game.assets && Game.assets.resolveMotion) {
      var resolved = Game.assets.resolveMotion(item.spriteId, {
        state: state,
        direction: direction,
        time: time,
        reducedMotion: reducedMotion
      });
      var phase = reducedMotion ? 0 : time;
      var wobble = state === 'attack' ? Math.sin(phase * 9) * 2 :
        state === 'cast' ? Math.sin(phase * 3.5) * 1.5 :
          state === 'hurt' ? Math.sin(phase * 28) * 1.5 :
            state === 'move' ? Math.sin(phase * 8) * 0.8 :
              state === 'idle' ? Math.sin(phase * 2.4) * 1.1 : 0;
      return {
        frame: resolved.frame,
        flip: resolved.flip,
        coverage: resolved.coverage,
        state: state,
        direction: direction,
        offsetX: state === 'hurt' ? Math.round(wobble) : 0,
        offsetY: state === 'hurt' ? 0 : Math.round(wobble)
      };
    }
    var flags = item.flags || {};
    if (flags.sway || flags.bob || flags.flicker) {
      var wobbleDecor = reducedMotion ? 0 : Math.sin(time * (flags.sway ? 2.1 : 1.7)) * (flags.sway ? 1.4 : 1);
      return {
        frame: frameFor(item),
        offsetX: 0,
        offsetY: flags.bob ? Math.round(wobbleDecor) : 0,
        alpha: flags.flicker && !reducedMotion ? 0.8 + Math.abs(Math.sin(time * 4)) * 0.2 : 1
      };
    }
    return null;
  }
  function frameFor(item) {
    return item && item.frameNames && item.frameNames[0] || 'idle0';
  }
  function paintMotionPreviews(time) {
    if (document.hidden) return;
    if (paused || reducedMotion) { syncPreviewTimeUi(); return; }
    if (lastPreviewPaint >= 0 && time - lastPreviewPaint < (reducedMotion ? 0.25 : 0.08)) return;
    lastPreviewPaint = time;
    previewPaintCount = 0;
    var items = visibleItems();
    animatedCardButtons.forEach(function (button) {
      var index = Number(button.getAttribute('data-item-index'));
      var item = items[index];
      if (!item || !isAnimatedItem(item) || previewPaintCount >= 96) return;
      if (cardObserver) {
        if (visibleCardIndexes[index] === false) return;
        if (visibleCardIndexes[index] === undefined && !isCardVisible(button)) return;
      } else if (!isCardVisible(button)) return;
      var motion = previewMotion(item, time);
      if (motion) {
        canvasPaint(button.querySelector('canvas'), item, motion.frame, motion);
        previewPaintCount += 1;
      }
    });
    if (selected && shouldAnimatePreview(selected)) {
      var inspectorCanvas = $('inspect-canvas');
      if (inspectorCanvas) {
        var inspectorMotion = previewMotion(selected, time);
        canvasPaint(inspectorCanvas, selected,
          inspectorMotion ? inspectorMotion.frame : frameFor(selected), inspectorMotion);
        previewPaintCount += 1;
      }
        var previewCanvas = $('preview-canvas');
        if (previewCanvas) {
          var windowMotion = previewMotion(selected, time);
          canvasPaint(previewCanvas, selected,
            windowMotion ? windowMotion.frame : frameFor(selected), windowMotion, { guides: previewGuides });
          previewPaintCount += 1;
        }
    }
    paintCompareCanvases(time);
    renderPopupPreview();
    syncPreviewTimeUi();
  }
  function motionLabel(coverage) {
    return coverage === 'native' ? tr('visual.native') : coverage === 'derived' ? tr('visual.derived') : tr('visual.fallback');
  }
  function previewLabel(item) {
    var mode = item && item.preview && item.preview.mode;
    return mode === 'production' ? tr('visual.previewProduction') :
      mode === 'adapted' ? tr('visual.previewAdapted') : tr('visual.previewCatalog');
  }
  function previewMeta(item, motion) {
    if (!item) return tr('visual.previewNoSelection');
    var parts = [item.id, item.kind];
    if (motion) parts.push($('motion-select').value + ' / ' + $('direction-select').value);
    if (item.preview) parts.push(previewLabel(item));
    parts.push(previewScale + '×');
    return parts.join(' · ');
  }
  function previewDuration(item) {
    var duration = item && item.preview && Number(item.preview.duration);
    if (!(duration > 0)) duration = item && item.motion ? 1.44 : (isAnimatedItem(item) ? 2.4 : 1);
    return Math.max(0.4, Math.min(8, duration));
  }
  function previewPhase() {
    var duration = previewDuration(selected);
    var value = previewTime % duration;
    if (value < 0) value += duration;
    return { duration: duration, time: value, ratio: duration ? value / duration : 0 };
  }
  function syncPauseLabel() {
    $('pause').textContent = tr(paused ? 'visual.resume' : 'visual.pause');
    $('pause').setAttribute('aria-pressed', paused ? 'true' : 'false');
  }
  function syncPreviewTimeUi(force) {
    var now = performance.now() / 1000;
    if (!force && lastTimeUiPaint >= 0 && now - lastTimeUiPaint < 0.06) return;
    lastTimeUiPaint = now;
    var phase = previewPhase();
    $('preview-scrubber').value = String(Math.round(phase.ratio * 1000));
    var resolved = selected ? previewMotion(selected, previewTime) : null;
    $('preview-frame-readout').textContent = selected
      ? tr('visual.timeReadout', { time: phase.time.toFixed(2), duration: phase.duration.toFixed(2), frame: resolved && resolved.frame || frameFor(selected) })
      : '0.00s';
  }
  function applyStageSettings() {
    var stage = $('preview-stage');
    var canvas = $('preview-canvas');
    if (!stage || !canvas) return;
    stage.className = 'preview-stage backdrop-' + previewBackdrop + (previewGrid ? ' show-grid' : '');
    var width = 360 * previewScale;
    var height = 240 * previewScale;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    stage.style.setProperty('--pixel-grid-size', Math.max(4, previewScale * 8) + 'px');
  }
  function itemByKey(key) {
    return (snapshot && snapshot.items || []).find(function (item) { return item.key === key; }) || null;
  }
  function compareItems() {
    return compareKeys.map(itemByKey).filter(Boolean);
  }
  function paintCompareCanvases(time) {
    var items = compareItems();
    Array.prototype.forEach.call(document.querySelectorAll('.compare-card[data-compare-key]'), function (card) {
      var item = itemByKey(card.getAttribute('data-compare-key'));
      var canvas = card.querySelector('canvas');
      if (!item || !canvas) return;
      var preview = previewMotion(item, time);
      canvasPaint(canvas, item, preview ? preview.frame : (motionFor(item) && motionFor(item).frame), preview);
      previewPaintCount += 1;
    });
  }
  function repaintFocused() {
    var motion = selected ? previewMotion(selected, previewTime) : null;
    var inspectorCanvas = $('inspect-canvas');
    if (selected && inspectorCanvas) canvasPaint(inspectorCanvas, selected, motion ? motion.frame : frameFor(selected), motion);
    renderPreviewWindow();
    paintCompareCanvases(previewTime);
    renderPopupPreview();
    syncPreviewTimeUi(true);
  }
  function renderCompareWall() {
    var root = $('compare-wall');
    var items = compareItems();
    $('compare-count').textContent = items.length
      ? tr('visual.compareCount', { n: items.length, max: MAX_COMPARE })
      : tr('visual.compareEmpty');
    $('compare-clear').disabled = !items.length;
    if (!items.length) {
      root.innerHTML = '<p class="compare-empty">' + esc(tr('visual.compareHint')) + '</p>';
      return;
    }
    root.innerHTML = items.map(function (item) {
      return '<article class="compare-card' + (selected && selected.key === item.key ? ' active' : '') + '" data-compare-key="' + esc(item.key) + '">' +
        '<button type="button" class="compare-remove" data-compare-remove="' + esc(item.key) + '" aria-label="' + esc(tr('visual.compareRemove')) + '">×</button>' +
        '<button type="button" class="compare-select" data-compare-select="' + esc(item.key) + '"><canvas width="180" height="132"></canvas><span><strong>' + esc(item.name || item.id) + '</strong><small>' + esc(item.id) + '</small></span></button></article>';
    }).join('');
    paintCompareCanvases(previewTime);
  }
  function addSelectedToCompare() {
    if (!selected || compareKeys.indexOf(selected.key) >= 0 || compareKeys.length >= MAX_COMPARE) return;
    compareKeys.push(selected.key);
    renderCompareWall();
    renderGallery();
    renderPreviewWindow();
    updateUrl();
  }
  function removeFromCompare(key) {
    compareKeys = compareKeys.filter(function (value) { return value !== key; });
    renderCompareWall();
    renderGallery();
    renderPreviewWindow();
    updateUrl();
  }
  function renderPreviewWindow() {
    var canvas = $('preview-canvas');
    var empty = $('preview-empty');
    var name = $('preview-name');
    var meta = $('preview-meta');
    if (!canvas || !empty || !name || !meta) return;
    applyStageSettings();
    var motion = selected ? previewMotion(selected, previewTime) : null;
    name.textContent = selected ? (selected.name || selected.id) : '--';
    meta.textContent = previewMeta(selected, motion);
    empty.hidden = !!selected;
    $('compare-add').disabled = !selected || compareKeys.indexOf(selected.key) >= 0 || compareKeys.length >= MAX_COMPARE;
    if (selected) {
      canvasPaint(canvas, selected, motion ? motion.frame : (motionFor(selected) && motionFor(selected).frame), motion, { guides: previewGuides });
      canvas.setAttribute('aria-label', selected.name || selected.id);
    } else {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.removeAttribute('aria-label');
    }
    syncPreviewTimeUi(true);
  }
  function renderPopupPreview() {
    if (!previewPopup || previewPopup.closed) { previewPopup = null; return; }
    var canvas = previewPopup.document.getElementById('preview-popup-canvas');
    var title = previewPopup.document.getElementById('preview-popup-title');
    var meta = previewPopup.document.getElementById('preview-popup-meta');
    if (!canvas || !title || !meta) return;
    var motion = selected ? previewMotion(selected, previewTime) : null;
    title.textContent = selected ? (selected.name || selected.id) : tr('visual.previewWindow');
    meta.textContent = previewMeta(selected, motion);
    var popupBackdrops = { checker: '#111914', night: '#080d17', grass: '#263825', paper: '#9a7d50' };
    canvas.style.background = popupBackdrops[previewBackdrop] || popupBackdrops.checker;
    if (selected) canvasPaint(canvas, selected, motion ? motion.frame : (motionFor(selected) && motionFor(selected).frame), motion, { guides: previewGuides });
    else canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }
  function openPreviewPopup() {
    if (previewPopup && !previewPopup.closed) { previewPopup.focus(); renderPopupPreview(); return; }
    previewPopup = window.open('', 'firpg-render-gallery-preview', 'popup,width=680,height=620,resizable=yes,scrollbars=no');
    if (!previewPopup) {
      $('preview-status').textContent = tr('visual.previewBlocked');
      return;
    }
    try {
      previewPopup.document.open();
      previewPopup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(tr('visual.previewWindow')) + '</title><style>html,body{margin:0;min-width:320px;background:#0c1010;color:#ece8dc;font-family:monospace}main{display:grid;gap:14px;padding:18px}h1{margin:0;color:#e4c873;font-size:20px;font-weight:normal;overflow-wrap:anywhere}p{margin:0;color:#9aa89a;font-size:12px;line-height:1.5}canvas{display:block;width:100%;height:auto;min-height:260px;image-rendering:pixelated;border:1px solid #59664f;background:#111914}</style></head><body><main><h1 id="preview-popup-title"></h1><canvas id="preview-popup-canvas" width="520" height="360"></canvas><p id="preview-popup-meta"></p></main></body></html>');
      previewPopup.document.close();
      previewPopup.focus();
      renderPopupPreview();
    } catch (error) {
      previewPopup = null;
      $('preview-status').textContent = tr('visual.previewBlocked');
    }
  }
  function renderInspector() {
    var root = $('inspector-content');
    if (!selected) { root.innerHTML = '<p class="muted">' + esc(tr('visual.noResults')) + '</p>'; renderPreviewWindow(); return; }
    var item = selected;
    var motion = motionFor(item);
    var html = '<div class="inspector-card">';
    html += '<div class="inspect-title"><canvas id="inspect-canvas" width="96" height="96"></canvas><div><h3>' + esc(item.name || item.id) + '</h3><small>' + esc(item.id) + '</small></div></div>';
    if (item.width) html += '<div class="inspect-meta"><span>' + esc(tr('visual.dimensions', { w: item.width, h: item.height, x: item.anchor.x, y: item.anchor.y })) + '</span><span>' + esc(tr('visual.frames')) + ': ' + esc((item.frameNames || []).join(', ')) + '</span><span>' + esc(tr('visual.source')) + ': ' + esc((item.sourceRefs || []).join(', ') || tr('visual.noSource')) + '</span></div>';
    if (item.motion) {
      html += '<h4>' + esc(tr('visual.coverage')) + '</h4><div class="coverage-grid">';
      Game.visualCatalog.motionStates().forEach(function (state) {
        Game.visualCatalog.directions().forEach(function (direction) {
          var cell = item.motion[state][direction];
          html += '<div class="coverage-cell ' + esc(cell.coverage) + '"><b>' + esc(state + '/' + direction) + '</b>' + esc(motionLabel(cell.coverage)) + '</div>';
        });
      });
      html += '</div>';
      if (motion) html += '<div class="inspect-meta"><span>' + esc(tr('visual.motion')) + ': ' + esc($('motion-select').value + ' / ' + $('direction-select').value) + ' · ' + esc(motionLabel(motion.coverage)) + '</span></div>';
    }
    if (item.preview) html += '<div class="inspect-meta"><span>' + esc(tr('visual.previewMode')) + ': ' + esc(previewLabel(item)) + '</span></div>';
    if (item.sourceRefs && item.sourceRefs.length) html += '<ul class="source-list">' + item.sourceRefs.map(function (ref) { return '<li>' + esc(ref) + '</li>'; }).join('') + '</ul>';
    html += '</div>';
    root.innerHTML = html;
    var preview = previewMotion(item, previewTime);
    canvasPaint($('inspect-canvas'), item, preview ? preview.frame : (motion && motion.frame), preview);
    renderPreviewWindow();
  }
  function visibleItems() {
    var category = $('category-select').value;
    var search = String($('search-input').value || '').trim().toLowerCase();
    return (snapshot && snapshot.items || []).filter(function (item) {
      if (category !== 'all' && item.group !== category) return false;
      return !search || (item.id + ' ' + (item.name || '') + ' ' + (item.sourceRefs || []).join(' ')).toLowerCase().indexOf(search) >= 0;
    });
  }
  function syncSelectionToVisible() {
    var items = visibleItems();
    if (selected && items.some(function (item) { return item.key === selected.key; })) return;
    selected = items[0] || null;
  }
  function isCardVisible(button) {
    if (!button || !button.getBoundingClientRect) return true;
    var rect = button.getBoundingClientRect();
    return rect.bottom >= -120 && rect.top <= (window.innerHeight || document.documentElement.clientHeight) + 120;
  }
  function observeCards() {
    if (cardObserver) cardObserver.disconnect();
    cardObserver = null;
    visibleCardIndexes = {};
    animatedCardButtons = Array.prototype.slice.call(document.querySelectorAll('.asset-card[data-animated="1"]'));
    var cards = animatedCardButtons;
    if (window.IntersectionObserver) {
      cardObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var index = entry.target.getAttribute('data-item-index');
          visibleCardIndexes[index] = entry.isIntersecting;
        });
      }, { rootMargin: '120px 0px' });
      Array.prototype.forEach.call(cards, function (card) { cardObserver.observe(card); });
    }
  }
  function categoryIds() {
    var counts = snapshot && snapshot.counts || {};
    return ['all'].concat(Object.keys(counts).sort());
  }
  function categoryLabel(id) {
    var key = 'visual.category.' + id;
    var label = tr(key);
    return label === key ? id : label;
  }
  function renderCategoryTabs() {
    var root = $('category-tabs');
    if (!root) return;
    var category = $('category-select').value || 'all';
    var counts = snapshot && snapshot.counts || {};
    root.innerHTML = categoryIds().map(function (id) {
      var count = id === 'all' ? (snapshot && snapshot.items || []).length : counts[id] || 0;
      return '<button type="button" class="category-tab' + (category === id ? ' active' : '') + '" role="tab" aria-selected="' + (category === id ? 'true' : 'false') + '" data-category="' + esc(id) + '">' + esc(categoryLabel(id)) + '<small>' + esc(count) + '</small></button>';
    }).join('');
  }
  function setCategory(id) {
    if (categoryIds().indexOf(id) < 0) id = 'all';
    $('category-select').value = id;
    renderCategoryTabs();
    syncSelectionToVisible();
    renderGallery();
    renderInspector();
    renderCompareWall();
    updateUrl();
  }
  function renderGallery() {
    var items = visibleItems();
    $('result-count').textContent = tr('visual.count', { n: items.length });
    if (!items.length) {
      $('gallery').innerHTML = '<div class="empty">' + esc(tr('visual.noResults')) + '</div>';
      observeCards();
      return;
    }
    $('gallery').innerHTML = items.map(function (item, index) {
      var motion = motionFor(item);
      var coverage = motion && motion.coverage;
      var tag = item.kind === 'asset'
        ? (coverage ? motionLabel(coverage) : tr('visual.frames'))
        : (item.preview ? previewLabel(item) : item.group);
      return '<button type="button" class="asset-card' + (selected && selected.key === item.key ? ' active' : '') + (compareKeys.indexOf(item.key) >= 0 ? ' pinned' : '') + '" data-item-index="' + index + '" data-animated="' + (isAnimatedItem(item) ? '1' : '0') + '"><canvas width="72" height="72"></canvas><span><span class="asset-name">' + esc(item.name || item.id) + '</span><small>' + esc(item.id) + '</small><i class="asset-tag ' + (coverage || '') + '">' + esc(tag) + '</i></span></button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.asset-card'), function (button, index) {
      var item = items[index];
      var preview = previewMotion(item, previewTime);
      canvasPaint(button.querySelector('canvas'), item,
        preview ? preview.frame : (motionFor(item) && motionFor(item).frame), preview);
    });
    observeCards();
  }
  function renderCatalog() {
    var categories = categoryIds();
    var category = $('category-select').value || categoryFromUrl || 'all';
    if (categories.indexOf(category) < 0) category = 'all';
    $('category-select').innerHTML = categories.map(function (id) { return '<option value="' + esc(id) + '">' + esc(categoryLabel(id)) + '</option>'; }).join('');
    $('category-select').value = category;
    renderCategoryTabs();
    renderGallery();
  }
  function renderAudit() {
    $('audit-count').textContent = snapshot.issues.length ? tr('visual.auditIssues', { n: snapshot.issues.length }) : tr('visual.noIssues');
    $('region-count').textContent = String(snapshot.regions.length);
    $('source-status').textContent = snapshot.totalAssets + ' assets / ' + snapshot.totalItems + ' entries';
    $('status-line').textContent = tr('visual.ready');
  }
  function setupRegion() {
    region = regions[currentRegion];
    if (!region) return;
    var rid = region.id;
    previewTime = 0;
    lastPreviewPaint = -1;
    snapshot = Game.visualCatalog.snapshot({ regionId: rid });
    if (selected && !(snapshot.items || []).some(function (item) { return item.key === selected.key; })) selected = null;
    if (!selected && assetFromUrl) selected = itemByKey(assetFromUrl);
    compareKeys = compareKeys.filter(function (key, index) {
      return index < MAX_COMPARE && !!itemByKey(key) && compareKeys.indexOf(key) === index;
    });
    renderAudit();
    renderCatalog();
    if (!selected) {
      var initialItems = visibleItems();
      selected = initialItems[0] || (snapshot.items || [])[0] || null;
      if (selected) renderGallery();
    }
    renderInspector();
    renderCompareWall();
    updateUrl();
  }
  function updateUrl() {
    if (location.protocol === 'file:') return;
    var url = new URL(location.href);
    url.searchParams.set('region', region && region.id || 'grassland');
    url.searchParams.set('category', $('category-select').value || 'all');
    url.searchParams.set('motion', $('motion-select').value || 'idle');
    url.searchParams.set('direction', $('direction-select').value || 'd');
    if (selected) url.searchParams.set('asset', selected.key); else url.searchParams.delete('asset');
    if (reducedMotion) url.searchParams.set('reduced', '1'); else url.searchParams.delete('reduced');
    if (previewScale !== 1) url.searchParams.set('scale', String(previewScale)); else url.searchParams.delete('scale');
    if (previewSpeed !== 1) url.searchParams.set('speed', String(previewSpeed)); else url.searchParams.delete('speed');
    if (previewBackdrop !== 'checker') url.searchParams.set('backdrop', previewBackdrop); else url.searchParams.delete('backdrop');
    if (previewGrid) url.searchParams.set('grid', '1'); else url.searchParams.delete('grid');
    if (previewGuides) url.searchParams.set('guides', '1'); else url.searchParams.delete('guides');
    if (compareKeys.length) url.searchParams.set('compare', compareKeys.join(',')); else url.searchParams.delete('compare');
    url.searchParams.set('lang', D.locale());
    history.replaceState(null, '', url.href);
  }
  function frame(timestamp) {
    var dt = Math.min(0.1, Math.max(0, (timestamp - lastFrame) / 1000)); lastFrame = timestamp;
    if (!paused) {
      previewTime += dt * previewSpeed;
    }
    paintMotionPreviews(previewTime);
    requestAnimationFrame(frame);
  }
  function bind() {
    D.init();
    var audit = Game.content.finalize({ strict: true });
    if (!audit.ok) throw new Error('[RenderGallery] content registry audit failed');
    regions = Game.reg.all('region');
    $('region-select').innerHTML = regions.map(function (item) { return '<option value="' + esc(item.id) + '">' + esc(nameRegion(item)) + '</option>'; }).join('');
    Game.visualCatalog.motionStates().forEach(function (id) { $('motion-select').insertAdjacentHTML('beforeend', '<option value="' + esc(id) + '">' + esc(tr('visual.' + id)) + '</option>'); });
    var params = new URLSearchParams(location.search); var rid = params.get('region'); currentRegion = Math.max(0, regions.findIndex(function (item) { return item.id === rid; })); if (currentRegion < 0) currentRegion = 0;
    $('region-select').value = regions[currentRegion].id;
    $('motion-select').value = params.get('motion') || 'idle'; $('direction-select').value = params.get('direction') || 'd';
    reducedMotion = params.get('reduced') === '1'; $('reduced-motion').checked = reducedMotion;
    var requestedScale = Math.round(Number(params.get('scale')) || 1);
    previewScale = Math.max(1, Math.min(4, requestedScale));
    var requestedSpeed = Number(params.get('speed')) || 1;
    previewSpeed = [0.25, 0.5, 1, 2].indexOf(requestedSpeed) >= 0 ? requestedSpeed : 1;
    previewBackdrop = ['checker', 'night', 'grass', 'paper'].indexOf(params.get('backdrop')) >= 0 ? params.get('backdrop') : 'checker';
    previewGrid = params.get('grid') === '1';
    previewGuides = params.get('guides') === '1';
    compareKeys = String(params.get('compare') || '').split(',').filter(Boolean).slice(0, MAX_COMPARE);
    assetFromUrl = params.get('asset') || '';
    $('preview-scale').value = String(previewScale);
    $('preview-speed').value = String(previewSpeed);
    $('preview-backdrop').value = previewBackdrop;
    $('preview-grid').checked = previewGrid;
    $('preview-guides').checked = previewGuides;
    applyStageSettings();
    syncPauseLabel();
    $('region-select').addEventListener('change', function () { currentRegion = regions.findIndex(function (item) { return item.id === $('region-select').value; }); setupRegion(); });
    categoryFromUrl = params.get('category') || 'all';
    $('search-input').addEventListener('input', function () { syncSelectionToVisible(); renderGallery(); renderInspector(); renderCompareWall(); }); $('category-select').addEventListener('change', function () { setCategory($('category-select').value); });
    $('motion-select').addEventListener('change', function () { renderGallery(); renderInspector(); renderCompareWall(); updateUrl(); }); $('direction-select').addEventListener('change', function () { renderGallery(); renderInspector(); renderCompareWall(); updateUrl(); });
    $('reduced-motion').addEventListener('change', function () { reducedMotion = $('reduced-motion').checked; setupRegion(); }); $('pause').addEventListener('click', function () { paused = !paused; syncPauseLabel(); repaintFocused(); });
    $('preview-reset').addEventListener('click', function () { previewTime = 0; lastPreviewPaint = -1; repaintFocused(); }); $('preview-popout').addEventListener('click', openPreviewPopup);
    $('preview-scale').addEventListener('change', function () { previewScale = Math.max(1, Math.min(4, Math.round(Number($('preview-scale').value) || 1))); applyStageSettings(); repaintFocused(); updateUrl(); });
    $('preview-speed').addEventListener('change', function () { previewSpeed = Number($('preview-speed').value) || 1; updateUrl(); });
    $('preview-backdrop').addEventListener('change', function () { previewBackdrop = $('preview-backdrop').value; applyStageSettings(); repaintFocused(); updateUrl(); });
    $('preview-grid').addEventListener('change', function () { previewGrid = $('preview-grid').checked; applyStageSettings(); repaintFocused(); updateUrl(); });
    $('preview-guides').addEventListener('change', function () { previewGuides = $('preview-guides').checked; repaintFocused(); updateUrl(); });
    $('preview-scrubber').addEventListener('input', function () { var duration = previewDuration(selected); previewTime = duration * (Number($('preview-scrubber').value) / 1000); paused = true; syncPauseLabel(); repaintFocused(); });
    $('preview-step-back').addEventListener('click', function () { previewTime = Math.max(0, previewTime - 0.1); paused = true; syncPauseLabel(); repaintFocused(); });
    $('preview-step-forward').addEventListener('click', function () { previewTime += 0.1; paused = true; syncPauseLabel(); repaintFocused(); });
    $('compare-add').addEventListener('click', addSelectedToCompare);
    $('compare-clear').addEventListener('click', function () { compareKeys = []; renderCompareWall(); renderGallery(); renderPreviewWindow(); updateUrl(); });
    $('category-tabs').addEventListener('click', function (event) { var tab = event.target.closest('[data-category]'); if (tab) setCategory(tab.getAttribute('data-category')); });
    $('gallery').addEventListener('click', function (event) { var card = event.target.closest('[data-item-index]'); if (!card) return; var items = visibleItems(); selected = items[Number(card.getAttribute('data-item-index'))] || null; renderGallery(); renderInspector(); renderCompareWall(); updateUrl(); });
    $('compare-wall').addEventListener('click', function (event) {
      var remove = event.target.closest('[data-compare-remove]');
      if (remove) { removeFromCompare(remove.getAttribute('data-compare-remove')); return; }
      var select = event.target.closest('[data-compare-select]');
      if (!select) return;
      selected = itemByKey(select.getAttribute('data-compare-select'));
      renderGallery(); renderInspector(); renderCompareWall(); updateUrl();
    });
    window.addEventListener('demo:locale', function () { syncPauseLabel(); setupRegion(); if (previewPopup && !previewPopup.closed) { previewPopup.document.title = tr('visual.previewWindow'); renderPopupPreview(); } });
    setupRegion();
    window.RenderGalleryLab = {
      snapshot: function () { return copy(snapshot); },
      select: function (key) { selected = itemByKey(key); renderGallery(); renderInspector(); renderCompareWall(); updateUrl(); return copy(selected); },
      compare: function (key) { selected = itemByKey(key); if (selected) addSelectedToCompare(); return copy(compareItems()); },
      clearCompare: function () { compareKeys = []; renderCompareWall(); renderGallery(); renderPreviewWindow(); updateUrl(); },
      refresh: setupRegion,
      setReducedMotion: function (value) { reducedMotion = !!value; $('reduced-motion').checked = reducedMotion; setupRegion(); },
      setPreviewOptions: function (options) {
        options = options || {};
        if (options.scale !== undefined) previewScale = Math.max(1, Math.min(4, Math.round(Number(options.scale) || 1)));
        if (options.speed !== undefined && [0.25, 0.5, 1, 2].indexOf(Number(options.speed)) >= 0) previewSpeed = Number(options.speed);
        if (options.backdrop !== undefined && ['checker', 'night', 'grass', 'paper'].indexOf(options.backdrop) >= 0) previewBackdrop = options.backdrop;
        if (options.grid !== undefined) previewGrid = !!options.grid;
        if (options.guides !== undefined) previewGuides = !!options.guides;
        $('preview-scale').value = String(previewScale); $('preview-speed').value = String(previewSpeed); $('preview-backdrop').value = previewBackdrop; $('preview-grid').checked = previewGrid; $('preview-guides').checked = previewGuides;
        applyStageSettings(); repaintFocused(); updateUrl();
      },
      metrics: function () { return { previewPaints: previewPaintCount, animatedCards: animatedCardButtons.length, compareItems: compareItems().length, previewScale: previewScale, previewSpeed: previewSpeed }; }
    };
    requestAnimationFrame(frame);
  }
  D.init(); bind();
})();
