#!/usr/bin/env python3
"""Point internal links at the URLs Cloudflare actually serves.

Workers Static Assets serves every page extensionless and 307-redirects the
.html form, so `href="/pricing.html"` costs a real round trip on every click and
splits the crawl signal across two URLs. This rewrites internal links to the
extensionless form, leaving external, mail, tel and pure-fragment links alone.

A link is only rewritten once the target has been confirmed to exist under
public/ — a typo stays a visible typo rather than being quietly reshaped into a
different broken URL. Idempotent: re-running finds nothing to do.

Usage: python3 scripts/build-links.py [--check]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# href="…", the meta-refresh target, and the inline location.replace() the
# retired stubs use. Each captures a prefix, the path, and a suffix so the
# rewrite can drop back into the same syntax it came from.
PATTERNS = [
    re.compile(r'(href=")([^"]+?\.html(?:[?#][^"]*)?)(")'),
    re.compile(r'(content="\d+;\s*url=)([^"]+?\.html(?:[?#][^"]*)?)(")'),
    re.compile(r'(location\.replace\(")([^"]+?\.html(?:[?#][^"]*)?)("\))'),
    re.compile(r'(location\.href\s*=\s*")([^"]+?\.html(?:[?#][^"]*)?)(")'),
]

SKIP = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|#)", re.I)


def split_path(link: str) -> tuple[str, str]:
    """Separate the path from any ?query or #fragment."""
    cut = min((i for i in (link.find("?"), link.find("#")) if i != -1), default=len(link))
    return link[:cut], link[cut:]


def target_exists(path: str, page: Path) -> bool:
    """Resolve the link the way a browser would, then look for the file."""
    if path.startswith("/"):
        return (PUBLIC / path.lstrip("/")).is_file()
    return (page.parent / path).is_file()


def served_url(path: str) -> str:
    """The extensionless URL Static Assets answers on.

    /wrap-quote/index.html is served at /wrap-quote/ — an index page keeps its
    trailing slash instead of collapsing to the directory's bare name.
    """
    if path.endswith("/index.html"):
        return path[: -len("index.html")]
    if path == "index.html":
        return "./"
    return path[: -len(".html")]


def rewrite(page: Path) -> tuple[str, list[str], list[str]]:
    html = page.read_text()
    changed: list[str] = []
    unresolved: list[str] = []

    def sub(match: re.Match[str]) -> str:
        prefix, link, suffix = match.groups()
        if SKIP.match(link):
            return match.group(0)

        path, tail = split_path(link)
        if not target_exists(path, page):
            unresolved.append(link)
            return match.group(0)

        new = served_url(path) + tail
        changed.append(f"{link} -> {new}")
        return prefix + new + suffix

    for pattern in PATTERNS:
        html = pattern.sub(sub, html)

    return html, changed, unresolved


def main() -> int:
    check = "--check" in sys.argv
    pages = sorted(PUBLIC.rglob("*.html"))
    total = 0
    problems: list[str] = []

    for page in pages:
        rel = page.relative_to(PUBLIC)
        html, changed, unresolved = rewrite(page)

        for link in dict.fromkeys(unresolved):
            problems.append(f"{rel}: {link} has no file under public/")

        if not changed:
            continue

        total += len(changed)
        if check:
            print(f"{str(rel):40s} {len(changed)} link(s) still point at .html")
        else:
            page.write_text(html)
            print(f"{str(rel):40s} {len(changed)} link(s) rewritten")

    for problem in problems:
        print(f"  ! {problem}", file=sys.stderr)

    if check and total:
        print(f"\n{total} internal link(s) would be rewritten — run without --check.")
        return 1

    print(f"\n{total} internal link(s) rewritten across {len(pages)} pages." if total
          else f"\nAll internal links already extensionless ({len(pages)} pages).")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
