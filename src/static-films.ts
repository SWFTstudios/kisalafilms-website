/**
 * Static Metro catalogue fallback when D1 `films` is empty.
 * Reads /data/vinyl-colors.json from Workers Static Assets.
 */

import { VINYL_MARKUP, sellFromCost } from "./project-quote";
import type { FilmRow } from "./films";

type MetroColor = {
  h?: string;
  n?: string;
  v?: string;
  t?: string;
  f?: string;
  c?: string;
  i?: string;
  u?: string;
  a?: boolean;
  collection?: string;
};

type MetroCatalog = {
  colors?: MetroColor[];
  finishes?: string[];
  vendors?: string[];
  colorFamilies?: string[];
};

export type AssetsFetcher = {
  fetch: (request: Request) => Promise<Response>;
};

function skuFromTitle(title: string): string {
  const parts = title.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return "";
  return parts[1].split(/\s+/)[0] || "";
}

function displayName(title: string): string {
  const raw = (title || "").trim();
  if (!raw) return "";
  return raw.split("|")[0].trim() || raw;
}

export function metroColorToFilm(c: MetroColor): FilmRow | null {
  const handle = String(c.h || "").trim();
  if (!handle) return null;
  const title = c.n || "";
  return {
    handle,
    sku: skuFromTitle(title),
    name: displayName(title),
    brand: c.v || "",
    finish: c.f || "",
    color_family: c.c || "",
    product_type: c.t || "",
    collection: c.collection || "",
    image_url: c.i || "",
    metro_url: c.u || `https://metrorestyling.com/products/${handle}`,
    in_stock: !!c.a,
    description: "",
    install_notes: "",
    recommended_for: "",
    notes: "",
    price_usd: null,
    roll_price_usd: null,
    sell_price_usd: null,
    vinyl_markup: VINYL_MARKUP,
    price_synced_at: "",
    updated_at: "",
  };
}

let cached: { at: number; films: FilmRow[]; meta: MetroCatalog } | null = null;
const CACHE_MS = 60_000;

export async function loadStaticFilms(
  assets: AssetsFetcher,
  request: Request
): Promise<{ films: FilmRow[]; finishes: string[]; brands: string[]; colorFamilies: string[] }> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return {
      films: cached.films,
      finishes: cached.meta.finishes || [],
      brands: cached.meta.vendors || [],
      colorFamilies: cached.meta.colorFamilies || [],
    };
  }

  const url = new URL("/data/vinyl-colors.json", request.url);
  const res = await assets.fetch(new Request(url.toString(), { method: "GET" }));
  if (!res.ok) {
    return { films: [], finishes: [], brands: [], colorFamilies: [] };
  }
  const data = (await res.json()) as MetroCatalog;
  const films: FilmRow[] = [];
  for (const c of data.colors || []) {
    const row = metroColorToFilm(c);
    if (row) films.push(row);
  }
  cached = { at: now, films, meta: data };
  return {
    films,
    finishes: data.finishes || [],
    brands: data.vendors || [],
    colorFamilies: data.colorFamilies || [],
  };
}

export function findStaticFilm(
  films: FilmRow[],
  handle: string
): FilmRow | null {
  const h = handle.trim().toLowerCase();
  return films.find((f) => f.handle.toLowerCase() === h) || null;
}

/** Apply markup when a cost is known (no-op if already set). */
export function withSellPrice(film: FilmRow, cost: number | null): FilmRow {
  if (cost == null || !Number.isFinite(cost) || cost <= 0) return film;
  return {
    ...film,
    price_usd: cost,
    roll_price_usd: cost,
    sell_price_usd: sellFromCost(cost),
  };
}
