'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function eventBus() {
  const listeners = {};
  const events = [];
  return {
    events,
    on(name, fn) {
      (listeners[name] ||= []).push(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners[name] || []) fn(payload);
    }
  };
}

const bus = eventBus();
let currentTab = 'battle';
let tradeContext = {
  available: true,
  reason: null,
  areaId: 'camp-supply',
  regionId: 'grassland',
  providerType: 'camp',
  providerId: null,
  eventId: null
};

const Game = {
  state: { world: { worldTime: 100, region: 'grassland' } },
  bus,
  util: {},
  trade: {
    current() {
      return tradeContext;
    }
  },
  ui: {
    panels: {},
    tabs: {
      current() {
        return currentTab;
      },
      open(tab) {
        currentTab = tab;
        return true;
      },
      rerender() {},
      queueRerender() {}
    }
  }
};

const sandbox = { window: { Game }, console };
vm.createContext(sandbox);
vm.runInContext(read('js/systems/interactions.js'), sandbox, {
  filename: 'js/systems/interactions.js'
});

const first = Game.interactions.acquirePause('qa:lease', {
  ttl: 1,
  scopes: ['autoExplore'],
  context: { source: 'qa' }
});
assert.equal(first.acquiredAt, 100);
assert.equal(first.expiresAt, 101);
assert.equal(Game.interactions.isPaused('autoExplore'), true);
assert.deepEqual(Array.from(Game.interactions.pauseSnapshot()[0].scopes), ['autoExplore']);

Game.state.world.worldTime = 100.8;
const renewed = Game.interactions.acquirePause('qa:lease', { ttl: 1 });
assert.equal(renewed.acquiredAt, 100, 'renewal preserves the stable lease lifetime');
assert.equal(renewed.expiresAt, 101.8);
Game.state.world.worldTime = 101.7;
assert.equal(Game.interactions.isPaused('autoExplore'), true);
Game.state.world.worldTime = 101.81;
assert.equal(Game.interactions.isPaused('autoExplore'), false, 'lost callers expire without cleanup code');
assert.equal(
  bus.events.find((event) => event.name === 'interactionPause:released').payload.reason,
  'expired'
);

Game.interactions.acquirePause('qa:dialog', { scopes: ['dialogInput'] });
assert.equal(Game.interactions.isPaused('autoExplore'), false, 'pause scopes stay isolated');
assert.equal(Game.interactions.isPaused('dialogInput'), true);
assert.equal(Game.interactions.isPaused(), true);
Game.interactions.resetPauses('qa-reset');
assert.equal(Game.interactions.pauseSnapshot().length, 0);

vm.runInContext(read('js/ui/trade.js'), sandbox, { filename: 'js/ui/trade.js' });

Game.state.world.worldTime = 200;
assert.equal(Game.ui.trade.open('camp-supply'), true);
assert.equal(Game.ui.trade.isOpen(), true);
assert.equal(Game.interactions.isPaused('autoExplore'), true,
  'an active trade panel acquires the auto-exploration lease');
assert.equal(Game.interactions.pauseSnapshot()[0].context.areaId, 'camp-supply');

Game.state.world.worldTime = 201.5;
assert.equal(Game.ui.trade.maintainPause(tradeContext), true);
assert.ok(Game.interactions.pauseSnapshot()[0].expiresAt > 201.5,
  'the live trade panel renews its short lease');

currentTab = 'inv';
assert.equal(Game.ui.trade.maintainPause(tradeContext), false);
assert.equal(Game.ui.trade.isOpen(), false);
assert.equal(Game.interactions.isPaused('autoExplore'), false,
  'switching away from the trade tab releases auto exploration');

Game.ui.trade.open('camp-supply');
tradeContext = {
  available: false,
  reason: 'outside',
  areaId: null,
  regionId: 'grassland'
};
assert.equal(Game.ui.trade.maintainPause(tradeContext), false);
assert.equal(Game.interactions.isPaused('autoExplore'), false,
  'leaving the matching trade area releases the lease');

tradeContext = {
  available: true,
  reason: null,
  areaId: 'camp-supply',
  regionId: 'grassland'
};
Game.ui.trade.open('camp-supply');
assert.equal(Game.interactions.isPaused('autoExplore'), true);
assert.equal(Game.ui.trade.close('qa-close'), true);
assert.equal(Game.interactions.isPaused('autoExplore'), false,
  'closing the panel releases immediately');

function fakeNode(connectedRoot = false) {
  const node = {
    parentNode: null,
    children: [],
    _connectedRoot: connectedRoot,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    addEventListener() {},
    setAttribute() {}
  };
  Object.defineProperty(node, 'isConnected', {
    get() {
      return this._connectedRoot || !!(this.parentNode && this.parentNode.isConnected);
    }
  });
  return node;
}

const modalRoot = fakeNode(true);
const documentStub = {
  hidden: false,
  getElementById(id) {
    return id === 'modal-root' ? modalRoot : null;
  }
};
sandbox.document = documentStub;
sandbox.window.document = documentStub;
Game.reg = {};
Game.util.el = () => fakeNode();
vm.runInContext(read('js/ui/modals.js'), sandbox, { filename: 'js/ui/modals.js' });
Game.ui.modals.init();

let modalGuard = true;
Game.state.world.worldTime = 300;
const modalApi = Game.ui.modals.show(fakeNode(), {
  pause: {
    id: 'ui:qa-modal',
    kind: 'qa-dialogue',
    scopes: ['autoExplore'],
    context: { actorId: 'merchant:qa' },
    guard() {
      return modalGuard;
    }
  }
});
assert.equal(Game.interactions.isPaused('autoExplore'), true,
  'a deep-interaction modal acquires its declared pause');
Game.state.world.worldTime = 301.8;
assert.equal(Game.ui.modals.updateInteractionPauses(), 1);
assert.ok(Game.interactions.pauseSnapshot()[0].expiresAt > 301.8,
  'the simulation loop can renew a live modal lease');
modalGuard = false;
assert.equal(Game.ui.modals.updateInteractionPauses(), 0);
assert.equal(Game.interactions.isPaused('autoExplore'), false,
  'an invalid modal target closes and releases its lease');
assert.equal(modalRoot.children.length, 0);
assert.equal(modalApi.close(), false, 'modal close stays idempotent after guard cleanup');

const disconnectedApi = Game.ui.modals.show(fakeNode(), {
  pause: { id: 'ui:disconnected-modal', scopes: ['autoExplore'] }
});
assert.equal(Game.interactions.isPaused('autoExplore'), true);
modalRoot.removeChild(modalRoot.children[0]);
Game.ui.modals.updateInteractionPauses();
assert.equal(Game.interactions.isPaused('autoExplore'), false,
  'external DOM removal cannot leave a renewing pause behind');
assert.equal(disconnectedApi.close(), false);

let surrenderState = 'surrendered';
let surrenderPromptResets = 0;
Game.i18n = {
  t(key, vars) {
    if (key === 'ui.nestChestOpened') return `${key}:${vars.gold}:${vars.count}`;
    return key;
  },
  fmtNum(value) { return `fmt:${value}`; }
};
let nestChestToast = null;
const originalToast = Game.ui.modals.toast;
Game.ui.modals.toast = function (message, kind) {
  nestChestToast = { message, kind };
};
assert.doesNotThrow(() => bus.emit('nestChest:opened', {
  gold: 12345,
  materialCount: 4
}));
assert.deepEqual(nestChestToast, {
  message: 'ui.nestChestOpened:fmt:12345:4',
  kind: 'gold'
}, 'nest chest Toast formats through the live i18n object without listener errors');
Game.ui.modals.toast = originalToast;
Game.world = {
  hero: { hp: 100, maxHp: 100, state: 'idle', encounterId: null }
};
Game.transitions = { isActive() { return false; } };
Game.ending = { isActive() { return false; } };
Game.ui.itemName = () => 'QA item';
Game.merchants = {
  activeEvent() {
    return { id: 'merchant-event:qa', state: surrenderState };
  },
  resolveSurrender() { return { ok: false }; },
  resetSurrenderPrompt(eventId) {
    assert.equal(eventId, 'merchant-event:qa');
    surrenderPromptResets++;
    return true;
  }
};
Game.state.world.worldTime = 320;
const surrenderApi = Game.ui.modals.merchantSurrender({
  eventId: 'merchant-event:qa',
  merchantProfileId: 'merchant.windbell_lia',
  debtGold: 100,
  eligibleOffers: []
});
assert.ok(surrenderApi);
assert.equal(Game.interactions.isPaused('autoExplore'), true,
  'the mandatory surrender decision pauses auto exploration');
assert.equal(Game.interactions.pauseSnapshot()[0].id, 'ui:merchant-surrender');
Game.state.world.worldTime = 321.8;
assert.equal(Game.ui.modals.updateInteractionPauses(), 1);
assert.ok(Game.interactions.pauseSnapshot()[0].expiresAt > 321.8,
  'the live surrender decision renews its bounded pause lease');
surrenderState = 'available';
assert.equal(Game.ui.modals.updateInteractionPauses(), 0);
assert.equal(Game.interactions.isPaused('autoExplore'), false,
  'an invalidated surrender decision releases auto exploration');
assert.equal(surrenderPromptResets, 1,
  'closing an invalid surrender modal makes its prompt recoverable');
assert.equal(surrenderApi.close(), false);

function bootWorldInteractionHarness() {
  const harnessBus = eventBus();
  const harnessGame = {
    F: { BAL: {} },
    bus: harnessBus,
    reg: {},
    state: {
      world: { mode: 'battle', worldTime: 400, region: 'grassland' },
      settings: { controlMode: 'auto' }
    },
    util: {
      dist(ax, ay, bx, by) {
        return Math.hypot(ax - bx, ay - by);
      },
      clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      },
      rand(min, max) {
        return min + (max - min) * 0.5;
      },
      dirOf() { return 'r'; },
      uid() { return 'qa'; }
    },
    player: {
      hasClass() { return true; }
    },
    transitions: { isActive() { return false; } },
    ending: { isActive() { return false; } },
    interactions: {
      isPaused() { return true; },
      handlers() { return harnessGame._handlers; }
    },
    ui: { modals: {} }
  };
  const harnessSandbox = { window: null, console, Math, Number };
  harnessSandbox.window = { Game: harnessGame };
  vm.createContext(harnessSandbox);
  vm.runInContext(read('js/systems/world.js'), harnessSandbox, {
    filename: 'js/systems/world.js'
  });
  return harnessGame;
}

const worldHarness = bootWorldInteractionHarness();
const world = worldHarness.world;
const worldHero = world.hero = {
  id: 'hero', x: 80, y: 100, hp: 100, maxHp: 100,
  state: 'idle', flash: 0, lungeT: 0, animT: 0,
  components: { targeting: {} }
};
world.layout = { version: 3, camp: { x: 10, y: 10 } };
world.region = { world: { w: 900, h: 520 } };

let campMoveCalls = 0;
let campWarpCalls = 0;
world.moveToward = function () { campMoveCalls++; return 10; };
world.updateCampTeleport = function () { campWarpCalls++; };
worldHarness.expeditionAI = { pause() {} };
worldHarness.state.world.mode = 'rest';
world.autoCampCycle = true;
worldHero.state = 'goCamp';
world.updateHero(worldHero, 0.25);
assert.equal(campMoveCalls, 0, 'an in-flight automatic camp walk freezes during interaction');
worldHero.state = 'warpOut';
world.updateHero(worldHero, 0.25);
assert.equal(campWarpCalls, 0, 'an in-flight automatic camp warp freezes during interaction');

world.autoCampCycle = false;
worldHero.state = 'goCamp';
world.updateHero(worldHero, 0.25);
assert.equal(campMoveCalls, 1, 'manual camp walking remains available');
worldHero.state = 'warpOut';
world.updateHero(worldHero, 0.25);
assert.equal(campWarpCalls, 1, 'manual camp warping remains available');

let actorActionCalls = 0;
let merchantTalkCalls = 0;
const merchantActor = {
  id: 'merchant:qa', x: 100, y: 100, hp: 100, maxHp: 100,
  spriteH: 20, lifecycle: 'active', dead: false,
  components: { vitals: {}, transform: {} }
};
worldHarness._handlers = {
  talk() { merchantTalkCalls++; }
};
worldHarness.ui.modals.actorActions = function (actor) {
  assert.equal(actor, merchantActor);
  actorActionCalls++;
};
worldHarness.trade = {
  areas() {
    return [{
      id: 'merchant-trade:qa', x: 100, y: 100,
      prop: { sprite: 'trade_wagon_wander' },
      providerType: 'merchant', eventId: 'event:qa'
    }];
  }
};
worldHarness.merchants = {
  actorForEvent(eventId) {
    return eventId === 'event:qa' ? merchantActor : null;
  }
};
worldHarness.state.world.mode = 'battle';
worldHarness.player.hasClass = function () { return true; };
world.handleTap(100, 100);
assert.equal(actorActionCalls, 1, 'clicking the merchant body preserves the actor action menu');
assert.equal(merchantTalkCalls, 0);

merchantActor.x = 132;
world.handleTap(100, 100);
assert.equal(actorActionCalls, 1);
assert.equal(merchantTalkCalls, 1, 'clicking only the caravan enters merchant dialogue');

const tradeSource = read('js/systems/trade.js');
const worldSource = read('js/systems/world.js');
const aiSource = read('js/systems/expedition_ai.js');
const modalSource = read('js/ui/modals.js');
const loopSource = read('js/core/loop.js');
const zhSource = read('js/i18n/zh-CN.js');
const enSource = read('js/i18n/en.js');

assert.match(tradeSource, /Game\.ui\.trade\.maintainPause\(context\)/,
  'the main trade poll renews or releases the UI lease');
assert.match(worldSource, /isPaused\('autoExplore'\)/,
  'world automation consumes the scoped pause contract');
assert.match(worldSource, /!manual && W\.isAutoExplorePaused\(\)/,
  'automatic boss spawning is paused without blocking manual challenges');
assert.match(worldSource, /isAutomaticCampMotionPaused/,
  'world movement exposes the in-flight automatic camp pause contract');
assert.match(worldSource, /explicitMove[\s\S]+explicitInteraction[\s\S]+explicitTarget/,
  'explicit player movement, interaction and targeting remain available');
assert.match(aiSource, /id: 'interaction'/,
  'the expedition diagnostic reports focused interaction instead of a stuck route');
assert.match(modalSource, /id: 'ui:merchant-dialogue'/,
  'merchant dialogue declares an independent stable lease');
assert.match(modalSource, /id: 'ui:merchant-surrender'/,
  'merchant surrender declares an independent stable lease');
assert.match(modalSource, /updateInteractionPauses:/,
  'generic modal lifecycle exposes pause renewal');
assert.match(loopSource, /Game\.ui\.modals\.updateInteractionPauses\(\)/,
  'the simulation loop renews modal leases even during bounded catch-up');
assert.match(zhSource, /interaction: '专注互动'/);
assert.match(enSource, /interaction: 'Focused interaction'/);

console.log('Interaction-pause tests passed: scoped leases, TTL recovery, trade lifecycle and auto-explore guards.');
