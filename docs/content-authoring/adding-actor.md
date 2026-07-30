# 添加 Actor

正式内容的文件系统真源是 `js/data/packs/**/*.pack.js` 与 `*.support.js`：Pack 保存声明式内容，Support 只承载受能力约束的作者展开逻辑。构建工具递归发现两者，不维护手写文件清单，也不需要修改 HTML；`js/data/content/*.generated.js` 只由工具生成，禁止手改。

## 创建内容胶囊

```powershell
.\tools\scaffold-actor.ps1 `
  -PackId world.example-sentinel `
  -ActorId npc.example_sentinel `
  -Category combat-npc `
  -PopulationId population.grassland `
  -RegionPackId region.grassland
```

脚手架支持 `monster`、`boss`、`npc`、`peaceful-creature`、`combat-npc`、`summon`。默认生成可严格编译的 Pack-local 中英文、Interaction/Engagement、Actor，以及该类型需要的 Ability、Variant、EncounterPack 和 WorldSpawnProfile；使用已注册的 `actor_placeholder`，随后应替换为正式资产 ID。命令完成时自动重建 Bundle 并执行 `--check`；`-SkipBuild` 仅供测试工具创建临时 fixture。

| 类型 | 默认世界入口 |
| --- | --- |
| `monster` | `regular` 加权 Spawn，敌对 EncounterPack |
| `boss` | `rare` 加权 Spawn，Boss rank 与较高奖励预算 |
| `npc` | `npc` 加权 Spawn，保护型交谈 |
| `peaceful-creature` | `npc` 加权 Spawn，只观察、不可攻击 |
| `combat-npc` | 中立 Actor；挑衅后原地切换 armed Variant 并建立 Encounter |
| `summon` | `summonOnly`、ephemeral、无 Population 挂载 |

## 作者合同

1. Pack 声明稳定 `id/version/sourceFile/requires`；跨 Pack 依赖使用语义化版本范围。
2. Pack-local `locales` 必须同时提供 `zh-CN` 与 `en`，且只能包含本 Pack 定义实际引用的 key。
3. `actorArchetype` 只描述稳定身份和内容引用。运行时队伍、坐标、实例 ID 与 generation 不进入 Card。
4. `EncounterPack` 只描述可复用成员组，每个成员使用稳定 `slotId`；非战斗 NPC 不创建伪 EncounterPack。
5. `WorldSpawnProfile` 是进入世界的唯一入口，并通过 `mountTo` 反向挂载 Population。Population 先用 `prepareRegion()` 生成不可变 `PopulationMountPlan`，按固定 channel 顺序完成槽位选择与坐标预留，再由 `materializeSlot()` 实例化；放置失败与当前计划可从 `mountPlan()` 检查。
6. 可持久世界身份使用 `regionStable/worldStable`；召唤使用确定性 request key 的 `ephemeral`。存档和 EngagementCommand 不引用临时 ActorInstance ID。
7. Variant 只覆盖白名单字段；挑衅武装、Boss phase 和脚本转换均走 `Game.actors.transitionVariant()`，不得直接改 Blueprint 或组件。
8. Modifier、Status、Talent patch、公式和 objective handler 只能引用已注册数据；custom Objective 必须同时声明已注册 handler 的稳定 ID 与整数版本，handler 必须确定性。Card 中禁止函数、DOM、随机数和运行时实例。
9. 正式 `spriteId` 必须已注册，缺失时严格审计会阻止启动；脚手架使用的是已注册 `actor_placeholder`，应在内容验收前替换。`portraitId` 可选，缺失或不可用时战斗 HUD 回退到已注册战斗精灵，再回退到确定性像素剪影。运行时降级不是绕过 `spriteId` 门禁的通道。

纯作者展开逻辑放在 `*.support.js`：每个文件只能注册一个带稳定 ID/版本/依赖/能力列表的 `ContentSupport`，不得注册 Pack。可声明能力仅为 `authoring.read`、`authoring.write`、`rules.formula`、`rules.handler`；值和纯 factory 通过 `capabilities.authoring` 写入版本化 `Game.contentAuthoring`，Support 不接收完整 `Game`，也不得在闭包中改写它。普通内容优先保持单个 `*.pack.js` 胶囊。

Population 独占世界出生生命周期：死亡、逃跑或脚本 despawn 先关闭 Lease 和取消旧 generation 命令，再由 `update(dt, worldTime)` 执行 `delay` 或绝对 `worldTime` 重生；`resetVariant` 决定是否清除持久 Spawn Variant。业务系统不要另建刷新计时器。

显式攻击只提交稳定键 `EngagementCommand`。运行时在固定 tick 构造无副作用 Draft/CommitPlan，并由 `Game.encounters.startAtomic()` 一次提交 Variant、Relation、社交记忆、Encounter、成员、目标与 revision；成功事件固定按 `variant* → relation → started → joined* → committed` 发布，opening Action 随后仍走正式 `requestAction()`。

## 验证

```powershell
node tools/build-content-bundle.js
node tools/build-content-bundle.js --check
node tools/audit-content.js
node tests/content-support-capabilities.test.js
node tests/v2-authoring.test.js
node tests/v2-content-validation.test.js
node tests/v2-content-entrypoints.test.js
node tests/unit-ecosystem-v14.test.js
node tests/v2-runtime.test.js
```

`build-content-bundle.js` 会在独立源 VM 与纯 Bundle VM 中编译并比较 Pack、Support、authoring registry、locales、Population 挂载视图、fingerprint 和 `sourceSetHash`。新增、删除、改名、遗漏源文件或越权的 Support 都会使 `--check` 失败。

## Lab 复现

打开 `tech-demos/units/units.html?unit=npc.example_sentinel&encounter=encounter.grassland&strategy=balanced&seed=42&scenario=engagement`。检查 Card、Blueprint、Variant、稳定 SpawnLease、外部 EngagementCommand、Objective、Relation 与表现日志。地图现场页会直接枚举编译 Population、PopulationMountPlan 的预留/失败/重生队列与活动 SpawnLease。
