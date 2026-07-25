/* ============================================================
 * sprites/monsters_b.js — 区域 5~8 怪物与 Boss 精灵
 * 雪山隘口 / 熔岩洞窟 / 浮空遗迹 / 魔王城
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var P = Game.PAL;
  var D = Game.assets.defineSprite;

  /* ============ R5 雪山隘口 ============ */

  // 雪狼（灰狼换色）
  D({
    id: 'ice_wolf',
    variantOf: 'wolf_gray',
    pal: { a: '#e8f4fa', b: '#b0d4e8', c: '#6f9cc0', e: '#40c8e0', w: P.white, n: '#28405c' }
  });

  // 小雪怪
  D({
    id: 'yeti_small',
    pal: { a: P.white, b: '#d0dce8', c: '#96aac4', e: '#2c3448', m: '#5a7690', s: '#8fb4d4' },
    anchor: { x: 7, y: 14 },
    frames: {
      idle0: [
        '....aaaaaa....',
        '...aaaaaaaa...',
        '...abeaaeba...',
        '...aaaaaaaa...',
        '...abmmmmba...',
        '..aaaaaaaaaa..',
        '.baaaaaaaaaab.',
        '.baabaaaabaab.',
        '.baabaaaabaab.',
        '.bbabaaaababb.',
        '..bbaaaaaabb..',
        '...baaaaaab...',
        '...bba..abb...',
        '..bbb....bbb..'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  // BOSS 冰霜巨人
  D({
    id: 'frost_giant',
    pal: { a: '#d8ecf6', b: '#a4c8e0', c: '#6f9cc0', d: '#48688c', e: '#40e0f0', i: P.ice, m: '#31506c' },
    anchor: { x: 11, y: 21 },
    frames: {
      idle0: [
        '....i..bbbbbb..i....',
        '....ibbabbbbbbi.....',
        '....bbeebbeebbb.....',
        '....bbeebbeebbb.....',
        '....bbbbbbbbbbb.....',
        '.....bmmmmmmmb......',
        '..bbbbbbbbbbbbbb....',
        '.babbbbbbbbbbbbbb...',
        'ibabbabbbbbbabbbbi..',
        'bbbbbabbiibbabbbbb..',
        'bbcbbabbiibbabbcbb..',
        'bbcbbbbbbbbbbbbcbb..',
        'bccbbbbbbbbbbbbccb..',
        '.cc.bbbbbbbbbb.cc...',
        '.cc.bbbbbbbbbb.cc...',
        '.c..cbbbbbbbbc..c...',
        '....cbbb..bbbc......',
        '....cbbb..bbbc......',
        '...ccbb....bbcc.....',
        '...cbbb....bbbc.....',
        '..ccccc....ccccc....',
        '..ddddd....ddddd....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'bob', dy: 1 } }
  });

  /* ============ R6 熔岩洞窟 ============ */

  // 火焰小鬼
  D({
    id: 'fire_imp',
    pal: { a: P.fire1, b: P.fire2, c: P.fire3, d: P.fireDark, e: '#2c1008', w: P.white },
    anchor: { x: 7, y: 13 },
    frames: {
      idle0: [
        '..c...a...c...',
        '..cc.aaa.cc...',
        '..cbbaaabbc...',
        '...bbbbbbb....',
        '..bbeabbaeb...'.replace(/ab/g, 'ab'),
        '..bbbaaabbb...',
        '...bwaaawb....',
        '....bbbbb.....',
        '...cbbbbbc....',
        '..c.bbbbb.c...',
        '....cb.bc.....',
        '....cb.bc.....',
        '....d...d.....',
        '...dd...dd....'
      ],
      idle1: [
        '......a.......',
        '..c..aaa..c...',
        '..ccbaaabcc...',
        '...bbbbbbb....',
        '..bbeabbaeb...',
        '..bbbaaabbb...',
        '...bwaaawb....',
        '....bbbbb.....',
        '...cbbbbbc....',
        '..c.bbbbb.c...',
        '....cb.bc.....',
        '....cb.bc.....',
        '....d...d.....',
        '...dd...dd....'
      ]
    }
  });

  // 熔岩蜥蜴
  D({
    id: 'lava_lizard',
    pal: { a: '#e06030', b: '#a83818', c: '#701c08', d: P.fire1, e: '#f8e060', w: P.white },
    anchor: { x: 8, y: 12 },
    frames: {
      idle0: [
        '............bb..',
        '...........bbeb.',
        'c..........bbbb.',
        'cc....bbbbbbbb..',
        '.cc.bbbadabbbb..',
        '..ccbbadadabb...',
        '..bbbbbadabbb...',
        '..babbbbbbbbb...',
        '.bbabbbbbbbb....',
        '.b.bbcbbbcb.....',
        '....bc..cb......',
        '...cc...cc......'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  // BOSS 炎魔
  D({
    id: 'flame_demon',
    pal: { a: P.fire1, b: P.fire2, c: P.fire3, d: P.fireDark, e: '#fff8c0', h: '#3a1408', w: P.white },
    anchor: { x: 11, y: 21 },
    frames: {
      idle0: [
        '..c....a..a....c....',
        '..hc..aa..aa..ch....',
        '..hhc.aaaaaa.chh....',
        '...hhcbaaaabchh.....',
        '....hbbbbbbbbh......',
        '....bbeebbeebb......',
        '....bbeebbeebb......',
        '....bbbaaaabbb......',
        '.....bbaaaabb.......',
        '..ccbbbbbbbbbbcc....',
        '.cbbbbbbbbbbbbbbc...',
        'cbbbbabbbbbbabbbbc..',
        'cbbbbabbaabbabbbbc..',
        '.bdbbabbaabbabbdb...',
        '.bdbbbbbbbbbbbbdb...',
        '.bd.bbbbbbbbbb.db...',
        '.b..cbbbbbbbbc..b...',
        '....cbbb..bbbc......',
        '...ccbb....bbcc.....',
        '...cbb......bbc.....',
        '..ddcc......ccdd....',
        '..dddd......dddd....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'bob', dy: 1 } }
  });

  /* ============ R7 浮空遗迹 ============ */

  // 魔导浮球
  D({
    id: 'guardian_orb',
    pal: { a: '#78e0d8', b: '#3fa8b8', c: '#26708c', m: P.gold, M: P.goldDark, e: '#f0f8ff', s: P.stone },
    anchor: { x: 7, y: 12 },
    frames: {
      idle0: [
        '.....mmmm.....',
        '....mabbam....',
        '...Mabaabam...'.replace('M', 'M'),
        '...abaeeaba...',
        '..mbaeeeeabm..',
        '..mbaeeeeabm..',
        '...abaeeaba...',
        '...Mabaabam...',
        '....mabbam....',
        '.....mmmm.....',
        '......ss......',
        '.....s..s.....'
      ],
      idle1: [
        '......mmmm....',
        '.....mabbam...',
        '....Mabaabam..',
        '....abaeeaba..',
        '...mbaeeeeabm.',
        '...mbaeeeeabm.',
        '....abaeeaba..',
        '....Mabaabam..',
        '.....mabbam...',
        '......mmmm....',
        '.......ss.....',
        '......s..s....'
      ]
    }
  });

  // 鹰身女妖
  D({
    id: 'harpy',
    pal: { a: '#c8a878', b: '#9a7848', c: '#6b5030', s: P.skin, S: P.skinShade, h: '#8a56c0', e: P.eye, w: P.white },
    anchor: { x: 8, y: 13 },
    frames: {
      idle0: [
        'b......hh......b',
        'bb....hhhh....bb',
        'bbb...hsshh..bbb',
        '.bbb..sesehh.bb.',
        '.abbb.ssss.bbba.',
        '.aabbbssssbbbaa.',
        '..aabbbssbbbaa..',
        '...abbbssbbba...',
        '....bbbssbbb....',
        '.....bbssbb.....',
        '......asba......',
        '......c..c......',
        '.....cc..cc.....'
      ],
      idle1: [
        '.......hh.......',
        'b.....hhhh.....b',
        'bbb...hsshh..bbb',
        'bbbb..sesehh.bbb',
        '.abbbbssss.bbba.',
        '..aabbssssbbaa..',
        '...abbbssbbba...',
        '...abbbssbbba...',
        '....bbbssbbb....',
        '.....bbssbb.....',
        '......asba......',
        '......c..c......',
        '.....cc..cc.....'
      ]
    }
  });

  // BOSS 遗迹守护者
  D({
    id: 'ruin_guardian',
    pal: { a: P.stoneLight, b: P.stone, c: P.stoneDark, e: '#40e0d0', m: P.gold, M: P.goldDark, v: '#78e0d8' },
    anchor: { x: 11, y: 21 },
    frames: {
      idle0: [
        '.......mmmmmm.......',
        '......mabbbbam......',
        '.....mbbeeeebbm.....',
        '.....mbeveevebm.....',
        '.....mbbeeeebbm.....',
        '......mbbbbbbm......',
        '...m...mmmm...m.....',
        '..mam..abba..mam....',
        '..mbm.abbbba.mbm....',
        '..mbmabbvvbbambm....',
        '..mbmabvvvvbambm....',
        '..mbmabvvvvbambm....',
        '..mbmabbvvbbambm....',
        '..mam.abbbba.mam....',
        '...m...abba...m.....',
        '.......abba.........',
        '......ab..ba........',
        '.....ab....ba.......',
        '....abb....bba......',
        '....cbb....bbc......',
        '...ccc......ccc.....',
        '...ccc......ccc.....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'bob', dy: 1 } }
  });

  /* ============ R8 魔王城 ============ */

  // 魔族士兵
  D({
    id: 'demon_soldier',
    pal: { a: '#b05a78', b: '#7a3450', c: '#4c1c34', e: '#f0d040', m: '#5c5c74', M: '#3c3c50', s: '#d88a9a', d: P.metalDark },
    anchor: { x: 7, y: 14 },
    frames: {
      idle0: [
        '..c.........c.',
        '..cc..mmm..cc.',
        '..cmmmmmmmmmc.',
        '...mssssssm...',
        '...msesesem...',
        '...mssssssm...',
        '....ssssss.dd.',
        '...mmmmmmm.d..',
        '..a.mMMMm.Dd..'.replace('D', 'd'),
        '..a.mMMMm..d..',
        '....mmMmm..d..',
        '....mm.mm.....',
        '....cc.cc.....',
        '...cc...cc....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  // 石像鬼
  D({
    id: 'gargoyle',
    pal: { a: '#8a8a9a', b: '#5f5f72', c: '#3c3c4c', e: '#f04040', w: '#b8b8c6' },
    anchor: { x: 8, y: 13 },
    frames: {
      idle0: [
        'c......ww......c',
        'cc....wbbw....cc',
        'ccw..wbbbbw..wcc',
        '.cww.beeeeb.wwc.',
        '.ccwwbbbbbbwwcc.',
        '..ccwbbwwbbwcc..',
        '...cbbbwwbbbc...',
        '....bbbbbbbb....',
        '....bbbbbbbb....',
        '.....bbbbbb.....',
        '.....bb..bb.....',
        '....cb....bc....',
        '...cc......cc...'
      ],
      idle1: [
        '................',
        'c.....ww......c.',
        'cc...wbbw....cc.',
        'ccw.wbbbbw..wcc.',
        '.cwwbeeeebwwwc..',
        '.ccwbbbbbbwcc...',
        '..cbbbwwbbbc....',
        '....bbbbbbbb....',
        '....bbbbbbbb....',
        '.....bbbbbb.....',
        '.....bb..bb.....',
        '....cb....bc....',
        '...cc......cc...'
      ]
    }
  });

  // BOSS 魔王
  D({
    id: 'demon_lord',
    pal: {
      a: '#c04858', b: '#8a2c40', c: '#571a2c',
      h: '#2c2438', H: '#1a1524',
      e: '#f8e040', s: '#d8a0a8',
      m: '#6a5a8a', M: '#463a5f',
      v: '#a060e0', k: '#3a3348'
    },
    anchor: { x: 11, y: 23 },
    frames: {
      idle0: [
        '..v.....v..v.....v..',
        '..vv...vv..vv...vv..',
        '...vv.hhhhhhhh.vv...',
        '....vhhhhhhhhhhv....',
        '....hhHssssssHhh....',
        '....hHsseesseshh....'.slice(0, 20),
        '....hhssseessshh....',
        '.....hsssssssh......',
        '..k...mmmmmm...k....',
        '..kk.mmmmmmmm.kk....',
        '..kkmmammmmammkk....',
        '..kmmmaammaammmk....',
        '..kmmmmammammmmk....',
        '..kmmmmmmmmmmmmk....',
        '..k.mmmMMMMmmm.k....',
        '..k.mMMvvvvMMm.k....',
        '....mMMvvvvMMm......',
        '....mMMMMMMMMm......',
        '....mmMM..MMmm......',
        '....mmMM..MMmm......',
        '...hhMM....MMhh.....',
        '...hMM......MMh.....',
        '..HHHH......HHHH....',
        '..HHHH......HHHH....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'bob', dy: 1 } }
  });
})();
