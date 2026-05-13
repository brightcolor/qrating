import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAdmin(user) {
  return jwt.sign(
    { sub: user.id, organizationId: user.organization_id, role: user.role },
    env.sessionSecret,
    { expiresIn: '12h' }
  );
}

export function requireAdmin(req, res, next) {
  const token = req.cookies?.qrating_admin;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });

  try {
    req.admin = jwt.verify(token, env.sessionSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Sitzung abgelaufen.' });
  }
}

const roleRank = {
  support: 10,
  analyst: 20,
  event_manager: 30,
  admin: 40,
  owner: 50
};

export function hasRole(userRole, minimumRole) {
  return (roleRank[userRole] || 0) >= (roleRank[minimumRole] || 0);
}

export function requireRole(minimumRole) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'Nicht angemeldet.' });
    if (!hasRole(req.admin.role, minimumRole)) {
      return res.status(403).json({ error: 'Keine Berechtigung fuer diese Aktion.' });
    }
    next();
  };
}

export async function canAccessEvent(db, admin, eventId) {
  if (hasRole(admin.role, 'event_manager')) return true;
  const result = await db.query(
    `SELECT 1 FROM user_event_assignments
     WHERE event_id = $1 AND user_id = $2 AND organization_id = $3`,
    [eventId, admin.sub, admin.organizationId]
  );
  return result.rows.length > 0;
}
