-- The same trap as in 025 and 026, one table further -- with one difference that decides the
-- way out: a delivery is a note about a rating that is stored elsewhere, while these daily
-- numbers are the only place a scan is ever counted. `qr_source_id` was emptied when a source
-- went away, and the unique index below counts two empty values as one, so deleting a source
-- failed as soon as the same spot had already been scanned before that source existed.
-- Taking the rows along with the source would leave the event with fewer scans than feedbacks,
-- so the row stays where it is and carries the name of the spot with it.
ALTER TABLE qr_source_daily_stats
  ADD COLUMN IF NOT EXISTS source_label TEXT;

UPDATE qr_source_daily_stats qds
   SET source_label = qs.label
  FROM qr_sources qs
 WHERE qs.id = qds.qr_source_id
   AND qds.source_label IS NULL;

-- A counted day belongs to the day and the spot, so it stops following the source out of the
-- door. What is left is a plain key: the analytics join it by hand and fall back to the name
-- above when the source is gone.
ALTER TABLE qr_source_daily_stats
  DROP CONSTRAINT IF EXISTS qr_source_daily_stats_qr_source_id_fkey;
