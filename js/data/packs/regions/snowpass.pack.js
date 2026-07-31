(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  Game.content.registerPack(Game.contentAuthoring.factory('region.pack')({
    regionId: 'snowpass', factionId: 'frost_clans',
    sourceFile: 'js/data/packs/regions/snowpass.pack.js',
    statuses: [
      {
        id: 'snowpass.chilled', stacking: 'stack', maxStacks: 4, durationTicks: 140,
        modifiers: [
          { stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.9 },
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 0.94 }
        ],
        presentation: { nameKey: 'combat.status.chilled.name', icon: 'icon_skill_swift' }
      },
      {
        id: 'snowpass.exposed', stacking: 'refresh', durationTicks: 100,
        modifiers: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 0.82 }],
        presentation: { nameKey: 'combat.status.exposed.name', icon: 'icon_skill_strike' }
      },
      {
        id: 'frost_giant.glacial_armor', stacking: 'refresh', durationTicks: 140,
        modifiers: [
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.4 },
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.3 }
        ],
        presentation: { nameKey: 'combat.status.glacial_armor.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'frost_giant.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.2 },
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.22 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'ice_wolf', mods: { hp: 1, atk: 1.1, spd: 2.5 }, damageType: 'frost',
        abilityIds: ['ice_wolf.frost_fang'],
        abilities: [{
          id: 'ice_wolf.frost_fang', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 8, animationLockTicks: 10, cooldownTicks: 120, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 34 },
          effects: [D('frost', 1.12), { type: 'applyStatus', statusId: 'snowpass.chilled' }],
          aiHints: { priority: 64 }, presentation: { nameKey: 'combat.ability.frost_fang.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'moveSpeed', phase: 'multiply', operation: 'multiply', value: 1.12 }]
      },
      {
        id: 'yeti_small', mods: { hp: 1.25, atk: 1, spd: -1.5 }, damageType: 'blunt',
        abilityIds: ['yeti_small.charged_smash'],
        abilities: [{
          id: 'yeti_small.charged_smash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 13, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 30 },
          telegraph: { shape: 'single', radius: 20, expectedDamagePct: 0.18 },
          effects: [D('blunt', 1.55), { type: 'applyStatus', statusId: 'snowpass.exposed' }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.yeti_smash.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'maxHp', phase: 'multiply', operation: 'multiply', value: 1.08 }]
      },
      {
        id: 'goat_frosthorn', mods: { hp: 1.08, atk: 1.05, def: 1.1, spd: 2 }, damageType: 'blunt',
        abilityIds: ['goat_frosthorn.ridge_charge'],
        abilities: [{
          id: 'goat_frosthorn.ridge_charge', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 14, animationLockTicks: 11, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 46 },
          effects: [{ type: 'movement', distance: 20 }, D('blunt', 1.05), { type: 'knockback', distance: 14 }, { type: 'applyStatus', statusId: 'snowpass.chilled' }],
          aiHints: { priority: 70 },
          presentation: { nameKey: 'combat.ability.goat_frosthorn_ridge_charge.name', icon: 'icon_skill_strike' }
        }]
      },
      {
        id: 'gnoll_rime_trapper', mods: { hp: 0.96, atk: 1.02, spd: 1 }, damageType: 'piercing', range: 60,
        abilityIds: ['gnoll_rime_trapper.set_rimejaw'],
        abilities: [{
          id: 'gnoll_rime_trapper.set_rimejaw', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 20, animationLockTicks: 10, cooldownTicks: 260, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 60 },
          effects: [{ type: 'summon', archetypeId: 'summon.rimejaw_trap', count: 1, maxActive: 1 }],
          aiHints: { priority: 94 },
          presentation: { nameKey: 'combat.ability.gnoll_rime_trapper_set_rimejaw.name', icon: 'icon_skill_guard' }
        }]
      }
    ],
    summons: [{
      id: 'summon.rimejaw_trap', mods: { hp: 0.4, atk: 0.5, moveSpeed: 0, range: 26 },
      movementTypes: [], range: 26, damageType: 'frost', basicCoefficient: 0.18,
      abilityIds: ['summon.rimejaw_trap.snap'],
      abilities: [{
        id: 'summon.rimejaw_trap.snap', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 12, animationLockTicks: 8, cooldownTicks: 80, queueable: true, interruptible: true },
        target: { relation: 'hostile', shape: 'circle', range: 26, radius: 20, maxTargets: 1 },
        telegraph: { shape: 'circle', radius: 20, expectedDamagePct: 0.07 },
        effects: [D('frost', 0.52), { type: 'applyStatus', statusId: 'snowpass.exposed' }, { type: 'applyStatus', statusId: 'snowpass.chilled' }, { type: 'selfDestruct' }],
        aiHints: { priority: 120 },
        presentation: { nameKey: 'combat.ability.summon_rimejaw_trap_snap.name', icon: 'icon_skill_guard' }
      }]
    }],
    guardianBaseId: 'yeti_small',
    encounterRecipes: [
      { id: 'solo-a', members: ['ice_wolf'], weight: 18, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-b', members: ['yeti_small'], weight: 17, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-c', members: ['goat_frosthorn'], weight: 13, spacing: 22, leashRadius: 124, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-d', members: ['gnoll_rime_trapper'], weight: 10, spacing: 22, leashRadius: 126, rewardBudget: 1.05, containsSummoner: true },
      { id: 'duo', members: ['ice_wolf', 'yeti_small'], weight: 16, spacing: 28, leashRadius: 132, rewardBudget: 1.25, ambushEligible: true },
      { id: 'duo-summoner', members: ['goat_frosthorn', 'gnoll_rime_trapper'], weight: 12, spacing: 28, leashRadius: 136, rewardBudget: 1.3, containsSummoner: true },
      { id: 'duo-mixed', members: ['ice_wolf', 'goat_frosthorn'], weight: 9, spacing: 28, leashRadius: 134, rewardBudget: 1.25, ambushEligible: true },
      { id: 'trio', members: ['ice_wolf', 'yeti_small', 'goat_frosthorn'], weight: 5, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ],
    offlineRepresentative: { encounterPackId: 'solo-c', secondaryEncounterPackId: 'solo-d' },
    hazards: [
      {
        id: 'hazard.snowpass.icicle_fall', regionId: 'snowpass', category: 'damageTrap',
        trigger: { mode: 'enter', shape: 'rect', width: 28, height: 58, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 112, revealRadius: 74, revealChance: 0.25 }, lifecycle: { revealTicks: 8, warningTicks: 34, activeTicks: 12, cooldownTicks: 680 },
        outcome: { type: 'applyEffects', pulses: 1, effects: [
          { type: 'damage', damageTypeId: 'frost', formulaId: 'combat.hazard_damage_v1', params: { maxHpCoefficient: 0.07 }, canCrit: false, canDodge: false, defenseMode: 'resistanceOnly' },
          { type: 'applyStatus', statusId: 'snowpass.chilled', stacks: 1, firstPulseOnly: true }
        ] },
        placement: { source: 'hazardAnchor', count: [4, 7], minCampDistance: 180, minLandmarkDistance: 52, minSpacing: 100, requireWalkableEscape: true },
        presentation: { nameKey: 'hazard.snowpass.icicle_fall.name', descKey: 'hazard.snowpass.icicle_fall.desc', warningKey: 'hazard.snowpass.icicle_fall.warning', hitKey: 'hazard.snowpass.icicle_fall.hit' },
        visual: { glyph: 'icicle', palette: { element: '#c4f0f5', clue: '#738b9d' } }
      },
      {
        id: 'hazard.snowpass.whiteout_ambush', regionId: 'snowpass', category: 'ambushTrigger',
        trigger: { mode: 'enter', shape: 'circle', radius: 42, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 120, revealRadius: 78, revealChance: 0.25 }, lifecycle: { revealTicks: 6, warningTicks: 28, activeTicks: 1, cooldownTicks: 3600, ambushLock: true },
        outcome: { type: 'startEncounter', encounterPackIds: ['snowpass.solo-a', 'snowpass.solo-b', 'snowpass.solo-c', 'snowpass.duo', 'snowpass.duo-mixed'] },
        placement: { source: 'threatTerritory', count: [1, 3], minCampDistance: 180, minLandmarkDistance: 52, minSpacing: 100, requireWalkableEscape: true, maxPerTerritory: 1 },
        presentation: { nameKey: 'hazard.snowpass.whiteout_ambush.name', descKey: 'hazard.snowpass.whiteout_ambush.desc', warningKey: 'hazard.snowpass.whiteout_ambush.warning', hitKey: 'hazard.snowpass.whiteout_ambush.hit', ambushKey: 'hazard.snowpass.whiteout_ambush.ambush' },
        visual: { glyph: 'ambush', palette: { element: '#e7f4f3', clue: '#7790a0' } }
      }
    ],
    locales: {
      'zh-CN': {
        'monster.goat_frosthorn.name': '霜角岩羊', 'monster.goat_frosthorn.desc': '用盘角撞开积雪山道的岩羊。', 'combat.lore.goat_frosthorn': '冰蓝盘角记录着无数次山脊冲锋。', 'combat.ability.goat_frosthorn_basic.name': '霜蹄顶撞', 'combat.ability.goat_frosthorn_ridge_charge.name': '山脊冲锋', 'combat.trait.goat_frosthorn.name': '稳固蹄步',
        'monster.gnoll_rime_trapper.name': '霜原豺狼人猎手', 'monster.gnoll_rime_trapper.desc': '携带骨弩和冰霜夹具的雪原猎手。', 'combat.lore.gnoll_rime_trapper': '它能从风吹雪中看出最新的脚印。', 'combat.ability.gnoll_rime_trapper_basic.name': '骨弩射击', 'combat.ability.gnoll_rime_trapper_set_rimejaw.name': '布设霜牙夹', 'combat.trait.gnoll_rime_trapper.name': '雪猎经验',
        'monster.summon.rimejaw_trap.name': '霜牙夹', 'monster.summon.rimejaw_trap.desc': '带有冰霜符纹的单次咬合装置。', 'combat.lore.summon.rimejaw_trap': '骨齿内侧凝着永不融化的霜。', 'combat.ability.summon.rimejaw_trap_basic.name': '霜齿轻咬', 'combat.ability.summon_rimejaw_trap_snap.name': '霜牙咬合', 'combat.trait.summon.rimejaw_trap.name': '固定装置',
        'hazard.snowpass.icicle_fall.name': '悬冰坠刺', 'hazard.snowpass.icicle_fall.desc': '崖壁上的冰柱会沿狭长区域坠落。', 'hazard.snowpass.icicle_fall.warning': '细雪正从头顶簌簌落下。', 'hazard.snowpass.icicle_fall.hit': '坠落冰刺击中了队伍。',
        'hazard.snowpass.whiteout_ambush.name': '白障袭猎', 'hazard.snowpass.whiteout_ambush.desc': '新脚印与横扫雪粉暴露了猎手。', 'hazard.snowpass.whiteout_ambush.warning': '上风侧掠过短促黑影。', 'hazard.snowpass.whiteout_ambush.hit': '雪障中的袭击者已经现身。', 'hazard.snowpass.whiteout_ambush.ambush': '猎手从白障中扑出。'
      },
      en: {
        'monster.goat_frosthorn.name': 'Frosthorn Ibex', 'monster.goat_frosthorn.desc': 'An ibex that clears snowy paths with its curled horns.', 'combat.lore.goat_frosthorn': 'Its blue horns record countless ridge charges.', 'combat.ability.goat_frosthorn_basic.name': 'Frost Hoof', 'combat.ability.goat_frosthorn_ridge_charge.name': 'Ridge Charge', 'combat.trait.goat_frosthorn.name': 'Sure Footing',
        'monster.gnoll_rime_trapper.name': 'Rime Gnoll Trapper', 'monster.gnoll_rime_trapper.desc': 'A snow hunter carrying a bone crossbow and frost traps.', 'combat.lore.gnoll_rime_trapper': 'It can read fresh tracks through blowing snow.', 'combat.ability.gnoll_rime_trapper_basic.name': 'Bone Bolt', 'combat.ability.gnoll_rime_trapper_set_rimejaw.name': 'Set Rimejaw', 'combat.trait.gnoll_rime_trapper.name': 'Snowcraft',
        'monster.summon.rimejaw_trap.name': 'Rimejaw Trap', 'monster.summon.rimejaw_trap.desc': 'A single-use jaw trap marked with frost runes.', 'combat.lore.summon.rimejaw_trap': 'Unmelting frost clings to the inner bone teeth.', 'combat.ability.summon.rimejaw_trap_basic.name': 'Frost Nip', 'combat.ability.summon_rimejaw_trap_snap.name': 'Rimejaw Snap', 'combat.trait.summon.rimejaw_trap.name': 'Fixed Device',
        'hazard.snowpass.icicle_fall.name': 'Falling Icicles', 'hazard.snowpass.icicle_fall.desc': 'Cliff icicles fall across a narrow strip of ground.', 'hazard.snowpass.icicle_fall.warning': 'Fine snow sifts down from overhead.', 'hazard.snowpass.icicle_fall.hit': 'Falling icicles struck the party.',
        'hazard.snowpass.whiteout_ambush.name': 'Whiteout Ambush', 'hazard.snowpass.whiteout_ambush.desc': 'Fresh tracks and sweeping powder betray the hunters.', 'hazard.snowpass.whiteout_ambush.warning': 'A short shadow crosses the upwind side.', 'hazard.snowpass.whiteout_ambush.hit': 'The attackers in the whiteout are exposed.', 'hazard.snowpass.whiteout_ambush.ambush': 'Hunters charge through the whiteout.'
      }
    },
    boss: {
      id: 'frost_giant', mods: { hp: 1.08, atk: 1.05, spd: -1.5 }, damageType: 'blunt', scale: 1.35,
      abilityIds: ['frost_giant.ice_lance', 'frost_giant.avalanche', 'frost_giant.glacial_armor_action'],
      abilities: [
        {
          id: 'frost_giant.ice_lance', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 14, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'line', range: 82, radius: 20, maxTargets: 4 },
          telegraph: { shape: 'line', radius: 20, expectedDamagePct: 0.2 },
          effects: [D('frost', 1.76), { type: 'applyStatus', statusId: 'snowpass.chilled' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.ice_lance.name', icon: 'icon_skill_fire' }
        },
        {
          id: 'frost_giant.avalanche', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 40, animationLockTicks: 15, cooldownTicks: 220, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 74, radius: 54, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 54, expectedDamagePct: 0.24 },
          effects: [D('frost', 2.0), { type: 'applyStatus', statusId: 'snowpass.exposed' }],
          aiHints: { priority: 88 }, presentation: { nameKey: 'combat.ability.avalanche.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'frost_giant.glacial_armor_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 12, cooldownTicks: 320, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.2, durationTicks: 140, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'frost_giant.glacial_armor', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 116, role: 'defensive' }, presentation: { nameKey: 'combat.ability.glacial_armor.name', icon: 'icon_skill_guard' }
        }
      ],
      traitModifiers: [{ stat: 'tenacity', phase: 'otherFlat', operation: 'add', value: 0.7 }],
      phaseStatusId: 'frost_giant.phase2'
    }
  }));
})();
