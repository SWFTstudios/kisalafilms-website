/**
 * Kisala Films — the one file to edit.
 *
 * Every price, pickup fee, service zone and availability flag on the site comes
 * from here. Loaded synchronously in <head> ahead of every other script, so the
 * numbers are right on the first paint; config-apply.js writes them into the
 * markup, and the values sitting in the HTML are only the JS-off fallback.
 *
 * Lines marked REVIEW: are wired up but the number itself has not been signed
 * off. They are safe to ship — no public copy quotes an unreviewed number as a
 * fact or anchors a discount against one — but check them before relying on
 * them. See "Configuration" in README.md.
 */
window.KISALA_CONFIG = {
  /* Absolute-URL base for canonicals, og:url and the sitemap. Change this once
     the site moves to its own domain, then re-run scripts/check-seo.py. */
  siteUrl: "https://kisalafilms-website.elombe.workers.dev",
  email: "elombe@swftstudios.com",
  instagram: "https://www.instagram.com/kisalafilms/",

  /* ---- Which price column the whole site quotes -------------------------
     "founding" — the early-portfolio rate, what the site publishes today
     "standard" — the later rate. REVIEW the numbers below before switching. */
  pricingMode: "founding",

  founding: {
    /* Slots are stated on the pricing page and in the studio. Keep this
       honest: it is a promise about availability, so lower it as builds book
       and set available:false rather than letting it sit at a stale number. */
    slotsTotal: 8,
    slotsRemaining: 6, // REVIEW: confirm against the actual books
    label: "Founding rider",
    note: "Founding-rider rate while the first builds go through the garage.",
  },

  /* Standard prices are derived from the founding ones by this multiplier,
     rounded to $25. Replace the derived values with real numbers before
     flipping pricingMode. REVIEW: this multiplier is a placeholder. */
  standardUplift: 1.35,

  /* ---- Services ---------------------------------------------------------
     `founding` is the published range. `standard` is filled in from
     standardUplift at load unless it is set explicitly here.
     `scales: true` marks the services whose labour depends on how much
     bodywork comes off — those get the difficulty multiplier in
     wrap-studio.js. Add-ons are flat. */
  services: {
    fullWrap: {
      label: "Full colour-change wrap",
      scales: true,
      founding: { low: 1650, high: 2400 },
    },
    partialWrap: {
      label: "Partial wrap / accents",
      scales: true,
      founding: { low: 575, high: 975 },
    },
    chromeDelete: {
      label: "Chrome delete",
      scales: false,
      founding: { low: 275, high: 450 },
    },
    tankGuard: {
      label: "Tank guard (clear PPF)",
      scales: false,
      founding: { low: 180, high: 290 },
    },
    ppf: {
      label: "Paint protection film",
      scales: true,
      founding: { low: 450, high: 1250 },
    },
    customPrint: {
      label: "Custom printed design",
      scales: true,
      founding: { low: 950, high: 2300 },
    },
    wrapRemoval: {
      label: "Wrap removal",
      scales: true,
      founding: { low: 150, high: 400 },
    },
    filmOnly: {
      label: "Film / video only",
      scales: false,
      founding: { low: 350, high: 900 },
    },
  },

  addons: {
    transformationFilm: { label: "Transformation film", founding: 350 },
    photoSet: { label: "Photo set", founding: 200 },
    tankGuard: { label: "Tank guard", founding: 180 },
    rimTape: { label: "Rim tape / wheel stripes", founding: 120 },
    lightTint: { label: "Headlight / tail tint", founding: 90 },
    stripOldWrap: { label: "Remove existing wrap", founding: 150 },
  },

  /* ---- Getting the bike to the garage -----------------------------------
     `fee` is what the studio adds to the estimate. `from` is the number the
     marketing copy quotes. Pickup is the only figure here that is confirmed. */
  transport: {
    dropOff: {
      id: "drop-off",
      label: "I'll ride it in or drop it off",
      note: "Jersey City garage, by appointment. Nothing added to the quote.",
      fee: 0,
      priceLabel: "No charge",
    },
    pickup: {
      id: "pickup",
      label: "Pick my bike up",
      note: "I come to you with the van and bring the bike back to the garage.",
      fee: 75,
      from: 75,
      priceLabel: "From $75",
    },
    roundTrip: {
      id: "round-trip",
      label: "Pickup and return delivery",
      note: "Collected before the build and delivered back to you after.",
      fee: 150, // REVIEW: currently two one-way legs at the pickup rate
      from: 150,
      priceLabel: "From $150",
    },
    undecided: {
      id: "undecided",
      label: "Not sure yet — tell me what's easiest",
      note: "Pick this and I'll work it out with you when I send the quote.",
      fee: 0,
      priceLabel: "Quoted with your build",
    },
  },

  /* ---- Where the van goes -----------------------------------------------
     Everything on this list with available:true is a public statement that the
     run is served, and the zone <select> in the Wrap Studio is generated from
     it. Do not add a zone speculatively — set available:false instead, and the
     option renders as "ask me" rather than a promise.

     pickupFrom is per-zone; null falls back to transport.pickup.from. */
  zones: [
    {
      id: "jersey-city",
      label: "Jersey City, NJ",
      short: "Jersey City",
      page: "/locations/jersey-city.html",
      pickupFrom: 75,
      available: true,
      note: "Where the garage is. Ride in, or pickup from anywhere in the city.",
    },
    {
      id: "brooklyn",
      label: "Brooklyn, NY",
      short: "Brooklyn",
      page: "/locations/brooklyn.html",
      pickupFrom: 75, // REVIEW: confirm the Brooklyn run at the base rate
      available: true,
      note: "Pickup run over the bridge. No second shop — the work happens in Jersey City.",
    },
    {
      id: "nyc",
      label: "New York City",
      short: "NYC",
      page: "/locations/new-york-city.html",
      pickupFrom: 75, // REVIEW: confirm the Manhattan / outer-borough run
      available: true,
      note: "Manhattan and the outer boroughs, by pickup.",
    },
    {
      id: "other",
      label: "Somewhere else — I'll tell you where",
      short: "Elsewhere",
      page: null,
      pickupFrom: null,
      available: true,
      note: "Outside the usual run. Say where and I'll tell you honestly if I can get to you.",
    },
  ],

  /* ---- Budget ranges ----------------------------------------------------
     Boundaries line up with the service tiers so the answer is useful: under
     the accent floor, accent range, full-wrap range, and above it. */
  budgets: [
    { id: "under-500", label: "Under $500", low: 0, high: 500 },
    { id: "500-1000", label: "$500 – $1,000", low: 500, high: 1000 },
    { id: "1000-2000", label: "$1,000 – $2,000", low: 1000, high: 2000 },
    { id: "2000-3500", label: "$2,000 – $3,500", low: 2000, high: 3500 },
    { id: "3500-plus", label: "$3,500+", low: 3500, high: null },
    { id: "open", label: "Open — quote it and I'll decide", low: null, high: null },
    { id: "unsure", label: "Not sure yet", low: null, high: null },
  ],

  /* ---- Garage --------------------------------------------------------- */
  garage: {
    city: "Jersey City",
    region: "NJ",
    regionName: "New Jersey",
    country: "US",
    appointmentOnly: true,
    hours: [
      { days: "Monday to Friday", open: "10:00", close: "18:00" },
      { days: "Saturday and Sunday", open: null, close: null, note: "By appointment" },
    ],
    turnaround: "2–3 days",
  },

  /* ---- Analytics ------------------------------------------------------- */
  analytics: {
    ga4: "G-F2BXR858CL",
    enabled: true,
  },
};
