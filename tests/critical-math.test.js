'use strict';

const assert = require('node:assert/strict');
const { bootEquipmentRuntime } = require('./helpers/equipment-runtime');

const { Game } = bootEquipmentRuntime();
const crit = (chance, roll, extra = {}) => Game.combatMath.resolveCrit({
  critChance: chance, critMultiplier: 2, random: () => roll, ...extra
});

assert.equal(crit(0, 0).critTier, 0);
assert.equal(crit(.2, .19).critTier, 1);
assert.equal(crit(.2, .2).critTier, 0);
assert.equal(crit(1, .999).critTier, 1);
assert.equal(crit(1.45, .44).critTier, 2);
assert.equal(crit(1.45, .45).critTier, 1);
assert.equal(crit(2.45, .44).critTier, 3);
assert.equal(crit(2.45, .45).critTier, 2);
assert.equal(crit(1.45, .44).critMultiplierApplied, 4);
assert.equal(crit(2.45, .44).critMultiplierApplied, 8);
assert.equal(crit(1.45, .44, { critAvoidance: .5 }).critTier, 1);

const heal = crit(4.5, .99, { healing: true });
assert.equal(heal.critTier, 1);
assert.equal(heal.critMultiplierApplied, 1.5);
assert.equal(crit(4.5, 0, { canCrit: false }).critTier, 0);

const saturated = Game.combatMath.resolveCrit({
  critChance: 1000, critMultiplier: 1000, random: () => 0
});
assert.equal(saturated.numericSaturated, true);
assert.equal(saturated.critMultiplierApplied, 1e300);
assert.ok(Number.isFinite(saturated.critMultiplierApplied));

for (let tier = 1; tier <= 8; tier++) {
  const low = Game.combatMath.mitigate(100, 40, tier);
  const high = Game.combatMath.mitigate(10000, 40, tier);
  assert.ok(low.reduction >= 0 && low.reduction <= .8);
  assert.equal(low.reduction, high.reduction);
  assert.ok(Math.abs(high.amount / low.amount - 100) < 1e-10);
  assert.ok(Math.abs(low.constant - 16 * Math.pow(1.9, tier - 1)) < 1e-10);
}

console.log('Critical math tests passed: tier overflow, healing cap, saturation and tier-scaled mitigation.');
