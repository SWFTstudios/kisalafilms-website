#!/usr/bin/env python3
"""Turn the KISALA FILMS logo exports into the asset set the site expects.

Both source files are full-colour artwork on a solid black field. Because black
is the matte, the alpha channel can be recovered exactly: a pixel composited
over black is `foreground * alpha`, so dividing the colour back out by its
brightest channel restores the original artwork with a clean transparent edge.

Drop the two exports in public/images/src/ then run:

    python3 scripts/build-brand-assets.py

Wordmark  src/kisala-films-logo-source.png -> brand/kisala-films-logo.png
Round icon src/kisala-films-icon-source.png -> brand/kisala-films-icon.png
                                             + every favicon size the pages link
"""
from __future__ import annotations

import argparse
from pathlib import Path

try:
    from PIL import Image
except ModuleNotFoundError:  # pragma: no cover - dependency hint
    raise SystemExit("Pillow is required: pip install pillow")

# Below this brightness a pixel is indistinguishable from the black matte and
# would only contribute JPEG ringing around the artwork.
NOISE_FLOOR = 10


def unmatte_black(im: Image.Image) -> Image.Image:
    """Recover straight-alpha artwork from a source composited over black."""
    im = im.convert("RGB")
    out = Image.new("RGBA", im.size)
    src = im.load()
    dst = out.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            a = max(r, g, b)
            if a <= NOISE_FLOOR:
                dst[x, y] = (0, 0, 0, 0)
                continue
            scale = 255 / a
            dst[x, y] = (
                min(255, int(r * scale)),
                min(255, int(g * scale)),
                min(255, int(b * scale)),
                a,
            )
    return out


def trim(im: Image.Image, pad: int) -> Image.Image:
    box = im.getbbox()
    if not box:
        raise SystemExit("Source is entirely transparent — is it artwork on black?")
    left, top, right, bottom = box
    w, h = im.size
    return im.crop(
        (max(0, left - pad), max(0, top - pad), min(w, right + pad), min(h, bottom + pad))
    )


def square(im: Image.Image) -> Image.Image:
    """Pad to a centred square so favicons scale without distortion."""
    w, h = im.size
    if w == h:
        return im
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return canvas


def on_black(im: Image.Image) -> Image.Image:
    """Apple touch icons ignore alpha, so flatten onto the brand black."""
    flat = Image.new("RGB", im.size, (0, 0, 0))
    flat.paste(im, mask=im.split()[3])
    return flat


def build_wordmark(src: Path, brand_dir: Path) -> None:
    art = trim(unmatte_black(Image.open(src)), pad=8)
    brand_dir.mkdir(parents=True, exist_ok=True)
    art.save(brand_dir / "kisala-films-logo.png", "PNG", optimize=True)
    art.save(brand_dir / "kisala-films-logo-light.png", "PNG", optimize=True)
    print(f"wordmark {art.size} -> {brand_dir}/kisala-films-logo.png")


def build_icon(src: Path, brand_dir: Path, images_dir: Path) -> None:
    art = square(trim(unmatte_black(Image.open(src)), pad=4))
    brand_dir.mkdir(parents=True, exist_ok=True)
    art.save(brand_dir / "kisala-films-icon.png", "PNG", optimize=True)

    for size, name in ((16, "favicon-16.png"), (32, "favicon-32.png"), (192, "icon-192.png"), (512, "icon-512.png")):
        art.resize((size, size), Image.LANCZOS).save(images_dir / name, "PNG", optimize=True)

    on_black(art.resize((180, 180), Image.LANCZOS)).save(
        images_dir / "apple-touch-icon.png", "PNG", optimize=True
    )
    art.save(
        images_dir / "favicon.ico",
        "ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"icon {art.size} -> {brand_dir}/kisala-films-icon.png + favicons in {images_dir}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--src", type=Path, default=Path("public/images/src"))
    p.add_argument("--brand", type=Path, default=Path("public/images/brand"))
    p.add_argument("--images", type=Path, default=Path("public/images"))
    args = p.parse_args()

    wordmark = args.src / "kisala-films-logo-source.png"
    icon = args.src / "kisala-films-icon-source.png"

    if not wordmark.exists() and not icon.exists():
        raise SystemExit(
            f"Nothing to build. Add {wordmark} and/or {icon}, then re-run."
        )
    if wordmark.exists():
        build_wordmark(wordmark, args.brand)
    if icon.exists():
        build_icon(icon, args.brand, args.images)
