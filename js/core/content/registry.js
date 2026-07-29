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
    'interrupt'
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

      var canonical = sorted.map(function (pack) {
        return {
          id: pack.id, version: pack.version, schemaVersion: pack.schemaVersion,
          definitions: Object.keys(pack.definitions || {}).sort().reduce(function (acc, type) {
            acc[type] = (pack.definitions[type] || []).map(definitionIdentity);
            return acc;
          }, {})
        };
      });
      // Content fingerprints are a fixed-width public contract. Keep the
      // generic hash helper unchanged because save export checksums produced by
      // older builds used its unpadded form.
      fingerprint = ('00000000' + Game.util.fnv1a(C.stableStringify(canonical))).slice(-8);
      lastAudit = Game.contentAudit.summary(issues, sorted, compiled, fingerprint);
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
      C.deepFreeze(compiled);
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

    compileBlueprint: function (spec) {
      if (!finalized) throw new Error('[Content] finalize before compiling blueprints');
      spec = spec || {};
      var archetype = API.get('actorArchetype', spec.archetypeId);
      if (!archetype) throw new Error('[Content] unknown archetype: ' + spec.archetypeId);
      var classDef = spec.classId ? API.get('class', spec.classId) : null;
      if (spec.classId && !classDef) throw new Error('[Content] unknown class: ' + spec.classId);
      var key = [spec.archetypeId, spec.classId || '-', spec.variantId || '-', fingerprint].join('|');
      if (blueprintCache[key]) return blueprintCache[key];
      var abilities = (archetype.abilityGrantIds || []).slice();
      var traits = (archetype.traitIds || []).slice();
      var resources = (archetype.resourceProfileIds || []).slice();
      if (classDef) {
        abilities = abilities.concat(classDef.baseAbilityGrantIds || []);
        traits = traits.concat(classDef.traitIds || []);
        resources = resources.concat(classDef.resourceProfileIds || []);
      }
      var blueprint = {
        key: key,
        archetypeId: archetype.id,
        classId: classDef && classDef.id || null,
        category: archetype.category,
        rank: archetype.rank,
        resolvedTags: (archetype.tags || []).concat(classDef && classDef.tags || []),
        resolvedProfiles: {
          statProfileId: classDef && classDef.statProfileId || archetype.statProfileId || null,
          resourceProfileIds: resources,
          resistanceProfileId: archetype.resistanceProfileId || null,
          aiProfileId: classDef && classDef.aiProfileId || archetype.aiProfileId || null,
          rewardProfileId: archetype.rewardProfileId || null,
          renderProfileId: archetype.presentation && archetype.presentation.renderProfileId || null,
          tacticsProfileIds: classDef && classDef.tacticsProfileIds || []
        },
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
