-- Lookbook films CMS (Metro import + garage copy)
CREATE TABLE IF NOT EXISTS films (
  handle TEXT PRIMARY KEY,
  sku TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  finish TEXT,
  color_family TEXT,
  image_url TEXT,
  metro_url TEXT,
  in_stock INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  install_notes TEXT,
  recommended_for TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS films_finish ON films(finish);
CREATE INDEX IF NOT EXISTS films_in_stock ON films(in_stock);
CREATE INDEX IF NOT EXISTS films_name ON films(name);
