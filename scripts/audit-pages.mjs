/**
 * Responsive and accessibility sweep of the v3 pages in a real browser.
 *
 * The suites either side of this one answer different questions:
 * test-pages.mjs asserts behaviour under jsdom, verify-browser.mjs proves the
 * two forms actually post. Neither can see layout, because neither lays
 * anything out. This loads each page at the widths riders actually hold and
 * asks the questions only a rendering engine can answer — does anything spill
 * sideways, is every control big enough to hit with a thumb, does every image
 * reserve its space before it loads.
 *
 * Needs `npm run dev` in another terminal and a Chrome on the box:
 *
 *   npm run audit
 *   CHROME_PATH=/path/to/chrome npm run audit
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

/* Every page a rider can reach. This used to be the eight v3 pages, with the
   rest excused as "audited by eye" while they were still on the old stylesheet;
   they are all on one system now, so there is nothing left to excuse. Redirect
   stubs are not listed because there is no layout to measure. */
const ROUTES = [
  "/",
  "/services",
  "/services/full-wraps",
  "/services/accent-package",
  "/services/transformation-film",
  "/gallery",
  "/about",
  "/process",
  "/faq",
  "/quote",
  "/quote-thanks",
  "/pricing",
  "/contact",
  "/locations",
  "/locations/jersey-city",
  "/locations/brooklyn",
  "/locations/new-york-city",
  "/vinyl-catalog",
  "/vinyl-catalog/film",
  "/project",
  "/project-thanks",
  "/wrap-studio",
  "/shop",
  "/shop/wrap",
  "/shop/wrap/gloss",
  "/shop/k-merch",
  "/shop/photoshoot",
  "/testimonials",
  "/journal",
  "/login",
  "/styleguide",
  "/thanks",
  "/deposit-thanks",
  "/wrap-quote/",
  "/404",
];

/* Two small phones, a large phone, a tablet, a small laptop, a desktop. */
const WIDTHS = [375, 390, 430, 768, 1024, 1440];

/** Apple and WCAG both land near this; the design system calls it --kf-tap. */
const TAP = 44;

const problems = [];
const note = (message) => problems.push(message);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

/**
 * Everything below runs in the page. It is one function rather than several so
 * the DOM is walked once per viewport instead of once per question.
 */
function measure(width, tap) {
  const name = (el) =>
    `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}`;

  const out = {
    overflow: null,
    spilling: [],
    smallTaps: [],
    noAlt: [],
    noDims: [],
    dupIds: [],
    unlabelled: [],
    unnamedLinks: [],
  };

  const doc = document.documentElement;
  if (doc.scrollWidth > width + 1) {
    out.overflow = doc.scrollWidth;
    out.spilling = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > width + 1 || r.left < -1);
      })
      .slice(0, 6)
      .map((el) => `${name(el)} right=${Math.round(el.getBoundingClientRect().right)}`);
  }

  const controls = [
    ...document.querySelectorAll(
      "a[href], button, input:not([type=hidden]), select, textarea, summary"
    ),
  ];

  controls.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;

    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return;

    // A link inside a sentence is sized by the sentence, and padding it out
    // would break the line it sits in.
    if (el.tagName === "A" && ["P", "LI", "DD", "SPAN", "EM", "STRONG"].includes(el.parentElement?.tagName)) {
      return;
    }

    // A control wrapped in a label is not the target — the label is. That is
    // the whole shape of a choice card and of a drop zone with a hidden file
    // input inside it.
    const label = el.closest("label");
    if (label && label.getBoundingClientRect().height >= tap) return;

    // Width alone is not a defect: a short word in a horizontal bar is narrow
    // because the word is short, and the gap either side keeps it hittable.
    // A control that is short *and* narrow is the one to worry about.
    if (r.height >= tap) return;
    out.smallTaps.push(`${name(el)} "${(el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  });

  [...document.images].forEach((img) => {
    if (!img.hasAttribute("alt")) out.noAlt.push(img.getAttribute("src"));
    // Without both, the image has no aspect ratio to reserve and the page
    // jumps when it arrives.
    if (!img.getAttribute("width") || !img.getAttribute("height")) {
      out.noDims.push(img.getAttribute("src"));
    }
  });

  const ids = new Map();
  [...document.querySelectorAll("[id]")].forEach((el) => ids.set(el.id, (ids.get(el.id) || 0) + 1));
  out.dupIds = [...ids].filter(([, n]) => n > 1).map(([id]) => id);

  [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].forEach((el) => {
    // A honeypot is deliberately hidden from everyone, assistive tech included.
    if (el.closest('[aria-hidden="true"]') || el.getAttribute("aria-hidden") === "true") return;
    if (getComputedStyle(el).display === "none") return;

    const labelled =
      (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
      el.closest("label") ||
      el.getAttribute("aria-label") ||
      el.getAttribute("aria-labelledby") ||
      el.closest("fieldset")?.querySelector("legend");
    if (!labelled) out.unlabelled.push(`${el.tagName.toLowerCase()}[name=${el.name || "?"}]`);
  });

  [...document.querySelectorAll("a[href]")].forEach((a) => {
    const label =
      (a.textContent || "").trim() ||
      a.getAttribute("aria-label") ||
      a.querySelector("img")?.getAttribute("alt");
    if (!label) out.unnamedLinks.push(a.getAttribute("href"));
  });

  return out;
}

try {
  for (const route of ROUTES) {
    const page = await browser.newPage();
    const scriptErrors = new Set();
    page.on("pageerror", (e) => scriptErrors.add(`page error: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") scriptErrors.add(`console error: ${m.text()}`);
    });

    for (const width of WIDTHS) {
      await page.setViewport({ width, height: 900 });
      await page.goto(BASE + route, { waitUntil: "networkidle0" });
      const found = await page.evaluate(measure, width, TAP);
      const where = `${route} @${width}`;

      if (found.overflow) {
        note(`${where} scrolls sideways at ${found.overflow}px: ${found.spilling.join(" | ")}`);
      }
      const taps = [...new Set(found.smallTaps)];
      if (taps.length) note(`${where} taps under ${TAP}px: ${taps.join(" | ")}`);

      // These do not change with the viewport, so they are only worth asking
      // about once per page.
      if (width !== WIDTHS[WIDTHS.length - 1]) continue;
      if (found.noAlt.length) note(`${route} images with no alt: ${found.noAlt.join(", ")}`);
      if (found.noDims.length) {
        note(`${route} images with no width/height: ${[...new Set(found.noDims)].join(", ")}`);
      }
      if (found.dupIds.length) note(`${route} duplicate ids: ${found.dupIds.join(", ")}`);
      if (found.unlabelled.length) {
        note(`${route} unlabelled fields: ${[...new Set(found.unlabelled)].join(", ")}`);
      }
      if (found.unnamedLinks.length) {
        note(`${route} links with no accessible name: ${found.unnamedLinks.join(", ")}`);
      }
    }

    if (scriptErrors.size) note(`${route} script errors: ${[...scriptErrors].join(" | ")}`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`${ROUTES.length} pages × ${WIDTHS.length} widths`);
if (!problems.length) {
  console.log("\nNothing to report.");
} else {
  console.log(`\n${problems.length} to look at:`);
  problems.forEach((p) => console.log(`  ${p}`));
}
process.exit(problems.length ? 1 : 0);
