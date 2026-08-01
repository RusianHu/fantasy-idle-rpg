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
      'seed=1234ABCD&region=forest&time=300&particle=snow&mode=forced&' +
      'front=volatile&intensity=0.85&lang=en'
    );

    let labReady = false;
    for (let attempt = 0; attempt < 40 && !labReady; attempt++) {
      labReady = await cdp.evaluate(
        `typeof window.WeatherClimateLab === 'object'`
      );
      if (!labReady) await delay(50);
    }
    assert.equal(labReady, true,
      'WeatherClimateLab initializes without page errors: ' + cdp.errors.join(' | '));

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

    assert.equal(mobile.title, 'Weather / Climate Lab');
    assert.match(mobile.zhTitle, /天气 \/ 气候 Lab/);
    assert.ok(mobile.visible > 500);
    assert.ok(mobile.colors > 8);
    assert.ok(mobile.phaseVisible.every((visible) => visible > 100));
    assert.equal(mobile.captures.length, 4);
    assert.equal(mobile.determinism.sameInputsMatch, true);
    assert.equal(mobile.determinism.timeChangesCanvas, true);
    assert.equal(mobile.determinism.seedChangesLayout, true);
    assert.equal(mobile.determinism.crossRegionFrontMatches, true);
    assert.equal(mobile.determinism.crossRegionMicroclimateDiffers, true);
    assert.equal(mobile.snapshot.productionWeatherSystem, true);
    assert.equal(mobile.snapshot.noPlayer, true);
    assert.equal(mobile.snapshot.fogEnabled, false);
    assert.equal(mobile.snapshot.saveWrites, false);
    assert.equal(mobile.snapshot.regionId, 'forest');
    assert.equal(mobile.snapshot.seedHex, '1234ABCD');
    assert.equal(mobile.snapshot.atmosphere.previewMode, 'snow');
    assert.equal(mobile.snapshot.weather.mode, 'forced');
    assert.equal(mobile.snapshot.weather.front, 'volatile');
    assert.equal(mobile.snapshot.weather.exposure, 'canopy');
    assert.ok(mobile.snapshot.weather.render.p95FrameCostMs <= 2,
      'weather layer P95 stays within 2ms: ' +
      JSON.stringify(mobile.snapshot.weather.render));
    assert.ok(mobile.snapshot.performance.p95Ms <= 16.7,
      'Weather Lab total frame P95 stays within 16.7ms: ' +
      JSON.stringify(mobile.snapshot.performance));
    assert.equal(mobile.regions.length, 8);
    assert.deepEqual(mobile.presets, [
      'meadow', 'leaves', 'dust', 'wisps',
      'snow', 'embers', 'cloudwisp', 'miasma'
    ]);
    assert.ok(Object.values(mobile.futureHooks)
      .every((value) => value !== 'unconnected'));
    assert.equal(mobile.saveUnchanged, true);
    assert.equal(mobile.controlsTouchable, true);
    assert.equal(mobile.noHorizontalOverflow, true);

    const climateMatrix = await cdp.evaluate(`(() => {
      const ids = [
        'grassland', 'forest', 'mine', 'graveyard',
        'snowpass', 'lavacave', 'skyruins', 'darkcastle'
      ];
      const rows = ids.map((id) => {
        WeatherClimateLab.setRegion(id);
        WeatherClimateLab.setWeatherFront('volatile');
        WeatherClimateLab.setWeatherIntensity(0.9);
        Game.render.frame(0);
        const snapshot = WeatherClimateLab.snapshot();
        return {
          id,
          exposure: snapshot.weather.exposure,
          precipitation: snapshot.weather.precipitation,
          lightning: snapshot.weather.lightning,
          celestialVisibility: snapshot.weather.celestialVisibility,
          tintInfluence: snapshot.weather.tintInfluence,
          canvasHash: snapshot.canvas.hash
        };
      });
      WeatherClimateLab.setRegion('grassland');
      WeatherClimateLab.setWeatherFront('volatile');
      WeatherClimateLab.setEffects(false);
      WeatherClimateLab.triggerLightning();
      Game.render.frame(0);
      const effectsOff = WeatherClimateLab.snapshot().weather.render;
      WeatherClimateLab.setEffects(true);
      WeatherClimateLab.setReducedMotion(true);
      WeatherClimateLab.triggerLightning();
      Game.render.frame(0);
      const reducedMotion = WeatherClimateLab.snapshot().weather.render;
      WeatherClimateLab.setReducedMotion(false);

      function motionSample(regionId, front) {
        WeatherClimateLab.setRegion(regionId);
        WeatherClimateLab.setWeatherFront(front);
        WeatherClimateLab.setWeatherIntensity(0.9);
        WeatherClimateLab.setWorldTime(312);
        const before = Game.weatherRender.inspectPrecipitation({
          left: 0, top: 0, right: 256, bottom: 256
        });
        WeatherClimateLab.setWorldTime(312.1);
        const after = Game.weatherRender.inspectPrecipitation({
          left: 0, top: 0, right: 256, bottom: 256
        });
        const afterById = new Map(after.points.map((point) => [point.id, point]));
        const deltas = before.points.flatMap((point) => {
          const next = afterById.get(point.id);
          return next ? [((next.y - point.y) % before.fieldSize +
            before.fieldSize) % before.fieldSize] : [];
        });
        return {
          type: before.type,
          coordinateSpace: before.coordinateSpace,
          speedRange: before.speedRange,
          averageFall: deltas.reduce((sum, value) => sum + value, 0) /
            Math.max(1, deltas.length)
        };
      }

      WeatherClimateLab.setRegion('grassland');
      WeatherClimateLab.setWeatherFront('volatile');
      WeatherClimateLab.setWeatherIntensity(0.9);
      WeatherClimateLab.setWorldTime(312);
      const anchoredA = Game.weatherRender.inspectPrecipitation({
        left: 0, top: 0, right: 256, bottom: 256
      });
      const anchoredB = Game.weatherRender.inspectPrecipitation({
        left: 40, top: 30, right: 296, bottom: 286
      });
      const anchoredBById = new Map(anchoredB.points.map((point) => [point.id, point]));
      const shared = anchoredA.points.filter((point) => anchoredBById.has(point.id));
      const coordinatesStable = shared.every((point) => {
        const other = anchoredBById.get(point.id);
        return point.x === other.x && point.y === other.y;
      });
      const rainMotion = motionSample('grassland', 'volatile');
      const snowMotion = motionSample('snowpass', 'wet');
      return {
        rows,
        effectsOff,
        reducedMotion,
        precipitationField: {
          sharedPoints: shared.length,
          coordinatesStable,
          rainMotion,
          snowMotion
        }
      };
    })()`);
    assert.equal(new Set(climateMatrix.rows.map((row) => row.canvasHash)).size, 8,
      'eight volatile microclimates render distinct canvases');
    for (const id of ['grassland', 'graveyard', 'skyruins', 'darkcastle']) {
      const row = climateMatrix.rows.find((entry) => entry.id === id);
      assert.equal(row.precipitation.type, 'rain', `${id} renders storm rain`);
      assert.ok(row.precipitation.density > 0, `${id} storm rain is visible`);
      assert.equal(row.lightning, true, `${id} exposes lightning`);
    }
    const forest = climateMatrix.rows.find((row) => row.id === 'forest');
    assert.equal(forest.precipitation.type, 'rain');
    assert.ok(forest.precipitation.density > 0 &&
      forest.precipitation.density < 0.9, 'forest canopy attenuates rain');
    const snowpass = climateMatrix.rows.find((row) => row.id === 'snowpass');
    assert.equal(snowpass.precipitation.type, 'snow');
    assert.equal(snowpass.lightning, true);
    for (const id of ['mine', 'lavacave']) {
      const row = climateMatrix.rows.find((entry) => entry.id === id);
      assert.equal(row.exposure, 'underground');
      assert.equal(row.precipitation.density, 0);
      assert.equal(row.lightning, false);
      assert.equal(row.celestialVisibility, 0);
      assert.equal(row.tintInfluence, 0);
    }
    assert.equal(climateMatrix.effectsOff.lightningActive, false);
    assert.equal(climateMatrix.reducedMotion.lightningActive, false);
    assert.ok(climateMatrix.precipitationField.sharedPoints > 20,
      'shifted camera views share world precipitation points');
    assert.equal(climateMatrix.precipitationField.coordinatesStable, true,
      'camera bounds only cull precipitation; world coordinates stay fixed');
    assert.equal(climateMatrix.precipitationField.rainMotion.coordinateSpace, 'world');
    assert.equal(climateMatrix.precipitationField.rainMotion.type, 'rain');
    assert.equal(climateMatrix.precipitationField.snowMotion.type, 'snow');
    assert.ok(
      climateMatrix.precipitationField.rainMotion.speedRange[0] >
        climateMatrix.precipitationField.snowMotion.speedRange[1] * 4,
      'rain speed range is clearly faster than snow'
    );
    assert.ok(
      climateMatrix.precipitationField.rainMotion.averageFall >
        climateMatrix.precipitationField.snowMotion.averageFall * 4,
      'observed rain fall distance is clearly faster than snow'
    );

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
    let removed = false;
    for (let attempt = 0; attempt < 12 && !removed; attempt++) {
      await delay(100);
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        removed = true;
      } catch (error) {
        if (attempt === 11) throw error;
      }
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
