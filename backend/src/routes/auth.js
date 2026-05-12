import express from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../db/pool.js';
import { signAdmin, requireAdmin } from '../middleware/auth.js';
import { httpError } from '../middleware/errors.js';
import { env } from '../config/env.js';
import { hashValue, randomToken, slugify } from '../utils/crypto.js';
import { SmtpService } from '../services/smtpService.js';

export const authRouter = express.Router();

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

authRouter.post('/setup/first-admin', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');
    const organizationName = String(req.body.organizationName || env.organizationName).trim();
    const organizationSlug = slugify(req.body.organizationSlug || organizationName || env.organizationSlug);

    if (!name) throw httpError(400, 'Bitte gib deinen Namen ein.');
    if (!email || !email.includes('@')) throw httpError(400, 'Bitte gib eine gueltige E-Mail-Adresse ein.');
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
           VALUES ($1, $2, '#2563eb', 'Feedback ist anonym moeglich. E-Mail-Adressen werden nur fuer den gewaehlten Zweck gespeichert.', 'https://tickets.example.com', 'https://example.com', 'https://instagram.com/example')
           RETURNING *`,
          [organizationName, organizationSlug]
        )).rows[0];

      const user = (await client.query(
        `INSERT INTO users (organization_id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'owner', 'active')
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

    const token = signAdmin(created);
    res.cookie('qrating_admin', token, { httpOnly: true, sameSite: 'lax', secure: false });
    res.status(201).json({ token, user: { id: created.id, name: created.name, email: created.email, role: created.role } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await query('SELECT * FROM users WHERE email = $1', [String(email || '').toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
      throw httpError(401, 'E-Mail oder Passwort ist falsch.');
    }
    if (user.status === 'disabled') throw httpError(403, 'Dieser Benutzer ist deaktiviert.');
    if (user.status === 'invited') throw httpError(403, 'Bitte schliesse zuerst die Einladung ab.');
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    const token = signAdmin(user);
    res.cookie('qrating_admin', token, { httpOnly: true, sameSite: 'lax', secure: false });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/accept-invite', async (req, res, next) => {
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
    if (!user) throw httpError(400, 'Einladung ist ungueltig oder abgelaufen.');
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
    res.json({ token: signAdmin(updated), user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/password-reset/request', async (req, res, next) => {
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
        subject: 'qrating Passwort zuruecksetzen',
        text: `Du kannst dein qrating Passwort hier zuruecksetzen:\n\n${resetUrl}\n\nDer Link ist 2 Stunden gueltig.`
      }).catch(() => null);
    }
    res.json({ ok: true, resetUrl: env.nodeEnv === 'production' ? null : resetUrl });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/password-reset/confirm', async (req, res, next) => {
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
    if (!user) throw httpError(400, 'Reset-Link ist ungueltig oder abgelaufen.');
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
    res.json({ token: signAdmin(updated), user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('qrating_admin');
  res.json({ ok: true });
});

authRouter.get('/me', requireAdmin, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, o.id AS organization_id, o.name AS organization_name, o.slug AS organization_slug
       FROM users u JOIN organizations o ON o.id = u.organization_id WHERE u.id = $1`,
      [req.admin.sub]
    );
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
