(function () {
  'use strict';
  var Game = window.Game;
  var self = { relation: 'self', shape: 'single' };
  var enemy = { relation: 'hostile', shape: 'single', range: 86 };
  function dmg(c, type) {
    return { type: 'damage', damageTypeId: type || 'arcane', formulaId: 'core.damage.power-coefficient-v1', params: { powerStat: 'magicPower', coefficient: c } };
  }
  Game.content.registerPack({
    id: 'job.mage', version: '2.0.0', schemaVersion: 1,
    sourceFile: 'js/data/packs/jobs/mage.pack.js',
    requires: [{ id: 'core.combat', range: '^2.0.0' }],
    definitions: {
      statProfile: [{ id: 'stats.mage', schemaVersion: 1, stats: {} }],
      status: [{
        id: 'mage.arcane_barrier', stacking: 'refresh', durationTicks: 140,
        modifiers: [{ stat: 'ward', phase: 'status', operation: 'multiply', value: 1.25 }],
        presentation: { nameKey: 'combat.status.mage_barrier.name', icon: 'icon_skill_guard' }
      }],
      ability: [
        {
          id: 'mage.auto_attack', kind: 'action', actionType: 'auto',
          timing: { castTicks: 12, animationLockTicks: 8, cooldownTicks: 52, queueable: false, interruptible: true },
          target: enemy, effects: [dmg(0.64)], aiHints: { priority: 1 },
          presentation: { nameKey: 'combat.ability.mage_auto.name', icon: 'icon_skill_fire', projectile: 'bolt' }
        },
        {
          id: 'mage.arcane_bolt', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 18, animationLockTicks: 10, cooldownTicks: 0, queueable: true, interruptible: true },
          costs: [{ resourceId: 'mana', amount: 280 }], target: enemy,
          effects: [dmg(1.08), { type: 'modifyResource', resourceId: 'arcaneCharges', amount: 1, target: self }],
          aiHints: { priority: 24 }, presentation: { nameKey: 'combat.ability.mage_bolt.name', icon: 'icon_skill_fire', projectile: 'bolt' }
        },
        {
          id: 'mage.fireball', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 30, animationLockTicks: 12, cooldownTicks: 120, queueable: true, interruptible: true },
          costs: [{ resourceId: 'mana', amount: 720 }], target: enemy,
          telegraph: { shape: 'single', radius: 18, expectedDamagePct: 0.16 },
          effects: [dmg(2.35, 'fire'), { type: 'modifyResource', resourceId: 'arcaneCharges', amount: 1, target: self }],
          aiHints: { priority: 68 }, presentation: { nameKey: 'combat.ability.mage_fireball.name', icon: 'icon_skill_fire', projectile: 'fire' }
        },
        {
          id: 'mage.arcane_nova', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 24, animationLockTicks: 14, cooldownTicks: 180, queueable: true, interruptible: true },
          costs: [{ resourceId: 'mana', amount: 900 }],
          target: { relation: 'hostile', shape: 'circle', range: 88, radius: 70, maxTargets: 8 },
          telegraph: { shape: 'circle', radius: 70, expectedDamagePct: 0.14 },
          effects: [dmg(1.58, 'arcane')], aiHints: { priority: 86, minTargets: 2 },
          presentation: { nameKey: 'combat.ability.mage_nova.name', icon: 'icon_skill_whirl' }
        },
        {
          id: 'mage.arcane_barrage', kind: 'action', actionType: 'gcd',
          timing: { castTicks: 10, animationLockTicks: 12, cooldownTicks: 80, queueable: true, interruptible: true },
          costs: [{ resourceId: 'arcaneCharges', amount: 4 }], target: enemy,
          effects: [dmg(3.05, 'arcane')], aiHints: { priority: 98, resourceDump: 'arcaneCharges', resourceAt: 4 },
          presentation: { nameKey: 'combat.ability.mage_barrage.name', icon: 'icon_skill_fire', projectile: 'bolt' }
        },
        {
          id: 'mage.barrier_action', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 9, cooldownTicks: 360, queueable: false },
          target: self, effects: [
            { type: 'shield', coefficient: 0.24, durationTicks: 140, target: self },
            { type: 'applyStatus', statusId: 'mage.arcane_barrier', target: self }
          ],
          aiHints: { priority: 170, role: 'defensive' },
          presentation: { nameKey: 'combat.ability.mage_barrier.name', icon: 'icon_skill_guard' }
        },
        {
          id: 'mage.mana_font', kind: 'action', actionType: 'ogcd',
          timing: { castTicks: 0, animationLockTicks: 9, cooldownTicks: 500, queueable: false },
          target: self, effects: [{ type: 'modifyResource', resourceId: 'mana', amount: 2600, target: self }],
          aiHints: { priority: 72, resourceDump: 'mana', resourceAt: 0 },
          presentation: { nameKey: 'combat.ability.mage_mana.name', icon: 'icon_skill_swift' }
        }
      ],
      trait: [{
        id: 'mage.arcane_mastery', kind: 'passive',
        modifiers: [{ stat: 'magicPower', phase: 'multiply', operation: 'multiply', value: 1.08 }],
        triggers: [], presentation: { nameKey: 'combat.trait.mage_mastery.name', icon: 'icon_skill_fire' }
      }],
      class: [{
        id: 'mage', roles: ['ranged-dps'], tags: ['ranged', 'magic'],
        statProfileId: 'stats.mage', resourceProfileIds: ['resources.mage'],
        baseAbilityGrantIds: ['mage.auto_attack', 'mage.arcane_bolt', 'mage.fireball', 'mage.arcane_nova', 'mage.arcane_barrage', 'mage.barrier_action', 'mage.mana_font'],
        traitIds: ['mage.arcane_mastery'], talentTreeId: 'talents.mage',
        equipmentProfileId: 'equipment.adventurer', aiProfileId: 'ai.player.standard',
        tacticsProfileIds: ['balanced', 'safe', 'aggressive'], evaluationProfileId: 'evaluation.mage',
        presentation: {
          nameKey: 'class.mage.name', spriteId: 'hero_mage', portraitId: 'face_mage'
        }
      }],
      talentTree: [{ id: 'talents.mage', schemaVersion: 1, talentIds: ['mg_fireball', 'mg_mastery', 'mg_nova', 'mg_surge', 'mg_barrier', 'mg_armor'] }],
      talent: [
        {
          id: 'mg_fireball', classId: 'mage', unlockLevel: 1, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'mage.fireball', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 2.6, perRank: 0.18 }
          ] },
          presentation: { nameKey: 'skill.mg_fireball.name', descKey: 'skill.mg_fireball.desc' }
        },
        { id: 'mg_mastery', classId: 'mage', unlockLevel: 2, maxRank: 10, costs: [1], grants: {}, modifiers: [{ stat: 'magicPower', phase: 'addPct', operation: 'addPct', perRank: 0.06 }], presentation: { nameKey: 'skill.mg_mastery.name', descKey: 'skill.mg_mastery.desc' } },
        {
          id: 'mg_nova', classId: 'mage', unlockLevel: 3, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'mage.arcane_nova', patches: [
            { path: 'effects.0.params.coefficient', baseValue: 1.6, perRank: 0.1 }
          ] },
          presentation: { nameKey: 'skill.mg_nova.name', descKey: 'skill.mg_nova.desc' }
        },
        { id: 'mg_surge', classId: 'mage', unlockLevel: 4, maxRank: 10, costs: [1], grants: {}, modifiers: [{ stat: 'cooldownRate', phase: 'otherFlat', operation: 'add', perRank: 0.02 }], presentation: { nameKey: 'skill.mg_surge.name', descKey: 'skill.mg_surge.desc' } },
        {
          id: 'mg_barrier', classId: 'mage', unlockLevel: 5, maxRank: 10, costs: [1],
          grants: { modifyAbilityId: 'mage.barrier_action', patches: [
            { path: 'effects.0.coefficient', baseValue: 0.2, perRank: 0.02 }
          ] },
          presentation: { nameKey: 'skill.mg_barrier.name', descKey: 'skill.mg_barrier.desc' }
        },
        { id: 'mg_armor', classId: 'mage', unlockLevel: 6, maxRank: 10, costs: [1], grants: {}, modifiers: [
          { stat: 'maxHp', phase: 'addPct', operation: 'addPct', perRank: 0.04 },
          { stat: 'armor', phase: 'addPct', operation: 'addPct', perRank: 0.04 }
        ], presentation: { nameKey: 'skill.mg_armor.name', descKey: 'skill.mg_armor.desc' } }
      ]
    }
  });
})();
