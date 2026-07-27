'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function eventBus(events) {
  const listeners = new Map();
  return {
    on(name, fn) {
      const list = listeners.get(name) || [];
      list.push(fn);
      listeners.set(name, list);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of (listeners.get(name) || []).slice()) fn(payload);
    }
  };
}

/* ------------------------------------------------------------------ *
 * 区域准入：失守锁独立于 cleared/firstKill，重打上一地区 Boss 解锁。
 * ------------------------------------------------------------------ */
{
  const events = [];
  const order = ['grassland', 'skyruins', 'darkcastle'];
  const progress = {
    grassland: { kills: 0, cleared: true, firstKill: true },
    skyruins: { kills: 0, cleared: true, firstKill: true },
    darkcastle: { kills: 4, cleared: true, firstKill: true }
  };
  const Game = {
    bus: eventBus(events),
    state: {
      settings: { autoAdvance: false },
      world: { region: 'darkcastle', deathsRow: 2, finalRegionLocked: false },
      meta: { stats: { highestRegion: 3 } }
    },
    State: {
      regionOrder: () => order.slice(),
      regionIndex: (rid) => order.indexOf(rid),
      regionTier: (rid) => order.indexOf(rid) + 1,
      regionProg: (rid) => progress[rid]
    },
    reg: { has: (type, rid) => type === 'region' && order.includes(rid) },
    world: { region: { id: 'darkcastle' }, init() {} },
    transitions: { isActive: () => false, startRegion: () => true }
  };
  const context = vm.createContext({ window: { Game }, console });
  vm.runInContext(read('js/systems/progression.js'), context, {
    filename: 'js/systems/progression.js'
  });
  Game.prog.init();

  assert.equal(Game.prog.isUnlocked('darkcastle'), true);
  const fallbackRid = Game.prog.lockFinalRegion('darkcastle', { byBoss: true });
  assert.equal(fallbackRid, 'skyruins');
  assert.equal(Game.state.world.finalRegionLocked, true);
  assert.equal(Game.state.world.deathsRow, 0);
  assert.equal(Game.prog.isUnlocked('darkcastle'), false);
  assert.equal(Game.prog.gotoRegion('darkcastle'), false, 'locked final region rejects direct travel');
  assert.deepEqual(
    progress.darkcastle,
    { kills: 4, cleared: true, firstKill: true },
    'losing the final region preserves clear and first-kill records'
  );
  assert.equal(
    events.filter((event) => event.name === 'region:relocked').length,
    1,
    'the loss event is emitted once'
  );
  Game.prog.lockFinalRegion('darkcastle', { byBoss: false });
  assert.equal(
    events.filter((event) => event.name === 'region:relocked').length,
    1,
    'repeated lock calls stay idempotent'
  );
  assert.equal(Game.prog.lockFinalRegion('skyruins'), null, 'non-final maps cannot be relocked');

  Game.bus.emit('boss:defeated', {
    rid: 'skyruins', mid: 'ancient_golem', first: false, tier: 2
  });
  assert.equal(Game.state.world.finalRegionLocked, false);
  assert.equal(Game.prog.isUnlocked('darkcastle'), true);
  const reopened = events.find((event) =>
    event.name === 'region:unlocked' && event.payload.rid === 'darkcastle'
  );
  assert.equal(reopened.payload.reopened, true);
  assert.equal(progress.skyruins.firstKill, true, 'reopening does not alter first-kill history');
}

/* ------------------------------------------------------------------ *
 * 战败入口：普通死亡与 Boss 失败都会失守；主动撤离不会。
 * ------------------------------------------------------------------ */
function makeWorldHarness(options = {}) {
  const events = [];
  let deathOptions = null;
  let lockCalls = 0;
  const progress = {
    kills: options.kills || 0,
    cleared: !!options.cleared,
    firstKill: !!options.firstKill
  };
  const Game = {
    util: {
      dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
      clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    },
    F: { BAL: {} },
    bus: eventBus(events),
    reg: { get() { return null; } },
    state: {
      settings: { controlMode: 'auto' },
      player: { hp: 0 },
      world: {
        region: 'darkcastle',
        mode: 'battle',
        deathsRow: 0,
        finalRegionLocked: false,
        worldTime: 100
      },
      meta: { stats: { deaths: 0 } }
    },
    State: { regionProg: () => progress },
    prog: {
      isFinalRegion: (rid) => rid === 'darkcastle',
      lockFinalRegion(rid) {
        lockCalls++;
        Game.state.world.finalRegionLocked = true;
        Game.state.world.deathsRow = 0;
        return rid === 'darkcastle' ? 'skyruins' : null;
      },
      prevRegion: () => 'skyruins'
    },
    transitions: {
      isActive: () => false,
      startDeath(opts) {
        deathOptions = opts;
        return true;
      }
    },
    nav: { clear() {} },
    inv: { commitDrop() {} },
    fx: null,
    environment: null,
    trade: null,
    ui: null
  };
  const context = vm.createContext({
    window: { Game, addEventListener() {} },
    document: { addEventListener() {} },
    console,
    Math
  });
  vm.runInContext(read('js/systems/world.js'), context, {
    filename: 'js/systems/world.js'
  });
  const hero = {
    kind: 'hero',
    x: 300,
    y: 220,
    state: 'idle',
    target: null,
    manualTarget: false,
    moveOrder: null,
    interactOrder: null,
    campWarp: null,
    shield: 0,
    buffs: []
  };
  Game.world.region = {
    id: 'darkcastle',
    killTarget: 10,
    world: { w: 900, h: 520 }
  };
  Game.world.layout = { camp: { x: 100, y: 240 } };
  Game.world.hero = hero;
  Game.world.entities = [hero];
  Game.world.groundLoot = [];
  return {
    Game,
    progress,
    events,
    deathOptions: () => deathOptions,
    lockCalls: () => lockCalls
  };
}

{
  const normal = makeWorldHarness({ kills: 4 });
  normal.Game.world.onHeroDeath();
  assert.equal(normal.lockCalls(), 1);
  assert.equal(normal.deathOptions().byBoss, false);
  assert.equal(normal.deathOptions().fallbackRid, 'skyruins');
  assert.equal(normal.deathOptions().finalRegionLost, true);
  assert.equal(normal.Game.state.world.finalRegionLocked, true);
  assert.equal(normal.Game.state.meta.stats.deaths, 1);
  assert.equal(normal.progress.kills, 4, 'normal defeat preserves the current hunt gauge');
}

{
  const boss = makeWorldHarness({ kills: 10 });
  const bossEntity = { kind: 'monster', boss: true, mid: 'demon_lord' };
  boss.Game.world.bossEnt = bossEntity;
  boss.Game.world.entities.push(bossEntity);
  boss.Game.world.onHeroDeath();
  assert.equal(boss.lockCalls(), 1);
  assert.equal(boss.deathOptions().byBoss, true);
  assert.equal(boss.deathOptions().fallbackRid, 'skyruins');
  assert.equal(boss.deathOptions().finalRegionLost, true);
  assert.equal(boss.progress.kills, 5, 'final boss failure retains half the hunt gauge');
  assert.equal(boss.Game.world.bossEnt, null);
  assert.ok(boss.events.some((event) =>
    event.name === 'boss:failed' && event.payload.reason === 'defeat'
  ));
}

{
  const retreat = makeWorldHarness({ kills: 10 });
  retreat.Game.state.player.hp = 100;
  const bossEntity = { kind: 'monster', boss: true, mid: 'demon_lord' };
  retreat.Game.world.bossEnt = bossEntity;
  retreat.Game.world.entities.push(bossEntity);
  assert.equal(retreat.Game.world.setMode('rest'), true);
  assert.equal(retreat.lockCalls(), 0, 'voluntary camp retreat is not a defeat');
  assert.equal(retreat.Game.state.world.finalRegionLocked, false);
  assert.equal(retreat.Game.state.world.region, 'darkcastle');
  assert.ok(retreat.events.some((event) =>
    event.name === 'boss:failed' && event.payload.reason === 'retreat'
  ));
}

console.log(
  'Final-region lock tests passed: defeat fallback, persistent relock, boss retry unlock, ' +
  'first-kill preservation and voluntary-retreat exclusion.'
);
