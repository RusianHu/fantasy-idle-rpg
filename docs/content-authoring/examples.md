# Actor 作者示例

最小非战斗 NPC：`js/data/packs/world/actors.pack.js` 的 `npc.guild_scout`。它没有 Stat/Action 组件，仍具有身份、Body、Faction、Controller 与 Presentation。

完整普通怪：`js/data/packs/regions/grassland.pack.js` 的 `wolf_gray`，由 `regions/factory.support.js` 通过 `Game.contentAuthoring` factory 生成 Stat、基础 Action、Trait、Reward、Archetype、EncounterPack、WorldSpawnProfile 与 Population 挂载。

完整 Boss：同文件的 `slime_king`，包含基础 Action、三项机制 Action、可打断预警、Trait、Boss resistance/resource、奖励与 50% phase。

召唤物和可战斗 object：`js/data/packs/world/actors.pack.js` 的 `summon.shadow_wisp`、`object.arcane_crystal`。

中立可攻击生态：`js/data/packs/world/meadow-fox.pack.js` 的 `creature.meadow_fox`。普通状态没有战斗组件，挑衅后经 Variant 原子切换并由反向 `mountTo` 进入草原 NPC 通道。

作者 smoke fixture：`tests/fixtures/packs/authoring-smoke.pack.js`，用于验证外部 Pack 的依赖、引用、Blueprint、世界挂载与严格审计。

主动 Talent patch：`js/data/packs/jobs/fighter.pack.js` 的 `ft_heavy`（Ability 数值路径）与 `ft_warcry`（来源 Actor 私有 Status 数值路径）。被动多属性 Modifier：`js/data/packs/jobs/rogue.pack.js` 的 `rg_deadly`。可叠倍率与周期状态分别参考 `grassland.corroded`、`forest.poisoned`；运行时合同回归位于 `tests/v2-runtime.test.js`。
