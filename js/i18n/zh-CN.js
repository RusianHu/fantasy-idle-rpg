/* ============================================================
 * i18n/zh-CN.js — 简体中文语言包（默认语言）
 * ============================================================ */
(function () {
  'use strict';
  Game.i18n.addPack('zh-CN', {
    ui: {
      tab: { battle: '战斗', char: '角色', inv: '背包', skills: '技能', map: '地图', settings: '设置' },
      sub: { attr: '属性', stats: '统计', ach: '成就', bag: '背包', shop: '商店' },
      huntGauge: '讨伐',
      controlTitle: '操控',
      controlAuto: '自动',
      controlManual: '手动',
      controlAria: '切换操控模式，当前为{mode}',
      controlAutoHint: '自动寻路与战斗',
      controlManualHint: '点地或方向键移动，点怪交战',
      controlChangedAuto: '已切换自动：继续寻路与战斗',
      controlChangedManual: '已切换手动：点地或方向键移动，点怪交战',
      camp: '🏕 扎营休息',
      breakCamp: '⚔ 拔营出战',
      restBuff: '休整增益',
      restingChip: '☕ 休息中：快速恢复',
      recovering: '重整旗鼓… {s}s',
      bossAppear: '⚔ 讨伐战：{name} 现身！',
      bossKilled: '头目讨伐成功！',
      bossFailed: 'Boss 撤场了，重新积攒讨伐进度再战！',
      bossFirstKill: '首次讨伐奖励：魔晶石 ×{n}',
      heroDown: '你倒下了…正撤回营地重整',
      levelUp: '⬆ 升级！Lv.{lv}',
      achUnlocked: '达成成就「{name}」',
      regionUnlocked: '新区域解锁：{name}',
      autoAdvanced: '自动推进 → {name}',
      fellback: '连续战败，已撤回{name}。建议强化装备、升级技能后再来！',
      rareDrop: '获得 {name}！',
      gotItem: '获得 {name}',
      bought: '购买成功',
      cantAfford: '货币不足',
      sellLow: '出售 普通+精良',
      soldN: '出售 {n} 件，+{g} 金币',
      nothingToSell: '没有可出售的低稀有度装备',
      bagEmpty: '背包空空如也，去讨伐魔物吧！',
      potionAuto: '生命 <{p}% 自动喝药',
      equip: '装备',
      unequip: '卸下',
      equippedTag: '已装备',
      sellFor: '出售 +{g}',
      salvage: '分解 +{n}💎',
      compareWith: '对比当前装备：',
      score: '战力评分',
      compareOverall: '综合收益',
      compareOffense: '输出',
      compareSurvival: '生存',
      compareEconomy: '收益',
      slotLocked: '已锁定',
      slotUnlocked: '自动',
      lockSlot: '锁定此槽位',
      unlockSlot: '解除槽位锁定',
      lockSlotNamed: '锁定{slot}槽位',
      unlockSlotNamed: '解除{slot}槽位锁定',
      lockedSlotHint: '此槽位已锁定，自动换装不会替换它。',
      autoSkillSummary: '✨ 已自动分配 {n} 点技能点',
      autoGearSummary: '✨ 已自动更换 {n} 件装备（综合 +{p}%）',
      autoBothSummary: '✨ 自动养成：分配 {s} 点技能，更换 {g} 件装备',
      itemLevel: '{lv} 级',
      confirmTitle: '确认',
      ok: '确定',
      cancel: '取消',
      upgrade: '升级',
      maxed: '已满级',
      skillUp: '{name} 强化成功！',
      skillActive: '主动 · CD {cd}s',
      skillPassive: '被动',
      skillNotLearned: '未习得',
      skillBaseNote: '（0 点时以基础威力释放；每投入 1 点都会提升）',
      needLevel: '需要角色等级 Lv.{lv}',
      spLeft: '技能点：{n}',
      expProgress: '经验进度',
      growthNote: '成长方式：升级自动提升全属性并回满生命（挂机不打断）；技能点在「技能」页强化技能。',
      achProgress: '成就进度：{a} / {b}',
      gold: '金币',
      crystal: '魔晶石',
      current: '当前',
      locked: '未解锁',
      cleared: '已讨伐',
      recommendLv: '推荐等级 Lv.{lv}+',
      goRegion: '前往',
      movedTo: '已抵达 {name}',
      prologueTip: '点击继续 ▶',
      /* 职业 */
      classTitle: '⚔ 选择你的职业',
      classHint: '职业决定成长曲线与战斗方式，选定后不可更改。',
      classHint2: '◀ ▶ 或滑动切换职业 · 选定后不可更改',
      classPick: '选择',
      classConfirm: '以「{name}」之名踏上讨伐之旅？（不可更改）',
      csSkills: '─ 技能一览 ─',
      csConfirmBtn: '以「{name}」开始冒险',
      noClassYet: '尚未选择职业',
      /* 标题画面 */
      titleLogo: '幻境远征',
      titleStart: '开始冒险',
      adventureBegin: '✦ 冒险开始 ✦',
      miss: 'MISS',
      poisoned: '中毒',
      dim: { hp: '生命', atk: '攻击', def: '防御', spd: '速度', burst: '爆发' },
      trait: {
        melee: '近战', ranged: '远程', tank: '坚韧', crit: '暴击',
        dodge: '闪避', burst: '爆发', sustain: '续航', treasure: '寻宝'
      }
    },

    stat: {
      hp: '生命', atk: '攻击', def: '防御', spd: '速度',
      crit: '暴击率', critDmg: '暴击伤害', goldMul: '金币加成', expMul: '经验加成',
      dodge: '闪避', lifesteal: '吸血', cdr: '冷却缩减', healPow: '治疗强化',
      attackType: '攻击方式'
    },

    statPage: {
      kills: '总讨伐数', bossKills: '头目讨伐', goldEarned: '累计金币', expEarned: '累计经验',
      drops: '装备掉落', legendaries: '传说装备', potions: '药水使用', deaths: '倒下次数',
      maxHit: '最高单击', sells: '出售件数', playSec: '累计游玩', restSec: '累计休息',
      offlineSec: '离线挂机', highestRegion: '最远区域'
    },

    slot: { weapon: '武器', armor: '护甲', ring: '饰品' },

    rarity: { r0: '普通', r1: '精良', r2: '稀有', r3: '史诗', r4: '传说' },

    item: {
      pattern: '{mat}{base}',
      mat: { 1: '铜制', 2: '铁制', 3: '钢制', 4: '白银', 5: '秘银', 6: '炎金', 7: '星辉', 8: '龙魂' },
      base: { weapon: '长剑', armor: '铠甲', ring: '戒指' },
      weapon: { fighter: '长剑', rogue: '短匕', mage: '法杖', cleric: '战锤', ranger: '长弓' }
    },

    'class': {
      fighter: { name: '战士', desc: '身披重甲的前线壁垒。生存冠绝、输出稳健，挂机最安心的选择。' },
      rogue: { name: '盗贼', desc: '出入阴影的利刃。极速与暴击的近战爆发，以闪避回避致命一击。' },
      mage: { name: '法师', desc: '操火驭冰的奥术行者。远程压制、全游戏最强爆发，但衣袍单薄。' },
      cleric: { name: '牧师', desc: '圣光的侍奉者。自愈型近战，治疗强化与吸血让他愈战愈勇。' },
      ranger: { name: '游侠', desc: '荒野的猎手。远程稳定输出，天生的寻宝直觉带来额外财富。' }
    },

    affix: {
      atk_pct: '攻击', hp_pct: '生命', atk_flat: '攻击', hp_flat: '生命', def_flat: '防御',
      spd: '速度', crit: '暴击率', critdmg: '暴击伤害', gold_pct: '金币获取', exp_pct: '经验获取'
    },

    skill: {
      /* 战士 */
      ft_heavy: { name: '重斩', desc: '蓄力挥出致命一击，造成 {v}% 攻击力的伤害。' },
      ft_tough: { name: '坚韧', desc: '被动：防御提升 {v}%，生命上限提升 {v2}%。' },
      ft_whirl: { name: '旋风斩', desc: '旋身横扫，对周围所有敌人造成 {v}% 攻击力的伤害。' },
      ft_mastery: { name: '武器专精', desc: '被动：攻击力提升 {v}%。' },
      ft_warcry: { name: '战吼', desc: '怒吼提振战意：{s} 秒内攻击与防御提升 {v}%。' },
      ft_second: { name: '战意涌动', desc: '被动：战斗中每秒额外回复 {v}% 最大生命。' },
      /* 盗贼 */
      rg_backstab: { name: '背刺', desc: '绕至破绽处突刺，造成 {v}% 攻击力伤害，此击暴击率 +25%。' },
      rg_swift: { name: '迅捷', desc: '被动：速度提升 {v}%。' },
      rg_poison: { name: '毒刃', desc: '淬毒短匕造成 {v}% 伤害，并在 {s} 秒内追加共 {v2}% 攻击力的毒素伤害。' },
      rg_deadly: { name: '致命', desc: '被动：暴击率 +{v}%，暴击伤害 +{v2}%。' },
      rg_flurry: { name: '剑刃乱舞', desc: '匕影纷飞，对周围所有敌人造成 {v}% 攻击力的伤害。' },
      rg_evasion: { name: '闪避精通', desc: '被动：闪避 +{v}%（上限 35%）。' },
      /* 法师 */
      mg_fireball: { name: '火球术', desc: '掷出炽热火球，造成 {v}% 攻击力的伤害。' },
      mg_mastery: { name: '法术精研', desc: '被动：法术强度提升 {v}%。' },
      mg_nova: { name: '冰霜新星', desc: '在目标处引爆新星，范围造成 {v}% 攻击力的伤害。' },
      mg_surge: { name: '法力涌动', desc: '被动：技能冷却缩减 {v}%（上限 40%）。' },
      mg_barrier: { name: '奥术屏障', desc: '展开屏障，吸收相当于 {v}% 最大生命的伤害。' },
      mg_armor: { name: '魔导护体', desc: '被动：生命与防御各提升 {v}%。' },
      /* 牧师 */
      cl_smite: { name: '神圣打击', desc: '圣光重击造成 {v}% 攻击力伤害，并回复造成伤害 {v2}% 的生命。' },
      cl_faith: { name: '信仰', desc: '被动：生命 +{v}%，防御 +{v2}%。' },
      cl_prayer: { name: '治愈祷言', desc: '生命低于 75% 时自动祷告，回复 {v}% 最大生命。' },
      cl_bless: { name: '圣光祝福', desc: '被动：所受一切治疗提升 {v}%（含药水）。' },
      cl_nova: { name: '神圣新星', desc: '圣光爆发对周围敌人造成 {v}% 伤害，并回复自身 {v2}% 生命。' },
      cl_radiance: { name: '圣光回响', desc: '被动：攻击附带 {v}% 吸血。' },
      /* 游侠 */
      rn_power: { name: '强力射击', desc: '弓弦满张射出一箭，造成 {v}% 攻击力的伤害。' },
      rn_precision: { name: '精准', desc: '被动：暴击率 +{v}%。' },
      rn_multi: { name: '多重射击', desc: '箭雨覆盖目标区域，造成 {v}% 攻击力的伤害。' },
      rn_survival: { name: '荒野生存', desc: '被动：生命 +{v}%，速度 +{v2}%。' },
      rn_hawk: { name: '鹰眼', desc: '鹰眼锁定：{s} 秒内攻击 +{v}%、暴击率 +{v2}%。' },
      rn_treasure: { name: '寻宝直觉', desc: '被动：金币获取 +{v}%，装备掉率 +{v2}%。' }
    },

    monster: {
      slime_green: { name: '绿史莱姆' }, wolf_gray: { name: '草原灰狼' }, slime_king: { name: '巨型史莱姆王' },
      mushroom_toxic: { name: '毒孢蘑菇' }, treant_sapling: { name: '树精幼苗' }, elder_treant: { name: '森林树妖王' },
      cave_bat: { name: '洞穴蝙蝠' }, kobold_miner: { name: '狗头人矿工' }, stone_golem: { name: '岩石魔像' },
      skeleton_soldier: { name: '骷髅兵' }, ghost_wisp: { name: '游荡幽魂' }, necromancer: { name: '死灵法师' },
      ice_wolf: { name: '雪原狼' }, yeti_small: { name: '小雪怪' }, frost_giant: { name: '冰霜巨人' },
      fire_imp: { name: '火焰小鬼' }, lava_lizard: { name: '熔岩蜥蜴' }, flame_demon: { name: '炎魔' },
      guardian_orb: { name: '魔导浮球' }, harpy: { name: '鹰身女妖' }, ruin_guardian: { name: '遗迹守护者' },
      demon_soldier: { name: '魔族士兵' }, gargoyle: { name: '石像鬼' }, demon_lord: { name: '魔王贝利亚尔' }
    },

    region: {
      grassland: { name: '新手草原', desc: '露西亚大陆边缘的和平草原，瘴气尚未蔓延至此。' },
      forest: { name: '迷雾森林', desc: '雾气笼罩的古老森林，树木在瘴气中扭曲低语。' },
      mine: { name: '废弃矿坑', desc: '矿工因瘴气弃坑而逃，如今魔物盘踞其中。' },
      graveyard: { name: '亡灵墓地', desc: '瘴气唤醒了长眠者，磷火在墓碑间游荡。' },
      snowpass: { name: '雪山隘口', desc: '通往大陆深处的隘口，风雪中潜伏着冰爪与寒嚎。' },
      lavacave: { name: '熔岩洞窟', desc: '地脉被魔王之力搅动，岩浆奔涌不息。' },
      skyruins: { name: '浮空遗迹', desc: '古代文明的浮空石岛，守卫仍在履行千年之约。' },
      darkcastle: { name: '魔王城', desc: '瘴气之源。讨伐魔王，终结这场灾厄！' }
    },

    ach: {
      kill_100: { name: '初出茅庐', desc: '累计讨伐 100 只魔物' },
      kill_1000: { name: '讨伐者', desc: '累计讨伐 1000 只魔物' },
      kill_10000: { name: '魔物克星', desc: '累计讨伐 10000 只魔物' },
      boss_1: { name: '首战告捷', desc: '击败 1 个头目' },
      boss_20: { name: '头目猎人', desc: '累计击败 20 次头目' },
      level_10: { name: '崭露头角', desc: '角色达到 10 级' },
      level_30: { name: '老练冒险者', desc: '角色达到 30 级' },
      level_60: { name: '传奇冒险者', desc: '角色达到 60 级' },
      gold_100k: { name: '小有积蓄', desc: '累计获得 10万 金币' },
      gold_10m: { name: '富甲一方', desc: '累计获得 1000万 金币' },
      drops_50: { name: '装备收藏家', desc: '累计拾取 50 件装备' },
      drops_500: { name: '移动军械库', desc: '累计拾取 500 件装备' },
      legend_1: { name: '传说之始', desc: '获得 1 件传说装备' },
      region_4: { name: '深入腹地', desc: '推进到第 4 片区域' },
      region_8: { name: '直捣魔王城', desc: '推进到魔王城' },
      rest_30m: { name: '篝火情谊', desc: '在营地累计休息 30 分钟' },
      play_2h: { name: '沉浸其中', desc: '累计游玩 2 小时' },
      potion_50: { name: '药剂爱好者', desc: '累计使用 50 瓶药水' }
    },

    shopSec: { consume: '─ 消耗品 ─', gear: '─ 装备补给 ─', perm: '─ 永久强化（魔晶石）─' },

    shop: {
      shop_potion_small: { name: '小型治疗药水', desc: '恢复 40% 生命。低血量时自动使用。' },
      shop_potion_large: { name: '大型治疗药水', desc: '恢复 85% 生命。小瓶耗尽后自动使用。' },
      shop_gear_gold: { name: '装备补给箱', desc: '开出一件当前等级的随机装备，品质概率略有提升。' },
      shop_gear_crystal: { name: '魔晶装备箱', desc: '必得史诗级装备，20% 概率开出传说！' },
      perm_atk: { name: '力量圣印', desc: '永久攻击力 +5%，可叠加 10 层。' },
      perm_hp: { name: '生命圣印', desc: '永久生命上限 +5%，可叠加 10 层。' },
      perm_gold: { name: '财富圣印', desc: '永久金币获取 +10%，可叠加 10 层。' },
      perm_exp: { name: '智慧圣印', desc: '永久经验获取 +10%，可叠加 10 层。' }
    },

    settings: {
      language: '语言 Language',
      effects: '氛围与地形特效',
      effectsHint: '关闭可提升低端设备流畅度（粒子/脚印/涟漪等）',
      potion: '药水自动使用阈值',
      autoAdvance: '自动推进区域',
      autoAdvanceHint: '击败 Boss 后自动进入下一区域',
      autoSkillUpgrade: '自动分配技能点',
      autoSkillUpgradeHint: '逐点模拟输出、生存与收益，自动选择当前职业的最佳升级',
      autoEquip: '自动评估并更换装备',
      autoEquipHint: '按当前职业与区域优化未锁定槽位，至少提升 0.1% 才替换',
      sfx: '音效',
      music: '音乐',
      comingSoon: '即将推出（当前版本暂无音频）',
      saveSection: '─ 存档管理 ─',
      importPlaceholder: '粘贴存档串到此处导入；或点击「复制存档」导出',
      exportCopy: '📋 复制存档',
      exported: '存档已复制/填入文本框',
      exportFile: '💾 下载存档',
      importBtn: '📥 导入文本',
      importFile: '📂 导入文件',
      importEmpty: '请先粘贴存档串',
      importConfirm: '导入将覆盖当前进度，确定继续？',
      importOk: '导入成功！',
      importBad: '存档无效或已损坏（校验失败）',
      reset: '⚠ 重置存档',
      resetConfirm1: '将删除全部进度，确定？',
      resetConfirm2: '最后确认：真的要从头开始吗？',
      about: '幻境远征 v{v} · 纯前端离线挂机 RPG<br>像素字体：Fusion Pixel（缺失时回退系统字体）'
    },

    offline: {
      title: '⏰ 离线结算',
      away: '你离开了 {d}',
      restMode: '离线期间处于扎营休息',
      hpRestored: '生命完全恢复',
      buffFull: '休整增益积满',
      restNote: '休息模式下离线不产生战斗收益。回到战斗页拔营即可继续讨伐。',
      kills: '讨伐魔物',
      exp: '获得经验',
      gold: '获得金币',
      items: '拾取装备',
      potions: '拾取药水',
      claim: '收下'
    },

    prologue: {
      1: '千年之前被勇者封印的魔王，在露西亚大陆的最深处……苏醒了。',
      2: '瘴气自魔王城蔓延而出，草原、森林、矿坑与雪山正相继沦陷。',
      3: '冒险者公会向全大陆发布了最高级别的讨伐令。',
      4: '而你——公会新晋的独行冒险者，将奔赴四处前线之一。',
      5: '净化八方瘴气，直捣魔王城吧！'
    }
  });
})();
