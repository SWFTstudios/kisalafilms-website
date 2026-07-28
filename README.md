# Kisala Films website

Motorcycle wrap studio and film house for **Elombe Kisala**, Jersey City NJ. Film means two things here: the vinyl that goes on the bike, and the film shot of it happening.

The site follows the Vossen Wheels pattern — show the product, prove it in the wild, capture the lead — mapped onto wraps: finish catalogue, build gallery, and a configurator that emails a build sheet.

## Stack

- Static multi-page site in `public/`, no build step
- Single design system: [`public/css/carsy.css`](./public/css/carsy.css) — dark premium, logo red `#e8271f`, Archivo + Mulish
- Vanilla JS, one module per concern:
  - [`public/js/nav.js`](./public/js/nav.js) — sticky header, mobile drawer, active-state matching
  - [`public/js/site.js`](./public/js/site.js) — FAQ accordions, scroll reveals, filter tabs
  - [`public/js/wrap-studio.js`](./public/js/wrap-studio.js) — photo attachments, live build summary, ballpark estimate
  - [`public/js/gallery.js`](./public/js/gallery.js) — gallery intro and the photo/video/embed lightbox
  - [`public/js/bike-search.js`](./public/js/bike-search.js) — year/make/model dropdowns
  - [`public/js/vinyl-search.js`](./public/js/vinyl-search.js) — Metro Restyling film catalogue search
  - [`public/js/shop.js`](./public/js/shop.js) — carries a lookbook piece into the reservation form
  - [`public/js/inquiry-wizard.js`](./public/js/inquiry-wizard.js) — used only by the `/wrap-quote/` ad landing page
- Deployed as a Cloudflare Worker with [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- Auto-deploys on push to `main` → https://kisalafilms-website.elombe.workers.dev

Chrome (header, footer, `<head>`) is duplicated in each HTML file rather than templated. Edit one page's header and you must edit them all.

## Develop locally

```bash
npm install
npm run dev
```

Static assets are served extensionless: a link to `/gallery.html` 307s to `/gallery`. `nav.js` normalises both forms when deciding which nav item is active.

## Deploy

```bash
npm run deploy
```

Worker `name` in `wrangler.jsonc` must stay `kisalafilms-website` to match the Cloudflare project.

## Information architecture

Primary nav: **Services · Gallery · Pricing · Shop · About · Contact**, with **Build your wrap** as the standing CTA.

| Route | Purpose |
| --- | --- |
| `/` | Cinematic hero, service tiers, finish tiles, build gallery, reel rail, process |
| `/wrap-studio.html` | The configurator — bike, service, colour, photos, estimate, send |
| `/gallery.html` | Filterable photo and video masonry with lightbox |
| `/services.html` | Wrap, protection, and cinema services (+ 3 detail pages) |
| `/pricing.html` | Package tiers and single-service starting prices |
| `/shop.html` | WLG apparel lookbook — reserve, no cart |
| `/about.html` · `/journal.html` · `/testimonials.html` · `/faq.html` · `/locations.html` | Supporting |
| `/contact.html` | Short message form for anything that isn't a build |
| `/thanks.html` | Wrap Studio success page (`noindex`) |
| `/wrap-quote/` | Isolated Meta ad landing page (`noindex`) |

Retired routes (`/films.html`, `/watch.html`, `/series.html`, `/dispatches.html`, `/inspo-museum.html`, `/work-with-me.html`) are meta-refresh redirect stubs.

## Wrap Studio

`/wrap-studio.html` is the primary conversion path. A rider selects their bike from [`public/data/motorcycles.json`](./public/data/motorcycles.json), picks a service and add-ons, searches [`public/data/vinyl-colors.json`](./public/data/vinyl-colors.json) for an exact film, attaches photos of the bike, and sends one build sheet.

**It submits as a native `multipart/form-data` POST, and it has to stay that way.** FormSubmit only delivers attachments through its standard endpoint; the AJAX endpoint accepts the request and silently drops the files. That is why this form does not use `inquiry-wizard.js` and redirects via `_next` to `/thanks.html` instead of staying on the page.

Attachments are capped client-side at 8 photos and 9MB, against FormSubmit's 10MB per-submission limit, leaving room for the field data. Files that would push past the cap are skipped individually with a message naming them.

The page accepts `?service=` and `?finish=` so the home page finish tiles can open it with a choice already made.

### Editing the estimate

Prices live in the markup, on the option inputs, next to the copy that quotes them — there is no pricing table in the JavaScript:

```html
<input type="radio" name="service" value="Full colour-change wrap"
       data-price-low="1650" data-price-high="2400" data-price-scales="1">
<input type="checkbox" name="addons" value="Photo set" data-price="200">
```

Ranges assume a mid-complexity bike. `data-price-scales="1"` marks the services whose labour depends on bodywork; those scale by `1 + 0.18 × (difficulty − 3)` using the bike's band from `motorcycles.json`, so a naked comes in below the base range and a bagger above it. Chrome delete, tank guard and film-only work do not scale. The result is rounded to $25 and sent along as `ballpark_estimate`.

## Shop

`/shop.html` is generated once from [`public/data/products.json`](./public/data/products.json) and committed as static markup — the site has no build step, so adding a piece means editing both. Cards cross-fade to the second product shot on hover, and **Reserve yours** carries the piece into the form at the bottom via `js/shop.js`. There is no cart: reservations email the same inbox as wrap enquiries.

## Forms → FormSubmit

Everything posts to [FormSubmit](https://formsubmit.co/) at **`elombe@swftstudios.com`**:

```html
action="https://formsubmit.co/elombe@swftstudios.com"
```

FormSubmit requires a one-time activation per address. The first submission triggers a confirmation email that must be clicked before anything is delivered.

## Brand assets

Two source exports drive every logo and favicon on the site. Drop them in `public/images/src/`:

| Source file | Produces |
| --- | --- |
| `kisala-films-logo-source.png` | `public/images/brand/kisala-films-logo.png` — the wide wordmark in the header, drawer, and gallery intro |
| `kisala-films-icon-source.png` | `public/images/brand/kisala-films-icon.png` plus every favicon size and `favicon.ico` |

```bash
pip install pillow
python3 scripts/build-brand-assets.py
```

Both exports are artwork on solid black, so [`scripts/build-brand-assets.py`](./scripts/build-brand-assets.py) recovers exact transparency by dividing the black matte back out of each pixel rather than thresholding it away.

## Data catalogues

[`motorcycles.json`](./public/data/motorcycles.json) (year/make/model + fairing R&R labour bands), [`vinyl-colors.json`](./public/data/vinyl-colors.json) (Metro Restyling film catalogue), [`vinyl-size-guide.json`](./public/data/vinyl-size-guide.json), [`films.json`](./public/data/films.json) (Vimeo ids, runtimes and cities for the archive), [`products.json`](./public/data/products.json).

## Gallery films

Film tiles in `/gallery.html` use `data-type="embed"` with a player URL, so nothing needs self-hosting:

```html
<figure class="masonry-item masonry-item--reel" data-filter-item="films" data-type="embed"
        data-embed="https://player.vimeo.com/video/VIDEO_ID"
        data-full="/images/your-thumbnail.jpg"
        data-caption="Build name">
```

YouTube works the same way with `https://www.youtube.com/embed/VIDEO_ID`. Add `masonry-item--reel` for anything shot vertical and the tile renders at 9:16 instead of 16:9.

Ids come from [`films.json`](./public/data/films.json). Only two entries there have live Vimeo ids, so only those two are on the grid; the remaining seven need ids before they can be added.

## Brand lines

- **Primary:** FILM MEANS TWO THINGS HERE.
- **Editorial:** FILM ON METAL, SHOT PROPERLY.
- **Close:** YOUR BIKE, SHOT THE SAME WAY.
