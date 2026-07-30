# Boss territory ImageGen sources

Source type: OpenAI built-in `imagegen` output, followed by local chroma-key
removal. The committed PNGs are the transparent production source atlases.

License: original project asset.

Shared prompt:

```text
Use case: stylized-concept
Asset type: production source atlas for a 2D top-down JRPG boss territory sprite kit
Scene/backdrop: a perfectly flat chroma-key background only.
Style/medium: authentic hand-pixeled 16-bit SNES-era Japanese fantasy RPG
environment sprite, crisp 1-pixel clusters, 3/4 top-down view, readable
silhouette, limited cohesive palette and dark selective outline.
Composition/framing: square atlas; one large lair centered in the upper section,
then exactly three separate, evenly spaced decor sprites in the lower row with
generous padding and aligned ground anchors.
Constraints: uniform key background; no shadows, gradients, texture, floor
plane, reflections, text, labels, grid lines, characters, watermark, logo or UI.
```

Per-region subjects:

- `grassland`: crown-topped blue slime burrow; slime puddle, warning banner, eggs.
- `forest`: face-like elder tree hollow; mushroom ring, root totem, wisp sapling.
- `mine`: stone-golem foundry gate; crystal pylon, rune mine cart, chained brazier.
- `graveyard`: black gothic mausoleum; soul candles, chained coffin, raven obelisk.
- `snowpass`: horn-ringed giant crater; ice rune, frozen weapon, warning cairn.
- `lavacave`: horned basalt caldera gate; lava brazier, obsidian horns, fire altar.
- `skyruins`: floating guardian core gate; rune obelisk, broken column, wind shrine.
- `darkcastle`: twin-tower demon keep; miasma well, red-moon banner, gargoyle pillar.

Build with `python tools/build-boss-landmarks.py`; verify committed PNGs, the
runtime contact sheet and `js/sprites/boss_landmarks.generated.js` with
`python tools/build-boss-landmarks.py --check`.
