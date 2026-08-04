(function () {
  'use strict';
  var Game = window.Game;
  var self = { relation: 'self', shape: 'single' };
  var enemy = { relation: 'hostile', shape: 'single', range: 26 };
  var dmg = function (coefficient, type) {
    return {
      type: 'damage', damageTypeId: type || 'slashing',
      formulaId: 'core.damage.power-coefficient-v1',
      params: { powerStat: 'physicalPower', coefficient: coefficient }
    };
  };
  Game.content.registerPack({
    id: 'job.fighter', version: '2.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/jobs/fighter.pack.js',
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    definitions: {
      statProfile: [{ id: 'stats.fighter', schemaVersion: 1, stats: {} }],
      status: [
        {
          id: 'fighter.guard', schemaVersion: 1, stacking: 'refresh', durationTicks: 120,
          modifiers: [
            { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.35 },
            { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.2 }
          ],
          presentation: { nameKey: 'combat.status.fighter_guard.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'fighter.warcry', schemaVersion: 1, stacking: 'refresh', durationTicks: 160,
          modifiers: [
            { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.16 },
            { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.15 },
            { stat: 'threatMultiplier', phase: 'status', operation: 'multiply', value: 1.5 }
          ],
          presentation: { nameKey: 'combat.status.fighter_warcry.name', icon: 'icon_skill_might' }
        }
      ],
      ability: [
        {
          id: 'fighter.auto_attack', kind: 'action', actionType: 'auto',
          timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 48, queueable: false },
          target: enemy, effects: [dmg(0.68)], aiHints: { priority: 1 },
          presentation: { nameKey: 'combat.ability.fighter_auto.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'fighter.vanguard_slash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 12, cooldownTicks: 0, queueable: true },
          target: enemy, effects: [
            dmg(1.0),
            { type: 'modifyResource', resourceId: 'rage', amount: 12, target: self },
            { type: 'setCombo', comboId: 'fighter.vanguard', step: 1, max: 3, durationTicks: 120, target: self }
          ],
          aiHints: { priority: 18, comboStep: 1 },
          presentation: { nameKey: 'combat.ability.fighter_slash.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'fighter.rising_cut', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 12, cooldownTicks: 0, queueable: true },
          target: enemy, effects: [
            dmg(1.14),
            { type: 'modifyResource', resourceId: 'rage', amount: 15, target: self },
            { type: 'setCombo', comboId: 'fighter.vanguard', step: 1, max: 3, durationTicks: 120, target: self }
          ],
          aiHints: { priority: 35, comboStep: 2 },
          presentation: { nameKey: 'combat.ability.fighter_rising.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'fighter.guard_breaker', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 14, cooldownTicks: 0, queueable: true },
          target: enemy, effects: [
            dmg(1.32, 'blunt'),
            { type: 'modifyResource', resourceId: 'rage', amount: 18, target: self },
            { type: 'setCombo', comboId: 'fighter.vanguard', step: 1, max: 3, durationTicks: 120, target: self }
          ],
          aiHints: { priority: 52, comboStep: 3 },
          presentation: { nameKey: 'combat.ability.fighter_breaker.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'fighter.heavy_slash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 10, animationLockTicks: 14, cooldownTicks: 80, interruptible: true, queueable: true },
          costs: [{ resourceId: 'rage', amount: 40 }],
          target: enemy, effects: [dmg(2.45), { type: 'setCombo', mode: 'consume', target: self }],
          aiHints: { priority: 72, resourceDump: 'rage', resourceAt: 40 },
          presentation: { nameKey: 'combat.ability.fighter_heavy.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'fighter.whirlwind', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 16, cooldownTicks: 160, queueable: true },
          costs: [{ resourceId: 'rage', amount: 35 }],
          target: { relation: 'hostile', shape: 'selfRadius', radius: 68, maxTargets: 8 },
          effects: [dmg(1.45)], aiHints: { priority: 84, minTargets: 2 },
          presentation: { nameKey: 'combat.ability.fighter_whirlwind.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'fighter.guard_stance', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 9, cooldownTicks: 300, queueable: false },
          target: self, effects: [
            { type: 'shield', coefficient: 0.18, durationTicks: 120, target: self },
            { type: 'applyStatus', statusId: 'fighter.guard', target: self }
          ],
          aiHints: { priority: 160, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.fighter_guard.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'fighter.warcry_action', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 9, cooldownTicks: 400, queueable: false },
          target: self, effects: [
            { type: 'applyStatus', statusId: 'fighter.warcry', target: self },
            { type: 'modifyResource', resourceId: 'rage', amount: 20, target: self }
          ],
          aiHints: { priority: 65 },
          presentation: { nameKey: 'combat.ability.fighter_warcry.name', icon: 'icon_skill_might' }
        }
      ],
      trait: [
        {
          id: 'fighter.battle_temper', kind: 'passive',
          modifiers: [{ stat: 'threatMultiplier', phase: 'multiply', operation: 'multiply', value: 1.5 }],
          triggers: [{ event: 'combat:hit', target: 'self', effect: { type: 'modifyResource', resourceId: 'rage', amount: 3 } }],
          presentation: { nameKey: 'combat.trait.fighter_temper.name', icon: 'icon_skill_guard' }
        }
      ],
      class: [{
        id: 'fighter', schemaVersion: 1, roles: ['tank'], tags: ['melee'],
        primaryPowerStat: 'physicalPower',
        baseStats: { maxHp: 150, power: 13, armor: 8, ward: 5.2, speed: 9, critChance: .05, critMultiplier: 1.5, range: 22 },
        growth: { maxHp: 1.078, power: 1.068, armor: 1.068, ward: 1.068, speedPerLevel: .25, critChancePerLevel: .001, critMultiplierPerLevel: .01 },
        equipmentTags: ['adventurer', 'fighter'], weaponAppearance: 'sword',
        evaluationWeights: { offense: .45, survival: .50, economy: .05 },
        statDots: { hp: 5, atk: 3, def: 5, spd: 2, burst: 2 },
        statProfileId: 'stats.fighter', resourceProfileIds: ['resources.fighter'],
        baseAbilityGrantIds: [
          'fighter.auto_attack', 'fighter.vanguard_slash', 'fighter.rising_cut',
          'fighter.guard_breaker', 'fighter.heavy_slash', 'fighter.whirlwind',
          'fighter.guard_stance', 'fighter.warcry_action'
        ],
        traitIds: ['fighter.battle_temper'],
        talentTreeId: 'talents.fighter', equipmentProfileId: 'equipment.adventurer',
        aiProfileId: 'ai.player.standard', tacticsProfileIds: ['balanced', 'safe', 'aggressive'],
        evaluationProfileId: 'evaluation.fighter',
        presentation: {
          nameKey: 'class.fighter.name', spriteId: 'hero_fighter', portraitId: 'face_fighter'
        }
      }],
      talentTree: [{
        id: 'talents.fighter', schemaVersion: 1,
        talentIds: ['ft_heavy', 'ft_tough', 'ft_whirl', 'ft_mastery', 'ft_warcry', 'ft_second']
      }],
      talent: [
        {
          id: 'ft_heavy', classId: 'fighter', unlockLevel: 1, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'fighter.heavy_slash', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 2.3, perRank: 0.15 }
          ] },
          presentation: { nameKey: 'skill.ft_heavy.name', descKey: 'skill.ft_heavy.desc' }
        },
        { id: 'ft_tough', classId: 'fighter', unlockLevel: 2, maxRank: 10, costs: [1], grants: {}, modifiers: [{ stat: 'maxHp', phase: 'addPct', operation: 'addPct', perRank: 0.05 }, { stat: 'armor', phase: 'addPct', operation: 'addPct', perRank: 0.06 }], presentation: { nameKey: 'skill.ft_tough.name', descKey: 'skill.ft_tough.desc' } },
        {
          id: 'ft_whirl', classId: 'fighter', unlockLevel: 3, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'fighter.whirlwind', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 1.5, perRank: 0.1 }
          ] },
          presentation: { nameKey: 'skill.ft_whirl.name', descKey: 'skill.ft_whirl.desc' }
        },
        { id: 'ft_mastery', classId: 'fighter', unlockLevel: 4, maxRank: 10, costs: [1], grants: {}, modifiers: [{ stat: 'physicalPower', phase: 'addPct', operation: 'addPct', perRank: 0.05 }], presentation: { nameKey: 'skill.ft_mastery.name', descKey: 'skill.ft_mastery.desc' } },
        {
          id: 'ft_warcry', classId: 'fighter', unlockLevel: 5, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'fighter.warcry_action', patches: [
            { target: 'status', id: 'fighter.warcry', path: 'modifiers.0.value', baseValue: 1.15, perRank: 0.02 },
            { target: 'status', id: 'fighter.warcry', path: 'modifiers.1.value', baseValue: 1.15, perRank: 0.02 }
          ] },
          presentation: { nameKey: 'skill.ft_warcry.name', descKey: 'skill.ft_warcry.desc' }
        },
        { id: 'ft_second', classId: 'fighter', unlockLevel: 6, maxRank: 10, costs: [1], grants: {}, modifiers: [{ stat: 'healthRegenPct', phase: 'otherFlat', operation: 'add', perRank: 0.0025 }], presentation: { nameKey: 'skill.ft_second.name', descKey: 'skill.ft_second.desc' } }
      ]
    }
  });
})();
