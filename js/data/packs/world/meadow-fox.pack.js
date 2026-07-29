(function () {
  'use strict';
  var Game = window.Game;
  Game.content.registerPack({
    id: 'world.meadow-fox', version: '1.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/world/meadow-fox.pack.js',
    requires: [
      { id: 'core.combat', range: '^2.0.0' },
      { id: 'region.grassland', range: '^2.0.0' }
    ],
    locales: {
      'zh-CN': {
        actor: { meadow_fox: {
          name: '草原狐', desc: '在草丛间觅食的中立小兽。',
          lore: '公会要求冒险者不要主动惊扰这类未受瘴气侵蚀的野生动物。'
        } },
        combat: { ability: { meadow_fox_bite: { name: '受惊啮咬' } } }
      },
      en: {
        actor: { meadow_fox: {
          name: 'Meadow Fox', desc: 'A neutral animal foraging among the grass.',
          lore: 'The guild asks adventurers not to disturb wildlife untouched by miasma.'
        } },
        combat: { ability: { meadow_fox_bite: { name: 'Cornered Bite' } } }
      }
    },
    definitions: {
      statProfile: [{
        id: 'stats.meadow_fox', stats: {
          maxHp: { base: 34, tierScale: 2.05 }, armor: { base: 2, tierScale: 1.9 },
          ward: { base: 1, tierScale: 1.9 }, physicalPower: { base: 6, tierScale: 1.95 },
          magicPower: 0, accuracy: 0.9, gcdSpeed: 1.08, castSpeed: 1,
          autoAttackSpeed: 1.08, cooldownRate: 1, moveSpeed: 46, range: 20,
          critChance: 0.02, critMultiplier: 1.5, dodgeChance: 0.04,
          healingPower: 0, shieldPower: 34, lifesteal: 0, statusPotency: 0.8,
          tenacity: 0.05, interruptPower: 0.5, threatMultiplier: 1, resourceRegen: 1,
          expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
        }
      }],
      ability: [{
        id: 'meadow_fox.bite', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 0, queueable: true },
        target: { relation: 'hostile', shape: 'single', range: 22 },
        effects: [{
          type: 'damage', damageTypeId: 'piercing',
          formulaId: 'core.damage.power-coefficient-v1',
          params: { powerStat: 'physicalPower', coefficient: 0.72 }
        }],
        aiHints: { priority: 15 },
        presentation: { nameKey: 'combat.ability.meadow_fox_bite.name', icon: 'icon_skill_strike' }
      }],
      actorArchetype: [{
        id: 'creature.meadow_fox', category: 'npc', rank: 'normal',
        identity: {
          nameKey: 'actor.meadow_fox.name', descKey: 'actor.meadow_fox.desc',
          loreKey: 'actor.meadow_fox.lore'
        },
        presentation: {
          spriteId: 'wolf_gray', portraitId: 'wolf_gray', scale: 0.62,
          renderProfileId: 'render.actor.npc'
        },
        body: { size: 'small', collisionRadius: 6, movementTypes: ['ground'] },
        tags: ['peaceful-creature', 'wildlife'], defaultFactionId: 'wildlife',
        interactionProfileId: 'interaction.attackable-neutral',
        engagementPolicyId: 'engagement.neutral-provokable'
      }],
      actorVariant: [{
        id: 'creature.meadow_fox.cornered', archetypeId: 'creature.meadow_fox',
        overrides: {
          statProfileId: 'stats.meadow_fox', abilityGrantIds: ['meadow_fox.bite'],
          aiProfileId: 'ai.monster.standard', resistanceProfileId: 'resist.standard',
          rewardProfileId: 'reward.none',
          presentation: {
            spriteId: 'wolf_gray', portraitId: 'wolf_gray', scale: 0.62,
            renderProfileId: 'render.actor.standard'
          },
          interactionProfileId: 'interaction.hostile',
          engagementPolicyId: 'engagement.neutral-provokable',
          tags: ['peaceful-creature', 'wildlife', 'cornered']
        },
        transitions: [{
          from: null, to: 'creature.meadow_fox.cornered',
          triggerId: 'provoked', timing: 'outOfEncounter', activeAction: 'defer', persistence: 'none'
        }]
      }],
      encounterPack: [{
        id: 'grassland.meadow-fox',
        members: [{
          slotId: 'fox', archetypeId: 'creature.meadow_fox',
          variantId: 'creature.meadow_fox.cornered'
        }],
        formation: { spacing: 0 }, leashRadius: 92, rewardBudget: 0, groupAlert: false
      }],
      worldSpawnProfile: [{
        id: 'spawn.grassland.meadow-fox',
        actorRef: { archetypeId: 'creature.meadow_fox' },
        onProvokedVariantId: 'creature.meadow_fox.cornered',
        encounterPackIdOnProvoked: 'grassland.meadow-fox',
        mountTo: [{
          populationId: 'population.grassland', channel: 'npc', mode: 'required', count: 1
        }],
        identity: { scope: 'regionStable', socialGroupId: 'social.grassland-wildlife' },
        placement: {
          selector: 'candidate', source: 'spawnCandidates', required: false,
          onFailure: 'skipOptional', minCampDistance: 120, occupancyRadius: 7
        },
        lifecycle: {
          activation: 'regionActive', unload: 'despawn', onDefeat: 'closeLease',
          onEscape: 'closeLease', respawn: { mode: 'delay', delay: 90, resetVariant: true }
        },
        offlineEligible: false
      }]
    }
  });
})();
