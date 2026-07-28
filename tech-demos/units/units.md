# 角色与怪物技术验证

入口：`units.html?lang=zh-CN`。页面直接调用生产注册表、开放探索 v3、职业系统、怪物表、战斗核心、世界逻辑与渲染器，不复制模拟实现；支持 `file://` 直开与中英文即时切换。

## QA 控制

- 右侧「角色与怪物自动目录」直接遍历生产 `class`、`region`、`monster` 注册表：八张主题地图分别列出普通怪与 Boss 选项，职业不再由演示页手写。
- 点击主题地图会重建该区域的正式 v3 舞台；选择怪物时自动切到其所属地图，避免在草原背景验证高阶区域怪物。
- 顶部「职业 / 普通怪 / Boss」切换当前地图内的类别；左右箭头或 `[` / `]` 仅遍历当前类别与区域。
- 支持 `?region=forest&unit=treant_sapling&lang=zh-CN` 深链；选择状态会同步回 URL，便于复现。
- 日夜阶段控件：循环 / 昼间 / 黄昏 / 夜晚。
- 「环境效果」开关控制氛围粒子；「动态效果」开关控制 Canvas 动效降级。

## 实体图形气泡

- 页面直接调用生产 `Game.actionBubbles` 与 `Game.render.drawActionBubbleIcon()`，不复制气泡状态机或像素图形。
- 自动轮播依次覆盖资源、采集、主角接敌与怪物警戒、宝箱、掉落；舞台气泡只显示图形。
- 手动检查可选择主角、怪物或双锚点，并触发六种默认图形；`Game.unitsBubbleDemo.snapshot()` 输出当前公开诊断快照。
- 非战斗实体气泡统一读取朝向：向左/右行走时落在后脑斜上方，向上/下行走或无方向锚点时保持原有正上方；演示页提供三种冻结行走场景。
- 接敌与警戒改用目标感知的斜向左右对话框：默认落在交战双方头部外侧上方，尾巴斜向单位；纵向接敌固定主角左/怪物右，临近视口边缘时向内翻转。纵向、左沿、右沿场景会冻结单位并强制显示双方血条。
- `Game.unitsBubbleDemo.layouts()` 暴露气泡主体、尾巴、血条、翻转及视口约束诊断，便于自动验证零重叠。
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

- 职业：注册 ID、角色/头像精灵、武器、职业特征、Lv.60 裸属性与派生属性、技能列表与图标。
- 怪物/Boss：注册 ID、精灵、区域选项位、变体系数、属性面板、所属区域、经典阶位、攻击间隔。
- `Game.unitsBubbleDemo.catalog()` 输出注册表覆盖、缺失/未映射怪物与八区完整选项；`selectRegion()`、`selectUnit()`、`selection()` 用于自动化复现。

## 复用链路

`classes.js` / `monsters.js` → `terrain_v3.js` → `exploration.js` / `expedition_ai.js` → `combat.js` / `action_bubbles.js` → `world.js` → `renderer.js`

## 自动验证

`node tests/cache-version.test.js` 校验 `units.html` 的全部 CSS/JS 查询版本与字体 `BUILD_ID` 同步；`node tests/action-bubble-demo.test.js` 验证八区 24 个怪物选项的注册表覆盖、区域/单位选择同步，以及三种行走朝向、纵向接敌、双边缘翻转、血条零重叠、视口约束和中英文控件；`node tests/browser-smoke.js` 保留整站集成覆盖。
