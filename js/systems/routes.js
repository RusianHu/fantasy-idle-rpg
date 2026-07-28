/* ============================================================
 * systems/routes.js - deterministic campaign route planner
 *
 * The persisted RoutePlan owns mainline topology and optional excursion
 * records. regionOrder remains a compatibility projection for systems that
 * only need the eight-region progression spine.
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, reg = Game.reg;
  var PLAN_SCHEMA_VERSION = 1;
  var DEFAULT_TEMPLATE_ID = 'lucia-campaign';
  var VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

  function safeClone(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map(safeClone);
    if (!value || typeof value !== 'object') return undefined;
    var out = {};
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
      var next = safeClone(value[key]);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }

  function templateById(templateId) {
    return reg.get('routeTemplate', templateId || DEFAULT_TEMPLATE_ID);
  }

  function templateNodes(template) {
    var nodes = [];
    (template.chapters || []).forEach(function (chapter) {
      (chapter.nodes || []).forEach(function (node) {
        var next = safeClone(node);
        next.chapterId = next.chapterId || chapter.id;
        nodes.push(next);
      });
    });
    return nodes;
  }

  function normalizeRegionIds(savedOrder) {
    var canonical = reg.ids('region');
    var source = Array.isArray(savedOrder) ? savedOrder : canonical;
    var seen = {}, out = [];
    source.forEach(function (regionId) {
      if (!seen[regionId] && reg.has('region', regionId)) {
        seen[regionId] = true;
        out.push(regionId);
      }
    });
    canonical.forEach(function (regionId) {
      if (!seen[regionId]) out.push(regionId);
    });
    return out;
  }

  function shuffleGroups(nodes, template, seed) {
    var groups = {};
    nodes.forEach(function (node, index) {
      if (!node.shuffleGroup) return;
      if (!groups[node.shuffleGroup]) groups[node.shuffleGroup] = [];
      groups[node.shuffleGroup].push(index);
    });
    Object.keys(groups).sort().forEach(function (groupId) {
      var indexes = groups[groupId];
      var groupDef = template.randomization && template.randomization.groups &&
        template.randomization.groups[groupId] || {};
      var namespace = groupDef.seedNamespace || groupId;
      var rng = U.seededRng(U.strSeed((seed >>> 0) + '|' + template.id + '|' + namespace));
      var values = indexes.map(function (index) { return nodes[index]; });
      for (var i = values.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = values[i];
        values[i] = values[j];
        values[j] = tmp;
      }
      indexes.forEach(function (index, valueIndex) { nodes[index] = values[valueIndex]; });
    });
    return nodes;
  }

  function nodeForRegion(template, regionId) {
    var nodes = templateNodes(template);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].destination && nodes[i].destination.type === 'region' &&
          nodes[i].destination.id === regionId) return nodes[i];
    }
    return {
      id: 'main:' + regionId,
      kind: 'mainline',
      destination: { type: 'region', id: regionId },
      chapterId: 'expansion',
      shuffleGroup: null,
      tags: ['expansion'],
      insertionPorts: [
        { id: 'before', accepts: ['quest', 'event'], capacity: 1 },
        { id: 'after', accepts: ['quest', 'nest', 'event'], capacity: 2 }
      ]
    };
  }

  function compile(template, nodes, seed, creationMode, insertions, revision) {
    var mainline = nodes.map(function (source, index) {
      return {
        id: source.id,
        kind: 'mainline',
        destination: safeClone(source.destination),
        chapterId: source.chapterId,
        tier: index + 1,
        previousNodeId: index ? nodes[index - 1].id : null,
        nextNodeId: index < nodes.length - 1 ? nodes[index + 1].id : null,
        tags: safeClone(source.tags || []),
        insertionPorts: safeClone(source.insertionPorts || [])
      };
    });
    return {
      schemaVersion: PLAN_SCHEMA_VERSION,
      templateId: template.id,
      templateVersion: template.schemaVersion,
      seed: seed >>> 0,
      creationMode: creationMode,
      revision: Math.max(0, revision | 0),
      mainline: mainline,
      insertions: normalizeInsertions(insertions, mainline, template)
    };
  }

  function findNode(nodes, nodeId) {
    for (var i = 0; i < nodes.length; i++) if (nodes[i].id === nodeId) return nodes[i];
    return null;
  }

  function findPort(node, portId) {
    var ports = node && node.insertionPorts || [];
    for (var i = 0; i < ports.length; i++) if (ports[i].id === portId) return ports[i];
    return null;
  }

  function normalizeInsertion(raw, mainline, template, existingIds) {
    if (!raw || !VALID_ID.test(raw.id || '') || existingIds[raw.id]) return null;
    var kind = raw.kind;
    var policy = template.insertionKinds && template.insertionKinds[kind];
    var anchorId = raw.anchor && raw.anchor.nodeId;
    var portId = raw.anchor && raw.anchor.port;
    var anchor = findNode(mainline, anchorId);
    var port = findPort(anchor, portId);
    if (!policy || !anchor || !port || port.accepts.indexOf(kind) < 0 ||
        policy.ports.indexOf(portId) < 0) return null;
    var destination = raw.destination;
    if (!destination || !VALID_ID.test(destination.type || '') || !VALID_ID.test(destination.id || '')) {
      return null;
    }
    var state = /^(scheduled|active|resolved|expired)$/.test(raw.state || '')
      ? raw.state : 'scheduled';
    existingIds[raw.id] = true;
    return {
      id: raw.id,
      kind: kind,
      destination: safeClone(destination),
      anchor: { nodeId: anchor.id, port: portId },
      tier: anchor.tier,
      returnPolicy: { mode: policy.returnMode, nodeId: anchor.id },
      lifetime: raw.lifetime || policy.defaultLifetime,
      state: state,
      priority: Number.isFinite(raw.priority) ? raw.priority : 0,
      metadata: safeClone(raw.metadata || {})
    };
  }

  function normalizeInsertions(insertions, mainline, template) {
    var ids = {}, out = [];
    (Array.isArray(insertions) ? insertions : []).forEach(function (raw) {
      var insertion = normalizeInsertion(raw, mainline, template, ids);
      if (insertion) out.push(insertion);
    });
    return out;
  }

  function fromOrder(savedOrder, seed, opts) {
    opts = opts || {};
    var template = templateById(opts.templateId);
    if (!template) throw new Error('[Routes] Missing route template: ' + (opts.templateId || DEFAULT_TEMPLATE_ID));
    var nodes = normalizeRegionIds(savedOrder).map(function (regionId) {
      return nodeForRegion(template, regionId);
    });
    return compile(template, nodes, seed, opts.creationMode || 'legacy-preserved',
      opts.insertions, opts.revision);
  }

  var Routes = Game.routes = {
    PLAN_SCHEMA_VERSION: PLAN_SCHEMA_VERSION,
    DEFAULT_TEMPLATE_ID: DEFAULT_TEMPLATE_ID,

    normalizeRegionIds: normalizeRegionIds,

    create: function (seed, opts) {
      opts = opts || {};
      var template = templateById(opts.templateId);
      if (!template) throw new Error('[Routes] Missing route template: ' + (opts.templateId || DEFAULT_TEMPLATE_ID));
      var nodes = templateNodes(template);
      var flagName = template.randomization && template.randomization.featureFlag;
      var randomize = typeof opts.randomizeMainline === 'boolean'
        ? opts.randomizeMainline
        : !!(flagName && Game.ROUTE_FEATURES && Game.ROUTE_FEATURES[flagName]);
      if (randomize) shuffleGroups(nodes, template, seed);
      return compile(template, nodes, seed,
        randomize ? 'seeded-randomized' : 'authored', [], 0);
    },

    fromLegacy: function (savedOrder, seed, opts) {
      return fromOrder(savedOrder, seed, opts);
    },

    normalize: function (savedPlan, legacyOrder, seed) {
      var templateId = savedPlan && savedPlan.templateId || DEFAULT_TEMPLATE_ID;
      var template = templateById(templateId) || templateById(DEFAULT_TEMPLATE_ID);
      var order = [];
      if (savedPlan && Array.isArray(savedPlan.mainline)) {
        savedPlan.mainline.forEach(function (node) {
          var destination = node && node.destination;
          if (destination && destination.type === 'region') order.push(destination.id);
        });
      }
      if (!order.length) order = legacyOrder;
      return fromOrder(order, Number.isFinite(seed) ? seed : savedPlan && savedPlan.seed, {
        templateId: template.id,
        creationMode: savedPlan && savedPlan.creationMode || 'legacy-preserved',
        insertions: savedPlan && savedPlan.insertions,
        revision: savedPlan && savedPlan.revision
      });
    },

    mainlineRegionOrder: function (plan) {
      if (!plan || !Array.isArray(plan.mainline)) return [];
      return plan.mainline.reduce(function (out, node) {
        if (node.destination && node.destination.type === 'region') out.push(node.destination.id);
        return out;
      }, []);
    },

    node: function (plan, nodeId) {
      return findNode(plan && plan.mainline || [], nodeId);
    },

    scheduleInsertion: function (plan, request) {
      if (!plan || !request) return null;
      var template = templateById(plan.templateId);
      if (!template) return null;
      var insertion = normalizeInsertion(request, plan.mainline || [], template,
        (plan.insertions || []).reduce(function (ids, item) { ids[item.id] = true; return ids; }, {}));
      if (!insertion) return null;
      var port = findPort(findNode(plan.mainline, insertion.anchor.nodeId), insertion.anchor.port);
      var occupied = (plan.insertions || []).filter(function (item) {
        return item.anchor.nodeId === insertion.anchor.nodeId &&
          item.anchor.port === insertion.anchor.port &&
          item.state !== 'resolved' && item.state !== 'expired';
      }).length;
      if (port.capacity >= 0 && occupied >= port.capacity) return null;
      plan.insertions = plan.insertions || [];
      plan.insertions.push(insertion);
      plan.revision = Math.max(0, plan.revision | 0) + 1;
      return insertion;
    },

    setInsertionState: function (plan, insertionId, state) {
      if (!/^(scheduled|active|resolved|expired)$/.test(state || '')) return false;
      var list = plan && plan.insertions || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== insertionId) continue;
        if (list[i].state === state) return true;
        list[i].state = state;
        plan.revision = Math.max(0, plan.revision | 0) + 1;
        return true;
      }
      return false;
    },

    itinerary: function (plan) {
      if (!plan) return [];
      var active = (plan.insertions || []).filter(function (item) {
        return item.state === 'scheduled' || item.state === 'active';
      }).sort(function (a, b) {
        return a.priority - b.priority || a.id.localeCompare(b.id);
      });
      var out = [];
      (plan.mainline || []).forEach(function (node) {
        active.forEach(function (item) {
          if (item.anchor.nodeId === node.id && item.anchor.port === 'before') out.push(item);
        });
        out.push(node);
        active.forEach(function (item) {
          if (item.anchor.nodeId === node.id && item.anchor.port === 'after') out.push(item);
        });
      });
      return out;
    },

    validate: function (plan) {
      var errors = [];
      if (!plan || plan.schemaVersion !== PLAN_SCHEMA_VERSION) return ['schema-version'];
      var seen = {};
      (plan.mainline || []).forEach(function (node, index, nodes) {
        if (!node || !VALID_ID.test(node.id || '') || seen[node.id]) errors.push('mainline-id:' + index);
        else seen[node.id] = true;
        if (!node.destination || node.destination.type !== 'region' ||
            !reg.has('region', node.destination.id)) errors.push('destination:' + index);
        if (node.tier !== index + 1) errors.push('tier:' + index);
        if (node.previousNodeId !== (index ? nodes[index - 1].id : null)) errors.push('previous:' + index);
        if (node.nextNodeId !== (index < nodes.length - 1 ? nodes[index + 1].id : null)) {
          errors.push('next:' + index);
        }
      });
      var template = templateById(plan.templateId);
      if (!template) errors.push('template');
      else if (normalizeInsertions(plan.insertions, plan.mainline || [], template).length !==
          (plan.insertions || []).length) errors.push('insertions');
      return errors;
    }
  };
})();
