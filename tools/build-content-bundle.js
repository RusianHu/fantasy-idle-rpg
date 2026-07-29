'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PACK_ROOT = path.join(ROOT, 'js', 'data', 'packs');
const OUT_ROOT = path.join(ROOT, 'js', 'data', 'content');
const BUNDLE_FILE = path.join(OUT_ROOT, 'content.generated.js');
const MANIFEST_FILE = path.join(OUT_ROOT, 'manifest.generated.js');
const CHECK = process.argv.includes('--check');

function posix(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function normalize(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function hash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

function discover() {
  const files = walk(PACK_ROOT).filter((file) => file.endsWith('.js'));
  const invalid = files.filter((file) => !/\.(pack|support)\.js$/.test(file));
  if (invalid.length) throw new Error(`Unclassified content source: ${invalid.map(posix).join(', ')}`);
  return files.map((file) => {
    const text = normalize(fs.readFileSync(file, 'utf8'));
    return { file, path: posix(file), text, sha256: hash(text), kind: file.endsWith('.pack.js') ? 'pack' : 'support' };
  });
}

function sandbox() {
  const box = {
    console, window: null,
    document: {
      documentElement: { lang: 'zh-CN' },
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ width: 0, height: 0, getContext: () => ({}) })
    },
    navigator: { language: 'zh-CN' },
    localStorage: { getItem: () => null, setItem: () => {} },
    matchMedia: () => ({ matches: false }),
    Math, Number, Date, Object, Array, String, Boolean, JSON, Uint32Array
  };
  box.window = box;
  vm.createContext(box);
  return box;
}

const BOOTSTRAP = [
  'js/core/utils.js', 'js/core/eventbus.js', 'js/core/registry.js',
  'js/core/content/rules.js', 'js/core/content/schemas.js',
  'js/core/content/compiler.js', 'js/core/content/audit.js',
  'js/core/content/registry.js', 'js/core/content/support.js',
  'js/i18n/i18n.js', 'js/i18n/zh-CN.js', 'js/i18n/en.js',
  'js/i18n/combat-v2-zh-CN.js', 'js/i18n/combat-v2-en.js',
  'js/core/assets.js', 'js/sprites/palettes.js', 'js/sprites/hero.js',
  'js/sprites/monsters_a.js', 'js/sprites/monsters_b.js', 'js/sprites/monsters_expansion.js',
  'js/sprites/props.js', 'js/sprites/exploration_v3.js'
];

function run(box, file, source) {
  vm.runInContext(source, box, { filename: file });
}

function surfaceSnapshot(value, seen, depth) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'function') return `function:${Function.prototype.toString.call(value)}`;
  if (typeof value !== 'object') return `${typeof value}:${String(value)}`;
  if (depth > 5) return Object.prototype.toString.call(value);
  seen = seen || new Map();
  if (seen.has(value)) return `[circular:${seen.get(value)}]`;
  const label = `#${seen.size}`;
  seen.set(value, label);
  return Object.getOwnPropertyNames(value).sort().map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const flags = `${descriptor.enumerable ? 'e' : '-'}${descriptor.configurable ? 'c' : '-'}`;
    if ('value' in descriptor) {
      return `${key}:${flags}:${descriptor.writable ? 'w' : '-'}:${surfaceSnapshot(descriptor.value, seen, depth + 1)}`;
    }
    return `${key}:${flags}:accessor:${surfaceSnapshot(descriptor.get, seen, depth + 1)}:${surfaceSnapshot(descriptor.set, seen, depth + 1)}`;
  }).join('|');
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function capture(box, audit) {
  const definitions = {};
  box.Game.contentSchemas.definitionTypes.forEach((type) => {
    definitions[type] = plain(box.Game.content.all(type));
  });
  const localeKeys = new Set();
  Object.values(definitions).forEach((list) => list.forEach((definition) => {
    const visit = (value, key) => {
      if (Array.isArray(value)) return value.forEach((entry) => visit(entry, key));
      if (value && typeof value === 'object') {
        return Object.keys(value).forEach((field) => visit(value[field], field));
      }
      if (typeof value === 'string' && /Key$/.test(key || '')) localeKeys.add(value);
    };
    visit(definition, 'definition');
  }));
  const locales = {};
  box.Game.i18n.locales().forEach((locale) => {
    locales[locale] = {};
    Array.from(localeKeys).sort().forEach((key) => {
      const value = box.Game.i18n.raw(locale, key);
      if (value !== undefined) locales[locale][key] = value;
    });
  });
  return plain({
    supports: box.Game.contentSupport.metadata(),
    authoring: box.Game.contentAuthoring.audit(),
    packs: box.Game.content.packs(),
    fingerprint: audit.fingerprint,
    counts: audit.counts,
    definitions,
    locales,
    populationViews: box.Game.content.populationViews(),
    reverseReferences: audit.reverseReferences,
    regions: box.Game.reg.all('region'),
    monsters: box.Game.reg.all('monster')
  });
}

function inspectSources(sources) {
  const box = sandbox();
  BOOTSTRAP.forEach((file) => run(box, file, normalize(fs.readFileSync(path.join(ROOT, file), 'utf8'))));
  const supportCalls = [];
  const packCalls = [];
  const originalSupport = box.Game.contentSupport.register;
  const originalPack = box.Game.content.registerPack;
  box.Game.contentSupport.register = (spec) => {
    supportCalls.push({
      id: spec.id, version: spec.version, sourceFile: spec.sourceFile,
      capabilities: (spec.capabilities || []).slice().sort()
    });
    return originalSupport(spec);
  };
  box.Game.content.registerPack = (pack) => {
    packCalls.push({ id: pack.id, version: pack.version, sourceFile: pack.sourceFile });
    return originalPack(pack);
  };
  for (const source of sources.filter((entry) => entry.kind === 'support')) {
    const beforeSupport = supportCalls.length;
    const beforePack = packCalls.length;
    const beforeSurface = surfaceSnapshot(box.Game, null, 0);
    run(box, source.path, source.text);
    if (supportCalls.length !== beforeSupport + 1 || packCalls.length !== beforePack) {
      throw new Error(`${source.path} must register exactly one ContentSupport and no Pack`);
    }
    if (supportCalls[supportCalls.length - 1].sourceFile !== source.path) {
      throw new Error(`${source.path} sourceFile mismatch: ${supportCalls[supportCalls.length - 1].sourceFile}`);
    }
    if (surfaceSnapshot(box.Game, null, 0) !== beforeSurface) {
      throw new Error(`${source.path} mutated the Game surface outside ContentSupport.register`);
    }
  }
  let installSurface = null;
  box.Game.contentSupport.installAll({
    beforeInstall: () => { installSurface = surfaceSnapshot(box.Game, null, 0); },
    afterInstall: (support) => {
      const after = surfaceSnapshot(box.Game, null, 0);
      if (after !== installSurface) {
        throw new Error(`${support.sourceFile} mutated the Game surface during ContentSupport.install`);
      }
    }
  });

  for (const source of sources.filter((entry) => entry.kind === 'pack')) {
    const beforePack = packCalls.length;
    const beforeSupport = supportCalls.length;
    const beforeSurface = surfaceSnapshot(box.Game, null, 0);
    run(box, source.path, source.text);
    if (packCalls.length !== beforePack + 1 || supportCalls.length !== beforeSupport) {
      throw new Error(`${source.path} must register exactly one Pack and no ContentSupport`);
    }
    const pack = packCalls[packCalls.length - 1];
    if (pack.sourceFile !== source.path) throw new Error(`${source.path} sourceFile mismatch: ${pack.sourceFile}`);
    if (surfaceSnapshot(box.Game, null, 0) !== beforeSurface) {
      throw new Error(`${source.path} mutated the Game surface outside content.registerPack`);
    }
  }
  const audit = box.Game.content.finalize({ strict: true });
  return {
    supports: box.Game.contentSupport.metadata(),
    authoring: box.Game.contentAuthoring.audit(),
    packs: packCalls.map(({ id, version }) => ({ id, version })).sort((a, b) => a.id.localeCompare(b.id)),
    fingerprint: audit.fingerprint, audit, snapshot: capture(box, audit)
  };
}

function literal(value) { return JSON.stringify(value, null, 2); }

function build(sources, inspected) {
  const sourceList = sources.map(({ path: sourcePath, kind, sha256 }) => ({ path: sourcePath, kind, sha256 }));
  const sourceSetHash = hash(JSON.stringify(sourceList));
  const meta = {
    schemaVersion: 1, sourceSetHash, sources: sourceList,
    supports: inspected.supports, authoring: inspected.authoring, packs: inspected.packs,
    contentFingerprint: inspected.fingerprint
  };
  const supportText = sources.filter((entry) => entry.kind === 'support').map((entry) =>
    `/* source: ${entry.path} */\n${entry.text}`).join('\n');
  const packText = sources.filter((entry) => entry.kind === 'pack').map((entry) =>
    `/* source: ${entry.path} */\n${entry.text}`).join('\n');
  const bundle = normalize(`/* GENERATED by tools/build-content-bundle.js. DO NOT EDIT. */
(function () {
  'use strict';
  window.Game.CONTENT_BUNDLE_META = Object.freeze(${literal(meta)});
})();
${supportText}
window.Game.contentSupport.installAll();
${packText.trimEnd()}
`);
  const manifest = normalize(`/* GENERATED by tools/build-content-bundle.js. DO NOT EDIT. */
(function () {
  'use strict';
  window.Game.CONTENT_MANIFEST = Object.freeze(${literal(meta)});
})();
`);
  return { bundle, manifest, meta };
}

function compare(file, expected) {
  return fs.existsSync(file) && normalize(fs.readFileSync(file, 'utf8')) === expected;
}

function inspectBundle(bundle, expectedMeta) {
  const box = sandbox();
  BOOTSTRAP.forEach((file) => run(box, file, normalize(fs.readFileSync(path.join(ROOT, file), 'utf8'))));
  run(box, 'js/data/content/content.generated.js', bundle);
  const audit = box.Game.content.finalize({ strict: true });
  const meta = plain(box.Game.CONTENT_BUNDLE_META);
  if (JSON.stringify(meta) !== JSON.stringify(expectedMeta)) {
    throw new Error('Generated bundle metadata does not match discovered sources');
  }
  return capture(box, audit);
}

const sources = discover();
const inspected = inspectSources(sources);
const output = build(sources, inspected);
const bundleSnapshot = inspectBundle(output.bundle, output.meta);
if (JSON.stringify(bundleSnapshot) !== JSON.stringify(inspected.snapshot)) {
  throw new Error('Source VM and bundle VM compiled content differ');
}
if (CHECK) {
  const stale = [];
  if (!compare(BUNDLE_FILE, output.bundle)) stale.push(posix(BUNDLE_FILE));
  if (!compare(MANIFEST_FILE, output.manifest)) stale.push(posix(MANIFEST_FILE));
  if (stale.length) throw new Error(`Stale generated content: ${stale.join(', ')}`);
} else {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(BUNDLE_FILE, output.bundle, 'utf8');
  fs.writeFileSync(MANIFEST_FILE, output.manifest, 'utf8');
}
process.stdout.write(JSON.stringify(output.meta, null, 2) + '\n');
