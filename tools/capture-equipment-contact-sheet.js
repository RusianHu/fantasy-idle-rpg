'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = process.argv.slice(2);
const valueFor = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const baseUrl = valueFor('--url', process.env.FIRPG_URL || 'http://127.0.0.1:4176/');
const outputDir = path.resolve(valueFor('--output',
  path.join(os.tmpdir(), 'fantasy-idle-rpg-equipment-qa')));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firpg-equipment-contact-sheet-'));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitPort() {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
      if (port > 0) return port;
    } catch (_) {}
    await delay(50);
  }
  throw new Error('Chrome did not publish a DevTools port');
}
async function waitJson(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (_) {}
    await delay(50);
  }
  throw new Error('Chrome debugging endpoint did not become ready');
}

class Cdp {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
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
        this.errors.push(message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text);
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        this.errors.push(message.params.entry.text);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
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
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps',
    '--remote-allow-origins=*', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let cdp;
  try {
    const port = await waitPort();
    const page = (await waitJson(`http://127.0.0.1:${port}/json/list`))
      .find((entry) => entry.type === 'page');
    if (!page) throw new Error('Chrome did not expose a page target');
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false
    });
    await cdp.send('Page.navigate', {
      url: new URL('tech-demos/render-gallery/render-gallery.html?lang=zh-CN&category=equipment&reduced=1', baseUrl).href
    });
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await cdp.evaluate(`typeof RenderGalleryLab === 'object' && Game.equipmentVisuals &&
        Game.content.all('itemBase').length === 40`)) break;
      await delay(50);
    }
    const report = await cdp.evaluate(`(() => {
      const entries = Game.equipmentVisuals.catalog();
      document.head.innerHTML = '<meta charset="utf-8"><style>' +
        '*{box-sizing:border-box}body{margin:0;padding:20px;background:#0c1010;color:#ece8dc;font:12px monospace;letter-spacing:0}' +
        'h1{margin:0 0 6px;color:#e4c873;font-size:22px}p{margin:0 0 16px;color:#9aa89a}' +
        '#sheet{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}.cell{min-width:0;padding:8px;border:1px solid #39433a;background:#151a17}' +
        '.cell.legendary{border-color:#9a7032}.cell canvas{display:block;width:60px;height:60px;margin:0 auto 6px;image-rendering:pixelated}' +
        '.cell b,.cell small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cell b{color:#e8d89d}.cell small{color:#8fa093;font-size:9px}' +
        '</style>';
      document.body.innerHTML = '<input id="preview-scrubber" type="hidden"><span id="preview-frame-readout" hidden></span>' +
        '<h1>Procedural Equipment Contact Sheet</h1><p>40 bases / 5 slots / 88 catalog forms / production Canvas renderer v' +
        Game.equipmentVisuals.VERSION + '</p><main id="sheet"></main>';
      const sheet = document.getElementById('sheet');
      const hashes = [];
      const opaque = [];
      entries.forEach((entry, index) => {
        const cell = document.createElement('article');
        cell.className = 'cell' + (entry.legendaryId ? ' legendary' : '');
        cell.innerHTML = '<canvas width="60" height="60"></canvas><b></b><small></small>';
        cell.querySelector('b').textContent = entry.name;
        cell.querySelector('small').textContent = entry.id;
        sheet.appendChild(cell);
        const canvas = cell.querySelector('canvas');
        Game.equipmentVisuals.drawToDom(canvas, entry.item, { phase: entry.legendaryId ? 1 : 0, reducedMotion: true });
        const data = canvas.getContext('2d').getImageData(0, 0, 60, 60).data;
        let count = 0, hash = 2166136261;
        for (let offset = 0; offset < data.length; offset += 4) {
          if (data[offset + 3]) count++;
          hash ^= data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
          hash = Math.imul(hash, 16777619) >>> 0;
        }
        opaque.push(count); hashes.push(hash.toString(16));
      });
      return {
        entryCount: entries.length,
        baseCount: Game.content.all('itemBase').length,
        profileCount: Game.content.all('itemVisualProfile').length,
        nonEmptyCount: opaque.filter((value) => value > 0).length,
        uniquePixelHashes: new Set(hashes).size,
        minimumOpaquePixels: Math.min(...opaque),
        diagnostics: Game.equipmentVisuals.diagnostics(),
        pageHeight: document.documentElement.scrollHeight
      };
    })()`);
    if (report.entryCount !== 88 || report.nonEmptyCount !== 88 || report.baseCount !== 40 ||
        report.profileCount !== 40 || report.uniquePixelHashes < 70) {
      throw new Error('Equipment contact-sheet validation failed: ' + JSON.stringify(report));
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: report.pageHeight, deviceScaleFactor: 1, mobile: false
    });
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: true
    });
    const imagePath = path.join(outputDir, 'equipment-contact-sheet.png');
    const reportPath = path.join(outputDir, 'equipment-contact-sheet.json');
    fs.writeFileSync(imagePath, Buffer.from(shot.data, 'base64'));
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    if (cdp.errors.length) throw new Error('Browser errors: ' + cdp.errors.join('\n'));
    console.log(JSON.stringify({ imagePath, reportPath, report }, null, 2));
  } finally {
    if (cdp) cdp.ws.close();
    chrome.kill();
    await delay(200);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
