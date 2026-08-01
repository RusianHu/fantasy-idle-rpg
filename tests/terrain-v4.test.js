'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadProductionContent } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
global.window = global;
const load = (file) => vm.runInThisContext(read(file), { filename: file });
loadProductionContent(load, global);
['js/systems/terrain.js', 'js/systems/terrain_v3.js', 'js/systems/terrain_v4.js'].forEach(load);

const { Game } = global;
const regions = Game.reg.all('region');
const v3Golden = JSON.parse(read('tests/golden/exploration-v3.json'));
const v4Golden = JSON.parse(read('tests/golden/exploration-v4.json'));
const hash = (snapshot) => crypto.createHash('sha256')
  .update(JSON.stringify(snapshot)).digest('hex').slice(0, 20);

function reachable(layout, target) {
  const nav = layout.nav;
  const sx = Math.floor(layout.camp.x / nav.cell);
  const sy = Math.floor(layout.camp.y / nav.cell);
  const tx = Math.floor(target.x / nav.cell);
  const ty = Math.floor(target.y / nav.cell);
  const seen = new Uint8Array(nav.w * nav.h);
  const queue = [sy * nav.w + sx];
  seen[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    if (at === ty * nav.w + tx) return true;
    const x = at % nav.w;
    const y = (at / nav.w) | 0;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= nav.w || ny >= nav.h) continue;
      const ni = ny * nav.w + nx;
      if (!seen[ni] && nav.grid[ny][nx]) { seen[ni] = 1; queue.push(ni); }
    }
  }
  return false;
}

let layouts = 0;
for (const region of regions) {
  for (let ordinal = 1; ordinal <= 200; ordinal++) {
    const seed = Math.imul(ordinal, 2654435761) >>> 0;
    const layout = Game.terrain.generate(region, seed, 4);
    const report = Game.terrain.validate(layout);
    assert.equal(report.valid, true, `${region.id}:${seed} ${JSON.stringify(report.failures)}`);
    assert.equal(layout.version, 4);
    assert.ok(layout.nests.length === 1 || layout.nests.length === 2);
    assert.equal(layout.treasureSites.length, layout.nests.length);
    assert.equal(layout.guardSites.length, layout.nests.length + 1);
    assert.equal(layout.rareThreats.length, 1);
    assert.ok(layout.bossGatePoint);
    if (layout.nests.length === 1) assert.equal(layout.nests[0].depth, 'deep');
    if (layout.nests.length === 2) {
      assert.deepEqual(layout.nests.map((nest) => nest.depth), ['mid', 'deep']);
      assert.deepEqual(layout.guardSites.slice(0, 2).map((site) => site.mode), ['visible', 'ambush']);
    }
    for (const nest of layout.nests) {
      assert.ok(nest.rx >= 96 && nest.rx <= 132);
      assert.ok(nest.mainEntrance.width >= 64 && nest.sideOpening.width >= 48);
      assert.ok(Game.util.dist(nest.x, nest.y, layout.camp.x, layout.camp.y) > nest.rx + 220);
      assert.ok(Game.util.dist(nest.x, nest.y, layout.bossPoint.x, layout.bossPoint.y) > nest.rx + 110);
    }
    for (const target of [...layout.treasureSites, ...layout.guardSites,
      ...layout.rareThreats, layout.bossGatePoint]) {
      assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y));
      assert.equal(reachable(layout, target), true, `${region.id}:${seed}:${target.id} reachable`);
    }
    if (ordinal % 10 === 0) {
      assert.deepEqual(Game.terrain.snapshotV4(layout),
        Game.terrain.snapshotV4(Game.terrain.generate(region, seed, 4)));
    }
    layouts++;
  }
}
assert.equal(layouts, 1600);

// Loading v4 is an additive layer: every v3 golden remains byte-stable.
for (const region of regions) for (const seed of v3Golden.seeds) {
  assert.equal(hash(Game.terrain.snapshotV3(Game.terrain.generate(region, seed, 3))),
    v3Golden.regions[region.id][String(seed)], `${region.id}:${seed} v3 golden drift`);
  assert.equal(hash(Game.terrain.snapshotV4(Game.terrain.generate(region, seed, 4))),
    v4Golden.regions[region.id][String(seed)], `${region.id}:${seed} v4 golden drift`);
}

let fuzzed = 0;
const signatures = new Set();
for (let i = 0; i < 5000; i++) {
  const region = regions[i % regions.length];
  const seed = Math.imul(i + 17, 2246822519) >>> 0;
  const topology = Game.terrain.fastTopology(region, seed);
  assert.ok(topology.centers >= 14 && topology.centers <= 18);
  assert.ok(topology.loopRank >= 2 && topology.edges >= topology.centers + 1);
  signatures.add(`${region.id}:${topology.signature}`);
  fuzzed++;
}
assert.equal(fuzzed, 5000);
assert.ok(signatures.size / fuzzed > 0.995);

console.log('Terrain v4 tests passed: 1600 full guarded-nest layouts, 5000 topology fuzz seeds, v3/v4 goldens.');
