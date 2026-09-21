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

export const authRouter = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `Zu viele Anmeldeversuche von diesem Anschluss. Bitte warte ${describeWait(15 * 60 * 1000)} und versuche es dann erneut.` }
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.nodeEnv === 'test' ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `Zu viele Anfragen zum Zurücksetzen des Passworts. Bitte warte ${describeWait(60 * 60 * 1000)} und versuche es dann erneut.` }
});

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

authRouter.get('/setup/status', async (req, res, next) => {
  try {
    const userCount = Number((await query('SELECT count(*)::int AS count FROM users')).rows[0]?.count || 0);
    const organization = (await query('SELECT id, name, slug FROM organizations ORDER BY created_at ASC LIMIT 1')).rows[0] || null;
    res.json({
      setupRequired: userCount === 0,
      userCount,
      organization: organization ? { name: organization.name, slug: organization.slug } : null
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/setup/first-admin', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');
    const organizationName = String(req.body.organizationName || env.organizationName).trim();
    const organizationSlug = slugify(req.body.organizationSlug || organizationName || env.organizationSlug);

    if (!name) throw httpError(400, 'Bitte gib deinen Namen ein.');
    if (!email || !email.includes('@')) throw httpError(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
    if (password.length < 10) throw httpError(400, 'Das Passwort muss mindestens 10 Zeichen lang sein.');
    if (!organizationName) throw httpError(400, 'Bitte gib einen Organisationsnamen ein.');

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await withTransaction(async (client) => {
      await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
      const existingUsers = Number((await client.query('SELECT count(*)::int AS count FROM users')).rows[0]?.count || 0);
      if (existingUsers > 0) throw httpError(409, 'Die Ersteinrichtung ist bereits abgeschlossen. Bitte melde dich an oder nutze eine Einladung.');

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
          `INSERT INTO organizations (name, slug, primary_color, privacy_text, ticketshop_url, website_url, instagram_url)
           VALUES ($1, $2, '#2563eb', 'Feedback ist anonym möglich. E-Mail-Adressen werden nur für den gewählten Zweck gespeichert.', 'https://tickets.example.com', 'https://example.com', 'https://instagram.com/example')
           RETURNING *`,
          [organizationName, organizationSlug]
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

      return user;
    });

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
    const { email, password } = req.body;
    const result = await query('SELECT * FROM users WHERE email = $1', [String(email || '').toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
      throw httpError(401, 'E-Mail oder Passwort ist falsch. Prüfe beides oder setze dein Passwort zurück.');
    }
    if (user.status === 'disabled') throw httpError(403, 'Dieses Konto ist deaktiviert. Ein Admin deiner Organisation kann es wieder aktivieren.');
    if (user.status === 'invited') throw httpError(403, 'Dieses Konto ist noch nicht aktiviert. Öffne den Link aus deiner Einladungs-E-Mail und lege dort ein Passwort fest.');
    if (user.two_factor_enabled) {
      const challengeToken = randomToken(32);
      await query(
        `UPDATE users
         SET two_factor_challenge_hash = $2,
             two_factor_challenge_expires_at = now() + interval '10 minutes',
             updated_at = now()
         WHERE id = $1`,
        [user.id, hashValue(challengeToken)]
      );
      return res.json({
        twoFactorRequired: true,
        challengeToken,
        user: { email: user.email, name: user.name }
      });
    }
    res.json({ user: await completeLogin(res, user) });
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

authRouter.post('/accept-invite', authLimiter, async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    if (password.length < 10) throw httpError(400, 'Das Passwort muss mindestens 10 Zeichen lang sein.');
    const tokenHash = hashValue(token);
    const user = (await query(
      `SELECT * FROM users
       WHERE invite_token_hash = $1
         AND invite_expires_at > now()
         AND status = 'invited'`,
      [tokenHash]
    )).rows[0];
    if (!user) throw httpError(400, 'Dieser Einladungslink ist ungültig oder abgelaufen. Bitte einen Admin deiner Organisation, dich erneut einzuladen.');
    const passwordHash = await bcrypt.hash(password, 12);
    const updated = (await query(
      `UPDATE users
       SET password_hash = $2,
           name = COALESCE(NULLIF($3, ''), name),
           status = 'active',
           invite_token_hash = null,
           invite_expires_at = null,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [user.id, passwordHash, name]
    )).rows[0];
    res.json({ user: await completeLogin(res, updated) });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/password-reset/request', passwordResetLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').toLowerCase();
    const user = (await query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
    let resetUrl = null;
    if (user && user.status !== 'disabled') {
      const token = randomToken(32);
      resetUrl = `${env.adminAppUrl}/admin/reset-password?token=${token}`;
      await query(
        `UPDATE users
         SET password_reset_token_hash = $2,
             password_reset_expires_at = now() + interval '2 hours',
             password_reset_requested_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [user.id, hashValue(token)]
      );
      const smtp = new SmtpService({ query });
      await smtp.sendMail(user.organization_id, {
        to: user.email,
        subject: 'qrating Passwort zurücksetzen',
        text: `Du kannst dein qrating Passwort hier zurücksetzen:\n\n${resetUrl}\n\nDer Link ist 2 Stunden gültig.`
      }).catch(() => null);
    }
    res.json({ ok: true, resetUrl: env.nodeEnv === 'production' ? null : resetUrl });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/password-reset/confirm', authLimiter, async (req, res, next) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 10) throw httpError(400, 'Das Passwort muss mindestens 10 Zeichen lang sein.');
    const user = (await query(
      `SELECT * FROM users
       WHERE password_reset_token_hash = $1
         AND password_reset_expires_at > now()
         AND status <> 'disabled'`,
      [hashValue(String(req.body.token || ''))]
    )).rows[0];
    if (!user) throw httpError(400, 'Dieser Link zum Zurücksetzen ist ungültig oder abgelaufen. Fordere auf der Anmeldeseite einen neuen an.');
    const passwordHash = await bcrypt.hash(password, 12);
    const updated = (await query(
      `UPDATE users
       SET password_hash = $2,
           status = 'active',
           password_reset_token_hash = null,
           password_reset_expires_at = null,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [user.id, passwordHash]
    )).rows[0];
    res.json({ user: await completeLogin(res, updated) });
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
    res.json({
      ...user,
      role: req.admin.role || user.home_role,
      platformAdmin: Boolean(user.platform_admin),
      acting: Boolean(req.admin.acting) && user.home_organization_id !== user.organization_id,
      twoFactorEnabled: Boolean(user.two_factor_enabled),
      adminTheme: user.admin_theme || null,
      two_factor_enabled: undefined,
      platform_admin: undefined,
      admin_theme: undefined
    });
  } catch (error) {
    next(error);
  }
});

// The look of the admin area belongs to the person, in whichever tenant they are working.
// An unknown name is kept out; the page itself falls back to the default look for anything
// it does not know, so an older name left behind by a later release does no harm.
authRouter.patch('/me/preferences', requireAdmin, async (req, res, next) => {
  try {
    const theme = req.body?.adminTheme ?? null;
    if (theme !== null && (typeof theme !== 'string' || !/^[a-z0-9-]{1,40}$/.test(theme))) {
      throw httpError(400, 'Dieses Design gibt es nicht. Wähle eines unter Einstellungen → Darstellung.');
    }
    const updated = (await query(
      'UPDATE users SET admin_theme = $2, updated_at = now() WHERE id = $1 RETURNING admin_theme',
      [req.admin.sub, theme]
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
    if (!(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
      throw httpError(401, 'Das Passwort stimmt nicht.');
    }
    if (user.two_factor_enabled) {
      const secondFactor = verifyUserSecondFactor(user, req.body.code);
      if (!secondFactor.ok) throw httpError(401, 'Der Code stimmt nicht. Gib den aktuellen Code aus deiner Authenticator-App oder einen Recovery-Code ein.');
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
