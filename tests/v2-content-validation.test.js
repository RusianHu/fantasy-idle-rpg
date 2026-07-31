'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const sandbox = {
  console, window: null,
  document: { documentElement: { lang: 'zh-CN' } },
  navigator: { language: 'zh-CN' },
  Math, Number, Date, Object, Array, String, Boolean, JSON, Uint32Array
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(file) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, {
    filename: file
  });
}

[
  'js/core/utils.js', 'js/core/eventbus.js', 'js/core/registry.js',
  'js/core/content/rules.js', 'js/core/content/schemas.js',
  'js/core/content/compiler.js', 'js/core/content/audit.js',
  'js/core/content/registry.js', 'js/core/content/support.js', 'js/i18n/i18n.js',
  'js/i18n/zh-CN.js', 'js/i18n/en.js',
  'js/i18n/combat-v2-zh-CN.js', 'js/i18n/combat-v2-en.js',
  'js/core/assets.js', 'js/sprites/palettes.js', 'js/sprites/hero.js',
  'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js', 'js/sprites/monsters_expansion.js',
  'js/sprites/props.js',
  'js/sprites/ground-decorations/grassland.generated.js',
  'js/sprites/ground-decorations/forest.generated.js',
  'js/sprites/ground-decorations/mine.generated.js',
  'js/sprites/ground-decorations/graveyard.generated.js',
  'js/sprites/ground-decorations/snowpass.generated.js',
  'js/sprites/ground-decorations/lavacave.generated.js',
  'js/sprites/ground-decorations/skyruins.generated.js',
  'js/sprites/ground-decorations/darkcastle.generated.js',
  'js/sprites/exploration_v3.js',
  'js/data/content/content.generated.js'
].forEach(load);

sandbox.Game.content.registerPack({
  id: 'fixture.invalid-contracts',
  version: '1.0.0',
  schemaVersion: 1,
  requires: [{ id: 'core.combat', range: '^2.0.0' }],
  definitions: {
    talent: [{
      id: 'fixture_invalid_talent',
      classId: 'fighter',
      unlockLevel: 1,
      maxRank: 2,
      costs: [1, 0],
      grants: {
        modifyAbilityId: 'fighter.heavy_slash',
        patches: [{
          path: 'effects.99.params.coefficient',
          perRank: 0.1
        }]
      },
      modifiers: [{
        stat: 'missingStat',
        phase: 'addPct',
        operation: 'addPct',
        perRank: 0.1
      }],
      presentation: {
        nameKey: 'skill.ft_heavy.name',
        descKey: 'skill.ft_heavy.desc'
      }
    }],
    status: [{
      id: 'fixture_invalid_status',
      stacking: 'refresh',
      maxStacks: 2,
      durationTicks: 10,
      periodicIntervalTicks: 1,
      periodic: [{
        type: 'damage', damageTypeId: 'missingDamageType', amount: 1
      }],
      modifiers: [{
        stat: 'armor',
        phase: 'not-a-phase',
        operation: 'divide',
        value: 2
      }],
      presentation: {
        nameKey: 'combat.status.fighter_guard.name',
        icon: 'icon_skill_guard'
      }
    }],
    encounterProfile: [{
      id: 'fixture.invalid.encounter',
      regionId: 'grassland',
      rulesProfileId: 'core.rules.standard-v1',
      teamSlots: [{
        id: 'heroes', role: 'combatant', coalitionId: 'heroes',
        countsForCompletion: 'yes', rewardEligible: false
      }],
      relationMatrix: {},
      objectives: [{
        id: 'custom', type: 'custom', required: true,
        handlerId: 'fixture.missing-objective-handler', handlerVersion: 9,
        params: { threshold: 1 }
      }],
      completionPolicy: { mode: 'firstRequired', extra: true }
    }],
    hazardProfile: [{
      id: 'fixture.invalid.hazard',
      regionId: 'grassland',
      category: 'damageTrap',
      trigger: {
        mode: 'enter',
        shape: 'circle',
        radius: 24,
        movementTypes: ['ground'],
        actorFilter: 'playerParty',
        sweep: true,
        retrigger: 'afterExit'
      },
      detection: {
        clueRadius: 96,
        revealRadius: 64,
        revealChance: 1.1
      },
      lifecycle: {
        revealTicks: 8,
        warningTicks: 24,
        activeTicks: 8,
        cooldownTicks: 600
      },
      placement: {
        source: 'hazardAnchor',
        count: [1, 1],
        minCampDistance: 180,
        minLandmarkDistance: 48,
        minSpacing: 96,
        requireWalkableEscape: true
      },
      outcome: {
        type: 'applyEffects',
        pulses: 1,
        effects: [{
          type: 'damage',
          damageTypeId: 'piercing',
          formulaId: 'combat.hazard_damage_v1',
          params: { maxHpCoefficient: 0.06 },
          canCrit: false,
          canDodge: false,
          defenseMode: 'resistanceOnly'
        }]
      },
      presentation: {
        nameKey: 'hazard.grassland.thorn_stakes.name',
        descKey: 'hazard.grassland.thorn_stakes.desc',
        warningKey: 'hazard.grassland.thorn_stakes.warning',
        hitKey: 'hazard.grassland.thorn_stakes.hit'
      },
      visualProfileId: 'hazard.grassland.thorn_stakes.visual'
    }],
    worldSpawnProfile: [
      {
        id: 'fixture.invalid.spawn-mount',
        actorRef: { archetypeId: 'wolf_gray' },
        mountTo: [{
          populationId: 'population.grassland', channel: 'npc', mode: 'invalid'
        }],
        identity: { scope: 'regionStable' },
        placement: {
          selector: 'anchor', source: 'walkableNav', required: true,
          onFailure: 'skipOptional', offset: { x: 'bad', y: 0 },
          minClearance: -1, maxDanger: 2, extra: true
        },
        lifecycle: {
          activation: 'always', unload: 'keep', onDefeat: 'ignore', onEscape: 'ignore',
          respawn: { mode: 'sometimes', delay: 0, resetVariant: 'yes', extra: true },
          extra: true
        }
      },
      {
        id: 'fixture.invalid.spawn-count',
        actorRef: { archetypeId: 'wolf_gray' },
        mountTo: [{
          populationId: 'population.grassland', channel: 'rare',
          mode: 'required', count: 0
        }],
        identity: { scope: 'regionStable' },
        placement: {
          selector: 'candidate', source: 'spawnCandidates', required: false,
          onFailure: 'skipOptional'
        },
        lifecycle: {
          activation: 'regionActive', unload: 'despawn', onDefeat: 'closeLease',
          onEscape: 'closeLease', respawn: { mode: 'none', resetVariant: true }
        }
      },
      {
        id: 'fixture.invalid.spawn-weight',
        actorRef: { archetypeId: 'wolf_gray' },
        mountTo: [{
          populationId: 'population.grassland', channel: 'rare',
          mode: 'weighted', weight: 0, maxCount: 0
        }],
        identity: { scope: 'regionStable' },
        placement: {
          selector: 'candidate', source: 'spawnCandidates', required: false,
          onFailure: 'skipOptional'
        },
        lifecycle: {
          activation: 'regionActive', unload: 'despawn', onDefeat: 'closeLease',
          onEscape: 'closeLease', respawn: { mode: 'none', resetVariant: true }
        }
      }
    ]
  }
});

const audit = sandbox.Game.content.finalize();
const codes = new Set(audit.issues.map((entry) => entry.code));
assert.equal(audit.ok, false);
assert.ok(codes.has('talent-costs'));
assert.ok(codes.has('talent-patch-path'));
assert.ok(codes.has('modifier-stat'));
assert.ok(codes.has('modifier-phase'));
assert.ok(codes.has('modifier-operation'));
assert.ok(codes.has('status-max-stacks'));
assert.ok(codes.has('hazard-detection-chance'));
assert.ok(audit.issues.some((entry) =>
  entry.type === 'status' && entry.path === 'periodic.0.damageTypeId'));
for (const code of [
  'encounter-team-flags', 'encounter-objective-handler',
  'encounter-completion-policy', 'unknown-field',
  'mount-mode', 'mount-count', 'mount-weight', 'mount-max-count',
  'spawn-placement-source', 'spawn-placement-failure',
  'spawn-placement-offset', 'spawn-placement-number',
  'spawn-lifecycle', 'spawn-respawn'
]) {
  assert.ok(codes.has(code), `expected strict validation issue ${code}`);
}

console.log('V2 content validation tests passed: nested authoring and runtime contract guardrails.');
