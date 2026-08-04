/* Formal five-slot equipment, affix, loot and reforge vocabulary. */
(function () {
  'use strict';
  var Game = window.Game;
  var ALL_SLOTS = ['weapon', 'head', 'body', 'feet', 'accessory'];

  function fixed(stat, value, operation) {
    return { stat: stat, phase: 'equipmentFlat', operation: operation || 'add', roll: { kind: 'fixed', value: value } };
  }
  function budget(stat, coefficient) {
    return { stat: stat, phase: 'equipmentFlat', operation: 'add', roll: { kind: 'budget', coefficient: coefficient } };
  }
  function range(stat, kind, min, max, operation) {
    return { stat: stat, phase: 'equipmentFlat', operation: operation || 'add', roll: { kind: kind, min: min, max: max } };
  }
  function base(id, slotId, modifiers, zh, en) {
    return {
      id: id, slotId: slotId, implicitModifiers: modifiers,
      presentation: { nameKey: 'equipment.base.' + id.replace('.', '_') + '.name' },
      _zh: zh, _en: en
    };
  }
  function affix(id, family, weight, slots, modifiers, zh, en) {
    return {
      id: id, kind: 'normal', family: family, weight: weight, slots: slots,
      modifiers: modifiers,
      presentation: { nameKey: 'equipment.affix.' + id.replace('.', '_') + '.name' },
      _zh: zh, _en: en
    };
  }
  function legendary(id, effectId, zh, en, zhDesc, enDesc, modifiers) {
    return {
      id: id, kind: 'legendary', family: 'legendary', weight: 100,
      slots: ALL_SLOTS, modifiers: modifiers || [], effectProfileId: effectId,
      uniqueEquipped: true,
      presentation: {
        nameKey: 'equipment.affix.' + id.replace('.', '_') + '.name',
        descKey: 'equipment.affix.' + id.replace('.', '_') + '.desc'
      },
      _zh: zh, _en: en, _zhDesc: zhDesc, _enDesc: enDesc
    };
  }

  var bases = [
    base('weapon.vanguard', 'weapon', [budget('classPower', .86), budget('armor', .05)], '先锋武器', 'Vanguard Weapon'),
    base('weapon.duelist', 'weapon', [budget('classPower', .82), fixed('critChance', .03)], '决斗武器', 'Duelist Weapon'),
    base('weapon.executioner', 'weapon', [budget('classPower', .96), fixed('critMultiplier', .10)], '处刑武器', 'Executioner Weapon'),
    base('weapon.channeler', 'weapon', [budget('classPower', .78), fixed('resourceRegen', .08), fixed('healingPower', .08, 'addPct')], '导能武器', 'Channeling Weapon'),
    base('head.greathelm', 'head', [budget('maxHp', .55), budget('armor', .10)], '重盔', 'Greathelm'),
    base('head.mystic_hood', 'head', [budget('maxHp', .45), budget('ward', .11)], '秘法兜帽', 'Mystic Hood'),
    base('head.scout_cowl', 'head', [budget('maxHp', .42), fixed('haste', .04, 'addPct')], '斥候兜帽', 'Scout Cowl'),
    base('body.plate', 'body', [budget('maxHp', 2.20), budget('armor', .24)], '板甲', 'Plate Armor'),
    base('body.vestment', 'body', [budget('maxHp', 1.85), budget('ward', .25)], '法衣', 'Mystic Vestment'),
    base('body.brigandine', 'body', [budget('maxHp', 1.90), budget('armor', .12), budget('ward', .12)], '混合甲', 'Brigandine'),
    base('feet.greaves', 'feet', [budget('maxHp', .45), budget('armor', .07), fixed('tenacity', .05)], '胫甲', 'Greaves'),
    base('feet.swift_boots', 'feet', [budget('maxHp', .38), fixed('dodgeChance', .025), fixed('moveSpeed', .04, 'addPct')], '迅捷靴', 'Swift Boots'),
    base('feet.pilgrim_steps', 'feet', [budget('maxHp', .40), fixed('cooldownRate', .04, 'addPct'), fixed('resourceRegen', .05)], '朝圣鞋', 'Pilgrim Steps'),
    base('accessory.signet', 'accessory', [budget('classPower', .22), fixed('critChance', .02)], '印戒', 'Signet'),
    base('accessory.talisman', 'accessory', [budget('maxHp', .80), fixed('healingPower', .06, 'addPct'), fixed('shieldPower', .06, 'addPct')], '护符', 'Talisman'),
    base('accessory.hourglass', 'accessory', [budget('maxHp', .45), fixed('haste', .03, 'addPct'), fixed('cooldownRate', .03, 'addPct')], '沙漏', 'Hourglass'),
    base('accessory.compass', 'accessory', [budget('maxHp', .40), fixed('goldMultiplier', .06), fixed('rarityLuck', .05)], '罗盘', 'Compass')
  ];

  var normal = [
    affix('normal.power', 'offense', 100, ['weapon', 'accessory'], [range('classPower', 'budgetRange', .14, .22)], '强能', 'Empowered'),
    affix('normal.damage', 'offense', 45, ['weapon', 'body', 'accessory'], [range('damageDoneMultiplier', 'range', .02, .05)], '残暴', 'Brutal'),
    affix('normal.crit_chance', 'offense', 75, ['weapon', 'head', 'accessory'], [range('critChance', 'range', .02, .06)], '精准', 'Precise'),
    affix('normal.crit_damage', 'offense', 75, ['weapon', 'body', 'accessory'], [range('critMultiplier', 'range', .08, .18)], '凶猛', 'Ferocious'),
    affix('normal.accuracy', 'offense', 60, ['weapon', 'head', 'accessory'], [range('accuracy', 'range', .015, .04)], '专注', 'Focused'),
    affix('normal.health', 'defense', 100, ['head', 'body', 'feet', 'accessory'], [range('maxHp', 'budgetRange', .45, .75)], '活力', 'Vital'),
    affix('normal.armor', 'defense', 100, ['head', 'body', 'feet'], [range('armor', 'budgetRange', .06, .10)], '铠装', 'Armored'),
    affix('normal.ward', 'defense', 100, ['head', 'body', 'accessory'], [range('ward', 'budgetRange', .06, .10)], '结界', 'Warded'),
    affix('normal.dodge', 'defense', 60, ['head', 'feet', 'accessory'], [range('dodgeChance', 'range', .015, .04)], '轻灵', 'Elusive'),
    affix('normal.reduction', 'defense', 45, ['head', 'body', 'feet'], [range('damageReduction', 'range', .015, .04)], '守御', 'Guarded'),
    affix('normal.tenacity', 'defense', 60, ['head', 'body', 'feet'], [range('tenacity', 'range', .04, .10)], '坚忍', 'Resolute'),
    affix('normal.lifesteal', 'sustain', 60, ['weapon', 'accessory'], [range('lifesteal', 'range', .008, .025)], '汲取', 'Leeching'),
    affix('normal.regeneration', 'sustain', 60, ['body', 'feet', 'accessory'], [range('healthRegenPct', 'range', .0015, .006)], '复苏', 'Restorative'),
    affix('normal.healing', 'sustain', 60, ['weapon', 'body', 'accessory'], [range('healingPower', 'range', .05, .12, 'addPct')], '仁慈', 'Merciful'),
    affix('normal.shield', 'sustain', 60, ['head', 'body', 'accessory'], [range('shieldPower', 'range', .06, .15, 'addPct')], '庇护', 'Sheltering'),
    affix('normal.status', 'sustain', 60, ['weapon', 'head', 'accessory'], [range('statusPotency', 'range', .04, .10)], '灌注', 'Infused'),
    affix('normal.resource', 'sustain', 60, ['weapon', 'feet', 'accessory'], [range('resourceRegen', 'range', .04, .10)], '充盈', 'Flowing'),
    affix('normal.haste', 'tempo', 75, ['weapon', 'head', 'feet', 'accessory'], [range('haste', 'range', .02, .05, 'addPct')], '迅捷', 'Hasty'),
    affix('normal.cooldown', 'tempo', 75, ['head', 'feet', 'accessory'], [range('cooldownRate', 'range', .02, .05, 'addPct')], '循环', 'Cycling'),
    affix('normal.movement', 'tempo', 60, ['feet', 'accessory'], [range('moveSpeed', 'range', .03, .08, 'addPct')], '远行', 'Wayfaring'),
    affix('normal.gold', 'economy', 35, ['head', 'body', 'feet', 'accessory'], [range('goldMultiplier', 'range', .04, .10)], '贪婪', 'Prosperous'),
    affix('normal.experience', 'economy', 35, ['head', 'body', 'feet', 'accessory'], [range('expMultiplier', 'range', .04, .10)], '求知', 'Learned'),
    affix('normal.find', 'economy', 35, ['head', 'body', 'feet', 'accessory'], [range('dropMultiplier', 'range', .03, .08)], '寻获', 'Scavenging'),
    affix('normal.luck', 'economy', 35, ['head', 'body', 'feet', 'accessory'], [range('rarityLuck', 'range', .03, .08)], '幸运', 'Fortunate')
  ];

  var legendaryEffects = [
    { id: 'legendary.critical_echo', trigger: { event: 'combat:hit', owner: 'source', critical: true, minCritTier: 2 }, operation: 'echoDamage', coefficient: .30 },
    { id: 'legendary.fracturing_mark', trigger: { event: 'combat:hit', owner: 'source', critical: true }, operation: 'fracture', durationTicks: 120, perTier: .02, maxStacks: 5 },
    { id: 'legendary.precision_aegis', trigger: { event: 'combat:hit', owner: 'source', critical: true }, operation: 'critShield', maxHpPerTier: .025, internalCooldownTicks: 20 },
    { id: 'legendary.critical_reservoir', trigger: { event: 'combat:hit', owner: 'source', critical: true, minCritTier: 2 }, operation: 'restorePrimaryResource', maxResourcePerExtraTier: .04, internalCooldownTicks: 20 },
    { id: 'legendary.time_break', trigger: { event: 'combat:hit', owner: 'source', critical: true }, operation: 'reduceCooldowns', ticksPerTier: 2, perSecondLimitTicks: 20 },
    { id: 'legendary.calibration', trigger: { event: 'combat:hit', owner: 'source' }, operation: 'calibration', critChancePerStack: .08, maxStacks: 5 },
    { id: 'legendary.blood_trace', trigger: { event: 'combat:hit', owner: 'source', critical: true }, operation: 'bleedSnapshot', coefficient: .40, durationTicks: 80 },
    { id: 'legendary.apex', trigger: { event: 'combat:hit', owner: 'source', critical: true, minCritTier: 3 }, operation: 'apex', executeHpPct: .15, bossEcho: .15 },
    { id: 'legendary.mercy_prism', trigger: { event: 'combat:healed', owner: 'source', critical: true }, operation: 'healCritShield', coefficient: .35, targetMaxHpCap: .20 },
    { id: 'legendary.last_stand', trigger: { event: 'combat:tick', owner: 'self' }, operation: 'lowHealthModifier', hpPct: .35, damageReduction: .15, healingReceived: .25 },
    { id: 'legendary.bastion', trigger: { event: 'combat:damaged', owner: 'target' }, operation: 'heavyHitShield', thresholdMaxHp: .15, shieldMaxHp: .20, durationTicks: 100, internalCooldownTicks: 200 },
    { id: 'legendary.momentum', trigger: { event: 'action:committed', owner: 'source' }, operation: 'distinctActionHaste', windowTicks: 120, distinctCount: 3, haste: .15, durationTicks: 120, internalCooldownTicks: 240 },
    { id: 'legendary.energy_loop', trigger: { event: 'resource:spent', owner: 'source' }, operation: 'resourceSpendAccumulator', thresholdMax: 1, refundMax: .20 },
    { id: 'legendary.overflowing_grace', trigger: { event: 'combat:healed', owner: 'source' }, operation: 'overhealShield', coefficient: .35, targetMaxHpCap: .20 },
    { id: 'legendary.trailblazer', trigger: { event: 'combat:hit', owner: 'source' }, operation: 'movementChargeDamage', distance: 64, damageBonus: .25 },
    { id: 'legendary.treasure_covenant', trigger: { event: 'passive', owner: 'self' }, operation: 'static' }
  ];
  var legendaryNames = [
    ['critical_echo', '暴击回响', 'Critical Echo', '二阶以上暴击追加已结算伤害 30% 的回响。回响不可暴击或再次触发效果。', 'Critical hits of tier II or higher echo 30% of committed damage. Echoes cannot crit or trigger effects.'],
    ['fracturing_mark', '破甲烙印', 'Fracturing Mark', '暴击按层级施加 6 秒易伤，每层使目标承伤提高 2%，最多 5 层。', 'Critical hits apply Vulnerability for 6 seconds per tier. Each stack increases damage taken by 2%, up to 5.'],
    ['precision_aegis', '精准壁垒', 'Precision Aegis', '暴击获得相当于 2.5% 最大生命乘以暴击层级的护盾，内置冷却 1 秒。', 'Critical hits grant a shield equal to 2.5% max HP per crit tier. 1-second internal cooldown.'],
    ['critical_reservoir', '临界蓄能', 'Critical Reservoir', '二阶以上暴击按额外层级恢复 4% 主资源，内置冷却 1 秒。', 'Critical hits of tier II or higher restore 4% primary resource per extra tier. 1-second internal cooldown.'],
    ['time_break', '时断', 'Time Break', '暴击按层级使所有非普攻冷却减少 2 tick，每秒最多减少 20 tick。', 'Critical hits reduce all non-auto cooldowns by 2 ticks per tier, capped at 20 ticks per second.'],
    ['calibration', '校准', 'Calibration', '未暴击时获得 8% 暴击率，最多 5 层；下一次暴击清除全部层数。', 'Non-critical hits grant 8% crit chance, up to 5 stacks. The next critical hit clears all stacks.'],
    ['blood_trace', '血痕', 'Blood Trace', '暴击造成相当于本次伤害 40% 的 4 秒流血；只保留最高伤害快照。', 'Critical hits inflict a 4-second bleed for 40% of the hit. Only the strongest snapshot remains.'],
    ['apex', '顶点', 'Apex', '三阶以上暴击斩杀生命低于 15% 的非 Boss；对 Boss 改为 15% 回响。', 'Tier III or higher critical hits execute non-boss targets below 15% HP; bosses take a 15% echo instead.'],
    ['mercy_prism', '慈悲棱镜', 'Mercy Prism', '治疗暴击将有效治疗的 35% 转为护盾，单目标上限为其 20% 最大生命。', 'Critical heals convert 35% of effective healing into a shield, capped at 20% of the target\'s max HP.'],
    ['last_stand', '背水', 'Last Stand', '生命低于 35% 时获得 15% 减伤和 25% 受治疗加成。', 'Below 35% HP, gain 15% damage reduction and 25% increased healing received.'],
    ['bastion', '不屈堡垒', 'Bastion', '单次损失至少 15% 最大生命时获得 20% 最大生命护盾，持续 5 秒，内置冷却 10 秒。', 'Losing at least 15% max HP from one hit grants a 20% max HP shield for 5 seconds. 10-second internal cooldown.'],
    ['momentum', '连携动量', 'Linked Momentum', '6 秒内使用三个不同 GCD 行动后获得 15% 急速，持续 6 秒，内置冷却 12 秒。', 'Using three different GCD actions within 6 seconds grants 15% haste for 6 seconds. 12-second internal cooldown.'],
    ['energy_loop', '能量回路', 'Energy Loop', '累计消耗一整条主资源后返还 20%，进度使用确定性累加。', 'After spending one full primary resource bar in total, refund 20%. Progress uses a deterministic accumulator.'],
    ['overflowing_grace', '充盈恩典', 'Overflowing Grace', '将 35% 过量治疗转为护盾，单目标上限为其 20% 最大生命。', 'Convert 35% of overhealing into a shield, capped at 20% of the target\'s max HP.'],
    ['trailblazer', '开路者', 'Trailblazer', '累计移动 64px 后，下一次直接伤害提高 25%，触发后重新累计。', 'After moving 64px in total, your next direct damage deals 25% more, then movement accumulation restarts.'],
    ['treasure_covenant', '寻宝契约', 'Treasure Covenant', '装备发现和稀有度幸运各提高 15%，但造成伤害降低 8%。', 'Gain 15% equipment find and rarity luck, but deal 8% less damage.']
  ];
  var legendaryAffixes = legendaryNames.map(function (row) {
    var modifiers = row[0] === 'treasure_covenant' ? [
      { stat: 'dropMultiplier', phase: 'equipmentFlat', operation: 'add', value: .15 },
      { stat: 'rarityLuck', phase: 'equipmentFlat', operation: 'add', value: .15 },
      { stat: 'damageDoneMultiplier', phase: 'equipmentFlat', operation: 'add', value: -.08 }
    ] : [];
    return legendary('legendary.' + row[0], 'legendary.' + row[0], row[1], row[2], row[3], row[4], modifiers);
  });

  var zhBase = {}, enBase = {}, zhAffix = {}, enAffix = {};
  bases.forEach(function (entry) {
    var key = entry.id.replace('.', '_');
    zhBase[key] = { name: entry._zh }; enBase[key] = { name: entry._en };
    delete entry._zh; delete entry._en;
  });
  normal.concat(legendaryAffixes).forEach(function (entry) {
    var key = entry.id.replace('.', '_');
    zhAffix[key] = { name: entry._zh }; enAffix[key] = { name: entry._en };
    if (entry._zhDesc) zhAffix[key].desc = entry._zhDesc;
    if (entry._enDesc) enAffix[key].desc = entry._enDesc;
    delete entry._zh; delete entry._en; delete entry._zhDesc; delete entry._enDesc;
  });

  Game.content.registerPack({
    id: 'core.equipment', version: '1.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/rules/equipment.pack.js',
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    locales: {
      'zh-CN': { equipment: { base: zhBase, affix: zhAffix } },
      en: { equipment: { base: enBase, affix: enAffix } }
    },
    definitions: {
      itemSlot: [
        { id: 'weapon', order: 0, icon: 'icon_weapon' },
        { id: 'head', order: 1, icon: 'icon_armor' },
        { id: 'body', order: 2, icon: 'icon_armor' },
        { id: 'feet', order: 3, icon: 'icon_skill_swift' },
        { id: 'accessory', order: 4, icon: 'icon_ring' }
      ],
      itemBase: bases,
      itemRarity: [
        { id: 'common', rank: 0, implicitMultiplier: 1, normalAffixCount: 0, sellMultiplier: .6 },
        { id: 'fine', rank: 1, implicitMultiplier: 1.08, normalAffixCount: 1, sellMultiplier: 1 },
        { id: 'rare', rank: 2, implicitMultiplier: 1.18, normalAffixCount: 2, sellMultiplier: 2.2 },
        { id: 'epic', rank: 3, implicitMultiplier: 1.30, normalAffixCount: 3, sellMultiplier: 5 },
        { id: 'legendary', rank: 4, implicitMultiplier: 1.42, normalAffixCount: 3, legendaryAffixCount: 1, sellMultiplier: 12 }
      ],
      itemAffix: normal.concat(legendaryAffixes),
      itemAffixPool: [
        { id: 'equipment.normal', affixIds: normal.map(function (x) { return x.id; }), familyLimits: { offense: 2, defense: 2, sustain: 1, tempo: 1, economy: 1 } },
        { id: 'equipment.legendary', affixIds: legendaryAffixes.map(function (x) { return x.id; }), familyLimits: { legendary: 1 } }
      ],
      effectProfile: legendaryEffects,
      lootTable: [{
        id: 'equipment.standard', rarityWeights: [48, 30, 15, 6, 1],
        equipmentChance: { regular: .08, rare: .25, guardian: .25, chest: .20, nestShallow: .55, nestDeep: .75, boss: 1, rareChest: 1, mimic: 1, expedition: 1 },
        equipmentPity: 10, epicPity: 12, legendaryPity: 40
      }],
      reforgeProfile: [{
        id: 'equipment.standard', goldBaseFactor: .35,
        goldLinearFactor: .18, goldQuadraticFactor: .04, materialMax: 8
      }]
    }
  });
})();
