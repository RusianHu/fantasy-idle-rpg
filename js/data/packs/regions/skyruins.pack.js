(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  Game.content.registerPack(Game.contentAuthoring.factory('region.pack')({
    regionId: 'skyruins', factionId: 'ruin_guardians',
    sourceFile: 'js/data/packs/regions/skyruins.pack.js',
    statuses: [
      {
        id: 'skyruins.suppressed', stacking: 'refresh', durationTicks: 120,
        modifiers: [
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 0.88 },
          { stat: 'accuracy', phase: 'status', operation: 'multiply', value: 0.9 }
        ],
        presentation: { nameKey: 'combat.status.suppressed.name', icon: 'icon_skill_fire' }
      },
      {
        id: 'skyruins.dazed', stacking: 'refresh', durationTicks: 22,
        modifiers: [{ stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 0.6 }],
        presentation: { nameKey: 'combat.status.dazed.name', icon: 'icon_skill_swift' }
      },
      {
        id: 'ruin_guardian.recalibrated', stacking: 'refresh', durationTicks: 130,
        modifiers: [
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.3 },
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.45 }
        ],
        presentation: { nameKey: 'combat.status.recalibrated.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'ruin_guardian.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.24 },
          { stat: 'castSpeed', phase: 'status', operation: 'multiply', value: 1.28 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 1.18 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'guardian_orb', mods: { hp: 0.95, atk: 1.05, def: 1.5, spd: 1 }, movementTypes: ['flying'],
        damageType: 'arcane', range: 72, abilityIds: ['guardian_orb.suppression_beam'],
        abilities: [{
          id: 'guardian_orb.suppression_beam', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 26, animationLockTicks: 10, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'line', range: 76, radius: 16, maxTargets: 4 },
          telegraph: { shape: 'line', radius: 16, expectedDamagePct: 0.13 },
          effects: [D('arcane', 1.12), { type: 'applyStatus', statusId: 'skyruins.suppressed' }],
          aiHints: { priority: 66 }, presentation: { nameKey: 'combat.ability.suppression_beam.name', icon: 'icon_skill_fire' }
        }],
        traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.18 }]
      },
      {
        id: 'harpy', mods: { hp: 1, atk: 1.15, spd: 3 }, movementTypes: ['flying'],
        damageType: 'slashing', abilityIds: ['harpy.sonic_dive'],
        abilities: [{
          id: 'harpy.sonic_dive', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 14, animationLockTicks: 11, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 54 },
          effects: [D('slashing', 1.28), { type: 'applyStatus', statusId: 'skyruins.dazed' }, { type: 'movement', distance: 24 }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.sonic_dive.name', icon: 'icon_skill_swift' }
        }],
        traitModifiers: [{ stat: 'dodgeChance', phase: 'otherFlat', operation: 'add', value: 0.07 }]
      },
      {
        id: 'manta_aether', mods: { hp: 0.94, atk: 1.1, def: 1.1, spd: 2.5 }, movementTypes: ['flying'],
        damageType: 'arcane', range: 68, abilityIds: ['manta_aether.arc_shear'],
        abilities: [{
          id: 'manta_aether.arc_shear', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 12, animationLockTicks: 10, cooldownTicks: 125, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 68 },
          effects: [D('arcane', 0.94), { type: 'applyStatus', statusId: 'skyruins.suppressed' }],
          aiHints: { priority: 70 },
          presentation: { nameKey: 'combat.ability.manta_aether_arc_shear.name', icon: 'icon_skill_fire' }
        }]
      },
      {
        id: 'artificer_ruin', mods: { hp: 1, atk: 0.98, def: 1.25, spd: -0.5 }, damageType: 'arcane', range: 70,
        abilityIds: ['artificer_ruin.deploy_storm_pylon'],
        abilities: [{
          id: 'artificer_ruin.deploy_storm_pylon', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 22, animationLockTicks: 10, cooldownTicks: 280, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 70 },
          effects: [{ type: 'summon', archetypeId: 'summon.storm_pylon', count: 1, maxActive: 1 }],
          aiHints: { priority: 98 },
          presentation: { nameKey: 'combat.ability.artificer_ruin_deploy_storm_pylon.name', icon: 'icon_skill_fire' }
        }]
      }
    ],
    summons: [{
      id: 'summon.storm_pylon', mods: { hp: 0.44, atk: 0.55, moveSpeed: 0, range: 38 },
      movementTypes: [], range: 38, damageType: 'lightning', basicCoefficient: 0.2,
      abilityIds: ['summon.storm_pylon.lightning_pulse'],
      abilities: [{
        id: 'summon.storm_pylon.lightning_pulse', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 12, animationLockTicks: 8, cooldownTicks: 90, queueable: true, interruptible: true },
        target: { relation: 'hostile', shape: 'circle', range: 38, radius: 38, maxTargets: 4 },
        telegraph: { shape: 'circle', radius: 38, expectedDamagePct: 0.07 },
        effects: [D('lightning', 0.54), { type: 'applyStatus', statusId: 'skyruins.suppressed' }],
        aiHints: { priority: 116 },
        presentation: { nameKey: 'combat.ability.summon_storm_pylon_lightning_pulse.name', icon: 'icon_skill_fire' }
      }]
    }],
    guardianBaseId: 'guardian_orb',
    encounterRecipes: [
      { id: 'solo-a', members: ['guardian_orb'], weight: 18, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-b', members: ['harpy'], weight: 17, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-c', members: ['manta_aether'], weight: 13, spacing: 22, leashRadius: 124, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-d', members: ['artificer_ruin'], weight: 10, spacing: 22, leashRadius: 126, rewardBudget: 1.05, containsSummoner: true },
      { id: 'duo', members: ['guardian_orb', 'harpy'], weight: 16, spacing: 28, leashRadius: 132, rewardBudget: 1.25, ambushEligible: true },
      { id: 'duo-summoner', members: ['manta_aether', 'artificer_ruin'], weight: 12, spacing: 28, leashRadius: 136, rewardBudget: 1.3, containsSummoner: true },
      { id: 'duo-mixed', members: ['guardian_orb', 'manta_aether'], weight: 9, spacing: 28, leashRadius: 134, rewardBudget: 1.25, ambushEligible: true },
      { id: 'trio', members: ['guardian_orb', 'harpy', 'manta_aether'], weight: 5, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ],
    offlineRepresentative: { encounterPackId: 'solo-c', secondaryEncounterPackId: 'solo-d' },
    hazards: [
      {
        id: 'hazard.skyruins.arc_grid', regionId: 'skyruins', category: 'damageTrap',
        trigger: { mode: 'enter', shape: 'rect', width: 60, height: 28, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 112, revealRadius: 74, revealChance: 0.25 }, lifecycle: { revealTicks: 8, warningTicks: 30, activeTicks: 12, cooldownTicks: 600 },
        outcome: { type: 'applyEffects', pulses: 1, effects: [
          { type: 'damage', damageTypeId: 'lightning', formulaId: 'combat.hazard_damage_v1', params: { maxHpCoefficient: 0.08 }, canCrit: false, canDodge: false, defenseMode: 'resistanceOnly' },
          { type: 'applyStatus', statusId: 'skyruins.suppressed', stacks: 1, firstPulseOnly: true }
        ] },
        placement: { source: 'hazardAnchor', count: [4, 7], minCampDistance: 180, minLandmarkDistance: 54, minSpacing: 104, requireWalkableEscape: true },
        presentation: { nameKey: 'hazard.skyruins.arc_grid.name', descKey: 'hazard.skyruins.arc_grid.desc', warningKey: 'hazard.skyruins.arc_grid.warning', hitKey: 'hazard.skyruins.arc_grid.hit' },
        visual: { glyph: 'arc', palette: { element: '#77e8ff', clue: '#69718d' } }
      },
      {
        id: 'hazard.skyruins.rift_ambush', regionId: 'skyruins', category: 'ambushTrigger',
        trigger: { mode: 'enter', shape: 'circle', radius: 42, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 120, revealRadius: 78, revealChance: 0.25 }, lifecycle: { revealTicks: 6, warningTicks: 28, activeTicks: 1, cooldownTicks: 3600, ambushLock: true },
        outcome: { type: 'startEncounter', encounterPackIds: ['skyruins.solo-a', 'skyruins.solo-b', 'skyruins.solo-c', 'skyruins.duo', 'skyruins.duo-mixed'] },
        placement: { source: 'threatTerritory', count: [1, 3], minCampDistance: 180, minLandmarkDistance: 54, minSpacing: 104, requireWalkableEscape: true, maxPerTerritory: 1 },
        presentation: { nameKey: 'hazard.skyruins.rift_ambush.name', descKey: 'hazard.skyruins.rift_ambush.desc', warningKey: 'hazard.skyruins.rift_ambush.warning', hitKey: 'hazard.skyruins.rift_ambush.hit', ambushKey: 'hazard.skyruins.rift_ambush.ambush' },
        visual: { glyph: 'ambush', palette: { element: '#8ff5e4', clue: '#586e89' } }
      }
    ],
    locales: {
      'zh-CN': {
        'monster.manta_aether.name': '以太天鳐', 'monster.manta_aether.desc': '沿浮岛边缘滑翔的石质天鳐。', 'combat.lore.manta_aether': '青色能量槽让它在无风处也能转向。', 'combat.ability.manta_aether_basic.name': '石翼切击', 'combat.ability.manta_aether_arc_shear.name': '以太弧切', 'combat.trait.manta_aether.name': '浮空关节',
        'monster.artificer_ruin.name': '遗迹构装师', 'monster.artificer_ruin.desc': '部署风暴棱塔的小型古代构装体。', 'combat.lore.artificer_ruin': '多节工具臂仍在执行失落时代的维护指令。', 'combat.ability.artificer_ruin_basic.name': '符文射线', 'combat.ability.artificer_ruin_deploy_storm_pylon.name': '部署风暴棱塔', 'combat.trait.artificer_ruin.name': '遗迹工艺',
        'monster.summon.storm_pylon.name': '风暴棱塔', 'monster.summon.storm_pylon.desc': '以悬浮环积蓄雷光的三棱石塔。', 'combat.lore.summon.storm_pylon': '每一道硬边电弧都沿古代刻槽运行。', 'combat.ability.summon.storm_pylon_basic.name': '电弧点射', 'combat.ability.summon_storm_pylon_lightning_pulse.name': '雷击脉冲', 'combat.trait.summon.storm_pylon.name': '固定棱塔',
        'hazard.skyruins.arc_grid.name': '导雷矩阵', 'hazard.skyruins.arc_grid.desc': '破损导体之间会形成危险电弧。', 'hazard.skyruins.arc_grid.warning': '两端导体正在依次充能。', 'hazard.skyruins.arc_grid.hit': '导雷矩阵击中了队伍。',
        'hazard.skyruins.rift_ambush.name': '裂隙投送', 'hazard.skyruins.rift_ambush.desc': '错亮符文与收束碎片暴露了传送点。', 'hazard.skyruins.rift_ambush.warning': '方形符文落点正在成形。', 'hazard.skyruins.rift_ambush.hit': '裂隙中的袭击者已经现身。', 'hazard.skyruins.rift_ambush.ambush': '敌人从预告的裂隙落点投送。'
      },
      en: {
        'monster.manta_aether.name': 'Aether Manta', 'monster.manta_aether.desc': 'A stone-winged glider that patrols the island edges.', 'combat.lore.manta_aether': 'Cyan channels let it turn even where no wind blows.', 'combat.ability.manta_aether_basic.name': 'Stone Wing', 'combat.ability.manta_aether_arc_shear.name': 'Arc Shear', 'combat.trait.manta_aether.name': 'Aether Joints',
        'monster.artificer_ruin.name': 'Ruin Artificer', 'monster.artificer_ruin.desc': 'A small ancient construct that deploys storm pylons.', 'combat.lore.artificer_ruin': 'Its many tool arms still follow a lost maintenance order.', 'combat.ability.artificer_ruin_basic.name': 'Rune Ray', 'combat.ability.artificer_ruin_deploy_storm_pylon.name': 'Deploy Storm Pylon', 'combat.trait.artificer_ruin.name': 'Ruin Craft',
        'monster.summon.storm_pylon.name': 'Storm Pylon', 'monster.summon.storm_pylon.desc': 'A triangular stone tower charged by a floating ring.', 'combat.lore.summon.storm_pylon': 'Every hard-edged arc follows an ancient groove.', 'combat.ability.summon.storm_pylon_basic.name': 'Arc Bolt', 'combat.ability.summon_storm_pylon_lightning_pulse.name': 'Lightning Pulse', 'combat.trait.summon.storm_pylon.name': 'Fixed Pylon',
        'hazard.skyruins.arc_grid.name': 'Arc Grid', 'hazard.skyruins.arc_grid.desc': 'Broken conductors form a dangerous electrical line.', 'hazard.skyruins.arc_grid.warning': 'The two conductors are charging in sequence.', 'hazard.skyruins.arc_grid.hit': 'The arc grid struck the party.',
        'hazard.skyruins.rift_ambush.name': 'Rift Ambush', 'hazard.skyruins.rift_ambush.desc': 'Misfiring runes and converging debris betray a rift.', 'hazard.skyruins.rift_ambush.warning': 'A square rune landing zone is taking shape.', 'hazard.skyruins.rift_ambush.hit': 'The attackers in the rift are exposed.', 'hazard.skyruins.rift_ambush.ambush': 'Enemies arrive at the marked rift point.'
      }
    },
    boss: {
      id: 'ruin_guardian', mods: { hp: 1.06, atk: 1.08, def: 1.2 }, damageType: 'arcane', range: 84, scale: 1.3,
      abilityIds: ['ruin_guardian.arcane_ray', 'ruin_guardian.gravity_well', 'ruin_guardian.recalibrate'],
      abilities: [
        {
          id: 'ruin_guardian.arcane_ray', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 14, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'line', range: 88, radius: 18, maxTargets: 4 },
          telegraph: { shape: 'line', radius: 18, expectedDamagePct: 0.21 },
          effects: [D('arcane', 1.82), { type: 'applyStatus', statusId: 'skyruins.suppressed' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.arcane_ray.name', icon: 'icon_skill_fire' }
        },
        {
          id: 'ruin_guardian.gravity_well', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 38, animationLockTicks: 15, cooldownTicks: 220, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 72, radius: 52, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 52, expectedDamagePct: 0.2 },
          effects: [D('arcane', 1.55), { type: 'pull', distance: 28 }],
          aiHints: { priority: 88 }, presentation: { nameKey: 'combat.ability.gravity_well.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'ruin_guardian.recalibrate', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 26, animationLockTicks: 12, cooldownTicks: 320, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.24, durationTicks: 130, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'ruin_guardian.recalibrated', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 118, role: 'defensive' }, presentation: { nameKey: 'combat.ability.recalibrate.name', icon: 'icon_skill_guard' }
        }
      ],
      traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.2 }],
      phaseStatusId: 'ruin_guardian.phase2'
    }
  }));
})();
