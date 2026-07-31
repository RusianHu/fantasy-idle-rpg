/* ============================================================
 * systems/world.js — 可位移的平面小世界
 * 伪俯视 2D 场景：角色 x/y 双轴坐标，支持自动游走索敌与玩家
 * 手动移动交战；怪物分散刷新；回营传送 / 死亡重整 / Boss 讨伐演出。
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
  var CAMP_WARP_DISTANCE = 260;
  var CAMP_WARP_OUT_T = 0.38;
  var CAMP_WARP_IN_T = 0.42;
  var CAMP_APPROACH_DISTANCE = 46;
  var LEASH_ENTRY_MARGIN = 8;
  var moveKeys = {};
  var controlsBound = false;

  var W = Game.world = {
    region: null,       // 区域定义
    layout: null,       // 当前存档/区域的运行时生成布局
    entities: [],
    hero: null,
    props: [],          // 场景装饰（y 排序渲染）
    groundLoot: [],     // 当前区域临时落地物（切区/保存前强制结算）
    bossEnt: null,
    cinematic: null,    // {ent, t} Boss 登场运镜
    pendingRespawn: [],
    zzzT: 0,
    autoCampCycle: false,
    autoCampSuppressedUntil: 0,
    settledPacks: {},
    encounterSequence: 1,
    encounterOrdinals: {},
    compatSpawnSequence: 1,

    attachActor: function (actor, reason) {
      if (!actor || !actor.components || !actor.components.transform) return false;
      if (W.entities.some(function (entity) { return entity.id === actor.id; })) return false;
      actor.animT = Number(actor.animT) || 0;
      actor.wanderT = Number(actor.wanderT) || 1;
      actor.rewardAuthorized = actor.spawnSource && actor.spawnSource.kind === 'summon'
        ? false : actor.rewardAuthorized;
      W.entities.push(actor);
      bus.emit('actor:worldAttached', { actorId: actor.id, reason: reason || 'runtime' });
      return true;
    },

    detachActor: function (actorId, reason) {
      var removed = false;
      W.entities = W.entities.filter(function (entity) {
        if (!entity || entity.id !== actorId) return true;
        removed = true;
        return false;
      });
      if (removed && W.hero && W.hero.target && W.hero.target.id === actorId) {
        W.hero.target = null;
        W.hero.manualTarget = false;
      }
      if (removed) bus.emit('actor:worldDetached', { actorId: actorId, reason: reason || 'runtime' });
      return removed;
    },

    heroMoveSpeed: function () {
      if (!W.layout || W.layout.version < 3 || !Game.expedition) return HERO_SPEED;
      return HERO_SPEED * Game.expedition.currentModifier().move;
    },

    isHostileActor: function (source, target) {
      return !!(source && target && target.components && target.components.vitals &&
        !target.hazardConcealed &&
        target.hp > 0 && !target.dead &&
        Game.relations.resolve(source.id, target.id, source.encounterId || null) === 'hostile');
    },

    isWithinEncounterLeash: function (actor, target) {
      if (!actor || !target || !(target.packLeashRadius > 0) ||
          !Number.isFinite(target.packAnchorX) || !Number.isFinite(target.packAnchorY)) return true;
      return U.dist(actor.x, actor.y, target.packAnchorX, target.packAnchorY) <=
        Math.max(0, target.packLeashRadius - LEASH_ENTRY_MARGIN);
    },

    monsterPatrolRadius: function (ent) {
      var radius = ent && ent.territory && Number(ent.territory.radius) || 64;
      if (!ent || !(ent.packLeashRadius > 0) ||
          !Number.isFinite(ent.packAnchorX) || !Number.isFinite(ent.packAnchorY)) return radius;
      var spawnX = Number.isFinite(ent.spawnX) ? ent.spawnX : ent.x;
      var spawnY = Number.isFinite(ent.spawnY) ? ent.spawnY : ent.y;
      var anchorOffset = U.dist(spawnX, spawnY, ent.packAnchorX, ent.packAnchorY);
      return Math.max(0, Math.min(radius,
        ent.packLeashRadius - LEASH_ENTRY_MARGIN - anchorOffset));
    },

    endEncounter: function (reason) {
      var active = Game.encounters && Game.encounters.all().filter(function (encounter) {
        return encounter.lifecycle === 'active' && !encounter.context.estimator;
      }) || [];
      active.forEach(function (encounter) {
        Game.encounters.end(encounter.id, reason || 'world-safe-exit');
      });
      if (W.hero && Game.units) Game.units.commit(W.hero);
      return active.length;
    },

    startEncounter: function (target) {
      var hero = W.hero;
      if (!W.isHostileActor(hero, target)) return null;
      if (hero.encounterId) return Game.encounters.get(hero.encounterId);
      // Never create an encounter that the first fixed tick must immediately
      // destroy. The target remains locked while the hero enters the pack leash.
      if (!W.isWithinEncounterLeash(hero, target)) return null;
      var boss = target.rank === 'boss' || target.boss;
      var profileId = 'encounter.' + W.region.id + (boss ? '.boss' : '');
      var stableSpawn = target.spawnId || target.packAnchorId || target.id;
      var ordinal = (W.encounterOrdinals[stableSpawn] || 0) + 1;
      var encounter = Game.encounters.start(profileId, {
        id: 'world:' + W.region.id + ':' + W.encounterSequence++,
        seed: U.strSeed([Game.state.world.worldSeed, W.region.id, stableSpawn, ordinal, profileId].join('|')),
        rewardBudget: target.rewardScale || (boss ? 4 : 1),
        packId: target.packId || null,
        leashActorId: hero.id,
        leashAnchor: target.packLeashRadius ? {
          x: target.packAnchorX, y: target.packAnchorY
        } : null,
        leashRadius: target.packLeashRadius || 0,
        world: true
      });
      W.encounterOrdinals[stableSpawn] = ordinal;
      Game.encounters.join(encounter.id, hero.id, 'party');
      var ids = boss ? [target.id] : (target.packMemberIds || [target.id]);
      ids.map(Game.actors.get).filter(function (actor) {
        return actor && !actor.dead && actor.hp > 0;
      }).sort(function (a, b) { return a.id.localeCompare(b.id); }).forEach(function (actor) {
        Game.encounters.join(encounter.id, actor.id, 'enemy');
      });
      Game.combatAI.strategy(hero.id, Game.state.settings.combatStrategy || 'balanced');
      hero.tactics = Object.assign({}, Game.state.settings.combatTactics || {});
      hero.components.targeting.priorityTargetId = target.id;
      hero.target = target;
      // Encounter movement is owned by the fixed-tick combat system. Do not
      // retain an exploration route that can resume or overwrite its range intent.
      hero.moveOrder = null;
      if (Game.nav) Game.nav.clear(hero);
      return encounter;
    },

    /* ---------------- 初始化区域 ---------------- */
    init: function (rid) {
      W.bindControls();
      W.endEncounter('region-change');
      if (Game.hazards) Game.hazards.reset();
      if (W.hero && Game.units) Game.units.commit(W.hero);
      if (Game.population) Game.population.reset(rid);
      Game.encounters.reset();
      if (Game.engagement) Game.engagement.reset();
      if (Game.relations && Game.relations.reset) Game.relations.reset();
      Game.parties.reset();
      Game.actors.reset();
      if (W.groundLoot.length) W.flushGroundLoot('region');
      if (Game.environment) Game.environment.resetRegion();
      if (Game.trade) Game.trade.reset({ dynamic: true });
      var region = reg.get('region', rid);
      if (!region) { // 已下线区域：回退到第一个有效区域
        rid = Game.State.regionOrder()[0];
        region = reg.get('region', rid);
        Game.state.world.region = rid;
      }
      W.region = region;
      if (Game.weather) Game.weather.enterRegion(rid);
      W.entities = [];
      W.bossEnt = null;
      W.cinematic = null;
      W.pendingRespawn = [];
      W.groundLoot = [];
      W.autoCampCycle = false;
      W.settledPacks = {};
      W.encounterSequence = 1;
      W.encounterOrdinals = {};
      W.compatSpawnSequence = 1;

      W.layout = Game.terrain.build(
        region,
        Game.state.world.worldSeed,
        Game.state.world.layoutVersion
      );
      // v3 运行时使用大地图边界；注册表仍保留 900×520 的 v1/v2
      // 兼容尺寸，避免破坏历史布局快照。
      if (W.layout.version >= 3) {
        W.region = Object.assign({}, region, { world: W.layout.world });
      }
      W.props = W.layout.props.concat(W.layout.nodes || []);
      if (W.layout.version >= 3) {
        W.props = W.props.concat(W.layout.landmarks || [], W.layout.curios || [], W.layout.ecology || []);
      }
      if (Game.particles) Game.particles.initRegion(W.region);

      Game.parties.create({ id: 'party-player', maxMembers: 4 });
      var hero = W.hero = W.makeHero();
      hero.x = W.layout.camp.x + 30;
      hero.y = W.layout.camp.y + 26;
      W.entities.push(hero);

      var populationOptions = {
        tier: Game.State.regionTier(rid),
        worldSeed: Game.state.world.worldSeed,
        expeditionIndex: Game.state.world.expedition && Game.state.world.expedition.index || 0,
        affixFor: function (slot) {
          return slot.threat && (Game.expedition ? Game.expedition.threatAffix(slot.threat.id) : slot.threat.affix);
        }
      };
      var regionModifier = W.layout.version >= 3 && Game.expedition
        ? Game.expedition.currentModifier() : { danger: 1, exp: 1 };
      if (regionModifier.danger !== 1) {
        populationOptions.modifiers = [
          { stat: 'maxHp', phase: 'multiply', operation: 'multiply', value: regionModifier.danger },
          { stat: 'physicalPower', phase: 'multiply', operation: 'multiply', value: Math.sqrt(regionModifier.danger) },
          { stat: 'magicPower', phase: 'multiply', operation: 'multiply', value: Math.sqrt(regionModifier.danger) }
        ];
      }
      populationOptions.rewardMultiplier = regionModifier.exp || 1;
      var mountPlan = Game.population.prepareRegion(rid, W.layout, Object.assign({}, populationOptions, {
        channelLimits: {
          regular: W.layout.version >= 3
            ? (W.layout.threats || []).length
            : Math.min(POPULATION, (W.layout.spawnCandidates || []).length),
          npc: Math.min(2, (W.layout.spawnCandidates || []).length),
          guardian: W.layout.version >= 3 ? 1 : 0
        }
      }));
      if (!mountPlan.ok) {
        throw new Error('[World] population mount failed: ' + JSON.stringify(mountPlan.failures));
      }
      if (W.layout.version >= 3) {
        if (Game.expedition) Game.expedition.start(rid);
        if (Game.expeditionAI) Game.expeditionAI.reset();
        Game.population.mountChannel(rid, 'regular', W.layout, populationOptions).forEach(function (result) {
          Array.prototype.push.apply(W.entities, result.actors);
        });
        W.spawnGuardian();
        if (Game.exploration) Game.exploration.revealAt(hero.x, hero.y, { force: true, rid: rid });
      } else {
        Game.population.mountChannel(rid, 'regular', W.layout, populationOptions).forEach(function (result) {
          Array.prototype.push.apply(W.entities, result.actors);
        });
      }
      Game.population.mountChannel(rid, 'npc', W.layout, populationOptions).forEach(function (result) {
        Array.prototype.push.apply(W.entities, result.actors);
      });
      if (Game.hazards && W.layout.version >= 3) Game.hazards.initRegion(rid, W.layout);

      if (Game.state.world.mode === 'rest') {
        hero.state = 'goCamp';
      }
      if (Game.render) Game.render.snapCamera(hero.x, hero.y);
      bus.emit('region:changed', { rid: rid });
    },

    makeHero: function () {
      var cls = Game.player.classDef();
      var hero = Game.actors.spawn({
        instanceId: 'player-world',
        actorRecordId: Game.state.roster.primaryActorId,
        partyId: 'party-player',
        factionId: 'adventurers',
        controllerId: 'ai:player-auto',
        transform: { x: 100, y: 120, direction: 'd' },
        spawnSource: { kind: 'world', sourceId: 'player', sequence: 0 }
      });
      // Once the live Actor exists, project UI/legacy world fields from its
      // canonical StatBlock instead of retaining a parallel Talent calculation.
      var d = Game.player.recalc();
      hero.sprite = 'hero_' + cls.id;
      hero.atk = d.atk; hero.def = d.def; hero.spd = d.spd;
      hero.crit = d.crit; hero.critDmg = d.critDmg;
      hero.range = d.range; hero.projectile = d.projectile;
      hero.dodge = d.dodge; hero.lifesteal = d.lifesteal; hero.cdr = d.cdr;
      hero.shield = 0; hero.skillCd = {}; hero.recoverT = 0; hero.campWarp = null;
      return hero;
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
      h.atk = Math.round(d.atk * (1 + atkPct));
      h.def = Math.round(d.def * (1 + defPct));
      h.spd = +(d.spd * (1 + spdPct)).toFixed(2);
      h.crit = Math.min(0.95, d.crit + critAdd);
      h.critDmg = d.critDmg;
      h.range = d.range; h.projectile = d.projectile;
      h.dodge = d.dodge; h.lifesteal = d.lifesteal; h.cdr = d.cdr;
    },

    /* ---------------- 刷怪 ---------------- */
    spawnMonster: function (initial, threat) {
      var region = W.region;
      var candidates = threat ? [{ x: threat.x, y: threat.y, threatId: threat.id }] : W.layout.spawnCandidates;
      var fallback = W.layout.corridorCandidates;
      var point = null;
      for (var tries = 0; tries < 24 && candidates.length; tries++) {
        var candidate = U.choice(candidates);
        if (!W.hero || U.dist(candidate.x, candidate.y, W.hero.x, W.hero.y) >= (initial ? 130 : 110)) {
          point = candidate;
          break;
        }
      }
      if (!point && fallback.length) {
        for (var fi = 0; fi < fallback.length; fi++) {
          var fp = fallback[(fi + ((Math.random() * fallback.length) | 0)) % fallback.length];
          if (!W.hero || U.dist(fp.x, fp.y, W.hero.x, W.hero.y) >= 90) { point = fp; break; }
        }
      }
      if (!point) point = { x: W.layout.camp.x + W.layout.campSafeRadius + 36, y: W.layout.camp.y };
      var expeditionMod = threat && Game.expedition
        ? Game.expedition.currentModifier() : { danger: 1, exp: 1 };
      var affix = threat && (Game.expedition ? Game.expedition.threatAffix(threat.id) : threat.affix);
      var modifiers = [];
      if (expeditionMod.danger !== 1) {
        modifiers.push({ stat: 'maxHp', phase: 'multiply', operation: 'multiply', value: expeditionMod.danger });
        modifiers.push({ stat: 'physicalPower', phase: 'multiply', operation: 'multiply', value: Math.sqrt(expeditionMod.danger) });
        modifiers.push({ stat: 'magicPower', phase: 'multiply', operation: 'multiply', value: Math.sqrt(expeditionMod.danger) });
      }
      if (affix === 'sturdy') {
        modifiers.push({ stat: 'maxHp', phase: 'multiply', operation: 'multiply', value: 1.3 });
        modifiers.push({ stat: 'armor', phase: 'multiply', operation: 'multiply', value: 1.18 });
      } else if (affix === 'swift') {
        modifiers.push({ stat: 'gcdSpeed', phase: 'otherFlat', operation: 'add', value: 0.18 });
      } else if (affix === 'miasma') {
        modifiers.push({ stat: 'physicalPower', phase: 'multiply', operation: 'multiply', value: 1.18 });
        modifiers.push({ stat: 'magicPower', phase: 'multiply', operation: 'multiply', value: 1.18 });
      }
      var view = Game.content.populationView('population.' + region.id);
      var slotKey = threat && threat.id || 'candidate:respawn:' + W.compatSpawnSequence++;
      var profileIds = Game.population.allocate(region.id, 'regular', 1, {
        tier: Game.State.regionTier(region.id), worldSeed: Game.state.world.worldSeed,
        layoutVersion: W.layout.version
      });
      var result = profileIds[0] && Game.population.materialize(profileIds[0], {
        regionId: region.id, populationId: view.id, layoutSlotKey: slotKey,
        spawnRequestKey: [region.id, view.id, slotKey].join(':'),
        x: point.x, y: point.y, threat: threat || null,
        tier: Game.State.regionTier(region.id), modifiers: modifiers, affix: affix || null
      });
      if (!result || !result.ok) return null;
      result.actors.forEach(function (ent) {
        ent.exp = Math.round(ent.exp * (expeditionMod.exp || 1));
        W.entities.push(ent);
      });
      return result.primary;
    },

    spawnGuardian: function () {
      if (!W.layout || W.layout.version < 3 || !W.layout.guardian || !Game.exploration) return null;
      var state = Game.exploration.regionState(W.region.id);
      if (state.discovered.guardian) return null;
      var results = Game.population.mountChannel(W.region.id, 'guardian', W.layout, {
        tier: Game.State.regionTier(W.region.id), worldSeed: Game.state.world.worldSeed
      });
      var ent = results[0] && results[0].primary;
      if (!ent) return null;
      ent.guardian = true;
      ent.exp = Math.round(ent.exp * 6);
      ent.gold = Math.round(ent.gold * 4);
      ent.territory = W.layout.guardian;
      Array.prototype.push.apply(W.entities, results[0].actors);
      return ent;
    },

    makeMonster: function (mid, isBossFight, opts) {
      opts = opts || {};
      var tier = Game.State.regionTier(W.region && W.region.id);
      var ent = Game.actors.spawn({
        instanceId: 'compat:' + mid + ':' + W.compatSpawnSequence++,
        archetypeId: mid,
        variantId: opts.variantId || null,
        level: Math.max(1, Game.state.player.level),
        tier: tier,
        factionId: Game.content.get('actorArchetype', mid).defaultFactionId,
        controllerId: 'ai:monster',
        modifiers: opts.modifiers || [],
        transform: { x: 0, y: 0, direction: 'l' },
        spawnSource: { kind: 'compat', sourceId: W.region && W.region.id || 'region', sequence: W.compatSpawnSequence }
      });
      var reward = Game.content.get('rewardProfile', ent.blueprint.resolvedProfiles.rewardProfileId);
      function rewardValue(value) {
        if (typeof value === 'number') return value;
        return (Number(value && value.base) || 0) * Math.pow(Number(value && value.tierScale) || 1, tier - 1);
      }
      ent.state = 'wander';
      ent.crit = 0.03; ent.critDmg = 1.5;
      ent.exp = Math.round(rewardValue(reward && reward.exp));
      ent.gold = Math.round(rewardValue(reward && reward.gold));
      ent.rewardAuthorized = !!(Game.content.get('engagementPolicy', ent.blueprint.resolvedProfiles.engagementPolicyId) || {}).rewardEligible;
      ent.spriteH = Game.assets.sprite(ent.sprite).h;
      ent.animT = U.rand(0, 0.3);
      ent.wanderT = U.rand(0.5, 2);
      return ent;
    },

    /* ---------------- 讨伐进度 / Boss ---------------- */
    gaugeInfo: function () {
      var prog = Game.State.regionProg(W.region.id);
      if (W.layout && W.layout.version >= 3 && Game.exploration) {
        var ready = Game.exploration.readiness(W.region.id);
        return {
          kills: ready.total, target: 100, required: 70, cleared: prog.cleared,
          readiness: ready, lair: ready.lair
        };
      }
      return { kills: Math.min(prog.kills, W.region.killTarget), target: W.region.killTarget, cleared: prog.cleared };
    },

    trySpawnBoss: function (opts) {
      opts = opts || {};
      var manual = !!opts.manual;
      if (!manual && Game.state.settings.autoBoss === false) return false;
      if (Game.transitions && Game.transitions.isActive()) return false;
      if (W.bossEnt || Game.state.world.mode !== 'battle') return false;
      var region = W.region;
      var prog = Game.State.regionProg(region.id);
      if (W.layout.version >= 3 && Game.exploration) {
        var readiness = Game.exploration.readiness(region.id);
        var retryAt = Game.exploration.regionState(region.id).bossRetryAt || 0;
        if (!readiness.lair || readiness.total < 70 || Game.state.world.worldTime < retryAt) return false;
      } else if (prog.kills < region.killTarget) return false;
      // 状态不佳时暂缓登场，避免登场即团灭的循环
      var hero = W.hero;
      if (!hero || hero.state === 'dead' || hero.state === 'recover') return false;
      // 玩家主动发起时尊重其挑战意愿；自动讨伐仍等生命恢复到安全线。
      if (!manual && Game.player.hpPct() < (W.layout.version >= 3 ? 0.8 : 0.6)) return false;

      if (W.layout.version >= 3) {
        var lairDistance = U.dist(hero.x, hero.y, W.layout.bossPoint.x, W.layout.bossPoint.y);
        if (lairDistance > 74) {
          hero.moveOrder = {
            x: W.layout.bossPoint.x, y: W.layout.bossPoint.y,
            id: 'boss-lair:' + region.id, ai: !manual
          };
          hero.target = null;
          Game.nav.clear(hero);
          return true;
        }
      }

      var bossResults = Game.population.mountChannel(region.id, 'boss', W.layout, {
        tier: Game.State.regionTier(region.id), worldSeed: Game.state.world.worldSeed
      });
      var ent = bossResults[0] && bossResults[0].primary;
      if (!ent) return false;
      ent.state = 'entrance';
      ent.moving = false;
      Array.prototype.push.apply(W.entities, bossResults[0].actors);
      W.bossEnt = ent;

      // 登场演出：镜头拉近 + 震屏，双方短暂僵持
      W.cinematic = { ent: ent, t: 1.5 };
      if (W.hero.state !== 'recover') W.hero.state = 'entrance';
      W.hero.moveOrder = null;
      Game.nav.clear(W.hero);
      W.hero.manualTarget = false;
      W.hero.target = null;
      if (Game.fx) {
        Game.fx.shake(5, 0.9);
        Game.fx.banner('ui.bossAppear', { name: Game.i18n.t('monster.' + ent.mid + '.name') });
      }
      bus.emit('boss:spawned', { rid: region.id, mid: ent.mid });
      return true;
    },

    onBossDefeated: function (ent) {
      var region = W.region;
      var prog = Game.State.regionProg(region.id);
      var first = !prog.firstKill;
      prog.firstKill = true;
      prog.cleared = true;
      prog.kills = 0;
      W.bossEnt = null;
      var tier = Game.State.regionTier(region.id);
      if (first) Game.player.addCrystal(F.bossCrystal(tier));
      if (W.layout.version >= 3 && Game.expedition) Game.expedition.finish('boss-defeated', region.id);
      Game.state.meta.stats.bossKills++;
      if (Game.fx) Game.fx.shake(4, 0.6);
      bus.emit('boss:defeated', { rid: region.id, mid: ent.mid, first: first, tier: tier });
    },

    onBossFailed: function (reason) {
      var region = W.region;
      var prog = Game.State.regionProg(region.id);
      // 进度保留一半：撤场重攒，不清零（卡关不惩罚过头）
      prog.kills = Math.ceil(region.killTarget / 2);
      if (W.layout.version >= 3 && Game.exploration) {
        Game.exploration.regionState(region.id).bossRetryAt = Game.state.world.worldTime + 60;
        if (Game.expedition && reason !== 'retreat') Game.expedition.finish('boss-failed', region.id);
      }
      if (W.bossEnt) {
        if (W.bossEnt.encounterId) W.endEncounter('boss-failed');
        var failedSpawnId = W.bossEnt.spawnId;
        W.entities = W.entities.filter(function (entity) {
          return !failedSpawnId || entity.spawnId !== failedSpawnId;
        });
        if (failedSpawnId && Game.population) {
          Game.population.close(failedSpawnId, 'boss-failed', { despawn: true });
        } else if (Game.actors) {
          Game.actors.despawn(W.bossEnt.id, 'boss-failed');
        }
        W.bossEnt = null;
      }
      W.cinematic = null;
      bus.emit('boss:failed', { rid: region.id, reason: reason || 'defeat' });
    },

    /* ---------------- 地面掉落：生成 / 拾取 / 保底回收 ---------------- */
    spawnGroundLoot: function (drop, x, y, opts) {
      if (!drop || !W.region || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      var angle = U.rand(0, Math.PI * 2);
      var radius = U.rand(12, 24);
      var gx = U.clamp(x + Math.cos(angle) * radius, 18, W.region.world.w - 18);
      var gy = U.clamp(y + Math.sin(angle) * radius * 0.65, BOUND_TOP, W.region.world.h - 14);
      var rar = drop.category === 'equipment' && drop.item ? drop.item.rar : 1;
      var ground = {
        kind: 'groundLoot',
        id: 'loot:' + U.uid(),
        drop: drop,
        source: opts && opts.source || 'combat',
        x: gx, y: gy,
        fromX: x, fromY: y,
        age: 0,
        ttl: F.BAL.groundLootTtl,
        rar: rar,
        phase: U.rand(0, Math.PI * 2)
      };
      W.groundLoot.push(ground);
      bus.emit('loot:spawned', {
        id: ground.id, category: drop.category, rar: rar, x: gx, y: gy
      });
      while (W.groundLoot.length > F.BAL.groundLootCap) {
        W.settleGroundLoot(W.groundLoot[0], 'cap');
      }
      return true;
    },

    settleGroundLoot: function (ground, reason, pickedUp) {
      if (!ground) return null;
      var at = W.groundLoot.indexOf(ground);
      if (at < 0) return null;
      W.groundLoot.splice(at, 1);
      var got = Game.inv.commitDrop(ground.drop, {
        source: ground.source || 'combat'
      });
      if (pickedUp) {
        Game.state.meta.stats.pickups++;
        bus.emit('item:pickedUp', {
          id: ground.id,
          category: ground.drop.category,
          item: ground.drop.item || null,
          ref: ground.drop.id || null,
          reason: reason || 'proximity'
        });
        if (Game.fx) {
          var label = ground.drop.category === 'equipment' && ground.drop.item
            ? Game.ui.itemName(ground.drop.item)
            : Game.i18n.t('item.' + ground.drop.id + '.name');
          Game.fx.floatText(ground.x, ground.y - 14, label, {
            color: F.RARITY[ground.rar] ? ['#c5c9cf', '#70d070', '#63a8ed', '#bc78e8', '#f2a23c'][ground.rar] : '#ffffff',
            small: true
          });
          if (U.motionEnabled()) Game.fx.ring(ground.x, ground.y, 15, '#f2d37a');
        }
      }
      return got;
    },

    flushGroundLoot: function (reason) {
      var count = 0;
      while (W.groundLoot.length) {
        W.settleGroundLoot(W.groundLoot[0], reason || 'flush', false);
        count++;
      }
      if (W.hero && W.hero.interactOrder && W.hero.interactOrder.type === 'loot') {
        W.cancelInteraction('flushed');
      }
      return count;
    },

    nearestGroundLoot: function (x, y) {
      var best = null, distance = Infinity;
      for (var i = 0; i < W.groundLoot.length; i++) {
        var d = U.dist(x, y, W.groundLoot[i].x, W.groundLoot[i].y);
        if (d < distance) { distance = d; best = W.groundLoot[i]; }
      }
      return best ? { target: best, distance: distance } : null;
    },

    updateGroundLoot: function (dt) {
      for (var i = W.groundLoot.length - 1; i >= 0; i--) {
        var ground = W.groundLoot[i];
        ground.age += dt;
        if (ground.age >= ground.ttl) W.settleGroundLoot(ground, 'ttl', false);
      }
      if (Game.state.settings.groundLoot === false && W.groundLoot.length) {
        W.flushGroundLoot('setting');
      }
    },

    /* ---------------- 一次性交互指令（拾取 / 宝箱 / 采集 / 交易） ---------------- */
    startInteraction: function (order, explicit) {
      var hero = W.hero;
      if (!hero || !order || Game.state.world.mode !== 'battle') return false;
      if (Game.transitions && Game.transitions.isActive()) return false;
      if (Game.ending && Game.ending.isActive && Game.ending.isActive()) return false;
      if (W.bossEnt || hero.state === 'dead' || hero.state === 'recover' ||
          hero.state === 'entrance' || hero.state === 'warpOut' || hero.state === 'warpIn') return false;
      if (hero.target && !hero.target.dead && hero.target.hp > 0) return false;
      if (order.type === 'gather' && W.layout && W.layout.version >= 3 && Game.exploration) {
        var gatherTarget = order.target;
        if (!gatherTarget || !Game.exploration.isRevealed(gatherTarget.x, gatherTarget.y)) return false;
        if (!explicit && (!Game.environment || !Game.environment.autoNodeReady(gatherTarget))) return false;
      }
      hero.interactOrder = order;
      hero.moveOrder = null;
      hero.manualTarget = false;
      Game.nav.clear(hero);
      if (explicit) hero.interactOrder.explicit = true;
      return true;
    },

    cancelInteraction: function (reason) {
      var hero = W.hero;
      if (!hero || !hero.interactOrder) return false;
      var order = hero.interactOrder;
      if (order.type === 'gather' && order.phase === 'act' && Game.environment) {
        Game.environment.interruptGather(order, reason);
      }
      hero.interactOrder = null;
      Game.nav.clear(hero);
      if (hero.state === 'gather' || hero.state === 'opening') hero.state = 'idle';
      return true;
    },

    contactThreat: function (hero) {
      for (var i = 0; i < W.entities.length; i++) {
        var e = W.entities[i];
        if (!W.isHostileActor(hero, e)) continue;
        if (e.boss || e.engaged || U.dist(hero.x, hero.y, e.x, e.y) <= MELEE_RANGE + 10) return e;
      }
      return null;
    },

    updateInteraction: function (hero, dt) {
      var order = hero.interactOrder;
      if (!order) return false;
      if (W.bossEnt || Game.state.world.mode !== 'battle') {
        W.cancelInteraction('boss');
        return false;
      }
      var threat = W.contactThreat(hero);
      if (threat) {
        W.cancelInteraction('combat');
        hero.target = threat;
        return false;
      }
      var target = order.target;
      if (!target) { W.cancelInteraction('missing'); return false; }
      if (order.type === 'loot' && W.groundLoot.indexOf(target) < 0) {
        W.cancelInteraction('missing');
        return false;
      }
      if (order.type === 'chest' && Game.environment.chests().indexOf(target) < 0) {
        W.cancelInteraction('missing');
        return false;
      }
      if (order.type === 'gather' && !Game.environment.nodeReady(target)) {
        W.cancelInteraction('cooldown');
        return false;
      }
      if (order.type === 'trade') {
        target = Game.trade.areaById(order.areaId);
        order.target = target;
        if (!target) { W.cancelInteraction('missing'); return false; }
      }
      var distance = U.dist(hero.x, hero.y, target.x, target.y);
      var reach = order.type === 'trade' ? Math.max(8, target.radius - 4) : 26;
      if (distance > reach) {
        hero.state = 'walk';
        W.moveToward(hero, target.x, target.y, W.heroMoveSpeed(), dt, 'interact:' + (target.id || order.areaId));
        return true;
      }

      if (order.type === 'loot') {
        W.settleGroundLoot(target, order.explicit ? 'click' : 'proximity', true);
        hero.interactOrder = null;
        hero.state = 'idle';
        return true;
      }
      if (order.type === 'trade') {
        var openArea = order.areaId;
        var shouldOpen = order.open;
        hero.interactOrder = null;
        hero.state = 'idle';
        if (shouldOpen && Game.ui && Game.ui.trade) Game.ui.trade.open(openArea);
        return true;
      }
      if (order.phase !== 'act') {
        order.phase = 'act';
        order.timer = order.type === 'gather' ? F.BAL.gatherDuration : F.BAL.chestOpenDuration;
        hero.state = order.type === 'gather' ? 'gather' : 'opening';
        hero.dir = U.dirOf(target.x - hero.x, target.y - hero.y);
        if (order.type === 'gather') bus.emit('gather:start', { id: target.id, material: target.material });
      }
      order.timer -= dt;
      if (order.timer > 0) return true;
      if (order.type === 'gather') Game.environment.completeGather(target);
      hero.interactOrder = null;
      if (order.type === 'chest') {
        var chestResult = Game.environment.openChest(target);
        if (!chestResult || chestResult.outcome !== 'mimic') hero.state = 'idle';
      } else {
        hero.state = 'idle';
      }
      return true;
    },

    chooseAmbientInteraction: function (hero) {
      var loot = W.nearestGroundLoot(hero.x, hero.y);
      if (loot && (W.controlMode() === 'auto' || loot.distance <= 26)) {
        return W.startInteraction({ type: 'loot', target: loot.target }, false);
      }
      var chest = Game.environment && Game.environment.nearestChest(hero.x, hero.y);
      if (chest && (W.controlMode() === 'auto' || chest.distance <= 26)) {
        if (W.controlMode() !== 'auto' || !Game.environment.autoChestReady ||
            Game.environment.autoChestReady(chest.target)) {
          return W.startInteraction({ type: 'chest', target: chest.target }, false);
        }
      }
      if (W.controlMode() === 'auto' && Game.environment) {
        var node = Game.environment.nearestNode(hero.x, hero.y, 120);
        if (node) return W.startInteraction({ type: 'gather', target: node.target }, false);
      }
      return false;
    },

    /* ---------------- 击杀结算 ---------------- */
    onEntityKilled: function (ent, killer) {
      if ((ent.worldSpawnProfileId || ent.category === 'monster' || ent.category === 'summon') && !ent.rewardSettled) {
        ent.rewardSettled = true;
        ent.dead = true;
        ent.deathT = 0.5;
        ent.state = 'dying';
        var rewardAuthorized = ent.encounterRewardAuthorized !== undefined
          ? ent.encounterRewardAuthorized
          : ent.rewardAuthorized;

        if (rewardAuthorized) {
          Game.player.addExp(ent.exp);
          Game.player.addGold(ent.gold);
          if (Game.fx && U.motionEnabled()) Game.fx.goldBurst(ent.x, ent.y - 8);
          var expeditionDrop = W.layout.version >= 3 && Game.expedition
            ? Game.expedition.currentModifier().drop : 1;
          Game.inv.rollDrops(ent.tier, ent.boss, {
            source: ent.boss ? 'boss' : 'combat',
            x: ent.x,
            y: ent.y,
            luck: Math.max(0, (expeditionDrop - 1) * 2)
          });
          Game.state.meta.stats.kills++;
        }

        var closedLease = Game.population && Game.population.onActorDefeated(ent);

        if (!ent.boss) {
          var prog = Game.State.regionProg(W.region.id);
          if (rewardAuthorized && W.layout.version < 3 && !W.bossEnt) {
            prog.kills = Math.min(prog.kills + 1, W.region.killTarget);
          }
          if (ent.guardian && Game.collection) {
            Game.collection.record('guardian', 'guardian', { rid: W.region.id, entity: ent });
          } else if (closedLease && W.layout.version >= 3 && ent.territory) {
            var cooldown = ent.territory.respawn || 240;
            if (!W.settledPacks[ent.packAnchorId]) {
              W.settledPacks[ent.packAnchorId] = true;
              Game.exploration.regionState(W.region.id).threatCooldowns[ent.threatId] =
                Game.state.world.worldTime + cooldown;
            }
          }
          if (rewardAuthorized) Game.state.world.deathsRow = 0;
        }
        if (Game.fx && rewardAuthorized) {
          Game.fx.poof(ent.x, ent.y - ent.spriteH * 0.4);
          Game.fx.floatText(ent.x, ent.y - ent.spriteH - 6, '+' + Game.i18n.fmtNum(ent.exp) + ' EXP', { color: '#8ad0ff', small: true });
        }
        if (rewardAuthorized) bus.emit('monster:killed', { mid: ent.mid, boss: ent.boss, x: ent.x, y: ent.y });

        if (W.hero.target === ent) W.hero.target = null;
        if (ent.boss) W.onBossDefeated(ent);
      } else if (ent.actorRecordId === Game.state.roster.primaryActorId) {
        W.onHeroDeath();
      }
    },

    onHeroDeath: function () {
      var hero = W.hero;
      if (hero.state === 'dead' || hero.state === 'recover' ||
          (Game.transitions && Game.transitions.isActive())) return;
      var byBoss = !!W.bossEnt;
      var fallbackRid = null;
      var finalRegionLost = !!(
        Game.prog && Game.prog.isFinalRegion && Game.prog.isFinalRegion(W.region.id)
      );
      W.flushGroundLoot('death');
      W.cancelInteraction('death');
      W.endEncounter('player-defeated');
      Game.state.meta.stats.deaths++;

      if (byBoss) {
        W.onBossFailed('defeat'); // Boss 战失败不计入卡关计数
      }
      if (finalRegionLost) {
        // 魔王城不适用三连败保护：任意实际战败都会失守并退回上一地区。
        fallbackRid = Game.prog.lockFinalRegion(W.region.id, { byBoss: byBoss });
      } else if (!byBoss) {
        Game.state.world.deathsRow++;
        if (Game.state.world.deathsRow >= 3) {
          Game.state.world.deathsRow = 0;
          fallbackRid = Game.prog && Game.prog.prevRegion ? Game.prog.prevRegion() : null;
        }
      }
      if (Game.transitions) {
        Game.transitions.startDeath({
          byBoss: byBoss,
          fallbackRid: fallbackRid,
          finalRegionLost: finalRegionLost
        });
      } else {
        // 降级兼容：导演模块缺失时仍落回原有安全状态。
        hero.state = 'dead';
        hero.deathT = 1.0;
        hero.target = null;
        hero.moveOrder = null;
        Game.nav.clear(hero);
        hero.manualTarget = false;
        hero.campWarp = null;
        hero.shield = 0;
        hero.buffs = [];
        if (fallbackRid) {
          bus.emit('protect:fallback', {
            rid: W.region.id,
            fallbackRid: fallbackRid,
            finalRegionLost: finalRegionLost
          });
        }
      }
      bus.emit('player:death', {
        byBoss: byBoss,
        fallbackRid: fallbackRid,
        finalRegionLost: finalRegionLost
      });
    },

    /* ---------------- 点击/触摸指令 ---------------- */
    /** 点怪=锁定优先目标；点地=移动指令；点营地=扎营/拔营 */
    handleTap: function (wx, wy) {
      var hero = W.hero;
      if (!hero || !Game.player.hasClass()) return;
      if (Game.transitions && Game.transitions.isActive()) return;
      if (hero.state === 'dead' || hero.state === 'recover' || hero.state === 'entrance') return;
      var sw = Game.state.world;

      // 交易实体（≥30px 世界命中；三个入口共用 requestApproach）。
      if (Game.trade) {
        var areas = Game.trade.areas();
        for (var ai = 0; ai < areas.length; ai++) {
          if (!areas[ai].prop || U.dist(wx, wy, areas[ai].x, areas[ai].y) > 30) continue;
          var approach = Game.trade.requestApproach(areas[ai].id, {
            open: true,
            source: 'world'
          });
          if (!approach.ok && Game.ui && Game.ui.modals) {
            Game.ui.modals.toast(Game.i18n.t(
              approach.reason === 'busy' ? 'ui.tradeBusy' : 'ui.tradeUnavailableToast'
            ), 'warn');
          }
          return;
        }
      }

      // 地面物、宝箱、节点优先于点地移动；命中后走统一一次性交互指令。
      for (var li = 0; li < W.groundLoot.length; li++) {
        if (U.dist(wx, wy, W.groundLoot[li].x, W.groundLoot[li].y) <= 12) {
          W.startInteraction({ type: 'loot', target: W.groundLoot[li] }, true);
          return;
        }
      }
      if (Game.environment) {
        var chests = Game.environment.chests();
        for (var chi = 0; chi < chests.length; chi++) {
          if (U.dist(wx, wy, chests[chi].x, chests[chi].y) <= 16) {
            W.startInteraction({ type: 'chest', target: chests[chi] }, true);
            return;
          }
        }
        var nodes = W.layout.nodes || [];
        for (var ni = 0; ni < nodes.length; ni++) {
          if (U.dist(wx, wy, nodes[ni].x, nodes[ni].y) <= 18) {
            if (W.layout.version >= 3 && Game.exploration &&
                !Game.exploration.isRevealed(nodes[ni].x, nodes[ni].y)) return;
            if (Game.environment.nodeReady(nodes[ni])) {
              W.startInteraction({ type: 'gather', target: nodes[ni] }, true);
            }
            return;
          }
        }
      }

      // 营地交互（篝火附近）
      var cf = Game.terrain.campfirePos;
      if (cf && U.dist(wx, wy, cf.x, cf.y) < 30) {
        W.setMode(sw.mode === 'battle' ? 'rest' : 'battle');
        return;
      }

      // Actor 命中检测（以脚点与身体中心综合判定）。
      var best = null, bestD = 1e9;
      for (var i = 0; i < W.entities.length; i++) {
        var e = W.entities[i];
        if (!e || e === hero || e.dead || e.hazardConcealed || e.lifecycle !== 'active') continue;
        var d = Math.min(
          U.dist(wx, wy, e.x, e.y),
          U.dist(wx, wy, e.x, e.y - e.spriteH * 0.5)
        );
        var r = Math.max(12, e.spriteH * 0.6);
        if (d < r && d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        if (!W.isHostileActor(hero, best)) {
          var interactionId = best.blueprint &&
            best.blueprint.resolvedProfiles.interactionProfileId;
          var interaction = interactionId &&
            Game.content.get('interactionProfile', interactionId);
          if (interaction && interaction.actions && interaction.actions.length &&
              Game.ui && Game.ui.modals && Game.ui.modals.actorActions) {
            Game.ui.modals.actorActions(
              best,
              Game.interactions ? Game.interactions.handlers(best) : {}
            );
          }
          return;
        }
        if (sw.mode === 'rest') W.setMode('battle');
        W.cancelInteraction('combat');
        hero.target = best;
        hero.manualTarget = true;
        hero.moveOrder = null;
        Game.nav.clear(hero);
        if (Game.fx) Game.fx.ring(best.x, best.y - best.spriteH * 0.4, 12, '#f0c860');
        return;
      }

      // 地面移动指令
      if (sw.mode === 'rest') W.setMode('battle');
      W.cancelInteraction('move');
      hero.moveOrder = {
        x: U.clamp(wx, 18, W.region.world.w - 18),
        y: U.clamp(wy, BOUND_TOP, W.region.world.h - 14),
        id: 'tap:' + U.uid()
      };
      hero.target = null;
      hero.manualTarget = false;
      Game.nav.clear(hero);
    },

    /* ---------------- 自动 / 手动操控 ---------------- */
    controlMode: function () {
      return Game.state && Game.state.settings.controlMode === 'manual' ? 'manual' : 'auto';
    },

    setControlMode: function (mode) {
      mode = mode === 'manual' ? 'manual' : 'auto';
      if (!Game.state) return mode;
      var settings = Game.state.settings;
      if (settings.controlMode === mode) return mode;
      settings.controlMode = mode;
      moveKeys = {};

      var hero = W.hero;
      if (hero) {
        W.cancelInteraction('control');
        hero.target = null;
        hero.manualTarget = false;
        hero.moveOrder = null;
        Game.nav.clear(hero);
        var protectedState = hero.state === 'dead' || hero.state === 'recover' ||
          hero.state === 'entrance' || hero.state === 'warpOut' ||
          hero.state === 'warpIn' || Game.state.world.mode === 'rest' ||
          (Game.transitions && Game.transitions.isActive());
        if (!protectedState) hero.state = 'idle';
      }
      bus.emit('control:changed', { mode: mode });
      bus.emit('settings:changed', { key: 'controlMode', value: mode });
      return mode;
    },

    toggleControlMode: function () {
      return W.setControlMode(W.controlMode() === 'manual' ? 'auto' : 'manual');
    },

    bindControls: function () {
      if (controlsBound) return;
      controlsBound = true;
      var keyCodes = {
        KeyW: true, KeyA: true, KeyS: true, KeyD: true,
        ArrowUp: true, ArrowLeft: true, ArrowDown: true, ArrowRight: true
      };
      function canCapture(e) {
        var tag = e.target && e.target.tagName;
        return W.controlMode() === 'manual' &&
          !(Game.transitions && Game.transitions.isActive()) &&
          !(Game.ending && Game.ending.isActive()) &&
          Game.state && Game.state.world.mode === 'battle' &&
          tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' &&
          !(e.target && e.target.isContentEditable);
      }
      document.addEventListener('keydown', function (e) {
        if (!keyCodes[e.code] || !canCapture(e)) return;
        var firstPress = !moveKeys[e.code];
        moveKeys[e.code] = true;
        // 短按也给出一个小步进；持续按住仍由主循环平滑移动。
        if (firstPress && W.hero && W.canManualMove(W.hero)) {
          var v = W.manualMoveVector();
          W.hero.target = null;
          W.hero.manualTarget = false;
          W.hero.moveOrder = null;
          Game.nav.clear(W.hero);
          W.hero.state = 'walk';
          W.moveVector(W.hero, v.x, v.y, W.heroMoveSpeed(), 1 / 30);
        }
        e.preventDefault();
      });
      document.addEventListener('keyup', function (e) {
        if (!keyCodes[e.code]) return;
        delete moveKeys[e.code];
        if (W.controlMode() === 'manual') e.preventDefault();
      });
      window.addEventListener('blur', function () { moveKeys = {}; });
      bus.on('save:before', function () { W.flushGroundLoot('save'); });
      bus.on('region:travelStart', function () {
        W.endEncounter('travel');
        W.flushGroundLoot('travel');
        W.cancelInteraction('travel');
        if (Game.ui && Game.ui.trade) Game.ui.trade.close('travel');
      });
      bus.on('boss:spawned', function () { W.cancelInteraction('boss'); });
      bus.on('settings:changed', function (p) {
        if (p && p.key === 'groundLoot' && p.value === false) W.flushGroundLoot('setting');
        if (p && p.key === 'combatStrategy' && W.hero) {
          Game.combatAI.strategy(W.hero.id, p.value);
        }
      });
      bus.on('actor:defeated', function (event) {
        var id = event && event.targetActorIds && event.targetActorIds[0];
        var actor = id && Game.actors.get(id);
        if (!actor) return;
        if (actor.actorRecordId === Game.state.roster.primaryActorId) W.onHeroDeath();
        else if (actor.worldSpawnProfileId || actor.category === 'monster' || actor.category === 'summon') {
          W.onEntityKilled(actor, event.sourceActorId && Game.actors.get(event.sourceActorId));
        }
      });
      bus.on('encounter:ended', function () {
        if (!W.hero || !W.hero.components.vitals) return;
        if (Game.units) Game.units.commit(W.hero);
        else Game.state.player.hp = W.hero.hp;
        W.hero.target = null;
      });
    },

    canManualMove: function (hero) {
      return !!hero && Game.player.hasClass() &&
        !(Game.transitions && Game.transitions.isActive()) &&
        !(Game.ending && Game.ending.isActive()) &&
        Game.state.world.mode === 'battle' &&
        hero.state !== 'dead' && hero.state !== 'recover' &&
        hero.state !== 'entrance' && hero.state !== 'warpOut' &&
        hero.state !== 'warpIn';
    },

    manualMoveVector: function () {
      var x = 0, y = 0;
      if (moveKeys.KeyA || moveKeys.ArrowLeft) x--;
      if (moveKeys.KeyD || moveKeys.ArrowRight) x++;
      if (moveKeys.KeyW || moveKeys.ArrowUp) y--;
      if (moveKeys.KeyS || moveKeys.ArrowDown) y++;
      return { x: x, y: y };
    },

    /* ---------------- 模式切换（战斗 / 返回营地） ---------------- */
    setMode: function (mode, opts) {
      opts = opts || {};
      if (Game.transitions && Game.transitions.isActive()) return false;
      var w = Game.state.world;
      if (w.mode === mode) return false;
      var bossRetreat = mode === 'rest' && !!W.bossEnt;
      w.mode = mode;
      var hero = W.hero;
      if (mode === 'rest') {
        W.endEncounter('retreat');
        W.flushGroundLoot('rest');
        W.cancelInteraction('rest');
        // 先切换到安全模式，再撤掉 Boss，确保点击后的同一帧不再受击。
        if (bossRetreat) W.onBossFailed('retreat');
        hero.target = null;
        hero.manualTarget = false;
        hero.moveOrder = null;
        Game.nav.clear(hero);
        moveKeys = {};
        if (hero.state !== 'recover' && hero.state !== 'dead') W.startCampReturn(hero);
        bus.emit('rest:start');
      } else {
        W.cancelCampTeleport(hero);
        if (hero.state === 'sitting' || hero.state === 'goCamp') hero.state = 'idle';
        if (!opts.auto && W.autoCampCycle) {
          W.autoCampSuppressedUntil = w.worldTime + 120;
        }
        W.autoCampCycle = false;
        bus.emit('rest:end');
      }
      bus.emit('mode:changed', { mode: mode, bossRetreat: bossRetreat });
      return true;
    },

    campRestPoint: function () {
      return { x: W.layout.camp.x + 22, y: W.layout.camp.y + 22 };
    },

    /** HUD 使用同一距离阈值表达步行、传送、撤离和取消状态。 */
    campActionState: function () {
      var hero = W.hero;
      var mode = Game.state.world.mode;
      if (mode === 'rest') {
        if (hero && (hero.state === 'warpOut' || hero.state === 'warpIn')) {
          return { id: 'cancel-warp', label: 'ui.cancelCampWarp', hint: 'ui.cancelCampWarpHint', icon: 'icon_camp_warp' };
        }
        if (hero && hero.state === 'goCamp') {
          return { id: 'cancel-return', label: 'ui.cancelCampReturn', hint: 'ui.cancelCampReturnHint', icon: 'icon_camp_return' };
        }
        return { id: 'break-camp', label: 'ui.breakCamp', hint: 'ui.breakCampHint', icon: 'icon_camp_depart' };
      }
      if (W.bossEnt) {
        return { id: 'boss-retreat', label: 'ui.bossCampReturn', hint: 'ui.bossCampReturnHint', icon: 'icon_camp_retreat' };
      }
      var rest = W.campRestPoint();
      var distance = hero ? U.dist(hero.x, hero.y, rest.x, rest.y) : 0;
      if (distance > CAMP_WARP_DISTANCE) {
        return { id: 'teleport', label: 'ui.teleportCamp', hint: 'ui.teleportCampHint', icon: 'icon_camp_warp' };
      }
      return { id: 'return', label: 'ui.camp', hint: 'ui.campHint', icon: 'icon_camp_return' };
    },

    startCampReturn: function (hero) {
      var rest = W.campRestPoint();
      var distance = U.dist(hero.x, hero.y, rest.x, rest.y);
      if (distance <= CAMP_WARP_DISTANCE) {
        hero.campWarp = null;
        hero.state = 'goCamp';
        return false;
      }
      var landing = {
        x: U.clamp(rest.x + CAMP_APPROACH_DISTANCE, 18, W.region.world.w - 18),
        y: U.clamp(rest.y + 8, BOUND_TOP, W.region.world.h - 14)
      };
      hero.campWarp = {
        phase: 'out',
        t: CAMP_WARP_OUT_T,
        landingX: landing.x,
        landingY: landing.y
      };
      hero.state = 'warpOut';
      if (Game.fx) Game.fx.teleport(hero.x, hero.y, 'out');
      bus.emit('camp:teleport', { phase: 'out', x: hero.x, y: hero.y });
      return true;
    },

    cancelCampTeleport: function (hero) {
      if (!hero || (hero.state !== 'warpOut' && hero.state !== 'warpIn')) return false;
      hero.campWarp = null;
      hero.state = Game.state.world.mode === 'rest' ? 'goCamp' : 'idle';
      return true;
    },

    updateCampTeleport: function (hero, dt) {
      var warp = hero.campWarp;
      if (!warp) {
        hero.state = Game.state.world.mode === 'rest' ? 'goCamp' : 'idle';
        return;
      }
      if (Game.state.world.mode !== 'rest') {
        W.cancelCampTeleport(hero);
        return;
      }
      warp.t -= dt;
      if (warp.phase === 'out' && warp.t <= 0) {
        var carry = -warp.t;
        hero.x = warp.landingX;
        hero.y = warp.landingY;
        hero.stepAcc = 0;
        Game.nav.clear(hero);
        W.clampToWorld(hero);
        warp.phase = 'in';
        warp.t = CAMP_WARP_IN_T - carry;
        hero.state = 'warpIn';
        if (Game.render) Game.render.snapCamera(hero.x, hero.y);
        if (Game.fx) Game.fx.teleport(hero.x, hero.y, 'in');
        bus.emit('camp:teleport', { phase: 'in', x: hero.x, y: hero.y });
      }
      if (warp.phase === 'in' && warp.t <= 0) {
        hero.campWarp = null;
        hero.state = 'goCamp';
      }
    },

    updateAutoCamp: function (hero) {
      var s = Game.state, sw = s.world;
      if (sw.mode === 'rest') {
        if (W.autoCampCycle && hero.state === 'sitting' &&
            sw.restBuffT >= F.BAL.restBuffCap - 0.001) {
          W.setMode('battle', { auto: true });
        }
        return;
      }
      if (!s.settings.autoCampRest || W.controlMode() !== 'auto') return;
      if (sw.restBuffT > 0 || sw.worldTime < W.autoCampSuppressedUntil) return;
      if (W.bossEnt || W.cinematic || hero.target || hero.moveOrder || hero.interactOrder) return;
      if (hero.state === 'dead' || hero.state === 'recover' || hero.state === 'entrance' ||
          hero.state === 'warpOut' || hero.state === 'warpIn') return;
      var gauge = W.gaugeInfo();
      if (gauge.kills >= gauge.target) return;
      if (W.contactThreat(hero)) return;
      if (W.setMode('rest', { auto: true })) {
        W.autoCampCycle = true;
        bus.emit('camp:autoReturn', { rid: sw.region });
      }
    },

    /* ---------------- 主更新 ---------------- */
    update: function (dt) {
      var hero = W.hero;
      if (!hero) return;
      var sw = Game.state.world;

      if (Game.nav && Game.nav.update) Game.nav.update(2);
      W.syncHeroStats();
      if (Game.items) Game.items.update(dt);
      if (Game.environment) Game.environment.update(dt);
      W.updateGroundLoot(dt);
      W.updateAutoCamp(hero);

      // 自动讨伐开启时，进度满且状态安全才让 Boss 登场；关闭时等待手动按钮。
      if (Game.state.settings.autoBoss !== false) {
        if (W.layout.version < 3 ||
            U.dist(hero.x, hero.y, W.layout.bossPoint.x, W.layout.bossPoint.y) <= 78) {
          W.trySpawnBoss();
        }
      }

      // Boss 登场演出计时
      if (W.cinematic) {
        W.cinematic.t -= dt;
        if (W.cinematic.t <= 0) {
          var entranceBoss = W.cinematic.ent;
          W.cinematic = null;
          if (hero.state === 'entrance') hero.state = 'idle';
          if (entranceBoss && entranceBoss.state === 'entrance') entranceBoss.state = 'idle';
        }
      }

      W.updateHero(hero, dt);
      if (Game.hazards) Game.hazards.update(dt);

      // 怪物
      for (var i = W.entities.length - 1; i >= 0; i--) {
        var e = W.entities[i];
        if (e === hero || !e.components || !e.components.transform) continue;
        if (e.dead) {
          e.deathT -= dt;
          if (e.deathT <= 0) {
            W.detachActor(e.id, 'defeated');
            if (Game.actors) Game.actors.despawn(e.id, 'defeated');
          }
          continue;
        }
        W.updateMonster(e, dt);
      }
      Game.combat.update(dt);
      if (Game.merchants) Game.merchants.update(dt);
      if (hero.components.vitals) {
        if (Game.units) Game.units.commit(hero);
        else Game.state.player.hp = hero.hp;
      }

      var populationUpdate = Game.population.update(dt, sw.worldTime);
      populationUpdate.spawned.forEach(function (result) {
        delete W.settledPacks[result.lease.groupId];
        Array.prototype.push.apply(W.entities, result.actors);
      });

      // Legacy ad-hoc respawns remain for non-Population callers.
      for (var r = W.pendingRespawn.length - 1; r >= 0; r--) {
        var pending = W.pendingRespawn[r];
        if (typeof pending === 'number') W.pendingRespawn[r] -= dt;
        else pending.t -= dt;
        if ((typeof W.pendingRespawn[r] === 'number' && W.pendingRespawn[r] <= 0) ||
            (typeof W.pendingRespawn[r] === 'object' && W.pendingRespawn[r].t <= 0)) {
          var respawn = W.pendingRespawn.splice(r, 1)[0];
          if (!respawn || !respawn.lease) {
            W.spawnMonster(false, respawn && respawn.threat);
          }
        }
      }

      // 休整增益在战斗模式下倒计时
      if (sw.mode === 'battle' && sw.restBuffT > 0) {
        sw.restBuffT = Math.max(0, sw.restBuffT - dt);
      }
      if (Game.exploration) Game.exploration.update(dt);
      if (Game.terrain && Game.terrain.rebuildDynamicSpatial && W.layout.version >= 3) {
        Game.terrain.rebuildDynamicSpatial(W.entities.concat(W.groundLoot));
      }
    },

    /* ---------------- 主角 AI ---------------- */
    updateHero: function (hero, dt) {
      if (Game.transitions && Game.transitions.isActive()) return;
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
          hero.x = W.layout.camp.x + 26;
          hero.y = W.layout.camp.y + 24;
          Game.nav.clear(hero);
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
          if (Game.units) Game.units.restore(hero, { source: 'recover' });
          else Game.state.player.hp = hero.maxHp;
          hero.state = sw.mode === 'rest' ? 'goCamp' : 'idle';
        }
        return;
      }
      // Boss 登场僵直
      if (hero.state === 'entrance') return;
      // 远距回营传送：原地收束 → 营地外落地 → 短步行收尾
      if (hero.state === 'warpOut' || hero.state === 'warpIn') {
        W.updateCampTeleport(hero, dt);
        return;
      }

      /* ----- 休息模式 ----- */
      if (sw.mode === 'rest') {
        if (hero.state === 'goCamp') {
          var cx = W.layout.camp.x + 22, cy = W.layout.camp.y + 22;
          if (W.moveToward(hero, cx, cy, W.heroMoveSpeed(), dt, 'camp') < 4) {
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

      // 手动方向输入优先于点地路径和锁定目标
      if (W.controlMode() === 'manual') {
        var mv = W.manualMoveVector();
        if (mv.x || mv.y) {
          W.cancelInteraction('manual-move');
          hero.target = null;
          hero.manualTarget = false;
          hero.moveOrder = null;
          Game.nav.clear(hero);
          hero.state = 'walk';
          W.moveVector(hero, mv.x, mv.y, W.heroMoveSpeed(), dt);
          return;
        }
      }

      if (Game.expeditionAI && W.layout.version >= 3 && W.controlMode() === 'auto') {
        Game.expeditionAI.update(hero, dt);
      }

      // 新增互动统一优先级：接敌战斗 > 地面拾取 > 宝箱 > 采集 > 游走。
      if (hero.interactOrder) {
        if (W.updateInteraction(hero, dt)) return;
      }
      var existingTarget = hero.target;
      if (!existingTarget || existingTarget.dead || existingTarget.hp <= 0) {
        hero.target = null;
        if (W.chooseAmbientInteraction(hero) && W.updateInteraction(hero, 0)) return;
      }

      // 玩家移动指令：自动模式抵达后恢复 AI，手动模式抵达后原地待命
      if (hero.moveOrder) {
        var mo = hero.moveOrder;
        hero.state = 'walk';
        if (W.moveToward(hero, mo.x, mo.y, W.heroMoveSpeed(), dt, mo.id) < 5) {
          hero.moveOrder = null;
          hero.state = 'idle';
        }
        return;
      }

      // 选目标：Boss 优先，否则最近存活怪
      var target = hero.target;
      if (!target || target.hp <= 0 || target.dead) {
        hero.manualTarget = false;
        target = null;
        if (W.controlMode() === 'auto') {
          if (W.bossEnt && !W.bossEnt.dead) target = W.bossEnt;
          else if (W.layout.version < 3 || !Game.expeditionAI) {
            var best = 1e9;
            for (var i = 0; i < W.entities.length; i++) {
              var e = W.entities[i];
              if (!W.isHostileActor(hero, e)) continue;
              var d2 = U.dist(hero.x, hero.y, e.x, e.y);
              if (d2 < best) { best = d2; target = e; }
            }
          }
        }
        hero.target = target;
      }

      if (!target) {
        // 手动模式原地待命；自动模式无怪可打时闲逛
        if (W.controlMode() === 'manual') {
          hero.state = 'idle';
          return;
        }
        if (W.layout.version < 3) W.wanderTick(hero, dt, HERO_SPEED * 0.5);
        hero.state = hero.moving ? 'walk' : 'idle';
        return;
      }

      // 攻击距离：职业决定（远程站位输出）
      var range = (hero.range || MELEE_RANGE) + (target.boss ? 10 : 0);
      var distTo = U.dist(hero.x, hero.y, target.x, target.y);
      if (!hero.encounterId && distTo <= Math.max(84, range + 24)) {
        W.startEncounter(target);
      }
      var combatMove = hero.components.movement.intent;
      if (hero.encounterId) {
        hero.state = combatMove ? 'walk' : 'fight';
        hero.moving = !!combatMove;
        if (target) hero.dir = U.dirOf(target.x - hero.x, target.y - hero.y);
        return;
      }
      if (distTo > range) {
        hero.state = 'walk';
        W.moveToward(hero, target.x, target.y, W.heroMoveSpeed(), dt, target);
      } else {
        hero.state = 'fight';
        hero.dir = U.dirOf(target.x - hero.x, target.y - hero.y);
        target.engaged = true;
        hero.components.targeting.currentTargetId = target.id;
      }
    },

    /* ---------------- 怪物 AI ---------------- */
    updateMonster: function (e, dt) {
      if (e.hazardConcealed) {
        e.flash = Math.max(0, e.flash - dt);
        e.lungeT = Math.max(0, e.lungeT - dt);
        e.animT += dt;
        e.moving = false;
        e.state = 'idle';
        return;
      }
      if (e === W.bossEnt && !e.encounterId) {
        e.flash = Math.max(0, e.flash - dt);
        e.lungeT = Math.max(0, e.lungeT - dt);
        e.animT += dt;
        e.moving = false;
        e.state = W.cinematic && W.cinematic.ent === e ? 'entrance' : 'idle';
        return;
      }
      var hero = W.hero;
      var heroTargetable = hero && hero.state !== 'dead' && hero.state !== 'recover' &&
        Game.state.world.mode === 'battle' && Game.player.hasClass();
      if (e.encounterId && heroTargetable) {
        e.flash = Math.max(0, e.flash - dt);
        e.lungeT = Math.max(0, e.lungeT - dt);
        e.animT += dt;
        var intent = e.components.movement.intent;
        if (intent) {
          e.state = 'walk';
          e.moving = true;
        } else {
          e.moving = false;
          var actionState = e.components.actionState.state;
          e.state = actionState === 'casting' || actionState === 'resolving' ||
            actionState === 'recovering' ? 'fight' : 'idle';
        }
        var combatTarget = Game.combatAI.chooseTarget(Game.encounters.get(e.encounterId), e, { relation: 'hostile' });
        if (combatTarget) e.dir = U.dirOf(combatTarget.x - e.x, combatTarget.y - e.y);
        return;
      }
      W.updateAmbientActor(e, dt);
    },

    /**
     * 无战斗环境中的 Actor 巡游入口。正式世界与地图生成 Lab 共用同一
     * 导航/领地/扫掠逻辑；Lab 可传入 seeded RNG，避免复制演示专用移动。
     */
    updateAmbientActor: function (e, dt, options) {
      if (!e || !e.components || !e.components.transform) return false;
      options = options || {};
      e.flash = Math.max(0, e.flash - dt);
      e.lungeT = Math.max(0, e.lungeT - dt);
      e.animT += dt;
      e.engaged = false;
      if (e.state === 'fight') e.state = 'wander';
      var territoryRadius = W.monsterPatrolRadius(e);
      W.wanderTick(
        e, dt, MONSTER_WANDER_SPEED, e.spawnX, e.spawnY, territoryRadius,
        options.rng
      );
      return true;
    },

    /* ---------------- 移动辅助 ---------------- */
    moveVector: function (ent, dx, dy, speed, dt) {
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) return 0;
      dx /= len; dy /= len;
      speed /= Math.max(1, Game.terrain.costAt(ent.x, ent.y));
      dt = Math.min(Math.max(0, dt), 0.25);
      var ox = ent.x, oy = ent.y;
      var nx = dx * speed * dt, ny = dy * speed * dt;
      if (W.layout && W.layout.version >= 3) {
        var swept = Game.terrain.sweepMove(ent.x, ent.y, nx, ny, ent.kind === 'hero' ? 7 : 6);
        ent.x = swept.x; ent.y = swept.y;
      } else {
        ent.x += nx;
        ent.y += ny;
      }
      ent.dir = U.dirOf(dx, dy);
      ent.moving = true;
      W.clampToWorld(ent);
      var moved = U.dist(ox, oy, ent.x, ent.y);
      W.stepFx(ent, moved);
      if (ent.kind === 'hero' && Game.environment) Game.environment.recordHeroMovement(moved, dt);
      if (ent.kind === 'hero' && Game.merchants) Game.merchants.recordHeroMovement(moved, dt);
      if (ent.kind === 'hero' && moved > 0.01 && Game.exploration) Game.exploration.revealAt(ent.x, ent.y);
      return moved;
    },

    moveDirect: function (ent, tx, ty, speed, dt) {
      var dx = tx - ent.x, dy = ty - ent.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.5) return 0;
      speed /= Math.max(1, Game.terrain.costAt(ent.x, ent.y));
      dt = Math.min(Math.max(0, dt), 0.25);
      var step = Math.min(d, speed * dt);
      if (W.layout && W.layout.version >= 3) {
        var swept = Game.terrain.sweepMove(ent.x, ent.y, dx / d * step, dy / d * step, ent.kind === 'hero' ? 7 : 6);
        ent.x = swept.x; ent.y = swept.y;
        step = swept.moved;
      } else {
        ent.x += dx / d * step;
        ent.y += dy / d * step;
      }
      ent.dir = U.dirOf(dx, dy);
      ent.moving = true;
      W.clampToWorld(ent);
      W.stepFx(ent, step);
      if (ent.kind === 'hero' && Game.environment) Game.environment.recordHeroMovement(step, dt);
      if (ent.kind === 'hero' && Game.merchants) Game.merchants.recordHeroMovement(step, dt);
      if (ent.kind === 'hero' && step > 0.01 && Game.exploration) Game.exploration.revealAt(ent.x, ent.y);
      return d - step;
    },

    moveToward: function (ent, tx, ty, speed, dt, token) {
      if (!Game.nav || !Game.nav.finder) return W.moveDirect(ent, tx, ty, speed, dt);
      return Game.nav.step(ent, tx, ty, speed, dt, token, W.moveDirect);
    },

    wanderTick: function (ent, dt, speed, ax, ay, radius, rng) {
      ent.wanderT = (ent.wanderT || 0) - dt;
      var cx = ax !== undefined ? ax : ent.x;
      var cy = ay !== undefined ? ay : ent.y;
      var r = radius === undefined ? 90 : Math.max(0, radius);
      var random = typeof rng === 'function'
        ? function (min, max) { return min + (max - min) * rng(); }
        : U.rand;
      var invalidTarget = !Number.isFinite(ent.wx) || !Number.isFinite(ent.wy) ||
        U.dist(ent.wx, ent.wy, cx, cy) > r + 0.01;
      if (ent.wanderT <= 0 || invalidTarget) {
        ent.wanderT = random(1.6, 4.2);
        ent.wx = U.clamp(cx + random(-r, r), 30, W.region.world.w - 30);
        ent.wy = U.clamp(cy + random(-r, r), BOUND_TOP + 16, W.region.world.h - 20);
        var wanderDx = ent.wx - cx, wanderDy = ent.wy - cy;
        var wanderDistance = Math.sqrt(wanderDx * wanderDx + wanderDy * wanderDy);
        if (wanderDistance > r && wanderDistance > 0) {
          ent.wx = cx + wanderDx / wanderDistance * r;
          ent.wy = cy + wanderDy / wanderDistance * r;
        }
        ent.wanderKey = (ent.wanderKey || 0) + 1;
      }
      var d = U.dist(ent.x, ent.y, ent.wx, ent.wy);
      if (d > 5) {
        W.moveToward(ent, ent.wx, ent.wy, speed, dt, 'wander:' + ent.wanderKey);
        if (ent.kind !== 'hero') ent.state = 'walk';
      } else if (ent.kind !== 'hero') {
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

    BOUND_TOP: BOUND_TOP,
    CAMP_WARP_DISTANCE: CAMP_WARP_DISTANCE
  };
})();
