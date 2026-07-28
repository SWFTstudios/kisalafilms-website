#!/usr/bin/env python3
"""Add data-track to the primary CTAs that don't have it yet.

analytics.js reports any click on a [data-track] element, so a CTA without the
attribute is simply invisible in GA4. The nav and drawer buttons are skipped on
purpose: they appear identically on every page, so tracking them by page label
tells you nothing you can act on. Form submit buttons are skipped too — the
studio and the wizard report their own submits with the build context attached.

Idempotent. Run it after adding a call to action.

Usage:
  python3 scripts/wire-tracking.py
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

SKIP_CLASSES = ("nav-cta", "nav-panel-cta")
SKIP_FILES = {"styleguide.html", "wrap-quote/index.html"}

CTA = re.compile(r'<a\s+class="btn btn-(primary|secondary|black|ghost)"([^>]*)>', re.I)


def label_for(rel: str) -> str:
    """Page slug, so a CTA reports where it was clicked from."""
    stem = rel.replace(".html", "").replace("index", "home").replace("/", "-")
    return stem or "home"


def wire(path: Path) -> str:
    rel = path.relative_to(PUBLIC).as_posix()
    if rel in SKIP_FILES:
        return "skipped"

    html = path.read_text(encoding="utf-8")
    if "http-equiv" in html and 'content="0;' in html.replace("'", '"'):
        return "skipped (redirect stub)"

    page = label_for(rel)
    added = 0

    def replace(match: re.Match) -> str:
        nonlocal added
        whole = match.group(0)
        attrs = match.group(2)
        if "data-track" in attrs or any(c in attrs for c in SKIP_CLASSES):
            return whole

        href = re.search(r'href="([^"]*)"', attrs)
        target = (href.group(1) if href else "").strip("/").replace(".html", "") or "home"
        target = target.split("#")[0].replace("/", "-") or "home"

        added += 1
        return whole[:-1] + f' data-track="cta_click" data-track-label="{page}-to-{target}">'

    total = len(CTA.findall(html))
    html = CTA.sub(replace, html)
    if not added:
        return "already wired" if total else "no CTAs"

    path.write_text(html, encoding="utf-8")
    return f"added {added}"


def main() -> None:
    for path in sorted(PUBLIC.rglob("*.html")):
        print(f"{path.relative_to(PUBLIC).as_posix():36} {wire(path)}")


if __name__ == "__main__":
    main()
