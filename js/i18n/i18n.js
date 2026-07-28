/* ============================================================
 * i18n/i18n.js — 国际化核心
 * t(key, vars) 全量文案；回退链 当前语言 → en → zh-CN → key；
 * 数字缩写与时长格式化随语言分派（zh 万/亿，en K/M/B/T）。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  var packs = {};       // locale -> 扁平化 {key: text}
  var cur = 'zh-CN';

  function flatten(obj, prefix, out) {
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k];
      var key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object') flatten(v, key, out);
      else out[key] = String(v);
    }
    return out;
  }

  function interp(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] !== undefined ? vars[k] : m;
    });
  }

  var I = Game.i18n = {
    addPack: function (locale, obj) {
      packs[locale] = flatten(obj, '', packs[locale] || {});
    },

    locale: function () { return cur; },

    has: function (locale, key) {
      return !!(packs[locale] && packs[locale][key] !== undefined);
    },

    locales: function () { return Object.keys(packs).sort(); },

    setLocale: function (locale) {
      if (!packs[locale]) return;
      cur = locale;
      try { localStorage.setItem('firpg_lang', locale); } catch (e) {}
      document.documentElement.lang = locale;
      Game.bus.emit('locale:changed', { locale: locale });
    },

    detect: function () {
      var saved = null;
      try { saved = localStorage.getItem('firpg_lang'); } catch (e) {}
      if (saved && packs[saved]) { cur = saved; }
      else {
        var nav = (navigator.language || 'zh-CN');
        cur = nav.toLowerCase().indexOf('zh') === 0 ? 'zh-CN' : (packs.en ? 'en' : 'zh-CN');
      }
      document.documentElement.lang = cur;
    },

    /** 翻译：缺失时 en → zh-CN → key 逐级回退 */
    t: function (key, vars) {
      var s = (packs[cur] && packs[cur][key]);
      if (s === undefined) s = packs.en && packs.en[key];
      if (s === undefined) s = packs['zh-CN'] && packs['zh-CN'][key];
      if (s === undefined) return key;
      return interp(s, vars);
    },

    /* ---------------- 数字缩写 ---------------- */
    fmtNum: function (n) {
      if (n === undefined || n === null || isNaN(n)) return '0';
      var neg = n < 0 ? '-' : '';
      n = Math.abs(n);
      if (n >= 1e16) return neg + n.toExponential(2).replace('+', '');

      function sh(v) { // 保留合适位数
        if (v >= 100) return Math.round(v).toString();
        if (v >= 10) return (Math.round(v * 10) / 10).toString();
        return (Math.round(v * 100) / 100).toString();
      }

      if (cur === 'zh-CN') {
        if (n < 1e4) return neg + Math.round(n).toString();
        if (n < 1e8) return neg + sh(n / 1e4) + '万';
        if (n < 1e12) return neg + sh(n / 1e8) + '亿';
        return neg + sh(n / 1e12) + '万亿';
      }
      if (n < 1e3) return neg + Math.round(n).toString();
      if (n < 1e6) return neg + sh(n / 1e3) + 'K';
      if (n < 1e9) return neg + sh(n / 1e6) + 'M';
      if (n < 1e12) return neg + sh(n / 1e9) + 'B';
      return neg + sh(n / 1e12) + 'T';
    },

    /* ---------------- 时长格式化 ---------------- */
    fmtDur: function (sec) {
      sec = Math.max(0, Math.floor(sec));
      var d = Math.floor(sec / 86400);
      var h = Math.floor(sec % 86400 / 3600);
      var m = Math.floor(sec % 3600 / 60);
      var s = sec % 60;
      if (cur === 'zh-CN') {
        if (d > 0) return d + '天' + h + '小时';
        if (h > 0) return h + '小时' + m + '分';
        if (m > 0) return m + '分' + s + '秒';
        return s + '秒';
      }
      if (d > 0) return d + 'd ' + h + 'h';
      if (h > 0) return h + 'h ' + m + 'm';
      if (m > 0) return m + 'm ' + s + 's';
      return s + 's';
    }
  };
})();
