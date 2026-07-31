(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  Game.content.registerPack(Game.contentAuthoring.factory('region.pack')({
    regionId: 'forest', factionId: 'forest_guardians',
    sourceFile: 'js/data/packs/regions/forest.pack.js',
    statuses: [
      {
        id: 'forest.poisoned', stacking: 'stack', maxStacks: 4, durationTicks: 160,
        periodicIntervalTicks: 20, periodic: [Object.assign(D('poison', 0.13), { canCrit: false })],
        presentation: { nameKey: 'combat.status.poisoned.name', icon: 'icon_skill_poison' }
      },
      {
        id: 'forest.rooted', stacking: 'refresh', durationTicks: 24,
        modifiers: [{ stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.35 }],
        presentation: { nameKey: 'combat.status.rooted.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'elder_treant.rejuvenation', stacking: 'refresh', durationTicks: 100,
        periodicIntervalTicks: 20, periodic: [{ type: 'heal', coefficient: 0.42, target: { relation: 'self', shape: 'single' } }],
        presentation: { nameKey: 'combat.status.rejuvenation.name', icon: 'icon_skill_heal' }
      },
      {
        id: 'elder_treant.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.3 },
          { stat: 'cooldownRate', phase: 'status', operation: 'multiply', value: 1.2 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'mushroom_toxic', mods: { hp: 1, atk: 0.95, spd: -1.5 }, damageType: 'poison',
        abilityIds: ['mushroom_toxic.poison_cloud'],
        abilities: [{
          id: 'mushroom_toxic.poison_cloud', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 10, cooldownTicks: 170, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 52, radius: 38, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 38, expectedDamagePct: 0.11 },
          effects: [D('poison', 0.72), { type: 'applyStatus', statusId: 'forest.poisoned' }],
          aiHints: { priority: 60 }, presentation: { nameKey: 'combat.ability.poison_cloud.name', icon: 'icon_skill_poison' }
        }],
        traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.15 }]
      },
      {
        id: 'treant_sapling', mods: { hp: 1.2, atk: 1, spd: -2 }, damageType: 'blunt',
        abilityIds: ['treant_sapling.grasping_roots'],
        abilities: [{
          id: 'treant_sapling.grasping_roots', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 11, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 56 },
          effects: [D('blunt', 0.95), { type: 'applyStatus', statusId: 'forest.rooted' }],
          aiHints: { priority: 62 }, presentation: { nameKey: 'combat.ability.grasping_roots.name', icon: 'icon_skill_guard' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.18 }]
      },
      {
        id: 'beetle_mossback', mods: { hp: 1.22, atk: 0.95, def: 1.35, spd: -1 }, damageType: 'blunt',
        abilityIds: ['beetle_mossback.shell_ram'], abilities: [{
          id: 'beetle_mossback.shell_ram', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 10, animationLockTicks: 10, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 34 },
          effects: [D('blunt', 1), { type: 'applyStatus', statusId: 'forest.rooted' }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.beetle_mossback_shell_ram.name', icon: 'icon_skill_guard' }
        }], traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.08 }]
      },
      {
        id: 'shaman_mosscap', mods: { hp: 0.9, atk: 0.9, def: 1.05, spd: -0.5, range: 62 }, range: 62,
        damageType: 'poison', abilityIds: ['shaman_mosscap.plant_spore_pod'], abilities: [{
          id: 'shaman_mosscap.plant_spore_pod', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 10, cooldownTicks: 260, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 62 },
          effects: [{ type: 'summon', archetypeId: 'summon.spore_pod', count: 1, maxActive: 1 }],
          aiHints: { priority: 94 }, presentation: { nameKey: 'combat.ability.shaman_mosscap_plant_spore_pod.name', icon: 'icon_skill_poison' }
        }]
      }
    ],
    summons: [{
      id: 'summon.spore_pod', mods: { hp: 0.42, atk: 0.4, moveSpeed: 0, range: 34 },
      movementTypes: [], range: 34, damageType: 'poison', basicCoefficient: 0.18,
      abilityIds: ['summon.spore_pod.spore_burst'], abilities: [{
        id: 'summon.spore_pod.spore_burst', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 18, animationLockTicks: 8, cooldownTicks: 90, queueable: true, interruptible: true },
        target: { relation: 'hostile', shape: 'circle', range: 34, radius: 34, maxTargets: 4 },
        telegraph: { shape: 'circle', radius: 34, expectedDamagePct: 0.05 },
        effects: [D('poison', 0.42), { type: 'applyStatus', statusId: 'forest.poisoned' }],
        aiHints: { priority: 110 }, presentation: { nameKey: 'combat.ability.summon_spore_pod_spore_burst.name', icon: 'icon_skill_poison' }
      }]
    }],
    guardianBaseId: 'treant_sapling',
    encounterRecipes: [
      { id: 'solo-a', members: ['mushroom_toxic'], weight: 18, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-b', members: ['treant_sapling'], weight: 17, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-c', members: ['beetle_mossback'], weight: 13, spacing: 22, leashRadius: 124, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-d', members: ['shaman_mosscap'], weight: 10, spacing: 22, leashRadius: 126, rewardBudget: 1.05, ambushEligible: true, containsSummoner: true },
      { id: 'duo', members: ['mushroom_toxic', 'treant_sapling'], weight: 16, spacing: 28, leashRadius: 132, rewardBudget: 1.25, ambushEligible: true },
      { id: 'duo-summoner', members: ['beetle_mossback', 'shaman_mosscap'], weight: 12, spacing: 28, leashRadius: 136, rewardBudget: 1.3, ambushEligible: true, containsSummoner: true },
      { id: 'duo-mixed', members: ['mushroom_toxic', 'beetle_mossback'], weight: 9, spacing: 28, leashRadius: 134, rewardBudget: 1.25, ambushEligible: true },
      { id: 'trio', members: ['mushroom_toxic', 'treant_sapling', 'beetle_mossback'], weight: 5, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ],
    offlineRepresentative: { encounterPackId: 'solo-c', secondaryEncounterPackId: 'solo-d' },
    hazards: [
      {
        id: 'hazard.forest.venom_darts', regionId: 'forest', category: 'damageTrap',
        trigger: { mode: 'enter', shape: 'rect', width: 58, height: 24, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 104, revealRadius: 70, revealChance: 0.25 }, lifecycle: { revealTicks: 8, warningTicks: 28, activeTicks: 14, cooldownTicks: 480 },
        outcome: { type: 'applyEffects', pulses: 2, intervalTicks: 6, effects: [
          { type: 'damage', damageTypeId: 'poison', formulaId: 'combat.hazard_damage_v1', params: { maxHpCoefficient: 0.03 }, canCrit: false, canDodge: false, defenseMode: 'resistanceOnly' },
          { type: 'applyStatus', statusId: 'forest.poisoned', stacks: 1, firstPulseOnly: true }
        ] },
        placement: { source: 'hazardAnchor', count: [4, 7], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 96, requireWalkableEscape: true },
        presentation: { nameKey: 'hazard.forest.venom_darts.name', descKey: 'hazard.forest.venom_darts.desc', warningKey: 'hazard.forest.venom_darts.warning', hitKey: 'hazard.forest.venom_darts.hit' },
        visual: { glyph: 'darts', palette: { element: '#b6dd55', clue: '#456638' } }
      },
      {
        id: 'hazard.forest.thicket_ambush', regionId: 'forest', category: 'ambushTrigger',
        trigger: { mode: 'enter', shape: 'circle', radius: 42, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 114, revealRadius: 76, revealChance: 0.25 }, lifecycle: { revealTicks: 6, warningTicks: 24, activeTicks: 1, cooldownTicks: 3600, ambushLock: true },
        outcome: { type: 'startEncounter', encounterPackIds: ['forest.solo-a', 'forest.solo-b', 'forest.solo-c', 'forest.solo-d', 'forest.duo', 'forest.duo-summoner', 'forest.duo-mixed'] },
        placement: { source: 'threatTerritory', count: [1, 3], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 96, requireWalkableEscape: true, maxPerTerritory: 1 },
        presentation: { nameKey: 'hazard.forest.thicket_ambush.name', descKey: 'hazard.forest.thicket_ambush.desc', warningKey: 'hazard.forest.thicket_ambush.warning', hitKey: 'hazard.forest.thicket_ambush.hit', ambushKey: 'hazard.forest.thicket_ambush.ambush' },
        visual: { glyph: 'ambush', palette: { element: '#9ed873', clue: '#315f3c' } }
      }
    ],
    locales: {
      'zh-CN': {
        'monster.beetle_mossback.name': '苔甲巨甲虫', 'monster.beetle_mossback.desc': '覆盖湿苔的重甲林地甲虫。', 'combat.lore.beetle_mossback': '它把古树根须当作自己的巢墙。', 'combat.ability.beetle_mossback_basic.name': '甲角撞击', 'combat.ability.beetle_mossback_shell_ram.name': '苔甲冲撞', 'combat.trait.beetle_mossback.name': '苔壳',
        'monster.shaman_mosscap.name': '苔冠萨满', 'monster.shaman_mosscap.desc': '培育危险孢子囊的菌帽施法者。', 'combat.lore.shaman_mosscap': '它听得懂每一片腐叶下的低语。', 'combat.ability.shaman_mosscap_basic.name': '孢子弹', 'combat.ability.shaman_mosscap_plant_spore_pod.name': '种下孢子囊', 'combat.trait.shaman_mosscap.name': '菌林共生',
        'monster.summon.spore_pod.name': '孢子囊', 'monster.summon.spore_pod.desc': '周期张开的有毒种荚。', 'combat.lore.summon.spore_pod': '根须会在部署后立刻扎入湿土。', 'combat.ability.summon.spore_pod_basic.name': '毒液点射', 'combat.ability.summon_spore_pod_spore_burst.name': '孢子爆裂', 'combat.trait.summon.spore_pod.name': '扎根装置',
        'hazard.forest.venom_darts.name': '毒藤飞刺', 'hazard.forest.venom_darts.desc': '藤墙孔洞会连续射出毒刺。', 'hazard.forest.venom_darts.warning': '藤瘤正对准前方通道。', 'hazard.forest.venom_darts.hit': '毒刺穿过了队伍。',
        'hazard.forest.thicket_ambush.name': '雾丛围猎', 'hazard.forest.thicket_ambush.desc': '雾中灌木隐藏着围猎者。', 'hazard.forest.thicket_ambush.warning': '叶片逆向落下。', 'hazard.forest.thicket_ambush.hit': '围猎者已经现身。', 'hazard.forest.thicket_ambush.ambush': '雾丛中的围猎开始了。'
      },
      en: {
        'monster.beetle_mossback.name': 'Mossback Beetle', 'monster.beetle_mossback.desc': 'A heavily armored beetle coated in wet moss.', 'combat.lore.beetle_mossback': 'It treats the roots of ancient trees as nest walls.', 'combat.ability.beetle_mossback_basic.name': 'Horn Jab', 'combat.ability.beetle_mossback_shell_ram.name': 'Shell Ram', 'combat.trait.beetle_mossback.name': 'Moss Shell',
        'monster.shaman_mosscap.name': 'Moss-Cap Shaman', 'monster.shaman_mosscap.desc': 'A fungal caster that cultivates dangerous spore pods.', 'combat.lore.shaman_mosscap': 'It hears whispers beneath every layer of rotting leaves.', 'combat.ability.shaman_mosscap_basic.name': 'Spore Bolt', 'combat.ability.shaman_mosscap_plant_spore_pod.name': 'Plant Spore Pod', 'combat.trait.shaman_mosscap.name': 'Fungal Symbiosis',
        'monster.summon.spore_pod.name': 'Spore Pod', 'monster.summon.spore_pod.desc': 'A poisonous seed pod that opens in cycles.', 'combat.lore.summon.spore_pod': 'Its roots take hold the moment it touches wet soil.', 'combat.ability.summon.spore_pod_basic.name': 'Venom Spit', 'combat.ability.summon_spore_pod_spore_burst.name': 'Spore Burst', 'combat.trait.summon.spore_pod.name': 'Rooted Device',
        'hazard.forest.venom_darts.name': 'Venom Dart Vines', 'hazard.forest.venom_darts.desc': 'Holes in the vine wall fire paired venom darts.', 'hazard.forest.venom_darts.warning': 'The vine bulbs are taking aim.', 'hazard.forest.venom_darts.hit': 'Venom darts cut through the party.',
        'hazard.forest.thicket_ambush.name': 'Thicket Ambush', 'hazard.forest.thicket_ambush.desc': 'Hunters wait behind brush hardened by the fog.', 'hazard.forest.thicket_ambush.warning': 'Leaves begin falling against the wind.', 'hazard.forest.thicket_ambush.hit': 'The hunters are exposed.', 'hazard.forest.thicket_ambush.ambush': 'The thicket hunt begins.'
      }
    },
    boss: {
      id: 'elder_treant', mods: { hp: 1.08, atk: 1 }, damageType: 'blunt', scale: 1.3,
      abilityIds: ['elder_treant.root_circle', 'elder_treant.branch_sweep', 'elder_treant.rejuvenate'],
      abilities: [
        {
          id: 'elder_treant.root_circle', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 14, cooldownTicks: 170, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 62, radius: 42, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 42, expectedDamagePct: 0.16 },
          effects: [D('blunt', 1.45), { type: 'applyStatus', statusId: 'forest.rooted' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.treant_roots.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'elder_treant.branch_sweep', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 14, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 52, radius: 52, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 52, expectedDamagePct: 0.19 },
          effects: [D('blunt', 1.72), { type: 'knockback', distance: 22 }],
          aiHints: { priority: 76 }, presentation: { nameKey: 'combat.ability.branch_sweep.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'elder_treant.rejuvenate', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 44, animationLockTicks: 12, cooldownTicks: 380, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          telegraph: { shape: 'self', radius: 26, expectedDamagePct: 0 },
          effects: [{ type: 'applyStatus', statusId: 'elder_treant.rejuvenation', target: { relation: 'self', shape: 'single' } }],
          aiHints: { priority: 120, role: 'heal' }, presentation: { nameKey: 'combat.ability.treant_rejuvenate.name', icon: 'icon_skill_heal' }
        }
      ],
      traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.15 }],
      phaseStatusId: 'elder_treant.phase2'
    }
  }));
})();
