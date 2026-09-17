-- The Pretix identity rule treated all manual events as equal (all NULL), so only one manual event could exist.
DO $$
DECLARE
  legacy_constraint TEXT;
BEGIN
  SELECT conname INTO legacy_constraint
  FROM pg_constraint
  WHERE conrelid = 'events'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%(pretix_connection_id, pretix_event_slug, pretix_subevent_id)';
  IF legacy_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT %I', legacy_constraint);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_pretix_identity
  ON events (pretix_connection_id, pretix_event_slug, pretix_subevent_id) NULLS NOT DISTINCT
  WHERE pretix_connection_id IS NOT NULL;

-- Older releases added the demo form again on every backend start: keep the first copy and every answered copy.
DELETE FROM feedback_forms duplicate
USING feedback_forms original
WHERE duplicate.name = 'Schnellfeedback'
  AND duplicate.description = 'Kurzes Standardformular'
  AND duplicate.event_id IN (SELECT id FROM events WHERE slug = 'demo-nacht')
  AND original.event_id = duplicate.event_id
  AND original.name = duplicate.name
  AND original.description = duplicate.description
  AND (original.created_at, original.id) < (duplicate.created_at, duplicate.id)
  AND NOT EXISTS (
    SELECT 1
    FROM feedback_questions question
    JOIN feedback_answers answer ON answer.feedback_question_id = question.id
    WHERE question.feedback_form_id = duplicate.id
  );
