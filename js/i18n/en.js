/* ============================================================
 * i18n/en.js — English language pack
 * ============================================================ */
(function () {
  'use strict';
  Game.i18n.addPack('en', {
    ui: {
      tab: { battle: 'Battle', char: 'Hero', inv: 'Bag', skills: 'Skills', map: 'Map', settings: 'Options' },
      sub: { attr: 'Stats', stats: 'Records', ach: 'Feats', bag: 'Bag', shop: 'Shop' },
      huntGauge: 'Hunt',
      bossHunt: 'Hunt Boss',
      bossHuntReady: 'The hunt gauge is full. Start the boss fight.',
      bossHuntLocked: 'Defeat {n} more monsters to hunt the boss',
      bossHuntBusy: 'A boss fight cannot be started right now',
      autoBossShort: 'AUTO',
      autoBossHint: 'Automatically challenge the boss when the hunt gauge is full and your HP is safe',
      autoBossAria: 'Automatic boss hunt is {state}',
      autoBossOn: 'Automatic boss hunt enabled',
      autoBossOff: 'Automatic boss hunt disabled; start it manually when the gauge is full',
      switchOn: 'on',
      switchOff: 'off',
      restGauge: 'Rested {p}%',
      regionKicker: 'EXPEDITION {n}/{total}',
      campKicker: 'FRONTIER CAMP · REGION {n}',
      worldSeed: 'World Seed',
      worldSeedHint: 'Layout ID shared by all eight regions',
      copySeed: 'Copy',
      seedCopied: 'World seed {seed} copied',
      updateAvailable: 'Version {version} is ready. Tap to update safely.',
      updateApplying: 'Saving expedition progress and updating…',
      controlTitle: 'CONTROL',
      controlAuto: 'AUTO',
      controlManual: 'MANUAL',
      controlAria: 'Switch control mode; currently {mode}',
      controlAutoHint: 'Automatic pathfinding and combat',
      controlManualHint: 'Tap ground or use arrow keys; tap a monster to engage',
      controlChangedAuto: 'Auto control: pathfinding and combat resumed',
      controlChangedManual: 'Manual control: tap ground or use arrow keys; tap a monster to engage',
      camp: 'Return to Camp',
      campHint: 'Walk back to camp and recover',
      teleportCamp: 'Warp to Camp',
      teleportCampHint: 'Camp is far away; return by warp',
      bossCampReturn: 'Retreat to Camp',
      bossCampReturnHint: 'Leave the boss fight safely; the boss withdraws and half the hunt progress remains',
      cancelCampWarp: 'Cancel Warp',
      cancelCampWarpHint: 'Cancel the warp and return to battle',
      cancelCampReturn: 'Cancel Return',
      cancelCampReturnHint: 'Stop returning to camp and resume battle',
      breakCamp: 'Break Camp',
      breakCampHint: 'End the rest and return to battle',
      restBuff: 'Rested',
      restingChip: 'Campfire rest · Rapid recovery',
      recovering: 'Regrouping… {s}s',
      bossAppear: '⚔ Boss Hunt: {name} appears!',
      bossKilled: 'Boss defeated!',
      bossFailed: 'The boss withdrew. Refill the hunt gauge to retry!',
      bossRetreated: 'Boss fight safely left. The boss withdrew; half the hunt progress remains.',
      bossFirstKill: 'First-kill reward: {n} Crystals',
      heroDown: 'You fell… retreating to camp',
      levelUp: '⬆ Level Up! Lv.{lv}',
      achUnlocked: 'Feat achieved: {name}',
      regionUnlocked: 'New region unlocked: {name}',
      regionReopened: 'The road to {name} has reopened',
      autoAdvanced: 'Auto-advance → {name}',
      fellback: 'Defeated 3 times in a row — fell back to {name}. Upgrade gear & skills first!',
      finalRegionLostToast: 'The Demon Castle fell. You retreated to {name}; defeat this region boss again to return.',
      regionPurified: 'REGION PURIFIED',
      travelNewRegion: 'NEW REGION',
      travelRegionArrived: 'REGION ARRIVAL',
      travelRouteTitle: 'GUILD EXPEDITION ROUTE',
      travelDestination: 'Traveling to {name}',
      travelCountdown: 'Departing automatically in {s}s',
      travelDeparting: 'The travel sigil is converging',
      travelCrossing: 'Crossing the region boundary',
      travelArriveRest: 'Camp reached — break camp when ready',
      travelArriveBattle: 'Scouting complete — the hunt resumes',
      travelReward: 'First-clear reward · {n} Crystals',
      travelFirstEntry: 'Unknown ground ahead; a camp has been established',
      travelRouteReady: 'Guild route calibrated',
      travelNow: 'Depart Now',
      stayRegion: 'Stay Here',
      travelCancelHint: 'No input required; press Esc to cancel this trip',
      travelFastForwardHint: 'Tap the scene to finish the arrival shot',
      regionOrdinal: 'REGION {n} · {name}',
      recoveryTitle: 'SOUL REGROUPING',
      recoveryFallbackTitle: 'FRONTLINE RETREAT',
      finalRegionLostTitle: 'DEMON CASTLE LOST',
      recoveryAtCamp: 'The campfire still waits',
      recoveryFallback: 'Retreating to {name}',
      finalRegionRetreat: 'Retreating to {name}',
      recoveryDown: 'Consciousness is fading',
      recoverySoul: 'Your soul is returning to camp',
      recoveryCamp: 'The camp beacon has answered',
      recoveryRiseRest: 'Regrouped — resting at camp',
      recoveryRiseBattle: 'Regrouped — ready to fight',
      recoveryBossNote: 'The boss withdrew; half the hunt progress remains',
      recoveryNoPenalty: 'No experience, gold, or loot is lost',
      finalRegionRelockNote: 'The Demon Castle is sealed again; defeat this region boss to reopen the road',
      recoveryFastForwardHint: 'Tap the scene to hasten the return',
      rareDrop: 'Obtained {name}!',
      gotItem: 'Got {name}',
      bought: 'Purchased',
      exchanged: 'Exchange complete',
      cantAfford: 'Not enough currency',
      tradeUnavailableTitle: 'Trading Unavailable',
      tradeOutsideCamp: 'The shop only serves the camp area of the current map, {region}.',
      tradeBusy: 'Trading pauses during travel, warping, and regrouping. Settle at camp first.',
      tradeNoArea: 'This map has no available trading area.',
      tradeReturnCamp: 'Return to Current Camp',
      tradeCampAccess: 'Inside the {region} camp trade area. Standard supplies and boons are available.',
      tradeShopOpenHint: 'You are inside a trading area',
      tradeShopLockedHint: 'Only available inside the current map camp',
      tradeUnavailableToast: 'You have left this trading area',
      tradeNoOffers: 'This trading area has no offers right now.',
      tradeLocationKicker: 'Current trading post',
      tradeLeftArea: 'You left trading range. Offers are locked until you return.',
      tradeLockedBrowse: 'Browsing out of range',
      tradeDirectionDistance: 'The trading post is {direction}, {distance}px away.',
      tradeGoTo: 'Go to Trading Post',
      closeTrade: 'Close',
      tradeHud: 'Trade · {name}',
      tradeHudAria: 'Open trading at {name}',
      exchangeAction: 'Exchange',
      tradeSellLow: 'Sell all Common and Fine gear',
      tradeSellEstimate: '{n} items · estimated {g} gold',
      tradeSalvageLegend: 'Dismantle all unequipped Legendary gear',
      tradeSalvageEstimate: '{n} items · estimated {c} crystals',
      tradeSalvaged: 'Dismantled {n} Legendary items for {c} crystals',
      sellAction: 'Sell',
      salvageAction: 'Dismantle',
      sellLow: 'Sell Common+Fine',
      soldN: 'Sold {n} items, +{g} gold',
      nothingToSell: 'No low-rarity gear to sell',
      bagEmpty: 'Your bag is empty — go hunt some monsters!',
      potionAuto: 'Auto-potion under {p}% HP',
      quickPotion: 'Potion',
      materialsTitle: '─ Material Pouch (No Bag Slots) ─',
      autoCampReturning: 'Rested bonus depleted — returning to camp',
      equip: 'Equip',
      unequip: 'Unequip',
      equippedTag: 'Equipped',
      sellFor: 'Sell +{g}',
      salvage: 'Salvage +{n}💎',
      compareWith: 'Compared to equipped:',
      score: 'Power',
      compareOverall: 'Overall',
      compareOffense: 'Offense',
      compareSurvival: 'Survival',
      compareEconomy: 'Rewards',
      slotLocked: 'Locked',
      slotUnlocked: 'Auto',
      lockSlot: 'Lock this slot',
      unlockSlot: 'Unlock this slot',
      lockSlotNamed: 'Lock {slot} slot',
      unlockSlotNamed: 'Unlock {slot} slot',
      lockedSlotHint: 'This slot is locked and will not be changed automatically.',
      autoSkillSummary: '✨ Auto-allocated {n} skill points',
      autoGearSummary: '✨ Auto-equipped {n} items (overall +{p}%)',
      autoBothSummary: '✨ Auto-build: {s} skill points, {g} gear changes',
      itemLevel: 'iLv {lv}',
      confirmTitle: 'Confirm',
      ok: 'OK',
      cancel: 'Cancel',
      actorActionsTitle: '{name}',
      actorObserve: 'Observe',
      actorAttack: 'Attack',
      actorAttackConfirm: 'Attacking {name} will turn it and nearby allies hostile. Continue?',
      actorAttackQueued: 'Attack command submitted',
      actorTargetUnavailable: 'The target has left or cannot be interacted with',
      upgrade: 'Upgrade',
      maxed: 'MAX',
      skillUp: '{name} upgraded!',
      skillActive: 'Active · CD {cd}s',
      skillPassive: 'Passive',
      skillNotLearned: 'Not learned',
      skillBaseNote: '(Casts at base power with 0 points; every invested point improves it)',
      needLevel: 'Requires hero Lv.{lv}',
      spLeft: 'Skill Points: {n}',
      expProgress: 'EXP Progress',
      growthNote: 'Growth: level-ups auto-raise all stats and fully heal (idle-friendly). Spend skill points in the Skills tab.',
      achProgress: 'Feats: {a} / {b}',
      gold: 'Gold',
      crystal: 'Crystals',
      current: 'Here',
      locked: 'Locked',
      finalRegionRelocked: 'Lost · Reunlock Required',
      cleared: 'Cleared',
      recommendLv: 'Suggested Lv.{lv}+',
      goRegion: 'Travel',
      movedTo: 'Arrived at {name}',
      prologueTip: 'Tap to continue ▶',
      /* Classes */
      classTitle: '⚔ Choose Your Class',
      classHint: 'Your class defines growth and combat style. This choice is permanent.',
      classHint2: '◀ ▶ or swipe to browse · choice is permanent',
      classPick: 'Pick',
      classConfirm: 'Begin the hunt as a {name}? (Cannot be changed)',
      csSkills: '─ Skills ─',
      csConfirmBtn: 'Begin as {name}',
      noClassYet: 'No class chosen yet',
      /* Title screen */
      titleLogo: 'Fantasy Idle',
      titleStart: 'New Game',
      titleEnter: 'ENTER',
      titleViewCamp: 'Return to camp view',
      titleArchiveKicker: 'ADVENTURERS GUILD · REGISTRY',
      titleArchive: 'EXPEDITION RECORD',
      titleSlotCount: '{current} / {total}',
      titleSlotHint: 'Choose a record to enter Lucia',
      titleLanguage: 'Switch interface language',
      titleSlotHero: 'Lv.{level} {className}',
      titleSlotLocation: 'Camped at {region}',
      titleSlotProgress: '{time} · Route {current}/{total}',
      titleContinue: 'CONTINUE',
      titleSlotDraft: 'UNFINISHED REGISTRATION',
      titleSlotDraftDesc: 'Class and guild oath await confirmation',
      titleSlotSeed: 'World seed {seed}',
      titleResumeDraft: 'RESUME',
      titleSlotEmpty: 'UNCHARTED EXPEDITION',
      titleSlotEmptyDesc: 'The guild has a first commission waiting',
      titleSlotNewWorld: 'A new route will be forged',
      titleCreate: 'NEW GAME',
      titleBeginKicker: 'LUCIA · A NEW JOURNEY',
      titleBeginTitle: 'NEW GAME',
      titleBeginDesc: 'Choose your calling, take the guild oath, and forge a route of your own',
      titleBeginAction: 'BEGIN',
      titleNewGame: 'NEW GAME',
      titleNewGameSub: 'OVERWRITES THIS RECORD',
      titleNewGameConfirm: 'Starting a new game will overwrite the current single-slot expedition. Existing progress cannot be recovered. Issue a new record?',
      titleDeleteSave: 'Delete this save',
      titleDeleteConfirm: 'Deleting this save permanently erases the character, equipment, route, and all expedition progress. This cannot be undone. Delete it?',
      titleLastSave: 'Saved {time}',
      titleLocalSave: 'Local autosave',
      titleOpeningNew: 'The guild is issuing your travel writ',
      titleOpeningSave: 'Synchronizing expedition record',
      adventureBegin: '✦ The Adventure Begins ✦',
      miss: 'MISS',
      poisoned: 'Poisoned',
      dim: { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD', burst: 'Burst' },
      trait: {
        melee: 'Melee', ranged: 'Ranged', tank: 'Sturdy', crit: 'Crit',
        dodge: 'Evasive', burst: 'Burst', sustain: 'Sustain', treasure: 'Treasure'
      }
    },

    stat: {
      hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD',
      crit: 'Crit Rate', critDmg: 'Crit DMG', goldMul: 'Gold Bonus', expMul: 'EXP Bonus',
      dodge: 'Dodge', lifesteal: 'Lifesteal', cdr: 'CD Reduction', healPow: 'Healing Power',
      attackType: 'Attack Type'
    },

    statPage: {
      kills: 'Total Kills', bossKills: 'Boss Kills', goldEarned: 'Gold Earned', expEarned: 'EXP Earned',
      drops: 'Gear Drops', legendaries: 'Legendaries', potions: 'Potions Used', deaths: 'Times Fallen',
      maxHit: 'Highest Hit', sells: 'Items Sold', playSec: 'Time Played', restSec: 'Time Rested',
      offlineSec: 'Offline Time', highestRegion: 'Farthest Region',
      pickups: 'Ground Pickups', gathers: 'Gathered Nodes',
      materials: 'Materials Earned', chests: 'Chests Opened'
    },

    slot: { weapon: 'Weapon', armor: 'Armor', ring: 'Ring' },

    rarity: { r0: 'Common', r1: 'Fine', r2: 'Rare', r3: 'Epic', r4: 'Legendary' },

    item: {
      pattern: '{mat} {base}',
      mat: { 1: 'Copper', 2: 'Iron', 3: 'Steel', 4: 'Silver', 5: 'Mithril', 6: 'Flamegold', 7: 'Starlight', 8: 'Dragonsoul' },
      base: { weapon: 'Sword', armor: 'Armor', ring: 'Ring' },
      weapon: { fighter: 'Sword', rogue: 'Dagger', mage: 'Staff', cleric: 'Mace', ranger: 'Longbow' },
      potion_small: { name: 'Small Healing Potion' },
      potion_large: { name: 'Large Healing Potion' },
      healDesc: 'Restores {p}% of max HP',
      usableDesc: 'An active-use consumable',
      useAria: 'Use {name}; {count} remaining',
      quickAria: 'Quick-use {name}; {count} remaining; {cd}s cooldown',
      quickHint: 'Use the next healing potion now',
      reject: {
        full: 'HP is already full', empty: 'No potion available',
        cooldown: 'Potion cooldown: {s}s remaining',
        dead: 'Items cannot be used while down',
        busy: 'Items cannot be used during this sequence',
        missing: 'This item cannot be used', 'not-ready': 'The expedition has not begun',
        unsupported: 'This effect is not available', failed: 'Item use failed'
      }
    },

    material: {
      herb: 'Meadow Herb', berry: 'Red Berry', mushroom: 'Mistcap Mushroom', resin: 'Ancient Resin',
      ore: 'Iron Ore', crystal_cluster: 'Vein Crystal', ghost_flower: 'Ghost Flower', grave_dust: 'Grave Dust',
      ice_crystal: 'Ice Crystal', frost_herb: 'Frostleaf', fire_core: 'Fire Core', obsidian: 'Obsidian',
      rune_stone: 'Rune Stone', aether_shard: 'Aether Shard',
      miasma_crystal: 'Miasma Core', demon_horn: 'Demon Horn'
    },

    'class': {
      fighter: { name: 'Fighter', desc: 'An armored bulwark of the front line. Peerless survival, steady damage — the safest idle pick.' },
      rogue: { name: 'Rogue', desc: 'A blade that walks in shadow. Blinding speed and crits, dodging fatal blows.' },
      mage: { name: 'Wizard', desc: 'A wielder of fire and frost. Ranged dominance and the biggest burst — in a very thin robe.' },
      cleric: { name: 'Cleric', desc: 'A servant of the Light. Self-healing melee whose blessings and lifesteal outlast any foe.' },
      ranger: { name: 'Ranger', desc: 'A hunter of the wilds. Steady ranged damage with an instinct for treasure.' }
    },

    affix: {
      atk_pct: 'ATK', hp_pct: 'HP', atk_flat: 'ATK', hp_flat: 'HP', def_flat: 'DEF',
      spd: 'SPD', crit: 'Crit Rate', critdmg: 'Crit DMG', gold_pct: 'Gold Gain', exp_pct: 'EXP Gain'
    },

    skill: {
      /* Fighter */
      ft_heavy: { name: 'Heavy Slash', desc: 'A crushing blow dealing {v}% ATK damage.' },
      ft_tough: { name: 'Toughness', desc: 'Passive: DEF +{v}%, max HP +{v2}%.' },
      ft_whirl: { name: 'Whirlwind', desc: 'Spin and hit all nearby enemies for {v}% ATK damage.' },
      ft_mastery: { name: 'Weapon Mastery', desc: 'Passive: ATK +{v}%.' },
      ft_warcry: { name: 'War Cry', desc: 'A rallying roar: ATK and DEF +{v}% for {s}s.' },
      ft_second: { name: 'Second Wind', desc: 'Passive: regenerate an extra {v}% max HP per second in combat.' },
      /* Rogue */
      rg_backstab: { name: 'Backstab', desc: 'Strike a weak point for {v}% ATK damage with +25% crit chance.' },
      rg_swift: { name: 'Swiftness', desc: 'Passive: SPD +{v}%.' },
      rg_poison: { name: 'Poison Blade', desc: 'Deal {v}% damage and inject venom dealing {v2}% ATK over {s}s.' },
      rg_deadly: { name: 'Deadly Precision', desc: 'Passive: Crit Rate +{v}%, Crit DMG +{v2}%.' },
      rg_flurry: { name: 'Blade Flurry', desc: 'A storm of daggers hits all nearby enemies for {v}% ATK damage.' },
      rg_evasion: { name: 'Evasion', desc: 'Passive: Dodge +{v}% (cap 35%).' },
      /* Wizard */
      mg_fireball: { name: 'Fireball', desc: 'Hurl a blazing orb dealing {v}% ATK damage.' },
      mg_mastery: { name: 'Spell Mastery', desc: 'Passive: spell power +{v}%.' },
      mg_nova: { name: 'Frost Nova', desc: 'Detonate a nova at the target, dealing {v}% ATK damage in an area.' },
      mg_surge: { name: 'Mana Surge', desc: 'Passive: skill cooldowns reduced by {v}% (cap 40%).' },
      mg_barrier: { name: 'Arcane Barrier', desc: 'Raise a barrier absorbing damage equal to {v}% of max HP.' },
      mg_armor: { name: 'Mage Armor', desc: 'Passive: HP and DEF +{v}% each.' },
      /* Cleric */
      cl_smite: { name: 'Holy Strike', desc: 'Smite for {v}% ATK damage, healing for {v2}% of damage dealt.' },
      cl_faith: { name: 'Faith', desc: 'Passive: HP +{v}%, DEF +{v2}%.' },
      cl_prayer: { name: 'Healing Prayer', desc: 'Auto-cast below 75% HP, restoring {v}% max HP.' },
      cl_bless: { name: 'Blessing of Light', desc: 'Passive: all healing received +{v}% (including potions).' },
      cl_nova: { name: 'Holy Nova', desc: 'A burst of light deals {v}% damage around you and heals {v2}% HP.' },
      cl_radiance: { name: 'Radiance', desc: 'Passive: attacks lifesteal {v}%.' },
      /* Ranger */
      rn_power: { name: 'Power Shot', desc: 'Loose a mighty arrow dealing {v}% ATK damage.' },
      rn_precision: { name: 'Precision', desc: 'Passive: Crit Rate +{v}%.' },
      rn_multi: { name: 'Multi Shot', desc: 'A volley blankets the target area for {v}% ATK damage.' },
      rn_survival: { name: 'Survivalist', desc: 'Passive: HP +{v}%, SPD +{v2}%.' },
      rn_hawk: { name: 'Hawk Eye', desc: 'Lock on: ATK +{v}% and Crit Rate +{v2}% for {s}s.' },
      rn_treasure: { name: 'Treasure Sense', desc: 'Passive: gold gain +{v}%, gear drop rate +{v2}%.' }
    },

    monster: {
      slime_green: { name: 'Green Slime' }, wolf_gray: { name: 'Plains Wolf' }, slime_king: { name: 'Giant Slime King' },
      mushroom_toxic: { name: 'Toxic Shroom' }, treant_sapling: { name: 'Treant Sapling' }, elder_treant: { name: 'Elder Treant' },
      cave_bat: { name: 'Cave Bat' }, kobold_miner: { name: 'Kobold Miner' }, stone_golem: { name: 'Stone Golem' },
      skeleton_soldier: { name: 'Skeleton Soldier' }, ghost_wisp: { name: 'Wandering Wisp' }, necromancer: { name: 'Necromancer' },
      ice_wolf: { name: 'Snow Wolf' }, yeti_small: { name: 'Young Yeti' }, frost_giant: { name: 'Frost Giant' },
      fire_imp: { name: 'Fire Imp' }, lava_lizard: { name: 'Lava Lizard' }, flame_demon: { name: 'Flame Demon' },
      guardian_orb: { name: 'Arcane Orb' }, harpy: { name: 'Harpy' }, ruin_guardian: { name: 'Ruin Guardian' },
      demon_soldier: { name: 'Demon Soldier' }, gargoyle: { name: 'Gargoyle' }, demon_lord: { name: 'Demon Lord Berial' }
    },

    region: {
      grassland: { name: 'Novice Meadow', desc: 'A peaceful meadow on the edge of Lucia — the miasma has not reached here yet.' },
      forest: { name: 'Misty Forest', desc: 'An ancient forest shrouded in fog; the trees whisper, twisted by miasma.' },
      mine: { name: 'Abandoned Mine', desc: 'Miners fled the miasma; monsters now nest in the tunnels.' },
      graveyard: { name: 'Haunted Graveyard', desc: 'The miasma woke the sleepers — willow-wisps drift between tombstones.' },
      snowpass: { name: 'Snowy Pass', desc: 'The pass into the heartland; icy claws lurk within the blizzard.' },
      lavacave: { name: 'Lava Cavern', desc: 'The earthveins churn with the Demon Lord\'s power; magma never rests.' },
      skyruins: { name: 'Floating Ruins', desc: 'Sky-isles of an ancient civilization, whose wardens still keep their vow.' },
      darkcastle: { name: 'Demon Castle', desc: 'The source of the miasma. Slay the Demon Lord and end this calamity!' }
    },

    decor: {
      grassland: {
        clover: 'Clover Patch', wildWheat: 'Wild Wheat', dandelions: 'Dandelion Cluster',
        burrow: 'Rabbit Burrow', fallenBranch: 'Fallen Branch', fairyRing: 'Fairy Ring'
      },
      forest: {
        mossyLog: 'Mossy Fallen Log', redShrooms: 'Red Mushroom Cluster', conesAcorns: 'Cones and Acorns',
        rootKnot: 'Exposed Root Knot', leafPile: 'Fallen Leaf Pile', fernStones: 'Fern and Stone Patch'
      },
      mine: {
        brokenRail: 'Broken Mine Rail', coalPile: 'Coal Pile', discardedPick: 'Discarded Pickaxe',
        lantern: 'Mining Lantern', timberScraps: 'Splintered Timbers', copperRubble: 'Copper Ore Rubble'
      },
      graveyard: {
        crackedSlab: 'Cracked Grave Slab', wiltedFlowers: 'Wilted Grave Flowers', chainCoil: 'Rusty Chain Coil',
        urnShards: 'Funeral Urn Shards', ectoplasm: 'Ectoplasm Puddle', freshMound: 'Fresh Grave Mound'
      },
      snowpass: {
        iceSpikes: 'Ice Spike Cluster', snowBones: 'Snow-covered Bones', frostShrub: 'Frost Shrub',
        trailCairn: 'Trail Cairn', frozenPuddle: 'Frozen Puddle', brokenSled: 'Broken Sled'
      },
      lavacave: {
        emberVent: 'Ember Vent', sulfurCrystals: 'Sulfur Crystal Cluster', lavaCrust: 'Cooled Lava Crust',
        basaltShards: 'Basalt Shard Pile', scorchedBones: 'Scorched Bones', ashMound: 'Ash Mound'
      },
      skyruins: {
        runeTile: 'Glowing Rune Tile', gearFragment: 'Ancient Gear Fragment', marbleRubble: 'Sky-marble Rubble',
        aetherMotes: 'Aether Motes', cloudGrass: 'Cloud Grass', mosaic: 'Azure-gold Mosaic'
      },
      darkcastle: {
        ritualRune: 'Crimson Ritual Rune', ironChain: 'Iron Chain Coil', bannerScrap: 'Torn Black Banner',
        clawMarks: 'Demon Claw Marks', purpleFungus: 'Purple Miasma Fungus', gargoyleFragment: 'Gargoyle Fragment'
      }
    },

    ach: {
      kill_100: { name: 'First Steps', desc: 'Slay 100 monsters' },
      kill_1000: { name: 'Subjugator', desc: 'Slay 1,000 monsters' },
      kill_10000: { name: 'Monster Bane', desc: 'Slay 10,000 monsters' },
      boss_1: { name: 'First Triumph', desc: 'Defeat 1 boss' },
      boss_20: { name: 'Boss Hunter', desc: 'Defeat bosses 20 times' },
      level_10: { name: 'Rising Star', desc: 'Reach level 10' },
      level_30: { name: 'Seasoned Adventurer', desc: 'Reach level 30' },
      level_60: { name: 'Living Legend', desc: 'Reach level 60' },
      gold_100k: { name: 'Nest Egg', desc: 'Earn 100K gold in total' },
      gold_10m: { name: 'Filthy Rich', desc: 'Earn 10M gold in total' },
      drops_50: { name: 'Gear Collector', desc: 'Loot 50 pieces of gear' },
      drops_500: { name: 'Walking Armory', desc: 'Loot 500 pieces of gear' },
      legend_1: { name: 'Stuff of Legends', desc: 'Obtain 1 legendary item' },
      region_4: { name: 'Into the Heartland', desc: 'Reach the 4th region' },
      region_8: { name: 'Gates of the Demon Castle', desc: 'Reach the Demon Castle' },
      rest_30m: { name: 'Campfire Bond', desc: 'Rest for 30 minutes in total' },
      play_2h: { name: 'Immersed', desc: 'Play for 2 hours in total' },
      potion_50: { name: 'Potion Enjoyer', desc: 'Use 50 potions' },
      pickup_100: { name: 'Nothing Wasted', desc: 'Pick up 100 ground drops' },
      gather_50: { name: 'Wild Harvester', desc: 'Complete 50 gathering actions' },
      material_300: { name: 'Material Stockpile', desc: 'Earn 300 materials' },
      chest_20: { name: 'Treasure Expert', desc: 'Open 20 random chests' }
    },

    tradeArea: { camp: 'Frontline Camp Supply', generic: 'Regional Trading Post' },

    tradeKind: {
      merchant: 'Camp Supply', exchange: 'Material Exchange',
      wander: 'Wandering Merchant', event: 'Event Stall'
    },
    merchant: {
      ui: {
        talk: 'Talk',
        trade: 'Browse Goods',
        roadGuild: 'Roadfarers Guild',
        leave: 'Leave',
        openShop: 'Open Shop',
        discovered: 'Wandering merchant discovered: {name}',
        expired: 'The wagon bell fades into the distance. The merchant has departed.',
        escaped: 'The smoke clears. The merchant is gone, but the account remains.',
        attackQueued: 'You draw your weapon. The guild will remember this choice.',
        attackConfirm: 'Attacking {name} grants no normal EXP or loot. The merchant will defend themselves, attempt to escape, and record lost trust and restitution with the guild. Attack anyway?',
        trust: 'Guild Trust',
        departure: 'Departure',
        hudChip: 'Merchant {time}',
        hudAria: 'Wandering merchant {direction}, departing in {time}',
        debt: 'Restitution Due',
        band: {
          favored: 'Trusted',
          normal: 'Regular',
          wary: 'Wary',
          refused: 'Trade Refused'
        },
        stock: '{n} left',
        soldOut: 'Sold Out',
        gearOfferDesc: '{rarity} · Lv.{level} · {affixes}',
        bundleOfferDesc: '{item} {stock} bundles remain this visit.',
        materialOfferDesc: 'A material bundle sorted on the road. {stock} remain this visit.',
        gotMaterial: 'Obtained {name} ×{n}',
        haggleTitle: 'Reopen the Crates',
        haggleDesc: 'Pay {fee} gold to reroll only the four travel shelves. Signature and rare stock stay fixed. Once, before buying.',
        haggle: 'Haggle {fee}',
        haggled: 'Repacked',
        haggleDone: 'The ordinary shelves have been repacked.',
        haggleUnavailable: 'The shelves cannot be repacked again this visit.',
        tradeRefused: 'The Guild Refuses Trade',
        restitutionDesc: 'Pay the full {debt} restitution to restore the minimum trade standing.',
        payRestitution: 'Pay {debt}',
        restitutionPaid: 'Restitution paid. Limited trade has resumed.',
        surrenderTitle: 'The Merchant Lowers Their Weapon',
        surrenderBody: 'They can no longer fight. This is not a normal kill and grants no EXP or loot. Spare them, or steal one ordinary item. Current restitution due: {debt}.',
        spare: 'Sheathe Your Weapon',
        spared: 'You chose restraint. Restitution due: {debt}',
        robOffer: 'Steal “{name}” · Add {debt} restitution',
        robConfirm: 'Stealing “{name}” costs more trust and adds twice its displayed price to restitution. Continue?',
        robbed: 'The theft was entered in the guild ledger. Restitution due: {debt}'
      }
    },
    direction: {
      north: 'to the north', south: 'to the south', east: 'to the east', west: 'to the west'
    },
    shopSec: {
      consume: 'Supplies', gear: 'Gear', perm: 'Boons', exchange: 'Exchange',
      merchantStaple: 'Staples', merchantTravel: 'Travel Shelf',
      merchantSignature: 'Signature', merchantRare: 'Rare Cabinet',
      sell: 'Buyback', other: 'Other'
    },

    shop: {
      shop_potion_small: { name: 'Minor Healing Potion', desc: 'Restores 40% HP. Auto-used at low HP.' },
      shop_potion_large: { name: 'Major Healing Potion', desc: 'Restores 85% HP. Used when minor potions run out.' },
      shop_gear_gold: { name: 'Gear Supply Crate', desc: 'One random piece of gear at your level, with slightly boosted quality.' },
      shop_gear_crystal: { name: 'Crystal Gear Chest', desc: 'Guaranteed Epic gear — 20% chance of Legendary!' },
      perm_atk: { name: 'Sigil of Might', desc: 'Permanent ATK +5%. Stacks up to 10.' },
      perm_hp: { name: 'Sigil of Vitality', desc: 'Permanent max HP +5%. Stacks up to 10.' },
      perm_gold: { name: 'Sigil of Fortune', desc: 'Permanent gold gain +10%. Stacks up to 10.' },
      perm_exp: { name: 'Sigil of Wisdom', desc: 'Permanent EXP gain +10%. Stacks up to 10.' },
      exchange_potion: { name: 'Herbal Brewing', desc: 'Turn low-tier field materials into 2 Small Healing Potions.' },
      exchange_gold: { name: 'Guild Material Order', desc: 'Submit woodland materials for a stable gold payment.' },
      exchange_gear: { name: 'Runic Gear Crate', desc: 'Trade advanced materials for current-level Rare-or-better gear.' },
      exchange_vitality: { name: 'Lesser Vitality Mark', desc: 'Temper advanced materials with crystals for permanent +1% HP, up to 5 ranks.' }
    },

    settings: {
      language: 'Language 语言',
      effects: 'Ambience & Terrain FX',
      effectsHint: 'Turn off to improve performance on low-end devices',
      groundLoot: 'Ground Loot Pickup',
      groundLootHint: 'Combat gear and potions land in the world; disabling safely banks every drop',
      autoCampRest: 'Automatic Camp Rest',
      autoCampRestHint: 'Auto control only: return when the rested bonus ends, then resume at full charge',
      potion: 'Auto-potion Threshold',
      autoAdvance: 'Auto-advance Regions',
      autoAdvanceHint: 'Automatically move to the next region after beating its boss',
      autoSkillUpgrade: 'Auto-allocate Skill Points',
      autoSkillUpgradeHint: 'Simulates offense, survival and rewards for every point, then chooses the best upgrade',
      autoEquip: 'Auto-evaluate & Equip Gear',
      autoEquipHint: 'Optimizes unlocked slots for your class and region; requires at least a 0.1% gain',
      sfx: 'Sound Effects',
      music: 'Music',
      comingSoon: 'Coming soon (no audio in this build)',
      saveSection: '─ Save Management ─',
      importPlaceholder: 'Paste a save string here to import, or press "Copy Save" to export',
      exportCopy: '📋 Copy Save',
      exported: 'Save copied / filled into the box',
      exportFile: '💾 Download Save',
      importBtn: '📥 Import Text',
      importFile: '📂 Import File',
      importEmpty: 'Paste a save string first',
      importConfirm: 'Importing will overwrite current progress. Continue?',
      importOk: 'Imported!',
      importBad: 'Invalid or corrupted save (checksum failed)',
      reset: '⚠ Reset Save',
      resetConfirm1: 'This will erase ALL progress. Sure?',
      resetConfirm2: 'Final check: really start over?',
      about: 'Fantasy Idle RPG v{v} · offline-first idle RPG<br>Pixel font: Fusion Pixel (falls back to system font)'
    },

    offline: {
      title: '⏰ Offline Report',
      away: 'You were away for {d}',
      restMode: 'Rested at camp while away',
      hpRestored: 'HP fully restored',
      buffFull: 'Rested buff maxed',
      restNote: 'No battle gains while resting offline. Break camp to resume hunting.',
      kills: 'Monsters slain',
      exp: 'EXP gained',
      gold: 'Gold gained',
      items: 'Gear looted',
      potions: 'Potions looted',
      claim: 'Claim'
    },

    ending: {
      dawnTitle: 'DAWN RETURNS',
      summaryTitle: 'JOURNEY\'S END',
      summarySubtitle: 'Dawn has returned to Lucia.',
      continue: 'Continue',
      restart: 'Begin Anew',
      restartConfirm: 'All progress from this adventure will be permanently erased. Begin anew?',
      statClass: 'Adventurer',
      statPlayTime: 'Time Played',
      statKills: 'Total Kills',
      statBossKills: 'Boss Kills',
      statWorldSeed: 'World Seed',
      classLevel: '{cls} · Lv.{level}',
      lines: {
        1: 'The final blow falls. Belial, the Demon Lord, breaks apart in the light of dawn.',
        2: 'The miasma above the Demon Castle scatters on the wind, and dawn returns to Lucia.',
        3: 'From meadow to snowpeak, from the lava caverns to the sky ruins, long-darkened lights kindle one by one.',
        4: 'The Adventurers\' Guild withdraws its highest writ and records your name in the Hall of Heroes.',
        5: 'You set out alone as the guild\'s newest adventurer. Now the whole continent sings of your return.',
        6: 'The subjugation is over. Yet if you so choose, your adventure may continue.'
      }
    },

    prologue: {
      1: 'The Demon Lord, sealed by heroes a thousand years ago, has awakened in the depths of the continent of Lucia…',
      2: 'Miasma spreads from the Demon Castle — meadow, forest, mine and snowpeak are falling one by one.',
      3: 'The Adventurers\' Guild has issued its highest writ of subjugation.',
      4: 'And you — the guild\'s newest lone adventurer — set out for one of four embattled frontiers.',
      5: 'Purify the eight lands, and storm the Demon Castle!'
    }
  });

  Game.i18n.addPack('en', {
    material: {
      moon_dew: 'Moon Dew', river_reed: 'River Reed', sunseed: 'Sunseed',
      silk_moss: 'Silk Moss', ancient_bark: 'Ancient Bark', glow_spore: 'Glow Spore',
      coal_shard: 'Coal Shard', cave_salt: 'Cave Salt', deep_geode: 'Deep Geode',
      bone_fragment: 'Bone Fragment', spirit_wax: 'Spirit Wax', nightshade: 'Nightshade',
      snow_lotus: 'Snow Lotus', frozen_ore: 'Frozen Ore', griffin_feather: 'Griffin Feather',
      magma_bloom: 'Magma Bloom', sulfur_stone: 'Sulfur Stone', ember_scale: 'Ember Scale',
      cloud_silk: 'Cloud Silk', star_metal: 'Star Metal', wind_crystal: 'Wind Crystal',
      void_ash: 'Void Ash', blood_rose: 'Blood Rose', fallen_sigil: 'Fallen Sigil'
    },
    explore: {
      mapTab: 'Region Map', codexTab: 'Region Codex',
      coverageLine: '{p}% explored', mapAria: 'Map of explored terrain',
      zoomOut: 'Zoom out', zoomIn: 'Zoom in', centerHero: 'Center on hero',
      readiness: 'Readiness', readinessHint: 'Readiness {value}/100. Find the lair and reach 70 to challenge its boss.',
      readyExplore: 'Explore', readyLandmarks: 'Landmarks', readyResources: 'Resources',
      readyCurios: 'Curios', readyGuardian: 'Guardian', readyLair: 'Lair',
      yes: 'Found', no: 'Unknown',
      landmarks: 'Key Landmarks', resources: 'Regional Resources', curios: 'Expedition Curios',
      ecology: 'Rare Ecology', registeredHint: 'Permanent records that survive expedition cycles',
      unknownEntry: 'Unknown record',
      commissions: 'Regional Commissions', exchange: 'Exchange',
      exchangeDone: 'Commission completed', exchangeFail: 'Not enough materials or upgrade cap reached',
      commission: { potions: 'Frontier Potion Supply', gold: 'Guild Material Order', gear: 'Relic Gear Coffer', perm: 'Survey Mastery' },
      strategy: { safe: 'Safe', balanced: 'Balanced', loot: 'Plunder' },
      strategyAria: 'Auto-expedition strategy: {strategy}. Activate to cycle.',
      aiIntent: 'AI intent',
      intent: {
        idle: 'Surveying', survival: 'Returning safely', combat: 'In combat',
        'player-order': 'Following order', loot: 'Recovering loot', frontier: 'Exploring frontier',
        discovery: 'Investigating', gather: 'Gathering', guardian: 'Hunting guardian',
        boss: 'Heading to lair', circuit: 'Gathering circuit', camp: 'Returning to camp'
      },
      searchClues: 'Search Clues', viewReadiness: 'View Readiness', goLair: 'Go to Lair', challengeBoss: 'Challenge Boss',
      curioTitle: 'Expedition Curio Found', curioUnknown: 'Nameless Curio',
      curioPrompt: 'Choose one effect for this expedition. The other is forfeited.',
      curio: {
        scout: 'Insight', scoutHint: 'Wider vision without direct loot gains',
        fortune: 'Fortune', fortuneHint: 'Better drops with the same route risk',
        ward: 'Ward', wardHint: 'Lower danger without faster exploration',
        haste: 'Haste', hasteHint: 'Move faster without weakening enemies'
      },
      threat: { patrol: 'Patrol Territory', nest: 'Monster Nest', ambush: 'Ambush Ground' },
      guardian: {
        grassland: 'Riverfang', forest: 'Moss-Crown Warden', mine: 'Deep-Shaft Foreman', graveyard: 'Gravegate Headsman',
        snowpass: 'Frostridge Sentry', lavacave: 'Forge Keeper', skyruins: 'Sky Arbiter', darkcastle: 'Blackgate Guard'
      },
      content: {
        grassland: {
          river_watch: 'Riverbend Watch', old_waystone: 'Old Kingroad Stone', windmill_ruin: 'Ruined Windmill', slime_nest: 'Great Slime Nest',
          sun_dial: 'Mossy Sundial', wanderer_pack: 'Lost Wanderer Pack', silver_bell: 'Silver Wind Bell',
          golden_hare: 'Golden Hare', brook_sprite: 'Brook Sprite'
        },
        forest: {
          whisper_grove: 'Whisper Grove', moss_shrine: 'Moss-Stone Shrine', sunken_bridge: 'Sunken Bridge', elder_hollow: 'Elder Hollow',
          root_crown: 'Root Crown', green_lantern: 'Evergreen Lantern', hunter_totem: 'Hunter Totem',
          moon_moth: 'Moon Moth', antler_owl: 'Antler Owl'
        },
        mine: {
          lift_ruin: 'Ruined Lift', echo_gallery: 'Echo Gallery', foreman_post: 'Foreman Post', golem_foundry: 'Golem Foundry',
          miners_dice: 'Miner Bone Dice', blue_lamp: 'Deep-Blue Lamp', sealed_charge: 'Sealed Charge',
          crystal_beetle: 'Crystal Beetle', blind_newt: 'Blind Cave Newt'
        },
        graveyard: {
          mourning_gate: 'Mourning Gate', bell_crypt: 'Bell Crypt', saint_court: 'Nameless Saint Court', black_mausoleum: 'Black Mausoleum',
          votive_chain: 'Votive Chain', empty_mask: 'Empty Mask', last_letter: 'Unsent Letter',
          candle_crow: 'Candle Crow', pale_fox: 'Pale Spirit Fox'
        },
        snowpass: {
          ice_bridge: 'Broken Ice Bridge', pilgrim_shelter: 'Pilgrim Shelter', signal_peak: 'Signal Peak', giant_crater: 'Giantfall Crater',
          warm_stone: 'Warm Stone', storm_compass: 'Storm Compass', white_banner: 'Blank White Banner',
          aurora_stag: 'Aurora Stag', snow_wisp: 'Snow Wisp'
        },
        lavacave: {
          basalt_gate: 'Basalt Gate', forge_ruin: 'Lost Forge', ember_lake: 'Ember Lake', demon_caldera: 'Demon Caldera',
          smiths_tongs: 'Undying Tongs', ash_hourglass: 'Ash Hourglass', cinder_idol: 'Cinder Idol',
          glass_salamander: 'Glass Salamander', ember_moth: 'Ember Moth'
        },
        skyruins: {
          broken_aqueduct: 'Broken Sky Aqueduct', star_archive: 'Star Archive', wind_bridge: 'Wind Bridge', guardian_core: 'Guardian Core',
          sky_chart: 'Floating Star Chart', singing_key: 'Singing Key', cloud_prism: 'Cloud Prism',
          ribbon_ray: 'Ribbon Ray', clockwork_swallow: 'Clockwork Swallow'
        },
        darkcastle: {
          fallen_bastion: 'Fallen Bastion', silent_throne: 'Silent Throne', miasma_well: 'Miasma Well', demon_keep: 'Demon Keep',
          oath_blade: 'Broken Oathblade', cracked_crown: 'Cracked Crown', dawn_reliquary: 'Dawn Reliquary',
          void_raven: 'Void Raven', red_moon_bat: 'Red-Moon Bat'
        }
      }
    },
    offline: {
      knownRoute: 'Known resource routes', routeLoops: 'Route circuits', materials: 'Gathered materials',
      noDiscoveries: 'Offline expeditions use known intelligence only and discover no new places.'
    }
  });
  Game.i18n.addPack('en', {
    weather: {
      label: 'Current weather',
      profile: {
        grassland: 'Grassland climate', forest: 'Canopy climate', mine: 'Mine microclimate',
        graveyard: 'Graveyard climate', snowpass: 'Alpine climate', lavacave: 'Lava-cave microclimate',
        skyruins: 'High-altitude climate', darkcastle: 'Demon Castle courtyard climate'
      },
      state: {
        grassland: {
          fair: 'Clear', showers: 'Showers', thunderstorm: 'Thunderstorm',
          highWind: 'High Winds', fairyMist: 'Fairy Mist'
        },
        forest: {
          gladeLight: 'Glade Light', canopyRain: 'Canopy Rain', muffledStorm: 'Muffled Storm',
          leafGusts: 'Leaf Gusts', spiritMist: 'Spirit Mist'
        },
        mine: {
          stillDust: 'Still Dust', vaultDrips: 'Vault Drips', deepTremorDust: 'Deep Tremor Dust',
          dustfall: 'Dustfall', crystalMist: 'Crystal Mist'
        },
        graveyard: {
          overcast: 'Overcast', coldRain: 'Cold Rain', graveStorm: 'Graveyard Storm',
          coldWind: 'Cold Wind', soulFog: 'Soul Fog'
        },
        snowpass: {
          frostClear: 'Frost Clear', snowfall: 'Snowfall', blizzard: 'Blizzard and Thundersnow',
          powderGusts: 'Powder Gusts', auroraSnow: 'Aurora Snowdust'
        },
        lavacave: {
          embersEase: 'Embers Easing', steamRise: 'Steam Rising', magmaFlare: 'Magma Flare',
          ashfall: 'Ashfall', sulfurFog: 'Sulfur Fog'
        },
        skyruins: {
          clearGale: 'Clear Gale', rainSquall: 'Rain Squall', highStorm: 'High-Frequency Storm',
          crosswind: 'Crosswind', aetherVeil: 'Aether Veil'
        },
        darkcastle: {
          lowMiasma: 'Low Miasma', blackRain: 'Black Rain', violetStorm: 'Violet Storm',
          ashenWind: 'Ashen Wind', soulSquall: 'Soul Squall'
        }
      }
    }
  });
})();
