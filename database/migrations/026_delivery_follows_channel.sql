-- The same trap as in 025, one column further: `notification_channel_id` was set to
-- empty when a channel went away, and the unique index below counts two empty values
-- as the same. One rating announced over two channels, then both channels deleted --
-- which happens in a single statement when their owner is removed -- and the delete
-- fails. A delivery records what one channel did, so it goes with that channel.
DELETE FROM notification_deliveries WHERE notification_channel_id IS NULL;

ALTER TABLE notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_notification_channel_id_fkey;

ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_notification_channel_id_fkey
  FOREIGN KEY (notification_channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE;
