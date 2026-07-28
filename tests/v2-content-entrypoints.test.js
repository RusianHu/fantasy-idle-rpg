'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const box = { window: { Game: {} }, Object };
vm.createContext(box);
vm.runInContext(read('js/data/packs/manifest.js'), box);
const manifest = Array.from(box.window.Game.CONTENT_PACK_FILES).sort();
function htmlPacks(file) {
  return Array.from(read(file).matchAll(/<script src="([^"]*js\/data\/packs\/[^"?]+)\?v=/g))
    .map((match) => match[1].replace(/^(\.\.\/)+/, ''))
    .filter((entry) => entry !== 'js/data/packs/manifest.js')
    .sort();
}
assert.deepEqual(htmlPacks('index.html'), manifest, 'production entrypoint Pack list');
assert.deepEqual(htmlPacks('tech-demos/units/units.html'), manifest, 'Lab entrypoint Pack list');
assert.deepEqual(htmlPacks('tech-demos/map-effects/map-effects.html'), manifest,
  'map/effects entrypoint Pack list');
for (const entrypoint of [
  'index.html',
  'tech-demos/units/units.html',
  'tech-demos/map-effects/map-effects.html'
]) {
  const html = read(entrypoint);
  assert.match(html, /js\/render\/effects\.js\?v=[^"]+"><\/script>\s*<script src="[^"]*js\/render\/combat_presentation\.js\?v=/,
    `${entrypoint} loads the production combat presentation adapter after FX`);
}
const audit = JSON.parse(execFileSync(process.execPath, ['tools/audit-content.js'], {
  cwd: ROOT, encoding: 'utf8'
}));
assert.equal(audit.ok, true);
assert.equal(audit.packs.length, 15);
assert.match(audit.fingerprint, /^[0-9a-f]{8}$/);
console.log(`V2 content entrypoints passed: 4 consumers share ${manifest.length} files / ${audit.fingerprint}.`);
