# 图形与动效渲染 Lab

入口：`render-gallery.html?region=forest&lang=zh-CN`。页面只读加载生产资产注册表、内容 Bundle、视觉原语和统一绘制器，不启动正式世界、不生成地图、不读写存档。

## 验证范围

- 自动枚举生产资产及区域、探索、战斗、环境、头像、UI、小地图引用，并按 `unit / decor-* / terrain / effects / ui / other` 分类过滤。
- 资产来源由 `Game.assets.catalog()`、区域注册表、`Game.contentSchemas.definitionTypes`、`Game.fx` 可视函数、Particles、Map Icons 和 Action Bubbles 组成；动作状态与 D/U/L/R 是稳定语义合同，不是逐资产硬编码清单。
- 单位动作使用 `Game.assets.resolveMotion()`：优先原生动作帧，缺失时显示整数像素派生或稳定回退；动作覆盖矩阵固定检查 `idle / move / attack / cast / hurt / defeat × D/U/L/R`。
- 资产卡片和检查器按独立预览时钟持续重绘：有原生多帧时循环切帧，单帧动作按正式渲染语义补充微位移；树木、草簇、浮空晶体、灯火等沿用生产的 `sway / bob / flicker / glow` 字段；“暂停”和“减少动态”分别用于冻结预览与关闭派生动效。
- 选中资产后，主区域的独立预览窗口提供循环画布、重置时间和新窗口弹出；弹出窗口与当前动作、朝向、暂停和减少动态状态保持同步，不依赖主题地图。
- FX、Particles 和 Action Bubbles 使用生产绘制器的隔离预览适配；适配项明确标记为 `production` 或 `adapted`，未知原语才显示目录占位，不把演示占位误报为原版效果。
- 区域选择只过滤当前目录中的区域引用，不生成或挂载主题地图；分类标签由 `snapshot.counts` 实时生成，动画只重绘 IntersectionObserver 观察到的可见卡片，预览约 12.5 FPS。
- 资产检查器报告尺寸、锚点、来源引用、帧列表、动作覆盖和缺图问题；页面不复制生产精灵或平行绘制实现。

## QA 接口

`window.RenderGalleryLab` 暴露 `snapshot()`、`select(key)`、`refresh()`、`setReducedMotion(value)` 和 `metrics()`。`snapshot().issues` 用于检查缺图、占位精灵和未覆盖单位动作；页面支持 `file://` 直开；若浏览器策略阻止本地文件，可使用任意静态服务器提供同一目录。
