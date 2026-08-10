#!/usr/bin/env python3
"""Sync the header, drawer and footer across every page on the v3 chrome.

The site has no templating layer — the chrome is copy-pasted into each HTML
file — so the only way a six-page nav stays in agreement is to generate it.
This mirrors what build-local-pages.py already does for the city pages: one
page is the source of truth, and the rest are written from it.

`public/index.html` is that source. Everything between

    <!-- CHROME:HEADER start ... -->  ...  <!-- CHROME:HEADER end -->
    <!-- CHROME:FOOTER start ... -->  ...  <!-- CHROME:FOOTER end -->

is copied verbatim into every other page carrying the same markers. Pages
without the markers (the carsy.css pages, the shop and city generators' output)
are left alone.

Run order matters: this has to come before wire-tracking.py, or the CTA labels
minted for index.html get copied onto every other page. The chrome's own CTAs
carry nav-cta / nav-panel-cta / explicit data-track, all of which wire-tracking
skips, so nothing in here picks up a label that names the wrong page.

    python3 scripts/build-v3-chrome.py [--check]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "index.html"

BLOCKS = ("HEADER", "FOOTER")


def block_pattern(name: str) -> re.Pattern[str]:
    return re.compile(
        rf"(<!-- CHROME:{name} start.*?-->)(.*?)(<!-- CHROME:{name} end -->)",
        re.DOTALL,
    )


def read_blocks(html: str, origin: Path) -> dict[str, str]:
    blocks = {}
    for name in BLOCKS:
        match = block_pattern(name).search(html)
        if not match:
            raise SystemExit(f"{origin}: no CHROME:{name} block — cannot sync from it")
        blocks[name] = match.group(2)
    return blocks


def apply_blocks(html: str, blocks: dict[str, str]) -> str:
    for name, body in blocks.items():
        pattern = block_pattern(name)
        if not pattern.search(html):
            continue
        html = pattern.sub(
            lambda m: m.group(1) + body + m.group(3), html, count=1
        )
    return html


def main() -> int:
    check = "--check" in sys.argv
    blocks = read_blocks(SOURCE.read_text(), SOURCE)

    stale = []
    for path in sorted(PUBLIC.rglob("*.html")):
        if path == SOURCE:
            continue
        html = path.read_text()
        if not any(f"<!-- CHROME:{name} start" in html for name in BLOCKS):
            continue

        updated = apply_blocks(html, blocks)
        rel = path.relative_to(PUBLIC)
        if updated == html:
            print(f"{str(rel):28} unchanged")
            continue

        stale.append(str(rel))
        if check:
            print(f"{str(rel):28} STALE")
        else:
            path.write_text(updated)
            print(f"{str(rel):28} synced")

    if check and stale:
        print(f"\n{len(stale)} page(s) out of sync with index.html.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
