#!/usr/bin/env python3
"""Emit responsive WebP variants for the photography the pages actually use.

The design leans on large dark photographs, so the source JPEGs are 1920px and
300–500KB each. Serving those to a phone is the single biggest thing that would
sink Core Web Vitals here, so every photo referenced from a <picture> gets cut
to a set of widths and re-encoded as WebP.

Naming is what the markup expects:

    public/images/refs/ref-12-night-motion.jpg
      -> public/images/refs/ref-12-night-motion-640.webp
      -> public/images/refs/ref-12-night-motion-1280.webp
      -> public/images/refs/ref-12-night-motion-1920.webp

Idempotent: a variant already newer than its source is left alone, so re-running
is cheap and prints `unchanged`.

    pip install pillow
    python3 scripts/build-image-variants.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "public" / "images"

WIDTHS = (640, 1280, 1920)
QUALITY = 72

# Only the photographs the v3 pages reference. Adding a photo to a page means
# adding it here, then re-running.
SOURCES = [
    "refs/ref-01-front-3q.jpg",
    "refs/ref-02-left-profile.jpg",
    "refs/ref-03-right-profile.jpg",
    "refs/ref-04-rear-3q.jpg",
    "refs/ref-05-head-on.jpg",
    "refs/ref-06-rear-straight.jpg",
    "refs/ref-07-low-nose.jpg",
    "refs/ref-08-overhead-3q.jpg",
    "refs/ref-09-headlight-detail.jpg",
    "refs/ref-10-tank-cockpit.jpg",
    "refs/ref-11-wheel-brake.jpg",
    "refs/ref-12-night-motion.jpg",
    "hero-f4i-garage-night.jpg",
    "story-elombe-workshop.jpg",
    "about-vinyl-hands.jpg",
    "thumb-wrap-process.jpg",
    "thumb-before-strip.jpg",
    "thumb-transformation-mid.jpg",
    "thumb-panel-lines.jpg",
    "thumb-shop-bts.jpg",
]


def variants_for(source: Path) -> list[tuple[Path, int]]:
    with Image.open(source) as im:
        native = im.width
    # Never upscale: a 1280-wide source has no honest 1920 variant.
    widths = [w for w in WIDTHS if w < native] + [min(native, max(WIDTHS))]
    return [(source.with_name(f"{source.stem}-{w}.webp"), w) for w in sorted(set(widths))]


def build(source: Path) -> int:
    written = 0
    for target, width in variants_for(source):
        if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
            continue
        with Image.open(source) as im:
            im = im.convert("RGB")
            height = round(im.height * width / im.width)
            im.resize((width, height), Image.LANCZOS).save(
                target, "WEBP", quality=QUALITY, method=6
            )
        written += 1
    return written


def main() -> int:
    missing = [rel for rel in SOURCES if not (IMAGES / rel).exists()]
    if missing:
        print("Missing sources:\n  " + "\n  ".join(missing), file=sys.stderr)
        return 1

    total = 0
    for rel in SOURCES:
        written = build(IMAGES / rel)
        total += written
        print(f"{rel:38} {'wrote ' + str(written) if written else 'unchanged'}")

    print(f"\n{total} variant(s) written across {len(SOURCES)} source image(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
