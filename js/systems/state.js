/* ============================================================
 * systems/state.js — 游戏状态与角色成长（多职业版）
 * 成长方案：升级自动成长（理由：挂机游戏应减少强制打断，
 * 玩家的主动决策集中在职业选择/技能加点/装备取舍/商店强化）。
 * 职业由 data/classes.js 注册表驱动：基础属性、复利成长、
 * 攻击距离、弹道、固有特性（治疗强化等）全部按职业推导。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  Game.state = null;

  var State = Game.State = {
    /** 新档只打乱前四区；后半程与最终区域保持固定。 */
    makeRegionOrder: function () {
      var list = reg.ids('region');
      var count = Math.min(4, list.length);
      for (var i = count - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
      }
      return list;
    },

    /**
     * 清理存档中的区域顺序：移除重复/下线 ID，并将新增区域按注册顺序补到末尾。
     * 未提供顺序时使用经典注册顺序（用于旧档兼容）。
     */
    normalizeRegionOrder: function (savedOrder) {
      var canonical = reg.ids('region');
      var source = Array.isArray(savedOrder) ? savedOrder : canonical;
      var seen = {}, out = [];
      for (var i = 0; i < source.length; i++) {
        var rid = source[i];
        if (!seen[rid] && reg.has('region', rid)) {
          seen[rid] = true;
          out.push(rid);
        }
      }
      for (var j = 0; j < canonical.length; j++) {
        if (!seen[canonical[j]]) out.push(canonical[j]);
      }
      return out;
    },

    regionOrder: function () {
      if (Game.state && Game.state.world) {
        return State.normalizeRegionOrder(Game.state.world.regionOrder);
      }
      return reg.ids('region');
    },

    regionIndex: function (rid) {
      return State.regionOrder().indexOf(rid);
    },

    /** 难度与奖励取本存档中的推进位置，而不是区域的经典编号。 */
    regionTier: function (rid) {
      var idx = State.regionIndex(rid);
      if (idx >= 0) return idx + 1;
      var def = reg.get('region', rid);
      return def ? def.tier : 1;
    },

    /** 新档（职业在序章后选择） */
    newGame: function () {
      var regionOrder = State.makeRegionOrder();
      var s = {
        createdAt: U.now(),
        settings: {
          lang: 'zh-CN', effects: true, potionThreshold: 0.3,
          autoAdvance: true, autoSkillUpgrade: true, autoEquip: true,
          controlMode: 'auto',
          sfx: true, music: true
        },
        player: {
          classId: null,
          level: 1, exp: 0, sp: 0,
          gold: 0, crystal: 0,
          hp: 100,
          skills: {},          // skillId -> lv
          perms: {}            // shopItemId -> count
        },
        inv: {
          items: [],
          equipped: { weapon: null, armor: null, ring: null },
          lockedSlots: { weapon: false, armor: false, ring: false },
          potions: { potion_small: 3, potion_large: 0 }
        },
        world: {
          region: regionOrder[0],
          regionOrder: regionOrder,
          mode: 'battle',
          restBuffT: 0,
          worldTime: 300,
          regionProg: {},
          deathsRow: 0
        },
        meta: {
          stats: {
            kills: 0, bossKills: 0, goldEarned: 0, expEarned: 0,
            drops: 0, legendaries: 0, potions: 0, deaths: 0,
            playSec: 0, restSec: 0, offlineSec: 0, sells: 0,
            maxHit: 0, level: 1, highestRegion: 1
          },
          ach: {},
          prologueDone: false
        }
      };
      return s;
    },

    regionProg: function (rid) {
      var w = Game.state.world;
      if (!w.regionProg[rid]) w.regionProg[rid] = { kills: 0, cleared: false, firstKill: false };
      return w.regionProg[rid];
    }
  };

  /* ---------------- 角色 ---------------- */
  var Player = Game.player = {
    /** 当前职业定义（未选择时回退首个职业，仅用于占位渲染） */
    classDef: function () {
      var p = Game.state.player;
      return reg.get('class', p.classId) || reg.all('class')[0];
    },

    hasClass: function () {
      return !!(Game.state && Game.state.player.classId && reg.has('class', Game.state.player.classId));
    },

    /** 选定职业（永久） */
    setClass: function (cid) {
      if (!reg.has('class', cid)) return false;
      var s = Game.state;
      s.player.classId = cid;
      Player.recalc();
      s.player.hp = s.derived.maxHp;
      bus.emit('class:chosen', { cid: cid });
      return true;
    },

    /**
     * 无副作用地预览派生属性。
     * opts 可覆盖 level/classId/skills/equipped；equipped 的值可为 uid 或物品对象。
     */
    previewDerived: function (opts) {
      opts = opts || {};
      var s = Game.state, p = s.player;
      var classId = opts.classId !== undefined ? opts.classId : p.classId;
      var cls = reg.get('class', classId) || Player.classDef();
      var level = opts.level !== undefined ? opts.level : p.level;
      var skills = opts.skills || p.skills;
      var equipped = opts.equipped || s.inv.equipped;
      var base = F.playerBase(cls, level);
      var d = {
        maxHp: base.hp, atk: base.atk, def: base.def, spd: base.spd,
        crit: base.crit, critDmg: base.critDmg,
        goldMul: 1, expMul: 1, dropMul: 1,
        dodge: 0, lifesteal: 0, cdr: 0, healPow: 1, regen: 0,
        range: cls.range, projectile: cls.projectile || null
      };
      var ex = cls.extra || {};
      d.healPow += ex.healPow || 0;
      d.dodge += ex.dodge || 0;
      d.lifesteal += ex.lifesteal || 0;
      d.cdr += ex.cdr || 0;

      var pctAcc = { atkPct: 0, hpPct: 0, defPct: 0, spdPct: 0 };

      // 装备
      for (var slot in equipped) {
        if (!equipped[slot]) continue;
        var item = typeof equipped[slot] === 'string'
          ? Game.inv.byUid(equipped[slot])
          : equipped[slot];
        if (!item) continue;
        var st = Game.inv.itemStats(item);
        d.atk += st.atk || 0; d.maxHp += st.hp || 0; d.def += st.def || 0; d.spd += st.spd || 0;
        d.crit += st.crit || 0; d.critDmg += st.critDmg || 0;
        d.goldMul += st.goldMul || 0; d.expMul += st.expMul || 0;
        d.dropMul += st.dropMul || 0;
        pctAcc.atkPct += st.atkPct || 0; pctAcc.hpPct += st.hpPct || 0;
      }

      // 被动技能（仅本职业技能生效）
      for (var sid in skills) {
        var lv = skills[sid];
        if (!lv) continue;
        var def = reg.get('skill', sid);
        if (!def || def.type !== 'passive' || def.cls !== classId) continue;
        var b = def.bonus || {};
        pctAcc.atkPct += (b.atkPct || 0) * lv;
        pctAcc.hpPct += (b.hpPct || 0) * lv;
        pctAcc.defPct += (b.defPct || 0) * lv;
        pctAcc.spdPct += (b.spdPct || 0) * lv;
        d.crit += (b.crit || 0) * lv;
        d.critDmg += (b.critDmg || 0) * lv;
        d.dodge += (b.dodge || 0) * lv;
        d.cdr += (b.cdr || 0) * lv;
        d.lifesteal += (b.lifesteal || 0) * lv;
        d.healPow += (b.healPow || 0) * lv;
        d.goldMul += (b.goldMul || 0) * lv;
        d.dropMul += (b.dropMul || 0) * lv;
        d.regen += (b.regen || 0) * lv;
      }

      // 永久强化
      for (var pid in p.perms) {
        var pdef = reg.get('shopItem', pid);
        var n = p.perms[pid];
        if (!pdef || !n) continue;
        if (pdef.stat === 'atk') pctAcc.atkPct += pdef.pct * n;
        else if (pdef.stat === 'hp') pctAcc.hpPct += pdef.pct * n;
        else if (pdef.stat === 'goldMul') d.goldMul += pdef.pct * n;
        else if (pdef.stat === 'expMul') d.expMul += pdef.pct * n;
      }

      d.atk = Math.round(d.atk * (1 + pctAcc.atkPct));
      d.maxHp = Math.round(d.maxHp * (1 + pctAcc.hpPct));
      d.def = Math.round(d.def * (1 + pctAcc.defPct));
      d.spd = +(d.spd * (1 + pctAcc.spdPct)).toFixed(2);
      d.crit = Math.min(0.75, d.crit);
      d.dodge = Math.min(F.BAL.dodgeCap, d.dodge);
      d.cdr = Math.min(F.BAL.cdrCap, d.cdr);

      return d;
    },

    /** 全量重算派生属性（职业 + 等级 + 装备 + 被动 + 永久强化） */
    recalc: function () {
      var s = Game.state, p = s.player;
      var d = Player.previewDerived();
      s.derived = d;
      if (p.hp > d.maxHp) p.hp = d.maxHp;
      return d;
    },

    derived: function () {
      return Game.state.derived || Player.recalc();
    },

    restMults: function () {
      var on = Game.state.world.restBuffT > 0;
      return {
        exp: on ? 1 + F.BAL.restExpBonus : 1,
        drop: on ? 1 + F.BAL.restDropBonus : 1
      };
    },

    addExp: function (n) {
      if (n <= 0) return 0;
      var s = Game.state, p = s.player;
      var d = Player.derived();
      var gain = Math.round(n * d.expMul * Player.restMults().exp);
      p.exp += gain;
      s.meta.stats.expEarned += gain;
      var ups = 0;
      while (p.exp >= F.expNeed(p.level)) {
        p.exp -= F.expNeed(p.level);
        p.level++;
        p.sp++;
        ups++;
      }
      if (ups > 0) {
        s.meta.stats.level = p.level;
        Player.recalc();
        p.hp = s.derived.maxHp;
        bus.emit('player:levelup', { level: p.level, ups: ups });
      }
      bus.emit('exp:gained', { amount: gain });
      return gain;
    },

    addGold: function (n, opts) {
      var s = Game.state, p = s.player;
      var gain = n;
      if (n > 0 && !(opts && opts.raw)) {
        gain = Math.round(n * Player.derived().goldMul);
        s.meta.stats.goldEarned += gain;
      }
      p.gold = Math.max(0, p.gold + gain);
      bus.emit('gold:changed', { delta: gain, total: p.gold });
      return gain;
    },

    addCrystal: function (n) {
      var p = Game.state.player;
      p.crystal = Math.max(0, p.crystal + n);
      bus.emit('crystal:changed', { delta: n, total: p.crystal });
      return n;
    },

    /** 治疗（受治疗强化加成；opts.raw 跳过加成） */
    heal: function (n, opts) {
      var s = Game.state, p = s.player;
      var d = Player.derived();
      if (n > 0 && !(opts && opts.raw)) n *= d.healPow;
      p.hp = U.clamp(p.hp + n, 0, d.maxHp);
      return p.hp;
    },

    hpPct: function () {
      return Game.state.player.hp / Math.max(1, Player.derived().maxHp);
    },

    upgradeSkill: function (sid) {
      var s = Game.state, p = s.player;
      var def = reg.get('skill', sid);
      if (!def) return false;
      if (def.cls !== p.classId) return false;
      var lv = p.skills[sid] || 0;
      if (lv >= Game.SKILL_MAX_LV) return false;
      if (p.sp < 1) return false;
      if (p.level < (def.unlockLv || 1)) return false;
      p.sp--;
      p.skills[sid] = lv + 1;
      Player.recalc();
      bus.emit('skill:upgraded', { sid: sid, lv: lv + 1 });
      return true;
    },

    skillLv: function (sid) { return Game.state.player.skills[sid] || 0; },

    /** 有效 DPS 估算（离线结算/战力参考；含职业爆发系数） */
    estimateDps: function () {
      var d = Player.derived();
      var cls = Player.classDef();
      var tier = State.regionTier(Game.state.world.region);
      var mDef = F.monsterStats(tier, {}, false).def;
      var hit = d.atk * d.atk / (d.atk + mDef);
      var critMult = 1 + d.crit * (d.critDmg - 1);
      var aps = 1 / F.atkInterval(d.spd);
      var activeLv = 0;
      var p = Game.state.player;
      for (var sid in p.skills) {
        var def = reg.get('skill', sid);
        if (def && def.type === 'active' && def.cls === p.classId) activeLv += p.skills[sid];
      }
      var skillBonus = (cls.dpsFactor || 1.2) + 0.012 * activeLv;
      return hit * critMult * aps * skillBonus;
    }
  };
})();
