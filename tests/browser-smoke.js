'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.FIRPG_URL || 'http://127.0.0.1:4176/';
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
      if (message.method === 'Runtime.exceptionThrown') this.errors.push(message.params.exceptionDetails.text);
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
    const main = await cdp.evaluate(`(() => {
      if (!window.Game || !Game.world || !Game.world.layout) throw new Error('game boot failed');
      if (!Game.player.hasClass()) Game.player.setClass('fighter');
      Game.state.meta.prologueDone = true;
      Game.state.player.hp = Game.player.derived().maxHp;
      Game.ui.title.hide();

      const firstSeed = Game.state.world.worldSeed;
      const firstRegion = Game.world.region.id;
      const snapA = JSON.stringify(Game.terrain.snapshot());
      Game.world.init(firstRegion);
      const snapB = JSON.stringify(Game.terrain.snapshot());
      if (snapA !== snapB) throw new Error('same-save layout changed after rebuild');

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
    await cdp.evaluate(`(() => {
      Game.ui.tabs.open('battle');
      Game.world.setControlMode('manual');
      const hero = Game.world.hero;
      hero.x = Game.world.region.world.w * 0.5;
      hero.y = Game.world.region.world.h * 0.5;
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
      const hero = W.hero;
      Game.state.player.hp = hero.maxHp;
      W.setControlMode('manual');
      hero.state = 'idle';

      const clickStart = { x: hero.x, y: hero.y };
      W.handleTap(U.clamp(hero.x + 120, 30, W.region.world.w - 30), hero.y);
      const clickHadOrder = !!hero.moveOrder;
      for (let i = 0; i < 20; i++) W.updateHero(hero, 0.1);
      const clickMoved = U.dist(clickStart.x, clickStart.y, hero.x, hero.y);

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
      Game.state.player.hp = hero.maxHp;
      const prog = Game.State.regionProg(W.region.id);
      prog.kills = W.region.killTarget;
      W.trySpawnBoss();
      const bossAtLandmark = !!W.bossEnt &&
        U.dist(W.bossEnt.x, W.bossEnt.y, W.layout.bossPoint.x, W.layout.bossPoint.y) < 0.01;
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
        clickHadOrder, clickMoved, autoAcquired, movingTargetRepathed, monsterInterceptPath, monsterWanderPath,
        nearCampAction: nearCampAction.id, nearButtonText, campIconVisiblePixels, campButtonEmojiFree,
        nearCampSitting, nearCampState, nearCampDistance, sittingCampAction: sittingCampAction.id,
        farCampAction: farCampAction.id, farWarpStarted, warpCampAction: warpCampAction.id, farCampSitting,
        deathAtCamp, lowHpCampFlashes, bossAtLandmark, bossCampAction: bossCampAction.id,
        bossCampEnabled, bossRetreatSafe, bossRetreatReason, largeDtStep, regionSwitchUsesLayout
      };
    })()`);
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
    assert.equal(worldChecks.bossAtLandmark, true);
    assert.equal(worldChecks.bossCampAction, 'boss-retreat');
    assert.equal(worldChecks.bossCampEnabled, true);
    assert.equal(worldChecks.bossRetreatSafe, true);
    assert.equal(worldChecks.bossRetreatReason, 'retreat');
    assert.ok(worldChecks.largeDtStep <= 14.01, 'large dt movement is capped');
    assert.equal(worldChecks.regionSwitchUsesLayout, true);

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
      const ids = ['prev-region', 'toggle-play', 'next-region', 'seed-input'];
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
        canvasColors: colors.size
      };
    })()`);
    assert.equal(demo.seed, '89ABCDEF');
    assert.equal(demo.region, 'lavacave');
    assert.equal(demo.within, true, 'mobile QA toolbar controls fit viewport');
    assert.equal(demo.segments, true, 'mobile QA segmented control fits viewport');
    assert.equal(demo.noHorizontalOverflow, true, 'mobile QA page has no horizontal overflow');
    assert.ok(demo.canvasColors > 20, 'QA canvas is nonblank');
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
      mainSaveIsFresh: JSON.parse(localStorage.getItem('firpg_save')).meta.completedAt === null,
      backupSaveIsFresh: JSON.parse(localStorage.getItem('firpg_save_backup')).meta.completedAt === null
    }))()`);
    assert.equal(restartTitle.titleVisible, true, 'confirmed restart returns to the title screen');
    assert.equal(restartTitle.classVisible, false);
    assert.equal(restartTitle.endingGone, true);
    assert.equal(restartTitle.hasClass, false);
    assert.equal(restartTitle.prologueDone, false);
    assert.equal(restartTitle.completedAt, null);
    assert.notEqual(restartTitle.createdAt, restartBefore.createdAt);
    assert.equal(restartTitle.mainSaveIsFresh, true);
    assert.equal(restartTitle.backupSaveIsFresh, true);
    const restartTitleCapture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const restartTitleScreenshot = path.join(os.tmpdir(), 'firpg-restart-title-mobile-cdp.png');
    fs.writeFileSync(restartTitleScreenshot, Buffer.from(restartTitleCapture.data, 'base64'));

    const restartClassSelect = await cdp.evaluate(`(() => {
      document.querySelector('#title-root .title-start').click();
      const story = document.querySelector('.prologue-mask');
      for (let i = 0; i < 10; i++) story.click();
      const root = document.getElementById('class-root');
      return {
        titleVisible: !!document.getElementById('title-root'),
        classVisible: !!root,
        classCount: root ? Game.reg.all('class').length : 0,
        confirmButton: !!root?.querySelector('.cs-confirm'),
        prologueDone: Game.state.meta.prologueDone
      };
    })()`);
    assert.equal(restartClassSelect.titleVisible, true);
    assert.equal(restartClassSelect.classVisible, true, 'new character creation opens after the fresh prologue');
    assert.ok(restartClassSelect.classCount >= 5);
    assert.equal(restartClassSelect.confirmButton, true);
    assert.equal(restartClassSelect.prologueDone, true);
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
        endingCleared: saved.meta.completedAt === null && backup.meta.completedAt === null
      };
    })()`);
    assert.equal(restartCompleted.hasClass, true);
    assert.equal(restartCompleted.titleGone, true);
    assert.equal(restartCompleted.classGone, true);
    assert.equal(restartCompleted.saveMatches, true);
    assert.equal(restartCompleted.backupMatches, true);
    assert.equal(restartCompleted.endingCleared, true);
    assert.deepEqual(cdp.errors, [], 'browser runtime has no uncaught errors after restart');

    console.log('Browser smoke passed: ' + JSON.stringify({
      main, worldChecks, campStateScreenshots, englishCampFit, transitionChecks, transitionScreenshots,
      endingChecks, densityChecks, desktop, desktopTransition,
      desktopEnding, demo, mainScreenshot, densityScreenshots, desktopScreenshot,
      desktopEndingScreenshot, screenshot, restartBefore, restartTitle, restartClassSelect,
      restartCompleted, restartTitleScreenshot, restartClassScreenshot
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
