# 地图生成、渲染与放置 Lab

入口：`map-effects.html?seed=1234ABCD&region=forest&lang=zh-CN`。页面固定使用 `layoutVersion:3`，按 `terrain.generate / validate / mount → Population.prepareRegion → Actor materialize → audit → renderer` 运行正式链路，但不调用 `Game.world.init()`。

## 验证范围

- 八区 2400×1440 地形、液体、导航、区块、装饰、营地、地标、资源、奇物、生态、威胁、Hazard 锚点及 Population Actor。
- 无玩家、无迷雾、无存档读写；不创建战斗、运行时 Hazard、探索 AI、宝箱或交易状态。
- 全图小地图支持点击和拖动镜头、视口框同步、地点/Actor/错误标记与对象聚焦。
- 检查、正式导航测距、SpawnProfile 放置探针、放置审计、确定性复验及固定 50ms 的 Seeded 巡游预览。

## 目录

- 默认范围为“当前地图”；切换地图后自动重建区域关联。可切换到“全部地图定义”审查跨区注册表。
- “全部类别”按类别分段，不把不同类型平铺在同一列表；选择分类后只显示一个精确 `category`。
- 单位拆分为普通怪物、Boss、NPC、和平生物、召唤物和 Object。
- 地图内容拆分为可采集资源、宝箱、普通地标、Boss 巢穴、奇物、生态、威胁、Hazard 定义、Hazard 锚点和营地组件。
- 装饰拆分为阻挡、地表、水域、Boss 领地、草簇、花朵及地形材质。
- 当前实例关联坐标并可聚焦；未挂载单位、召唤物、Hazard 和普通/稀有宝箱只显示正式定义与 `0` 实例，不向地图注入运行时对象。

## QA 接口

`window.MapGenerationLab` 暴露 `regenerate`、`randomize`、`catalog`、`snapshot`、`logs`、`focus`、`setCamera`、`setLayer`、`setMotion`、`probe`、`inspect`、`measure`、`verifyDeterminism` 和 `resetPositions`。

长途导航、拓扑可视化和多 Seed 批量审计仍由 `tech-demos/exploration-v3` 独立负责。
