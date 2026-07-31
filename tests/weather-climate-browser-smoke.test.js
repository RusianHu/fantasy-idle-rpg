'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.FIRPG_URL || 'http://127.0.0.1:4176/';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firpg-weather-cdp-'));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitJson(url, attempts = 80) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      last = error;
    }
    await delay(50);
  }
  throw last || new Error('Chrome debugging endpoint did not start');
}

async function waitDevToolsPort(attempts = 100) {
  const activePort = path.join(profile, 'DevToolsActivePort');
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const port = Number(fs.readFileSync(activePort, 'utf8').split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch (error) {
      last = error;
    }
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
    if (this.ws.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.ws.addEventListener('open', resolve, { once: true });
        this.ws.addEventListener('error', reject, { once: true });
      });
    }
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(
          message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text
        );
      }
      if (message.method === 'Log.entryAdded' &&
          message.params.entry.level === 'error') {
        this.errors.push(message.params.entry.text);
      }
      const queue = this.waiters.get(message.method);
      if (queue?.length) queue.shift()(message.params);
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
      throw new Error(
        response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text
      );
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
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--disable-default-apps',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank'
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });

  try {
    const port = await waitDevToolsPort();
    const targets = await waitJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((target) => target.type === 'page');
    assert.ok(page, 'Chrome page target exists');

    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true
    });
    await cdp.navigate(
      BASE + 'tech-demos/weather-climate/weather-climate.html?' +
      'seed=1234ABCD&region=forest&time=300&particle=snow&lang=en'
    );

    const mobile = await cdp.evaluate(`(() => {
      document.querySelector('[data-speed="0"]')?.click();
      const saveBefore = [
        localStorage.getItem('firpg_save'),
        localStorage.getItem('firpg_save_backup')
      ];
      const stage = document.getElementById('stage');
      const pixels = stage.getContext('2d')
        .getImageData(0, 0, stage.width, stage.height).data;
      let visible = 0;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i +=
        Math.max(4, Math.floor(pixels.length / 2000 / 4) * 4)) {
        if (pixels[i + 3]) visible++;
        colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
      }
      const phaseVisible = Array.from(
        document.querySelectorAll('.phase-grid canvas'),
        (canvas) => {
          const data = canvas.getContext('2d')
            .getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0;
          for (let i = 3; i < data.length; i += 128) if (data[i]) count++;
          return count;
        }
      );
      const snapshot = WeatherClimateLab.snapshot();
      const captures = WeatherClimateLab.capturePhases();
      const determinism = WeatherClimateLab.verifyDeterminism();
      DemoI18n.setLocale('zh-CN', false);
      const zhTitle = document.querySelector('h1').textContent;
      DemoI18n.setLocale('en', false);
      const report = WeatherClimateLab.report();
      const saveAfter = [
        localStorage.getItem('firpg_save'),
        localStorage.getItem('firpg_save_backup')
      ];
      return {
        title: document.querySelector('h1').textContent,
        zhTitle,
        visible,
        colors: colors.size,
        phaseVisible,
        captures,
        determinism,
        snapshot,
        futureHooks: report.futureHooks,
        regions: WeatherClimateLab.regions(),
        presets: WeatherClimateLab.particlePresets(),
        saveUnchanged: JSON.stringify(saveBefore) === JSON.stringify(saveAfter),
        controlsTouchable: Array.from(document.querySelectorAll(
          'button, select, input:not([type="checkbox"]), a, .effects-control'
        )).every((element) => element.getBoundingClientRect().height >= 44),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);

    assert.equal(mobile.title, 'Weather / Climate Rendering Prep Lab');
    assert.match(mobile.zhTitle, /天气 \/ 气候筹备型渲染 Lab/);
    assert.ok(mobile.visible > 500);
    assert.ok(mobile.colors > 8);
    assert.ok(mobile.phaseVisible.every((visible) => visible > 100));
    assert.equal(mobile.captures.length, 4);
    assert.equal(mobile.determinism.sameInputsMatch, true);
    assert.equal(mobile.determinism.timeChangesCanvas, true);
    assert.equal(mobile.determinism.seedChangesLayout, true);
    assert.equal(mobile.snapshot.productionWeatherSystem, false);
    assert.equal(mobile.snapshot.noPlayer, true);
    assert.equal(mobile.snapshot.fogEnabled, false);
    assert.equal(mobile.snapshot.saveWrites, false);
    assert.equal(mobile.snapshot.regionId, 'forest');
    assert.equal(mobile.snapshot.seedHex, '1234ABCD');
    assert.equal(mobile.snapshot.atmosphere.previewMode, 'snow');
    assert.equal(mobile.regions.length, 8);
    assert.deepEqual(mobile.presets, [
      'meadow', 'leaves', 'dust', 'wisps',
      'snow', 'embers', 'cloudwisp', 'miasma'
    ]);
    assert.ok(Object.values(mobile.futureHooks)
      .every((value) => value === 'unconnected'));
    assert.equal(mobile.saveUnchanged, true);
    assert.equal(mobile.controlsTouchable, true);
    assert.equal(mobile.noHorizontalOverflow, true);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.navigate(
      BASE + 'tech-demos/weather-climate/weather-climate.html?' +
      'seed=89ABCDEF&region=lavacave&time=720&particle=region&lang=zh-CN'
    );
    const desktop = await cdp.evaluate(`(() => {
      document.querySelector('[data-speed="0"]')?.click();
      const snapshot = WeatherClimateLab.snapshot();
      const stage = document.getElementById('stage');
      const pixels = stage.getContext('2d')
        .getImageData(0, 0, stage.width, stage.height).data;
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 128) if (pixels[i]) visible++;
      return {
        snapshot,
        visible,
        stageWidth: document.getElementById('stage-wrap')
          .getBoundingClientRect().width,
        phaseCanvases: document.querySelectorAll('.phase-grid canvas').length,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(desktop.snapshot.regionId, 'lavacave');
    assert.equal(desktop.snapshot.seedHex, '89ABCDEF');
    assert.equal(desktop.snapshot.atmosphere.previewMode, 'region');
    assert.ok(desktop.visible > 500);
    assert.ok(desktop.stageWidth > 600);
    assert.equal(desktop.phaseCanvases, 4);
    assert.equal(desktop.noHorizontalOverflow, true);
    assert.deepEqual(cdp.errors, [], 'Weather/Climate Lab has no browser runtime errors');
    cdp.ws.close();

    console.log('weather-climate-browser-smoke.test.js: mobile and desktop QA passed');
  } finally {
    if (!chrome.killed) chrome.kill();
    await delay(100);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
