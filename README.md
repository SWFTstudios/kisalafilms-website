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

## Design handoff

High-fidelity design references and the full design spec live in [`design/`](./design/). Production pages in `public/` were built from that handoff (tokens, copy, and layout).
