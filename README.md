# Kisala Films website

Marketing + booking site for **Kisala Films** (K Films) — motorcycle vinyl wraps (and PPF) in Jersey City, NJ, paired with cinematic photography/video and moto adventure content. Film means vinyl *and* cinema.

## Stack

- Static multi-page site in `public/`
- Deployed as a Cloudflare Worker with [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- Auto-deploys on push to `main` → https://kisalafilms-website.elombe.workers.dev

## Develop locally

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

Worker `name` in `wrangler.jsonc` must stay `kisalafilms-website` to match the Cloudflare project.

## Forms → FormSubmit

All site forms POST to [FormSubmit](https://formsubmit.co/) at `hello@swftstudios.com`:

```html
action="https://formsubmit.co/hello@swftstudios.com"
```

After the first submission, confirm the activation email on that inbox. Leads and subscribe notices land there with table formatting; `_next` redirects users back to the site with `?sent=1` / `?subscribed=1`.

## Lead-gen landing page (`/wrap-quote`)

Purpose-built Meta ad funnel — **not** part of the main marketing IA.

- URL: https://kisalafilms-website.elombe.workers.dev/wrap-quote
- Source: [`public/wrap-quote/index.html`](./public/wrap-quote/index.html)
- Marked `noindex, nofollow` — do not add it to the site header/footer or sitemap
- Single CTA: “Get My Free Quote”; no links into other site pages
- Deploys with the same Worker (`npm run deploy`)

### Isolate from main-site SEO / navigation

Keep this page off the main nav so paid traffic stays on the funnel. Two common setups:

1. **Subpath on the custom domain** — route `kisalafilms.com/wrap-quote` to this Worker (same project). Leave the rest of the marketing site as-is; do not link `/wrap-quote` from organic pages.
2. **Separate subdomain** — e.g. `wrap.kisalafilms.com` or `quote.kisalafilms.com` pointing at the same Worker (or a fork with only the LP assets). Use when you want a cleaner ad URL and zero risk of competing with the main site’s crawl graph.

Either way, keep `robots noindex` until/unless you intentionally want this page indexed.

### Bike year / make / model index

The quote form typeahead loads [`public/data/motorcycles.json`](./public/data/motorcycles.json) (~2,000 bikes across 31 brands, years 1985–2026).

Each bike is tagged with a **fairing R&R labor band** for backend quoting (uninstall + reinstall bodywork around a wrap — not film install time):

| Band | Difficulty | Hours (est.) | Examples |
| --- | --- | --- | --- |
| `naked_minimal` | 1/5 | 0.5–1.5h | MT-07, Z900, Grom |
| `cruiser_simple` | 2/5 | 1–2.5h | Sportster, Rebel, Vulcan |
| `half_faired` | 3/5 | 2–4h | Ninja 650, sport-touring cowls |
| `adventure_touring` | 3/5 | 2.5–5h | Africa Twin, Versys, Pan America |
| `full_sport` | 4/5 | 4–8h | CBR600F4i, GSX-R, R1, ZX-6R |
| `touring_complex` | 5/5 | 6–12h | Gold Wing, Street Glide |
| `scooter_enclosed` | 3/5 | 3–6h | Vespa, ADV160 |
| `dirt_mx` | 2/5 | 1–3h | CRF-R, YZ, KX |
| `sidecar_utv` | 5/5 | 4–10h | specialty / UTV |

Selecting a bike fills hidden lead fields: `bike_body_class`, `bike_difficulty`, `fairing_rr_hours_low`, `fairing_rr_hours_high`, `fairing_rr_label`.

These hours are **starting heuristics** — refine with photos and your own timed jobs. Rebuild:

```bash
python3 scripts/build-motorcycle-index.py
```

### Vinyl color catalog (Metro Restyling)

Quote forms load [`public/data/vinyl-colors.json`](./public/data/vinyl-colors.json) (~1,100 SKUs) so customers can search Metro Restyling colors and open the product page for swatches.

Included product types: Vinyl, Colored PPF Wrap, PPF, Brake Caliper, Light Wrap. **Camo Roll** and **Sample Book** are omitted by default (add them to `INCLUDE_TYPES` in the script to bring them back).

Rebuild from Metro’s public Shopify collection JSON:

```bash
python3 scripts/build-vinyl-catalog.py
```

Sources: `all-vinyl-wrap`, `brake-caliper-wrap`, `light-wrap-film`, `paint-protection-film`. Hex codes are not scraped yet — each result links to the Metro product page.

Client: [`public/js/vinyl-search.js`](./public/js/vinyl-search.js) on `/wrap-quote` and `/contact`.

## Design handoff

High-fidelity design references and the full design spec live in [`design/`](./design/). Production pages in `public/` were built from that handoff (tokens, copy, and layout).
