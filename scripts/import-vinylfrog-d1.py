#!/usr/bin/env python3
"""Import Vinyl Frog catalogue (+ roll prices) into D1 via Worker API.

Prereqs:
  wrangler d1 migrations apply kisalafilms --local|--remote
  FILMS_IMPORT_TOKEN set (or --local uses local-dev-token)

Usage:
  python3 scripts/import-vinylfrog-d1.py --local
  python3 scripts/import-vinylfrog-d1.py --url https://kisalafilms-website.elombe.workers.dev \\
    --token "$FILMS_IMPORT_TOKEN"
  python3 scripts/import-vinylfrog-d1.py --local --skip-fetch
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VF_JSON = ROOT / "public" / "data" / "vinylfrog-colors.json"
BUILD_SCRIPT = ROOT / "scripts" / "build-vinylfrog-catalog.py"


def display_name(title: str) -> str:
    raw = (title or "").strip()
    return raw.split("|")[0].strip() or raw


def build_films(payload: dict) -> list[dict]:
    synced = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    films = []
    for c in payload.get("colors") or []:
        handle = (c.get("h") or "").strip()
        if not handle:
            continue
        title = c.get("n") or ""
        price = c.get("p")
        price_usd = float(price) if isinstance(price, (int, float)) and price > 0 else None
        films.append(
            {
                "handle": handle,
                "sku": "",
                "name": display_name(title),
                "brand": c.get("v") or "Vinyl Frog",
                "finish": c.get("f") or "",
                "color_family": c.get("c") or "",
                "product_type": c.get("t") or "",
                "collection": "",
                "image_url": c.get("i") or "",
                "metro_url": c.get("u") or f"https://www.vinylfrog.com/products/{handle}",
                "in_stock": bool(c.get("a")),
                "description": "",
                "install_notes": "",
                "recommended_for": "",
                "notes": "",
                "price_usd": price_usd,
                "roll_price_usd": price_usd,
                "price_synced_at": synced if price_usd is not None else "",
                "source": "vinylfrog",
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
            "User-Agent": "KisalaFilmsVinylFrogImport/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--url", default="")
    parser.add_argument("--token", default=os.environ.get("FILMS_IMPORT_TOKEN", ""))
    parser.add_argument(
        "--skip-fetch",
        action="store_true",
        help="Use existing public/data/vinylfrog-colors.json",
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
        print("Using local-dev-token")
    if not token:
        parser.error("Pass --token or set FILMS_IMPORT_TOKEN")

    if not args.skip_fetch:
        print("Fetching Vinyl Frog catalogue…")
        subprocess.check_call([sys.executable, str(BUILD_SCRIPT)], cwd=ROOT)

    if not VF_JSON.exists():
        raise SystemExit(f"Missing {VF_JSON} — run build-vinylfrog-catalog.py first")

    payload = json.loads(VF_JSON.read_text(encoding="utf-8"))
    films = build_films(payload)
    print(f"Prepared {len(films)} Vinyl Frog films")
    print(f"POST {base.rstrip('/')}/api/films/import …")

    try:
        result = post_import(base, token, films)
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Import failed HTTP {err.code}: {detail}") from err
    except urllib.error.URLError as err:
        raise SystemExit(f"Could not reach {base}.\n{err}") from err

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
