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
    Object.keys(pauseLeases).forEach(function (id) {
      releasePause(id, reason || 'reset');
    });
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
          }
          return result;
        }
      };
    }
  };

  ['region:travelStart', 'region:changed', 'player:death', 'game:completed'].forEach(function (event) {
    bus.on(event, function () { resetPauses(event); });
  });
})();
