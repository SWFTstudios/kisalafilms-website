# Kisala Films website

Personal brand site for **Kisala Films** — Elombe Kisala showcasing life through his lens: automotive, lifestyle, travel, and BTS commercial work.

Inspired by cinematic portfolio studios (e.g. [Mursee](https://www.mursee.nl)). Brand photo/videography bookings route to [SWFT Studios](https://swftstudios.com).

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

## Site map

| Page | Path | Purpose |
| --- | --- | --- |
| Home | `/` | Brand hero — Kisala Films, life through my lens |
| About | `/about.html` | Elombe Kisala at the focal point |
| Works | `/films.html` | Filterable gallery |
| Contact | `/contact.html` | General inquiry + SWFT booking path |

Legacy wrap/marketing URLs (`/services.html`, `/pricing.html`, etc.) redirect into the new IA. `/gallery.html` redirects to `/films.html`.

## Gallery

Photo + video archive at [`public/films.html`](./public/films.html), styled in [`public/css/brand.css`](./public/css/brand.css).

Controls (via [`public/js/gallery-filters.js`](./public/js/gallery-filters.js)):

- **Title search** — matches `data-title` / caption
- **Tag search** — matches `data-tags` and category tokens
- **Category filter** — All · Automotive · Lifestyle · Travel · BTS Commercial
- **Sort** — newest, oldest, title A–Z / Z–A

Lightbox lives in [`public/js/gallery.js`](./public/js/gallery.js). Deep-link a category with `?cat=automotive` (also `lifestyle`, `travel`, `bts`).

### Adding gallery items

```html
<figure class="masonry-item"
        data-filter-item="automotive"
        data-type="photo"
        data-full="/images/full-shot.jpg"
        data-title="Shot title"
        data-caption="Shot title"
        data-tags="motorcycle garage night"
        data-date="2026-03-12">
  <button type="button" class="tile" data-lightbox aria-label="Expand: Shot title">
    <img src="/images/thumb-shot.jpg" alt="Describe the shot" loading="lazy">
    <span class="tile-meta">
      <span class="tile-title">Shot title</span>
      <span class="tile-tags">Automotive</span>
    </span>
  </button>
</figure>
```

Video tiles use `data-type="video"` + `data-video="/videos/clip.mp4"` and add class `is-video` plus a `.tile-play` span on the button.

## Contact & forms

General inquiry form on `/contact.html` POSTs to [FormSubmit](https://formsubmit.co/) at `hello@swftstudios.com`.

Brand production (photos, cinematic work, socials, ads, brand videos, intro videos, etc.) is directed to **https://swftstudios.com**.

After the first FormSubmit submission, confirm the activation email on that inbox. `_next` redirects back with `?sent=1` / `?subscribed=1`.

## Optional lead landing (`/wrap-quote`)

The older Meta wrap-quote funnel still ships at [`public/wrap-quote/index.html`](./public/wrap-quote/index.html) with `noindex`. It is **not** part of the personal-brand IA and should not be linked from the main nav.

## Design

Production styles: [`public/css/brand.css`](./public/css/brand.css)  
Fonts: **Plus Jakarta Sans** (modern sans for display + body)  
Palette: near-black cinematic ground / cool day surface, warm off-white or charcoal type, accent `#e8572a`  
Theme: day/night toggle (persisted in `localStorage` as `kf-theme`, defaults to system preference)

Older Carsy/wrap design references remain under [`design/`](./design/) for historical handoff only.
