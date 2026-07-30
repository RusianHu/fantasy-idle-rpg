# 技术演示页

入口：`tech-demos/index.html`。本目录收纳与正式存档隔离、但直接调用生产代码的 QA 工作台；全部页面支持 `file://` 直开、简体中文/英文即时切换及当前 `BUILD_ID` 缓存协议。

| 工作台 | URL 参数 | 生产链路与范围 |
| --- | --- | --- |
| Actor / Combat Lab | `units/units.html?encounter=encounter.forest.boss&unit=adventurer&class=cleric&strategy=safe&seed=20260728&scenario=interrupt&lang=en` | 自动枚举正式 Actor、Variant、Encounter 与 Objective；1–4 友方、1–8 敌方、多队伍/coalition/observer、投降、赎罪、中立挑衅、opening Action、奖励授权、暂停/单步/倍速、正式攻击 FX，以及 command/objective/Variant/数值/表现/接敌日志 |
| 开放世界现场 | `map-effects/map-effects.html?seed=1234ABCD&region=forest&lang=zh-CN` | 自动枚举正式 Region、Population 通道、PopulationMountPlan 预留/失败/重生队列、WorldSpawnProfile 与 SpawnLease；核对稳定身份/generation、NPC/和平生物 Observe/Attack、Engagement、持久社交/Variant、主题材质、探索、交易、迷雾及日夜渲染 |
| Hazard 特效实验室 | `hazards/hazards.html?seed=1234ABCD&region=grassland&lang=zh-CN` | 直接挂载正式 Hazard 实例与固定 tick 状态机；逐区操控线索、揭示、预警、激活、命中与冷却，并用六阶段对照板检查九类像素机关的材质、范围、方向、爆发碎屑、残留、事件文案与降动态表现 |
| 生成器审计 | `exploration-v3/exploration-v3.html?seed=20260727&region=grassland&lang=en` | 复用编译 Region 的宏观拓扑、硬阻挡、营地—巢穴真实分段足迹、航点/耗时/恢复诊断、内容分布、5×3 区块，以及 32 种子结构与完整长途路径批量验证 |

## 维护约束

- 优先加载正式注册表、系统和渲染模块；不得复制一套脱离生产代码的模拟实现。
- 正式入口与四个工作台只加载一个当前 `BUILD_ID` 的 `js/data/content/content.generated.js`；不得直接加载 `*.pack.js`、`*.support.js` 或生成 manifest。
- 新页面与现有页面平级，并登记到 `tech-demos/index.html`；页面专属 CSS/JS/说明文件放入同名子目录。
- QA 文案使用 `demo-i18n.js`，游戏内容名称读取编译后的核心/Pack-local `Game.i18n` 查询层。
- 页面不得读写正式存档；世界种子、区域、职业和交互状态仅存在于当前 QA 页面。
- HTML/CSS/JS/字体变更发布前运行 `tools/set-build-id.ps1` 与 `node tests/cache-version.test.js`。

## 自动验证

`tests/browser-smoke.js` 在移动与桌面视口验证正式入口和四个工作台的非空 Canvas、无横向溢出、44px 控件、双语、中立 Observe/Attack 二次确认与固定 tick Engagement 闭环；Hazard 单元测试另覆盖 clue/reveal、持续 active window、九类视觉符号、两层渲染与独立 Lab 生产入口。`tests/map-effects-inspector.test.js` 保证现场页逐类枚举正式 Region/Population/MountPlan/SpawnLease，且全部检查器键具备中英文。`tests/action-bubble-demo.test.js` 在 Lab 验证 29 个 Actor、18 个 Encounter、接敌不重叠、正式攻击 FX 与 PresentationEvent；`tests/unit-ecosystem-v14.test.js` 覆盖稳定生成、放置与重生、Relation/Engagement 原子性、Objective、奖励授权、Variant 与 v14 社交边界，其余确定性、4+8 性能与平衡矩阵由 `tests/v2-*.test.js` 覆盖。
