import { VINYL_MARKUP, sellFromCost } from "./project-quote";

export type FilmRow = {
  handle: string;
  sku: string;
  name: string;
  brand: string;
  finish: string;
  color_family: string;
  product_type: string;
  collection: string;
  image_url: string;
  metro_url: string;
  in_stock: boolean;
  description: string;
  install_notes: string;
  recommended_for: string;
  notes: string;
  /** Metro landed cost when founder pricing is active; otherwise null. */
  price_usd: number | null;
  /** Metro roll cost when founder pricing is active; otherwise null. */
  roll_price_usd: number | null;
  /** Always public: Metro cost × vinyl markup (1.4). */
  sell_price_usd: number | null;
  vinyl_markup: number;
  price_synced_at: string;
  updated_at: string;
};

type FilmDbRow = {
  handle: string;
  sku: string | null;
  name: string;
  brand: string | null;
  finish: string | null;
  color_family: string | null;
  product_type: string | null;
  collection: string | null;
  image_url: string | null;
  metro_url: string | null;
  in_stock: number;
  description: string | null;
  install_notes: string | null;
  recommended_for: string | null;
  notes: string | null;
  price_usd: number | null;
  roll_price_usd: number | null;
  price_synced_at: string | null;
  updated_at: string;
};

export type D1Database = {
  prepare: (query: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<unknown[]>;
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  run: () => Promise<unknown>;
};

export type FounderPricing = {
  founderPricingActive: boolean;
  founderSlotsRemaining: number;
  completedOrders: number;
  founderLimit: number;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function mapFilm(row: FilmDbRow, showCostPrices: boolean): FilmRow {
  const cost = row.roll_price_usd ?? row.price_usd;
  const sell =
    cost !== null && cost !== undefined && Number.isFinite(Number(cost))
      ? sellFromCost(Number(cost))
      : null;
  return {
    handle: row.handle,
    sku: row.sku || "",
    name: row.name,
    brand: row.brand || "",
    finish: row.finish || "",
    color_family: row.color_family || "",
    product_type: row.product_type || "",
    collection: row.collection || "",
    image_url: row.image_url || "",
    metro_url: row.metro_url || "",
    in_stock: !!row.in_stock,
    description: row.description || "",
    install_notes: row.install_notes || "",
    recommended_for: row.recommended_for || "",
    notes: row.notes || "",
    price_usd: showCostPrices ? row.price_usd : null,
    roll_price_usd: showCostPrices ? row.roll_price_usd : null,
    sell_price_usd: sell,
    vinyl_markup: VINYL_MARKUP,
    price_synced_at: row.price_synced_at || "",
    updated_at: row.updated_at,
  };
}

/** Internal: raw D1 row for checkout (includes Metro cost). */
export async function getFilmCostRow(
  db: D1Database,
  handle: string
): Promise<FilmDbRow | null> {
  return db
    .prepare(`SELECT * FROM films WHERE handle = ?`)
    .bind(handle)
    .first<FilmDbRow>();
}

function normalizeIncoming(raw: Record<string, unknown>): FilmRow | null {
  const handle = String(raw.handle || "").trim();
  const name = String(raw.name || "").trim();
  if (!handle || !name) return null;
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    handle,
    sku: String(raw.sku || "").trim(),
    name,
    brand: String(raw.brand || "").trim(),
    finish: String(raw.finish || "").trim(),
    color_family: String(raw.color_family || "").trim(),
    product_type: String(raw.product_type || raw.t || "").trim(),
    collection: String(raw.collection || "").trim(),
    image_url: String(raw.image_url || "").trim(),
    metro_url: String(raw.metro_url || "").trim(),
    in_stock: Boolean(raw.in_stock),
    description: String(raw.description || "").trim(),
    install_notes: String(raw.install_notes || "").trim(),
    recommended_for: String(raw.recommended_for || "").trim(),
    notes: String(raw.notes || "").trim(),
    price_usd: toNum(raw.price_usd),
    roll_price_usd: toNum(raw.roll_price_usd),
    sell_price_usd: null,
    vinyl_markup: VINYL_MARKUP,
    price_synced_at: String(raw.price_synced_at || "").trim(),
    updated_at: new Date().toISOString(),
  };
}

export async function getFounderPricing(db: D1Database): Promise<FounderPricing> {
  const rows = await db
    .prepare(
      `SELECT key, value FROM site_meta WHERE key IN ('completed_orders', 'founder_limit')`
    )
    .all<{ key: string; value: string }>();
  const map = new Map((rows.results || []).map((r) => [r.key, r.value]));
  const completedOrders = Math.max(
    0,
    Number(map.get("completed_orders") || "0") || 0
  );
  const founderLimit = Math.max(1, Number(map.get("founder_limit") || "5") || 5);
  const remaining = Math.max(0, founderLimit - completedOrders);
  return {
    completedOrders,
    founderLimit,
    founderSlotsRemaining: remaining,
    founderPricingActive: completedOrders < founderLimit,
  };
}

export async function setCompletedOrders(
  db: D1Database,
  n: number
): Promise<FounderPricing> {
  const value = String(Math.max(0, Math.floor(n)));
  await db
    .prepare(
      `INSERT INTO site_meta (key, value) VALUES ('completed_orders', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .bind(value)
    .run();
  return getFounderPricing(db);
}

export async function incrementCompletedOrders(
  db: D1Database
): Promise<FounderPricing> {
  const current = await getFounderPricing(db);
  return setCompletedOrders(db, current.completedOrders + 1);
}

export async function listFilms(db: D1Database, url: URL): Promise<Response> {
  const finish = (url.searchParams.get("finish") || "").trim();
  const stock = (url.searchParams.get("stock") || "all").trim().toLowerCase();
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const productType = (url.searchParams.get("type") || "").trim();
  const collection = (url.searchParams.get("collection") || "").trim();
  const brand = (url.searchParams.get("brand") || "").trim();
  const colorFamily = (url.searchParams.get("family") || "").trim();
  const limit = Math.min(
    2000,
    Math.max(1, Number(url.searchParams.get("limit") || "2000") || 2000)
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") || "0") || 0);

  const where: string[] = [];
  const binds: unknown[] = [];

  if (finish && finish !== "all") {
    where.push("LOWER(finish) = ?");
    binds.push(finish.toLowerCase());
  }
  if (productType && productType !== "all") {
    where.push("LOWER(product_type) = ?");
    binds.push(productType.toLowerCase());
  }
  if (collection && collection !== "all") {
    where.push("LOWER(collection) = ?");
    binds.push(collection.toLowerCase());
  }
  if (brand && brand !== "all") {
    where.push("LOWER(brand) = ?");
    binds.push(brand.toLowerCase());
  }
  if (colorFamily && colorFamily !== "all") {
    where.push("LOWER(color_family) = ?");
    binds.push(colorFamily.toLowerCase());
  }
  if (stock === "in") {
    where.push("in_stock = 1");
  } else if (stock === "out") {
    where.push("in_stock = 0");
  }
  if (q) {
    where.push(
      "(LOWER(name) LIKE ? OR LOWER(brand) LIKE ? OR LOWER(finish) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(handle) LIKE ? OR LOWER(color_family) LIKE ? OR LOWER(product_type) LIKE ?)"
    );
    const like = `%${q}%`;
    binds.push(like, like, like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM films ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();

  const rows = await db
    .prepare(
      `SELECT * FROM films ${whereSql} ORDER BY LOWER(name) ASC, handle ASC LIMIT ? OFFSET ?`
    )
    .bind(...binds, limit, offset)
    .all<FilmDbRow>();

  const founder = await getFounderPricing(db);
  const showCostPrices = founder.founderPricingActive;
  const films = (rows.results || []).map((r) => mapFilm(r, showCostPrices));

  const [finishes, types, brands, families, collections] = await Promise.all([
    db
      .prepare(
        `SELECT DISTINCT finish FROM films WHERE finish IS NOT NULL AND finish != '' ORDER BY finish COLLATE NOCASE`
      )
      .all<{ finish: string }>(),
    db
      .prepare(
        `SELECT DISTINCT product_type FROM films WHERE product_type IS NOT NULL AND product_type != '' ORDER BY product_type COLLATE NOCASE`
      )
      .all<{ product_type: string }>(),
    db
      .prepare(
        `SELECT DISTINCT brand FROM films WHERE brand IS NOT NULL AND brand != '' ORDER BY brand COLLATE NOCASE`
      )
      .all<{ brand: string }>(),
    db
      .prepare(
        `SELECT DISTINCT color_family FROM films WHERE color_family IS NOT NULL AND color_family != '' ORDER BY color_family COLLATE NOCASE`
      )
      .all<{ color_family: string }>(),
    db
      .prepare(
        `SELECT DISTINCT collection FROM films WHERE collection IS NOT NULL AND collection != '' ORDER BY collection COLLATE NOCASE`
      )
      .all<{ collection: string }>(),
  ]);

  return json(
    {
      source: "d1",
      total: countRow?.n ?? films.length,
      count: films.length,
      limit,
      offset,
      finishes: (finishes.results || []).map((r) => r.finish),
      productTypes: (types.results || []).map((r) => r.product_type),
      brands: (brands.results || []).map((r) => r.brand),
      colorFamilies: (families.results || []).map((r) => r.color_family),
      collections: (collections.results || []).map((r) => r.collection),
      ...founder,
      films,
    },
    200,
    { "Cache-Control": "public, max-age=60" }
  );
}

export async function getFilm(db: D1Database, handle: string): Promise<Response> {
  const row = await db
    .prepare(`SELECT * FROM films WHERE handle = ?`)
    .bind(handle)
    .first<FilmDbRow>();

  if (!row) {
    return json({ error: "Film not found.", handle }, 404);
  }

  const founder = await getFounderPricing(db);
  return json(
    {
      source: "d1",
      ...founder,
      film: mapFilm(row, founder.founderPricingActive),
    },
    200,
    { "Cache-Control": "public, max-age=60" }
  );
}

export async function pricingCsv(db: D1Database): Promise<Response> {
  const rows = await db
    .prepare(
      `SELECT handle, sku, name, brand, finish, product_type, collection, metro_url,
              price_usd, roll_price_usd, price_synced_at, in_stock
       FROM films ORDER BY LOWER(name) ASC`
    )
    .all<FilmDbRow>();

  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header =
    "handle,sku,name,brand,finish,product_type,collection,metro_url,price_usd,roll_price_usd,price_synced_at,in_stock";
  const lines = [header];
  for (const r of rows.results || []) {
    lines.push(
      [
        r.handle,
        r.sku,
        r.name,
        r.brand,
        r.finish,
        r.product_type,
        r.collection,
        r.metro_url,
        r.price_usd,
        r.roll_price_usd,
        r.price_synced_at,
        r.in_stock ? "1" : "0",
      ]
        .map(esc)
        .join(",")
    );
  }

  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vinyl-pricing.csv"',
      "Cache-Control": "public, max-age=60",
    },
  });
}

export async function importFilms(
  request: Request,
  db: D1Database,
  token: string | undefined
): Promise<Response> {
  const auth = request.headers.get("Authorization") || "";
  const expected = token ? `Bearer ${token}` : "";
  if (!token || auth !== expected) {
    return json({ error: "Unauthorized." }, 401);
  }

  let body: { films?: unknown[]; mode?: string };
  try {
    body = (await request.json()) as { films?: unknown[]; mode?: string };
  } catch {
    return json({ error: "Expected JSON body with films[]." }, 400);
  }

  const incoming = Array.isArray(body.films) ? body.films : [];
  if (!incoming.length) {
    return json({ error: "films[] must be a non-empty array." }, 400);
  }
  if (incoming.length > 5000) {
    return json({ error: "Batch too large (max 5000)." }, 400);
  }

  const normalized: FilmRow[] = [];
  for (const item of incoming) {
    if (!item || typeof item !== "object") continue;
    const row = normalizeIncoming(item as Record<string, unknown>);
    if (row) normalized.push(row);
  }
  if (!normalized.length) {
    return json({ error: "No valid film rows (need handle + name)." }, 400);
  }

  const existing = await db
    .prepare(
      `SELECT handle, description, install_notes, recommended_for, notes,
              price_usd, roll_price_usd, price_synced_at
       FROM films`
    )
    .all<{
      handle: string;
      description: string | null;
      install_notes: string | null;
      recommended_for: string | null;
      notes: string | null;
      price_usd: number | null;
      roll_price_usd: number | null;
      price_synced_at: string | null;
    }>();

  const keep = new Map(
    (existing.results || []).map((r) => [
      r.handle,
      {
        description: r.description || "",
        install_notes: r.install_notes || "",
        recommended_for: r.recommended_for || "",
        notes: r.notes || "",
        price_usd: r.price_usd,
        roll_price_usd: r.roll_price_usd,
        price_synced_at: r.price_synced_at || "",
      },
    ])
  );

  const stmt = db.prepare(
    `INSERT INTO films (
      handle, sku, name, brand, finish, color_family, product_type, collection,
      image_url, metro_url, in_stock, description, install_notes, recommended_for,
      notes, price_usd, roll_price_usd, price_synced_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(handle) DO UPDATE SET
      sku = excluded.sku,
      name = excluded.name,
      brand = excluded.brand,
      finish = excluded.finish,
      color_family = excluded.color_family,
      product_type = excluded.product_type,
      collection = excluded.collection,
      image_url = excluded.image_url,
      metro_url = excluded.metro_url,
      in_stock = excluded.in_stock,
      description = excluded.description,
      install_notes = excluded.install_notes,
      recommended_for = excluded.recommended_for,
      notes = excluded.notes,
      price_usd = COALESCE(excluded.price_usd, films.price_usd),
      roll_price_usd = COALESCE(excluded.roll_price_usd, films.roll_price_usd),
      price_synced_at = CASE
        WHEN excluded.price_usd IS NOT NULL THEN excluded.price_synced_at
        ELSE films.price_synced_at
      END,
      updated_at = excluded.updated_at`
  );

  const batch: D1PreparedStatement[] = [];
  for (const film of normalized) {
    const prev = keep.get(film.handle);
    const description = film.description || prev?.description || "";
    const install_notes = film.install_notes || prev?.install_notes || "";
    const recommended_for = film.recommended_for || prev?.recommended_for || "";
    const notes = film.notes || prev?.notes || "";

    batch.push(
      stmt.bind(
        film.handle,
        film.sku,
        film.name,
        film.brand,
        film.finish,
        film.color_family,
        film.product_type,
        film.collection,
        film.image_url,
        film.metro_url,
        film.in_stock ? 1 : 0,
        description,
        install_notes,
        recommended_for,
        notes,
        film.price_usd,
        film.roll_price_usd,
        film.price_synced_at || null,
        film.updated_at
      )
    );
  }

  const CHUNK = 200;
  for (let i = 0; i < batch.length; i += CHUNK) {
    await db.batch(batch.slice(i, i + CHUNK));
  }

  return json({
    ok: true,
    upserted: normalized.length,
    mode: body.mode || "upsert",
  });
}

export async function updateFilmPrices(
  db: D1Database,
  updates: Array<{
    handle: string;
    price_usd: number;
    roll_price_usd: number;
    price_synced_at: string;
  }>
): Promise<number> {
  if (!updates.length) return 0;
  const stmt = db.prepare(
    `UPDATE films SET price_usd = ?, roll_price_usd = ?, price_synced_at = ?
     WHERE handle = ?`
  );
  const batch: D1PreparedStatement[] = updates.map((u) =>
    stmt.bind(u.price_usd, u.roll_price_usd, u.price_synced_at, u.handle)
  );
  const CHUNK = 200;
  for (let i = 0; i < batch.length; i += CHUNK) {
    await db.batch(batch.slice(i, i + CHUNK));
  }
  return updates.length;
}

export async function listFilmHandles(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(`SELECT handle FROM films ORDER BY handle ASC`)
    .all<{ handle: string }>();
  return (rows.results || []).map((r) => r.handle);
}
