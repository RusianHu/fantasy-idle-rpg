'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.FIRPG_URL || 'http://127.0.0.1:4176/';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firpg-render-gallery-cdp-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitJson(url, attempts = 80) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { const response = await fetch(url); if (response.ok) return response.json(); }
    catch (error) { last = error; }
    await delay(50);
  }
  throw last || new Error('Chrome debugging endpoint did not start');
}

async function waitPort(attempts = 100) {
  const file = path.join(profile, 'DevToolsActivePort');
  let last;
  for (let i = 0; i < attempts; i++) {
    try { const port = Number(fs.readFileSync(file, 'utf8').split(/\r?\n/)[0]); if (port > 0) return port; }
    catch (error) { last = error; }
    await delay(50);
  }
  throw last || new Error('Chrome did not publish DevToolsActivePort');
}

class Cdp {
  constructor(url) { this.id = 0; this.pending = new Map(); this.errors = []; this.ws = new WebSocket(url); }
  async open() {
    await new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result); return; }
      if (message.method === 'Runtime.exceptionThrown') this.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') this.errors.push(message.params.entry.text);
    });
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async navigate(url) {
    await this.send('Page.navigate', { url });
    await delay(650);
  }
}

async function run() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps',
    '--remote-allow-origins=*', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  try {
    const port = await waitPort();
    const target = (await waitJson(`http://127.0.0.1:${port}/json/list`)).find((entry) => entry.type === 'page');
    assert.ok(target, 'Chrome exposes a page target');
    const cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

    await cdp.navigate(BASE + 'tech-demos/render-gallery/render-gallery.html?region=forest&lang=en&motion=attack&direction=r&reduced=1&scale=2&speed=0.5&backdrop=night&grid=1&guides=1');
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) { ready = await cdp.evaluate(`typeof window.RenderGalleryLab === 'object'`); if (!ready) await delay(50); }
    assert.equal(ready, true, 'RenderGalleryLab initializes');
    const english = await cdp.evaluate(`(async () => {
      const saveBefore = [localStorage.getItem('firpg_save'), localStorage.getItem('firpg_save_backup')];
      const snapshot = RenderGalleryLab.snapshot();
      const pixelCount = (target) => {
        if (!target) return 0;
        const values = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
        let count = 0;
        for (let i = 0; i < values.length; i += 4) {
          if (values[i] || values[i + 1] || values[i + 2]) count++;
        }
        return count;
      };
      const units = snapshot.items.filter((item) => item.group === 'unit' && item.motion);
      const sample = units[0];
      const matrix = sample ? Object.values(sample.motion).flatMap((row) => Object.values(row)).every((cell) => cell.frame && ['native','derived','fallback'].includes(cell.coverage)) : false;
      if (snapshot.items[0]) RenderGalleryLab.select(snapshot.items[0].key);
      const previewCanvas = document.getElementById('preview-canvas');
      const nonZero = pixelCount(previewCanvas) > 0;
      const tabs = Array.from(document.querySelectorAll('#category-tabs [data-category]'));
      const unitTab = tabs.find((tab) => tab.getAttribute('data-category') === 'unit');
      if (unitTab) unitTab.click();
      const unitTabCount = document.querySelectorAll('.asset-card').length;
      const equipment = snapshot.items.filter((item) => item.kind === 'equipment');
      const equipmentTab = document.querySelector('#category-tabs [data-category="equipment"]');
      if (equipmentTab) equipmentTab.click();
      const equipmentTabCount = document.querySelectorAll('.asset-card').length;
      if (equipment[0]) RenderGalleryLab.select(equipment[0].key);
      const equipmentNonZero = pixelCount(document.getElementById('inspect-canvas')) > 0;
      if (sample) {
        RenderGalleryLab.select(sample.key);
        const motion = document.getElementById('motion-select');
        motion.value = 'attack';
        motion.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const select = document.getElementById('region-select');
      const regionCounts = [];
      for (const option of select.options) { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); regionCounts.push(RenderGalleryLab.snapshot().items.length); }
      const categoryTabHeight = Math.min(...Array.from(document.querySelectorAll('#category-tabs [data-category]')).map((tab) => tab.getBoundingClientRect().height));
      const fx = snapshot.items.find((item) => item.kind === 'effect');
      const particle = snapshot.items.find((item) => item.kind === 'particle');
      const bubble = snapshot.items.find((item) => item.kind === 'bubble');
      const previewSamples = {};
      const reducedBeforePreview = document.getElementById('reduced-motion').checked;
      RenderGalleryLab.setReducedMotion(false);
      const legendaryEquipment = equipment.find((item) => item.legendaryId);
      let legendaryEquipmentAnimated = false;
      if (legendaryEquipment) {
        RenderGalleryLab.select(legendaryEquipment.key);
        const firstFrame = document.createElement('canvas');
        const secondFrame = document.createElement('canvas');
        firstFrame.width = secondFrame.width = 60;
        firstFrame.height = secondFrame.height = 60;
        Game.equipmentVisuals.drawToDom(firstFrame, legendaryEquipment.item, { phase: 1 });
        Game.equipmentVisuals.drawToDom(secondFrame, legendaryEquipment.item, { phase: 2 });
        legendaryEquipmentAnimated = firstFrame.toDataURL() !== secondFrame.toDataURL();
      }
      for (const item of [fx, particle, bubble]) {
        if (!item) continue;
        RenderGalleryLab.select(item.key);
        const inspectCanvas = document.getElementById('inspect-canvas');
        const before = inspectCanvas ? inspectCanvas.toDataURL() : '';
        await new Promise((resolve) => setTimeout(resolve, 180));
        previewSamples[item.kind] = {
          nonZero: pixelCount(inspectCanvas),
          before,
          changed: !!inspectCanvas && before !== inspectCanvas.toDataURL()
        };
      }
      for (const item of units.slice(0, 4)) RenderGalleryLab.compare(item.key);
      const compareCanvases = Array.from(document.querySelectorAll('#compare-wall canvas'));
      const compareNonZero = compareCanvases.length === Math.min(4, units.length) && compareCanvases.every((canvas) => pixelCount(canvas) > 0);
      const scrubber = document.getElementById('preview-scrubber');
      scrubber.value = '500';
      scrubber.dispatchEvent(new Event('input', { bubbles: true }));
      const pausedAfterScrub = document.getElementById('pause').getAttribute('aria-pressed') === 'true';
      const timelineReadout = document.getElementById('preview-frame-readout').textContent;
      document.getElementById('pause').click();
      const metrics = RenderGalleryLab.metrics();
      const stage = document.getElementById('preview-stage');
      const currentUrl = new URL(location.href);
      return {
        heading: document.querySelector('h1')?.textContent,
        title: document.title,
        nonZero,
        stagePresent: document.getElementById('stage') !== null,
        previewWindowPresent: document.getElementById('preview-window') !== null,
        snapshot: { regions: snapshot.regions.length, assets: snapshot.totalAssets, items: snapshot.totalItems, issues: snapshot.issues.length },
        unitCount: units.length,
        matrix,
        categoryTabs: tabs.length,
        categoryTabHeight,
        assetCardH3: document.querySelector('.asset-card h3') !== null,
        unitTabCount,
        equipmentTabCount,
        equipmentNonZero,
        legendaryEquipmentAnimated,
        metrics,
        compareCards: compareCanvases.length,
        compareNonZero,
        canvasSize: [previewCanvas.width, previewCanvas.height],
        stageClasses: stage.className,
        gridChecked: document.getElementById('preview-grid').checked,
        guidesChecked: document.getElementById('preview-guides').checked,
        pausedAfterScrub,
        timelineReadout,
        urlState: {
          scale: currentUrl.searchParams.get('scale'),
          speed: currentUrl.searchParams.get('speed'),
          backdrop: currentUrl.searchParams.get('backdrop'),
          grid: currentUrl.searchParams.get('grid'),
          guides: currentUrl.searchParams.get('guides'),
          compare: currentUrl.searchParams.get('compare')
        },
        previewSamples,
        regionCounts,
        overflow: document.documentElement.scrollWidth <= innerWidth,
        reduced: reducedBeforePreview,
        saveStable: saveBefore[0] === localStorage.getItem('firpg_save') && saveBefore[1] === localStorage.getItem('firpg_save_backup')
      };
    })()`);
    assert.match(english.heading, /Graphics/);
    assert.equal(english.nonZero, true);
    assert.equal(english.stagePresent, false);
    assert.equal(english.previewWindowPresent, true);
    assert.equal(english.snapshot.regions, 8);
    assert.ok(english.snapshot.assets > 100 && english.snapshot.items > english.snapshot.assets);
    assert.equal(english.snapshot.issues, 0, 'visual catalog has no missing or placeholder issues');
    assert.ok(english.unitCount > 0 && english.matrix);
    assert.ok(english.categoryTabs > 1 && english.unitTabCount > 0);
    assert.equal(english.equipmentTabCount, 88);
    assert.equal(english.equipmentNonZero, true);
    assert.equal(english.legendaryEquipmentAnimated, true);
    assert.ok(english.categoryTabHeight >= 44, 'category tabs meet the touch target');
    assert.equal(english.assetCardH3, false, 'asset cards use semantic spans instead of nested headings');
    assert.ok(english.metrics.animatedCards <= 96);
    assert.equal(english.metrics.compareItems, 4);
    assert.equal(english.metrics.previewScale, 2);
    assert.equal(english.metrics.previewSpeed, 0.5);
    assert.equal(english.compareCards, 4);
    assert.equal(english.compareNonZero, true);
    assert.deepEqual(english.canvasSize, [720, 480]);
    assert.match(english.stageClasses, /backdrop-night/);
    assert.match(english.stageClasses, /show-grid/);
    assert.equal(english.gridChecked, true);
    assert.equal(english.guidesChecked, true);
    assert.equal(english.pausedAfterScrub, true);
    assert.match(english.timelineReadout, /s/);
    assert.deepEqual({ scale: english.urlState.scale, speed: english.urlState.speed, backdrop: english.urlState.backdrop, grid: english.urlState.grid, guides: english.urlState.guides }, { scale: '2', speed: '0.5', backdrop: 'night', grid: '1', guides: '1' });
    assert.ok(english.urlState.compare && english.urlState.compare.split(',').length === 4);
    for (const kind of ['effect', 'particle', 'bubble']) {
      assert.ok(english.previewSamples[kind], `${kind} preview is enumerated`);
      assert.ok(english.previewSamples[kind].nonZero > 0, `${kind} preview canvas is non-empty`);
      if (kind !== 'bubble') assert.equal(english.previewSamples[kind].changed, true, `${kind} preview loops over time`);
    }
    assert.equal(english.regionCounts.length, 8);
    assert.equal(english.overflow, true);
    assert.equal(english.reduced, true);
    assert.equal(english.saveStable, true);

    await cdp.navigate(BASE + 'tech-demos/render-gallery/render-gallery.html?region=grassland&lang=zh-CN');
    const chinese = await cdp.evaluate(`(async () => {
      const snapshot = RenderGalleryLab.snapshot();
      const sample = snapshot.items.find((item) => item.group === 'unit' && item.motion);
      if (sample) {
        RenderGalleryLab.select(sample.key);
        const motion = document.getElementById('motion-select');
        motion.value = 'attack';
        motion.dispatchEvent(new Event('change', { bubbles: true }));
      }
      RenderGalleryLab.setPreviewOptions({ scale: 2, backdrop: 'grass', grid: true, guides: true, speed: 2 });
      for (const item of snapshot.items.filter((item) => item.group === 'unit' && item.motion).slice(0, 2)) RenderGalleryLab.compare(item.key);
      const canvas = document.getElementById('preview-canvas');
      const previewFrames = canvas ? [canvas.toDataURL()] : [];
      for (let i = 0; i < 4; i++) {
        await new Promise((resolve) => setTimeout(resolve, 110));
        if (canvas) previewFrames.push(canvas.toDataURL());
      }
      return {
        heading: document.querySelector('h1')?.textContent,
        status: document.getElementById('status-line')?.textContent,
        previewName: document.getElementById('preview-name')?.textContent,
        stagePresent: document.getElementById('stage') !== null,
        overflow: document.documentElement.scrollWidth <= innerWidth,
        animatedPreview: new Set(previewFrames).size > 1,
        canvasSize: canvas ? [canvas.width, canvas.height] : [],
        stageClasses: document.getElementById('preview-stage')?.className,
        compareCards: document.querySelectorAll('#compare-wall .compare-card').length,
        compareLabel: document.getElementById('compare-count')?.textContent,
        previewMetrics: RenderGalleryLab.metrics(),
        tabHeight: Math.min(...Array.from(document.querySelectorAll('#category-tabs [data-category]')).map((tab) => tab.getBoundingClientRect().height)),
        assetCardH3: document.querySelector('.asset-card h3') !== null,
        issues: snapshot.issues.length
      };
    })()`);
    assert.match(chinese.heading, /图形与动效/);
    assert.ok(chinese.status);
    assert.ok(chinese.previewName && chinese.previewName !== '--');
    assert.equal(chinese.stagePresent, false);
    assert.equal(chinese.overflow, true);
    assert.equal(chinese.animatedPreview, true);
    assert.deepEqual(chinese.canvasSize, [720, 480]);
    assert.match(chinese.stageClasses, /backdrop-grass/);
    assert.match(chinese.stageClasses, /show-grid/);
    assert.equal(chinese.compareCards, 2);
    assert.match(chinese.compareLabel, /2\/4/);
    assert.equal(chinese.previewMetrics.previewSpeed, 2);
    assert.ok(chinese.tabHeight >= 44);
    assert.equal(chinese.assetCardH3, false);
    assert.equal(chinese.issues, 0);
    assert.deepEqual(cdp.errors, [], 'Render Gallery browser runtime has no uncaught errors');
    console.log('Render Gallery browser smoke passed: ' + JSON.stringify({ english, chinese }));
    cdp.ws.close();
  } finally {
    if (!chrome.killed) chrome.kill();
    await delay(100);
    if (profile.startsWith(os.tmpdir())) fs.rmSync(profile, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
