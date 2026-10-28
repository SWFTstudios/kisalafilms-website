/**
 * Owner-only internal quote sheet for /quote.
 *
 * Mirrors public/js/kisala-config.js → quoteInternal + projectCheckout labour/
 * footage tables. Never rendered on the customer-facing form — returned to
 * quote.js so it can fill FormSubmit's hidden `internal_quote_sheet` field.
 */

import {
  ACCENT_FEET,
  FILM_DIFFICULTY,
  FULL_FEET_BY_BODY,
  HELMET_FEET,
  HELMET_LABOUR,
  MOTORCYCLE_LABOUR,
  ROLL_LENGTH_FT,
  ROLL_WIDTH_FT,
  VINYL_MARKUP,
  clampDifficulty,
  filmDifficultyFromFinish,
  rollsForFeet,
  roundMoney,
  sellFromCost,
} from "./project-quote";
import type { D1Database } from "./films";
import type { AssetsFetcher } from "./static-films";

/** Keep in sync with kisala-config.js → quoteInternal. */
export const QUOTE_INTERNAL = {
  wasteFactor: 0.25,
  vinylMarkup: VINYL_MARKUP,
  rangePadLow: 0.9,
  rangePadHigh: 1.15,
  rollWidthFt: ROLL_WIDTH_FT,
  rollLengthFt: ROLL_LENGTH_FT,
  candidatesPerVendor: 3,
  fallbackRollCostUsd: 450,
  styleToBodyClass: {
    Sport: "full_sport",
    Naked: "naked_minimal",
    Cruiser: "cruiser_simple",
    Touring: "touring_complex",
    Adventure: "adventure_touring",
    Dirt: "dirt_mx",
    Supermoto: "half_faired",
    Scooter: "scooter_enclosed",
    Other: "unknown",
    "": "unknown",
  } as Record<string, string>,
  styleToDifficulty: {
    Sport: 4,
    Naked: 2,
    Cruiser: 2,
    Touring: 5,
    Adventure: 4,
    Dirt: 2,
    Supermoto: 3,
    Scooter: 3,
    Other: 3,
    "": 3,
  } as Record<string, number>,
};

export type QuoteEstimateInput = {
  item_type?: string;
  services?: string | string[];
  bike_year?: string;
  bike_make?: string;
  bike_model?: string;
  bike_style?: string;
  helmet_brand?: string;
  helmet_model?: string;
  finish?: string;
  desired_colour?: string;
  description?: string;
};

export type FilmCandidate = {
  vendor: "Metro" | "Vinyl Frog";
  handle: string;
  name: string;
  finish: string;
  colorFamily: string;
  url: string;
  rollPriceUsd: number | null;
  score: number;
};

export type QuoteEstimateResult = {
  sheet: string;
  coverage: string;
  bodyClass: string;
  baseFeet: number;
  wasteFactor: number;
  feetWithWaste: number;
  rolls: number;
  metro: FilmCandidate[];
  vinylFrog: FilmCandidate[];
  bestVendor: string;
  bestRollPriceUsd: number;
  materialCostUsd: number;
  labourUsd: number;
  vinylSellUsd: number;
  markupProfitUsd: number;
  suggestedLowUsd: number;
  suggestedMidUsd: number;
  suggestedHighUsd: number;
  cashAfterMaterialsUsd: number;
  matchConfidence: "high" | "medium" | "low" | "none";
};

type CatalogColor = {
  h?: string;
  n?: string;
  v?: string;
  f?: string;
  c?: string;
  u?: string;
  p?: number | null;
  a?: boolean;
};

type CatalogFile = {
  colors?: CatalogColor[];
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function text(value: unknown, max = 400): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function servicesList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => text(v, 120)).filter(Boolean);
  }
  const one = text(value, 400);
  if (!one) return [];
  return one.split(",").map((s) => s.trim()).filter(Boolean);
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function moneyExact(n: number): string {
  return `$${roundMoney(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Map form finish labels onto catalog finish tokens. */
function finishAliases(finish: string): string[] {
  const f = finish.trim().toLowerCase();
  if (!f || f === "not sure yet") return [];
  if (f.includes("colour shift") || f.includes("color shift") || f.includes("shift")) {
    return ["color shift", "shift", "chameleon"];
  }
  if (f.includes("carbon") || f.includes("textured") || f.includes("texture")) {
    return ["textured", "carbon", "brushed", "forged"];
  }
  if (f.includes("chrome")) return ["chrome", "mirror"];
  if (f.includes("metallic")) return ["metallic", "candy"];
  if (f.includes("matte") || f.includes("matt")) return ["matte", "matt", "ultra matte"];
  if (f.includes("satin")) return ["satin"];
  if (f.includes("gloss")) return ["gloss", "super gloss", "ultra gloss", "high glossy"];
  return [f];
}

function colourTokens(...parts: string[]): string[] {
  const stop = new Set([
    "a", "an", "the", "and", "or", "with", "for", "to", "of", "in", "on",
    "deep", "dark", "light", "bright", "like", "something", "kinda", "kind",
    "want", "looking", "maybe", "ish", "very", "really", "colour", "color",
    "vinyl", "wrap", "film", "finish",
  ]);
  const raw = parts.join(" ").toLowerCase();
  const tokens = raw
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t));
  return Array.from(new Set(tokens));
}

function scoreFilm(
  color: CatalogColor,
  finishKeys: string[],
  colourKeys: string[]
): number {
  const title = `${color.n || ""} ${color.f || ""} ${color.c || ""}`.toLowerCase();
  let score = 0;

  if (finishKeys.length) {
    const hit = finishKeys.some((k) => title.includes(k) || (color.f || "").toLowerCase().includes(k));
    if (hit) score += 40;
    else score -= 15;
  } else {
    score += 5;
  }

  if (colourKeys.length) {
    let colourHits = 0;
    for (const k of colourKeys) {
      if (title.includes(k) || (color.c || "").toLowerCase().includes(k)) {
        colourHits += 1;
        score += 25;
      }
    }
    if (!colourHits) score -= 10;
  } else if (finishKeys.length) {
    // No colour text — prefer in-stock finish matches as representative SKUs.
    score += color.a ? 8 : 0;
  }

  if (typeof color.p === "number" && color.p > 0) score += 3;
  return score;
}

function toCandidate(
  vendor: "Metro" | "Vinyl Frog",
  color: CatalogColor,
  score: number,
  price: number | null
): FilmCandidate {
  return {
    vendor,
    handle: String(color.h || ""),
    name: String(color.n || color.h || "Unknown"),
    finish: String(color.f || ""),
    colorFamily: String(color.c || ""),
    url: String(
      color.u ||
        (vendor === "Metro"
          ? `https://metrorestyling.com/products/${color.h}`
          : `https://www.vinylfrog.com/products/${color.h}`)
    ),
    rollPriceUsd: price,
    score,
  };
}

async function loadCatalog(
  assets: AssetsFetcher,
  request: Request,
  path: string
): Promise<CatalogColor[]> {
  const url = new URL(path, request.url);
  const res = await assets.fetch(new Request(url.toString(), { method: "GET" }));
  if (!res.ok) return [];
  const data = (await res.json()) as CatalogFile;
  return data.colors || [];
}

async function loadD1PriceMap(db: D1Database | undefined): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!db) return map;
  try {
    const rows = await db
      .prepare(
        `SELECT handle, COALESCE(roll_price_usd, price_usd) AS price
         FROM films
         WHERE COALESCE(roll_price_usd, price_usd) IS NOT NULL
           AND COALESCE(roll_price_usd, price_usd) > 0`
      )
      .all<{ handle: string; price: number }>();
    for (const row of rows.results || []) {
      const p = Number(row.price);
      if (Number.isFinite(p) && p > 0) map.set(row.handle.toLowerCase(), p);
    }
  } catch (err) {
    console.warn("quote-estimate: D1 price map failed", String(err));
  }
  return map;
}

async function fetchShopifyRollPrice(
  base: string,
  handle: string
): Promise<number | null> {
  try {
    const url = `${base}/products/${encodeURIComponent(handle)}.js`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "KisalaFilmsQuoteEstimate/1.0 (+https://kisalafilms-website.elombe.workers.dev)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      price?: number | string;
      price_min?: number | string;
      variants?: Array<{ price?: number | string }>;
    };
    const raw = data.variants?.[0]?.price ?? data.price ?? data.price_min;
    if (raw === null || raw === undefined || raw === "") return null;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    // Metro *.js often returns cents as integer.
    if (Number.isInteger(n) && n >= 1000) return roundMoney(n / 100);
    return roundMoney(n);
  } catch {
    return null;
  }
}

function pickCandidates(
  vendor: "Metro" | "Vinyl Frog",
  colors: CatalogColor[],
  finishKeys: string[],
  colourKeys: string[],
  priceMap: Map<string, number>,
  limit: number
): FilmCandidate[] {
  const scored = colors
    .map((c) => {
      const score = scoreFilm(c, finishKeys, colourKeys);
      const handle = String(c.h || "").toLowerCase();
      const fromMap = handle ? priceMap.get(handle) : undefined;
      const fromJson = typeof c.p === "number" && c.p > 0 ? c.p : null;
      const price = fromMap ?? fromJson ?? null;
      return { c, score, price };
    })
    .filter((row) => row.score > 0 || (!colourKeys.length && finishKeys.length && row.score >= 20))
    .sort((a, b) => b.score - a.score || (a.price ?? 9e9) - (b.price ?? 9e9));

  const top = scored.slice(0, Math.max(limit * 2, limit));
  // If nothing scored, take a few finish-family reps (or any priced SKUs).
  const pool =
    top.length > 0
      ? top
      : colors
          .map((c) => {
            const handle = String(c.h || "").toLowerCase();
            const price =
              priceMap.get(handle) ??
              (typeof c.p === "number" && c.p > 0 ? c.p : null);
            return { c, score: 1, price };
          })
          .filter((row) => row.price != null)
          .sort((a, b) => (a.price ?? 9e9) - (b.price ?? 9e9))
          .slice(0, limit);

  return pool.slice(0, limit).map((row) => toCandidate(vendor, row.c, row.score, row.price));
}

function resolveCoverage(itemType: string, services: string[]): {
  label: string;
  wantsBike: boolean;
  wantsHelmet: boolean;
  bikeCoverage: "full" | "accent" | "none";
} {
  const item = itemType || "Bike";
  const wantsBike = item === "Bike" || item === "Both";
  const wantsHelmet = item === "Helmet" || item === "Both";
  const joined = services.join(" ").toLowerCase();

  const accentOnly =
    services.length > 0 &&
    !/(vinyl wrap|colour change|color change|ppf|custom graphics|livery)/i.test(joined) &&
    /(decal|accent)/i.test(joined);

  let bikeCoverage: "full" | "accent" | "none" = "none";
  if (wantsBike) bikeCoverage = accentOnly ? "accent" : "full";

  const parts: string[] = [];
  if (bikeCoverage === "full") parts.push("full bike");
  if (bikeCoverage === "accent") parts.push("accent / panels");
  if (wantsHelmet) parts.push("helmet");
  if (!parts.length) parts.push("unspecified");

  return { label: parts.join(" + "), wantsBike, wantsHelmet, bikeCoverage };
}

function matchConfidence(
  colourKeys: string[],
  metro: FilmCandidate[],
  frog: FilmCandidate[]
): QuoteEstimateResult["matchConfidence"] {
  const best = Math.max(
    metro[0]?.score ?? 0,
    frog[0]?.score ?? 0
  );
  if (!metro.length && !frog.length) return "none";
  if (!colourKeys.length) return best >= 40 ? "medium" : "low";
  if (best >= 70) return "high";
  if (best >= 40) return "medium";
  return "low";
}

export function buildEstimateSheet(
  result: Omit<QuoteEstimateResult, "sheet"> & { input: QuoteEstimateInput }
): string {
  const bikeBits = [
    result.input.bike_year,
    result.input.bike_make,
    result.input.bike_model,
  ]
    .map((v) => text(v, 80))
    .filter(Boolean)
    .join(" ");
  const style = text(result.input.bike_style, 40);
  const helmetBits = [result.input.helmet_brand, result.input.helmet_model]
    .map((v) => text(v, 80))
    .filter(Boolean)
    .join(" ");
  const item = text(result.input.item_type, 40) || "Bike";
  const rollLabel = `${QUOTE_INTERNAL.rollWidthFt}×${QUOTE_INTERNAL.rollLengthFt}`;

  const lines: string[] = [
    "INTERNAL QUOTE SHEET — not shown to customer",
    `${item}: ${bikeBits || "—"}${style ? ` (${style})` : ""}${
      helmetBits ? ` | Helmet: ${helmetBits}` : ""
    } | Finish: ${text(result.input.finish, 60) || "—"} | Colour: ${
      text(result.input.desired_colour, 80) || "—"
    }`,
    `Coverage: ${result.coverage} | Body class: ${result.bodyClass} | Base feet: ${result.baseFeet} | Waste ${Math.round(
      result.wasteFactor * 100
    )}%: ${result.feetWithWaste} ft | Rolls: ${result.rolls} × ${rollLabel}`,
    "",
    "METRO candidates:",
  ];

  if (!result.metro.length) {
    lines.push("- (no match)");
  } else {
    for (const c of result.metro) {
      const price = c.rollPriceUsd != null ? moneyExact(c.rollPriceUsd) : "price n/a";
      lines.push(`- ${c.name} — ${price} / roll  ${c.url}`);
    }
  }

  lines.push("VINYL FROG candidates:");
  if (!result.vinylFrog.length) {
    lines.push("- (no match)");
  } else {
    for (const c of result.vinylFrog) {
      const price = c.rollPriceUsd != null ? moneyExact(c.rollPriceUsd) : "price n/a";
      lines.push(`- ${c.name} — ${price} / roll  ${c.url}`);
    }
  }

  lines.push(
    "",
    `Best material buy: ${result.bestVendor} @ ${moneyExact(result.bestRollPriceUsd)} × ${result.rolls} roll${
      result.rolls === 1 ? "" : "s"
    } = ${moneyExact(result.materialCostUsd)}`,
    "",
    `Labour: ${money(result.labourUsd)}`,
    `Material cost: ${moneyExact(result.materialCostUsd)}`,
    `Vinyl sell (×${QUOTE_INTERNAL.vinylMarkup}): ${moneyExact(result.vinylSellUsd)}  → markup profit ${moneyExact(
      result.markupProfitUsd
    )}`,
    `Suggested customer range: ${money(result.suggestedLowUsd)}–${money(result.suggestedHighUsd)} (mid ${money(
      result.suggestedMidUsd
    )})`,
    `Cash after materials at mid: ${money(result.cashAfterMaterialsUsd)}`,
    `Notes: colour match confidence ${result.matchConfidence} — verify swatch before locking price`
  );

  return lines.join("\n");
}

export async function estimateQuote(
  input: QuoteEstimateInput,
  env: { DB?: D1Database; ASSETS: AssetsFetcher },
  request: Request
): Promise<QuoteEstimateResult> {
  const itemType = text(input.item_type, 40);
  const services = servicesList(input.services);
  const bikeStyle = text(input.bike_style, 40);
  const finish = text(input.finish, 60);
  const desiredColour = text(input.desired_colour, 120);
  const description = text(input.description, 400);

  const coverage = resolveCoverage(itemType, services);
  const bodyClass =
    QUOTE_INTERNAL.styleToBodyClass[bikeStyle] ||
    QUOTE_INTERNAL.styleToBodyClass[""] ||
    "unknown";

  let baseFeet = 0;
  if (coverage.wantsBike) {
    if (coverage.bikeCoverage === "accent") baseFeet += ACCENT_FEET;
    else baseFeet += FULL_FEET_BY_BODY[bodyClass] ?? FULL_FEET_BY_BODY.unknown;
  }
  if (coverage.wantsHelmet) baseFeet += HELMET_FEET;
  if (!baseFeet) baseFeet = FULL_FEET_BY_BODY.unknown;

  const wasteFactor = QUOTE_INTERNAL.wasteFactor;
  const feetWithWaste = roundMoney(baseFeet * (1 + wasteFactor));
  const rolls = rollsForFeet(feetWithWaste, QUOTE_INTERNAL.rollLengthFt);

  const finishKeys = finishAliases(finish);
  const colourKeys = colourTokens(desiredColour, description);

  const [metroColors, frogColors, priceMap] = await Promise.all([
    loadCatalog(env.ASSETS, request, "/data/vinyl-colors.json"),
    loadCatalog(env.ASSETS, request, "/data/vinylfrog-colors.json"),
    loadD1PriceMap(env.DB),
  ]);

  let metro = pickCandidates(
    "Metro",
    metroColors,
    finishKeys,
    colourKeys,
    priceMap,
    QUOTE_INTERNAL.candidatesPerVendor
  );
  let vinylFrog = pickCandidates(
    "Vinyl Frog",
    frogColors,
    finishKeys,
    colourKeys,
    priceMap,
    QUOTE_INTERNAL.candidatesPerVendor
  );

  // Live-fetch missing Metro prices for the shortlist (Vinyl Frog JSON already has p).
  metro = await Promise.all(
    metro.map(async (c) => {
      if (c.rollPriceUsd != null) return c;
      const live = await fetchShopifyRollPrice("https://metrorestyling.com", c.handle);
      return { ...c, rollPriceUsd: live };
    })
  );
  vinylFrog = await Promise.all(
    vinylFrog.map(async (c) => {
      if (c.rollPriceUsd != null) return c;
      const live = await fetchShopifyRollPrice("https://www.vinylfrog.com", c.handle);
      return { ...c, rollPriceUsd: live };
    })
  );

  const priced = [...metro, ...vinylFrog].filter(
    (c) => c.rollPriceUsd != null && c.rollPriceUsd > 0
  ) as Array<FilmCandidate & { rollPriceUsd: number }>;

  let bestVendor = "Fallback (config)";
  let bestRollPriceUsd = QUOTE_INTERNAL.fallbackRollCostUsd;
  if (priced.length) {
    priced.sort((a, b) => a.rollPriceUsd - b.rollPriceUsd);
    bestVendor = priced[0].vendor;
    bestRollPriceUsd = priced[0].rollPriceUsd;
  }

  const materialCostUsd = roundMoney(bestRollPriceUsd * rolls);
  const vinylSellUsd = sellFromCost(materialCostUsd, QUOTE_INTERNAL.vinylMarkup);
  const markupProfitUsd = roundMoney(vinylSellUsd - materialCostUsd);

  let labourUsd = 0;
  if (coverage.wantsBike) {
    const diff = clampDifficulty(
      QUOTE_INTERNAL.styleToDifficulty[bikeStyle] ?? 3
    );
    const table =
      MOTORCYCLE_LABOUR[coverage.bikeCoverage === "accent" ? "accent" : "full"];
    labourUsd += table[diff] ?? table[3];
  }
  if (coverage.wantsHelmet) {
    const hDiff = clampDifficulty(
      filmDifficultyFromFinish(finish) ||
        FILM_DIFFICULTY.Gloss ||
        2
    );
    labourUsd += HELMET_LABOUR[hDiff] ?? HELMET_LABOUR[3];
  }
  labourUsd = roundMoney(labourUsd);

  const suggestedMidUsd = roundMoney(labourUsd + vinylSellUsd);
  const floor = roundMoney(labourUsd + materialCostUsd);
  let suggestedLowUsd = roundMoney(suggestedMidUsd * QUOTE_INTERNAL.rangePadLow);
  let suggestedHighUsd = roundMoney(suggestedMidUsd * QUOTE_INTERNAL.rangePadHigh);
  if (suggestedLowUsd < floor) suggestedLowUsd = floor;
  if (suggestedHighUsd < suggestedLowUsd) suggestedHighUsd = suggestedLowUsd;

  const cashAfterMaterialsUsd = roundMoney(suggestedMidUsd - materialCostUsd);
  const confidence = matchConfidence(colourKeys, metro, vinylFrog);

  const core = {
    coverage: coverage.label,
    bodyClass,
    baseFeet,
    wasteFactor,
    feetWithWaste,
    rolls,
    metro,
    vinylFrog,
    bestVendor,
    bestRollPriceUsd,
    materialCostUsd,
    labourUsd,
    vinylSellUsd,
    markupProfitUsd,
    suggestedLowUsd,
    suggestedMidUsd,
    suggestedHighUsd,
    cashAfterMaterialsUsd,
    matchConfidence: confidence,
  };

  const sheet = buildEstimateSheet({
    ...core,
    input: {
      item_type: itemType,
      bike_year: text(input.bike_year, 8),
      bike_make: text(input.bike_make, 80),
      bike_model: text(input.bike_model, 80),
      bike_style: bikeStyle,
      helmet_brand: text(input.helmet_brand, 80),
      helmet_model: text(input.helmet_model, 80),
      finish,
      desired_colour: desiredColour,
    },
  });

  return { ...core, sheet };
}

export async function handleQuoteEstimate(
  request: Request,
  env: { DB?: D1Database; ASSETS: AssetsFetcher }
): Promise<Response> {
  let body: QuoteEstimateInput;
  try {
    body = (await request.json()) as QuoteEstimateInput;
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Expected a JSON body." }, 400);
  }

  try {
    const result = await estimateQuote(body, env, request);
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("quote estimate failed", String(err));
    return json({ error: "Estimate failed." }, 500);
  }
}
