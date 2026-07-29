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

  function nowWorld() {
    return Game.state && Game.state.world ? Number(Game.state.world.worldTime) || 0 : 0;
  }

  function removeExpired(worldTime) {
    Object.keys(overrides).forEach(function (key) {
      var expiresAt = overrides[key].expiresAtWorldTime;
      if (expiresAt !== null && expiresAt !== undefined && expiresAt <= worldTime) {
        delete overrides[key];
      }
    });
    var social = Game.state && Game.state.world && Game.state.world.social;
    var memories = social && social.memories || {};
    ['spawnId', 'socialGroupId', 'factionId'].forEach(function (kind) {
      Object.keys(memories[kind] || {}).forEach(function (id) {
        var record = memories[kind][id];
        if (record && record.expiresAtWorldTime !== null &&
            record.expiresAtWorldTime !== undefined &&
            record.expiresAtWorldTime <= worldTime) delete memories[kind][id];
      });
    });
  }

  function clone(value) {
    return Game.contentCompiler ? Game.contentCompiler.clone(value) : Object.assign({}, value);
  }

  function putRecord(record) {
    if (!record || !record.key || !record.id) throw new Error('[Relations] invalid record');
    overrides[record.key] = clone(record);
    return record.id;
  }

  function preparedOverride(scope, sourceId, targetId, relation, options) {
    options = options || {};
    if (Game.contentSchemas.relations.indexOf(relation) < 0 || relation === 'self') {
      throw new Error('[Relations] invalid override: ' + relation);
    }
    var encounterId = options.encounterId || '-';
    var id = 'relation-' + nextOverride;
    var record = {
      id: id,
      key: [scope, encounterId, sourceId, targetId].join('|'),
      scope: scope, encounterId: encounterId,
      lifetimeScope: options.lifetimeScope || (options.encounterId ? 'encounter' : 'world'),
      ownerId: options.ownerId || options.encounterId || 'system',
      sourceId: sourceId, targetId: targetId,
      sourceKey: clone(options.sourceKey || null),
      targetKey: clone(options.targetKey || null),
      relation: relation,
      expiresAtWorldTime: options.expiresAtWorldTime === undefined
        ? null : Number(options.expiresAtWorldTime)
    };
    var records = [record];
    if (options.symmetric) records.push(Object.assign({}, record, {
      id: id + '-reverse',
      key: [scope, encounterId, targetId, sourceId].join('|'),
      sourceId: targetId, targetId: sourceId,
      sourceKey: clone(options.targetKey || null),
      targetKey: clone(options.sourceKey || null)
    }));
    return {
      expectedNextOverride: nextOverride,
      nextOverride: nextOverride + 1,
      records: records
    };
  }

  function preparedMemory(sourceId, targetId, relation, policy) {
    var source = actor(sourceId);
    var target = actor(targetId);
    if (!source || !target || Game.contentSchemas.relations.indexOf(relation) < 0) return [];
    policy = policy || {};
    var duration = Math.max(0, Number(policy.memorySeconds) || 0);
    if (!duration) return [];
    var record = {
      relation: relation, reputation: null,
      expiresAtWorldTime: nowWorld() + duration,
      profileId: target.worldSpawnProfileId || null,
      reason: policy.reason || 'engagement'
    };
    var writes = [];
    if (target.spawnId) writes.push({ kind: 'spawnId', id: target.spawnId, value: clone(record) });
    if (policy.groupPropagation === 'socialGroup' && target.socialGroupId) {
      writes.push({ kind: 'socialGroupId', id: target.socialGroupId, value: clone(record) });
    }
    if (policy.groupPropagation === 'faction' && target.factionId) {
      writes.push({ kind: 'factionId', id: target.factionId, value: clone(record) });
    }
    return writes;
  }

  function socialState() {
    if (!Game.state || !Game.state.world) return null;
    var social = Game.state.world.social;
    if (!social || typeof social !== 'object') {
      social = Game.state.world.social = {
        spawnVariants: {},
        memories: { spawnId: {}, socialGroupId: {}, factionId: {} }
      };
    }
    social.spawnVariants = social.spawnVariants || {};
    social.memories = social.memories || {};
    social.memories.spawnId = social.memories.spawnId || {};
    social.memories.socialGroupId = social.memories.socialGroupId || {};
    social.memories.factionId = social.memories.factionId || {};
    return social;
  }

  function memoryFor(actorValue) {
    var social = socialState();
    if (!social || !actorValue) return null;
    var memories = social.memories;
    return actorValue.spawnId && memories.spawnId[actorValue.spawnId] ||
      actorValue.socialGroupId && memories.socialGroupId[actorValue.socialGroupId] ||
      actorValue.factionId && memories.factionId[actorValue.factionId] ||
      null;
  }

  function worldMemoryRelation(source, target) {
    var sourceMemory = memoryFor(source);
    var targetMemory = memoryFor(target);
    if (source.factionId === 'adventurers' && targetMemory) return targetMemory.relation;
    if (target.factionId === 'adventurers' && sourceMemory) return sourceMemory.relation;
    return targetMemory && targetMemory.relation || sourceMemory && sourceMemory.relation || null;
  }

  Game.relations = {
    resolve: function (sourceId, targetId, encounterId) {
      removeExpired(nowWorld());
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
            var matrix = encounter.profile && encounter.profile.relationMatrix || {};
            if (matrix[source.teamId] && matrix[source.teamId][target.teamId]) {
              return matrix[source.teamId][target.teamId];
            }
            if (encounter.teams[source.teamId].coalitionId ===
                encounter.teams[target.teamId].coalitionId) return 'ally';
            return 'neutral';
          }
        }
      }
      var remembered = worldMemoryRelation(source, target);
      if (remembered) return remembered;
      return factionRelation(source.factionId, target.factionId);
    },

    setOverride: function (scope, sourceId, targetId, relation, options) {
      var prepared = preparedOverride(scope, sourceId, targetId, relation, options);
      Game.relations.commitPreparedOverride(prepared);
      return prepared.records[0].id;
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

    clearOwner: function (ownerId) {
      Object.keys(overrides).forEach(function (key) {
        if (overrides[key].ownerId === ownerId) delete overrides[key];
      });
    },

    expire: function (worldTime) {
      removeExpired(Number(worldTime) || 0);
    },

    remember: function (sourceId, targetId, relation, policy) {
      var social = socialState();
      var writes = preparedMemory(sourceId, targetId, relation, policy);
      if (!social || !writes.length) return false;
      Game.relations.commitPreparedMemory(writes);
      return true;
    },

    prepareOverride: preparedOverride,
    commitPreparedOverride: function (prepared) {
      if (!prepared || prepared.expectedNextOverride !== nextOverride) {
        throw new Error('[Relations] revision mismatch');
      }
      prepared.records.forEach(putRecord);
      nextOverride = prepared.nextOverride;
      return prepared.records[0].id;
    },
    rollbackPreparedOverride: function (prepared) {
      (prepared && prepared.records || []).forEach(function (record) { delete overrides[record.key]; });
      if (prepared && nextOverride === prepared.nextOverride) nextOverride = prepared.expectedNextOverride;
    },
    prepareMemory: preparedMemory,
    commitPreparedMemory: function (writes) {
      var social = socialState();
      (writes || []).forEach(function (write) {
        social.memories[write.kind][write.id] = clone(write.value);
      });
    },

    forgive: function (key) {
      var social = socialState();
      if (!social || !key) return false;
      var removed = false;
      [
        ['spawnId', key.spawnId],
        ['socialGroupId', key.socialGroupId],
        ['factionId', key.factionId]
      ].forEach(function (entry) {
        if (entry[1] && social.memories[entry[0]][entry[1]]) {
          delete social.memories[entry[0]][entry[1]];
          removed = true;
        }
      });
      return removed;
    },

    put: putRecord,

    state: function () {
      return { nextOverride: nextOverride, records: Game.relations.snapshot() };
    },

    restore: function (state) {
      overrides = {};
      (state && state.records || []).forEach(putRecord);
      nextOverride = state && state.nextOverride || 1;
    },

    reset: function () {
      overrides = {};
      nextOverride = 1;
    },

    snapshot: function () {
      return Object.keys(overrides).sort().map(function (key) {
        return Object.assign({}, overrides[key]);
      });
    }
  };
})();
