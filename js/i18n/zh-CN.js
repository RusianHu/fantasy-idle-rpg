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
      bossHunt: '讨伐 Boss',
      bossHuntReady: '讨伐进度已满，点击发起 Boss 战',
      bossHuntLocked: '还需击败 {n} 只魔物才能讨伐 Boss',
      bossHuntBusy: '当前状态无法发起 Boss 战',
      autoBossShort: '自动讨伐',
      autoBossHint: '开启后，讨伐进度满且生命状态安全时自动挑战 Boss',
      autoBossAria: '自动讨伐 Boss，当前{state}',
      autoBossOn: '自动讨伐已开启',
      autoBossOff: '自动讨伐已关闭；进度满后可手动挑战 Boss',
      switchOn: '开启',
      switchOff: '关闭',
      restGauge: '休整 {p}%',
      regionKicker: '远征区域 {n}/{total}',
      campKicker: '前线营地 · 第 {n} 区',
      worldSeed: '世界种子',
      worldSeedHint: '此存档的八区布局标识',
      copySeed: '复制',
      seedCopied: '已复制世界种子 {seed}',
      updateAvailable: '检测到新版本 {version}，点击安全更新',
      updateApplying: '正在保存远征进度并更新…',
      controlTitle: '操控',
      controlAuto: '自动',
      controlManual: '手动',
      controlAria: '切换操控模式，当前为{mode}',
      controlAutoHint: '自动寻路与战斗',
      controlManualHint: '点地或方向键移动，点怪交战',
      controlChangedAuto: '已切换自动：继续寻路与战斗',
      controlChangedManual: '已切换手动：点地或方向键移动，点怪交战',
      camp: '返回营地',
      campHint: '步行返回营地休整',
      teleportCamp: '传送回营',
      teleportCampHint: '距离较远，将传送返回营地',
      bossCampReturn: '撤离并回营',
      bossCampReturnHint: '安全脱离 Boss 战，头目将撤场并保留一半讨伐进度',
      cancelCampWarp: '取消传送',
      cancelCampWarpHint: '取消传送并返回战斗',
      cancelCampReturn: '取消回营',
      cancelCampReturnHint: '停止前往营地并返回战斗',
      breakCamp: '拔营出战',
      breakCampHint: '结束休整并返回战斗',
      restBuff: '休整增益',
      restingChip: '营火休息 · 生命快速恢复',
      recovering: '重整旗鼓… {s}s',
      bossAppear: '⚔ 讨伐战：{name} 现身！',
      bossKilled: '头目讨伐成功！',
      guardRevealed: '你识破了目标附近的伏击守卫。',
      guardAmbush: '隐藏守卫发动伏击，当前交互已安全中止。',
      guardEngaged: '守卫封锁了目标，必须先结束战斗。',
      guardCleared: '守卫已清除，目标现已解锁。',
      guardLocked: '目标仍由守卫封锁。',
      bossGateLocked: 'Boss 入口仍由门卫封锁。',
      nestDiscovered: '发现一处半开放巢穴。',
      nestChestOpened: '巢穴宝箱：{gold} 金币，{count} 份材料。',
      bossFailed: 'Boss 撤场了，重新积攒讨伐进度再战！',
      bossRetreated: '已安全脱离 Boss 战，头目撤场；保留一半讨伐进度。',
      bossFirstKill: '首次讨伐奖励：魔晶石 ×{n}',
      heroDown: '你倒下了…正撤回营地重整',
      levelUp: '⬆ 升级！Lv.{lv}',
      achUnlocked: '达成成就「{name}」',
      regionUnlocked: '新区域解锁：{name}',
      regionReopened: '通往{name}的道路已重新开启',
      autoAdvanced: '自动推进 → {name}',
      fellback: '连续战败，已撤回{name}。建议强化装备、升级技能后再来！',
      finalRegionLostToast: '魔王城失守，已撤回{name}；再次击败本区 Boss 才能重返魔王城。',
      regionPurified: '区域净化完成',
      travelNewRegion: '新区域抵达',
      travelRegionArrived: '区域抵达',
      travelRouteTitle: '公会远征路线',
      travelDestination: '即将前往「{name}」',
      travelCountdown: '{s} 秒后自动出发',
      travelDeparting: '传送阵正在收束',
      travelCrossing: '穿越区域边界',
      travelArriveRest: '已抵达营地，等待拔营',
      travelArriveBattle: '侦察完成，即将继续讨伐',
      travelReward: '首胜奖励 · 魔晶石 {n}',
      travelFirstEntry: '前方地形未知，营地已建立',
      travelRouteReady: '公会路线已校准',
      travelNow: '立即出发',
      stayRegion: '留在本区',
      travelCancelHint: '无需操作也会自动出发；Esc 可取消本次',
      travelFastForwardHint: '点击画面可结束抵达镜头',
      regionOrdinal: '第 {n} 区 · {name}',
      recoveryTitle: '灵魂重整',
      recoveryFallbackTitle: '前线撤退',
      finalRegionLostTitle: '魔王城失守',
      recoveryAtCamp: '篝火仍在等待',
      recoveryFallback: '撤往「{name}」重整',
      finalRegionRetreat: '撤回「{name}」重整',
      recoveryDown: '意识正在消散',
      recoverySoul: '灵魂正在返回营地',
      recoveryCamp: '传送信标已接引',
      recoveryRiseRest: '重整完成，留营休息',
      recoveryRiseBattle: '重整完成，准备复战',
      recoveryBossNote: '讨伐目标已撤场，进度保留一半',
      recoveryNoPenalty: '经验、金币与战利品不会损失',
      finalRegionRelockNote: '魔王城已重新封锁，须再次击败本区 Boss 开路',
      recoveryFastForwardHint: '点击画面可快进返营演出',
      rareDrop: '获得 {name}！',
      gotItem: '获得 {name}',
      bought: '购买成功',
      exchanged: '兑换成功',
      cantAfford: '货币不足',
      tradeUnavailableTitle: '当前无法交易',
      tradeOutsideCamp: '商店只在当前地图「{region}」的营地范围内开放。',
      tradeBusy: '正在换区、传送或重整，抵达营地并稳定下来后才可交易。',
      tradeNoArea: '当前地图没有可用的交易地点。',
      tradeReturnCamp: '返回当前营地',
      tradeCampAccess: '已进入「{region}」营地交易范围；此处提供常规补给与强化。',
      tradeShopOpenHint: '当前位于可交易区域',
      tradeShopLockedHint: '仅在当前地图的营地范围内开放',
      tradeUnavailableToast: '你已离开当前交易区域',
      tradeNoOffers: '这个交易地点目前没有可用商品。',
      tradeLocationKicker: '当前交易地点',
      tradeLeftArea: '你已离开交易范围，商品暂时锁定；返回后会自动恢复。',
      tradeLockedBrowse: '离域浏览',
      tradeDirectionDistance: '交易点位于{direction}，距离 {distance}px。',
      tradeGoTo: '前往交易点',
      closeTrade: '关闭',
      tradeHud: '交易 · {name}',
      tradeHudAria: '打开{name}交易面板',
      exchangeAction: '兑换',
      tradeSellLow: '批量出售普通与精良装备',
      tradeSellEstimate: '共 {n} 件，预计获得 {g} 金币',
      tradeSalvageLegend: '批量分解未装备传说装备',
      tradeSalvageEstimate: '共 {n} 件，预计获得 {c} 魔晶石',
      tradeSalvaged: '已分解 {n} 件传说装备，获得 {c} 魔晶石',
      sellAction: '出售',
      salvageAction: '分解',
      sellLow: '出售 普通+精良',
      soldN: '出售 {n} 件，+{g} 金币',
      nothingToSell: '没有可出售的低稀有度装备',
      bagEmpty: '背包空空如也，去讨伐魔物吧！',
      potionAuto: '生命 <{p}% 自动喝药',
      quickPotion: '用药',
      materialsTitle: '─ 素材袋（不占背包容量）─',
      autoCampReturning: '休整增益耗尽，自动回营',
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
      itemImplicitTitle: '底材隐含',
      itemAffixTitle: '普通词条',
      itemLegendaryTitle: '传奇效果',
      itemSingleCompare: '单件属性差异',
      itemBuildCompare: '整套模拟（固定 Seed）',
      itemNoAffixes: '无普通词条',
      reforgeTitle: '重铸',
      reforgeNoLock: '不锁定词条',
      reforgeLockHint: '可锁定一条普通词条；其余词条全部重掷。',
      reforgeCost: '第 {n} 次 · {gold} 金币 · {count}×{material}',
      reforgeAction: '确认重铸',
      reforgeDone: '重铸完成',
      reforgeUnavailable: '当前不可重铸：{reason}',
      operationRejected: '操作失败：{reason}',
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
      actorActionsTitle: '{name}',
      actorObserve: '观察',
      actorAttack: '攻击',
      actorAttackConfirm: '主动攻击「{name}」会使其及附近同伴进入敌对状态。确定继续？',
      actorAttackQueued: '攻击指令已提交',
      actorTargetUnavailable: '目标已离开或无法交互',
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
      finalRegionRelocked: '失守 · 需重新解锁',
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
      titleStart: '开始新游戏',
      titleEnter: '点击进入',
      titleViewCamp: '返回营地观景',
      titleArchiveKicker: '冒险者公会 · 登记处',
      titleArchive: '远征档案',
      titleSlotCount: '{current} / {total}',
      titleSlotHint: '选择档案进入露西亚大陆',
      titleLanguage: '切换界面语言',
      titleSlotHero: 'Lv.{level} {className}',
      titleSlotLocation: '驻扎于 {region}',
      titleSlotProgress: '{time} · 远征 {current}/{total}',
      titleContinue: '继续游戏',
      titleSlotDraft: '未完成的冒险者登记',
      titleSlotDraftDesc: '职业与公会誓约仍待确认',
      titleSlotSeed: '世界种子 {seed}',
      titleResumeDraft: '继续登记',
      titleSlotEmpty: '尚未开启的远征',
      titleSlotEmptyDesc: '公会的第一份委托正在等待',
      titleSlotNewWorld: '将生成全新的远征路线',
      titleCreate: '开始新游戏',
      titleBeginKicker: '露西亚大陆 · 新的旅程',
      titleBeginTitle: '开始新游戏',
      titleBeginDesc: '选择职业，签下公会誓约，开启独属于你的远征路线',
      titleBeginAction: '启程',
      titleNewGame: '开始新游戏',
      titleNewGameSub: '将覆盖当前档案',
      titleNewGameConfirm: '开始新游戏将覆盖当前进行中的单档，已有进度无法恢复。确定重新签发远征档案吗？',
      titleDeleteSave: '删除此存档',
      titleDeleteConfirm: '删除此存档将永久清除角色、装备、路线与全部远征进度，且无法恢复。确定删除吗？',
      titleLastSave: '记录于 {time}',
      titleLocalSave: '本机自动存档',
      titleOpeningNew: '公会正在签发远征许可',
      titleOpeningSave: '正在同步远征档案',
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
      offlineSec: '离线挂机', highestRegion: '最远区域',
      pickups: '地面拾取', gathers: '采集次数', materials: '累计素材', chests: '开启宝箱'
    },

    slot: {
      weapon: '武器', head: '头部', body: '身体', feet: '足部', accessory: '饰品',
      armor: '护甲', ring: '饰品'
    },

    rarity: { r0: '普通', r1: '精良', r2: '稀有', r3: '史诗', r4: '传说' },

    item: {
      pattern: '{mat}{base}',
      mat: { 1: '铜制', 2: '铁制', 3: '钢制', 4: '白银', 5: '秘银', 6: '炎金', 7: '星辉', 8: '龙魂' },
      base: {
        weapon: '长剑', head: '头部装备', body: '身体装备', feet: '足部装备', accessory: '饰品',
        armor: '铠甲', ring: '戒指'
      },
      weapon: { fighter: '长剑', rogue: '短匕', mage: '法杖', cleric: '战锤', ranger: '长弓' },
      potion_small: { name: '小型治疗药水' },
      potion_large: { name: '大型治疗药水' },
      healDesc: '恢复 {p}% 最大生命',
      usableDesc: '可主动使用的消耗物品',
      useAria: '使用{name}，持有 {count} 瓶',
      quickAria: '快捷使用{name}，持有 {count} 瓶，冷却 {cd} 秒',
      quickHint: '立即使用下一瓶治疗药水',
      reject: {
        full: '生命值已满', empty: '没有可用药水',
        cooldown: '药水共享冷却中，还需 {s} 秒',
        dead: '倒下时无法使用物品', busy: '当前演出状态无法使用物品',
        missing: '该物品当前不可使用', 'not-ready': '冒险尚未开始',
        unsupported: '该效果尚不可用', failed: '物品使用失败'
      }
    },

    material: {
      herb: '草原药草', berry: '红浆果', mushroom: '雾林蘑菇', resin: '古树树脂',
      ore: '精铁矿', crystal_cluster: '矿脉水晶', ghost_flower: '幽魂花', grave_dust: '墓园灵尘',
      ice_crystal: '雪山冰晶', frost_herb: '霜叶草', fire_core: '熔岩火髓', obsidian: '黑曜石',
      rune_stone: '遗迹符石', aether_shard: '以太晶片', miasma_crystal: '瘴气晶核', demon_horn: '魔角'
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

    equipment: {
      stat: {
        power: '威力', physicalPower: '物理威力', magicPower: '魔法威力', maxHp: '生命',
        armor: '护甲', ward: 'Ward', accuracy: '命中', critChance: '暴击率',
        critMultiplier: '暴击倍率', damageDoneMultiplier: '造成伤害', dodgeChance: '闪避',
        damageReduction: '减伤', tenacity: '韧性', lifesteal: '吸血',
        healthRegenPct: '每秒生命恢复', healingPower: '治疗效果', shieldPower: '护盾效果',
        statusPotency: '状态效能', resourceRegen: '资源恢复', haste: '行动急速',
        gcdSpeed: 'GCD 急速', castSpeed: '施法急速', autoAttackSpeed: '普攻急速',
        cooldownRate: '冷却恢复', moveSpeed: '移动速度', goldMultiplier: '金币获取',
        expMultiplier: '经验获取', dropMultiplier: '装备发现', rarityLuck: '稀有度幸运',
        healingReceivedMultiplier: '受到治疗'
      },
      crit: {
        chance: '{chance}%', guaranteed: '必定 {tier} 阶',
        overflow: '必定 {tier} 阶，{chance}% 概率进入下一阶'
      },
      error: {
        'encounter-active': '战斗进行中', 'not-at-camp': '仅可在营地进行',
        'legacy-item': '旧版物品不可重铸', 'invalid-lock': '锁定词条无效',
        'no-affixes': '该物品没有普通词条', 'nothing-to-reroll': '没有可重掷的词条',
        gold: '金币不足', materials: '地区材料不足', unchanged: '重铸结果未发生变化',
        rollback: '交易已回滚', 'missing-item': '物品不存在', 'class-mismatch': '职业不符',
        unknown: '未知原因'
      }
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

    decor: {
      grassland: {
        clover: '三叶草簇', wildWheat: '野麦穗', dandelions: '蒲公英簇',
        burrow: '兔穴', fallenBranch: '落枝', fairyRing: '妖精菇环'
      },
      forest: {
        mossyLog: '苔藓倒木', redShrooms: '红伞菌簇', conesAcorns: '松果与橡果',
        rootKnot: '盘根树结', leafPile: '落叶堆', fernStones: '蕨叶石丛'
      },
      mine: {
        brokenRail: '断裂矿轨', coalPile: '煤块堆', discardedPick: '废弃矿镐',
        lantern: '矿灯', timberScraps: '坑木碎料', copperRubble: '铜矿碎石'
      },
      graveyard: {
        crackedSlab: '开裂墓板', wiltedFlowers: '枯萎祭花', chainCoil: '锈链盘',
        urnShards: '骨灰瓮碎片', ectoplasm: '灵质水洼', freshMound: '新土坟丘'
      },
      snowpass: {
        iceSpikes: '冰刺簇', snowBones: '覆雪残骨', frostShrub: '霜灌木',
        trailCairn: '路标石堆', frozenPuddle: '冻结水洼', brokenSled: '断裂雪橇'
      },
      lavacave: {
        emberVent: '余烬喷口', sulfurCrystals: '硫晶簇', lavaCrust: '熔岩结壳',
        basaltShards: '玄武岩碎锥', scorchedBones: '焦黑残骨', ashMound: '火山灰堆'
      },
      skyruins: {
        runeTile: '发光符文砖', gearFragment: '古代齿轮残片', marbleRubble: '云岩碎块',
        aetherMotes: '以太浮光', cloudGrass: '云绒草', mosaic: '青金马赛克'
      },
      darkcastle: {
        ritualRune: '猩红仪式纹', ironChain: '铁链盘', bannerScrap: '黑旗残布',
        clawMarks: '恶魔爪痕', purpleFungus: '紫瘴菌簇', gargoyleFragment: '石像鬼残片'
      }
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
      potion_50: { name: '药剂爱好者', desc: '累计使用 50 瓶药水' },
      pickup_100: { name: '颗粒归仓', desc: '累计拾取 100 件地面战利品' },
      gather_50: { name: '荒野采集者', desc: '累计完成 50 次环境采集' },
      material_300: { name: '素材仓库', desc: '累计获得 300 份素材' },
      chest_20: { name: '寻宝专家', desc: '累计开启 20 只随机宝箱' }
    },

    tradeArea: { camp: '前线营地补给处', generic: '区域交易点' },

    tradeKind: {
      merchant: '营地补给', exchange: '素材兑换', wander: '游商', event: '活动摊位'
    },
    merchant: {
      ui: {
        talk: '交谈',
        trade: '查看货物',
        roadGuild: '远路商会',
        leave: '告辞',
        openShop: '打开商店',
        discovered: '发现移动行商：{name}',
        expired: '远处的车铃渐渐消失，移动行商已经离开。',
        escaped: '移动行商的烟幕散去，只留下一笔未清的账。',
        attackQueued: '你拔出了武器。商会会记住这次选择。',
        attackConfirm: '攻击「{name}」不会获得常规经验或掉落。行商会自卫、尝试逃跑，并向商会登记信誉损失与赔偿金。仍要攻击？',
        trust: '商会信誉',
        departure: '离开倒计时',
        hudChip: '行商 {time}',
        hudAria: '移动行商位于{direction}，将在 {time} 后离开',
        debt: '待赔偿',
        band: {
          favored: '信赖',
          normal: '正常',
          wary: '戒备',
          refused: '拒绝交易'
        },
        stock: '余 {n}',
        soldOut: '售罄',
        gearOfferDesc: '{rarity} · Lv.{level} · {affixes}',
        bundleOfferDesc: '{item} 本次库存 {stock} 份。',
        materialOfferDesc: '旅行途中整理的素材包。本次库存 {stock} 份。',
        gotMaterial: '获得 {name} ×{n}',
        haggleTitle: '重新拆箱',
        haggleDesc: '支付 {fee} 金币，仅重排 4 个旅行货架；招牌与稀有藏品保持不变。购买前限一次。',
        haggle: '议价 {fee}',
        haggled: '已重排',
        haggleDone: '普通货架已经重新摆放。',
        haggleUnavailable: '本次会面已无法再次重排货架。',
        tradeRefused: '商会拒绝交易',
        restitutionDesc: '先支付全部赔偿金 {debt}，信誉将恢复到可以交易的最低水平。',
        restitutionOutstanding: '商会赔偿尚未结清',
        restitutionOptionalDesc: '仍有 {debt} 赔偿未结清。你可以现在清账，也可以按当前信誉继续交易。',
        payRestitution: '支付 {debt}',
        restitutionPaid: '赔偿已结清，商会恢复有限交易。',
        surrenderTitle: '行商放下武器',
        surrenderBody: '对方已失去继续作战的能力。这不是一次常规击杀，也没有经验或掉落。你可以放过行商，或抢走一件普通货物；当前待赔偿为 {debt}。',
        spare: '收起武器并放行',
        spared: '你选择了克制。当前待赔偿：{debt}',
        robOffer: '抢走「{name}」· 新增赔偿 {debt}',
        robConfirm: '抢走「{name}」会进一步损失信誉，并按基础货价的两倍追加赔偿。确定？',
        robbed: '商会已登记抢夺。当前待赔偿：{debt}'
      }
    },
    direction: { north: '北侧', south: '南侧', east: '东侧', west: '西侧' },
    shopSec: {
      consume: '补给', gear: '装备', perm: '强化', exchange: '以物换物',
      merchantStaple: '常备', merchantTravel: '旅途货架',
      merchantSignature: '招牌藏品', merchantRare: '稀有藏品',
      sell: '收购', other: '其他'
    },

    shop: {
      shop_potion_small: { name: '小型治疗药水', desc: '恢复 40% 生命。低血量时自动使用。' },
      shop_potion_large: { name: '大型治疗药水', desc: '恢复 85% 生命。小瓶耗尽后自动使用。' },
      shop_gear_gold: { name: '装备补给箱', desc: '开出一件当前等级的随机装备，品质概率略有提升。' },
      shop_gear_crystal: { name: '魔晶装备箱', desc: '必得史诗级装备，20% 概率开出传说！' },
      perm_atk: { name: '力量圣印', desc: '永久攻击力 +5%，可叠加 10 层。' },
      perm_hp: { name: '生命圣印', desc: '永久生命上限 +5%，可叠加 10 层。' },
      perm_gold: { name: '财富圣印', desc: '永久金币获取 +10%，可叠加 10 层。' },
      perm_exp: { name: '智慧圣印', desc: '永久经验获取 +10%，可叠加 10 层。' },
      exchange_potion: { name: '草药调制', desc: '将低阶野外素材合成为 2 瓶小型治疗药水。' },
      exchange_gold: { name: '公会素材委托', desc: '上交林地素材，领取稳定的金币报酬。' },
      exchange_gear: { name: '符文装备箱', desc: '以高阶素材换取至少稀有品质的当前等级装备。' },
      exchange_vitality: { name: '微光生命刻印', desc: '高阶素材与魔晶石共同淬炼，永久生命 +1%，最多 5 层。' }
    },

    settings: {
      language: '语言 Language',
      effects: '氛围与地形特效',
      effectsHint: '关闭可提升低端设备流畅度（粒子/脚印/涟漪等）',
      groundLoot: '掉落拾取',
      groundLootHint: '战斗装备与药水落到世界中自动拾取；关闭会立即保底入包',
      autoCampRest: '自动回营休整',
      autoCampRestHint: '仅自动操控：休整增益耗尽后回营，蓄满后自动复战',
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

    ending: {
      dawnTitle: '黎明重临',
      summaryTitle: '远征终章',
      summarySubtitle: '露西亚大陆重新迎来了黎明。',
      continue: '继续游戏',
      restart: '重开一局',
      restartConfirm: '本次冒险的全部进度将被永久删除。确定要重新启程吗？',
      statClass: '冒险者',
      statPlayTime: '累计游玩',
      statKills: '总讨伐数',
      statBossKills: '头目讨伐',
      statWorldSeed: '世界种子',
      classLevel: '{cls} · Lv.{level}',
      lines: {
        1: '最后一击落下——魔王贝利亚尔的身影，终于在破晓的光芒中崩解。',
        2: '笼罩魔王城的瘴气随风散去，久违的晨曦重新照在露西亚大陆上。',
        3: '从草原到雪山，从熔岩洞窟到浮空遗迹，熄灭已久的灯火一盏盏重新亮起。',
        4: '冒险者公会撤下了最高级别的讨伐令，并将你的名字写入英雄厅的史册。',
        5: '你曾以新晋冒险者之名独自启程。如今，整片大陆都在传颂你的归来。',
        6: '这场讨伐已经结束——但只要你愿意，属于你的冒险仍可继续。'
      }
    },

    prologue: {
      1: '千年之前被勇者封印的魔王，在露西亚大陆的最深处……苏醒了。',
      2: '瘴气自魔王城蔓延而出，草原、森林、矿坑与雪山正相继沦陷。',
      3: '冒险者公会向全大陆发布了最高级别的讨伐令。',
      4: '而你——公会新晋的独行冒险者，将奔赴四处前线之一。',
      5: '净化八方瘴气，直捣魔王城吧！'
    }
  });

  Game.i18n.addPack('zh-CN', {
    material: {
      moon_dew: '月露', river_reed: '河湾芦芯', sunseed: '日辉种',
      silk_moss: '丝绒苔', ancient_bark: '古树皮', glow_spore: '辉光孢子',
      coal_shard: '黑煤晶', cave_salt: '洞盐', deep_geode: '深层晶洞',
      bone_fragment: '遗骨碎片', spirit_wax: '灵烛蜡', nightshade: '夜影草',
      snow_lotus: '雪莲', frozen_ore: '冻矿', griffin_feather: '狮鹫羽',
      magma_bloom: '熔火花', sulfur_stone: '硫磺石', ember_scale: '余烬鳞',
      cloud_silk: '云丝', star_metal: '星铁', wind_crystal: '风晶',
      void_ash: '虚空灰', blood_rose: '血蔷薇', fallen_sigil: '堕落徽记'
    },
    explore: {
      mapTab: '区域地图', codexTab: '区域图鉴',
      coverageLine: '探索覆盖 {p}%', mapAria: '已探索区域地图',
      zoomOut: '缩小地图', zoomIn: '放大地图', centerHero: '定位冒险者',
      readiness: '远征准备度', readinessHint: '当前准备度 {value}/100；发现巢穴并达到 70 方可挑战',
      readyExplore: '探索', readyLandmarks: '地标', readyResources: '资源',
      readyCurios: '奇物', readyGuardian: '守门精英', readyLair: '巢穴',
      yes: '已发现', no: '未发现',
      landmarks: '关键地标', resources: '区域资源', curios: '远征奇物',
      ecology: '稀有生态', registeredHint: '永久登记，不随远征周期重置',
      unknownEntry: '未知记录',
      commissions: '区域委托', exchange: '兑换',
      exchangeDone: '区域委托已完成', exchangeFail: '素材不足或已达强化上限',
      commission: { potions: '前线药剂补给', gold: '公会素材收购', gear: '遗物装备箱', perm: '区域勘察强化' },
      strategy: { safe: '安全', balanced: '均衡', loot: '掠夺' },
      strategyAria: '当前自动远征策略：{strategy}，点击切换',
      aiIntent: 'AI 意图',
      distanceMeters: '{n} 米',
      intent: {
        idle: '观察环境', survival: '生存回营', combat: '接敌战斗',
        'player-order': '执行指令', loot: '回收掉落', frontier: '探索未知',
        discovery: '调查记录', gather: '采集资源', guardian: '讨伐精英',
        boss: '前往巢穴', circuit: '采集巡回', camp: '返回营地',
        'chest-approach': '前往宝藏', chest: '开启宝箱',
        interaction: '专注互动'
      },
      searchClues: '搜寻线索', viewReadiness: '查看准备', goLair: '前往巢穴', challengeBoss: '挑战 Boss',
      curioTitle: '发现远征奇物', curioUnknown: '无名奇物',
      curioPrompt: '选择一种本轮远征效果；另一种效果将被放弃。',
      curio: {
        scout: '洞察', scoutHint: '扩大视野，但不提高直接收益',
        fortune: '寻宝', fortuneHint: '提高掉落，仍需承担原路线风险',
        ward: '守护', wardHint: '降低危险，但不加快探索速度',
        haste: '疾行', hasteHint: '提高移速，但不降低敌人强度'
      },
      threat: { patrol: '巡逻领地', nest: '魔物巢群', ambush: '伏击地带' },
      guardian: {
        grassland: '河湾獠牙', forest: '苔冠守卫', mine: '深井监工', graveyard: '墓门执刑者',
        snowpass: '霜脊哨卫', lavacave: '熔炉看守', skyruins: '天穹裁决者', darkcastle: '黑门禁卫'
      },
      content: {
        grassland: {
          river_watch: '河湾瞭望台', old_waystone: '旧王道碑', windmill_ruin: '风车遗址', slime_nest: '黏液巨巢',
          sun_dial: '苔痕日晷', wanderer_pack: '失落行囊', silver_bell: '银风铃',
          golden_hare: '金原兔', brook_sprite: '溪流精灵'
        },
        forest: {
          whisper_grove: '低语林地', moss_shrine: '苔石神龛', sunken_bridge: '沉没古桥', elder_hollow: '古树空洞',
          root_crown: '根冠', green_lantern: '长明绿灯', hunter_totem: '猎人图腾',
          moon_moth: '月纹蛾', antler_owl: '角羽鸮'
        },
        mine: {
          lift_ruin: '废弃升降台', echo_gallery: '回声矿廊', foreman_post: '监工哨站', golem_foundry: '魔像铸造间',
          miners_dice: '矿工骨骰', blue_lamp: '深蓝矿灯', sealed_charge: '封存爆药',
          crystal_beetle: '晶壳甲虫', blind_newt: '盲眼洞螈'
        },
        graveyard: {
          mourning_gate: '哀悼之门', bell_crypt: '钟鸣地穴', saint_court: '无名圣徒院', black_mausoleum: '黑石陵寝',
          votive_chain: '祈愿锁链', empty_mask: '空面具', last_letter: '未寄出的信',
          candle_crow: '烛羽鸦', pale_fox: '苍白灵狐'
        },
        snowpass: {
          ice_bridge: '断冰桥', pilgrim_shelter: '朝圣者庇所', signal_peak: '烽火峰', giant_crater: '巨人陨坑',
          warm_stone: '恒温石', storm_compass: '风暴罗盘', white_banner: '无字白旗',
          aurora_stag: '极光鹿', snow_wisp: '雪原微灵'
        },
        lavacave: {
          basalt_gate: '玄武岩门', forge_ruin: '失落锻炉', ember_lake: '余烬湖', demon_caldera: '恶魔火山口',
          smiths_tongs: '不熄火钳', ash_hourglass: '灰烬沙漏', cinder_idol: '焦炭神像',
          glass_salamander: '琉璃火蜥', ember_moth: '余烬蛾'
        },
        skyruins: {
          broken_aqueduct: '断裂天渠', star_archive: '星历馆', wind_bridge: '风之桥', guardian_core: '守卫核心',
          sky_chart: '浮空星图', singing_key: '鸣唱钥匙', cloud_prism: '云光棱镜',
          ribbon_ray: '绸带鳐', clockwork_swallow: '发条燕'
        },
        darkcastle: {
          fallen_bastion: '陷落堡垒', silent_throne: '寂静王座', miasma_well: '瘴气井', demon_keep: '魔王主堡',
          oath_blade: '折断誓剑', cracked_crown: '裂冠', dawn_reliquary: '黎明圣匣',
          void_raven: '虚空渡鸦', red_moon_bat: '赤月蝠'
        }
      }
    },
    offline: {
      knownRoute: '已知资源路线', routeLoops: '巡回次数', materials: '采集素材',
      noDiscoveries: '离线远征只使用已登记情报，没有发现新地点。'
    }
  });
  Game.i18n.addPack('zh-CN', {
    weather: {
      label: '当前天气',
      profile: {
        grassland: '草原气候', forest: '林冠气候', mine: '矿坑微气候',
        graveyard: '墓园气候', snowpass: '雪山气候', lavacave: '熔岩洞微气候',
        skyruins: '高空气候', darkcastle: '魔王城外庭气候'
      },
      state: {
        grassland: {
          fair: '晴朗', showers: '阵雨', thunderstorm: '雷暴',
          highWind: '强风', fairyMist: '妖精薄雾'
        },
        forest: {
          gladeLight: '林隙晴光', canopyRain: '林冠雨', muffledStorm: '闷雷暴雨',
          leafGusts: '落叶阵风', spiritMist: '灵雾'
        },
        mine: {
          stillDust: '静尘', vaultDrips: '穹顶渗水', deepTremorDust: '深层震尘',
          dustfall: '尘降', crystalMist: '晶雾'
        },
        graveyard: {
          overcast: '阴云', coldRain: '冷雨', graveStorm: '墓园雷暴',
          coldWind: '寒风', soulFog: '魂雾'
        },
        snowpass: {
          frostClear: '霜晴', snowfall: '降雪', blizzard: '暴风雪与雷雪',
          powderGusts: '粉雪阵风', auroraSnow: '极光雪尘'
        },
        lavacave: {
          embersEase: '余烬平息', steamRise: '蒸汽涌升', magmaFlare: '岩浆耀变',
          ashfall: '灰烬降落', sulfurFog: '硫磺雾'
        },
        skyruins: {
          clearGale: '晴空劲风', rainSquall: '雨飑', highStorm: '高频雷暴',
          crosswind: '横风', aetherVeil: '以太云幕'
        },
        darkcastle: {
          lowMiasma: '瘴气低伏', blackRain: '黑雨', violetStorm: '紫雷暴',
          ashenWind: '灰风', soulSquall: '灵魂飑线'
        }
      }
    }
  });
})();
