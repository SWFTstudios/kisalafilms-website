#!/usr/bin/env python3
"""Knock out solid backgrounds from K Films logo sources; emit solid black/white PNGs with alpha.

Supports:
  - white-background sources (flat black mark)
  - black-background sources (metallic mark) — luminance becomes the alpha mask
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def detect_bg(im: Image.Image) -> str:
    """Guess whether the backdrop is light or dark from corner samples."""
    w, h = im.size
    samples = [
        im.getpixel((2, 2)),
        im.getpixel((w - 3, 2)),
        im.getpixel((2, h - 3)),
        im.getpixel((w - 3, h - 3)),
    ]
    avg = sum(sum(p[:3]) / 3 for p in samples) / len(samples)
    return "dark" if avg < 80 else "light"


def alpha_from_light_bg(im: Image.Image) -> Image.Image:
    """Near-white -> transparent; dark ink -> opaque."""
    w, h = im.size
    pixels = im.load()
    alpha = Image.new("L", (w, h), 0)
    ap = alpha.load()
    t0, t1 = 200.0, 248.0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            L = 0.299 * r + 0.587 * g + 0.114 * b
            if L >= t1:
                a = 0
            else:
                a = int(max(0.0, min(1.0, (t1 - L) / (t1 - t0))) * 255)
            ap[x, y] = a
    return alpha


def alpha_from_dark_bg(im: Image.Image) -> Image.Image:
    """Near-black -> transparent; bright metallic strokes -> opaque."""
    w, h = im.size
    pixels = im.load()
    alpha = Image.new("L", (w, h), 0)
    ap = alpha.load()
    t0, t1 = 12.0, 55.0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            L = 0.299 * r + 0.587 * g + 0.114 * b
            if L <= t0:
                a = 0
            else:
                a = int(max(0.0, min(1.0, (L - t0) / (t1 - t0))) * 255)
            ap[x, y] = a
    return alpha


def content_box(alpha: Image.Image, pad: int) -> tuple[int, int, int, int]:
    w, h = alpha.size
    ap = alpha.load()
    min_x, min_y, max_x, max_y = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            if ap[x, y] > 8:
                found = True
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y
    if not found:
        raise SystemExit("No logo pixels found — check the source image")
    return (
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(w, max_x + 1 + pad),
        min(h, max_y + 1 + pad),
    )


def solid(mask: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    base = Image.new("RGBA", mask.size, (*rgb, 255))
    base.putalpha(mask)
    return base


def process(src: Path, out_dir: Path, pad: int = 24, bg: str | None = None) -> None:
    im = Image.open(src).convert("RGBA")
    mode = bg or detect_bg(im)
    alpha = alpha_from_dark_bg(im) if mode == "dark" else alpha_from_light_bg(im)
    mask = alpha.crop(content_box(alpha, pad))
    out_dir.mkdir(parents=True, exist_ok=True)
    solid(mask, (0, 0, 0)).save(out_dir / "k-films-logo-black.png", "PNG", optimize=True)
    solid(mask, (255, 255, 255)).save(out_dir / "k-films-logo-white.png", "PNG", optimize=True)
    print(f"bg={mode} size={mask.size} -> {out_dir}/k-films-logo-{{black,white}}.png")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "src",
        type=Path,
        nargs="?",
        default=Path("public/images/src/k-films-logo-source-on-white.png"),
    )
    p.add_argument("--out", type=Path, default=Path("public/images"))
    p.add_argument("--pad", type=int, default=24)
    p.add_argument("--bg", choices=("light", "dark"), default=None)
    args = p.parse_args()
    if not args.src.exists():
        raise SystemExit(
            f"Missing source: {args.src}\n"
            "Add your logo file under public/images/src/ then re-run."
        )
    process(args.src, args.out, args.pad, args.bg)
