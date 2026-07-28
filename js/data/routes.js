/* ============================================================
 * data/routes.js - campaign route templates and global switches
 *
 * Route templates describe campaign topology. Region definitions describe
 * map content. Keeping them separate lets future quest maps and lairs attach
 * to a campaign without changing region registration order.
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  Game.ROUTE_FEATURES = Game.ROUTE_FEATURES || {};

  // Temporary product switch. It is intentionally off: new saves follow the
  // authored route until route randomization is deliberately re-enabled.
  if (typeof Game.ROUTE_FEATURES.randomizeNewGameMainline !== 'boolean') {
    Game.ROUTE_FEATURES.randomizeNewGameMainline = false;
  }

  var commonPorts = [
    { id: 'before', accepts: ['quest', 'event'], capacity: 1 },
    { id: 'after', accepts: ['quest', 'nest', 'event'], capacity: 2 }
  ];

  function mainlineNode(regionId, chapterId, shuffleGroup, tags) {
    return {
      id: 'main:' + regionId,
      kind: 'mainline',
      destination: { type: 'region', id: regionId },
      chapterId: chapterId,
      shuffleGroup: shuffleGroup || null,
      tags: tags || [],
      insertionPorts: commonPorts
    };
  }

  Game.register('routeTemplate', {
    id: 'lucia-campaign',
    schemaVersion: 1,
    randomization: {
      featureFlag: 'randomizeNewGameMainline',
      groups: {
        frontier: { seedNamespace: 'lucia-frontier-route' }
      }
    },
    insertionKinds: {
      quest: {
        ports: ['before', 'after'],
        tierMode: 'inherit',
        returnMode: 'anchor',
        defaultLifetime: 'until-resolved'
      },
      nest: {
        ports: ['after'],
        tierMode: 'inherit',
        returnMode: 'anchor',
        defaultLifetime: 'single-clear'
      },
      event: {
        ports: ['before', 'after'],
        tierMode: 'inherit',
        returnMode: 'anchor',
        defaultLifetime: 'until-expired'
      }
    },
    chapters: [
      {
        id: 'frontier',
        nodes: [
          mainlineNode('grassland', 'frontier', 'frontier', ['safe-start', 'outdoor']),
          mainlineNode('forest', 'frontier', 'frontier', ['outdoor', 'dense']),
          mainlineNode('mine', 'frontier', 'frontier', ['underground']),
          mainlineNode('graveyard', 'frontier', 'frontier', ['outdoor', 'undead'])
        ]
      },
      {
        id: 'miasma-heartland',
        nodes: [
          mainlineNode('snowpass', 'miasma-heartland', null, ['outdoor', 'extreme']),
          mainlineNode('lavacave', 'miasma-heartland', null, ['underground', 'extreme']),
          mainlineNode('skyruins', 'miasma-heartland', null, ['outdoor', 'ancient']),
          mainlineNode('darkcastle', 'miasma-heartland', null, ['finale', 'fortress'])
        ]
      }
    ]
  });
})();
