-- The film answers from /quote's "finish and film" step.
--
-- Two columns because they answer two different questions. `film_types` is what
-- kind of film the rider wants — vinyl, coloured PPF, clear PPF, or any mix of
-- them — and is a real answer even from someone who never opens the browser.
-- `film_choices` is the shortlist of specific products they picked out of the
-- catalogue, one per line, each carrying the SKU and the supplier URL so the
-- garage can price and order against it without going looking.
--
-- Added rather than folded into 0004 because that migration has already run.
ALTER TABLE quote_requests ADD COLUMN film_types TEXT;
ALTER TABLE quote_requests ADD COLUMN film_choices TEXT;
