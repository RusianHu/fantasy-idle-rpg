(function () {
  'use strict';
  var Game = window.Game;
  Game.content.registerPack({
    id: 'fixture.authoring', version: '1.0.0', schemaVersion: 1,
    sourceFile: 'tests/fixtures/packs/authoring-smoke.js',
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    definitions: {
      actorArchetype: [{
        id: 'fixture.training_dummy', category: 'object', rank: 'normal',
        identity: {
          nameKey: 'actor.arcane_crystal.name',
          descKey: 'actor.arcane_crystal.desc',
          loreKey: 'actor.arcane_crystal.lore'
        },
        presentation: {
          spriteId: 'gather_aether_shard',
          renderProfileId: 'render.actor.object'
        },
        body: { size: 'medium', collisionRadius: 10, movementTypes: [] },
        tags: ['fixture'], defaultFactionId: 'ruin_guardians',
        statProfileId: 'stats.object',
        abilityGrantIds: ['object.arcane_pulse'],
        traitIds: [], resistanceProfileId: 'resist.standard',
        aiProfileId: 'ai.monster.standard', rewardProfileId: 'reward.none'
      }]
    }
  });
})();
