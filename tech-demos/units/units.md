# Actor / Deterministic Combat Lab

`units.html` 是正式 Actor、内容编译器、Encounter、AI 与 50ms 战斗调度器的独立 QA 入口，不读取或写入正式存档。

## 深链

`?encounter=encounter.forest.boss&unit=adventurer&class=cleric&strategy=safe&seed=20260728&scenario=interrupt&lang=zh-CN`

参数：

- `encounter`：任一正式 `EncounterProfile`
- `unit`：任一 `ActorArchetype`，包括玩家、怪物、NPC、召唤物与 object
- `class`：玩家 Actor 职业
- `strategy`：`safe`、`balanced`、`aggressive`
- `seed`：Encounter RNG 种子
- `scenario`：基础、GCD/oGCD、资源、combo、打断、重叠预警、治疗威胁、嘲讽、中立、AOE、魅惑、召唤、Boss phase、外部 Engagement、不可通行区寻路/位移、MMO 接敌/增援/Evade、三阵营/中立观察者、投降 Objective
- `lang`：`zh-CN` 或 `en`

## 操作与检查

- 生成 1–4 名友方和 1–8 名敌方，调整主 Actor、阵营、控制器、策略、等级与阶级。
- 暂停、单 50ms tick、运行至下一次命中和 1/2/4/10 倍加速。
- 指定 Action、状态、驱散、打断、移动、魅惑与召唤。
- 复用正式 `combat_presentation` 与 FX，直接观察攻击帧/突进、斩击、弹道、受击火花、飘字、治疗、护盾和范围环。
- 并排检查数值 `CombatEvent`、表现 `PresentationEvent` 以及位移/接敌追踪；表现记录包含 tick、sequence、攻击双方、Ability、接触距离、碰撞下限与 overlap 诊断，不影响确定性结算。
- “不可通行区寻路 / 位移”场景挂载生产 `terrain_v3 + nav + combat`：双方需绕过墙带门洞后恢复攻击；一键地形回归同时验证后撤、击退扫掠截断、阻挡格合法性、旧非法坐标投影、动态分离与固定 tick 重寻路指标。
- “MMO 接敌 / 增援 / Evade”场景挂载生产 `Population + WorldAggro + Encounter + Effect DSL`：墙体两侧布置采集中的玩家、三个 pack 与召唤者，绘制感知/援助/leash 圆和 LOS；一键回归验证手动/自动感知、交互中断、整 pack 入战、一次增援、召唤继承/上限/零奖励、多领地脱战、不可攻击回巢、满状态恢复及已击败成员不复活。
- “双方肖像槽 QA”直接复用正式 `combat_portraits`：友方读取职业专用头像，敌方读取 Actor `portraitId`；同时公开来源模式、非空像素和容器边界，缺图时验证确定性像素剪影。
- 检查 Actor Card、Blueprint、来源、Actor 私有 Talent Ability/Status、属性账本、Unit 不变量、资源、冷却、combo、status 叠层、relation、threat、scheduler 与 telegraph。
- 自动枚举正式内容中的 Actor、Ability、Talent、Status、Resource、AI、Faction、EncounterPack 与 EncounterProfile。页面以正式生成 Bundle 为基础，并额外注册仅存在于 Lab 的 `lab.ecosystem-scenarios` QA Pack；目录数量从编译注册表实时读取，不以手写总数作为验收依据。
- v4 联系表从 16 个独立守卫/猎手 Pack 自动枚举正式 Sprite 与能力：逐只渲染手绘代码网格 `idle0`、算法派生 `idle1`、自动描边和整数缩放，并将缺图、透明帧或 placeholder 计为失败；区域配对可直接送入正式 Encounter 检查防御/突袭组合。
