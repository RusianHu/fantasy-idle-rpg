'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
global.window = global;

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
}

load('js/core/utils.js');
load('js/core/registry.js');
Game.assets = { sprite: () => ({ w: 16, h: 16, frames: {} }) };
load('js/data/regions.js');
load('js/data/routes.js');
load('js/systems/routes.js');

const canonical = Game.reg.ids('region');
const authored = Game.routes.create(0x12345678);
assert.equal(Game.ROUTE_FEATURES.randomizeNewGameMainline, false);
assert.equal(authored.creationMode, 'authored');
assert.deepEqual(Game.routes.mainlineRegionOrder(authored), canonical);
assert.deepEqual(Game.routes.validate(authored), []);

Game.ROUTE_FEATURES.randomizeNewGameMainline = true;
const randomizedA = Game.routes.create(0x12345678);
const randomizedB = Game.routes.create(0x12345678);
assert.deepEqual(randomizedA, randomizedB, 'same seed produces the same optional route');
assert.notDeepEqual(Game.routes.mainlineRegionOrder(randomizedA).slice(0, 4), canonical.slice(0, 4));
assert.deepEqual(Game.routes.mainlineRegionOrder(randomizedA).slice(4), canonical.slice(4));
Game.ROUTE_FEATURES.randomizeNewGameMainline = false;

const legacyOrder = ['graveyard', 'grassland', 'forest', 'mine',
  'snowpass', 'lavacave', 'skyruins', 'darkcastle'];
const migrated = Game.routes.fromLegacy(legacyOrder, 99);
assert.equal(migrated.creationMode, 'legacy-preserved');
assert.deepEqual(Game.routes.mainlineRegionOrder(migrated), legacyOrder);

const firstQuest = Game.routes.scheduleInsertion(migrated, {
  id: 'quest:lost-caravan',
  kind: 'quest',
  destination: { type: 'temporary-map', id: 'quest-map:lost-caravan' },
  anchor: { nodeId: 'main:forest', port: 'after' },
  priority: 20,
  metadata: { questId: 'lost-caravan' }
});
assert.ok(firstQuest);
assert.equal(firstQuest.tier, 3, 'excursion inherits its anchor tier after legacy reordering');
assert.deepEqual(firstQuest.returnPolicy, { mode: 'anchor', nodeId: 'main:forest' });

assert.ok(Game.routes.scheduleInsertion(migrated, {
  id: 'nest:spore-den',
  kind: 'nest',
  destination: { type: 'temporary-map', id: 'nest-map:spore-den' },
  anchor: { nodeId: 'main:forest', port: 'after' }
}));
assert.equal(Game.routes.scheduleInsertion(migrated, {
  id: 'quest:over-capacity',
  kind: 'quest',
  destination: { type: 'temporary-map', id: 'quest-map:over-capacity' },
  anchor: { nodeId: 'main:forest', port: 'after' }
}), null, 'insertion port capacity is enforced');

const itinerary = Game.routes.itinerary(migrated);
const forestIndex = itinerary.findIndex((node) => node.id === 'main:forest');
assert.deepEqual(itinerary.slice(forestIndex + 1, forestIndex + 3).map((node) => node.id),
  ['nest:spore-den', 'quest:lost-caravan'], 'excursions are materialized deterministically');
assert.equal(Game.routes.setInsertionState(migrated, 'nest:spore-den', 'resolved'), true);
assert.equal(Game.routes.itinerary(migrated).some((node) => node.id === 'nest:spore-den'), false);

const restored = Game.routes.normalize(JSON.parse(JSON.stringify(migrated)), canonical, 99);
assert.deepEqual(Game.routes.validate(restored), []);
assert.deepEqual(Game.routes.mainlineRegionOrder(restored), legacyOrder);
assert.equal(restored.insertions.length, 2);

console.log('Route planner tests passed: authored default, opt-in shuffle, legacy preservation, insertions, and restore.');
