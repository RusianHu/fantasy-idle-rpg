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

稳定 ID 使用小写字母、数字、点、下划线和连字符。Definition 默认深冻结；重复 ID 必须显式 `patch: true` 或 `replace: true`。所有引用、公式、i18n 和资产在严格 `finalize()` 中一次审计。

## SpawnSpec

`archetypeId` 必填；可选 `actorRecordId`、`classId`、`variantId`、`level`、`tier`、`statValues`、`talentRanks`、`transform`、`partyId`、`teamId`、`factionId`、`controllerId`、`encounterId`、`spawnSource` 与确定性 `modifiers`。Encounter 内生成必须提供稳定 `spawnSource.sequence`。

`statValues`、`talentRanks` 与 `modifiers` 是可重建输入，刷新不得丢失。Record 绑定实例从 Record 读取职业、等级、装备、永久强化和 Talent；新 Record 未初始化 HP 时以完整 StatBlock 上限出生。

## Unit 与刷新边界

- `Game.units.vitals(ref)` 只投影 HP/上限/存活/生命周期，供 HUD 高频读取；`snapshot(ref)` 才克隆完整属性、资源和状态。
- HP、死亡/复活、最大生命协调和运行时 Modifier source 统一走 `Game.units`；业务代码不得直接写 `components.vitals` 或 `modifierLedger`。
- `Game.actors.refresh()` 重建 Blueprint、Talent 私有内容和 StatBlock，同时保留同 ID 资源当前值、现存 Status、SpawnSpec 与外部 Modifier source；HP 策略显式选择绝对值、比例或回满。
- `Game.units.assertInvariant()` 检查 StatBlock/Vitals 上限、HP、有限属性、资源边界、生命周期、Record HP 同步与 Record 单实例。

## Modifier、Status 与 Talent

Modifier 必须显式写 `stat / phase / operation / value`；Talent Modifier 使用 `perRank`。叠层规则固定为：

| operation | N 层 |
| --- | --- |
| `add` / `addPct` | `value × N` |
| `multiply` | `value ^ N` |
| `set` | `value` |

`refresh` 与 `unique` Status 始终一层；`stack` 必须声明 `maxStacks`。周期效果每层执行一次。Status 应用时快照有效 Modifier/periodic 定义，来源离场或 Actor 刷新不会改变已落地的本次状态。

主动 Talent 在 `grants.modifyAbilityId` 下用 `patches[]` 指向 Ability 或 Status 的现有数值路径，运行时为每个 Actor 生成私有副本；被动 Talent 写入 StatBlock。全局编译 Card 始终深冻结，禁止就地修改。
