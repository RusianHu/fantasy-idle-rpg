#!/usr/bin/env python3
"""Build independently replaceable ground-decoration assets.

The 72 transparent PNGs under assets/sprite-source/ground-decorations are the
authoritative pixel sources. This builder preserves their stable IDs, emits
one production PNG per source, and compiles the images into the synchronous
character-grid sprite format used by the game runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assets" / "sprite-source" / "ground-decorations"
OUTPUT_ROOT = ROOT / "assets" / "sprites" / "ground-decorations"
JS_ROOT = ROOT / "js" / "sprites" / "ground-decorations"
MANIFEST_JSON = OUTPUT_ROOT / "manifest.generated.json"
MANIFEST_JS = JS_ROOT / "manifest.generated.js"
PREVIEW = ROOT / "assets" / "sprite-source" / "ground-decorations-preview.png"
OUTLINE = (0x16, 0x12, 0x2B, 0xFF)
PALETTE_KEYS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

REGIONS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "grassland",
        (
            "clover",
            "wild_wheat",
            "dandelions",
            "burrow",
            "fallen_branch",
            "fairy_ring",
            "horseshoe",
            "stepping_stones",
            "bluebells",
        ),
    ),
    (
        "forest",
        (
            "mossy_log",
            "red_shrooms",
            "cones_acorns",
            "root_knot",
            "leaf_pile",
            "fern_stones",
            "brambles",
            "snail_shell",
            "moths",
        ),
    ),
    (
        "mine",
        (
            "broken_rail",
            "coal_pile",
            "discarded_pick",
            "lantern",
            "timber_scraps",
            "copper_rubble",
            "cart_wheel",
            "dynamite",
            "ore_sack",
        ),
    ),
    (
        "graveyard",
        (
            "cracked_slab",
            "wilted_flowers",
            "chain_coil",
            "urn_shards",
            "ectoplasm",
            "fresh_mound",
            "grave_coins",
            "bone_hand",
            "raven_feathers",
        ),
    ),
    (
        "snowpass",
        (
            "ice_spikes",
            "snow_bones",
            "frost_shrub",
            "trail_cairn",
            "frozen_puddle",
            "broken_sled",
            "wolf_tracks",
            "frozen_rope",
            "trail_pennant",
        ),
    ),
    (
        "lavacave",
        (
            "ember_vent",
            "sulfur_crystals",
            "lava_crust",
            "basalt_shards",
            "scorched_bones",
            "ash_mound",
            "fire_geode",
            "iron_grate",
            "molten_tracks",
        ),
    ),
    (
        "skyruins",
        (
            "rune_tile",
            "gear_fragment",
            "marble_rubble",
            "aether_motes",
            "cloud_grass",
            "mosaic",
            "astrolabe",
            "amphora_shards",
            "golden_wing",
        ),
    ),
    (
        "darkcastle",
        (
            "ritual_rune",
            "iron_chain",
            "banner_scrap",
            "claw_marks",
            "purple_fungus",
            "gargoyle_fragment",
            "broken_chalice",
            "bone_candelabrum",
            "thorn_crown",
        ),
    ),
)


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=False)
    return output.getvalue()


def source_path(region: str, sprite_id: str) -> Path:
    return SOURCE_ROOT / region / f"{sprite_id}.png"


def output_path(region: str, sprite_id: str) -> Path:
    return OUTPUT_ROOT / region / f"{sprite_id}.png"


def load_source(region: str, sprite_id: str) -> tuple[Image.Image, bytes]:
    path = source_path(region, sprite_id)
    if not path.is_file():
        raise ValueError(f"Missing source PNG: {relative(path)}")
    raw = path.read_bytes()
    with Image.open(io.BytesIO(raw)) as opened:
        image = opened.convert("RGBA")
    width, height = image.size
    if width < 1 or height < 1 or width > 32 or height > 32:
        raise ValueError(
            f"{sprite_id}: source must be between 1x1 and 32x32 pixels, got {width}x{height}"
        )
    pixels = image.load()
    alpha_values = {
        pixels[x, y][3]
        for y in range(height)
        for x in range(width)
    }
    if not alpha_values or alpha_values == {0}:
        raise ValueError(f"{sprite_id}: source has no visible pixels")
    if not alpha_values.issubset({0, 255}):
        raise ValueError(f"{sprite_id}: source must use binary alpha (0 or 255)")
    return image, raw


def compile_grid(image: Image.Image, sprite_id: str) -> tuple[dict[str, str], list[str]]:
    colors: list[tuple[int, int, int, int]] = []
    seen: set[tuple[int, int, int, int]] = set()
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            pixel = pixels[x, y]
            if pixel[3] and pixel not in seen:
                colors.append(pixel)
                seen.add(pixel)
    if len(colors) > len(PALETTE_KEYS):
        raise ValueError(
            f"{sprite_id}: {len(colors)} opaque colors exceed the {len(PALETTE_KEYS)}-color runtime limit"
        )
    color_keys = {color: PALETTE_KEYS[index] for index, color in enumerate(colors)}
    palette = {
        color_keys[color]: f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}"
        for color in colors
    }
    width, height = image.size
    rows = [
        "".join("." if pixels[x, y][3] == 0 else color_keys[pixels[x, y]] for x in range(width))
        for y in range(height)
    ]
    return palette, rows


def add_runtime_outline(source: Image.Image) -> Image.Image:
    width, height = source.size
    output = Image.new("RGBA", (width + 2, height + 2), (0, 0, 0, 0))
    output.alpha_composite(source, (1, 1))
    source_pixels = source.load()
    output_pixels = output.load()
    for y in range(-1, height + 1):
        for x in range(-1, width + 1):
            here = 0 <= x < width and 0 <= y < height and source_pixels[x, y][3] != 0
            if here:
                continue
            near = (
                (y > 0 and 0 <= x < width and source_pixels[x, y - 1][3] != 0)
                or (y < height - 1 and 0 <= x < width and source_pixels[x, y + 1][3] != 0)
                or (x > 0 and 0 <= y < height and source_pixels[x - 1, y][3] != 0)
                or (x < width - 1 and 0 <= y < height and source_pixels[x + 1, y][3] != 0)
            )
            if near:
                output_pixels[x + 1, y + 1] = OUTLINE
    return output


def build_region_js(region: str, assets: list[dict[str, Any]]) -> str:
    lines = [
        "/* Generated by tools/build-ground-decorations.py. Do not edit directly. */",
        "(function () {",
        "  'use strict';",
        "  var D = window.Game.assets.defineSprite;",
        "",
    ]
    for asset in assets:
        palette = json.dumps(asset["palette"], ensure_ascii=True, separators=(", ", ": "))
        source = json.dumps(
            {
                "path": asset["source"]["path"],
                "sha256": asset["source"]["sha256"],
                "png": asset["png"],
            },
            ensure_ascii=True,
            separators=(", ", ": "),
        )
        rows = ",\n".join(f"        {json.dumps(row)}" for row in asset["rows"])
        lines.extend(
            [
                "  D({",
                f"    id: {json.dumps(asset['id'])},",
                f"    source: {source},",
                f"    pal: {palette},",
                f"    anchor: {{ x: {asset['anchor']['x']}, y: {asset['anchor']['y']} }},",
                "    frames: {",
                "      idle0: [",
                rows,
                "      ]",
                "    }",
                "  });",
                "",
            ]
        )
    lines.extend(["})();", ""])
    return "\n".join(lines)


def make_preview(runtime_images: list[tuple[str, Image.Image]]) -> Image.Image:
    scale = 4
    cell_width, cell_height = 80, 64
    columns, rows = 9, len(REGIONS)
    preview = Image.new(
        "RGBA",
        (columns * cell_width, rows * cell_height),
        (25, 23, 35, 255),
    )
    pixels = preview.load()
    checker = ((34, 31, 48, 255), (42, 38, 57, 255))
    for y in range(preview.height):
        for x in range(preview.width):
            pixels[x, y] = checker[((x // 8) + (y // 8)) % 2]
    for index, (_, image) in enumerate(runtime_images):
        column = index % columns
        row = index // columns
        enlarged = image.resize(
            (image.width * scale, image.height * scale),
            Image.Resampling.NEAREST,
        )
        x = column * cell_width + (cell_width - enlarged.width) // 2
        y = row * cell_height + (cell_height - enlarged.height) // 2
        preview.alpha_composite(enlarged, (x, y))
    return preview


def expected_outputs() -> dict[Path, bytes]:
    outputs: dict[Path, bytes] = {}
    manifest_regions: dict[str, list[str]] = {}
    manifest_assets: dict[str, dict[str, Any]] = {}
    runtime_images: list[tuple[str, Image.Image]] = []

    for region, suffixes in REGIONS:
        region_assets: list[dict[str, Any]] = []
        manifest_regions[region] = []
        for slot, suffix in enumerate(suffixes, start=1):
            sprite_id = f"deco_{region}_{suffix}"
            image, raw_source = load_source(region, sprite_id)
            palette, rows = compile_grid(image, sprite_id)
            runtime_image = add_runtime_outline(image)
            source_sha256 = hashlib.sha256(raw_source).hexdigest()
            production_path = output_path(region, sprite_id)
            asset = {
                "id": sprite_id,
                "region": region,
                "slot": slot,
                "source": {
                    "path": relative(source_path(region, sprite_id)),
                    "sha256": source_sha256,
                },
                "png": relative(production_path),
                "size": {"width": image.width, "height": image.height},
                "runtimeSize": {
                    "width": runtime_image.width,
                    "height": runtime_image.height,
                },
                "anchor": {"x": image.width // 2, "y": image.height - 1},
                "palette": palette,
                "rows": rows,
            }
            outputs[production_path] = png_bytes(runtime_image)
            runtime_images.append((sprite_id, runtime_image))
            region_assets.append(asset)
            manifest_regions[region].append(sprite_id)
            manifest_assets[sprite_id] = {
                "region": region,
                "slot": slot,
                "source": asset["source"],
                "png": asset["png"],
                "size": asset["size"],
                "runtimeSize": asset["runtimeSize"],
                "anchor": asset["anchor"],
                "colors": len(palette),
            }
        outputs[JS_ROOT / f"{region}.generated.js"] = build_region_js(
            region, region_assets
        ).encode("utf-8")

    manifest = {
        "version": 2,
        "pipeline": "independent-transparent-png-to-character-grid",
        "sourceRoot": relative(SOURCE_ROOT),
        "outputRoot": relative(OUTPUT_ROOT),
        "preview": relative(PREVIEW),
        "outline": "#16122b",
        "regions": manifest_regions,
        "assets": manifest_assets,
    }
    manifest_json = json.dumps(
        manifest, ensure_ascii=True, indent=2, sort_keys=False
    ) + "\n"
    outputs[MANIFEST_JSON] = manifest_json.encode("utf-8")
    manifest_js = (
        "/* Generated by tools/build-ground-decorations.py. Do not edit directly. */\n"
        "(function () {\n"
        "  'use strict';\n"
        "  window.Game.GROUND_DECORATION_SPRITES = "
        + json.dumps(manifest, ensure_ascii=True, indent=2, sort_keys=False)
        + ";\n})();\n"
    )
    outputs[MANIFEST_JS] = manifest_js.encode("utf-8")
    outputs[PREVIEW] = png_bytes(make_preview(runtime_images))
    return outputs


def verify_source_set() -> None:
    expected = {
        source_path(region, f"deco_{region}_{suffix}").resolve()
        for region, suffixes in REGIONS
        for suffix in suffixes
    }
    actual = {path.resolve() for path in SOURCE_ROOT.rglob("*.png")}
    extra = sorted(relative(path) for path in actual - expected)
    if extra:
        raise ValueError("Unregistered source PNGs: " + ", ".join(extra))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify that all generated outputs match their independent sources",
    )
    args = parser.parse_args()
    asset_count = sum(len(suffixes) for _, suffixes in REGIONS)
    verify_source_set()
    outputs = expected_outputs()
    mismatches = [
        relative(path)
        for path, expected in outputs.items()
        if not path.is_file() or path.read_bytes() != expected
    ]
    if args.check:
        if mismatches:
            print("Ground-decoration outputs are stale or missing:")
            for path in mismatches:
                print(f"  {path}")
            return 1
        print(
            "Ground-decoration assets are current: "
            f"{asset_count} sources, {asset_count} PNGs, {len(REGIONS)} modules."
        )
        return 0
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    print(
        "Built ground-decoration assets: "
        f"{asset_count} independent sources -> {asset_count} PNGs + "
        f"{len(REGIONS)} runtime modules + manifest."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
