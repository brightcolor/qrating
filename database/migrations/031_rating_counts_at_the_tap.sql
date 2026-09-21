-- A rating is counted from the first tap on a star. Everything after it -- questions,
-- a callback number, the newsletter -- may follow or not. completed_at says whether the
-- guest went all the way. Until now a rating only existed once the whole form was sent,
-- so every row written before this point was complete.
ALTER TABLE feedback_responses
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE feedback_responses SET completed_at = submitted_at WHERE completed_at IS NULL;
