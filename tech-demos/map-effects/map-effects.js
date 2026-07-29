/* global Game, DemoI18n */
(function () {
  'use strict';

  var U = Game.util;
  var D = DemoI18n;
  var regions = [];
  var currentIndex = 0;
  var paused = false;
  var timeMode = 'cycle';
  var lastFrame = performance.now();
  var lastRuntimeUpdate = 0;
  var qaRestoreAuto = false;
  var explorationMessage = '';
  var hazardMessage = '';

  function tr(key, vars) { return D.t('map.inspector.' + key, vars); }

  function idName(group, id) {
    var key = 'map.inspector.' + group + '.' + id;
    var value = D.t(key);
    return value === key ? id : value;
  }

  function esc(value) { return U.esc(String(value)); }
  function regionName(region) { return Game.i18n.t('region.' + region.id + '.name'); }
  function contentName(item) {
    if (!item) return tr('none');
    var fallback = item.defId || item.id || tr('none');
    if (!item.nameKey) return fallback;
    var value = Game.i18n.t(item.nameKey);
    return value === item.nameKey ? fallback : value;
  }
  function materialName(id) {
    var key = 'material.' + id;
    var value = Game.i18n.t(key);
    return value === key ? idName('material', id) : value;
  }
  function monsterName(id) {
    var key = 'monster.' + id + '.name';
    var value = Game.i18n.t(key);
    return value === key ? id : value;
  }
  function unique(values) {
    return values.filter(function (value, index) { return values.indexOf(value) === index; });
  }
  function range(values, digits) {
    if (!values.length) return tr('none');
    var min = Math.min.apply(Math, values), max = Math.max.apply(Math, values);
    var format = function (value) { return digits === undefined ? String(value) : value.toFixed(digits); };
    return format(min) + (min === max ? '' : '–' + format(max));
  }

  function queryParams() {
    try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(); }
  }

  function parseSeed(value) {
    value = String(value || '').trim();
    if (!/^[0-9a-f]{1,8}$/i.test(value)) return null;
    return parseInt(value, 16) >>> 0;
  }

  function updateUrl(regionId) {
    if (location.protocol === 'file:') return;
    var url = new URL(location.href);
    url.searchParams.set('seed', U.hex32(Game.state.world.worldSeed));
    url.searchParams.set('region', regionId);
    url.searchParams.set('lang', D.locale());
    history.replaceState(null, '', url.href);
  }

  function trait(label, cls) {
    return '<span class="trait' + (cls ? ' ' + cls : '') + '">' + esc(label) + '</span>';
  }

  function inspectorAttrs(kind, id) {
    return (kind ? ' data-inspector-kind="' + esc(kind) + '"' : '') +
      (id ? ' data-inspector-id="' + esc(id) + '"' : '');
  }

  function spriteRow(sprite, name, traits, kind, id) {
    return '<div class="sprite-row"' + inspectorAttrs(kind, id) + '>' +
      '<canvas class="sprite-preview" width="40" height="40" data-sprite="' + esc(sprite) + '"></canvas>' +
      '<div class="sprite-copy"><strong>' + esc(name) + '</strong><small>' + esc(sprite) + '</small></div>' +
      '<div class="trait-list">' + traits + '</div></div>';
  }

  function configRow(label, value, raw, kind, id, runtimeField) {
    return '<div class="config-row"' + inspectorAttrs(kind, id) + '><span>' + esc(label) + '</span><div>' +
      '<span class="config-value"' + (runtimeField ? ' data-inspector-runtime="' + esc(runtimeField) + '"' : '') + '>' + esc(value) + '</span>' +
      (raw ? '<div class="raw-id">' + esc(raw) + '</div>' : '') + '</div></div>';
  }

  function metric(value, label, id) {
    return '<div class="metric"><strong' + (id ? ' id="' + id + '"' : '') + '>' + esc(value) +
      '</strong><span>' + esc(label) + '</span></div>';
  }

  function catalogGroup(title, rows, kind) {
    return '<div class="catalog-group" data-inspector-group="' + esc(kind) + '"><h4>' + esc(title) +
      '</h4><div class="sprite-list">' + rows + '</div></div>';
  }

  function translatedGameValue(key, fallback) {
    var value = Game.i18n.t(key);
    return value === key ? fallback : value;
  }

  function renderTabs() {
    document.getElementById('region-tabs').innerHTML = regions.map(function (region, index) {
      return '<button class="region-tab' + (index === currentIndex ? ' active' : '') + '" type="button" data-region-index="' + index + '"' +
        (index === currentIndex ? ' aria-current="page"' : '') + '><small>' + String(index + 1).padStart(2, '0') +
        ' / ' + esc(tr('tier').toUpperCase()) + ' ' + region.tier + '</small>' + esc(regionName(region)) + '</button>';
    }).join('');
  }

  function renderInspector(region) {
    var layout = Game.world.layout;
    var report = Game.terrain.validate(layout, region);
    var metrics = report.metrics;
    var cfg = region.exploration;
    var props = layout.props || [];
    var blockerProps = props.filter(function (item) { return item.blockerProp; }).length;
    var ai = Game.expeditionAI.intent();
    var expedition = Game.expedition.current(region.id);
    var modifiers = Game.expedition.currentModifier(region.id);
    var summary = Game.collection.regionSummary(region.id);
    var ready = summary.readiness;
    var activeEcology = expedition.activeEcology || [];
    var resourceRows = cfg.resources.map(function (def) {
      var nodes = layout.nodes.filter(function (node) { return node.defId === def.id; });
      var cooldowns = nodes.map(function (node) { return node.cooldown; });
      return spriteRow(def.sprite, materialName(def.material),
        trait(tr('count') + ' ' + nodes.length) +
        trait(tr('cooldown') + ' ' + range(cooldowns) + ' ' + tr('seconds')) +
        trait(def.rarity === 'rare' ? tr('rare') : tr('common'), def.rarity === 'rare' ? 'accent' : ''),
        'resource', def.id);
    }).join('');
    var landmarkRows = layout.landmarks.map(function (item) {
      var role = item.bossLair ? 'boss' : item.function;
      return spriteRow(item.sprite, contentName(item), trait(idName('function', role), item.bossLair ? 'boss' : ''),
        'landmark', item.defId);
    }).join('');
    var curioRows = layout.curios.map(function (item) {
      var choices = (item.choices || []).map(function (id) {
        return translatedGameValue('explore.curio.' + id, id);
      }).join(' / ');
      return spriteRow(item.sprite, contentName(item), trait(tr('choices') + ' ' + choices), 'curio', item.defId);
    }).join('');
    var ecologyRows = layout.ecology.map(function (item) {
      var active = activeEcology.indexOf(item.defId) >= 0;
      return spriteRow(item.sprite, contentName(item), trait(active ? tr('active') : tr('inactive'), active ? 'accent' : ''),
        'ecology', item.defId);
    }).join('');
    var threatBuckets = {};
    layout.threats.forEach(function (item) {
      (threatBuckets[item.defId] = threatBuckets[item.defId] || []).push(item);
    });
    var threatRows = Object.keys(threatBuckets).map(function (id) {
      var bucket = threatBuckets[id];
      var affixes = unique(bucket.map(function (item) {
        return expedition.threatAffixes[item.id] || item.affix;
      }));
      var monsterIds = unique(bucket.map(function (item) { return item.monster; }));
      var details = tr('count') + ' ' + bucket.length + ' · ' + tr('danger') + ' ' +
        range(bucket.map(function (item) { return item.danger; }), 2) + ' · ' + tr('radius') + ' ' +
        range(bucket.map(function (item) { return item.radius; })) + ' px · ' + tr('affixes') + ' ' +
        affixes.map(function (affix) { return idName('affix', affix); }).join(', ') + ' · ' +
        tr('monsterSet') + ' ' + monsterIds.map(monsterName).join(', ');
      return configRow(contentName(bucket[0]), details,
        bucket.map(function (item) { return item.id; }).join(', '), 'threat', id);
    }).join('');
    var guardian = layout.guardian;
    var guardianRows = spriteRow(guardian.sprite || 'exp_guardian_mark', contentName(guardian),
      trait(tr('guardian'), 'accent') + trait(monsterName(guardian.monster)), 'guardian', guardian.id);

    var materialIds = unique([region.terrain.base.mat].concat(region.terrain.patches.map(function (patch) { return patch.mat; })));
    var decorRows = region.terrain.deco.map(function (def) {
      var actual = props.filter(function (prop) { return prop.sprite === def.sprite && !prop.campProp; }).length;
      return spriteRow(def.sprite, def.sprite,
        trait(tr('actual') + ' ' + actual, actual ? 'accent' : 'boss') +
        trait(tr('configured') + ' ' + def.count) + trait(idName('role', def.placement)),
        'decoration', def.sprite);
    }).join('');
    var parallaxRows = region.parallax.map(function (layer, index) {
      return configRow(idName('parallax', layer.type), '×' + layer.factor,
        layer.type + (layer.y === undefined ? '' : ' / y ' + layer.y), 'parallax', String(index));
    }).join('');

    var monsterRows = region.monsters.map(function (id) {
      var def = Game.reg.get('monster', id);
      return spriteRow(def && def.sprite || id, monsterName(id), trait(tr('monster')), 'monster', id);
    }).join('') + spriteRow(region.boss, monsterName(region.boss), trait(tr('boss'), 'boss'), 'boss', region.boss);
    var regionProfile = Game.content.get('regionProfile', region.id);
    var population = regionProfile &&
      Game.content.populationView(regionProfile.populationProfileId);
    var populationRows = population ? Object.keys(population.channels).sort().map(function (channel) {
      var definition = population.channels[channel];
      var refs = definition.spawnRefs.map(function (entry) {
        return entry.profileId + ' [' + entry.mode + ']';
      });
      return configRow(
        channel,
        refs.join(' / ') || tr('none'),
        tr('capacity') + ' ' + definition.capacity + ' / ' +
          tr('selection') + ' ' + definition.selection,
        'population-channel',
        channel
      );
    }).join('') : configRow(tr('population'), tr('none'));
    var mountPlan = Game.population.mountPlan();
    if (mountPlan && mountPlan.regionId !== region.id) mountPlan = null;
    var mountPlanRows = mountPlan ? configRow(
      mountPlan.populationId,
      tr('reservations') + ' ' + mountPlan.reservations.length + ' / ' +
        tr('failures') + ' ' + mountPlan.failures.length,
      tr('layout') + ' v' + mountPlan.layoutVersion + ' / ' + mountPlan.contentFingerprint,
      'population-mount-plan', mountPlan.populationId
    ) : configRow(tr('mountPlan'), tr('none'));
    var reservationRows = mountPlan && mountPlan.reservations.length
      ? mountPlan.reservations.map(function (reservation) {
        var slot = mountPlan.slots.filter(function (entry) {
          return entry.id === reservation.slotId;
        })[0];
        var runtime = mountPlan.runtime && mountPlan.runtime[reservation.slotId];
        return configRow(
          slot && slot.profileId || reservation.slotId,
          (slot && slot.layoutSlotKey || tr('none')) + ' @ ' +
            Math.round(reservation.x) + ', ' + Math.round(reservation.y),
          (slot && slot.channel || tr('none')) + ' / ' +
            (runtime && runtime.state || 'planned') + ' / ' +
            tr('radius') + ' ' + reservation.occupancyRadius,
          'population-reservation', reservation.slotId
        );
      }).join('') : configRow(tr('reservations'), tr('none'));
    var failureRows = mountPlan && mountPlan.failures.length
      ? mountPlan.failures.map(function (failure) {
        return configRow(
          failure.profileId,
          failure.reason,
          failure.channel + ' / ' + failure.onFailure,
          'population-failure', failure.profileId + ':' + failure.ordinal
        );
      }).join('') : configRow(tr('failures'), tr('none'));
    var respawnRows = mountPlan && mountPlan.respawnSchedules.length
      ? mountPlan.respawnSchedules.map(function (schedule) {
        var timing = schedule.mode === 'worldTime'
          ? schedule.eligibleAtWorldTime
          : Math.max(0, schedule.remaining).toFixed(1) + 's';
        return configRow(
          schedule.profileId,
          schedule.spawnId + ' @' + schedule.generation,
          schedule.mode + ' / ' + timing,
          'population-respawn', schedule.spawnId
        );
      }).join('') : configRow(tr('respawns'), tr('none'));
    var leaseRows = Game.population.leases().filter(function (lease) {
      return lease.context && lease.context.regionId === region.id;
    }).map(function (lease) {
      return configRow(
        lease.profileId,
        lease.spawnId + ' @' + lease.generation,
        lease.actorIds.join(', '),
        'spawn-lease',
        lease.spawnId
      );
    }).join('') || configRow(tr('leases'), tr('none'));

    var anomalyNames = expedition.anomalies.map(function (id) { return idName('anomaly', id); });
    var activeEcologyNames = activeEcology.map(function (id) {
      var item = layout.ecology.filter(function (entry) { return entry.defId === id; })[0];
      return item ? contentName(item) : id;
    });
    var modifierText = Object.keys(modifiers).map(function (key) {
      return key + ' ×' + Number(modifiers[key]).toFixed(2);
    }).join(' · ');
    var readinessText = tr('coverage') + ' ' + ready.exploration + ' · ' + tr('landmarks') + ' ' + ready.landmarks +
      ' · ' + tr('resources') + ' ' + ready.resources + ' · ' + tr('curios') + ' ' + ready.curios +
      ' · ' + tr('guardian') + ' ' + ready.guardian;
    var strategyName = translatedGameValue('explore.strategy.' + Game.expeditionAI.strategy(), Game.expeditionAI.strategy());
    var intentName = translatedGameValue('explore.intent.' + ai.id, ai.id) + (ai.reason ? ' / ' + ai.reason : '');

    document.getElementById('inspector').innerHTML =
      '<div class="inspector-header"><h2>' + esc(regionName(region)) + '</h2><p>' + esc(Game.i18n.t('region.' + region.id + '.desc')) + '</p></div>' +
      '<div class="metric-grid">' +
        metric(report.valid ? tr('pass') : tr('fail'), tr('valid')) +
        metric((metrics.walkableRatio * 100).toFixed(1) + '%', tr('walkable')) +
        metric(metrics.macroCenters, tr('centers')) +
        metric(metrics.loopRank, tr('loops')) +
        metric(layout.nodes.length, tr('resources'), 'inspector-node-count') +
        metric(props.length, tr('props')) +
      '</div>' +
      '<section class="inspect-section"><h3>' + esc(tr('generation')) + '</h3><div class="row-list">' +
        configRow(tr('world'), layout.world.w + ' × ' + layout.world.h + ' px', 'layout v' + layout.version) +
        configRow(tr('connected'), metrics.connectedCells + ' / ' + (layout.nav.w * layout.nav.h), 'ratio ' + metrics.connectedRatio) +
        configRow(tr('centers') + ' / ' + tr('edges'), metrics.macroCenters + ' / ' + metrics.macroEdges) +
        configRow(tr('loops') + ' / ' + tr('alternate'), metrics.loopRank + ' / ' + metrics.alternateRoutes) +
        configRow(tr('clearance'), metrics.minClearancePx + ' px') +
        configRow(tr('chunks'), layout.chunks.length + ' × 512 px') +
        configRow(tr('attempts'), layout.generation.attempts) +
        configRow(tr('repairs'), layout.generation.repairs.length ? layout.generation.repairs.join(', ') : tr('none')) +
        configRow(tr('fallback'), layout.generation.fallback || tr('none')) +
      '</div><p class="note">' + esc(tr('generationNote')) + '</p></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('content')) + '</h3><div class="metric-grid compact">' +
        metric(layout.landmarks.length, tr('landmarks')) + metric(layout.curios.length, tr('curios')) +
        metric(layout.ecology.length, tr('ecology')) + metric(layout.threats.length, tr('threats')) +
        metric(layout.guardian ? 1 : 0, tr('guardian')) + metric(blockerProps, tr('blockers')) +
      '</div>' + catalogGroup(tr('landmarks'), landmarkRows, 'landmarks') +
        catalogGroup(tr('curios'), curioRows, 'curios') + catalogGroup(tr('ecology'), ecologyRows, 'ecology') +
        catalogGroup(tr('threats'), threatRows, 'threats') + catalogGroup(tr('guardian'), guardianRows, 'guardian') +
        '<p class="note">' + esc(tr('contentNote')) + '</p></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('resourceCatalog')) + '</h3><div class="sprite-list">' + resourceRows + '</div></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('theme')) + '</h3><div class="row-list">' +
        configRow(tr('macroPreset'), idName('preset', layout.preset), layout.preset, 'theme-field', 'macro-preset') +
        configRow(tr('blockerTheme'), idName('preset', cfg.blockerTheme), cfg.blockerTheme, 'theme-field', 'blocker-theme') +
        configRow(tr('baseMaterial'), materialName(region.terrain.base.mat), region.terrain.base.mat, 'theme-field', 'base-material') +
        configRow(tr('terrainMaterials'), materialIds.map(materialName).join(' / '), materialIds.join(', '), 'theme-field', 'materials') +
        configRow(tr('particle'), idName('particle', region.particles), region.particles, 'theme-field', 'particle') +
        configRow(tr('parallax'), region.parallax.length) + configRow(tr('tufts'), layout.tufts.length) +
        configRow(tr('flowers'), layout.flowers.length) + '</div>' +
        catalogGroup(tr('decorations'), decorRows, 'decorations') + catalogGroup(tr('parallax'), parallaxRows, 'parallax') + '</section>' +
      '<section class="inspect-section"><h3>' + esc(tr('combat')) + '</h3><div class="sprite-list">' + monsterRows + '</div></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('population')) + '</h3><div class="row-list">' +
        populationRows + '</div><h3>' + esc(tr('mountPlan')) + '</h3><div class="row-list">' +
        mountPlanRows + '</div><h3>' + esc(tr('reservations')) + '</h3><div class="row-list">' +
        reservationRows + '</div><h3>' + esc(tr('failures')) + '</h3><div class="row-list">' +
        failureRows + '</div><h3>' + esc(tr('respawns')) + '</h3><div class="row-list">' +
        respawnRows + '</div><h3>' + esc(tr('leases')) + '</h3><div class="row-list">' +
        leaseRows + '</div></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('expedition')) + '</h3><div class="row-list">' +
        configRow(tr('expeditionIndex'), expedition.index) + configRow(tr('expeditionSeed'), U.hex32(expedition.seed), String(expedition.seed)) +
        configRow(tr('anomalies'), anomalyNames.join(' / ') || tr('none'), expedition.anomalies.join(', '), 'anomaly', 'active') +
        configRow(tr('ecology'), activeEcologyNames.join(' / ') || tr('none'), activeEcology.join(', '), 'active-ecology', 'active') +
        configRow(tr('modifiers'), modifierText) + '</div></section>' +
      '<section class="inspect-section"><h3>' + esc(tr('qa')) + '</h3><div class="row-list">' +
        configRow(tr('seed'), U.hex32(layout.worldSeed)) + configRow(tr('layout'), 'v' + layout.version) +
        configRow(tr('strategy'), strategyName, Game.expeditionAI.strategy(), null, null, 'strategy') +
        configRow(tr('intent'), intentName, ai.id, null, null, 'intent') +
        configRow(tr('coverage'), (ready.coverage * 100).toFixed(1) + '%', null, null, null, 'coverage') +
        configRow(tr('readiness'), ready.total.toFixed(0) + ' / 100', readinessText, null, null, 'readiness') +
        configRow(tr('complete'), summary.complete ? tr('yes') : tr('no'), null, null, null, 'complete') + '</div></section>';

    Array.prototype.forEach.call(document.querySelectorAll('.sprite-preview'), function (canvas) {
      Game.assets.drawToDom(canvas, canvas.getAttribute('data-sprite'), 'idle0');
    });
  }

  function setInspectorRuntime(field, value) {
    var node = document.querySelector('[data-inspector-runtime="' + field + '"]');
    if (node) node.textContent = value;
  }

  function setExplorationEvent(message) {
    explorationMessage = message;
    document.getElementById('exploration-event').textContent = message;
  }

  function hazardName(instance) {
    if (!instance || !instance.profile) return '—';
    return translatedGameValue(instance.profile.presentation.nameKey, instance.profileId);
  }

  function selectedHazard() {
    var select = document.getElementById('hazard-select');
    return select ? Game.hazards.get(select.value) : null;
  }

  function hazardShape(instance) {
    if (!instance) return '—';
    var trigger = instance.profile.trigger;
    var size = trigger.shape === 'circle'
      ? 'r' + trigger.radius
      : [trigger.width || trigger.length || 0, trigger.height || trigger.radius || 0].join('x');
    var degrees = Math.round(((instance.orientation * 180 / Math.PI) % 360 + 360) % 360);
    return trigger.shape + ' ' + size + ' / ' + degrees + '°';
  }

  function hazardDiagnostics() {
    return Game.hazards.all().map(function (instance) {
      var snapshot = Game.hazards.snapshot().filter(function (item) { return item.id === instance.id; })[0];
      return Object.assign({}, snapshot, {
        category: instance.profile.category,
        name: hazardName(instance),
        trigger: instance.profile.trigger,
        lifecycle: instance.profile.lifecycle,
        navigationCost: {
          safe: Game.hazards.navigationCost(instance.x, instance.y, 'safe'),
          balanced: Game.hazards.navigationCost(instance.x, instance.y, 'balanced'),
          loot: Game.hazards.navigationCost(instance.x, instance.y, 'loot')
        }
      });
    });
  }

  function refreshHazardSelect() {
    var select = document.getElementById('hazard-select');
    if (!select) return;
    var previous = select.value;
    var hazards = Game.hazards.all();
    select.innerHTML = '';
    hazards.forEach(function (instance, index) {
      var option = document.createElement('option');
      option.value = instance.id;
      option.textContent = hazardName(instance) + ' · ' + instance.profile.category + ' · ' + (index + 1);
      select.appendChild(option);
    });
    if (hazards.some(function (instance) { return instance.id === previous; })) select.value = previous;
  }

  function setHazardEvent(message) {
    hazardMessage = message;
    document.getElementById('hazard-event').textContent = message;
  }

  function updateHazardRuntime() {
    var instance = selectedHazard();
    if (!instance) {
      ['hazard-state', 'hazard-shape', 'hazard-cooldown', 'hazard-costs'].forEach(function (id) {
        document.getElementById(id).textContent = '—';
      });
      document.getElementById('hazard-events').textContent = '[]';
      return;
    }
    document.getElementById('hazard-state').textContent = instance.awareness + ' / ' + instance.phase;
    document.getElementById('hazard-shape').textContent = hazardShape(instance);
    document.getElementById('hazard-cooldown').textContent = instance.phase === 'cooldown'
      ? Math.max(0, instance.cooldownUntilWorldTime - Game.state.world.worldTime).toFixed(1) + 's'
      : '—';
    document.getElementById('hazard-costs').textContent = ['safe', 'balanced', 'loot'].map(function (strategy) {
      return strategy.charAt(0).toUpperCase() + ':' + Game.hazards.navigationCost(instance.x, instance.y, strategy);
    }).join(' / ');
    document.getElementById('hazard-events').textContent = JSON.stringify(
      Game.hazards.events().filter(function (event) { return event.instanceId === instance.id; }).slice(-8), null, 2);
    if (!hazardMessage) setHazardEvent(hazardName(instance) + ' · ' + instance.profile.category);
  }

  function focusHazard() {
    var instance = selectedHazard();
    if (!instance) return false;
    prepareQaTarget();
    setHeroPosition(instance.x, instance.y);
    Game.hazards.update(.05);
    setHazardEvent(D.t('map.hazardFocused') + ' · ' + hazardName(instance));
    updateHazardRuntime();
    return true;
  }

  function triggerHazard() {
    var instance = selectedHazard();
    if (!instance) return false;
    if (instance.phase !== 'dormant') {
      setHeroPosition(Game.world.layout.camp.x + 24, Game.world.layout.camp.y + 18);
      Game.hazards.update(.05);
      if (!Game.hazards.resetInstance(instance.id)) {
        setHazardEvent(D.t('map.hazardLocked'));
        return false;
      }
    }
    prepareQaTarget();
    setHeroPosition(instance.x, instance.y);
    Game.hazards.update(.05);
    var triggered = instance.phase === 'warning' || Game.hazards.forceTrigger(instance.id, Game.world.hero.id);
    setHazardEvent((triggered ? D.t('map.hazardTriggered') : D.t('map.hazardLocked')) + ' · ' + hazardName(instance));
    updateHazardRuntime();
    return triggered;
  }

  function stepHazard() {
    paused = true;
    syncPauseUi();
    var steps = Game.hazards.update(.05);
    updateHazardRuntime();
    return steps;
  }

  function resetHazard() {
    var instance = selectedHazard();
    if (!instance) return false;
    setHeroPosition(Game.world.layout.camp.x + 24, Game.world.layout.camp.y + 18);
    Game.hazards.update(.05);
    var reset = Game.hazards.resetInstance(instance.id);
    setHazardEvent((reset ? D.t('map.hazardReset') : D.t('map.hazardLocked')) + ' · ' + hazardName(instance));
    updateHazardRuntime();
    return reset;
  }

  function prepareQaTarget() {
    var hero = Game.world.hero;
    if (!hero) return;
    qaRestoreAuto = qaRestoreAuto || Game.world.controlMode() === 'auto';
    Game.world.cancelInteraction('qa-target');
    if (Game.world.controlMode() === 'auto') Game.world.setControlMode('manual');
    hero.target = null;
    hero.manualTarget = false;
    hero.moveOrder = null;
    hero.state = 'idle';
    Game.world.entities.forEach(function (entity) { if (entity.kind === 'monster') entity.engaged = false; });
    Game.nav.clear(hero);
  }

  function restoreAutoAfterQa() {
    if (!qaRestoreAuto) return;
    qaRestoreAuto = false;
    Game.world.setControlMode('auto');
  }

  function setHeroPosition(x, y) {
    var hero = Game.world.hero;
    if (!hero) return;
    var point = Game.terrain.projectPoint(x, y, 1) || Game.world.layout.camp;
    Game.world.cancelInteraction('qa-focus');
    hero.x = U.clamp(point.x, 24, Game.world.layout.world.w - 24);
    hero.y = U.clamp(point.y, Game.world.BOUND_TOP + 8, Game.world.layout.world.h - 24);
    hero.target = null;
    hero.moveOrder = null;
    hero.manualTarget = false;
    hero.state = 'idle';
    Game.nav.clear(hero);
    Game.exploration.revealAt(hero.x, hero.y, { force: true, rid: Game.world.region.id });
    Game.render.snapCamera(hero.x, hero.y);
  }

  function focusReadyNode() {
    var hero = Game.world.hero;
    var nodes = Game.world.layout.nodes.filter(function (node) { return Game.environment.nodeReady(node); });
    if (!nodes.length) { setExplorationEvent(tr('noReady')); return; }
    prepareQaTarget();
    var node = nodes.reduce(function (best, candidate) {
      return !best || U.dist(hero.x, hero.y, candidate.x, candidate.y) < U.dist(hero.x, hero.y, best.x, best.y) ? candidate : best;
    }, null);
    setHeroPosition(node.x - 32, node.y + 6);
    Game.exploration.revealAt(node.x, node.y, { force: true, rid: Game.world.region.id });
    setExplorationEvent(tr('focused') + ' · ' + materialName(node.material));
  }

  function revealAllResources() {
    Game.world.layout.nodes.forEach(function (node) {
      Game.state.world.nodeCooldowns[node.id] = 0;
      Game.exploration.revealAt(node.x, node.y, { force: true, rid: Game.world.region.id });
    });
    setExplorationEvent(tr('revealed') + ' · ' + Game.world.layout.nodes.length);
  }

  function spawnQaChest(rare) {
    if (Game.world.bossEnt) { setExplorationEvent(tr('bossBlocks')); return null; }
    prepareQaTarget();
    Game.environment.resetRegion();
    var originalChance = U.chance;
    var chest = null;
    U.chance = function () { return !!rare; };
    try {
      chest = Game.environment.spawnChest();
      if (!chest) {
        var candidates = Game.world.layout.spawnCandidates.slice(0, 16);
        for (var i = 0; i < candidates.length && !chest; i++) {
          setHeroPosition(candidates[i].x, candidates[i].y);
          chest = Game.environment.spawnChest();
        }
      }
    } finally { U.chance = originalChance; }
    if (!chest) {
      restoreAutoAfterQa();
      setExplorationEvent(tr('spawnFailed'));
      return null;
    }
    Game.exploration.revealAt(chest.x, chest.y, { force: true, rid: Game.world.region.id });
    Game.render.snapCamera(Game.world.hero.x, Game.world.hero.y);
    setExplorationEvent(tr('spawned') + ' ' + (rare ? tr('rareChest') : tr('commonChest')) + ' · ' + tr('clickOpen'));
    return chest;
  }

  function updateRuntime(force) {
    if (!Game.world.layout) return;
    var now = performance.now();
    if (!force && now - lastRuntimeUpdate < 200) return;
    lastRuntimeUpdate = now;
    var nodes = Game.world.layout.nodes;
    var ready = nodes.filter(function (node) { return Game.environment.nodeReady(node); }).length;
    var readiness = Game.exploration.readiness(Game.world.region.id);
    var intent = Game.expeditionAI.intent();
    document.getElementById('gather-runtime').textContent = D.t('map.ready', { ready: ready, total: nodes.length });
    document.getElementById('discovery-runtime').textContent = readiness.total.toFixed(0) + ' / 100';
    var chest = Game.environment.chests()[0];
    document.getElementById('chest-runtime').textContent = chest
      ? (chest.rare ? tr('rareChest') : tr('commonChest')) + ' · ' + Math.max(0, Math.ceil(chest.ttl - chest.age)) + 's'
      : tr('none');
    document.getElementById('runtime-count').textContent = D.t('map.entities', { count: Game.world.entities.length });
    var area = Game.trade.areaById('qa-wanderer');
    document.getElementById('dynamic-trade-status').textContent = area
      ? tr('merchantActive') + ' · ' + Math.max(0, Math.ceil(area.expiresAt - Game.state.world.worldTime)) + 's'
      : tr('merchantExpired');
    setInspectorRuntime('strategy', translatedGameValue(
      'explore.strategy.' + Game.expeditionAI.strategy(), Game.expeditionAI.strategy()));
    setInspectorRuntime('intent', translatedGameValue('explore.intent.' + intent.id, intent.id) +
      (intent.reason ? ' / ' + intent.reason : ''));
    setInspectorRuntime('coverage', (readiness.coverage * 100).toFixed(1) + '%');
    setInspectorRuntime('readiness', readiness.total.toFixed(0) + ' / 100');
    setInspectorRuntime('complete', Game.exploration.isComplete(Game.world.region.id) ? tr('yes') : tr('no'));
    updateHazardRuntime();
  }

  function bindEvents() {
    Game.bus.on('gather:start', function (p) { setExplorationEvent(tr('gatherStart') + ' · ' + materialName(p.material)); });
    Game.bus.on('gather:done', function (p) {
      setExplorationEvent(tr('gatherDone') + ' · +' + p.count + ' ' + materialName(p.material));
      restoreAutoAfterQa();
    });
    Game.bus.on('gather:interrupted', function () { setExplorationEvent(tr('interrupted')); restoreAutoAfterQa(); });
    Game.bus.on('chest:opened', function (p) {
      setExplorationEvent(tr('chestOpened') + ' · +' + p.gold + ' ' + tr('gold'));
      restoreAutoAfterQa();
    });
    Game.bus.on('chest:expired', function () { setExplorationEvent(tr('chestExpired')); restoreAutoAfterQa(); });
  }

  function activateRegion(index) {
    currentIndex = (index + regions.length) % regions.length;
    var region = regions[currentIndex];
    qaRestoreAuto = false;
    Game.state.settings.controlMode = 'auto';
    Game.state.world.region = region.id;
    Game.state.world.layoutVersion = 3;
    Game.state.world.mode = 'battle';
    Game.state.world.deathsRow = 0;
    Game.state.player.level = 1 + Math.max(0, region.tier - 1) * 9;
    Game.state.player.exp = 0;
    Game.state.player.skills = {};
    Game.player.recalc();
    Game.state.player.hp = Game.state.derived.maxHp;
    Game.world.init(region.id);
    updateUrl(region.id);
    document.getElementById('seed-input').value = U.hex32(Game.state.world.worldSeed);
    document.getElementById('stage-index').textContent = String(currentIndex + 1).padStart(2, '0');
    document.getElementById('stage-region-name').textContent = regionName(region);
    document.getElementById('stage-region-id').textContent = 'region / ' + region.id + ' · layout v' + Game.world.layout.version;
    setExplorationEvent(regionName(region) + ' · ' + tr('regionReady') + ' · ' + Game.world.layout.nodes.length + ' ' + tr('resources'));
    renderTabs();
    renderInspector(region);
    hazardMessage = '';
    refreshHazardSelect();
    updateRuntime(true);
  }

  function setTimeMode(mode) {
    timeMode = mode;
    var dayLength = Game.F.BAL.dayLength;
    if (mode === 'day') Game.state.world.worldTime = dayLength * 0.28;
    if (mode === 'dusk') Game.state.world.worldTime = dayLength * 0.56;
    if (mode === 'night') Game.state.world.worldTime = dayLength * 0.82;
    Array.prototype.forEach.call(document.querySelectorAll('[data-time]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-time') === mode);
    });
  }

  function syncPauseUi() {
    var button = document.getElementById('toggle-play');
    button.textContent = paused ? '\u25b6' : '\u2161';
    button.title = paused ? D.t('common.resume') : D.t('common.pause');
    button.setAttribute('aria-label', button.title);
    document.getElementById('runtime-status').textContent = paused ? D.t('common.paused') : D.t('map.runtime');
  }

  function bindControls() {
    document.getElementById('region-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('[data-region-index]');
      if (button) activateRegion(Number(button.getAttribute('data-region-index')));
    });
    document.getElementById('prev-region').addEventListener('click', function () { activateRegion(currentIndex - 1); });
    document.getElementById('next-region').addEventListener('click', function () { activateRegion(currentIndex + 1); });
    document.getElementById('toggle-play').addEventListener('click', function () {
      paused = !paused;
      syncPauseUi();
    });
    document.getElementById('effects-toggle').addEventListener('change', function () { Game.particles.setEnabled(this.checked); });
    document.getElementById('spawn-dynamic-trade').addEventListener('click', function () {
      var hero = Game.world.hero;
      Game.trade.clearDynamic();
      Game.trade.registerDynamic({
        id: 'qa-wanderer', regionId: Game.world.region.id, kind: 'wander',
        x: U.clamp(hero.x + 74, 40, Game.world.layout.world.w - 40),
        y: U.clamp(hero.y + 22, Game.world.BOUND_TOP + 24, Game.world.layout.world.h - 24),
        radius: 62, catalogs: ['camp-general'], priority: 30,
        nameKey: 'tradeArea.generic', prop: { style: 'supply-cart' }
      }, { ttl: 20 });
      updateRuntime(true);
    });
    document.getElementById('focus-gather').addEventListener('click', focusReadyNode);
    document.getElementById('reset-gather').addEventListener('click', revealAllResources);
    document.getElementById('spawn-common-chest').addEventListener('click', function () { spawnQaChest(false); });
    document.getElementById('spawn-rare-chest').addEventListener('click', function () { spawnQaChest(true); });
    document.getElementById('hazard-select').addEventListener('change', function () {
      hazardMessage = '';
      updateHazardRuntime();
    });
    document.getElementById('focus-hazard').addEventListener('click', focusHazard);
    document.getElementById('trigger-hazard').addEventListener('click', triggerHazard);
    document.getElementById('step-hazard').addEventListener('click', stepHazard);
    document.getElementById('reset-hazard').addEventListener('click', resetHazard);
    document.getElementById('seed-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = document.getElementById('seed-input');
      var seed = parseSeed(input.value);
      if (seed === null) {
        input.setCustomValidity(tr('seedError'));
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      Game.state.world.worldSeed = seed;
      Game.state.world.exploration = {};
      activateRegion(currentIndex);
    });
    document.querySelector('.segmented').addEventListener('click', function (event) {
      var button = event.target.closest('[data-time]');
      if (button) setTimeMode(button.getAttribute('data-time'));
    });
    document.querySelector('.focus-actions').addEventListener('click', function (event) {
      var button = event.target.closest('[data-focus]');
      if (!button) return;
      var focus = button.getAttribute('data-focus');
      if (focus === 'camp') setHeroPosition(Game.world.layout.camp.x + 24, Game.world.layout.camp.y + 18);
      if (focus === 'center') {
        var landmark = Game.world.layout.landmarks[1] || Game.world.layout.landmarks[0];
        setHeroPosition(landmark.x - 28, landmark.y + 12);
      }
      if (focus === 'boss') setHeroPosition(Game.world.layout.bossPoint.x - 48, Game.world.layout.bossPoint.y + 12);
    });
    document.querySelector('.strategy-actions').addEventListener('click', function (event) {
      var button = event.target.closest('[data-strategy]');
      if (!button) return;
      Game.expeditionAI.setStrategy(button.getAttribute('data-strategy'));
      Array.prototype.forEach.call(document.querySelectorAll('[data-strategy]'), function (item) {
        item.classList.toggle('active', item === button);
      });
      renderInspector(Game.world.region);
    });
    window.addEventListener('keydown', function (event) {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
      if (event.key === '[') activateRegion(currentIndex - 1);
      if (event.key === ']') activateRegion(currentIndex + 1);
    });
  }

  function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!paused) {
      if (timeMode === 'cycle') Game.state.world.worldTime = (Game.state.world.worldTime + dt) % Game.F.BAL.dayLength;
      Game.terrain.update(dt);
      Game.particles.update(dt);
      Game.fx.update(dt);
      Game.world.update(dt);
      Game.trade.update();
      Game.actionBubbles.update(dt);
    }
    Game.render.frame(paused ? 0 : dt);
    updateRuntime();
    requestAnimationFrame(frame);
  }

  D.init();
  Game.content.finalize({ strict: true });
  regions = Game.reg.all('region');
  Game.ui.modals.init();
  Game.state = Game.State.newGame();
  Game.i18n.setLocale(D.locale());
  Game.state.world.layoutVersion = 3;
  var params = queryParams();
  var querySeed = parseSeed(params.get('seed'));
  if (querySeed !== null) Game.state.world.worldSeed = querySeed;
  Game.state.world.regionOrder = Game.reg.ids('region');
  Game.state.settings.autoAdvance = false;
  Game.state.settings.autoEquip = false;
  Game.state.settings.autoCampRest = false;
  Game.state.settings.groundLoot = false;
  Game.state.settings.expeditionStrategy = 'balanced';
  Game.player.setClass('fighter');
  Game.render.init(document.getElementById('stage'));
  bindControls();
  bindEvents();
  var initialId = params.get('region') || location.hash.slice(1);
  var initialIndex = regions.findIndex(function (region) { return region.id === initialId; });
  activateRegion(initialIndex >= 0 ? initialIndex : 0);
  window.MapEffectsLab = {
    hazards: hazardDiagnostics,
    select: function (id) {
      document.getElementById('hazard-select').value = id;
      updateHazardRuntime();
      return selectedHazard() && selectedHazard().id === id;
    },
    focus: focusHazard,
    trigger: triggerHazard,
    step: stepHazard,
    reset: resetHazard,
    events: function () { return Game.hazards.events(); }
  };
  window.addEventListener('demo:locale', function () {
    renderTabs();
    document.getElementById('stage-region-name').textContent = regionName(Game.world.region);
    renderInspector(Game.world.region);
    setExplorationEvent(Game.world.region.id + ' · ' + tr('regionReady'));
    hazardMessage = '';
    refreshHazardSelect();
    updateRuntime(true);
  });
  requestAnimationFrame(frame);
})();
