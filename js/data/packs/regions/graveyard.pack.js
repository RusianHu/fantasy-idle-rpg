(function () {
  'use strict';
  var Game = window.Game, D = Game.contentAuthoring.factory('effect.damage');
  Game.content.registerPack(Game.contentAuthoring.factory('region.pack')({
    regionId: 'graveyard', factionId: 'undead',
    sourceFile: 'js/data/packs/regions/graveyard.pack.js',
    statuses: [
      {
        id: 'graveyard.staggered', stacking: 'refresh', durationTicks: 20,
        modifiers: [{ stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 0.65 }],
        presentation: { nameKey: 'combat.status.staggered.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'graveyard.withered', stacking: 'refresh', durationTicks: 140,
        modifiers: [
          { stat: 'healingPower', phase: 'status', operation: 'multiply', value: 0.72 },
          { stat: 'physicalPower', phase: 'status', operation: 'multiply', value: 0.9 },
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 0.9 }
        ],
        presentation: { nameKey: 'combat.status.withered.name', icon: 'icon_skill_poison' }
      },
      {
        id: 'graveyard.clutched', stacking: 'refresh', durationTicks: 36,
        modifiers: [{ stat: 'moveSpeed', phase: 'status', operation: 'multiply', value: 0.3 }],
        presentation: { nameKey: 'combat.status.graveyard_clutched.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'necromancer.bone_barrier', stacking: 'refresh', durationTicks: 140,
        modifiers: [{ stat: 'ward', phase: 'status', operation: 'multiply', value: 1.3 }],
        presentation: { nameKey: 'combat.status.bone_barrier.name', icon: 'icon_skill_guard' }
      },
      {
        id: 'necromancer.phase2', stacking: 'unique', durationTicks: 999999,
        modifiers: [
          { stat: 'magicPower', phase: 'status', operation: 'multiply', value: 1.22 },
          { stat: 'gcdSpeed', phase: 'status', operation: 'multiply', value: 1.15 }
        ],
        presentation: { nameKey: 'combat.status.phase2.name', icon: 'icon_boss_hunt' }
      }
    ],
    normals: [
      {
        id: 'skeleton_soldier', mods: { hp: 1, atk: 1.1 }, damageType: 'slashing',
        abilityIds: ['skeleton_soldier.shield_bash'],
        abilities: [{
          id: 'skeleton_soldier.shield_bash', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 12, animationLockTicks: 11, cooldownTicks: 140, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 28 },
          effects: [D('blunt', 1.05), { type: 'applyStatus', statusId: 'graveyard.staggered' }],
          aiHints: { priority: 64 }, presentation: { nameKey: 'combat.ability.shield_bash.name', icon: 'icon_skill_guard' }
        }],
        traitModifiers: [{ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.12 }]
      },
      {
        id: 'ghost_wisp', mods: { hp: 0.85, atk: 0.95, spd: 2, def: 1.4 }, movementTypes: ['flying'],
        damageType: 'necrotic', range: 62, abilityIds: ['ghost_wisp.life_drain'],
        abilities: [{
          id: 'ghost_wisp.life_drain', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 10, cooldownTicks: 150, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 64 },
          effects: [D('necrotic', 1.02), { type: 'heal', coefficient: 0.7, target: { relation: 'self', shape: 'single' } }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.life_drain.name', icon: 'icon_skill_poison' }
        }],
        traitModifiers: [{ stat: 'dodgeChance', phase: 'otherFlat', operation: 'add', value: 0.05 }]
      },
      {
        id: 'hound_grave', mods: { hp: 0.95, atk: 1.12, spd: 2.5 }, damageType: 'necrotic',
        abilityIds: ['hound_grave.withering_bite'],
        abilities: [{
          id: 'hound_grave.withering_bite', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 8, animationLockTicks: 10, cooldownTicks: 120, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 34 },
          effects: [D('necrotic', 1.02), { type: 'applyStatus', statusId: 'graveyard.withered' }],
          aiHints: { priority: 68 },
          presentation: { nameKey: 'combat.ability.hound_grave_withering_bite.name', icon: 'icon_skill_poison' }
        }]
      },
      {
        id: 'ghoul_gravedigger', mods: { hp: 1.08, atk: 0.95, spd: -1 }, damageType: 'blunt',
        abilityIds: ['ghoul_gravedigger.unearthed_grasp'],
        abilities: [{
          id: 'ghoul_gravedigger.unearthed_grasp', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 11, cooldownTicks: 280, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 52 },
          effects: [{ type: 'summon', archetypeId: 'summon.crawling_hand', count: 1, maxActive: 1 }],
          aiHints: { priority: 96 },
          presentation: { nameKey: 'combat.ability.ghoul_gravedigger_unearthed_grasp.name', icon: 'icon_skill_poison' }
        }]
      }
    ],
    summons: [{
      id: 'summon.crawling_hand', mods: { hp: 0.35, atk: 0.38, spd: 1.5 },
      damageType: 'necrotic', basicCoefficient: 0.22,
      abilityIds: ['summon.crawling_hand.ankle_grab'],
      abilities: [{
        id: 'summon.crawling_hand.ankle_grab', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 8, animationLockTicks: 8, cooldownTicks: 90, queueable: true, interruptible: true },
        target: { relation: 'hostile', shape: 'single', range: 26 },
        effects: [D('necrotic', 0.4), { type: 'applyStatus', statusId: 'graveyard.clutched' }],
        aiHints: { priority: 110 },
        presentation: { nameKey: 'combat.ability.summon_crawling_hand_ankle_grab.name', icon: 'icon_skill_guard' }
      }]
    }],
    guardianBaseId: 'skeleton_soldier',
    encounterRecipes: [
      { id: 'solo-a', members: ['skeleton_soldier'], weight: 18, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-b', members: ['ghost_wisp'], weight: 17, spacing: 22, leashRadius: 120, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-c', members: ['hound_grave'], weight: 13, spacing: 22, leashRadius: 124, rewardBudget: 1, ambushEligible: true },
      { id: 'solo-d', members: ['ghoul_gravedigger'], weight: 10, spacing: 22, leashRadius: 126, rewardBudget: 1.05, containsSummoner: true },
      { id: 'duo', members: ['skeleton_soldier', 'ghost_wisp'], weight: 16, spacing: 28, leashRadius: 132, rewardBudget: 1.25, ambushEligible: true },
      { id: 'duo-summoner', members: ['hound_grave', 'ghoul_gravedigger'], weight: 12, spacing: 28, leashRadius: 136, rewardBudget: 1.3, containsSummoner: true },
      { id: 'duo-mixed', members: ['skeleton_soldier', 'hound_grave'], weight: 9, spacing: 28, leashRadius: 134, rewardBudget: 1.25, ambushEligible: true },
      { id: 'trio', members: ['skeleton_soldier', 'ghost_wisp', 'hound_grave'], weight: 5, spacing: 30, leashRadius: 144, rewardBudget: 1.45 }
    ],
    offlineRepresentative: { encounterPackId: 'solo-c', secondaryEncounterPackId: 'solo-d' },
    hazards: [
      {
        id: 'hazard.graveyard.soul_seal', regionId: 'graveyard', category: 'damageTrap',
        trigger: { mode: 'enter', shape: 'circle', radius: 30, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 106, revealRadius: 70, revealChance: 0.25 }, lifecycle: { revealTicks: 8, warningTicks: 28, activeTicks: 22, cooldownTicks: 640 },
        outcome: { type: 'applyEffects', pulses: 3, intervalTicks: 8, effects: [
          { type: 'damage', damageTypeId: 'necrotic', formulaId: 'combat.hazard_damage_v1', params: { maxHpCoefficient: 0.025 }, canCrit: false, canDodge: false, defenseMode: 'resistanceOnly' },
          { type: 'applyStatus', statusId: 'graveyard.withered', stacks: 1, firstPulseOnly: true }
        ] },
        placement: { source: 'hazardAnchor', count: [4, 7], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 96, requireWalkableEscape: true },
        presentation: { nameKey: 'hazard.graveyard.soul_seal.name', descKey: 'hazard.graveyard.soul_seal.desc', warningKey: 'hazard.graveyard.soul_seal.warning', hitKey: 'hazard.graveyard.soul_seal.hit' },
        visual: { glyph: 'seal', palette: { element: '#c7a8ee', clue: '#655878' } }
      },
      {
        id: 'hazard.graveyard.grave_ambush', regionId: 'graveyard', category: 'ambushTrigger',
        trigger: { mode: 'enter', shape: 'circle', radius: 42, movementTypes: ['ground'], actorFilter: 'playerParty', sweep: true, retrigger: 'afterExit' },
        detection: { clueRadius: 116, revealRadius: 76, revealChance: 0.25 }, lifecycle: { revealTicks: 6, warningTicks: 26, activeTicks: 1, cooldownTicks: 3600, ambushLock: true },
        outcome: { type: 'startEncounter', encounterPackIds: ['graveyard.solo-a', 'graveyard.solo-b', 'graveyard.solo-c', 'graveyard.duo', 'graveyard.duo-mixed'] },
        placement: { source: 'threatTerritory', count: [1, 3], minCampDistance: 180, minLandmarkDistance: 48, minSpacing: 96, requireWalkableEscape: true, maxPerTerritory: 1 },
        presentation: { nameKey: 'hazard.graveyard.grave_ambush.name', descKey: 'hazard.graveyard.grave_ambush.desc', warningKey: 'hazard.graveyard.grave_ambush.warning', hitKey: 'hazard.graveyard.grave_ambush.hit', ambushKey: 'hazard.graveyard.grave_ambush.ambush' },
        visual: { glyph: 'ambush', palette: { element: '#d9d6c7', clue: '#635c67' } }
      }
    ],
    locales: {
      'zh-CN': {
        'monster.hound_grave.name': '墓穴猎犬', 'monster.hound_grave.desc': '披覆骨甲、追逐生者气息的猎犬。', 'combat.lore.hound_grave': '暗紫魂火在它的骨甲缝隙间游走。', 'combat.ability.hound_grave_basic.name': '骨牙撕咬', 'combat.ability.hound_grave_withering_bite.name': '衰败之咬', 'combat.trait.hound_grave.name': '墓园猎性',
        'monster.ghoul_gravedigger.name': '食尸掘墓者', 'monster.ghoul_gravedigger.desc': '用旧铁锹唤醒地下残骸的食尸鬼。', 'combat.lore.ghoul_gravedigger': '它记得每一块松动墓土下埋着什么。', 'combat.ability.ghoul_gravedigger_basic.name': '铁锹横扫', 'combat.ability.ghoul_gravedigger_unearthed_grasp.name': '掘地之握', 'combat.trait.ghoul_gravedigger.name': '墓土劳作',
        'monster.summon.crawling_hand.name': '爬行断手', 'monster.summon.crawling_hand.desc': '拖着石棺锁链的骸骨仆从。', 'combat.lore.summon.crawling_hand': '锁链与枯骨都没有锋利断面。', 'combat.ability.summon.crawling_hand_basic.name': '骨指抓挠', 'combat.ability.summon_crawling_hand_ankle_grab.name': '踝部抓缚', 'combat.trait.summon.crawling_hand.name': '低伏追猎',
        'combat.status.graveyard_clutched.name': '骸手抓缚',
        'hazard.graveyard.soul_seal.name': '噬魂墓印', 'hazard.graveyard.soul_seal.desc': '墓碑环中的石印会持续抽离生命。', 'hazard.graveyard.soul_seal.warning': '墓印的紫色刻痕依次亮起。', 'hazard.graveyard.soul_seal.hit': '噬魂墓印正在侵蚀队伍。',
        'hazard.graveyard.grave_ambush.name': '墓土苏醒', 'hazard.graveyard.grave_ambush.desc': '土缝与倾倒烛火暴露了埋伏。', 'hazard.graveyard.grave_ambush.warning': '墓碑后的骨白反光正在靠近。', 'hazard.graveyard.grave_ambush.hit': '墓地伏兵已经现身。', 'hazard.graveyard.grave_ambush.ambush': '沉睡在墓土中的敌人苏醒了。'
      },
      en: {
        'monster.hound_grave.name': 'Grave Hound', 'monster.hound_grave.desc': 'A bone-armored hound that tracks the breath of the living.', 'combat.lore.hound_grave': 'Violet soul fire runs between the plates of its armor.', 'combat.ability.hound_grave_basic.name': 'Bone Fang', 'combat.ability.hound_grave_withering_bite.name': 'Withering Bite', 'combat.trait.hound_grave.name': 'Graveyard Hunter',
        'monster.ghoul_gravedigger.name': 'Ghoul Gravedigger', 'monster.ghoul_gravedigger.desc': 'A ghoul that wakes buried remains with an old shovel.', 'combat.lore.ghoul_gravedigger': 'It remembers what lies beneath every patch of loose soil.', 'combat.ability.ghoul_gravedigger_basic.name': 'Shovel Sweep', 'combat.ability.ghoul_gravedigger_unearthed_grasp.name': 'Unearthed Grasp', 'combat.trait.ghoul_gravedigger.name': 'Grave Labor',
        'monster.summon.crawling_hand.name': 'Crawling Hand', 'monster.summon.crawling_hand.desc': 'A skeletal servant dragging a length of coffin chain.', 'combat.lore.summon.crawling_hand': 'Neither chain nor bone bears a gruesome edge.', 'combat.ability.summon.crawling_hand_basic.name': 'Bone Scratch', 'combat.ability.summon_crawling_hand_ankle_grab.name': 'Ankle Grab', 'combat.trait.summon.crawling_hand.name': 'Low Pursuit',
        'combat.status.graveyard_clutched.name': 'Clutched',
        'hazard.graveyard.soul_seal.name': 'Soul-Devouring Seal', 'hazard.graveyard.soul_seal.desc': 'A grave-ring seal drains life in repeated pulses.', 'hazard.graveyard.soul_seal.warning': 'Violet marks ignite around the seal.', 'hazard.graveyard.soul_seal.hit': 'The soul seal is draining the party.',
        'hazard.graveyard.grave_ambush.name': 'Grave Ambush', 'hazard.graveyard.grave_ambush.desc': 'Cracked soil and fallen candles betray the ambush.', 'hazard.graveyard.grave_ambush.warning': 'Bone-white glints move behind the headstones.', 'hazard.graveyard.grave_ambush.hit': 'The graveyard attackers are exposed.', 'hazard.graveyard.grave_ambush.ambush': 'Enemies rise from the grave soil.'
      }
    },
    boss: {
      id: 'necromancer', mods: { hp: 1, atk: 1.08 }, damageType: 'necrotic', range: 78, scale: 1.2,
      abilityIds: ['necromancer.shadow_bolt', 'necromancer.withering_curse', 'necromancer.bone_barrier_action'],
      abilities: [
        {
          id: 'necromancer.shadow_bolt', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 26, animationLockTicks: 12, cooldownTicks: 130, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'single', range: 80 },
          effects: [D('necrotic', 1.7)], aiHints: { priority: 76 },
          presentation: { nameKey: 'combat.ability.shadow_bolt.name', icon: 'icon_skill_fire' }
        },
        {
          id: 'necromancer.withering_curse', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 12, cooldownTicks: 190, queueable: true, interruptible: true },
          target: { relation: 'hostile', shape: 'circle', range: 72, radius: 44, maxTargets: 4 },
          telegraph: { shape: 'circle', radius: 44, expectedDamagePct: 0.12 },
          effects: [D('necrotic', 1.05), { type: 'applyStatus', statusId: 'graveyard.withered' }],
          aiHints: { priority: 82 }, presentation: { nameKey: 'combat.ability.withering_curse.name', icon: 'icon_skill_poison' }
        },
        {
          id: 'necromancer.bone_barrier_action', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 12, cooldownTicks: 300, queueable: true, interruptible: true },
          target: { relation: 'self', shape: 'single' },
          effects: [
            { type: 'shield', coefficient: 0.22, durationTicks: 140, target: { relation: 'self', shape: 'single' } },
            { type: 'applyStatus', statusId: 'necromancer.bone_barrier', target: { relation: 'self', shape: 'single' } }
          ],
          aiHints: { priority: 116, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.bone_barrier.name', icon: 'icon_skill_guard' }
        }
      ],
      traitModifiers: [{ stat: 'ward', phase: 'multiply', operation: 'multiply', value: 1.18 }],
      phaseStatusId: 'necromancer.phase2'
    }
  }));
})();
