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
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
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
      W.updateHero(hero, 1.1);
      const deathAtCamp = hero.state === 'recover' &&
        U.dist(hero.x, hero.y, W.layout.camp.x + 26, W.layout.camp.y + 24) < 0.01;

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
    console.log('Browser smoke passed: ' + JSON.stringify({
      main, worldChecks, campStateScreenshots, englishCampFit, densityChecks, desktop, demo,
      mainScreenshot, densityScreenshots, desktopScreenshot, screenshot
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
