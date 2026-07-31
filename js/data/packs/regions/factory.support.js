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
        moveSpeed: mods.moveSpeed !== undefined ? mods.moveSpeed : (boss ? 44 : 38),
        range: mods.range !== undefined ? mods.range : 24,
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
  function archetype(spec, monster, rank, category) {
    category = category || 'monster';
    var isSummon = category === 'summon';
    return {
      id: monster.id, category: category, rank: rank || 'normal',
      identity: {
        nameKey: 'monster.' + monster.id + '.name',
        descKey: 'monster.' + monster.id + '.desc',
        loreKey: 'combat.lore.' + monster.id
      },
      presentation: {
        spriteId: monster.id, portraitId: monster.portraitId || monster.id,
        scale: monster.scale || 1,
        renderProfileId: isSummon ? 'render.actor.object' : 'render.actor.standard'
      },
      body: {
        size: rank === 'boss' ? 'large' : (monster.size || (isSummon ? 'small' : 'medium')),
        collisionRadius: rank === 'boss' ? 14 : (monster.collisionRadius || (isSummon ? 7 : 8)),
        movementTypes: monster.movementTypes || ['ground']
      },
      tags: (monster.tags || []).concat([isSummon ? 'summon' : (rank === 'boss' ? 'boss' : 'normal')]),
      defaultFactionId: spec.factionId,
      statProfileId: 'stats.' + monster.id,
      resourceProfileIds: rank === 'boss' ? ['resources.boss'] : [],
      abilityGrantIds: [monster.id + '.basic'].concat(monster.abilityIds),
      traitIds: [monster.id + '.trait'],
      resistanceProfileId: rank === 'boss' ? 'resist.boss' : 'resist.standard',
      aiProfileId: rank === 'boss' ? 'ai.boss.standard' : 'ai.monster.standard',
      rewardProfileId: isSummon ? 'reward.none' : 'reward.' + monster.id,
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
    var normals = spec.normals || [];
    var summons = spec.summons || [];
    var hazards = spec.hazards || [];
    var boss = spec.boss;
    var combatants = normals.concat(summons, [boss]);
    var rewarded = normals.concat([boss]);
    var catalogRegion = regionById(spec.regionId);
    if (!catalogRegion) throw new Error('[RegionFactory] missing catalog region: ' + spec.regionId);
    if (normals.length < 2) throw new Error('[RegionFactory] at least two normal actors required: ' + spec.regionId);
    spec.tier = catalogRegion.tier;
    var abilities = [];
    var traits = [];
    combatants.forEach(function (monster) {
      monster.abilityIds = monster.abilityIds || [];
      monster.abilities = monster.abilities || [];
      abilities.push(basicAbility(monster, monster === boss));
      abilities = abilities.concat(monster.abilities);
      traits.push(trait(monster));
    });
    var normalPackMembers = spec.encounterRecipes || [
      { id: 'solo-a', members: [normals[0].id], weight: 30, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-b', members: [normals[1].id], weight: 28, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'duo', members: [normals[0].id, normals[1].id], weight: 26, spacing: 28, leashRadius: 132, rewardBudget: 1.25, ambushEligible: true },
      { id: 'trio', members: [normals[0].id, normals[1].id, normals[0].id], weight: 16, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ];
    normalPackMembers = normalPackMembers.map(function (recipe) {
      var copy = JSON.parse(JSON.stringify(recipe));
      if (copy.id.indexOf(spec.regionId + '.') !== 0) copy.id = spec.regionId + '.' + copy.id;
      copy.spacing = copy.spacing || 22;
      copy.leashRadius = copy.leashRadius || 120;
      copy.rewardBudget = copy.rewardBudget || 1;
      return copy;
    });
    function stableMembers(pack) {
      return pack.members.map(function (member, index) {
        var ref = typeof member === 'string' ? { archetypeId: member } : member;
        return {
          slotId: ref.slotId || 'member-' + (index + 1),
          archetypeId: ref.archetypeId,
          variantId: ref.variantId
        };
      });
    }
    var encounterPacks = normalPackMembers.map(function (pack) {
      return {
        id: pack.id, members: stableMembers(pack),
        formation: { spacing: pack.spacing }, leashRadius: pack.leashRadius,
        rewardBudget: pack.rewardBudget, groupAlert: true,
        ambushEligible: pack.ambushEligible === true,
        containsSummoner: pack.containsSummoner === true
      };
    });
    var guardianBase = normals.filter(function (monster) {
      return monster.id === (spec.guardianBaseId || normals[1].id);
    })[0];
    if (!guardianBase) throw new Error('[RegionFactory] guardianBaseId is not a normal actor: ' + spec.guardianBaseId);
    encounterPacks.push({
      id: spec.regionId + '.guardian',
      members: [{
        slotId: 'guardian', archetypeId: guardianBase.id,
        variantId: guardianBase.id + '.guardian'
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
    summons.forEach(function (summon) {
      spawnProfiles.push({
        id: 'spawn.' + summon.id,
        actorRef: { archetypeId: summon.id },
        mountTo: [], summonOnly: true,
        identity: { scope: 'ephemeral' },
        placement: {
          selector: 'anchor', source: 'summoner', required: true,
          onFailure: 'abortGroup', occupancyRadius: summon.collisionRadius || 7
        },
        lifecycle: {
          activation: 'scripted', unload: 'despawn', onDefeat: 'closeLease',
          onEscape: 'closeLease', respawn: { mode: 'none', resetVariant: true }
        },
        offlineEligible: false
      });
    });
    var baseNormalProfile = profile(guardianBase.id, guardianBase.mods, false);
    var guardianProfile = scaledProfile('stats.' + guardianBase.id + '.guardian', baseNormalProfile, {
      maxHp: 4.2, armor: 1.45, ward: 1.45, physicalPower: 1.55,
      magicPower: 1.55, healingPower: 1.55, shieldPower: 4.2
    });
    var hazardProfiles = hazards.map(function (hazard) {
      var copy = JSON.parse(JSON.stringify(hazard));
      delete copy.visual;
      copy.visualProfileId = copy.visualProfileId || copy.id + '.visual';
      return copy;
    });
    var hazardVisualProfiles = hazards.map(function (hazard) {
      var visual = JSON.parse(JSON.stringify(hazard.visual || {}));
      visual.id = hazard.visualProfileId || hazard.id + '.visual';
      visual.shape = visual.shape || hazard.trigger.shape;
      visual.states = visual.states || {
        concealed: { token: 'clue' },
        dormant: { token: 'revealed' },
        warning: { token: 'telegraph' },
        active: { token: 'impact' },
        cooldown: { token: 'residue' }
      };
      return visual;
    });
    if (!catalogRegion.climate) {
      throw new Error('[RegionFactory] missing climate profile: ' + spec.regionId);
    }
    var climateProfile = JSON.parse(JSON.stringify(catalogRegion.climate));
    climateProfile.id = 'climate.' + spec.regionId;
    climateProfile.regionId = spec.regionId;
    var regionProjection = JSON.parse(JSON.stringify(catalogRegion));
    delete regionProjection.climate;
    regionProjection.climateProfileId = climateProfile.id;
    regionProjection.monsters = normals.map(function (monster) { return monster.id; });
    regionProjection.summons = summons.map(function (summon) { return summon.id; });
    regionProjection.hazards = hazards.map(function (hazard) { return hazard.id; });
    if (regionProjection.exploration && regionProjection.exploration.guardian) {
      regionProjection.exploration.guardian.monster = guardianBase.id;
    }
    var offline = JSON.parse(JSON.stringify(spec.offlineRepresentative || {
      encounterPackId: normalPackMembers[0].id,
      secondaryEncounterPackId: normalPackMembers[1].id
    }));
    ['encounterPackId', 'secondaryEncounterPackId'].forEach(function (field) {
      if (offline[field] && offline[field].indexOf(spec.regionId + '.') !== 0) {
        offline[field] = spec.regionId + '.' + offline[field];
      }
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
      id: 'region.' + spec.regionId, version: spec.version || '2.1.0', schemaVersion: 1,
      sourceFile: spec.sourceFile,
      requires: [{ id: 'core.combat', range: '^2.0.0' }, { id: 'world.actors', range: '^2.0.0' }],
      locales: spec.locales,
      definitions: {
        statProfile: combatants.map(function (monster) { return profile(monster.id, monster.mods, monster === boss); }).concat([guardianProfile]),
        status: spec.statuses || [],
        ability: abilities,
        trait: traits,
        rewardProfile: rewarded.map(function (monster) { return reward(monster, monster === boss); }),
        actorArchetype: normals.map(function (monster) {
          return archetype(spec, monster, 'normal', 'monster');
        }).concat(summons.map(function (summon) {
          return archetype(spec, summon, 'normal', 'summon');
        }), [archetype(spec, boss, 'boss', 'monster')]),
        actorVariant: [{
          id: guardianBase.id + '.guardian', archetypeId: guardianBase.id,
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
          offlineRepresentative: offline
        }],
        climateProfile: [climateProfile],
        regionProfile: [{
          id: spec.regionId, tier: catalogRegion.tier,
          populationProfileId: 'population.' + spec.regionId,
          climateProfileId: climateProfile.id,
          hazardProfileIds: hazardProfiles.map(function (hazard) { return hazard.id; }),
          projection: regionProjection
        }],
        hazardProfile: hazardProfiles,
        hazardVisualProfile: hazardVisualProfiles,
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
        id: 'region.pack', version: 2, fn: regionPack
      });
      capabilities.authoring.provideFactory({
        id: 'effect.damage', version: 1, fn: damageEffect
      });
    }
  });
})();
