'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('tech-demos/weather-climate/weather-climate.html');
const script = read('tech-demos/weather-climate/weather-climate.js');
const styles = read('tech-demos/weather-climate/weather-climate.css');
const messages = read('tech-demos/demo-i18n.js');
const hub = read('tech-demos/index.html');
const guide = read('tech-demos/weather-climate/weather-climate.md');

for (const productionModule of [
  'js/data/content/content.generated.js',
  'js/systems/terrain.js',
  'js/systems/terrain_v3.js',
  'js/render/terrain.js',
  'js/render/renderer.js',
  'js/render/daynight.js',
  'js/render/particles.js',
  'js/render/effects.js'
]) {
  assert.ok(html.includes(productionModule),
    `Weather/Climate Lab loads production module ${productionModule}`);
}

for (const excludedModule of [
  'js/systems/world.js',
  'js/systems/world_population.js',
  'js/systems/combat.js',
  'js/systems/hazards.js',
  'js/systems/environment.js',
  'js/systems/exploration.js',
  'js/systems/expedition.js',
  'js/systems/trade.js',
  'js/systems/save.js',
  'js/core/save.js'
]) {
  assert.ok(!html.includes(excludedModule),
    `Weather/Climate Lab excludes ${excludedModule}`);
}

for (const productionCall of [
  'Game.terrain.generate(',
  'Game.terrain.validate(',
  'Game.terrain.repair(',
  'Game.terrain.mount(',
  'Game.terrain.windAt(',
  'Game.terrain.update(',
  'Game.render.init(',
  'Game.render.frame(',
  'Game.daynight.phase(',
  'Game.daynight.nightFactor(',
  'Game.particles.initRegion(',
  'Game.particles.setEnabled(',
  'Game.particles.update('
]) {
  assert.ok(script.includes(productionCall),
    `Weather/Climate Lab calls production API ${productionCall}`);
}

assert.doesNotMatch(script, /Game\.world\.init\s*\(/,
  'Lab does not start the production world lifecycle');
assert.doesNotMatch(script, /\b(?:localStorage|sessionStorage|indexedDB)\b/,
  'Lab does not access browser persistence');
assert.doesNotMatch(script, /Game\.(?:hazards|combat|exploration|expedition|trade)\b/,
  'Lab does not start gameplay systems');
assert.doesNotMatch(script, /\.(?:fillRect|strokeRect|beginPath|arc|lineTo)\s*\(/,
  'Lab does not implement demo-only weather drawing primitives');
assert.doesNotMatch(script, /register(?:Weather|Climate)|Game\.(?:weather|climate)\s*=/i,
  'Lab does not add production weather or climate APIs');

const expectedPresets = [
  'meadow', 'leaves', 'dust', 'wisps',
  'snow', 'embers', 'cloudwisp', 'miasma'
];
for (const preset of expectedPresets) {
  assert.match(script, new RegExp(`['"]${preset}['"]`),
    `Lab exposes existing particle primitive ${preset}`);
}
assert.match(script, /Object\.assign\(\{\}, region,\s*\{/,
  'cross-region particle previews use a shallow QA input');

for (const hook of [
  'timeline', 'weatherState', 'intensity', 'visibilityProvider', 'renderLayer'
]) {
  assert.match(script, new RegExp(`${hook}:\\s*['"]unconnected['"]`),
    `${hook} stays explicitly unconnected`);
}

for (const method of [
  'regions', 'particlePresets', 'snapshot', 'report',
  'setRegion', 'setSeed', 'setWorldTime', 'setParticlePreset',
  'setEffects', 'setCamera', 'capturePhases', 'verifyDeterminism'
]) {
  assert.match(script, new RegExp(`${method}:`),
    `WeatherClimateLab exposes ${method}`);
}
assert.match(script, /window\.WeatherClimateLab\s*=/);

for (const id of [
  'stage', 'region-tabs', 'seed-input', 'particle-select', 'effects-toggle',
  'time-slider', 'capture-phases', 'verify-determinism',
  'phase-dawn', 'phase-day', 'phase-dusk', 'phase-night',
  'metrics', 'report', 'map-lab-link', 'hazard-lab-link'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `Lab exposes #${id}`);
}

for (const param of ['seed', 'region', 'time', 'particle']) {
  assert.match(script, new RegExp(`params\\.get\\(['"]${param}['"]\\)`),
    `Lab restores ${param} from the URL`);
}
assert.match(html, /weather-climate\.css/);
assert.match(styles, /min-height:\s*44px/,
  'interactive controls retain a 44px minimum touch target');
assert.match(hub, /weather-climate\/weather-climate\.html/);
assert.match(guide, /不是天气系统/);

const i18nKeys = new Set(
  [...html.matchAll(/data-demo-(?:i18n|page-title|i18n-aria|i18n-title)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((key) => key.startsWith('weather.'))
);
for (const key of i18nKeys) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const occurrences = (messages.match(new RegExp(`'${escaped}'\\s*:`, 'g')) || []).length;
  assert.equal(occurrences, 2, `${key} exists once in each demo locale`);
}

console.log('weather-climate-demo.test.js: production-only rendering Lab contract passed');
