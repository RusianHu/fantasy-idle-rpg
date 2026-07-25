'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

require('./v1_7.test.js');

const ROOT = path.resolve(__dirname, '..');
function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
}

function makeV7(completed) {
  Game.state = Game.State.newGame();
  const data = Game.save.serialize();
  data.v = 7;
  delete data.meta.completedAt;
  delete data.meta.endingAcknowledged;
  delete data.meta.endingPhase;
  delete data.meta.endingLine;
  const finalRid = data.world.regionOrder.at(-1);
  data.world.regionProg[finalRid] = {
    kills: 0,
    cleared: !!completed,
    firstKill: !!completed
  };
  return data;
}

const completedV7 = makeV7(true);
localStorage.setItem('firpg_save', JSON.stringify(completedV7));
localStorage.setItem('firpg_save_backup', JSON.stringify(completedV7));
const migratedComplete = Game.save.load();
assert.equal(migratedComplete.v, 8);
assert.equal(migratedComplete.meta.completedAt, completedV7.ts);
assert.equal(migratedComplete.meta.endingAcknowledged, false);
assert.equal(migratedComplete.meta.endingPhase, 'epilogue');
assert.equal(migratedComplete.meta.endingLine, 0);
Game.save.applyLoaded(migratedComplete);
const completedAt = Game.state.meta.completedAt;
const endingB64 = Game.save.exportB64();
assert.equal(Game.save.importB64(endingB64).ok, true);
assert.equal(Game.state.meta.completedAt, completedAt);
assert.equal(Game.state.meta.endingPhase, 'epilogue');
const endingJson = JSON.stringify(Game.save.serialize());
assert.equal(Game.save.importFileText(endingJson).ok, true);
assert.equal(Game.state.meta.completedAt, completedAt);
assert.equal(Game.state.meta.endingAcknowledged, false);

const incompleteV7 = makeV7(false);
localStorage.setItem('firpg_save', JSON.stringify(incompleteV7));
localStorage.setItem('firpg_save_backup', JSON.stringify(incompleteV7));
const migratedIncomplete = Game.save.load();
assert.equal(migratedIncomplete.v, 8);
assert.equal(migratedIncomplete.meta.completedAt, null);
assert.equal(migratedIncomplete.meta.endingPhase, null);

let cinematicShows = 0;
let epilogueShows = 0;
let summaryShows = 0;
let closes = 0;
let epilogueCallbacks = null;
const visualPhases = [];
Game.ui.ending = {
  showCinematic() { cinematicShows++; },
  setCinematicPhase(name) { visualPhases.push(name); },
  showEpilogue(line, callbacks) {
    epilogueShows++;
    epilogueCallbacks = callbacks;
    assert.ok(line >= 0 && line <= 5);
  },
  showSummary() { summaryShows++; },
  advanceStory() { return true; },
  close() { closes++; }
};

let saveCount = 0;
Game.save.save = function () { saveCount++; return true; };
Game.fx = {
  shake() {},
  finaleBurst() {}
};
Game.nav = { clear(hero) { hero.navRoute = null; } };

load('js/systems/ending.js');
Game.ending.init();

function resetEndingState() {
  Game.ending.resetRuntime();
  Game.state = Game.State.newGame();
  Game.state.player.classId = 'fighter';
  Game.state.meta.prologueDone = true;
  const hero = {
    kind: 'hero', state: 'fight', target: null, manualTarget: false,
    moveOrder: null, moving: false, navRoute: null, x: 120, y: 160
  };
  const boss = {
    kind: 'monster', boss: true, dead: true, mid: 'demon_lord',
    x: 700, y: 180, spriteH: 36, deathT: 0.5
  };
  hero.target = boss;
  Game.world = { hero, entities: [hero, boss], cinematic: null };
  return { hero, boss, order: Game.State.regionOrder() };
}

let fixture = resetEndingState();
Game.bus.emit('boss:defeated', {
  rid: fixture.order[0], mid: 'elder_treant', first: true, tier: 1
});
assert.equal(Game.ending.isActive(), false, 'an intermediate first kill does not trigger the ending');

const finalRid = fixture.order.at(-1);
let completedEvents = 0;
let continuedEvents = 0;
Game.bus.on('game:completed', () => { completedEvents++; });
Game.bus.on('game:continued', () => { continuedEvents++; });
Game.bus.emit('boss:defeated', {
  rid: finalRid, mid: 'demon_lord', first: true, tier: fixture.order.length
});
assert.equal(Game.ending.phase(), 'cinematic');
assert.equal(Game.ending.isPending(), true);
assert.equal(Game.state.meta.endingPhase, 'cinematic');
assert.equal(Game.world.hero.state, 'ending');
assert.equal(cinematicShows, 1);
assert.equal(completedEvents, 1);
assert.ok(saveCount > 0, 'completion is saved immediately');

Game.ending.update(1.2);
assert.ok(visualPhases.includes('dissolve'));
Game.ending.advance();
Game.ending.advance();
assert.equal(Game.ending.phase(), 'epilogue');
assert.equal(epilogueShows, 1);
epilogueCallbacks.onLine(4);
assert.equal(Game.state.meta.endingLine, 4, 'current epilogue line is persisted');
epilogueCallbacks.onDone();
assert.equal(Game.ending.phase(), 'summary');
assert.equal(Game.state.meta.endingPhase, 'summary');
assert.equal(summaryShows, 1);

assert.equal(Game.ending.continueGame(), true);
assert.equal(Game.ending.isActive(), false);
assert.equal(Game.ending.isPending(), false);
assert.equal(Game.state.meta.endingAcknowledged, true);
assert.equal(Game.world.hero.state, 'idle');
assert.equal(Game.world.entities.some((entity) => entity.boss), false);
assert.equal(continuedEvents, 1);

Game.bus.emit('boss:defeated', {
  rid: finalRid, mid: 'demon_lord', first: false, tier: fixture.order.length
});
assert.equal(Game.ending.isActive(), false, 'repeat final boss kills do not replay the ending');
assert.equal(cinematicShows, 1);

fixture = resetEndingState();
Game.state.meta.completedAt = Date.now();
Game.state.meta.endingAcknowledged = false;
Game.state.meta.endingPhase = 'summary';
assert.equal(Game.ending.restorePending(), true);
assert.equal(Game.ending.phase(), 'summary');
assert.equal(summaryShows, 2, 'pending summary is restored without a fake boss cinematic');

load('js/systems/offline.js');
assert.equal(Game.offline.settle(3600), null, 'pending ending time grants no offline rewards');
Game.ending.continueGame();

fixture = resetEndingState();
Game.state.meta.completedAt = Date.now();
Game.state.meta.endingAcknowledged = false;
Game.state.meta.endingPhase = 'epilogue';
Game.state.meta.endingLine = 3;
assert.equal(Game.ending.restorePending(), true);
assert.equal(Game.ending.phase(), 'epilogue');
assert.equal(epilogueShows, 2, 'pending epilogue resumes at its saved line');
Game.ending.continueGame();

assert.ok(closes > 0);
console.log('v1.8 ending tests passed: migration, trigger, epilogue, summary, continuation and offline pause coverage.');
