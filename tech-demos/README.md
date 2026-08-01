# 技术演示页

入口：`tech-demos/index.html`。本目录收纳与正式存档隔离、但直接调用生产代码的 QA 工作台；全部页面支持 `file://` 直开、中英文切换入口及当前 `BUILD_ID` 缓存协议。

| 工作台 | URL 参数 | 生产链路与范围 |
| --- | --- | --- |
| Actor / Combat Lab | `units/units.html?encounter=encounter.forest.boss&unit=adventurer&class=cleric&strategy=safe&seed=20260728&scenario=interrupt&lang=en` | 自动枚举正式 Actor、Variant、Encounter 与 Objective；新增 16 种守卫/猎手的代码网格双帧联系表、轮廓/缩放/placeholder 审计、能力摘要及守卫组合，与既有固定 tick 战斗、接敌和表现日志共用生产链路 |
| 开放世界现场 | `map-effects/map-effects.html?seed=1234ABCD&region=forest&lang=zh-CN` | 默认运行 v4，可切回只读 v3 基线；叠加巢穴共享几何、双入口、固定宝箱、守卫锚点和 Encounter Pool 解析，保留 Population/SpawnLease、装饰生态、行商选点、单种子复验及 `80 full / 5000 quick` 拓扑报告 |
| Hazard 特效实验室 | `hazards/hazards.html?seed=1234ABCD&region=grassland&lang=zh-CN` | 直接挂载正式 Hazard 与动态守卫 Hazard；验证显形守卫、天气提前侦测、未识破伏击、原目标交互抢占及减少动态，状态切换继续使用正式固定 roll 与 50ms 状态机 |
| 生成器与自动守卫审计 | `exploration-v3/exploration-v3.html?seed=20260727&region=grassland&scenario=gather-fallback&policy=compare&lang=en` | 复用 v4 宏观拓扑、巢穴、导航、Encounter Pool 与守卫预览；保留自动交互中断/失败缓存审计，并增加资源/巢穴/Boss 门卫生命门槛、战后目标恢复、回营、撤退、读档和换远征场景 |
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

综合浏览器验收覆盖正式入口、Actor、Map Effects、Hazards、Exploration、Weather 与行商工作台，检查非空 Canvas、无横向溢出、有效 44px 触控目标、中英文切换、减少动态和关键状态按钮。领域行为另由 Node 回归保护；地图 v4 的权威批量验收位于 `tests/terrain-v4.test.js`，池/守卫分别位于 `tests/encounter-pools-v4.test.js` 与 `tests/guard-sites-v4.test.js`。

天气 Lab 另由 `tests/weather-climate-browser-smoke.test.js` 验证 URL 恢复、四阶段截图、八区气候、强制雷暴、确定性、性能诊断与零存档副作用；`tests/weather-climate-system.test.js` 覆盖内容绑定、天气锋/过渡、跨区微气候、雷击序列、Hazard Provider 和当前 v17 存档不变量。
