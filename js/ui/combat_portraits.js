/* ============================================================
 * ui/combat_portraits.js — Combat HUD portrait resolver/renderer
 *
 * Actor presentation owns the source ID. Dedicated portraits win;
 * a registered combat sprite is the safe secondary source; the final
 * fallback is a deterministic pixel silhouette drawn without assets.
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  function presentationOf(actor) {
    return actor && actor.components && actor.components.presentation || {};
  }

  function resolve(actor) {
    var presentation = presentationOf(actor);
    var portraitId = presentation.portraitId || null;
    var spriteId = presentation.spriteId || actor && actor.sprite || null;
    var portraitAvailable = portraitId && Game.assets.has(portraitId);
    var spriteAvailable = spriteId && Game.assets.has(spriteId);
    var assetId = portraitAvailable ? portraitId : (spriteAvailable ? spriteId : null);
    var sourceKind = portraitAvailable
      ? (portraitId === spriteId ? 'sprite-portrait' : 'dedicated-portrait')
      : (spriteAvailable ? 'sprite-fallback' : 'pixel-fallback');
    var frameName = null;
    if (assetId) {
      frameName = sourceKind === 'dedicated-portrait' && Game.assets.hasFrame(assetId, 'icon')
        ? 'icon'
        : (Game.assets.hasFrame(assetId, 'idle0') ? 'idle0' :
          Object.keys(Game.assets.sprite(assetId).frames)[0]);
    }
    return {
      actorId: actor && actor.id || null,
      assetId: assetId,
      portraitId: portraitId,
      spriteId: spriteId,
      frameName: frameName,
      sourceKind: sourceKind
    };
  }

  function fallbackColor(actor) {
    var presentation = presentationOf(actor);
    var seed = U.strSeed((actor && actor.id || 'actor') + ':' +
      (presentation.spriteId || presentation.portraitId || 'unknown'));
    return 'hsl(' + (seed % 360) + ',42%,48%)';
  }

  function drawFallback(canvas, actor) {
    var ctx = canvas.getContext('2d');
    var unit = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 12));
    var ox = Math.floor((canvas.width - unit * 8) / 2);
    var oy = Math.floor((canvas.height - unit * 9) / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#16122b';
    ctx.fillRect(ox + unit * 2, oy, unit * 4, unit * 4);
    ctx.fillRect(ox + unit, oy + unit * 4, unit * 6, unit * 4);
    ctx.fillRect(ox, oy + unit * 7, unit * 8, unit * 2);
    ctx.fillStyle = fallbackColor(actor);
    ctx.fillRect(ox + unit * 3, oy + unit, unit * 2, unit * 3);
    ctx.fillRect(ox + unit * 2, oy + unit * 4, unit * 4, unit * 3);
    ctx.fillStyle = '#f2e9d4';
    ctx.fillRect(ox + unit * 3, oy + unit * 2, unit, unit);
    ctx.fillRect(ox + unit * 5, oy + unit * 2, unit, unit);
  }

  function clear(canvas) {
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    canvas.removeAttribute('aria-label');
    canvas.removeAttribute('data-actor-id');
    canvas.removeAttribute('data-portrait-source');
    canvas.removeAttribute('data-portrait-mode');
    canvas.removeAttribute('data-portrait-signature');
    canvas.classList.add('is-empty');
  }

  function draw(canvas, actor, label) {
    if (!canvas) return null;
    if (!actor) {
      clear(canvas);
      return null;
    }
    var source = resolve(actor);
    var signature = [
      source.actorId, source.assetId || '-', source.frameName || '-', source.sourceKind
    ].join('|');
    if (canvas.getAttribute('data-portrait-signature') !== signature) {
      if (source.assetId) Game.assets.drawToDom(canvas, source.assetId, source.frameName);
      else drawFallback(canvas, actor);
      canvas.setAttribute('data-portrait-signature', signature);
    }
    canvas.classList.remove('is-empty');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label || source.actorId || 'Actor');
    canvas.setAttribute('data-actor-id', source.actorId || '');
    canvas.setAttribute('data-portrait-source', source.assetId || 'pixel-fallback');
    canvas.setAttribute('data-portrait-mode', source.sourceKind);
    return source;
  }

  Game.ui = Game.ui || {};
  Game.ui.combatPortraits = {
    resolve: resolve,
    draw: draw,
    clear: clear
  };
})();
