# K Films website

A motorcycle film studio at **95 Christopher Columbus Dr, Jersey City, NJ**: colour-change wraps, paint protection film, accents, custom liveries and chrome delete, with pickup from Brooklyn and NYC.

The site does three jobs: show the work at the standard of the work, turn a rider into a build request (`/book`), and run that build in the open through a client portal (`/portal`) and a studio admin (`/admin`), with payment online.

The redesign plan is [doc/REDESIGN-PLAN.md](./doc/REDESIGN-PLAN.md). Before switching the live site over, work through [doc/GO-LIVE.md](./doc/GO-LIVE.md).

## Stack

- Static pages in `public/`, served by a Cloudflare Worker with [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/). No bundler, no framework.
- The Worker ([`src/index.ts`](./src/index.ts)) is the API: sign-in, jobs, photos, quotes, payments, the admin, and 301s for every retired URL.
- **D1** for customers, jobs, the timeline, quotes and payments ([`migrations/`](./migrations/)). **R2** (`kisalafilms-photos`) for photos. **Stripe Checkout** for payments. **Cloudflare Email Service** (or Resend) for mail.
- One design system: [`public/css/kf.css`](./public/css/kf.css): the brand style guide's palette and type (Fraunces headlines, Hanken Grotesk text, one champagne-gold accent). The guide itself is at `/internal/brand-style-guide`, behind HTTP basic auth (`wrangler secret put STYLEGUIDE_PASSWORD`). [`/styleguide`](./public/styleguide.html) renders it. Page-specific sheets ([`book.css`](./public/css/book.css), [`portal.css`](./public/css/portal.css), [`admin.css`](./public/css/admin.css), [`catalog.css`](./public/css/catalog.css)) use its tokens and define no colours or type of their own.
- Motion and chrome in one script, [`public/js/kf.js`](./public/js/kf.js): menu overlay, first-visit intro, reveals, the pinned chapters, parallax. Everything readable with scripts off, and still under `prefers-reduced-motion`.
- Auto-deploys on push to `main` → https://kisalafilms-website.elombe.workers.dev

## Develop locally

```bash
npm install
npm run db:migrate:local
npm run dev
```

On localhost, mail is written to the Worker log instead of sent, and the sign-in endpoints also return the link and code (`devLink`, `devCode`), so sign-in, the portal and the admin all work without a mail provider. Sign in to `/admin` with the address in `ADMIN_EMAILS` ([`wrangler.jsonc`](./wrangler.jsonc)).

## Pages

| Route | What it is |
| --- | --- |
| `/` | Hero, manifesto, Protect / Transform / Detail chapters, services, featured build, process, the studio, closing CTA |
| `/services` and `/services/{colour-change,paint-protection,accents,custom-livery,chrome-delete}` | The hub and one page per service, priced from config |
| `/builds`, `/builds/honda-cbr600-f4i`, `/builds/view?b=` | Portfolio: the hand-built case study, plus any job the studio publishes from the admin |
| `/finishes`, `/vinyl-catalog`, `/vinyl-catalog/film?h=` | Finishes explained, and the full film catalog (~1,100 films) |
| `/process`, `/studio`, `/faq` | How a build runs, the studio and HQ, questions |
| `/locations/{jersey-city,brooklyn,new-york-city}` | Local landing pages |
| `/book` → `/book-thanks` | **Start your build**, the intake wizard |
| `/login`, `/portal` | Passwordless sign-in and the client portal (`noindex`) |
| `/admin` | The studio admin (`noindex`, `ADMIN_EMAILS` only) |
| `/internal/brand-style-guide` | The brand guide: colour, type, buttons, imagery, voice. Basic auth via `STYLEGUIDE_PASSWORD`; refuses everyone while unset |
| `/wrap-quote/` | The Meta ads landing page: self-contained, own inline styles, posts to FormSubmit (`noindex`) |

Retired routes (`/about`, `/gallery`, `/pricing`, `/quote`, `/wrap-studio`, `/shop/*`, `/project`, and the earlier cinematic pages `/events`, `/portraits`, `/portfolio`…) are 301s in `RETIRED` in [`src/index.ts`](./src/index.ts). Their files are deleted, because a static file would answer before the Worker could redirect.

## Generated pages

Most pages are generated, and the output is committed. Edit the generator, not the HTML:

- [`scripts/v4_page.py`](./scripts/v4_page.py): the shared `<head>`, components, and the header and footer, read from `public/index.html` between its `CHROME4` markers. **The home page is the one place the chrome is edited.**
- [`scripts/build-v4-pages.py`](./scripts/build-v4-pages.py): services, builds, finishes, process, studio, FAQ, 404, `/book`, `/login`, `/portal`, `/admin`. It also re-syncs the chrome into the hand-maintained pages that carry the markers (the catalog pages, the style guide).
- [`scripts/build-local-pages.py`](./scripts/build-local-pages.py): the three city pages.

```bash
npm run build   # then npm test
```

That runs, in order: city pages, v4 pages and chrome, shared script tags, CTA tracking, extensionless internal links, canonicals/OG/robots/sitemap ([`build-seo.py`](./scripts/build-seo.py)), and JSON-LD ([`build-jsonld.mjs`](./scripts/build-jsonld.mjs), which reads prices from the config and the FAQ from the page). Each step is idempotent. **Run it after adding a page**; the sitemap is built from the files present.

Static Assets serves `public/x.html` at `/x` and 307s the `.html` form, so write links without `.html`.

## Configuration

[`public/js/kisala-config.js`](./public/js/kisala-config.js) holds every price, the deposit default, pickup fees, zones and the studio's address and hours. Pages show prices through `data-cfg` attributes that [`config-apply.js`](./public/js/config-apply.js) fills in, so the number in the markup is only the scripts-off fallback:

```html
From <span data-cfg="services.fullWrap.from">$1,650</span>
```

`pricingMode` picks the `founding` or `standard` column for the whole site. The standard prices are derived from `standardUplift` and marked `REVIEW:`. Check them before switching.

## Booking, portal, admin, payments

- **[`/book`](./public/book.html)** ([`book.js`](./public/js/book.js)): five steps: bike (search over [`motorcycles.json`](./public/data/motorcycles.json)), the work, photos (resized on the device and uploaded to R2 as they're added), notes and timing, contact. It saves a draft locally, shows a live ballpark, and submits JSON to `POST /api/jobs`. The page is also a complete native form that posts multipart to the same endpoint, photos included, so it works with scripts off and is the fallback if the JSON submit fails.
- **Sign-in** ([`src/auth.ts`](./src/auth.ts)): an emailed one-time link plus a 6-digit code, and a 30-day session. Only hashes are stored. Submitting a build creates the account; it never signs the browser in, so the emailed link is the only way into a job.
- **Portal** ([`portal.js`](./public/js/portal.js), [`src/portal.ts`](./src/portal.ts)): the 9-stage timeline ([`src/stages.ts`](./src/stages.ts)), studio updates with photos, the quote (approve in one click), payments, messages, the brief and the rider's photos.
- **Admin** ([`admin.js`](./public/js/admin.js), [`src/admin.ts`](./src/admin.ts)): the board (drag a card to change stage), and per job: post updates with photos from the phone, the quote builder (draft or send), payment links, payments taken in person, internal notes, publish to `/builds`. Publishing makes only the studio's photos public, and only while published.
- **Payments** ([`src/payments.ts`](./src/payments.ts)): Stripe Checkout for the deposit and the balance. The amount always comes from the approved quote. A pending `payments` row rides in the session metadata, and the rider's return and the webhook both settle it, but only one of them records it.
- **Email** ([`src/email.ts`](./src/email.ts)): the Email Service binding, then Resend, then the log. A failed send never fails the request.

## Tests

```bash
npm test                 # static checks over every page; no server
npm run test:portal      # portal + admin API, 61 checks (needs npm run dev)
npm run test:payments    # Stripe flow against a mock (see the file header)
npm run verify:browser   # /book end to end in Chrome, phone and desktop
npm run audit            # every page at six widths: overflow, taps, labels, alt, dims
npm run verify:links     # crawls every internal link on a running site
```

`npm test` checks that every page is on the v4 shell and wired the same way, that no link points at a retired route or a missing file, that images have alt text and dimensions, that every `data-cfg` resolves, that JSON-LD parses and the FAQ graph matches the page, that the sitemap lists only real indexable pages, that every Worker redirect lands on a page that exists, and that `/book`'s native post carries the field names the Worker reads.

## SEO and analytics

`/book-thanks`, `/login`, `/portal`, `/admin`, `/builds/view`, `/wrap-quote/`, `/styleguide` and `/404` are `noindex`, disallowed in `robots.txt` and left out of the sitemap. Absolute URLs come from `SITE` in `build-seo.py` and `siteUrl` in the config; change both when the site moves to its own domain, and re-run the build.

[`analytics.js`](./public/js/analytics.js) carries GA4 (`G-F2BXR858CL`). Elements with `data-track` report clicks; the wizard and portal report `book_step`, `book_photo_upload`, `book_submit`, `portal_quote_approved`, `portal_checkout` and `portal_payment_return`.

## Brand assets

The logo is the champagne sport-bike line over "K Films": [`public/images/brand/kfilms-moto-logo.png`](./public/images/brand/kfilms-moto-logo.png), with 320 and 640px WebP/PNG versions for the header, intro and footer. [`kfilms-moto-logo-on-light.png`](./public/images/brand/kfilms-moto-logo-on-light.png) is the black-and-gold version for light backgrounds (print, documents). The favicons are still the earlier mark.

## Film catalog data

The catalog reads [`vinyl-colors.json`](./public/data/vinyl-colors.json) (Metro Restyling export) in the browser, with an optional D1 price overlay from `GET /api/films`. Rebuild it with [`build-vinyl-catalog.py`](./scripts/build-vinyl-catalog.py); colour families come from [`enrich-vinyl-families.py`](./scripts/enrich-vinyl-families.py). "Add to build" saves films in `localStorage` (`kisala-vinyl-build`), and `/book` picks them up as the colour.
