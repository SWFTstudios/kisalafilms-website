# Doc

Garage-facing documents and spreadsheet seeds for the **Cloudflare D1** lookbook CMS.

| Path | Purpose |
| --- | --- |
| [`spreadsheets/`](./spreadsheets/) | Optional CSV seed/overlays for film copy |
| [`website-copy.rtf`](./website-copy.rtf) | Full-site marketing copy inventory (placement-labeled). Regenerate: `npm run export:copy` |

Live reads: `GET /api/films` · Import: `python3 scripts/import-films-d1.py`
