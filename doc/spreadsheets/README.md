# Spreadsheets & CSVs

Editable CSVs for seeding garage copy into the Cloudflare D1 lookbook CMS. The **live lookbook** reads D1 via `/api/films`, not these files directly.

## Sync into D1

```bash
# After editing CSVs / Metro catalogue:
python3 scripts/sync-doc-spreadsheets.py   # optional: publish CSV copies to public/data
python3 scripts/import-films-d1.py --local # or --url + --token for production
```

`import-films-d1.py` pulls Metro stock/images (or uses existing `vinyl-colors.json`) and overlays copy from `vinyl-products.csv`.

## Files

### `vinyl-products.csv`

Optional seed for garage fields on `/lookbook/film.html?h={handle}`.

| Column | Use |
| --- | --- |
| `handle` | Join key (required) |
| `sku` | Short code |
| `name` | Display override |
| `brand` | Brand override |
| `finish` | Finish override |
| `description` | Detail body |
| `install_notes` | Install notes |
| `recommended_for` | e.g. full wrap, accents |
| `notes` | Internal |

### `vinyl-inventory.csv`

Optional local tracker only — not the public stock source (stock comes from Metro → D1 `in_stock`).
