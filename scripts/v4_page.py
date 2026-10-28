"""Shared pieces for every page on the v4 design.

There is no templating layer on this site, so v4 pages are generated and the
output is committed, the same way the city pages always have been. This module
holds what every generated page shares: the <head>, the header and footer
(lifted from index.html between its CHROME4 markers, so the home page stays the
one place they are edited), and the few components that repeat page to page.

build-seo.py and build-jsonld.mjs run after the generators and add the
canonical, social and structured-data tags, so none of that is written here.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "index.html"

STYLESHEET = '  <link rel="stylesheet" href="/css/kf.css">'
BOOK_URL = "/book"


def chrome_blocks() -> dict[str, str]:
    html = SOURCE.read_text(encoding="utf-8")
    blocks = {}
    for name in ("HEADER", "FOOTER"):
        match = re.search(
            rf"[ \t]*<!-- CHROME4:{name} start.*?<!-- CHROME4:{name} end -->", html, re.S
        )
        if not match:
            raise SystemExit(f"index.html has no CHROME4:{name} block")
        blocks[name] = match.group(0)
    return blocks


def sync_chrome(html: str, blocks: dict[str, str]) -> str:
    """Replace the CHROME4 blocks in an existing page with the home page's."""
    for name, block in blocks.items():
        html = re.sub(
            rf"[ \t]*<!-- CHROME4:{name} start.*?<!-- CHROME4:{name} end -->",
            lambda _m, b=block: b,
            html,
            count=1,
            flags=re.S,
        )
    return html


def head(title: str, description: str, preload: str | None = None, extra_head: str = "") -> str:
    preload_tag = (
        f'  <link rel="preload" as="image" fetchpriority="high" href="{preload}">\n'
        if preload
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{description}">
  <script>document.documentElement.classList.add("js");</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
  <meta name="theme-color" content="#070707">
  <link rel="icon" href="/images/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/images/favicon-16.png">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
{STYLESHEET}
{extra_head}{preload_tag}  <script src="/js/kisala-config.js"></script>
  <script src="/js/analytics.js"></script>
</head>
<body>

  <a class="skip-link" href="#main">Skip to content</a>

"""


def page(title: str, description: str, body: str, preload: str | None = None,
         extra_head: str = "", scripts: tuple[str, ...] = ()) -> str:
    blocks = chrome_blocks()
    extra_scripts = "".join(f'  <script src="{src}"></script>\n' for src in scripts)
    return (
        head(title, description, preload, extra_head)
        + blocks["HEADER"]
        + "\n\n  <main id=\"main\">\n"
        + body.rstrip()
        + "\n\n  </main>\n\n"
        + blocks["FOOTER"]
        + "\n\n  <script src=\"/js/config-apply.js\"></script>\n"
        + "  <script src=\"/js/kf.js\"></script>\n"
        + extra_scripts
        + "</body>\n</html>\n"
    )


# ---- Components ------------------------------------------------------------

def webp_size(path: Path) -> tuple[int, int] | None:
    """Width and height from a WebP header (lossy, lossless or extended)."""
    b = path.read_bytes()[:32]
    if b[:4] != b"RIFF" or b[8:12] != b"WEBP":
        return None
    chunk = b[12:16]
    if chunk == b"VP8 ":
        return int.from_bytes(b[26:28], "little") & 0x3FFF, int.from_bytes(b[28:30], "little") & 0x3FFF
    if chunk == b"VP8L":
        bits = int.from_bytes(b[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if chunk == b"VP8X":
        return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
    return None


def picture(name: str, alt: str, sizes: str = "100vw", widths=(640, 1280, 1920),
            attrs: str = 'loading="lazy" decoding="async"', img_attrs: str = "") -> str:
    """A <picture> over the repo's -640/-1280/-1920.webp variants.

    `name` is the path without the width suffix, e.g. "/images/refs/ref-01-front-3q".
    Only the widths that exist on disk are listed, and the largest one is the
    <img> fallback, so a deleted variant never turns into a broken image.
    """
    found = [w for w in widths if (PUBLIC / f"{name.lstrip('/')}-{w}.webp").exists()]
    if not found:
        raise SystemExit(f"No webp variants on disk for {name}")
    srcset = ", ".join(f"{name}-{w}.webp {w}w" for w in found)
    fallback = f"{name}-{found[-1]}.webp"
    extra = f" {img_attrs}" if img_attrs else ""
    # Intrinsic size, so the browser reserves the space before the file lands.
    size = webp_size(PUBLIC / fallback.lstrip("/"))
    dims = f' width="{size[0]}" height="{size[1]}"' if size else ""
    return (
        f'<picture><source type="image/webp" srcset="{srcset}" sizes="{sizes}">'
        f'<img src="{fallback}" alt="{alt}"{dims} {attrs}{extra}></picture>'
    )


def crumbs(trail: list[tuple[str, str | None]]) -> str:
    parts = []
    for label, href in trail:
        parts.append(f'<a href="{href}">{label}</a>' if href else f"<span>{label}</span>")
    joined = ' <span aria-hidden="true">/</span> '.join(parts)
    return f'<nav class="crumbs label" aria-label="Breadcrumb">{joined}</nav>'


def mask(lines: list[str], cls: str = "display-l", tag: str = "h1", id_: str = "") -> str:
    id_attr = f' id="{id_}"' if id_ else ""
    inner = "".join(f'<span class="mask-line"><span>{line}</span></span>' for line in lines)
    return f'<{tag} class="{cls}"{id_attr} data-mask>{inner}</{tag}>'


def btn(label: str, href: str = BOOK_URL, solid: bool = True, track: str | None = None) -> str:
    cls = "btn btn--solid" if solid else "btn"
    data = f' data-track="cta_click" data-track-label="{track}"' if track else ""
    return f'<a class="{cls}" href="{href}"{data}>{label} <span class="btn-arrow" aria-hidden="true"></span></a>'


def finale(track: str, kicker: str = "Are you ready to", lines=("ride something", "<em>singular?</em>"),
           image: str = "/images/refs/ref-12-night-motion-1280.webp") -> str:
    return f"""
    <section class="finale" aria-labelledby="finale-title">
      <div class="finale-bg" aria-hidden="true"><img data-parallax src="{image}" alt="" width="1280" height="853" loading="lazy"></div>
      <div class="wrap">
        <p class="label rv">{kicker}</p>
        {mask(list(lines), "display-xl", "h2", "finale-title")}
        <div class="rv">{btn("Start your build", track=track)}</div>
      </div>
    </section>"""
