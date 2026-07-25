/* ============================================================
 * data/skills.js — 职业技能表（5 职业 × 各 3 主动 + 3 被动）
 * 通用 schema：kind = strike | aoe | heal | buff | shield，
 * 战斗系统提供统一执行器；被动 bonus 为「每级线性」数值。
 * 数值取法：F.skillVal({base, per}, lv) = base + per×(lv-1)
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  Game.F.skillVal = function (v, lv) {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return v;
    return v.base + (v.per || 0) * (lv - 1);
  };
  var V = Game.F.skillVal;
  function pct(v, lv) { return Math.round(V(v, lv) * 100); }

  var S = [
    /* ================= 战士 Fighter ================= */
    {
      id: 'ft_heavy', cls: 'fighter', type: 'active', icon: 'icon_skill_strike',
      unlockLv: 1, cd: 6, kind: 'strike', mult: { base: 2.3, per: 0.15 },
      descVars: function (lv) { return { v: pct(this.mult, lv) }; }
    },
    {
      id: 'ft_tough', cls: 'fighter', type: 'passive', icon: 'icon_skill_guard',
      unlockLv: 2, bonus: { defPct: 0.06, hpPct: 0.05 },
      descVars: function (lv) { return { v: Math.round(6 * lv), v2: Math.round(5 * lv) }; }
    },
    {
      id: 'ft_whirl', cls: 'fighter', type: 'active', icon: 'icon_skill_whirl',
      unlockLv: 3, cd: 11, kind: 'aoe', center: 'self', radius: 64,
      mult: { base: 1.5, per: 0.1 },
      descVars: function (lv) { return { v: pct(this.mult, lv) }; }
    },
    {
      id: 'ft_mastery', cls: 'fighter', type: 'passive', icon: 'icon_skill_might',
      unlockLv: 4, bonus: { atkPct: 0.05 },
      descVars: function (lv) { return { v: Math.round(5 * lv) }; }
    },
    {
      id: 'ft_warcry', cls: 'fighter', type: 'active', icon: 'icon_skill_might',
      unlockLv: 5, cd: 20, kind: 'buff',
      buff: { dur: 8, mods: { atkPct: { base: 0.15, per: 0.02 }, defPct: { base: 0.15, per: 0.02 } } },
      descVars: function (lv) { return { v: pct(this.buff.mods.atkPct, lv), s: this.buff.dur }; }
    },
    {
      id: 'ft_second', cls: 'fighter', type: 'passive', icon: 'icon_skill_heal',
      unlockLv: 6, bonus: { regen: 0.0025 },
      descVars: function (lv) { return { v: (0.25 * lv).toFixed(2) }; }
    },

    /* ================= 盗贼 Rogue ================= */
    {
      id: 'rg_backstab', cls: 'rogue', type: 'active', icon: 'icon_skill_strike',
      unlockLv: 1, cd: 5, kind: 'strike', mult: { base: 1.9, per: 0.13 }, critBonus: 0.25,
      descVars: function (lv) { return { v: pct(this.mult, lv) }; }
    },
    {
      id: 'rg_swift', cls: 'rogue', type: 'passive', icon: 'icon_skill_swift',
      unlockLv: 2, bonus: { spdPct: 0.025 },
      descVars: function (lv) { return { v: (2.5 * lv).toFixed(1) }; }
    },
    {
      id: 'rg_poison', cls: 'rogue', type: 'active', icon: 'icon_skill_poison',
      unlockLv: 3, cd: 9, kind: 'strike', mult: { base: 1.2, per: 0.08 },
      dot: { mult: { base: 0.8, per: 0.08 }, dur: 4 },
      descVars: function (lv) { return { v: pct(this.mult, lv), v2: pct(this.dot.mult, lv), s: this.dot.dur }; }
    },
    {
      id: 'rg_deadly', cls: 'rogue', type: 'passive', icon: 'icon_skill_strike',
      unlockLv: 4, bonus: { crit: 0.012, critDmg: 0.05 },
      descVars: function (lv) { return { v: (1.2 * lv).toFixed(1), v2: Math.round(5 * lv) }; }
    },
    {
      id: 'rg_flurry', cls: 'rogue', type: 'active', icon: 'icon_skill_whirl',
      unlockLv: 5, cd: 12, kind: 'aoe', center: 'self', radius: 60,
      mult: { base: 1.3, per: 0.08 },
      descVars: function (lv) { return { v: pct(this.mult, lv) }; }
    },
    {
      id: 'rg_evasion', cls: 'rogue', type: 'passive', icon: 'icon_skill_guard',
      unlockLv: 6, bonus: { dodge: 0.015 },
      descVars: function (lv) { return { v: (1.5 * lv).toFixed(1) }; }
    },

    /* ================= 法师 Wizard ================= */
    {
      id: 'mg_fireball', cls: 'mage', type: 'active', icon: 'icon_skill_fire',
      unlockLv: 1, cd: 7, kind: 'strike', mult: { base: 2.6, per: 0.18 }, projectile: 'fire',
      descVars: function (lv) { return { v: pct(this.mult, lv) }; }
    },
    {
      id: 'mg_mastery', cls: 'mage', type: 'passive', icon: 'icon_skill_fire',
      unlockLv: 2, bonus: { atkPct: 0.06 },
      descVars: function (lv) { return { v: Math.round(6 * lv) }; }
    },
    {
      id: 'mg_nova', cls: 'mage', type: 'active', icon: 'icon_skill_whirl',
      unlockLv: 3, cd: 12, kind: 'aoe', center: 'target', radius: 60,
      mult: { base: 1.6, per: 0.1 },
      descVars: function (lv) { return { v: pct(this.mult, lv) }; }
    },
    {
      id: 'mg_surge', cls: 'mage', type: 'passive', icon: 'icon_skill_swift',
      unlockLv: 4, bonus: { cdr: 0.02 },
      descVars: function (lv) { return { v: Math.round(2 * lv) }; }
    },
    {
      id: 'mg_barrier', cls: 'mage', type: 'active', icon: 'icon_skill_guard',
      unlockLv: 5, cd: 18, kind: 'shield', shieldPct: { base: 0.2, per: 0.02 },
      descVars: function (lv) { return { v: pct(this.shieldPct, lv) }; }
    },
    {
      id: 'mg_armor', cls: 'mage', type: 'passive', icon: 'icon_skill_guard',
      unlockLv: 6, bonus: { hpPct: 0.04, defPct: 0.04 },
      descVars: function (lv) { return { v: Math.round(4 * lv) }; }
    },

    /* ================= 牧师 Cleric ================= */
    {
      id: 'cl_smite', cls: 'cleric', type: 'active', icon: 'icon_skill_strike',
      unlockLv: 1, cd: 6, kind: 'strike', mult: { base: 2.0, per: 0.14 }, healOfDmg: 0.25,
      descVars: function (lv) { return { v: pct(this.mult, lv), v2: 25 }; }
    },
    {
      id: 'cl_faith', cls: 'cleric', type: 'passive', icon: 'icon_skill_guard',
      unlockLv: 2, bonus: { hpPct: 0.05, defPct: 0.03 },
      descVars: function (lv) { return { v: Math.round(5 * lv), v2: Math.round(3 * lv) }; }
    },
    {
      id: 'cl_prayer', cls: 'cleric', type: 'active', icon: 'icon_skill_heal',
      unlockLv: 3, cd: 14, kind: 'heal', healPct: { base: 0.22, per: 0.02 }, healCond: 0.75,
      descVars: function (lv) { return { v: pct(this.healPct, lv) }; }
    },
    {
      id: 'cl_bless', cls: 'cleric', type: 'passive', icon: 'icon_skill_heal',
      unlockLv: 4, bonus: { healPow: 0.06 },
      descVars: function (lv) { return { v: Math.round(6 * lv) }; }
    },
    {
      id: 'cl_nova', cls: 'cleric', type: 'active', icon: 'icon_skill_whirl',
      unlockLv: 5, cd: 15, kind: 'aoe', center: 'self', radius: 64,
      mult: { base: 1.4, per: 0.09 }, selfHealPct: { base: 0.08, per: 0 },
      descVars: function (lv) { return { v: pct(this.mult, lv), v2: 8 }; }
    },
    {
      id: 'cl_radiance', cls: 'cleric', type: 'passive', icon: 'icon_skill_might',
      unlockLv: 6, bonus: { lifesteal: 0.01 },
      descVars: function (lv) { return { v: Math.round(1 * lv) }; }
    },

    /* ================= 游侠 Ranger ================= */
    {
      id: 'rn_power', cls: 'ranger', type: 'active', icon: 'icon_skill_strike',
      unlockLv: 1, cd: 6, kind: 'strike', mult: { base: 2.2, per: 0.15 }, projectile: 'arrow',
      descVars: function (lv) { return { v: pct(this.mult, lv) }; }
    },
    {
      id: 'rn_precision', cls: 'ranger', type: 'passive', icon: 'icon_skill_strike',
      unlockLv: 2, bonus: { crit: 0.012 },
      descVars: function (lv) { return { v: (1.2 * lv).toFixed(1) }; }
    },
    {
      id: 'rn_multi', cls: 'ranger', type: 'active', icon: 'icon_skill_whirl',
      unlockLv: 3, cd: 10, kind: 'aoe', center: 'target', radius: 70,
      mult: { base: 1.3, per: 0.08 },
      descVars: function (lv) { return { v: pct(this.mult, lv) }; }
    },
    {
      id: 'rn_survival', cls: 'ranger', type: 'passive', icon: 'icon_skill_guard',
      unlockLv: 4, bonus: { hpPct: 0.04, spdPct: 0.02 },
      descVars: function (lv) { return { v: Math.round(4 * lv), v2: Math.round(2 * lv) }; }
    },
    {
      id: 'rn_hawk', cls: 'ranger', type: 'active', icon: 'icon_skill_swift',
      unlockLv: 5, cd: 20, kind: 'buff',
      buff: { dur: 8, mods: { atkPct: { base: 0.10, per: 0.015 }, crit: { base: 0.10, per: 0.01 } } },
      descVars: function (lv) {
        return { v: pct(this.buff.mods.atkPct, lv), v2: pct(this.buff.mods.crit, lv), s: this.buff.dur };
      }
    },
    {
      id: 'rn_treasure', cls: 'ranger', type: 'passive', icon: 'icon_gold',
      unlockLv: 6, bonus: { goldMul: 0.03, dropMul: 0.02 },
      descVars: function (lv) { return { v: Math.round(3 * lv), v2: Math.round(2 * lv) }; }
    }
  ];

  for (var i = 0; i < S.length; i++) Game.register('skill', S[i]);

  Game.SKILL_MAX_LV = 10;
})();
