-- A vote says where the guest scanned. Its link to the QR source is emptied when the source is
-- deleted, and the evaluation read the name of the spot through that link only, so every vote
-- of a deleted spot lost it. The vote now keeps the name in a column of its own: the route that
-- deletes a source writes the current name into it right before the source goes, the same way
-- the counted days keep theirs (029). As long as the source exists, its own name wins.
ALTER TABLE feedback_responses
  ADD COLUMN IF NOT EXISTS source_label TEXT;
