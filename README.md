# Kisala Films website

Creator-led film and lifestyle platform for **Elombe Kisala** — people, machines, and life in motion. Visual language: VHS / street-archive (inspired by the LOST//FOUND prototype).

## Stack

- Static multi-page site in `public/`
- Single design system: [`public/css/vhs.css`](./public/css/vhs.css)
- Vanilla JS: nav, 3D tape slider ([`public/js/vhs.js`](./public/js/vhs.js)), inquiry wizard
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

## Information architecture

| Route | Purpose |
| --- | --- |
| `/` | Transmission homepage + 3D tape crate |
| `/watch.html` | All films |
| `/series.html` | Series tape slider |
| `/about.html` | Elombe’s story |
| `/dispatches.html` | Field notes |
| `/work-with-me.html` | Partnerships + wrap inquiry wizard |
| `/faq.html` · `/locations.html` | Secondary |
| `/wrap-quote/` | Isolated Meta ad LP (`noindex`) |

Legacy URLs (`/films.html`, `/journal.html`, `/services*.html`, `/pricing.html`, `/contact.html`, `/gallery.html`) redirect to the new IA.

## Forms → FormSubmit

All site forms POST to [FormSubmit](https://formsubmit.co/) at **`hello@swftstudios.com`** (display and action aligned):

```html
action="https://formsubmit.co/hello@swftstudios.com"
```

Inquiry wizard on `/work-with-me.html#inquiry` (and `/wrap-quote/`) uses FormSubmit’s Ajax API with `mailto:` fallback. Drafts persist in `localStorage`.

Data catalogs: [`public/data/motorcycles.json`](./public/data/motorcycles.json), [`public/data/vinyl-colors.json`](./public/data/vinyl-colors.json), [`public/data/vinyl-size-guide.json`](./public/data/vinyl-size-guide.json).

## 3D tape slider

[`public/js/vhs.js`](./public/js/vhs.js) renders a perspective VHS carousel (prev/next, index, swipe, arrow keys). Each tape’s `video` URL opens the film. **Placeholder:** titles and URLs currently point at Instagram until real YouTube / hosted clips are wired in `SERIES` inside `vhs.js`.

## Brand lines

- **Primary:** PEOPLE, MACHINES, AND LIFE IN MOTION.
- **Editorial:** FILMS FROM THE ROAD BETWEEN PLACES.
- **Close:** GO SOMEWHERE YOU CAN'T EXPLAIN.

## Lead-gen landing page (`/wrap-quote`)

Purpose-built Meta ad funnel — **not** part of the main marketing IA. Keep `noindex`; do not add to primary nav. Same FormSubmit + wizard stack as Work With Me.
