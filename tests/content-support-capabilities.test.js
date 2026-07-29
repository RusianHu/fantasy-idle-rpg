'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BOOTSTRAP = [
  'js/core/utils.js',
  'js/core/content/rules.js',
  'js/core/content/compiler.js',
  'js/core/content/support.js'
];

function createRuntime() {
  const box = {
    console, window: null,
    Math, Number, Date, Object, Array, String, Boolean, JSON, Uint32Array
  };
  box.window = box;
  vm.createContext(box);
  for (const file of BOOTSTRAP) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), box, { filename: file });
  }
  return box.Game;
}

const allowed = createRuntime();
allowed.contentSupport.register({
  id: 'fixture.capability.allowed', version: '1.0.0',
  sourceFile: 'fixture/allowed.support.js',
  capabilities: ['authoring.write'],
  install(capabilities) {
    assert.equal(Object.prototype.hasOwnProperty.call(capabilities, 'Game'), false);
    capabilities.authoring.provideValue({
      id: 'fixture.value', version: 2, value: { enabled: true }
    });
    capabilities.authoring.provideFactory({
      id: 'fixture.factory', version: 3, fn: (value) => ({ value })
    });
  }
});
allowed.contentSupport.installAll();
assert.deepEqual(JSON.parse(JSON.stringify(allowed.contentAuthoring.value('fixture.value'))), {
  enabled: true
});
assert.deepEqual(JSON.parse(JSON.stringify(allowed.contentAuthoring.factory('fixture.factory')('ok'))), {
  value: 'ok'
});
assert.deepEqual(JSON.parse(JSON.stringify(allowed.contentAuthoring.audit())), [
  { kind: 'factory', id: 'fixture.factory', version: 3 },
  { kind: 'value', id: 'fixture.value', version: 2 }
]);

const denied = createRuntime();
denied.contentSupport.register({
  id: 'fixture.capability.denied', version: '1.0.0',
  sourceFile: 'fixture/denied.support.js', capabilities: [],
  install(capabilities) {
    capabilities.authoring.provideValue({
      id: 'fixture.denied', version: 1, value: true
    });
  }
});
assert.throws(() => denied.contentSupport.installAll(), /provideValue/);

const unknown = createRuntime();
assert.throws(() => unknown.contentSupport.register({
  id: 'fixture.capability.unknown', version: '1.0.0',
  sourceFile: 'fixture/unknown.support.js', capabilities: ['global.write'],
  install() {}
}), /unknown capability/);

const fixtureDirectory = path.join(ROOT, 'js', 'data', 'packs', `.support-test-${process.pid}`);
fs.mkdirSync(fixtureDirectory, { recursive: true });

function expectBuildFailure(name, source, pattern) {
  const file = path.join(fixtureDirectory, `${name}.support.js`);
  const sourceFile = path.relative(ROOT, file).replace(/\\/g, '/');
  fs.writeFileSync(file, source.replace('__SOURCE_FILE__', sourceFile), 'utf8');
  let failure = null;
  try {
    execFileSync(process.execPath, ['tools/build-content-bundle.js', '--check'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    failure = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
  } finally {
    fs.unlinkSync(file);
  }
  assert.ok(failure, `bundle build unexpectedly accepted ${name}`);
  assert.match(failure, pattern, name);
}

try {
  expectBuildFailure('top-level-mutation', `
(function () {
  var Game = window.Game;
  Game.contentSupport.register({
    id: 'fixture.support.top-level-mutation', version: '1.0.0',
    sourceFile: '__SOURCE_FILE__', capabilities: [], install: function () {}
  });
  Game.unauthorizedTopLevelMutation = true;
})();
`, /mutated the Game surface outside ContentSupport\.register/);

  expectBuildFailure('install-mutation', `
(function () {
  var Game = window.Game;
  Game.contentSupport.register({
    id: 'fixture.support.install-mutation', version: '1.0.0',
    sourceFile: '__SOURCE_FILE__', capabilities: [],
    install: function () { window.Game.unauthorizedInstallMutation = true; }
  });
})();
`, /mutated the Game surface during ContentSupport\.install/);
} finally {
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
}

console.log('ContentSupport capabilities passed: declared access and Game-surface isolation.');
