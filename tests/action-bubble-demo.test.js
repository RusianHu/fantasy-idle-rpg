'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.FIRPG_URL || 'http://127.0.0.1:4176/';
const port = 9700 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firpg-bubble-cdp-'));

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitJson(url, attempts = 80) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) { last = error; }
    await delay(50);
  }
  throw last || new Error('Chrome debugging endpoint did not start');
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
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  }

  async navigate(url) {
    const loaded = this.event('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    await loaded;
    await delay(500);
  }
}

async function run() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps',
    '--remote-allow-origins=*', '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += String(chunk); });

  try {
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
    await cdp.navigate(BASE + 'tech-demos/units/units.html');

    const diagnostics = await cdp.evaluate(`(() => {
      DemoI18n.setLocale('en');
      const catalog = Game.unitsBubbleDemo.catalog();
      const regionSelection = Game.unitsBubbleDemo.selectRegion('forest');
      const unitSelection = Game.unitsBubbleDemo.selectUnit('treant_sapling', 'forest');
      const catalogButtons = Array.from(document.querySelectorAll('.registry-region, .registry-unit'));
      const catalogDom = {
        regions: document.querySelectorAll('.registry-region').length,
        regionUnits: document.querySelectorAll('.registry-units:not(.classes) .registry-unit').length,
        classes: document.querySelectorAll('.registry-units.classes .registry-unit').length,
        activeRegion: document.querySelector('.registry-region.active')?.dataset.region,
        activeUnit: document.querySelector('.registry-unit.active')?.textContent,
        title: document.querySelector('.registry-heading h2')?.textContent,
        touchable: catalogButtons.every((button) => button.getBoundingClientRect().height >= 44),
        withinViewport: catalogButtons.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        })
      };
      const sceneButtons = Array.from(document.querySelectorAll('[data-bubble-scene]'));
      const walkButtons = Array.from(document.querySelectorAll('[data-bubble-walk]'));
      const walks = ['l', 'r', 'vertical'].map((scene) => {
        const layouts = Game.unitsBubbleDemo.setWalkScene(scene);
        Game.render.frame(0);
        return {
          id: scene,
          layouts,
          activeButton: document.querySelector('[data-bubble-walk="' + scene + '"]')
            .classList.contains('active')
        };
      });
      const scenes = ['center', 'left', 'right'].map((scene) => {
        const layouts = Game.unitsBubbleDemo.setScene(scene);
        Game.render.frame(0);
        return {
          id: scene,
          layouts,
          activeButton: document.querySelector('[data-bubble-scene="' + scene + '"]')
            .classList.contains('active')
        };
      });
      return {
        catalog,
        regionSelection,
        unitSelection,
        catalogDom,
        walks,
        scenes,
        locale: document.documentElement.lang,
        labels: sceneButtons.map((button) => button.textContent.trim()),
        walkLabels: walkButtons.map((button) => button.textContent.trim()),
        controlsTouchable: sceneButtons.concat(walkButtons)
          .every((button) => button.getBoundingClientRect().height >= 44),
        controlsWithinViewport: sceneButtons.concat(walkButtons).every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        }),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        status: document.getElementById('bubble-status').textContent
      };
    })()`);

    assert.equal(diagnostics.catalog.complete, true);
    assert.equal(diagnostics.catalog.regionCount, 8);
    assert.equal(diagnostics.catalog.classCount, 5);
    assert.equal(diagnostics.catalog.monsterDefinitionCount, 24);
    assert.equal(diagnostics.catalog.monsterOptionCount, 24);
    assert.deepEqual(diagnostics.catalog.missing, []);
    assert.deepEqual(diagnostics.catalog.issues, []);
    assert.deepEqual(diagnostics.catalog.unmapped, []);
    assert.deepEqual(diagnostics.catalog.regions.map((region) => [
      region.id, region.tier, region.normal.length, region.boss.length
    ]), [
      ['grassland', 1, 2, 1],
      ['forest', 2, 2, 1],
      ['mine', 3, 2, 1],
      ['graveyard', 4, 2, 1],
      ['snowpass', 5, 2, 1],
      ['lavacave', 6, 2, 1],
      ['skyruins', 7, 2, 1],
      ['darkcastle', 8, 2, 1]
    ]);
    assert.equal(diagnostics.regionSelection.regionId, 'forest');
    assert.equal(diagnostics.regionSelection.worldRegionId, 'forest');
    assert.equal(diagnostics.unitSelection.regionId, 'forest');
    assert.equal(diagnostics.unitSelection.worldRegionId, 'forest');
    assert.equal(diagnostics.unitSelection.group, 'monster');
    assert.equal(diagnostics.unitSelection.unit.id, 'treant_sapling');
    assert.equal(diagnostics.catalogDom.regions, 8);
    assert.equal(diagnostics.catalogDom.regionUnits, 3);
    assert.equal(diagnostics.catalogDom.classes, 5);
    assert.equal(diagnostics.catalogDom.activeRegion, 'forest');
    assert.equal(diagnostics.catalogDom.title, 'Auto-discovered Unit Catalog');
    assert.equal(diagnostics.catalogDom.touchable, true);
    assert.equal(diagnostics.catalogDom.withinViewport, true);
    assert.match(diagnostics.catalogDom.activeUnit, /Treant Sapling/);
    for (const walk of diagnostics.walks) {
      assert.equal(walk.layouts.length, 1, walk.id + ' exposes the hero bubble');
      assert.equal(walk.activeButton, true, walk.id + ' movement control is selected');
      assert.equal(walk.layouts[0].placement, 'directional');
      assert.equal(walk.layouts[0].withinViewport, true);
    }
    assert.deepEqual(diagnostics.walks.map((walk) => [
      walk.id, walk.layouts[0].mode, walk.layouts[0].side
    ]), [
      ['l', 'side', 'right'],
      ['r', 'side', 'left'],
      ['vertical', 'above', null]
    ], 'movement bubbles stay behind horizontal facing and above vertical facing');
    for (const scene of diagnostics.scenes) {
      assert.equal(scene.layouts.length, 2, scene.id + ' exposes both bubble anchors');
      assert.equal(scene.activeButton, true, scene.id + ' scene control is selected');
      for (const layout of scene.layouts) {
        assert.equal(layout.mode, 'side');
        assert.ok(layout.healthBar, scene.id + ' keeps the health bar visible');
        assert.equal(layout.overlapsHealthBar, false, scene.id + ' bubble avoids the health bar');
        assert.equal(layout.withinViewport, true, scene.id + ' bubble stays in the viewport');
        assert.ok(layout.tail.y + layout.tail.h > layout.body.y + layout.body.h,
          scene.id + ' bubble tail points diagonally down toward its unit');
      }
    }
    const monsters = diagnostics.scenes.map((scene) =>
      scene.layouts.find((layout) => layout.entityKind === 'monster'));
    assert.deepEqual(monsters.map((layout) => [layout.side, layout.flipped]), [
      ['right', false], ['right', true], ['left', true]
    ]);
    assert.equal(diagnostics.locale, 'en');
    assert.deepEqual(diagnostics.labels, ['Vertical encounter', 'Left edge flip', 'Right edge flip']);
    assert.deepEqual(diagnostics.walkLabels, ['Walk left', 'Walk right', 'Walk vertically']);
    assert.equal(diagnostics.controlsTouchable, true);
    assert.equal(diagnostics.controlsWithinViewport, true);
    assert.equal(diagnostics.noHorizontalOverflow, true);
    assert.deepEqual(cdp.errors, [], 'demo has no uncaught browser errors');

    const screenshots = [];
    const stageRect = await cdp.evaluate(`(() => {
      const rect = document.getElementById('stage').getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    })()`);
    const captures = [
      { id: 'walk-left', call: "Game.unitsBubbleDemo.setWalkScene('l')" },
      { id: 'walk-right', call: "Game.unitsBubbleDemo.setWalkScene('r')" },
      { id: 'walk-vertical', call: "Game.unitsBubbleDemo.setWalkScene('vertical')" },
      { id: 'center', call: "Game.unitsBubbleDemo.setScene('center')" },
      { id: 'left', call: "Game.unitsBubbleDemo.setScene('left')" },
      { id: 'right', call: "Game.unitsBubbleDemo.setScene('right')" }
    ];
    for (const item of captures) {
      await cdp.evaluate(item.call + '; Game.render.frame(0)');
      const capture = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        clip: { ...stageRect, scale: 3 }
      });
      const screenshot = path.join(os.tmpdir(), 'firpg-bubble-' + item.id + '-stage-cdp.png');
      fs.writeFileSync(screenshot, Buffer.from(capture.data, 'base64'));
      screenshots.push(screenshot);
    }

    console.log('Action bubble demo passed: ' + JSON.stringify({ diagnostics, screenshots }));
    cdp.ws.close();
  } finally {
    if (!chrome.killed) chrome.kill();
    await delay(100);
    if (profile.startsWith(os.tmpdir())) fs.rmSync(profile, { recursive: true, force: true });
    if (stderr && !fs.existsSync(CHROME)) console.error(stderr);
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
