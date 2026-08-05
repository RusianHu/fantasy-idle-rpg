/* global Game, DemoI18n */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SLOT_IDS = Game.equipment.SLOT_IDS;
  var RARITY_IDS = Game.equipment.RARITY_IDS;
  var SOURCES = ['regular', 'rare', 'guardian', 'chest', 'nestShallow', 'nestDeep',
    'boss', 'rareChest', 'mimic', 'expedition'];
  var activeTab = 'drop';
  var currentItem = null;
  var currentGenerationTrace = null;
  var lastDropTrace = null;
  var lastResults = [];
  var sandboxLoadout = {};
  var previewScale = 4;
  var animationPhase = 0;
  var animationTimer = null;

  function tr(key, vars) { return DemoI18n.t('gearLab.' + key, vars); }
  function esc(value) { return Game.util.esc(String(value === undefined || value === null ? '' : value)); }
  function clone(value) { return Game.contentCompiler.clone(value); }
  function locale() { return DemoI18n.locale(); }
  function number(id, fallback) {
    var value = Number($(id).value);
    return Number.isFinite(value) ? value : fallback;
  }
  function clampInt(id, min, max, fallback) {
    return Game.util.clamp(Math.round(number(id, fallback)), min, max);
  }
  function parseSeed(id) {
    var raw = String($(id).value || '').replace(/^0x/i, '');
    return /^[0-9a-f]{1,8}$/i.test(raw) ? parseInt(raw, 16) >>> 0 : Game.util.strSeed(raw);
  }
  function hex32(value) { return ('00000000' + (Number(value) >>> 0).toString(16).toUpperCase()).slice(-8); }
  function statLabel(stat) {
    var value = Game.i18n.t('equipment.stat.' + stat);
    return value === 'equipment.stat.' + stat ? stat : value;
  }
  function itemName(item) { return Game.ui.itemName(item); }
  function slotLabel(slot) { return Game.i18n.t('slot.' + slot); }
  function rarityLabel(id) { return Game.i18n.t('rarity.r' + RARITY_IDS.indexOf(id)); }
  function announce(message) { $('lab-status').textContent = message; }

  function setupRuntime() {
    Game.state = {
      player: { classId: 'fighter', level: 32, gold: 1e12, crystal: 0, skills: {}, perms: {} },
      inv: {
        items: [], materials: {},
        equipped: { weapon: null, head: null, body: null, feet: null, accessory: null },
        loot: Game.loot.defaultState()
      },
      world: { worldSeed: 0, region: 'grassland', mode: 'rest' },
      settings: { autoEquip: false }
    };
    Game.world = { hero: { encounterId: null }, syncHeroStats: function () {} };
    Game.player = { recalc: function () {} };
    Game.inv = {
      byUid: function (uid) {
        return Game.state.inv.items.filter(function (item) { return item.uid === uid; })[0] || null;
      },
      materialCount: function () { return 999999; },
      addItems: function (items) {
        Game.state.inv.items = Game.state.inv.items.concat(items || []);
        return items || [];
      },
      itemStats: Game.equipment.itemStats
    };
  }

  function populateControls() {
    var values = {
      classId: $('class').value,
      source: $('source').value,
      minimum: $('minimum-rank').value,
      slot: $('slot-lock').value,
      base: $('base-lock').value,
      rarity: $('rarity-lock').value
    };
    $('class').innerHTML = Game.content.all('class').map(function (definition) {
      return '<option value="' + definition.id + '">' +
        esc(Game.i18n.t('class.' + definition.id + '.name')) + '</option>';
    }).join('');
    $('source').innerHTML = SOURCES.map(function (source) {
      return '<option value="' + source + '">' + esc(tr('source.' + source)) + '</option>';
    }).join('');
    $('minimum-rank').innerHTML = RARITY_IDS.map(function (id) {
      return '<option value="' + RARITY_IDS.indexOf(id) + '">' + esc(rarityLabel(id)) + '</option>';
    }).join('');
    $('slot-lock').innerHTML = '<option value="">' + esc(tr('auto')) + '</option>' + SLOT_IDS.map(function (slot) {
      return '<option value="' + slot + '">' + esc(slotLabel(slot)) + '</option>';
    }).join('');
    $('rarity-lock').innerHTML = '<option value="">' + esc(tr('auto')) + '</option>' + RARITY_IDS.map(function (id) {
      return '<option value="' + id + '">' + esc(rarityLabel(id)) + '</option>';
    }).join('');
    if (values.classId && Game.content.has('class', values.classId)) $('class').value = values.classId;
    if (SOURCES.indexOf(values.source) >= 0) $('source').value = values.source;
    if (values.minimum !== '') $('minimum-rank').value = values.minimum;
    if (SLOT_IDS.indexOf(values.slot) >= 0) $('slot-lock').value = values.slot;
    if (RARITY_IDS.indexOf(values.rarity) >= 0) $('rarity-lock').value = values.rarity;
    populateBaseLock(values.base);
  }
  function populateBaseLock(preferred) {
    var slot = $('slot-lock').value;
    var bases = Game.content.all('itemBase').filter(function (base) { return !slot || base.slotId === slot; });
    $('base-lock').innerHTML = '<option value="">' + esc(tr('auto')) + '</option>' + bases.map(function (base) {
      return '<option value="' + base.id + '">' + esc(Game.i18n.t(base.presentation.nameKey)) + '</option>';
    }).join('');
    if (preferred && bases.some(function (base) { return base.id === preferred; })) $('base-lock').value = preferred;
  }

  function applyQuery() {
    var params = new URLSearchParams(location.search);
    if (params.get('seed')) $('seed').value = params.get('seed');
    if (params.get('class') && Game.content.has('class', params.get('class'))) $('class').value = params.get('class');
    if (params.get('level')) $('level').value = params.get('level');
    if (params.get('tier')) $('tier').value = params.get('tier');
    if (params.get('source') && SOURCES.indexOf(params.get('source')) >= 0) $('source').value = params.get('source');
    if (params.get('samples')) $('samples').value = params.get('samples');
    if (['drop', 'generation', 'effects'].indexOf(params.get('tab')) >= 0) activeTab = params.get('tab');
    $('item-level').value = $('level').value;
    $('item-seed').value = hex32(parseSeed('seed') ^ 0xc0ffee12);
  }
  function syncQuery() {
    if (location.protocol === 'file:') return;
    var url = new URL(location.href);
    url.searchParams.set('seed', $('seed').value);
    url.searchParams.set('class', $('class').value);
    url.searchParams.set('level', $('level').value);
    url.searchParams.set('tier', $('tier').value);
    url.searchParams.set('source', $('source').value);
    url.searchParams.set('samples', $('samples').value);
    url.searchParams.set('tab', activeTab);
    url.searchParams.set('lang', locale());
    history.replaceState(null, '', url.href);
  }

  function switchTab(tab, focus) {
    activeTab = tab;
    ['drop', 'generation', 'effects'].forEach(function (id) {
      var active = id === tab;
      $('tab-' + id).setAttribute('aria-selected', active ? 'true' : 'false');
      $('tab-' + id).tabIndex = active ? 0 : -1;
      $('panel-' + id).hidden = !active;
    });
    if (focus) $('tab-' + tab).focus();
    if (tab === 'generation') renderGenerator();
    if (tab === 'effects') renderEffects();
    syncQuery();
  }

  function initialLootState(experimental) {
    var state = Game.loot.defaultState();
    if (!experimental) return state;
    state.eligibleMisses = clampInt('pity-equipment', 0, 9, 0);
    state.dropsSinceEpic = clampInt('pity-epic', 0, 11, 0);
    state.dropsSinceLegendary = clampInt('pity-legendary', 0, 39, 0);
    SLOT_IDS.forEach(function (slot) {
      state.slotDrought[slot] = clampInt('drought-' + slot, 0, 99, 0);
    });
    return state;
  }
  function planContext(experimental) {
    return {
      worldSeed: parseSeed('seed'), sourceType: $('source').value,
      sourceId: 'roguelike-equipment-lab', classId: $('class').value,
      playerLevel: clampInt('level', 1, 200, 32),
      regionId: ['grassland', 'forest', 'mine', 'graveyard', 'snowpass', 'lavacave', 'skyruins', 'darkcastle'][clampInt('tier', 1, 8, 4) - 1],
      tier: clampInt('tier', 1, 8, 4),
      dropMultiplier: experimental ? Math.max(0, number('drop-multiplier', 1)) : 1,
      rarityLuck: experimental ? Math.max(0, number('rarity-luck', 0)) : 0,
      minimumRank: experimental ? clampInt('minimum-rank', 0, 4, 0) : 0,
      equipped: { weapon: null, head: null, body: null, feet: null, accessory: null }
    };
  }
  function candidateVariants(item, count, resultRows, planOrdinal, planTrace) {
    resultRows.push({ item: item, candidate: 1, ordinal: planOrdinal, trace: planTrace });
    for (var index = 1; index < count; index++) {
      var seed = Game.util.strSeed([
        item.origin.seed, 'lab-candidate', index, Game.content.fingerprint()
      ].join('|'));
      var inspected = Game.loot.inspectGeneration({
        seed: seed, uid: item.uid + ':candidate:' + index,
        classId: item.classId, itemLevel: item.itemLevel,
        slotId: Game.equipment.slotOf(item), rarityId: item.rarityId,
        sourceType: item.origin.sourceType, sourceId: item.origin.sourceId,
        regionId: item.origin.regionId, tier: item.origin.tier,
        ordinal: item.origin.ordinal
      });
      resultRows.push({ item: inspected.item, candidate: index + 1, ordinal: planOrdinal, trace: inspected.trace });
    }
  }
  function runGroup(experimental, attempts) {
    var state = initialLootState(experimental);
    var context = planContext(experimental);
    var rarity = [0, 0, 0, 0, 0];
    var slots = { weapon: 0, head: 0, body: 0, feet: 0, accessory: 0 };
    var items = [], rows = [], drops = 0, forced = 0, trace = null;
    var candidates = experimental ? clampInt('candidate-count', 1, 4, 1) : 1;
    for (var attempt = 0; attempt < attempts; attempt++) {
      var inspected = Game.loot.inspectPlan(context, state);
      state = inspected.plan.nextState;
      trace = inspected.trace;
      var dropDecision = trace.decisions.filter(function (row) { return row.stage === 'drop'; })[0];
      if (dropDecision && dropDecision.reason.indexOf('pity') >= 0) forced++;
      if (inspected.plan.items.length) drops++;
      inspected.plan.items.forEach(function (item) {
        items.push(item);
        rarity[Game.equipment.rarityRank(item)]++;
        slots[Game.equipment.slotOf(item)]++;
        candidateVariants(item, candidates, rows, inspected.plan.ordinal, inspected.trace);
      });
      if (rows.length > 48) rows = rows.slice(rows.length - 48);
    }
    return { attempts: attempts, drops: drops, items: items, rows: rows, rarity: rarity,
      slots: slots, forced: forced, state: state, trace: trace, candidateCount: candidates };
  }

  function meterGroup(title, labels, values, total, rarityGroup) {
    return '<div class="meter-group"><strong>' + esc(title) + '</strong>' + values.map(function (value, index) {
      var ratio = total ? value / total : 0;
      return '<div class="meter-row' + (rarityGroup ? ' r' + index : '') + '"><span>' + esc(labels[index]) +
        '</span><span class="meter"><i style="width:' + Math.max(0, ratio * 100).toFixed(2) + '%"></i></span><b>' +
        value + ' / ' + (ratio * 100).toFixed(1) + '%</b></div>';
    }).join('') + '</div>';
  }
  function renderGroup(prefix, result) {
    var rarityLabels = RARITY_IDS.map(rarityLabel);
    var slotLabels = SLOT_IDS.map(slotLabel);
    $(prefix + '-summary').textContent = tr('summary', {
      attempts: result.attempts, drops: result.drops, items: result.items.length
    });
    $(prefix + '-meters').innerHTML = meterGroup(tr('rarityDistribution'), rarityLabels,
      result.rarity, Math.max(1, result.items.length), true) + meterGroup(tr('slotDistribution'),
      slotLabels, SLOT_IDS.map(function (slot) { return result.slots[slot]; }),
      Math.max(1, result.items.length), false);
    $(prefix + '-pity').innerHTML = [
      tr('pityEquipmentValue', { value: result.state.eligibleMisses }),
      tr('pityEpicValue', { value: result.state.dropsSinceEpic }),
      tr('pityLegendaryValue', { value: result.state.dropsSinceLegendary }),
      tr('pityForcedValue', { value: result.forced })
    ].map(function (label) { return '<span class="pity-chip">' + esc(label) + '</span>'; }).join('');
  }
  function layerOptions() {
    return {
      outline: $('layer-outline').checked,
      material: $('layer-material').checked,
      affixes: $('layer-affixes').checked,
      legendary: $('layer-legendary').checked
    };
  }
  function drawEquipment(target, item, phase, reducedMotion) {
    return Game.equipmentVisuals.drawToDom(target, item, Object.assign(layerOptions(), {
      phase: phase || 0,
      reducedMotion: !!reducedMotion
    }));
  }
  function itemCard(row, index) {
    var item = row.item;
    return '<button type="button" class="item-card r' + Game.equipment.rarityRank(item) + '" data-result="' + index + '">' +
      '<canvas width="48" height="48" data-result-icon="' + index + '"></canvas><span><strong>' + esc(itemName(item)) +
      '</strong><small>' + esc(slotLabel(Game.equipment.slotOf(item))) + ' · ' + esc(rarityLabel(item.rarityId)) +
      ' · iLv ' + item.itemLevel + (row.candidate > 1 ? ' · C' + row.candidate : '') + '</small></span></button>';
  }
  function renderResults(rows) {
    lastResults = rows.slice(-24).reverse();
    $('result-count').textContent = tr('resultCount', { count: lastResults.length });
    if (!lastResults.length) {
      $('drop-results').innerHTML = '<div class="empty-state">' + esc(tr('noResults')) + '</div>';
      return;
    }
    $('drop-results').innerHTML = lastResults.map(itemCard).join('');
    lastResults.forEach(function (row, index) {
      drawEquipment(document.querySelector('[data-result-icon="' + index + '"]'), row.item, 0, true);
    });
  }
  function traceDetail(row) {
    var chunks = [];
    if (row.selected !== null) chunks.push(tr('traceSelected', { value: row.selected }));
    if (row.reason) chunks.push(tr('traceReason', { value: row.reason }));
    if (Number.isFinite(row.roll)) chunks.push('roll ' + row.roll.toFixed(5));
    if (Number.isFinite(row.threshold)) chunks.push('threshold ' + Number(row.threshold).toFixed(5));
    if (row.candidates && row.candidates.length) chunks.push(tr('traceCandidates', { count: row.candidates.length }));
    return chunks.join(' · ');
  }
  function renderTrace(targetId, trace, limit) {
    var target = $(targetId);
    if (!trace || !trace.decisions.length) {
      target.innerHTML = '<li><span class="trace-index">--</span><span class="trace-stage">--</span><span class="trace-detail">' + esc(tr('noTrace')) + '</span></li>';
      return;
    }
    var decisions = trace.decisions.slice(0, limit || trace.decisions.length);
    target.innerHTML = decisions.map(function (row, index) {
      return '<li data-trace-stage="' + esc(row.stage) + '"><span class="trace-index">' + ('0' + (index + 1)).slice(-2) +
        '</span><span class="trace-stage">' + esc(row.stage) + '</span><span class="trace-detail"><b>' +
        esc(row.key) + '</b><br>' + esc(traceDetail(row)) + '</span></li>';
    }).join('');
  }
  function runComparison(attempts) {
    attempts = Game.util.clamp(Math.round(attempts), 1, 10000);
    Game.state.player.classId = $('class').value;
    Game.state.player.level = clampInt('level', 1, 200, 32);
    Game.state.world.worldSeed = parseSeed('seed');
    var baseline = runGroup(false, attempts);
    var experiment = runGroup(true, attempts);
    renderGroup('baseline', baseline);
    renderGroup('experiment', experiment);
    renderResults(baseline.rows.concat(experiment.rows));
    lastDropTrace = experiment.trace || baseline.trace;
    renderTrace('drop-trace', lastDropTrace, 120);
    $('trace-seed').textContent = lastDropTrace ? hex32(lastDropTrace.seed) : '--';
    if (experiment.rows.length) selectItem(experiment.rows[experiment.rows.length - 1].item,
      experiment.rows[experiment.rows.length - 1].trace, false, true);
    else if (baseline.rows.length) selectItem(baseline.rows[baseline.rows.length - 1].item,
      baseline.rows[baseline.rows.length - 1].trace, false, true);
    announce(tr('runDone', { attempts: attempts, items: experiment.items.length }));
    syncQuery();
    return { baseline: baseline, experiment: experiment };
  }

  function generationContext(seed) {
    var baseId = $('base-lock').value || null;
    var base = baseId && Game.content.get('itemBase', baseId);
    var slotId = base ? base.slotId : $('slot-lock').value || null;
    var context = {
      seed: seed, uid: 'eq:gear-lab:' + hex32(seed),
      classId: $('class').value, itemLevel: clampInt('item-level', 1, 200, 32),
      sourceType: 'roguelikeLab', sourceId: 'generator', regionId: 'grassland',
      tier: clampInt('tier', 1, 8, 4), ordinal: 0
    };
    if (slotId) context.slotId = slotId;
    if (baseId) context.baseId = baseId;
    if ($('rarity-lock').value) context.rarityId = $('rarity-lock').value;
    return context;
  }
  function selectItem(item, trace, goToTab, syncGenerationControls) {
    currentItem = item;
    currentGenerationTrace = trace || null;
    Game.state.player.classId = item.classId;
    Game.state.player.level = clampInt('level', 1, 200, 32);
    if (syncGenerationControls) {
      $('item-seed').value = hex32(item.origin.seed);
      $('item-level').value = item.itemLevel;
      $('slot-lock').value = Game.equipment.slotOf(item);
      populateBaseLock(item.baseId);
      $('base-lock').value = item.baseId;
      $('rarity-lock').value = item.rarityId;
    }
    renderGenerator();
    renderEffects();
    if (goToTab) switchTab(goToTab, true);
  }
  function generateCurrent() {
    var inspected = Game.loot.inspectGeneration(generationContext(parseSeed('item-seed')));
    selectItem(inspected.item, inspected.trace, false, false);
    announce(tr('generated', { name: itemName(inspected.item) }));
    return inspected;
  }
  function drawCurrentPreview() {
    if (!currentItem) return;
    var preview = $('gear-preview');
    preview.width = 20 * previewScale;
    preview.height = 20 * previewScale;
    preview.style.width = 20 * previewScale + 'px';
    preview.style.height = 20 * previewScale + 'px';
    var result = drawEquipment(preview, currentItem, animationPhase, $('reduced-motion').checked);
    $('preview-asset-id').textContent = 'equipment:v' + Game.equipmentVisuals.VERSION + ':' + result.descriptor.visualProfileId;
    var descriptor = result.descriptor;
    var rows = [
      [tr('descriptorSlot'), slotLabel(descriptor.slotId)],
      [tr('descriptorBase'), Game.i18n.t(Game.content.get('itemBase', descriptor.baseId).presentation.nameKey)],
      [tr('descriptorClass'), Game.i18n.t('class.' + descriptor.classId + '.name')],
      [tr('descriptorRarity'), rarityLabel(descriptor.rarityId)],
      [tr('descriptorFamilies'), descriptor.families.join(', ') || '--'],
      [tr('descriptorLegendary'), descriptor.legendaryId || '--']
    ];
    $('visual-descriptor').innerHTML = rows.map(function (row) {
      return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>';
    }).join('');
  }
  function renderVariantWall() {
    if (!currentItem) return;
    var baseSeed = parseSeed('item-seed');
    var variants = [];
    for (var index = 0; index < 8; index++) {
      var inspected = Game.loot.inspectGeneration(generationContext((baseSeed + index) >>> 0));
      variants.push(inspected);
    }
    $('variant-wall').innerHTML = variants.map(function (entry, index) {
      return '<button type="button" class="variant-item" data-variant="' + index + '"><canvas width="52" height="52" data-variant-icon="' + index + '"></canvas><span>' +
        hex32(entry.item.origin.seed) + '</span></button>';
    }).join('');
    variants.forEach(function (entry, index) {
      drawEquipment(document.querySelector('[data-variant-icon="' + index + '"]'), entry.item, 0, true);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-variant]'), function (button) {
      button.addEventListener('click', function () {
        var entry = variants[Number(this.getAttribute('data-variant'))];
        $('item-seed').value = hex32(entry.item.origin.seed);
        selectItem(entry.item, entry.trace, false, false);
        announce(tr('variantSelected', { seed: hex32(entry.item.origin.seed) }));
      });
    });
  }
  function renderGenerator() {
    if (!currentItem) return;
    drawCurrentPreview();
    renderVariantWall();
    renderTrace('generation-trace', currentGenerationTrace, 160);
  }

  function buildRecord(loadout) {
    return Game.builds.compileActorRecord({
      id: 'roguelike-equipment-lab', classId: $('class').value,
      level: clampInt('level', 1, 200, 32), talentRanks: {}, permanentUpgrades: {},
      loadout: { equipment: loadout }
    }, loadout);
  }
  function initialSandboxLoadout() {
    var loadout = {};
    SLOT_IDS.forEach(function (slot, index) {
      loadout[slot] = Game.loot.generateEquipment({
        seed: Game.util.strSeed(['gear-lab-loadout', $('class').value, slot].join('|')),
        uid: 'eq:gear-lab:loadout:' + slot, classId: $('class').value,
        itemLevel: Math.max(1, clampInt('level', 1, 200, 32) - 2),
        slotId: slot, rarityId: 'common', regionId: 'grassland', sourceType: 'starter'
      });
    });
    return loadout;
  }
  function formatValue(value) {
    if (!Number.isFinite(Number(value))) return String(value);
    var numberValue = Number(value);
    if (Math.abs(numberValue) < 1 && numberValue !== 0) return (numberValue * 100).toFixed(1) + '%';
    return numberValue.toFixed(2).replace(/\.00$/, '');
  }
  function renderSelectedItem(compiled) {
    var rank = Game.equipment.rarityRank(currentItem);
    var lines = [];
    var base = Game.content.get('itemBase', currentItem.baseId);
    Game.ui.modifierLines(base, currentItem.implicitRolls.map(function (row) { return row.values.value; }))
      .forEach(function (line) { lines.push(line); });
    currentItem.affixes.forEach(function (row) { lines.push(Game.ui.affixLine(row)); });
    $('selected-item').innerHTML = '<article class="selected-item-detail r' + rank + '"><canvas id="selected-item-icon" width="86" height="86"></canvas><div><h3>' +
      esc(itemName(currentItem)) + '</h3><div>' + esc(slotLabel(Game.equipment.slotOf(currentItem))) + ' · ' +
      esc(rarityLabel(currentItem.rarityId)) + ' · iLv ' + currentItem.itemLevel + '</div><ul>' +
      lines.map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') + '</ul></div></article>';
    drawEquipment($('selected-item-icon'), currentItem, animationPhase, $('reduced-motion').checked);
    $('fingerprint').textContent = currentItem.contentFingerprint;
    $('modifier-count').textContent = tr('modifierCount', { count: compiled.modifiers.length });
  }
  function renderLoadout() {
    $('loadout').innerHTML = SLOT_IDS.map(function (slot) {
      var item = sandboxLoadout[slot];
      return '<button type="button" class="loadout-slot r' + Game.equipment.rarityRank(item) + '" data-loadout-slot="' + slot + '"><canvas width="42" height="42" data-loadout-icon="' + slot + '"></canvas><span>' +
        esc(slotLabel(slot)) + '<br>' + esc(itemName(item)) + '</span></button>';
    }).join('');
    SLOT_IDS.forEach(function (slot) {
      drawEquipment(document.querySelector('[data-loadout-icon="' + slot + '"]'), sandboxLoadout[slot], 0, true);
    });
  }
  function renderModifierTable(compiled) {
    $('modifier-table').innerHTML = compiled.modifiers.map(function (modifier) {
      return '<tr><td title="' + esc(modifier.sourceId) + '">' + esc(modifier.sourceId) + '</td><td>' +
        esc(statLabel(modifier.stat)) + '</td><td>' + esc(modifier.phase) + '</td><td>' +
        esc(modifier.operation) + '</td><td>' + esc(formatValue(modifier.value)) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">' + esc(tr('noModifiers')) + '</td></tr>';
  }
  function renderBuildDelta(before, after) {
    var preferred = ['maxHp', 'physicalPower', 'magicPower', 'armor', 'ward', 'critChance',
      'critMultiplier', 'dodgeChance', 'damageReduction', 'lifesteal', 'haste', 'cooldownRate',
      'moveSpeed', 'dropMultiplier', 'rarityLuck'];
    var keys = preferred.filter(function (key) {
      return before.values[key] !== undefined || after.values[key] !== undefined;
    });
    $('build-delta').innerHTML = keys.map(function (key) {
      var left = Number(before.values[key]) || 0;
      var right = Number(after.values[key]) || 0;
      var delta = right - left;
      var cls = delta > 1e-12 ? 'delta-positive' : delta < -1e-12 ? 'delta-negative' : '';
      return '<tr><td>' + esc(statLabel(key)) + '</td><td>' + esc(formatValue(left)) + '</td><td>' +
        esc(formatValue(right)) + '</td><td class="' + cls + '">' + (delta > 0 ? '+' : '') + esc(formatValue(delta)) + '</td></tr>';
    }).join('');
  }
  function renderEffectFlow(compiled) {
    if (!compiled.effects.length) {
      $('effect-flow').innerHTML = '<div class="effect-empty">' + esc(tr('noLegendaryEffect')) + '</div>';
      return;
    }
    $('effect-flow').innerHTML = compiled.effects.map(function (effect) {
      var profile = effect.profile;
      var trigger = profile.trigger || {};
      var conditions = clone(trigger); delete conditions.event; delete conditions.owner;
      var limits = clone(profile); delete limits.id; delete limits.trigger; delete limits.operation;
      return '<div class="effect-node"><strong>' + esc(tr('flowEvent')) + '</strong><code>' + esc(trigger.event || '--') + '</code></div>' +
        '<div class="effect-node"><strong>' + esc(tr('flowConditions')) + '</strong><code>' + esc(JSON.stringify({ owner: trigger.owner, conditions: conditions })) + '</code></div>' +
        '<div class="effect-node"><strong>' + esc(tr('flowOperation')) + '</strong><code>' + esc(profile.operation || '--') + '</code></div>' +
        '<div class="effect-node"><strong>' + esc(tr('flowLimits')) + '</strong><code>' + esc(JSON.stringify(limits)) + '</code><br><small>' + esc(tr('uniqueEquipped')) + '</small></div>';
    }).join('');
  }
  function renderEffects() {
    if (!currentItem || !sandboxLoadout.weapon) return;
    var compiled = Game.equipment.compileItem(currentItem, { classId: currentItem.classId });
    var beforeLoadout = Object.assign({}, sandboxLoadout);
    var afterLoadout = Object.assign({}, sandboxLoadout);
    afterLoadout[Game.equipment.slotOf(currentItem)] = currentItem;
    renderSelectedItem(compiled);
    renderLoadout();
    renderModifierTable(compiled);
    renderBuildDelta(buildRecord(beforeLoadout), buildRecord(afterLoadout));
    renderEffectFlow(compiled);
  }

  function resetOverrides() {
    $('drop-multiplier').value = 1; $('rarity-luck').value = 0;
    $('minimum-rank').value = 0; $('candidate-count').value = 1;
    $('pity-equipment').value = 0; $('pity-epic').value = 0; $('pity-legendary').value = 0;
    SLOT_IDS.forEach(function (slot) { $('drought-' + slot).value = 0; });
    announce(tr('overridesReset'));
  }
  function bindEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (button) {
      button.addEventListener('click', function () { switchTab(this.getAttribute('data-tab'), false); });
      button.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        var ids = ['drop', 'generation', 'effects'];
        var at = ids.indexOf(activeTab) + (event.key === 'ArrowRight' ? 1 : -1);
        switchTab(ids[(at + ids.length) % ids.length], true);
      });
    });
    $('run-one').addEventListener('click', function () { runComparison(1); });
    $('run-batch').addEventListener('click', function () { runComparison(clampInt('samples', 1, 10000, 1000)); });
    $('reset-overrides').addEventListener('click', resetOverrides);
    $('drop-results').addEventListener('click', function (event) {
      var button = event.target.closest('[data-result]');
      if (!button) return;
      var row = lastResults[Number(button.getAttribute('data-result'))];
      var inspected = row.trace || Game.loot.inspectGeneration({
        seed: row.item.origin.seed, uid: row.item.uid, classId: row.item.classId,
        itemLevel: row.item.itemLevel, slotId: Game.equipment.slotOf(row.item),
        baseId: row.item.baseId, rarityId: row.item.rarityId,
        sourceType: row.item.origin.sourceType, sourceId: row.item.origin.sourceId,
        regionId: row.item.origin.regionId, tier: row.item.origin.tier, ordinal: row.item.origin.ordinal
      }).trace;
      selectItem(row.item, inspected, 'generation', true);
    });
    $('slot-lock').addEventListener('change', function () { populateBaseLock(''); });
    $('generate-item').addEventListener('click', generateCurrent);
    Array.prototype.forEach.call(document.querySelectorAll('[data-scale]'), function (button) {
      button.addEventListener('click', function () {
        previewScale = Number(this.getAttribute('data-scale'));
        Array.prototype.forEach.call(document.querySelectorAll('[data-scale]'), function (other) {
          other.classList.toggle('active', other === button);
        });
        drawCurrentPreview();
      });
    });
    ['layer-outline', 'layer-material', 'layer-affixes', 'layer-legendary', 'reduced-motion'].forEach(function (id) {
      $(id).addEventListener('change', function () { renderGenerator(); renderEffects(); });
    });
    $('preview-equip').addEventListener('click', function () {
      if (!currentItem) return;
      sandboxLoadout[Game.equipment.slotOf(currentItem)] = currentItem;
      renderEffects();
      announce(tr('equippedPreview', { slot: slotLabel(Game.equipment.slotOf(currentItem)) }));
    });
    $('class').addEventListener('change', function () {
      Game.state.player.classId = this.value;
      sandboxLoadout = initialSandboxLoadout();
      generateCurrent();
    });
    $('level').addEventListener('change', function () {
      $('item-level').value = this.value;
      sandboxLoadout = initialSandboxLoadout();
      renderEffects();
    });
    window.addEventListener('demo:locale', function () {
      var preserved = { classId: $('class').value, source: $('source').value, slot: $('slot-lock').value,
        base: $('base-lock').value, rarity: $('rarity-lock').value, minimum: $('minimum-rank').value };
      populateControls();
      $('class').value = preserved.classId; $('source').value = preserved.source;
      $('minimum-rank').value = preserved.minimum; $('slot-lock').value = preserved.slot;
      populateBaseLock(preserved.base); $('rarity-lock').value = preserved.rarity;
      renderResults(lastResults.slice().reverse());
      renderTrace('drop-trace', lastDropTrace, 120);
      renderGenerator(); renderEffects(); syncQuery();
    });
  }

  function init() {
    setupRuntime();
    DemoI18n.init();
    populateControls();
    applyQuery();
    Game.state.player.classId = $('class').value;
    Game.state.player.level = clampInt('level', 1, 200, 32);
    Game.state.world.worldSeed = parseSeed('seed');
    sandboxLoadout = initialSandboxLoadout();
    $('rarity-lock').value = 'legendary';
    bindEvents();
    generateCurrent();
    runComparison(1);
    switchTab(activeTab, false);
    animationTimer = window.setInterval(function () {
      animationPhase++;
      if (currentItem && !$('reduced-motion').checked) {
        if (activeTab === 'generation') drawCurrentPreview();
        if (activeTab === 'effects') renderSelectedItem(Game.equipment.compileItem(currentItem, { classId: currentItem.classId }));
      }
    }, 420);
  }

  Game.roguelikeEquipmentLab = {
    init: init,
    run: runComparison,
    generate: generateCurrent,
    switchTab: switchTab,
    selectItem: selectItem,
    snapshot: function () {
      return {
        activeTab: activeTab,
        currentItem: currentItem && clone(currentItem),
        currentTrace: currentGenerationTrace && clone(currentGenerationTrace),
        lastDropTrace: lastDropTrace && clone(lastDropTrace),
        resultCount: lastResults.length,
        loadout: clone(sandboxLoadout),
        visualCache: Game.equipmentVisuals.diagnostics()
      };
    },
    destroy: function () { if (animationTimer) window.clearInterval(animationTimer); animationTimer = null; }
  };

  init();
})();
