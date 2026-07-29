param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9._-]*$')]
  [string]$PackId,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9._-]*$')]
  [string]$ActorId,

  [ValidateSet('monster', 'boss', 'npc', 'peaceful-creature', 'combat-npc', 'summon')]
  [string]$Category = 'monster',

  [ValidatePattern('^[a-z][a-z0-9._-]*$')]
  [string]$PopulationId = 'population.grassland',

  [ValidatePattern('^[a-z][a-z0-9._-]*$')]
  [string]$RegionPackId = 'region.grassland',

  [string]$OutputDirectory = 'js/data/packs/generated',

  [switch]$SkipBuild
)

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace 'js/data/packs'))
$allowedPrefix = $allowedRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) +
  [System.IO.Path]::DirectorySeparatorChar
if ($targetRoot -ne $allowedRoot -and
    -not $targetRoot.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputDirectory must stay inside js/data/packs"
}

New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
$target = Join-Path $targetRoot ($ActorId.Replace('.', '-') + '.pack.js')
if (Test-Path -LiteralPath $target) { throw "Target already exists: $target" }

$sourceFile = $target.Substring($workspace.Length + 1).Replace('\', '/')
$isCombat = $Category -in @('monster', 'boss', 'combat-npc', 'summon')
$isMounted = $Category -ne 'summon'
$isNeutralCombat = $Category -eq 'combat-npc'
$isNpc = $Category -in @('npc', 'peaceful-creature', 'combat-npc')
$actorCategory = if ($Category -in @('monster', 'boss')) { 'monster' } elseif ($Category -eq 'summon') { 'summon' } else { 'npc' }
$rank = if ($Category -eq 'boss') { 'boss' } else { 'normal' }
$factionId = if ($Category -in @('monster', 'boss')) { 'wild' } elseif ($Category -eq 'summon') { 'adventurers' } else { 'wildlife' }
$renderProfileId = if ($isNpc) { 'render.actor.npc' } else { 'render.actor.standard' }
$bodySize = if ($Category -eq 'boss') { 'large' } else { 'medium' }
$collisionRadius = if ($Category -eq 'boss') { 14 } else { 8 }
$scale = if ($Category -eq 'boss') { 1.25 } else { 1 }
$channel = if ($Category -eq 'monster') { 'regular' } elseif ($Category -eq 'boss') { 'rare' } else { 'npc' }

$interactionActions = if ($isNeutralCombat) {
  "[{ id: 'inspect', kind: 'inspect', primary: true }, { id: 'attack', kind: 'attack', requiresConfirmation: true }]"
} elseif ($Category -eq 'npc') {
  "[{ id: 'talk', kind: 'talk', primary: true }]"
} elseif ($Category -eq 'peaceful-creature') {
  "[{ id: 'inspect', kind: 'inspect', primary: true }]"
} else {
  "[{ id: 'attack', kind: 'attack', primary: true }]"
}

if ($isNeutralCombat) {
  $manualAttack = 'true'
  $autoAggro = 'false'
  $groupPropagation = 'socialGroup'
  $rewardEligible = 'false'
  $memorySeconds = 180
} elseif ($isCombat) {
  $manualAttack = 'true'
  $autoAggro = 'true'
  $groupPropagation = 'socialGroup'
  $rewardEligible = 'true'
  $memorySeconds = 180
} else {
  $manualAttack = 'false'
  $autoAggro = 'false'
  $groupPropagation = 'none'
  $rewardEligible = 'false'
  $memorySeconds = 0
}

$requires = if ($isMounted) {
  "[{ id: 'core.combat', range: '^2.0.0' }, { id: '$RegionPackId', range: '^2.0.0' }]"
} else {
  "[{ id: 'core.combat', range: '^2.0.0' }]"
}

$localeAbilityZh = if ($isCombat) {
  ",`n        'combat.ability.$ActorId.basic.name': '基础攻击'"
} else { '' }
$localeAbilityEn = if ($isCombat) {
  ",`n        'combat.ability.$ActorId.basic.name': 'Basic Attack'"
} else { '' }

$combatDefinitions = if ($isCombat) {
@"
      statProfile: [{
        id: 'stats.$ActorId',
        stats: {
          maxHp: 48, armor: 4, ward: 2, physicalPower: 8, magicPower: 0,
          accuracy: 0.9, gcdSpeed: 1, castSpeed: 1, autoAttackSpeed: 1,
          cooldownRate: 1, moveSpeed: 42, range: 22, critChance: 0.03,
          critMultiplier: 1.5, dodgeChance: 0.02, healingPower: 0,
          shieldPower: 48, lifesteal: 0, statusPotency: 1, tenacity: 0.05,
          interruptPower: 1, threatMultiplier: 1, resourceRegen: 1,
          expMultiplier: 1, goldMultiplier: 1, dropMultiplier: 1
        }
      }],
      ability: [{
        id: '$ActorId.basic', kind: 'action', actionType: 'gcd',
        timing: { castTicks: 0, animationLockTicks: 8, cooldownTicks: 0, queueable: true },
        target: { relation: 'hostile', shape: 'single', range: 22 },
        effects: [{
          type: 'damage', damageTypeId: 'slashing',
          formulaId: 'core.damage.power-coefficient-v1',
          params: { powerStat: 'physicalPower', coefficient: 0.7 }
        }],
        aiHints: { priority: 20 },
        presentation: {
          nameKey: 'combat.ability.$ActorId.basic.name',
          icon: 'icon_skill_strike'
        }
      }],
"@
} else { '' }

$actorCombatFields = if ($isCombat -and -not $isNeutralCombat) {
@"
        statProfileId: 'stats.$ActorId',
        abilityGrantIds: ['$ActorId.basic'], traitIds: [],
        resistanceProfileId: 'resist.standard',
        aiProfileId: 'ai.monster.standard', rewardProfileId: 'reward.none',
"@
} else {
  "        abilityGrantIds: [], traitIds: [],"
}

$variantDefinitions = if ($isNeutralCombat) {
@"
      actorVariant: [{
        id: '$ActorId.armed', archetypeId: '$ActorId',
        overrides: {
          statProfileId: 'stats.$ActorId',
          abilityGrantIds: ['$ActorId.basic'], traitIds: [],
          resistanceProfileId: 'resist.standard',
          aiProfileId: 'ai.monster.standard', rewardProfileId: 'reward.none',
          presentation: {
            spriteId: 'actor_placeholder', portraitId: 'actor_placeholder',
            scale: 1, renderProfileId: 'render.actor.standard'
          },
          interactionProfileId: 'interaction.$ActorId',
          engagementPolicyId: 'engagement.$ActorId',
          tags: ['scaffold', 'combat-npc', 'armed']
        },
        transitions: [{
          from: null, to: '$ActorId.armed', triggerId: 'provoked',
          timing: 'outOfEncounter', activeAction: 'defer', persistence: 'none'
        }]
      }],
"@
} else { '' }

$encounterDefinitions = if ($isCombat) {
  $variantMember = if ($isNeutralCombat) { ", variantId: '$ActorId.armed'" } else { '' }
  $rewardBudget = if ($Category -eq 'boss') { 4 } elseif ($Category -eq 'summon') { 0 } else { 1 }
@"
      encounterPack: [{
        id: 'encounter-pack.$ActorId',
        members: [{ slotId: 'actor', archetypeId: '$ActorId'$variantMember }],
        formation: { spacing: 0 }, leashRadius: 120,
        rewardBudget: $rewardBudget, groupAlert: true
      }],
"@
} else { '' }

if ($Category -eq 'summon') {
  $worldSpawnDefinition = @"
      worldSpawnProfile: [{
        id: 'spawn.$ActorId', encounterPackId: 'encounter-pack.$ActorId',
        mountTo: [], summonOnly: true,
        identity: { scope: 'ephemeral' },
        placement: {
          selector: 'anchor', source: 'summoner',
          required: true, onFailure: 'abortGroup'
        },
        lifecycle: {
          activation: 'scripted', unload: 'despawn',
          onDefeat: 'closeLease', onEscape: 'closeLease',
          respawn: { mode: 'none', resetVariant: true }
        },
        offlineEligible: false
      }]
"@
} else {
  $spawnReference = if ($Category -in @('monster', 'boss')) {
    "encounterPackId: 'encounter-pack.$ActorId'"
  } else {
    "actorRef: { archetypeId: '$ActorId' }"
  }
  $provokedFields = if ($isNeutralCombat) {
@"
        onProvokedVariantId: '$ActorId.armed',
        encounterPackIdOnProvoked: 'encounter-pack.$ActorId',
"@
  } else { '' }
  $socialIdentity = if ($isNpc) { ", socialGroupId: 'social.$ActorId'" } else { '' }
  $respawnMode = if ($Category -in @('npc', 'peaceful-creature')) { 'none' } else { 'delay' }
  $respawnDelay = if ($respawnMode -eq 'delay') { ', delay: 30' } else { '' }
  $worldSpawnDefinition = @"
      worldSpawnProfile: [{
        id: 'spawn.$ActorId', $spawnReference,
$provokedFields        mountTo: [{
          populationId: '$PopulationId', channel: '$channel',
          mode: 'weighted', weight: 1, maxCount: 1
        }],
        identity: { scope: 'regionStable'$socialIdentity },
        placement: {
          selector: 'candidate', source: 'spawnCandidates',
          required: false, onFailure: 'skipOptional',
          minCampDistance: 96, occupancyRadius: $collisionRadius
        },
        lifecycle: {
          activation: 'regionActive', unload: 'despawn',
          onDefeat: 'closeLease', onEscape: 'closeLease',
          respawn: { mode: '$respawnMode'$respawnDelay, resetVariant: true }
        },
        offlineEligible: false
      }]
"@
}

$template = @"
(function () {
  'use strict';
  var Game = window.Game;
  Game.content.registerPack({
    id: '$PackId', version: '1.0.0', schemaVersion: 1,
    sourceFile: '$sourceFile',
    requires: $requires,
    locales: {
      'zh-CN': {
        'actor.$ActorId.name': '待命单位',
        'actor.$ActorId.desc': '由内容脚手架创建，请替换名称、描述与数值。',
        'actor.$ActorId.lore': '这是一个可编译的作者占位内容胶囊。'$localeAbilityZh
      },
      en: {
        'actor.$ActorId.name': 'Staged Actor',
        'actor.$ActorId.desc': 'Created by the content scaffold; replace its name, description, and tuning.',
        'actor.$ActorId.lore': 'This is a compilable authoring placeholder capsule.'$localeAbilityEn
      }
    },
    definitions: {
      interactionProfile: [{
        id: 'interaction.$ActorId', actions: $interactionActions
      }],
      engagementPolicy: [{
        id: 'engagement.$ActorId',
        manualAttack: $manualAttack, autoAggro: $autoAggro,
        groupPropagation: '$groupPropagation',
        rewardEligible: $rewardEligible, memorySeconds: $memorySeconds
      }],
$combatDefinitions      actorArchetype: [{
        id: '$ActorId', category: '$actorCategory', rank: '$rank',
        identity: {
          nameKey: 'actor.$ActorId.name',
          descKey: 'actor.$ActorId.desc',
          loreKey: 'actor.$ActorId.lore'
        },
        presentation: {
          spriteId: 'actor_placeholder', portraitId: 'actor_placeholder',
          scale: $scale, renderProfileId: '$renderProfileId'
        },
        body: {
          size: '$bodySize', collisionRadius: $collisionRadius,
          movementTypes: ['ground']
        },
        tags: ['scaffold', '$Category'], defaultFactionId: '$factionId',
$actorCombatFields
        interactionProfileId: 'interaction.$ActorId',
        engagementPolicyId: 'engagement.$ActorId'
      }],
$variantDefinitions$encounterDefinitions$worldSpawnDefinition
    }
  });
})();
"@

[System.IO.File]::WriteAllText($target, $template, [System.Text.UTF8Encoding]::new($false))

if (-not $SkipBuild) {
  $builder = Join-Path $workspace 'tools/build-content-bundle.js'
  $node = (Get-Command node -ErrorAction Stop).Source
  try {
    & $node $builder | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Content bundle rebuild failed" }
    & $node $builder --check | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Content bundle check failed" }
  } catch {
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Force
      & $node $builder | Out-Null
    }
    throw
  }
}

Write-Output $target
