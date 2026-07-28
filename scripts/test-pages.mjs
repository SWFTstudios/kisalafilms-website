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

/* ---- Report ------------------------------------------------------------ */
console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.error(`  FAIL  ${f}`));
  process.exit(1);
}
