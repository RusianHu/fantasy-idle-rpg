'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PRODUCTION_CONTENT_FILES } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const sandbox = {
  console, window: null,
  document: {
    documentElement: { lang: 'zh-CN' },
    querySelector: () => null,
    querySelectorAll: () => []
  },
  navigator: { language: 'zh-CN' },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  Math, Number, Date, Object, Array, String, Boolean, JSON,
  Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, {
    filename: file
  });
}

PRODUCTION_CONTENT_FILES.forEach(load);
const Game = sandbox.Game;
Game.content.finalize({ strict: true });
load('js/data/formulas.js');
load('js/systems/terrain.js');
load('js/systems/terrain_v3.js');
load('js/systems/hazards.js');

const regions = [
  'grassland', 'forest', 'mine', 'graveyard',
  'snowpass', 'lavacave', 'skyruins', 'darkcastle'
];
const strategies = ['safe', 'balanced', 'loot'];
const totals = Object.fromEntries(strategies.map((strategy) => [
  strategy, { detectable: 0, instances: 0 }
]));
let fixtures = 0;
let firstSignature = null;

function initialize(regionId, worldSeed) {
  Game.hazards.reset();
  Game.state = {
    settings: { controlMode: 'auto', expeditionStrategy: 'balanced' },
    world: {
      region: regionId,
      worldSeed,
      worldTime: 300,
      layoutVersion: 3,
      mode: 'battle',
      hazards: { layoutVersion: 3, regions: {} }
    }
  };
  const region = Game.reg.get('region', regionId);
  const layout = Game.terrain.generate(region, worldSeed, 3);
  Game.terrain.mount(layout, region);
  Game.world = {
    region,
    layout,
    entities: [],
    hero: null,
    cinematic: null
  };
  return Game.hazards.initRegion(regionId, layout);
}

for (const regionId of regions) {
  for (let seedIndex = 0; seedIndex < 12; seedIndex++) {
    const worldSeed = Game.util.strSeed(`hazard-detection:${regionId}:${seedIndex}`);
    const instances = initialize(regionId, worldSeed);
    assert.ok(instances.length >= 5 && instances.length <= 10,
      `${regionId}/${seedIndex} mounts the expected Hazard population`);
    const signature = instances.map((instance) => [
      instance.id,
      Game.hazards.detectionContext(instance.id).roll
    ]);
    if (firstSignature === null) {
      firstSignature = JSON.stringify(signature);
      const repeated = initialize(regionId, worldSeed).map((instance) => [
        instance.id,
        Game.hazards.detectionContext(instance.id).roll
      ]);
      assert.equal(JSON.stringify(repeated), firstSignature,
        'same seed and layout reproduce stable detection rolls');
    } else if (regionId === regions[0] && seedIndex === 1) {
      assert.notEqual(JSON.stringify(signature), firstSignature,
        'a different world seed produces a different detection distribution');
    }
    for (const strategy of strategies) {
      Game.state.settings.expeditionStrategy = strategy;
      for (const instance of Game.hazards.all()) {
        const context = Game.hazards.detectionContext(instance.id);
        totals[strategy].instances++;
        if (context.detectable) totals[strategy].detectable++;
      }
    }
    fixtures++;
  }
}

const rates = Object.fromEntries(strategies.map((strategy) => [
  strategy,
  totals[strategy].detectable / totals[strategy].instances
]));
assert.ok(rates.balanced >= 0.22 && rates.balanced <= 0.28,
  `balanced detection rate stays near 25%: ${rates.balanced}`);
assert.ok(rates.safe >= 0.35 && rates.safe <= 0.45,
  `safe detection rate stays near 40%: ${rates.safe}`);
assert.ok(rates.loot >= 0.12 && rates.loot <= 0.18,
  `loot detection rate stays near 15%: ${rates.loot}`);
assert.ok(rates.safe > rates.balanced && rates.balanced > rates.loot);

console.log(
  `Hazard detection balance passed: ${fixtures} layouts, ` +
  `safe ${(rates.safe * 100).toFixed(1)}%, ` +
  `balanced ${(rates.balanced * 100).toFixed(1)}%, ` +
  `loot ${(rates.loot * 100).toFixed(1)}%.`
);
