#!/usr/bin/env python3
"""One-shot: wire the shared config / analytics / hydration scripts into every page.

Chrome is duplicated per page rather than templated, so this walks the HTML and
inserts the three tags in the only order that works:

  <head>  kisala-config.js   synchronous, defines the numbers
  <head>  analytics.js       registers gtag + the delegated click layer
  </body> config-apply.js    FIRST of the body scripts, so it writes the price
                             attributes before wrap-studio.js reads them

Idempotent — running it twice changes nothing. Kept in the repo because the same
insertion has to be repeated by hand on any new page.

Usage:
  python3 scripts/wire-scripts.py
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

HEAD_TAGS = (
    '  <script src="/js/kisala-config.js"></script>\n'
    '  <script src="/js/analytics.js"></script>\n'
)
BODY_TAG = '  <script src="/js/config-apply.js"></script>\n'

# /wrap-quote/ forks its own stylesheet and used to inline its own gtag, so it
# was skipped here. Its GA4 tag now comes from analytics.js like everywhere else,
# and it quotes prices — which without config-apply.js were never hydrated, so it
# would have gone on advertising the founding rate after a switch to standard.
# It is wired like any other page; only the redirect stubs are skipped.

STYLESHEET = '  <link rel="stylesheet" href="/css/carsy.css">\n'


def is_redirect_stub(html: str) -> bool:
    return "http-equiv" in html and 'content="0;' in html.replace("'", '"')


def wire(path: Path) -> str:
    html = path.read_text(encoding="utf-8")
    if is_redirect_stub(html):
        return "skipped (redirect stub)"

    changed = False

    if "/js/kisala-config.js" not in html:
        if STYLESHEET in html:
            html = html.replace(STYLESHEET, STYLESHEET + HEAD_TAGS, 1)
        elif "</head>" in html:
            html = html.replace("</head>", HEAD_TAGS + "</head>", 1)
        else:
            return "FAILED (no <head>)"
        changed = True

    if "/js/config-apply.js" not in html:
        marker = '  <script src="/js/nav.js"></script>\n'
        if marker in html:
            html = html.replace(marker, BODY_TAG + marker, 1)
        elif "</body>" in html:
            html = html.replace("</body>", BODY_TAG + "</body>", 1)
        else:
            return "FAILED (no </body>)"
        changed = True

    # Successive rounds of strip-and-reinsert left a run of blank lines between
    # the stylesheet and these scripts. Harmless, but it is dead space in the
    # <head> of all 28 pages. Collapsing it here is idempotent: once the run is
    # gone there is nothing left to match.
    tidied = re.sub(
        r'\n(?:[ \t]*\n)+(?=[ \t]*<script src="/js/kisala-config\.js">)',
        "\n",
        html,
    )
    if tidied != html:
        html = tidied
        changed = True

    if changed:
        path.write_text(html, encoding="utf-8")
        return "wired"
    return "already wired"


def main() -> None:
    for path in sorted(PUBLIC.rglob("*.html")):
        print(f"{path.relative_to(PUBLIC).as_posix():34} {wire(path)}")


if __name__ == "__main__":
    main()
