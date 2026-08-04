(function () {
  'use strict';
  var Game = window.Game;
  var self = { relation: 'self', shape: 'single' };
  var enemy = { relation: 'hostile', shape: 'single', range: 68 };
  function dmg(c) {
    return { type: 'damage', damageTypeId: 'radiant', formulaId: 'core.damage.power-coefficient-v1', params: { powerStat: 'magicPower', coefficient: c } };
  }
  Game.content.registerPack({
    id: 'job.cleric', version: '2.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/jobs/cleric.pack.js',
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    definitions: {
      statProfile: [{ id: 'stats.cleric', schemaVersion: 1, stats: {} }],
      status: [{
        id: 'cleric.blessing', stacking: 'refresh', durationTicks: 180,
        modifiers: [
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.2 },
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.25 }
        ],
        presentation: { nameKey: 'combat.status.cleric_blessing.name', icon: 'icon_skill_heal' }
      }],
      ability: [
        {
          id: 'cleric.auto_attack', kind: 'action', actionType: 'auto',
          timing: { castTicks: 0, animationLockTicks: 9, cooldownTicks: 50, queueable: false },
          target: enemy, effects: [dmg(0.62)], aiHints: { priority: 1 },
          presentation: { nameKey: 'combat.ability.cleric_auto.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'cleric.smite', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 14, animationLockTicks: 10, cooldownTicks: 0, queueable: true, interruptible: true },
          costs: [{ resourceId: 'mana', amount: 260 }], target: enemy,
          effects: [
            Object.assign(dmg(1.08), { selfHealRatio: 0.25 }),
            { type: 'modifyResource', resourceId: 'faith', amount: 12, target: self }
          ],
          aiHints: { priority: 24 }, presentation: { nameKey: 'combat.ability.cleric_smite.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'cleric.judgment', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 12, cooldownTicks: 120, queueable: true, interruptible: true },
          costs: [{ resourceId: 'mana', amount: 620 }], target: enemy,
          effects: [dmg(2.0), { type: 'modifyResource', resourceId: 'faith', amount: 18, target: self }],
          aiHints: { priority: 62 }, presentation: { nameKey: 'combat.ability.cleric_judgment.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'cleric.prayer', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 12, cooldownTicks: 180, queueable: true, interruptible: true },
          costs: [{ resourceId: 'mana', amount: 900 }],
          target: { relation: 'ally', shape: 'single', range: 80, sort: 'lowestHp' },
          effects: [{ type: 'heal', maxHpCoefficient: 0.22 }],
          aiHints: { priority: 180, role: 'heal' },
          presentation: { nameKey: 'combat.ability.cleric_prayer.name', icon: 'icon_skill_heal' }
        },
        {
          id: 'cleric.holy_nova', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 14, cooldownTicks: 220, queueable: true, interruptible: true },
          costs: [{ resourceId: 'faith', amount: 45 }],
          target: { relation: 'hostile', shape: 'selfRadius', radius: 68, maxTargets: 8 },
          effects: [
            dmg(1.38),
            { type: 'heal', maxHpCoefficient: 0.08, target: self }
          ],
          aiHints: { priority: 88, minTargets: 2 },
          presentation: { nameKey: 'combat.ability.cleric_nova.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'cleric.aegis', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 9, cooldownTicks: 360, queueable: false },
          costs: [{ resourceId: 'faith', amount: 25 }], target: self,
          effects: [
            { type: 'shield', coefficient: 0.22, durationTicks: 160, target: self },
            { type: 'applyStatus', statusId: 'cleric.blessing', target: self }
          ],
          aiHints: { priority: 168, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.cleric_aegis.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'cleric.radiant_interrupt', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 9, cooldownTicks: 300, queueable: false },
          target: enemy, effects: [{ type: 'interrupt', power: 1.35 }],
          aiHints: { priority: 220, role: 'interrupt' },
          presentation: { nameKey: 'combat.ability.cleric_interrupt.name', icon: 'icon_skill_might' }
        }
      ],
      trait: [{
        id: 'cleric.solo_ministry', kind: 'passive',
        modifiers: [
          { stat: 'healingPower', phase: 'multiply', operation: 'multiply', value: 1.12 },
          { stat: 'magicPower', phase: 'multiply', operation: 'multiply', value: 1.05 }
        ],
        triggers: [], presentation: { nameKey: 'combat.trait.cleric_ministry.name', icon: 'icon_skill_heal' }
      }],
      class: [{
        id: 'cleric', roles: ['healer', 'support'], tags: ['ranged', 'radiant'],
        primaryPowerStat: 'magicPower',
        baseStats: { maxHp: 135, power: 12, armor: 7, ward: 4.55, speed: 8.5, critChance: .05, critMultiplier: 1.5, range: 22 },
        growth: { maxHp: 1.077, power: 1.066, armor: 1.068, ward: 1.068, speedPerLevel: .25, critChancePerLevel: .001, critMultiplierPerLevel: .01 },
        equipmentTags: ['adventurer', 'cleric'], weaponAppearance: 'mace',
        evaluationWeights: { offense: .45, survival: .50, economy: .05 },
        statDots: { hp: 4, atk: 2, def: 4, spd: 1, burst: 2 },
        statProfileId: 'stats.cleric', resourceProfileIds: ['resources.cleric'],
        baseAbilityGrantIds: ['cleric.auto_attack', 'cleric.smite', 'cleric.judgment', 'cleric.prayer', 'cleric.holy_nova', 'cleric.aegis', 'cleric.radiant_interrupt'],
        traitIds: ['cleric.solo_ministry'], talentTreeId: 'talents.cleric',
        equipmentProfileId: 'equipment.adventurer', aiProfileId: 'ai.player.standard',
        tacticsProfileIds: ['balanced', 'safe', 'aggressive'], evaluationProfileId: 'evaluation.cleric',
        presentation: {
          nameKey: 'class.cleric.name', spriteId: 'hero_cleric', portraitId: 'face_cleric'
        }
      }],
      talentTree: [{ id: 'talents.cleric', schemaVersion: 1, talentIds: ['cl_smite', 'cl_faith', 'cl_prayer', 'cl_bless', 'cl_nova', 'cl_radiance'] }],
      talent: [
        {
          id: 'cl_smite', classId: 'cleric', unlockLevel: 1, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'cleric.smite', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 2.0, perRank: 0.14 }
          ] },
          presentation: { nameKey: 'skill.cl_smite.name', descKey: 'skill.cl_smite.desc' }
        },
        { id: 'cl_faith', classId: 'cleric', unlockLevel: 2, maxRank: 10, costs: [1], grants: {}, modifiers: [
          { stat: 'maxHp', phase: 'addPct', operation: 'addPct', perRank: 0.05 },
          { stat: 'armor', phase: 'addPct', operation: 'addPct', perRank: 0.03 }
        ], presentation: { nameKey: 'skill.cl_faith.name', descKey: 'skill.cl_faith.desc' } },
        {
          id: 'cl_prayer', classId: 'cleric', unlockLevel: 3, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'cleric.prayer', patches: [
            { path: 'effects.0.maxHpCoefficient', baseValue: 0.22, perRank: 0.02 }
          ] },
          presentation: { nameKey: 'skill.cl_prayer.name', descKey: 'skill.cl_prayer.desc' }
        },
        { id: 'cl_bless', classId: 'cleric', unlockLevel: 4, maxRank: 10, costs: [1], grants: {}, modifiers: [{ stat: 'healingPower', phase: 'addPct', operation: 'addPct', perRank: 0.06 }], presentation: { nameKey: 'skill.cl_bless.name', descKey: 'skill.cl_bless.desc' } },
        {
          id: 'cl_nova', classId: 'cleric', unlockLevel: 5, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'cleric.holy_nova', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 1.4, perRank: 0.09 }
          ] },
          presentation: { nameKey: 'skill.cl_nova.name', descKey: 'skill.cl_nova.desc' }
        },
        { id: 'cl_radiance', classId: 'cleric', unlockLevel: 6, maxRank: 10, costs: [1], grants: {}, modifiers: [{ stat: 'lifesteal', phase: 'otherFlat', operation: 'add', perRank: 0.01 }], presentation: { nameKey: 'skill.cl_radiance.name', descKey: 'skill.cl_radiance.desc' } }
      ]
    }
  });
})();
