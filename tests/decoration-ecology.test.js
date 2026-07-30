'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadProductionContent } = require('./helpers/production-content');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

global.window = global;
const load = (file) => vm.runInThisContext(read(file), { filename: file });
loadProductionContent(load, global);
load('js/systems/terrain.js');
load('js/systems/terrain_v3.js');

const Game = global.Game;
const regions = Game.reg.all('region');
const allowedPatterns = new Set([
  'field', 'blob', 'edgeBand', 'line', 'ring', 'arc', 'row', 'trail', 'scatter'
]);
const observedPatterns = new Set();
let layouts = 0;

for (const region of regions) {
  const definitions = region.terrain.deco || [];
  for (const definition of definitions) {
    assert.ok(definition.distribution,
      `${region.id}:${definition.sprite} has a v3 distribution profile`);
    assert.ok(allowedPatterns.has(definition.distribution.pattern),
      `${region.id}:${definition.sprite} uses a supported placement grammar`);
    assert.ok(definition.distribution.fieldScale >= 64,
      `${region.id}:${definition.sprite} declares a coherent habitat scale`);
    if (definition.v3Only) {
      assert.ok(Object.hasOwn(definition.distribution, 'solitaryRate'),
        `${region.id}:${definition.sprite} explicitly declares cluster balance`);
    }
  }

  let firstSnapshot = null;
  let alternateSnapshot = null;
  for (let ordinal = 1; ordinal <= 12; ordinal++) {
    const seed = Math.imul(ordinal, 2654435761) >>> 0;
    const layout = Game.terrain.generate(region, seed, 3);
    const report = Game.terrain.validate(layout, region);
    const ecology = layout.decorationEcology;

    assert.equal(report.valid, true,
      `${region.id}:${seed} remains a valid navigation layout`);
    assert.equal(layout.regionId, region.id);
    assert.ok(layout.props.length >= 550,
      `${region.id}:${seed} retains the v3 environment-density contract`);
    assert.ok(layout.props.filter((prop) => prop.blockerProp).length >= 350,
      `${region.id}:${seed} retains hard-blocker visual coverage`);
    assert.equal(ecology.method, 'habitat-cluster-grammar');
    assert.equal(ecology.version, 1);
    assert.ok(ecology.clusters.length >= 20,
      `${region.id}:${seed} exposes cluster centers for diagnostics`);
    assert.ok(ecology.metrics.sameTypeEnrichment >= 1.5,
      `${region.id}:${seed} is measurably richer than independent mark mixing`);
    assert.ok(ecology.metrics.meanNearest >= 15 && ecology.metrics.meanNearest <= 90,
      `${region.id}:${seed} preserves readable but non-uniform spacing`);
    assert.ok(ecology.metrics.cohesiveShare >= 0.55,
      `${region.id}:${seed} keeps a majority of props near same-type neighbours`);
    assert.ok(ecology.metrics.emptyCellShare >= 0.1 && ecology.metrics.emptyCellShare <= 0.85,
      `${region.id}:${seed} contains both inhabited zones and negative space`);

    const targets = Object.values(ecology.targets);
    const targetTotal = targets.reduce((sum, target) => sum + target.target, 0);
    const placedTotal = targets.reduce((sum, target) => sum + target.placed, 0);
    assert.ok(placedTotal / targetTotal >= 0.85,
      `${region.id}:${seed} fulfills at least 85% of authored decoration quotas`);
    assert.ok(targets.every((target) => target.placed > 0),
      `${region.id}:${seed} represents every configured non-blocker definition`);

    for (const pattern of Object.keys(ecology.metrics.patterns)) {
      observedPatterns.add(pattern);
    }
    for (const cluster of ecology.clusters) {
      assert.ok(allowedPatterns.has(cluster.pattern));
      assert.ok(Number.isFinite(cluster.x) && Number.isFinite(cluster.y));
      assert.ok(cluster.radiusX >= 12 && cluster.radiusY >= 12);
      assert.ok(cluster.placed <= cluster.target);
    }

    const definitionBySprite = Object.fromEntries(
      definitions.map((definition) => [definition.sprite, definition])
    );
    for (const prop of layout.props) {
      if (prop.campProp || prop.kind === 'bossDecor' || prop.blockerProp) continue;
      const definition = definitionBySprite[prop.sprite];
      assert.ok(definition, `${prop.sprite} has authoring data`);
      assert.ok(prop.decorGroup && prop.decorPattern && prop.decorRole,
        `${region.id}:${seed}:${prop.sprite} retains generation provenance`);
      const gx = Math.floor(prop.x / layout.nav.cell);
      const gy = Math.floor(prop.y / layout.nav.cell);
      assert.equal(layout.nav.grid[gy][gx], 1,
        `${region.id}:${seed}:${prop.sprite} stays on walkable terrain`);
      const material = layout.grid[
        Math.floor(prop.y / layout.cell) * layout.gw + Math.floor(prop.x / layout.cell)
      ];
      if (definition.placement === 'water') {
        assert.equal(material, 'water',
          `${region.id}:${seed}:${prop.sprite} follows its water habitat`);
      } else {
        assert.ok(!['water', 'lava', 'blocked', 'void'].includes(material),
          `${region.id}:${seed}:${prop.sprite} remains on legal ground`);
      }
    }

    if (ecology.details.tufts.target) {
      assert.ok(ecology.details.tufts.placed >= ecology.details.tufts.target * 0.95);
      assert.ok(ecology.details.tufts.groups >= 2);
    }
    if (ecology.details.flowers.target) {
      assert.ok(ecology.details.flowers.placed >= ecology.details.flowers.target * 0.95);
      assert.ok(ecology.details.flowers.groups >= 2);
    }

    if (ordinal === 1) {
      firstSnapshot = Game.terrain.decorationSnapshot(layout);
      const repeated = Game.terrain.generate(region, seed, 3);
      assert.deepEqual(
        Game.terrain.decorationSnapshot(repeated),
        firstSnapshot,
        `${region.id}:${seed} decoration ecology is deterministic`
      );
      const firstGround = definitions.find((definition) => definition.placement === 'ground');
      const field = Game.terrain.decorationField(layout, region, firstGround.sprite, 64);
      assert.equal(field.sprite, firstGround.sprite);
      assert.equal(field.values.length, field.cols * field.rows);
      assert.ok(field.max > 0 && field.viableShare > 0,
        `${region.id}:${seed} publishes a useful habitat diagnostic field`);
    }
    if (ordinal === 2) alternateSnapshot = Game.terrain.decorationSnapshot(layout);
    layouts++;
  }
  assert.notDeepEqual(
    alternateSnapshot && alternateSnapshot.props,
    firstSnapshot && firstSnapshot.props,
    `${region.id} changes decoration composition across world seeds`
  );
}

for (const pattern of ['blob', 'edgeBand', 'line', 'ring', 'arc', 'row', 'trail', 'scatter']) {
  assert.ok(observedPatterns.has(pattern), `production regions exercise the ${pattern} grammar`);
}

console.log(
  `Decoration ecology contract OK (${layouts} layouts, ` +
  `${observedPatterns.size} placement grammars).`
);
