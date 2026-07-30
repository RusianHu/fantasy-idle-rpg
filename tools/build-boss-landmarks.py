"""Compile ImageGen boss-territory kits into synchronous pixel sprites.

Each transparent source atlas contains one large boss landmark in the upper
section and three smaller decor sprites in the lower row. The browser runtime
uses character-grid sprites so file:// play remains synchronous and sharp.

Run from any directory:

    python tools/build-boss-landmarks.py
    python tools/build-boss-landmarks.py --check
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
SOURCE_DIR_REL = "assets/sprite-source/boss-territories"
OUTPUT_DIR_REL = "assets/sprites/boss-territories"
OUTPUT_JS_REL = "js/sprites/boss_landmarks.generated.js"
OUTPUT_PREVIEW_REL = "assets/sprite-source/boss-territories-runtime-preview.png"
SOURCE_DIR = ROOT / SOURCE_DIR_REL
OUTPUT_DIR = ROOT / OUTPUT_DIR_REL
OUTPUT_JS = ROOT / OUTPUT_JS_REL
OUTPUT_PREVIEW = ROOT / OUTPUT_PREVIEW_REL

ALPHA_THRESHOLD = 96
MAIN_PALETTE_SIZE = 16
DECOR_PALETTE_SIZE = 12
OUTLINE = (21, 17, 35, 255)
SYMBOLS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz@$%&?"


@dataclass(frozen=True)
class RegionSpec:
    region_id: str
    split_y: int
    main_size: tuple[int, int]
    decor_size: tuple[int, int] = (26, 25)
    animations: tuple[str | None, str | None, str | None] = (None, None, None)


REGIONS = (
    RegionSpec("grassland", 790, (68, 52), animations=(None, "sway", None)),
    RegionSpec("forest", 820, (68, 55), animations=("bob", None, "sway")),
    RegionSpec("mine", 820, (70, 54), animations=("bob", None, "sway")),
    RegionSpec("graveyard", 840, (68, 55), animations=("sway", None, "sway")),
    RegionSpec("snowpass", 900, (74, 53), animations=(None, None, "sway")),
    RegionSpec("lavacave", 860, (70, 55), animations=("sway", None, "bob")),
    RegionSpec("skyruins", 800, (70, 56), animations=("bob", "bob", "bob")),
    RegionSpec("darkcastle", 800, (74, 56), animations=("sway", "sway", "bob")),
)


def alpha_crop(image: Image.Image, pad: int = 4) -> Image.Image:
    alpha = image.getchannel("A")
    hard = alpha.point(lambda value: 255 if value >= 32 else 0)
    bbox = hard.getbbox()
    if bbox is None:
        raise ValueError("source cell is empty")
    left, top, right, bottom = bbox
    return image.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(image.width, right + pad),
            min(image.height, bottom + pad),
        )
    )


def source_crops(image: Image.Image, spec: RegionSpec) -> list[Image.Image]:
    if image.size != (1254, 1254):
        raise ValueError(f"{spec.region_id}: expected 1254x1254 source, got {image.size}")
    crops = [alpha_crop(image.crop((0, 0, image.width, spec.split_y)))]
    decor_top = spec.split_y
    for index in range(3):
        left = round(index * image.width / 3)
        right = round((index + 1) * image.width / 3)
        crops.append(alpha_crop(image.crop((left, decor_top, right, image.height))))
    return crops


def fit_sprite(
    source: Image.Image,
    max_size: tuple[int, int],
    palette_size: int,
) -> tuple[Image.Image, list[str], dict[str, str]]:
    scale = min(max_size[0] / source.width, max_size[1] / source.height)
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    resized = source.resize((width, height), Image.Resampling.BOX)
    rgba = list(resized.get_flattened_data())
    mask = [pixel[3] >= ALPHA_THRESHOLD for pixel in rgba]
    if not any(mask):
        raise ValueError("sprite vanished during alpha thresholding")

    opaque_rgb = [pixel[:3] for pixel, visible in zip(rgba, mask) if visible]
    dominant = Counter(opaque_rgb).most_common(1)[0][0]
    rgb = Image.new("RGB", resized.size, dominant)
    rgb.putdata([pixel[:3] if visible else dominant for pixel, visible in zip(rgba, mask)])
    indexed = rgb.quantize(
        colors=max(2, palette_size - 1),
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    quantized = list(indexed.convert("RGB").get_flattened_data())

    outlined = Image.new("RGBA", (width + 2, height + 2), (0, 0, 0, 0))
    target = outlined.load()
    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if not mask[offset]:
                continue
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                tx, ty = x + 1 + dx, y + 1 + dy
                if target[tx, ty][3] == 0:
                    target[tx, ty] = OUTLINE
            target[x + 1, y + 1] = (*quantized[offset], 255)

    visible_colors = Counter(
        pixel[:3] for pixel in outlined.get_flattened_data() if pixel[3] >= ALPHA_THRESHOLD
    )
    ordered = [
        color for color, _count in sorted(
            visible_colors.items(),
            key=lambda item: (-item[1], sum(item[0]), item[0]),
        )
    ]
    if len(ordered) > len(SYMBOLS):
        raise ValueError("too many palette colors")
    color_to_symbol = {color: SYMBOLS[index] for index, color in enumerate(ordered)}
    palette = {
        color_to_symbol[color]: "#{:02x}{:02x}{:02x}".format(*color)
        for color in ordered
    }
    rows = []
    for y in range(outlined.height):
        row = []
        for x in range(outlined.width):
            pixel = target[x, y]
            row.append(color_to_symbol[pixel[:3]] if pixel[3] >= ALPHA_THRESHOLD else ".")
        rows.append("".join(row))
    return outlined, rows, palette


def js_object(palette: dict[str, str]) -> str:
    pairs = ", ".join(f"'{key}': '{value}'" for key, value in palette.items())
    return "{ " + pairs + " }"


def js_rows(rows: list[str]) -> str:
    return ",\n".join(f"        '{row}'" for row in rows)


def png_bytes(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def sprite_id(region_id: str, index: int) -> str:
    return (
        f"boss_lair_{region_id}"
        if index == 0
        else f"boss_decor_{region_id}_{index}"
    )


def generated_javascript(
    runtime: list[tuple[RegionSpec, int, Image.Image, list[str], dict[str, str]]],
    source_hashes: dict[str, str],
) -> str:
    lines = [
        "/* ============================================================",
        " * AUTO-GENERATED by tools/build-boss-landmarks.py",
        f" * Sources: {SOURCE_DIR_REL}/*.png",
        " * Do not edit directly; rebuild from the transparent ImageGen sources.",
        " * ============================================================ */",
        "(function () {",
        "  'use strict';",
        "  var Game = window.Game;",
        "  var D = Game.assets.defineSprite;",
        "",
    ]
    for spec, index, sprite, rows, palette in runtime:
        sid = sprite_id(spec.region_id, index)
        source_rel = f"{SOURCE_DIR_REL}/{spec.region_id}.png"
        png_rel = f"{OUTPUT_DIR_REL}/{sid}.png"
        lines.extend(
            [
                "  D({",
                f"    id: '{sid}',",
                (
                    "    source: { "
                    f"path: '{source_rel}', part: {index}, "
                    f"sha256: '{source_hashes[spec.region_id]}', png: '{png_rel}'"
                    " },"
                ),
                f"    pal: {js_object(palette)},",
                f"    anchor: {{ x: {sprite.width // 2}, y: {sprite.height - 1} }},",
                "    frames: {",
                "      idle0: [",
                js_rows(rows),
                "      ]",
                "    }" + ("," if index and spec.animations[index - 1] else ""),
            ]
        )
        animation = spec.animations[index - 1] if index else None
        if animation:
            dy = ", dy: 1" if animation == "bob" else ""
            lines.append(
                f"    derive: {{ idle1: {{ from: 'idle0', op: '{animation}'{dy} }} }}"
            )
        lines.extend(["  });", ""])

    lines.extend(
        [
            "  Game.BOSS_TERRITORY_SPRITES = {",
            "    version: 1,",
            "    scale: 'integer-nearest-neighbor',",
            "    style: '16-bit-snes-jrpg-topdown',",
            "    sources: {",
        ]
    )
    for spec in REGIONS:
        lines.append(
            f"      {spec.region_id}: {{ path: '{SOURCE_DIR_REL}/{spec.region_id}.png', "
            f"sha256: '{source_hashes[spec.region_id]}' }},"
        )
    lines.extend(["    },", "    regions: {"])
    for spec in REGIONS:
        ids = ", ".join(f"'{sprite_id(spec.region_id, index)}'" for index in range(4))
        lines.append(f"      {spec.region_id}: [{ids}],")
    lines.extend(["    },", "    assets: {"])
    for spec, index, sprite, _rows, palette in runtime:
        sid = sprite_id(spec.region_id, index)
        lines.append(
            f"      {sid}: {{ region: '{spec.region_id}', part: {index}, "
            f"png: '{OUTPUT_DIR_REL}/{sid}.png', "
            f"size: [{sprite.width}, {sprite.height}], colors: {len(palette)} }},"
        )
    lines.extend(["    }", "  };", "})();", ""])
    return "\n".join(lines)


def build() -> tuple[dict[Path, bytes], int]:
    runtime: list[tuple[RegionSpec, int, Image.Image, list[str], dict[str, str]]] = []
    source_hashes: dict[str, str] = {}
    outputs: dict[Path, bytes] = {}
    for spec in REGIONS:
        source_path = SOURCE_DIR / f"{spec.region_id}.png"
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        source_bytes = source_path.read_bytes()
        source_hashes[spec.region_id] = sha256(source_bytes).hexdigest()
        source = Image.open(source_path).convert("RGBA")
        if source.getchannel("A").getextrema()[0] != 0:
            raise ValueError(f"{spec.region_id}: source has no transparent pixels")
        for index, crop in enumerate(source_crops(source, spec)):
            max_size = spec.main_size if index == 0 else spec.decor_size
            palette_size = MAIN_PALETTE_SIZE if index == 0 else DECOR_PALETTE_SIZE
            sprite, rows, palette = fit_sprite(crop, max_size, palette_size)
            runtime.append((spec, index, sprite, rows, palette))
            outputs[OUTPUT_DIR / f"{sprite_id(spec.region_id, index)}.png"] = png_bytes(sprite)

    preview_cell = 96
    preview = Image.new("RGBA", (preview_cell * 4, preview_cell * 4), (0, 0, 0, 0))
    runtime_by_key = {(item[0].region_id, item[1]): item for item in runtime}
    for region_index, spec in enumerate(REGIONS):
        kit = Image.new("RGBA", (preview_cell, preview_cell * 2), (0, 0, 0, 0))
        main = runtime_by_key[(spec.region_id, 0)][2]
        kit.alpha_composite(main, ((preview_cell - main.width) // 2, 2))
        for decor_index in range(1, 4):
            decor = runtime_by_key[(spec.region_id, decor_index)][2]
            center_x = round((decor_index - 0.5) * preview_cell / 3)
            kit.alpha_composite(
                decor,
                (center_x - decor.width // 2, preview_cell * 2 - decor.height - 4),
            )
        col = region_index % 4
        row = region_index // 4
        preview.alpha_composite(kit, (col * preview_cell, row * preview_cell * 2))

    outputs[OUTPUT_PREVIEW] = png_bytes(preview)
    outputs[OUTPUT_JS] = generated_javascript(runtime, source_hashes).encode("utf-8")
    return outputs, len(runtime)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify committed outputs match the transparent source atlases",
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
                "Generated boss-landmark assets are stale: "
                + ", ".join(str(path) for path in mismatches)
            )
        print(f"Boss-landmark outputs are current ({count} sprites)")
        return

    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        print(f"Wrote {path.relative_to(ROOT)}")
    print(f"Compiled {count} boss-territory sprites from {len(REGIONS)} ImageGen sources")


if __name__ == "__main__":
    main()
