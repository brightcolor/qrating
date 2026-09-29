import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { query, withTransaction } from '../db/pool.js';
import { signAdmin, requireAdmin } from '../middleware/auth.js';
import { describeWait, httpError } from '../middleware/errors.js';
import { env } from '../config/env.js';
import { decryptSecret, encryptSecret, hashValue, randomToken, slugify } from '../utils/crypto.js';
import { SmtpService } from '../services/smtpService.js';
import { clearAdminCookie, setAdminCookie } from '../utils/security.js';
import { buildOtpAuthUrl, generateRecoveryCodes, generateTotpSecret, verifyTotp } from '../services/twoFactorService.js';
import { writeAudit } from '../services/auditService.js';
import { markSetupClosed, setupCodeMatches, setupOpen } from '../services/setupService.js';
import { issueResetLink, resetValidity } from '../services/passwordResetService.js';
import { hashPassword, passwordMaxBytes, passwordProblem } from '../utils/passwords.js';

export const authRouter = express.Router();

const authWindowMs = env.authRateLimitWindowMinutes * 60 * 1000;
const authLimiter = rateLimit({
  windowMs: authWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `Zu viele Anmeldeversuche von diesem Anschluss. Bitte warte ${describeWait(authWindowMs)} und versuche es dann erneut.` }
});

const resetWindowMs = env.passwordResetRateLimitWindowMinutes * 60 * 1000;
const passwordResetLimiter = rateLimit({
  windowMs: resetWindowMs,
  max: env.passwordResetRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `Zu viele Anfragen zum Zurücksetzen des Passworts. Bitte warte ${describeWait(resetWindowMs)} und versuche es dann erneut.` }
});

const setupClosedMessage = 'Die Ersteinrichtung ist abgeschlossen. Melde dich mit deinem Konto an.';

// A new password that cannot be used stops the request with the reason.
function checkNewPassword(password) {
  const problem = passwordProblem(password);
  if (problem) throw httpError(400, problem);
}

// E-mail addresses arrive as typed, with a space at the end or in capitals.
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    twoFactorEnabled: Boolean(user.two_factor_enabled)
  };
}

function recoveryHashes(codes) {
  return codes.map((code) => hashValue(String(code).trim().toUpperCase()));
}

function consumeRecoveryCode(user, code) {
  const normalized = String(code || '').trim().toUpperCase();
  const hashes = Array.isArray(user.two_factor_recovery_hashes) ? user.two_factor_recovery_hashes : [];
  const hash = hashValue(normalized);
  if (!hashes.includes(hash)) return null;
  return hashes.filter((item) => item !== hash);
}

function verifyUserSecondFactor(user, code) {
  if (!user.two_factor_enabled || !user.two_factor_secret_encrypted) return { ok: true, recoveryHashes: null };
  const secret = decryptSecret(user.two_factor_secret_encrypted);
  if (verifyTotp(secret, code)) return { ok: true, recoveryHashes: null };
  const remainingRecoveryHashes = consumeRecoveryCode(user, code);
  if (remainingRecoveryHashes) return { ok: true, recoveryHashes: remainingRecoveryHashes };
  return { ok: false, recoveryHashes: null };
}

async function completeLogin(res, user, secondFactorResult = { recoveryHashes: null }) {
  if (secondFactorResult.recoveryHashes) {
    await query('UPDATE users SET two_factor_recovery_hashes = $2::jsonb, updated_at = now() WHERE id = $1', [
      user.id,
      JSON.stringify(secondFactorResult.recoveryHashes)
    ]);
  }
  await query('UPDATE users SET last_login_at = now(), two_factor_challenge_hash = null, two_factor_challenge_expires_at = null WHERE id = $1', [user.id]);
  setAdminCookie(res, signAdmin(user));
  return publicUser(user);
}

// A password alone opens no session for an account with a second factor, however it was
// typed in: at the sign-in, after a reset or with an invitation. Such an account gets a short
// challenge, and the code from the app completes the sign-in under /login/2fa.
async function beginSession(res, user) {
  if (!user.two_factor_enabled) return { user: await completeLogin(res, user) };
  const challengeToken = randomToken(32);
  await query(
    `UPDATE users
     SET two_factor_challenge_hash = $2,
         two_factor_challenge_expires_at = now() + ($3 * interval '1 minute'),
         updated_at = now()
     WHERE id = $1`,
    [user.id, hashValue(challengeToken), env.twoFactorChallengeMinutes]
  );
  return { twoFactorRequired: true, challengeToken, user: { email: user.email, name: user.name } };
}

// What a password needs, for the forms that set one: first setup, invitation and reset.
authRouter.get('/password-policy', (req, res) => {
  res.json({ minLength: env.passwordMinLength, maxBytes: passwordMaxBytes });
});

// Open only while the installation has no account. Afterwards the setup answers like a page
// that does not exist, and what it would tell stays hidden.
authRouter.get('/setup/status', async (req, res, next) => {
  try {
    if (!(await setupOpen({ query }))) throw httpError(404, setupClosedMessage);
    const organization = (await query('SELECT id, name, slug FROM organizations ORDER BY created_at ASC LIMIT 1')).rows[0] || null;
    res.json({
      setupRequired: true,
      organization: organization ? { name: organization.name, slug: organization.slug } : null,
      passwordMinLength: env.passwordMinLength,
      passwordMaxBytes,
      setupCodeCommand: env.setupCodeCommand
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/setup/first-admin', authLimiter, async (req, res, next) => {
  try {
    if (!(await setupOpen({ query }))) throw httpError(404, setupClosedMessage);
    // The code comes first: without it nobody learns anything about the installation.
    if (!(await setupCodeMatches({ query }, req.body.setupCode))) {
      throw httpError(403, `Der Einrichtungscode stimmt nicht. Er steht im Log des Backends; einen neuen Code zeigt „${env.setupCodeCommand}“.`);
    }
    const email = normalizeEmail(req.body.email);
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');
    const organizationName = String(req.body.organizationName || env.organizationName).trim();
    const organizationSlug = slugify(req.body.organizationSlug || organizationName || env.organizationSlug);

    if (!name) throw httpError(400, 'Bitte gib deinen Namen ein.');
    if (!email || !email.includes('@')) throw httpError(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
    checkNewPassword(password);
    if (!organizationName) throw httpError(400, 'Bitte gib einen Organisationsnamen ein.');

    const passwordHash = await hashPassword(password);
    const created = await withTransaction(async (client) => {
      await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
      const existingUsers = Number((await client.query('SELECT count(*)::int AS count FROM users')).rows[0]?.count || 0);
      if (existingUsers > 0) throw httpError(404, setupClosedMessage);

      const existingOrganization = (await client.query('SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1 FOR UPDATE')).rows[0];
      const organization = existingOrganization
        ? (await client.query(
          `UPDATE organizations
           SET name = $2, slug = $3, updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [existingOrganization.id, organizationName, organizationSlug]
        )).rows[0]
        : (await client.query(
          `INSERT INTO organizations (name, slug, primary_color, privacy_text, retention_low_rating_phone_days)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [organizationName, organizationSlug, env.newOrganizationColor, env.newOrganizationPrivacyText, env.retentionPhoneDefaultDays]
        )).rows[0];

      // The account that sets the installation up also runs the platform above the organizations.
      const user = (await client.query(
        `INSERT INTO users (organization_id, name, email, password_hash, role, status, platform_admin)
         VALUES ($1, $2, $3, $4, 'owner', 'active', true)
         RETURNING *`,
        [organization.id, name, email, passwordHash]
      )).rows[0];

      await client.query(
        `INSERT INTO user_event_assignments (organization_id, user_id, event_id, notify_low_rating)
         SELECT organization_id, $2, id, true
         FROM events
         WHERE organization_id = $1
         ON CONFLICT (user_id, event_id) DO NOTHING`,
        [organization.id, user.id]
      );

      // The code has done its job; with the first account the setup closes for good.
      await client.query('DELETE FROM setup_codes');
      return user;
    });
    markSetupClosed();

    const user = await completeLogin(res, created);
    await writeAudit({ query }, {
      organizationId: created.organization_id,
      userId: created.id,
      action: 'admin.first_user_created',
      entityType: 'user',
      entityId: created.id
    });
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { password } = req.body;
    const result = await query('SELECT * FROM users WHERE email = $1', [normalizeEmail(req.body.email)]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
      throw httpError(401, 'E-Mail oder Passwort ist falsch. Prüfe beides oder setze dein Passwort zurück.');
    }
    if (user.status === 'disabled') throw httpError(403, 'Dieses Konto ist deaktiviert. Ein Owner deiner Organisation kann es wieder aktivieren.');
    if (user.status === 'invited') throw httpError(403, 'Dieses Konto ist noch nicht aktiviert. Öffne den Link aus deiner Einladungs-E-Mail und lege dort ein Passwort fest.');
    res.json(await beginSession(res, user));
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/2fa', authLimiter, async (req, res, next) => {
  try {
    const challengeToken = String(req.body.challengeToken || '');
    const code = String(req.body.code || '');
    const user = (await query(
      `SELECT * FROM users
       WHERE two_factor_challenge_hash = $1
         AND two_factor_challenge_expires_at > now()
         AND status = 'active'`,
      [hashValue(challengeToken)]
    )).rows[0];
    if (!user) throw httpError(401, 'Die 2FA-Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
    const secondFactor = verifyUserSecondFactor(user, code);
    if (!secondFactor.ok) throw httpError(401, 'Der Code stimmt nicht. Gib den aktuellen Code aus deiner Authenticator-App oder einen Recovery-Code ein.');
    const signedInUser = await completeLogin(res, user, secondFactor);
    await writeAudit({ query }, {
      organizationId: user.organization_id,
      userId: user.id,
      action: 'admin.login_2fa',
      entityType: 'user',
      entityId: user.id
    });
    res.json({ user: signedInUser });
  } catch (error) {
    next(error);
  }
});

const invalidInviteMessage = 'Dieser Einladungslink ist ungültig oder abgelaufen. Bitte einen Owner deiner Organisation, dich erneut einzuladen.';

// An invitation that can still be taken up, found by the token of its link.
async function openInvitation(token) {
  return (await query(
    `SELECT u.*, o.name AS organization_name
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.invite_token_hash = $1
       AND u.invite_expires_at > now()
       AND u.status = 'invited'`,
    [hashValue(String(token || ''))]
  )).rows[0] || null;
}

// What the invitation holds, so the page can say where it leads and fill in the name. The token
// is the key, as it is for taking the invitation up.
authRouter.post('/accept-invite/preview', authLimiter, async (req, res, next) => {
  try {
    const invitation = await openInvitation(req.body.token);
    if (!invitation) throw httpError(400, invalidInviteMessage);
    res.json({
      name: invitation.name,
      email: invitation.email,
      role: invitation.role,
      organization: invitation.organization_name,
      expiresAt: invitation.invite_expires_at
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/accept-invite', authLimiter, async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    checkNewPassword(password);
    const user = await openInvitation(token);
    if (!user) throw httpError(400, invalidInviteMessage);
    const passwordHash = await hashPassword(password);
    // A password of its own ends every session signed before it.
    const updated = (await query(
      `UPDATE users
       SET password_hash = $2,
           name = COALESCE(NULLIF($3, ''), name),
           status = 'active',
           invite_token_hash = null,
           invite_expires_at = null,
           session_version = session_version + 1,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [user.id, passwordHash, name]
    )).rows[0];
    res.json(await beginSession(res, updated));
  } catch (error) {
    next(error);
  }
});

authRouter.post('/password-reset/request', passwordResetLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = (await query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
    // Only an account in use gets a link; an invited person takes up the invitation instead.
    if (user && user.status === 'active') {
      const link = await issueResetLink({ query }, user);
      const sent = await new SmtpService({ query }).sendSystemMail({
        to: user.email,
        subject: 'qrating Passwort zurücksetzen',
        text: `Du kannst dein qrating Passwort hier zurücksetzen:\n\n${link}\n\nDer Link ist ${resetValidity()} gültig. Hast du das nicht angefordert, lass die Mail einfach liegen; dein Passwort bleibt dann, wie es ist.`
      }).catch((error) => ({ error: error.message }));
      // The operator learns why no mail went out; the link itself never goes into a log.
      if (sent?.skipped) console.warn(`qrating: Ein Link zum Zurücksetzen wurde angefordert, aber es ist kein Mailserver der Installation eingetragen (SYSTEM_SMTP_HOST, SYSTEM_MAIL_FROM). Einen Link erzeugt „${env.resetLinkCommand}“.`);
      if (sent?.error) console.warn(`qrating: Ein Link zum Zurücksetzen ließ sich nicht verschicken. ${sent.error}`);
    }
    // The same answer for every address, so nobody learns which ones have an account.
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/password-reset/confirm', authLimiter, async (req, res, next) => {
  try {
    const password = String(req.body.password || '');
    checkNewPassword(password);
    const user = (await query(
      `SELECT * FROM users
       WHERE password_reset_token_hash = $1
         AND password_reset_expires_at > now()
         AND status = 'active'`,
      [hashValue(String(req.body.token || ''))]
    )).rows[0];
    if (!user) throw httpError(400, 'Dieser Link zum Zurücksetzen ist ungültig oder abgelaufen. Fordere auf der Anmeldeseite einen neuen an.');
    const passwordHash = await hashPassword(password);
    // The new password ends every session signed with the old one. An open invitation is
    // settled as well: the person has chosen a password of their own.
    const updated = (await query(
      `UPDATE users
       SET password_hash = $2,
           status = 'active',
           password_reset_token_hash = null,
           password_reset_expires_at = null,
           invite_token_hash = null,
           invite_expires_at = null,
           session_version = session_version + 1,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [user.id, passwordHash]
    )).rows[0];
    res.json(await beginSession(res, updated));
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', (req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAdmin, async (req, res, next) => {
  try {
    // The session may work in another organization than the one the account belongs to.
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role AS home_role, u.two_factor_enabled, u.platform_admin, u.admin_theme,
              home.id AS home_organization_id, home.name AS home_organization_name, home.slug AS home_organization_slug,
              visited.id AS organization_id, visited.name AS organization_name, visited.slug AS organization_slug
       FROM users u
       JOIN organizations home ON home.id = u.organization_id
       JOIN organizations visited ON visited.id = $2
       WHERE u.id = $1`,
      [req.admin.sub, req.admin.organizationId]
    );
    const user = result.rows[0];
    if (!user) throw httpError(401, 'Dein Konto oder die Organisation dieser Sitzung gibt es nicht mehr. Bitte melde dich erneut an.');
    res.json({
      ...user,
      role: req.admin.role || user.home_role,
      platformAdmin: Boolean(user.platform_admin),
      acting: Boolean(req.admin.acting) && user.home_organization_id !== user.organization_id,
      twoFactorEnabled: Boolean(user.two_factor_enabled),
      adminTheme: user.admin_theme || null,
      // Settings the pages of the admin area need to know.
      settings: {
        upcomingEventsMax: env.upcomingEventsMax,
        qrSourceLabelMaxLength: env.qrSourceLabelMaxLength,
        qrSourceSlugMaxLength: env.qrSourceSlugMaxLength,
        defaultTimezone: env.defaultTimezone
      },
      two_factor_enabled: undefined,
      platform_admin: undefined,
      admin_theme: undefined
    });
  } catch (error) {
    next(error);
  }
});

// The look of the admin area belongs to the person, in whichever tenant they are working.
// Only a name in the shape of a look is stored. The page falls back to the default look for
// a name it does not know, so a name left behind by an older release does no harm.
// A request without `adminTheme` leaves the choice as it is.
authRouter.patch('/me/preferences', requireAdmin, async (req, res, next) => {
  try {
    const named = Object.hasOwn(req.body || {}, 'adminTheme');
    const theme = req.body?.adminTheme ?? null;
    if (theme !== null && (typeof theme !== 'string' || !/^[a-z0-9-]{1,40}$/.test(theme))) {
      throw httpError(400, 'Dieses Design gibt es nicht. Wähle eines unter Einstellungen → Darstellung.');
    }
    const updated = (await query(
      `UPDATE users
       SET admin_theme = CASE WHEN $3::boolean THEN $2 ELSE admin_theme END, updated_at = now()
       WHERE id = $1
       RETURNING admin_theme`,
      [req.admin.sub, theme, named]
    )).rows[0];
    if (!updated) throw httpError(404, 'Dein Benutzerkonto wurde nicht gefunden. Bitte melde dich erneut an.');
    res.json({ adminTheme: updated.admin_theme });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/2fa/setup', requireAdmin, async (req, res, next) => {
  try {
    const user = (await query('SELECT * FROM users WHERE id = $1', [req.admin.sub])).rows[0];
    if (!user) throw httpError(404, 'Dein Benutzerkonto wurde nicht gefunden. Bitte melde dich erneut an.');
    if (user.two_factor_enabled) throw httpError(409, '2FA ist bereits aktiv.');
    const secret = generateTotpSecret();
    const provisioningUri = buildOtpAuthUrl({ account: user.email, secret });
    await query(
      `UPDATE users
       SET two_factor_secret_encrypted = $2,
           two_factor_enabled = false,
           two_factor_confirmed_at = null,
           two_factor_recovery_hashes = '[]'::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [user.id, encryptSecret(secret)]
    );
    await writeAudit({ query }, {
      organizationId: user.organization_id,
      userId: user.id,
      action: 'security.2fa_setup_started',
      entityType: 'user',
      entityId: user.id
    });
    res.json({
      secret,
      provisioningUri,
      qrSvg: await QRCode.toString(provisioningUri, { type: 'svg', margin: 1 })
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/2fa/confirm', requireAdmin, async (req, res, next) => {
  try {
    const user = (await query('SELECT * FROM users WHERE id = $1', [req.admin.sub])).rows[0];
    if (!user?.two_factor_secret_encrypted) throw httpError(400, 'Bitte starte zuerst die 2FA-Einrichtung.');
    const secret = decryptSecret(user.two_factor_secret_encrypted);
    if (!verifyTotp(secret, req.body.code)) throw httpError(400, 'Der Code stimmt nicht. Gib den aktuellen Code aus deiner Authenticator-App oder einen Recovery-Code ein.');
    const recoveryCodes = generateRecoveryCodes();
    await query(
      `UPDATE users
       SET two_factor_enabled = true,
           two_factor_confirmed_at = now(),
           two_factor_recovery_hashes = $2::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [user.id, JSON.stringify(recoveryHashes(recoveryCodes))]
    );
    await writeAudit({ query }, {
      organizationId: user.organization_id,
      userId: user.id,
      action: 'security.2fa_enabled',
      entityType: 'user',
      entityId: user.id
    });
    res.json({ ok: true, recoveryCodes });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/2fa/disable', requireAdmin, authLimiter, async (req, res, next) => {
  try {
    const user = (await query('SELECT * FROM users WHERE id = $1', [req.admin.sub])).rows[0];
    if (!user) throw httpError(404, 'Dein Benutzerkonto wurde nicht gefunden. Bitte melde dich erneut an.');
    // A typo here is an input error; a 401 would end the session of the person typing.
    if (!(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
      throw httpError(400, 'Das Passwort stimmt nicht. Gib das Passwort ein, mit dem du dich anmeldest.');
    }
    if (user.two_factor_enabled) {
      const secondFactor = verifyUserSecondFactor(user, req.body.code);
      if (!secondFactor.ok) throw httpError(400, 'Der Code stimmt nicht. Gib den aktuellen Code aus deiner Authenticator-App oder einen Recovery-Code ein.');
    }
    await query(
      `UPDATE users
       SET two_factor_secret_encrypted = null,
           two_factor_enabled = false,
           two_factor_confirmed_at = null,
           two_factor_recovery_hashes = '[]'::jsonb,
           two_factor_challenge_hash = null,
           two_factor_challenge_expires_at = null,
           updated_at = now()
       WHERE id = $1`,
      [user.id]
    );
    await writeAudit({ query }, {
      organizationId: user.organization_id,
      userId: user.id,
      action: 'security.2fa_disabled',
      entityType: 'user',
      entityId: user.id
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
