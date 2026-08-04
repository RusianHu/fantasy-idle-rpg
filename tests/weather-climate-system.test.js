'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PRODUCTION_CONTENT_FILES } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const providers = {};
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
  performance: { now: () => 0 },
  Math, Number, Date, Object, Array, String, Boolean, JSON,
  Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, {
    filename: file
  });
}

PRODUCTION_CONTENT_FILES.forEach(load);
const Game = sandbox.Game;
const audit = Game.content.finalize({ strict: true });
assert.equal(audit.ok, true);

const regionIds = [
  'grassland', 'forest', 'mine', 'graveyard',
  'snowpass', 'lavacave', 'skyruins', 'darkcastle'
];
const climates = Game.content.all('climateProfile');
assert.equal(climates.length, 8);
assert.equal(new Set(climates.map((profile) => profile.regionId)).size, 8);

for (const regionId of regionIds) {
  const region = Game.content.get('regionProfile', regionId);
  const climate = Game.content.get('climateProfile', region.climateProfileId);
  assert.ok(climate, `${regionId} strictly references a ClimateProfile`);
  assert.equal(climate.regionId, regionId);
  assert.deepEqual(
    Array.from(Object.keys(climate.states).sort()),
    ['arcane', 'calm', 'dry', 'volatile', 'wet']
  );
  for (const state of Object.values(climate.states)) {
    assert.notEqual(Game.i18n.t(state.nameKey), state.nameKey);
    Game.i18n.setLocale('en');
    assert.notEqual(Game.i18n.t(state.nameKey), state.nameKey);
    Game.i18n.setLocale('zh-CN');
    if (climate.exposure === 'underground') {
      assert.ok(!['rain', 'snow'].includes(state.precipitation.type));
      assert.equal(state.lightning, false);
    }
  }
}

Game.hazards = {
  registerDetectionModifierSource(id, provider) {
    providers[id] = provider;
    return true;
  }
};
load('js/systems/weather.js');
Game.state = {
  settings: { effects: true },
  world: {
    worldSeed: 0x1234abcd,
    worldTime: 612,
    region: 'grassland'
  }
};
Game.weather.init();
Game.weather.enterRegion('grassland');
assert.equal(Game.weather.constants.slotSeconds, 300);
assert.equal(Game.weather.constants.transitionSeconds, 24);
assert.deepEqual(
  Object.fromEntries(Object.entries(Game.weather.constants.rules).map(([id, rule]) =>
    [id, {
      weight: rule.weight,
      intensity: Array.from(rule.intensity),
      visibility: rule.visibility
    }]
  )),
  {
    calm: { weight: 30, intensity: [0.1, 0.3], visibility: 1 },
    wet: { weight: 25, intensity: [0.45, 0.7], visibility: 0.8 },
    volatile: { weight: 20, intensity: [0.75, 1], visibility: 0.65 },
    dry: { weight: 15, intensity: [0.4, 0.75], visibility: 0.9 },
    arcane: { weight: 10, intensity: [0.55, 0.9], visibility: 0.75 }
  }
);

const input = {
  worldSeed: 0x1234abcd,
  worldTime: 612.5,
  regionId: 'grassland'
};
const first = Game.weather.sample(input);
const second = Game.weather.sample(input);
assert.equal(JSON.stringify(first), JSON.stringify(second),
  'identical seed/time/region produces identical weather');

for (const regionId of regionIds) {
  const crossRegion = Game.weather.sample({ ...input, regionId });
  assert.equal(crossRegion.front, first.front,
    `${regionId} maps the same global front to a microclimate`);
  assert.equal(crossRegion.slotIndex, first.slotIndex);
}
assert.notEqual(
  Game.weather.sample({ ...input, regionId: 'grassland' }).stateId,
  Game.weather.sample({ ...input, regionId: 'mine' }).stateId
);

const expectedVisibility = {
  calm: 1, wet: 0.8, volatile: 0.65, dry: 0.9, arcane: 0.75
};
for (const [front, visibility] of Object.entries(expectedVisibility)) {
  const forced = Game.weather.sample({
    ...input,
    override: {
      mode: 'forced', front, intensity: 0.73, transitionProgress: 1
    }
  });
  assert.equal(forced.visibilityMultiplier, visibility);
  assert.equal(forced.intensity, 0.73);
}

let transitionSlot = 1;
while (transitionSlot < 100) {
  const before = Game.weather.sample({
    worldSeed: input.worldSeed,
    worldTime: transitionSlot * 300 - 1,
    regionId: 'grassland'
  });
  const after = Game.weather.sample({
    worldSeed: input.worldSeed,
    worldTime: transitionSlot * 300 + 12,
    regionId: 'grassland'
  });
  if (before.front !== after.front) {
    const expected = (expectedVisibility[before.front] +
      expectedVisibility[after.front]) / 2;
    assert.ok(Math.abs(after.visibilityMultiplier - expected) < 1e-10);
    assert.equal(after.transitionProgress, 0.5);
    break;
  }
  transitionSlot++;
}
assert.ok(transitionSlot < 100, 'fixture finds a front transition');

const storm = Game.weather.inspect({
  worldSeed: input.worldSeed,
  worldTime: 750,
  regionId: 'grassland',
  override: {
    mode: 'forced', front: 'volatile', intensity: 0.9, transitionProgress: 1
  }
});
const stormRepeat = Game.weather.inspect({
  worldSeed: input.worldSeed,
  worldTime: 750,
  regionId: 'grassland',
  override: {
    mode: 'forced', front: 'volatile', intensity: 0.9, transitionProgress: 1
  }
});
assert.deepEqual(
  Array.from(storm.lightningSequence),
  Array.from(stormRepeat.lightningSequence)
);
for (let index = 1; index < storm.lightningSequence.length; index++) {
  const interval = storm.lightningSequence[index] -
    storm.lightningSequence[index - 1];
  assert.ok(interval >= 8 && interval <= 18);
}

const lightningEvents = [];
Game.bus.on('weather:lightning', (event) => lightningEvents.push(event));
Game.state.world.worldTime = 750;
Game.weather.setPreview({
  mode: 'forced', front: 'volatile', intensity: 0.9, transitionProgress: 1
});
Game.weather.enterRegion('grassland');
const armed = Game.weather.inspect();
assert.equal(lightningEvents.length, 0,
  'entering mid-slot never replays historical lightning');
assert.ok(armed.nextLightningAt > Game.state.world.worldTime);
Game.state.world.worldTime = armed.nextLightningAt;
Game.weather.update(0.016, Game.state.world.worldTime);
assert.equal(lightningEvents.length, 1);

assert.equal(typeof providers['weather:visibility'], 'function');
assert.equal(
  providers['weather:visibility']({ regionId: 'grassland' }),
  Game.weather.visibilityMultiplier('grassland')
);

assert.equal(Game.SAVE_VERSION, 19);
assert.doesNotMatch(
  fs.readFileSync(path.join(ROOT, 'js/core/save.js'), 'utf8'),
  /\bweather\s*:/
);

console.log('Weather/climate system tests passed: content, scheduling, transitions, lightning, Hazard Provider and save invariants.');
