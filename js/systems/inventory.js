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

    /* ---------------- 生成随机装备 ---------------- */
    genLoot: function (ilvl, opts) {
      opts = opts || {};
      var slots = reg.ids('slot');
      var base = opts.base || U.choice(slots);
      var rar = opts.rar !== undefined ? opts.rar : F.rollRarity(opts.luck);
      if (opts.rarMin !== undefined && rar < opts.rarMin) rar = opts.rarMin;
      var nAffix = F.RARITY[rar].affixes;
      var pool = reg.all('affix').slice();
      var affixes = [];
      for (var i = 0; i < nAffix && pool.length; i++) {
        var idx = U.randInt(0, pool.length - 1);
        var a = pool.splice(idx, 1)[0];
        affixes.push({ id: a.id, v: Inv.rollAffixValue(a, ilvl) });
      }
      return {
        uid: 'i' + (uidSeq++),
        base: base,
        ilvl: Math.max(1, Math.round(ilvl)),
        rar: rar,
        affixes: affixes
      };
    },

    rollAffixValue: function (a, ilvl) {
      if (a.kind === 'pct') return +(U.rand(a.min, a.max)).toFixed(3);
      var v = (a.base + a.perLv * ilvl) * U.rand(0.85, 1.15);
      return a.dec ? +v.toFixed(1) : Math.round(v);
    },

    /* ---------------- 属性折算 ---------------- */
    itemStats: function (item) {
      var st = { atk: 0, hp: 0, def: 0, spd: 0, crit: 0, critDmg: 0, goldMul: 0, expMul: 0, atkPct: 0, hpPct: 0 };
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

    /** 粗略战力评分（对比/排序用） */
    score: function (item) {
      var st = Inv.itemStats(item);
      return st.atk * 3 + st.hp * 0.3 + st.def * 2 + st.spd * 8 +
        (st.crit + st.atkPct) * 400 + (st.critDmg + st.hpPct) * 200 +
        (st.goldMul + st.expMul) * 150;
    },

    byUid: function (uid) {
      var items = Game.state.inv.items;
      for (var i = 0; i < items.length; i++) if (items[i].uid === uid) return items[i];
      return null;
    },

    isEquipped: function (uid) {
      var eq = Game.state.inv.equipped;
      return eq.weapon === uid || eq.armor === uid || eq.ring === uid;
    },

    /* ---------------- 获得 / 穿戴 / 出售 ---------------- */
    addItem: function (item, opts) {
      var inv = Game.state.inv;
      // 背包满：自动出售最旧的最低稀有度物品腾位
      if (inv.items.length >= CAP) {
        var lowest = null, li = -1;
        for (var i = 0; i < inv.items.length; i++) {
          var it = inv.items[i];
          if (Inv.isEquipped(it.uid)) continue;
          if (!lowest || it.rar < lowest.rar) { lowest = it; li = i; }
        }
        if (lowest && lowest.rar <= item.rar) {
          inv.items.splice(li, 1);
          Game.player.addGold(F.sellPrice(lowest.ilvl, lowest.rar), { raw: false });
          bus.emit('inv:autosell', { item: lowest });
        } else {
          // 新掉落品质不高于包内最低：直接折现
          Game.player.addGold(F.sellPrice(item.ilvl, item.rar));
          return null;
        }
      }
      inv.items.push(item);
      if (!(opts && opts.silent)) bus.emit('item:dropped', { item: item });
      return item;
    },

    equip: function (uid) {
      var item = Inv.byUid(uid);
      if (!item) return false;
      Game.state.inv.equipped[item.base] = uid;
      Game.player.recalc();
      bus.emit('item:equipped', { item: item });
      return true;
    },

    unequip: function (slot) {
      Game.state.inv.equipped[slot] = null;
      Game.player.recalc();
    },

    /** 出售：传说分解为魔晶石，其余折金币 */
    sell: function (uid) {
      var inv = Game.state.inv;
      var item = Inv.byUid(uid);
      if (!item) return null;
      if (Inv.isEquipped(uid)) {
        inv.equipped[item.base] = null;
        Game.player.recalc();
      }
      inv.items.splice(inv.items.indexOf(item), 1);
      Game.state.meta.stats.sells++;
      if (item.rar === 4) {
        var c = F.salvageCrystal(item.ilvl);
        Game.player.addCrystal(c);
        return { crystal: c };
      }
      var g = F.sellPrice(item.ilvl, item.rar);
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
        if (it.rar > maxRar) continue;
        if (Inv.isEquipped(it.uid)) continue;
        gold += F.sellPrice(it.ilvl, it.rar);
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

    /** 自动喝药：优先小瓶，小瓶不足时用大瓶（受治疗强化加成） */
    consumePotion: function () {
      var pots = Game.state.inv.potions;
      var pid = null;
      if ((pots.potion_small || 0) > 0) pid = 'potion_small';
      else if ((pots.potion_large || 0) > 0) pid = 'potion_large';
      if (!pid) return null;
      pots[pid]--;
      var d = Game.player.derived();
      var heal = Math.round(d.maxHp * F.potionHeal[pid] * (d.healPow || 1));
      Game.player.heal(heal, { raw: true });
      Game.state.meta.stats.potions++;
      bus.emit('potion:used', { pid: pid, heal: heal });
      return { pid: pid, heal: heal };
    },

    /** 掉落判定（击杀普通怪时调用） */
    rollDrops: function (tier, isBoss) {
      var out = [];
      var d = Game.player.derived();
      var dropMul = Game.player.restMults().drop * d.dropMul;
      var lv = Game.state.player.level;
      if (isBoss || U.chance(F.BAL.dropEquip * dropMul)) {
        var item = Inv.genLoot(lv, isBoss ? { rarMin: 2, luck: 2 } : {});
        if (Inv.addItem(item)) out.push(item);
      }
      if (U.chance(F.BAL.dropPotion * (isBoss ? 3 : 1))) {
        var pid = U.chance(0.8) ? 'potion_small' : 'potion_large';
        Inv.addPotion(pid, 1);
        bus.emit('potion:dropped', { pid: pid });
      }
      return out;
    }
  };
})();
