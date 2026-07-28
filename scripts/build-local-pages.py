#!/usr/bin/env python3
"""Generate the three local landing pages.

Chrome is duplicated per page across this site rather than templated, so these
are composed from locations.html's header, footer and <head> and written out as
static files — the same "generate once, commit the output" approach shop.html
uses. Re-run it after editing the chrome on locations.html.

Every factual claim here is one the site can stand behind: one garage in Jersey
City, pickup runs to Brooklyn and NYC, the published hours, the email address.
No ratings, no reviews, no street address, no invented projects or credentials.
Neighbourhood names are geography, not a claim to have worked in them.

Usage:
  python3 scripts/build-local-pages.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "locations.html"
OUTDIR = PUBLIC / "locations"

SITE = "https://kisalafilms-website.elombe.workers.dev"

CITIES = [
    {
        "slug": "jersey-city",
        "zone": "jersey-city",
        "title": "Motorcycle Wraps in Jersey City, NJ — Kisala Films",
        "description": (
            "Motorcycle wrap film in Jersey City, NJ. Cast vinyl colour changes, chrome "
            "delete and tank protection from a one-person garage. Ride in by appointment "
            "or have your bike collected from $75."
        ),
        "eyebrow": "Jersey City, NJ",
        "h1": "Motorcycle wraps in Jersey City",
        "intro": (
            "This is the garage. Not a franchise counter with a queue behind it &mdash; one "
            "bench, one installer, and your bike on it for two or three days. Every wrap "
            "Kisala Films does is cut and installed here in Jersey City, whether the bike "
            "started in Bergen-Lafayette or came over from Bushwick in the van."
        ),
        "local": [
            (
                "You can just ride it over",
                "Downtown, Journal Square, the Heights, Greenville, West Side &mdash; nowhere in "
                "Jersey City is a long ride to the garage. Drop-off is by appointment and costs "
                "nothing, and we lock the window once the quote is agreed so your bike isn&rsquo;t "
                "sitting around waiting on me.",
            ),
            (
                "Or don't, and I'll come to you",
                "Plenty of riders here keep the bike in a shared garage, a driveway they share "
                "with three neighbours, or on the street under a cover. If moving it is the "
                "annoying part, pickup starts at {pickup} and I&rsquo;ll handle it.",
            ),
            (
                "Winter is the honest time to do this",
                "A wrap needs the bike off the road for a couple of days, and warm panels take "
                "film better than cold ones. If you&rsquo;re laying the bike up over a Jersey "
                "winter anyway, that&rsquo;s the cheapest downtime you&rsquo;ll ever spend.",
            ),
        ],
        "transport_note": (
            "Jersey City is the one place on this site where you have a genuinely free option: "
            "ride in, hand me the keys, no transport line on the quote."
        ),
        "faq": [
            (
                "Where in Jersey City are you?",
                "The garage is in Jersey City, NJ and it&rsquo;s appointment-only, so the exact "
                "address goes out with your confirmed booking rather than sitting on a public "
                "page. Hours are Monday to Friday, 10:00 AM to 6:00 PM, with weekends by "
                "arrangement.",
            ),
            (
                "Do I need an appointment?",
                "Yes. There is one bay and one person in it, so turning up unannounced means "
                "waiting or coming back. Send a build sheet through the Wrap Studio and "
                "we&rsquo;ll fix a window.",
            ),
            (
                "How long will my bike be with you?",
                "Two to three days for most builds. A full colour change on a fully faired "
                "bike takes longer than accents on a naked, because more of the bike has to "
                "come apart first.",
            ),
        ],
        "cross": ["brooklyn", "nyc"],
    },
    {
        "slug": "brooklyn",
        "zone": "brooklyn",
        "title": "Motorcycle Wraps for Brooklyn Riders — Kisala Films",
        "description": (
            "Motorcycle wrap film for Brooklyn riders. Bike collected from Brooklyn from $75, "
            "wrapped in cast vinyl at the Jersey City garage, and delivered back. Colour "
            "changes, chrome delete and tank protection."
        ),
        "eyebrow": "Brooklyn, NY",
        "h1": "Motorcycle wraps for Brooklyn riders",
        "intro": (
            "Straight answer first: there is no Kisala Films shop in Brooklyn. There is one "
            "garage, and it&rsquo;s in Jersey City. What Brooklyn gets is the van &mdash; I "
            "collect the bike from your kerb, wrap it on the bench in Jersey City, and bring "
            "it back. I&rsquo;d rather tell you that than dress up a pickup radius as a second "
            "location."
        ),
        "local": [
            (
                "The bike travels, the bench doesn't",
                "Williamsburg, Bed-Stuy, Bushwick, Greenpoint, Park Slope, Crown Heights, Bay "
                "Ridge &mdash; pickup from Brooklyn starts at {pickup}. Pickup with return "
                "delivery afterwards starts at {roundtrip}, so the bike leaves your street and "
                "comes back to it without you crossing the river once.",
            ),
            (
                "Nobody wants to ride to a wrap appointment",
                "You could ride over the bridge and through the tunnel to drop it off, then "
                "work out how to get home, then do the whole thing again in reverse three days "
                "later. Or you could not. That&rsquo;s the entire argument for pickup.",
            ),
            (
                "Street-parked bikes get looked at properly",
                "A bike that lives outside in Brooklyn has usually collected some things: "
                "scuffed tank edges, a mirror that met a van, oxidised plastics, a previous "
                "wrap someone rushed. Send photos with your build sheet and I&rsquo;ll tell you "
                "what film will sit right and what needs sorting first &mdash; before you&rsquo;ve "
                "paid anything.",
            ),
        ],
        "transport_note": (
            "Brooklyn is a pickup zone, not a location. The work happens in Jersey City and the "
            "quote will say so."
        ),
        "faq": [
            (
                "Do you have a Brooklyn shop?",
                "No. One garage, in Jersey City. Brooklyn is served by pickup &mdash; I collect "
                "the bike, wrap it there, and return it. Anyone telling you they have a bay in "
                "every borough is telling you something else.",
            ),
            (
                "How much is pickup from Brooklyn?",
                "It starts at {pickup} one way, and {roundtrip} for collection plus return "
                "delivery. It&rsquo;s quoted with the build rather than charged up front, and "
                "the exact number depends on where in Brooklyn you are and whether the bike is "
                "running.",
            ),
            (
                "What if my bike isn't running?",
                "Still fine, and it happens more than you&rsquo;d think with a project bike. A "
                "bike that won&rsquo;t start changes how I load it, not whether I come out. Put "
                "it in the pickup notes so I bring the right kit.",
            ),
            (
                "Can I come and watch the install?",
                "You&rsquo;re welcome at the garage while the bike is there, by arrangement. "
                "Most Brooklyn riders would rather see the film of it than sit in Jersey City "
                "for three days, which is why every build gets shot.",
            ),
        ],
        "cross": ["jersey-city", "nyc"],
    },
    {
        "slug": "new-york-city",
        "zone": "nyc",
        "title": "Motorcycle Wraps for New York City Riders — Kisala Films",
        "description": (
            "Motorcycle wrap film for NYC riders. Bike collected from Manhattan, Queens, the "
            "Bronx or Staten Island from $75, wrapped in cast vinyl at the Jersey City garage, "
            "and delivered back."
        ),
        "eyebrow": "New York City",
        "h1": "Motorcycle wraps for New York City riders",
        "intro": (
            "Wrapping a bike in New York has one real obstacle, and it isn&rsquo;t the wrap. "
            "It&rsquo;s that everything involves moving the bike somewhere, and moving the bike "
            "somewhere in this city is never simple. So I move it. The van collects from "
            "Manhattan and the outer boroughs, the film goes on at the Jersey City garage, and "
            "the bike comes back to you."
        ),
        "local": [
            (
                "One garage, and it isn't in the city",
                "Manhattan, Queens, the Bronx, Staten Island &mdash; pickup starts at {pickup}, "
                "or {roundtrip} with return delivery. There is no Kisala Films bay in the five "
                "boroughs and I&rsquo;m not going to imply there is. The bench is in Jersey City "
                "and that&rsquo;s where your bike gets wrapped.",
            ),
            (
                "Your parking spot stays yours",
                "If the bike lives in a garage you pay monthly for, or in a spot you&rsquo;ve "
                "negotiated with a whole block, the last thing you want is a three-day errand "
                "that starts and ends with re-parking. Hand it over at the kerb and get it back "
                "at the kerb.",
            ),
            (
                "A city bike is a working bike",
                "Bikes that get ridden through this city carry the evidence: heat-marked "
                "plastics, kerb rash, a tank worn where a jacket buckle sits for an hour a day. "
                "Cast film covers a lot of that honestly, and tank protection film stops the "
                "worn spot coming straight back. Send photos and I&rsquo;ll tell you which "
                "you&rsquo;re actually looking at.",
            ),
        ],
        "transport_note": (
            "NYC is a pickup zone. The work happens across the river in Jersey City, and the "
            "quote will say so."
        ),
        "faq": [
            (
                "Do you have a shop in Manhattan?",
                "No. One garage, in Jersey City, appointment only. Manhattan and the outer "
                "boroughs are served by pickup &mdash; the bike travels to the bench, not the "
                "other way round.",
            ),
            (
                "Which boroughs do you collect from?",
                "Manhattan, Brooklyn, Queens, the Bronx and Staten Island. Pickup starts at "
                "{pickup}. If you&rsquo;re further out than that, say where you are in the Wrap "
                "Studio and I&rsquo;ll tell you honestly whether I can reach you rather than "
                "quote first and work it out later.",
            ),
            (
                "Can you wrap it without taking it away?",
                "No &mdash; a wrap needs a clean, warm, dust-controlled space and a couple of "
                "days, which is exactly what a kerb in New York is not. Anything installed in a "
                "hurry outdoors will lift at the edges, and you&rsquo;d be looking at it every "
                "time you walked up to the bike.",
            ),
            (
                "How do I know what it'll cost before it leaves?",
                "Build the sheet in the Wrap Studio. It gives you a ballpark on the wrap and a "
                "separate line for transport before you send anything, and I come back with a "
                "real number off your photos.",
            ),
        ],
        "cross": ["jersey-city", "brooklyn"],
    },
]

# Cross-links are written by zone id, which is not always the slug ("nyc" vs
# "new-york-city"), so look the sibling city up by zone.
CITY_BY_ZONE = {c["zone"]: c for c in CITIES}
ZONE_LABELS = {"jersey-city": "Jersey City", "brooklyn": "Brooklyn", "nyc": "NYC"}


def chrome() -> tuple[str, str, str]:
    """(head_open, header_block, footer_block) lifted from locations.html."""
    html = SOURCE.read_text(encoding="utf-8")

    head = re.search(r"<!DOCTYPE html>.*?<head>\n(.*?)</head>", html, re.S)
    header = re.search(r"(  <header class=\"site-header\">.*?  </aside>\n)", html, re.S)
    footer = re.search(r"(  <footer class=\"site-footer\">.*?</html>)", html, re.S)
    if not (head and header and footer):
        raise SystemExit("Could not read the chrome out of locations.html")

    return head.group(1), header.group(1), footer.group(1)


# The chrome is lifted from a page that has already been through build-seo.py and
# build-jsonld.mjs, so its <head> carries that page's canonical, social tags and
# structured data. Copied across verbatim, every city page would claim to be
# /locations. build-seo.py rewrites the canonical and social tags on its own pass,
# but it does not touch JSON-LD and the city pages are not in build-jsonld.mjs's
# page map — so the inherited graph has to be removed here.
#
# Each pattern takes the tag's whole line, trailing newline included. Leaving the
# newline behind would leave a blank line per stripped tag, and since the chrome
# is re-copied on every run those blank lines pile up build after build.
INHERITED = [
    r'[ \t]*<!-- JSON-LD: generated by scripts/build-jsonld\.mjs -->\s*<script type="application/ld\+json">[\s\S]*?</script>\n',
    r'[ \t]*<script type="application/ld\+json">[\s\S]*?</script>\n',
    r'[ \t]*<!-- SEO: generated by scripts/build-seo\.py -->\n',
    r'[ \t]*<link rel="canonical"[^>]*>\n',
    r'[ \t]*<meta property="og:[^"]+"[^>]*>\n',
    r'[ \t]*<meta name="twitter:[^"]+"[^>]*>\n',
    r'[ \t]*<meta name="robots"[^>]*>\n',
]


def head_for(city: dict, head_template: str) -> str:
    """Rewrite the shared <head> with this page's title and description.

    Canonical, Open Graph and Twitter tags are deliberately not written here —
    scripts/build-seo.py owns those for every page on the site and derives them
    from the title and description below. Run it after this.
    """
    head = head_template
    for pattern in INHERITED:
        head = re.sub(pattern, "", head)

    head = re.sub(r"<title>.*?</title>", f"<title>{city['title']}</title>", head, flags=re.S)
    return re.sub(
        r'<meta name="description" content=".*?">',
        f'<meta name="description" content="{city["description"]}">',
        head,
        flags=re.S,
    )


def jsonld(city: dict) -> str:
    """Only verifiable claims: no rating, no review, no street address."""
    # Extensionless: Cloudflare Static Assets 307-redirects the .html form, so
    # naming it here would point every URL in the graph at a redirect. Matches
    # canonical_path() in scripts/build-seo.py.
    url = f"{SITE}/locations/{city['slug']}"
    # json.dumps, not repr — the copy is full of apostrophes and em dashes that
    # a quote-swap would turn into invalid JSON.
    faq_entries = ",\n".join(
        f"""      {{
        "@type": "Question",
        "name": {json.dumps(strip_tags(q))},
        "acceptedAnswer": {{ "@type": "Answer", "text": {json.dumps(strip_tags(a.format(pickup="$75", roundtrip="$150")))} }}
      }}"""
        for q, a in city["faq"]
    )

    return f"""  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@graph": [
      {{
        "@type": "AutoBodyShop",
        "@id": "{SITE}/#garage",
        "name": "Kisala Films",
        "description": "Motorcycle wrap film and transformation film, by appointment, from a one-person garage in Jersey City, NJ.",
        "url": "{SITE}/",
        "email": "elombe@swftstudios.com",
        "address": {{
          "@type": "PostalAddress",
          "addressLocality": "Jersey City",
          "addressRegion": "NJ",
          "addressCountry": "US"
        }},
        "areaServed": [
          {{ "@type": "City", "name": "Jersey City" }},
          {{ "@type": "City", "name": "Brooklyn" }},
          {{ "@type": "City", "name": "New York" }}
        ],
        "openingHoursSpecification": [
          {{
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            "opens": "10:00",
            "closes": "18:00"
          }}
        ],
        "availableService": [
          {{ "@type": "Service", "name": "Full colour-change motorcycle wrap" }},
          {{ "@type": "Service", "name": "Partial wrap and accents" }},
          {{ "@type": "Service", "name": "Chrome delete" }},
          {{ "@type": "Service", "name": "Paint protection film" }}
        ]
      }},
      {{
        "@type": "WebPage",
        "@id": "{url}",
        "url": "{url}",
        "name": {json.dumps(city['title'])},
        "description": {json.dumps(city['description'])},
        "about": {{ "@id": "{SITE}/#garage" }}
      }},
      {{
        "@type": "BreadcrumbList",
        "itemListElement": [
          {{ "@type": "ListItem", "position": 1, "name": "Home", "item": "{SITE}/" }},
          {{ "@type": "ListItem", "position": 2, "name": "Locations", "item": "{SITE}/locations" }},
          {{ "@type": "ListItem", "position": 3, "name": "{city['eyebrow']}", "item": "{url}" }}
        ]
      }},
      {{
        "@type": "FAQPage",
        "mainEntity": [
{faq_entries}
        ]
      }}
    ]
  }}
  </script>
"""


def strip_tags(text: str) -> str:
    """Plain text for JSON-LD, which must not carry markup or entities."""
    out = re.sub(r"<[^>]+>", "", text)
    for entity, char in (
        ("&mdash;", "—"), ("&ndash;", "–"), ("&rsquo;", "’"),
        ("&lsquo;", "‘"), ("&amp;", "&"), ("&nbsp;", " "),
    ):
        out = out.replace(entity, char)
    return re.sub(r"\s+", " ", out).strip()


def body_for(city: dict) -> str:
    zone = city["zone"]
    fees = {"pickup": f'<span data-cfg="zones.{zone}.pickupFrom">$75</span>',
            "roundtrip": '<span data-cfg="transport.roundTrip.from">$150</span>'}

    local = "\n".join(
        f"""        <article class="svc-card">
          <h3>{heading}</h3>
          <p class="p">{copy.format(**fees)}</p>
        </article>"""
        for heading, copy in city["local"]
    )

    faq = "\n".join(
        f"""        <div class="faq-item{' open' if i == 0 else ''}"><button class="faq-q" type="button">{q}<span class="mark">{'–' if i == 0 else '+'}</span></button><p class="faq-a">{a.format(**fees)}</p></div>"""
        for i, (q, a) in enumerate(city["faq"])
    )

    cross = "\n".join(
        f"""        <article class="svc-card">
          <span class="svc-chip">{'The garage' if other['zone'] == 'jersey-city' else 'Pickup zone'}</span>
          <h3>{other['eyebrow']}</h3>
          <p class="p">{other['transport_note']}</p>
          <a class="details" href="/locations/{other['slug']}.html">Wraps in {ZONE_LABELS[other['zone']]} &rarr;</a>
        </article>"""
        for other in (CITY_BY_ZONE[z] for z in city["cross"])
    )

    ride_in = (
        f"""        <article class="svc-card">
          <span class="svc-chip">No charge</span>
          <h3>Ride it in</h3>
          <p class="p">Straight to the garage, by appointment. Nothing added to the quote.</p>
        </article>"""
        if zone == "jersey-city"
        else f"""        <article class="svc-card">
          <span class="svc-chip">No charge</span>
          <h3>Ride it over yourself</h3>
          <p class="p">If you don&rsquo;t mind the trip to Jersey City, drop-off is free. Plenty of riders would rather not do it twice.</p>
        </article>"""
    )

    return f"""  <section class="page-hero" data-local-zone="{zone}">
    <div class="container">
      <p class="eyebrow">{city['eyebrow']}</p>
      <h1>{city['h1']}</h1>
      <p class="p-lg">{city['intro']}</p>
      <div class="btn-row">
        <a class="btn btn-primary" href="/wrap-studio.html" data-track="cta_click" data-track-label="{zone}-hero">Build your wrap</a>
        <a class="btn btn-secondary" href="/pricing.html">See pricing</a>
      </div>
    </div>
  </section>

  <section class="section reveal">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">What this looks like from where you are</p>
        <h2>{city['eyebrow']}, specifically</h2>
      </div>
      <div class="svc-grid">
{local}
      </div>
    </div>
  </section>

  <section class="section section-dark reveal" id="getting-here">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">Getting the bike here</p>
        <h2>Three ways, one of them free</h2>
        <p class="p-lg">{city['transport_note']} Transport is quoted with the build, never charged up front.</p>
      </div>
      <div class="svc-grid">
{ride_in}
        <article class="svc-card">
          <span class="svc-chip">From {fees['pickup']}</span>
          <h3>I collect it</h3>
          <p class="p">The van comes to you and the bike goes back to the bench. Tell me where it&rsquo;s parked and whether it runs.</p>
        </article>
        <article class="svc-card">
          <span class="svc-chip">From {fees['roundtrip']}</span>
          <h3>Collect and deliver back</h3>
          <p class="p">Picked up before the build, delivered back after. You never move it yourself.</p>
        </article>
      </div>
      <div class="btn-row">
        <a class="btn btn-primary" href="/wrap-studio.html" data-track="cta_click" data-track-label="{zone}-transport">Price it with pickup</a>
        <a class="btn btn-secondary" href="/locations.html#zones">The whole run</a>
      </div>
    </div>
  </section>

  <section class="section reveal" data-cfg-show="founding">
    <div class="container">
      <div class="rr-banner">
        <div>
          <p class="eyebrow">Founding riders</p>
          <h3>The first <span data-cfg="founding.slotsTotal" data-cfg-format="integer">8</span> builds set the rate.</h3>
          <p class="p" style="margin:0;max-width:560px">I&rsquo;m building this portfolio in public and the riders who come in early get the founding rate for it &mdash; <strong class="metal-text"><span data-cfg="founding.slotsRemaining" data-cfg-format="integer">6</span> still open</strong>. Same cast film, same panels-off install, same camera running.</p>
        </div>
        <a class="btn btn-primary" href="/pricing.html" data-track="cta_click" data-track-label="{zone}-founding">See the rates</a>
      </div>
    </div>
  </section>

  <section class="section section-muted reveal">
    <div class="container" style="max-width:840px">
      <div class="section-head">
        <p class="eyebrow">Straight answers</p>
        <h2>{city['eyebrow']} questions</h2>
      </div>
      <div class="faq-list" data-faq>
{faq}
      </div>
      <div class="btn-row">
        <a class="btn btn-secondary" href="/faq.html">All the questions</a>
      </div>
    </div>
  </section>

  <section class="section reveal">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">Also on the run</p>
        <h2>Somewhere else?</h2>
      </div>
      <div class="svc-grid">
{cross}
      </div>
    </div>
  </section>
"""


def main() -> None:
    head_template, header, footer = chrome()
    OUTDIR.mkdir(exist_ok=True)

    for city in CITIES:
        page = (
            "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n"
            + head_for(city, head_template)
            + jsonld(city)
            + "</head>\n<body class=\"carsy\">\n\n"
            + header
            + "\n"
            + body_for(city)
            + "\n"
            + footer
        )
        out = OUTDIR / f"{city['slug']}.html"
        out.write_text(page, encoding="utf-8")
        print(f"Wrote {out.relative_to(PUBLIC)}")


if __name__ == "__main__":
    main()
