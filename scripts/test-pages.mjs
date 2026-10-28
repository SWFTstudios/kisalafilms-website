/**
 * Static checks over every page in public/, no server needed.
 *
 *   npm test
 *
 * What it guards: every page is on the v4 shell and wired the same way; no
 * link points at a route the redesign retired or at a file that isn't there;
 * images carry alt text and dimensions; every data-cfg price resolves in
 * kisala-config.js; structured data parses and the FAQ graph matches the FAQ
 * on the page; the sitemap only lists real, indexable pages; every retired
 * route the Worker redirects lands on a page that exists; and the intake form
 * still posts the field names the Worker reads when scripts are off.
 *
 * The API and the browser flows have their own suites: test-portal-api.mjs,
 * test-payments.mjs and verify-browser.mjs.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = join(ROOT, "public");

let failures = 0;
let checks = 0;
const fail = (where, message) => {
  failures += 1;
  console.log(`FAIL ${where}: ${message}`);
};
const expect = (ok, where, message) => {
  checks += 1;
  if (!ok) fail(where, message);
};

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const isStub = (html) => /http-equiv="refresh"/i.test(html);
const pages = walk(PUBLIC)
  .filter((f) => f.endsWith(".html"))
  .map((f) => ({ rel: relative(PUBLIC, f), html: readFileSync(f, "utf8") }))
  .filter((p) => !isStub(p.html));

/** Self-contained on purpose, with no site chrome: the ad landing page, and
 *  the password-gated internal brand guide. */
const STANDALONE = new Set(["wrap-quote/index.html", "internal/brand-style-guide.html"]);
/** Pages whose <h1> is drawn by their script (signed in, or once the film loads). */
const SCRIPTED_H1 = new Set(["portal.html", "admin.html", "vinyl-catalog/film.html"]);

/* ---- Config ------------------------------------------------------------ */
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(PUBLIC, "js/kisala-config.js"), "utf8"), sandbox);
const CONFIG = sandbox.window.KISALA_CONFIG;

/** Mirrors the virtual keys config-apply.js resolves. */
function resolves(path) {
  const parts = path.split(".");
  if (parts[0] === "services") return !!CONFIG.services?.[parts[1]]?.founding;
  if (parts[0] === "addons") return CONFIG.addons?.[parts[1]]?.founding != null;
  if (parts[0] === "deposit" && parts[1] === "amount") return !!CONFIG.deposit?.packages?.[parts[2]];
  if (parts[0] === "zones") return !!CONFIG.zones?.find((z) => z.id === parts[1]);
  return parts.reduce((n, k) => (n == null ? undefined : n[k]), CONFIG) !== undefined;
}

/* ---- Routes ------------------------------------------------------------ */
const workerSrc = readFileSync(join(ROOT, "src/index.ts"), "utf8");
const retiredBlock = workerSrc.match(/const RETIRED: Record<string, string> = \{([\s\S]*?)\};/)[1];
const RETIRED = Object.fromEntries([...retiredBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));

/** Paths the Worker answers itself rather than a file. */
const DYNAMIC = [/^\/api\//];

function pageExists(path) {
  const clean = path.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  if (clean === "/") return true;
  if (DYNAMIC.some((r) => r.test(clean))) return true;
  const base = join(PUBLIC, clean);
  return [base, `${base}.html`, join(base, "index.html")].some((f) => existsSync(f) && statSync(f).isFile());
}

function isRetired(path) {
  const clean = path.split(/[?#]/)[0].replace(/\.html$/, "").replace(/\/$/, "") || "/";
  return clean in RETIRED || /^\/shop(\/|$)/.test(clean);
}

/* ---- Per page ---------------------------------------------------------- */
for (const { rel, html } of pages) {
  const doc = new JSDOM(html).window.document;
  const where = rel;
  const standalone = STANDALONE.has(rel);

  expect(doc.documentElement.lang === "en", where, "html lang should be en");
  expect(!!doc.title.trim(), where, "missing <title>");
  expect(!!doc.querySelector('meta[name="description"]')?.content, where, "missing meta description");
  expect(!!doc.querySelector('meta[name="viewport"]'), where, "missing viewport meta");

  const h1s = doc.querySelectorAll("h1").length;
  if (!SCRIPTED_H1.has(rel)) expect(h1s === 1, where, `expected one <h1>, found ${h1s}`);

  if (!standalone) {
    expect(!!doc.querySelector('link[rel="stylesheet"][href="/css/kf.css"]'), where, "doesn't load /css/kf.css");
    expect(!html.includes("/css/kfilms.css"), where, "still loads the v3 stylesheet");
    expect(html.includes("<!-- CHROME4:HEADER start") && html.includes("<!-- CHROME4:FOOTER start"), where, "missing the v4 chrome markers");
    expect(!!doc.querySelector('script[src="/js/kf.js"]'), where, "doesn't load /js/kf.js");
    expect(!!doc.querySelector('script[src="/js/kisala-config.js"]') && !!doc.querySelector('script[src="/js/config-apply.js"]'), where, "config scripts not wired");
    expect(!!doc.querySelector("main#main") && !!doc.querySelector('a.skip-link[href="#main"]'), where, "skip link or main#main missing");
  }

  // Links and assets
  for (const el of doc.querySelectorAll("a[href], link[href], script[src], img[src], source[srcset]")) {
    const raw = el.getAttribute("href") ?? el.getAttribute("src") ?? el.getAttribute("srcset");
    const urls = el.hasAttribute("srcset") ? raw.split(",").map((s) => s.trim().split(" ")[0]) : [raw];
    for (const url of urls) {
      if (!url.startsWith("/") || url.startsWith("//")) continue;
      if (el.tagName === "A") expect(!isRetired(url), where, `links to retired route ${url}`);
      expect(pageExists(url) || isRetired(url), where, `points at ${url}, which doesn't exist`);
    }
  }

  for (const img of doc.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    expect(img.hasAttribute("alt"), where, `image without alt: ${src}`);
    if (!standalone) expect(img.hasAttribute("width") && img.hasAttribute("height"), where, `image without width/height: ${src}`);
  }

  for (const el of doc.querySelectorAll("[data-cfg]")) {
    const path = el.getAttribute("data-cfg");
    expect(resolves(path), where, `data-cfg="${path}" doesn't resolve in kisala-config.js`);
  }

  // Duplicate ids break labels and aria references.
  const ids = [...doc.querySelectorAll("[id]")].map((e) => e.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(!dup.length, where, `duplicate ids: ${[...new Set(dup)].join(", ")}`);

  // Structured data
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let graph = null;
    try { graph = JSON.parse(s.textContent); } catch (e) { fail(where, `JSON-LD doesn't parse: ${e.message}`); }
    if (graph && rel === "faq.html") {
      const faq = graph["@graph"].find((n) => n["@type"] === "FAQPage");
      const onPage = doc.querySelectorAll(".faq-q").length;
      expect(faq && faq.mainEntity.length === onPage, where, `FAQPage has ${faq?.mainEntity.length} questions, page has ${onPage}`);
    }
  }
}

/* ---- Site-wide --------------------------------------------------------- */
const sitemap = readFileSync(join(PUBLIC, "sitemap.xml"), "utf8");
const listed = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
expect(listed.length > 10, "sitemap.xml", "lists too few pages");
for (const path of listed) {
  expect(pageExists(path), "sitemap.xml", `lists ${path}, which doesn't exist`);
  expect(!isRetired(path), "sitemap.xml", `lists retired route ${path}`);
}
for (const must of ["/", "/services", "/book", "/builds", "/studio", "/faq"]) {
  expect(listed.includes(must), "sitemap.xml", `doesn't list ${must}`);
}
for (const never of ["/portal", "/admin", "/login", "/book-thanks"]) {
  expect(!listed.includes(never), "sitemap.xml", `lists private page ${never}`);
}
expect(existsSync(join(PUBLIC, "robots.txt")), "robots.txt", "missing");

for (const [from, to] of Object.entries(RETIRED)) {
  expect(pageExists(to), "src/index.ts RETIRED", `${from} redirects to ${to}, which doesn't exist`);
  expect(!pageExists(from) || DYNAMIC.some((r) => r.test(from)), "src/index.ts RETIRED", `${from} still has a file, so the redirect never runs`);
}

// /internal/* is behind basic auth in the Worker, which only works if the
// Worker runs before the static file would be served.
const wranglerConfig = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
if (existsSync(join(PUBLIC, "internal"))) {
  expect(/"run_worker_first":\s*\[[^\]]*"\/\*"/.test(wranglerConfig) && !/"!\/internal/.test(wranglerConfig), "wrangler.jsonc",
    "assets.run_worker_first must send /internal/* to the Worker, or the internal pages are public");
}

// The intake form's native post must carry the names the Worker reads.
const book = new JSDOM(readFileSync(join(PUBLIC, "book.html"), "utf8")).window.document;
const form = book.getElementById("book-form");
expect(form?.getAttribute("action") === "/api/jobs" && form.getAttribute("method") === "post" && form.getAttribute("enctype") === "multipart/form-data",
  "book.html", "form must post multipart to /api/jobs");
const portalSrc = readFileSync(join(ROOT, "src/portal.ts"), "utf8");
const read = new Set([...portalSrc.matchAll(/one\("([a-z_]+)"\)/g)].map((m) => m[1]).concat(["panels", "photos"]));
const names = new Set([...form.elements].map((e) => e.name).filter(Boolean));
for (const name of read) expect(names.has(name), "book.html", `form has no field named ${name}, which the Worker reads`);
for (const name of ["name", "email", "bike_make", "bike_model"]) {
  expect(form.elements[name]?.hasAttribute("required"), "book.html", `${name} should be required`);
}

console.log(`\n${pages.length} pages, ${checks} checks${failures ? `, ${failures} failed` : ", all passed"}`);
process.exit(failures ? 1 : 0);
