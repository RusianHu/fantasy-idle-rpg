'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.FIRPG_URL || 'http://127.0.0.1:4176/';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firpg-loot-lab-cdp-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitPort(attempts = 120) {
  const file = path.join(profile, 'DevToolsActivePort');
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const port = Number(fs.readFileSync(file, 'utf8').split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch (error) { last = error; }
    await delay(50);
  }
  throw last || new Error('Chrome did not publish DevToolsActivePort');
}

async function waitJson(url, attempts = 100) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
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
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        if (!/favicon\.ico|Failed to load resource/.test(message.params.entry.text)) {
          this.errors.push(message.params.entry.text);
        }
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
  close() { this.ws.close(); }
}

async function run() {
  assert.equal(fs.existsSync(CHROME), true, 'Google Chrome is installed');
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps',
    '--remote-allow-origins=*', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let cdp;
  try {
    const port = await waitPort();
    const targets = await waitJson('http://127.0.0.1:' + port + '/json/list');
    const page = targets.find((target) => target.type === 'page');
    assert.ok(page);
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
    });
    await cdp.navigate(BASE + 'tech-demos/loot-lab/loot-lab.html?' +
      'seed=1234ABCD&class=fighter&enemy=slime_green&source=regular&lang=en');

    const desktop = await cdp.evaluate(`(() => {
      const pixels = (canvas) => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let at = 3; at < data.length; at += 4) if (data[at]) count++;
        return count;
      };
      const targets = Array.from(document.querySelectorAll('button,a,select,input'))
        .filter((element) => element.getClientRects().length);
      return {
        ready: typeof LootLab === 'object', locale: document.documentElement.lang,
        enemyOptions: document.getElementById('enemy').options.length,
        enemy: document.getElementById('enemy').value,
        theoretical: document.getElementById('theoretical-rate').textContent,
        enemyPixels: pixels(document.getElementById('enemy-canvas')),
        noOverflow: document.documentElement.scrollWidth <= innerWidth,
        minTarget: Math.min(...targets.map((element) => element.getBoundingClientRect().height))
      };
    })()`);
    assert.equal(desktop.ready, true);
    assert.equal(desktop.locale, 'en');
    assert.ok(desktop.enemyOptions >= 57, 'production hostile actor catalog is exposed');
    assert.equal(desktop.enemy, 'slime_green');
    assert.equal(desktop.theoretical, '8%');
    assert.ok(desktop.enemyPixels > 100, 'enemy production sprite is non-empty');
    assert.equal(desktop.noOverflow, true);
    assert.ok(desktop.minTarget >= 44);

    const pity = await cdp.evaluate(`(() => {
      document.getElementById('drop-multiplier').value = '0.000001';
      document.getElementById('drop-multiplier').dispatchEvent(new Event('change', { bubbles: true }));
      LootLab.resolveKills(10);
      const canvas = document.getElementById('latest-drop');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let pixels = 0;
      for (let at = 3; at < data.length; at += 4) if (data[at]) pixels++;
      return { snapshot: LootLab.snapshot(), theoretical: document.getElementById('theoretical-rate').textContent,
        observed: document.getElementById('observed-rate').textContent,
        history: document.querySelectorAll('.kill-record').length,
        pityRecords: document.querySelectorAll('.kill-record.pity').length, pixels };
    })()`);
    assert.equal(pity.theoretical, '0%');
    assert.equal(pity.snapshot.kills, 10);
    assert.equal(pity.snapshot.dropKills, 1);
    assert.equal(pity.snapshot.itemCount, 1);
    assert.equal(pity.snapshot.latest.reason, 'equipment-pity');
    assert.equal(pity.snapshot.pityMisses, 0);
    assert.equal(pity.observed, '10%');
    assert.equal(pity.history, 10);
    assert.equal(pity.pityRecords, 1);
    assert.ok(pity.pixels > 20, 'pity equipment uses the production pixel renderer');

    const mappings = await cdp.evaluate(`(() => {
      const pick = (id) => { const select = document.getElementById('enemy'); select.value = id;
        select.dispatchEvent(new Event('change', { bubbles: true })); return document.getElementById('source').value; };
      return { guardian: pick('badger_brambleback'), boss: pick('slime_king'), mimic: pick('hoard_mimic') };
    })()`);
    assert.deepEqual(mappings, { guardian: 'guardian', boss: 'boss', mimic: 'mimic' });

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true
    });
    const mobile = await cdp.evaluate(`(() => {
      const targets = Array.from(document.querySelectorAll('button,a,select,input'))
        .filter((element) => element.getClientRects().length);
      return { noOverflow: document.documentElement.scrollWidth <= innerWidth,
        minTarget: Math.min(...targets.map((element) => element.getBoundingClientRect().height)),
        actionWidths: Array.from(document.querySelectorAll('.observatory-actions button'))
          .map((element) => element.getBoundingClientRect().width) };
    })()`);
    assert.equal(mobile.noOverflow, true);
    assert.ok(mobile.minTarget >= 44);
    assert.ok(mobile.actionWidths.every((width) => width >= 140));
    assert.deepEqual(cdp.errors, [], 'Loot Lab has no browser runtime errors');
    console.log('Loot Lab browser smoke OK: hostile mappings, probability, pity, pixels, desktop and mobile.');
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    await delay(120);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
