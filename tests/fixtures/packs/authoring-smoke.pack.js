(function () {
  'use strict';
  var Game = window.Game;
  var identity = {
    nameKey: 'fixture.actor.name',
    descKey: 'fixture.actor.desc',
    loreKey: 'fixture.actor.lore'
  };
  var combat = {
    statProfileId: 'stats.fixture_actor',
    abilityGrantIds: ['fixture.strike'],
    traitIds: [], resistanceProfileId: 'resist.standard',
    aiProfileId: 'ai.monster.standard', rewardProfileId: 'reward.none'
  };
  function actor(id, category, factionId, profiles) {
    return Object.assign({
      id: id, category: category, rank: 'normal', identity: identity,
      presentation: {
        spriteId: 'slime_green', portraitId: 'slime_green', scale: 0.75,
        renderProfileId: category === 'npc' ? 'render.actor.npc' : 'render.actor.standard'
      },
      body: { size: 'small', collisionRadius: 7, movementTypes: ['ground'] },
      tags: ['fixture'], defaultFactionId: factionId,
      interactionProfileId: category === 'npc' ? 'interaction.protected-npc' : 'interaction.hostile',
      engagementPolicyId: category === 'npc' ? 'engagement.protected' : 'engagement.hostile'
    }, profiles || {});
  }

  Game.content.registerPack({
    id: 'fixture.authoring', version: '1.0.0', schemaVersion: 1,
    sourceFile: 'tests/fixtures/packs/authoring-smoke.pack.js',
    requires: [{ id: 'core.combat', range: '^2.0.0' }, { id: 'region.grassland', range: '^2.0.0' }],
    locales: {
      'zh-CN': { fixture: { actor: {
        name: '作者夹具单位', desc: '用于验证通用单位注册链路。', lore: '不会进入正式内容。'
      }, strike: { name: '夹具打击' } } },
      en: { fixture: { actor: {
        name: 'Authoring Fixture', desc: 'Validates the generic unit registration path.', lore: 'Not production content.'
      }, strike: { name: 'Fixture Strike' } } }
    },
    definitions: {
      statProfile: [{
        id: 'stats.fixture_actor', stats: {
          maxHp: 40, armor: 3, ward: 1, physicalPower: 7, magicPower: 0,
          accuracy: 0.9, gcdSpeed: 1, castSpeed: 1, autoAttackSpeed: 1,
          cooldownRate: 1, moveSpeed: 40, range: 20, critChance: 0,
          critMultiplier: 1.5, dodgeChance: 0, healingPower: 0,
          shieldPower: 40, lifesteal: 0, statusPotency: 1, tenacity: 0,
          interruptPower: 1, threatMultiplier: 1, resourceRegen: 1,
          expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
        }
      }],
      ability: [{
        id: 'fixture.strike', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 0, queueable: true },
        target: { relation: 'hostile', shape: 'single', range: 22 },
        effects: [{
          type: 'damage', damageTypeId: 'slashing',
          formulaId: 'core.damage.power-coefficient-v1',
          params: { powerStat: 'physicalPower', coefficient: 0.7 }
        }],
        presentation: { nameKey: 'fixture.strike.name', icon: 'icon_skill_strike' }
      }],
      actorArchetype: [
        actor('fixture.hostile_monster', 'monster', 'wild', combat),
        actor('fixture.peaceful_npc', 'npc', 'wildlife'),
        actor('fixture.combat_npc', 'npc', 'wildlife', {
          interactionProfileId: 'interaction.attackable-neutral',
          engagementPolicyId: 'engagement.neutral-provokable'
        }),
        actor('fixture.summon', 'summon', 'adventurers', combat)
      ],
      actorVariant: [{
        id: 'fixture.combat_npc.armed', archetypeId: 'fixture.combat_npc',
        overrides: Object.assign({}, combat, {
          interactionProfileId: 'interaction.hostile',
          engagementPolicyId: 'engagement.neutral-provokable',
          tags: ['fixture', 'combat-npc']
        }),
        transitions: [{
          from: null, to: 'fixture.combat_npc.armed', triggerId: 'provoked',
          timing: 'outOfEncounter', activeAction: 'defer', persistence: 'none'
        }]
      }],
      encounterPack: [
        { id: 'fixture.monster-pack', members: [{ slotId: 'monster', archetypeId: 'fixture.hostile_monster' }] },
        { id: 'fixture.combat-npc-pack', members: [{
          slotId: 'npc', archetypeId: 'fixture.combat_npc', variantId: 'fixture.combat_npc.armed'
        }] },
        { id: 'fixture.summon-pack', members: [{ slotId: 'summon', archetypeId: 'fixture.summon' }] }
      ],
      worldSpawnProfile: [
        {
          id: 'spawn.fixture.monster', encounterPackId: 'fixture.monster-pack',
          mountTo: [{ populationId: 'population.grassland', channel: 'rare', mode: 'weighted', weight: 1, maxCount: 1 }],
          identity: { scope: 'regionStable' },
          placement: { selector: 'candidate', source: 'spawnCandidates', required: false, onFailure: 'skipOptional' },
          lifecycle: { activation: 'regionActive', unload: 'despawn', onDefeat: 'closeLease', onEscape: 'closeLease', respawn: { mode: 'delay', delay: 15, resetVariant: true } }
        },
        {
          id: 'spawn.fixture.peaceful-npc', actorRef: { archetypeId: 'fixture.peaceful_npc' },
          mountTo: [{ populationId: 'population.grassland', channel: 'npc', mode: 'weighted', weight: 1, maxCount: 1 }],
          identity: { scope: 'regionStable', socialGroupId: 'fixture.social' },
          placement: { selector: 'candidate', source: 'spawnCandidates', required: false, onFailure: 'skipOptional' },
          lifecycle: { activation: 'regionActive', unload: 'despawn', onDefeat: 'closeLease', onEscape: 'closeLease', respawn: { mode: 'none', resetVariant: true } }
        },
        {
          id: 'spawn.fixture.combat-npc', actorRef: { archetypeId: 'fixture.combat_npc' },
          onProvokedVariantId: 'fixture.combat_npc.armed',
          encounterPackIdOnProvoked: 'fixture.combat-npc-pack',
          mountTo: [{ populationId: 'population.grassland', channel: 'npc', mode: 'weighted', weight: 1, maxCount: 1 }],
          identity: { scope: 'regionStable', socialGroupId: 'fixture.social' },
          placement: { selector: 'candidate', source: 'spawnCandidates', required: false, onFailure: 'skipOptional' },
          lifecycle: { activation: 'regionActive', unload: 'despawn', onDefeat: 'closeLease', onEscape: 'closeLease', respawn: { mode: 'delay', delay: 30, resetVariant: true } }
        },
        {
          id: 'spawn.fixture.summon', encounterPackId: 'fixture.summon-pack', mountTo: [],
          identity: { scope: 'ephemeral' }, summonOnly: true,
          placement: { selector: 'anchor', source: 'summoner', required: true, onFailure: 'abortGroup' },
          lifecycle: { activation: 'scripted', unload: 'despawn', onDefeat: 'closeLease', onEscape: 'closeLease', respawn: { mode: 'none', resetVariant: true } }
        }
      ]
    }
  });
})();
