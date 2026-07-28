'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const actors = {
  hero: {
    id: 'hero', kind: 'hero', x: 0, y: 20, spriteH: 20, dir: 'r',
    components: { body: { collisionRadius: 8 } }
  },
  enemy: {
    id: 'enemy', kind: 'monster', x: 26, y: 20, spriteH: 20, dir: 'l', hp: 100,
    components: { body: { collisionRadius: 8 } }
  },
  ally: {
    id: 'ally', kind: 'hero', x: -24, y: 20, spriteH: 20, dir: 'r',
    components: { body: { collisionRadius: 8 } }
  }
};
const abilities = {
  melee: {
    id: 'melee', actionType: 'gcd',
    target: { relation: 'hostile', shape: 'single', range: 26 },
    presentation: { icon: 'icon_skill_strike' }
  },
  ranged: {
    id: 'ranged', actionType: 'gcd',
    target: { relation: 'hostile', shape: 'single', range: 90 },
    presentation: { icon: 'icon_skill_fire', projectile: 'bolt' }
  },
  area: {
    id: 'area', actionType: 'gcd',
    target: { relation: 'hostile', shape: 'selfRadius', radius: 48 },
    presentation: { icon: 'icon_skill_whirl' }
  }
};
const calls = [];
let combatListener = null;
let projectileImpact = null;
const Game = {
  util: {
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    dirOf: (dx, dy) => Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'l' : 'r') : (dy < 0 ? 'u' : 'd'),
    rand: (min, max) => (min + max) / 2
  },
  i18n: {
    t: (key) => key === 'ui.miss' ? 'MISS' : key,
    fmtNum: (value) => String(Math.round(value))
  },
  actors: { get: (id) => actors[id] || null },
  content: { get: (type, id) => type === 'ability' ? abilities[id] || null : null },
  relations: { resolve: (source, target) => target === 'enemy' ? 'hostile' : 'ally' },
  bus: {
    on(type, fn) { if (type === 'combat:event') combatListener = fn; }
  },
  fx: {
    floatText(...args) { calls.push(['floatText', ...args]); },
    hitSpark(...args) { calls.push(['hitSpark', ...args]); },
    slash(...args) { calls.push(['slash', ...args]); },
    heal(...args) { calls.push(['heal', ...args]); },
    ring(...args) { calls.push(['ring', ...args]); },
    projectile(...args) {
      calls.push(['projectile', args[3], args[5]]);
      projectileImpact = args[4];
    }
  }
};
const box = { window: { Game }, console, JSON, Math, Number, Object, Array };
vm.createContext(box);
vm.runInContext(read('js/render/combat_presentation.js'), box, {
  filename: 'js/render/combat_presentation.js'
});
assert.equal(typeof combatListener, 'function', 'production event bus registers the adapter');

function event(type, abilityId, targetId, payload, sequence) {
  return {
    type, encounterId: 'test', tick: sequence, sequence,
    sourceActorId: 'hero', targetActorIds: [targetId || 'enemy'],
    abilityId, payload: payload || {}
  };
}

combatListener(event('combat:hit', 'melee', 'enemy', {
  amount: 12, absorbed: 3, crit: true
}, 1));
assert.equal(actors.hero.presentationTargetId, 'enemy');
assert.equal(actors.hero.presentationNoLunge, false);
assert.equal(actors.hero.lungeT, .18);
assert.ok(calls.some((call) => call[0] === 'floatText' && call[3] === '-15'));
assert.ok(calls.some((call) => call[0] === 'hitSpark'));
assert.ok(calls.some((call) => call[0] === 'slash'));

const beforeProjectileImpact = calls.length;
combatListener(event('combat:hit', 'ranged', 'enemy', {
  amount: 9, absorbed: 0, crit: false
}, 2));
assert.equal(actors.hero.presentationNoLunge, true);
assert.ok(calls.some((call) => call[0] === 'projectile' &&
  call[1] === 'bolt' && call[2].allowDead === true));
assert.equal(calls.slice(beforeProjectileImpact).some((call) => call[0] === 'hitSpark'), false,
  'ranged impact waits for the visible projectile');
projectileImpact();
assert.ok(calls.slice(beforeProjectileImpact).some((call) => call[0] === 'hitSpark'));

combatListener(event('combat:miss', 'melee', 'enemy', {}, 3));
combatListener(event('combat:healed', 'melee', 'ally', { amount: 18 }, 4));
combatListener(event('combat:shielded', 'melee', 'ally', { amount: 22 }, 5));
combatListener(event('action:resolved', 'area', 'enemy', {}, 6));
assert.ok(calls.some((call) => call[0] === 'floatText' && call[3] === 'MISS'));
assert.ok(calls.some((call) => call[0] === 'heal'));
assert.ok(calls.filter((call) => call[0] === 'ring').length >= 2);
assert.equal(Game.combatPresentation.snapshot().records
  .find((record) => record.eventType === 'combat:healed').contact, null,
  'non-hostile presentation does not report a collision diagnostic');

actors.enemy.x = 5;
combatListener(event('combat:hit', 'melee', 'enemy', {
  amount: 1, absorbed: 0, crit: false
}, 7));
let snapshot = Game.combatPresentation.snapshot();
assert.equal(snapshot.records.at(-1).contact.overlapping, true,
  'presentation diagnostics expose unsafe contact at the exact impact');
for (let index = 0; index < 200; index++) {
  combatListener(event('combat:miss', 'melee', 'enemy', {}, 10 + index));
}
snapshot = Game.combatPresentation.snapshot();
assert.equal(snapshot.records.length, 160, 'diagnostic log remains bounded');
Game.combatPresentation.reset();
assert.equal(Game.combatPresentation.snapshot().recordCount, 0);

// V2 damage is committed before the visual projectile arrives. A lethal hit
// must still reach the last known target position and invoke its impact FX.
let landed = 0;
const deadTarget = { x: 20, y: 10, spriteH: 12, hp: 0, dead: true };
const effectsGame = {
  util: {
    rand: (a, b) => (a + b) / 2,
    randInt: (a) => a,
    chance: () => false
  },
  i18n: { t: (key) => key }
};
const effectsBox = {
  window: { Game: effectsGame },
  document: { createElement: () => ({ style: {} }), getElementById: () => null },
  console, Math, Number, Object, Array, JSON, setTimeout, clearTimeout
};
vm.createContext(effectsBox);
vm.runInContext(read('js/render/effects.js'), effectsBox, {
  filename: 'js/render/effects.js'
});
effectsGame.fx.projectile(0, 4, deadTarget, 'arrow', () => { landed++; }, { allowDead: true });
for (let index = 0; index < 10 && landed === 0; index++) effectsGame.fx.update(.02);
assert.equal(landed, 1, 'lethal projectile reaches the last known target position');
assert.equal(effectsGame.fx.inspect().projectiles, 0);
effectsGame.fx.floatText(0, 0, '-1');
effectsGame.fx.hitSpark(0, 0, false);
assert.deepEqual(
  JSON.parse(JSON.stringify(effectsGame.fx.inspect())),
  { floats: 1, shapes: 1, projectiles: 0, shapeKinds: { spark: 1 }, projectileKinds: {} }
);
effectsGame.fx.reset();
assert.equal(effectsGame.fx.inspect().floats, 0);
assert.equal(effectsGame.fx.inspect().shapes, 0);

console.log('Combat V2 presentation adapter passed.');
