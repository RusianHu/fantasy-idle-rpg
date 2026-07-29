(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  var pack = Game.contentAuthoring.factory('region.pack')({
    regionId: 'grassland', factionId: 'wild',
    sourceFile: 'js/data/packs/regions/grassland.pack.js',
    statuses: [
      {
        id: 'grassland.corroded', stacking: 'stack', maxStacks: 3, durationTicks: 140,
        modifiers: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 0.9 }],
        presentation: { nameKey: 'combat.status.corroded.name', icon: 'icon_skill_poison' }
      },
      {
        id: 'grassland.bleeding', stacking: 'stack', maxStacks: 3, durationTicks: 120,
        periodicIntervalTicks: 20, periodic: [Object.assign(D('slashing', 0.1), { canCrit: false })],
        presentation: { nameKey: 'combat.status.bleeding.name', icon: 'icon_skill_strike' }
      },
      {
        id: 'slime_king.regenerating', stacking: 'refresh', durationTicks: 100,
        periodicIntervalTicks: 20,
        periodic: [{ type: 'heal', coefficient: 0.38, target: { relation: 'self', shape: 'single' } }],
        presentation: { nameKey: 'combat.status.regenerating.name', icon: 'icon_skill_heal' }
      },
      {
        id: 'slime_king.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.18 },
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.12 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'slime_green', mods: { hp: 0.9, atk: 0.9, spd: -1 },
        damageType: 'blunt', abilityIds: ['slime_green.acid_splash'],
        abilities: [{
          id: 'slime_green.acid_splash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 16, animationLockTicks: 10, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 34 },
          effects: [D('poison', 0.82), { type: 'applyStatus', statusId: 'grassland.corroded' }],
          aiHints: { priority: 55 },
          presentation: { nameKey: 'combat.ability.slime_acid.name', icon: 'icon_skill_poison' }
        }],
        traitModifiers: [{ stat: 'maxHp', phase: 'multiply', operation: 'multiply', value: 1.04 }]
      },
      {
        id: 'wolf_gray', mods: { hp: 1.05, atk: 1.1, spd: 1.5 },
        damageType: 'slashing', abilityIds: ['wolf_gray.rending_pounce'],
        abilities: [{
          id: 'wolf_gray.rending_pounce', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 8, animationLockTicks: 10, cooldownTicks: 120, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 42 },
          effects: [D('slashing', 1.22), { type: 'applyStatus', statusId: 'grassland.bleeding' }, { type: 'movement', distance: 18 }],
          aiHints: { priority: 62 },
          presentation: { nameKey: 'combat.ability.wolf_pounce.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'moveSpeed', phase: 'multiply', operation: 'multiply', value: 1.12 }]
      }
    ],
    boss: {
      id: 'slime_king', mods: { hp: 1, atk: 1 }, damageType: 'blunt', scale: 1.25,
      abilityIds: ['slime_king.crushing_drop', 'slime_king.slime_wave', 'slime_king.regenerate'],
      abilities: [
        {
          id: 'slime_king.crushing_drop', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 14, cooldownTicks: 160, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 46, radius: 34, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 34, expectedDamagePct: 0.18 },
          effects: [D('blunt', 1.65)], aiHints: { priority: 80 },
          presentation: { nameKey: 'combat.ability.slime_crush.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'slime_king.slime_wave', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 14, cooldownTicks: 190, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 64, radius: 52, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 52, expectedDamagePct: 0.15 },
          effects: [D('poison', 1.25), { type: 'applyStatus', statusId: 'grassland.corroded' }],
          aiHints: { priority: 74 },
          presentation: { nameKey: 'combat.ability.slime_wave.name', icon: 'icon_skill_poison' }
        },
        {
          id: 'slime_king.regenerate', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 42, animationLockTicks: 12, cooldownTicks: 360, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          telegraph: { shape: 'self', radius: 20, expectedDamagePct: 0 },
          effects: [{ type: 'applyStatus', statusId: 'slime_king.regenerating', target: { relation: 'self', shape: 'single' } }],
          aiHints: { priority: 120, role: 'heal' },
          presentation: { nameKey: 'combat.ability.slime_regen.name', icon: 'icon_skill_heal' }
        }
      ],
      traitModifiers: [{ stat: 'tenacity', phase: 'otherFlat', operation: 'add', value: 0.5 }],
      phaseStatusId: 'slime_king.phase2'
    }
  });
  Game.content.registerPack(pack);
})();
