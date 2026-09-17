import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { sendError } from './errors.js';

// Platform admins work in their own organization and can step into another one; `acting` marks that visit.
export function signAdmin(user, { organizationId = user.organization_id, role = user.role, acting = false } = {}) {
  return jwt.sign(
    {
      sub: user.id,
      organizationId,
      role,
      platformAdmin: Boolean(user.platform_admin),
      homeOrganizationId: user.organization_id,
      acting: Boolean(acting)
    },
    env.sessionSecret,
    { expiresIn: '12h' }
  );
}

export function requireAdmin(req, res, next) {
  const token = req.cookies?.qrating_admin;
  if (!token) return sendError(req, res, 401, 'Du bist nicht angemeldet. Bitte melde dich an.');

  try {
    req.admin = jwt.verify(token, env.sessionSecret);
    next();
  } catch {
    sendError(req, res, 401, 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
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
    if (!req.admin) return sendError(req, res, 401, 'Du bist nicht angemeldet. Bitte melde dich an.');
    if (!hasRole(req.admin.role, minimumRole)) {
      return sendError(req, res, 403, 'Für diese Aktion fehlt dir die Berechtigung. Ein Admin deiner Organisation kann deine Rolle anpassen.');
    }
    next();
  };
}

// The platform role decides over all organizations, so it is read from the database on every use.
export function requirePlatformAdmin(db) {
  return async (req, res, next) => {
    try {
      if (!req.admin) return sendError(req, res, 401, 'Du bist nicht angemeldet. Bitte melde dich an.');
      const result = await db.query('SELECT platform_admin FROM users WHERE id = $1 AND status = $2', [req.admin.sub, 'active']);
      if (!result.rows[0]?.platform_admin) {
        return sendError(req, res, 403, 'Diese Ansicht gehört der Plattform-Verwaltung. Dein Konto verwaltet einen einzelnen Mandanten.');
      }
      next();
    } catch (error) {
      next(error);
    }
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
