'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const output = execFileSync(process.execPath, ['tools/audit-content.js', '--fixture'], {
  cwd: ROOT, encoding: 'utf8'
});
const audit = JSON.parse(output);
assert.equal(audit.ok, true);
assert.ok(audit.packs.some((pack) => pack.id === 'fixture.authoring'));
assert.equal(audit.counts.actorArchetype, 29);
assert.match(require('node:fs').readFileSync(path.join(ROOT, 'tools/scaffold-actor.ps1'), 'utf8'),
  /OutputDirectory must stay inside js\/data\/packs/);
console.log('V2 authoring smoke passed: external Pack, strict references, scaffold boundary.');
