/* Party is a cooperation container; relation and encounter team remain separate. */
(function () {
  'use strict';
  var Game = window.Game;
  var parties = {};

  Game.parties = {
    create: function (spec) {
      spec = spec || {};
      if (!spec.id) throw new Error('[Parties] id required');
      if (parties[spec.id]) throw new Error('[Parties] duplicate: ' + spec.id);
      parties[spec.id] = { id: spec.id, maxMembers: spec.maxMembers || 4, members: [] };
      return parties[spec.id];
    },
    get: function (id) { return parties[id] || null; },
    addMember: function (partyId, actorId) {
      var party = parties[partyId];
      var actor = Game.actors.get(actorId);
      if (!party || !actor) return false;
      if (party.members.indexOf(actorId) >= 0) return true;
      if (party.members.length >= party.maxMembers) return false;
      if (actor.partyId && actor.partyId !== partyId) Game.parties.removeMember(actor.partyId, actorId);
      party.members.push(actorId);
      actor.partyId = partyId;
      return true;
    },
    removeMember: function (partyId, actorId) {
      var party = parties[partyId];
      if (!party) return false;
      var at = party.members.indexOf(actorId);
      if (at < 0) return false;
      party.members.splice(at, 1);
      var actor = Game.actors.get(actorId);
      if (actor && actor.partyId === partyId) actor.partyId = null;
      return true;
    },
    members: function (partyId) {
      var party = parties[partyId];
      return party ? party.members.slice() : [];
    },
    reset: function () { parties = {}; }
  };
})();
