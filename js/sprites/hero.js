/* ============================================================
 * sprites/hero.js — 人形角色精灵工厂（DnD 五职业 + 移动行商）
 * 共用整数像素身体/腿部合同；职业与行商各自拥有头部、服装、道具和调色板。
 * 输出：职业全帧组/头像/武器图标，以及四名行商的独立全帧组与头像。
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

  /* ---------------- 移动行商精灵组装 ----------------
   * 行商沿用职业单位的 16×20 字符网格和脚底锚点，但不复用任何职业
   * sprite/portrait ID。idle 的第二帧、受击帧和左向帧由整数像素算法派生。
   */
  function merchantDef(id, portraitId, palette, parts) {
    function frame(head, torso, legs) {
      return head.concat([NECK], torso, legs);
    }
    D({
      id: id,
      source: 'js/sprites/hero.js#wandering-merchants',
      pal: palette,
      anchor: { x: 8, y: 19 },
      frames: {
        idle_d0: frame(parts.head.down, parts.torso.d, LEGS_IDLE),
        idle_u0: frame(parts.head.up, parts.torso.u, LEGS_IDLE),
        idle_r0: frame(parts.head.side, parts.torso.r, LEGS_IDLE),
        walk_d0: frame(parts.head.down, parts.torso.d, LEGS_D0),
        walk_d1: frame(parts.head.down, parts.torso.d, LEGS_D1),
        walk_u0: frame(parts.head.up, parts.torso.u, LEGS_D0),
        walk_u1: frame(parts.head.up, parts.torso.u, LEGS_D1),
        walk_r0: frame(parts.head.side, parts.torso.r, LEGS_R0),
        walk_r1: frame(parts.head.side, parts.torso.r, LEGS_R1),
        attack_d: frame(parts.head.down, parts.attack.d, LEGS_ATK),
        attack_u: frame(parts.head.up, parts.attack.u, LEGS_ATK),
        attack_r: frame(parts.head.side, parts.attack.r, LEGS_ATK),
        sit0: [BLANK, BLANK, BLANK].concat(parts.head.side, parts.sit || SIT_BODY)
      },
      derive: {
        idle_d1: { from: 'idle_d0', op: 'squash' },
        idle_u1: { from: 'idle_u0', op: 'squash' },
        idle_r1: { from: 'idle_r0', op: 'squash' },
        hurt_d: { from: 'idle_d0', op: 'bob', dy: 1 },
        hurt_u: { from: 'idle_u0', op: 'bob', dy: 1 },
        hurt_r: { from: 'idle_r0', op: 'bob', dy: 1 },
        sit1: { from: 'sit0', op: 'squash' }
      }
    });
    D({
      id: portraitId,
      source: 'js/sprites/hero.js#wandering-merchants',
      pal: palette,
      frames: { icon: parts.face }
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

  /* ================= 移动行商（独立代码网格资产） ================= */
  var liaPal = pal({
    t: '#4f8f70', T: '#315f50', u: '#78c4a1',
    q: '#d8bc72', Q: '#9c7440', c: '#e9cf78', C: '#a87834',
    h: '#a8673d', H: '#744228', a: '#82e0bd', A: '#439a7c',
    l: '#8a5a32', L: '#5d3a24', p: '#514139', P: '#342a27',
    g: '#795238', G: '#513522'
  });
  merchantDef('merchant_windbell_lia', 'face_merchant_windbell_lia', liaPal, {
    head: {
      down: [
        '......qqqq......',
        '....qqqqqqqq....',
        '..cqqqqqqqqqqc..',
        '...qHHHHHHHHq...',
        '...hssessessh...',
        '...hssssssssh...',
        '....HssssssH....'
      ],
      up: [
        '......qqqq......',
        '....qqqqqqqq....',
        '..cqqqqqqqqqqc..',
        '...qhhhhhhhhq...',
        '...qhhhhhhhhq...',
        '...hHHHHHHHHh...',
        '....HHHHHHHH....'
      ],
      side: [
        '......qqq.c.....',
        '....qqqqqqc.....',
        '...qqqqqqqq.....',
        '...qhhsssss.....',
        '...qhssssess....',
        '...hhssssss.c...',
        '....Hssssss.c...'
      ]
    },
    torso: {
      d: [
        '....uttttttu....',
        '..aattttttttaa..',
        '..AttttttttttA..',
        '..AsttttttttsA..',
        '...lttyyttttl...',
        '...tttttttttt...',
        '....TttttttT....'
      ],
      u: [
        '....uttttttu....',
        '..aattttttttaa..',
        '..AttttttttttA..',
        '..AttttttttttA..',
        '...llttttttll...',
        '...tttttttttt...',
        '....TttttttT....'
      ],
      r: [
        '....atttttta....',
        '...atttttttta...',
        '...AttttttttA...',
        '...AsttttttsA...',
        '...lttyyttttl...',
        '...tttttttttt...',
        '....TttttttT....'
      ]
    },
    attack: {
      d: [
        '..c.ssttttss.c..',
        '..d.tttttttt.d..',
        '..d.stttttts.d..',
        '..d.sttttttS.d..',
        '..d..ltyytt..d..',
        '..d..tttttt..d..',
        '..c..TttttT..c..'
      ],
      u: [
        '..c.ssttttss.c..',
        '..d.tttttttt.d..',
        '..d.stttttts.d..',
        '..d.sttttttS.d..',
        '..d..llttll..d..',
        '..d..tttttt..d..',
        '..c..TttttT..c..'
      ],
      r: [
        '....tttttt..cc..',
        '...utttttts.dd..',
        '...tttttttssd...',
        '...stttttt..d...',
        '...lttyyttt.d...',
        '....tttttt..d...',
        '....TttttT..c...'
      ]
    },
    face: [
      '....qqqq....',
      '..qqqqqqqq..',
      'c.qqqqqqqq.c',
      '.qHHHHHHHHq.',
      '.hssessessh.',
      '.hssssssssh.',
      '..HssssssH..',
      '...ssllss...',
      '..atttttta..',
      '.AtttyytttA.',
      '..tttttttt..',
      '...TttttT...'
    ]
  });

  var brumPal = pal({
    t: '#50616a', T: '#34434a', u: '#72828a',
    c: '#c8793f', C: '#8b4828', r: '#e0a05f', R: '#a55d32',
    b: '#8a4f2d', B: '#5d321f', k: '#252a2c',
    p: '#463a34', P: '#2d2724', g: '#6c4a36', G: '#493126',
    l: '#9b653b', L: '#654027'
  });
  merchantDef('merchant_copperwheel_brum', 'face_merchant_copperwheel_brum', brumPal, {
    head: {
      down: [
        '....cccccccc....',
        '...ccCCccCCcc...',
        '..cmmccccccmmc..',
        '..cmmsessessmc..',
        '...bssssssssb...',
        '..bbbbssssbbbb..',
        '...BBBBBBBBBB...'
      ],
      up: [
        '....cccccccc....',
        '...ccCCccCCcc...',
        '..cccccccccccc..',
        '..cccccccccccc..',
        '...bbbbbbbbbb...',
        '..bbbbBBBBbbbb..',
        '...BBBBBBBBBB...'
      ],
      side: [
        '....ccccccc.....',
        '...ccCCccccc....',
        '...cmmccssss....',
        '...cmmssesss....',
        '...bbsssssss....',
        '..bbbbssssss....',
        '...BBBBBBBBB....'
      ]
    },
    torso: {
      d: [
        '..uuttttttttuu..',
        '.utttttttttttu..',
        '.sttttttttttts..',
        '.sttttccccTttS..',
        '..llttcCCcttll..',
        '..ttttccccTTtt..',
        '...TTTTTTTT.....'
      ],
      u: [
        '..uuttttttttuu..',
        '.utttttttttttu..',
        '.ttttttttttttt..',
        '.ttttccccTtttt..',
        '..lltcCCCCctll..',
        '..tttccccTTttt..',
        '...TTTTTTTT.....'
      ],
      r: [
        '...uuttttttuu...',
        '..utttttttttu...',
        '..sttttttttts...',
        '..stttccccTtS...',
        '..llttcCCctl....',
        '...tttccccTt....',
        '....TTTTTTT.....'
      ]
    },
    attack: {
      d: [
        '..mmsttttttsmm..',
        '..ddttttttttdd..',
        '..ddsttttttsdd..',
        '..ddttccccTtdd..',
        '..ddtcCCCCctdd..',
        '..ddttccccTtdd..',
        '..MM.TTTTTT.MM..'
      ],
      u: [
        '..mmsttttttsmm..',
        '..ddttttttttdd..',
        '..ddttttttttdd..',
        '..ddttccccTtdd..',
        '..ddtcCCCCctdd..',
        '..ddttccccTtdd..',
        '..MM.TTTTTT.MM..'
      ],
      r: [
        '...tttttt..cccc.',
        '..utttttt.cCmmCc',
        '..ttttttsscCmmCc',
        '..stttttt.cCmmCc',
        '..lttcccc..cccc.',
        '...ttcccc...d...',
        '...TTTTTT...d...'
      ]
    },
    face: [
      '..cccccccc..',
      '.ccCCccCCcc.',
      'cmmccccccmmc',
      'cmmsessessmc',
      '.bssssssssb.',
      'bbbbssssbbbb',
      '.BBBBBBBBBB.',
      '..BBssssBB..',
      '.uuttttttuu.',
      'utttccccTttu',
      '.ttcCCCCctt.',
      '..TTTTTTTT..'
    ]
  });

  var saphPal = pal({
    t: '#426f8e', T: '#294b63', u: '#72a9c8',
    i: '#8ed8e8', I: '#4f9cb8', f: '#dd6a3d', F: '#9f3929',
    w: '#e9e3d3', W: '#bdb6a5', o: '#f3a43b', O: '#b9532d',
    h: '#49383a', H: '#30282e', p: '#443947', P: '#2e2832',
    g: '#675347', G: '#46382f', l: '#846044', L: '#593f30'
  });
  merchantDef('merchant_frostflame_saph', 'face_merchant_frostflame_saph', saphPal, {
    head: {
      down: [
        '....iiiiFFFF....',
        '...iiwwwwFFff...',
        '..iiwwwwwwFFff..',
        '..iwwsssssswFf..',
        '..iwsessesswFf..',
        '..iiwsssswFFf...',
        '...IIwwwwFF.....'
      ],
      up: [
        '....iiiiFFFF....',
        '...iiwwwwFFff...',
        '..iiwwwwwwFFff..',
        '..iiwwwwwwFFff..',
        '..iihhhhhhhFff..',
        '..IIhHHHHHHFF...',
        '...IIHHHHFF.....'
      ],
      side: [
        '....iiiiFF......',
        '...iiwwwFFFf....',
        '..iiwwwwFFFff...',
        '..iwwhsssssFf...',
        '..iwhssssessFf..',
        '..iiwsssssFFff..',
        '...IIssssss.Fff.'
      ]
    },
    torso: {
      d: [
        '...iittttffff...',
        '..iittttttffff..',
        '..IttttttttffF..',
        '..IstttwwtttsF..',
        '...llttyyttll...',
        '...ttttfftttt...',
        '....TTTTFFFF....'
      ],
      u: [
        '...iittttffff...',
        '..iittttttffff..',
        '..IttttttttffF..',
        '..IttttwwttttF..',
        '...llttttttll...',
        '...ttttfftttt...',
        '....TTTTFFFF....'
      ],
      r: [
        '....ittttfff....',
        '...iitttttffff..',
        '...IttttttffF...',
        '...IsttwwttsF...',
        '...llttyyttl....',
        '....tttffttt....',
        '....TTTFFFFF....'
      ]
    },
    attack: {
      d: [
        '..ossttttssio...',
        '..ffttttttii....',
        '..FfstttttsII...',
        '...stttwwttS....',
        '....lttyyttl....',
        '....tttffttt....',
        '....TTTFFFFF....'
      ],
      u: [
        '..ossttttssio...',
        '..ffttttttii....',
        '..FfttttttII....',
        '...ttttwwtt.....',
        '....llttttll....',
        '....tttffttt....',
        '....TTTFFFFF....'
      ],
      r: [
        '...tttttt...o...',
        '..uttttttssff...',
        '..tttttttssFf...',
        '..sttttww..Ff...',
        '...lttyytt..f...',
        '...tttfftt......',
        '...TTTFFFF......'
      ]
    },
    face: [
      '..iiiiFFFF..',
      '.iiwwwwFFff.',
      'iiwwwwwwFFff',
      'iwwsssssswFf',
      'iwsessesswFf',
      'iiwsssswFFf.',
      '.IIwwwwFF...',
      '..sswwss....',
      '.iittttffff.',
      'IttttwwttffF',
      '.lttyyttttl.',
      '..TTTTFFFF..'
    ]
  });

  var noaPal = pal({
    t: '#51467f', T: '#332d58', u: '#786aa7',
    v: '#29243f', V: '#19172b', a: '#8f73d5', A: '#5d479d',
    y: '#e7c65c', Y: '#a9852d', j: '#85e7dc', J: '#3e9a93',
    h: '#d7d1e4', H: '#9b93ad', p: '#373047', P: '#252131',
    g: '#554963', G: '#393243', l: '#6f5b49', L: '#4a3d34'
  });
  merchantDef('merchant_starkey_noa', 'face_merchant_starkey_noa', noaPal, {
    head: {
      down: [
        '.......y........',
        '.....vvvvv......',
        '...vvvvvvvvv....',
        '..vvyvvvvvyvv...',
        '...vssessessv...',
        '...vssssssssv...',
        '....VssssssV....'
      ],
      up: [
        '.......y........',
        '.....vvvvv......',
        '...vvvvvvvvv....',
        '..vvyvvvvvyvv...',
        '...vvvvvvvvvv...',
        '...vVVVVVVVVv...',
        '....VVVVVVVV....'
      ],
      side: [
        '.......y........',
        '.....vvvv.......',
        '...vvvvvvvv.....',
        '..vvyvvsssss....',
        '...vvvssssess...',
        '...vvvssssss.j..',
        '....Vssssss..J..'
      ]
    },
    torso: {
      d: [
        '....uttttttu....',
        '...vtttyytttv...',
        '..vvttttttttvv..',
        '..VstttyytttsV..',
        '...ltttyytttl...',
        '...tttvvvtttt...',
        '....TTTTTTTT....'
      ],
      u: [
        '....uttttttu....',
        '...vtttyytttv...',
        '..vvttttttttvv..',
        '..VtttyyyytttV..',
        '...lttttttttl...',
        '...tttvvvtttt...',
        '....TTTTTTTT....'
      ],
      r: [
        '....vtttttv.....',
        '...vtttyyttv....',
        '..vvtttttttV....',
        '..VsttyytttS....',
        '...ltttyyttl....',
        '...tttvvvttt....',
        '....TTTTTTT.....'
      ]
    },
    attack: {
      d: [
        '..y.ssttttss.y..',
        '..d.tttyyttt.d..',
        '..d.stttttts.d..',
        '..d.sttyyttS.d..',
        '..d..ltyytt..d..',
        '..d..ttvvtt..d..',
        '..j..TTTTTT..j..'
      ],
      u: [
        '..y.ssttttss.y..',
        '..d.tttyyttt.d..',
        '..d.tttttttt.d..',
        '..d.tttyyttt.d..',
        '..d..lttttl..d..',
        '..d..ttvvtt..d..',
        '..j..TTTTTT..j..'
      ],
      r: [
        '....tttttt..yyy.',
        '...utttttts.yy..',
        '...tttyyttssy...',
        '...stttttt..d...',
        '...lttyyttt.d...',
        '....ttvvtt..d...',
        '....TTTTTT..j...'
      ]
    },
    face: [
      '.....y......',
      '...vvvvv....',
      '.vvvvvvvvv..',
      'vvyvvvvvyvv.',
      '.vssessessv.',
      '.vssssssssv.',
      '..VssssssV..',
      '...ssyyss...',
      '..vttttttv..',
      '.VtttyytttV.',
      '..tttvvvtt..',
      '...TTTTTT...'
    ]
  });

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
