# 地图生成、渲染与放置 Lab

入口：`map-effects.html?seed=1234ABCD&region=forest&lang=zh-CN`。页面默认使用 `layoutVersion:4`，可切回 v3 基线，按 `Game.terrain.generate / validate / mount → Game.encounterPools.resolve → Game.population.prepareRegion / mountChannel → Actor materialize → audit → renderer` 运行正式公开链路，但不调用 `Game.world.init()`；v4 巢穴组合发生在 `Game.terrain.generate()` 内部，不存在公开的 `terrain_v4.compose` 接口。

## 验证范围

- 八区 2400×1440 地形、液体、导航、区块、装饰、营地、地标、资源、奇物、生态、威胁、Hazard 锚点及 Population Actor；v4 另显示巢穴墙体/双门洞、固定宝箱、守卫锚点、稀有威胁、Boss 门卫点和正式池解析结果。
- 无玩家、无迷雾、无存档读写；不创建战斗、运行时 Hazard、探索 AI、宝箱或交易状态。
- 全图小地图支持点击和拖动镜头、视口框同步、地点/Actor/错误标记与对象聚焦。
- 检查、正式导航测距、SpawnProfile 放置探针、放置审计、确定性复验及固定 50ms 的 Seeded 巡游预览。
- 移动行商审计直接调用生产 `Game.merchants.inspectPlacement` 与 Population 批量预留检查；页面提供可移动的模拟玩家 QA 点、真实篷车装饰与行商 Actor，并叠加 32px 巡游圆、58px 固定交易圆及玩家到篷车连线。
- 生产装饰生态报告：适宜度场、簇群中心、形状包络、方向轴、簇内关系、配额完成率、平均最近邻、同类富集与大尺度留白。
- 目录选择任一地表装饰后，“装饰适宜度场 / 簇群与形状 / 簇内关系”诊断层会切换到该稳定 ID；普通检查探针同时报告该点的适宜度分数。

## 目录

- 默认范围为“当前地图”；切换地图后自动重建区域关联。可切换到“全部地图定义”审查跨区注册表。
- “全部类别”按类别分段，不把不同类型平铺在同一列表；选择分类后只显示一个精确 `category`。
- 单位拆分为普通怪物、Boss、NPC、和平生物、召唤物和 Object。
- 地图内容拆分为可采集资源、宝箱、普通地标、Boss 巢穴、奇物、生态、威胁、Hazard 定义、Hazard 锚点和营地组件。
- 装饰拆分为阻挡、地表、水域、Boss 领地、草簇、花朵及地形材质；八区各 9 件 `v3Only` 主题地表装饰来自逐件透明 PNG 与分区 generated 模块，并按中英文名称、稳定 ID、像素预览和当前实例数自动枚举。
- 当前实例关联坐标并可聚焦；未挂载单位、召唤物、Hazard 和普通/稀有宝箱只显示正式定义与 `0` 实例，不向地图注入运行时对象。

## QA 接口

`window.MapGenerationLab` 暴露 `regenerate`、`randomize`、`catalog`、`snapshot`、`logs`、`focus`、`setCamera`、`setLayer`、`setMotion`、`probe`、`inspect`、`measure`、`merchantAudit`、`verifyDeterminism`、`decorationReport` 和 `resetPositions`。确定性复验比较 v3 基础、v4 巢穴、Population、池解析、行商放置与 Actor 坐标；页面按钮另执行当前区域 80 张完整 v4 与 5,000 个快速种子的拓扑报告。

长途导航、拓扑可视化和多 Seed 批量审计仍由 `tech-demos/exploration-v3` 独立负责。
