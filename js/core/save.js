/* ============================================================
 * core/save.js — 数据持久化
 * localStorage 双槽备份（主档 + 备份档），版本号 + 迁移流水线，
 * Base64+FNV-1a 校验导出 / .json 文件导出导入，重置。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, bus = Game.bus;

  var KEY = 'firpg_save';
  var KEY_BAK = 'firpg_save_backup';
  var lastLoadedTs = 0;

  /* 版本迁移流水线：旧存档逐版本升级（示例位，v1 起步） */
  var MIGRATIONS = [
    // { from: 1, fn: function (data) { ...; data.v = 2; } }
  ];

  function runMigrations(data) {
    var guard = 0;
    while (data.v < Game.SAVE_VERSION && guard++ < 20) {
      var found = false;
      for (var i = 0; i < MIGRATIONS.length; i++) {
        if (MIGRATIONS[i].from === data.v) {
          MIGRATIONS[i].fn(data);
          found = true;
          break;
        }
      }
      if (!found) { data.v = Game.SAVE_VERSION; }
    }
    return data;
  }

  var S = Game.save = {
    lastTs: function () { return lastLoadedTs; },

    serialize: function () {
      var st = Game.state;
      return {
        v: Game.SAVE_VERSION,
        ts: U.now(),
        createdAt: st.createdAt,
        settings: st.settings,
        player: st.player,
        inv: {
          items: st.inv.items,
          equipped: st.inv.equipped,
          potions: st.inv.potions,
          uidSeq: Game.inv.peekUidSeq()
        },
        world: {
          region: st.world.region,
          mode: st.world.mode,
          restBuffT: st.world.restBuffT,
          worldTime: st.world.worldTime,
          regionProg: st.world.regionProg,
          deathsRow: st.world.deathsRow
        },
        meta: st.meta
      };
    },

    save: function (reason) {
      if (!Game.state) return false;
      bus.emit('save:before', { reason: reason });
      try {
        var json = JSON.stringify(S.serialize());
        localStorage.setItem(KEY, json);
        localStorage.setItem(KEY_BAK, json);
        bus.emit('save:after', { reason: reason });
        return true;
      } catch (e) {
        console.error('[Save] 保存失败', e);
        return false;
      }
    },

    /** 读档：主档损坏自动回退备份档 */
    load: function () {
      var raw = null, data = null;
      try { raw = localStorage.getItem(KEY); } catch (e) {}
      if (raw) {
        try { data = JSON.parse(raw); } catch (e) { data = null; }
      }
      if (!data || typeof data.v !== 'number' || !data.player) {
        try { raw = localStorage.getItem(KEY_BAK); } catch (e) {}
        if (raw) {
          try { data = JSON.parse(raw); } catch (e) { data = null; }
          if (data) console.warn('[Save] 主档损坏，已从备份档恢复');
        }
      }
      if (!data || typeof data.v !== 'number' || !data.player) return null;
      runMigrations(data);
      lastLoadedTs = data.ts || 0;
      return data;
    },

    /** 将读出的数据套用到全新 state（缺失字段自动补默认值） */
    applyLoaded: function (data) {
      var st = Game.State.newGame();
      if (data.createdAt) st.createdAt = data.createdAt;
      U.merge(st.settings, data.settings || {});
      U.merge(st.player, data.player || {});
      if (data.inv) {
        st.inv.items = Array.isArray(data.inv.items) ? data.inv.items : [];
        U.merge(st.inv.equipped, data.inv.equipped || {});
        U.merge(st.inv.potions, data.inv.potions || {});
      }
      U.merge(st.world, data.world || {});
      U.merge(st.meta, data.meta || {});

      // 数据卫生：清除引用已下线内容的装备（折算金币），装备指针失效则置空
      var validItems = [];
      for (var i = 0; i < st.inv.items.length; i++) {
        var it = st.inv.items[i];
        if (Game.reg.has('slot', it.base)) validItems.push(it);
        else st.player.gold += 50;
      }
      st.inv.items = validItems;
      for (var slot in st.inv.equipped) {
        var uid = st.inv.equipped[slot];
        if (uid && !validItems.some(function (x) { return x.uid === uid; })) {
          st.inv.equipped[slot] = null;
        }
      }
      // 区域已下线 → 回退到最近有效区域
      if (!Game.reg.has('region', st.world.region)) {
        st.world.region = Game.reg.ids('region')[0];
      }
      // uid 续接，避免冲突
      var maxUid = data.inv && data.inv.uidSeq ? data.inv.uidSeq : 1;
      validItems.forEach(function (x) {
        var m = /^i(\d+)$/.exec(x.uid);
        if (m) maxUid = Math.max(maxUid, parseInt(m[1], 10) + 1);
      });
      Game.inv.setUidSeq(maxUid);

      Game.state = st;
      return st;
    },

    /* ---------------- 导出 / 导入 ---------------- */
    exportB64: function () {
      var json = JSON.stringify(S.serialize());
      var b64 = U.b64encode(json);
      return b64 + '.' + U.fnv1a(b64);
    },

    importB64: function (str) {
      try {
        var dot = str.lastIndexOf('.');
        if (dot < 0) return { ok: false };
        var b64 = str.slice(0, dot).trim();
        var sum = str.slice(dot + 1).trim();
        if (U.fnv1a(b64) !== sum) return { ok: false };
        var data = JSON.parse(U.b64decode(b64));
        if (typeof data.v !== 'number' || !data.player) return { ok: false };
        runMigrations(data);
        S.applyLoaded(data);
        S.afterImport();
        return { ok: true };
      } catch (e) {
        console.error('[Save] 导入失败', e);
        return { ok: false };
      }
    },

    exportFile: function () {
      var json = JSON.stringify(S.serialize(), null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var a = document.createElement('a');
      var d = new Date();
      var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
      a.href = URL.createObjectURL(blob);
      a.download = 'fantasy-idle-rpg-save-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
      }, 200);
    },

    importFileText: function (text) {
      try {
        var data = JSON.parse(text);
        if (typeof data.v !== 'number' || !data.player) return { ok: false };
        runMigrations(data);
        S.applyLoaded(data);
        S.afterImport();
        return { ok: true };
      } catch (e) {
        return { ok: false };
      }
    },

    /** 导入后的世界重建 */
    afterImport: function () {
      Game.player.recalc();
      Game.state.player.hp = Math.min(Game.state.player.hp, Game.state.derived.maxHp);
      Game.i18n.setLocale(Game.state.settings.lang);
      Game.particles.setEnabled(Game.state.settings.effects);
      Game.world.init(Game.state.world.region);
      Game.ui.hud.update(true);
      Game.ui.tabs.queueRerender();
      S.save('import');
    },

    hardReset: function () {
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(KEY_BAK);
      } catch (e) {}
      location.reload();
    }
  };
})();
