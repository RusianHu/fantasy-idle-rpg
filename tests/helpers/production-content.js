'use strict';

const PRODUCTION_CONTENT_FILES = Object.freeze([
  'js/core/utils.js',
  'js/core/eventbus.js',
  'js/core/registry.js',
  'js/core/content/rules.js',
  'js/core/content/schemas.js',
  'js/core/content/compiler.js',
  'js/core/content/audit.js',
  'js/core/content/registry.js',
  'js/i18n/i18n.js',
  'js/i18n/zh-CN.js',
  'js/i18n/en.js',
  'js/i18n/combat-v2-zh-CN.js',
  'js/i18n/combat-v2-en.js',
  'js/core/assets.js',
  'js/sprites/palettes.js',
  'js/sprites/hero.js',
  'js/sprites/monsters_a.js',
  'js/sprites/monsters_b.js',
  'js/sprites/monsters_expansion.js',
  'js/sprites/monsters_guards.js',
  'js/sprites/props.js',
  'js/sprites/ground-decorations/manifest.generated.js',
  'js/sprites/ground-decorations/grassland.generated.js',
  'js/sprites/ground-decorations/forest.generated.js',
  'js/sprites/ground-decorations/mine.generated.js',
  'js/sprites/ground-decorations/graveyard.generated.js',
  'js/sprites/ground-decorations/snowpass.generated.js',
  'js/sprites/ground-decorations/lavacave.generated.js',
  'js/sprites/ground-decorations/skyruins.generated.js',
  'js/sprites/ground-decorations/darkcastle.generated.js',
  'js/sprites/exploration_v3.js',
  'js/core/content/support.js',
  'js/data/content/content.generated.js'
]);

function loadProductionContent(load, host) {
  PRODUCTION_CONTENT_FILES.forEach(load);
  const game = host.Game || host;
  return game.content.finalize({ strict: true });
}

module.exports = {
  PRODUCTION_CONTENT_FILES,
  loadProductionContent
};
