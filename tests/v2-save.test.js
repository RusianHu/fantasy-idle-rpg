'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function boot(saved) {
  const storage = new Map();
  if (saved) storage.set('firpg_save', JSON.stringify(saved));
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
    location: { reload() {} },
    matchMedia: () => ({ matches: false }),
    Math, Number, Date, Object, Array, String, Boolean, JSON, Uint8Array, Uint32Array,
    setTimeout, clearTimeout, Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} }
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
    'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js', 'js/sprites/props.js',
    'js/sprites/exploration_v3.js',
    'js/data/formulas.js', 'js/data/affixes.js', 'js/data/items.js',
    'js/data/classes.js', 'js/data/skills.js', 'js/data/monsters.js',
    'js/data/regions.js', 'js/data/routes.js', 'js/data/packs/manifest.js'
  ].forEach(load);
  sandbox.Game.CONTENT_PACK_FILES.forEach(load);
  sandbox.Game.content.finalize({ strict: true });
  [
    'js/systems/routes.js', 'js/systems/state.js', 'js/systems/inventory.js',
    'js/systems/actors/relations.js', 'js/systems/actors/parties.js',
    'js/systems/actors/roster.js', 'js/systems/actors/actors.js',
    'js/core/save.js'
  ].forEach(load);
  return { Game: sandbox.Game, storage };
}

function legacy(version) {
  return {
    v: version, ts: 1000, createdAt: 1,
    settings: { lang: 'zh-CN' },
    player: {
      classId: version === 1 ? 'fighter' : 'fighter',
      level: 8, exp: 12, sp: 2, hp: 177,
      skills: { ft_heavy: 3, ft_tough: 2 },
      perms: { perm_atk: 1 }, gold: 345, crystal: 6
    },
    inv: {
      items: [], equipped: { weapon: null, armor: null, ring: null },
      lockedSlots: { weapon: true, armor: false, ring: false },
      potions: { potion_small: 2 }, materials: {}, uidSeq: 7
    },
    world: {
      region: 'grassland', regionOrder: ['grassland', 'forest', 'mine', 'graveyard',
        'snowpass', 'lavacave', 'skyruins', 'darkcastle'],
      mode: 'battle', restBuffT: 0, worldTime: 300,
      regionProg: {}, nodeCooldowns: {}, exploration: {}, deathsRow: 0
    },
    meta: { stats: {}, ach: {} }
  };
}

const v11 = boot(legacy(11));
const migrated = v11.Game.save.load();
assert.equal(migrated.v, 13);
assert.equal(migrated.player, undefined);
assert.equal(migrated.roster.actors['player-main'].talentRanks.ft_heavy, 3);
v11.Game.save.applyLoaded(migrated);
assert.equal(v11.Game.state.player.gold, 345);
assert.equal(v11.Game.state.player.skills.ft_tough, 2);
assert.equal(v11.Game.state.inv.lockedSlots.weapon, true);
assert.equal(Object.prototype.propertyIsEnumerable.call(v11.Game.state, 'player'), false);
const serialized = v11.Game.save.serialize();
assert.equal(serialized.v, 13);
assert.equal(serialized.player, undefined);
assert.ok(serialized.roster && serialized.economy);
assert.equal(v11.Game.routes.validate(serialized.world.routePlan).length, 0);
assert.equal(serialized.roster.actors['player-main'].loadout.lockedSlots.weapon, true);
assert.equal(JSON.stringify(serialized).includes('encounterId'), false);
assert.equal(JSON.stringify(serialized).includes('cooldowns'), false);

// The serialized roster is a real persistence boundary, not a primary-only view.
const multiRoster = JSON.parse(JSON.stringify(serialized));
multiRoster.roster.actors['companion-ranger'] = {
  id: 'companion-ranger',
  archetypeId: 'adventurer',
  classId: 'ranger',
  level: 9,
  exp: 3,
  skillPoints: 1,
  talentRanks: { rn_survival: 2 },
  permanentUpgrades: {},
  persistentResources: { hp: 88 },
  loadout: {
    equipment: { weapon: null, armor: null, ring: null },
    lockedSlots: { weapon: false, armor: false, ring: false }
  }
};
multiRoster.roster.activeParty = ['player-main', 'companion-ranger'];
v11.Game.save.applyLoaded(multiRoster);
assert.equal(v11.Game.state.roster.actors['companion-ranger'].classId, 'ranger');
assert.equal(v11.Game.state.roster.actors['companion-ranger'].persistentResources.hp, 88);
assert.deepEqual(
  Array.from(v11.Game.state.roster.activeParty),
  ['player-main', 'companion-ranger']
);

// Missing content degrades to a legal unclassed state and refunds invalid talents.
const degradedSave = JSON.parse(JSON.stringify(serialized));
degradedSave.roster.actors['player-main'].classId = 'removed-class';
degradedSave.roster.actors['player-main'].talentRanks = { removed_talent: 4 };
v11.Game.save.applyLoaded(degradedSave);
assert.equal(v11.Game.state.player.classId, null);
assert.equal(v11.Game.state.player.sp, 6);
assert.deepEqual(Object.keys(v11.Game.state.player.skills), []);

// Full migration chain remains executable for the oldest supported save.
const v1 = boot(legacy(1));
const oldest = v1.Game.save.load();
assert.equal(oldest.v, 13);
v1.Game.save.applyLoaded(oldest);
assert.equal(v1.Game.state.roster.primaryActorId, 'player-main');
assert.ok(v1.Game.State.normalizeRegionOrder(v1.Game.state.world.regionOrder).length >= 8);

console.log('V2 save tests passed: v1→v13 and v11→v13 migration, downgrade, route plan, transient boundary.');
