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
  // UI 与存储层都使用稳定槽位 ID。当前产品只开放一个逻辑槽位；
  // 后续多档只需追加描述并让 load/save 选择 active slot，无需重做标题界面。
  var SLOT_DEFS = [
    { id: 'expedition-1', index: 1, key: KEY, backupKey: KEY_BAK }
  ];
  var lastLoadedTs = 0;
  var hardResetting = false;
  // 删除存档后停在标题页时保持双槽为空；点击“开始冒险”或已有有效角色
  // 后才开启本局持久化。加载到的迁移档即使尚待补选职业也必须允许保存。
  var persistenceStarted = false;

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
    },
    {
      // v5 → v6：旧档只新增稳定布局种子，区域顺序保持原样。
      from: 5,
      fn: function (data) {
        data.world = data.world || {};
        data.world.worldSeed = U.strSeed('legacy:' + (data.createdAt || data.ts || 0));
        data.world.layoutVersion = 1;
        data.v = 6;
      }
    },
    {
      // v6 → v7：切换到高密度布局一次，世界种子与区域顺序保持原样。
      from: 6,
      fn: function (data) {
        data.world = data.world || {};
        data.world.layoutVersion = 2;
        data.v = 7;
      }
    },
    {
      // v7 → v8：加入最终通关后日谈。已经打通末区的旧档在下次启动补播，
      // 未通关档只获得默认字段，不改变任何养成或世界进度。
      from: 7,
      fn: function (data) {
        data.meta = data.meta || {};
        data.world = data.world || {};
        var order = Game.State.normalizeRegionOrder(data.world.regionOrder);
        var finalRid = order.length ? order[order.length - 1] : null;
        var finalProg = finalRid && data.world.regionProg && data.world.regionProg[finalRid];
        var completed = !!(finalProg && (finalProg.cleared || finalProg.firstKill));
        var stamp = Number(data.ts) || Number(data.createdAt) || 1;
        data.meta.completedAt = completed ? stamp : null;
        data.meta.endingAcknowledged = false;
        data.meta.endingPhase = completed ? 'epilogue' : null;
        data.meta.endingLine = 0;
        data.v = 8;
      }
    },
    {
      // v8 → v9：环境采集只补素材字典与节点冷却；既有养成、
      // 区域路线、双槽和导入导出协议保持不变。
      from: 8,
      fn: function (data) {
        data.settings = data.settings || {};
        if (data.settings.groundLoot === undefined) data.settings.groundLoot = true;
        if (data.settings.autoCampRest === undefined) data.settings.autoCampRest = false;
        data.inv = data.inv || {};
        data.inv.materials = data.inv.materials || {};
        data.world = data.world || {};
        data.world.nodeCooldowns = data.world.nodeCooldowns || {};
        data.meta = data.meta || {};
        data.meta.stats = data.meta.stats || {};
        var statDefaults = { pickups: 0, gathers: 0, materials: 0, chests: 0 };
        for (var key in statDefaults) {
          if (!Number.isFinite(data.meta.stats[key])) data.meta.stats[key] = statDefaults[key];
        }
        data.v = 9;
      }
    },
    {
      // v9 → v10：最终区域可在战败后失守。旧档保持既有准入状态，
      // 仅新增独立锁位，首杀、通关与区域清理记录不受影响。
      from: 9,
      fn: function (data) {
        data.world = data.world || {};
        data.world.finalRegionLocked = false;
        data.v = 10;
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

    slots: function () {
      return SLOT_DEFS.map(function (slot) {
        return { id: slot.id, index: slot.index };
      });
    },

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
          materials: st.inv.materials,
          uidSeq: Game.inv.peekUidSeq()
        },
        world: {
          region: st.world.region,
          regionOrder: st.world.regionOrder,
          worldSeed: st.world.worldSeed >>> 0,
          layoutVersion: st.world.layoutVersion,
          mode: st.world.mode,
          restBuffT: st.world.restBuffT,
          worldTime: st.world.worldTime,
          regionProg: st.world.regionProg,
          nodeCooldowns: st.world.nodeCooldowns,
          finalRegionLocked: !!st.world.finalRegionLocked,
          deathsRow: st.world.deathsRow
        },
        meta: st.meta
      };
    },

    save: function (reason) {
      // hardReset 会触发 visibilitychange/pagehide/beforeunload。此时任何自动
      // 存档都会把刚删除的通关档重新写回，因此重载前必须永久抑制本页写入。
      if (hardResetting || !Game.state) return false;
      // 选择档案前只允许读取预览。否则标题页停留时间会覆盖时间戳，
      // 进而吞掉玩家应得的离线收益。
      if (Game.entryState === 'menu') return false;
      if (!persistenceStarted && !Game.State.isAdventureStarted()) return false;
      persistenceStarted = true;
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
      persistenceStarted = true;
      return data;
    },

    /** 标题页确认开始后建立草稿档；未点击开始时不重新生成已删除的存档。 */
    beginNewGame: function () {
      if (hardResetting || !Game.state) return false;
      persistenceStarted = true;
      return S.save('new-game');
    },

    /** 将读出的数据套用到全新 state（缺失字段自动补默认值） */
    applyLoaded: function (data) {
      var st = Game.State.newGame();
      if (data.createdAt) st.createdAt = data.createdAt;
      U.merge(st.settings, data.settings || {});
      st.settings.controlMode = st.settings.controlMode === 'manual' ? 'manual' : 'auto';
      st.settings.autoBoss = st.settings.autoBoss !== false;
      U.merge(st.player, data.player || {});
      if (data.inv) {
        st.inv.items = Array.isArray(data.inv.items) ? data.inv.items : [];
        U.merge(st.inv.equipped, data.inv.equipped || {});
        U.merge(st.inv.lockedSlots, data.inv.lockedSlots || {});
        U.merge(st.inv.potions, data.inv.potions || {});
        U.merge(st.inv.materials, data.inv.materials || {});
      }
      U.merge(st.world, data.world || {});
      st.world.worldSeed = Number.isFinite(st.world.worldSeed)
        ? (st.world.worldSeed >>> 0)
        : U.strSeed('legacy:' + (data.createdAt || data.ts || 0));
      st.world.layoutVersion = data.world && data.world.layoutVersion === 1 ? 1 : 2;
      st.world.regionOrder = Game.State.normalizeRegionOrder(
        data.world && data.world.regionOrder
      );
      st.world.finalRegionLocked = !!st.world.finalRegionLocked;
      U.merge(st.meta, data.meta || {});
      st.meta.completedAt = Number.isFinite(st.meta.completedAt) && st.meta.completedAt > 0
        ? st.meta.completedAt
        : null;
      st.meta.endingAcknowledged = !!st.meta.endingAcknowledged;
      st.meta.endingPhase = st.meta.endingPhase === 'summary' || st.meta.endingPhase === 'epilogue'
        ? st.meta.endingPhase
        : null;
      st.meta.endingLine = Math.max(0, Math.min(5, Number(st.meta.endingLine) || 0));

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
      // 若页面在魔王城战败过场落地前意外终止，存档可能已经写入失守锁、
      // 但仍指向末区。读档时原子修正到上一地区，禁止绕过重新解锁。
      var finalRid = st.world.regionOrder[st.world.regionOrder.length - 1];
      if (st.world.finalRegionLocked && st.world.region === finalRid && st.world.regionOrder.length > 1) {
        st.world.region = st.world.regionOrder[st.world.regionOrder.length - 2];
        st.world.mode = 'rest';
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
        persistenceStarted = true;
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
        persistenceStarted = true;
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
      if (Game.transitions && Game.state.player.hp <= 0) Game.transitions.restoreZeroHp();
      if (Game.ending) Game.ending.restorePending();
      S.save('import');
    },

    hardReset: function () {
      if (hardResetting) return false;
      hardResetting = true;
      persistenceStarted = false;
      lastLoadedTs = 0;
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(KEY_BAK);
      } catch (e) {}
      location.reload();
      return true;
    }
  };
})();
