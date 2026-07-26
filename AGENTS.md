# 项目信息备注与约束

- 本项目为一个 2D 网页挂机 RPG 游戏 "fantasy-idle-rpg" （日式中世纪奇幻风）
- 主要的开发与规划文档 `PLAN/fantasy-idle-rpg-plan.md` ，你在进行任何构建动作前，应该要至少了解它。
- 本项目通过 `C:\Users\admin\Desktop\VPS\yanshanlaosiji_ssh_root.ps1` 部署到我的VPS的 `/www/wwwroot/yanshanlaosiji.top/fantasy-idle-rpg` ，可通过 https://yanshanlaosiji.top/fantasy-idle-rpg 访问，我默认用这个方式游玩和发布。
- 充分实现 i18n 机制，目前先仅确保中英文。
- 更新和维护 `README.md` 文档和 [主规划文档](PLAN\fantasy-idle-rpg-plan.md) 时，建议保持 **精简、高信息熵**、不要用 emoji 表情。
- 每次发布会改变任一 HTML/CSS/JS/字体时，必须先用 `tools/set-build-id.ps1` 统一提升 `BUILD_ID`，并运行 `node tests/cache-version.test.js`；禁止只更新单个资源的查询版本或复用已发布的 `BUILD_ID`。
- 线上缓存策略必须保持：HTML `no-cache, must-revalidate`、`version.json` `no-store`、带 `BUILD_ID` 的 CSS/JS/字体 `max-age=31536000, immutable`。VPS 配置以 `deploy/nginx/fantasy-idle-rpg-cache.conf` 为准，变更后先 `nginx -t` 再 reload。
