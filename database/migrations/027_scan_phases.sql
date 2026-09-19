-- A scan outside the round left no trace. The tenant code answered with the waiting
-- screen before anything was counted, and the event code put an early scan on the very
-- counter that is meant to say "reached the running round". Each phase gets its own
-- column, so an early or late scan stays visible without bending the numbers of the round.
ALTER TABLE qr_source_daily_stats
  ADD COLUMN IF NOT EXISTS scans_before INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scans_after INTEGER NOT NULL DEFAULT 0;
