/**
 * Sync Vinyl Frog roll prices into D1 for films with source = 'vinylfrog'.
 * Patterned on metro-prices.ts; uses each product's Shopify *.js endpoint.
 */

import { updateFilmPrices, type D1Database } from "./films";

const VINYLFROG = "https://www.vinylfrog.com";
const CONCURRENCY = 4;
const BATCH_PAUSE_MS = 400;

type ShopifyProductJs = {
  price?: number | string;
  price_min?: number | string;
  variants?: Array<{ price?: number | string }>;
};

function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  // Vinyl Frog *.js often returns cents as integer.
  if (Number.isInteger(n) && n >= 1000) return Math.round(n) / 100;
  return Math.round(n * 100) / 100;
}

async function fetchVinylFrogPrice(handle: string): Promise<number | null> {
  const url = `${VINYLFROG}/products/${encodeURIComponent(handle)}.js`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "KisalaFilmsVinylFrogPriceSync/1.0 (+https://kisalafilms-website.elombe.workers.dev)",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Vinyl Frog ${res.status} for ${handle}`);
  const data = (await res.json()) as ShopifyProductJs;
  return (
    parsePrice(data.variants?.[0]?.price) ??
    parsePrice(data.price) ??
    parsePrice(data.price_min)
  );
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return out;
}

export async function listVinylFrogHandles(db: D1Database): Promise<string[]> {
  try {
    const rows = await db
      .prepare(
        `SELECT handle FROM films
         WHERE lower(coalesce(source, '')) = 'vinylfrog'
         ORDER BY handle ASC`
      )
      .all<{ handle: string }>();
    return (rows.results || []).map((r) => r.handle);
  } catch {
    // source column may not exist yet on older DBs
    return [];
  }
}

export async function syncVinylFrogPrices(db: D1Database): Promise<{
  checked: number;
  updated: number;
  failed: number;
  skipped: number;
}> {
  const handles = await listVinylFrogHandles(db);
  const syncedAt = new Date().toISOString();
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const pending: Array<{
    handle: string;
    price_usd: number;
    roll_price_usd: number;
    price_synced_at: string;
  }> = [];

  const CHUNK = 40;
  for (let start = 0; start < handles.length; start += CHUNK) {
    const slice = handles.slice(start, start + CHUNK);
    const results = await mapPool(slice, CONCURRENCY, async (handle) => {
      try {
        const price = await fetchVinylFrogPrice(handle);
        if (price === null) return { handle, ok: false as const, skip: true };
        return { handle, ok: true as const, price };
      } catch (err) {
        console.error("vinylfrog price fail", handle, String(err));
        return { handle, ok: false as const, skip: false };
      }
    });

    for (const r of results) {
      if (r.ok) {
        pending.push({
          handle: r.handle,
          price_usd: r.price,
          roll_price_usd: r.price,
          price_synced_at: syncedAt,
        });
      } else if (r.skip) {
        skipped += 1;
      } else {
        failed += 1;
      }
    }

    if (pending.length >= 100) {
      updated += await updateFilmPrices(db, pending.splice(0, pending.length));
    }
    if (start + CHUNK < handles.length) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  if (pending.length) {
    updated += await updateFilmPrices(db, pending);
  }

  return { checked: handles.length, updated, failed, skipped };
}
