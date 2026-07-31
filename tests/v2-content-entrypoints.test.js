'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const entrypoint of [
  'index.html',
  'tech-demos/units/units.html',
  'tech-demos/map-effects/map-effects.html',
  'tech-demos/hazards/hazards.html',
  'tech-demos/exploration-v3/exploration-v3.html',
  'tech-demos/weather-climate/weather-climate.html',
  'tech-demos/merchants/merchants.html'
]) {
  const html = read(entrypoint);
  assert.equal((html.match(/js\/data\/content\/content\.generated\.js\?v=/g) || []).length, 1,
    `${entrypoint} loads exactly one generated content bundle`);
  assert.equal((html.match(/js\/core\/content\/support\.js\?v=/g) || []).length, 1,
    `${entrypoint} loads ContentSupport exactly once`);
  assert.doesNotMatch(html, /js\/data\/packs\//, `${entrypoint} does not load authoring sources`);
  assert.doesNotMatch(html, /js\/data\/(monsters|regions)\.js/, `${entrypoint} does not load legacy content`);
}
for (const entrypoint of [
  'index.html', 'tech-demos/units/units.html', 'tech-demos/map-effects/map-effects.html',
  'tech-demos/hazards/hazards.html'
]) {
  const html = read(entrypoint);
  if (entrypoint.includes('map-effects')) {
    assert.doesNotMatch(html, /js\/render\/combat_presentation\.js/,
      `${entrypoint} deliberately excludes combat presentation`);
    continue;
  }
  assert.match(html, /js\/render\/effects\.js\?v=[^"]+"><\/script>\s*<script src="[^"]*js\/render\/combat_presentation\.js\?v=/,
    `${entrypoint} loads the production combat presentation adapter after FX`);
}
const audit = JSON.parse(execFileSync(process.execPath, ['tools/audit-content.js'], {
  cwd: ROOT, encoding: 'utf8'
}));
assert.equal(audit.ok, true);
assert.equal(audit.packs.length, 18);
assert.match(audit.fingerprint, /^[0-9a-f]{8}$/);
execFileSync(process.execPath, ['tools/build-content-bundle.js', '--check'], { cwd: ROOT, stdio: 'pipe' });
console.log(`Content entrypoints passed: 7 consumers share one generated bundle / ${audit.fingerprint}.`);
