'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function boot(seed = 0x1234ABCD) {
  const sandbox = {
    console, window: null,
    document: {
      hidden: false,
      documentElement: { lang: 'zh-CN' },
      querySelector: () => null,
      querySelectorAll: () => []
    },
    navigator: { language: 'zh-CN' },
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false }),
    Math, Number, Date, Object, Array, String, Boolean, JSON, Uint8Array, Uint32Array,
    setTimeout, clearTimeout
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
    'js/sprites/monsters_expansion.js', 'js/sprites/props.js',
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
  const Game = sandbox.Game;
  Game.content.finalize({ strict: true });
  Game.assets.sprite = () => ({ w: 16, h: 20 });
  [
    'js/systems/routes.js', 'js/systems/state.js', 'js/systems/inventory.js'
  ].forEach(load);
  Game.state = Game.State.newGame();
  Game.state.world.worldSeed = seed >>> 0;
  Game.state.world.region = 'grassland';
  Game.state.settings.autoEquip = false;
  Game.player.setClass('fighter');
  Game.state.player.gold = 1e9;

  const actors = {};
  const leases = {};
  let spawnSequence = 0;
  Game.actors = {
    get(id) { return actors[id] || null; },
    despawn(id) { delete actors[id]; },
    reset() {
      Object.keys(actors).forEach((id) => delete actors[id]);
    }
  };
  Game.population = {
    materialize(profileId, context) {
      const id = `merchant-test-${++spawnSequence}`;
      const spawnId = `spawn-test-${spawnSequence}`;
      const actor = {
        id,
        tags: ['merchant', 'wandering-merchant'],
        x: context.x,
        y: context.y,
        hp: 100,
        maxHp: 100,
        state: 'idle',
        components: {
          actionState: { state: 'idle' },
          transform: { x: context.x, y: context.y }
        }
      };
      actors[id] = actor;
      leases[spawnId] = { spawnId, actorIds: [id] };
      return { ok: true, primary: actor, actors: [actor], lease: leases[spawnId] };
    },
    lease(id) { return leases[id] || null; },
    close(id) {
      const lease = leases[id];
      if (!lease) return false;
      lease.actorIds.forEach((actorId) => delete actors[actorId]);
      delete leases[id];
      return true;
    },
    stableKey() { return null; }
  };
  Game.world = {
    region: Game.reg.get('region', 'grassland'),
    layout: { version: 3, world: { w: 900, h: 520 } },
    hero: {
      id: 'hero', actorRecordId: 'player-main',
      x: 300, y: 240, hp: 100, maxHp: 100,
      state: 'idle', interactOrder: null, encounterId: null
    },
    entities: [],
    bossEnt: null,
    attachActor(actor) {
      this.entities.push(actor);
      return true;
    },
    detachActor(id) {
      this.entities = this.entities.filter((actor) => actor.id !== id);
      return true;
    }
  };
  Game.transitions = { isActive: () => false };
  Game.ending = { isActive: () => false };
  Game.entryState = 'active';
  load('js/systems/merchants.js');
  const discovered = Game.merchants.debugForceDiscover();
  assert.equal(discovered.ok, true);
  assert.ok(discovered.actor, JSON.stringify(Game.merchants.runtime()));
  const context = () => ({
    available: true,
    providerType: 'merchant',
    providerId: discovered.event.merchantProfileId,
    eventId: Game.merchants.activeEvent() && Game.merchants.activeEvent().id,
    offerSetId: Game.merchants.activeEvent() && Game.merchants.activeEvent().id,
    regionId: Game.state.world.region,
    areaId: 'merchant-test-area',
    catalogs: ['merchant-event']
  });
  return { Game, context };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function bootCombatMerchant(seed = 0xA11CE55) {
  const sandbox = {
    console, window: null,
    document: {
      hidden: false,
      documentElement: { lang: 'zh-CN' },
      querySelector: () => null,
      querySelectorAll: () => []
    },
    navigator: { language: 'zh-CN' },
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false }),
    Math, Number, Date, Object, Array, String, Boolean, JSON, Uint8Array, Uint32Array,
    setTimeout, clearTimeout
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
    'js/sprites/monsters_expansion.js', 'js/sprites/props.js',
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
  const Game = sandbox.Game;
  Game.content.finalize({ strict: true });
  Game.assets.sprite = () => ({ w: 16, h: 20 });
  [
    'js/systems/routes.js', 'js/systems/state.js', 'js/systems/inventory.js',
    'js/systems/actors/relations.js', 'js/systems/actors/parties.js',
    'js/systems/actors/actors.js', 'js/systems/world_population.js',
    'js/systems/encounters.js', 'js/systems/engagement.js',
    'js/systems/combat_ai.js', 'js/systems/combat.js'
  ].forEach(load);
  Game.state = Game.State.newGame();
  Game.state.world.worldSeed = seed >>> 0;
  Game.state.world.region = 'grassland';
  Game.state.world.mode = 'battle';
  Game.state.settings.autoEquip = false;
  Game.player.setClass('fighter');
  Game.state.player.gold = 1e9;
  Game.population.reset('grassland');
  Game.parties.create({ id: 'party-player', maxMembers: 4 });
  const hero = Game.actors.spawn({
    instanceId: 'merchant-combat-hero',
    archetypeId: 'adventurer',
    classId: 'fighter',
    factionId: 'adventurers',
    controllerId: 'player',
    tier: 1,
    statValues: {
      maxHp: 240, armor: 15, ward: 10,
      physicalPower: 80, magicPower: 20,
      accuracy: 1, gcdSpeed: 1, castSpeed: 1,
      autoAttackSpeed: 1, cooldownRate: 1, moveSpeed: 56,
      range: 24, critChance: 0, critMultiplier: 1.5,
      dodgeChance: 0, healingPower: 20, shieldPower: 240,
      lifesteal: 0, statusPotency: 1, tenacity: 0.1,
      interruptPower: 1, threatMultiplier: 1, resourceRegen: 1,
      expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
    },
    transform: { x: 300, y: 240 }
  });
  hero.actorRecordId = Game.state.roster.primaryActorId;
  Game.world = {
    region: Game.reg.get('region', 'grassland'),
    layout: { version: 3, world: { w: 900, h: 520 } },
    hero,
    entities: [hero],
    bossEnt: null,
    attachActor(actor) {
      if (!this.entities.some((entry) => entry.id === actor.id)) this.entities.push(actor);
      return true;
    },
    detachActor(id) {
      this.entities = this.entities.filter((actor) => actor.id !== id);
      return true;
    }
  };
  Game.transitions = { isActive: () => false };
  Game.ending = { isActive: () => false };
  Game.entryState = 'active';
  load('js/systems/merchants.js');
  const discovered = Game.merchants.debugForceDiscover();
  assert.equal(discovered.ok, true);
  if (!discovered.actor) {
    const profile = Game.content.get('merchantProfile', discovered.event.merchantProfileId);
    const probe = Game.population.materialize(profile.spawnProfileId, {
      regionId: 'grassland',
      populationId: 'merchant-runtime-probe',
      layoutSlotKey: 'probe',
      spawnRequestKey: 'probe',
      x: discovered.event.x,
      y: discovered.event.y,
      tier: 1,
      rewardMultiplier: 0
    });
    assert.fail(JSON.stringify({
      runtime: Game.merchants.runtime(),
      reason: probe.reason,
      error: String(probe.error && probe.error.stack || probe.error || '')
    }));
  }
  assert.equal(discovered.event.state, 'available');
  assert.equal(discovered.actor.id, Game.merchants.runtime().actorId);
  assert.ok(Game.world.hero);
  const queued = Game.merchants.attack(discovered.actor);
  assert.equal(queued.ok, true, queued.reason);
  const committed = Game.engagement.advanceTick()[0];
  assert.equal(committed.ok, true, committed.reason);
  assert.equal(Game.merchants.activeEvent().state, 'assault');
  return {
    Game,
    hero,
    merchant: Game.actors.get(discovered.actor.id),
    encounter: Game.encounters.get(committed.encounterId)
  };
}

const deterministicA = boot();
const deterministicB = boot();
assert.equal(deterministicA.Game.content.all('merchantProfile').length, 4);
assert.equal(
  deterministicA.Game.merchants.profileForRegion('grassland').id,
  'merchant.windbell_lia'
);
assert.deepEqual(
  plain(deterministicA.Game.merchants.activeEvent().offers),
  plain(deterministicB.Game.merchants.activeEvent().offers),
  'same seed, region, and ordinal produce byte-equivalent stock'
);

const h = deterministicA;
let event = h.Game.merchants.activeEvent();
assert.equal(event.offers.length, 8);
assert.deepEqual(
  event.offers.reduce((out, offer) => {
    out[offer.role] = (out[offer.role] || 0) + 1;
    return out;
  }, {}),
  { staple: 2, travel: 4, signature: 1, rare: 1 }
);
assert.equal(event.offers.every((offer) => offer.kind !== 'gear' || offer.item.uid === null), true);
const initialRemaining = event.remainingSeconds;
h.Game.merchants.setCatchupPaused(true);
h.Game.merchants.update(120);
assert.equal(event.remainingSeconds, initialRemaining, 'offline catch-up cannot consume a meeting');
h.Game.merchants.setCatchupPaused(false);
h.Game.merchants.update(1);
assert.equal(event.remainingSeconds, initialRemaining - 1);

h.Game.merchants.debugSetTrust(75);
assert.equal(h.Game.merchants.trustBand(), 'favored');
assert.equal(h.Game.merchants.priceMultiplier(), 0.9);
assert.equal(h.Game.merchants.offers(h.context()).length, 8);
h.Game.merchants.debugSetTrust(30);
assert.equal(h.Game.merchants.trustBand(), 'wary');
assert.equal(h.Game.merchants.priceMultiplier(), 1.15);
assert.equal(h.Game.merchants.offers(h.context()).length, 6, 'wary trust hides cabinet slots');
h.Game.merchants.debugSetTrust(10);
assert.equal(h.Game.merchants.offers(h.context()).length, 0);
assert.equal(
  h.Game.merchants.canBuy({ id: event.offers[0].id }, h.context()).reason,
  'refused'
);

h.Game.merchants.debugSetTrust(50);
const beforeHaggle = plain(event.offers);
const haggleGold = h.Game.state.player.gold;
const haggle = h.Game.merchants.haggle(h.context());
assert.equal(haggle.ok, true);
assert.equal(event.haggled, true);
assert.equal(h.Game.state.player.gold, haggleGold - haggle.fee);
for (const index of [0, 1, 6, 7]) {
  assert.deepEqual(plain(event.offers[index]), beforeHaggle[index]);
}
assert.notDeepEqual(
  plain(event.offers.slice(2, 6)),
  beforeHaggle.slice(2, 6),
  'paid haggle changes only travel slots'
);
assert.equal(h.Game.merchants.haggle(h.context()).reason, 'used');

const buyOffer = h.Game.merchants.offers(h.context())[0];
const beforeQuantity = event.offers[0].quantity;
const firstBuy = h.Game.merchants.buy(buyOffer.id, h.context());
assert.equal(firstBuy.ok, true);
assert.equal(event.offers[0].quantity, beforeQuantity - 1);
assert.equal(h.Game.merchants.guild().trust, 55, 'first purchase in visit grants trust once');
const secondBuy = h.Game.merchants.buy(buyOffer.id, h.context());
assert.equal(secondBuy.ok, true);
assert.equal(h.Game.merchants.guild().trust, 55);

const violence = boot(0xDEADBEEF);
event = violence.Game.merchants.activeEvent();
const baseDebt = violence.Game.F.gearBoxPrice(violence.Game.state.player.level);
assert.equal(violence.Game.merchants.debugCommitAssault().ok, true);
assert.equal(event.state, 'assault');
assert.equal(violence.Game.merchants.guild().trust, 25);
assert.equal(violence.Game.merchants.guild().debtGold, baseDebt);
assert.equal(violence.Game.merchants.debugForceSurrender().ok, true);
assert.equal(event.state, 'surrendered');
const robberyOffer = event.offers.find((offer) => offer.eligibleRobbery);
const robberyPrice = Math.round(
  robberyOffer.basePrice * violence.Game.merchants.priceMultiplier()
);
const robbed = violence.Game.merchants.resolveSurrender('rob', robberyOffer.id);
assert.equal(robbed.ok, true);
assert.equal(violence.Game.merchants.guild().trust, 10);
assert.equal(
  violence.Game.merchants.guild().debtGold,
  baseDebt + robberyPrice * 2
);
assert.equal(violence.Game.merchants.activeEvent(), null);
const restitution = violence.Game.merchants.payRestitution();
assert.equal(restitution.ok, true);
assert.equal(violence.Game.merchants.guild().debtGold, 0);
assert.equal(violence.Game.merchants.guild().trust, 20);

const mercy = boot(0xCAFEBABE);
mercy.Game.merchants.debugCommitAssault();
mercy.Game.merchants.debugForceSurrender();
const spared = mercy.Game.merchants.resolveSurrender('spare');
assert.equal(spared.ok, true);
assert.equal(mercy.Game.merchants.guild().trust, 35);
assert.equal(
  mercy.Game.merchants.guild().debtGold,
  Math.ceil(mercy.Game.F.gearBoxPrice(mercy.Game.state.player.level) / 2)
);

const escapeCombat = bootCombatMerchant();
escapeCombat.Game.units.setHp(
  escapeCombat.merchant,
  escapeCombat.merchant.maxHp * 0.39,
  { source: 'test' }
);
escapeCombat.Game.merchants.update(0.05);
assert.equal(
  escapeCombat.merchant.components.actionState.abilityId,
  'merchant.escape',
  'merchant begins the two-second escape cast below 40% HP'
);
escapeCombat.Game.combat.advanceToTick(
  escapeCombat.encounter.id,
  escapeCombat.encounter.tick + 45
);
assert.equal(escapeCombat.Game.merchants.activeEvent(), null);
assert.equal(escapeCombat.encounter.lifecycle, 'ended');
assert.deepEqual(
  plain(escapeCombat.encounter.result.rewardAuthorizedActorIds),
  [],
  'escape encounter never authorizes ordinary combat rewards'
);

const lethalCombat = bootCombatMerchant(0xBADC0DE);
const lethalGold = lethalCombat.Game.state.player.gold;
const lethalTargets = lethalCombat.Game.combat.queryTargets({
  encounterId: lethalCombat.encounter.id,
  sourceActorId: lethalCombat.hero.id,
  targetActorId: lethalCombat.merchant.id
}, { relation: 'hostile', shape: 'single', range: 999 });
const lethalEvent = lethalCombat.Game.combat.dealDamage({
  encounterId: lethalCombat.encounter.id,
  sourceActorId: lethalCombat.hero.id,
  targetActorId: lethalCombat.merchant.id,
  abilityId: 'fighter.auto',
  effect: {
    target: { relation: 'hostile', shape: 'single', range: 999 },
    damageTypeId: 'true',
    amount: lethalCombat.merchant.maxHp * 10,
    canCrit: false
  }
});
assert.equal(
  lethalCombat.Game.merchants.activeEvent().state,
  'surrendered',
  JSON.stringify({
    hit: lethalEvent,
    hp: lethalCombat.merchant.hp,
    vitalsHp: lethalCombat.merchant.components.vitals.hp,
    silent: lethalCombat.encounter.context.silent,
    relation: lethalCombat.Game.relations.resolve(
      lethalCombat.hero.id,
      lethalCombat.merchant.id,
      lethalCombat.encounter.id
    ),
    heroEncounter: lethalCombat.hero.encounterId,
    merchantEncounter: lethalCombat.merchant.encounterId,
    merchantAction: lethalCombat.merchant.components.actionState.state,
    merchantLookup: !!lethalCombat.Game.actors.get(lethalCombat.merchant.id),
    participantState: lethalCombat.encounter.participantStates[lethalCombat.merchant.id],
    participants: lethalCombat.encounter.participants,
    effectBudget: lethalCombat.encounter.effectBudget,
    queryTargets: lethalTargets.map((actor) => actor.id),
    candidateState: lethalCombat.encounter.participants.map((id) => {
      const actor = lethalCombat.Game.actors.get(id);
      return {
        id,
        hp: actor && actor.components.vitals.hp,
        action: actor && actor.components.actionState.state,
        relation: actor && lethalCombat.Game.relations.resolve(
          lethalCombat.hero.id,
          actor.id,
          lethalCombat.encounter.id
        )
      };
    }),
    eventLog: lethalCombat.encounter.eventLog.slice(-3)
  })
);
assert.equal(lethalCombat.merchant.hp, 1, 'lethal damage is clamped into surrender');
assert.equal(lethalCombat.encounter.lifecycle, 'ended');
assert.equal(lethalCombat.Game.state.player.gold, lethalGold, 'surrender grants no automatic gold');
assert.deepEqual(
  plain(lethalCombat.encounter.result.rewardAuthorizedActorIds),
  [],
  'surrender grants no ordinary encounter reward'
);

console.log('wandering-merchants.test.js: all assertions passed');
