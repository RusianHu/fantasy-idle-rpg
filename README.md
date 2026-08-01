# 幻境远征 · Fantasy Idle RPG

纯前端、可离线运行的 **2D 像素风挂机放置 RPG**（日式中世纪奇幻 / JRPG 风格）。
沉睡千年的魔王在露西亚大陆苏醒，瘴气蔓延八方--你是公会新晋的独行冒险者，从新手草原一路讨伐至魔王城。

## 运行方式

- **双击直开**：直接用浏览器打开 `index.html` 即可游玩（全部脚本按序 `<script>` 加载，无 ES Modules，file:// 协议可用）。
- **静态服务器**（可选）：`python -m http.server 8080` 后访问 `http://localhost:8080/`。
- **移动端优先**：设计基准 390×844 竖屏；桌面浏览器居中显示手机比例容器。
- 游玩无需现场构建、无外部网络依赖（仓库已提交确定性内容 Bundle；EasyStar.js 0.4.4 MIT 与 Fusion Pixel 字体均已本地固定）。修改 `*.pack.js` / `*.support.js` 后需重建内容 Bundle。

## 发布与缓存

- HTML 始终重新校验；CSS、JS、字体统一使用 `BUILD_ID` 查询版本并长期不可变缓存，避免手机端新旧资源混用。
- 发布前先重建并校验内容 Bundle、完成全量功能回归；确认 HTML/CSS/JS/字体不再变化后，执行唯一一次 `.\tools\set-build-id.ps1 -BuildId YYYYMMDD.N`，随后运行 `node tests\cache-version.test.js`。同一发布内 `index.html`、技术演示、`Game.BUILD_ID`、字体 URL 与 `version.json` 必须一致；bump 后若再修改发布资源，必须使用新的 `BUILD_ID` 重走此序列。
- 长开标签页每 5 分钟及 `pageshow` / 重新可见时以 `no-store` 检查 `version.json`；发现新版后显示中英文更新按钮，点击时先收束过场并保存，再重载页面。
- 线上目录 `/www/wwwroot/yanshanlaosiji.top/fantasy-idle-rpg` 是直接提供静态文件的 Git 工作树。发布时通过项目 SSH 辅助脚本登录，在保留 `.git` 与远端关联的前提下同步已测试提交；同步前记录旧 HEAD，必要时按提交回退，禁止用无仓库的解包目录覆盖站点。
- VPS 的项目专属 Nginx 规则位于 `deploy/nginx/fantasy-idle-rpg-cache.conf`。部署规则后必须先执行 `nginx -t`，通过后才能 reload。

## 玩法概览

| 系统 | 说明 |
| --- | --- |
| **开场体验** | 标题画面采用半俯视悬崖构图：全景先在半分辨率画布逐像素绘制，再以 2× 最近邻放大；四名公会成员在近岸营地围火、游侠在同侧河岸警戒上游，完整岩壁明确高台落差；远山曲流在崖口收束并与瀑布同轴，落入带浅滩、暗岸与河中岩石的横向河湾，视线继续跨过巨兽巢穴、不规则混生密林、多重雪山，最终落到山隘间极远的小比例魔王城；启动先展示无遮挡营地观景态，点击进入后才显示主操作，并可随时返回观景；纯空档使用独立的公会纹章「开始新游戏」特殊按钮，不套用档案槽位外壳，进行中档则显示远征档案、职业头像、等级、区域、游玩时长、路线进度、世界种子与「继续游戏」；选档前不启动主循环、不自动存档、不结算离线收益；确认后经传送光柱、符文与像素帘幕进入序章或世界 |
| **职业系统** | DnD 风格五职业（战士/盗贼/法师/牧师/游侠），开局选择、永久生效；数值成长、攻击方式（近战/远程弹道）、技能组、精灵立绘、武器全面区分 |
| **环境视觉** | 程序化多阶树冠大树（摇曳）、连续密度场草簇/花簇、烘焙色斑/裂纹/雪地反光、八区各 6 件专属 v3 地表装饰；普通装饰按生态适宜度、同类簇群、伴生锚点与八种形状语法形成岸带、行列、轨迹、环形和自然斑块。发光体光晕、林间光柱、道具软阴影、暗角与四层天气合成均执行视口剔除和降动态契约 |
| 挂机战斗 | 50ms 整数 tick 的确定性自动时间轴：GCD/oGCD、队列窗口、施法/引导/打断、行动锁、charge、职业资源、combo、Reaction、Status、威胁、护盾和治疗共用一条结算管线；敌对 pack 以 100ms 稳定感知、导航格 LOS 与 leash 入口双向接敌，初始 pack 整组警戒且战中最多加入一个同社会组常规 pack；离开全部参战领地后存活怪进入不可攻击的 Evade，沿生产导航回出生点并满状态重置 |
| 开放远征世界 | 八区均以世界种子生成稳定的 `2400×1440` v4 连续开放地图；14–18 个宏观中心、硬阻挡、宽窄路线、支路与环路共同形成可选择拓扑，每区另有 1–2 个半开放巢穴、真实墙体/双入口、固定宝箱和守卫锚点。16px 分层导航、扫掠碰撞、512px 分块渲染和空间桶支撑长途探索；v1/v2/v3 生成器与黄金摘要永久隔离保留 |
| 世界生态 | 八区 Population 先生成不可变 `PopulationMountPlan`，再通过稳定 SpawnLease 生成 Actor。地图以 `EncounterPoolProfile` 将怪物注册为普通、稀有、精英、巢穴与 Boss 类别，并按游荡、巡逻、伏击、资源/宝箱守卫及 Boss 门卫职能确定性解析；每区两种独立新怪进入稀有池及特殊池，稀有通道容量为 1。Population 统一管理死亡/逃跑后的重生，Encounter 内召唤物仍使用不入 Population、零奖励的 ephemeral 生命周期 |
| 环境机关与守卫 | 每区保留 1 类伤害陷阱与 1 类世界伏击 Hazard；伏击怪物改由地图池解析。每轮稳定抽取约 30% 资源节点配置显形或隐藏守卫，所有巢穴宝箱受守，Boss 门卫覆盖入口。隐藏站点复用 Hazard 侦测、天气/视野修正和扫掠触发；战斗以原子事务抢占交互，胜利解锁，失败不消费目标 |
| **自动/手动操控** | 世界舞台常驻双态开关，默认自动挂机；手动时停止玩家侧游走和主动索敌，支持脱战点地、点怪交战及 WASD/方向键，但敌方主动感知在两种模式下始终生效。Encounter 激活后点击只切换当前参战敌人的优先级，点地/WASD 不改坐标，追击、避让、位移与碰撞完全由固定 tick 管理；自动 AI 脱战后重新规划，手动模式原地待命 |
| **点触交互** | 点击怪物/地面发出交战或移动指令；点击掉落、采集节点、宝箱与交易实体会寻路走近并交互；点篝火=回营/拔营。主世界舞台支持鼠标滚轮/触控板与双指捏合连续调整 `0.75×–1.35×` 会话视野，刷新后恢复默认；Boss 与过场保持导演镜头优先 |
| **动作气泡** | 发现资源、开始采集、双方接敌警戒、Evade 回巢、发现宝箱或拾取战利品时显示短时纯图形像素气泡；左右行走时气泡落在后脑斜上方，上下行走时保持正上方，接敌/警戒按对手方向侧移并自动避开边缘与血条 |
| **掉落与环境** | 普通战斗装备/药水以像素实体落地并自动拾取，支持 24 件/60 秒保底回收和关闭开关即时入包；八区共 40 种资源定义，每区生成 16–22 个节点并使用独立 16-bit 世界精灵与持久冷却。合法移动可发现普通/稀有探索宝箱；普通箱仍可能成为噬宝匣。巢穴固定箱无 TTL、不参与噬宝匣、每轮仅领取一次，按中段/深区发放金币、区域材料和受控装备概率且不掉魔晶石 |
| 区域推进 | 新档按经典八区顺序推进；`RoutePlan` 保存稳定主线拓扑。揭雾、地标、资源、奇物、生态和 Boss 门卫共同构成准备度；Boss 仅在本轮门卫清除后生成。Boss 挑战失败进入 60 秒重试且不结束远征，已清门卫不重生；首杀仍解锁下一地区并发一次发现奖励，重复远征只发正常战斗奖励 |
| **最终通关** | 路线末区 Boss 首杀触发最终击杀演出与六句逐字后日谈，随后展示通关摘要（职业等级、累计游玩、总讨伐、Boss 击杀、世界种子）；演出期间暂停战斗、刷怪、世界时间、增益与统计，关闭后从已保存的后日谈或摘要恢复，完整结局每档只播放一次；可继续最终区域挂机或确认后重开新档，续玩战败仍适用魔王城失守规则 |
| 装备 | 武器/护甲/饰品 3 槽；5 档稀有度（灰绿蓝紫橙）；随机词条、职业/区域感知的综合对比、一键出售、传说分解魔晶石；武器按职业呈现（长剑/短匕/法杖/战锤/长弓） |
| 技能与 Talent | 五职业各有独立基础 Action Kit、资源和自动轮转；原 30 个稳定技能 ID 迁移为 V2 权威 Talent。被动等级进入 StatBlock Modifier，主动等级生成 Actor 私有 Ability/Status 视图，技能点成本、解锁和上限均读取 Talent Card，逐点产生真实收益 |
| **自动养成** | 自动 Talent 加点与智能换装默认开启：确定性混合评估器以无副作用角色预览计算输出、生存与收益，并结合无渲染 `CombatEstimator` 的 DPS/失败率摘要；三个装备槽可分别锁定，支持完整手动构筑 |
| 商店 / 交易 | 世界摊位、交易域 HUD 按钮与背包入口共用统一交易面板；购买能力取决于实时世界坐标，仅当前地图营地安全半径内开放，域外提供「返回当前营地」、浏览中跨出边界即时锁定商品；目录按地点/分区动态生成，含补给、装备、强化、素材兑换与收购；支持临时动态交易域接口 |
| **移动行商** | 八区按四名区域专属行商生成可攻击的中立 NPC；使用 v3 `walkableNav` 独立选点并避开营地、Boss 与 Population 预留，首次 Boss 挑战前保障本区至少触发一次会面。篷车、交易域固定在生成锚点，行商仅在其周围 32px 内巡游；实际移动时间触发、会面持续 6 分钟且离线/隐藏/交易/战斗暂停。每次固定 8 槽（2 常备、4 旅行、1 招牌、1 稀有），事件种子锁定库存，购买前可付费议价一次且只重排旅行货架。商会信誉控制折扣、加价、珍藏柜与拒绝交易；攻击需二次确认，行商低于 40% 生命读条撤离，致死伤害转投降，再由宽恕或抢掠进入赔偿债务闭环 |
| 返回营地 / 休整 | 按距离步行或四段传送回营，自动换区为 3 秒倒计时 + 0.45 秒传送收束 + 0.18 秒遮罩换图 + 0.85 秒抵达；Boss 战可安全撤离并保留一半讨伐进度；坐下恢复 HP、积累休整增益；可选自动回营在增益耗尽后休整至满并复战，手动拔营抑制 120 秒 |
| 物品使用 | `Game.items` 以注册表、效果处理器与共享冷却组统一使用物品；背包药水卡与舞台快捷按钮均可主动喝指定药水，自动/手动共用 8 秒冷却 |
| 死亡重整 | 零惩罚：约 6.8 秒完成倒下、灵魂回收、营地落地、篝火恢复和复苏（恢复段不可快进，减少动态效果时保留时长与信息、移除震屏/残影/密集粒子）；自动操控复战、手动操控留营。同区第三次普通死亡撤往上一区域；魔王城任意战败立即撤回浮空遗迹并重新锁图，主动回营不触发 |
| 离线远征 | 只复用已揭示情报、已登记且未受守的资源路线与同内容 fingerprint 下的 `CombatEstimator` 缓存摘要；不逐 tick 模拟长离线，不发现、击败或领取守卫、巢穴宝箱、精英或 Boss，不推进远征周期；休息模式仍只回满 HP 与休整增益 |
| 统计成就 | 事件总线驱动的统计页（含拾取、采集、素材与宝箱）+ 22 个累计型成就（奖励金币/魔晶石） |
| 天气与日夜 | 世界种子和世界时间确定性生成 300 秒全局天气锋，经八区 `ClimateProfile` 映射为雨、雷暴、雾、雪、暴风雪、灰烬、蒸汽或地下微气候；24 秒平滑过渡，支持湿润高光、涟漪、像素闪电、HUD 状态及林冠/地下/高空曝光。天气只轻度修正 Hazard 侦测可见度，不影响战斗、移动、奖励、导航、离线收益或 v17 存档；20 分钟日夜按曝光模型控制星月与色调 |
| 国际化 | 简体中文（默认）/ English，设置内即时切换；数字缩写随语言（万/亿 vs K/M/B/T） |

## 职业一览（DnD 核心四职 + 游侠）

| 职业 | 定位 | 攻击方式 | 专属机制 |
| --- | --- | --- | --- |
| 战士 Fighter | 近战坦克 | 近战 | 怒气、三段先锋连击、重斩、守御、战吼与高威胁 |
| 盗贼 Rogue | 近战爆发 | 近战 | 能量、连击点、毒刃/背刺/剔骨、闪避 |
| 法师 Wizard | 远程法术 | 远程（法弹） | 法力、奥术充能、火球/弹幕、范围术与屏障 |
| 牧师 Cleric | 远程支援 | 远程（圣辉） | 信仰、治疗、护盾、神圣范围伤害与可控打断 |
| 游侠 Ranger | 远程物理 | 远程（箭矢） | 专注、猎人标记、强力/多重射击、鹰眼与后撤 |

职业选定后不可更改；换职业需重置存档。当前 `SAVE_VERSION=18`、正式 `layoutVersion=4`：v17→v18 保留角色、装备、背包、经济、路线、解锁、Boss 首杀、社交、行商、资源累计与节点冷却，重置瞬态探索并开启新远征；`discoveryRewardLedger` 防止重发首次奖励，`world.guardSites` 仅保存本轮揭示/清除/巢穴宝箱领取 ID，并按布局、远征和内容白名单清理。旧探索档仅领取一次无装备/魔晶石的迁移补偿。ActorInstance、SpawnLease、Encounter、侦测中间相位、威胁和状态均不入档。

## 目录结构（引擎与内容分离）

```
index.html            入口（按序加载脚本）
version.json          当前发布 BUILD_ID（线上 no-store）
css/style.css         像素 JRPG UI（FF/DQ 式双线边框面板）
assets/fonts/         Fusion Pixel 12px 中文像素字体（woff2）
assets/sprite-source/ 采集物与探索宝箱的生成式母版及运行时预览
assets/sprites/       可独立复用的透明运行时 PNG（exploration/ 按稳定 ID 拆分）
tech-demos/           双语生产 QA：Actor/战斗、地图放置、Hazard、导航、Weather/Climate、移动行商
docs/content-authoring/ Actor 内容契约、示例与新增流程
js/
  vendor/             EasyStar.js 0.4.4（MIT，本地固定）
  core/content/       Pack/schema/引用/公式编译、严格审计、深冻结与 fingerprint
  core/               utils / eventbus / registry(旧数据兼容注册表与投影门面) / assets / save / loop / update
  i18n/               i18n 核心 + zh-CN/en 主语言包与 Combat V2 语言包
  data/content/       自动生成的内容 manifest 与单一运行时 Bundle（禁止手改）
  data/packs/         自动发现的 *.pack.js 内容胶囊与 *.support.js 作者辅助
  data/               区域、路线模板、物品、词条与成就数据
  sprites/            像素素材（字符网格+调色板；含 v4 新怪、资源/地标/奇物/生态/守门精英与 manifest）
  systems/actors/     ActorInstance / ActorRecord / Unit State / Party / Relation
  systems/            encounters / encounter_pools / guard_sites / world_treasures / terrain_v3 / terrain_v4 / exploration / expedition / offline 等
  render/             renderer(镜头/视差/合成) / terrain / exploration(分块与迷雾) / hazards / particles / daynight / effects
  ui/                 正式战斗 HUD / 六 Tab 面板 / trade / transitions / ending / 弹窗
  main.js             启动引导
```

**探索素材维护**：16 个基础采集物与 2 个宝箱使用透明母版管线：在 `tools/build-exploration-sprites.py` 的 `SPECS` 中登记稳定 ID/格位/尺寸，并在 `GROUPS` 指定所属区域；运行 `python tools\build-exploration-sprites.py` 重建 18 张单图、来源清单和区域模块，提交前用 `--check` 验证源图哈希与产物一致。24 个 v3 新资源及地标/奇物/生态标记由 `js/sprites/exploration_v3.js` 提供，来源和分组记录在 `assets/sprite-source/exploration-v3-source.md`。八区各 6 件地表装饰以 `assets/sprite-source/ground-decorations/<region>/<stable-id>.png` 的 48 张独立透明图为维护源；运行 `python tools\build-ground-decorations.py` 重建逐件生产 PNG、八区模块、来源清单和联系表，提交前用 `--check` 校验。初始提示词与精准替换步骤记录在 `ground-decorations-source.md`，`v3Only` 声明保证旧布局不消费它们。八区 Boss 领地使用 `assets/sprite-source/boss-territories/` 的透明 ImageGen 母版；运行 `python tools\build-boss-landmarks.py` 重建 8 个主地标、24 个装饰精灵、运行时联系表和来源清单，提交前同样用 `--check` 校验。`*.generated.js` 不直接手改。

**扩展方式**：新增 Actor 使用 `tools/scaffold-actor.ps1` 生成 `monster`、`boss`、`npc`、`peaceful-creature`、`combat-npc` 或 `summon` 内容胶囊；其他内容按 `docs/content-authoring/adding-actor.md` 创建或扩展 `*.pack.js`。纯作者展开逻辑放入 `*.support.js`，只通过声明的 `authoring.read/write`、`rules.formula/handler` 能力访问版本化 `Game.contentAuthoring`，不得改写其他 `Game` 表面。构建器递归扫描文件系统，在源 VM 与纯 Bundle VM 中比较 Pack、Support、authoring 注册项、Pack-local 中英文、Population 挂载视图、fingerprint 与 `sourceSetHash`；生成 manifest/Bundle 只用于校验和运行，不是手写真源。正式入口与六个技术演示只加载 `js/data/content/content.generated.js`，新增内容无需修改 HTML。常规扩展不修改 combat/world/renderer，所有引用使用稳定字符串 ID，已下线内容在读档时安全降级。

**地图 QA 分工**：`tech-demos/units` 先审查 16 种代码网格新怪的 idle 双帧、轮廓、缩放、能力和守卫/猎手组合；`tech-demos/map-effects` 直连 `terrain_v4`，叠加巢穴几何、宝箱、守卫锚点和池解析，并提供确定性复验与批量拓扑报告；`tech-demos/hazards` 验证明示、天气侦测、隐藏伏击和交互抢占；`tech-demos/exploration-v3` 验证资源守卫、巢穴、Boss 门卫、战后恢复目标、三种自动策略及远征/读档重置。演示页只调用生产模块，不维护平行实现。

**交易扩展**：区域以 `tradeAreas[]` 声明地点、实体、半径、优先级与目录，商店条目以 `catalogs[]` 声明供应渠道；`Game.trade.registerDynamic(area,{ttl})` 可注入不入档的临时地点。当前八区营地提供 `camp-general` 与 `camp-exchange`；移动行商由 `Game.merchants.tradeAreas()` 投影持久事件，动态商品通过同一商店能力边界完成校验、扣款与发货，并在正式区域地图以代码网格绘制的青金篷车图标标记固定交易锚点。点击篷车会解析同事件的存活行商 Actor 并先进入交谈，商店只由交谈动作继续打开。交易面板及行商交谈窗以短 TTL 续租 `autoExplore` 暂停，只抑制自动移动、索敌、回营与自动 Boss 触发；关闭、切页、离域/目标失效或调用方失联后自动释放，手动指令、世界时钟、环境与既有战斗不受影响。

**路线编排**：`js/data/routes.js` 声明 `lucia-campaign` 模板、可洗牌组与 excursion 插入策略，`js/systems/routes.js` 编译和校验持久化 `world.routePlan`。全局开关 `Game.ROUTE_FEATURES.randomizeNewGameMainline` 当前默认 `false`，所以新档固定为经典八区顺序；重新开启后只按 `worldSeed` 洗牌前四区。怪物强度、奖励与推荐等级始终按主线推进位置计算；`world.regionOrder` 保留为兼容投影，旧档迁移绝不重新洗牌。

## 开放地图与探索引擎

- **确定性种子**：`world.worldSeed` 为只读 `uint32`，地图面板显示 8 位十六进制值并可复制；刷新、离线回归、导出/导入均不改变布局。v4 复用 v3 的 `macro / field / blockers / landmarks / resources / curios / threats / details` 流，并新增完全独立的 `nests` 流；因此相同种子的 v3 结果逐字节稳定。
- **生成管线**：`Game.terrain` 保持 `generate / validate / repair / mount` 分层；`terrain_v4` 在完整 v3 布局上组合 1–2 个半开放巢穴。巢穴半径 96–132px，主入口净宽至少 64px、侧缺口至少 48px，墙体、地面、入口、装饰、硬阻挡和距离场共享同一几何数据，每个巢穴固定一个深处宝箱和守卫锚点；v1/v2/v3 生成器及黄金摘要均保留。
- **布局版本**：当前 `layoutVersion:4` 使用 14–18 个宏观中心、真实硬阻挡、60–70% 主连通可行走区，以及 `nests[] / treasureSites[] / guardSites[] / rareThreats[] / bossGatePoint`。全部目标在统一预留后从营地可达，并避开 Boss 墙带、地标、Hazard、行商和其他交互物；v3 的 `threat.defId=nest` 仅作兼容标记。
- **动态远征层**：永久层保存稳定地形，守卫模式、池选择和宝箱领取按 `worldSeed + regionId + expeditionIndex` 刷新。`Game.expeditionAI` 的优先级为生存、战斗、玩家指令、守卫恢复、限时掉落、普通探索/资源、巢穴、Boss 门卫、Boss；三策略分别应用资源/巢穴/门卫生命门槛，被门槛阻挡时主动回营而非目标间空转。
- **导航与渲染**：512px 地表区块组成 5×3 网格，视口预加载与 LRU 只保留热区块，动态实体使用空间桶；长途移动先固定为可即时打断的宏观航点行程，再逐段运行局部 A*，避免在宏观分区边界随 0.6s 重算往返。导航队列受单帧 2ms 预算约束，结果下一帧接续；战斗追击在 50ms tick 内同步复用局部 A*，按 0.6s/目标移动 32px 确定性重算，技能突进、后撤、击退、拉拽及单位分离统一经过地形扫掠，非法旧坐标在下一战斗 tick 投影回合法点。失败缓存、扫掠停滞恢复、目标/token/策略变更重编排同时覆盖自动 AI、点击移动与「前往巢穴」。自动采集/开箱接近阶段以 0.25s 窗口累计实际位移，按 0.75s 重置路线、2s 失效失败缓存、6s 取消并暂时屏蔽目标；自动候选会跳过屏蔽目标并继续尝试后续掉落、宝箱或采集点。键盘和点触移动均执行硬阻挡扫掠碰撞。v3 区块以多尺度平滑噪声替代方块材质选择；装饰再以按定义独立的适宜度场、簇群点过程和形状语法形成同类富集、伴生关系与负空间，避免抖动网格式平均散布。材质微纹理、草叶/裂纹/雪光、材质边缘、宽域色斑、花簇与营地磨损地面保持可见，未探索区完全遮蔽以防泄露底层粗网格与实体轮廓。
- **地图交互**：区域地图以独立底图和实时角色覆盖层合成，支持按钮、连续滚轮/触控板、双指捏合缩放及单指拖动；倍率限制为 `1×–3×`，缩放期间不重建面板或底图，到达边界后释放滚轮供面板继续滚动。
- **迷雾、采集与守卫**：迷雾采用 32px Base64 bitset 加硬阻挡视线遮挡。每轮从全部资源节点无稀有度偏向抽取 `round(count×0.30)` 个受守目标，显形/伏击数量平衡；同轮清除后不随节点冷却重生。隐藏伏击不进入 UI、寻路代价或自动候选，触发后保存原目标，胜利时重新校验节点冷却、领取状态和远征序号再恢复交互。
- **Hazard 与守卫状态机**：静态 Hazard 和隐藏守卫共用固定 roll、形状扫掠、策略/视野/天气侦测和降动态表现。`Game.guardSites` 管理 `inactive → concealed/revealed → engaged → cleared`，巢穴箱管理 `locked → available → claimed`；逃脱、团灭、换区或 Encounter 提交失败不消费目标。公开接口为 `snapshot / forTarget / canInteract / trigger / resetExpedition`，事件为 `guardSite:*`、`nest:discovered` 和 `nestChest:opened`。

## 存档

- localStorage 双槽写入（`firpg_save` + `firpg_save_backup`），主档损坏自动回退备份档。
- 当前产品层为单个逻辑角色槽位 `expedition-1`，UI、回调与存储均按稳定槽位 ID 数组渲染以预留多档；选档前不启动主循环、不自动存档、不结算离线收益、不推进世界时间。这里的“双槽”指同一角色档案的主写入与容灾备份，不是两个可选角色。
- 每 15 秒自动保存 + 关键事件（升级/Boss/穿戴/购买等）即时保存 + 页面隐藏/关闭时将短过场结算到安全状态后保存。
- 当前存档 v17，采用逐版本迁移流水线。持久层保存完整 Roster/ActorRecord 集合、主控与活动队伍引用、经济、背包、世界（含 `RoutePlan`、`world.social`、各区 `discoveredHazardIds/hazardCooldowns`、`chestMimic.rollOrdinal/genuineOpenedSinceMimic`，以及行商信誉、赔偿、区域计时和锁定库存）、设置和战术；Hazard、噬宝匣与行商数据均按白名单归一化。Hazard 侦测 roll 由稳定实例 ID 派生而不入档，已发现项永久保持发现。ActorInstance、SpawnLease、generation、EngagementCommand、Encounter、行商运行时 Actor、活动噬宝匣、RNG、威胁、施法、Hazard warning/active scheduler、状态与护盾均为瞬态。v1–v16 可完整迁移；无效内容引用自动清理，无效职业/Talent 自动降级退款，损坏迷雾或行商事件只重置对应子域。
- 单位状态由 `Game.units` 统一投影和修改：ActorRecord 持久化 HP 且同一 Record 最多绑定一个存活 ActorInstance，ActorInstance 保存实时状态，StatBlock 独占运行时 `maxHp` 派生。伤害、治疗、死亡/复活、Modifier source 替换、上限协调和属性重建都走该边界；HUD 高频读取使用轻量 `vitals()`，完整诊断才使用 `snapshot()`。
- Actor 刷新必须无损保留同 ID 资源当前值、SpawnSpec 数值、现存 Status 和外部 Modifier source；状态叠层固定为 `add/addPct` 线性累加、`multiply` 幂次叠乘、`set` 不随层数放大，周期效果按层数结算。禁止业务系统直接改写 ModifierLedger 或自行同步 Vitals。
- 过场与状态机：`Game.transitions` 统一 `startRegion / startDeath / cancel / update / isActive / blocksWorld / cameraTarget / settleBeforeSave`；玩家可见换区走 `Game.prog.requestRegion(rid,{source})`，`gotoRegion` 仅供遮罩中点、启动和导入等原子操作。事件 `region:travelStart / travelCancelled / arrived`、`player:reviveStart / revived` 仅在对应阶段触发，`region:changed` 只在真实世界重建时触发一次。
- 导出/导入：Base64 串（末尾附 FNV-1a 校验和，截断/篡改会被拒绝）与 `.json` 文件下载/导入并存；重置需二次确认。
- 检测到存档时间戳在未来（回调系统时间）时离线收益按 0 处理。

## 数值设计说明

**成长方案**：二选一中采用「升级自动成长」--挂机游戏应尽量减少强制打断。升级自动提升全属性、回满 HP 并 +1 技能点；自动技能与换装默认开启，玩家可关闭总开关或锁定单个装备槽，随时切回完整手动决策。

**自动评估**：`Game.combatEstimator` 复用正式 Blueprint、Actor 私有 Talent Ability/Status、Modifier、资源、AI、Encounter 与 50ms 规则进行无渲染加速模拟，并以内容 fingerprint、构筑、区域、策略和种子组成缓存键。自动 Talent 以最高已解锁区域评估，装备以当前区域评估；智能换装至少提升 0.1% 才替换，同分保留当前装备。

**职业数值形状**：五职业按「输出 × 有效生命 ≈ 稳定功率预算」设计，通过职业资源、GCD 轮转、治疗/护盾和射程形成差异，不再把旧攻速白嫖或冷却旁路作为平衡基础。

**升级曲线**：`expNeed(L) = 28·L·1.16^(L-1)`（指数）。速度/暴击全职业线性微增。

**战斗数值**：每次 Encounter 使用独立 seeded RNG；命中/闪避、暴击、物理护甲或魔法 Ward、抗性、护盾和最低 1 点伤害按固定顺序提交。基础伤害经注册公式得到 `raw`，物理/魔法减伤为 `raw² / (raw + armor|ward)`，再应用抗性；GCD、施法、引导、冷却和 charge 只使用整数 tick。

**区域怪物匹配**：八区各有 4 个常驻普通怪、1 个 Boss 与 1 个区域召唤物，共 32 普通怪、8 Boss、8 区域召唤 Actor；另有按 T1–T3/T4–T6/T7–T8 切换旧木、咒饰、王库三变体的条件型噬宝匣。普通 Encounter 以 8 组显式权重生成 1–3 个初始敌人，含召唤者的 Pack 初始至多 2 人且同源 `maxActive:1`；伏击 Hazard 只绑定区域允许且至多 2 人的编队。召唤物无奖励，噬宝匣胜利则在原普通箱奖励外结算约 0.7 倍普通怪经验/金币与一次正式掉落，但不推进区域威胁或讨伐。

**经济闭环**：金币（产出：击杀/出售/离线/素材委托；消耗：药水/装备箱）；魔晶石（产出：Boss 首杀/成就/分解传说/高阶采集小概率；消耗：史诗箱/永久强化/生命刻印）；素材只由采集与宝箱产出，经集中配方兑换消耗，不影响离线收益。

**离线收益**：探索部分按已知路线长度、交互时间、节点冷却和危险度闭式结算；战斗部分读取同内容与构筑生成的 Estimator 摘要，不逐 tick 回放整段离线。完全无情报时不产出，且离线永不揭雾、首发发现、精英/Boss、解锁或推进远征周期。

**防护设计**：药水低于阈值自动使用（默认 30%，可调，8 秒冷却），同一阈值驱动回营按钮警示；无药水靠自然恢复不中断挂机；死亡零惩罚 + 连败 3 次自动回退；魔王城战败立即退回浮空遗迹并重新锁图。Boss 讨伐失败或主动撤离均保留一半进度，但只有实际战败触发魔王城失守；当前 v3 自动讨伐要求生命不低于 80%，手动挑战不受该安全线限制。

**大数字**：全局格式化函数按语言分派（zh：万/亿/万亿；en：K/M/B/T），超过 1e16 转科学计数法。

## 音频（本期占位）

`Game.audio` 已提供完整签名的空实现：`playSfx(id)`、`playBgm(id)`、`stopBgm()`、`setMuted(kind, flag)`；`kind` 分为 `sfx` 与 `bgm`。事件总线已埋好战斗、掉落拾取、用药、采集、宝箱、兑换、扎营、Boss、旅行、灵魂与复苏触发点。未来只需注册音频 manifest 并替换内部实现。

## 验证

```powershell
node tools\build-content-bundle.js
node tools\build-content-bundle.js --check
node tests\v1_6.test.js
node tests\route-planner.test.js
node tests\v1_7.test.js
node tests\v1_8.test.js
node tests\v1_9.test.js
node tests\trade-zones.test.js
node tests\interaction-pause.test.js
node tests\v1_11.test.js
node tests\v1_13.test.js
node tests\v1_13.balance.test.js
node tests\navigation-long-route.test.js
node tests\final-region-lock.test.js
node tools\audit-content.js
node tests\content-support-capabilities.test.js
node tests\v2-authoring.test.js
node tests\v2-content-validation.test.js
node tests\v2-content-entrypoints.test.js
node tests\unit-ecosystem-v14.test.js
node tests\v2-save.test.js
node tests\v2-runtime.test.js
node tests\unit-state.test.js
node tests\world-encounter.test.js
node tests\v2-presentation.test.js
node tests\combat-portraits.test.js
node tests\minimap-icons.test.js
node tests\v2-balance-baseline.test.js
node tests\hazard-content.test.js
node tests\hazard-runtime.test.js
node tests\hazard-layout.test.js
node tests\hazard-detection-balance.test.js
node tests\hazard-presentation.test.js
node tests\chest-mimic.test.js
node tests\action-bubble-demo.test.js
node tests\decoration-ecology.test.js
node tests\map-effects-inspector.test.js
node tests\wandering-merchants.test.js
node tests\weather-climate-system.test.js
node tests\weather-climate-demo.test.js
node tests\weather-climate-browser-smoke.test.js
node tests\browser-smoke.js
node tests\cache-version.test.js
```

除 `action-bubble-demo.test.js`、`weather-climate-browser-smoke.test.js` 与 `browser-smoke.js` 外，上述命令可直接运行。浏览器用例执行前需在另一终端运行 `python -m http.server 4176`；测试默认读取 `http://127.0.0.1:4176/`，也可用 `FIRPG_URL` 覆盖。

测试链同时保护旧世界与 V2：v4 独立覆盖八区 1,600 张完整巢穴布局和 5,000 个快速种子，v3 继续覆盖同规模黄金矩阵，另有 384 次双向长途行程。内容链验证双 VM/schema/引用/i18n/正式资产、74 个 Actor、104 个 EncounterPack、72 个分类池、24 个守卫配置及 16 种新怪反向可达；运行时覆盖 v1→v18、Population/SpawnLease、守卫事务、Engagement、固定 tick、Hazard、噬宝匣、行商、五职业门卫与 Boss 平衡、4,000 组样本和 Lab 4+8 单步性能。

**当前浏览器回归状态**：验收目标仍是正式入口和六个工作台的移动/桌面中英文、44px 触控与无横向溢出。`browser-smoke.js` 逐页覆盖五个工作台，移动行商由 Node 领域测试覆盖；当前综合用例可完整通过。密林 25ms 帧预算在同一环境曾采到约 26.8–27.5ms，随后复跑通过，仍应作为性能抖动持续观察，而非放宽门槛。

---

Combat V2 · 路径机关、噬宝匣与移动行商 v17 · 纯 HTML/CSS/JS · UTF-8 · 离线可用
