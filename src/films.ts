export type FilmRow = {
  handle: string;
  sku: string;
  name: string;
  brand: string;
  finish: string;
  color_family: string;
  image_url: string;
  metro_url: string;
  in_stock: boolean;
  description: string;
  install_notes: string;
  recommended_for: string;
  notes: string;
  updated_at: string;
};

type FilmDbRow = {
  handle: string;
  sku: string | null;
  name: string;
  brand: string | null;
  finish: string | null;
  color_family: string | null;
  image_url: string | null;
  metro_url: string | null;
  in_stock: number;
  description: string | null;
  install_notes: string | null;
  recommended_for: string | null;
  notes: string | null;
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

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function mapFilm(row: FilmDbRow): FilmRow {
  return {
    handle: row.handle,
    sku: row.sku || "",
    name: row.name,
    brand: row.brand || "",
    finish: row.finish || "",
    color_family: row.color_family || "",
    image_url: row.image_url || "",
    metro_url: row.metro_url || "",
    in_stock: !!row.in_stock,
    description: row.description || "",
    install_notes: row.install_notes || "",
    recommended_for: row.recommended_for || "",
    notes: row.notes || "",
    updated_at: row.updated_at,
  };
}

function normalizeIncoming(raw: Record<string, unknown>): FilmRow | null {
  const handle = String(raw.handle || "").trim();
  const name = String(raw.name || "").trim();
  if (!handle || !name) return null;
  return {
    handle,
    sku: String(raw.sku || "").trim(),
    name,
    brand: String(raw.brand || "").trim(),
    finish: String(raw.finish || "").trim(),
    color_family: String(raw.color_family || "").trim(),
    image_url: String(raw.image_url || "").trim(),
    metro_url: String(raw.metro_url || "").trim(),
    in_stock: Boolean(raw.in_stock),
    description: String(raw.description || "").trim(),
    install_notes: String(raw.install_notes || "").trim(),
    recommended_for: String(raw.recommended_for || "").trim(),
    notes: String(raw.notes || "").trim(),
    updated_at: new Date().toISOString(),
  };
}

export async function listFilms(
  db: D1Database,
  url: URL
): Promise<Response> {
  const finish = (url.searchParams.get("finish") || "").trim();
  const stock = (url.searchParams.get("stock") || "all").trim().toLowerCase();
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
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
  if (stock === "in") {
    where.push("in_stock = 1");
  } else if (stock === "out") {
    where.push("in_stock = 0");
  }
  if (q) {
    where.push(
      "(LOWER(name) LIKE ? OR LOWER(brand) LIKE ? OR LOWER(finish) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(handle) LIKE ?)"
    );
    const like = `%${q}%`;
    binds.push(like, like, like, like, like);
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

  const films = (rows.results || []).map(mapFilm);
  const finishes = await db
    .prepare(
      `SELECT DISTINCT finish FROM films WHERE finish IS NOT NULL AND finish != '' ORDER BY finish COLLATE NOCASE`
    )
    .all<{ finish: string }>();

  return json(
    {
      source: "d1",
      total: countRow?.n ?? films.length,
      count: films.length,
      limit,
      offset,
      finishes: (finishes.results || []).map((r) => r.finish),
      films,
    },
    200,
    { "Cache-Control": "public, max-age=60" }
  );
}

export async function getFilm(
  db: D1Database,
  handle: string
): Promise<Response> {
  const row = await db
    .prepare(`SELECT * FROM films WHERE handle = ?`)
    .bind(handle)
    .first<FilmDbRow>();

  if (!row) {
    return json({ error: "Film not found.", handle }, 404);
  }

  return json(
    { source: "d1", film: mapFilm(row) },
    200,
    { "Cache-Control": "public, max-age=60" }
  );
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
      `SELECT handle, description, install_notes, recommended_for, notes FROM films`
    )
    .all<{
      handle: string;
      description: string | null;
      install_notes: string | null;
      recommended_for: string | null;
      notes: string | null;
    }>();

  const keep = new Map(
    (existing.results || []).map((r) => [
      r.handle,
      {
        description: r.description || "",
        install_notes: r.install_notes || "",
        recommended_for: r.recommended_for || "",
        notes: r.notes || "",
      },
    ])
  );

  const stmt = db.prepare(
    `INSERT INTO films (
      handle, sku, name, brand, finish, color_family, image_url, metro_url,
      in_stock, description, install_notes, recommended_for, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(handle) DO UPDATE SET
      sku = excluded.sku,
      name = excluded.name,
      brand = excluded.brand,
      finish = excluded.finish,
      color_family = excluded.color_family,
      image_url = excluded.image_url,
      metro_url = excluded.metro_url,
      in_stock = excluded.in_stock,
      description = excluded.description,
      install_notes = excluded.install_notes,
      recommended_for = excluded.recommended_for,
      notes = excluded.notes,
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
        film.image_url,
        film.metro_url,
        film.in_stock ? 1 : 0,
        description,
        install_notes,
        recommended_for,
        notes,
        film.updated_at
      )
    );
  }

  // D1 batch limit ~1000 statements; chunk
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
