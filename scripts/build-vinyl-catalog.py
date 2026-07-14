#!/usr/bin/env python3
"""Build public/data/vinyl-colors.json from Metro Restyling Shopify collections.

Uses the public products.json Ajax API (no auth). Camo Roll / Sample Book SKUs
are excluded by default so the customer picker stays color-first. To include
camo later, add "Camo Roll" to INCLUDE_TYPES.

Usage:
  python3 scripts/build-vinyl-catalog.py
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "vinyl-colors.json"

BASE = "https://metrorestyling.com"
COLLECTIONS = [
    "all-vinyl-wrap",
    "brake-caliper-wrap",
    "light-wrap-film",
    "paint-protection-film",
]

# Keep these product_type values; drop Camo Roll / Sample Book.
INCLUDE_TYPES = {
    "Vinyl",
    "Colored PPF Wrap",
    "Brake Caliper",
    "Light Wrap",
    "PPF",
}

# Longer phrases first so "Super Gloss" wins over "Gloss".
FINISH_KEYWORDS = [
    "Super Gloss",
    "Ultra Matte",
    "Color Shift",
    "Pearlescent",
    "Reflective",
    "Metallic",
    "Textured",
    "Brushed",
    "Diamond",
    "Glitter",
    "Chrome",
    "Candy",
    "Satin",
    "Matte",
    "Gloss",
    "Neon",
    "Shift",
]

PAGE_SIZE = 50
MAX_RETRIES = 4
USER_AGENT = "KisalaFilmsVinylSync/1.0 (+https://kisalafilms.com)"


def fetch_json(url: str) -> dict:
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as err:
            last_err = err
            sleep_s = 1.5 * (2**attempt)
            print(f"  retry {attempt + 1}/{MAX_RETRIES} after {err} (sleep {sleep_s:.1f}s)")
            time.sleep(sleep_s)
    raise RuntimeError(f"Failed to fetch {url}: {last_err}")


def parse_finish(title: str) -> str:
    lower = title.lower()
    for keyword in FINISH_KEYWORDS:
        if keyword.lower() in lower:
            return keyword
    return ""


def product_url(handle: str) -> str:
    return f"{BASE}/products/{handle}"


def first_image(product: dict) -> str:
    images = product.get("images") or []
    if not images:
        return ""
    return images[0].get("src") or ""


def fetch_collection(handle: str) -> list[dict]:
    products: list[dict] = []
    page = 1
    print(f"Fetching collection/{handle} …")
    while True:
        url = (
            f"{BASE}/collections/{handle}/products.json"
            f"?limit={PAGE_SIZE}&page={page}"
        )
        data = fetch_json(url)
        batch = data.get("products") or []
        if not batch:
            break
        products.extend(batch)
        print(f"  page {page}: +{len(batch)} (total {len(products)})")
        if len(batch) < PAGE_SIZE:
            break
        page += 1
        time.sleep(0.15)
    return products


def compact_color(product: dict) -> dict:
    handle = product["handle"]
    return {
        "id": product["id"],
        "n": product["title"],
        "v": product.get("vendor") or "",
        "t": product.get("product_type") or "",
        "f": parse_finish(product["title"]),
        "h": handle,
        "u": product_url(handle),
        "i": first_image(product),
    }


def main() -> None:
    by_id: dict[int, dict] = {}
    for handle in COLLECTIONS:
        for product in fetch_collection(handle):
            pid = product.get("id")
            if pid is None:
                continue
            ptype = product.get("product_type") or ""
            if ptype not in INCLUDE_TYPES:
                continue
            by_id[pid] = compact_color(product)

    colors = sorted(by_id.values(), key=lambda c: (c["n"].lower(), c["id"]))
    finishes = sorted({c["f"] for c in colors if c["f"]})
    vendors = sorted({c["v"] for c in colors if c["v"]})

    payload = {
        "source": "Metro Restyling Shopify collections",
        "syncedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "productCount": len(colors),
        "collections": list(COLLECTIONS),
        "includeTypes": sorted(INCLUDE_TYPES),
        "excludeNote": (
            "Camo Roll and Sample Book SKUs are omitted. "
            "Add them to INCLUDE_TYPES in scripts/build-vinyl-catalog.py to include."
        ),
        "finishes": finishes,
        "vendors": vendors,
        "colors": colors,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(colors)} colors → {OUT.relative_to(ROOT)}")
    print(f"Vendors: {len(vendors)} | Finishes: {len(finishes)}")


if __name__ == "__main__":
    main()
