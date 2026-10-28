-- Owner-only internal quote sheet on /quote leads + film vendor source.
--
-- internal_quote_sheet is the plaintext FormSubmit also receives; JSON is the
-- structured twin for later tooling. source on films distinguishes Metro rows
-- from Vinyl Frog so price syncs hit the right storefront.

ALTER TABLE quote_requests ADD COLUMN internal_quote_sheet TEXT;
ALTER TABLE quote_requests ADD COLUMN internal_quote_json TEXT;

ALTER TABLE films ADD COLUMN source TEXT;

CREATE INDEX IF NOT EXISTS films_source ON films(source);

-- Existing catalogue rows are Metro Restyling imports.
UPDATE films SET source = 'metro' WHERE source IS NULL OR source = '';
