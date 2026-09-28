import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { clearAdminCookie } from '../utils/security.js';
import { sendError } from './errors.js';

// Platform admins work in their own organization and can step into another one; `acting` marks that visit.
// `sv` is the session version of the account: a new password raises it and ends older sessions.
export function signAdmin(user, { organizationId = user.organization_id, role = user.role, acting = false } = {}) {
  return jwt.sign(
    {
      sub: user.id,
      organizationId,
      role,
      platformAdmin: Boolean(user.platform_admin),
      homeOrganizationId: user.organization_id,
      acting: Boolean(acting),
      sv: Number(user.session_version) || 0
    },
    env.sessionSecret,
    { expiresIn: `${env.adminSessionHours}h` }
  );
}

// What a session hears once its account is no longer in use.
const closedAccountMessages = {
  disabled: 'Dein Konto ist deaktiviert. Ein Admin deiner Organisation kann es wieder aktivieren.',
  invited: 'Dein Konto ist noch nicht aktiviert. Öffne den Link aus deiner Einladungs-E-Mail und lege dort ein Passwort fest.'
};

// A signed cookie proves who signed in, and the account decides what that is worth now:
// every request reads status, role, platform role and session version, so disabling an
// account or setting a new password ends its sessions at once and a changed role applies
// from the next request on. Several routers ask on the way through; the first answer counts.
export async function requireAdmin(req, res, next) {
  if (req.admin) return next();
  const token = req.cookies?.[env.adminCookieName];
  if (!token) return sendError(req, res, 401, 'Du bist nicht angemeldet. Bitte melde dich an.');

  let session;
  try {
    session = jwt.verify(token, env.sessionSecret);
  } catch {
    return sendError(req, res, 401, 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
  }

  const refuse = (message) => {
    clearAdminCookie(res);
    return sendError(req, res, 401, message);
  };

  try {
    const account = (await query(
      `SELECT u.status, u.role, u.organization_id, u.platform_admin, u.session_version,
              EXISTS (SELECT 1 FROM organizations o WHERE o.id = $2) AS organization_exists
       FROM users u
       WHERE u.id = $1`,
      [session.sub, session.organizationId]
    )).rows[0];
    if (!account) return refuse('Dein Konto gibt es nicht mehr. Bitte melde dich mit einem anderen Konto an.');
    if (account.status !== 'active') {
      return refuse(closedAccountMessages[account.status] || 'Dein Konto ist gesperrt. Ein Admin deiner Organisation kann es wieder aktivieren.');
    }
    if ((Number(session.sv) || 0) !== Number(account.session_version)) {
      return refuse('Deine Sitzung ist beendet, weil für dein Konto ein neues Passwort gesetzt wurde. Melde dich mit dem neuen Passwort an.');
    }
    if (!account.organization_exists) {
      return refuse('Die Organisation dieser Sitzung gibt es nicht mehr. Bitte melde dich erneut an.');
    }
    const platformAdmin = Boolean(account.platform_admin);
    if (session.acting) {
      // A visit to another tenant rests on the platform role; without it the visit ends.
      if (!platformAdmin) return refuse('Deine Plattform-Rolle wurde entzogen, damit endet der Besuch im Mandanten. Bitte melde dich erneut an.');
    } else if (session.organizationId !== account.organization_id) {
      return refuse('Dein Konto gehört inzwischen zu einer anderen Organisation. Bitte melde dich erneut an.');
    }
    // At home the role counts as the account holds it now. On a visit to another tenant the
    // platform role works with the full rights it entered with.
    req.admin = { ...session, platformAdmin, role: session.acting ? session.role : account.role };
    next();
  } catch (error) {
    next(error);
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

export function requireRole(minimumRole, { orPlatform = false } = {}) {
  return (req, res, next) => {
    if (!req.admin) return sendError(req, res, 401, 'Du bist nicht angemeldet. Bitte melde dich an.');
    // Some pages serve the platform role as well, whatever role the account has at home.
    if (orPlatform && req.admin.platformAdmin) return next();
    if (!hasRole(req.admin.role, minimumRole)) {
      return sendError(req, res, 403, 'Für diese Aktion fehlt dir die Berechtigung. Ein Owner deiner Organisation kann deine Rolle anpassen.');
    }
    next();
  };
}

// The platform role decides over all organizations, so it is read from the database on every use.
export function requirePlatformAdmin(db, refusal = 'Diese Ansicht gehört der Plattform-Verwaltung. Dein Konto verwaltet einen einzelnen Mandanten.') {
  return async (req, res, next) => {
    try {
      if (!req.admin) return sendError(req, res, 401, 'Du bist nicht angemeldet. Bitte melde dich an.');
      const result = await db.query('SELECT platform_admin FROM users WHERE id = $1 AND status = $2', [req.admin.sub, 'active']);
      if (!result.rows[0]?.platform_admin) {
        return sendError(req, res, 403, refusal);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Every role reaches only the events of the organization the session works in; below
// event_manager the account needs an assignment to the event as well.
export async function canAccessEvent(db, admin, eventId) {
  const own = await db.query('SELECT 1 FROM events WHERE id = $1 AND organization_id = $2', [eventId, admin.organizationId]);
  if (!own.rows.length) return false;
  if (hasRole(admin.role, 'event_manager')) return true;
  const result = await db.query(
    `SELECT 1 FROM user_event_assignments
     WHERE event_id = $1 AND user_id = $2 AND organization_id = $3`,
    [eventId, admin.sub, admin.organizationId]
  );
  return result.rows.length > 0;
}
