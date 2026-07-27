/* ============================================================
 * systems/automation.js — 自动技能分配 + 职业感知智能换装
 *
 * 所有候选均通过无副作用预览评估；真实状态只在最终决策后提交。
 * 技能使用最高已解锁区域，装备使用当前区域。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  var EQUIP_MIN_GAIN = Math.log(1.001); // 至少提升 0.1%
  var VALUE_EPS = 1e-9;
  var initialized = false;
  var batchDepth = 0;
  var batchSummary = null;

  function copyMap(src) {
    var out = {};
    for (var k in src) out[k] = src[k];
    return out;
  }

  function expectedDamage(atk, def) {
    return atk * atk / (atk + Math.max(0, def));
  }

  function regionContext(rid) {
    var order = Game.State.regionOrder();
    var region = reg.get('region', rid) || reg.get('region', order[0]);
    var tier = Game.State.regionTier(region.id);
    var normalDef = 0, normalCount = 0;
    for (var i = 0; i < region.monsters.length; i++) {
      var m = reg.get('monster', region.monsters[i]);
      if (!m) continue;
      normalDef += F.monsterStats(tier, m.mods, false).def;
      normalCount++;
    }
    if (!normalCount) {
      normalDef = F.monsterStats(tier, {}, false).def;
      normalCount = 1;
    }
    var bossDef = reg.get('monster', region.boss);
    var boss = F.monsterStats(tier, bossDef ? bossDef.mods : {}, true);
    return {
      rid: region.id,
      tier: tier,
      normalDef: normalDef / normalCount,
      bossAtk: boss.atk,
      bossSpd: boss.spd
    };
  }

  /**
   * 确定性综合评估；不读取/改写瞬时 HP、Buff 或世界实体。
   * opts: {regionId, skills?, equipped?, level?, classId?}
   */
  F.evaluateBuild = function (opts) {
    opts = opts || {};
    var state = Game.state, p = state.player;
    var classId = opts.classId !== undefined ? opts.classId : p.classId;
    var cls = reg.get('class', classId) || Game.player.classDef();
    var level = opts.level !== undefined ? opts.level : p.level;
    var skills = opts.skills || p.skills;
    var equipped = opts.equipped || state.inv.equipped;
    var d = Game.player.previewDerived({
      classId: classId,
      level: level,
      skills: skills,
      equipped: equipped
    });
    var ctx = regionContext(opts.regionId || state.world.region);
    var actives = reg.all('skill').filter(function (sk) {
      return sk.cls === classId && sk.type === 'active' && level >= (sk.unlockLv || 1);
    });

    // 将持续 Buff 按理论覆盖率折算为平均属性，再用于普攻和主动攻击。
    var avg = { atkPct: 0, defPct: 0, spdPct: 0, crit: 0 };
    for (var i = 0; i < actives.length; i++) {
      var buffSkill = actives[i];
      if (buffSkill.kind !== 'buff' || !buffSkill.buff) continue;
      var buffRank = skills[buffSkill.id] || 0;
      var buffCd = Math.max(0.1, buffSkill.cd * (1 - d.cdr));
      var uptime = Math.min(1, buffSkill.buff.dur / buffCd);
      var mods = buffSkill.buff.mods || {};
      avg.atkPct += F.skillVal(mods.atkPct, buffRank) * uptime;
      avg.defPct += F.skillVal(mods.defPct, buffRank) * uptime;
      avg.spdPct += F.skillVal(mods.spdPct, buffRank) * uptime;
      avg.crit += F.skillVal(mods.crit, buffRank) * uptime;
    }

    var atk = d.atk * (1 + avg.atkPct);
    var def = d.def * (1 + avg.defPct);
    var spd = d.spd * (1 + avg.spdPct);
    var crit = Math.min(0.95, d.crit + avg.crit);
    var critMult = 1 + crit * (d.critDmg - 1);
    var hit = expectedDamage(atk, ctx.normalDef);
    var directDps = hit * critMult / F.atkInterval(spd);
    var dotDps = 0;
    var healingPerSec = 0;
    var shieldingPerSec = 0;

    for (var j = 0; j < actives.length; j++) {
      var sk = actives[j];
      var rank = skills[sk.id] || 0;
      var cd = Math.max(0.1, sk.cd * (1 - d.cdr));
      if (sk.kind === 'strike') {
        var skillCrit = Math.min(0.95, crit + (sk.critBonus || 0));
        var skillCritMult = 1 + skillCrit * (d.critDmg - 1);
        var strikeDps = hit * F.skillVal(sk.mult, rank) * skillCritMult / cd;
        directDps += strikeDps;
        if (sk.healOfDmg) healingPerSec += strikeDps * sk.healOfDmg * d.healPow;
        if (sk.dot) dotDps += atk * F.skillVal(sk.dot.mult, rank) / cd;
      } else if (sk.kind === 'aoe') {
        var aoeDps = hit * F.skillVal(sk.mult, rank) * critMult / cd;
        directDps += aoeDps; // 项目统一以 1v1 为数值基准
        if (sk.selfHealPct) {
          healingPerSec += d.maxHp * F.skillVal(sk.selfHealPct, rank) * d.healPow / cd;
        }
      } else if (sk.kind === 'heal') {
        healingPerSec += d.maxHp * F.skillVal(sk.healPct, rank) * d.healPow / cd;
      } else if (sk.kind === 'shield') {
        shieldingPerSec += d.maxHp * F.skillVal(sk.shieldPct, rank) / cd;
      }
    }

    var offense = Math.max(0.001, directDps + dotDps);
    var bossHit = expectedDamage(ctx.bossAtk, def);
    var incoming = bossHit / F.atkInterval(ctx.bossSpd) * (1 - d.dodge);
    var naturalRegen = d.maxHp * (0.004 + (d.regen || 0)) * d.healPow;
    var lifesteal = directDps * d.lifesteal * d.healPow;
    var sustain = naturalRegen + lifesteal + healingPerSec + shieldingPerSec;
    // 平滑趋近 80% 减伤上限：高续航继续有递减收益，但不会出现突然归零的技能点。
    var sustainMitigation = 0.8 * sustain / Math.max(0.001, sustain + incoming);
    var netIncoming = incoming * (1 - sustainMitigation);
    var survival = Math.max(0.001, d.maxHp / Math.max(0.001, netIncoming));
    var economy = Math.pow(
      Math.max(0.001, d.goldMul) *
      Math.max(0.001, d.expMul) *
      Math.max(0.001, d.dropMul),
      1 / 3
    );
    var w = cls.evalWeights || { offense: 0.6, survival: 0.35, economy: 0.05 };
    var utility =
      w.offense * Math.log(offense) +
      w.survival * Math.log(survival) +
      w.economy * Math.log(economy);

    return {
      offense: offense,
      survival: survival,
      economy: economy,
      utility: utility,
      derived: d,
      context: ctx
    };
  };

  F.compareBuilds = function (base, candidate) {
    return {
      overall: Math.exp(candidate.utility - base.utility) - 1,
      offense: candidate.offense / base.offense - 1,
      survival: candidate.survival / base.survival - 1,
      economy: candidate.economy / base.economy - 1
    };
  };

  function newSummary(reason) {
    return { reason: reason || 'auto', skillPoints: 0, gearSlots: {}, gain: 0 };
  }

  function publicSummary(sum) {
    var slots = [];
    for (var slot in sum.gearSlots) slots.push(slot);
    return {
      reason: sum.reason,
      skillPoints: sum.skillPoints,
      gearSlots: slots,
      gearCount: slots.length,
      gain: sum.gain
    };
  }

  function recordSummary(part) {
    var target = batchDepth > 0 ? batchSummary : newSummary(part.reason);
    if (part.reason) target.reason = part.reason;
    target.skillPoints += part.skillPoints || 0;
    if (part.gearChanges) {
      for (var i = 0; i < part.gearChanges.length; i++) {
        target.gearSlots[part.gearChanges[i].slot] = true;
      }
    }
    if (part.gain) target.gain = part.gain;
    if (batchDepth === 0 && (target.skillPoints || Object.keys(target.gearSlots).length)) {
      bus.emit('automation:summary', publicSummary(target));
    }
  }

  var Auto = Game.auto = {
    frontierRegion: function () {
      var order = Game.State.regionOrder();
      var frontier = order[0];
      for (var i = 1; i < order.length; i++) {
        if (Game.prog && !Game.prog.isUnlocked(order[i])) break;
        var prev = Game.State.regionProg(order[i - 1]);
        if (!prev.cleared) break;
        frontier = order[i];
      }
      return frontier;
    },

    beginBatch: function (reason) {
      if (batchDepth === 0) batchSummary = newSummary(reason);
      batchDepth++;
    },

    endBatch: function () {
      if (batchDepth <= 0) return null;
      batchDepth--;
      if (batchDepth > 0) return null;
      var out = publicSummary(batchSummary);
      batchSummary = null;
      if (out.skillPoints || out.gearCount) bus.emit('automation:summary', out);
      return out;
    },

    evaluate: function (opts) {
      return F.evaluateBuild(opts || {});
    },

    compareItem: function (item) {
      if (!item || !Game.state) return null;
      var loadout = copyMap(Game.state.inv.equipped);
      var base = F.evaluateBuild({ equipped: loadout, regionId: Game.state.world.region });
      loadout[item.base] = item.uid;
      var candidate = F.evaluateBuild({ equipped: loadout, regionId: Game.state.world.region });
      return F.compareBuilds(base, candidate);
    },

    /** 坐标优化未锁槽位；严格增益保证不会循环。 */
    optimizeEquipment: function (opts) {
      opts = opts || {};
      var s = Game.state;
      if (!s || !s.settings.autoEquip || !Game.player.hasClass()) return { changes: [], gain: 0 };
      var locks = s.inv.lockedSlots || {};
      var initial = copyMap(s.inv.equipped);
      var loadout = copyMap(initial);
      var regionId = s.world.region;
      var currentEval = F.evaluateBuild({ equipped: loadout, regionId: regionId });

      for (var pass = 0; pass < 5; pass++) {
        var changedThisPass = false;
        var slots = reg.ids('slot');
        for (var si = 0; si < slots.length; si++) {
          var slot = slots[si];
          if (locks[slot]) continue;
          var bestUid = loadout[slot] || null;
          var bestEval = currentEval;
          for (var ii = 0; ii < s.inv.items.length; ii++) {
            var item = s.inv.items[ii];
            if (item.base !== slot || item.uid === bestUid) continue;
            var trial = copyMap(loadout);
            trial[slot] = item.uid;
            var ev = F.evaluateBuild({ equipped: trial, regionId: regionId });
            if (ev.utility > bestEval.utility + VALUE_EPS) {
              bestUid = item.uid;
              bestEval = ev;
            }
          }
          if (bestUid !== loadout[slot] && bestEval.utility - currentEval.utility >= EQUIP_MIN_GAIN) {
            loadout[slot] = bestUid;
            currentEval = bestEval;
            changedThisPass = true;
          }
        }
        if (!changedThisPass) break;
      }

      var changes = [];
      var slotIds = reg.ids('slot');
      for (var k = 0; k < slotIds.length; k++) {
        var slotId = slotIds[k];
        if (initial[slotId] === loadout[slotId]) continue;
        changes.push({
          slot: slotId,
          previous: initial[slotId] ? Game.inv.byUid(initial[slotId]) : null,
          item: loadout[slotId] ? Game.inv.byUid(loadout[slotId]) : null
        });
      }
      if (!changes.length) return { changes: [], gain: 0 };

      var initialEval = F.evaluateBuild({ equipped: initial, regionId: regionId });
      var comparison = F.compareBuilds(initialEval, currentEval);
      s.inv.equipped = loadout;
      Game.player.recalc();
      if (Game.world && Game.world.hero) Game.world.syncHeroStats();
      for (var ci = 0; ci < changes.length; ci++) {
        if (changes[ci].item) {
          bus.emit('item:equipped', {
            item: changes[ci].item,
            previous: changes[ci].previous,
            auto: true
          });
        }
      }
      bus.emit('equipment:autoChanged', {
        changes: changes,
        gain: comparison.overall,
        reason: opts.reason || 'auto'
      });
      recordSummary({
        reason: opts.reason || 'auto',
        gearChanges: changes,
        gain: comparison.overall
      });
      return { changes: changes, gain: comparison.overall };
    },

    /** 对每个可用技能的下一点做完整模拟，并在每次提交后重新评估。 */
    allocateSkills: function (opts) {
      opts = opts || {};
      var s = Game.state, p = s && s.player;
      if (!s || !s.settings.autoSkillUpgrade || !Game.player.hasClass() || p.sp < 1) {
        return { count: 0, allocations: [] };
      }
      var cls = Game.player.classDef();
      var order = cls.skills || reg.ids('skill');
      var regionId = Auto.frontierRegion();
      var allocations = {};
      var count = 0, guard = 0;

      while (p.sp > 0 && guard++ < 1000) {
        var baseEval = F.evaluateBuild({ skills: p.skills, regionId: regionId });
        var best = null, bestDelta = VALUE_EPS;
        for (var i = 0; i < order.length; i++) {
          var sid = order[i];
          var def = reg.get('skill', sid);
          if (!def || def.cls !== p.classId) continue;
          var lv = p.skills[sid] || 0;
          if (lv >= Game.SKILL_MAX_LV || p.level < (def.unlockLv || 1)) continue;
          var trialSkills = copyMap(p.skills);
          trialSkills[sid] = lv + 1;
          var candidate = F.evaluateBuild({ skills: trialSkills, regionId: regionId });
          var delta = candidate.utility - baseEval.utility;
          if (delta > bestDelta) {
            bestDelta = delta;
            best = { sid: sid, from: lv, to: lv + 1 };
          }
        }
        if (!best) break;
        p.sp--;
        p.skills[best.sid] = best.to;
        if (!allocations[best.sid]) allocations[best.sid] = { sid: best.sid, from: best.from, to: best.to };
        else allocations[best.sid].to = best.to;
        count++;
      }

      var list = [];
      for (var sid2 in allocations) list.push(allocations[sid2]);
      if (count > 0) {
        Game.player.recalc();
        if (Game.world && Game.world.hero) Game.world.syncHeroStats();
        for (var j = 0; j < list.length; j++) {
          bus.emit('skill:upgraded', {
            sid: list[j].sid,
            lv: list[j].to,
            from: list[j].from,
            levels: list[j].to - list[j].from,
            auto: true
          });
        }
        bus.emit('skills:autoAllocated', {
          count: count,
          allocations: list,
          reason: opts.reason || 'auto'
        });
        recordSummary({ reason: opts.reason || 'auto', skillPoints: count });
      }
      return { count: count, allocations: list };
    },

    /** 旧档/升级等协调：先换装，再加点，最后按新构筑复核换装。 */
    reconcile: function (reason) {
      Auto.beginBatch(reason || 'auto');
      var summary = null;
      try {
        Auto.optimizeEquipment({ reason: reason || 'auto' });
        var skills = Auto.allocateSkills({ reason: reason || 'auto' });
        if (skills.count > 0) Auto.optimizeEquipment({ reason: reason || 'auto' });
      } finally {
        summary = Auto.endBatch();
      }
      return summary;
    },

    setAutoSkillUpgrade: function (enabled) {
      Game.state.settings.autoSkillUpgrade = !!enabled;
      bus.emit('settings:changed', { key: 'autoSkillUpgrade', value: !!enabled });
      if (enabled) Auto.reconcile('setting');
      if (Game.save) Game.save.save('settings');
    },

    setAutoEquip: function (enabled) {
      Game.state.settings.autoEquip = !!enabled;
      bus.emit('settings:changed', { key: 'autoEquip', value: !!enabled });
      if (enabled) Auto.optimizeEquipment({ reason: 'setting' });
      if (Game.save) Game.save.save('settings');
    },

    setSlotLocked: function (slot, locked) {
      if (!reg.has('slot', slot)) return false;
      var locks = Game.state.inv.lockedSlots;
      locks[slot] = !!locked;
      bus.emit('slot:lockChanged', { slot: slot, locked: !!locked });
      if (!locked && Game.state.settings.autoEquip) Auto.optimizeEquipment({ reason: 'unlock' });
      if (Game.save) Game.save.save('slot-lock');
      return true;
    },

    init: function () {
      if (initialized) return;
      initialized = true;
      bus.on('player:levelup', function () { Auto.reconcile('levelup'); });
      bus.on('class:chosen', function () { Auto.reconcile('class'); });
      bus.on('region:changed', function () { Auto.optimizeEquipment({ reason: 'region' }); });
      bus.on('skill:upgraded', function (p) {
        if (!p || !p.auto) Auto.optimizeEquipment({ reason: 'skill' });
      });
      bus.on('shop:bought', function (p) {
        var def = p && reg.get('shopItem', p.sid);
        if (def && def.kind === 'perm') Auto.optimizeEquipment({ reason: 'perm' });
      });
      if (Game.player.hasClass()) Auto.reconcile('load');
    }
  };
})();
