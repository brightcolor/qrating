-- A notification channel used to belong to one person. A tenant that has no accounts
-- of its own could therefore never own its own alerting: whoever created the channel
-- while visiting the tenant left their own account on it, and that account lives in
-- another organization.
--
-- A channel may now belong to the organization. Such a channel carries no user, it
-- reaches every event of the tenant, and its recipient comes from its own config.
-- A channel that does carry a user keeps today's meaning: it reaches the events that
-- user is assigned to, and the user has to belong to the same organization.
ALTER TABLE notification_channels ALTER COLUMN user_id DROP NOT NULL;

-- Channels whose owner sits in another organization were created during such a visit.
-- They are the alerting of the tenant they were created in, so they become its own.
UPDATE notification_channels nc
SET user_id = NULL, updated_at = now()
FROM users u
WHERE u.id = nc.user_id
  AND u.organization_id <> nc.organization_id;

-- The same visits left event assignments behind that put an account of one
-- organization on the team of another. The alerting no longer reads them, the event
-- team of a tenant lists accounts of that tenant, and access is granted per
-- organization. They are dropped so the two tables tell the same story.
DELETE FROM user_event_assignments uea
USING users u
WHERE u.id = uea.user_id
  AND u.organization_id <> uea.organization_id;
