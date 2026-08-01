/* global Game, DemoI18n */
(function () {
  'use strict';

  var U = Game.util;
  var D = DemoI18n;
  var C = Game.contentCompiler;
  var regions = [];
  var currentIndex = 0;
  var layout = null;
  var region = null;
  var validation = null;
  var populationPlan = null;
  var populationContext = null;
  var actors = [];
  var masters = {};
  var catalogItems = [];
  var auditIssues = [];
  var logs = [];
  var selected = null;
  var tool = 'inspect';
  var measureState = { a: null, b: null, path: null, report: null };
  var probeState = null;
  var candidateInspection = null;
  var merchantAudit = null;
  var merchantQaPoint = null;
  var merchantActorId = null;
  var merchantSpawnId = null;
  var merchantRequestOrdinal = 0;
  var merchantPatrolMax = 0;
  var issueIndex = -1;
  var motion = false;
  var motionAccumulator = 0;
  var actorOrigins = {};
  var actorRng = {};
  var recentSeeds = [];
  var generationRecord = null;
  var miniTerrain = null;
  var decorField = null;
  var decorFieldKey = null;
  var spatialQueries = 0;
  var frameSamples = [];
  var lastFrame = performance.now();
  var lastMetricsPaint = 0;
  var overlay = document.getElementById('stage-overlay');
  var overlayCtx = overlay.getContext('2d');
  var minimap = document.getElementById('minimap');
  var minimapCtx = minimap.getContext('2d');
  var stageWrap = document.getElementById('stage-wrap');
  var stagePointers = {};
  var miniDrag = false;
  var layers = {};

  var copy = function (value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  };
  var now = function () { return performance.now(); };
  var esc = function (value) { return U.esc(String(value)); };
  var clamp = U.clamp;
  var localeText = {
    'zh-CN': {
      ready: '生成完成', generating: '正在生成', none: '尚未选择对象',
      inspectHint: '在主地图点击位置，检查材质、导航与最近对象。',
      measureHint: '依次点击 A / B 点，使用正式导航求解路径。',
      placementHint: '选择 SpawnProfile 后，在主地图点击候选位置。',
      terrain: '地形', population: 'Population', actor: 'Actor', audit: '审计',
      generation: '生成', bake: '烘焙', materialize: '实例化', renderer: '渲染',
      pass: '通过', fail: '拒绝', issues: '问题', noIssues: '本次放置审计未发现问题。',
      definitions: '定义', placed: '已放置', selected: '选中对象', details: '详细信息',
      copied: '已复制', reset: 'Actor 已精确复位', verified: '确定性复验通过',
      mismatch: '确定性复验不一致', png: '已导出主画布 PNG',
      noPath: '正式导航未找到路径', catalog: '目录项', logCleared: '日志已清空',
      instances: '当前实例', currentMapScope: '当前地图', allMapsScope: '全部地图定义',
      decorInstances: '生态装饰', decorClusters: '簇群中心', decorDefinitions: '装饰类型',
      decorNearest: '平均最近邻', decorEnrichment: '同类富集倍数', decorCoverage: '配额完成率',
      habitatViable: '适宜区域', habitatNone: '选择装饰后显示适宜度场',
      merchantHint: '点击主地图设置模拟玩家位置，并用正式行商放置规则重新审计。',
      merchantProfile: '行商档案', merchantSource: '候选来源', merchantEligible: '距离内候选',
      merchantValid: '合法候选', merchantClearance: '篷车净宽', merchantPatrol: '巡游约束',
      merchantPass: '通过', merchantFail: '失败', merchantNoPlacement: '没有合法篷车位置',
      merchantQa: '模拟玩家', merchantWagon: '篷车锚点', merchantRejected: '拒绝分布',
      merchantMoved: '已更新模拟玩家位置'
    },
    en: {
      ready: 'Generation complete', generating: 'Generating', none: 'No object selected',
      inspectHint: 'Click the main map to inspect material, navigation and nearby objects.',
      measureHint: 'Click A then B to solve a route with production navigation.',
      placementHint: 'Choose a SpawnProfile and click a candidate position.',
      terrain: 'Terrain', population: 'Population', actor: 'Actor', audit: 'Audit',
      generation: 'Generate', bake: 'Bake', materialize: 'Materialize', renderer: 'Render',
      pass: 'Pass', fail: 'Rejected', issues: 'Issues', noIssues: 'No placement issues found.',
      definitions: 'definitions', placed: 'placed', selected: 'Selection', details: 'Details',
      copied: 'Copied', reset: 'Actor positions restored exactly', verified: 'Determinism verified',
      mismatch: 'Determinism mismatch', png: 'Main canvas PNG exported',
      noPath: 'Production navigation found no route', catalog: 'catalog items', logCleared: 'Log cleared',
      instances: 'current instances', currentMapScope: 'current map', allMapsScope: 'all map definitions',
      decorInstances: 'ecology props', decorClusters: 'cluster centers', decorDefinitions: 'decor types',
      decorNearest: 'mean nearest', decorEnrichment: 'same-type enrichment', decorCoverage: 'quota coverage',
      habitatViable: 'viable habitat', habitatNone: 'select a decoration to inspect habitat',
      merchantHint: 'Click the map to move the simulated player and rerun production merchant placement.',
      merchantProfile: 'merchant profile', merchantSource: 'candidate source', merchantEligible: 'range candidates',
      merchantValid: 'legal candidates', merchantClearance: 'wagon clearance', merchantPatrol: 'patrol contract',
      merchantPass: 'Pass', merchantFail: 'Fail', merchantNoPlacement: 'No legal wagon placement',
      merchantQa: 'simulated player', merchantWagon: 'wagon anchor', merchantRejected: 'rejections',
      merchantMoved: 'Simulated player position updated'
    }
  };

  function lt(key) {
    var table = localeText[D.locale()] || localeText['zh-CN'];
    return table[key] || key;
  }

  function nameFromKey(key, fallback) {
    if (!key) return fallback;
    var value = Game.i18n.t(key);
    return value === key ? fallback : value;
  }

  function regionName(value) {
    return nameFromKey('region.' + value.id + '.name', value.id);
  }

  function actorName(definition) {
    return nameFromKey(definition && definition.identity && definition.identity.nameKey, definition && definition.id || 'actor');
  }

  function log(phase, message, data, level) {
    logs.push({
      at: new Date().toISOString(),
      phase: phase,
      level: level || 'info',
      message: message,
      data: data === undefined ? null : copy(data)
    });
    if (logs.length > 240) logs.splice(0, logs.length - 240);
    renderLogs();
  }

  function hash(value) {
    return U.fnv1a(JSON.stringify(value));
  }

  function parseSeed(value) {
    var clean = String(value || '').trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,8}$/i.test(clean)) return null;
    return parseInt(clean, 16) >>> 0;
  }

  function seedValue() {
    return parseSeed(document.getElementById('seed-input').value);
  }

  function rememberSeed(seed) {
    recentSeeds = [seed].concat(recentSeeds.filter(function (entry) { return entry !== seed; })).slice(0, 7);
    renderSeedHistory();
  }

  function renderSeedHistory() {
    var host = document.getElementById('seed-history');
    if (!host) {
      host = document.createElement('div');
      host.id = 'seed-history';
      host.className = 'seed-history';
      document.getElementById('seed-form').insertAdjacentElement('afterend', host);
    }
    host.innerHTML = recentSeeds.map(function (seed) {
      return '<button type="button" data-recent-seed="' + U.hex32(seed) + '">0x' + U.hex32(seed) + '</button>';
    }).join('');
  }

  function setStatus(message) {
    document.getElementById('action-status').textContent = message || '';
  }

  function updateUrl() {
    if (location.protocol === 'file:') return;
    var url = new URL(location.href);
    url.searchParams.set('region', region.id);
    url.searchParams.set('seed', U.hex32(layout.worldSeed));
    history.replaceState(null, '', url.href);
  }

  function contentPoint(item, kind) {
    return {
      key: kind + ':' + (item.id || item.defId || item.sprite || item.x + ':' + item.y),
      kind: kind,
      id: item.id || item.defId || item.sprite || kind,
      name: item.nameKey ? nameFromKey(item.nameKey, item.defId || item.id) : (item.defId || item.id || item.sprite || kind),
      sprite: item.sprite || null,
      x: item.x,
      y: item.y,
      data: item
    };
  }

  function liveActorPoint(actor) {
    var definition = Game.content.get('actorArchetype', actor.blueprint.archetypeId);
    return {
      key: 'actor:' + actor.id,
      kind: 'actor',
      id: actor.id,
      name: actorName(definition),
      sprite: actor.components.presentation.spriteId,
      x: actor.x,
      y: actor.y,
      data: actor,
      category: actor.category,
      rank: actor.rank
    };
  }

  function allWorldPoints() {
    if (!layout) return [];
    var out = actors.map(liveActorPoint);
    out.push(contentPoint({ id: 'camp', x: layout.camp.x, y: layout.camp.y }, 'camp'));
    (masters.landmarks || []).forEach(function (item) { out.push(contentPoint(item, item.bossLair ? 'lair' : 'landmark')); });
    (masters.nodes || []).forEach(function (item) { out.push(contentPoint(item, 'resource')); });
    (masters.curios || []).forEach(function (item) { out.push(contentPoint(item, 'curio')); });
    (masters.ecology || []).forEach(function (item) { out.push(contentPoint(item, 'ecology')); });
    (layout.hazardAnchors || []).forEach(function (item, index) {
      out.push(contentPoint(Object.assign({ id: 'hazard-anchor-' + index }, item), 'hazard'));
    });
    (layout.nests || []).forEach(function (item) { out.push(contentPoint(item, 'nest')); });
    (layout.treasureSites || []).forEach(function (item) { out.push(contentPoint(item, 'nest-treasure')); });
    (layout.guardSites || []).forEach(function (item) { out.push(contentPoint(item, 'guard-site')); });
    (layout.rareThreats || []).forEach(function (item) { out.push(contentPoint(item, 'rare-threat')); });
    if (layout.bossGatePoint) out.push(contentPoint(layout.bossGatePoint, 'boss-gate'));
    return out;
  }

  function stableTerrainSnapshot(value) {
    return value && value.version >= 4 && Game.terrain.snapshotV4
      ? Game.terrain.snapshotV4(value) : Game.terrain.snapshotV3(value);
  }

  function nearestObject(x, y, maxDistance) {
    var best = null;
    allWorldPoints().forEach(function (item) {
      var distance = U.dist(x, y, item.x, item.y);
      if ((!best || distance < best.distance) && (maxDistance === undefined || distance <= maxDistance)) {
        best = { item: item, distance: distance };
      }
    });
    return best;
  }

  function cameraBounds(x, y, zoom) {
    if (!layout) return { x: x, y: y };
    var width = stageWrap.clientWidth / zoom;
    var height = stageWrap.clientHeight / zoom;
    return {
      x: clamp(x, Math.min(layout.world.w / 2, width / 2), Math.max(layout.world.w / 2, layout.world.w - width / 2)),
      y: clamp(y, Math.min(layout.world.h / 2, height / 2), Math.max(layout.world.h / 2, layout.world.h - height / 2))
    };
  }

  function setCamera(x, y, zoom) {
    if (!layout) return null;
    var cam = Game.render.cam;
    zoom = clamp(Number.isFinite(zoom) ? zoom : cam.zoom, 0.4, 3.4);
    var point = cameraBounds(Number(x), Number(y), zoom);
    cam.x = point.x;
    cam.y = point.y;
    cam.zoom = zoom;
    updateCameraStatus();
    drawMinimap();
    return copy(cam);
  }

  function focus(target) {
    var point = null;
    if (target === 'camp') point = layout && layout.camp;
    else if (target === 'boss' || target === 'lair') point = layout && layout.bossPoint;
    else if (target === 'reset') point = layout && { x: layout.world.w / 2, y: layout.world.h / 2, zoom: 1.1 };
    else if (target === 'selected') point = selected;
    else if (typeof target === 'string') {
      point = allWorldPoints().filter(function (item) { return item.id === target || item.key === target; })[0];
    } else if (target && Number.isFinite(target.x)) point = target;
    if (!point) return null;
    setCamera(point.x, point.y, point.zoom || Math.max(1.4, Game.render.cam.zoom));
    if (point.key) selectObject(point);
    return { x: point.x, y: point.y, zoom: Game.render.cam.zoom };
  }

  function worldToScreen(point) {
    var cam = Game.render.cam;
    return {
      x: stageWrap.clientWidth / 2 + (point.x - cam.x) * cam.zoom,
      y: stageWrap.clientHeight / 2 + (point.y - cam.y) * cam.zoom
    };
  }

  function screenToWorld(x, y) {
    var cam = Game.render.cam;
    return {
      x: cam.x + (x - stageWrap.clientWidth / 2) / cam.zoom,
      y: cam.y + (y - stageWrap.clientHeight / 2) / cam.zoom
    };
  }

  function decorationDefinition(sprite) {
    return (region && region.terrain && region.terrain.deco || []).filter(function (definition) {
      return definition.sprite === sprite;
    })[0] || null;
  }

  function activeDecorationSprite() {
    var sprite = selected && (selected.sprite || selected.data && selected.data.sprite);
    if (sprite && decorationDefinition(sprite)) return sprite;
    var definitions = region && region.terrain && region.terrain.deco || [];
    var preferred = definitions.filter(function (definition) {
      return definition.v3Only && definition.placement === 'ground';
    })[0] || definitions.filter(function (definition) {
      return definition.placement === 'ground';
    })[0];
    return preferred && preferred.sprite || null;
  }

  function refreshDecorField(force) {
    if (!layout || !region || !Game.terrain.decorationField) return null;
    var sprite = activeDecorationSprite();
    if (!sprite) {
      decorField = null;
      decorFieldKey = null;
      return null;
    }
    var key = region.id + ':' + layout.worldSeed + ':' + sprite;
    if (force || key !== decorFieldKey) {
      decorField = Game.terrain.decorationField(layout, region, sprite, 64);
      decorFieldKey = key;
    }
    return decorField;
  }

  function drawDecorHabitat() {
    var field = refreshDecorField(false);
    if (!field) return;
    var zoom = Game.render.cam.zoom;
    var topLeft = screenToWorld(0, 0);
    var bottomRight = screenToWorld(stageWrap.clientWidth, stageWrap.clientHeight);
    var left = clamp(Math.floor(topLeft.x / field.cell), 0, field.cols - 1);
    var top = clamp(Math.floor(topLeft.y / field.cell), 0, field.rows - 1);
    var right = clamp(Math.ceil(bottomRight.x / field.cell), 0, field.cols - 1);
    var bottom = clamp(Math.ceil(bottomRight.y / field.cell), 0, field.rows - 1);
    var size = Math.ceil(field.cell * zoom) + 1;
    for (var y = top; y <= bottom; y++) {
      for (var x = left; x <= right; x++) {
        var value = field.values[y * field.cols + x] || 0;
        if (value <= 0.02) continue;
        var screen = worldToScreen({ x: x * field.cell, y: y * field.cell });
        var red = Math.round(54 + value * 96);
        var green = Math.round(92 + value * 122);
        var blue = Math.round(72 - value * 24);
        overlayCtx.fillStyle = 'rgba(' + red + ',' + green + ',' + blue + ',' +
          (0.06 + value * 0.34).toFixed(3) + ')';
        overlayCtx.fillRect(Math.floor(screen.x), Math.floor(screen.y), size, size);
      }
    }
  }

  function clusterColor(pattern, alpha) {
    var colors = {
      blob: '104,202,132', edgeBand: '83,190,211', line: '232,190,92',
      row: '232,190,92', trail: '219,137,88', ring: '190,119,224',
      arc: '190,119,224', scatter: '174,182,151'
    };
    return 'rgba(' + (colors[pattern] || '174,182,151') + ',' + alpha + ')';
  }

  function drawDecorClusterGrammar() {
    var ecology = layout.decorationEcology;
    var sprite = activeDecorationSprite();
    if (!ecology || !sprite) return;
    var zoom = Game.render.cam.zoom;
    (ecology.clusters || []).forEach(function (cluster) {
      if (cluster.sprite !== sprite) return;
      var screen = worldToScreen(cluster);
      if (screen.x < -160 || screen.y < -160 ||
          screen.x > stageWrap.clientWidth + 160 || screen.y > stageWrap.clientHeight + 160) return;
      overlayCtx.save();
      overlayCtx.translate(screen.x, screen.y);
      overlayCtx.rotate(cluster.angle || 0);
      overlayCtx.beginPath();
      overlayCtx.ellipse(
        0, 0,
        Math.max(3, cluster.radiusX * zoom),
        Math.max(3, cluster.radiusY * zoom),
        0, 0, Math.PI * 2
      );
      overlayCtx.fillStyle = clusterColor(cluster.pattern, 0.06);
      overlayCtx.fill();
      overlayCtx.strokeStyle = clusterColor(cluster.pattern, 0.82);
      overlayCtx.lineWidth = 1;
      overlayCtx.setLineDash(cluster.pattern === 'scatter' ? [3, 3] : []);
      overlayCtx.stroke();
      overlayCtx.beginPath();
      overlayCtx.moveTo(-cluster.radiusX * zoom, 0);
      overlayCtx.lineTo(cluster.radiusX * zoom, 0);
      overlayCtx.strokeStyle = clusterColor(cluster.pattern, 0.46);
      overlayCtx.stroke();
      overlayCtx.restore();
      drawCircle(cluster, 3, clusterColor(cluster.pattern, 0.95), 'rgba(255,255,255,.16)');
    });
  }

  function drawDecorGroupLinks() {
    var ecology = layout.decorationEcology;
    var sprite = activeDecorationSprite();
    if (!ecology || !sprite) return;
    var centers = {};
    (ecology.clusters || []).forEach(function (cluster) { centers[cluster.id] = cluster; });
    (masters.props || []).forEach(function (prop) {
      if (prop.sprite !== sprite || !prop.decorGroup || !centers[prop.decorGroup]) return;
      drawWorldLine([centers[prop.decorGroup], prop], 'rgba(174,211,157,.28)', 1, [2, 3]);
    });
  }

  function resizeOverlay() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, stageWrap.clientWidth);
    var height = Math.max(1, stageWrap.clientHeight);
    if (overlay.width !== Math.round(width * dpr) || overlay.height !== Math.round(height * dpr)) {
      overlay.width = Math.round(width * dpr);
      overlay.height = Math.round(height * dpr);
    }
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlayCtx.imageSmoothingEnabled = false;
  }

  function drawCircle(point, radius, color, fill) {
    var screen = worldToScreen(point);
    overlayCtx.beginPath();
    overlayCtx.arc(screen.x, screen.y, Math.max(2, radius * Game.render.cam.zoom), 0, Math.PI * 2);
    if (fill) {
      overlayCtx.fillStyle = fill;
      overlayCtx.fill();
    }
    overlayCtx.strokeStyle = color;
    overlayCtx.lineWidth = 1;
    overlayCtx.stroke();
  }

  function drawWorldLine(points, color, width, dashed) {
    if (!points || !points.length) return;
    overlayCtx.save();
    overlayCtx.strokeStyle = color;
    overlayCtx.lineWidth = width || 2;
    overlayCtx.setLineDash(dashed || []);
    overlayCtx.beginPath();
    points.forEach(function (point, index) {
      var screen = worldToScreen(point);
      if (!index) overlayCtx.moveTo(screen.x, screen.y);
      else overlayCtx.lineTo(screen.x, screen.y);
    });
    overlayCtx.stroke();
    overlayCtx.restore();
  }

  function visibleGridRange(nav) {
    var topLeft = screenToWorld(0, 0);
    var bottomRight = screenToWorld(stageWrap.clientWidth, stageWrap.clientHeight);
    return {
      left: clamp(Math.floor(topLeft.x / nav.cell), 0, nav.w - 1),
      top: clamp(Math.floor(topLeft.y / nav.cell), 0, nav.h - 1),
      right: clamp(Math.ceil(bottomRight.x / nav.cell), 0, nav.w - 1),
      bottom: clamp(Math.ceil(bottomRight.y / nav.cell), 0, nav.h - 1)
    };
  }

  function drawGridLayer(kind) {
    if (!layout || !layout.nav) return;
    var nav = layout.nav;
    var range = visibleGridRange(nav);
    var zoom = Game.render.cam.zoom;
    var size = Math.ceil(nav.cell * zoom) + 1;
    for (var y = range.top; y <= range.bottom; y++) {
      for (var x = range.left; x <= range.right; x++) {
        var value;
        if (kind === 'nav') value = nav.grid[y][x] ? 0 : 1;
        else if (kind === 'distance') value = clamp((nav.distance[y][x] || 0) / 7, 0, 1);
        else value = clamp(nav.danger[y][x] || 0, 0, 1);
        if (kind !== 'nav' && value <= 0.02) continue;
        if (kind === 'nav' && !value) continue;
        var screen = worldToScreen({ x: x * nav.cell, y: y * nav.cell });
        overlayCtx.fillStyle = kind === 'nav'
          ? 'rgba(224,72,62,.30)'
          : kind === 'distance'
            ? 'rgba(78,193,211,' + (value * 0.35).toFixed(3) + ')'
            : 'rgba(238,126,54,' + (value * 0.38).toFixed(3) + ')';
        overlayCtx.fillRect(Math.floor(screen.x), Math.floor(screen.y), size, size);
      }
    }
  }

  function drawOverlay() {
    resizeOverlay();
    overlayCtx.clearRect(0, 0, stageWrap.clientWidth, stageWrap.clientHeight);
    if (!layout) return;
    if (layers.decorHabitat) drawDecorHabitat();
    if (layers.nav) drawGridLayer('nav');
    if (layers.distance) drawGridLayer('distance');
    if (layers.danger) drawGridLayer('danger');
    if (layers.chunks) {
      var chunk = layout.spatial && layout.spatial.cell || 192;
      overlayCtx.strokeStyle = 'rgba(208,203,120,.35)';
      overlayCtx.lineWidth = 1;
      for (var cx = 0; cx <= layout.world.w; cx += chunk) {
        drawWorldLine([{ x: cx, y: 0 }, { x: cx, y: layout.world.h }], 'rgba(208,203,120,.35)', 1, [3, 3]);
      }
      for (var cy = 0; cy <= layout.world.h; cy += chunk) {
        drawWorldLine([{ x: 0, y: cy }, { x: layout.world.w, y: cy }], 'rgba(208,203,120,.35)', 1, [3, 3]);
      }
    }
    if (layers.macro && layout.macro) {
      (layout.macro.edges || []).forEach(function (edge) {
        var a = layout.macro.centers[edge.a], b = layout.macro.centers[edge.b];
        if (a && b) drawWorldLine([a, b], '#68c9c4', 2);
      });
      (layout.macro.centers || []).forEach(function (center) { drawCircle(center, 5, '#f0df79', 'rgba(240,223,121,.18)'); });
    }
    if (layers.hazards) {
      (layout.hazardAnchors || []).forEach(function (item) {
        drawCircle(item, item.clearance || 12, '#e97d56', 'rgba(233,125,86,.08)');
      });
    }
    if (layers.threats) {
      (layout.threats || []).forEach(function (item) {
        drawCircle(item, item.radius || 18, '#d98955', 'rgba(217,137,85,.06)');
      });
    }
    if (layers.nests) {
      (layout.nests || []).forEach(function (nest) {
        var screen = worldToScreen(nest), zoom = Game.render.cam.zoom;
        overlayCtx.save();
        overlayCtx.strokeStyle = '#b982e7'; overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([5, 3]); overlayCtx.beginPath();
        overlayCtx.ellipse(screen.x, screen.y, nest.rx * zoom, nest.ry * zoom, 0, 0, Math.PI * 2);
        overlayCtx.stroke(); overlayCtx.restore();
        [nest.mainEntrance, nest.sideOpening].forEach(function (opening, index) {
          drawWorldLine([nest, { x: nest.x + Math.cos(opening.angle) * nest.rx,
            y: nest.y + Math.sin(opening.angle) * nest.ry }], index ? '#69cdd2' : '#f1d765', 3);
        });
      });
    }
    if (layers.treasureSites) (layout.treasureSites || []).forEach(function (site) {
      drawCircle(site, 8, '#f1d765', 'rgba(241,215,101,.24)');
    });
    if (layers.guardSites || layers.poolResolution) (layout.guardSites || []).forEach(function (site) {
      if (layers.guardSites) drawCircle(site, 10, site.mode === 'ambush' ? '#df6a86' : '#e99d5d', 'rgba(233,157,93,.16)');
      if (layers.poolResolution && Game.encounterPools) {
        var profile = Game.content.get('guardSiteProfile', site.profileId);
        var poolId = profile && (site.mode === 'ambush' ? profile.ambushPoolId : profile.visiblePoolId);
        var resolved = poolId && Game.encounterPools.resolve(poolId, { worldSeed: layout.worldSeed,
          regionId: region.id, layoutVersion: layout.version, expeditionIndex: 1, siteId: site.id });
        if (resolved) {
          var label = worldToScreen(site);
          overlayCtx.fillStyle = 'rgba(8,10,20,.82)'; overlayCtx.fillRect(label.x + 7, label.y - 20, 178, 15);
          overlayCtx.fillStyle = '#e9dc9a'; overlayCtx.font = '9px Consolas';
          overlayCtx.fillText(resolved.poolId.replace('pool.' + region.id + '.', '') + ' → ' +
            resolved.worldSpawnProfileId.replace('spawn.' + region.id + '.', ''), label.x + 10, label.y - 9);
        }
      }
    });
    if (layers.reservations && populationPlan) {
      populationPlan.reservations.forEach(function (item) {
        drawCircle(item, item.occupancyRadius || 10, '#c9a95b', 'rgba(201,169,91,.06)');
      });
    }
    if (layers.merchantAudit && merchantAudit) {
      if (merchantQaPoint) {
        drawCircle(merchantQaPoint, 7, '#68c9c4', 'rgba(104,201,196,.18)');
      }
      if (merchantAudit.chosen) {
        drawCircle(
          merchantAudit.chosen,
          merchantAudit.constraints.tradeRadius,
          'rgba(226,191,94,.72)',
          'rgba(226,191,94,.035)'
        );
        drawCircle(
          merchantAudit.chosen,
          merchantAudit.constraints.patrolRadius,
          '#83c77f',
          'rgba(131,199,127,.07)'
        );
        if (merchantQaPoint) {
          drawWorldLine([merchantQaPoint, merchantAudit.chosen], 'rgba(104,201,196,.48)', 1, [4, 3]);
        }
        var merchantActor = merchantActorId && actors.filter(function (actor) {
          return actor.id === merchantActorId;
        })[0];
        if (merchantActor) {
          drawWorldLine([merchantAudit.chosen, merchantActor], 'rgba(131,199,127,.62)', 1, [2, 2]);
        }
      }
    }
    if (layers.formations && populationPlan) {
      populationPlan.slots.forEach(function (slot) {
        var members = actors.filter(function (actor) { return actor._labSlotId === slot.id; })
          .map(function (actor) { return actorOrigins[actor.id] || actor; });
        if (members.length > 1) {
          drawWorldLine([{ x: slot.x, y: slot.y }].concat(members), 'rgba(174,126,229,.72)', 1, [2, 2]);
        }
      });
    }
    if (layers.candidates && candidateInspection) {
      candidateInspection.candidates.forEach(function (entry, index) {
        drawCircle(entry.candidate || entry.point, 3, entry.ok ? '#77c77b' : '#db6e5e',
          index === candidateInspection.chosenIndex ? 'rgba(242,215,105,.38)' : null);
      });
    }
    if (layers.spawnOrigins) {
      actors.forEach(function (actor) {
        var origin = actorOrigins[actor.id];
        if (!origin) return;
        drawCircle(origin, 3, '#82b8ee', 'rgba(130,184,238,.20)');
        if (motion && (actor.x !== origin.x || actor.y !== origin.y)) {
          drawWorldLine([origin, actor], 'rgba(130,184,238,.45)', 1, [3, 3]);
        }
      });
    }
    if (layers.decorClusters) drawDecorClusterGrammar();
    if (layers.decorGroups) drawDecorGroupLinks();
    if (measureState.a) drawCircle(measureState.a, 4, '#74d9d4', 'rgba(116,217,212,.35)');
    if (measureState.b) drawCircle(measureState.b, 4, '#f0d86e', 'rgba(240,216,110,.35)');
    if (measureState.path) drawWorldLine([measureState.a].concat(measureState.path), '#f1d765', 2);
    if (probeState && probeState.point) drawCircle(probeState.point, 5, probeState.ok ? '#79c87c' : '#e36f60', 'rgba(255,255,255,.10)');
    auditIssues.forEach(function (issue) {
      if (Number.isFinite(issue.x)) drawCircle(issue, 5, '#ee654f', 'rgba(238,101,79,.24)');
    });
    if (selected && Number.isFinite(selected.x)) drawCircle(selected, 9, '#fff18a', 'rgba(255,241,138,.10)');
    if (layers.ids) {
      overlayCtx.font = '9px Consolas';
      overlayCtx.textBaseline = 'bottom';
      allWorldPoints().forEach(function (item) {
        var screen = worldToScreen(item);
        if (screen.x < -40 || screen.y < -20 || screen.x > stageWrap.clientWidth + 40 || screen.y > stageWrap.clientHeight + 20) return;
        overlayCtx.fillStyle = 'rgba(8,10,8,.76)';
        overlayCtx.fillRect(screen.x + 5, screen.y - 14, Math.max(28, item.id.length * 5.5), 12);
        overlayCtx.fillStyle = '#eee3aa';
        overlayCtx.fillText(item.id, screen.x + 7, screen.y - 3);
      });
    }
  }

  function buildMiniTerrain() {
    if (!layout) return null;
    var canvas = document.createElement('canvas');
    canvas.width = layout.gw;
    canvas.height = layout.gh;
    var ctx = canvas.getContext('2d');
    for (var y = 0; y < layout.gh; y++) {
      for (var x = 0; x < layout.gw; x++) {
        var colors = layout.colorGrid[y * layout.gw + x];
        ctx.fillStyle = colors && colors[0] || '#30352c';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return canvas;
  }

  function miniPoint(point) {
    return {
      x: point.x / layout.world.w * minimap.width,
      y: point.y / layout.world.h * minimap.height
    };
  }

  function miniIcon(item) {
    var types = {
      camp: 'camp', landmark: 'landmark', lair: 'lair', resource: 'resource',
      curio: 'curio', ecology: 'ecology', hazard: 'threat'
    };
    var point = miniPoint(item);
    if (item.kind === 'actor') {
      if (item._labChannel === 'merchant') {
        Game.mapIcons.draw(minimapCtx, 'merchant', point.x, point.y, { size: 14 });
        return;
      }
      minimapCtx.fillStyle = item.rank === 'boss' ? '#f08b57' : (item.category === 'npc' ? '#6fd3c4' : '#e0cb6d');
      minimapCtx.fillRect(Math.round(point.x - 2), Math.round(point.y - 2), item.rank === 'boss' ? 6 : 4, item.rank === 'boss' ? 6 : 4);
      return;
    }
    Game.mapIcons.draw(minimapCtx, types[item.kind] || 'landmark', point.x, point.y, { size: item.kind === 'lair' ? 14 : 10 });
  }

  function drawMinimap() {
    if (!layout) return;
    minimapCtx.clearRect(0, 0, minimap.width, minimap.height);
    minimapCtx.imageSmoothingEnabled = false;
    minimapCtx.fillStyle = '#111512';
    minimapCtx.fillRect(0, 0, minimap.width, minimap.height);
    if (miniTerrain) minimapCtx.drawImage(miniTerrain, 0, 0, minimap.width, minimap.height);
    allWorldPoints().forEach(miniIcon);
    if (measureState.a) {
      var path = measureState.path ? [measureState.a].concat(measureState.path) : [measureState.a];
      minimapCtx.strokeStyle = '#fff074';
      minimapCtx.lineWidth = 2;
      minimapCtx.beginPath();
      path.forEach(function (item, index) {
        var p = miniPoint(item);
        if (!index) minimapCtx.moveTo(p.x, p.y); else minimapCtx.lineTo(p.x, p.y);
      });
      minimapCtx.stroke();
    }
    auditIssues.forEach(function (issue) {
      if (!Number.isFinite(issue.x)) return;
      var p = miniPoint(issue);
      minimapCtx.strokeStyle = '#ff493d';
      minimapCtx.strokeRect(Math.round(p.x - 3), Math.round(p.y - 3), 7, 7);
    });
    if (selected && Number.isFinite(selected.x)) {
      var selectedMini = miniPoint(selected);
      minimapCtx.strokeStyle = '#ffffff';
      minimapCtx.lineWidth = 2;
      minimapCtx.beginPath();
      minimapCtx.arc(selectedMini.x, selectedMini.y, 6, 0, Math.PI * 2);
      minimapCtx.stroke();
    }
    var cam = Game.render.cam;
    var viewWidth = stageWrap.clientWidth / cam.zoom;
    var viewHeight = stageWrap.clientHeight / cam.zoom;
    var left = (cam.x - viewWidth / 2) / layout.world.w * minimap.width;
    var top = (cam.y - viewHeight / 2) / layout.world.h * minimap.height;
    var width = viewWidth / layout.world.w * minimap.width;
    var height = viewHeight / layout.world.h * minimap.height;
    minimapCtx.fillStyle = 'rgba(235,225,146,.08)';
    minimapCtx.fillRect(left, top, width, height);
    minimapCtx.strokeStyle = '#f2df79';
    minimapCtx.lineWidth = 2;
    minimapCtx.strokeRect(left, top, width, height);
  }

  function inspectAt(point) {
    var nav = layout.nav;
    var gx = clamp(Math.floor(point.x / nav.cell), 0, nav.w - 1);
    var gy = clamp(Math.floor(point.y / nav.cell), 0, nav.h - 1);
    var nearest = nearestObject(point.x, point.y);
    var activeSprite = activeDecorationSprite();
    var habitat = activeSprite
      ? Game.terrain.decorSuitability(layout, region, activeSprite, point.x, point.y)
      : null;
    var report = {
      tool: 'inspect',
      point: { x: point.x, y: point.y },
      material: Game.terrain.materialAt(point.x, point.y),
      navCell: { x: gx, y: gy },
      chunk: {
        x: Math.floor(point.x / (layout.spatial && layout.spatial.cell || 192)),
        y: Math.floor(point.y / (layout.spatial && layout.spatial.cell || 192))
      },
      walkable: Game.terrain.isWalkable(point.x, point.y, 1),
      clearance: (nav.distance[gy][gx] || 0) * nav.cell,
      danger: Game.terrain.dangerAt(point.x, point.y),
      decorationHabitat: habitat ? {
        sprite: activeSprite,
        score: habitat.score,
        field: habitat.field,
        anchorDistance: habitat.anchorDistance,
        material: habitat.material,
        reason: habitat.reason || null
      } : null,
      nearest: nearest ? { key: nearest.item.key, id: nearest.item.id, kind: nearest.item.kind, distance: nearest.distance } : null
    };
    probeState = report;
    if (nearest && nearest.distance <= 22 / Game.render.cam.zoom) selectObject(nearest.item);
    renderProbe();
    return copy(report);
  }

  function pathLength(start, path) {
    var total = 0;
    var prev = start;
    (path || []).forEach(function (point) {
      total += U.dist(prev.x, prev.y, point.x, point.y);
      prev = point;
    });
    return total;
  }

  function measure(a, b) {
    if (a && b) {
      measureState.a = { x: a.x, y: a.y };
      measureState.b = { x: b.x, y: b.y };
    } else if (a && !measureState.a) {
      measureState.a = { x: a.x, y: a.y };
      measureState.b = null; measureState.path = null; measureState.report = null;
      probeState = { tool: 'measure', waiting: 'B', point: measureState.a };
      renderProbe();
      return copy(probeState);
    } else if (a) {
      measureState.b = { x: a.x, y: a.y };
    }
    if (!measureState.a || !measureState.b) return null;
    var started = now();
    var path = Game.nav.solveImmediate(
      measureState.a.x, measureState.a.y, measureState.b.x, measureState.b.y
    );
    var elapsed = now() - started;
    var samples = [measureState.a].concat(path || []);
    var minClearance = Infinity, maxDanger = 0;
    samples.forEach(function (point) {
      var nav = layout.nav;
      var gx = clamp(Math.floor(point.x / nav.cell), 0, nav.w - 1);
      var gy = clamp(Math.floor(point.y / nav.cell), 0, nav.h - 1);
      minClearance = Math.min(minClearance, (nav.distance[gy][gx] || 0) * nav.cell);
      maxDanger = Math.max(maxDanger, Game.terrain.dangerAt(point.x, point.y));
    });
    measureState.path = path;
    measureState.report = {
      tool: 'measure',
      a: copy(measureState.a),
      b: copy(measureState.b),
      found: !!path,
      straightDistance: U.dist(measureState.a.x, measureState.a.y, measureState.b.x, measureState.b.y),
      pathLength: path ? pathLength(measureState.a, path) : null,
      minClearance: Number.isFinite(minClearance) ? minClearance : 0,
      maxDanger: maxDanger,
      solveMs: elapsed,
      path: copy(path)
    };
    probeState = measureState.report;
    log('nav', path ? 'production route solved' : 'production route rejected', {
      solveMs: elapsed, points: path && path.length || 0
    }, path ? 'info' : 'warn');
    renderProbe();
    return copy(measureState.report);
  }

  function placementProbe(profileId, point) {
    profileId = profileId || document.getElementById('profile-select').value;
    var profile = Game.content.get('worldSpawnProfile', profileId);
    if (!profile || !point || !layout) return null;
    var channel = profile.channel || inferProfileChannel(profileId);
    var report = Game.population.inspectPlacement(
      profileId, point, layout, populationPlan && populationPlan.reservations || []
    );
    candidateInspection = Game.population.inspectCandidates(
      profileId, layout, channel, populationContext,
      populationPlan && populationPlan.reservations || []
    );
    probeState = Object.assign({ tool: 'placement', point: copy(point) }, copy(report));
    log('population', 'placement probe ' + (report.ok ? 'accepted' : 'rejected'), {
      profileId: profileId, point: point, failures: report.failures
    }, report.ok ? 'info' : 'warn');
    renderProbe();
    return copy(probeState);
  }

  function inferProfileChannel(profileId) {
    var view = Game.content.populationView(populationPlan && populationPlan.populationId);
    var found = 'regular';
    if (!view) return found;
    Object.keys(view.channels || {}).some(function (channel) {
      var hit = (view.channels[channel].spawnRefs || []).some(function (entry) { return entry.profileId === profileId; });
      if (hit) found = channel;
      return hit;
    });
    return found;
  }

  function renderProbe() {
    var host = document.getElementById('probe-output');
    if (!probeState) {
      host.innerHTML = '<p class="empty-state">' + esc(
        tool === 'inspect' ? lt('inspectHint') :
          (tool === 'measure' ? lt('measureHint') :
            (tool === 'merchant' ? lt('merchantHint') : lt('placementHint')))
      ) + '</p>';
      return;
    }
    if (probeState.tool === 'inspect') {
      host.innerHTML = '<dl>' +
        row('world', Math.round(probeState.point.x) + ', ' + Math.round(probeState.point.y)) +
        row('material', probeState.material) +
        row('nav / chunk', probeState.navCell.x + ':' + probeState.navCell.y + ' / ' + probeState.chunk.x + ':' + probeState.chunk.y) +
        row('walkable', probeState.walkable ? lt('pass') : lt('fail'), probeState.walkable) +
        row('clearance', probeState.clearance.toFixed(1) + ' px') +
        row('danger', probeState.danger.toFixed(3)) +
        row('decor habitat', probeState.decorationHabitat
          ? probeState.decorationHabitat.sprite + ' / ' +
            Number(probeState.decorationHabitat.score || 0).toFixed(3)
          : '—') +
        row('nearest', probeState.nearest ? probeState.nearest.kind + ' / ' + probeState.nearest.id + ' / ' + probeState.nearest.distance.toFixed(1) + ' px' : '—') +
        '</dl>';
      return;
    }
    if (probeState.tool === 'measure') {
      if (probeState.waiting) {
        host.innerHTML = '<dl>' + row('A', Math.round(probeState.point.x) + ', ' + Math.round(probeState.point.y)) + row('next', 'B') + '</dl>';
      } else {
        host.innerHTML = '<dl>' +
          row('route', probeState.found ? lt('pass') : lt('noPath'), probeState.found) +
          row('straight', probeState.straightDistance.toFixed(1) + ' px') +
          row('path', probeState.pathLength === null ? '—' : probeState.pathLength.toFixed(1) + ' px') +
          row('min clearance', probeState.minClearance.toFixed(1) + ' px') +
          row('max danger', probeState.maxDanger.toFixed(3)) +
          row('solve', probeState.solveMs.toFixed(2) + ' ms') + '</dl>';
      }
      return;
    }
    if (probeState.tool === 'merchant') {
      host.innerHTML = '<dl>' +
        row(lt('merchantQa'), Math.round(probeState.point.x) + ', ' + Math.round(probeState.point.y)) +
        row(lt('merchantProfile'), merchantAudit && merchantAudit.merchantProfileId || '—') +
        row(lt('merchantSource'), merchantAudit && merchantAudit.source || '—') +
        row('result', probeState.ok ? lt('merchantPass') : lt('merchantFail'), probeState.ok) +
        row(lt('merchantWagon'), merchantAudit && merchantAudit.chosen
          ? Math.round(merchantAudit.chosen.x) + ', ' + Math.round(merchantAudit.chosen.y)
          : '—') + '</dl>';
      return;
    }
    var checks = (probeState.checks || []).map(function (check) {
      return '<dt>' + esc(check.id + (check.enforced ? '' : ' (info)')) + '</dt><dd class="' +
        (check.pass ? 'pass' : 'fail') + '">' +
        esc((check.pass ? '✓ ' : '× ') + JSON.stringify(check.actual) +
          (check.expected === null || check.expected === undefined ? '' : ' / ' + JSON.stringify(check.expected))) + '</dd>';
    }).join('');
    host.innerHTML = '<dl>' + row('profile', probeState.profileId) +
      row('selector', candidateInspection && candidateInspection.selector || '—') +
      row('source', candidateInspection && candidateInspection.source || '—') +
      row('result', probeState.ok ? lt('pass') : lt('fail'), probeState.ok) + checks + '</dl>';
  }

  function row(label, value, pass) {
    return '<dt>' + esc(label) + '</dt><dd' + (pass === undefined ? '' : ' class="' + (pass ? 'pass' : 'fail') + '"') + '>' + esc(value) + '</dd>';
  }

  function selectObject(item) {
    if (!item) return null;
    selected = item.key ? item : contentPoint(item, item.kind || 'object');
    decorFieldKey = null;
    renderSelection();
    renderCatalog();
    renderDecorationEcology();
    drawMinimap();
    return copy({
      key: selected.key, kind: selected.kind, id: selected.id,
      x: selected.x, y: selected.y, name: selected.name
    });
  }

  function renderSelection() {
    var host = document.getElementById('selection-panel');
    if (!selected) {
      host.innerHTML = '<p class="empty-state">' + esc(lt('none')) + '</p>';
      return;
    }
    var data = selected.data || {};
    var details = {
      kind: selected.kind,
      id: selected.id,
      name: selected.name,
      position: Number.isFinite(selected.x) ? Math.round(selected.x) + ', ' + Math.round(selected.y) : 'definition only',
      sprite: selected.sprite || data.presentation && data.presentation.spriteId || '—'
    };
    if (selected.kind === 'actor') {
      var actorLease = data.spawnId && Game.population.lease(data.spawnId);
      var actorProfile = actorLease && Game.content.get('worldSpawnProfile', actorLease.profileId);
      details.archetype = data.blueprint && data.blueprint.archetypeId;
      details.category = data.category;
      details.rank = data.rank;
      details.spawnId = data.spawnId || '—';
      details.planSlot = data._labSlotId || '—';
      details.channel = data._labChannel || '—';
      details.spawnProfile = actorLease && actorLease.profileId || '—';
      details.encounterPack = actorProfile && actorProfile.encounterPackId || '—';
      details.lease = actorLease ? 'active / generation ' + actorLease.generation : '—';
    } else if (data.defId) {
      details.definition = data.defId;
    }
    var decorDef = decorationDefinition(selected.sprite || data.sprite);
    if (decorDef) {
      var target = layout.decorationEcology && layout.decorationEcology.targets &&
        layout.decorationEcology.targets[decorDef.sprite];
      details.pattern = decorDef.distribution && decorDef.distribution.pattern || '—';
      details.anchor = decorDef.distribution && decorDef.distribution.anchor || 'none';
      details.group = data.decorGroup || 'definition';
      details.role = data.decorRole || '—';
      details.habitatScore = Number.isFinite(data.decorScore) ? data.decorScore : '—';
      details.quota = target ? target.placed + ' / ' + target.target : '—';
    }
    host.innerHTML = '<section class="inspect-section"><h3>' + esc(lt('selected')) + '</h3><dl class="inspect-grid">' +
      Object.keys(details).map(function (key) { return '<dt>' + esc(key) + '</dt><dd>' + esc(details[key]) + '</dd>'; }).join('') +
      '</dl></section><section class="inspect-section"><h3>JSON</h3><div class="raw-id">' +
      esc(JSON.stringify(serializableSelection(data), null, 2)) + '</div></section>';
  }

  function serializableSelection(data) {
    if (data && data.components) {
      return {
        id: data.id, blueprintKey: data.blueprintKey, category: data.category,
        rank: data.rank, position: { x: data.x, y: data.y },
        origin: actorOrigins[data.id], tags: data.tags, spawnId: data.spawnId,
        slotId: data._labSlotId
      };
    }
    return copy(data);
  }

  function actorDefinitionCatalog() {
    var placed = {};
    var profiles = Game.content.all('worldSpawnProfile');
    var regionProfile = Game.content.get('regionProfile', region.id);
    var populationView = regionProfile && Game.content.populationView(regionProfile.populationProfileId);
    var projectedSummons = regionProfile && regionProfile.projection && regionProfile.projection.summons ||
      region.summons || [];
    var regionProfileIds = {};
    var profileRegions = {};
    regions.forEach(function (candidateRegion) {
      var candidateProfile = Game.content.get('regionProfile', candidateRegion.id);
      var candidateView = candidateProfile &&
        Game.content.populationView(candidateProfile.populationProfileId);
      profileRegions[candidateRegion.id] = {};
      Object.keys(candidateView && candidateView.channels || {}).forEach(function (channel) {
        (candidateView.channels[channel].spawnRefs || []).forEach(function (entry) {
          profileRegions[candidateRegion.id][entry.profileId] = channel;
        });
      });
    });
    Object.keys(populationView && populationView.channels || {}).forEach(function (channel) {
      (populationView.channels[channel].spawnRefs || []).forEach(function (entry) {
        regionProfileIds[entry.profileId] = channel;
      });
    });
    actors.forEach(function (actor) {
      var id = actor.blueprint.archetypeId;
      (placed[id] = placed[id] || []).push(liveActorPoint(actor));
    });
    return Game.content.all('actorArchetype').filter(function (definition) {
      return definition.category !== 'player';
    }).map(function (definition) {
      var linkedProfiles = profiles.filter(function (profile) {
        if (profile.actorRef && profile.actorRef.archetypeId === definition.id) return true;
        var pack = profile.encounterPackId && Game.content.get('encounterPack', profile.encounterPackId);
        return !!(pack && pack.members.some(function (member) { return member.archetypeId === definition.id; }));
      });
      var linkedProfileIds = linkedProfiles.map(function (profile) { return profile.id; });
      var regionProfiles = linkedProfileIds.filter(function (id) { return regionProfileIds[id]; });
      var inMonsterPool = (region.monsters || []).indexOf(definition.id) >= 0 || region.boss === definition.id;
      var definitionRegions = regions.filter(function (candidateRegion) {
        return (candidateRegion.monsters || []).indexOf(definition.id) >= 0 ||
          candidateRegion.boss === definition.id ||
          (candidateRegion.summons || []).indexOf(definition.id) >= 0 ||
          linkedProfileIds.some(function (profileId) {
            return !!profileRegions[candidateRegion.id][profileId];
          });
      }).map(function (candidateRegion) { return candidateRegion.id; });
      var inRegion = definitionRegions.indexOf(region.id) >= 0 ||
        !!(placed[definition.id] && placed[definition.id].length);
      if (inRegion && definitionRegions.indexOf(region.id) < 0) definitionRegions.push(region.id);
      var catalogCategory = definition.category;
      if (definition.category === 'monster' &&
          regions.some(function (candidateRegion) { return candidateRegion.boss === definition.id; })) {
        catalogCategory = 'boss';
      } else if (definition.category === 'npc' && definition.id.indexOf('creature.') === 0) {
        catalogCategory = 'creature';
      }
      return {
        key: 'definition:' + definition.id,
        kind: 'actor-definition',
        group: 'unit',
        category: catalogCategory,
        id: definition.id,
        name: actorName(definition),
        sprite: definition.presentation && definition.presentation.spriteId,
        count: placed[definition.id] ? placed[definition.id].length : 0,
        positions: placed[definition.id] || [],
        inRegion: inRegion,
        regions: definitionRegions,
        data: {
          definition: definition,
          regionMonsterPool: inMonsterPool,
          projectedSummon: projectedSummons.indexOf(definition.id) >= 0,
          spawnProfiles: linkedProfileIds,
          regionSpawnProfiles: regionProfiles.map(function (id) {
            return { id: id, channel: regionProfileIds[id] };
          }),
          encounterPacks: linkedProfiles.map(function (profile) { return profile.encounterPackId; }).filter(Boolean),
          planSlots: (populationPlan && populationPlan.slots || []).filter(function (slot) {
            return linkedProfileIds.indexOf(slot.profileId) >= 0;
          }).map(function (slot) {
            return { id: slot.id, channel: slot.channel, x: slot.x, y: slot.y };
          })
        }
      };
    });
  }

  function rebuildCatalog() {
    catalogItems = actorDefinitionCatalog();
    var catalogIndex = {};
    catalogItems.forEach(function (item) { catalogIndex[item.key] = item; });

    function define(item, regionId) {
      var existing = catalogIndex[item.key];
      if (!existing) {
        existing = Object.assign({
          group: 'world',
          count: 0,
          positions: [],
          inRegion: false,
          regions: []
        }, item);
        catalogIndex[item.key] = existing;
        catalogItems.push(existing);
      }
      if (regionId && existing.regions.indexOf(regionId) < 0) existing.regions.push(regionId);
      if (regionId === region.id) existing.inRegion = true;
      return existing;
    }

    function defineContent(candidateRegion, key, category, definition, fallbackSprite) {
      if (!definition || !definition.id) return;
      define({
        key: key + ':' + definition.id,
        kind: key + '-definition',
        category: category,
        id: definition.id,
        name: definition.nameKey ? nameFromKey(definition.nameKey, definition.id) : definition.id,
        sprite: definition.sprite || fallbackSprite || null,
        data: definition
      }, candidateRegion.id);
    }

    var campDefinitions = [
      { id: 'camp_banner', sprite: 'camp_banner' },
      { id: 'tent', sprite: 'tent' },
      { id: 'camp_lantern', sprite: 'camp_lantern' },
      { id: 'campfire', sprite: 'campfire' },
      { id: 'camp_cookpot', sprite: 'camp_cookpot' },
      { id: 'camp_supply', sprite: 'camp_supply' }
    ];
    var chestDefinitions = [
      { id: 'chest_common', sprite: 'chest_common', rarity: 'common' },
      { id: 'chest_rare', sprite: 'chest_rare', rarity: 'rare' }
    ];

    regions.forEach(function (candidateRegion) {
      var exploration = candidateRegion.exploration || {};
      [
        ['landmark', 'landmark', exploration.landmarks],
        ['resource', 'resource', exploration.resources],
        ['curio', 'curio', exploration.curios],
        ['ecology', 'ecology', exploration.ecology],
        ['threat', 'threat', exploration.threats]
      ].forEach(function (entry) {
        (entry[2] || []).forEach(function (definition) {
          var category = entry[1];
          if (entry[0] === 'landmark' && (definition.function === 'boss' || definition.territory)) {
            category = 'boss-lair';
          }
          defineContent(candidateRegion, entry[0], category, definition);
        });
      });

      (candidateRegion.hazards || []).forEach(function (hazardId) {
        define({
          key: 'hazard:' + hazardId,
          kind: 'hazard-definition',
          category: 'hazard-definition',
          id: hazardId,
          name: hazardId,
          sprite: null,
          data: { id: hazardId, runtimeMounted: false }
        }, candidateRegion.id);
      });
      define({
        key: 'hazard-anchors:' + candidateRegion.id,
        kind: 'hazard-anchor-set',
        category: 'hazard-anchor',
        id: candidateRegion.id + '.anchors',
        name: regionName(candidateRegion) + ' / Hazard anchors',
        sprite: null,
        data: { regionId: candidateRegion.id, runtimeMounted: false }
      }, candidateRegion.id);

      var terrain = candidateRegion.terrain || {};
      var materialDefinitions = [];
      if (terrain.base && terrain.base.mat) materialDefinitions.push(terrain.base);
      (terrain.patches || []).forEach(function (patch) {
        if (patch.mat) materialDefinitions.push(patch);
      });
      materialDefinitions.forEach(function (material) {
        define({
          key: 'material:' + material.mat,
          kind: 'terrain-material',
          category: 'material',
          id: material.mat,
          name: material.mat,
          sprite: null,
          data: material
        }, candidateRegion.id);
      });

      (terrain.deco || []).forEach(function (definition) {
        define({
          key: 'decoration:' + definition.sprite,
          kind: 'decoration-definition',
          category: definition.placement === 'blocker' ? 'decor-blocker' :
            definition.placement === 'water' ? 'decor-water' : 'decor-ground',
          id: definition.sprite,
          name: definition.nameKey ? nameFromKey(definition.nameKey, definition.sprite) : definition.sprite,
          sprite: definition.sprite,
          data: definition
        }, candidateRegion.id);
      });
      (exploration.landmarks || []).forEach(function (landmark) {
        var territory = landmark.territory;
        (territory && territory.decor || []).forEach(function (definition) {
          define({
            key: 'decoration:' + definition.sprite,
            kind: 'decoration-definition',
            category: 'decor-boss',
            id: definition.sprite,
            name: definition.sprite,
            sprite: definition.sprite,
            data: definition
          }, candidateRegion.id);
        });
      });
      if (terrain.tufts > 0) {
        define({
          key: 'decoration:tufts:' + candidateRegion.id,
          kind: 'decoration-definition',
          category: 'tuft',
          id: candidateRegion.id + '.tufts',
          name: regionName(candidateRegion) + ' / tufts',
          sprite: null,
          data: { count: terrain.tufts, colors: terrain.tuftColors || [] }
        }, candidateRegion.id);
      }
      if (terrain.flowers && terrain.flowers.count > 0) {
        define({
          key: 'decoration:flowers:' + candidateRegion.id,
          kind: 'decoration-definition',
          category: 'flower',
          id: candidateRegion.id + '.flowers',
          name: regionName(candidateRegion) + ' / flowers',
          sprite: null,
          data: terrain.flowers
        }, candidateRegion.id);
      }

      campDefinitions.forEach(function (definition) {
        define({
          key: 'camp:' + definition.id,
          kind: 'camp-definition',
          category: 'camp',
          id: definition.id,
          name: definition.id,
          sprite: definition.sprite,
          data: definition
        }, candidateRegion.id);
      });
      chestDefinitions.forEach(function (definition) {
        define({
          key: 'chest:' + definition.id,
          kind: 'chest-definition',
          category: 'chest',
          id: definition.id,
          name: definition.id,
          sprite: definition.sprite,
          data: Object.assign({ runtimeMounted: false }, definition)
        }, candidateRegion.id);
      });
    });

    function attachInstances(keyPrefix, items, kind) {
      var buckets = {};
      (items || []).forEach(function (item) {
        var id = item.defId || item.id || item.sprite;
        if (id) (buckets[id] = buckets[id] || []).push(item);
      });
      Object.keys(buckets).sort().forEach(function (id) {
        var first = buckets[id][0];
        var entry = define({
          key: keyPrefix + ':' + id,
          kind: kind + '-definition',
          category: keyPrefix,
          id: id,
          name: first.nameKey ? nameFromKey(first.nameKey, id) : id,
          sprite: first.sprite || null,
          data: first
        }, region.id);
        entry.count = buckets[id].length;
        entry.positions = buckets[id].map(function (instance) { return contentPoint(instance, kind); });
        entry.inRegion = true;
      });
    }

    attachInstances('landmark', masters.landmarks, 'landmark');
    attachInstances('resource', masters.nodes, 'resource');
    attachInstances('curio', masters.curios, 'curio');
    attachInstances('ecology', masters.ecology, 'ecology');
    attachInstances('threat', layout.threats || [], 'threat');

    var hazardEntry = catalogIndex['hazard-anchors:' + region.id];
    if (hazardEntry) {
      hazardEntry.count = (layout.hazardAnchors || []).length;
      hazardEntry.positions = (layout.hazardAnchors || []).map(function (anchor, index) {
        return contentPoint(Object.assign({ id: region.id + ':hazard-anchor:' + index }, anchor), 'hazard-anchor');
      });
    }

    var propBuckets = {};
    (masters.props || []).forEach(function (prop) {
      var prefix = prop.campProp ? 'camp' : 'decoration';
      var key = prefix + ':' + prop.sprite;
      (propBuckets[key] = propBuckets[key] || []).push(prop);
    });
    Object.keys(propBuckets).forEach(function (key) {
      var bucket = propBuckets[key];
      var first = bucket[0];
      var layer = propLayer(first);
      var category = first.campProp ? 'camp' :
        layer === 'decorBoss' ? 'decor-boss' :
        layer === 'decorBlocker' ? 'decor-blocker' :
        layer === 'decorWater' ? 'decor-water' : 'decor-ground';
      var entry = define({
        key: key,
        kind: first.campProp ? 'camp-definition' : 'decoration-definition',
        category: category,
        id: first.sprite,
        name: first.sprite,
        sprite: first.sprite,
        data: first
      }, region.id);
      entry.count = bucket.length;
      entry.positions = bucket.map(function (instance) {
        return contentPoint(instance, first.campProp ? 'camp' : 'decoration');
      });
      entry.inRegion = true;
    });

    function attachDetailDecoration(key, items, id) {
      var entry = catalogIndex[key];
      if (!entry) return;
      entry.count = (items || []).length;
      entry.positions = (items || []).map(function (instance, index) {
        return contentPoint(Object.assign({ id: id + ':' + index }, instance), 'decoration');
      });
    }
    attachDetailDecoration('decoration:tufts:' + region.id, masters.tufts, region.id + ':tuft');
    attachDetailDecoration('decoration:flowers:' + region.id, masters.flowers, region.id + ':flower');

    var materialCounts = {};
    (layout.grid || []).forEach(function (material) {
      materialCounts[material] = (materialCounts[material] || 0) + 1;
    });
    Object.keys(materialCounts).forEach(function (material) {
      var entry = define({
        key: 'material:' + material,
        kind: 'terrain-material',
        category: 'material',
        id: material,
        name: material,
        sprite: null,
        data: { mat: material }
      }, region.id);
      entry.count = materialCounts[material];
      entry.inRegion = true;
    });

    var categoryOrder = {
      monster: 0, boss: 1, npc: 2, creature: 3, summon: 4, object: 5,
      resource: 6, chest: 7, landmark: 8, 'boss-lair': 9, curio: 10, ecology: 11,
      threat: 12, 'hazard-definition': 13, 'hazard-anchor': 14, camp: 15,
      'decor-blocker': 16, 'decor-ground': 17, 'decor-water': 18,
      'decor-boss': 19, tuft: 20, flower: 21, material: 22
    };
    catalogItems.sort(function (a, b) {
      return (categoryOrder[a.category] === undefined ? 99 : categoryOrder[a.category]) -
        (categoryOrder[b.category] === undefined ? 99 : categoryOrder[b.category]) ||
        a.id.localeCompare(b.id);
    });
    renderCatalog();
  }

  function categoryMatches(item, filter) {
    if (filter === 'all') return true;
    return item.category === filter;
  }

  function catalogCategoryLabel(category) {
    var keys = {
      monster: 'map.lab.monsterCategory',
      boss: 'map.lab.bossCategory',
      npc: 'map.lab.npcCategory',
      creature: 'map.lab.creatureCategory',
      summon: 'map.lab.summons',
      object: 'map.lab.objects',
      resource: 'map.lab.resources',
      chest: 'map.lab.chests',
      landmark: 'map.lab.landmarkCategory',
      'boss-lair': 'map.lab.bossLairCategory',
      curio: 'map.lab.curioCategory',
      ecology: 'map.lab.ecologyCategory',
      threat: 'map.lab.threatCategory',
      'hazard-definition': 'map.lab.hazardDefinitionCategory',
      'hazard-anchor': 'map.lab.hazardAnchorCategory',
      camp: 'map.lab.campCategory',
      'decor-blocker': 'map.lab.decorBlockerCategory',
      'decor-ground': 'map.lab.decorGroundCategory',
      'decor-water': 'map.lab.decorWaterCategory',
      'decor-boss': 'map.lab.decorBossCategory',
      tuft: 'map.lab.tuftCategory',
      flower: 'map.lab.flowerCategory',
      material: 'map.lab.materialCategory'
    };
    return keys[category] ? D.t(keys[category]) : category;
  }

  function renderCatalog() {
    var host = document.getElementById('catalog-list');
    if (!host) return;
    var scope = document.getElementById('catalog-scope').value;
    var search = document.getElementById('catalog-search').value.trim().toLowerCase();
    var category = document.getElementById('catalog-category').value;
    var scoped = catalogItems.filter(function (item) {
      return scope === 'all' || item.inRegion;
    });
    var visible = scoped.filter(function (item) {
      return categoryMatches(item, category) &&
        (!search || (item.id + ' ' + item.name + ' ' + (item.subcategory || '') +
          ' ' + (item.regions || []).join(' ')).toLowerCase().indexOf(search) >= 0);
    });
    var instanceCount = visible.reduce(function (sum, item) { return sum + (item.count || 0); }, 0);
    document.getElementById('catalog-summary').textContent =
      visible.length + ' / ' + scoped.length + ' ' + lt('catalog') + ' · ' +
      instanceCount + ' ' + lt('instances') + ' · ' +
      lt(scope === 'region' ? 'currentMapScope' : 'allMapsScope');
    var groups = [];
    visible.forEach(function (item) {
      var group = groups.filter(function (entry) { return entry.category === item.category; })[0];
      if (!group) {
        group = { category: item.category, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    });
    host.innerHTML = groups.map(function (group) {
      var groupInstances = group.items.reduce(function (sum, item) { return sum + (item.count || 0); }, 0);
      var items = group.items.map(function (item) {
        return '<button type="button" class="catalog-item' + (selected && selected.key === item.key ? ' active' : '') +
          '" data-catalog-index="' + catalogItems.indexOf(item) + '">' +
          '<canvas width="36" height="36" data-catalog-sprite="' + esc(item.sprite || '') + '"></canvas>' +
          '<span class="catalog-copy"><strong>' + esc(item.name) + '</strong><small>' +
          esc(item.id) + '</small></span><span class="catalog-count">×' + item.count + '</span></button>';
      }).join('');
      return '<section class="catalog-group" data-catalog-group="' + esc(group.category) + '">' +
        '<header class="catalog-group-header"><strong>' + esc(catalogCategoryLabel(group.category)) +
        '</strong><span>' + group.items.length + ' ' + esc(lt('definitions')) + ' · ' +
        groupInstances + ' ' + esc(lt('instances')) + '</span></header>' +
        '<div class="catalog-group-list">' + items + '</div></section>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('[data-catalog-sprite]'), function (canvas) {
      var sprite = canvas.getAttribute('data-catalog-sprite');
      if (sprite) Game.assets.drawToDom(canvas, sprite, 'idle0');
    });
  }

  function addIssue(type, message, item, severity) {
    auditIssues.push({
      id: type + ':' + auditIssues.length,
      type: type,
      severity: severity || 'error',
      message: message,
      x: item && Number.isFinite(item.x) ? item.x : null,
      y: item && Number.isFinite(item.y) ? item.y : null,
      target: item && item.id || null
    });
  }

  function runAudit() {
    auditIssues = [];
    if (!validation.valid) addIssue('terrain-validation', (validation.errors || []).join(', ') || 'terrain validation failed');
    var decorSprites = {};
    (region.terrain.deco || []).forEach(function (definition) { decorSprites[definition.sprite] = true; });
    (region.terrain.deco || []).forEach(function (definition) {
      if (!(masters.props || []).some(function (prop) { return prop.sprite === definition.sprite; })) {
        addIssue('decoration-coverage', 'configured decoration has no instance: ' + definition.sprite);
      }
    });
    (masters.props || []).forEach(function (prop) {
      if (!prop.campProp && !prop.merchantAuditProp && prop.kind !== 'bossDecor' && !decorSprites[prop.sprite]) {
        addIssue('decoration-definition', 'unregistered decoration sprite: ' + prop.sprite, prop);
      }
    });
    var decorEcology = layout.decorationEcology;
    if (!decorEcology || decorEcology.method !== 'habitat-cluster-grammar') {
      addIssue('decoration-ecology', 'v3 habitat / cluster grammar report is missing');
    } else {
      var decorMetrics = decorEcology.metrics || {};
      if ((decorMetrics.sameTypeEnrichment || 0) < 1.5) {
        addIssue('decoration-enrichment',
          'same-type enrichment is too close to independent random mixing: ' +
          (decorMetrics.sameTypeEnrichment || 0), null, 'warn');
      }
      if ((decorMetrics.meanNearest || 0) < 12) {
        addIssue('decoration-crowding',
          'mean nearest-neighbour distance is below sprite readability: ' +
          (decorMetrics.meanNearest || 0), null, 'warn');
      }
      if (Object.keys(decorMetrics.patterns || {}).length < 3) {
        addIssue('decoration-grammar',
          'fewer than three placement grammars are represented', null, 'warn');
      }
      Object.keys(decorEcology.targets || {}).forEach(function (sprite) {
        var target = decorEcology.targets[sprite];
        if (!target.target || target.placed / target.target >= 0.78) return;
        addIssue('decoration-quota',
          sprite + ' placed ' + target.placed + ' / ' + target.target,
          (masters.props || []).filter(function (prop) { return prop.sprite === sprite; })[0],
          'warn');
      });
      (masters.props || []).forEach(function (prop) {
        if (prop.campProp || prop.merchantAuditProp || prop.kind === 'bossDecor' || prop.blockerProp) return;
        if (!prop.decorGroup || !prop.decorPattern || !prop.decorRole) {
          addIssue('decoration-provenance',
            prop.sprite + ' lacks cluster / grammar provenance', prop);
        }
      });
    }
    (populationPlan.failures || []).forEach(function (failure) {
      if (failure.required && failure.onFailure !== 'skipOptional') {
        addIssue('population-required', failure.profileId + ': ' + failure.reason);
      } else {
        addIssue('population-capacity', failure.profileId + ': ' + failure.reason, null, 'warn');
      }
    });
    if (!merchantAudit || !merchantAudit.ok || !merchantAudit.chosen) {
      addIssue('merchant-placement', merchantAudit && merchantAudit.reason || 'merchant audit missing',
        merchantQaPoint, 'error');
    }
    var contentPoints = []
      .concat(masters.nodes || [], masters.landmarks || [], masters.curios || [], masters.ecology || []);
    for (var cp = 0; cp < contentPoints.length; cp++) {
      for (var cq = cp + 1; cq < contentPoints.length; cq++) {
        if (U.dist(contentPoints[cp].x, contentPoints[cp].y, contentPoints[cq].x, contentPoints[cq].y) < 8) {
          addIssue('content-spacing',
            (contentPoints[cp].id || contentPoints[cp].defId) + ' crowds ' +
            (contentPoints[cq].id || contentPoints[cq].defId), contentPoints[cp]);
        }
      }
    }
    actors.forEach(function (actor) {
      var body = actor.components.body || {};
      var radius = body.collisionRadius || 1;
      if (actor.x < 0 || actor.y < 0 || actor.x > layout.world.w || actor.y > layout.world.h) {
        addIssue('actor-bounds', actor.id + ' outside world', actor);
      }
      if (!Game.terrain.isWalkable(actor.x, actor.y, Math.min(6, radius))) {
        addIssue('actor-walkability', actor.id + ' formation footpoint is not walkable', actor);
      }
      var sprite = actor.components.presentation.spriteId;
      if (!Game.assets.has(sprite)) {
        addIssue('actor-sprite', actor.id + ' sprite missing: ' + sprite, actor);
      }
    });
    for (var i = 0; i < actors.length; i++) {
      for (var j = i + 1; j < actors.length; j++) {
        if (U.dist(actors[i].x, actors[i].y, actors[j].x, actors[j].y) < 1) {
          addIssue('actor-overlap', actors[i].id + ' overlaps ' + actors[j].id, actors[i]);
        }
      }
    }
    for (var r = 0; r < populationPlan.reservations.length; r++) {
      for (var s = r + 1; s < populationPlan.reservations.length; s++) {
        var left = populationPlan.reservations[r], right = populationPlan.reservations[s];
        if (U.dist(left.x, left.y, right.x, right.y) <
            (left.occupancyRadius || 0) + (right.occupancyRadius || 0)) {
          addIssue('reservation-overlap', left.slotId + ' overlaps ' + right.slotId, left);
        }
      }
    }
    var materialCounts = {};
    (layout.grid || []).forEach(function (material) { materialCounts[material] = (materialCounts[material] || 0) + 1; });
    if (Object.keys(materialCounts).length < 2) addIssue('material-distribution', 'only one material generated');
    log('audit', auditIssues.length ? 'placement audit found issues' : 'placement audit passed', {
      issues: auditIssues.length,
      materials: materialCounts,
      props: masters.props.length,
      actors: actors.length,
      contentDensityPerMegapixel: Math.round(
        contentPoints.length / Math.max(1, layout.world.w * layout.world.h) * 1000000
      ),
      decorationEcology: decorEcology && decorEcology.metrics
    }, auditIssues.length ? 'warn' : 'info');
    renderIssues();
    return copy(auditIssues);
  }

  function renderIssues() {
    var host = document.getElementById('issues-panel');
    if (!auditIssues.length) {
      host.innerHTML = '<p class="empty-state">' + esc(lt('noIssues')) + '</p>';
      return;
    }
    host.innerHTML = auditIssues.map(function (issue, index) {
      return '<button type="button" class="issue-row' + (issueIndex === index ? ' active' : '') +
        '" data-issue-index="' + index + '"><strong>' + esc(issue.type) + '</strong><span>' +
        esc(issue.message + (Number.isFinite(issue.x) ? ' @ ' + Math.round(issue.x) + ', ' + Math.round(issue.y) : '')) +
        '</span></button>';
    }).join('');
  }

  function focusIssue(direction) {
    if (!auditIssues.length) return null;
    issueIndex = (issueIndex + direction + auditIssues.length) % auditIssues.length;
    var issue = auditIssues[issueIndex];
    if (Number.isFinite(issue.x)) setCamera(issue.x, issue.y, Math.max(1.7, Game.render.cam.zoom));
    renderIssues();
    showInspectorTab('issues');
    return copy(issue);
  }

  function renderLogs() {
    var host = document.getElementById('log-list');
    if (!host) return;
    host.innerHTML = logs.slice().reverse().map(function (entry) {
      var time = entry.at.slice(11, 19);
      return '<li class="log-row ' + esc(entry.level) + '"><time>' + time + '</time><b>' +
        esc(entry.phase) + '</b><span>' + esc(entry.message) +
        (entry.data === null ? '' : ' · ' + JSON.stringify(entry.data)) + '</span></li>';
    }).join('');
  }

  function showInspectorTab(tab) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-inspector-tab]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-inspector-tab') === tab);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-inspector-panel]'), function (panel) {
      panel.classList.toggle('active', panel.getAttribute('data-inspector-panel') === tab);
    });
  }

  function profileOptions() {
    var profiles = Game.content.all('worldSpawnProfile').slice().sort(function (a, b) { return a.id.localeCompare(b.id); });
    var select = document.getElementById('profile-select');
    var previous = select.value;
    select.innerHTML = profiles.map(function (profile) {
      return '<option value="' + esc(profile.id) + '">' + esc(profile.id) + '</option>';
    }).join('');
    if (profiles.some(function (profile) { return profile.id === previous; })) select.value = previous;
    candidateInspection = null;
  }

  function defaultMerchantQaPoint(targetLayout) {
    targetLayout = targetLayout || layout;
    if (!targetLayout) return null;
    var camp = targetLayout.camp;
    var points = targetLayout.corridor && targetLayout.corridor.points || [];
    var best = null;
    points.forEach(function (point) {
      var distance = U.dist(camp.x, camp.y, point.x, point.y);
      var score = Math.abs(distance - 260);
      if (!best || score < best.score) best = { x: point.x, y: point.y, score: score };
    });
    return best ? { x: best.x, y: best.y } : { x: camp.x, y: camp.y };
  }

  function merchantPlacementSeed(targetLayout) {
    targetLayout = targetLayout || layout;
    return U.strSeed([
      targetLayout && targetLayout.worldSeed || 0,
      targetLayout && targetLayout.regionId || region && region.id,
      'map-generation-lab-merchant'
    ].join('|'));
  }

  function merchantAuditSignature(report) {
    return report && {
      ok: report.ok,
      reason: report.reason,
      merchantProfileId: report.merchantProfileId,
      spawnProfileId: report.spawnProfileId,
      selector: report.selector,
      source: report.source,
      seed: report.seed,
      heroPoint: report.heroPoint,
      constraints: report.constraints,
      sourceTotal: report.sourceTotal,
      distanceEligible: report.distanceEligible,
      inspectedCount: report.inspectedCount,
      validCount: report.validCount,
      failureCounts: report.failureCounts,
      chosen: report.chosen
    };
  }

  function removeMerchantAuditRuntime() {
    if (merchantSpawnId && Game.population.lease(merchantSpawnId)) {
      Game.population.close(merchantSpawnId, 'merchant-audit-refresh', { despawn: true });
    }
    if (merchantActorId) {
      actors = actors.filter(function (actor) { return actor.id !== merchantActorId; });
      delete actorOrigins[merchantActorId];
      delete actorRng[merchantActorId];
    }
    merchantActorId = null;
    merchantSpawnId = null;
    merchantPatrolMax = 0;
    if (masters.props) {
      masters.props = masters.props.filter(function (prop) { return !prop.merchantAuditProp; });
    }
  }

  function prepareMerchantAudit(point, targetLayout, plan) {
    targetLayout = targetLayout || layout;
    plan = plan || populationPlan;
    merchantQaPoint = point || defaultMerchantQaPoint(targetLayout);
    merchantAudit = Game.merchants.inspectPlacement({
      regionId: targetLayout.regionId || region.id,
      seed: merchantPlacementSeed(targetLayout),
      layout: targetLayout,
      heroPoint: merchantQaPoint,
      reservations: plan && plan.reservations,
      full: true
    });
    if (targetLayout === layout && masters.props && merchantAudit.chosen) {
      masters.props.push({
        id: 'merchant-audit-wagon',
        kind: 'merchantAudit',
        sprite: 'trade_wagon_wander',
        x: merchantAudit.chosen.x,
        y: merchantAudit.chosen.y,
        scale: 1,
        merchantAuditProp: true
      });
    }
    log('merchant', merchantAudit.ok ? 'merchant placement audit passed' : 'merchant placement audit failed',
      merchantAuditSignature(merchantAudit), merchantAudit.ok ? 'info' : 'error');
    return merchantAudit;
  }

  function mountMerchantAuditActor(registerRuntime) {
    if (!merchantAudit || !merchantAudit.chosen) return null;
    var profile = Game.content.get('merchantProfile', merchantAudit.merchantProfileId);
    if (!profile) return null;
    var result = Game.population.materialize(profile.spawnProfileId, {
      regionId: region.id,
      populationId: 'map-generation-lab-merchant',
      layoutSlotKey: merchantAudit.chosen.anchorKey,
      spawnRequestKey: [
        'map-generation-lab', region.id, layout.worldSeed, ++merchantRequestOrdinal
      ].join(':'),
      x: merchantAudit.chosen.x,
      y: merchantAudit.chosen.y,
      tier: region.tier || 1,
      rewardMultiplier: 0
    });
    if (!result.ok || !result.primary) {
      log('merchant', 'merchant audit actor materialization failed', result, 'error');
      return null;
    }
    var actor = result.primary;
    Game.merchants.configurePatrolActor(actor, merchantAudit.chosen);
    actor.merchantProfileId = profile.id;
    actor._labChannel = 'merchant';
    actor._labSlotId = 'merchant-audit';
    actors.push(actor);
    merchantActorId = actor.id;
    merchantSpawnId = result.lease.spawnId;
    if (registerRuntime) {
      actorOrigins[actor.id] = {
        x: actor.spawnX, y: actor.spawnY, dir: actor.dir, state: actor.state
      };
      actorRng[actor.id] = U.seededRng(U.strSeed(
        region.id + ':' + layout.worldSeed + ':' + actor.id
      ));
      applySceneLayers(true);
    }
    return actor;
  }

  function rerunMerchantAudit(point) {
    removeMerchantAuditRuntime();
    prepareMerchantAudit(point, layout, populationPlan);
    mountMerchantAuditActor(true);
    if (generationRecord) {
      generationRecord.merchantPlacementHash = hash(merchantAuditSignature(merchantAudit));
      generationRecord.actorCoordinateHash = hash(expectedActorCoordinates(populationPlan, merchantAudit));
    }
    runAudit();
    refreshGenerationReportHash();
    probeState = {
      tool: 'merchant',
      point: copy(merchantQaPoint),
      ok: !!merchantAudit.ok
    };
    renderProbe();
    renderMerchantAudit();
    setStatus(lt('merchantMoved'));
    return copy(merchantAuditSignature(merchantAudit));
  }

  function materializePlan() {
    actors = [];
    ['regular', 'npc', 'guardian', 'boss'].forEach(function (channel) {
      var results = Game.population.mountChannel(region.id, channel, layout, {});
      results.forEach(function (result) {
        result.actors.forEach(function (actor) {
          actor._labChannel = channel;
          actor._labSlotId = result.slotId;
          actors.push(actor);
        });
      });
      log('materialize', channel + ' channel mounted', {
        leases: results.length,
        actors: results.reduce(function (sum, result) { return sum + result.actors.length; }, 0)
      });
    });
    mountMerchantAuditActor(false);
    actorOrigins = {};
    actorRng = {};
    actors.forEach(function (actor) {
      actorOrigins[actor.id] = {
        x: actor.spawnX === undefined ? actor.x : actor.spawnX,
        y: actor.spawnY === undefined ? actor.y : actor.spawnY,
        dir: actor.dir,
        state: actor.state
      };
      actorRng[actor.id] = U.seededRng(U.strSeed(region.id + ':' + layout.worldSeed + ':' + actor.id));
    });
    Game.world.entities = actors.slice();
    Game.world.bossEnt = actors.filter(function (actor) { return actor.rank === 'boss'; })[0] || null;
    Game.terrain.rebuildDynamicSpatial(actors);
  }

  function populationLimits() {
    var regionProfile = Game.content.get('regionProfile', region.id);
    var view = regionProfile && Game.content.populationView(regionProfile.populationProfileId);
    return {
      regular: (layout.threats || []).length,
      npc: view && view.channels.npc && view.channels.npc.capacity || 0,
      guardian: layout.guardian ? 1 : 0,
      boss: 1,
      rare: 0
    };
  }

  function sceneMasters() {
    masters = {
      props: (layout.props || []).slice(),
      nodes: (layout.nodes || []).slice(),
      landmarks: (layout.landmarks || []).slice(),
      curios: (layout.curios || []).slice(),
      ecology: (layout.ecology || []).slice(),
      tufts: (layout.tufts || []).slice(),
      flowers: (layout.flowers || []).slice()
    };
  }

  function propLayer(prop) {
    if (prop.merchantAuditProp) return 'merchantAudit';
    if (prop.campProp) return 'camp';
    if (prop.kind === 'bossDecor') return 'decorBoss';
    if (prop.blockerProp) return 'decorBlocker';
    var definition = (region.terrain.deco || []).filter(function (item) { return item.sprite === prop.sprite; })[0];
    return definition && definition.placement === 'water' ? 'decorWater' : 'decorGround';
  }

  function applySceneLayers(remount) {
    if (!layout) return;
    layout.props = masters.props.filter(function (prop) { return layers[propLayer(prop)] !== false; });
    layout.nodes = layers.resources === false ? [] : masters.nodes.slice();
    layout.landmarks = layers.landmarks === false ? [] : masters.landmarks.slice();
    layout.curios = layers.curios === false ? [] : masters.curios.slice();
    layout.ecology = layers.ecology === false ? [] : masters.ecology.slice();
    layout.tufts = layers.tufts === false ? [] : masters.tufts.slice();
    layout.flowers = layers.flowers === false ? [] : masters.flowers.slice();
    if (remount) Game.terrain.mount(layout, region);
    Game.world.props = layout.props.concat(layout.nodes, layout.landmarks, layout.curios, layout.ecology);
    Game.world.entities = layers.actors === false ? [] : actors.filter(function (actor) {
      return actor._labChannel !== 'merchant' || layers.merchantAudit !== false;
    });
    Game.terrain.rebuildDynamicSpatial(Game.world.entities);
  }

  function planSignature(plan) {
    return {
      ok: plan.ok,
      reason: plan.reason,
      regionId: plan.regionId,
      populationId: plan.populationId,
      layoutVersion: plan.layoutVersion,
      contentFingerprint: plan.contentFingerprint,
      context: plan.context,
      slots: plan.slots,
      reservations: plan.reservations,
      failures: plan.failures
    };
  }

  function productionDecorationSnapshot(targetLayout) {
    return Game.terrain.decorationSnapshot(Object.assign({}, targetLayout, {
      props: (targetLayout.props || []).filter(function (prop) { return !prop.merchantAuditProp; })
    }));
  }

  function expectedActorCoordinates(plan, merchantReport) {
    var out = [];
    (plan.slots || []).forEach(function (slot) {
      var profile = Game.content.get('worldSpawnProfile', slot.profileId);
      var pack = profile && profile.encounterPackId && Game.content.get('encounterPack', profile.encounterPackId);
      var members = pack ? pack.members : [{
        slotId: 'actor', archetypeId: profile && profile.actorRef && profile.actorRef.archetypeId
      }];
      members.forEach(function (member, index) {
        var spacing = pack && pack.formation && pack.formation.spacing || 0;
        var angle = members.length === 1 ? 0 : Math.PI * 2 * index / members.length;
        out.push({
          slotId: slot.id,
          archetypeId: member.archetypeId,
          x: slot.x + Math.cos(angle) * (index ? spacing : 0),
          y: slot.y + Math.sin(angle) * (index ? spacing * 0.65 : 0)
        });
      });
    });
    if (merchantReport && merchantReport.chosen) {
      var merchantProfile = Game.content.get('merchantProfile', merchantReport.merchantProfileId);
      var spawnProfile = merchantProfile && Game.content.get('worldSpawnProfile', merchantProfile.spawnProfileId);
      var actorRef = spawnProfile && spawnProfile.actorRef;
      if (actorRef) out.push({
        slotId: 'merchant-audit',
        archetypeId: actorRef.archetypeId,
        x: merchantReport.chosen.x,
        y: merchantReport.chosen.y
      });
    }
    return out.sort(function (left, right) {
      return left.slotId.localeCompare(right.slotId) ||
        left.archetypeId.localeCompare(right.archetypeId) ||
        left.x - right.x || left.y - right.y;
    });
  }

  function mountedActorCoordinates() {
    return actors.map(function (actor) {
      var origin = actorOrigins[actor.id] || actor;
      return {
        slotId: actor._labSlotId,
        archetypeId: actor.blueprint.archetypeId,
        x: origin.x,
        y: origin.y
      };
    }).sort(function (left, right) {
      return left.slotId.localeCompare(right.slotId) ||
        left.archetypeId.localeCompare(right.archetypeId) ||
        left.x - right.x || left.y - right.y;
    });
  }

  function verifyDeterminism() {
    if (!layout) return null;
    var started = now();
    var regenerated = Game.terrain.generate(region, layout.worldSeed, layout.version);
    var terrainSnapshot = stableTerrainSnapshot(regenerated);
    var decorationSnapshot = productionDecorationSnapshot(regenerated);
    var previewContext = Object.assign({}, populationContext, { preview: true });
    var previewPlan = Game.population.prepareRegion(region.id, regenerated, previewContext);
    var previewMerchant = Game.merchants.inspectPlacement({
      regionId: region.id,
      seed: merchantPlacementSeed(regenerated),
      layout: regenerated,
      heroPoint: merchantQaPoint || defaultMerchantQaPoint(regenerated),
      reservations: previewPlan.reservations,
      full: true
    });
    var expected = expectedActorCoordinates(previewPlan, previewMerchant);
    var currentCoordinates = mountedActorCoordinates();
    var result = {
      ok: true,
      regionId: region.id,
      seed: U.hex32(layout.worldSeed),
      terrain: {
        match: hash(terrainSnapshot) === generationRecord.terrainHash,
        expectedHash: generationRecord.terrainHash,
        actualHash: hash(terrainSnapshot)
      },
      decorationEcology: {
        match: hash(decorationSnapshot) === generationRecord.decorationHash,
        expectedHash: generationRecord.decorationHash,
        actualHash: hash(decorationSnapshot)
      },
      population: {
        match: hash(planSignature(previewPlan)) === generationRecord.populationHash,
        expectedHash: generationRecord.populationHash,
        actualHash: hash(planSignature(previewPlan))
      },
      merchantPlacement: {
        match: hash(merchantAuditSignature(previewMerchant)) === generationRecord.merchantPlacementHash,
        expectedHash: generationRecord.merchantPlacementHash,
        actualHash: hash(merchantAuditSignature(previewMerchant))
      },
      actors: {
        match: hash(expected) === generationRecord.actorCoordinateHash &&
          hash(currentCoordinates) === generationRecord.actorCoordinateHash,
        expectedHash: generationRecord.actorCoordinateHash,
        actualHash: hash(expected),
        mountedHash: hash(currentCoordinates)
      },
      elapsedMs: now() - started
    };
    result.ok = result.terrain.match && result.decorationEcology.match &&
      result.population.match && result.merchantPlacement.match && result.actors.match;
    result.reportHash = hash(result);
    log('determinism', result.ok ? 'terrain, population and actor coordinates match' : 'determinism mismatch', result, result.ok ? 'info' : 'error');
    setStatus(result.ok ? lt('verified') + ' · ' + result.reportHash : lt('mismatch'));
    return copy(result);
  }

  function resetPositions() {
    actors.forEach(function (actor) {
      var origin = actorOrigins[actor.id];
      if (!origin) return;
      actor.x = origin.x;
      actor.y = origin.y;
      actor.dir = origin.dir;
      actor.state = origin.state;
      actor.moving = false;
      actor.moveOrder = null;
      actor.navRoute = null;
      actor.wanderT = 0.5 + (U.strSeed(actor.id + ':wander') % 1500) / 1000;
      if (actor.components && actor.components.movement) {
        actor.components.movement.intent = null;
        actor.components.movement.path = null;
        actor.components.movement.moving = false;
      }
      actorRng[actor.id] = U.seededRng(U.strSeed(region.id + ':' + layout.worldSeed + ':' + actor.id));
    });
    motionAccumulator = 0;
    merchantPatrolMax = 0;
    Game.terrain.rebuildDynamicSpatial(Game.world.entities);
    setStatus(lt('reset'));
    log('motion', 'actor positions reset', { actors: actors.length });
    return actors.map(function (actor) { return { id: actor.id, x: actor.x, y: actor.y }; });
  }

  function runBatchTopology() {
    var failures = [], full = 0, quick = 0, signatures = {};
    regions.forEach(function (candidateRegion, regionIndex) {
      for (var ordinal = 1; ordinal <= 10; ordinal++) {
        var seed = Math.imul(ordinal + regionIndex * 31, 2654435761) >>> 0;
        var candidate = Game.terrain.generate(candidateRegion, seed, 4);
        var report = Game.terrain.validate(candidate);
        if (!report.valid) failures.push({ regionId: candidateRegion.id, seed: seed, failures: report.failures });
        full++;
      }
    });
    for (var index = 0; index < 5000; index++) {
      var fuzzRegion = regions[index % regions.length];
      var fuzzSeed = Math.imul(index + 17, 2246822519) >>> 0;
      var topology = Game.terrain.fastTopology(fuzzRegion, fuzzSeed);
      if (topology.loopRank < 2 || topology.edges < topology.centers + 1) {
        failures.push({ regionId: fuzzRegion.id, seed: fuzzSeed, topology: topology });
      }
      signatures[fuzzRegion.id + ':' + topology.signature] = true; quick++;
    }
    var result = { ok: failures.length === 0, fullLayouts: full, quickTopologies: quick,
      uniqueTopologies: Object.keys(signatures).length, failures: failures.slice(0, 30) };
    result.reportHash = hash(result);
    log('generation', 'v4 batch topology ' + (result.ok ? 'passed' : 'failed'), result, result.ok ? 'info' : 'error');
    setStatus((result.ok ? lt('pass') : lt('fail')) + ' · 80 full / 5000 quick · ' + result.reportHash);
    return copy(result);
  }

  function setMotion(enabled) {
    enabled = !!enabled;
    if (!enabled && motion) resetPositions();
    motion = enabled;
    document.getElementById('motion-toggle').checked = motion;
    log('motion', motion ? 'seeded ambient patrol enabled' : 'ambient patrol disabled', { fixedStepMs: 50 });
    return motion;
  }

  function updateMotion(dt) {
    if (!motion) return;
    motionAccumulator += Math.min(dt, 0.2);
    while (motionAccumulator >= 0.05) {
      actors.forEach(function (actor) {
        if (actor._labChannel !== 'regular' && actor._labChannel !== 'npc' &&
            actor._labChannel !== 'merchant') return;
        Game.world.updateAmbientActor(actor, 0.05, { rng: actorRng[actor.id] });
        if (actor._labChannel === 'merchant' && merchantAudit && merchantAudit.chosen) {
          merchantPatrolMax = Math.max(merchantPatrolMax, U.dist(
            actor.x, actor.y, merchantAudit.chosen.x, merchantAudit.chosen.y
          ));
        }
      });
      motionAccumulator -= 0.05;
    }
    Game.terrain.rebuildDynamicSpatial(Game.world.entities);
  }

  function currentSnapshot() {
    if (!layout) return null;
    return {
      lab: 'map-generation',
      noPlayer: !Game.world.hero && !actors.some(function (actor) { return actor.category === 'player'; }),
      fogEnabled: false,
      runtimeHazards: false,
      regionId: region.id,
      seed: layout.worldSeed >>> 0,
      seedHex: U.hex32(layout.worldSeed),
      layoutVersion: layout.version,
      terrain: stableTerrainSnapshot(layout),
      validation: copy(validation),
      populationPlan: planSignature(populationPlan),
      merchantAudit: merchantAuditSignature(merchantAudit),
      merchantPatrolMax: merchantPatrolMax,
      actors: actors.map(function (actor) {
        return {
          id: actor.id,
          archetypeId: actor.blueprint.archetypeId,
          category: actor.category,
          rank: actor.rank,
          channel: actor._labChannel,
          slotId: actor._labSlotId,
          x: actor.x,
          y: actor.y,
          spawnX: actorOrigins[actor.id] && actorOrigins[actor.id].x,
          spawnY: actorOrigins[actor.id] && actorOrigins[actor.id].y,
          spriteId: actor.components.presentation.spriteId
        };
      }),
      catalogCount: catalogItems.length,
      audit: { issues: copy(auditIssues), hash: hash(auditIssues) },
      logs: logs.length,
      camera: copy(Game.render.cam),
      minimap: {
        worldWidth: layout.world.w,
        worldHeight: layout.world.h,
        canvasWidth: minimap.width,
        canvasHeight: minimap.height,
        hasPlayerIcon: false,
        viewport: {
          x: (Game.render.cam.x - stageWrap.clientWidth / Game.render.cam.zoom / 2) / layout.world.w * minimap.width,
          y: (Game.render.cam.y - stageWrap.clientHeight / Game.render.cam.zoom / 2) / layout.world.h * minimap.height,
          width: stageWrap.clientWidth / Game.render.cam.zoom / layout.world.w * minimap.width,
          height: stageWrap.clientHeight / Game.render.cam.zoom / layout.world.h * minimap.height
        }
      },
      layers: copy(layers),
      decorationEcology: copy(layout.decorationEcology),
      decorationField: refreshDecorField(false) ? {
        sprite: decorField.sprite,
        viableShare: decorField.viableShare,
        max: decorField.max
      } : null,
      motion: motion,
      selection: selected ? {
        key: selected.key,
        kind: selected.kind,
        id: selected.id,
        x: selected.x,
        y: selected.y
      } : null,
      contentFingerprint: Game.content.fingerprint(),
      reportHash: generationRecord && generationRecord.reportHash
    };
  }

  function renderDecorationEcology() {
    var host = document.getElementById('decor-ecology-metrics');
    var summary = document.getElementById('decor-pattern-summary');
    if (!host || !summary || !layout || !layout.decorationEcology) return;
    var ecology = layout.decorationEcology;
    var metrics = ecology.metrics || {};
    var targets = ecology.targets || {};
    var targetTotal = 0, placedTotal = 0;
    Object.keys(targets).forEach(function (sprite) {
      targetTotal += targets[sprite].target || 0;
      placedTotal += targets[sprite].placed || 0;
    });
    var coverage = placedTotal / Math.max(1, targetTotal);
    var field = refreshDecorField(false);
    var values = [
      [metrics.instances || 0, lt('decorInstances')],
      [metrics.clusters || 0, lt('decorClusters')],
      [metrics.definitions || 0, lt('decorDefinitions')],
      [(metrics.meanNearest || 0).toFixed(1) + ' px', lt('decorNearest')],
      [(metrics.sameTypeEnrichment || 0).toFixed(2) + '×', lt('decorEnrichment')],
      [(coverage * 100).toFixed(1) + '%', lt('decorCoverage')]
    ];
    host.innerHTML = values.map(function (entry) {
      return '<div class="ecology-metric"><strong>' + esc(entry[0]) +
        '</strong><span>' + esc(entry[1]) + '</span></div>';
    }).join('');
    var activeSprite = activeDecorationSprite();
    var activeDefinition = decorationDefinition(activeSprite);
    var activePattern = activeDefinition && activeDefinition.distribution &&
      activeDefinition.distribution.pattern;
    var patternCounts = metrics.patterns || {};
    var chips = Object.keys(patternCounts).sort().map(function (pattern) {
      return '<span class="pattern-chip' + (pattern === activePattern ? ' selected' : '') +
        '">' + esc(pattern + ' ×' + patternCounts[pattern]) + '</span>';
    });
    chips.unshift('<span class="pattern-chip selected">' +
      esc((activeSprite || '—') + ' · ' +
        (field ? (field.viableShare * 100).toFixed(1) + '% ' + lt('habitatViable') : lt('habitatNone'))) +
      '</span>');
    summary.innerHTML = chips.join('');
  }

  function renderMerchantAudit() {
    var host = document.getElementById('merchant-audit-metrics');
    var detail = document.getElementById('merchant-audit-detail');
    var focusButton = document.getElementById('focus-merchant');
    if (!host || !detail || !focusButton) return;
    if (!merchantAudit) {
      host.innerHTML = '';
      detail.textContent = lt('merchantNoPlacement');
      focusButton.disabled = true;
      return;
    }
    var chosen = merchantAudit.chosen;
    var patrolRadius = merchantAudit.constraints && merchantAudit.constraints.patrolRadius || 0;
    var patrolPass = !!chosen && merchantPatrolMax <= patrolRadius + 0.5;
    var values = [
      [merchantAudit.ok ? lt('merchantPass') : lt('merchantFail'), lt('merchantProfile'), merchantAudit.ok],
      [merchantAudit.source || '—', lt('merchantSource')],
      [merchantAudit.distanceEligible + ' / ' + merchantAudit.sourceTotal, lt('merchantEligible')],
      [merchantAudit.validCount + ' / ' + merchantAudit.inspectedCount, lt('merchantValid'), merchantAudit.validCount > 0],
      [chosen ? chosen.clearance.toFixed(0) + ' px' : '—', lt('merchantClearance'), !!chosen],
      [merchantPatrolMax.toFixed(1) + ' / ' + patrolRadius + ' px', lt('merchantPatrol'), patrolPass]
    ];
    host.innerHTML = values.map(function (entry) {
      return '<div class="merchant-audit-metric"><strong' +
        (entry[2] === undefined ? '' : ' class="' + (entry[2] ? 'pass' : 'fail') + '"') + '>' +
        esc(entry[0]) + '</strong><span>' + esc(entry[1]) + '</span></div>';
    }).join('');
    var rejected = Object.keys(merchantAudit.failureCounts || {}).sort(function (left, right) {
      return merchantAudit.failureCounts[right] - merchantAudit.failureCounts[left];
    }).slice(0, 5).map(function (key) {
      return key + ':' + merchantAudit.failureCounts[key];
    }).join(' · ');
    detail.textContent = chosen
      ? lt('merchantQa') + ' ' + Math.round(merchantAudit.heroPoint.x) + ',' + Math.round(merchantAudit.heroPoint.y) +
        ' · ' + lt('merchantWagon') + ' ' + Math.round(chosen.x) + ',' + Math.round(chosen.y) +
        ' · danger ' + chosen.danger.toFixed(3) + ' · reservations ' +
        ((merchantAudit.failureCounts && merchantAudit.failureCounts.occupancy) || 0) +
        ' · ' + lt('merchantRejected') + ' ' + (rejected || '—')
      : lt('merchantNoPlacement') + ' · ' + lt('merchantRejected') + ' ' + (rejected || '—');
    focusButton.disabled = !chosen;
  }

  function renderMetrics() {
    if (!layout) return;
    var sorted = frameSamples.slice().sort(function (a, b) { return a - b; });
    var average = sorted.length ? sorted.reduce(function (sum, value) { return sum + value; }, 0) / sorted.length : 0;
    var p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    var cam = Game.render.cam;
    var viewLeft = cam.x - stageWrap.clientWidth / cam.zoom / 2;
    var viewTop = cam.y - stageWrap.clientHeight / cam.zoom / 2;
    var viewRight = cam.x + stageWrap.clientWidth / cam.zoom / 2;
    var viewBottom = cam.y + stageWrap.clientHeight / cam.zoom / 2;
    var visibleStatic = Game.terrain.spatialQuery(viewLeft - 48, viewTop - 76, viewRight + 48, viewBottom + 28, false) || [];
    var visibleDynamic = Game.terrain.spatialQuery(viewLeft - 30, viewTop - 60, viewRight + 30, viewBottom + 30, true) || [];
    spatialQueries += 2;
    var values = [
      [generationRecord.timings.generate.toFixed(1) + ' ms', lt('generation')],
      [generationRecord.timings.bake.toFixed(1) + ' ms', lt('bake')],
      [generationRecord.timings.population.toFixed(1) + ' ms', lt('population')],
      [generationRecord.timings.materialize.toFixed(1) + ' ms', lt('materialize')],
      [visibleStatic.length + visibleDynamic.length + ' / ' + (Game.world.props.length + Game.world.entities.length), 'drawable'],
      [average.toFixed(2) + ' / ' + p95.toFixed(2), 'frame avg / P95'],
      [(window.devicePixelRatio || 1).toFixed(2) + ' / ' + cam.zoom.toFixed(2), 'DPR / zoom'],
      [spatialQueries, 'spatial queries'],
      [actors.length, 'actors'],
      [auditIssues.length, lt('issues')]
    ];
    document.getElementById('runtime-metrics').innerHTML = values.map(function (entry) {
      return '<div class="metric"><strong>' + esc(entry[0]) + '</strong><span>' + esc(entry[1]) + '</span></div>';
    }).join('');
    renderMerchantAudit();
  }

  function updateCameraStatus() {
    if (!layout) return;
    var cam = Game.render.cam;
    document.getElementById('camera-status').textContent =
      'x ' + Math.round(cam.x) + ' · y ' + Math.round(cam.y) + ' · ' + cam.zoom.toFixed(2) + '×';
  }

  function renderTabs() {
    document.getElementById('region-tabs').innerHTML = regions.map(function (item, index) {
      return '<button type="button" class="region-tab' + (index === currentIndex ? ' active' : '') +
        '" data-region-index="' + index + '"' + (index === currentIndex ? ' aria-current="page"' : '') +
        '><small>' + String(index + 1).padStart(2, '0') + ' / TIER ' + item.tier + '</small>' +
        esc(regionName(item)) + '</button>';
    }).join('');
  }

  function regenerate(options) {
    options = options || {};
    if (options.regionId) {
      var found = regions.findIndex(function (item) { return item.id === options.regionId; });
      if (found >= 0) currentIndex = found;
    }
    region = regions[currentIndex];
    var requestedSeed = options.seed;
    if (typeof requestedSeed === 'string') requestedSeed = parseSeed(requestedSeed);
    if (!Number.isInteger(requestedSeed)) requestedSeed = seedValue();
    if (!Number.isInteger(requestedSeed)) requestedSeed = U.randomSeed();
    requestedSeed = requestedSeed >>> 0;
    document.getElementById('runtime-status').textContent = lt('generating');
    setStatus('');
    log('registry', 'content registry ready', {
      fingerprint: Game.content.fingerprint(),
      actors: Game.content.all('actorArchetype').length,
      spawnProfiles: Game.content.all('worldSpawnProfile').length
    });
    merchantAudit = null;
    merchantQaPoint = null;
    merchantActorId = null;
    merchantSpawnId = null;
    merchantPatrolMax = 0;
    Game.population.reset(region.id);
    Game.parties.reset();
    Game.actors.reset();
    Game.state.world.region = region.id;
    Game.state.world.worldSeed = requestedSeed;
    var layoutVersion = Number(document.getElementById('layout-version').value) === 3 ? 3 : 4;
    Game.state.world.layoutVersion = layoutVersion;
    Game.state.world.worldTime = Game.F.BAL.dayLength * 0.25;
    Game.state.settings.effects = false;
    var timings = {};
    var began = now();
    layout = Game.terrain.generate(region, requestedSeed, layoutVersion);
    decorField = null;
    decorFieldKey = null;
    timings.generate = now() - began;
    log('terrain', 'terrain.generate complete', {
      regionId: region.id, seed: U.hex32(requestedSeed), elapsedMs: timings.generate,
      fallback: layout.generation && layout.generation.fallback || null
    });
    began = now();
    validation = Game.terrain.validate(layout, region);
    timings.validate = now() - began;
    log('validate', validation.valid ? 'terrain validation passed' : 'terrain validation failed', {
      elapsedMs: timings.validate, metrics: validation.metrics
    }, validation.valid ? 'info' : 'error');
    began = now();
    Game.terrain.mount(layout, region);
    timings.bake = now() - began;
    log('bake', 'terrain mounted and baked', {
      elapsedMs: timings.bake, props: layout.props.length, world: layout.world
    });
    sceneMasters();
    Game.world.region = Object.assign({}, region, { world: layout.world });
    Game.world.layout = layout;
    Game.world.props = [];
    Game.world.entities = [];
    Game.world.groundLoot = [];
    Game.world.hero = null;
    Game.world.cinematic = null;
    Game.world.bossEnt = null;
    if (Game.particles) {
      Game.particles.setEnabled(false);
      Game.particles.initRegion(region);
    }
    var tier = region.tier || 1;
    populationContext = {
      tier: tier,
      worldSeed: requestedSeed,
      expeditionIndex: 0,
      modifiers: [],
      rewardMultiplier: 1,
      channelLimits: populationLimits()
    };
    began = now();
    populationPlan = Game.population.prepareRegion(region.id, layout, populationContext);
    timings.population = now() - began;
    log('population', 'PopulationMountPlan prepared', {
      ok: populationPlan.ok, elapsedMs: timings.population,
      slots: populationPlan.slots.length, failures: populationPlan.failures.length
    }, populationPlan.ok ? 'info' : 'error');
    prepareMerchantAudit(null, layout, populationPlan);
    began = now();
    materializePlan();
    timings.materialize = now() - began;
    applySceneLayers(true);
    miniTerrain = buildMiniTerrain();
    selected = null;
    probeState = null;
    measureState = { a: null, b: null, path: null, report: null };
    candidateInspection = null;
    generationRecord = {
      timings: timings,
      terrainHash: hash(stableTerrainSnapshot(layout)),
      decorationHash: hash(productionDecorationSnapshot(layout)),
      populationHash: hash(planSignature(populationPlan)),
      actorCoordinateHash: hash(expectedActorCoordinates(populationPlan, merchantAudit)),
      merchantPlacementHash: hash(merchantAuditSignature(merchantAudit))
    };
    runAudit();
    refreshGenerationReportHash();
    rebuildCatalog();
    profileOptions();
    rememberSeed(requestedSeed);
    renderTabs();
    renderSelection();
    renderProbe();
    renderDecorationEcology();
    renderMerchantAudit();
    document.getElementById('seed-input').value = U.hex32(requestedSeed);
    document.getElementById('stage-index').textContent = String(currentIndex + 1).padStart(2, '0');
    document.getElementById('stage-region-name').textContent = regionName(region);
    document.getElementById('stage-region-id').textContent = 'region / ' + region.id + ' · layout v' + layout.version;
    document.getElementById('runtime-status').textContent = lt('ready');
    document.getElementById('runtime-count').textContent = actors.length + ' actors · ' + masters.props.length + ' props';
    setCamera(options.keepCamera && options.camera ? options.camera.x : layout.camp.x,
      options.keepCamera && options.camera ? options.camera.y : layout.camp.y,
      options.keepCamera && options.camera ? options.camera.zoom : 1.45);
    updateUrl();
    renderMetrics();
    log('renderer', 'renderer ready', { camera: copy(Game.render.cam), particles: false, fog: false, player: false });
    return currentSnapshot();
  }

  function refreshGenerationReportHash() {
    if (!generationRecord) return null;
    generationRecord.reportHash = hash({
      terrain: generationRecord.terrainHash,
      decoration: generationRecord.decorationHash,
      population: generationRecord.populationHash,
      actors: generationRecord.actorCoordinateHash,
      merchant: generationRecord.merchantPlacementHash,
      audit: auditIssues
    });
    return generationRecord.reportHash;
  }

  function randomize() {
    var seed = U.randomSeed();
    regenerate({ seed: seed });
    return seed;
  }

  function setLayer(name, enabled) {
    if (!Object.prototype.hasOwnProperty.call(layers, name)) return false;
    layers[name] = enabled !== false;
    if (name === 'terrainMaterial' || name === 'liquid') {
      Game.terrain.renderLayers = Game.terrain.renderLayers || {};
      Game.terrain.renderLayers[name === 'terrainMaterial' ? 'material' : 'liquid'] = layers[name];
    }
    var input = document.querySelector('[data-layer="' + name + '"]');
    if (input) input.checked = layers[name];
    if (/^(camp|decor|tufts|flowers|landmarks|resources|curios|ecology|actors|merchantAudit)/.test(name)) {
      applySceneLayers(name !== 'actors');
    }
    log('renderer', 'layer changed', { layer: name, enabled: layers[name] });
    return layers[name];
  }

  function handleToolPoint(point) {
    point.x = clamp(point.x, 0, layout.world.w);
    point.y = clamp(point.y, 0, layout.world.h);
    if (tool === 'inspect') return inspectAt(point);
    if (tool === 'measure') return measure(point);
    if (tool === 'merchant') return rerunMerchantAudit(point);
    return placementProbe(null, point);
  }

  function stagePointerDown(event) {
    stagePointers[event.pointerId] = {
      x: event.clientX, y: event.clientY,
      lastX: event.clientX, lastY: event.clientY,
      startX: event.clientX, startY: event.clientY,
      startZoom: Game.render.cam.zoom,
      moved: false
    };
    try { overlay.setPointerCapture(event.pointerId); } catch (_) {}
    stageWrap.classList.add('is-panning');
  }

  function pointerPair() {
    return Object.keys(stagePointers).map(function (id) { return stagePointers[id]; });
  }

  function stagePointerMove(event) {
    var pointer = stagePointers[event.pointerId];
    if (!pointer) return;
    var previousX = pointer.x, previousY = pointer.y;
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (U.dist(pointer.startX, pointer.startY, pointer.x, pointer.y) > 5) pointer.moved = true;
    var points = pointerPair();
    if (points.length === 1) {
      var cam = Game.render.cam;
      setCamera(cam.x - (pointer.x - previousX) / cam.zoom, cam.y - (pointer.y - previousY) / cam.zoom, cam.zoom);
    } else if (points.length === 2) {
      var first = points[0], second = points[1];
      var currentDistance = Math.max(20, U.dist(first.x, first.y, second.x, second.y));
      var oldDistance = Math.max(20, U.dist(first.lastX, first.lastY, second.lastX, second.lastY));
      var centerX = (first.x + second.x) / 2;
      var centerY = (first.y + second.y) / 2;
      var rect = overlay.getBoundingClientRect();
      zoomAt(centerX - rect.left, centerY - rect.top, Game.render.cam.zoom * currentDistance / oldDistance);
      first.moved = second.moved = true;
    }
    pointer.lastX = pointer.x; pointer.lastY = pointer.y;
  }

  function stagePointerEnd(event) {
    var pointer = stagePointers[event.pointerId];
    if (!pointer) return;
    var rect = overlay.getBoundingClientRect();
    var clickPoint = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    var wasMoved = pointer.moved || Object.keys(stagePointers).length > 1;
    delete stagePointers[event.pointerId];
    if (!Object.keys(stagePointers).length) stageWrap.classList.remove('is-panning');
    if (!wasMoved) handleToolPoint(clickPoint);
  }

  function zoomAt(screenX, screenY, nextZoom) {
    var before = screenToWorld(screenX, screenY);
    var cam = Game.render.cam;
    nextZoom = clamp(nextZoom, 0.4, 3.4);
    var nextX = before.x - (screenX - stageWrap.clientWidth / 2) / nextZoom;
    var nextY = before.y - (screenY - stageWrap.clientHeight / 2) / nextZoom;
    setCamera(nextX, nextY, nextZoom);
  }

  function miniWorldFromEvent(event) {
    var rect = minimap.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1) * layout.world.w,
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1) * layout.world.h
    };
  }

  function moveCameraFromMini(event, selectMarker) {
    var point = miniWorldFromEvent(event);
    setCamera(point.x, point.y, Game.render.cam.zoom);
    if (selectMarker) {
      var threshold = 12 / minimap.clientWidth * layout.world.w;
      var nearest = nearestObject(point.x, point.y, threshold);
      if (nearest) {
        selectObject(nearest.item);
        setCamera(nearest.item.x, nearest.item.y, Game.render.cam.zoom);
        showInspectorTab('selection');
      }
    }
  }

  function exportPng() {
    var stage = document.getElementById('stage');
    var output = document.createElement('canvas');
    output.width = stage.width;
    output.height = stage.height;
    var ctx = output.getContext('2d');
    ctx.drawImage(stage, 0, 0);
    ctx.drawImage(overlay, 0, 0, output.width, output.height);
    output.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'map-lab-' + region.id + '-' + U.hex32(layout.worldSeed) + '.png';
      link.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      setStatus(lt('png'));
    }, 'image/png');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    return Promise.resolve();
  }

  function bindEvents() {
    document.getElementById('region-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('[data-region-index]');
      if (!button) return;
      currentIndex = Number(button.getAttribute('data-region-index'));
      regenerate({ seed: seedValue() });
    });
    document.getElementById('prev-region').addEventListener('click', function () {
      currentIndex = (currentIndex - 1 + regions.length) % regions.length;
      regenerate({ seed: seedValue() });
    });
    document.getElementById('next-region').addEventListener('click', function () {
      currentIndex = (currentIndex + 1) % regions.length;
      regenerate({ seed: seedValue() });
    });
    document.getElementById('regenerate').addEventListener('click', function () { regenerate({ seed: seedValue() }); });
    document.getElementById('seed-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var seed = seedValue();
      if (seed === null) {
        document.getElementById('seed-input').setCustomValidity('1–8 hex digits');
        document.getElementById('seed-input').reportValidity();
        return;
      }
      document.getElementById('seed-input').setCustomValidity('');
      regenerate({ seed: seed });
    });
    document.getElementById('seed-prev').addEventListener('click', function () { regenerate({ seed: ((seedValue() || 0) - 1) >>> 0 }); });
    document.getElementById('seed-next').addEventListener('click', function () { regenerate({ seed: ((seedValue() || 0) + 1) >>> 0 }); });
    document.getElementById('seed-random').addEventListener('click', randomize);
    document.getElementById('layout-version').addEventListener('change', function () {
      regenerate({ seed: seedValue() });
    });
    document.addEventListener('click', function (event) {
      var recent = event.target.closest('[data-recent-seed]');
      if (recent) regenerate({ seed: parseSeed(recent.getAttribute('data-recent-seed')) });
    });
    document.getElementById('copy-link').addEventListener('click', function () {
      var url = new URL(location.href);
      url.searchParams.set('region', region.id);
      url.searchParams.set('seed', U.hex32(layout.worldSeed));
      url.searchParams.set('layout', String(layout.version));
      copyText(url.href).then(function () { setStatus(lt('copied')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-focus]'), function (button) {
      button.addEventListener('click', function () { focus(button.getAttribute('data-focus')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (button) {
      button.addEventListener('click', function () {
        tool = button.getAttribute('data-tool');
        Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (other) {
          other.classList.toggle('active', other === button);
        });
        probeState = null;
        if (tool !== 'measure') measureState = { a: null, b: null, path: null, report: null };
        renderProbe();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-layer]'), function (input) {
      layers[input.getAttribute('data-layer')] = input.checked;
      input.addEventListener('change', function () { setLayer(input.getAttribute('data-layer'), input.checked); });
    });
    document.getElementById('profile-select').addEventListener('change', function () {
      candidateInspection = Game.population.inspectCandidates(
        this.value, layout, inferProfileChannel(this.value), populationContext,
        populationPlan && populationPlan.reservations || []
      );
    });
    document.getElementById('motion-toggle').addEventListener('change', function () { setMotion(this.checked); });
    document.getElementById('clear-probe').addEventListener('click', function () {
      probeState = null; candidateInspection = null;
      measureState = { a: null, b: null, path: null, report: null };
      renderProbe();
    });
    document.getElementById('issue-prev').addEventListener('click', function () { focusIssue(-1); });
    document.getElementById('issue-next').addEventListener('click', function () { focusIssue(1); });
    document.getElementById('verify-determinism').addEventListener('click', verifyDeterminism);
    document.getElementById('batch-topology').addEventListener('click', runBatchTopology);
    document.getElementById('reset-positions').addEventListener('click', resetPositions);
    document.getElementById('focus-merchant').addEventListener('click', function () {
      if (!merchantAudit || !merchantAudit.chosen) return;
      setCamera(merchantAudit.chosen.x, merchantAudit.chosen.y, Math.max(1.8, Game.render.cam.zoom));
    });
    document.getElementById('export-png').addEventListener('click', exportPng);
    document.getElementById('copy-report').addEventListener('click', function () {
      copyText(JSON.stringify({ snapshot: currentSnapshot(), logs: logs }, null, 2))
        .then(function () { setStatus(lt('copied')); });
    });
    document.getElementById('clear-log').addEventListener('click', function () {
      logs = []; renderLogs(); setStatus(lt('logCleared'));
    });
    document.getElementById('catalog-search').addEventListener('input', renderCatalog);
    document.getElementById('catalog-scope').addEventListener('change', renderCatalog);
    document.getElementById('catalog-category').addEventListener('change', renderCatalog);
    document.getElementById('catalog-list').addEventListener('click', function (event) {
      var button = event.target.closest('[data-catalog-index]');
      if (!button) return;
      var item = catalogItems[Number(button.getAttribute('data-catalog-index'))];
      if (!item) return;
      if (item.positions && item.positions.length) {
        selectObject(item.positions[0]);
        focus(item.positions[0]);
      } else {
        selectObject({
          key: item.key, kind: item.kind, id: item.id, name: item.name,
          sprite: item.sprite, data: item.data
        });
      }
      showInspectorTab('selection');
    });
    document.getElementById('issues-panel').addEventListener('click', function (event) {
      var button = event.target.closest('[data-issue-index]');
      if (!button) return;
      issueIndex = Number(button.getAttribute('data-issue-index'));
      var issue = auditIssues[issueIndex];
      if (Number.isFinite(issue.x)) setCamera(issue.x, issue.y, Math.max(1.7, Game.render.cam.zoom));
      renderIssues();
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-inspector-tab]'), function (button) {
      button.addEventListener('click', function () { showInspectorTab(button.getAttribute('data-inspector-tab')); });
    });
    overlay.addEventListener('pointerdown', stagePointerDown);
    overlay.addEventListener('pointermove', stagePointerMove);
    overlay.addEventListener('pointerup', stagePointerEnd);
    overlay.addEventListener('pointercancel', stagePointerEnd);
    overlay.addEventListener('wheel', function (event) {
      event.preventDefault();
      var rect = overlay.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top,
        Game.render.cam.zoom * Math.exp(-clamp(event.deltaY, -240, 240) * 0.0016));
    }, { passive: false });
    minimap.addEventListener('pointerdown', function (event) {
      miniDrag = false;
      minimap.setPointerCapture(event.pointerId);
      moveCameraFromMini(event, true);
    });
    minimap.addEventListener('pointermove', function (event) {
      if (!minimap.hasPointerCapture(event.pointerId)) return;
      miniDrag = true;
      moveCameraFromMini(event, false);
    });
    minimap.addEventListener('pointerup', function (event) {
      if (!miniDrag) moveCameraFromMini(event, true);
      miniDrag = false;
    });
    window.addEventListener('resize', function () {
      resizeOverlay();
      setCamera(Game.render.cam.x, Game.render.cam.y, Game.render.cam.zoom);
    });
    window.addEventListener('demo:locale', function () {
      renderTabs(); rebuildCatalog(); renderSelection(); renderProbe();
      renderMetrics(); renderDecorationEcology(); renderMerchantAudit();
      if (region) {
        document.getElementById('stage-region-name').textContent = regionName(region);
        document.getElementById('runtime-status').textContent = lt('ready');
      }
    });
  }

  function frame(timestamp) {
    var dt = Math.min(0.1, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    var began = now();
    if (layout) {
      updateMotion(dt);
      if (Game.nav && Game.nav.update) Game.nav.update(2);
      if (Game.terrain && Game.terrain.update) Game.terrain.update(dt);
      if (Game.fx && Game.fx.update) Game.fx.update(dt);
      Game.render.frame(dt);
      drawOverlay();
      drawMinimap();
      updateCameraStatus();
      if (timestamp - lastMetricsPaint > 800) {
        renderMetrics();
        lastMetricsPaint = timestamp;
      }
    }
    frameSamples.push(now() - began);
    if (frameSamples.length > 240) frameSamples.shift();
    requestAnimationFrame(frame);
  }

  function init() {
    D.init();
    var audit = Game.content.finalize({ strict: true });
    if (!audit.ok) throw new Error('[MapGenerationLab] content registry audit failed');
    Game.state = Game.State.newGame();
    Game.state.settings.lang = D.locale();
    Game.state.settings.effects = false;
    Game.i18n.setLocale(D.locale());
    Game.render.init(document.getElementById('stage'));
    if (Game.particles) Game.particles.setEnabled(false);
    regions = Game.reg.all('region');
    var params = new URLSearchParams(location.search);
    var rid = params.get('region');
    var found = regions.findIndex(function (item) { return item.id === rid; });
    currentIndex = found >= 0 ? found : 0;
    var seed = parseSeed(params.get('seed'));
    document.getElementById('layout-version').value = params.get('layout') === '3' ? '3' : '4';
    bindEvents();
    regenerate({ seed: seed === null ? 0x89ABCDEF : seed });
    window.MapGenerationLab = {
      regenerate: regenerate,
      randomize: randomize,
      catalog: function () { return copy(catalogItems); },
      snapshot: currentSnapshot,
      logs: function () { return copy(logs); },
      focus: focus,
      setCamera: setCamera,
      setLayer: setLayer,
      setMotion: setMotion,
      probe: placementProbe,
      inspect: inspectAt,
      measure: measure,
      merchantAudit: function (point) {
        return point ? rerunMerchantAudit(point) : copy(merchantAuditSignature(merchantAudit));
      },
      verifyDeterminism: verifyDeterminism,
      batchTopology: runBatchTopology,
      decorationReport: function () {
        return copy({
          ecology: layout && layout.decorationEcology,
          field: refreshDecorField(false)
        });
      },
      resetPositions: resetPositions
    };
    requestAnimationFrame(frame);
  }

  init();
})();
