#!/usr/bin/env python3
"""Extract and optimize transparent K Films signature assets from a Pixelmator SVG."""
from __future__ import annotations

import argparse
import base64
import re
from io import BytesIO
from pathlib import Path

from PIL import Image


STENCIL_PATTERN = re.compile(
    rb'<image id="Stencil"[^>]*xlink:href="data:image/png;base64,\s*'
    rb'([A-Za-z0-9+/=\s]+)"',
    re.DOTALL,
)


def extract_stencil(source: Path) -> Image.Image:
    match = STENCIL_PATTERN.search(source.read_bytes())
    if not match:
        raise SystemExit(f'No embedded PNG layer named "Stencil" found in {source}')

    payload = re.sub(rb"\s+", b"", match.group(1))
    return Image.open(BytesIO(base64.b64decode(payload))).convert("RGBA")


def solid_variant(source: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    result = Image.new("RGBA", source.size, (*color, 255))
    result.putalpha(source.getchannel("A"))
    return result


def process(source: Path, source_dir: Path, output_dir: Path) -> None:
    stencil = extract_stencil(source)
    source_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    source_path = source_dir / "k-films-signature-source.png"
    steel_path = output_dir / "k-films-signature-steel.png"
    black_path = output_dir / "k-films-signature-black.png"
    white_path = output_dir / "k-films-signature-white.png"

    stencil.save(source_path, "PNG", optimize=True)
    stencil.save(steel_path, "PNG", optimize=True)
    solid_variant(stencil, (0, 0, 0)).save(black_path, "PNG", optimize=True)
    solid_variant(stencil, (255, 255, 255)).save(white_path, "PNG", optimize=True)

    print(f"Extracted {stencil.size[0]}x{stencil.size[1]} Stencil layer from {source}")
    for path in (source_path, black_path, white_path, steel_path):
        print(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        nargs="?",
        type=Path,
        default=Path("public/images/K FIlms Steel Signature.svg"),
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("public/images/src"),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("public/images/brand"),
    )
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(f"Missing source SVG: {args.source}")

    process(args.source, args.source_dir, args.output_dir)
