/* ============================================================
 * data/affixes.js — 装备随机词条池
 * value = base + perLv × ilvl，pct 类为固定百分比区间。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  var AFFIXES = [
    { id: 'atk_pct',  kind: 'pct',  stat: 'atk',     min: 0.04, max: 0.10 },
    { id: 'hp_pct',   kind: 'pct',  stat: 'hp',      min: 0.05, max: 0.12 },
    { id: 'atk_flat', kind: 'flat', stat: 'atk',     base: 2, perLv: 0.9 },
    { id: 'hp_flat',  kind: 'flat', stat: 'hp',      base: 12, perLv: 5.5 },
    { id: 'def_flat', kind: 'flat', stat: 'def',     base: 1, perLv: 0.5 },
    { id: 'spd',      kind: 'flat', stat: 'spd',     base: 0.5, perLv: 0.045, dec: 1 },
    { id: 'crit',     kind: 'pct',  stat: 'crit',    min: 0.01, max: 0.04 },
    { id: 'critdmg',  kind: 'pct',  stat: 'critDmg', min: 0.05, max: 0.15 },
    { id: 'gold_pct', kind: 'pct',  stat: 'goldMul', min: 0.03, max: 0.10 },
    { id: 'exp_pct',  kind: 'pct',  stat: 'expMul',  min: 0.03, max: 0.10 }
  ];

  for (var i = 0; i < AFFIXES.length; i++) Game.register('affix', AFFIXES[i]);
})();
