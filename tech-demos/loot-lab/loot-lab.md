# 掉落与装备 Lab

入口：`loot-lab.html?seed=1234ABCD&class=fighter&enemy=slime_green&source=regular&lang=zh-CN`。本页创建隔离的临时状态，直接运行正式 Content Bundle、`Game.loot`、`Game.equipmentVisuals`、`Game.equipment`、`Game.reforge`、`Game.builds` 与 `Game.combatMath`，不读取或写入正式存档。

## 验证范围

- 自动枚举生产 `actorArchetype` 敌对单位，按单位默认映射普通/守卫/Boss/噬宝匣来源；逐次或连续击败时显示生产 Trace 的 Roll、有效阈值、连续保底、理论概率与实测频率。
- 最近 10 次击败以时间带展示命中/未出/保底；真实掉落装备直接调用生产程序化像素渲染器，敌人使用已登记生产精灵。
- 按职业、等级、区域阶位、来源、装备发现倍率和世界种子批量运行正式掉落状态机，展示五档稀有度、五槽分布与保底计数。
- 从批次候选构建五槽装备，显示 StatBlock 编译结果和稳定 `equipment:<uid>:<instanceId>` 传奇 EffectProfile 日志。
- 执行营地重铸报价、普通词条锁定、金币/地区材料扣除及确定性重掷事务。
- 以固定 roll 检查 100% 以上暴击的 guaranteed tier、额外层级概率和指数倍率。
- 审计 40 个底材、40 个视觉配置、24 条普通词条、16 条传奇效果、池引用、重复定义、槽位资格及生成实例验证。

## 边界

页面中的“击败”只推进生产掉落状态，不启动 Encounter、伤害结算或世界实体生命周期；批量结果只用于分布和协议诊断，不代表完整推进体验模拟。掉落体验的 100 seed × 2 小时验收由领域测试/平衡脚本承担。页面不会启动正式世界、离线结算或自动保存，临时金币和素材仅供重铸实验使用。
