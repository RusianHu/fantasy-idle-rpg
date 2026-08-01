/* ============================================================
 * systems/interactions.js — Actor 互动动作的统一路由
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var bus = Game.bus;
  var pauseLeases = {};
  var DEFAULT_PAUSE_TTL = 2;
  var MIN_PAUSE_TTL = 0.25;
  var MAX_PAUSE_TTL = 30;
  var handoffs = {};
  var HANDOFF_LEASE_ID = 'ui:merchant-attack-submit';
  var HANDOFF_TTL = 2;

  function pauseNow() {
    return Number(Game.state && Game.state.world && Game.state.world.worldTime) || 0;
  }

  function copy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizeScopes(scopes) {
    var out = {};
    (Array.isArray(scopes) && scopes.length ? scopes : ['autoExplore']).forEach(function (scope) {
      if (typeof scope === 'string' && scope) out[scope] = true;
    });
    return out;
  }

  function leaseSnapshot(lease) {
    if (!lease) return null;
    return {
      id: lease.id,
      kind: lease.kind,
      scopes: Object.keys(lease.scopes).sort(),
      acquiredAt: lease.acquiredAt,
      renewedAt: lease.renewedAt,
      expiresAt: lease.expiresAt,
      context: copy(lease.context)
    };
  }

  function releasePause(id, reason) {
    var lease = pauseLeases[id];
    if (!lease) return false;
    delete pauseLeases[id];
    bus.emit('interactionPause:released', {
      lease: leaseSnapshot(lease),
      reason: reason || 'released'
    });
    return true;
  }

  function purgeExpired() {
    var now = pauseNow();
    Object.keys(pauseLeases).forEach(function (id) {
      if (pauseLeases[id].expiresAt <= now) releasePause(id, 'expired');
    });
  }

  function acquirePause(id, options) {
    options = options || {};
    if (typeof id !== 'string' || !id) return null;
    purgeExpired();
    var now = pauseNow();
    var ttl = Math.max(
      MIN_PAUSE_TTL,
      Math.min(MAX_PAUSE_TTL, Number(options.ttl) || DEFAULT_PAUSE_TTL)
    );
    var existing = pauseLeases[id];
    var lease = pauseLeases[id] = {
      id: id,
      kind: typeof options.kind === 'string' && options.kind
        ? options.kind : existing && existing.kind || 'deep-interaction',
      scopes: normalizeScopes(options.scopes || existing && Object.keys(existing.scopes)),
      acquiredAt: existing ? existing.acquiredAt : now,
      renewedAt: now,
      expiresAt: now + ttl,
      context: copy(options.context !== undefined
        ? options.context : existing && existing.context || null)
    };
    if (!existing) bus.emit('interactionPause:acquired', { lease: leaseSnapshot(lease) });
    return leaseSnapshot(lease);
  }

  function isPaused(scope) {
    purgeExpired();
    return Object.keys(pauseLeases).some(function (id) {
      return !scope || pauseLeases[id].scopes[scope];
    });
  }

  function pauseSnapshot() {
    purgeExpired();
    return Object.keys(pauseLeases).sort().map(function (id) {
      return leaseSnapshot(pauseLeases[id]);
    });
  }

  function resetPauses(reason) {
    Object.keys(handoffs).forEach(function (id) {
      delete handoffs[id];
    });
    Object.keys(pauseLeases).forEach(function (id) {
      releasePause(id, reason || 'reset');
    });
  }

  /* 攻击确认提交后的 Engagement 交接租约。Game.merchants.attack() 只会
   * enqueue，实际 committed/rejected 在后续固定 tick 才发生；若直接放任
   * 确认窗关闭，自动探索会在提交前抢跑。交接租约以短 TTL 续租，精确匹配
   * commandId 后释放，同步失败不取得、异常时由 TTL 兜底自动恢复。 */
  function handoffGuard(rec) {
    return function () {
      var active = Game.merchants && Game.merchants.activeEvent();
      var hero = Game.world && Game.world.hero;
      if (!active || active.id !== rec.eventId) return false;
      if (active.state !== 'available') return false;
      var actor = Game.actors && Game.actors.get ? Game.actors.get(rec.actorId) : null;
      if (!actor || actor.dead || actor.lifecycle !== 'active' ||
          actor.merchantEventId !== active.id) return false;
      if (!hero || hero.encounterId ||
          hero.state === 'dead' || hero.state === 'recover') return false;
      if (Game.transitions && Game.transitions.isActive()) return false;
      if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return false;
      return true;
    };
  }

  function releaseHandoff(commandId, reason) {
    var rec = handoffs[commandId];
    if (!rec) return false;
    delete handoffs[commandId];
    releasePause(HANDOFF_LEASE_ID, reason || 'handoff-resolved');
    bus.emit('interactionPause:handoffReleased', {
      commandId: commandId, reason: reason || 'handoff-resolved'
    });
    return true;
  }

  function acquireHandoff(commandId, context) {
    if (!commandId || !Game.interactions || !Game.interactions.acquirePause) return false;
    Object.keys(handoffs).forEach(function (existing) {
      if (existing !== commandId) releaseHandoff(existing, 'superseded');
    });
    context = context || {};
    var rec = {
      commandId: commandId,
      eventId: context.eventId || null,
      actorId: context.actorId || null,
      regionId: context.regionId ||
        (Game.state && Game.state.world && Game.state.world.region) || null
    };
    handoffs[commandId] = rec;
    acquirePause(HANDOFF_LEASE_ID, {
      kind: 'merchant-attack-submit',
      scopes: ['autoExplore'],
      ttl: HANDOFF_TTL,
      context: {
        commandId: commandId,
        eventId: rec.eventId,
        actorId: rec.actorId,
        regionId: rec.regionId
      }
    });
    bus.emit('interactionPause:handoffAcquired', { commandId: commandId });
    return true;
  }

  function maintainHandoffs() {
    Object.keys(handoffs).forEach(function (commandId) {
      var rec = handoffs[commandId];
      if (!rec) return;
      var valid = true;
      try { valid = handoffGuard(rec)() !== false; }
      catch (e) { valid = false; }
      if (!valid) {
        releaseHandoff(commandId, 'invalid');
        return;
      }
      acquirePause(HANDOFF_LEASE_ID, {
        kind: 'merchant-attack-submit',
        scopes: ['autoExplore'],
        ttl: HANDOFF_TTL
      });
    });
    return Object.keys(handoffs).length;
  }

  function toast(key, cls) {
    if (Game.ui && Game.ui.modals) {
      Game.ui.modals.toast(Game.i18n.t(key), cls);
    }
  }

  function genericAttack(actor) {
    var hero = Game.world && Game.world.hero;
    var sourceKey = hero && hero.actorRecordId
      ? { actorRecordId: hero.actorRecordId }
      : null;
    var targetKey = Game.population && Game.population.stableKey(actor);
    if (!sourceKey || !targetKey || !Game.actors.get(actor.id)) {
      toast('ui.actorTargetUnavailable', 'warn');
      return { ok: false, reason: 'target' };
    }
    var result = Game.engagement.enqueue({
      sourceKey: sourceKey,
      targetKey: targetKey,
      kind: 'attack'
    });
    toast(result.ok ? 'ui.actorAttackQueued' : 'ui.actorTargetUnavailable',
      result.ok ? null : 'warn');
    return result;
  }

  Game.interactions = {
    pauseLimits: {
      defaultTtl: DEFAULT_PAUSE_TTL,
      minTtl: MIN_PAUSE_TTL,
      maxTtl: MAX_PAUSE_TTL
    },
    acquirePause: acquirePause,
    releasePause: releasePause,
    isPaused: isPaused,
    pauseSnapshot: pauseSnapshot,
    resetPauses: resetPauses,
    acquireHandoff: acquireHandoff,
    releaseHandoff: releaseHandoff,
    maintainHandoffs: maintainHandoffs,
    handlers: function (actor) {
      var merchant = !!(actor && actor.tags &&
        actor.tags.indexOf('wandering-merchant') >= 0 &&
        Game.merchants);
      return {
        observe: function (target) {
          if (merchant) {
            var dialogue = Game.merchants.talk(target);
            if (dialogue && Game.ui && Game.ui.modals.merchantDialogue) {
              Game.ui.modals.merchantDialogue(dialogue, target);
            }
          }
        },
        talk: function (target) {
          var dialogue = merchant && Game.merchants.talk(target);
          if (dialogue && Game.ui && Game.ui.modals.merchantDialogue) {
            Game.ui.modals.merchantDialogue(dialogue, target);
          }
          return dialogue;
        },
        trade: function (target) {
          return merchant
            ? Game.merchants.openTrade(target)
            : { ok: false, reason: 'unsupported' };
        },
        attack: function (target) {
          var result = merchant
            ? Game.merchants.attack(target)
            : genericAttack(target);
          if (merchant) {
            toast(result.ok ? 'merchant.ui.attackQueued' : 'ui.actorTargetUnavailable',
              result.ok ? 'warn' : 'warn');
            if (result.ok && result.commandId) {
              var active = Game.merchants.activeEvent();
              acquireHandoff(result.commandId, {
                eventId: active && active.id || null,
                actorId: target && target.id || null
              });
            }
          }
          return result;
        }
      };
    }
  };

  ['region:travelStart', 'region:changed', 'player:death', 'game:completed'].forEach(function (event) {
    bus.on(event, function () { resetPauses(event); });
  });

  /* Engagement 交接租约只在精确匹配 commandId 时释放；无关 commandId 的
   * committed/rejected 事件不影响在途的行商攻击暂停。 */
  bus.on('engagement:committed', function (event) {
    var detail = event && event.payload || event || {};
    var commandId = detail.commandId;
    if (commandId) releaseHandoff(commandId, 'engagement:committed');
  });
  bus.on('engagement:rejected', function (result) {
    var commandId = result && result.commandId;
    if (commandId) releaseHandoff(commandId, 'engagement:rejected');
  });
})();
