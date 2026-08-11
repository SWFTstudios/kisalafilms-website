#!/usr/bin/env python3
"""Move one page from the carsy chrome onto the v3 chrome.

The header, drawer and footer are the same on every page, so swapping them by
hand fourteen times is fourteen chances to leave a page behind. This does the
mechanical half: stylesheet, fonts, body class, skip link, a <main> landmark,
and the CHROME markers that build-v3-chrome.py then fills from index.html.

It deliberately does not touch the page's own content. Carsy markup (.container,
.section, .book-grid) has no equivalent in kfilms.css, so every page still needs
its body rewritten by hand afterwards — this just removes the boilerplate from
that job.

    python3 scripts/adopt-v3.py public/contact.html [...]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

FONTS = (
    '  <link href="https://fonts.googleapis.com/css2?'
    "family=Barlow+Condensed:wght@400;600;700;800;900&family=Inter:wght@400;500;600"
    '&display=swap" rel="stylesheet">'
)

HEADER_MARKERS = (
    "  <!-- CHROME:HEADER start — synced by scripts/build-v3-chrome.py, edit index.html -->\n"
    "  <!-- CHROME:HEADER end -->"
)
FOOTER_MARKERS = (
    "  <!-- CHROME:FOOTER start — synced by scripts/build-v3-chrome.py, edit index.html -->\n"
    "  <!-- CHROME:FOOTER end -->"
)

SKIP = '  <a class="skip-link" href="#main">Skip to content</a>'


def convert(html: str) -> str:
    html = html.replace('/css/carsy.css', '/css/kfilms.css')
    html = re.sub(
        r'  <link href="https://fonts\.googleapis\.com/css2\?[^"]*" rel="stylesheet">',
        FONTS,
        html,
    )
    html = html.replace('<meta name="theme-color" content="#000000">',
                        '<meta name="theme-color" content="#050505">')
    html = html.replace('<body class="carsy">', '<body class="kfilms">')

    # Header through the mobile drawer is one contiguous block on every carsy
    # page, so one substitution retires all of it.
    html = re.sub(
        r'  <header class="site-header">.*?</aside>',
        HEADER_MARKERS,
        html,
        count=1,
        flags=re.DOTALL,
    )
    html = re.sub(
        r'  <footer class="site-footer">.*?</footer>',
        FOOTER_MARKERS,
        html,
        count=1,
        flags=re.DOTALL,
    )

    if SKIP not in html:
        html = html.replace('<body class="kfilms">\n', f'<body class="kfilms">\n\n{SKIP}\n', 1)

    # Carsy pages hang their sections straight off <body> with no landmark, so
    # "skip to content" has nothing to skip to. Everything between the chrome
    # blocks is the content, by definition.
    #
    # .page-hero already carries the fixed header's height in its top padding,
    # so only a page that opens on something else needs kf-main-offset.
    if "<main" not in html:
        opens_on_hero = re.search(
            r'CHROME:HEADER end -->\s*<section class="page-hero"', html
        )
        cls = "" if opens_on_hero else ' class="kf-main-offset"'
        html = html.replace(
            "  <!-- CHROME:HEADER end -->\n",
            f'  <!-- CHROME:HEADER end -->\n\n  <main id="main"{cls}>\n',
            1,
        )
        html = html.replace(
            "  <!-- CHROME:FOOTER start",
            "  </main>\n\n  <!-- CHROME:FOOTER start",
            1,
        )

    return html


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        print(__doc__)
        return 1
    for path in paths:
        before = path.read_text()
        after = convert(before)
        path.write_text(after)
        print(f"{path}: {'converted' if after != before else 'no change'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
