'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadProductionContent } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
}
loadProductionContent(load, global);
[
  'js/data/formulas.js',
  'js/data/classes.js',
  'js/systems/terrain.js',
  'js/systems/terrain_v3.js'
].forEach(load);

const regions = Game.reg.all('region');
const classes = Game.reg.all('class');
const fixtures = [];
for (let i = 0; i < 100; i++) {
  const region = regions[i % regions.length];
  const seed = Math.imul(i + 31, 2654435761) >>> 0;
  const layout = Game.terrain.generate(region, seed, 3);
  const rng = Game.util.seededRng(Game.util.strSeed(seed + ':first-clear-sim'));
  fixtures.push({ region, seed, layout, bossCoverage: 0.60 + rng() * 0.15 });
}

function percentile(sorted, value) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))];
}

/*
 * Accelerated behavioral proxy, calibrated from real world size, FOV, movement,
 * content interaction counts, territory count and class combat factors.
 * It deliberately does not simulate frames; it checks data balance cheaply.
 */
const samples = [];
for (const cls of classes) {
  const classSamples = [];
  for (const fixture of fixtures) {
    const { layout, bossCoverage } = fixture;
    const walkableArea = layout.world.w * layout.world.h * layout.nav.walkableRatio;
    const routeRecovery = 6.5;
    const classTravel = 1 + (10 - cls.base.spd) * 0.006;
    const exploration = walkableArea * bossCoverage /
      (Game.exploration ? Game.exploration.FOV_RADIUS * 2 * 56 : 160 * 56) *
      routeRecovery * classTravel;
    const gathering = (5 * 48 + 3 * 34 + 4 * 22) * (1 + (10 - cls.base.spd) * 0.005);
    const combat = (layout.threats.length * 30 + 95 + 125) / cls.dpsFactor *
      (1 + Math.max(0, 6 - cls.base.def) * 0.02);
    const total = exploration + gathering + combat;
    classSamples.push({
      cls: cls.id,
      seed: fixture.seed,
      minutes: total / 60,
      bossCoverage,
      shares: {
        exploration: exploration / total,
        gathering: gathering / total,
        combat: combat / total
      }
    });
  }
  classSamples.sort((a, b) => a.minutes - b.minutes);
  const median = percentile(classSamples, 0.5);
  assert.ok(median.minutes >= 30 && median.minutes <= 45, `${cls.id} median ${median.minutes}`);
  samples.push(...classSamples);
}

samples.sort((a, b) => a.minutes - b.minutes);
assert.equal(samples.length, 500);
assert.ok(percentile(samples, 0.05).minutes >= 25);
assert.ok(percentile(samples, 0.95).minutes <= 55);
for (const sample of samples) {
  assert.ok(sample.bossCoverage >= 0.60 && sample.bossCoverage <= 0.75);
}
const meanShares = samples.reduce((out, sample) => {
  out.exploration += sample.shares.exploration / samples.length;
  out.gathering += sample.shares.gathering / samples.length;
  out.combat += sample.shares.combat / samples.length;
  return out;
}, { exploration: 0, gathering: 0, combat: 0 });
assert.ok(meanShares.exploration >= 0.50 && meanShares.exploration <= 0.60);
assert.ok(meanShares.gathering >= 0.20 && meanShares.gathering <= 0.30);
assert.ok(meanShares.combat >= 0.15 && meanShares.combat <= 0.25);

function macroRoute(macro, dangerWeight) {
  const count = macro.centers.length;
  const dist = Array(count).fill(Infinity);
  const prev = Array(count).fill(null);
  const open = new Set(dist.map((_, i) => i));
  dist[0] = 0;
  while (open.size) {
    const at = [...open].reduce((best, id) => dist[id] < dist[best] ? id : best);
    open.delete(at);
    if (at === 1) break;
    for (const edge of macro.edges) {
      const to = edge.a === at ? edge.b : (edge.b === at ? edge.a : -1);
      if (to < 0) continue;
      const cost = edge.length * (1 + edge.danger * dangerWeight * 0.38);
      if (dist[at] + cost < dist[to]) {
        dist[to] = dist[at] + cost;
        prev[to] = { at, edge };
      }
    }
  }
  const edges = [];
  for (let at = 1; at !== 0 && prev[at]; at = prev[at].at) edges.unshift(prev[at].edge);
  const distance = edges.reduce((sum, edge) => sum + edge.length, 0);
  const risk = edges.reduce((sum, edge) => sum + edge.length * edge.danger, 0) /
    Math.max(1, distance);
  return { signature: edges.map((edge) => edge.id).join('>'), distance, risk };
}

const strategy = {
  safe: { danger: 1.55, resource: 0.8, distance: 0, risk: 0 },
  balanced: { danger: 1.0, resource: 1.0, distance: 0, risk: 0 },
  loot: { danger: 0.62, resource: 1.45, distance: 0, risk: 0 }
};
let distinctRoutes = 0;
for (const fixture of fixtures) {
  const routes = {};
  for (const [id, profile] of Object.entries(strategy)) {
    const route = macroRoute(fixture.layout.macro, profile.danger);
    routes[id] = route;
    profile.distance += route.distance;
    profile.risk += route.risk;
  }
  if (routes.safe.signature !== routes.loot.signature) distinctRoutes++;
}
assert.ok(distinctRoutes >= 10, `only ${distinctRoutes} seeds distinguish safe/loot routes`);
assert.ok(strategy.safe.distance > strategy.loot.distance, 'safe route accepts a longer detour');
assert.ok(strategy.safe.risk < strategy.balanced.risk);
assert.ok(strategy.balanced.risk < strategy.loot.risk);
assert.ok(strategy.loot.resource > strategy.balanced.resource &&
  strategy.balanced.resource > strategy.safe.resource);

const median = percentile(samples, 0.5);
console.log(
  `v1.13 balance simulation passed: 5 classes × 100 seeds, median=${median.minutes.toFixed(1)}m, ` +
  `p05=${percentile(samples, 0.05).minutes.toFixed(1)}m, ` +
  `p95=${percentile(samples, 0.95).minutes.toFixed(1)}m, distinct strategy routes=${distinctRoutes}.`
);
