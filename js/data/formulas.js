/* ============================================================
 * data/formulas.js — 数值公式集中地（调平衡只改这一处）
 *
 * 【数值设计说明（摘要，详见 README.md）】
 * - 玩家成长采用「升级自动成长」（二选一中选它）：挂机游戏减少打断，
 *   玩家的主动决策放在技能加点/装备/商店三处。
 * - 经验曲线：expNeed(L) = 28·L·1.16^(L-1)，指数增长。
 * - 玩家属性逐级复利：HP×1.075 / ATK×1.07 / DEF×1.065，速度线性小增。
 * - 区域怪物按 tier 指数缩放（≈2.05^(t-1)），与玩家「等级+装备」的
 *   复合成长率匹配：每个区域预期停留 8~10 级，装备提供约 35%~55% 的
 *   额外战力，使推图节奏保持「入区偏难 → 毕业碾压」。
 * - 伤害公式：dmg = atk² / (atk + def)，平滑减伤无硬墙。
 * - 离线收益：kills = 时长 / (击杀耗时 + 位移开销) × 0.8 效率系数。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var F = Game.F = {};

  /* ---------------- 平衡常数 ---------------- */
  F.BAL = {
    // 玩家逐级通用成长（职业基础值与复利见 data/classes.js）
    spdPerLv: 0.25, critPerLv: 0.001, critDmgPerLv: 0.01,
    critCap: 0.4,
    // 全局上限
    dodgeCap: 0.35, cdrCap: 0.4,
    // 经验曲线
    expBase: 28, expGrow: 1.16,
    // 怪物 tier 缩放
    mScale: 2.05,
    mBaseHp: 55, mBaseAtk: 8, mBaseDef: 3,
    mBaseExp: 12, mBaseGold: 7,
    // Boss 倍率
    bossHp: 11, bossAtk: 2.0, bossDef: 2.0, bossExp: 18, bossGold: 14,
    // 攻击间隔
    atkIntervalBase: 1.7, // spd=10 时 ≈1.13s/击
    // 掉落
    dropEquip: 0.16, dropPotion: 0.07,
    // 离线
    offlineEff: 0.8, offlineTravel: 2.5, offlineItemCap: 30,
    // 休整增益
    restRegenPct: 0.05,       // 每秒回复最大生命 5%
    restBuffRatio: 2,         // 休息 1s → 增益 2s
    restBuffCap: 1800,        // 增益上限 30 分钟
    restExpBonus: 0.15, restDropBonus: 0.10,
    // 药水
    potionCd: 8,
    // 日夜
    dayLength: 1200           // 20 分钟一昼夜（秒）
  };
  var B = F.BAL;

  /* ---------------- 玩家 ---------------- */
  F.expNeed = function (lv) {
    return Math.floor(B.expBase * lv * Math.pow(B.expGrow, lv - 1));
  };

  /** 职业定义 + 等级 → 裸属性（不含装备/技能/永久强化） */
  F.playerBase = function (cls, lv) {
    var g = lv - 1;
    var b = cls.base, gr = cls.grow;
    return {
      hp: Math.round(b.hp * Math.pow(gr.hp, g)),
      atk: Math.round(b.atk * Math.pow(gr.atk, g)),
      def: Math.round(b.def * Math.pow(gr.def, g)),
      spd: +(b.spd + B.spdPerLv * g).toFixed(2),
      crit: Math.min(B.critCap, b.crit + B.critPerLv * g),
      critDmg: b.critDmg + B.critDmgPerLv * g
    };
  };

  /* ---------------- 怪物 ---------------- */
  /** tier(1..8) + 变体系数 → 怪物属性 */
  F.monsterStats = function (tier, mods, isBoss) {
    mods = mods || {};
    var s = Math.pow(B.mScale, tier - 1);
    var st = {
      hp: Math.round(B.mBaseHp * s * (mods.hp || 1)),
      atk: Math.round(B.mBaseAtk * Math.pow(s, 0.95) * (mods.atk || 1)),
      def: Math.round(B.mBaseDef * Math.pow(s, 0.9) * (mods.def || 1)),
      spd: +(8 + tier * 0.5 + (mods.spd || 0)).toFixed(2),
      exp: Math.round(B.mBaseExp * Math.pow(1.95, tier - 1) * (mods.exp || 1)),
      gold: Math.round(B.mBaseGold * Math.pow(1.9, tier - 1) * (mods.gold || 1))
    };
    if (isBoss) {
      st.hp = Math.round(st.hp * B.bossHp);
      st.atk = Math.round(st.atk * B.bossAtk);
      st.def = Math.round(st.def * B.bossDef);
      st.exp = Math.round(st.exp * B.bossExp);
      st.gold = Math.round(st.gold * B.bossGold);
      st.spd += 1;
    }
    return st;
  };

  /** Boss 首杀魔晶石奖励 */
  F.bossCrystal = function (tier) { return 15 + tier * 10; };

  /* ---------------- 战斗 ---------------- */
  /** 平滑减伤伤害公式（±10% 浮动、暴击另算） */
  F.damage = function (atk, def) {
    var raw = atk * atk / (atk + Math.max(0, def));
    return Math.max(1, raw * U.rand(0.9, 1.1));
  };

  /** 速度 → 攻击间隔（秒）：spd 每 +10 攻速约 +50% */
  F.atkInterval = function (spd) {
    return B.atkIntervalBase * 10 / (5 + spd * 0.5);
  };

  /* ---------------- 装备 ---------------- */
  /** 装备主属性成长（按物品等级） */
  F.gearPrimary = function (ilvl) {
    return Math.round((5 + ilvl * 1.35) * Math.pow(1.045, ilvl));
  };
  F.RARITY = [
    { id: 'r0', mult: 1.0, affixes: 0, weight: 47, sell: 0.6 },
    { id: 'r1', mult: 1.15, affixes: 1, weight: 30, sell: 1.0 },
    { id: 'r2', mult: 1.35, affixes: 2, weight: 15, sell: 2.2 },
    { id: 'r3', mult: 1.6, affixes: 3, weight: 6.5, sell: 5.0 },
    { id: 'r4', mult: 2.0, affixes: 4, weight: 1.5, sell: 12 }
  ];
  F.rollRarity = function (luck) {
    var w = [], total = 0, i;
    for (i = 0; i < F.RARITY.length; i++) {
      var wt = F.RARITY[i].weight;
      if (i >= 3 && luck) wt *= luck; // 掉率加成偏向高稀有
      w.push(wt); total += wt;
    }
    var r = Math.random() * total;
    for (i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return 0;
  };
  /** 装备出售价 */
  F.sellPrice = function (ilvl, rar) {
    return Math.max(1, Math.round(3 * Math.pow(1.14, ilvl) * F.RARITY[rar].sell));
  };
  /** 传说分解魔晶石 */
  F.salvageCrystal = function (ilvl) { return 12 + Math.floor(ilvl / 8); };

  /* ---------------- 药水 ---------------- */
  F.potionHeal = { potion_small: 0.4, potion_large: 0.85 }; // 最大生命百分比
  F.potionPrice = function (pid, tier) {
    var base = pid === 'potion_small' ? 30 : 220;
    return Math.round(base * Math.pow(1.75, (tier || 1) - 1));
  };

  /* ---------------- 商店 ---------------- */
  /** 金币装备箱价格（按玩家等级） */
  F.gearBoxPrice = function (lv) {
    return Math.round(120 * Math.pow(1.115, lv));
  };
  /** 永久强化价格（魔晶石）：第 n 层 */
  F.permPrice = function (owned) {
    return Math.round(10 * Math.pow(1.6, owned));
  };
  F.PERM_MAX = 10;

  /* ---------------- 离线收益 ---------------- */
  /**
   * 估算离线战斗收益。
   * dps: 玩家有效每秒伤害；mHp/mExp/mGold: 当前区域普通怪均值。
   */
  F.offlineGains = function (seconds, dps, mHp, mExp, mGold, mults) {
    mults = mults || {};
    var ttk = U.clamp(mHp / Math.max(1, dps), 0.8, 25);
    var perKill = ttk + B.offlineTravel;
    var kills = Math.floor(seconds / perKill * B.offlineEff);
    if (kills < 0) kills = 0;
    return {
      seconds: seconds,
      kills: kills,
      exp: Math.round(kills * mExp * (mults.exp || 1)),
      gold: Math.round(kills * mGold * (mults.gold || 1)),
      items: Math.min(Math.floor(kills * B.dropEquip * (mults.drop || 1)), B.offlineItemCap),
      potions: Math.min(Math.floor(kills * B.dropPotion), 20)
    };
  };
})();
