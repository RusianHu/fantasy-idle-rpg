/* ============================================================
 * sprites/props.js — 营地道具 / 场景装饰 / 物品与技能图标
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var P = Game.PAL;
  var D = Game.assets.defineSprite;

  /* ---------------- 篝火（4 帧循环） ---------------- */
  var fp = { a: P.fire1, b: P.fire2, c: P.fire3, w: P.wood, W: P.woodDark, s: P.stoneDark, e: '#fff8d0' };
  D({
    id: 'campfire',
    pal: fp,
    anchor: { x: 7, y: 13 },
    frames: {
      f0: [
        '......a.......',
        '......ab......',
        '.....aab......',
        '....baaab.....',
        '....baaaab....',
        '...bbaeabb....',
        '...cbaeabbc...',
        '....cbbbbc....',
        '..w.ccbcc.w...',
        '..wwwWWwww....',
        '.wWWwwwwWWw...',
        '.s.wWWWWw..s..',
        '.ss........ss.',
        '..............'
      ],
      f1: [
        '........a.....',
        '.......ab.....',
        '.....aaab.....',
        '....aaaab.....',
        '...baaaaab....',
        '...bbeaabb....',
        '...cbeaabbc...',
        '....cbbbbc....',
        '..w.ccbcc.w...',
        '..wwwWWwww....',
        '.wWWwwwwWWw...',
        '.s.wWWWWw..s..',
        '.ss........ss.',
        '..............'
      ],
      f2: [
        '.....a........',
        '.....ab.a.....',
        '....aabab.....',
        '....baaaab....',
        '...baaaaab....',
        '...bbaeabb....',
        '...cbaeabbc...',
        '....cbbbbc....',
        '..w.ccbcc.w...',
        '..wwwWWwww....',
        '.wWWwwwwWWw...',
        '.s.wWWWWw..s..',
        '.ss........ss.',
        '..............'
      ],
      f3: [
        '..............',
        '......aa......',
        '.....aaba.....',
        '....baaab.....',
        '....baaaab....',
        '...bbaeabb....',
        '...cbeaabbc...',
        '....cbbbbc....',
        '..w.ccbcc.w...',
        '..wwwWWwww....',
        '.wWWwwwwWWw...',
        '.s.wWWWWw..s..',
        '.ss........ss.',
        '..............'
      ]
    }
  });

  /* ---------------- 帐篷 ---------------- */
  D({
    id: 'tent',
    pal: { a: '#c8a060', b: '#9a7440', c: '#6b4c26', d: '#3f2c14', p: P.woodDark },
    anchor: { x: 10, y: 15 },
    frames: {
      idle0: [
        '.........p..........',
        '........aap.........',
        '.......aabap........',
        '......aabbbap.......',
        '.....aabbbbbap......',
        '....aabbbbbbbap.....',
        '...aabbbbbbbbbap....',
        '..aabbbbdddbbbbap...',
        '.aabbbbdddddbbbbap..',
        '.abbbbbdddddbbbbba..',
        'aabbbbbdddddbbbbbaa.',
        'abbbbbbdddddbbbbbba.',
        'cbbbbbbdddddbbbbbbc.',
        'cccccccdddddccccccc.',
        '....................',
        '....................'
      ]
    }
  });

  /* ---------------- 采集节点与探索宝箱（缺图回退） ----------------
   * 造型源：assets/sprite-source/gatherables-chests-concept.png
   * 正常入口随后加载 sprites/exploration/ 下的区域生成模块覆盖这些定义；
   * 此处保留轻量手绘网格，确保模块缺失时仍可见且 file:// 可同步运行。
   */
  D({
    id: 'gather_herb_patch',
    pal: { d: '#28552f', g: '#438447', l: '#75b95b', h: '#b6da79', w: '#f4efcf', y: '#e2c95f' },
    anchor: { x: 8, y: 13 },
    frames: {
      idle0: [
        '.....l..........',
        '..l..g...h..l...',
        '..g..l...g..g...',
        '.lgl.d.w.g.lg...',
        '..gdgwwwg.gd....',
        '...dgwygdglg....',
        '.lgggwwwggdg.l..',
        '..dgddgddggggg..',
        '.gglggggdggldg..',
        'ddggdgggddgggd..',
        '.dgggddggdggd...',
        '..dddggddddd....',
        '....dddddd......',
        '................'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'sway' } }
  });

  D({
    id: 'gather_berry_bush',
    pal: { d: '#234a2c', g: '#3f7440', l: '#6aa34c', h: '#92c864', r: '#c63f4d', R: '#f06a58' },
    anchor: { x: 8, y: 13 },
    frames: {
      idle0: [
        '......l.........',
        '...lgggl..l.....',
        '..gglhgggggl....',
        '.lgggRgglgRgg...',
        '.ggdggglggggl...',
        'ggRggdggRggggg..',
        'gdggglggggdRgg..',
        'ggglggRgdggggg..',
        '.ggdgggggglgg...',
        '.dggggdggggdg...',
        '..dgdggggddg....',
        '...ddddgddd.....',
        '.....dddd.......',
        '................'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'sway' } }
  });

  D({
    id: 'gather_mushroom_ring',
    pal: { d: '#403855', e: '#6a5b78', c: '#a591c2', h: '#ded3ef', s: '#cdbfa8', g: '#4f7042', l: '#77a451' },
    anchor: { x: 9, y: 13 },
    frames: {
      idle0: [
        '....cc....cc......',
        '...chc...chhc.....',
        '..chhhc..chhhc....',
        '...sss....sss.....',
        '.cc.s..gg..s.cc...',
        'chhc..gllg..chhc..',
        'chhhc.gggg.chhhc..',
        '.sss.ggddgg.sss...',
        '..s.ggdggdg.s.....',
        'cc..ggdggd..cc....',
        'chc..gggg..chc....',
        '.ss...gg...ss.....',
        '..eeeeeeeeee......',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_resin_tree',
    pal: { D: '#3c281b', d: '#5d3b24', b: '#80522e', l: '#a66d38', a: '#d9892f', A: '#ffc552', g: '#42633a' },
    anchor: { x: 9, y: 15 },
    frames: {
      idle0: [
        '.....dddddd.......',
        '...ddbllllbdd.....',
        '..dblbaAalbbd.....',
        '..dblaAAAalbd.....',
        '..dblbAAablbd.....',
        '..ddbbaAabbdd.....',
        '...dbbaabbdd......',
        '...dbdaddbdd......',
        '..ddbdAaabd.......',
        '.dddbdAAbdd..g....',
        'ddddbdAabdddgg....',
        '.ddddbaabddggg....',
        '..dddbbddddgg.....',
        '.DDDddddddDDD.....',
        'DDD.DDDDDD.DDD....',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_ore_vein',
    pal: { D: '#323541', d: '#4b5260', m: '#69727e', l: '#929aa3', h: '#c7c8bd', o: '#b87531', y: '#e1b85a' },
    anchor: { x: 9, y: 13 },
    frames: {
      idle0: [
        '.....dd...........',
        '...dmlld..ddd.....',
        '..dmhhmddmllmd....',
        '.dmhllmdmlhhmd....',
        'dmmloyddmllmmd....',
        'dmloyodmmhllmd....',
        'dmlomodmllmddd....',
        '.dmloyddmmdmmd....',
        '..dmoyomlhmmd.....',
        '.ddmmoomlmmddd....',
        'dmmmdodmmmmmmd....',
        '.dDDddddddddD.....',
        '..DDDDDDDDDD......',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_crystal_cluster',
    pal: { D: '#173859', d: '#1d5d86', b: '#218bb5', c: '#39bdd6', l: '#8be4ee', w: '#e8ffff', s: '#4e596b' },
    anchor: { x: 9, y: 15 },
    frames: {
      idle0: [
        '........c.........',
        '.......clc........',
        '.......cwc........',
        '...c...clc..c.....',
        '..clc..cbc.clc....',
        '..cwc..cbc.cwc....',
        '..clc.cbbbcclc....',
        'c.cbc.cblc.cbc.c..',
        'clcbccbbbc.cbclc..',
        'cwcbbcbwbcbbccwc..',
        'clcbbcbllcbbcbcl..',
        '.cbbbbbbbbbbbbc...',
        'ssdbbbdbbbdbbdss..',
        '.ssddddddddddss...',
        '..ssssssssssss....',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_ghost_flower',
    pal: { D: '#203650', d: '#285774', b: '#398aa0', c: '#6fd1d7', l: '#b8f0e7', w: '#effff7', v: '#8980c5' },
    anchor: { x: 8, y: 15 },
    frames: {
      idle0: [
        '......cwc.........',
        '....cwwwwwc.......',
        '...cwwlwlwwc......',
        '..cwwwwwwwwwc.....',
        '...ccwwwwwcc......',
        '.....clwlc........',
        '......cbc.........',
        '..d...cbc...d.....',
        '..db..cbc..bd.....',
        '.dbb..cbc..bbd....',
        'dbbcb.cbc.bcbbd...',
        '.dbbcbbbbbcbbd....',
        '..dbbbbbbbbbd.....',
        '...ddbbbbbdd......',
        '.....dddd.........',
        '..................'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'sway' } }
  });

  D({
    id: 'gather_grave_dust',
    pal: { D: '#34313d', d: '#514d5a', m: '#77717d', l: '#aaa2ad', h: '#d8d0d9', u: '#6c5239', U: '#a18456', c: '#bce9ea' },
    anchor: { x: 9, y: 13 },
    frames: {
      idle0: [
        '........c.........',
        '.......ccc........',
        '......cchc........',
        '.......ccc........',
        '............UU....',
        '...ll......UuuU...',
        '..lmmll...UuuuuU..',
        '.lmddmll..UuDuuU..',
        'lmddddml..UuDDuU..',
        'mmddDddml..UuuU...',
        'dmmddmmmldd.U....',
        '.ddmmmmddddd......',
        '..DDddddDDDD......',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_ice_crystal',
    pal: { D: '#31577b', d: '#4d81aa', b: '#65acd0', c: '#91d6ec', l: '#c8f0fa', w: '#f6ffff', s: '#a6c8d7' },
    anchor: { x: 9, y: 15 },
    frames: {
      idle0: [
        '.......c..........',
        '......clc.........',
        '.....clwc.........',
        '.....cwwc.........',
        '..c..cllc..c......',
        '.clc.cbbc.clc.....',
        '.cwc.cbbc.cwc.....',
        '.clccbwbc.clc.....',
        'c.cbcbllc.cb.c....',
        'clcbbcbwbcbbclc...',
        'cwcbbcllccbbcwc...',
        'clcbbbbbbbbbbclc...',
        '.cbbbbbbbbbbbbc...',
        'ssddddddddddddss..',
        '.ssssssssssssss...',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_frost_herb',
    pal: { D: '#294954', d: '#3f6c77', b: '#5c91a0', c: '#8bc4cd', l: '#c6eef0', w: '#efffff' },
    anchor: { x: 9, y: 13 },
    frames: {
      idle0: [
        '....l....l........',
        '...clc..clc..l....',
        '..cwwc..cwc.clc...',
        '...cbc..cbc.cwc...',
        '.l.cbc.l.cbc.c....',
        'clccbcclccbc......',
        'cwccbccwccbc..l...',
        '.cbcbccbcbbc.clc..',
        '..cbbbbbbbbc.cwc..',
        '.cbbcbccbcbbc.c...',
        'cbbbcbbbbcbbbc....',
        '.cbbbbbcbbdbbbc....',
        '..DDddddddddDD....',
        '..................'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'sway' } }
  });

  D({
    id: 'gather_fire_core',
    pal: { D: '#3c2020', d: '#5e2c27', r: '#8f3c27', o: '#d85a24', a: '#f58a28', y: '#ffd45a', w: '#fff2a0' },
    anchor: { x: 9, y: 13 },
    frames: {
      idle0: [
        '......oooo........',
        '....oorrrroo......',
        '...ordddddro......',
        '..ordoaayydro.....',
        '.ordoaaywydro.....',
        '.ordoaayyyddro....',
        'ordddoaayodddro...',
        'ordrddoooodrdro...',
        '.ordrddddddrdro...',
        '..orddrrrddro.....',
        '.ddorrddddrodd.....',
        'dDDddrrrrddDDd....',
        '.DDDDddddDDDD.....',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_obsidian_outcrop',
    pal: { D: '#1f1b2d', d: '#30283f', b: '#443457', v: '#6c4384', l: '#a366c0', h: '#d1a0ea' },
    anchor: { x: 9, y: 15 },
    frames: {
      idle0: [
        '..........v.......',
        '.....v...vlv......',
        '....vlv..vlv......',
        '....vhlv.vbv......',
        '..v.vlvv.vbv......',
        '.vlv.vbv.vbv.v....',
        '.vhlvvbv.vbvvlv...',
        '.vlvbbvbbvbbvhlv...',
        'v.vbbbbbbbbbbvlv...',
        'vlvbbvbbvbbbbbv...',
        'vhlvbbbbvbbvbbv...',
        'vlvbbbbbbbbbbbbv...',
        '.vddddddddddddv...',
        'DDddddddddddddDD..',
        '.DDDDDDDDDDDDDD...',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_rune_stone',
    pal: { D: '#3d4552', d: '#56616d', m: '#78848c', l: '#a4aaa0', g: '#506b49', y: '#d9c66c', h: '#f4e59b' },
    anchor: { x: 8, y: 15 },
    frames: {
      idle0: [
        '.....mmmm.........',
        '...mmllllmm.......',
        '..mlllllllm.......',
        '..mlllyyllm.......',
        '.mlllyhylldm......',
        '.mllyyyllddm......',
        '.mllyylldddm......',
        '.mllyhyldddm......',
        '.mllyylddddm......',
        '.mllyldddddm......',
        '.mlllddddddm......',
        'gmlddddddddm.g....',
        'ggmdddddddmmgg....',
        'gDDmmmmmmmDDgg....',
        '.gDDDDDDDDDg......',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_aether_shard',
    pal: { D: '#27616c', d: '#338995', c: '#52c5c7', l: '#a3f0df', w: '#ecfff6' },
    anchor: { x: 7, y: 15 },
    frames: {
      idle0: [
        '......c.........',
        '.....clc........',
        '..c..cwc........',
        '.....cwc...c....',
        '....clllc.......',
        '.c..clwlc.......',
        '....clllc..c....',
        '.....clc........',
        '..c..clc........',
        '.....clc...c....',
        '......c.........',
        '......c.........',
        '................',
        '....c...c.......',
        '................',
        '................'
      ]
    },
    derive: { idle1: { from: 'idle0', op: 'bob', dy: 1 } }
  });

  D({
    id: 'gather_miasma_crystal',
    pal: { D: '#281a38', d: '#3e2452', b: '#5b2e72', v: '#8541a0', l: '#bd66d5', h: '#eca4f5' },
    anchor: { x: 9, y: 15 },
    frames: {
      idle0: [
        '.......v..........',
        '......vlv.........',
        '.....vlhv.........',
        '.....vlhv.........',
        '..v..vlvv..v......',
        '.vlv.vbvv.vlv.....',
        '.vhv.vbvv.vhv.....',
        '.vlvvblvv.vlv.....',
        'v.vbvlhvbbv.v.....',
        'vlvbbvlvvbbvlv....',
        'vhvbbbbvbbbbvhv...',
        'vlvbbbbbbbbbbvlv...',
        '.vddddddddddddv...',
        'DDddddddddddddDD..',
        '.DDDDDDDDDDDDDD...',
        '..................'
      ]
    }
  });

  D({
    id: 'gather_demon_horn',
    pal: { D: '#2f2027', d: '#4a3034', b: '#68423f', m: '#8b5d4c', l: '#b78662', h: '#dfb481' },
    anchor: { x: 9, y: 13 },
    frames: {
      idle0: [
        '...h..............',
        '..hl..............',
        '.hlm..............',
        '.lmb.........h....',
        'lmbd........hl....',
        'mbdD..DDD..hlm....',
        'bdD..DdddD.lmb....',
        'dD..DdDDdDmbd.....',
        'D..DddddddDbd.....',
        '..DddDDdddddD.....',
        '.DddddddddddD.....',
        'DDdddDdddddddDD...',
        '.DDDD.DDDDD.DDD...',
        '..................'
      ]
    }
  });

  D({
    id: 'chest_common',
    pal: { D: '#352315', d: '#56371f', b: '#79502d', l: '#a9753d', y: '#d7ad55', h: '#f3d47a' },
    anchor: { x: 9, y: 13 },
    frames: {
      idle0: [
        '....bbbbbbbb......',
        '..bbllllllllbb....',
        '.bllbbbbbbbbllb...',
        'blbbddddddddbblb..',
        'blddddddddddddlb..',
        'byyyyyyyyyyyyyyb..',
        'bybbbbyhhybbbbyb..',
        'bybbbbyhhybbbbyb..',
        'bybbbbhD hbbbbyb..',
        'bybbbbbbbbbbbbyb..',
        'bddddddddddddddb..',
        '.bDDDDDDDDDDDDb...',
        '..bbbbbbbbbbbb....',
        '..................'
      ]
    }
  });

  D({
    id: 'chest_rare',
    variantOf: 'chest_common',
    pal: { D: '#291d42', d: '#3d285f', b: '#5a3482', l: '#8050ad', y: '#e3b64e', h: '#fff0a0' },
    anchor: { x: 9, y: 13 }
  });

  /* ---------------- 前线营地陈设 ---------------- */
  D({
    id: 'camp_banner',
    pal: { p: '#57412b', P: '#342718', a: '#334d86', b: '#253866', y: P.gold, Y: P.goldDark, w: '#e8dcc0' },
    anchor: { x: 3, y: 18 },
    frames: {
      idle0: [
        '..y..........',
        '.yyy.........',
        '..p..........',
        '..paaaaaaa...',
        '..pabbbbba...',
        '..pabbybba...',
        '..pabwybba...',
        '..pabbybba...',
        '..pabbbbba...',
        '..paaaaaaa...',
        '..p.....aa...',
        '..p....aa....',
        '..p..........',
        '..p..........',
        '..p..........',
        '..p..........',
        '..p..........',
        '.PpP.........',
        'PPPPP........'
      ],
      idle1: [
        '..y..........',
        '.yyy.........',
        '..p..........',
        '..p.aaaaaaa..',
        '..p.abbbbba..',
        '..p.abbybba..',
        '..p.abwybba..',
        '..p.abbybba..',
        '..p.abbbbba..',
        '..p.aaaaaaa..',
        '..p....aaa...',
        '..p.....aa...',
        '..p..........',
        '..p..........',
        '..p..........',
        '..p..........',
        '..p..........',
        '.PpP.........',
        'PPPPP........'
      ]
    }
  });

  D({
    id: 'camp_supply',
    pal: { a: '#b98a50', b: '#865d32', c: '#4b321d', y: P.gold, r: '#8f3d36', w: '#d9d0b8' },
    anchor: { x: 9, y: 11 },
    frames: {
      idle0: [
        '..............rr..',
        '....ww........rr..',
        '...wwww......wrrw.',
        '..ww..ww.....wrrw.',
        '.aaaaaaaaaaaaawww.',
        '.abbbbbbbbbbbba...',
        '.abybbbybbbybba...',
        '.abbbbbbbbbbbba...',
        '.abbbbbybbbbba...',
        '.accccccccccca...',
        '..cccccccccc....',
        '..................'
      ]
    }
  });

  /* ---------------- 马车商棚（交易点世界实体） ----------------
   * 行商马车：拱形条纹篷布 + 垂帘 + 车斗柜台货品 + 双辐条车轮 + 落地车辕，
   * 悬挂金币招牌位于篷下开口中央（激活闪烁锚点）。前线临时营地不设固定商铺，
   * 营地补给点与临时游商等交易域统一用此马车形态。
   * 按交易类型以 variantOf 换色：merchant 红 / exchange 紫 / wander 青 / event 玫。
   */
  var wagonFrames = {
    idle0: [
      '........WWxxxxWWWxxxxW........',
      '.....wxxxxwwwxxxxwwwxxxxw.....',
      '...wwwxxxxwwwxxxxwwwxxxxwww...',
      '...wwwxxxxwwwxxxxwwwxxxxwww...',
      '...rrrrwwwwrrrrrrrrwwwwrrrr...',
      '....RR..WW..RR..RR..WW..RR....',
      '....dddddddddayyaddddddddd....',
      '....ddgggddeeeddsssddyyydd....',
      '....aaaaaaaaaaaaaaaaaaaaaa....',
      '...abbbbbbbbbbbbbbbbbbbbbba...',
      '...abbbbcbbbbbbcbbbbbbcbbba...',
      '...abbbbcbbbbbbcbbbbbbcbbba...',
      '...cccccccccccccccccccccccc...',
      '......cccc..........cccc......',
      '..pp.cbaabccccccccccbaabc.....',
      '.pp..cbayac........cbayac.....',
      'pp...cbaabc........cbaabc.....',
      '......cccc..........cccc......'
    ],
    idle1: [
      '........WWxxxxWWWxxxxW........',
      '.....wxxxxwwwxxxxwwwxxxxw.....',
      '...wwwxxxxwwwxxxxwwwxxxxwww...',
      '...wwwxxxxwwwxxxxwwwxxxxwww...',
      '...rrrrwwwwrrrrrrrrwwwwrrrr...',
      '.....RR..WW..RR..RR..WW..RR...',
      '....dddddddddaYYaddddddddd....',
      '....ddgggddeEeddsssddyyydd....',
      '....aaaaaaaaaaaaaaaaaaaaaa....',
      '...abbbbbbbbbbbbbbbbbbbbbba...',
      '...abbbbcbbbbbbcbbbbbbcbbba...',
      '...abbbbcbbbbbbcbbbbbbcbbba...',
      '...cccccccccccccccccccccccc...',
      '......cccc..........cccc......',
      '..pp.cbaabccccccccccbaabc.....',
      '.pp..cbayac........cbayac.....',
      'pp...cbaabc........cbaabc.....',
      '......cccc..........cccc......'
    ]
  };
  var wagonWood = {
    p: P.woodDark, a: '#b98a50', b: '#865d32', c: '#4b321d',
    d: '#2e1c10', y: P.gold, Y: '#fff3c2'
  };
  function wagonPal(cloth) {
    var pal = {};
    var key;
    for (key in wagonWood) pal[key] = wagonWood[key];
    for (key in cloth) pal[key] = cloth[key];
    return pal;
  }
  D({
    id: 'trade_wagon',
    pal: wagonPal({
      w: '#e8dcc0', W: '#c2b592', r: '#a34433', R: '#7c3226', x: '#c96a52',
      e: '#d94f65', E: '#f0929f', g: '#5fae4a', s: '#c8a060'
    }),
    anchor: { x: 14, y: 17 },
    frames: wagonFrames
  });
  D({
    id: 'trade_wagon_exchange',
    variantOf: 'trade_wagon',
    pal: wagonPal({
      w: '#e6dcf2', W: '#b9aad4', r: '#7a4fb0', R: '#54357e', x: '#9b74cc',
      e: '#c783e7', E: '#e6bcf6', g: '#68c8c0', s: '#a898c8'
    })
  });
  D({
    id: 'trade_wagon_wander',
    variantOf: 'trade_wagon',
    pal: wagonPal({
      w: '#e2efe6', W: '#adcabb', r: '#2f7a6e', R: '#1f574e', x: '#5aa091',
      e: '#d94f65', E: '#f0929f', g: '#5fae4a', s: '#c8a060'
    })
  });
  D({
    id: 'trade_wagon_event',
    variantOf: 'trade_wagon',
    pal: wagonPal({
      w: '#f0dce6', W: '#cfa9bc', r: '#b0517a', R: '#7c3756', x: '#c97a9c',
      e: '#d94f65', E: '#f0929f', g: '#5fae4a', s: '#c8a060'
    })
  });

  D({
    id: 'camp_bedroll',
    pal: { a: '#4d628f', b: '#33456f', c: '#243255', y: '#c6a45b', s: '#9c8350' },
    anchor: { x: 10, y: 7 },
    frames: {
      idle0: [
        '....yyyyyyyyyy......',
        '..yaaaaaaaaaaay.....',
        '.yabbbbbbbbbbbay....',
        'yabbbbaabbbbbbay....',
        'yabbbbaabbbbbbay....',
        '.yabbbbbbbbbbay.....',
        '..ycccccccccy..ss...',
        '...yyyyyyyyy..ssss..'
      ]
    }
  });

  D({
    id: 'camp_log',
    pal: { a: '#98683d', b: '#704725', c: '#452b18', r: '#b88655', R: '#6a4023' },
    anchor: { x: 10, y: 6 },
    frames: {
      idle0: [
        '..raaaaaaaaaaaar....',
        '.rabbbbbbbbbbbbar...',
        'rabbbbbbbbbbbbbbar..',
        'rrbbccbbccbbccbbrr..',
        '.RRRccccccccccRRR...',
        '...cc........cc.....',
        '..ccc........ccc....'
      ]
    }
  });

  D({
    id: 'camp_cookpot',
    pal: { a: '#c5cad2', b: '#7d8491', c: '#444a56', d: '#292d35', w: '#e8dcc0' },
    anchor: { x: 6, y: 9 },
    frames: {
      idle0: [
        '..c......c..',
        '..c......c..',
        '...c....c...',
        '.aaaaaaaaaa.',
        '..abbbbbba..',
        '..abbbbbba..',
        '...abbbba...',
        '....cccc....',
        '...dd..dd...',
        '..dd....dd..'
      ]
    }
  });

  D({
    id: 'camp_lantern',
    pal: { p: '#544331', P: '#30261d', a: '#ffefad', b: '#f3b84f', c: '#9b4b25' },
    anchor: { x: 4, y: 17 },
    frames: {
      idle0: [
        '...pp.....',
        '..p..p....',
        '..p..p....',
        '..p..ppp..',
        '..p.p..p..',
        '..pp....p.',
        '..p.aaaa..',
        '..p.abba..',
        '..p.abba..',
        '..p.acca..',
        '..p..pp...',
        '..p.......',
        '..p.......',
        '..p.......',
        '..p.......',
        '..p.......',
        '.PpP......',
        'PPPPP.....'
      ],
      idle1: [
        '...pp.....',
        '..p..p....',
        '..p..p....',
        '..p..ppp..',
        '..p.p..p..',
        '..pp....p.',
        '..p.abba..',
        '..p.baaa..',
        '..p.abba..',
        '..p.acca..',
        '..p..pp...',
        '..p.......',
        '..p.......',
        '..p.......',
        '..p.......',
        '..p.......',
        '.PpP......',
        'PPPPP.....'
      ]
    }
  });

  /* ---------------- 场景装饰 ---------------- */
  D({
    id: 'deco_tree',
    pal: { a: '#5fae4a', b: '#3f8236', c: '#2c5c26', d: P.wood, D: P.woodDark },
    anchor: { x: 7, y: 15 },
    frames: {
      idle0: [
        '.....aaaa.....',
        '...aaaaaaaa...',
        '..aaaaaaabba..',
        '.aaaaabaaaaba.',
        '.aabaaaaaaaaa.',
        'aaaaaaaabaaaaa',
        'abaaabaaaaabaa',
        'aaaaaaaaabaaaa',
        '.abaaabaaaaba.',
        '.bbabaaaabab..',
        '..bbbaabbbb...',
        '....bddb......',
        '.....dd.......',
        '.....dd.......',
        '....dDDd......',
        '...dDDDDd.....'
      ]
    }
  });

  D({
    id: 'deco_pine_snow',
    pal: { a: '#3f7a52', b: '#2c5c3c', w: '#eef6fa', W: '#c6dcea', d: P.woodDark },
    anchor: { x: 6, y: 15 },
    frames: {
      idle0: [
        '.....ww.....',
        '.....aw.....',
        '....waaw....',
        '....aaba....',
        '...waabaw...',
        '...aababa...',
        '..waabbbaw..',
        '..aabbbbba..',
        '.waabbbbbaw.',
        '.aabbbbbbba.',
        'waabbbbbbbaw',
        'aabbbbbbbbba',
        '.....dd.....',
        '.....dd.....',
        '....wddw....',
        '...wwddww...'
      ]
    }
  });

  D({
    id: 'deco_dead_tree',
    pal: { d: '#6b5a50', D: '#463a32', c: '#2c241e' },
    anchor: { x: 6, y: 14 },
    frames: {
      idle0: [
        'D....d....D.',
        '.D...d...D..',
        '..D.dd..D...',
        '...Ddd.D....',
        '....ddD.....',
        '.D..dd......',
        '..DDdd......',
        '....dd......',
        '....ddD.....',
        '....dd.D....',
        '....dd......',
        '...cdd......',
        '...cddc.....',
        '..ccDDcc....'
      ]
    }
  });

  D({
    id: 'deco_rock',
    pal: { a: P.stoneLight, b: P.stone, c: P.stoneDark },
    anchor: { x: 5, y: 7 },
    frames: {
      idle0: [
        '...abb....',
        '..abbbb...',
        '.abbbbbb..',
        'abbbbbbcb.',
        'bbbbbbccb.',
        'bbcbbcccb.',
        'cccccccc..',
        '.cccccc...'
      ]
    }
  });

  D({
    id: 'deco_crystal',
    pal: { a: '#b8f0f8', b: '#68c8e8', c: '#3888b8', d: '#1e5480' },
    anchor: { x: 5, y: 9 },
    frames: {
      idle0: [
        '....a.....',
        '...aab.b..',
        '...abb.ab.',
        '..aabbabb.',
        '..abbbbbb.',
        '.aabbbcbb.',
        '.abbbccbc.',
        '.bbcbccc..',
        '..ccdcd...',
        '...dcd....'
      ]
    }
  });

  D({
    id: 'deco_tombstone',
    pal: { a: '#a8a8b4', b: '#7c7c8c', c: '#54545f', g: '#4f7a3f' },
    anchor: { x: 4, y: 9 },
    frames: {
      idle0: [
        '..abbb...',
        '.abbbbb..',
        '.abbbcb..',
        '.abcbbb..',
        '.abbbcb..',
        '.abbbbb..',
        '.abcbbb..',
        '.abbbbb..',
        'gabbbbbg.',
        'ggcccccgg'
      ]
    }
  });

  D({
    id: 'deco_lava_rock',
    pal: { a: '#5c3830', b: '#3c221c', c: '#28140f', f: P.fire2, g: P.fire1 },
    anchor: { x: 5, y: 7 },
    frames: {
      idle0: [
        '...aab....',
        '..abbbb...',
        '.abbfbbb..',
        'abbfgfbbb.',
        'bbbbfbbcb.',
        'bbcbbbccb.',
        'ccccfccc..',
        '.cccccc...'
      ]
    }
  });

  D({
    id: 'deco_pillar',
    pal: { a: '#d8d8e2', b: '#a8a8b8', c: '#6f6f82', v: '#78e0d8' },
    anchor: { x: 4, y: 13 },
    frames: {
      idle0: [
        'aaaaaaab.',
        '.abbbbc..',
        '.abvbbc..',
        '.abbbbc..',
        '.abbvbc..',
        '.abbbbc..',
        '..abbc...',
        '.abbbbc..',
        '.abbbbc..',
        '.abbvbc..',
        '.abbbbc..',
        '.abbbbc..',
        'aaaaaaab.',
        'bbbbbbbc.'
      ]
    }
  });

  D({
    id: 'deco_banner_evil',
    pal: { a: '#8a2c40', b: '#571a2c', c: '#38101c', p: '#3c3c50', e: '#f0d040' },
    anchor: { x: 4, y: 13 },
    frames: {
      idle0: [
        'ppppppppp',
        '.aaaaaaa.',
        '.aabebaa.',
        '.abeeeba.',
        '.aabebaa.',
        '.aaaaaaa.',
        '.aaaaaaa.',
        '.baaaaab.',
        '.baaaaab.',
        '..baaab..',
        '..baaab..',
        '...bab...',
        '....b....',
        '....p....'
      ]
    }
  });

  D({
    id: 'deco_bush',
    pal: { a: '#5fae4a', b: '#3f8236', f: '#e878a0' },
    anchor: { x: 5, y: 6 },
    frames: {
      idle0: [
        '..abba....',
        '.aabbba...',
        'aabfabba..',
        'ababbabba.',
        'bbabbfabb.',
        '.bbbbbbb..'
      ]
    }
  });

  D({
    id: 'deco_shroom_glow',
    pal: { a: '#d878e0', b: '#a848b8', d: P.bone },
    anchor: { x: 3, y: 5 },
    frames: {
      idle0: [
        '.aaaa..',
        'abbbba.',
        'abab.a.'.replace(' ', 'b'),
        '..dd...',
        '..dd...',
        '..Dd...'.replace('D', 'd')
      ]
    }
  });

  D({
    id: 'deco_bone',
    pal: { a: P.bone, b: P.boneShade },
    anchor: { x: 4, y: 4 },
    frames: {
      idle0: [
        'aa....aa.',
        '.abaaba..',
        '..abba...',
        '.ab..ba..',
        'aa....aa.'
      ]
    }
  });

  /* ---------------- 回营操作图标 ---------------- */
  D({
    id: 'icon_camp_return',
    pal: { a: '#f0d488', b: '#b57b45', c: '#5b3824', r: '#78d8e8' },
    frames: {
      icon: [
        '....a.....',
        '...aaa....',
        '..aabaa...',
        '.aabbbba..',
        'aabbbbbbaa',
        'abbbccbbba',
        'abbbccbbba',
        'aa..cc..aa',
        '.rrr......',
        'rrr.......'
      ]
    }
  });

  D({
    id: 'icon_camp_warp',
    pal: { a: '#f6dc82', b: '#ffffff', c: '#77dceb', d: '#347b9b' },
    frames: {
      icon: [
        '....bb....',
        '..bc..cb..',
        '.bc.dd.cb.',
        'bc.d..d.cb',
        'c.d.aa.d.c',
        'c.d.aa.d.c',
        'bc.d..d.cb',
        '.bc.dd.cb.',
        '..bc..cb..',
        '....bb....'
      ]
    }
  });

  D({
    id: 'icon_camp_retreat',
    pal: { a: '#a8c8e8', b: '#547ba8', c: '#294b76', y: P.gold, Y: P.goldDark },
    frames: {
      icon: [
        '..aaaaaa..',
        '.abbbbbba.',
        '.abyyyyba.',
        'Yabbbbbba.',
        'YYbbbbba..',
        'YYYbbbba..',
        'YYabbbba..',
        'Y..abbba..',
        '....abba..',
        '.....aa...'
      ]
    }
  });

  D({
    id: 'icon_camp_depart',
    pal: { w: P.metalLight, m: P.metal, d: P.metalDark, g: P.leather, y: P.gold },
    frames: {
      icon: [
        '.......ww.',
        '......wwm.',
        '.....wwm..',
        '....wwm...',
        '.y.wwm....',
        '..ywm.....',
        '.gyy......',
        'gg.y......',
        'g.........',
        '..........'
      ]
    }
  });

  D({
    id: 'icon_boss_hunt',
    pal: { w: P.metalLight, m: P.metalDark, g: P.gold, r: '#d75a4b' },
    frames: {
      icon: [
        'w.....w',
        'mw...wm',
        '.mw.wm.',
        '..wrw..',
        '..mgm..',
        '.m...m.',
        'g.....g'
      ]
    }
  });

  /* ---------------- 主界面操控与导航图标 ---------------- */
  D({
    id: 'icon_control_auto',
    pal: { a: '#f1d477', b: '#9e7934', c: '#50401f', w: '#fff3ba' },
    frames: {
      icon: [
        '....aa....',
        '..aabbba..',
        '.abccccba.',
        'abccwwccba',
        'abcwaawcba',
        'abcwaawcba',
        'abccwwccba',
        '.abccccba.',
        '..abbbba..',
        '....aa....'
      ]
    }
  });

  D({
    id: 'icon_control_manual',
    pal: { a: '#9fe8ef', b: '#4e9ba5', c: '#275a67', w: '#efffff' },
    frames: {
      icon: [
        '....aa....',
        '....aa....',
        '..aabba...',
        '..abccba..',
        'aaacwwcaaa',
        'aaacwwcaaa',
        '..abccba..',
        '...abba...',
        '....aa....',
        '....aa....'
      ]
    }
  });

  D({
    id: 'icon_nav_battle',
    pal: { w: P.metalLight, m: P.metal, d: P.metalDark, y: P.gold, b: P.leather },
    frames: {
      icon: [
        'w........w',
        'mw......wm',
        '.mw....wm.',
        '..mw..wm..',
        '...mwwm...',
        '...ywwy...',
        '..by..yb..',
        '.bb....bb.',
        '.b......b.',
        '..........'
      ]
    }
  });

  D({
    id: 'icon_nav_char',
    pal: { a: '#e4c38f', b: '#9a633f', m: P.metal, d: P.metalDark, y: P.gold },
    frames: {
      icon: [
        '...mmmm...',
        '..mmyymm..',
        '..maaaadm.',
        '.maaaaadm.',
        '.maabbaadm.',
        '..maaaadm.',
        '...mddm...',
        '..mmmmmm..',
        '.mm....mm.',
        '..........'
      ]
    }
  });

  D({
    id: 'icon_nav_inv',
    pal: { a: '#bd8748', b: '#80572f', c: '#4c321e', y: P.gold, w: '#e8dcc0' },
    frames: {
      icon: [
        '...bbbb...',
        '..b....b..',
        '..b....b..',
        '.aaaaaaaa.',
        '.abbbbbba.',
        'aabyyybaa.',
        'aabyyybaa.',
        'aabbbbbbaa',
        '.acccccca.',
        '..cccccc..'
      ]
    }
  });

  D({
    id: 'icon_nav_skills',
    pal: { a: '#f6e68c', b: '#d29b3a', c: '#7e4f24', w: '#fff9d3' },
    frames: {
      icon: [
        '....aa....',
        '....aa....',
        '...abba...',
        'aaabwbaaaa',
        'aabwwwwbaa',
        '..bwwwwb..',
        'aaabwbaaaa',
        '...abba...',
        '....aa....',
        '....aa....'
      ]
    }
  });

  D({
    id: 'icon_nav_map',
    pal: { a: '#d9c28a', b: '#a37e49', c: '#70502f', r: '#b84a3b', w: '#f2e2b4' },
    frames: {
      icon: [
        'aaww..wwaa',
        'abww..wwba',
        'abw.rr.wba',
        'abw.rr.wba',
        'abw....wba',
        'abw.ww.wba',
        'abw.ww.wba',
        'abww..wwba',
        'aaww..wwaa',
        '.cc....cc.'
      ]
    }
  });

  D({
    id: 'icon_nav_settings',
    pal: { a: '#c7cbd7', b: '#858da2', c: '#4c5368', y: P.gold },
    frames: {
      icon: [
        '..aa..aa..',
        '.abb..bba.',
        'abbbbbbbba',
        'abbaaabbba',
        '..baayab..',
        '..bayyab..',
        'abbaaabbba',
        'abbbbbbbba',
        '.abb..bba.',
        '..aa..aa..'
      ]
    }
  });

  /* ---------------- 货币图标 ---------------- */
  D({
    id: 'icon_gold',
    pal: { a: '#f8e080', b: P.gold, c: P.goldDark, d: '#7a5a1a' },
    frames: {
      icon: [
        '...aaaa...',
        '..abbbba..',
        '.abbaabba.',
        'abbabbabba',
        'abbabbabba',
        'abbabbabba',
        'abbabbabba',
        '.abbaabba.',
        '..acccca..',
        '...cccc...'
      ]
    }
  });

  D({
    id: 'icon_crystal',
    pal: { a: '#e8b0f8', b: '#b868e0', c: '#8038b0', d: '#501f78' },
    frames: {
      icon: [
        '....aa....',
        '...aabb...',
        '..aabbbb..',
        '.aabbbbcb.',
        '.abbbbccb.',
        '.abbbcccb.',
        '.bbbccccd.',
        '..bcccdd..',
        '...ccdd...',
        '....dd....'
      ]
    }
  });

  /* ---------------- 装备图标（武器/护甲/饰品） ---------------- */
  D({
    id: 'icon_weapon',
    pal: { w: P.metalLight, m: P.metal, M: P.metalDark, g: P.leather, y: P.gold },
    frames: {
      icon: [
        '........ww..',
        '.......wwm..',
        '......wwm...',
        '.....wwm....',
        '....wwm.....',
        '...wwm......',
        '.y.wm.......',
        '..ywy.......',
        '.gyy........',
        'gg..........',
        'g...........',
        '............'
      ]
    }
  });

  D({
    id: 'icon_armor',
    pal: { a: P.metalLight, b: P.metal, c: P.metalDark, y: P.gold },
    frames: {
      icon: [
        '..ab....ba..',
        '.aabbbbbbaa.',
        '.abbbbbbbba.',
        '.abbybybbba.',
        '.abbbbbbbba.',
        '..abbbbbba..',
        '..abbbbbba..',
        '..cbbbbbbc..',
        '..cbbbbbbc..',
        '...cbbbbc...',
        '...cccccc...',
        '............'
      ]
    }
  });

  D({
    id: 'icon_ring',
    pal: { y: P.gold, Y: P.goldDark, r: '#e05070', R: '#a02848', w: '#ffd0e0' },
    frames: {
      icon: [
        '....rr......',
        '...rwrr.....',
        '...rrRr.....',
        '....RR......',
        '...yYYy.....',
        '..yy..yy....',
        '.yy....yy...',
        '.yy....yy...',
        '..yy..yy....',
        '...yyyy.....',
        '............',
        '............'
      ]
    }
  });

  /* ---------------- 药水图标 ---------------- */
  D({
    id: 'icon_potion_small',
    pal: { g: '#c8d8e0', r: '#e05656', R: '#a02836', k: P.woodDark, w: '#ffffff' },
    frames: {
      icon: [
        '....kk....',
        '....kk....',
        '...gggg...',
        '..gg..gg..',
        '..g.w..g..',
        '..grrrrg..',
        '..grrRrg..',
        '..gRRRRg..',
        '...gggg...',
        '..........'
      ]
    }
  });

  D({
    id: 'icon_potion_large',
    pal: { g: '#c8d8e0', r: '#e05656', R: '#a02836', k: P.woodDark, w: '#ffffff' },
    frames: {
      icon: [
        '....kk....',
        '....kk....',
        '...gggg...',
        '..gg..gg..',
        '.gg.w..gg.',
        '.gr rrrrg.'.replace(' ', 'r'),
        '.grrrrRrg.',
        '.gRrrrRRg.',
        '..gRRRRg..',
        '...gggg...'
      ]
    }
  });

  /* ---------------- 技能图标 ---------------- */
  D({
    id: 'icon_skill_strike',
    pal: { w: P.metalLight, m: P.metal, y: '#f8e060', o: '#f09030' },
    frames: {
      icon: [
        '........ww..',
        '.o.....wwm..',
        '.oo...wwm...',
        '..oo.wwm....',
        '..owwwm.....',
        '.owwwo......',
        '.owwoo......',
        'owwmo.......',
        'wwm.oo......',
        'wm...o......',
        '............',
        '............'
      ]
    }
  });

  D({
    id: 'icon_skill_whirl',
    pal: { a: '#7ad0f0', b: '#4ab0d8', c: '#1c5a86', w: '#e8f8ff' },
    frames: {
      icon: [
        '....bbbb....',
        '..bbaaaabb..',
        '.baaw..aab..',
        '.baw..b.ab..',
        'baw..bb..ab.',
        'ba..bwwb.ab.',
        'ba.bwwb..ab.',
        'ba..bb..wab.',
        '.ba.b..wab..',
        '.baa..waab..',
        '..bbaaaabb..',
        '....bbbb....'
      ]
    }
  });

  D({
    id: 'icon_skill_heal',
    pal: { g: '#6fc76f', G: '#3f8f3f', w: '#e8ffe8', y: '#f8f0a0' },
    frames: {
      icon: [
        '.....yy.....',
        '....ygg.....',
        '....Ggg.....',
        '..ggggggg...',
        '.gwgggggGg..',
        '.ggggggggg..',
        '..GggggggG..',
        '....ggG.....',
        '....ggG.....',
        '....yGG.....',
        '.....y......',
        '............'
      ]
    }
  });

  D({
    id: 'icon_skill_might',
    pal: { r: '#e05656', R: '#a02836', y: '#f8e060', s: P.skin },
    frames: {
      icon: [
        '.....yy.....',
        '....yyyy....',
        '...y.rr.y...',
        '....rrrr....',
        '...rrrrrr...',
        '..rrRrrRrr..',
        '..rRRrrRRr..',
        '..ssssssss..',
        '..sRssssRs..',
        '...ssssss...',
        '....ssss....',
        '............'
      ]
    }
  });

  D({
    id: 'icon_skill_guard',
    pal: { a: '#7a9ad0', b: '#4a6ea5', c: '#28507c', y: P.gold, w: '#d8e8ff' },
    frames: {
      icon: [
        '.awaaaaaawa.',
        '.abbbbbbbba.',
        '.abbyyyybba.',
        '.abybbbbyba.',
        '.abybyybyba.',
        '.abybyybyba.',
        '.abybbbbyba.',
        '..abyyyyba..',
        '..abbbbbba..',
        '...abbbba...',
        '....abba....',
        '.....aa.....'
      ]
    }
  });

  D({
    id: 'icon_skill_swift',
    pal: { a: '#a8e0f0', b: '#5aa8cc', w: '#ffffff', y: '#f8e060' },
    frames: {
      icon: [
        '........w...',
        '..w....wa...',
        '..aw..waa...',
        '...awwaab...',
        'w..waaab....',
        'aw.waab.....',
        '.awaaabb....',
        '..aaabb..y..',
        '.aaabb..yy..',
        'aaab...yy...',
        '.ab...y.....',
        '............'
      ]
    }
  });

  /* ---------------- 商店图标 ---------------- */
  D({
    id: 'icon_chest',
    pal: { a: '#a87848', b: '#7a5230', c: '#4c3018', y: P.gold, Y: P.goldDark },
    frames: {
      icon: [
        '..aaaaaaaa..',
        '.aabbbbbbaa.',
        '.abbbbbbbba.',
        '.aYyyyyyYa..',
        '.abbbybbbba.',
        '.abbbyybbba.',
        '.abbbybbbba.',
        '.abbbbbbbba.',
        '.cbbbbbbbbc.',
        '.cccccccccc.',
        '............',
        '............'
      ]
    }
  });

  D({
    id: 'icon_orb_buff',
    pal: { a: '#e8b0f8', b: '#b868e0', c: '#8038b0', w: '#ffffff', y: P.gold },
    frames: {
      icon: [
        '....bbbb....',
        '..bbaaaabb..',
        '.baaawaaab..',
        '.baawwaaab..',
        'baaawaaaaab.',
        'baaaaaaaaab.',
        'baaaaaaaaab.',
        '.baaaaaaab..',
        '.bbaaaaabb..',
        '..ybbbbby...',
        '...y.yy.y...',
        '....yyyy....'
      ]
    }
  });
})();
