(function () {
  'use strict';
  var Game = window.Game;
  var monsterNames = {
    slime_green: '绿史莱姆', wolf_gray: '草原灰狼', slime_king: '巨型史莱姆王',
    mushroom_toxic: '毒孢蘑菇', treant_sapling: '树精幼苗', elder_treant: '森林树妖王',
    cave_bat: '洞穴蝙蝠', kobold_miner: '狗头人矿工', stone_golem: '岩石魔像',
    skeleton_soldier: '骷髅兵', ghost_wisp: '游荡幽魂', necromancer: '死灵法师',
    ice_wolf: '雪原狼', yeti_small: '小雪怪', frost_giant: '冰霜巨人',
    fire_imp: '火焰小鬼', lava_lizard: '熔岩蜥蜴', flame_demon: '炎魔',
    guardian_orb: '魔导浮球', harpy: '鹰身女妖', ruin_guardian: '遗迹守护者',
    demon_soldier: '魔族士兵', gargoyle: '石像鬼', demon_lord: '魔王贝利亚尔'
  };
  var monster = {};
  var basic = {};
  var traits = {};
  var lore = {};
  Object.keys(monsterNames).forEach(function (id) {
    monster[id] = { desc: monsterNames[id] + '拥有独立行动、特性与区域机制。' };
    basic[id + '_basic'] = { name: monsterNames[id] + '·基础攻击' };
    traits[id] = { name: monsterNames[id] + '·固有特性' };
    lore[id] = '瘴气改变了' + monsterNames[id] + '的本能，公会将其列入本区讨伐名册。';
  });
  Game.i18n.addPack('zh-CN', {
    settings: {
      combatStrategy: '自动战斗策略', combatStrategyHint: '决定机制反应、保命与输出倾向。',
      combatTactics: '战斗阈值', tacticHeal: '治疗触发线',
      tacticDefense: '防御触发线', tacticDodge: '预警躲避线'
    },
    monster: monster,
    actor: {
      adventurer: { name: '独行冒险者', desc: '公会登记的前线冒险者。', lore: '沿着随机前线路线净化露西亚大陆的瘴气。' },
      guild_scout: { name: '公会斥候', desc: '驻守营地的非战斗斥候。', lore: '负责记录道路、巢穴与远征队归期。' },
      shadow_wisp: { name: '影缚幽火', desc: '由能力临时召来的战斗 Actor。', lore: '只在当前遭遇内存在，不进入长期名册。' },
      arcane_crystal: { name: '奥术防卫晶体', desc: '具备关系与战斗组件的可破坏物件。', lore: '遗迹守卫以古代术式唤醒的防卫节点。' }
    },
    combat: {
      ui: {
        ready: '等待行动', gcd: '公共冷却 {s}s', gcdReady: '公共冷却就绪',
        noResource: '无职业资源', combo: '连段 {n}', enemyReady: '伺机而动',
        phase: 'Boss 阶段 {n}', telegraph: '预警：{ability} · {s}s',
        interruptible: '可打断', strategyGroup: '自动战斗策略', tactics: '战术',
        allyPortrait: '{name}肖像', enemyPortrait: '{name}肖像'
      },
      strategy: { safe: '稳健', balanced: '均衡', aggressive: '强攻' },
      resource: {
        rage: { name: '怒气' }, energy: { name: '能量' }, comboPoints: { name: '连击点' },
        mana: { name: '法力' }, arcaneCharges: { name: '奥术充能' }, faith: { name: '信仰' },
        focus: { name: '专注' }, boss_resolve: { name: '决意' }
      },
      ability: Object.assign(basic, {
        fighter_auto: { name: '自动斩击' }, fighter_slash: { name: '先锋斩' }, fighter_rising: { name: '上挑斩' },
        fighter_breaker: { name: '破阵击' }, fighter_heavy: { name: '怒气重斩' }, fighter_whirlwind: { name: '旋风斩' },
        fighter_guard: { name: '守御架势' }, fighter_warcry: { name: '战吼' },
        rogue_auto: { name: '自动刺击' }, rogue_stab: { name: '迅刺' }, rogue_poison: { name: '毒刃' },
        rogue_backstab: { name: '背刺' }, rogue_eviscerate: { name: '剔骨' }, rogue_fan: { name: '飞刀扇' },
        rogue_evasion: { name: '闪避' }, mage_auto: { name: '奥术弹' }, mage_bolt: { name: '奥术飞弹' },
        mage_fireball: { name: '火球术' }, mage_nova: { name: '奥术新星' }, mage_barrage: { name: '奥术弹幕' },
        mage_barrier: { name: '奥术屏障' }, mage_mana: { name: '法力泉涌' },
        cleric_auto: { name: '圣辉打击' }, cleric_smite: { name: '惩击' }, cleric_judgment: { name: '审判' },
        cleric_prayer: { name: '治愈祷言' }, cleric_nova: { name: '神圣新星' }, cleric_aegis: { name: '圣光庇护' },
        cleric_interrupt: { name: '光耀阻断' }, ranger_auto: { name: '自动射击' }, ranger_aimed: { name: '瞄准射击' },
        ranger_mark: { name: '猎人标记' }, ranger_power: { name: '强力射击' }, ranger_multi: { name: '多重射击' },
        ranger_hawk: { name: '鹰眼' }, ranger_disengage: { name: '后撤' },
        shadow_bite: { name: '影噬' }, arcane_pulse: { name: '奥术反冲' },
        slime_acid: { name: '酸液飞溅' }, wolf_pounce: { name: '撕裂扑击' }, slime_crush: { name: '黏液重压' },
        slime_wave: { name: '黏液波' }, slime_regen: { name: '再生' }, poison_cloud: { name: '毒雾' },
        grasping_roots: { name: '缠绕根须' }, treant_roots: { name: '根须圆阵' }, branch_sweep: { name: '枝干横扫' },
        treant_rejuvenate: { name: '古木复苏' }, bat_screech: { name: '尖啸' }, armor_break: { name: '碎甲镐击' },
        golem_quake: { name: '震地圆环' }, golem_shield: { name: '岩盾' }, golem_fist: { name: '碎岩重拳' },
        shield_bash: { name: '盾击' }, life_drain: { name: '生命汲取' }, shadow_bolt: { name: '暗影箭' },
        withering_curse: { name: '凋零诅咒' }, bone_barrier: { name: '骸骨屏障' }, frost_fang: { name: '寒霜利齿' },
        yeti_smash: { name: '蓄力重击' }, ice_lance: { name: '冰矛' }, avalanche: { name: '延迟雪崩' },
        glacial_armor: { name: '冰川护甲' }, ember_bolt: { name: '余烬弹' }, searing_bite: { name: '灼热撕咬' },
        infernal_slash: { name: '狱火斩' }, fire_shield: { name: '火焰护盾' }, eruption_chain: { name: '连续喷发' },
        suppression_beam: { name: '压制光束' }, sonic_dive: { name: '音爆俯冲' }, arcane_ray: { name: '奥术射线' },
        gravity_well: { name: '重力场' }, recalibrate: { name: '护盾重校准' }, cursed_cleave: { name: '诅咒横斩' },
        petrifying_gaze: { name: '石化凝视' }, abyssal_blade: { name: '深渊之刃' }, dark_edict: { name: '黑暗敕令' },
        demon_bulwark: { name: '魔王壁垒' }
      }),
      status: {
        fighter_guard: { name: '守御' }, fighter_warcry: { name: '战吼' }, rogue_poison: { name: '淬毒' },
        rogue_evasion: { name: '闪避' }, mage_barrier: { name: '奥术屏障' }, cleric_blessing: { name: '圣光祝福' },
        ranger_marked: { name: '猎人标记' }, ranger_hawk: { name: '鹰眼' }, corroded: { name: '护甲腐蚀' },
        bleeding: { name: '流血' }, regenerating: { name: '再生' }, phase2: { name: '第二阶段' },
        poisoned: { name: '中毒' }, rooted: { name: '根缚' }, rejuvenation: { name: '复苏' },
        disoriented: { name: '失准' }, sundered: { name: '碎甲' }, rock_shield: { name: '岩盾' },
        staggered: { name: '踉跄' }, withered: { name: '凋零' }, bone_barrier: { name: '骸骨屏障' },
        chilled: { name: '寒冷' }, exposed: { name: '破绽' }, glacial_armor: { name: '冰川护甲' },
        burning: { name: '灼烧' }, thorns: { name: '棘甲' }, fire_shield: { name: '火焰护盾' },
        suppressed: { name: '压制' }, dazed: { name: '眩惑' }, recalibrated: { name: '重校准' },
        cursed: { name: '诅咒' }, petrified: { name: '石化迟缓' }, demon_bulwark: { name: '魔王壁垒' },
        tyrant_phase: { name: '暴君阶段' }
      },
      trait: Object.assign(traits, {
        fighter_temper: { name: '战斗热忱' }, rogue_opportunist: { name: '机会主义' },
        mage_mastery: { name: '奥术精通' }, cleric_ministry: { name: '独行牧职' },
        ranger_fieldcraft: { name: '荒野技艺' }
      }),
      lore: lore
    }
  });
})();
