/* Directional faction/team/actor relation resolution. */
(function () {
  'use strict';
  var Game = window.Game;
  var overrides = {};
  var nextOverride = 1;

  function actor(id) {
    return Game.actors && Game.actors.get(id);
  }

  function factionRelation(source, target) {
    if (!source || !target) return 'neutral';
    if (source === target) return 'ally';
    var def = Game.content.get('faction', source);
    return def && def.relations && def.relations[target] || 'neutral';
  }

  Game.relations = {
    resolve: function (sourceId, targetId, encounterId) {
      if (sourceId === targetId) return 'self';
      var source = actor(sourceId);
      var target = actor(targetId);
      if (!source || !target) return 'neutral';

      var actorKey = ['actor', encounterId || '-', sourceId, targetId].join('|');
      if (overrides[actorKey]) return overrides[actorKey].relation;
      if (encounterId) {
        var teamKey = ['team', encounterId, source.teamId || '-', target.teamId || '-'].join('|');
        if (overrides[teamKey]) return overrides[teamKey].relation;
        if (source.teamId && target.teamId) {
          if (source.teamId === target.teamId) return 'ally';
          var encounter = Game.encounters && Game.encounters.get(encounterId);
          if (encounter && encounter.teams[source.teamId] && encounter.teams[target.teamId]) {
            return 'hostile';
          }
        }
      }
      return factionRelation(source.factionId, target.factionId);
    },

    setOverride: function (scope, sourceId, targetId, relation, options) {
      options = options || {};
      if (Game.contentSchemas.relations.indexOf(relation) < 0 || relation === 'self') {
        throw new Error('[Relations] invalid override: ' + relation);
      }
      var encounterId = options.encounterId || '-';
      var key = [scope, encounterId, sourceId, targetId].join('|');
      var id = 'relation-' + nextOverride++;
      overrides[key] = {
        id: id, key: key, scope: scope, encounterId: encounterId,
        sourceId: sourceId, targetId: targetId, relation: relation
      };
      if (options.symmetric) {
        var reverse = [scope, encounterId, targetId, sourceId].join('|');
        overrides[reverse] = {
          id: id + '-reverse', key: reverse, scope: scope, encounterId: encounterId,
          sourceId: targetId, targetId: sourceId, relation: relation
        };
      }
      return id;
    },

    clearOverride: function (overrideId) {
      var removed = false;
      Object.keys(overrides).forEach(function (key) {
        if (overrides[key].id === overrideId || overrides[key].id === overrideId + '-reverse') {
          delete overrides[key];
          removed = true;
        }
      });
      return removed;
    },

    clearEncounter: function (encounterId) {
      Object.keys(overrides).forEach(function (key) {
        if (overrides[key].encounterId === encounterId) delete overrides[key];
      });
    },

    snapshot: function () {
      return Object.keys(overrides).sort().map(function (key) {
        return Object.assign({}, overrides[key]);
      });
    }
  };
})();
