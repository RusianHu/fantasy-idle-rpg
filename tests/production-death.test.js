'use strict';
const assert = require('node:assert/strict');
const { bootWorldRuntime } = require('./helpers/world-runtime');
const scenarios = require('./helpers/death-scenarios');
let count = 0;
for (const scenario of ['normal', 'boss', 'third', 'final-normal', 'final-boss']) {
  for (const control of ['auto', 'manual']) for (const reduced of [false, true]) {
    const host = bootWorldRuntime();
    scenarios.run(host.Game, host, { scenario, control, reduced }); count++;
  }
}
for (const hideAt of ['down', 'soul', 'land', 'recover', 'rise']) {
  const host = bootWorldRuntime();
  scenarios.run(host.Game, host, { scenario: 'third', hideAt }); count++;
}
console.log('[production-death] ' + count + ' production-loop defeat/fallback/duplicate/reentry/lifecycle cases');
let restored = 0;
for (const scenario of ['normal', 'boss', 'third', 'final-normal', 'final-boss']) {
  for (const saveAt of ['down', 'soul', 'land', 'recover', 'rise']) {
    const host = bootWorldRuntime();
    const pending = scenarios.run(host.Game, host, { scenario, saveAt });
    assert.equal(host.Game.transitions.snapshot().phase, saveAt, 'saving must not skip the live ceremony');
    const fresh = bootWorldRuntime({ save: pending.save });
    assert.equal(fresh.Game.transitions.snapshot().phase, 'land', 'cold recovery resumes at camp landing');
    assert.equal(fresh.Game.world.hero.dead, true, 'pending recovery restores canonical defeat state');
    fresh.Game.transitions.update(.45);
    assert.equal(fresh.Game.transitions.snapshot().phase, 'recover');
    assert.equal(fresh.Game.world.hero.hp, 0, 'exact start of the recovery curve');
    assert.equal(fresh.Game.units.assertInvariant(fresh.Game.world.hero), true);
    assert.equal(fresh.Game.state.meta.stats.deaths, pending.expectedDeaths, 'cold boot does not recount death');
    fresh.pump(130);
    assert.equal(fresh.Game.transitions.snapshot(), null);
    assert.equal(fresh.Game.state.world.region, pending.expectedRegion, 'pending fallback survives reload');
    assert.equal(fresh.Game.state.meta.stats.deaths, pending.expectedDeaths);
    assert.ok(fresh.Game.world.hero.hp > 0 && !fresh.Game.world.hero.dead);
    assert.equal(fresh.Game.save.serialize().world.deathRecovery, null, 'completed transaction is removed');
    restored++;
  }
}
console.log('[production-death] ' + restored + ' independent-runtime save/reload boundaries');
const edgeHost = bootWorldRuntime();
scenarios.runEdges(edgeHost.Game, edgeHost);
const healthy = edgeHost.Game.save.serialize();
for (const deathRecovery of [null, {}, { fromRid: 'missing', fallbackRid: null },
  { fromRid: 'grassland', fallbackRid: 'darkcastle', arrivalMode: 'battle' }]) {
  const data = JSON.parse(JSON.stringify(healthy));
  data.world.deathRecovery = deathRecovery;
  const restored = bootWorldRuntime({ save: JSON.stringify(data) });
  assert.equal(restored.Game.state.world.deathRecovery, null, 'invalid transaction discarded');
  assert.equal(restored.Game.transitions.snapshot(), null, 'healthy or legacy save does not revive again');
}
console.log('[production-death] repeated same-actor deaths, legacy fallback, lethal hazard and invalid/legacy saves');
