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

  function expectedDamage(raw, defense, tier) {
    return Game.combatMath.mitigate(Math.max(0, raw), Math.max(0, defense), tier || 1).amount;
  }

  function expectedCritMultiplier(chance, multiplier) {
    chance = Math.max(0, Number(chance) || 0);
    multiplier = Math.max(1, Number(multiplier) || 1);
    var guaranteed = Math.floor(chance);
    var fraction = chance - guaranteed;
    var guaranteedMultiplier = Game.combatMath.saturatingPow
      ? Game.combatMath.saturatingPow(multiplier, guaranteed).value
      : Math.min(1e300, Math.pow(multiplier, guaranteed));
    return Game.combatMath.saturatingMultiply(guaranteedMultiplier,
      1 + fraction * (multiplier - 1)).value;
  }

  function regionContext(rid) {
    var order = Game.State.regionOrder();
    var region = reg.get('region', rid) || reg.get('region', order[0]);
    var tier = Game.State.regionTier(region.id);
    var normal = Game.population.offlineSummary(region.id, tier);
    var bossProfileId = Game.population.channelProfiles(region.id, 'boss')[0];
    var bossSpawn = bossProfileId && Game.content.get('worldSpawnProfile', bossProfileId);
    var boss = bossSpawn && Game.population.summarizePack(bossSpawn.encounterPackId, tier);
    return {
      rid: region.id,
      tier: tier,
      normalDef: normal ? normal.armor : 0,
      bossAtk: boss ? boss.power : 1,
      bossSpd: boss ? 10 + Math.max(0, boss.speed - 1) / 0.018 : 10
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
    var cls = Game.builds.classProjection(classId);
    var level = opts.level !== undefined ? opts.level : p.level;
    var skills = opts.skills || p.skills;
    var equipped = opts.equipped || state.inv.equipped;
    var d = Game.builds.projectDerived(Game.builds.compileActorRecord({
      classId: classId, level: level, talentRanks: skills,
      permanentUpgrades: opts.perms || p.perms,
      loadout: { equipment: equipped }
    }, equipped));
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
    var crit = Math.max(0, d.crit + avg.crit);
    var critMult = expectedCritMultiplier(crit, d.critDmg);
    var hit = expectedDamage(atk, ctx.normalDef, ctx.tier);
    var directDps = hit * critMult / F.atkInterval(spd);
    var dotDps = 0;
    var healingPerSec = 0;
    var shieldingPerSec = 0;

    for (var j = 0; j < actives.length; j++) {
      var sk = actives[j];
      var rank = skills[sk.id] || 0;
      var cd = Math.max(0.1, sk.cd * (1 - d.cdr));
      if (sk.kind === 'strike') {
        var skillCrit = Math.max(0, crit + (sk.critBonus || 0));
        var skillCritMult = expectedCritMultiplier(skillCrit, d.critDmg);
        var strikeDps = hit * F.skillVal(sk.mult, rank) * skillCritMult / cd;
        directDps += strikeDps;
        if (sk.healOfDmg) healingPerSec += strikeDps * sk.healOfDmg * d.healPow;
        if (sk.dot) dotDps += atk * F.skillVal(sk.dot.mult, rank) / cd;
      } else if (sk.kind === 'aoe') {
        var aoeDps = hit * F.skillVal(sk.mult, rank) * critMult / cd;
        directDps += aoeDps;
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
    var bossHit = expectedDamage(ctx.bossAtk, def, ctx.tier);
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
    var estimator = null;
    if (opts.skipEstimator !== true && Game.combatEstimator && Game.content && Game.content.isFinalized()) {
      estimator = Game.combatEstimator.evaluateCurrent({
        regionId: ctx.rid,
        classId: classId,
        level: level,
        skills: skills,
        equipped: equipped,
        tacticsProfile: state.settings.combatStrategy || 'balanced',
        sampleSeeds: opts.sampleSeeds || [11, 29, 47],
        maxTicks: opts.maxTicks || 6000
      });
      if (estimator && Number.isFinite(estimator.averageDps) && estimator.averageDps > 0) {
        offense = estimator.averageDps;
        var success = Math.max(0.02, 1 - estimator.failureRate);
        survival *= success;
        utility =
          w.offense * Math.log(Math.max(0.001, offense)) +
          w.survival * Math.log(Math.max(0.001, survival)) +
          w.economy * Math.log(economy) +
          Math.log(success);
      }
    }

    return {
      offense: offense,
      survival: survival,
      economy: economy,
      utility: utility,
      derived: d,
      context: ctx,
      estimator: estimator
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

  var EQUIPMENT_SLICE_MS = 4;
  var equipmentJobSequence = 0;

  function supportsEquipmentSlicing() {
    return !Game.AUTOMATION_FORCE_SYNC && typeof window.requestAnimationFrame === 'function' &&
      typeof window.performance === 'object' && typeof window.performance.now === 'function';
  }

  function equipmentStateSignature(state, slots) {
    var payload = {
      classId: state.player.classId,
      regionId: state.world.region,
      autoEquip: state.settings.autoEquip,
      equipped: slots.map(function (slot) { return state.inv.equipped[slot] || null; }),
      locks: slots.map(function (slot) { return !!state.inv.lockedSlots[slot]; }),
      items: state.inv.items.map(function (item) {
        return [item.uid, item.baseId || item.base, item.classId || null,
          item.itemLevel || item.ilvl, item.rarityId || item.rar,
          item.reforge && item.reforge.count || 0, item.affixes || null];
      })
    };
    var serialized = Game.contentCompiler && Game.contentCompiler.stableStringify
      ? Game.contentCompiler.stableStringify(payload) : JSON.stringify(payload);
    return U.fnv1a(serialized);
  }

  function createEquipmentJob(opts) {
    var s = Game.state;
    var locks = s.inv.lockedSlots || {};
    var initial = copyMap(s.inv.equipped);
    var regionId = s.world.region;
    var slots = Game.equipment ? Game.equipment.SLOT_IDS.slice() : reg.ids('slot');
    var signature = equipmentStateSignature(s, slots);
    var candidates = {};

    function staticScore(item) {
      var st = Game.inv.itemStats(item);
      return (st.atk || 0) * 2 + (st.hp || 0) * .2 +
        (st.def || 0) + (st.ward || 0) +
        ((st.crit || 0) * 180 + (st.critDmg || 0) * 90 +
        (st.dodge || 0) * 120 + (st.lifesteal || 0) * 120 +
        (st.cdr || 0) * 100 + (st.healPow || 0) * 80 +
        (st.goldMul || 0) * 25 + (st.expMul || 0) * 25 +
        (st.dropMul || 0) * 45 + (st.rarityLuck || 0) * 45);
    }
    slots.forEach(function (slot) {
      if (locks[slot]) { candidates[slot] = [initial[slot] || null]; return; }
      var rows = s.inv.items.filter(function (item) {
        return (Game.equipment ? Game.equipment.slotOf(item) : item.base) === slot &&
          (!item.classId || item.classId === s.player.classId);
      }).sort(function (left, right) {
        return staticScore(right) - staticScore(left) || left.uid.localeCompare(right.uid);
      });
      var ids = [initial[slot] || null];
      rows.slice(0, 8).forEach(function (item) {
        if (ids.indexOf(item.uid) < 0) ids.push(item.uid);
      });
      candidates[slot] = ids;
    });
    function keyOf(loadout) {
      return slots.map(function (slot) { return loadout[slot] || '-'; }).join('|');
    }
    function sortBeams(rows) {
      rows.sort(function (left, right) {
        return right.evaluation.utility - left.evaluation.utility ||
          keyOf(left.loadout).localeCompare(keyOf(right.loadout));
      });
      var seen = {};
      return rows.filter(function (beam) {
        var key = keyOf(beam.loadout);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      }).slice(0, 32);
    }

    var stage = 'expand';
    var slotIndex = 0, beamIndex = 0, candidateIndex = 0, finalistIndex = 0;
    var expanded = [], finalists = [], evaluated = [];
    var beams = [{
      loadout: copyMap(initial),
      evaluation: F.evaluateBuild({ equipped: initial, regionId: regionId, skipEstimator: true })
    }];
    var job = {
      id: ++equipmentJobSequence,
      opts: opts,
      done: false,
      result: null,
      slices: 0,
      maxSliceMs: 0,
      operations: 0,
      step: function () {
        if (job.done) return true;
        job.operations++;
        if (stage === 'expand') {
          if (slotIndex >= slots.length) { stage = 'prepare-finalists'; return false; }
          var slot = slots[slotIndex];
          var beam = beams[beamIndex];
          var uid = candidates[slot][candidateIndex];
          var trial = copyMap(beam.loadout);
          trial[slot] = uid;
          expanded.push({
            loadout: trial,
            evaluation: F.evaluateBuild({
              equipped: trial, regionId: regionId, skipEstimator: true
            })
          });
          candidateIndex++;
          if (candidateIndex >= candidates[slot].length) {
            candidateIndex = 0;
            beamIndex++;
          }
          if (beamIndex >= beams.length) {
            beams = sortBeams(expanded);
            expanded = [];
            beamIndex = 0;
            slotIndex++;
          }
          return false;
        }
        if (stage === 'prepare-finalists') {
          var initialKey = keyOf(initial);
          var preservedInitial = beams.filter(function (beam) {
            return keyOf(beam.loadout) === initialKey;
          })[0];
          if (!preservedInitial) {
            preservedInitial = {
              loadout: copyMap(initial),
              evaluation: F.evaluateBuild({
                equipped: initial, regionId: regionId, skipEstimator: true
              })
            };
            beams.push(preservedInitial);
          }
          beams = sortBeams(beams);
          finalists = beams.slice(0, 8);
          if (!finalists.some(function (beam) { return keyOf(beam.loadout) === initialKey; })) {
            finalists.push(preservedInitial);
          }
          finalists = finalists.filter(Boolean);
          stage = 'estimate';
          return false;
        }
        if (stage === 'estimate') {
          var finalist = finalists[finalistIndex++];
          evaluated.push({
            loadout: finalist.loadout,
            evaluation: F.evaluateBuild({
              equipped: finalist.loadout, regionId: regionId,
              sampleSeeds: [11, 29, 47]
            })
          });
          if (finalistIndex >= finalists.length) stage = 'commit';
          return false;
        }

        var currentSignature = equipmentStateSignature(s, slots);
        if (currentSignature !== signature) {
          job.result = { changes: [], gain: 0, ok: false, reason: 'stale-build' };
          job.done = true;
          return true;
        }
        if (Game.world && Game.world.hero && Game.world.hero.encounterId) {
          job.result = { changes: [], gain: 0, ok: false, reason: 'encounter-active' };
          job.done = true;
          return true;
        }
        var finalInitialKey = keyOf(initial);
        evaluated.sort(function (left, right) {
          var delta = right.evaluation.utility - left.evaluation.utility;
          if (Math.abs(delta) > VALUE_EPS) return delta;
          if (keyOf(left.loadout) === finalInitialKey) return -1;
          if (keyOf(right.loadout) === finalInitialKey) return 1;
          return keyOf(left.loadout).localeCompare(keyOf(right.loadout));
        });
        var best = evaluated[0];
        var initialBeam = evaluated.filter(function (beam) {
          return keyOf(beam.loadout) === finalInitialKey;
        })[0];
        if (!best || !initialBeam ||
            best.evaluation.utility - initialBeam.evaluation.utility < EQUIP_MIN_GAIN) {
          job.result = { changes: [], gain: 0 };
          job.done = true;
          return true;
        }

        var changes = [];
        slots.forEach(function (slotId) {
          if (initial[slotId] === best.loadout[slotId]) return;
          changes.push({
            slot: slotId,
            previous: initial[slotId] ? Game.inv.byUid(initial[slotId]) : null,
            item: best.loadout[slotId] ? Game.inv.byUid(best.loadout[slotId]) : null
          });
        });
        if (!changes.length) {
          job.result = { changes: [], gain: 0 };
          job.done = true;
          return true;
        }
        var comparison = F.compareBuilds(initialBeam.evaluation, best.evaluation);
        s.inv.equipped = copyMap(best.loadout);
        Game.player.recalc();
        if (Game.world && Game.world.hero) Game.world.syncHeroStats();
        changes.forEach(function (change) {
          if (change.item) bus.emit('item:equipped', {
            item: change.item, previous: change.previous, auto: true
          });
        });
        bus.emit('equipment:autoChanged', {
          changes: changes, gain: comparison.overall, reason: opts.reason || 'auto'
        });
        recordSummary({
          reason: opts.reason || 'auto', gearChanges: changes, gain: comparison.overall
        });
        job.result = { changes: changes, gain: comparison.overall };
        job.done = true;
        return true;
      }
    };
    return job;
  }

  function completeEquipmentJob(job, ticket) {
    ticket.pending = false;
    ticket.result = job.result;
    ticket.slices = job.slices;
    ticket.maxSliceMs = job.maxSliceMs;
    Game.auto.equipmentJobDiagnostics = {
      id: job.id, slices: job.slices, operations: job.operations,
      maxSliceMs: job.maxSliceMs, budgetMs: EQUIPMENT_SLICE_MS,
      result: job.result
    };
    if (typeof job.opts.onComplete === 'function') job.opts.onComplete(job.result);
  }

  function runEquipmentJob(job) {
    var ticket = { pending: true, jobId: job.id, result: null };
    if (!supportsEquipmentSlicing()) {
      while (!job.done) job.step();
      completeEquipmentJob(job, ticket);
      return job.result;
    }
    function slice() {
      var started = window.performance.now();
      try {
        do {
          job.step();
        } while (!job.done && window.performance.now() - started < EQUIPMENT_SLICE_MS);
      } catch (error) {
        job.done = true;
        job.result = {
          changes: [], gain: 0, ok: false, reason: 'automation-error',
          error: String(error && error.message || error)
        };
      }
      var elapsed = window.performance.now() - started;
      job.slices++;
      job.maxSliceMs = Math.max(job.maxSliceMs, elapsed);
      if (job.done) completeEquipmentJob(job, ticket);
      else window.setTimeout(slice, 0);
    }
    window.setTimeout(slice, 0);
    return ticket;
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
      loadout[Game.equipment ? Game.equipment.slotOf(item) : item.base] = item.uid;
      var candidate = F.evaluateBuild({ equipped: loadout, regionId: Game.state.world.region });
      return F.compareBuilds(base, candidate);
    },

    /** 五槽 beam search；浏览器按 4ms 切片，最终候选才运行正式模拟。 */
    optimizeEquipment: function (opts) {
      opts = opts || {};
      var s = Game.state;
      if (!s || !s.settings.autoEquip || !Game.player.hasClass()) {
        var unavailable = { changes: [], gain: 0 };
        if (typeof opts.onComplete === 'function') opts.onComplete(unavailable);
        return unavailable;
      }
      if (Game.world && Game.world.hero && Game.world.hero.encounterId) {
        var active = { changes: [], gain: 0, ok: false, reason: 'encounter-active' };
        if (typeof opts.onComplete === 'function') opts.onComplete(active);
        return active;
      }
      return runEquipmentJob(createEquipmentJob(opts));
    },

    /** 对每个可用技能的下一点做完整模拟，并在每次提交后重新评估。 */
    allocateSkills: function (opts) {
      opts = opts || {};
      var s = Game.state, p = s && s.player;
      if (!s || !s.settings.autoSkillUpgrade || !Game.player.hasClass() || p.sp < 1) {
        return { count: 0, spent: 0, allocations: [] };
      }
      var cls = Game.player.classDef();
      var order = cls.skills || reg.ids('skill');
      var regionId = Auto.frontierRegion();
      var allocations = {};
      var count = 0, spent = 0, guard = 0;

      while (p.sp > 0 && guard++ < 1000) {
        var baseEval = F.evaluateBuild({ skills: p.skills, regionId: regionId });
        var best = null, bestDelta = VALUE_EPS;
        for (var i = 0; i < order.length; i++) {
          var sid = order[i];
          var legacy = reg.get('skill', sid);
          var def = Game.content.get('talent', sid);
          if (!legacy || !def || def.classId !== p.classId) continue;
          var lv = p.skills[sid] || 0;
          var cost = def.costs.length === 1
            ? def.costs[0]
            : def.costs[Math.min(lv, def.costs.length - 1)];
          if (lv >= def.maxRank || p.level < def.unlockLevel || p.sp < cost) continue;
          var trialSkills = copyMap(p.skills);
          trialSkills[sid] = lv + 1;
          var candidate = F.evaluateBuild({ skills: trialSkills, regionId: regionId });
          var delta = candidate.utility - baseEval.utility;
          if (delta > bestDelta) {
            bestDelta = delta;
            best = { sid: sid, from: lv, to: lv + 1, cost: cost };
          }
        }
        if (!best) break;
        p.sp -= best.cost;
        p.skills[best.sid] = best.to;
        if (!allocations[best.sid]) allocations[best.sid] = { sid: best.sid, from: best.from, to: best.to };
        else allocations[best.sid].to = best.to;
        count++;
        spent += best.cost;
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
          spent: spent,
          allocations: list,
          reason: opts.reason || 'auto'
        });
        recordSummary({ reason: opts.reason || 'auto', skillPoints: spent });
      }
      return { count: count, spent: spent, allocations: list };
    },

    /** 旧档/升级等协调：先换装，再加点，最后按新构筑复核换装。 */
    reconcile: function (reason) {
      if (supportsEquipmentSlicing()) {
        Auto.beginBatch(reason || 'auto');
        var ticket = { pending: true, summary: null };
        function finish() {
          ticket.pending = false;
          ticket.summary = Auto.endBatch();
        }
        Auto.optimizeEquipment({
          reason: reason || 'auto',
          onComplete: function () {
            var skills = Auto.allocateSkills({ reason: reason || 'auto' });
            if (skills.count > 0) {
              Auto.optimizeEquipment({ reason: reason || 'auto', onComplete: finish });
            } else finish();
          }
        });
        return ticket;
      }
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
