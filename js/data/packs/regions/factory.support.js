/* Deterministic authoring helper: expands a complete region mechanic spec into ordinary V2 cards. */
(function () {
  'use strict';
  var Game = window.Game;
  Game.contentSupport.register({
    id: 'authoring.region-factory',
    version: '1.0.0',
    requires: [{ id: 'authoring.combat-formulas', range: '^1.0.0' }, { id: 'authoring.region-catalog', range: '^1.0.0' }],
    capabilities: ['authoring.read', 'authoring.write'],
    sourceFile: 'js/data/packs/regions/factory.support.js',
    install: function (capabilities) {
      var balance = capabilities.authoring.value('balance.combat');
      var regionById = capabilities.authoring.factory('region.by-id');

  function damageEffect(type, coefficient, powerStat) {
    return {
      type: 'damage', damageTypeId: type,
      formulaId: 'core.damage.power-coefficient-v1',
      params: { powerStat: powerStat || (['slashing', 'piercing', 'blunt'].indexOf(type) >= 0 ? 'physicalPower' : 'magicPower'), coefficient: coefficient }
    };
  }
  function profile(id, mods, boss) {
    mods = mods || {};
    var hp = balance.monster.hpBase * (mods.hp || 1) * (boss ? balance.boss.hp : 1);
    // Boss longevity and mechanics carry the encounter; raw power stays within
    // the solo first-clear envelope so every class can answer telegraphs/phase rules.
    var power = balance.monster.powerBase * (mods.atk || 1) * (boss ? balance.boss.power : 1);
    var defense = balance.monster.defenseBase * (mods.def || 1) * (boss ? balance.boss.defense : 1);
    var speed = 0.9 + (mods.spd || 0) * 0.015;
    return {
      id: 'stats.' + id, schemaVersion: 1,
      stats: {
        maxHp: { base: hp, tierScale: balance.monster.hpTierScale },
        armor: { base: defense, tierScale: balance.monster.defenseTierScale },
        ward: { base: defense * 0.8, tierScale: balance.monster.defenseTierScale },
        physicalPower: { base: power, tierScale: balance.monster.powerTierScale },
        magicPower: { base: power, tierScale: balance.monster.powerTierScale },
        accuracy: 0.91, gcdSpeed: speed, castSpeed: speed,
        autoAttackSpeed: speed, cooldownRate: 1,
        moveSpeed: boss ? 44 : 38, range: 24,
        critChance: boss ? 0.07 : 0.03, critMultiplier: 1.5,
        dodgeChance: Math.max(0, (mods.spd || 0) * 0.004),
        healingPower: { base: power, tierScale: balance.monster.powerTierScale },
        shieldPower: { base: hp, tierScale: balance.monster.hpTierScale },
        lifesteal: 0, statusPotency: boss ? 1.25 : 1,
        tenacity: boss ? 0.8 : 0.08, interruptPower: 1,
        threatMultiplier: 1, resourceRegen: 1,
        expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
      }
    };
  }
  function scaledProfile(id, source, multipliers) {
    var copy = JSON.parse(JSON.stringify(source));
    copy.id = id;
    Object.keys(multipliers || {}).forEach(function (stat) {
      var value = copy.stats[stat];
      var multiplier = multipliers[stat];
      if (value && typeof value === 'object') {
        value.base *= multiplier;
      } else if (Number.isFinite(value)) {
        copy.stats[stat] = value * multiplier;
      }
    });
    return copy;
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
      rewardProfileId: 'reward.' + monster.id,
      interactionProfileId: 'interaction.hostile',
      engagementPolicyId: 'engagement.hostile',
      legacy: {
        tier: spec.tier, mods: monster.mods || {}, boss: rank === 'boss',
        scale: monster.scale || 1
      }
    };
  }
  function reward(monster, boss) {
    return {
      id: 'reward.' + monster.id, schemaVersion: 1,
      exp: { base: balance.monster.rewardExpBase * (boss ? balance.boss.exp : 1), tierScale: balance.monster.rewardExpTierScale },
      gold: { base: balance.monster.rewardGoldBase * (boss ? balance.boss.gold : 1), tierScale: balance.monster.rewardGoldTierScale },
      dropBudget: boss ? 4 : 1
    };
  }

  function regionPack(spec) {
    var normals = spec.normals;
    var boss = spec.boss;
    var all = normals.concat([boss]);
    var region = regionById(spec.regionId);
    if (!region) throw new Error('[RegionFactory] missing catalog region: ' + spec.regionId);
    spec.tier = region.tier;
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
    function stableMembers(pack) {
      return pack.members.map(function (member, index) {
        return { slotId: 'member-' + (index + 1), archetypeId: member };
      });
    }
    var encounterPacks = normalPackMembers.map(function (pack) {
      return {
        id: pack.id, members: stableMembers(pack),
        formation: { spacing: pack.spacing }, leashRadius: pack.leashRadius,
        rewardBudget: pack.rewardBudget, groupAlert: true
      };
    });
    encounterPacks.push({
      id: spec.regionId + '.guardian',
      members: [{
        slotId: 'guardian', archetypeId: normals[1].id,
        variantId: normals[1].id + '.guardian'
      }],
      formation: { spacing: 0 }, leashRadius: 150, rewardBudget: 2.2, groupAlert: true
    });
    encounterPacks.push({
      id: spec.regionId + '.boss',
      members: [{ slotId: 'boss', archetypeId: boss.id }],
      formation: { spacing: 0 }, leashRadius: 170, rewardBudget: 4, groupAlert: true
    });
    function spawnFor(pack, channel, mode, weight) {
      return {
        id: 'spawn.' + pack.id, encounterPackId: pack.id,
        mountTo: [{
          populationId: 'population.' + spec.regionId, channel: channel, mode: mode,
          count: mode === 'required' ? 1 : undefined, weight: mode === 'weighted' ? weight : undefined,
          maxCount: mode === 'weighted' ? 4 : undefined
        }],
        identity: { scope: 'regionStable', socialGroupId: 'social.' + spec.factionId },
        placement: channel === 'boss'
          ? { selector: 'anchor', source: 'bossPoint', required: true, onFailure: 'rejectRegionMount', occupancyRadius: 18 }
          : (channel === 'guardian'
            ? { selector: 'layoutEntity', source: 'guardian', required: true, onFailure: 'rejectRegionMount', occupancyRadius: 14 }
            : { selector: 'layoutEntity', source: 'threat', required: false, onFailure: 'skipOptional', occupancyRadius: 10 }),
        lifecycle: {
          activation: channel === 'boss' ? 'bossRequested' : 'regionActive',
          unload: 'despawn', onDefeat: 'closeLease', onEscape: 'closeLease',
          respawn: { mode: channel === 'boss' ? 'none' : 'delay', delay: channel === 'guardian' ? 120 : 8, resetVariant: true }
        },
        offlineEligible: channel === 'regular'
      };
    }
    var spawnProfiles = normalPackMembers.map(function (pack) {
      return spawnFor(pack, 'regular', 'weighted', pack.weight);
    });
    spawnProfiles.push(spawnFor({ id: spec.regionId + '.guardian' }, 'guardian', 'required'));
    spawnProfiles.push(spawnFor({ id: spec.regionId + '.boss' }, 'boss', 'required'));
    var baseNormalProfile = profile(normals[1].id, normals[1].mods, false);
    var guardianProfile = scaledProfile('stats.' + normals[1].id + '.guardian', baseNormalProfile, {
      maxHp: 4.2, armor: 1.45, ward: 1.45, physicalPower: 1.55,
      magicPower: 1.55, healingPower: 1.55, shieldPower: 4.2
    });
    var standardTeams = [
      { id: 'party', role: 'combatant', coalitionId: 'party', countsForCompletion: true, rewardEligible: false },
      { id: 'enemy', role: 'combatant', coalitionId: 'enemy', countsForCompletion: true, rewardEligible: true }
    ];
    var standardObjectives = [
      { id: 'defeat-enemy', type: 'eliminate', teamId: 'enemy', required: true },
      { id: 'party-survives', type: 'survive', teamId: 'party', required: true, minimum: 1 }
    ];
    return {
      id: 'region.' + spec.regionId, version: '2.0.0', schemaVersion: 1,
      sourceFile: spec.sourceFile,
      requires: [{ id: 'core.combat', range: '^2.0.0' }, { id: 'world.actors', range: '^2.0.0' }],
      definitions: {
        statProfile: all.map(function (monster) { return profile(monster.id, monster.mods, monster === boss); }).concat([guardianProfile]),
        status: spec.statuses,
        ability: abilities,
        trait: traits,
        rewardProfile: all.map(function (monster) { return reward(monster, monster === boss); }),
        actorArchetype: [
          archetype(spec, normals[0], 'normal'),
          archetype(spec, normals[1], 'normal'),
          archetype(spec, boss, 'boss')
        ],
        actorVariant: [{
          id: normals[1].id + '.guardian', archetypeId: normals[1].id,
          overrides: { statProfileId: guardianProfile.id, tags: ['guardian', 'elite'] },
          transitions: []
        }],
        encounterPack: encounterPacks,
        worldSpawnProfile: spawnProfiles,
        worldPopulationProfile: [{
          id: 'population.' + spec.regionId, regionId: spec.regionId, flags: {},
          channels: {
            regular: { capacity: 9, selection: 'weighted' },
            rare: { capacity: 1, selection: 'weighted' },
            guardian: { capacity: 1, selection: 'required' },
            npc: { capacity: spec.regionId === 'grassland' ? 2 : 0, selection: 'required' },
            boss: { capacity: 1, selection: 'required' }
          },
          offlineEligible: true,
          offlineRepresentative: {
            encounterPackId: normalPackMembers[0].id,
            secondaryEncounterPackId: normalPackMembers[1].id
          }
        }],
        regionProfile: [{
          id: spec.regionId, tier: region.tier,
          populationProfileId: 'population.' + spec.regionId,
          projection: region
        }],
        encounterProfile: [
          {
            id: 'encounter.' + spec.regionId,
            regionId: spec.regionId,
            rulesProfileId: 'core.rules.standard-v1',
            packs: normalPackMembers,
            encounterPackIds: normalPackMembers.map(function (pack) { return pack.id; }),
            bossEncounterId: 'encounter.' + spec.regionId + '.boss',
            teamSlots: standardTeams,
            relationMatrix: { party: { enemy: 'hostile' }, enemy: { party: 'hostile' } },
            objectives: standardObjectives, completionPolicy: { mode: 'allRequired' },
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
            encounterPackIds: [spec.regionId + '.boss'],
            teamSlots: standardTeams,
            relationMatrix: { party: { enemy: 'hostile' }, enemy: { party: 'hostile' } },
            objectives: standardObjectives, completionPolicy: { mode: 'allRequired' },
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
  }
      capabilities.authoring.provideFactory({
        id: 'region.pack', version: 1, fn: regionPack
      });
      capabilities.authoring.provideFactory({
        id: 'effect.damage', version: 1, fn: damageEffect
      });
    }
  });
})();
