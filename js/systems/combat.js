/* ============================================================
 * systems/combat.js — 伪实时战斗核心（多职业版）
 * 通用攻击管线：闪避 → 伤害 → 护盾吸收 → 吸血 → 击杀回调；
 * 技能为数据 schema（strike/aoe/heal/buff/shield），统一执行器
 * 按冷却自动释放（受冷却缩减影响）；远程职业普攻/技能走弹道。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  var skillCache = {}; // classId -> 主动技能列表

  function classActives(cid) {
    if (!skillCache[cid]) {
      skillCache[cid] = reg.all('skill').filter(function (s) {
        return s.cls === cid && s.type === 'active';
      });
    }
    return skillCache[cid];
  }

  var C = Game.combat = {

    /** 通用攻击结算：返回 {dmg, crit, killed, dodged} */
    attack: function (a, b, opts) {
      opts = opts || {};
      var mult = opts.mult || 1;

      // 闪避（受击方）
      if (b.dodge && U.chance(b.dodge)) {
        if (Game.fx) {
          Game.fx.floatText(b.x, b.y - b.spriteH - 2, Game.i18n.t('ui.miss'), { color: '#a8b4c0', small: true });
        }
        bus.emit('combat:miss', { from: a.kind });
        return { dmg: 0, crit: false, killed: false, dodged: true };
      }

      var dmg = F.damage(a.atk, b.def) * mult;
      var crit = U.chance(Math.min(0.95, (a.crit || 0) + (opts.critBonus || 0)));
      if (crit) dmg *= (a.critDmg || 1.5);
      dmg = Math.max(1, Math.round(dmg));

      // 护盾吸收
      var absorbed = 0;
      if (b.shield && b.shield > 0) {
        absorbed = Math.min(b.shield, dmg);
        b.shield -= absorbed;
        dmg -= absorbed;
      }

      b.hp -= dmg;
      b.flash = 0.14;

      var isHeroAtk = a.kind === 'hero';
      var shown = dmg + absorbed;
      if (isHeroAtk && shown > Game.state.meta.stats.maxHit) {
        Game.state.meta.stats.maxHit = shown;
      }
      // 吸血（仅主角）
      if (isHeroAtk && a.lifesteal > 0 && dmg > 0) {
        Game.player.heal(dmg * a.lifesteal);
      }
      if (Game.fx) {
        var color = isHeroAtk ? (crit ? '#ffd85a' : '#ffffff') : (absorbed > 0 ? '#7ad0f0' : '#ff8a7a');
        Game.fx.floatText(b.x + U.rand(-4, 4), b.y - b.spriteH - 2, '-' + Game.i18n.fmtNum(shown), {
          color: color, crit: crit
        });
        Game.fx.hitSpark(b.x, b.y - b.spriteH * 0.5, isHeroAtk);
      }
      bus.emit('combat:hit', { from: a.kind, crit: crit, dmg: shown });

      var killed = b.hp <= 0;
      if (killed) b.hp = 0;
      return { dmg: dmg, crit: crit, killed: killed, dodged: false };
    },

    /**
     * 主角对目标出手（普攻与打击技共用）：
     * 近战立即结算；远程职业生成弹道、命中时结算。
     * opts: { mult, critBonus, healOfDmg, dot, lv, projectile, big }
     */
    heroAttack: function (hero, target, opts) {
      opts = opts || {};
      function apply() {
        if (!target || target.dead || target.hp <= 0) return;
        var r = C.attack(hero, target, { mult: opts.mult || 1, critBonus: opts.critBonus });
        if (r.dodged) return;
        if (opts.healOfDmg && r.dmg > 0) Game.player.heal(r.dmg * opts.healOfDmg);
        if (opts.dot && r.dmg > 0) {
            var invested = opts.invested || 0;
            var total = hero.atk * F.skillVal(opts.dot.mult, invested);
          target.dots = target.dots || [];
          target.dots.push({ dps: total / opts.dot.dur, t: opts.dot.dur });
          if (Game.fx) {
            Game.fx.floatText(target.x, target.y - target.spriteH - 8, Game.i18n.t('ui.poisoned'), { color: '#9ae05a', small: true });
          }
        }
        if (opts.big && Game.fx) Game.fx.slash(target.x, target.y - target.spriteH * 0.5, true);
        if (r.killed) Game.world.onEntityKilled(target, hero);
      }
      var proj = opts.projectile !== undefined ? opts.projectile : hero.projectile;
      if (proj && Game.fx) {
        Game.fx.projectile(hero.x, hero.y - 12, target, proj, apply);
      } else {
        apply();
      }
    },

    /* ---------------- 主动技能自动释放（通用执行器） ---------------- */
    tryCastSkills: function (hero, target, dt) {
      var s = Game.state, p = s.player;
      if (!p.classId) return;
      var cds = hero.skillCd;
      var cdrMul = 1 - (hero.cdr || 0);
      var skills = classActives(p.classId);

      for (var i = 0; i < skills.length; i++) {
        var sk = skills[i];
        cds[sk.id] = Math.max(0, (cds[sk.id] || 0) - dt);
        if (p.level < (sk.unlockLv || 1)) continue;
        if (cds[sk.id] > 0) continue;

        var invested = p.skills[sk.id] || 0;
        var casted = false;

        if (sk.kind === 'heal') {
          if (Game.player.hpPct() < (sk.healCond || 1)) {
            var heal = Game.player.derived().maxHp * F.skillVal(sk.healPct, invested);
            Game.player.heal(heal);
            if (Game.fx) {
              Game.fx.heal(hero.x, hero.y - 10);
              Game.fx.floatText(hero.x, hero.y - hero.spriteH - 4, '+' + Game.i18n.fmtNum(Math.round(heal)), { color: '#7ef07e' });
            }
            casted = true;
          }
        } else if (sk.kind === 'buff') {
          if (target && target.hp > 0) { // 接敌才开增益
            var mods = {}, bm = sk.buff.mods;
            for (var k in bm) mods[k] = F.skillVal(bm[k], invested);
            hero.buffs = (hero.buffs || []).filter(function (b) { return b.sid !== sk.id; });
            hero.buffs.push({ sid: sk.id, t: sk.buff.dur, mods: mods });
            if (Game.fx) Game.fx.ring(hero.x, hero.y - 8, 26, '#f0c060');
            casted = true;
          }
        } else if (sk.kind === 'shield') {
          if (target && target.hp > 0) {
            var val = Game.player.derived().maxHp * F.skillVal(sk.shieldPct, invested);
            if ((hero.shield || 0) < val) {
              hero.shield = val;
              if (Game.fx) Game.fx.ring(hero.x, hero.y - 8, 22, '#7ad0f0');
              casted = true;
            }
          }
        } else if (sk.kind === 'strike') {
          if (target && target.hp > 0 && !target.dead) {
            C.heroAttack(hero, target, {
              mult: F.skillVal(sk.mult, invested),
              critBonus: sk.critBonus || 0,
              healOfDmg: sk.healOfDmg || 0,
              dot: sk.dot || null,
              invested: invested,
              projectile: sk.projectile !== undefined ? sk.projectile : hero.projectile,
              big: true
            });
            hero.lungeT = 0.2;
            casted = true;
          }
        } else if (sk.kind === 'aoe') {
          var cx, cy;
          if (sk.center === 'target') {
            if (!target || target.hp <= 0 || target.dead) continue;
            cx = target.x; cy = target.y;
          } else {
            cx = hero.x; cy = hero.y;
          }
          var mult = F.skillVal(sk.mult, invested);
          var hits = 0, killedList = [];
          var ents = Game.world.entities;
          for (var j = 0; j < ents.length; j++) {
            var e = ents[j];
            if (e.kind !== 'monster' || e.hp <= 0 || e.dead) continue;
            if (U.dist(cx, cy, e.x, e.y) > sk.radius) continue;
            var rr = C.attack(hero, e, { mult: mult });
            hits++;
            if (rr.killed) killedList.push(e);
          }
          if (hits > 0) {
            if (Game.fx) Game.fx.ring(cx, cy - 8, sk.radius, sk.cls === 'mage' ? '#a8e0f0' : '#7ad0f0');
            if (sk.selfHealPct) {
              Game.player.heal(Game.player.derived().maxHp * F.skillVal(sk.selfHealPct, invested));
              if (Game.fx) Game.fx.heal(hero.x, hero.y - 10);
            }
            for (var m = 0; m < killedList.length; m++) Game.world.onEntityKilled(killedList[m], hero);
            casted = true;
          }
        }

        if (casted) {
          cds[sk.id] = sk.cd * cdrMul;
          bus.emit('skill:cast', { sid: sk.id });
        }
      }
    },

    /* ---------------- 药水自动使用 ---------------- */
    potionTick: function (hero, dt) {
      hero.potionCd = Math.max(0, (hero.potionCd || 0) - dt);
      if (hero.potionCd > 0) return;
      var threshold = Game.state.settings.potionThreshold;
      if (Game.player.hpPct() >= threshold) return;
      var used = Game.inv.consumePotion();
      if (used) {
        hero.potionCd = F.BAL.potionCd;
        if (Game.fx) {
          Game.fx.heal(hero.x, hero.y - 10);
          Game.fx.floatText(hero.x, hero.y - hero.spriteH - 4, '+' + Game.i18n.fmtNum(used.heal), { color: '#7ef07e' });
        }
      }
      // 无药水：仅靠自然恢复，不中断挂机
    }
  };
})();
