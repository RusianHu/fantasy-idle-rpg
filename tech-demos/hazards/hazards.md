# Hazard 特效技术验证

独立页面直接加载正式 `hazardProfile`、`systems/hazards.js`、`render/hazards.js` 与世界渲染链。它用于验证：

- 八区域现场实例的线索、揭示、预警、激活、命中、冷却与导航成本。
- 九类视觉符号在六个关键状态下的轮廓、色彩、方向性和降动态表现。
- 像素 JRPG 视觉约束：机关材质化、离散地砖警戒符、逐类爆发碎屑、像素战斗铭牌，避免连续 HUD 圆环与大块透明覆盖。
- 固定 50ms tick 下的预警与伤害窗口，及中英文表现文案。
- 桌面与窄屏布局、44px 触控目标和 Canvas 视口适配。

URL 参数：`seed`、`region`、`lang`。页面暴露 `window.HazardEffectsLab`，供浏览器测试读取目录、快照、事件并调用阶段控制。
