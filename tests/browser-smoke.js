'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.FIRPG_URL || 'http://127.0.0.1:4176/';
const BUILD_ID = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).buildId;
const port = 9300 + Math.floor(Math.random() * 400);
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
      const recorded = node.seenAt !== undefined;
      const immediateRejected =
        Game.world.startInteraction({ type: 'gather', target: node }, false) === false;
      const before = Game.state.world.worldTime;
      Game.state.world.worldTime = Math.max(before, node.seenAt) +
        Game.environment.AUTO_GATHER_REVEAL_GRACE + 0.01;
      const afterGraceAccepted =
        Game.world.startInteraction({ type: 'gather', target: node }, false) === true;
      Game.world.cancelInteraction('browser-probe');
      Game.world.setControlMode('manual');
      Game.render.snapCamera(node.x, node.y);
      for (let i = 0; i < 8; i++) Game.render.frame(1 / 60);
      return {
        id: node.id,
        sprite: node.sprite,
        hiddenRejected,
        revealed,
        recorded,
        immediateRejected,
        afterGraceAccepted
      };
    })()`);
    assert.equal(v3ResourceVisual.hiddenRejected, true);
    assert.equal(v3ResourceVisual.revealed, true);
    assert.equal(v3ResourceVisual.recorded, true);
    assert.equal(v3ResourceVisual.immediateRejected, true);
    assert.equal(v3ResourceVisual.afterGraceAccepted, true);
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
        let previousX = hero.x;
        let previousY = hero.y;
        let travelled = 0;
        let still = 0;
        let maxStill = 0;
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
      assert.ok(run.endCoverage > run.startCoverage,
        run.rid + ' auto-expedition reveals new fog: ' + JSON.stringify(run));
    }

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
        exchangeOffersVisible, tradeLockedOnLeave, tradeUnlockedOnReturn,
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
    assert.equal(v111Checks.exchangeOffersVisible, true);
    assert.equal(v111Checks.tradeLockedOnLeave, true);
    assert.equal(v111Checks.tradeUnlockedOnReturn, true);
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
      Game.world.init(finalRid);
      Game.state.player.hp = Game.player.derived().maxHp;
      const retryProgress = Game.State.regionProg(finalRid);
      retryProgress.kills = Game.world.region.killTarget;
      Game.world.trySpawnBoss({ manual: true });
      const voluntaryStarted = !!Game.world.bossEnt;
      Game.world.setMode('rest');
      const voluntary = {
        started: voluntaryStarted,
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
      let warmPixels = 0;
      for (let i = 0; i < pixels.length; i += Math.max(4, Math.floor(pixels.length / 1200 / 4) * 4)) {
        if (pixels[i] > pixels[i + 2] && pixels[i] > 70) warmPixels++;
      }
      return {
        phase: Game.ending.phase(),
        title: document.getElementById('ending-summary-title')?.textContent,
        subtitle: root.querySelector('.ending-summary-heading p')?.textContent,
        statCount: root.querySelectorAll('.ending-stat').length,
        buttons,
        withinViewport: rr.left >= 0 && rr.top >= 0 && rr.right <= innerWidth && rr.bottom <= innerHeight,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        warmPixels,
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
      endingSummary.warmPixels > 0,
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

    await cdp.navigate(BASE + 'tech-demos/map-effects/map-effects.html?seed=89ABCDEF&region=lavacave');
    const demo = await cdp.evaluate(`(() => {
      const ids = [
        'prev-region', 'toggle-play', 'next-region', 'seed-input',
        'focus-gather', 'reset-gather', 'spawn-common-chest', 'spawn-rare-chest'
      ];
      const within = ids.every((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.width > 0;
      });
      const segments = Array.from(document.querySelectorAll('[data-time]')).every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth;
      });
      const canvas = document.getElementById('stage');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      const explorationIds = Object.keys(Game.EXPLORATION_SPRITES?.assets || {});
      for (let i = 0; i < pixels.length; i += Math.max(4, Math.floor(pixels.length / 1000 / 4) * 4)) {
        colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
      }
      return {
        seed: document.getElementById('seed-input').value,
        region: Game.world.region.id,
        rects: Object.fromEntries(ids.concat(['toggle-play', 'next-region']).map((id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return [id, [r.left, r.top, r.right, r.bottom, r.width]];
        })),
        segmentRects: Array.from(document.querySelectorAll('[data-time]')).map((el) => {
          const r = el.getBoundingClientRect();
          return [el.textContent, r.left, r.right, r.width];
        }),
        within,
        segments,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        canvasColors: colors.size,
        explorationAssetCount: explorationIds.length,
        explorationAssetsRegistered: explorationIds.every((id) => Game.assets.has(id)),
        explorationScriptCount: document.querySelectorAll('script[src*="sprites/exploration/"]').length
      };
    })()`);
    assert.equal(demo.seed, '89ABCDEF');
    assert.equal(demo.region, 'lavacave');
    assert.equal(demo.within, true, 'mobile QA toolbar controls fit viewport');
    assert.equal(demo.segments, true, 'mobile QA segmented control fits viewport');
    assert.equal(demo.noHorizontalOverflow, true, 'mobile QA page has no horizontal overflow');
    assert.ok(demo.canvasColors > 20, 'QA canvas is nonblank: ' + JSON.stringify({ demo, errors: cdp.errors }));
    assert.equal(demo.explorationAssetCount, 18, 'split exploration manifest covers every source cell');
    assert.equal(demo.explorationAssetsRegistered, true, 'all split exploration assets reach the production registry');
    assert.equal(demo.explorationScriptCount, 10, 'manifest and nine exploration groups load independently');
    const demoExploration = await cdp.evaluate(`(() => {
      const W = Game.world;
      const nodes = W.layout.nodes;
      const focusButton = document.getElementById('focus-gather');
      focusButton.click();
      const nearest = Math.min(...nodes.map((node) => Game.util.dist(W.hero.x, W.hero.y, node.x, node.y)));
      const rareButton = document.getElementById('spawn-rare-chest');
      rareButton.click();
      const rare = Game.environment.chests()[0];
      const rareSpawned = !!rare && rare.rare && Game.environment.isLegalChestSpot(rare.x, rare.y);
      const commonButton = document.getElementById('spawn-common-chest');
      commonButton.click();
      const common = Game.environment.chests()[0];
      return {
        nodeCount: nodes.length,
        nearest,
        rareSpawned,
        commonSpawned: !!common && !common.rare && Game.environment.isLegalChestSpot(common.x, common.y),
        touchable: [focusButton, document.getElementById('reset-gather'), rareButton, commonButton]
          .every((button) => button.getBoundingClientRect().height >= 44),
        status: document.getElementById('exploration-event').textContent
      };
    })()`);
    assert.ok(demoExploration.nodeCount >= 3 && demoExploration.nodeCount <= 5);
    assert.ok(demoExploration.nearest <= 42, 'QA focus control positions the hero beside a mature node');
    assert.equal(demoExploration.rareSpawned, true, 'QA can force the rare visual through production chest placement');
    assert.equal(demoExploration.commonSpawned, true, 'QA can force the common visual through production chest placement');
    assert.equal(demoExploration.touchable, true, 'exploration QA controls keep 44px touch targets');
    const demoDynamicTrade = await cdp.evaluate(`(() => {
      const button = document.getElementById('spawn-dynamic-trade');
      const rect = button.getBoundingClientRect();
      button.click();
      const active = Game.trade.areaById('qa-wanderer');
      const registered = !!active && active.kind === 'wander' && !!active.prop;
      Game.state.world.worldTime += 21;
      Game.trade.update();
      return {
        registered,
        touchHeight: rect.height,
        expired: !Game.trade.areaById('qa-wanderer'),
        status: document.getElementById('dynamic-trade-status').textContent
      };
    })()`);
    assert.equal(demoDynamicTrade.registered, true, 'QA stub calls the production dynamic trade API');
    assert.ok(demoDynamicTrade.touchHeight >= 44, 'dynamic trade QA control keeps a touch target');
    assert.equal(demoDynamicTrade.expired, true, 'QA dynamic trade area expires through the production TTL path');
    assert.deepEqual(cdp.errors, [], 'browser runtime has no uncaught errors');

    const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshot = path.join(os.tmpdir(), 'firpg-demo-mobile-cdp.png');
    fs.writeFileSync(screenshot, Buffer.from(capture.data, 'base64'));

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
      return {
        hasClass: Game.player.hasClass(),
        classId: Game.state.player.classId,
        titleGone: !document.getElementById('title-root'),
        classGone: !document.getElementById('class-root'),
        saveMatches: saved.player.classId === Game.state.player.classId,
        backupMatches: backup.player.classId === Game.state.player.classId,
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
    await delay(420);
    const updateNotice = await cdp.evaluate(`(() => {
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
    assert.equal(updateNotice.visible, true, 'a stale long-running tab receives an update action');
    assert.ok(updateNotice.height >= 44, 'the update action keeps a touch target');
    assert.equal(updateNotice.withinViewport, true, 'the update action fits the mobile viewport');
    assert.equal(updateNotice.build, BUILD_ID);
    assert.ok(updateNotice.copy.includes(BUILD_ID));
    assert.deepEqual(cdp.errors, [], 'browser runtime has no uncaught errors after restart');

    console.log('Browser smoke passed: ' + JSON.stringify({
      titleScene, titleArchiveReveal, titleShortView, titleShortArchive, englishTitleFit,
      titleScreenshot, titleTallScreenshot, titleShortScreenshot, main,
      v3CampVisual, v3ResourceVisual, v3DepletedVisual, v3Navigation, v3ForestVisual,
      v3CampScreenshot, v3ResourceScreenshot, v3DepletedScreenshot,
      v3ForestScreenshot, worldChecks,
      v111Checks, v111Screenshot,
      campStateScreenshots, englishCampFit, transitionChecks, transitionScreenshots,
      endingChecks, densityChecks, desktop, desktopTransition,
      desktopEnding, demo, demoDynamicTrade, mainScreenshot, densityScreenshots, desktopScreenshot,
      desktopEndingScreenshot, screenshot, restartBefore, restartTitle, restartClassSelect,
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
