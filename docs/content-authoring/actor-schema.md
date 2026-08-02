# Actor 内容契约

## 五层身份

| 层 | 职责 | 持久化 |
| --- | --- | --- |
| `ActorArchetype` | 玩家、怪物、NPC、召唤物、object 的内容身份 | 内容 |
| `Class` / Variant | 职业能力、资源、Trait 和战术引用 | 内容 |
| `ActorBlueprint` | `finalize()` 后解析出的只读组合 | 可重建 |
| `ActorRecord` | 名册成长、Talent、装备、永久资源；同一 Record 最多一个存活实例 | v12+ Roster |
| `ActorInstance` | 位置、HP、Action、冷却、状态与 Encounter 引用；威胁表归 Encounter 所有 | 不持久化 |

## 最小 `actorArchetype`

```js
{
  id: 'example_knight',
  category: 'monster',
  rank: 'normal',
  identity: {
    nameKey: 'monster.example_knight.name',
    descKey: 'monster.example_knight.desc',
    loreKey: 'combat.lore.example_knight'
  },
  presentation: { spriteId: 'example_knight', renderProfileId: 'render.actor.standard' },
  body: { size: 'medium', collisionRadius: 8, movementTypes: ['ground'] },
  defaultFactionId: 'wild',
  statProfileId: 'stats.example_knight',
  resourceProfileIds: [],
  abilityGrantIds: ['example_knight.basic'],
  traitIds: ['example_knight.trait'],
  resistanceProfileId: 'resist.standard',
  aiProfileId: 'ai.monster.standard',
  rewardProfileId: 'reward.example_knight'
}
```

稳定 ID 使用小写字母、数字、点、下划线和连字符。Definition 默认深冻结；重复 ID 必须显式 `patch: true` 或 `replace: true`。严格 `finalize()` 当前审计 schema、公式、i18n、通用引用以及已声明资产 ID 的注册状态；已知门禁缺口是完全缺失的 `presentation.spriteId` 尚不会失败，`presentation.renderProfileId` 也尚未进入嵌套引用审计。作者合同仍要求 `presentation.spriteId` 必填且合法，并要求声明的 `presentation.renderProfileId` 引用合法；不能依赖运行时回退规避正式内容验收。

## SpawnSpec

`archetypeId` 必填；可选 `actorRecordId`、`classId`、`variantId`、`level`、`tier`、`statValues`、`talentRanks`、`transform`、`partyId`、`teamId`、`factionId`、`controllerId`、`encounterId`、`spawnSource` 与确定性 `modifiers`。Encounter 内生成必须提供稳定 `spawnSource.sequence`。

`statValues`、`talentRanks` 与 `modifiers` 是可重建输入，刷新不得丢失。Record 绑定实例从 Record 读取职业、等级、装备、永久强化和 Talent；新 Record 未初始化 HP 时以完整 StatBlock 上限出生。

## Unit 与刷新边界

- `Game.units.vitals(ref)` 只投影 HP/上限/存活/生命周期，供 HUD 高频读取；`snapshot(ref)` 才克隆完整属性、资源和状态。
- HP、死亡/复活、最大生命协调和运行时 Modifier source 统一走 `Game.units`；业务代码不得直接写 `components.vitals` 或 `modifierLedger`。
- `Game.actors.refresh()` 重建 Blueprint、Talent 私有内容和 StatBlock，同时保留同 ID 资源当前值、现存 Status、SpawnSpec 与外部 Modifier source；HP 策略显式选择绝对值、比例或回满。
- `Game.units.assertInvariant()` 检查 StatBlock/Vitals 上限、HP、有限属性、资源边界、生命周期、Record HP 同步与 Record 单实例。

## Variant 转换边界

- `Game.actors.transitionVariant()` 只接受同 Archetype 的已声明转换边；脱战即时提交，战中只在 cleanup phase 执行 `defer/cancel`。
- prepare 在分离的候选 runtime state 中重建 Blueprint 与组件；commit 只替换一次 `runtimeState` 引用并递增 `runtimeRevision`，失败恢复原引用且不增加 Encounter sequence。
- HP 按比例映射；同 ID Resource、Ability cooldown/group/charge、兼容 Status/Shield/Threat/Targeting 保留并按新上限裁剪；失效 Status 与新 Blueprint 不再授予的 Combo 被移除。
- `actorRecord/worldSpawn/none` persistence 只由转换边决定。普通怪或 `resetVariant` Spawn 重生回到 WorldSpawnProfile 默认 Variant。

## Encounter 与 Objective

`teamSlots` 显式声明 `combatant/objective/observer`、coalition、`countsForCompletion` 与奖励资格。胜负只由 `completionPolicy.mode: 'allRequired'` 和 Objective evaluator 决定；observer 不建 threat table、不可成为 Action/AOE 目标，也不运行 AI。custom Objective 只引用经 `rules.handler` 注册、带版本且确定性的 handler。

## Modifier、Status 与 Talent

Modifier 必须显式写 `stat / phase / operation / value`；Talent Modifier 使用 `perRank`。叠层规则固定为：

| operation | N 层 |
| --- | --- |
| `add` / `addPct` | `value × N` |
| `multiply` | `value ^ N` |
| `set` | `value` |

`refresh` 与 `unique` Status 始终一层；`stack` 必须声明 `maxStacks`。周期效果每层执行一次。Status 应用时快照有效 Modifier/periodic 定义，来源离场或 Actor 刷新不会改变已落地的本次状态。

主动 Talent 在 `grants.modifyAbilityId` 下用 `patches[]` 指向 Ability 或 Status 的现有数值路径，运行时为每个 Actor 生成私有副本；被动 Talent 写入 StatBlock。全局编译 Card 始终深冻结，禁止就地修改。
