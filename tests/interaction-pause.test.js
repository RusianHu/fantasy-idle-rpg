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
  const listeners = {};
  const node = {
    parentNode: null,
    children: [],
    tag: '',
    cls: '',
    text: '',
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
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    setAttribute() {},
    fire(type, event) { (listeners[type] || []).forEach((fn) => fn(event || {})); },
    querySelector(selector) { return findNode(this, selector); }
  };
  Object.defineProperty(node, 'isConnected', {
    get() {
      return this._connectedRoot || !!(this.parentNode && this.parentNode.isConnected);
    }
  });
  return node;
}

function nodeMatches(node, selector) {
  if (!node || !selector) return false;
  if (selector[0] === '.') {
    return !!(node.cls && node.cls.split(' ').indexOf(selector.slice(1)) >= 0);
  }
  return node.tag === selector;
}

function findNode(root, selector) {
  for (const child of (root && root.children) || []) {
    if (nodeMatches(child, selector)) return child;
    const found = findNode(child, selector);
    if (found) return found;
  }
  return null;
}

function findByCls(root, cls) {
  if (nodeMatches(root, '.' + cls)) return root;
  for (const child of (root && root.children) || []) {
    const found = findByCls(child, cls);
    if (found) return found;
  }
  return null;
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
Game.util.el = function (tag, cls, text) {
  const node = fakeNode();
  node.tag = tag || '';
  node.cls = cls || '';
  if (text !== undefined) node.text = String(text);
  return node;
};
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

/* === 移动行商第一层 actorActions 有限暂停 + 攻击 Engagement 交接租约 === */
(function () {
  Game.interactions.resetPauses('qa-merchant-actions-reset');
  Game.ui.trade.close('qa-merchant-actions-reset');

  const merchantEventId = 'merchant-event:actions-qa';
  const merchantProfileId = 'merchant.windbell_lia';
  let merchantState = 'available';
  const merchantActor = {
    id: 'merchant:actions-qa',
    tags: ['merchant', 'wandering-merchant', 'nonlethal'],
    blueprint: {
      archetypeId: 'archetype.wandering-merchant',
      resolvedProfiles: { interactionProfileId: 'interaction.wandering-merchant' }
    },
    merchantEventId: merchantEventId,
    merchantProfileId: merchantProfileId,
    dead: false,
    lifecycle: 'active',
    hp: 100,
    maxHp: 100
  };

  Game.content = {
    get(type, id) {
      if (type === 'actorArchetype') {
        return { identity: { nameKey: id + '.name', loreKey: id + '.lore' } };
      }
      if (type === 'interactionProfile') {
        return { actions: [
          { id: 'talk', kind: 'talk', primary: true },
          { id: 'trade', kind: 'trade' },
          { id: 'attack', kind: 'attack', requiresConfirmation: true }
        ] };
      }
      return null;
    }
  };
  Game.assets = { drawToDom() {} };
  Game.util.esc = function (s) { return String(s); };
  Game.actors = { get(id) { return id === merchantActor.id ? merchantActor : null; } };

  let talkCalls = 0, tradeCalls = 0, attackCalls = 0;
  let attackResult = { ok: true, queued: true, commandId: 'cmd:qa-attack' };
  Game.merchants = {
    activeEvent() {
      return merchantState === 'gone' ? null : {
        id: merchantEventId, state: merchantState, merchantProfileId: merchantProfileId
      };
    },
    talk() {
      talkCalls++;
      return {
        state: 'first', key: 'merchant.first.1', text: 'line',
        profileId: merchantProfileId, nameKey: 'merchant.windbell_lia.name',
        portraitId: 'portrait.windbell_lia'
      };
    },
    openTrade() {
      tradeCalls++;
      // 真实 openTrade 会打开交易面板并取得 ui:trade 租约，此处复用生产 trade UI
      Game.ui.trade.open('camp-supply');
      return { ok: true, opened: true };
    },
    attack() { attackCalls++; return attackResult; }
  };
  Game.world = { hero: { id: 'hero', state: 'idle', encounterId: null, hp: 100, maxHp: 100 } };
  Game.transitions = { isActive() { return false; }, isDeathActive() { return true; } };
  Game.ending = { isActive() { return false; } };
  const merchantHandlers = Game.interactions.handlers(merchantActor);

  function actionList() { return findByCls(modalRoot, 'actor-action-list'); }

  // 1. 打开 actorActions -> ui:merchant-actions 取得、context 正确并续租
  Game.state.world.worldTime = 500;
  let actionsApi = Game.ui.modals.actorActions(merchantActor, merchantHandlers);
  assert.ok(actionsApi, 'actorActions returns a modal api');
  assert.equal(Game.interactions.isPaused('autoExplore'), true,
    'the first merchant action layer acquires the autoExplore pause');
  let lease = Game.interactions.pauseSnapshot().find((l) => l.id === 'ui:merchant-actions');
  assert.ok(lease, 'the merchant-actions lease exists');
  assert.deepEqual(Array.from(lease.scopes), ['autoExplore']);
  assert.equal(lease.kind, 'merchant-actions');
  assert.equal(lease.context.actorId, merchantActor.id);
  assert.equal(lease.context.eventId, merchantEventId);
  assert.equal(lease.context.merchantProfileId, merchantProfileId);
  assert.equal(lease.context.regionId, 'grassland');
  Game.state.world.worldTime = 501.6;
  assert.equal(Game.ui.modals.updateInteractionPauses(), 1);
  lease = Game.interactions.pauseSnapshot().find((l) => l.id === 'ui:merchant-actions');
  assert.ok(lease.expiresAt > 501.6, 'the merchant-actions lease renews');
  actionsApi.close();
  assert.equal(Game.interactions.isPaused('autoExplore'), false,
    'closing the merchant action layer releases the pause');

  // 2. 普通非行商 Actor 的 actorActions 不取得该租约
  const neutralActor = {
    id: 'npc:neutral', tags: ['npc'],
    blueprint: {
      archetypeId: 'archetype.npc',
      resolvedProfiles: { interactionProfileId: 'interaction.npc' }
    },
    dead: false, lifecycle: 'active', hp: 100
  };
  const neutralApi = Game.ui.modals.actorActions(neutralActor, {});
  assert.ok(neutralApi);
  assert.equal(Game.interactions.isPaused('autoExplore'), false,
    'a non-wandering-merchant actor action panel does not pause auto explore');
  assert.equal(
    Game.interactions.pauseSnapshot().some((l) => l.id === 'ui:merchant-actions'), false,
    'no merchant-actions lease is created for a neutral actor');
  neutralApi.close();

  // 3a. 目标/事件失效（state 不再 available）释放
  actionsApi = Game.ui.modals.actorActions(merchantActor, merchantHandlers);
  assert.equal(Game.interactions.isPaused('autoExplore'), true);
  merchantState = 'assault';
  assert.equal(Game.ui.modals.updateInteractionPauses(), 0,
    'an invalidated merchant event closes the action layer');
  assert.equal(Game.interactions.isPaused('autoExplore'), false,
    'invalidating the merchant event releases auto explore');
  assert.equal(actionsApi.close(), false, 'action layer already cleaned up by guard');
  merchantState = 'available';

  // 3b. Actor 死亡释放
  actionsApi = Game.ui.modals.actorActions(merchantActor, merchantHandlers);
  assert.equal(Game.interactions.isPaused('autoExplore'), true);
  merchantActor.dead = true;
  assert.equal(Game.ui.modals.updateInteractionPauses(), 0);
  assert.equal(Game.interactions.isPaused('autoExplore'), false, 'a dead merchant releases the pause');
  merchantActor.dead = false;

  // 3c. 玩家进入战斗（hero.encounterId）释放
  actionsApi = Game.ui.modals.actorActions(merchantActor, merchantHandlers);
  assert.equal(Game.interactions.isPaused('autoExplore'), true);
  Game.world.hero.encounterId = 'enc:aggro';
  assert.equal(Game.ui.modals.updateInteractionPauses(), 0);
  assert.equal(Game.interactions.isPaused('autoExplore'), false, 'entering combat releases the action pause');
  Game.world.hero.encounterId = null;

  // 3d. 换区 / 死亡 / 结局 -> resetPauses 释放
  actionsApi = Game.ui.modals.actorActions(merchantActor, merchantHandlers);
  assert.equal(Game.interactions.isPaused('autoExplore'), true);
  Game.bus.emit('region:changed', { rid: 'forest' });
  assert.equal(Game.interactions.isPaused('autoExplore'), false, 'region change releases the action pause');
  actionsApi.close();
  Game.bus.emit('player:death');
  assert.equal(Game.interactions.isPaused('autoExplore'), false, 'player death keeps the action pause released');

  // 4. 点击交谈 -> merchantDialogue 租约接管
  actionsApi = Game.ui.modals.actorActions(merchantActor, merchantHandlers);
  assert.equal(Game.interactions.isPaused('autoExplore'), true);
  actionList().children[0].fire('click');
  assert.equal(talkCalls, 1, 'clicking talk invokes merchant talk');
  assert.equal(Game.interactions.isPaused('autoExplore'), true, 'talk keeps auto explore paused');
  assert.ok(
    Game.interactions.pauseSnapshot().some((l) => l.id === 'ui:merchant-dialogue'),
    'merchantDialogue takes over the pause lease');
  assert.equal(
    Game.interactions.pauseSnapshot().some((l) => l.id === 'ui:merchant-actions'), false,
    'the first action layer lease is released after opening dialogue');
  Game.ui.modals.closeInteractionModals('qa-dialogue-done');

  // 4b. 点击查看货物 -> trade 租约接管
  actionsApi = Game.ui.modals.actorActions(merchantActor, merchantHandlers);
  assert.equal(Game.interactions.isPaused('autoExplore'), true);
  actionList().children[1].fire('click');
  assert.equal(tradeCalls, 1, 'clicking trade opens the merchant trade panel');
  assert.equal(Game.interactions.isPaused('autoExplore'), true, 'trade keeps auto explore paused');
  assert.equal(Game.ui.trade.isOpen(), true);
  assert.ok(
    Game.interactions.pauseSnapshot().some((l) => l.id === 'ui:trade'),
    'the trade lease takes over after opening the shop');
  assert.equal(
    Game.interactions.pauseSnapshot().some((l) => l.id === 'ui:merchant-actions'), false,
    'the first action layer lease is released after opening trade');
  Game.ui.trade.close('qa-trade-done');
  assert.equal(Game.interactions.isPaused('autoExplore'), false);

  // 5. 点击攻击 -> 确认窗仍保持暂停；取消后释放
  actionsApi = Game.ui.modals.actorActions(merchantActor, merchantHandlers);
  assert.equal(Game.interactions.isPaused('autoExplore'), true);
  actionList().children[2].fire('click');
  assert.equal(attackCalls, 0, 'attack is not submitted until the confirm is acknowledged');
  assert.equal(Game.interactions.isPaused('autoExplore'), true,
    'the attack confirm keeps auto explore paused');
  assert.ok(
    Game.interactions.pauseSnapshot().some((l) => l.id === 'ui:merchant-attack-confirm'),
    'the attack confirm holds its own lease');
  assert.equal(
    Game.interactions.pauseSnapshot().some((l) => l.id === 'ui:merchant-actions'), false,
    'the first action layer is released when the confirm opens');
  Game.ui.modals.closeInteractionModals('qa-confirm-cancel');
  assert.equal(attackCalls, 0, 'cancelling the confirm never submits the attack');
  assert.equal(Game.interactions.isPaused('autoExplore'), false,
    'cancelling the confirm releases the pause');

  // 6. 确认攻击 -> 交接租约保持至 engagement:committed/rejected
  actionsApi = Game.ui.modals.actorActions(merchantActor, merchantHandlers);
  actionList().children[2].fire('click');
  const okBtn = findByCls(modalRoot, 'gold');
  assert.ok(okBtn, 'the confirm exposes an OK button');
  okBtn.fire('click');
  assert.equal(attackCalls, 1, 'confirming submits the merchant attack');
  assert.equal(Game.interactions.isPaused('autoExplore'), true,
    'the handoff lease keeps auto explore paused after the confirm closes');
  let handoff = Game.interactions.pauseSnapshot().find((l) => l.id === 'ui:merchant-attack-submit');
  assert.ok(handoff, 'the engagement handoff lease is acquired');
  assert.equal(handoff.kind, 'merchant-attack-submit');
  assert.equal(handoff.context.commandId, 'cmd:qa-attack');
  assert.equal(handoff.context.eventId, merchantEventId);
  assert.equal(handoff.context.actorId, merchantActor.id);
  Game.state.world.worldTime = 510;
  assert.equal(Game.interactions.maintainHandoffs(), 1, 'the handoff registry still tracks the pending attack');
  handoff = Game.interactions.pauseSnapshot().find((l) => l.id === 'ui:merchant-attack-submit');
  assert.ok(handoff.expiresAt > 510, 'the handoff lease renews until the engagement resolves');

  // 无关 commandId 的 committed/rejected 不影响
  Game.bus.emit('engagement:committed', {
    type: 'engagement:committed', encounterId: 'other',
    payload: { ok: true, commandId: 'cmd:unrelated', encounterId: 'other' }
  });
  assert.equal(Game.interactions.isPaused('autoExplore'), true,
    'an unrelated engagement:committed does not release the handoff');
  Game.bus.emit('engagement:rejected', { ok: false, commandId: 'cmd:unrelated', reason: 'x' });
  assert.equal(Game.interactions.isPaused('autoExplore'), true,
    'an unrelated engagement:rejected does not release the handoff');
  // 匹配的 committed 释放
  Game.bus.emit('engagement:committed', {
    type: 'engagement:committed', encounterId: 'enc:merchant',
    payload: { ok: true, commandId: 'cmd:qa-attack', encounterId: 'enc:merchant' }
  });
  assert.equal(Game.interactions.isPaused('autoExplore'), false,
    'the matching engagement:committed releases the handoff lease');
  assert.equal(Game.interactions.maintainHandoffs(), 0,
    'the handoff registry is cleared after commit');

  // 6b. rejected 路径
  attackResult = { ok: true, queued: true, commandId: 'cmd:qa-attack-2' };
  Game.interactions.acquireHandoff('cmd:qa-attack-2', {
    eventId: merchantEventId, actorId: merchantActor.id
  });
  assert.equal(Game.interactions.isPaused('autoExplore'), true);
  Game.bus.emit('engagement:rejected', { ok: false, commandId: 'cmd:qa-attack-2', reason: 'occupied' });
  assert.equal(Game.interactions.isPaused('autoExplore'), false,
    'the matching engagement:rejected releases the handoff lease');

  // 6c. TTL 兜底：停止续租并越过 TTL -> 自动释放
  attackResult = { ok: true, queued: true, commandId: 'cmd:qa-attack-3' };
  Game.interactions.acquireHandoff('cmd:qa-attack-3', {
    eventId: merchantEventId, actorId: merchantActor.id
  });
  assert.equal(Game.interactions.isPaused('autoExplore'), true);
  const acquiredAt = Game.state.world.worldTime;
  Game.state.world.worldTime = acquiredAt + 3; // 超过 TTL=2 且不调用 maintainHandoffs
  assert.equal(Game.interactions.isPaused('autoExplore'), false,
    'the handoff lease auto-expires via TTL when renewal stops');
  Game.interactions.releaseHandoff('cmd:qa-attack-3', 'qa-cleanup');

  // 6d. 同步失败（无 commandId）不取得交接租约
  attackResult = { ok: false, reason: 'unavailable' };
  Game.interactions.handlers(merchantActor).attack(merchantActor);
  assert.equal(Game.interactions.isPaused('autoExplore'), false,
    'a synchronously failed attack does not acquire the handoff lease');

  Game.interactions.resetPauses('qa-merchant-actions-done');
  Game.ui.modals.closeInteractionModals('qa-done');
})();

const tradeSource = read('js/systems/trade.js');
const worldSource = read('js/systems/world.js');
const aiSource = read('js/systems/expedition_ai.js');
const modalSource = read('js/ui/modals.js');
const loopSource = read('js/core/loop.js');
const interactionsSource = read('js/systems/interactions.js');
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
assert.match(modalSource, /merchantPauseSpec\('ui:merchant-dialogue'/,
  'merchant dialogue declares an independent stable lease');
assert.match(modalSource, /merchantPauseSpec\('ui:merchant-actions'/,
  'the first merchant action layer declares its own lease');
assert.match(modalSource, /merchantPauseSpec\('ui:merchant-attack-confirm'/,
  'the merchant attack confirm declares its own lease');
assert.match(modalSource, /if \(options && options\.pause\) showOpts\.pause = options\.pause;/,
  'M.confirm forwards an optional pause spec to M.show');
assert.match(modalSource, /id: 'ui:merchant-surrender'/,
  'merchant surrender declares an independent stable lease');
assert.match(modalSource, /updateInteractionPauses:/,
  'generic modal lifecycle exposes pause renewal');
assert.match(loopSource, /Game\.ui\.modals\.updateInteractionPauses\(\)/,
  'the simulation loop renews modal leases even during bounded catch-up');
assert.match(loopSource, /Game\.interactions && Game\.interactions\.maintainHandoffs/,
  'the simulation loop renews engagement handoff leases');
assert.match(interactionsSource, /var HANDOFF_LEASE_ID = 'ui:merchant-attack-submit';/,
  'the engagement handoff uses a stable lease id');
assert.match(interactionsSource, /acquireHandoff\(result\.commandId/,
  'the merchant attack handler acquires the handoff on successful enqueue');
assert.match(interactionsSource, /releaseHandoff\(commandId, 'engagement:committed'\)/,
  'the handoff releases on a matching engagement:committed');
assert.match(interactionsSource, /releaseHandoff\(commandId, 'engagement:rejected'\)/,
  'the handoff releases on a matching engagement:rejected');
assert.match(zhSource, /interaction: '专注互动'/);
assert.match(enSource, /interaction: 'Focused interaction'/);

console.log('Interaction-pause tests passed: scoped leases, TTL recovery, trade lifecycle and auto-explore guards.');
