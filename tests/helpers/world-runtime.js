'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');

// Host-only substitutes. All gameplay modules come from the production index,
// including actors, combat, world, transitions, save and the actual RAF loop.
function bootWorldRuntime(options = {}) {
  let now = 10000;
  const frames = [], storage = new Map(), listeners = {};
  if (options.save) storage.set('firpg_save', options.save);
  const ctx = new Proxy({}, { get: (_, key) => key === 'getImageData'
    ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : key === 'measureText'
    ? text => ({ width: String(text).length * 7 })
    : key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => ({ addColorStop() {} }) : () => {} });
  const element = () => ({ style: {}, classList: { contains: () => true, add() {}, remove() {} },
    children: [], getContext: () => ctx, addEventListener() {}, setAttribute() {},
    getBoundingClientRect: () => ({ width: 390, height: 844 }) });
  const sandbox = { console, Math, Number, Date: class extends Date { static now() { return 1789372800000 + now; } },
    performance: { now: () => now }, Uint8Array, Uint8ClampedArray, Uint32Array,
    navigator: { language: 'en' }, location: { href: 'http://localhost/', reload() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: fn => frames.push(fn), cancelAnimationFrame() {},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    addEventListener() {}, document: { hidden: false, documentElement: { lang: 'en', setAttribute() {} },
      getElementById: element, createElement: element, querySelector: () => null, querySelectorAll: () => [],
      addEventListener: (type, fn) => (listeners[type] ||= []).push(fn) } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const [, url] of html.matchAll(/<script\s+src="([^"]+)"/g)) {
    const file = url.split('?')[0];
    if (file.startsWith('js/ui/') || ['js/main.js', 'js/core/update.js'].includes(file)) continue;
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }
  const Game = sandbox.Game;
  Game.content.finalize({ strict: true });
  Game.prog.init(); Game.ending.init(); Game.meta.init();
  if (options.save) Game.save.applyLoaded(Game.save.load());
  else {
    Game.state = Game.State.newGame();
    Game.state.meta.prologueDone = true;
    Game.state.settings.autoBoss = false;
    Game.player.setClass('fighter');
  }
  Game.player.recalc();
  if (!options.save) Game.state.player.hp = Game.state.derived.maxHp;
  Game.world.init(Game.state.world.region);
  if (!options.save) Game.units.restore(Game.world.hero);
  Game.ui = { hud: { tick() {}, update() {} }, modals: { toast() {}, clearToasts() {}, clearDeferredToasts() {}, flushDeferredToasts() {} } };
  Game.render.frame = () => {};
  Game.transitions.init(); Game.loop.init();
  if (options.save && Game.player.hasClass()) Game.transitions.restoreZeroHp();
  Game.entryState = 'active'; Game.loop.start();
  return { Game, storage, pump(count, ms = 50) {
    for (let i = 0; i < count; i++) { now += ms; if (!sandbox.document.hidden) for (const fn of frames.splice(0)) fn(now); }
  }, visibility(hidden) { sandbox.document.hidden = hidden; for (const fn of listeners.visibilitychange || []) fn(); } };
}
module.exports = { bootWorldRuntime };
