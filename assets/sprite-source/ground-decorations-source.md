# 八区地表装饰来源

## 定位

- 72 件造型的 ImageGen 提示词保留下文；合成概念大图和生成中间文件不纳入项目资产。
- 正式维护源为 `ground-decorations/<region>/<stable-id>.png` 下的 72 张独立透明 PNG，替换单件装饰无需裁切母版或编辑其他装饰。
- `tools/build-ground-decorations.py` 为每张源图生成同 ID 的生产 PNG、八个区域运行时模块、来源哈希清单与 `ground-decorations-preview.png` 联系表；`*.generated.*` 不直接手改。
- 构建器统一添加项目既有的 1px 深色描边，并将透明 PNG 编译为同步字符网格；源图须为不超过 32×32 的硬边像素图，只使用全透明或全不透明像素。
- 稳定 ID 使用 `deco_<region>_<object>`，区域配置位于 `js/data/packs/regions/catalog.support.js`。

## 主题排列

生成联系表为 8 行 × 9 列，自左向右：

1. `grassland`：三叶草簇、野麦穗、蒲公英簇、兔穴、落枝、妖精菇环、半埋马蹄铁、踏脚石、风铃草簇。
2. `forest`：苔藓倒木、红伞菌簇、松果与橡果、盘根树结、落叶堆、蕨叶石丛、荆棘丛、空蜗牛壳、苍白蛾群。
3. `mine`：断裂矿轨、煤块堆、废弃矿镐、矿灯、坑木碎料、铜矿碎石、锈蚀矿车轮、炸药捆、破损矿袋。
4. `graveyard`：开裂墓板、枯萎祭花、锈链盘、骨灰瓮碎片、灵质水洼、新土坟丘、墓葬银币、出土骨手、渡鸦羽毛。
5. `snowpass`：冰刺簇、覆雪残骨、霜灌木、路标石堆、冻结水洼、断裂雪橇、雪地狼迹、冰封绳圈、破损路旗。
6. `lavacave`：余烬喷口、硫晶簇、熔岩结壳、玄武岩碎锥、焦黑残骨、火山灰堆、火蛋白石晶洞、焦黑铁栅、熔火足迹。
7. `skyruins`：发光符文砖、古代齿轮残片、云岩碎块、以太浮光、云绒草、青金马赛克、残破星盘、陶罐碎片、金翼残片。
8. `darkcastle`：猩红仪式纹、铁链盘、黑旗残布、恶魔爪痕、紫瘴菌簇、石像鬼残片、破碎仪式杯、骨质烛台、黑铁棘冠。

## 首批 48 件生成提示词

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

## 新增 24 件逐件生成提示词

每件均使用内置 ImageGen 独立生成，`ground-decorations-preview.png` 作为 `Image 1` 风格与尺度参考；草原、森林、矿洞、墓园、雪山和天空遗迹使用 `#ff00ff` 色键，熔岩洞与魔王城使用 `#00ff00` 色键。公共提示词如下，其中 `{subject}`、`{palette}` 和 `{key}` 由后表替换：

```text
Use case: stylized-concept
Asset type: one production source sprite for a 2D browser RPG ground decoration
Input images: Image 1 is a style and scale reference sheet only; generate a new standalone sprite, do not edit or reproduce the sheet.
Primary request: {subject}
Style/medium: authentic hand-pixeled 16-bit SNES-era Japanese medieval fantasy JRPG environment sprite, crisp hard square pixel clusters, limited palette of 3 to 5 subject colors, readable silhouette, 3/4 top-down perspective, designed to reduce cleanly to about 14x8 logical pixels.
Composition/framing: exactly one isolated small ground prop centered, consistent baseline, object fills about 55 percent of the square canvas, generous empty padding.
Scene/backdrop: perfectly flat uniform solid {key} chroma-key background for removal, one exact color, no gradient, no texture, no floor.
Lighting/mood: {palette}
Constraints: no dark outline because the project build adds it; no anti-aliasing; no semi-transparent pixels; no cast shadow; no contact shadow; no reflection; no characters; no monsters; no extra objects; no UI; no labels; no letters; no numbers; no watermark; do not use {key} in the subject.
```

- `grassland`，明亮田园草地配色：`a small half-buried weathered iron horseshoe with a little tan soil showing inside the curve`；`three irregular flat pale stepping stones forming a short diagonal path segment`；`a tiny cluster of bluebell wildflowers with green stems and three blue-violet bell blossoms`。
- `forest`，冷雾古林配色：`a compact tangled bramble patch with two arching dark green thorny vines and a few muted leaves`；`one small empty spiral snail shell resting on a little patch of damp brown leaves`；`a tiny loose swarm of exactly three pale cyan forest moths, arranged close together as one readable floating ground-decoration cluster`。
- `mine`，废弃矿洞的铁、煤、旧木、赭石与铜色：`one rusted detached minecart wheel with a short broken axle, lying partly flat on the ground`；`a compact bundle of exactly three short red-orange mining dynamite sticks tied with coarse rope, unlit fuse`；`one small torn canvas ore sack slumped on the ground with two dark ore chunks visible at the opening`。
- `graveyard`，月光墓园的冷石、骨白、钝银与灰紫色：`a small ritual offering of three tarnished silver grave coins laid on a chipped flat stone`；`one skeletal hand emerging only wrist-high from a small dark soil crack, fingers curled and clearly readable`；`a compact scatter of exactly three black raven feathers lying crossed on gray graveyard soil`。
- `snowpass`，寒风雪山的冰蓝、雪白、旧绳与褪红色：`a short readable trail of exactly four dark wolf paw prints pressed into one small patch of pale snow, viewed from above`；`one stiff frozen climbing-rope coil partly crusted with pale blue ice, lying flat`；`a small torn faded red trail pennant attached to one short broken wooden stake, collapsed low into snow`。
- `lavacave`，熔岩洞的炭黑、玄武岩、余烬橙与硫金色：`one cracked dark fire-opal geode split open to reveal a compact glowing orange crystalline core`；`a short charred iron grate fragment, bent and partly fused with two tiny orange lava beads`；`one small molten footprint-shaped puddle glowing orange inside a dark cooled basalt rim, viewed from above`。
- `skyruins`，天空遗迹的白色云岩、旧青铜、天蓝与哑金色：`one small broken bronze astrolabe lying tilted, with a simple circular ring and two readable crossbars`；`one cracked ancient white-and-blue amphora fragment group, a half pot plus two ceramic shards`；`one small broken golden wing ornament from an ancient statue, exactly three stylized feather plates on a marble chip`。
- `darkcastle`，魔王城的黑铁、骨白、干涸猩红与灰紫色：`one broken dark silver ritual chalice lying on its side with a cracked bowl and one dried crimson stained shard`；`one low bone candelabrum fragment made of three short ivory candle sockets, all unlit and partly broken`；`one small twisted black-iron thorn crown abandoned on a dark stone chip, compact oval silhouette with five spikes`。

生成图先经 `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill` 去除色键，再裁切、缩编到 9×8 至 16×11、量化为最多 5 色并将 Alpha 二值化；正式源图只保留最终像素结果。

## 重建与验收

1. 精准替换时只覆盖 `assets/sprite-source/ground-decorations/<region>/<stable-id>.png`；保持文件名、透明背景和像素级尺寸，不编辑 `props.js` 或 generated 产物。
2. 运行 `python tools/build-ground-decorations.py`，再运行 `python tools/build-ground-decorations.py --check` 校验 72 个源哈希、72 张生产 PNG 与八个区域模块。
3. 只有新增/删除定义时才同步调整构建器 `REGIONS` 和区域 `terrain.deco`；声明继续使用 `placement: 'ground'`、`v3Only: true`，v1/v2 生成器必须忽略 `v3Only`。
4. 定义变化后运行 `node tools/build-content-bundle.js`；最后在 `tech-demos/map-effects` 的“地表装饰”目录逐区检查 9 个定义、实际实例与精灵预览。
