/* Persistent ActorRecord facade over the v12+ roster state. */
(function () {
  'use strict';
  var Game = window.Game;

  function rosterState() {
    if (!Game.state) throw new Error('[Roster] state is not ready');
    if (!Game.state.roster) {
      Game.state.roster = { primaryActorId: 'player-main', activeParty: ['player-main'], actors: {} };
    }
    return Game.state.roster;
  }

  function validateRecord(spec) {
    if (!spec || !spec.id || !spec.archetypeId) throw new Error('[Roster] id and archetypeId required');
    var stableId = Game.contentSchemas && Game.contentSchemas.stableId ||
      /^[a-z][A-Za-z0-9_.:-]*$/;
    if (!stableId.test(spec.id)) {
      throw new Error('[Roster] invalid record id: ' + spec.id);
    }
    if (!Game.content.has('actorArchetype', spec.archetypeId)) {
      throw new Error('[Roster] unknown archetype: ' + spec.archetypeId);
    }
    if (spec.variantId) {
      var variant = Game.content.get('actorVariant', spec.variantId);
      if (!variant || variant.archetypeId !== spec.archetypeId) {
        throw new Error('[Roster] invalid variant: ' + spec.variantId);
      }
    }
    if (spec.classId && !Game.content.has('class', spec.classId)) {
      throw new Error('[Roster] unknown class: ' + spec.classId);
    }
    Object.keys(spec.talentRanks || {}).forEach(function (talentId) {
      var talent = Game.content.get('talent', talentId);
      var rank = spec.talentRanks[talentId];
      if (!talent || talent.classId !== spec.classId ||
          !Number.isInteger(rank) || rank < 0 || rank > talent.maxRank) {
        throw new Error('[Roster] invalid talent rank: ' + talentId);
      }
    });
    var hp = spec.persistentResources && spec.persistentResources.hp;
    if (hp !== undefined && (!Number.isFinite(hp) || hp < 0)) {
      throw new Error('[Roster] invalid persistent HP');
    }
  }

  Game.roster = {
    createRecord: function (spec) {
      validateRecord(spec);
      var roster = rosterState();
      if (roster.actors[spec.id]) throw new Error('[Roster] duplicate record: ' + spec.id);
      var record = {
        id: spec.id,
        archetypeId: spec.archetypeId,
        variantId: spec.variantId || null,
        classId: spec.classId || null,
        level: Math.max(1, spec.level | 0 || 1),
        exp: Math.max(0, Number(spec.exp) || 0),
        skillPoints: Math.max(0, spec.skillPoints | 0),
        talentRanks: Object.assign({}, spec.talentRanks || {}),
        permanentUpgrades: Object.assign({}, spec.permanentUpgrades || {}),
        persistentResources: Object.assign({}, spec.persistentResources || {}),
        loadout: {
          equipment: Object.assign({ weapon: null, head: null, body: null, feet: null, accessory: null },
            spec.loadout && spec.loadout.equipment || {}),
          lockedSlots: Object.assign({ weapon: false, armor: false, ring: false },
            spec.loadout && spec.loadout.lockedSlots || {})
        }
      };
      roster.actors[record.id] = record;
      return record;
    },

    getRecord: function (id) { return rosterState().actors[id] || null; },
    primaryActor: function () {
      var roster = rosterState();
      return roster.actors[roster.primaryActorId] || null;
    },
    activeParty: function () {
      var roster = rosterState();
      return (roster.activeParty || []).map(function (id) { return roster.actors[id]; }).filter(Boolean);
    },
    removeRecord: function (id, reason) {
      var roster = rosterState();
      if (id === roster.primaryActorId) return false;
      if ((roster.activeParty || []).indexOf(id) >= 0) return false;
      if (Game.actors && Game.actors.query({ actorRecordId: id }).length) return false;
      if (!roster.actors[id]) return false;
      delete roster.actors[id];
      if (Game.bus) Game.bus.emit('roster:removed', { actorRecordId: id, reason: reason || 'removed' });
      return true;
    }
  };
})();
