(function () {
  'use strict';
  var Game = window.Game, D = Game.v2Content.damage;
  Game.content.registerPack(Game.v2Content.regionPack({
    regionId: 'mine', factionId: 'mine_denizens',
    sourceFile: 'js/data/packs/regions/mine.js',
    statuses: [
      {
        id: 'mine.disoriented', stacking: 'refresh', durationTicks: 100,
        modifiers: [{ stat: 'accuracy', phase: 'status', operation: 'multiply', value: 0.82 }],
        presentation: { nameKey: 'combat.status.disoriented.name', icon: 'icon_skill_swift' }
      },
      {
        id: 'mine.sundered', stacking: 'stack', maxStacks: 3, durationTicks: 140,
        modifiers: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 0.88 }],
        presentation: { nameKey: 'combat.status.sundered.name', icon: 'icon_skill_strike' }
      },
      {
        id: 'stone_golem.rock_shield', stacking: 'refresh', durationTicks: 120,
        modifiers: [
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.45 },
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.3 }
        ],
        presentation: { nameKey: 'combat.status.rock_shield.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'stone_golem.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.28 },
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 0.82 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'cave_bat', mods: { hp: 0.8, atk: 0.95, spd: 3 }, movementTypes: ['flying'],
        damageType: 'piercing', abilityIds: ['cave_bat.screech'],
        abilities: [{
          id: 'cave_bat.screech', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 20, animationLockTicks: 10, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 48, radius: 36, maxTargets: 4 },
          effects: [D('blunt', 0.65), { type: 'applyStatus', statusId: 'mine.disoriented' }],
          aiHints: { priority: 58 }, presentation: { nameKey: 'combat.ability.bat_screech.name', icon: 'icon_skill_swift' }
        }],
        traitModifiers: [{ stat: 'dodgeChance', phase: 'otherFlat', operation: 'add', value: 0.06 }]
      },
      {
        id: 'kobold_miner', mods: { hp: 1.1, atk: 1.05 }, damageType: 'blunt',
        abilityIds: ['kobold_miner.armor_break'],
        abilities: [{
          id: 'kobold_miner.armor_break', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 12, animationLockTicks: 11, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 28 },
          effects: [D('blunt', 1.18), { type: 'applyStatus', statusId: 'mine.sundered' }],
          aiHints: { priority: 62 }, presentation: { nameKey: 'combat.ability.armor_break.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.08 }]
      }
    ],
    boss: {
      id: 'stone_golem', mods: { hp: 1.12, atk: 1.05, spd: -2 }, damageType: 'blunt', scale: 1.3,
      abilityIds: ['stone_golem.quake_ring', 'stone_golem.rock_shield_action', 'stone_golem.crushing_fist'],
      abilities: [
        {
          id: 'stone_golem.quake_ring', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 32, animationLockTicks: 15, cooldownTicks: 180, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 60, radius: 48, maxTargets: 4 },
          telegraph: { shape: 'ring', radius: 48, expectedDamagePct: 0.2 },
          effects: [D('blunt', 1.78)], aiHints: { priority: 84 },
          presentation: { nameKey: 'combat.ability.golem_quake.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'stone_golem.rock_shield_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 12, cooldownTicks: 300, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.18, durationTicks: 120, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'stone_golem.rock_shield', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 115, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.golem_shield.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'stone_golem.crushing_fist', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 16, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 32 },
          telegraph: { shape: 'single', radius: 22, expectedDamagePct: 0.24 },
          effects: [D('blunt', 2.05), { type: 'applyStatus', statusId: 'mine.sundered' }],
          aiHints: { priority: 80 }, presentation: { nameKey: 'combat.ability.golem_fist.name', icon: 'icon_skill_strike' }
        }
      ],
      traitModifiers: [{ stat: 'tenacity', phase: 'otherFlat', operation: 'add', value: 0.65 }],
      phaseStatusId: 'stone_golem.phase2'
    }
  }));
})();
