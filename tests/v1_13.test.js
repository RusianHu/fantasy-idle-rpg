'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function makeSandbox(files) {
  const sandbox = {
    console, setTimeout, clearTimeout, performance,
    Math, Date, Number, Uint8Array, Array, Object, String, Boolean, JSON, isFinite
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of files) vm.runInContext(read(file), sandbox, { filename: file });
  return sandbox;
}

const coreFiles = [
  'js/core/utils.js',
  'js/core/eventbus.js',
  'js/core/registry.js',
  'js/data/regions.js',
  'js/systems/terrain.js',
  'js/systems/terrain_v3.js'
];
global.window = global;
for (const file of coreFiles) vm.runInThisContext(read(file), { filename: file });
const Game = global.Game;
const regions = Game.reg.all('region');
const golden = JSON.parse(read('tests/golden/exploration-v3.json'));

function structuralHash(layout) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(Game.terrain.snapshotV3(layout)))
    .digest('hex')
    .slice(0, 20);
}

function macroMainCost(macro) {
  const dist = Array(macro.centers.length).fill(Infinity);
  const open = new Set(dist.map((_, i) => i));
  dist[0] = 0;
  while (open.size) {
    let at = [...open].reduce((best, id) => dist[id] < dist[best] ? id : best);
    open.delete(at);
    for (const edge of macro.edges) {
      if (edge.kind === 'alternate') continue;
      const to = edge.a === at ? edge.b : (edge.b === at ? edge.a : -1);
      if (to >= 0 && dist[at] + edge.length < dist[to]) dist[to] = dist[at] + edge.length;
    }
  }
  return dist[1];
}

function edgeLength(macro, a, b) {
  const edge = macro.edges.find((e) =>
    (e.a === a && e.b === b) || (e.a === b && e.b === a));
  return edge && edge.length;
}

/* 8 regions × 200 seeds: hard constraints, reachability and determinism. */
let layouts = 0;
let fallbacks = 0;
const generationMs = [];
for (const region of regions) {
  assert.equal(region.exploration.world.w, 2400);
  assert.equal(region.exploration.world.h, 1440);
  assert.equal(region.exploration.resources.length, 5);
  assert.equal(region.exploration.landmarks.length, 4);
  assert.equal(region.exploration.curios.length, 3);
  assert.equal(region.exploration.ecology.length, 2);
  assert.equal(region.exploration.commissions.length, 4);
  for (let n = 1; n <= 200; n++) {
    const seed = Math.imul(n, 2654435761) >>> 0;
    const started = performance.now();
    const first = Game.terrain.generate(region, seed, 3);
    generationMs.push(performance.now() - started);
    const report = Game.terrain.validate(first);
    assert.equal(report.valid, true, `${region.id}:${seed} ${JSON.stringify(report.failures)}`);
    assert.equal(first.version, 3);
    assert.deepEqual([first.world.w, first.world.h], [2400, 1440]);
    assert.equal(first.nav.cell, 16);
    assert.ok(first.nav.walkableRatio >= 0.60 && first.nav.walkableRatio <= 0.70);
    assert.ok(first.macro.centers.length >= 14 && first.macro.centers.length <= 18);
    assert.ok(first.macro.loopRank >= 2);
    assert.ok(first.macro.edges.length >= first.macro.centers.length + 1);
    assert.deepEqual(Array.from(first.macro.alternateRoute), [0, 2, 3, 1]);
    assert.equal(first.chunks.length, 15);
    assert.ok(report.metrics.minClearancePx >= 48);
    const alternateCost = edgeLength(first.macro, 0, 2) +
      edgeLength(first.macro, 2, 3) + edgeLength(first.macro, 3, 1);
    assert.ok(alternateCost <= macroMainCost(first.macro) * 1.6);
    assert.ok(first.nodes.length >= 16 && first.nodes.length <= 22);
    assert.ok(first.nodes.every((node) => Number.isFinite(node.phase)),
      `${region.id}:${seed} every gather node needs a finite render phase`);
    assert.ok(first.threats.length >= 6 && first.threats.length <= 9);
    assert.equal(first.landmarks.length, 4);
    assert.equal(first.curios.length, 3);
    assert.equal(first.ecology.length, 2);
    assert.ok(first.guardian && first.bossLair);
    const surfaceMaterial = (x, y) => first.grid[
      Math.floor(y / first.cell) * first.gw + Math.floor(x / first.cell)
    ];
    for (const [dx, dy] of [[0, 0], [30, 26], [22, 22], [-62, 25], [48, 4]]) {
      assert.ok(
        !['water', 'lava', 'blocked', 'void'].includes(surfaceMaterial(first.camp.x + dx, first.camp.y + dy)),
        `${region.id}:${seed} camp surface must be dry and visible`
      );
    }
    assert.ok(first.props.length >= 550, `${region.id}:${seed} v3 environment is too sparse`);
    const blockerProps = first.props.filter((prop) => prop.blockerProp);
    assert.ok(blockerProps.length >= 350,
      `${region.id}:${seed} hard blockers need visible environment silhouettes`);
    assert.ok(blockerProps.every((prop) =>
      /(tree|oak|birch|pine|rocks_big|crystal_big|beam|tombstone|grave_cross|obsidian|lava_rock|pillar|spikes|banner)/.test(prop.sprite)),
    `${region.id}:${seed} hard blocker uses a misleading small prop`);
    if (region.terrain.tufts > 0) {
      assert.ok(first.tufts.length >= region.terrain.tufts * 5,
        `${region.id}:${seed} tuft density regressed`);
    }
    if (region.terrain.flowers) {
      assert.ok(first.flowers.length >= region.terrain.flowers.count * 4,
        `${region.id}:${seed} flower density regressed`);
    }
    if (first.generation.fallback) fallbacks++;

    // Golden seeds and a regular sample guard determinism without doubling
    // the cost of the entire 1,600-layout constraint suite.
    if (n % 10 === 0) {
      const second = Game.terrain.generate(region, seed, 3);
      assert.deepEqual(
        Game.terrain.snapshotV3(first),
        Game.terrain.snapshotV3(second),
        `${region.id}:${seed} must be deterministic`
      );
    }
    layouts++;
  }
}
assert.equal(layouts, 1600);
assert.ok(fallbacks / layouts < 0.001, `fallback rate ${(fallbacks / layouts * 100).toFixed(3)}%`);
generationMs.sort((a, b) => a - b);
const p95Generation = generationMs[Math.floor(generationMs.length * 0.95)];
assert.ok(p95Generation < 120, `p95 generation ${p95Generation.toFixed(1)}ms exceeds budget`);

// Editing a resource's visual stream cannot perturb the macro topology stream.
const streamRegion = Object.assign({}, regions[0], {
  exploration: Object.assign({}, regions[0].exploration, {
    resources: regions[0].exploration.resources.map((x, i) =>
      Object.assign({}, x, i === 0 ? { sprite: 'stream-isolation-probe' } : null))
  })
});
const streamBase = Game.terrain.generate(regions[0], 20260727, 3);
const streamProbe = Game.terrain.generate(streamRegion, 20260727, 3);
assert.deepEqual(
  streamBase.macro.centers.map((x) => [x.x, x.y, x.role]),
  streamProbe.macro.centers.map((x) => [x.x, x.y, x.role])
);
assert.deepEqual(
  streamBase.macro.edges.map((x) => [x.a, x.b, x.kind, x.width]),
  streamProbe.macro.edges.map((x) => [x.a, x.b, x.kind, x.width])
);

/* Eight golden seeds per region lock the stable-world contract. */
for (const region of regions) {
  for (const seed of golden.seeds) {
    const layout = Game.terrain.generate(region, seed, 3);
    assert.equal(
      structuralHash(layout),
      golden.regions[region.id][String(seed)],
      `${region.id}:${seed} golden snapshot drift`
    );
  }
}

/* 5,000 cheap topology fuzz cases: no line/chain-only regression. */
const signatures = new Set();
let fuzzed = 0;
for (let i = 0; i < 5000; i++) {
  const region = regions[i % regions.length];
  const seed = Math.imul(i + 17, 2246822519) >>> 0;
  const topo = Game.terrain.fastTopology(region, seed);
  assert.ok(topo.centers >= 14 && topo.centers <= 18);
  assert.ok(topo.loopRank >= 2);
  assert.ok(topo.edges >= topo.centers + 1);
  assert.deepEqual(Array.from(topo.alternateRoute), [0, 2, 3, 1]);
  signatures.add(region.id + ':' + topo.signature);
  fuzzed++;
}
assert.equal(fuzzed, 5000);
assert.ok(signatures.size / fuzzed > 0.995, `topology uniqueness ${signatures.size}/${fuzzed}`);

/* Collision cannot cross a hard cell, and projectPoint returns legal clearance. */
const collisionLayout = Game.terrain.generate(regions[0], 42, 3);
Game.terrain.mount(collisionLayout, regions[0]);
let blocker = null;
for (let y = 8; y < collisionLayout.nav.h - 8 && !blocker; y++) {
  for (let x = 8; x < collisionLayout.nav.w - 8; x++) {
    if (!collisionLayout.nav.grid[y][x] && collisionLayout.nav.grid[y][x - 1]) {
      blocker = { x, y };
      break;
    }
  }
}
assert.ok(blocker, 'representative hard blocker exists');
const startX = blocker.x * 16 - 8;
const startY = blocker.y * 16 + 8;
const swept = Game.terrain.sweepMove(startX, startY, 40, 0, 7);
assert.ok(swept.x < blocker.x * 16 + 16, 'sweep collision does not tunnel through hard blocker');
const projected = Game.terrain.projectPoint(blocker.x * 16 + 8, blocker.y * 16 + 8, 2);
assert.ok(projected && Game.terrain.isWalkable(projected.x, projected.y, 32));

// Local projection repair is deterministic for the same invalid candidate.
const repairA = Game.terrain.generate(regions[0], 989898, 3);
const repairB = Game.terrain.generate(regions[0], 989898, 3);
let hard = null;
for (let y = 1; y < repairA.nav.h && !hard; y++) {
  for (let x = 1; x < repairA.nav.w; x++) {
    if (!repairA.nav.grid[y][x]) { hard = { x: x * 16 + 8, y: y * 16 + 8 }; break; }
  }
}
repairA.landmarks[0].x = repairB.landmarks[0].x = hard.x;
repairA.landmarks[0].y = repairB.landmarks[0].y = hard.y;
const invalidA = Game.terrain.validate(repairA);
const invalidB = Game.terrain.validate(repairB);
Game.terrain.repair(repairA, invalidA);
Game.terrain.repair(repairB, invalidB);
assert.deepEqual(
  [repairA.landmarks[0].x, repairA.landmarks[0].y],
  [repairB.landmarks[0].x, repairB.landmarks[0].y]
);

/* Fog, collection, readiness, completion and dynamic expedition stability. */
const systemsBox = makeSandbox([
  'js/core/utils.js',
  'js/core/eventbus.js',
  'js/core/registry.js',
  'js/data/formulas.js',
  'js/data/regions.js',
  'js/systems/terrain.js',
  'js/systems/terrain_v3.js',
  'js/systems/exploration.js',
  'js/systems/expedition.js'
]);
const G = systemsBox.Game;
const grass = G.reg.get('region', 'grassland');
const explorationLayout = G.terrain.generate(grass, 424242, 3);
G.terrain.mount(explorationLayout, grass);
let expAwarded = 0;
let crystals = 0;
let rareRewards = 0;
G.state = {
  settings: { expeditionStrategy: 'balanced', controlMode: 'auto' },
  player: { level: 1, perms: {} },
  inv: { materials: {}, potions: {} },
  world: {
    region: 'grassland', regionOrder: regions.map((r) => r.id),
    worldSeed: 424242, worldTime: 300, mode: 'battle',
    exploration: {}, regionProg: {}
  },
  meta: { stats: {} }
};
G.State = {
  regionTier: () => 1,
  regionProg: (rid) => G.state.world.regionProg[rid] ||
    (G.state.world.regionProg[rid] = { kills: 0, cleared: false, firstKill: false })
};
G.player = {
  addExp: (n) => { expAwarded += n; },
  addCrystal: (n) => { crystals += n; }
};
G.inv = {
  genLoot: () => ({ id: 'test-rare' }),
  addItems: () => { rareRewards++; }
};
G.world = {
  layout: explorationLayout,
  region: grass,
  hero: { x: explorationLayout.camp.x, y: explorationLayout.camp.y, state: 'idle' },
  controlMode: () => 'auto'
};

const fogState = G.exploration.regionState('grassland');
assert.deepEqual([fogState.fog.w, fogState.fog.h], [75, 45]);
assert.equal(G.exploration.validateFog('grassland', fogState.fog), true);

let sightCase = null;
for (let y = 8; y < explorationLayout.nav.h - 8 && !sightCase; y++) {
  for (let x = 8; x < explorationLayout.nav.w - 8; x++) {
    if (explorationLayout.nav.grid[y][x - 2] && !explorationLayout.nav.grid[y][x] &&
        explorationLayout.nav.grid[y][x + 2] &&
        G.util.dist(x * 16, y * 16, explorationLayout.camp.x, explorationLayout.camp.y) > 180) {
      sightCase = { y: y * 16 + 8, from: (x - 2) * 16 + 8, behind: (x + 2) * 16 + 8 };
      break;
    }
  }
}
assert.ok(sightCase, 'line-of-sight blocker fixture exists');
G.world.hero.x = sightCase.from;
G.world.hero.y = sightCase.y;
G.exploration.revealAt(sightCase.from, sightCase.y, { force: true, rid: 'grassland' });
assert.equal(G.exploration.isRevealed(sightCase.behind, sightCase.y, 'grassland'), false,
  'hard blockers occlude fog visibility');

const beforeLegal = G.exploration.coverage('grassland');
G.world.hero.state = 'warpOut';
assert.equal(G.exploration.revealAt(G.world.hero.x, G.world.hero.y), 0);
assert.equal(G.exploration.coverage('grassland'), beforeLegal, 'warp cannot reveal fog');
G.world.hero.state = 'idle';
G.world.hero.x = explorationLayout.camp.x;
G.world.hero.y = explorationLayout.camp.y;
let fogEvents = 0;
G.bus.on('fog:revealed', () => { fogEvents++; });
assert.ok(G.exploration.revealAt(G.world.hero.x, G.world.hero.y) > 0);
G.exploration.revealAt(G.world.hero.x + 20, G.world.hero.y, { force: true });
G.exploration.update(0.2);
assert.equal(fogEvents, 1, 'fog changes aggregate into one short-window event');
const savedFog = G.exploration.serializeFog('grassland');
assert.match(savedFog.data, /^[A-Za-z0-9+/]*={0,2}$/);
assert.ok(savedFog.data.length < 700, 'fog bitset stays compact');
assert.equal(G.exploration.validateFog('grassland', savedFog), true);
const firstFrontier = G.exploration.nextObjective(
  'grassland', G.world.hero.x, G.world.hero.y
);
assert.ok(firstFrontier && /^frontier:\d+:\d+$/.test(firstFrontier.id));
assert.equal(G.exploration.isRevealed(firstFrontier.x, firstFrontier.y, 'grassland'), false);
const frontierNavX = Math.floor(firstFrontier.x / explorationLayout.nav.cell);
const frontierNavY = Math.floor(firstFrontier.y / explorationLayout.nav.cell);
assert.ok(explorationLayout.nav.grid[frontierNavY][frontierNavX] &&
  explorationLayout.nav.distance[frontierNavY][frontierNavX] >= 2,
  'frontier targets are unknown walkable cells, not projected blocker faces');
const alternateFrontier = G.exploration.nextObjective(
  'grassland', G.world.hero.x, G.world.hero.y, (id) => id === firstFrontier.id
);
assert.ok(!alternateFrontier || alternateFrontier.id !== firstFrontier.id,
  'temporarily blocked frontiers are not selected again');

const firstLandmark = grass.exploration.landmarks[0].id;
const expBefore = expAwarded;
assert.equal(G.collection.record('landmarks', firstLandmark, { rid: 'grassland' }), true);
assert.equal(G.collection.record('landmarks', firstLandmark, { rid: 'grassland' }), false);
assert.ok(expAwarded > expBefore, 'first discovery grants experience once');

// Reveal every legal fog cell through forced legal sampling to exercise the real bitset.
for (let y = 16; y < explorationLayout.world.h; y += 64) {
  for (let x = 16; x < explorationLayout.world.w; x += 64) {
    const p = G.terrain.projectPoint(x, y, 1);
    if (p) G.exploration.revealAt(p.x, p.y, { force: true, rid: 'grassland' });
  }
}
G.exploration.update(0.2);
assert.ok(G.exploration.coverage('grassland') >= 0.95);
const rs = G.exploration.regionState('grassland');
rs.discovered.resources = {};
rs.discovered.curios = {};
rs.discovered.ecology = {};
for (const def of grass.exploration.landmarks) rs.discovered.landmarks[def.id] = true;
rs.discovered.guardian = true;
const alternativeReady = G.exploration.readiness('grassland');
assert.equal(alternativeReady.total, 70, 'exploration + landmarks + guardian is a valid route');
assert.equal(alternativeReady.lair, true);
for (const def of grass.exploration.resources) rs.discovered.resources[def.id] = true;
for (const def of grass.exploration.curios) rs.discovered.curios[def.id] = true;
for (const def of grass.exploration.ecology) rs.discovered.ecology[def.id] = true;
const ready = G.exploration.readiness('grassland');
assert.equal(ready.total, 100);
assert.equal(ready.lair, true);
assert.equal(G.exploration.isComplete('grassland'), true);
G.exploration.update(0.01);
assert.equal(rs.completionRewarded, true);
assert.ok(crystals > 0 && rareRewards === 1, '100% completion reward is one-shot');
G.exploration.update(0.01);
assert.equal(rareRewards, 1);

const firstExpedition = G.expedition.start('grassland');
const stable = JSON.stringify(firstExpedition);
assert.equal(JSON.stringify(G.expedition.current('grassland')), stable, 'active expedition is stable');
assert.equal(G.expedition.finish('test', 'grassland'), true);
assert.equal(G.expedition.current('grassland').index, 1);
assert.notEqual(JSON.stringify(G.expedition.current('grassland')), stable);

/* Three strategy profiles and no unknown-content coordinate access in the AI source. */
const aiSource = read('js/systems/expedition_ai.js');
assert.match(aiSource, /safe:\s*\{ hp: 0\.58/);
assert.match(aiSource, /balanced:\s*\{ hp: 0\.36/);
assert.match(aiSource, /loot:\s*\{ hp: 0\.24/);
assert.match(aiSource, /nextObjective/);
assert.match(aiSource, /!visible\(n\)/,
  'resource circuits must never target exact coordinates in unexplored fog');
assert.match(aiSource, /autoNodeReady\(n\)/,
  'automatic gathering only targets revealed, ready resources');
assert.doesNotMatch(aiSource, /layout\.(landmarks|nodes|curios|ecology)\[[^\]]+\].*frontier/);
assert.match(aiSource, /boss && boss\.ready\.coverage >= 0\.60/);
assert.match(aiSource, /balanced:.*engage: 72/,
  'balanced auto expeditions must notice monsters that are visibly along the route');
assert.match(aiSource, /function preservedTravel\(hero\)/,
  'active AI travel keeps a stable target until arrival or a valid preemption');
assert.doesNotMatch(aiSource, /reveal-grace/,
  'newly revealed resources divert the route immediately without a notice hold');
assert.match(aiSource, /trace: function \(\) \{ return trace\.slice\(\); \}/,
  'AI exposes a bounded read-only decision trace for deterministic diagnostics');
assert.match(aiSource, /Game\.actionBubbles\.show\(hero, 'gather'/,
  'automatic gathering reports its action through the shared bubble manager');
assert.match(read('js/systems/exploration.js'), /FRONTIER_HORIZON = 520/,
  'frontier selection prefers a local exploration horizon');
assert.match(read('js/render/renderer.js'), /if \(mo\.ai\)/,
  'AI travel and player click markers must remain visually distinct');
assert.match(read('js/render/renderer.js'), /Game\.actionBubbles\.visit/,
  'the renderer consumes generic entity anchors instead of hero-only bubble state');
assert.doesNotMatch(read('js/render/renderer.js'),
  /ctx\.fillStyle = bubble\.style\.accent;\s*ctx\.fillRect\(x \+ 2, y \+ 3, 2, h - 6\)/,
  'action bubbles must not paint a solid type-color strip along the left paper edge');
assert.ok(aiSource.indexOf('var guardian = guardianTarget(hero);') <
  aiSource.indexOf("setMove(hero, boss.target, 'ai-boss')"),
  'guardian decision remains ahead of Boss execution');
assert.doesNotMatch(read('js/systems/offline.js'), /exploration\.reveal/);
assert.match(read('js/systems/exploration.js'), /ctx\.fillStyle = '#080912'/,
  'unknown fog must fully hide terrain tiles and undiscovered entities');
assert.match(read('js/render/renderer.js'), /sp\.w <= 13 && sp\.h <= 13 \? 2 : 1/,
  'small v3 resource sprites must use an integer 2x world scale');
assert.match(read('js/render/renderer.js'), /Number\.isFinite\(node\.phase\)/,
  'resource rendering must tolerate v3 layouts created before phase was added');
assert.doesNotMatch(read('js/render/renderer.js'), /Math\.sin\([^;\n]*node\.phase/,
  'resource animation must never feed an optional phase directly into coordinates');
assert.match(read('js/systems/environment.js'),
  /!Game\.exploration\.isRevealed\(node\.x, node\.y\)/,
  'ambient auto-gather must reject unrevealed resources');
assert.doesNotMatch(read('js/systems/environment.js'), /AUTO_GATHER_REVEAL_GRACE/,
  'ambient auto-gather must not delay newly revealed resources');
assert.match(read('js/systems/world.js'),
  /!Game\.exploration\.isRevealed\(gatherTarget\.x, gatherTarget\.y\)/,
  'the interaction boundary must reject hidden v3 resources');
assert.match(read('js/systems/world.js'), /autoNodeReady\(gatherTarget\)/,
  'the interaction boundary must enforce ambient node visibility');
assert.doesNotMatch(read('js/render/renderer.js'),
  /Game\.assets\.draw\(ctx, spriteId, 'idle0', x, y, \{ alpha: 0\.22/,
  'depleted resources must not render as a misleading translucent live node');

const bubbleBox = makeSandbox([
  'js/core/utils.js',
  'js/core/eventbus.js',
  'js/systems/action_bubbles.js'
]);
const Bubble = bubbleBox.Game.actionBubbles;
const bubbleHero = { kind: 'hero', x: 80, y: 90 };
const bubbleMonster = { kind: 'monster', x: 120, y: 90 };
const resourceBubble = Bubble.show(bubbleHero, 'resource', { targetId: 'node-a' });
assert.equal(resourceBubble.type, 'resource');
assert.equal(resourceBubble.icon, 'resource');
assert.equal(Object.prototype.hasOwnProperty.call(resourceBubble, 'textKey'), false,
  'RPG reaction bubble snapshots remain icon-only');
assert.equal(Bubble.show(bubbleHero, 'resource', { targetId: 'node-a' }), false,
  'same entity and target bubble is deduplicated');
assert.equal(Bubble.show(bubbleMonster, 'alert', { targetId: 'monster-a' }).type, 'alert');
assert.equal(Bubble.show(bubbleHero, 'enemy', { targetId: 'monster-a' }).type, 'enemy');
assert.equal(Bubble.show(bubbleHero, 'loot', { targetId: 'loot-a' }).state, 'queued');
let bubbleSnapshot = Bubble.active();
assert.equal(bubbleSnapshot.filter((entry) => entry.state === 'visible').length, 2);
assert.ok(bubbleSnapshot.some((entry) =>
  entry.entityKind === 'hero' && entry.type === 'enemy' && entry.state === 'visible'));
assert.ok(bubbleSnapshot.some((entry) =>
  entry.entityKind === 'monster' && entry.type === 'alert' && entry.state === 'visible'));
assert.ok(bubbleSnapshot.every((entry) => !Object.prototype.hasOwnProperty.call(entry, 'anchor')),
  'diagnostics expose coordinates and stable IDs without leaking mutable anchors');
for (let tick = 0; tick < 10; tick++) Bubble.update(0.25);
bubbleSnapshot = Bubble.active();
assert.ok(bubbleSnapshot.some((entry) =>
  entry.entityKind === 'hero' && entry.type === 'loot' && entry.state === 'visible'),
'a queued lower-priority bubble advances after the encounter bubble expires');
Bubble.clear();
assert.deepEqual(Array.from(Bubble.active()), []);

const offlineBox = makeSandbox([
  'js/core/utils.js',
  'js/core/eventbus.js',
  'js/core/registry.js',
  'js/data/formulas.js',
  'js/data/regions.js',
  'js/data/monsters.js',
  'js/systems/offline.js'
]);
const O = offlineBox.Game;
let offlineDiscoveries = { resources: {} };
let offlineCoverage = 0;
O.entryState = 'playing';
O.state = { world: { mode: 'battle', layoutVersion: 3, region: 'grassland' } };
O.State = {
  isAdventureStarted: () => true,
  regionOrder: () => regions.map((r) => r.id),
  regionTier: () => 1
};
O.player = {
  estimateDps: () => 100,
  derived: () => ({ expMul: 1, goldMul: 1 })
};
O.exploration = {
  regionState: () => ({ discovered: offlineDiscoveries }),
  coverage: () => offlineCoverage
};
const unknownRouteOffline = O.offline.settle(3600);
assert.deepEqual(
  [unknownRouteOffline.knownResources, unknownRouteOffline.kills,
    unknownRouteOffline.expBase, unknownRouteOffline.goldBase, unknownRouteOffline.items],
  [0, 0, 0, 0, 0],
  'offline expedition cannot fight, discover or loot without revealed intelligence'
);
offlineCoverage = 0.05;
const revealedOnlyOffline = O.offline.settle(3600);
assert.ok(revealedOnlyOffline.kills > 0, 'revealed terrain enables low-efficiency combat');
offlineDiscoveries.resources.herb_patch = true;
const knownRouteOffline = O.offline.settle(3600);
assert.ok(knownRouteOffline.routeLoops > 0 &&
  knownRouteOffline.kills > revealedOnlyOffline.kills,
  'offline expedition may gather and meet limited threats on a known route');

/* Asset provenance, stable IDs, source coverage and script order. */
const assetBox = {
  console,
  window: { Game: { assets: { defineSprite: (def) => assetBox.defs.set(def.id, def) } } },
  defs: new Map()
};
vm.createContext(assetBox);
vm.runInContext(read('js/sprites/exploration_v3.js'), assetBox, { filename: 'js/sprites/exploration_v3.js' });
vm.runInContext(read('js/sprites/exploration_v3.manifest.js'), assetBox, { filename: 'js/sprites/exploration_v3.manifest.js' });
const manifest = assetBox.window.Game.EXPLORATION_V3_ASSETS;
const actualSourceHash = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, manifest.source.path)))
  .digest('hex');
assert.equal(actualSourceHash, manifest.source.sha256);
assert.equal(manifest.assets.length, 32);
assert.equal(new Set(manifest.assets).size, 32);
for (const id of manifest.assets) assert.ok(assetBox.defs.has(id), `${id} code fallback exists`);
const newResourceSprites = regions.flatMap((r) => r.exploration.resources.slice(2).map((x) => x.sprite));
assert.equal(new Set(newResourceSprites).size, 24);
for (const id of newResourceSprites) assert.ok(manifest.assets.includes(id));
const index = read('index.html');
assert.ok(index.indexOf('systems/terrain_v3.js') > index.indexOf('systems/terrain.js'));
assert.ok(index.indexOf('systems/exploration.js') < index.indexOf('systems/world.js'));
assert.ok(index.indexOf('systems/action_bubbles.js') < index.indexOf('systems/expedition_ai.js'));
assert.ok(index.indexOf('render/exploration.js') > index.indexOf('render/terrain.js'));
assert.ok(fs.existsSync(path.join(ROOT, 'tech-demos/exploration-v3/exploration-v3.html')));

console.log(
  `v1.13 exploration tests passed: ${layouts} full layouts, ${fuzzed} topology fuzz cases, ` +
  `fallbacks=${fallbacks}, p95=${p95Generation.toFixed(1)}ms.`
);
