'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const index = read('index.html');
const demoFiles = [
  ['tech-demos/index.html', 'tech-demos/demo-index.css'],
  ['tech-demos/map-effects/map-effects.html', 'tech-demos/map-effects/map-effects.css'],
  ['tech-demos/render-gallery/render-gallery.html', 'tech-demos/render-gallery/render-gallery.css'],
  ['tech-demos/hazards/hazards.html', 'tech-demos/hazards/hazards.css'],
  ['tech-demos/exploration-v3/exploration-v3.html', 'tech-demos/exploration-v3/exploration-v3.css'],
  ['tech-demos/units/units.html', 'tech-demos/units/units.css'],
  ['tech-demos/roguelike-equipment/roguelike-equipment.html', 'tech-demos/roguelike-equipment/roguelike-equipment.css']
].map(([html, css]) => ({ html, css, source: read(html), style: read(css) }));
const unitsDemo = read('tech-demos/units/units.html');
const unitsDemoScript = read('tech-demos/units/units.js');
const combatLabScript = read('tech-demos/units/combat-lab.js');
const style = read('css/style.css');
const utils = read('js/core/utils.js');
const main = read('js/main.js');
const updater = read('js/core/update.js');
const release = JSON.parse(read('version.json'));
const nginx = read('deploy/nginx/fantasy-idle-rpg-cache.conf');

const buildMatch = index.match(/<meta name="build-id" content="([^"]+)">/);
assert.ok(buildMatch, 'index.html must declare one build-id');
const buildId = buildMatch[1];
assert.match(buildId, /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
assert.equal(release.buildId, buildId, 'version.json must match the HTML build-id');
assert.match(utils, new RegExp(`Game\\.BUILD_ID = '${buildId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));

function assertVersionedHtml(source, name) {
  const declared = source.match(/<meta name="build-id" content="([^"]+)">/);
  assert.equal(declared && declared[1], buildId, `${name} build-id must match index.html`);
  const urls = [...source.matchAll(/<(?:link|script)\b[^>]+(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((url) => !url.startsWith('data:'));
  assert.ok(urls.length > 0, `${name} must contain local assets`);
  for (const url of urls) {
    assert.equal(new URL(url, 'https://example.test/').searchParams.get('v'), buildId,
      `${name} asset is not versioned with the current build: ${url}`);
  }
}

assertVersionedHtml(index, 'index.html');
for (const demo of demoFiles) assertVersionedHtml(demo.source, demo.html);
assert.ok(style.includes(`fusion-pixel.woff2?v=${buildId}`), 'CSS font URL must be versioned');
for (const demo of demoFiles) {
  assert.ok(demo.style.includes(`fusion-pixel.woff2?v=${buildId}`),
    `${demo.css} font URL must be versioned`);
}
assert.match(read('tech-demos/demo-i18n.js'), /window\.DemoI18n/,
  'technical demos must share the bilingual QA locale helper');
assert.match(unitsDemo, /systems\/terrain_v3\.js\?v=/,
  'units QA must load the production v3 terrain override');
assert.match(unitsDemo, /vendor\/easystar-0\.4\.4\.min\.js\?v=/,
  'units QA terrain regression must load the production pathfinder');
assert.match(unitsDemo, /systems\/nav\.js\?v=/,
  'units QA terrain regression must load production navigation');
assert.match(unitsDemo, /systems\/action_bubbles\.js\?v=/,
  'units QA must load the production action bubble manager');
assert.match(unitsDemo, /systems\/world_aggro\.js\?v=/,
  'units QA must load the production world aggro controller');
assert.match(unitsDemo, /id="mmo-audit"/,
  'units QA must expose one-click MMO aggro regression');
assert.match(combatLabScript, /Game\.worldAggro\.scan\(\)/,
  'combat Lab must exercise production aggro perception');
assert.match(combatLabScript, /Game\.worldAggro\.updateEvader/,
  'combat Lab must exercise production Evade return');
assert.match(unitsDemoScript, /Game\.actionBubbles\.show/,
  'units QA must exercise the production action bubble API');
assert.match(main, /fusion-pixel\.woff2\?v=' \+ encodeURIComponent\(Game\.BUILD_ID\)/,
  'FontFace preload must use Game.BUILD_ID');
assert.match(updater, /cache: 'no-store'/, 'release checks must bypass browser caches');
assert.match(updater, /visibilitychange/, 'returning mobile tabs must check for a release');
assert.match(updater, /pageshow/, 'bfcache restores must check for a release');

assert.match(nginx, /location = \/fantasy-idle-rpg\/ \{/);
assert.match(nginx, /Cache-Control "no-cache, must-revalidate"/);
assert.match(nginx, /location = \/fantasy-idle-rpg\/version\.json/);
assert.match(nginx, /Cache-Control "no-store"/);
assert.match(nginx, /Cache-Control "public, max-age=31536000, immutable"/);

console.log(`Cache version contract OK (${buildId})`);
