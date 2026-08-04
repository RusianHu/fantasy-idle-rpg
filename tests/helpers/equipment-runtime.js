'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PRODUCTION_CONTENT_FILES } = require('./production-content');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function bootEquipmentRuntime() {
  const sandbox = {
    console, window: null,
    document: {
      documentElement: { lang: 'zh-CN' },
      querySelector: () => null,
      querySelectorAll: () => []
    },
    navigator: { language: 'zh-CN' },
    localStorage: { getItem: () => null, setItem: () => {} },
    matchMedia: () => ({ matches: false }),
    Math, Number, Date, Object, Array, String, Boolean, JSON, Uint8Array, Uint32Array,
    setTimeout, clearTimeout
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const load = (file) => vm.runInContext(read(file), sandbox, { filename: file });
  PRODUCTION_CONTENT_FILES.forEach(load);
  const Game = sandbox.Game;
  Game.content.finalize({ strict: true });
  Game.F = {
    gearBoxPrice: (level) => Math.round(90 * Math.pow(1.12, Math.max(1, level))),
    sellPrice: (level, rarity) => Math.round(level * (rarity + 1) * 3),
    salvageCrystal: (level) => 12 + Math.floor(level / 8)
  };
  Game.state = {
    player: { classId: 'fighter', level: 20, gold: 1e9, crystal: 0 },
    inv: {
      items: [], materials: { herb: 999 },
      equipped: { weapon: null, head: null, body: null, feet: null, accessory: null },
      loot: null
    },
    world: { worldSeed: 123456, region: 'grassland', mode: 'rest' }
  };
  Game.world = { hero: { encounterId: null }, syncHeroStats() {} };
  Game.player = { recalc() {} };
  Game.inv = {
    byUid(uid) {
      return Game.state.inv.items.find((item) => item.uid === uid) || null;
    },
    materialCount(id) { return Number(Game.state.inv.materials[id]) || 0; },
    addItems(items) {
      Game.state.inv.items.push(...items);
      return items;
    }
  };
  load('js/systems/equipment.js');
  Game.state.inv.loot = Game.loot.defaultState();
  return { Game, sandbox, load };
}

module.exports = { bootEquipmentRuntime };
