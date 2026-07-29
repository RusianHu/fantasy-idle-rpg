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
    },
    {
      // v10 → v11：升级到开放远征布局。角色养成、路线、首杀、
      // 通关和魔王城失守状态全部保留；新探索记录从空白开始。
      from: 10,
      fn: function (data) {
        data.settings = data.settings || {};
        if (!/^(safe|balanced|loot)$/.test(data.settings.expeditionStrategy || '')) {
          data.settings.expeditionStrategy = 'balanced';
        }
        data.world = data.world || {};
        data.world.layoutVersion = 3;
        data.world.exploration = data.world.exploration || {};
        data.meta = data.meta || {};
        data.meta.explorationMigrationGift = data.meta.explorationMigrationGift || false;
        data.v = 11;
      }
    },
    {
      // v11 → v12：角色养成进入 Roster/ActorRecord，经济与装备归属分离。
      // 旧技能 ID 在 V2 中继续作为 Talent ID，投入点数与装备完整保留。
      from: 11,
      fn: function (data) {
        var player = data.player || {};
        var inv = data.inv || {};
        data.roster = {
          primaryActorId: 'player-main',
          activeParty: ['player-main'],
          actors: {
            'player-main': {
              id: 'player-main',
              archetypeId: 'adventurer',
              classId: player.classId || null,
              level: Math.max(1, player.level | 0 || 1),
              exp: Math.max(0, Number(player.exp) || 0),
              skillPoints: Math.max(0, player.sp | 0),
              talentRanks: Object.assign({}, player.skills || {}),
              permanentUpgrades: Object.assign({}, player.perms || {}),
              persistentResources: { hp: Math.max(0, Number(player.hp) || 0) },
              loadout: {
                equipment: Object.assign({ weapon: null, armor: null, ring: null },
                  inv.equipped || {}),
                lockedSlots: Object.assign({ weapon: false, armor: false, ring: false },
                  inv.lockedSlots || {})
              }
            }
          }
        };
        data.economy = {
          gold: Math.max(0, Number(player.gold) || 0),
          crystal: Math.max(0, Number(player.crystal) || 0)
        };
        data.settings = data.settings || {};
        if (!/^(safe|balanced|aggressive)$/.test(data.settings.combatStrategy || '')) {
          data.settings.combatStrategy = 'balanced';
        }
        data.settings.combatTactics = data.settings.combatTactics || {};
        delete data.player;
        delete inv.equipped;
        delete inv.lockedSlots;
        data.v = 12;
      }
    },
    {
      // v12 → v13：将区域数组提升为可扩展 RoutePlan。旧档的既有主线
      // 顺序原样编译，绝不受当前“新档随机路线”功能开关影响。
      from: 12,
      fn: function (data) {
        data.world = data.world || {};
        data.world.routePlan = Game.routes.fromLegacy(
          data.world.regionOrder,
          Number.isFinite(data.world.worldSeed) ? data.world.worldSeed : 0,
          { creationMode: 'legacy-preserved' }
        );
        data.world.regionOrder = Game.routes.mainlineRegionOrder(data.world.routePlan);
        data.v = 13;
      }
    },
    {
      // v13 → v14：ActorRecord 可持久化 Variant，并加入仅使用稳定世界键的
      // 社交状态。Encounter、临时 Actor ID、generation 与战斗时钟均不入档。
      from: 13,
      fn: function (data) {
        data.roster = data.roster || { actors: {} };
        Object.keys(data.roster.actors || {}).forEach(function (actorRecordId) {
          var record = data.roster.actors[actorRecordId];
          if (record && record.variantId === undefined) record.variantId = null;
        });
        data.world = data.world || {};
        data.world.social = {
          spawnVariants: {},
          memories: { spawnId: {}, socialGroupId: {}, factionId: {} }
        };
        data.v = 14;
      }
    },
    {
      // v14 -> v15: persist only stable Hazard discovery and absolute cooldowns.
      from: 14,
      fn: function (data) {
        data.world = data.world || {};
        data.world.hazards = {
          layoutVersion: data.world.layoutVersion || 3,
          regions: {}
        };
        data.v = 15;
      }
    }
  ];

  function validSaveShape(data) {
    return !!(data && typeof data.v === 'number' &&
      (data.player || data.roster && data.roster.actors));
  }

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

  function validVariantForArchetype(variantId, archetypeId) {
    if (!variantId || !Game.content) return null;
    var variant = Game.content.get('actorVariant', variantId);
    return variant && variant.archetypeId === archetypeId ? variantId : null;
  }

  function normalizeMemoryRecord(record, kind) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    var relation = /^(ally|neutral|hostile)$/.test(record.relation || '')
      ? record.relation : null;
    var reputation = Number(record.reputation);
    if (!relation && !Number.isFinite(reputation)) return null;
    var expires = record.expiresAtWorldTime;
    if (expires !== null && expires !== undefined &&
        (!Number.isFinite(Number(expires)) || Number(expires) < 0)) return null;
    if (record.profileId && (!Game.content ||
        !Game.content.has('worldSpawnProfile', record.profileId))) return null;
    if (kind === 'factionId' && record.factionId &&
        record.factionId !== record.indexId) return null;
    return {
      relation: relation,
      reputation: Number.isFinite(reputation) ? reputation : null,
      expiresAtWorldTime: expires === null || expires === undefined
        ? null : Number(expires),
      profileId: record.profileId || null,
      reason: typeof record.reason === 'string' ? record.reason.slice(0, 80) : null
    };
  }

  function normalizeSocial(saved, worldTime) {
    saved = saved && typeof saved === 'object' ? saved : {};
    var out = {
      spawnVariants: {},
      memories: { spawnId: {}, socialGroupId: {}, factionId: {} }
    };
    Object.keys(saved.spawnVariants || {}).sort().forEach(function (spawnId) {
      if (!spawnId || spawnId.length > 256) return;
      var variantId = saved.spawnVariants[spawnId];
      var variant = Game.content && Game.content.get('actorVariant', variantId);
      var persistent = variant && (variant.transitions || []).some(function (edge) {
        return edge.persistence === 'worldSpawn';
      });
      if (persistent) out.spawnVariants[spawnId] = variantId;
    });
    var memories = saved.memories || {};
    ['spawnId', 'socialGroupId', 'factionId'].forEach(function (kind) {
      Object.keys(memories[kind] || {}).sort().forEach(function (indexId) {
        if (!indexId || indexId.length > 256) return;
        if (kind === 'factionId' && (!Game.content ||
            !Game.content.has('faction', indexId))) return;
        var source = Object.assign({}, memories[kind][indexId], { indexId: indexId });
        var normalized = normalizeMemoryRecord(source, kind);
        if (!normalized) return;
        if (normalized.expiresAtWorldTime !== null &&
            normalized.expiresAtWorldTime <= worldTime) return;
        out.memories[kind][indexId] = normalized;
      });
    });
    return out;
  }

  function normalizeHazards(saved, currentWorldTime, layoutVersion) {
    saved = saved && typeof saved === 'object' ? saved : {};
    var out = { layoutVersion: layoutVersion || 3, regions: {} };
    if ((saved.layoutVersion | 0) !== (layoutVersion | 0)) return out;
    Object.keys(saved.regions || {}).sort().forEach(function (rid) {
      if (!Game.content || !Game.content.has('regionProfile', rid)) return;
      var source = saved.regions[rid] || {};
      var prefix = 'hz:' + layoutVersion + ':' + rid + ':';
      var discovered = Array.isArray(source.discoveredHazardIds)
        ? source.discoveredHazardIds : [];
      var clean = {
        discoveredHazardIds: discovered.filter(function (id, index) {
          return typeof id === 'string' && id.indexOf(prefix) === 0 &&
            /^hz:[0-9]+:[a-z][A-Za-z0-9_.:-]*:[0-9a-f]{8}:[0-9]+$/.test(id) &&
            discovered.indexOf(id) === index;
        }).sort(),
        hazardCooldowns: {}
      };
      Object.keys(source.hazardCooldowns || {}).sort().forEach(function (id) {
        var until = Number(source.hazardCooldowns[id]);
        if (id.indexOf(prefix) !== 0 || !Number.isFinite(until) ||
            until <= currentWorldTime || until > currentWorldTime + 86400) return;
        clean.hazardCooldowns[id] = until;
      });
      out.regions[rid] = clean;
    });
    return out;
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
      var record = st.roster.actors[st.roster.primaryActorId];
      if (record && Game.world && Game.world.hero && Game.units) {
        Game.units.commit(Game.world.hero);
      }
      return {
        v: Game.SAVE_VERSION,
        ts: U.now(),
        createdAt: st.createdAt,
        settings: st.settings,
        roster: st.roster,
        economy: st.economy,
        inv: {
          items: st.inv.items,
          potions: st.inv.potions,
          materials: st.inv.materials,
          uidSeq: Game.inv.peekUidSeq()
        },
        world: {
          region: st.world.region,
          regionOrder: st.world.regionOrder,
          routePlan: st.world.routePlan,
          worldSeed: st.world.worldSeed >>> 0,
          layoutVersion: st.world.layoutVersion,
          mode: st.world.mode,
          restBuffT: st.world.restBuffT,
          worldTime: st.world.worldTime,
          regionProg: st.world.regionProg,
          nodeCooldowns: st.world.nodeCooldowns,
          exploration: st.world.exploration,
          hazards: st.world.hazards,
          social: st.world.social,
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
      if (!validSaveShape(data)) {
        try { raw = localStorage.getItem(KEY_BAK); } catch (e) {}
        if (raw) {
          try { data = JSON.parse(raw); } catch (e) { data = null; }
          if (data) console.warn('[Save] 主档损坏，已从备份档恢复');
        }
      }
      if (!validSaveShape(data)) return null;
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
      st.settings.expeditionStrategy = /^(safe|balanced|loot)$/.test(st.settings.expeditionStrategy)
        ? st.settings.expeditionStrategy
        : 'balanced';
      st.settings.combatStrategy = /^(safe|balanced|aggressive)$/.test(st.settings.combatStrategy)
        ? st.settings.combatStrategy
        : 'balanced';
      st.settings.combatTactics = st.settings.combatTactics &&
        typeof st.settings.combatTactics === 'object' ? st.settings.combatTactics : {};
      st.settings.autoBoss = st.settings.autoBoss !== false;
      var loadedRoster = data.roster || {};
      var loadedPrimaryId = loadedRoster.primaryActorId || 'player-main';
      var loadedActors = loadedRoster.actors || {};
      var normalizedActors = {};
      Object.keys(loadedActors).sort().forEach(function (actorRecordId) {
        var stableId = Game.contentSchemas && Game.contentSchemas.stableId ||
          /^[a-z][A-Za-z0-9_.:-]*$/;
        if (!stableId.test(actorRecordId)) return;
        var loadedRecord = loadedActors[actorRecordId] || {};
        var archetypeId = loadedRecord.archetypeId ||
          (actorRecordId === loadedPrimaryId ? 'adventurer' : null);
        if (!archetypeId || (Game.content &&
            !Game.content.has('actorArchetype', archetypeId))) return;
        var loadedHp = loadedRecord.persistentResources &&
          loadedRecord.persistentResources.hp;
        normalizedActors[actorRecordId] = {
          id: actorRecordId,
          archetypeId: archetypeId,
          variantId: validVariantForArchetype(loadedRecord.variantId, archetypeId),
          classId: loadedRecord.classId || null,
          level: Math.max(1, loadedRecord.level | 0 || 1),
          exp: Math.max(0, Number(loadedRecord.exp) || 0),
          skillPoints: Math.max(0, loadedRecord.skillPoints | 0),
          talentRanks: Object.assign({}, loadedRecord.talentRanks || {}),
          permanentUpgrades: Object.assign({}, loadedRecord.permanentUpgrades || {}),
          persistentResources: Number.isFinite(loadedHp)
            ? { hp: Math.max(0, loadedHp) } : {},
          loadout: {
            equipment: Object.assign({ weapon: null, armor: null, ring: null },
              loadedRecord.loadout && loadedRecord.loadout.equipment || {}),
            lockedSlots: Object.assign({ weapon: false, armor: false, ring: false },
              loadedRecord.loadout && loadedRecord.loadout.lockedSlots || {})
          }
        };
      });
      if (!normalizedActors[loadedPrimaryId]) {
        normalizedActors['player-main'] = st.roster.actors['player-main'];
        loadedPrimaryId = 'player-main';
      }
      st.roster.actors = normalizedActors;
      st.roster.primaryActorId = loadedPrimaryId;
      var loadedParty = Array.isArray(loadedRoster.activeParty)
        ? loadedRoster.activeParty : [loadedPrimaryId];
      st.roster.activeParty = loadedParty.filter(function (actorRecordId, index) {
        return normalizedActors[actorRecordId] &&
          loadedParty.indexOf(actorRecordId) === index;
      }).slice(0, 4);
      if (st.roster.activeParty.indexOf(loadedPrimaryId) < 0) {
        st.roster.activeParty.unshift(loadedPrimaryId);
        st.roster.activeParty = st.roster.activeParty.slice(0, 4);
      }
      U.merge(st.economy, data.economy || {});
      st.economy.gold = Math.max(0, Number(st.economy.gold) || 0);
      st.economy.crystal = Math.max(0, Number(st.economy.crystal) || 0);
      if (data.inv) {
        st.inv.items = Array.isArray(data.inv.items) ? data.inv.items : [];
        U.merge(st.inv.potions, data.inv.potions || {});
        U.merge(st.inv.materials, data.inv.materials || {});
      }
      U.merge(st.world, data.world || {});
      st.world.worldSeed = Number.isFinite(st.world.worldSeed)
        ? (st.world.worldSeed >>> 0)
        : U.strSeed('legacy:' + (data.createdAt || data.ts || 0));
      st.world.layoutVersion = 3;
      st.world.exploration = data.world && data.world.exploration &&
        typeof data.world.exploration === 'object' ? data.world.exploration : {};
      st.world.hazards = normalizeHazards(
        data.world && data.world.hazards,
        Math.max(0, Number(st.world.worldTime) || 0),
        st.world.layoutVersion
      );
      st.world.social = normalizeSocial(
        data.world && data.world.social,
        Math.max(0, Number(st.world.worldTime) || 0)
      );
      st.world.routePlan = Game.routes.normalize(
        data.world && data.world.routePlan,
        data.world && data.world.regionOrder,
        st.world.worldSeed
      );
      st.world.regionOrder = Game.State.normalizeRegionOrder(
        Game.routes.mainlineRegionOrder(st.world.routePlan)
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

      // 内容缺失时从合法脱战状态降级：逐 ActorRecord 清理职业和 Talent。
      Object.keys(st.roster.actors).forEach(function (actorRecordId) {
        var record = st.roster.actors[actorRecordId];
        if (record.classId && ((Game.content &&
            !Game.content.has('class', record.classId)) ||
            !Game.reg.has('class', record.classId))) {
          record.classId = null;
        }
        Object.keys(record.talentRanks).forEach(function (talentId) {
          var rank = Math.max(0, record.talentRanks[talentId] | 0);
          var talent = Game.content && Game.content.get('talent', talentId);
          if (!Game.content) {
            var legacyTalent = Game.reg.get('skill', talentId);
            if (legacyTalent) talent = {
              classId: legacyTalent.cls,
              maxRank: Game.SKILL_MAX_LV || 10,
              costs: [1]
            };
          }
          if (!talent || talent.classId !== record.classId) {
            if (!talent) record.skillPoints += rank;
            else {
              for (var refundedRank = 0; refundedRank < rank; refundedRank++) {
                record.skillPoints += talent.costs.length === 1
                  ? talent.costs[0]
                  : talent.costs[Math.min(refundedRank, talent.costs.length - 1)];
              }
            }
            delete record.talentRanks[talentId];
          } else {
            record.talentRanks[talentId] = Math.min(rank, talent.maxRank);
            for (var removedRank = talent.maxRank; removedRank < rank; removedRank++) {
              record.skillPoints += talent.costs.length === 1
                ? talent.costs[0]
                : talent.costs[Math.min(removedRank, talent.costs.length - 1)];
            }
          }
        });
      });

      // 数据卫生：清除引用已下线内容的装备（折算金币），装备指针失效则置空
      var validItems = [];
      for (var i = 0; i < st.inv.items.length; i++) {
        var it = st.inv.items[i];
        if (Game.reg.has('slot', it.base)) validItems.push(it);
        else st.player.gold += 50;
      }
      st.inv.items = validItems;
      Object.keys(st.roster.actors).forEach(function (actorRecordId) {
        var loadout = st.roster.actors[actorRecordId].loadout;
        Object.keys(loadout.equipment).forEach(function (slot) {
          var uid = loadout.equipment[slot];
          if (uid && !validItems.some(function (x) { return x.uid === uid; })) {
            loadout.equipment[slot] = null;
          }
          loadout.lockedSlots[slot] = !!loadout.lockedSlots[slot];
        });
      });
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

      Game.state = Game.State.attachCompatibility(st);
      // 损坏或尺寸不匹配的 bitset 只重置对应区域探索，不影响角色档。
      if (Game.exploration) {
        Game.State.normalizeRegionOrder(st.world.regionOrder).forEach(function (rid) {
          Game.exploration.regionState(rid);
        });
      }
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
        if (!validSaveShape(data)) return { ok: false };
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
        if (!validSaveShape(data)) return { ok: false };
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
