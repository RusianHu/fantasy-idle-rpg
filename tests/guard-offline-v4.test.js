'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PRODUCTION_CONTENT_FILES } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sandbox = {
  console,
  window: null,
  document: { documentElement: { lang: 'en' }, querySelector: () => null, querySelectorAll: () => [] },
  navigator: { language: 'en' },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  performance: { now: () => 0 },
  Math, Number, Date, Object, Array, String, Boolean, JSON,
  Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
vm.createContext(sandbox);
function load(file) {
  vm.runInContext(read(file), sandbox, { filename: file });
}
PRODUCTION_CONTENT_FILES.forEach(load);
load('js/data/formulas.js');
load('js/systems/world_population.js');
load('js/systems/offline.js');

const { Game } = sandbox;
Game.content.finalize({ strict: true });
const region = Game.reg.get('region', 'grassland');
const resource = region.exploration.resources[0];
const nodes = [0, 1].map((index) => ({
  id: `grassland:node:${index}`,
  defId: resource.id,
  x: 180 + index * 140,
  y: 220
}));
let blockedIds = new Set(nodes.map((node) => node.id));
let blockChecks = 0;

Game.entryState = 'playing';
Game.state = {
  settings: { combatStrategy: 'balanced' },
  world: { mode: 'battle', layoutVersion: 4, region: region.id }
};
Game.State = {
  isAdventureStarted: () => true,
  regionOrder: () => Game.reg.all('region').map((entry) => entry.id),
  regionTier: () => 1
};
Game.player = {
  estimateDps: () => 100,
  derived: () => ({ expMul: 1, goldMul: 1 })
};
Game.world = { layout: { version: 4, nodes } };
Game.exploration = {
  regionState: () => ({ discovered: { resources: { [resource.id]: true } } }),
  coverage: () => 0
};
Game.guardSites = {
  blocksOffline(node) {
    blockChecks++;
    return blockedIds.has(node.id);
  }
};

const allBlocked = Game.offline.settle(3600);
assert.equal(blockChecks, nodes.length, 'offline settlement queries the production guard policy per known node');
assert.equal(allBlocked.knownResources, 0);
assert.equal(allBlocked.routeLoops, 0);
assert.equal(allBlocked.gatherActions, 0);
assert.equal(allBlocked.kills, 0,
  'a fully guard-blocked known route cannot generate gathering or route combat offline');

blockedIds = new Set([nodes[0].id]);
blockChecks = 0;
const partiallyOpen = Game.offline.settle(3600);
assert.equal(blockChecks, nodes.length);
assert.equal(partiallyOpen.knownResources, 1);
assert.ok(partiallyOpen.routeLoops > 0);
assert.ok(partiallyOpen.gatherActions > 0);
assert.ok(partiallyOpen.kills > 0,
  'clearing one guarded node restores a proportionally eligible offline route');

console.log('Guard offline v4 tests passed: guarded route nodes are excluded until cleared.');
