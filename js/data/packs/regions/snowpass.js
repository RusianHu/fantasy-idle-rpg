(function () {
  'use strict';
  var Game = window.Game, D = Game.v2Content.damage;
  Game.content.registerPack(Game.v2Content.regionPack({
    regionId: 'snowpass', factionId: 'frost_clans',
    sourceFile: 'js/data/packs/regions/snowpass.js',
    statuses: [
      {
        id: 'snowpass.chilled', stacking: 'stack', maxStacks: 4, durationTicks: 140,
        modifiers: [
          { stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.9 },
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 0.94 }
        ],
        presentation: { nameKey: 'combat.status.chilled.name', icon: 'icon_skill_swift' }
      },
      {
        id: 'snowpass.exposed', stacking: 'refresh', durationTicks: 100,
        modifiers: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 0.82 }],
        presentation: { nameKey: 'combat.status.exposed.name', icon: 'icon_skill_strike' }
      },
      {
        id: 'frost_giant.glacial_armor', stacking: 'refresh', durationTicks: 140,
        modifiers: [
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.4 },
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.3 }
        ],
        presentation: { nameKey: 'combat.status.glacial_armor.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'frost_giant.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.2 },
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.22 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'ice_wolf', mods: { hp: 1, atk: 1.1, spd: 2.5 }, damageType: 'frost',
        abilityIds: ['ice_wolf.frost_fang'],
        abilities: [{
          id: 'ice_wolf.frost_fang', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 8, animationLockTicks: 10, cooldownTicks: 120, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 34 },
          effects: [D('frost', 1.12), { type: 'applyStatus', statusId: 'snowpass.chilled' }],
          aiHints: { priority: 64 }, presentation: { nameKey: 'combat.ability.frost_fang.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'moveSpeed', phase: 'multiply', operation: 'multiply', value: 1.12 }]
      },
      {
        id: 'yeti_small', mods: { hp: 1.25, atk: 1, spd: -1.5 }, damageType: 'blunt',
        abilityIds: ['yeti_small.charged_smash'],
        abilities: [{
          id: 'yeti_small.charged_smash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 13, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 30 },
          telegraph: { shape: 'single', radius: 20, expectedDamagePct: 0.18 },
          effects: [D('blunt', 1.55), { type: 'applyStatus', statusId: 'snowpass.exposed' }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.yeti_smash.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'maxHp', phase: 'multiply', operation: 'multiply', value: 1.08 }]
      }
    ],
    boss: {
      id: 'frost_giant', mods: { hp: 1.08, atk: 1.05, spd: -1.5 }, damageType: 'blunt', scale: 1.35,
      abilityIds: ['frost_giant.ice_lance', 'frost_giant.avalanche', 'frost_giant.glacial_armor_action'],
      abilities: [
        {
          id: 'frost_giant.ice_lance', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 14, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'line', range: 82, radius: 20, maxTargets: 4 },
          telegraph: { shape: 'line', radius: 20, expectedDamagePct: 0.2 },
          effects: [D('frost', 1.76), { type: 'applyStatus', statusId: 'snowpass.chilled' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.ice_lance.name', icon: 'icon_skill_fire' }
        },
        {
          id: 'frost_giant.avalanche', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 40, animationLockTicks: 15, cooldownTicks: 220, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 74, radius: 54, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 54, expectedDamagePct: 0.24 },
          effects: [D('frost', 2.0), { type: 'applyStatus', statusId: 'snowpass.exposed' }],
          aiHints: { priority: 88 }, presentation: { nameKey: 'combat.ability.avalanche.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'frost_giant.glacial_armor_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 12, cooldownTicks: 320, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.2, durationTicks: 140, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'frost_giant.glacial_armor', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 116, role: 'defensive' }, presentation: { nameKey: 'combat.ability.glacial_armor.name', icon: 'icon_skill_guard' }
        }
      ],
      traitModifiers: [{ stat: 'tenacity', phase: 'otherFlat', operation: 'add', value: 0.7 }],
      phaseStatusId: 'frost_giant.phase2'
    }
  }));
})();
