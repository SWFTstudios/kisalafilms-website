#!/usr/bin/env python3
"""Generate the v4 marketing pages.

Every page here is composed from scripts/v4_page.py (head, chrome, components)
and the content below, then written to public/ and committed. Edit the content
here and re-run rather than editing the output: the next run overwrites it.

It also re-syncs the CHROME4 header and footer into any other page that carries
the markers (the style guide, and the app pages as they move to v4), so the
home page stays the one place the chrome is edited.

    python3 scripts/build-v4-pages.py

Prices are never written as facts here: each one is a data-cfg span whose text
is only the JS-off fallback, and config-apply.js fills in the live number from
kisala-config.js.
"""
from __future__ import annotations

from pathlib import Path

from v4_page import (
    BOOK_URL, PUBLIC, btn, chrome_blocks, crumbs, finale, mask, page, picture, sync_chrome,
)

OUT: dict[str, str] = {}


def price(key: str, fallback: str, field: str = "from") -> str:
    path = f"services.{key}.{field}" if not key.startswith(("addons.", "transport.", "zones.")) else key
    return f'<span data-cfg="{path}">{fallback}</span>'


def lines(items, two: bool = True, start: int = 1) -> str:
    rows = "\n".join(
        f'          <li class="rv"><span>{i:02d}</span><div><h3>{t}</h3><p>{d}</p></div></li>'
        for i, (t, d) in enumerate(items, start)
    )
    return f'        <ul class="lines{" lines--two" if two else ""}">\n{rows}\n        </ul>'


def faq(items, open_first: bool = False) -> str:
    rows = "\n".join(
        f'          <div class="faq-item{" open" if open_first and i == 0 else ""}">'
        f'<button class="faq-q" type="button">{q}<span class="mark">{"–" if open_first and i == 0 else "+"}</span></button>'
        f'<p class="faq-a">{a}</p></div>'
        for i, (q, a) in enumerate(items)
    )
    return f'        <div class="faq-list">\n{rows}\n        </div>'


# =============================================================================
# Services
# =============================================================================

SERVICES = [
    {
        "slug": "colour-change",
        "name": "Colour change",
        "title_lines": ["Colour", "<em>change.</em>"],
        "seo": "Motorcycle Colour-Change Wraps in Jersey City | K Films",
        "description": "Full colour-change motorcycle wraps in premium cast film, panels off and edges wrapped, from a Jersey City studio. From $1,650.",
        "cfg": "fullWrap", "fallback": "$1,650",
        "meta2": ("In the studio", "2&ndash;3 days"),
        "short": "Full-coverage cast film in any finish, wrapped into the panel gaps so no original paint shows at the seams.",
        "lede": "Every painted panel in premium cast film. Fairings come off, film goes around the edges and into the gaps, and the factory paint underneath stays exactly as it was.",
        "hero": "/images/refs/ref-01-front-3q",
        "hero_alt": "Front three-quarter view of a sport bike in a gloss-black colour change",
        "statement": "A colour change should look like the bike left the factory that way. That means no visible seams across a panel, no paint showing at the edges, and no film trimmed flush where it should have been wrapped.",
        "included": [
            ("Panels off", "Fairings, tank covers and tail come off so film wraps the edges instead of stopping at them."),
            ("Premium cast film", "Conformable cast film that holds compound curves without shrinking back."),
            ("Edges and gaps wrapped", "Film turned around every edge and tucked into panel gaps, where a flush trim would lift."),
            ("Seams on factory lines", "Where a join is unavoidable, it sits on a line the bike already has."),
            ("Surface prep", "Decontamination wash, clay and an alcohol wipe before any film touches a panel."),
            ("Reassembly and QC", "Every panel refitted, every edge checked under raking light before handover."),
        ],
        "steps": [
            ("Inspect", "Paint, plastics and any old film are checked first. Problems surface before the quote is final, not on collection day."),
            ("Strip down", "Bodywork comes off and is laid out panel by panel."),
            ("Wrap", "Each panel is wrapped on its own, heated and post-heated so the film sets into its shape."),
            ("Rebuild", "Panels go back on, fixings torqued, gaps and edges checked again in place."),
        ],
        "process_image": ("/images/thumb-transformation-mid", "Copper film being laid across a fairing on the bench"),
        "pair": [("/images/refs/ref-02-left-profile", "Left profile of a gloss-black sport bike"),
                 ("/images/refs/ref-04-rear-3q", "Rear three-quarter view of a gloss-black sport bike")],
        "faq": [
            ("Does a wrap damage the paint?", "Not factory paint in good condition. Cast film protects it while it is on and comes off cleanly. Resprayed, oxidised or lifting paint can come away with the film, so if your bike has any of that, you hear about it before anything is booked."),
            ("How long will it last?", "Several years is typical for quality cast film, depending on sun, storage and washing. A bike garaged over winter ages far slower than one parked outside all year. You get a straight answer for the specific film you choose."),
            ("Can it be removed later?", "Yes. A colour change is fully reversible, which also makes it the safest way to change a bike you might sell."),
        ],
    },
    {
        "slug": "paint-protection",
        "name": "Paint protection",
        "title_lines": ["Paint", "<em>protection.</em>"],
        "seo": "Motorcycle Paint Protection Film (PPF) in Jersey City | K Films",
        "description": "Clear, self-healing paint protection film for motorcycles: tank, fairings, headlight and high-wear zones, gloss or satin. Jersey City studio, from $450.",
        "cfg": "ppf", "fallback": "$450",
        "meta2": ("Finish", "Gloss or satin"),
        "short": "Clear, self-healing urethane film over the tank, fairings, headlight and every surface that takes a hit.",
        "lede": "Clear, self-healing urethane film over the surfaces that take the abuse: tank, leading edges, headlight and the places your knees, boots and jacket buckles sit.",
        "hero": "/images/refs/ref-10-tank-cockpit",
        "hero_alt": "Tank and cockpit of a black sport bike with clear film over the knee areas",
        "statement": "Protection film is the work nobody is meant to notice. It goes over paint, or over a colour-change wrap, and stops the stone chips and buckle rash that would otherwise be there in a season.",
        "included": [
            ("Self-healing film", "Light swirls and scuffs close up with warmth from the sun or warm water."),
            ("Gloss or satin", "Keep the factory shine, or turn gloss paint satin while you protect it."),
            ("Tank and knee zones", "The areas your knees, boots and buckles wear first."),
            ("Leading edges", "Nose, fender and fairing edges where road debris lands."),
            ("Headlight and screen", "Clear film over lenses and the lower screen."),
            ("Over a wrap", "PPF can go over a new colour change to protect it too."),
        ],
        "steps": [
            ("Choose coverage", "High-wear zones only, the front end, or the whole bike."),
            ("Decontaminate", "Paint is washed, clayed and wiped so nothing is sealed under the film."),
            ("Fit", "Film is laid with slip solution, squeegeed out and the edges wrapped where they can be."),
            ("Cure", "The film is left to settle before handover, with care notes for the first week."),
        ],
        "process_image": ("/images/about-vinyl-hands", "Gloved hands working film onto a fairing"),
        "pair": [("/images/refs/ref-09-headlight-detail", "Headlight and front fairing detail"),
                 ("/images/refs/ref-05-head-on", "Head-on view of a black sport bike")],
        "faq": [
            ("Will I be able to see it?", "On gloss paint, from a normal distance, no. Edges are the giveaway, which is why they are wrapped wherever the panel allows."),
            ("Does it go over a wrap?", "Yes. Protection film over a colour change is the best way to keep a new wrap looking new in the high-wear areas."),
            ("Do I need the whole bike done?", "Most riders don't. Tank, knee areas and the front end cover most of the damage a road bike actually sees."),
        ],
    },
    {
        "slug": "accents",
        "name": "Accents &amp; partials",
        "title_lines": ["Accents &amp;", "<em>partials.</em>"],
        "seo": "Partial Motorcycle Wraps & Accents in Jersey City | K Films",
        "description": "Partial motorcycle wraps and accents: tank, tail, fairing sides or contrast panels in cast film, from a Jersey City studio. From $575.",
        "cfg": "partialWrap", "fallback": "$575",
        "meta2": ("In the studio", "1&ndash;2 days"),
        "short": "Tank, tail, fairing sides or a contrast finish on chosen panels, the quickest way to make a stock bike yours.",
        "lede": "Tank, tail, fairing sides, a two-tone split or a contrast finish on chosen panels. The quickest way to make a stock bike unmistakably yours.",
        "hero": "/images/refs/ref-07-low-nose",
        "hero_alt": "Low front view of a black sport bike against a warm-lit wall",
        "statement": "Not every bike needs a full change. A satin tank on a gloss bike, a single scratched fairing covered, a contrast tail: done with the same panels-off care, partials can say more than a whole new colour.",
        "included": [
            ("Single panels", "Cover a scratched or faded panel without changing the whole bike."),
            ("Two-tone splits", "A second colour or finish split along the bodywork's own lines."),
            ("Tank and tail", "The two panels that change a bike's character most."),
            ("Contrast finishes", "Satin over gloss, gloss over matte, or a metallic flash."),
            ("Panels off", "Same as a full wrap: edges wrapped, not trimmed."),
            ("Matched to the bike", "Film chosen to sit alongside the factory colour, not fight it."),
        ],
        "steps": [
            ("Plan the split", "Which panels, which finish, and where one meets the other."),
            ("Remove", "Only the panels being wrapped come off."),
            ("Wrap", "Each panel wrapped edge to edge and post-heated."),
            ("Refit", "Panels back on and checked against the rest of the bike."),
        ],
        "process_image": ("/images/thumb-panel-lines", "Blade trimming film along a fairing panel line"),
        "pair": [("/images/refs/ref-03-right-profile", "Right profile of a black sport bike"),
                 ("/images/refs/ref-06-rear-straight", "Rear view of a black sport bike")],
        "faq": [
            ("Can you wrap just one fairing?", "Yes. Single panels, a tank on its own or a tail section are all normal jobs."),
            ("Will a partial match my paint?", "Exact paint matching isn't what film does well. The better result is a deliberate contrast: a different finish or colour that looks intended."),
            ("Can I add more later?", "Yes. Many riders start with a tank or tail and come back for the rest."),
        ],
    },
    {
        "slug": "custom-livery",
        "name": "Custom livery",
        "title_lines": ["Custom", "<em>livery.</em>"],
        "seo": "Custom Motorcycle Livery & Printed Graphics in Jersey City | K Films",
        "description": "Custom printed motorcycle liveries and graphics designed around your bike's bodywork, proofed before printing. Jersey City studio, from $950.",
        "cfg": "customPrint", "fallback": "$950",
        "meta2": ("Includes", "Design proof"),
        "short": "Printed graphics and race-inspired liveries designed around your bike's bodywork, proofed with you first.",
        "lede": "Printed graphics and race-inspired liveries, designed around the shape of your bike's bodywork and proofed with you before anything goes to print.",
        "hero": "/images/thumb-wrap-process",
        "hero_alt": "Gloved hands laying copper film across a fairing",
        "statement": "A livery is designed for one bike. Lines follow the bodywork, numbers sit where they can be read, and every panel is laid out before printing so the design meets itself across the gaps.",
        "included": [
            ("Design session", "Your references and ideas turned into a first concept."),
            ("Panel-by-panel layout", "The design mapped onto your bike's actual panels, so lines carry across gaps."),
            ("Written proof", "You approve the layout before anything is printed."),
            ("Printed and laminated", "Printed cast film with a protective laminate."),
            ("Panels off", "Installed with the same edge-wrapped method as a colour change."),
            ("Files kept", "Your design is kept on file for repairs or a matching helmet later."),
        ],
        "steps": [
            ("Brief", "References, colours, numbers and anything you want on the bike."),
            ("Design and proof", "A layout on your bike's panels, revised with you until it is right."),
            ("Print", "Printed and laminated once the proof is signed off."),
            ("Install", "Panels off, livery on, rebuilt and checked."),
        ],
        "process_image": ("/images/thumb-shop-bts", "Working at the bench in the Jersey City studio"),
        "pair": [("/images/refs/ref-08-overhead-3q", "Overhead three-quarter view of a black sport bike"),
                 ("/images/refs/ref-12-night-motion", "Sport bike riding through Jersey City at night")],
        "faq": [
            ("Do I need a finished design?", "No. A few references and a direction are enough to start. The design work is part of the service."),
            ("Can I bring my own artwork?", "Yes. Supply vector files if you have them, and the layout is adapted to your bike's panels."),
            ("How long does a livery take?", "Longer than a colour change, because design and proofing come first. You get the timeline with the quote."),
        ],
    },
    {
        "slug": "chrome-delete",
        "name": "Chrome delete &amp; trim",
        "title_lines": ["Chrome delete", "&amp; <em>trim.</em>"],
        "seo": "Motorcycle Chrome Delete, Light Tint & Trim in Jersey City | K Films",
        "description": "Motorcycle chrome delete, headlight and tail tint, rim stripes and trim in gloss or satin black. Jersey City studio, from $275.",
        "cfg": "chromeDelete", "fallback": "$275",
        "meta2": ("In the studio", "Usually 1 day"),
        "short": "Exhaust shields, mirrors, levers and trim in satin or gloss black, plus light tints and rim stripes.",
        "lede": "Exhaust shields, mirrors, levers and brightwork taken to satin or gloss black, with light tints and rim stripes to finish the bike as one design.",
        "hero": "/images/refs/ref-11-wheel-brake",
        "hero_alt": "Front wheel and brake caliper detail",
        "statement": "Small parts decide whether a bike looks finished. Chrome that fights the paint, a bright tail light on a dark bike, plain rims: detail work pulls everything into the same direction.",
        "included": [
            ("Chrome delete", "Trim, shields, badges and brightwork in gloss or satin black."),
            ("Light tints", "Headlight and tail light tint, kept road legal."),
            ("Rim stripes", "Wheel tape in a colour or finish that ties into the bike."),
            ("Mirrors and levers", "Small parts finished to match the rest."),
            ("Heat-rated film", "Film rated for the area it goes on, including near exhausts."),
            ("Reversible", "All of it comes off cleanly if you change your mind."),
        ],
        "steps": [
            ("Pick the parts", "Which trim, which lights, which finish."),
            ("Prep", "Parts cleaned and, where it helps, removed."),
            ("Fit", "Film laid, heated and trimmed to each part."),
            ("Check", "Lights tested, everything checked in daylight."),
        ],
        "process_image": ("/images/thumb-before-strip", "Black sport bike on a paddock stand in the studio"),
        "pair": [("/images/refs/ref-09-headlight-detail", "Headlight detail"),
                 ("/images/refs/ref-11-wheel-brake", "Front wheel and brake detail")],
        "faq": [
            ("Are tinted lights legal?", "Light tints are kept to a level that stays visible and road legal. Rules differ by state, so you get a straight answer on what's sensible for your bike."),
            ("Can you do this with a bigger wrap?", "Yes, and it is cheaper added to a colour change or partial than booked on its own."),
            ("Will it survive exhaust heat?", "Only heat-rated film goes near exhausts. Parts that get too hot for any film are left alone, and you'll be told which."),
        ],
    },
]


def service_page(i: int, s: dict) -> str:
    nxt = SERVICES[(i + 1) % len(SERVICES)]
    included = lines(s["included"])
    steps = "\n".join(
        f'            <li class="step rv{" rv-d" + str(n) if n else ""}"><span class="step-num">{n + 1:02d}</span><h3>{t}</h3><p>{d}</p></li>'
        for n, (t, d) in enumerate(s["steps"])
    )
    pimg, palt = s["process_image"]
    (a_img, a_alt), (b_img, b_alt) = s["pair"]
    body = f"""
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-media">{picture(s['hero'], s['hero_alt'], attrs='fetchpriority="high" decoding="async"')}</div>
      <div class="wrap page-hero-grid">
        <div>
          {crumbs([("Home", "/"), ("Services", "/services"), (s['name'], None)])}
          {mask(s['title_lines'], "display-xl", "h1", "page-title")}
        </div>
        <div>
          <p class="lede rv">{s['lede']}</p>
          <dl class="svc-meta rv">
            <div><dt class="label">From</dt><dd>{price(s['cfg'], s['fallback'])}</dd></div>
            <div><dt class="label">{s['meta2'][0]}</dt><dd>{s['meta2'][1]}</dd></div>
          </dl>
          <div class="rv">{btn("Start your build", track=f"service-{s['slug']}-hero")}</div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap statement">
        <p class="label rv">Service {i + 1:02d}</p>
        <div>
          <p class="display-s" data-words>{s['statement']}</p>
        </div>
      </div>
    </section>

    <section class="section--tight" aria-labelledby="included-title">
      <div class="wrap">
        <div class="section-head section-head--split">
          <div>
            <p class="label rv">What's included</p>
            {mask(["Done properly,", "<em>every time.</em>"], "display-m", "h2", "included-title")}
          </div>
        </div>
{included}
      </div>
    </section>

    <section class="section" aria-labelledby="how-title">
      <div class="wrap split">
        <figure class="split-figure wipe">{picture(pimg, palt, sizes="(min-width: 900px) 50vw, 100vw", img_attrs="data-parallax")}</figure>
        <div>
          <p class="label rv">How it's done</p>
          {mask(["Four stages,", "<em>no shortcuts.</em>"], "display-m", "h2", "how-title")}
          <ol class="steps" style="grid-template-columns:1fr">
{steps}
          </ol>
        </div>
      </div>
    </section>

    <section class="section--tight" aria-label="Photos">
      <div class="wrap pair">
        <figure class="wipe">{picture(a_img, a_alt, sizes="(min-width: 900px) 42vw, 100vw")}</figure>
        <figure class="wipe">{picture(b_img, b_alt, sizes="(min-width: 900px) 58vw, 100vw")}</figure>
      </div>
    </section>

    <section class="section" aria-labelledby="faq-title">
      <div class="wrap statement">
        <div>
          <p class="label rv">Good to know</p>
          <h2 class="display-s rv" id="faq-title" style="margin-top:18px">Questions riders ask about {s['name'].lower()}.</h2>
          <p class="rv" style="margin-top:28px"><a class="link-line" href="/faq">All questions <span class="btn-arrow" aria-hidden="true"></span></a></p>
        </div>
{faq(s['faq'], open_first=True)}
      </div>
    </section>

    <section aria-label="Next service">
      <div class="wrap">
        <a class="next-page" href="/services/{nxt['slug']}">
          <span class="label">Next service</span>
          <span class="display-l">{nxt['name']} <span class="btn-arrow" aria-hidden="true"></span></span>
        </a>
      </div>
    </section>
{finale(f"service-{s['slug']}-final")}"""
    return page(s["seo"], s["description"], body)


def services_hub() -> str:
    rows = "\n".join(
        f"""          <a class="index-row rv" href="/services/{s['slug']}">
            <span class="num">{n:02d}</span>
            <h3>{s['name']}</h3>
            <dl class="price"><dt class="label">From</dt><dd>{price(s['cfg'], s['fallback'])}</dd></dl>
            <p>{s['short']}</p>
            <span class="index-thumb" aria-hidden="true">{picture(s['hero'], '', sizes='300px', widths=(640,))}</span>
          </a>"""
        for n, s in enumerate(SERVICES, 1)
    )
    addons = lines([
        ("Tank guard", f"Clear protection film over the knee and buckle zones. From {price('addons.tankGuard', '$180')}."),
        ("Rim stripes", f"Wheel tape in a colour or finish that ties the bike together. From {price('addons.rimTape', '$120')}."),
        ("Light tint", f"Headlight and tail light tint, kept road legal. From {price('addons.lightTint', '$90')}."),
        ("Remove an old wrap", f"Old film and adhesive taken off cleanly before the new one goes on. From {price('addons.stripOldWrap', '$150')}."),
    ])
    body = f"""
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-media">{picture("/images/refs/ref-03-right-profile", "Right profile of a black sport bike under studio light", attrs='fetchpriority="high" decoding="async"')}</div>
      <div class="wrap page-hero-grid">
        <div>
          {crumbs([("Home", "/"), ("Services", None)])}
          {mask(["Shaped with", "<em>intent.</em>"], "display-xl", "h1", "page-title")}
        </div>
        <div>
          <p class="lede rv">Five services, one standard: panels off, premium film, edges wrapped. Each one is quoted on your bike, from your photos, before anything is booked.</p>
          <div class="rv">{btn("Start your build", track="services-hero")}</div>
        </div>
      </div>
    </section>

    <section class="section" aria-label="All services">
      <div class="wrap">
        <div class="index">
{rows}
        </div>
      </div>
    </section>

    <section class="section--tight" aria-labelledby="addons-title">
      <div class="wrap">
        <div class="section-head section-head--split">
          <div>
            <p class="label rv">Add-ons</p>
            {mask(["The finishing", "<em>touches.</em>"], "display-m", "h2", "addons-title")}
          </div>
          <p class="body rv rv-d1">Added to any service. Cheaper booked with a bigger job than on their own.</p>
        </div>
{addons}
      </div>
    </section>

    <section class="section" aria-labelledby="pricing-title">
      <div class="wrap statement">
        <p class="label rv">How pricing works</p>
        <div>
          <h2 class="display-s" id="pricing-title" data-words>Prices start where shown. The real number depends on your bike: how much bodywork comes off, the film you choose and the condition of the paint underneath.</h2>
          <p class="body rv">Send the bike's details and photos and you get a written quote, with transport as its own line. Approve it and reserve your studio date with a deposit online; the balance is paid when you collect.</p>
          <div class="rv" style="margin-top:28px"><a class="link-line" href="/process">See the full process <span class="btn-arrow" aria-hidden="true"></span></a></div>
        </div>
      </div>
    </section>
{finale("services-final")}"""
    return page(
        "Motorcycle Wrap & Protection Services in Jersey City | K Films",
        "Motorcycle colour-change wraps, paint protection film, accents, custom liveries and chrome delete from a Jersey City studio. Prices from $275.",
        body,
    )


# =============================================================================
# Builds
# =============================================================================

def builds_page() -> str:
    body = f"""
    <section class="page-hero page-hero--plain" aria-labelledby="page-title">
      <div class="wrap page-hero-grid">
        <div>
          {crumbs([("Home", "/"), ("Builds", None)])}
          {mask(["The", "<em>builds.</em>"], "display-xl", "h1", "page-title")}
        </div>
        <p class="lede rv">Every bike that leaves the studio, shot in the same light. The portfolio is being built in public, one bike at a time.</p>
      </div>
    </section>

    <section class="section--tight" aria-label="Builds">
      <div class="wrap build-grid">
        <a class="build-card rv" href="/builds/honda-cbr600-f4i">
          <figure>
            <div class="frame">{picture("/images/hero-f4i-garage-night", "Black Honda CBR600 F4i in the studio at night", sizes="100vw")}</div>
            <figcaption><div><h3>Honda CBR600 F4i</h3><p class="meta">Build 001 &middot; Gloss black colour change</p></div><span class="link-line">View build <span class="btn-arrow" aria-hidden="true"></span></span></figcaption>
          </figure>
        </a>
        <div class="build-card build-card--empty rv">
          <figure>
            <div class="frame"><p class="display-s">Build 002</p></div>
            <figcaption><div><h3>Your bike here</h3><p class="meta">Founding build &middot; <span data-cfg="founding.slotsRemaining" data-cfg-format="integer">6</span> of <span data-cfg="founding.slotsTotal" data-cfg-format="integer">8</span> open</p></div></figcaption>
          </figure>
        </div>
        <div class="build-card build-card--empty rv rv-d1">
          <figure>
            <div class="frame"><p class="display-s">Build 003</p></div>
            <figcaption><div><h3>Your bike here</h3><p class="meta">Founding build</p></div></figcaption>
          </figure>
        </div>
      </div>
    </section>

    <section class="section" data-cfg-show="founding" aria-labelledby="founding-title">
      <div class="wrap">
        <div class="notice rv">
          <div>
            <p class="label">Founding riders</p>
            <h2 class="display-s" id="founding-title">The first <span data-cfg="founding.slotsTotal" data-cfg-format="integer">8</span> builds set the rate.</h2>
            <p class="body">Riders who come in early get the founding rate, the same film and the same panels-off install. <span data-cfg="founding.slotsRemaining" data-cfg-format="integer">6</span> slots are still open.</p>
          </div>
          {btn("Start your build", track="builds-founding")}
        </div>
      </div>
    </section>
{finale("builds-final")}"""
    return page(
        "Motorcycle Wrap Builds & Portfolio | K Films, Jersey City",
        "Motorcycle wrap builds from the K Films studio in Jersey City, each one shot in the same light. Colour changes, protection film and liveries.",
        body,
    )


def f4i_page() -> str:
    body = f"""
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-media">{picture("/images/hero-f4i-garage-night", "Black Honda CBR600 F4i in the studio at night", attrs='fetchpriority="high" decoding="async"')}</div>
      <div class="wrap page-hero-grid">
        <div>
          {crumbs([("Home", "/"), ("Builds", "/builds"), ("Honda CBR600 F4i", None)])}
          {mask(["Honda", "CBR600 <em>F4i.</em>"], "display-xl", "h1", "page-title")}
        </div>
        <p class="lede rv">Build 001. A faired sport bike in a full gloss-black colour change, the first bike through the studio.</p>
      </div>
    </section>

    <section class="section--tight" aria-label="Build details">
      <div class="wrap">
        <dl class="spec rv">
          <div><dt class="label">Bike</dt><dd>Honda CBR600 F4i</dd></div>
          <div><dt class="label">Service</dt><dd>Full colour change</dd></div>
          <div><dt class="label">Finish</dt><dd>Gloss black</dd></div>
          <div><dt class="label">Studio</dt><dd>Jersey City</dd></div>
        </dl>
      </div>
    </section>

    <section class="section">
      <div class="wrap statement">
        <p class="label rv">The brief</p>
        <div>
          <p class="display-s" data-words>A fully faired bike is the hardest shape to wrap well: long panels, deep curves and a lot of edges. Exactly the reason to make it the first.</p>
          <p class="body rv">Every fairing came off. Film was wrapped around each edge and into the gaps, seams were kept to the lines the bodywork already has, and the bike was rebuilt and checked panel by panel before it was shot.</p>
        </div>
      </div>
    </section>

    <section class="section--tight" aria-label="Photos">
      <div class="wrap gallery">
        <figure class="g-full wipe">{picture("/images/refs/ref-02-left-profile", "Left profile of the gloss-black F4i", sizes="100vw")}</figure>
        <figure class="g-half wipe">{picture("/images/refs/ref-05-head-on", "Head-on view of the F4i", sizes="(min-width: 900px) 50vw, 100vw")}</figure>
        <figure class="g-half wipe">{picture("/images/refs/ref-06-rear-straight", "Straight-on rear view of the F4i", sizes="(min-width: 900px) 50vw, 100vw")}</figure>
        <figure class="g-third wipe">{picture("/images/refs/ref-09-headlight-detail", "Headlight detail", sizes="(min-width: 900px) 33vw, 100vw")}</figure>
        <figure class="g-third wipe">{picture("/images/refs/ref-10-tank-cockpit", "Tank and cockpit detail", sizes="(min-width: 900px) 33vw, 100vw")}</figure>
        <figure class="g-third wipe">{picture("/images/refs/ref-11-wheel-brake", "Front wheel and brake detail", sizes="(min-width: 900px) 33vw, 100vw")}</figure>
        <figure class="g-full wipe">{picture("/images/refs/ref-12-night-motion", "The F4i riding through Jersey City at night", sizes="100vw")}</figure>
      </div>
    </section>

    <section aria-label="Back to builds">
      <div class="wrap">
        <a class="next-page" href="/builds">
          <span class="label">All builds</span>
          <span class="display-l">Back to the builds <span class="btn-arrow" aria-hidden="true"></span></span>
        </a>
      </div>
    </section>
{finale("build-f4i-final")}"""
    return page(
        "Honda CBR600 F4i, Gloss Black Colour Change | K Films Builds",
        "Build 001 from the K Films studio in Jersey City: a Honda CBR600 F4i in a full gloss-black colour-change wrap, panels off and edges wrapped.",
        body,
    )


# =============================================================================
# Finishes
# =============================================================================

FINISHES = [
    ("sw-gloss", "Gloss", "Deep, wet reflections that read like fresh paint.", "Best for a factory look, or a colour change that should pass for paint."),
    ("sw-satin", "Satin", "A soft sheen that follows the bodywork's lines without mirroring everything around it.", "Best for modern sport and naked bikes. Hides minor imperfections well."),
    ("sw-matte", "Matte", "Flat and dense, with no reflection at all.", "Best for stealth builds. Needs matte-safe care products."),
    ("sw-metallic", "Metallic", "Fine metal flake under a clear layer that catches light as the bike moves.", "Best for warm colours: bronze, copper, champagne."),
    ("sw-shift", "Colour-shift", "Changes colour with the angle you see it from.", "Best on curvy bodywork where the shift has room to move."),
    ("sw-chrome", "Chrome", "A true mirror finish, the most demanding film to install.", "Best used as an accent rather than on a whole bike."),
    ("sw-carbon", "Carbon &amp; textured", "Woven carbon, brushed metal and other textures you can feel.", "Best on tank tops, tails and trim."),
    ("sw-ppf", "Clear protection", "Invisible urethane film over paint or over a wrap, in gloss or satin.", "Best on every bike, in the places that wear first."),
]


def finishes_page() -> str:
    tiles = "\n".join(
        f"""          <article class="finish rv{" rv-d" + str(n % 3) if n % 3 else ""}">
            <div class="finish-swatch {cls}" aria-hidden="true"></div>
            <h3>{name}</h3>
            <p>{what}</p>
            <p class="meta">{best}</p>
          </article>"""
        for n, (cls, name, what, best) in enumerate(FINISHES)
    )
    body = f"""
    <section class="page-hero page-hero--plain" aria-labelledby="page-title">
      <div class="wrap page-hero-grid">
        <div>
          {crumbs([("Home", "/"), ("Finishes", None)])}
          {mask(["Choose a", "<em>finish.</em>"], "display-xl", "h1", "page-title")}
        </div>
        <p class="lede rv">Hundreds of colours, eight kinds of surface. Start with the finish; the colour is easier to choose once you know how you want the bike to catch the light.</p>
      </div>
    </section>

    <section class="section--tight" aria-label="Finishes">
      <div class="wrap finish-grid">
{tiles}
      </div>
    </section>

    <section class="section" aria-labelledby="catalog-title">
      <div class="wrap split">
        <figure class="split-figure split-figure--wide wipe">{picture("/images/thumb-wrap-process", "Copper colour-change film being laid across a fairing", sizes="(min-width: 900px) 50vw, 100vw", img_attrs="data-parallax")}</figure>
        <div>
          <p class="label rv">The film catalog</p>
          {mask(["Every colour,", "<em>in one place.</em>"], "display-m", "h2", "catalog-title")}
          <p class="body rv">Browse the full range of cast films by colour family and finish, save the ones you like, and add them to your build. Not sure yet? Pick "help me choose" when you start your build and we'll work it out from your references.</p>
          <div class="rv" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:28px">
            <a class="btn" href="/vinyl-catalog">Browse the catalog <span class="btn-arrow" aria-hidden="true"></span></a>
            {btn("Start your build", track="finishes-catalog")}
          </div>
        </div>
      </div>
    </section>
{finale("finishes-final")}"""
    return page(
        "Motorcycle Wrap Finishes: Gloss, Satin, Matte, Chrome & More | K Films",
        "Gloss, satin, matte, metallic, colour-shift, chrome, carbon and clear protection film for motorcycles, explained. From the K Films studio in Jersey City.",
        body,
    )


# =============================================================================
# Process
# =============================================================================

def process_page() -> str:
    stages = lines([
        ("Start your build", "Year, make and model, photos of the bike and what you have in mind, sent online in a few minutes. No payment needed."),
        ("Your quote", "A written quote off your photos, with the film, the work and any transport each on their own line. Questions answered in the same reply."),
        ("Reserve your date", "Approve the quote in your client portal and pay a deposit online to hold your studio date."),
        ("Drop-off or pickup", "Ride it in by appointment, or have it collected from Brooklyn or NYC."),
        ("In the studio", "Inspection, strip-down, wrap, rebuild and a final check under raking light. Progress photos land in your portal at each stage."),
        ("Ride out", "Pay the balance online, collect the bike or have it delivered, and get a care guide for your film."),
    ], two=False)
    body = f"""
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-media">{picture("/images/thumb-shop-bts", "Working on a motorcycle at the bench in the Jersey City studio", attrs='fetchpriority="high" decoding="async"')}</div>
      <div class="wrap page-hero-grid">
        <div>
          {crumbs([("Home", "/"), ("Process", None)])}
          {mask(["From your phone", "to the <em>open road.</em>"], "display-xl", "h1", "page-title")}
        </div>
        <div>
          <p class="lede rv">Six stages from the first message to the day you ride out. Nothing starts until you have seen the plan and the price in writing.</p>
          <div class="rv">{btn("Start your build", track="process-hero")}</div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="stages-title">
      <div class="wrap statement">
        <div>
          <p class="label rv">The stages</p>
          {mask(["Six steps,", "<em>all visible.</em>"], "display-m", "h2", "stages-title")}
          <p class="body rv">Every stage shows in your client portal as it happens, with photos from the bench and every quote, payment and receipt in one place.</p>
        </div>
{stages}
      </div>
    </section>

    <section class="section hairline" id="getting-here" aria-labelledby="transport-title">
      <div class="wrap">
        <div class="section-head section-head--split">
          <div>
            <p class="label rv">Getting the bike here</p>
            {mask(["Ride it in,", "or we <em>come to you.</em>"], "display-m", "h2", "transport-title")}
          </div>
          <p class="body rv rv-d1">Transport is quoted with the build, never charged up front. A bike that won't start is still fine: say so and the right kit comes with the van.</p>
        </div>
        <div class="cards">
          <div class="card rv"><p class="label">No charge</p><h3>Ride it in</h3><p>To the studio at 95 Christopher Columbus Dr, Jersey City, by appointment.</p></div>
          <div class="card rv rv-d1"><p class="label">From {price('transport.pickup.from', '$75')}</p><h3>We collect it</h3><p>The van comes to you in Jersey City, Brooklyn or NYC.</p></div>
          <div class="card rv rv-d2"><p class="label">From {price('transport.roundTrip.from', '$150')}</p><h3>Collect and return</h3><p>Picked up before the build and delivered back after.</p></div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="care-title">
      <div class="wrap split split--flip">
        <figure class="split-figure wipe">{picture("/images/about-vinyl-hands", "Gloved hands smoothing film onto a fairing", sizes="(min-width: 900px) 50vw, 100vw", img_attrs="data-parallax")}</figure>
        <div>
          <p class="label rv">Aftercare</p>
          {mask(["Look after it,", "it <em>looks after you.</em>"], "display-m", "h2", "care-title")}
          <ul class="lines">
            <li class="rv"><span>01</span><div><h3>Give it a week</h3><p>Let the film settle for about a week before the first wash.</p></div></li>
            <li class="rv"><span>02</span><div><h3>Hand wash</h3><p>Two buckets and a soft mitt. Keep pressure washers well away from edges.</p></div></li>
            <li class="rv"><span>03</span><div><h3>Right products</h3><p>No abrasive polish, and matte-safe products only on matte and satin film.</p></div></li>
            <li class="rv"><span>04</span><div><h3>Store it covered</h3><p>Sun is what ages film fastest. A garage or a breathable cover adds years.</p></div></li>
          </ul>
        </div>
      </div>
    </section>
{finale("process-final")}"""
    return page(
        "How a Motorcycle Wrap Works, Start to Finish | K Films, Jersey City",
        "From sending your bike's details online to riding out: quotes, deposits, drop-off or pickup, progress photos in your portal and aftercare.",
        body,
    )


# =============================================================================
# Studio
# =============================================================================

def studio_page() -> str:
    principles = lines([
        ("Motorcycles only", "Bike bodywork behaves nothing like a car door. Specialising is the point."),
        ("Panels off, edges wrapped", "Slower, and the only way the film stays where it was put."),
        ("One pair of hands", "The person reading your message is the person cutting the film."),
        ("Straight answers", "Clear prices, honest timelines, and a plain answer if something is a bad idea."),
    ])
    body = f"""
    <section class="page-hero" aria-labelledby="page-title">
      <div class="page-hero-media">{picture("/images/story-elombe-workshop", "Elombe Kisala fitting film to a motorcycle fairing in the studio", attrs='fetchpriority="high" decoding="async"')}</div>
      <div class="wrap page-hero-grid">
        <div>
          {crumbs([("Home", "/"), ("The Studio", None)])}
          {mask(["One workshop.", "One pair of <em>hands.</em>"], "display-xl", "h1", "page-title")}
        </div>
        <p class="lede rv">K Films is a motorcycle film studio in Jersey City. Not a chain, not a franchise, and not a car shop that also does bikes.</p>
      </div>
    </section>

    <section class="section">
      <div class="wrap statement">
        <p class="label rv">Elombe Kisala, founder</p>
        <div>
          <p class="display-s" data-words>I ride, and I wrap bikes one at a time. Motorcycles are the whole business, and every one that comes through the studio gets the same slow, panels-off treatment.</p>
          <p class="body rv">The portfolio is being built in public, on real bikes, rather than appearing fully formed one day. The first riders through the door get the founding rate for it, and the same film and finish I'll charge more for once those slots are gone.</p>
        </div>
      </div>
    </section>

    <section class="section--tight" aria-labelledby="principles-title">
      <div class="wrap">
        <div class="section-head section-head--split">
          <div>
            <p class="label rv">How the work gets done</p>
            {mask(["What the studio", "<em>stands on.</em>"], "display-m", "h2", "principles-title")}
          </div>
        </div>
{principles}
      </div>
    </section>

    <section class="section" id="visit" aria-labelledby="visit-title">
      <div class="wrap studio">
        <figure class="studio-figure wipe">{picture("/images/thumb-shop-bts", "The bench in the Jersey City studio", sizes="(min-width: 900px) 58vw, 100vw", img_attrs="data-parallax")}</figure>
        <div>
          <p class="label rv">Visit</p>
          {mask(["95 Christopher", "Columbus <em>Dr.</em>"], "display-m", "h2", "visit-title")}
          <dl class="studio-facts rv">
            <div><dt class="label">Address</dt><dd><address>95 Christopher Columbus Dr<br>Jersey City, NJ 07302</address></dd></div>
            <div><dt class="label">Hours</dt><dd>Mon&ndash;Fri, 10am&ndash;6pm<br>Weekends by appointment</dd></div>
            <div><dt class="label">Drop-off</dt><dd>By appointment only</dd></div>
            <div><dt class="label">Pickup</dt><dd>Brooklyn &amp; NYC, from {price('transport.pickup.from', '$75')}</dd></div>
          </dl>
          <a class="link-line rv" href="https://www.google.com/maps/search/?api=1&amp;query=95+Christopher+Columbus+Dr+Jersey+City+NJ+07302" rel="noopener" target="_blank">Get directions <span class="btn-arrow" aria-hidden="true"></span></a>
        </div>
      </div>
    </section>

    <section class="section--tight" id="areas" aria-labelledby="areas-title">
      <div class="wrap">
        <div class="section-head section-head--split">
          <div>
            <p class="label rv">Where we work</p>
            {mask(["One studio,", "<em>three runs.</em>"], "display-m", "h2", "areas-title")}
          </div>
          <p class="body rv rv-d1">Every wrap is cut and fitted in Jersey City. Brooklyn and New York City are pickup runs, not second shops.</p>
        </div>
        <div class="cards">
          <a class="card rv" href="/locations/jersey-city"><p class="label">The studio</p><h3>Jersey City</h3><p>Ride it in by appointment, no transport on the quote.</p><span class="link-line">Wraps in Jersey City <span class="btn-arrow" aria-hidden="true"></span></span></a>
          <a class="card rv rv-d1" href="/locations/brooklyn"><p class="label">Pickup run</p><h3>Brooklyn</h3><p>Collected from your street, wrapped in Jersey City, brought back.</p><span class="link-line">Wraps for Brooklyn <span class="btn-arrow" aria-hidden="true"></span></span></a>
          <a class="card rv rv-d2" href="/locations/new-york-city"><p class="label">Pickup run</p><h3>New York City</h3><p>Manhattan and the outer boroughs, by van.</p><span class="link-line">Wraps for NYC <span class="btn-arrow" aria-hidden="true"></span></span></a>
        </div>
      </div>
    </section>

    <section class="section hairline" id="message" aria-labelledby="message-title">
      <div class="wrap statement">
        <div>
          <p class="label rv">Get in touch</p>
          {mask(["Ask <em>anything.</em>"], "display-m", "h2", "message-title")}
          <p class="body rv">For a price, <a class="link-line" href="{BOOK_URL}">start your build</a> instead: it asks for the details a number depends on. For everything else, send a message or email <a href="mailto:elombe@swftstudios.com">elombe@swftstudios.com</a>.</p>
        </div>
        <form class="form rv" action="https://formsubmit.co/elombe@swftstudios.com" method="POST" accept-charset="UTF-8">
          <input type="hidden" name="_subject" value="K Films - studio message">
          <input type="hidden" name="_template" value="table">
          <input type="hidden" name="_captcha" value="false">
          <input type="hidden" name="_next" value="https://kisalafilms-website.elombe.workers.dev/studio?sent=1#message">
          <input type="text" name="_honey" value="" tabindex="-1" autocomplete="off" aria-hidden="true" style="display:none !important">
          <div class="form-row">
            <div class="field"><label class="label" for="c-name">Name</label><input id="c-name" name="name" type="text" autocomplete="name" required></div>
            <div class="field"><label class="label" for="c-email">Email</label><input id="c-email" name="email" type="email" autocomplete="email" required></div>
          </div>
          <div class="field"><label class="label" for="c-bike">Bike <span style="text-transform:none;letter-spacing:0">(optional)</span></label><input id="c-bike" name="bike" type="text" placeholder="2005 Honda CBR600 F4i"></div>
          <div class="field"><label class="label" for="c-message">Message</label><textarea id="c-message" name="message" rows="5" required></textarea></div>
          <div><button class="btn btn--solid" type="submit">Send message <span class="btn-arrow" aria-hidden="true"></span></button></div>
          <p class="form-note" role="status">Thanks, your message is in. You'll hear back soon.</p>
        </form>
      </div>
    </section>
{finale("studio-final")}"""
    return page(
        "The Studio: Motorcycle Wraps at 95 Christopher Columbus Dr, Jersey City | K Films",
        "K Films is a one-person motorcycle film studio at 95 Christopher Columbus Dr, Jersey City, NJ. Drop-off by appointment, pickup from Brooklyn and NYC.",
        body,
    )


# =============================================================================
# FAQ
# =============================================================================

FAQ = [
    ("Pricing &amp; booking", [
        ("How much does a motorcycle wrap cost?", f"It depends on the bike and how much of it you want covered. A full colour change starts at {price('fullWrap', '$1,650')}, partial wraps and accents at {price('partialWrap', '$575')}, and paint protection film at {price('ppf', '$450')}. A faired sport bike takes more labour than a naked, because more bodywork comes off. Start your build online and you get a real number rather than a range."),
        ("How do I book?", "Start your build online with your bike's details, photos and what you have in mind. You get a written quote; approve it in your client portal and pay a deposit to reserve your studio date."),
        ("How do I pay?", "Online, by card, through your client portal: a deposit to reserve your date and the balance when the bike is ready. Receipts are kept in the portal."),
        ("Can I follow the work?", "Yes. Your client portal shows each stage as it happens, with progress photos from the bench, your quote, payments and messages in one place."),
        ("Do I need to know exactly what design I want?", "No, and most riders don't. \"Something dark with a red accent\" is a fine starting point. Upload photos of the bike and anything you like the look of, and it gets worked out from there."),
    ]),
    ("The work", [
        ("How long does wrapping take?", "A typical full colour change is 2&ndash;3 days in the studio once it starts. Partials and accents are quicker, liveries longer because design comes first. You get a timeline in writing before any film is cut."),
        ("Do I need to remove my fairings?", "No, that's done in the studio and included in the labour. Taking panels off is what lets the film wrap around the edge instead of being trimmed flush, which is the difference between a wrap that stays put and one that lifts."),
        ("Can you wrap individual fairings?", "Yes. Single panels, a tank on its own, a tail section or a two-tone split are all normal jobs."),
        ("Can you wrap over scratches?", "Light scratches, yes. Film follows what is underneath, so deep scratches, dents and flaking clear coat will still show through, and a lifting edge makes a wrap fail early. Send photos and you'll get a straight answer."),
        ("Do you wrap cars or helmets?", "No. The studio is set up around motorcycles and nothing else."),
    ]),
    ("Film &amp; care", [
        ("Does vinyl damage paint?", "Quality cast film protects factory paint when it is installed and removed correctly. The risk is with paint that is already compromised: oxidised, badly resprayed or lifting. Panels in that state are discussed before anything is wrapped."),
        ("How long does a wrap last?", "Cast films are generally rated for several years, and how long yours lasts depends on sun, storage and washing. A garaged bike ages far slower than one outside all summer."),
        ("What is PPF?", "Paint protection film: a clear, thicker, self-healing film over the areas that take physical damage. On a motorcycle that usually means the tank, knee areas and leading edges. It can go over paint or over a wrap."),
        ("How do I wash a wrapped bike?", "Wait about a week after collection, then hand wash with a soft mitt. Keep pressure washers away from edges, avoid abrasive polish, and use matte-safe products on matte and satin film."),
    ]),
    ("Getting here", [
        ("Where is the studio?", "95 Christopher Columbus Dr, Jersey City, NJ 07302. Drop-off is by appointment only: Monday to Friday, 10am to 6pm, with weekends by arrangement."),
        ("Do you offer motorcycle pickup?", f"Yes. Ride it in at no charge, or have it collected: pickup starts at {price('transport.pickup.from', '$75')}, and pickup with return delivery from {price('transport.roundTrip.from', '$150')}. It's quoted with the build, not charged up front."),
        ("What areas do you serve?", "The studio is in Jersey City and it's the only place the film gets cut. Brooklyn and New York City are pickup runs. If you're further out, say where when you start your build and you'll get an honest answer."),
    ]),
]


def faq_page() -> str:
    groups = "\n".join(
        f"""        <div class="faq-group">
          <span class="label rv">{title}</span>
{faq(items)}
        </div>"""
        for title, items in FAQ
    )
    body = f"""
    <section class="page-hero page-hero--plain" aria-labelledby="page-title">
      <div class="wrap page-hero-grid">
        <div>
          {crumbs([("Home", "/"), ("FAQ", None)])}
          {mask(["Questions,", "<em>answered.</em>"], "display-xl", "h1", "page-title")}
        </div>
        <p class="lede rv">The things riders ask before booking. If yours isn't here, ask it when you start your build: it costs nothing and there's no obligation.</p>
      </div>
    </section>

    <section class="section--tight" aria-label="Questions">
      <div class="wrap">
{groups}
      </div>
    </section>
{finale("faq-final")}"""
    return page(
        "Motorcycle Wrap FAQ: Cost, Timing, Care & Pickup | K Films",
        "Answers on motorcycle wrap cost, timing, paint protection film, care, payment and pickup from the K Films studio in Jersey City.",
        body,
    )


# =============================================================================
# Start your build (the intake wizard)
# =============================================================================

BOOK_SERVICES = [
    ("fullWrap", "Colour change", "Full-coverage cast film in any finish.", "$1,650"),
    ("ppf", "Paint protection", "Clear, self-healing film where it wears.", "$450"),
    ("partialWrap", "Accents &amp; partials", "Tank, tail, single panels, two-tone.", "$575"),
    ("customPrint", "Custom livery", "Printed graphics, designed for your bike.", "$950"),
    ("chromeDelete", "Chrome delete &amp; trim", "Trim, tints and rim stripes.", "$275"),
    ("unsure", "Not sure yet", "Tell us the look; we'll suggest the work.", None),
]
COVERAGES = [("full", "The whole bike"), ("partial", "Part of it"), ("panels", "Specific panels"), ("unsure", "Not sure")]
PANELS = [
    ("tank", "Tank"), ("tank-top", "Tank top / knee areas"), ("front-fairing", "Front fairing / nose"),
    ("side-fairings", "Side fairings"), ("belly-pan", "Belly pan"), ("tail", "Tail section"),
    ("front-fender", "Front fender"), ("rear-hugger", "Rear hugger"), ("screen", "Windscreen"),
    ("headlight", "Headlight"), ("mirrors", "Mirrors"), ("wheels", "Wheels / rim stripes"),
    ("side-covers", "Side covers"), ("trim", "Chrome trim"),
]
FINISH_CHOICES = [("gloss", "Gloss"), ("satin", "Satin"), ("matte", "Matte"), ("metallic", "Metallic"),
                  ("colour-shift", "Colour-shift"), ("chrome", "Chrome"), ("carbon", "Carbon / textured"),
                  ("clear", "Clear protection"), ("unsure", "Not sure")]
HANDOFF_CHOICES = [
    ("drop-off", "I'll bring it in", "To 95 Christopher Columbus Dr, by appointment.", "No charge"),
    ("pickup", "Collect it from me", "The van comes to you in JC, Brooklyn or NYC.", price("transport.pickup.from", "$75")),
    ("round-trip", "Collect and return it", "Picked up before, delivered back after.", price("transport.roundTrip.from", "$150")),
    ("undecided", "Not sure yet", "We'll work out what's easiest with your quote.", "&nbsp;"),
]
PHOTO_ANGLES = ["Left side", "Right side", "Front", "Rear", "Tank from above", "Any damage, close up"]


def booking_page() -> str:
    years = "\n".join(f'                <option value="{y}">{y}</option>' for y in range(2027, 1984, -1))
    services = "\n".join(
        f"""              <label class="choice choice--card">
                <input type="radio" name="service" value="{key}" required>
                <span class="choice-body">
                  <span class="choice-title">{name}</span>
                  <span class="choice-text">{blurb}</span>
                  <span class="choice-meta">{"From " + price(key, fb) if fb else "Free advice"}</span>
                </span>
              </label>"""
        for key, name, blurb, fb in BOOK_SERVICES
    )
    coverages = "\n".join(
        f'              <label class="chip"><input type="radio" name="coverage" value="{v}"><span>{l}</span></label>'
        for v, l in COVERAGES
    )
    panels = "\n".join(
        f'              <label class="chip"><input type="checkbox" name="panels" value="{v}"><span>{l}</span></label>'
        for v, l in PANELS
    )
    finishes = "\n".join(
        f'              <label class="chip"><input type="radio" name="finish" value="{v}"><span>{l}</span></label>'
        for v, l in FINISH_CHOICES
    )
    handoffs = "\n".join(
        f"""              <label class="choice choice--card">
                <input type="radio" name="handoff" value="{v}">
                <span class="choice-body">
                  <span class="choice-title">{t}</span>
                  <span class="choice-text">{d}</span>
                  <span class="choice-meta">{m}</span>
                </span>
              </label>"""
        for v, t, d, m in HANDOFF_CHOICES
    )
    angles = "".join(f"<li>{a}</li>" for a in PHOTO_ANGLES)
    step_names = ["Your bike", "The work", "Photos", "Notes &amp; timing", "You"]
    progress = "\n".join(
        f'            <li data-progress-step="{n}"><span class="num">{n:02d}</span><span class="name">{name}</span></li>'
        for n, name in enumerate(step_names, 1)
    )

    body = f"""
    <section class="book" data-book aria-labelledby="page-title">
      <div class="wrap book-grid">
        <aside class="book-aside">
          {crumbs([("Home", "/"), ("Start your build", None)])}
          <h1 class="display-l" id="page-title">Start your <em>build.</em></h1>
          <p class="lede">A few minutes, no payment. You'll get a written quote in your client portal, and every update from there.</p>

          <dl class="book-summary" aria-live="polite">
            <div><dt class="label">Bike</dt><dd data-sum="bike">&mdash;</dd></div>
            <div><dt class="label">Work</dt><dd data-sum="service">&mdash;</dd></div>
            <div><dt class="label">Finish</dt><dd data-sum="finish">&mdash;</dd></div>
            <div><dt class="label">Photos</dt><dd data-sum="photos">0</dd></div>
            <div><dt class="label">Getting here</dt><dd data-sum="handoff">&mdash;</dd></div>
          </dl>
          <div class="book-estimate" data-estimate hidden>
            <p class="label">Ballpark</p>
            <p class="book-estimate-figure" data-estimate-figure></p>
            <p class="meta" data-estimate-note>A starting range for this kind of bike. Your written quote is the real number.</p>
          </div>
        </aside>

        <div class="book-main">
          <ol class="book-progress" aria-label="Steps">
{progress}
          </ol>

          <form class="book-form form" id="book-form" action="/api/jobs" method="post" enctype="multipart/form-data" novalidate>
            <input type="hidden" name="draft" value="">
            <input type="hidden" name="body_class" value="">
            <input type="hidden" name="source" value="book">

            <fieldset class="book-step" data-step="1">
              <legend class="display-s"><span class="label">Step 01</span>Your bike</legend>
              <div class="field bike-search" data-bike-search hidden>
                <label class="label" for="bike-search">Find your bike</label>
                <input id="bike-search" type="text" role="combobox" autocomplete="off" aria-autocomplete="list" aria-expanded="false" aria-controls="bike-results" placeholder="Try &ldquo;CBR600&rdquo;, &ldquo;Ninja 400&rdquo; or &ldquo;Street Triple&rdquo;">
                <ul class="bike-results" id="bike-results" role="listbox" hidden></ul>
              </div>
              <div class="form-row form-row--3">
                <div class="field"><label class="label" for="bike-year">Year</label>
                  <select id="bike-year" name="bike_year">
                    <option value="">Year</option>
{years}
                    <option value="older">Older</option>
                  </select>
                </div>
                <div class="field"><label class="label" for="bike-make">Make</label><input id="bike-make" name="bike_make" type="text" list="bike-makes" autocomplete="off" required placeholder="Honda"><datalist id="bike-makes"></datalist></div>
                <div class="field"><label class="label" for="bike-model">Model</label><input id="bike-model" name="bike_model" type="text" autocomplete="off" required placeholder="CBR600 F4i"></div>
              </div>
              <details class="book-more">
                <summary class="label">More about the bike <span>(optional)</span></summary>
                <div class="form-row form-row--3">
                  <div class="field"><label class="label" for="bike-colour">Current colour</label><input id="bike-colour" name="bike_colour" type="text" placeholder="Black"></div>
                  <div class="field"><label class="label" for="bike-mileage">Mileage</label><input id="bike-mileage" name="bike_mileage" type="text" inputmode="numeric" placeholder="12,000"></div>
                  <div class="field"><label class="label" for="bike-vin">VIN</label><input id="bike-vin" name="bike_vin" type="text" autocapitalize="characters" maxlength="17"></div>
                </div>
              </details>
            </fieldset>

            <fieldset class="book-step" data-step="2">
              <legend class="display-s"><span class="label">Step 02</span>The work</legend>
              <div class="choices">
{services}
              </div>
              <div class="field" data-when="coverage">
                <p class="label">How much of the bike?</p>
                <div class="chips">
{coverages}
                </div>
              </div>
              <div class="field" data-when="panels">
                <p class="label">Which panels?</p>
                <div class="chips">
{panels}
                </div>
              </div>
              <div class="field">
                <p class="label">Finish</p>
                <div class="chips">
{finishes}
                </div>
              </div>
              <div class="field"><label class="label" for="colour">Colour or film <span>(optional)</span></label>
                <input id="colour" name="colour" type="text" placeholder="e.g. Nardo grey, or a film name from the catalog">
                <p class="meta">Browse every colour in the <a class="link-line" href="/vinyl-catalog" target="_blank" rel="noopener">film catalog</a>, or leave it and we'll suggest some.</p>
              </div>
              <input type="hidden" name="film_handle" value="">
            </fieldset>

            <fieldset class="book-step" data-step="3">
              <legend class="display-s"><span class="label">Step 03</span>Photos</legend>
              <p class="body">Photos make the quote accurate: paint condition, existing film and how the bodywork comes apart all show up in them. Up to 20.</p>
              <ul class="angle-list" aria-label="Useful angles">{angles}</ul>
              <label class="dropzone" data-dropzone>
                <input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple>
                <span class="dropzone-title">Add photos</span>
                <span class="meta">Drag them here, or tap to choose or take them. They're resized on your device before upload.</span>
              </label>
              <ul class="thumbs" data-thumbs aria-live="polite"></ul>
            </fieldset>

            <fieldset class="book-step" data-step="4">
              <legend class="display-s"><span class="label">Step 04</span>Notes &amp; timing</legend>
              <div class="field"><label class="label" for="notes">What do you have in mind?</label><textarea id="notes" name="notes" rows="5" placeholder="Colours you like, bikes you've seen, anything you want kept as it is."></textarea></div>
              <div class="field"><label class="label" for="inspiration">Inspiration links <span>(optional)</span></label><textarea id="inspiration" name="inspiration" rows="2" placeholder="Instagram posts, photos, other builds"></textarea></div>
              <div class="field"><label class="label" for="preferred-dates">When would you like it done?</label><input id="preferred-dates" name="preferred_dates" type="text" placeholder="e.g. before April, or any weekday next month"></div>
              <div class="field">
                <p class="label">Getting the bike here</p>
                <div class="choices choices--two">
{handoffs}
                </div>
              </div>
              <div class="field" data-when="zip"><label class="label" for="pickup-zip">Pickup ZIP code</label><input id="pickup-zip" name="pickup_zip" type="text" inputmode="numeric" maxlength="10" placeholder="11211"></div>
            </fieldset>

            <fieldset class="book-step" data-step="5">
              <legend class="display-s"><span class="label">Step 05</span>You</legend>
              <div class="form-row">
                <div class="field"><label class="label" for="name">Name</label><input id="name" name="name" type="text" autocomplete="name" required></div>
                <div class="field"><label class="label" for="phone">Phone <span>(optional)</span></label><input id="phone" name="phone" type="tel" autocomplete="tel"></div>
              </div>
              <div class="field"><label class="label" for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
                <p class="meta">Your portal link comes here. No password to remember.</p>
              </div>
              <button class="btn btn--solid book-submit" type="submit" data-submit>Send my build <span class="btn-arrow" aria-hidden="true"></span></button>
            </fieldset>

            <p class="book-error" role="alert" data-error hidden></p>

            <div class="book-nav" data-nav hidden>
              <button class="btn" type="button" data-back>Back</button>
              <button class="btn btn--solid" type="button" data-next>Continue <span class="btn-arrow" aria-hidden="true"></span></button>
            </div>
          </form>

          <div class="book-done" data-done hidden tabindex="-1">
            <p class="label">Build <span data-done-ref></span></p>
            <h2 class="display-l">Your build <em>is in.</em></h2>
            <p class="lede">We've emailed a link to your client portal at <strong data-done-email></strong>. Your written quote will appear there, along with every update and photo from the studio.</p>
            <ul class="lines">
              <li><span>01</span><div><h3>Your quote</h3><p>Written up from your photos, with the work, film and any transport on their own lines.</p></div></li>
              <li><span>02</span><div><h3>Approve and reserve</h3><p>Approve it in your portal and hold your studio date with a deposit online.</p></div></li>
              <li><span>03</span><div><h3>Follow the build</h3><p>Progress photos at every stage, through to collection.</p></div></li>
            </ul>
            <p class="meta" data-done-dev hidden>Local dev: <a class="link-line" data-done-dev-link href="#">open the portal sign-in link</a> (code <span data-done-dev-code></span>)</p>
            <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:32px">
              <a class="btn btn--solid" href="/login">Open my portal <span class="btn-arrow" aria-hidden="true"></span></a>
              <a class="btn" href="/">Back to home</a>
            </div>
          </div>
        </div>
      </div>
    </section>"""
    return page(
        "Start Your Build: Motorcycle Wrap Quote | K Films, Jersey City",
        "Send your bike's year, make and model, photos and ideas in a few minutes. A written quote comes back in your client portal. No payment needed.",
        body,
        extra_head='  <link rel="stylesheet" href="/css/book.css">\n',
        scripts=("/js/book.js",),
    )


def book_thanks_page() -> str:
    body = f"""
    <section class="page-hero page-hero--plain" style="min-height:100svh" aria-labelledby="page-title">
      <div class="wrap page-hero-grid">
        <div>
          <p class="label">Build received</p>
          {mask(["Your build", "<em>is in.</em>"], "display-xl", "h1", "page-title")}
        </div>
        <div>
          <p class="lede rv">We've emailed a link to your client portal. Your written quote will appear there, along with every update from the studio.</p>
          <div class="rv" style="display:flex;flex-wrap:wrap;gap:12px">
            <a class="btn btn--solid" href="/login">Open my portal <span class="btn-arrow" aria-hidden="true"></span></a>
            <a class="btn" href="/">Back to home</a>
          </div>
        </div>
      </div>
    </section>"""
    return page("Build received | K Films", "Your build is in. Check your email for your portal link.", body)


# =============================================================================
# Client portal: sign-in and the portal itself
# =============================================================================

def login_page() -> str:
    body = f"""
    <section class="login" aria-labelledby="page-title">
      <div class="wrap login-grid">
        <div>
          <p class="label">Client portal</p>
          <h1 class="display-l" id="page-title">Sign <em>in.</em></h1>
          <p class="lede">No password. Enter the email you used for your build and we'll send a one-time link and code.</p>
          <p class="meta">New here? <a class="link-line" href="{BOOK_URL}">Start your build</a> and your portal is created with it.</p>
        </div>

        <div class="login-card">
          <p class="login-note" data-login-note hidden role="status"></p>

          <form class="form" data-login-email action="/api/auth/request" method="post">
            <div class="field"><label class="label" for="login-email">Email</label>
              <input id="login-email" name="email" type="email" autocomplete="email" required></div>
            <button class="btn btn--solid" type="submit">Email me a link <span class="btn-arrow" aria-hidden="true"></span></button>
          </form>

          <form class="form" data-login-code hidden>
            <p class="body">Check <strong data-login-sent-to></strong>. Open the link on this device, or type the 6-digit code here.</p>
            <div class="field"><label class="label" for="login-code">Code</label>
              <input id="login-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{{6}}" class="code-input" required></div>
            <div style="display:flex;flex-wrap:wrap;gap:12px">
              <button class="btn btn--solid" type="submit">Sign in <span class="btn-arrow" aria-hidden="true"></span></button>
              <button class="btn" type="button" data-login-restart>Use another email</button>
            </div>
            <p class="meta" data-login-dev hidden></p>
          </form>
        </div>
      </div>
    </section>"""
    return page(
        "Client Portal Sign-in | K Films",
        "Sign in to your K Films client portal with a one-time link. No password needed.",
        body,
        extra_head='  <link rel="stylesheet" href="/css/portal.css">\n',
        scripts=("/js/login.js",),
    )


def portal_page() -> str:
    body = """
    <section class="portal" aria-live="polite">
      <div class="wrap">
        <div class="portal-loading" data-portal-loading><p class="label">Loading your portal&hellip;</p></div>
        <div data-portal-root></div>
        <noscript><p class="lede">The client portal needs JavaScript turned on.</p></noscript>
      </div>
    </section>"""
    return page(
        "Your Builds | K Films Client Portal",
        "Your K Films builds: timeline, progress photos, quotes, payments and messages.",
        body,
        extra_head='  <link rel="stylesheet" href="/css/portal.css">\n',
        scripts=("/js/portal.js",),
    )


# =============================================================================
# 404
# =============================================================================

def not_found_page() -> str:
    body = f"""
    <section class="page-hero page-hero--plain" style="min-height:100svh" aria-labelledby="page-title">
      <div class="wrap page-hero-grid">
        <div>
          <p class="label">404</p>
          {mask(["Off the", "<em>road.</em>"], "display-xl", "h1", "page-title")}
        </div>
        <div>
          <p class="lede rv">This page doesn't exist, or it moved in the redesign. These will get you back on track.</p>
          <div class="rv" style="display:flex;flex-wrap:wrap;gap:12px">
            <a class="btn" href="/">Home <span class="btn-arrow" aria-hidden="true"></span></a>
            <a class="btn" href="/services">Services <span class="btn-arrow" aria-hidden="true"></span></a>
            {btn("Start your build", track="404")}
          </div>
        </div>
      </div>
    </section>"""
    return page("Page not found | K Films", "This page doesn't exist or has moved.", body)


# =============================================================================

def main() -> None:
    for i, s in enumerate(SERVICES):
        OUT[f"services/{s['slug']}.html"] = service_page(i, s)
    OUT["services.html"] = services_hub()
    OUT["builds.html"] = builds_page()
    OUT["builds/honda-cbr600-f4i.html"] = f4i_page()
    OUT["finishes.html"] = finishes_page()
    OUT["process.html"] = process_page()
    OUT["studio.html"] = studio_page()
    OUT["faq.html"] = faq_page()
    OUT["404.html"] = not_found_page()
    OUT["book.html"] = booking_page()
    OUT["book-thanks.html"] = book_thanks_page()
    OUT["login.html"] = login_page()
    OUT["portal.html"] = portal_page()

    for rel, html in OUT.items():
        path = PUBLIC / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html, encoding="utf-8")
        print(f"{rel:40} written")

    # Keep the chrome on every other v4 page in step with the home page.
    blocks = chrome_blocks()
    for path in sorted(PUBLIC.rglob("*.html")):
        rel = path.relative_to(PUBLIC).as_posix()
        if rel in OUT or rel == "index.html":
            continue
        html = path.read_text(encoding="utf-8")
        if "<!-- CHROME4:HEADER start" not in html:
            continue
        synced = sync_chrome(html, blocks)
        if synced != html:
            path.write_text(synced, encoding="utf-8")
        print(f"{rel:40} chrome {'synced' if synced != html else 'unchanged'}")


if __name__ == "__main__":
    main()
