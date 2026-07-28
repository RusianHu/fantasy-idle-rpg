'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const drawCalls = [];

function fakeContext() {
  return {
    imageSmoothingEnabled: true,
    fillStyle: '',
    clears: 0,
    fills: 0,
    clearRect() { this.clears++; },
    fillRect() { this.fills++; }
  };
}

function fakeCanvas() {
  const attrs = {};
  const classes = new Set();
  const context = fakeContext();
  return {
    width: 48,
    height: 48,
    getContext: () => context,
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute: (name) => attrs[name] || null,
    removeAttribute(name) { delete attrs[name]; },
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    attrs,
    classes,
    context
  };
}

const registered = new Set(['face_mage', 'hero_mage', 'slime_green']);
const Game = {
  util: {
    strSeed(value) {
      return String(value).split('').reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
    }
  },
  assets: {
    has: (id) => registered.has(id),
    hasFrame: (id, frame) => (id === 'face_mage' && frame === 'icon') ||
      (id !== 'face_mage' && frame === 'idle0'),
    sprite: (id) => ({ frames: id === 'face_mage' ? { icon: {} } : { idle0: {} } }),
    drawToDom(canvas, id, frame) {
      drawCalls.push({ canvas, id, frame });
      canvas.context.fillRect(2, 2, 20, 20);
    }
  }
};

const box = { window: { Game }, console, Object, Array, Math };
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/combat_portraits.js'), 'utf8'), box, {
  filename: 'js/ui/combat_portraits.js'
});

const hero = {
  id: 'hero',
  components: { presentation: { portraitId: 'face_mage', spriteId: 'hero_mage' } }
};
const enemy = {
  id: 'enemy',
  components: { presentation: { portraitId: 'slime_green', spriteId: 'slime_green' } }
};
const missing = {
  id: 'missing',
  components: { presentation: { portraitId: 'missing_portrait', spriteId: 'missing_sprite' } }
};

const heroCanvas = fakeCanvas();
const heroSource = Game.ui.combatPortraits.draw(heroCanvas, hero, 'Mage portrait');
assert.equal(heroSource.sourceKind, 'dedicated-portrait');
assert.equal(heroSource.assetId, 'face_mage');
assert.equal(heroSource.frameName, 'icon');
assert.equal(heroCanvas.attrs['aria-label'], 'Mage portrait');
assert.equal(heroCanvas.attrs['data-portrait-mode'], 'dedicated-portrait');

const enemyCanvas = fakeCanvas();
const enemySource = Game.ui.combatPortraits.draw(enemyCanvas, enemy, 'Slime portrait');
assert.equal(enemySource.sourceKind, 'sprite-portrait');
assert.equal(enemySource.assetId, 'slime_green');
assert.equal(enemySource.frameName, 'idle0');
assert.equal(enemyCanvas.attrs['data-portrait-source'], 'slime_green');

const fallbackCanvas = fakeCanvas();
const fallbackSource = Game.ui.combatPortraits.draw(fallbackCanvas, missing, 'Unknown portrait');
assert.equal(fallbackSource.sourceKind, 'pixel-fallback');
assert.equal(fallbackSource.assetId, null);
assert.ok(fallbackCanvas.context.fills >= 7, 'missing assets render a deterministic pixel silhouette');
assert.equal(fallbackCanvas.attrs['data-portrait-source'], 'pixel-fallback');

const drawCount = drawCalls.length;
Game.ui.combatPortraits.draw(heroCanvas, hero, 'Updated label');
assert.equal(drawCalls.length, drawCount, 'unchanged portrait source is not repainted');
assert.equal(heroCanvas.attrs['aria-label'], 'Updated label');

Game.ui.combatPortraits.clear(heroCanvas);
assert.equal(heroCanvas.attrs['data-portrait-source'], undefined);
assert.equal(heroCanvas.classes.has('is-empty'), true);

console.log('Combat portrait resolver and fallback passed.');
