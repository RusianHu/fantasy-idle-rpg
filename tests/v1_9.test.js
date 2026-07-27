'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'js/systems/transitions.js'), 'utf8');

function makeHarness(options = {}) {
  const events = [];
  const listeners = new Map();
  const regions = {
    r1: { id: 'r1', world: { w: 900, h: 520 } },
    r2: { id: 'r2', world: { w: 900, h: 520 } },
    r3: { id: 'r3', world: { w: 900, h: 520 } }
  };
  let gotoCount = 0;
  const heroAt = () => ({
    kind: 'hero',
    x: 300,
    y: 210,
    maxHp: 120,
    state: 'idle',
    target: null,
    manualTarget: false,
    moveOrder: null,
    moving: false,
    campWarp: null,
    buffs: [],
    shield: 0
  });
  const Game = {
    util: {
      clamp(v, min, max) { return v < min ? min : (v > max ? max : v); },
      lerp(a, b, t) { return a + (b - a) * t; }
    },
    bus: {
      emit(name, payload) {
        events.push({ name, payload });
        for (const fn of listeners.get(name) || []) fn(payload);
      },
      on(name, fn) {
        const set = listeners.get(name) || [];
        set.push(fn);
        listeners.set(name, set);
      }
    },
    state: {
      settings: {
        effects: options.effects !== false,
        autoAdvance: true,
        controlMode: options.controlMode || 'auto'
      },
      player: { hp: options.hp === undefined ? 120 : options.hp },
      world: { region: options.region || 'r1', mode: options.mode || 'battle' },
      meta: { stats: { highestRegion: options.highestRegion || 1 } }
    },
    State: {
      regionTier(rid) { return { r1: 1, r2: 2, r3: 3 }[rid]; }
    },
    reg: {
      has(type, rid) { return type === 'region' && !!regions[rid]; }
    },
    world: {
      hero: heroAt(),
      region: regions[options.region || 'r1'],
      BOUND_TOP: 80,
      controlMode() { return Game.state.settings.controlMode; },
      campRestPoint() { return { x: 140, y: 260 }; }
    },
    terrain: { campfirePos: { x: 126, y: 252 } },
    prog: {
      isUnlocked() { return true; },
      gotoRegion(rid) {
        gotoCount++;
        Game.state.world.region = rid;
        Game.world.region = regions[rid];
        Game.world.hero = heroAt();
        Game.bus.emit('region:changed', { rid });
      }
    },
    player: { derived() { return { maxHp: 120 }; } },
    nav: { clear() {} },
    render: { snapCamera() {} },
    fx: {
      teleport() {},
      travelBurst() {},
      soulReturn() {},
      revivePulse() {},
      flashScreen() {},
      shake() {}
    },
    ui: {
      transitions: { show() {}, render() {}, hide() {} },
      modals: {
        clearToasts() {},
        clearDeferredToasts() {},
        flushDeferredToasts() {}
      }
    },
    ending: {
      isPending() { return !!options.endingPending; }
    }
  };
  const document = { addEventListener() {} };
  const context = vm.createContext({
    window: {
      Game,
      matchMedia() { return { matches: !!options.reducedMotion }; }
    },
    document,
    console
  });
  vm.runInContext(SOURCE, context, { filename: 'js/systems/transitions.js' });
  Game.transitions.init();
  return {
    Game,
    events,
    gotoCount: () => gotoCount,
    count(name) { return events.filter((event) => event.name === name).length; }
  };
}

{
  const h = makeHarness();
  const { Game } = h;
  assert.equal(Game.transitions.startRegion('r2', { source: 'auto' }), true);
  assert.equal(Game.transitions.startRegion('r2', { source: 'auto' }), false, 'duplicate travel is rejected');
  Game.transitions.update(2.9);
  assert.equal(Game.state.world.region, 'r1');
  assert.equal(Game.transitions.snapshot().phase, 'countdown');
  assert.equal(Game.transitions.cancel('test'), true);
  assert.equal(Game.state.settings.autoAdvance, true, 'cancel affects this trip only');
  assert.equal(Game.state.world.region, 'r1');
  assert.equal(h.count('region:travelCancelled'), 1);

  assert.equal(Game.transitions.startRegion('r2', { source: 'auto' }), true);
  Game.transitions.update(30);
  assert.equal(Game.transitions.isActive(), false);
  assert.equal(Game.state.world.region, 'r2');
  assert.equal(Game.state.world.mode, 'battle');
  assert.equal(h.gotoCount(), 1, 'large dt commits the atomic region swap once');
  assert.equal(h.count('region:changed'), 1);
  assert.equal(h.count('region:arrived'), 1);
}

{
  const h = makeHarness({ controlMode: 'manual' });
  assert.equal(h.Game.transitions.startRegion('r2', { source: 'auto' }), true);
  h.Game.transitions.departNow();
  h.Game.transitions.update(10);
  assert.equal(h.Game.state.world.mode, 'rest', 'manual control arrives at camp');
  assert.equal(h.Game.world.hero.state, 'goCamp');
}

{
  const first = makeHarness({ highestRegion: 1, mode: 'battle' });
  first.Game.transitions.startRegion('r2', { source: 'map' });
  assert.equal(first.Game.transitions.snapshot().phase, 'depart', 'manual map travel skips countdown');
  first.Game.transitions.update(10);
  assert.equal(first.Game.state.world.mode, 'rest', 'first map entry waits at camp');

  const revisitBattle = makeHarness({ highestRegion: 3, mode: 'battle' });
  revisitBattle.Game.transitions.startRegion('r2', { source: 'map' });
  revisitBattle.Game.transitions.update(10);
  assert.equal(revisitBattle.Game.state.world.mode, 'battle', 'battle state survives a revisit');

  const revisitRest = makeHarness({ highestRegion: 3, mode: 'rest' });
  revisitRest.Game.transitions.startRegion('r2', { source: 'map' });
  revisitRest.Game.transitions.update(10);
  assert.equal(revisitRest.Game.state.world.mode, 'rest', 'rest state survives a revisit');
}

{
  const auto = makeHarness({ hp: 0 });
  assert.equal(auto.Game.transitions.startDeath(), true);
  assert.equal(auto.Game.transitions.startDeath(), false, 'duplicate revive is rejected');
  auto.Game.transitions.update(2);
  assert.equal(auto.Game.transitions.snapshot().phase, 'recover');
  assert.ok(auto.Game.state.player.hp > 0 && auto.Game.state.player.hp < 120);
  assert.equal(auto.Game.state.world.mode, 'rest');
  auto.Game.transitions.update(20);
  assert.equal(auto.Game.transitions.isActive(), false);
  assert.equal(auto.Game.state.player.hp, 120);
  assert.equal(auto.Game.state.world.mode, 'battle', 'auto control resumes combat');
  assert.equal(auto.count('player:reviveStart'), 1);
  assert.equal(auto.count('player:revived'), 1);

  const manual = makeHarness({ hp: 0, controlMode: 'manual' });
  manual.Game.transitions.startDeath();
  manual.Game.transitions.update(20);
  assert.equal(manual.Game.state.world.mode, 'rest');
  assert.equal(manual.Game.world.hero.state, 'sitting', 'manual control remains seated');
}

{
  const fallback = makeHarness({ hp: 0, region: 'r3', highestRegion: 3 });
  fallback.Game.transitions.startDeath({ fallbackRid: 'r2' });
  fallback.Game.transitions.update(2);
  assert.equal(fallback.Game.state.world.region, 'r2', 'third normal death lands in the previous region');
  assert.equal(fallback.gotoCount(), 1);
  fallback.Game.transitions.update(20);
  assert.equal(fallback.gotoCount(), 1);
  assert.equal(fallback.count('prog:fellback'), 1);

  const firstRegion = makeHarness({ hp: 0, region: 'r1' });
  firstRegion.Game.transitions.startDeath({ fallbackRid: null });
  firstRegion.Game.transitions.update(20);
  assert.equal(firstRegion.Game.state.world.region, 'r1', 'first region has no invalid fallback');
  assert.equal(firstRegion.gotoCount(), 0);
}

{
  const finalLoss = makeHarness({ hp: 0, region: 'r3', highestRegion: 3 });
  finalLoss.Game.transitions.startDeath({
    byBoss: true,
    fallbackRid: 'r2',
    finalRegionLost: true
  });
  assert.equal(finalLoss.Game.transitions.snapshot().finalRegionLost, true);
  finalLoss.Game.transitions.update(20);
  const revived = finalLoss.events.find((event) => event.name === 'player:revived');
  const fallback = finalLoss.events.find((event) => event.name === 'prog:fellback');
  assert.equal(revived.payload.finalRegionLost, true);
  assert.equal(revived.payload.rid, 'r2');
  assert.equal(fallback.payload.finalRegionLost, true);
  assert.equal(fallback.payload.fromRid, 'r3');
}

{
  const settled = makeHarness();
  settled.Game.transitions.startRegion('r2', { source: 'map' });
  assert.equal(settled.Game.transitions.settleBeforeSave(), true);
  assert.equal(settled.Game.state.world.region, 'r2');
  assert.equal(settled.Game.transitions.isActive(), false);
  settled.Game.transitions.update(30);
  assert.equal(settled.gotoCount(), 1, 'settled travel cannot commit twice');

  const zeroHpEnding = makeHarness({ hp: 0, endingPending: true });
  assert.equal(zeroHpEnding.Game.transitions.restoreZeroHp(), false, 'pending ending takes priority over legacy zero-hp recovery');

  const zeroHpSave = makeHarness({ hp: 0 });
  assert.equal(zeroHpSave.Game.transitions.restoreZeroHp(), true);
  assert.equal(zeroHpSave.Game.transitions.snapshot().phase, 'land');
  zeroHpSave.Game.transitions.update(20);
  assert.equal(zeroHpSave.Game.state.player.hp, 120);

  const reduced = makeHarness({ hp: 0, effects: false });
  reduced.Game.transitions.startDeath();
  assert.equal(reduced.Game.transitions.snapshot().reduced, true);
  assert.equal(reduced.Game.transitions.entityStyle(reduced.Game.world.hero).ghosts, 0);
  reduced.Game.transitions.update(6.7);
  assert.equal(reduced.Game.transitions.isActive(), true, 'reduced visuals preserve gameplay duration');
  reduced.Game.transitions.update(0.2);
  assert.equal(reduced.Game.transitions.isActive(), false);

  const prefersReduced = makeHarness({ reducedMotion: true });
  prefersReduced.Game.transitions.startRegion('r2', { source: 'auto' });
  assert.equal(prefersReduced.Game.transitions.snapshot().reduced, true);
}

console.log('v1.9 transition tests passed: travel, cancellation, arrival policy, revive, fallback, reduced motion and safe settlement.');
