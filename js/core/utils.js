/* ============================================================
 * core/utils.js — 全局命名空间 Game 与通用工具
 * ============================================================ */
(function () {
  'use strict';

  var Game = window.Game = window.Game || {};
  Game.VERSION = '2.0.0';
  Game.BUILD_ID = '20260801.2';
  Game.SAVE_VERSION = 17;

  var U = Game.util = {};

  U.clamp = function (v, min, max) { return v < min ? min : (v > max ? max : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  /** 帧率无关的平滑趋近：rate 越大收敛越快 */
  U.approach = function (cur, target, rate, dt) {
    var t = 1 - Math.exp(-rate * dt);
    return cur + (target - cur) * t;
  };
  U.dist = function (x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  };
  U.rand = function (min, max) { return min + Math.random() * (max - min); };
  U.randInt = function (min, max) { return Math.floor(U.rand(min, max + 1)); };
  U.choice = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  U.chance = function (p) { return Math.random() < p; };

  /** mulberry32 种子随机数生成器（地形程序化生成用，保证同区域同布局） */
  U.seededRng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.strSeed = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  /** 新存档使用的 uint32 世界种子；无 Web Crypto 时保留离线回退。 */
  U.randomSeed = function () {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var out = new Uint32Array(1);
        window.crypto.getRandomValues(out);
        return out[0] >>> 0;
      }
    } catch (e) { /* file:// 或旧浏览器下回退 */ }
    return Math.floor(Math.random() * 4294967296) >>> 0;
  };
  U.hex32 = function (value) {
    return ('00000000' + (value >>> 0).toString(16).toUpperCase()).slice(-8);
  };

  var _uid = 0;
  U.uid = function () { return 'u' + (++_uid) + '_' + Date.now().toString(36); };
  U.setUidBase = function (n) { if (n > _uid) _uid = n; };

  U.now = function () { return Date.now(); };

  /** Canvas 动效统一降级开关；业务逻辑与静态可读状态不受影响。 */
  U.motionEnabled = function () {
    if (Game.state && Game.state.settings && Game.state.settings.effects === false) return false;
    return !(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  U.deepClone = function (obj) { return JSON.parse(JSON.stringify(obj)); };

  U.merge = function (dst, src) {
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!dst[k] || typeof dst[k] !== 'object' || Array.isArray(dst[k])) dst[k] = {};
        U.merge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
    return dst;
  };

  /** 由位移向量推断朝向：'d' | 'u' | 'l' | 'r' */
  U.dirOf = function (dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'r' : 'l';
    return dy > 0 ? 'd' : 'u';
  };

  /** FNV-1a 校验和（存档导出用） */
  U.fnv1a = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  };

  /** UTF-8 安全的 Base64 编解码 */
  U.b64encode = function (str) {
    return btoa(unescape(encodeURIComponent(str)));
  };
  U.b64decode = function (b64) {
    return decodeURIComponent(escape(atob(b64)));
  };

  /** 颜色工具：'#rrggbb' -> [r,g,b] */
  U.hex2rgb = function (hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgb2css = function (r, g, b, a) {
    if (a === undefined) return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a + ')';
  };
  U.mixColor = function (hexA, hexB, t) {
    var a = U.hex2rgb(hexA), b = U.hex2rgb(hexB);
    return U.rgb2css(U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t));
  };
  /** 变暗/变亮：f<1 变暗，f>1 变亮 */
  U.shade = function (hex, f) {
    var c = U.hex2rgb(hex);
    return U.rgb2css(U.clamp(c[0] * f, 0, 255), U.clamp(c[1] * f, 0, 255), U.clamp(c[2] * f, 0, 255));
  };

  /** DOM 快捷方式 */
  U.$ = function (sel) { return document.querySelector(sel); };
  U.$$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  U.el = function (tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  U.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
})();
