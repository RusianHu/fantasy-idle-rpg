(function () {
  'use strict';
  var Game = window.Game;
  Game.content.registerPack({
    id: 'world.actors', version: '2.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/world/actors.pack.js',
    requires: [
      { id: 'core.combat', range: '^2.0.0' },
      { id: 'job.fighter', range: '^2.0.0' },
      { id: 'job.rogue', range: '^2.0.0' },
      { id: 'job.mage', range: '^2.0.0' },
      { id: 'job.cleric', range: '^2.0.0' },
      { id: 'job.ranger', range: '^2.0.0' }
    ],
    definitions: {
      ability: [
        {
          id: 'summon.shadow_bite', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 0, queueable: true },
          target: { relation: 'hostile', shape: 'single', range: 24 },
          effects: [{
            type: 'damage', damageTypeId: 'necrotic',
            formulaId: 'core.damage.power-coefficient-v1',
            params: { powerStat: 'physicalPower', coefficient: 0.72 }
          }],
          aiHints: { priority: 20 },
          presentation: { nameKey: 'combat.ability.shadow_bite.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'object.arcane_pulse', kind: 'reaction',
          trigger: { event: 'combat:hit', target: 'self' },
          limits: { perTick: 1 },
          target: { relation: 'hostile', shape: 'single', range: 48 },
          effects: [{
            type: 'damage', damageTypeId: 'arcane',
            formulaId: 'core.damage.power-coefficient-v1',
            params: { powerStat: 'magicPower', coefficient: 0.35 }
          }],
          presentation: { nameKey: 'combat.ability.arcane_pulse.name', icon: 'icon_skill_fire' }
        }
      ],
      actorArchetype: [
        {
          id: 'adventurer', category: 'player', rank: 'normal',
          identity: {
            nameKey: 'actor.adventurer.name',
            descKey: 'actor.adventurer.desc',
            loreKey: 'actor.adventurer.lore'
          },
          presentation: {
            spriteId: 'hero_fighter', portraitId: 'face_fighter',
            scale: 1, renderProfileId: 'render.actor.standard'
          },
          body: { size: 'medium', collisionRadius: 8, movementTypes: ['ground'] },
          tags: ['roster', 'explorer'], defaultFactionId: 'adventurers',
          statProfileId: 'stats.adventurer', resourceProfileIds: [],
          abilityGrantIds: [], traitIds: [], resistanceProfileId: 'resist.standard',
          aiProfileId: 'ai.player.standard', rewardProfileId: 'reward.none'
        },
        {
          id: 'npc.guild_scout', category: 'npc', rank: 'normal',
          identity: {
            nameKey: 'actor.guild_scout.name',
            descKey: 'actor.guild_scout.desc',
            loreKey: 'actor.guild_scout.lore'
          },
          presentation: {
            spriteId: 'hero_ranger', portraitId: 'face_ranger',
            scale: 1, renderProfileId: 'render.actor.npc'
          },
          body: { size: 'medium', collisionRadius: 8, movementTypes: ['ground'] },
          tags: ['camp', 'noncombat'], defaultFactionId: 'adventurers',
          abilityGrantIds: [], traitIds: []
        },
        {
          id: 'summon.shadow_wisp', category: 'summon', rank: 'normal',
          identity: {
            nameKey: 'actor.shadow_wisp.name',
            descKey: 'actor.shadow_wisp.desc',
            loreKey: 'actor.shadow_wisp.lore'
          },
          presentation: {
            spriteId: 'ghost_wisp', scale: 0.75,
            renderProfileId: 'render.actor.standard'
          },
          body: { size: 'small', collisionRadius: 6, movementTypes: ['flying'] },
          tags: ['summon', 'temporary'], defaultFactionId: 'adventurers',
          statProfileId: 'stats.adventurer', abilityGrantIds: ['summon.shadow_bite'],
          traitIds: [], resistanceProfileId: 'resist.standard',
          aiProfileId: 'ai.player.standard', rewardProfileId: 'reward.none'
        },
        {
          id: 'object.arcane_crystal', category: 'object', rank: 'normal',
          identity: {
            nameKey: 'actor.arcane_crystal.name',
            descKey: 'actor.arcane_crystal.desc',
            loreKey: 'actor.arcane_crystal.lore'
          },
          presentation: {
            spriteId: 'gather_aether_shard', scale: 1,
            renderProfileId: 'render.actor.object'
          },
          body: { size: 'medium', collisionRadius: 10, movementTypes: [] },
          tags: ['object', 'destructible'], defaultFactionId: 'ruin_guardians',
          statProfileId: 'stats.object', abilityGrantIds: ['object.arcane_pulse'],
          traitIds: [], resistanceProfileId: 'resist.standard',
          aiProfileId: 'ai.monster.standard', rewardProfileId: 'reward.none'
        }
      ]
    }
  });
})();
