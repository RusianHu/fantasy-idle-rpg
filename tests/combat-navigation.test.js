'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sandbox = {
  console, window: null,
  document: {
    documentElement: { lang: 'zh-CN' },
    querySelector: () => null,
    querySelectorAll: () => []
  },
  navigator: { language: 'zh-CN' },
  localStorage: { getItem: () => null, setItem: () => {} },
  matchMedia: () => ({ matches: false }),
  Math, Number, Date, Object, Array, String, Boolean, JSON, Uint8Array, Uint32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(file) { vm.runInContext(read(file), sandbox, { filename: file }); }

[
  'js/core/utils.js', 'js/vendor/easystar-0.4.4.min.js',
  'js/core/eventbus.js', 'js/core/registry.js',
  'js/core/content/rules.js', 'js/core/content/schemas.js',
  'js/core/content/compiler.js', 'js/core/content/audit.js',
  'js/core/content/registry.js', 'js/i18n/i18n.js',
  'js/i18n/zh-CN.js', 'js/i18n/en.js',
  'js/i18n/combat-v2-zh-CN.js', 'js/i18n/combat-v2-en.js',
  'js/core/assets.js', 'js/sprites/palettes.js', 'js/sprites/hero.js',
  'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js',
  'js/sprites/monsters_expansion.js', 'js/sprites/props.js',
  'js/sprites/ground-decorations/grassland.generated.js',
  'js/sprites/ground-decorations/forest.generated.js',
  'js/sprites/ground-decorations/mine.generated.js',
  'js/sprites/ground-decorations/graveyard.generated.js',
  'js/sprites/ground-decorations/snowpass.generated.js',
  'js/sprites/ground-decorations/lavacave.generated.js',
  'js/sprites/ground-decorations/skyruins.generated.js',
  'js/sprites/ground-decorations/darkcastle.generated.js',
  'js/sprites/exploration_v3.js', 'js/core/content/support.js',
  'js/data/content/content.generated.js'
].forEach(load);

const Game = sandbox.Game;
Game.content.finalize({ strict: true });
[
  'js/systems/terrain.js', 'js/systems/terrain_v3.js', 'js/systems/nav.js',
  'js/systems/actors/relations.js', 'js/systems/actors/parties.js',
  'js/systems/actors/actors.js', 'js/systems/encounters.js',
  'js/systems/combat_ai.js', 'js/systems/combat.js'
].forEach(load);

function arena() {
  const cell = 16;
  const w = 60;
  const h = 30;
  const grid = [];
  const costs = [];
  const distance = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    const costRow = [];
    const distanceRow = [];
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const divider = (x === 29 || x === 30) && y <= 22;
      const open = !border && !divider;
      row.push(open ? 1 : 0);
      costRow.push(1);
      distanceRow.push(open ? 1 : 0);
    }
    grid.push(row);
    costs.push(costRow);
    distance.push(distanceRow);
  }
  return {
    version: 3,
    world: { w: w * cell, h: h * cell },
    nav: { cell, w, h, grid, costs, distance }
  };
}

const layout = arena();
Game.terrain.layout = layout;
assert.equal(Game.nav.useLayout(layout), true);
assert.equal(Game.terrain.hasLineOfSight({ x: 240, y: 160 }, { x: 720, y: 160 }, 4), false,
  'supercover LOS is blocked by the hard divider');
assert.equal(Game.terrain.hasLineOfSight({ x: 240, y: 400 }, { x: 720, y: 400 }, 4), true,
  'supercover LOS passes through the open lower corridor');
const v3Layout = Game.terrain.layout;
Game.terrain.layout = { version: 2 };
assert.equal(Game.terrain.hasLineOfSight({ x: 0, y: 0 }, { x: 10, y: 10 }, 4), true,
  'legacy layouts without nav grids safely degrade to visible');
Game.terrain.layout = v3Layout;

const encounter = Game.encounters.start('encounter.grassland', {
  id: 'test:combat-navigation', seed: 0xC0111DE,
  silent: true, fullLog: true, terrainCollision: true
});
const hero = Game.actors.spawn({
  instanceId: 'test:path-hero', archetypeId: 'adventurer', classId: 'fighter',
  level: 10, tier: 1, factionId: 'adventurers', controllerId: 'ai:player-auto',
  statValues: { maxHp: 5000, moveSpeed: 58, range: 24, physicalPower: 18 },
  transform: { x: 240, y: 160 },
  spawnSource: { kind: 'test', sourceId: 'combat-navigation', sequence: 1 }
});
const enemy = Game.actors.spawn({
  instanceId: 'test:path-enemy', archetypeId: 'slime_green', level: 10, tier: 1,
  controllerId: 'ai:monster', statValues: { maxHp: 5000, moveSpeed: 50, range: 24 },
  transform: { x: 720, y: 160 },
  spawnSource: { kind: 'test', sourceId: 'combat-navigation', sequence: 2 }
});
Game.encounters.join(encounter.id, hero.id, 'party');
Game.encounters.join(encounter.id, enemy.id, 'enemy');

function legal(actor) {
  return Game.terrain.isWalkable(
    actor.x, actor.y, actor.components.body.collisionRadius
  );
}
function resetPositions() {
  hero.x = 240; hero.y = 160;
  enemy.x = 720; enemy.y = 160;
  hero.components.movement.intent = null;
  enemy.components.movement.intent = null;
  hero.components.movement.path = null;
  enemy.components.movement.path = null;
}

// Retreat/dash and knockback share the same swept terrain clamp.
hero.x = 456; hero.y = 200;
enemy.x = 420; enemy.y = 200;
Game.combat.applyEffect({
  encounterId: encounter.id, sourceActorId: hero.id,
  targetActorId: hero.id, abilityId: 'test.retreat'
}, {
  type: 'movement', distance: 40,
  target: { relation: 'self', shape: 'single', range: 999 }
});
assert.ok(hero.x < 464, 'backstep is clamped before the impassable divider');
assert.equal(legal(hero), true, 'backstep leaves the actor on legal terrain');

hero.x = 420; hero.y = 200;
enemy.x = 456; enemy.y = 200;
Game.combat.applyEffect({
  encounterId: encounter.id, sourceActorId: hero.id,
  targetActorId: enemy.id, abilityId: 'test.knockback'
}, {
  type: 'knockback', distance: 40,
  target: { relation: 'hostile', shape: 'single', range: 999 }
});
assert.ok(enemy.x < 464, 'knockback is clamped before the impassable divider');
assert.equal(legal(enemy), true, 'knockback leaves the target on legal terrain');
assert.ok(encounter.metrics.movement.displacementClamps >= 2,
  'both forced displacement attempts report terrain clamps');

// A legacy/foreign position already inside a blocker is projected out on the next fixed tick.
resetPositions();
hero.x = 472;
assert.equal(legal(hero), false);
Game.combat.tickFixed(encounter.id);
assert.equal(legal(hero), true, 'fixed combat tick repairs an actor already embedded in terrain');
assert.ok(encounter.metrics.movement.terrainRecoveries >= 1);

// Both teams must route through the lower opening instead of walking into the divider forever.
resetPositions();
let usedOpening = false;
let illegalSamples = 0;
let actionStarted = false;
for (let tick = 0; tick < 1400 && encounter.lifecycle === 'active'; tick++) {
  Game.combat.tickFixed(encounter.id);
  for (const actor of [hero, enemy]) {
    if (!legal(actor)) illegalSamples++;
    if (actor.y >= 23 * 16 && actor.x >= 27 * 16 && actor.x <= 32 * 16) {
      usedOpening = true;
    }
  }
  actionStarted = actionStarted || Object.values(encounter.metrics.actions)
    .some((count) => count > 0);
  if (usedOpening && actionStarted) break;
}
assert.equal(illegalSamples, 0, 'path following and dynamic separation never enter blocked cells');
assert.equal(usedOpening, true, 'combatants route through the divider opening');
assert.equal(actionStarted, true, 'pathfinding eventually reaches combat range and resumes actions');
assert.ok(encounter.metrics.movement.pathReplans > 0, 'fixed ticks own deterministic path replans');
assert.equal(encounter.metrics.movement.pathFailures, 0, 'connected arena produces no path failure');

console.log('Combat navigation passed: obstacle routing, overlap-safe separation, displacement clamp and embedded-position recovery.');
