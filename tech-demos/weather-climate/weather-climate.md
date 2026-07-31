# Weather / Climate Lab

入口：

`weather-climate.html?seed=1234ABCD&region=forest&time=300&particle=region&mode=forced&front=volatile&state=muffledStorm&intensity=0.85&lang=zh-CN`

本页是生产天气系统的无存档 QA 契约，直接加载 `climateProfile`、`Game.weather`、`Game.weatherRender`、正式地形、昼夜和环境粒子：

- 时间线模式验证 300 秒全局天气锋、24 秒过渡、强度与雷击序列。
- 强制模式验证五类天气锋、区域微气候、任意强度和过渡进度。
- 四层开关分别隔离云幕、湿润地表、世界降水与屏幕雷光。
- 减少动态模拟验证无快速粒子、闪屏和震动的降级表现。
- 五天气锋对照板和八区暴露表审计区域映射、外部降水、星月与昼夜色调。
- 结构化报告公开可见度、风力、湿润度、下一次切换、雷击序列与天气层帧耗时。

页面不会调用 `Game.world.init()`，也不会启动 Population、战斗、探索、交易、离线结算或存档。跨区粒子选择器仍只向 `Game.particles.initRegion` 传递区域浅拷贝。

## QA 接口

`window.WeatherClimateLab` 暴露：

- `regions()`、`particlePresets()`、`snapshot()`、`report()`
- `setRegion()`、`setSeed()`、`setWorldTime()`、`setParticlePreset()`、`setEffects()`
- `setWeatherMode()`、`setWeatherFront()`、`setWeatherIntensity()`、`setTransitionProgress()`
- `setRenderLayers()`、`setReducedMotion()`、`triggerLightning()`
- `setCamera()`、`capturePhases()`、`verifyDeterminism()`

`futureHooks` 保留为兼容报告字段，但所有条目均指向生产天气实现。
