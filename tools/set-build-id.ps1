[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')]
    [string]$BuildId
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$indexPath = Join-Path $projectRoot 'index.html'
$utilsPath = Join-Path $projectRoot 'js\core\utils.js'
$versionPath = Join-Path $projectRoot 'version.json'

$index = [IO.File]::ReadAllText($indexPath)
$match = [regex]::Match($index, '<meta name="build-id" content="([^"]+)">')
if (-not $match.Success) {
    throw 'index.html 缺少 build-id meta。'
}
$currentBuild = $match.Groups[1].Value

$candidateExtensions = @('.html', '.css', '.js', '.json')
$files = Get-ChildItem -LiteralPath $projectRoot -Recurse -File |
    Where-Object {
        $candidateExtensions -contains $_.Extension.ToLowerInvariant() -and
        $_.FullName -notmatch '[\\/](?:\.git|node_modules)[\\/]'
    } |
    ForEach-Object { $_.FullName }
$contents = @{}
foreach ($path in $files) {
    $contents[$path] = [IO.File]::ReadAllText($path)
}

$demoHtml = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'tech-demos') -Recurse -Filter '*.html' -File
foreach ($demo in $demoHtml) {
    if ($contents[$demo.FullName] -notmatch [regex]::Escape("content=`"$currentBuild`"")) {
        throw "技术演示页 build-id 与 index.html 不一致：$($demo.FullName)"
    }
}
if ($contents[$utilsPath] -notmatch [regex]::Escape("Game.BUILD_ID = '$currentBuild'")) {
    throw 'Game.BUILD_ID 与 index.html 不一致。'
}
if ($contents[$versionPath] -notmatch [regex]::Escape("`"buildId`": `"$currentBuild`"")) {
    throw 'version.json 与 index.html 不一致。'
}

foreach ($path in @($files)) {
    if (-not $contents[$path].Contains($currentBuild)) {
        $contents.Remove($path)
        $files = @($files | Where-Object { $_ -ne $path })
        continue
    }
    $updated = $contents[$path].Replace($currentBuild, $BuildId)
    $contents[$path] = $updated
}

if ($PSCmdlet.ShouldProcess(($files -join ', '), "BUILD_ID $currentBuild -> $BuildId")) {
    $utf8 = [Text.UTF8Encoding]::new($false)
    foreach ($path in $files) {
        [IO.File]::WriteAllText($path, $contents[$path], $utf8)
    }
}

Write-Output "BUILD_ID: $currentBuild -> $BuildId"
