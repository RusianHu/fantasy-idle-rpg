/* ============================================================
 * core/eventbus.js — 事件总线
 * 引擎在关键节点广播事件；成就/统计/音频等一律以监听器接入。
 * 常用事件：
 *   monster:killed {mid, boss, exp, gold, x, y}
 *   player:levelup {level}      player:death {byBoss}
 *   item:dropped {item}         item:equipped {item}
 *   boss:spawned {rid, mid}     boss:defeated {rid, mid, first}
 *   boss:failed {rid, reason:'defeat'|'retreat'}
 *   region:changed {rid}        region:unlocked {rid}
 *   region:travelStart / region:travelCancelled / region:arrived
 *   player:reviveStart / player:revived
 *   rest:start / rest:end       potion:used {pid}
 *   gold:changed / crystal:changed / exp:gained
 *   achievement:unlocked {aid}  shop:bought {sid, rid, areaId}
 *   trade:contextChanged {context, previous}
 *   skill:upgraded {sid, lv}    locale:changed {locale}
 *   skills:autoAllocated {count, allocations}
 *   equipment:autoChanged {changes, gain}
 *   automation:summary {skillPoints, gearCount, gain}
 *   slot:lockChanged {slot, locked} settings:changed {key, value}
 *   save:before / save:after    offline:settled {summary}
 *   mode:changed {mode}         control:changed {mode}
 *   camp:teleport {phase, x, y}
 *   game:completed {rid, mid, tier, completedAt}
 *   game:continued {rid}
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  function EventBus() { this._map = {}; }

  EventBus.prototype.on = function (evt, fn) {
    (this._map[evt] = this._map[evt] || []).push(fn);
    return fn;
  };

  EventBus.prototype.off = function (evt, fn) {
    var list = this._map[evt];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };

  EventBus.prototype.once = function (evt, fn) {
    var self = this;
    var wrap = function (payload) {
      self.off(evt, wrap);
      fn(payload);
    };
    this.on(evt, wrap);
  };

  EventBus.prototype.emit = function (evt, payload) {
    var list = this._map[evt];
    if (!list) return;
    // 拷贝一份，允许监听器中安全地增删监听
    list = list.slice();
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (e) {
        console.error('[EventBus] listener error @' + evt, e);
      }
    }
  };

  Game.bus = new EventBus();
  Game.EventBus = EventBus;
})();
