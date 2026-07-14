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

## Design handoff

High-fidelity design references and the full design spec live in [`design/`](./design/). Production pages in `public/` were built from that handoff (tokens, copy, and layout).
