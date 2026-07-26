/* ============================================================
 * data/achievements.js — 成就表（统计计数器之上的累计型达成）
 * stat: 对应 meta 统计键；reward: {gold?, crystal?}
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  var A = [
    { id: 'kill_100', stat: 'kills', threshold: 100, reward: { gold: 500 } },
    { id: 'kill_1000', stat: 'kills', threshold: 1000, reward: { gold: 8000, crystal: 10 } },
    { id: 'kill_10000', stat: 'kills', threshold: 10000, reward: { gold: 200000, crystal: 40 } },
    { id: 'boss_1', stat: 'bossKills', threshold: 1, reward: { crystal: 10 } },
    { id: 'boss_20', stat: 'bossKills', threshold: 20, reward: { crystal: 30 } },
    { id: 'level_10', stat: 'level', threshold: 10, reward: { gold: 1000 } },
    { id: 'level_30', stat: 'level', threshold: 30, reward: { gold: 50000, crystal: 15 } },
    { id: 'level_60', stat: 'level', threshold: 60, reward: { crystal: 60 } },
    { id: 'gold_100k', stat: 'goldEarned', threshold: 100000, reward: { crystal: 12 } },
    { id: 'gold_10m', stat: 'goldEarned', threshold: 10000000, reward: { crystal: 45 } },
    { id: 'drops_50', stat: 'drops', threshold: 50, reward: { gold: 3000 } },
    { id: 'drops_500', stat: 'drops', threshold: 500, reward: { crystal: 20 } },
    { id: 'legend_1', stat: 'legendaries', threshold: 1, reward: { crystal: 25 } },
    { id: 'region_4', stat: 'highestRegion', threshold: 4, reward: { crystal: 15 } },
    { id: 'region_8', stat: 'highestRegion', threshold: 8, reward: { crystal: 50 } },
    { id: 'rest_30m', stat: 'restSec', threshold: 1800, reward: { gold: 2000 } },
    { id: 'play_2h', stat: 'playSec', threshold: 7200, reward: { crystal: 10 } },
    { id: 'potion_50', stat: 'potions', threshold: 50, reward: { gold: 5000 } },
    { id: 'pickup_100', stat: 'pickups', threshold: 100, reward: { gold: 4000 } },
    { id: 'gather_50', stat: 'gathers', threshold: 50, reward: { crystal: 12 } },
    { id: 'material_300', stat: 'materials', threshold: 300, reward: { crystal: 18 } },
    { id: 'chest_20', stat: 'chests', threshold: 20, reward: { crystal: 15 } }
  ];

  for (var i = 0; i < A.length; i++) Game.register('achievement', A[i]);
})();
