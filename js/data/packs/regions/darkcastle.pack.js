(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  Game.content.registerPack(Game.contentAuthoring.factory('region.pack')({
    regionId: 'darkcastle', factionId: 'demon_army',
    sourceFile: 'js/data/packs/regions/darkcastle.pack.js',
    statuses: [
      {
        id: 'darkcastle.cursed', stacking: 'refresh', durationTicks: 150,
        modifiers: [
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 0.88 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 0.88 },
          { stat: 'healingPower', phase: 'status', operation: 'multiply', value: 0.75 }
        ],
        presentation: { nameKey: 'combat.status.cursed.name', icon: 'icon_skill_poison' }
      },
      {
        id: 'darkcastle.petrified', stacking: 'refresh', durationTicks: 26,
        modifiers: [
          { stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.25 },
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 0.7 }
        ],
        presentation: { nameKey: 'combat.status.petrified.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'darkcastle.shackled', stacking: 'refresh', durationTicks: 40,
        modifiers: [{ stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.25 }],
        presentation: { nameKey: 'combat.status.darkcastle_shackled.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'demon_lord.bulwark', stacking: 'refresh', durationTicks: 140,
        modifiers: [
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.42 },
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.42 }
        ],
        presentation: { nameKey: 'combat.status.demon_bulwark.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'demon_lord.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.26 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 1.26 },
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.2 },
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.2 }
        ],
        presentation: { nameKey: 'combat.status.tyrant_phase.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'demon_soldier', mods: { hp: 1.1, atk: 1.1 }, damageType: 'slashing',
        abilityIds: ['demon_soldier.cursed_cleave'],
        abilities: [{
          id: 'demon_soldier.cursed_cleave', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 12, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 36, radius: 34, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 34, expectedDamagePct: 0.15 },
          effects: [D('slashing', 1.3), { type: 'applyStatus', statusId: 'darkcastle.cursed' }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.cursed_cleave.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'physicalPower', phase: 'multiply', operation: 'multiply', value: 1.06 }]
      },
      {
        id: 'gargoyle', mods: { hp: 1.2, atk: 1, def: 1.6 }, movementTypes: ['flying'],
        damageType: 'blunt', abilityIds: ['gargoyle.petrifying_gaze'],
        abilities: [{
          id: 'gargoyle.petrifying_gaze', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 26, animationLockTicks: 11, cooldownTicks: 170, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 58 },
          effects: [D('necrotic', 0.9), { type: 'applyStatus', statusId: 'darkcastle.petrified' }],
          aiHints: { priority: 70 }, presentation: { nameKey: 'combat.ability.petrifying_gaze.name', icon: 'icon_skill_guard' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.22 }]
      },
      {
        id: 'hound_abyssal', mods: { hp: 1.05, atk: 1.15, def: 1.1, spd: 2.5 }, damageType: 'necrotic',
        abilityIds: ['hound_abyssal.void_pounce'],
        abilities: [{
          id: 'hound_abyssal.void_pounce', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 10, animationLockTicks: 11, cooldownTicks: 120, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 46 },
          effects: [{ type: 'movement', distance: 18 }, D('necrotic', 1.1), { type: 'applyStatus', statusId: 'darkcastle.cursed' }],
          aiHints: { priority: 72 },
          presentation: { nameKey: 'combat.ability.hound_abyssal_void_pounce.name', icon: 'icon_skill_poison' }
        }]
      },
      {
        id: 'gaoler_demon', mods: { hp: 1.12, atk: 1.02, def: 1.2, spd: -1 }, damageType: 'necrotic', range: 64,
        abilityIds: ['gaoler_demon.lock_soul_cage'],
        abilities: [{
          id: 'gaoler_demon.lock_soul_cage', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 11, cooldownTicks: 300, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 64 },
          effects: [{ type: 'summon', archetypeId: 'summon.soul_cage', count: 1, maxActive: 1 }],
          aiHints: { priority: 100 },
          presentation: { nameKey: 'combat.ability.gaoler_demon_lock_soul_cage.name', icon: 'icon_skill_poison' }
        }]
      }
    ],
    summons: [{
      id: 'summon.soul_cage', mods: { hp: 0.5, atk: 0.55, moveSpeed: 0, range: 34 },
      movementTypes: [], range: 34, damageType: 'necrotic', basicCoefficient: 0.2,
      abilityIds: ['summon.soul_cage.binding_pulse'],
      abilities: [{
        id: 'summon.soul_cage.binding_pulse', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 14, animationLockTicks: 8, cooldownTicks: 100, queueable: true, interruptible: true },
        target: { relation: 'hostile', shape: 'circle', range: 34, radius: 34, maxTargets: 4 },
        telegraph: { shape: 'circle', radius: 34, expectedDamagePct: 0.08 },
        effects: [D('necrotic', 0.5), { type: 'applyStatus', statusId: 'darkcastle.shackled' }],
        aiHints: { priority: 118 },
        presentation: { nameKey: 'combat.ability.summon_soul_cage_binding_pulse.name', icon: 'icon_skill_poison' }
      }]
    }],
    guardianBaseId: 'demon_soldier',
    encounterRecipes: [
      { id: 'solo-a', members: ['demon_soldier'], weight: 18, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-b', members: ['gargoyle'], weight: 17, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-c', members: ['hound_abyssal'], weight: 13, spacing: 22, leashRadius: 124, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-d', members: ['gaoler_demon'], weight: 10, spacing: 22, leashRadius: 126, rewardBudget: 1.05, containsSummoner: true },
      { id: 'duo', members: ['demon_soldier', 'gargoyle'], weight: 16, spacing: 28, leashRadius: 132, rewardBudget: 1.25, ambushEligible: true },
      { id: 'duo-summoner', members: ['hound_abyssal', 'gaoler_demon'], weight: 12, spacing: 28, leashRadius: 136, rewardBudget: 1.3, containsSummoner: true },
      { id: 'duo-mixed', members: ['demon_soldier', 'hound_abyssal'], weight: 9, spacing: 28, leashRadius: 134, rewardBudget: 1.25, ambushEligible: true },
      { id: 'trio', members: ['demon_soldier', 'gargoyle', 'hound_abyssal'], weight: 5, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ],
    offlineRepresentative: { encounterPackId: 'solo-c', secondaryEncounterPackId: 'solo-d' },
    hazards: [
      {
        id: 'hazard.darkcastle.wall_lances', regionId: 'darkcastle', category: 'damageTrap',
        trigger: { mode: 'enter', shape: 'rect', width: 52, height: 16, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 82, revealRadius: 52 }, lifecycle: { revealTicks: 8, warningTicks: 16, activeTicks: 4, cooldownTicks: 520 },
        outcome: { type: 'applyEffects', pulses: 1, effects: [
          { type: 'damage', damageTypeId: 'piercing', formulaId: 'combat.hazard_damage_v1', params: { maxHpCoefficient: 0.1 }, canCrit: false, canDodge: false, defenseMode: 'resistanceOnly' },
          { type: 'applyStatus', statusId: 'darkcastle.cursed', stacks: 1, firstPulseOnly: true }
        ] },
        placement: { source: 'hazardAnchor', count: [4, 7], minCampDistance: 180, minLandmarkDistance: 56, minSpacing: 108, requireWalkableEscape: true },
        presentation: { nameKey: 'hazard.darkcastle.wall_lances.name', descKey: 'hazard.darkcastle.wall_lances.desc', warningKey: 'hazard.darkcastle.wall_lances.warning', hitKey: 'hazard.darkcastle.wall_lances.hit' },
        visual: { glyph: 'lances', palette: { element: '#d8c6bf', clue: '#5b4352' } }
      },
      {
        id: 'hazard.darkcastle.gate_ambush', regionId: 'darkcastle', category: 'ambushTrigger',
        trigger: { mode: 'enter', shape: 'circle', radius: 30, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 88, revealRadius: 54 }, lifecycle: { revealTicks: 6, warningTicks: 18, activeTicks: 1, cooldownTicks: 3600, ambushLock: true },
        outcome: { type: 'startEncounter', encounterPackIds: ['darkcastle.solo-a', 'darkcastle.solo-b', 'darkcastle.solo-c', 'darkcastle.duo', 'darkcastle.duo-mixed'] },
        placement: { source: 'threatTerritory', count: [1, 3], minCampDistance: 180, minLandmarkDistance: 56, minSpacing: 108, requireWalkableEscape: true, maxPerTerritory: 1 },
        presentation: { nameKey: 'hazard.darkcastle.gate_ambush.name', descKey: 'hazard.darkcastle.gate_ambush.desc', warningKey: 'hazard.darkcastle.gate_ambush.warning', hitKey: 'hazard.darkcastle.gate_ambush.hit', ambushKey: 'hazard.darkcastle.gate_ambush.ambush' },
        visual: { glyph: 'ambush', palette: { element: '#b77ad9', clue: '#583850' } }
      }
    ],
    locales: {
      'zh-CN': {
        'monster.hound_abyssal.name': '深渊魔犬', 'monster.hound_abyssal.desc': '披覆黑紫重甲的高速魔犬。', 'combat.lore.hound_abyssal': '暗红裂隙像呼吸一样在装甲下明灭。', 'combat.ability.hound_abyssal_basic.name': '深渊利爪', 'combat.ability.hound_abyssal_void_pounce.name': '虚空扑袭', 'combat.trait.hound_abyssal.name': '深渊猎性',
        'monster.gaoler_demon.name': '魔狱看守', 'monster.gaoler_demon.desc': '以锁链钩杖部署囚魂笼的重甲狱卒。', 'combat.lore.gaoler_demon': '它的每条锁链都刻着一位囚徒的编号。', 'combat.ability.gaoler_demon_basic.name': '钩杖抽击', 'combat.ability.gaoler_demon_lock_soul_cage.name': '锁下囚魂笼', 'combat.trait.gaoler_demon.name': '魔狱戒律',
        'monster.summon.soul_cage.name': '囚魂笼', 'monster.summon.soul_cage.desc': '周期释放拘束魂光的黑铁法器。', 'combat.lore.summon.soul_cage': '骨白符石在每次脉冲前依次转亮。', 'combat.ability.summon.soul_cage_basic.name': '魂光点射', 'combat.ability.summon_soul_cage_binding_pulse.name': '拘魂脉冲', 'combat.trait.summon.soul_cage.name': '固定魂器',
        'combat.status.darkcastle_shackled.name': '魂链拘束',
        'hazard.darkcastle.wall_lances.name': '穿墙魔枪', 'hazard.darkcastle.wall_lances.desc': '枪孔与链轮会驱动一排穿墙长枪。', 'hazard.darkcastle.wall_lances.warning': '墙内链轮开始高速转动。', 'hazard.darkcastle.wall_lances.hit': '穿墙魔枪刺中了队伍。',
        'hazard.darkcastle.gate_ambush.name': '闸门合围', 'hazard.darkcastle.gate_ambush.desc': '轻摆锁链与门缝紫光暴露了合围。', 'hazard.darkcastle.gate_ambush.warning': '前后门廊同时传来金属声。', 'hazard.darkcastle.gate_ambush.hit': '闸门后的敌人已经现身。', 'hazard.darkcastle.gate_ambush.ambush': '魔王城守军从前后门廊合围。'
      },
      en: {
        'monster.hound_abyssal.name': 'Abyssal Hound', 'monster.hound_abyssal.desc': 'A swift war hound clad in heavy black-violet armor.', 'combat.lore.hound_abyssal': 'Dark red fissures breathe beneath its armor.', 'combat.ability.hound_abyssal_basic.name': 'Abyssal Claw', 'combat.ability.hound_abyssal_void_pounce.name': 'Void Pounce', 'combat.trait.hound_abyssal.name': 'Abyssal Hunter',
        'monster.gaoler_demon.name': 'Demon Gaoler', 'monster.gaoler_demon.desc': 'A heavy jailer that deploys soul cages with a hooked staff.', 'combat.lore.gaoler_demon': 'Every chain bears the number of a former prisoner.', 'combat.ability.gaoler_demon_basic.name': 'Hooked Lash', 'combat.ability.gaoler_demon_lock_soul_cage.name': 'Lock Soul Cage', 'combat.trait.gaoler_demon.name': 'Infernal Discipline',
        'monster.summon.soul_cage.name': 'Soul Cage', 'monster.summon.soul_cage.desc': 'A black iron focus that releases binding soul pulses.', 'combat.lore.summon.soul_cage': 'Bone-white runes brighten in sequence before each pulse.', 'combat.ability.summon.soul_cage_basic.name': 'Soul Bolt', 'combat.ability.summon_soul_cage_binding_pulse.name': 'Binding Pulse', 'combat.trait.summon.soul_cage.name': 'Fixed Soul Focus',
        'combat.status.darkcastle_shackled.name': 'Soul Shackled',
        'hazard.darkcastle.wall_lances.name': 'Wall Lances', 'hazard.darkcastle.wall_lances.desc': 'Murder holes and chain wheels drive a row of lances.', 'hazard.darkcastle.wall_lances.warning': 'Chain wheels begin turning inside the wall.', 'hazard.darkcastle.wall_lances.hit': 'The wall lances struck the party.',
        'hazard.darkcastle.gate_ambush.name': 'Gate Ambush', 'hazard.darkcastle.gate_ambush.desc': 'Swaying chains and violet gate light betray the encirclement.', 'hazard.darkcastle.gate_ambush.warning': 'Metal sounds from the corridors ahead and behind.', 'hazard.darkcastle.gate_ambush.hit': 'The enemies behind the gates are exposed.', 'hazard.darkcastle.gate_ambush.ambush': 'Castle guards close in from both gate corridors.'
      }
    },
    boss: {
      id: 'demon_lord', mods: { hp: 1.3, atk: 1.15 }, damageType: 'necrotic', range: 72, scale: 1.35,
      abilityIds: ['demon_lord.abyssal_blade', 'demon_lord.dark_edict', 'demon_lord.bulwark_action'],
      abilities: [
        {
          id: 'demon_lord.abyssal_blade', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 32, animationLockTicks: 15, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 44, radius: 40, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 40, expectedDamagePct: 0.24 },
          effects: [D('necrotic', 2.0), { type: 'applyStatus', statusId: 'darkcastle.cursed' }],
          aiHints: { priority: 84 }, presentation: { nameKey: 'combat.ability.abyssal_blade.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'demon_lord.dark_edict', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 38, animationLockTicks: 15, cooldownTicks: 230, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 76, radius: 56, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 56, expectedDamagePct: 0.27 },
          effects: [
            { type: 'repeat', times: 2, effects: [D('necrotic', 1.05)] },
            { type: 'applyStatus', statusId: 'darkcastle.cursed' }
          ],
          aiHints: { priority: 92 }, presentation: { nameKey: 'combat.ability.dark_edict.name', icon: 'icon_skill_fire' }
        },
        {
          id: 'demon_lord.bulwark_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 12, cooldownTicks: 340, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.28, durationTicks: 140, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'demon_lord.bulwark', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 122, role: 'defensive' }, presentation: { nameKey: 'combat.ability.demon_bulwark.name', icon: 'icon_skill_guard' }
        }
      ],
      traitModifiers: [{ stat: 'tenacity', phase: 'otherFlat', operation: 'add', value: 0.85 }],
      phaseStatusId: 'demon_lord.phase2'
    }
  }));
})();
