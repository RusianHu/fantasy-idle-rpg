[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')]
    [string]$BuildId
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$indexPath = Join-Path $projectRoot 'index.html'
$demoPath = Join-Path $projectRoot 'tech-demos\map-effects\map-effects.html'
$stylePath = Join-Path $projectRoot 'css\style.css'
$utilsPath = Join-Path $projectRoot 'js\core\utils.js'
$versionPath = Join-Path $projectRoot 'version.json'

$index = [IO.File]::ReadAllText($indexPath)
$match = [regex]::Match($index, '<meta name="build-id" content="([^"]+)">')
if (-not $match.Success) {
    throw 'index.html 缺少 build-id meta。'
}
$currentBuild = $match.Groups[1].Value

$files = @($indexPath, $demoPath, $stylePath, $utilsPath, $versionPath)
$contents = @{}
foreach ($path in $files) {
    $contents[$path] = [IO.File]::ReadAllText($path)
}

if ($contents[$demoPath] -notmatch [regex]::Escape("content=`"$currentBuild`"")) {
    throw '技术演示页 build-id 与 index.html 不一致。'
}
if ($contents[$utilsPath] -notmatch [regex]::Escape("Game.BUILD_ID = '$currentBuild'")) {
    throw 'Game.BUILD_ID 与 index.html 不一致。'
}
if ($contents[$versionPath] -notmatch [regex]::Escape("`"buildId`": `"$currentBuild`"")) {
    throw 'version.json 与 index.html 不一致。'
}

foreach ($path in $files) {
    $updated = $contents[$path].Replace($currentBuild, $BuildId)
    if ($updated -eq $contents[$path] -and $currentBuild -ne $BuildId) {
        throw "未在 $path 中找到当前 BUILD_ID。"
    }
    $contents[$path] = $updated
}

if ($PSCmdlet.ShouldProcess(($files -join ', '), "BUILD_ID $currentBuild -> $BuildId")) {
    $utf8 = [Text.UTF8Encoding]::new($false)
    foreach ($path in $files) {
        [IO.File]::WriteAllText($path, $contents[$path], $utf8)
    }
}

Write-Output "BUILD_ID: $currentBuild -> $BuildId"
