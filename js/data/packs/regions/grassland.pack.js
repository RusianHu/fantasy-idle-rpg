(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  var pack = Game.contentAuthoring.factory('region.pack')({
    regionId: 'grassland', factionId: 'wild',
    sourceFile: 'js/data/packs/regions/grassland.pack.js',
    statuses: [
      {
        id: 'grassland.corroded', stacking: 'stack', maxStacks: 3, durationTicks: 140,
        modifiers: [{ stat: 'armor', phase: 'status', operation: 'multiply', value: 0.9 }],
        presentation: { nameKey: 'combat.status.corroded.name', icon: 'icon_skill_poison' }
      },
      {
        id: 'grassland.bleeding', stacking: 'stack', maxStacks: 3, durationTicks: 120,
        periodicIntervalTicks: 20, periodic: [Object.assign(D('slashing', 0.1), { canCrit: false })],
        presentation: { nameKey: 'combat.status.bleeding.name', icon: 'icon_skill_strike' }
      },
      {
        id: 'grassland.snared', stacking: 'refresh', durationTicks: 30,
        modifiers: [{ stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.25 }],
        presentation: { nameKey: 'combat.status.grassland_snared.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'slime_king.regenerating', stacking: 'refresh', durationTicks: 100,
        periodicIntervalTicks: 20,
        periodic: [{ type: 'heal', coefficient: 0.38, target: { relation: 'self', shape: 'single' } }],
        presentation: { nameKey: 'combat.status.regenerating.name', icon: 'icon_skill_heal' }
      },
      {
        id: 'slime_king.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.18 },
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 1.12 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'slime_green', mods: { hp: 0.9, atk: 0.9, spd: -1 },
        damageType: 'blunt', abilityIds: ['slime_green.acid_splash'],
        abilities: [{
          id: 'slime_green.acid_splash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 16, animationLockTicks: 10, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 34 },
          effects: [D('poison', 0.82), { type: 'applyStatus', statusId: 'grassland.corroded' }],
          aiHints: { priority: 55 },
          presentation: { nameKey: 'combat.ability.slime_acid.name', icon: 'icon_skill_poison' }
        }],
        traitModifiers: [{ stat: 'maxHp', phase: 'multiply', operation: 'multiply', value: 1.04 }]
      },
      {
        id: 'wolf_gray', mods: { hp: 1.05, atk: 1.1, spd: 1.5 },
        damageType: 'slashing', abilityIds: ['wolf_gray.rending_pounce'],
        abilities: [{
          id: 'wolf_gray.rending_pounce', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 8, animationLockTicks: 10, cooldownTicks: 120, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 42 },
          effects: [D('slashing', 1.22), { type: 'applyStatus', statusId: 'grassland.bleeding' }, { type: 'movement', distance: 18 }],
          aiHints: { priority: 62 },
          presentation: { nameKey: 'combat.ability.wolf_pounce.name', icon: 'icon_skill_strike' }
        }],
        traitModifiers: [{ stat: 'moveSpeed', phase: 'multiply', operation: 'multiply', value: 1.12 }]
      },
      {
        id: 'boar_thornback', mods: { hp: 1.15, atk: 1.05, spd: 0.5 },
        damageType: 'blunt', abilityIds: ['boar_thornback.tusk_charge'],
        abilities: [{
          id: 'boar_thornback.tusk_charge', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 12, animationLockTicks: 10, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 46 },
          effects: [{ type: 'movement', distance: 18 }, D('blunt', 1.12), { type: 'applyStatus', statusId: 'grassland.bleeding' }],
          aiHints: { priority: 68 },
          presentation: { nameKey: 'combat.ability.boar_thornback_tusk_charge.name', icon: 'icon_skill_strike' }
        }]
      },
      {
        id: 'goblin_trapper', mods: { hp: 0.88, atk: 0.92, spd: 1.5, range: 58 }, range: 58,
        damageType: 'piercing', abilityIds: ['goblin_trapper.set_snare'],
        abilities: [{
          id: 'goblin_trapper.set_snare', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 20, animationLockTicks: 10, cooldownTicks: 240, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 58 },
          effects: [{ type: 'summon', archetypeId: 'summon.snare_trap', count: 1, maxActive: 1 }],
          aiHints: { priority: 92 },
          presentation: { nameKey: 'combat.ability.goblin_trapper_set_snare.name', icon: 'icon_skill_guard' }
        }]
      }
    ],
    summons: [{
      id: 'summon.snare_trap', mods: { hp: 0.38, atk: 0.45, moveSpeed: 0, range: 26 },
      movementTypes: [], range: 26, damageType: 'piercing', basicCoefficient: 0.2,
      abilityIds: ['summon.snare_trap.snap'],
      abilities: [{
        id: 'summon.snare_trap.snap', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 12, animationLockTicks: 8, cooldownTicks: 80, queueable: true, interruptible: true },
        target: { relation: 'hostile', shape: 'circle', range: 26, radius: 20, maxTargets: 1 },
        telegraph: { shape: 'circle', radius: 20, expectedDamagePct: 0.06 },
        effects: [D('piercing', 0.48), { type: 'applyStatus', statusId: 'grassland.snared' }, { type: 'selfDestruct' }],
        aiHints: { priority: 120 },
        presentation: { nameKey: 'combat.ability.summon_snare_trap_snap.name', icon: 'icon_skill_guard' }
      }]
    }],
    guardianBaseId: 'wolf_gray',
    encounterRecipes: [
      { id: 'solo-a', members: ['slime_green'], weight: 18, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-b', members: ['wolf_gray'], weight: 17, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-c', members: ['boar_thornback'], weight: 13, spacing: 22, leashRadius: 124, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-d', members: ['goblin_trapper'], weight: 10, spacing: 22, leashRadius: 126, rewardBudget: 1.05, containsSummoner: true },
      { id: 'duo', members: ['slime_green', 'wolf_gray'], weight: 16, spacing: 28, leashRadius: 132, rewardBudget: 1.25, ambushEligible: true },
      { id: 'duo-summoner', members: ['boar_thornback', 'goblin_trapper'], weight: 12, spacing: 28, leashRadius: 136, rewardBudget: 1.3, containsSummoner: true },
      { id: 'duo-mixed', members: ['slime_green', 'boar_thornback'], weight: 9, spacing: 28, leashRadius: 134, rewardBudget: 1.25, ambushEligible: true },
      { id: 'trio', members: ['slime_green', 'wolf_gray', 'boar_thornback'], weight: 5, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ],
    offlineRepresentative: { encounterPackId: 'solo-c', secondaryEncounterPackId: 'solo-d' },
    hazards: [
      {
        id: 'hazard.grassland.thorn_stakes', regionId: 'grassland', category: 'damageTrap',
        trigger: { mode: 'enter', shape: 'circle', radius: 24, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 96, revealRadius: 64, revealChance: 0.25 },
        lifecycle: { revealTicks: 8, warningTicks: 24, activeTicks: 8, cooldownTicks: 600 },
        outcome: { type: 'applyEffects', pulses: 1, effects: [
          { type: 'damage', damageTypeId: 'piercing', formulaId: 'combat.hazard_damage_v1', params: { maxHpCoefficient: 0.06 }, canCrit: false, canDodge: false, defenseMode: 'resistanceOnly' },
          { type: 'applyStatus', statusId: 'grassland.bleeding', stacks: 1, firstPulseOnly: true }
        ] },
        placement: { source: 'hazardAnchor', count: [4, 7], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 96, requireWalkableEscape: true },
        presentation: { nameKey: 'hazard.grassland.thorn_stakes.name', descKey: 'hazard.grassland.thorn_stakes.desc', warningKey: 'hazard.grassland.thorn_stakes.warning', hitKey: 'hazard.grassland.thorn_stakes.hit' },
        visual: { glyph: 'spikes', palette: { element: '#d5c28a', clue: '#67583d' } }
      },
      {
        id: 'hazard.grassland.roadside_ambush', regionId: 'grassland', category: 'ambushTrigger',
        trigger: { mode: 'enter', shape: 'circle', radius: 42, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 112, revealRadius: 74, revealChance: 0.25 },
        lifecycle: { revealTicks: 6, warningTicks: 22, activeTicks: 1, cooldownTicks: 3600, ambushLock: true },
        outcome: { type: 'startEncounter', encounterPackIds: ['grassland.solo-a', 'grassland.solo-b', 'grassland.solo-c', 'grassland.duo', 'grassland.duo-mixed'] },
        placement: { source: 'threatTerritory', count: [1, 3], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 96, requireWalkableEscape: true, maxPerTerritory: 1 },
        presentation: { nameKey: 'hazard.grassland.roadside_ambush.name', descKey: 'hazard.grassland.roadside_ambush.desc', warningKey: 'hazard.grassland.roadside_ambush.warning', hitKey: 'hazard.grassland.roadside_ambush.hit', ambushKey: 'hazard.grassland.roadside_ambush.ambush' },
        visual: { glyph: 'ambush', palette: { element: '#a9d06e', clue: '#3f6a35' } }
      }
    ],
    locales: {
      'zh-CN': {
        'monster.boar_thornback.name': '荆背野猪', 'monster.boar_thornback.desc': '披着硬鬃的草原冲锋兽。', 'combat.lore.boar_thornback': '旧猎道边的灌木为它磨亮了獠牙。',
        'combat.ability.boar_thornback_basic.name': '獠牙顶撞', 'combat.ability.boar_thornback_tusk_charge.name': '荆鬃冲锋', 'combat.trait.boar_thornback.name': '厚重野性',
        'monster.goblin_trapper.name': '草原地精猎手', 'monster.goblin_trapper.desc': '携带绳套与短弩的伏击手。', 'combat.lore.goblin_trapper': '它会先封住退路，再呼来同伴。',
        'combat.ability.goblin_trapper_basic.name': '短弩射击', 'combat.ability.goblin_trapper_set_snare.name': '布设套索', 'combat.trait.goblin_trapper.name': '猎道经验',
        'monster.summon.snare_trap.name': '套索陷阱', 'monster.summon.snare_trap.desc': '可被提前摧毁的单次绳套。', 'combat.lore.summon.snare_trap': '粗绳与木桩构成的简陋机关。',
        'combat.ability.summon.snare_trap_basic.name': '绳结抽击', 'combat.ability.summon_snare_trap_snap.name': '套索咬合', 'combat.trait.summon.snare_trap.name': '固定装置',
        'combat.status.grassland_snared.name': '套索束缚',
        'hazard.grassland.thorn_stakes.name': '荆棘暗桩', 'hazard.grassland.thorn_stakes.desc': '藏在枯草下的短木刺。', 'hazard.grassland.thorn_stakes.warning': '地面木刺正在弹起。', 'hazard.grassland.thorn_stakes.hit': '荆棘暗桩刺中了队伍。',
        'hazard.grassland.roadside_ambush.name': '路旁伏兵', 'hazard.grassland.roadside_ambush.desc': '高草中的反向草浪暴露了伏兵。', 'hazard.grassland.roadside_ambush.warning': '道路两侧传来异动。', 'hazard.grassland.roadside_ambush.hit': '伏兵已经现身。', 'hazard.grassland.roadside_ambush.ambush': '路旁伏兵合围。'
      },
      en: {
        'monster.boar_thornback.name': 'Thornback Boar', 'monster.boar_thornback.desc': 'A charging grazer clad in rigid bristles.', 'combat.lore.boar_thornback': 'Roadside brush has polished its tusks to a pale shine.',
        'combat.ability.boar_thornback_basic.name': 'Tusk Jab', 'combat.ability.boar_thornback_tusk_charge.name': 'Bristle Charge', 'combat.trait.boar_thornback.name': 'Heavy Wildness',
        'monster.goblin_trapper.name': 'Grassland Goblin Trapper', 'monster.goblin_trapper.desc': 'An ambusher carrying snares and a short crossbow.', 'combat.lore.goblin_trapper': 'It closes the escape route before calling its pack.',
        'combat.ability.goblin_trapper_basic.name': 'Crossbow Shot', 'combat.ability.goblin_trapper_set_snare.name': 'Set Snare', 'combat.trait.goblin_trapper.name': 'Trailcraft',
        'monster.summon.snare_trap.name': 'Snare Trap', 'monster.summon.snare_trap.desc': 'A single-use rope trap that can be destroyed early.', 'combat.lore.summon.snare_trap': 'A crude mechanism of rope, stakes, and a biting plate.',
        'combat.ability.summon.snare_trap_basic.name': 'Rope Lash', 'combat.ability.summon_snare_trap_snap.name': 'Snare Snap', 'combat.trait.summon.snare_trap.name': 'Fixed Device',
        'combat.status.grassland_snared.name': 'Snared',
        'hazard.grassland.thorn_stakes.name': 'Thorn Stakes', 'hazard.grassland.thorn_stakes.desc': 'Short stakes hidden beneath dry grass.', 'hazard.grassland.thorn_stakes.warning': 'Wooden spikes are rising from the trail.', 'hazard.grassland.thorn_stakes.hit': 'The thorn stakes struck the party.',
        'hazard.grassland.roadside_ambush.name': 'Roadside Ambush', 'hazard.grassland.roadside_ambush.desc': 'A backward ripple in the grass gives the ambush away.', 'hazard.grassland.roadside_ambush.warning': 'Movement stirs on both sides of the road.', 'hazard.grassland.roadside_ambush.hit': 'The hidden attackers are exposed.', 'hazard.grassland.roadside_ambush.ambush': 'Roadside attackers close in.'
      }
    },
    boss: {
      id: 'slime_king', mods: { hp: 1, atk: 1 }, damageType: 'blunt', scale: 1.25,
      abilityIds: ['slime_king.crushing_drop', 'slime_king.slime_wave', 'slime_king.regenerate'],
      abilities: [
        {
          id: 'slime_king.crushing_drop', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 28, animationLockTicks: 14, cooldownTicks: 160, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 46, radius: 34, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 34, expectedDamagePct: 0.18 },
          effects: [D('blunt', 1.65)], aiHints: { priority: 80 },
          presentation: { nameKey: 'combat.ability.slime_crush.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'slime_king.slime_wave', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 14, cooldownTicks: 190, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 64, radius: 52, maxTargets: 4 },
          telegraph: { shape: 'cone', radius: 52, expectedDamagePct: 0.15 },
          effects: [D('poison', 1.25), { type: 'applyStatus', statusId: 'grassland.corroded' }],
          aiHints: { priority: 74 },
          presentation: { nameKey: 'combat.ability.slime_wave.name', icon: 'icon_skill_poison' }
        },
        {
          id: 'slime_king.regenerate', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 42, animationLockTicks: 12, cooldownTicks: 360, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          telegraph: { shape: 'self', radius: 20, expectedDamagePct: 0 },
          effects: [{ type: 'applyStatus', statusId: 'slime_king.regenerating', target: { relation: 'self', shape: 'single' } }],
          aiHints: { priority: 120, role: 'heal' },
          presentation: { nameKey: 'combat.ability.slime_regen.name', icon: 'icon_skill_heal' }
        }
      ],
      traitModifiers: [{ stat: 'tenacity', phase: 'otherFlat', operation: 'add', value: 0.5 }],
      phaseStatusId: 'slime_king.phase2'
    }
  });
  Game.content.registerPack(pack);
})();
