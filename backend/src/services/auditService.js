export async function writeAudit(db, { organizationId, userId = null, action, entityType, entityId = null, metadata = {} }) {
  if (!organizationId || !action || !entityType) return null;
  const result = await db.query(
    `INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     RETURNING *`,
    [organizationId, userId, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
  return result.rows[0];
}
