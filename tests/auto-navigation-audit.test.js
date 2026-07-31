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
load('js/systems/environment.js');
load('js/systems/world.js');
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
assert.equal(interactionExpectation.expected, true,
  'production watchdog must cover interaction approach travel');
assert.equal(interactionExpectation.source, 'interaction-approach');

const routeExpectation = Game.expeditionAI.movementExpectation({
  moveOrder: { ai: true },
  interactOrder: null
}, 'frontier');
assert.equal(routeExpectation.expected, true);
assert.equal(routeExpectation.source, 'move-order');

const actionExpectation = Game.expeditionAI.movementExpectation({
  moveOrder: null,
  interactOrder: { type: 'gather', phase: 'act' }
}, 'gather');
assert.equal(actionExpectation.expected, false,
  'interaction action phase must not arm movement recovery');

const combatExpectation = Game.expeditionAI.movementExpectation({
  moveOrder: { ai: true },
  interactOrder: { type: 'gather', phase: null },
  target: { dead: false }
}, 'gather');
assert.equal(combatExpectation.expected, false,
  'combat must suppress movement recovery');
assert.equal(combatExpectation.source, 'combat');

Game.nav.cache = { 'recover-key': null };
Game.nav.pending = { 'recover-key': { key: 'recover-key' } };
Game.nav.queue = [{ key: 'recover-key' }];
Game.nav.diagnostics.invalidated = 0;
const recoverEntity = { navRoute: { pathKey: 'recover-key' } };
assert.equal(Game.nav.recover(recoverEntity), true,
  'navigation recovery must invalidate cached and queued failures');
assert.equal(recoverEntity.navRoute, null);
assert.equal(Object.prototype.hasOwnProperty.call(Game.nav.cache, 'recover-key'), false);
assert.equal(Game.nav.pending['recover-key'], undefined);
assert.equal(Game.nav.queue.length, 0);
assert.equal(Game.nav.diagnostics.invalidated, 1);

const productionWorld = Game.world;
const originalPlayer = Game.player;

function runWatchdogSimulation({ fps, terrainCost, moving }) {
  const target = { id: `node:watchdog:${fps}:${terrainCost}`, x: 120, y: 100 };
  const hero = {
    x: 100, y: 100, state: 'walk', target: null, moveOrder: null,
    interactOrder: { type: 'gather', target, phase: null },
    navRoute: null
  };
  let autoControl = true;
  let cancellationReason = null;
  let cancellationAt = null;
  let clearCalls = 0;
  let recoverCalls = 0;
  const originalClear = Game.nav.clear;
  const originalRecover = Game.nav.recover;
  Game.world = {
    hero,
    layout: { version: 3, nodes: [], camp: { x: 0, y: 0 } },
    entities: [],
    groundLoot: [],
    bossEnt: null,
    controlMode: () => autoControl ? 'auto' : 'manual',
    cancelInteraction: (reason) => {
      cancellationReason = reason;
      cancellationAt = Game.state.world.worldTime;
      hero.interactOrder = null;
      autoControl = false;
      Game.nav.clear(hero);
      return true;
    }
  };
  Game.player = { hpPct: () => 1 };
  Game.state.world.mode = 'battle';
  Game.state.world.worldTime = 0;
  Game.expeditionAI.reset();
  Game.nav.clear = (entity) => {
    clearCalls++;
    return originalClear(entity);
  };
  Game.nav.recover = (entity) => {
    recoverCalls++;
    return originalRecover(entity);
  };

  const dt = 1 / fps;
  const frameCount = Math.ceil(7 / dt);
  try {
    for (let frame = 0; frame < frameCount && !cancellationReason; frame++) {
      Game.state.world.worldTime += dt;
      Game.expeditionAI.update(hero, dt);
      if (moving) hero.x += 56 * dt / terrainCost;
    }
    return {
      cancellationReason,
      cancellationAt,
      clearCalls,
      recoverCalls,
      diagnostics: Game.expeditionAI.diagnostics()
    };
  } finally {
    Game.nav.clear = originalClear;
    Game.nav.recover = originalRecover;
    Game.world = productionWorld;
    Game.player = originalPlayer;
  }
}

[
  { fps: 60, terrainCost: 1 },
  { fps: 90, terrainCost: 1.18 },
  { fps: 120, terrainCost: 1 },
  { fps: 144, terrainCost: 1 }
].forEach((sample) => {
  const result = runWatchdogSimulation({ ...sample, moving: true });
  assert.equal(result.cancellationReason, null,
    `${sample.fps}Hz continuous movement must not be cancelled`);
  assert.equal(result.clearCalls, 0,
    `${sample.fps}Hz continuous movement must not reset its route`);
  assert.equal(result.recoverCalls, 0,
    `${sample.fps}Hz continuous movement must not invalidate navigation`);
  assert.equal(result.diagnostics.recoveryTier, 0,
    `${sample.fps}Hz continuous movement must keep the recovery tier clear`);
  assert.ok(result.diagnostics.watchdogProgress >= Game.expeditionAI.watchdogPolicy.minProgress,
    `${sample.fps}Hz movement window must accumulate enough progress`);
});

const stationaryResult = runWatchdogSimulation({
  fps: 120, terrainCost: 1, moving: false
});
assert.equal(stationaryResult.cancellationReason, 'stuck-fallback',
  'zero progress must reach the final recovery tier');
assert.ok(stationaryResult.cancellationAt >= 6 && stationaryResult.cancellationAt <= 6.5,
  'zero progress must cancel after the production six-second threshold');
assert.ok(stationaryResult.clearCalls >= 2,
  'zero progress must reset the route and clear the cancelled interaction');
assert.ok(stationaryResult.recoverCalls >= 2,
  'zero progress must run cache recovery before and during cancellation');

const persistentTarget = { id: 'node:persistent-failure', x: 120, y: 100 };
const stuckHero = {
  x: 100, y: 100, target: null, moveOrder: null,
  interactOrder: { type: 'gather', target: persistentTarget, phase: null },
  navRoute: null
};
let autoControl = true;
let cancellationReason = null;
Game.world = {
  hero: stuckHero,
  layout: { version: 3, nodes: [], camp: { x: 0, y: 0 } },
  entities: [],
  groundLoot: [],
  bossEnt: null,
  controlMode: () => autoControl ? 'auto' : 'manual',
  cancelInteraction: (reason) => {
    cancellationReason = reason;
    stuckHero.interactOrder = null;
    autoControl = false;
    Game.nav.clear(stuckHero);
    return true;
  }
};
Game.player = { hpPct: () => 1 };
Game.state.world.mode = 'battle';
Game.state.world.worldTime = 0;
Game.expeditionAI.reset();
for (let tick = 0; tick < 14 && !cancellationReason; tick++) {
  Game.state.world.worldTime += 0.5;
  stuckHero.navRoute = { pathKey: 'persistent-key', fallback: true };
  Game.nav.cache['persistent-key'] = null;
  Game.expeditionAI.update(stuckHero, 0.5);
}
assert.equal(cancellationReason, 'stuck-fallback',
  'persistent interaction failure must be cancelled at the final recovery tier');
assert.equal(Game.expeditionAI.isTargetBlocked(persistentTarget.id), true,
  'cancelled automatic interaction target must be temporarily blocked');
Game.world = productionWorld;
Game.player = originalPlayer;

const ambientSnapshot = {
  hero: productionWorld.hero,
  layout: productionWorld.layout,
  entities: productionWorld.entities,
  groundLoot: productionWorld.groundLoot,
  bossEnt: productionWorld.bossEnt
};
const ambientHero = {
  x: 100, y: 100, hp: 100, maxHp: 100,
  state: 'idle', target: null, moveOrder: null, interactOrder: null,
  navRoute: null, manualTarget: false
};
const blockedChest = {
  id: persistentTarget.id, x: 102, y: 100, age: 0, ttl: 30
};
const availableChest = {
  id: 'chest:available', x: 116, y: 100, age: 0, ttl: 30
};
const chests = Game.environment.chests();
chests.length = 0;
chests.push(blockedChest, availableChest);
productionWorld.hero = ambientHero;
productionWorld.layout = { version: 2, nodes: [], camp: { x: 0, y: 0 } };
productionWorld.entities = [];
productionWorld.groundLoot = [];
productionWorld.bossEnt = null;
Game.state.settings.controlMode = 'auto';
Game.state.world.mode = 'battle';
Game.state.world.nodeCooldowns = {};

assert.equal(productionWorld.chooseAmbientInteraction(ambientHero), true,
  'a blocked nearest chest must not hide the next eligible chest');
assert.equal(ambientHero.interactOrder.target, availableChest);
productionWorld.cancelInteraction('test');

const availableNode = {
  id: 'node:available', x: 118, y: 100,
  material: 'wood', cooldown: 10
};
ambientHero.hp = 10;
productionWorld.groundLoot = [{
  id: persistentTarget.id, x: 101, y: 100, age: 0, ttl: 30
}];
productionWorld.layout.nodes = [availableNode];
chests.length = 0;
chests.push({ id: 'chest:not-ready', x: 108, y: 100, age: 0, ttl: 30 });
assert.equal(productionWorld.chooseAmbientInteraction(ambientHero), true,
  'blocked loot and an ineligible chest must fall through to gathering');
assert.equal(ambientHero.interactOrder.type, 'gather');
assert.equal(ambientHero.interactOrder.target, availableNode);
productionWorld.cancelInteraction('test');

assert.equal(productionWorld.startInteraction({
  type: 'chest', target: blockedChest
}, false), false, 'automatic interaction must reject a blocked target');
assert.equal(productionWorld.startInteraction({
  type: 'chest', target: blockedChest
}, true), true, 'an explicit player interaction may retry a blocked target');
productionWorld.cancelInteraction('test');

Game.state.world.worldTime += 31;
assert.equal(Game.expeditionAI.isTargetBlocked(persistentTarget.id), false,
  'temporary target block must expire');
chests.length = 0;
productionWorld.hero = ambientSnapshot.hero;
productionWorld.layout = ambientSnapshot.layout;
productionWorld.entities = ambientSnapshot.entities;
productionWorld.groundLoot = ambientSnapshot.groundLoot;
productionWorld.bossEnt = ambientSnapshot.bossEnt;
Game.expeditionAI.reset();

assert.equal(Game.autoRouteAudit.isExpectedLegacyGap({
  passed: false,
  reason: 'audit-timeout',
  interaction: { triggered: true },
  navigation: { fallbackCount: 1 },
  logs: [{ event: 'nav:fallback-observed' }]
}), false, 'an unrelated legacy failure must not count as the expected gap');

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
    assert.equal(comparison.legacy.passed, false,
      `${region.id}:${scenario} must reproduce the legacy interaction watchdog gap`);
    assert.equal(comparison.legacy.reason, 'interaction-watchdog-unarmed');
    assert.equal(comparison.legacy.watchdog.productionCoverage, 1,
      'legacy simulation must still report the real production coverage');
    assert.equal(comparison.legacy.watchdog.policyCoverage, 0,
      'legacy policy must preserve its historical interaction blind spot');
    assert.ok(comparison.legacy.logs.some((entry) =>
      entry.event === 'nav:fallback-observed'));
    assert.equal(Game.autoRouteAudit.isExpectedLegacyGap(comparison.legacy), true);
    assert.equal(comparison.reproduced, true);
    reproduced++;

    assert.equal(comparison.current.passed, true,
      `${region.id}:${scenario} production recovery must reach the lair`);
    assert.ok(comparison.current.watchdog.cacheInvalidations >= 1);
    assert.ok(comparison.current.logs.some((entry) =>
      entry.event === 'watchdog:cache-invalidated'));
    assert.ok(comparison.current.logs.some((entry) =>
      entry.event === 'route:movement-resumed'));
    recovered++;
  }
}

assert.equal(normalRuns, 32);
assert.equal(reproduced, 16);
assert.equal(recovered, 16);
console.log(
  `Auto-navigation audit passed: ${normalRuns} normal interruptions, ` +
  `${reproduced} legacy gaps reproduced, ${recovered} production recoveries.`
);
