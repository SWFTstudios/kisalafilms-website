-- Vinyl project orders (motorcycle + helmet wraps) paid via Stripe Checkout.
CREATE TABLE IF NOT EXISTS project_orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  surface TEXT NOT NULL,
  coverage TEXT NOT NULL,
  film_handle TEXT NOT NULL,
  film_name TEXT,
  film_finish TEXT,
  difficulty INTEGER NOT NULL,
  body_class TEXT,
  bike_year TEXT,
  bike_make TEXT,
  bike_model TEXT,
  bike_label TEXT,
  helmet_notes TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  firebase_uid TEXT,
  project_id TEXT,
  roll_cost_usd REAL,
  vinyl_markup REAL,
  vinyl_sell_usd REAL,
  rolls INTEGER,
  linear_feet REAL,
  labour_usd REAL,
  total_usd REAL,
  amount_cents INTEGER,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  currency TEXT NOT NULL DEFAULT 'usd',
  quote_json TEXT
);

CREATE INDEX IF NOT EXISTS project_orders_status ON project_orders(status);
CREATE INDEX IF NOT EXISTS project_orders_email ON project_orders(customer_email);
CREATE INDEX IF NOT EXISTS project_orders_session ON project_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS project_orders_film ON project_orders(film_handle);
