#!/usr/bin/env python3
"""Turn the KISALA FILMS logo exports into the asset set the site expects.

Both source files are full-colour artwork on a solid black field. Because black
is the matte, the alpha channel can be recovered exactly: a pixel composited
over black is `foreground * alpha`, so dividing the colour back out by its
brightest channel restores the original artwork with a clean transparent edge.

Drop the two exports in public/images/src/ and run:

    python3 scripts/build-brand-assets.py

Names do not matter. The wide export becomes the wordmark, the square one
becomes the icon and every favicon size, and the header markup is updated to
match whatever dimensions came out.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

try:
    from PIL import Image
except ModuleNotFoundError:  # pragma: no cover - dependency hint
    raise SystemExit("Pillow is required: pip install pillow")

# Below this brightness a pixel is indistinguishable from the black matte and
# would only contribute JPEG ringing around the artwork.
NOISE_FLOOR = 10

# Artwork this close to square is the round icon; anything wider is the wordmark.
SQUARE_RATIO = 1.2

SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}

# Superseded exports from the previous mark, still in the tree for reference.
LEGACY = "k-films-"


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
    """Flatten onto the brand black.

    The mark is red and white, drawn to sit on black. Left transparent, the
    white half of it disappears against a light browser tab strip or a light
    home screen, so every favicon keeps the black behind it.
    """
    flat = Image.new("RGB", im.size, (0, 0, 0))
    flat.paste(im, mask=im.split()[3])
    return flat


def classify(src_dir: Path) -> tuple[Path | None, Path | None]:
    """Pick the wordmark and icon out of whatever was dropped in src/."""
    named_word = src_dir / "kisala-films-logo-source.png"
    named_icon = src_dir / "kisala-films-icon-source.png"
    if named_word.exists() or named_icon.exists():
        return (named_word if named_word.exists() else None,
                named_icon if named_icon.exists() else None)

    wordmark = icon = None
    for path in sorted(src_dir.iterdir()):
        if path.suffix.lower() not in SUFFIXES or path.name.startswith(LEGACY):
            continue
        with Image.open(path) as im:
            w, h = im.size
        # Judge by the artwork, not the canvas: a wide logo exported onto a
        # square canvas is still a wordmark.
        art = trim(unmatte_black(Image.open(path)), pad=0)
        ratio = art.size[0] / art.size[1]
        if ratio < SQUARE_RATIO:
            icon = icon or path
        else:
            wordmark = wordmark or path
        print(f"found {path.name} ({w}x{h}, artwork {art.size[0]}x{art.size[1]}, "
              f"ratio {ratio:.2f}) -> {'icon' if ratio < SQUARE_RATIO else 'wordmark'}")
    return wordmark, icon


def sync_markup(root: Path, size: tuple[int, int]) -> int:
    """Point every <img> at the wordmark's real dimensions.

    The attributes only reserve space — CSS sizes the logo by height — but a
    stale ratio shifts the header on first paint.
    """
    w, h = size
    pattern = re.compile(
        r'(src="/images/brand/kisala-films-logo\.png"(?:(?!>).)*?)'
        r'width="\d+"\s+height="\d+"'
    )
    touched = 0
    targets = list(root.rglob("*.html")) + list((root / "js").glob("*.js"))
    for path in sorted(targets):
        if not path.is_file():
            continue
        text = path.read_text()
        new = pattern.sub(rf'\1width="{w}" height="{h}"', text)
        if new != text:
            path.write_text(new)
            touched += 1
    return touched


def build_wordmark(src: Path, brand_dir: Path, public: Path) -> None:
    art = trim(unmatte_black(Image.open(src)), pad=8)
    brand_dir.mkdir(parents=True, exist_ok=True)
    out = brand_dir / "kisala-films-logo.png"
    art.save(out, "PNG", optimize=True)
    touched = sync_markup(public, art.size)
    print(f"wordmark {art.size[0]}x{art.size[1]} -> {out} ({touched} pages resized)")


def build_icon(src: Path, brand_dir: Path, images_dir: Path) -> None:
    art = square(trim(unmatte_black(Image.open(src)), pad=4))
    brand_dir.mkdir(parents=True, exist_ok=True)
    # The large icon keeps its alpha — it only ever sits on the site's own black.
    art.save(brand_dir / "kisala-films-icon.png", "PNG", optimize=True)

    for size, name in ((16, "favicon-16.png"), (32, "favicon-32.png"),
                       (180, "apple-touch-icon.png"), (192, "icon-192.png"),
                       (512, "icon-512.png")):
        on_black(art.resize((size, size), Image.LANCZOS)).save(
            images_dir / name, "PNG", optimize=True
        )

    on_black(art).save(images_dir / "favicon.ico", "ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"icon {art.size[0]}x{art.size[1]} -> {brand_dir}/kisala-films-icon.png "
          f"+ 6 favicons in {images_dir}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--src", type=Path, default=Path("public/images/src"))
    p.add_argument("--brand", type=Path, default=Path("public/images/brand"))
    p.add_argument("--images", type=Path, default=Path("public/images"))
    p.add_argument("--public", type=Path, default=Path("public"))
    args = p.parse_args()

    if not args.src.is_dir():
        raise SystemExit(f"No source directory at {args.src}")

    wordmark, icon = classify(args.src)
    if not wordmark and not icon:
        raise SystemExit(
            f"Nothing to build. Drop the two logo exports in {args.src} and re-run."
        )
    if wordmark:
        build_wordmark(wordmark, args.brand, args.public)
    if icon:
        build_icon(icon, args.brand, args.images)
    if not wordmark:
        print("no wide export found — wordmark left unchanged")
    if not icon:
        print("no square export found — favicons left unchanged")
