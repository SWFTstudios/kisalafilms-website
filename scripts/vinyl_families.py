#!/usr/bin/env python3
"""Colour families for the Metro Restyling catalogue.

Metro's feed has no colour field — only a product title, a vendor and a
product_type — so the family has to be read out of the title. Shared by
build-vinyl-catalog.py (on a fresh sync) and enrich-vinyl-families.py (to
backfill the committed file after editing the rules here).

The hex on each family is the colour of the *filter chip*, not a claim about any
film. Individual films always show Metro's own product photograph, so a swatch
never stands in for the real thing.
"""

from __future__ import annotations

import re

# Ordered: the first family with a keyword in the title wins.
#
# Effects and textures come first, because they are what the film is actually
# about — "Gloss Carbon Fiber Black" is carbon, not black, and "Colour Shift
# Blue Berry" shifts. Real colours come next.
#
# "clear" is deliberately LAST. Metro sells 120-odd coloured paint protection
# films whose titles all read "… Paint Protection Film Wrap", and matching that
# phrase early filed every one of them as clear — so Gloss Black PWF and Crimson
# Red PWF vanished from the colour filters they belong in. A colour word in the
# title always wins; clear only catches the films that genuinely have no colour.
FAMILIES: list[dict] = [
    {
        "id": "shift",
        "label": "Colour shift",
        "hex": "#7b2ff7",
        "keywords": [
            "color shift", "colour shift", "colorshift", "chameleon", "psychedelic",
            "iridescent", "opal", "flip", "rushing", "dichroic",
        ],
    },
    {
        "id": "carbon",
        "label": "Carbon & texture",
        "hex": "#1e1e1e",
        "keywords": [
            "carbon fiber", "carbon fibre", "carbon", "forged", "brushed", "honeycomb",
            "mesh", "leather", "wood grain", "woodgrain", "hex", "diamond plate",
        ],
    },
    {
        "id": "chrome",
        "label": "Chrome & mirror",
        "hex": "#cfd5da",
        "keywords": ["chrome", "mirror"],
    },
    {
        "id": "white",
        "label": "White",
        "hex": "#f4f4f2",
        "keywords": [
            "white", "pearl white", "ivory", "snow", "alabaster", "frost", "vanilla",
            "porcelain",
        ],
    },
    {
        "id": "black",
        "label": "Black",
        "hex": "#0b0b0b",
        "keywords": ["black", "onyx", "obsidian", "midnight", "raven", "jet", "noir"],
    },
    {
        "id": "grey",
        "label": "Grey & silver",
        "hex": "#8a8f94",
        "keywords": [
            "grey", "gray", "silver", "gunmetal", "graphite", "charcoal", "anthracite",
            "battleship", "concrete", "cement", "slate", "titanium", "aluminum",
            "aluminium", "steel", "nardo", "pewter", "quicksilver", "thundercloud",
            "thunder", "lightning ridge", "basalt", "moonstone", "ash", "shadow",
        ],
    },
    {
        "id": "red",
        "label": "Red",
        "hex": "#d2201a",
        "keywords": [
            "red", "crimson", "scarlet", "cherry", "ruby", "burgundy", "maroon",
            "wine", "blood", "carmine", "garnet", "strawberry", "hebanero",
        ],
    },
    {
        "id": "orange",
        "label": "Orange",
        "hex": "#e8701a",
        "keywords": ["orange", "tangerine", "copper", "rust", "amber", "apricot", "coral"],
    },
    {
        "id": "yellow",
        "label": "Yellow & gold",
        "hex": "#e8c31a",
        "keywords": [
            "yellow", "gold", "golden", "lemon", "banana", "mustard", "champagne",
            "brass", "bronze", "sunflower", "citric", "rising sun", "solar",
        ],
    },
    {
        "id": "green",
        "label": "Green",
        "hex": "#2f9e52",
        "keywords": [
            "green", "lime", "emerald", "olive", "forest", "mint", "jade", "sage",
            "moss", "military", "army", "kiwi", "avocado", "pistachio", "jungle",
            "fresh spring",
        ],
    },
    {
        "id": "blue",
        "label": "Blue",
        "hex": "#2b6ef6",
        "keywords": [
            "blue", "teal", "turquoise", "cyan", "navy", "cobalt", "azure", "sky",
            "indigo", "aqua", "sapphire", "denim", "ice", "ocean", "key west",
            "neptune", "glacier",
        ],
    },
    {
        "id": "purple",
        "label": "Purple",
        "hex": "#7d3fc9",
        "keywords": [
            "purple", "violet", "lavender", "plum", "amethyst", "grape", "mauve",
            "lilac", "eggplant", "orchid", "berry",
        ],
    },
    {
        "id": "pink",
        "label": "Pink",
        "hex": "#e0479b",
        "keywords": [
            "pink", "magenta", "fuchsia", "fuschia", "rose", "blush", "salmon",
            "flamingo",
        ],
    },
    {
        "id": "brown",
        "label": "Brown & bronze",
        "hex": "#7a5334",
        "keywords": [
            "brown", "tan", "beige", "khaki", "sand", "sandstone", "chocolate",
            "coffee", "taupe", "mocha", "caramel", "walnut",
        ],
    },
    # Last on purpose — see the note at the top of this list.
    {
        "id": "clear",
        "label": "Clear & protective",
        "hex": "#8fa3ad",
        "keywords": [
            "clear", "ppf", "paint protection", "transparent", "invisible",
            "headlight tint", "smoke", "tint",
        ],
    },
]

# Word-boundary patterns, so "Redwood" is not a red and "Blackberry" is not
# reached before purple has had a look at it.
_COMPILED = [
    (family, [re.compile(rf"\b{re.escape(k)}\b") for k in family["keywords"]])
    for family in FAMILIES
]

FAMILY_UNKNOWN = {"id": "other", "label": "Other & specialty", "hex": "#5a5f63"}


def family_for(title: str) -> str:
    """Family id for a product title, or "other" when nothing matches."""
    lower = title.lower()
    for family, patterns in _COMPILED:
        if any(p.search(lower) for p in patterns):
            return family["id"]
    return FAMILY_UNKNOWN["id"]


def family_payload() -> list[dict]:
    """The family list as it ships in vinyl-colors.json (no keywords)."""
    families = [{"id": f["id"], "label": f["label"], "hex": f["hex"]} for f in FAMILIES]
    families.append(dict(FAMILY_UNKNOWN))
    return families
