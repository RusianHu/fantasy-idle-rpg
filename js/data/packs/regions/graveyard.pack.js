(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  Game.content.registerPack(Game.contentAuthoring.factory('region.pack')({
    regionId: 'graveyard', factionId: 'undead',
    sourceFile: 'js/data/packs/regions/graveyard.pack.js',
    statuses: [
      {
        id: 'graveyard.staggered', stacking: 'refresh', durationTicks: 20,
        modifiers: [{ stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 0.65 }],
        presentation: { nameKey: 'combat.status.staggered.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'graveyard.withered', stacking: 'refresh', durationTicks: 140,
        modifiers: [
          { stat: 'healingPower', phase: 'status', operation: 'multiply', value: 0.72 },
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 0.9 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 0.9 }
        ],
        presentation: { nameKey: 'combat.status.withered.name', icon: 'icon_skill_poison' }
      },
      {
        id: 'necromancer.bone_barrier', stacking: 'refresh', durationTicks: 140,
        modifiers: [{ stat: 'ward', phase: 'status', operation: 'multiply', value: 1.3 }],
        presentation: { nameKey: 'combat.status.bone_barrier.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'necromancer.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 1.22 },
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.15 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'skeleton_soldier', mods: { hp: 1, atk: 1.1 }, damageType: 'slashing',
        abilityIds: ['skeleton_soldier.shield_bash'],
        abilities: [{
          id: 'skeleton_soldier.shield_bash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 12, animationLockTicks: 11, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 28 },
          effects: [D('blunt', 1.05), { type: 'applyStatus', statusId: 'graveyard.staggered' }],
          aiHints: { priority: 64 }, presentation: { nameKey: 'combat.ability.shield_bash.name', icon: 'icon_skill_guard' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.12 }]
      },
      {
        id: 'ghost_wisp', mods: { hp: 0.85, atk: 0.95, spd: 2, def: 1.4 }, movementTypes: ['flying'],
        damageType: 'necrotic', range: 62, abilityIds: ['ghost_wisp.life_drain'],
        abilities: [{
          id: 'ghost_wisp.life_drain', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 10, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 64 },
          effects: [D('necrotic', 1.02), { type: 'heal', coefficient: 0.7, target: { relation: 'self', shape: 'single' } }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.life_drain.name', icon: 'icon_skill_poison' }
        }],
        traitModifiers: [{ stat: 'dodgeChance', phase: 'otherFlat', operation: 'add', value: 0.05 }]
      }
    ],
    boss: {
      id: 'necromancer', mods: { hp: 1, atk: 1.08 }, damageType: 'necrotic', range: 78, scale: 1.2,
      abilityIds: ['necromancer.shadow_bolt', 'necromancer.withering_curse', 'necromancer.bone_barrier_action'],
      abilities: [
        {
          id: 'necromancer.shadow_bolt', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 26, animationLockTicks: 12, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 80 },
          effects: [D('necrotic', 1.7)], aiHints: { priority: 76 },
          presentation: { nameKey: 'combat.ability.shadow_bolt.name', icon: 'icon_skill_fire' }
        },
        {
          id: 'necromancer.withering_curse', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 12, cooldownTicks: 190, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 72, radius: 44, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 44, expectedDamagePct: 0.12 },
          effects: [D('necrotic', 1.05), { type: 'applyStatus', statusId: 'graveyard.withered' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.withering_curse.name', icon: 'icon_skill_poison' }
        },
        {
          id: 'necromancer.bone_barrier_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 12, cooldownTicks: 300, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.22, durationTicks: 140, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'necromancer.bone_barrier', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 116, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.bone_barrier.name', icon: 'icon_skill_guard' }
        }
      ],
      traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.18 }],
      phaseStatusId: 'necromancer.phase2'
    }
  }));
})();
