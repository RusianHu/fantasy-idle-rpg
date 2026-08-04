(function () {
  'use strict';
  var Game = window.Game;
  var self = { relation: 'self', shape: 'single' };
  var enemy = { relation: 'hostile', shape: 'single', range: 26 };
  function dmg(c, type) {
    return { type: 'damage', damageTypeId: type || 'piercing', formulaId: 'core.damage.power-coefficient-v1', params: { powerStat: 'physicalPower', coefficient: c } };
  }
  Game.content.registerPack({
    id: 'job.rogue', version: '2.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/jobs/rogue.pack.js',
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    definitions: {
      statProfile: [{ id: 'stats.rogue', schemaVersion: 1, stats: {} }],
      status: [
        {
          id: 'rogue.poison', stacking: 'stack', maxStacks: 5, durationTicks: 160,
          periodicIntervalTicks: 20,
          periodic: [{
            type: 'damage', damageTypeId: 'poison',
            formulaId: 'core.damage.power-coefficient-v1',
            params: { powerStat: 'physicalPower', coefficient: 0.16 }, canCrit: false
          }],
          presentation: { nameKey: 'combat.status.rogue_poison.name', icon: 'icon_skill_poison' }
        },
        {
          id: 'rogue.evasion', stacking: 'refresh', durationTicks: 100,
          modifiers: [{ stat: 'dodgeChance', phase: 'status', operation: 'add', value: 0.28 }],
          presentation: { nameKey: 'combat.status.rogue_evasion.name', icon: 'icon_skill_swift' }
        }
      ],
      ability: [
        {
          id: 'rogue.auto_attack', kind: 'action', actionType: 'auto',
          timing: { castTicks: 0, animationLockTicks: 7, cooldownTicks: 42, queueable: false },
          target: enemy, effects: [dmg(0.62)], aiHints: { priority: 1 },
          presentation: { nameKey: 'combat.ability.rogue_auto.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'rogue.quick_stab', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 10, cooldownTicks: 0, queueable: true },
          costs: [{ resourceId: 'energy', amount: 28 }], target: enemy,
          effects: [dmg(1.05), { type: 'modifyResource', resourceId: 'comboPoints', amount: 1, target: self }],
          aiHints: { priority: 25 }, presentation: { nameKey: 'combat.ability.rogue_stab.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'rogue.poison_blade', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 11, cooldownTicks: 100, queueable: true },
          costs: [{ resourceId: 'energy', amount: 34 }], target: enemy,
          effects: [dmg(0.9), { type: 'applyStatus', statusId: 'rogue.poison' }, { type: 'modifyResource', resourceId: 'comboPoints', amount: 1, target: self }],
          aiHints: { priority: 48 }, presentation: { nameKey: 'combat.ability.rogue_poison.name', icon: 'icon_skill_poison' }
        },
        {
          id: 'rogue.backstab', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 12, cooldownTicks: 60, queueable: true },
          costs: [{ resourceId: 'energy', amount: 42 }], target: enemy,
          effects: [
            Object.assign(dmg(1.75), { critChanceBonus: 0.25 }),
            { type: 'modifyResource', resourceId: 'comboPoints', amount: 2, target: self }
          ],
          aiHints: { priority: 62 }, presentation: { nameKey: 'combat.ability.rogue_backstab.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'rogue.eviscerate', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 14, cooldownTicks: 0, queueable: true },
          costs: [{ resourceId: 'comboPoints', amount: 4 }], target: enemy,
          effects: [dmg(2.7)], aiHints: { priority: 95, finisher: true, minCombo: 4 },
          presentation: { nameKey: 'combat.ability.rogue_eviscerate.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'rogue.fan_of_knives', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 13, cooldownTicks: 140, queueable: true },
          costs: [{ resourceId: 'energy', amount: 48 }],
          target: { relation: 'hostile', shape: 'selfRadius', radius: 62, maxTargets: 8 },
          effects: [dmg(1.16)], aiHints: { priority: 82, minTargets: 2 },
          presentation: { nameKey: 'combat.ability.rogue_fan.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'rogue.evasion_action', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 360, queueable: false },
          target: self, effects: [{ type: 'applyStatus', statusId: 'rogue.evasion', target: self }],
          aiHints: { priority: 170, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.rogue_evasion.name', icon: 'icon_skill_swift' }
        }
      ],
      trait: [{
        id: 'rogue.opportunist', kind: 'passive',
        modifiers: [{ stat: 'critChance', phase: 'otherFlat', operation: 'add', value: 0.04 }],
        triggers: [], presentation: { nameKey: 'combat.trait.rogue_opportunist.name', icon: 'icon_skill_strike' }
      }],
      class: [{
        id: 'rogue', roles: ['melee-dps'], tags: ['melee', 'crit'],
        primaryPowerStat: 'physicalPower',
        baseStats: { maxHp: 105, power: 15, armor: 4, ward: 2.6, speed: 12.5, critChance: .12, critMultiplier: 1.7, range: 22 },
        growth: { maxHp: 1.072, power: 1.071, armor: 1.06, ward: 1.06, speedPerLevel: .25, critChancePerLevel: .001, critMultiplierPerLevel: .01 },
        equipmentTags: ['adventurer', 'rogue'], weaponAppearance: 'dagger',
        evaluationWeights: { offense: .65, survival: .30, economy: .05 },
        statDots: { hp: 2, atk: 4, def: 1, spd: 5, burst: 4 },
        statProfileId: 'stats.rogue', resourceProfileIds: ['resources.rogue'],
        baseAbilityGrantIds: ['rogue.auto_attack', 'rogue.quick_stab', 'rogue.poison_blade', 'rogue.backstab', 'rogue.eviscerate', 'rogue.fan_of_knives', 'rogue.evasion_action'],
        traitIds: ['rogue.opportunist'], talentTreeId: 'talents.rogue',
        equipmentProfileId: 'equipment.adventurer', aiProfileId: 'ai.player.standard',
        tacticsProfileIds: ['balanced', 'safe', 'aggressive'], evaluationProfileId: 'evaluation.rogue',
        presentation: {
          nameKey: 'class.rogue.name', spriteId: 'hero_rogue', portraitId: 'face_rogue'
        }
      }],
      talentTree: [{ id: 'talents.rogue', schemaVersion: 1, talentIds: ['rg_backstab', 'rg_swift', 'rg_poison', 'rg_deadly', 'rg_flurry', 'rg_evasion'] }],
      talent: [
        {
          id: 'rg_backstab', classId: 'rogue', unlockLevel: 1, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'rogue.backstab', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 1.9, perRank: 0.13 }
          ] },
          presentation: { nameKey: 'skill.rg_backstab.name', descKey: 'skill.rg_backstab.desc' }
        },
        { id: 'rg_swift', classId: 'rogue', unlockLevel: 2, maxRank: 10, costs: [1], grants: {}, modifiers: [
          { stat: 'gcdSpeed', phase: 'addPct', operation: 'addPct', perRank: 0.025 },
          { stat: 'castSpeed', phase: 'addPct', operation: 'addPct', perRank: 0.025 },
          { stat: 'autoAttackSpeed', phase: 'addPct', operation: 'addPct', perRank: 0.025 }
        ], presentation: { nameKey: 'skill.rg_swift.name', descKey: 'skill.rg_swift.desc' } },
        {
          id: 'rg_poison', classId: 'rogue', unlockLevel: 3, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'rogue.poison_blade', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 1.2, perRank: 0.08 },
            { target: 'status', id: 'rogue.poison', path: 'durationTicks', baseValue: 80, perRank: 0 },
            { target: 'status', id: 'rogue.poison', path: 'periodic.0.params.coefficient', baseValue: 0.2, perRank: 0.02 }
          ] },
          presentation: { nameKey: 'skill.rg_poison.name', descKey: 'skill.rg_poison.desc' }
        },
        { id: 'rg_deadly', classId: 'rogue', unlockLevel: 4, maxRank: 10, costs: [1], grants: {}, modifiers: [
          { stat: 'critChance', phase: 'otherFlat', operation: 'add', perRank: 0.012 },
          { stat: 'critMultiplier', phase: 'otherFlat', operation: 'add', perRank: 0.05 }
        ], presentation: { nameKey: 'skill.rg_deadly.name', descKey: 'skill.rg_deadly.desc' } },
        {
          id: 'rg_flurry', classId: 'rogue', unlockLevel: 5, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'rogue.fan_of_knives', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 1.3, perRank: 0.08 }
          ] },
          presentation: { nameKey: 'skill.rg_flurry.name', descKey: 'skill.rg_flurry.desc' }
        },
        { id: 'rg_evasion', classId: 'rogue', unlockLevel: 6, maxRank: 10, costs: [1], grants: {}, modifiers: [
          { stat: 'dodgeChance', phase: 'otherFlat', operation: 'add', perRank: 0.015 }
        ], presentation: { nameKey: 'skill.rg_evasion.name', descKey: 'skill.rg_evasion.desc' } }
      ]
    }
  });
})();
