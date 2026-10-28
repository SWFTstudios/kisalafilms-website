/**
 * Export website marketing copy to a downloadable RTF inventory.
 *
 * Walks public HTML pages, labels each string by on-page placement
 * (hero, section, FAQ, form, final CTA, chrome), and writes
 * doc/website-copy.rtf.
 *
 * Usage:
 *   node scripts/export-website-copy.mjs
 *   npm run export:copy
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const OUT = join(ROOT, "doc", "website-copy.rtf");

/** Paths relative to public/ to skip (redirect stubs + styleguide). */
const EXCLUDE = new Set([
  "films.html",
  "watch.html",
  "series.html",
  "dispatches.html",
  "inspo-museum.html",
  "work-with-me.html",
  "styleguide.html",
  "shop/merch.html",
  "shop/merch/wlg-direction-hoodie.html",
  "shop/merch/wlg-lucky-fail-tee.html",
  "shop/merch/wlg-eighty-tee.html",
  "shop/merch/wlg-different-path-hoodie.html",
  "shop/merch/wlg-glitch-tee.html",
  "shop/merch/wlg-rule-four-tee.html",
  "shop/merch/wlg-no-prime-tee.html",
  "shop/merch/wlg-exist-first-tee.html",
]);

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "PATH",
  "CIRCLE",
  "TEMPLATE",
]);

/** Preferred page order for the inventory (remaining pages append alphabetically). */
const PAGE_ORDER = [
  "index.html",
  "about.html",
  "services.html",
  "services/full-wraps.html",
  "services/accent-package.html",
  "services/transformation-film.html",
  "process.html",
  "pricing.html",
  "faq.html",
  "gallery.html",
  "testimonials.html",
  "journal.html",
  "contact.html",
  "quote.html",
  "project.html",
  "locations.html",
  "locations/jersey-city.html",
  "locations/brooklyn.html",
  "locations/new-york-city.html",
  "wrap-studio.html",
  "vinyl-catalog.html",
  "vinyl-catalog/film.html",
  "lookbook.html",
  "lookbook/film.html",
  "shop.html",
  "shop/wrap.html",
  "shop/photoshoot.html",
  "shop/k-merch.html",
];

function walkHtml(dir, base = PUBLIC, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, name.name);
    if (name.isDirectory()) {
      walkHtml(abs, base, out);
      continue;
    }
    if (!name.name.endsWith(".html")) continue;
    const rel = relative(base, abs).split("\\").join("/");
    if (EXCLUDE.has(rel)) continue;
    out.push(rel);
  }
  return out;
}

function pageUrl(rel) {
  if (rel === "index.html") return "/";
  if (rel === "wrap-quote/index.html") return "/wrap-quote/";
  return "/" + rel.replace(/\.html$/, "").replace(/\/index$/, "");
}

function normalize(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** textContent with <br> treated as spaces so "Wrap it.<br>Ride it." stays readable. */
function elementText(el) {
  if (!el) return "";
  const clone = el.cloneNode(true);
  for (const br of clone.querySelectorAll("br")) {
    br.replaceWith(clone.ownerDocument.createTextNode(" "));
  }
  for (const hidden of clone.querySelectorAll(
    ".visually-hidden, [aria-hidden='true'], .mark, .kf-step-num, .btn-arrow"
  )) {
    hidden.remove();
  }
  return normalize(clone.textContent);
}

function closest(el, selector) {
  return el.closest?.(selector) ?? null;
}

function sectionLabel(section) {
  if (!section) return "Section";
  if (section.classList.contains("kf-cta")) return "Final CTA";
  if (
    section.classList.contains("kf-hero") ||
    section.classList.contains("page-hero") ||
    section.classList.contains("kf-page-hero")
  ) {
    return "Hero";
  }
  const id = section.id || section.getAttribute("aria-labelledby");
  let name = "";
  if (id && !section.id) {
    const heading = section.ownerDocument.getElementById(id);
    name = heading ? elementText(heading) : id;
  } else if (section.id) {
    const h = section.querySelector("h1, h2, h3");
    name = h ? elementText(h) : section.id;
  } else {
    const h = section.querySelector("h1, h2, h3");
    name = h ? elementText(h) : "";
  }
  return name ? `Section · ${name}` : "Section";
}

function roleLabel(el) {
  const tag = el.tagName;
  if (el.classList.contains("eyebrow")) return "eyebrow";
  if (tag === "H1") return "h1";
  if (tag === "H2") return "h2";
  if (tag === "H3") return "h3";
  if (tag === "H4") return "h4";
  if (el.classList.contains("p-lg")) return "lede";
  if (el.classList.contains("faq-q") || closest(el, ".faq-q")) return "question";
  if (el.classList.contains("faq-a")) return "answer";
  if (tag === "LABEL") return "label";
  if (tag === "BUTTON" || (tag === "A" && el.classList.contains("btn"))) return "CTA";
  if (tag === "A" && el.classList.contains("link-arrow")) return "link";
  if (el.hasAttribute("placeholder")) return "placeholder";
  if (tag === "LI") return "list item";
  if (el.classList.contains("p") || tag === "P") return "body";
  if (tag === "SPAN" && el.classList.contains("kf-price-amount")) return "price";
  if (tag === "FIGCAPTION") return "caption";
  return tag.toLowerCase();
}

function cardContext(el) {
  const benefit = closest(el, ".kf-benefit");
  if (benefit) {
    const title = benefit.querySelector("h3, h2, .h3");
    const name = title ? elementText(title) : "benefit";
    return `Benefit · ${name}`;
  }
  const serviceCard = closest(el, ".kf-service-card, .kf-service-detail");
  if (serviceCard) {
    const title = serviceCard.querySelector("h3, h2");
    const name = title ? elementText(title) : "card";
    return `Card · ${name}`;
  }
  const card = closest(el, ".kf-card, .kf-price-card, .kf-cta-note");
  if (card) {
    const title = card.querySelector("h3, h2, .h3, .h5");
    const name = title ? elementText(title) : "card";
    return `Card · ${name}`;
  }
  const step = closest(el, ".kf-step");
  if (step) {
    const title = step.querySelector("h3");
    const name = title
      ? elementText(title).replace(/^Step \d+\s*[—–-]\s*/i, "")
      : "step";
    return `Step · ${name}`;
  }
  const faq = closest(el, ".faq-item, [data-faq]");
  if (faq || el.classList.contains("faq-q") || el.classList.contains("faq-a")) {
    return "FAQ";
  }
  const form = closest(el, "form");
  if (form || tagIsFormish(el)) {
    return "Form";
  }
  return null;
}

function tagIsFormish(el) {
  const t = el.tagName;
  return t === "LABEL" || t === "BUTTON" || el.hasAttribute("placeholder");
}

function placementFor(el) {
  const section =
    closest(el, "section.kf-hero, section.page-hero, section.kf-page-hero, section.kf-cta, section.kf-section, section") ||
    closest(el, "header, footer");
  const base = sectionLabel(section);
  const card = cardContext(el);
  const role = roleLabel(el);

  if (base === "Hero") {
    if (closest(el, ".kf-hero-trust")) return `Hero · trust`;
    if (closest(el, ".kf-hero-location")) return `Hero · location · ${role}`;
    return `Hero · ${role}`;
  }
  if (base === "Final CTA") {
    if (card) return `Final CTA · ${card} · ${role}`;
    return `Final CTA · ${role}`;
  }
  if (card) {
    if (card.startsWith("FAQ")) return `FAQ · ${role}`;
    if (card === "Form") return `Form · ${role}`;
    return `${base} · ${card} · ${role}`;
  }
  return `${base} · ${role}`;
}

function shouldSkipElement(el) {
  if (!el || el.nodeType !== 1) return true;
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.classList.contains("visually-hidden") || el.classList.contains("skip-link")) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  // Decorative step numbers
  if (el.classList.contains("kf-step-num") || el.classList.contains("mark")) return true;
  return false;
}

function collectTextBlocks(root) {
  if (!root) return [];
  const blocks = [];
  const selectors = [
    ".eyebrow",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    ".p-lg",
    "p.p",
    "p.faq-a",
    "p",
    "li",
    "label",
    "button.faq-q",
    "button.btn",
    "a.btn",
    "a.link-arrow",
    "[placeholder]",
    "figcaption",
    ".kf-price-amount",
    ".footer-bottom span",
  ].join(", ");

  const seen = new Set();
  for (const el of root.querySelectorAll(selectors)) {
    if (shouldSkipElement(el)) continue;
    // Skip nested matches — prefer the outer intentional block
    if (el.closest("svg")) continue;
    // Prefer button.faq-q over nested spans
    if (el.tagName === "P" && el.closest("button.faq-q")) continue;
    if (el.tagName === "SPAN" && !el.classList.contains("kf-price-amount")) continue;

    // Avoid double-counting: if a more specific sibling selector already covers this
    // (e.g. p.p vs p), we still may hit both — dedupe by element.
    if (seen.has(el)) continue;
    seen.add(el);

    // Skip paragraphs that only wrap a link already captured as .link-arrow
    if (el.tagName === "P") {
      const onlyLink = el.querySelector(":scope > a.link-arrow");
      if (onlyLink && elementText(el) === elementText(onlyLink)) continue;
    }

    let value;
    if (el.hasAttribute("placeholder") && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      value = normalize(el.getAttribute("placeholder"));
    } else {
      value = elementText(el);
    }
    if (!value) continue;

    // Strip arrow glyph noise from CTAs
    value = value.replace(/\s*[→›»]\s*$/u, "").trim();
    if (!value) continue;

    // Skip pure single-character marks
    if (value.length === 1 && /[→›»]/.test(value)) continue;

    blocks.push({ el, text: value, placement: placementFor(el) });
  }
  return blocks;
}

function dedupeBlocks(blocks) {
  const out = [];
  let lastKey = "";
  for (const b of blocks) {
    const key = `${b.placement}||${b.text}`;
    if (key === lastKey) continue;
    // Also skip exact same text+placement later in list (common for duplicated mobile/desktop)
    if (out.some((x) => x.placement === b.placement && x.text === b.text)) continue;
    out.push({ placement: b.placement, text: b.text });
    lastKey = key;
  }
  return out;
}

function extractChrome(document) {
  const entries = [];
  const header = document.querySelector("header.site-header");
  if (header) {
    for (const a of header.querySelectorAll("nav a, .nav-cluster a, .btn")) {
      const text = elementText(a);
      if (text) entries.push({ placement: "Nav", text });
    }
    const loc = header.querySelector(".nav-location");
    if (loc) entries.push({ placement: "Nav · location", text: elementText(loc) });
  }

  const drawer = document.querySelector("#nav-drawer, aside.nav-panel");
  if (drawer) {
    const moreBtn = drawer.querySelector(".nav-acc-btn span");
    if (moreBtn) {
      const t = elementText(moreBtn);
      if (t && t !== "▼") entries.push({ placement: "Nav · drawer", text: t });
    }
    for (const a of drawer.querySelectorAll(".nav-acc-panel a")) {
      const text = elementText(a);
      if (text) entries.push({ placement: "Nav · drawer · More", text });
    }
    const panelLoc = drawer.querySelector(".nav-panel-location");
    if (panelLoc) {
      entries.push({ placement: "Nav · drawer · location", text: elementText(panelLoc) });
    }
  }

  const footer = document.querySelector("footer.site-footer");
  if (footer) {
    for (const col of footer.querySelectorAll(".footer-grid > div")) {
      const heading = col.querySelector("h2, .h5");
      const colName = heading ? elementText(heading) : "column";
      if (heading) entries.push({ placement: `Footer · ${colName} · heading`, text: colName });
      for (const a of col.querySelectorAll(".footer-links a")) {
        const text = elementText(a);
        if (text) entries.push({ placement: `Footer · ${colName} · link`, text });
      }
      for (const p of col.querySelectorAll("p")) {
        const text = elementText(p);
        if (text) entries.push({ placement: `Footer · ${colName} · body`, text });
      }
    }
    const bottom = footer.querySelector(".footer-bottom");
    if (bottom) {
      for (const child of bottom.querySelectorAll("span, a")) {
        const text = elementText(child);
        if (text) entries.push({ placement: "Footer · bottom", text });
      }
    }
  }

  const sticky = document.querySelector(".kf-sticky-cta");
  if (sticky) {
    const text = elementText(sticky);
    if (text) entries.push({ placement: "Sticky CTA", text });
  }

  return dedupeBlocks(entries);
}

function extractPage(html, rel) {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const metaTitle = elementText(document.querySelector("title"));
  const metaDesc = normalize(
    document.querySelector('meta[name="description"]')?.getAttribute("content")
  );

  const entries = [];
  if (metaTitle) entries.push({ placement: "Meta title", text: metaTitle });
  if (metaDesc) entries.push({ placement: "Meta description", text: metaDesc });

  const main = document.querySelector("main#main") || document.querySelector("main");
  let root = main;
  if (!root) {
    // wrap-quote and odd pages: use body minus chrome
    root = document.body;
  }

  const blocks = collectTextBlocks(root);
  // Filter chrome that might leak if main is missing
  const filtered = blocks.filter((b) => {
    if (main) return true;
    if (closest(b.el, "header.site-header, footer.site-footer, .kf-sticky-cta")) return false;
    return true;
  });

  entries.push(...dedupeBlocks(filtered));
  return entries;
}

/* ---- RTF ---------------------------------------------------------------- */

function rtfEscape(text) {
  let out = "";
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "{") out += "\\{";
    else if (ch === "}") out += "\\}";
    else if (ch === "\n") out += "\\par ";
    else if (code === 0xa0) out += " ";
    else if (code > 127) out += `\\u${code > 32767 ? code - 65536 : code}?`;
    else out += ch;
  }
  return out;
}

function rtfParagraph(text, { bold = false, italic = false, size = 22 } = {}) {
  const parts = [`\\fs${size}`];
  if (bold) parts.push("\\b");
  if (italic) parts.push("\\i");
  let s = `{\\pard ${parts.join(" ")} ${rtfEscape(text)}`;
  if (bold) s += "\\b0";
  if (italic) s += "\\i0";
  s += "\\par}\n";
  return s;
}

function buildRtf(chromeEntries, pages) {
  const date = new Date().toISOString().slice(0, 10);
  let body = "";
  body += rtfParagraph("K Films — Website Copy Inventory", { bold: true, size: 36 });
  body += rtfParagraph(`Generated: ${date}`, { italic: true, size: 20 });
  body += rtfParagraph(
    "Placement labels describe where each string appears on the page. Config-injected numbers (data-cfg) show the HTML fallback text; live values come from kisala-config.js.",
    { size: 18 }
  );
  body += rtfParagraph("", { size: 18 });

  body += rtfParagraph("1. Shared chrome", { bold: true, size: 30 });
  body += rtfParagraph(
    "Nav, footer, and sticky CTA — duplicated across pages; sourced from index.html.",
    { italic: true, size: 18 }
  );
  for (const e of chromeEntries) {
    body += rtfParagraph(`[${e.placement}]`, { italic: true, size: 18 });
    body += rtfParagraph(e.text, { size: 22 });
  }
  body += rtfParagraph("", { size: 18 });

  let n = 2;
  for (const page of pages) {
    const heading = `${n}. ${page.url}${page.url === "/" ? " (Home)" : ""}`;
    body += rtfParagraph(heading, { bold: true, size: 30 });
    body += rtfParagraph(`File: public/${page.rel}`, { italic: true, size: 18 });
    if (!page.entries.length) {
      body += rtfParagraph("(No extractable copy)", { italic: true, size: 20 });
    }
    for (const e of page.entries) {
      body += rtfParagraph(`[${e.placement}]`, { italic: true, size: 18 });
      body += rtfParagraph(e.text, { size: 22 });
    }
    body += rtfParagraph("", { size: 18 });
    n += 1;
  }

  return `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Georgia;}{\\f1 Helvetica;}}\n\\f0\\fs22\n${body}}`;
}

/* ---- Main --------------------------------------------------------------- */

function sortPages(rels) {
  const rank = new Map(PAGE_ORDER.map((p, i) => [p, i]));
  return [...rels].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a) : 1000;
    const rb = rank.has(b) ? rank.get(b) : 1000;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

function main() {
  const all = sortPages(walkHtml(PUBLIC));
  const indexHtml = readFileSync(join(PUBLIC, "index.html"), "utf8");
  const indexDom = new JSDOM(indexHtml);
  const chromeEntries = extractChrome(indexDom.window.document);

  const pages = [];
  for (const rel of all) {
    const html = readFileSync(join(PUBLIC, rel), "utf8");
    const entries = extractPage(html, rel);
    pages.push({ rel, url: pageUrl(rel), entries });
  }

  const rtf = buildRtf(chromeEntries, pages);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, rtf, "utf8");

  const entryCount = pages.reduce((n, p) => n + p.entries.length, 0) + chromeEntries.length;
  console.log(
    `Wrote ${OUT}\n  ${pages.length} pages · ${chromeEntries.length} chrome entries · ${entryCount} total strings`
  );
}

main();
