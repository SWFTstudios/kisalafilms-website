-- A finished job can be published to /builds as a case study. Only its
-- progress photos become public, and only while published_at is set.
ALTER TABLE jobs ADD COLUMN published_at TEXT;
ALTER TABLE jobs ADD COLUMN public_title TEXT;
ALTER TABLE jobs ADD COLUMN public_summary TEXT;
CREATE INDEX IF NOT EXISTS jobs_published ON jobs(published_at);

-- Photos the studio marks as the cover for a published build.
ALTER TABLE photos ADD COLUMN is_cover INTEGER NOT NULL DEFAULT 0;
