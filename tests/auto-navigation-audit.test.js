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
load('js/data/formulas.js');
load('js/systems/terrain.js');
load('js/systems/terrain_v3.js');
load('js/vendor/easystar-0.4.4.min.js');
load('js/systems/nav.js');
load('js/systems/expedition_ai.js');
load('tech-demos/exploration-v3/auto-route-audit.js');

Game.state = {
  settings: { expeditionStrategy: 'balanced' },
  world: { worldTime: 0, region: 'grassland' },
  inv: { potions: {} }
};

const interactionExpectation = Game.expeditionAI.movementExpectation({
  moveOrder: null,
  interactOrder: { type: 'gather', phase: null }
}, 'gather');
assert.equal(interactionExpectation.interactionApproach, true);
assert.equal(interactionExpectation.expected, false,
  'the current production watchdog does not cover interaction approach travel');

const routeExpectation = Game.expeditionAI.movementExpectation({
  moveOrder: { ai: true },
  interactOrder: null
}, 'frontier');
assert.equal(routeExpectation.expected, true);
assert.equal(routeExpectation.source, 'move-order');

const normalScenarios = [
  'gather-resume', 'chest-resume', 'gather-threat', 'chest-expiry'
];
const fallbackScenarios = ['gather-fallback', 'chest-fallback'];
let normalRuns = 0;
let reproduced = 0;
let recovered = 0;

for (const region of Game.reg.all('region')) {
  Game.state.world.region = region.id;
  const layout = Game.terrain.generate(region, 8, 3);
  const baseline = Game.autoRouteAudit.baseline(layout);
  assert.equal(baseline.reached, true, `${region.id} baseline route must reach the lair`);

  for (const scenario of normalScenarios) {
    const result = Game.autoRouteAudit.run(layout, scenario, 'current', baseline);
    assert.equal(result.passed, true,
      `${region.id}:${scenario} should resume under the current rule (${result.reason})`);
    assert.ok(result.logs.some((entry) => entry.event === 'route:resumed'),
      `${region.id}:${scenario} must record an explicit resume transition`);
    normalRuns++;
  }

  for (const scenario of fallbackScenarios) {
    const comparison = Game.autoRouteAudit.compare(layout, scenario, baseline);
    assert.equal(comparison.current.passed, false,
      `${region.id}:${scenario} must reproduce the current interaction watchdog gap`);
    assert.equal(comparison.current.reason, 'interaction-watchdog-unarmed');
    assert.equal(comparison.current.watchdog.productionCoverage, 0);
    assert.ok(comparison.current.logs.some((entry) =>
      entry.event === 'nav:fallback-observed'));
    reproduced++;

    assert.equal(comparison.guarded.passed, true,
      `${region.id}:${scenario} candidate recovery must reach the lair`);
    assert.ok(comparison.guarded.watchdog.cacheInvalidations >= 1);
    assert.ok(comparison.guarded.logs.some((entry) =>
      entry.event === 'watchdog:cache-invalidated'));
    assert.ok(comparison.guarded.logs.some((entry) =>
      entry.event === 'route:movement-resumed'));
    recovered++;
  }
}

assert.equal(normalRuns, 32);
assert.equal(reproduced, 16);
assert.equal(recovered, 16);
console.log(
  `Auto-navigation audit passed: ${normalRuns} normal interruptions, ` +
  `${reproduced} current gaps reproduced, ${recovered} candidate recoveries.`
);
