# Roguelike 装备机制与渲染 Lab

入口：`roguelike-equipment.html?seed=1234ABCD&class=fighter&level=32&tier=4&source=boss&samples=1000&lang=zh-CN`。

## 职责

- **掉落实验**：并列运行同一生产掉落链的基线和实验组。实验仅覆盖正式上下文与初始状态；每次计划只推进一次来源 ordinal、保底和五槽 drought。候选数 1–4 只派生同槽、同稀有度和同等级的额外正式装备。
- **生成显微镜**：通过 `Game.loot.inspectGeneration` 展示槽位、底材、稀有度、隐含值、词缀过滤与传奇效果的有序 Trace。职业、等级、槽位、底材和稀有度可以固定；其余阶段继续使用正式权重与 seeded RNG。
- **效果检查器**：直接展示 `Game.equipment.compileItem` 的 Modifier/Effect 引用，并以五槽临时 loadout 调用 `Game.builds.compileActorRecord` 比较替换前后的 StatBlock。传奇效果只静态展开流程，不模拟战斗 Proc。

## 渲染合同

程序化外观直接使用正式 `Game.equipmentVisuals`：槽位决定 20×20 主轮廓、40 个底材视觉配置决定结构部件、职业决定武器形态、稀有度决定材质、词缀族决定纹样、传奇 EffectProfile 决定双帧效果；10×10 地面图由主图语义降采样。UID 与来源 Seed 固定核心外观，重铸只更新词缀族纹样。

渲染帧由独立 128 帧 LRU 缓存并以最近邻缩放绘制，不注册到 `Game.assets`，也不进入装备实例或存档。Lab 的轮廓、材质、词缀和传奇图层开关只影响诊断合成参数。

## 诊断边界

`Game.loot.inspectPlan(context,state)` 与 `inspectGeneration(context)` 和正式入口共用内部实现；Trace 只在返回值中存在，不额外消费 RNG、修改输入状态、改变 UID 或触发事件。现有 `loot-lab` 继续负责大样本分布、重铸、多阶暴击和非法内容池审计。

## 验证

```powershell
node tests\equipment-trace.test.js
node tests\roguelike-equipment-lab.test.js
node tests\roguelike-equipment-browser-smoke.test.js
node tests\cache-version.test.js
```

浏览器测试需要先在项目根目录运行 `python -m http.server 4176`，并验证桌面/390px、中英文、三标签联动、候选覆盖、Trace、Canvas 像素、整数缩放、减少动态、44px 触控和零正式存档副作用。
