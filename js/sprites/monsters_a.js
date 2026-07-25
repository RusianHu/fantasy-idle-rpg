/* ============================================================
 * sprites/monsters_a.js — 区域 1~4 怪物与 Boss 精灵
 * 新手草原 / 迷雾森林 / 废弃矿坑 / 亡灵墓地
 * 普通怪 16×14~16，Boss 22~24 宽。待机第二帧由 squash 自动合成。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var P = Game.PAL;
  var D = Game.assets.defineSprite;

  /* ============ R1 新手草原 ============ */

  // 绿史莱姆
  D({
    id: 'slime_green',
    pal: { a: P.slimeLight, b: P.slime, c: P.slimeDark, e: P.eye, w: P.white },
    anchor: { x: 7, y: 13 },
    frames: {
      idle0: [
        '.....bbbb.....',
        '...bbabbbb....',
        '..babbbbbbb...',
        '..abbbbbbbb...',
        '.babbbbbbbbb..',
        '.bbbebbbebbb..',
        '.bbbebbbebbb..',
        'bbbbbbbbbbbbb.',
        'bbbbbwwbbbbbb.',
        'bbbbbbbbbbbbc.',
        'bcbbbbbbbbbcc.',
        'bccbbbbbbbccc.',
        '.ccccccccccc..',
        '..ccccccccc...'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  // 灰狼
  D({
    id: 'wolf_gray',
    pal: { a: '#b8b8c2', b: '#8a8a98', c: '#5c5c6c', e: '#d84a4a', w: P.white, n: '#2c2c38' },
    anchor: { x: 8, y: 13 },
    frames: {
      idle0: [
        '.bb.............',
        '.bbb......bb....',
        '.abbb....bbbb...',
        '.aabbbbbbbbbbb..',
        '..aabbbbbbbebb..',
        '...abbbbbbbbbbn.',
        '...abbbbbbwwwn..',
        '..abbbbbbbbbb...',
        '..abbbbbbbbb....',
        '..abbcbbbcb.....',
        '..bc..cb..c.....',
        '..bc..cb..cc....',
        '..cc..cc...c....',
        '.cc...cc...cc...'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  // BOSS 巨型史莱姆王（带王冠）
  D({
    id: 'slime_king',
    pal: { a: P.slimeLight, b: P.slime, c: P.slimeDark, e: P.eye, w: P.white, y: P.gold, Y: P.goldDark },
    anchor: { x: 11, y: 21 },
    frames: {
      idle0: [
        '......y.y.y.y.......',
        '......yyyyyyy.......',
        '......yYyYyYy.......',
        '........bbbb........',
        '.....bbbabbbbb......',
        '....babbbbbbbbb.....',
        '...babbbbbbbbbbb....',
        '...abbbbbbbbbbbb....',
        '..babbbbbbbbbbbbb...',
        '..bbbeebbbbbeebbb...',
        '..bbbeebbbbbeebbb...',
        '.bbbbbbbbbbbbbbbbb..',
        '.bbbbbbbwwwbbbbbbb..',
        '.bbbbbbwwbbbbbbbbb..',
        'bbbbbbbbbbbbbbbbbbb.',
        'bbbbbbbbbbbbbbbbbbc.',
        'bcbbbbbbbbbbbbbbbcc.',
        'bccbbbbbbbbbbbbbccc.',
        'bcccbbbbbbbbbbbcccc.',
        '.ccccccccccccccccc..',
        '..ccccccccccccccc...',
        '...ccccccccccccc....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  /* ============ R2 迷雾森林 ============ */

  // 毒蘑菇
  D({
    id: 'mushroom_toxic',
    pal: { a: '#d878e0', b: '#a848b8', c: '#743084', d: P.bone, D: P.boneShade, e: P.eye, w: P.white },
    anchor: { x: 7, y: 13 },
    frames: {
      idle0: [
        '.....aaaa.....',
        '...aabbbba....',
        '..abbwbbbba...',
        '.abbbbbbwbba..',
        '.abwbbbbbbba..',
        'abbbbbwbbbbba.',
        'abbbbbbbbbbba.',
        '.cccccccccccc.'.slice(0, 14),
        '...dddddddd...',
        '...ddeddedd...',
        '...dddddddd...',
        '...DddddddD...',
        '....DDDDDD....',
        '....DD..DD....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  // 小树精
  D({
    id: 'treant_sapling',
    pal: { a: '#5fae4a', b: '#3f8236', c: P.woodDark, d: P.wood, e: '#f0d040', w: P.white },
    anchor: { x: 7, y: 14 },
    frames: {
      idle0: [
        '..a...aa...a..',
        '.aaa.aaaa.aaa.',
        '.aaaaaaaaaaaa.',
        '..aabbaabbaa..',
        '...bbbbbbbb...',
        '....dddddd....',
        '...ddeddedd...',
        '...dddddddd...',
        '...ddddddddd..',
        '..dd.dddd.dd..',
        '..d..dddd..d..',
        '.....dccd.....',
        '.....dc.cd....',
        '....cc...cc...',
        '...cc.....cc..'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  // BOSS 森林树妖王
  D({
    id: 'elder_treant',
    pal: { a: '#5fae4a', A: '#7fce6a', b: '#37752e', c: P.woodDark, d: P.wood, D: '#8a6238', e: '#f0d040', m: '#c04848' },
    anchor: { x: 11, y: 21 },
    frames: {
      idle0: [
        '...A..aaaa..A.......',
        '..AAaaaaaaaaAA..A...',
        '.AaaaaaaaaaaaaA.aa..',
        '.aaaabbaaabbaaaaaa..',
        '..aabbbbabbbbaaaa...',
        '...bbbbbbbbbbbb.....',
        '....dddddddddd......',
        '...ddDdddddDddd.....',
        '...ddeeddddeedd.....',
        '...ddeeddddeedd.....',
        '...dddddddddddd.....',
        '...dddmmmmmmddd.....',
        '...ddddmmmmdddd.....',
        '..ddddddddddddd.....',
        '..dd.ddddddd.dd.....',
        '..dd.ddddddd.dd.....',
        '..d..ddcccdd..d.....',
        '.....dcc.ccd........',
        '....dcc...ccd.......',
        '....cc.....cc.......',
        '...ccc.....ccc......',
        '..ccc.......ccc.....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  /* ============ R3 废弃矿坑 ============ */

  // 洞穴蝙蝠
  D({
    id: 'cave_bat',
    pal: { a: '#8a6ab8', b: '#5f4788', c: '#3d2c5c', e: '#f0d040', w: P.white },
    anchor: { x: 8, y: 11 },
    frames: {
      idle0: [
        'c...........c...',
        'cc.....b...cc...',
        'ccb...bbb.bcc...',
        '.ccb.bbbbbbcc...',
        '.ccbbbabbbbcc...',
        '..cbbaaabbbc....',
        '..bbbeaebbbb....',
        '...bbaaabbb.....',
        '...bbwbwbbb.....',
        '....bbbbbb......',
        '.....b..b.......'
      ],
      idle1: [
        '................',
        '.c.........c....',
        '.ccb..b...bcc...',
        '..ccbbbb.bbcc...',
        '..cbbbabbbbc....',
        '..bbbaaabbbb....',
        '...bbeaebbb.....',
        '...bbaaabbb.....',
        '...bbwbwbbb.....',
        '....bbbbbb......',
        '.....b..b.......'
      ]
    }
  });

  // 狗头人矿工
  D({
    id: 'kobold_miner',
    pal: { a: '#c88a4a', b: '#9a6234', c: '#6b3f1e', e: '#f04040', t: '#7a6a4a', T: '#5a4c32', m: P.metal, M: P.metalDark, d: P.wood },
    anchor: { x: 7, y: 14 },
    frames: {
      idle0: [
        '..b.......b...',
        '..bb.....bb...',
        '..bbbbbbbbb...',
        '..bbabbbabb...',
        '..babebebab...',
        '..bbaaaaabb...',
        '...baaaaab.mm.',
        '....bbbbb.mM..',
        '...tttttttd...',
        '..ttttttttd...',
        '..attttttad...',
        '...TttttT.d...',
        '...bb..bb.....',
        '...cc..cc.....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  // BOSS 岩石魔像
  D({
    id: 'stone_golem',
    pal: { a: P.stoneLight, b: P.stone, c: P.stoneDark, d: '#4c4c58', e: '#f0a030', m: '#6a8a5a' },
    anchor: { x: 11, y: 21 },
    frames: {
      idle0: [
        '.....bbbbbbbb.......',
        '....babbbbbbbb......',
        '....bbeebbeebb......',
        '....bbeebbeebb......',
        '....bbbbbbbbbb......',
        '.....bccccccb.......',
        '..bbbbbbbbbbbbbb....',
        '.babbbbbbbbbbbbbb...',
        'bbabbabbbbbbabbbbb..',
        'bbbbbabbmmbbabbbbb..',
        'bbcbbabbmmbbabbcbb..',
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
        '..ccccc....ccccc....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'bob', dy: 1 } }
  });

  /* ============ R4 亡灵墓地 ============ */

  // 骷髅兵
  D({
    id: 'skeleton_soldier',
    pal: { a: P.bone, b: P.boneShade, c: '#8a8474', e: '#50d0e0', m: P.metal, M: P.metalDark, d: P.woodDark },
    anchor: { x: 7, y: 14 },
    frames: {
      idle0: [
        '....aaaaaa....',
        '...aaaaaaaa...',
        '...aeaaaaea...'.replace(/e/g, 'e'),
        '...aaeaaeaa...',
        '...baaaaaab...',
        '....baaaab....',
        '.....aaaa..m..',
        '...aaaaaaa.m..',
        '..a.abbba.Mm..',
        '..a.abbba..m..',
        '....aabaa.....',
        '....ab.ba.....',
        '....a...a.....',
        '....bb..bb....'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  // 幽魂
  D({
    id: 'ghost_wisp',
    pal: { a: '#c8e8f0', b: '#8ab8d8', c: '#5a86ac', e: '#20304a', w: P.white },
    anchor: { x: 7, y: 13 },
    noOutline: false,
    frames: {
      idle0: [
        '.....aaaa.....',
        '....aaaaaa....',
        '...aawaaaaa...',
        '..aaeaaaeaa...',
        '..aaaaaaaaa...',
        '..aaaaaaaaab..',
        '..baaaaaaab...',
        '..baaaaaaabb..',
        '...baaaaaab...',
        '...bbaabbab...',
        '....ba..bb....',
        '....b....b....',
        '..............',
        '..............'
      ],
      idle1: [
        '..............',
        '.....aaaa.....',
        '....aaaaaa....',
        '...aawaaaaa...',
        '..aaeaaaeaa...',
        '..aaaaaaaaa...',
        '..aaaaaaaaab..',
        '..baaaaaaab...',
        '..bbaaaaaabb..',
        '...ba.aab.b...',
        '....b..b......',
        '..............',
        '..............',
        '..............'
      ]
    }
  });

  // BOSS 死灵法师
  D({
    id: 'necromancer',
    pal: { a: P.voidP, b: P.voidDark, c: '#2c1840', s: P.bone, S: P.boneShade, e: '#60f080', d: P.woodDark, y: '#c8f860', m: '#8a8474' },
    anchor: { x: 10, y: 21 },
    frames: {
      idle0: [
        '.......aaaa.........',
        '......aaaaaa........',
        '.....aabbbbaa.......',
        '.....abssssba.......',
        '.....absesesba......'.slice(0, 20),
        '.....absssssba......'.slice(0, 20),
        '......bsssssb.......',
        '.....aabbbbbaa..d...',
        '....aaaaaaaaaaa.d...',
        '...aaaaaaaaaaaaayd..'.slice(0, 20),
        '...saaaaaaaaaaa.d...',
        '...saabaaaabaas.d...',
        '....abbaaaabba..d...',
        '....abbaaaabba..d...',
        '....abbaaaabba..d...',
        '....bbbaaaabbb..d...',
        '....bbbaaaabbb..d...',
        '...bbbbaaaabbbb.....',
        '...bbbbbbbbbbbb.....',
        '..bbbbbbbbbbbbbb....',
        '..cccccccccccccc....',
        '.cccccccccccccccc...'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'bob', dy: 1 } }
  });
})();
