# 天气 / 气候筹备型渲染 Lab

入口：`weather-climate.html?seed=1234ABCD&region=forest&time=300&particle=region&lang=zh-CN`。

本页不是天气系统。它不新增气候 Profile、天气状态、调度器、正式特效或玩法倍率，只把现有生产环境渲染能力集中到一个无存档 QA 页面：

- `terrain.generate / validate / mount` 生成并挂载正式 v3 地图。
- `renderer.frame` 绘制正式天空、视差、地形、装饰与光照合成。
- `daynight` 使用 Lab 内世界时间验证黎明、白昼、黄昏、夜晚。
- `particles` 验证八区登记的现有氛围原语与统一特效开关。
- `terrain.windAt` 提供正式风动采样诊断。

粒子选择器中的跨区原语预览只将未冻结的浅拷贝传给 `Game.particles.initRegion`，不会改写区域注册表，也不代表该区域已经拥有对应天气。

页面不会调用 `Game.world.init()`，不会加载或启动 Population、战斗、运行时 Hazard、探索 AI、宝箱、交易与离线收益。与天气相关的 Hazard 环境倍率继续由 `tech-demos/hazards` 独立验证。

## QA 接口

`window.WeatherClimateLab` 暴露：

- `regions()`、`particlePresets()`
- `snapshot()`、`report()`
- `setRegion()`、`setSeed()`、`setWorldTime()`、`setParticlePreset()`、`setEffects()`、`setCamera()`
- `capturePhases()`、`verifyDeterminism()`

报告中的 `futureHooks` 固定为 `unconnected`，仅用于标记未来可能接入的时间线、天气状态、强度、可见度 Provider 与渲染层。
