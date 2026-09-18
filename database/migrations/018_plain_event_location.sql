-- Locations of the Pretix sync arrived as translated JSON and were shown raw.
-- Every row that still holds JSON keeps its German text, or the first one it has.
DO $$
DECLARE
  row_event RECORD;
  parsed JSONB;
  plain TEXT;
BEGIN
  FOR row_event IN SELECT id, location FROM events WHERE location IS NOT NULL AND location LIKE '{%' LOOP
    BEGIN
      parsed := row_event.location::jsonb;
      plain := COALESCE(
        parsed ->> 'de',
        parsed ->> 'de-informal',
        parsed ->> 'en',
        (SELECT value FROM jsonb_each_text(parsed) WHERE value <> '' LIMIT 1)
      );
      IF plain IS NOT NULL AND plain <> '' THEN
        UPDATE events SET location = plain, updated_at = now() WHERE id = row_event.id;
      END IF;
    EXCEPTION WHEN others THEN
      -- A value that is no JSON stays as it is.
      NULL;
    END;
  END LOOP;
END $$;
