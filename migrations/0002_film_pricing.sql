-- Film pricing + Metro categories + founder meta
ALTER TABLE films ADD COLUMN product_type TEXT;
ALTER TABLE films ADD COLUMN collection TEXT;
ALTER TABLE films ADD COLUMN price_usd REAL;
ALTER TABLE films ADD COLUMN roll_price_usd REAL;
ALTER TABLE films ADD COLUMN price_synced_at TEXT;

CREATE INDEX IF NOT EXISTS films_product_type ON films(product_type);
CREATE INDEX IF NOT EXISTS films_collection ON films(collection);
CREATE INDEX IF NOT EXISTS films_color_family ON films(color_family);
CREATE INDEX IF NOT EXISTS films_brand ON films(brand);

CREATE TABLE IF NOT EXISTS site_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO site_meta (key, value) VALUES ('completed_orders', '0');
INSERT OR IGNORE INTO site_meta (key, value) VALUES ('founder_limit', '5');
