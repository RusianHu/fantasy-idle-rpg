(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  Game.content.registerPack(Game.contentAuthoring.factory('region.pack')({
    regionId: 'lavacave', factionId: 'infernal',
    sourceFile: 'js/data/packs/regions/lavacave.pack.js',
    statuses: [
      {
        id: 'lavacave.burning', stacking: 'stack', maxStacks: 5, durationTicks: 140,
        periodicIntervalTicks: 20, periodic: [Object.assign(D('fire', 0.14), { canCrit: false })],
        presentation: { nameKey: 'combat.status.burning.name', icon: 'icon_skill_fire' }
      },
      {
        id: 'lavacave.thorns', stacking: 'refresh', durationTicks: 120,
        modifiers: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 1.18 }],
        presentation: { nameKey: 'combat.status.thorns.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'flame_demon.fire_shield', stacking: 'refresh', durationTicks: 120,
        modifiers: [
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.42 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 1.12 }
        ],
        presentation: { nameKey: 'combat.status.fire_shield.name', icon: 'icon_skill_fire' }
      },
      {
        id: 'flame_demon.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.3 },
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.25 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'fire_imp', mods: { hp: 0.9, atk: 1.15, spd: 2 }, damageType: 'fire', range: 58,
        abilityIds: ['fire_imp.ember_bolt'],
        abilities: [{
          id: 'fire_imp.ember_bolt', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 10, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 62 },
          effects: [D('fire', 1.08), { type: 'applyStatus', statusId: 'lavacave.burning' }],
          aiHints: { priority: 64 }, presentation: { nameKey: 'combat.ability.ember_bolt.name', icon: 'icon_skill_fire' }
        }],
        traitModifiers: [{ stat: 'magicPower', phase: 'multiply', operation: 'multiply', value: 1.08 }]
      },
      {
        id: 'lava_lizard', mods: { hp: 1.15, atk: 1 }, damageType: 'slashing',
        abilityIds: ['lava_lizard.searing_bite'],
        abilities: [{
          id: 'lava_lizard.searing_bite', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 10, animationLockTicks: 11, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 30 },
          effects: [D('slashing', 1.18), { type: 'applyStatus', statusId: 'lavacave.burning' }],
          aiHints: { priority: 64 }, presentation: { nameKey: 'combat.ability.searing_bite.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.16 }]
      },
      {
        id: 'slug_magma', mods: { hp: 1.2, atk: 1, def: 1.15, spd: -2 }, damageType: 'fire', range: 58,
        abilityIds: ['slug_magma.cinder_spit'],
        abilities: [{
          id: 'slug_magma.cinder_spit', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 16, animationLockTicks: 10, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 58 },
          effects: [D('fire', 0.88), { type: 'applyStatus', statusId: 'lavacave.burning' }],
          aiHints: { priority: 66 },
          presentation: { nameKey: 'combat.ability.slug_magma_cinder_spit.name', icon: 'icon_skill_fire' }
        }]
      },
      {
        id: 'cultist_cinder', mods: { hp: 0.9, atk: 1.08, spd: 0 }, damageType: 'fire', range: 66,
        abilityIds: ['cultist_cinder.raise_ember_totem'],
        abilities: [{
          id: 'cultist_cinder.raise_ember_totem', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 11, cooldownTicks: 280, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 66 },
          effects: [{ type: 'summon', archetypeId: 'summon.ember_totem', count: 1, maxActive: 1 }],
          aiHints: { priority: 96 },
          presentation: { nameKey: 'combat.ability.cultist_cinder_raise_ember_totem.name', icon: 'icon_skill_fire' }
        }]
      }
    ],
    summons: [{
      id: 'summon.ember_totem', mods: { hp: 0.46, atk: 0.52, moveSpeed: 0, range: 36 },
      movementTypes: [], range: 36, damageType: 'fire', basicCoefficient: 0.2,
      abilityIds: ['summon.ember_totem.heat_pulse'],
      abilities: [{
        id: 'summon.ember_totem.heat_pulse', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 14, animationLockTicks: 8, cooldownTicks: 100, queueable: true, interruptible: true },
        target: { relation: 'hostile', shape: 'circle', range: 36, radius: 36, maxTargets: 4 },
        telegraph: { shape: 'circle', radius: 36, expectedDamagePct: 0.07 },
        effects: [D('fire', 0.5), { type: 'applyStatus', statusId: 'lavacave.burning' }],
        aiHints: { priority: 115 },
        presentation: { nameKey: 'combat.ability.summon_ember_totem_heat_pulse.name', icon: 'icon_skill_fire' }
      }]
    }],
    guardianBaseId: 'lava_lizard',
    encounterRecipes: [
      { id: 'solo-a', members: ['fire_imp'], weight: 18, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-b', members: ['lava_lizard'], weight: 17, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-c', members: ['slug_magma'], weight: 13, spacing: 22, leashRadius: 124, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-d', members: ['cultist_cinder'], weight: 10, spacing: 22, leashRadius: 126, rewardBudget: 1.05, containsSummoner: true },
      { id: 'duo', members: ['fire_imp', 'lava_lizard'], weight: 16, spacing: 28, leashRadius: 132, rewardBudget: 1.25, ambushEligible: true },
      { id: 'duo-summoner', members: ['slug_magma', 'cultist_cinder'], weight: 12, spacing: 28, leashRadius: 136, rewardBudget: 1.3, containsSummoner: true },
      { id: 'duo-mixed', members: ['fire_imp', 'slug_magma'], weight: 9, spacing: 28, leashRadius: 134, rewardBudget: 1.25, ambushEligible: true },
      { id: 'trio', members: ['fire_imp', 'lava_lizard', 'slug_magma'], weight: 5, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ],
    offlineRepresentative: { encounterPackId: 'solo-c', secondaryEncounterPackId: 'solo-d' },
    hazards: [
      {
        id: 'hazard.lavacave.flame_vent', regionId: 'lavacave', category: 'damageTrap',
        trigger: { mode: 'enter', shape: 'cone', length: 36, angleDeg: 54, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 78, revealRadius: 50 }, lifecycle: { revealTicks: 8, warningTicks: 18, activeTicks: 11, cooldownTicks: 440 },
        outcome: { type: 'applyEffects', pulses: 3, intervalTicks: 5, effects: [
          { type: 'damage', damageTypeId: 'fire', formulaId: 'combat.hazard_damage_v1', params: { maxHpCoefficient: 0.03 }, canCrit: false, canDodge: false, defenseMode: 'resistanceOnly' },
          { type: 'applyStatus', statusId: 'lavacave.burning', stacks: 1, firstPulseOnly: true }
        ] },
        placement: { source: 'hazardAnchor', count: [4, 7], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 96, requireWalkableEscape: true },
        presentation: { nameKey: 'hazard.lavacave.flame_vent.name', descKey: 'hazard.lavacave.flame_vent.desc', warningKey: 'hazard.lavacave.flame_vent.warning', hitKey: 'hazard.lavacave.flame_vent.hit' },
        visual: { glyph: 'flame', palette: { element: '#ffb247', clue: '#6e352a' } }
      },
      {
        id: 'hazard.lavacave.cinder_ambush', regionId: 'lavacave', category: 'ambushTrigger',
        trigger: { mode: 'enter', shape: 'circle', radius: 30, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 84, revealRadius: 52 }, lifecycle: { revealTicks: 6, warningTicks: 18, activeTicks: 1, cooldownTicks: 3600, ambushLock: true },
        outcome: { type: 'startEncounter', encounterPackIds: ['lavacave.solo-a', 'lavacave.solo-b', 'lavacave.solo-c', 'lavacave.duo', 'lavacave.duo-mixed'] },
        placement: { source: 'threatTerritory', count: [1, 3], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 96, requireWalkableEscape: true, maxPerTerritory: 1 },
        presentation: { nameKey: 'hazard.lavacave.cinder_ambush.name', descKey: 'hazard.lavacave.cinder_ambush.desc', warningKey: 'hazard.lavacave.cinder_ambush.warning', hitKey: 'hazard.lavacave.cinder_ambush.hit', ambushKey: 'hazard.lavacave.cinder_ambush.ambush' },
        visual: { glyph: 'ambush', palette: { element: '#f27a38', clue: '#6b3f36' } }
      }
    ],
    locales: {
      'zh-CN': {
        'monster.slug_magma.name': '熔核岩蛞蝓', 'monster.slug_magma.desc': '覆有黑色岩壳的迟缓熔核兽。', 'combat.lore.slug_magma': '橙黄裂隙随着体内热流缓慢明灭。', 'combat.ability.slug_magma_basic.name': '熔岩撞击', 'combat.ability.slug_magma_cinder_spit.name': '烬火喷吐', 'combat.trait.slug_magma.name': '熔核岩壳',
        'monster.cultist_cinder.name': '烬火教徒', 'monster.cultist_cinder.desc': '在废弃祭坛升起余烬图腾的施法者。', 'combat.lore.cultist_cinder': '红铜护符里封存着一粒永燃火种。', 'combat.ability.cultist_cinder_basic.name': '焦杖火星', 'combat.ability.cultist_cinder_raise_ember_totem.name': '升起余烬图腾', 'combat.trait.cultist_cinder.name': '烬火仪式',
        'monster.summon.ember_totem.name': '余烬图腾', 'monster.summon.ember_totem.desc': '周期释放热浪的黑曜石装置。', 'combat.lore.summon.ember_totem': '三道橙红裂纹组成了简短的燃烧祷文。', 'combat.ability.summon.ember_totem_basic.name': '余火弹', 'combat.ability.summon_ember_totem_heat_pulse.name': '热浪脉冲', 'combat.trait.summon.ember_totem.name': '固定图腾',
        'hazard.lavacave.flame_vent.name': '地火喷口', 'hazard.lavacave.flame_vent.desc': '黑曜石裂缝会向固定方向喷发。', 'hazard.lavacave.flame_vent.warning': '裂缝中的火光正在急剧变亮。', 'hazard.lavacave.flame_vent.hit': '地火喷口灼烧了队伍。',
        'hazard.lavacave.cinder_ambush.name': '烬幕突袭', 'hazard.lavacave.cinder_ambush.desc': '逆流火星与黑烟缝暴露了伏兵。', 'hazard.lavacave.cinder_ambush.warning': '熔岩光被短暂遮断。', 'hazard.lavacave.cinder_ambush.hit': '烬幕后的袭击者已经现身。', 'hazard.lavacave.cinder_ambush.ambush': '伏兵从岩柱后的烬幕中冲出。'
      },
      en: {
        'monster.slug_magma.name': 'Magma Slug', 'monster.slug_magma.desc': 'A slow core beast covered in black volcanic shell.', 'combat.lore.slug_magma': 'Orange cracks pulse with the heat moving inside it.', 'combat.ability.slug_magma_basic.name': 'Magma Slam', 'combat.ability.slug_magma_cinder_spit.name': 'Cinder Spit', 'combat.trait.slug_magma.name': 'Magma Shell',
        'monster.cultist_cinder.name': 'Cinder Cultist', 'monster.cultist_cinder.desc': 'A caster that raises ember totems at ruined altars.', 'combat.lore.cultist_cinder': 'Its copper charm holds a single undying coal.', 'combat.ability.cultist_cinder_basic.name': 'Charred Spark', 'combat.ability.cultist_cinder_raise_ember_totem.name': 'Raise Ember Totem', 'combat.trait.cultist_cinder.name': 'Cinder Rite',
        'monster.summon.ember_totem.name': 'Ember Totem', 'monster.summon.ember_totem.desc': 'An obsidian device that releases waves of heat.', 'combat.lore.summon.ember_totem': 'Three orange fissures form a short prayer to flame.', 'combat.ability.summon.ember_totem_basic.name': 'Ember Bolt', 'combat.ability.summon_ember_totem_heat_pulse.name': 'Heat Pulse', 'combat.trait.summon.ember_totem.name': 'Fixed Totem',
        'hazard.lavacave.flame_vent.name': 'Flame Vent', 'hazard.lavacave.flame_vent.desc': 'An obsidian fissure erupts in one fixed direction.', 'hazard.lavacave.flame_vent.warning': 'The glow inside the fissure rapidly intensifies.', 'hazard.lavacave.flame_vent.hit': 'The flame vent scorched the party.',
        'hazard.lavacave.cinder_ambush.name': 'Cinder Ambush', 'hazard.lavacave.cinder_ambush.desc': 'Reversing sparks and a seam of smoke betray attackers.', 'hazard.lavacave.cinder_ambush.warning': 'The glow from the lava is briefly obscured.', 'hazard.lavacave.cinder_ambush.hit': 'The attackers behind the cinders are exposed.', 'hazard.lavacave.cinder_ambush.ambush': 'Enemies charge from behind the cinder veil.'
      }
    },
    boss: {
      id: 'flame_demon', mods: { hp: 1.05, atk: 1.12 }, damageType: 'fire', scale: 1.25,
      abilityIds: ['flame_demon.infernal_slash', 'flame_demon.fire_shield_action', 'flame_demon.eruption_chain'],
      abilities: [
        {
          id: 'flame_demon.infernal_slash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 14, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 42, radius: 38, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 38, expectedDamagePct: 0.2 },
          effects: [D('fire', 1.78), { type: 'applyStatus', statusId: 'lavacave.burning' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.infernal_slash.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'flame_demon.fire_shield_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 12, cooldownTicks: 300, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.2, durationTicks: 120, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'flame_demon.fire_shield', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 116, role: 'defensive' }, presentation: { nameKey: 'combat.ability.fire_shield.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'flame_demon.eruption_chain', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 34, animationLockTicks: 15, cooldownTicks: 220, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 70, radius: 48, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 48, expectedDamagePct: 0.23 },
          effects: [{ type: 'repeat', times: 3, effects: [D('fire', 0.68)] }, { type: 'applyStatus', statusId: 'lavacave.burning' }],
          aiHints: { priority: 88 }, presentation: { nameKey: 'combat.ability.eruption_chain.name', icon: 'icon_skill_whirl' }
        }
      ],
      traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.18 }],
      phaseStatusId: 'flame_demon.phase2'
    }
  }));
})();
