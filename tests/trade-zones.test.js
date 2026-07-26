'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const TRADE_SOURCE = fs.readFileSync(path.join(ROOT, 'js/systems/trade.js'), 'utf8');
const SHOP_SOURCE = fs.readFileSync(path.join(ROOT, 'js/systems/shop.js'), 'utf8');
const REGION_SOURCE = fs.readFileSync(path.join(ROOT, 'js/data/regions.js'), 'utf8');
const INDEX_SOURCE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function makeHarness() {
  const events = [];
  const itemDefs = {
    camp_potion: {
      id: 'camp_potion',
      kind: 'potion',
      ref: 'potion_small',
      cur: 'gold',
      price: 25,
      catalogs: ['camp-general']
    },
    relic_potion: {
      id: 'relic_potion',
      kind: 'potion',
      ref: 'potion_large',
      cur: 'gold',
      price: 40,
      catalogs: ['relic-exchange']
    }
  };
  const region = {
    id: 'r1',
    tradeAreas: [
      {
        id: 'camp-supply',
        kind: 'camp',
        anchor: 'camp',
        radiusFrom: 'campSafeRadius',
        catalogs: ['camp-general'],
        priority: 10,
        nameKey: 'tradeArea.camp'
      },
      {
        id: 'relic-stall',
        kind: 'merchant',
        anchor: { x: 500, y: 200 },
        radius: 30,
        catalogs: ['relic-exchange'],
        priority: 20,
        nameKey: 'tradeArea.relic'
      }
    ]
  };
  let transitionActive = false;
  const potions = { potion_small: 0, potion_large: 0 };
  const Game = {
    entryState: 'active',
    util: {
      dist(x1, y1, x2, y2) {
        return Math.hypot(x2 - x1, y2 - y1);
      },
      chance() {
        return false;
      }
    },
    bus: {
      emit(name, payload) {
        events.push({ name, payload });
      }
    },
    reg: {
      get(type, id) {
        return type === 'shopItem' ? itemDefs[id] || null : null;
      },
      all(type) {
        return type === 'shopItem' ? Object.values(itemDefs) : [];
      }
    },
    F: {
      PERM_MAX: 10,
      potionPrice(pid, tier) {
        return itemDefs.camp_potion.price;
      },
      gearBoxPrice() {
        return 100;
      },
      permPrice() {
        return 10;
      }
    },
    State: {
      regionTier() {
        return 1;
      }
    },
    state: {
      world: { region: 'r1' },
      player: { gold: 100, crystal: 50, level: 1, perms: {} }
    },
    world: {
      region,
      layout: { camp: { x: 100, y: 100 }, campSafeRadius: 80 },
      hero: { x: 200, y: 100, state: 'idle' }
    },
    transitions: {
      isActive() {
        return transitionActive;
      }
    },
    inv: {
      potionCount(pid) {
        return potions[pid] || 0;
      },
      addPotion(pid, count) {
        potions[pid] = (potions[pid] || 0) + count;
      },
      genLoot() {
        return { uid: 'loot' };
      },
      addItem(item) {
        return item;
      }
    },
    player: {
      addGold(delta) {
        Game.state.player.gold = Math.max(0, Game.state.player.gold + delta);
      },
      addCrystal(delta) {
        Game.state.player.crystal = Math.max(0, Game.state.player.crystal + delta);
      },
      recalc() {}
    }
  };
  const context = vm.createContext({ window: { Game }, console });
  vm.runInContext(TRADE_SOURCE, context, { filename: 'js/systems/trade.js' });
  vm.runInContext(SHOP_SOURCE, context, { filename: 'js/systems/shop.js' });
  return {
    Game,
    events,
    potions,
    setTransitionActive(value) {
      transitionActive = value;
    }
  };
}

const h = makeHarness();

let context = h.Game.trade.current();
assert.equal(context.available, false);
assert.equal(context.reason, 'outside');
assert.equal(context.nearest.id, 'camp-supply');
assert.equal(h.Game.shop.canBuy(h.Game.reg.get('shopItem', 'camp_potion')), false);
const blockedBuy = h.Game.shop.buy('camp_potion');
assert.equal(blockedBuy.ok, false, 'buy() enforces location even when called without the UI');
assert.equal(blockedBuy.reason, 'outside');
assert.equal(h.Game.state.player.gold, 100);

h.Game.world.hero.x = 180;
context = h.Game.trade.current();
assert.equal(context.available, true, 'camp boundary is inclusive');
assert.equal(context.areaId, 'camp-supply');
assert.deepEqual(
  Array.from(h.Game.shop.offers(context), (item) => item.id),
  ['camp_potion'],
  'camp only exposes its declared catalog'
);
assert.equal(h.Game.shop.buy('relic_potion').reason, 'not-offered');
assert.equal(h.Game.state.player.gold, 100);

const bought = h.Game.shop.buy('camp_potion');
assert.equal(bought.ok, true);
assert.equal(h.Game.state.player.gold, 75);
assert.equal(h.potions.potion_small, 1);
const buyEvent = h.events.find((event) => event.name === 'shop:bought');
assert.equal(buyEvent.payload.rid, 'r1');
assert.equal(buyEvent.payload.areaId, 'camp-supply');

h.Game.world.hero.x = 500;
h.Game.world.hero.y = 200;
context = h.Game.trade.current();
assert.equal(context.available, true);
assert.equal(context.areaId, 'relic-stall');
assert.deepEqual(
  Array.from(h.Game.shop.offers(context), (item) => item.id),
  ['relic_potion'],
  'a future special area can expose a different catalog without shop engine changes'
);

h.setTransitionActive(true);
assert.equal(h.Game.trade.current().reason, 'busy');
assert.equal(h.Game.shop.buy('relic_potion').reason, 'busy');
h.setTransitionActive(false);

h.Game.world.region = { ...h.Game.world.region, id: 'r2' };
assert.equal(h.Game.trade.current().reason, 'region-mismatch', 'stale map state cannot trade');
h.Game.world.region = h.Game.world.region = { ...h.Game.world.region, id: 'r1' };

h.Game.world.hero.x = 120;
h.Game.world.hero.y = 100;
h.Game.trade.reset();
h.Game.trade.update();
h.Game.trade.update();
h.Game.world.hero.x = 220;
h.Game.trade.update();
assert.equal(
  h.events.filter((event) => event.name === 'trade:contextChanged').length,
  2,
  'context events only fire when the access signature changes'
);

const registeredRegions = [];
const RegionGame = {
  register(type, def) {
    if (type === 'region') registeredRegions.push(def);
  }
};
vm.runInContext(
  REGION_SOURCE,
  vm.createContext({ window: { Game: RegionGame }, console }),
  { filename: 'js/data/regions.js' }
);
assert.equal(registeredRegions.length, 8);
for (const region of registeredRegions) {
  const camp = region.tradeAreas.find((area) => area.id === 'camp-supply');
  assert.ok(camp, `${region.id} has a camp trade area`);
  assert.equal(camp.anchor, 'camp');
  assert.equal(camp.radiusFrom, 'campSafeRadius');
  assert.deepEqual(Array.from(camp.catalogs), ['camp-general', 'camp-exchange']);
  assert.ok(camp.prop, `${region.id} camp trade area exposes a world prop`);
}
assert.ok(
  INDEX_SOURCE.indexOf('js/systems/trade.js') < INDEX_SOURCE.indexOf('js/systems/shop.js'),
  'trade context loads before the shop transaction system'
);

console.log('Trade-zone tests passed: camp range, transaction guard, catalogs, special areas and context events.');
