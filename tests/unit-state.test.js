'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sandbox = {
  console, window: null,
  document: {
    documentElement: { lang: 'zh-CN' },
    querySelector: () => null,
    querySelectorAll: () => []
  },
  navigator: { language: 'zh-CN' },
  localStorage: { getItem: () => null, setItem() {} },
  location: { reload() {} },
  matchMedia: () => ({ matches: false }),
  Math, Number, Date, Object, Array, String, Boolean, JSON, Uint8Array, Uint32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(read(file), sandbox, { filename: file });
}

[
  'js/core/utils.js', 'js/core/eventbus.js', 'js/core/registry.js',
  'js/core/content/rules.js', 'js/core/content/schemas.js',
  'js/core/content/compiler.js', 'js/core/content/audit.js',
  'js/core/content/registry.js', 'js/i18n/i18n.js',
  'js/i18n/zh-CN.js', 'js/i18n/en.js',
  'js/i18n/combat-v2-zh-CN.js', 'js/i18n/combat-v2-en.js',
  'js/core/assets.js', 'js/sprites/palettes.js', 'js/sprites/hero.js',
  'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js',
  'js/sprites/props.js', 'js/sprites/exploration_v3.js',
  'js/data/formulas.js', 'js/data/affixes.js', 'js/data/items.js',
  'js/data/classes.js', 'js/data/skills.js', 'js/data/monsters.js',
  'js/data/regions.js', 'js/data/routes.js', 'js/data/packs/manifest.js'
].forEach(load);
sandbox.Game.CONTENT_PACK_FILES.forEach(load);
sandbox.Game.content.finalize({ strict: true });
[
  'js/systems/routes.js', 'js/systems/state.js', 'js/systems/inventory.js',
  'js/systems/actors/relations.js', 'js/systems/actors/parties.js',
  'js/systems/actors/roster.js', 'js/systems/actors/actors.js'
].forEach(load);

const Game = sandbox.Game;

function spawnPlayer(classId, talentId) {
  Game.actors.reset();
  Game.state = Game.State.newGame();
  Game.state.player.classId = classId;
  Game.state.player.level = 14;
  if (talentId) Game.state.player.skills[talentId] = 10;
  Game.player.recalc();
  Game.state.player.hp = Game.state.derived.maxHp;
  return Game.actors.spawn({
    instanceId: 'test:player:' + classId,
    actorRecordId: 'player-main',
    transform: { x: 0, y: 0 },
    spawnSource: { kind: 'test', sourceId: 'unit-state', sequence: 1 }
  });
}

[
  ['fighter', 'ft_tough'],
  ['mage', 'mg_armor'],
  ['cleric', 'cl_faith'],
  ['ranger', 'rn_survival']
].forEach(([classId, talentId]) => {
  const actor = spawnPlayer(classId, talentId);
  const expected = Game.player.derived().maxHp;
  assert.equal(actor.components.statBlock.value('maxHp'), expected,
    classId + ' talents must be resolved exactly once');
  assert.equal(actor.components.vitals.maxHp, expected,
    classId + ' vitals must use the resolved StatBlock maximum');
  assert.equal(actor.components.vitals.hp, expected,
    classId + ' full-health record must spawn at full health');
  assert.equal(Game.units.snapshot(actor.id).maxHp, expected);

  Game.actors.refresh(actor.id);
  assert.equal(actor.components.vitals.maxHp, actor.components.statBlock.value('maxHp'),
    classId + ' refresh must preserve the StatBlock/vitals invariant');

  Game.player.recalc();
  assert.equal(actor.components.vitals.maxHp, expected,
    classId + ' legacy recalc must not apply talents a second time');
  assert.equal(Game.units.assertInvariant(actor), true);
});

const ranger = spawnPlayer('ranger', 'rn_survival');
const rangerMax = Game.player.derived().maxHp;
Game.units.setHp(ranger.id, rangerMax * 0.25);
assert.equal(Game.state.player.hp, ranger.components.vitals.hp,
  'runtime HP mutations must commit to the ActorRecord');
assert.equal(Game.units.snapshot(ranger.id).hpPct, 0.25);
Game.units.heal(ranger.id, rangerMax);
assert.equal(ranger.hp, rangerMax, 'healing must clamp to the unified maximum');
Game.state.player.hp = rangerMax * 0.5;
assert.equal(ranger.hp, rangerMax * 0.5,
  'the legacy player HP setter must route to the live Unit boundary');

Game.actors.reset();
Game.state.roster.actors['player-main'].persistentResources.hp = 0;
const defeated = Game.actors.spawn({
  instanceId: 'test:player:zero-hp',
  actorRecordId: 'player-main',
  transform: { x: 0, y: 0 },
  spawnSource: { kind: 'test', sourceId: 'unit-state-zero', sequence: 2 }
});
assert.equal(defeated.hp, 0, 'a persisted zero HP value must not be treated as missing');
assert.equal(Game.units.snapshot(defeated.id).hp, 0);

console.log('Unit state tests passed: single stat resolution, vitals invariant, record sync, zero HP.');
