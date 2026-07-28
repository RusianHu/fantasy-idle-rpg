/* Pure helpers shared by the content registry, Node audit, and tests. */
(function () {
  'use strict';
  var Game = window.Game;

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (key) { out[key] = clone(value[key]); });
      return out;
    }
    return value;
  }

  function merge(dst, src) {
    Object.keys(src || {}).forEach(function (key) {
      var value = src[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (!dst[key] || typeof dst[key] !== 'object' || Array.isArray(dst[key])) dst[key] = {};
        merge(dst[key], value);
      } else {
        dst[key] = clone(value);
      }
    });
    return dst;
  }

  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ':' + stable(value[key]);
      }).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function freeze(value, seen) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    seen = seen || [];
    if (seen.indexOf(value) >= 0) return value;
    seen.push(value);
    Object.keys(value).forEach(function (key) { freeze(value[key], seen); });
    return Object.freeze(value);
  }

  function rangeSatisfied(version, range) {
    if (!range || range === '*') return true;
    if (range.charAt(0) === '^') {
      return version.split('.')[0] === range.slice(1).split('.')[0] &&
        version.localeCompare(range.slice(1), undefined, { numeric: true }) >= 0;
    }
    return version === range;
  }

  function topoSort(packs, issues) {
    var byId = {};
    packs.forEach(function (pack) { byId[pack.id] = pack; });
    var visiting = {}, visited = {}, out = [];
    function visit(pack) {
      if (visited[pack.id]) return;
      if (visiting[pack.id]) {
        issues.push({ code: 'pack-cycle', packId: pack.id, path: 'requires' });
        return;
      }
      visiting[pack.id] = true;
      (pack.requires || []).forEach(function (req) {
        var dep = byId[req.id];
        if (!dep) {
          issues.push({ code: 'missing-pack', packId: pack.id, ref: req.id, path: 'requires' });
          return;
        }
        if (!rangeSatisfied(dep.version, req.range)) {
          issues.push({ code: 'pack-version', packId: pack.id, ref: req.id, path: 'requires' });
        }
        visit(dep);
      });
      visiting[pack.id] = false;
      visited[pack.id] = true;
      out.push(pack);
    }
    packs.slice().sort(function (a, b) { return a.id.localeCompare(b.id); }).forEach(visit);
    return out;
  }

  Game.contentCompiler = {
    clone: clone,
    merge: merge,
    stableStringify: stable,
    deepFreeze: freeze,
    topoSort: topoSort,
    rangeSatisfied: rangeSatisfied
  };
})();
