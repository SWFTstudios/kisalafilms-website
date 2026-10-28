-- Client portal: customers, their bikes and jobs, and everything a job carries.
--
-- A job is one build from first inquiry to collection. Its `stage` is the
-- current step on the timeline the customer sees (src/stages.ts lists them in
-- order); `job_events` is the history behind it, including the notes and
-- progress photos posted at each step.
--
-- Money is stored in cents. Login and session tokens are stored only as
-- SHA-256 hashes, so a copy of this database cannot be used to sign in.

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,          -- lower-cased
  name TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One-time sign-in links and codes. A row is good for one use, for 20 minutes.
CREATE TABLE IF NOT EXISTS login_tokens (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  token_hash TEXT NOT NULL UNIQUE,     -- the emailed link
  code_hash TEXT NOT NULL,             -- the emailed 6-digit code
  next_path TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, -- wrong codes entered against this row
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS login_tokens_customer ON login_tokens(customer_id, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                 -- SHA-256 of the cookie value
  customer_id TEXT NOT NULL REFERENCES customers(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_customer ON sessions(customer_id);

CREATE TABLE IF NOT EXISTS bikes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  year TEXT,
  make TEXT,
  model TEXT,
  colour TEXT,
  mileage TEXT,
  vin TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bikes_customer ON bikes(customer_id);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,            -- KF-1001, what people say on the phone
  customer_id TEXT NOT NULL REFERENCES customers(id),
  bike_id TEXT REFERENCES bikes(id),
  stage TEXT NOT NULL DEFAULT 'inquiry',
  service TEXT,                        -- a key of services in kisala-config.js
  coverage TEXT,
  panels TEXT,                         -- JSON array of panel ids
  finish TEXT,
  colour TEXT,
  film_handle TEXT,
  notes TEXT,
  inspiration TEXT,                    -- links the rider pasted
  preferred_dates TEXT,
  handoff TEXT,                        -- drop-off | pickup | round-trip | undecided
  pickup_zip TEXT,
  estimate_low INTEGER,                -- dollars, the ballpark shown at submit
  estimate_high INTEGER,
  internal_notes TEXT,                 -- studio only, never sent to the customer
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_customer ON jobs(customer_id, created_at);
CREATE INDEX IF NOT EXISTS jobs_stage ON jobs(stage, updated_at);

CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  stage TEXT NOT NULL,                 -- the stage the job moved to, or stayed at
  note TEXT,
  author TEXT NOT NULL,                -- customer | studio | system
  visible INTEGER NOT NULL DEFAULT 1,  -- 0 for studio-only history
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_events_job ON job_events(job_id, created_at);

-- Photos live in R2; this is the index. A photo uploaded from the intake form
-- before the job exists carries only draft_id until the form is submitted.
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id),
  draft_id TEXT,
  event_id TEXT REFERENCES job_events(id),
  kind TEXT NOT NULL,                  -- customer | progress
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  caption TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_job ON photos(job_id, created_at);
CREATE INDEX IF NOT EXISTS photos_draft ON photos(draft_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  author TEXT NOT NULL,                -- customer | studio
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS messages_job ON messages(job_id, created_at);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | approved | superseded
  currency TEXT NOT NULL DEFAULT 'usd',
  total_cents INTEGER NOT NULL DEFAULT 0,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS quotes_job ON quotes(job_id, created_at);

CREATE TABLE IF NOT EXISTS quote_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS quote_items_quote ON quote_items(quote_id, position);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  quote_id TEXT REFERENCES quotes(id),
  kind TEXT NOT NULL,                  -- deposit | balance | other
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | refunded | failed
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS payments_job ON payments(job_id, created_at);
CREATE INDEX IF NOT EXISTS payments_session ON payments(stripe_session_id);
