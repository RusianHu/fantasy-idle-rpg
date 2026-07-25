/* ============================================================
 * data/classes.js — 职业注册表（DnD 风格五职业）
 * 引擎不写死任何职业：基础属性/成长/攻击距离/弹道/武器/技能表
 * 全部注册表驱动，新增职业 = 新增一条注册 + 技能与精灵。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  // statDots: 职业选择界面五维（1~5）
  var CLASSES = [
    {
      id: 'fighter',
      base: { hp: 150, atk: 13, def: 8, spd: 9, crit: 0.05, critDmg: 1.5 },
      grow: { hp: 1.078, atk: 1.068, def: 1.068 },
      range: 22, projectile: null,
      weapon: 'sword',
      dpsFactor: 1.2,
      evalWeights: { offense: 0.45, survival: 0.50, economy: 0.05 },
      extra: {},
      skills: ['ft_heavy', 'ft_tough', 'ft_whirl', 'ft_mastery', 'ft_warcry', 'ft_second'],
      statDots: { hp: 5, atk: 3, def: 5, spd: 2, burst: 2 },
      traits: ['melee', 'tank']
    },
    {
      id: 'rogue',
      base: { hp: 105, atk: 15, def: 4, spd: 12.5, crit: 0.12, critDmg: 1.7 },
      grow: { hp: 1.072, atk: 1.071, def: 1.06 },
      range: 22, projectile: null,
      weapon: 'dagger',
      dpsFactor: 1.3,
      evalWeights: { offense: 0.65, survival: 0.30, economy: 0.05 },
      extra: {},
      skills: ['rg_backstab', 'rg_swift', 'rg_poison', 'rg_deadly', 'rg_flurry', 'rg_evasion'],
      statDots: { hp: 2, atk: 4, def: 1, spd: 5, burst: 4 },
      traits: ['melee', 'crit', 'dodge']
    },
    {
      id: 'mage',
      base: { hp: 92, atk: 17, def: 3, spd: 10, crit: 0.06, critDmg: 1.6 },
      grow: { hp: 1.07, atk: 1.075, def: 1.055 },
      range: 72, projectile: 'bolt',
      weapon: 'staff',
      dpsFactor: 1.35,
      evalWeights: { offense: 0.65, survival: 0.30, economy: 0.05 },
      extra: {},
      skills: ['mg_fireball', 'mg_mastery', 'mg_nova', 'mg_surge', 'mg_barrier', 'mg_armor'],
      statDots: { hp: 1, atk: 5, def: 1, spd: 3, burst: 5 },
      traits: ['ranged', 'burst']
    },
    {
      id: 'cleric',
      base: { hp: 135, atk: 12, def: 7, spd: 8.5, crit: 0.05, critDmg: 1.5 },
      grow: { hp: 1.077, atk: 1.066, def: 1.068 },
      range: 22, projectile: null,
      weapon: 'mace',
      dpsFactor: 1.15,
      evalWeights: { offense: 0.45, survival: 0.50, economy: 0.05 },
      extra: { healPow: 0.1 },
      skills: ['cl_smite', 'cl_faith', 'cl_prayer', 'cl_bless', 'cl_nova', 'cl_radiance'],
      statDots: { hp: 4, atk: 2, def: 4, spd: 1, burst: 2 },
      traits: ['melee', 'sustain']
    },
    {
      id: 'ranger',
      base: { hp: 112, atk: 14, def: 5, spd: 11, crit: 0.08, critDmg: 1.6 },
      grow: { hp: 1.073, atk: 1.071, def: 1.06 },
      range: 72, projectile: 'arrow',
      weapon: 'bow',
      dpsFactor: 1.25,
      evalWeights: { offense: 0.55, survival: 0.30, economy: 0.15 },
      extra: {},
      skills: ['rn_power', 'rn_precision', 'rn_multi', 'rn_survival', 'rn_hawk', 'rn_treasure'],
      statDots: { hp: 3, atk: 3, def: 2, spd: 4, burst: 3 },
      traits: ['ranged', 'treasure']
    }
  ];

  for (var i = 0; i < CLASSES.length; i++) Game.register('class', CLASSES[i]);
})();
