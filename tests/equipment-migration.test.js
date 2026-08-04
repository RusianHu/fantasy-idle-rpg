'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PRODUCTION_CONTENT_FILES } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function boot(saved) {
  const storage = new Map([['firpg_save', JSON.stringify(saved)]]);
  const sandbox = {
    console, window: null,
    document: {
      documentElement: { lang: 'zh-CN' },
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, click() {}, setAttribute() {} }),
      body: { appendChild() {}, removeChild() {} }
    },
    navigator: { language: 'zh-CN' },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    location: { reload() {} }, matchMedia: () => ({ matches: false }),
    Math, Number, Date, Object, Array, String, Boolean, JSON, Uint8Array, Uint32Array,
    setTimeout, clearTimeout, Blob: function () {},
    URL: { createObjectURL: () => '', revokeObjectURL() {} }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const load = (file) => vm.runInContext(read(file), sandbox, { filename: file });
  [
    'js/core/utils.js', 'js/core/eventbus.js', 'js/core/registry.js',
    'js/core/content/rules.js', 'js/core/content/schemas.js',
    'js/core/content/compiler.js', 'js/core/content/audit.js',
    'js/core/content/registry.js', 'js/i18n/i18n.js',
    'js/i18n/zh-CN.js', 'js/i18n/en.js',
    'js/i18n/combat-v2-zh-CN.js', 'js/i18n/combat-v2-en.js',
    'js/core/assets.js', 'js/sprites/palettes.js', 'js/sprites/hero.js',
    'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js',
    'js/sprites/monsters_expansion.js', 'js/sprites/monsters_guards.js',
    'js/sprites/props.js',
    'js/sprites/ground-decorations/manifest.generated.js',
    'js/sprites/ground-decorations/grassland.generated.js',
    'js/sprites/ground-decorations/forest.generated.js',
    'js/sprites/ground-decorations/mine.generated.js',
    'js/sprites/ground-decorations/graveyard.generated.js',
    'js/sprites/ground-decorations/snowpass.generated.js',
    'js/sprites/ground-decorations/lavacave.generated.js',
    'js/sprites/ground-decorations/skyruins.generated.js',
    'js/sprites/ground-decorations/darkcastle.generated.js',
    'js/sprites/exploration_v3.js', 'js/data/formulas.js', 'js/data/affixes.js',
    'js/data/items.js', 'js/data/classes.js', 'js/data/skills.js', 'js/data/routes.js',
    'js/core/content/support.js', 'js/data/content/content.generated.js'
  ].forEach(load);
  sandbox.Game.content.finalize({ strict: true });
  [
    'js/systems/routes.js', 'js/systems/state.js', 'js/systems/equipment.js',
    'js/systems/inventory.js', 'js/core/save.js'
  ].forEach(load);
  return { Game: sandbox.Game, storage };
}

function legacyItem(uid, base, ilvl, rar, affixes = []) {
  return { uid, base, ilvl, rar, affixes };
}

const saveV18 = {
  v: 18, ts: 1000, createdAt: 1,
  settings: { lang: 'zh-CN' },
  roster: {
    primaryActorId: 'player-main', activeParty: ['player-main'],
    actors: {
      'player-main': {
        id: 'player-main', archetypeId: 'adventurer', classId: 'fighter',
        level: 16, exp: 0, skillPoints: 0, talentRanks: {}, permanentUpgrades: {},
        persistentResources: { hp: 100 },
        loadout: {
          equipment: { weapon: 'old:w', armor: 'old:a', ring: 'old:r' },
          lockedSlots: { weapon: true, armor: false, ring: true }
        }
      }
    }
  },
  economy: { gold: 500, crystal: 7 },
  inv: {
    items: [
      legacyItem('old:w', 'weapon', 10, 1, [{ id: 'atk_flat', v: 9 }]),
      legacyItem('old:a', 'armor', 12, 2, [{ id: 'hp_flat', v: 40 }]),
      legacyItem('old:r', 'ring', 14, 3, [{ id: 'crit', v: .04 }]),
      legacyItem('old:spare', 'weapon', 11, 2),
      legacyItem('old:legend', 'ring', 15, 4)
    ],
    potions: { potion_small: 0, potion_large: 0 }, materials: {}, uidSeq: 30
  },
  world: {
    region: 'grassland', worldSeed: 8080, regionTier: 1,
    merchants: {
      regions: {
        grassland: {
          activeEvent: {
            id: 'merchant:grassland:1:12345678', seed: 77, stockRevision: 2,
            offers: [{ kind: 'gear', item: legacyItem('offer:old', 'weapon', 16, 1) }]
          }
        }
      }
    }
  },
  meta: { stats: {}, ach: {} }
};

const { Game, storage } = boot(saveV18);
const expectedGold = 500 + Game.F.sellPrice(11, 2);
const expectedCrystal = 7 + Game.F.salvageCrystal(15);
const migrated = Game.save.load();

assert.equal(migrated.v, 19);
assert.equal(migrated.meta.migrationV19Equipment.completed, true);
assert.equal(migrated.meta.migrationV19Equipment.compensated, true);
assert.equal(migrated.economy.gold, expectedGold);
assert.equal(migrated.economy.crystal, expectedCrystal);
assert.equal(migrated.inv.items.length, 5);
assert.ok(migrated.inv.items.every((item) => item.schemaVersion === 2));
assert.ok(migrated.inv.items.every((item) => Game.equipment.validateItem(item).ok));
assert.equal(migrated.inv.items.some((item) => item.uid === 'old:spare'), false);
assert.equal(migrated.inv.items.some((item) => item.uid === 'old:legend'), false);

const record = migrated.roster.actors['player-main'];
assert.equal(record.loadout.equipment.weapon, 'old:w');
assert.equal(record.loadout.equipment.body, 'old:a');
assert.equal(record.loadout.equipment.accessory, 'old:r');
assert.equal(record.loadout.equipment.head, 'eq:migration-v19:player-main:head');
assert.equal(record.loadout.equipment.feet, 'eq:migration-v19:player-main:feet');
assert.deepEqual(JSON.parse(JSON.stringify(record.loadout.lockedSlots)), {
  weapon: true, head: false, body: false, feet: false, accessory: true
});

const byUid = Object.fromEntries(migrated.inv.items.map((item) => [item.uid, item]));
assert.equal(byUid['old:w'].itemLevel, 10);
assert.equal(byUid['old:w'].rarityId, 'fine');
assert.equal(byUid['old:a'].itemLevel, 12);
assert.equal(byUid['old:a'].rarityId, 'rare');
assert.equal(byUid['old:r'].itemLevel, 14);
assert.equal(byUid['old:r'].rarityId, 'epic');
assert.equal(byUid['eq:migration-v19:player-main:head'].itemLevel, 12);
assert.equal(byUid['eq:migration-v19:player-main:head'].rarityId, 'rare');
assert.equal(byUid['eq:migration-v19:player-main:feet'].itemLevel, 12);
assert.equal(byUid['eq:migration-v19:player-main:feet'].rarityId, 'rare');
assert.equal(migrated.world.merchants.regions.grassland.activeEvent.offers[0].item.schemaVersion, 2);

const snapshot = JSON.stringify({
  economy: migrated.economy, items: migrated.inv.items,
  ledger: migrated.meta.migrationV19Equipment
});
storage.set('firpg_save', JSON.stringify(migrated));
const replay = Game.save.load();
assert.equal(JSON.stringify({
  economy: replay.economy, items: replay.inv.items,
  ledger: replay.meta.migrationV19Equipment
}), snapshot, 'v19 migration and compensation must execute exactly once');

console.log('Equipment migration tests passed: deterministic replacement, compensation, lock mapping and one-time ledger.');
