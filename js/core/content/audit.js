/* Structured audit helpers. Diagnostics never mutate compiled content. */
(function () {
  'use strict';
  var Game = window.Game;

  Game.contentAudit = {
    issue: function (code, spec) {
      var out = { severity: 'error', code: code };
      Object.keys(spec || {}).forEach(function (key) { out[key] = spec[key]; });
      return out;
    },
    summary: function (issues, packs, definitions, fingerprint) {
      var counts = {};
      Object.keys(definitions || {}).sort().forEach(function (type) {
        counts[type] = Object.keys(definitions[type]).length;
      });
      return {
        ok: !issues.some(function (issue) { return issue.severity !== 'warning'; }),
        issues: issues.slice(),
        packs: (packs || []).map(function (pack) {
          return { id: pack.id, version: pack.version, schemaVersion: pack.schemaVersion };
        }),
        counts: counts,
        fingerprint: fingerprint || null
      };
    }
  };
})();
