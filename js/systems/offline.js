/* ============================================================
 * systems/offline.js — 离线收益结算（不设时长上限）
 * 离线时处于休息模式：不产生战斗收益，HP 回满、休整增益积满；
 * 战斗模式：按 formulas.offlineGains 公式折算。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;
  var U = Game.util, F = Game.F, bus = Game.bus, reg = Game.reg;

  var Off = Game.offline = {
    /** 计算离线摘要（elapsed 秒）；不足 60s 或时间戳异常返回 null */
    settle: function (elapsedSec) {
      // 启动页只是存档预览；玩家明确选择档案前不结算、不弹窗。
      if (Game.entryState === 'menu' || Game.entryState === 'opening') return null;
      // 标题、序章及迁移档补选职业阶段没有可结算的冒险实体。
      // 把校验放在系统入口，启动与 visibilitychange 两条调用链都受保护。
      if (!Game.State.isAdventureStarted()) return null;
      if (Game.ending && Game.ending.isPending()) return null;
      if (!elapsedSec || elapsedSec < 60) return null;
      elapsedSec = Math.floor(elapsedSec);
      var mode = Game.state.world.mode;

      if (mode === 'rest') {
        return { type: 'rest', seconds: elapsedSec };
      }

      var region = reg.get('region', Game.state.world.region) ||
        reg.get('region', Game.State.regionOrder()[0]);
      var m1 = reg.get('monster', region.monsters[0]);
      var m2 = reg.get('monster', region.monsters[1] || region.monsters[0]);
      var tier = Game.State.regionTier(region.id);
      var s1 = F.monsterStats(tier, m1.mods, false);
      var s2 = F.monsterStats(tier, m2.mods, false);
      var mHp = (s1.hp + s2.hp) / 2;
      var mExp = (s1.exp + s2.exp) / 2;
      var mGold = (s1.gold + s2.gold) / 2;

      var estimate = Game.combatEstimator && Game.combatEstimator.evaluateCurrent
        ? Game.combatEstimator.evaluateCurrent({
            regionId: region.id,
            tacticsProfile: Game.state.settings.combatStrategy || 'balanced',
            sampleSeeds: [11, 29, 47],
            maxTicks: 12000
          })
        : null;
      var dps = estimate && estimate.averageDps || Game.player.estimateDps();
      var g = F.offlineGains(elapsedSec, dps, mHp, mExp, mGold, {});
      if (estimate && estimate.averageSeconds > 0 && estimate.failureRate < 1) {
        var encounters = Math.floor(elapsedSec / estimate.averageSeconds *
          (1 - estimate.failureRate) * 0.72);
        g.kills = Math.max(0, encounters * Math.max(1, estimate.enemyCount || 1));
        g.exp = Math.round(g.kills * mExp);
        g.gold = Math.round(g.kills * mGold);
        g.items = Math.min(Math.floor(g.kills * F.BAL.dropEquip), F.BAL.offlineItemCap);
        g.potions = Math.min(Math.floor(g.kills * F.BAL.dropPotion), 20);
      }
      var d = Game.player.derived();

      if (Game.state.world.layoutVersion >= 3 && Game.exploration && region.exploration) {
        var ers = Game.exploration.regionState(region.id);
        var known = Object.keys(ers.discovered.resources || {});
        var knownDefs = region.exploration.resources.filter(function (def) {
          return known.indexOf(def.id) >= 0;
        });
        var routeLength = knownDefs.length ? 420 + knownDefs.length * 240 : 0;
        var routeSeconds = routeLength / 56 + knownDefs.length * F.BAL.gatherDuration;
        var loopSeconds = Math.max(90, routeSeconds);
        var loops = knownDefs.length ? Math.floor(elapsedSec / loopSeconds) : 0;
        var travelCap = Math.floor(elapsedSec / Math.max(8, routeSeconds / Math.max(1, knownDefs.length)));
        var materials = {};
        var gatherActions = 0;
        for (var ki = 0; ki < knownDefs.length; ki++) {
          var kd = knownDefs[ki];
          var cooldown = kd.rarity === 'rare' ? 1200 : 600;
          var actions = Math.min(loops, Math.floor(elapsedSec / cooldown) + 1);
          gatherActions += actions;
          materials[kd.material] = actions * Math.max(1, Math.floor((F.gatherYield(tier).min + F.gatherYield(tier).max) / 2));
        }
        if (gatherActions > travelCap && gatherActions > 0) {
          var scale = travelCap / gatherActions;
          for (var mk in materials) materials[mk] = Math.floor(materials[mk] * scale);
          gatherActions = travelCap;
        }
        var knownCoverage = Game.exploration.coverage ?
          Game.exploration.coverage(region.id) : 0;
        var routeDanger = U.clamp(0.22 + tier * 0.055, 0.2, 0.78);
        var dangerTotal = 0, dangerSamples = 0;
        if (knownDefs.length && Game.world && Game.world.layout &&
            Game.terrain && Game.terrain.dangerAt) {
          var knownIds = {};
          for (var di = 0; di < knownDefs.length; di++) knownIds[knownDefs[di].id] = true;
          var routeNodes = Game.world.layout.nodes || [];
          for (var ni = 0; ni < routeNodes.length; ni++) {
            if (!knownIds[routeNodes[ni].defId]) continue;
            dangerTotal += Game.terrain.dangerAt(routeNodes[ni].x, routeNodes[ni].y);
            dangerSamples++;
          }
          if (dangerSamples) routeDanger = U.clamp(dangerTotal / dangerSamples, 0, 1);
        }
        // 已登记资源走实际路线；只有已揭示但尚未登记资源时保留极低效率遭遇。
        var combatFactor = knownDefs.length ?
          U.clamp(0.18 + routeDanger * 0.16, 0.2, 0.36) :
          (knownCoverage > 0 ? U.clamp(0.06 + knownCoverage * 0.16, 0.06, 0.12) : 0);
        var expeditionKills = Math.floor(g.kills * combatFactor);
        return {
          type: 'expedition',
          seconds: elapsedSec,
          knownResources: knownDefs.length,
          knownCoverage: knownCoverage,
          routeDanger: routeDanger,
          routeLength: routeLength,
          routeLoops: loops,
          gatherActions: gatherActions,
          materials: materials,
          kills: expeditionKills,
          expBase: Math.round(expeditionKills * mExp + gatherActions * mExp * 0.28),
          goldBase: Math.round(expeditionKills * mGold),
          expShow: Math.round((expeditionKills * mExp + gatherActions * mExp * 0.28) * d.expMul),
          goldShow: Math.round(expeditionKills * mGold * d.goldMul),
          items: Math.min(Math.floor(expeditionKills * F.BAL.dropEquip), F.BAL.offlineItemCap),
          potions: Math.min(Math.floor(expeditionKills * F.BAL.dropPotion), 20),
          noDiscoveries: true
        };
      }

      return {
        type: 'battle',
        seconds: elapsedSec,
        kills: g.kills,
        expBase: g.exp, goldBase: g.gold,
        // 展示值（含乘区，与实际入账一致）
        expShow: Math.round(g.exp * d.expMul),
        goldShow: Math.round(g.gold * d.goldMul),
        items: g.items,
        potions: g.potions
      };
    },

    /** 确认后入账 */
    apply: function (sum) {
      // 防止重置/导入等状态切换后仍有旧弹窗回调尝试入账。
      if (!sum || !Game.State.isAdventureStarted()) return;
      var s = Game.state;
      s.meta.stats.offlineSec += sum.seconds;
      if (Game.environment) Game.environment.restoreOffline(sum.seconds);

      if (sum.type === 'rest') {
        var hero = Game.units && Game.units.primary();
        if (hero) Game.units.restore(hero, { source: 'offline-rest' });
        else s.player.hp = Game.player.derived().maxHp;
        s.world.restBuffT = F.BAL.restBuffCap;
        s.meta.stats.restSec += sum.seconds;
        bus.emit('offline:settled', { summary: sum });
        return;
      }

      var batching = !!Game.auto;
      if (batching) Game.auto.beginBatch('offline');
      try {
        Game.player.addExp(sum.expBase);
        Game.player.addGold(sum.goldBase);
        s.meta.stats.kills += sum.kills;
        if (sum.type === 'expedition' && sum.materials) {
          for (var material in sum.materials) {
            if (sum.materials[material] > 0) Game.inv.addMaterial(material, sum.materials[material]);
          }
        }

        var lv = s.player.level;
        var generated = [];
        for (var i = 0; i < sum.items; i++) {
          generated.push(Game.inv.genLoot(lv));
        }
        var gotItems = Game.inv.addItems(generated, { offline: true, source: 'offline' });
        if (sum.potions > 0) Game.inv.addPotion('potion_small', sum.potions);
        sum.gotItems = gotItems;
        bus.emit('offline:settled', { summary: sum });
      } finally {
        if (batching) Game.auto.endBatch();
      }
    }
  };
})();
