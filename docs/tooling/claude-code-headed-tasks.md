# Claude Code 有头任务

本文用于把边界明确的本地开发任务快速交给 Claude Code CLI。默认使用可见的交互式终端，便于用户观察进度、处理异常和继续追问。默认情况下，你（主 AGENT）无需持续追踪，提示用户启动状态即可。

## 推荐入口

在仓库目录打开 PowerShell 或 Windows Terminal。任务明确、仓库可信且提示中已经写清禁止事项时，直接使用 `bypassPermissions`模式：

```powershell
Set-Location -LiteralPath 'C:\Users\admin\Desktop\HBC Web\fantasy-idle-rpg'

$prompt = Get-Content -Raw -LiteralPath 'C:\path\to\task.md' -Encoding UTF8
claude `
  --name 'short-task-name' `
  --permission-mode bypassPermissions `
  --effort max `
  --no-chrome `
  $prompt
```

不使用 `-p/--print`、`--bg/--background` 或输出重定向，即为有头交互模式。只有任务需要浏览器集成时才移除 `--no-chrome`。

## 任务说明文件

长任务建议不要把整段提示拼进 `Start-Process` 参数或多层引号。先写入 UTF-8 Markdown，再由启动终端使用 `Get-Content -Raw` 作为单个 prompt 参数传给 Claude Code。任务文件至少包含：

1. 工作目录，以及必须先读的 `AGENTS.md`、规划和领域文档。
2. 已确认的目标行为、根因和明确的非目标。
3. 允许修改的子系统与必须保留的兼容合同。
4. 测试、构建、`BUILD_ID` 和技术演示要求。
5. 是否允许提交、推送、PR、部署或其他外部副作用。
6. 完成时需要汇报的修改文件、测试结果、风险和 `git status`。

任务提示应要求直接实施和验证，避免 Claude Code 再次只输出规划。

## 自动打开独立可见窗口

需要从自动化环境创建单独的 PowerShell 7 有头窗口时，使用短启动脚本读取任务文件。PowerShell 7 的可执行文件名是 `pwsh.exe`；`-EncodedCommand` 使用 UTF-16LE，可避免路径、中文和换行的多层转义问题：

```powershell
$repo = 'C:\Users\admin\Desktop\HBC Web\fantasy-idle-rpg'
$taskFile = 'C:\path\to\task.md'

$launcher = @"
`$Host.UI.RawUI.WindowTitle = 'Claude Code - short-task-name'
Set-Location -LiteralPath '$repo'
`$prompt = Get-Content -Raw -LiteralPath '$taskFile' -Encoding UTF8
claude --name 'short-task-name' --permission-mode bypassPermissions --effort max --no-chrome `$prompt
"@

$encoded = [Convert]::ToBase64String(
  [Text.Encoding]::Unicode.GetBytes($launcher)
)

Start-Process pwsh.exe `
  -WindowStyle Normal `
  -ArgumentList '-NoLogo', '-NoExit', '-EncodedCommand', $encoded
```

启动后应确认进程树中存在 `claude.exe`，而不只是空的 PowerShell/conhost 窗口。确认 Claude 已读取 prompt 后可删除仓库外的临时任务文件。
