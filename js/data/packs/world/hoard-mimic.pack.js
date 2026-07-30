(function () {
  'use strict';
  var Game = window.Game;

  function damage(coefficient) {
    return {
      type: 'damage', damageTypeId: 'blunt',
      formulaId: 'core.damage.power-coefficient-v1',
      params: { powerStat: 'physicalPower', coefficient: coefficient }
    };
  }

  function stats(id, hpMultiplier, powerMultiplier) {
    return {
      id: id, schemaVersion: 1,
      stats: {
        maxHp: { base: 55 * hpMultiplier, tierScale: 2.05 },
        armor: { base: 3.3, tierScale: 1.9 },
        ward: { base: 2.7, tierScale: 1.9 },
        physicalPower: { base: 8 * powerMultiplier, tierScale: 1.95 },
        magicPower: { base: 8 * powerMultiplier, tierScale: 1.95 },
        accuracy: 0.91, gcdSpeed: 0.94, castSpeed: 0.94,
        autoAttackSpeed: 0.94, cooldownRate: 1,
        moveSpeed: 34, range: 26,
        critChance: 0.04, critMultiplier: 1.5, dodgeChance: 0,
        healingPower: 0,
        shieldPower: { base: 55 * hpMultiplier, tierScale: 2.05 },
        lifesteal: 0, statusPotency: 1.05, tenacity: 0.16,
        interruptPower: 1, threatMultiplier: 1, resourceRegen: 1,
        expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
      }
    };
  }

  function variant(id, statProfileId, spriteId, abilityGrantIds, tags) {
    return {
      id: id, archetypeId: 'hoard_mimic',
      overrides: {
        statProfileId: statProfileId,
        abilityGrantIds: abilityGrantIds,
        presentation: {
          spriteId: spriteId, portraitId: spriteId, scale: 1,
          renderProfileId: 'render.actor.standard'
        },
        tags: ['mimic', 'chest-trap', 'ephemeral'].concat(tags || [])
      },
      transitions: []
    };
  }

  function encounterPack(id, variantId) {
    return {
      id: id,
      members: [{ slotId: 'maw', archetypeId: 'hoard_mimic', variantId: variantId }],
      formation: { spacing: 0 }, leashRadius: 96, rewardBudget: 1, groupAlert: false
    };
  }

  function spawnProfile(id, packId) {
    return {
      id: id, encounterPackId: packId, mountTo: [],
      identity: { scope: 'ephemeral' },
      placement: {
        selector: 'anchor', source: 'summoner', required: true,
        onFailure: 'abortGroup', occupancyRadius: 10
      },
      lifecycle: {
        activation: 'scripted', unload: 'despawn',
        onDefeat: 'closeLease', onEscape: 'closeLease',
        respawn: { mode: 'none', resetVariant: true }
      },
      offlineEligible: false
    };
  }

  Game.content.registerPack({
    id: 'world.hoard-mimic', version: '1.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/world/hoard-mimic.pack.js',
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    locales: {
      'zh-CN': {
        monster: { hoard_mimic: {
          name: '噬宝匣',
          desc: '被贪欲唤醒的伪装魔物，会在箱盖掀开的瞬间咬住猎物。'
        } },
        combat: {
          lore: { hoard_mimic: '旧冒险者说，真正的宝箱从不会在你靠近时屏住呼吸。' },
          ability: {
            hoard_mimic_bite: { name: '铜牙啮咬' },
            hoard_mimic_locktongue: { name: '锁舌擒拿' },
            hoard_mimic_cursed_clasp: { name: '咒扣合围' },
            hoard_mimic_coin_storm: { name: '恶币风暴' }
          },
          status: {
            hoard_mimic_clasped: { name: '锁舌迟滞' },
            hoard_mimic_cursed_mark: { name: '贪欲咒印' }
          },
          trait: { hoard_mimic: { name: '伪宝本能' } }
        }
      },
      en: {
        monster: { hoard_mimic: {
          name: 'Hoard Maw',
          desc: 'A greed-woken predator that bites the instant its false lid opens.'
        } },
        combat: {
          lore: { hoard_mimic: 'Old adventurers say a real chest never holds its breath when you approach.' },
          ability: {
            hoard_mimic_bite: { name: 'Brass-Fang Bite' },
            hoard_mimic_locktongue: { name: 'Locktongue Snare' },
            hoard_mimic_cursed_clasp: { name: 'Cursed Clasp' },
            hoard_mimic_coin_storm: { name: 'Wicked Coinstorm' }
          },
          status: {
            hoard_mimic_clasped: { name: 'Locktongue Slow' },
            hoard_mimic_cursed_mark: { name: 'Mark of Greed' }
          },
          trait: { hoard_mimic: { name: 'False-Hoard Instinct' } }
        }
      }
    },
    definitions: {
      statProfile: [
        stats('stats.hoard_mimic.weathered', 1.25, .9),
        stats('stats.hoard_mimic.cursed', 1.35, .95),
        stats('stats.hoard_mimic.royal', 1.45, 1)
      ],
      status: [
        {
          id: 'hoard_mimic.clasped', stacking: 'refresh', durationTicks: 36,
          modifiers: [{ stat: 'moveSpeed', phase: 'multiply', operation: 'multiply', value: .68 }],
          presentation: { nameKey: 'combat.status.hoard_mimic_clasped.name', icon: 'icon_skill_swift' }
        },
        {
          id: 'hoard_mimic.cursed_mark', stacking: 'refresh', durationTicks: 90,
          modifiers: [
            { stat: 'armor', phase: 'multiply', operation: 'multiply', value: .86 },
            { stat: 'ward', phase: 'multiply', operation: 'multiply', value: .86 }
          ],
          presentation: { nameKey: 'combat.status.hoard_mimic_cursed_mark.name', icon: 'icon_skill_poison' }
        }
      ],
      ability: [
        {
          id: 'hoard_mimic.bite', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 10, cooldownTicks: 0, queueable: true },
          target: { relation: 'hostile', shape: 'single', range: 28 },
          effects: [damage(.78)],
          aiHints: { priority: 12 },
          presentation: { nameKey: 'combat.ability.hoard_mimic_bite.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'hoard_mimic.locktongue', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 12, animationLockTicks: 11, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 54 },
          telegraph: { shape: 'single', radius: 18, expectedDamagePct: .08 },
          effects: [
            damage(.64), { type: 'pull', distance: 16 },
            { type: 'applyStatus', statusId: 'hoard_mimic.clasped' }
          ],
          aiHints: { priority: 78 },
          presentation: { nameKey: 'combat.ability.hoard_mimic_locktongue.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'hoard_mimic.cursed_clasp', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 12, cooldownTicks: 210, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 34 },
          telegraph: { shape: 'single', radius: 20, expectedDamagePct: .14 },
          effects: [damage(1.04), { type: 'applyStatus', statusId: 'hoard_mimic.cursed_mark' }],
          aiHints: { priority: 84 },
          presentation: { nameKey: 'combat.ability.hoard_mimic_cursed_clasp.name', icon: 'icon_skill_poison' }
        },
        {
          id: 'hoard_mimic.coinstorm', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 14, cooldownTicks: 240, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 62, radius: 34, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 34, expectedDamagePct: .18 },
          effects: [damage(1.16), { type: 'knockback', distance: 10 }],
          aiHints: { priority: 88 },
          presentation: { nameKey: 'combat.ability.hoard_mimic_coin_storm.name', icon: 'icon_skill_whirl' }
        }
      ],
      trait: [{
        id: 'hoard_mimic.trait', kind: 'passive', modifiers: [], triggers: [],
        presentation: { nameKey: 'combat.trait.hoard_mimic.name', icon: 'icon_skill_guard' }
      }],
      rewardProfile: [{
        id: 'reward.hoard_mimic', schemaVersion: 1,
        exp: { base: 8.4, tierScale: 1.95 },
        gold: { base: 4.9, tierScale: 1.9 },
        dropBudget: 1
      }],
      actorArchetype: [{
        id: 'hoard_mimic', category: 'monster', rank: 'normal',
        identity: {
          nameKey: 'monster.hoard_mimic.name',
          descKey: 'monster.hoard_mimic.desc',
          loreKey: 'combat.lore.hoard_mimic'
        },
        presentation: {
          spriteId: 'mimic_weathered', portraitId: 'mimic_weathered', scale: 1,
          renderProfileId: 'render.actor.standard'
        },
        body: { size: 'medium', collisionRadius: 10, movementTypes: ['ground'] },
        tags: ['mimic', 'chest-trap', 'ephemeral'], defaultFactionId: 'wild',
        statProfileId: 'stats.hoard_mimic.weathered',
        resourceProfileIds: [],
        abilityGrantIds: ['hoard_mimic.bite', 'hoard_mimic.locktongue'],
        traitIds: ['hoard_mimic.trait'],
        resistanceProfileId: 'resist.standard',
        aiProfileId: 'ai.monster.standard',
        rewardProfileId: 'reward.hoard_mimic',
        interactionProfileId: 'interaction.hostile',
        engagementPolicyId: 'engagement.hostile'
      }],
      actorVariant: [
        variant(
          'hoard_mimic.weathered', 'stats.hoard_mimic.weathered', 'mimic_weathered',
          ['hoard_mimic.bite', 'hoard_mimic.locktongue'], ['tier-low']
        ),
        variant(
          'hoard_mimic.cursed', 'stats.hoard_mimic.cursed', 'mimic_cursed',
          ['hoard_mimic.bite', 'hoard_mimic.locktongue', 'hoard_mimic.cursed_clasp'], ['tier-mid']
        ),
        variant(
          'hoard_mimic.royal', 'stats.hoard_mimic.royal', 'mimic_royal',
          ['hoard_mimic.bite', 'hoard_mimic.locktongue', 'hoard_mimic.cursed_clasp', 'hoard_mimic.coinstorm'],
          ['tier-high']
        )
      ],
      encounterPack: [
        encounterPack('hoard_mimic.weathered', 'hoard_mimic.weathered'),
        encounterPack('hoard_mimic.cursed', 'hoard_mimic.cursed'),
        encounterPack('hoard_mimic.royal', 'hoard_mimic.royal')
      ],
      worldSpawnProfile: [
        spawnProfile('spawn.hoard_mimic.weathered', 'hoard_mimic.weathered'),
        spawnProfile('spawn.hoard_mimic.cursed', 'hoard_mimic.cursed'),
        spawnProfile('spawn.hoard_mimic.royal', 'hoard_mimic.royal')
      ]
    }
  });
})();
