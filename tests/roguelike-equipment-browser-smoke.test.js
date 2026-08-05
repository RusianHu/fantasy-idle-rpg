'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.FIRPG_URL || 'http://127.0.0.1:4176/';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firpg-gear-lab-cdp-'));

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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

async function waitDevToolsPort(attempts = 120) {
  const activePort = path.join(profile, 'DevToolsActivePort');
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
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
        this.errors.push(message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text);
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        this.errors.push(message.params.entry.text);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.errors.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '));
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
    await delay(650);
  }

  close() { this.ws.close(); }
}

async function capture(cdp, filename) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const output = path.join(os.tmpdir(), filename);
  fs.writeFileSync(output, Buffer.from(shot.data, 'base64'));
  return output;
}

async function run() {
  assert.equal(fs.existsSync(CHROME), true, 'Google Chrome is installed for browser smoke tests');
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps',
    '--remote-allow-origins=*', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += String(chunk); });
  let cdp;

  try {
    const port = await waitDevToolsPort();
    const targets = await waitJson('http://127.0.0.1:' + port + '/json/list');
    const page = targets.find((target) => target.type === 'page');
    assert.ok(page, 'Chrome page target exists');
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    await cdp.navigate(BASE + 'tech-demos/index.html');
    await cdp.evaluate(`(() => {
      localStorage.setItem('firpg_save', 'gear-lab-main-sentinel');
      localStorage.setItem('firpg_save_backup', 'gear-lab-backup-sentinel');
    })()`);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
    });
    await cdp.navigate(BASE + 'tech-demos/roguelike-equipment/roguelike-equipment.html' +
      '?seed=89ABCDEF&class=mage&level=47&tier=6&source=mimic&samples=37&tab=generation&lang=en');

    const desktop = await cdp.evaluate(`(() => {
      const pixelInfo = (canvas) => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = 0;
        let hash = 2166136261;
        for (let at = 0; at < data.length; at += 4) {
          if (data[at + 3]) opaque++;
          hash ^= data[at] + data[at + 1] * 3 + data[at + 2] * 7 + data[at + 3] * 11;
          hash = Math.imul(hash, 16777619);
        }
        return { opaque, hash: hash >>> 0 };
      };
      const visibleTargets = Array.from(document.querySelectorAll(
        'button, a, select, input:not([type="checkbox"])'))
        .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      const snapshot = Game.roguelikeEquipmentLab.snapshot();
      return {
        ready: !!Game.loot.inspectPlan && !!Game.loot.inspectGeneration && !!snapshot.currentItem,
        url: Object.fromEntries(new URL(location.href).searchParams.entries()),
        locale: document.documentElement.lang,
        tabs: document.querySelectorAll('[role="tab"]').length,
        selectedTab: document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.tab,
        preview: pixelInfo(document.getElementById('gear-preview')),
        resultPixels: Array.from(document.querySelectorAll('[data-result-icon]')).map(pixelInfo),
        variantPixels: Array.from(document.querySelectorAll('[data-variant-icon]')).map(pixelInfo),
        traceStages: Array.from(document.querySelectorAll('#generation-trace [data-trace-stage]'))
          .map((row) => row.dataset.traceStage),
        assetId: document.getElementById('preview-asset-id').textContent,
        cache: snapshot.visualCache,
        minimumTarget: Math.min(...visibleTargets.map((element) => element.getBoundingClientRect().height)),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        save: localStorage.getItem('firpg_save'),
        backup: localStorage.getItem('firpg_save_backup')
      };
    })()`);

    assert.equal(desktop.ready, true);
    assert.deepEqual({
      seed: desktop.url.seed, class: desktop.url.class, level: desktop.url.level,
      tier: desktop.url.tier, source: desktop.url.source, samples: desktop.url.samples,
      tab: desktop.url.tab, lang: desktop.url.lang
    }, {
      seed: '89ABCDEF', class: 'mage', level: '47', tier: '6', source: 'mimic',
      samples: '37', tab: 'generation', lang: 'en'
    }, 'URL state restores all shared Lab controls');
    assert.equal(desktop.locale, 'en');
    assert.equal(desktop.tabs, 3);
    assert.equal(desktop.selectedTab, 'generation');
    assert.ok(desktop.preview.opaque > 20, 'main equipment preview has visible pixels');
    assert.ok(desktop.resultPixels.length > 0 && desktop.resultPixels.every((entry) => entry.opaque > 10),
      'drop result icons have visible pixels');
    assert.equal(desktop.variantPixels.length, 8);
    assert.ok(desktop.variantPixels.every((entry) => entry.opaque > 10),
      'adjacent-seed wall canvases have visible pixels');
    for (const stage of ['slot', 'base', 'rarity', 'material', 'implicit-roll', 'affix-filter',
      'normal-affix', 'item-complete']) {
      assert.ok(desktop.traceStages.includes(stage), 'generation Trace includes ' + stage);
    }
    assert.match(desktop.assetId, /^equipment:v1:/);
    assert.ok(desktop.cache.cachedFrames <= desktop.cache.cacheLimit,
      'production equipment frame cache remains bounded');
    assert.ok(desktop.minimumTarget >= 44, 'visible desktop controls preserve 44px targets');
    assert.equal(desktop.noHorizontalOverflow, true);
    assert.equal(desktop.save, 'gear-lab-main-sentinel');
    assert.equal(desktop.backup, 'gear-lab-backup-sentinel');

    const experiment = await cdp.evaluate(`(() => {
      const set = (id, value) => { document.getElementById(id).value = String(value); };
      Game.roguelikeEquipmentLab.switchTab('drop');
      document.getElementById('reset-overrides').click();
      const defaults = Game.roguelikeEquipmentLab.run(64);
      const baselineMatches = JSON.stringify(defaults.baseline.items) === JSON.stringify(defaults.experiment.items) &&
        JSON.stringify(defaults.baseline.state) === JSON.stringify(defaults.experiment.state);

      set('candidate-count', 4);
      set('pity-equipment', 9);
      set('samples', 1);
      document.getElementById('source').value = 'regular';
      const four = Game.roguelikeEquipmentLab.run(1).experiment;
      const resultCount = document.querySelectorAll('[data-result]').length;
      set('candidate-count', 1);
      const one = Game.roguelikeEquipmentLab.run(1).experiment;
      const sourceKey = 'regular:roguelike-equipment-lab';
      return {
        baselineMatches,
        candidates: four.rows.length,
        oneCandidateRows: one.rows.length,
        sameState: JSON.stringify(four.state) === JSON.stringify(one.state),
        ordinal: four.state.sourceOrdinals[sourceKey],
        rowOrdinals: Array.from(new Set(four.rows.map((row) => row.ordinal))),
        sameSemantics: four.rows.every((row) =>
          Game.equipment.slotOf(row.item) === Game.equipment.slotOf(four.rows[0].item) &&
          row.item.rarityId === four.rows[0].item.rarityId &&
          row.item.itemLevel === four.rows[0].item.itemLevel),
        valid: four.rows.every((row) => Game.equipment.validateItem(row.item).ok),
        dropStages: Array.from(document.querySelectorAll('#drop-trace [data-trace-stage]'))
          .map((row) => row.dataset.traceStage),
        resultCount
      };
    })()`);
    assert.equal(experiment.baselineMatches, true, 'default experiment reproduces production baseline');
    assert.equal(experiment.candidates, 4, 'candidate override creates four choices from one formal plan');
    assert.equal(experiment.oneCandidateRows, 1);
    assert.equal(experiment.sameState, true, 'candidate count does not advance pity, drought, or ordinal');
    assert.equal(experiment.ordinal, 1, 'one formal plan advances the source ordinal once');
    assert.deepEqual(experiment.rowOrdinals, [0]);
    assert.equal(experiment.sameSemantics, true);
    assert.equal(experiment.valid, true);
    assert.ok(experiment.dropStages.includes('drop') && experiment.dropStages.includes('pity'));
    assert.equal(experiment.resultCount, 4, 'all four forced experiment candidates stay inspectable');

    const visuals = await cdp.evaluate(`(() => {
      const signature = (canvas) => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = 0;
        let hash = 2166136261;
        for (let at = 0; at < data.length; at += 4) {
          if (data[at + 3]) opaque++;
          hash ^= data[at] + data[at + 1] * 3 + data[at + 2] * 7 + data[at + 3] * 11;
          hash = Math.imul(hash, 16777619);
        }
        return { opaque, hash: hash >>> 0 };
      };
      Game.roguelikeEquipmentLab.switchTab('generation');
      document.getElementById('rarity-lock').value = 'legendary';
      const generated = Game.roguelikeEquipmentLab.generate();
      const frame0 = document.createElement('canvas'); frame0.width = 80; frame0.height = 80;
      const frame1 = document.createElement('canvas'); frame1.width = 80; frame1.height = 80;
      const reduced = document.createElement('canvas'); reduced.width = 80; reduced.height = 80;
      const reducedOther = document.createElement('canvas'); reducedOther.width = 80; reducedOther.height = 80;
      Game.equipmentVisuals.drawToDom(frame0, generated.item, {
        outline: true, material: true, affixes: true, legendary: true, phase: 1
      });
      Game.equipmentVisuals.drawToDom(frame1, generated.item, {
        outline: true, material: true, affixes: true, legendary: true, phase: 2
      });
      Game.equipmentVisuals.drawToDom(reduced, generated.item, {
        outline: true, material: true, affixes: true, legendary: true, phase: 1, reducedMotion: true
      });
      Game.equipmentVisuals.drawToDom(reducedOther, generated.item, {
        outline: true, material: true, affixes: true, legendary: true, phase: 2, reducedMotion: true
      });
      const legend0 = signature(frame0), legend1 = signature(frame1);
      const reducedFrame = signature(reduced), reducedOtherFrame = signature(reducedOther);

      const scaleSizes = [];
      for (const scale of [1, 2, 4, 8]) {
        document.querySelector('[data-scale="' + scale + '"]').click();
        const canvas = document.getElementById('gear-preview');
        scaleSizes.push([canvas.width, canvas.height, canvas.getBoundingClientRect().width]);
      }
      const preview = document.getElementById('gear-preview');
      const beforeLayer = signature(preview);
      document.getElementById('layer-material').click();
      const afterLayer = signature(preview);
      document.getElementById('layer-material').click();

      document.getElementById('reduced-motion').click();
      const reducedBefore = signature(preview);
      return new Promise((resolve) => setTimeout(() => resolve({
        legend0, legend1, reducedFrame, reducedOtherFrame,
        scaleSizes,
        layerChanged: beforeLayer.hash !== afterLayer.hash,
        reducedStable: reducedBefore.hash === signature(preview).hash,
        reducedChecked: document.getElementById('reduced-motion').checked
      }), 520));
    })()`);
    assert.ok(visuals.legend0.opaque > 20 && visuals.legend1.opaque > 20);
    assert.notEqual(visuals.legend0.hash, visuals.legend1.hash,
      'legendary visuals expose a distinct second animation frame');
    assert.equal(visuals.reducedFrame.hash, visuals.reducedOtherFrame.hash,
      'reduced motion pins every legendary animation phase to one static frame');
    assert.deepEqual(visuals.scaleSizes, [[20, 20, 20], [40, 40, 40], [80, 80, 80], [160, 160, 160]],
      'all preview sizes use exact integer scaling');
    assert.equal(visuals.layerChanged, true, 'layer toggles alter the composed equipment pixels');
    assert.equal(visuals.reducedChecked, true);
    assert.equal(visuals.reducedStable, true, 'reduced motion prevents timed frame changes');

    const effects = await cdp.evaluate(`(() => {
      Game.roguelikeEquipmentLab.switchTab('effects');
      document.getElementById('preview-equip').click();
      const snapshot = Game.roguelikeEquipmentLab.snapshot();
      const compiled = Game.equipment.compileItem(snapshot.currentItem, { classId: snapshot.currentItem.classId });
      return {
        active: snapshot.activeTab,
        modifierRows: document.querySelectorAll('#modifier-table tr').length,
        compiledModifiers: compiled.modifiers.length,
        effectNodes: document.querySelectorAll('#effect-flow .effect-node').length,
        compiledEffects: compiled.effects.length,
        deltaRows: document.querySelectorAll('#build-delta tr').length,
        fingerprint: document.getElementById('fingerprint').textContent,
        equippedUid: snapshot.loadout[Game.equipment.slotOf(snapshot.currentItem)].uid,
        currentUid: snapshot.currentItem.uid,
        save: localStorage.getItem('firpg_save'),
        backup: localStorage.getItem('firpg_save_backup')
      };
    })()`);
    assert.equal(effects.active, 'effects');
    assert.equal(effects.modifierRows, effects.compiledModifiers);
    assert.ok(effects.compiledModifiers > 0);
    assert.equal(effects.compiledEffects, 1);
    assert.equal(effects.effectNodes, 4);
    assert.ok(effects.deltaRows > 0);
    assert.ok(effects.fingerprint.length >= 8);
    assert.equal(effects.equippedUid, effects.currentUid);
    assert.equal(effects.save, 'gear-lab-main-sentinel');
    assert.equal(effects.backup, 'gear-lab-backup-sentinel');
    const desktopScreenshot = await capture(cdp, 'firpg-roguelike-equipment-desktop-cdp.png');

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true
    });
    const mobile = await cdp.evaluate(`(() => {
      const result = { tabs: {}, minimumTargets: {}, save: null, backup: null };
      for (const tab of ['drop', 'generation', 'effects']) {
        Game.roguelikeEquipmentLab.switchTab(tab);
        const visibleTargets = Array.from(document.querySelectorAll(
          'button, a, select, input:not([type="checkbox"])'))
          .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
        result.tabs[tab] = document.documentElement.scrollWidth <= innerWidth;
        result.minimumTargets[tab] = Math.min(...visibleTargets.map((element) => element.getBoundingClientRect().height));
      }
      const locale = document.querySelector('[data-demo-locale]');
      locale.value = 'zh-CN';
      locale.dispatchEvent(new Event('change', { bubbles: true }));
      result.locale = document.documentElement.lang;
      result.title = document.querySelector('h1').textContent;
      result.urlLang = new URL(location.href).searchParams.get('lang');
      result.save = localStorage.getItem('firpg_save');
      result.backup = localStorage.getItem('firpg_save_backup');
      return result;
    })()`);
    assert.deepEqual(mobile.tabs, { drop: true, generation: true, effects: true },
      'all three mobile tabs avoid horizontal overflow');
    assert.ok(Object.values(mobile.minimumTargets).every((height) => height >= 44),
      'all visible mobile controls preserve 44px targets');
    assert.equal(mobile.locale, 'zh-CN');
    assert.match(mobile.title, /Roguelike 装备机制/);
    assert.equal(mobile.urlLang, 'zh-CN');
    assert.equal(mobile.save, 'gear-lab-main-sentinel');
    assert.equal(mobile.backup, 'gear-lab-backup-sentinel');
    const mobileScreenshot = await capture(cdp, 'firpg-roguelike-equipment-mobile-cdp.png');

    assert.deepEqual(cdp.errors, [], 'Roguelike Equipment Lab has no browser runtime errors');
    console.log('Roguelike equipment browser smoke OK');
    console.log('Desktop screenshot:', desktopScreenshot);
    console.log('Mobile screenshot:', mobileScreenshot);
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    await delay(120);
    fs.rmSync(profile, { recursive: true, force: true });
    if (stderr && !/DevTools listening/.test(stderr)) {
      const useful = stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
      if (useful) console.warn('Chrome stderr:', useful);
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
