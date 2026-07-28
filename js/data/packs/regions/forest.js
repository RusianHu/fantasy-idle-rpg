(function () {
  'use strict';
  var Game = window.Game, D = Game.v2Content.damage;
  Game.content.registerPack(Game.v2Content.regionPack({
    regionId: 'forest', factionId: 'forest_guardians',
    sourceFile: 'js/data/packs/regions/forest.js',
    statuses: [
      {
        id: 'forest.poisoned', stacking: 'stack', maxStacks: 4, durationTicks: 160,
        periodicIntervalTicks: 20, periodic: [Object.assign(D('poison', 0.13), { canCrit: false })],
        presentation: { nameKey: 'combat.status.poisoned.name', icon: 'icon_skill_poison' }
      },
      {
        id: 'forest.rooted', stacking: 'refresh', durationTicks: 24,
        modifiers: [{ stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.35 }],
        presentation: { nameKey: 'combat.status.rooted.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'elder_treant.rejuvenation', stacking: 'refresh', durationTicks: 100,
        periodicIntervalTicks: 20, periodic: [{ type: 'heal', coefficient: 0.42, target: { relation: 'self', shape: 'single' } }],
        presentation: { nameKey: 'combat.status.rejuvenation.name', icon: 'icon_skill_heal' }
      },
      {
        id: 'elder_treant.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.3 },
          { stat: 'cooldownRate', phase: 'status', operation: 'multiply', value: 1.2 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'mushroom_toxic', mods: { hp: 1, atk: 0.95, spd: -1.5 }, damageType: 'poison',
        abilityIds: ['mushroom_toxic.poison_cloud'],
        abilities: [{
          id: 'mushroom_toxic.poison_cloud', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 10, cooldownTicks: 170, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 52, radius: 38, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 38, expectedDamagePct: 0.11 },
          effects: [D('poison', 0.72), { type: 'applyStatus', statusId: 'forest.poisoned' }],
          aiHints: { priority: 60 }, presentation: { nameKey: 'combat.ability.poison_cloud.name', icon: 'icon_skill_poison' }
        }],
        traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.15 }]
      },
      {
        id: 'treant_sapling', mods: { hp: 1.2, atk: 1, spd: -2 }, damageType: 'blunt',
        abilityIds: ['treant_sapling.grasping_roots'],
        abilities: [{
          id: 'treant_sapling.grasping_roots', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 11, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 56 },
          effects: [D('blunt', 0.95), { type: 'applyStatus', statusId: 'forest.rooted' }],
          aiHints: { priority: 62 }, presentation: { nameKey: 'combat.ability.grasping_roots.name', icon: 'icon_skill_guard' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.18 }]
      }
    ],
    boss: {
      id: 'elder_treant', mods: { hp: 1.08, atk: 1 }, damageType: 'blunt', scale: 1.3,
      abilityIds: ['elder_treant.root_circle', 'elder_treant.branch_sweep', 'elder_treant.rejuvenate'],
      abilities: [
        {
          id: 'elder_treant.root_circle', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 14, cooldownTicks: 170, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 62, radius: 42, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 42, expectedDamagePct: 0.16 },
          effects: [D('blunt', 1.45), { type: 'applyStatus', statusId: 'forest.rooted' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.treant_roots.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'elder_treant.branch_sweep', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 14, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 52, radius: 52, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 52, expectedDamagePct: 0.19 },
          effects: [D('blunt', 1.72), { type: 'knockback', distance: 22 }],
          aiHints: { priority: 76 }, presentation: { nameKey: 'combat.ability.branch_sweep.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'elder_treant.rejuvenate', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 44, animationLockTicks: 12, cooldownTicks: 380, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          telegraph: { shape: 'self', radius: 26, expectedDamagePct: 0 },
          effects: [{ type: 'applyStatus', statusId: 'elder_treant.rejuvenation', target: { relation: 'self', shape: 'single' } }],
          aiHints: { priority: 120, role: 'heal' }, presentation: { nameKey: 'combat.ability.treant_rejuvenate.name', icon: 'icon_skill_heal' }
        }
      ],
      traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.15 }],
      phaseStatusId: 'elder_treant.phase2'
    }
  }));
})();
