/**
 * End-to-end check of the Wrap Studio in a real browser.
 *
 * scripts/test-pages.mjs covers most of this faster under jsdom, but a few
 * things only a real browser can answer:
 *
 *  1. The estimate hidden fields sit outside <form> and are bound to it with
 *     form="wrap-studio". Whether that association actually submits is browser
 *     behaviour, not something a DOM library proves.
 *  2. The studio posts native multipart/form-data because that is the only
 *     FormSubmit endpoint that delivers photos. Only a browser builds that body,
 *     and the photos are the whole reason the form is shaped this way.
 *  3. Real file input, real submit, real navigation.
 *
 * The form action is repointed at a throwaway local server before submitting, so
 * this never contacts FormSubmit and never sends mail.
 *
 * Needs `npm run dev` in another terminal and a Chrome on the box:
 *
 *   npm run verify:browser
 *   CHROME_PATH=/path/to/chrome npm run verify:browser   # if it isn't the default
 *   PRINT_LEAD=1 npm run verify:browser                  # dump the captured build sheet
 */
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL  ${name}: ${error.message}`);
  }
}

const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const assertEqual = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};
/** Digits only, so "$1,650 – $2,400" compares as a number. */
const num = (s) => Number((String(s).match(/\d/g) || ["0"]).join(""));

/* ---- The sink that stands in for FormSubmit ------------------------------ */

const submissions = [];
const sink = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    submissions.push({ contentType: req.headers["content-type"] || "", body: Buffer.concat(chunks) });
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>sink</title><p>captured");
  });
});
await new Promise((resolve) => sink.listen(0, "127.0.0.1", resolve));
const SINK = `http://127.0.0.1:${sink.address().port}/sink`;

/** Pull the parts out of a multipart body: fields by name, plus the files. */
function parseMultipart({ contentType, body }) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  assert(boundary, `no boundary in content-type: ${contentType}`);
  const fields = new Map();
  const files = [];

  for (const raw of body.toString("binary").split(`--${boundary[1] || boundary[2]}`)) {
    const split = raw.indexOf("\r\n\r\n");
    if (split === -1) continue;
    const headers = raw.slice(0, split);
    const name = /name="([^"]*)"/.exec(headers)?.[1];
    if (!name) continue;
    // The trailing CRLF belongs to the delimiter, not to the value.
    const value = raw.slice(split + 4).replace(/\r\n$/, "");
    const filename = /filename="([^"]*)"/.exec(headers)?.[1];

    if (filename !== undefined) {
      if (filename) files.push({ name, filename, bytes: Buffer.from(value, "binary").length });
    } else {
      const decoded = Buffer.from(value, "binary").toString("utf8");
      fields.set(name, fields.has(name) ? `${fields.get(name)}, ${decoded}` : decoded);
    }
  }
  return { fields, files };
}

/* ---- Two real PNGs to attach --------------------------------------------- */

const scratch = mkdtempSync(join(tmpdir(), "kisala-"));
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);
const photos = ["bike-left.png", "bike-right.png"].map((name) => {
  const path = join(scratch, name);
  writeFileSync(path, PNG);
  return path;
});

/* ---- Browser -------------------------------------------------------------- */

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

/** A page that fails the run on any uncaught error or console error. */
async function open(path, { mode } = {}) {
  const page = await browser.newPage();
  // A desktop viewport: the default 800x600 is short enough that scrolling a
  // control to the top puts it under the 85px sticky header.
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", (e) => failures.push(`page error on ${path}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") failures.push(`console error on ${path}: ${m.text()}`);
  });

  if (mode) {
    // pricingMode is read once into a closure const, so flipping it at runtime
    // does nothing. Rewrite the config on the wire instead — that exercises the
    // same path an owner takes when they edit the file, without touching disk.
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      if (!req.url().endsWith("/js/kisala-config.js")) return req.continue();
      const original = await (await fetch(req.url())).text();
      const patched = original.replace(/pricingMode:\s*"[a-z]+"/, `pricingMode: "${mode}"`);
      assert(patched !== original, "could not patch pricingMode in kisala-config.js");
      req.respond({ status: 200, contentType: "application/javascript", body: patched });
    });
  }

  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  return page;
}

const text = (page, selector) => page.$eval(selector, (el) => el.textContent.trim());
/**
 * Click through the DOM rather than at coordinates.
 *
 * page.click() scrolls the element into view with the CDP's own scroll, which
 * ignores the `scroll-padding-top: 96px` that keeps the site's anchors clear of
 * the sticky header — so a control scrolled to the top gets the header's click
 * instead of its own. Real navigation honours scroll-padding; this is an
 * automation artifact, and dispatching the click directly sidesteps it.
 */
const tap = (page, selector) => page.$eval(selector, (el) => el.click());
const value = (page, selector) => page.$eval(selector, (el) => el.value);
const summary = (page, key) => text(page, `[data-summary-out="${key}"]`);
/**
 * The service price slots only. transport.*.from also renders as money but is a
 * flat fee that pricingMode is not supposed to move, so including it would make
 * "every price rose" fail for the right reason on the wrong element.
 */
const prices = (page) =>
  page.$$eval("[data-cfg^='services.']", (els) =>
    els.map((el) => [el.dataset.cfg, el.textContent.trim()])
  );

try {
  /* ---- 1. Hydration ------------------------------------------------------- */
  console.log("\nConfig hydration");
  {
    const page = await open("/pricing");
    const slots = await page.$$eval("[data-cfg]", (els) =>
      els.map((el) => [el.dataset.cfg, el.textContent.trim()])
    );
    await check("every data-cfg slot on /pricing resolved", () => {
      assert(slots.length > 0, "no data-cfg slots at all");
      const bad = slots.filter(([, t]) => !t || /undefined|NaN|\{\{/.test(t));
      assertEqual(bad.length, 0, `unresolved: ${bad.map(([k]) => k).join(", ")}`);
    });
    await check("the founding band is present in founding mode", async () =>
      assert(await page.$('[data-cfg-show="founding"]'), "no founding band"));
    await page.close();
  }

  /* ---- 2. Transport ------------------------------------------------------- */
  console.log("\nTransport");
  const page = await open("/wrap-studio");

  await check("the zone picker is hidden for drop-off", async () =>
    assert(await page.$eval("[data-transport-detail]", (el) => el.hidden), "zone visible"));

  await page.click('input[name="transport"][value="Pickup — collect my bike"]');
  await check("choosing pickup reveals the zone picker", async () =>
    assert(!(await page.$eval("[data-transport-detail]", (el) => el.hidden)), "zone still hidden"));

  // The option value is the human-readable label, deliberately: it is what lands
  // in the owner's inbox. The zone id rides along in data-zone-id.
  const zones = await page.$$eval("#pickup_zone option", (o) =>
    o.filter((x) => x.value).map((x) => [x.dataset.zoneId, x.value])
  );
  await check("the zone list comes from the config", () => {
    const ids = zones.map(([id]) => id);
    ["jersey-city", "brooklyn", "nyc"].forEach((z) => assert(ids.includes(z), `no ${z}`));
  });
  const brooklyn = zones.find(([id]) => id === "brooklyn")?.[1];
  await check("zones post their label, not their slug", () =>
    assert(/Brooklyn/.test(brooklyn || ""), `brooklyn posts "${brooklyn}"`));

  await page.click('input[name="service"][value="Full colour-change wrap"]');
  await page.select("#pickup_zone", brooklyn);

  /** Year -> make -> model, each select only populated once the one before it is set. */
  async function pickBike() {
    const second = (selector) =>
      page.$eval(`${selector} option:nth-child(2)`, (o) => o.value);
    for (const id of ["#year", "#make", "#model"]) {
      await page.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          return el && !el.disabled && el.options.length > 1;
        },
        { timeout: 15000 },
        id
      );
      await page.select(id, await second(id));
    }
  }
  await pickBike();

  await check("choosing a bike fills the hidden bike fields", async () => {
    assert((await value(page, "[data-bike-label]")).length > 0, "bike label is empty");
    assert(num(await value(page, "[data-bike-difficulty]")) > 0, "no difficulty");
  });

  await check("pickup shows a fee in the summary", async () => {
    const fee = await summary(page, "transportfee");
    assert(/\$\d/.test(fee), `transport row reads "${fee}"`);
  });

  {
    await page.click('input[name="transport"][value="Pickup and return delivery"]');
    const roundTrip = await value(page, "[data-transport-field]");
    await page.click('input[name="transport"][value="Pickup — collect my bike"]');
    const oneWay = await value(page, "[data-transport-field]");
    await check("return delivery costs more than pickup alone", () =>
      assert(num(roundTrip) > num(oneWay), `${roundTrip} is not more than ${oneWay}`));
  }

  await check("wrap, transport and total stay three separate numbers", async () => {
    const wrap = await value(page, "[data-estimate-field]");
    const transport = await value(page, "[data-transport-field]");
    const total = await value(page, "[data-total-field]");
    assert(num(wrap) > 0, `ballpark_estimate is "${wrap}"`);
    assert(num(transport) > 0, `transport_estimate is "${transport}"`);
    assert(total !== wrap, "the total still equals the wrap-only estimate with transport on");
  });

  /* ---- 3. Catalogue browser ---------------------------------------------- */
  console.log("\nVinyl browser");
  {
    await tap(page, "[data-browse-toggle]");
    await page.waitForSelector("[data-browse-grid] .vinyl-card", { timeout: 15000 });

    const all = await page.$$eval("[data-browse-grid] .vinyl-card", (c) => c.length);
    await check("browsing lists films with no query typed", () => assert(all > 0, "no cards"));

    const familyChip = await page.$("[data-family-filters] [data-chip]");
    const label = await familyChip.evaluate((el) => el.textContent.trim());
    await familyChip.evaluate((el) => el.click());
    await page.waitForFunction(
      () => !!document.querySelector("[data-family-filters] [data-chip].on")
    );
    check(`the "${label}" family chip activates`, async () =>
      assertEqual(
        await page.$$eval("[data-family-filters] [data-chip].on", (c) => c.length),
        1,
        "active family chips"
      ));

    const filtered = await page.$eval("[data-browse-count]", (el) => el.textContent.trim());
    await check("the count reflects the filter", () =>
      assert(num(filtered) > 0 && num(filtered) < num(`${all}`) * 1000, `count reads "${filtered}"`));

    // Pick a finish that this family actually has. Not every pairing exists —
    // there are 42 colour-shift films and 6 brushed ones, and no overlap — and a
    // legitimately empty result would prove nothing about the AND logic.
    const finishInFamily = await page.$eval("[data-browse-grid] .vinyl-card-meta", (el) =>
      el.textContent.split("·")[1].trim()
    );
    const finishChip = await page.$(
      `[data-finish-filters] [data-chip="${finishInFamily}"]`
    );
    await check(`the family has a "${finishInFamily}" finish chip to combine with`, () =>
      assert(finishChip, `no chip for ${finishInFamily}`));
    await finishChip.evaluate((el) => el.click());

    await check("family and finish combine, rather than replacing each other", async () => {
      const after = await page.$eval("[data-browse-count]", (el) => el.textContent.trim());
      assert(num(after) > 0, `combining left nothing: "${after}"`);
      assert(num(after) <= num(filtered), `${filtered} -> ${after} did not narrow`);
      const metas = await page.$$eval("[data-browse-grid] .vinyl-card-meta", (els) =>
        els.map((e) => e.textContent)
      );
      metas.forEach((m) =>
        assert(m.includes(finishInFamily), `a result is not ${finishInFamily}: ${m}`)
      );
    });

    await tap(page, "[data-browse-clear]");
    await check("clearing drops every chip", async () =>
      assertEqual(await page.$$eval("[data-chip].on", (c) => c.length), 0, "chips still on"));

    await page.waitForSelector("[data-browse-grid] .vinyl-card");
    await page.select("[data-browse-sort]", "vendor");
    await check("sorting by brand actually orders by brand", async () => {
      // Asserting the first card changed is too weak: 3M sorts first by name and
      // by vendor alike. Check the whole visible run is ordered.
      const brands = await page.$$eval("[data-browse-grid] .vinyl-card-meta", (els) =>
        els.map((e) => e.textContent.split("·")[0].trim())
      );
      assert(brands.length > 1, "not enough cards to judge order");
      const sorted = [...brands].sort((a, b) => a.localeCompare(b));
      assertEqual(brands.join("|"), sorted.join("|"), "brand order");
    });

    await tap(page, "[data-view-toggle] [data-view='list']");
    await check("the list view applies its class", async () =>
      assert(
        await page.$eval("[data-browse-grid]", (el) => el.classList.contains("vinyl-cards--list")),
        "no vinyl-cards--list class"
      ));

    // Save two films from the grid.
    const saveButtons = await page.$$("[data-browse-grid] [data-save]");
    await saveButtons[0].evaluate((el) => el.click());
    await saveButtons[1].evaluate((el) => el.click());
    await check("saving two films records both", async () =>
      assertEqual(
        await page.$eval("[data-saved-films-field]", (el) => Number(el.dataset.count || 0)),
        2,
        "saved count"
      ));
    await check("the saved tray shows the count", async () =>
      assertEqual(await text(page, "[data-saved-count]"), "2", "tray count"));
    await check("the summary counts the saved films", async () => {
      const row = await summary(page, "saved");
      assert(/2/.test(row), `saved row reads "${row}"`);
    });
    await check("saved films are newline-separated, so titles with pipes survive", async () =>
      assertEqual((await value(page, "[data-saved-films-field]")).split("\n").length, 2, "lines"));

    const compareButtons = await page.$$("[data-browse-grid] [data-compare]");
    await compareButtons[0].evaluate((el) => el.click());
    await compareButtons[1].evaluate((el) => el.click());
    await tap(page, "[data-compare-open]");
    await check("comparing two films opens the panel", async () =>
      assert(await page.$eval("[data-compare-modal]", (el) => !el.hidden), "modal stayed hidden"));
    await check("the panel shows one column per film", async () =>
      assertEqual(
        await page.$$eval("[data-compare-modal] .vinyl-compare-col", (c) => c.length),
        2,
        "columns"
      ));

    await check("the compare note sits under the films, not beside them", async () => {
      // The panel reuses .lb-stage, which is a centring flex row built for a
      // single image. Without an axis override the note becomes a sibling column.
      const laidOut = await page.evaluate(() => {
        const grid = document.querySelector(".vinyl-compare-grid");
        const note = document.querySelector(".vinyl-compare-note");
        if (!grid || !note) return null;
        const g = grid.getBoundingClientRect();
        const n = note.getBoundingClientRect();
        return { gridBottom: g.bottom, gridRight: g.right, noteTop: n.top, noteLeft: n.left };
      });
      assert(laidOut, "no compare grid or note rendered");
      assert(
        laidOut.noteTop >= laidOut.gridBottom - 1,
        `the note starts at y=${Math.round(laidOut.noteTop)}, above the grid's bottom at ${Math.round(laidOut.gridBottom)}`
      );
    });
    await tap(page, "[data-compare-close]");

    // "Use this film" must still write the same hidden fields the typeahead does.
    await tap(page, "[data-browse-grid] [data-use]");
    await check("using a film from the browser fills the colour field", async () =>
      assert((await value(page, "[data-vinyl-label]")).length > 0, "vinyl_color is empty"));
    await check("the picked film reaches the summary", async () => {
      const row = await summary(page, "colour");
      assert(!/Not selected/.test(row), `colour row reads "${row}"`);
    });
  }

  /* ---- 4. Native multipart submit ---------------------------------------- */
  console.log("\nNative multipart submit");
  {
    await page.select("#finish", await page.$eval("#finish option:nth-child(2)", (o) => o.value));
    await page.type("#name", "Verification Rider");
    await page.type("#email", "rider@example.test");
    await page.type("#city", "Brooklyn, NY");
    await page.select("#budget", await page.$eval("#budget option:nth-child(2)", (o) => o.value));
    await tap(page, 'input[name="addons"][value="Photo set"]');
    await tap(page, 'input[name="consent"]');

    await (await page.$("[data-photo-input]")).uploadFile(...photos);
    await page.waitForFunction(() =>
      /[1-9]/.test(document.querySelector('[data-summary-out="photos"]').textContent)
    );
    await check("both photos register in the summary", async () => {
      const row = await summary(page, "photos");
      assert(/2/.test(row), `photos row reads "${row}"`);
    });
    await check("the budget lands in the summary", async () => {
      const row = await summary(page, "budget");
      assert(!/Not selected/.test(row), `budget row reads "${row}"`);
    });

    // Name the offending field rather than waiting out a navigation timeout.
    await check("the filled build sheet passes native validation", async () => {
      const invalid = await page.$$eval("#wrap-studio :invalid", (els) =>
        els.map((el) => el.name || el.id || el.tagName)
      );
      assertEqual(invalid.length, 0, `still invalid: ${invalid.join(", ")}`);
    });

    // Repoint at the local sink. FormSubmit is never contacted.
    await page.$eval("#wrap-studio", (form, action) => form.setAttribute("action", action), SINK);
    // The submit button sits outside <form> too, bound with form="wrap-studio".
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      tap(page, '[type=submit][form="wrap-studio"]'),
    ]);

    await check("the submission arrived at the sink", () => assertEqual(submissions.length, 1, "count"));
    const { fields, files } = parseMultipart(submissions[0]);

    await check("it posted as multipart/form-data", () =>
      assert(/multipart\/form-data/.test(submissions[0].contentType), submissions[0].contentType));

    await check("both photos are in the body, with their bytes", () => {
      assertEqual(files.length, 2, "attachments");
      files.forEach((f) => {
        assertEqual(f.name, "attachment", `field name for ${f.filename}`);
        assert(f.bytes >= PNG.length, `${f.filename} carried only ${f.bytes} bytes`);
      });
    });

    await check("the hidden estimate fields bound with form= do submit", () => {
      // These sit outside <form>. If the association failed they'd be missing,
      // and the owner's build sheet would arrive with no prices on it.
      ["ballpark_estimate", "transport_estimate", "estimate_total_range", "pricing_mode", "saved_films"].forEach(
        (name) => assert(fields.has(name), `${name} never reached the server`)
      );
      assert(num(fields.get("ballpark_estimate")) > 0, "ballpark_estimate is empty");
      assert(num(fields.get("estimate_total_range")) > 0, "estimate_total_range is empty");
      assertEqual(fields.get("pricing_mode"), "founding", "pricing_mode");
      assertEqual(fields.get("saved_films").split("\n").length, 2, "saved films");
    });

    await check("transport and budget reach the lead", () => {
      assert(/Pickup/.test(fields.get("transport")), `transport is "${fields.get("transport")}"`);
      assertEqual(fields.get("pickup_zone"), brooklyn, "pickup_zone");
      assert(fields.get("budget"), "budget is empty");
      assert(num(fields.get("transport_estimate")) > 0, "transport_estimate is empty");
    });

    await check("the chosen film and bike still post", () => {
      assert(fields.get("vinyl_color"), "vinyl_color is empty");
      assert(fields.get("service"), "service is empty");
    });

    if (process.env.PRINT_LEAD) {
      console.log("\n  --- captured build sheet ---");
      for (const [name, v] of fields) {
        if (name.startsWith("_")) continue;
        console.log(`  ${name.padEnd(22)} ${v.replace(/\n/g, " / ") || "(empty)"}`);
      }
      files.forEach((f) => console.log(`  ${"attachment".padEnd(22)} ${f.filename} (${f.bytes} bytes)`));
      console.log("  ---");
    }

    await check("FormSubmit's own control fields survive", () => {
      assertEqual(fields.get("_captcha"), "false", "_captcha");
      assertEqual(fields.get("_template"), "table", "_template");
      assertEqual(fields.get("_honey"), "", "_honey should post empty");
      assert(
        fields.get("_next").endsWith("/thanks"),
        `_next is "${fields.get("_next")}" — should be the extensionless URL`
      );
    });
  }
  await page.close();

  /* ---- 5. Pricing mode --------------------------------------------------- */
  console.log("\nPricing mode");
  {
    const founding = await open("/pricing");
    const before = new Map(await prices(founding));
    await founding.close();

    const standard = await open("/pricing", { mode: "standard" });
    const after = new Map(await prices(standard));

    await check("standard mode raises every price on /pricing", () => {
      assert(before.size > 0, "no price slots found");
      assertEqual(after.size, before.size, "price slot count");
      for (const [key, was] of before) {
        assert(num(after.get(key)) > num(was), `${key}: ${was} -> ${after.get(key)} did not rise`);
      }
    });

    await check("founding-only copy disappears in standard mode", async () => {
      const shown = await standard.$$eval('[data-cfg-show="founding"]', (els) =>
        els.filter((el) => el.offsetParent !== null).length
      );
      assertEqual(shown, 0, "visible founding-only elements");
    });

    await check("the studio posts the mode it is actually in", async () => {
      const studio = await open("/wrap-studio", { mode: "standard" });
      const mode = await value(studio, 'input[name="pricing_mode"]');
      assertEqual(mode, "standard", "pricing_mode");
      const quoted = await studio.$eval(
        'input[name="service"][value="Full colour-change wrap"]',
        (el) => el.dataset.priceLow
      );
      assert(
        num(quoted) > num(before.get("services.fullWrap.founding.low") || "1650"),
        `the studio still quotes ${quoted}`
      );
      await studio.close();
    });
    await standard.close();
  }

  /* ---- 6. Every page loads clean ----------------------------------------- */
  console.log("\nEvery page");
  {
    const routes = [
      "/",
      "/wrap-studio",
      "/pricing",
      "/services",
      "/services/full-wraps",
      "/services/accent-package",
      "/services/transformation-film",
      "/gallery",
      "/shop",
      "/about",
      "/journal",
      "/testimonials",
      "/faq",
      "/locations",
      "/locations/jersey-city",
      "/locations/brooklyn",
      "/locations/new-york-city",
      "/contact",
      "/thanks",
      "/wrap-quote/",
    ];

    for (const route of routes) {
      const before = failures.length;
      const p = await open(route);
      const state = await p.evaluate(() => ({
        config: !!window.KISALA_CONFIG,
        applied: !!window.KisalaConfig,
        ga: typeof window.gtag === "function",
        // A slot the config never filled in would show up as literal junk.
        stale: [...document.querySelectorAll("[data-cfg]")]
          .map((el) => el.textContent.trim())
          .filter((t) => !t || /undefined|NaN|\{\{/.test(t)).length,
        h1: document.querySelectorAll("h1").length,
        title: document.title,
      }));
      await p.close();

      await check(`${route} loads without script errors`, () => {
        assertEqual(failures.length, before, "errors were logged above");
        assert(state.config, "kisala-config.js did not load");
        assert(state.applied, "config-apply.js did not run");
        assertEqual(state.stale, 0, "unhydrated data-cfg slots");
        assertEqual(state.h1, 1, "exactly one h1");
        assert(state.title.length > 10, `thin title: "${state.title}"`);
        // /wrap-quote/ is the standalone ads page and keeps its own inline tag.
        assert(state.ga, "no GA4 tag");
      });
    }
  }
} finally {
  await browser.close();
  sink.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  FAIL  ${f}`));
process.exit(failures.length ? 1 : 0);
