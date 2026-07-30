# 八区地表装饰来源

## 定位

- 48 件造型的初始设计提示词保留下文；合成概念大图不纳入项目资产。
- 正式维护源为 `ground-decorations/<region>/<stable-id>.png` 下的 48 张独立透明 PNG，替换单件装饰无需裁切母版或编辑其他装饰。
- `tools/build-ground-decorations.py` 为每张源图生成同 ID 的生产 PNG、八个区域运行时模块、来源哈希清单与 `ground-decorations-preview.png` 联系表；`*.generated.*` 不直接手改。
- 构建器统一添加项目既有的 1px 深色描边，并将透明 PNG 编译为同步字符网格；源图须为不超过 32×32 的硬边像素图，只使用全透明或全不透明像素。
- 稳定 ID 使用 `deco_<region>_<object>`，区域配置位于 `js/data/packs/regions/catalog.support.js`。

## 主题排列

生成联系表为 8 行 × 6 列，自左向右：

1. `grassland`：三叶草簇、野麦穗、蒲公英簇、兔穴、落枝、妖精菇环。
2. `forest`：苔藓倒木、红伞菌簇、松果与橡果、盘根树结、落叶堆、蕨叶石丛。
3. `mine`：断裂矿轨、煤块堆、废弃矿镐、矿灯、坑木碎料、铜矿碎石。
4. `graveyard`：开裂墓板、枯萎祭花、锈链盘、骨灰瓮碎片、灵质水洼、新土坟丘。
5. `snowpass`：冰刺簇、覆雪残骨、霜灌木、路标石堆、冻结水洼、断裂雪橇。
6. `lavacave`：余烬喷口、硫晶簇、熔岩结壳、玄武岩碎锥、焦黑残骨、火山灰堆。
7. `skyruins`：发光符文砖、古代齿轮残片、云岩碎块、以太浮光、云绒草、青金马赛克。
8. `darkcastle`：猩红仪式纹、铁链盘、黑旗残布、恶魔爪痕、紫瘴菌簇、石像鬼残片。

## 生成提示词

```text
Use case: stylized-concept
Asset type: game environment prop concept atlas for a 2D browser RPG
Primary request: create one clean pixel-art reference sheet containing exactly 48 distinct small ground-decoration props, arranged as a strict 8-row by 6-column grid. Each row is one biome and must contain these six objects in order.
Row 1 grassland: clover patch; wild wheat tuft; dandelion cluster; rabbit burrow; fallen branch; small fairy mushroom ring.
Row 2 misty forest: mossy fallen log; red mushroom cluster; pinecones and acorns; exposed root knot; fallen leaf pile; tiny fern-and-stone patch.
Row 3 abandoned mine: broken rail segment; coal pile; discarded pickaxe; low mining lantern; splintered timber scraps; copper ore rubble.
Row 4 undead graveyard: cracked stone grave slab; wilted grave flowers; rusty chain coil; broken funeral urn shards; ectoplasm puddle; fresh grave soil mound.
Row 5 snowy mountain pass: small ice spike cluster; snow-covered bones; frost shrub; trail cairn; frozen puddle; broken sled plank.
Row 6 lava cavern: ember vent; sulfur crystal cluster; cooled lava crust; basalt shard pile; scorched bones; ash mound.
Row 7 floating sky ruins: glowing rune tile; ancient gear fragment; marble rubble; floating aether motes; cloud-grass tuft; broken blue-and-gold mosaic.
Row 8 demon castle: crimson ritual rune; iron chain coil; torn black banner scrap; demon claw marks in stone; purple fungus patch; broken gargoyle fragment.
Style/medium: authentic hand-pixeled 16-bit SNES-era JRPG environment sprites, crisp hard pixel edges, limited palette, readable silhouettes, 3/4 top-down perspective, each prop approximately 12x8 to 18x14 logical pixels, no anti-aliasing, no painterly rendering.
Composition/framing: strict evenly spaced grid, six isolated props per row, generous empty padding between cells, consistent baseline and scale, no overlaps.
Scene/backdrop: perfectly flat uniform neutral charcoal background.
Lighting/mood: match each biome's natural palette while keeping sprites readable.
Constraints: exactly 48 props; no characters; no monsters; no UI frames; no labels; no letters; no numbers; no watermark; no logos; no shadows extending into neighboring cells.
```

## 重建与验收

1. 精准替换时只覆盖 `assets/sprite-source/ground-decorations/<region>/<stable-id>.png`；保持文件名、透明背景和像素级尺寸，不编辑 `props.js` 或 generated 产物。
2. 运行 `python tools/build-ground-decorations.py`，再运行 `python tools/build-ground-decorations.py --check` 校验 48 个源哈希、48 张生产 PNG 与八个区域模块。
3. 只有新增/删除定义时才同步调整构建器 `REGIONS` 和区域 `terrain.deco`；声明继续使用 `placement: 'ground'`、`v3Only: true`，v1/v2 生成器必须忽略 `v3Only`。
4. 定义变化后运行 `node tools/build-content-bundle.js`；最后在 `tech-demos/map-effects` 的“地表装饰”目录逐区检查 6 个定义、实际实例与精灵预览。
