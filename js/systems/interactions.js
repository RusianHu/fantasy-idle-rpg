/* ============================================================
 * systems/interactions.js — Actor 互动动作的统一路由
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

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
})();
