(function () {
  'use strict';
  var Game = window.Game;
  var self = { relation: 'self', shape: 'single' };
  var enemy = { relation: 'hostile', shape: 'single', range: 92 };
  function dmg(c) {
    return { type: 'damage', damageTypeId: 'piercing', formulaId: 'core.damage.power-coefficient-v1', params: { powerStat: 'physicalPower', coefficient: c } };
  }
  Game.content.registerPack({
    id: 'job.ranger', version: '2.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/jobs/ranger.pack.js',
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    definitions: {
      statProfile: [{ id: 'stats.ranger', schemaVersion: 1, stats: {} }],
      status: [
        {
          id: 'ranger.marked', stacking: 'refresh', durationTicks: 240,
          modifiers: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 0.9 }],
          presentation: { nameKey: 'combat.status.ranger_marked.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'ranger.hawk_eye', stacking: 'refresh', durationTicks: 160,
          modifiers: [
            { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.12 },
            { stat: 'critChance', phase: 'status', operation: 'add', value: 0.1 }
          ],
          presentation: { nameKey: 'combat.status.ranger_hawk.name', icon: 'icon_skill_swift' }
        }
      ],
      ability: [
        {
          id: 'ranger.auto_attack', kind: 'action', actionType: 'auto',
          timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 46, queueable: false },
          target: enemy, effects: [dmg(0.68)], aiHints: { priority: 1 },
          presentation: { nameKey: 'combat.ability.ranger_auto.name', icon: 'icon_skill_strike', projectile: 'arrow' }
        },
        {
          id: 'ranger.aimed_shot', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 20, animationLockTicks: 10, cooldownTicks: 0, queueable: true, interruptible: true },
          target: enemy, effects: [dmg(1.12), { type: 'modifyResource', resourceId: 'focus', amount: 12, target: self }],
          aiHints: { priority: 24 }, presentation: { nameKey: 'combat.ability.ranger_aimed.name', icon: 'icon_skill_strike', projectile: 'arrow' }
        },
        {
          id: 'ranger.mark_target', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 180, queueable: false },
          target: enemy, effects: [{ type: 'applyStatus', statusId: 'ranger.marked' }, { type: 'markTarget' }],
          aiHints: { priority: 92 }, presentation: { nameKey: 'combat.ability.ranger_mark.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'ranger.power_shot', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 12, cooldownTicks: 100, queueable: true, interruptible: true },
          costs: [{ resourceId: 'focus', amount: 42 }], target: enemy,
          effects: [dmg(2.45)], aiHints: { priority: 78, resourceDump: 'focus', resourceAt: 42 },
          presentation: { nameKey: 'combat.ability.ranger_power.name', icon: 'icon_skill_strike', projectile: 'arrow' }
        },
        {
          id: 'ranger.multi_shot', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 16, animationLockTicks: 13, cooldownTicks: 160, queueable: true, interruptible: true },
          costs: [{ resourceId: 'focus', amount: 36 }],
          target: { relation: 'hostile', shape: 'circle', range: 92, radius: 74, maxTargets: 5 },
          effects: [dmg(1.35)], aiHints: { priority: 88, minTargets: 2 },
          presentation: { nameKey: 'combat.ability.ranger_multi.name', icon: 'icon_skill_whirl', projectile: 'arrow' }
        },
        {
          id: 'ranger.hawk_eye_action', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 400, queueable: false },
          target: self, effects: [{ type: 'applyStatus', statusId: 'ranger.hawk_eye', target: self }],
          aiHints: { priority: 65 }, presentation: { nameKey: 'combat.ability.ranger_hawk.name', icon: 'icon_skill_swift' }
        },
        {
          id: 'ranger.disengage', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 300, queueable: false },
          target: self, effects: [
            { type: 'shield', coefficient: 0.15, durationTicks: 90, target: self },
            { type: 'movement', distance: 32, target: self }
          ],
          aiHints: { priority: 168, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.ranger_disengage.name', icon: 'icon_skill_guard' }
        }
      ],
      trait: [{
        id: 'ranger.fieldcraft', kind: 'passive',
        modifiers: [
          { stat: 'dropMultiplier', phase: 'multiply', operation: 'multiply', value: 1.06 },
          { stat: 'moveSpeed', phase: 'multiply', operation: 'multiply', value: 1.05 }
        ],
        triggers: [], presentation: { nameKey: 'combat.trait.ranger_fieldcraft.name', icon: 'icon_gold' }
      }],
      class: [{
        id: 'ranger', roles: ['ranged-dps'], tags: ['ranged', 'physical'],
        primaryPowerStat: 'physicalPower',
        baseStats: { maxHp: 112, power: 14, armor: 5, ward: 3.25, speed: 11, critChance: .08, critMultiplier: 1.6, range: 72 },
        growth: { maxHp: 1.073, power: 1.071, armor: 1.06, ward: 1.06, speedPerLevel: .25, critChancePerLevel: .001, critMultiplierPerLevel: .01 },
        equipmentTags: ['adventurer', 'ranger'], weaponAppearance: 'bow',
        evaluationWeights: { offense: .55, survival: .30, economy: .15 },
        statDots: { hp: 3, atk: 3, def: 2, spd: 4, burst: 3 },
        statProfileId: 'stats.ranger', resourceProfileIds: ['resources.ranger'],
        baseAbilityGrantIds: ['ranger.auto_attack', 'ranger.aimed_shot', 'ranger.mark_target', 'ranger.power_shot', 'ranger.multi_shot', 'ranger.hawk_eye_action', 'ranger.disengage'],
        traitIds: ['ranger.fieldcraft'], talentTreeId: 'talents.ranger',
        equipmentProfileId: 'equipment.adventurer', aiProfileId: 'ai.player.standard',
        tacticsProfileIds: ['balanced', 'safe', 'aggressive'], evaluationProfileId: 'evaluation.ranger',
        presentation: {
          nameKey: 'class.ranger.name', spriteId: 'hero_ranger', portraitId: 'face_ranger'
        }
      }],
      talentTree: [{ id: 'talents.ranger', schemaVersion: 1, talentIds: ['rn_power', 'rn_precision', 'rn_multi', 'rn_survival', 'rn_hawk', 'rn_treasure'] }],
      talent: [
        {
          id: 'rn_power', classId: 'ranger', unlockLevel: 1, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'ranger.power_shot', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 2.2, perRank: 0.15 }
          ] },
          presentation: { nameKey: 'skill.rn_power.name', descKey: 'skill.rn_power.desc' }
        },
        { id: 'rn_precision', classId: 'ranger', unlockLevel: 2, maxRank: 10, costs: [1], grants: {}, modifiers: [{ stat: 'critChance', phase: 'otherFlat', operation: 'add', perRank: 0.012 }], presentation: { nameKey: 'skill.rn_precision.name', descKey: 'skill.rn_precision.desc' } },
        {
          id: 'rn_multi', classId: 'ranger', unlockLevel: 3, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'ranger.multi_shot', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 1.3, perRank: 0.08 }
          ] },
          presentation: { nameKey: 'skill.rn_multi.name', descKey: 'skill.rn_multi.desc' }
        },
        { id: 'rn_survival', classId: 'ranger', unlockLevel: 4, maxRank: 10, costs: [1], grants: {}, modifiers: [
          { stat: 'maxHp', phase: 'addPct', operation: 'addPct', perRank: 0.04 },
          { stat: 'gcdSpeed', phase: 'addPct', operation: 'addPct', perRank: 0.02 },
          { stat: 'castSpeed', phase: 'addPct', operation: 'addPct', perRank: 0.02 },
          { stat: 'autoAttackSpeed', phase: 'addPct', operation: 'addPct', perRank: 0.02 }
        ], presentation: { nameKey: 'skill.rn_survival.name', descKey: 'skill.rn_survival.desc' } },
        {
          id: 'rn_hawk', classId: 'ranger', unlockLevel: 5, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'ranger.hawk_eye_action', patches: [
            { target: 'status', id: 'ranger.hawk_eye', path: 'modifiers.0.value', baseValue: 1.1, perRank: 0.015 },
            { target: 'status', id: 'ranger.hawk_eye', path: 'modifiers.1.value', baseValue: 0.1, perRank: 0.01 }
          ] },
          presentation: { nameKey: 'skill.rn_hawk.name', descKey: 'skill.rn_hawk.desc' }
        },
        { id: 'rn_treasure', classId: 'ranger', unlockLevel: 6, maxRank: 10, costs: [1], grants: {}, modifiers: [
          { stat: 'dropMultiplier', phase: 'otherFlat', operation: 'add', perRank: 0.02 },
          { stat: 'goldMultiplier', phase: 'otherFlat', operation: 'add', perRank: 0.03 }
        ], presentation: { nameKey: 'skill.rn_treasure.name', descKey: 'skill.rn_treasure.desc' } }
      ]
    }
  });
})();
