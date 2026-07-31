(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  Game.content.registerPack(Game.contentAuthoring.factory('region.pack')({
    regionId: 'mine', factionId: 'mine_denizens',
    sourceFile: 'js/data/packs/regions/mine.pack.js',
    statuses: [
      {
        id: 'mine.disoriented', stacking: 'refresh', durationTicks: 100,
        modifiers: [{ stat: 'accuracy', phase: 'status', operation: 'multiply', value: 0.82 }],
        presentation: { nameKey: 'combat.status.disoriented.name', icon: 'icon_skill_swift' }
      },
      {
        id: 'mine.sundered', stacking: 'stack', maxStacks: 3, durationTicks: 140,
        modifiers: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 0.88 }],
        presentation: { nameKey: 'combat.status.sundered.name', icon: 'icon_skill_strike' }
      },
      {
        id: 'stone_golem.rock_shield', stacking: 'refresh', durationTicks: 120,
        modifiers: [
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 1.45 },
          { stat: 'ward', phase: 'status', operation: 'multiply', value: 1.3 }
        ],
        presentation: { nameKey: 'combat.status.rock_shield.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'stone_golem.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.28 },
          { stat: 'armor', phase: 'status', operation: 'multiply', value: 0.82 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'cave_bat', mods: { hp: 0.8, atk: 0.95, spd: 3 }, movementTypes: ['flying'],
        damageType: 'piercing', abilityIds: ['cave_bat.screech'],
        abilities: [{
          id: 'cave_bat.screech', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 20, animationLockTicks: 10, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 48, radius: 36, maxTargets: 4 },
          effects: [D('blunt', 0.65), { type: 'applyStatus', statusId: 'mine.disoriented' }],
          aiHints: { priority: 58 }, presentation: { nameKey: 'combat.ability.bat_screech.name', icon: 'icon_skill_swift' }
        }],
        traitModifiers: [{ stat: 'dodgeChance', phase: 'otherFlat', operation: 'add', value: 0.06 }]
      },
      {
        id: 'kobold_miner', mods: { hp: 1.1, atk: 1.05 }, damageType: 'blunt',
        abilityIds: ['kobold_miner.armor_break'],
        abilities: [{
          id: 'kobold_miner.armor_break', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 12, animationLockTicks: 11, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 28 },
          effects: [D('blunt', 1.18), { type: 'applyStatus', statusId: 'mine.sundered' }],
          aiHints: { priority: 62 }, presentation: { nameKey: 'combat.ability.armor_break.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.08 }]
      },
      {
        id: 'crawler_crystalback', mods: { hp: 1, atk: 1.08, def: 1.2, spd: 1 }, damageType: 'arcane', range: 64,
        abilityIds: ['crawler_crystalback.prismatic_shard'],
        abilities: [{
          id: 'crawler_crystalback.prismatic_shard', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 14, animationLockTicks: 10, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 64 },
          effects: [D('arcane', 0.92), { type: 'applyStatus', statusId: 'mine.disoriented' }],
          aiHints: { priority: 66 },
          presentation: { nameKey: 'combat.ability.crawler_crystalback_prismatic_shard.name', icon: 'icon_skill_fire' }
        }]
      },
      {
        id: 'kobold_sapper', mods: { hp: 0.9, atk: 1, spd: 1 }, damageType: 'piercing', range: 54,
        abilityIds: ['kobold_sapper.roll_keg'],
        abilities: [{
          id: 'kobold_sapper.roll_keg', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 10, cooldownTicks: 260, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 54 },
          effects: [{ type: 'summon', archetypeId: 'summon.powder_keg', count: 1, maxActive: 1 }],
          aiHints: { priority: 94 },
          presentation: { nameKey: 'combat.ability.kobold_sapper_roll_keg.name', icon: 'icon_skill_fire' }
        }]
      }
    ],
    summons: [{
      id: 'summon.powder_keg', mods: { hp: 0.32, atk: 0.75, moveSpeed: 0, range: 40 },
      movementTypes: [], range: 40, damageType: 'fire', basicCoefficient: 0.15,
      abilityIds: ['summon.powder_keg.fuse_burst'],
      abilities: [{
        id: 'summon.powder_keg.fuse_burst', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 28, animationLockTicks: 8, cooldownTicks: 100, queueable: true, interruptible: true },
        target: { relation: 'hostile', shape: 'circle', range: 40, radius: 40, maxTargets: 4 },
        telegraph: { shape: 'circle', radius: 40, expectedDamagePct: 0.15 },
        effects: [D('fire', 1.18), { type: 'selfDestruct' }],
        aiHints: { priority: 125 },
        presentation: { nameKey: 'combat.ability.summon_powder_keg_fuse_burst.name', icon: 'icon_skill_fire' }
      }]
    }],
    guardianBaseId: 'kobold_miner',
    encounterRecipes: [
      { id: 'solo-a', members: ['cave_bat'], weight: 18, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-b', members: ['kobold_miner'], weight: 17, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-c', members: ['crawler_crystalback'], weight: 13, spacing: 22, leashRadius: 124, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-d', members: ['kobold_sapper'], weight: 10, spacing: 22, leashRadius: 126, rewardBudget: 1.05, containsSummoner: true },
      { id: 'duo', members: ['cave_bat', 'kobold_miner'], weight: 16, spacing: 28, leashRadius: 132, rewardBudget: 1.25, ambushEligible: true },
      { id: 'duo-summoner', members: ['crawler_crystalback', 'kobold_sapper'], weight: 12, spacing: 28, leashRadius: 136, rewardBudget: 1.3, containsSummoner: true },
      { id: 'duo-mixed', members: ['cave_bat', 'crawler_crystalback'], weight: 9, spacing: 28, leashRadius: 134, rewardBudget: 1.25, ambushEligible: true },
      { id: 'trio', members: ['cave_bat', 'kobold_miner', 'crawler_crystalback'], weight: 5, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ],
    offlineRepresentative: { encounterPackId: 'solo-c', secondaryEncounterPackId: 'solo-d' },
    hazards: [
      {
        id: 'hazard.mine.rockfall_plate', regionId: 'mine', category: 'damageTrap',
        trigger: { mode: 'enter', shape: 'circle', radius: 32, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 112, revealRadius: 72, revealChance: 0.25 }, lifecycle: { revealTicks: 8, warningTicks: 34, activeTicks: 12, cooldownTicks: 720 },
        outcome: { type: 'applyEffects', pulses: 1, effects: [
          { type: 'damage', damageTypeId: 'blunt', formulaId: 'combat.hazard_damage_v1', params: { maxHpCoefficient: 0.08 }, canCrit: false, canDodge: false, defenseMode: 'resistanceOnly' },
          { type: 'knockback', distance: 12 },
          { type: 'applyStatus', statusId: 'mine.disoriented', stacks: 1, firstPulseOnly: true }
        ] },
        placement: { source: 'hazardAnchor', count: [4, 7], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 100, requireWalkableEscape: true },
        presentation: { nameKey: 'hazard.mine.rockfall_plate.name', descKey: 'hazard.mine.rockfall_plate.desc', warningKey: 'hazard.mine.rockfall_plate.warning', hitKey: 'hazard.mine.rockfall_plate.hit' },
        visual: { glyph: 'rocks', palette: { element: '#aab4bd', clue: '#665b4d' } }
      },
      {
        id: 'hazard.mine.tunnel_ambush', regionId: 'mine', category: 'ambushTrigger',
        trigger: { mode: 'enter', shape: 'circle', radius: 42, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 116, revealRadius: 76, revealChance: 0.25 }, lifecycle: { revealTicks: 6, warningTicks: 26, activeTicks: 1, cooldownTicks: 3600, ambushLock: true },
        outcome: { type: 'startEncounter', encounterPackIds: ['mine.solo-a', 'mine.solo-b', 'mine.solo-c', 'mine.duo', 'mine.duo-mixed'] },
        placement: { source: 'threatTerritory', count: [1, 3], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 100, requireWalkableEscape: true, maxPerTerritory: 1 },
        presentation: { nameKey: 'hazard.mine.tunnel_ambush.name', descKey: 'hazard.mine.tunnel_ambush.desc', warningKey: 'hazard.mine.tunnel_ambush.warning', hitKey: 'hazard.mine.tunnel_ambush.hit', ambushKey: 'hazard.mine.tunnel_ambush.ambush' },
        visual: { glyph: 'ambush', palette: { element: '#e6c96a', clue: '#5f533d' } }
      }
    ],
    locales: {
      'zh-CN': {
        'monster.crawler_crystalback.name': '晶背穴兽', 'monster.crawler_crystalback.desc': '背负青蓝晶簇的矿坑猎兽。', 'combat.lore.crawler_crystalback': '它沿着最明亮的矿脉筑巢。', 'combat.ability.crawler_crystalback_basic.name': '晶爪', 'combat.ability.crawler_crystalback_prismatic_shard.name': '棱晶碎片', 'combat.trait.crawler_crystalback.name': '晶背甲壳',
        'monster.kobold_sapper.name': '狗头人爆破手', 'monster.kobold_sapper.desc': '携带火药桶和火绳的矿坑爆破手。', 'combat.lore.kobold_sapper': '每根废弃木梁在它眼中都是可利用的引线。', 'combat.ability.kobold_sapper_basic.name': '火绳投射', 'combat.ability.kobold_sapper_roll_keg.name': '滚放火药桶', 'combat.trait.kobold_sapper.name': '爆破经验',
        'monster.summon.powder_keg.name': '火药桶', 'monster.summon.powder_keg.desc': '可被提前击毁的短引线火药桶。', 'combat.lore.summon.powder_keg': '桶箍已经被爆炸的热量熏黑。', 'combat.ability.summon.powder_keg_basic.name': '火星迸射', 'combat.ability.summon_powder_keg_fuse_burst.name': '引线爆破', 'combat.trait.summon.powder_keg.name': '固定爆炸物',
        'hazard.mine.rockfall_plate.name': '塌顶落石', 'hazard.mine.rockfall_plate.desc': '松动压板连接着头顶破损木梁。', 'hazard.mine.rockfall_plate.warning': '碎石正从顶板落下。', 'hazard.mine.rockfall_plate.hit': '塌顶落石砸中了队伍。',
        'hazard.mine.tunnel_ambush.name': '矿道夹击', 'hazard.mine.tunnel_ambush.desc': '轨道震动暴露了侧洞中的伏兵。', 'hazard.mine.tunnel_ambush.warning': '前后矿灯同时熄灭。', 'hazard.mine.tunnel_ambush.hit': '矿道伏兵已经现身。', 'hazard.mine.tunnel_ambush.ambush': '侧洞中的敌人发起夹击。'
      },
      en: {
        'monster.crawler_crystalback.name': 'Crystalback Crawler', 'monster.crawler_crystalback.desc': 'A mine predator carrying blue crystal clusters.', 'combat.lore.crawler_crystalback': 'It nests along the brightest mineral veins.', 'combat.ability.crawler_crystalback_basic.name': 'Crystal Claw', 'combat.ability.crawler_crystalback_prismatic_shard.name': 'Prismatic Shard', 'combat.trait.crawler_crystalback.name': 'Crystal Carapace',
        'monster.kobold_sapper.name': 'Kobold Sapper', 'monster.kobold_sapper.desc': 'A demolitionist laden with powder kegs and fuse cord.', 'combat.lore.kobold_sapper': 'Every abandoned support beam looks like a fuse to it.', 'combat.ability.kobold_sapper_basic.name': 'Fuse Dart', 'combat.ability.kobold_sapper_roll_keg.name': 'Roll Powder Keg', 'combat.trait.kobold_sapper.name': 'Demolition Craft',
        'monster.summon.powder_keg.name': 'Powder Keg', 'monster.summon.powder_keg.desc': 'A short-fused keg that can be destroyed before it bursts.', 'combat.lore.summon.powder_keg': 'Its iron hoops are blackened by repeated blasts.', 'combat.ability.summon.powder_keg_basic.name': 'Spark Spit', 'combat.ability.summon_powder_keg_fuse_burst.name': 'Fuse Burst', 'combat.trait.summon.powder_keg.name': 'Fixed Explosive',
        'hazard.mine.rockfall_plate.name': 'Rockfall Plate', 'hazard.mine.rockfall_plate.desc': 'A loose plate is wired to damaged beams overhead.', 'hazard.mine.rockfall_plate.warning': 'Loose stones are falling from the ceiling.', 'hazard.mine.rockfall_plate.hit': 'The rockfall struck the party.',
        'hazard.mine.tunnel_ambush.name': 'Tunnel Ambush', 'hazard.mine.tunnel_ambush.desc': 'Shaking rails betray attackers in the side tunnels.', 'hazard.mine.tunnel_ambush.warning': 'Lamps ahead and behind go dark.', 'hazard.mine.tunnel_ambush.hit': 'The tunnel attackers are exposed.', 'hazard.mine.tunnel_ambush.ambush': 'Enemies charge from the side tunnels.'
      }
    },
    boss: {
      id: 'stone_golem', mods: { hp: 1.12, atk: 1.05, spd: -2 }, damageType: 'blunt', scale: 1.3,
      abilityIds: ['stone_golem.quake_ring', 'stone_golem.rock_shield_action', 'stone_golem.crushing_fist'],
      abilities: [
        {
          id: 'stone_golem.quake_ring', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 32, animationLockTicks: 15, cooldownTicks: 180, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 60, radius: 48, maxTargets: 4 },
          telegraph: { shape: 'ring', radius: 48, expectedDamagePct: 0.2 },
          effects: [D('blunt', 1.78)], aiHints: { priority: 84 },
          presentation: { nameKey: 'combat.ability.golem_quake.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'stone_golem.rock_shield_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 12, cooldownTicks: 300, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.18, durationTicks: 120, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'stone_golem.rock_shield', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 115, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.golem_shield.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'stone_golem.crushing_fist', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 16, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 32 },
          telegraph: { shape: 'single', radius: 22, expectedDamagePct: 0.24 },
          effects: [D('blunt', 2.05), { type: 'applyStatus', statusId: 'mine.sundered' }],
          aiHints: { priority: 80 }, presentation: { nameKey: 'combat.ability.golem_fist.name', icon: 'icon_skill_strike' }
        }
      ],
      traitModifiers: [{ stat: 'tenacity', phase: 'otherFlat', operation: 'add', value: 0.65 }],
      phaseStatusId: 'stone_golem.phase2'
    }
  }));
})();
