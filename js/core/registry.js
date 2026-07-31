/* ============================================================
 * core/registry.js — 旧数据兼容注册表与内容投影门面
 * 旧物品、技能、路线等仍通过 Game.register(type, def) 注册。
 * 正式 Actor、区域与 Encounter 由 Pack 编译后投影到兼容类型；
 * 新增正式内容走自动发现的 *.pack.js / *.support.js，无需修改 HTML。
 * 引擎和兼容消费者只通过稳定字符串 ID 访问定义。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  var store = {};   // type -> { id -> def }
  var order = {};   // type -> [id]（保持注册顺序）

  var Reg = Game.reg = {
    register: function (type, def) {
      if (!def || !def.id) { console.error('[Registry] 注册缺少 id:', type, def); return; }
      if (!store[type]) { store[type] = {}; order[type] = []; }
      if (!store[type][def.id]) order[type].push(def.id);
      store[type][def.id] = def;
      return def;
    },
    get: function (type, id) {
      return (store[type] && store[type][id]) || null;
    },
    has: function (type, id) {
      return !!(store[type] && store[type][id]);
    },
    ids: function (type) {
      return order[type] ? order[type].slice() : [];
    },
    all: function (type) {
      var o = order[type];
      if (!o) return [];
      var s = store[type], out = [];
      for (var i = 0; i < o.length; i++) out.push(s[o[i]]);
      return out;
    }
  };

  /** 便捷入口：Game.register('monster', {...}) */
  Game.register = function (type, def) { return Reg.register(type, def); };
})();
