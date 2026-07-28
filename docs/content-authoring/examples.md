# Actor 作者示例

最小非战斗 NPC：`js/data/packs/world/actors.js` 的 `npc.guild_scout`。它没有 Stat/Action 组件，仍具有身份、Body、Faction、Controller 与 Presentation。

完整普通怪：`js/data/packs/regions/grassland.js` 的 `wolf_gray`，由区域工厂生成 Stat、基础 Action、Trait、Reward、Archetype 和 Encounter pack 引用。

完整 Boss：同文件的 `slime_king`，包含基础 Action、三项机制 Action、可打断预警、Trait、Boss resistance/resource、奖励与 50% phase。

召唤物和可战斗 object：`js/data/packs/world/actors.js` 的 `summon.shadow_wisp`、`object.arcane_crystal`。

作者 smoke fixture：`tests/fixtures/packs/authoring-smoke.js`，用于验证外部 Pack 的依赖、引用、Blueprint 与严格审计。
