# 移动行商机制 Lab

入口：`merchants.html?seed=1234ABCD&region=grassland&lang=zh-CN`。本页以临时 `Game.State.newGame()` 状态直接运行正式行商内容、Population、交易能力与战斗领域，不读取或写入正式存档。

## 验证范围

- 自动枚举四个正式 `merchantProfile` 及其八区 Actor、Interaction、Engagement、Spawn 和 Encounter 内容链。
- 按世界种子和区域强制生成一次会面，检查固定 8 槽库存：2 常备、4 旅行、1 招牌、1 稀有。
- 调整信誉、金币并执行购买、付费议价、价格带、隐藏货架、拒绝交易和赔偿支付。
- 复用正式敌对事务模拟攻击承诺、40% 生命撤离边界、致死转投降、宽恕与抢掠；行商不产生常规击杀奖励。
- 结构化报告显示事件种子、货架角色、锁定/议价状态、信誉、债务和当前领域快照；事务日志按发生顺序记录操作结果。

## 边界

页面只构造当前 QA 会话，不调用 `Game.save`，不结算离线时间，也不模拟正式世界中的行走计时发现过程。移动端和桌面端浏览器回归仍待接入 `tests/browser-smoke.js`；领域不变量由 `tests/wandering-merchants.test.js` 保护。
