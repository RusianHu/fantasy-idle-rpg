/* Regional encounter pools and guard-site contracts. Actor packs remain independently registered. */
(function () {
  'use strict';
  var Game = window.Game;
  var regions = [
    { id: 'grassland', guard: 'badger_brambleback', hunter: 'lizard_reedstalker', ambush: 'hazard.grassland.roadside_ambush' },
    { id: 'forest', guard: 'owlbear_mossclaw', hunter: 'mantis_vineblade', ambush: 'hazard.forest.thicket_ambush' },
    { id: 'mine', guard: 'crab_oreplate', hunter: 'worm_dustmaw', ambush: 'hazard.mine.tunnel_ambush' },
    { id: 'graveyard', guard: 'knight_cryptbound', hunter: 'spider_ossuary', ambush: 'hazard.graveyard.grave_ambush' },
    { id: 'snowpass', guard: 'troll_rimehide', hunter: 'leopard_snowveil', ambush: 'hazard.snowpass.whiteout_ambush' },
    { id: 'lavacave', guard: 'tortoise_basalt', hunter: 'scorpion_cindertail', ambush: 'hazard.lavacave.cinder_ambush' },
    { id: 'skyruins', guard: 'warden_galeforged', hunter: 'serpent_cloudcoil', ambush: 'hazard.skyruins.rift_ambush' },
    { id: 'darkcastle', guard: 'minotaur_ironhorn', hunter: 'stalker_shadeclaw', ambush: 'hazard.darkcastle.gate_ambush' }
  ];
  var recipeIds = ['solo-a', 'solo-b', 'solo-c', 'solo-d', 'duo', 'duo-summoner', 'duo-mixed', 'trio'];
  var recipeWeights = [18, 17, 13, 10, 16, 12, 9, 5];
  var ambushIds = ['solo-a', 'solo-b', 'solo-c', 'duo', 'duo-mixed'];
  var pools = [], guardProfiles = [], populationPatches = [], regionPatches = [], hazardPatches = [];

  function entry(spawnId, weight, maxPerMount) {
    var out = { worldSpawnProfileId: spawnId, weight: weight };
    if (maxPerMount) out.maxPerMount = maxPerMount;
    return out;
  }
  function pool(regionId, name, category, roles, entries) {
    return { id: 'pool.' + regionId + '.' + name, regionId: regionId,
      category: category, roles: roles, entries: entries };
  }
  function guardProfile(regionId, kind, targetKinds, coverage, visiblePool, ambushPool) {
    return {
      id: 'guard-site.' + regionId + '.' + kind, regionId: regionId,
      targetKinds: targetKinds, coverage: coverage,
      modeWeights: { visible: 1, ambush: kind === 'bossGate' ? 0 : 1 },
      visiblePoolId: visiblePool, ambushPoolId: ambushPool || visiblePool,
      triggerRadius: kind === 'bossGate' ? 58 : 42,
      detection: { clueRadius: 112, revealRadius: 74, revealChance: 0.25 },
      resetPolicy: 'expedition', offlinePolicy: 'block'
    };
  }

  regions.forEach(function (region) {
    var rid = region.id;
    var normalEntries = recipeIds.map(function (id, index) {
      return entry('spawn.' + rid + '.' + id, recipeWeights[index], 4);
    });
    var ambushEntries = ambushIds.map(function (id, index) {
      return entry('spawn.' + rid + '.' + id, [18, 17, 13, 16, 9][index], 2);
    });
    var specialGuardSpawn = 'spawn.' + rid + '.special.' + region.guard;
    var specialHunterSpawn = 'spawn.' + rid + '.special.' + region.hunter;
    var ids = {
      roaming: 'pool.' + rid + '.roaming', rareRoaming: 'pool.' + rid + '.rareRoaming',
      worldAmbush: 'pool.' + rid + '.worldAmbush',
      resourceGuardVisible: 'pool.' + rid + '.resourceGuardVisible',
      resourceGuardAmbush: 'pool.' + rid + '.resourceGuardAmbush',
      nestGuardVisible: 'pool.' + rid + '.nestGuardVisible',
      nestGuardAmbush: 'pool.' + rid + '.nestGuardAmbush',
      bossGate: 'pool.' + rid + '.bossGate', boss: 'pool.' + rid + '.boss'
    };
    pools.push(
      pool(rid, 'roaming', 'regular', ['wander', 'patrol'], normalEntries),
      pool(rid, 'rareRoaming', 'rare', ['wander'], [entry(specialGuardSpawn, 1, 1), entry(specialHunterSpawn, 1, 1)]),
      pool(rid, 'worldAmbush', 'regular', ['ambush'], ambushEntries),
      pool(rid, 'resourceGuardVisible', 'elite', ['resourceGuard', 'patrol'], [entry(specialGuardSpawn, 1, 1)]),
      pool(rid, 'resourceGuardAmbush', 'elite', ['resourceGuard', 'ambush'], [entry(specialHunterSpawn, 1, 1)]),
      pool(rid, 'nestGuardVisible', 'nest', ['treasureGuard', 'patrol'], [entry(specialGuardSpawn, 1, 1)]),
      pool(rid, 'nestGuardAmbush', 'nest', ['treasureGuard', 'ambush'], [entry(specialHunterSpawn, 1, 1)]),
      pool(rid, 'bossGate', 'elite', ['bossGate', 'patrol'], [entry('spawn.' + rid + '.guardian', 1, 1)]),
      pool(rid, 'boss', 'boss', ['patrol'], [entry('spawn.' + rid + '.boss', 1, 1)])
    );
    var resourceProfileId = 'guard-site.' + rid + '.resource';
    var nestProfileId = 'guard-site.' + rid + '.nest';
    var gateProfileId = 'guard-site.' + rid + '.bossGate';
    guardProfiles.push(
      guardProfile(rid, 'resource', ['resource'], 0.3, ids.resourceGuardVisible, ids.resourceGuardAmbush),
      guardProfile(rid, 'nest', ['nestTreasure'], 1, ids.nestGuardVisible, ids.nestGuardAmbush),
      guardProfile(rid, 'bossGate', ['bossGate'], 1, ids.bossGate, ids.bossGate)
    );
    populationPatches.push({
      id: 'population.' + rid, patch: true,
      channels: {
        regular: { poolProfileId: ids.roaming },
        rare: { capacity: 1, selection: 'weighted', poolProfileId: ids.rareRoaming },
        guardian: { poolProfileId: ids.bossGate },
        boss: { poolProfileId: ids.boss }
      }
    });
    regionPatches.push({
      id: rid, patch: true, encounterPoolIds: ids,
      guardSiteProfileIds: [resourceProfileId, nestProfileId, gateProfileId]
    });
    hazardPatches.push({ id: region.ambush, patch: true,
      outcome: { encounterPoolId: ids.worldAmbush } });
  });

  Game.content.registerPack({
    id: 'world.encounter-pools-v4', version: '1.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/guardians/z_region_ecology.pack.js',
    requires: regions.map(function (region) { return { id: 'region.' + region.id, range: '^2.0.0' }; })
      .concat(regions.reduce(function (out, region) {
        return out.concat([
          { id: 'monster.guard.' + region.guard, range: '^1.0.0' },
          { id: 'monster.guard.' + region.hunter, range: '^1.0.0' }
        ]);
      }, [])),
    definitions: {
      encounterPoolProfile: pools, guardSiteProfile: guardProfiles,
      worldPopulationProfile: populationPatches, regionProfile: regionPatches,
      hazardProfile: hazardPatches
    }
  });
})();
