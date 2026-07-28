(function () {
  'use strict';
  var Game = window.Game, D = Game.v2Content.damage;
  Game.content.registerPack(Game.v2Content.regionPack({
    regionId: 'darkcastle', factionId: 'demon_army',
    sourceFile: 'js/data/packs/regions/darkcastle.js',
    statuses: [
      {
        id: 'darkcastle.cursed', stacking: 'refresh', durationTicks: 150,
        modifiers: [
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 0.88 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 0.88 },
          { stat: 'healingPower', phase: 'status', operation: 'multiply', value: 0.75 }
        ],
        presentation: { nameKey: 'combat.status.cursed.name', icon: 'icon_skill_poison' }
      },
      {
        id: 'darkcastle.petrified', stacking: 'refresh', durationTicks: 26,
        modifiers: [
          { stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.25 },
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 0.7 }
        ],
        presentation: { nameKey: 'combat.status.petrified.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'demon_lord.bulwark', stacking: 'refresh', durationTicks: 140,
        modifiers: [
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.42 },
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.42 }
        ],
        presentation: { nameKey: 'combat.status.demon_bulwark.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'demon_lord.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.26 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 1.26 },
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.2 },
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.2 }
        ],
        presentation: { nameKey: 'combat.status.tyrant_phase.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'demon_soldier', mods: { hp: 1.1, atk: 1.1 }, damageType: 'slashing',
        abilityIds: ['demon_soldier.cursed_cleave'],
        abilities: [{
          id: 'demon_soldier.cursed_cleave', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 12, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 36, radius: 34, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 34, expectedDamagePct: 0.15 },
          effects: [D('slashing', 1.3), { type: 'applyStatus', statusId: 'darkcastle.cursed' }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.cursed_cleave.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'physicalPower', phase: 'multiply', operation: 'multiply', value: 1.06 }]
      },
      {
        id: 'gargoyle', mods: { hp: 1.2, atk: 1, def: 1.6 }, movementTypes: ['flying'],
        damageType: 'blunt', abilityIds: ['gargoyle.petrifying_gaze'],
        abilities: [{
          id: 'gargoyle.petrifying_gaze', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 26, animationLockTicks: 11, cooldownTicks: 170, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 58 },
          effects: [D('necrotic', 0.9), { type: 'applyStatus', statusId: 'darkcastle.petrified' }],
          aiHints: { priority: 70 }, presentation: { nameKey: 'combat.ability.petrifying_gaze.name', icon: 'icon_skill_guard' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.22 }]
      }
    ],
    boss: {
      id: 'demon_lord', mods: { hp: 1.3, atk: 1.15 }, damageType: 'necrotic', range: 72, scale: 1.35,
      abilityIds: ['demon_lord.abyssal_blade', 'demon_lord.dark_edict', 'demon_lord.bulwark_action'],
      abilities: [
        {
          id: 'demon_lord.abyssal_blade', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 32, animationLockTicks: 15, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 44, radius: 40, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 40, expectedDamagePct: 0.24 },
          effects: [D('necrotic', 2.0), { type: 'applyStatus', statusId: 'darkcastle.cursed' }],
          aiHints: { priority: 84 }, presentation: { nameKey: 'combat.ability.abyssal_blade.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'demon_lord.dark_edict', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 38, animationLockTicks: 15, cooldownTicks: 230, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 76, radius: 56, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 56, expectedDamagePct: 0.27 },
          effects: [
            { type: 'repeat', times: 2, effects: [D('necrotic', 1.05)] },
            { type: 'applyStatus', statusId: 'darkcastle.cursed' }
          ],
          aiHints: { priority: 92 }, presentation: { nameKey: 'combat.ability.dark_edict.name', icon: 'icon_skill_fire' }
        },
        {
          id: 'demon_lord.bulwark_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 12, cooldownTicks: 340, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.28, durationTicks: 140, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'demon_lord.bulwark', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 122, role: 'defensive' }, presentation: { nameKey: 'combat.ability.demon_bulwark.name', icon: 'icon_skill_guard' }
        }
      ],
      traitModifiers: [{ stat: 'tenacity', phase: 'otherFlat', operation: 'add', value: 0.85 }],
      phaseStatusId: 'demon_lord.phase2'
    }
  }));
})();
