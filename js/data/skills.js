/* ============================================================
 * data/skills.js — 技能表（3 主动 + 3 被动，技能点升级，上限 10 级）
 * 主动技能由战斗系统按冷却自动释放。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  // 强力斩：单体重击
  Game.register('skill', {
    id: 'power_strike', type: 'active', icon: 'icon_skill_strike',
    cd: 6, unlockLv: 1,
    dmgMult: function (lv) { return 2.2 + 0.15 * (lv - 1); },
    descVars: function (lv) { return { v: Math.round((2.2 + 0.15 * (lv - 1)) * 100) }; }
  });

  // 旋风斩：AOE 波及周围
  Game.register('skill', {
    id: 'whirlwind', type: 'active', icon: 'icon_skill_whirl',
    cd: 11, unlockLv: 3, radius: 64,
    dmgMult: function (lv) { return 1.5 + 0.1 * (lv - 1); },
    descVars: function (lv) { return { v: Math.round((1.5 + 0.1 * (lv - 1)) * 100) }; }
  });

  // 治愈之光：HP<70% 时自动施放
  Game.register('skill', {
    id: 'heal_light', type: 'active', icon: 'icon_skill_heal',
    cd: 16, unlockLv: 5, healThreshold: 0.7,
    healPct: function (lv) { return 0.2 + 0.02 * (lv - 1); },
    descVars: function (lv) { return { v: Math.round((0.2 + 0.02 * (lv - 1)) * 100) }; }
  });

  // 力量祝福：被动攻击
  Game.register('skill', {
    id: 'passive_might', type: 'passive', icon: 'icon_skill_might',
    unlockLv: 2,
    bonus: function (lv) { return { atkPct: 0.05 * lv }; },
    descVars: function (lv) { return { v: Math.round(5 * lv) }; }
  });

  // 铁壁守护：被动防御+生命
  Game.register('skill', {
    id: 'passive_guard', type: 'passive', icon: 'icon_skill_guard',
    unlockLv: 4,
    bonus: function (lv) { return { defPct: 0.06 * lv, hpPct: 0.03 * lv }; },
    descVars: function (lv) { return { v: Math.round(6 * lv), v2: Math.round(3 * lv) }; }
  });

  // 疾风加护：被动速度+暴击
  Game.register('skill', {
    id: 'passive_swift', type: 'passive', icon: 'icon_skill_swift',
    unlockLv: 6,
    bonus: function (lv) { return { spdPct: 0.02 * lv, crit: 0.01 * lv }; },
    descVars: function (lv) { return { v: Math.round(2 * lv), v2: lv }; }
  });

  Game.SKILL_MAX_LV = 10;
})();
