# Actor 内容契约

## 五层身份

| 层 | 职责 | 持久化 |
| --- | --- | --- |
| `ActorArchetype` | 玩家、怪物、NPC、召唤物、object 的内容身份 | 内容 |
| `Class` / Variant | 职业能力、资源、Trait 和战术引用 | 内容 |
| `ActorBlueprint` | `finalize()` 后解析出的只读组合 | 可重建 |
| `ActorRecord` | 名册成长、Talent、装备、永久资源 | v12 |
| `ActorInstance` | 位置、HP、Action、冷却、状态、威胁关系 | 不持久化 |

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

`archetypeId` 必填；可选 `actorRecordId`、`classId`、`variantId`、`level`、`tier`、`transform`、`partyId`、`teamId`、`factionId`、`controllerId`、`encounterId`、`spawnSource` 与确定性 `modifiers`。Encounter 内生成必须提供稳定 `spawnSource.sequence`。
