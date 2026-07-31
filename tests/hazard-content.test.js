'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PRODUCTION_CONTENT_FILES } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const sandbox = {
  console, window: null,
  document: { documentElement: { lang: 'zh-CN' }, querySelector: () => null, querySelectorAll: () => [] },
  navigator: { language: 'zh-CN' }, localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  Math, Number, Date, Object, Array, String, Boolean, JSON, Uint8Array, Uint32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of PRODUCTION_CONTENT_FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}
const Game = sandbox.Game;
const audit = Game.content.finalize({ strict: true });
assert.equal(audit.ok, true);

const regions = ['grassland', 'forest', 'mine', 'graveyard', 'snowpass', 'lavacave', 'skyruins', 'darkcastle'];
const normals = [
  'boar_thornback', 'goblin_trapper', 'beetle_mossback', 'shaman_mosscap',
  'crawler_crystalback', 'kobold_sapper', 'hound_grave', 'ghoul_gravedigger',
  'goat_frosthorn', 'gnoll_rime_trapper', 'slug_magma', 'cultist_cinder',
  'manta_aether', 'artificer_ruin', 'hound_abyssal', 'gaoler_demon'
];
const summons = [
  'summon.snare_trap', 'summon.spore_pod', 'summon.powder_keg', 'summon.crawling_hand',
  'summon.rimejaw_trap', 'summon.ember_totem', 'summon.storm_pylon', 'summon.soul_cage'
];

assert.equal(Game.content.all('hazardProfile').length, 16);
assert.equal(Game.content.all('hazardVisualProfile').length, 16);
assert.equal(Game.contentSchemas.defaults.hazardProfile.detection.revealChance, 1,
  'external Hazard content remains backward compatible by default');
assert.equal(Game.content.all('hazardProfile').filter((profile) => profile.category === 'damageTrap').length, 8);
assert.equal(Game.content.all('hazardProfile').filter((profile) => profile.category === 'ambushTrigger').length, 8);

for (const id of normals) {
  const actor = Game.content.get('actorArchetype', id);
  assert.ok(actor, `${id} is a registered Actor`);
  assert.equal(actor.category, 'monster');
  assert.equal(Game.assets.has(actor.presentation.spriteId), true, `${id} sprite is registered`);
}
for (const id of summons) {
  const actor = Game.content.get('actorArchetype', id);
  const spawn = Game.content.get('worldSpawnProfile', `spawn.${id}`);
  assert.ok(actor && spawn, `${id} has Actor and authoring spawn declarations`);
  assert.equal(actor.category, 'summon');
  assert.equal(actor.rewardProfileId, 'reward.none');
  assert.equal(spawn.summonOnly, true);
  assert.deepEqual(Array.from(spawn.mountTo), [], `${id} is not mounted to Population`);
  assert.equal(Game.assets.has(actor.presentation.spriteId), true, `${id} sprite is registered`);
}

for (const regionId of regions) {
  const region = Game.content.get('regionProfile', regionId);
  const population = Game.content.get('worldPopulationProfile', `population.${regionId}`);
  const encounter = Game.content.get('encounterProfile', `encounter.${regionId}`);
  assert.ok(region && population && encounter);
  assert.equal(region.projection.monsters.length, 4, `${regionId} has four persistent monsters`);
  assert.equal(region.projection.summons.length, 1, `${regionId} has one summon`);
  assert.equal(region.projection.hazards.length, 2, `${regionId} has two Hazards`);
  assert.equal(region.hazardProfileIds.length, 2);
  assert.equal(encounter.encounterPackIds.length, 8, `${regionId} has eight weighted Packs`);
  assert.equal(encounter.packs.reduce((total, pack) => total + pack.weight, 0), 100);
  assert.equal(population.offlineRepresentative.encounterPackId, `${regionId}.solo-c`);
  assert.equal(population.offlineRepresentative.secondaryEncounterPackId, `${regionId}.solo-d`);

  const regularMounts = Game.content.populationView(`population.${regionId}`).channels.regular.spawnRefs;
  assert.equal(regularMounts.some((mount) => {
    const profile = Game.content.get('worldSpawnProfile', mount.profileId);
    const pack = profile && Game.content.get('encounterPack', profile.encounterPackId);
    return pack && pack.members.some((member) => summons.includes(member.archetypeId));
  }), false);
  const hazards = region.hazardProfileIds.map((id) => Game.content.get('hazardProfile', id));
  assert.deepEqual(Array.from(hazards, (profile) => profile.category).sort(), ['ambushTrigger', 'damageTrap']);
  for (const hazard of hazards) {
    assert.equal(hazard.regionId, regionId);
    assert.equal(hazard.detection.revealChance, 0.25,
      `${hazard.id} uses the production early-detection pressure target`);
    assert.equal(Game.content.has('actorArchetype', hazard.id), false, `${hazard.id} is not an Actor`);
    assert.ok(Game.content.get('hazardVisualProfile', hazard.visualProfileId));
    assert.ok(Game.i18n.t(hazard.presentation.nameKey));
    Game.i18n.setLocale('en');
    assert.ok(Game.i18n.t(hazard.presentation.nameKey));
    Game.i18n.setLocale('zh-CN');
  }
}

console.log('Hazard content tests passed: 24 Actors, 16 Hazards, eight-region Pack/i18n/asset contracts.');
