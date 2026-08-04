/* global Game, DemoI18n, LOOT_CONTENT_AUDIT */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var sources = ['regular', 'rare', 'guardian', 'chest', 'nestShallow', 'nestDeep',
    'boss', 'rareChest', 'mimic', 'expedition'];
  var sourceNames = {
    'zh-CN': ['普通战斗', '稀有战斗', '守卫', '普通宝箱', '浅层巢穴', '深层巢穴', 'Boss', '稀有宝箱', '噬宝匣', '远征奖励'],
    en: ['Regular Encounter', 'Rare Encounter', 'Guardian', 'Chest', 'Shallow Nest', 'Deep Nest', 'Boss', 'Rare Chest', 'Mimic', 'Expedition Reward']
  };
  var rarityKeys = ['common', 'fine', 'rare', 'epic', 'legendary'];
  var regionMaterials = ['herb', 'berry', 'mushroom', 'resin', 'ore', 'crystal_cluster',
    'ghost_flower', 'grave_dust', 'ice_crystal', 'frost_herb', 'fire_core', 'obsidian',
    'rune_stone', 'aether_shard', 'miasma_crystal', 'demon_horn'];
  var lastItems = [];
  var loadoutItems = {};
  var reforgeItem = null;

  function tr(key, vars) { return DemoI18n.t('loot.' + key, vars); }
  function esc(value) { return Game.util.esc(String(value)); }
  function trimFixed(value, digits) {
    return Number(value).toFixed(digits).replace(/\.?0+$/, '');
  }
  function locale() { return DemoI18n.locale(); }
  function seedValue() {
    var raw = String($('seed').value || '').replace(/^0x/i, '');
    return /^[0-9a-f]{1,8}$/i.test(raw) ? parseInt(raw, 16) >>> 0 : Game.util.strSeed(raw);
  }
  function setupRuntime() {
    var materials = {};
    regionMaterials.forEach(function (id) { materials[id] = 999999; });
    Game.state = {
      player: { classId: 'fighter', level: 32, gold: 1e12, crystal: 0 },
      inv: {
        items: [], materials: materials,
        equipped: { weapon: null, head: null, body: null, feet: null, accessory: null },
        loot: Game.loot.defaultState()
      },
      world: { worldSeed: 0, region: 'grassland', mode: 'rest' }
    };
    Game.world = { hero: { encounterId: null }, syncHeroStats: function () {} };
    Game.player = { recalc: function () {} };
    Game.inv = {
      byUid: function (uid) {
        return Game.state.inv.items.filter(function (item) { return item.uid === uid; })[0] || null;
      },
      materialCount: function (id) { return Number(Game.state.inv.materials[id]) || 0; },
      addItems: function (items) { Game.state.inv.items = Game.state.inv.items.concat(items); return items; },
      itemStats: function (item) { return Game.equipment.itemStats(item); },
      isEquipped: function (uid) {
        return Object.keys(Game.state.inv.equipped).some(function (slot) {
          return Game.state.inv.equipped[slot] === uid;
        });
      }
    };
  }
  function populateControls() {
    $('class').innerHTML = Game.content.all('class').map(function (definition) {
      return '<option value="' + definition.id + '">' +
        esc(Game.i18n.t('class.' + definition.id + '.name')) + '</option>';
    }).join('');
    $('source').innerHTML = sources.map(function (id, index) {
      return '<option value="' + id + '">' + esc(sourceNames[locale()][index]) + '</option>';
    }).join('');
    var params = new URLSearchParams(location.search);
    if (params.get('class') && Game.content.has('class', params.get('class'))) $('class').value = params.get('class');
    if (params.get('source') && sources.indexOf(params.get('source')) >= 0) $('source').value = params.get('source');
    if (params.get('seed')) $('seed').value = params.get('seed');
  }
  function itemName(item) { return Game.ui.itemName(item); }
  function itemCard(item) {
    var rank = Game.equipment.rarityRank(item);
    var affixes = (item.affixes || []).map(Game.ui.affixLine);
    return '<article class="gear-item r' + rank + '"><h3>' + esc(itemName(item)) + '</h3>' +
      '<div class="meta">' + esc(Game.i18n.t('slot.' + Game.equipment.slotOf(item))) +
      ' · ' + esc(Game.i18n.t('rarity.r' + rank)) + ' · iLv ' + item.itemLevel + '</div>' +
      (affixes.length ? '<ul>' + affixes.map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') + '</ul>' : '') +
      '</article>';
  }
  function meterGroup(title, rows, total, className) {
    return '<div class="distribution-group ' + className + '"><strong>' + esc(title) + '</strong>' +
      rows.map(function (row) {
        var ratio = total ? row.count / total : 0;
        return '<div class="meter-row"><span>' + esc(row.label) + '</span><span class="meter"><i style="width:' +
          (ratio * 100).toFixed(2) + '%"></i></span><b>' + row.count + ' / ' + (ratio * 100).toFixed(1) + '%</b></div>';
      }).join('') + '</div>';
  }
  function renderDistribution(attempts, lootState) {
    var rarity = [0, 0, 0, 0, 0];
    var slots = { weapon: 0, head: 0, body: 0, feet: 0, accessory: 0 };
    lastItems.forEach(function (item) {
      rarity[Game.equipment.rarityRank(item)]++;
      slots[Game.equipment.slotOf(item)]++;
    });
    var rarityRows = rarity.map(function (count, index) {
      return { label: Game.i18n.t('rarity.r' + index), count: count };
    });
    var slotRows = Game.equipment.SLOT_IDS.map(function (slot) {
      return { label: Game.i18n.t('slot.' + slot), count: slots[slot] };
    });
    $('distribution').innerHTML = meterGroup(Game.i18n.t('rarity.r4'), rarityRows,
      lastItems.length, 'rarity-group') + meterGroup(Game.i18n.t('slot.weapon'), slotRows,
      lastItems.length, 'slot-group');
    $('drop-summary').textContent = tr('dropSummary', {
      attempts: attempts, drops: lastItems.length, misses: lootState.eligibleMisses
    });
  }
  function buildLoadout() {
    var classId = $('class').value;
    var level = Math.max(1, Number($('level').value) || 1);
    var seed = seedValue();
    loadoutItems = {};
    lastItems.forEach(function (item) { loadoutItems[Game.equipment.slotOf(item)] = item; });
    Game.equipment.SLOT_IDS.forEach(function (slot, index) {
      if (loadoutItems[slot]) return;
      loadoutItems[slot] = Game.loot.generateEquipment({
        seed: Game.util.strSeed([seed, 'loot-lab-fill', slot].join('|')),
        uid: 'lab:fill:' + slot + ':' + seed, classId: classId, itemLevel: level,
        slotId: slot, minimumRank: 2, regionId: 'grassland', sourceType: 'lab-fill'
      });
    });
    var equipment = {}, items = [];
    Game.equipment.SLOT_IDS.forEach(function (slot) {
      equipment[slot] = loadoutItems[slot].uid;
      items.push(loadoutItems[slot]);
    });
    Game.state.inv.items = items;
    Game.state.inv.equipped = equipment;
    var compiled = Game.builds.compileActorRecord({
      classId: classId, level: level, talentRanks: {}, permanentUpgrades: {},
      loadout: { equipment: equipment }
    }, equipment);
    $('loadout').innerHTML = Game.equipment.SLOT_IDS.map(function (slot) {
      return itemCard(loadoutItems[slot]);
    }).join('');
    var classDef = Game.content.get('class', classId);
    var values = compiled.values;
    var shown = [
      ['HP', Game.i18n.fmtNum(values.maxHp)],
      ['Power', Game.i18n.fmtNum(values[classDef.primaryPowerStat])],
      ['Armor', Game.i18n.fmtNum(values.armor)], ['Ward', Game.i18n.fmtNum(values.ward)],
      ['Crit', (values.critChance * 100).toFixed(1) + '%'],
      ['Crit x', values.critMultiplier.toFixed(2)],
      ['Find', (values.dropMultiplier * 100).toFixed(1) + '%'],
      ['Luck', (values.rarityLuck * 100).toFixed(1) + '%']
    ];
    $('build-values').innerHTML = shown.map(function (row) {
      return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>';
    }).join('');
    renderProcLog(compiled.equipmentEffects);
    setupReforge(items);
  }
  function renderProcLog(effects) {
    var rows = effects.slice();
    if (!rows.length) {
      rows = Game.content.all('effectProfile').slice(0, 16).map(function (profile, index) {
        return { sourceId: 'catalog:' + String(index).padStart(2, '0'), affixId: profile.id, profile: profile };
      });
    }
    $('proc-log').innerHTML = rows.map(function (entry) {
      var trigger = entry.profile.trigger || {};
      return '<li><code>' + esc(entry.sourceId) + '</code><br>' + esc(entry.affixId) +
        ' · ' + esc(trigger.event || 'passive') + ' → ' + esc(entry.profile.operation || 'static') +
        ' · depth=' + (entry.profile.allowProcFromProc ? 'opt-in' : 'blocked') + '</li>';
    }).join('');
  }
  function setupReforge(items) {
    reforgeItem = items.filter(function (item) {
      return item.affixes.some(function (roll) {
        return Game.content.get('itemAffix', roll.definitionId).kind === 'normal';
      });
    })[0];
    if (!reforgeItem) {
      reforgeItem = Game.loot.generateEquipment({
        seed: Game.util.strSeed([seedValue(), 'reforge'].join('|')),
        uid: 'lab:reforge:' + seedValue(), classId: $('class').value,
        itemLevel: Number($('level').value), rarityId: 'epic', slotId: 'accessory',
        regionId: 'grassland', sourceType: 'lab-reforge'
      });
      Game.state.inv.items.push(reforgeItem);
    }
    $('reforge-item').innerHTML = itemCard(reforgeItem);
    var normal = reforgeItem.affixes.filter(function (roll) {
      return Game.content.get('itemAffix', roll.definitionId).kind === 'normal';
    });
    $('reforge-lock').innerHTML = '<option value="">' + esc(tr('noLock')) + '</option>' +
      normal.map(function (roll) {
        return '<option value="' + esc(roll.instanceId) + '">' + esc(Game.ui.affixLine(roll)) + '</option>';
      }).join('');
    $('reforge-lock').value = reforgeItem.reforge.lockedAffixInstanceId || '';
    renderQuote();
  }
  function renderQuote() {
    var lockId = $('reforge-lock').value || null;
    var quote = Game.reforge.quote(reforgeItem, lockId);
    if (!quote.ok) {
      $('reforge-quote').textContent = Game.ui.equipmentError(quote.reason);
      $('reforge').disabled = true;
      return;
    }
    $('reforge-quote').textContent = tr('cost', {
      gold: Game.i18n.fmtNum(quote.gold), count: quote.materialCount,
      material: quote.materialId ? Game.i18n.t('material.' + quote.materialId) : '-'
    });
    $('reforge').disabled = false;
  }
  function executeReforge() {
    var result = Game.reforge.execute(reforgeItem.uid, $('reforge-lock').value || null);
    if (!result.ok) { $('reforge-quote').textContent = Game.ui.equipmentError(result.reason); return; }
    $('reforge-item').innerHTML = itemCard(reforgeItem);
    setupReforge(Game.state.inv.items);
    renderProcLog(Game.equipment.compileItem(reforgeItem, { classId: $('class').value }).effects);
  }
  function resolveCrit() {
    var result = Game.combatMath.resolveCrit({
      critChance: Math.max(0, Number($('crit-chance').value) || 0) / 100,
      critMultiplier: Math.max(1, Number($('crit-multiplier').value) || 1),
      random: function () { return Math.max(0, Math.min(.999999, Number($('crit-roll').value) || 0)); }
    });
    $('crit-result').textContent = tr('critResult', {
      tier: result.critTier, applied: trimFixed(result.critMultiplierApplied, 6),
      critical: tr(result.isCritical ? 'critical' : 'normal')
    });
  }
  function auditPools() {
    var issues = [];
    function check(ok, text) { issues.push({ ok: !!ok, text: text }); }
    var bases = Game.content.all('itemBase');
    var affixes = Game.content.all('itemAffix');
    var normal = affixes.filter(function (entry) { return entry.kind === 'normal'; });
    var legendary = affixes.filter(function (entry) { return entry.kind === 'legendary'; });
    check(LOOT_CONTENT_AUDIT && LOOT_CONTENT_AUDIT.ok, 'strict content audit');
    check(bases.length === 17, 'itemBase count = ' + bases.length + ' / 17');
    check(normal.length === 24, 'normal affix count = ' + normal.length + ' / 24');
    check(legendary.length === 16, 'legendary count = ' + legendary.length + ' / 16');
    Game.content.all('itemAffixPool').forEach(function (pool) {
      var missing = pool.affixIds.filter(function (id) { return !Game.content.has('itemAffix', id); });
      check(!missing.length, pool.id + ' references (' + (missing.join(', ') || 'valid') + ')');
      check(new Set(pool.affixIds).size === pool.affixIds.length, pool.id + ' duplicate IDs');
    });
    var invalid = 0;
    Game.equipment.SLOT_IDS.forEach(function (slot, slotIndex) {
      rarityKeys.forEach(function (rarity, rarityIndex) {
        for (var index = 0; index < 25; index++) {
          var item = Game.loot.generateEquipment({
            seed: Game.util.strSeed(['audit', slot, rarity, index].join('|')),
            uid: ['audit', slotIndex, rarityIndex, index].join(':'),
            classId: 'fighter', itemLevel: 50, slotId: slot, rarityId: rarity,
            regionId: 'grassland'
          });
          if (!Game.equipment.validateItem(item).ok) invalid++;
        }
      });
    });
    check(invalid === 0, '625 generated item validations; invalid=' + invalid);
    $('audit').innerHTML = issues.map(function (issue) {
      return '<li class="' + (issue.ok ? 'pass' : 'fail') + '"><strong>' +
        esc(tr(issue.ok ? 'pass' : 'fail')) + '</strong> · ' + esc(issue.text) + '</li>';
    }).join('');
  }
  function runBatch() {
    var attempts = Math.max(1, Math.min(10000, Number($('samples').value) || 1));
    var classId = $('class').value;
    var level = Math.max(1, Number($('level').value) || 1);
    var tier = Math.max(1, Math.min(8, Number($('tier').value) || 1));
    var worldSeed = seedValue();
    var sourceType = $('source').value;
    var state = Game.loot.defaultState();
    lastItems = [];
    for (var index = 0; index < attempts; index++) {
      var plan = Game.loot.plan({
        worldSeed: worldSeed, expeditionIndex: 0, sourceType: sourceType,
        sourceId: 'loot-lab:' + sourceType, classId: classId,
        playerLevel: level, tier: tier, regionId: 'grassland',
        equipped: Game.state.inv.equipped
      }, state);
      state = plan.nextState;
      lastItems = lastItems.concat(plan.items);
    }
    Game.state.player.classId = classId;
    Game.state.player.level = level;
    Game.state.world.worldSeed = worldSeed;
    Game.state.inv.loot = state;
    renderDistribution(attempts, state);
    buildLoadout();
    auditPools();
  }
  function relabelDynamic() {
    var previousSource = $('source').value;
    var previousClass = $('class').value;
    populateControls();
    if (sources.indexOf(previousSource) >= 0) $('source').value = previousSource;
    if (Game.content.has('class', previousClass)) $('class').value = previousClass;
    if (lastItems.length) {
      renderDistribution(Number($('samples').value), Game.state.inv.loot);
      buildLoadout();
    }
    resolveCrit();
    auditPools();
  }

  DemoI18n.init();
  Game.i18n.setLocale(locale());
  setupRuntime();
  populateControls();
  $('run').addEventListener('click', runBatch);
  $('reforge-lock').addEventListener('change', renderQuote);
  $('reforge').addEventListener('click', executeReforge);
  $('resolve-crit').addEventListener('click', resolveCrit);
  window.addEventListener('demo:locale', function () {
    Game.i18n.setLocale(locale());
    relabelDynamic();
  });
  runBatch();
  resolveCrit();
})();
