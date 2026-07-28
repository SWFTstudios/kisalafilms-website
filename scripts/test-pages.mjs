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
import { JSDOM } from "jsdom";

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
  const dom = new JSDOM(html, {
    url: `https://kisalafilms.test/${page}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
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

  const sources = [...window.document.querySelectorAll("script[src]")].map((s) =>
    s.getAttribute("src")
  );

  for (const src of sources) {
    const file = join(PUBLIC, src);
    if (!existsSync(file)) throw new Error(`${page} references a missing script: ${src}`);
    window.eval(readFileSync(file, "utf8"));

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

/* ---- Report ------------------------------------------------------------ */
console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.error(`  FAIL  ${f}`));
  process.exit(1);
}
