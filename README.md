# Kisala Films website

Marketing + booking site for **Kisala Films** (K Films) — personal **automotive photography**, **cinematic video**, and **rollers** in Jersey City, NJ.

Vinyl wrap / PPF tooling and pages remain in the repo but are **dormant** (`noindex`, unlinked from the main IA) until that offer is brought back on purpose.

## Brand split

- **Kisala Films** — Elombe’s personal photo & video studio. Book shoots here.
- **Roller Reels** — collaborative showcase with other photographers. Credited in the footer; not the booking funnel for Kisala Films.

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

The **shoot inquiry** on `/contact` submits via FormSubmit’s **Ajax API** ([`public/js/shoot-wizard.js`](./public/js/shoot-wizard.js)) so a Cloudflare **524** on `formsubmit.co` no longer dumps customers on an error page. If send fails, the review step offers **Email this request instead** (`mailto:hello@swftstudios.com` with the full summary) plus copy-to-clipboard. Drafts stay in `localStorage` (`kisala-shoot-inquiry`) until a successful send.

### Shoot inquiry wizard (phone-first)

`/contact` uses a media-focused multi-step flow:

1. Shoot type → 2. Vehicle & vibe → 3. Location & timing → 4. Deliverables → 5. Contact → 6. Review & confirm

### Dormant wrap quote funnel (`/wrap-quote`)

Purpose-built Meta ad funnel for wraps — **not** part of the main marketing IA. Marked `noindex, nofollow`. Source: [`public/wrap-quote/index.html`](./public/wrap-quote/index.html). Uses the older wrap inquiry wizard ([`public/js/inquiry-wizard.js`](./public/js/inquiry-wizard.js)) plus motorcycle / vinyl JSON catalogs under `public/data/`.

## Showcase (`/films.html`)

Photo + video gallery at [`public/films.html`](./public/films.html), styled in [`public/css/carsy.css`](./public/css/carsy.css) and driven by [`public/js/gallery.js`](./public/js/gallery.js). `/gallery.html` redirects here.

- Filters: `all`, `automotive`, `lifestyle`, `rollers`
- Lightbox for photos and videos
- Placeholder H.264 clips live in `public/videos/` — **replace with real phone / Roller Reels solo exports** when ready

### Adding showcase items

Add a `<figure>` inside `[data-gallery-grid]` on `films.html`.

Photo:

```html
<figure class="masonry-item" data-filter-item="automotive" data-type="photo"
        data-full="/images/full-shot.jpg" data-caption="Caption">
  <button type="button" class="tile" data-lightbox aria-label="Expand: Caption">
    <img src="/images/thumb-shot.jpg" alt="Describe the shot" loading="lazy">
  </button>
</figure>
```

Video (drop the file in `public/videos/`; `.mp4` with an H.264 codec plays widest):

```html
<figure class="masonry-item" data-filter-item="rollers" data-type="video"
        data-video="/videos/clip.mp4" data-full="/images/clip-poster.jpg" data-caption="Caption">
  <button type="button" class="tile is-video" data-lightbox aria-label="Play video: Caption">
    <img src="/images/clip-poster.jpg" alt="Describe the clip" loading="lazy">
    <span class="tile-play" aria-hidden="true"></span>
  </button>
</figure>
```

## Design handoff

High-fidelity design references live in [`design/`](./design/). Production pages in `public/` follow the Carsy-derived system; current public copy is **media-first** (wraps hidden).
