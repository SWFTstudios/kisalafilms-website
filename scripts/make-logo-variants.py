#!/usr/bin/env python3
"""Knock out light backgrounds from logo sources; emit solid black/white PNGs with alpha."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def process(src: Path, out_dir: Path, pad: int = 24) -> None:
    im = Image.open(src).convert("RGBA")
    pixels = im.load()
    w, h = im.size
    alpha = Image.new("L", (w, h), 0)
    ap = alpha.load()

    t0, t1 = 200.0, 248.0
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            L = 0.299 * r + 0.587 * g + 0.114 * b
            if L >= t1:
                a = 0
            else:
                a = int(max(0.0, min(1.0, (t1 - L) / (t1 - t0))) * 255)
            ap[x, y] = a
            if a > 8:
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y

    box = (
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(w, max_x + 1 + pad),
        min(h, max_y + 1 + pad),
    )
    mask = alpha.crop(box)

    def solid(rgb: tuple[int, int, int]) -> Image.Image:
        base = Image.new("RGBA", mask.size, (*rgb, 255))
        base.putalpha(mask)
        return base

    out_dir.mkdir(parents=True, exist_ok=True)
    solid((0, 0, 0)).save(out_dir / "k-films-logo-black.png", "PNG", optimize=True)
    solid((255, 255, 255)).save(out_dir / "k-films-logo-white.png", "PNG", optimize=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "src",
        type=Path,
        nargs="?",
        default=Path("public/images/src/k-films-logo-source-black-on-white.png"),
    )
    p.add_argument("--out", type=Path, default=Path("public/images"))
    p.add_argument("--pad", type=int, default=24)
    args = p.parse_args()
    process(args.src, args.out, args.pad)
    print(f"Wrote {args.out}/k-films-logo-{{black,white}}.png")
