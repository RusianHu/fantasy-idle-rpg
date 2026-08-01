/* Deterministic authoring factory for one independently registered guard-pool monster. */
(function () {
  'use strict';
  var Game = window.Game;
  Game.contentSupport.register({
    id: 'authoring.guard-monster-factory', version: '1.0.0',
    requires: [{ id: 'authoring.combat-formulas', range: '^1.0.0' }],
    capabilities: ['authoring.read', 'authoring.write'],
    sourceFile: 'js/data/packs/guardians/factory.support.js',
    install: function (capabilities) {
      var balance = capabilities.authoring.value('balance.combat');
      function damage(type, coefficient) {
        return {
          type: 'damage', damageTypeId: type,
          formulaId: 'core.damage.power-coefficient-v1',
          params: { powerStat: ['slashing', 'piercing', 'blunt'].indexOf(type) >= 0
            ? 'physicalPower' : 'magicPower', coefficient: coefficient }
        };
      }

      function stat(id, spec) {
        var guard = spec.role === 'guardian';
        var hp = balance.monster.hpBase * (guard ? 1.65 : 1.08);
        var power = balance.monster.powerBase * (guard ? 1.18 : 1.24);
        var defense = balance.monster.defenseBase * (guard ? 1.42 : 0.94);
        return {
          id: 'stats.' + id, stats: {
            maxHp: { base: hp, tierScale: balance.monster.hpTierScale },
            armor: { base: defense, tierScale: balance.monster.defenseTierScale },
            ward: { base: defense * 0.82, tierScale: balance.monster.defenseTierScale },
            physicalPower: { base: power, tierScale: balance.monster.powerTierScale },
            magicPower: { base: power, tierScale: balance.monster.powerTierScale },
            accuracy: 0.92, gcdSpeed: guard ? 0.9 : 1.02, castSpeed: 1,
            autoAttackSpeed: guard ? 0.9 : 1.04, cooldownRate: 1,
            moveSpeed: guard ? 34 : 43, range: spec.range || 27,
            critChance: guard ? 0.03 : 0.08, critMultiplier: 1.5,
            dodgeChance: guard ? 0.01 : 0.08,
            healingPower: { base: power, tierScale: balance.monster.powerTierScale },
            shieldPower: { base: hp, tierScale: balance.monster.hpTierScale },
            lifesteal: 0, statusPotency: guard ? 1.15 : 1.25,
            tenacity: guard ? 0.34 : 0.14, interruptPower: 1,
            threatMultiplier: 1, resourceRegen: 1,
            expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
          }
        };
      }

      function statusDefinition(id, spec, statusId) {
        var guardModifiers = {
          badger_brambleback: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 1.3 }],
          owlbear_mossclaw: [{ stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.16 }],
          crab_oreplate: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 1.34 }, { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.22 }],
          knight_cryptbound: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 1.25 }, { stat: 'tenacity', phase: 'status', operation: 'add', value: 0.16 }],
          troll_rimehide: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 1.12 }],
          tortoise_basalt: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 1.28 }, { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.28 }],
          warden_galeforged: [{ stat: 'ward', phase: 'status', operation: 'multiply', value: 1.42 }],
          minotaur_ironhorn: [{ stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.18 }]
        };
        var hunterModifiers = {
          mantis_vineblade: [{ stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.3 }],
          worm_dustmaw: [{ stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.62 }, { stat: 'accuracy', phase: 'status', operation: 'multiply', value: 0.82 }],
          spider_ossuary: [{ stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.28 }],
          leopard_snowveil: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 0.78 }],
          serpent_cloudcoil: [{ stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 0.72 }],
          stalker_shadeclaw: [{ stat: 'ward', phase: 'status', operation: 'multiply', value: 0.78 }, { stat: 'healingPower', phase: 'status', operation: 'multiply', value: 0.75 }]
        };
        var definition = {
          id: statusId, stacking: spec.role === 'guardian' ? 'refresh' : 'stack',
          maxStacks: spec.role === 'guardian' ? 1 : 3,
          durationTicks: spec.role === 'guardian' ? 100 : 100,
          modifiers: spec.role === 'guardian'
            ? (guardModifiers[id] || [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 1.24 }])
            : (hunterModifiers[id] || [{ stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.82 }]),
          presentation: { nameKey: 'combat.status.' + id + '.name', icon: spec.role === 'guardian' ? 'icon_skill_guard' : 'icon_skill_strike' }
        };
        if (id === 'troll_rimehide') {
          definition.periodicIntervalTicks = 24;
          definition.periodic = [{ type: 'heal', coefficient: 0.28, target: { relation: 'self', shape: 'single' } }];
        }
        if (id === 'lizard_reedstalker' || id === 'scorpion_cindertail') {
          definition.periodicIntervalTicks = 20;
          definition.periodic = [Object.assign(damage(id === 'scorpion_cindertail' ? 'fire' : 'slashing', id === 'scorpion_cindertail' ? 0.14 : 0.1), { canCrit: false })];
        }
        if (id === 'stalker_shadeclaw') {
          definition.periodicIntervalTicks = 24;
          definition.periodic = [Object.assign(damage('necrotic', 0.11), { canCrit: false })];
        }
        return definition;
      }

      function specialDefinition(id, spec, statusId) {
        var self = { relation: 'self', shape: 'single' };
        var hostile = { relation: 'hostile', shape: 'single', range: spec.range || 34 };
        var ability = {
          id: id + '.special', kind: 'action', actionType: 'gcd',
          timing: { castTicks: spec.role === 'guardian' ? 22 : 10, animationLockTicks: 12,
            cooldownTicks: spec.role === 'guardian' ? 190 : 145, queueable: true, interruptible: true },
          target: spec.role === 'guardian' ? self : hostile,
          effects: spec.role === 'guardian'
            ? [{ type: 'shield', coefficient: 0.22, durationTicks: 120, target: self }, { type: 'applyStatus', statusId: statusId, target: self }]
            : [damage(spec.damageType, 1.28), { type: 'applyStatus', statusId: statusId }],
          aiHints: { priority: spec.role === 'guardian' ? 92 : 78, role: spec.role === 'guardian' ? 'defensive' : 'damage' },
          presentation: { nameKey: 'combat.ability.' + id + '_special.name', icon: spec.role === 'guardian' ? 'icon_skill_guard' : 'icon_skill_strike' }
        };
        if (id === 'owlbear_mossclaw') {
          ability.target = { relation: 'hostile', shape: 'circle', range: 42, radius: 38, maxTargets: 4 };
          ability.effects = [damage('slashing', 0.68), { type: 'knockback', distance: 10 }, { type: 'applyStatus', statusId: statusId, target: self }];
          ability.aiHints.role = 'control';
        } else if (id === 'crab_oreplate' || id === 'tortoise_basalt' || id === 'warden_galeforged') {
          ability.effects[0].coefficient = id === 'warden_galeforged' ? 0.3 : 0.28;
        } else if (id === 'troll_rimehide') {
          ability.effects = [{ type: 'heal', maxHpCoefficient: 0.1, target: self }, { type: 'applyStatus', statusId: statusId, target: self }];
          ability.aiHints.role = 'heal';
        } else if (id === 'minotaur_ironhorn') {
          ability.target = hostile;
          ability.effects = [{ type: 'movement', distance: 18 }, damage('blunt', 1.36), { type: 'knockback', distance: 18 }, { type: 'applyStatus', statusId: statusId, target: self }];
          ability.aiHints.role = 'control';
        } else if (id === 'worm_dustmaw') {
          ability.target = { relation: 'hostile', shape: 'circle', range: 40, radius: 36, maxTargets: 4 };
          ability.effects = [damage('blunt', 0.92), { type: 'knockback', distance: 12 }, { type: 'applyStatus', statusId: statusId }];
          ability.aiHints.role = 'control';
        } else if (id === 'leopard_snowveil') {
          ability.effects.unshift({ type: 'movement', distance: 18 });
        } else if (id === 'serpent_cloudcoil') {
          ability.target = { relation: 'hostile', shape: 'circle', range: 68, radius: 34, maxTargets: 3 };
          ability.effects = [{ type: 'repeat', times: 2, effects: [damage('lightning', 0.64)] }, { type: 'applyStatus', statusId: statusId }];
        }
        return ability;
      }

      function monsterPack(spec) {
        var id = spec.id, guard = spec.role === 'guardian';
        var statusId = id + (guard ? '.fortified' : '.marked');
        var specialId = id + '.special';
        var packId = spec.regionId + '.special.' + id;
        return {
          id: 'monster.guard.' + id, version: '1.0.0', schemaVersion: 1,
          sourceFile: spec.sourceFile,
          requires: [{ id: 'core.combat', range: '^2.0.0' }, { id: 'world.actors', range: '^2.0.0' }],
          locales: {
            'zh-CN': (function () {
              var out = {};
              out['monster.' + id + '.name'] = spec.zhName;
              out['monster.' + id + '.desc'] = spec.zhDesc;
              out['combat.lore.' + id] = spec.zhLore;
              out['combat.ability.' + id + '_basic.name'] = spec.zhBasic;
              out['combat.ability.' + id + '_special.name'] = spec.zhSpecial;
              out['combat.trait.' + id + '.name'] = spec.zhTrait;
              out['combat.status.' + id + '.name'] = guard ? '领地戒备' : '猎手标记';
              return out;
            })(),
            en: (function () {
              var out = {};
              out['monster.' + id + '.name'] = spec.enName;
              out['monster.' + id + '.desc'] = spec.enDesc;
              out['combat.lore.' + id] = spec.enLore;
              out['combat.ability.' + id + '_basic.name'] = spec.enBasic;
              out['combat.ability.' + id + '_special.name'] = spec.enSpecial;
              out['combat.trait.' + id + '.name'] = spec.enTrait;
              out['combat.status.' + id + '.name'] = guard ? 'Territorial Guard' : 'Hunter Mark';
              return out;
            })()
          },
          definitions: {
            statProfile: [stat(id, spec)],
            status: [statusDefinition(id, spec, statusId)],
            ability: [{
              id: id + '.basic', kind: 'action', actionType: 'gcd',
              timing: { castTicks: 0, animationLockTicks: 10, cooldownTicks: 0, queueable: true },
              target: { relation: 'hostile', shape: 'single', range: spec.range || 27 },
              effects: [damage(spec.damageType, guard ? 0.84 : 0.92)], aiHints: { priority: 12 },
              presentation: { nameKey: 'combat.ability.' + id + '_basic.name', icon: 'icon_skill_strike' }
            }, specialDefinition(id, spec, statusId)],
            trait: [{
              id: id + '.trait', kind: 'passive', tags: [guard ? 'guardian' : 'ambusher'],
              modifiers: [{ stat: guard ? 'tenacity' : 'dodgeChance', phase: 'otherFlat', operation: 'add', value: guard ? 0.12 : 0.04 }],
              triggers: [], presentation: { nameKey: 'combat.trait.' + id + '.name', icon: guard ? 'icon_skill_guard' : 'icon_skill_strike' }
            }],
            rewardProfile: [{
              id: 'reward.' + id,
              exp: { base: balance.monster.rewardExpBase * (guard ? 1.15 : 1.1), tierScale: balance.monster.rewardExpTierScale },
              gold: { base: balance.monster.rewardGoldBase * (guard ? 1.15 : 1.1), tierScale: balance.monster.rewardGoldTierScale },
              dropBudget: guard ? 1.15 : 1.1
            }],
            actorArchetype: [{
              id: id, category: 'monster', rank: 'normal',
              identity: { nameKey: 'monster.' + id + '.name', descKey: 'monster.' + id + '.desc', loreKey: 'combat.lore.' + id },
              presentation: { spriteId: id, portraitId: id, scale: guard ? 1.12 : 1, renderProfileId: 'render.actor.standard' },
              body: { size: guard ? 'large' : 'medium', collisionRadius: guard ? 10 : 8, movementTypes: spec.movementTypes || ['ground'] },
              tags: ['normal', 'encounter-pool', guard ? 'territory-guardian' : 'ambush-hunter'],
              defaultFactionId: spec.factionId, statProfileId: 'stats.' + id,
              resourceProfileIds: [], abilityGrantIds: [id + '.basic', specialId], traitIds: [id + '.trait'],
              resistanceProfileId: 'resist.standard', aiProfileId: 'ai.monster.standard',
              rewardProfileId: 'reward.' + id, interactionProfileId: 'interaction.hostile',
              engagementPolicyId: 'engagement.hostile', legacy: { tier: spec.tier, mods: {}, boss: false, scale: guard ? 1.12 : 1 }
            }],
            encounterPack: [{
              id: packId, members: [{ slotId: 'special', archetypeId: id }],
              formation: { spacing: 0 }, leashRadius: guard ? 156 : 142,
              rewardBudget: 1, groupAlert: true, ambushEligible: !guard
            }],
            worldSpawnProfile: [{
              id: 'spawn.' + packId, encounterPackId: packId, mountTo: [],
              identity: { scope: 'regionStable', socialGroupId: 'social.' + spec.factionId },
              placement: { selector: 'layoutEntity', source: 'encounterSite', required: false,
                onFailure: 'skipOptional', occupancyRadius: guard ? 14 : 11 },
              lifecycle: { activation: 'poolRequested', unload: 'despawn', onDefeat: 'closeLease',
                onEscape: 'closeLease', respawn: { mode: 'none', resetVariant: true } },
              offlineEligible: false
            }]
          }
        };
      }

      capabilities.authoring.provideFactory({ id: 'guard.monster.pack', version: 1, fn: monsterPack });
    }
  });
})();
