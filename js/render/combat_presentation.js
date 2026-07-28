/* Combat V2 presentation adapter.
 * Consumes structured combat events and produces render-only FX. It never
 * changes encounter RNG, damage, targeting, movement, or scheduler state.
 */
(function () {
  'use strict';
  var Game = window.Game;
  var records = [];
  var resolvedBursts = {};
  var MAX_RECORDS = 160;

  function actor(id) {
    return id && Game.actors && Game.actors.get(id);
  }

  function ability(id) {
    return id && Game.content && Game.content.get('ability', id);
  }

  function radiusOf(value) {
    return Math.max(0, Number(value && value.components && value.components.body &&
      value.components.body.collisionRadius) || 0);
  }

  function heightOf(value) {
    return Math.max(12, Number(value && value.spriteH) || 20);
  }

  function positionOf(value) {
    return {
      x: Number(value && value.x) || 0,
      y: (Number(value && value.y) || 0) - heightOf(value) * 0.5
    };
  }

  function relationOf(source, target, event) {
    if (!source || !target || !Game.relations) return null;
    return Game.relations.resolve(source.id, target.id, event.encounterId);
  }

  function contactOf(source, target) {
    if (!source || !target) return null;
    var distance = Game.util.dist(source.x, source.y, target.x, target.y);
    var minimum = radiusOf(source) + radiusOf(target) + 2;
    return {
      distance: Math.round(distance * 100) / 100,
      minimum: minimum,
      gap: Math.round((distance - minimum) * 100) / 100,
      overlapping: distance + 0.01 < minimum
    };
  }

  function addRecord(event, visual, source, target, extra) {
    var item = Object.assign({
      encounterId: event.encounterId || null,
      tick: Number(event.tick) || 0,
      sequence: Number(event.sequence) || 0,
      eventType: event.type,
      visual: visual,
      sourceActorId: source && source.id || event.sourceActorId || null,
      targetActorId: target && target.id ||
        event.targetActorIds && event.targetActorIds[0] || null,
      abilityId: event.abilityId || null,
      contact: relationOf(source, target, event) === 'hostile'
        ? contactOf(source, target) : null
    }, extra || {});
    records.push(item);
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
    return item;
  }

  function floatNumber(target, text, options) {
    if (!target || !Game.fx) return;
    Game.fx.floatText(
      target.x + Game.util.rand(-3, 3),
      target.y - heightOf(target) - 2,
      text,
      options
    );
  }

  function isProjectile(def) {
    return def && def.presentation && def.presentation.projectile;
  }

  function isLargeAttack(def, event) {
    return !!(def && (def.actionType !== 'auto' ||
      def.target && def.target.shape !== 'single' ||
      event.payload && event.payload.crit));
  }

  function faceTarget(source, target) {
    if (!source || !target) return;
    source.dir = Game.util.dirOf(target.x - source.x, target.y - source.y);
    source.presentationTargetId = target.id;
  }

  function beginAttack(source, target, def) {
    if (!source || !target) return;
    faceTarget(source, target);
    // lungeT selects the existing attack frame. Ranged attacks retain the
    // frame without spatial lunge; melee offsets are render-only.
    source.lungeT = Math.max(Number(source.lungeT) || 0, 0.18);
    source.presentationNoLunge = !!isProjectile(def);
  }

  function impact(event, source, target, def, missed) {
    if (!target || !Game.fx) return;
    var point = positionOf(target);
    if (missed) {
      floatNumber(target, Game.i18n.t('ui.miss'), {
        color: '#a8b4c0', small: true
      });
      addRecord(event, 'miss', source, target);
      return;
    }

    var payload = event.payload || {};
    var shown = Math.max(0, Number(payload.amount) || 0) +
      Math.max(0, Number(payload.absorbed) || 0);
    var hostile = relationOf(source, target, event) === 'hostile';
    var sourceIsHero = source && source.kind === 'hero';
    var color = sourceIsHero
      ? (payload.crit ? '#ffd85a' : '#ffffff')
      : (payload.absorbed > 0 ? '#7ad0f0' : (hostile ? '#ff8a7a' : '#ffffff'));
    floatNumber(target, '-' + Game.i18n.fmtNum(shown), {
      color: color, crit: !!payload.crit
    });
    Game.fx.hitSpark(point.x, point.y, !!payload.crit || sourceIsHero);
    if (!isProjectile(def)) {
      Game.fx.slash(point.x, point.y, isLargeAttack(def, event));
    }
    addRecord(event, isProjectile(def) ? 'projectile-impact' : 'melee-impact',
      source, target, {
        amount: shown,
        crit: !!payload.crit,
        absorbed: Math.max(0, Number(payload.absorbed) || 0)
      });
  }

  function attack(event, missed) {
    var source = actor(event.sourceActorId);
    var target = actor(event.targetActorIds && event.targetActorIds[0]);
    var def = ability(event.abilityId);
    if (!source || !target || !Game.fx) return;
    beginAttack(source, target, def);
    var projectile = isProjectile(def);
    if (projectile) {
      var start = positionOf(source);
      Game.fx.projectile(start.x, start.y, target, projectile, function () {
        impact(event, source, target, def, missed);
      }, { allowDead: true });
      addRecord(event, 'projectile-launch', source, target, {
        projectile: projectile,
        impact: missed ? 'miss' : 'hit'
      });
    } else {
      impact(event, source, target, def, missed);
    }
  }

  function heal(event) {
    var source = actor(event.sourceActorId);
    var target = actor(event.targetActorIds && event.targetActorIds[0]);
    var amount = Math.max(0, Number(event.payload && event.payload.amount) || 0);
    if (!target || !Game.fx || amount <= 0) return;
    var point = positionOf(target);
    Game.fx.heal(point.x, point.y);
    floatNumber(target, '+' + Game.i18n.fmtNum(amount), { color: '#7ef07e' });
    addRecord(event, 'heal', source, target, { amount: amount });
  }

  function shield(event) {
    var source = actor(event.sourceActorId);
    var target = actor(event.targetActorIds && event.targetActorIds[0]);
    var amount = Math.max(0, Number(event.payload && event.payload.amount) || 0);
    if (!target || !Game.fx) return;
    var point = positionOf(target);
    Game.fx.ring(point.x, point.y + 7, 22, '#7ad0f0');
    if (amount > 0) {
      floatNumber(target, '+' + Game.i18n.fmtNum(amount), {
        color: '#7ad0f0', small: true
      });
    }
    addRecord(event, 'shield', source, target, { amount: amount });
  }

  function resolved(event) {
    var source = actor(event.sourceActorId);
    var target = actor(event.targetActorIds && event.targetActorIds[0]);
    var def = ability(event.abilityId);
    if (!source || !def || !Game.fx) return;
    var targetSpec = def.target || {};
    var shape = targetSpec.shape || 'single';
    if (shape === 'single' || isProjectile(def)) return;
    var key = [event.encounterId, event.tick, event.sourceActorId,
      event.abilityId, event.type].join('|');
    if (resolvedBursts[key]) return;
    resolvedBursts[key] = true;
    var center = shape === 'selfRadius' || !target ? source : target;
    var point = positionOf(center);
    var color = def.presentation && def.presentation.color ||
      (def.presentation && def.presentation.icon === 'icon_skill_whirl'
        ? '#a8e0f0' : '#e7c45b');
    Game.fx.ring(point.x, point.y + 7,
      Math.max(18, Number(targetSpec.radius) || 28), color);
    addRecord(event, 'area-ring', source, target || source, {
      shape: shape,
      radius: Math.max(18, Number(targetSpec.radius) || 28)
    });
  }

  function consume(event) {
    if (!event || !event.type) return null;
    if (event.type === 'combat:hit') attack(event, false);
    else if (event.type === 'combat:miss') attack(event, true);
    else if (event.type === 'combat:healed') heal(event);
    else if (event.type === 'combat:shielded') shield(event);
    else if (event.type === 'action:resolved' ||
        event.type === 'action:channelTick') resolved(event);
    return records.length ? records[records.length - 1] : null;
  }

  var P = Game.combatPresentation = {
    consume: consume,
    reset: function () {
      records.length = 0;
      resolvedBursts = {};
    },
    snapshot: function () {
      return {
        recordCount: records.length,
        records: records.map(function (record) {
          return JSON.parse(JSON.stringify(record));
        })
      };
    }
  };

  if (Game.bus) Game.bus.on('combat:event', P.consume);
})();
