/* Deterministic handler and formula registry used by compiled V2 content. */
(function () {
  'use strict';
  var Game = window.Game;
  var handlers = {};
  var formulas = {};

  function register(bucket, kind, spec) {
    if (!kind || !spec || !spec.id || typeof spec.fn !== 'function') {
      throw new Error('[Rules] invalid registration');
    }
    if (bucket[spec.id]) throw new Error('[Rules] duplicate ' + kind + ': ' + spec.id);
    if (spec.deterministic !== true) throw new Error('[Rules] non-deterministic ' + kind + ': ' + spec.id);
    bucket[spec.id] = Object.freeze({
      id: spec.id,
      version: Math.max(1, spec.version | 0),
      deterministic: true,
      access: Object.freeze((spec.access || []).slice()),
      fn: spec.fn
    });
    return bucket[spec.id];
  }

  Game.rules = {
    registerHandler: function (kind, spec) {
      handlers[kind] = handlers[kind] || {};
      return register(handlers[kind], kind, spec);
    },
    registerFormula: function (spec) {
      return register(formulas, 'formula', spec);
    },
    handler: function (kind, id) {
      return handlers[kind] && handlers[kind][id] || null;
    },
    formula: function (id) { return formulas[id] || null; },
    evaluate: function (id, context, params) {
      var formula = formulas[id];
      if (!formula) throw new Error('[Rules] unknown formula: ' + id);
      return formula.fn(context || {}, params || {});
    },
    audit: function () {
      var out = [];
      Object.keys(handlers).sort().forEach(function (kind) {
        Object.keys(handlers[kind]).sort().forEach(function (id) {
          out.push({ kind: kind, id: id, version: handlers[kind][id].version });
        });
      });
      Object.keys(formulas).sort().forEach(function (id) {
        out.push({ kind: 'formula', id: id, version: formulas[id].version });
      });
      return out;
    }
  };

})();
