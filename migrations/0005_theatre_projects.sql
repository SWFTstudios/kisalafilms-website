-- Theatre projects CMS (Flip 2.0 grid items) — separate from vinyl films
CREATE TABLE IF NOT EXISTS theatre_projects (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  poster_url TEXT,
  video_url TEXT,
  summary TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS theatre_projects_sort ON theatre_projects(sort_order);
CREATE INDEX IF NOT EXISTS theatre_projects_published ON theatre_projects(published);
