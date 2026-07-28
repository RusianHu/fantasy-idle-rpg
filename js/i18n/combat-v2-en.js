(function () {
  'use strict';
  var Game = window.Game;
  var monsterNames = {
    slime_green: 'Green Slime', wolf_gray: 'Plains Wolf', slime_king: 'Giant Slime King',
    mushroom_toxic: 'Toxic Shroom', treant_sapling: 'Treant Sapling', elder_treant: 'Elder Treant',
    cave_bat: 'Cave Bat', kobold_miner: 'Kobold Miner', stone_golem: 'Stone Golem',
    skeleton_soldier: 'Skeleton Soldier', ghost_wisp: 'Wandering Wisp', necromancer: 'Necromancer',
    ice_wolf: 'Snow Wolf', yeti_small: 'Young Yeti', frost_giant: 'Frost Giant',
    fire_imp: 'Fire Imp', lava_lizard: 'Lava Lizard', flame_demon: 'Flame Demon',
    guardian_orb: 'Arcane Orb', harpy: 'Harpy', ruin_guardian: 'Ruin Guardian',
    demon_soldier: 'Demon Soldier', gargoyle: 'Gargoyle', demon_lord: 'Demon Lord Berial'
  };
  var monster = {}, basic = {}, traits = {}, lore = {};
  Object.keys(monsterNames).forEach(function (id) {
    monster[id] = { desc: monsterNames[id] + ' has its own action, trait, and regional mechanic.' };
    basic[id + '_basic'] = { name: monsterNames[id] + ' Attack' };
    traits[id] = { name: monsterNames[id] + ' Trait' };
    lore[id] = 'Miasma altered the instincts of the ' + monsterNames[id] + '; the guild lists it in the local hunt ledger.';
  });
  Game.i18n.addPack('en', {
    settings: {
      combatStrategy: 'Auto-combat strategy', combatStrategyHint: 'Controls mechanic response, survival, and damage bias.',
      combatTactics: 'Combat thresholds', tacticHeal: 'Heal threshold',
      tacticDefense: 'Defense threshold', tacticDodge: 'Telegraph dodge threshold'
    },
    monster: monster,
    actor: {
      adventurer: { name: 'Lone Adventurer', desc: 'A frontline adventurer registered with the guild.', lore: 'Follows a shuffled frontline route to cleanse Lucia of miasma.' },
      guild_scout: { name: 'Guild Scout', desc: 'A non-combat scout stationed at camp.', lore: 'Records roads, lairs, and returning expeditions.' },
      shadow_wisp: { name: 'Bound Shadow Wisp', desc: 'A temporary combat Actor created by an ability.', lore: 'Exists only for its encounter and never enters the persistent roster.' },
      arcane_crystal: { name: 'Arcane Defense Crystal', desc: 'A destructible object with relations and combat components.', lore: 'An ancient ruin defense node awakened by its wardens.' }
    },
    combat: {
      ui: {
        ready: 'Ready', gcd: 'GCD {s}s', gcdReady: 'GCD ready',
        noResource: 'No job resource', combo: 'Combo {n}', enemyReady: 'Watching',
        phase: 'Boss phase {n}', telegraph: 'Warning: {ability} · {s}s',
        interruptible: 'Interruptible', strategyGroup: 'Auto-combat strategy', tactics: 'Tactics',
        allyPortrait: '{name} portrait', enemyPortrait: '{name} portrait'
      },
      strategy: { safe: 'Safe', balanced: 'Balanced', aggressive: 'Aggressive' },
      resource: {
        rage: { name: 'Rage' }, energy: { name: 'Energy' }, comboPoints: { name: 'Combo Points' },
        mana: { name: 'Mana' }, arcaneCharges: { name: 'Arcane Charges' }, faith: { name: 'Faith' },
        focus: { name: 'Focus' }, boss_resolve: { name: 'Resolve' }
      },
      ability: Object.assign(basic, {
        fighter_auto: { name: 'Auto Slash' }, fighter_slash: { name: 'Vanguard Slash' }, fighter_rising: { name: 'Rising Cut' },
        fighter_breaker: { name: 'Guard Breaker' }, fighter_heavy: { name: 'Rage Slash' }, fighter_whirlwind: { name: 'Whirlwind' },
        fighter_guard: { name: 'Guard Stance' }, fighter_warcry: { name: 'War Cry' },
        rogue_auto: { name: 'Auto Stab' }, rogue_stab: { name: 'Quick Stab' }, rogue_poison: { name: 'Poison Blade' },
        rogue_backstab: { name: 'Backstab' }, rogue_eviscerate: { name: 'Eviscerate' }, rogue_fan: { name: 'Fan of Knives' },
        rogue_evasion: { name: 'Evasion' }, mage_auto: { name: 'Arcane Shot' }, mage_bolt: { name: 'Arcane Bolt' },
        mage_fireball: { name: 'Fireball' }, mage_nova: { name: 'Arcane Nova' }, mage_barrage: { name: 'Arcane Barrage' },
        mage_barrier: { name: 'Arcane Barrier' }, mage_mana: { name: 'Mana Font' },
        cleric_auto: { name: 'Radiant Strike' }, cleric_smite: { name: 'Smite' }, cleric_judgment: { name: 'Judgment' },
        cleric_prayer: { name: 'Healing Prayer' }, cleric_nova: { name: 'Holy Nova' }, cleric_aegis: { name: 'Aegis of Light' },
        cleric_interrupt: { name: 'Radiant Interruption' }, ranger_auto: { name: 'Auto Shot' }, ranger_aimed: { name: 'Aimed Shot' },
        ranger_mark: { name: 'Hunter Mark' }, ranger_power: { name: 'Power Shot' }, ranger_multi: { name: 'Multi Shot' },
        ranger_hawk: { name: 'Hawk Eye' }, ranger_disengage: { name: 'Disengage' },
        shadow_bite: { name: 'Shadow Bite' }, arcane_pulse: { name: 'Arcane Pulse' },
        slime_acid: { name: 'Acid Splash' }, wolf_pounce: { name: 'Rending Pounce' }, slime_crush: { name: 'Slime Crush' },
        slime_wave: { name: 'Slime Wave' }, slime_regen: { name: 'Regenerate' }, poison_cloud: { name: 'Poison Cloud' },
        grasping_roots: { name: 'Grasping Roots' }, treant_roots: { name: 'Root Circle' }, branch_sweep: { name: 'Branch Sweep' },
        treant_rejuvenate: { name: 'Ancient Rejuvenation' }, bat_screech: { name: 'Screech' }, armor_break: { name: 'Armor Break' },
        golem_quake: { name: 'Quake Ring' }, golem_shield: { name: 'Rock Shield' }, golem_fist: { name: 'Crushing Fist' },
        shield_bash: { name: 'Shield Bash' }, life_drain: { name: 'Life Drain' }, shadow_bolt: { name: 'Shadow Bolt' },
        withering_curse: { name: 'Withering Curse' }, bone_barrier: { name: 'Bone Barrier' }, frost_fang: { name: 'Frost Fang' },
        yeti_smash: { name: 'Charged Smash' }, ice_lance: { name: 'Ice Lance' }, avalanche: { name: 'Delayed Avalanche' },
        glacial_armor: { name: 'Glacial Armor' }, ember_bolt: { name: 'Ember Bolt' }, searing_bite: { name: 'Searing Bite' },
        infernal_slash: { name: 'Infernal Slash' }, fire_shield: { name: 'Fire Shield' }, eruption_chain: { name: 'Eruption Chain' },
        suppression_beam: { name: 'Suppression Beam' }, sonic_dive: { name: 'Sonic Dive' }, arcane_ray: { name: 'Arcane Ray' },
        gravity_well: { name: 'Gravity Well' }, recalibrate: { name: 'Shield Recalibration' }, cursed_cleave: { name: 'Cursed Cleave' },
        petrifying_gaze: { name: 'Petrifying Gaze' }, abyssal_blade: { name: 'Abyssal Blade' }, dark_edict: { name: 'Dark Edict' },
        demon_bulwark: { name: 'Demon Bulwark' }
      }),
      status: {
        fighter_guard: { name: 'Guarded' }, fighter_warcry: { name: 'War Cry' }, rogue_poison: { name: 'Envenomed' },
        rogue_evasion: { name: 'Evasion' }, mage_barrier: { name: 'Arcane Barrier' }, cleric_blessing: { name: 'Blessing of Light' },
        ranger_marked: { name: 'Hunter Mark' }, ranger_hawk: { name: 'Hawk Eye' }, corroded: { name: 'Armor Corrosion' },
        bleeding: { name: 'Bleeding' }, regenerating: { name: 'Regenerating' }, phase2: { name: 'Phase Two' },
        poisoned: { name: 'Poisoned' }, rooted: { name: 'Rooted' }, rejuvenation: { name: 'Rejuvenation' },
        disoriented: { name: 'Disoriented' }, sundered: { name: 'Sundered' }, rock_shield: { name: 'Rock Shield' },
        staggered: { name: 'Staggered' }, withered: { name: 'Withered' }, bone_barrier: { name: 'Bone Barrier' },
        chilled: { name: 'Chilled' }, exposed: { name: 'Exposed' }, glacial_armor: { name: 'Glacial Armor' },
        burning: { name: 'Burning' }, thorns: { name: 'Thorns' }, fire_shield: { name: 'Fire Shield' },
        suppressed: { name: 'Suppressed' }, dazed: { name: 'Dazed' }, recalibrated: { name: 'Recalibrated' },
        cursed: { name: 'Cursed' }, petrified: { name: 'Petrified Slow' }, demon_bulwark: { name: 'Demon Bulwark' },
        tyrant_phase: { name: 'Tyrant Phase' }
      },
      trait: Object.assign(traits, {
        fighter_temper: { name: 'Battle Temper' }, rogue_opportunist: { name: 'Opportunist' },
        mage_mastery: { name: 'Arcane Mastery' }, cleric_ministry: { name: 'Solo Ministry' },
        ranger_fieldcraft: { name: 'Fieldcraft' }
      }),
      lore: lore
    }
  });
})();
