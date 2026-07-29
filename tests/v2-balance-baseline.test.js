'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const baseline = JSON.parse(read('tests/fixtures/v1-macro-baseline.json'));
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
  Math, Number, Date, Object, Array, String, Boolean, JSON, Uint32Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(file) { vm.runInContext(read(file), sandbox, { filename: file }); }

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
  'js/core/content/support.js', 'js/data/content/content.generated.js'
].forEach(load);
const Game = sandbox.Game;
Game.content.finalize({ strict: true });
[
  'js/systems/actors/relations.js', 'js/systems/actors/parties.js',
  'js/systems/actors/actors.js', 'js/systems/world_population.js',
  'js/systems/encounters.js', 'js/systems/engagement.js',
  'js/systems/combat_ai.js', 'js/systems/combat.js',
  'js/systems/combat_estimator.js'
].forEach(load);

const regions = ['grassland', 'forest', 'mine', 'graveyard', 'snowpass', 'lavacave', 'skyruins', 'darkcastle'];
Game.State = { regionTier: (id) => regions.indexOf(id) + 1 };
const classBase = {
  fighter: [190, 25, 10, 1.02, 24],
  rogue: [135, 31, 7, 1.18, 24],
  mage: [118, 35, 6, 1.08, 92],
  cleric: [150, 27, 8, 1.03, 82],
  ranger: [132, 32, 7, 1.12, 112]
};

function party(classId, tier) {
  const base = classBase[classId];
  const power = base[1] * Math.pow(1.88, tier - 1);
  return [{
    archetypeId: 'adventurer', classId, level: 5 + (tier - 1) * 8,
    factionId: 'adventurers', controllerId: 'ai:player-auto',
    statValues: {
      maxHp: base[0] * Math.pow(1.95, tier - 1),
      armor: base[2] * Math.pow(1.85, tier - 1),
      ward: base[2] * .75 * Math.pow(1.85, tier - 1),
      physicalPower: power, magicPower: power,
      accuracy: .94, gcdSpeed: base[3], castSpeed: base[3],
      autoAttackSpeed: base[3], cooldownRate: 1, moveSpeed: 56,
      range: base[4], critChance: .1, critMultiplier: 1.55,
      dodgeChance: .04, healingPower: power,
      shieldPower: base[0] * Math.pow(1.95, tier - 1),
      lifesteal: .03, statusPotency: 1, tenacity: .1,
      interruptPower: 1.2, threatMultiplier: 1, resourceRegen: 1,
      expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
    }
  }];
}

const report = {};
for (const classId of Object.keys(classBase)) {
  const normalSeconds = [];
  const bossSeconds = [];
  for (let tier = 1; tier <= regions.length; tier++) {
    const regionId = regions[tier - 1];
    const profile = Game.content.get('encounterProfile', `encounter.${regionId}`);
    let weightedSeconds = 0;
    let totalWeight = 0;
    for (const pack of profile.packs) {
      const result = Game.combatEstimator.evaluate({
        partySnapshot: party(classId, tier),
        encounterProfileId: profile.id,
        packId: pack.id,
        tier,
        tacticsProfile: 'balanced',
        sampleSeeds: [11, 29, 47],
        maxTicks: 12000
      });
      assert.ok(result.failureRate <= .25, `${classId}/${pack.id} is not hard-locked`);
      weightedSeconds += result.averageSeconds * pack.weight;
      totalWeight += pack.weight;
    }
    normalSeconds.push(weightedSeconds / totalWeight);
    const boss = Game.combatEstimator.evaluate({
      partySnapshot: party(classId, tier),
      encounterProfileId: `encounter.${regionId}.boss`,
      tier,
      tacticsProfile: 'balanced',
      sampleSeeds: [11, 29, 47],
      maxTicks: 12000
    });
    assert.ok(boss.failureRate <= .25, `${classId}/${regionId} boss is not hard-locked`);
    bossSeconds.push(boss.averageSeconds);
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const fixed = baseline.worldFixedSeconds;
  const v2CombatSeconds =
    baseline.medianThreatAnchors * (fixed.perAnchorApproach + mean(normalSeconds)) +
    fixed.guardianLairCinematic + mean(bossSeconds);
  const prior = baseline.classes[classId];
  const v2MedianMinutes =
    prior.medianMinutes + (v2CombatSeconds - prior.medianCombatSeconds) / 60;
  const delta = v2MedianMinutes / prior.medianMinutes - 1;
  assert.ok(Math.abs(delta) <= .10,
    `${classId} macro first-clear delta ${(delta * 100).toFixed(2)}% exceeds ±10%`);
  report[classId] = {
    v1Minutes: prior.medianMinutes,
    v2Minutes: v2MedianMinutes,
    deltaPct: delta * 100,
    normalSeconds: mean(normalSeconds),
    bossSeconds: mean(bossSeconds)
  };
}

console.log('V2/V1 macro balance passed:',
  Object.entries(report).map(([id, value]) =>
    `${id} ${value.deltaPct >= 0 ? '+' : ''}${value.deltaPct.toFixed(2)}%`).join(', '));
