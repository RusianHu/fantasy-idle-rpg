/* Core deterministic combat vocabulary. Definitions contain no executable callbacks. */
(function () {
  'use strict';
  var Game = window.Game;
  var statIds = [
    ['maxHp', 1, 1e15], ['armor', 0, 1e12], ['ward', 0, 1e12],
    ['physicalPower', 0, 1e12], ['magicPower', 0, 1e12], ['accuracy', 0.05, 1],
    ['gcdSpeed', 0.1, 8], ['castSpeed', 0.1, 8], ['autoAttackSpeed', 0.1, 8],
    ['cooldownRate', 0.1, 8], ['moveSpeed', 0, 1000], ['range', 0, 1000],
    ['critChance', 0, 0.95], ['critMultiplier', 1, 10], ['dodgeChance', 0, 0.35],
    ['healingPower', 0, 1e12], ['shieldPower', 0, 1e15], ['lifesteal', 0, 1],
    ['statusPotency', 0, 10], ['tenacity', 0, 10], ['interruptPower', 0, 10],
    ['threatMultiplier', 0, 20], ['resourceRegen', 0, 20],
    ['healthRegenPct', 0, 1],
    ['expMultiplier', 0, 100], ['goldMultiplier', 0, 100], ['dropMultiplier', 0, 100]
  ].map(function (row) {
    return {
      id: row[0], schemaVersion: 1, defaultValue: row[1],
      min: row[1], max: row[2], phases: ['base', 'growth', 'equipmentFlat', 'otherFlat', 'addPct', 'multiply', 'status']
    };
  });
  var damageTypes = [
    ['slashing', 'physical'], ['piercing', 'physical'], ['blunt', 'physical'],
    ['arcane', 'magic'], ['fire', 'magic'], ['frost', 'magic'], ['lightning', 'magic'],
    ['poison', 'magic'], ['radiant', 'magic'], ['necrotic', 'magic'], ['true', 'true']
  ].map(function (row) { return { id: row[0], schemaVersion: 1, category: row[1] }; });
  var factions = [
    'adventurers', 'wild', 'forest_guardians', 'mine_denizens', 'undead',
    'frost_clans', 'infernal', 'ruin_guardians', 'demon_army', 'wildlife'
  ].map(function (id) {
    var hostile = {};
    if (id === 'adventurers') {
      ['wild', 'forest_guardians', 'mine_denizens', 'undead', 'frost_clans', 'infernal', 'ruin_guardians', 'demon_army']
        .forEach(function (target) { hostile[target] = 'hostile'; });
    } else if (id !== 'wildlife') {
      hostile.adventurers = 'hostile';
    }
    return { id: id, schemaVersion: 1, relations: hostile };
  });

  Game.content.registerPack({
    id: 'core.combat',
    version: '2.0.0',
    schemaVersion: 1,
    sourceFile: 'js/data/packs/rules/core.pack.js',
    requires: [],
    definitions: {
      stat: statIds,
      damageType: damageTypes,
      statProfile: [
        {
          id: 'stats.adventurer', schemaVersion: 1,
          stats: {
            maxHp: 100, armor: 4, ward: 3, physicalPower: 10, magicPower: 10,
            accuracy: 0.94, gcdSpeed: 1, castSpeed: 1, autoAttackSpeed: 1,
            cooldownRate: 1, moveSpeed: 56, range: 24, critChance: 0.05,
            critMultiplier: 1.5, dodgeChance: 0.02, healingPower: 10,
            shieldPower: 100, lifesteal: 0, statusPotency: 1, tenacity: 0,
            interruptPower: 1, threatMultiplier: 1, resourceRegen: 1,
            healthRegenPct: 0,
            expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
          }
        },
        {
          id: 'stats.npc', schemaVersion: 1,
          stats: { moveSpeed: 42, range: 0 }
        },
        {
          id: 'stats.object', schemaVersion: 1,
          stats: {
            maxHp: 200, armor: 15, ward: 15, physicalPower: 0, magicPower: 0,
            accuracy: 1, gcdSpeed: 1, castSpeed: 1, autoAttackSpeed: 1,
            cooldownRate: 1, moveSpeed: 0, range: 0, critChance: 0,
            critMultiplier: 1.5, dodgeChance: 0, healingPower: 0,
            shieldPower: 0, lifesteal: 0, statusPotency: 0, tenacity: 1,
            interruptPower: 0, threatMultiplier: 0, resourceRegen: 0,
            healthRegenPct: 0,
            expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
          }
        }
      ],
      resistanceProfile: [
        { id: 'resist.standard', schemaVersion: 1, resistances: {} },
        { id: 'resist.boss', schemaVersion: 1, resistances: { poison: 0.2, necrotic: 0.15, radiant: -0.05 } }
      ],
      resource: [
        { id: 'rage', schemaVersion: 1, min: 0, max: 100, initial: 0, regenPerTick: 0, reset: { encounterStart: 'initial', encounterEnd: 'initial' } },
        { id: 'energy', schemaVersion: 1, min: 0, max: 100, initial: 100, regenPerTick: 0.45, reset: { encounterStart: 'initial', encounterEnd: 'initial' } },
        { id: 'comboPoints', schemaVersion: 1, min: 0, max: 5, initial: 0, regenPerTick: 0, reset: { encounterStart: 'initial', encounterEnd: 'initial' } },
        { id: 'mana', schemaVersion: 1, min: 0, max: 10000, initial: 10000, regenPerTick: 8, reset: { encounterStart: 'initial', encounterEnd: 'initial' } },
        { id: 'arcaneCharges', schemaVersion: 1, min: 0, max: 4, initial: 0, regenPerTick: 0, reset: { encounterStart: 'initial', encounterEnd: 'initial' } },
        { id: 'faith', schemaVersion: 1, min: 0, max: 100, initial: 0, regenPerTick: 0, reset: { encounterStart: 'initial', encounterEnd: 'initial' } },
        { id: 'focus', schemaVersion: 1, min: 0, max: 100, initial: 20, regenPerTick: 0.15, reset: { encounterStart: 'initial', encounterEnd: 'initial' } },
        { id: 'boss_resolve', schemaVersion: 1, min: 0, max: 100, initial: 100, regenPerTick: 0.05, reset: { encounterStart: 'initial', encounterEnd: 'initial' } }
      ],
      resourceProfile: [
        { id: 'resources.fighter', schemaVersion: 1, resourceIds: ['rage'] },
        { id: 'resources.rogue', schemaVersion: 1, resourceIds: ['energy', 'comboPoints'] },
        { id: 'resources.mage', schemaVersion: 1, resourceIds: ['mana', 'arcaneCharges'] },
        { id: 'resources.cleric', schemaVersion: 1, resourceIds: ['mana', 'faith'] },
        { id: 'resources.ranger', schemaVersion: 1, resourceIds: ['focus'] },
        { id: 'resources.boss', schemaVersion: 1, resourceIds: ['boss_resolve'] }
      ],
      faction: factions,
      combatRules: [{
        id: 'core.rules.standard-v1',
        schemaVersion: 1,
        tickMs: 50,
        baseGcdTicks: 40,
        gcdFloorTicks: 24,
        queueWindowTicks: 7,
        defaultGcdLockTicks: 12,
        defaultOgcdLockTicks: 9,
        aiIntervalTicks: 2,
        maxReactionDepth: 8,
        reactionBudgetPerTick: 128,
        effectBudgetPerTick: 512,
        maxRepeat: 8,
        maxCatchupTicks: 20,
        eventLogSize: 160
      }],
      renderProfile: [
        { id: 'render.actor.standard', schemaVersion: 1, layer: 'actor', hpBar: true },
        { id: 'render.actor.npc', schemaVersion: 1, layer: 'actor', hpBar: false },
        { id: 'render.actor.object', schemaVersion: 1, layer: 'object', hpBar: true }
      ],
      interactionProfile: [
        { id: 'interaction.hostile', actions: [{ id: 'attack', kind: 'attack', primary: true }] },
        { id: 'interaction.protected-npc', actions: [{ id: 'talk', kind: 'talk', primary: true }] },
        { id: 'interaction.attackable-neutral', actions: [
          { id: 'observe', kind: 'inspect', primary: true },
          { id: 'attack', kind: 'attack', requiresConfirmation: true }
        ] }
      ],
      engagementPolicy: [
        {
          id: 'engagement.hostile', manualAttack: true, autoAggro: true,
          groupPropagation: 'socialGroup', rewardEligible: true, memorySeconds: 180
        },
        {
          id: 'engagement.protected', manualAttack: false, autoAggro: false,
          groupPropagation: 'none', rewardEligible: false, memorySeconds: 0
        },
        {
          id: 'engagement.neutral-provokable', manualAttack: true, autoAggro: false,
          groupPropagation: 'socialGroup', rewardEligible: false, memorySeconds: 180
        }
      ],
      tacticsProfile: [
        {
          id: 'safe', schemaVersion: 1, reactionDelayTicks: 5,
          dodgeDamageThreshold: 0.05, defenseThreshold: 0.65, healThreshold: 0.72,
          resourceReserve: 0.35
        },
        {
          id: 'balanced', schemaVersion: 1, reactionDelayTicks: 8,
          dodgeDamageThreshold: 0.12, defenseThreshold: 0.45, healThreshold: 0.55,
          resourceReserve: 0.2
        },
        {
          id: 'aggressive', schemaVersion: 1, reactionDelayTicks: 13,
          dodgeDamageThreshold: 0.22, defenseThreshold: 0.3, healThreshold: 0.38,
          resourceReserve: 0.05
        }
      ],
      aiProfile: [
        { id: 'ai.player.standard', schemaVersion: 1, priorities: ['mechanic', 'survival', 'interrupt', 'role', 'resource', 'combo', 'filler', 'auto'] },
        { id: 'ai.monster.standard', schemaVersion: 1, priorities: ['mechanic', 'signature', 'filler', 'auto'] },
        { id: 'ai.boss.standard', schemaVersion: 1, priorities: ['phase', 'telegraph', 'signature', 'filler'] }
      ],
      evaluationProfile: [
        { id: 'evaluation.fighter', schemaVersion: 1, weights: { offense: 0.45, survival: 0.50, economy: 0.05 } },
        { id: 'evaluation.rogue', schemaVersion: 1, weights: { offense: 0.65, survival: 0.30, economy: 0.05 } },
        { id: 'evaluation.mage', schemaVersion: 1, weights: { offense: 0.65, survival: 0.30, economy: 0.05 } },
        { id: 'evaluation.cleric', schemaVersion: 1, weights: { offense: 0.45, survival: 0.50, economy: 0.05 } },
        { id: 'evaluation.ranger', schemaVersion: 1, weights: { offense: 0.55, survival: 0.30, economy: 0.15 } }
      ],
      equipmentProfile: [{
        id: 'equipment.adventurer', schemaVersion: 1,
        slots: ['weapon', 'armor', 'ring']
      }],
      rewardProfile: [
        { id: 'reward.none', schemaVersion: 1, exp: 0, gold: 0, dropBudget: 0 }
      ]
    }
  });
})();
