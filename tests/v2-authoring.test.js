'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const output = execFileSync(process.execPath, ['tools/audit-content.js', '--fixture'], {
  cwd: ROOT, encoding: 'utf8'
});
const audit = JSON.parse(output);
assert.equal(audit.ok, true);
assert.ok(audit.packs.some((pack) => pack.id === 'fixture.authoring'));
assert.equal(audit.counts.actorArchetype, 57);
assert.ok(audit.counts.worldSpawnProfile >= 29);
const scaffold = fs.readFileSync(path.join(ROOT, 'tools/scaffold-actor.ps1'), 'utf8');
assert.match(scaffold, /OutputDirectory must stay inside js\/data\/packs/);
assert.match(scaffold, /build-content-bundle\.js/);
assert.match(scaffold, /--check/);

const generatedDirectory = `js/data/packs/generated-test-${process.pid}`;
try {
  for (const category of [
    'monster', 'boss', 'npc', 'peaceful-creature', 'combat-npc', 'summon'
  ]) {
    const suffix = category.replace(/-/g, '_');
    const actorId = `fixture.scaffold_${suffix}_${process.pid}`;
    const packId = `fixture.scaffold-${suffix}-${process.pid}`;
    const generatedFile = execFileSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', 'tools/scaffold-actor.ps1',
      '-PackId', packId,
      '-ActorId', actorId,
      '-Category', category,
      '-OutputDirectory', generatedDirectory,
      '-SkipBuild'
    ], { cwd: ROOT, encoding: 'utf8' }).trim();
    const relativeFile = path.relative(ROOT, generatedFile).replace(/\\/g, '/');
    const generated = fs.readFileSync(generatedFile, 'utf8');
    [
      /locales:/, /interactionProfile:/, /engagementPolicy:/,
      /worldSpawnProfile:/, /mountTo:/, /actor_placeholder/
    ].forEach((pattern) => assert.match(generated, pattern, category));
    if (category === 'combat-npc') {
      assert.match(generated, /actorVariant:/);
      assert.match(generated, /encounterPack:/);
    }

    const generatedAudit = JSON.parse(execFileSync(process.execPath, [
      'tools/audit-content.js', `--fixture=${relativeFile}`
    ], { cwd: ROOT, encoding: 'utf8' }));
    assert.equal(generatedAudit.ok, true, category);
    assert.ok(generatedAudit.packs.some((pack) => pack.id === packId), category);
    assert.ok(generatedAudit.reverseReferences[actorId], category);
  }
} finally {
  fs.rmSync(path.join(ROOT, generatedDirectory), { recursive: true, force: true });
}
console.log('Authoring smoke passed: monster, peaceful NPC, combat Variant, summon, locales and mountTo.');
