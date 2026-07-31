/**
 * Shared Metro catalogue loader — JSON-first from /data/vinyl-colors.json.
 * Optional D1 /api/films price overlay when available (never required to browse).
 */
(() => {
  const CATALOG_URL = "/data/vinyl-colors.json";
  const PRICES_URL = "/api/films?limit=2000";
  const MARKUP =
    (window.KISALA_CONFIG &&
      window.KISALA_CONFIG.projectCheckout &&
      window.KISALA_CONFIG.projectCheckout.vinylMarkup) ||
    1.4;

  function displayName(title) {
    const raw = String(title || "").trim();
    if (!raw) return "Untitled";
    return raw.split("|")[0].trim() || raw;
  }

  function skuFromTitle(title) {
    const parts = String(title || "")
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) return "";
    return parts[1].split(/\s+/)[0] || "";
  }

  function mapColor(c) {
    const handle = String(c.h || "").trim();
    if (!handle) return null;
    return {
      handle,
      sku: skuFromTitle(c.n),
      name: displayName(c.n),
      brand: c.v || "",
      finish: c.f || "",
      color_family: c.c || "",
      product_type: c.t || "",
      collection: c.collection || "",
      image_url: c.i || "",
      metro_url: c.u || `https://metrorestyling.com/products/${handle}`,
      in_stock: !!c.a,
      description: "",
      install_notes: "",
      recommended_for: "",
      notes: "",
      sell_price_usd: null,
      roll_price_usd: null,
      price_usd: null,
      vinyl_markup: MARKUP,
    };
  }

  function fromMetroJson(data) {
    const colors = Array.isArray(data.colors) ? data.colors : [];
    const films = colors.map(mapColor).filter(Boolean);
    return {
      source: "static",
      films,
      finishes: Array.isArray(data.finishes)
        ? data.finishes
        : Array.from(new Set(films.map((f) => f.finish).filter(Boolean))),
      brands: Array.isArray(data.vendors)
        ? data.vendors
        : Array.from(new Set(films.map((f) => f.brand).filter(Boolean))),
      colorFamilies: Array.isArray(data.colorFamilies)
        ? data.colorFamilies
        : Array.from(new Set(films.map((f) => f.color_family).filter(Boolean))),
      total: films.length,
    };
  }

  function mergePrices(films, apiFilms) {
    if (!Array.isArray(apiFilms) || !apiFilms.length) return films;
    const byHandle = new Map(
      apiFilms.map((f) => [String(f.handle || "").toLowerCase(), f])
    );
    return films.map((film) => {
      const priced = byHandle.get(String(film.handle || "").toLowerCase());
      if (!priced) return film;
      const sell = priced.sell_price_usd ?? null;
      const cost = priced.roll_price_usd ?? priced.price_usd ?? null;
      return {
        ...film,
        sell_price_usd:
          sell != null
            ? sell
            : cost != null && Number.isFinite(Number(cost))
              ? Math.round(Number(cost) * MARKUP * 100) / 100
              : film.sell_price_usd,
        roll_price_usd: cost != null ? cost : film.roll_price_usd,
        price_usd: priced.price_usd ?? film.price_usd,
        description: film.description || priced.description || "",
        install_notes: film.install_notes || priced.install_notes || "",
        recommended_for: film.recommended_for || priced.recommended_for || "",
        notes: film.notes || priced.notes || "",
      };
    });
  }

  async function loadCatalog() {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error("Could not load " + CATALOG_URL);
    return fromMetroJson(await res.json());
  }

  async function loadCatalogWithOptionalPrices() {
    const catalog = await loadCatalog();
    try {
      const res = await fetch(PRICES_URL);
      if (!res.ok) return catalog;
      const data = await res.json();
      const apiFilms = Array.isArray(data.films) ? data.films : [];
      if (!apiFilms.length || data.source === "static") return catalog;
      return {
        ...catalog,
        source: "static+d1",
        films: mergePrices(catalog.films, apiFilms),
        founderPricingActive: !!data.founderPricingActive,
        founderSlotsRemaining: data.founderSlotsRemaining,
        founderLimit: data.founderLimit,
      };
    } catch {
      return catalog;
    }
  }

  async function loadFilm(handle) {
    const h = String(handle || "").trim().toLowerCase();
    if (!h) throw Object.assign(new Error("missing handle"), { code: 400 });
    const catalog = await loadCatalogWithOptionalPrices();
    const film = catalog.films.find((f) => f.handle.toLowerCase() === h);
    if (!film) throw Object.assign(new Error("notfound"), { code: 404 });
    return { ...catalog, film };
  }

  window.KisalaVinylCatalog = {
    CATALOG_URL,
    loadCatalog,
    loadCatalogWithOptionalPrices,
    loadFilm,
    fromMetroJson,
    markup: MARKUP,
  };
})();
