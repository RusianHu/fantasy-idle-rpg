'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sandbox = {
  console,
  window: null,
  document: {
    documentElement: { lang: 'zh-CN' },
    querySelector: () => null,
    querySelectorAll: () => []
  },
  navigator: { language: 'zh-CN' },
  localStorage: { getItem: () => null, setItem: () => {} },
  matchMedia: () => ({ matches: false }),
  Math, Number, Date, Object, Array, JSON, Uint32Array
};
sandbox.window = sandbox;
vm.createContext(sandbox);

const bootstrap = [
  'js/core/utils.js',
  'js/core/eventbus.js',
  'js/core/registry.js',
  'js/core/content/rules.js',
  'js/core/content/schemas.js',
  'js/core/content/compiler.js',
  'js/core/content/audit.js',
  'js/core/content/registry.js',
  'js/core/content/support.js',
  'js/i18n/i18n.js',
  'js/i18n/zh-CN.js',
  'js/i18n/en.js',
  'js/i18n/combat-v2-zh-CN.js',
  'js/i18n/combat-v2-en.js',
  'js/core/assets.js',
  'js/sprites/palettes.js',
  'js/sprites/hero.js',
  'js/sprites/monsters_a.js',
  'js/sprites/monsters_b.js',
  'js/sprites/monsters_expansion.js',
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
];
for (const file of bootstrap) vm.runInContext(read(file), sandbox, { filename: file });
const fixtureOption = process.argv.find((argument) => argument.startsWith('--fixture='));
if (process.argv.includes('--fixture') || fixtureOption) {
  const fixture = fixtureOption
    ? fixtureOption.slice('--fixture='.length).replace(/\\/g, '/')
    : 'tests/fixtures/packs/authoring-smoke.pack.js';
  const fixturePath = path.resolve(root, fixture);
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (!fixturePath.startsWith(rootPrefix) || !fixture.endsWith('.pack.js')) {
    throw new Error('Fixture must be a *.pack.js file inside the workspace');
  }
  vm.runInContext(fs.readFileSync(fixturePath, 'utf8'), sandbox, { filename: fixture });
}

let audit;
try {
  audit = sandbox.Game.content.finalize({ strict: true });
} catch (error) {
  audit = sandbox.Game.content.audit();
  console.error(error.message);
}
console.log(JSON.stringify(audit, null, 2));
if (!audit.ok) process.exitCode = 1;
