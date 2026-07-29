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
Game.assets = {
  sprite() { return { w: 20, h: 24, frames: {} }; }
};
load('js/systems/terrain.js');
load('js/systems/terrain_v3.js');
load('js/vendor/easystar-0.4.4.min.js');
load('js/systems/nav.js');

Game.state = {
  settings: { expeditionStrategy: 'balanced' },
  world: { layoutVersion: 3 }
};

function directMove(ent, tx, ty, speed, dt) {
  const dx = tx - ent.x;
  const dy = ty - ent.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.5) return 0;
  const step = Math.min(distance, speed * Math.min(dt, 0.25));
  const swept = Game.terrain.sweepMove(
    ent.x,
    ent.y,
    dx / distance * step,
    dy / distance * step,
    7
  );
  ent.x = swept.x;
  ent.y = swept.y;
  return distance - swept.moved;
}

function simulate(layout, from, to, token, maxSeconds = 180) {
  const ent = { x: from.x, y: from.y, navRoute: null, moving: false, dir: 'd' };
  const signatures = new Set();
  let greatestDistance = Game.util.dist(ent.x, ent.y, to.x, to.y);
  const ticks = Math.ceil(maxSeconds / 0.05);
  for (let tick = 0; tick < ticks; tick++) {
    Game.nav.update(2);
    const remaining = Game.nav.step(ent, to.x, to.y, 56, 0.05, token, directMove);
    if (ent.navRoute && ent.navRoute.macroIds) {
      signatures.add(ent.navRoute.macroIds.join('>'));
    }
    greatestDistance = Math.max(greatestDistance, remaining);
    if (remaining < 5) {
      return {
        reached: true,
        seconds: tick * 0.05,
        ent,
        signatures,
        greatestDistance
      };
    }
  }
  return {
    reached: false,
    seconds: maxSeconds,
    ent,
    signatures,
    greatestDistance,
    remaining: Game.util.dist(ent.x, ent.y, to.x, to.y)
  };
}

/* This seed used to alternate every 0.6s between macro areas 0 and 4. */
const regressionLayout = Game.terrain.build(Game.reg.get('region', 'grassland'), 8, 3);
const regression = simulate(
  regressionLayout,
  regressionLayout.camp,
  regressionLayout.bossPoint,
  'boss-lair:grassland'
);
assert.equal(regression.reached, true, `seed 8 failed at ${regression.remaining}`);
assert.ok(regression.seconds < 70, `seed 8 route took ${regression.seconds.toFixed(1)}s`);
assert.equal(regression.signatures.size, 1, 'a long command keeps one macro itinerary');
assert.ok(regression.ent.navRoute.macroIds.length >= 3, 'seed 8 uses multiple interruptible legs');
assert.equal(regression.ent.navRoute.recoveries, 0, 'stable route should not need collision recovery');

/* A queued path is consumed on the next budget pass, not after a 0.6s idle gap. */
Game.terrain.build(Game.reg.get('region', 'grassland'), 8, 3);
const pendingHero = {
  x: regressionLayout.camp.x,
  y: regressionLayout.camp.y,
  navRoute: null
};
Game.nav.step(
  pendingHero,
  regressionLayout.bossPoint.x,
  regressionLayout.bossPoint.y,
  56,
  0.05,
  'pending',
  directMove
);
assert.equal(pendingHero.navRoute.pending, true);
Game.nav.update(2);
Game.nav.step(
  pendingHero,
  regressionLayout.bossPoint.x,
  regressionLayout.bossPoint.y,
  56,
  0.05,
  'pending',
  directMove
);
assert.equal(pendingHero.navRoute.pending, false);
assert.ok(Game.util.dist(pendingHero.x, pendingHero.y, regressionLayout.camp.x, regressionLayout.camp.y) > 0);

/* A new token replaces the whole itinerary immediately. */
const originalRoute = pendingHero.navRoute;
const interruptTarget = regressionLayout.macro.centers[2];
Game.nav.step(
  pendingHero,
  interruptTarget.x,
  interruptTarget.y,
  56,
  0.05,
  'player-interrupt',
  directMove
);
assert.notEqual(pendingHero.navRoute, originalRoute);
assert.equal(pendingHero.navRoute.token, 'player-interrupt');
assert.ok(
  Game.util.dist(
    pendingHero.navRoute.targetX,
    pendingHero.navRoute.targetY,
    interruptTarget.x,
    interruptTarget.y
  ) < 0.01
);

/* Long commands in both directions across every region must terminate. */
const seeds = [
  8, 12, 25, 26, 29, 37, 51, 61, 88, 99, 101, 108,
  116, 123, 129, 141, 150, 152, 163, 174, 181, 191,
  20260729, 0x12345678
];
let journeys = 0;
let slowest = 0;
for (const region of Game.reg.all('region')) {
  for (const seed of seeds) {
    const layout = Game.terrain.build(region, seed, 3);
    const outward = simulate(layout, layout.camp, layout.bossPoint, 'out:' + region.id);
    assert.equal(
      outward.reached,
      true,
      `${region.id}:${seed} camp→lair stalled at ${outward.remaining}`
    );
    slowest = Math.max(slowest, outward.seconds);
    journeys++;

    Game.nav.useLayout(layout);
    Game.terrain.layout = layout;
    const homeward = simulate(layout, layout.bossPoint, layout.camp, 'back:' + region.id);
    assert.equal(
      homeward.reached,
      true,
      `${region.id}:${seed} lair→camp stalled at ${homeward.remaining}`
    );
    slowest = Math.max(slowest, homeward.seconds);
    journeys++;
  }
}

console.log(
  `Long-route navigation passed: ${journeys} journeys, ` +
  `seed 8 regression ${regression.seconds.toFixed(1)}s, slowest ${slowest.toFixed(1)}s.`
);
