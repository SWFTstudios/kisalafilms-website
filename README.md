# K Films website

Motorcycle and helmet wrap garage for **Elombe Kisala**, Jersey City NJ, serving riders across NYC and North Jersey.

One job: turn a local rider into a quote request. Every page ends in a route to [`/quote`](./public/quote.html), and everything else on the site exists to make sending that form feel like an obvious idea rather than a risk.

## Stack

- Static multi-page site in `public/`, no build step
- Single design system: [`public/css/kfilms.css`](./public/css/kfilms.css) — near-black surfaces, one red accent `#e21f26`, Barlow Condensed + Inter. [`/styleguide`](./public/styleguide.html) renders the live tokens.
  - [`public/css/quote.css`](./public/css/quote.css) and [`public/css/studio.css`](./public/css/studio.css) extend it for the two form-heavy pages. Both use its variables and define no colours or fonts of their own.
- Vanilla JS, one module per concern:
  - [`public/js/nav.js`](./public/js/nav.js) — sticky header, mobile drawer with focus trapping, active-state matching, sticky mobile CTA
  - [`public/js/site.js`](./public/js/site.js) — FAQ accordions, scroll reveals, filter tabs, mobile swipe strips
  - [`public/js/quote.js`](./public/js/quote.js) — the quote form: conditional steps, photo uploads with previews, validation, live summary
  - [`public/js/wrap-studio.js`](./public/js/wrap-studio.js) — photo attachments, live build summary, ballpark estimate
  - [`public/js/gallery.js`](./public/js/gallery.js) — gallery intro and the photo/video/embed lightbox
  - [`public/js/bike-search.js`](./public/js/bike-search.js) — year/make/model dropdowns
  - [`public/js/vinyl-search.js`](./public/js/vinyl-search.js) — Metro Restyling film catalogue search
  - [`public/js/shop.js`](./public/js/shop.js) — carries a lookbook piece into the reservation form
  - [`public/js/inquiry-wizard.js`](./public/js/inquiry-wizard.js) — used only by the `/wrap-quote/` ad landing page
  - [`public/js/vinyl-catalog.js`](./public/js/vinyl-catalog.js) — the browse panel over the same catalogue: colour-family and finish filters, grid/list, sorting, saved films, compare
  - [`public/js/deposit.js`](./public/js/deposit.js) — pricing-page Stripe deposit checkout
  - [`public/js/kisala-config.js`](./public/js/kisala-config.js) — **every price, pickup fee, service zone and availability flag on the site**
  - [`public/js/config-apply.js`](./public/js/config-apply.js) — writes that config into the markup at load
  - [`public/js/analytics.js`](./public/js/analytics.js) — GA4 tag plus the `data-track` event layer
- Deployed as a Cloudflare Worker with [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- Auto-deploys on push to `main` → https://kisalafilms-website.elombe.workers.dev

Chrome (header, drawer, footer) is duplicated in each HTML file rather than templated, but it is not hand-edited: [`public/index.html`](./public/index.html) is the source of truth and [`scripts/build-v3-chrome.py`](./scripts/build-v3-chrome.py) copies the blocks between its `<!-- CHROME:HEADER -->` and `<!-- CHROME:FOOTER -->` markers into every other page carrying the same markers. **Edit the home page's header, then run `npm run build`.**

There is no motion library. Page transitions, GSAP, ScrollTrigger and Lenis were all removed with v3 — reveals are a `.reveal` class and one IntersectionObserver in `site.js`, and everything else is a CSS transition. Nothing on the site loads a third-party script except the Google Fonts stylesheet and GA4.

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

Primary nav: **Home · Services · Gallery · About · Process · FAQ**, with **Get a quote** as the standing CTA. The commercial pages that are not part of that story — Pricing, Shop, the vinyl catalog, the configurator, Login — stay reachable from the footer and the mobile drawer.

| Route | Purpose |
| --- | --- |
| `/` | Hero, services, why K Films, gallery strip, process, local band, final CTA |
| `/quote` | **The conversion page.** Bike or helmet, what you want done, photos, contact — one form |
| `/quote-thanks` | Quote success page, fires the conversion event (`noindex`) |
| `/process` | What happens between sending the form and collecting the bike |
| `/wrap-studio` | The configurator — bike, service, colour, photos, estimate, send |
| `/vinyl-catalog` | Metro film CMS browse (D1) — start a project from any film |
| `/project` | Game-like vinyl project onboarding → save or Stripe order |
| `/project-thanks` | Project checkout success (`noindex`) |
| `/gallery` | Filterable photo and video masonry with lightbox |
| `/services` | Wrap, protection, and cinema services (+ 3 detail pages) |
| `/pricing` | Package tiers, single-service prices, Stripe build deposit |
| `/shop` | Collection hub — photoshoot, wrap finishes, merch |
| `/about` · `/journal` · `/testimonials` · `/faq` · `/locations` | Supporting |
| `/locations/jersey-city` · `/locations/brooklyn` · `/locations/new-york-city` | Local landing pages, linked from the locations hub and the home page rather than the nav |
| `/contact` | Short message form for anything that isn't a build |
| `/thanks` | Wrap Studio success page (`noindex`) |
| `/wrap-quote/` | Isolated Meta ad landing page (`noindex`) |

Routes have no `.html` — see [URLs have no `.html`](#urls-have-no-html).

Retired routes (`/films`, `/watch`, `/series`, `/dispatches`, `/inspo-museum`, `/work-with-me`) are meta-refresh redirect stubs.

## The quote form

[`/quote`](./public/quote.html) is the page the whole site funnels into, and the one to be most careful with. It asks for the least a real price depends on: bike or helmet, what you want done, photos, and how to reach you. Steps that do not apply are hidden and the remaining ones renumber, so a helmet-only request never sees a year/make/model field.

**It posts natively as `multipart/form-data` to FormSubmit and must stay that way.** FormSubmit is the only path that delivers the photos, it sits behind a Cloudflare managed challenge so it cannot be proxied from the Worker, and its AJAX endpoint accepts a request with attachments and silently drops them. `quote.js` validates and curates the file list first, then gets out of the way — it does not submit the form, the browser does.

That has a consequence worth internalising: **a JavaScript error must never be able to swallow a lead.** `validate()` runs inside a `try`/`catch`, and a validator that throws lets the submission through rather than blocking it. A half-checked request costs a follow-up email; a suppressed one costs the job. The form also works with JavaScript off — every field is present, nothing is gated behind a script, and `npm test` asserts that.

Alongside the native post, `quote.js` fires a best-effort `fetch` with `keepalive` at `POST /api/quote`, which records the text fields in D1 ([`src/quote.ts`](./src/quote.ts), [`migrations/0004_quote_requests.sql`](./migrations/0004_quote_requests.sql)). It is deliberately fire-and-forget: the email is the delivery mechanism, the database is the record, and losing the record must not cost the email.

Upload limits live in `quote.uploads` in the config — 8 photos per uploader, 5MB each, 9MB combined against FormSubmit's 10MB ceiling.

`?item=helmet` or `?item=bike` preselects the type, so a service page can open the form part-answered.

## Wrap Studio

`/wrap-studio` is the older, longer configurator, kept because it prices a build in a way the quote form deliberately does not. A rider selects their bike from [`public/data/motorcycles.json`](./public/data/motorcycles.json), picks a service and add-ons, searches [`public/data/vinyl-colors.json`](./public/data/vinyl-colors.json) for an exact film, attaches photos of the bike, and sends one build sheet.

**It submits as a native `multipart/form-data` POST, and it has to stay that way.** FormSubmit only delivers attachments through its standard endpoint; the AJAX endpoint accepts the request and silently drops the files. That is why this form does not use `inquiry-wizard.js` and redirects via `_next` to `/thanks` instead of staying on the page.

Attachments are capped client-side at 8 photos and 9MB, against FormSubmit's 10MB per-submission limit, leaving room for the field data. Files that would push past the cap are skipped individually with a message naming them.

The page accepts `?service=` and `?finish=` so the home page finish tiles can open it with a choice already made.

Steps run: bike → service → colour & finish → add-ons → getting the bike here → photos → your details.

### Editing the estimate

Every number comes from [`public/js/kisala-config.js`](./public/js/kisala-config.js) — see [Configuration](#configuration). The markup still carries `data-price-low` / `data-price-high` / `data-price` attributes, but they are only the pre-hydration fallback; `config-apply.js` overwrites them from config on load, and `wrap-studio.js` reads the attributes exactly as it always did.

Ranges assume a mid-complexity bike. `data-price-scales="1"` marks the services whose labour depends on bodywork; those scale by `1 + 0.18 × (difficulty − 3)` using the bike's band from `motorcycles.json`, so a naked comes in below the base range and a bagger above it. Chrome delete, tank guard and film-only work do not scale. The result is rounded to $25 and sent as `ballpark_estimate` — wrap work only, unchanged from before. Transport is quoted separately in `transport_estimate`, and `estimate_total_range` carries the two added together.

### Transport

Step 05 asks how the bike gets to the garage: ride it in, pickup, or pickup plus return delivery. Fees and the zone list come from `transport` and `zones` in the config. The zone `<select>` is generated at runtime, so adding a zone is a one-line edit — but read the warning in that file first: a zone on that list is a public claim that the run is served.

## Configuration

[`public/js/kisala-config.js`](./public/js/kisala-config.js) is the single source of truth for pricing, pickup fees, service zones and service availability. It is a plain object literal on `window.KISALA_CONFIG`, loaded synchronously in `<head>` ahead of every other script — not JSON over `fetch`, so prices are right on the first paint and there is no async race with the studio's own estimate logic.

[`public/js/config-apply.js`](./public/js/config-apply.js) writes it into the page through three attributes:

```html
<!-- text content, money-formatted -->
<span data-cfg="transport.pickup.from">$75</span>

<!-- an attribute, so existing JS keeps reading dataset.priceLow -->
<input data-cfg-attr="data-price-low:services.fullWrap.low" data-price-low="1650">

<!-- only rendered in this pricing mode -->
<p data-cfg-show="founding">Founding-rider rate.</p>
```

Values already in the markup are the fallback for a JS-off visitor, so they should be kept in step with the config.

### Founding-rider pricing

Each service carries both a `founding` and a `standard` range. `pricingMode` picks which one the whole site quotes — page copy, studio option cards, the ballpark estimate, and the price in the emailed build sheet all move together from that one line.

Founding prices are the rates the site has always published. **The `standard` column has not been signed off** — it is derived from `standardUplift` and marked `REVIEW:` in the file. Check those numbers before flipping `pricingMode` to `"standard"`.

No page anchors a founding price against a struck-through standard one, so nothing public depends on an unreviewed number.

Anything else marked `REVIEW:` in that file is a placeholder in the same sense: structurally wired, numerically unconfirmed.

### Build deposits (Stripe)

`/pricing#deposit` takes a **percentage of (labour floor + vinyl material)** through Stripe Checkout.

- Material assumes a minimum **5ft × 25ft** cast roll per film item (`deposit.rollCostUsd`, `deposit.packages.*.linearFeet` / `filmItems` in config).
- Rolls per item = `max(1, ceil(linearFeet / 25))`.
- The browser shows the amount via `KisalaConfig.depositQuote()`; the Worker at `POST /api/checkout/deposit` recomputes the same formula and opens a Checkout Session so the client cannot underpay.
- Success lands on `/deposit-thanks` (`noindex`).

Set the secret before deploy:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
```

`SITE_URL` is in [`wrangler.jsonc`](./wrangler.jsonc) for Checkout success/cancel URLs. Keep `src/deposit.ts` labour floors in step with founding prices in `kisala-config.js`.

## Shop

`/shop` is a collection hub — **Photoshoot**, **Wrap**, and **Merch** — each linking into its own collection page and then product pages. Pages are generated from [`public/data/shop-catalog.json`](./public/data/shop-catalog.json) (photoshoot + wrap) and [`public/data/products.json`](./public/data/products.json) (merch) by [`scripts/build-shop-pages.py`](./scripts/build-shop-pages.py) and committed as static markup.

| Route | Purpose |
| --- | --- |
| `/shop` | Collection hub |
| `/shop/photoshoot` · `/shop/photoshoot/{slug}` | Cinema packages → product pages → Wrap Studio |
| `/shop/wrap` · `/shop/wrap/{slug}` | Vinyl finishes in a Vossen-style catalogue → product pages → Wrap Studio with `?finish=` |
| `/shop/k-merch` · `/shop/k-merch/{id}` | K Merch apparel lookbook and piece pages — reserve, no cart |

Wrap finish cards mirror the Vossen wheels listing: large product shot, series label, coverage chips, starting price, and colour swatches. Merch **Reserve yours** still carries the piece into the form via `js/shop.js`.

## Forms → FormSubmit

Everything posts to [FormSubmit](https://formsubmit.co/) at **`elombe@swftstudios.com`**:

```html
action="https://formsubmit.co/elombe@swftstudios.com"
```

FormSubmit requires a one-time activation per address. The first submission triggers a confirmation email that must be clicked before anything is delivered.

Two different mechanisms, and the difference matters:

- **`/quote` and Wrap Studio** post natively as `multipart/form-data`, because that is the only endpoint that delivers the photo attachments. Anything added to either form has to be a plain form field.
- **`/wrap-quote/`** posts through `fetch` to FormSubmit's AJAX endpoint via `inquiry-wizard.js`. It has no attachments, so it can stay on the page.

`/wrap-quote/` forks its own markup and restates the design tokens in an inline `<style>`, which makes it easy to forget. It carries no site chrome on purpose — it is where paid traffic lands, and the only thing to do on it is fill in the form. **Its `:root` block is a copy of the one in `kfilms.css` and has to be changed in step with it.** It is still on the shared config, so its two tier prices move with `pricingMode` like everywhere else — worth keeping that way, since it is the page paid traffic lands on and the last place you'd want to advertise a rate you've stopped honouring. `npm test` fails if a price there loses its `data-cfg`.

## Build

There is no bundler and no compile step — the HTML in `public/` is what ships. But because the chrome is copy-pasted into every page, the parts that must agree across all of them are generated rather than hand-edited:

```bash
npm run build   # then npm test
```

That runs, in order: the shop and city landing pages, the header/drawer/footer chrome, the shared `<script>` tags, CTA tracking, internal links, canonicals/OG/robots/sitemap, and JSON-LD. **The order matters** — each step reads what the one before it wrote, so run the chain rather than a single script. The chrome step has to come before CTA tracking, or the tracking labels minted for the home page get copied onto every other page. Every step is idempotent and strips its own previous output, so re-running never stacks duplicates and a clean run prints `unchanged` for everything.

**Run it after adding a page.** The sitemap is generated from the files actually present, so a new page is invisible to search until you do.

### URLs have no `.html`

Cloudflare Static Assets serves `public/pricing.html` at `/pricing` and 307-redirects `/pricing.html` to it. So `.html` is never the URL — it is a redirect to the URL.

`scripts/build-links.py` keeps internal links, `_next` form targets, canonicals, sitemap entries and JSON-LD on the extensionless form. Write `href="/pricing"` in new markup. If you paste in a `.html` link, the build rewrites it and `npm test` fails if anything slips past. The script only rewrites a link once it has confirmed the target file exists, so a typo stays a visible typo instead of being reshaped into a different broken URL.

`/locations` is the one to be careful with: `locations.html` sits next to a `locations/` directory, and Static Assets resolves the file. Verified against `wrangler dev`.

## Tests

```bash
npm test                 # 135 checks, jsdom, no server needed
npm run verify:links     # crawls every internal link against a running site
npm run verify:browser   # posts both forms for real in Chrome
npm run audit            # responsive + a11y sweep at six widths in Chrome
```

`npm test` loads each page under jsdom, runs its scripts, and asserts on the result: config hydration, transport fees, the quote form's conditional steps and validation, the summary and hidden lead fields, the vinyl browser, the city pages, gallery metadata, canonicals, structured data, that every image a page asks for exists on disk, and the analytics events. It reads from `public/`, so it catches a stale generated file as readily as a broken script.

The other three need `npm run dev` running in another terminal.

`npm run audit` loads every page at 375/390/430/768/1024/1440 and reports what only a rendering engine can see: horizontal overflow, tap targets under 44px, images with no reserved dimensions, duplicate IDs, unlabelled fields, links with no accessible name, and console errors.

`verify:browser` covers the three things jsdom cannot answer: that the hidden estimate fields bound with `form="wrap-studio"` really do submit, that the native multipart body really does carry the photo attachments, and that hydration lands before first paint. **It never contacts FormSubmit** — it repoints the form at a throwaway local server and inspects the multipart body it receives. `PRINT_LEAD=1` prints that captured build sheet, which is the quickest way to see exactly what an inquiry will look like in the inbox. It needs a Chrome binary; set `CHROME_PATH` if it isn't at `/usr/local/bin/google-chrome`.

## SEO

`/thanks`, `/wrap-quote/`, `/styleguide` and `/404.html` are `noindex`, disallowed in `robots.txt`, and left out of the sitemap. They get no canonical either, since that would only invite indexing.

`build-jsonld.mjs` runs `kisala-config.js` and `config-apply.js` in a sandbox and asks them for the prices, so the `Offer` markup cannot drift from what the page displays — flipping `pricingMode` moves both. `FAQPage` entries are scraped from the FAQ markup for the same reason. The graph asserts only what the site can stand behind: name, Jersey City locality, email, published hours, appointment-only, and the three served areas. No rating markup, no review markup, no street address, no telephone.

Absolute URLs come from `SITE` in `build-seo.py` and `siteUrl` in the config. When the site moves to its own domain, change both and re-run.

New pages need adding to the `PAGES` map in `build-jsonld.mjs` if they warrant structured data; `build-seo.py` picks them up on its own.

## Analytics

[`public/js/analytics.js`](./public/js/analytics.js) carries the GA4 tag (`G-F2BXR858CL`) and a delegated event layer. Anything with `data-track` reports itself on click:

```html
<a class="btn btn-primary" href="/wrap-studio"
   data-track="cta_click" data-track-label="home-hero">Build your wrap</a>
```

The Wrap Studio also fires `select_service`, `select_transport`, `select_budget`, `vinyl_search`, `vinyl_select`, `vinyl_save`, `vinyl_compare`, and `generate_lead` on submit.

The conversion to count is **`wrap_studio_lead`, fired on `/thanks`**, not `generate_lead`. The studio submits natively and the browser leaves the page mid-flight, so a submit-time event can be cut off before it lands; only the redirect target proves the POST completed.

## Brand assets

Two source exports drive every logo and favicon on the site. Drop them in `public/images/src/` — **filenames do not matter**, the script tells the wide wordmark from the round icon by the shape of the artwork:

```bash
pip install pillow
python3 scripts/build-brand-assets.py
```

It writes the wordmark, the icon, and six favicon sizes, then rewrites the `width`/`height` on every page's logo `<img>` to match what it produced so the header does not shift on first paint.

Both exports are artwork on solid black, so [`scripts/build-brand-assets.py`](./scripts/build-brand-assets.py) recovers exact transparency by dividing the black matte back out of each pixel rather than thresholding it away. Favicons are flattened back onto black on the way out: the mark is red *and* white, and left transparent the white half of it vanishes against a light browser tab strip.

Until the real exports land, `public/images/brand/` holds the old metallic mark as a placeholder. See [`public/images/src/README.md`](./public/images/src/README.md).

## Data catalogues

[`motorcycles.json`](./public/data/motorcycles.json) (year/make/model + fairing R&R labour bands), [`vinyl-colors.json`](./public/data/vinyl-colors.json) (Metro Restyling film catalogue + stock), [`vinyl-size-guide.json`](./public/data/vinyl-size-guide.json), [`films.json`](./public/data/films.json) (Vimeo ids, runtimes and cities for the archive), [`products.json`](./public/data/products.json).

Editable CSVs for film notes live in [`doc/spreadsheets/`](./doc/spreadsheets/). The **vinyl catalog** reads [`vinyl-colors.json`](./public/data/vinyl-colors.json) in the browser (JSON-first). Optional D1 price overlay via `/api/films` when seeded.

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

### Case-study metadata

Any tile can carry case-study detail, which the lightbox renders under the caption. Every field is optional and blank ones are skipped, so a tile shows only what is actually known about it:

```html
<figure class="masonry-item" data-caption="Gloss black full change"
        data-bike="2004 Honda CBR600F4i"
        data-service="Full colour-change wrap"
        data-film="Avery Dennison SW900 Gloss Black"
        data-coverage="Every painted panel"
        data-turnaround="3 days"
        data-city="Jersey City, NJ"
        data-filmed="Yes — transformation film">
```

Most tiles are currently filled in only as far as the repository can vouch for: the caption, and city and runtime for the two films that came from `films.json`. **Fill the rest in from your own build records** — bike, film brand and colour, coverage, turnaround. Do not guess at a field to make a tile look complete; an absent row reads better than a wrong one, and these tiles are the portfolio.

## Vinyl catalogue

Public browse lives at [`/vinyl-catalog`](./public/vinyl-catalog.html) and reads **[`public/data/vinyl-colors.json`](./public/data/vinyl-colors.json) first** (Metro Restyling export — ~1,100 films). No database required to show the grid.

Optional live roll prices can overlay from D1 (`GET /api/films`) when that table is seeded; browsing never depends on it. Rebuild Metro JSON with [`build-vinyl-catalog.py`](./scripts/build-vinyl-catalog.py). Film detail and project onboarding use the same JSON via [`vinyl-catalog-data.js`](./public/js/vinyl-catalog-data.js).

Wrap Studio’s in-form browse panel still uses [`vinyl-catalog.js`](./public/js/vinyl-catalog.js) over the same JSON file.

Old `/lookbook` URLs 301 to the vinyl-catalog routes.

### Project checkout (motorcycle + helmet)

[`/project`](./public/project.html) is the e-commerce onboarding path: pick a film from the catalog → motorcycle or helmet → setup → details → **save** (localStorage + Firebase `customers/{uid}/projects`) or **order** via Stripe Checkout.

Pricing (mirrored in [`kisala-config.js`](./public/js/kisala-config.js) `projectCheckout` and [`src/project-quote.ts`](./src/project-quote.ts)):

- **Vinyl** = Metro roll cost × **1.40** (40% markup), rolls = `max(1, ceil(linearFeet / 25))`
- **Labour** = set price by difficulty 1–5 (bike fairing band for motorcycles; film finish difficulty for helmets)

Worker endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/quote/project` | Preview quote (live Metro cost from D1) |
| POST | `/api/checkout/project` | Create pending D1 order + Stripe Checkout Session |
| GET | `/api/checkout/session` | Confirm payment / mark order paid |
| POST | `/api/webhooks/stripe` | Stripe webhook (`checkout.session.completed`) |
| GET | `/api/orders/:id` | Public order status |

Orders live in D1 `project_orders` ([`migrations/0003_project_orders.sql`](./migrations/0003_project_orders.sql)). Set secrets:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Point the Stripe webhook at `https://<worker>/api/webhooks/stripe` for `checkout.session.completed`. Success lands on `/project-thanks` (`noindex`).

### Founder at-cost pricing

Until **5 completed orders** (`site_meta.completed_orders`), the public films API also includes supplier `price_usd` / `roll_price_usd` for reference. **Sell price** (`sell_price_usd` = cost × 1.4) is always public. After the founder window, cost fields are omitted from the catalog UI (CSV export still includes them for the garage).

Mark a completed build (burns one founder slot):

```bash
curl -X POST https://kisalafilms-website.elombe.workers.dev/api/founder/complete \
  -H "Authorization: Bearer $FOUNDER_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
# optional body: {"set": 3} to set the counter explicitly
```

Set the secret with `wrangler secret put FOUNDER_ADMIN_TOKEN` (or reuse `FILMS_IMPORT_TOKEN`).

### Accounts (Firebase)

Email/password Auth + Firestore builds under `customers/{uid}/builds/{buildId}`. Config: [`firebase-config.js`](./public/js/firebase-config.js). Login: [`/login`](./public/login.html). Wrap Studio syncs the garage when signed in.

`vinyl-search.js` owns the typeahead and the selection; `vinyl-catalog.js` mounts the **Browse all films** panel over the same loaded array, and both write the same hidden fields. One catalogue, one fetch, two ways in.

Colour families are derived from the product title, since Metro's feed has no colour field:

```bash
python3 scripts/enrich-vinyl-families.py    # adds "c" to each record + a colorFamilies list
```

[`build-vinyl-catalog.py`](./scripts/build-vinyl-catalog.py) applies the same table on a fresh sync, so this only needs running by hand after editing the keyword rules. Family swatch hexes are labels for the filter chips — each film keeps Metro's own product photo as its thumbnail, so no swatch ever stands in for a real film's colour.

Saved films live in `localStorage` under `kisala-saved-films` and ride along on the build sheet as `saved_films`.

## Brand lines

- **Primary:** FILM MEANS TWO THINGS HERE.
- **Editorial:** FILM ON METAL, SHOT PROPERLY.
- **Close:** YOUR BIKE, SHOT THE SAME WAY.
