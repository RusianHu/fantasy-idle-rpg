/* ============================================================
 * systems/state.js — 游戏状态与角色成长
 * 成长方案：升级自动成长（理由：挂机游戏应减少强制打断，
 * 玩家的主动决策集中在技能加点 / 装备取舍 / 商店永久强化三处）。
 * 升级奖励：全属性自动成长 + 1 技能点 + 回满 HP。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  Game.state = null;

  var State = Game.State = {
    /** 新档 */
    newGame: function () {
      var s = {
        createdAt: U.now(),
        settings: {
          lang: 'zh-CN', effects: true, potionThreshold: 0.3,
          autoAdvance: true, sfx: true, music: true
        },
        player: {
          level: 1, exp: 0, sp: 0,
          gold: 0, crystal: 0,
          hp: F.playerBase(1).hp,
          skills: {},          // skillId -> lv
          perms: {}            // shopItemId -> count
        },
        inv: {
          items: [],           // {uid, base, ilvl, rar, affixes:[{id,v}]}
          equipped: { weapon: null, armor: null, ring: null },
          potions: { potion_small: 3, potion_large: 0 }
        },
        world: {
          region: 'grassland',
          mode: 'battle',      // battle | rest
          restBuffT: 0,        // 休整增益剩余秒
          worldTime: 300,      // 游戏内时钟（驱动日夜）
          regionProg: {},      // rid -> {kills, cleared, firstKill}
          deathsRow: 0
        },
        meta: {
          stats: {
            kills: 0, bossKills: 0, goldEarned: 0, expEarned: 0,
            drops: 0, legendaries: 0, potions: 0, deaths: 0,
            playSec: 0, restSec: 0, offlineSec: 0, sells: 0,
            maxHit: 0, level: 1, highestRegion: 1
          },
          ach: {},             // achId -> true
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

  /* ---------------- 角色（属性推导与成长） ---------------- */
  var Player = Game.player = {
    /** 全量重算派生属性（等级 + 装备 + 被动技能 + 永久强化） */
    recalc: function () {
      var s = Game.state, p = s.player;
      var base = F.playerBase(p.level);
      var d = {
        maxHp: base.hp, atk: base.atk, def: base.def, spd: base.spd,
        crit: base.crit, critDmg: base.critDmg,
        goldMul: 1, expMul: 1, dropMul: 1
      };
      var pctAcc = { atkPct: 0, hpPct: 0, defPct: 0, spdPct: 0 };

      // 装备
      var eq = s.inv.equipped;
      for (var slot in eq) {
        if (!eq[slot]) continue;
        var item = Game.inv.byUid(eq[slot]);
        if (!item) continue;
        var st = Game.inv.itemStats(item);
        d.atk += st.atk || 0; d.maxHp += st.hp || 0; d.def += st.def || 0; d.spd += st.spd || 0;
        d.crit += st.crit || 0; d.critDmg += st.critDmg || 0;
        d.goldMul += st.goldMul || 0; d.expMul += st.expMul || 0;
        pctAcc.atkPct += st.atkPct || 0; pctAcc.hpPct += st.hpPct || 0;
      }

      // 被动技能
      var skills = reg.all('skill');
      for (var i = 0; i < skills.length; i++) {
        var sk = skills[i];
        if (sk.type !== 'passive') continue;
        var lv = p.skills[sk.id] || 0;
        if (!lv) continue;
        var b = sk.bonus(lv);
        pctAcc.atkPct += b.atkPct || 0; pctAcc.hpPct += b.hpPct || 0;
        pctAcc.defPct += b.defPct || 0; pctAcc.spdPct += b.spdPct || 0;
        d.crit += b.crit || 0;
      }

      // 永久强化
      for (var sid in p.perms) {
        var def = reg.get('shopItem', sid);
        var n = p.perms[sid];
        if (!def || !n) continue;
        if (def.stat === 'atk') pctAcc.atkPct += def.pct * n;
        else if (def.stat === 'hp') pctAcc.hpPct += def.pct * n;
        else if (def.stat === 'goldMul') d.goldMul += def.pct * n;
        else if (def.stat === 'expMul') d.expMul += def.pct * n;
      }

      d.atk = Math.round(d.atk * (1 + pctAcc.atkPct));
      d.maxHp = Math.round(d.maxHp * (1 + pctAcc.hpPct));
      d.def = Math.round(d.def * (1 + pctAcc.defPct));
      d.spd = +(d.spd * (1 + pctAcc.spdPct)).toFixed(2);
      d.crit = Math.min(0.75, d.crit);

      s.derived = d;
      if (p.hp > d.maxHp) p.hp = d.maxHp;
      return d;
    },

    derived: function () {
      return Game.state.derived || Player.recalc();
    },

    /** 休整增益乘区（经验/掉率） */
    restMults: function () {
      var on = Game.state.world.restBuffT > 0;
      return {
        exp: on ? 1 + F.BAL.restExpBonus : 1,
        drop: on ? 1 + F.BAL.restDropBonus : 1
      };
    },

    addExp: function (n, opts) {
      if (n <= 0) return;
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
        p.hp = s.derived.maxHp; // 升级回满
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

    heal: function (n) {
      var s = Game.state, p = s.player;
      var d = Player.derived();
      p.hp = U.clamp(p.hp + n, 0, d.maxHp);
      return p.hp;
    },

    hpPct: function () {
      return Game.state.player.hp / Math.max(1, Player.derived().maxHp);
    },

    /** 技能升级（花费 1 技能点） */
    upgradeSkill: function (sid) {
      var s = Game.state, p = s.player;
      var def = reg.get('skill', sid);
      if (!def) return false;
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

    /** 有效 DPS 估算（离线结算与推荐战力用） */
    estimateDps: function () {
      var d = Player.derived();
      var region = reg.get('region', Game.state.world.region);
      var tier = region ? region.tier : 1;
      var mDef = F.monsterStats(tier, {}, false).def;
      var hit = d.atk * d.atk / (d.atk + mDef);
      var critMult = 1 + d.crit * (d.critDmg - 1);
      var aps = 1 / F.atkInterval(d.spd);
      // 技能收益近似 +25%（随强力斩/旋风斩等级小幅提升）
      var skillBonus = 1.25 + 0.02 * (Player.skillLv('power_strike') + Player.skillLv('whirlwind'));
      return hit * critMult * aps * skillBonus;
    }
  };
})();
