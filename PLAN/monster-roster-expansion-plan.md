# 八区怪物生态扩充规划

## 目标与口径

- 八个主线主题地图各新增 3 个怪物单位，共 24 个新 Actor。
- 每区采用统一组合：2 个可在世界 Population 中刷新的常驻怪 + 1 个由其中一只常驻怪在 Encounter 内召唤的临时单位。
- 八区合计新增 16 个常驻怪、8 个召唤物。既有 16 个普通怪与 8 个 Boss 不计入本轮新增。
- 在怪物 Actor 之外，每区新增 1 种非 Actor 的环境伤害陷阱，并把现有抽象的 `threat.ambush` 落为本区伏击触发器；共 8 个 damage Hazard + 8 个 ambush Hazard。它们不计入怪物、召唤物、Population 或 Encounter 敌方人数。
- 初始 EncounterPack 继续保持 1 至 3 个敌方成员。带召唤者的 Pack 最多放 2 个初始成员，且最多包含 1 个召唤者；`maxActive: 1` 后战场敌方峰值仍不超过 3。
- 24 个新 Actor 全部进入统一 Actor、Relation、Encounter、Effect、Population 与内容审计管线；16 个 Hazard 进入独立但同样数据驱动的 Hazard/Effect/Encounter/探索审计管线，不在 `world.js` 增加区域 ID 特判。
- 所有 Actor 名称、描述、Lore、技能、Status，以及 Hazard 名称、描述、警告和命中提示同时提供 `zh-CN` 与 `en`。
- 生图只产出单单位美术母版。母版还需经过像素清理、逻辑尺寸压缩、待机帧制作和 `Game.assets` 注册，不能把模型原图直接视为可发布精灵。

## 审查结论与机制边界

现稿的 24 个新 Actor、Pack 权重、召唤上限和奖励隔离方向成立，但把“陷阱”主要表达成了可攻击的召唤 Actor，无法自然覆盖 RPG 常见的尖桩坑、落石压板、火焰喷口、坠冰和墙矛等环境伤害机关。强行把这些机关也建成 Actor 会产生血条、选中、威胁、奖励、AI 与战斗完成条件等错误语义。修订后统一区分三类机制：

| 类型 | 例子 | 正式运行时 | 是否可攻击 | 是否计入战斗完成 | 主要结果 |
| --- | --- | --- | --- | --- | --- |
| 召唤物 / 放置物 | 套索陷阱、霜牙夹、火药桶、图腾 | `ActorInstance`，`spawnSource.kind: 'summon'` | 是 | 是 | 持续施法、一次触发或可被提前摧毁 |
| 伏击触发器 | 草丛埋伏、墓门封锁、空岛传送伏击 | `HazardInstance` 的 `startEncounter` outcome | 否 | 否；触发后由 Encounter 决定 | 建立 Encounter，本身不直接造成伤害 |
| 环境伤害陷阱 | 尖桩坑、落石、火焰喷口、墙矛 | `HazardInstance` 的 `applyEffects` outcome | 否 | 否 | 直接/持续伤害、Status、位移 |

- 本轮不实现“伤害后同时强制伏击”的混合陷阱，避免在玩家没有操作窗口时叠加先手伤害与完整 Pack。以后如需混合，只能显式组合两个 outcome，并接受独立的难度预算审计。
- “隐藏”只影响发现前表现，不允许无预警命中。伤害陷阱在结算前必须完成 `concealed → revealed` awareness 转换并进入可读的 `warning → active` phase；伏击至少提供短暂环境异动和入场方向提示。
- 陷阱是挂机系统的一部分，不以玩家及时点击为生存前提。自动远征必须能侦测、绕行或承受；首期手动走位提供更优解，拆除留作后续 Interaction 扩展。
- 地面陷阱默认只命中 `movementTypes` 含 `ground` 的单位；飞行、悬浮或明确免疫的 Actor 不因脚点擦边而触发。例外必须逐 Profile 声明。

## 现行机制结论

| 项目 | 当前能力 | 本轮用法或缺口 |
| --- | --- | --- |
| 内容真源 | `js/data/packs/**/*.pack.js` 自动发现；Support 提供纯作者 factory | 每区内容仍留在对应 `region/*.pack.js`，通用展开逻辑只改 `factory.support.js` |
| 区域工厂 | `region.pack` 可展开 Stat、Action、Trait、Reward、Actor、EncounterPack、WorldSpawnProfile 与 Population | 当前硬编码只登记 `normals[0]`、`normals[1]`，必须先泛化为任意普通怪列表 |
| 世界刷新 | WorldSpawnProfile 反向 `mountTo` Population；SpawnLease 管理死亡、逃跑、刷新与 generation | 16 个常驻怪进入 `regular` 加权通道；8 个召唤物不得挂 Population |
| 战斗召唤 | Effect DSL 已支持 `type: 'summon'`、`archetypeId`、`count`、`maxActive` 及阵营、控制器、队伍继承 | 可直接实现敌方陷阱、图腾、仆从；使用 Encounter 的稳定 `nextSpawnSequence` |
| 召唤回收 | `spawnSource.kind: 'summon'`；Encounter 结束统一 despawn | 当前没有“存活 N tick 后自动退场”的正式字段，本轮不依赖限时消失 |
| 召唤表现 | Actor 能生成并加入 Encounter | 新实例目前不会自动进入 `Game.world.entities`，需补通用 attach/detach 表现桥接，否则可能逻辑存在但地图不可见 |
| 奖励安全 | Actor 使用 RewardProfile，Encounter team 可授权奖励 | 动态加入敌方队伍可能让召唤物被授权掉落和击杀统计；必须默认 `rewardAuthorized: false`，不得增加 EXP、金币、掉落、讨伐进度或总击杀 |
| 战斗结束 | 敌方 team 默认计入完成条件 | 本轮召唤物均可选中、可受伤、可被击毁；火药桶另有自毁，避免残留导致 Encounter 无法结束 |
| 固定物 AI | Actor 可设 `moveSpeed: 0`、`movementTypes: []`，通用 AI 仍可选择射程内目标 | 陷阱、图腾和装置先复用 `ai.monster.standard`；不虚构一个运行时尚未读取语义的新 AI Profile |
| 单次放置物 | 当前没有受审计的触发后消费 Effect；以巨额 true damage 模拟会污染伤害、死亡与表现语义 | 新增仅 summon 可用的 `selfDestruct`，套索、火药桶和霜牙夹在有效触发后统一消费 |
| 美术审计 | `spriteId/portraitId` 必须在严格 finalize 前登记 | 每个新 Actor 先注册 Sprite；怪物 Portrait 复用同一已登记 Sprite |
| 环境伤害陷阱 | 当前没有正式 `HazardProfile/HazardInstance`、伤害来源、触发扫掠、持久冷却或自动导航合同 | 不能用粒子碰撞、`setTimeout`、世界特判或不可见 Actor 代替；需先建立统一 Hazard 管线 |
| 伏击威胁 | Region Catalog 已有 `threat.ambush` 展示分类，Population/Encounter 已能稳定生成 Pack | 目前分类不等于正式陷阱生命周期；改由 Hazard outcome 提交稳定 Engagement/Encounter 请求 |
| 表现基础 | Combat 已有 telegraph，Terrain 有 decal，Particles 与 PresentationEvent 有数量上限和低特效开关 | Hazard 复用这些绘制能力，但状态与伤害时序由 fixed tick 逻辑层驱动，渲染层不做命中判定 |

## 注册结构调整

以下为目标作者结构，不是当前 `region.pack` 已接受的现成字段：

```js
{
  normals: [
    // 既有 2 个 + 新增 2 个常驻怪
  ],
  summons: [
    // 本区新增 1 个临时 Actor
  ],
  hazards: [
    // 本区 1 个环境伤害陷阱 + 1 个伏击触发器；编译为 HazardProfile，不是 Actor
  ],
  encounterRecipes: [
    // 显式成员、权重、间距、牵引半径与奖励预算
  ],
  guardianBaseId: '...',
  boss: { /* 既有 Boss */ }
}
```

### `region.pack` 工厂

1. 以 `normals.map(...)` 生成所有常驻怪的 Stat、基础 Action、Trait、Reward 与 ActorArchetype，移除只展开前两项的逻辑。
2. 新增 `summons.map(...)`：生成 Stat、Action、Trait、`category: 'summon'` ActorArchetype 和 `reward.none` 引用；陷阱类使用 `body.movementTypes: []`、`moveSpeed: 0`、`render.actor.object`。
3. 召唤物注册一个 `mountTo: []`、`identity.scope: 'ephemeral'`、`summonOnly: true` 的 WorldSpawnProfile 作为作者入口声明，但不进入任何 Population channel。
4. 普通 EncounterPack 改由 `encounterRecipes` 显式生成，不对 4 种常驻怪做无约束排列组合。
5. `guardianBaseId` 显式指定守门精英来源，避免继续把 `normals[1]` 当隐式合同。
6. `offlineRepresentative` 显式指定一组无召唤 Pack 和一组带召唤者 Pack，确保 CombatEstimator 覆盖新机制。
7. `hazards.map(...)` 只生成 `HazardProfile` 与对应 i18n/表现引用，不生成 Stat、Reward、Actor、WorldSpawnProfile 或 EncounterPack。
8. Catalog 的 `region.monsters` 扩为 4 个常驻怪 ID，另增仅供展示与审计的 `region.summons`，并以 `region.hazards` 引用本区 Hazard；地形威胁和守门精英仍读显式配置。

### 普通 Pack 权重基线

| Pack 类型 | 权重 | 约束 |
| --- | ---: | --- |
| 既有怪 solo A | 18 | 1 个初始敌人 |
| 既有怪 solo B | 17 | 1 个初始敌人 |
| 新怪 solo C | 13 | 1 个初始敌人 |
| 新召唤者 solo D | 10 | 召唤后最多 2 个敌人 |
| 既有怪 duo | 16 | 不含召唤者 |
| 新怪 C + 召唤者 D | 12 | 召唤后最多 3 个敌人 |
| 既有怪 + 新怪混合 duo | 9 | 不含召唤者 |
| 无召唤者 trio | 5 | 3 个初始敌人 |

权重合计 100。每区可按定位微调不超过 3 点，但必须保持召唤者总权重在 18 至 25 之间，防止挂机战斗长期被装置单位拖慢。

### 召唤运行时合同

- 召唤技能统一为可打断 GCD，建议 `castTicks: 16-24`、`cooldownTicks: 220-300`、`count: 1`、`maxActive: 1`。
- `inheritFaction`、`inheritController`、`inheritTeam` 保持默认 `true`，敌方召唤物继承召唤者的阵营、AI 控制器和 Encounter team。
- 每个召唤物的 `spawnSource` 必须保留 `kind/sourceId/ownerActorId/sequence`，相同 seeded Encounter 得到相同实例 ID 和事件顺序。
- 新增通用 World presentation attach/detach：Actor summon 成功后加入可绘制实体集合；死亡、Encounter 结束或显式 despawn 后只移除一次。
- 召唤物默认 `rewardAuthorized: false`，且该规则优先于动态 team 的奖励资格；召唤物死亡不触发 `rollDrops`、`monster:killed`、讨伐增长或统计增长。
- 召唤物对完成条件的处理保持简单：加入敌方 combatant team、可被攻击、存活时计入敌方存活数。所有装置必须有可达的受击体积；单次装置触发后通过正式 `selfDestruct` 退出。
- 套索陷阱、火药桶和霜牙夹统一为单次放置物：成功触发后在最后一个有效 Effect 之后执行受审计的 `selfDestruct`，走正式 defeat/cleanup 事件但不产生击杀、奖励或死亡触发收益；被提前击毁时不得结算触发伤害。`selfDestruct` 只允许 `category: 'summon'` 使用，不能用任意超大 true damage 常量模拟。
- 本轮不实现通用定时 despawn。未来若加入 `lifetimeTicks`，必须走 Encounter scheduler cleanup，不使用 `setTimeout`，并纳入固定 tick、Estimator 与审计。

## 环境陷阱系统合同

### 内容模型

新增一等内容类型 `HazardProfile`，由内容编译器执行 schema、引用、数值、i18n、资产与 fingerprint 审计。Profile 只描述机制，不保存运行时状态；建议最小结构如下：

```js
{
  id: 'hazard.grassland.thorn_stakes',
  regionId: 'grassland',
  category: 'damageTrap',
  trigger: {
    mode: 'enter',
    shape: 'circle',
    radius: 16,
    movementTypes: ['ground'],
    actorFilter: 'playerParty',
    sweep: true,
    retrigger: 'afterExit'
  },
  detection: {
    clueRadius: 72,
    revealRadius: 48
  },
  lifecycle: {
    revealTicks: 8,
    warningTicks: 20,
    activeTicks: 4,
    cooldownTicks: 600
  },
  outcome: {
    type: 'applyEffects',
    effects: [{
      type: 'damage',
      damageTypeId: 'piercing',
      formulaId: 'combat.hazard_damage_v1',
      params: { maxHpCoefficient: 0.06 },
      canCrit: false,
      canDodge: false,
      defenseMode: 'resistanceOnly'
    }]
  },
  placement: {
    source: 'hazardAnchor',
    count: [4, 7],
    minCampDistance: 180,
    minLandmarkDistance: 48,
    minSpacing: 96,
    requireWalkableEscape: true
  },
  presentation: {
    nameKey: 'hazard.grassland.thorn_stakes.name',
    descKey: 'hazard.grassland.thorn_stakes.desc',
    visualProfileId: 'hazard.visual.thorn_stakes'
  }
}
```

- `category` 首期只允许 `damageTrap` 与 `ambushTrigger`；`outcome.type` 分别只允许 `applyEffects` 与 `startEncounter`，避免一份 Profile 悄悄组合多重惩罚。
- `damageTrap` 首期使用 `trigger.actorFilter: 'playerParty'`，不会被巡逻怪或脱离镜头的生态单位提前消耗；伤害 outcome 同样只选择玩家队伍中处于形状内且 movement type 合法的 Actor。未来若开放中立/全阵营机关，必须先定义环境击杀的奖励归属和怪物 Hazard AI。
- `HazardProfile` 只能引用 Effect DSL 的白名单子集：`damage`、`applyStatus`、`knockback`、`pull`。禁止 heal、summon、resource、repeat、custom 和目标关系选择；目标永远是实际触发形状中的 Actor。
- `combat.hazard_damage_v1` 以目标 `maxHp`、区域 tier 和 Profile 系数计算，仍经过对应 damage type 抗性与护盾；不走命中、闪避、暴击、吸血或威胁。环境伤害来源使用 `{ kind: 'hazard', profileId, instanceId }`，不得伪造不可见 Actor。
- Hazard 外部 EffectSource 提供只读 `statusPotency: 1`，Status 时长仍受目标 tenacity 影响；Profile 不能伪造其他 Actor 属性。knockback/pull 复用合法位移投影，不能把目标推入硬阻挡、地图外或另一 Hazard 的 active 区。
- 脱战触发通过共享 `Game.effects.resolveExternal(...)` 进入 `Game.units.damage/status/displacement` 与正式玩家倒地/回营流程；战中触发额外写入当前 Encounter 的 event log 和 metrics。禁止从 Hazard 系统直接改 HP、Status 数组或世界坐标，也不为脱战伤害创建伪 Encounter。
- `startEncounter` 只引用合法 EncounterPack/EncounterProfile，并提交稳定 hazard instance key、触发 Actor 稳定键和入场方向；仍走 Engagement draft/atomic commit，不直接修改 Relation、target 或队伍。
- Profile 中的 tick 均为 50ms 固定 tick。视觉毫秒、CSS 动画结束事件或音频时长不得影响触发与伤害结算。

### 运行时与持久化

- `HazardInstance` 至少保存 `id/profileId/regionId/x/y/orientation/awareness/phase/phaseSinceTick/cooldownUntilWorldTime/triggerOrdinal`。`awareness` 为单向的 `concealed → revealed`，`phase` 独立表示触发周期。实例 ID 由 `worldSeed + layoutVersion + regionId + profileId + placementOrdinal` 确定，同一存档重开位置与朝向不漂移。
- 地图生成提供合法 `hazardAnchor`，必须避开营地安全区、强制落脚点、区域入口、地标交互圈、资源交互圈、Boss 巢穴入口和唯一通路的最窄截面；每个陷阱周围至少保留一条符合 48px 净宽合同的可绕路线。
- 触发使用上一位置到当前位置的 swept shape 查询，不能只检查帧末脚点，避免高移速、低帧率或快进穿过陷阱而不结算。同一 active window 内按 Actor ID 去重。
- awareness 在首次进入发现半径、触发或获得对应地标情报时转为 `revealed`，同一布局版本内不退回。phase 固定为 `dormant → warning → active → cooldown → dormant`；首次从 concealed 触发时先经历 `revealTicks` 再进入 warning。离开区域或回营时取消未结算 warning。`active` 只在固定结算 tick 应用一次，持续伤害必须显式排成多个 scheduler item。
- `Game.hazards` 独占实例化、触发、调度和 cleanup；`Game.world` 只调用通用接口并把 PresentationEvent 转交渲染层，不增加任何区域 ID 分支。
- 若落地时需要持久化发现与冷却，在现行 v14 后新增 v15：各区域只保存 `discoveredHazardIds` 与 `hazardCooldowns[instanceId] = absoluteWorldTime`。旧档补空集合；过期、未知 Profile、布局版本不匹配或越界 ID 在读取时白名单清理。运行时 warning/active/scheduler 不入档。
- 离线收益不模拟地图坐标，因此首期不追加离线陷阱伤害，也不授予绕行/拆除收益；恢复页面时从已保存的合法脱战状态继续。短时隐藏快进必须执行同一 swept trigger 与 fixed-tick resolver，不能跳过伤害。

### 侦测、规避与挂机策略

- 陷阱不采用纯随机“判定失败即无预警受伤”。未发现时仍有与地形融合的静态线索；进入 `revealRadius` 或曾经触发后转为 `revealed`，并写入区域探索状态。
- 手动模式允许在 warning 结束前走出形状，不增加专用 QTE。首期不提供点击拆除，以免引入职业专属交互、掉落与长按触控合同；未来拆除应作为通用 InteractionProfile 扩展。
- `safe` 自动远征把已发现陷阱视为高导航成本，只在绕行不可达时穿越；`balanced` 避开 active/warning，并在绕路成本不高于 30% 时绕开 dormant；`loot` 只避开 active/warning 或预测单次伤害会使 HP 低于自动回营阈值的陷阱。
- 未发现陷阱进入 warning 后，自动导航必须立刻重算到最近合法形状外点；反应不保证零伤，但不得因 AI 停在中心、寻路震荡或重复进出导致连续触发。
- 每区同时 active/warning 的环境陷阱最多 2 个；每 30 秒移动窗口内环境陷阱预期承伤不超过当前 `maxHp` 的 18%，安全策略不超过 8%。营地、过场、对话、采集锁定和 Boss 结算期间暂停新触发。

## 八区环境伤害陷阱

数值为区域目标装等下的初始预算；百分比均以触发者最大生命为基准，经过抗性与护盾后再扣除。表中的 Status 复用本区正式定义，不额外制造同义状态。

| 区域 / Hazard ID | 形状与时序 | 伤害与控制 | 场景逻辑 |
| --- | --- | --- | --- |
| 新手草原：荆棘暗桩 / Thorn Stakes / `hazard.grassland.thorn_stakes` | 16px 圆；20 tick 预警，单次触发，30秒冷却 | piercing `6% maxHp`；1 层 `grassland.bleeding` | 旧猎道和灌木缺口，避开教学起步区；用最轻惩罚教授预警与绕行 |
| 迷雾森林：毒藤飞刺 / Venom Dart Vines / `hazard.forest.venom_darts` | 42×14px 方向矩形；24 tick 预警，连续 2 发间隔 6 tick，24秒冷却 | 每发 poison `3% maxHp`；首发施加 1 层 `forest.poisoned` | 藤墙与树根形成清晰发射方向；不横跨唯一窄桥 |
| 废弃矿坑：塌顶落石 / Rockfall Plate / `hazard.mine.rockfall_plate` | 24px 圆；地面压板后 28 tick 预警，单次触发，36秒冷却 | blunt `8% maxHp`；击退 12px并施加 `mine.disoriented` | 木梁破损和碎石区；落点不得把 Actor 推进硬阻挡或另一陷阱 |
| 亡灵墓地：噬魂墓印 / Soul-Devouring Seal / `hazard.graveyard.soul_seal` | 22px 圆；22 tick 预警，active 期间 3 跳、每 8 tick 一跳，32秒冷却 | 每跳 necrotic `2.5% maxHp`；首跳施加 `graveyard.withered` | 墓碑环和石板缝；是持续区域，脱离后停止后续未命中 Actor 的跳数 |
| 雪山隘口：悬冰坠刺 / Falling Icicles / `hazard.snowpass.icicle_fall` | 18×42px 方向矩形；30 tick 预警，单次触发，34秒冷却 | frost `7% maxHp`；1 层 `snowpass.chilled` | 崖壁下方，雪粉先落下；不得布在冰桥唯一通道中心 |
| 熔岩洞窟：地火喷口 / Flame Vent / `hazard.lavacave.flame_vent` | 36×18px 锥形；18 tick 预警，3 跳、每 5 tick 一跳，22秒冷却 | 每跳 fire `3% maxHp`；首跳施加 1 层 `lavacave.burning` | 黑曜石裂缝指明朝向；与永久熔岩装饰在轮廓和亮度上明显区分 |
| 浮空遗迹：导雷矩阵 / Arc Grid / `hazard.skyruins.arc_grid` | 44×18px 线段/矩形；26 tick 预警，单次触发，30秒冷却 | lightning `8% maxHp`；施加 `skyruins.suppressed` | 两个破损导体之间；连线不跨越地图出口或强制交互点 |
| 魔王城：穿墙魔枪 / Wall Lances / `hazard.darkcastle.wall_lances` | 52×16px 方向矩形；16 tick 预警，单次触发，26秒冷却 | piercing `10% maxHp`；施加 `darkcastle.cursed` | 仅贴有枪孔/链轮的墙段；终局更快但仍保证完整预警与侧向逃生空间 |

## 八区伏击触发器

每区定义 1 个 ambush HazardProfile，可由本区 6–9 个 Threat territory 实例化零至多个稳定实例。它只选择显式标注 `ambushEligible: true` 的 regular Encounter recipe：初始 1–2 敌人、最多 1 个召唤者、不得选择 Boss/guardian/quest Pack。触发后 Hazard 锁定至 Encounter 结束；胜利、逃跑或 leash 结束均写入既有 `threatCooldowns`，不会原地连战。

| 区域 / Hazard ID | 潜伏主题 | 入场方向与 Pack 约束 |
| --- | --- | --- |
| 新手草原：路旁伏兵 / Roadside Ambush / `hazard.grassland.roadside_ambush` | 高草、翻动的土和短暂反向草浪 | 从道路一侧或两侧进入；新手区只选 solo/duo，不选含召唤者 Pack |
| 迷雾森林：雾丛围猎 / Thicket Ambush / `hazard.forest.thicket_ambush` | 灌木抖动、叶片逆落和雾中硬边脚点 | 从树丛缺口进入；不得把敌人 attach 在硬阻挡或玩家退路上 |
| 废弃矿坑：岔洞截击 / Tunnel Ambush / `hazard.mine.tunnel_ambush` | 顶尘、滚石和熄灭后复亮的矿灯 | 只从可行走侧洞/梁柱后进入；不与塌顶落石同 anchor 重叠 |
| 亡灵墓地：墓土苏醒 / Grave Ambush / `hazard.graveyard.grave_ambush` | 土缝、倾倒烛火和墓碑后的骨白反光 | 从墓碑遮挡边缘进入；生成点与噬魂墓印保持至少 64px |
| 雪山隘口：白障袭猎 / Whiteout Ambush / `hazard.snowpass.whiteout_ambush` | 新脚印、雪粉横扫和崖边短影 | 从上风侧进入；不得封死冰桥或把玩家夹在坠冰 warning 中 |
| 熔岩洞窟：烬幕突袭 / Cinder Ambush / `hazard.lavacave.cinder_ambush` | 火星逆流、黑烟缝和熔岩光被短暂遮断 | 从岩柱/洞口后进入；触发时暂停附近 dormant 地火喷口起动至 attach 完成 |
| 浮空遗迹：裂隙投送 / Rift Ambush / `hazard.skyruins.rift_ambush` | 方形符文错亮、悬浮碎片向一点收束 | 从预告的符文落点 attach；不从地图外悬空位置或导雷矩阵线上生成 |
| 魔王城：闸门合围 / Gate Ambush / `hazard.darkcastle.gate_ambush` | 链条轻摆、枪孔反光和紫黑门缝 | 从前后门廊分批进入；先显示全部方向，不与穿墙魔枪同 tick 进入 warning |

- ambush warning 为 12–20 tick 的入场准备，不允许伤害 Action；manual/safe 策略在发现线索后可绕行，balanced/loot 可按当前 HP 和 Pack 估值决定穿越。
- `startEncounter` 失败必须原子回滚 Hazard phase、临时 Relation 和已 attach Actor；成功后 Hazard 不加入 Encounter participant，不产生血条、目标或 Objective。
- 伏击内容进入 CombatEstimator 时直接评估其引用 Pack；Hazard 本身不另加隐藏伤害系数。这样线上伏击与离线代表 Pack 共用同一战斗强度真源。

## 陷阱视觉与表现规划

### 信息层合同

- 每个 Hazard 使用 `HazardVisualProfile` 声明 `concealed+dormant/revealed+dormant/warning/active/cooldown` 的底图、decal、telegraph、粒子、命中 FX、残留和可选 SFX ID；表现只消费逻辑层 awareness、phase 和 normalized progress。
- `warning` 必须同时使用轮廓、方向和进度，不依赖单一颜色：圆形用收束环，矩形/线形用平行边界和箭头，锥形用扇面边界，坠落型在落点加入交叉标记。
- 危险信息层固定绘制在地形之上、Actor 脚点之下；命中粒子可越过 Actor，但不得遮住血条、施法条、伤害数字或触控目标。屏幕上同类粒子有硬上限，远离镜头不生成。
- 预警基色统一为琥珀，最后 25% 转为白芯红边；区域元素色只用于内部纹理。色觉缺陷下仍靠虚实线、箭头和中心符号区分。
- `settings.effects = false` 或 `prefers-reduced-motion` 时关闭碎屑、烟雾、拖尾、抖动和循环闪烁，但保留静态机制底图、完整危险边界、分段倒计时、active 帧和命中定格。可玩信息不属于可关闭的环境特效。
- 镜头震动只允许 mine/lavacave/darkcastle 的 active 瞬间，桌面不超过 2px/100ms，移动端不超过 1px/80ms；减少动态效果时为 0。禁止全屏白闪和大面积透明雾遮挡。
- 所有触发至少发送 `hazard:revealed`、`hazard:warning`、`hazard:activated`、`hazard:hit`、`hazard:cooldown` PresentationEvent；事件包含稳定 instance ID、tick、shape、position/orientation、progress 与 target IDs。

### 环境伤害陷阱逐区视觉

| 陷阱 | 潜伏 / 被侦测 | 预警 | 触发与命中 | 冷却 / 地面残留 |
| --- | --- | --- | --- | --- |
| 荆棘暗桩 | 潜伏时是略显规整的枯草和 2–3 个暗木尖；侦测后木尖加浅色描边 | 琥珀色断续圆环向中心收束，中心为尖刺符号 | 4–6 根木刺硬切上弹，棕色土屑和白色短命中线；出血只用小型深红像素，不出现血浆 | 木刺折断并压低，留暗色翻土 decal；冷却结束重新被草叶覆盖 |
| 毒藤飞刺 | 树根侧有三孔藤瘤，侦测后孔口呈黄绿色三角排列 | 狭长矩形边界，箭头从藤墙指向射程末端；两发用两段进度格 | 不透明黄绿刺矢沿直线掠过，命中产生短促叶片/毒点爆开，不用半透明毒雾 | 孔口闭合变暗，地面仅留 2 秒细小毒点 decal |
| 塌顶落石 | 方形旧压板和顶部掉落细尘；侦测后压板四角出现铁钉高光 | 圆形落点带交叉标记，先落小砂粒，最后四分之一出现白色中心 | 3–5 块硬边岩块从画面上方短距坠落，落地尘环、碎石和轻震；命中定格 1 帧 | 碎石堆逐渐压暗，保留裂纹 decal，避免形成真实阻挡 |
| 噬魂墓印 | 石板上只有断裂刻痕；侦测后补全骨白环形符文 | 三段墓印依次亮起，外环收束；不用旋转软光 | 不透明紫白魂火从符文缝隙竖起，每跳以一圈锯齿脉冲表示；受击者脚下出现短暂枯萎符号 | 火焰熄灭，符文呈灰紫余烬；残留不误导为仍 active |
| 悬冰坠刺 | 崖壁边缘积雪略微鼓起，持续落下极少雪粉；侦测后地面出现蓝灰阴影 | 长矩形边界加交叉落点，雪粉密度分三档增加 | 2–4 根不透明冰锥直落并碎成蓝白硬片，命中出现短冰裂线；不使用透明玻璃材质 | 地面留碎冰和细裂纹，数秒后压暗融入雪地 |
| 地火喷口 | 黑曜石裂缝有暗红内芯，侦测后裂缝两侧出现焦黑箭头 | 扇形/短矩形边界沿喷射方向分段点亮，中心裂缝由暗红升至黄白 | 三次矮而宽的硬边火舌，橙黄火星向同方向飞散；命中显示炭黑短闪而非满屏红光 | 裂缝冒 1–2 缕低粒子蒸汽后转暗；关闭特效时仅保留暗化 active 帧 |
| 导雷矩阵 | 两根破损导体各有微弱蓝点，侦测后地面显示断续电路纹 | 两导体间出现双平行边界、方向无关的锯齿中心线和四段充能格 | 白芯蓝边的折线电弧只闪 1–2 帧，命中脚点出现像素十字电花；禁止长时间高频闪烁 | 导体冒出单个暗灰火花，地面电路纹变为失活灰色 |
| 穿墙魔枪 | 墙面枪孔、磨痕和链轮是常驻场景线索；侦测后枪孔出现骨白描边 | 狭长矩形内使用从墙向外的三排箭头，最后四分之一枪尖先露 2px | 枪阵按同一 tick 齐射，黑铁枪身配白色速度线，命中有短促红紫符文裂纹与轻震 | 枪身立即收回，链轮停在偏转帧，地面不留遮挡行走的实体 |

### 召唤 / 放置物视觉状态

召唤 Actor 保留血条、受击描边和选中圈，并使用 `deploy → armed → warning/cast → trigger → destroyed` 状态；其危险范围走正式 Action telegraph，不与环境 Hazard 共用碰撞判定。

| 放置物 | 部署与待机 | 预警与触发 | 摧毁反馈 |
| --- | --- | --- | --- |
| 套索陷阱 | 绳卷落地后木桩依次立起，armed 时绳圈保持完整圆形 | 绳圈边沿收紧闪动，触发时绳索向脚点闭合并扬起少量土屑 | 木桩向外倒伏、绳圈断成两段；不播放触发伤害 |
| 孢子囊 | 种荚从闭合到轻微鼓起，以顶部 1px 呼吸表示周期 | 地面毒圈先出现，荚瓣分三步张开后喷出硬边孢子团 | 外壳塌陷并失色，孢子立即停止生成 |
| 火药桶 | 沿地面短滚后卡定，引线火点按剩余 fuse 分段前进 | 红边圆形预警逐段收束，爆炸用黄白核心、橙色方块火花和短烟环 | 被提前击毁时引线熄灭、桶板散开，不产生完整爆炸，必须与正常引爆明显区分 |
| 爬行断手 | 地面先鼓起小土包，手掌破土后快速落地 | 抓缚前指骨收拢，命中时锁链/手指闭合在目标脚点 | 骨节散开并快速压暗，不绘制血腥断面 |
| 霜牙夹 | 冰霜夹具落地张开，骨齿形成高对比圆轮廓 | 蓝白圆环收束，双颚闭合并喷出短冰片 | 齿片裂开、符纹熄灭；不复用草原绳索轮廓 |
| 余烬图腾 | 黑曜石基座落定，三道裂纹从下到上点亮 | 热脉冲以硬边同心环扩散，裂纹在施法末帧变黄白 | 图腾断成上下两块，裂纹从上到下熄灭 |
| 风暴棱塔 | 石塔升起，悬浮环以低频四帧离散转位 | 充能格沿环累积，雷击用短折线连接目标脚点 | 悬浮环坠落、核心变灰，不保留持续电弧 |
| 囚魂笼 | 黑铁笼落地后栏杆依次锁合，骨白符石常亮 | 栏杆投影式边界向内收束，脉冲为紫白锯齿环 | 锁扣断裂、笼门弹开，魂光向上收成单点后消失 |

### 伏击视觉模板

- 潜伏阶段只给环境线索，不显示敌人轮廓：草原草叶逆风、森林灌木抖动、矿坑顶尘、墓地土缝、雪地新脚印、熔岩余烬逆流、遗迹符文错亮、魔王城链条轻摆。
- 触发后先绘制 Encounter 边界与敌方入场方向箭头，再在 12–20 tick 内完成敌人 attach；不得让未显示的敌人在同一 tick 造成伤害。远程敌人也必须等入场完成后走正式 Action 请求。
- 八区入场 FX 分别使用草屑、叶片、碎石尘、骨白土屑、雪粉、火星、方形符文片、紫黑链纹；关闭特效时改为 2 帧静态轮廓揭示和方向箭头，不能直接瞬移出现。
- 伏击线索、方向箭头和 Encounter 边界都由正式 `HazardVisualProfile`/PresentationEvent 提供；Catalog 的 `threat.ambush` 只负责选用模板，不在 renderer 按 region ID 特判。

## 新增单位总表

| 区域 | 常驻怪 A | 常驻怪 B / 召唤者 | 召唤单位 | 战斗主题 |
| --- | --- | --- | --- | --- |
| 新手草原 | 荆背野猪 / Thornback Boar | 草原地精猎手 / Grassland Goblin Trapper | 套索陷阱 / Snare Trap | 冲锋、流血、定身 |
| 迷雾森林 | 苔甲巨甲虫 / Mossback Beetle | 苔冠萨满 / Moss-Cap Shaman | 孢子囊 / Spore Pod | 护甲、毒素、范围压制 |
| 废弃矿坑 | 晶背穴兽 / Crystalback Crawler | 狗头人爆破手 / Kobold Sapper | 火药桶 / Powder Keg | 晶片射击、预警爆破、自毁 |
| 亡灵墓地 | 墓穴猎犬 / Grave Hound | 食尸掘墓者 / Ghoul Gravedigger | 爬行断手 / Crawling Hand | 衰弱、召尸、抓缚 |
| 雪山隘口 | 霜角岩羊 / Frosthorn Ibex | 霜原豺狼人猎手 / Rime Gnoll Trapper | 霜牙夹 / Rimejaw Trap | 击退、寒冷、破防 |
| 熔岩洞窟 | 熔核岩蛞蝓 / Magma Slug | 烬火教徒 / Cinder Cultist | 余烬图腾 / Ember Totem | 灼烧、火焰脉冲、阵地压力 |
| 浮空遗迹 | 以太天鳐 / Aether Manta | 遗迹构装师 / Ruin Artificer | 风暴棱塔 / Storm Pylon | 飞行、奥术压制、雷击 |
| 魔王城 | 深渊魔犬 / Abyssal Hound | 魔狱看守 / Demon Gaoler | 囚魂笼 / Soul Cage | 诅咒、拘束、死灵脉冲 |

## 分区内容规格

### 1. 新手草原

| Actor ID | 类型与建议数值 | Action / Effect | 生态与视觉 |
| --- | --- | --- | --- |
| `boar_thornback` | 常驻近战；`hp 1.15 / atk 1.05 / spd 0.5` | `boar_thornback.tusk_charge`：12 tick 预备、130 tick CD，突进 18px，blunt `1.12`，附加既有 `grassland.bleeding` | 在开阔草地巡游；低矮厚重轮廓、苔绿硬鬃、浅色长獠牙 |
| `goblin_trapper` | 常驻召唤者；`hp 0.88 / atk 0.92 / spd 1.5`，远程 58px | `goblin_trapper.set_snare`：20 tick 可打断施法、240 tick CD，召唤 `summon.snare_trap` | 靠近土路与灌木；小型地精、皮帽、绳卷和短弩，远看能识别“猎手” |
| `summon.snare_trap` | 临时固定单次装置；`hp 0.38 / atk 0.45`，`moveSpeed 0` | `summon.snare_trap.snap`：射程 26px、半径 20px，piercing `0.48`；施加新增 `grassland.snared`，30 tick 内移速乘 `0.25`，随后 `selfDestruct` | 不挂 Population；木桩、绳圈和咬合板形成清晰圆形危险轮廓 |

### 2. 迷雾森林

| Actor ID | 类型与建议数值 | Action / Effect | 生态与视觉 |
| --- | --- | --- | --- |
| `beetle_mossback` | 常驻前排；`hp 1.22 / atk 0.95 / def 1.35 / spd -1` | `beetle_mossback.shell_ram`：10 tick 预备、140 tick CD，blunt `1.0`，施加既有 `forest.rooted` | 潮湿树根附近；苔藓甲壳、琥珀角、六足低重心 |
| `shaman_mosscap` | 常驻召唤者；`hp 0.9 / atk 0.9 / def 1.05 / spd -0.5`，远程 62px | `shaman_mosscap.plant_spore_pod`：22 tick 可打断施法、260 tick CD，召唤 `summon.spore_pod` | 发光菌簇附近；菌帽萨满、木杖和种荚，不与既有毒蘑菇怪共用轮廓 |
| `summon.spore_pod` | 临时固定生物装置；`hp 0.42 / atk 0.4`，`moveSpeed 0` | `summon.spore_pod.spore_burst`：90 tick CD，半径 34px poison `0.42`，附加一层既有 `forest.poisoned` | 不挂 Population；闭合种荚周期张开，硬边像素孢子，不使用半透明烟雾 |

### 3. 废弃矿坑

| Actor ID | 类型与建议数值 | Action / Effect | 生态与视觉 |
| --- | --- | --- | --- |
| `crawler_crystalback` | 常驻中距怪；`hp 1.0 / atk 1.08 / def 1.2 / spd 1` | `crawler_crystalback.prismatic_shard`：14 tick 施法、130 tick CD，64px arcane `0.92`，施加既有 `mine.disoriented` | 水晶矿脉周围；深色穴兽、背部青蓝晶簇，轮廓不能像熔岩蜥蜴换色 |
| `kobold_sapper` | 常驻召唤者；`hp 0.9 / atk 1.0 / spd 1`，远程 54px | `kobold_sapper.roll_keg`：18 tick 可打断施法、260 tick CD，召唤 `summon.powder_keg` | 废弃轨道与木梁附近；矿工皮帽、护目镜、火绳和工具包 |
| `summon.powder_keg` | 临时固定单次装置；`hp 0.32 / atk 0.75`，`moveSpeed 0` | `summon.powder_keg.fuse_burst`：28 tick 圆形预警，半径 40px fire `1.18`，随后 `selfDestruct` | 不挂 Population；短粗木桶、铁箍、明亮短引线；受击可提前摧毁 |

### 4. 亡灵墓地

| Actor ID | 类型与建议数值 | Action / Effect | 生态与视觉 |
| --- | --- | --- | --- |
| `hound_grave` | 常驻高速近战；`hp 0.95 / atk 1.12 / spd 2.5` | `hound_grave.withering_bite`：8 tick 预备、120 tick CD，necrotic `1.02`，施加既有 `graveyard.withered` | 墓碑和枯树间巡游；骨甲猎犬、暗紫魂火，避免写实腐烂 |
| `ghoul_gravedigger` | 常驻召唤者；`hp 1.08 / atk 0.95 / spd -1` | `ghoul_gravedigger.unearthed_grasp`：24 tick 可打断施法、280 tick CD，召唤 `summon.crawling_hand` | 坟冢边缘；佝偻食尸鬼、旧铁锹、破围巾，动作笨重 |
| `summon.crawling_hand` | 临时小型仆从；`hp 0.35 / atk 0.38 / spd 1.5` | `summon.crawling_hand.ankle_grab`：近战 necrotic `0.4`，施加新增 `graveyard.clutched`，36 tick 内移速乘 `0.3` | 不挂 Population；骸骨手与一小截石棺锁链，不出现血腥断面 |

### 5. 雪山隘口

| Actor ID | 类型与建议数值 | Action / Effect | 生态与视觉 |
| --- | --- | --- | --- |
| `goat_frosthorn` | 常驻冲锋怪；`hp 1.08 / atk 1.05 / def 1.1 / spd 2` | `goat_frosthorn.ridge_charge`：14 tick 预备、140 tick CD，突进 20px、blunt `1.05`、击退 14px并附加一层 `snowpass.chilled` | 岩脊和积雪路段；白灰山羊、冰蓝盘角、厚实蹄部 |
| `gnoll_rime_trapper` | 常驻召唤者；`hp 0.96 / atk 1.02 / spd 1`，远程 60px | `gnoll_rime_trapper.set_rimejaw`：20 tick 可打断施法、260 tick CD，召唤 `summon.rimejaw_trap` | 松林雪地；豺狼人猎手、毛皮斗篷、骨弩和夹具包 |
| `summon.rimejaw_trap` | 临时固定单次装置；`hp 0.4 / atk 0.5`，`moveSpeed 0` | `summon.rimejaw_trap.snap`：射程 26px、frost `0.52`，附加 `snowpass.exposed` 与一层 `snowpass.chilled`，随后 `selfDestruct` | 不挂 Population；冰霜金属夹、骨齿和蓝白符纹，轮廓与草原绳套明显不同 |

### 6. 熔岩洞窟

| Actor ID | 类型与建议数值 | Action / Effect | 生态与视觉 |
| --- | --- | --- | --- |
| `slug_magma` | 常驻慢速耐久怪；`hp 1.2 / atk 1.0 / def 1.15 / spd -2` | `slug_magma.cinder_spit`：16 tick 施法、130 tick CD，58px fire `0.88`，附加一层 `lavacave.burning` | 熔岩边缘与黑曜石附近；黑色岩壳、橙黄裂隙，不绘制半透明黏液 |
| `cultist_cinder` | 常驻召唤者；`hp 0.9 / atk 1.08 / spd 0`，远程 66px | `cultist_cinder.raise_ember_totem`：24 tick 可打断施法、280 tick CD，召唤 `summon.ember_totem` | 石柱与祭坛残迹附近；矮小兜帽教徒、焦黑法杖、红铜护符 |
| `summon.ember_totem` | 临时固定装置；`hp 0.46 / atk 0.52`，`moveSpeed 0` | `summon.ember_totem.heat_pulse`：100 tick CD，半径 36px fire `0.5`，附加一层 `lavacave.burning` | 不挂 Population；黑曜石图腾、三道橙红裂纹和硬边火焰冠 |

### 7. 浮空遗迹

| Actor ID | 类型与建议数值 | Action / Effect | 生态与视觉 |
| --- | --- | --- | --- |
| `manta_aether` | 常驻飞行怪；`hp 0.94 / atk 1.1 / def 1.1 / spd 2.5` | `manta_aether.arc_shear`：12 tick 施法、125 tick CD，68px arcane `0.94`，附加既有 `skyruins.suppressed` | 浮岛边缘滑翔；石质鳐翼、青色能量槽和金色关节，不能像普通海洋动物 |
| `artificer_ruin` | 常驻召唤者；`hp 1.0 / atk 0.98 / def 1.25 / spd -0.5`，远程 70px | `artificer_ruin.deploy_storm_pylon`：22 tick 可打断施法、280 tick CD，召唤 `summon.storm_pylon` | 断柱与符文台附近；小型古代构装体、工具臂、非人形核心 |
| `summon.storm_pylon` | 临时固定装置；`hp 0.44 / atk 0.55`，`moveSpeed 0` | `summon.storm_pylon.lightning_pulse`：90 tick CD，半径 38px lightning `0.54`，施加 `skyruins.suppressed` | 不挂 Population；三棱石塔、悬浮环和硬边蓝白电弧 |

### 8. 魔王城

| Actor ID | 类型与建议数值 | Action / Effect | 生态与视觉 |
| --- | --- | --- | --- |
| `hound_abyssal` | 常驻高速近战；`hp 1.05 / atk 1.15 / def 1.1 / spd 2.5` | `hound_abyssal.void_pounce`：10 tick 预备、120 tick CD，突进 18px、necrotic `1.1`，施加既有 `darkcastle.cursed` | 城墙阴影与瘴气区巡游；黑紫装甲魔犬、暗红裂隙，轮廓比墓穴猎犬更厚重 |
| `gaoler_demon` | 常驻召唤者；`hp 1.12 / atk 1.02 / def 1.2 / spd -1`，远程 64px | `gaoler_demon.lock_soul_cage`：24 tick 可打断施法、300 tick CD，召唤 `summon.soul_cage` | 牢门、尖桩与邪旗附近；重甲狱卒恶魔、锁链钩杖、无翅 |
| `summon.soul_cage` | 临时固定装置；`hp 0.5 / atk 0.55`，`moveSpeed 0` | `summon.soul_cage.binding_pulse`：100 tick CD，半径 34px necrotic `0.5`；施加新增 `darkcastle.shackled`，40 tick 内移速乘 `0.25` | 不挂 Population；黑铁鸟笼状法器、骨白符石和紫色硬边魂光 |

## ImageGen 提示词使用规则

本轮先使用 `js/sprites/monsters_expansion.js` 中按稳定 `spriteId` 注册的简单手绘像素精灵完成技术与渲染验收，不调用 ImageGen。以下提示词只作为未来逐单位替换美术母版时的参考；替换不得改变内容 ID、碰撞体、逻辑尺寸或运行时合同。

以下提示词依据项目安装的 `imagegen` skill 编写：

- 分类统一使用真实 taxonomy：`Use case: stylized-concept`。
- 每个不同单位是一项独立资产。若使用内置 `image_gen.imagegen`，应逐单位分别调用，不用一张图承载多个不同资产。
- 提示词只包含 prompt scaffolding，不把 `quality`、`input_fidelity`、输出路径或透明背景当作内置工具参数。
- 内置路径不提供原生透明参数，因此提示词要求纯色 chroma-key 背景；绿色主体使用 `#ff00ff`，其他主体主要使用 `#00ff00`。
- 每份提示词都要求单一完整单位、默认朝左、3/4 伪俯视、无文字、无水印、无投影、无场景、无多视图。这样便于后续抠图和像素化。
- 提示词目标是“像素精灵生产母版”，不是直接要求模型准确输出项目字符网格或现成 sprite sheet。

## 24 份可复制生图提示词

### 1. 荆背野猪 / `boar_thornback`

```text
Use case: stylized-concept
Asset type: game character concept and pixel-sprite production master
Primary request: a Thornback Boar enemy for a Japanese medieval fantasy idle RPG grassland biome
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a compact wild boar with a low heavy body, oversized pale tusks, moss-green thorn-like bristles along its back, dark brown hide, sturdy short legs, and a small leather snare scar around one foreleg; aggressive but not grotesque
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted color ramps, no anti-aliasing
Composition/framing: one isolated full-body unit, three-quarter top-down game view, facing left, neutral alert idle pose, centered with generous padding, complete silhouette and all feet visible, readable when reduced to roughly 20x16 logical pixels
Lighting/mood: clear neutral daylight readability, adventurous early-game tone
Color palette: dark umber, warm brown, muted moss green, bone ivory, small amber eye accent; do not use #ff00ff in the subject
Materials/textures: coarse bristles, matte hide, hard tusks expressed with compact pixel clusters
Constraints: single creature only; crisp outer contour; no cast shadow; no contact shadow; no text; no logo; no watermark
Avoid: background scenery, grass patch, extra animals, rider, armor suit, photorealism, 3D render, smooth vector art, painterly blur, multiple poses, turnaround sheet, sprite sheet, UI frame
```

### 2. 草原地精猎手 / `goblin_trapper`

```text
Use case: stylized-concept
Asset type: game character concept and pixel-sprite production master
Primary request: a Grassland Goblin Trapper enemy for a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a small wiry goblin hunter wearing a patched brown leather cap and short tan vest, carrying a compact wooden crossbow, a clearly visible coil of rope, and a small trap pouch; long ears, clever amber eyes, practical scavenged gear, no modern equipment
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted color ramps, no anti-aliasing
Composition/framing: one isolated full-body unit, three-quarter top-down game view, facing left, cautious idle stance with crossbow lowered, centered with generous padding, both hands and feet readable, strong silhouette at roughly 16x20 logical pixels
Lighting/mood: neutral daylight readability, mischievous early-game threat rather than comedy
Color palette: olive skin, warm brown leather, straw tan cloth, dark wood, small rust-red accents; do not use #ff00ff in the subject
Materials/textures: worn leather, rough rope, simple wood and iron fittings rendered as hard pixel clusters
Constraints: single character only; no active projectile; no separate trap beside the character; no cast shadow; no text; no logo; no watermark
Avoid: background scenery, oversized head, cute mascot proportions, guns, steampunk machinery, photorealism, 3D render, smooth vector art, multiple poses, turnaround sheet, sprite sheet, UI card
```

### 3. 套索陷阱 / `summon.snare_trap`

```text
Use case: stylized-concept
Asset type: game summon and trap concept and pixel-sprite production master
Primary request: a magical but low-tech Snare Trap summon for a Japanese medieval fantasy idle RPG grassland biome
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a compact circular rope snare mounted between three sharpened wooden stakes and a small wooden pressure plate, with one restrained amber warning rune and a clear jaw-like closing silhouette; handmade goblin construction, fully self-contained
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 10-14 color palette, no anti-aliasing
Composition/framing: one isolated trap only, three-quarter top-down game view, centered with generous padding, circular footprint fully visible, readable when reduced to roughly 16x12 logical pixels
Lighting/mood: neutral gameplay readability, obvious hazard without excessive visual effects
Color palette: dry wood brown, hemp tan, dark iron, amber rune; do not use #00ff00 in the subject
Materials/textures: rough rope, split wood, dull iron expressed with compact hard-edged clusters
Constraints: single object only; no creature caught in it; no cast shadow; no contact shadow; no loose particles; no text; no logo; no watermark
Avoid: bear trap made entirely of steel, modern hunting gear, background grass, blood, gore, photorealism, 3D render, soft glow, transparency effects, multiple states, sprite sheet, UI icon frame
```

### 4. 苔甲巨甲虫 / `beetle_mossback`

```text
Use case: stylized-concept
Asset type: game creature concept and pixel-sprite production master
Primary request: a Mossback Beetle enemy for a misty forest in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a broad six-legged forest beetle with a domed dark teal shell, layered moss plates, a short amber horn, small pale fungal spots, and powerful front legs; sturdy defensive silhouette, clearly different from a generic real-world beetle
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted ramps, no anti-aliasing
Composition/framing: one isolated full-body creature, three-quarter top-down game view, facing left, low defensive idle pose, centered with generous padding, all six legs separated enough to read at roughly 20x16 logical pixels
Lighting/mood: cool filtered forest light translated into clean gameplay colors
Color palette: deep teal, bark brown, muted moss green, amber horn, pale cream fungal accents; do not use #ff00ff in the subject
Materials/textures: hard shell plates, soft moss patches, matte horn represented with compact pixel clusters
Constraints: single creature only; crisp silhouette; no cast shadow; no ground patch; no text; no logo; no watermark
Avoid: photoreal insect anatomy, iridescent rainbow shell, giant wings spread open, extra plants, 3D render, smooth vector art, blur, multiple poses, sprite sheet, UI frame
```

### 5. 苔冠萨满 / `shaman_mosscap`

```text
Use case: stylized-concept
Asset type: game character concept and pixel-sprite production master
Primary request: a Moss-Cap Shaman enemy for a misty forest in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a small forest shaman creature beneath a wide layered moss-and-mushroom cap, holding a crooked twig staff with a closed seed pod, wearing bark charms and a short leaf mantle; mysterious face mostly hidden except for two pale eyes; not the same silhouette as a walking mushroom
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, hand-painted color ramps, no anti-aliasing
Composition/framing: one isolated full-body character, three-quarter top-down game view, facing left, staff planted in a neutral casting-ready idle pose, centered with generous padding, readable at roughly 16x21 logical pixels
Lighting/mood: dim enchanted forest mood while retaining high gameplay readability
Color palette: moss green, dark bark brown, muted turquoise, cream eyes, small ochre seed accents; do not use #ff00ff in the subject
Materials/textures: layered cap, rough bark, dry seed pod and leaf fabric shown with hard pixel clusters
Constraints: single character only; no planted pod beside it; no floating spores; no cast shadow; no text; no logo; no watermark
Avoid: cute fairy, human wizard, oversized magic effects, smoke, translucent particles, photorealism, 3D render, painterly blur, multiple poses, sprite sheet, UI card
```

### 6. 孢子囊 / `summon.spore_pod`

```text
Use case: stylized-concept
Asset type: game summon concept and pixel-sprite production master
Primary request: a hostile Spore Pod summon for a misty forest in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a rooted bulb-shaped seed pod with four thick overlapping petals, a dark bark base, pale turquoise pores, and short thorny roots; closed but visibly pressurized, designed as a destructible poison-emitting battlefield object
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 10-14 color palette, no anti-aliasing
Composition/framing: one isolated object only, three-quarter top-down game view, centered with generous padding, complete root silhouette visible, readable when reduced to roughly 14x15 logical pixels
Lighting/mood: eerie forest bioluminescence expressed as opaque hard-edged highlights
Color palette: deep moss, bark brown, muted turquoise, pale cream pores; do not use #ff00ff in the subject
Materials/textures: leathery petals, woody roots and compact pore clusters
Constraints: single pod only; no smoke cloud; no semi-transparent spores; no cast shadow; no ground patch; no text; no logo; no watermark
Avoid: flower bouquet, cute plant, glossy plastic, realistic botanical illustration, 3D render, soft glow, blur, multiple growth stages, sprite sheet, UI icon frame
```

### 7. 晶背穴兽 / `crawler_crystalback`

```text
Use case: stylized-concept
Asset type: game creature concept and pixel-sprite production master
Primary request: a Crystalback Crawler enemy for an abandoned mine in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a squat four-legged cave beast with charcoal stone skin, long digging claws, a wedge-shaped head, and a ridge of cyan-blue mineral crystals growing from its back; animal anatomy rather than a recolored lizard, built to crawl through narrow tunnels
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted ramps, no anti-aliasing
Composition/framing: one isolated full-body creature, three-quarter top-down game view, facing left, stalking idle pose, centered with generous padding, full tail and claws visible, readable at roughly 21x15 logical pixels
Lighting/mood: dark mine character colors with bright but controlled crystal readability
Color palette: charcoal, slate gray, cyan, pale blue-white, small rust-brown claw accents; do not use #00ff00 in the subject
Materials/textures: rough stone hide and angular opaque crystal facets expressed with hard pixel clusters
Constraints: single creature only; no crystal projectiles; no cave scenery; no cast shadow; no text; no logo; no watermark
Avoid: dragon, salamander recolor, transparent crystals, neon bloom, photorealism, 3D render, smooth vector art, multiple poses, sprite sheet, UI frame
```

### 8. 狗头人爆破手 / `kobold_sapper`

```text
Use case: stylized-concept
Asset type: game character concept and pixel-sprite production master
Primary request: a Kobold Sapper enemy for an abandoned mine in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a small dog-faced kobold miner wearing a battered leather cap and brass goggles, carrying a short wooden mallet, a coil of fuse, and a compact tool satchel; soot-marked brown fur, alert ears, practical medieval mining gear
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted color ramps, no anti-aliasing
Composition/framing: one isolated full-body character, three-quarter top-down game view, facing left, cautious idle stance, centered with generous padding, hands, feet, fuse and goggles clearly readable at roughly 16x20 logical pixels
Lighting/mood: warm lantern-lit color impression converted into neutral gameplay readability
Color palette: dark brown fur, tan leather, dull brass, charcoal soot, small ember-orange fuse tip; do not use #00ff00 in the subject
Materials/textures: worn leather, scratched brass, rough wood and braided fuse shown with compact pixel clusters
Constraints: single character only; no barrel beside it; no explosion; no cast shadow; no text; no logo; no watermark
Avoid: firearms, modern dynamite vest, steampunk robot, cute mascot proportions, photorealism, 3D render, blur, multiple poses, sprite sheet, UI card
```

### 9. 火药桶 / `summon.powder_keg`

```text
Use case: stylized-concept
Asset type: game summon and trap concept and pixel-sprite production master
Primary request: a hostile Powder Keg summon for an abandoned mine in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a short heavy wooden powder barrel with dark iron bands, a wedged stone base, one bright burning fuse, and a simple red hazard cloth tied below the rim; visibly destructible and readable as an imminent explosion hazard
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 10-14 color palette, no anti-aliasing
Composition/framing: one isolated barrel only, three-quarter top-down game view, centered with generous padding, full silhouette and fuse visible, readable at roughly 13x16 logical pixels
Lighting/mood: tense but clean gameplay readability; fuse light represented with opaque pixels only
Color palette: warm wood brown, black iron, rust red cloth, orange-yellow fuse; do not use #00ff00 in the subject
Materials/textures: rough staves, dull iron hoops, braided fuse expressed with compact hard-edged clusters
Constraints: single object only; no explosion cloud; no sparks outside a tiny opaque fuse tip; no cast shadow; no text; no logo; no watermark
Avoid: modern oil drum, realistic gunpowder label, skull text, photorealism, 3D render, smoke, soft glow, multiple states, sprite sheet, UI frame
```

### 10. 墓穴猎犬 / `hound_grave`

```text
Use case: stylized-concept
Asset type: game creature concept and pixel-sprite production master
Primary request: a Grave Hound undead enemy for a haunted cemetery in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a lean undead hound with dark gray hide, exposed bone-like armor plates along the shoulders and muzzle, a narrow ribbed silhouette, pale violet soul-fire eyes, and a short broken collar chain; supernatural but not graphic or decayed in realistic detail
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted ramps, no anti-aliasing
Composition/framing: one isolated full-body creature, three-quarter top-down game view, facing left, tense stalking idle pose, centered with generous padding, all legs and chain visible, readable at roughly 21x15 logical pixels
Lighting/mood: cold moonlit cemetery mood with strong silhouette readability
Color palette: charcoal gray, bone ivory, desaturated violet, dark steel; do not use #00ff00 in the subject
Materials/textures: matte hide, hard bone plates and dull chain rendered with compact pixel clusters
Constraints: single creature only; no blood; no gore; no exposed organs; no cast shadow; no text; no logo; no watermark
Avoid: zombie realism, cute dog, full skeleton dog, background graves, smoke wisps, transparent flame, 3D render, blur, multiple poses, sprite sheet, UI frame
```

### 11. 食尸掘墓者 / `ghoul_gravedigger`

```text
Use case: stylized-concept
Asset type: game character concept and pixel-sprite production master
Primary request: a Ghoul Gravedigger enemy for a haunted cemetery in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a hunched ghoul laborer with desaturated gray-green skin, a torn dark coat, a frayed burgundy scarf, an old iron shovel, and a few coffin-chain links around its belt; long arms and heavy posture, eerie but not graphically decomposed
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, hand-painted color ramps, no anti-aliasing
Composition/framing: one isolated full-body character, three-quarter top-down game view, facing left, shovel resting diagonally in a neutral idle pose, centered with generous padding, feet and tool fully visible, readable at roughly 17x22 logical pixels
Lighting/mood: dim cemetery atmosphere translated into clean high-contrast gameplay colors
Color palette: gray-green skin, charcoal coat, burgundy cloth, dull iron, bone-white eyes; do not use #ff00ff in the subject
Materials/textures: torn cloth, weathered iron and coarse skin expressed with hard pixel clusters
Constraints: single character only; no grave mound; no detached body parts; no blood; no gore; no cast shadow; no text; no logo; no watermark
Avoid: realistic corpse, comedy zombie, modern clothing, background scenery, photorealism, 3D render, painterly blur, multiple poses, sprite sheet, UI card
```

### 12. 爬行断手 / `summon.crawling_hand`

```text
Use case: stylized-concept
Asset type: game summon creature concept and pixel-sprite production master
Primary request: a hostile Crawling Hand summon for a haunted cemetery in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: an animated skeletal hand crawling on its fingertips, attached to one short weathered coffin-chain link and a small cracked wrist shackle; bony, compact, readable as a grabbing minion, with no flesh or graphic severed surface
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 8-12 color palette, no anti-aliasing
Composition/framing: one isolated small creature only, three-quarter top-down game view, facing left, fingers spread in a low crawling idle pose, centered with generous padding, readable at roughly 14x10 logical pixels
Lighting/mood: eerie moonlit readability with restrained violet rune accents
Color palette: aged bone ivory, cool gray, dark iron, tiny violet rune; do not use #00ff00 in the subject
Materials/textures: dry bone, cracked metal shackle and short chain represented with compact pixels
Constraints: single hand only; no arm; no blood; no gore; no cast shadow; no smoke; no text; no logo; no watermark
Avoid: realistic severed hand, fleshy zombie hand, extra bones, background grave, photorealism, 3D render, blur, multiple poses, sprite sheet, UI icon frame
```

### 13. 霜角岩羊 / `goat_frosthorn`

```text
Use case: stylized-concept
Asset type: game creature concept and pixel-sprite production master
Primary request: a Frosthorn Ibex enemy for a snowy mountain pass in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a stocky mountain ibex with white-gray winter fur, large backward-curving horns made of opaque blue ice segments, dark sturdy hooves, and a compact armored brow; natural mountain animal proportions enhanced by fantasy frost
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted ramps, no anti-aliasing
Composition/framing: one isolated full-body creature, three-quarter top-down game view, facing left, braced charging-ready idle pose, centered with generous padding, horns and all hooves fully visible, readable at roughly 20x17 logical pixels
Lighting/mood: crisp cold daylight, sturdy and confrontational
Color palette: snow white, cool gray, ice blue, navy shadow, small dark eye accent; do not use #00ff00 in the subject
Materials/textures: thick fur clusters, hard opaque ice horn facets and matte hooves
Constraints: single creature only; no snow ground; no breath fog; no cast shadow; no text; no logo; no watermark
Avoid: domestic goat comedy, transparent horns, reindeer antlers, photorealism, 3D render, soft fur rendering, blur, multiple poses, sprite sheet, UI frame
```

### 14. 霜原豺狼人猎手 / `gnoll_rime_trapper`

```text
Use case: stylized-concept
Asset type: game character concept and pixel-sprite production master
Primary request: a Rime Gnoll Trapper enemy for a snowy mountain pass in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a lean hyena-faced gnoll hunter with brown-gray fur, a layered white fur mantle, a compact bone-and-wood crossbow, and a visible folded frost trap attached to a blue leather pack; practical medieval wilderness gear
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, hand-painted color ramps, no anti-aliasing
Composition/framing: one isolated full-body character, three-quarter top-down game view, facing left, alert idle stance with crossbow lowered, centered with generous padding, readable at roughly 17x22 logical pixels
Lighting/mood: cold high-altitude daylight with clear combat silhouette
Color palette: brown-gray fur, snow white mantle, muted ice blue leather, bone ivory, dark wood; do not use #00ff00 in the subject
Materials/textures: coarse fur, layered leather, bone crossbow and folded metal trap expressed with compact pixels
Constraints: single character only; no separate trap on the ground; no projectile; no cast shadow; no text; no logo; no watermark
Avoid: wolf-headed human, modern winter gear, rifle, cute mascot, background snow, photorealism, 3D render, blur, multiple poses, sprite sheet, UI card
```

### 15. 霜牙夹 / `summon.rimejaw_trap`

```text
Use case: stylized-concept
Asset type: game summon and trap concept and pixel-sprite production master
Primary request: a Rimejaw Trap summon for a snowy mountain pass in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a compact open-jaw hunting trap made from dark iron and carved bone teeth, rimmed with opaque blue frost plates and one small geometric ice rune, clearly distinct from a rope snare
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 10-14 color palette, no anti-aliasing
Composition/framing: one isolated trap only, three-quarter top-down game view, centered with generous padding, complete jaw outline visible, readable at roughly 16x11 logical pixels
Lighting/mood: cold hazard readability with restrained opaque frost highlights
Color palette: dark iron, bone ivory, ice blue, navy shadow; do not use #00ff00 in the subject
Materials/textures: blunt aged metal, carved bone and hard opaque frost facets rendered with compact pixels
Constraints: single object only; no victim; no blood; no cast shadow; no snow patch; no particles; no text; no logo; no watermark
Avoid: modern bear trap realism, transparent ice, rope snare silhouette, photorealism, 3D render, soft glow, multiple states, sprite sheet, UI icon frame
```

### 16. 熔核岩蛞蝓 / `slug_magma`

```text
Use case: stylized-concept
Asset type: game creature concept and pixel-sprite production master
Primary request: a Magma Slug enemy for a lava cave in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a broad slow cave slug with a black volcanic rock shell fused to its back, glowing orange fissures, a dark red underside, two short stone feelers, and a blunt wedge-shaped head; opaque molten interior with no translucent slime
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, hand-painted warm color ramps, no anti-aliasing
Composition/framing: one isolated full-body creature, three-quarter top-down game view, facing left, low crawling idle pose, centered with generous padding, entire tail and shell visible, readable at roughly 22x13 logical pixels
Lighting/mood: intense volcanic heat expressed through controlled color contrast rather than bloom
Color palette: obsidian black, charcoal, deep red, orange, yellow-white fissure tips; do not use #00ff00 in the subject
Materials/textures: rough rock shell and opaque molten cracks shown with compact hard-edged clusters
Constraints: single creature only; no lava puddle; no slime trail; no smoke; no cast shadow; no text; no logo; no watermark
Avoid: realistic snail, transparent liquid body, neon bloom, background cave, photorealism, 3D render, smooth gradients, multiple poses, sprite sheet, UI frame
```

### 17. 烬火教徒 / `cultist_cinder`

```text
Use case: stylized-concept
Asset type: game character concept and pixel-sprite production master
Primary request: a Cinder Cultist enemy for a lava cave in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a short hooded fire cultist in layered charcoal robes with ember-red hems, holding a crooked burned staff and a small red-copper talisman; face hidden in shadow with two orange eyes, practical medieval fantasy clothing, no visible modern symbols
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted ramps, no anti-aliasing
Composition/framing: one isolated full-body character, three-quarter top-down game view, facing left, staff held close in a neutral ritual-ready idle pose, centered with generous padding, readable at roughly 16x21 logical pixels
Lighting/mood: ominous volcanic ritual mood with clear gameplay silhouette
Color palette: charcoal, dark brown, ember red, orange, dull copper; do not use #00ff00 in the subject
Materials/textures: scorched cloth, charred wood and scratched copper expressed with compact pixel clusters
Constraints: single character only; no totem beside it; no flames floating around it; no cast shadow; no text; no logo; no watermark
Avoid: historical real-world religious symbols, giant fire aura, modern cult clothing, photorealism, 3D render, soft glow, blur, multiple poses, sprite sheet, UI card
```

### 18. 余烬图腾 / `summon.ember_totem`

```text
Use case: stylized-concept
Asset type: game summon concept and pixel-sprite production master
Primary request: a hostile Ember Totem summon for a lava cave in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a squat black obsidian totem with three stacked carved faces, three bright orange-red fissures, a red-copper binding ring, and a compact crown of opaque angular flame shapes; sturdy destructible battlefield object
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 10-14 color palette, no anti-aliasing
Composition/framing: one isolated object only, three-quarter top-down game view, centered with generous padding, complete base and flame crown visible, readable at roughly 14x18 logical pixels
Lighting/mood: concentrated volcanic power expressed without soft bloom
Color palette: obsidian black, charcoal, ember red, orange, yellow-white, dull copper; do not use #00ff00 in the subject
Materials/textures: chipped stone, engraved faces, hard-edged opaque flames and metal ring rendered with compact pixels
Constraints: single object only; no altar; no smoke; no floating embers; no cast shadow; no text; no logo; no watermark
Avoid: wooden tribal pole, real-world cultural motifs, transparent fire, background lava, photorealism, 3D render, soft glow, multiple states, sprite sheet, UI icon frame
```

### 19. 以太天鳐 / `manta_aether`

```text
Use case: stylized-concept
Asset type: game flying creature concept and pixel-sprite production master
Primary request: an Aether Manta enemy for floating sky ruins in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a small airborne manta-shaped ancient construct with broad stone wings, a compact central eye core, cyan energy channels, gold hinge plates, and a short segmented tail; clearly a magical ruin creature rather than a normal sea animal
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, hand-painted stone and metal ramps, no anti-aliasing
Composition/framing: one isolated full-body flying unit, three-quarter top-down game view, facing left, wings gently spread in a neutral hover pose, centered with generous padding, readable at roughly 23x14 logical pixels
Lighting/mood: bright high-altitude clarity with restrained ancient magic
Color palette: pale stone, slate blue, cyan, white core, antique gold; do not use #ff00ff in the subject
Materials/textures: chipped stone plates, dull gold joints and opaque cyan channels expressed with hard pixel clusters
Constraints: single creature only; no cloud; no shadow below; no energy trail; no text; no logo; no watermark
Avoid: realistic manta ray, bird feathers, transparent wings, neon bloom, background ruins, photorealism, 3D render, blur, multiple poses, sprite sheet, UI frame
```

### 20. 遗迹构装师 / `artificer_ruin`

```text
Use case: stylized-concept
Asset type: game construct character concept and pixel-sprite production master
Primary request: a Ruin Artificer enemy for floating sky ruins in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a small non-human ancient maintenance construct with a round stone torso, one cyan lens, two asymmetrical brass tool arms, short articulated legs, a folded rune plate on its back, and chipped ceremonial gold trim
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted material ramps, no anti-aliasing
Composition/framing: one isolated full-body unit, three-quarter top-down game view, facing left, tools lowered in a neutral maintenance-ready idle pose, centered with generous padding, readable at roughly 17x20 logical pixels
Lighting/mood: curious ancient machinery turned hostile, bright readable silhouette
Color palette: pale stone, slate gray, antique gold, cyan lens, dark joint shadows; do not use #ff00ff in the subject
Materials/textures: chipped masonry, tarnished brass and opaque crystal lens rendered with compact pixels
Constraints: single construct only; no deployed pylon; no floating tools; no cast shadow; no text; no logo; no watermark
Avoid: human engineer, steampunk costume, modern robot, cute household robot, photorealism, 3D render, smooth vector art, multiple poses, sprite sheet, UI card
```

### 21. 风暴棱塔 / `summon.storm_pylon`

```text
Use case: stylized-concept
Asset type: game summon concept and pixel-sprite production master
Primary request: a hostile Storm Pylon summon for floating sky ruins in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a compact triangular stone pylon with three stepped faces, a suspended cyan core ring, antique gold corner braces, and two short opaque blue-white lightning arcs locked close to the structure; destructible ancient ruin device
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 10-14 color palette, no anti-aliasing
Composition/framing: one isolated object only, three-quarter top-down game view, centered with generous padding, complete base and top visible, readable at roughly 14x19 logical pixels
Lighting/mood: charged arcane storm energy with strict gameplay readability and no soft bloom
Color palette: pale stone, slate gray, cyan, blue-white, antique gold; do not use #ff00ff in the subject
Materials/textures: chipped stone, metal braces, opaque core ring and angular lightning pixels
Constraints: single object only; no ground rune circle; no loose particles; no cast shadow; no text; no logo; no watermark
Avoid: Tesla coil, modern electronics, transparent energy, large lightning storm, photorealism, 3D render, soft glow, multiple states, sprite sheet, UI icon frame
```

### 22. 深渊魔犬 / `hound_abyssal`

```text
Use case: stylized-concept
Asset type: game creature concept and pixel-sprite production master
Primary request: an Abyssal Hound enemy for a demon castle in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a heavy demonic war hound with black-purple plate-like hide, a broad armored skull, two short backward horns, dark red fissures along the shoulders, thick claws, and a broken iron chain; powerful living demon silhouette, clearly distinct from a lean undead grave hound
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, subtle hand-painted ramps, no anti-aliasing
Composition/framing: one isolated full-body creature, three-quarter top-down game view, facing left, low aggressive idle pose, centered with generous padding, full horns, tail, chain and feet visible, readable at roughly 22x17 logical pixels
Lighting/mood: oppressive final-region threat with strong high-contrast readability
Color palette: near-black purple, dark steel, crimson, muted violet, pale yellow eye; do not use #00ff00 in the subject
Materials/textures: armored hide plates, rough horns and heavy iron chain rendered with compact pixel clusters
Constraints: single creature only; no fire aura; no smoke; no cast shadow; no blood; no text; no logo; no watermark
Avoid: three-headed dog, full armor costume, cute canine, background castle, photorealism, 3D render, soft glow, multiple poses, sprite sheet, UI frame
```

### 23. 魔狱看守 / `gaoler_demon`

```text
Use case: stylized-concept
Asset type: game character concept and pixel-sprite production master
Primary request: a Demon Gaoler enemy for a demon castle in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a tall broad demon jailer in dark iron lamellar armor, with deep red skin, two blunt horns, a closed visor-like brow, a heavy chain-hook staff, a ring of keys and a short torn purple tabard; imposing, wingless, practical medieval dark-fantasy silhouette
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 12-16 color palette, hand-painted material ramps, no anti-aliasing
Composition/framing: one isolated full-body character, three-quarter top-down game view, facing left, chain-hook grounded in a neutral guard idle pose, centered with generous padding, weapon and feet fully visible, readable at roughly 18x24 logical pixels
Lighting/mood: stern final-dungeon menace with readable armor separation
Color palette: dark iron, deep red, black-purple, dull brass keys, bone horn highlights; do not use #00ff00 in the subject
Materials/textures: scratched iron plates, heavy chain, worn cloth and horn rendered with compact pixel clusters
Constraints: single character only; no soul cage beside it; no wings; no floating souls; no cast shadow; no text; no logo; no watermark
Avoid: final boss scale, ornate royal armor, modern prison uniform, gore, photorealism, 3D render, blur, multiple poses, sprite sheet, UI card
```

### 24. 囚魂笼 / `summon.soul_cage`

```text
Use case: stylized-concept
Asset type: game summon and trap concept and pixel-sprite production master
Primary request: a hostile Soul Cage summon for a demon castle in a Japanese medieval fantasy idle RPG
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal; one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation
Subject: a compact black-iron birdcage-shaped ritual device with four hooked feet, bone-white rune stones around the rim, a locked central purple soul-flame represented as opaque angular shapes, and one heavy chain loop; destructible battlefield prison, not a living creature
Style/medium: hand-drawn pixel art, classic 16-bit JRPG game sprite aesthetic, deliberate pixel clusters, crisp hard edges, limited 10-14 color palette, no anti-aliasing
Composition/framing: one isolated object only, three-quarter top-down game view, centered with generous padding, complete cage bars, feet and chain visible, readable at roughly 15x19 logical pixels
Lighting/mood: ominous necrotic restraint with controlled high-contrast gameplay readability
Color palette: black iron, dark purple, violet, bone ivory, tiny crimson lock accent; do not use #00ff00 in the subject
Materials/textures: heavy iron bars, chipped rune stones, opaque hard-edged soul flame and chain
Constraints: single object only; no visible person inside; no smoke; no translucent wisps; no cast shadow; no text; no logo; no watermark
Avoid: ordinary pet cage, realistic torture device, gore, floating ghost face, background dungeon, photorealism, 3D render, soft glow, multiple states, sprite sheet, UI icon frame
```

## 美术落地规范

1. 每个单位先保留一张选定的无背景母版和最终使用的完整 prompt。
2. 纯色背景按 chroma-key 流程移除；抠图结果必须有透明角、无色边、无投影残留。复杂软毛、烟雾与半透明光效已在提示词中主动规避。
3. 将母版人工归纳为项目字符网格，而非直接缩小高分辨率图：
   - 普通常驻兽类建议 18 至 23px 宽、14 至 18px 高。
   - 普通常驻人形建议 15 至 18px 宽、19 至 24px 高。
   - 召唤装置建议 12 至 16px 宽、10 至 19px 高。
   - 环境 Hazard 另做 8 套机制小图集，每套至少含 `concealed/revealed/active/cooldown`；warning 由通用程序层绘制。底座按 12 至 24px 占地设计，方向型机关按四向离散帧或运行时镜像处理。它们不是 Actor，不生成 Portrait。
4. 使用 8 至 16 个主体颜色，透明不计；保留 `Game.assets` 自动深色外描边的空间，内部不重复画完整双描边。
5. 默认朝左，脚底或装置底座为 anchor；飞行单位 anchor 仍落在其地面投影中心，但素材本身不绘制投影。
6. 至少提供 `idle0`；生物优先由 `squash` 或 `bob` 派生 `idle1`，固定装置可保持静止或只移动顶部 1px。需要独立触发帧时再增加 `cast0/trigger0`，不预先制造空帧。
7. `spriteId` 使用独立稳定美术 ID；`portraitId` 可复用 Sprite。严格审计前完成 `Game.assets.defineSprite(...)` 注册。
8. 在 `tech-demos/units` 同屏检查四个常驻怪、Boss 和召唤物；在 `tech-demos/map-effects` 检查全部 damage/ambush Hazard 的状态、范围、方向、遮挡、低特效降级和多实例上限；最后在地图现场检查缩放与玩法可读性。
9. Hazard 的 telegraph、箭头、命中线、碎屑与残留优先使用 Canvas 硬边绘制，不新增 16 份 ImageGen 主体提示词；只有机制底座/环境嵌入物需要像素图集。程序绘制参数仍由 `HazardVisualProfile` 数据化，禁止在 renderer 写区域特判。

## i18n 与作者内容清单

每个新 Actor 至少提供：

- `monster.<actorId>.name`
- `monster.<actorId>.desc`
- `combat.lore.<actorId>`
- `combat.ability.<actorId>_basic.name`
- 每个 signature Action 的 `presentation.nameKey`
- 新增 Status 的 `presentation.nameKey`

每个 Hazard 至少提供：

- `<profileId>.name`
- `<profileId>.desc`
- `<profileId>.warning`
- `<profileId>.hit`
- 伏击另含 `<profileId>.ambush`

Pack-local `locales` 必须同时包含 `zh-CN` 与 `en`，不得只往全局语言表补单语 key。英文 Actor 与 Hazard 名称采用本规划表格的斜杠后名称。描述、Lore、警告和命中提示保持短句，避免在紧凑 HUD 中溢出；纯视觉警示不以 Toast 连续刷屏。

## 实施顺序

1. **工厂泛化**：支持任意数量 `normals`、独立 `summons/hazards`、显式 `encounterRecipes` 与 `guardianBaseId`，保持旧两怪输入仍可编译。
2. **召唤安全接缝**：实现 World attach/detach、无奖励/无讨伐/无掉落、固定 sequence、Encounter 回收和可见性测试。
3. **Hazard 基础**：增加 `HazardProfile/HazardVisualProfile` schema、引用与数值审计，完成确定性 placement、swept trigger、fixed-tick 状态机、外部 EffectSource、持久发现/冷却和 PresentationEvent 桥接。
4. **双 Lab 技术验证**：先在 `tech-demos/units` 注册草原三单位，验证 summon、定身、寻路、点击目标、死亡与 Estimator；在 `tech-demos/map-effects` 注册草原荆棘暗桩与伏击，验证触发、绕行、存读档、关闭特效和减少动态效果。
5. **八区内容**：按区域逐一添加 Actor、damage Hazard、ambush Hazard 与 Pack-local i18n，每完成一区即运行严格 bundle/audit。
6. **精灵与 FX 制作**：本轮以可替换的代码手绘像素精灵覆盖 24 个 Actor，并按 HazardVisualProfile 以像素图元落地 8 套 Hazard 的 telegraph、粒子、命中与残留；24 份 prompts 留作未来逐资产换图，不是本轮发布依赖。
7. **平衡回归**：更新 Encounter 权重与离线代表 Pack，跑五职业固定 seed；另以三种远征策略跑八区 Hazard 路径种子，检查首通时间、死亡率、平均战斗时长、召唤物存活占比、陷阱触发率和 30 秒承伤预算。
8. **文档归一**：实施验收后，把主规划的“24 怪物”旧合同更新为 32 个常驻普通怪、8 个 Boss、8 个召唤 Actor，并登记 8 个 damage Hazard + 8 个 ambush Hazard；同步精简更新 README，不把本文件当更新日志并存两套正式口径。
9. **地图验收与发布**：确认八区现场、HUD、自动远征和低特效表现；实际发布改动 HTML/CSS/JS/字体或精灵注册脚本时，再统一提升 `BUILD_ID` 并执行缓存版本测试。

## 验收清单

- 编译后普通怪从 16 个增至 32 个，Boss 仍为 8 个，召唤 Actor 为 8 个，总怪物相关 Actor 为 48 个。
- 每区 Catalog 有 4 个 `monsters` 和 1 个 `summons`；召唤物不出现在 Population mount 选择中。
- 每区 Catalog 另有 1 个 damage Hazard 和 1 个 ambush Hazard；二者都不注册 Actor、Reward、WorldSpawnProfile、Population slot、敌方 team 或血条。
- 每区所有 regular Pack 初始 1 至 3 个成员；含召唤者 Pack 初始至多 2 个成员且仅 1 个召唤者。
- 同 seed、同输入下，召唤 tick、Actor instance ID、加入顺序、目标选择和伤害日志完全一致。
- `maxActive: 1` 生效；重复施法不会累积第二个同源召唤物。
- 套索陷阱、火药桶和霜牙夹成功触发后各只结算一次并 `selfDestruct`；提前击毁不结算触发伤害，自毁不产生奖励或击杀事件。
- 召唤物在世界画布可见、可点击、可受击、有合法血条和碰撞体；死亡或 Encounter 结束后从 Actor registry 与世界表现集合各清除一次。
- 击毁召唤物不会获得 EXP、金币、装备、药水、讨伐进度或击杀统计。
- 召唤者死亡后，遗留召唤物仍可被选中和击毁；不存在不可达装置导致的 Encounter 卡死。
- CombatEstimator 与在线战斗都执行 summon Effect，离线收益不绕过新增单位强度。
- 同世界种子、布局版本和区域下，Hazard instance ID、位置、方向、warning/active tick、目标集合、伤害日志与 cooldown 完全一致；高速 swept crossing 也只结算一次。
- 八区所有伤害陷阱均有合法绕行路线，不覆盖营地/入口/交互圈/唯一窄路；safe/balanced/loot 三策略不会在 warning 中停滞、震荡或反复触发。
- 环境伤害经过 damage type 抗性与护盾，不产生闪避、暴击、吸血、威胁、掉落或击杀归属；飞行单位与非玩家生态不会误触首期地面陷阱。
- v14→v15 迁移只补空 Hazard 探索状态；发现、冷却、过期清理和布局版本失配回退通过存读档测试，warning/active/scheduler 不进入存档。
- ambush 只引用 `ambushEligible` regular Pack；触发前无伤害，入场完成前敌人不能 Action，Encounter 原子失败不遗留 Actor、Relation、Hazard 锁或 cooldown。
- 8 套 Hazard 机制图集与 24 个 Actor `spriteId` 均通过资产严格审计；缺图不得以占位精灵通过发布验收。
- 每个 Hazard 的 concealed/revealed awareness 与 dormant/warning/active/cooldown phase 均可辨；关闭特效或减少动态效果后仍保留范围、方向、分段进度、active 帧与命中定格。
- 同屏两处 warning/active、战斗 telegraph、伤害数字和 Actor 血条互不遮挡；390×700、390×844、522×1320 与桌面视口均无危险信息裁切。
- 中英文切换后 24 个 Actor 的名称、描述、Lore、Action、新增 Status，以及 16 个 Hazard 的名称、描述、警告和命中提示均无裸 key。
- `tech-demos/units`、地图现场检查器和正式入口读取同一个 `content.generated.js`，不建立演示专用怪物副本。

建议验证命令：

```powershell
node tools/build-content-bundle.js
node tools/build-content-bundle.js --check
node tools/audit-content.js
node tests/content-support-capabilities.test.js
node tests/v2-authoring.test.js
node tests/v2-content-validation.test.js
node tests/v2-content-entrypoints.test.js
node tests/unit-ecosystem-v14.test.js
node tests/v2-runtime.test.js
node tests/v2-balance-baseline.test.js
node tests/combat-portraits.test.js
node tests/hazard-content.test.js
node tests/hazard-runtime.test.js
node tests/hazard-layout.test.js
node tests/hazard-presentation.test.js
```

发布前若已改动任一 HTML/CSS/JS/字体：

```powershell
.\tools\set-build-id.ps1
node tests/cache-version.test.js
```
