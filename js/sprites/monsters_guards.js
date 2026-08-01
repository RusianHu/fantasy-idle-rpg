/* Hand-authored 16-bit grid sprites for encounter-pool guardians and hunters. */
(function () {
  'use strict';
  var D = window.Game.assets.defineSprite;

  function outlined(rows) {
    var height = rows.length, width = rows.reduce(function (m, row) {
      return Math.max(m, row.length);
    }, 0);
    var grid = rows.map(function (row) { return row.padEnd(width, '.').split(''); });
    var out = grid.map(function (row) { return row.slice(); });
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
      if (grid[y][x] === '.') continue;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (offset) {
        var nx = x + offset[0], ny = y + offset[1];
        if (ny >= 0 && ny < height && nx >= 0 && nx < width && grid[ny][nx] === '.') {
          out[ny][nx] = 'o';
        }
      });
    }
    return out.map(function (row) { return row.join(''); });
  }

  function add(id, palette, rows, bob) {
    palette.o = palette.o || '#211c24';
    rows = outlined(rows);
    D({
      id: id, pal: palette,
      anchor: { x: Math.floor(rows[0].length / 2), y: rows.length - 1 },
      frames: { idle0: rows },
      derive: { idle1: { from: 'idle0', op: bob ? 'bob' : 'squash', dy: 1 } }
    });
  }

  add('badger_brambleback', { a: '#d9c49c', b: '#6b5a4a', c: '#3d352f', g: '#71814c', e: '#f0c765' }, [
    '................', '....g.g.g.......', '..gggggggg......', '.bbbaaaabbb.....', 'bbaacccaabbb....', 'baacececaabbb...', 'bbaacccaabbbb...', '.bbaaaaabbbbb...', '..bbbbbbbbbb....', '..bcbbbcbb......', '.bcc...ccb......', '.cc.....cc......', '................'
  ]);
  add('lizard_reedstalker', { a: '#7ea75b', b: '#476f45', c: '#30463c', r: '#8e9f63', e: '#efd764' }, [
    '...........r....', '.........rrr....', '...aaaaarr......', '..aabbbbba......', '.aabeaabbbba....', '..aaaaabbbba....', '....aabbbbbaaa..', '.....bbbbbbbbaa.', '......bbbbb.....', '.....bb..bb.....', '....cc....cc....', '...cc......cc...', '................'
  ], true);
  add('owlbear_mossclaw', { a: '#8f765c', b: '#57473d', c: '#34342f', g: '#638754', t: '#d7c490', e: '#e8c45a' }, [
    '...g......g.....', '..gg..tt..gg....', '..gtttaatttg....', '.ttaabeaabatt...', '.taaaaaaaaat....', 'taagaaaagaaat...', 'taaaabbbbaaat...', '.taabbbbbbaat...', '..abbbbbbbba....', '..bbbcbccbbb....', '.bbc..cc..cbb...', '.cc........cc...', '................'
  ]);
  add('mantis_vineblade', { a: '#83ad58', b: '#4f763e', c: '#314930', v: '#b5d073', e: '#f2dc68' }, [
    '......aa........', '.....aeea.......', '....aabba.......', '..vvvabba.......', '.vv..abbavv.....', 'v....abb...vv...', '....aabba....v..', '...aabbbba......', '..aaabbbbaa.....', '....bb..bb......', '...bc....cb.....', '..cc......cc....', '................'
  ]);
  add('crab_oreplate', { a: '#7b8790', b: '#4b555d', c: '#30383e', q: '#57cbd1', e: '#f1d06a' }, [
    '...c........c...', '..cca......acc..', '.ccaabbbbbbaacc.', 'caabbqqqqbbaacc', 'caabqeeqbbaacc.', '.caabqqqbbaac..', '..caabbbbbaac...', '.ccaabbbbbaacc..', 'cc..bb..bb..cc..', 'c..cc....cc..c..', '................'
  ]);
  add('worm_dustmaw', { a: '#a98258', b: '#69523e', c: '#40372f', d: '#c4ad78', e: '#f1d36c' }, [
    '.....dddd.......', '...ddaaaadd.....', '..daabeebaad....', '.daabbbbbbaad...', '..aabbbbbba.....', '...abbbbba......', '..aabbbbbaa.....', '.aabbbbbbaaa....', 'aabbbbbbaaaab...', '.bbbbbbbaaaab...', '..bbbbbbbbbb....', '...cccccccc.....', '................'
  ]);
  add('knight_cryptbound', { a: '#9a9790', b: '#5d5b61', c: '#353440', v: '#8060a5', e: '#d9cb76' }, [
    '....cccccc......', '...caaaaaac.....', '..caabeebaac....', '..caaaaaaaac....', '...cbbbbbc......', '..cbbvvvbbc.....', '.cbbvvvvvbbc....', '.cbbbvvvbbbc....', '..cbbbbbbbc.....', '...cb..bc.......', '..ccb..bcc......', '.ccc....ccc.....', '................'
  ]);
  add('spider_ossuary', { a: '#d2c9ad', b: '#756e69', c: '#3c3942', v: '#8e5cb1', e: '#e6d364' }, [
    'c......c......c.', '.c..c..c..c..c..', '..ccaabbbaacc....', '...aabeebbaa.....', '..aabvvvvbbaa....', '.caabbbbbbaac....', 'c..aabbbbaa..c...', '.cc..bbbb..cc....', 'c...cc..cc...c...', '....c....c......', '................'
  ], true);
  add('troll_rimehide', { a: '#a9b7ad', b: '#667b76', c: '#3c5155', i: '#80d6e5', e: '#e9d36d' }, [
    '..ii........ii..', '...iiaaaaii.....', '..iaabeebaai....', '..iaaaaaaaai....', '.iaabbbbbbaai...', 'iaabbbbbbbbaai..', 'iaabbiibbbaai...', '.aabbbbbbbbaa...', '..abbbbbbbba....', '..bbbcbbcbbb....', '.bcc......ccb...', '.cc........cc...', '................'
  ]);
  add('leopard_snowveil', { a: '#e5e5db', b: '#aeb7b4', c: '#56666e', i: '#7ccedc', e: '#314b5b' }, [
    '...i........i...', '..iia......aii..', '...aabbbbbaa....', '..aabeaabbbba...', '.aaaaaabbbbbba..', '..aabaabbbbbb...', '....aabbbbbbaaa.', '.....bbbbbbbbaa.', '.....bb..bb.....', '....cc....cc....', '...cc......cc...', '................'
  ], true);
  add('tortoise_basalt', { a: '#8b5540', b: '#4b3834', c: '#29292c', f: '#ef8238', y: '#ffc253', e: '#f3d76d' }, [
    '....f..f..f.....', '..ffaaaaaaff....', '.faabbbbbbaaf...', 'faabbyyyybbaaf..', 'faabyffybbbaaf..', '.faabbbbbbaaf...', '..ffaabbbaaff....', '..cbaaaaaabc.....', '.ccbb....bbcc....', 'cc.cc....cc.cc...', '................'
  ]);
  add('scorpion_cindertail', { a: '#a64d38', b: '#66312f', c: '#30252b', f: '#ef7732', e: '#ffd061' }, [
    '............ff..', '..........ffef..', '....aaaaafff....', '..ccaabeaacc.....', '.ccaabbbbaacc....', 'c..aabbbbaa..c...', '...aabbbbaa......', '..c..bbbb..c.....', '.cc..b..b..cc....', 'cc..cc..cc..cc...', '................'
  ]);
  add('warden_galeforged', { a: '#b8b4a5', b: '#6f7a81', c: '#354957', q: '#61d8de', g: '#d5b85d', e: '#eefff1' }, [
    '....gggggg......', '...gaaaaag......', '..gabqeqbag.....', '..gaqqqqag......', '...gaaaag.......', '..cbbqqbbc......', '.cbbqqqqbbc.....', '.cbbbqqbbbc.....', '..cbbbbbbbc.....', '...cb..bc.......', '..ccb..bcc......', '.ccc....ccc.....', '................'
  ]);
  add('serpent_cloudcoil', { a: '#b6c7c7', b: '#718b91', c: '#3a5362', q: '#65e1ed', e: '#f2f7c7' }, [
    '.....aaaa.......', '....abeeba......', '.....abba.......', '......abba......', '..q....abba.....', '.qaq...abbba....', 'qaaaq..abbbba...', '.qaq..aabbbba...', '..q..aabbbba....', '....abbbbaa.....', '...abbbbaa......', '..bbbbba........', '...cccc.........'
  ], true);
  add('minotaur_ironhorn', { a: '#9c5f50', b: '#593b3c', c: '#2c2730', m: '#89858a', e: '#e8c75d' }, [
    '.mmm........mmm.', '..mmc......cmm..', '...caaaaaaaac...', '..caabeebaac....', '..caaaaaaaac....', '.ccabbbbbacc.....', 'cbbabbbbbabbc....', 'cbbbbbbbbbbbc....', '.cbbbbbbbbbc.....', '..cbbcbccbbc.....', '.ccb......bcc....', 'ccc........ccc...', '................'
  ]);
  add('stalker_shadeclaw', { a: '#725070', b: '#3e314d', c: '#201e2c', v: '#a75ee0', r: '#c34e62', e: '#f0ce66' }, [
    '...v........v...', '..vva......avv..', '...aabbbbbaa....', '..aaberaabbba...', '.aaaaaabbbbbba..', '..aarrabbbbbb...', '....aabbbbbbaaa.', '.....bbbbbbbbaa.', '.....bb..bb.....', '....cc....cc....', '...cc......cc...', '................'
  ], true);
})();
