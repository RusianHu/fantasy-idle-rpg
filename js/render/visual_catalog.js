/* ============================================================
 * render/visual_catalog.js — 生产视觉资产目录与覆盖审计
 *
 * 只读聚合层：不生成地图、不写存档、不维护第二套绘制逻辑。
 * 资产、Actor、区域、内容引用和效果原语均从生产注册表读取。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  // Stable renderer contracts; asset IDs and frame names are still discovered at runtime.
  var MOTION_STATES = ['idle', 'move', 'attack', 'cast', 'hurt', 'defeat'];
  var DIRECTIONS = ['d', 'u', 'l', 'r'];
  var FX_METHOD_ORDER = [
    'projectile', 'floatText', 'hitSpark', 'slash', 'ring', 'heal', 'poof', 'zzz',
    'teleport', 'goldBurst', 'finaleBurst', 'travelBurst', 'soulReturn', 'revivePulse',
    'shake', 'flashScreen', 'banner'
  ];
  // Only lifecycle/diagnostic methods are excluded; visual functions are enumerated dynamically.
  var FX_INTERNAL_METHODS = {
    update: true,
    drawShapes: true,
    drawFloats: true,
    shakeOffset: true,
    inspect: true,
    reset: true,
    catalog: true,
    preview: true,
    previewInfo: true
  };

  function clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function t(key, fallback) {
    if (key && Game.i18n && Game.i18n.t) {
      var value = Game.i18n.t(key);
      if (value && value !== key) return value;
    }
    return fallback || key || '';
  }

  function addRef(refs, spriteId, meta, missing) {
    meta = meta || {};
    if (!spriteId || !Game.assets || !Game.assets.has(spriteId)) {
      if (spriteId && meta.strictAsset && missing) {
        var missingKey = String(meta.sourceRef || '') + '|' + spriteId;
        if (!missing.some(function (item) { return item.key === missingKey; })) {
          missing.push({
            key: missingKey,
            code: 'missing-asset-ref',
            id: spriteId,
            sourceRef: meta.sourceRef || null,
            regionId: meta.regionId || null,
            group: meta.group || null
          });
        }
      }
      return;
    }
    var entry = refs[spriteId] || (refs[spriteId] = {
      spriteId: spriteId,
      groups: [],
      regions: [],
      sourceRefs: [],
      flags: {},
      names: []
    });
    if (meta.group && entry.groups.indexOf(meta.group) < 0) entry.groups.push(meta.group);
    if (meta.regionId && entry.regions.indexOf(meta.regionId) < 0) entry.regions.push(meta.regionId);
    if (meta.sourceRef && entry.sourceRefs.indexOf(meta.sourceRef) < 0) entry.sourceRefs.push(meta.sourceRef);
    if (meta.nameKey && entry.names.indexOf(meta.nameKey) < 0) entry.names.push(meta.nameKey);
    Object.keys(meta.flags || {}).forEach(function (key) { entry.flags[key] = meta.flags[key]; });
  }

  function regionList() {
    return Game.reg && Game.reg.all ? Game.reg.all('region') : [];
  }

  function collectRegions(refs, regions, missing) {
    regions.forEach(function (region) {
      var rid = region.id;
      var terrain = region.terrain || {};
      (terrain.deco || []).forEach(function (definition) {
        var placement = definition.placement || (definition.water ? 'water' : 'ground');
        var group = placement === 'blocker' ? 'decor-blocker' :
          placement === 'water' ? 'decor-water' : 'decor-ground';
        addRef(refs, definition.sprite, {
          group: group,
          regionId: rid,
          sourceRef: 'region.' + rid + '.terrain.deco',
          strictAsset: true,
          nameKey: definition.nameKey,
          flags: {
            sway: !!definition.sway,
            bob: !!definition.bob,
            flicker: !!definition.flicker,
            glow: !!definition.glow,
            shadow: definition.shadow !== false,
            v3Only: !!definition.v3Only
          }
        }, missing);
      });
      var territory = region.bossTerritory || region.boss || {};
      (territory.decor || []).forEach(function (definition) {
        addRef(refs, definition.sprite, {
          group: 'decor-boss', regionId: rid,
          sourceRef: 'region.' + rid + '.bossTerritory.decor',
          strictAsset: true,
          nameKey: definition.nameKey,
          flags: { sway: !!definition.sway, bob: !!definition.bob, flicker: !!definition.flicker, glow: !!definition.glow }
        }, missing);
      });

      function walk(value, path, group) {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
          value.forEach(function (item, index) { walk(item, path + '[' + index + ']', group); });
          return;
        }
        Object.keys(value).forEach(function (key) {
          var next = path ? path + '.' + key : key;
          var item = value[key];
          if ((key === 'sprite' || key === 'spriteId' || key === 'portraitId' || key === 'icon') && typeof item === 'string') {
            var itemGroup = key === 'portraitId' || key === 'icon' ? 'ui' : (group || 'content');
            addRef(refs, item, {
              group: itemGroup,
              regionId: rid,
              sourceRef: 'region.' + rid + '.' + next,
              strictAsset: key !== 'icon'
            }, missing);
          }
          var nextGroup = group;
          if (key === 'exploration') nextGroup = 'exploration';
          if (key === 'hazards' || key === 'hazardProfiles') nextGroup = 'hazard';
          walk(item, next, nextGroup);
        });
      }
      walk(region.exploration, 'exploration', 'exploration');
    });
  }

  function collectContent(refs, missing) {
    if (!Game.content || !Game.content.all) return;
    var types = Game.contentSchemas && Array.isArray(Game.contentSchemas.definitionTypes)
      ? Game.contentSchemas.definitionTypes.slice() : [];
    function groupFor(type, key) {
      if (type === 'actorArchetype' || type === 'class') {
        return key === 'portraitId' || key === 'icon' ? 'ui' : 'unit';
      }
      if (key === 'portraitId' || key === 'icon' || /icon$/i.test(key)) return 'ui';
      if (/sprite/i.test(key)) return type === 'hazardVisualProfile' ? 'effects' : 'content';
      return 'ui';
    }
    function walk(definition, value, path, type) {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(function (item, index) { walk(definition, item, path + '[' + index + ']', type); });
        return;
      }
      Object.keys(value).forEach(function (key) {
        var item = value[key];
        var next = path ? path + '.' + key : key;
        if (typeof item === 'string' && (/sprite/i.test(key) || key === 'portraitId' || /icon$/i.test(key))) {
          addRef(refs, item, {
            group: groupFor(type, key),
            sourceRef: type + '.' + definition.id + '.' + next,
            nameKey: definition.nameKey || value.nameKey,
            strictAsset: key !== 'icon'
          }, missing);
        }
        walk(definition, item, next, type);
      });
    }
    types.forEach(function (type) {
      Game.content.all(type).forEach(function (definition) {
        walk(definition, definition, '', type);
      });
    });
  }

  function motionAudit(spriteId) {
    if (!Game.assets || !Game.assets.resolveMotion) return null;
    var out = {};
    MOTION_STATES.forEach(function (state) {
      out[state] = {};
      DIRECTIONS.forEach(function (direction) {
        out[state][direction] = Game.assets.resolveMotion(spriteId, {
          state: state, direction: direction, time: 0.37
        });
      });
    });
    return out;
  }

  function assetItems(refs) {
    return (Game.assets && Game.assets.catalog ? Game.assets.catalog() : []).map(function (asset) {
      var ref = refs[asset.id] || { groups: [], regions: [], sourceRefs: [], flags: {}, names: [] };
      var groups = ref.groups.slice();
      if (!groups.length) groups.push(asset.id.indexOf('icon_') === 0 || asset.id.indexOf('face_') === 0 ? 'ui' : 'other');
      return {
        key: 'asset:' + asset.id,
        kind: 'asset',
        id: asset.id,
        spriteId: asset.id,
        group: groups[0],
        groups: groups,
        regions: ref.regions.slice().sort(),
        sourceRefs: ref.sourceRefs.slice().sort(),
        flags: clone(ref.flags),
        name: t(ref.names[0], asset.id),
        nameKey: ref.names[0] || null,
        frameNames: asset.frameNames,
        width: asset.width,
        height: asset.height,
        anchor: asset.anchor,
        source: asset.source,
        variantOf: asset.variantOf,
        placeholder: asset.placeholder,
        motion: groups.indexOf('unit') >= 0 ? motionAudit(asset.id) : null
      };
    });
  }

  function effectItems() {
    var out = [];
    catalogFxMethods().forEach(function (item) {
      item.preview = Game.fx && Game.fx.previewInfo ? Game.fx.previewInfo(item.id) : { mode: 'catalog', duration: 1 };
      out.push(item);
    });
    if (Game.particles && Game.particles.catalog) {
      Game.particles.catalog().forEach(function (item) {
        var particle = Object.assign({}, clone(item), {
          key: 'particle:' + item.id,
          kind: 'particle',
          group: 'effects',
          particleKind: item.kind || null
        });
        particle.preview = Game.particles.previewInfo ? Game.particles.previewInfo(item.id) : { mode: 'catalog', duration: 1 };
        out.push(particle);
      });
    }
    if (Game.mapIcons && Array.isArray(Game.mapIcons.types)) {
      Game.mapIcons.types.forEach(function (id) {
        out.push({ key: 'map-icon:' + id, kind: 'map-icon', id: id, group: 'ui', name: id, sourceRefs: ['Game.mapIcons'] });
      });
    }
    if (Game.actionBubbles && Game.actionBubbles.types) {
      Game.actionBubbles.types().forEach(function (item) {
        out.push({
          key: 'bubble:' + item.id, kind: 'bubble', id: item.id, group: 'effects', name: item.id,
          sourceRefs: ['Game.actionBubbles'],
          preview: Game.render && Game.render.drawBubblePreview
            ? { mode: 'production', duration: item.duration }
            : { mode: 'catalog', duration: item.duration }
        });
      });
    }
    return out;
  }

  function fxOrder(id) {
    var index = FX_METHOD_ORDER.indexOf(id);
    return index < 0 ? 1000 : index;
  }

  function enumerateFxMethods() {
    if (!Game.fx) return [];
    return Object.keys(Game.fx).filter(function (id) {
      return !FX_INTERNAL_METHODS[id] && typeof Game.fx[id] === 'function';
    }).sort(function (a, b) {
      var oa = fxOrder(a), ob = fxOrder(b);
      return oa === ob ? a.localeCompare(b) : oa - ob;
    });
  }

  function catalogFxMethods() {
    return enumerateFxMethods().map(function (id) {
      return { key: 'fx:' + id, kind: 'effect', id: id, group: 'effects', name: id, sourceRefs: ['Game.fx.' + id] };
    });
  }

  function materialItems(regions) {
    var byMaterial = {};
    regions.forEach(function (region) {
      var terrain = region.terrain || {};
      var values = [terrain.base].concat(terrain.patches || [], terrain.road || []);
      values.forEach(function (entry) {
        if (!entry || typeof entry !== 'object' || !entry.mat) return;
        var item = byMaterial[entry.mat] || (byMaterial[entry.mat] = {
          key: 'material:' + entry.mat, kind: 'material', id: entry.mat, group: 'terrain',
          regions: [], colors: [], sourceRefs: []
        });
        if (item.regions.indexOf(region.id) < 0) item.regions.push(region.id);
        var sourceRef = 'region.' + region.id + '.terrain';
        if (item.sourceRefs.indexOf(sourceRef) < 0) item.sourceRefs.push(sourceRef);
        if (!item.colors.length && entry.colors && entry.colors.length) item.colors = clone(entry.colors);
      });
    });
    return Object.keys(byMaterial).sort().map(function (id) {
      var item = byMaterial[id];
      item.regions.sort();
      item.sourceRefs.sort();
      return item;
    });
  }

  var API = Game.visualCatalog = {
    motionStates: function () { return MOTION_STATES.slice(); },
    directions: function () { return DIRECTIONS.slice(); },
    snapshot: function (options) {
      options = options || {};
      var regions = regionList();
      var refs = {};
      var missingRefs = [];
      collectRegions(refs, regions, missingRefs);
      collectContent(refs, missingRefs);
      var assets = assetItems(refs);
      var effects = effectItems();
      var materials = materialItems(regions);
      var items = assets.concat(materials, effects);
      var issues = missingRefs.map(function (item) {
        var issue = clone(item);
        delete issue.key;
        return issue;
      });
      assets.forEach(function (item) {
        if (item.placeholder && item.id !== 'actor_placeholder') issues.push({ code: 'placeholder', id: item.id });
        if (item.group === 'unit' && !item.motion) issues.push({ code: 'motion-unavailable', id: item.id });
      });
      var filtered = options.regionId
        ? items.filter(function (item) { return !item.regions || !item.regions.length || item.regions.indexOf(options.regionId) >= 0; })
        : items;
      var counts = {};
      filtered.forEach(function (item) { counts[item.group] = (counts[item.group] || 0) + 1; });
      return {
        regions: regions.map(function (region) { return { id: region.id, name: t(region.nameKey, region.id) }; }),
        assets: filtered,
        items: filtered,
        counts: counts,
        issues: issues,
        totalAssets: assets.length,
        totalItems: items.length
      };
    }
  };

  // Keep effect enumeration available even when the broader catalog is not loaded.
  if (Game.fx && !Game.fx.catalog) Game.fx.catalog = catalogFxMethods;
})();
