/* Pack collection, strict compilation, readonly queries, and blueprint cache. */
(function () {
  'use strict';
  var Game = window.Game;
  var S = Game.contentSchemas;
  var C = Game.contentCompiler;
  var packs = [];
  var packIds = {};
  var compiled = {};
  var ordered = {};
  var sources = {};
  var finalized = false;
  var fingerprint = null;
  var lastAudit = null;
  var blueprintCache = {};
  var populationViews = {};
  var reverseReferences = {};

  function issue(list, code, spec) {
    list.push(Game.contentAudit.issue(code, spec));
  }

  function validatePack(pack, issues) {
    if (!pack || !S.stableId.test(pack.id || '')) issue(issues, 'pack-id', { packId: pack && pack.id });
    if (!/^\d+\.\d+\.\d+$/.test(pack && pack.version || '')) issue(issues, 'pack-version-format', { packId: pack && pack.id });
    if (!Number.isInteger(pack && pack.schemaVersion)) issue(issues, 'pack-schema-version', { packId: pack && pack.id });
    Object.keys(pack && pack.definitions || {}).forEach(function (type) {
      if (S.definitionTypes.indexOf(type) < 0) issue(issues, 'unknown-definition-type', { packId: pack.id, type: type });
      if (!Array.isArray(pack.definitions[type])) issue(issues, 'definition-list', { packId: pack.id, type: type });
    });
  }

  function flattenLocale(value, prefix, out) {
    out = out || {};
    Object.keys(value || {}).forEach(function (key) {
      var path = prefix ? prefix + '.' + key : key;
      if (value[key] && typeof value[key] === 'object') flattenLocale(value[key], path, out);
      else out[path] = String(value[key]);
    });
    return out;
  }

  function referencedLocaleKeys(pack) {
    var keys = {};
    function visit(value, field) {
      if (Array.isArray(value)) return value.forEach(function (entry) { visit(entry, field); });
      if (!value || typeof value !== 'object') {
        if (typeof value === 'string' && /Key$/.test(field || '')) keys[value] = true;
        return;
      }
      Object.keys(value).forEach(function (key) { visit(value[key], key); });
    }
    visit(pack.definitions || {}, 'definitions');
    return keys;
  }

  function installPackLocales(sorted, issues) {
    var owners = {};
    sorted.forEach(function (pack) {
      if (!pack.locales) return;
      var refs = referencedLocaleKeys(pack);
      ['zh-CN', 'en'].forEach(function (locale) {
        if (!pack.locales[locale]) {
          issue(issues, 'pack-locale-missing', { packId: pack.id, locale: locale });
          return;
        }
        var flat = flattenLocale(pack.locales[locale], '', {});
        Object.keys(flat).sort().forEach(function (key) {
          if (!refs[key]) {
            issue(issues, 'pack-locale-unreferenced', { packId: pack.id, locale: locale, ref: key });
            return;
          }
          var existing = Game.i18n && Game.i18n.raw && Game.i18n.raw(locale, key);
          if (existing !== undefined && existing !== flat[key]) {
            issue(issues, 'pack-locale-conflict', {
              packId: pack.id, locale: locale, ref: key, owner: owners[locale + '|' + key] || 'base'
            });
            return;
          }
          owners[locale + '|' + key] = pack.id;
        });
        if (Game.i18n && Game.i18n.addPack) Game.i18n.addPack(locale, pack.locales[locale]);
      });
    });
  }

  function refExists(definitions, targetType, id, type, def, path, issues) {
    if (!id) return false;
    if (!definitions[targetType] || !definitions[targetType][id]) {
      issue(issues, 'missing-reference', {
        type: type, id: def.id, path: path, refType: targetType, ref: id,
        sourcePackId: def.sourcePackId, sourceFile: def.sourceFile
      });
      return false;
    }
    return true;
  }

  function unexpectedFields(value, allowed, type, def, path, issues) {
    Object.keys(value || {}).forEach(function (field) {
      if (allowed.indexOf(field) < 0) issue(issues, 'unknown-field', {
        type: type, id: def.id, path: path + '.' + field
      });
    });
  }

  function positiveCount(value) {
    if (Number.isInteger(value)) return value > 0;
    return Array.isArray(value) && value.length === 2 &&
      Number.isInteger(value[0]) && Number.isInteger(value[1]) &&
      value[0] > 0 && value[1] >= value[0];
  }

  function validateAdvanced(type, def, definitions, issues) {
    if (type === 'encounterProfile') {
      var teamIds = {};
      var objectiveIds = {};
      (def.teamSlots || []).forEach(function (slot, index) {
        if (!slot || !S.stableId.test(slot.id || '') || teamIds[slot.id]) issue(issues, 'encounter-team-slot', { type: type, id: def.id, path: 'teamSlots.' + index });
        if (slot && ['combatant', 'objective', 'observer'].indexOf(slot.role) < 0) issue(issues, 'encounter-team-role', { type: type, id: def.id, path: 'teamSlots.' + index + '.role' });
        if (slot) {
          unexpectedFields(slot, ['id', 'role', 'coalitionId', 'countsForCompletion', 'rewardEligible'], type, def, 'teamSlots.' + index, issues);
          if (typeof slot.countsForCompletion !== 'boolean' || typeof slot.rewardEligible !== 'boolean') {
            issue(issues, 'encounter-team-flags', { type: type, id: def.id, path: 'teamSlots.' + index });
          }
          if (!S.stableId.test(slot.coalitionId || '')) issue(issues, 'encounter-coalition', { type: type, id: def.id, path: 'teamSlots.' + index + '.coalitionId' });
        }
        if (slot && slot.id) teamIds[slot.id] = true;
      });
      (def.objectives || []).forEach(function (objective, index) {
        if (!objective || !S.stableId.test(objective.id || '') || objectiveIds[objective.id]) issue(issues, 'encounter-objective-id', { type: type, id: def.id, path: 'objectives.' + index + '.id' });
        if (objective && objective.id) objectiveIds[objective.id] = true;
        if (!objective || S.objectiveTypes.indexOf(objective.type) < 0) issue(issues, 'encounter-objective-type', { type: type, id: def.id, path: 'objectives.' + index + '.type' });
        if (objective && objective.teamId && !teamIds[objective.teamId]) issue(issues, 'encounter-objective-team', { type: type, id: def.id, path: 'objectives.' + index + '.teamId', ref: objective.teamId });
        if (objective && objective.tick !== undefined && (!Number.isInteger(objective.tick) || objective.tick < 0)) {
          issue(issues, 'encounter-objective-tick', { type: type, id: def.id, path: 'objectives.' + index + '.tick' });
        }
        if (objective) {
          unexpectedFields(objective, [
            'id', 'type', 'required', 'actorId', 'teamId', 'coalitionId', 'tag',
            'tick', 'minimum', 'handlerId', 'handlerVersion', 'params'
          ], type, def, 'objectives.' + index, issues);
          if (typeof objective.required !== 'boolean') issue(issues, 'encounter-objective-required', { type: type, id: def.id, path: 'objectives.' + index + '.required' });
          if (objective.minimum !== undefined && (!Number.isInteger(objective.minimum) || objective.minimum < 1)) issue(issues, 'encounter-objective-minimum', { type: type, id: def.id, path: 'objectives.' + index + '.minimum' });
          if (objective.type === 'custom') {
            var handler = Game.rules && Game.rules.handler('objective', objective.handlerId);
            if (!handler || handler.version !== objective.handlerVersion) issue(issues, 'encounter-objective-handler', {
              type: type, id: def.id, path: 'objectives.' + index + '.handlerId', ref: objective.handlerId
            });
          } else if (objective.handlerId !== undefined || objective.handlerVersion !== undefined) {
            issue(issues, 'encounter-objective-handler', { type: type, id: def.id, path: 'objectives.' + index });
          }
        }
      });
      unexpectedFields(def.completionPolicy || {}, ['mode'], type, def, 'completionPolicy', issues);
      if (!def.completionPolicy || def.completionPolicy.mode !== 'allRequired') {
        issue(issues, 'encounter-completion-policy', { type: type, id: def.id, path: 'completionPolicy.mode' });
      }
      if (!(def.objectives || []).some(function (objective) { return objective.required === true; })) {
        issue(issues, 'encounter-required-objective', { type: type, id: def.id, path: 'objectives' });
      }
      Object.keys(def.relationMatrix || {}).forEach(function (sourceTeamId) {
        if (!teamIds[sourceTeamId]) issue(issues, 'encounter-relation-team', { type: type, id: def.id, path: 'relationMatrix.' + sourceTeamId });
        Object.keys(def.relationMatrix[sourceTeamId] || {}).forEach(function (targetTeamId) {
          if (!teamIds[targetTeamId]) issue(issues, 'encounter-relation-team', { type: type, id: def.id, path: 'relationMatrix.' + sourceTeamId + '.' + targetTeamId });
          if (S.relations.indexOf(def.relationMatrix[sourceTeamId][targetTeamId]) < 0 ||
              def.relationMatrix[sourceTeamId][targetTeamId] === 'self') {
            issue(issues, 'encounter-relation-value', { type: type, id: def.id, path: 'relationMatrix.' + sourceTeamId + '.' + targetTeamId });
          }
        });
      });
    }
    if (type === 'actorVariant') {
      var allowed = [
        'statProfileId', 'resourceProfileIds', 'abilityGrantIds', 'traitIds',
        'resistanceProfileId', 'aiProfileId', 'rewardProfileId', 'presentation',
        'body', 'interactionProfileId', 'engagementPolicyId', 'tags'
      ];
      Object.keys(def.overrides || {}).forEach(function (key) {
        if (allowed.indexOf(key) < 0) issue(issues, 'variant-override-field', { type: type, id: def.id, path: 'overrides.' + key });
      });
      var o = def.overrides || {};
      [
        ['statProfileId', 'statProfile'], ['resistanceProfileId', 'resistanceProfile'],
        ['aiProfileId', 'aiProfile'], ['rewardProfileId', 'rewardProfile'],
        ['interactionProfileId', 'interactionProfile'], ['engagementPolicyId', 'engagementPolicy']
      ].forEach(function (entry) {
        if (o[entry[0]]) refExists(definitions, entry[1], o[entry[0]], type, def, 'overrides.' + entry[0], issues);
      });
      [
        ['resourceProfileIds', 'resourceProfile'], ['abilityGrantIds', 'ability'], ['traitIds', 'trait']
      ].forEach(function (entry) {
        (o[entry[0]] || []).forEach(function (id, index) {
          refExists(definitions, entry[1], id, type, def, 'overrides.' + entry[0] + '.' + index, issues);
        });
      });
      (def.transitions || []).forEach(function (edge, index) {
        if (edge.from && edge.from !== def.id) issue(issues, 'variant-transition-from', { type: type, id: def.id, path: 'transitions.' + index + '.from' });
        if (edge.to && refExists(definitions, 'actorVariant', edge.to, type, def, 'transitions.' + index + '.to', issues) &&
            definitions.actorVariant[edge.to].archetypeId !== def.archetypeId) {
          issue(issues, 'variant-transition-archetype', { type: type, id: def.id, path: 'transitions.' + index + '.to', ref: edge.to });
        }
        if (!edge.triggerId || !S.stableId.test(edge.triggerId)) issue(issues, 'variant-transition-trigger', { type: type, id: def.id, path: 'transitions.' + index + '.triggerId' });
        if (['outOfEncounter', 'cleanup'].indexOf(edge.timing) < 0) issue(issues, 'variant-transition-timing', { type: type, id: def.id, path: 'transitions.' + index + '.timing' });
        if (['defer', 'cancel'].indexOf(edge.activeAction) < 0) issue(issues, 'variant-transition-action', { type: type, id: def.id, path: 'transitions.' + index + '.activeAction' });
        if (['none', 'actorRecord', 'worldSpawn'].indexOf(edge.persistence) < 0) issue(issues, 'variant-transition-persistence', { type: type, id: def.id, path: 'transitions.' + index + '.persistence' });
      });
    }
    if (type === 'encounterPack') {
      var slots = {};
      (def.members || []).forEach(function (member, index) {
        if (!member || !S.stableId.test(member.slotId || '') || slots[member.slotId]) {
          issue(issues, slots[member && member.slotId] ? 'duplicate-member-slot' : 'member-slot', { type: type, id: def.id, path: 'members.' + index + '.slotId' });
        }
        if (member && member.slotId) slots[member.slotId] = true;
        if (!member || !refExists(definitions, 'actorArchetype', member.archetypeId, type, def, 'members.' + index + '.archetypeId', issues)) return;
        if (member.variantId && refExists(definitions, 'actorVariant', member.variantId, type, def, 'members.' + index + '.variantId', issues) &&
            definitions.actorVariant[member.variantId].archetypeId !== member.archetypeId) {
          issue(issues, 'variant-archetype', { type: type, id: def.id, path: 'members.' + index + '.variantId', ref: member.variantId });
        }
      });
    }
    if (type === 'worldSpawnProfile') {
      var refCount = (def.actorRef ? 1 : 0) + (def.encounterPackId ? 1 : 0);
      if (refCount !== 1) issue(issues, 'spawn-content-ref', { type: type, id: def.id, path: 'actorRef|encounterPackId' });
      if (def.actorRef) {
        refExists(definitions, 'actorArchetype', def.actorRef.archetypeId, type, def, 'actorRef.archetypeId', issues);
        if (def.actorRef.variantId) refExists(definitions, 'actorVariant', def.actorRef.variantId, type, def, 'actorRef.variantId', issues);
      }
      if (def.encounterPackId) refExists(definitions, 'encounterPack', def.encounterPackId, type, def, 'encounterPackId', issues);
      if (def.onProvokedVariantId) {
        if (refExists(definitions, 'actorVariant', def.onProvokedVariantId, type, def, 'onProvokedVariantId', issues) &&
            def.actorRef && definitions.actorVariant[def.onProvokedVariantId].archetypeId !== def.actorRef.archetypeId) {
          issue(issues, 'spawn-provoked-archetype', { type: type, id: def.id, path: 'onProvokedVariantId', ref: def.onProvokedVariantId });
        }
      }
      if (def.encounterPackIdOnProvoked) {
        refExists(definitions, 'encounterPack', def.encounterPackIdOnProvoked, type, def,
          'encounterPackIdOnProvoked', issues);
      }
      if ((def.onProvokedVariantId && !def.encounterPackIdOnProvoked) ||
          (!def.onProvokedVariantId && def.encounterPackIdOnProvoked)) {
        issue(issues, 'spawn-provoked-pair', { type: type, id: def.id, path: 'onProvokedVariantId|encounterPackIdOnProvoked' });
      }
      var scope = def.identity && def.identity.scope;
      if (['ephemeral', 'regionStable', 'worldStable'].indexOf(scope) < 0) issue(issues, 'spawn-identity-scope', { type: type, id: def.id, path: 'identity.scope' });
      if (scope === 'worldStable' && !(def.identity && def.identity.persistentKey)) issue(issues, 'spawn-persistent-key', { type: type, id: def.id, path: 'identity.persistentKey' });
      var placement = def.placement || {};
      unexpectedFields(placement, [
        'selector', 'source', 'id', 'tag', 'offset', 'required', 'onFailure',
        'minClearance', 'maxDanger', 'minCampDistance', 'occupancyRadius'
      ], type, def, 'placement', issues);
      if (['anchor', 'layoutEntity', 'candidate'].indexOf(placement.selector) < 0) issue(issues, 'spawn-placement-selector', { type: type, id: def.id, path: 'placement.selector' });
      var sourcesBySelector = {
        anchor: ['camp', 'bossPoint', 'bossSpawnPoint', 'summoner'],
        layoutEntity: ['guardian', 'threat', 'landmark', 'ecology'],
        candidate: ['spawnCandidates', 'corridorCandidates', 'walkableNav']
      };
      if (sourcesBySelector[placement.selector] && sourcesBySelector[placement.selector].indexOf(placement.source) < 0) issue(issues, 'spawn-placement-source', { type: type, id: def.id, path: 'placement.source', ref: placement.source });
      if (typeof placement.required !== 'boolean' ||
          (placement.required && ['rejectRegionMount', 'abortGroup'].indexOf(placement.onFailure) < 0) ||
          (!placement.required && placement.onFailure !== 'skipOptional')) {
        issue(issues, 'spawn-placement-failure', { type: type, id: def.id, path: 'placement.onFailure' });
      }
      if (placement.offset && (!Number.isFinite(placement.offset.x) || !Number.isFinite(placement.offset.y))) issue(issues, 'spawn-placement-offset', { type: type, id: def.id, path: 'placement.offset' });
      ['minClearance', 'minCampDistance', 'occupancyRadius'].forEach(function (field) {
        if (placement[field] !== undefined && (!Number.isFinite(placement[field]) || placement[field] < 0)) issue(issues, 'spawn-placement-number', { type: type, id: def.id, path: 'placement.' + field });
      });
      if (placement.maxDanger !== undefined && (!Number.isFinite(placement.maxDanger) || placement.maxDanger < 0 || placement.maxDanger > 1)) issue(issues, 'spawn-placement-number', { type: type, id: def.id, path: 'placement.maxDanger' });
      var lifecycle = def.lifecycle || {};
      unexpectedFields(lifecycle, ['activation', 'unload', 'onDefeat', 'onEscape', 'respawn'], type, def, 'lifecycle', issues);
      if (['regionActive', 'bossRequested', 'scripted'].indexOf(lifecycle.activation) < 0 || lifecycle.unload !== 'despawn' || lifecycle.onDefeat !== 'closeLease' || lifecycle.onEscape !== 'closeLease') issue(issues, 'spawn-lifecycle', { type: type, id: def.id, path: 'lifecycle' });
      var respawn = lifecycle.respawn || {};
      unexpectedFields(respawn, ['mode', 'delay', 'resetVariant'], type, def, 'lifecycle.respawn', issues);
      if (['none', 'delay', 'worldTime'].indexOf(respawn.mode) < 0 || typeof respawn.resetVariant !== 'boolean' ||
          (respawn.mode !== 'none' && (!Number.isFinite(respawn.delay) || respawn.delay <= 0))) {
        issue(issues, 'spawn-respawn', { type: type, id: def.id, path: 'lifecycle.respawn' });
      }
    }
    if (type === 'worldPopulationProfile') {
      Object.keys(def.channels || {}).forEach(function (channel) {
        if (S.populationChannels.indexOf(channel) < 0) issue(issues, 'population-channel', { type: type, id: def.id, path: 'channels.' + channel });
        var capacity = def.channels[channel] && def.channels[channel].capacity;
        if (!Number.isInteger(capacity) || capacity < 0) issue(issues, 'population-capacity', { type: type, id: def.id, path: 'channels.' + channel + '.capacity' });
      });
    }
    if (type === 'climateProfile') {
      var climateFactors = def.factors || {};
      var climateStates = def.states || {};
      if (S.climateExposures.indexOf(def.exposure) < 0) {
        issue(issues, 'climate-exposure', { type: type, id: def.id, path: 'exposure', ref: def.exposure });
      }
      unexpectedFields(climateFactors, [
        'precipitation', 'celestial', 'tint', 'wind'
      ], type, def, 'factors', issues);
      ['precipitation', 'celestial', 'tint', 'wind'].forEach(function (field) {
        if (!Number.isFinite(climateFactors[field]) || climateFactors[field] < 0 ||
            climateFactors[field] > (field === 'wind' || field === 'precipitation' ? 2 : 1)) {
          issue(issues, 'climate-factor', { type: type, id: def.id, path: 'factors.' + field });
        }
      });
      S.climateFronts.forEach(function (front) {
        var weatherState = climateStates[front];
        if (!weatherState || typeof weatherState !== 'object') {
          issue(issues, 'climate-state', { type: type, id: def.id, path: 'states.' + front });
          return;
        }
        unexpectedFields(weatherState, [
          'id', 'kind', 'nameKey', 'precipitation', 'cloudCover',
          'fogDensity', 'windMultiplier', 'ambientScale', 'lightning', 'tint'
        ], type, def, 'states.' + front, issues);
        if (!S.stableId.test(weatherState.id || '') || !S.stableId.test(weatherState.kind || '')) {
          issue(issues, 'climate-state-id', { type: type, id: def.id, path: 'states.' + front + '.id' });
        }
        var precipitation = weatherState.precipitation || {};
        unexpectedFields(precipitation, ['type', 'density'], type, def, 'states.' + front + '.precipitation', issues);
        if (S.weatherPrecipitationTypes.indexOf(precipitation.type) < 0 ||
            !Number.isFinite(precipitation.density) || precipitation.density < 0 || precipitation.density > 1) {
          issue(issues, 'climate-precipitation', { type: type, id: def.id, path: 'states.' + front + '.precipitation' });
        }
        ['cloudCover', 'fogDensity', 'ambientScale'].forEach(function (field) {
          if (!Number.isFinite(weatherState[field]) || weatherState[field] < 0 || weatherState[field] > 1) {
            issue(issues, 'climate-state-factor', { type: type, id: def.id, path: 'states.' + front + '.' + field });
          }
        });
        if (!Number.isFinite(weatherState.windMultiplier) || weatherState.windMultiplier < 0 ||
            weatherState.windMultiplier > 2 || typeof weatherState.lightning !== 'boolean' ||
            (weatherState.tint !== undefined && !/^#[0-9a-f]{6}$/i.test(weatherState.tint))) {
          issue(issues, 'climate-state-presentation', { type: type, id: def.id, path: 'states.' + front });
        }
        if (!weatherState.nameKey) {
          issue(issues, 'required-field', { type: type, id: def.id, path: 'states.' + front + '.nameKey' });
        } else {
          ['zh-CN', 'en'].forEach(function (locale) {
            if (Game.i18n && typeof Game.i18n.has === 'function' && !Game.i18n.has(locale, weatherState.nameKey)) {
              issue(issues, 'missing-i18n', {
                type: type, id: def.id, path: 'states.' + front + '.nameKey',
                ref: weatherState.nameKey, locale: locale,
                sourcePackId: def.sourcePackId, sourceFile: def.sourceFile
              });
            }
          });
        }
        if (def.exposure === 'underground' &&
            (['rain', 'snow'].indexOf(precipitation.type) >= 0 || weatherState.lightning)) {
          issue(issues, 'climate-underground-exterior-effect', {
            type: type, id: def.id, path: 'states.' + front
          });
        }
      });
      Object.keys(climateStates).forEach(function (front) {
        if (S.climateFronts.indexOf(front) < 0) {
          issue(issues, 'climate-front', { type: type, id: def.id, path: 'states.' + front });
        }
      });
      var climateNameKey = def.presentation && def.presentation.nameKey;
      if (!climateNameKey) {
        issue(issues, 'required-field', { type: type, id: def.id, path: 'presentation.nameKey' });
      } else {
        ['zh-CN', 'en'].forEach(function (locale) {
          if (Game.i18n && typeof Game.i18n.has === 'function' && !Game.i18n.has(locale, climateNameKey)) {
            issue(issues, 'missing-i18n', {
              type: type, id: def.id, path: 'presentation.nameKey',
              ref: climateNameKey, locale: locale,
              sourcePackId: def.sourcePackId, sourceFile: def.sourceFile
            });
          }
        });
      }
    }
    if (type === 'hazardProfile') {
      var hazardTrigger = def.trigger || {};
      var hazardDetection = def.detection || {};
      var hazardLifecycle = def.lifecycle || {};
      var hazardOutcome = def.outcome || {};
      var hazardPlacement = def.placement || {};
      if (['damageTrap', 'ambushTrigger'].indexOf(def.category) < 0) {
        issue(issues, 'hazard-category', { type: type, id: def.id, path: 'category', ref: def.category });
      }
      unexpectedFields(hazardTrigger, [
        'mode', 'shape', 'radius', 'width', 'height', 'length', 'angleDeg',
        'movementTypes', 'actorFilter', 'sweep', 'retrigger'
      ], type, def, 'trigger', issues);
      if (hazardTrigger.mode !== 'enter' ||
          ['circle', 'rect', 'line', 'cone'].indexOf(hazardTrigger.shape) < 0 ||
          hazardTrigger.actorFilter !== 'playerParty' || hazardTrigger.sweep !== true ||
          hazardTrigger.retrigger !== 'afterExit') {
        issue(issues, 'hazard-trigger', { type: type, id: def.id, path: 'trigger' });
      }
      if (!Array.isArray(hazardTrigger.movementTypes) || !hazardTrigger.movementTypes.length ||
          hazardTrigger.movementTypes.some(function (movement) {
            return ['ground', 'flying', 'hover'].indexOf(movement) < 0;
          })) {
        issue(issues, 'hazard-movement-types', { type: type, id: def.id, path: 'trigger.movementTypes' });
      }
      ['radius', 'width', 'height', 'length', 'angleDeg'].forEach(function (field) {
        if (hazardTrigger[field] !== undefined &&
            (!Number.isFinite(hazardTrigger[field]) || hazardTrigger[field] <= 0)) {
          issue(issues, 'hazard-number', { type: type, id: def.id, path: 'trigger.' + field });
        }
      });
      unexpectedFields(hazardDetection, ['clueRadius', 'revealRadius', 'revealChance'], type, def, 'detection', issues);
      if (!Number.isFinite(hazardDetection.clueRadius) || !Number.isFinite(hazardDetection.revealRadius) ||
          hazardDetection.clueRadius < hazardDetection.revealRadius || hazardDetection.revealRadius <= 0) {
        issue(issues, 'hazard-detection', { type: type, id: def.id, path: 'detection' });
      }
      if (!Number.isFinite(hazardDetection.revealChance) ||
          hazardDetection.revealChance < 0 || hazardDetection.revealChance > 1) {
        issue(issues, 'hazard-detection-chance', {
          type: type, id: def.id, path: 'detection.revealChance'
        });
      }
      unexpectedFields(hazardLifecycle, [
        'revealTicks', 'warningTicks', 'activeTicks', 'cooldownTicks', 'ambushLock'
      ], type, def, 'lifecycle', issues);
      ['revealTicks', 'warningTicks', 'activeTicks', 'cooldownTicks'].forEach(function (field) {
        if (!Number.isInteger(hazardLifecycle[field]) || hazardLifecycle[field] < (field === 'revealTicks' ? 0 : 1)) {
          issue(issues, 'hazard-lifecycle', { type: type, id: def.id, path: 'lifecycle.' + field });
        }
      });
      if ((def.category === 'damageTrap' && hazardOutcome.type !== 'applyEffects') ||
          (def.category === 'ambushTrigger' && hazardOutcome.type !== 'startEncounter')) {
        issue(issues, 'hazard-outcome', { type: type, id: def.id, path: 'outcome.type' });
      }
      if (hazardOutcome.type === 'applyEffects') {
        if (!Array.isArray(hazardOutcome.effects) || !hazardOutcome.effects.length ||
            hazardOutcome.effects.some(function (effect) {
              return !effect || ['damage', 'applyStatus', 'knockback', 'pull'].indexOf(effect.type) < 0;
            })) {
          issue(issues, 'hazard-effect-whitelist', { type: type, id: def.id, path: 'outcome.effects' });
        }
        if (hazardOutcome.pulses !== undefined &&
            (!Number.isInteger(hazardOutcome.pulses) || hazardOutcome.pulses < 1 || hazardOutcome.pulses > 8)) {
          issue(issues, 'hazard-pulses', { type: type, id: def.id, path: 'outcome.pulses' });
        }
        if ((hazardOutcome.pulses || 1) > 1 &&
            (!Number.isInteger(hazardOutcome.intervalTicks) || hazardOutcome.intervalTicks < 1)) {
          issue(issues, 'hazard-pulse-interval', { type: type, id: def.id, path: 'outcome.intervalTicks' });
        }
      }
      if (hazardOutcome.type === 'startEncounter' &&
          (!Array.isArray(hazardOutcome.encounterPackIds) || !hazardOutcome.encounterPackIds.length)) {
        issue(issues, 'hazard-encounter-packs', { type: type, id: def.id, path: 'outcome.encounterPackIds' });
      }
      unexpectedFields(hazardPlacement, [
        'source', 'count', 'minCampDistance', 'minLandmarkDistance', 'minSpacing',
        'minDamageHazardDistance', 'requireWalkableEscape', 'maxPerTerritory'
      ], type, def, 'placement', issues);
      if (['hazardAnchor', 'threatTerritory'].indexOf(hazardPlacement.source) < 0 ||
          !positiveCount(hazardPlacement.count) || hazardPlacement.requireWalkableEscape !== true) {
        issue(issues, 'hazard-placement', { type: type, id: def.id, path: 'placement' });
      }
      ['minCampDistance', 'minLandmarkDistance', 'minSpacing', 'minDamageHazardDistance'].forEach(function (field) {
        if (hazardPlacement[field] !== undefined &&
            (!Number.isFinite(hazardPlacement[field]) || hazardPlacement[field] < 0)) {
          issue(issues, 'hazard-number', { type: type, id: def.id, path: 'placement.' + field });
        }
      });
      ['warningKey', 'hitKey', 'ambushKey'].forEach(function (field) {
        var localeKey = def.presentation && def.presentation[field];
        if (field === 'ambushKey' && def.category !== 'ambushTrigger') return;
        if (!localeKey) {
          issue(issues, 'required-field', { type: type, id: def.id, path: 'presentation.' + field });
          return;
        }
        ['zh-CN', 'en'].forEach(function (locale) {
          if (Game.i18n && typeof Game.i18n.has === 'function' && !Game.i18n.has(locale, localeKey)) {
            issue(issues, 'missing-i18n', {
              type: type, id: def.id, path: 'presentation.' + field,
              ref: localeKey, locale: locale,
              sourcePackId: def.sourcePackId, sourceFile: def.sourceFile
            });
          }
        });
      });
    }
    if (type === 'hazardVisualProfile') {
      if (['circle', 'rect', 'line', 'cone'].indexOf(def.shape) < 0) {
        issue(issues, 'hazard-visual-shape', { type: type, id: def.id, path: 'shape' });
      }
      ['concealed', 'dormant', 'warning', 'active', 'cooldown'].forEach(function (state) {
        if (!def.states || !def.states[state] || typeof def.states[state] !== 'object') {
          issue(issues, 'hazard-visual-state', { type: type, id: def.id, path: 'states.' + state });
        }
      });
    }
    if (type === 'engagementPolicy') {
      if (typeof def.manualAttack !== 'boolean' || typeof def.autoAggro !== 'boolean') issue(issues, 'engagement-policy-flags', { type: type, id: def.id });
    }
    if (type === 'interactionProfile') {
      var actionIds = {};
      (def.actions || []).forEach(function (action, index) {
        if (!action || !S.stableId.test(action.id || '') || actionIds[action.id]) issue(issues, 'interaction-action', { type: type, id: def.id, path: 'actions.' + index });
        if (action && action.id) actionIds[action.id] = true;
      });
    }
  }

  function valueAt(def, path) {
    var value = def;
    path.split('.').forEach(function (part) {
      value = value === undefined || value === null ? undefined : value[part];
    });
    return value;
  }

  var allowedEffects = [
    'damage', 'heal', 'shield', 'applyStatus', 'removeStatus', 'dispel',
    'modifyResource', 'modifyCooldown', 'modifyThreat', 'movement',
    'knockback', 'pull', 'summon', 'changeTeam', 'conditional',
    'sequence', 'repeat', 'triggerAbility', 'setCombo', 'markTarget',
    'interrupt', 'selfDestruct', 'withdraw'
  ];

  function collectEffectRefs(type, def, effect, path, definitions, issues) {
    if (!effect || allowedEffects.indexOf(effect.type) < 0) {
      issue(issues, 'unknown-effect', {
        type: type, id: def.id, path: path, ref: effect && effect.type
      });
      return;
    }
    if (effect.formulaId && !Game.rules.formula(effect.formulaId)) {
      issue(issues, 'missing-formula', {
        type: type, id: def.id, path: path + '.formulaId', ref: effect.formulaId
      });
    }
    if (effect.type === 'summon') {
      var summonedArchetype = definitions.actorArchetype && definitions.actorArchetype[effect.archetypeId];
      if (summonedArchetype && summonedArchetype.category !== 'summon') {
        issue(issues, 'summon-archetype-category', {
          type: type, id: def.id, path: path + '.archetypeId', ref: effect.archetypeId
        });
      }
      ['count', 'maxActive'].forEach(function (field) {
        if (!Number.isInteger(effect[field]) || effect[field] < 1 || effect[field] > 8) {
          issue(issues, 'summon-count', { type: type, id: def.id, path: path + '.' + field });
        }
      });
    }
    [
      ['damageTypeId', 'damageType'],
      ['resourceId', 'resource'],
      ['statusId', 'status'],
      ['abilityId', 'ability'],
      ['archetypeId', 'actorArchetype']
    ].forEach(function (mapping) {
      var field = mapping[0], targetType = mapping[1];
      if (effect[field] && (!definitions[targetType] ||
          !definitions[targetType][effect[field]])) {
        issue(issues, 'missing-reference', {
          type: type, id: def.id, path: path + '.' + field,
          refType: targetType, ref: effect[field]
        });
      }
    });
    (effect.effects || []).forEach(function (nested, index) {
      collectEffectRefs(type, def, nested, path + '.effects.' + index, definitions, issues);
    });
    (effect.then || []).forEach(function (nested, index) {
      collectEffectRefs(type, def, nested, path + '.then.' + index, definitions, issues);
    });
    (effect.else || []).forEach(function (nested, index) {
      collectEffectRefs(type, def, nested, path + '.else.' + index, definitions, issues);
    });
  }

  function collectRefs(type, def, definitions, issues) {
    var refs = S.references[type] || {};
    Object.keys(refs).forEach(function (path) {
      var targetType = refs[path];
      var value = valueAt(def, path);
      if (value === undefined || value === null || value === '') return;
      var values;
      if (Array.isArray(value)) values = value;
      else if (path === 'stats' || path === 'resistances') values = Object.keys(value);
      else values = [value];
      values.forEach(function (id) {
        if (!definitions[targetType] || !definitions[targetType][id]) {
          issue(issues, 'missing-reference', {
            type: type, id: def.id, path: path, refType: targetType, ref: id,
            sourcePackId: def.sourcePackId, sourceFile: def.sourceFile
          });
        }
      });
    });

    if (type === 'encounterProfile') {
      (def.packs || []).forEach(function (pack, pi) {
        (pack.members || []).forEach(function (member, mi) {
          var archetypeId = typeof member === 'string' ? member : member.archetypeId;
          if (!definitions.actorArchetype[archetypeId]) {
            issue(issues, 'missing-reference', {
              type: type, id: def.id, path: 'packs.' + pi + '.members.' + mi,
              refType: 'actorArchetype', ref: archetypeId,
              sourcePackId: def.sourcePackId, sourceFile: def.sourceFile
            });
          }
        });
      });
    }
    if (type === 'talent') {
      var grants = def.grants || {};
      if (grants.modifyAbilityId && !definitions.ability[grants.modifyAbilityId]) {
        issue(issues, 'missing-reference', {
          type: type, id: def.id, path: 'grants.modifyAbilityId',
          refType: 'ability', ref: grants.modifyAbilityId
        });
      }
      (grants.patches || []).forEach(function (patch, index) {
        var targetType = patch.target || 'ability';
        var targetId = patch.id || grants.modifyAbilityId;
        if (!definitions[targetType] || !definitions[targetType][targetId]) {
          issue(issues, 'missing-reference', {
            type: type, id: def.id, path: 'grants.patches.' + index + '.id',
            refType: targetType, ref: targetId
          });
        }
      });
    }
    if (type === 'ability') {
      (def.costs || []).forEach(function (cost, ci) {
        if (!definitions.resource[cost.resourceId]) {
          issue(issues, 'missing-reference', {
            type: type, id: def.id, path: 'costs.' + ci + '.resourceId',
            refType: 'resource', ref: cost.resourceId
          });
        }
      });
      (def.effects || []).forEach(function (effect, ei) {
        collectEffectRefs(type, def, effect, 'effects.' + ei, definitions, issues);
      });
    }
    if (type === 'status') {
      (def.periodic || []).forEach(function (effect, index) {
        collectEffectRefs(type, def, effect, 'periodic.' + index, definitions, issues);
      });
    }
    if (type === 'hazardProfile') {
      var outcome = def.outcome || {};
      (outcome.effects || []).forEach(function (effect, index) {
        collectEffectRefs(type, def, effect, 'outcome.effects.' + index, definitions, issues);
      });
      (outcome.encounterPackIds || []).forEach(function (packId, index) {
        if (refExists(definitions, 'encounterPack', packId, type, def,
            'outcome.encounterPackIds.' + index, issues)) {
          var pack = definitions.encounterPack[packId];
          if (!pack.ambushEligible || (pack.members || []).length > 2) {
            issue(issues, 'hazard-ambush-pack', {
              type: type, id: def.id, path: 'outcome.encounterPackIds.' + index, ref: packId
            });
          }
        }
      });
    }
  }

  function validateModifiers(type, def, definitions, issues) {
    (def.modifiers || []).forEach(function (modifier, index) {
      var path = 'modifiers.' + index;
      var statDef = definitions.stat && definitions.stat[modifier && modifier.stat];
      if (!statDef) {
        issue(issues, 'modifier-stat', {
          type: type, id: def.id, path: path + '.stat', ref: modifier && modifier.stat
        });
        return;
      }
      var phase = modifier.phase;
      if (!phase || (statDef.phases || []).indexOf(phase) < 0) {
        issue(issues, 'modifier-phase', {
          type: type, id: def.id, path: path + '.phase', ref: phase
        });
      }
      if (['add', 'addPct', 'multiply', 'set'].indexOf(modifier.operation) < 0) {
        issue(issues, 'modifier-operation', {
          type: type, id: def.id, path: path + '.operation', ref: modifier.operation
        });
      }
      var value = type === 'talent' ? modifier.perRank : modifier.value;
      if (!Number.isFinite(value)) {
        issue(issues, 'modifier-value', {
          type: type, id: def.id,
          path: path + (type === 'talent' ? '.perRank' : '.value')
        });
      }
    });
  }

  function validateTalent(def, definitions, issues) {
    if (!Number.isInteger(def.maxRank) || def.maxRank < 1) {
      issue(issues, 'talent-max-rank', { type: 'talent', id: def.id, path: 'maxRank' });
    }
    if (!Array.isArray(def.costs) || !def.costs.length ||
        (def.costs.length !== 1 && def.costs.length !== def.maxRank) ||
        def.costs.some(function (cost) {
          return !Number.isInteger(cost) || cost < 1;
        })) {
      issue(issues, 'talent-costs', { type: 'talent', id: def.id, path: 'costs' });
    }
    var grants = def.grants || {};
    (grants.patches || []).forEach(function (patch, index) {
      var targetType = patch.target || 'ability';
      var targetId = patch.id || grants.modifyAbilityId;
      var target = definitions[targetType] && definitions[targetType][targetId];
      var path = 'grants.patches.' + index;
      if (['ability', 'status'].indexOf(targetType) < 0) {
        issue(issues, 'talent-patch-target', {
          type: 'talent', id: def.id, path: path + '.target', ref: targetType
        });
        return;
      }
      if (!patch.path || !target || !Number.isFinite(valueAt(target, patch.path))) {
        issue(issues, 'talent-patch-path', {
          type: 'talent', id: def.id, path: path + '.path', ref: patch.path
        });
      }
      if (patch.operation && ['set', 'multiply'].indexOf(patch.operation) < 0) {
        issue(issues, 'talent-patch-operation', {
          type: 'talent', id: def.id, path: path + '.operation', ref: patch.operation
        });
      }
      if (patch.baseValue !== undefined && !Number.isFinite(patch.baseValue)) {
        issue(issues, 'talent-patch-value', {
          type: 'talent', id: def.id, path: path + '.baseValue'
        });
      }
      if (!Number.isFinite(patch.perRank)) {
        issue(issues, 'talent-patch-value', {
          type: 'talent', id: def.id, path: path + '.perRank'
        });
      }
    });
  }

  function validateEffectNumbers(type, def, effect, path, issues) {
    if (!effect) return;
    [
      'amount', 'coefficient', 'maxHpCoefficient', 'selfHealRatio',
      'critChanceBonus', 'durationTicks', 'stacks'
    ].forEach(function (field) {
      if (effect[field] !== undefined && !Number.isFinite(effect[field])) {
        issue(issues, 'effect-value', {
          type: type, id: def.id, path: path + '.' + field
        });
      }
    });
    Object.keys(effect.params || {}).forEach(function (field) {
      if (field === 'powerStat') return;
      if (!Number.isFinite(effect.params[field])) {
        issue(issues, 'effect-value', {
          type: type, id: def.id, path: path + '.params.' + field
        });
      }
    });
    (effect.effects || []).forEach(function (nested, index) {
      validateEffectNumbers(type, def, nested, path + '.effects.' + index, issues);
    });
    (effect.then || []).forEach(function (nested, index) {
      validateEffectNumbers(type, def, nested, path + '.then.' + index, issues);
    });
    (effect.else || []).forEach(function (nested, index) {
      validateEffectNumbers(type, def, nested, path + '.else.' + index, issues);
    });
  }

  function validateDefinition(type, def, definitions, issues) {
    if (!def || !S.stableId.test(def.id || '')) {
      issue(issues, 'definition-id', { type: type, id: def && def.id, sourcePackId: def && def.sourcePackId });
      return;
    }
    (S.required[type] || []).forEach(function (field) {
      if (def[field] === undefined || def[field] === null) {
        issue(issues, 'required-field', {
          type: type, id: def.id, path: field,
          sourcePackId: def.sourcePackId, sourceFile: def.sourceFile
        });
      }
    });
    if (type === 'actorArchetype' && S.categories.indexOf(def.category) < 0) {
      issue(issues, 'actor-category', { type: type, id: def.id, path: 'category' });
    }
    if (type === 'ability' && ['action', 'reaction'].indexOf(def.kind) < 0) {
      issue(issues, 'ability-kind', { type: type, id: def.id, path: 'kind' });
    }
    if (type === 'ability') {
      if (def.kind === 'action' && ['gcd', 'ogcd', 'auto'].indexOf(def.actionType) < 0) {
        issue(issues, 'ability-action-type', { type: type, id: def.id, path: 'actionType' });
      }
      var target = def.target || {};
      if (S.relations.indexOf(target.relation) < 0) {
        issue(issues, 'target-relation', { type: type, id: def.id, path: 'target.relation' });
      }
      if (['single', 'circle', 'cone', 'line', 'ring', 'selfRadius'].indexOf(target.shape) < 0) {
        issue(issues, 'target-shape', { type: type, id: def.id, path: 'target.shape' });
      }
      var timing = def.timing || {};
      [
        'castTicks', 'channelTicks', 'channelIntervalTicks', 'animationLockTicks',
        'cooldownTicks', 'charges', 'rechargeTicks'
      ].forEach(function (field) {
        if (timing[field] !== undefined &&
            (!Number.isFinite(timing[field]) || timing[field] < 0 || !Number.isInteger(timing[field]))) {
          issue(issues, 'ability-timing', { type: type, id: def.id, path: 'timing.' + field });
        }
      });
      if (timing.charges && !timing.rechargeTicks) {
        issue(issues, 'ability-charge-recharge', {
          type: type, id: def.id, path: 'timing.rechargeTicks'
        });
      }
      (def.effects || []).forEach(function (effect, index) {
        validateEffectNumbers(type, def, effect, 'effects.' + index, issues);
      });
    }
    if (['talent', 'trait', 'status'].indexOf(type) >= 0) {
      validateModifiers(type, def, definitions, issues);
    }
    if (type === 'talent') validateTalent(def, definitions, issues);
    if (type === 'status') {
      if (['refresh', 'stack', 'unique'].indexOf(def.stacking) < 0) {
        issue(issues, 'status-stacking', {
          type: type, id: def.id, path: 'stacking', ref: def.stacking
        });
      }
      if (!Number.isInteger(def.maxStacks) || def.maxStacks < 1 ||
          (def.stacking !== 'stack' && def.maxStacks !== 1)) {
        issue(issues, 'status-max-stacks', {
          type: type, id: def.id, path: 'maxStacks'
        });
      }
      if ((def.periodic || []).length &&
          (!Number.isInteger(def.periodicIntervalTicks) || def.periodicIntervalTicks < 1)) {
        issue(issues, 'status-periodic-interval', {
          type: type, id: def.id, path: 'periodicIntervalTicks'
        });
      }
      (def.periodic || []).forEach(function (effect, index) {
        validateEffectNumbers(type, def, effect, 'periodic.' + index, issues);
      });
    }
    if (type === 'encounterProfile') validateAdvanced(type, def, definitions, issues);
    if (type === 'encounterPack') validateAdvanced(type, def, definitions, issues);
    if (type === 'actorVariant') validateAdvanced(type, def, definitions, issues);
    if (type === 'worldSpawnProfile') validateAdvanced(type, def, definitions, issues);
    if (type === 'worldPopulationProfile') validateAdvanced(type, def, definitions, issues);
    if (type === 'engagementPolicy') validateAdvanced(type, def, definitions, issues);
    if (type === 'interactionProfile') validateAdvanced(type, def, definitions, issues);
    if (type === 'climateProfile') validateAdvanced(type, def, definitions, issues);
    if (type === 'hazardProfile') validateAdvanced(type, def, definitions, issues);
    if (type === 'hazardVisualProfile') validateAdvanced(type, def, definitions, issues);
    if (type === 'damageType' && ['physical', 'magic', 'true'].indexOf(def.category) < 0) {
      issue(issues, 'damage-category', { type: type, id: def.id, path: 'category' });
    }
    var presentation = def.presentation || def.identity || {};
    ['nameKey', 'descKey', 'loreKey'].forEach(function (field) {
      var key = presentation[field] || def.identity && def.identity[field];
      if (!key || !Game.i18n || typeof Game.i18n.has !== 'function') return;
      ['zh-CN', 'en'].forEach(function (locale) {
        if (!Game.i18n.has(locale, key)) {
          issue(issues, 'missing-i18n', {
            type: type, id: def.id, path: field, ref: key, locale: locale,
            sourcePackId: def.sourcePackId, sourceFile: def.sourceFile
          });
        }
      });
    });
    if (type === 'actorArchetype' && def.presentation && def.presentation.spriteId &&
        Game.assets && typeof Game.assets.has === 'function' && !Game.assets.has(def.presentation.spriteId)) {
      issue(issues, 'missing-asset', {
        type: type, id: def.id, path: 'presentation.spriteId',
        ref: def.presentation.spriteId, sourcePackId: def.sourcePackId, sourceFile: def.sourceFile
      });
    }
  }

  function countMinimum(value) {
    if (Array.isArray(value)) return Math.max(0, value[0] | 0);
    return Math.max(0, value | 0);
  }

  function buildPopulationViews(sorted, definitions, issues) {
    var views = {};
    var packOrder = {};
    sorted.forEach(function (pack, index) { packOrder[pack.id] = index; });
    Object.keys(definitions.worldPopulationProfile || {}).sort().forEach(function (id) {
      var def = definitions.worldPopulationProfile[id];
      var channels = {};
      S.populationChannels.forEach(function (channel) {
        var config = C.clone(def.channels[channel] || { capacity: 0 });
        config.capacity = Math.max(0, config.capacity | 0);
        config.spawnRefs = [];
        (def.baseSpawnRefs && def.baseSpawnRefs[channel] || []).forEach(function (entry) {
          var profileId = typeof entry === 'string' ? entry : entry.profileId;
          if (!refExists(definitions, 'worldSpawnProfile', profileId, 'worldPopulationProfile', def,
              'baseSpawnRefs.' + channel, issues)) return;
          config.spawnRefs.push(C.merge({ profileId: profileId, mode: 'weighted', weight: 1 },
            typeof entry === 'string' ? {} : entry));
        });
        channels[channel] = config;
      });
      views[id] = {
        id: id, regionId: def.regionId, flags: C.clone(def.flags || {}),
        channels: channels, offlineEligible: def.offlineEligible !== false,
        offlineRepresentative: def.offlineRepresentative || null,
        sourceFingerprint: null
      };
    });

    var mounts = [];
    Object.keys(definitions.worldSpawnProfile || {}).forEach(function (profileId) {
      var profile = definitions.worldSpawnProfile[profileId];
      (profile.mountTo || []).forEach(function (mount, index) {
        mounts.push({ profile: profile, mount: mount, index: index });
      });
    });
    mounts.sort(function (a, b) {
      var pa = packOrder[a.profile.sourcePackId] || 0;
      var pb = packOrder[b.profile.sourcePackId] || 0;
      return pa - pb || a.profile.id.localeCompare(b.profile.id) || a.index - b.index;
    });
    var duplicate = {};
    mounts.forEach(function (item) {
      var profile = item.profile, mount = item.mount || {};
      var view = views[mount.populationId];
      var key = profile.id + '|' + mount.populationId + '|' + mount.channel;
      if (duplicate[key]) issue(issues, 'duplicate-mount', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index });
      duplicate[key] = true;
      if (!view) {
        issue(issues, 'missing-population', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.populationId', ref: mount.populationId });
        return;
      }
      if (S.populationChannels.indexOf(mount.channel) < 0) {
        issue(issues, 'mount-channel', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.channel', ref: mount.channel });
        return;
      }
      if (['required', 'weighted'].indexOf(mount.mode) < 0) {
        issue(issues, 'mount-mode', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.mode', ref: mount.mode });
        return;
      }
      unexpectedFields(mount, [
        'populationId', 'channel', 'mode', 'count', 'weight', 'maxCount',
        'condition', 'priority'
      ], 'worldSpawnProfile', profile, 'mountTo.' + item.index, issues);
      if (mount.mode === 'required' && (!positiveCount(mount.count) ||
          mount.weight !== undefined || mount.maxCount !== undefined)) {
        issue(issues, 'mount-count', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.count' });
      }
      if (mount.mode === 'weighted' && ((!Number.isInteger(mount.weight) || mount.weight < 1) ||
          mount.count !== undefined)) {
        issue(issues, 'mount-weight', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.weight' });
      }
      if (mount.mode === 'weighted' && mount.maxCount !== undefined &&
          (!Number.isInteger(mount.maxCount) || mount.maxCount < 1)) issue(issues, 'mount-max-count', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.maxCount' });
      if (mount.priority !== undefined && !Number.isInteger(mount.priority)) issue(issues, 'mount-priority', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.priority' });
      var condition = mount.condition || {};
      Object.keys(condition).forEach(function (field) {
        if (['minTier', 'maxTier', 'flags'].indexOf(field) < 0) issue(issues, 'mount-condition', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.condition.' + field });
      });
      ['minTier', 'maxTier'].forEach(function (field) {
        if (condition[field] !== undefined && (!Number.isInteger(condition[field]) || condition[field] < 1)) issue(issues, 'mount-condition', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.condition.' + field });
      });
      if (condition.minTier !== undefined && condition.maxTier !== undefined && condition.minTier > condition.maxTier) issue(issues, 'mount-condition', { type: 'worldSpawnProfile', id: profile.id, path: 'mountTo.' + item.index + '.condition' });
      var regionFlags = definitions.regionProfile && definitions.regionProfile[view.regionId] &&
        definitions.regionProfile[view.regionId].flags || {};
      Object.keys(condition.flags || {}).forEach(function (flag) {
        if (typeof condition.flags[flag] !== 'boolean' ||
            (!(flag in view.flags) && !(flag in regionFlags))) issue(issues, 'mount-condition-flag', {
          type: 'worldSpawnProfile', id: profile.id,
          path: 'mountTo.' + item.index + '.condition.flags.' + flag
        });
      });
      view.channels[mount.channel].spawnRefs.push({
        profileId: profile.id, mode: mount.mode,
        count: C.clone(mount.count), weight: mount.weight,
        maxCount: mount.maxCount, condition: C.clone(condition),
        priority: mount.priority | 0, sourcePackId: profile.sourcePackId
      });
    });
    Object.keys(views).forEach(function (id) {
      S.populationChannels.forEach(function (channel) {
        var config = views[id].channels[channel];
        var minimum = config.spawnRefs.reduce(function (sum, entry) {
          return sum + (entry.mode === 'required' ? countMinimum(entry.count) : 0);
        }, 0);
        if (minimum > config.capacity) issue(issues, 'population-required-capacity', { type: 'worldPopulationProfile', id: id, path: 'channels.' + channel, required: minimum, capacity: config.capacity });
      });
      views[id].sourceFingerprint = ('00000000' + Game.util.fnv1a(C.stableStringify(views[id]))).slice(-8);
    });
    return views;
  }

  function buildReverseReferences(definitions, views) {
    var out = {};
    function add(actorId, field, value) {
      out[actorId] = out[actorId] || { actorId: actorId, variants: [], encounterPacks: [], worldSpawns: [], populations: [], regions: [] };
      if (out[actorId][field].indexOf(value) < 0) out[actorId][field].push(value);
    }
    Object.keys(definitions.actorVariant || {}).forEach(function (id) { add(definitions.actorVariant[id].archetypeId, 'variants', id); });
    Object.keys(definitions.encounterPack || {}).forEach(function (id) {
      (definitions.encounterPack[id].members || []).forEach(function (member) { add(member.archetypeId, 'encounterPacks', id); });
    });
    Object.keys(definitions.worldSpawnProfile || {}).forEach(function (id) {
      var spawn = definitions.worldSpawnProfile[id];
      var actors = [];
      if (spawn.actorRef) actors.push(spawn.actorRef.archetypeId);
      if (spawn.encounterPackId && definitions.encounterPack[spawn.encounterPackId]) {
        definitions.encounterPack[spawn.encounterPackId].members.forEach(function (member) { actors.push(member.archetypeId); });
      }
      actors.forEach(function (actorId) { add(actorId, 'worldSpawns', id); });
    });
    Object.keys(views || {}).forEach(function (populationId) {
      var view = views[populationId];
      S.populationChannels.forEach(function (channel) {
        view.channels[channel].spawnRefs.forEach(function (entry) {
          Object.keys(out).forEach(function (actorId) {
            if (out[actorId].worldSpawns.indexOf(entry.profileId) >= 0) {
              add(actorId, 'populations', populationId);
              add(actorId, 'regions', view.regionId);
            }
          });
        });
      });
    });
    Object.keys(out).forEach(function (actorId) {
      Object.keys(out[actorId]).forEach(function (field) {
        if (Array.isArray(out[actorId][field])) out[actorId][field].sort();
      });
    });
    return out;
  }

  function definitionIdentity(def) {
    var copy = C.clone(def);
    delete copy.sourcePackId;
    delete copy.sourceFile;
    delete copy.patch;
    delete copy.replace;
    return copy;
  }

  var API = Game.content = {
    registerPack: function (pack) {
      if (finalized) throw new Error('[Content] finalized');
      if (!pack || !pack.id) throw new Error('[Content] pack id required');
      if (packIds[pack.id]) throw new Error('[Content] duplicate pack: ' + pack.id);
      packIds[pack.id] = true;
      packs.push(C.clone(pack));
      return pack;
    },

    finalize: function (opts) {
      opts = opts || {};
      if (finalized) return lastAudit;
      var issues = [];
      packs.forEach(function (pack) { validatePack(pack, issues); });
      var sorted = C.topoSort(packs, issues);
      installPackLocales(sorted, issues);
      S.definitionTypes.forEach(function (type) {
        compiled[type] = {};
        ordered[type] = [];
        sources[type] = {};
      });

      sorted.forEach(function (pack) {
        Object.keys(pack.definitions || {}).sort().forEach(function (type) {
          if (S.definitionTypes.indexOf(type) < 0 || !Array.isArray(pack.definitions[type])) return;
          pack.definitions[type].forEach(function (raw, index) {
            var def = C.merge(C.clone(S.defaults[type] || {}), raw || {});
            def.sourcePackId = pack.id;
            def.sourceFile = raw && raw.sourceFile || pack.sourceFile || pack.id;
            if (!def.id) {
              issue(issues, 'definition-id', { packId: pack.id, type: type, path: String(index) });
              return;
            }
            var existing = compiled[type][def.id];
            if (existing && !raw.patch && !raw.replace) {
              issue(issues, 'duplicate-definition', { packId: pack.id, type: type, id: def.id });
              return;
            }
            if (existing && raw.patch) {
              var patched = C.clone(existing);
              delete def.patch;
              C.merge(patched, def);
              def = patched;
            } else if (existing && raw.replace) {
              delete def.replace;
            }
            if (!existing) ordered[type].push(def.id);
            compiled[type][def.id] = def;
            sources[type][def.id] = { packId: pack.id, file: def.sourceFile };
          });
        });
      });

      S.definitionTypes.forEach(function (type) {
        ordered[type].forEach(function (id) {
          validateDefinition(type, compiled[type][id], compiled, issues);
        });
      });
      S.definitionTypes.forEach(function (type) {
        ordered[type].forEach(function (id) {
          collectRefs(type, compiled[type][id], compiled, issues);
        });
      });
      var grantedAbilities = {};
      ordered.actorArchetype.forEach(function (actorId) {
        (compiled.actorArchetype[actorId].abilityGrantIds || []).forEach(function (abilityId) {
          (grantedAbilities[abilityId] || (grantedAbilities[abilityId] = [])).push(actorId);
        });
      });
      function containsEffect(effect, effectType) {
        if (!effect) return false;
        if (effect.type === effectType) return true;
        return (effect.effects || []).some(function (nested) { return containsEffect(nested, effectType); }) ||
          (effect.then || []).some(function (nested) { return containsEffect(nested, effectType); }) ||
          (effect.else || []).some(function (nested) { return containsEffect(nested, effectType); });
      }
      ordered.ability.forEach(function (abilityId) {
        var abilityDef = compiled.ability[abilityId];
        if (!(abilityDef.effects || []).some(function (effect) { return containsEffect(effect, 'selfDestruct'); })) return;
        var users = grantedAbilities[abilityId] || [];
        if (!users.length || users.some(function (actorId) {
          return compiled.actorArchetype[actorId].category !== 'summon';
        })) {
          issue(issues, 'self-destruct-summon-only', {
            type: 'ability', id: abilityId, path: 'effects', ref: users.join(',')
          });
        }
      });
      populationViews = buildPopulationViews(sorted, compiled, issues);
      reverseReferences = buildReverseReferences(compiled, populationViews);

      var abilityEdges = {};
      function collectAbilityEdges(effect, list) {
        if (!effect) return;
        if (effect.type === 'triggerAbility' && effect.abilityId) list.push(effect.abilityId);
        (effect.effects || []).forEach(function (nested) { collectAbilityEdges(nested, list); });
        (effect.then || []).forEach(function (nested) { collectAbilityEdges(nested, list); });
        (effect.else || []).forEach(function (nested) { collectAbilityEdges(nested, list); });
      }
      ordered.ability.forEach(function (id) {
        abilityEdges[id] = [];
        (compiled.ability[id].effects || []).forEach(function (effect) {
          collectAbilityEdges(effect, abilityEdges[id]);
        });
      });
      var visitingAbilities = {}, visitedAbilities = {};
      function visitAbility(id, path) {
        if (visitingAbilities[id]) {
          issue(issues, 'ability-reference-cycle', {
            type: 'ability', id: id, path: path.concat(id).join(' -> ')
          });
          return;
        }
        if (visitedAbilities[id]) return;
        visitingAbilities[id] = true;
        (abilityEdges[id] || []).forEach(function (next) {
          visitAbility(next, path.concat(id));
        });
        visitingAbilities[id] = false;
        visitedAbilities[id] = true;
      }
      ordered.ability.forEach(function (id) { visitAbility(id, []); });

      var variantEdges = {};
      ordered.actorVariant.forEach(function (id) {
        variantEdges[id] = (compiled.actorVariant[id].transitions || []).filter(function (edge) {
          return edge.from && edge.to;
        }).map(function (edge) { return edge.to; });
      });
      var visitingVariants = {}, visitedVariants = {};
      function visitVariant(id, path) {
        if (visitingVariants[id]) {
          issue(issues, 'variant-transition-cycle', {
            type: 'actorVariant', id: id, path: path.concat(id).join(' -> ')
          });
          return;
        }
        if (visitedVariants[id]) return;
        visitingVariants[id] = true;
        (variantEdges[id] || []).forEach(function (next) { visitVariant(next, path.concat(id)); });
        visitingVariants[id] = false;
        visitedVariants[id] = true;
      }
      ordered.actorVariant.forEach(function (id) { visitVariant(id, []); });

      var persistentSpawnKeys = {};
      ordered.worldSpawnProfile.forEach(function (id) {
        var spawn = compiled.worldSpawnProfile[id];
        if (!spawn.identity || spawn.identity.scope !== 'worldStable') return;
        var key = spawn.identity.persistentKey;
        if (persistentSpawnKeys[key]) {
          issue(issues, 'spawn-persistent-key-conflict', {
            type: 'worldSpawnProfile', id: id, path: 'identity.persistentKey', ref: key
          });
        }
        persistentSpawnKeys[key] = id;
      });

      var canonicalPacks = sorted.map(function (pack) {
        return {
          id: pack.id, version: pack.version, schemaVersion: pack.schemaVersion,
          locales: C.clone(pack.locales || {}),
          definitions: Object.keys(pack.definitions || {}).sort().reduce(function (acc, type) {
            acc[type] = (pack.definitions[type] || []).map(definitionIdentity);
            return acc;
          }, {})
        };
      });
      var canonical = {
        packs: canonicalPacks,
        populationViews: populationViews,
        rules: Game.rules && Game.rules.audit ? Game.rules.audit() : [],
        authoring: Game.contentAuthoring && Game.contentAuthoring.audit
          ? Game.contentAuthoring.audit() : []
      };
      // Content fingerprints are a fixed-width public contract. Keep the
      // generic hash helper unchanged because save export checksums produced by
      // older builds used its unpadded form.
      fingerprint = ('00000000' + Game.util.fnv1a(C.stableStringify(canonical))).slice(-8);
      lastAudit = Game.contentAudit.summary(issues, sorted, compiled, fingerprint);
      lastAudit.populationViews = C.clone(populationViews);
      lastAudit.reverseReferences = C.clone(reverseReferences);
      if (opts.strict && !lastAudit.ok) {
        var message = lastAudit.issues.slice(0, 12).map(function (x) {
          return x.code + ':' + (x.type || x.packId || '') + ':' + (x.id || x.ref || '');
        }).join(', ');
        throw new Error('[Content] strict audit failed: ' + message);
      }
      S.definitionTypes.forEach(function (type) {
        ordered[type].forEach(function (id) { C.deepFreeze(compiled[type][id]); });
        C.deepFreeze(ordered[type]);
        C.deepFreeze(compiled[type]);
      });
      Object.keys(populationViews).forEach(function (id) { C.deepFreeze(populationViews[id]); });
      C.deepFreeze(populationViews);
      Object.keys(reverseReferences).forEach(function (id) { C.deepFreeze(reverseReferences[id]); });
      C.deepFreeze(reverseReferences);
      C.deepFreeze(compiled);
      ordered.regionProfile.slice().sort(function (leftId, rightId) {
        var left = compiled.regionProfile[leftId];
        var right = compiled.regionProfile[rightId];
        return left.tier - right.tier || leftId.localeCompare(rightId);
      }).forEach(function (id) {
        var regionDef = compiled.regionProfile[id];
        var projection = regionDef.projection
          ? C.clone(regionDef.projection)
          : definitionIdentity(regionDef);
        Game.reg.register('region', C.deepFreeze(projection));
      });
      ordered.actorArchetype.forEach(function (id) {
        var archetype = compiled.actorArchetype[id];
        if (archetype.category !== 'monster') return;
        var legacy = C.clone(archetype.legacy || {});
        legacy.id = id;
        legacy.sprite = archetype.presentation && archetype.presentation.spriteId || id;
        legacy.boss = archetype.rank === 'boss';
        Game.reg.register('monster', C.deepFreeze(legacy));
      });
      finalized = true;
      return lastAudit;
    },

    get: function (type, id) { return compiled[type] && compiled[type][id] || null; },
    all: function (type) {
      return (ordered[type] || []).map(function (id) { return compiled[type][id]; });
    },
    has: function (type, id) { return !!(compiled[type] && compiled[type][id]); },
    audit: function () { return lastAudit || Game.contentAudit.summary([], packs, {}, fingerprint); },
    fingerprint: function () { return fingerprint; },
    packs: function () {
      return packs.map(function (pack) {
        return { id: pack.id, version: pack.version, schemaVersion: pack.schemaVersion };
      }).sort(function (a, b) { return a.id.localeCompare(b.id); });
    },
    isFinalized: function () { return finalized; },
    populationView: function (id) { return populationViews[id] || null; },
    populationViews: function () {
      return Object.keys(populationViews).sort().map(function (id) { return populationViews[id]; });
    },
    reverseReferences: function (actorId) { return reverseReferences[actorId] || null; },

    compileBlueprint: function (spec) {
      if (!finalized) throw new Error('[Content] finalize before compiling blueprints');
      spec = spec || {};
      var archetype = API.get('actorArchetype', spec.archetypeId);
      if (!archetype) throw new Error('[Content] unknown archetype: ' + spec.archetypeId);
      var variant = spec.variantId ? API.get('actorVariant', spec.variantId) : null;
      if (spec.variantId && !variant) throw new Error('[Content] unknown variant: ' + spec.variantId);
      if (variant && variant.archetypeId !== archetype.id) {
        throw new Error('[Content] variant/archetype mismatch: ' + spec.variantId);
      }
      var classDef = spec.classId ? API.get('class', spec.classId) : null;
      if (spec.classId && !classDef) throw new Error('[Content] unknown class: ' + spec.classId);
      var key = [spec.archetypeId, spec.classId || '-', spec.variantId || '-', fingerprint].join('|');
      if (blueprintCache[key]) return blueprintCache[key];
      var resolved = C.merge(C.clone(archetype), variant && variant.overrides || {});
      var abilities = (resolved.abilityGrantIds || []).slice();
      var traits = (resolved.traitIds || []).slice();
      var resources = (resolved.resourceProfileIds || []).slice();
      if (classDef) {
        abilities = abilities.concat(classDef.baseAbilityGrantIds || []);
        traits = traits.concat(classDef.traitIds || []);
        resources = resources.concat(classDef.resourceProfileIds || []);
      }
      var blueprint = {
        key: key,
        archetypeId: archetype.id,
        variantId: variant && variant.id || null,
        classId: classDef && classDef.id || null,
        category: resolved.category,
        rank: resolved.rank,
        resolvedTags: (resolved.tags || []).concat(classDef && classDef.tags || []),
        resolvedProfiles: {
          statProfileId: classDef && classDef.statProfileId || resolved.statProfileId || null,
          resourceProfileIds: resources,
          resistanceProfileId: resolved.resistanceProfileId || null,
          aiProfileId: classDef && classDef.aiProfileId || resolved.aiProfileId || null,
          rewardProfileId: resolved.rewardProfileId || null,
          renderProfileId: resolved.presentation && resolved.presentation.renderProfileId || null,
          interactionProfileId: resolved.interactionProfileId || null,
          engagementPolicyId: resolved.engagementPolicyId || null,
          tacticsProfileIds: classDef && classDef.tacticsProfileIds || []
        },
        resolvedPresentation: C.clone(resolved.presentation || {}),
        resolvedBody: C.clone(resolved.body || {}),
        resolvedAbilityGrants: abilities.filter(function (id, at) { return abilities.indexOf(id) === at; }),
        resolvedTraits: traits.filter(function (id, at) { return traits.indexOf(id) === at; }),
        sourceFingerprint: fingerprint
      };
      blueprintCache[key] = C.deepFreeze(blueprint);
      return blueprintCache[key];
    },

    inspect: function (type, id) {
      var card = API.get(type, id);
      return card ? { card: card, source: sources[type][id], fingerprint: fingerprint } : null;
    }
  };
})();
