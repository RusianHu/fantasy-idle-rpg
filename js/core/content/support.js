/* Deterministic authoring capabilities and ContentSupport installation. */
(function () {
  'use strict';
  var Game = window.Game;
  var compiler = Game.contentCompiler;
  var registrations = [];
  var byId = {};
  var installed = false;
  var authoringValues = {};
  var authoringFactories = {};

  function capabilityList(spec) {
    return (spec.capabilities || []).slice().sort();
  }

  function copyMeta(spec) {
    return {
      id: spec.id,
      version: spec.version,
      sourceFile: spec.sourceFile,
      requires: (spec.requires || []).map(function (req) {
        return { id: req.id, range: req.range || '*' };
      }),
      capabilities: capabilityList(spec)
    };
  }

  function validateAuthoringSpec(spec, kind) {
    if (!spec || !spec.id || !spec.version) {
      throw new Error('[ContentAuthoring] invalid ' + kind);
    }
    if (authoringValues[spec.id] || authoringFactories[spec.id]) {
      throw new Error('[ContentAuthoring] duplicate: ' + spec.id);
    }
  }

  function provideValue(spec) {
    validateAuthoringSpec(spec, 'value');
    authoringValues[spec.id] = Object.freeze({
      id: spec.id,
      version: spec.version,
      value: compiler.deepFreeze(compiler.clone(spec.value))
    });
    return authoringValues[spec.id].value;
  }

  function provideFactory(spec) {
    validateAuthoringSpec(spec, 'factory');
    if (typeof spec.fn !== 'function') throw new Error('[ContentAuthoring] factory fn required');
    authoringFactories[spec.id] = Object.freeze({
      id: spec.id,
      version: spec.version,
      fn: spec.fn
    });
    return spec.fn;
  }

  function value(id) {
    var entry = authoringValues[id];
    if (!entry) throw new Error('[ContentAuthoring] unknown value: ' + id);
    return entry.value;
  }

  function factory(id) {
    var entry = authoringFactories[id];
    if (!entry) throw new Error('[ContentAuthoring] unknown factory: ' + id);
    return entry.fn;
  }

  function authoringAudit() {
    return Object.keys(authoringValues).map(function (id) {
      return { kind: 'value', id: id, version: authoringValues[id].version };
    }).concat(Object.keys(authoringFactories).map(function (id) {
      return { kind: 'factory', id: id, version: authoringFactories[id].version };
    })).sort(function (a, b) {
      return a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
    });
  }

  Game.contentAuthoring = Object.freeze({
    value: value,
    factory: factory,
    audit: authoringAudit
  });

  function capabilitiesFor(spec) {
    var allowed = {};
    capabilityList(spec).forEach(function (id) { allowed[id] = true; });
    var authoring = {};
    var rules = {};
    if (allowed['authoring.read'] || allowed['authoring.write']) {
      authoring.value = value;
      authoring.factory = factory;
    }
    if (allowed['authoring.write']) {
      authoring.provideValue = provideValue;
      authoring.provideFactory = provideFactory;
    }
    if (allowed['rules.formula']) rules.registerFormula = Game.rules.registerFormula;
    if (allowed['rules.handler']) rules.registerHandler = Game.rules.registerHandler;
    return Object.freeze({
      authoring: Object.freeze(authoring),
      rules: Object.freeze(rules),
      compiler: Object.freeze({
        clone: compiler.clone,
        merge: compiler.merge,
        deepFreeze: compiler.deepFreeze,
        stableStringify: compiler.stableStringify
      })
    });
  }

  Game.contentSupport = {
    register: function (spec) {
      if (installed) throw new Error('[ContentSupport] already installed');
      if (!spec || !spec.id || !spec.version || !spec.sourceFile ||
          typeof spec.install !== 'function') {
        throw new Error('[ContentSupport] invalid registration');
      }
      var known = ['authoring.read', 'authoring.write', 'rules.formula', 'rules.handler'];
      capabilityList(spec).forEach(function (id) {
        if (known.indexOf(id) < 0) throw new Error('[ContentSupport] unknown capability: ' + id);
      });
      if (byId[spec.id]) throw new Error('[ContentSupport] duplicate support: ' + spec.id);
      byId[spec.id] = spec;
      registrations.push(spec);
      return spec;
    },

    installAll: function (hooks) {
      if (installed) return Game.contentSupport.metadata();
      hooks = hooks || {};
      var issues = [];
      var sorted = compiler.topoSort(registrations, issues);
      if (issues.length) {
        throw new Error('[ContentSupport] dependency audit failed: ' +
          issues.map(function (entry) { return entry.code + ':' + (entry.packId || entry.ref); }).join(', '));
      }
      sorted.forEach(function (spec) {
        if (hooks.beforeInstall) hooks.beforeInstall(copyMeta(spec));
        spec.install(capabilitiesFor(spec));
        if (hooks.afterInstall) hooks.afterInstall(copyMeta(spec));
      });
      installed = true;
      return sorted.map(copyMeta);
    },

    metadata: function () {
      return registrations.map(copyMeta).sort(function (a, b) { return a.id.localeCompare(b.id); });
    },

    isInstalled: function () { return installed; }
  };
})();
