/* V2 authoring schema metadata. Runtime validation is intentionally data-only. */
(function () {
  'use strict';
  var Game = window.Game;

  var definitionTypes = [
    'stat', 'statProfile', 'damageType', 'resistanceProfile', 'resource',
    'resourceProfile', 'faction', 'combatRules', 'renderProfile',
    'actorArchetype', 'class', 'equipmentProfile', 'talentTree', 'talent',
    'ability', 'trait', 'status', 'aiProfile', 'tacticsProfile',
    'evaluationProfile', 'rewardProfile', 'encounterProfile'
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
    encounterProfile: ['id', 'regionId', 'rulesProfileId', 'packs']
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
      renderProfileId: 'renderProfile'
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
    encounterProfile: { rulesProfileId: 'combatRules', bossEncounterId: 'encounterProfile' }
  };

  var defaults = {
    actorArchetype: {
      schemaVersion: 1, rank: 'normal', tags: [], resourceProfileIds: [],
      abilityGrantIds: [], traitIds: []
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
      schemaVersion: 1, packs: [], phaseRules: [], presentation: {}
    }
  };

  Game.contentSchemas = {
    definitionTypes: definitionTypes,
    required: required,
    references: references,
    defaults: defaults,
    stableId: /^[a-z][A-Za-z0-9_.:-]*$/,
    categories: ['player', 'monster', 'npc', 'companion', 'summon', 'object'],
    relations: ['self', 'ally', 'neutral', 'hostile']
  };
})();
