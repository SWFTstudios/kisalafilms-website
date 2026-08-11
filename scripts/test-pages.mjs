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
function load(page, { mutateConfig, search = "" } = {}) {
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
    url: `https://kisalafilms.test/${page}${search}`,
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
    if (!src || /^https?:\/\//i.test(src) || src.startsWith("//")) continue;
    const file = join(PUBLIC, src.replace(/^\//, ""));
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

/* ---- Build deposit (percent × labour + vinyl rolls) --------------------- */
{
  const win = load("pricing.html");

  check("depositQuote prices a full wrap with one 5×25 roll", () => {
    const q = win.KisalaConfig.depositQuote("fullWrap");
    assert(q, "fullWrap quote missing");
    assertEqual(q.rolls, 1, "full wrap rolls");
    assertEqual(q.labour, 1650, "full wrap labour");
    assertEqual(q.material, 450, "full wrap material");
    // 0.25 × (1650 + 450) = 525
    assertEqual(q.amount, 525, "full wrap deposit");
  });

  check("depositQuote prices an accent package the same way", () => {
    const q = win.KisalaConfig.depositQuote("partialWrap");
    assertEqual(q.rolls, 1, "accent rolls");
    assertEqual(q.labour, 575, "accent labour");
    // 0.25 × (575 + 450) = 256.25 → 250
    assertEqual(q.amount, 250, "accent deposit");
  });

  check("the pricing page exposes deposit pay buttons", () => {
    assert(win.document.querySelector('[data-deposit-package="fullWrap"]'), "full deposit card");
    assert(win.document.querySelector("[data-deposit-pay]"), "pay button");
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
    ["transport", "pickup_zone", "pickup_area", "pickup_notes", "budget", "transport_estimate", "estimate_total_range", "pricing_mode", "saved_films", "build_sheet_summary", "build_progress"].forEach(
      (name) => assert(field(win, name), `missing lead field "${name}"`)
    );
    assert(win.document.querySelector("[data-studio-cc]"), "missing FormSubmit _cc for rider email");
    assert(win.document.querySelector("[data-garage-modal]"), "missing save/sign-up modal");
  });

  check("the garage script is wired on wrap studio", () => {
    const scripts = [...win.document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"));
    assert(scripts.includes("/js/wrap-studio-garage.js"), "wrap-studio-garage.js missing");
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

    // Pinning the catalogue size to a literal turns a supplier sync into three
    // red tests, so the expectations come from the data the page just loaded.
    // What is being checked is that the readout agrees with the catalogue, not
    // that the catalogue is any particular size.
    const total = () => win.KisalaVinyl.all().length;
    const countReads = (n) =>
      new RegExp(`(?:of )?${n.toLocaleString("en-US")} films|(?:of )?${n} films`).test(
        text(win, "[data-browse-count]")
      );

    check("opening the panel loads and renders the catalogue", () => {
      assert(!panel.hidden, "panel should be open");
      assert(total() > 500, `catalogue looks truncated at ${total()} films`);
      assertEqual(cards().length, 24, "first page of cards");
      assert(countReads(total()), `count read "${text(win, "[data-browse-count]")}"`);
    });

    check("family and finish chips render from the data", () => {
      assert(chips("[data-family-filters]").length > 8, "too few family chips");
      assert(chips("[data-finish-filters]").length > 5, "too few finish chips");
      const swatch = root.querySelector("[data-family-filters] .swatch-chip-dot");
      assert(swatch, "family chips should carry a colour dot");
    });

    let blueCount = 0;

    check("a family filter narrows the list", () => {
      const chipFor = (id) => chips("[data-family-filters]").find((c) => c.getAttribute("data-chip") === id);
      click(chipFor("blue"));
      blueCount = win.KisalaVinyl.all().filter((c) => c.c === "blue").length;
      assert(blueCount > 20 && blueCount < total(), `blue filed ${blueCount} of ${total()} films`);
      assert(countReads(blueCount), `count should reflect the filter, read "${text(win, "[data-browse-count]")}"`);

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
      assert(expected > 0 && expected < blueCount, `combined filter returned ${expected}`);
      assert(new RegExp(`of ${expected} films|^${expected} films`).test(text(win, "[data-browse-count]")), "combined count");
    });

    check("clearing filters restores the full list", () => {
      click(root.querySelector("[data-browse-clear]"));
      assert(countReads(total()), `count after clearing read "${text(win, "[data-browse-count]")}"`);
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

    check("adding a film to the build writes the shared hidden fields", () => {
      const target = win.KisalaVinyl.all().find((c) => c.i && c.u);
      const card = cards().find((el) => el.querySelector(`[data-add-build="${target.id}"]`))
        || grid.querySelector(".vinyl-card");
      const add = card.querySelector("[data-add-build]");
      const picked = win.KisalaVinyl.all().find((c) => String(c.id) === add.getAttribute("data-add-build"));
      click(add);
      assertEqual(field(win, "vinyl_color").value, picked.n, "vinyl_color");
      assertEqual(field(win, "vinyl_vendor").value, picked.v, "vinyl_vendor");
      assertEqual(summary(win, "colour"), picked.n, "colour summary row");
    });

    check("adding a film to the build shortlists it and reaches the build sheet", () => {
      const add = grid.querySelector("[data-add-build]");
      const picked = win.KisalaVinyl.all().find((c) => String(c.id) === add.getAttribute("data-add-build"));
      // May already be shortlisted from the previous add — force a clean add of another if needed
      if (Number(field(win, "saved_films").dataset.count || 0) === 0) click(add);

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
        .map((el) => el.querySelector("[data-add-build]"))
        .filter(Boolean)
        .map((btn) => win.KisalaVinyl.all().find((c) => String(c.id) === btn.getAttribute("data-add-build")))
        .find((c) => c && c.n.split("|").length > 2 && c.n !== alreadySaved);

      assert(target, "expected a pipe-heavy title among the rendered cards");
      click(grid.querySelector(`[data-add-build="${target.id}"]`));

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
      const expected = `https://kisalafilms-website.elombe.workers.dev/${page.replace(/\.html$/, "")}`;
      assertEqual(canonical, expected, "canonical");
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
      const others = CITY_PAGES.filter(([p]) => p !== page).map(([p]) => `/${p.replace(/\.html$/, "")}`);
      others.forEach((href) => assert(links.includes(href), `no link to ${href}`));
    });

    if (zone !== "jersey-city") {
      check(`${city} page does not imply a second shop`, () => {
        const text = bodies.get(page);
        assert(/Jersey City/.test(text), "should still name where the work happens");
        assert(
          /no (K Films )?(shop|bay)|One garage|no second shop|isn.t in the city/i.test(text),
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
        win.document.querySelector(`a[href="/locations/${slug}"]`),
        `hub does not link ${slug}`
      )
    );
  });

  check("the home page carries the local section", () => {
    const win = load("index.html");
    ["jersey-city", "brooklyn", "new-york-city"].forEach((slug) =>
      assert(
        win.document.querySelector(`a[href="/locations/${slug}"]`),
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

/* ---- Quote form --------------------------------------------------------- */
{
  /**
   * Form-scoped field lookup. The page-wide `field()` helper resolves
   * [name="description"] to the <meta> tag in the head long before it reaches
   * the textarea, which is exactly the trap quote.js avoids by reading
   * form.elements.
   */
  const qField = (win, name) =>
    win.document.getElementById("quote-form").elements[name];

  const qPick = (win, name, value) => {
    const el = [...win.document.querySelectorAll(`input[name="${name}"]`)].find(
      (input) => input.value === value
    );
    el.checked = true;
    fire(win, el, "change");
    return el;
  };

  /** Fill everything a valid bike request needs, so a test can break one thing. */
  function validBikeRequest(win) {
    const pick = (name, value) => qPick(win, name, value);
    const type = (name, value) => {
      const el = qField(win, name);
      el.value = value;
      fire(win, el, "input");
    };

    pick("item_type", "Bike");
    pick("services", "Vinyl wrap");
    type("bike_make", "Honda");
    type("bike_model", "CBR600F4i");
    type("description", "Gloss black, tank and tail at minimum.");
    pick("handoff", "Drop-off");
    type("name", "Sam Rider");
    type("email", "sam@example.com");
    type("phone", "201-555-0134");
  }

  const submitEvent = (win) => {
    const event = new win.Event("submit", { bubbles: true, cancelable: true });
    win.document.getElementById("quote-form").dispatchEvent(event);
    return event;
  };

  const errorFor = (win, name) =>
    win.document.querySelector(`[data-error-for="${name}"]`);

  check("the bike step only appears once a bike is involved", () => {
    const win = load("quote.html");
    const bike = win.document.getElementById("step-bike");
    const helmet = win.document.getElementById("step-helmet");
    assert(bike.hidden && helmet.hidden, "both conditional steps should start hidden");

    qPick(win, "item_type", "Bike");
    assert(!bike.hidden, "the bike step should appear");
    assert(helmet.hidden, "the helmet step should stay hidden for a bike-only request");
  });

  check("picking Both reveals bike and helmet", () => {
    const win = load("quote.html");
    qPick(win, "item_type", "Both");
    assert(!win.document.getElementById("step-bike").hidden, "bike step");
    assert(!win.document.getElementById("step-helmet").hidden, "helmet step");
  });

  check("the visible steps renumber so there is never a gap", () => {
    const win = load("quote.html");
    qPick(win, "item_type", "Helmet");

    const numbers = [...win.document.querySelectorAll(".q-step")]
      .filter((step) => !step.hidden)
      .map((step) => step.querySelector(".q-step-num")?.textContent);
    const expected = numbers.map((_, i) => `Step ${i + 1}`);
    assertEqual(numbers.join(","), expected.join(","), "step numbering");
  });

  check("a deep link from /services preselects the item", () => {
    const win = load("quote.html", { search: "?item=helmet" });
    const helmet = win.document.querySelector('input[name="item_type"][value="Helmet"]');
    assert(helmet.checked, "?item=helmet should tick Helmet");
    assert(!win.document.getElementById("step-helmet").hidden, "and reveal the helmet step");
  });

  check("helmet shipping stays off while the config flag is off", () => {
    const win = load("quote.html");
    assertEqual(
      win.KISALA_CONFIG.quote.helmetShipping.enabled,
      false,
      "the shipping flag should ship disabled"
    );
    qPick(win, "item_type", "Helmet");

    const option = win.document.querySelector("[data-helmet-shipping]");
    assert(option.hidden, "shipping should not be offered until the policy exists");
    assert(option.querySelector("input").disabled, "and its input should be disabled");
  });

  check("an empty form is stopped before it can post", () => {
    const win = load("quote.html");
    const event = submitEvent(win);
    assert(event.defaultPrevented, "submission should be blocked");
    assert(!errorFor(win, "item_type").hidden, "the item error should show");
    assert(!errorFor(win, "description").hidden, "the description error should show");
    assert(!errorFor(win, "email").hidden, "the email error should show");
  });

  check("a bike request must say which bike", () => {
    const win = load("quote.html");
    validBikeRequest(win);
    const make = qField(win, "bike_make");
    make.value = "";
    fire(win, make, "input");

    assert(submitEvent(win).defaultPrevented, "submission should be blocked");
    assert(!errorFor(win, "bike_make").hidden, "the make error should show");
    assert(make.closest(".fld").classList.contains("has-error"), "the field should be marked");
    assertEqual(make.getAttribute("aria-invalid"), "true", "aria-invalid");
  });

  check("pickup requires a ZIP, drop-off does not", () => {
    const win = load("quote.html");
    validBikeRequest(win);
    qPick(win, "handoff", "Pickup & return");

    assert(!win.document.getElementById("handoff-pickup").hidden, "the ZIP field should appear");
    assert(submitEvent(win).defaultPrevented, "submission should be blocked without a ZIP");
    assert(!errorFor(win, "pickup_zip").hidden, "the ZIP error should show");
  });

  check("choosing text or call requires a number", () => {
    const win = load("quote.html");
    validBikeRequest(win);
    const phone = qField(win, "phone");
    phone.value = "";
    fire(win, phone, "input");

    assert(submitEvent(win).defaultPrevented, "submission should be blocked");
    assert(!errorFor(win, "phone").hidden, "the phone error should show");

    // The same form is fine once email is the channel instead.
    qPick(win, "preferred_contact", "Email");
    assert(!submitEvent(win).defaultPrevented, "email-only contact should be allowed through");
  });

  check("fixing a field clears its error without another submit", () => {
    const win = load("quote.html");
    submitEvent(win);
    const description = qField(win, "description");
    assert(!errorFor(win, "description").hidden, "precondition: the error is showing");

    description.value = "Satin black over the fairings.";
    fire(win, description, "change");
    assert(errorFor(win, "description").hidden, "the error should clear on change");
    assert(
      !description.closest(".fld").classList.contains("has-error"),
      "the field marking should clear too"
    );
  });

  check("a complete request is allowed to post natively", () => {
    const win = load("quote.html");
    validBikeRequest(win);
    const event = submitEvent(win);
    assert(!event.defaultPrevented, "a valid form must reach FormSubmit unimpeded");
    assertEqual(
      win.document.getElementById("quote-form").getAttribute("action"),
      "https://formsubmit.co/elombe@swftstudios.com",
      "the native action is the delivery path"
    );
  });

  check("submitting records the lead at /api/quote without blocking", () => {
    const win = load("quote.html");
    const calls = [];
    win.fetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    };

    validBikeRequest(win);
    submitEvent(win);

    assertEqual(calls.length, 1, "one record call");
    assertEqual(calls[0].url, "/api/quote", "endpoint");
    assertEqual(calls[0].init.keepalive, true, "keepalive, or the navigation kills it");
    const body = JSON.parse(calls[0].init.body);
    assertEqual(body.item_type, "Bike", "item type");
    assertEqual(body.bike_make, "Honda", "bike make");
    assertEqual(body.email, "sam@example.com", "email");
  });

  check("a second submit cannot double-send", () => {
    const win = load("quote.html");
    const calls = [];
    win.fetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    };

    validBikeRequest(win);
    submitEvent(win);
    const second = submitEvent(win);

    assert(second.defaultPrevented, "the second submit should be swallowed");
    assertEqual(calls.length, 1, "still one record call");
    assert(win.document.querySelector("[data-submit]").disabled, "the button should be disabled");
  });

  check("the summary tracks what has been filled in", () => {
    const win = load("quote.html");
    assert(!win.document.querySelector("[data-summary-empty]").hidden, "starts empty");

    validBikeRequest(win);
    assertEqual(summary(win, "item"), "Bike", "item row");
    assertEqual(summary(win, "services"), "Vinyl wrap", "services row");
    assertEqual(summary(win, "bike"), "Honda CBR600F4i", "bike row");
    assert(win.document.querySelector("[data-summary-empty]").hidden, "placeholder should go");

    const hidden = win.document.querySelector("[data-summary-field]");
    assert(/item: Bike/.test(hidden.value), "the hidden summary should carry into the email");
  });

  check("the redirect lands on the host the rider is actually on", () => {
    const win = load("quote.html");
    assertEqual(
      qField(win, "_next").value,
      "https://kisalafilms.test/quote-thanks",
      "_next should follow the current origin"
    );
  });

  check("the no-JS path is intact", () => {
    // Everything above tests the enhanced form. This asserts the floor beneath
    // it: the markup alone still posts, with the attachments, to a real inbox.
    const html = readFileSync(join(PUBLIC, "quote.html"), "utf8");
    assert(/method="POST"/.test(html), "no method on the form");
    assert(/enctype="multipart\/form-data"/.test(html), "attachments need multipart");
    assert(/action="https:\/\/formsubmit\.co\//.test(html), "no native action");
    assert(/name="_next"/.test(html), "no redirect target");
    assert(/name="_honey"/.test(html), "no honeypot");

    // The wizard, the progress bar and the film browser are all enhancements,
    // so each has to ship hidden. A progress bar over a form nobody is stepping
    // through would be describing a journey that is not happening, and a
    // "browse films" button with no script behind it is a dead control.
    assert(/class="q-progress" data-progress hidden/.test(html), "progress bar must ship hidden");
    assert(/class="q-nav" data-nav hidden/.test(html), "step nav must ship hidden");
    assert(/class="q-films" data-film-picker hidden/.test(html), "film picker must ship hidden");
  });

  /* ---- The wizard ------------------------------------------------------- */
  const click = (win, el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  const stepsOn = (win) => [...win.document.querySelectorAll(".q-step.is-current")];
  const progressText = (win, key) => text(win, `[data-progress-${key}]`);
  const applicableSteps = (win) =>
    [...win.document.querySelectorAll(".q-step")].filter((step) => !step.hidden);

  /** Click Continue until it disappears, i.e. walk to the last step. */
  function walkToEnd(win) {
    const next = win.document.querySelector("[data-next]");
    for (let guard = 0; guard < 20 && !next.hidden; guard += 1) click(win, next);
    return next.hidden;
  }

  check("the wizard takes over and shows one step at a time", () => {
    const win = load("quote.html");
    const form = win.document.getElementById("quote-form");

    assert(form.classList.contains("q-form--wizard"), "the form should be in wizard mode");
    assert(!win.document.querySelector("[data-progress]").hidden, "progress bar should be shown");
    assert(!win.document.querySelector("[data-nav]").hidden, "step nav should be shown");
    assertEqual(stepsOn(win).length, 1, "exactly one step should be current");
    assertEqual(stepsOn(win)[0].id, "step-item", "and it should be the first one");

    // Hiding a step must never mean disabling a field: the native multipart POST
    // carries the whole form regardless of what is on screen, and a disabled
    // input is one that silently stops being part of the lead.
    const off = [...form.elements].filter(
      (el) => el.disabled && el.name !== "handoff" // the un-offered shipping option
    );
    assertEqual(off.length, 0, `wizard disabled ${off.map((el) => el.name).join(", ")}`);
  });

  check("the progress bar counts the steps that actually apply", () => {
    const win = load("quote.html");
    assertEqual(progressText(win, "current"), "1", "starts on step 1");
    assertEqual(
      progressText(win, "total"),
      String(applicableSteps(win).length),
      "the total should be the applicable step count"
    );
    assertEqual(
      progressText(win, "name"),
      "What are you looking to wrap?",
      "the caption should name the current step"
    );

    // Revealing the bike step has to move the finish line, not just add a card
    // further down a page nobody is scrolling any more.
    const before = Number(progressText(win, "total"));
    qPick(win, "item_type", "Bike");
    assertEqual(progressText(win, "total"), String(before + 1), "the bike step joins the count");
  });

  check("Continue only asks about the step you are on", () => {
    const win = load("quote.html");
    click(win, win.document.querySelector("[data-next]"));

    assertEqual(progressText(win, "current"), "1", "an unanswered step should not advance");
    assert(!errorFor(win, "item_type").hidden, "the question that was asked should error");
    // The rider has not reached the contact step. Telling them their email is
    // missing five steps early is how a form feels broken.
    assert(errorFor(win, "email").hidden, "a later step's error must stay quiet");
    assert(errorFor(win, "description").hidden, "and so must a later step's description");

    qPick(win, "item_type", "Bike");
    click(win, win.document.querySelector("[data-next]"));
    assertEqual(progressText(win, "current"), "2", "answering it should let the rider through");
    assert(errorFor(win, "item_type").hidden, "the cleared error should not linger");
  });

  check("Back returns without re-validating", () => {
    const win = load("quote.html");
    qPick(win, "item_type", "Helmet");
    click(win, win.document.querySelector("[data-next]"));
    assertEqual(progressText(win, "current"), "2", "precondition: moved on");

    click(win, win.document.querySelector("[data-back]"));
    assertEqual(progressText(win, "current"), "1", "Back should go back");
    assert(
      win.document.querySelector("[data-back]").hidden,
      "and Back should hide itself on the first step"
    );
  });

  check("the submit button only exists on the last step", () => {
    const win = load("quote.html");
    const submitBlock = win.document.querySelector(".q-submit");
    assert(submitBlock.hidden, "submitting is not what step 1 is for");

    validBikeRequest(win);
    assert(walkToEnd(win), "Continue should run out on the last step");
    assert(!submitBlock.hidden, "the last step is where the send lives");
    assertEqual(
      progressText(win, "current"),
      progressText(win, "total"),
      "the bar should read full"
    );
  });

  check("a valid request still posts natively after being stepped through", () => {
    const win = load("quote.html");
    validBikeRequest(win);
    walkToEnd(win);
    assert(!submitEvent(win).defaultPrevented, "walking the wizard must not block the send");
  });

  check("submitting jumps back to the step holding the error", () => {
    const win = load("quote.html");
    validBikeRequest(win);
    walkToEnd(win);

    // Break something four steps back, the way a rider who edited and moved on
    // would. The error is useless if it is announced on a step nobody can see.
    const make = qField(win, "bike_make");
    make.value = "";
    fire(win, make, "input");

    assert(submitEvent(win).defaultPrevented, "submission should be blocked");
    assertEqual(stepsOn(win)[0].id, "step-bike", "the wizard should land on the bike step");
    assert(!errorFor(win, "bike_make").hidden, "with the error visible on it");
  });

  check("a step that stops applying does not strand the rider on it", () => {
    const win = load("quote.html");
    qPick(win, "item_type", "Bike");
    walkToEnd(win);
    click(win, win.document.querySelector("[data-back]"));

    // Switching to a helmet retires the bike step underneath them.
    qPick(win, "item_type", "Helmet");
    const current = stepsOn(win);
    assertEqual(current.length, 1, "exactly one step should still be current");
    assert(!current[0].hidden, "and it must be one that still applies");
  });

  check("Enter in a field advances instead of submitting early", () => {
    const win = load("quote.html");
    qPick(win, "item_type", "Bike");
    const submitted = [];
    win.document
      .getElementById("quote-form")
      .addEventListener("submit", (e) => submitted.push(e) || e.preventDefault());

    const enter = new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    qField(win, "name").dispatchEvent(enter);

    assertEqual(submitted.length, 0, "Enter on step 1 must not try to send the form");
    assertEqual(progressText(win, "current"), "2", "it should move to the next step");
  });

  /* ---- The film picker --------------------------------------------------- */
  await (async () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

    const win = load("quote.html");
    const d = win.document;
    const form = d.getElementById("quote-form");
    const panel = d.querySelector("[data-film-panel]");
    const cards = () => [...d.querySelectorAll(".q-film-btn")];
    const status = () => text(win, "[data-film-status]");
    const chips = (group) => [...d.querySelectorAll(`[data-film-${group}] .q-film-chip`)];

    const setFinish = (value) => {
      const select = form.elements.finish;
      select.value = value;
      fire(win, select, "change");
    };
    const tickFilm = (value) => qPick(win, "film_types", value);

    check("the film picker is a real control once JavaScript is here", () => {
      assert(!d.querySelector("[data-film-picker]").hidden, "the picker should be unhidden");
      assert(panel.hidden, "but the panel stays shut until it is asked for");
    });

    check("the catalogue is not fetched until the panel is opened", () => {
      // Half a megabyte, on the page every route on the site funnels into. It
      // has to stay off the critical path of a form nobody may even scroll to.
      assertEqual(cards().length, 0, "nothing should render before opening");
      assertEqual(
        d.querySelector("[data-film-search]").value,
        "",
        "and no filter state should exist yet"
      );
    });

    setFinish("Matte");
    tickFilm("Vinyl wrap film");
    tickFilm("Clear PPF");
    click(win, d.querySelector("[data-film-open]"));
    await settle();

    check("opening the panel loads the catalogue and caps the grid", () => {
      assert(!panel.hidden, "the panel should be open");
      assertEqual(cards().length, 24, "one page of cards, not a thousand");
      assert(/Showing 24 of \d+ films/.test(status()), `status read "${status()}"`);
    });

    check("the chosen finish narrows the grid and says so removably", () => {
      const finishChip = chips("materials").find((chip) => /Matte only/.test(chip.textContent));
      assert(finishChip, "the finish should appear as a chip");
      assertEqual(finishChip.getAttribute("aria-pressed"), "true", "and start applied");

      const narrowed = Number(status().match(/of (\d+) films/)[1]);
      click(win, finishChip);
      const widened = Number(status().match(/of (\d+) films/)[1]);
      assert(
        widened > narrowed,
        `switching the finish off should widen the grid, ${narrowed} -> ${widened}`
      );
      click(win, finishChip);
    });

    check("the film_types answer seeds the material filter", () => {
      const on = chips("materials")
        .filter((chip) => chip.classList.contains("is-on"))
        .map((chip) => chip.textContent.replace(/[✕×]/g, "").trim());
      assert(on.includes("Vinyl wrap"), `vinyl should be pre-applied, saw ${on.join(", ")}`);
      assert(on.includes("Clear PPF"), `clear PPF should be pre-applied, saw ${on.join(", ")}`);
      assert(!on.includes("Coloured PPF"), "and nothing the rider did not ask for");
    });

    check("every finish the form offers matches films the garage can buy", () => {
      /* FINISH_MATCH in quote-films.js is hand-written against the supplier's
         own vocabulary — "Super Gloss" is gloss to a rider, colour shift is a
         family rather than a finish. A resync that renames a finish would
         silently open an empty grid on a real answer, so each option is checked
         against the catalogue that just loaded rather than against a literal. */
      const select = form.elements.finish;
      const offered = [...select.options].map((option) => option.value).filter(Boolean);
      assert(offered.length >= 7, `expected the full finish list, saw ${offered.length}`);

      const empty = [];
      offered.forEach((value) => {
        setFinish(value);
        if (!cards().length) empty.push(value);
      });
      assertEqual(empty.length, 0, `no films for: ${empty.join(", ")}`);
      setFinish("Matte");
    });

    check("search narrows within the chosen finish", () => {
      const before = Number(status().match(/of (\d+) films/)[1]);
      const search = d.querySelector("[data-film-search]");
      search.value = "3m";
      fire(win, search, "input");

      const after = Number(status().match(/(\d+) films?/)[1]);
      assert(after < before, `search should narrow, ${before} -> ${after}`);
      search.value = "";
      fire(win, search, "input");
    });

    check("picking films writes them into the form and the summary", () => {
      click(win, cards()[0]);
      click(win, cards()[1]);

      const lines = form.elements.film_choices.value.split("\n").filter(Boolean);
      assertEqual(lines.length, 2, "two films should be recorded");
      // Each line has to stand on its own in an email and in a database column:
      // the name to recognise, the vendor and finish to price, the URL to order.
      lines.forEach((line) => {
        assert(/ — /.test(line), `line is not readable: ${line}`);
        assert(/https:\/\//.test(line), `line carries no supplier URL: ${line}`);
      });

      assertEqual(
        summary(win, "film"),
        "Vinyl wrap film, Clear PPF · 2 films picked",
        "the summary should carry both answers"
      );
      assertEqual(d.querySelectorAll(".q-film-pick").length, 2, "and show them as chips");
    });

    check("a picked film can be taken back off", () => {
      click(win, d.querySelector(".q-film-pick-remove"));
      assertEqual(
        form.elements.film_choices.value.split("\n").filter(Boolean).length,
        1,
        "one film should remain"
      );
      assertEqual(summary(win, "film"), "Vinyl wrap film, Clear PPF · 1 film picked", "singular");
    });

    check("the shortlist has a ceiling", () => {
      const search = d.querySelector("[data-film-search]");
      search.value = "";
      fire(win, search, "input");
      cards().slice(0, 12).forEach((card) => click(win, card));

      const kept = form.elements.film_choices.value.split("\n").filter(Boolean);
      assert(kept.length <= 6, `a shortlist of ${kept.length} is not a shortlist`);
      assert(/limit/.test(status()), `the rider should be told why, saw "${status()}"`);
    });

    check("the film answers reach the lead record", () => {
      const calls = [];
      win.fetch = (url, init) => {
        calls.push({ url, init });
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      };

      validBikeRequest(win);
      submitEvent(win);

      const body = JSON.parse(calls[0].init.body);
      assert(
        body.film_types.includes("Vinyl wrap film"),
        `film types missing, saw ${JSON.stringify(body.film_types)}`
      );
      assertEqual(body.film_choices.length, 6, "the picked films should be recorded");
      assert(/film:/.test(body.summary), "and named in the summary line the inbox reads");
    });
  })();

  check("the thanks page fires the quote conversion", () => {
    const win = load("quote-thanks.html");
    const names = win.__events.map((e) => e.name);
    assert(names.includes("quote_lead"), `expected quote_lead, saw ${names.join(", ") || "none"}`);
  });
}

/* ---- Technical SEO ------------------------------------------------------ */
{
  const { readdirSync, statSync } = await import("node:fs");

  // Mirrors NOINDEX in scripts/build-seo.py — the generator writes the tags,
  // this asserts it did. Add a post-conversion page to both or neither.
  const NOINDEX = new Set([
    "thanks.html",
    "deposit-thanks.html",
    "project-thanks.html",
    "quote-thanks.html",
    "styleguide.html",
    "404.html",
    "wrap-quote/index.html",
  ]);

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

  // Cloudflare Static Assets serves these extensionless and 307-redirects the
  // .html form, so a canonical naming the .html is a canonical pointing at a
  // redirect. Mirrors canonical_path() in scripts/build-seo.py.
  const canonicalPath = (rel) =>
    rel === "index.html"
      ? "/"
      : rel.endsWith("/index.html")
        ? `/${rel.slice(0, -"index.html".length)}`
        : `/${rel.replace(/\.html$/, "")}`;

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

  check("every image the pages ask for exists on disk", () => {
    // A <source> that 404s does not fall back to the <img> beside it — the
    // browser has already committed to that candidate, so the page renders the
    // alt text and nothing logs. A missing webp variant is therefore invisible
    // to every other check here.
    const missing = [];
    for (const [rel, html] of pages) {
      const refs = new Set();
      for (const [, list] of html.matchAll(/\bsrcset="([^"]+)"/g)) {
        list.split(",").forEach((c) => refs.add(c.trim().split(/\s+/)[0]));
      }
      for (const [, url] of html.matchAll(/<(?:img|source|video)[^>]*\bsrc="([^"]+)"/g)) {
        refs.add(url);
      }
      for (const url of refs) {
        if (!url.startsWith("/") || url.startsWith("//")) continue;
        if (!existsSync(join(PUBLIC, url.slice(1)))) missing.push(`${rel} → ${url}`);
      }
    }
    assertEqual(missing.length, 0, `missing files: ${missing.join(", ")}`);
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

  check("no canonical or structured URL points at a redirect", () => {
    // The .html form 307s. Anything naming it sends crawlers through a hop.
    for (const [rel, html] of pages) {
      const head = html.slice(0, html.indexOf("</head>"));
      const offenders = [...head.matchAll(/(?:href|content)="(https:\/\/kisalafilms[^"]*\.html)"/g)];
      assertEqual(offenders.length, 0, `${rel} names ${offenders.map((m) => m[1]).join(", ")}`);

      for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        const urls = [...body.matchAll(/"(https:\/\/kisalafilms[^"]*\.html)"/g)];
        assertEqual(urls.length, 0, `${rel} JSON-LD names ${urls.map((m) => m[1]).join(", ")}`);
      }
    }
  });

  check("the generators left no dead space in any <head>", () => {
    // Every generator strips its own previous output before rewriting. Strip a
    // tag but leave its newline and each build pads the <head> by a line — it
    // never breaks a page, so nothing catches it except this.
    for (const [rel, html] of pages) {
      if (rel === "wrap-quote/index.html") continue; // inline <style>, own chrome
      const head = html.slice(0, html.indexOf("</head>"));
      const run = /\n[ \t]*\n[ \t]*\n/.exec(head);
      assert(!run, `${rel} has a run of blank lines in <head> — a strip left its newlines behind`);
    }
  });

  check("internal links point at the served URL, not the redirect", () => {
    // Every .html URL 307s to its extensionless form, so an internal link
    // naming it spends a round trip per click. scripts/build-links.py rewrites
    // them; this is the guard against a hand-edit reintroducing one.
    for (const [rel, html] of pages) {
      const offenders = [...html.matchAll(/href="((?!https?:|mailto:|tel:|#)[^"]*\.html(?:[?#][^"]*)?)"/g)];
      assertEqual(offenders.length, 0, `${rel} links to ${offenders.map((m) => m[1]).join(", ")}`);

      const next = [...html.matchAll(/name="_next" value="([^"]*)"/g)];
      for (const [, target] of next) {
        assert(!/\.html(?:[?#]|$)/.test(target), `${rel} sends _next to ${target}, a redirect`);
      }
    }
  });

  check("every internal link resolves to a file that exists", () => {
    for (const [rel, html] of pages) {
      for (const [, href] of html.matchAll(/href="((?!https?:|mailto:|tel:|#|javascript:)[^"]+)"/g)) {
        const path = href.split(/[?#]/)[0];
        if (!path) continue;
        // Static Assets answers /pricing with pricing.html and /wrap-quote/
        // with wrap-quote/index.html.
        const base = path.startsWith("/")
          ? join(PUBLIC, path)
          : join(PUBLIC, rel, "..", path);
        const found = [base, `${base}.html`, join(base, "index.html")].some(existsSync);
        assert(found, `${rel} links to ${href}, which nothing serves`);
      }
    }
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

/* ---- Honest messaging --------------------------------------------------- */
{
  const textOf = (page) => {
    const win = load(page);
    return win.document.body.textContent.replace(/\s+/g, " ");
  };

  check("the honest admissions survive the founding reframe", () => {
    // These are the lines the reframe must not quietly delete.
    assert(
      /don.t have client testimonials yet/i.test(textOf("testimonials.html")),
      "testimonials no longer admits there are none yet"
    );
    assert(
      /No fake reviews here/i.test(textOf("testimonials.html")),
      "the no-fake-reviews line is gone"
    );
    assert(
      /don.t have a catalog of client wraps or YouTube episodes yet/i.test(textOf("about.html")),
      "about no longer admits the catalogue is empty"
    );
    assert(
      /No shortcuts sold as finished mastery/i.test(textOf("about.html")),
      "the no-false-mastery line is gone"
    );
  });

  check("those pages now lead with the founding opportunity", () => {
    ["about.html", "testimonials.html"].forEach((page) => {
      assert(/founding/i.test(textOf(page)), `${page} does not mention founding builds`);
    });
    const win = load("testimonials.html");
    assert(
      /first riders here|founding/i.test(win.document.querySelector("h1").textContent),
      "the testimonials headline still leads with the absence"
    );
  });

  check("no page invents a review, rating or credential", () => {
    const banned = [
      /\b\d(\.\d)?\s*(out of|\/)\s*5\b/i,
      /\bstar rating\b/i,
      /\b\d+\s*(five[- ]star|5[- ]star)\b/i,
      /\bcertified installer\b/i,
      /\baward[- ]winning\b/i,
      /\b(1|2|3|4|5|6|7|8|9)\d*\+?\s*(happy|satisfied)\s+(clients|customers|riders)\b/i,
      /\byears of experience\b/i,
    ];
    for (const page of ["index.html", "about.html", "testimonials.html", "pricing.html", "faq.html", "gallery.html", "services.html", "locations.html", "locations/brooklyn.html", "locations/jersey-city.html", "locations/new-york-city.html"]) {
      const text = textOf(page);
      banned.forEach((pattern) =>
        assert(!pattern.test(text), `${page} matches a fabricated-credibility pattern: ${pattern}`)
      );
    }
  });

  check("no page claims a service location beyond the authorised three", () => {
    // The garage is Jersey City; Brooklyn and NYC are pickup zones. Anything
    // else would be a service-area claim nobody signed off.
    const suspicious = /\b(Philadelphia|Boston|Miami|Los Angeles|Chicago|Newark garage|Brooklyn (shop|garage|studio)|Manhattan (shop|garage|studio))\b/i;
    for (const page of ["index.html", "pricing.html", "locations.html", "services.html", "locations/brooklyn.html", "locations/jersey-city.html", "locations/new-york-city.html"]) {
      const text = textOf(page);
      const match = text.match(suspicious);
      // "no Brooklyn shop" is a denial, not a claim, so allow a negation nearby.
      if (match) {
        const window_ = text.slice(Math.max(0, match.index - 40), match.index + 40);
        assert(/\bno\b|isn.t|not\b/i.test(window_), `${page} appears to claim: "${window_.trim()}"`);
      }
    }
  });

  check("every headline price is backed by the config", () => {
    // The ads landing page is the one that matters here: paid traffic lands on
    // it, and it forked its own chrome, so it is the easiest page to leave
    // advertising a founding rate the rest of the site has stopped honouring.
    // Checked statically — this page's inline wizard does not need to be run.
    for (const rel of ["wrap-quote/index.html", "pricing.html", "index.html"]) {
      const html = readFileSync(join(PUBLIC, rel), "utf8");
      assert(/\/js\/config-apply\.js/.test(html), `${rel} never hydrates the config`);

      // Any element whose own text is just a price: the tier and card amounts.
      for (const [, attrs, body] of html.matchAll(
        /<(?:div|span|strong|p)([^>]*)>(\s*\$[\d,]+\+?\s*)<\/(?:div|span|strong|p)>/g
      )) {
        assert(
          /data-cfg=/.test(attrs),
          `${rel} hardcodes ${body.trim()} with no data-cfg behind it`
        );
      }
    }
  });

  check("the founding slot count is one number from the config", () => {
    const raw = readFileSync(join(PUBLIC, "js/kisala-config.js"), "utf8");
    const remaining = Number(raw.match(/slotsRemaining:\s*(\d+)/)[1]);
    const total = Number(raw.match(/slotsTotal:\s*(\d+)/)[1]);
    assert(remaining <= total, "slotsRemaining should not exceed slotsTotal");

    for (const page of ["about.html", "testimonials.html", "pricing.html", "faq.html", "wrap-studio.html"]) {
      const win = load(page);
      win.document.querySelectorAll('[data-cfg="founding.slotsRemaining"]').forEach((el) =>
        assertEqual(el.textContent, String(remaining), `${page} slot count`)
      );
    }
  });
}

/* ---- Vinyl project checkout (set labour + cost×1.4) -------------------- */
{
  const win = load("project.html");

  check("project page wires mission onboarding", () => {
    assert(win.document.querySelector("[data-project-root]"), "project root missing");
    assert(win.document.querySelector("[data-mission='0']"), "colours stage missing");
    assert(win.document.querySelector("[data-surface='helmet']"), "helmet surface missing");
    assert(win.document.querySelector("[data-surface='both']"), "combo surface missing");
    assert(win.document.querySelector("[data-project-pay]"), "payment CTA missing");
    assert(win.document.querySelector("[data-build-films]"), "build films list missing");
    const html = readFileSync(join(PUBLIC, "project.html"), "utf8");
    assert(/\/js\/project-onboarding\.js/.test(html), "project-onboarding.js missing");
    assert(/\/js\/vinyl-build\.js/.test(html), "vinyl-build.js missing");
    assert(/\/js\/bike-search\.js/.test(html), "bike-search.js missing");
  });

  check("projectCheckout config + preview prices a mid bike full wrap", () => {
    assert(win.KISALA_CONFIG.projectCheckout, "projectCheckout missing");
    assertEqual(win.KISALA_CONFIG.projectCheckout.vinylMarkup, 1.4, "vinyl markup");
    assertEqual(win.KISALA_CONFIG.projectCheckout.comboDiscount, 0.2, "combo discount");
    const q = win.KisalaConfig.projectQuotePreview({
      surface: "motorcycle",
      coverage: "full",
      bikeDifficulty: 3,
      bodyClass: "half_faired",
      rollCostUsd: 450,
    });
    assert(q, "preview quote missing");
    assertEqual(q.labourUsd, 1450, "diff-3 full labour");
    assertEqual(q.rolls, 1, "18ft → 1 roll");
    assertEqual(q.vinylSellUsd, 630, "450 × 1.4");
    assertEqual(q.totalUsd, 2080, "labour + vinyl");
  });

  check("projectCheckout preview prices a helmet wrap by film difficulty", () => {
    const q = win.KisalaConfig.projectQuotePreview({
      surface: "helmet",
      filmDifficulty: 4,
      rollCostUsd: 400,
    });
    assert(q, "helmet quote missing");
    assertEqual(q.labourUsd, 325, "helmet film-diff 4 labour");
    assertEqual(q.rolls, 1, "3ft → 1 roll");
    assertEqual(q.vinylSellUsd, 560, "400 × 1.4");
    assertEqual(q.totalUsd, 885, "helmet total");
  });

  check("projectCheckout combo applies 20% off bike + helmet", () => {
    const q = win.KisalaConfig.projectQuotePreview({
      surface: "both",
      coverage: "full",
      bikeDifficulty: 3,
      bodyClass: "half_faired",
      filmDifficulty: 2,
      rollCostUsd: 400,
    });
    assert(q, "combo quote missing");
    assertEqual(q.motorcycleLabourUsd, 1450, "combo bike labour");
    assertEqual(q.helmetLabourUsd, 200, "combo helmet labour");
    assertEqual(q.rolls, 2, "bike + helmet rolls");
    assertEqual(q.vinylSellUsd, 1120, "2× 400 × 1.4");
    assertEqual(q.subtotalUsd, 2770, "combo subtotal");
    assertEqual(q.discountUsd, 554, "20% combo savings");
    assertEqual(q.totalUsd, 2216, "combo total");
  });

  check("project-thanks is noindex", () => {
    const html = readFileSync(join(PUBLIC, "project-thanks.html"), "utf8");
    assert(/noindex/.test(html), "project-thanks should be noindex");
  });
}

/* ---- Report ------------------------------------------------------------ */
console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.error(`  FAIL  ${f}`));
  process.exit(1);
}
