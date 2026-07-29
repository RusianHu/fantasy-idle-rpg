/* Simple replaceable pixel sprites for the eight-region monster expansion. */
(function () {
  'use strict';
  var Game = window.Game;
  var D = Game.assets.defineSprite;

  function add(id, pal, rows, options) {
    options = options || {};
    D({
      id: id,
      pal: pal,
      anchor: options.anchor || { x: Math.floor(rows[0].length / 2), y: rows.length - 1 },
      frames: { idle0: rows },
      derive: { idle1: { from: 'idle0', op: options.bob ? 'bob' : 'squash', dy: 1 } }
    });
  }

  add('boar_thornback', { a: '#9d7c55', b: '#6d5239', c: '#38462d', t: '#e7d39b', e: '#efb34c' }, [
    '...c..c..c......', '..cccccccc.......', '.ccbbbbbbbc......', '..bbaabbbbbb.....', '.bbaaaabbbbtt....', 'bbaaeaaabbbttt...', 'bbaaaaaabbbbb....', '.bbaaaaabbbbb....', '..bbbbbbbbbb.....', '..bbcbccbb.......', '..bc..cb.........', '.bcc..ccb........', '.cc....cc........'
  ]);
  add('goblin_trapper', { a: '#7eab55', b: '#4d703a', c: '#6b4a2d', l: '#b98a54', m: '#8d9291', e: '#f0d15b' }, [
    '...cccccc.......', '..ccllllcc.......', '..caaaaaac.......', '..aaeaeeaa.......', '...aaaaaa..m.....', '..bbbbbbbb.mm....', '.bblbbblbb..m....', '..bllllllb..m....', '..bbllllbb.......', '...bb..bb........', '...cc..cc........', '..ccc..ccc.......', '..ccc..ccc.......'
  ]);
  add('summon.snare_trap', { w: '#a77a43', r: '#d8bd79', m: '#77716b', d: '#45372a' }, [
    '.....rrr........', '..rrr...rrr......', '.rr.......rr.....', 'rr.........rr....', 'r....mmmm...r....', '...mmddddmm......', '..mddwwwwddm.....', '..mddwwwwddm.....', '...mmddddmm......', '..ww..ww..ww.....', '.www..ww..www....'
  ]);

  add('beetle_mossback', { a: '#86a94d', b: '#4e7438', c: '#29472d', h: '#d59b45', e: '#f5d977' }, [
    '.....hh.........', '....hhhh........', '..ccaaaacc......', '.caaaaaaaaac.....', 'caaabbbbaaac.....', 'caabeebbaaac.....', 'caaabbbbaaac.....', '.caaabbbaaac.....', '..ccaaaaacc......', '.cc.caaaa.c.cc...', 'cc..caaaa.c..cc..', '....cc..cc.......', '...cc....cc......'
  ]);
  add('shaman_mosscap', { a: '#d56db2', b: '#834a8e', c: '#4d375f', g: '#8eaa57', w: '#a77a4f', e: '#f2dd70' }, [
    '....aaaaaa......', '..aaabbbbaaa.....', '.aababbabbbaa....', 'aabbbbbbbbbbaa...', '...cgeegc..w.....', '...cggggc.ww.....', '..ccggggccw......', '.ccggggggcc......', '..cggggggc.......', '..ccggggcc.......', '...cc..cc........', '...bb..bb........', '..bbb..bbb.......'
  ]);
  add('summon.spore_pod', { a: '#c66cae', b: '#8c4b8c', c: '#4d3968', g: '#77a35c', e: '#e8dd83' }, [
    '.....a..........', '...aaaaa........', '..aabbaa........', '.aabebbaa.......', '.abbbbbba.......', 'aabbbbbbaa......', '.abbbbbba.......', '..abbbaa........', '..cggggc........', '...cggc.........', '...cggc.........', '..cc..cc........'
  ]);

  add('crawler_crystalback', { a: '#3d5966', b: '#263d47', c: '#172a32', q: '#56d6dc', Q: '#9bf4e7', e: '#e6d25f' }, [
    '....Q..q........', '..qQQq.qqq......', '.qQQqqqqq.......', '..caabbbbbc......', '.caaabbbbbbc.....', 'caaeaaabbbbbc....', 'caaaaaabbbbbc....', '.caaabbbbbbc.....', '..ccbbbbbbcc.....', '...cbccbcc.......', '..cc..cc.........', '.ccc..ccc........'
  ]);
  add('kobold_sapper', { a: '#bb7b43', b: '#75432c', c: '#403326', h: '#d4b061', g: '#70c6cf', f: '#ef8b34', e: '#f2d65c' }, [
    '...hhhhhh.......', '..hhgggghh.......', '..baaaaab........', '.baaeeaaab.f.....', '..baaaaab.fff....', '..cbbbbbbc..f....', '.ccbhhhhbcc......', '.cchhhhhcc.......', '..chhhhhc........', '..cc..cc.........', '..bb..bb.........', '.bbb..bbb........', '.bbb..bbb........'
  ]);
  add('summon.powder_keg', { w: '#a56a35', d: '#5b3828', m: '#747b80', f: '#ffad3d', y: '#ffe373' }, [
    '........f.......', '.......fy.......', '......f.........', '...mmmmmm.......', '..mwwwwwwm......', '..mwwddwwm......', '..mwwddwwm......', '..mwwddwwm......', '..mwwwwwwm......', '...mmmmmm.......', '...dd..dd.......'
  ]);

  add('hound_grave', { a: '#8f8a82', b: '#504c57', c: '#2d2934', s: '#d7cfb4', v: '#9e62ce', e: '#efca5e' }, [
    '..ss......ss....', '.sbbbs..sbbbs...', '..bbaabbbbbb.....', '.bbaaabbbbbbc....', 'bbaeaaabbbbbcc...', 'bbaaavvabbbbb....', '.bbaaaabbbbbb....', '..bbbbbbbbbb.....', '..bbcbccbb.......', '..bc..cb.........', '.bcc..ccb........', '.cc....cc........'
  ]);
  add('ghoul_gravedigger', { a: '#83936c', b: '#4e5b47', c: '#3b3136', s: '#725260', m: '#8d8880', w: '#765333', e: '#e0cf65' }, [
    '....cccc........', '...caaaac........', '..caaeeaac..m....', '..caaaaaac.mmm...', '...caaaac..wm....', '..ssssssss.ww....', '.ssbbssbbss.w....', '..sbbbbbbs..w....', '..ssbbbss...w....', '...bb..bb...w....', '...bc..cb........', '..bcc..ccb.......', '..ccc..ccc.......'
  ]);
  add('summon.crawling_hand', { s: '#d9d1b5', b: '#827b6d', c: '#4b4650', m: '#6f7277' }, [
    '..s.s.s.s.......', '..sssssss.......', '...sssss........', '...sssss.mm.....', '..ssssssmmm.....', '.sssssss.mm.....', '..ssssss.m......', '...sssss.m......', '....bbbbmm......', '....cc..........'
  ], { bob: true });

  add('goat_frosthorn', { a: '#e0e3df', b: '#aeb8bb', c: '#65737d', i: '#6ed4eb', e: '#3a5061' }, [
    '..ii......ii....', '.iiib....biii...', '...baabbbb.......', '..baaaaaabb......', '.baaeaaaabbb.....', '.baaaaaaabbb.....', '..baaaaabbbb.....', '...bbbbbbbb......', '..bbcbccbb.......', '..bc..cb.........', '.bcc..ccb........', '.cc....cc........'
  ]);
  add('gnoll_rime_trapper', { a: '#a88d70', b: '#6b5849', c: '#3d4651', f: '#d8e4e6', i: '#72cfe1', w: '#c3aa7e', e: '#f0cf5a' }, [
    '..a......a......', '..aa....aa......', '.baaaaaaaab.....', '.baaeaeaaab.....', '..baaaaaab.i....', '..cffffffc.ii...', '.ccfbffbfcc.i...', '..cfffffff..i...', '..ccffffcc......', '...bb..bb.......', '...bc..cb.......', '..bcc..ccb......', '..ccc..ccc......'
  ]);
  add('summon.rimejaw_trap', { i: '#9ce4ef', m: '#7a8a99', b: '#d8d2b8', d: '#46515d' }, [
    '..b.b.b.b.......', '.bbbbbbbbb......', '..mmbbbmm.......', '.mmi...imm......', 'mmii...iimm.....', 'miii...iiim.....', '.mmi...imm......', '..mmmmmmm.......', '..d..i..d.......', '.dd..i..dd......'
  ]);

  add('slug_magma', { a: '#ec8736', b: '#9b4325', c: '#312d2c', f: '#ffc04a', e: '#ffe17b' }, [
    '....ccccc.......', '..ccbbbbbcc......', '.ccbaaaabbcc.....', 'ccbaaafaabbcc....', 'cbaaeaaaabbbc....', 'cbaaaaaaabbbc....', 'ccbaaaaabbbcc....', '.ccbbaaabbbcc....', '..ccbbbbbbcc.....', '.cbbbbbbbbbbc....', 'cbbbbbbbbbbbbc...', 'cccccccccccccc...'
  ]);
  add('cultist_cinder', { a: '#7d3031', b: '#4b2229', c: '#231b25', f: '#f48a31', m: '#b47645', e: '#ffd35b' }, [
    '.....f..........', '....fff.........', '...ccccc........', '..ccbbbcc..m....', '..cbeebbc.mf....', '..cbbbbbc.mf....', '.ccaaaaaccmf....', 'ccaaaaaaaccf....', '.caaabaaaac.....', '.ccaaaaacc......', '..cc..cc........', '..bb..bb........', '.bbb..bbb.......'
  ]);
  add('summon.ember_totem', { o: '#ef7133', y: '#ffc34a', b: '#392b2b', c: '#1e1b22' }, [
    '.....y..........', '....oyo.........', '...oyyyo........', '....ooo.........', '...bbbb.........', '..bocob.........', '..boobb.........', '.bococob........', '.boooobb........', '..bbbb..........', '..bccb..........', '.cc..cc.........'
  ]);

  add('manta_aether', { a: '#87989c', b: '#52656d', c: '#2f414c', q: '#56dcd8', g: '#d8b75d', e: '#efffdf' }, [
    'c.............c.', 'cc....ggg.....cc', '.cc..gaqag...cc.', '..ccgaqqqag.cc..', '..cbaqqeqqabc...', '.cbaaqqqqqaabc..', 'cbaaaqqqqqaaabc.', '.cbaaaaqqaaaabc.', '..ccbaaaaaabcc..', '....cbbbbbc.....', '.....cbqbc......', '......cqc.......'
  ], { bob: true });
  add('artificer_ruin', { a: '#a8a49a', b: '#676b70', c: '#353f4b', q: '#61dfdf', g: '#d6b55b', e: '#f1ffdf' }, [
    '....gggg........', '...gaaaag.......', '..gabqbag..c....', '..gaqeqag.ccc...', '..gabqbag..c....', '...gaaaag.......', '.ccbggggbcc......', 'cccbbaabbccc.....', '.ccbqaaqbcc......', '..cbaabbc.......', '..cc..cc........', '.ccc..ccc.......', '.ccc..ccc.......'
  ]);
  add('summon.storm_pylon', { a: '#aaa79b', b: '#5c6971', c: '#303d48', q: '#65ecff', g: '#d4b75f' }, [
    '....qqqq........', '..qq....qq......', '.q...gg...q.....', '....gaag........', '...gaaag........', '...aqaqa........', '..aaqqaaa.......', '..aqqqqaa.......', '.aaqqqqaaa......', '.bbbbbbbbb......', '..bbbbbbb.......', '...cc.cc........'
  ], { bob: true });

  add('hound_abyssal', { a: '#684062', b: '#382b45', c: '#1d1b2b', r: '#c84b52', m: '#777084', e: '#f1ca58' }, [
    '.mm........mm...', 'mmbb......bbmm..', '.mbbaabbbbbbm...', 'mbbaaabbbbbbmc..', 'mbaeraabbbbbcc..', 'mbaarrabbbbbbm..', '.mbaaabbbbbbbm..', '..mbbbbbbbbbm...', '..mbbcbccbbm....', '..mbc..cbm......', '.mcc..ccm.......', '.cc....cc........'
  ]);
  add('gaoler_demon', { a: '#a34555', b: '#652c43', c: '#2d2232', m: '#77727e', M: '#45404d', k: '#9f7a50', e: '#f0d05e' }, [
    '..c........c....', '..cc..mmm.cc....', '..cmmmmmmmc.....', '..maaaaaam.k....', '..maeaaeam.kk...', '..maaaaaam..k...', '.mmmbbbbmmmkk...', '.mMbbbbbbMm.k...', '.mMbbMMbbMm.k...', '..MbbMMbbM..k...', '..MMbMMbMM......', '...cc..cc.......', '..ccc..ccc......', '..ccc..ccc......'
  ]);
  add('summon.soul_cage', { m: '#68616d', c: '#2c2732', s: '#d6cfb7', v: '#a761d2', e: '#f0e26d' }, [
    '...mmmmmm.......', '..mssssssm......', '..msvssvsm......', '..msseessm......', '..msvvvvsm......', '..msvvvvsm......', '..msseessm......', '..msvvvvsm......', '..mssssssm......', '...mmmmmm.......', '..mc.mc.cm......', '.cc..cc..cc.....'
  ], { bob: true });
})();
