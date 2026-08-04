/* ============================================================
 * systems/inventory.js — 背包 / 装备生成 / 穿戴 / 出售 / 药水
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  var CAP = 100;
  var uidSeq = 1;

  var Inv = Game.inv = {
    CAP: CAP,

    setUidSeq: function (n) { uidSeq = Math.max(uidSeq, n | 0); },
    peekUidSeq: function () { return uidSeq; },
    allocateEquipmentUid: function () { return 'eq:i' + (uidSeq++); },

    materializePreview: function (preview) {
      if (!preview) return null;
      if (Game.equipment && Game.equipment.isV2(preview)) {
        var v2 = Game.contentCompiler.clone(preview);
        v2.uid = preview.uid || 'eq:i' + (uidSeq++);
        return Game.equipment.normalizeCompatibility(v2);
      }
      return {
        uid: preview.uid || 'i' + (uidSeq++),
        base: preview.base,
        ilvl: Math.max(1, Math.round(preview.ilvl)),
        rar: U.clamp(preview.rar | 0, 0, F.RARITY.length - 1),
        affixes: (preview.affixes || []).map(function (affix) {
          return { id: affix.id, v: Number(affix.v) || 0 };
        })
      };
    },

    /* ---------------- 属性折算 ---------------- */
    itemStats: function (item) {
      if (Game.equipment && Game.equipment.isV2(item)) return Game.equipment.itemStats(item);
      var st = {
        atk: 0, hp: 0, def: 0, spd: 0, crit: 0, critDmg: 0,
        goldMul: 0, expMul: 0, dropMul: 0, atkPct: 0, hpPct: 0
      };
      var P = F.gearPrimary(item.ilvl) * F.RARITY[item.rar].mult;
      if (item.base === 'weapon') {
        st.atk = Math.round(P);
      } else if (item.base === 'armor') {
        st.hp = Math.round(P * 3.4);
        st.def = Math.round(P * 0.38);
      } else { // ring
        st.atk = Math.round(P * 0.35);
        st.hp = Math.round(P * 1.5);
      }
      for (var i = 0; i < item.affixes.length; i++) {
        var af = item.affixes[i];
        var def = reg.get('affix', af.id);
        if (!def) continue; // 词条已下线：优雅降级为无效词条
        var key = def.stat;
        if (def.kind === 'pct') {
          if (key === 'atk') st.atkPct += af.v;
          else if (key === 'hp') st.hpPct += af.v;
          else st[key] = (st[key] || 0) + af.v;
        } else {
          st[key] = (st[key] || 0) + af.v;
        }
      }
      return st;
    },

    byUid: function (uid) {
      var items = Game.state.inv.items;
      for (var i = 0; i < items.length; i++) if (items[i].uid === uid) return items[i];
      return null;
    },

    isEquipped: function (uid) {
      var eq = Game.state.inv.equipped;
      return Object.keys(eq || {}).some(function (slot) { return eq[slot] === uid; });
    },

    /* ---------------- 获得 / 穿戴 / 出售 ---------------- */
    /**
     * 批量装备入库事务：先暂存并自动优化，再执行容量淘汰。
     * 返回最终仍在背包中的本批物品。
     */
    addItems: function (items, opts) {
      opts = opts || {};
      var inv = Game.state.inv;
      var incoming = [];
      for (var n = 0; n < items.length; n++) {
        if (!items[n]) continue;
        inv.items.push(items[n]);
        incoming.push(items[n]);
      }
      if (!incoming.length) return [];

      // 自动换装必须先于容量淘汰，避免升级品在满包时被直接折现。
      if (!opts.skipAuto && Game.auto && Game.state.settings.autoEquip) {
        Game.auto.optimizeEquipment({ reason: opts.source || (opts.offline ? 'offline' : 'loot') });
      }

      while (inv.items.length > CAP) {
        var lowest = null, li = -1;
        for (var i = 0; i < inv.items.length; i++) {
          var it = inv.items[i];
          if (Inv.isEquipped(it.uid)) continue;
          if (!lowest || it.rar < lowest.rar) { lowest = it; li = i; }
        }
        if (!lowest) break;
        inv.items.splice(li, 1);
        Game.player.addGold(Game.equipment ? Game.equipment.sellPrice(lowest) :
          F.sellPrice(lowest.ilvl, lowest.rar), { raw: false });
        bus.emit('inv:autosell', { item: lowest });
      }

      var kept = incoming.filter(function (item) {
        return inv.items.indexOf(item) >= 0;
      });
      if (!opts.silent) {
        kept.forEach(function (item) {
          bus.emit('item:dropped', { item: item, offline: !!opts.offline, source: opts.source || 'loot' });
        });
      }
      return kept;
    },

    addItem: function (item, opts) {
      var kept = Inv.addItems([item], opts);
      return kept.length ? kept[0] : null;
    },

    equip: function (uid, opts) {
      opts = opts || {};
      var item = Inv.byUid(uid);
      if (!item) return { ok: false, reason: 'missing-item' };
      if (Game.world && Game.world.hero && Game.world.hero.encounterId) {
        return { ok: false, reason: 'encounter-active' };
      }
      if (item.classId && item.classId !== Game.state.player.classId) {
        return { ok: false, reason: 'class-mismatch' };
      }
      var slot = Game.equipment ? Game.equipment.slotOf(item) : item.base;
      var previous = Inv.byUid(Game.state.inv.equipped[slot]);
      Game.state.inv.equipped[slot] = uid;
      Game.player.recalc();
      if (Game.world && Game.world.hero) Game.world.syncHeroStats();
      bus.emit('item:equipped', { item: item, previous: previous, auto: !!opts.auto });
      return { ok: true, item: item, previous: previous, slot: slot };
    },

    unequip: function (slot) {
      if (Game.world && Game.world.hero && Game.world.hero.encounterId) {
        return { ok: false, reason: 'encounter-active' };
      }
      var previous = Inv.byUid(Game.state.inv.equipped[slot]);
      Game.state.inv.equipped[slot] = null;
      Game.player.recalc();
      if (Game.world && Game.world.hero) Game.world.syncHeroStats();
      bus.emit('item:unequipped', { slot: slot, item: previous });
      return { ok: true, item: previous, slot: slot };
    },

    /** 出售：传说分解为魔晶石，其余折金币 */
    sell: function (uid) {
      var inv = Game.state.inv;
      var item = Inv.byUid(uid);
      if (!item) return null;
      if (Inv.isEquipped(uid) && Game.world && Game.world.hero && Game.world.hero.encounterId) {
        return { ok: false, reason: 'encounter-active' };
      }
      if (Inv.isEquipped(uid)) {
        inv.equipped[Game.equipment ? Game.equipment.slotOf(item) : item.base] = null;
        Game.player.recalc();
        if (Game.world && Game.world.hero) Game.world.syncHeroStats();
      }
      inv.items.splice(inv.items.indexOf(item), 1);
      Game.state.meta.stats.sells++;
      if ((Game.equipment ? Game.equipment.rarityRank(item) : item.rar) === 4) {
        var c = Game.equipment ? Game.equipment.salvageCrystal(item) : F.salvageCrystal(item.ilvl);
        Game.player.addCrystal(c);
        return { crystal: c };
      }
      var g = Game.equipment ? Game.equipment.sellPrice(item) : F.sellPrice(item.ilvl, item.rar);
      Game.player.addGold(g, { raw: true });
      bus.emit('gold:changed', { delta: g, total: Game.state.player.gold });
      return { gold: g };
    },

    /** 一键出售 ≤maxRar 的未装备物品 */
    sellBelow: function (maxRar) {
      var inv = Game.state.inv;
      var gold = 0, n = 0;
      for (var i = inv.items.length - 1; i >= 0; i--) {
        var it = inv.items[i];
        if ((Game.equipment ? Game.equipment.rarityRank(it) : it.rar) > maxRar) continue;
        if (Inv.isEquipped(it.uid)) continue;
        gold += Game.equipment ? Game.equipment.sellPrice(it) : F.sellPrice(it.ilvl, it.rar);
        inv.items.splice(i, 1);
        n++;
      }
      if (n > 0) {
        Game.state.meta.stats.sells += n;
        Game.player.addGold(gold, { raw: true });
        bus.emit('gold:changed', { delta: gold, total: Game.state.player.gold });
      }
      return { count: n, gold: gold };
    },

    /* ---------------- 药水 ---------------- */
    addPotion: function (pid, n) {
      var pots = Game.state.inv.potions;
      pots[pid] = (pots[pid] || 0) + n;
    },

    potionCount: function (pid) {
      return Game.state.inv.potions[pid] || 0;
    },

    /** 兼容旧调用：优先小瓶，实际校验/效果/共享冷却统一走 Game.items。 */
    consumePotion: function (opts) {
      opts = opts || {};
      if (!opts.source) opts.source = 'auto';
      var pots = Game.state.inv.potions;
      var pid = null;
      if ((pots.potion_small || 0) > 0) pid = 'potion_small';
      else if ((pots.potion_large || 0) > 0) pid = 'potion_large';
      if (!pid) return null;
      var result = Game.items.use('potion', pid, opts);
      if (!result.ok) return null;
      return { pid: pid, heal: result.effect.amount, result: result };
    },

    /* ---------------- 素材 ---------------- */
    addMaterial: function (id, n, opts) {
      if (!reg.has('material', id) || !(n > 0)) return 0;
      var mats = Game.state.inv.materials;
      mats[id] = (mats[id] || 0) + Math.floor(n);
      if (!(opts && opts.noStats)) Game.state.meta.stats.materials += Math.floor(n);
      bus.emit('material:changed', { id: id, delta: Math.floor(n), total: mats[id] });
      return Math.floor(n);
    },

    materialCount: function (id) {
      return Game.state.inv.materials[id] || 0;
    },

    spendMaterials: function (costs) {
      costs = costs || {};
      for (var id in costs) {
        if (Inv.materialCount(id) < costs[id]) return false;
      }
      for (var key in costs) {
        Game.state.inv.materials[key] = Math.max(0, Inv.materialCount(key) - costs[key]);
        bus.emit('material:changed', {
          id: key, delta: -costs[key], total: Game.state.inv.materials[key]
        });
      }
      return true;
    },

    /* ---------------- 掉落判定 / 发放（严格拆分） ---------------- */
    rollDropResults: function (tier, isBoss, opts) {
      opts = opts || {};
      var results = [];
      var d = Game.player.derived();
      var lv = Game.state.player.level;
      var sourceType = isBoss ? 'boss' : opts.sourceType || 'regular';
      var plan = Game.loot.plan({
        sourceType: sourceType,
        sourceId: opts.sourceId || (isBoss ? 'boss:' : 'combat:') +
          (Game.state.world.region || 'unknown'),
        playerLevel: lv, tier: tier,
        minimumRank: isBoss ? 2 : 0,
        dropMultiplier: Game.player.restMults().drop * d.dropMul,
        rarityLuck: (d.rarityLuck || 0) + Math.max(0, Number(opts.rarityLuck) ||
          (Number(opts.luck) || 1) - 1),
        classId: Game.state.player.classId,
        regionId: Game.state.world.region,
        worldSeed: Game.state.world.worldSeed,
        expeditionIndex: Game.expedition && Game.expedition.current
          ? Game.expedition.current(Game.state.world.region).index : 0,
        firstKill: isBoss && !Game.State.regionProg(Game.state.world.region).firstKill
      }, Game.state.inv.loot);
      Game.loot.accept(plan).forEach(function (item) {
        results.push({ category: 'equipment', item: item });
      });
      if (U.chance(F.BAL.dropPotion * (isBoss ? 3 : 1))) {
        results.push({
          category: 'potion',
          id: U.chance(0.8) ? 'potion_small' : 'potion_large',
          count: 1
        });
      }
      return results;
    },

    commitDrop: function (drop, opts) {
      opts = opts || {};
      if (!drop) return null;
      if (drop.category === 'equipment' && drop.item) {
        return Inv.addItem(drop.item, {
          source: opts.source || 'loot',
          offline: !!opts.offline,
          silent: !!opts.silent
        });
      }
      if (drop.category === 'potion' && drop.id) {
        Inv.addPotion(drop.id, drop.count || 1);
        bus.emit('potion:dropped', {
          pid: drop.id,
          count: drop.count || 1,
          source: opts.source || 'loot'
        });
        return drop;
      }
      return null;
    },

    deliverDrops: function (results, opts) {
      opts = opts || {};
      var delivered = [];
      for (var i = 0; i < results.length; i++) {
        var drop = results[i];
        var ground = !!opts.forceGround ||
          (opts.source === 'combat' && Game.state.settings.groundLoot !== false);
        if (ground && Game.world && Game.world.spawnGroundLoot) {
          if (Game.world.spawnGroundLoot(drop, opts.x, opts.y, opts)) continue;
        }
        var got = Inv.commitDrop(drop, opts);
        if (got) delivered.push(got);
      }
      return delivered;
    },

    /** 兼容入口：Boss/离线/商店等默认直接入包，普通战斗按设置落地。 */
    rollDrops: function (tier, isBoss, opts) {
      opts = opts || {};
      if (!opts.source) opts.source = isBoss ? 'boss' : 'combat';
      return Inv.deliverDrops(Inv.rollDropResults(tier, isBoss, opts), opts);
    }
  };
})();
