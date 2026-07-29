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
    attachCompatibility: function (s) {
      function primaryRecord() {
        return s.roster.actors[s.roster.primaryActorId];
      }
      var player = {};
      [
        ['classId', 'classId'], ['level', 'level'], ['exp', 'exp'],
        ['sp', 'skillPoints'], ['hp', 'persistentResources.hp'],
        ['skills', 'talentRanks'], ['perms', 'permanentUpgrades']
      ].forEach(function (map) {
        var path = map[1].split('.');
        Object.defineProperty(player, map[0], {
          enumerable: true,
          get: function () {
            var value = primaryRecord();
            for (var i = 0; i < path.length; i++) value = value[path[i]];
            return value;
          },
          set: function (next) {
            if (map[0] === 'hp' && Game.units) {
              var actor = Game.units.primary();
              if (actor) {
                Game.units.setHp(actor, next, { source: 'compat-state' });
                return;
              }
            }
            var value = primaryRecord();
            for (var i = 0; i < path.length - 1; i++) value = value[path[i]];
            value[path[path.length - 1]] = next;
          }
        });
      });
      ['gold', 'crystal'].forEach(function (key) {
        Object.defineProperty(player, key, {
          enumerable: true,
          get: function () { return s.economy[key]; },
          set: function (value) { s.economy[key] = value; }
        });
      });
      Object.defineProperty(s, 'player', {
        configurable: true, enumerable: false, value: player
      });
      Object.defineProperty(s.inv, 'equipped', {
        configurable: true, enumerable: false,
        get: function () { return primaryRecord().loadout.equipment; },
        set: function (value) { primaryRecord().loadout.equipment = value; }
      });
      Object.defineProperty(s.inv, 'lockedSlots', {
        configurable: true, enumerable: false,
        get: function () { return primaryRecord().loadout.lockedSlots; },
        set: function (value) { primaryRecord().loadout.lockedSlots = value; }
      });
      return s;
    },

    /** 编译新档路线；随机主线由全局 ROUTE_FEATURES 开关控制。 */
    makeRoutePlan: function (worldSeed, opts) {
      return Game.routes.create(worldSeed, opts);
    },

    /** 兼容旧调用方：返回 RoutePlan 的主线区域投影。 */
    makeRegionOrder: function (worldSeed, opts) {
      return Game.routes.mainlineRegionOrder(State.makeRoutePlan(worldSeed, opts));
    },

    /**
     * 清理存档中的区域顺序：移除重复/下线 ID，并将新增区域按注册顺序补到末尾。
     * 未提供顺序时使用经典注册顺序（用于旧档兼容）。
     */
    normalizeRegionOrder: function (savedOrder) {
      return Game.routes.normalizeRegionIds(savedOrder);
    },

    regionOrder: function () {
      if (Game.state && Game.state.world) {
        if (Game.state.world.routePlan) {
          return State.normalizeRegionOrder(
            Game.routes.mainlineRegionOrder(Game.state.world.routePlan)
          );
        }
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

    /**
     * 选定有效职业才算正式开档。标题、序章与补选职业阶段都只是草稿态，
     * 不得推进世界数值或产生离线收益。
     */
    isAdventureStarted: function () {
      var p = Game.state && Game.state.player;
      return !!(p && p.classId && reg.has('class', p.classId));
    },

    /** 新档（职业在序章后选择） */
    newGame: function () {
      var worldSeed = U.randomSeed();
      var routePlan = State.makeRoutePlan(worldSeed);
      var regionOrder = Game.routes.mainlineRegionOrder(routePlan);
      var s = {
        createdAt: U.now(),
        settings: {
          lang: 'zh-CN', effects: true, potionThreshold: 0.3,
          autoAdvance: true, autoBoss: true,
          autoSkillUpgrade: true, autoEquip: true,
          groundLoot: true, autoCampRest: false,
          controlMode: 'auto', expeditionStrategy: 'balanced',
          combatStrategy: 'balanced', combatTactics: {},
          sfx: true, music: true
        },
        roster: {
          primaryActorId: 'player-main',
          activeParty: ['player-main'],
          actors: {
            'player-main': {
              id: 'player-main',
              archetypeId: 'adventurer',
              variantId: null,
              classId: null,
              level: 1, exp: 0, skillPoints: 0,
              talentRanks: {},
              permanentUpgrades: {},
              persistentResources: { hp: 100 },
              loadout: {
                equipment: { weapon: null, armor: null, ring: null },
                lockedSlots: { weapon: false, armor: false, ring: false }
              }
            }
          }
        },
        economy: { gold: 0, crystal: 0 },
        inv: {
          items: [],
          potions: { potion_small: 3, potion_large: 0 },
          materials: {}
        },
        world: {
          region: regionOrder[0],
          regionOrder: regionOrder,
          routePlan: routePlan,
          worldSeed: worldSeed,
          layoutVersion: 3,
          mode: 'battle',
          restBuffT: 0,
          worldTime: 300,
          regionProg: {},
          nodeCooldowns: {},
          exploration: {},
          social: {
            spawnVariants: {},
            memories: { spawnId: {}, socialGroupId: {}, factionId: {} }
          },
          finalRegionLocked: false,
          deathsRow: 0
        },
        meta: {
          stats: {
            kills: 0, bossKills: 0, goldEarned: 0, expEarned: 0,
            drops: 0, legendaries: 0, potions: 0, deaths: 0,
            playSec: 0, restSec: 0, offlineSec: 0, sells: 0,
            maxHit: 0, level: 1, highestRegion: 1,
            pickups: 0, gathers: 0, materials: 0, chests: 0
          },
          ach: {},
          prologueDone: false,
          completedAt: null,
          endingAcknowledged: false,
          endingPhase: null,
          endingLine: 0
        }
      };
      return State.attachCompatibility(s);
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
      return State.isAdventureStarted();
    },

    /** 选定职业（永久） */
    setClass: function (cid) {
      if (!reg.has('class', cid)) return false;
      var s = Game.state;
      s.player.classId = cid;
      Player.recalc();
      s.player.hp = s.derived.maxHp;
      if (Game.units && Game.units.primary()) Game.units.restore(Game.units.primary());
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
      var perms = opts.perms || p.perms;
      for (var pid in perms) {
        var pdef = reg.get('shopItem', pid);
        var n = perms[pid];
        if (!pdef && /^commission_/.test(pid) && n) {
          pctAcc.hpPct += 0.01 * n;
          pctAcc.atkPct += 0.01 * n;
          continue;
        }
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
      if (Game.units) {
        var actor = Game.units.primary();
        if (actor) {
          Game.units.rebuildStats(actor, {
            hp: p.hp,
            hpPolicy: 'preserveAbsolute'
          });
          var stats = actor.components.statBlock.snapshot().values;
          var power = actor.blueprint.classId === 'mage' ||
            actor.blueprint.classId === 'cleric'
            ? stats.magicPower : stats.physicalPower;
          d.maxHp = stats.maxHp;
          d.atk = power;
          d.def = stats.armor;
          d.spd = +(10 + (stats.autoAttackSpeed - 1) / 0.018).toFixed(2);
          d.crit = stats.critChance;
          d.critDmg = stats.critMultiplier;
          d.dodge = stats.dodgeChance;
          d.lifesteal = stats.lifesteal;
          d.cdr = Math.max(0, stats.cooldownRate - 1);
          d.regen = stats.healthRegenPct || 0;
          d.range = stats.range;
          d.expMul = stats.expMultiplier;
          d.goldMul = stats.goldMultiplier;
          d.dropMul = stats.dropMultiplier;
        }
      }
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
        if (Game.units && Game.units.primary()) Game.units.restore(Game.units.primary());
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
      if (Game.units) {
        var actor = Game.units.primary();
        if (actor) {
          var result = Game.units.heal(actor, n, { source: opts && opts.source || 'player' });
          return result ? result.hp : p.hp;
        }
      }
      p.hp = U.clamp(p.hp + n, 0, d.maxHp);
      return p.hp;
    },

    hpPct: function () {
      var snapshot = Game.units && Game.units.playerSnapshot();
      return snapshot ? snapshot.hpPct
        : Game.state.player.hp / Math.max(1, Player.derived().maxHp);
    },

    upgradeSkill: function (sid) {
      var s = Game.state, p = s.player;
      var legacy = reg.get('skill', sid);
      var def = Game.content && Game.content.isFinalized()
        ? Game.content.get('talent', sid) : null;
      if (!legacy || !def) return false;
      if (def.classId !== p.classId) return false;
      var lv = p.skills[sid] || 0;
      var cost = def.costs.length === 1
        ? def.costs[0]
        : def.costs[Math.min(lv, def.costs.length - 1)];
      if (lv >= def.maxRank) return false;
      if (p.sp < cost) return false;
      if (p.level < def.unlockLevel) return false;
      p.sp -= cost;
      p.skills[sid] = lv + 1;
      Player.recalc();
      bus.emit('skill:upgraded', { sid: sid, lv: lv + 1 });
      return true;
    },

    skillLv: function (sid) { return Game.state.player.skills[sid] || 0; },

    /** 有效 DPS 估算（离线结算/战力参考；含职业爆发系数） */
    estimateDps: function () {
      if (Game.combatEstimator && Game.content && Game.content.isFinalized() &&
          State.isAdventureStarted()) {
        var estimate = Game.combatEstimator.evaluateCurrent({
          sampleSeeds: [11, 29, 47],
          maxTicks: 6000
        });
        if (estimate && Number.isFinite(estimate.averageDps) && estimate.averageDps > 0) {
          return estimate.averageDps;
        }
      }
      var d = Player.derived();
      var cls = Player.classDef();
      var tier = State.regionTier(Game.state.world.region);
      var population = Game.population && Game.population.offlineSummary(
        Game.state.world.region, tier
      );
      var mDef = population ? population.armor : 0;
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
