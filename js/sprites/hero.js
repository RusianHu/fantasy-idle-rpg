/* ============================================================
 * sprites/hero.js — 主角「独行剑士」精灵
 * 16×20 网格：4 方向行走（左=右镜像）、侧向攻击、扎营坐姿。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var P = Game.PAL;

  var pal = {
    h: P.hairBrown, H: P.hairBrownDark,
    s: P.skin, S: P.skinShade,
    e: P.eye,
    t: P.blue, T: P.blueDark, u: P.blueLight,
    b: P.leatherDark,
    g: P.leather, G: P.leatherDark,
    p: '#3f3f5c', P: '#2c2c44',
    m: P.metal, M: P.metalDark,
    w: P.metalLight, W: P.metalDark,
    y: P.gold
  };

  Game.assets.defineSprite({
    id: 'hero',
    pal: pal,
    anchor: { x: 8, y: 19 },
    frames: {
      /* ---------- 面向镜头（下） ---------- */
      walk_d0: [
        '.....hhhhhh.....',
        '....hhhhhhhh....',
        '...hhhhhhhhhh...',
        '...hhssssssgh...',
        '...hsseslsesh...'.replace('l', 's'),
        '...hssssssssh...',
        '....Sssssss.....',
        '.......ss.......',
        '....uttttttu....',
        '...tttttttttt...',
        '...stttttttts...',
        '...sttttttttS...',
        '....byyybbbb....',
        '....tttttttt....',
        '....TttttttT....',
        '....pp....pp....',
        '....pp....pp....',
        '....pp....gg....',
        '....gg....GG....',
        '....GG..........'
      ],
      walk_d1: [
        '.....hhhhhh.....',
        '....hhhhhhhh....',
        '...hhhhhhhhhh...',
        '...hhssssssgh...',
        '...hsseslsesh...'.replace('l', 's'),
        '...hssssssssh...',
        '....Sssssss.....',
        '.......ss.......',
        '....uttttttu....',
        '...tttttttttt...',
        '...stttttttts...',
        '...sttttttttS...',
        '....byyybbbb....',
        '....tttttttt....',
        '....TttttttT....',
        '....pp....pp....',
        '....pp....pp....',
        '....gg....pp....',
        '....GG....gg....',
        '..........GG....'
      ],
      /* ---------- 背对镜头（上） ---------- */
      walk_u0: [
        '.....hhhhhh.....',
        '....hhhhhhhh....',
        '...hhhhhhhhhh...',
        '...hhhhhhhhhh...',
        '...hhhhhhhhhh...',
        '...hHHHHHHHHh...',
        '....HHHHHHHH....',
        '.......ss.......',
        '....utttmttu....',
        '...ttttmttttt...',
        '...stttmttttts..'.slice(0, 16),
        '...sttttttttS...',
        '....bbbbbbbb....',
        '....tttttttt....',
        '....TttttttT....',
        '....pp....pp....',
        '....pp....pp....',
        '....pp....gg....',
        '....gg....GG....',
        '....GG..........'
      ],
      walk_u1: [
        '.....hhhhhh.....',
        '....hhhhhhhh....',
        '...hhhhhhhhhh...',
        '...hhhhhhhhhh...',
        '...hhhhhhhhhh...',
        '...hHHHHHHHHh...',
        '....HHHHHHHH....',
        '.......ss.......',
        '....utttmttu....',
        '...ttttmttttt...',
        '...stttmttttts..'.slice(0, 16),
        '...sttttttttS...',
        '....bbbbbbbb....',
        '....tttttttt....',
        '....TttttttT....',
        '....pp....pp....',
        '....pp....pp....',
        '....gg....pp....',
        '....GG....gg....',
        '..........GG....'
      ],
      /* ---------- 面向右（左为自动镜像） ---------- */
      walk_r0: [
        '.....hhhhhh.....',
        '....hhhhhhhh....',
        '....hhhhhhhh....',
        '....hhhssssss...',
        '....hhssssess...',
        '....hhssssss....',
        '.....Hssssss....',
        '.......ss.......',
        '.....tttttt.....',
        '....utttttts....',
        '....ttttttts....',
        '....sttttttS....',
        '.....byyybb.....',
        '.....tttttt.....',
        '.....TttttT.....',
        '.....pp.pp......',
        '.....pp..pp.....',
        '....gg...pp.....',
        '....GG...gg.....',
        '.........GG.....'
      ],
      walk_r1: [
        '.....hhhhhh.....',
        '....hhhhhhhh....',
        '....hhhhhhhh....',
        '....hhhssssss...',
        '....hhssssess...',
        '....hhssssss....',
        '.....Hssssss....',
        '.......ss.......',
        '.....tttttt.....',
        '....utttttts....',
        '....ttttttts....',
        '....sttttttS....',
        '.....byyybb.....',
        '.....tttttt.....',
        '.....TttttT.....',
        '......pppp......',
        '......pppp......',
        '......pppp......',
        '......gggg......',
        '......GGGG......'
      ],
      /* ---------- 攻击（右向突刺，剑出鞘） ---------- */
      attack_r: [
        '....hhhhhh......',
        '...hhhhhhhh.....',
        '...hhhhhhhh.....',
        '...hhhssssss....',
        '...hhssssess....',
        '...hhssssss.....',
        '....Hssssss.....',
        '......ss........',
        '....tttttt......',
        '...uttttttssMww.',
        '...tttttttsmwww.'.slice(0, 16),
        '...stttttt.M....',
        '....byyybb......',
        '....tttttt......',
        '....TttttT......',
        '....pp..pp......',
        '...pp....pp.....',
        '...pp....pp.....',
        '..gg......gg....',
        '..GG......GG....'
      ],
      /* ---------- 扎营坐姿（面向右） ---------- */
      sit0: [
        '................',
        '................',
        '................',
        '................',
        '.....hhhhhh.....',
        '....hhhhhhhh....',
        '....hhhhhhhh....',
        '....hhhssssss...',
        '....hhssssess...',
        '.....Hssssss....',
        '.......ss.......',
        '.....tttttt.....',
        '....uttttttt....',
        '....tttttttts...',
        '....stttttts....',
        '.....byyybpp....',
        '.....ttttpppp...',
        '.....ttpppppp...',
        '....ppppppgg....',
        '....GGGGGGGG....'
      ]
    },
    derive: {
      sit1: { from: 'sit0', op: 'squash' },
      attack_d: { from: 'walk_d0', op: 'bob', dy: 1 },
      attack_u: { from: 'walk_u0', op: 'bob', dy: 1 }
    }
  });

  /* 头像（HUD 用）：截取头部的独立小图 */
  Game.assets.defineSprite({
    id: 'hero_face',
    pal: pal,
    anchor: { x: 6, y: 11 },
    frames: {
      icon: [
        '..hhhhhhhh..',
        '.hhhhhhhhhh.',
        'hhhhhhhhhhhh',
        'hhhsssssssgh',
        'hhssessseshh'.replace('l', 's'),
        'hhsssssssshh',
        'hhssssssssshh'.slice(0, 12),
        '.hSsssssssS.',
        '..Sssssss...',
        '.....ss.....',
        '...tttttt...',
        '..tttttttt..'
      ]
    }
  });
})();
