'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sandbox = {
  console, window: null, Math, Number, Date, Object, Array, String, Boolean, JSON,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['js/core/utils.js', 'js/core/eventbus.js']) {
  vm.runInContext(read(file), sandbox, { filename: file });
}
const Game = sandbox.Game;
let instances = [];
Game.hazards = { all: () => instances, tick: () => 10 };
Game.state = { settings: { effects: true } };
Game.actors = { get: () => ({ x: 10, y: 20, spriteH: 16 }) };
let sparks = 0;
Game.fx = { hitSpark: () => { sparks++; } };
vm.runInContext(read('js/render/hazards.js'), sandbox, { filename: 'js/render/hazards.js' });

function context() {
  const operations = [];
  const ctx = { operations };
  for (const method of [
    'save', 'restore', 'translate', 'rotate', 'beginPath', 'arc', 'moveTo', 'lineTo',
    'stroke', 'fill', 'closePath', 'rect', 'fillRect', 'bezierCurveTo', 'setLineDash'
  ]) {
    ctx[method] = (...args) => operations.push([method, ...args]);
  }
  return ctx;
}

function hazard(glyph, phase, awareness, index) {
  const shape = glyph === 'flame' ? 'cone' :
    (glyph === 'spikes' || glyph === 'seal' || glyph === 'ambush' ? 'circle' : 'rect');
  return {
    id: `hazard:${glyph}:${phase}`, profileId: `hazard.test.${glyph}`,
    x: 40 + index * 18, y: 50, orientation: index % 4 * Math.PI / 2,
    awareness, phase, phaseSinceTick: 0, warningEndTick: 20,
    hitUntilTick: phase === 'active' ? 12 : 0, disabled: false,
    profile: { trigger: { shape, radius: 16, width: 44, height: 18, length: 36, angleDeg: 54 } },
    visual: { glyph, palette: { element: '#abcdef', clue: '#456789' } }
  };
}

const glyphs = ['spikes', 'darts', 'rocks', 'seal', 'icicle', 'flame', 'arc', 'lances', 'ambush'];
const phases = ['dormant', 'warning', 'active', 'cooldown'];
instances = [];
glyphs.forEach((glyph, index) => {
  phases.forEach((phase) => instances.push(hazard(glyph, phase, 'revealed', index)));
});
instances.push(hazard('spikes', 'dormant', 'concealed', 0));

const allCtx = context();
Game.hazardRender.draw(allCtx, -20, -20, 400, 180);
assert.ok(allCtx.operations.length > 500, 'all glyph/phase combinations produce a nonblank mechanism layer');
assert.ok(allCtx.operations.some((entry) => entry[0] === 'setLineDash'));
assert.ok(allCtx.operations.some((entry) => entry[0] === 'rotate' && entry[1] !== 0));
assert.equal(allCtx.operations.filter((entry) => entry[0] === 'save').length, instances.length);
assert.equal(allCtx.operations.filter((entry) => entry[0] === 'restore').length, instances.length);

const culledCtx = context();
Game.hazardRender.draw(culledCtx, 1000, 1000, 1200, 1200);
assert.equal(culledCtx.operations.length, 0, 'offscreen Hazards are culled');

Game.state.settings.effects = false;
Game.bus.emit('hazard:hit', { targetActorIds: ['hero'] });
assert.equal(sparks, 0, 'disabled effects suppress optional hit particles');
Game.state.settings.effects = true;
Game.bus.emit('hazard:hit', { targetActorIds: ['hero'] });
assert.equal(sparks, 1);

const renderer = read('js/render/renderer.js');
const nav = read('js/systems/nav.js');
assert.match(renderer, /Game\.hazardRender\.draw\(/);
assert.match(renderer, /!visibleDynamic\[j\]\.hazardConcealed/);
assert.match(nav, /Game\.hazards\.navigationCost/);

console.log('Hazard presentation tests passed: nine glyphs, five visual states, culling, particles and renderer/nav bridges.');
