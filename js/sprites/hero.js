/* ============================================================
 * sprites/hero.js — 职业精灵工厂（DnD 五职业）
 * 共用身体/腿部模板 + 每职业专属：头部造型、服装配色、武器。
 * 输出：hero_<class> 全帧组、face_<class> 头像、icon_w_<class> 武器图标。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var P = Game.PAL;
  var D = Game.assets.defineSprite;

  /* ---------------- 共用身体模板（16 宽） ---------------- */
  var BLANK = '................';
  var NECK = '.......ss.......';

  var TORSO_D = [
    '....uttttttu....',
    '...tttttttttt...',
    '...stttttttts...',
    '...sttttttttS...',
    '....byyybbbb....',
    '....tttttttt....',
    '....TttttttT....'
  ];
  var TORSO_U = [
    '....utttmttu....',
    '...ttttmttttt...',
    '...stttmttttts..',
    '...sttttttttS...',
    '....bbbbbbbb....',
    '....tttttttt....',
    '....TttttttT....'
  ];
  var TORSO_R = [
    '.....tttttt.....',
    '....utttttts....',
    '....ttttttts....',
    '....sttttttS....',
    '.....byyybb.....',
    '.....tttttt.....',
    '.....TttttT.....'
  ];

  var LEGS_D0 = [
    '....pp....pp....',
    '....pp....pp....',
    '....pp....gg....',
    '....gg....GG....',
    '....GG..........'
  ];
  var LEGS_D1 = [
    '....pp....pp....',
    '....pp....pp....',
    '....gg....pp....',
    '....GG....gg....',
    '..........GG....'
  ];
  var LEGS_R0 = [
    '.....pp.pp......',
    '.....pp..pp.....',
    '....gg...pp.....',
    '....GG...gg.....',
    '.........GG.....'
  ];
  var LEGS_R1 = [
    '......pppp......',
    '......pppp......',
    '......pppp......',
    '......gggg......',
    '......GGGG......'
  ];
  var LEGS_IDLE = [
    '.....pp.pp......',
    '.....pp.pp......',
    '.....pp.pp......',
    '.....gg.gg......',
    '.....GG.GG......'
  ];
  var LEGS_ATK = [
    '....pp..pp......',
    '...pp....pp.....',
    '...pp....pp.....',
    '..gg......gg....',
    '..GG......GG....'
  ];

  /* 攻击躯干（右向，武器差异化） */
  var ATK_TORSO = {
    sword: [
      '....tttttt......',
      '...uttttttssMww.',
      '...tttttttsmwww.',
      '...stttttt.M....',
      '....byyybb......',
      '....tttttt......',
      '....TttttT......'
    ],
    dagger: [
      '....tttttt......',
      '...uttttttss.w..',
      '...tttttttssww..',
      '...stttttt......',
      '....byyybb......',
      '....tttttt......',
      '....TttttT......'
    ],
    staff: [
      '....tttttt..jj..',
      '...utttttts.dd..',
      '...tttttttssd...',
      '...stttttt..d...',
      '....byyybb..d...',
      '....tttttt..d...',
      '....TttttT......'
    ],
    mace: [
      '....tttttt..MM..',
      '...utttttts.MM..',
      '...tttttttssd...',
      '...stttttt......',
      '....byyybb......',
      '....tttttt......',
      '....TttttT......'
    ],
    bow: [
      '....tttttt...w..',
      '...utttttts.w...',
      '...tttttttssw...',
      '...stttttt..w...',
      '....byyybb...w..',
      '....tttttt......',
      '....TttttT......'
    ]
  };

  /* 扎营坐姿身体（10 行，接在侧向头部之后） */
  var SIT_BODY = [
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
  ];

  /* ---------------- 通用调色板底座 ---------------- */
  function pal(extra) {
    var base = {
      s: P.skin, S: P.skinShade, e: P.eye,
      b: P.leatherDark, y: P.gold,
      g: P.leather, G: P.leatherDark,
      d: P.wood, m: P.metal, M: P.metalDark, w: P.metalLight
    };
    for (var k in extra) base[k] = extra[k];
    return base;
  }

  /* ---------------- 精灵组装 ---------------- */
  function heroDef(id, palette, heads, weapon, torso) {
    torso = torso || {};
    var td = torso.d || TORSO_D, tu = torso.u || TORSO_U, tr = torso.r || TORSO_R;
    var atk = ATK_TORSO[weapon] || ATK_TORSO.sword;
    D({
      id: id,
      pal: palette,
      anchor: { x: 8, y: 19 },
      frames: {
        idle_d: heads.down.concat([NECK], td, LEGS_IDLE),
        idle_u: heads.up.concat([NECK], tu, LEGS_IDLE),
        idle_r: heads.side.concat([NECK], tr, LEGS_IDLE),
        walk_d0: heads.down.concat([NECK], td, LEGS_D0),
        walk_d1: heads.down.concat([NECK], td, LEGS_D1),
        walk_u0: heads.up.concat([NECK], tu, LEGS_D0),
        walk_u1: heads.up.concat([NECK], tu, LEGS_D1),
        walk_r0: heads.side.concat([NECK], tr, LEGS_R0),
        walk_r1: heads.side.concat([NECK], tr, LEGS_R1),
        attack_r: heads.side.concat([NECK], atk, LEGS_ATK),
        sit0: [BLANK, BLANK, BLANK].concat(heads.side, SIT_BODY)
      },
      derive: {
        sit1: { from: 'sit0', op: 'squash' },
        attack_d: { from: 'walk_d0', op: 'bob', dy: 1 },
        attack_u: { from: 'walk_u0', op: 'bob', dy: 1 }
      }
    });
  }

  /* ================= 战士 Fighter（头盔重甲 + 长剑） ================= */
  var fighterPal = pal({ t: '#a04838', T: '#78321f', u: '#c86a50', p: '#3f3f5c', P: '#2c2c44' });
  heroDef('hero_fighter', fighterPal, {
    down: [
      '.....mmmmmm.....',
      '....mmmmmmmm....',
      '...mmmmmmmmmm...',
      '...mMMmmmmMMm...',
      '...mssessessm...',
      '...mssssssssm...',
      '....MssssssM....'
    ],
    up: [
      '.....mmmmmm.....',
      '....mmmmmmmm....',
      '...mmmmmmmmmm...',
      '...mmmmmmmmmm...',
      '...mmmmmmmmmm...',
      '...mMMMMMMMMm...',
      '....MMMMMMMM....'
    ],
    side: [
      '.....mmmmmm.....',
      '....mmmmmmmm....',
      '....mmmmmmmm....',
      '....mmmmssss....',
      '....mmmsssess...',
      '....mmmsssss....',
      '.....Mssssss....'
    ]
  }, 'sword', {
    d: ['....mttttttm....'].concat(TORSO_D.slice(1)),
    u: ['....mtttmttm....'].concat(TORSO_U.slice(1)),
    r: ['.....mttttm.....'].concat(TORSO_R.slice(1))
  });

  /* ================= 盗贼 Rogue（兜帽皮甲 + 短匕） ================= */
  var roguePal = pal({
    t: '#556a48', T: '#3a4c33', u: '#70855a',
    h: '#3f6a48', H: '#2a4c33', k: '#161f12',
    p: '#31402c', P: '#222c1e'
  });
  heroDef('hero_rogue', roguePal, {
    down: [
      '.....hhhhhh.....',
      '....hhhhhhhh....',
      '...hhhhhhhhhh...',
      '...hhHHHHHHhh...',
      '...hkkekkekkh...',
      '...hkksssskkh...',
      '....hhkkkkhh....'
    ],
    up: [
      '.....hhhhhh.....',
      '....hhhhhhhh....',
      '...hhhhhhhhhh...',
      '...hhhhhhhhhh...',
      '...hhhhhhhhhh...',
      '...hHHHHHHHHh...',
      '....HHHHHHHH....'
    ],
    side: [
      '.....hhhhh......',
      '....hhhhhhh.....',
      '...hhhhhhhh.....',
      '...hhhhkkss.....',
      '...hhhhksses....',
      '...hhhhksss.....',
      '....hhhkss......'
    ]
  }, 'dagger');

  /* ================= 法师 Wizard（尖顶法帽长袍 + 法杖） ================= */
  var magePal = pal({
    t: '#5a4a9a', T: '#3f3372', u: '#7a68c0',
    a: '#5f4aaa', A: '#43307c', j: '#40e0d0',
    p: '#473a80', P: '#322858',
    g: '#6a6a7a', G: '#4c4c5c'
  });
  heroDef('hero_mage', magePal, {
    down: [
      '........aa......',
      '.......aaa......',
      '......aaaaa.....',
      '.....aaaaaaa....',
      '..aaaayyyyaaaa..',
      '....ssessess....',
      '.....Ssssss.....'
    ],
    up: [
      '........aa......',
      '.......aaa......',
      '......aaaaa.....',
      '.....aaaaaaa....',
      '..aaaaaaaaaaaa..',
      '....aaaaaaaa....',
      '.....AAAAAA.....'
    ],
    side: [
      '..aa............',
      '...aaa..........',
      '....aaaa........',
      '.....aaaaaa.....',
      '...aaaayyyaa....',
      '.....sssses.....',
      '......Sssss.....'
    ]
  }, 'staff');

  /* ================= 牧师 Cleric（白金祭袍头巾 + 战锤） ================= */
  var clericPal = pal({
    t: '#e0dcd0', T: '#b8b2a0', u: '#f4f0e8',
    c: '#f0ece0', C: '#c8c2b0',
    p: '#b0aa98', P: '#8c8678'
  });
  heroDef('hero_cleric', clericPal, {
    down: [
      '.....cccccc.....',
      '....cccccccc....',
      '...ccyyyyyycc...',
      '...ccsssssscc...',
      '...ccsessescc...',
      '...ccsssssscc...',
      '....cSssssSc....'
    ],
    up: [
      '.....cccccc.....',
      '....cccccccc....',
      '...ccyyyyyycc...',
      '...cccccccccc...',
      '...cccccccccc...',
      '...cCCCCCCCCc...',
      '....CCCCCCCC....'
    ],
    side: [
      '.....cccccc.....',
      '....cccccccc....',
      '....cyyyyycc....',
      '....ccssssss....',
      '....ccsssess....',
      '....ccssssss....',
      '.....cSsssss....'
    ]
  }, 'mace');

  /* ================= 游侠 Ranger（羽毛帽绿装 + 长弓） ================= */
  var rangerPal = pal({
    t: '#5a7a3a', T: '#3f5a28', u: '#7a9a52',
    q: '#4a7a3a', f: '#d84a4a',
    h: '#8a5a2e', H: '#66401f',
    p: '#4c4434', P: '#37311f',
    w: '#b8863f'
  });
  heroDef('hero_ranger', rangerPal, {
    down: [
      '.....qqqqqq.....',
      '....qqqqqqqq.f..',
      '...qqqqqqqqqq...',
      '...qHHHHHHHHq...',
      '...hssessessh...',
      '...hssssssssh...',
      '....Ssssssss....'
    ],
    up: [
      '.....qqqqqq.....',
      '..f.qqqqqqqq....',
      '...qqqqqqqqqq...',
      '...qqqqqqqqqq...',
      '...hhhhhhhhhh...',
      '...hHHHHHHHHh...',
      '....HHHHHHHH....'
    ],
    side: [
      '.....qqqqq.f....',
      '....qqqqqqqf....',
      '....qqqqqqqq....',
      '....qhhsssss....',
      '....qhssssess...',
      '....hhssssss....',
      '.....Hssssss....'
    ]
  }, 'bow');

  /* ---------------- HUD 头像（12×12） ---------------- */
  D({
    id: 'face_fighter', pal: fighterPal,
    frames: {
      icon: [
        '..mmmmmmmm..',
        '.mmmmmmmmmm.',
        'mmmmmmmmmmmm',
        'mMMmmmmmmMMm',
        'mmssessessmm'.slice(0, 12),
        'mmssssssssmm',
        'mmssssssssmm',
        '.mSssssssSm.',
        '..SssssssS..',
        '.....ss.....',
        '...tttttt...',
        '..tttttttt..'
      ]
    }
  });
  D({
    id: 'face_rogue', pal: roguePal,
    frames: {
      icon: [
        '..hhhhhhhh..',
        '.hhhhhhhhhh.',
        'hhhhhhhhhhhh',
        'hhHHHHHHHHhh',
        'hkkekkkkekkh',
        'hkkksssskkkh',
        'hhkksssskkhh',
        '.hhkkkkkkhh.',
        '..hhkkkkhh..',
        '.....ss.....',
        '...tttttt...',
        '..tttttttt..'
      ]
    }
  });
  D({
    id: 'face_mage', pal: magePal,
    frames: {
      icon: [
        '......aa....',
        '.....aaa....',
        '....aaaaa...',
        '...aaaaaaa..',
        'aaaayyyyaaaa',
        '..ssessess..',
        '..ssssssss..',
        '..SssssssS..',
        '....ssss....',
        '.....ss.....',
        '...tttttt...',
        '..tttttttt..'
      ]
    }
  });
  D({
    id: 'face_cleric', pal: clericPal,
    frames: {
      icon: [
        '..cccccccc..',
        '.cccccccccc.',
        'ccyyyyyyyycc',
        'ccsssssssscc',
        'ccsessessscc'.slice(0, 12),
        'ccsssssssscc',
        'ccsssssssscc',
        '.cSssssssSc.',
        '..SssssssS..',
        '.....ss.....',
        '...tttttt...',
        '..tttttttt..'
      ]
    }
  });
  D({
    id: 'face_ranger', pal: rangerPal,
    frames: {
      icon: [
        '..qqqqqqqq..',
        '.qqqqqqqqqq.',
        'qqqqqqqqqqqq',
        'qqqqqqqqqqf.',
        'qHHHHHHHHHHq',
        'hhssessesshh'.slice(0, 12),
        'hhsssssssshh'.slice(0, 12),
        '.hSssssssSh.',
        '..SssssssS..',
        '.....ss.....',
        '...tttttt...',
        '..tttttttt..'
      ]
    }
  });

  /* ---------------- 武器图标（背包/详情按职业展示） ---------------- */
  D({ id: 'icon_w_fighter', variantOf: 'icon_weapon' });
  D({
    id: 'icon_w_rogue',
    pal: { w: P.metalLight, m: P.metal, y: P.gold, g: P.leather },
    frames: {
      icon: [
        '.......ww...',
        '......www...',
        '......ww....',
        '.....ww.....',
        '....ww......',
        '..y.w.......',
        '...yw.......',
        '..gy........',
        '.gg.........',
        '.g..........',
        '............',
        '............'
      ]
    }
  });
  D({
    id: 'icon_w_mage',
    pal: { j: '#40e0d0', J: '#1e8a80', d: P.wood, D: P.woodDark },
    frames: {
      icon: [
        '.......jj...',
        '......jjjj..',
        '......Jjjj..',
        '......dd....',
        '.....dd.....',
        '.....dd.....',
        '....dd......',
        '....dd......',
        '...dd.......',
        '...dd.......',
        '..dD........',
        '............'
      ]
    }
  });
  D({
    id: 'icon_w_cleric',
    pal: { M: P.metal, N: P.metalDark, w: P.metalLight, d: P.wood, y: P.gold },
    frames: {
      icon: [
        '....MMMM....',
        '...MMMMMM...',
        '...MMwMMM...',
        '...MMMMMN...',
        '....MMMN....',
        '......dd....',
        '......dd....',
        '.....dd.....',
        '.....dd.....',
        '....dd......',
        '....yy......',
        '............'
      ]
    }
  });
  D({
    id: 'icon_w_ranger',
    pal: { w: '#b8863f', m: P.metalLight, s: '#e8e4d0' },
    frames: {
      icon: [
        '......ww....',
        '.....w..w...',
        '....w....s..',
        '....w....s..',
        '...w......s.',
        '...w.mmm..s.',
        '...w......s.',
        '....w....s..',
        '....w....s..',
        '.....w..s...',
        '......ww....',
        '............'
      ]
    }
  });

  /* ---------------- 新技能图标 ---------------- */
  D({
    id: 'icon_skill_fire',
    pal: { o: '#f09030', y: '#f8e060', w: '#fff8d0', r: '#d04818' },
    frames: {
      icon: [
        '.....o......',
        '....oo......',
        '....ooy.....',
        '...oyyo.....',
        '...oyyyo....',
        '..oyywyyo...',
        '..oyywyyo...',
        '..royyyyor..',
        '..royyyyor..',
        '...roooor...',
        '....rrrr....',
        '............'
      ]
    }
  });
  D({
    id: 'icon_skill_poison',
    pal: { g: '#6fc76f', G: '#3f8f3f', l: '#d0f890' },
    frames: {
      icon: [
        '.....g......',
        '.....gg.....',
        '....gggg....',
        '...gggggg...',
        '...glgggg...',
        '..ggllgggg..',
        '..gggggggg..',
        '..Gggggggg..',
        '..GggggggG..',
        '...GggggG...',
        '....GGGG....',
        '............'
      ]
    }
  });

  /* ---------------- 内容作者通用占位 Actor ---------------- */
  D({
    id: 'actor_placeholder',
    pal: {
      a: '#d8c58a', b: '#9f8957', c: '#5f533b',
      m: '#8792a3', M: '#4f5969', e: '#f4e7b1'
    },
    anchor: { x: 7, y: 15 },
    frames: {
      idle0: [
        '......cc......',
        '.....cbbc.....',
        '....cbaabc....',
        '....caeeac....',
        '.....cccc.....',
        '....mMMMMm....',
        '...mMMaaMMm...',
        '...MMaaaaMM...',
        '...MMaaaaMM...',
        '....MaaaaM....',
        '....MaaaaM....',
        '....MM..MM....',
        '....MM..MM....',
        '...cMM..MMc...',
        '...ccc..ccc...',
        '..............'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'squash' } }
  });

  /* ---------------- 兼容别名（旧引用回退到战士） ---------------- */
  D({ id: 'hero', variantOf: 'hero_fighter' });
  D({ id: 'hero_face', variantOf: 'face_fighter' });
})();
