'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.FIRPG_URL || 'http://127.0.0.1:4176/';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firpg-bubble-cdp-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitJson(url, attempts = 80) {
  let last;
  for (let index = 0; index < attempts; index++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) { last = error; }
    await delay(50);
  }
  throw last || new Error('Chrome debugging endpoint did not start');
}

async function waitDevToolsPort(attempts = 100) {
  const activePort = path.join(profile, 'DevToolsActivePort');
  let last;
  for (let index = 0; index < attempts; index++) {
    try {
      const port = Number(fs.readFileSync(activePort, 'utf8').split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch (error) { last = error; }
    await delay(50);
  }
  throw last || new Error('Chrome did not publish DevToolsActivePort');
}

class Cdp {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.waiters = new Map();
    this.errors = [];
    this.ws = new WebSocket(url);
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text);
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        this.errors.push(message.params.entry.text);
      }
      const queue = this.waiters.get(message.method);
      if (queue && queue.length) queue.shift()(message.params);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  event(method) {
    return new Promise((resolve) => {
      const queue = this.waiters.get(method) || [];
      queue.push(resolve);
      this.waiters.set(method, queue);
    });
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text);
    }
    return response.result.value;
  }
  async navigate(url) {
    const loaded = this.event('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    await loaded;
    await delay(700);
  }
}

async function run() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps',
    '--remote-allow-origins=*', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  try {
    const port = await waitDevToolsPort();
    const targets = await waitJson('http://127.0.0.1:' + port + '/json/list');
    const page = targets.find((target) => target.type === 'page');
    assert.ok(page, 'Chrome page target exists');
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true
    });
    await cdp.navigate(BASE + 'tech-demos/units/units.html?scenario=overlap&lang=en');

    const diagnostics = await cdp.evaluate(`(() => {
      const api = Game.unitsBubbleDemo;
      const chainResults = ['gcd', 'resource', 'overlap', 'healing', 'combo'].map((scenario) => {
        document.getElementById('scenario').value = scenario;
        api.rebuild();
        let diagnostics;
        let primaryImpacts = [];
        for (let attempt = 0; attempt < 12 && primaryImpacts.length === 0; attempt++) {
          diagnostics = api.stepUntilImpact(700);
          primaryImpacts = diagnostics.adapter.records.filter((record) =>
            record.sourceActorId === 'lab:ally:0' &&
            ['melee-impact', 'projectile-impact', 'miss', 'heal', 'shield'].includes(record.visual));
        }
        return {
          scenario,
          primaryImpacts,
          visuals: diagnostics.adapter.records.map((record) => record.visual),
          noOverlap: !diagnostics.movement.current.some((item) =>
            item.contact && item.contact.overlapping) &&
            diagnostics.movement.overlaps.length === 0,
          traceHasOverlap: diagnostics.movement.trace.some((item) =>
            item.contact && item.contact.overlapping),
          moved: diagnostics.movement.trace.some((item) => item.moving),
          diagnostics
        };
      });
      const combatPresentation = chainResults.find((item) => item.scenario === 'overlap').diagnostics;
      const sceneButtons = Array.from(document.querySelectorAll('[data-bubble-scene]'));
      const walkButtons = Array.from(document.querySelectorAll('[data-bubble-walk]'));
      const walks = ['l', 'r', 'vertical'].map((id) => ({
        id, layouts: api.setWalkScene(id),
        active: document.querySelector('[data-bubble-walk="' + id + '"]').classList.contains('active')
      }));
      const scenes = ['center', 'left', 'right'].map((id) => ({
        id, layouts: api.setScene(id),
        active: document.querySelector('[data-bubble-scene="' + id + '"]').classList.contains('active')
      }));
      const buttons = sceneButtons.concat(walkButtons);
      return {
        catalog: api.catalog(), walks, scenes, combatPresentation,
        chainMatrix: chainResults.map(({ diagnostics: omitted, ...item }) => item),
        locale: document.documentElement.lang,
        sceneLabels: sceneButtons.map((button) => button.textContent.trim()),
        walkLabels: walkButtons.map((button) => button.textContent.trim()),
        touchable: buttons.every((button) => button.getBoundingClientRect().height >= 44),
        withinViewport: buttons.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        }),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        status: document.getElementById('bubble-status').textContent
      };
    })()`);

    assert.equal(diagnostics.catalog.complete, true);
    assert.equal(diagnostics.catalog.actorCount, 53);
    assert.equal(diagnostics.catalog.classCount, 5);
    assert.equal(diagnostics.catalog.monsterCount, 40);
    assert.equal(diagnostics.catalog.summonCount, 9);
    assert.equal(diagnostics.catalog.encounterCount, 18);
    assert.match(diagnostics.catalog.fingerprint, /^[0-9a-f]{8}$/);
    assert.ok(diagnostics.combatPresentation.adapter.records.some((record) =>
      ['combat:hit', 'combat:miss', 'combat:healed', 'combat:shielded'].includes(record.eventType)));
    assert.ok(diagnostics.combatPresentation.adapter.records.some((record) =>
      ['melee-impact', 'projectile-impact', 'miss', 'heal', 'shield'].includes(record.visual)));
    assert.ok(diagnostics.combatPresentation.fx.floats +
      diagnostics.combatPresentation.fx.shapes +
      diagnostics.combatPresentation.fx.projectiles > 0,
    'the Lab renders the production attack FX, not only numerical events');
    assert.match(diagnostics.combatPresentation.panel,
      /combat:(hit|miss|healed|shielded)/);
    assert.ok(diagnostics.combatPresentation.movement.trace.length > 0);
    assert.equal(diagnostics.combatPresentation.movement.current.some((item) =>
      item.contact && item.contact.overlapping), false,
    'movement → contact → attack chain keeps hostile feet collision-safe');
    assert.deepEqual(diagnostics.chainMatrix.map((item) => item.scenario),
      ['gcd', 'resource', 'overlap', 'healing', 'combo']);
    for (const chain of diagnostics.chainMatrix) {
      assert.ok(chain.primaryImpacts.length > 0,
        `${chain.scenario} reaches a primary-actor visual impact`);
      assert.equal(chain.noOverlap, true, `${chain.scenario} ends collision-safe`);
      assert.equal(chain.traceHasOverlap, false,
        `${chain.scenario} never logs hostile foot overlap`);
    }
    for (const scenario of ['gcd', 'resource', 'combo']) {
      assert.equal(diagnostics.chainMatrix.find((item) => item.scenario === scenario).moved,
        true, `${scenario} exercises movement before its attack`);
    }
    for (const walk of diagnostics.walks) {
      assert.equal(walk.layouts.length, 1, walk.id);
      assert.equal(walk.active, true, walk.id);
      assert.equal(walk.layouts[0].withinViewport, true, walk.id);
      assert.equal(walk.layouts[0].overlapsHealthBar, false, walk.id);
    }
    assert.deepEqual(diagnostics.walks.map((walk) => [
      walk.id, walk.layouts[0].mode, walk.layouts[0].side
    ]), [
      ['l', 'side', 'right'],
      ['r', 'side', 'left'],
      ['vertical', 'above', null]
    ]);
    for (const scene of diagnostics.scenes) {
      assert.equal(scene.layouts.length, 2, scene.id);
      assert.equal(scene.active, true, scene.id);
      for (const layout of scene.layouts) {
        assert.equal(layout.mode, 'side');
        assert.equal(layout.withinViewport, true);
        assert.equal(layout.overlapsHealthBar, false);
        assert.ok(layout.healthBar);
        assert.ok(layout.tail.y + layout.tail.h > layout.body.y + layout.body.h);
      }
    }
    assert.equal(diagnostics.locale, 'en');
    assert.deepEqual(diagnostics.sceneLabels,
      ['Vertical encounter', 'Left edge flip', 'Right edge flip']);
    assert.deepEqual(diagnostics.walkLabels,
      ['Walk left', 'Walk right', 'Walk vertically']);
    assert.equal(diagnostics.touchable, true);
    assert.equal(diagnostics.withinViewport, true);
    assert.equal(diagnostics.noHorizontalOverflow, true);
    assert.deepEqual(cdp.errors, [], 'Actor/Combat Lab has no uncaught browser errors');

    const stageRect = await cdp.evaluate(`(() => {
      const rect = document.getElementById('stage').getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    })()`);
    const screenshots = [];
    for (const item of [
      ['walk-left', "Game.unitsBubbleDemo.setWalkScene('l')"],
      ['walk-right', "Game.unitsBubbleDemo.setWalkScene('r')"],
      ['walk-vertical', "Game.unitsBubbleDemo.setWalkScene('vertical')"],
      ['center', "Game.unitsBubbleDemo.setScene('center')"],
      ['left', "Game.unitsBubbleDemo.setScene('left')"],
      ['right', "Game.unitsBubbleDemo.setScene('right')"]
    ]) {
      await cdp.evaluate(item[1]);
      const capture = await cdp.send('Page.captureScreenshot', {
        format: 'png', fromSurface: true, clip: { ...stageRect, scale: 2 }
      });
      const screenshot = path.join(os.tmpdir(), 'firpg-bubble-' + item[0] + '-v2.png');
      fs.writeFileSync(screenshot, Buffer.from(capture.data, 'base64'));
      screenshots.push(screenshot);
    }
    console.log('Action bubble Actor/Combat Lab passed: ' +
      JSON.stringify({
        fingerprint: diagnostics.catalog.fingerprint,
        chains: diagnostics.chainMatrix.map((item) => ({
          scenario: item.scenario,
          moved: item.moved,
          noOverlap: item.noOverlap,
          visuals: Array.from(new Set(item.visuals))
        })),
        screenshots
      }));
    cdp.ws.close();
  } finally {
    if (chrome.exitCode === null) {
      const exited = new Promise((resolve) => chrome.once('exit', resolve));
      if (!chrome.killed) chrome.kill();
      await Promise.race([exited, delay(3000)]);
    }
    if (profile.startsWith(os.tmpdir())) {
      fs.rmSync(profile, {
        recursive: true, force: true, maxRetries: 8, retryDelay: 120
      });
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
