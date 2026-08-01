/* ============================================================
 * systems/action_bubbles.js — 世界实体动作气泡统一管理
 * 任意带坐标的角色、队友、怪物或交互物都可作为锚点。
 * 只管理短暂表现状态，不写存档、不参与寻路或交互判定。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var bus = Game.bus;
  var types = Object.create(null);
  var lanes = [];
  var serial = 0;
  var clock = 0;
  var MAX_LANES = 12;
  var MAX_QUEUE = 2;

  function registerType(id, def) {
    if (!id || !def) return false;
    var next = {};
    for (var key in def) {
      if (Object.prototype.hasOwnProperty.call(def, key)) next[key] = def[key];
    }
    next.id = id;
    next.duration = Math.max(0.4, Number(next.duration) || 2.2);
    next.priority = Number(next.priority) || 0;
    next.cooldown = Math.max(0, Number(next.cooldown) || 0.7);
    next.icon = next.icon || id;
    next.placement = /^(above|side|directional)$/.test(next.placement)
      ? next.placement
      : 'directional';
    next.accent = next.accent || '#d7b866';
    next.paper = next.paper || '#eee1bd';
    next.ink = next.ink || '#28231d';
    types[id] = next;
    return id;
  }

  function laneFor(anchor, create) {
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;
    for (var i = 0; i < lanes.length; i++) {
      if (lanes[i].anchor === anchor) return lanes[i];
    }
    if (!create) return null;
    if (lanes.length >= MAX_LANES) {
      var removable = -1;
      for (var li = 0; li < lanes.length; li++) {
        if (!lanes[li].current && !lanes[li].queue.length) {
          removable = li;
          break;
        }
      }
      if (removable < 0) removable = 0;
      lanes.splice(removable, 1);
    }
    var stable = anchor.id || anchor.bubbleAnchorId;
    var lane = {
      anchor: anchor,
      anchorId: stable ? String(stable) : (anchor.kind || 'entity') + ':bubble:' + (++serial),
      current: null,
      queue: [],
      recent: Object.create(null)
    };
    lanes.push(lane);
    return lane;
  }

  function makeBubble(lane, type, options) {
    var def = types[type];
    var targetId = options.targetId || '';
    return {
      id: 'bubble:' + (++serial),
      anchorId: lane.anchorId,
      entityKind: lane.anchor.kind || 'entity',
      type: type,
      icon: options.icon || def.icon,
      priority: options.priority !== undefined ? Number(options.priority) : def.priority,
      duration: Math.max(0.4, Number(options.duration) || def.duration),
      age: 0,
      key: options.dedupeKey || type + ':' + targetId,
      targetId: targetId || null,
      meta: options.meta || null,
      placement: /^(above|side|directional)$/.test(options.placement)
        ? options.placement
        : def.placement,
      side: options.side === 'left' || options.side === 'right' ? options.side : 'auto',
      style: {
        accent: options.accent || def.accent,
        paper: options.paper || def.paper,
        ink: options.ink || def.ink
      }
    };
  }

  function publicBubble(bubble, lane, state) {
    return {
      id: bubble.id,
      anchorId: bubble.anchorId,
      entityKind: bubble.entityKind,
      type: bubble.type,
      icon: bubble.icon,
      priority: bubble.priority,
      duration: bubble.duration,
      age: bubble.age,
      targetId: bubble.targetId,
      placement: bubble.placement,
      side: bubble.side,
      state: state,
      x: lane.anchor.x,
      y: lane.anchor.y
    };
  }

  function show(anchor, type, options) {
    var def = types[type];
    if (!def) return false;
    options = options || {};
    var lane = laneFor(anchor, true);
    if (!lane) return false;
    var bubble = makeBubble(lane, type, options);
    var last = lane.recent[bubble.key];
    if ((lane.current && lane.current.key === bubble.key) ||
        lane.queue.some(function (queued) { return queued.key === bubble.key; }) ||
        (last !== undefined && clock - last < def.cooldown)) {
      return false;
    }
    if (!lane.current) {
      lane.current = bubble;
    } else if (bubble.priority >= lane.current.priority) {
      lane.current = bubble;
    } else if (lane.queue.length < MAX_QUEUE) {
      lane.queue.push(bubble);
      lane.queue.sort(function (a, b) { return b.priority - a.priority; });
    } else {
      return false;
    }
    lane.recent[bubble.key] = clock;
    bus.emit('actionBubble:shown', publicBubble(bubble, lane,
      lane.current === bubble ? 'visible' : 'queued'));
    return publicBubble(bubble, lane, lane.current === bubble ? 'visible' : 'queued');
  }

  function dismiss(anchor, type) {
    var lane = laneFor(anchor, false);
    if (!lane) return false;
    var changed = false;
    if (!type || (lane.current && lane.current.type === type)) {
      lane.current = null;
      changed = true;
    }
    if (type) {
      var before = lane.queue.length;
      lane.queue = lane.queue.filter(function (bubble) { return bubble.type !== type; });
      changed = changed || before !== lane.queue.length;
    } else if (lane.queue.length) {
      lane.queue = [];
      changed = true;
    }
    if (!lane.current && lane.queue.length) lane.current = lane.queue.shift();
    return changed;
  }

  function clear() {
    lanes = [];
  }

  function update(dt) {
    dt = Math.max(0, Math.min(0.25, Number(dt) || 0));
    clock += dt;
    for (var i = lanes.length - 1; i >= 0; i--) {
      var lane = lanes[i];
      var bubble = lane.current;
      if (bubble) {
        bubble.age += dt;
        if (bubble.age >= bubble.duration) {
          lane.current = lane.queue.length ? lane.queue.shift() : null;
        }
      }
      for (var key in lane.recent) {
        if (clock - lane.recent[key] > 8) delete lane.recent[key];
      }
      if (!lane.current && !lane.queue.length &&
          (!lane.anchor || !Number.isFinite(lane.anchor.x) || !Number.isFinite(lane.anchor.y))) {
        lanes.splice(i, 1);
      }
    }
  }

  var Bubbles = Game.actionBubbles = {
    registerType: registerType,
    show: show,
    dismiss: dismiss,
    clear: clear,
    update: update,

    active: function () {
      var out = [];
      for (var i = 0; i < lanes.length; i++) {
        if (lanes[i].current) out.push(publicBubble(lanes[i].current, lanes[i], 'visible'));
        for (var q = 0; q < lanes[i].queue.length; q++) {
          out.push(publicBubble(lanes[i].queue[q], lanes[i], 'queued'));
        }
      }
      return out;
    },

    visit: function (fn) {
      if (typeof fn !== 'function') return;
      for (var i = 0; i < lanes.length; i++) {
        if (lanes[i].current) fn(lanes[i].current, lanes[i].anchor, types[lanes[i].current.type]);
      }
    },

    type: function (id) {
      return types[id] || null;
    }
  };

  registerType('resource', {
    icon: 'resource',
    accent: '#6da767', paper: '#efe4bd', ink: '#243126',
    priority: 45, duration: 2.5
  });
  registerType('gather', {
    icon: 'gather',
    accent: '#c9963f', paper: '#f1dfb5', ink: '#34271a',
    priority: 55, duration: 2.1
  });
  registerType('enemy', {
    icon: 'enemy',
    accent: '#bd554c', paper: '#efd7bc', ink: '#3b201d',
    placement: 'side', priority: 90, duration: 2.2
  });
  registerType('alert', {
    icon: 'alert',
    accent: '#bd554c', paper: '#efd7bc', ink: '#3b201d',
    placement: 'side', priority: 95, duration: 1.35, cooldown: 1.2
  });
  registerType('evade', {
    icon: 'evade',
    accent: '#7e8790', paper: '#d8d5c8', ink: '#30353a',
    placement: 'side', priority: 92, duration: 1.8, cooldown: 1.4
  });
  registerType('chest', {
    icon: 'chest',
    accent: '#b3813e', paper: '#f0dfb2', ink: '#342617',
    priority: 65, duration: 2.4
  });
  registerType('loot', {
    icon: 'loot',
    accent: '#598da5', paper: '#dfe3ca', ink: '#20313a',
    priority: 60, duration: 1.9
  });

  ['region:changed', 'player:death'].forEach(function (event) {
    bus.on(event, clear);
  });
  bus.on('mode:changed', function () { clear(); });
  bus.on('control:changed', function () { clear(); });
})();
