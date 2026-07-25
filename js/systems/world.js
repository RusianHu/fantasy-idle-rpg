/* ============================================================
 * systems/world.js — 可位移的平面小世界
 * 伪俯视 2D 场景：角色 x/y 双轴坐标，自动游走、索敌、走向怪物
 * 发起战斗；怪物分散刷新；扎营休息 / 死亡重整 / Boss 讨伐演出。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  var HERO_SPEED = 56;
  var MONSTER_WANDER_SPEED = 26;
  var MELEE_RANGE = 22;
  var POPULATION = 7;
  var RESPAWN_T = 4;
  var RECOVER_T = 6;
  var BOUND_TOP = 68;

  var W = Game.world = {
    region: null,       // 区域定义
    entities: [],
    hero: null,
    props: [],          // 场景装饰（y 排序渲染）
    bossEnt: null,
    cinematic: null,    // {ent, t} Boss 登场运镜
    pendingRespawn: [],
    zzzT: 0,

    /* ---------------- 初始化区域 ---------------- */
    init: function (rid) {
      var region = reg.get('region', rid);
      if (!region) { // 已下线区域：回退到第一个有效区域
        rid = reg.ids('region')[0];
        region = reg.get('region', rid);
        Game.state.world.region = rid;
      }
      W.region = region;
      W.entities = [];
      W.bossEnt = null;
      W.cinematic = null;
      W.pendingRespawn = [];

      Game.terrain.build(region);
      W.props = Game.terrain.props;
      if (Game.particles) Game.particles.initRegion(region);

      var hero = W.hero = W.makeHero();
      hero.x = region.camp.x + 30;
      hero.y = region.camp.y + 26;
      W.entities.push(hero);

      for (var i = 0; i < POPULATION; i++) W.spawnMonster(true);

      if (Game.state.world.mode === 'rest') {
        hero.state = 'goCamp';
      }
      if (Game.render) Game.render.snapCamera(hero.x, hero.y);
      bus.emit('region:changed', { rid: rid });
    },

    makeHero: function () {
      var d = Game.player.derived();
      var cls = Game.player.classDef();
      return {
        kind: 'hero', sprite: 'hero_' + cls.id,
        x: 100, y: 120, dir: 'd',
        state: 'idle',
        get hp() { return Game.state.player.hp; },
        set hp(v) { Game.state.player.hp = v; },
        maxHp: d.maxHp, atk: d.atk, def: d.def, spd: d.spd,
        crit: d.crit, critDmg: d.critDmg,
        range: d.range, projectile: d.projectile,
        dodge: d.dodge, lifesteal: d.lifesteal, cdr: d.cdr,
        shield: 0, buffs: [],
        atkTimer: 0, animT: 0, animF: 0, flash: 0, lungeT: 0,
        skillCd: {}, potionCd: 0,
        target: null, stepAcc: 0, spriteH: 20,
        deathT: 0, recoverT: 0, moving: false
      };
    },

    syncHeroStats: function () {
      var d = Game.player.derived();
      var h = W.hero;
      if (!h) return;
      // 职业可能刚选定：同步精灵
      var cls = Game.player.classDef();
      h.sprite = 'hero_' + cls.id;
      // 临时增益乘区
      var atkPct = 0, defPct = 0, critAdd = 0, spdPct = 0;
      if (h.buffs && h.buffs.length) {
        for (var i = 0; i < h.buffs.length; i++) {
          var m = h.buffs[i].mods;
          atkPct += m.atkPct || 0; defPct += m.defPct || 0;
          critAdd += m.crit || 0; spdPct += m.spdPct || 0;
        }
      }
      h.maxHp = d.maxHp;
      h.atk = Math.round(d.atk * (1 + atkPct));
      h.def = Math.round(d.def * (1 + defPct));
      h.spd = +(d.spd * (1 + spdPct)).toFixed(2);
      h.crit = Math.min(0.95, d.crit + critAdd);
      h.critDmg = d.critDmg;
      h.range = d.range; h.projectile = d.projectile;
      h.dodge = d.dodge; h.lifesteal = d.lifesteal; h.cdr = d.cdr;
    },

    /* ---------------- 刷怪 ---------------- */
    spawnMonster: function (initial) {
      var region = W.region;
      var mid = U.choice(region.monsters);
      var ent = W.makeMonster(mid, false);
      var tries = 0;
      do {
        ent.x = U.rand(60, region.world.w - 60);
        ent.y = U.rand(BOUND_TOP + 30, region.world.h - 40);
        tries++;
      } while (tries < 24 && (
        (W.hero && U.dist(ent.x, ent.y, W.hero.x, W.hero.y) < (initial ? 130 : 110)) ||
        U.dist(ent.x, ent.y, region.camp.x, region.camp.y) < 80
      ));
      ent.spawnX = ent.x; ent.spawnY = ent.y;
      W.entities.push(ent);
      return ent;
    },

    makeMonster: function (mid, isBossFight) {
      var def = reg.get('monster', mid);
      var st = F.monsterStats(def.tier, def.mods, def.boss);
      var sp = Game.assets.sprite(def.sprite);
      return {
        kind: 'monster', mid: mid, sprite: def.sprite,
        boss: !!def.boss, tier: def.tier,
        x: 0, y: 0, dir: 'l',
        state: 'wander',
        hp: st.hp, maxHp: st.hp, atk: st.atk, def: st.def, spd: st.spd,
        crit: 0.03, critDmg: 1.5,
        exp: st.exp, gold: st.gold,
        atkTimer: F.atkInterval(st.spd) * U.rand(0.5, 1),
        animT: U.rand(0, 0.3), animF: 0, flash: 0, lungeT: 0,
        wanderT: U.rand(0.5, 2), wx: 0, wy: 0,
        engaged: false, stepAcc: 0, dots: [],
        spriteH: sp.h, dead: false, deathT: 0
      };
    },

    /* ---------------- 讨伐进度 / Boss ---------------- */
    gaugeInfo: function () {
      var prog = Game.State.regionProg(W.region.id);
      return { kills: Math.min(prog.kills, W.region.killTarget), target: W.region.killTarget, cleared: prog.cleared };
    },

    trySpawnBoss: function () {
      if (W.bossEnt || Game.state.world.mode !== 'battle') return;
      var region = W.region;
      var prog = Game.State.regionProg(region.id);
      if (prog.kills < region.killTarget) return;
      // 状态不佳时暂缓登场，避免登场即团灭的循环
      var hero = W.hero;
      if (!hero || hero.state === 'dead' || hero.state === 'recover') return;
      if (Game.player.hpPct() < 0.6) return;

      var ent = W.makeMonster(region.boss, true);
      ent.x = region.bossPoint.x;
      ent.y = region.bossPoint.y;
      ent.spawnX = ent.x; ent.spawnY = ent.y;
      ent.state = 'fight';
      W.entities.push(ent);
      W.bossEnt = ent;

      // 登场演出：镜头拉近 + 震屏，双方短暂僵持
      W.cinematic = { ent: ent, t: 1.5 };
      if (W.hero.state !== 'recover') W.hero.state = 'entrance';
      if (Game.fx) {
        Game.fx.shake(5, 0.9);
        Game.fx.banner('ui.bossAppear', { name: Game.i18n.t('monster.' + ent.mid + '.name') });
      }
      bus.emit('boss:spawned', { rid: region.id, mid: ent.mid });
    },

    onBossDefeated: function (ent) {
      var region = W.region;
      var prog = Game.State.regionProg(region.id);
      var first = !prog.firstKill;
      prog.firstKill = true;
      prog.cleared = true;
      prog.kills = 0;
      W.bossEnt = null;
      if (first) Game.player.addCrystal(F.bossCrystal(region.tier));
      Game.state.meta.stats.bossKills++;
      if (Game.fx) Game.fx.shake(4, 0.6);
      bus.emit('boss:defeated', { rid: region.id, mid: ent.mid, first: first, tier: region.tier });
    },

    onBossFailed: function () {
      var region = W.region;
      var prog = Game.State.regionProg(region.id);
      // 进度保留一半：撤场重攒，不清零（卡关不惩罚过头）
      prog.kills = Math.ceil(region.killTarget / 2);
      if (W.bossEnt) {
        var i = W.entities.indexOf(W.bossEnt);
        if (i >= 0) W.entities.splice(i, 1);
        W.bossEnt = null;
      }
      W.cinematic = null;
      bus.emit('boss:failed', { rid: region.id });
    },

    /* ---------------- 击杀结算 ---------------- */
    onEntityKilled: function (ent, killer) {
      if (ent.kind === 'monster' && !ent.dead) {
        ent.dead = true;
        ent.deathT = 0.5;
        ent.state = 'dying';

        Game.player.addExp(ent.exp);
        Game.player.addGold(ent.gold);
        Game.inv.rollDrops(ent.tier, ent.boss);
        Game.state.meta.stats.kills++;

        if (!ent.boss) {
          var prog = Game.State.regionProg(W.region.id);
          if (!W.bossEnt) prog.kills = Math.min(prog.kills + 1, W.region.killTarget);
          W.pendingRespawn.push(RESPAWN_T);
          Game.state.world.deathsRow = 0; // 击杀成功重置连败
        }
        if (Game.fx) {
          Game.fx.poof(ent.x, ent.y - ent.spriteH * 0.4);
          Game.fx.floatText(ent.x, ent.y - ent.spriteH - 6, '+' + Game.i18n.fmtNum(ent.exp) + ' EXP', { color: '#8ad0ff', small: true });
        }
        bus.emit('monster:killed', { mid: ent.mid, boss: ent.boss, x: ent.x, y: ent.y });

        if (W.hero.target === ent) W.hero.target = null;
        if (ent.boss) W.onBossDefeated(ent);
      } else if (ent.kind === 'hero') {
        W.onHeroDeath();
      }
    },

    onHeroDeath: function () {
      var hero = W.hero;
      if (hero.state === 'dead' || hero.state === 'recover') return;
      var byBoss = !!W.bossEnt;
      hero.state = 'dead';
      hero.deathT = 1.0;
      hero.target = null;
      hero.shield = 0;
      hero.buffs = [];
      Game.state.meta.stats.deaths++;
      bus.emit('player:death', { byBoss: byBoss });

      if (byBoss) {
        W.onBossFailed(); // Boss 战失败不计入卡关计数
      } else {
        Game.state.world.deathsRow++;
        if (Game.state.world.deathsRow >= 3) {
          Game.state.world.deathsRow = 0;
          bus.emit('protect:fallback', { rid: W.region.id });
        }
      }
    },

    /* ---------------- 模式切换（战斗 / 扎营休息） ---------------- */
    setMode: function (mode) {
      var w = Game.state.world;
      if (w.mode === mode) return;
      if (mode === 'rest' && W.bossEnt) return; // Boss 战期间不可扎营
      w.mode = mode;
      var hero = W.hero;
      if (mode === 'rest') {
        hero.target = null;
        if (hero.state !== 'recover' && hero.state !== 'dead') hero.state = 'goCamp';
        bus.emit('rest:start');
      } else {
        if (hero.state === 'sitting' || hero.state === 'goCamp') hero.state = 'idle';
        bus.emit('rest:end');
      }
      bus.emit('mode:changed', { mode: mode });
    },

    /* ---------------- 主更新 ---------------- */
    update: function (dt) {
      var hero = W.hero;
      if (!hero) return;
      var sw = Game.state.world;

      W.syncHeroStats();

      // 讨伐进度满 → Boss 登场
      W.trySpawnBoss();

      // Boss 登场演出计时
      if (W.cinematic) {
        W.cinematic.t -= dt;
        if (W.cinematic.t <= 0) {
          W.cinematic = null;
          if (hero.state === 'entrance') hero.state = 'idle';
        }
      }

      W.updateHero(hero, dt);

      // 怪物
      for (var i = W.entities.length - 1; i >= 0; i--) {
        var e = W.entities[i];
        if (e.kind !== 'monster') continue;
        if (e.dead) {
          e.deathT -= dt;
          if (e.deathT <= 0) W.entities.splice(i, 1);
          continue;
        }
        W.updateMonster(e, dt);
      }

      // 重生队列
      for (var r = W.pendingRespawn.length - 1; r >= 0; r--) {
        W.pendingRespawn[r] -= dt;
        if (W.pendingRespawn[r] <= 0) {
          W.pendingRespawn.splice(r, 1);
          W.spawnMonster(false);
        }
      }

      // 休整增益在战斗模式下倒计时
      if (sw.mode === 'battle' && sw.restBuffT > 0) {
        sw.restBuffT = Math.max(0, sw.restBuffT - dt);
      }
    },

    /* ---------------- 主角 AI ---------------- */
    updateHero: function (hero, dt) {
      var sw = Game.state.world;
      hero.flash = Math.max(0, hero.flash - dt);
      hero.lungeT = Math.max(0, hero.lungeT - dt);
      hero.animT += dt;
      hero.moving = false;

      // 未选择职业：站立等待（选职业弹窗期间不推进战斗）
      if (!Game.player.hasClass()) { hero.state = 'idle'; return; }

      // 临时增益倒计时
      if (hero.buffs && hero.buffs.length) {
        for (var bi = hero.buffs.length - 1; bi >= 0; bi--) {
          hero.buffs[bi].t -= dt;
          if (hero.buffs[bi].t <= 0) hero.buffs.splice(bi, 1);
        }
      }

      // 死亡 → 撤退回营
      if (hero.state === 'dead') {
        hero.deathT -= dt;
        if (hero.deathT <= 0) {
          hero.x = W.region.camp.x + 26;
          hero.y = W.region.camp.y + 24;
          hero.state = 'recover';
          hero.recoverT = RECOVER_T;
        }
        return;
      }
      // 重整（复用坐姿）
      if (hero.state === 'recover') {
        hero.recoverT -= dt;
        Game.player.heal(hero.maxHp * dt / RECOVER_T, { raw: true });
        if (hero.recoverT <= 0) {
          Game.state.player.hp = hero.maxHp;
          hero.state = sw.mode === 'rest' ? 'goCamp' : 'idle';
        }
        return;
      }
      // Boss 登场僵直
      if (hero.state === 'entrance') return;

      /* ----- 休息模式 ----- */
      if (sw.mode === 'rest') {
        if (hero.state === 'goCamp') {
          var cx = W.region.camp.x + 22, cy = W.region.camp.y + 22;
          if (W.moveToward(hero, cx, cy, HERO_SPEED, dt) < 4) {
            hero.state = 'sitting';
            hero.dir = 'l'; // 面向篝火
          }
        } else if (hero.state === 'sitting') {
          // 快速恢复 + 累积休整增益
          Game.player.heal(hero.maxHp * F.BAL.restRegenPct * dt);
          sw.restBuffT = Math.min(F.BAL.restBuffCap, sw.restBuffT + dt * F.BAL.restBuffRatio);
          Game.state.meta.stats.restSec += dt;
          W.zzzT -= dt;
          if (W.zzzT <= 0) {
            W.zzzT = U.rand(2.5, 4.5);
            if (Game.fx) Game.fx.zzz(hero.x + 6, hero.y - hero.spriteH - 2);
          }
        } else {
          hero.state = 'goCamp';
        }
        return;
      }

      /* ----- 战斗模式 ----- */
      // 自然恢复（脱战快、战斗慢；被动回复加成叠加）
      var inFight = hero.state === 'fight';
      var drv = Game.player.derived();
      Game.player.heal(hero.maxHp * ((inFight ? 0.004 : 0.02) + (drv.regen || 0)) * dt);

      Game.combat.potionTick(hero, dt);

      // 选目标：Boss 优先，否则最近存活怪
      var target = hero.target;
      if (!target || target.hp <= 0 || target.dead) {
        target = null;
        if (W.bossEnt && !W.bossEnt.dead) target = W.bossEnt;
        else {
          var best = 1e9;
          for (var i = 0; i < W.entities.length; i++) {
            var e = W.entities[i];
            if (e.kind !== 'monster' || e.dead) continue;
            var d2 = U.dist(hero.x, hero.y, e.x, e.y);
            if (d2 < best) { best = d2; target = e; }
          }
        }
        hero.target = target;
      }

      if (!target) {
        // 无怪可打：闲逛
        W.wanderTick(hero, dt, HERO_SPEED * 0.5);
        hero.state = hero.moving ? 'walk' : 'idle';
        return;
      }

      // 攻击距离：职业决定（远程站位输出）
      var range = (hero.range || MELEE_RANGE) + (target.boss ? 10 : 0);
      var distTo = U.dist(hero.x, hero.y, target.x, target.y);
      if (distTo > range) {
        hero.state = 'walk';
        W.moveToward(hero, target.x, target.y, HERO_SPEED, dt);
      } else {
        hero.state = 'fight';
        hero.dir = U.dirOf(target.x - hero.x, target.y - hero.y);
        target.engaged = true;

        hero.atkTimer -= dt;
        if (hero.atkTimer <= 0) {
          hero.atkTimer = F.atkInterval(hero.spd);
          hero.lungeT = 0.18;
          Game.combat.heroAttack(hero, target, { mult: 1 });
        }
        Game.combat.tryCastSkills(hero, target, dt);
      }
    },

    /* ---------------- 怪物 AI ---------------- */
    updateMonster: function (e, dt) {
      e.flash = Math.max(0, e.flash - dt);
      e.lungeT = Math.max(0, e.lungeT - dt);
      e.animT += dt;

      // 持续伤害（中毒等）：可致死并正常结算
      if (e.dots && e.dots.length) {
        var dsum = 0;
        for (var di = e.dots.length - 1; di >= 0; di--) {
          var dot = e.dots[di];
          dsum += dot.dps * Math.min(dt, Math.max(0, dot.t));
          dot.t -= dt;
          if (dot.t <= 0) e.dots.splice(di, 1);
        }
        if (dsum > 0) {
          e.hp -= dsum;
          e.dotAcc = (e.dotAcc || 0) + dsum;
          e.dotFxT = (e.dotFxT || 0) - dt;
          if (e.dotFxT <= 0 && Game.fx) {
            e.dotFxT = 0.6;
            Game.fx.floatText(e.x, e.y - e.spriteH - 2, '-' + Game.i18n.fmtNum(Math.round(e.dotAcc)), { color: '#9ae05a', small: true });
            e.dotAcc = 0;
          }
          if (e.hp <= 0) {
            e.hp = 0;
            W.onEntityKilled(e, W.hero);
            return;
          }
        }
      }

      var hero = W.hero;
      var heroTargetable = hero && hero.state !== 'dead' && hero.state !== 'recover' &&
        Game.state.world.mode === 'battle' && Game.player.hasClass();

      // 应战：被主角锁定后主动迎击（远程主角也会被近身）；Boss 恒主动。
      // 1v1 基准不变：未被锁定的怪不加入围攻，AOE 波及仅是顺带伤害。
      var engaged = heroTargetable && (hero.target === e || e.boss);

      if (engaged) {
        var reach = MELEE_RANGE + (e.boss ? 10 : 2);
        var dist = U.dist(hero.x, hero.y, e.x, e.y);
        if (dist > reach) {
          W.moveToward(e, hero.x, hero.y, MONSTER_WANDER_SPEED + (e.boss ? 16 : 12), dt);
          e.state = 'walk';
          return;
        }
        e.state = 'fight';
        e.dir = U.dirOf(hero.x - e.x, hero.y - e.y);
        e.atkTimer -= dt;
        if (e.atkTimer <= 0) {
          e.atkTimer = F.atkInterval(e.spd);
          e.lungeT = 0.16;
          var r = Game.combat.attack(e, hero, {});
          if (r.killed) W.onEntityKilled(hero, e);
        }
        return;
      }

      e.engaged = false;
      if (e.state === 'fight') e.state = 'wander';
      W.wanderTick(e, dt, MONSTER_WANDER_SPEED, e.spawnX, e.spawnY, 64);
    },

    /* ---------------- 移动辅助 ---------------- */
    moveToward: function (ent, tx, ty, speed, dt) {
      var dx = tx - ent.x, dy = ty - ent.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.5) return 0;
      // 浅水减速
      var mat = Game.terrain.materialAt(ent.x, ent.y);
      if (mat === 'water') speed *= 0.72;
      var step = Math.min(d, speed * dt);
      ent.x += dx / d * step;
      ent.y += dy / d * step;
      ent.dir = U.dirOf(dx, dy);
      ent.moving = true;
      W.clampToWorld(ent);
      W.stepFx(ent, step);
      return d - step;
    },

    wanderTick: function (ent, dt, speed, ax, ay, radius) {
      ent.wanderT = (ent.wanderT || 0) - dt;
      if (ent.wanderT <= 0 || (ent.wx === undefined)) {
        ent.wanderT = U.rand(1.6, 4.2);
        var cx = ax !== undefined ? ax : ent.x;
        var cy = ay !== undefined ? ay : ent.y;
        var r = radius || 90;
        ent.wx = U.clamp(cx + U.rand(-r, r), 30, W.region.world.w - 30);
        ent.wy = U.clamp(cy + U.rand(-r, r), BOUND_TOP + 16, W.region.world.h - 20);
      }
      var d = U.dist(ent.x, ent.y, ent.wx, ent.wy);
      if (d > 5) {
        W.moveToward(ent, ent.wx, ent.wy, speed, dt);
        if (ent.kind === 'monster') ent.state = 'walk';
      } else if (ent.kind === 'monster') {
        ent.state = 'wander';
      }
    },

    clampToWorld: function (ent) {
      ent.x = U.clamp(ent.x, 18, W.region.world.w - 18);
      ent.y = U.clamp(ent.y, BOUND_TOP, W.region.world.h - 14);
    },

    /** 地形材质反馈（脚步特效，角色与怪物一视同仁） */
    stepFx: function (ent, moved) {
      ent.stepAcc = (ent.stepAcc || 0) + moved;
      if (ent.stepAcc < 9) return;
      ent.stepAcc = 0;
      if (!Game.particles) return;
      var mat = Game.terrain.materialAt(ent.x, ent.y);
      Game.particles.step(mat, ent.x, ent.y, ent);
    },

    BOUND_TOP: BOUND_TOP
  };
})();
