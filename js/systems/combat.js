/* ============================================================
 * systems/combat.js — 伪实时战斗核心
 * 每个实体独立攻击间隔（由速度决定），接敌后按各自节奏出手；
 * 技能按冷却自动释放；药水低血线自动使用（带冷却）。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  var C = Game.combat = {

    /** 通用攻击结算：返回 {dmg, crit, killed} */
    attack: function (a, b, mult, opts) {
      opts = opts || {};
      mult = mult || 1;
      var dmg = F.damage(a.atk, b.def) * mult;
      var crit = U.chance(a.crit || 0);
      if (crit) dmg *= (a.critDmg || 1.5);
      dmg = Math.max(1, Math.round(dmg));
      b.hp -= dmg;
      b.flash = 0.14;

      var isHeroAtk = a.kind === 'hero';
      if (isHeroAtk && dmg > Game.state.meta.stats.maxHit) {
        Game.state.meta.stats.maxHit = dmg;
      }
      if (Game.fx) {
        Game.fx.floatText(b.x + U.rand(-4, 4), b.y - b.spriteH - 2, '-' + Game.i18n.fmtNum(dmg), {
          color: isHeroAtk ? (crit ? '#ffd85a' : '#ffffff') : '#ff8a7a',
          crit: crit
        });
        Game.fx.hitSpark(b.x, b.y - b.spriteH * 0.5, isHeroAtk);
      }
      bus.emit('combat:hit', { from: a.kind, crit: crit, dmg: dmg });

      var killed = b.hp <= 0;
      if (killed) b.hp = 0;
      return { dmg: dmg, crit: crit, killed: killed };
    },

    /* ---------------- 主动技能自动释放 ---------------- */
    tryCastSkills: function (hero, target, dt) {
      var s = Game.state, p = s.player;
      var cds = hero.skillCd;
      var skills = reg.all('skill');
      for (var i = 0; i < skills.length; i++) {
        var sk = skills[i];
        if (sk.type !== 'active') continue;
        if (p.level < (sk.unlockLv || 1)) continue;
        cds[sk.id] = Math.max(0, (cds[sk.id] || 0) - dt);
        if (cds[sk.id] > 0) continue;

        var lv = Math.max(1, p.skills[sk.id] || 0);

        if (sk.id === 'heal_light') {
          if (Game.player.hpPct() >= sk.healThreshold) continue;
          var heal = Math.round(Game.player.derived().maxHp * sk.healPct(lv));
          Game.player.heal(heal);
          hero.hp = p.hp;
          cds[sk.id] = sk.cd;
          if (Game.fx) {
            Game.fx.heal(hero.x, hero.y - 10);
            Game.fx.floatText(hero.x, hero.y - hero.spriteH - 4, '+' + Game.i18n.fmtNum(heal), { color: '#7ef07e' });
          }
          bus.emit('skill:cast', { sid: sk.id });
          continue;
        }

        if (!target || target.hp <= 0) continue;

        if (sk.id === 'power_strike') {
          var r = C.attack(hero, target, sk.dmgMult(lv));
          cds[sk.id] = sk.cd;
          hero.lungeT = 0.2;
          if (Game.fx) Game.fx.slash(target.x, target.y - target.spriteH * 0.5, true);
          bus.emit('skill:cast', { sid: sk.id });
          if (r.killed) Game.world.onEntityKilled(target, hero);
        } else if (sk.id === 'whirlwind') {
          var hits = 0;
          var ents = Game.world.entities;
          var mult = sk.dmgMult(lv);
          var killedList = [];
          for (var j = 0; j < ents.length; j++) {
            var e = ents[j];
            if (e.kind !== 'monster' || e.hp <= 0 || e.dead) continue;
            if (U.dist(hero.x, hero.y, e.x, e.y) > sk.radius) continue;
            var rr = C.attack(hero, e, mult);
            hits++;
            if (rr.killed) killedList.push(e);
          }
          if (hits > 0) {
            cds[sk.id] = sk.cd;
            if (Game.fx) Game.fx.ring(hero.x, hero.y - 8, sk.radius, '#7ad0f0');
            bus.emit('skill:cast', { sid: sk.id });
            for (var k = 0; k < killedList.length; k++) Game.world.onEntityKilled(killedList[k], hero);
          }
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
        hero.hp = Game.state.player.hp;
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
