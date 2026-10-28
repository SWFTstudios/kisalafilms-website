# Vinyl lookbook data (CMS)

## Live CMS store

Film lookbook cards and detail pages read from **Cloudflare D1** via:

- `GET /api/films`
- `GET /api/films/:handle`

Import / refresh from Metro (+ optional spreadsheet copy):

```bash
# Local (npm run dev must be running)
python3 scripts/import-films-d1.py --local --skip-metro-fetch

# Or re-fetch Metro first (omit --skip-metro-fetch)
python3 scripts/import-films-d1.py --local

# Production
wrangler secret put FILMS_IMPORT_TOKEN
python3 scripts/import-films-d1.py --url https://kisalafilms-website.elombe.workers.dev --token "$FILMS_IMPORT_TOKEN"
```

Apply schema:

```bash
npx wrangler d1 migrations apply kisalafilms --local
npx wrangler d1 migrations apply kisalafilms --remote
```

## Optional spreadsheet seed

[`doc/spreadsheets/vinyl-products.csv`](../../doc/spreadsheets/vinyl-products.csv) can still hold garage copy. The import upsert **keeps** non-empty description / install notes / recommended_for / notes when Metro re-sync sends blanks.

[`vinyl-colors.json`](./vinyl-colors.json) remains for Wrap Studio search until that page is migrated to D1.

**Preview note:** `python -m http.server` cannot serve `/api/*`. Use `npm run dev`.
