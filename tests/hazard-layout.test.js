'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PRODUCTION_CONTENT_FILES } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const sandbox = {
  console, window: null,
  document: { documentElement: { lang: 'zh-CN' }, querySelector: () => null, querySelectorAll: () => [] },
  navigator: { language: 'zh-CN' }, localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  Math, Number, Date, Object, Array, String, Boolean, JSON,
  Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(file) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}
PRODUCTION_CONTENT_FILES.forEach(load);
const Game = sandbox.Game;
Game.content.finalize({ strict: true });
load('js/data/formulas.js');
load('js/systems/terrain.js');
load('js/systems/terrain_v3.js');

const regions = ['grassland', 'forest', 'mine', 'graveyard', 'snowpass', 'lavacave', 'skyruins', 'darkcastle'];
let layouts = 0;
for (const regionId of regions) {
  const region = Game.reg.get('region', regionId);
  assert.ok(region);
  for (let seed = 0; seed < 12; seed++) {
    const worldSeed = Game.util.strSeed(`hazard-layout:${regionId}:${seed}`);
    const first = Game.terrain.generate(region, worldSeed, 3);
    const second = Game.terrain.generate(region, worldSeed, 3);
    const anchors = first.hazardAnchors || [];
    assert.ok(anchors.length >= 8 && anchors.length <= 10, `${regionId}/${seed} anchor count`);
    assert.deepEqual(
      Array.from(second.hazardAnchors, (anchor) => [anchor.id, anchor.x, anchor.y, anchor.clearance]),
      Array.from(anchors, (anchor) => [anchor.id, anchor.x, anchor.y, anchor.clearance]),
      `${regionId}/${seed} Hazard placement is deterministic`
    );
    assert.equal(new Set(Array.from(anchors, (anchor) => anchor.id)).size, anchors.length);

    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index];
      const gx = Math.floor(anchor.x / first.nav.cell);
      const gy = Math.floor(anchor.y / first.nav.cell);
      assert.equal(first.nav.grid[gy][gx], 1, `${anchor.id} is walkable`);
      assert.ok(anchor.clearance >= 48, `${anchor.id} preserves a 48px escape corridor`);
      assert.ok(Game.util.dist(anchor.x, anchor.y, first.camp.x, first.camp.y) >= 180);
      assert.ok(Game.util.dist(anchor.x, anchor.y, first.bossPoint.x, first.bossPoint.y) >= 120);
      for (const point of [...first.landmarks, ...first.nodes, ...first.curios]) {
        const spacing = point.kind === 'gatherNode' ? 48 : 64;
        assert.ok(Game.util.dist(anchor.x, anchor.y, point.x, point.y) >= spacing,
          `${anchor.id} avoids ${point.id}`);
      }
      for (let other = index + 1; other < anchors.length; other++) {
        assert.ok(Game.util.dist(anchor.x, anchor.y, anchors[other].x, anchors[other].y) >= 104,
          `${anchor.id} spacing`);
      }
    }
    assert.equal(
      JSON.stringify(Game.terrain.snapshotV3(first).content.hazards),
      JSON.stringify(Array.from(anchors, (anchor) => [anchor.x, anchor.y, anchor.clearance]))
    );
    layouts++;
  }
}

console.log(`Hazard layout tests passed: ${layouts} deterministic eight-region layouts.`);
