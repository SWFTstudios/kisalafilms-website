import {
  listFilmHandles,
  updateFilmPrices,
  type D1Database,
} from "./films";

const METRO = "https://metrorestyling.com";
const CONCURRENCY = 4;
const BATCH_PAUSE_MS = 400;

type ShopifyProductJs = {
  id?: number;
  title?: string;
  handle?: string;
  price?: number | string;
  price_min?: number | string;
  variants?: Array<{ price?: number | string; available?: boolean }>;
};

function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  // Shopify *.js often returns cents as integer (e.g. 44999) or dollars as string.
  if (Number.isInteger(n) && n >= 1000) return Math.round(n) / 100;
  return Math.round(n * 100) / 100;
}

async function fetchMetroPrice(handle: string): Promise<number | null> {
  const url = `${METRO}/products/${encodeURIComponent(handle)}.js`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "KisalaFilmsPriceSync/1.0 (+https://kisalafilms-website.elombe.workers.dev)",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Metro ${res.status} for ${handle}`);
  const data = (await res.json()) as ShopifyProductJs;
  const fromVariant = data.variants?.[0]?.price;
  return (
    parsePrice(fromVariant) ??
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
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return out;
}

export async function syncMetroPrices(db: D1Database): Promise<{
  checked: number;
  updated: number;
  failed: number;
  skipped: number;
}> {
  const handles = await listFilmHandles(db);
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

  // Process in chunks to avoid overwhelming Metro / Worker CPU time.
  const CHUNK = 40;
  for (let start = 0; start < handles.length; start += CHUNK) {
    const slice = handles.slice(start, start + CHUNK);
    const results = await mapPool(slice, CONCURRENCY, async (handle) => {
      try {
        const price = await fetchMetroPrice(handle);
        if (price === null) return { handle, ok: false as const, skip: true };
        return { handle, ok: true as const, price };
      } catch (err) {
        console.error("metro price fail", handle, String(err));
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
