/* global Game */
(function () {
  'use strict';

  var DT = 0.05;
  var SPEED = 56;
  var REACH = 26;
  var AUDIT_STALL_LIMIT = 8;

  var SCENARIOS = {
    'gather-resume': {
      id: 'gather-resume', interaction: 'gather'
    },
    'chest-resume': {
      id: 'chest-resume', interaction: 'chest'
    },
    'gather-threat': {
      id: 'gather-threat', interaction: 'gather', threatAfter: 0.35
    },
    'chest-expiry': {
      id: 'chest-expiry', interaction: 'chest', expireAfter: 0.6
    },
    'gather-fallback': {
      id: 'gather-fallback', interaction: 'gather', injectFallback: true
    },
    'chest-fallback': {
      id: 'chest-fallback', interaction: 'chest', injectFallback: true
    }
  };

  function mount(layout) {
    Game.terrain.layout = layout;
    Game.nav.useLayout(layout);
  }

  function directMove(ent, tx, ty, speed, dt) {
    var dx = tx - ent.x;
    var dy = ty - ent.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 0.5) return 0;
    var step = Math.min(distance, speed * Math.min(dt, 0.25));
    var swept = Game.terrain.sweepMove(
      ent.x, ent.y, dx / distance * step, dy / distance * step, 7
    );
    ent.x = swept.x;
    ent.y = swept.y;
    ent.moving = swept.moved > 0.01;
    return distance - swept.moved;
  }

  function routeSnapshot(hero) {
    var route = hero.navRoute;
    return route ? {
      token: route.token || null,
      leg: route.legIndex || 0,
      legs: route.legs ? route.legs.length : 0,
      pending: !!route.pending,
      fallback: !!route.fallback,
      recoveries: route.recoveries || 0,
      pathKey: route.pathKey || null
    } : null;
  }

  function baseline(layout) {
    mount(layout);
    var hero = {
      kind: 'hero', x: layout.camp.x, y: layout.camp.y,
      navRoute: null, moving: false, dir: 'd'
    };
    var target = layout.bossPoint;
    var samples = [{ t: 0, x: hero.x, y: hero.y, state: 'travel' }];
    var remaining = Game.util.dist(hero.x, hero.y, target.x, target.y);
    var tick = 0;
    for (; tick < 3600; tick++) {
      Game.nav.update(2);
      remaining = Game.nav.step(
        hero, target.x, target.y, SPEED, DT, 'audit:baseline', directMove
      );
      if (tick % 5 === 0) {
        samples.push({ t: +(tick * DT).toFixed(2), x: hero.x, y: hero.y, state: 'travel' });
      }
      if (remaining < 5) break;
    }
    samples.push({ t: +(tick * DT).toFixed(2), x: hero.x, y: hero.y, state: 'reached' });
    return {
      reached: remaining < 5,
      duration: +(tick * DT).toFixed(2),
      remaining: +remaining.toFixed(2),
      samples: samples
    };
  }

  function routeWindow(base) {
    var start = Math.max(1, Math.floor(base.samples.length * 0.2));
    var end = Math.max(start + 1, Math.floor(base.samples.length * 0.72));
    return base.samples.slice(start, end);
  }

  function gatherTarget(layout, base) {
    var samples = routeWindow(base);
    var nodes = layout.nodes || [];
    var best = null;
    for (var ni = 0; ni < nodes.length; ni++) {
      for (var si = 0; si < samples.length; si++) {
        var distance = Game.util.dist(nodes[ni].x, nodes[ni].y, samples[si].x, samples[si].y);
        if (!best || distance < best.distance) {
          best = { target: nodes[ni], sample: samples[si], distance: distance };
        }
      }
    }
    if (best && best.distance <= 120) return best;
    var anchor = samples[Math.floor(samples.length * 0.45)] || base.samples[1];
    var projected = Game.terrain.projectPoint(anchor.x + 72, anchor.y + 24, 2) ||
      Game.terrain.projectPoint(anchor.x, anchor.y, 2) || anchor;
    return {
      target: {
        kind: 'gatherNode', id: 'audit:gather-projected',
        x: projected.x, y: projected.y, synthetic: true
      },
      sample: anchor,
      distance: Game.util.dist(projected.x, projected.y, anchor.x, anchor.y)
    };
  }

  function chestTarget(base) {
    var index = Math.max(2, Math.min(
      base.samples.length - 2, Math.floor(base.samples.length * 0.42)
    ));
    var anchor = base.samples[index];
    var before = base.samples[index - 1];
    var after = base.samples[index + 1];
    var dx = after.x - before.x;
    var dy = after.y - before.y;
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    var px = -dy / length;
    var py = dx / length;
    var offsets = [92, -92, 72, -72, 120, -120];
    var projected = null;
    for (var i = 0; i < offsets.length; i++) {
      var candidate = Game.terrain.projectPoint(
        anchor.x + px * offsets[i], anchor.y + py * offsets[i], 2
      );
      var distance = candidate && Game.util.dist(anchor.x, anchor.y, candidate.x, candidate.y);
      if (candidate && distance >= 60 && distance <= 140 &&
          Game.terrain.isWalkable(candidate.x, candidate.y, 10)) {
        projected = candidate;
        break;
      }
    }
    projected = projected || Game.terrain.projectPoint(anchor.x, anchor.y, 2) || anchor;
    return {
      target: {
        kind: 'chest', id: 'audit:chest',
        x: projected.x, y: projected.y, ttl: Game.F.BAL.chestTtl
      },
      sample: anchor,
      distance: Game.util.dist(projected.x, projected.y, anchor.x, anchor.y)
    };
  }

  function prepare(layout, base, scenario) {
    var selected = scenario.interaction === 'gather'
      ? gatherTarget(layout, base) : chestTarget(base);
    if (scenario.injectFallback) {
      var approachSample = null;
      for (var i = 0; i < base.samples.length; i++) {
        var sample = base.samples[i];
        var distance = Game.util.dist(
          sample.x, sample.y, selected.target.x, selected.target.y
        );
        if (distance >= 64 && distance <= 118 &&
            (!approachSample || Math.abs(distance - 88) <
              Math.abs(approachSample.distance - 88))) {
          approachSample = { sample: sample, distance: distance };
        }
      }
      if (approachSample) {
        selected.sample = approachSample.sample;
        selected.distance = approachSample.distance;
      }
    }
    return {
      target: selected.target,
      triggerAt: Math.max(2, selected.sample.t),
      initialDistance: selected.distance,
      synthetic: !!selected.target.synthetic
    };
  }

  function interactionDuration(kind) {
    return kind === 'gather'
      ? Game.F.BAL.gatherDuration : Game.F.BAL.chestOpenDuration;
  }

  function movementExpectation(state, interaction, policy) {
    var intentId = state === 'travel' ? 'frontier' : interaction;
    var shadowHero = {
      moveOrder: state === 'travel' ? { ai: true } : null,
      interactOrder: state === 'approach'
        ? { type: interaction, phase: null } :
        (state === 'act' ? { type: interaction, phase: 'act' } : null)
    };
    var production = Game.expeditionAI && Game.expeditionAI.movementExpectation
      ? Game.expeditionAI.movementExpectation(shadowHero, intentId)
      : { expected: state === 'travel', source: state === 'travel' ? 'route-intent' : 'none' };
    var productionExpected = !!production.expected;
    var expected = productionExpected;
    if (policy === 'legacy' && state === 'approach') expected = false;
    return {
      production: productionExpected,
      policy: expected,
      expected: expected,
      source: expected ? production.source : 'none'
    };
  }

  function run(layout, scenarioId, policy, base) {
    var scenario = SCENARIOS[scenarioId];
    if (!scenario) throw new Error('Unknown auto-route audit scenario: ' + scenarioId);
    policy = policy === 'legacy' ? 'legacy' : 'current';
    base = base || baseline(layout);
    mount(layout);

    var hero = {
      kind: 'hero', x: layout.camp.x, y: layout.camp.y,
      navRoute: null, moving: false, dir: 'd'
    };
    var prepared = prepare(layout, base, scenario);
    var target = prepared.target;
    var mainTarget = layout.bossPoint;
    var state = 'travel';
    var stateSince = 0;
    var triggered = false;
    var completed = false;
    var interrupted = false;
    var expired = false;
    var fallbackInjected = false;
    var fallbackObserved = false;
    var softRecovery = false;
    var cacheRecovery = false;
    var terminal = null;
    var reason = null;
    var actRemaining = 0;
    var combatRemaining = 0;
    var movementWatchdog = Game.expeditionAI &&
      Game.expeditionAI.createMovementWatchdog &&
      Game.expeditionAI.createMovementWatchdog();
    if (!movementWatchdog) {
      throw new Error('Production movement watchdog is unavailable');
    }
    var watchdogStill = 0;
    var watchdogStillMax = 0;
    var physicalStill = 0;
    var physicalStillMax = 0;
    var approachSeconds = 0;
    var coveredApproachSeconds = 0;
    var policyCoveredApproachSeconds = 0;
    var resumeAt = null;
    var resumeLatency = null;
    var failedPathKey = null;
    var logs = [];
    var samples = [];
    var transitions = 0;
    var navFallbacks = 0;
    var cacheInvalidations = 0;
    var tick = 0;
    var maxSeconds = Math.min(210, Math.max(40, base.duration + 28));

    function record(event, detail) {
      var entry = Object.assign({
        t: +(tick * DT).toFixed(2),
        event: event,
        state: state,
        x: +hero.x.toFixed(1),
        y: +hero.y.toFixed(1),
        target: state === 'travel' ? 'boss-lair' : target.id,
        distance: +(state === 'travel'
          ? Game.util.dist(hero.x, hero.y, mainTarget.x, mainTarget.y)
          : Game.util.dist(hero.x, hero.y, target.x, target.y)).toFixed(1),
        nav: routeSnapshot(hero)
      }, detail || {});
      logs.push(entry);
      transitions++;
      samples.push({
        t: entry.t, x: hero.x, y: hero.y,
        state: state, event: event
      });
    }

    function transition(next, event, detail) {
      state = next;
      stateSince = tick * DT;
      record(event, detail);
    }

    function resume(event, detail) {
      Game.nav.clear(hero);
      resumeAt = tick * DT;
      transition('travel', event, detail);
    }

    record('route:start', { policy: policy, scenario: scenario.id });
    for (; tick < Math.ceil(maxSeconds / DT); tick++) {
      var now = tick * DT;
      var beforeX = hero.x;
      var beforeY = hero.y;
      hero.moving = false;
      Game.nav.update(2);

      if (state === 'travel' && !triggered && now >= prepared.triggerAt) {
        triggered = true;
        Game.nav.clear(hero);
        transition('approach', 'interaction:queued', {
          interaction: scenario.interaction,
          synthetic: prepared.synthetic,
          triggerAt: +prepared.triggerAt.toFixed(2)
        });
      }

      if (state === 'travel') {
        var remaining = Game.nav.step(
          hero, mainTarget.x, mainTarget.y, SPEED, DT, 'audit:main', directMove
        );
        if (remaining < 5) {
          terminal = triggered ? 'reached' : 'invalid';
          reason = triggered ? null : 'interaction-not-triggered';
          record(triggered ? 'route:reached' : 'audit:invalid');
          break;
        }
      } else if (state === 'approach') {
        var approachAge = now - stateSince;
        if (scenario.expireAfter !== undefined && approachAge >= scenario.expireAfter) {
          expired = true;
          record('interaction:expired', { interaction: scenario.interaction });
          resume('route:resumed', { reason: 'expired' });
        } else if (Game.util.dist(hero.x, hero.y, target.x, target.y) <= REACH) {
          Game.nav.clear(hero);
          actRemaining = interactionDuration(scenario.interaction);
          transition('act', 'interaction:started', {
            interaction: scenario.interaction,
            duration: actRemaining
          });
        } else {
          if (scenario.injectFallback && !fallbackInjected) {
            var journey = Game.nav.planJourney(hero.x, hero.y, target.x, target.y);
            var firstLeg = journey.legs[0];
            failedPathKey = Game.nav.pathKey(hero.x, hero.y, firstLeg.x, firstLeg.y);
            Game.nav.cache[failedPathKey] = null;
            fallbackInjected = true;
            record('nav:fallback-injected', { pathKey: failedPathKey });
          }
          Game.nav.step(
            hero, target.x, target.y, SPEED, DT,
            'interact:' + target.id, directMove
          );
          if (hero.navRoute && hero.navRoute.fallback && !fallbackObserved) {
            fallbackObserved = true;
            navFallbacks++;
            record('nav:fallback-observed', { pathKey: hero.navRoute.pathKey });
          }
        }
      } else if (state === 'act') {
        var actAge = now - stateSince;
        if (scenario.threatAfter !== undefined && !interrupted &&
            actAge >= scenario.threatAfter) {
          interrupted = true;
          combatRemaining = 1.25;
          record('interaction:interrupted', { reason: 'combat' });
          transition('combat', 'combat:started', { duration: combatRemaining });
        } else {
          actRemaining -= DT;
          if (actRemaining <= 0) {
            completed = true;
            record('interaction:completed', { interaction: scenario.interaction });
            resume('route:resumed', { reason: 'completed' });
          }
        }
      } else if (state === 'combat') {
        combatRemaining -= DT;
        if (combatRemaining <= 0) {
          record('combat:ended');
          resume('route:resumed', { reason: 'combat-ended' });
        }
      }

      var moved = Game.util.dist(beforeX, beforeY, hero.x, hero.y);
      var expectation = movementExpectation(state, scenario.interaction, policy);
      if (state === 'approach') {
        approachSeconds += DT;
        if (expectation.production) coveredApproachSeconds += DT;
        if (expectation.policy) policyCoveredApproachSeconds += DT;
        physicalStill = moved < 0.05 ? physicalStill + DT : 0;
        physicalStillMax = Math.max(physicalStillMax, physicalStill);
      } else {
        physicalStill = 0;
      }
      var watchdog = movementWatchdog.update(
        hero.x, hero.y, DT, expectation.expected
      );
      watchdogStill = watchdog.still;
      watchdogStillMax = Math.max(watchdogStillMax, watchdogStill);

      if (policy === 'current' && state === 'approach') {
        if (watchdog.action === 'route-reset') {
          softRecovery = true;
          Game.nav.clear(hero);
          record('watchdog:route-reset', {
            still: +watchdogStill.toFixed(2),
            progress: +watchdog.progress.toFixed(2)
          });
        }
        if (watchdog.action === 'cache-recovery') {
          cacheRecovery = true;
          var pathKey = hero.navRoute && hero.navRoute.pathKey || failedPathKey;
          if (Game.nav.recover(hero)) cacheInvalidations++;
          record('watchdog:cache-invalidated', {
            still: +watchdogStill.toFixed(2),
            progress: +watchdog.progress.toFixed(2),
            pathKey: pathKey || null
          });
        }
        if (watchdog.action === 'cancel') {
          record('watchdog:interaction-cancelled', {
            still: +watchdogStill.toFixed(2),
            progress: +watchdog.progress.toFixed(2)
          });
          resume('route:resumed', { reason: 'stuck-fallback' });
        }
      }

      if (resumeAt !== null && resumeLatency === null && state === 'travel' && moved >= 0.6) {
        resumeLatency = +(now - resumeAt).toFixed(2);
        record('route:movement-resumed', { latency: resumeLatency });
      }

      if (state === 'approach' && physicalStill >= AUDIT_STALL_LIMIT) {
        terminal = 'stalled';
        reason = expectation.expected
          ? 'recovery-exhausted' : 'interaction-watchdog-unarmed';
        record('audit:stalled', {
          physicalStill: +physicalStill.toFixed(2),
          watchdogStill: +watchdogStill.toFixed(2),
          expectedChestRelease: scenario.interaction === 'chest'
            ? Game.F.BAL.chestTtl : null
        });
        break;
      }

      if (tick % 5 === 0) {
        samples.push({ t: +now.toFixed(2), x: hero.x, y: hero.y, state: state });
      }
    }

    if (!terminal) {
      terminal = 'timeout';
      reason = 'audit-timeout';
      record('audit:timeout');
    }
    var recoveryCount = hero.navRoute && hero.navRoute.recoveries || 0;
    return {
      scenario: scenario.id,
      policy: policy,
      passed: terminal === 'reached',
      expectedLegacyGap: !!scenario.injectFallback && policy === 'legacy',
      terminal: terminal,
      reason: reason,
      duration: +(tick * DT).toFixed(2),
      remaining: +Game.util.dist(hero.x, hero.y, mainTarget.x, mainTarget.y).toFixed(2),
      interaction: {
        type: scenario.interaction,
        targetId: target.id,
        synthetic: prepared.synthetic,
        triggered: triggered,
        completed: completed,
        interrupted: interrupted,
        expired: expired
      },
      watchdog: {
        productionCoverage: approachSeconds
          ? +(coveredApproachSeconds / approachSeconds).toFixed(3) : 1,
        policyCoverage: approachSeconds
          ? +(policyCoveredApproachSeconds / approachSeconds).toFixed(3) : 1,
        maxStill: +watchdogStillMax.toFixed(2),
        maxPhysicalStill: +physicalStillMax.toFixed(2),
        softResets: softRecovery ? 1 : 0,
        cacheInvalidations: cacheInvalidations
      },
      navigation: {
        fallbackCount: navFallbacks,
        recoveryCount: recoveryCount,
        resumeLatency: resumeLatency,
        peakSolveMs: +Game.nav.diagnostics.peakMs.toFixed(3)
      },
      transitions: transitions,
      logs: logs,
      samples: samples,
      target: { id: target.id, x: target.x, y: target.y }
    };
  }

  function isExpectedLegacyGap(run) {
    return !!(run && !run.passed &&
      run.reason === 'interaction-watchdog-unarmed' &&
      run.interaction && run.interaction.triggered &&
      run.navigation && run.navigation.fallbackCount >= 1 &&
      run.logs && run.logs.some(function (entry) {
        return entry.event === 'nav:fallback-observed';
      }));
  }

  function compare(layout, scenarioId, base) {
    base = base || baseline(layout);
    var legacy = run(layout, scenarioId, 'legacy', base);
    var current = run(layout, scenarioId, 'current', base);
    return {
      scenario: scenarioId,
      reproduced: isExpectedLegacyGap(legacy) && current.passed,
      legacy: legacy,
      current: current
    };
  }

  function summarize(results) {
    var durations = results.map(function (result) { return result.duration; })
      .sort(function (a, b) { return a - b; });
    var passed = results.filter(function (result) { return result.passed; }).length;
    return {
      total: results.length,
      passed: passed,
      failed: results.length - passed,
      longest: durations.length ? durations[durations.length - 1] : 0,
      fallbackCount: results.reduce(function (sum, result) {
        return sum + result.navigation.fallbackCount;
      }, 0),
      cacheInvalidations: results.reduce(function (sum, result) {
        return sum + result.watchdog.cacheInvalidations;
      }, 0)
    };
  }

  Game.autoRouteAudit = {
    DT: DT,
    SPEED: SPEED,
    scenarios: SCENARIOS,
    baseline: baseline,
    run: run,
    compare: compare,
    isExpectedLegacyGap: isExpectedLegacyGap,
    summarize: summarize
  };
})();
