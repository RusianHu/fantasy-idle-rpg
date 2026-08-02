(function () {
  'use strict';
  var Game = window.Game;

  var REGION_IDS = [
    'grassland', 'forest', 'mine', 'graveyard',
    'snowpass', 'lavacave', 'skyruins', 'darkcastle'
  ];

  var MERCHANTS = [
    {
      id: 'windbell_lia', spriteId: 'merchant_windbell_lia', portraitId: 'face_merchant_windbell_lia',
      regions: ['grassland', 'forest'], materials: ['herb', 'berry', 'mushroom', 'resin'],
      affixes: ['spd', 'exp_pct'], signatureAbilityId: 'merchant.windbell_tonic',
      accent: '#6fd3a6'
    },
    {
      id: 'copperwheel_brum', spriteId: 'merchant_copperwheel_brum', portraitId: 'face_merchant_copperwheel_brum',
      regions: ['mine', 'graveyard'], materials: ['ore', 'crystal_cluster', 'ghost_flower', 'grave_dust'],
      affixes: ['def_flat', 'gold_pct'], signatureAbilityId: 'merchant.copper_guard',
      accent: '#d69a58'
    },
    {
      id: 'frostflame_saph', spriteId: 'merchant_frostflame_saph', portraitId: 'face_merchant_frostflame_saph',
      regions: ['snowpass', 'lavacave'], materials: ['ice_crystal', 'frost_herb', 'fire_core', 'obsidian'],
      affixes: ['hp_pct', 'critdmg'], signatureAbilityId: 'merchant.frostfire_flask',
      accent: '#75bde8'
    },
    {
      id: 'starkey_noa', spriteId: 'merchant_starkey_noa', portraitId: 'face_merchant_starkey_noa',
      regions: ['skyruins', 'darkcastle'], materials: ['rune_stone', 'aether_shard', 'miasma_crystal', 'demon_horn'],
      affixes: ['crit', 'critdmg'], signatureAbilityId: 'merchant.starkey_ward',
      accent: '#b58ae8'
    }
  ];

  var dialogueStates = [
    'first', 'return', 'region', 'weather', 'lowHp', 'favored',
    'wary', 'refused', 'haggle', 'poor', 'assault', 'spared', 'restitution'
  ];

  var archetypes = [];
  var variants = [];
  var encounterPacks = [];
  var spawns = [];
  var profiles = [];
  var stockPools = [];
  var dialogues = [];

  MERCHANTS.forEach(function (merchant) {
    var actorId = 'npc.merchant.' + merchant.id;
    var variantId = actorId + '.defending';
    var spawnId = 'spawn.merchant.' + merchant.id;
    var profileId = 'merchant.' + merchant.id;
    var stockPoolId = 'merchant-stock.' + merchant.id;
    var dialogueId = 'dialogue.merchant.' + merchant.id;
    var states = {};
    dialogueStates.forEach(function (state) {
      states[state] = [
        { lineKey: 'merchant.dialogue.' + merchant.id + '.' + state + '.0' },
        { lineKey: 'merchant.dialogue.' + merchant.id + '.' + state + '.1' }
      ];
    });

    archetypes.push({
      id: actorId, category: 'npc', rank: 'normal',
      identity: {
        nameKey: 'merchant.' + merchant.id + '.name',
        descKey: 'merchant.' + merchant.id + '.desc',
        loreKey: 'merchant.' + merchant.id + '.lore'
      },
      presentation: {
        spriteId: merchant.spriteId, portraitId: merchant.portraitId,
        scale: 1, renderProfileId: 'render.actor.npc'
      },
      body: { size: 'medium', collisionRadius: 8, movementTypes: ['ground'] },
      tags: ['merchant', 'wandering-merchant', 'nonlethal'],
      defaultFactionId: 'merchant_guild',
      statProfileId: 'stats.npc',
      abilityGrantIds: [], traitIds: [],
      interactionProfileId: 'interaction.wandering-merchant',
      engagementPolicyId: 'engagement.wandering-merchant'
    });
    variants.push({
      id: variantId, archetypeId: actorId,
      overrides: {
        statProfileId: 'stats.wandering-merchant',
        abilityGrantIds: [
          'merchant.staff_strike', merchant.signatureAbilityId, 'merchant.escape'
        ],
        aiProfileId: 'ai.monster.standard',
        resistanceProfileId: 'resist.standard',
        rewardProfileId: 'reward.none',
        presentation: {
          spriteId: merchant.spriteId, portraitId: merchant.portraitId,
          scale: 1, renderProfileId: 'render.actor.standard'
        },
        interactionProfileId: 'interaction.hostile',
        engagementPolicyId: 'engagement.wandering-merchant',
        tags: ['merchant', 'wandering-merchant', 'nonlethal', 'defending']
      },
      transitions: [{
        from: null, to: variantId, triggerId: 'provoked',
        timing: 'outOfEncounter', activeAction: 'defer', persistence: 'none'
      }]
    });
    encounterPacks.push({
      id: 'encounter-pack.merchant.' + merchant.id,
      members: [{
        slotId: 'merchant',
        archetypeId: actorId,
        variantId: variantId
      }],
      formation: { spacing: 0 },
      leashRadius: 110,
      rewardBudget: 0,
      groupAlert: false
    });
    spawns.push({
      id: spawnId,
      actorRef: { archetypeId: actorId },
      onProvokedVariantId: variantId,
      encounterPackIdOnProvoked: 'encounter-pack.merchant.' + merchant.id,
      mountTo: [],
      identity: {
        scope: 'ephemeral',
        socialGroupId: 'social.merchant-guild'
      },
      placement: {
        selector: 'candidate', source: 'walkableNav', required: false,
        onFailure: 'skipOptional', minClearance: 48, maxDanger: 0.72,
        minCampDistance: 140, occupancyRadius: 28
      },
      lifecycle: {
        activation: 'scripted', unload: 'despawn',
        onDefeat: 'closeLease', onEscape: 'closeLease',
        respawn: { mode: 'none', resetVariant: true }
      },
      offlineEligible: false
    });
    stockPools.push({
      id: stockPoolId,
      materials: merchant.materials,
      signatureAffixes: merchant.affixes,
      staplePotionIds: ['potion_small', 'potion_large']
    });
    dialogues.push({ id: dialogueId, states: states });
    profiles.push({
      id: profileId,
      regionIds: merchant.regions,
      spawnProfileId: spawnId,
      stockPoolId: stockPoolId,
      dialogueProfileId: dialogueId,
      presentation: {
        nameKey: 'merchant.' + merchant.id + '.name',
        descKey: 'merchant.' + merchant.id + '.desc',
        portraitId: merchant.portraitId,
        accent: merchant.accent,
        wagonSpriteId: 'trade_wagon_wander'
      }
    });
  });

  function merchantEncounter(regionId) {
    return {
      id: 'encounter.merchant-assault.' + regionId,
      regionId: regionId,
      rulesProfileId: 'core.rules.standard-v1',
      teamSlots: [
        {
          id: 'party', role: 'combatant', coalitionId: 'party',
          countsForCompletion: true, rewardEligible: false
        },
        {
          id: 'enemy', role: 'combatant', coalitionId: 'merchant',
          countsForCompletion: true, rewardEligible: false
        }
      ],
      relationMatrix: {
        party: { enemy: 'hostile' },
        enemy: { party: 'hostile' }
      },
      objectives: [{
        id: 'merchant-surrenders', type: 'surrender',
        teamId: 'enemy', required: true
      }],
      completionPolicy: { mode: 'allRequired' },
      presentation: { kind: 'merchant-assault' }
    };
  }

  Game.content.registerPack({
    id: 'world.merchants', version: '1.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/world/merchants.pack.js',
    requires: [
      { id: 'core.combat', range: '^2.0.0' },
      { id: 'region.grassland', range: '^2.0.0' },
      { id: 'region.forest', range: '^2.0.0' },
      { id: 'region.mine', range: '^2.0.0' },
      { id: 'region.graveyard', range: '^2.0.0' },
      { id: 'region.snowpass', range: '^2.0.0' },
      { id: 'region.lavacave', range: '^2.0.0' },
      { id: 'region.skyruins', range: '^2.0.0' },
      { id: 'region.darkcastle', range: '^2.0.0' }
    ],
    locales: {
      'zh-CN': {
        merchant: {
          windbell_lia: {
            name: '风铃药贩·莉娅',
            desc: '循着草木气息旅行的药剂商。',
            lore: '风铃响处，总有一辆装满药草、地图和旧故事的青篷马车。'
          },
          copperwheel_brum: {
            name: '铜轮匠贩·布鲁姆',
            desc: '收购矿物与遗物的矮人工匠。',
            lore: '他坚持每件货都该经得住锤击，也坚持每笔账都要精确到最后一枚铜币。'
          },
          frostflame_saph: {
            name: '霜火旅商·赛芙',
            desc: '往返极寒与熔火之地的生存专家。',
            lore: '她的货箱一半结霜，一半温热，据说从未在暴风雪里走失。'
          },
          starkey_noa: {
            name: '星钥商·诺亚',
            desc: '贩卖奥术饰物的沉默旅行者。',
            lore: '没人知道她从浮空遗迹带走了什么，只知道她总能打开不该存在的箱柜。'
          },
          dialogue: {
            windbell_lia: {
              first: ['风铃先替我打了招呼。需要药剂，还是一件走远路的装备？', '第一次见面就别拘谨，旅行人靠互相照应。'],
              return: ['又见面了。看来你和我的车轮一样闲不下来。', '我替你留了些新鲜货，至少它们还没沾上太多尘土。'],
              region: ['这里的草木会说话，只是大多数冒险者走得太快。', '沿着干燥的地脊走，鞋底和药瓶都会轻松些。'],
              weather: ['风向正在变，药草的气味比路标更可靠。', '这种天气适合赶路，不适合把药瓶摔在石头上。'],
              lowHp: ['你的脸色比空药瓶还糟，先看看补给吧。', '英雄也得止血。逞强不能算作护甲。'],
              favored: ['老朋友的价格，不必再让我拨算盘。', '商会里有人夸你守信用，我难得同意他们一次。'],
              wary: ['货可以看，手请放在我看得见的地方。', '风铃会记住粗暴的人，我也会。'],
              refused: ['今天不谈生意。先把商会的旧账结清。', '车轮愿意继续走，信任却没那么容易修好。'],
              haggle: ['好吧，只换普通货架；柜里的珍品不动。', '你付的是重新拆箱的工钱，不是好运本身。'],
              poor: ['金币不够时，看看也不收费。', '别拿生命去凑差价，下一次重逢还有机会。'],
              assault: ['风铃已经发出警告。再近一步，我就不把你当客人。', '商人不是怪物，货箱也不是战利品。'],
              spared: ['至少你最后还记得什么叫克制。', '我会记住这一刀，也会记住你收回了下一刀。'],
              restitution: ['账清了，路还长。别让我再写第二张。', '赔偿能修车，之后的信用得靠行动修。']
            },
            copperwheel_brum: {
              first: ['看货先看铆钉，谈价先报金币。规矩简单。', '矿石、护甲、旧遗物——别拿镀铜的废铁糊弄我。'],
              return: ['脚步声还是你，至少没带一车假矿。', '我又敲过一遍货架，这次每件都能上战场。'],
              region: ['石头会留下比人更诚实的记录。', '墓地里的金属要先净化，再谈估价。'],
              weather: ['潮气会毁皮带，但毁不了好钢。', '天色再差，铜轮也照样转。'],
              lowHp: ['你需要护甲，不是墓碑。', '站不稳就别谈输出，先把命保住。'],
              favored: ['可靠的人拿可靠的价格。', '你的信用比一些所谓贵金属硬得多。'],
              wary: ['别碰锤子，也别靠货箱太近。', '我卖防具，不代表我没穿防具。'],
              refused: ['旧账没清，柜门不开。', '先赔车，再谈货。顺序不能反。'],
              haggle: ['拆四个普通箱，工钱先付。', '只重排外架，珍藏柜一枚螺丝都不动。'],
              poor: ['金币不够就去挖，矿坑从不赊账。', '好装备等得起，冒失的人等不起。'],
              assault: ['我的锤子既能修车，也能修正坏主意。', '最后一次警告：放下武器。'],
              spared: ['你停手得晚，但总比不停好。', '铜轮有凹痕，账本也有。'],
              restitution: ['金币数目正确。信用还得重新锻。', '车修好了，下一次别让我修你。']
            },
            frostflame_saph: {
              first: ['能穿过雪与火的人，值得看一眼我的货。', '别问箱子为什么一半结霜，问了会更冷。'],
              return: ['你还活着，很好；我的回头客不该太短命。', '又一段恶路，又一次见面。'],
              region: ['这里的寒意会钻进扣带，检查装备。', '熔火最会惩罚轻视补给的人。'],
              weather: ['风暴前的安静不值得信任。', '空气太干，火星会比怪物先追上你。'],
              lowHp: ['你的呼吸不稳，先买能让它继续的东西。', '活着离开，才有资格嫌价格高。'],
              favored: ['我给能走完全程的人留了好价。', '商路很长，可靠的同行者很少。'],
              wary: ['别试探我的耐心，它比冰层薄。', '我允许你看货，不代表我背对着你。'],
              refused: ['赔偿之前，没有交易。', '霜能融，旧账不会自己消失。'],
              haggle: ['我重新开四只外箱，只此一次。', '钱是搬箱费，别把它叫好运税。'],
              poor: ['缺钱总比缺命好，先别乱买。', '下一段路还会产出金币，只要你能回来。'],
              assault: ['我在暴风雪里也没丢过货，更不会丢给你。', '靠近一步，霜火就不再只是名字。'],
              spared: ['你终于冷静了。代价仍然存在。', '我收下你的克制，不会忘记你的冲动。'],
              restitution: ['债务融了，戒心还在。', '这次算清；下一次用正常交易说话。']
            },
            starkey_noa: {
              first: ['星轨说我们会见面，却没说你会买什么。', '柜里的东西都有来历，只是不都适合讲。'],
              return: ['轨迹再次交汇。你比预测中准时。', '我换了货，没有换掉对你的记忆。'],
              region: ['遗迹上方的光并不全是星光。', '越靠近魔王城，越要分清力量和诱饵。'],
              weather: ['气流里的魔力正在偏折。', '今天的星光不稳定，货箱倒很稳定。'],
              lowHp: ['你的生命线正在变短。先修正它。', '预言不是护盾，药剂也许是。'],
              favored: ['可信之人的轨迹值得一点折扣。', '珍藏柜愿意为你多开一层锁。'],
              wary: ['我看见过这条危险的分支。别继续。', '交易可以继续，信任暂时不行。'],
              refused: ['这条轨迹先通向赔偿。', '柜锁不会为欠债者打开。'],
              haggle: ['外层货架重新排列，星钥只转一次。', '结果改变了，珍藏柜没有。'],
              poor: ['缺少货币也是一种明确答案。', '不购买不会改变星轨，抢夺会。'],
              assault: ['你正在选择最昂贵的那条路。', '收剑。下一刻的结果仍可改变。'],
              spared: ['轨迹没有坠入最坏的结局。', '克制保住了你最后一点信用。'],
              restitution: ['债务归零，概率重新开始。', '账已清；信任仍需要新的证据。']
            }
          }
        },
        combat: { ability: {
          merchant_staff_strike: { name: '护货杖击' },
          merchant_windbell_tonic: { name: '风铃秘药' },
          merchant_copper_guard: { name: '铜轮架势' },
          merchant_frostfire_flask: { name: '霜火瓶' },
          merchant_starkey_ward: { name: '星钥护壁' },
          merchant_escape: { name: '烟幕撤离' }
        } }
      },
      en: {
        merchant: {
          windbell_lia: {
            name: 'Lia Windbell', desc: 'A potion seller who follows the scent of wild herbs.',
            lore: 'Where her bell rings, a teal wagon of herbs, maps, and old road stories is nearby.'
          },
          copperwheel_brum: {
            name: 'Brum Copperwheel', desc: 'A dwarven smith who buys ore and relics.',
            lore: 'Every item must survive his hammer, and every account must balance to the last coin.'
          },
          frostflame_saph: {
            name: 'Saph Frostflame', desc: 'A survival trader of frozen passes and molten roads.',
            lore: 'Half her cargo is rimed with frost and half stays warm; she has never been lost in a blizzard.'
          },
          starkey_noa: {
            name: 'Noa Starkey', desc: 'A quiet traveler dealing in arcane ornaments.',
            lore: 'No one knows what she removed from the sky ruins, only that she opens impossible cabinets.'
          },
          dialogue: {
            windbell_lia: {
              first: ['The bell greeted you first. Potions, or gear for the long road?', 'No need for ceremony. Travelers survive by helping each other.'],
              return: ['We meet again. Your boots wander as much as my wheels.', 'Fresh stock today, or at least stock with less dust.'],
              region: ['The plants speak here. Most adventurers simply walk too fast.', 'Keep to the dry ridge and both your boots and bottles will fare better.'],
              weather: ['The wind is turning; herbs read it better than signposts.', 'Good weather for travel, poor weather for dropping bottles.'],
              lowHp: ['You look worse than an empty vial. Start with supplies.', 'Heroes need bandages too. Bravado is not armor.'],
              favored: ['A road-friend deserves a road-friend price.', 'The guild says you keep faith. For once, I agree with them.'],
              wary: ['You may look. Keep your hands where I can see them.', 'The bell remembers violence. So do I.'],
              refused: ['No trade today. Settle the guild account first.', 'Wheels keep moving. Trust takes longer to mend.'],
              haggle: ['Fine. The common shelves change; the cabinet does not.', 'You are paying for unpacking, not for luck itself.'],
              poor: ['Looking costs nothing when coin runs short.', 'Do not wager your life for a price gap. We may meet again.'],
              assault: ['The bell has warned you. One more step and you are no customer.', 'Merchants are not monsters, and cargo is not loot.'],
              spared: ['At least you remembered restraint before the end.', 'I remember the blow—and that you withheld the next one.'],
              restitution: ['The account is clear. The road is long. Do not make me write another.', 'Coin repairs wagons. Conduct repairs credit.']
            },
            copperwheel_brum: {
              first: ['Check the rivets, state your coin. Simple rules.', 'Ore, armor, old relics—do not bring me plated scrap.'],
              return: ['Those footsteps again. At least you brought no false ore.', 'I hammered the shelves twice. Everything here is field-worthy.'],
              region: ['Stone keeps a more honest record than people.', 'Grave metal is cleansed before it is priced.'],
              weather: ['Damp ruins leather straps, not good steel.', 'Bad sky or fair, the copper wheel turns.'],
              lowHp: ['You need armor, not a headstone.', 'If you cannot stand, stop discussing damage and preserve your life.'],
              favored: ['Reliable folk get reliable prices.', 'Your credit is harder than some so-called precious metals.'],
              wary: ['Do not touch the hammer or crowd the crates.', 'Selling armor does not mean I am not wearing any.'],
              refused: ['Old debt first. Cabinet second.', 'Repair the wagon before discussing the cargo.'],
              haggle: ['Four common crates, reopened. Labor paid first.', 'Outer shelf only. Not one screw leaves the cabinet.'],
              poor: ['Short on coin? Mine it. The shaft offers no credit.', 'Good gear can wait. Reckless people cannot.'],
              assault: ['This hammer repairs wagons and bad ideas.', 'Final warning. Lower the weapon.'],
              spared: ['Late restraint is still restraint.', 'The wheel is dented. So is the ledger.'],
              restitution: ['The count is correct. Credit must be forged again.', 'Wagon repaired. Next time, do not make me repair you.']
            },
            frostflame_saph: {
              first: ['Anyone crossing snow and fire may inspect my cargo.', 'Do not ask why half the crate is frozen. The answer is colder.'],
              return: ['Still alive. Good—my returning customers should not be brief.', 'Another hard road, another meeting.'],
              region: ['Cold works into every buckle. Check your kit.', 'Molten roads punish anyone who dismisses supplies.'],
              weather: ['The quiet before a storm is not trustworthy.', 'The air is dry. Sparks may chase you before monsters do.'],
              lowHp: ['Your breathing is uneven. Buy what keeps it going.', 'Leave alive before complaining about prices.'],
              favored: ['I save a fair price for those who finish the road.', 'Trade routes are long. Reliable company is rare.'],
              wary: ['Do not test my patience. It is thinner than ice.', 'You may inspect the goods. I will not turn my back.'],
              refused: ['No restitution, no trade.', 'Frost melts. Debt does not melt itself.'],
              haggle: ['Four outer crates, once only.', 'The fee moves boxes. Do not call it a luck tax.'],
              poor: ['Better short of coin than short of life.', 'The road makes more gold if you live to return.'],
              assault: ['I never lost cargo to a blizzard. I will not lose it to you.', 'One more step and Frostflame stops being a name.'],
              spared: ['You finally cooled down. The cost remains.', 'I accept the restraint. I remember the impulse.'],
              restitution: ['Debt melted. Caution remains.', 'Settled. Next time, speak through honest trade.']
            },
            starkey_noa: {
              first: ['The stars predicted our meeting, not your purchase.', 'Everything here has a history. Not every history should be told.'],
              return: ['Our paths intersect again. You are unusually punctual.', 'The stock changed. My memory of you did not.'],
              region: ['Not every light above the ruins is a star.', 'Near the Demon Castle, distinguish power from bait.'],
              weather: ['Magic in the air is refracting.', 'The starlight is unstable. The cabinet is not.'],
              lowHp: ['Your life-line is shortening. Correct it first.', 'Prophecy is not a shield. A potion might be.'],
              favored: ['A trustworthy path merits a small discount.', 'The cabinet opens one lock farther for you.'],
              wary: ['I have seen where this dangerous branch leads.', 'Trade may continue. Trust may not.'],
              refused: ['This path reaches restitution first.', 'The cabinet does not open for debtors.'],
              haggle: ['The outer shelf realigns. The key turns once.', 'The outcome changed. The cabinet did not.'],
              poor: ['Insufficient currency is also a clear answer.', 'Declining does not change the stars. Theft does.'],
              assault: ['You are choosing the most expensive path.', 'Lower the blade. The next outcome can still change.'],
              spared: ['The path avoided its worst ending.', 'Restraint preserved the last of your credit.'],
              restitution: ['Debt returns to zero. Probability begins again.', 'The account is clear. Trust still needs evidence.']
            }
          }
        },
        combat: { ability: {
          merchant_staff_strike: { name: 'Cargo Staff' },
          merchant_windbell_tonic: { name: 'Windbell Tonic' },
          merchant_copper_guard: { name: 'Copperwheel Guard' },
          merchant_frostfire_flask: { name: 'Frostfire Flask' },
          merchant_starkey_ward: { name: 'Starkey Ward' },
          merchant_escape: { name: 'Smoke Retreat' }
        } }
      }
    },
    definitions: {
      faction: [{
        id: 'merchant_guild',
        relations: {
          adventurers: 'neutral', merchant_guild: 'ally',
          wild: 'neutral', wildlife: 'neutral', undead: 'neutral',
          ruin_guardians: 'neutral', demons: 'neutral'
        }
      }],
      interactionProfile: [{
        id: 'interaction.wandering-merchant',
        actions: [
          { id: 'talk', kind: 'talk', primary: true },
          { id: 'trade', kind: 'trade' },
          { id: 'attack', kind: 'attack', requiresConfirmation: true }
        ]
      }],
      engagementPolicy: [{
        id: 'engagement.wandering-merchant',
        manualAttack: true, autoAggro: false,
        groupPropagation: 'socialGroup', rewardEligible: false,
        memorySeconds: 180, alertRadius: 90
      }],
      statProfile: [{
        id: 'stats.wandering-merchant',
        stats: {
          maxHp: { base: 302.5, tierScale: 2.05 },
          armor: { base: 4.8, tierScale: 1.9 },
          ward: { base: 3.84, tierScale: 1.9 },
          physicalPower: { base: 9.2, tierScale: 1.95 },
          magicPower: { base: 9.2, tierScale: 1.95 },
          accuracy: 0.94, gcdSpeed: 0.95, castSpeed: 1,
          autoAttackSpeed: 0.95, cooldownRate: 1,
          moveSpeed: 46, range: 28,
          critChance: 0.05, critMultiplier: 1.5, dodgeChance: 0.04,
          healingPower: { base: 9.2, tierScale: 1.95 },
          shieldPower: { base: 302.5, tierScale: 2.05 },
          lifesteal: 0, statusPotency: 1, tenacity: 0.45,
          interruptPower: 1, threatMultiplier: 1, resourceRegen: 1,
          expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
        }
      }],
      ability: [
        {
          id: 'merchant.staff_strike', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 0, animationLockTicks: 10, cooldownTicks: 0, queueable: true },
          target: { relation: 'hostile', shape: 'single', range: 28 },
          effects: [{
            type: 'damage', damageTypeId: 'blunt',
            formulaId: 'core.damage.power-coefficient-v1',
            params: { powerStat: 'physicalPower', coefficient: 0.7 }
          }],
          aiHints: { priority: 10 },
          presentation: { nameKey: 'combat.ability.merchant_staff_strike.name', icon: 'icon_skill_strike' }
        },
        {
          id: 'merchant.windbell_tonic', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 8, animationLockTicks: 8, cooldownTicks: 600, queueable: true },
          target: { relation: 'self', shape: 'single', range: 0 },
          effects: [{ type: 'heal', target: { relation: 'self', shape: 'single' }, maxHpCoefficient: 0.15 }],
          aiHints: { priority: 90, role: 'heal' },
          presentation: { nameKey: 'combat.ability.merchant_windbell_tonic.name', icon: 'icon_potion_large' }
        },
        {
          id: 'merchant.copper_guard', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 6, animationLockTicks: 8, cooldownTicks: 500, queueable: true },
          target: { relation: 'self', shape: 'single', range: 0 },
          effects: [{ type: 'shield', target: { relation: 'self', shape: 'single' }, coefficient: 0.25, durationTicks: 160 }],
          aiHints: { priority: 85, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.merchant_copper_guard.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'merchant.frostfire_flask', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 10, cooldownTicks: 240, queueable: true },
          target: { relation: 'hostile', shape: 'single', range: 72 },
          effects: [{
            type: 'damage', damageTypeId: 'fire',
            formulaId: 'core.damage.power-coefficient-v1',
            params: { powerStat: 'magicPower', coefficient: 0.82 }
          }],
          aiHints: { priority: 35 },
          presentation: { nameKey: 'combat.ability.merchant_frostfire_flask.name', icon: 'icon_skill_fire' }
        },
        {
          id: 'merchant.starkey_ward', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 8, animationLockTicks: 8, cooldownTicks: 440, queueable: true },
          target: { relation: 'self', shape: 'single', range: 0 },
          effects: [{ type: 'shield', target: { relation: 'self', shape: 'single' }, coefficient: 0.2, durationTicks: 140 }],
          aiHints: { priority: 80, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.merchant_starkey_ward.name', icon: 'icon_orb_buff' }
        },
        {
          id: 'merchant.escape', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 40, animationLockTicks: 8, cooldownTicks: 160, queueable: false },
          target: { relation: 'self', shape: 'single', range: 0 },
          effects: [{ type: 'withdraw', reason: 'escape' }],
          aiHints: { priority: -1000 },
          presentation: { nameKey: 'combat.ability.merchant_escape.name', icon: 'icon_camp_warp' }
        }
      ],
      actorArchetype: archetypes,
      actorVariant: variants,
      encounterPack: encounterPacks,
      worldSpawnProfile: spawns,
      encounterProfile: REGION_IDS.map(merchantEncounter),
      merchantProfile: profiles,
      merchantStockPool: stockPools,
      dialogueProfile: dialogues
    }
  });
})();
