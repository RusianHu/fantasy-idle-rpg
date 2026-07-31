# 技术演示页

入口：`tech-demos/index.html`。本目录收纳与正式存档隔离、但直接调用生产代码的 QA 工作台；全部页面支持 `file://` 直开、中英文切换入口及当前 `BUILD_ID` 缓存协议。

| 工作台 | URL 参数 | 生产链路与范围 |
| --- | --- | --- |
| Actor / Combat Lab | `units/units.html?encounter=encounter.forest.boss&unit=adventurer&class=cleric&strategy=safe&seed=20260728&scenario=interrupt&lang=en` | 自动枚举正式 Actor、Variant、Encounter 与 Objective；1–4 友方、1–8 敌方、多队伍/coalition/observer、投降、赎罪、中立挑衅、opening Action、奖励授权、暂停/单步/倍速、正式攻击 FX，以及 command/objective/Variant/数值/表现/接敌日志 |
| 开放世界现场 | `map-effects/map-effects.html?seed=1234ABCD&region=forest&lang=zh-CN` | 自动枚举正式 Region、Population 通道、PopulationMountPlan 预留/失败/重生队列、WorldSpawnProfile 与 SpawnLease；核对稳定身份/generation、主题材质、无迷雾全图、小地图与日夜渲染。探索、交易、Hazard 和互动只做定义/锚点/放置诊断，不启动玩家、Engagement、迷雾或交易生命周期 |
| Hazard 特效实验室 | `hazards/hazards.html?seed=1234ABCD&region=grassland&lang=zh-CN` | 直接挂载正式 Hazard 实例、固定 roll 概率侦测与 50ms 状态机；默认读取真实 `weather:visibility`，并保留手动 `1.0` 覆盖；以真实检定审计提前识破、未识破预警与逃生 |
| 生成器审计 | `exploration-v3/exploration-v3.html?seed=20260727&region=grassland&lang=en` | 复用编译 Region 的宏观拓扑、硬阻挡、营地—巢穴真实分段足迹、航点/耗时/恢复诊断、内容分布、5×3 区块，以及 32 种子结构与完整长途路径批量验证 |
| Weather / Climate Lab | `weather-climate/weather-climate.html?seed=1234ABCD&region=forest&time=300&mode=forced&front=volatile&intensity=0.85&lang=zh-CN` | 直接加载生产 `ClimateProfile`、天气调度与四层渲染器；支持时间线/强制天气锋、强度、过渡、层开关、减少动态、雷击、五锋对照、八区暴露审计及可见度/风力/湿润度/性能报告 |
| 移动行商机制 Lab | `merchants/merchants.html?seed=1234ABCD&region=grassland&lang=zh-CN` | 直接运行四个正式行商 Profile、八槽确定性库存、付费议价、信誉价格带、购买/赔偿事务，以及撤离、投降、宽恕和抢掠的非致死结算 |

## 维护约束

- 优先加载正式注册表、系统和渲染模块；不得复制一套脱离生产代码的模拟实现。
- 正式入口与六个工作台只加载一个当前 `BUILD_ID` 的 `js/data/content/content.generated.js`；不得直接加载 `*.pack.js`、`*.support.js` 或内容侧 `js/data/content/manifest.generated.js`。生产使用的探索资产 manifest 不受此限制。
- 新页面与现有页面平级，并登记到 `tech-demos/index.html`；页面专属 CSS/JS/说明文件放入同名子目录。
- 新增和维护的 QA 文案使用 `demo-i18n.js`，游戏内容名称读取编译后的核心/Pack-local `Game.i18n` 查询层。Weather Lab 仍有少量内嵌双语原生控件，完整 locale 清理属于当前维护缺口。
- 页面不得读写正式存档；世界种子、区域、职业和交互状态仅存在于当前 QA 页面。
- HTML/CSS/JS/字体变更发布前运行 `tools/set-build-id.ps1` 与 `node tests/cache-version.test.js`。

## 自动验证

`tests/browser-smoke.js` 的测试代码当前逐页包含正式入口及 Actor、地图、Hazard、生成器、Weather 五个工作台，检查非空 Canvas、无横向溢出、44px 控件、部分双语切换、中立 Observe/Attack 二次确认与固定 tick Engagement 闭环。移动行商尚未接入该综合浏览器回归，领域行为由 `tests/wandering-merchants.test.js` 保护；综合用例仍有过时的 Hub/Weather/内容数量断言和密林帧预算失败，因此本段描述覆盖范围，不表示当前已全量通过。浏览器验收目标仍是正式入口和六个工作台。

天气 Lab 另由 `tests/weather-climate-browser-smoke.test.js` 验证 URL 恢复、四阶段截图、八区气候、强制雷暴、确定性、性能诊断与零存档副作用；`tests/weather-climate-system.test.js` 覆盖内容绑定、天气锋/过渡、跨区微气候、雷击序列、Hazard Provider 和当前 v17 存档不变量。
