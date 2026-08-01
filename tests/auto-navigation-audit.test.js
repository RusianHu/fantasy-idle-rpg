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
load('js/systems/terrain_v4.js');
load('js/vendor/easystar-0.4.4.min.js');
load('js/systems/nav.js');
load('js/systems/environment.js');
load('js/systems/world.js');
load('js/systems/world_treasures.js');
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

for (const locale of ['zh-CN', 'en']) {
  for (const id of [
    'idle', 'survival', 'combat', 'player-order', 'loot', 'frontier',
    'discovery', 'gather', 'guardian', 'boss', 'circuit', 'camp',
    'interaction', 'chest-approach', 'chest'
  ]) {
    assert.equal(Game.i18n.has(locale, `explore.intent.${id}`), true,
      `${locale} must translate production expedition intent ${id}`);
  }
}
assert.equal(Game.i18n.raw('zh-CN', 'explore.intent.chest-approach'), '前往宝藏');
assert.equal(Game.i18n.raw('en', 'explore.intent.chest-approach'), 'Heading to treasure');
assert.equal(Game.i18n.raw('zh-CN', 'explore.intent.chest'), '开启宝箱');
assert.equal(Game.i18n.raw('en', 'explore.intent.chest'), 'Opening chest');
assert.equal(Game.i18n.raw('zh-CN', 'explore.distanceMeters'), '{n} 米');
assert.equal(Game.i18n.raw('en', 'explore.distanceMeters'), '{n} m');

const distantChest = { id: 'treasure:intent-phase', x: 1074, y: 100 };
const chestIntentHero = {
  x: 100, y: 100, hp: 100, maxHp: 100,
  state: 'walk', target: null, moveOrder: null,
  interactOrder: { type: 'chest', target: distantChest, phase: null },
  navRoute: null, manualTarget: false
};
Game.world = {
  hero: chestIntentHero,
  layout: { version: 4, nodes: [], camp: { x: 0, y: 0 } },
  entities: [], groundLoot: [], bossEnt: null,
  controlMode: () => 'auto',
  contactThreat: () => null,
  cancelInteraction: () => false
};
Game.player = { hpPct: () => 1 };
Game.state.world.mode = 'battle';
Game.expeditionAI.reset();
Game.expeditionAI.update(chestIntentHero, 0);
assert.equal(Game.expeditionAI.intent().id, 'chest-approach',
  'a distant chest order reports travel, not an action already in progress');
assert.equal(Game.expeditionAI.intent().distance, 974);
chestIntentHero.interactOrder.phase = 'act';
Game.expeditionAI.update(chestIntentHero, 0);
assert.equal(Game.expeditionAI.intent().id, 'chest',
  'the opening intent begins only after the interaction reaches its action phase');
Game.world = productionWorld;
Game.player = originalPlayer;
Game.expeditionAI.reset();

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
  region: productionWorld.region,
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
productionWorld.region = { world: { w: 1400, h: 800 } };
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

const farChest = {
  id: 'chest:far-phase', x: 1100, y: 100, age: 0, ttl: 30,
  rare: false, phase: 0
};
chests.length = 0;
chests.push(farChest);
ambientHero.x = 100;
ambientHero.y = 100;
ambientHero.state = 'idle';
assert.equal(productionWorld.startInteraction({
  type: 'chest', target: farChest
}, false), true);
productionWorld.updateInteraction(ambientHero, 0.25);
assert.equal(ambientHero.interactOrder.phase, undefined,
  'a far chest order remains in approach phase');
assert.equal(ambientHero.state, 'walk');
assert.equal(chests.includes(farChest), true,
  'a distant chest cannot be claimed before entering interaction reach');
ambientHero.x = farChest.x - 20;
ambientHero.y = farChest.y;
productionWorld.updateInteraction(ambientHero, 0);
assert.equal(ambientHero.interactOrder.phase, 'act',
  'chest action phase begins only inside the 26px interaction reach');
assert.equal(ambientHero.state, 'opening');
productionWorld.cancelInteraction('test');

Game.state.world.worldTime += 31;
assert.equal(Game.expeditionAI.isTargetBlocked(persistentTarget.id), false,
  'temporary target block must expire');
chests.length = 0;
productionWorld.hero = ambientSnapshot.hero;
productionWorld.layout = ambientSnapshot.layout;
productionWorld.region = ambientSnapshot.region;
productionWorld.entities = ambientSnapshot.entities;
productionWorld.groundLoot = ambientSnapshot.groundLoot;
productionWorld.bossEnt = ambientSnapshot.bossEnt;
Game.expeditionAI.reset();

// === 永久宝藏决策：揭雾边界、120px 近场绕行与航段稳定 ===
// 复现截图中的缺陷：自动模式已选定未知前沿后，世界循环又从全图选中未揭雾
// 的永久宝藏并清除原探索路线。下方固化为自动化回归。
(function () {
  const savedExploration = Game.exploration;
  const savedTerrain = Game.terrain;
  const savedEnvironment = Game.environment;
  const savedGuardSites = Game.guardSites;
  const savedPlayer = Game.player;
  const savedState = Game.state;
  const savedStateNs = Game.State;
  const savedNav = Game.nav;
  const savedWorldProps = {
    hero: productionWorld.hero,
    layout: productionWorld.layout,
    entities: productionWorld.entities,
    groundLoot: productionWorld.groundLoot,
    bossEnt: productionWorld.bossEnt,
    region: productionWorld.region,
    isHostileActor: productionWorld.isHostileActor,
    contactThreat: productionWorld.contactThreat
  };

  function mountTreasureWorld(opts) {
    const rid = 'grassland';
    Game.state = {
      settings: {
        expeditionStrategy: opts.strategy || 'balanced',
        controlMode: opts.controlMode || 'auto'
      },
      world: { worldTime: 0, region: rid, mode: 'battle' },
      inv: { potions: {} }
    };
    Game.State = { regionTier: () => 1, regionProg: () => ({ firstKill: false }) };
    Game.player = { hpPct: () => 1, addGold() {} };
    const camp = { x: 100, y: 100 };
    const layout = {
      version: 4, camp,
      nodes: opts.nodes || [],
      landmarks: [], curios: [], ecology: [],
      treasureSites: opts.treasures || [],
      guardSites: [],
      bossLair: { x: 2300, y: 1300 },
      bossPoint: { x: 2300, y: 1300 },
      guardian: null
    };
    Game.terrain = {
      layout,
      dangerAt: () => 0,
      projectPoint: (x, y) => ({ x, y }),
      isWalkable: () => true
    };
    Game.exploration = {
      isRevealed: opts.isRevealed || (() => true),
      nextObjective: () => opts.frontier || null,
      regionState: () => ({
        discovered: {
          landmarks: {}, resources: {}, curios: {}, ecology: {},
          threats: {}, nests: {}, guardian: false
        },
        bossRetryAt: 0
      }),
      readiness: () => ({ lair: false, total: 0, coverage: 0 }),
      isComplete: () => false,
      coverage: () => 0
    };
    Game.environment = {
      autoNodeReady: () => true,
      nodeReady: () => true,
      nearestNode: opts.nearestNode || (() => null),
      nearestChest: opts.nearestChest || (() => null),
      chests: () => opts.environmentChests || [],
      autoChestReady: () => true
    };
    Game.nav = {
      clear() {}, recover() { return false; },
      diagnostics: { peakMs: 0, invalidated: 0 }
    };
    const guardStub = {
      forTarget: () => null,
      canInteract: () => true,
      claimedTreasure: opts.claimedTreasure || (() => false),
      autoEligible: () => true,
      peekResumeTargetId: () => null,
      consumeResumeTargetId: () => null,
      snapshot: () => [],
      isBossGateCleared: () => true,
      autoThreshold: () => 0,
      triggerRadius: () => 42
    };
    Object.assign(guardStub, opts.guardOverrides || {});
    Game.guardSites = guardStub;
    Game.worldTreasures.reset();
    Game.worldTreasures.initRegion(rid, layout);
    const hero = Object.assign({
      x: 100, y: 100, hp: 100, maxHp: 100,
      state: 'idle', target: null, moveOrder: null, interactOrder: null,
      navRoute: null, manualTarget: false
    }, opts.hero);
    productionWorld.hero = hero;
    productionWorld.layout = layout;
    productionWorld.entities = opts.entities || [];
    productionWorld.groundLoot = opts.groundLoot || [];
    productionWorld.bossEnt = null;
    productionWorld.region = { world: { w: 2400, h: 1440 } };
    productionWorld.isHostileActor = opts.isHostileActor || (() => false);
    productionWorld.contactThreat = () => null;
    Game.expeditionAI.reset();
    return { hero, layout, rid };
  }

  function restoreControlledWorld() {
    Game.exploration = savedExploration;
    Game.terrain = savedTerrain;
    Game.environment = savedEnvironment;
    Game.guardSites = savedGuardSites;
    Game.player = savedPlayer;
    Game.state = savedState;
    Game.State = savedStateNs;
    Game.nav = savedNav;
    productionWorld.hero = savedWorldProps.hero;
    productionWorld.layout = savedWorldProps.layout;
    productionWorld.entities = savedWorldProps.entities;
    productionWorld.groundLoot = savedWorldProps.groundLoot;
    productionWorld.bossEnt = savedWorldProps.bossEnt;
    productionWorld.region = savedWorldProps.region;
    productionWorld.isHostileActor = savedWorldProps.isHostileActor;
    productionWorld.contactThreat = savedWorldProps.contactThreat;
    Game.worldTreasures.reset();
    Game.expeditionAI.reset();
  }

  try {
    // 场景 A：约 1197px 未揭雾宝藏不能成为交互或导航目标。
    const farHidden = { id: 'treasure:far-hidden', x: 1297, y: 100, depth: 'mid' };
    const frontierTarget = { id: 'frontier:5:7', x: 400, y: 100 };
    const scenarioA = mountTreasureWorld({
      treasures: [farHidden],
      isRevealed: (x) => x < 500, // 前沿已揭雾，远宝藏仍在黑雾
      frontier: frontierTarget,
      hero: {
        x: 100, y: 100,
        moveOrder: {
          x: 400, y: 100, id: 'ai-frontier:5:7', ai: true,
          targetRef: frontierTarget
        }
      }
    });
    // chooseAmbientInteraction 在自动模式下不再扫描 worldTreasures，
    // 因此前沿航段保持不变，且不产生 chest 交互。
    assert.equal(productionWorld.chooseAmbientInteraction(scenarioA.hero), false,
      'auto mode must not scan worldTreasures and clear the frontier leg');
    assert.equal(scenarioA.hero.interactOrder, null,
      'no chest interaction may be started for an unrevealed treasure');
    assert.equal(scenarioA.hero.moveOrder.id, 'ai-frontier:5:7',
      'the ai-frontier move order must survive the ambient selector');
    // startInteraction 对未揭雾永久宝藏必须直接拒绝（含手动点击），
    // 且不修改 moveOrder/interactOrder/导航。
    assert.equal(productionWorld.startInteraction(
      { type: 'chest', target: Game.worldTreasures.get(farHidden.id) }, false
    ), false, 'automatic interaction must reject an unrevealed permanent treasure');
    assert.equal(productionWorld.startInteraction(
      { type: 'chest', target: Game.worldTreasures.get(farHidden.id) }, true
    ), false, 'manual interaction must also reject an unrevealed permanent treasure');
    assert.equal(scenarioA.hero.moveOrder.id, 'ai-frontier:5:7',
      'a rejected treasure must not clear the preserved move order');
    assert.equal(scenarioA.hero.interactOrder, null,
      'a rejected treasure must not establish an interaction order');
    // 远征 AI 在保留航段下也不会改道到未揭雾宝藏。
    Game.expeditionAI.update(scenarioA.hero, 0);
    assert.equal(Game.expeditionAI.intent().id, 'frontier',
      'the frontier intent must remain while the hidden treasure is out of reach');
    assert.equal(Game.expeditionAI.intent().target.id, 'frontier:5:7');
    assert.equal(scenarioA.hero.moveOrder.id, 'ai-frontier:5:7');

    // 场景 B：已揭雾且恰好 120px 的宝藏触发近场绕行；超过阈值保持当前航段。
    const nearTreasure = { id: 'treasure:near-120', x: 220, y: 100, depth: 'mid' };
    const scenarioB = mountTreasureWorld({
      treasures: [nearTreasure],
      isRevealed: () => true,
      frontier: { id: 'frontier:9:9', x: 900, y: 100 },
      hero: {
        x: 100, y: 100,
        moveOrder: {
          x: 900, y: 100, id: 'ai-frontier:9:9', ai: true,
          targetRef: { id: 'frontier:9:9', x: 900, y: 100 }
        }
      }
    });
    Game.expeditionAI.update(scenarioB.hero, 0);
    assert.equal(Game.expeditionAI.intent().id, 'chest-approach',
      'a revealed treasure at exactly 120px must trigger an opportunistic detour');
    assert.equal(Game.expeditionAI.intent().reason, 'along-route-treasure');
    assert.equal(scenarioB.hero.interactOrder.target.id, 'treasure:near-120');
    assert.equal(scenarioB.hero.moveOrder, null,
      'the detour must clear the move order so the hero approaches the chest');

    const justBeyond = { id: 'treasure:beyond-120', x: 221, y: 100, depth: 'mid' };
    const scenarioB2 = mountTreasureWorld({
      treasures: [justBeyond],
      isRevealed: () => true,
      frontier: { id: 'frontier:9:9', x: 900, y: 100 },
      hero: {
        x: 100, y: 100,
        moveOrder: {
          x: 900, y: 100, id: 'ai-frontier:9:9', ai: true,
          targetRef: { id: 'frontier:9:9', x: 900, y: 100 }
        }
      }
    });
    Game.expeditionAI.update(scenarioB2.hero, 0);
    assert.equal(Game.expeditionAI.intent().id, 'frontier',
      'a treasure beyond 120px must not preempt the preserved frontier leg');
    assert.equal(scenarioB2.hero.moveOrder.id, 'ai-frontier:9:9',
      'the frontier leg must remain intact beyond the detour threshold');
    assert.equal(scenarioB2.hero.interactOrder, null);

    // 场景 C：近场宝藏优先于成熟资源；战斗与紧急掉落仍具有更高优先级。
    const detourTreasure = { id: 'treasure:detour', x: 220, y: 100, depth: 'mid' };
    const matureNode = { id: 'node:mature', x: 210, y: 100, material: 'wood' };
    // C1：无战斗/掉落时，近场宝藏优先于成熟采集节点。
    const scenarioC1 = mountTreasureWorld({
      treasures: [detourTreasure],
      nodes: [matureNode],
      isRevealed: () => true,
      frontier: null,
      hero: { x: 100, y: 100 }
    });
    Game.expeditionAI.update(scenarioC1.hero, 0);
    assert.equal(Game.expeditionAI.intent().id, 'chest-approach',
      'a near-field treasure must take priority over a mature resource');
    assert.equal(scenarioC1.hero.interactOrder.target.id, 'treasure:detour');
    // 对照：移除宝藏后，成熟节点才会被选取。
    const scenarioC1b = mountTreasureWorld({
      treasures: [],
      nodes: [matureNode],
      isRevealed: () => true,
      frontier: null,
      hero: { x: 100, y: 100 }
    });
    Game.expeditionAI.update(scenarioC1b.hero, 0);
    assert.equal(Game.expeditionAI.intent().id, 'gather',
      'without a treasure the mature node is gathered along the route');
    assert.equal(scenarioC1b.hero.interactOrder.target.id, 'node:mature');

    // C2：沿途接敌优先于近场宝藏。
    const hostileEnt = { id: 'enemy:rge', x: 140, y: 100, hp: 100, dead: false };
    const scenarioC2 = mountTreasureWorld({
      treasures: [detourTreasure],
      isRevealed: () => true,
      frontier: null,
      entities: [hostileEnt],
      isHostileActor: (hero, ent) => ent.id === 'enemy:rge',
      hero: { x: 100, y: 100 }
    });
    Game.expeditionAI.update(scenarioC2.hero, 0);
    assert.equal(Game.expeditionAI.intent().id, 'combat',
      'a route encounter must preempt a near-field treasure');
    assert.equal(scenarioC2.hero.target, hostileEnt);
    assert.equal(scenarioC2.hero.interactOrder, null);

    // C3：紧急掉落优先于近场宝藏。
    const urgentLoot = { id: 'loot:urgent', x: 130, y: 100, ttl: 10, age: 0 };
    const scenarioC3 = mountTreasureWorld({
      treasures: [detourTreasure],
      isRevealed: () => true,
      frontier: null,
      groundLoot: [urgentLoot],
      hero: { x: 100, y: 100 }
    });
    Game.expeditionAI.update(scenarioC3.hero, 0);
    assert.equal(Game.expeditionAI.intent().id, 'loot',
      'an expiring drop must preempt a near-field treasure');
    assert.equal(scenarioC3.hero.interactOrder.target.id, 'loot:urgent');

    // 场景 D：当前航段结束后，远处已知宝藏仍可按既有策略被选择。
    const distantKnown = { id: 'treasure:distant-known', x: 1297, y: 100, depth: 'deep' };
    const scenarioD = mountTreasureWorld({
      treasures: [distantKnown],
      isRevealed: () => true,
      frontier: null,
      hero: { x: 100, y: 100, moveOrder: null }
    });
    Game.expeditionAI.update(scenarioD.hero, 0);
    assert.equal(Game.expeditionAI.intent().id, 'chest-approach',
      'a revealed distant treasure remains selectable once no leg is preserved');
    assert.equal(Game.expeditionAI.intent().reason, 'nest');
    assert.equal(scenarioD.hero.interactOrder.target.id, 'treasure:distant-known');

    // 场景 E：临时宝箱、手动点击与目标屏蔽不回归。
    // E1：临时宝箱（非永久宝藏）不受新增揭雾校验影响。
    const scenarioE1 = mountTreasureWorld({
      treasures: [],
      isRevealed: () => false,
      hero: { x: 100, y: 100 }
    });
    const timedChest = { id: 'chest:timed', x: 120, y: 100, age: 0, ttl: 30 };
    assert.equal(productionWorld.startInteraction(
      { type: 'chest', target: timedChest }, false
    ), true, 'a timed chest is not subject to the permanent-treasure reveal check');
    assert.equal(scenarioE1.hero.interactOrder.target.id, 'chest:timed');
    productionWorld.cancelInteraction('test');
    // E2：自动模式下 chooseAmbientInteraction 仍会拾取临时宝箱。
    const scenarioE2 = mountTreasureWorld({
      treasures: [],
      isRevealed: () => true,
      nearestChest: () => ({ target: timedChest, distance: 20 }),
      hero: { x: 100, y: 100 }
    });
    assert.equal(productionWorld.chooseAmbientInteraction(scenarioE2.hero), true,
      'auto mode must still pick up a ready timed chest');
    assert.equal(scenarioE2.hero.interactOrder.target.id, 'chest:timed');
    productionWorld.cancelInteraction('test');
    // E3：手动点击已揭雾永久宝藏成功，未揭雾则被拒绝（与场景 A 一致）。
    const revealedManual = { id: 'treasure:manual', x: 150, y: 100, depth: 'mid' };
    const scenarioE3 = mountTreasureWorld({
      treasures: [revealedManual],
      isRevealed: () => true,
      hero: { x: 100, y: 100 }
    });
    assert.equal(productionWorld.startInteraction(
      { type: 'chest', target: Game.worldTreasures.get(revealedManual.id) }, true
    ), true, 'a manual click on a revealed permanent treasure must succeed');
    productionWorld.cancelInteraction('test');
    // E4：被临时屏蔽的永久宝藏不会被近场绕行选中。
    const blockedTreasure = { id: 'treasure:blocked', x: 220, y: 100, depth: 'mid' };
    const scenarioE4 = mountTreasureWorld({
      treasures: [blockedTreasure],
      isRevealed: () => true,
      frontier: { id: 'frontier:1:1', x: 600, y: 100 },
      hero: { x: 100, y: 100 }
    });
    // 挂载后再绑定交互目标，确保引用的是已初始化的永久宝藏实例。
    scenarioE4.hero.interactOrder = {
      type: 'chest',
      target: Game.worldTreasures.get(blockedTreasure.id),
      phase: null
    };
    // 让英雄在宝藏接近阶段静止 6 秒以上，触发 watchdog 取消并屏蔽目标。
    for (let tick = 0; tick < 16; tick++) {
      Game.state.world.worldTime += 0.5;
      Game.expeditionAI.update(scenarioE4.hero, 0.5);
    }
    assert.equal(Game.expeditionAI.isTargetBlocked(blockedTreasure.id), true,
      'a stuck treasure approach must temporarily block the target');
    assert.notEqual(Game.expeditionAI.intent().id, 'chest-approach',
      'a blocked treasure must not be reselected as a chest detour');
    assert.equal(scenarioE4.hero.interactOrder, null,
      'the stuck interaction must have been cancelled');

    // 场景 F：守卫胜利后恢复开箱；目标失效时不产生循环重试。
    // F1：守卫清除后 peekResumeTargetId 指向宝藏，远征 AI 恢复开箱接近。
    const resumeTreasure = { id: 'treasure:resume', x: 220, y: 100, depth: 'mid' };
    let resumeId = resumeTreasure.id;
    const scenarioF1 = mountTreasureWorld({
      treasures: [resumeTreasure],
      isRevealed: () => true,
      frontier: null,
      guardOverrides: {
        peekResumeTargetId: () => resumeId,
        consumeResumeTargetId: () => { const old = resumeId; resumeId = null; return old; }
      },
      hero: { x: 100, y: 100 }
    });
    Game.expeditionAI.update(scenarioF1.hero, 0);
    assert.equal(Game.expeditionAI.intent().id, 'chest-approach',
      'after a guard victory the AI must resume opening the treasure');
    assert.equal(Game.expeditionAI.intent().reason, 'guard-resume');
    assert.equal(scenarioF1.hero.interactOrder.target.id, 'treasure:resume');
    assert.equal(resumeId, null, 'the resume target must be consumed once resumed');

    // F2：恢复目标已失效（被领取）时，消费目标并回落，不循环重试。
    const claimedTreasure = { id: 'treasure:claimed', x: 220, y: 100, depth: 'mid' };
    let resumeIdF2 = claimedTreasure.id;
    const scenarioF2 = mountTreasureWorld({
      treasures: [claimedTreasure],
      isRevealed: () => true,
      frontier: null,
      claimedTreasure: (id) => id === claimedTreasure.id,
      guardOverrides: {
        peekResumeTargetId: () => resumeIdF2,
        consumeResumeTargetId: () => { const old = resumeIdF2; resumeIdF2 = null; return old; }
      },
      hero: { x: 100, y: 100 }
    });
    assert.equal(Game.worldTreasures.get(claimedTreasure.id).claimed, true,
      'the resume target must be reported as claimed');
    Game.expeditionAI.update(scenarioF2.hero, 0);
    assert.equal(resumeIdF2, null,
      'an invalid resume target must be consumed to prevent retry loops');
    assert.notEqual(Game.expeditionAI.intent().id, 'chest-approach',
      'an invalid resume target must not start a chest interaction');
    assert.equal(scenarioF2.hero.interactOrder, null);

    restoreControlledWorld();
  } catch (err) {
    restoreControlledWorld();
    throw err;
  }
})();

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

// 永久宝藏决策审计：隐藏 / 近场 / 远场三种场景在确定性 v4 区域上必须与修复后语义一致。
const treasureCaseIds = Object.keys(Game.autoRouteAudit.treasureCases);
let treasureAudits = 0;
for (const region of Game.reg.all('region')) {
  Game.state.world.region = region.id;
  const layout = Game.terrain.generate(region, 8, 4);
  const summary = Game.autoRouteAudit.runTreasureAudit(layout);
  assert.equal(summary.total, treasureCaseIds.length,
    `${region.id} treasure audit must cover all cases`);
  assert.equal(summary.passed, treasureCaseIds.length,
    `${region.id} treasure audit must pass all cases (got ${summary.results.map((r) => r.caseId + '=' + r.decision).join(', ')})`);
  treasureAudits += summary.passed;
}
assert.equal(treasureAudits, treasureCaseIds.length * 8,
  'all regions must pass every permanent-treasure decision case');
// 逐场景固化截图缺陷：未揭雾宝藏不得改道、近场宝藏触发绕行、远场宝藏保留航段。
const probeRegion = Game.reg.get('region', 'grassland');
const probeLayout = Game.terrain.generate(probeRegion, 0xA17B00, 4);
assert.equal(Game.autoRouteAudit.treasureDecisionAudit(probeLayout, 'treasure-hidden').decision, 'frontier',
  'an unrevealed permanent treasure must not divert the frontier leg');
assert.equal(Game.autoRouteAudit.treasureDecisionAudit(probeLayout, 'treasure-near').decision, 'chest-approach',
  'a revealed permanent treasure at 120px must trigger an opportunistic detour');
assert.equal(Game.autoRouteAudit.treasureDecisionAudit(probeLayout, 'treasure-near').reason, 'along-route-treasure');
assert.equal(Game.autoRouteAudit.treasureDecisionAudit(probeLayout, 'treasure-far').decision, 'frontier',
  'a revealed but distant permanent treasure must not preempt the preserved leg');

console.log(
  `Auto-navigation audit passed: ${normalRuns} normal interruptions, ` +
  `${reproduced} legacy gaps reproduced, ${recovered} production recoveries, ` +
  `${treasureAudits} permanent-treasure decision cases.`
);
