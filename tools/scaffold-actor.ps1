param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9][a-z0-9._-]*$')][string]$PackId,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9][a-z0-9._-]*$')][string]$ActorId,
  [ValidateSet('player', 'monster', 'npc', 'summon', 'object')][string]$Category = 'monster',
  [string]$OutputDirectory = 'js/data/packs/generated'
)

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace 'js/data/packs'))
if (-not $targetRoot.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputDirectory must stay inside js/data/packs"
}
New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
$target = Join-Path $targetRoot ($ActorId.Replace('.', '-') + '.js')
if (Test-Path -LiteralPath $target) { throw "Target already exists: $target" }

$template = @"
(function () {
  'use strict';
  var Game = window.Game;
  Game.content.registerPack({
    id: '$PackId', version: '1.0.0', schemaVersion: 1,
    sourceFile: '$($target.Substring($workspace.Length + 1).Replace('\', '/'))',
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    definitions: {
      actorArchetype: [{
        id: '$ActorId', category: '$Category', rank: 'normal',
        identity: {
          nameKey: 'actor.$ActorId.name',
          descKey: 'actor.$ActorId.desc',
          loreKey: 'actor.$ActorId.lore'
        },
        presentation: { spriteId: 'TODO', renderProfileId: 'render.actor.standard' },
        body: { size: 'medium', collisionRadius: 8, movementTypes: ['ground'] },
        defaultFactionId: 'adventurers',
        abilityGrantIds: [], traitIds: []
      }]
    }
  });
})();
"@
[System.IO.File]::WriteAllText($target, $template, [System.Text.UTF8Encoding]::new($false))
Write-Output $target
