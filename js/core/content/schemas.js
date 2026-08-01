/* V2 authoring schema metadata. Runtime validation is intentionally data-only. */
(function () {
  'use strict';
  var Game = window.Game;

  var definitionTypes = [
    'stat', 'statProfile', 'damageType', 'resistanceProfile', 'resource',
    'resourceProfile', 'faction', 'combatRules', 'renderProfile',
    'actorArchetype', 'class', 'equipmentProfile', 'talentTree', 'talent',
    'ability', 'trait', 'status', 'aiProfile', 'tacticsProfile',
    'evaluationProfile', 'rewardProfile', 'encounterProfile',
    'actorVariant', 'encounterPack', 'worldSpawnProfile',
    'encounterPoolProfile', 'guardSiteProfile',
    'worldPopulationProfile', 'regionProfile', 'climateProfile', 'engagementPolicy',
    'interactionProfile', 'merchantProfile', 'merchantStockPool',
    'dialogueProfile', 'hazardProfile', 'hazardVisualProfile'
  ];

  var required = {
    stat: ['id', 'defaultValue', 'min', 'max'],
    damageType: ['id', 'category'],
    resource: ['id', 'min', 'max', 'initial'],
    faction: ['id', 'relations'],
    combatRules: ['id', 'tickMs', 'baseGcdTicks'],
    actorArchetype: ['id', 'category', 'identity', 'presentation', 'body', 'defaultFactionId'],
    class: ['id', 'roles', 'statProfileId', 'baseAbilityGrantIds', 'talentTreeId'],
    talent: ['id', 'classId', 'unlockLevel', 'maxRank', 'costs'],
    ability: ['id', 'kind', 'target', 'presentation'],
    trait: ['id', 'kind', 'presentation'],
    status: ['id', 'stacking', 'durationTicks', 'presentation'],
    aiProfile: ['id', 'priorities'],
    tacticsProfile: ['id', 'reactionDelayTicks'],
    rewardProfile: ['id'],
    encounterProfile: ['id', 'regionId', 'rulesProfileId'],
    actorVariant: ['id', 'archetypeId', 'overrides'],
    encounterPack: ['id', 'members'],
    worldSpawnProfile: ['id', 'identity', 'mountTo', 'placement', 'lifecycle'],
    encounterPoolProfile: ['id', 'regionId', 'category', 'roles', 'entries'],
    guardSiteProfile: [
      'id', 'regionId', 'targetKinds', 'coverage', 'modeWeights',
      'visiblePoolId', 'ambushPoolId', 'triggerRadius', 'detection',
      'resetPolicy', 'offlinePolicy'
    ],
    worldPopulationProfile: ['id', 'regionId', 'channels'],
    regionProfile: ['id', 'tier', 'populationProfileId', 'climateProfileId'],
    climateProfile: ['id', 'regionId', 'exposure', 'factors', 'states', 'presentation'],
    engagementPolicy: ['id', 'manualAttack', 'autoAggro'],
    interactionProfile: ['id', 'actions'],
    merchantProfile: [
      'id', 'regionIds', 'spawnProfileId', 'stockPoolId',
      'dialogueProfileId', 'presentation'
    ],
    merchantStockPool: ['id', 'materials', 'signatureAffixes'],
    dialogueProfile: ['id', 'states'],
    hazardProfile: [
      'id', 'regionId', 'category', 'trigger', 'detection', 'lifecycle',
      'outcome', 'placement', 'visualProfileId', 'presentation'
    ],
    hazardVisualProfile: ['id', 'shape', 'states']
  };

  var references = {
    statProfile: { stats: 'stat' },
    resistanceProfile: { resistances: 'damageType' },
    resourceProfile: { resourceIds: 'resource' },
    actorArchetype: {
      defaultFactionId: 'faction', statProfileId: 'statProfile',
      resourceProfileIds: 'resourceProfile', abilityGrantIds: 'ability',
      traitIds: 'trait', resistanceProfileId: 'resistanceProfile',
      aiProfileId: 'aiProfile', rewardProfileId: 'rewardProfile',
      renderProfileId: 'renderProfile', interactionProfileId: 'interactionProfile',
      engagementPolicyId: 'engagementPolicy'
    },
    class: {
      statProfileId: 'statProfile', resourceProfileIds: 'resourceProfile',
      baseAbilityGrantIds: 'ability', traitIds: 'trait',
      talentTreeId: 'talentTree', equipmentProfileId: 'equipmentProfile',
      aiProfileId: 'aiProfile', tacticsProfileIds: 'tacticsProfile',
      evaluationProfileId: 'evaluationProfile'
    },
    talentTree: { talentIds: 'talent' },
    talent: { classId: 'class', abilityIds: 'ability', traitIds: 'trait' },
    trait: { statusIds: 'status', abilityIds: 'ability' },
    encounterProfile: { rulesProfileId: 'combatRules', bossEncounterId: 'encounterProfile' },
    actorVariant: { archetypeId: 'actorArchetype' },
    worldPopulationProfile: { regionId: 'regionProfile' },
    regionProfile: {
      populationProfileId: 'worldPopulationProfile',
      hazardProfileIds: 'hazardProfile',
      guardSiteProfileIds: 'guardSiteProfile',
      climateProfileId: 'climateProfile'
    },
    encounterPoolProfile: { regionId: 'regionProfile' },
    guardSiteProfile: {
      regionId: 'regionProfile', visiblePoolId: 'encounterPoolProfile',
      ambushPoolId: 'encounterPoolProfile'
    },
    climateProfile: { regionId: 'regionProfile' },
    merchantProfile: {
      regionIds: 'regionProfile', spawnProfileId: 'worldSpawnProfile',
      stockPoolId: 'merchantStockPool', dialogueProfileId: 'dialogueProfile'
    },
    hazardProfile: {
      regionId: 'regionProfile', visualProfileId: 'hazardVisualProfile'
    }
  };

  var defaults = {
    actorArchetype: {
      schemaVersion: 1, rank: 'normal', tags: [], resourceProfileIds: [],
      abilityGrantIds: [], traitIds: [],
      interactionProfileId: 'interaction.protected-npc',
      engagementPolicyId: 'engagement.protected'
    },
    class: {
      schemaVersion: 1, tags: [], roles: [], resourceProfileIds: [],
      baseAbilityGrantIds: [], traitIds: [], tacticsProfileIds: []
    },
    talent: {
      schemaVersion: 1, maxRank: 10, costs: [1], grants: {},
      modifiers: [], presentation: {}
    },
    ability: {
      schemaVersion: 1, tags: [], costs: [], conditions: [], effects: [],
      aiHints: {}, presentation: {}
    },
    trait: {
      schemaVersion: 1, kind: 'passive', tags: [], modifiers: [],
      triggers: [], presentation: {}
    },
    status: {
      schemaVersion: 1, stacking: 'refresh', maxStacks: 1, durationTicks: 0,
      tags: [], modifiers: [], periodic: [], presentation: {}
    },
    encounterProfile: {
      schemaVersion: 1, packs: [], phaseRules: [], presentation: {},
      teamSlots: [], relationMatrix: {}, objectives: [],
      completionPolicy: { mode: 'allRequired' }
    },
    actorVariant: {
      schemaVersion: 1, overrides: {}, transitions: [], tags: []
    },
    encounterPack: {
      schemaVersion: 1, members: [], formation: { spacing: 22 },
      leashRadius: 120, rewardBudget: 1, groupAlert: true
    },
    worldSpawnProfile: {
      schemaVersion: 1, mountTo: [], identity: { scope: 'ephemeral' },
      placement: { selector: 'candidate', source: 'spawnCandidates', required: false, onFailure: 'skipOptional' },
      lifecycle: {
        activation: 'regionActive', unload: 'despawn', onDefeat: 'closeLease',
        onEscape: 'closeLease', respawn: { mode: 'delay', delay: 8, resetVariant: true }
      },
      offlineEligible: false
    },
    encounterPoolProfile: {
      schemaVersion: 1, roles: [], entries: []
    },
    guardSiteProfile: {
      schemaVersion: 1, targetKinds: [], coverage: 0.3,
      modeWeights: { visible: 1, ambush: 1 }, triggerRadius: 42,
      detection: { clueRadius: 112, revealRadius: 74, revealChance: 0.25 },
      resetPolicy: 'expedition', offlinePolicy: 'block'
    },
    worldPopulationProfile: {
      schemaVersion: 1, flags: {}, channels: {}, baseSpawnRefs: {},
      offlineEligible: true
    },
    regionProfile: { schemaVersion: 1, flags: {} },
    climateProfile: { schemaVersion: 1, states: {} },
    engagementPolicy: {
      schemaVersion: 1, manualAttack: false, autoAggro: false,
      groupPropagation: 'none', rewardEligible: false, memorySeconds: 0,
      aggroRadius: 0, contactRadius: 0, assistRadius: 0,
      maxAssistPacks: 0, requiresLineOfSight: true
    },
    interactionProfile: { schemaVersion: 1, actions: [] },
    merchantProfile: { schemaVersion: 1, regionIds: [], presentation: {} },
    merchantStockPool: {
      schemaVersion: 1, materials: [], signatureAffixes: [],
      staplePotionIds: ['potion_small', 'potion_large']
    },
    dialogueProfile: { schemaVersion: 1, states: {} },
    hazardProfile: {
      schemaVersion: 1,
      trigger: {
        mode: 'enter', shape: 'circle', radius: 16,
        movementTypes: ['ground'], actorFilter: 'playerParty',
        sweep: true, retrigger: 'afterExit'
      },
      detection: { clueRadius: 72, revealRadius: 48, revealChance: 1 },
      lifecycle: {
        revealTicks: 8, warningTicks: 20, activeTicks: 1,
        cooldownTicks: 600
      },
      placement: {
        source: 'hazardAnchor', count: [1, 1], minCampDistance: 180,
        minLandmarkDistance: 48, minSpacing: 96,
        requireWalkableEscape: true
      }
    },
    hazardVisualProfile: {
      schemaVersion: 1, shape: 'circle', states: {}
    }
  };

  Game.contentSchemas = {
    definitionTypes: definitionTypes,
    required: required,
    references: references,
    defaults: defaults,
    stableId: /^[a-z][A-Za-z0-9_.:-]*$/,
    categories: ['player', 'monster', 'npc', 'companion', 'summon', 'object'],
    relations: ['self', 'ally', 'neutral', 'hostile'],
    populationChannels: ['regular', 'rare', 'guardian', 'npc', 'boss'],
    encounterPoolCategories: ['regular', 'rare', 'elite', 'nest', 'boss'],
    encounterPoolRoles: [
      'wander', 'patrol', 'ambush', 'resourceGuard',
      'treasureGuard', 'bossGate'
    ],
    guardTargetKinds: ['resource', 'nestTreasure', 'bossGate'],
    objectiveTypes: ['eliminate', 'survive', 'protect', 'surrender', 'escape', 'timeout', 'custom'],
    climateFronts: ['calm', 'wet', 'volatile', 'dry', 'arcane'],
    climateExposures: ['open', 'canopy', 'underground', 'coldOpen', 'elevated', 'fortressExterior'],
    weatherPrecipitationTypes: ['none', 'rain', 'snow', 'ash', 'drip', 'dust', 'steam', 'motes']
  };
})();
