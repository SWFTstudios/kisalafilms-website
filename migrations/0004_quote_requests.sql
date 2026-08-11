-- Quote requests from /quote.
--
-- A record of the lead, not the delivery of it. The email (and the photos)
-- goes out on the browser's own POST to FormSubmit, because FormSubmit sits
-- behind a Cloudflare managed challenge that a Worker cannot pass. This table
-- exists so the garage owns its own lead history instead of an inbox being the
-- only copy, and so a lost row can never cost a customer.
--
-- Photos are counted, not stored: they never reach the Worker.
CREATE TABLE IF NOT EXISTS quote_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  item_type TEXT,
  services TEXT,
  service_other TEXT,
  bike_make TEXT,
  bike_model TEXT,
  bike_year TEXT,
  bike_style TEXT,
  helmet_brand TEXT,
  helmet_model TEXT,
  helmet_size TEXT,
  helmet_style TEXT,
  description TEXT,
  finish TEXT,
  desired_colour TEXT,
  handoff TEXT,
  pickup_zip TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  instagram TEXT,
  preferred_contact TEXT,
  photo_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  page TEXT,
  referer TEXT,
  user_agent TEXT,
  country TEXT
);

CREATE INDEX IF NOT EXISTS quote_requests_created ON quote_requests(created_at);
CREATE INDEX IF NOT EXISTS quote_requests_email ON quote_requests(customer_email);
CREATE INDEX IF NOT EXISTS quote_requests_item ON quote_requests(item_type);
