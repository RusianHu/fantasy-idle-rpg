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
  'js/core/content/registry.js', 'js/i18n/i18n.js',
  'js/i18n/zh-CN.js', 'js/i18n/en.js',
  'js/i18n/combat-v2-zh-CN.js', 'js/i18n/combat-v2-en.js',
  'js/core/assets.js', 'js/sprites/palettes.js', 'js/sprites/hero.js',
  'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js',
  'js/sprites/props.js', 'js/sprites/exploration_v3.js',
  'js/data/packs/manifest.js'
].forEach(load);
sandbox.Game.CONTENT_PACK_FILES.forEach(load);

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
    }]
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
assert.ok(audit.issues.some((entry) =>
  entry.type === 'status' && entry.path === 'periodic.0.damageTypeId'));

console.log('V2 content validation tests passed: modifier, status, talent patch guardrails.');
