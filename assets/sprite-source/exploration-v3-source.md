# Exploration v3 pixel source

Source type: project-authored character-grid pixel art.

License: original project asset; no external copyrighted source material.

Style constraints: 16-bit SNES/JRPG, 3/4 view, four-color local palettes, 1px source pixels, automatic dark outline, integer nearest-neighbor scaling.

Runtime source: `js/sprites/exploration_v3.js`.

Stable asset groups:

- 24 new regional resource sprites (`gather_*`)
- modular landmark, boss-lair, curio, ecology and guardian markers (`exp_*`)
- safe, balanced and loot expedition strategy icons (`icon_strategy_*`)

Collision and navigation are generated from `terrain_v3` data and never inferred from these images.
