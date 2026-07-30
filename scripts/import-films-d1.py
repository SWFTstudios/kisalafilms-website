#!/usr/bin/env python3
"""Import Metro Restyling vinyl colours (+ optional spreadsheet copy) into D1 via Worker API.

Prereqs:
  1. wrangler d1 migrations apply kisalafilms --local   # local
  2. wrangler d1 migrations apply kisalafilms --remote  # production
  3. wrangler secret put FILMS_IMPORT_TOKEN

Usage:
  # Rebuild Metro JSON, then push to local Wrangler (default http://127.0.0.1:8787)
  python3 scripts/import-films-d1.py --local

  # Production
  python3 scripts/import-films-d1.py --url https://kisalafilms-website.elombe.workers.dev \\
    --token "$FILMS_IMPORT_TOKEN"

  # Skip Metro network fetch; use existing vinyl-colors.json
  python3 scripts/import-films-d1.py --local --skip-metro-fetch
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METRO_JSON = ROOT / "public" / "data" / "vinyl-colors.json"
PRODUCTS_CSV = ROOT / "doc" / "spreadsheets" / "vinyl-products.csv"
BUILD_SCRIPT = ROOT / "scripts" / "build-vinyl-catalog.py"


def sku_from_title(title: str) -> str:
    parts = [p.strip() for p in (title or "").split("|") if p.strip()]
    if len(parts) < 2:
        return ""
    return parts[1].split()[0] if parts[1] else ""


def display_name(title: str) -> str:
    raw = (title or "").strip()
    if not raw:
        return ""
    return raw.split("|")[0].strip() or raw


def read_products_csv(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as f:
        text = f.read().lstrip("\ufeff")
    rows = list(csv.DictReader(text.splitlines()))
    out: dict[str, dict[str, str]] = {}
    for r in rows:
        handle = (r.get("handle") or "").strip()
        if handle:
            out[handle] = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
    return out


def build_films(metro: dict, sheet: dict[str, dict[str, str]]) -> list[dict]:
    films = []
    for c in metro.get("colors") or []:
        handle = (c.get("h") or "").strip()
        if not handle:
            continue
        title = c.get("n") or ""
        row = sheet.get(handle) or {}
        films.append(
            {
                "handle": handle,
                "sku": row.get("sku") or sku_from_title(title),
                "name": row.get("name") or display_name(title),
                "brand": row.get("brand") or c.get("v") or "",
                "finish": row.get("finish") or c.get("f") or "",
                "color_family": c.get("c") or "",
                "product_type": c.get("t") or "",
                "collection": c.get("collection") or "",
                "image_url": c.get("i") or "",
                "metro_url": c.get("u") or f"https://metrorestyling.com/products/{handle}",
                "in_stock": bool(c.get("a")),
                "description": row.get("description") or "",
                "install_notes": row.get("install_notes") or "",
                "recommended_for": row.get("recommended_for") or "",
                "notes": row.get("notes") or "",
            }
        )
    return films


def post_import(url: str, token: str, films: list[dict]) -> dict:
    endpoint = url.rstrip("/") + "/api/films/import"
    body = json.dumps({"films": films, "mode": "upsert"}).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "KisalaFilmsD1Import/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true", help="Target http://127.0.0.1:8787")
    parser.add_argument("--url", default="", help="Worker base URL")
    parser.add_argument("--token", default=os.environ.get("FILMS_IMPORT_TOKEN", ""))
    parser.add_argument(
        "--skip-metro-fetch",
        action="store_true",
        help="Use existing public/data/vinyl-colors.json",
    )
    args = parser.parse_args()

    base = args.url.strip()
    if args.local:
        base = base or "http://127.0.0.1:8787"
    if not base:
        parser.error("Pass --local or --url")

    token = args.token.strip()
    if args.local and not token:
        token = "local-dev-token"
        print("Using local-dev-token (set FILMS_IMPORT_TOKEN in .dev.vars for wrangler)")
    if not token:
        parser.error("Pass --token or set FILMS_IMPORT_TOKEN")

    if not args.skip_metro_fetch:
        print("Fetching Metro catalogue…")
        subprocess.check_call([sys.executable, str(BUILD_SCRIPT)], cwd=ROOT)

    if not METRO_JSON.exists():
        raise SystemExit(f"Missing {METRO_JSON} — run build-vinyl-catalog.py first")

    metro = json.loads(METRO_JSON.read_text(encoding="utf-8"))
    sheet = read_products_csv(PRODUCTS_CSV)
    films = build_films(metro, sheet)
    print(f"Prepared {len(films)} films (sheet overlays: {len(sheet)})")
    print(f"POST {base.rstrip('/')}/api/films/import …")

    try:
        result = post_import(base, token, films)
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Import failed HTTP {err.code}: {detail}") from err
    except urllib.error.URLError as err:
        raise SystemExit(
            f"Could not reach {base}. For local, run: npm run dev\n{err}"
        ) from err

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
