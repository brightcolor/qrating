-- Deleting a QR place looks up its votes, visits and counted days by the place: the route copies
-- the name into votes and days, and the database empties the link of votes and visits. Without an
-- index each lookup read the whole table, across all organizations, while the place stayed locked
-- and a vote on its way to it waited.
CREATE INDEX IF NOT EXISTS idx_feedback_responses_qr_source
  ON feedback_responses (qr_source_id) WHERE qr_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_sessions_qr_source
  ON guest_sessions (qr_source_id) WHERE qr_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qr_source_daily_stats_qr_source
  ON qr_source_daily_stats (qr_source_id) WHERE qr_source_id IS NOT NULL;
