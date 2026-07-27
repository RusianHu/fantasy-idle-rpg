'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

require('./v1_8.test.js');
require('./v1_9.test.js');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function sandboxWithCore(files = []) {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    performance: { now: () => 0 },
    Number,
    Math,
    Date,
    isFinite
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ['js/core/utils.js', 'js/core/eventbus.js', 'js/core/registry.js', ...files]) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  return sandbox;
}

/* ------------------------------------------------------------------ *
 * 独立 nodes 种子流：八区 × 100 种子，确定性、安全区与主走廊约束。
 * 旧布局快照兼容由链入的 v1_6 测试继续守护。
 * ------------------------------------------------------------------ */
  let nodeLayouts = 0;
  const gatherSprites = new Set();
  for (const region of Game.reg.all('region')) {
    assert.equal(region.gather.nodes.length, 2, `${region.id} registers two node themes`);
    for (const def of region.gather.nodes) {
      assert.match(def.sprite, /^gather_[a-z0-9_]+$/, `${region.id}:${def.id} registers a gather sprite`);
      gatherSprites.add(def.sprite);
    }
    for (let seed = 1; seed <= 100; seed++) {
      const a = Game.terrain.build(region, seed * 2654435761, 2);
    const compactA = a.nodes.map((n) => [n.id, n.material, n.x, n.y, n.cooldown]);
    const b = Game.terrain.build(region, seed * 2654435761, 2);
    const compactB = b.nodes.map((n) => [n.id, n.material, n.x, n.y, n.cooldown]);
      assert.deepEqual(compactA, compactB, `${region.id}:${seed} node stream is deterministic`);
      assert.ok(a.nodes.length >= 3 && a.nodes.length <= 5);
      assert.ok(a.nodes.every((node) => /^gather_/.test(node.sprite)), `${region.id}:${seed} nodes keep their sprite IDs`);
    for (const node of a.nodes) {
      assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
      assert.ok(Game.util.dist(node.x, node.y, a.camp.x, a.camp.y) >= a.campSafeRadius);
      assert.ok(Game.util.dist(node.x, node.y, a.bossPoint.x, a.bossPoint.y) >= a.bossSafeRadius);
      assert.ok(
        Game.terrain.distanceToPath(node.x, node.y, a.corridor.points) >= a.corridor.width / 2,
        `${region.id}:${seed}:${node.id} stays out of the main corridor`
      );
      assert.ok(node.cooldown >= 90 && node.cooldown <= 150);
    }
    nodeLayouts++;
  }
}
assert.equal(gatherSprites.size, 16, 'all 16 region gather themes have distinct sprites');
const propSprites = read('js/sprites/props.js');
const explorationSprites = [...gatherSprites, 'chest_common', 'chest_rare'];
const explorationGroups = [
  'grassland',
  'forest',
  'mine',
  'graveyard',
  'snowpass',
  'lavacave',
  'skyruins',
  'darkcastle',
  'chests'
];
for (const sprite of explorationSprites) {
  assert.match(propSprites, new RegExp(`id:\\s*['"]${sprite}['"]`), `${sprite} is defined in the asset registry`);
}
const capturedSprites = new Map();
const paletteStub = new Proxy({}, {
  get: (_target, key) => `#${String(key).padEnd(6, '0').slice(0, 6)}`
});
const spriteBox = {
  console,
  window: {
    Game: {
      PAL: paletteStub,
      assets: { defineSprite: (def) => capturedSprites.set(def.id, def) }
    }
  }
};
vm.createContext(spriteBox);
vm.runInContext(propSprites, spriteBox, { filename: 'js/sprites/props.js' });
for (const sprite of explorationSprites) {
  assert.ok(capturedSprites.has(sprite), `${sprite} has a hand-authored fallback`);
}
vm.runInContext(
  read('js/sprites/exploration/manifest.generated.js'),
  spriteBox,
  { filename: 'js/sprites/exploration/manifest.generated.js' }
);
for (const group of explorationGroups) {
  const file = `js/sprites/exploration/${group}.generated.js`;
  vm.runInContext(read(file), spriteBox, { filename: file });
}
const explorationManifest = spriteBox.window.Game.EXPLORATION_SPRITES;
const sourceFile = path.join(ROOT, explorationManifest.source.path);
const actualSourceHash = crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
assert.equal(explorationManifest.source.sha256, actualSourceHash, 'exploration manifest matches source art SHA-256');
assert.equal(explorationManifest.source.columns * explorationManifest.source.rows, 18);
assert.deepEqual(
  new Set(Object.keys(explorationManifest.assets)),
  new Set(explorationSprites),
  'manifest covers all gatherables and both chests'
);
const sourceCells = new Set();
for (const sprite of explorationSprites) {
  const def = capturedSprites.get(sprite);
  const metadata = explorationManifest.assets[sprite];
  assert.ok(metadata, `${sprite} has manifest metadata`);
  assert.equal(metadata.group, explorationGroups.find((group) => explorationManifest.groups[group].includes(sprite)));
  assert.equal(def.source.path, explorationManifest.source.path);
  assert.equal(def.source.sha256, actualSourceHash);
  assert.equal(def.source.png, metadata.png);
  assert.deepEqual(Array.from(def.source.cell), Array.from(metadata.cell));
  sourceCells.add(Array.from(metadata.cell).join(','));
  const png = fs.readFileSync(path.join(ROOT, metadata.png));
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG', `${sprite} exports a PNG`);
  assert.equal(png.readUInt32BE(16), metadata.size[0], `${sprite} PNG width matches manifest`);
  assert.equal(png.readUInt32BE(20), metadata.size[1], `${sprite} PNG height matches manifest`);
  const source = def.frames ? def : capturedSprites.get(def.variantOf);
  const palette = def.pal || source.pal;
  for (const rows of Object.values(source.frames)) {
    for (const row of rows) {
      for (const pixel of row) {
        assert.ok(
          pixel === '.' || pixel === ' ' || Object.hasOwn(palette, pixel),
          `${sprite} frame pixel ${JSON.stringify(pixel)} has a palette color`
        );
      }
    }
  }
}
assert.equal(sourceCells.size, 18, 'all 18 source cells are consumed exactly once');

/* ------------------------------------------------------------------ *
 * 统一物品接口 + 掉落判定/入包拆分。
 * ------------------------------------------------------------------ */
const itemBox = sandboxWithCore([
  'js/data/formulas.js',
  'js/data/items.js',
  'js/systems/inventory.js',
  'js/systems/items.js'
]);
const IG = itemBox.Game;
const itemEvents = [];
IG.bus.on('item:used', (payload) => itemEvents.push({ name: 'item:used', payload }));
IG.bus.on('potion:used', (payload) => itemEvents.push({ name: 'potion:used', payload }));
IG.entryState = 'active';
IG.state = {
  settings: { groundLoot: true, potionThreshold: 0.3 },
  player: { hp: 100, level: 10, gold: 0, crystal: 0, perms: {} },
  inv: {
    items: [],
    equipped: { weapon: null, armor: null, ring: null },
    lockedSlots: { weapon: false, armor: false, ring: false },
    potions: { potion_small: 2, potion_large: 1 },
    materials: {}
  },
  world: { mode: 'battle', region: 'r1' },
  meta: {
    stats: {
      potions: 0, materials: 0, drops: 0, legendaries: 0,
      pickups: 0, gathers: 0, chests: 0, sells: 0
    }
  }
};
IG.player = {
  derived() {
    return { maxHp: 100, healPow: 1.25, dropMul: 1, goldMul: 1 };
  },
  restMults() { return { drop: 1 }; },
  heal(amount) {
    IG.state.player.hp = Math.min(100, IG.state.player.hp + amount);
    return IG.state.player.hp;
  },
  addGold(amount) { IG.state.player.gold += amount; },
  addCrystal(amount) { IG.state.player.crystal += amount; },
  recalc() {}
};
IG.world = {
  hero: { x: 100, y: 100, state: 'idle', spriteH: 20, itemCd: { potion: 0 }, potionCd: 0 },
  bossEnt: null
};
IG.transitions = { isActive: () => false };
IG.ending = { isActive: () => false };

assert.equal(IG.items.use('potion', 'potion_small', { source: 'manual' }).reason, 'full');
assert.equal(IG.state.inv.potions.potion_small, 2, 'full HP never consumes a potion');
IG.state.player.hp = 50;
const manualPotion = IG.items.use('potion', 'potion_small', { source: 'manual' });
assert.equal(manualPotion.ok, true);
assert.equal(manualPotion.effect.amount, 50, 'healPow applies through the unified handler');
assert.equal(IG.state.inv.potions.potion_small, 1);
assert.equal(IG.state.meta.stats.potions, 1);
assert.equal(IG.items.cdLeft('potion'), IG.F.BAL.potionCd);
assert.equal(IG.inv.consumePotion({ source: 'auto' }), null, 'auto use shares the manual cooldown');
assert.equal(
  IG.items.describe(IG.reg.get('itemUse', 'potion_small')).key,
  'item.healDesc',
  'effect handlers provide UI descriptions without category-specific rendering'
);
IG.items.update(IG.F.BAL.potionCd);
IG.state.player.hp = 20;
const automaticPotion = IG.inv.consumePotion();
assert.equal(automaticPotion.pid, 'potion_small', 'legacy wrapper retains small-first priority');
assert.equal(IG.state.meta.stats.potions, 2);
assert.deepEqual(
  itemEvents.filter((event) => event.name === 'item:used').map((event) => event.payload.source),
  ['manual', 'auto']
);
IG.world.hero.state = 'recover';
IG.items.update(IG.F.BAL.potionCd);
assert.equal(IG.items.use('potion', 'potion_large').reason, 'busy');
IG.world.hero.state = 'idle';

// Statistical guard: the judgement phase retains 16% equipment / 7% potion rates.
const originalChance = IG.util.chance;
let equipRolls = 0;
let potionRolls = 0;
for (let i = 0; i < 40000; i++) {
  const results = IG.inv.rollDropResults(1, false);
  if (results.some((drop) => drop.category === 'equipment')) equipRolls++;
  if (results.some((drop) => drop.category === 'potion')) potionRolls++;
}
assert.ok(Math.abs(equipRolls / 40000 - IG.F.BAL.dropEquip) < 0.012);
assert.ok(Math.abs(potionRolls / 40000 - IG.F.BAL.dropPotion) < 0.009);

// Deterministic delivery split: normal combat lands, switch-off and Boss bank directly.
IG.util.chance = () => true;
const spawnedDrops = [];
IG.world.spawnGroundLoot = (drop) => { spawnedDrops.push(drop); return true; };
const itemsBeforeGround = IG.state.inv.items.length;
IG.inv.rollDrops(1, false, { source: 'combat', x: 10, y: 10 });
assert.equal(spawnedDrops.length, 2);
assert.equal(IG.state.inv.items.length, itemsBeforeGround);
IG.state.settings.groundLoot = false;
IG.inv.rollDrops(1, false, { source: 'combat', x: 10, y: 10 });
assert.equal(IG.state.inv.items.length, itemsBeforeGround + 1);
const beforeBoss = IG.state.inv.items.length;
IG.state.settings.groundLoot = true;
IG.inv.rollDrops(1, true, { source: 'boss', x: 10, y: 10 });
assert.equal(IG.state.inv.items.length, beforeBoss + 1, 'Boss loot bypasses the ground layer');
IG.util.chance = originalChance;

// Material exchange consumes the formula-owned recipe and remains trade-domain guarded.
vm.runInContext(read('js/systems/trade.js'), itemBox, { filename: 'js/systems/trade.js' });
vm.runInContext(read('js/systems/shop.js'), itemBox, { filename: 'js/systems/shop.js' });
IG.State = { regionTier: () => 1 };
IG.state.world.region = 'r1';
IG.state.inv.materials.herb = 3;
IG.state.inv.materials.berry = 2;
IG.world.region = {
  id: 'r1',
  tradeAreas: [{
    id: 'exchange',
    anchor: { x: 100, y: 100 },
    radius: 50,
    catalogs: ['camp-exchange']
  }]
};
IG.world.layout = {};
IG.world.hero.x = 100;
IG.world.hero.y = 100;
const potionCountBeforeExchange = IG.state.inv.potions.potion_small;
const exchangePotion = IG.shop.buy('exchange_potion');
assert.equal(exchangePotion.ok, true);
assert.equal(IG.state.inv.potions.potion_small, potionCountBeforeExchange + 2);
assert.equal(IG.state.inv.materials.herb, 0);
assert.equal(IG.state.inv.materials.berry, 0);
IG.world.hero.x = 300;
assert.equal(
  IG.shop.buy('exchange_gold').reason,
  'outside',
  'exchange transactions are rejected outside their declared trade domain'
);

/* ------------------------------------------------------------------ *
 * 地面物保底、自动优先级与自动回营状态机（world 单元沙箱）。
 * ------------------------------------------------------------------ */
const worldBox = sandboxWithCore(['js/data/formulas.js', 'js/systems/world.js']);
const WG = worldBox.Game;
const worldEvents = [];
WG.bus.on('loot:spawned', (payload) => worldEvents.push({ name: 'loot:spawned', payload }));
WG.bus.on('camp:autoReturn', (payload) => worldEvents.push({ name: 'camp:autoReturn', payload }));
WG.entryState = 'active';
WG.state = {
  settings: {
    groundLoot: true, autoCampRest: false, controlMode: 'auto',
    potionThreshold: 0.3, effects: true
  },
  player: { hp: 100 },
  inv: { items: [], potions: {}, materials: {} },
  world: {
    mode: 'battle', region: 'r1', worldTime: 500, restBuffT: 0,
    regionProg: { r1: { kills: 0, cleared: false, firstKill: false } }
  },
  meta: { stats: { pickups: 0 } }
};
WG.player = {
  hasClass: () => true,
  hpPct: () => 1,
  derived: () => ({ maxHp: 100 }),
  heal() {},
  restMults: () => ({ drop: 1 })
};
WG.State = {
  regionProg: () => WG.state.world.regionProg.r1,
  regionTier: () => 1
};
const committed = [];
WG.inv = {
  commitDrop(drop) { committed.push(drop); return drop; }
};
WG.nav = { clear() {}, finder: null };
WG.transitions = { isActive: () => false };
WG.ending = { isActive: () => false };
WG.environment = {
  chests: () => [],
  nearestChest: () => null,
  nearestNode: () => null,
  nodeReady: () => true,
  update() {},
  recordHeroMovement() {}
};
WG.trade = { areas: () => [], reset() {} };
WG.combat = { potionTick() {} };
WG.items = { update() {} };
WG.particles = null;
WG.ui = { itemName: () => 'Gear', trade: { close() {} } };
WG.world.region = { id: 'r1', killTarget: 10, world: { w: 900, h: 520 } };
WG.world.layout = {
  camp: { x: 100, y: 260 }, bossPoint: { x: 760, y: 260 },
  campSafeRadius: 80, bossSafeRadius: 70, nodes: []
};
WG.world.hero = {
  kind: 'hero', x: 350, y: 260, state: 'idle', target: null,
  moveOrder: null, interactOrder: null, manualTarget: false, campWarp: null
};

for (let i = 0; i < 25; i++) {
  WG.world.spawnGroundLoot(
    { category: 'potion', id: 'potion_small', count: 1 },
    300, 250,
    { source: 'combat' }
  );
}
assert.equal(WG.world.groundLoot.length, 24);
assert.equal(committed.length, 1, 'the oldest drop is banked when the 24-item cap is exceeded');
WG.world.updateGroundLoot(WG.F.BAL.groundLootTtl);
assert.equal(WG.world.groundLoot.length, 0);
assert.equal(committed.length, 25, 'TTL reclamation guarantees all rewards');

WG.world.spawnGroundLoot({ category: 'potion', id: 'potion_small' }, 300, 250, {});
WG.state.settings.groundLoot = false;
WG.world.updateGroundLoot(0);
assert.equal(WG.world.groundLoot.length, 0, 'disabling ground loot immediately banks existing entities');
WG.state.settings.groundLoot = true;

const priorityLoot = { kind: 'groundLoot', id: 'priority-loot', x: 360, y: 260, drop: { category: 'potion', id: 'potion_small' } };
const priorityChest = { kind: 'chest', id: 'priority-chest', x: 365, y: 260 };
const priorityNode = { kind: 'gatherNode', id: 'priority-node', x: 370, y: 260 };
WG.world.groundLoot.push(priorityLoot);
WG.environment.chests = () => [priorityChest];
WG.environment.nearestChest = () => ({ target: priorityChest, distance: 15 });
WG.environment.nearestNode = () => ({ target: priorityNode, distance: 20 });
assert.equal(WG.world.chooseAmbientInteraction(WG.world.hero), true);
assert.equal(WG.world.hero.interactOrder.type, 'loot');
WG.world.hero.interactOrder = null;
WG.world.groundLoot.length = 0;
WG.environment.chests = () => [priorityChest];
assert.equal(WG.world.chooseAmbientInteraction(WG.world.hero), true);
assert.equal(WG.world.hero.interactOrder.type, 'chest');
WG.world.hero.interactOrder = null;
WG.environment.nearestChest = () => null;
assert.equal(WG.world.chooseAmbientInteraction(WG.world.hero), true);
assert.equal(WG.world.hero.interactOrder.type, 'gather');

// Auto-camp: only auto control, no boss/full gauge/target; manual break suppresses 120s.
WG.world.hero.interactOrder = null;
WG.state.settings.autoCampRest = true;
WG.world.contactThreat = () => null;
WG.world.updateAutoCamp(WG.world.hero);
assert.equal(WG.state.world.mode, 'rest');
assert.equal(WG.world.autoCampCycle, true);
assert.ok(worldEvents.some((event) => event.name === 'camp:autoReturn'));
WG.world.setMode('battle'); // player explicitly breaks/cancels the cycle
assert.equal(WG.world.autoCampSuppressedUntil, 620);
WG.world.updateAutoCamp(WG.world.hero);
assert.equal(WG.state.world.mode, 'battle', 'suppression prevents immediate re-trigger');

/* ------------------------------------------------------------------ *
 * 环境时钟、合法移动累积、宝箱合法落点/过期与采集产出。
 * ------------------------------------------------------------------ */
const envBox = sandboxWithCore(['js/data/formulas.js', 'js/systems/environment.js']);
const EG = envBox.Game;
const envEvents = [];
EG.bus.on('chest:spawned', (p) => envEvents.push({ name: 'chest:spawned', p }));
EG.bus.on('chest:expired', (p) => envEvents.push({ name: 'chest:expired', p }));
EG.bus.on('gather:done', (p) => envEvents.push({ name: 'gather:done', p }));
EG.state = {
  settings: {},
  player: { level: 10 },
  inv: { materials: {} },
  world: { mode: 'battle', region: 'r1', nodeCooldowns: {} },
  meta: { stats: { materials: 0, gathers: 0, chests: 0 } }
};
EG.State = { regionTier: () => 3 };
EG.world = {
  BOUND_TOP: 68,
  bossEnt: null,
  hero: { x: 300, y: 300, state: 'walk', interactOrder: null },
  region: {
    gather: { nodes: [{ material: 'ore' }, { material: 'crystal_cluster' }] }
  },
  layout: {
    world: { w: 900, h: 520 },
    camp: { x: 100, y: 120 }, bossPoint: { x: 780, y: 120 },
    campSafeRadius: 80, bossSafeRadius: 70,
    corridor: { points: [{ x: 100, y: 120 }, { x: 780, y: 120 }], width: 48 },
    spawnCandidates: [{ x: 360, y: 300 }],
    nodes: []
  },
  cancelInteraction() {}
};
EG.transitions = { isActive: () => false };
EG.ending = { isActive: () => false };
EG.terrain = {
  costAt: () => 1,
  distanceToPath(x, y) { return Math.abs(y - 120); }
};
EG.inv = {
  addMaterial(id, n) {
    EG.state.inv.materials[id] = (EG.state.inv.materials[id] || 0) + n;
    EG.state.meta.stats.materials += n;
  },
  genLoot() { return { uid: 'chest-gear', rar: 2 }; },
  delivered: [],
  deliverDrops(results, opts) { this.delivered.push({ results, opts }); },
  materialCount(id) { return EG.state.inv.materials[id] || 0; }
};
EG.player = {
  addGold() {},
  addCrystal() {}
};

assert.equal(EG.environment.isLegalChestSpot(360, 300), true);
assert.equal(EG.environment.isLegalChestSpot(120, 120), false);
assert.equal(EG.environment.isLegalChestSpot(360, 125), false);
EG.state.world.mode = 'rest';
EG.environment.recordHeroMovement(20, 10);
assert.equal(EG.environment.progressSnapshot().seconds, 0);
EG.state.world.mode = 'battle';
EG.world.hero.interactOrder = { type: 'trade' };
EG.environment.recordHeroMovement(20, 10);
assert.equal(EG.environment.progressSnapshot().seconds, 0);
EG.world.hero.interactOrder = null;
EG.environment.recordHeroMovement(20, 10);
assert.ok(EG.environment.progressSnapshot().seconds <= EG.F.BAL.chestMoveFrameCap);
assert.equal(
  EG.environment.progressSnapshot().distance,
  EG.F.BAL.chestMoveRefSpeed * EG.F.BAL.chestMoveFrameCap,
  'large dt is capped after converting actual distance to standard movement time'
);
EG.environment.resetRegion();
for (let i = 0; i < 6000 && EG.environment.chests().length === 0; i++) {
  EG.environment.recordHeroMovement(4, 0.25);
}
assert.equal(EG.environment.chests().length, 1, 'legal movement eventually discovers one chest');
const spawnedChest = EG.environment.chests()[0];
assert.equal(EG.environment.isLegalChestSpot(spawnedChest.x, spawnedChest.y), true);
EG.environment.update(EG.F.BAL.chestTtl + 0.1);
assert.equal(EG.environment.chests().length, 0);
assert.ok(envEvents.some((event) => event.name === 'chest:expired'));

const gatherNode = {
  id: 'r1:ore:0', material: 'ore', x: 400, y: 300,
  cooldown: 120, accent: '#fff'
};
const gathered = EG.environment.completeGather(gatherNode);
assert.ok(gathered.count >= 1);
assert.equal(EG.state.world.nodeCooldowns[gatherNode.id], 120);
EG.environment.restoreOffline(90);
assert.equal(EG.state.world.nodeCooldowns[gatherNode.id], 30);
EG.environment.update(30);
assert.equal(EG.environment.nodeReady(gatherNode), true);
const savedChance = EG.util.chance;
EG.util.chance = () => true;
EG.state.settings.groundLoot = false;
const rareChest = EG.environment.spawnChest();
assert.ok(rareChest && rareChest.rare);
EG.environment.openChest(rareChest);
assert.equal(
  EG.inv.delivered.at(-1).opts.forceGround,
  false,
  'rare chest equipment follows the ground-loot switch and banks directly when disabled'
);
EG.util.chance = savedChance;

/* ------------------------------------------------------------------ *
 * 动态交易域、prop 解析、过期与一次性走近指令。
 * ------------------------------------------------------------------ */
const tradeBox = sandboxWithCore(['js/systems/trade.js']);
const TG = tradeBox.Game;
const tradeEvents = [];
TG.bus.on('trade:contextChanged', (payload) => tradeEvents.push(payload));
TG.entryState = 'active';
TG.state = { world: { region: 'r1', worldTime: 10 } };
TG.world = {
  bossEnt: null,
  region: {
    id: 'r1',
    tradeAreas: [{
      id: 'camp',
      anchor: 'camp',
      radius: 50,
      catalogs: ['camp-general'],
      prop: { style: 'supply-cart' }
    }]
  },
  layout: { camp: { x: 100, y: 100 } },
  hero: { x: 500, y: 200, state: 'idle' },
  startInteraction(order) { TG.world.lastOrder = order; return true; }
};
TG.transitions = { isActive: () => false };
TG.ending = { isActive: () => false };
TG.ui = { trade: { open() {} } };
assert.ok(TG.trade.areas()[0].prop);
const dynamic = TG.trade.registerDynamic({
  id: 'qa-wanderer',
  kind: 'wander',
  x: 500,
  y: 200,
  radius: 42,
  catalogs: ['qa'],
  prop: { style: 'wagon' }
}, { ttl: 5 });
assert.equal(dynamic.ok, true);
assert.equal(TG.trade.current().areaId, 'qa-wanderer');
const eventsBeforeDedupe = tradeEvents.length;
TG.trade.update();
assert.equal(tradeEvents.length, eventsBeforeDedupe, 'unchanged context does not emit again');
TG.state.world.worldTime = 16;
TG.trade.update();
assert.equal(TG.trade.areaById('qa-wanderer'), null);
TG.world.hero.x = 220;
TG.world.hero.y = 100;
const approach = TG.trade.requestApproach('camp', { open: true, source: 'gate' });
assert.equal(approach.ok, true);
assert.equal(TG.world.lastOrder.type, 'trade');
assert.equal(TG.world.lastOrder.areaId, 'camp', 'nearest guidance is generic, not camp-state hardcoded');
TG.world.hero.x = 100;
TG.world.hero.y = 100;
TG.trade.update();
TG.trade.registerDynamic({
  id: 'inactive-event-stall',
  kind: 'event',
  x: 700,
  y: 200,
  radius: 40,
  catalogs: ['event'],
  prop: { style: 'stall' }
}, { ttl: 1 });
const beforeInactiveExpiry = tradeEvents.length;
TG.state.world.worldTime = 18;
TG.trade.update();
assert.equal(tradeEvents.length, beforeInactiveExpiry + 1);
assert.deepEqual(
  Array.from(tradeEvents.at(-1).expired),
  ['inactive-event-stall'],
  'dynamic expiry emits once even when the active context itself did not change'
);

/* ------------------------------------------------------------------ *
 * v8→v11 migration defaults, serialization and script ordering.
 * ------------------------------------------------------------------ */
Game.state = Game.State.newGame();
const v8 = Game.save.serialize();
v8.v = 8;
delete v8.inv.materials;
delete v8.world.nodeCooldowns;
delete v8.settings.groundLoot;
delete v8.settings.autoCampRest;
for (const key of ['pickups', 'gathers', 'materials', 'chests']) delete v8.meta.stats[key];
localStorage.setItem('firpg_save', JSON.stringify(v8));
localStorage.setItem('firpg_save_backup', JSON.stringify(v8));
const migratedV11 = Game.save.load();
assert.equal(migratedV11.v, 11);
assert.deepEqual(Object.keys(migratedV11.inv.materials), []);
assert.deepEqual(Object.keys(migratedV11.world.nodeCooldowns), []);
assert.deepEqual(Object.keys(migratedV11.world.exploration), []);
assert.equal(migratedV11.world.layoutVersion, 3);
assert.equal(migratedV11.world.finalRegionLocked, false);
assert.equal(migratedV11.settings.groundLoot, true);
assert.equal(migratedV11.settings.autoCampRest, false);
assert.equal(migratedV11.settings.expeditionStrategy, 'balanced');
delete migratedV11.settings.autoBoss;
Game.save.applyLoaded(migratedV11);
assert.equal(Game.state.settings.autoBoss, true, 'old saves inherit automatic boss hunts');

const interruptedFinalLoss = Game.save.serialize();
interruptedFinalLoss.world.finalRegionLocked = true;
interruptedFinalLoss.world.region = interruptedFinalLoss.world.regionOrder.at(-1);
interruptedFinalLoss.player.hp = 0;
Game.save.applyLoaded(interruptedFinalLoss);
assert.equal(
  Game.state.world.region,
  interruptedFinalLoss.world.regionOrder.at(-2),
  'a save interrupted before final-loss landing resumes in the previous region'
);
assert.equal(Game.state.world.mode, 'rest');
assert.equal(Game.state.world.finalRegionLocked, true);

const index = read('index.html');
assert.ok(index.indexOf('js/systems/items.js') < index.indexOf('js/systems/combat.js'));
assert.ok(index.indexOf('js/systems/environment.js') < index.indexOf('js/systems/world.js'));
assert.ok(index.indexOf('js/ui/trade.js') > index.indexOf('js/ui/panels_main.js'));
const demoHtml = read('tech-demos/map-effects/map-effects.html');
assert.match(demoHtml, /spawn-dynamic-trade/);
assert.ok(demoHtml.indexOf('js/systems/environment.js') < demoHtml.indexOf('js/systems/world.js'));
for (const control of [
  'focus-gather', 'reset-gather', 'spawn-common-chest', 'spawn-rare-chest',
  'gather-runtime', 'discovery-runtime', 'chest-runtime'
]) {
  assert.match(demoHtml, new RegExp(`id="${control}"`), `tech demo exposes ${control}`);
}
for (const event of [
  'loot:spawned', 'item:pickedUp', 'item:used', 'gather:start', 'gather:done',
  'gather:interrupted', 'chest:spawned', 'chest:opened', 'chest:expired',
  'camp:autoReturn'
]) {
  assert.match(read('js/core/eventbus.js'), new RegExp(event.replace(':', '\\:')));
}

console.log(
  `v1.11 tests passed: ${nodeLayouts} node layouts, drops, item-use, ground guarantees, ` +
  'movement chests, gathering, auto-camp, dynamic trade and v11 migration.'
);
