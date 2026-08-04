'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.FIRPG_URL || 'http://127.0.0.1:4176/';
const BUILD_ID = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).buildId;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firpg-cdp-'));

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

async function waitDevToolsPort(attempts = 100) {
  const activePort = path.join(profile, 'DevToolsActivePort');
  let last;
  for (let i = 0; i < attempts; i++) {
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
    if (this.ws.readyState === WebSocket.OPEN) return;
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
        this.errors.push(
          message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text
        );
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') this.errors.push(message.params.entry.text);
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
      const detail = response.exceptionDetails;
      throw new Error(detail.exception?.description || detail.text);
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
    '--remote-allow-origins=*', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += String(chunk); });

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

    await cdp.navigate(BASE);
    if (cdp.errors.length) {
      throw new Error('browser boot errors: ' + cdp.errors.join(' | '));
    }
    await delay(240);
    if (cdp.errors.length) {
      throw new Error('browser title errors: ' + cdp.errors.join(' | '));
    }
    const titleScene = await cdp.evaluate(`(() => {
      const root = document.getElementById('title-root');
      const canvas = document.getElementById('title-canvas');
      const reveal = root?.querySelector('.title-reveal');
      const prompt = reveal?.querySelector('.title-reveal-prompt');
      const lang = root?.querySelector('.title-lang');
      if (!root || !canvas || !reveal || !prompt || !lang) return {
        visible: false,
        hasRoot: !!root,
        hasCanvas: !!canvas,
        hasReveal: !!reveal,
        hasPrompt: !!prompt,
        hasLang: !!lang,
        bodyText: document.body.innerText.slice(0, 200)
      };
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let warmPixels = 0;
      let opaquePixels = 0;
      let citadelPixels = 0;
      let riverPixels = 0;
      let farRiverPixels = 0;
      let belowCliffWaterPixels = 0;
      let cliffFacePixels = 0;
      let snowPixels = 0;
      let forestPixels = 0;
      let nestPixels = 0;
      let pixelPairMatches = 0;
      let pixelPairMatchesShifted = 0;
      let pixelPairSamples = 0;
      const landscapeColors = new Set();
      const y0 = Math.floor(canvas.height * 0.58);
      const y1 = Math.floor(canvas.height * 0.86);
      for (let y = y0; y < y1; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const i = (y * canvas.width + x) * 4;
          if (pixels[i + 3] > 0) opaquePixels++;
          if (pixels[i] > 105 && pixels[i] > pixels[i + 1] * 1.12 && pixels[i + 1] > pixels[i + 2]) warmPixels++;
        }
      }
      for (let y = Math.floor(canvas.height * 0.36); y < Math.floor(canvas.height * 0.58); y++) {
        for (let x = Math.floor(canvas.width * 0.64); x < Math.floor(canvas.width * 0.94); x++) {
          const i = (y * canvas.width + x) * 4;
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (r > 85 && r > g * 1.24 && r > b * 1.12) citadelPixels++;
        }
      }
      for (let y = Math.floor(canvas.height * 0.34); y < Math.floor(canvas.height * 0.7); y += 2) {
        for (let x = 0; x < canvas.width - 1; x += 2) {
          const i = (y * canvas.width + x) * 4;
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (r < 80 && g > 67 && b > 82 && b > g * 1.05) riverPixels++;
          if (r > 130 && g > 140 && b > 145 && b - r < 85) snowPixels++;
          if (g > 34 && g > r * 1.32 && b > r * 1.22 && Math.abs(g - b) < 28) forestPixels++;
          landscapeColors.add(r + ',' + g + ',' + b);

          const j = i + 4;
          pixelPairSamples++;
          if (
            pixels[i] === pixels[j] &&
            pixels[i + 1] === pixels[j + 1] &&
            pixels[i + 2] === pixels[j + 2]
          ) pixelPairMatches++;
          if (x + 2 < canvas.width) {
            const k = i + 8;
            if (
              pixels[j] === pixels[k] &&
              pixels[j + 1] === pixels[k + 1] &&
              pixels[j + 2] === pixels[k + 2]
            ) pixelPairMatchesShifted++;
          }
        }
      }
      for (let y = Math.floor(canvas.height * 0.48); y < Math.floor(canvas.height * 0.7); y++) {
        for (let x = Math.floor(canvas.width * 0.05); x < Math.floor(canvas.width * 0.36); x++) {
          const i = (y * canvas.width + x) * 4;
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (r > 150 && g > 138 && b > 105 && r - g < 34 && g - b < 58) nestPixels++;
        }
      }
      for (let y = Math.floor(canvas.height * 0.7); y < Math.floor(canvas.height * 0.745); y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (r < 80 && g > 67 && b > 82 && b > g * 1.05) belowCliffWaterPixels++;
        }
      }
      for (let y = Math.floor(canvas.height * 0.65); y < Math.floor(canvas.height * 0.7); y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (
            r > 42 && r < 105 &&
            Math.abs(r - g) < 18 &&
            Math.abs(g - b) < 18
          ) cliffFacePixels++;
        }
      }
      for (let y = Math.floor(canvas.height * 0.6); y < Math.floor(canvas.height * 0.69); y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (r < 80 && g > 67 && b > 82 && b > g * 1.05) farRiverPixels++;
        }
      }
      const sr = prompt.getBoundingClientRect();
      const lr = lang.getBoundingClientRect();
      const overlaps = !(
        sr.right <= lr.left || sr.left >= lr.right ||
        sr.bottom <= lr.top || sr.top >= lr.bottom
      );
      const archive = root.querySelector('.title-archive');
      const slot = root.querySelector('[data-slot-id="expedition-1"]');
      return {
        visible: true,
        warmPixels,
        opaquePixels,
        citadelPixels,
        riverPixels,
        farRiverPixels,
        belowCliffWaterPixels,
        cliffFacePixels,
        snowPixels,
        forestPixels,
        nestPixels,
        pixelGridRatio: Math.max(pixelPairMatches, pixelPairMatchesShifted) / Math.max(1, pixelPairSamples),
        landscapeColors: landscapeColors.size,
        canvasColors: new Set(Array.from({ length: 1000 }, (_, n) => {
          const i = Math.min(pixels.length - 4, n * Math.max(4, Math.floor(pixels.length / 1000 / 4) * 4));
          return pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2];
        })).size,
        revealHeight: sr.height,
        revealCopy: prompt.textContent.trim(),
        buttonsSeparate: !overlaps,
        revealFits: prompt.scrollWidth <= prompt.clientWidth,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        archiveVisible: !!archive &&
          getComputedStyle(archive).visibility === 'visible' &&
          Number(getComputedStyle(archive).opacity) > 0.9,
        archiveHiddenFromAT: archive?.getAttribute('aria-hidden'),
        archiveInert: archive?.hasAttribute('inert'),
        slotKind: slot?.getAttribute('data-slot-kind'),
        slotId: slot?.getAttribute('data-slot-id'),
        slotAria: slot?.getAttribute('aria-label') || '',
        languageHeight: lr.height
      };
    })()`);
    assert.equal(titleScene.visible, true, 'new saves open on the title scene: ' + JSON.stringify(titleScene));
    assert.ok(titleScene.warmPixels > 45, 'title camp has a visible warm fire-and-lantern focal area');
    assert.ok(
      titleScene.citadelPixels > 4 && titleScene.citadelPixels < 220,
      'title scene keeps the demon citadel visible but distant'
    );
    assert.ok(titleScene.riverPixels > 35, 'title scene shows a broad river instead of a route line');
    assert.ok(titleScene.farRiverPixels > 20, 'the distant river visibly feeds the cliff waterfall');
    assert.ok(titleScene.belowCliffWaterPixels > 60, 'water visibly occupies the area below the cliff face');
    assert.ok(titleScene.cliffFacePixels > 40, 'the lookout has a visible vertical cliff face');
    assert.ok(titleScene.snowPixels > 20, 'title scene shows snow-capped mountains');
    assert.ok(titleScene.forestPixels > 70, 'title scene shows a dense forest layer');
    assert.ok(titleScene.nestPixels > 4, 'title scene shows the creature nest and eggs');
    assert.ok(
      titleScene.pixelGridRatio > 0.78,
      'title landscape stays aligned to the 2x pixel-art grid: ' + titleScene.pixelGridRatio
    );
    assert.ok(titleScene.landscapeColors > 24, 'title scene has layered mid- and far-distance scenery');
    assert.ok(titleScene.canvasColors > 30, 'title camp canvas has enough visual variety');
    assert.ok(titleScene.opaquePixels > 1000, 'title camp canvas is painted');
    assert.ok(titleScene.revealHeight >= 44, 'title reveal action keeps a touch target');
    assert.ok(titleScene.revealCopy.includes('点击进入'));
    assert.equal(titleScene.buttonsSeparate, true);
    assert.equal(titleScene.revealFits, true);
    assert.equal(titleScene.noHorizontalOverflow, true);
    assert.equal(titleScene.archiveVisible, false, 'title first shows the unobstructed camp view');
    assert.equal(titleScene.archiveHiddenFromAT, 'true');
    assert.equal(titleScene.archiveInert, true);
    assert.equal(titleScene.slotKind, 'empty');
    assert.equal(titleScene.slotId, 'expedition-1');
    assert.ok(titleScene.slotAria.length > 8, 'save slot has an accessible description');
    assert.ok(titleScene.languageHeight >= 44, 'language switch keeps a touch target');

    await cdp.evaluate(`document.querySelector('#title-root .title-reveal').click()`);
    await delay(480);
    const titleArchiveReveal = await cdp.evaluate(`(() => {
      const root = document.getElementById('title-root');
      const archive = root.querySelector('.title-archive');
      const reveal = root.querySelector('.title-reveal');
      const view = root.querySelector('.archive-view');
      return {
        open: root.classList.contains('is-archive-open'),
        emptyState: archive.classList.contains('is-empty-state'),
        archiveVisible: getComputedStyle(archive).visibility === 'visible' &&
          Number(getComputedStyle(archive).opacity) > 0.9,
        archiveHiddenFromAT: archive.getAttribute('aria-hidden'),
        archiveInert: archive.hasAttribute('inert'),
        revealHiddenFromAT: reveal.getAttribute('aria-hidden'),
        viewHeight: view.getBoundingClientRect().height,
        focusedSlot: document.activeElement?.classList.contains('title-slot')
      };
    })()`);
    assert.equal(titleArchiveReveal.open, true);
    assert.equal(titleArchiveReveal.emptyState, true, 'an empty lobby uses the dedicated new-game presentation');
    assert.equal(titleArchiveReveal.archiveVisible, true);
    assert.equal(titleArchiveReveal.archiveHiddenFromAT, 'false');
    assert.equal(titleArchiveReveal.archiveInert, false);
    assert.equal(titleArchiveReveal.revealHiddenFromAT, 'true');
    assert.ok(titleArchiveReveal.viewHeight >= 44, 'return-to-camp action keeps a touch target');
    assert.equal(titleArchiveReveal.focusedSlot, true);

    const englishTitleFit = await cdp.evaluate(`(() => {
      const root = document.getElementById('title-root');
      root.querySelector('.title-lang').click();
      const slot = root.querySelector('.title-slot');
      const action = slot.querySelector('.slot-action span');
      const name = slot.querySelector('.slot-name');
      const result = {
        emptyState: root.querySelector('.title-archive').classList.contains('is-empty-state'),
        archiveHeadingHidden: getComputedStyle(root.querySelector('.archive-heading-copy')).display === 'none',
        action: action.textContent,
        name: name.textContent,
        actionFits: action.scrollWidth <= action.clientWidth,
        nameFits: name.scrollWidth <= name.clientWidth || getComputedStyle(name).textOverflow === 'ellipsis',
        slotFits: slot.scrollWidth <= slot.clientWidth,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
      root.querySelector('.title-lang').click();
      return result;
    })()`);
    assert.equal(englishTitleFit.emptyState, true);
    assert.equal(englishTitleFit.archiveHeadingHidden, true, 'empty saves do not present an expedition archive heading');
    assert.equal(englishTitleFit.name, 'NEW GAME');
    assert.equal(englishTitleFit.action, 'BEGIN');
    assert.equal(englishTitleFit.actionFits, true);
    assert.equal(englishTitleFit.nameFits, true);
    assert.equal(englishTitleFit.slotFits, true);
    assert.equal(englishTitleFit.noHorizontalOverflow, true);

    // 删除存档后停在标题页：不重建存档、不推进世界、不允许任何离线结算或入账。
    const unopenedTitle = await cdp.evaluate(`(() => {
      const before = {
        worldTime: Game.state.world.worldTime,
        stats: JSON.stringify(Game.state.meta.stats),
        player: JSON.stringify(Game.state.player)
      };
      const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
      const realNow = Game.util.now;
      let simulatedNow = realNow();
      let simulatedHidden = true;
      let visibilitySimulated = false;
      try {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => simulatedHidden
        });
        Game.util.now = () => simulatedNow;
        document.dispatchEvent(new Event('visibilitychange'));
        simulatedNow += (15 * 60 + 19) * 1000;
        simulatedHidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        visibilitySimulated = true;
      } finally {
        Game.util.now = realNow;
        if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
        else delete document.hidden;
      }
      const summary = Game.offline.settle(15 * 60 + 19);
      const saveResult = Game.save.save('unopened-title-regression');
      Game.loop.catchup(90);
      Game.offline.apply({
        type: 'battle', seconds: 15 * 60 + 19, kills: 106,
        expBase: 1272, goldBase: 742, items: 16, potions: 7
      });
      return {
        started: Game.State.isAdventureStarted(),
        visibilitySimulated,
        summary,
        saveResult,
        worldTime: Game.state.world.worldTime,
        stats: JSON.stringify(Game.state.meta.stats),
        player: JSON.stringify(Game.state.player),
        before,
        mainSave: localStorage.getItem('firpg_save'),
        backupSave: localStorage.getItem('firpg_save_backup'),
        offlineModal: !!document.querySelector('#modal-root .offline-lines')
      };
    })()`);
    assert.equal(unopenedTitle.started, false);
    assert.equal(unopenedTitle.visibilitySimulated, true, 'title regression follows the visibilitychange path');
    assert.equal(unopenedTitle.summary, null, 'title state rejects a 15-minute offline settlement');
    assert.equal(unopenedTitle.saveResult, false, 'title state does not recreate a deleted save');
    assert.equal(unopenedTitle.worldTime, unopenedTitle.before.worldTime, 'title catchup does not advance world time');
    assert.equal(unopenedTitle.stats, unopenedTitle.before.stats, 'title catchup and stale claim do not change stats');
    assert.equal(unopenedTitle.player, unopenedTitle.before.player, 'title catchup and stale claim do not change the player');
    assert.equal(unopenedTitle.mainSave, null);
    assert.equal(unopenedTitle.backupSave, null);
    assert.equal(unopenedTitle.offlineModal, false);

    const titleCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const titleScreenshot = path.join(os.tmpdir(), 'firpg-title-camp-mobile-cdp.png');
    fs.writeFileSync(titleScreenshot, Buffer.from(titleCapture.data, 'base64'));

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 522, height: 1320, deviceScaleFactor: 1, mobile: true
    });
    await delay(180);
    const titleTallCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const titleTallScreenshot = path.join(os.tmpdir(), 'firpg-title-camp-tall-cdp.png');
    fs.writeFileSync(titleTallScreenshot, Buffer.from(titleTallCapture.data, 'base64'));

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 700, deviceScaleFactor: 1, mobile: true
    });
    await cdp.evaluate(`document.querySelector('#title-root .archive-view').click()`);
    await delay(480);
    const titleShortView = await cdp.evaluate(`(() => {
      const root = document.getElementById('title-root');
      const prompt = root.querySelector('.title-reveal-prompt').getBoundingClientRect();
      const lang = root.querySelector('.title-lang').getBoundingClientRect();
      const archive = root.querySelector('.title-archive');
      return {
        archiveOpen: root.classList.contains('is-archive-open'),
        archiveVisible: getComputedStyle(archive).visibility === 'visible',
        promptFits: prompt.top >= 0 && prompt.bottom <= innerHeight,
        promptHeight: prompt.height,
        languageHeight: lang.height,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(titleShortView.archiveOpen, false);
    assert.equal(titleShortView.archiveVisible, false);
    assert.equal(titleShortView.promptFits, true);
    assert.ok(titleShortView.promptHeight >= 44);
    assert.ok(titleShortView.languageHeight >= 44);
    assert.equal(titleShortView.noHorizontalOverflow, true);
    const titleShortCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const titleShortScreenshot = path.join(os.tmpdir(), 'firpg-title-camp-short-cdp.png');
    fs.writeFileSync(titleShortScreenshot, Buffer.from(titleShortCapture.data, 'base64'));

    await cdp.evaluate(`document.querySelector('#title-root .title-reveal').click()`);
    await delay(480);
    const titleShortArchive = await cdp.evaluate(`(() => {
      const archive = document.querySelector('#title-root .title-archive');
      const view = archive.querySelector('.archive-view').getBoundingClientRect();
      const rect = archive.getBoundingClientRect();
      return {
        visible: getComputedStyle(archive).visibility === 'visible' &&
          Number(getComputedStyle(archive).opacity) > 0.9,
        fits: rect.top >= 0 && rect.bottom <= innerHeight,
        viewHeight: view.height,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(titleShortArchive.visible, true);
    assert.equal(titleShortArchive.fits, true);
    assert.ok(titleShortArchive.viewHeight >= 44);
    assert.equal(titleShortArchive.noHorizontalOverflow, true);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true
    });
    await delay(120);

    const main = await cdp.evaluate(`(() => {
      if (!window.Game || !Game.world || !Game.world.layout) throw new Error('game boot failed');
      if (!Game.player.hasClass()) Game.player.setClass('fighter');
      Game.state.meta.prologueDone = true;
      Game.state.player.hp = Game.player.derived().maxHp;
      Game.entryState = 'active';
      Game.loop.start();
      Game.ui.title.hide();

      const firstSeed = Game.state.world.worldSeed;
      const firstRegion = Game.world.region.id;
      const snapA = JSON.stringify(Game.terrain.snapshot());
      Game.world.init(firstRegion);
      const snapB = JSON.stringify(Game.terrain.snapshot());
      if (snapA !== snapB) throw new Error('same-save layout changed after rebuild');
      Game.render.frame(0.016);

      Game.ui.tabs.open('map');
      const seedText = document.querySelector('.world-seed-row code')?.textContent;
      const expectedSeed = Game.util.hex32(firstSeed);
      if (seedText !== expectedSeed) throw new Error('map seed mismatch');
      document.querySelector('.seed-copy')?.click();

      const canvas = document.getElementById('stage');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += Math.max(4, Math.floor(pixels.length / 1200 / 4) * 4)) {
        colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2] + ',' + pixels[i + 3]);
      }
      return {
        seed: expectedSeed,
        mapSeed: seedText,
        copyButton: !!document.querySelector('.seed-copy'),
        toast: !!document.querySelector('.toast'),
        canvasColors: colors.size,
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        titleVisible: !!document.getElementById('title-root')
      };
    })()`);
    assert.equal(main.mapSeed, main.seed);
    assert.equal(main.copyButton, true);
    assert.equal(main.toast, true);
    assert.ok(main.canvasColors > 20, 'main stage canvas is nonblank');
    assert.equal(main.noHorizontalOverflow, true, 'main mobile viewport has no horizontal overflow');

    await cdp.evaluate(`Game.auto.optimizeEquipment({ reason: 'browser-slice-audit' })`);
    let equipmentJobDiagnostics = null;
    for (let attempt = 0; attempt < 100 && !equipmentJobDiagnostics; attempt++) {
      equipmentJobDiagnostics = await cdp.evaluate(`Game.auto.equipmentJobDiagnostics || null`);
      if (!equipmentJobDiagnostics) await delay(20);
    }
    assert.ok(equipmentJobDiagnostics, 'browser auto-equip publishes time-slice diagnostics');
    assert.equal(equipmentJobDiagnostics.budgetMs, 4);
    assert.ok(equipmentJobDiagnostics.maxSliceMs <= 4.5,
      'browser auto-equip stays within the 4ms slice budget: ' +
      JSON.stringify(equipmentJobDiagnostics));
    console.log('equipment auto-equip diagnostics:', JSON.stringify(equipmentJobDiagnostics));

    // Force a real production Boss encounter so the formal V2 HUD, telegraph,
    // priority marker, interrupt label, and collision-safe engagement distance
    // are validated independently of the player's current power.
    const combatHudFixture = await cdp.evaluate(`(() => {
      const W = Game.world;
      const originalRegion = W.region.id;
      W.endEncounter('browser-hud-fixture');
      W.init('grassland');
      Game.ui.tabs.open('battle');
      const hero = W.hero;
      const enemy = W.makeMonster(W.region.boss, true);
      enemy.x = hero.x;
      enemy.y = hero.y;
      enemy.spawnX = enemy.x;
      enemy.spawnY = enemy.y;
      enemy.maxHp = 1e9;
      enemy.hp = enemy.maxHp * 0.49;
      hero.hp = hero.maxHp;
      W.entities.push(enemy);
      Game.exploration.revealAt(hero.x, hero.y, { force: true, rid: 'grassland' });
      W.bossEnt = enemy;
      const encounter = W.startEncounter(enemy);
      if (!encounter) throw new Error('production HUD encounter did not start');
      hero.components.movement.intent = {
        type: 'move', reason: 'range', targetId: enemy.id,
        x: enemy.x, y: enemy.y, stopRange: hero.range || 24
      };
      enemy.components.movement.intent = {
        type: 'move', reason: 'range', targetId: hero.id,
        x: hero.x, y: hero.y, stopRange: 24
      };
      Game.combat.tickFixed(encounter.id);
      const telegraphAbility = enemy.abilities.map((id) => Game.content.get('ability', id))
        .find((def) => def && def.telegraph && def.target.relation === 'hostile');
      if (!telegraphAbility) throw new Error('Boss telegraph ability missing');
      enemy.components.actionState.state = 'idle';
      enemy.components.actionState.actionId = null;
      enemy.components.cooldowns.abilities = {};
      enemy.components.cooldowns.groups = {};
      const action = Game.combat.requestAction({
        actorId: enemy.id, targetId: hero.id, abilityId: telegraphAbility.id
      });
      if (!action.ok) throw new Error('Boss telegraph action rejected: ' + action.reason);
      Game.ui.hud.update(true);
      window.__combatHudFixture = {
        originalRegion,
        encounterId: encounter.id,
        heroId: hero.id,
        enemyId: enemy.id,
        telegraphAbilityId: telegraphAbility.id
      };
      const minimum = hero.components.body.collisionRadius +
        enemy.components.body.collisionRadius + 2;
      return {
        actionOk: action.ok,
        minimum,
        distance: Game.util.dist(hero.x, hero.y, enemy.x, enemy.y),
        priorityTargetId: hero.components.targeting.priorityTargetId,
        enemyId: enemy.id,
        phaseCount: Object.keys(encounter.phaseTriggered).length,
        telegraphCount: encounter.telegraphs.length
      };
    })()`);
    assert.equal(combatHudFixture.actionOk, true);
    assert.ok(combatHudFixture.distance >= combatHudFixture.minimum,
      'production combatants recover from coincident feet before rendering: ' +
      JSON.stringify(combatHudFixture));
    assert.equal(combatHudFixture.priorityTargetId, combatHudFixture.enemyId);
    assert.equal(combatHudFixture.phaseCount, 1);
    assert.equal(combatHudFixture.telegraphCount, 1);

    const combatHudLayouts = [];
    for (const viewport of [
      { width: 320, height: 568, mobile: true, lang: 'en' },
      { width: 360, height: 740, mobile: true, lang: 'zh-CN' },
      { width: 390, height: 700, mobile: true, lang: 'zh-CN' },
      { width: 390, height: 844, mobile: true, lang: 'en' },
      { width: 522, height: 1320, mobile: true, lang: 'zh-CN' },
      { width: 1280, height: 900, mobile: false, lang: 'en' }
    ]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width, height: viewport.height,
        deviceScaleFactor: 1, mobile: viewport.mobile
      });
      const layout = await cdp.evaluate(`(() => {
        Game.i18n.setLocale(${JSON.stringify(viewport.lang)});
        Game.ui.hud.update(true);
        const root = document.getElementById('combat-v2-hud');
        const stage = document.getElementById('stage-wrap').getBoundingClientRect();
        const rect = root.getBoundingClientRect();
        const party = document.getElementById('combat-v2-party').getBoundingClientRect();
        const partyCopy = document.getElementById('combat-v2-party-members').getBoundingClientRect();
        const center = root.querySelector('.combat-v2-center').getBoundingClientRect();
        const enemy = root.querySelector('.combat-v2-enemy').getBoundingClientRect();
        const enemyCopy = root.querySelector('.combat-v2-enemy-copy').getBoundingClientRect();
        const buttons = Array.from(root.querySelectorAll('.combat-v2-strategy button'));
        const portraitInfo = (id) => {
          const canvas = document.getElementById(id);
          const box = canvas.getBoundingClientRect();
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let opaquePixels = 0;
          for (let at = 3; at < pixels.length; at += 4) if (pixels[at]) opaquePixels++;
          return {
            source: canvas.getAttribute('data-portrait-source'),
            mode: canvas.getAttribute('data-portrait-mode'),
            label: canvas.getAttribute('aria-label'),
            width: box.width,
            height: box.height,
            opaquePixels,
            within: box.left >= rect.left - .5 && box.right <= rect.right + .5 &&
              box.top >= rect.top - .5 && box.bottom <= rect.bottom + .5
          };
        };
        return {
          lang: document.documentElement.lang,
          visible: !root.classList.contains('hidden') && rect.width > 0 && rect.height > 0,
          withinStage: rect.left >= stage.left - .5 && rect.right <= stage.right + .5 &&
            rect.top >= stage.top - .5 && rect.bottom <= stage.bottom + .5,
          buttons: buttons.map((button) => ({
            text: button.textContent.trim(),
            height: button.getBoundingClientRect().height,
            within: button.getBoundingClientRect().left >= rect.left - .5 &&
              button.getBoundingClientRect().right <= rect.right + .5
          })),
          partyRows: document.querySelectorAll('#combat-v2-party .combat-v2-member').length,
          action: document.getElementById('combat-v2-action-name').textContent.trim(),
          resource: document.getElementById('combat-v2-resource-name').textContent.trim(),
          enemy: document.getElementById('combat-v2-enemy-name').textContent.trim(),
          cast: document.getElementById('combat-v2-enemy-cast').textContent.trim(),
          phase: document.getElementById('combat-v2-phase').textContent.trim(),
          telegraph: document.getElementById('combat-v2-telegraph').textContent.trim(),
          danger: document.getElementById('combat-v2-telegraph').classList.contains('danger'),
          portraits: {
            ally: portraitInfo('combat-v2-party-portrait'),
            enemy: portraitInfo('combat-v2-enemy-portrait')
          },
          mobileFlow: {
            portraitTopDelta: Math.abs(
              document.getElementById('combat-v2-party-portrait').getBoundingClientRect().top -
              document.getElementById('combat-v2-enemy-portrait').getBoundingClientRect().top
            ),
            partyCopyFollowsPortrait: partyCopy.left >=
              document.getElementById('combat-v2-party-portrait').getBoundingClientRect().right - .5,
            enemyCopyPrecedesPortrait: enemyCopy.right <=
              document.getElementById('combat-v2-enemy-portrait').getBoundingClientRect().left + .5,
            centerFollowsActors: center.top >= Math.max(party.bottom, enemy.bottom) - .5
          },
          strategyLabel: document.getElementById('combat-v2-strategy').getAttribute('aria-label'),
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
        };
      })()`);
      combatHudLayouts.push({ viewport, layout });
      assert.equal(layout.lang, viewport.lang);
      assert.equal(layout.visible, true);
      assert.equal(layout.withinStage, true,
        'formal combat HUD fits stage at ' + viewport.width + '×' + viewport.height);
      assert.equal(layout.partyRows, 1);
      assert.ok(layout.action && layout.resource && layout.enemy);
      assert.ok(layout.cast.includes(viewport.lang === 'en' ? 'Interruptible' : '可打断'));
      assert.ok(layout.phase && layout.telegraph);
      assert.equal(layout.danger, true);
      assert.equal(layout.portraits.ally.mode, 'dedicated-portrait');
      assert.equal(layout.portraits.enemy.mode, 'sprite-portrait');
      assert.ok(layout.portraits.ally.label && layout.portraits.enemy.label);
      assert.ok(layout.portraits.ally.opaquePixels > 100 && layout.portraits.enemy.opaquePixels > 100);
      assert.ok(layout.portraits.ally.width >= 44 && layout.portraits.ally.height >= 44);
      assert.ok(layout.portraits.enemy.width >= 44 && layout.portraits.enemy.height >= 44);
      assert.equal(layout.portraits.ally.within, true);
      assert.equal(layout.portraits.enemy.within, true);
      if (viewport.width <= 620) {
        assert.ok(layout.mobileFlow.portraitTopDelta <= .5,
          'mobile combat portraits share one visual row at ' + viewport.width + '×' + viewport.height +
          ': ' + JSON.stringify(layout.mobileFlow));
        assert.equal(layout.mobileFlow.partyCopyFollowsPortrait, true);
        assert.equal(layout.mobileFlow.enemyCopyPrecedesPortrait, true);
        assert.equal(layout.mobileFlow.centerFollowsActors, true);
      }
      assert.equal(layout.strategyLabel,
        viewport.lang === 'en' ? 'Auto-combat strategy' : '自动战斗策略');
      assert.equal(layout.buttons.length, 4);
      assert.ok(layout.buttons.every((button) => button.height >= 44 && button.within));
      assert.equal(layout.noHorizontalOverflow, true);
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true
    });
    await cdp.evaluate(`(() => {
      Game.i18n.setLocale('zh-CN');
      const fixture = window.__combatHudFixture;
      const hero = Game.actors.get(fixture.heroId);
      const enemy = Game.actors.get(fixture.enemyId);
      const toastRoot = document.getElementById('toasts');
      if (toastRoot) toastRoot.replaceChildren();
      const camp = Game.world.layout.camp;
      const minimum = hero.components.body.collisionRadius +
        enemy.components.body.collisionRadius + 2;
      hero.x = camp.x + 30;
      hero.y = camp.y + 26;
      enemy.x = hero.x + minimum;
      enemy.y = hero.y;
      const encounter = Game.encounters.get(fixture.encounterId);
      encounter.telegraphs.forEach((telegraph) => {
        telegraph.x = hero.x;
        telegraph.y = hero.y;
      });
      Game.state.world.worldTime = 300;
      Game.exploration.revealAt(hero.x, hero.y, { force: true, rid: 'grassland' });
      Game.terrain.rebuildDynamicSpatial(Game.world.entities.concat(Game.world.groundLoot));
      Game.render.snapCamera((hero.x + enemy.x) / 2, (hero.y + enemy.y) / 2);
      Game.ui.hud.update(true);
      Game.render.frame(1 / 60);
      return true;
    })()`);
    const combatHudCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const combatHudScreenshot = path.join(os.tmpdir(), 'firpg-combat-v2-hud-mobile-cdp.png');
    fs.writeFileSync(combatHudScreenshot, Buffer.from(combatHudCapture.data, 'base64'));

    const stageWheelMobile = await cdp.evaluate(`(() => {
      const canvas = document.getElementById('stage');
      const rect = canvas.getBoundingClientRect();
      window.__stageGestureBoss = Game.world.bossEnt;
      Game.world.bossEnt = null;
      Game.render.resetViewScale();
      Game.render.frame(1 / 60);
      const point = { x: rect.width * .5, y: rect.height * .5 };
      const beforeAnchor = Game.render.screenToWorld(point.x, point.y);
      const zoomIn = new WheelEvent('wheel', {
        deltaY: -120, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        clientX: rect.left + point.x, clientY: rect.top + point.y,
        bubbles: true, cancelable: true
      });
      const zoomInAllowed = canvas.dispatchEvent(zoomIn);
      const afterAnchor = Game.render.screenToWorld(point.x, point.y);
      const zoomAfterIn = Game.render.viewScale();
      const zoomOut = new WheelEvent('wheel', {
        deltaY: 120, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        clientX: rect.left + point.x, clientY: rect.top + point.y,
        bubbles: true, cancelable: true
      });
      const zoomOutAllowed = canvas.dispatchEvent(zoomOut);
      return {
        zoomInAllowed, zoomOutAllowed, zoomAfterIn,
        zoomAfterOut: Game.render.viewScale(),
        anchorDelta: Math.hypot(afterAnchor.x - beforeAnchor.x, afterAnchor.y - beforeAnchor.y),
        touchAction: getComputedStyle(canvas).touchAction,
        stateSettingUntouched: !Object.prototype.hasOwnProperty.call(Game.state.settings, 'cameraZoom'),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      };
    })()`);
    assert.equal(stageWheelMobile.zoomInAllowed, false,
      'stage wheel is consumed while the camera scale changes');
    assert.equal(stageWheelMobile.zoomOutAllowed, false,
      'stage wheel zoom-out is consumed while the camera scale changes');
    assert.ok(stageWheelMobile.zoomAfterIn > 1.1 && stageWheelMobile.zoomAfterIn < 1.3,
      'stage wheel uses a continuous session camera scale');
    assert.ok(Math.abs(stageWheelMobile.zoomAfterOut - 1) < .001,
      'inverse stage wheel deltas return to the authored view');
    assert.ok(stageWheelMobile.anchorDelta < .001, 'stage wheel keeps the camera anchor stable');
    assert.equal(stageWheelMobile.touchAction, 'none');
    assert.equal(stageWheelMobile.stateSettingUntouched, true,
      'stage camera scale is not written into persistent settings');

    const stageRect = stageWheelMobile.rect;
    const stageTouchStart = [
      { x: stageRect.left + stageRect.width * .38, y: stageRect.top + stageRect.height * .42,
        radiusX: 4, radiusY: 4, force: 1, id: 41 },
      { x: stageRect.left + stageRect.width * .62, y: stageRect.top + stageRect.height * .42,
        radiusX: 4, radiusY: 4, force: 1, id: 42 }
    ];
    const stageTouchEnd = [
      { x: stageRect.left + stageRect.width * .30, y: stageRect.top + stageRect.height * .42,
        radiusX: 4, radiusY: 4, force: 1, id: 41 },
      { x: stageRect.left + stageRect.width * .70, y: stageRect.top + stageRect.height * .42,
        radiusX: 4, radiusY: 4, force: 1, id: 42 }
    ];
    await cdp.evaluate(`(() => {
      const rect = document.getElementById('stage').getBoundingClientRect();
      window.__stageGestureFixture = {
        originalTap: Game.world.handleTap,
        tapCount: 0,
        anchor: Game.render.screenToWorld(rect.width * .5, rect.height * .42)
      };
      Game.world.handleTap = function () { window.__stageGestureFixture.tapCount++; };
      return true;
    })()`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: stageTouchStart });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: stageTouchEnd });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const stagePinch = await cdp.evaluate(`(() => {
      const canvas = document.getElementById('stage');
      const rect = canvas.getBoundingClientRect();
      const anchor = Game.render.screenToWorld(rect.width * .5, rect.height * .42);
      const ghostClickAllowed = canvas.dispatchEvent(new MouseEvent('click', {
        clientX: rect.left + rect.width * .5,
        clientY: rect.top + rect.height * .42,
        bubbles: true, cancelable: true
      }));
      return {
        scale: Game.render.viewScale(),
        anchorDelta: Math.hypot(
          anchor.x - window.__stageGestureFixture.anchor.x,
          anchor.y - window.__stageGestureFixture.anchor.y
        ),
        ghostClickAllowed,
        tapCount: window.__stageGestureFixture.tapCount
      };
    })()`);
    assert.ok(Math.abs(stagePinch.scale - 1.35) < .01,
      'stage pinch continuously scales to the session maximum');
    assert.ok(stagePinch.anchorDelta < 1,
      'stage pinch keeps its midpoint world anchor stable: ' + JSON.stringify(stagePinch));
    assert.equal(stagePinch.ghostClickAllowed, false, 'stage pinch suppresses the synthetic trailing click');
    assert.equal(stagePinch.tapCount, 0, 'stage pinch does not issue a world tap command');

    await delay(500);
    const stageTapRecovery = await cdp.evaluate(`(() => {
      const canvas = document.getElementById('stage');
      const rect = canvas.getBoundingClientRect();
      const clickAllowed = canvas.dispatchEvent(new MouseEvent('click', {
        clientX: rect.left + rect.width * .5,
        clientY: rect.top + rect.height * .42,
        bubbles: true, cancelable: true
      }));
      const tapCount = window.__stageGestureFixture.tapCount;
      Game.world.handleTap = window.__stageGestureFixture.originalTap;
      delete window.__stageGestureFixture;
      const originalCinematic = Game.world.cinematic;
      Game.world.cinematic = { ent: Game.world.hero };
      Game.render.frame(1 / 60);
      const directedScale = Game.render.viewScale();
      const directedWheelAllowed = canvas.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -120, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        bubbles: true, cancelable: true
      }));
      const directedScaleAfter = Game.render.viewScale();
      Game.world.cinematic = originalCinematic;
      Game.world.bossEnt = window.__stageGestureBoss;
      delete window.__stageGestureBoss;
      Game.render.frame(1 / 60);
      Game.render.resetViewScale();
      return { clickAllowed, tapCount, directedWheelAllowed, directedScale, directedScaleAfter };
    })()`);
    assert.equal(stageTapRecovery.clickAllowed, true, 'ordinary stage taps recover after gesture suppression');
    assert.equal(stageTapRecovery.tapCount, 1, 'ordinary stage tap still reaches world input');
    assert.equal(stageTapRecovery.directedWheelAllowed, true, 'director camera releases the wheel event');
    assert.equal(stageTapRecovery.directedScaleAfter, stageTapRecovery.directedScale,
      'director camera ignores user zoom input');

    await cdp.evaluate(`(() => {
      const fixture = window.__combatHudFixture;
      Game.world.endEncounter('browser-hud-fixture-complete');
      Game.world.init(fixture.originalRegion);
      Game.ui.tabs.open('map');
      return true;
    })()`);

    const mapWheelMobile = await cdp.evaluate(`(() => {
      const canvas = document.querySelector('canvas[data-live-region-map]');
      const rect = canvas.getBoundingClientRect();
      const beforePixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const boundaryOut = new WheelEvent('wheel', {
        deltaY: 120, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        clientX: rect.left, clientY: rect.top, bubbles: true, cancelable: true
      });
      const boundaryAllowed = canvas.dispatchEvent(boundaryOut);
      const beforeAnchor = {
        x: Number(canvas.dataset.mapViewX),
        y: Number(canvas.dataset.mapViewY)
      };
      const zoomIn = new WheelEvent('wheel', {
        deltaY: -120, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        clientX: rect.left, clientY: rect.top, bubbles: true, cancelable: true
      });
      const zoomInAllowed = canvas.dispatchEvent(zoomIn);
      const afterPixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let pixelDiff = 0;
      for (let i = 0; i < afterPixels.length; i += 4) {
        if (afterPixels[i] !== beforePixels[i] || afterPixels[i + 1] !== beforePixels[i + 1] ||
            afterPixels[i + 2] !== beforePixels[i + 2] || afterPixels[i + 3] !== beforePixels[i + 3]) pixelDiff++;
      }
      const afterAnchor = {
        x: Number(canvas.dataset.mapViewX),
        y: Number(canvas.dataset.mapViewY)
      };
      const zoomAfterIn = Number(canvas.dataset.mapZoom);
      const zoomOut = new WheelEvent('wheel', {
        deltaY: 120, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        clientX: rect.left, clientY: rect.top, bubbles: true, cancelable: true
      });
      const zoomOutAllowed = canvas.dispatchEvent(zoomOut);
      window.__firpgMapGesture = {
        canvas,
        heroOrder: Game.world.hero.moveOrder,
        anchor: {
          x: Number(canvas.dataset.mapViewX) + canvas.width * 0.5 / Number(canvas.dataset.mapZoom),
          y: Number(canvas.dataset.mapViewY) + canvas.height * 0.5 / Number(canvas.dataset.mapZoom)
        }
      };
      return {
        boundaryAllowed,
        zoomInAllowed,
        zoomOutAllowed,
        zoomAfterIn,
        zoomAfterOut: Number(canvas.dataset.mapZoom),
        zoomOutDisabled: document.querySelector('[data-zoom="-1"]').disabled,
        anchorDelta: Math.hypot(afterAnchor.x - beforeAnchor.x, afterAnchor.y - beforeAnchor.y),
        pixelDiff,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      };
    })()`);
    assert.equal(mapWheelMobile.boundaryAllowed, true, 'wheel leaves the panel scrollable at minimum zoom');
    assert.equal(mapWheelMobile.zoomInAllowed, false, 'wheel zoom consumes the event while the scale changes');
    assert.equal(mapWheelMobile.zoomOutAllowed, false, 'wheel zoom-out consumes the event while the scale changes');
    assert.ok(mapWheelMobile.zoomAfterIn > 1.1 && mapWheelMobile.zoomAfterIn < 1.3,
      'wheel uses a continuous scale instead of the 1.35 button step');
    assert.ok(Math.abs(mapWheelMobile.zoomAfterOut - 1) < 0.001, 'inverse wheel deltas return to overview');
    assert.equal(mapWheelMobile.zoomOutDisabled, true, 'zoom-out button reflects the minimum boundary');
    assert.ok(mapWheelMobile.anchorDelta < 0.001, 'a zero-coordinate wheel anchor stays fixed');
    assert.ok(mapWheelMobile.pixelDiff > 20, 'wheel zoom visibly recomposites the map');

    const mapRect = mapWheelMobile.rect;
    const touchStart = [
      { x: mapRect.left + mapRect.width * 0.35, y: mapRect.top + mapRect.height * 0.5,
        radiusX: 4, radiusY: 4, force: 1, id: 1 },
      { x: mapRect.left + mapRect.width * 0.65, y: mapRect.top + mapRect.height * 0.5,
        radiusX: 4, radiusY: 4, force: 1, id: 2 }
    ];
    const touchEnd = [
      { x: mapRect.left + mapRect.width * 0.25, y: mapRect.top + mapRect.height * 0.5,
        radiusX: 4, radiusY: 4, force: 1, id: 1 },
      { x: mapRect.left + mapRect.width * 0.85, y: mapRect.top + mapRect.height * 0.5,
        radiusX: 4, radiusY: 4, force: 1, id: 2 }
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchStart });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchEnd });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const mapPinch = await cdp.evaluate(`(() => {
      const fixture = window.__firpgMapGesture;
      const canvas = document.querySelector('canvas[data-live-region-map]');
      const zoom = Number(canvas.dataset.mapZoom);
      const anchorAfter = {
        x: Number(canvas.dataset.mapViewX) + canvas.width * 0.55 / zoom,
        y: Number(canvas.dataset.mapViewY) + canvas.height * 0.5 / zoom
      };
      return {
        sameCanvas: canvas === fixture.canvas,
        zoom,
        anchorDelta: Math.hypot(anchorAfter.x - fixture.anchor.x, anchorAfter.y - fixture.anchor.y),
        heroOrderUntouched: Game.world.hero.moveOrder === fixture.heroOrder,
        x: Number(canvas.dataset.mapViewX),
        y: Number(canvas.dataset.mapViewY)
      };
    })()`);
    assert.equal(mapPinch.sameCanvas, true, 'pinch keeps the live map canvas instance');
    assert.ok(Math.abs(mapPinch.zoom - 2) < 0.02, 'pinch distance controls map scale continuously');
    assert.ok(mapPinch.anchorDelta < 0.2, 'pinch keeps the map point under its moving midpoint');
    assert.equal(mapPinch.heroOrderUntouched, true, 'map gestures do not issue world movement orders');

    const dragStart = {
      x: mapRect.left + mapRect.width * 0.55,
      y: mapRect.top + mapRect.height * 0.5,
      radiusX: 4, radiusY: 4, force: 1, id: 3
    };
    const dragEnd = {
      x: mapRect.left + mapRect.width * 0.45,
      y: mapRect.top + mapRect.height * 0.42,
      radiusX: 4, radiusY: 4, force: 1, id: 3
    };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [dragStart] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [dragEnd] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const mapGestureCleanup = await cdp.evaluate(`(() => {
      const canvas = document.querySelector('canvas[data-live-region-map]');
      const rect = canvas.getBoundingClientRect();
      const dragged = {
        x: Number(canvas.dataset.mapViewX),
        y: Number(canvas.dataset.mapViewY)
      };
      function pointer(type, id, x, y) {
        canvas.dispatchEvent(new PointerEvent(type, {
          pointerId: id, pointerType: 'touch', isPrimary: true,
          clientX: x, clientY: y, bubbles: true, cancelable: true
        }));
      }
      pointer('pointerdown', 91, rect.left + 80, rect.top + 80);
      pointer('pointercancel', 91, rect.left + 80, rect.top + 80);
      const cancelX = Number(canvas.dataset.mapViewX);
      const cancelY = Number(canvas.dataset.mapViewY);
      pointer('pointermove', 91, rect.left + 130, rect.top + 120);
      const cancelStable = cancelX === Number(canvas.dataset.mapViewX) &&
        cancelY === Number(canvas.dataset.mapViewY);

      pointer('pointerdown', 92, rect.left + 90, rect.top + 90);
      pointer('lostpointercapture', 92, rect.left + 90, rect.top + 90);
      const lostX = Number(canvas.dataset.mapViewX);
      const lostY = Number(canvas.dataset.mapViewY);
      pointer('pointermove', 92, rect.left + 140, rect.top + 130);
      const lostStable = lostX === Number(canvas.dataset.mapViewX) &&
        lostY === Number(canvas.dataset.mapViewY);

      for (let i = 0; i < 8; i++) document.querySelector('[data-zoom="1"]').click();
      const maxZoom = Number(canvas.dataset.mapZoom);
      const maxDisabled = document.querySelector('[data-zoom="1"]').disabled;
      const maxWheelAllowed = canvas.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -240, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        bubbles: true, cancelable: true
      }));
      for (let i = 0; i < 12; i++) document.querySelector('[data-zoom="-1"]').click();
      const minZoom = Number(canvas.dataset.mapZoom);
      const minDisabled = document.querySelector('[data-zoom="-1"]').disabled;
      delete window.__firpgMapGesture;
      return {
        dragged: dragged.x > ${mapPinch.x} && dragged.y > ${mapPinch.y},
        cancelStable, lostStable, maxZoom, maxDisabled, maxWheelAllowed, minZoom, minDisabled,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(mapGestureCleanup.dragged, true, 'one-finger drag resumes after pinch');
    assert.equal(mapGestureCleanup.cancelStable, true, 'pointercancel clears drag state');
    assert.equal(mapGestureCleanup.lostStable, true, 'lost pointer capture clears drag state');
    assert.equal(mapGestureCleanup.maxZoom, 3, 'button zoom clamps to the maximum');
    assert.equal(mapGestureCleanup.maxDisabled, true, 'zoom-in button reflects the maximum boundary');
    assert.equal(mapGestureCleanup.maxWheelAllowed, true, 'wheel is released at maximum zoom');
    assert.equal(mapGestureCleanup.minZoom, 1, 'button zoom clamps to the minimum');
    assert.equal(mapGestureCleanup.minDisabled, true, 'zoom-out button reflects the minimum boundary');
    assert.equal(mapGestureCleanup.noHorizontalOverflow, true);

    const mapLiveStart = await cdp.evaluate(`(() => {
      Game.world.setControlMode('manual');
      const canvas = document.querySelector('canvas[data-live-region-map]');
      if (!canvas) throw new Error('live region map canvas missing');
      const layout = Game.world.layout;
      const rid = Game.state.world.region;
      const targets = [];
      for (let gy = 2; gy < layout.nav.h - 2 && targets.length < 5; gy += 7) {
        for (let gx = 2; gx < layout.nav.w - 2 && targets.length < 5; gx += 9) {
          if (!layout.nav.grid[gy][gx]) continue;
          const point = { x: gx * layout.nav.cell + layout.nav.cell / 2,
            y: gy * layout.nav.cell + layout.nav.cell / 2 };
          if (Game.exploration.isRevealed(point.x, point.y, rid)) continue;
          if (targets.some((other) => Game.util.dist(other.x, other.y, point.x, point.y) < 240)) continue;
          targets.push(point);
        }
      }
      if (!targets.length) throw new Error('no unrevealed live-map fixture found');
      window.__firpgMapLive = {
        canvas,
        pixels: Uint8ClampedArray.from(canvas.getContext('2d')
          .getImageData(0, 0, canvas.width, canvas.height).data)
      };
      const beforeCoverage = document.querySelector('[data-map-coverage]').textContent;
      targets.forEach((point) => Game.exploration.revealAt(point.x, point.y, { force: true, rid }));
      Game.exploration.update(0.2);
      return {
        beforeCoverage,
        targets: targets.length,
        listeners: (Game.bus._map['readiness:changed'] || []).length
      };
    })()`);
    await delay(320);
    const mapLiveFog = await cdp.evaluate(`(() => {
      const fixture = window.__firpgMapLive;
      const canvas = document.querySelector('canvas[data-live-region-map]');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let pixelDiff = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== fixture.pixels[i] || pixels[i + 1] !== fixture.pixels[i + 1] ||
            pixels[i + 2] !== fixture.pixels[i + 2] || pixels[i + 3] !== fixture.pixels[i + 3]) pixelDiff++;
      }
      const summary = Game.collection.regionSummary(Game.state.world.region);
      const expectedCoverage = Game.i18n.t('explore.coverageLine', {
        p: Math.floor(summary.coverage * 100)
      });
      fixture.heroPixels = Uint8ClampedArray.from(pixels);
      const hero = Game.world.hero;
      const layout = Game.world.layout;
      let destination = null;
      for (let gy = layout.nav.h - 3; gy > 1 && !destination; gy -= 3) {
        for (let gx = layout.nav.w - 3; gx > 1; gx -= 3) {
          if (!layout.nav.grid[gy][gx]) continue;
          const x = gx * layout.nav.cell + layout.nav.cell / 2;
          const y = gy * layout.nav.cell + layout.nav.cell / 2;
          if (Game.util.dist(hero.x, hero.y, x, y) > 500) { destination = { x, y }; break; }
        }
      }
      if (!destination) throw new Error('no live hero marker destination found');
      hero.x = destination.x;
      hero.y = destination.y;
      return {
        sameCanvas: canvas === fixture.canvas,
        pixelDiff,
        coverage: document.querySelector('[data-map-coverage]').textContent,
        expectedCoverage
      };
    })()`);
    assert.equal(mapLiveStart.targets, 5);
    assert.equal(mapLiveFog.sameCanvas, true, 'live map updates without rebuilding the panel canvas');
    assert.ok(mapLiveFog.pixelDiff > 100, 'live map repaints newly revealed fog cells');
    assert.notEqual(mapLiveFog.coverage, mapLiveStart.beforeCoverage, 'live coverage text advances in place');
    assert.equal(mapLiveFog.coverage, mapLiveFog.expectedCoverage);

    await delay(140);
    const mapLiveHero = await cdp.evaluate(`(() => {
      const fixture = window.__firpgMapLive;
      const canvas = document.querySelector('canvas[data-live-region-map]');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let pixelDiff = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== fixture.heroPixels[i] || pixels[i + 1] !== fixture.heroPixels[i + 1] ||
            pixels[i + 2] !== fixture.heroPixels[i + 2] || pixels[i + 3] !== fixture.heroPixels[i + 3]) pixelDiff++;
      }
      const before = (Game.bus._map['readiness:changed'] || []).length;
      Game.ui.tabs.open('battle');
      const afterClose = (Game.bus._map['readiness:changed'] || []).length;
      Game.ui.tabs.open('map');
      const afterReopen = (Game.bus._map['readiness:changed'] || []).length;
      delete window.__firpgMapLive;
      return { pixelDiff, before, afterClose, afterReopen };
    })()`);
    assert.ok(mapLiveHero.pixelDiff > 30, 'hero marker follows world coordinates at the live refresh rate');
    assert.equal(mapLiveHero.afterClose, mapLiveHero.before - 1, 'closing the map removes its live listener');
    assert.equal(mapLiveHero.afterReopen, mapLiveHero.before, 'reopening the map installs one live listener');

    await delay(850);
    const mainCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const mainScreenshot = path.join(os.tmpdir(), 'firpg-main-map-mobile-cdp.png');
    fs.writeFileSync(mainScreenshot, Buffer.from(mainCapture.data, 'base64'));

    // v3 visual and interaction regression: the camp is always dry, the richer
    // material bake remains visible, and automatic gathering cannot beat fog.
    const v3CampVisual = await cdp.evaluate(`(() => {
      Game.ui.tabs.open('battle');
      Game.state.world.worldSeed = 0x1098DC78;
      Game.state.world.layoutVersion = 3;
      Game.state.world.region = 'grassland';
      Game.state.world.mode = 'battle';
      Game.State.regionProg('grassland').kills = 0;
      Game.world.init('grassland');
      Game.world.setControlMode('manual');
      const layout = Game.world.layout;
      const hero = Game.world.hero;
      hero.x = layout.camp.x + 44;
      hero.y = layout.camp.y + 32;
      hero.state = 'idle';
      hero.target = null;
      hero.moveOrder = null;
      Game.exploration.revealAt(hero.x, hero.y, { force: true });
      Game.render.snapCamera(layout.camp.x, layout.camp.y);
      for (let i = 0; i < 8; i++) Game.render.frame(1 / 60);
      const cell = layout.cell;
      const materialAt = (x, y) => layout.grid[
        Math.floor(y / cell) * layout.gw + Math.floor(x / cell)
      ];
      const nearbyProps = layout.props.filter((prop) =>
        Math.abs(prop.x - layout.camp.x) <= 250 &&
        Math.abs(prop.y - layout.camp.y) <= 300);
      const nearbyGround = layout.tufts.filter((prop) =>
        Math.abs(prop.x - layout.camp.x) <= 250 &&
        Math.abs(prop.y - layout.camp.y) <= 300).length +
        layout.flowers.filter((prop) =>
          Math.abs(prop.x - layout.camp.x) <= 250 &&
          Math.abs(prop.y - layout.camp.y) <= 300).length;
      const canvas = document.getElementById('stage');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += Math.max(4, Math.floor(pixels.length / 2200 / 4) * 4)) {
        colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
      }
      return {
        version: layout.version,
        props: layout.props.length,
        tufts: layout.tufts.length,
        flowers: layout.flowers.length,
        nearbyProps: nearbyProps.length,
        nearbyGround,
        canvasColors: colors.size,
        campMaterials: [[0, 0], [30, 26], [22, 22], [-62, 25], [48, 4]]
          .map(([dx, dy]) => materialAt(layout.camp.x + dx, layout.camp.y + dy))
      };
    })()`);
    assert.equal(v3CampVisual.version, 3);
    assert.ok(v3CampVisual.props >= 550, 'v3 environment is not sparse: ' + JSON.stringify(v3CampVisual));
    assert.ok(v3CampVisual.nearbyProps >= 8, 'camp viewport contains environmental silhouettes');
    assert.ok(v3CampVisual.nearbyGround >= 20, 'camp viewport contains ground detail');
    assert.ok(v3CampVisual.canvasColors >= 180, 'v3 material bake preserves rich color variation');
    assert.ok(v3CampVisual.campMaterials.every((material) =>
      !['water', 'lava', 'blocked', 'void'].includes(material)),
    'camp and camp props are placed on dry terrain: ' + JSON.stringify(v3CampVisual));
    await delay(120);
    const v3CampCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const v3CampScreenshot = path.join(os.tmpdir(), 'firpg-v1-13-camp-mobile-cdp.png');
    fs.writeFileSync(v3CampScreenshot, Buffer.from(v3CampCapture.data, 'base64'));

    const v3ResourceVisual = await cdp.evaluate(`(() => {
      const layout = Game.world.layout;
      const hero = Game.world.hero;
      const hidden = layout.nodes.find((node) => !Game.exploration.isRevealed(node.x, node.y));
      if (!hidden) throw new Error('v3 hidden resource probe missing');
      const hiddenRejected = Game.world.startInteraction({ type: 'gather', target: hidden }, false) === false;
      const node = hidden;
      const projected = Game.terrain.projectPoint(node.x - 42, node.y, 2) ||
        Game.terrain.projectPoint(node.x + 42, node.y, 2);
      hero.x = projected.x;
      hero.y = projected.y;
      hero.state = 'idle';
      hero.target = null;
      hero.moveOrder = null;
      hero.interactOrder = null;
      Game.exploration.revealAt(node.x, node.y, { force: true });
      const revealed = Game.exploration.isRevealed(node.x, node.y);
      const immediateAccepted =
        Game.world.startInteraction({ type: 'gather', target: node }, false) === true;
      Game.world.cancelInteraction('browser-probe');
      Game.world.setControlMode('manual');
      Game.render.snapCamera(node.x, node.y);
      for (let i = 0; i < 8; i++) Game.render.frame(1 / 60);
      const canvas = document.getElementById('stage');
      const context = canvas.getContext('2d');
      const generatedPhase = node.phase;
      // Exercise the compatibility branch too: v3 layouts produced by the
      // broken build did not contain phase and used to turn the sprite y into NaN.
      delete node.phase;
      Game.render.frame(0);
      const withResource = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const drawGatherNode = Game.render.drawGatherNode;
      Game.render.drawGatherNode = function (entry, time) {
        if (entry !== node) drawGatherNode.call(Game.render, entry, time);
      };
      Game.render.frame(0);
      const withoutResource = context.getImageData(0, 0, canvas.width, canvas.height).data;
      Game.render.drawGatherNode = drawGatherNode;
      node.phase = generatedPhase;
      Game.render.frame(0);
      let resourcePixelDiff = 0;
      for (let i = 0; i < withResource.length; i += 4) {
        if (withResource[i] !== withoutResource[i] ||
            withResource[i + 1] !== withoutResource[i + 1] ||
            withResource[i + 2] !== withoutResource[i + 2] ||
            withResource[i + 3] !== withoutResource[i + 3]) resourcePixelDiff++;
      }
      return {
        id: node.id,
        sprite: node.sprite,
        phaseFinite: Number.isFinite(generatedPhase),
        resourcePixelDiff,
        hiddenRejected,
        revealed,
        immediateAccepted
      };
    })()`);
    assert.equal(v3ResourceVisual.hiddenRejected, true);
    assert.equal(v3ResourceVisual.revealed, true);
    assert.equal(v3ResourceVisual.immediateAccepted, true);
    assert.equal(v3ResourceVisual.phaseFinite, true);
    assert.ok(v3ResourceVisual.resourcePixelDiff >= 80,
      'a mature v3 gatherable must paint real pixels before gathering: ' +
      JSON.stringify(v3ResourceVisual));
    await delay(120);
    const v3ResourceCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const v3ResourceScreenshot = path.join(os.tmpdir(), 'firpg-v1-13-resource-mobile-cdp.png');
    fs.writeFileSync(v3ResourceScreenshot, Buffer.from(v3ResourceCapture.data, 'base64'));
    const v3DepletedVisual = await cdp.evaluate(`(() => {
      const node = Game.world.layout.nodes.find((entry) =>
        entry.id === ${JSON.stringify(v3ResourceVisual.id)});
      if (!node) throw new Error('v3 depleted resource probe missing');
      Game.state.world.nodeCooldowns[node.id] = 60;
      for (let i = 0; i < 8; i++) Game.render.frame(1 / 60);
      return { id: node.id, ready: Game.environment.nodeReady(node) };
    })()`);
    assert.equal(v3DepletedVisual.ready, false);
    await delay(80);
    const v3DepletedCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const v3DepletedScreenshot = path.join(os.tmpdir(), 'firpg-v1-13-resource-depleted-mobile-cdp.png');
    fs.writeFileSync(v3DepletedScreenshot, Buffer.from(v3DepletedCapture.data, 'base64'));

    // Reproduce the reported dark mine node specifically. It must contribute
    // visible pixels while idle, before any gather order or progress ring exists.
    const v3MineResourceVisual = await cdp.evaluate(`(() => {
      Game.state.world.worldSeed = 0x397D5DF1;
      Game.state.world.layoutVersion = 3;
      Game.state.world.region = 'mine';
      Game.state.world.mode = 'battle';
      Game.world.init('mine');
      Game.world.setControlMode('manual');
      const layout = Game.world.layout;
      const node = layout.nodes.find((entry) => entry.defId === 'coal_shard');
      if (!node) throw new Error('v3 coal shard probe missing');
      const hero = Game.world.hero;
      const projected = Game.terrain.projectPoint(node.x - 48, node.y + 8, 2) ||
        Game.terrain.projectPoint(node.x + 48, node.y + 8, 2);
      hero.x = projected.x;
      hero.y = projected.y;
      hero.state = 'idle';
      hero.target = null;
      hero.moveOrder = null;
      hero.interactOrder = null;
      Game.state.world.nodeCooldowns[node.id] = 0;
      Game.exploration.revealAt(node.x, node.y, { force: true });
      Game.render.snapCamera(node.x, node.y);
      const canvas = document.getElementById('stage');
      const context = canvas.getContext('2d');
      delete node.phase;
      Game.render.frame(0);
      const withResource = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const drawGatherNode = Game.render.drawGatherNode;
      Game.render.drawGatherNode = function (entry, time) {
        if (entry !== node) drawGatherNode.call(Game.render, entry, time);
      };
      Game.render.frame(0);
      const withoutResource = context.getImageData(0, 0, canvas.width, canvas.height).data;
      Game.render.drawGatherNode = drawGatherNode;
      Game.render.frame(0);
      let resourcePixelDiff = 0;
      for (let i = 0; i < withResource.length; i += 4) {
        if (withResource[i] !== withoutResource[i] ||
            withResource[i + 1] !== withoutResource[i + 1] ||
            withResource[i + 2] !== withoutResource[i + 2] ||
            withResource[i + 3] !== withoutResource[i + 3]) resourcePixelDiff++;
      }
      return {
        id: node.id,
        sprite: node.sprite,
        resourcePixelDiff,
        ready: Game.environment.nodeReady(node),
        revealed: Game.exploration.isRevealed(node.x, node.y),
        idleBeforeGather: !hero.interactOrder && hero.state === 'idle'
      };
    })()`);
    assert.equal(v3MineResourceVisual.sprite, 'gather_coal_shard');
    assert.equal(v3MineResourceVisual.ready, true);
    assert.equal(v3MineResourceVisual.revealed, true);
    assert.equal(v3MineResourceVisual.idleBeforeGather, true);
    assert.ok(v3MineResourceVisual.resourcePixelDiff >= 80,
      'the dark mine resource must be visible before gathering: ' +
      JSON.stringify(v3MineResourceVisual));
    const v3MineResourceCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const v3MineResourceScreenshot = path.join(os.tmpdir(), 'firpg-v1-13-mine-resource-before-gather-mobile-cdp.png');
    fs.writeFileSync(v3MineResourceScreenshot, Buffer.from(v3MineResourceCapture.data, 'base64'));

    const v3Navigation = await cdp.evaluate(`(() => {
      const cases = [
        ['forest', 0x51A7E001],
        ['mine', 0x51A7E002],
        ['graveyard', 0x51A7E003],
        ['snowpass', 0x51A7E004],
        ['lavacave', 0x51A7E005],
        ['skyruins', 0x51A7E006],
        ['darkcastle', 0x51A7E007]
      ];
      const runs = [];
      Game.state.settings.autoBoss = false;
      for (const [rid, seed] of cases) {
        Game.state.world.worldSeed = seed;
        Game.state.world.layoutVersion = 3;
        Game.state.world.region = rid;
        Game.state.world.mode = 'battle';
        const progress = Game.State.regionProg(rid);
        progress.kills = 0;
        progress.firstKill = false;
        Game.world.init(rid);
        const hero = Game.world.hero;
        Game.state.player.hp = hero.maxHp;
        Game.world.entities = [hero];
        Game.world.pendingRespawn = [];
        Game.world.bossEnt = null;
        Game.terrain.rebuildDynamicSpatial([hero]);
        Game.world.setControlMode('auto');
        hero.state = 'idle';
        hero.target = null;
        hero.moveOrder = null;
        hero.interactOrder = null;
        for (const node of Game.world.layout.nodes) {
          Game.state.world.nodeCooldowns[node.id] = 9999;
        }
        let previousX = hero.x;
        let previousY = hero.y;
        let travelled = 0;
        let still = 0;
        let maxStill = 0;
        let activeOrder = null;
        let prematureSwitches = 0;
        let firstGoalDistance = null;
        const targets = new Set();
        const startCoverage = Game.exploration.coverage(rid);
        for (let step = 0; step < 900; step++) {
          Game.state.world.worldTime += 0.1;
          Game.terrain.update(0.1);
          Game.world.update(0.1);
          const moved = Game.util.dist(previousX, previousY, hero.x, hero.y);
          travelled += moved;
          previousX = hero.x;
          previousY = hero.y;
          const intent = Game.expeditionAI.intent();
          if (intent.target && intent.target.id) targets.add(intent.target.id);
          const order = hero.moveOrder;
          if (order && order.ai) {
            if (firstGoalDistance === null) {
              firstGoalDistance = Game.util.dist(hero.x, hero.y, order.x, order.y);
            }
            if (activeOrder && activeOrder.id !== order.id &&
                !activeOrder.hazardEscapeId && !order.hazardEscapeId &&
                Game.util.dist(hero.x, hero.y, activeOrder.x, activeOrder.y) > 7) {
              prematureSwitches++;
            }
            activeOrder = {
              id: order.id, x: order.x, y: order.y,
              hazardEscapeId: order.hazardEscapeId || null
            };
          } else {
            activeOrder = null;
          }
          const expectsMove = (hero.moveOrder && hero.moveOrder.ai) ||
            ['frontier', 'discovery', 'boss'].includes(intent.id);
          if (expectsMove && moved < 0.15) still++;
          else still = 0;
          if (still > maxStill) maxStill = still;
        }
        runs.push({
          rid,
          travelled,
          maxStillSeconds: maxStill / 10,
          targets: targets.size,
          prematureSwitches,
          firstGoalDistance,
          frontierHorizon: Game.exploration.FRONTIER_HORIZON,
          startCoverage,
          endCoverage: Game.exploration.coverage(rid),
          finalIntent: Game.expeditionAI.intent().id
        });
      }
      Game.state.settings.autoBoss = true;
      return runs;
    })()`);
    for (const run of v3Navigation) {
      assert.ok(run.travelled >= 350,
        run.rid + ' auto-expedition travels through the map: ' + JSON.stringify(run));
      assert.ok(run.maxStillSeconds < 6.8,
        run.rid + ' auto-expedition does not remain stuck: ' + JSON.stringify(run));
      assert.ok(run.targets >= 2,
        run.rid + ' auto-expedition advances between objectives: ' + JSON.stringify(run));
      assert.equal(run.prematureSwitches, 0,
        run.rid + ' keeps each AI travel target until arrival: ' + JSON.stringify(run));
      assert.ok(run.firstGoalDistance > 0 &&
        run.firstGoalDistance <= run.frontierHorizon + 2,
        run.rid + ' starts with a local frontier goal: ' + JSON.stringify(run));
      assert.ok(run.endCoverage > run.startCoverage,
        run.rid + ' auto-expedition reveals new fog: ' + JSON.stringify(run));
    }

    const v3AutoActions = await cdp.evaluate(`(() => {
      const W = Game.world;
      Game.state.world.worldSeed = 0xA170AC71;
      Game.state.world.layoutVersion = 3;
      Game.state.world.region = 'mine';
      Game.state.world.mode = 'battle';
      Game.state.settings.controlMode = 'auto';
      Game.state.settings.expeditionStrategy = 'balanced';
      Game.state.settings.autoBoss = false;
      W.init('mine');
      let hero = W.hero;
      W.entities = [hero];
      W.pendingRespawn = [];
      W.bossEnt = null;
      Game.expeditionAI.reset();
      Game.actionBubbles.clear();

      const node = W.layout.nodes.find((entry) =>
        !Game.exploration.isRevealed(entry.x, entry.y));
      if (!node) throw new Error('auto-action resource probe missing');
      let stand = null;
      for (const radius of [48, 36, 24, 0]) {
        for (let i = 0; i < 8 && !stand; i++) {
          const angle = i * Math.PI / 4;
          const point = Game.terrain.projectPoint(
            node.x + Math.cos(angle) * radius,
            node.y + Math.sin(angle) * radius,
            2
          );
          if (point && Game.util.dist(point.x, point.y, node.x, node.y) <= 68) stand = point;
        }
      }
      if (!stand) throw new Error('auto-action resource stand point missing');
      hero.x = stand.x;
      hero.y = stand.y;
      hero.state = 'idle';
      hero.target = null;
      hero.interactOrder = null;
      hero.navRoute = null;
      for (const entry of W.layout.nodes) {
        Game.state.world.nodeCooldowns[entry.id] = entry === node ? 0 : 9999;
      }
      Game.state.world.worldTime = 1000;
      Game.exploration.revealAt(hero.x, hero.y, { force: true });
      const materialBefore = Game.state.inv.materials[node.material] || 0;
      const far = W.layout.bossPoint;
      hero.moveOrder = {
        x: far.x, y: far.y, id: 'ai-frontier:test-long-route',
        ai: true, targetRef: { id: 'test-long-route', x: far.x, y: far.y }
      };
      let maxNodeDistance = 0;
      const resourceBubbleTypes = new Set();
      for (let step = 0; step < 60 && !Game.state.world.nodeCooldowns[node.id]; step++) {
        Game.state.world.worldTime += 0.1;
        Game.terrain.update(0.1);
        W.update(0.1);
        for (const bubble of Game.actionBubbles.active()) {
          if (bubble.entityKind === 'hero') resourceBubbleTypes.add(bubble.type);
        }
        maxNodeDistance = Math.max(
          maxNodeDistance,
          Game.util.dist(hero.x, hero.y, node.x, node.y)
        );
      }
      const gathered = Game.state.world.nodeCooldowns[node.id] > 0;
      const materialAfter = Game.state.inv.materials[node.material] || 0;
      const gatherTrace = Game.expeditionAI.trace();

      W.init('mine');
      hero = W.hero;
      W.pendingRespawn = [];
      W.bossEnt = null;
      for (const entry of W.layout.nodes) Game.state.world.nodeCooldowns[entry.id] = 9999;
      let encounterPoint = null;
      for (const radius of [60, 56, 52]) {
        for (let i = 0; i < 12 && !encounterPoint; i++) {
          const angle = i * Math.PI / 6;
          const point = Game.terrain.projectPoint(
            hero.x + Math.cos(angle) * radius,
            hero.y + Math.sin(angle) * radius,
            2
          );
          const distance = point && Game.util.dist(hero.x, hero.y, point.x, point.y);
          if (distance >= 48 && distance <= 68) encounterPoint = point;
        }
      }
      if (!encounterPoint) throw new Error('auto-action encounter point missing');
      const monster = W.makeMonster(W.region.monsters[0], false);
      monster.x = encounterPoint.x;
      monster.y = encounterPoint.y;
      monster.spawnX = monster.x;
      monster.spawnY = monster.y;
      W.entities = [hero, monster];
      Game.exploration.revealAt(monster.x, monster.y, { force: true });
      const routePoint = W.layout.bossPoint;
      hero.target = null;
      hero.interactOrder = null;
      hero.moveOrder = {
        x: routePoint.x, y: routePoint.y, id: 'ai-frontier:test-encounter',
        ai: true, targetRef: { id: 'test-encounter', x: routePoint.x, y: routePoint.y }
      };
      Game.expeditionAI.reset();
      Game.expeditionAI.update(hero, 0.4);
      const routeEncounter = {
        acquired: hero.target === monster,
        moveCleared: hero.moveOrder === null,
        intent: Game.expeditionAI.intent().id,
        reason: Game.expeditionAI.intent().reason,
        bubbles: Game.actionBubbles.active(),
        trace: Game.expeditionAI.trace()
      };

      hero.target = null;
      monster.engaged = false;
      Game.actionBubbles.clear();
      hero.moveOrder = {
        x: routePoint.x, y: routePoint.y, id: 'player:test-order', ai: false
      };
      Game.expeditionAI.reset();
      Game.expeditionAI.update(hero, 0.4);
      const playerPriority = {
        targetUntouched: hero.target === null,
        orderPreserved: !!hero.moveOrder && hero.moveOrder.id === 'player:test-order',
        intent: Game.expeditionAI.intent().id
      };
      Game.state.settings.autoBoss = true;
      return {
        resource: {
          gathered,
          materialGain: materialAfter - materialBefore,
          maxNodeDistance,
          bubbleTypes: Array.from(resourceBubbleTypes),
          trace: gatherTrace
        },
        routeEncounter,
        playerPriority
      };
    })()`);
    console.log('v3 auto-action diagnostics:', JSON.stringify(v3AutoActions));
    assert.equal(v3AutoActions.resource.gathered, true);
    assert.ok(v3AutoActions.resource.materialGain > 0);
    assert.ok(v3AutoActions.resource.maxNodeDistance <= 70,
      'auto route diverts to the nearby resource without wandering off: ' + JSON.stringify(v3AutoActions));
    assert.ok(v3AutoActions.resource.trace.some((entry) =>
      entry.to === 'gather' && entry.reason === 'along-route'),
    'resource trace records the along-route gather diversion: ' + JSON.stringify(v3AutoActions));
    assert.ok(v3AutoActions.resource.bubbleTypes.includes('resource') &&
      v3AutoActions.resource.bubbleTypes.includes('gather'),
    'resource discovery and gather action use distinct bubbles: ' + JSON.stringify(v3AutoActions));
    assert.deepEqual(
      [
        v3AutoActions.routeEncounter.acquired,
        v3AutoActions.routeEncounter.moveCleared,
        v3AutoActions.routeEncounter.intent,
        v3AutoActions.routeEncounter.reason
      ],
      [true, true, 'combat', 'route-encounter']
    );
    assert.ok(v3AutoActions.routeEncounter.bubbles.some((bubble) =>
      bubble.entityKind === 'hero' && bubble.type === 'enemy' && bubble.state === 'visible'));
    assert.ok(v3AutoActions.routeEncounter.bubbles.some((bubble) =>
      bubble.entityKind === 'monster' && bubble.type === 'alert' && bubble.state === 'visible'));
    assert.equal(new Set(v3AutoActions.routeEncounter.bubbles.map((bubble) =>
      bubble.anchorId)).size, 2, 'hero and monster bubbles retain independent anchor lanes');
    assert.deepEqual(
      [
        v3AutoActions.playerPriority.targetUntouched,
        v3AutoActions.playerPriority.orderPreserved,
        v3AutoActions.playerPriority.intent
      ],
      [true, true, 'player-order']
    );

    const actionBubbleVisual = await cdp.evaluate(`(() => {
      const canvas = document.getElementById('stage');
      const context = canvas.getContext('2d');
      const hero = Game.world.hero;
      Game.state.settings.effects = false;
      Game.actionBubbles.clear();
      Game.render.frame(0);
      const before = context.getImageData(0, 0, canvas.width, canvas.height).data;
      Game.actionBubbles.show(hero, 'resource', {
        targetId: 'visual-resource',
        duration: 5
      });
      Game.render.frame(0);
      const after = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let pixelDiff = 0;
      for (let i = 0; i < before.length; i += 4) {
        if (before[i] !== after[i] || before[i + 1] !== after[i + 1] ||
            before[i + 2] !== after[i + 2] || before[i + 3] !== after[i + 3]) {
          pixelDiff++;
        }
      }
      return {
        pixelDiff,
        active: Game.actionBubbles.active(),
        locale: Game.i18n.locale()
      };
    })()`);
    assert.ok(actionBubbleVisual.pixelDiff >= 120,
      'action bubble must paint a visible canvas surface: ' + JSON.stringify(actionBubbleVisual));
    assert.equal(actionBubbleVisual.active[0].type, 'resource');
    const actionBubbleCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const actionBubbleScreenshot = path.join(os.tmpdir(), 'firpg-action-bubble-mobile-cdp.png');
    fs.writeFileSync(actionBubbleScreenshot, Buffer.from(actionBubbleCapture.data, 'base64'));

    const enemyBubbleVisual = await cdp.evaluate(`(() => {
      const hero = Game.world.hero;
      const monster = Game.world.entities.find((entity) =>
        entity.kind === 'monster' && !entity.dead);
      if (!monster) throw new Error('enemy bubble visual monster missing');
      monster.x = hero.x + 58;
      monster.y = hero.y + 4;
      Game.exploration.revealAt(monster.x, monster.y, { force: true });
      Game.actionBubbles.clear();
      Game.actionBubbles.show(hero, 'enemy', {
        targetId: 'visual-enemy',
        duration: 5
      });
      Game.actionBubbles.show(monster, 'alert', {
        targetId: 'visual-enemy',
        duration: 5
      });
      Game.render.frame(0);
      return Game.actionBubbles.active();
    })()`);
    assert.ok(enemyBubbleVisual.some((bubble) =>
      bubble.entityKind === 'hero' && bubble.type === 'enemy'));
    assert.ok(enemyBubbleVisual.some((bubble) =>
      bubble.entityKind === 'monster' && bubble.type === 'alert'));
    const enemyBubbleCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const enemyBubbleScreenshot = path.join(os.tmpdir(), 'firpg-action-bubble-enemy-mobile-cdp.png');
    fs.writeFileSync(enemyBubbleScreenshot, Buffer.from(enemyBubbleCapture.data, 'base64'));

    const v3ForestVisual = await cdp.evaluate(`(() => {
      Game.state.world.worldSeed = 0x1098DC78;
      Game.state.world.layoutVersion = 3;
      Game.state.world.region = 'forest';
      Game.state.world.mode = 'battle';
      Game.world.init('forest');
      Game.world.setControlMode('manual');
      const layout = Game.world.layout;
      const hero = Game.world.hero;
      let focus = layout.camp;
      let best = -1;
      for (const center of layout.macro.centers) {
        const projected = Game.terrain.projectPoint(center.x, center.y, 3);
        if (!projected) continue;
        const count = layout.props.filter((prop) =>
          Math.abs(prop.x - projected.x) <= 210 &&
          Math.abs(prop.y - projected.y) <= 230).length;
        if (count > best) {
          best = count;
          focus = projected;
        }
      }
      hero.x = focus.x;
      hero.y = focus.y;
      hero.state = 'idle';
      hero.target = null;
      hero.moveOrder = null;
      for (let oy = -128; oy <= 128; oy += 64) {
        for (let ox = -128; ox <= 128; ox += 64) {
          Game.exploration.revealAt(focus.x + ox, focus.y + oy, { force: true });
        }
      }
      Game.render.snapCamera(focus.x, focus.y);
      const started = performance.now();
      for (let i = 0; i < 18; i++) Game.render.frame(1 / 60);
      const frameMs = (performance.now() - started) / 18;
      const visible = layout.props.filter((prop) =>
        Math.abs(prop.x - focus.x) <= 210 &&
        Math.abs(prop.y - focus.y) <= 230);
      document.querySelectorAll('#modal-root .modal-mask').forEach((modal) => modal.remove());
      return {
        props: layout.props.length,
        visibleProps: visible.length,
        visibleLarge: visible.filter((prop) => prop.large).length,
        blockerProps: visible.filter((prop) => prop.blockerProp).length,
        frameMs
      };
    })()`);
    assert.ok(v3ForestVisual.visibleProps >= 18,
      'v3 forest viewport is densely populated: ' + JSON.stringify(v3ForestVisual));
    assert.ok(v3ForestVisual.visibleLarge >= 6,
      'v3 forest viewport contains several large silhouettes: ' + JSON.stringify(v3ForestVisual));
    assert.ok(v3ForestVisual.blockerProps >= 6,
      'v3 forest blockers have matching visible props: ' + JSON.stringify(v3ForestVisual));
    assert.ok(v3ForestVisual.frameMs < 25,
      'v3 dense forest rendering stays inside frame budget: ' + JSON.stringify(v3ForestVisual));
    await delay(120);
    const v3ForestCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const v3ForestScreenshot = path.join(os.tmpdir(), 'firpg-v1-13-forest-mobile-cdp.png');
    fs.writeFileSync(v3ForestScreenshot, Buffer.from(v3ForestCapture.data, 'base64'));

    await cdp.evaluate(`(() => {
      Game.ui.tabs.open('battle');
      Game.world.setControlMode('manual');
      const hero = Game.world.hero;
      const nav = Game.world.layout.nav;
      let spot = { x: Game.world.layout.camp.x, y: Game.world.layout.camp.y };
      for (let y = 3; y < nav.h - 3; y++) {
        for (let x = 3; x < nav.w - 4; x++) {
          if (nav.distance[y][x] >= 3 && nav.distance[y][x + 1] >= 3) {
            spot = { x: x * nav.cell + nav.cell / 2, y: y * nav.cell + nav.cell / 2 };
            y = nav.h;
            break;
          }
        }
      }
      hero.x = spot.x;
      hero.y = spot.y;
      hero.state = 'idle';
      hero.target = null;
      hero.moveOrder = null;
      return hero.x;
    })()`);
    const keyBefore = await cdp.evaluate('Game.world.hero.x');
    await cdp.evaluate("window.__lastFirpgKey = null; document.addEventListener('keydown', (event) => { window.__lastFirpgKey = { code: event.code, key: event.key, target: event.target && event.target.tagName }; }, { once: true }); true");
    await cdp.send('Page.bringToFront');
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', code: 'KeyD', key: 'd', text: 'd',
      windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68
    });
    await delay(120);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', code: 'KeyD', key: 'd',
      windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68
    });
    const keyCheck = await cdp.evaluate(`({
      before: ${keyBefore},
      after: Game.world.hero.x,
      mode: Game.state.world.mode,
      control: Game.world.controlMode(),
      state: Game.world.hero.state,
      event: window.__lastFirpgKey
    })`);
    assert.ok(keyCheck.after > keyCheck.before, 'WASD moves the hero in manual mode: ' + JSON.stringify(keyCheck));

    const worldChecks = await cdp.evaluate(`(() => {
      const W = Game.world;
      const U = Game.util;
      const v3Probe = {
        version: W.layout.version,
        world: [W.layout.world.w, W.layout.world.h],
        landmarks: W.layout.landmarks.length,
        resources: W.layout.nodes.length,
        curios: W.layout.curios.length,
        ecology: W.layout.ecology.length,
        threats: W.layout.threats.length,
        chunks: W.layout.chunks.length,
        readiness: Game.exploration.readiness(W.region.id).total,
        fog: Game.exploration.coverage(W.region.id)
      };
      // The long-standing movement/interaction block below is the v1/v2
      // compatibility regression. v3 has its own probe and dedicated suite.
      Game.state.world.layoutVersion = 2;
      W.init(Game.state.world.region);
      const hero = W.hero;
      Game.state.player.hp = hero.maxHp;
      W.setControlMode('manual');
      hero.state = 'idle';

      const clickStart = { x: hero.x, y: hero.y };
      W.handleTap(U.clamp(hero.x + 120, 30, W.region.world.w - 30), hero.y);
      const clickHadOrder = !!hero.moveOrder;
      for (let i = 0; i < 20; i++) W.updateHero(hero, 0.1);
      const clickMoved = U.dist(clickStart.x, clickStart.y, hero.x, hero.y);

      // Isolate target acquisition from the higher-priority environment QA that follows.
      // Mature nearby nodes may legitimately start a gather order before selecting a new monster.
      hero.interactOrder = null;
      for (const node of W.layout.nodes || []) Game.state.world.nodeCooldowns[node.id] = 999;
      Game.environment.resetRegion();
      W.setControlMode('auto');
      hero.target = null;
      W.updateHero(hero, 0.1);
      const autoTarget = hero.target;
      const autoAcquired = !!autoTarget;
      if (autoTarget) {
        hero.x = W.layout.camp.x + 18;
        hero.y = W.layout.camp.y + 18;
        autoTarget.x = W.layout.bossPoint.x - 70;
        autoTarget.y = W.layout.bossPoint.y;
        hero.navRoute = null;
        W.updateHero(hero, 0.1);
      }
      const firstRoute = hero.navRoute;
      if (autoTarget) autoTarget.x += 40;
      if (autoTarget) W.updateHero(hero, 0.1);
      const movingTargetRepathed = !autoTarget || hero.navRoute !== firstRoute;
      if (autoTarget) {
        autoTarget.navRoute = null;
        W.updateMonster(autoTarget, 0.1);
      }
      const monsterInterceptPath = !autoTarget || !!autoTarget.navRoute;
      if (autoTarget) {
        hero.target = null;
        autoTarget.navRoute = null;
        autoTarget.wx = U.clamp(autoTarget.x + 60, 30, W.region.world.w - 30);
        autoTarget.wy = autoTarget.y;
        autoTarget.wanderT = 1;
        autoTarget.wanderKey = 99;
        W.wanderTick(autoTarget, 0.1, 26, autoTarget.spawnX, autoTarget.spawnY, 64);
      }
      const monsterWanderPath = !autoTarget || !!autoTarget.navRoute;

      W.setControlMode('manual');
      W.bossEnt = null;
      W.cinematic = null;
      Game.state.world.mode = 'battle';
      hero.state = 'idle';
      hero.navRoute = null;
      hero.x = W.layout.camp.x + 150;
      hero.y = W.layout.camp.y;
      const nearCampAction = W.campActionState();
      Game.ui.hud.update(true);
      const campButton = document.getElementById('btn-camp');
      const campIcon = document.getElementById('camp-action-icon');
      const nearButtonText = document.getElementById('camp-action-label').textContent;
      const campIconPixels = campIcon.getContext('2d').getImageData(0, 0, campIcon.width, campIcon.height).data;
      let campIconVisiblePixels = 0;
      for (let i = 3; i < campIconPixels.length; i += 4) {
        if (campIconPixels[i] > 0) campIconVisiblePixels++;
      }
      const campButtonEmojiFree = !/[\u{1F000}-\u{1FAFF}]/u.test(nearButtonText);
      W.setMode('rest');
      for (let i = 0; i < 300; i++) W.updateHero(hero, 0.1);
      const nearCampSitting = hero.state === 'sitting';
      const nearCampState = hero.state;
      const nearCampDistance = U.dist(hero.x, hero.y, W.layout.camp.x + 22, W.layout.camp.y + 22);
      const sittingCampAction = W.campActionState();

      W.setMode('battle');
      hero.state = 'idle';
      hero.navRoute = null;
      hero.x = W.region.world.w - 30;
      hero.y = W.region.world.h - 35;
      const farCampAction = W.campActionState();
      W.setMode('rest');
      const farWarpStarted = hero.state === 'warpOut';
      const warpCampAction = W.campActionState();
      W.updateHero(hero, 0.4);
      W.updateHero(hero, 0.45);
      for (let i = 0; i < 180; i++) W.updateHero(hero, 0.1);
      const farCampSitting = hero.state === 'sitting';

      W.setMode('battle');
      hero.state = 'idle';
      Game.state.player.hp = hero.maxHp;
      W.onHeroDeath();
      Game.transitions.update(1.95);
      const deathAtCamp = hero.state === 'recover' &&
        U.dist(hero.x, hero.y, W.layout.camp.x + 26, W.layout.camp.y + 24) < 0.01;
      Game.transitions.settleBeforeSave();
      W.setMode('battle');

      hero.state = 'idle';
      Game.state.player.hp = hero.maxHp * Game.state.settings.potionThreshold * 0.5;
      Game.ui.hud.update(true);
      const lowHpCampFlashes = campButton.classList.contains('low-hp');
      const prog = Game.State.regionProg(W.region.id);
      const bossButton = document.getElementById('btn-boss-hunt');
      const bossSwitch = document.getElementById('auto-boss-switch');
      const bossIcon = document.getElementById('boss-hunt-icon');
      const autoBossDefault = Game.state.settings.autoBoss === true;
      Game.state.settings.autoBoss = false;
      prog.kills = W.region.killTarget;
      Game.state.player.hp = hero.maxHp * 0.3;
      Game.ui.hud.update(true);
      const autoBossSuppressed = W.trySpawnBoss() === false && !W.bossEnt;
      const bossButtonReady = !bossButton.disabled && bossButton.classList.contains('ready');
      const bossSwitchOff = bossSwitch.getAttribute('aria-checked') === 'false';
      const stageRect = document.getElementById('stage-wrap').getBoundingClientRect();
      const gaugeRect = document.getElementById('hunt-gauge').getBoundingClientRect();
      const actionRect = document.getElementById('hunt-actions').getBoundingClientRect();
      const buttonRect = bossButton.getBoundingClientRect();
      const switchRect = bossSwitch.getBoundingClientRect();
      const bossControlsCompact = actionRect.width <= gaugeRect.width + 0.5 &&
        actionRect.right <= stageRect.right + 0.5 &&
        buttonRect.height >= 44 && switchRect.height >= 44;
      const bossIconPixels = bossIcon.getContext('2d').getImageData(0, 0, bossIcon.width, bossIcon.height).data;
      let bossIconVisiblePixels = 0;
      for (let i = 3; i < bossIconPixels.length; i += 4) {
        if (bossIconPixels[i] > 0) bossIconVisiblePixels++;
      }
      bossButton.click();
      const bossAtLandmark = !!W.bossEnt &&
        U.dist(W.bossEnt.x, W.bossEnt.y, W.layout.bossPoint.x, W.layout.bossPoint.y) < 0.01;
      const manualBossLowHp = bossAtLandmark;
      Game.state.player.hp = hero.maxHp;
      Game.ui.hud.update(true);
      const bossCampAction = W.campActionState();
      const bossCampEnabled = !campButton.disabled;
      let bossFailurePayload = null;
      Game.bus.once('boss:failed', (payload) => { bossFailurePayload = payload; });
      W.setMode('rest');
      const bossRetreatSafe = Game.state.world.mode === 'rest' && !W.bossEnt && !W.cinematic &&
        !hero.target && prog.kills === Math.ceil(W.region.killTarget / 2);
      const bossRetreatReason = bossFailurePayload && bossFailurePayload.reason;
      W.setMode('battle');
      Game.state.settings.autoBoss = true;

      const beforeLargeDt = { x: hero.x, y: hero.y };
      W.moveVector(hero, 1, 0, 56, 8);
      const largeDtStep = U.dist(beforeLargeDt.x, beforeLargeDt.y, hero.x, hero.y);

      const current = W.region.id;
      const order = Game.State.regionOrder();
      const currentIndex = order.indexOf(current);
      const next = order[(currentIndex + 1) % order.length];
      Game.state.world.region = next;
      W.init(next);
      const regionSwitchUsesLayout = W.layout.worldSeed === Game.state.world.worldSeed &&
        W.hero.x === W.layout.camp.x + 30 && W.hero.y === W.layout.camp.y + 26;

      return {
        v3Probe, clickHadOrder, clickMoved, autoAcquired, movingTargetRepathed, monsterInterceptPath, monsterWanderPath,
        nearCampAction: nearCampAction.id, nearButtonText, campIconVisiblePixels, campButtonEmojiFree,
        nearCampSitting, nearCampState, nearCampDistance, sittingCampAction: sittingCampAction.id,
        farCampAction: farCampAction.id, farWarpStarted, warpCampAction: warpCampAction.id, farCampSitting,
        deathAtCamp, lowHpCampFlashes, autoBossDefault, autoBossSuppressed, bossButtonReady,
        bossSwitchOff, bossControlsCompact, bossIconVisiblePixels, manualBossLowHp,
        bossAtLandmark, bossCampAction: bossCampAction.id,
        bossCampEnabled, bossRetreatSafe, bossRetreatReason, largeDtStep, regionSwitchUsesLayout
      };
    })()`);
    assert.equal(worldChecks.v3Probe.version, 3);
    assert.deepEqual(worldChecks.v3Probe.world, [2400, 1440]);
    assert.equal(worldChecks.v3Probe.landmarks, 4);
    assert.ok(worldChecks.v3Probe.resources >= 16 && worldChecks.v3Probe.resources <= 22);
    assert.equal(worldChecks.v3Probe.curios, 3);
    assert.equal(worldChecks.v3Probe.ecology, 2);
    assert.ok(worldChecks.v3Probe.threats >= 6 && worldChecks.v3Probe.threats <= 9);
    assert.equal(worldChecks.v3Probe.chunks, 15);
    assert.equal(worldChecks.clickHadOrder, true);
    assert.ok(worldChecks.clickMoved > 5, 'click movement follows a path');
    assert.equal(worldChecks.autoAcquired, true);
    assert.equal(worldChecks.movingTargetRepathed, true);
    assert.equal(worldChecks.monsterInterceptPath, true);
    assert.equal(worldChecks.monsterWanderPath, true);
    assert.equal(worldChecks.nearCampAction, 'return');
    assert.equal(worldChecks.nearButtonText, await cdp.evaluate("Game.i18n.t('ui.camp')"));
    assert.ok(worldChecks.campIconVisiblePixels > 10, 'camp action uses a rendered pixel icon');
    assert.equal(worldChecks.campButtonEmojiFree, true, 'camp action label contains no emoji');
    assert.equal(worldChecks.nearCampSitting, true, 'near camp: ' + JSON.stringify(worldChecks));
    assert.equal(worldChecks.sittingCampAction, 'break-camp');
    assert.equal(worldChecks.farCampAction, 'teleport');
    assert.equal(worldChecks.farWarpStarted, true);
    assert.equal(worldChecks.warpCampAction, 'cancel-warp');
    assert.equal(worldChecks.farCampSitting, true);
    assert.equal(worldChecks.deathAtCamp, true);
    assert.equal(worldChecks.lowHpCampFlashes, true);
    assert.equal(worldChecks.autoBossDefault, true);
    assert.equal(worldChecks.autoBossSuppressed, true);
    assert.equal(worldChecks.bossButtonReady, true);
    assert.equal(worldChecks.bossSwitchOff, true);
    assert.equal(worldChecks.bossControlsCompact, true);
    assert.ok(worldChecks.bossIconVisiblePixels > 10, 'boss hunt uses a rendered pixel icon');
    assert.equal(worldChecks.manualBossLowHp, true, 'manual boss challenge bypasses the automatic HP guard');
    assert.equal(worldChecks.bossAtLandmark, true);
    assert.equal(worldChecks.bossCampAction, 'boss-retreat');
    assert.equal(worldChecks.bossCampEnabled, true);
    assert.equal(worldChecks.bossRetreatSafe, true);
    assert.equal(worldChecks.bossRetreatReason, 'retreat');
    assert.ok(worldChecks.largeDtStep <= 14.01, 'large dt movement is capped');
    assert.equal(worldChecks.regionSwitchUsesLayout, true);

    const v111Checks = await cdp.evaluate(`(() => {
      const W = Game.world;
      const U = Game.util;
      const hero = W.hero;
      Game.entryState = 'active';
      if (Game.transitions.isActive()) Game.transitions.settleBeforeSave();
      Game.state.world.mode = 'battle';
      Game.state.settings.groundLoot = true;
      Game.state.settings.autoCampRest = false;
      W.setControlMode('manual');
      hero.state = 'idle';
      hero.target = null;
      hero.moveOrder = null;
      hero.interactOrder = null;
      W.bossEnt = null;
      W.cinematic = null;
      for (const ent of W.entities) {
        if (ent.kind === 'monster') {
          ent.x = W.region.world.w - 40;
          ent.y = W.region.world.h - 30;
          ent.engaged = false;
        }
      }

      // Proximity and click pickup paths plus switch-off reclamation.
      const potBeforePickup = Game.inv.potionCount('potion_small');
      W.spawnGroundLoot({ category: 'potion', id: 'potion_small', count: 1 }, hero.x, hero.y, { source: 'combat' });
      const proxLoot = W.groundLoot[0];
      hero.x = proxLoot.x;
      hero.y = proxLoot.y;
      W.updateHero(hero, 0.1);
      const proximityPicked = W.groundLoot.length === 0 &&
        Game.inv.potionCount('potion_small') === potBeforePickup + 1;

      W.spawnGroundLoot({ category: 'potion', id: 'potion_small', count: 1 }, hero.x + 70, hero.y, { source: 'combat' });
      const clickLoot = W.groundLoot[0];
      W.handleTap(clickLoot.x, clickLoot.y);
      const clickPickupOrdered = hero.interactOrder && hero.interactOrder.type === 'loot';
      for (let i = 0; i < 30 && W.groundLoot.length; i++) W.updateHero(hero, 0.1);
      const clickPicked = W.groundLoot.length === 0;

      W.spawnGroundLoot({ category: 'potion', id: 'potion_large', count: 1 }, hero.x + 40, hero.y, { source: 'combat' });
      Game.state.settings.groundLoot = false;
      Game.bus.emit('settings:changed', { key: 'groundLoot', value: false });
      const switchReclaimed = W.groundLoot.length === 0;
      Game.state.settings.groundLoot = true;

      // Gather completion and combat interruption.
      const node = W.layout.nodes[0];
      const gatherBefore = Game.inv.materialCount(node.material);
      Game.state.world.nodeCooldowns[node.id] = 0;
      hero.x = node.x; hero.y = node.y; hero.state = 'idle';
      W.startInteraction({ type: 'gather', target: node }, true);
      for (let i = 0; i < 14; i++) W.updateHero(hero, 0.1);
      const gatherCompleted = Game.inv.materialCount(node.material) > gatherBefore &&
        Game.state.world.nodeCooldowns[node.id] > 0;

      let gatherInterruptedEvent = false;
      Game.bus.once('gather:interrupted', () => { gatherInterruptedEvent = true; });
      Game.state.world.nodeCooldowns[node.id] = 0;
      W.startInteraction({ type: 'gather', target: node }, true);
      W.updateHero(hero, 0);
      const threat = W.entities.find((ent) => ent.kind === 'monster' && !ent.dead);
      if (threat) {
        threat.x = hero.x + 5;
        threat.y = hero.y;
        threat.engaged = true;
      }
      W.updateHero(hero, 0.1);
      const gatherInterrupted = gatherInterruptedEvent && !hero.interactOrder;
      if (threat) {
        threat.x = W.region.world.w - 40;
        threat.y = W.region.world.h - 30;
        threat.engaged = false;
      }
      hero.target = null;

      // Chest opening animation and reward.
      Game.environment.resetRegion();
      const candidate = W.layout.spawnCandidates.find((p) => Game.environment.isLegalChestSpot(p.x, p.y));
      if (candidate) { hero.x = candidate.x - 80; hero.y = candidate.y; }
      let chest = Game.environment.spawnChest();
      if (!chest) {
        chest = { kind: 'chest', id: 'smoke-chest', x: hero.x + 20, y: hero.y, rare: false, age: 0, ttl: 90, phase: 0 };
        Game.environment.chests().push(chest);
      }
      hero.x = chest.x; hero.y = chest.y; hero.state = 'idle';
      const chestsBefore = Game.state.meta.stats.chests;
      W.startInteraction({ type: 'chest', target: chest }, true);
      for (let i = 0; i < 10; i++) W.updateHero(hero, 0.1);
      const chestOpened = Game.state.meta.stats.chests === chestsBefore + 1 &&
        Game.environment.chests().indexOf(chest) < 0;

      // World trade entity approach, HUD entry, unified panel and leave/re-enter lock.
      const area = Game.trade.areas()[0];
      hero.x = area.x + area.radius + 34;
      hero.y = area.y;
      hero.state = 'idle';
      hero.target = null;
      W.handleTap(area.x, area.y);
      const tradeApproachOrdered = hero.interactOrder && hero.interactOrder.type === 'trade';
      for (let i = 0; i < 80 && hero.interactOrder; i++) W.updateHero(hero, 0.1);
      hero.x = area.x; hero.y = area.y;
      Game.trade.update();
      Game.ui.hud.update(true);
      const tradeHudVisible = !document.getElementById('btn-trade').classList.contains('hidden');
      Game.ui.trade.open(area.id);
      const unifiedTradeOpen = Game.ui.tabs.current() === 'trade' &&
        !!document.querySelector('.trade-panel-head');
      W.setControlMode('auto');
      const pauseOrigin = { x: hero.x, y: hero.y };
      hero.moveOrder = {
        x: area.x + Math.min(24, area.radius * 0.5),
        y: area.y,
        id: 'smoke:auto-trade-drift',
        ai: true
      };
      W.updateHero(hero, 0.25);
      const tradePauseActive = Game.interactions.isPaused('autoExplore');
      const tradeAutoMovePaused = Math.hypot(
        hero.x - pauseOrigin.x,
        hero.y - pauseOrigin.y
      ) < 0.01 && !hero.moveOrder &&
        Game.expeditionAI.intent().id === 'interaction';
      const tradePauseDiagnostics = {
        delta: Math.hypot(hero.x - pauseOrigin.x, hero.y - pauseOrigin.y),
        moveOrder: hero.moveOrder,
        encounterId: hero.encounterId || null,
        intent: Game.expeditionAI.intent()
      };
      Game.ui.tabs.open('inv');
      Game.trade.update();
      const tradePauseReleasedOnTab = !Game.interactions.isPaused('autoExplore') &&
        !Game.ui.trade.isOpen();
      W.setControlMode('manual');
      Game.ui.trade.open(area.id);
      const exchangeTab = [...document.querySelectorAll('.trade-section-tabs .subtab')]
        .find((el) => el.textContent.trim() === Game.i18n.t('shopSec.exchange'));
      exchangeTab?.click();
      const exchangeOffersVisible = document.querySelectorAll('.trade-offer').length > 0;
      hero.x = area.x + area.radius + 20;
      Game.trade.update();
      Game.ui.tabs.rerender();
      const tradeLockedOnLeave = !!document.querySelector('.trade-lock-banner') &&
        [...document.querySelectorAll('.trade-offer .buy-btn')].every((btn) => btn.disabled);
      hero.x = area.x; hero.y = area.y;
      Game.trade.update();
      Game.ui.tabs.rerender();
      const tradeUnlockedOnReturn = !document.querySelector('.trade-lock-banner');
      Game.ui.trade.close();
      const tradePauseReleasedOnClose = !Game.interactions.isPaused('autoExplore');

      // 移动行商第一层 actorActions 有限暂停：真实暂停行为 + 自动模式不漂移。
      if (Game.merchants && Game.merchants.activeEvent()) {
        Game.merchants.finishEvent('smoke-merchant-prep');
      }
      hero.state = 'idle'; hero.target = null; hero.moveOrder = null;
      hero.interactOrder = null; hero.encounterId = null;
      Game.state.world.mode = 'battle';
      const merchantDiscover = Game.merchants.debugForceDiscover();
      let merchantActionsPauseActive = false;
      let merchantActionsLeaseId = null;
      let merchantActionsAutoMovePaused = false;
      let merchantActionsReleased = false;
      if (merchantDiscover && merchantDiscover.ok && merchantDiscover.actor) {
        const merchantActor = merchantDiscover.actor;
        const merchantApi = Game.ui.modals.actorActions(
          merchantActor, Game.interactions.handlers(merchantActor)
        );
        merchantActionsPauseActive = Game.interactions.isPaused('autoExplore');
        const lease = Game.interactions.pauseSnapshot()
          .find((l) => l.id === 'ui:merchant-actions');
        merchantActionsLeaseId = lease && lease.id || null;
        W.setControlMode('auto');
        const mOrigin = { x: hero.x, y: hero.y };
        hero.moveOrder = {
          x: merchantActor.x, y: merchantActor.y,
          id: 'smoke:auto-merchant-drift', ai: true
        };
        W.updateHero(hero, 0.25);
        merchantActionsAutoMovePaused = Math.hypot(
          hero.x - mOrigin.x, hero.y - mOrigin.y
        ) < 0.01 && !hero.moveOrder &&
          Game.expeditionAI.intent().id === 'interaction';
        W.setControlMode('manual');
        if (merchantApi) merchantApi.close();
        merchantActionsReleased = !Game.interactions.isPaused('autoExplore');
        if (Game.merchants.activeEvent()) Game.merchants.finishEvent('smoke-merchant-done');
      }
      hero.state = 'idle'; hero.target = null; hero.moveOrder = null;
      hero.interactOrder = null; hero.encounterId = null;
      const merchantDialoguePauseContract = /ui:merchant-dialogue/.test(
        Game.ui.modals.merchantDialogue.toString()
      ) && /ui:merchant-actions/.test(Game.ui.modals.actorActions.toString()) &&
        typeof Game.ui.modals.updateInteractionPauses === 'function' &&
        typeof Game.interactions.maintainHandoffs === 'function' &&
        merchantActionsPauseActive && merchantActionsLeaseId === 'ui:merchant-actions' &&
        merchantActionsAutoMovePaused && merchantActionsReleased;
      const merchantActionsDiagnostics = {
        discovered: !!(merchantDiscover && merchantDiscover.ok),
        pauseActive: merchantActionsPauseActive,
        leaseId: merchantActionsLeaseId,
        autoMovePaused: merchantActionsAutoMovePaused,
        released: merchantActionsReleased
      };

      // Material exchange domain engine path.
      Game.state.inv.materials.herb = Math.max(3, Game.inv.materialCount('herb'));
      Game.state.inv.materials.berry = Math.max(2, Game.inv.materialCount('berry'));
      hero.x = area.x; hero.y = area.y;
      const exchangeResult = Game.shop.buy('exchange_potion');
      hero.x = area.x + area.radius + 30;
      const exchangeBlockedOutside = Game.shop.buy('exchange_potion').reason === 'outside';

      // Manual potion card, HUD quick-use and shared cooldown refusal.
      Game.state.inv.potions.potion_small = Math.max(2, Game.inv.potionCount('potion_small'));
      hero.itemCd.potion = 0;
      hero.potionCd = 0;
      Game.state.player.hp = hero.maxHp * 0.35;
      Game.ui.hud.update(true);
      const quickButton = document.getElementById('btn-potion');
      const quickBefore = Game.inv.potionCount('potion_small');
      quickButton.click();
      const quickAfter = Game.inv.potionCount('potion_small');
      quickButton.click();
      const cooldownShared = quickAfter === quickBefore - 1 &&
        Game.inv.potionCount('potion_small') === quickAfter &&
        Game.items.cdLeft('potion') > 0;
      Game.items.update(Game.F.BAL.potionCd);
      Game.ui.tabs.open('inv');
      const potionCards = document.querySelectorAll('.item-use-card');
      const potionCardsTouchable = [...potionCards].every((el) => el.getBoundingClientRect().height >= 44);
      Game.ui.tabs.open('battle', true);

      // Auto-camp full cycle and manual suppression.
      hero.itemCd.potion = 0;
      Game.state.settings.autoCampRest = true;
      W.setControlMode('auto');
      Game.state.world.mode = 'battle';
      Game.state.world.restBuffT = 0;
      Game.State.regionProg(W.region.id).kills = 0;
      hero.state = 'idle'; hero.target = null; hero.moveOrder = null; hero.interactOrder = null;
      hero.x = W.layout.camp.x + 140; hero.y = W.layout.camp.y;
      W.autoCampSuppressedUntil = 0;
      W.updateAutoCamp(hero);
      const autoCampStarted = Game.state.world.mode === 'rest' && W.autoCampCycle;
      hero.state = 'sitting';
      Game.state.world.restBuffT = Game.F.BAL.restBuffCap;
      W.updateAutoCamp(hero);
      const autoCampResumed = Game.state.world.mode === 'battle' && !W.autoCampCycle;
      Game.state.world.restBuffT = 0;
      W.updateAutoCamp(hero);
      W.setMode('battle');
      const autoCampSuppressed = W.autoCampSuppressedUntil >= Game.state.world.worldTime + 119;
      Game.state.settings.autoCampRest = false;

      // 390×844 bilingual fit, 44px targets, and reduced-effects static logic.
      const targets = ['btn-camp', 'btn-potion', 'btn-trade', 'control-switch']
        .map((id) => document.getElementById(id))
        .filter((el) => el && !el.classList.contains('hidden'));
      const targetsTouchable = targets.every((el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44;
      });
      Game.i18n.setLocale('en');
      Game.ui.hud.update(true);
      const enNoOverflow = document.documentElement.scrollWidth <= window.innerWidth &&
        targets.every((el) => el.scrollWidth <= el.clientWidth + 1);
      Game.i18n.setLocale('zh-CN');
      Game.state.settings.effects = false;
      W.spawnGroundLoot({ category: 'potion', id: 'potion_small', count: 1 }, hero.x, hero.y, { source: 'combat' });
      Game.render.frame(0.016);
      const reducedKeepsLoot = W.groundLoot.length === 1;
      W.flushGroundLoot('smoke');
      Game.state.settings.effects = true;

      return {
        proximityPicked, clickPickupOrdered, clickPicked, switchReclaimed,
        gatherCompleted, gatherInterrupted, chestOpened,
        tradeApproachOrdered, tradeHudVisible, unifiedTradeOpen,
        tradePauseActive, tradeAutoMovePaused, tradePauseDiagnostics, tradePauseReleasedOnTab,
        exchangeOffersVisible, tradeLockedOnLeave, tradeUnlockedOnReturn,
        tradePauseReleasedOnClose,
        merchantDialoguePauseContract, merchantActionsDiagnostics,
        exchangeOk: exchangeResult.ok, exchangeBlockedOutside,
        potionCardCount: potionCards.length, potionCardsTouchable, cooldownShared,
        autoCampStarted, autoCampResumed, autoCampSuppressed,
        targetsTouchable, enNoOverflow, reducedKeepsLoot,
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth
      };
    })()`);
    assert.equal(v111Checks.proximityPicked, true);
    assert.equal(v111Checks.clickPickupOrdered, true);
    assert.equal(v111Checks.clickPicked, true);
    assert.equal(v111Checks.switchReclaimed, true);
    assert.equal(v111Checks.gatherCompleted, true);
    assert.equal(v111Checks.gatherInterrupted, true);
    assert.equal(v111Checks.chestOpened, true);
    assert.equal(v111Checks.tradeApproachOrdered, true);
    assert.equal(v111Checks.tradeHudVisible, true);
    assert.equal(v111Checks.unifiedTradeOpen, true);
    assert.equal(v111Checks.tradePauseActive, true);
    if (!v111Checks.tradeAutoMovePaused) {
      console.error('trade pause diagnostics:', JSON.stringify(v111Checks.tradePauseDiagnostics));
    }
    assert.equal(v111Checks.tradeAutoMovePaused, true);
    assert.equal(v111Checks.tradePauseReleasedOnTab, true);
    assert.equal(v111Checks.exchangeOffersVisible, true);
    assert.equal(v111Checks.tradeLockedOnLeave, true);
    assert.equal(v111Checks.tradeUnlockedOnReturn, true);
    assert.equal(v111Checks.tradePauseReleasedOnClose, true);
    if (!v111Checks.merchantDialoguePauseContract) {
      console.error('merchant actions pause diagnostics:', JSON.stringify(v111Checks.merchantActionsDiagnostics));
    }
    assert.equal(v111Checks.merchantDialoguePauseContract, true);
    assert.equal(v111Checks.exchangeOk, true);
    assert.equal(v111Checks.exchangeBlockedOutside, true);
    assert.equal(v111Checks.potionCardCount, 2);
    assert.equal(v111Checks.potionCardsTouchable, true);
    assert.equal(v111Checks.cooldownShared, true);
    assert.equal(v111Checks.autoCampStarted, true);
    assert.equal(v111Checks.autoCampResumed, true);
    assert.equal(v111Checks.autoCampSuppressed, true);
    assert.equal(v111Checks.targetsTouchable, true);
    assert.equal(v111Checks.enNoOverflow, true);
    assert.equal(v111Checks.reducedKeepsLoot, true);
    assert.equal(v111Checks.noHorizontalOverflow, true);

    const v111Capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const v111Screenshot = path.join(os.tmpdir(), 'firpg-v1-11-mobile-cdp.png');
    fs.writeFileSync(v111Screenshot, Buffer.from(v111Capture.data, 'base64'));

    const campStateScreenshots = [];
    for (const campState of ['return', 'teleport', 'low-hp', 'boss-retreat', 'break-camp']) {
      const metrics = await cdp.evaluate(`(() => {
        const W = Game.world;
        const hero = W.hero;
        Game.ui.tabs.open('battle');
        W.setControlMode('manual');
        Game.state.world.mode = 'battle';
        if (W.bossEnt) {
          const bossIndex = W.entities.indexOf(W.bossEnt);
          if (bossIndex >= 0) W.entities.splice(bossIndex, 1);
        }
        W.bossEnt = null;
        W.cinematic = null;
        hero.state = 'idle';
        hero.target = null;
        hero.moveOrder = null;
        hero.campWarp = null;
        const state = ${JSON.stringify(campState)};
        hero.potionCd = state === 'low-hp' ? 999 : 0;
        Game.nav.clear(hero);
        const progress = Game.State.regionProg(W.region.id);
        progress.kills = 0;
        Game.state.player.hp = hero.maxHp;

        if (state === 'return') {
          hero.x = W.layout.camp.x + 120;
          hero.y = W.layout.camp.y;
        } else {
          hero.x = W.region.world.w - 34;
          hero.y = W.region.world.h - 38;
        }
        if (state === 'low-hp') {
          Game.state.player.hp = hero.maxHp * Game.state.settings.potionThreshold * 0.45;
        }
        if (state === 'boss-retreat') {
          progress.kills = W.region.killTarget;
          W.trySpawnBoss();
        }
        if (state === 'break-camp') {
          Game.state.world.mode = 'rest';
          hero.x = W.layout.camp.x + 22;
          hero.y = W.layout.camp.y + 22;
          hero.state = 'sitting';
        }
        const toastRoot = document.getElementById('toasts');
        if (toastRoot) toastRoot.replaceChildren();
        document.querySelectorAll('#stage-wrap > div').forEach((el) => {
          if (el.style.zIndex === '16') el.style.opacity = '0';
        });
        Game.ui.hud.update(true);
        Game.render.snapCamera(hero.x, hero.y);
        Game.render.frame(1 / 60);
        const button = document.getElementById('btn-camp');
        const control = document.getElementById('control-switch');
        const br = button.getBoundingClientRect();
        const cr = control.getBoundingClientRect();
        return {
          state,
          action: button.dataset.action,
          label: document.getElementById('camp-action-label').textContent,
          lowHp: button.classList.contains('low-hp'),
          noOverlap: br.left >= cr.right || br.bottom <= cr.top || cr.bottom <= br.top,
          withinViewport: br.left >= 0 && br.right <= innerWidth && br.top >= 0 && br.bottom <= innerHeight
        };
      })()`);
      assert.equal(metrics.action, campState === 'low-hp' ? 'teleport' : campState);
      assert.equal(metrics.lowHp, campState === 'low-hp');
      assert.equal(metrics.noOverlap, true, campState + ' camp button does not overlap control switch');
      assert.equal(metrics.withinViewport, true, campState + ' camp button stays in viewport');
      await delay(80);
      const stateCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const stateScreenshot = path.join(os.tmpdir(), 'firpg-camp-' + campState + '-mobile-cdp.png');
      fs.writeFileSync(stateScreenshot, Buffer.from(stateCapture.data, 'base64'));
      campStateScreenshots.push({ ...metrics, screenshot: stateScreenshot });
    }

    const englishCampFit = await cdp.evaluate(`(() => {
      const previous = Game.i18n.locale();
      Game.i18n.setLocale('en');
      Game.state.world.mode = 'battle';
      const W = Game.world;
      const hero = W.hero;
      hero.x = W.region.world.w - 34;
      hero.y = W.region.world.h - 38;
      hero.state = 'idle';
      Game.ui.hud.update(true);
      const label = document.getElementById('camp-action-label');
      const labels = ['ui.camp', 'ui.teleportCamp', 'ui.bossCampReturn', 'ui.cancelCampWarp', 'ui.cancelCampReturn', 'ui.breakCamp'];
      const labelFits = labels.map((key) => {
        label.textContent = Game.i18n.t(key);
        return { key, text: label.textContent, fits: label.scrollWidth <= label.clientWidth };
      });
      const result = {
        labels: labelFits,
        fits: labelFits.every((item) => item.fits),
        buttonFits: document.getElementById('btn-camp').scrollWidth <= document.getElementById('btn-camp').clientWidth
      };
      Game.i18n.setLocale(previous);
      return result;
    })()`);
    assert.equal(englishCampFit.fits, true, 'English camp label fits its allocated width');
    assert.equal(englishCampFit.buttonFits, true, 'English camp button has no internal overflow');

    const transitionScreenshots = [];
    const transitionCountdown = await cdp.evaluate(`(() => {
      if (Game.transitions.isActive()) Game.transitions.settleBeforeSave();
      Game.i18n.setLocale('zh-CN');
      Game.ui.tabs.open('battle', true);
      const order = Game.State.regionOrder();
      const firstRid = order[0];
      const nextRid = order[1];
      Game.state.world.region = firstRid;
      Game.world.init(firstRid);
      Game.state.meta.stats.highestRegion = 1;
      Game.State.regionProg(firstRid).cleared = true;
      Game.state.settings.autoAdvance = true;
      Game.world.setControlMode('auto');
      Game.state.world.mode = 'battle';
      Game.world.hero.state = 'idle';
      document.getElementById('toasts').replaceChildren();

      const started = Game.prog.requestRegion(nextRid, {
        source: 'auto',
        boss: { first: true, tier: 1 }
      });
      const duplicateRejected = !Game.prog.requestRegion(nextRid, { source: 'auto' });
      const root = document.getElementById('transition-root');
      const card = root.querySelector('.transition-card');
      const rr = root.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      const buttons = Array.from(root.querySelectorAll('.transition-actions .btn')).map((button) => {
        const r = button.getBoundingClientRect();
        return { text: button.textContent, height: r.height, fits: button.scrollWidth <= button.clientWidth };
      });
      const hero = Game.world.hero;
      hero.moveOrder = null;
      Game.world.handleTap(hero.x + 80, hero.y);
      const inputBlocked = !hero.moveOrder;
      const tabBlocked = Game.ui.tabs.open('map') === false &&
        document.querySelector('#tabbar .tab-btn[data-tab="battle"]').classList.contains('active');
      const controlsLocked = document.getElementById('control-switch').disabled &&
        document.getElementById('btn-camp').disabled &&
        Array.from(document.querySelectorAll('#tabbar .tab-btn')).every((button) => button.disabled);

      Game.i18n.setLocale('en');
      const englishFits = Array.from(root.querySelectorAll('.transition-actions .btn')).every(
        (button) => button.scrollWidth <= button.clientWidth
      ) && card.scrollWidth <= card.clientWidth;
      Game.i18n.setLocale('zh-CN');
      return {
        started,
        duplicateRejected,
        firstRid,
        nextRid,
        region: Game.state.world.region,
        phase: Game.transitions.snapshot().phase,
        title: root.querySelector('.transition-title').textContent,
        buttons,
        inputBlocked,
        tabBlocked,
        blocksWorld: Game.transitions.blocksWorld(),
        heroX: hero.x,
        controlsLocked,
        englishFits,
        cardWithinStage: cr.left >= rr.left && cr.right <= rr.right && cr.top >= rr.top && cr.bottom <= rr.bottom,
        noToast: !document.getElementById('toasts').textContent.trim(),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(transitionCountdown.started, true);
    assert.equal(transitionCountdown.duplicateRejected, true);
    assert.equal(transitionCountdown.region, transitionCountdown.firstRid);
    assert.equal(transitionCountdown.phase, 'countdown');
    assert.equal(transitionCountdown.inputBlocked, true);
    assert.equal(transitionCountdown.tabBlocked, true);
    assert.equal(transitionCountdown.blocksWorld, true);
    assert.equal(transitionCountdown.controlsLocked, true);
    assert.equal(transitionCountdown.englishFits, true);
    assert.equal(transitionCountdown.cardWithinStage, true);
    assert.equal(transitionCountdown.noToast, true);
    assert.equal(transitionCountdown.noHorizontalOverflow, true);
    assert.ok(transitionCountdown.buttons.every((button) => button.height >= 44 && button.fits));
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', code: 'KeyD', key: 'd', text: 'd',
      windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68
    });
    await delay(60);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', code: 'KeyD', key: 'd',
      windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68
    });
    const transitionKeyboardBlocked = await cdp.evaluate(
      `Math.abs(Game.world.hero.x - ${JSON.stringify(transitionCountdown.heroX)}) < .001`
    );
    assert.equal(transitionKeyboardBlocked, true, 'WASD is blocked during travel');
    const countdownCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const countdownScreenshot = path.join(os.tmpdir(), 'firpg-transition-countdown-mobile-cdp.png');
    fs.writeFileSync(countdownScreenshot, Buffer.from(countdownCapture.data, 'base64'));
    transitionScreenshots.push(countdownScreenshot);

    const transitionCancelled = await cdp.evaluate(`(() => {
      document.querySelector('.travel-stay').click();
      return {
        active: Game.transitions.isActive(),
        region: Game.state.world.region,
        autoAdvance: Game.state.settings.autoAdvance,
        hidden: document.getElementById('transition-root').classList.contains('hidden'),
        controlsUnlocked: !document.getElementById('control-switch').disabled &&
          !document.getElementById('btn-camp').disabled
      };
    })()`);
    assert.equal(transitionCancelled.active, false);
    assert.equal(transitionCancelled.region, transitionCountdown.firstRid);
    assert.equal(transitionCancelled.autoAdvance, true);
    assert.equal(transitionCancelled.hidden, true);
    assert.equal(transitionCancelled.controlsUnlocked, true);

    const transitionSwap = await cdp.evaluate(`(() => {
      Game.prog.requestRegion(${JSON.stringify(transitionCountdown.nextRid)}, {
        source: 'auto',
        boss: { first: true, tier: 1 }
      });
      document.querySelector('.travel-now').click();
      Game.transitions.update(.47);
      const snap = Game.transitions.snapshot();
      return {
        phase: snap.phase,
        region: Game.state.world.region,
        active: Game.transitions.isActive(),
        curtainColumns: document.querySelectorAll('.transition-pixel-curtain i').length
      };
    })()`);
    assert.equal(transitionSwap.phase, 'swap');
    assert.equal(transitionSwap.region, transitionCountdown.nextRid);
    assert.equal(transitionSwap.active, true);
    assert.equal(transitionSwap.curtainColumns, 6);
    const swapCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const swapScreenshot = path.join(os.tmpdir(), 'firpg-transition-swap-mobile-cdp.png');
    fs.writeFileSync(swapScreenshot, Buffer.from(swapCapture.data, 'base64'));
    transitionScreenshots.push(swapScreenshot);

    const transitionArrive = await cdp.evaluate(`(() => {
      Game.transitions.update(.3);
      const snap = Game.transitions.snapshot();
      const root = document.getElementById('transition-root');
      return {
        phase: snap.phase,
        title: root.querySelector('.transition-title').textContent,
        arrivalMode: snap.arrivalMode,
        heroState: Game.world.hero.state
      };
    })()`);
    assert.equal(transitionArrive.phase, 'arrive');
    assert.equal(transitionArrive.arrivalMode, 'battle');
    assert.equal(transitionArrive.heroState, 'arrival');
    await delay(180);
    const arriveCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const arriveScreenshot = path.join(os.tmpdir(), 'firpg-transition-arrive-mobile-cdp.png');
    fs.writeFileSync(arriveScreenshot, Buffer.from(arriveCapture.data, 'base64'));
    transitionScreenshots.push(arriveScreenshot);

    const transitionFinished = await cdp.evaluate(`(() => {
      Game.transitions.update(2);
      return {
        active: Game.transitions.isActive(),
        region: Game.state.world.region,
        mode: Game.state.world.mode,
        heroState: Game.world.hero.state
      };
    })()`);
    assert.equal(transitionFinished.active, false);
    assert.equal(transitionFinished.region, transitionCountdown.nextRid);
    assert.equal(transitionFinished.mode, 'battle');
    assert.equal(transitionFinished.heroState, 'idle');

    const manualFirstArrival = await cdp.evaluate(`(() => {
      const order = Game.State.regionOrder();
      const current = order[1];
      const next = order[2];
      Game.State.regionProg(current).cleared = true;
      Game.world.setControlMode('manual');
      Game.state.world.mode = 'battle';
      Game.world.hero.state = 'idle';
      const started = Game.prog.requestRegion(next, { source: 'map' });
      const initial = Game.transitions.snapshot();
      Game.transitions.update(2);
      return {
        started,
        initialPhase: initial.phase,
        firstEntry: initial.firstEntry,
        region: Game.state.world.region,
        mode: Game.state.world.mode,
        heroState: Game.world.hero.state
      };
    })()`);
    assert.equal(manualFirstArrival.started, true);
    assert.equal(manualFirstArrival.initialPhase, 'depart');
    assert.equal(manualFirstArrival.firstEntry, true);
    assert.equal(manualFirstArrival.mode, 'rest');
    assert.equal(manualFirstArrival.heroState, 'goCamp');

    const deathStart = await cdp.evaluate(`(() => {
      Game.world.setControlMode('auto');
      Game.state.world.mode = 'battle';
      if (Game.world.bossEnt) {
        const index = Game.world.entities.indexOf(Game.world.bossEnt);
        if (index >= 0) Game.world.entities.splice(index, 1);
      }
      Game.world.bossEnt = null;
      Game.world.cinematic = null;
      Game.state.world.deathsRow = 0;
      Game.world.hero.state = 'idle';
      Game.state.player.hp = 0;
      Game.world.onHeroDeath();
      const root = document.getElementById('transition-root');
      const card = root.querySelector('.transition-card').getBoundingClientRect();
      const stage = root.getBoundingClientRect();
      return {
        phase: Game.transitions.snapshot().phase,
        kind: Game.transitions.snapshot().kind,
        controlLocked: document.getElementById('control-switch').disabled,
        progressText: root.querySelector('.transition-phase').textContent,
        cardWithinStage: card.left >= stage.left && card.right <= stage.right &&
          card.top >= stage.top && card.bottom <= stage.bottom
      };
    })()`);
    assert.equal(deathStart.kind, 'death');
    assert.equal(deathStart.phase, 'down');
    assert.equal(deathStart.controlLocked, true);
    assert.equal(deathStart.cardWithinStage, true);
    const deathPhases = [{ phase: deathStart.phase, progressText: deathStart.progressText }];
    const deathDownCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const deathDownScreenshot = path.join(os.tmpdir(), 'firpg-death-down-mobile-cdp.png');
    fs.writeFileSync(deathDownScreenshot, Buffer.from(deathDownCapture.data, 'base64'));
    transitionScreenshots.push(deathDownScreenshot);
    for (const deathStep of [
      { expected: 'soul' },
      { expected: 'land' },
      { expected: 'recover' },
      { expected: 'rise' }
    ]) {
      const metrics = await cdp.evaluate(`(() => {
        let snap = Game.transitions.snapshot();
        if (snap.phase !== ${JSON.stringify(deathStep.expected)}) {
          Game.transitions.update(snap.timeLeft + .05);
          snap = Game.transitions.snapshot();
        }
        const root = document.getElementById('transition-root');
        return {
          phase: snap.phase,
          timeLeft: snap.timeLeft,
          hp: Game.state.player.hp,
          maxHp: Game.world.hero.maxHp,
          recoveryPct: snap.recoveryPct,
          meterWidth: parseFloat(root.querySelector('.transition-meter span').style.width),
          progressText: root.querySelector('.transition-phase').textContent
        };
      })()`);
      assert.equal(metrics.phase, deathStep.expected);
      if (deathStep.expected === 'recover') {
        assert.ok(metrics.hp > 0 && metrics.hp < metrics.maxHp);
        assert.ok(metrics.recoveryPct > 0 && metrics.recoveryPct < 1);
        assert.ok(metrics.meterWidth > 0 && metrics.meterWidth < 100);
      }
      deathPhases.push(metrics);
      if (deathStep.expected === 'land' && metrics.timeLeft > .2) await delay(110);
      const deathCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const deathScreenshot = path.join(os.tmpdir(), 'firpg-death-' + deathStep.expected + '-mobile-cdp.png');
      fs.writeFileSync(deathScreenshot, Buffer.from(deathCapture.data, 'base64'));
      transitionScreenshots.push(deathScreenshot);
    }
    const deathFinished = await cdp.evaluate(`(() => {
      Game.transitions.update(1);
      return {
        active: Game.transitions.isActive(),
        hp: Game.state.player.hp,
        maxHp: Game.world.hero.maxHp,
        mode: Game.state.world.mode,
        heroState: Game.world.hero.state
      };
    })()`);
    assert.equal(deathFinished.active, false);
    assert.equal(deathFinished.hp, deathFinished.maxHp);
    assert.equal(deathFinished.mode, 'battle');
    assert.equal(deathFinished.heroState, 'idle');

    const transitionRules = await cdp.evaluate(`(() => {
      Game.world.setControlMode('manual');
      Game.state.world.mode = 'battle';
      Game.world.hero.state = 'idle';
      Game.state.player.hp = 0;
      Game.state.world.deathsRow = 0;
      Game.world.onHeroDeath();
      Game.transitions.update(20);
      const manual = {
        mode: Game.state.world.mode,
        heroState: Game.world.hero.state,
        hp: Game.state.player.hp
      };

      Game.world.setControlMode('auto');
      Game.state.world.mode = 'battle';
      Game.world.hero.state = 'idle';
      const currentRid = Game.state.world.region;
      const progress = Game.State.regionProg(currentRid);
      progress.kills = Game.world.region.killTarget;
      Game.world.trySpawnBoss();
      Game.state.world.deathsRow = 1;
      Game.state.player.hp = 0;
      Game.world.onHeroDeath();
      const bossSnap = Game.transitions.snapshot();
      const boss = {
        byBoss: bossSnap.byBoss,
        bossGone: !Game.world.bossEnt,
        keptProgress: progress.kills,
        expectedProgress: Math.ceil(Game.world.region.killTarget / 2),
        deathsRow: Game.state.world.deathsRow
      };
      Game.transitions.settleBeforeSave();

      const order = Game.State.regionOrder();
      const previousRid = order[order.indexOf(currentRid) - 1];
      Game.state.world.mode = 'battle';
      Game.world.hero.state = 'idle';
      Game.world.bossEnt = null;
      Game.state.world.deathsRow = 2;
      Game.state.player.hp = 0;
      Game.world.onHeroDeath();
      const fallbackRid = Game.transitions.snapshot().fallbackRid;
      Game.transitions.update(2);
      const fallbackLandedRid = Game.state.world.region;
      Game.transitions.update(20);

      const firstRid = order[0];
      Game.state.world.region = firstRid;
      Game.world.init(firstRid);
      Game.state.world.mode = 'battle';
      Game.state.world.deathsRow = 2;
      Game.world.hero.state = 'idle';
      Game.state.player.hp = 0;
      Game.world.onHeroDeath();
      const firstFallback = Game.transitions.snapshot().fallbackRid;
      Game.transitions.settleBeforeSave();
      Game.state.settings.effects = false;
      Game.state.player.hp = 0;
      const restoredStarted = Game.transitions.restoreZeroHp();
      const restoredSnap = Game.transitions.snapshot();
      const reducedStyle = Game.transitions.entityStyle(Game.world.hero);
      const reduced = {
        restoredStarted,
        phase: restoredSnap.phase,
        markedReduced: restoredSnap.reduced,
        rootReduced: document.getElementById('transition-root').classList.contains('reduced'),
        ghosts: reducedStyle.ghosts
      };
      Game.transitions.settleBeforeSave();
      Game.state.settings.effects = true;
      const firstRegionAfter = Game.state.world.region;
      Game.State.regionProg(firstRid).cleared = true;
      const pagehideTarget = order[1];
      Game.prog.requestRegion(pagehideTarget, { source: 'auto' });
      window.dispatchEvent(new Event('pagehide'));
      const pagehide = {
        active: Game.transitions.isActive(),
        region: Game.state.world.region,
        target: pagehideTarget,
        savedRegion: JSON.parse(localStorage.getItem('firpg_save')).world.region
      };
      return {
        manual,
        boss,
        fallbackRid,
        expectedFallbackRid: previousRid,
        fallbackLandedRid,
        firstFallback,
        firstRegionAfter,
        reduced,
        pagehide
      };
    })()`);
    assert.equal(transitionRules.manual.mode, 'rest');
    assert.equal(transitionRules.manual.heroState, 'sitting');
    assert.ok(transitionRules.manual.hp > 0);
    assert.equal(transitionRules.boss.byBoss, true);
    assert.equal(transitionRules.boss.bossGone, true);
    assert.equal(transitionRules.boss.keptProgress, transitionRules.boss.expectedProgress);
    assert.equal(transitionRules.boss.deathsRow, 1);
    assert.equal(transitionRules.fallbackRid, transitionRules.expectedFallbackRid);
    assert.equal(transitionRules.fallbackLandedRid, transitionRules.expectedFallbackRid);
    assert.equal(transitionRules.firstFallback, null);
    assert.equal(transitionRules.firstRegionAfter, transitionCountdown.firstRid);
    assert.equal(transitionRules.reduced.restoredStarted, true);
    assert.equal(transitionRules.reduced.phase, 'land');
    assert.equal(transitionRules.reduced.markedReduced, true);
    assert.equal(transitionRules.reduced.rootReduced, true);
    assert.equal(transitionRules.reduced.ghosts, 0);
    assert.equal(transitionRules.pagehide.active, false);
    assert.equal(transitionRules.pagehide.region, transitionRules.pagehide.target);
    assert.equal(transitionRules.pagehide.savedRegion, transitionRules.pagehide.target);
    const transitionChecks = {
      countdown: transitionCountdown,
      cancelled: transitionCancelled,
      swap: transitionSwap,
      arrive: transitionArrive,
      finished: transitionFinished,
      manualFirstArrival,
      deathPhases,
      deathFinished,
      rules: transitionRules
    };

    const finalRegionLock = await cdp.evaluate(`(() => {
      Game.i18n.setLocale('zh-CN');
      Game.ui.tabs.open('battle', true);
      const order = Game.State.regionOrder();
      const finalRid = order[order.length - 1];
      const previousRid = order[order.length - 2];
      const finalProgress = Game.State.regionProg(finalRid);
      const previousProgress = Game.State.regionProg(previousRid);
      for (let index = 0; index < order.length - 1; index++) {
        Game.State.regionProg(order[index]).cleared = true;
      }
      Game.state.settings.autoAdvance = false;
      Game.state.settings.effects = true;
      Game.state.settings.controlMode = 'auto';
      Game.state.world.finalRegionLocked = false;
      Game.state.world.region = finalRid;
      Game.state.world.mode = 'battle';
      Game.state.world.deathsRow = 0;
      Game.state.meta.completedAt = 123456789;
      Game.state.meta.endingAcknowledged = true;
      finalProgress.kills = 3;
      finalProgress.cleared = true;
      finalProgress.firstKill = true;
      previousProgress.cleared = true;
      previousProgress.firstKill = true;
      Game.world.init(finalRid);
      Game.state.player.hp = 0;
      Game.world.hero.state = 'idle';
      Game.world.onHeroDeath();
      const snap = Game.transitions.snapshot();
      const transitionRoot = document.getElementById('transition-root');
      const lossCopy = {
        eyebrow: transitionRoot.querySelector('.transition-eyebrow')?.textContent,
        title: transitionRoot.querySelector('.transition-title')?.textContent,
        sub: transitionRoot.querySelector('.transition-sub')?.textContent
      };
      Game.transitions.update(20);
      const afterLoss = {
        region: Game.state.world.region,
        locked: Game.state.world.finalRegionLocked,
        canEnter: Game.prog.isUnlocked(finalRid),
        finalCleared: finalProgress.cleared,
        finalFirstKill: finalProgress.firstKill,
        completedAt: Game.state.meta.completedAt,
        savedLocked: Game.save.serialize().world.finalRegionLocked,
        toast: document.getElementById('toasts').textContent
      };

      Game.ui.tabs.open('map', true);
      const zhCard = Array.from(document.querySelectorAll('#panel-container .region-card')).at(-1);
      const zhMap = {
        text: zhCard?.textContent || '',
        disabled: !!zhCard?.querySelector('.go-btn')?.disabled
      };
      Game.i18n.setLocale('en');
      Game.ui.tabs.open('map', true);
      const enCard = Array.from(document.querySelectorAll('#panel-container .region-card')).at(-1);
      const enMap = {
        text: enCard?.textContent || '',
        disabled: !!enCard?.querySelector('.go-btn')?.disabled,
        overflow: enCard ? enCard.scrollWidth > enCard.clientWidth : true
      };

      Game.i18n.setLocale('zh-CN');
      Game.ui.tabs.open('battle', true);
      const crystalsBefore = Game.state.player.crystal;
      const unlockEvents = [];
      const unlockListener = (payload) => unlockEvents.push(payload);
      Game.bus.on('region:unlocked', unlockListener);
      previousProgress.kills = Game.world.region.killTarget;
      Game.world.onBossDefeated({ mid: Game.world.region.boss });
      Game.bus.off('region:unlocked', unlockListener);
      const afterReopen = {
        locked: Game.state.world.finalRegionLocked,
        canEnter: Game.prog.isUnlocked(finalRid),
        crystalsUnchanged: Game.state.player.crystal === crystalsBefore,
        reopened: unlockEvents.some((event) => event.rid === finalRid && event.reopened),
        previousFirstKill: previousProgress.firstKill,
        savedLocked: Game.save.serialize().world.finalRegionLocked
      };

      Game.state.world.region = finalRid;
      Game.state.world.mode = 'battle';
      Game.state.world.layoutVersion = 4;
      Game.world.init(finalRid);
      Game.state.player.hp = Game.player.derived().maxHp;
      const retryProgress = Game.State.regionProg(finalRid);
      retryProgress.kills = Game.world.region.killTarget;
      const gateTarget = Game.world.layout.bossGatePoint;
      let gateSite = Game.guardSites.forTarget(gateTarget);
      Game.world.hero.x = gateSite.x;
      Game.world.hero.y = gateSite.y;
      Game.guardSites.trigger(gateSite, { targetId: gateTarget.id, reason: 'browser-smoke' });
      gateSite = Game.guardSites.forTarget(gateTarget);
      const gateEncounterId = gateSite.encounterId;
      for (const actorId of gateSite.actorIds) {
        const actor = Game.actors.get(actorId);
        actor.dead = true;
        actor.hp = 0;
        if (actor.components.vitals) actor.components.vitals.hp = 0;
      }
      Game.bus.emit('actor:defeated', { targetActorIds: gateSite.actorIds.slice() });
      if (gateEncounterId) Game.encounters.end(gateEncounterId, 'guard-smoke-victory');
      const gateCleared = Game.guardSites.isBossGateCleared();
      const finalExploration = Game.exploration.regionState(finalRid);
      const explorationConfig = Game.world.region.exploration;
      for (const def of explorationConfig.landmarks) finalExploration.discovered.landmarks[def.id] = true;
      for (const def of explorationConfig.resources) finalExploration.discovered.resources[def.id] = true;
      for (const def of explorationConfig.curios) finalExploration.discovered.curios[def.id] = true;
      const retryAt = finalExploration.bossRetryAt || 0;
      Game.state.world.worldTime = Math.max(Game.state.world.worldTime, retryAt);
      Game.world.hero.x = Game.world.layout.bossPoint.x;
      Game.world.hero.y = Game.world.layout.bossPoint.y;
      Game.state.world.mode = 'battle';
      Game.world.hero.state = 'idle';
      Game.world.bossEnt = null;
      if (Game.merchants && !Game.merchants.allowBossChallenge(finalRid)) {
        Game.state.world.worldTime += 2;
      }
      const bossStartDiagnostics = {
        readiness: Game.exploration.readiness(finalRid),
        heroState: Game.world.hero.state,
        heroEncounterId: Game.world.hero.encounterId || null,
        mode: Game.state.world.mode,
        worldTime: Game.state.world.worldTime,
        transitionActive: Game.transitions.isActive()
      };
      const bossStartResult = Game.world.trySpawnBoss({ manual: true });
      const voluntaryStarted = !!Game.world.bossEnt;
      Game.world.setMode('rest');
      const voluntary = {
        started: voluntaryStarted,
        gateCleared,
        retryAt,
        bossStartResult,
        bossStartDiagnostics,
        region: Game.state.world.region,
        locked: Game.state.world.finalRegionLocked,
        bossGone: !Game.world.bossEnt
      };
      return {
        finalRid,
        previousRid,
        snap: {
          finalRegionLost: snap.finalRegionLost,
          fallbackRid: snap.fallbackRid,
          byBoss: snap.byBoss
        },
        lossCopy,
        afterLoss,
        zhMap,
        enMap,
        afterReopen,
        voluntary
      };
    })()`);
    assert.equal(finalRegionLock.finalRid, 'darkcastle');
    assert.equal(finalRegionLock.snap.finalRegionLost, true);
    assert.equal(finalRegionLock.snap.fallbackRid, finalRegionLock.previousRid);
    assert.equal(finalRegionLock.snap.byBoss, false);
    assert.equal(finalRegionLock.lossCopy.eyebrow, '魔王城失守');
    assert.ok(finalRegionLock.lossCopy.title.includes(finalRegionLock.previousRid === 'skyruins' ? '浮空遗迹' : ''));
    assert.ok(finalRegionLock.lossCopy.sub.includes('重新封锁'));
    assert.equal(finalRegionLock.afterLoss.region, finalRegionLock.previousRid);
    assert.equal(finalRegionLock.afterLoss.locked, true);
    assert.equal(finalRegionLock.afterLoss.canEnter, false);
    assert.equal(finalRegionLock.afterLoss.finalCleared, true);
    assert.equal(finalRegionLock.afterLoss.finalFirstKill, true);
    assert.equal(finalRegionLock.afterLoss.completedAt, 123456789);
    assert.equal(finalRegionLock.afterLoss.savedLocked, true);
    assert.ok(finalRegionLock.afterLoss.toast.includes('魔王城失守'));
    assert.ok(finalRegionLock.zhMap.text.includes('失守 · 需重新解锁'));
    assert.equal(finalRegionLock.zhMap.disabled, true);
    assert.ok(finalRegionLock.enMap.text.includes('Lost · Reunlock Required'));
    assert.equal(finalRegionLock.enMap.disabled, true);
    assert.equal(finalRegionLock.enMap.overflow, false);
    assert.equal(finalRegionLock.afterReopen.locked, false);
    assert.equal(finalRegionLock.afterReopen.canEnter, true);
    assert.equal(finalRegionLock.afterReopen.crystalsUnchanged, true);
    assert.equal(finalRegionLock.afterReopen.reopened, true);
    assert.equal(finalRegionLock.afterReopen.previousFirstKill, true);
    assert.equal(finalRegionLock.afterReopen.savedLocked, false);
    assert.equal(finalRegionLock.voluntary.gateCleared, true);
    if (!finalRegionLock.voluntary.started) {
      console.error('v4 boss start diagnostics:', JSON.stringify(finalRegionLock.voluntary));
    }
    assert.equal(finalRegionLock.voluntary.started, true);
    assert.equal(finalRegionLock.voluntary.region, 'darkcastle');
    assert.equal(finalRegionLock.voluntary.locked, false);
    assert.equal(finalRegionLock.voluntary.bossGone, true);
    transitionChecks.finalRegionLock = finalRegionLock;

    const endingStart = await cdp.evaluate(`(() => {
      Game.i18n.setLocale('zh-CN');
      Game.ui.tabs.open('battle');
      Game.state.settings.effects = true;
      Game.state.meta.completedAt = null;
      Game.state.meta.endingAcknowledged = false;
      Game.state.meta.endingPhase = null;
      Game.state.meta.endingLine = 0;
      const order = Game.State.regionOrder();
      const finalRid = order[order.length - 1];
      Game.state.world.region = finalRid;
      Game.world.init(finalRid);
      const progress = Game.State.regionProg(finalRid);
      progress.kills = Game.world.region.killTarget;
      progress.cleared = false;
      progress.firstKill = false;
      Game.state.player.hp = Game.player.derived().maxHp;
      const hero = Game.world.hero;
      hero.state = 'idle';
      const boss = Game.world.makeMonster(Game.world.region.boss, true);
      boss.x = Game.world.layout.bossPoint.x;
      boss.y = Game.world.layout.bossPoint.y;
      boss.hp = 0;
      Game.world.entities.push(boss);
      Game.world.bossEnt = boss;
      Game.render.snapCamera(hero.x, hero.y);
      Game.render.frame(1 / 60);
      document.getElementById('toasts').replaceChildren();
      const playBefore = Game.state.meta.stats.playSec;
      const timeBefore = Game.state.world.worldTime;
      Game.world.onEntityKilled(boss, hero);
      return {
        finalRid,
        active: Game.ending.isActive(),
        pending: Game.ending.isPending(),
        phase: Game.ending.phase(),
        root: !!document.getElementById('ending-root'),
        hudLocked: document.getElementById('hud').inert,
        stageLocked: document.getElementById('stage-wrap').inert,
        visual: document.getElementById('ending-root')?.dataset.endingVisual,
        playBefore,
        timeBefore
      };
    })()`);
    assert.equal(endingStart.finalRid, 'darkcastle');
    assert.equal(endingStart.active, true);
    assert.equal(endingStart.pending, true);
    assert.equal(endingStart.phase, 'cinematic');
    assert.equal(endingStart.root, true);
    assert.equal(endingStart.hudLocked, true);
    assert.equal(endingStart.stageLocked, true);
    assert.equal(endingStart.visual, 'impact');

    await delay(1100);
    const endingEpilogue = await cdp.evaluate(`(() => {
      for (let guard = 0; guard < 4 && Game.ending.phase() === 'cinematic'; guard++) {
        Game.ending.advance();
      }
      Game.ui.ending.advanceStory();
      const story = document.querySelector('.ending-story');
      const text = document.querySelector('.ending-story .story-text');
      return {
        phase: Game.ending.phase(),
        line: story?.dataset.storyLine,
        text: text?.textContent.replace('▼', '').trim(),
        fits: !!text && text.scrollWidth <= text.clientWidth && text.scrollHeight <= text.clientHeight,
        noBossToast: !document.getElementById('toasts').textContent.includes(Game.i18n.t('ui.bossFirstKill', { n: Game.F.bossCrystal(8) }))
      };
    })()`);
    assert.equal(endingEpilogue.phase, 'epilogue');
    assert.equal(endingEpilogue.line, '0');
    assert.equal(endingEpilogue.text, '最后一击落下——魔王贝利亚尔的身影，终于在破晓的光芒中崩解。');
    assert.equal(endingEpilogue.noBossToast, true);

    const endingEpilogueCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const endingEpilogueScreenshot = path.join(os.tmpdir(), 'firpg-ending-epilogue-mobile-cdp.png');
    fs.writeFileSync(endingEpilogueScreenshot, Buffer.from(endingEpilogueCapture.data, 'base64'));

    const endingSummary = await cdp.evaluate(`(() => {
      for (let i = 0; i < 6; i++) {
        Game.ui.ending.advanceStory();
        Game.ui.ending.advanceStory();
      }
      const root = document.getElementById('ending-root');
      const rr = root.getBoundingClientRect();
      const buttons = Array.from(root.querySelectorAll('.ending-actions .btn')).map((button) => {
        const r = button.getBoundingClientRect();
        return { text: button.textContent, width: r.width, height: r.height, fits: button.scrollWidth <= button.clientWidth };
      });
      const canvas = document.getElementById('stage');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let coloredPixels = 0;
      for (let i = 0; i < pixels.length; i += Math.max(4, Math.floor(pixels.length / 1200 / 4) * 4)) {
        if (pixels[i + 3] > 0 && (pixels[i] > 20 || pixels[i + 1] > 20 || pixels[i + 2] > 20)) {
          coloredPixels++;
        }
      }
      return {
        phase: Game.ending.phase(),
        title: document.getElementById('ending-summary-title')?.textContent,
        subtitle: root.querySelector('.ending-summary-heading p')?.textContent,
        statCount: root.querySelectorAll('.ending-stat').length,
        buttons,
        withinViewport: rr.left >= 0 && rr.top >= 0 && rr.right <= innerWidth && rr.bottom <= innerHeight,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        coloredPixels,
        playFrozen: Math.abs(Game.state.meta.stats.playSec - ${JSON.stringify(endingStart.playBefore)}) < 0.2,
        timeFrozen: Math.abs(Game.state.world.worldTime - ${JSON.stringify(endingStart.timeBefore)}) < 0.2
      };
    })()`);
    assert.equal(endingSummary.phase, 'summary');
    assert.equal(endingSummary.title, '远征终章');
    assert.equal(endingSummary.subtitle, '露西亚大陆重新迎来了黎明。');
    assert.equal(endingSummary.statCount, 5);
    assert.equal(endingSummary.buttons.length, 2);
    assert.ok(endingSummary.buttons.every((button) => button.height >= 44 && button.fits));
    assert.equal(endingSummary.withinViewport, true);
    assert.equal(endingSummary.noHorizontalOverflow, true);
    assert.ok(
      endingSummary.coloredPixels > 0,
      'ending keeps the live nonblank canvas behind its dawn treatment: ' + JSON.stringify(endingSummary)
    );
    assert.equal(endingSummary.playFrozen, true);
    assert.equal(endingSummary.timeFrozen, true);

    const endingSummaryCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const endingSummaryScreenshot = path.join(os.tmpdir(), 'firpg-ending-summary-mobile-cdp.png');
    fs.writeFileSync(endingSummaryScreenshot, Buffer.from(endingSummaryCapture.data, 'base64'));

    const englishEndingFit = await cdp.evaluate(`(() => {
      Game.i18n.setLocale('en');
      const buttons = Array.from(document.querySelectorAll('.ending-actions .btn')).map((button) => ({
        text: button.textContent,
        fits: button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight
      }));
      return {
        title: document.getElementById('ending-summary-title')?.textContent,
        buttons,
        statsFit: Array.from(document.querySelectorAll('.ending-stat')).every((row) => row.scrollWidth <= row.clientWidth),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(englishEndingFit.title, "JOURNEY'S END");
    assert.ok(englishEndingFit.buttons.every((button) => button.fits));
    assert.equal(englishEndingFit.statsFit, true);
    assert.equal(englishEndingFit.noHorizontalOverflow, true);

    const restartGuard = await cdp.evaluate(`(() => {
      document.getElementById('ending-restart').click();
      const mask = document.querySelector('#modal-root .modal-mask');
      const text = mask?.querySelector('.modal-body')?.textContent || '';
      mask?.querySelector('.modal-btns .btn')?.click();
      return {
        confirmationShown: !!mask,
        destructiveCopy: text.includes('permanently erased'),
        endingStillOpen: !!document.getElementById('ending-root')
      };
    })()`);
    assert.equal(restartGuard.confirmationShown, true);
    assert.equal(restartGuard.destructiveCopy, true);
    assert.equal(restartGuard.endingStillOpen, true);

    const continueAndRepeat = await cdp.evaluate(`(() => {
      Game.i18n.setLocale('zh-CN');
      document.getElementById('ending-continue').click();
      const continued = {
        active: Game.ending.isActive(),
        acknowledged: Game.state.meta.endingAcknowledged,
        rootGone: !document.getElementById('ending-root'),
        heroState: Game.world.hero.state,
        hudUnlocked: !document.getElementById('hud').inert
      };
      const boss = Game.world.makeMonster(Game.world.region.boss, true);
      boss.x = Game.world.layout.bossPoint.x;
      boss.y = Game.world.layout.bossPoint.y;
      boss.hp = 0;
      Game.world.entities.push(boss);
      Game.world.bossEnt = boss;
      Game.world.onEntityKilled(boss, Game.world.hero);
      continued.repeatStayedInGame = !Game.ending.isActive() && !document.getElementById('ending-root');
      return continued;
    })()`);
    assert.equal(continueAndRepeat.active, false);
    assert.equal(continueAndRepeat.acknowledged, true);
    assert.equal(continueAndRepeat.rootGone, true);
    assert.equal(continueAndRepeat.heroState, 'idle');
    assert.equal(continueAndRepeat.hudUnlocked, true);
    assert.equal(continueAndRepeat.repeatStayedInGame, true);

    const reducedEndingStart = await cdp.evaluate(`(() => {
      Game.i18n.setLocale('en');
      Game.state.settings.effects = false;
      Game.state.meta.completedAt = null;
      Game.state.meta.endingAcknowledged = false;
      Game.state.meta.endingPhase = null;
      const progress = Game.State.regionProg(Game.world.region.id);
      progress.firstKill = false;
      progress.cleared = false;
      const boss = Game.world.makeMonster(Game.world.region.boss, true);
      boss.x = Game.world.layout.bossPoint.x;
      boss.y = Game.world.layout.bossPoint.y;
      boss.hp = 0;
      Game.world.entities.push(boss);
      Game.world.bossEnt = boss;
      Game.world.onEntityKilled(boss, Game.world.hero);
      return {
        reduced: document.getElementById('ending-root')?.classList.contains('reduced'),
        visual: document.getElementById('ending-root')?.dataset.endingVisual,
        phase: Game.ending.phase()
      };
    })()`);
    assert.equal(reducedEndingStart.reduced, true);
    assert.equal(reducedEndingStart.visual, 'dawn');
    assert.equal(reducedEndingStart.phase, 'cinematic');
    await delay(1000);
    const reducedEnding = await cdp.evaluate(`(() => {
      const phase = Game.ending.phase();
      const lines = [];
      for (let i = 0; i < 6; i++) {
        Game.ui.ending.advanceStory();
        const box = document.querySelector('.ending-story-box');
        const text = box?.querySelector('.story-text');
        lines.push({
          text: text?.textContent.replace('▼', '').trim(),
          fits: !!box && !!text && box.scrollHeight <= box.clientHeight && text.scrollWidth <= text.clientWidth
        });
        Game.ui.ending.advanceStory();
      }
      document.getElementById('ending-continue')?.click();
      Game.state.settings.effects = true;
      Game.i18n.setLocale('zh-CN');
      return { phase, finished: !Game.ending.isActive(), lines };
    })()`);
    assert.equal(reducedEnding.phase, 'epilogue');
    assert.equal(reducedEnding.finished, true);
    assert.equal(reducedEnding.lines.length, 6);
    assert.ok(reducedEnding.lines.every((line) => line.fits), 'all English epilogue lines fit the mobile dialogue box');

    const endingChecks = {
      start: endingStart,
      epilogue: endingEpilogue,
      summary: endingSummary,
      english: englishEndingFit,
      restartGuard,
      continueAndRepeat,
      reduced: reducedEndingStart,
      epilogueScreenshot: endingEpilogueScreenshot,
      summaryScreenshot: endingSummaryScreenshot
    };

    const densityChecks = [];
    const densityScreenshots = [];
    for (const regionId of ['grassland', 'forest', 'mine', 'graveyard', 'snowpass', 'lavacave', 'skyruins', 'darkcastle']) {
      const metrics = await cdp.evaluate(`(() => {
        Game.state.world.worldSeed = 0x89ABCDEF;
        Game.state.world.layoutVersion = 2;
        Game.state.world.region = ${JSON.stringify(regionId)};
        const progress = Game.State.regionProg(${JSON.stringify(regionId)});
        progress.kills = 0;
        const started = performance.now();
        Game.world.init(${JSON.stringify(regionId)});
        const generationMs = performance.now() - started;
        const layout = Game.world.layout;
        const focus = layout.corridor.points[Math.floor(layout.corridor.points.length / 2)];
        const hero = Game.world.hero;
        hero.x = focus.x;
        hero.y = focus.y;
        hero.state = 'idle';
        hero.target = null;
        const toastRoot = document.getElementById('toasts');
        if (toastRoot) toastRoot.replaceChildren();
        document.querySelectorAll('#stage-wrap > div').forEach((el) => {
          if (el.style.zIndex === '16') el.style.opacity = '0';
        });
        Game.ui.hud.update();
        Game.render.snapCamera(focus.x, focus.y);
        const frameStarted = performance.now();
        for (let i = 0; i < 12; i++) Game.render.frame(1 / 60);
        const frameMs = (performance.now() - frameStarted) / 12;
        const visible = layout.props.filter((prop) => prop.sprite !== 'tent' && !prop.campfire &&
          Math.abs(prop.x - focus.x) <= 115 && Math.abs(prop.y - focus.y) <= 92);
        const canvas = document.getElementById('stage');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set();
        for (let i = 0; i < pixels.length; i += Math.max(4, Math.floor(pixels.length / 900 / 4) * 4)) {
          colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
        }
        return {
          region: ${JSON.stringify(regionId)}, version: layout.version,
          props: layout.props.length, patches: layout.patches.length,
          tufts: layout.tufts.length, flowers: layout.flowers.length,
          visibleProps: visible.length,
          visibleLarge: visible.filter((prop) => prop.large).length,
          generationMs, frameMs, canvasColors: colors.size
        };
      })()`);
      densityChecks.push(metrics);
      assert.equal(metrics.version, 2);
      assert.ok(metrics.props >= 98, regionId + ' has at least 98 generated props: ' + JSON.stringify(metrics));
      assert.ok(metrics.patches >= 10, regionId + ' has denser terrain patches: ' + JSON.stringify(metrics));
      assert.ok(metrics.visibleProps >= 6, regionId + ' corridor viewport is not sparse: ' + JSON.stringify(metrics));
      assert.ok(metrics.canvasColors > 20, regionId + ' canvas is nonblank');
      assert.ok(metrics.generationMs < 250, regionId + ' generation stays responsive: ' + JSON.stringify(metrics));
      assert.ok(metrics.frameMs < 30, regionId + ' dense frame stays within budget: ' + JSON.stringify(metrics));
      if (regionId === 'forest') {
        assert.ok(metrics.visibleProps >= 10, 'forest mobile viewport has dense undergrowth: ' + JSON.stringify(metrics));
        assert.ok(metrics.visibleLarge >= 3, 'forest mobile viewport has several large trees: ' + JSON.stringify(metrics));
      }
      await delay(80);
      const regionCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const regionScreenshot = path.join(os.tmpdir(), 'firpg-density-' + regionId + '-mobile-cdp.png');
      fs.writeFileSync(regionScreenshot, Buffer.from(regionCapture.data, 'base64'));
      densityScreenshots.push(regionScreenshot);
    }

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
    });
    const desktop = await cdp.evaluate(`(() => {
      Game.state.world.region = 'forest';
      Game.State.regionProg('forest').kills = 0;
      Game.world.init('forest');
      const focus = Game.world.layout.corridor.points[Math.floor(Game.world.layout.corridor.points.length / 2)];
      Game.world.hero.x = focus.x;
      Game.world.hero.y = focus.y;
      Game.world.hero.state = 'idle';
      Game.world.hero.target = null;
      const toastRoot = document.getElementById('toasts');
      if (toastRoot) toastRoot.replaceChildren();
      document.querySelectorAll('#stage-wrap > div').forEach((el) => {
        if (el.style.zIndex === '16') el.style.opacity = '0';
      });
      Game.ui.hud.update();
      Game.render.snapCamera(focus.x, focus.y);
      Game.render.frame(1 / 60);
      const appRect = document.getElementById('app').getBoundingClientRect();
      const regionRect = document.getElementById('region-chip').getBoundingClientRect();
      const gaugeRect = document.getElementById('hunt-gauge').getBoundingClientRect();
      return {
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        appWithin: appRect.left >= 0 && appRect.right <= innerWidth && appRect.bottom <= innerHeight,
        stageWidth: document.getElementById('stage-wrap').getBoundingClientRect().width,
        headerControlsSeparate: regionRect.right <= gaugeRect.left || gaugeRect.bottom <= regionRect.top || regionRect.bottom <= gaugeRect.top
      };
    })()`);
    assert.equal(desktop.noHorizontalOverflow, true, 'desktop page has no horizontal overflow');
    assert.equal(desktop.appWithin, true, 'desktop game shell fits viewport');
    assert.equal(desktop.headerControlsSeparate, true, 'desktop region and hunt gauge do not overlap');
    assert.ok(desktop.stageWidth >= 390, 'desktop stage keeps a useful width');
    await delay(80);
    const desktopCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const desktopScreenshot = path.join(os.tmpdir(), 'firpg-density-forest-desktop-cdp.png');
    fs.writeFileSync(desktopScreenshot, Buffer.from(desktopCapture.data, 'base64'));

    const desktopMapWheel = await cdp.evaluate(`(() => {
      const previousLayoutVersion = Game.state.world.layoutVersion;
      Game.state.world.layoutVersion = 3;
      Game.world.init('forest');
      Game.ui.tabs.open('map');
      const canvas = document.querySelector('canvas[data-live-region-map]');
      const rect = canvas.getBoundingClientRect();
      const consumed = !canvas.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -96, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        clientX: rect.left + rect.width * 0.72,
        clientY: rect.top + rect.height * 0.38,
        bubbles: true, cancelable: true
      }));
      const zoom = Number(canvas.dataset.mapZoom);
      const sameCanvas = canvas === document.querySelector('canvas[data-live-region-map]');
      const noHorizontalOverflow = document.documentElement.scrollWidth <= innerWidth;
      Game.ui.tabs.open('battle');
      Game.state.world.layoutVersion = previousLayoutVersion;
      Game.world.init('forest');
      return { consumed, zoom, sameCanvas, noHorizontalOverflow };
    })()`);
    assert.equal(desktopMapWheel.consumed, true, 'desktop wheel is captured while map zoom changes');
    assert.ok(desktopMapWheel.zoom > 1 && desktopMapWheel.zoom < 1.35);
    assert.equal(desktopMapWheel.sameCanvas, true);
    assert.equal(desktopMapWheel.noHorizontalOverflow, true);

    const desktopTransition = await cdp.evaluate(`(() => {
      if (Game.transitions.isActive()) Game.transitions.settleBeforeSave();
      Game.ui.tabs.open('battle', true);
      const order = Game.State.regionOrder();
      const currentIndex = order.indexOf(Game.state.world.region);
      const targetIndex = currentIndex < order.length - 1 ? currentIndex + 1 : currentIndex - 1;
      const targetRid = order[targetIndex];
      if (targetIndex > 0) Game.State.regionProg(order[targetIndex - 1]).cleared = true;
      Game.state.world.mode = 'battle';
      Game.world.setControlMode('auto');
      const started = Game.prog.requestRegion(targetRid, { source: 'auto' });
      const root = document.getElementById('transition-root').getBoundingClientRect();
      const card = document.querySelector('.transition-card').getBoundingClientRect();
      const buttons = Array.from(document.querySelectorAll('.transition-actions .btn')).map((button) => {
        const r = button.getBoundingClientRect();
        return { height: r.height, fits: button.scrollWidth <= button.clientWidth };
      });
      const result = {
        started,
        cardWithinRoot: card.left >= root.left && card.right <= root.right &&
          card.top >= root.top && card.bottom <= root.bottom,
        cardWidth: card.width,
        buttons,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
      Game.transitions.cancel('desktop-qa');
      return result;
    })()`);
    assert.equal(desktopTransition.started, true);
    assert.equal(desktopTransition.cardWithinRoot, true);
    assert.ok(desktopTransition.cardWidth <= 390);
    assert.ok(desktopTransition.buttons.every((button) => button.height >= 44 && button.fits));
    assert.equal(desktopTransition.noHorizontalOverflow, true);

    const desktopEnding = await cdp.evaluate(`(() => {
      Game.state.meta.completedAt = Date.now();
      Game.state.meta.endingAcknowledged = false;
      Game.state.meta.endingPhase = 'summary';
      Game.ending.restorePending();
      const root = document.getElementById('ending-root').getBoundingClientRect();
      const panel = document.querySelector('.ending-summary-panel').getBoundingClientRect();
      return {
        rootWithinApp: root.left >= document.getElementById('app').getBoundingClientRect().left &&
          root.right <= document.getElementById('app').getBoundingClientRect().right,
        panelWithinRoot: panel.left >= root.left && panel.right <= root.right && panel.top >= root.top && panel.bottom <= root.bottom,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(desktopEnding.rootWithinApp, true);
    assert.equal(desktopEnding.panelWithinRoot, true);
    assert.equal(desktopEnding.noHorizontalOverflow, true);
    await delay(80);
    const desktopEndingCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const desktopEndingScreenshot = path.join(os.tmpdir(), 'firpg-ending-summary-desktop-cdp.png');
    fs.writeFileSync(desktopEndingScreenshot, Buffer.from(desktopEndingCapture.data, 'base64'));
    await cdp.evaluate(`Game.ending.continueGame()`);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true
    });

    await cdp.navigate(BASE + 'tech-demos/index.html?lang=en');
    const demoHub = await cdp.evaluate(`(() => ({
      cards: document.querySelectorAll('.demo-grid article').length,
      linksCarryLocale: Array.from(document.querySelectorAll('[data-demo-link]')).every((link) =>
        new URL(link.href).searchParams.get('lang') === 'en'),
      hasLootLab: !!document.querySelector('a[href*="loot-lab/loot-lab.html"]'),
      title: document.querySelector('h1')?.textContent,
      controlsTouchable: Array.from(document.querySelectorAll('.hub-actions a, .hub-actions select, .demo-grid a'))
        .every((el) => el.getBoundingClientRect().height >= 44),
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
    }))()`);
    assert.equal(demoHub.cards, 8, 'technical demo hub exposes every current workbench');
    assert.equal(demoHub.hasLootLab, true, 'technical demo hub exposes the production Loot Lab');
    assert.equal(demoHub.linksCarryLocale, true, 'demo hub preserves the selected locale');
    assert.equal(demoHub.title, 'Technical Demo Hub');
    assert.equal(demoHub.controlsTouchable, true);
    assert.equal(demoHub.noHorizontalOverflow, true);

    await cdp.navigate(BASE + 'tech-demos/weather-climate/weather-climate.html?seed=1234ABCD&region=forest&time=300&particle=snow&lang=en');
    const weatherDemo = await cdp.evaluate(`(() => {
      document.querySelector('[data-speed="0"]')?.click();
      const saveBefore = {
        main: localStorage.getItem('firpg_save'),
        backup: localStorage.getItem('firpg_save_backup')
      };
      const stage = document.getElementById('stage');
      const stagePixels = stage.getContext('2d').getImageData(0, 0, stage.width, stage.height).data;
      let stageVisible = 0;
      const colors = new Set();
      for (let i = 0; i < stagePixels.length; i += Math.max(4, Math.floor(stagePixels.length / 2000 / 4) * 4)) {
        if (stagePixels[i + 3]) stageVisible++;
        colors.add(stagePixels[i] + ',' + stagePixels[i + 1] + ',' + stagePixels[i + 2]);
      }
      const phaseVisible = Array.from(document.querySelectorAll('.phase-grid canvas')).map((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0;
        for (let i = 3; i < pixels.length; i += 128) if (pixels[i]) visible++;
        return visible;
      });
      const methods = [
        'regions', 'particlePresets', 'snapshot', 'report',
        'setRegion', 'setSeed', 'setWorldTime', 'setParticlePreset',
        'setEffects', 'setCamera', 'capturePhases', 'verifyDeterminism'
      ];
      const snapshot = WeatherClimateLab.snapshot();
      const report = WeatherClimateLab.report();
      const captures = WeatherClimateLab.capturePhases();
      const determinism = WeatherClimateLab.verifyDeterminism();
      DemoI18n.setLocale('zh-CN', false);
      const zhTitle = document.querySelector('h1')?.textContent;
      DemoI18n.setLocale('en', false);
      const enTitle = document.querySelector('h1')?.textContent;
      const saveAfter = {
        main: localStorage.getItem('firpg_save'),
        backup: localStorage.getItem('firpg_save_backup')
      };
      const sources = Array.from(document.scripts, (node) => node.src);
      const params = new URL(location.href).searchParams;
      return {
        title: enTitle,
        zhTitle,
        stageVisible,
        colors: colors.size,
        phaseVisible,
        captures,
        determinism,
        snapshot,
        futureHooks: report.futureHooks,
        regions: WeatherClimateLab.regions(),
        presets: WeatherClimateLab.particlePresets(),
        apiComplete: methods.every((method) => typeof WeatherClimateLab[method] === 'function'),
        params: {
          seed: params.get('seed'),
          region: params.get('region'),
          particle: params.get('particle'),
          lang: params.get('lang')
        },
        linksCarryContext: ['map-lab-link', 'hazard-lab-link'].every((id) => {
          const target = new URL(document.getElementById(id).href);
          return target.searchParams.get('seed') === '1234ABCD' &&
            target.searchParams.get('region') === 'forest' &&
            target.searchParams.get('lang') === 'en';
        }),
        productionModulesOnly: !sources.some((src) =>
          /(?:world_population|systems\\/world|systems\\/(?:combat|hazards|environment|exploration|expedition|trade)|(?:core|systems)\\/save)\\.js/.test(src)),
        saveUnchanged: JSON.stringify(saveBefore) === JSON.stringify(saveAfter),
        controlsTouchable: Array.from(document.querySelectorAll(
          'button, select, input:not([type="checkbox"]), a, .effects-control'))
          .every((el) => el.getBoundingClientRect().height >= 44),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(weatherDemo.title, 'Weather / Climate Lab');
    assert.match(weatherDemo.zhTitle, /天气 \/ 气候 Lab/);
    assert.ok(weatherDemo.stageVisible > 500);
    assert.ok(weatherDemo.colors > 8);
    assert.equal(weatherDemo.phaseVisible.length, 4);
    assert.ok(weatherDemo.phaseVisible.every((visible) => visible > 100));
    assert.equal(weatherDemo.captures.length, 4);
    assert.ok(weatherDemo.captures.every((capture) => capture.hash));
    assert.equal(weatherDemo.determinism.sameInputsMatch, true);
    assert.equal(weatherDemo.determinism.timeChangesCanvas, true);
    assert.equal(weatherDemo.determinism.seedChangesLayout, true);
    assert.equal(weatherDemo.snapshot.productionWeatherSystem, true);
    assert.equal(weatherDemo.snapshot.noPlayer, true);
    assert.equal(weatherDemo.snapshot.fogEnabled, false);
    assert.equal(weatherDemo.snapshot.saveWrites, false);
    assert.equal(weatherDemo.snapshot.regionId, 'forest');
    assert.equal(weatherDemo.snapshot.seedHex, '1234ABCD');
    assert.equal(weatherDemo.snapshot.atmosphere.previewMode, 'snow');
    assert.equal(weatherDemo.snapshot.atmosphere.activeParticle, 'snow');
    assert.ok(weatherDemo.snapshot.worldTime >= 300 && weatherDemo.snapshot.worldTime < 310);
    assert.equal(weatherDemo.regions.length, 8);
    assert.deepEqual(weatherDemo.presets, [
      'meadow', 'leaves', 'dust', 'wisps',
      'snow', 'embers', 'cloudwisp', 'miasma'
    ]);
    assert.equal(weatherDemo.apiComplete, true);
    assert.deepEqual(weatherDemo.params, {
      seed: '1234ABCD', region: 'forest', particle: 'snow', lang: 'en'
    });
    assert.deepEqual(weatherDemo.futureHooks, {
      timeline: 'production',
      weatherState: 'production',
      intensity: 'production',
      visibilityProvider: 'weather:visibility',
      renderLayer: 'production-four-layer'
    });
    assert.equal(weatherDemo.linksCarryContext, true);
    assert.equal(weatherDemo.productionModulesOnly, true);
    assert.equal(weatherDemo.saveUnchanged, true);
    assert.equal(weatherDemo.controlsTouchable, true);
    assert.equal(weatherDemo.noHorizontalOverflow, true);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
    });
    await cdp.navigate(BASE + 'tech-demos/weather-climate/weather-climate.html?seed=1234ABCD&region=forest&time=300&particle=region&lang=en');
    const weatherDesktop = await cdp.evaluate(`(() => {
      document.querySelector('[data-speed="0"]')?.click();
      const canvas = document.getElementById('stage');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 128) if (pixels[i]) visible++;
      const stageRect = document.getElementById('stage-wrap').getBoundingClientRect();
      return {
        visible,
        width: stageRect.width,
        regions: document.querySelectorAll('.region-tab').length,
        phaseCanvases: document.querySelectorAll('.phase-grid canvas').length,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.ok(weatherDesktop.visible > 500);
    assert.ok(weatherDesktop.width > 600);
    assert.equal(weatherDesktop.regions, 8);
    assert.equal(weatherDesktop.phaseCanvases, 4);
    assert.equal(weatherDesktop.noHorizontalOverflow, true);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true
    });

    await cdp.navigate(BASE + 'tech-demos/hazards/hazards.html?seed=1234ABCD&region=grassland&lang=en');
    const hazardDemo = await cdp.evaluate(`(() => {
      const stage = document.getElementById('stage');
      const sheet = document.getElementById('contact-sheet');
      const routeCanvas = document.getElementById('route-audit-map');
      const mimicSheet = document.getElementById('mimic-sheet');
      const stagePixels = stage.getContext('2d').getImageData(0, 0, stage.width, stage.height).data;
      const sheetPixels = sheet.getContext('2d').getImageData(0, 0, sheet.width, sheet.height).data;
      const routePixels = routeCanvas.getContext('2d')
        .getImageData(0, 0, routeCanvas.width, routeCanvas.height).data;
      const mimicPixels = mimicSheet.getContext('2d')
        .getImageData(0, 0, mimicSheet.width, mimicSheet.height).data;
      let stageVisible = 0, sheetVisible = 0, routeVisible = 0, mimicVisible = 0;
      for (let i = 3; i < stagePixels.length; i += 128) if (stagePixels[i]) stageVisible++;
      for (let i = 3; i < sheetPixels.length; i += 64) if (sheetPixels[i]) sheetVisible++;
      for (let i = 3; i < routePixels.length; i += 128) if (routePixels[i]) routeVisible++;
      for (let i = 3; i < mimicPixels.length; i += 64) if (mimicPixels[i]) mimicVisible++;
      const catalog = HazardEffectsLab.catalog();
      const detection = HazardEffectsLab.detection();
      const visibility = HazardEffectsLab.visibility(0.5);
      const weatherDetection = HazardEffectsLab.detection();
      const triggered = HazardEffectsLab.trigger();
      const routeReport = HazardEffectsLab.auditReport();
      const mimicReport = HazardEffectsLab.mimicReport();
      const mimicIndexes = mimicReport.entries
        .filter((entry) => entry.mimic).map((entry) => entry.index);
      return {
        title: document.querySelector('h1')?.textContent,
        catalog: catalog.length,
        regions: new Set(catalog.map((profile) => profile.regionId)).size,
        profilesInSelect: document.querySelectorAll('#profile-select option').length,
        state: document.getElementById('hazard-state').textContent,
        triggered,
        stageVisible,
        sheetVisible,
        routeVisible,
        mimicVisible,
        detection,
        visibility,
        weatherDetection,
        routeSummary: routeReport.summary,
        routeEnvironmentVisibility: routeReport.environmentVisibility,
        mimicSamples: mimicReport.entries.length,
        mimicProtection: mimicReport.entries[0].eligible === false &&
          mimicReport.entries[1].eligible === false,
        mimicGapOk: mimicIndexes.every((index, ordinal) =>
          ordinal === 0 || index - mimicIndexes[ordinal - 1] >= 3),
        controlsTouchable: Array.from(document.querySelectorAll(
          'button, select, input:not([type="checkbox"]), a'))
          .every((el) => el.getBoundingClientRect().height >= 44),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(hazardDemo.title, 'Hazard Effects QA');
    assert.equal(hazardDemo.catalog, 16);
    assert.equal(hazardDemo.regions, 8);
    assert.equal(hazardDemo.profilesInSelect, 16);
    assert.equal(hazardDemo.triggered, true);
    assert.match(hazardDemo.state, /revealed \/ warning/);
    assert.ok(hazardDemo.stageVisible > 100);
    assert.ok(hazardDemo.sheetVisible > 100);
    assert.ok(hazardDemo.routeVisible > 100);
    assert.ok(hazardDemo.mimicVisible > 100);
    assert.equal(hazardDemo.detection.baseChance, 0.25);
    assert.equal(hazardDemo.visibility, 0.5);
    assert.ok(hazardDemo.weatherDetection.effectiveChance < hazardDemo.detection.effectiveChance);
    assert.ok(hazardDemo.weatherDetection.sources.some((source) =>
      source.id === 'lab:visibility-override' && source.multiplier === 0.5));
    assert.equal(hazardDemo.routeSummary.activePlacements, hazardDemo.routeSummary.placements);
    assert.ok(hazardDemo.routeSummary.links > 40);
    assert.ok(hazardDemo.routeSummary.baselineCrossings > 0);
    assert.equal(hazardDemo.routeEnvironmentVisibility, 0.5);
    assert.ok(hazardDemo.routeSummary.detections >= 0);
    assert.ok(hazardDemo.routeSummary.missedWarnings >= 0);
    assert.ok(hazardDemo.routeSummary.escapes >= 0);
    assert.equal(hazardDemo.mimicSamples, 24);
    assert.equal(hazardDemo.mimicProtection, true);
    assert.equal(hazardDemo.mimicGapOk, true);
    assert.equal(hazardDemo.controlsTouchable, true);
    assert.equal(hazardDemo.noHorizontalOverflow, true);

    await cdp.navigate(BASE + 'tech-demos/exploration-v3/exploration-v3.html?seed=20260727&region=grassland&lang=en');
    const generatorDemo = await cdp.evaluate(`(() => {
      const canvas = document.getElementById('layout');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 64) if (pixels[i]) visible++;
      const report = JSON.parse(document.getElementById('report').textContent);
      const iconCanvases = Array.from(document.querySelectorAll('[data-map-icon]'));
      return {
        region: report.region,
        seed: report.seed,
        layoutVersion: report.layoutVersion,
        resources: report.metrics.resources,
        chunks: report.metrics.chunks,
        routeReached: report.navigation.reached,
        routeLegs: report.navigation.legs.length,
        routeRecoveries: report.navigation.recoveries,
        valid: report.metrics.walkableRatio >= 0.6 && report.metrics.walkableRatio <= 0.7,
        metricCount: document.querySelectorAll('#metrics .metric').length,
        chunkToggle: !!document.getElementById('show-chunks'),
        routeToggle: document.getElementById('show-route')?.checked === true,
        iconCount: iconCanvases.length,
        iconsPainted: iconCanvases.every((icon) => {
          const data = icon.getContext('2d').getImageData(0, 0, icon.width, icon.height).data;
          for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
          return false;
        }),
        visible,
        controlsTouchable: [document.getElementById('generate'), document.getElementById('audit')]
          .every((el) => el.getBoundingClientRect().height >= 44),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(generatorDemo.region, 'grassland');
    assert.equal(generatorDemo.seed, '20260727');
    assert.equal(generatorDemo.layoutVersion, 4);
    assert.ok(generatorDemo.resources >= 16 && generatorDemo.resources <= 22);
    assert.equal(generatorDemo.chunks, 15);
    assert.equal(generatorDemo.valid, true);
    assert.equal(generatorDemo.routeReached, true);
    assert.ok(generatorDemo.routeLegs >= 2);
    assert.ok(generatorDemo.routeRecoveries >= 0);
    assert.equal(generatorDemo.metricCount, 12);
    assert.equal(generatorDemo.chunkToggle, true);
    assert.equal(generatorDemo.routeToggle, true);
    assert.equal(generatorDemo.iconCount, 15);
    assert.equal(generatorDemo.iconsPainted, true);
    assert.ok(generatorDemo.visible > 1000, 'v4 generator canvas is nonblank');
    assert.equal(generatorDemo.controlsTouchable, true);
    assert.equal(generatorDemo.noHorizontalOverflow, true);

    const treasureAudit = await cdp.evaluate(`(() => {
      const button = document.getElementById('run-treasure-audit');
      if (!button || !window.Game || !Game.autoRouteAudit || !Game.autoRouteAudit.runTreasureAudit) {
        return { ready: false };
      }
      const layout = Game.terrain.generate(Game.reg.get('region', 'grassland'), 0xA17B00, 4);
      const summary = Game.autoRouteAudit.runTreasureAudit(layout);
      return {
        ready: true,
        total: summary.total,
        passed: summary.passed,
        cases: summary.results.map((r) => ({ caseId: r.caseId, decision: r.decision, passed: r.passed }))
      };
    })()`);
    assert.equal(treasureAudit.ready, true, 'exploration demo must expose the treasure decision audit');
    assert.equal(treasureAudit.total, 3, 'treasure audit must cover hidden, near and far cases');
    assert.equal(treasureAudit.passed, 3, 'all permanent-treasure decision cases must pass in the browser');
    const hiddenCase = treasureAudit.cases.find((c) => c.caseId === 'treasure-hidden');
    const nearCase = treasureAudit.cases.find((c) => c.caseId === 'treasure-near');
    const farCase = treasureAudit.cases.find((c) => c.caseId === 'treasure-far');
    assert.equal(hiddenCase.decision, 'frontier', 'an unrevealed treasure must not divert the route');
    assert.equal(nearCase.decision, 'chest-approach', 'a revealed 120px treasure must trigger a detour');
    assert.equal(farCase.decision, 'frontier', 'a revealed distant treasure must keep the frontier leg');

    await cdp.navigate(BASE + 'tech-demos/map-effects/map-effects.html?seed=89ABCDEF&region=lavacave');
    const demo = await cdp.evaluate(`(() => {
      const ids = [
        'prev-region', 'regenerate', 'next-region', 'seed-input',
        'seed-random', 'profile-select', 'motion-toggle', 'verify-determinism'
      ];
      const within = ids.every((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.width > 0;
      });
      const canvas = document.getElementById('stage');
      const minimap = document.getElementById('minimap');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const miniPixels = minimap.getContext('2d').getImageData(0, 0, minimap.width, minimap.height).data;
      const colors = new Set();
      const explorationIds = Object.keys(Game.EXPLORATION_SPRITES?.assets || {});
      for (let i = 0; i < pixels.length; i += Math.max(4, Math.floor(pixels.length / 1000 / 4) * 4)) {
        colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
      }
      const miniPainted = Array.from(miniPixels).some((value, index) => index % 4 !== 3 && value !== 0);
      const snapshot = MapGenerationLab.snapshot();
      const catalog = MapGenerationLab.catalog();
      const catalogScope = document.getElementById('catalog-scope');
      const defaultCatalogScope = catalogScope.value;
      const regionCatalogIndexes = Array.from(document.querySelectorAll('[data-catalog-index]'))
        .map((button) => Number(button.dataset.catalogIndex));
      const regionCatalog = regionCatalogIndexes.map((index) => catalog[index]);
      const categoryValues = Array.from(document.getElementById('catalog-category').options)
        .map((option) => option.value);
      catalogScope.value = 'all';
      catalogScope.dispatchEvent(new Event('change', { bubbles: true }));
      const allCatalogCount = document.querySelectorAll('[data-catalog-index]').length;
      catalogScope.value = 'region';
      catalogScope.dispatchEvent(new Event('change', { bubbles: true }));
      const regionGroupCategories = Array.from(document.querySelectorAll('[data-catalog-group]'))
        .map((group) => group.dataset.catalogGroup);
      const groupsAreExact = Array.from(document.querySelectorAll('[data-catalog-group]'))
        .every((group) => Array.from(group.querySelectorAll('[data-catalog-index]'))
          .every((button) => catalog[Number(button.dataset.catalogIndex)].category === group.dataset.catalogGroup));
      const categorySelect = document.getElementById('catalog-category');
      categorySelect.value = 'decor-blocker';
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
      const exactDecorationFilter = Array.from(document.querySelectorAll('[data-catalog-index]'))
        .every((button) => catalog[Number(button.dataset.catalogIndex)].category === 'decor-blocker') &&
        document.querySelectorAll('[data-catalog-group]').length === 1;
      categorySelect.value = 'all';
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
      const actorDefinitions = Game.content.all('actorArchetype')
        .filter((definition) => definition.category !== 'player');
      return {
        seed: document.getElementById('seed-input').value,
        region: Game.world.region.id,
        layoutVersion: Game.world.layout.version,
        world: [Game.world.layout.world.w, Game.world.layout.world.h],
        v3TerrainLoaded: !!document.querySelector('script[src*="systems/terrain_v3.js"]'),
        rects: Object.fromEntries(ids.map((id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return [id, [r.left, r.top, r.right, r.bottom, r.width]];
        })),
        within,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        canvasColors: colors.size,
        miniPainted,
        explorationAssetCount: explorationIds.length,
        explorationAssetsRegistered: explorationIds.every((id) => Game.assets.has(id)),
        explorationScriptCount: document.querySelectorAll('script[src*="sprites/exploration/"]').length,
        snapshot,
        api: Object.keys(MapGenerationLab).sort(),
        defaultCatalogScope,
        regionCatalogCount: regionCatalog.length,
        allCatalogCount,
        regionCatalogOnly: regionCatalog.every((item) => item && item.inRegion),
        currentActorsCataloged: snapshot.actors.every((actor) =>
          catalog.some((item) => item.kind === 'actor-definition' &&
            item.id === actor.archetypeId && item.inRegion)),
        currentCatalogCategories: Array.from(new Set(regionCatalog.map((item) => item.category))),
        regionGroupCategories,
        groupsAreExact,
        exactDecorationFilter,
        categoryValues,
        currentChestDefinitions: regionCatalog.filter((item) => item.category === 'chest')
          .map((item) => [item.id, item.count]),
        actorCatalogCount: catalog.filter((item) => item.kind === 'actor-definition').length,
        registryActorCount: actorDefinitions.length,
        playerCataloged: catalog.some((item) => item.id === 'adventurer'),
        regionTabsMatch: document.querySelectorAll('[data-region-index]').length === Game.reg.all('region').length,
        controlsTouchable: ids.every((id) => {
          const control = document.getElementById(id);
          const target = control.type === 'checkbox' ? control.closest('label') : control;
          return target.getBoundingClientRect().height >= 44;
        }),
        noForbiddenSystems: [
          'systems/combat.js', 'systems/hazards.js', 'systems/environment.js',
          'systems/exploration.js', 'systems/expedition.js', 'systems/trade.js'
        ].every((needle) => !Array.from(document.scripts).some((script) => script.src.includes(needle)))
      };
    })()`);
    assert.equal(demo.seed, '89ABCDEF');
    assert.equal(demo.region, 'lavacave');
    assert.equal(demo.layoutVersion, 4);
    assert.deepEqual(demo.world, [2400, 1440]);
    assert.equal(demo.v3TerrainLoaded, true);
    assert.equal(demo.within, true, 'mobile QA toolbar controls fit viewport');
    assert.equal(demo.noHorizontalOverflow, true, 'mobile QA page has no horizontal overflow');
    assert.ok(demo.canvasColors > 20, 'QA canvas is nonblank: ' + JSON.stringify({ demo, errors: cdp.errors }));
    assert.equal(demo.miniPainted, true, 'interactive minimap canvas is nonblank');
    assert.equal(demo.explorationAssetCount, 18, 'split exploration manifest covers every source cell');
    assert.equal(demo.explorationAssetsRegistered, true, 'all split exploration assets reach the production registry');
    assert.equal(demo.explorationScriptCount, 10, 'manifest and nine exploration groups load independently');
    assert.equal(demo.snapshot.noPlayer, true);
    assert.equal(demo.snapshot.fogEnabled, false);
    assert.equal(demo.snapshot.runtimeHazards, false);
    assert.equal(demo.snapshot.minimap.hasPlayerIcon, false);
    assert.ok(demo.snapshot.actors.length > 0);
    assert.equal(demo.defaultCatalogScope, 'region');
    assert.equal(demo.regionCatalogOnly, true);
    assert.ok(demo.regionCatalogCount < demo.allCatalogCount,
      'current-map catalog is narrower than the complete cross-map registry');
    assert.equal(demo.currentActorsCataloged, true);
    for (const category of [
      'monster', 'boss', 'npc', 'creature', 'summon', 'object',
      'resource', 'chest', 'landmark', 'boss-lair', 'curio', 'ecology',
      'threat', 'hazard-definition', 'hazard-anchor', 'camp',
      'decor-blocker', 'decor-ground', 'decor-water', 'decor-boss',
      'tuft', 'flower', 'material'
    ]) assert.ok(demo.categoryValues.includes(category), `catalog exposes ${category} filter`);
    for (const category of [
      'monster', 'boss', 'summon', 'resource', 'chest', 'landmark', 'boss-lair',
      'curio', 'ecology', 'threat', 'hazard-definition', 'hazard-anchor', 'camp',
      'decor-blocker', 'decor-ground', 'decor-boss', 'material'
    ]) assert.ok(demo.currentCatalogCategories.includes(category),
      `lavacave current-map catalog contains ${category}`);
    assert.deepEqual(demo.regionGroupCategories, demo.currentCatalogCategories,
      'all-category view renders one ordered section per exact category');
    assert.equal(demo.groupsAreExact, true,
      'each category section contains only its own type');
    assert.equal(demo.exactDecorationFilter, true,
      'a decoration subtype filter cannot leak other decoration types');
    assert.deepEqual(demo.currentChestDefinitions, [
      ['chest_common', 0], ['chest_rare', 0]
    ], 'chests remain definition-only in the no-runtime-chest Lab');
    assert.equal(demo.actorCatalogCount, demo.registryActorCount);
    assert.equal(demo.playerCataloged, false);
    assert.equal(demo.regionTabsMatch, true);
    assert.equal(demo.controlsTouchable, true);
    assert.equal(demo.noForbiddenSystems, true);
    for (const method of [
      'catalog', 'focus', 'logs', 'measure', 'probe', 'randomize', 'regenerate',
      'resetPositions', 'setCamera', 'setLayer', 'setMotion', 'snapshot',
      'verifyDeterminism'
    ]) assert.ok(demo.api.includes(method), `MapGenerationLab exposes ${method}`);

    const mapDiagnostics = await cdp.evaluate(`(() => {
      const before = MapGenerationLab.snapshot();
      const camp = Game.world.layout.camp;
      const boss = Game.world.layout.bossPoint;
      const measure = MapGenerationLab.measure(camp, boss);
      const verify = MapGenerationLab.verifyDeterminism();
      MapGenerationLab.setCamera(camp.x, camp.y, 1);
      const viewAtOne = MapGenerationLab.snapshot().minimap.viewport;
      MapGenerationLab.setCamera(camp.x, camp.y, 2);
      const viewAtTwo = MapGenerationLab.snapshot().minimap.viewport;
      const plan = before.populationPlan;
      const first = plan.slots[0];
      const inspected = Game.population.inspectCandidates(
        first.profileId, Game.world.layout, first.channel,
        {
          tier: Game.world.region.tier,
          worldSeed: before.seed,
          expeditionIndex: 0,
          channelLimits: {
            regular: Game.world.layout.threats.length,
            npc: 1, guardian: 1, boss: 1, rare: 0
          }
        },
        []
      );
      const chosen = inspected.candidates[inspected.chosenIndex]?.candidate;
      const placedActor = before.actors.find((actor) => actor.slotId === first.id);
      MapGenerationLab.setMotion(true);
      MapGenerationLab.setMotion(false);
      const reset = MapGenerationLab.snapshot();
      return {
        measure,
        verify,
        viewportRatio: viewAtOne.width / viewAtTwo.width,
        candidateMatchesPlan: !!chosen &&
          Math.abs(chosen.x - first.x) < 0.001 && Math.abs(chosen.y - first.y) < 0.001,
        actorWalkable: reset.actors.every((actor) =>
          Game.terrain.isWalkable(actor.x, actor.y, Math.min(6,
            Game.actors.get(actor.id).components.body.collisionRadius || 1))),
        actorReset: reset.actors.every((actor) =>
          actor.x === actor.spawnX && actor.y === actor.spawnY),
        noPlayer: !Game.world.hero && !reset.actors.some((actor) => actor.category === 'player'),
        logsStructured: MapGenerationLab.logs().every((entry) =>
          entry.at && entry.phase && entry.level && typeof entry.message === 'string')
      };
    })()`);
    assert.equal(mapDiagnostics.measure.found, true, 'path tool uses a production route');
    assert.ok(mapDiagnostics.measure.pathLength >= mapDiagnostics.measure.straightDistance);
    assert.equal(mapDiagnostics.verify.ok, true);
    assert.equal(mapDiagnostics.verify.terrain.match, true);
    assert.equal(mapDiagnostics.verify.population.match, true);
    assert.equal(mapDiagnostics.verify.actors.match, true);
    assert.ok(Math.abs(mapDiagnostics.viewportRatio - 2) < 0.05,
      'minimap viewport shrinks in inverse proportion to main-map zoom');
    assert.equal(mapDiagnostics.candidateMatchesPlan, true,
      'production candidate inspection agrees with the prepared plan');
    assert.equal(mapDiagnostics.actorWalkable, true);
    assert.equal(mapDiagnostics.actorReset, true);
    assert.equal(mapDiagnostics.noPlayer, true);
    assert.equal(mapDiagnostics.logsStructured, true);
    assert.deepEqual(cdp.errors, [], 'browser runtime has no uncaught errors');

    const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshot = path.join(os.tmpdir(), 'firpg-demo-mobile-cdp.png');
    fs.writeFileSync(screenshot, Buffer.from(capture.data, 'base64'));

    await cdp.navigate(BASE + 'tech-demos/units/units.html?scenario=overlap&lang=en');
    const unitsBubbleDemo = await cdp.evaluate(`(() => {
      const api = Game.unitsBubbleDemo;
      const sceneButtons = Array.from(document.querySelectorAll('[data-bubble-scene]'));
      const walkButtons = Array.from(document.querySelectorAll('[data-bubble-walk]'));
      const walks = ['l', 'r', 'vertical'].map((id) => ({
        id,
        layouts: api.setWalkScene(id),
        active: document.querySelector('[data-bubble-walk="' + id + '"]').classList.contains('active')
      }));
      const scenes = ['center', 'left', 'right'].map((id) => {
        const layouts = api.setScene(id);
        return {
          id,
          layouts,
          active: document.querySelector('[data-bubble-scene="' + id + '"]').classList.contains('active')
        };
      });
      const mmoButton = document.getElementById('mmo-audit');
      const buttons = sceneButtons.concat(walkButtons, [mmoButton]);
      return {
        catalog: api.catalog(),
        snapshot: api.snapshot(),
        mmoAudit: api.mmoAggroAudit(),
        walks,
        scenes,
        locale: document.documentElement.lang,
        sceneLabels: sceneButtons.map((button) => button.textContent.trim()),
        walkLabels: walkButtons.map((button) => button.textContent.trim()),
        allControlsTouchable: buttons.every((button) => button.getBoundingClientRect().height >= 44),
        allControlsWithinViewport: buttons.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        }),
        sourceLoaded: !!document.querySelector('script[src*="systems/action_bubbles.js"]'),
        aggroSourceLoaded: !!document.querySelector('script[src*="systems/world_aggro.js"]'),
        portraitSourceLoaded: !!document.querySelector('script[src*="ui/combat_portraits.js"]'),
        portraits: api.portraits(),
        status: document.getElementById('bubble-status').textContent,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    console.log('units bubble diagnostics:', JSON.stringify(unitsBubbleDemo));
    assert.equal(unitsBubbleDemo.catalog.complete, true);
    assert.equal(unitsBubbleDemo.catalog.actorCount, 74);
    assert.equal(unitsBubbleDemo.catalog.classCount, 5);
    assert.equal(unitsBubbleDemo.catalog.monsterCount, 57);
    assert.equal(unitsBubbleDemo.catalog.summonCount, 9);
    assert.equal(unitsBubbleDemo.catalog.encounterCount, 26);
    assert.match(unitsBubbleDemo.catalog.fingerprint, /^[0-9a-f]{8}$/);
    assert.equal(unitsBubbleDemo.snapshot.length, 2,
      'units QA must expose both anchors: ' + JSON.stringify(unitsBubbleDemo));
    assert.equal(new Set(unitsBubbleDemo.snapshot.map((bubble) => bubble.anchorId)).size, 2,
      'units QA keeps hero and monster bubble anchors independent');
    assert.ok(unitsBubbleDemo.snapshot.some((bubble) => bubble.entityKind === 'hero'));
    assert.ok(unitsBubbleDemo.snapshot.some((bubble) => bubble.entityKind === 'monster'));
    assert.deepEqual(unitsBubbleDemo.walks.map((walk) => [
      walk.id, walk.layouts[0].mode, walk.layouts[0].side
    ]), [
      ['l', 'side', 'right'],
      ['r', 'side', 'left'],
      ['vertical', 'above', null]
    ], 'movement bubbles stay behind horizontal facing and above vertical facing');
    assert.ok(unitsBubbleDemo.walks.every((walk) =>
      walk.active && walk.layouts.length === 1 && walk.layouts[0].withinViewport &&
      !walk.layouts[0].overlapsHealthBar));
    assert.ok(unitsBubbleDemo.scenes.every((scene) => scene.layouts.length === 2));
    assert.ok(unitsBubbleDemo.scenes.every((scene) => scene.layouts.every((layout) =>
      layout.mode === 'side' && layout.healthBar && !layout.overlapsHealthBar && layout.withinViewport &&
      layout.tail.y + layout.tail.h > layout.body.y + layout.body.h)),
    'diagonal engagement bubbles avoid visible health bars and viewport edges: ' + JSON.stringify(unitsBubbleDemo.scenes));
    assert.ok(unitsBubbleDemo.scenes.every((scene) => scene.active));
    assert.equal(unitsBubbleDemo.locale, 'en');
    assert.deepEqual(unitsBubbleDemo.sceneLabels,
      ['Vertical encounter', 'Left edge flip', 'Right edge flip']);
    assert.deepEqual(unitsBubbleDemo.walkLabels,
      ['Walk left', 'Walk right', 'Walk vertically']);
    assert.equal(unitsBubbleDemo.allControlsTouchable, true);
    assert.equal(unitsBubbleDemo.allControlsWithinViewport, true);
    assert.equal(unitsBubbleDemo.sourceLoaded, true);
    assert.equal(unitsBubbleDemo.aggroSourceLoaded, true);
    assert.equal(unitsBubbleDemo.mmoAudit.passed, true);
    assert.equal(unitsBubbleDemo.mmoAudit.checks.length, 9);
    assert.equal(unitsBubbleDemo.mmoAudit.encounter.assistPackIds.length, 1);
    assert.equal(unitsBubbleDemo.mmoAudit.encounter.leashZones.length, 2);
    assert.equal(unitsBubbleDemo.portraitSourceLoaded, true);
    assert.equal(unitsBubbleDemo.portraits.ally.mode, 'dedicated-portrait');
    assert.equal(unitsBubbleDemo.portraits.enemy.mode, 'sprite-portrait');
    assert.ok(unitsBubbleDemo.portraits.ally.opaquePixels > 100);
    assert.ok(unitsBubbleDemo.portraits.enemy.opaquePixels > 100);
    assert.equal(unitsBubbleDemo.portraits.ally.withinCard, true);
    assert.equal(unitsBubbleDemo.portraits.enemy.withinCard, true);
    assert.equal(unitsBubbleDemo.noHorizontalOverflow, true);
    assert.deepEqual(cdp.errors, [], 'units bubble QA has no browser errors');
    const unitsBubbleCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const unitsBubbleScreenshot = path.join(os.tmpdir(), 'firpg-units-bubbles-mobile-cdp.png');
    fs.writeFileSync(unitsBubbleScreenshot, Buffer.from(unitsBubbleCapture.data, 'base64'));

    // 真正走完“通关摘要 → 重开确认 → 页面重载 → 序章 → 新角色”。
    // 这能捕获删档后又被 pagehide/beforeunload 自动存档写回的竞态。
    await cdp.navigate(BASE);
    const restartBefore = await cdp.evaluate(`(() => {
      if (!Game.player.hasClass()) Game.player.setClass('fighter');
      Game.state.meta.prologueDone = true;
      Game.state.meta.completedAt = Date.now();
      Game.state.meta.endingAcknowledged = false;
      Game.state.meta.endingPhase = 'summary';
      Game.state.meta.endingLine = 5;
      Game.save.save('restart-browser-fixture');
      Game.ending.restorePending();
      document.getElementById('ending-restart').click();
      const mask = document.querySelector('#modal-root .modal-mask');
      return {
        createdAt: Game.state.createdAt,
        summary: !!document.getElementById('ending-root'),
        confirm: !!mask,
        mainSave: !!localStorage.getItem('firpg_save'),
        backupSave: !!localStorage.getItem('firpg_save_backup')
      };
    })()`);
    assert.equal(restartBefore.summary, true);
    assert.equal(restartBefore.confirm, true);
    assert.equal(restartBefore.mainSave, true);
    assert.equal(restartBefore.backupSave, true);

    const restartedLoad = cdp.event('Page.loadEventFired');
    await cdp.evaluate(`(() => {
      const yes = document.querySelector('#modal-root .modal-mask .modal-btns .btn.gold');
      if (!yes) throw new Error('restart confirmation button missing');
      setTimeout(() => yes.click(), 0);
      return true;
    })()`);
    await restartedLoad;
    await delay(500);
    const restartTitle = await cdp.evaluate(`(() => ({
      titleVisible: !!document.getElementById('title-root'),
      classVisible: !!document.getElementById('class-root'),
      endingGone: !document.getElementById('ending-root'),
      hasClass: Game.player.hasClass(),
      prologueDone: Game.state.meta.prologueDone,
      completedAt: Game.state.meta.completedAt,
      createdAt: Game.state.createdAt,
      mainSaveAbsent: localStorage.getItem('firpg_save') === null,
      backupSaveAbsent: localStorage.getItem('firpg_save_backup') === null
    }))()`);
    assert.equal(restartTitle.titleVisible, true, 'confirmed restart returns to the title screen');
    assert.equal(restartTitle.classVisible, false);
    assert.equal(restartTitle.endingGone, true);
    assert.equal(restartTitle.hasClass, false);
    assert.equal(restartTitle.prologueDone, false);
    assert.equal(restartTitle.completedAt, null);
    assert.notEqual(restartTitle.createdAt, restartBefore.createdAt);
    assert.equal(restartTitle.mainSaveAbsent, true, 'reset stays deleted until the player starts');
    assert.equal(restartTitle.backupSaveAbsent, true, 'reset backup stays deleted until the player starts');
    const restartTitleCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const restartTitleScreenshot = path.join(os.tmpdir(), 'firpg-restart-title-mobile-cdp.png');
    fs.writeFileSync(restartTitleScreenshot, Buffer.from(restartTitleCapture.data, 'base64'));

    const restartClassSelect = await cdp.evaluate(`(async () => {
      document.querySelector('#title-root .title-reveal').click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      document.querySelector('#title-root .title-start').click();
      await new Promise((resolve) => setTimeout(resolve, 1400));
      const story = document.querySelector('.prologue-mask');
      if (!story) throw new Error('prologue did not open after the archive transition');
      for (let i = 0; i < 10; i++) story.click();
      const root = document.getElementById('class-root');
      return {
        titleVisible: !!document.getElementById('title-root'),
        classVisible: !!root,
        classCount: root ? Game.reg.all('class').length : 0,
        confirmButton: !!root?.querySelector('.cs-confirm'),
        prologueDone: Game.state.meta.prologueDone,
        mainDraft: !!localStorage.getItem('firpg_save'),
        backupDraft: !!localStorage.getItem('firpg_save_backup')
      };
    })()`);
    assert.equal(restartClassSelect.titleVisible, true);
    assert.equal(restartClassSelect.classVisible, true, 'new character creation opens after the fresh prologue');
    assert.ok(restartClassSelect.classCount >= 5);
    assert.equal(restartClassSelect.confirmButton, true);
    assert.equal(restartClassSelect.prologueDone, true);
    assert.equal(restartClassSelect.mainDraft, true, 'clicking Start creates the main draft save');
    assert.equal(restartClassSelect.backupDraft, true, 'clicking Start creates the backup draft save');
    const restartClassCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const restartClassScreenshot = path.join(os.tmpdir(), 'firpg-restart-class-select-mobile-cdp.png');
    fs.writeFileSync(restartClassScreenshot, Buffer.from(restartClassCapture.data, 'base64'));

    await cdp.evaluate(`(() => {
      document.querySelector('#class-root .cs-confirm').click();
      document.querySelector('#modal-root .modal-mask .modal-btns .btn.gold').click();
      return true;
    })()`);
    await delay(850);
    const restartCompleted = await cdp.evaluate(`(() => {
      const saved = JSON.parse(localStorage.getItem('firpg_save'));
      const backup = JSON.parse(localStorage.getItem('firpg_save_backup'));
      const savedActor = saved.roster.actors[saved.roster.primaryActorId];
      const backupActor = backup.roster.actors[backup.roster.primaryActorId];
      return {
        hasClass: Game.player.hasClass(),
        classId: Game.state.player.classId,
        titleGone: !document.getElementById('title-root'),
        classGone: !document.getElementById('class-root'),
        saveMatches: savedActor.classId === Game.state.player.classId,
        backupMatches: backupActor.classId === Game.state.player.classId,
        endingCleared: saved.meta.completedAt === null && backup.meta.completedAt === null,
        savedTs: saved.ts
      };
    })()`);
    assert.equal(restartCompleted.hasClass, true);
    assert.equal(restartCompleted.titleGone, true);
    assert.equal(restartCompleted.classGone, true);
    assert.equal(restartCompleted.saveMatches, true);
    assert.equal(restartCompleted.backupMatches, true);
    assert.equal(restartCompleted.endingCleared, true);

    // 正式档刷新后必须先回到档案门厅，不可直进游戏、覆盖离线时间或推进世界。
    const existingReloaded = cdp.event('Page.loadEventFired');
    await cdp.send('Page.reload', { ignoreCache: true });
    await existingReloaded;
    await delay(520);
    const existingTitle = await cdp.evaluate(`(() => {
      const root = document.getElementById('title-root');
      root?.querySelector('.title-reveal')?.click();
      const slot = root?.querySelector('[data-slot-id="expedition-1"]');
      const newGame = root?.querySelector('.title-new-game');
      const deleteButton = slot?.parentNode.querySelector('.slot-delete');
      const portrait = slot?.querySelector('canvas');
      const portraitFrame = Game.assets.sprite('face_' + Game.state.player.classId)?.frames.icon;
      const stored = JSON.parse(localStorage.getItem('firpg_save'));
      const beforeSaveTs = stored.ts;
      const beforeWorldTime = Game.state.world.worldTime;
      Game.loop.catchup(90);
      const afterWorldTime = Game.state.world.worldTime;
      newGame?.click();
      const modal = document.querySelector('#modal-root .modal-mask');
      const destructiveCopy = modal?.querySelector('.modal-body')?.textContent || '';
      const newGameHeight = newGame?.getBoundingClientRect().height || 0;
      modal?.querySelector('.modal-btns .btn:not(.gold)')?.click();
      deleteButton?.click();
      const deleteModal = document.querySelector('#modal-root .modal-mask');
      const deleteCopy = deleteModal?.querySelector('.modal-body')?.textContent || '';
      const deleteHeight = deleteButton?.getBoundingClientRect().height || 0;
      deleteModal?.querySelector('.modal-btns .btn:not(.gold)')?.click();
      const afterSaveTs = JSON.parse(localStorage.getItem('firpg_save')).ts;
      const newGameLabelStyle = getComputedStyle(newGame.querySelector('strong'));
      return {
        titleVisible: !!root,
        entryState: Game.entryState,
        kind: slot?.getAttribute('data-slot-kind'),
        action: slot?.querySelector('.slot-action span')?.textContent,
        heroPixels: slot ? Array.from(portrait.getContext('2d')
          .getImageData(0, 0, 56, 56).data).filter((v, i) => i % 4 === 3 && v > 0).length : 0,
        portraitMode: portrait?.getAttribute('data-portrait-mode'),
        portraitSourceFits: !!portraitFrame && portraitFrame.width * 3 <= 44 && portraitFrame.height * 3 <= 44,
        hasNewGame: !!newGame && !newGame.hidden,
        newGameText: newGame?.querySelector('strong')?.textContent,
        newGameSub: newGame?.querySelector('small')?.textContent,
        newGameHeight,
        newGameFontSize: parseFloat(newGameLabelStyle.fontSize),
        deleteVisible: !!deleteButton,
        deleteHeight,
        deleteLabel: deleteButton?.getAttribute('aria-label'),
        deleteCopy,
        destructiveCopy,
        confirmationShown: !!modal,
        beforeSaveTs,
        afterSaveTs,
        beforeWorldTime,
        afterWorldTime,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(existingTitle.titleVisible, true, 'existing saves return to the archive lobby');
    assert.equal(existingTitle.entryState, 'menu');
    assert.equal(existingTitle.kind, 'active');
    assert.equal(existingTitle.action, '继续游戏');
    assert.ok(existingTitle.heroPixels > 200, 'active save renders its class portrait');
    assert.equal(existingTitle.portraitMode, 'face', 'save slot uses the dedicated uncropped class portrait');
    assert.equal(existingTitle.portraitSourceFits, true, 'portrait source fits inside the safe 44px area');
    assert.equal(existingTitle.hasNewGame, true);
    assert.equal(existingTitle.newGameText, '开始新游戏');
    assert.equal(existingTitle.newGameSub, '将覆盖当前档案');
    assert.ok(existingTitle.newGameHeight >= 44);
    assert.ok(existingTitle.newGameFontSize >= 11);
    assert.ok(existingTitle.destructiveCopy.includes('覆盖当前进行中的单档'));
    assert.equal(existingTitle.confirmationShown, true);
    assert.equal(existingTitle.deleteVisible, true);
    assert.ok(existingTitle.deleteHeight >= 44);
    assert.equal(existingTitle.deleteLabel, '删除此存档');
    assert.ok(existingTitle.deleteCopy.includes('永久清除角色'));
    assert.equal(existingTitle.beforeSaveTs, existingTitle.afterSaveTs, 'archive preview does not overwrite the save timestamp');
    assert.equal(existingTitle.beforeWorldTime, existingTitle.afterWorldTime, 'archive preview keeps the world frozen');
    assert.equal(existingTitle.noHorizontalOverflow, true);
    const existingTitleCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const existingTitleScreenshot = path.join(os.tmpdir(), 'firpg-title-existing-save-mobile-cdp.png');
    fs.writeFileSync(existingTitleScreenshot, Buffer.from(existingTitleCapture.data, 'base64'));

    const entryStarted = await cdp.evaluate(`(() => {
      const slot = document.querySelector('#title-root [data-slot-id="expedition-1"]');
      slot.click();
      return {
        entering: document.getElementById('title-root')?.classList.contains('is-entering'),
        selected: slot.classList.contains('selected'),
        state: Game.entryState,
        disabled: slot.disabled
      };
    })()`);
    assert.equal(entryStarted.entering, true);
    assert.equal(entryStarted.selected, true);
    assert.equal(entryStarted.state, 'opening');
    assert.equal(entryStarted.disabled, true);
    await delay(380);
    const entryMid = await cdp.evaluate(`(() => {
      const root = document.getElementById('title-root');
      const fx = root?.querySelector('.title-entry-fx');
      const crest = fx?.querySelector('.entry-crest');
      const crestPixels = crest ? Array.from(
        crest.getContext('2d').getImageData(0, 0, crest.width, crest.height).data
      ).filter((value, index) => index % 4 === 3 && value > 0).length : 0;
      return {
        entering: root?.classList.contains('is-entering'),
        fxVisible: fx ? getComputedStyle(fx).visibility === 'visible' : false,
        entryCopy: fx?.querySelector('.entry-copy')?.textContent || '',
        crestReady: crest?.getAttribute('data-crest-ready') === 'true',
        crestPixels,
        ringLayers: fx?.querySelectorAll('.entry-ring').length || 0,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    })()`);
    assert.equal(entryMid.entering, true);
    assert.equal(entryMid.fxVisible, true);
    assert.equal(entryMid.entryCopy, '正在同步远征档案');
    assert.equal(entryMid.crestReady, true);
    assert.ok(entryMid.crestPixels > 400, 'guild crest is rendered inside the entry seal');
    assert.equal(entryMid.ringLayers, 3);
    assert.equal(entryMid.noHorizontalOverflow, true);
    const entryCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const entryScreenshot = path.join(os.tmpdir(), 'firpg-title-entry-transition-mobile-cdp.png');
    fs.writeFileSync(entryScreenshot, Buffer.from(entryCapture.data, 'base64'));
    await delay(1500);
    const resumedFromArchive = await cdp.evaluate(`(() => ({
      entryState: Game.entryState,
      titleGone: !document.getElementById('title-root'),
      hasClass: Game.player.hasClass(),
      offlineModal: !!document.querySelector('#modal-root .offline-lines')
    }))()`);
    assert.equal(resumedFromArchive.entryState, 'active');
    assert.equal(resumedFromArchive.titleGone, true);
    assert.equal(resumedFromArchive.hasClass, true);
    assert.equal(resumedFromArchive.offlineModal, false);

    // 单槽覆盖确认后完整清档，并自动衔接“开始新游戏”的入场动画与序章。
    const beforeReplaceCreatedAt = await cdp.evaluate(`Game.state.createdAt`);
    const replaceReloaded = cdp.event('Page.loadEventFired');
    await cdp.send('Page.reload', { ignoreCache: true });
    await replaceReloaded;
    await delay(420);
    const replaceTriggered = cdp.event('Page.loadEventFired');
    await cdp.evaluate(`(() => {
      document.querySelector('#title-root .title-new-game').click();
      const yes = document.querySelector('#modal-root .modal-mask .modal-btns .btn.gold');
      if (!yes) throw new Error('new game overwrite confirmation missing');
      yes.click();
      return true;
    })()`);
    await replaceTriggered;
    await delay(1580);
    const replacedWithFresh = await cdp.evaluate(`(() => ({
      createdAt: Game.state.createdAt,
      hasClass: Game.player.hasClass(),
      entryState: Game.entryState,
      titleVisible: !!document.getElementById('title-root'),
      prologueVisible: !!document.querySelector('.prologue-mask'),
      mainDraft: !!localStorage.getItem('firpg_save'),
      backupDraft: !!localStorage.getItem('firpg_save_backup'),
      autoStartFlagCleared: sessionStorage.getItem('firpg_start_new') === null
    }))()`);
    assert.notEqual(replacedWithFresh.createdAt, beforeReplaceCreatedAt);
    assert.equal(replacedWithFresh.hasClass, false);
    assert.equal(replacedWithFresh.entryState, 'opening');
    assert.equal(replacedWithFresh.titleVisible, true);
    assert.equal(replacedWithFresh.prologueVisible, true);
    assert.equal(replacedWithFresh.mainDraft, true);
    assert.equal(replacedWithFresh.backupDraft, true);
    assert.equal(replacedWithFresh.autoStartFlagCleared, true);

    // X 删除只清空当前档案并回到空槽，不自动开启新旅程。
    const deleteDraftReloaded = cdp.event('Page.loadEventFired');
    await cdp.send('Page.reload', { ignoreCache: true });
    await deleteDraftReloaded;
    await delay(420);
    const deleteConfirmedReload = cdp.event('Page.loadEventFired');
    await cdp.evaluate(`(() => {
      document.querySelector('#title-root .title-reveal')?.click();
      const del = document.querySelector('#title-root .slot-delete');
      if (!del) throw new Error('delete save button missing');
      del.click();
      const yes = document.querySelector('#modal-root .modal-mask .modal-btns .btn.gold');
      if (!yes) throw new Error('delete save confirmation missing');
      yes.click();
      return true;
    })()`);
    await deleteConfirmedReload;
    await delay(520);
    const deletedToEmpty = await cdp.evaluate(`(() => ({
      entryState: Game.entryState,
      slotKind: document.querySelector('#title-root [data-slot-id="expedition-1"]')
        ?.getAttribute('data-slot-kind'),
      deleteGone: !document.querySelector('#title-root .slot-delete'),
      mainGone: localStorage.getItem('firpg_save') === null,
      backupGone: localStorage.getItem('firpg_save_backup') === null,
      noAutoStart: sessionStorage.getItem('firpg_start_new') === null &&
        !document.querySelector('.prologue-mask')
    }))()`);
    assert.equal(deletedToEmpty.entryState, 'menu');
    assert.equal(deletedToEmpty.slotKind, 'empty');
    assert.equal(deletedToEmpty.deleteGone, true);
    assert.equal(deletedToEmpty.mainGone, true);
    assert.equal(deletedToEmpty.backupGone, true);
    assert.equal(deletedToEmpty.noAutoStart, true);

    await cdp.evaluate(`(() => {
      Game.BUILD_ID = 'browser-stale-build';
      Game.updateChecker.check();
    })()`);
    let updateNotice = { visible: false };
    for (let attempt = 0; attempt < 20 && !updateNotice.visible; attempt++) {
      await delay(200);
      updateNotice = await cdp.evaluate(`(() => {
        const notice = document.getElementById('app-update-notice');
        if (!notice) return { visible: false };
        const rect = notice.getBoundingClientRect();
        return {
          visible: getComputedStyle(notice).visibility === 'visible',
          height: rect.height,
          withinViewport: rect.left >= 0 && rect.right <= innerWidth,
          build: Game.updateChecker.availableBuild(),
          copy: notice.textContent.trim()
        };
      })()`);
    }
    assert.equal(updateNotice.visible, true, 'a stale long-running tab receives an update action');
    assert.ok(updateNotice.height >= 44, 'the update action keeps a touch target');
    assert.equal(updateNotice.withinViewport, true, 'the update action fits the mobile viewport');
    assert.equal(updateNotice.build, BUILD_ID);
    assert.ok(updateNotice.copy.includes(BUILD_ID));
    assert.deepEqual(cdp.errors, [], 'browser runtime has no uncaught errors after restart');

    console.log('Browser smoke passed: ' + JSON.stringify({
      titleScene, titleArchiveReveal, titleShortView, titleShortArchive, englishTitleFit,
      titleScreenshot, titleTallScreenshot, titleShortScreenshot, main,
      combatHudFixture, combatHudLayouts, combatHudScreenshot,
      v3CampVisual, v3ResourceVisual, v3DepletedVisual, v3MineResourceVisual,
      v3Navigation, v3AutoActions, actionBubbleVisual, enemyBubbleVisual, v3ForestVisual,
      v3CampScreenshot, v3ResourceScreenshot, v3DepletedScreenshot,
      v3MineResourceScreenshot, actionBubbleScreenshot, enemyBubbleScreenshot,
      v3ForestScreenshot, worldChecks,
      v111Checks, v111Screenshot,
      campStateScreenshots, englishCampFit, transitionChecks, transitionScreenshots,
      endingChecks, densityChecks, desktop, desktopTransition,
      desktopEnding, weatherDemo, weatherDesktop, demo, mapDiagnostics, unitsBubbleDemo,
      mainScreenshot, densityScreenshots, desktopScreenshot,
      desktopEndingScreenshot, screenshot, restartBefore, restartTitle, restartClassSelect,
      unitsBubbleScreenshot,
      restartCompleted, restartTitleScreenshot, restartClassScreenshot, existingTitle,
      existingTitleScreenshot, entryStarted, entryMid, entryScreenshot, resumedFromArchive,
      replacedWithFresh, deletedToEmpty, updateNotice
    }));
    cdp.ws.close();
  } finally {
    if (!chrome.killed) chrome.kill();
    await delay(100);
    if (profile.startsWith(os.tmpdir())) fs.rmSync(profile, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
