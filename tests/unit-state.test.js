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
  'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js', 'js/sprites/monsters_expansion.js',
  'js/sprites/props.js',
  'js/sprites/ground-decorations/grassland.generated.js',
  'js/sprites/ground-decorations/forest.generated.js',
  'js/sprites/ground-decorations/mine.generated.js',
  'js/sprites/ground-decorations/graveyard.generated.js',
  'js/sprites/ground-decorations/snowpass.generated.js',
  'js/sprites/ground-decorations/lavacave.generated.js',
  'js/sprites/ground-decorations/skyruins.generated.js',
  'js/sprites/ground-decorations/darkcastle.generated.js',
  'js/sprites/exploration_v3.js',
  'js/data/formulas.js', 'js/data/affixes.js', 'js/data/items.js',
  'js/data/classes.js', 'js/data/skills.js', 'js/data/routes.js',
  'js/core/content/support.js', 'js/data/content/content.generated.js'
].forEach(load);
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

[
  ['fighter', 'ft_second', 'healthRegenPct'],
  ['rogue', 'rg_swift', 'autoAttackSpeed'],
  ['rogue', 'rg_deadly', 'critMultiplier'],
  ['rogue', 'rg_evasion', 'dodgeChance'],
  ['mage', 'mg_armor', 'armor'],
  ['cleric', 'cl_faith', 'armor'],
  ['ranger', 'rn_survival', 'autoAttackSpeed'],
  ['ranger', 'rn_treasure', 'goldMultiplier']
].forEach(([classId, talentId, statId]) => {
  const baseActor = spawnPlayer(classId);
  const before = Game.units.stat(baseActor, statId);
  const rankedActor = spawnPlayer(classId, talentId);
  const after = Game.units.stat(rankedActor, statId);
  assert.ok(after > before, `${talentId} must change ${statId}`);
});

function nestedValue(root, pathText) {
  return pathText.split('.').reduce((value, part) => value[part], root);
}
[
  ['fighter', 'ft_heavy', 'ability', 'fighter.heavy_slash', 'effects.0.params.coefficient', 'mult'],
  ['fighter', 'ft_whirl', 'ability', 'fighter.whirlwind', 'effects.0.params.coefficient', 'mult'],
  ['fighter', 'ft_warcry', 'status', 'fighter.warcry', 'modifiers.0.value', 'buff.mods.atkPct', 1],
  ['rogue', 'rg_backstab', 'ability', 'rogue.backstab', 'effects.0.params.coefficient', 'mult'],
  ['rogue', 'rg_poison', 'ability', 'rogue.poison_blade', 'effects.0.params.coefficient', 'mult'],
  ['rogue', 'rg_flurry', 'ability', 'rogue.fan_of_knives', 'effects.0.params.coefficient', 'mult'],
  ['mage', 'mg_fireball', 'ability', 'mage.fireball', 'effects.0.params.coefficient', 'mult'],
  ['mage', 'mg_nova', 'ability', 'mage.arcane_nova', 'effects.0.params.coefficient', 'mult'],
  ['mage', 'mg_barrier', 'ability', 'mage.barrier_action', 'effects.0.coefficient', 'shieldPct'],
  ['cleric', 'cl_smite', 'ability', 'cleric.smite', 'effects.0.params.coefficient', 'mult'],
  ['cleric', 'cl_prayer', 'ability', 'cleric.prayer', 'effects.0.maxHpCoefficient', 'healPct'],
  ['cleric', 'cl_nova', 'ability', 'cleric.holy_nova', 'effects.0.params.coefficient', 'mult'],
  ['ranger', 'rn_power', 'ability', 'ranger.power_shot', 'effects.0.params.coefficient', 'mult'],
  ['ranger', 'rn_multi', 'ability', 'ranger.multi_shot', 'effects.0.params.coefficient', 'mult'],
  ['ranger', 'rn_hawk', 'status', 'ranger.hawk_eye', 'modifiers.0.value', 'buff.mods.atkPct', 1]
].forEach(([classId, talentId, targetType, targetId, pathText, legacyPath, offset = 0]) => {
  const legacySkill = Game.reg.get('skill', talentId);
  const talent = Game.content.get('talent', talentId);
  assert.equal(legacySkill.unlockLv, talent.unlockLevel);
  if (legacySkill.type === 'active') {
    const abilityDef = Game.content.get('ability', talent.grants.modifyAbilityId);
    assert.equal(legacySkill.cd, (abilityDef.timing.cooldownTicks || 0) / 20,
      `${talentId} UI cooldown must match the V2 Ability`);
  }
  const baseActor = spawnPlayer(classId);
  const baseDef = targetType === 'status'
    ? Game.actors.status(baseActor, targetId)
    : Game.actors.ability(baseActor, targetId);
  const rankedActor = spawnPlayer(classId, talentId);
  const rankedDef = targetType === 'status'
    ? Game.actors.status(rankedActor, targetId)
    : Game.actors.ability(rankedActor, targetId);
  assert.ok(nestedValue(rankedDef, pathText) > nestedValue(baseDef, pathText),
    `${talentId} must change its actor-private ${targetType} path`);
  const legacyScaling = nestedValue(legacySkill, legacyPath);
  assert.ok(Math.abs(nestedValue(baseDef, pathText) - offset -
    Game.F.skillVal(legacyScaling, 0)) < 1e-9,
  `${talentId} rank-zero UI value must match runtime`);
  assert.ok(Math.abs(nestedValue(rankedDef, pathText) - offset -
    Game.F.skillVal(legacyScaling, 10)) < 1e-9,
  `${talentId} rank-ten UI value must match runtime`);
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
assert.equal(defeated.dead, true);
assert.equal(defeated.lifecycle, 'defeated');
assert.equal(defeated.components.actionState.state, 'defeated');
assert.equal(Game.units.assertInvariant(defeated), true);

Game.units.restore(defeated, { source: 'test-revive' });
assert.equal(defeated.hp, defeated.maxHp);
assert.equal(defeated.dead, false);
assert.equal(defeated.lifecycle, 'active');
assert.equal(defeated.components.actionState.state, 'idle');
assert.equal(Game.units.assertInvariant(defeated), true);

const heavyBase = spawnPlayer('fighter');
assert.equal(
  Game.actors.ability(heavyBase, 'fighter.heavy_slash').effects[0].params.coefficient,
  2.3,
  'rank-zero active talents must apply their canonical base patch'
);
const heavyRankTen = spawnPlayer('fighter', 'ft_heavy');
assert.equal(
  Game.actors.ability(heavyRankTen, 'fighter.heavy_slash').effects[0].params.coefficient,
  3.8,
  'active talent ranks must change the actor-private ability definition'
);

const mage = spawnPlayer('mage');
mage.components.resources.mana.value = 1234;
Game.units.setModifierSource(mage, 'test:external', [{
  stat: 'maxHp', phase: 'multiply', operation: 'multiply', value: 1.5
}], { hpPolicy: 'preserveRatio' });
const mageExternalMax = mage.maxHp;
Game.actors.refresh(mage.id, { hpPolicy: 'preserveRatio' });
assert.equal(mage.components.resources.mana.value, 1234,
  'refresh must preserve current values for resources that still exist');
assert.equal(mage.maxHp, mageExternalMax,
  'refresh must preserve external modifier sources');
assert.equal(Game.units.assertInvariant(mage), true);

Game.actors.reset();
const explicitSlime = Game.actors.spawn({
  instanceId: 'test:explicit-slime',
  archetypeId: 'slime_green',
  level: 1,
  statValues: { maxHp: 808, physicalPower: 246 },
  transform: { x: 0, y: 0 },
  spawnSource: { kind: 'test', sourceId: 'unit-refresh', sequence: 3 }
});
const explicitSlimeMax = explicitSlime.maxHp;
const explicitSlimePower = Game.units.stat(explicitSlime, 'physicalPower');
Game.actors.refresh(explicitSlime.id);
assert.equal(explicitSlime.maxHp, explicitSlimeMax,
  'recordless refresh must preserve spawn-time statValues');
assert.equal(Game.units.stat(explicitSlime, 'physicalPower'), explicitSlimePower);

Game.actors.reset();
Game.state = Game.State.newGame();
Game.state.player.classId = 'fighter';
Game.state.player.level = 14;
Game.player.recalc();
Game.state.player.hp = Game.state.derived.maxHp;
Game.actors.spawn({
  instanceId: 'test:unique-record-a',
  actorRecordId: 'player-main',
  spawnSource: { kind: 'test', sourceId: 'unit-record', sequence: 4 }
});
assert.throws(() => Game.actors.spawn({
  instanceId: 'test:unique-record-b',
  actorRecordId: 'player-main',
  spawnSource: { kind: 'test', sourceId: 'unit-record', sequence: 5 }
}), /record already has a live instance/,
'one ActorRecord must never bind to two live ActorInstances');

Game.actors.reset();
Game.state = Game.State.newGame();
const companionRecord = Game.roster.createRecord({
  id: 'companion-fighter',
  archetypeId: 'adventurer',
  classId: 'fighter',
  level: 14,
  talentRanks: { ft_tough: 10 }
});
const companion = Game.actors.spawn({
  instanceId: 'test:companion',
  actorRecordId: companionRecord.id,
  spawnSource: { kind: 'test', sourceId: 'unit-companion', sequence: 6 }
});
assert.ok(companion.maxHp > 1,
  'all classed ActorRecords must use the class/equipment/permanent base builder');
assert.equal(companion.hp, companion.maxHp,
  'a newly created ActorRecord without persisted HP must spawn at full health');
assert.equal(Game.units.assertInvariant(companion), true);

assert.equal(
  Game.units.stackModifier({ operation: 'multiply', value: 0.9 }, 2).value,
  0.81,
  'stacked multiplicative debuffs must use exponentiation'
);

console.log('Unit state tests passed: unified stats, lifecycle, refresh, records, talents, stacking.');
