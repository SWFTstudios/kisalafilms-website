#!/usr/bin/env python3
"""Build public/data/vinylfrog-colors.json from Vinyl Frog's Shopify catalog.

Uses the public products.json Ajax API (no auth). Prices are stored in cents→USD
from the first available variant so the owner-only quote estimator can compare
Metro vs Vinyl Frog without a live fetch on every match.

Usage:
  python3 scripts/build-vinylfrog-catalog.py
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vinyl_families import family_for, family_payload  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "vinylfrog-colors.json"

BASE = "https://www.vinylfrog.com"
VENDOR_LABEL = "Vinyl Frog"

# Skip accessories / tools / sample books by product_type when present.
EXCLUDE_TYPE_KEYWORDS = (
    "tool",
    "sample",
    "squeegee",
    "knife",
    "magnet",
    "glove",
    "bundle",
    "gift",
    "t-shirt",
    "tshirt",
)

FINISH_KEYWORDS = [
    "Super Gloss",
    "Ultra Gloss",
    "High Glossy",
    "Ultra Matte",
    "Super Matt",
    "Color Shift",
    "Colour Shift",
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
    "Matt",
    "Gloss",
    "Neon",
    "Shift",
]

PAGE_SIZE = 50
MAX_RETRIES = 4
USER_AGENT = "KisalaFilmsVinylFrogSync/1.0 (+https://kisalafilms-website.elombe.workers.dev)"


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
            # Normalise Vinyl Frog spellings to Metro-ish families.
            if keyword in ("Matt", "Super Matt", "Ultra Matte"):
                return "Matte"
            if keyword in ("Ultra Gloss", "High Glossy", "Super Gloss"):
                return "Gloss"
            if keyword == "Colour Shift":
                return "Color Shift"
            return keyword
    return ""


def product_url(handle: str) -> str:
    return f"{BASE}/products/{handle}"


def first_image(product: dict) -> str:
    images = product.get("images") or []
    if not images:
        return ""
    return images[0].get("src") or ""


def is_available(product: dict) -> bool:
    variants = product.get("variants") or []
    if not variants:
        return False
    return any(bool(v.get("available")) for v in variants)


def parse_price_usd(product: dict) -> float | None:
    """First positive variant price. Shopify products.json uses dollar strings."""
    for variant in product.get("variants") or []:
        raw = variant.get("price")
        if raw is None or raw == "":
            continue
        try:
            n = float(str(raw).replace(",", "").replace("$", ""))
        except ValueError:
            continue
        if n > 0:
            return round(n, 2)
    return None


def skip_product(product: dict) -> bool:
    ptype = (product.get("product_type") or "").lower()
    title = (product.get("title") or "").lower()
    for kw in EXCLUDE_TYPE_KEYWORDS:
        if kw in ptype or kw in title:
            return True
    # Kits / multi-roll sets skew the per-roll comparison.
    if " set " in f" {title} " or title.endswith(" set") or " ppf set" in title:
        return True
    return False


def fetch_all_products() -> list[dict]:
    products: list[dict] = []
    page = 1
    print("Fetching vinylfrog.com/products.json …")
    while True:
        url = f"{BASE}/products.json?limit={PAGE_SIZE}&page={page}"
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
    title = product["title"]
    price = parse_price_usd(product)
    return {
        "id": product["id"],
        "n": title,
        "v": VENDOR_LABEL,
        "t": product.get("product_type") or "",
        "f": parse_finish(title),
        "c": family_for(title),
        "h": handle,
        "u": product_url(handle),
        "i": first_image(product),
        "a": is_available(product),
        "p": price,
        "vendor_source": "vinylfrog",
    }


def main() -> None:
    by_id: dict[int, dict] = {}
    for product in fetch_all_products():
        pid = product.get("id")
        if pid is None or skip_product(product):
            continue
        by_id[pid] = compact_color(product)

    colors = sorted(by_id.values(), key=lambda c: (c["n"].lower(), c["id"]))
    finishes = sorted({c["f"] for c in colors if c["f"]})
    vendors = sorted({c["v"] for c in colors if c["v"]})
    in_stock = sum(1 for c in colors if c.get("a"))
    priced = sum(1 for c in colors if c.get("p"))

    family_counts = Counter(c["c"] for c in colors)
    families = [f for f in family_payload() if family_counts[f["id"]]]

    payload = {
        "source": "Vinyl Frog Shopify products.json",
        "syncedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "productCount": len(colors),
        "inStockCount": in_stock,
        "outOfStockCount": len(colors) - in_stock,
        "pricedCount": priced,
        "finishes": finishes,
        "vendors": vendors,
        "colorFamilies": families,
        "colors": colors,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(colors)} colors → {OUT.relative_to(ROOT)}")
    print(
        f"Finishes: {len(finishes)} | Families: {len(families)} | "
        f"In stock: {in_stock} | Priced: {priced}"
    )


if __name__ == "__main__":
    main()
