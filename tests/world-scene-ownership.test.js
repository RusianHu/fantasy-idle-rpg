'use strict';
// Exercise the production encounter:ended callback, not a duplicate predicate.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../js/systems/world.js'), 'utf8');
let cases = 0;
for (const mode of ['manual', 'auto']) {
  for (const scene of ['ending', 'transition', null]) {
    for (const reason of ['victory', 'retreat', 'region-change']) {
      const listeners = {}, replans = [], commits = [];
      const Game = {
        util: {}, F: {}, reg: {},
        state: { world: { mode: 'battle' }, settings: { controlMode: mode }, player: {} },
        bus: { on(name, fn) { (listeners[name] || (listeners[name] = [])).push(fn); } },
        transitions: { isActive: () => scene === 'transition' },
        ending: { isActive: () => scene === 'ending' },
        units: { commit(actor) { commits.push(actor); } },
        nav: { clear() {} }, expeditionAI: { replan(reason) { replans.push(reason); } }
      };
      vm.runInNewContext(source, { window: { Game, addEventListener() {} }, document: { addEventListener() {} } });
      const hero = Game.world.hero = { state: scene || 'battle', components: { vitals: {} }, target: {}, moveOrder: {} };
      Game.world.bindControls(); Game.world.bindControls();
      assert.strictEqual(listeners['encounter:ended'].length, 1, 'subscription is not duplicated');
      listeners['encounter:ended'][0]({ payload: { reason } });
      assert.strictEqual(commits.length, 1, 'scene ownership does not suppress vital settlement');
      if (scene || reason === 'region-change') {
        assert.strictEqual(hero.state, scene || 'battle', 'settlement must preserve scene ownership: ' + scene + '/' + mode);
        assert.deepStrictEqual(replans, [], 'scene cannot re-enter exploration planning');
      } else if (mode === 'manual') assert.strictEqual(hero.state, 'idle', 'ordinary manual settlement stays functional');
      else assert.deepStrictEqual(replans, ['combat-ended:' + reason], 'ordinary auto settlement stays functional');
      cases++;
    }
  }
}
console.log('[world-scene-ownership] ' + cases + ' production callback cases');
