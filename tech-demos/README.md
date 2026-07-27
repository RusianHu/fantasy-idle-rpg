# 技术演示页

入口：`tech-demos/index.html`。本目录收纳与正式存档隔离、但直接调用生产代码的 QA 工作台；全部页面支持 `file://` 直开、简体中文/英文即时切换及当前 `BUILD_ID` 缓存协议。

| 工作台 | URL 参数 | 生产链路与范围 |
| --- | --- | --- |
| 角色与怪物 | `units/units.html?lang=en` | 五职业、十六普通怪、八 Boss、开放探索 v3 世界、战斗/技能/弹道、朝向感知与双锚点斜向动作气泡 |
| 开放世界现场 | `map-effects/map-effects.html?seed=1234ABCD&region=forest&lang=zh-CN` | 2400×1440 v3 地图、迷雾/准备度、远征 AI、资源/宝箱、动态交易域、日夜与环境渲染 |
| 生成器审计 | `exploration-v3/exploration-v3.html?seed=20260727&region=grassland&lang=en` | 宏观拓扑、硬阻挡、距离场、内容分布、5×3 区块、结构报告与 32 种子批量验证 |

## 维护约束

- 优先加载正式注册表、系统和渲染模块；不得复制一套脱离生产代码的模拟实现。
- 新页面与现有页面平级，并登记到 `tech-demos/index.html`；页面专属 CSS/JS/说明文件放入同名子目录。
- QA 文案使用 `demo-i18n.js`，游戏内容名称继续读取正式 `Game.i18n` 语言包。
- 页面不得读写正式存档；世界种子、区域、职业和交互状态仅存在于当前 QA 页面。
- HTML/CSS/JS/字体变更发布前运行 `tools/set-build-id.ps1` 与 `node tests/cache-version.test.js`。

## 自动验证

`tests/browser-smoke.js` 在 390×844 与桌面视口验证三个工作台的非空 Canvas、无横向溢出、44px 控件、双语切换、v3 布局指标、资源/宝箱/动态交易域，以及双锚点气泡的左右翻转与血条避让。生成器的完整 1,600 布局与 5,000 拓扑模糊种子继续由 `tests/v1_13.test.js` 覆盖。
