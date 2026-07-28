/* Deterministic authoring helper: expands a complete region mechanic spec into ordinary V2 cards. */
(function () {
  'use strict';
  var Game = window.Game;
  Game.v2Content = Game.v2Content || {};

  function damageEffect(type, coefficient, powerStat) {
    return {
      type: 'damage', damageTypeId: type,
      formulaId: 'core.damage.power-coefficient-v1',
      params: { powerStat: powerStat || (['slashing', 'piercing', 'blunt'].indexOf(type) >= 0 ? 'physicalPower' : 'magicPower'), coefficient: coefficient }
    };
  }
  function profile(id, mods, boss) {
    mods = mods || {};
    var hp = 55 * (mods.hp || 1) * (boss ? 11 : 1);
    // Boss longevity and mechanics carry the encounter; raw power stays within
    // the solo first-clear envelope so every class can answer telegraphs/phase rules.
    var power = 8 * (mods.atk || 1) * (boss ? 0.9 : 1);
    var defense = 3 * (mods.def || 1) * (boss ? 2 : 1);
    var speed = 0.9 + (mods.spd || 0) * 0.015;
    return {
      id: 'stats.' + id, schemaVersion: 1,
      stats: {
        maxHp: { base: hp, tierScale: 2.05 },
        armor: { base: defense, tierScale: 1.9 },
        ward: { base: defense * 0.8, tierScale: 1.9 },
        physicalPower: { base: power, tierScale: 1.95 },
        magicPower: { base: power, tierScale: 1.95 },
        accuracy: 0.91, gcdSpeed: speed, castSpeed: speed,
        autoAttackSpeed: speed, cooldownRate: 1,
        moveSpeed: boss ? 44 : 38, range: 24,
        critChance: boss ? 0.07 : 0.03, critMultiplier: 1.5,
        dodgeChance: Math.max(0, (mods.spd || 0) * 0.004),
        healingPower: { base: power, tierScale: 1.95 },
        shieldPower: { base: hp, tierScale: 2.05 },
        lifesteal: 0, statusPotency: boss ? 1.25 : 1,
        tenacity: boss ? 0.8 : 0.08, interruptPower: 1,
        threatMultiplier: 1, resourceRegen: 1,
        expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
      }
    };
  }
  function basicAbility(monster, isBoss) {
    return {
      id: monster.id + '.basic', kind: 'action', actionType: 'gcd',
      timing: { castTicks: 0, animationLockTicks: 10, cooldownTicks: 0, queueable: true },
      target: { relation: 'hostile', shape: 'single', range: monster.range || 26 },
      effects: [damageEffect(monster.damageType || 'slashing',
        monster.basicCoefficient || (isBoss ? 0.45 : 0.85))],
      aiHints: { priority: 12 },
      presentation: { nameKey: 'combat.ability.' + monster.id + '_basic.name', icon: 'icon_skill_strike' }
    };
  }
  function trait(monster) {
    return {
      id: monster.id + '.trait', kind: 'passive',
      modifiers: monster.traitModifiers || [],
      triggers: monster.traitTriggers || [],
      presentation: { nameKey: 'combat.trait.' + monster.id + '.name', icon: monster.traitIcon || 'icon_skill_guard' }
    };
  }
  function archetype(spec, monster, rank) {
    return {
      id: monster.id, category: 'monster', rank: rank || 'normal',
      identity: {
        nameKey: 'monster.' + monster.id + '.name',
        descKey: 'monster.' + monster.id + '.desc',
        loreKey: 'combat.lore.' + monster.id
      },
      presentation: {
        spriteId: monster.id, portraitId: monster.portraitId || monster.id,
        scale: monster.scale || 1,
        renderProfileId: 'render.actor.standard'
      },
      body: {
        size: rank === 'boss' ? 'large' : 'medium',
        collisionRadius: rank === 'boss' ? 14 : 8,
        movementTypes: monster.movementTypes || ['ground']
      },
      tags: (monster.tags || []).concat([rank === 'boss' ? 'boss' : 'normal']),
      defaultFactionId: spec.factionId,
      statProfileId: 'stats.' + monster.id,
      resourceProfileIds: rank === 'boss' ? ['resources.boss'] : [],
      abilityGrantIds: [monster.id + '.basic'].concat(monster.abilityIds),
      traitIds: [monster.id + '.trait'],
      resistanceProfileId: rank === 'boss' ? 'resist.boss' : 'resist.standard',
      aiProfileId: rank === 'boss' ? 'ai.boss.standard' : 'ai.monster.standard',
      rewardProfileId: 'reward.' + monster.id
    };
  }
  function reward(monster, boss) {
    return {
      id: 'reward.' + monster.id, schemaVersion: 1,
      exp: { base: 12 * (boss ? 18 : 1), tierScale: 1.95 },
      gold: { base: 7 * (boss ? 14 : 1), tierScale: 1.9 },
      dropBudget: boss ? 4 : 1
    };
  }

  Game.v2Content.regionPack = function (spec) {
    var normals = spec.normals;
    var boss = spec.boss;
    var all = normals.concat([boss]);
    var abilities = [];
    var traits = [];
    all.forEach(function (monster) {
      abilities.push(basicAbility(monster, monster === boss));
      abilities = abilities.concat(monster.abilities);
      traits.push(trait(monster));
    });
    var normalPackMembers = [
      { id: spec.regionId + '.solo-a', members: [normals[0].id], weight: 30, spacing: 22, leashRadius: 120, rewardBudget: 1 },
      { id: spec.regionId + '.solo-b', members: [normals[1].id], weight: 28, spacing: 22, leashRadius: 120, rewardBudget: 1 },
      { id: spec.regionId + '.duo', members: [normals[0].id, normals[1].id], weight: 26, spacing: 28, leashRadius: 132, rewardBudget: 1.25 },
      { id: spec.regionId + '.trio', members: [normals[0].id, normals[1].id, normals[0].id], weight: 16, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ];
    return {
      id: 'region.' + spec.regionId, version: '2.0.0', schemaVersion: 1,
      sourceFile: spec.sourceFile,
      requires: [{ id: 'core.combat', range: '^2.0.0' }, { id: 'world.actors', range: '^2.0.0' }],
      definitions: {
        statProfile: all.map(function (monster) { return profile(monster.id, monster.mods, monster === boss); }),
        status: spec.statuses,
        ability: abilities,
        trait: traits,
        rewardProfile: all.map(function (monster) { return reward(monster, monster === boss); }),
        actorArchetype: [
          archetype(spec, normals[0], 'normal'),
          archetype(spec, normals[1], 'normal'),
          archetype(spec, boss, 'boss')
        ],
        encounterProfile: [
          {
            id: 'encounter.' + spec.regionId,
            regionId: spec.regionId,
            rulesProfileId: 'core.rules.standard-v1',
            packs: normalPackMembers,
            bossEncounterId: 'encounter.' + spec.regionId + '.boss',
            phaseRules: [],
            presentation: { nameKey: 'region.' + spec.regionId + '.name' }
          },
          {
            id: 'encounter.' + spec.regionId + '.boss',
            regionId: spec.regionId,
            rulesProfileId: 'core.rules.standard-v1',
            packs: [{
              id: spec.regionId + '.boss',
              members: [boss.id],
              weight: 1, spacing: 0, leashRadius: 170, rewardBudget: 4
            }],
            phaseRules: [{
              id: boss.id + '.phase2',
              hpPct: 0.5,
              statusId: boss.phaseStatusId,
              abilityId: boss.phaseAbilityId
            }],
            presentation: { nameKey: 'monster.' + boss.id + '.name' }
          }
        ]
      }
    };
  };
  Game.v2Content.damage = damageEffect;
})();
