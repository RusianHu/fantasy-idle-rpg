(function (root) {
'use strict';
function check(value, message) { if (!value) throw Error(message); }
function same(a, b, message) { check(JSON.stringify(a) === JSON.stringify(b), message + ': ' + JSON.stringify(a)); }
function run(Game, host, opts) {
  opts = opts || {};
  const mode = opts.control || 'auto', scenario = opts.scenario || 'normal';
  const order = Game.State.regionOrder();
  const rid = scenario.startsWith('final') ? order.at(-1) : order[1];
  const fallback = scenario.startsWith('final') ? order.at(-2) : scenario === 'third' ? order[0] : null;
  const boss = scenario.includes('boss');
  Game.transitions.settleBeforeSave();
  Game.state.settings.controlMode = mode;
  Game.state.settings.effects = !opts.reduced;
  Game.state.settings.autoBoss = false;
  Game.state.settings.autoAdvance = false;
  for (const id of order) Game.State.regionProg(id).cleared = true;
  Game.state.world.finalRegionLocked = false;
  Game.state.world.region = rid;
  Game.state.world.mode = 'battle';
  Game.world.init(rid);
  Game.units.restore(Game.world.hero);
  Game.state.world.deathsRow = scenario === 'third' ? 2 : 1;
  const hero = Game.world.hero;
  let target;
  if (boss) {
    // Actual registered Boss actors/lease, with a controlled challenge setup.
    const mounted = Game.population.mountChannel(rid, 'boss', Game.world.layout, {
      tier: Game.State.regionTier(rid), worldSeed: Game.state.world.worldSeed
    })[0];
    check(mounted && mounted.primary, 'registered boss must mount');
    mounted.actors.forEach(actor => Game.world.attachActor(actor, 'death-test'));
    target = Game.world.bossEnt = mounted.primary;
  } else target = Game.actors.query({ category: 'monster' }).find(actor => actor.spawnId && !actor.boss);
  check(target, 'real hostile target');
  hero.x = target.x; hero.y = target.y;
  check(Game.world.startEncounter(target), 'production engagement mounts encounter');
  const encounter = Game.encounters.get(hero.encounterId);
  const counts = { death: 0, revive: 0, bossFailed: 0, relocked: 0 };
  const bindings = Object.entries({ 'player:death': 'death', 'player:revived': 'revive', 'boss:failed': 'bossFailed', 'region:relocked': 'relocked' })
    .map(([event, key]) => [event, Game.bus.on(event, () => counts[key]++)]);
  const before = Game.state.meta.stats.deaths;
  const firstKills = order.map(id => Game.State.regionProg(id).firstKill);
  const rewards = [Game.state.player.gold, Game.state.player.crystal, Game.state.player.exp];
  const duplicate = { targetActorIds: [hero.id], sourceActorId: target.id, payload: {} };
  let reentered = false;
  const reenter = Game.bus.on('encounter:ended', () => {
    if (!reentered) { reentered = true; Game.bus.emit('actor:defeated', duplicate); Game.world.onHeroDeath(); }
  });
  check(Game.combat.defeat(hero.id, { encounterId: encounter.id, sourceActorId: target.id }), 'combat accepts defeat');
  check(reentered, 'reentry probe reaches the settlement callback');
  Game.bus.off('encounter:ended', reenter);
  same(Game.state.meta.stats.deaths, before + 1, 'real combat death counts once');
  same(counts.death, 1, 'death notification emitted once');
  const initial = Game.transitions.snapshot();
  check(initial && initial.kind === 'death' && initial.phase === 'down', 'real death enters director');
  same(initial.fallbackRid, fallback, 'fallback destination');
  same(initial.byBoss, boss, 'boss defeat identity');
  same(counts.bossFailed, boss ? 1 : 0, 'boss failure once');
  same(counts.relocked, scenario.startsWith('final') ? 1 : 0, 'final relock once');
  same(Game.state.world.deathsRow, scenario.startsWith('final') || scenario === 'third' ? 0 : boss ? 1 : 2, 'loss streak');
  same(hero.encounterId, null, 'defeat detaches the hero');
  if (boss) { same(Game.world.bossEnt, null, 'boss removed'); check(!Game.actors.get(target.id), 'boss actor despawned'); }
  const phases = [];
  for (let i = 0; i < 180 && Game.transitions.isActive(); i++) {
    const phase = Game.transitions.snapshot().phase;
    if (!phases.includes(phase)) phases.push(phase);
    Game.bus.emit('actor:defeated', duplicate); Game.world.onHeroDeath();
    if (opts.hideAt === phase) {
      host.visibility(true); host.pump(10); host.visibility(false);
    } else if (opts.saveAt === phase) {
      check(Game.save.save('death-boundary'), 'mid-death save succeeds');
      return { counts, phase, save: host.storage.get('firpg_save'), expectedRegion: fallback || rid, expectedDeaths: before + 1 };
    } else host.pump(1);
  }
  same(Game.transitions.snapshot(), null, 'death completes through production RAF');
  if (!opts.hideAt) same(phases, ['down', 'soul', 'land', 'recover', 'rise'], 'all five production phases');
  same(Game.state.world.region, fallback || rid, 'actual committed destination');
  same(Game.state.meta.stats.deaths, before + 1, 'duplicate events never recount');
  same(counts.revive, 1, 'revival emitted once');
  check(Game.world.hero.hp > 0 && !Game.world.hero.dead, 'revived actor active');
  same(Game.state.world.mode, mode === 'manual' ? 'rest' : 'battle', 'control mode restored');
  same(order.map(id => Game.State.regionProg(id).firstKill), firstKills, 'first kill records preserved');
  check([Game.state.player.gold, Game.state.player.crystal, Game.state.player.exp].every((value, i) => value >= rewards[i]), 'death has no currency or experience penalty');
  Game.bus.emit('actor:defeated', duplicate); Game.world.onHeroDeath();
  same(Game.state.meta.stats.deaths, before + 1, 'late defeat after revival ignored');
  bindings.forEach(([event, fn]) => Game.bus.off(event, fn));
  return { scenario, mode, reduced: !!opts.reduced, phases, counts, region: Game.state.world.region };
}
function runEdges(Game, host) {
  Game.state.settings.controlMode = 'manual'; Game.state.settings.autoBoss = false;
  const hero = Game.world.hero, before = Game.state.meta.stats.deaths;
  for (let i = 0; i < 3; i++) {
    Game.world.setMode('battle');
    const target = Game.actors.query({ category: 'monster' }).find(actor => actor.spawnId && !actor.dead);
    hero.x = target.x; hero.y = target.y;
    check(Game.world.startEncounter(target), 'repeat death encounter');
    check(Game.combat.defeat(hero.id, { encounterId: hero.encounterId }), 'repeat defeat accepted');
    for (let n = 0; n < 180 && Game.transitions.isActive(); n++) host.pump(1);
    check(Game.world.hero === hero && !hero.dead, 'same actor revives between deaths');
    same(Game.state.meta.stats.deaths, before + i + 1, 'new death is not suppressed by old claim');
  }
  const director = Game.transitions;
  Game.transitions = null;
  Game.units.defeat(hero); Game.world.onHeroDeath(); Game.world.onHeroDeath();
  same(Game.state.meta.stats.deaths, before + 4, 'legacy fallback settlement once');
  for (let i = 0; i < 180 && hero.dead; i++) host.pump(1);
  check(!hero.dead && hero.hp > 0, 'legacy fallback revives');
  Game.transitions = director;
  Game.effects.resolveExternal({ targetIds: [hero.id], effects: [{ type: 'damage', damageTypeId: 'true', amount: 1000000, canCrit: false }] });
  same(Game.state.meta.stats.deaths, before + 5, 'lethal external effect enters world death');
  check(Game.transitions.snapshot().kind === 'death', 'external hazard death director');
  Game.transitions.settleBeforeSave();
  return { repeatedDeaths: 3, legacyFallback: true, externalLethalDamage: true };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { run, runEdges };
else root.DeathScenarios = { run, runEdges };
})(globalThis);
