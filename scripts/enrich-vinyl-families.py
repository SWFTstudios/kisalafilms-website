#!/usr/bin/env python3
"""Backfill colour families onto the committed vinyl catalogue.

Reads public/data/vinyl-colors.json, derives a family for every record, and
writes it back with a "c" field per colour plus a top-level "colorFamilies"
list. Needs no network, so it runs after editing the keyword rules in
vinyl_families.py without re-syncing 1,100 products from Metro.

build-vinyl-catalog.py applies the same rules on a fresh sync, so this is only
for the case where the rules changed and the feed did not.

Usage:
  python3 scripts/enrich-vinyl-families.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vinyl_families import family_for, family_payload  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public" / "data" / "vinyl-colors.json"


def main() -> None:
    if not CATALOG.exists():
        raise SystemExit(f"{CATALOG.relative_to(ROOT)} not found — run build-vinyl-catalog.py first")

    payload = json.loads(CATALOG.read_text(encoding="utf-8"))
    colors = payload.get("colors") or []
    if not colors:
        raise SystemExit("No colors in the catalogue — nothing to enrich")

    counts: Counter[str] = Counter()
    for color in colors:
        color["c"] = family_for(color.get("n") or "")
        counts[color["c"]] += 1

    families = family_payload()
    # Only ship the families that actually matched something, so the filter row
    # never offers a chip that returns nothing.
    payload["colorFamilies"] = [f for f in families if counts[f["id"]]]

    CATALOG.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Enriched {len(colors)} colors → {CATALOG.relative_to(ROOT)}")
    for family in payload["colorFamilies"]:
        print(f"  {family['label']:22} {counts[family['id']]:>5}")
    missing = counts["other"]
    if missing:
        share = missing / len(colors) * 100
        print(f"\n{missing} ({share:.1f}%) fell through to \"Other & specialty\".")
        if share > 15:
            print("That is high — check the keyword rules in scripts/vinyl_families.py.")


if __name__ == "__main__":
    main()
