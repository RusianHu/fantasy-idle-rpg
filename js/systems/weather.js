/* ============================================================
 * systems/weather.js — deterministic global fronts + regional climate mapping
 * Weather is derived from worldSeed/worldTime and is never persisted.
 * It only supplies presentation state and the Hazard visibility multiplier.
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util;

  var SLOT_SECONDS = 300;
  var TRANSITION_SECONDS = 24;
  var FRONTS = ['calm', 'wet', 'volatile', 'dry', 'arcane'];
  var FRONT_RULES = {
    calm: { weight: 30, intensity: [0.10, 0.30], visibility: 1 },
    wet: { weight: 25, intensity: [0.45, 0.70], visibility: 0.8 },
    volatile: { weight: 20, intensity: [0.75, 1.00], visibility: 0.65 },
    dry: { weight: 15, intensity: [0.40, 0.75], visibility: 0.9 },
    arcane: { weight: 10, intensity: [0.55, 0.90], visibility: 0.75 }
  };

  var activeRegionId = 'grassland';
  var cached = null;
  var signature = '';
  var previousWorldTime = null;
  var nextLightningAt = null;
  var preview = null;
  var initialized = false;

  function profile(regionId) {
    var region = Game.content && Game.content.get &&
      Game.content.get('regionProfile', regionId);
    return region && Game.content.get('climateProfile', region.climateProfileId);
  }

  function frontFor(seed, slotIndex) {
    var rng = U.seededRng(U.strSeed((seed >>> 0) + '|weather-front|' + slotIndex));
    var roll = rng() * 100;
    for (var i = 0; i < FRONTS.length; i++) {
      roll -= FRONT_RULES[FRONTS[i]].weight;
      if (roll < 0) return FRONTS[i];
    }
    return 'arcane';
  }

  function intensityFor(seed, slotIndex, front) {
    var range = FRONT_RULES[front].intensity;
    var rng = U.seededRng(U.strSeed((seed >>> 0) + '|weather-intensity|' + slotIndex));
    return U.lerp(range[0], range[1], rng());
  }

  function slotSample(seed, slotIndex, regionId) {
    var front = frontFor(seed, slotIndex);
    var climate = profile(regionId);
    if (!climate) return null;
    return {
      slotIndex: slotIndex,
      front: front,
      intensity: intensityFor(seed, slotIndex, front),
      visibility: FRONT_RULES[front].visibility,
      state: climate.states[front],
      climate: climate
    };
  }

  function precipitationStrength(slot) {
    if (!slot || !slot.state || !slot.state.precipitation) return 0;
    var type = slot.state.precipitation.type;
    if (type === 'none' || type === 'dust' || type === 'motes') return 0;
    return slot.intensity * slot.state.precipitation.density *
      slot.climate.factors.precipitation;
  }

  function wetnessFor(currentSlot, previousSlot, slotTime) {
    var currentRain = precipitationStrength(currentSlot);
    var previousRain = precipitationStrength(previousSlot);
    if (currentRain > 0) {
      var start = previousRain > 0 ? Math.min(1, previousRain) : 0;
      return U.lerp(start, Math.min(1, currentRain), U.clamp(slotTime / 45, 0, 1));
    }
    return Math.min(1, previousRain) * (1 - U.clamp(slotTime / 90, 0, 1));
  }

  function normalizeOptions(options) {
    options = options || {};
    var stateWorld = Game.state && Game.state.world || {};
    return {
      worldSeed: Number.isFinite(options.worldSeed)
        ? options.worldSeed >>> 0 : (Number(stateWorld.worldSeed) || 0) >>> 0,
      worldTime: Math.max(0, Number.isFinite(options.worldTime)
        ? options.worldTime : Number(stateWorld.worldTime) || 0),
      regionId: options.regionId || activeRegionId ||
        stateWorld.region || 'grassland',
      override: options.override || null
    };
  }

  function sample(options) {
    var input = normalizeOptions(options);
    var worldTime = input.worldTime;
    var slotIndex = Math.floor(worldTime / SLOT_SECONDS);
    var slotTime = worldTime - slotIndex * SLOT_SECONDS;
    var now = slotSample(input.worldSeed, slotIndex, input.regionId);
    var before = slotSample(input.worldSeed, slotIndex - 1, input.regionId) || now;
    if (!now) return null;
    var transitionProgress = U.clamp(slotTime / TRANSITION_SECONDS, 0, 1);
    var override = input.override || preview;
    if (override && override.mode === 'forced') {
      var forcedFront = FRONT_RULES[override.front] ? override.front : now.front;
      var forcedState = now.climate.states[forcedFront];
      if (override.state) {
        FRONTS.some(function (front) {
          if (now.climate.states[front].id !== override.state) return false;
          forcedFront = front;
          forcedState = now.climate.states[front];
          return true;
        });
      }
      now.front = forcedFront;
      now.state = forcedState;
      now.visibility = FRONT_RULES[forcedFront].visibility;
      if (Number.isFinite(override.intensity)) {
        now.intensity = U.clamp(override.intensity, 0, 1);
      }
      transitionProgress = Number.isFinite(override.transitionProgress)
        ? U.clamp(override.transitionProgress, 0, 1) : 1;
    }
    var intensity = U.lerp(before.intensity, now.intensity, transitionProgress);
    var visibility = U.lerp(before.visibility, now.visibility, transitionProgress);
    var factors = now.climate.factors;
    return {
      worldSeed: input.worldSeed,
      worldTime: worldTime,
      regionId: input.regionId,
      slotIndex: slotIndex,
      slotTime: slotTime,
      nextSwitchIn: SLOT_SECONDS - slotTime,
      transitionProgress: transitionProgress,
      front: now.front,
      previousFront: before.front,
      stateId: now.state.id,
      stateNameKey: now.state.nameKey,
      kind: now.state.kind,
      intensity: intensity,
      targetIntensity: now.intensity,
      visibilityMultiplier: visibility,
      wind: intensity * now.state.windMultiplier * factors.wind,
      cloudCover: U.lerp(before.state.cloudCover, now.state.cloudCover, transitionProgress),
      fogDensity: U.lerp(before.state.fogDensity, now.state.fogDensity, transitionProgress),
      precipitation: {
        type: now.state.precipitation.type,
        density: now.state.precipitation.density * intensity * factors.precipitation *
          (before.state.precipitation.type === now.state.precipitation.type
            ? 1 : transitionProgress)
      },
      wetness: wetnessFor(now, before, slotTime),
      lightning: now.state.lightning === true,
      ambientScale: now.state.ambientScale,
      tint: now.state.tint,
      exposure: now.climate.exposure,
      exposureFactors: factors,
      celestialVisibility: factors.celestial * (1 - now.state.cloudCover * intensity * 0.88),
      tintInfluence: factors.tint,
      profileId: now.climate.id,
      profileNameKey: now.climate.presentation.nameKey,
      preview: !!override
    };
  }

  function lightningSequence(sampled) {
    if (!sampled || !sampled.lightning) return [];
    var rng = U.seededRng(U.strSeed([
      sampled.worldSeed, sampled.slotIndex, sampled.regionId, 'lightning'
    ].join('|')));
    var at = sampled.slotIndex * SLOT_SECONDS + 8 + rng() * 10;
    var end = (sampled.slotIndex + 1) * SLOT_SECONDS;
    var out = [];
    while (at < end) {
      out.push(at);
      at += 8 + rng() * 10;
    }
    return out;
  }

  function armNextLightning(sampled, now) {
    nextLightningAt = null;
    var sequence = lightningSequence(sampled);
    for (var i = 0; i < sequence.length; i++) {
      if (sequence[i] > now + 0.0001) {
        nextLightningAt = sequence[i];
        break;
      }
    }
  }

  function emitLightning(sampled, at, manual) {
    var payload = {
      regionId: sampled.regionId,
      slotIndex: sampled.slotIndex,
      atWorldTime: at,
      intensity: sampled.intensity,
      exposure: sampled.exposure,
      manual: !!manual,
      seed: U.strSeed([
        sampled.worldSeed, sampled.slotIndex, sampled.regionId,
        Math.round(at * 1000), manual ? 'manual' : 'scheduled'
      ].join('|'))
    };
    Game.bus.emit('weather:lightning', payload);
    return payload;
  }

  var Weather = Game.weather = {
    constants: {
      slotSeconds: SLOT_SECONDS,
      transitionSeconds: TRANSITION_SECONDS,
      fronts: FRONTS.slice(),
      rules: FRONT_RULES
    },

    sample: sample,

    init: function () {
      if (initialized) return;
      initialized = true;
      if (Game.hazards && Game.hazards.registerDetectionModifierSource) {
        Game.hazards.registerDetectionModifierSource('weather:visibility', function (context) {
          return Weather.visibilityMultiplier(context && context.regionId);
        });
      }
      Game.bus.on('settings:changed', function (payload) {
        if (payload && payload.key === 'effects' && payload.value === false) {
          nextLightningAt = null;
        } else if (payload && payload.key === 'effects' && cached) {
          armNextLightning(cached, cached.worldTime);
        }
      });
    },

    enterRegion: function (regionId, options) {
      activeRegionId = regionId || activeRegionId;
      cached = sample(Object.assign({}, options || {}, { regionId: activeRegionId }));
      previousWorldTime = cached && cached.worldTime;
      signature = '';
      armNextLightning(cached, previousWorldTime || 0);
      Weather.update(0, previousWorldTime);
      return cached;
    },

    update: function (dt, worldTime) {
      var stateWorld = Game.state && Game.state.world || {};
      var now = Number.isFinite(worldTime) ? worldTime : Number(stateWorld.worldTime) || 0;
      var next = sample({ worldTime: now, regionId: activeRegionId });
      if (!next) return null;
      var nextSignature = [
        next.regionId, next.slotIndex, next.front, next.stateId,
        next.preview ? 'preview' : 'timeline'
      ].join('|');
      if (nextSignature !== signature) {
        signature = nextSignature;
        cached = next;
        armNextLightning(next, now);
        Game.bus.emit('weather:changed', Weather.current());
      } else {
        cached = next;
      }
      var effectsOn = !(Game.state && Game.state.settings &&
        Game.state.settings.effects === false);
      if (effectsOn && nextLightningAt !== null && previousWorldTime !== null &&
          now >= nextLightningAt && now >= previousWorldTime && next.lightning) {
        emitLightning(next, nextLightningAt, false);
        armNextLightning(next, nextLightningAt + 0.001);
      }
      previousWorldTime = now;
      if (Game.particles && Game.particles.setAmbientScale) {
        Game.particles.setAmbientScale(next.ambientScale);
      }
      return cached;
    },

    current: function () {
      return cached ? Object.assign({}, cached, {
        precipitation: Object.assign({}, cached.precipitation),
        exposureFactors: Object.assign({}, cached.exposureFactors)
      }) : sample();
    },

    inspect: function (options) {
      var sampled = options ? sample(options) : (cached || sample());
      if (!sampled) return null;
      var sequence = lightningSequence(sampled);
      return Object.assign({}, sampled, {
        lightningSequence: sequence,
        nextLightningAt: nextLightningAt,
        fronts: FRONTS.map(function (front) {
          var climate = profile(sampled.regionId);
          return {
            front: front,
            weight: FRONT_RULES[front].weight,
            intensity: FRONT_RULES[front].intensity.slice(),
            visibility: FRONT_RULES[front].visibility,
            state: climate && climate.states[front]
          };
        })
      });
    },

    visibilityMultiplier: function (regionId) {
      var sampled = regionId && regionId !== activeRegionId
        ? sample({ regionId: regionId }) : (cached || sample());
      return sampled ? sampled.visibilityMultiplier : 1;
    },

    setPreview: function (override) {
      preview = Object.assign({ mode: 'forced' }, override || {});
      signature = '';
      return Weather.update(0);
    },

    clearPreview: function () {
      preview = null;
      signature = '';
      return Weather.update(0);
    },

    preview: function () {
      return preview ? Object.assign({}, preview) : null;
    },

    triggerLightning: function () {
      var sampled = cached || sample();
      if (!sampled) return null;
      return emitLightning(sampled, sampled.worldTime, true);
    }
  };
})();
