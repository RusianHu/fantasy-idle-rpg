(function () {
  'use strict';
  var Game = window.Game, D = Game.v2Content.damage;
  Game.content.registerPack(Game.v2Content.regionPack({
    regionId: 'skyruins', factionId: 'ruin_guardians',
    sourceFile: 'js/data/packs/regions/skyruins.js',
    statuses: [
      {
        id: 'skyruins.suppressed', stacking: 'refresh', durationTicks: 120,
        modifiers: [
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 0.88 },
          { stat: 'accuracy', phase: 'status', operation: 'multiply', value: 0.9 }
        ],
        presentation: { nameKey: 'combat.status.suppressed.name', icon: 'icon_skill_fire' }
      },
      {
        id: 'skyruins.dazed', stacking: 'refresh', durationTicks: 22,
        modifiers: [{ stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 0.6 }],
        presentation: { nameKey: 'combat.status.dazed.name', icon: 'icon_skill_swift' }
      },
      {
        id: 'ruin_guardian.recalibrated', stacking: 'refresh', durationTicks: 130,
        modifiers: [
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.3 },
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.45 }
        ],
        presentation: { nameKey: 'combat.status.recalibrated.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'ruin_guardian.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.24 },
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.28 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 1.18 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'guardian_orb', mods: { hp: 0.95, atk: 1.05, def: 1.5, spd: 1 }, movementTypes: ['flying'],
        damageType: 'arcane', range: 72, abilityIds: ['guardian_orb.suppression_beam'],
        abilities: [{
          id: 'guardian_orb.suppression_beam', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 26, animationLockTicks: 10, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'line', range: 76, radius: 16, maxTargets: 4 },
          telegraph: { shape: 'line', radius: 16, expectedDamagePct: 0.13 },
          effects: [D('arcane', 1.12), { type: 'applyStatus', statusId: 'skyruins.suppressed' }],
          aiHints: { priority: 66 }, presentation: { nameKey: 'combat.ability.suppression_beam.name', icon: 'icon_skill_fire' }
        }],
        traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.18 }]
      },
      {
        id: 'harpy', mods: { hp: 1, atk: 1.15, spd: 3 }, movementTypes: ['flying'],
        damageType: 'slashing', abilityIds: ['harpy.sonic_dive'],
        abilities: [{
          id: 'harpy.sonic_dive', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 14, animationLockTicks: 11, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 54 },
          effects: [D('slashing', 1.28), { type: 'applyStatus', statusId: 'skyruins.dazed' }, { type: 'movement', distance: 24 }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.sonic_dive.name', icon: 'icon_skill_swift' }
        }],
        traitModifiers: [{ stat: 'dodgeChance', phase: 'otherFlat', operation: 'add', value: 0.07 }]
      }
    ],
    boss: {
      id: 'ruin_guardian', mods: { hp: 1.06, atk: 1.08, def: 1.2 }, damageType: 'arcane', range: 84, scale: 1.3,
      abilityIds: ['ruin_guardian.arcane_ray', 'ruin_guardian.gravity_well', 'ruin_guardian.recalibrate'],
      abilities: [
        {
          id: 'ruin_guardian.arcane_ray', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 14, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'line', range: 88, radius: 18, maxTargets: 4 },
          telegraph: { shape: 'line', radius: 18, expectedDamagePct: 0.21 },
          effects: [D('arcane', 1.82), { type: 'applyStatus', statusId: 'skyruins.suppressed' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.arcane_ray.name', icon: 'icon_skill_fire' }
        },
        {
          id: 'ruin_guardian.gravity_well', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 38, animationLockTicks: 15, cooldownTicks: 220, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 72, radius: 52, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 52, expectedDamagePct: 0.2 },
          effects: [D('arcane', 1.55), { type: 'pull', distance: 28 }],
          aiHints: { priority: 88 }, presentation: { nameKey: 'combat.ability.gravity_well.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'ruin_guardian.recalibrate', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 26, animationLockTicks: 12, cooldownTicks: 320, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.24, durationTicks: 130, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'ruin_guardian.recalibrated', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 118, role: 'defensive' }, presentation: { nameKey: 'combat.ability.recalibrate.name', icon: 'icon_skill_guard' }
        }
      ],
      traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.2 }],
      phaseStatusId: 'ruin_guardian.phase2'
    }
  }));
})();
