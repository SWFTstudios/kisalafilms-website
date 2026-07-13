# Handoff: Kisala Films (K Films) Website

## Overview
Marketing + booking site for Kisala Films — Elombe Kisala's motorcycle vinyl-wrap business in Jersey City, NJ, paired with a YouTube channel documenting builds, behind-the-scenes life, and rider stories. Every wrap includes a cinematic transformation video for the channel. Clients who want photography/videography only (no wrap) are routed to the sister site rollerreels.com. Structure is adapted from the Carsy Webflow template (home-2 layout pattern: hero → stats → story teaser → services teaser → trust stats → process → content teaser → testimonials → pricing → cross-sell → footer), restyled with original copy and a black/orange automotive palette.

## About the Design Files
The files in this bundle are **design references built as static HTML/CSS** — they show intended layout, copy, and interaction states, not production code to copy directly. Recreate these designs in whatever stack backs `kisalafilms-website` (or, if the repo is still empty, pick the simplest appropriate stack — e.g. a static site generator or plain multi-page HTML/CSS/JS — and implement there). Preserve exact colors, type scale, spacing, and copy; re-implement layout with the target environment's own patterns (don't just iframe the HTML).

## Fidelity
**High-fidelity.** Colors, typography, spacing, and component states below are final. Copy is final except where marked `[placeholder]`.

## Global Design Tokens

**Colors**
- Background (base): `#0c0c0c`
- Background (alt section): `#111111`
- Card surface: `#141414`
- Borders / dividers: `#242424`
- Border (subtle, secondary buttons): `#2e2e2e`
- Text (primary): `#e6e4e2`
- Text (muted): `#98928c`
- Accent (brand orange): `#ff5538` — used for CTAs, ticks, chips-on-hover, links, active states, progress-bar fill
- Link hover: `#ff5538`

**Typography**
- Headings: **Hanken Grotesk** (weights 600/700/800), Google Fonts
- Body: **Manrope** (weights 400/500/700), Google Fonts
- H1 (page/hero): 40px mobile / 68px desktop (Home) or 56px desktop (subpages), weight 800, uppercase, letter-spacing -0.02em, line-height 1.04
- H2 (section): 27px mobile / 38px desktop, weight 700, uppercase, letter-spacing -0.01em, line-height 1.12
- H3 (card/item title): 16–18px, weight 600
- Body: 16px/1.65 (desktop copy), 13–15px/1.5–1.65 (secondary)
- Label/caption ("cap" style): 11px, weight 700, letter-spacing 0.14em, uppercase — used for eyebrows, nav links, button labels, chips

**Spacing / Layout**
- Max content width: 1160px, centered, 20px side padding (mobile), same gutter at desktop
- Section vertical padding: 64px mobile / 104px desktop
- Grid gaps: 14–16px between cards; 1px hairline gaps in stat bars (creates thin dividers via background color)

**Shapes**
- Sharp corners throughout (0px radius) on buttons, cards, inputs, chips — reinforces the "precision" tone
- Exception: photo slots (About/Home story photo) use a small 4px radius

**Components**
- **Primary button**: solid `#ff5538` fill, black text, uppercase 12px/700 Hanken Grotesk, letter-spacing 0.14em, 16px×24px padding, sharp corners
- **Secondary button**: transparent, 1px `#2e2e2e` border, same type treatment
- **Chip**: 1px `#3a3a3a` border, 9px/700 uppercase label, muted text color, small padding — used for service/video category tags
- **Card**: `#141414` fill, 1px `#242424` border, 22px padding; border brightens to accent orange on hover
- **Stat bar**: 3-column grid (1 column stacks don't occur — always 3 across), 1px hairline dividers via `#242424` background peeking through gaps, big orange number + small caption label
- **Progress bar** (Home "Why choose K Films"): 8px track, `#1a1a1a` fill with `#242424` border, orange fill bar, percentage label above
- **Sticky mobile CTA bar**: fixed to bottom viewport on mobile only (hidden ≥900px), two buttons side by side (primary "Start your inquiry" + secondary "Watch films"/"Subscribe")
- **Nav**: sticky header, 62px tall, translucent black + 20px backdrop blur, bottom hairline border; desktop shows full nav + pill "Book" button; mobile shows a text "Book" link + 2-line hamburger icon (no functioning menu drawer implemented — needs one built)
- **Form fields**: 1px `#242424` border, `#141414`/`#111` fill, no radius, label as small caps caption above a plain-styled input
- **Segmented control** (coverage/timeline toggle in the inquiry form): 2 buttons in a bordered row, active segment gets `#242424` fill — currently static/decorative, needs real toggle state wired up
- **FAQ accordion**: rows with a title + "+"/"–" indicator — currently static, needs expand/collapse behavior wired up (first item shown expanded with its answer visible as the "open" example)
- **Video/photo thumbnail slots**: drag-and-drop image placeholders in the prototype (a custom `<image-slot>` web component) — in production these become real `<img>`/`<video poster>` elements pointing at real assets

## Screens / Pages

### 1. Home.dc.html — hub page
Purpose: convert cold traffic, tease every other page.
Sections top to bottom:
1. **Header** (shared across all pages, see Global Nav below)
2. **Hero** — full-bleed photo/video-still background (image slot `home-hero`), gradient fade to black at the bottom, eyebrow "Motorcycle wraps × cinema · Jersey City, NJ", H1 "Express your ride.", subhead paragraph, two CTAs ("Start your inquiry" primary → Contact.html#inquiry, "Watch the films" secondary → Films.html)
3. **Stats bar** — 3 stats: Bikes wrapped (48), Videos on YouTube (120+), Views (1.2M) `[placeholder numbers]`
4. **Story teaser** — photo (image slot `home-story-photo`, 4:5 ratio, max 420px wide) + copy about Elombe Kisala + "Read the full story →" link to About.html
5. **Services teaser** — eyebrow + H2 "Technical services", 4-card grid (Full Wraps / Partial & Accents / Tank Protection / Paint Protection Film), "All services & pricing →" link to Services.html
6. **Why K Films** (dark alt background) — H2 "Built on trust, not just vinyl", 3 progress bars: On-time delivery 96%, Clients who rebook 92%, Video delivered same week 90% `[placeholder %s]`
7. **Process** — H2 "How it works", 6 numbered steps (01 Send your inquiry → 06 Reveal & premiere on the channel), no photos, just numbered rows with hairline top border
8. **Films teaser** (dark alt background) — H2 "Every wrap gets a film", horizontally-scrolling row of 4 video thumbnails (image slots `home-film-1..4`) each with a category chip (Transformation/BTS/Rider story) and title, "Subscribe on YouTube" + "Watch all films →" buttons
9. **Testimonials teaser** — H2 "Straight from the garage", 3 quote cards, "More reviews →" link to Contact.html#testimonials
10. **Pricing teaser** — H2 "Straightforward tiers", 2 cards (Full transformation $1,800+ / Accent package $650+), "See full pricing →" link to Services.html#pricing
11. **Roller Reels cross-sell banner** — copy explaining photo/video-only clients should book via rollerreels.com, with outbound link button
12. **Final CTA band** (dark alt background) — "Your bike could be the next episode." + two buttons
13. **Footer** (shared, see below)
14. **Sticky mobile CTA bar** (mobile only)

### 2. Services.dc.html
Purpose: full service list + transparent pricing.
1. Header (shared)
2. Page intro — eyebrow, H1 "What we offer", subhead mentioning Roller Reels for photo/video-only
3. **Service cards grid** (5 cards): Full Wraps, Partial & Accents, Tank Protection, Paint Protection Film, and a 5th card "Photo & Video Only" that links out to rollerreels.com (visually distinguished with a lighter border)
4. **Pricing section** `id="pricing"` (dark alt background) — 3 package cards: Protection only $250+, Full transformation $1,800+ (highlighted/featured with orange border), Accent package $650+ — each lists 3–4 bullet features with a small orange dot marker and a book button
5. Closing CTA band — "Ready to start?" + two buttons
6. Footer + sticky bar

### 3. Films.dc.html — video library ("Gallery" equivalent)
Purpose: showcase the channel content, filterable.
1. Header (shared)
2. Page intro — eyebrow "The channel", H1 "Our films"
3. **Filter tabs**: All / Transformations / BTS / Rider Stories — clicking a tab filters the grid below (active tab gets solid orange fill, others outlined). This is a real interactive filter in the prototype (client-side state), not just visual.
4. **Video grid** — responsive grid (1 col mobile / 2 col tablet / 3 col desktop) of video cards: thumbnail (image slot) + category chip + title. 9 sample items across the 3 categories.
5. Closing CTA band (dark alt background) — "New episodes weekly" + Subscribe/Follow buttons + "Want your bike in the next one? →" link to Contact.html#inquiry
6. Footer + sticky bar

### 4. About.dc.html
Purpose: build trust, tell Elombe's story, explain the Roller Reels relationship.
1. Header (shared)
2. Page intro — eyebrow "Craftsmanship & precision", H1 "The engineer's touch"
3. **Bio section** — photo (image slot `about-photo`, 4:5, max 440px) + "Elombe Kisala" subhead + two paragraphs of bio copy
4. **Values grid** (3 cards): Precision / Craft / Story, each with a short title + description
5. **Roller Reels explainer banner** (dark alt background) — explains the sister network for photo/video-only bookings, link out
6. Closing CTA — "Want to be next?" + two buttons
7. Footer + sticky bar

### 5. Contact.dc.html
Purpose: capture leads, show trust, answer objections.
1. Header (shared)
2. Page intro — eyebrow "Start your build", H1 "Let's build something"
3. **Inquiry form** `id="inquiry"` (dark alt background) — fields: Motorcycle make & model (text), Desired color/finish idea (text), Coverage level (segmented: Full wrap / Partial), Timeline (segmented: ASAP / Flexible), Submit button. **Not wired to a real backend in the prototype** — needs a real submit handler/endpoint.
4. **Testimonials** `id="testimonials"` — H2 "Straight from the garage", 4 quote cards (2×2 grid at tablet+)
5. **FAQ** — 4 accordion rows (How long does a full wrap take? / Will a wrap damage my paint? / What does the video cost? / Can I book just a photo/video shoot?) — only the first row's answer is shown expanded in the prototype; needs real expand/collapse wired to all rows
6. **Other contact methods** (dark alt background) — 3 info cards: Text or call, Instagram DM, Location & hours (Jersey City, NJ · by appointment)
7. Footer + sticky bar

## Global Nav (all pages)
- Logo "K FILMS" (wordmark, no icon) links to Home
- Desktop (≥900px): inline nav — Services / Films / About / Contact + a filled "Book" pill button, all linking to the respective page (Contact.html#inquiry for Book)
- Mobile (<900px): a text "Book" link + a 2-line hamburger icon, both currently **non-functional as a menu** — needs a real mobile nav drawer/sheet built in production
- Active page is not currently highlighted in the prototype — consider adding an active-state style

## Global Footer (all pages)
- "K FILMS" wordmark
- Link row: Services / Films / About / Contact / YouTube / Instagram / Roller Reels (YouTube + Instagram are placeholder `#` links — need real URLs)
- Copyright line: "© 2026 Kisala Films — Jersey City, NJ. Every wrap ends with a film."

## Interactions & Behavior Needing Real Implementation
- **Mobile hamburger menu**: currently a static icon with no drawer/overlay — build a real nav menu
- **FAQ accordions** (Home has none; Contact has 4 rows): build expand/collapse, only first row shown "open" as a static example
- **Segmented controls** (coverage level, timeline in the inquiry form): static active-state styling only — wire to real form state
- **Films page category tabs**: already interactive in the HTML prototype (vanilla state) — reproduce this filter behavior in the target stack
- **Inquiry form submission**: no backend — needs a real endpoint/handler and success/error states
- **Video playback**: the hero background and all film thumbnails are static image placeholders in this prototype (a drag-and-drop `<image-slot>` component used for design purposes only). Production needs real `<video>`/YouTube-embed elements. **Video hosting platform was not yet decided by the client at handoff time** — confirm with them (self-hosted files vs. YouTube vs. Instagram embeds) before implementing players.
- **Horizontal scroll rows** (film teaser on Home): simple overflow-x scroll with hidden scrollbars — touch/drag scroll should work natively; consider adding scroll-snap in production

## Assets
- Fonts: Google Fonts — Hanken Grotesk (600/700/800), Manrope (400/500/700)
- No custom icons or illustrations used — all imagery is real photo/video content to be supplied by the client (motorcycle wraps, workshop shots, rider portraits, video thumbnails). Every image/thumbnail placeholder in the HTML is marked with a plain-language caption describing what real asset belongs there.
- Brand accent color `#ff5538` and the black/near-black palette are the only "visual asset" — no logo file exists yet beyond the "K FILMS" text wordmark.

## Files in This Bundle
- `Home.dc.html` — hub/landing page
- `Services.dc.html` — services + pricing
- `Films.dc.html` — video library with filter tabs
- `About.dc.html` — story/bio page
- `Contact.dc.html` — inquiry form, testimonials, FAQ
- `image-slot.js` — the drag-and-drop placeholder web component referenced by the pages above (design-tool only, not for production use)

Open any `.dc.html` file directly in a browser to view it — no build step required. Note these are single-file custom-element-based prototypes (`<x-dc>`/`<x-import>` markup from the design tool); a developer should read the rendered HTML/CSS/copy, not port the custom tags verbatim.
