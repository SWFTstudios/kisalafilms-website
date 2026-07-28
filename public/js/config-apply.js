/**
 * Writes kisala-config.js into the page.
 *
 * Loads as the first script at the end of <body>, so the DOM above it is parsed
 * and — critically — it runs before wrap-studio.js reads dataset.priceLow off
 * the option cards. A deferred script would run after those, and the studio
 * would quote the fallback numbers in the markup instead of the config.
 *
 *   data-cfg="services.fullWrap.low"                  text content
 *   data-cfg-format="money|money-plus|plain|integer"  how to render it
 *   data-cfg-attr="data-price-low:services.fullWrap.low; …"   attributes
 *   data-cfg-show="founding"                          drop unless mode matches
 *   data-cfg-zones / data-cfg-budgets                 fill a <select>
 */
(() => {
  const CONFIG = window.KISALA_CONFIG;
  if (!CONFIG) {
    console.warn("kisala-config.js did not load — the page keeps its fallback prices");
    return;
  }

  const MODE = CONFIG.pricingMode === "standard" ? "standard" : "founding";

  const round25 = (n) => Math.round(n / 25) * 25;
  const money = (n) => "$" + Number(n).toLocaleString("en-US");

  /* ---- Resolve the active price column ----------------------------------
     Standard prices come from standardUplift unless they were written out
     explicitly, so the config only has to carry one set of numbers. */
  function columns(entry) {
    const founding = entry.founding;
    if (entry.standard) return { founding, standard: entry.standard };

    const uplift = CONFIG.standardUplift || 1;
    const standard =
      typeof founding === "number"
        ? round25(founding * uplift)
        : { low: round25(founding.low * uplift), high: round25(founding.high * uplift) };

    return { founding, standard };
  }

  function active(entry) {
    if (!entry || entry.founding === undefined) return null;
    return columns(entry)[MODE];
  }

  const servicePrice = (key) => active((CONFIG.services || {})[key]);
  const addonPrice = (key) => active((CONFIG.addons || {})[key]);

  const zone = (id) => (CONFIG.zones || []).find((z) => z.id === id) || null;
  const transport = (id) =>
    Object.values(CONFIG.transport || {}).find((t) => t.id === id) || null;

  /** Pickup floor for a zone, falling back to the general pickup rate. */
  function zonePickupFrom(id) {
    const z = zone(id);
    const base = (CONFIG.transport && CONFIG.transport.pickup && CONFIG.transport.pickup.from) || 0;
    if (!z || z.pickupFrom === null || z.pickupFrom === undefined) return base;
    return z.pickupFrom;
  }

  /**
   * Path lookup with a few virtual keys on top of the raw object:
   *   services.<key>.low|high|from|range   the active column
   *   addons.<key>                         the active price
   *   zones.<id>.<field>                   by id rather than array index
   */
  function get(path) {
    if (!path) return undefined;
    const parts = path.split(".");

    if (parts[0] === "services" && parts.length >= 2) {
      const price = servicePrice(parts[1]);
      if (!price) return undefined;
      const field = parts[2] || "low";
      if (field === "from" || field === "low") return price.low;
      if (field === "high") return price.high;
      if (field === "range") return `${money(price.low)}–${money(price.high)}`;
      return undefined;
    }

    if (parts[0] === "addons" && parts.length === 2) return addonPrice(parts[1]);

    if (parts[0] === "zones" && parts.length >= 3) {
      const z = zone(parts[1]);
      if (!z) return undefined;
      return parts[2] === "pickupFrom" ? zonePickupFrom(parts[1]) : z[parts[2]];
    }

    return parts.reduce((node, key) => (node == null ? undefined : node[key]), CONFIG);
  }

  function format(value, how) {
    if (value === null || value === undefined) return "";
    if (how === "plain") return String(value);
    if (how === "integer") return String(Math.round(Number(value)));
    if (typeof value !== "number") return String(value);
    if (how === "money-plus") return money(value) + "+";
    return money(value);
  }

  function option(value, label) {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
  }

  function fillZones(select) {
    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = "";
    if (placeholder) select.appendChild(placeholder);

    (CONFIG.zones || []).forEach((z) => {
      // An unavailable zone still shows, so a rider outside the run can say so
      // rather than being told nothing — it just doesn't promise a pickup.
      const label = z.available ? z.label : `${z.label} — ask me first`;
      const el = option(z.label, label);
      el.dataset.zoneId = z.id;
      el.dataset.pickupFrom = String(zonePickupFrom(z.id));
      el.dataset.available = z.available ? "1" : "0";
      select.appendChild(el);
    });
  }

  function fillBudgets(select) {
    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = "";
    if (placeholder) select.appendChild(placeholder);
    (CONFIG.budgets || []).forEach((b) => {
      const el = option(b.label, b.label);
      el.dataset.budgetId = b.id;
      select.appendChild(el);
    });
  }

  function apply(root) {
    const scope = root || document;

    scope.querySelectorAll("[data-cfg-show]").forEach((el) => {
      if (el.getAttribute("data-cfg-show") !== MODE) el.remove();
    });

    scope.querySelectorAll("[data-cfg]").forEach((el) => {
      const value = get(el.getAttribute("data-cfg"));
      if (value === undefined || value === null) return;
      el.textContent = format(value, el.getAttribute("data-cfg-format"));
    });

    scope.querySelectorAll("[data-cfg-attr]").forEach((el) => {
      el.getAttribute("data-cfg-attr")
        .split(";")
        .map((pair) => pair.trim())
        .filter(Boolean)
        .forEach((pair) => {
          const split = pair.indexOf(":");
          if (split < 0) return;
          const attr = pair.slice(0, split).trim();
          const value = get(pair.slice(split + 1).trim());
          if (value === undefined || value === null) return;
          el.setAttribute(attr, String(value));
        });
    });

    scope.querySelectorAll("[data-cfg-zones]").forEach(fillZones);
    scope.querySelectorAll("[data-cfg-budgets]").forEach(fillBudgets);
  }

  window.KisalaConfig = {
    raw: CONFIG,
    mode: MODE,
    get,
    money,
    format,
    servicePrice,
    addonPrice,
    zone,
    zonePickupFrom,
    transport,
    apply,
  };

  apply(document);
})();
