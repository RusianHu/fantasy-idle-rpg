/* ============================================================
 * core/registry.js — 内容注册表
 * 引擎与内容分离：区域/怪物/装备基底/词条/技能/成就/商店条目
 * 全部通过 Game.register(type, def) 注册，引擎只面向稳定字符串 ID。
 * 新增内容 = 新增一份数据文件 + index.html 引一行脚本，零引擎改动。
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
