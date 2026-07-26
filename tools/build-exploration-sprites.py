"""Compile the 6x3 ImageGen exploration sheet into native game sprites.

The browser runtime intentionally consumes character-grid sprite definitions so
that file:// play remains synchronous and dependency-free. This tool turns the
transparent source sheet into nine regional registry modules, 18 standalone
transparent PNGs, and a compact contact sheet for visual QA. Run from any
directory:

    python tools/build-exploration-sprites.py
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import argparse

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_REL = "assets/sprite-source/gatherables-chests-concept.png"
OUTPUT_JS_DIR_REL = "js/sprites/exploration"
OUTPUT_PNG_DIR_REL = "assets/sprites/exploration"
OUTPUT_PREVIEW_REL = "assets/sprite-source/gatherables-chests-runtime-preview.png"
SOURCE = ROOT / SOURCE_REL
OUTPUT_JS_DIR = ROOT / OUTPUT_JS_DIR_REL
OUTPUT_PNG_DIR = ROOT / OUTPUT_PNG_DIR_REL
OUTPUT_PREVIEW = ROOT / OUTPUT_PREVIEW_REL

COLS = 6
ROWS = 3
ALPHA_BBOX_THRESHOLD = 32
ALPHA_RUNTIME_THRESHOLD = 104
PALETTE_SIZE = 12
OUTLINE = (22, 18, 43, 255)
SYMBOLS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz@$%&?"


@dataclass(frozen=True)
class SpriteSpec:
    sprite_id: str
    col: int
    row: int
    max_width: int
    max_height: int
    animation: str | None = None
    rgb_scale: tuple[float, float, float] = (1.0, 1.0, 1.0)
    rgb_bias: tuple[int, int, int] = (0, 0, 0)


SPECS = (
    SpriteSpec("gather_herb_patch", 0, 0, 26, 18, "sway"),
    SpriteSpec("gather_berry_bush", 1, 0, 24, 20, "sway"),
    SpriteSpec("gather_mushroom_ring", 2, 0, 26, 20),
    SpriteSpec("gather_resin_tree", 3, 0, 22, 24),
    SpriteSpec("gather_ore_vein", 4, 0, 24, 19),
    SpriteSpec("gather_crystal_cluster", 5, 0, 24, 24),
    SpriteSpec("gather_ghost_flower", 0, 1, 18, 24, "sway"),
    SpriteSpec("gather_grave_dust", 1, 1, 25, 18),
    SpriteSpec("gather_ice_crystal", 2, 1, 24, 24),
    SpriteSpec("gather_frost_herb", 3, 1, 24, 21, "sway"),
    SpriteSpec("gather_fire_core", 4, 1, 23, 19),
    SpriteSpec(
        "gather_obsidian_outcrop", 5, 1, 20, 24, None,
        (1.25, 1.08, 1.48), (10, 4, 18)
    ),
    SpriteSpec("gather_rune_stone", 0, 2, 19, 24),
    SpriteSpec("gather_aether_shard", 1, 2, 14, 24, "bob"),
    SpriteSpec(
        "gather_miasma_crystal", 2, 2, 20, 24, None,
        (1.50, 1.00, 1.55), (12, 0, 18)
    ),
    SpriteSpec("gather_demon_horn", 3, 2, 26, 18),
    SpriteSpec("chest_common", 4, 2, 24, 20),
    SpriteSpec(
        "chest_rare", 5, 2, 24, 20, None,
        (1.15, 1.00, 1.30), (6, 0, 8)
    ),
)

GROUPS = {
    "grassland": ("gather_herb_patch", "gather_berry_bush"),
    "forest": ("gather_mushroom_ring", "gather_resin_tree"),
    "mine": ("gather_ore_vein", "gather_crystal_cluster"),
    "graveyard": ("gather_ghost_flower", "gather_grave_dust"),
    "snowpass": ("gather_ice_crystal", "gather_frost_herb"),
    "lavacave": ("gather_fire_core", "gather_obsidian_outcrop"),
    "skyruins": ("gather_rune_stone", "gather_aether_shard"),
    "darkcastle": ("gather_miasma_crystal", "gather_demon_horn"),
    "chests": ("chest_common", "chest_rare"),
}


def cell_box(image: Image.Image, col: int, row: int) -> tuple[int, int, int, int]:
    return (
        round(col * image.width / COLS),
        round(row * image.height / ROWS),
        round((col + 1) * image.width / COLS),
        round((row + 1) * image.height / ROWS),
    )


def crop_cell(sheet: Image.Image, spec: SpriteSpec) -> Image.Image:
    cell = sheet.crop(cell_box(sheet, spec.col, spec.row))
    alpha = cell.getchannel("A")
    hard = alpha.point(lambda value: 255 if value >= ALPHA_BBOX_THRESHOLD else 0)
    bbox = hard.getbbox()
    if bbox is None:
        raise ValueError(f"{spec.sprite_id}: source cell is empty")
    left, top, right, bottom = bbox
    pad = 3
    return cell.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(cell.width, right + pad),
            min(cell.height, bottom + pad),
        )
    )


def fit_and_quantize(source: Image.Image, spec: SpriteSpec) -> tuple[Image.Image, list[str], dict[str, str]]:
    scale = min(spec.max_width / source.width, spec.max_height / source.height)
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    resized = source.resize((width, height), Image.Resampling.BOX)

    rgba = list(resized.get_flattened_data())
    if spec.rgb_scale != (1.0, 1.0, 1.0) or spec.rgb_bias != (0, 0, 0):
        adjusted = []
        for pixel in rgba:
            channels = tuple(
                max(0, min(255, round(pixel[index] * spec.rgb_scale[index]) + spec.rgb_bias[index]))
                for index in range(3)
            )
            adjusted.append((*channels, pixel[3]))
        resized.putdata(adjusted)
        rgba = adjusted
    mask = [pixel[3] >= ALPHA_RUNTIME_THRESHOLD for pixel in rgba]
    if not any(mask):
        raise ValueError(f"{spec.sprite_id}: sprite vanished during alpha thresholding")

    opaque_rgb = [pixel[:3] for pixel, visible in zip(rgba, mask) if visible]
    dominant = Counter(opaque_rgb).most_common(1)[0][0]
    rgb = Image.new("RGB", resized.size, dominant)
    rgb.putdata([pixel[:3] if visible else dominant for pixel, visible in zip(rgba, mask)])
    indexed = rgb.quantize(
        colors=PALETTE_SIZE,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    quantized_rgb = list(indexed.convert("RGB").get_flattened_data())

    colors = Counter(
        color for color, visible in zip(quantized_rgb, mask) if visible
    )
    ordered_colors = [
        color for color, _count in sorted(
            colors.items(),
            key=lambda item: (-item[1], sum(item[0]), item[0]),
        )
    ]
    if len(ordered_colors) > len(SYMBOLS):
        raise ValueError(f"{spec.sprite_id}: too many palette colors")
    color_to_symbol = {
        color: SYMBOLS[index] for index, color in enumerate(ordered_colors)
    }
    palette = {
        color_to_symbol[color]: "#{:02x}{:02x}{:02x}".format(*color)
        for color in ordered_colors
    }

    rows: list[str] = []
    for y in range(height):
        chars = []
        for x in range(width):
            offset = y * width + x
            chars.append(
                color_to_symbol[quantized_rgb[offset]] if mask[offset] else "."
            )
        rows.append("".join(chars))

    sprite = Image.new("RGBA", resized.size, (0, 0, 0, 0))
    sprite.putdata(
        [
            (*quantized_rgb[index], 255) if visible else (0, 0, 0, 0)
            for index, visible in enumerate(mask)
        ]
    )
    return sprite, rows, palette


def with_outline(sprite: Image.Image) -> Image.Image:
    output = Image.new("RGBA", (sprite.width + 2, sprite.height + 2), (0, 0, 0, 0))
    source = sprite.load()
    target = output.load()
    for y in range(sprite.height):
        for x in range(sprite.width):
            if source[x, y][3] == 0:
                continue
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                tx = x + 1 + dx
                ty = y + 1 + dy
                if target[tx, ty][3] == 0:
                    target[tx, ty] = OUTLINE
    output.alpha_composite(sprite, (1, 1))
    return output


def js_object(palette: dict[str, str]) -> str:
    pairs = ", ".join(f"'{symbol}': '{color}'" for symbol, color in palette.items())
    return "{ " + pairs + " }"


def js_rows(rows: list[str]) -> str:
    return ",\n".join(f"        '{row}'" for row in rows)


def sprite_definition(
    spec: SpriteSpec,
    sprite: Image.Image,
    rows: list[str],
    palette: dict[str, str],
    source_hash: str,
) -> list[str]:
    png_rel = f"{OUTPUT_PNG_DIR_REL}/{spec.sprite_id}.png"
    return [
        "  D({",
        f"    id: '{spec.sprite_id}',",
        (
            "    source: { "
            f"path: '{SOURCE_REL}', cell: [{spec.col}, {spec.row}], "
            f"sha256: '{source_hash}', png: '{png_rel}'"
            " },"
        ),
        f"    pal: {js_object(palette)},",
        f"    anchor: {{ x: {sprite.width // 2}, y: {sprite.height - 1} }},",
        "    frames: {",
        "      idle0: [",
        js_rows(rows),
        "      ]",
        "    }" + ("," if spec.animation else ""),
        *(
            [
                f"    derive: {{ idle1: {{ from: 'idle0', op: '{spec.animation}'"
                + (", dy: 1" if spec.animation == "bob" else "")
                + " } }"
            ]
            if spec.animation
            else []
        ),
        "  });",
        "",
    ]


def module_javascript(
    group: str,
    members: list[tuple[SpriteSpec, Image.Image, list[str], dict[str, str]]],
    source_hash: str,
) -> str:
    lines = [
        "/* ============================================================",
        " * AUTO-GENERATED by tools/build-exploration-sprites.py",
        f" * Group: {group}",
        f" * Source: {SOURCE_REL}",
        f" * SHA-256: {source_hash}",
        " * Overrides the hand-authored fallbacks in js/sprites/props.js.",
        " * Do not edit directly; rebuild from the transparent source sheet.",
        " * ============================================================ */",
        "(function () {",
        "  'use strict';",
        "  var Game = window.Game;",
        "  var D = Game.assets.defineSprite;",
        "",
    ]
    for spec, sprite, rows, palette in members:
        lines.extend(sprite_definition(spec, sprite, rows, palette, source_hash))
    lines.extend(["})();", ""])
    return "\n".join(lines)


def manifest_javascript(
    runtime: list[tuple[SpriteSpec, Image.Image, list[str], dict[str, str]]],
    source_hash: str,
) -> str:
    group_by_id = {
        sprite_id: group
        for group, sprite_ids in GROUPS.items()
        for sprite_id in sprite_ids
    }
    lines = [
        "/* AUTO-GENERATED exploration sprite provenance manifest. */",
        "(function () {",
        "  'use strict';",
        "  var Game = window.Game;",
        "  Game.EXPLORATION_SPRITES = {",
        f"    source: {{ path: '{SOURCE_REL}', sha256: '{source_hash}', columns: {COLS}, rows: {ROWS} }},",
        "    groups: {",
    ]
    for group, sprite_ids in GROUPS.items():
        quoted = ", ".join(f"'{sprite_id}'" for sprite_id in sprite_ids)
        lines.append(f"      {group}: [{quoted}],")
    lines.extend(["    },", "    assets: {"])
    for spec, sprite, _rows, palette in runtime:
        png_rel = f"{OUTPUT_PNG_DIR_REL}/{spec.sprite_id}.png"
        lines.append(
            f"      {spec.sprite_id}: {{ group: '{group_by_id[spec.sprite_id]}', "
            f"png: '{png_rel}', cell: [{spec.col}, {spec.row}], "
            f"size: [{sprite.width + 2}, {sprite.height + 2}], colors: {len(palette)} }},"
        )
    lines.extend(["    }", "  };", "})();", ""])
    return "\n".join(lines)


def png_bytes(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def build() -> tuple[dict[Path, bytes], int]:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    sprite_ids = [spec.sprite_id for spec in SPECS]
    source_cells = [(spec.col, spec.row) for spec in SPECS]
    grouped_ids = [
        sprite_id
        for group_ids in GROUPS.values()
        for sprite_id in group_ids
    ]
    if len(set(sprite_ids)) != len(sprite_ids):
        raise ValueError("sprite IDs must be unique")
    if len(set(source_cells)) != len(source_cells):
        raise ValueError("source cells must be unique")
    if set(grouped_ids) != set(sprite_ids) or len(grouped_ids) != len(sprite_ids):
        raise ValueError("runtime groups must cover every sprite exactly once")
    source_bytes = SOURCE.read_bytes()
    source_hash = sha256(source_bytes).hexdigest()
    sheet = Image.open(SOURCE).convert("RGBA")
    if sheet.getchannel("A").getextrema()[0] != 0:
        raise ValueError("source sheet has no transparent pixels")
    if len(SPECS) != COLS * ROWS:
        raise ValueError("sprite specification must cover every atlas cell")

    runtime: list[tuple[SpriteSpec, Image.Image, list[str], dict[str, str]]] = []
    for spec in SPECS:
        crop = crop_cell(sheet, spec)
        sprite, rows, palette = fit_and_quantize(crop, spec)
        runtime.append((spec, sprite, rows, palette))

    cell_size = 32
    preview = Image.new("RGBA", (COLS * cell_size, ROWS * cell_size), (0, 0, 0, 0))
    outputs: dict[Path, bytes] = {}
    for spec, sprite, _rows, _palette in runtime:
        outlined = with_outline(sprite)
        outputs[OUTPUT_PNG_DIR / f"{spec.sprite_id}.png"] = png_bytes(outlined)
        x = spec.col * cell_size + (cell_size - outlined.width) // 2
        y = spec.row * cell_size + cell_size - outlined.height - 2
        preview.alpha_composite(outlined, (x, y))

    runtime_by_id = {item[0].sprite_id: item for item in runtime}
    manifest = manifest_javascript(runtime, source_hash).encode("utf-8")
    outputs[OUTPUT_JS_DIR / "manifest.generated.js"] = manifest
    for group, sprite_ids in GROUPS.items():
        members = [runtime_by_id[sprite_id] for sprite_id in sprite_ids]
        module = module_javascript(group, members, source_hash).encode("utf-8")
        outputs[OUTPUT_JS_DIR / f"{group}.generated.js"] = module
    outputs[OUTPUT_PREVIEW] = png_bytes(preview)

    return outputs, len(runtime)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify committed outputs match the transparent source sheet",
    )
    args = parser.parse_args()
    outputs, count = build()
    if args.check:
        mismatches = [
            path.relative_to(ROOT)
            for path, expected in outputs.items()
            if not path.exists() or path.read_bytes() != expected
        ]
        if mismatches:
            raise SystemExit(
                "Generated exploration assets are stale: "
                + ", ".join(str(path) for path in mismatches)
            )
        print(f"Exploration asset outputs are current ({count} sprites)")
        return

    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        print(f"Wrote {path.relative_to(ROOT)}")
    print(f"Compiled {count} source cells into {len(GROUPS)} runtime groups")


if __name__ == "__main__":
    main()
