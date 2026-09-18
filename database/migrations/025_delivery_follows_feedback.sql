-- A delivery records one attempt for one rating. Without that rating it says
-- nothing, and two such leftovers collided in the unique index below, so deleting
-- an event with two low ratings on the same channel failed. The delivery now goes
-- with its rating.
DELETE FROM notification_deliveries WHERE feedback_response_id IS NULL;

ALTER TABLE notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_feedback_response_id_fkey;

ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_feedback_response_id_fkey
  FOREIGN KEY (feedback_response_id) REFERENCES feedback_responses(id) ON DELETE CASCADE;
