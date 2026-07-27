# 角色与怪物技术验证

入口：`units.html?lang=zh-CN`。页面直接调用生产注册表、开放探索 v3、职业系统、怪物表、战斗核心、世界逻辑与渲染器，不复制模拟实现；支持 `file://` 直开与中英文即时切换。

## QA 控制

- 顶部「职业 / 普通怪 / Boss」分类切换，右侧检查器列出当前分类全部单位，点击即可切到对应单位。
- 左右箭头或在分类内按 `[` / `]` 切换上一个/下一个单位。
- 日夜阶段控件：循环 / 昼间 / 黄昏 / 夜晚。
- 「环境效果」开关控制氛围粒子；「动态效果」开关控制 Canvas 动效降级。

## 实体图形气泡

- 页面直接调用生产 `Game.actionBubbles` 与 `Game.render.drawActionBubbleIcon()`，不复制气泡状态机或像素图形。
- 自动轮播依次覆盖资源、采集、主角接敌与怪物警戒、宝箱、掉落；舞台气泡只显示图形。
- 手动检查可选择主角、怪物或双锚点，并触发六种默认图形；`Game.unitsBubbleDemo.snapshot()` 输出当前公开诊断快照。
- 每个实体拥有独立队列、优先级和去重状态；切换单位、操控模式或区域时复用生产清理事件。

## 战斗循环演示

- 舞台使用 `layoutVersion:3` 的正式 `Game.world`、`Game.combat`、`Game.render`；职业与等级先完成计算，再初始化世界，避免旧页面的空主角/空画布。
- 主角与陪练会投影到营地附近的合法可行走点，同时揭示对应迷雾；单位切换不会穿入硬阻挡。
- 选择职业时舞台只显示主角；选择怪物/Boss 时自动刷新对应陪练目标，Boss 会触发原版登场运镜与震屏。
- 「刷新陪练」：职业页随机刷新一只普通怪；怪物/Boss 页重新刷新当前单位。
- 「召唤 Boss」：随机召唤一只 Boss 作为目标。
- 「切换自动/手动」：调用 `Game.world.toggleControlMode()`；手动模式下可用 WASD / 方向键移动，点击怪物锁定，点击空白处移动。
- 「重置主角」：将主角回到舞台左侧并回满血。

## 检查器内容

- 职业：Lv.60 裸属性、派生属性（含被动加成）、五职业技能列表与图标。
- 怪物/Boss：精灵预览、属性面板、所属区域、经典阶位、攻击间隔。

## 复用链路

`classes.js` / `monsters.js` → `terrain_v3.js` → `exploration.js` / `expedition_ai.js` → `combat.js` / `action_bubbles.js` → `world.js` → `renderer.js`

## 自动验证

`node tests/cache-version.test.js` 校验 `units.html` 的全部 CSS/JS 查询版本与字体 `BUILD_ID` 同步；`node tests/browser-smoke.js` 验证移动端控件、主角/怪物双锚点和 Canvas 像素输出。
