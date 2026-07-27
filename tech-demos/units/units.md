# 角色与怪物技术验证

入口：`units.html`。页面直接调用生产注册表、职业系统、怪物表、战斗核心、世界逻辑与渲染器，不复制模拟实现；支持 `file://` 直开与静态服务器路径。

## QA 控制

- 顶部「职业 / 普通怪 / Boss」分类切换，右侧检查器列出当前分类全部单位，点击即可切到对应单位。
- 左右箭头或在分类内按 `[` / `]` 切换上一个/下一个单位。
- 日夜阶段控件：循环 / 昼间 / 黄昏 / 夜晚。
- 「环境效果」开关控制氛围粒子；「动态效果」开关控制 Canvas 动效降级。

## 战斗循环演示

- 舞台使用原版 `Game.world`、`Game.combat`、`Game.render`，在第一个区域（新手草原）生成主角与陪练目标。
- 选择职业时舞台只显示主角；选择怪物/Boss 时自动刷新对应陪练目标，Boss 会触发原版登场运镜与震屏。
- 「刷新陪练」：职业页随机刷新一只普通怪；怪物/Boss 页重新刷新当前单位。
- 「召唤 Boss」：随机召唤一只 Boss 作为目标。
- 「切换自动/手动」：调用 `Game.world.toggleControlMode()`；手动模式下可用 WASD / 方向键移动，点击怪物锁定，点击空白处移动。
- 「重置主角」：将主角回到舞台左侧并回满血。

## 检查器内容

- 职业：Lv.60 裸属性、派生属性（含被动加成）、六职业技能列表与图标。
- 怪物/Boss：精灵预览、属性面板、所属区域、经典阶位、攻击间隔。

## 复用链路

`classes.js` / `monsters.js` → `state.js` → `combat.js` → `world.js` → `renderer.js` / `effects.js` / `particles.js` / `daynight.js`

## 自动验证

`node tests/cache-version.test.js` 校验 `units.html` 与 `units.css` 的 `BUILD_ID` 同步。
