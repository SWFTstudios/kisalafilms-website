/**
 * Smoke tests for the pages that carry logic.
 *
 * The site has no build step and no test runner, so this loads real pages into
 * jsdom, executes the real scripts in the real order, and asserts on the
 * resulting DOM. It catches the things that break silently in a static site:
 * a config path that resolves to undefined, a summary row with no matching
 * output element, a price attribute the studio reads before it was written.
 *
 * Usage:
 *   npm install --no-save jsdom
 *   node scripts/test-pages.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (String(actual) !== String(expected)) {
    throw new Error(`${message} — expected ${expected}, got ${actual}`);
  }
}

/**
 * Load a page and run its scripts in document order. jsdom would fetch the
 * /js/* URLs over HTTP, so the tags are resolved off disk instead.
 */
function load(page, { mutateConfig } = {}) {
  const html = readFileSync(join(PUBLIC, page), "utf8");

  // Clicking a real link makes jsdom log "Not implemented: navigation"; that is
  // expected here and would otherwise bury an actual failure.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err) => {
    if (!/Not implemented/.test(err.message)) console.error(err.message);
  });
  ["error", "warn", "info", "log"].forEach((level) => {
    virtualConsole.on(level, (...args) => console[level]("[page]", ...args));
  });

  const dom = new JSDOM(html, {
    url: `https://kisalafilms.test/${page}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;

  // jsdom has no matchMedia; the reveal and lightbox modules both branch on it.
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });

  // Local static-asset fetch, so the catalogue and bike index resolve.
  window.fetch = async (url) => {
    const path = join(PUBLIC, String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0]);
    if (!existsSync(path)) return { ok: false, status: 404, json: async () => ({}) };
    const body = readFileSync(path, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
  };

  // Capture GA4 traffic instead of loading the real tag.
  window.__events = [];
  const realAppend = window.document.head.appendChild.bind(window.document.head);
  window.document.head.appendChild = (node) => {
    if (node.tagName === "SCRIPT" && /googletagmanager/.test(node.src || "")) return node;
    return realAppend(node);
  };

  const sources = [...window.document.querySelectorAll("script[src]")].map((s) =>
    s.getAttribute("src")
  );

  for (const src of sources) {
    const file = join(PUBLIC, src);
    if (!existsSync(file)) throw new Error(`${page} references a missing script: ${src}`);
    window.eval(readFileSync(file, "utf8"));

    if (src.endsWith("analytics.js")) {
      const real = window.gtag;
      window.gtag = (...args) => {
        if (args[0] === "event") window.__events.push({ name: args[1], params: args[2] || {} });
        return real?.(...args);
      };
    }

    // Applied between config and the modules that consume it, mirroring the
    // hook the real page has no need for.
    if (mutateConfig && src.endsWith("kisala-config.js")) mutateConfig(window);
  }

  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  return window;
}

const text = (win, selector) => win.document.querySelector(selector)?.textContent?.trim();
const summary = (win, key) => text(win, `[data-summary-out="${key}"]`);
const field = (win, name) => win.document.querySelector(`[name="${name}"]`);

function fire(win, el, type) {
  el.dispatchEvent(new win.Event(type, { bubbles: true }));
}

/* ---- Config hydration -------------------------------------------------- */
{
  const win = load("wrap-studio.html");

  check("config exposes a resolver", () => {
    assert(win.KisalaConfig, "window.KisalaConfig missing");
    assertEqual(win.KisalaConfig.mode, "founding", "default pricing mode");
  });

  check("service prices hydrate onto the option cards", () => {
    const full = win.document.querySelector('input[name="service"][value="Full colour-change wrap"]');
    assertEqual(full.dataset.priceLow, "1650", "full wrap low");
    assertEqual(full.dataset.priceHigh, "2400", "full wrap high");
  });

  check("add-on prices hydrate", () => {
    const photo = win.document.querySelector('input[name="addons"][value="Photo set"]');
    assertEqual(photo.dataset.price, "200", "photo set price");
  });

  check("money-formatted copy renders", () => {
    assertEqual(text(win, '[data-cfg="services.fullWrap.from"]'), "$1,650", "full wrap copy");
    assertEqual(text(win, '[data-cfg="transport.pickup.from"]'), "$75", "pickup copy");
  });

  check("the zone select is generated from config", () => {
    const options = [...field(win, "pickup_zone").options].map((o) => o.value);
    assert(options.includes("Jersey City, NJ"), "Jersey City missing");
    assert(options.includes("Brooklyn, NY"), "Brooklyn missing");
    assert(options.includes("New York City"), "NYC missing");
  });

  check("the budget select is generated from config", () => {
    const options = [...field(win, "budget").options].map((o) => o.value).filter(Boolean);
    assertEqual(options.length, win.KISALA_CONFIG.budgets.length, "budget option count");
  });

  check("the founding note renders in founding mode", () => {
    assert(win.document.querySelector('[data-cfg-show="founding"]'), "founding block was dropped");
  });
}

/* ---- Standard pricing mode -------------------------------------------- */
{
  const win = load("wrap-studio.html", {
    mutateConfig: (w) => {
      w.KISALA_CONFIG.pricingMode = "standard";
    },
  });

  check("standard mode raises every price", () => {
    const full = win.document.querySelector('input[name="service"][value="Full colour-change wrap"]');
    // 1650 * 1.35 = 2227.5 → 2225 at the $25 step
    assertEqual(full.dataset.priceLow, "2225", "standard full wrap low");
    assertEqual(text(win, '[data-cfg="services.fullWrap.from"]'), "$2,225", "standard copy");
  });

  check("standard mode drops the founding-only copy", () => {
    assertEqual(
      win.document.querySelectorAll('[data-cfg-show="founding"]').length,
      0,
      "founding blocks still present"
    );
  });

  check("the submitted pricing mode follows the config", () => {
    assertEqual(field(win, "pricing_mode").value, "standard", "pricing_mode field");
  });
}

/* ---- Transport ---------------------------------------------------------- */
{
  const win = load("wrap-studio.html");
  const detail = win.document.querySelector("[data-transport-detail]");
  const pick = (value) => {
    const el = win.document.querySelector(`input[name="transport"][value^="${value}"]`);
    el.checked = true;
    fire(win, el, "change");
    return el;
  };

  check("drop-off is the default and adds nothing", () => {
    assertEqual(field(win, "transport_estimate").value, "", "transport estimate should be blank");
    assert(detail.hidden, "zone fields should be hidden for a drop-off");
  });

  check("pickup reveals the zone fields and charges the base rate", () => {
    pick("Pickup — collect");
    assert(!detail.hidden, "zone fields should be visible");
    assertEqual(field(win, "transport_estimate").value, "$75", "pickup fee");
    assertEqual(summary(win, "transportfee"), "$75 est.", "pickup summary");
  });

  check("return delivery charges both legs", () => {
    pick("Pickup and return");
    assertEqual(field(win, "transport_estimate").value, "$150", "round trip fee");
  });

  check("a zone floor scales with the number of legs", () => {
    // A dearer zone must not be under-quoted on a round trip.
    win.KISALA_CONFIG.zones.find((z) => z.id === "brooklyn").pickupFrom = 120;
    win.KisalaConfig.apply(win.document);
    const zone = field(win, "pickup_zone");
    zone.value = "Brooklyn, NY";
    fire(win, zone, "change");
    assertEqual(field(win, "transport_estimate").value, "$240", "two Brooklyn legs");

    pick("Pickup — collect");
    assertEqual(field(win, "transport_estimate").value, "$120", "one Brooklyn leg");
    win.KISALA_CONFIG.zones.find((z) => z.id === "brooklyn").pickupFrom = 75;
  });

  check("choosing a drop-off clears a zone picked earlier", () => {
    pick("Drop-off");
    assertEqual(field(win, "pickup_zone").value, "", "stale zone still posted");
    assertEqual(field(win, "transport_estimate").value, "", "stale fee still posted");
  });
}

/* ---- Estimate and summary ---------------------------------------------- */
{
  const win = load("wrap-studio.html");

  check("the ballpark stays wrap-only while the total carries transport", () => {
    const service = win.document.querySelector('input[name="service"][value="Full colour-change wrap"]');
    service.checked = true;
    fire(win, service, "change");

    assertEqual(field(win, "ballpark_estimate").value, "$1,650–$2,400", "wrap-only ballpark");
    assertEqual(field(win, "estimate_total_range").value, "$1,650–$2,400", "total with no transport");

    const pickup = win.document.querySelector('input[name="transport"][value^="Pickup — collect"]');
    pickup.checked = true;
    fire(win, pickup, "change");

    assertEqual(field(win, "ballpark_estimate").value, "$1,650–$2,400", "ballpark must not absorb transport");
    assertEqual(field(win, "estimate_total_range").value, "$1,725–$2,475", "total should include transport");
  });

  check("add-ons still land in the estimate", () => {
    const addon = win.document.querySelector('input[name="addons"][value="Photo set"]');
    addon.checked = true;
    fire(win, addon, "change");
    assertEqual(field(win, "ballpark_estimate").value, "$1,850–$2,600", "ballpark with the photo set");
  });

  check("budget reaches the summary", () => {
    const budget = field(win, "budget");
    budget.value = "$2,000 – $3,500";
    fire(win, budget, "change");
    assertEqual(summary(win, "budget"), "$2,000 – $3,500", "budget summary row");
  });

  check("every summary key has an output element", () => {
    const outs = new Set(
      [...win.document.querySelectorAll("[data-summary-out]")].map((el) =>
        el.getAttribute("data-summary-out")
      )
    );
    ["bike", "service", "finish", "colour", "coverage", "addons", "saved", "transport", "transportfee", "photos", "budget", "timeline"].forEach(
      (key) => assert(outs.has(key), `no summary row for "${key}"`)
    );
  });
}

/* ---- The form contract ------------------------------------------------- */
{
  const win = load("wrap-studio.html");
  const form = win.document.querySelector("[data-wrap-studio]");

  check("the studio still posts natively as multipart", () => {
    assertEqual(form.getAttribute("method").toLowerCase(), "post", "method");
    assertEqual(form.getAttribute("enctype"), "multipart/form-data", "enctype");
    assert(/formsubmit\.co/.test(form.getAttribute("action")), "action should stay on FormSubmit");
    assert(form.querySelector('[name="attachment"]'), "the photo input went missing");
  });

  check("the new lead fields are all present", () => {
    ["transport", "pickup_zone", "pickup_area", "pickup_notes", "budget", "transport_estimate", "estimate_total_range", "pricing_mode", "saved_films"].forEach(
      (name) => assert(field(win, name), `missing lead field "${name}"`)
    );
  });
}

/* ---- Vinyl browser ------------------------------------------------------ */
{
  const win = load("wrap-studio.html");
  const root = win.document.querySelector("[data-vinyl-browse]");
  const panel = root.querySelector("[data-browse-panel]");
  const toggle = root.querySelector("[data-browse-toggle]");
  const grid = root.querySelector("[data-browse-grid]");
  const cards = () => [...grid.querySelectorAll(".vinyl-card")];
  const chips = (sel) => [...root.querySelectorAll(`${sel} [data-chip]`)];

  const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  const settle = () => new Promise((r) => setTimeout(r, 30));

  check("the catalogue exposes a shared API", () => {
    assert(win.KisalaVinyl, "window.KisalaVinyl missing");
    ["ready", "all", "families", "finishes", "pick"].forEach((k) =>
      assert(typeof win.KisalaVinyl[k] === "function", `KisalaVinyl.${k} missing`)
    );
  });

  check("the browse panel starts closed", () => {
    assert(panel.hidden, "panel should be collapsed until asked for");
    assertEqual(grid.children.length, 0, "nothing should render before opening");
  });

  await (async () => {
    click(toggle);
    await settle();

    check("opening the panel loads and renders the catalogue", () => {
      assert(!panel.hidden, "panel should be open");
      assertEqual(win.KisalaVinyl.all().length, 1102, "catalogue size");
      assertEqual(cards().length, 24, "first page of cards");
      assert(/of 1,?102 films|1102 films/.test(text(win, "[data-browse-count]")), `count read "${text(win, "[data-browse-count]")}"`);
    });

    check("family and finish chips render from the data", () => {
      assert(chips("[data-family-filters]").length > 8, "too few family chips");
      assert(chips("[data-finish-filters]").length > 5, "too few finish chips");
      const swatch = root.querySelector("[data-family-filters] .swatch-chip-dot");
      assert(swatch, "family chips should carry a colour dot");
    });

    check("a family filter narrows the list", () => {
      const chipFor = (id) => chips("[data-family-filters]").find((c) => c.getAttribute("data-chip") === id);
      click(chipFor("blue"));
      assertEqual(win.KisalaVinyl.all().filter((c) => c.c === "blue").length, 149, "blue films in the catalogue");
      assert(/of 149 films/.test(text(win, "[data-browse-count]")), "count should reflect the filter");

      // Re-queried, not held from before the click: the chip row must survive a
      // filter toggle in place so keyboard focus is not thrown away.
      const blue = chipFor("blue");
      assert(blue.classList.contains("on"), "chip should read as active");
      assertEqual(blue.getAttribute("aria-pressed"), "true", "chip aria-pressed");
    });

    check("coloured PPF reaches the colour filter it belongs in", () => {
      // The bug this guards: a title saying "Paint Protection Film" used to
      // file every coloured PPF as clear, so blue PPF was unfindable.
      const bluePpf = win.KisalaVinyl.all().filter((c) => c.c === "blue" && c.t === "Colored PPF Wrap");
      assert(bluePpf.length > 10, `only ${bluePpf.length} blue PPF films are reachable`);
    });

    check("a finish filter stacks on top of the family filter", () => {
      const satin = chips("[data-finish-filters]").find((c) => c.getAttribute("data-chip") === "Satin");
      click(satin);
      const expected = win.KisalaVinyl.all().filter((c) => c.c === "blue" && c.f === "Satin").length;
      assert(expected > 0 && expected < 149, `combined filter returned ${expected}`);
      assert(new RegExp(`of ${expected} films|^${expected} films`).test(text(win, "[data-browse-count]")), "combined count");
    });

    check("clearing filters restores the full list", () => {
      click(root.querySelector("[data-browse-clear]"));
      assert(/of 1,?102 films|1102 films/.test(text(win, "[data-browse-count]")), "count after clearing");
      assertEqual(chips("[data-family-filters]").filter((c) => c.classList.contains("on")).length, 0, "chips still active");
    });

    check("sorting reorders the rendered cards", () => {
      // The first card can legitimately stay put — the catalogue already sorts
      // by name and 3M happens to lead both orders — so compare the sequence.
      const order = () => cards().map((el) => el.querySelector(".vinyl-card-name").textContent).join("|");
      const byName = order();
      const sort = root.querySelector("[data-browse-sort]");
      sort.value = "finish";
      fire(win, sort, "change");
      assert(order() !== byName, "sorting by finish changed nothing");

      sort.value = "name";
      fire(win, sort, "change");
      assertEqual(order(), byName, "sorting back by name should restore the order");
    });

    check("the list view swaps the layout without re-rendering a second catalogue", () => {
      const before = cards().length;
      click(root.querySelector('[data-view="list"]'));
      assert(grid.classList.contains("vinyl-cards--list"), "list class missing");
      assertEqual(cards().length, before, "card count should not change with the view");
    });

    check("show more pages in the next batch", () => {
      click(root.querySelector('[data-view="grid"]'));
      click(root.querySelector("[data-browse-more]"));
      assertEqual(cards().length, 48, "second page");
    });

    check("using a film writes the shared hidden fields", () => {
      const target = win.KisalaVinyl.all().find((c) => c.i && c.u);
      const card = cards().find((el) => el.querySelector(`[data-use="${target.id}"]`))
        || grid.querySelector(".vinyl-card");
      const use = card.querySelector("[data-use]");
      const picked = win.KisalaVinyl.all().find((c) => String(c.id) === use.getAttribute("data-use"));
      click(use);
      assertEqual(field(win, "vinyl_color").value, picked.n, "vinyl_color");
      assertEqual(field(win, "vinyl_vendor").value, picked.v, "vinyl_vendor");
      assertEqual(summary(win, "colour"), picked.n, "colour summary row");
    });

    check("saving a film shortlists it and reaches the build sheet", () => {
      const save = grid.querySelector("[data-save]");
      const picked = win.KisalaVinyl.all().find((c) => String(c.id) === save.getAttribute("data-save"));
      click(save);

      assertEqual(text(win, "[data-saved-count]"), "1", "saved tally");
      assert(!root.querySelector("[data-saved-wrap]").hidden, "shortlist should be visible");
      assertEqual(field(win, "saved_films").value, picked.n, "saved_films field");
      assertEqual(summary(win, "saved"), "1 shortlisted", "saved summary row");
    });

    check("a shortlist survives titles full of pipes", () => {
      // Metro titles read "… Vinyl Wrap | G356 | BLOWOUT STOCK | (420 sq ft)",
      // so the count cannot come from splitting the field value. Pick a
      // pipe-heavy film that is actually on screen, and not the one already saved.
      const alreadySaved = field(win, "saved_films").value;
      const target = cards()
        .map((el) => el.querySelector("[data-save]"))
        .filter(Boolean)
        .map((btn) => win.KisalaVinyl.all().find((c) => String(c.id) === btn.getAttribute("data-save")))
        .find((c) => c && c.n.split("|").length > 2 && c.n !== alreadySaved);

      assert(target, "expected a pipe-heavy title among the rendered cards");
      click(grid.querySelector(`[data-save="${target.id}"]`));

      assertEqual(Number(field(win, "saved_films").dataset.count), 2, "two films saved");
      assertEqual(summary(win, "saved"), "2 shortlisted", "saved summary row");
      assertEqual(
        field(win, "saved_films").value.split("\n").length,
        2,
        "the field should hold one film per line"
      );
    });

    check("saving persists across a reload", () => {
      const stored = JSON.parse(win.localStorage.getItem("kisala-saved-films"));
      assertEqual(stored.length, 2, "two films in localStorage");
      assert(stored[0].n, "stored film should keep its name");
    });

    check("two saved films are enough to open a comparison", () => {
      const modal = win.document.querySelector("[data-compare-modal]");
      const open = root.querySelector("[data-compare-open]");
      assert(!open.hidden, "compare should be offered once two films are saved");
      click(open);
      assert(!modal.hidden, "compare overlay should be open");
      assertEqual(modal.querySelectorAll(".vinyl-compare-col").length, 2, "two columns");
      assert(/Metro Restyling/.test(text(win, ".vinyl-compare-note")), "thumbnail provenance note missing");
    });

    check("escape closes the comparison", () => {
      const modal = win.document.querySelector("[data-compare-modal]");
      win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      assert(modal.hidden, "overlay should close on Escape");
    });

    check("ticking compare needs no shortlist of its own", () => {
      // Removing an entry re-renders the shortlist, so each button has to be
      // re-queried rather than held from a snapshot taken before the first click.
      let guard = 0;
      let next;
      while ((next = root.querySelector("[data-saved-list] [data-save]")) && guard++ < 20) {
        click(next);
      }
      assertEqual(Number(field(win, "saved_films").dataset.count), 0, "shortlist should be empty");
      assert(root.querySelector("[data-compare-open]").hidden, "compare should be hidden with nothing chosen");

      [...grid.querySelectorAll("[data-compare]")].slice(0, 2).forEach(click);
      const open = root.querySelector("[data-compare-open]");
      assert(!open.hidden, "two ticked films should offer a comparison");
      click(open);
      assertEqual(
        win.document.querySelectorAll("[data-compare-modal] .vinyl-compare-col").length,
        2,
        "two ticked columns"
      );
    });

    check("un-saving empties the field", () => {
      assertEqual(field(win, "saved_films").value, "", "saved_films should be empty");
      assertEqual(summary(win, "saved"), "None", "saved summary should fall back to its placeholder");
    });
  })();
}

/* ---- Pricing across the site ------------------------------------------- */
{
  const PRICED = ["index.html", "pricing.html", "services.html"];

  for (const page of PRICED) {
    const founding = load(page);
    const standard = load(page, {
      mutateConfig: (w) => {
        w.KISALA_CONFIG.pricingMode = "standard";
      },
    });

    check(`${page} quotes the pickup floor from config`, () => {
      const nodes = [...founding.document.querySelectorAll('[data-cfg$="pickupFrom"], [data-cfg="transport.pickup.from"]')];
      assert(nodes.length > 0, "no pickup figure on the page");
      nodes.forEach((el) => assertEqual(el.textContent, "$75", "pickup figure"));
    });

    check(`${page} has no hardcoded price left behind`, () => {
      // Anything still reading $1,650 in standard mode is a number the owner
      // cannot move from the config.
      const stale = [...standard.document.querySelectorAll("body *")].filter(
        (el) => el.children.length === 0 && /\$1,650|\$575\b/.test(el.textContent)
      );
      assertEqual(stale.length, 0, `stale prices: ${stale.map((el) => el.textContent.trim()).join(" / ")}`);
    });

    check(`${page} moves every price when the mode flips`, () => {
      const read = (win) =>
        [...win.document.querySelectorAll('[data-cfg^="services."]')].map((el) => el.textContent);
      const a = read(founding);
      const b = read(standard);
      if (!a.length) return; // services.html quotes no service prices
      assert(a.join() !== b.join(), "prices did not move with the mode");
    });
  }

  check("the founding band is gated on the pricing mode", () => {
    const founding = load("pricing.html");
    const standard = load("pricing.html", {
      mutateConfig: (w) => {
        w.KISALA_CONFIG.pricingMode = "standard";
      },
    });
    assert(
      founding.document.body.textContent.includes("Founding riders"),
      "founding band missing in founding mode"
    );
    assert(
      !standard.document.body.textContent.includes("Founding riders"),
      "founding band should not render in standard mode"
    );
  });

  check("no page anchors a founding price against a struck-through one", () => {
    // A discount claim would depend on the unreviewed standard column.
    for (const page of PRICED) {
      const win = load(page);
      const struck = win.document.querySelectorAll("s, del, .was-price, [data-cfg-was]");
      assertEqual(struck.length, 0, `${page} shows a struck-through price`);
    }
  });
}

/* ---- Local landing pages ----------------------------------------------- */
{
  const CITY_PAGES = [
    ["locations/jersey-city.html", "jersey-city", "Jersey City"],
    ["locations/brooklyn.html", "brooklyn", "Brooklyn"],
    ["locations/new-york-city.html", "nyc", "New York City"],
  ];

  const bodies = new Map();

  for (const [page, zone, city] of CITY_PAGES) {
    const win = load(page);
    bodies.set(page, win.document.querySelector("main, body").textContent.replace(/\s+/g, " "));

    check(`${city} page is a distinct page, not a template fill`, () => {
      assertEqual(win.document.querySelectorAll("h1").length, 1, "one h1");
      assert(new RegExp(city.split(" ")[0], "i").test(win.document.querySelector("h1").textContent), "h1 should name the city");
      assertEqual(win.document.querySelector("[data-local-zone]")?.getAttribute("data-local-zone"), zone, "zone marker");
      assert(win.document.querySelectorAll(".faq-item").length >= 3, "needs its own FAQ");
    });

    check(`${city} page hydrates its pickup fee from config`, () => {
      const fee = win.document.querySelector(`[data-cfg="zones.${zone}.pickupFrom"]`);
      assert(fee, "no zone-specific pickup figure");
      assertEqual(fee.textContent, "$75", "pickup figure");
    });

    check(`${city} page carries canonical and social tags`, () => {
      const canonical = win.document.querySelector("link[rel=canonical]")?.getAttribute("href");
      assertEqual(canonical, `https://kisalafilms-website.elombe.workers.dev/${page}`, "canonical");
      ["og:url", "og:title", "og:description", "og:image"].forEach((p) =>
        assert(win.document.querySelector(`meta[property="${p}"]`), `missing ${p}`)
      );
      assert(win.document.querySelector('meta[name="twitter:card"]'), "missing twitter:card");
    });

    check(`${city} page JSON-LD parses and claims nothing unverifiable`, () => {
      const blocks = [...win.document.querySelectorAll('script[type="application/ld+json"]')];
      assert(blocks.length > 0, "no JSON-LD");
      const graph = blocks.flatMap((b) => JSON.parse(b.textContent)["@graph"] || []);
      const types = graph.map((n) => n["@type"]);
      ["AutoBodyShop", "BreadcrumbList", "FAQPage"].forEach((t) =>
        assert(types.includes(t), `missing ${t}`)
      );

      const raw = JSON.stringify(graph);
      ["aggregateRating", "review", "ratingValue", "streetAddress", "telephone"].forEach((banned) =>
        assert(!raw.includes(banned), `JSON-LD asserts "${banned}"`)
      );

      const shop = graph.find((n) => n["@type"] === "AutoBodyShop");
      assertEqual(shop.address.addressLocality, "Jersey City", "the garage stays in Jersey City");
      assertEqual(shop.areaServed.length, 3, "three served areas");
    });

    check(`${city} page links the other two`, () => {
      const links = [...win.document.querySelectorAll('a[href^="/locations/"]')].map((a) =>
        a.getAttribute("href")
      );
      const others = CITY_PAGES.filter(([p]) => p !== page).map(([p]) => `/${p}`);
      others.forEach((href) => assert(links.includes(href), `no link to ${href}`));
    });

    if (zone !== "jersey-city") {
      check(`${city} page does not imply a second shop`, () => {
        const text = bodies.get(page);
        assert(/Jersey City/.test(text), "should still name where the work happens");
        assert(
          /no (Kisala Films )?(shop|bay)|One garage|no second shop|isn.t in the city/i.test(text),
          "should state plainly that there is no shop in this city"
        );
      });
    }
  }

  check("the three city pages are genuinely different copy", () => {
    const texts = [...bodies.values()];
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        // Compare the distinctive words rather than the shared chrome.
        const words = (s) => new Set(s.toLowerCase().match(/[a-z']{5,}/g) || []);
        const a = words(texts[i]);
        const b = words(texts[j]);
        const shared = [...a].filter((w) => b.has(w)).length;
        const overlap = shared / Math.min(a.size, b.size);
        assert(overlap < 0.75, `pages ${i} and ${j} share ${Math.round(overlap * 100)}% of their vocabulary`);
      }
    }
  });

  check("the locations hub links all three", () => {
    const win = load("locations.html");
    ["jersey-city", "brooklyn", "new-york-city"].forEach((slug) =>
      assert(
        win.document.querySelector(`a[href="/locations/${slug}.html"]`),
        `hub does not link ${slug}`
      )
    );
  });

  check("the home page carries the local section", () => {
    const win = load("index.html");
    ["jersey-city", "brooklyn", "new-york-city"].forEach((slug) =>
      assert(
        win.document.querySelector(`a[href="/locations/${slug}.html"]`),
        `home page does not link ${slug}`
      )
    );
  });
}

/* ---- Gallery case studies ---------------------------------------------- */
{
  const win = load("gallery.html");
  const grid = win.document.querySelector("[data-gallery-grid]");
  const metaOut = win.document.querySelector("[data-lb-meta]");
  const openTile = (figure) => {
    figure.querySelector("[data-lightbox]").dispatchEvent(
      new win.MouseEvent("click", { bubbles: true })
    );
  };
  const rows = () =>
    [...metaOut.querySelectorAll(".lb-meta-row")].map((r) => [
      r.querySelector(".lb-meta-label").textContent,
      r.querySelector(".lb-meta-value").textContent,
    ]);

  check("the lightbox renders the case-study rows a tile has", () => {
    const figure = grid.querySelector('[data-caption^="Left profile"]');
    assert(figure, "expected the left-profile tile");
    openTile(figure);

    assert(!metaOut.hidden, "metadata block should be visible");
    const map = new Map(rows());
    assertEqual(map.get("Service"), "Full colour-change wrap", "service row");
    assertEqual(map.get("Coverage"), "Every painted panel", "coverage row");
    assertEqual(map.get("Where"), "Jersey City, NJ", "city row");
  });

  check("unrecorded fields are left out rather than guessed", () => {
    const labels = rows().map(([label]) => label);
    ["Bike", "Film", "Time in the garage"].forEach((label) =>
      assert(!labels.includes(label), `"${label}" should be absent, not invented`)
    );
  });

  check("a tile with nothing recorded shows no metadata block", () => {
    const bare = grid.querySelector('[data-caption^="Knife work"]');
    assert(bare, "expected the knife-work tile");
    assert(!bare.dataset.bike && !bare.dataset.service, "that tile should carry no metadata");
    openTile(bare);
    assert(metaOut.hidden, "metadata block should collapse for a bare tile");
    assertEqual(metaOut.children.length, 0, "no stale rows should be left behind");
  });

  check("film tiles carry the runtime and city from films.json", () => {
    const film = grid.querySelector('[data-caption^="L0ST TAPES"]');
    openTile(film);
    const map = new Map(rows());
    assertEqual(map.get("Runtime"), "12:04", "runtime row");
    assertEqual(map.get("Where"), "New York City", "city row");
  });

  check("no gallery tile claims a bike, film brand or turnaround yet", () => {
    // These are the fields only the owner's build records can fill.
    const invented = [...grid.querySelectorAll(".masonry-item")].filter(
      (el) => el.dataset.bike || el.dataset.film || el.dataset.turnaround
    );
    assertEqual(invented.length, 0, "a tile asserts a detail the repository cannot vouch for");
  });
}

/* ---- Technical SEO ------------------------------------------------------ */
{
  const { readdirSync, statSync } = await import("node:fs");

  const NOINDEX = new Set(["thanks.html", "styleguide.html", "404.html", "wrap-quote/index.html"]);

  function allPages(dir = PUBLIC, prefix = "") {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(full).isDirectory()) return allPages(full, rel);
      if (!entry.endsWith(".html")) return [];
      const html = readFileSync(full, "utf8");
      // Retired redirect stubs are not pages.
      if (/http-equiv/.test(html) && /content="0;/.test(html)) return [];
      return [[rel, html]];
    });
  }

  const pages = allPages();
  const sitemap = readFileSync(join(PUBLIC, "sitemap.xml"), "utf8");
  const robots = readFileSync(join(PUBLIC, "robots.txt"), "utf8");

  const canonicalPath = (rel) =>
    rel === "index.html" ? "/" : rel.endsWith("/index.html") ? `/${rel.slice(0, -10)}` : `/${rel}`;

  check("every indexable page has a canonical, OG and Twitter tags", () => {
    const missing = [];
    for (const [rel, html] of pages) {
      if (NOINDEX.has(rel)) continue;
      const want = [
        'rel="canonical"',
        'property="og:url"',
        'property="og:title"',
        'property="og:image"',
        'name="twitter:card"',
      ];
      want.forEach((tag) => {
        if (!html.includes(tag)) missing.push(`${rel} → ${tag}`);
      });
    }
    assertEqual(missing.length, 0, `missing tags: ${missing.join(", ")}`);
  });

  check("canonicals point at the page's own URL", () => {
    for (const [rel, html] of pages) {
      if (NOINDEX.has(rel)) continue;
      const href = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      assertEqual(href, `https://kisalafilms-website.elombe.workers.dev${canonicalPath(rel)}`, `${rel} canonical`);
    }
  });

  check("no page carries a duplicate canonical or og:url", () => {
    // Two generators touch the <head>; a stacked tag is the failure mode.
    for (const [rel, html] of pages) {
      const canonicals = (html.match(/rel="canonical"/g) || []).length;
      const ogUrls = (html.match(/property="og:url"/g) || []).length;
      assert(canonicals <= 1, `${rel} has ${canonicals} canonicals`);
      assertEqual(ogUrls, 1, `${rel} has ${ogUrls} og:url tags`);
    }
  });

  check("post-conversion and campaign pages stay out of the index", () => {
    for (const rel of NOINDEX) {
      const html = pages.find(([p]) => p === rel)?.[1];
      assert(html, `${rel} not found`);
      assert(/name="robots" content="noindex/.test(html), `${rel} is missing its noindex`);
      assert(!html.includes('rel="canonical"'), `${rel} should not invite indexing with a canonical`);
      assert(!sitemap.includes(canonicalPath(rel)), `${rel} is listed in the sitemap`);
      assert(robots.includes(`Disallow: ${canonicalPath(rel)}`), `${rel} is not disallowed in robots.txt`);
    }
  });

  check("the sitemap lists every indexable page and nothing else", () => {
    const listed = [...sitemap.matchAll(/<loc>https:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
    const expected = pages.filter(([rel]) => !NOINDEX.has(rel)).map(([rel]) => canonicalPath(rel));

    expected.forEach((path) => assert(listed.includes(path), `sitemap is missing ${path}`));
    listed.forEach((path) => assert(expected.includes(path), `sitemap lists ${path}, which is not a page`));
    assertEqual(listed.length, expected.length, "sitemap entry count");
  });

  check("the sitemap is valid XML and points robots at itself", () => {
    assert(/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(sitemap), "missing XML declaration");
    assert(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), "missing namespace");
    assert(robots.includes("Sitemap: https://kisalafilms-website.elombe.workers.dev/sitemap.xml"), "robots.txt does not reference the sitemap");
  });

  check("all JSON-LD parses", () => {
    let blocks = 0;
    for (const [rel, html] of pages) {
      for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try {
          JSON.parse(body);
        } catch (err) {
          throw new Error(`${rel}: ${err.message}`);
        }
        blocks += 1;
      }
    }
    assert(blocks >= 15, `only ${blocks} JSON-LD blocks found`);
  });

  check("JSON-LD claims nothing the site cannot stand behind", () => {
    const banned = ["aggregateRating", "ratingValue", "reviewCount", '"review"', "streetAddress", "telephone", "award", "hasCredential"];
    for (const [rel, html] of pages) {
      for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        banned.forEach((term) =>
          assert(!body.includes(term), `${rel} asserts ${term} in structured data`)
        );
      }
    }
  });

  check("the FAQ markup matches the questions actually on the page", () => {
    const html = pages.find(([p]) => p === "faq.html")[1];
    const onPage = [...html.matchAll(/<button class="faq-q"[^>]*>(.*?)<span class="mark">/gs)].length;
    const graph = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    )["@graph"];
    const faq = graph.find((n) => n["@type"] === "FAQPage");
    assertEqual(faq.mainEntity.length, onPage, "FAQ entry count should match the page");
    faq.mainEntity.forEach((q) => {
      assert(!/[<>]/.test(q.name + q.acceptedAnswer.text), `markup leaked into "${q.name}"`);
      assert(q.acceptedAnswer.text.length > 20, `answer for "${q.name}" looks empty`);
    });
  });

  check("the priced structured data matches the active config", () => {
    const html = pages.find(([p]) => p === "pricing.html")[1];
    const graph = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    )["@graph"];
    const full = graph.find((n) => n["@type"] === "Service" && /Full colour-change/.test(n.name));
    assertEqual(full.offers.priceSpecification.minPrice, 1650, "structured full-wrap floor");
    assertEqual(full.offers.priceSpecification.maxPrice, 2400, "structured full-wrap ceiling");
    assertEqual(full.offers.priceCurrency, "USD", "currency");
  });

  check("breadcrumb trails resolve to real pages", () => {
    const known = new Set(pages.map(([rel]) => canonicalPath(rel)));
    for (const [rel, html] of pages) {
      for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        const graph = JSON.parse(body)["@graph"] || [];
        const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList");
        if (!crumbs) continue;
        crumbs.itemListElement.forEach((c) => {
          const path = c.item.replace("https://kisalafilms-website.elombe.workers.dev", "");
          assert(known.has(path), `${rel} breadcrumb points at ${path}, which does not exist`);
        });
      }
    }
  });
}

/* ---- Analytics ---------------------------------------------------------- */
{
  const events = (win) => win.__events.map((e) => e.name);
  const paramsOf = (win, name) => win.__events.find((e) => e.name === name)?.params || {};
  const click = (win, el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

  check("GA4 is configured from the shared config", () => {
    const win = load("index.html");
    assert(typeof win.KisalaTrack === "function", "KisalaTrack missing");
    const configured = win.dataLayer.find((a) => a[0] === "config");
    assertEqual(configured[1], "G-F2BXR858CL", "measurement id");
  });

  check("the measurement ID is not hardcoded anywhere but the config", () => {
    // It used to be inlined on the ads landing page as well, which meant two
    // places to change and one of them always getting missed.
    const offenders = [];
    for (const rel of ["index.html", "wrap-studio.html", "wrap-quote/index.html", "thanks.html"]) {
      const html = readFileSync(join(PUBLIC, rel), "utf8");
      if (html.includes("G-F2BXR858CL")) offenders.push(rel);
    }
    assertEqual(offenders.length, 0, `hardcoded GA id in: ${offenders.join(", ")}`);
    assert(
      readFileSync(join(PUBLIC, "js/kisala-config.js"), "utf8").includes("G-F2BXR858CL"),
      "the config should be the one place the id lives"
    );
  });

  check("a data-track click reports with its label", () => {
    const win = load("index.html");
    const cta = win.document.querySelector('[data-track="cta_click"]');
    click(win, cta);
    assert(events(win).includes("cta_click"), "cta_click not reported");
    assertEqual(paramsOf(win, "cta_click").label, cta.dataset.trackLabel, "label");
  });

  check("mailto links report themselves without needing an attribute", () => {
    const win = load("contact.html");
    const mail = win.document.querySelector('a[href^="mailto:"]');
    assert(mail, "expected a mailto link on the contact page");
    click(win, mail);
    assert(events(win).includes("email_click"), "email_click not reported");
  });

  check("opening the Wrap Studio reports a view", () => {
    const win = load("wrap-studio.html");
    assert(events(win).includes("view_wrap_studio"), "view_wrap_studio not reported");
  });

  check("the thanks page fires the conversion", () => {
    // This, not generate_lead, is the event to count: the studio's native POST
    // unloads the page mid-request, so only the redirect target proves delivery.
    const win = load("thanks.html");
    assert(events(win).includes("wrap_studio_lead"), "wrap_studio_lead not reported");
    assertEqual(paramsOf(win, "wrap_studio_lead").value, 1, "conversion value");
  });

  check("no other page fires the conversion", () => {
    for (const rel of ["index.html", "pricing.html", "wrap-studio.html", "gallery.html"]) {
      const win = load(rel);
      assert(!events(win).includes("wrap_studio_lead"), `${rel} fires the conversion`);
    }
  });

  check("studio choices report as they are made", () => {
    const win = load("wrap-studio.html");
    const service = win.document.querySelector('input[name="service"][value="Chrome delete"]');
    click(win, service);
    assert(events(win).includes("select_service"), "select_service not reported");
    assertEqual(paramsOf(win, "select_service").label, "Chrome delete", "service label");

    const transport = win.document.querySelector('input[name="transport"][value^="Pickup — collect"]');
    click(win, transport);
    assertEqual(paramsOf(win, "select_transport").label, "Pickup", "transport label");
  });

  check("submitting the studio reports the build context", () => {
    const win = load("wrap-studio.html");
    const form = win.document.querySelector("[data-wrap-studio]");
    const service = win.document.querySelector('input[name="service"][value="Full colour-change wrap"]');
    service.checked = true;
    fire(win, service, "change");

    const budget = field(win, "budget");
    budget.value = "$2,000 – $3,500";
    fire(win, budget, "change");

    // jsdom does not implement submission, only the event.
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

    const lead = paramsOf(win, "generate_lead");
    assertEqual(lead.label, "Full colour-change wrap", "service on the lead event");
    assertEqual(lead.budget, "$2,000 – $3,500", "budget on the lead event");
  });

  check("the local pages report which city was landed on", () => {
    const win = load("locations/brooklyn.html");
    assert(events(win).includes("view_local_page"), "view_local_page not reported");
    assertEqual(paramsOf(win, "view_local_page").label, "brooklyn", "zone label");
  });

  check("analytics degrades quietly when disabled", () => {
    const win = load("index.html", {
      mutateConfig: (w) => {
        w.KISALA_CONFIG.analytics.enabled = false;
      },
    });
    const cta = win.document.querySelector('[data-track="cta_click"]');
    click(win, cta); // must not throw
    assertEqual(win.__events.length, 0, "nothing should be reported when disabled");
  });
}

/* ---- Report ------------------------------------------------------------ */
console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.error(`  FAIL  ${f}`));
  process.exit(1);
}
