/**
 * Crawl every internal link on the running site and report the status each one
 * resolves to, following at most one hop.
 *
 * A link that answers 307 still works, but it spends a round trip and, for
 * crawlers, splits the signal across two URLs. Cloudflare Static Assets serves
 * every page extensionless and 307s the .html form, so this is how we tell
 * whether the markup names the URL that actually answers.
 *
 * Needs `npm run dev` in another terminal. Usage: node scripts/crawl-links.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const PUBLIC = new URL("../public", import.meta.url).pathname;

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const pages = walk(PUBLIC)
  .filter((f) => f.endsWith(".html"))
  .map((f) => relative(PUBLIC, f));

// Where the link was written, so a failure names a file to open rather than
// just a URL.
const sources = new Map();
for (const page of pages) {
  const html = readFileSync(join(PUBLIC, page), "utf8");
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|#|javascript:)/.test(href)) continue;
    const clean = href.split("#")[0];
    if (!clean) continue;
    const abs = clean.startsWith("/")
      ? clean
      : "/" + join(page, "..", clean).replace(/^\.\//, "");
    (sources.get(abs) ?? sources.set(abs, new Set()).get(abs)).add(page);
  }
}

const results = [];
for (const [path, from] of [...sources].sort()) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  const location = res.headers.get("location");
  let final = res.status;
  if (location) {
    final = (await fetch(new URL(location, BASE), { redirect: "manual" })).status;
  }
  results.push({ path, status: res.status, location, final, from: [...from] });
}

const redirects = results.filter((r) => r.location);
const broken = results.filter((r) => r.final >= 400);

console.log(`${sources.size} distinct internal link targets across ${pages.length} pages\n`);

if (redirects.length) {
  console.log(`${redirects.length} resolve through a redirect:`);
  for (const r of redirects) {
    console.log(`  ${r.status} ${r.path} -> ${r.location} (${r.final})`);
    console.log(`        linked from ${r.from.length} page(s): ${r.from.slice(0, 4).join(", ")}${r.from.length > 4 ? "…" : ""}`);
  }
  console.log();
}

if (broken.length) {
  console.log(`${broken.length} broken:`);
  for (const r of broken) console.log(`  ${r.final} ${r.path} — from ${r.from.join(", ")}`);
} else {
  console.log("No broken links.");
}

process.exit(broken.length ? 1 : 0);
