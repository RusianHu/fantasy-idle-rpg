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

  /* 版本迁移流水线：旧存档逐版本升级 */
  var MIGRATIONS = [
    {
      // v1 → v2：引入多职业。旧「冒险者」需补选职业；
      // 旧技能体系下线，已投入的技能点全额退还。
      from: 1,
      fn: function (data) {
        data.player.classId = null;
        var refund = 0;
        for (var sid in (data.player.skills || {})) {
          refund += data.player.skills[sid] || 0;
        }
        data.player.sp = (data.player.sp || 0) + refund;
        data.player.skills = {};
        data.v = 2;
      }
    },
    {
      // v2 → v3：区域顺序改为每档持久化。旧档保留经典顺序，
      // 避免升级后当前区域、解锁关系和难度发生变化。
      from: 2,
      fn: function (data) {
        data.world = data.world || {};
        data.world.regionOrder = Game.reg.ids('region');
        data.v = 3;
      }
    },
    {
      // v3 → v4：自动技能/换装默认开启，并加入独立槽位锁。
      // 真正的旧档协调必须等状态恢复、职业与注册表可用后在 automation 执行。
      from: 3,
      fn: function (data) {
        data.settings = data.settings || {};
        data.settings.autoSkillUpgrade = true;
        data.settings.autoEquip = true;
        data.inv = data.inv || {};
        data.inv.lockedSlots = { weapon: false, armor: false, ring: false };
        data.v = 4;
      }
    },
    {
      // v4 → v5：世界舞台加入持久化自动/手动操控总开关。
      // 旧档维持原有挂机行为，统一迁移为自动模式。
      from: 4,
      fn: function (data) {
        data.settings = data.settings || {};
        data.settings.controlMode = 'auto';
        data.v = 5;
      }
    }
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
          lockedSlots: st.inv.lockedSlots,
          potions: st.inv.potions,
          uidSeq: Game.inv.peekUidSeq()
        },
        world: {
          region: st.world.region,
          regionOrder: st.world.regionOrder,
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
      st.settings.controlMode = st.settings.controlMode === 'manual' ? 'manual' : 'auto';
      U.merge(st.player, data.player || {});
      if (data.inv) {
        st.inv.items = Array.isArray(data.inv.items) ? data.inv.items : [];
        U.merge(st.inv.equipped, data.inv.equipped || {});
        U.merge(st.inv.lockedSlots, data.inv.lockedSlots || {});
        U.merge(st.inv.potions, data.inv.potions || {});
      }
      U.merge(st.world, data.world || {});
      st.world.regionOrder = Game.State.normalizeRegionOrder(
        data.world && data.world.regionOrder
      );
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
        st.inv.lockedSlots[slot] = !!st.inv.lockedSlots[slot];
      }
      // 区域已下线 → 回退到最近有效区域
      if (!Game.reg.has('region', st.world.region)) {
        st.world.region = st.world.regionOrder[0];
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
      if (Game.auto) Game.auto.reconcile('import');
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
