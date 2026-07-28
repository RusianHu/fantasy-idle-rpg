'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
global.window = global;

function load(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInThisContext(source, { filename: file });
}

load('js/core/utils.js');
load('js/core/eventbus.js');
load('js/core/registry.js');
Game.assets = {
  sprite(id) {
    const large = /oak|tree|pine|pillar|rocks_big|crystal_big|obsidian|beam|banner|spikes/.test(id);
    return { w: large ? 20 : 10, h: large ? 24 : 10, frames: /tree|oak|pine/.test(id) ? { idle1: true } : {} };
  }
};
load('js/data/regions.js');
load('js/data/routes.js');
load('js/systems/routes.js');
load('js/systems/terrain.js');
load('js/systems/terrain_v3.js');
load('js/vendor/easystar-0.4.4.min.js');
load('js/systems/nav.js');

function propCounts(props) {
  const counts = Object.create(null);
  for (const prop of props) counts[prop.sprite] = (counts[prop.sprite] || 0) + 1;
  return counts;
}

function assertFinitePoint(point, label) {
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), label + ' must be finite');
}

function scaledCount(count, density) {
  return count ? Math.max(1, Math.round(count * density)) : 0;
}

function expectedDecorCount(region, def, version) {
  if (version === 1) return def.count;
  const density = def.water ? region.layout.waterDecorDensity : region.layout.decorDensity;
  return scaledCount(def.count, density);
}

function assertLayout(region, seed, layout, version) {
  const cfg = region.layout;
  const campPropCount = version >= 2 ? 8 : 2;
  const expectedProps = region.terrain.deco.reduce((sum, def) => sum + expectedDecorCount(region, def, version), 0) + campPropCount;
  const expectedPatches = region.terrain.patches.reduce((sum, def) => {
    return sum + scaledCount(def.count, version === 1 ? 1 : cfg.patchDensity);
  }, 0);
  const expectedTufts = scaledCount(region.terrain.tufts || 0, version === 1 ? 1 : cfg.detailDensity);
  const expectedFlowers = scaledCount(region.terrain.flowers ? region.terrain.flowers.count : 0, version === 1 ? 1 : cfg.detailDensity);

  assert.equal(layout.world.w, 900);
  assert.equal(layout.world.h, 520);
  assert.equal(layout.worldSeed, seed >>> 0);
  assert.equal(layout.version, version);
  assert.equal(layout.grid.length, layout.gw * layout.gh);
  assert.equal(layout.patches.length, expectedPatches);
  assert.equal(layout.props.length, expectedProps);
  assert.equal(layout.tufts.length, expectedTufts);
  assert.equal(layout.flowers.length, expectedFlowers);
  assert.ok(layout.spawnCandidates.length > 0, region.id + ' needs spawn candidates');
  assert.ok(layout.corridorCandidates.length > 0, region.id + ' needs corridor fallback candidates');

  assertFinitePoint(layout.camp, region.id + ' camp');
  assertFinitePoint(layout.bossPoint, region.id + ' boss');
  assert.ok(layout.camp.x >= 900 * cfg.campZone.x[0] && layout.camp.x <= 900 * cfg.campZone.x[1]);
  assert.ok(layout.bossPoint.x >= 900 * cfg.bossZone.x[0] && layout.bossPoint.x <= 900 * cfg.bossZone.x[1]);
  assert.ok(layout.corridor.points.length === 4 || layout.corridor.points.length === 5);
  assert.ok(layout.corridor.width >= 40 && layout.corridor.width <= 64);

  const counts = propCounts(layout.props);
  for (const def of region.terrain.deco) {
    assert.equal(counts[def.sprite], expectedDecorCount(region, def, version), region.id + ':' + def.sprite);
  }
  assert.equal(counts.tent, 1);
  assert.equal(counts.campfire, 1);
  if (version === 2) {
    const baseProps = region.terrain.deco.reduce((sum, def) => sum + def.count, 0) + 2;
    const basePatches = region.terrain.patches.reduce((sum, def) => sum + def.count, 0);
    assert.ok(layout.props.length >= baseProps * 2.8, region.id + ' v2 decor density');
    assert.ok(layout.patches.length > basePatches, region.id + ' v2 patch density');
    assert.ok(layout.density.decor >= 3.4 && layout.density.details >= 2);
  }

  const randomProps = layout.props.filter((prop) => !prop.campProp && prop.sprite !== 'tent' && !prop.campfire);
  for (let i = 0; i < randomProps.length; i++) {
    for (let j = i + 1; j < randomProps.length; j++) {
      assert.ok(
        Game.util.dist(randomProps[i].x, randomProps[i].y, randomProps[j].x, randomProps[j].y) >= cfg.decorSpacing - 0.001,
        region.id + ' seed ' + seed + ' decor spacing: ' + randomProps[i].sprite + '/' + randomProps[j].sprite +
          ' = ' + Game.util.dist(randomProps[i].x, randomProps[i].y, randomProps[j].x, randomProps[j].y)
      );
    }
  }

  for (const prop of layout.props) {
    assertFinitePoint(prop, region.id + ':' + prop.sprite);
    assert.ok(prop.x >= 0 && prop.x <= 900 && prop.y >= 0 && prop.y <= 520);
    if (!prop.large || prop.campProp || prop.sprite === 'tent' || prop.campfire) continue;
    assert.ok(Game.util.dist(prop.x, prop.y, layout.camp.x, layout.camp.y) >= layout.campSafeRadius - 0.001);
    assert.ok(Game.util.dist(prop.x, prop.y, layout.bossPoint.x, layout.bossPoint.y) >= layout.bossSafeRadius - 0.001);
    assert.ok(Game.terrain.distanceToPath(prop.x, prop.y, layout.corridor.points) >= layout.corridor.width / 2 + 9.9);
  }

  for (const point of layout.spawnCandidates) {
    assertFinitePoint(point, region.id + ' spawn');
    const x = Math.min(layout.nav.w - 1, Math.floor(point.x / layout.nav.cell));
    const y = Math.min(layout.nav.h - 1, Math.floor(point.y / layout.nav.cell));
    assert.ok(layout.nav.costs[y][x] <= 1.16 + 1e-9);
    assert.ok(Game.util.dist(point.x, point.y, layout.camp.x, layout.camp.y) >= layout.campSafeRadius + 27.9);
    assert.ok(Game.util.dist(point.x, point.y, layout.bossPoint.x, layout.bossPoint.y) >= layout.bossSafeRadius + 17.9);
  }

  for (const row of layout.nav.costs) {
    for (const cost of row) assert.ok(Number.isFinite(cost) && cost >= 1 && cost < 3);
  }

  for (let i = 1; i < layout.corridor.points.length; i++) {
    const a = layout.corridor.points[i - 1];
    const b = layout.corridor.points[i];
    for (let step = 0; step <= 10; step++) {
      const ratio = step / 10;
      const x = a.x + (b.x - a.x) * ratio;
      const y = a.y + (b.y - a.y) * ratio;
      const gx = Math.min(layout.gw - 1, Math.floor(x / layout.cell));
      const gy = Math.min(layout.gh - 1, Math.floor(y / layout.cell));
      assert.equal(layout.grid[gy * layout.gw + gx], layout.corridor.mat, region.id + ' corridor material');
    }
  }

  const pathToBoss = Game.nav.solve(layout.camp.x, layout.camp.y, layout.bossPoint.x, layout.bossPoint.y);
  assert.ok(pathToBoss && pathToBoss.length > 0, region.id + ' camp-to-boss path');
  assert.ok(Game.util.dist(pathToBoss.at(-1).x, pathToBoss.at(-1).y, layout.bossPoint.x, layout.bossPoint.y) < 0.01);
}

function runLayoutMatrix() {
  const regions = Game.reg.all('region');
  let layouts = 0;
  for (const region of regions) {
    for (const version of [1, 2]) {
      const seen = new Set();
      for (let seed = 0; seed < 100; seed++) {
        const layoutA = Game.terrain.build(region, seed, version);
        const snapA = JSON.stringify(Game.terrain.snapshot(layoutA));
        assertLayout(region, seed, layoutA, version);
        const layoutB = Game.terrain.build(region, seed, version);
        const snapB = JSON.stringify(Game.terrain.snapshot(layoutB));
        assert.equal(snapA, snapB, region.id + ' v' + version + ' seed ' + seed + ' must be deterministic');
        seen.add(snapA);
        layouts++;
      }
      assert.ok(seen.size >= 98, region.id + ' v' + version + ' should vary across seeds');
    }
    const oldLayout = JSON.stringify(Game.terrain.snapshot(Game.terrain.build(region, 77, 1)));
    const denseLayout = JSON.stringify(Game.terrain.snapshot(Game.terrain.build(region, 77, 2)));
    assert.notEqual(denseLayout, oldLayout, region.id + ' v2 must differ from v1');
  }
  return layouts;
}

function runV1CompatibilitySnapshots() {
  const expected = {
    grassland: '6dced5aa', forest: '29392a9c', mine: 'e3ac71b1', graveyard: '363705f3',
    snowpass: '7766d05b', lavacave: '8aa2399b', skyruins: 'ecf3352e', darkcastle: 'c497a92d'
  };
  for (const region of Game.reg.all('region')) {
    const snapshot = JSON.stringify(Game.terrain.snapshot(Game.terrain.build(region, 0x12345678, 1)));
    assert.equal(Game.util.fnv1a(snapshot), expected[region.id], region.id + ' v1 snapshot compatibility');
  }
}

function runSubseedIsolation() {
  const region = Game.reg.get('region', 'grassland');
  const originalTufts = region.terrain.tufts;
  const before = Game.terrain.build(region, 0x12345678, 2);
  const criticalBefore = JSON.stringify({
    camp: before.camp,
    boss: before.bossPoint,
    corridor: before.corridor,
    grid: before.grid,
    props: before.props.map((p) => [p.sprite, p.x, p.y, p.flipX])
  });
  region.terrain.tufts = originalTufts + 7;
  const after = Game.terrain.build(region, 0x12345678, 2);
  region.terrain.tufts = originalTufts;
  const criticalAfter = JSON.stringify({
    camp: after.camp,
    boss: after.bossPoint,
    corridor: after.corridor,
    grid: after.grid,
    props: after.props.map((p) => [p.sprite, p.x, p.y, p.flipX])
  });
  assert.equal(criticalAfter, criticalBefore, 'details changes must not perturb landmarks, terrain, or decor');
}

function runNavLifecycle() {
  const layout = Game.terrain.build(Game.reg.get('region', 'lavacave'), 0xCAFEBABE, 2);
  const ent = { x: layout.camp.x, y: layout.camp.y, dir: 'd', moving: false };
  function direct(e, x, y, speed, dt) {
    const dx = x - e.x, dy = y - e.y;
    const d = Math.hypot(dx, dy);
    if (!d) return 0;
    const step = Math.min(d, speed * Math.min(dt, 0.25));
    e.x += dx / d * step;
    e.y += dy / d * step;
    return d - step;
  }
  const tokenA = {};
  Game.nav.step(ent, layout.bossPoint.x, layout.bossPoint.y, 56, 0.1, tokenA, direct);
  const firstRoute = ent.navRoute;
  assert.ok(firstRoute.points.length > 0);
  Game.nav.step(ent, layout.bossPoint.x + 12, layout.bossPoint.y, 56, 0.1, tokenA, direct);
  assert.equal(ent.navRoute, firstRoute, 'small target movement before timeout reuses path');
  Game.nav.step(ent, layout.bossPoint.x + 45, layout.bossPoint.y, 56, 0.1, tokenA, direct);
  assert.notEqual(ent.navRoute, firstRoute, 'target movement over 32px repaths');
  const movedRoute = ent.navRoute;
  Game.nav.step(ent, layout.bossPoint.x + 45, layout.bossPoint.y, 56, 0.61, tokenA, direct);
  assert.notEqual(ent.navRoute, movedRoute, 'route older than 0.6s repaths');
  const timedRoute = ent.navRoute;
  Game.nav.step(ent, layout.bossPoint.x + 45, layout.bossPoint.y, 56, 0.1, {}, direct);
  assert.notEqual(ent.navRoute, timedRoute, 'target instance change repaths');
  assert.ok(Number.isFinite(ent.x) && Number.isFinite(ent.y), 'large dt movement stays finite');

  ent.x = layout.camp.x + 4.2;
  ent.y = layout.camp.y;
  ent.navRoute = null;
  Game.nav.step(ent, layout.camp.x, layout.camp.y, 56, 0.1, 'final-waypoint', direct);
  assert.ok(Game.util.dist(ent.x, ent.y, layout.camp.x, layout.camp.y) < 4, 'final waypoint is not skipped by the 5px intermediate threshold');
}

const matrixCount = runLayoutMatrix();
runV1CompatibilitySnapshots();
runSubseedIsolation();
runNavLifecycle();

load('js/systems/state.js');

const canonicalOrder = Game.reg.ids('region');
const authoredOrderA = Game.State.makeRegionOrder(0x10203040);
const authoredOrderB = Game.State.makeRegionOrder(0x55667788);
assert.deepEqual(authoredOrderA, canonicalOrder, 'new-game route randomization defaults to off');
assert.deepEqual(authoredOrderB, canonicalOrder, 'world seed does not reorder the authored route while disabled');
const seededOrderA = Game.State.makeRegionOrder(0x10203040, { randomizeMainline: true });
const seededOrderB = Game.State.makeRegionOrder(0x10203040, { randomizeMainline: true });
assert.deepEqual(seededOrderA, seededOrderB, 'region shuffle is deterministic for a world seed');
const orderVariants = new Set(Array.from({ length: 32 }, (_, seed) =>
  Game.State.makeRegionOrder(seed, { randomizeMainline: true }).slice(0, 4).join(',')));
assert.ok(orderVariants.size > 12, 'world seeds produce varied early-region orders');
const freshState = Game.State.newGame();
assert.equal(freshState.world.worldSeed, freshState.world.worldSeed >>> 0);
assert.equal(freshState.world.layoutVersion, 3);
assert.deepEqual(freshState.world.regionOrder, canonicalOrder);
assert.deepEqual(Game.routes.validate(freshState.world.routePlan), []);

const storage = new Map();
global.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};
Game.inv = {
  peekUidSeq() { return 1; },
  setUidSeq() {},
  byUid() { return null; }
};
Game.player.recalc = function () {
  Game.state.derived = { maxHp: 100 };
  return Game.state.derived;
};
Game.auto = { reconcile() {} };
Game.i18n = { setLocale() {} };
Game.particles = { setEnabled() {} };
Game.world = { init() {} };
Game.ui = { hud: { update() {} }, tabs: { queueRerender() {} } };
load('js/core/save.js');

function v5Save() {
  return {
    v: 5,
    ts: 1712345678901,
    createdAt: 1700000000123,
    settings: { lang: 'zh-CN', effects: true, controlMode: 'auto' },
    player: { level: 9, hp: 80, skills: {}, perms: {} },
    inv: { items: [], equipped: {}, lockedSlots: {}, potions: {}, uidSeq: 1 },
    world: {
      region: 'forest',
      regionOrder: ['graveyard', 'grassland', 'forest', 'mine', 'snowpass', 'lavacave', 'skyruins', 'darkcastle'],
      mode: 'battle', regionProg: {}
    },
    meta: { stats: {}, ach: {}, prologueDone: true }
  };
}

function runSaveTests() {
  const old = v5Save();
  const expectedSeed = Game.util.strSeed('legacy:' + old.createdAt);
  storage.set('firpg_save', '{broken');
  storage.set('firpg_save_backup', JSON.stringify(old));
  const migrated = Game.save.load();
  assert.equal(migrated.v, Game.SAVE_VERSION);
  assert.equal(migrated.world.worldSeed, expectedSeed);
  assert.equal(migrated.world.layoutVersion, 3);
  assert.deepEqual(migrated.world.regionOrder, old.world.regionOrder, 'migration preserves route order');
  assert.deepEqual(Game.routes.mainlineRegionOrder(migrated.world.routePlan), old.world.regionOrder,
    'migration compiles the preserved route into RoutePlan');

  Game.save.applyLoaded(migrated);
  const serialized = Game.save.serialize();
  assert.equal(serialized.world.worldSeed, expectedSeed);
  assert.equal(serialized.world.layoutVersion, 3);
  assert.deepEqual(Game.routes.validate(serialized.world.routePlan), []);
  const expectedLayout = JSON.stringify(Game.terrain.snapshotV3(
    Game.terrain.build(Game.reg.get('region', serialized.world.region), expectedSeed, 3)
  ));

  const b64 = Game.save.exportB64();
  assert.equal(Game.save.importB64(b64).ok, true);
  assert.equal(Game.state.world.worldSeed, expectedSeed);
  assert.equal(Game.state.world.layoutVersion, 3);
  const b64Layout = JSON.stringify(Game.terrain.snapshotV3(
    Game.terrain.build(Game.reg.get('region', Game.state.world.region), Game.state.world.worldSeed, Game.state.world.layoutVersion)
  ));
  assert.equal(b64Layout, expectedLayout, 'Base64 import rebuilds the same layout');

  const json = JSON.stringify(Game.save.serialize());
  assert.equal(Game.save.importFileText(json).ok, true);
  assert.equal(Game.state.world.worldSeed, expectedSeed);
  assert.deepEqual(Game.state.world.regionOrder, old.world.regionOrder);
  const jsonLayout = JSON.stringify(Game.terrain.snapshotV3(
    Game.terrain.build(Game.reg.get('region', Game.state.world.region), Game.state.world.worldSeed, Game.state.world.layoutVersion)
  ));
  assert.equal(jsonLayout, expectedLayout, 'JSON import rebuilds the same layout');

  Game.save.save('test');
  const primary = JSON.parse(storage.get('firpg_save'));
  const backup = JSON.parse(storage.get('firpg_save_backup'));
  assert.equal(primary.world.worldSeed, expectedSeed);
  assert.equal(primary.v, Game.SAVE_VERSION);
  assert.equal(primary.world.layoutVersion, 3);
  assert.deepEqual(primary, backup, 'main and backup slots match');

  const v6 = v5Save();
  v6.v = 6;
  v6.world.worldSeed = 0x0BADCAFE;
  v6.world.layoutVersion = 1;
  storage.set('firpg_save', JSON.stringify(v6));
  storage.set('firpg_save_backup', JSON.stringify(v6));
  const upgradedV6 = Game.save.load();
  assert.equal(upgradedV6.v, Game.SAVE_VERSION);
  assert.equal(upgradedV6.world.worldSeed, 0x0BADCAFE);
  assert.equal(upgradedV6.world.layoutVersion, 3, 'legacy layouts migrate once through v2 into open-map v3');
  Game.save.applyLoaded(upgradedV6);
  assert.equal(Game.save.serialize().world.layoutVersion, 3, 'current save reload keeps the migrated layout version');
}

runSaveTests();

console.log('Layout regression tests passed: ' + matrixCount + ' v1/v2 seeded layouts plus navigation and save migration coverage.');
