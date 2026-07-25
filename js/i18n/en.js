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
      camp: '🏕 Rest at Camp',
      breakCamp: '⚔ Break Camp',
      restBuff: 'Rested',
      restingChip: '☕ Resting: fast recovery',
      recovering: 'Regrouping… {s}s',
      bossAppear: '⚔ Boss Hunt: {name} appears!',
      bossKilled: 'Boss defeated!',
      bossFailed: 'The boss withdrew. Refill the hunt gauge to retry!',
      bossFirstKill: 'First-kill reward: {n} Crystals',
      heroDown: 'You fell… retreating to camp',
      levelUp: '⬆ Level Up! Lv.{lv}',
      achUnlocked: 'Feat achieved: {name}',
      regionUnlocked: 'New region unlocked: {name}',
      autoAdvanced: 'Auto-advance → {name}',
      fellback: 'Defeated 3 times in a row — fell back to {name}. Upgrade gear & skills first!',
      rareDrop: 'Obtained {name}!',
      gotItem: 'Got {name}',
      bought: 'Purchased',
      cantAfford: 'Not enough currency',
      sellLow: 'Sell Common+Fine',
      soldN: 'Sold {n} items, +{g} gold',
      nothingToSell: 'No low-rarity gear to sell',
      bagEmpty: 'Your bag is empty — go hunt some monsters!',
      potionAuto: 'Auto-potion under {p}% HP',
      equip: 'Equip',
      unequip: 'Unequip',
      equippedTag: 'Equipped',
      sellFor: 'Sell +{g}',
      salvage: 'Salvage +{n}💎',
      compareWith: 'Compared to equipped:',
      score: 'Power',
      itemLevel: 'iLv {lv}',
      confirmTitle: 'Confirm',
      ok: 'OK',
      cancel: 'Cancel',
      upgrade: 'Upgrade',
      maxed: 'MAX',
      skillUp: '{name} upgraded!',
      skillActive: 'Active · CD {cd}s',
      skillPassive: 'Passive',
      skillNotLearned: 'Not learned',
      skillBaseNote: '(Cast automatically at base power before investing points)',
      needLevel: 'Requires hero Lv.{lv}',
      spLeft: 'Skill Points: {n}',
      expProgress: 'EXP Progress',
      growthNote: 'Growth: level-ups auto-raise all stats and fully heal (idle-friendly). Spend skill points in the Skills tab.',
      achProgress: 'Feats: {a} / {b}',
      gold: 'Gold',
      crystal: 'Crystals',
      current: 'Here',
      locked: 'Locked',
      cleared: 'Cleared',
      recommendLv: 'Suggested Lv.{lv}+',
      goRegion: 'Travel',
      movedTo: 'Arrived at {name}',
      prologueTip: 'Tap to continue ▶'
    },

    stat: {
      hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD',
      crit: 'Crit Rate', critDmg: 'Crit DMG', goldMul: 'Gold Bonus', expMul: 'EXP Bonus'
    },

    statPage: {
      kills: 'Total Kills', bossKills: 'Boss Kills', goldEarned: 'Gold Earned', expEarned: 'EXP Earned',
      drops: 'Gear Drops', legendaries: 'Legendaries', potions: 'Potions Used', deaths: 'Times Fallen',
      maxHit: 'Highest Hit', sells: 'Items Sold', playSec: 'Time Played', restSec: 'Time Rested',
      offlineSec: 'Offline Time', highestRegion: 'Farthest Region'
    },

    slot: { weapon: 'Weapon', armor: 'Armor', ring: 'Ring' },

    rarity: { r0: 'Common', r1: 'Fine', r2: 'Rare', r3: 'Epic', r4: 'Legendary' },

    item: {
      pattern: '{mat} {base}',
      mat: { 1: 'Copper', 2: 'Iron', 3: 'Steel', 4: 'Silver', 5: 'Mithril', 6: 'Flamegold', 7: 'Starlight', 8: 'Dragonsoul' },
      base: { weapon: 'Sword', armor: 'Armor', ring: 'Ring' }
    },

    affix: {
      atk_pct: 'ATK', hp_pct: 'HP', atk_flat: 'ATK', hp_flat: 'HP', def_flat: 'DEF',
      spd: 'SPD', crit: 'Crit Rate', critdmg: 'Crit DMG', gold_pct: 'Gold Gain', exp_pct: 'EXP Gain'
    },

    skill: {
      power_strike: { name: 'Power Strike', desc: 'A devastating blow dealing {v}% ATK damage.' },
      whirlwind: { name: 'Whirlwind', desc: 'Spin and hit all nearby enemies for {v}% ATK damage.' },
      heal_light: { name: 'Healing Light', desc: 'Auto-casts below 70% HP, restoring {v}% max HP.' },
      passive_might: { name: 'Blessing of Might', desc: 'Passive: ATK +{v}%.' },
      passive_guard: { name: 'Iron Bulwark', desc: 'Passive: DEF +{v}%, max HP +{v2}%.' },
      passive_swift: { name: 'Gale Boon', desc: 'Passive: SPD +{v}%, Crit Rate +{v2}%.' }
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
      potion_50: { name: 'Potion Enjoyer', desc: 'Use 50 potions' }
    },

    shopSec: { consume: '─ Consumables ─', gear: '─ Gear Supply ─', perm: '─ Permanent Boons (Crystals) ─' },

    shop: {
      shop_potion_small: { name: 'Minor Healing Potion', desc: 'Restores 40% HP. Auto-used at low HP.' },
      shop_potion_large: { name: 'Major Healing Potion', desc: 'Restores 85% HP. Used when minor potions run out.' },
      shop_gear_gold: { name: 'Gear Supply Crate', desc: 'One random piece of gear at your level, with slightly boosted quality.' },
      shop_gear_crystal: { name: 'Crystal Gear Chest', desc: 'Guaranteed Epic gear — 20% chance of Legendary!' },
      perm_atk: { name: 'Sigil of Might', desc: 'Permanent ATK +5%. Stacks up to 10.' },
      perm_hp: { name: 'Sigil of Vitality', desc: 'Permanent max HP +5%. Stacks up to 10.' },
      perm_gold: { name: 'Sigil of Fortune', desc: 'Permanent gold gain +10%. Stacks up to 10.' },
      perm_exp: { name: 'Sigil of Wisdom', desc: 'Permanent EXP gain +10%. Stacks up to 10.' }
    },

    settings: {
      language: 'Language 语言',
      effects: 'Ambience & Terrain FX',
      effectsHint: 'Turn off to improve performance on low-end devices',
      potion: 'Auto-potion Threshold',
      autoAdvance: 'Auto-advance Regions',
      autoAdvanceHint: 'Automatically move to the next region after beating its boss',
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

    prologue: {
      1: 'The Demon Lord, sealed by heroes a thousand years ago, has awakened in the depths of the continent of Lucia…',
      2: 'Miasma spreads from the Demon Castle — meadow, forest, mine and snowpeak are falling one by one.',
      3: 'The Adventurers\' Guild has issued its highest writ of subjugation.',
      4: 'And you — the guild\'s newest lone adventurer — set out from the Novice Meadow.',
      5: 'Purify the eight lands, and storm the Demon Castle!'
    }
  });
})();
