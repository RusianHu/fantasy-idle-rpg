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
