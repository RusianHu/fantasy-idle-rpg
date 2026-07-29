(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  Game.content.registerPack(Game.contentAuthoring.factory('region.pack')({
    regionId: 'lavacave', factionId: 'infernal',
    sourceFile: 'js/data/packs/regions/lavacave.pack.js',
    statuses: [
      {
        id: 'lavacave.burning', stacking: 'stack', maxStacks: 5, durationTicks: 140,
        periodicIntervalTicks: 20, periodic: [Object.assign(D('fire', 0.14), { canCrit: false })],
        presentation: { nameKey: 'combat.status.burning.name', icon: 'icon_skill_fire' }
      },
      {
        id: 'lavacave.thorns', stacking: 'refresh', durationTicks: 120,
        modifiers: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 1.18 }],
        presentation: { nameKey: 'combat.status.thorns.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'flame_demon.fire_shield', stacking: 'refresh', durationTicks: 120,
        modifiers: [
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.42 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 1.12 }
        ],
        presentation: { nameKey: 'combat.status.fire_shield.name', icon: 'icon_skill_fire' }
      },
      {
        id: 'flame_demon.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.3 },
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.25 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'fire_imp', mods: { hp: 0.9, atk: 1.15, spd: 2 }, damageType: 'fire', range: 58,
        abilityIds: ['fire_imp.ember_bolt'],
        abilities: [{
          id: 'fire_imp.ember_bolt', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 10, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 62 },
          effects: [D('fire', 1.08), { type: 'applyStatus', statusId: 'lavacave.burning' }],
          aiHints: { priority: 64 }, presentation: { nameKey: 'combat.ability.ember_bolt.name', icon: 'icon_skill_fire' }
        }],
        traitModifiers: [{ stat: 'magicPower', phase: 'multiply', operation: 'multiply', value: 1.08 }]
      },
      {
        id: 'lava_lizard', mods: { hp: 1.15, atk: 1 }, damageType: 'slashing',
        abilityIds: ['lava_lizard.searing_bite'],
        abilities: [{
          id: 'lava_lizard.searing_bite', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 10, animationLockTicks: 11, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 30 },
          effects: [D('slashing', 1.18), { type: 'applyStatus', statusId: 'lavacave.burning' }],
          aiHints: { priority: 64 }, presentation: { nameKey: 'combat.ability.searing_bite.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.16 }]
      }
    ],
    boss: {
      id: 'flame_demon', mods: { hp: 1.05, atk: 1.12 }, damageType: 'fire', scale: 1.25,
      abilityIds: ['flame_demon.infernal_slash', 'flame_demon.fire_shield_action', 'flame_demon.eruption_chain'],
      abilities: [
        {
          id: 'flame_demon.infernal_slash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 14, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 42, radius: 38, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 38, expectedDamagePct: 0.2 },
          effects: [D('fire', 1.78), { type: 'applyStatus', statusId: 'lavacave.burning' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.infernal_slash.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'flame_demon.fire_shield_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 12, cooldownTicks: 300, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.2, durationTicks: 120, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'flame_demon.fire_shield', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 116, role: 'defensive' }, presentation: { nameKey: 'combat.ability.fire_shield.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'flame_demon.eruption_chain', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 34, animationLockTicks: 15, cooldownTicks: 220, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 70, radius: 48, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 48, expectedDamagePct: 0.23 },
          effects: [{ type: 'repeat', times: 3, effects: [D('fire', 0.68)] }, { type: 'applyStatus', statusId: 'lavacave.burning' }],
          aiHints: { priority: 88 }, presentation: { nameKey: 'combat.ability.eruption_chain.name', icon: 'icon_skill_whirl' }
        }
      ],
      traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.18 }],
      phaseStatusId: 'flame_demon.phase2'
    }
  }));
})();
