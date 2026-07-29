#!/usr/bin/env python3
"""Sync doc/spreadsheets/*.csv → public/data/ and seed vinyl-products.csv.

- Copies every CSV from doc/spreadsheets into public/data for the static site.
- Ensures vinyl-products.csv has a row for every Metro handle in
  vinyl-colors.json without wiping description / notes you already filled.

Usage:
  python3 scripts/sync-doc-spreadsheets.py
"""

from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC_SHEETS = ROOT / "doc" / "spreadsheets"
PUBLIC_DATA = ROOT / "public" / "data"
METRO = PUBLIC_DATA / "vinyl-colors.json"
PRODUCTS_NAME = "vinyl-products.csv"

PRODUCT_FIELDS = [
    "handle",
    "sku",
    "name",
    "brand",
    "finish",
    "description",
    "install_notes",
    "recommended_for",
    "notes",
]


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


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        text = f.read().lstrip("\ufeff")
    rows = list(csv.DictReader(text.splitlines()))
    return [{(k or "").strip(): (v or "").strip() for k, v in r.items()} for r in rows]


def write_csv(path: Path, rows: list[dict[str, str]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fields})


def seed_vinyl_products(doc_path: Path) -> tuple[int, int]:
    if not METRO.exists():
        print(f"Skip seed: {METRO.relative_to(ROOT)} missing — run build-vinyl-catalog.py first")
        if not doc_path.exists():
            write_csv(doc_path, [], PRODUCT_FIELDS)
        return (0, 0)

    metro = json.loads(METRO.read_text(encoding="utf-8"))
    colors = metro.get("colors") or []
    existing = {r.get("handle", ""): r for r in read_csv(doc_path) if r.get("handle")}

    added = 0
    for c in colors:
        handle = (c.get("h") or "").strip()
        if not handle:
            continue
        if handle in existing:
            # Keep filled cells; backfill empty sku/brand/finish/name from Metro
            row = existing[handle]
            title = c.get("n") or ""
            if not row.get("sku"):
                row["sku"] = sku_from_title(title)
            if not row.get("name"):
                row["name"] = display_name(title)
            if not row.get("brand"):
                row["brand"] = c.get("v") or ""
            if not row.get("finish"):
                row["finish"] = c.get("f") or ""
            continue

        title = c.get("n") or ""
        existing[handle] = {
            "handle": handle,
            "sku": sku_from_title(title),
            "name": display_name(title),
            "brand": c.get("v") or "",
            "finish": c.get("f") or "",
            "description": "",
            "install_notes": "",
            "recommended_for": "",
            "notes": "",
        }
        added += 1

    # Stable order matching Metro name sort
    order = [(c.get("h") or "") for c in colors if c.get("h")]
    rows = [existing[h] for h in order if h in existing]
    # Any orphan spreadsheet rows (handles removed from Metro) stay at the end
    orphans = [r for h, r in existing.items() if h not in set(order)]
    rows.extend(sorted(orphans, key=lambda r: (r.get("name") or r.get("handle") or "").lower()))

    write_csv(doc_path, rows, PRODUCT_FIELDS)
    return (len(rows), added)


def main() -> None:
    DOC_SHEETS.mkdir(parents=True, exist_ok=True)
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)

    products_doc = DOC_SHEETS / PRODUCTS_NAME
    total, added = seed_vinyl_products(products_doc)
    print(f"Seeded {products_doc.relative_to(ROOT)} → {total} rows ({added} new)")

    copied = 0
    for src in sorted(DOC_SHEETS.glob("*.csv")):
        dest = PUBLIC_DATA / src.name
        shutil.copy2(src, dest)
        copied += 1
        print(f"  copied {src.relative_to(ROOT)} → {dest.relative_to(ROOT)}")

    if not copied:
        print("No CSVs found in doc/spreadsheets/")
    else:
        print(f"Synced {copied} spreadsheet(s) to public/data/")


if __name__ == "__main__":
    main()
