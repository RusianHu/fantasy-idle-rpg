/* ============================================================
 * sprites/exploration_v3.js — 开放远征模块化 16-bit 像素资源
 *
 * 资源采用字符网格与有限调色板，整数倍最近邻渲染。每个稳定 ID
 * 均有可维护的代码内回退；导航/碰撞完全来自 terrain_v3 数据。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var D = Game.assets.defineSprite;

  var SHAPES = {
    sprout: [
      '....a....',
      '..aaba...',
      '.aabbb...',
      '...bc....',
      '..bccb...',
      '.bccccb..',
      '...cc....',
      '..cddc...',
      '.dddddd..'
    ],
    crystal: [
      '....a....',
      '...aba...',
      '..abbba..',
      '.abbbbba.',
      '..bcccb..',
      '..bcccb..',
      '.cccdccc.',
      '...ddd...',
      '..ddddd..'
    ],
    cluster: [
      '..a...a...',
      '.aba.aba..',
      '.abb.abba.',
      '..bc.bbb..',
      'a.bcccb.a.',
      'abcccccbba',
      '.cccddccc.',
      '..dddddd..',
      '.dddddddd.'
    ],
    relic: [
      '...aa....',
      '..abba...',
      '.abccba..',
      '.bcddcb..',
      '.bcddcb..',
      '..bccb...',
      '..bccb...',
      '.bddddb..',
      'dddddddd.'
    ],
    bloom: [
      '..a.a.a..',
      '.aabbaa..',
      '..bccb...',
      'aabccbaa.',
      '.bccccb..',
      '..bcb....',
      '...c.....',
      '..cdc....',
      '.ddddd...'
    ]
  };

  function resource(id, colors, shape) {
    D({
      id: id,
      pal: { a: colors[0], b: colors[1], c: colors[2], d: colors[3] },
      anchor: { x: 4, y: 8 },
      frames: { idle0: SHAPES[shape] || SHAPES.cluster },
      derive: { idle1: { from: 'idle0', op: 'squash' } }
    });
  }

  [
    ['gather_moon_dew', ['#d7fbff', '#78b7d5', '#3f789d', '#30506c'], 'bloom'],
    ['gather_river_reed', ['#d8d67d', '#8aa456', '#56733e', '#72573b'], 'sprout'],
    ['gather_sunseed', ['#fff0a0', '#e0a94c', '#a9692d', '#704126'], 'cluster'],
    ['gather_silk_moss', ['#c5f5d6', '#6caf8b', '#487461', '#3a4c3f'], 'sprout'],
    ['gather_ancient_bark', ['#e2b87e', '#9a6e45', '#67472f', '#3f3029'], 'relic'],
    ['gather_glow_spore', ['#c6f5ff', '#7fc9d8', '#6b70a4', '#3e3b6b'], 'cluster'],
    ['gather_coal_shard', ['#aeb5c5', '#666d7a', '#3b3d49', '#23242c'], 'crystal'],
    ['gather_cave_salt', ['#fff3df', '#d2c1aa', '#968777', '#62594f'], 'cluster'],
    ['gather_deep_geode', ['#f0c8ff', '#b57ae0', '#665587', '#39324f'], 'crystal'],
    ['gather_bone_fragment', ['#f4ead6', '#c3b49b', '#8d806e', '#554d45'], 'relic'],
    ['gather_spirit_wax', ['#fff4c8', '#b9acd1', '#756a8c', '#4d465e'], 'cluster'],
    ['gather_nightshade', ['#ecb4ff', '#9c65b6', '#5d3f73', '#382a49'], 'bloom'],
    ['gather_snow_lotus', ['#ffffff', '#cde4ef', '#8dafc1', '#627b8c'], 'bloom'],
    ['gather_frozen_ore', ['#dff7ff', '#8fcbe3', '#5d829d', '#40576c'], 'cluster'],
    ['gather_griffin_feather', ['#fff2ad', '#d2b76f', '#927d51', '#5c5039'], 'relic'],
    ['gather_magma_bloom', ['#ffe06b', '#f08532', '#a83b2d', '#65272a'], 'bloom'],
    ['gather_sulfur_stone', ['#fff078', '#d3b33e', '#8b6c2b', '#544323'], 'cluster'],
    ['gather_ember_scale', ['#ffd372', '#e26836', '#97323b', '#572438'], 'relic'],
    ['gather_cloud_silk', ['#ffffff', '#d9eff7', '#92aec2', '#66788d'], 'sprout'],
    ['gather_star_metal', ['#edf3ff', '#a8bad8', '#66738f', '#3f485d'], 'cluster'],
    ['gather_wind_crystal', ['#c9fff5', '#72d2c8', '#429395', '#2d616a'], 'crystal'],
    ['gather_void_ash', ['#b5a9c4', '#6d627c', '#453b54', '#282332'], 'cluster'],
    ['gather_blood_rose', ['#ff9aaf', '#c33e5b', '#7f293f', '#4c2033'], 'bloom'],
    ['gather_fallen_sigil', ['#efc2ff', '#a56bd0', '#61437a', '#352942'], 'relic']
  ].forEach(function (x) { resource(x[0], x[1], x[2]); });

  D({
    id: 'exp_landmark',
    pal: { a: '#f0d994', b: '#a58b5e', c: '#66616d', d: '#3b3845', e: '#75d5d0' },
    anchor: { x: 7, y: 16 },
    frames: {
      idle0: [
        '......aa.......',
        '.....abba......',
        '.....abba......',
        '......bb.......',
        '.....bccb......',
        '....bccccb.....',
        '....bcddcb.....',
        '....bcddcb.....',
        '...bbcddcbb....',
        '..bbbcddcbbb...',
        '.....cddc......',
        '.....cddc......',
        '....ccddcc.....',
        '...cccddccc....',
        '..dddddddddd...',
        '.dddddddddddd..',
        'dddddddddddddd.'
      ]
    }
  });

  D({
    id: 'exp_boss_lair',
    pal: { a: '#e6c17c', b: '#9d6e42', c: '#5a3940', d: '#322537', e: '#b55de0' },
    anchor: { x: 9, y: 17 },
    frames: {
      idle0: [
        '......aaaa.......',
        '....aabbbbaa.....',
        '...abbccccbba....',
        '..abcddddddcba...',
        '.abcdddeedddcba..',
        'abcdddeeeedddcba.',
        'bcddde....edddcb.',
        'cddde......edddc.',
        'cddd........dddc.',
        'cdd..........ddc.',
        'cdd..........ddc.',
        'cdd..........ddc.',
        'bdd..........ddb.',
        '.bd..........db..',
        '..b..........b...',
        '.cccccccccccccccc.',
        'dddddddddddddddddd'
      ]
    }
  });

  D({
    id: 'exp_curio',
    pal: { a: '#fff0a0', b: '#dc9d4f', c: '#8c5c55', d: '#4e374d', e: '#91e8df' },
    anchor: { x: 6, y: 12 },
    frames: {
      idle0: [
        '.....a......',
        '...aaba.....',
        '..abccba....',
        '.abcddcba...',
        'abcdeedcba..',
        '.bcdeedcb...',
        '..cdeedc....',
        '..cdeedc....',
        '...cddc.....',
        '...cddc.....',
        '..bddddb....',
        '.dddddddd...'
      ],
      idle1: [
        '............',
        '.....a......',
        '...aaba.....',
        '..abccba....',
        '.abcddcba...',
        'abcdeedcba..',
        '.bcdeedcb...',
        '..cdeedc....',
        '..cdeedc....',
        '...cddc.....',
        '..bddddb....',
        '.dddddddd...'
      ]
    }
  });

  D({
    id: 'exp_ecology',
    pal: { a: '#e8fbff', b: '#8bd5d1', c: '#5a82a0', d: '#405068' },
    anchor: { x: 7, y: 9 },
    frames: {
      idle0: [
        '..aa......aa..',
        '.abca....acba.',
        'abcba....abcba',
        '.abca.dd.acba.',
        '..aa.dddd.aa..',
        '....dbbd......',
        '...dbccbd.....',
        '....dddd......',
        '.....dd.......'
      ],
      idle1: [
        '..............',
        '..aa......aa..',
        '.abca....acba.',
        'abcba.dd.abcba',
        '.abca.ddddacba',
        '....dbbd......',
        '...dbccbd.....',
        '....dddd......',
        '.....dd.......'
      ]
    }
  });

  D({
    id: 'exp_guardian_mark',
    pal: { a: '#ffd875', b: '#c6813f', c: '#773f42', d: '#3c2937' },
    anchor: { x: 7, y: 13 },
    frames: {
      idle0: [
        '...aa....aa...',
        '..abba..abba..',
        '.abccbaabccba.',
        'abccddbbddccba',
        '.bcddddddddcb.',
        '..cddbccbddc..',
        '..cddbccbddc..',
        '..cddddddddc..',
        '...cddddddc...',
        '....cddddc....',
        '.....cddc.....',
        '....bddddb....',
        '...dddddddd...'
      ]
    }
  });

  function icon(id, pal, rows) {
    D({ id: id, pal: pal, noOutline: true, anchor: { x: 7, y: 7 }, frames: { icon: rows, idle0: rows } });
  }
  icon('icon_strategy_safe', { a: '#d8e6f0', b: '#6aa6c7', c: '#334c69' }, [
    '..aaaaaa..', '.aabbbbaa.', 'aabbccbbaa', 'abbccccbba', 'abbccccbba',
    '.abbccbba.', '..abbba...', '...aba....', '....a.....'
  ]);
  icon('icon_strategy_balanced', { a: '#f1d58b', b: '#aa7e3d', c: '#5e442d' }, [
    '....aa....', '...abba...', '..abccba..', '.abccccba.', 'abccccccba',
    '....bb....', '...bccb...', '..bccccb..', '.cccccccc.'
  ]);
  icon('icon_strategy_loot', { a: '#f2c973', b: '#a96d38', c: '#593a2c' }, [
    '..aaaaaa..', '.abbbbbba.', 'abccccccba', 'abca..acba', 'abccccccba',
    'abccccccba', '.abccccba.', '..bbbbbb..', '...cccc...'
  ]);
})();
