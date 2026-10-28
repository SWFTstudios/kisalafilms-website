# K Films redesign plan — premium motorcycle film studio

**Status:** built on the `redesign` branch, phases 0–8 complete. See [GO-LIVE.md](./GO-LIVE.md) before merging. Open questions in §10 not answered during the build were filled with the defaults listed there.
**HQ / workshop:** 95 Christopher Columbus Dr, Jersey City, NJ 07302 (wraps are done here)
**Reference:** forgeautomotive.co.uk

---

## 1. Where we're starting from

The site is already a Jersey City motorcycle wrap business. The redesign changes **how it looks and how customers book**, not what the business is. Here's what exists today:

| Already have | Keep / change |
| --- | --- |
| Static pages on a Cloudflare Worker, plus a D1 database | **Keep.** This is a good, cheap stack. |
| Stripe Checkout, plus a webhook (`/api/checkout/*`, `/api/webhooks/stripe`) | **Keep and extend** so it covers deposits and the balance due on each job |
| `motorcycles.json` year/make/model data, plus `bike-search.js` | **Keep.** It powers the new bike picker. |
| Quote form that posts to FormSubmit (10MB photo limit, sent to your email inbox) | **Replace.** Photos upload to Cloudflare R2 storage, and each job lives in D1. |
| Firebase email/password login (customers have no real portal yet) | **Replace** with a real customer portal (see §5) |
| Red/black "WRAP IT. RIDE IT." visual style, Barlow Condensed font | **Replace** with the new premium design system |
| About 69 pages, including shop, merch, photoshoots, lookbook, vinyl catalog, journal, helmet services | **Cut down** to about 12 focused pages (see §3) |

> ⚠️ `main` has about 87 uncommitted changes right now. Before the redesign starts, we should commit them or put them on a branch, so nothing gets lost.

---

## 2. Design direction ("Forge, but for bikes")

What makes Forge feel premium, and how each idea carries over:

- **Black canvas, cinematic photos.** Full-bleed, low-key studio shots with the bike lit against black and lots of negative space. *This is the biggest dependency: the look only works with excellent photos* (see open questions).
- **Editorial type.** A thin, high-contrast serif for headlines (e.g. *Instrument Serif* or *Cormorant Garamond*), with a small, wide-tracked grotesk for labels and buttons (e.g. *Inter* / *Neue Montreal*-style). Shouting all-caps condensed type goes away.
- **Restraint with colour.** Near-black, warm off-white, and one metal accent (brushed steel or a muted bronze) in place of the bright red.
- **Minimal chrome.** Centred K Films monogram, social icons on the left, "MENU ☰" on the right that opens a full-screen overlay nav, and one quiet "Start your build" button.
- **Chaptered storytelling.** Numbered sections (`01 / 03`), slow word-by-word headline reveals on scroll, split panels with a sticky image on one side and copy on the other, and a thin scroll-progress line.
- **Motion with purpose.** Smooth scroll and subtle parallax, kept light (CSS plus a small amount of vanilla JS, no heavy libraries) and switched off for `prefers-reduced-motion`.
- **Entry moment.** A short brand intro on the first visit only. It never blocks the page and never shows on return visits.

Mobile gets the same feel with stacked panels, a thumb-reachable "Start your build" button, and no horizontal scroll.

---

## 3. New sitemap

| Page | What it does |
| --- | --- |
| **Home** | Hero film or still → manifesto line → 3 chapters (Protect · Transform · Detail) → services → featured builds → studio/HQ → CTA |
| **Services** (hub + detail pages) | Full colour-change wrap · Partial / accent wrap · Paint protection film (PPF) · Custom livery & graphics · Chrome delete & trim · Ceramic / detailing add-on. Each page shows "from" pricing, finish options and an example build. |
| **Builds** (portfolio) | Grid of finished bikes. Each build gets a case-study page with before/after, film used, timeline and a photo gallery. |
| **Finishes** | Gloss, satin, matte, colour-shift, chrome, textured, PPF. Lighter than today's vinyl catalog. |
| **Process** | Inquiry → quote → deposit → drop-off → wrap → QC → pickup, with what to expect at each step |
| **The Studio** | About you and the HQ at 95 Christopher Columbus Dr: map, hours, drop-off by appointment, pickup zones (Brooklyn/NYC) |
| **FAQ** | Care, durability, removal, timelines, payment |
| **Start your build** (`/book`) | The intake wizard (§4) |
| **Portal** (`/portal`) | Customer login, their bikes and jobs (§5) |
| **Studio admin** (`/admin`) | Your private dashboard (§6) |
| Jersey City / Brooklyn / NYC landing pages | Kept for local SEO, restyled |

**Retired** (redirected, not deleted): shop, merch, photoshoot, lookbook, journal, testimonials page (reviews move onto Home and Builds), wrap-studio, wrap-quote, helmet services (*unless you want to keep helmets*).

---

## 4. "Start your build": intake wizard

One page with one step on screen at a time and a progress bar. It saves a draft as you go, so a refresh never loses work.

1. **Your bike.** Year → make → model from `motorcycles.json`, with search-as-you-type and an "Other / not listed" option. Optional colour, mileage and VIN.
2. **What you want.** Choose a service (cards with images), then coverage (full / partial / specific panels on a simple bike diagram), finish and colour (optional film picker from the catalog, or "help me choose").
3. **Photos.** Drag-and-drop or phone camera, up to 20 photos. Images are compressed in the browser and uploaded straight to R2 with a progress bar for each one. A guide shows which angles to shoot (left, right, front, rear, tank top, damage close-ups).
4. **Notes & timing.** Free-text notes, inspiration links or images, preferred dates, drop-off vs. pickup (with the pickup fee shown).
5. **You.** Name, email, phone. Submitting creates the customer account and the job, then emails a portal link.
6. **Confirmation.** A ballpark range (from today's estimator logic), what happens next, and an optional **"Reserve your slot" deposit** paid via Stripe.

This replaces FormSubmit. Every inquiry, photo and note lives in your database, and you still get an email alert.

---

## 5. Customer portal

**Login:** passwordless. The customer enters an email and gets a one-time link or code, so there are no passwords to forget. *(Recommended over the current Firebase email/password setup. See open questions.)*

**Portal home:** their bike(s) and active or past jobs.

**Job page:**
- **Progress timeline** with clear stages:
  `Inquiry received → Quote ready → Booked (deposit paid) → Bike checked in → Prep & disassembly → Wrapping → Reassembly & QC → Ready for pickup → Complete`
- **Progress photos** you post at each stage, shown in a gallery
- **Quote** with line items. The customer can approve it in one click.
- **Payments:** pay the deposit or remaining balance, and see receipts
- **Messages / notes:** a simple thread between customer and studio, with photo attachments
- **Details:** add more photos or edit notes until the bike is checked in
- **Aftercare:** care guide, warranty info, and a "leave a review" prompt once the job is complete

**Notifications:** an email on every stage change, new photo set, quote or payment. SMS via Twilio can come later.

---

## 6. Studio admin (for you)

- **Job board:** columns per stage that you drag between, plus filters and search
- **Job detail:** bike info, customer photos, notes, internal notes, film/roll estimate (reuses the existing internal pricing sheet logic)
- **Build a quote:** line items, deposit %, send to customer
- **Update stage plus upload progress photos from your phone**, which notifies the customer automatically
- **Payments view:** what's paid and what's outstanding, with a "send payment link" button
- One-click "publish to Builds" to turn a finished job into a portfolio case study

Admin access is limited to your email or emails.

---

## 7. Payments (Stripe)

- **Stripe Checkout:** cards, Apple Pay and Google Pay, plus Affirm/Klarna financing if you turn it on
- **Deposit** to book a slot (amount or % configurable, e.g. $250 or 25%)
- **Balance** due at pickup, paid from the portal or a payment link you send
- **Webhook** marks payments as paid on the job and sends receipts automatically
- Builds on the existing `src/deposit.ts` / `src/orders.ts` / webhook code

---

## 8. Technical architecture

- **Cloudflare Worker** (existing) handles the API, auth and Stripe
- **D1** (existing) gets new tables: `customers`, `bikes`, `jobs`, `job_events` (stage history), `job_photos`, `messages`, `quotes`, `payments`, `sessions`
- **R2** (new) stores customer and progress photos, which are private and served only to the owning customer and admin
- **Email**: Cloudflare Email Service or Resend for login links and notifications
- **Front end**: stays static HTML + vanilla JS (matches today's code, fast, no build step). The portal and admin are small JS apps on top of the API.
- Analytics: keep GA4. Add tracking events for wizard steps and payments.
- Redirects for every retired URL, plus updated sitemap and `LocalBusiness` schema with the new HQ address.

---

## 9. Build phases

| # | Phase | You can review |
| --- | --- | --- |
| 0 | Commit current work, create a `redesign` branch | — |
| 1 | Design system: type, colour, grid, motion, nav overlay. Built as a styleguide page, then the Home page. | **Home page preview** (design sign-off before going further) |
| 2 | Remaining marketing pages + redirects | Full marketing site preview |
| 3 | Back end: D1 schema, R2 uploads, passwordless login, email | — |
| 4 | Intake wizard | Submit a test build |
| 5 | Customer portal | Log in as a test customer |
| 6 | Studio admin | Run a test job end-to-end |
| 7 | Stripe deposit/balance in **test mode** | Pay with a Stripe test card |
| 8 | QA (mobile, accessibility, speed), SEO, then go live with real Stripe keys | Final sign-off |

Phase 1 gets its own review before the rest is built, so the look is agreed early.

---

## 10. Questions for you

1. **Brand:** keep the name **K Films**, or rebrand? Do you have a logo/monogram you want to keep?
2. **Helmets:** drop helmet wraps entirely, or keep them as a small add-on?
3. **Services & pricing:** is the list in §3 right? What "from" prices should show?
4. **Deposit:** fixed amount (e.g. $250) or a percentage? Refundable?
5. **Photos:** do you have high-end shots of finished bikes? If not, I'd recommend a studio shoot (even 3–4 bikes). Until then I'll use your best existing images with placeholders flagged.
6. **Login style:** passwordless email link/code (recommended), or keep passwords?
7. **Address:** OK to show 95 Christopher Columbus Dr publicly with a map, with drop-off **by appointment only**? Hours?
8. **Cut pages:** OK to retire the shop, merch, photoshoot, lookbook and vinyl catalog pages?
9. **Pickup service:** still offering Brooklyn/NYC pickup?
