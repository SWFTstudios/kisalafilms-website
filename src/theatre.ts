import type { D1Database } from "./films";

export type TheatreProject = {
  slug: string;
  name: string;
  itemName: string;
  posterUrl: string | null;
  videoUrl: string | null;
  summary: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type TheatreRow = {
  slug: string;
  name: string;
  item_name: string;
  poster_url: string | null;
  video_url: string | null;
  summary: string | null;
  sort_order: number;
  published: number;
  created_at: string;
  updated_at: string;
};

const CDN = "https://cdn.prod.website-files.com/6abae2f24ed3c58a6fa9d94a/";

export const THEATRE_SEED: Array<{
  slug: string;
  name: string;
  itemName: string;
  posterUrl: string;
  summary: string;
  sortOrder: number;
}> = [
  {
    slug: "cars",
    name: "Cars",
    itemName: "Cars",
    posterUrl: CDN + "6abb48b6e58e443181969d84_theatre-cars.png",
    summary: "Editorial car films and motion.",
    sortOrder: 1,
  },
  {
    slug: "motorcycles",
    name: "Motorcycles",
    itemName: "Motorcycles",
    posterUrl: CDN + "6abb48b71ca558e0aa98819a_theatre-motorcycles.png",
    summary: "Motorcycle and street films.",
    sortOrder: 2,
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    itemName: "Real Estate",
    posterUrl: CDN + "6abb48b843c360ec448b162f_theatre-real-estate.png",
    summary: "Real estate films and walkthroughs.",
    sortOrder: 3,
  },
  {
    slug: "weddings",
    name: "Weddings",
    itemName: "Weddings",
    posterUrl: CDN + "6abb48b854ba684cf486f8a8_theatre-weddings.png",
    summary: "Wedding films and celebrations.",
    sortOrder: 4,
  },
  {
    slug: "personal-training",
    name: "Personal Training",
    itemName: "Personal Training",
    posterUrl: CDN + "6abb48b8b98927e6f45ab8cb_theatre-training.png",
    summary: "Personal training and fitness films.",
    sortOrder: 5,
  },
];

function rowToProject(row: TheatreRow): TheatreProject {
  return {
    slug: row.slug,
    name: row.name,
    itemName: row.item_name,
    posterUrl: row.poster_url,
    videoUrl: row.video_url,
    summary: row.summary,
    sortOrder: row.sort_order,
    published: !!row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTheatreProjects(
  db: D1Database,
  opts?: { includeDrafts?: boolean }
): Promise<TheatreProject[]> {
  const includeDrafts = !!opts?.includeDrafts;
  const sql = includeDrafts
    ? `SELECT * FROM theatre_projects ORDER BY sort_order ASC, name ASC`
    : `SELECT * FROM theatre_projects WHERE published = 1 ORDER BY sort_order ASC, name ASC`;
  const { results } = await db.prepare(sql).all<TheatreRow>();
  return (results || []).map(rowToProject);
}

export async function getTheatreProject(
  db: D1Database,
  slug: string
): Promise<TheatreProject | null> {
  const row = await db
    .prepare(`SELECT * FROM theatre_projects WHERE slug = ?`)
    .bind(slug)
    .first<TheatreRow>();
  return row ? rowToProject(row) : null;
}

export async function upsertTheatreProjects(
  db: D1Database,
  items: Array<{
    slug: string;
    name: string;
    itemName: string;
    posterUrl?: string | null;
    videoUrl?: string | null;
    summary?: string | null;
    sortOrder?: number;
    published?: boolean;
  }>
): Promise<number> {
  let n = 0;
  for (const item of items) {
    await db
      .prepare(
        `INSERT INTO theatre_projects
          (slug, name, item_name, poster_url, video_url, summary, sort_order, published, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name,
           item_name = excluded.item_name,
           poster_url = excluded.poster_url,
           video_url = excluded.video_url,
           summary = excluded.summary,
           sort_order = excluded.sort_order,
           published = excluded.published,
           updated_at = datetime('now')`
      )
      .bind(
        item.slug,
        item.name,
        item.itemName,
        item.posterUrl ?? null,
        item.videoUrl ?? null,
        item.summary ?? null,
        item.sortOrder ?? 0,
        item.published === false ? 0 : 1
      )
      .run();
    n += 1;
  }
  return n;
}

export async function seedTheatreProjects(db: D1Database): Promise<number> {
  return upsertTheatreProjects(
    db,
    THEATRE_SEED.map((s) => ({
      slug: s.slug,
      name: s.name,
      itemName: s.itemName,
      posterUrl: s.posterUrl,
      summary: s.summary,
      sortOrder: s.sortOrder,
      published: true,
    }))
  );
}

export async function importTheatreProjects(
  request: Request,
  db: D1Database,
  token: string | undefined
): Promise<Response> {
  const auth = request.headers.get("Authorization") || "";
  if (!token || auth !== `Bearer ${token}`) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const items =
    body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
      ? ((body as { items: typeof THEATRE_SEED }).items as Array<{
          slug: string;
          name: string;
          itemName?: string;
          item_name?: string;
          posterUrl?: string | null;
          poster_url?: string | null;
          videoUrl?: string | null;
          video_url?: string | null;
          summary?: string | null;
          sortOrder?: number;
          sort_order?: number;
          published?: boolean;
        }>)
      : null;

  const count = items
    ? await upsertTheatreProjects(
        db,
        items.map((i) => ({
          slug: i.slug,
          name: i.name,
          itemName: i.itemName || i.item_name || i.name,
          posterUrl: i.posterUrl ?? i.poster_url ?? null,
          videoUrl: i.videoUrl ?? i.video_url ?? null,
          summary: i.summary ?? null,
          sortOrder: i.sortOrder ?? i.sort_order ?? 0,
          published: i.published !== false,
        }))
      )
    : await seedTheatreProjects(db);

  return new Response(JSON.stringify({ ok: true, upserted: count }), {
    headers: { "Content-Type": "application/json" },
  });
}
