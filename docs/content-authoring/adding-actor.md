# 添加 Actor

1. 选择所属 Pack；跨 Pack 引用写入 `requires`，版本使用语义化范围。
2. 先定义 `statProfile`、Ability、Trait、Status 与 Reward，再定义 `actorArchetype`。
3. `actorArchetype` 只声明稳定身份与引用；运行时属性、队伍、阵营覆盖和出生坐标进入 `SpawnSpec`。
4. 中英文 `nameKey`、`descKey`、`loreKey` 必须同时存在；`spriteId` 必须已注册。
5. 将 Pack 文件加入 `js/data/packs/manifest.js` 和正式/Lab 脚本入口。
6. 运行：

```powershell
node tools/audit-content.js
node tests/v2-authoring.test.js
node tests/v2-runtime.test.js
```

生成骨架：

```powershell
.\tools\scaffold-actor.ps1 -PackId region.example -ActorId example_knight -Category monster
```

禁止在 Card 中放函数、DOM、未注册公式、运行时实例或随机数；确定性逻辑通过 `formulaId`/`handlerId` 和显式参数引用。

## Lab 复现

打开 `tech-demos/units/units.html?unit=example_knight&encounter=encounter.example&strategy=balanced&seed=42&scenario=default`。检查 Card、Blueprint、属性账本、资源、调度器、威胁和事件，再验证 1–4 对 1–8。
