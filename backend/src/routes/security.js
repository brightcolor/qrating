import express from 'express';
import { query } from '../db/pool.js';
import { canAccessEvent, hasRole, requireAdmin, requireRole } from '../middleware/auth.js';
import { httpError } from '../middleware/errors.js';
import { env } from '../config/env.js';
import { decryptSecret } from '../utils/crypto.js';
import { writeAudit } from '../services/auditService.js';

export const securityRouter = express.Router();
securityRouter.use(requireAdmin);

function weakSecret(value) {
  const raw = String(value || '');
  return raw.length < 32 || raw.startsWith('change-me') || raw.includes('dev-secret');
}

function check(id, label, ok, severity = 'warning', detail = '') {
  return { id, label, ok: Boolean(ok), severity, detail };
}

async function ensureCaseAccess(req, caseId) {
  const row = (await query(
    `SELECT lrc.*, e.name AS event_name, e.date_from
     FROM low_rating_cases lrc
     JOIN events e ON e.id = lrc.event_id
     WHERE lrc.id = $1 AND lrc.organization_id = $2`,
    [caseId, req.admin.organizationId]
  )).rows[0];
  if (!row) throw httpError(404, 'Low-Rating-Fall nicht gefunden.');
  if (!(await canAccessEvent({ query }, req.admin, row.event_id))) throw httpError(403, 'Keine Berechtigung fuer dieses Event.');
  return row;
}

securityRouter.get('/security-center', requireRole('admin'), async (req, res, next) => {
  try {
    const [
      users,
      smtp,
      jobs,
      legacyNewsletter,
      legacyWebhooks,
      legacyLowNotes,
      publicEvents,
      activeWebhooks,
      recentAudit
    ] = await Promise.all([
      query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'active')::int AS active,
                count(*) FILTER (WHERE status = 'active' AND role IN ('owner','admin') AND two_factor_enabled = false)::int AS admins_without_2fa,
                count(*) FILTER (WHERE status = 'active' AND two_factor_enabled = true)::int AS users_with_2fa
         FROM users WHERE organization_id = $1`,
        [req.admin.organizationId]
      ),
      query('SELECT enabled, host, from_email, last_test_status, last_test_at FROM smtp_settings WHERE organization_id = $1', [req.admin.organizationId]),
      query(
        `SELECT count(*) FILTER (WHERE status = 'failed')::int AS failed,
                count(*) FILTER (WHERE status IN ('queued','running'))::int AS open
         FROM background_jobs WHERE organization_id = $1`,
        [req.admin.organizationId]
      ),
      query('SELECT count(*)::int AS count FROM newsletter_optins WHERE organization_id = $1 AND email IS NOT NULL', [req.admin.organizationId]),
      query('SELECT count(*)::int AS count FROM webhook_endpoints WHERE organization_id = $1 AND secret IS NOT NULL', [req.admin.organizationId]),
      query('SELECT count(*)::int AS count FROM low_rating_cases WHERE organization_id = $1 AND contact_note IS NOT NULL', [req.admin.organizationId]),
      query('SELECT count(*)::int AS count FROM events WHERE organization_id = $1 AND feedback_enabled = true AND status = $2', [req.admin.organizationId, 'active']),
      query('SELECT count(*)::int AS count FROM webhook_endpoints WHERE organization_id = $1 AND active = true', [req.admin.organizationId]),
      query(
        `SELECT al.*, u.email AS user_email, u.name AS user_name
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.organization_id = $1
         ORDER BY al.created_at DESC
         LIMIT 15`,
        [req.admin.organizationId]
      )
    ]);

    const userStats = users.rows[0] || {};
    const jobStats = jobs.rows[0] || {};
    const smtpSettings = smtp.rows[0] || null;
    const checks = [
      check('session_secret', 'SESSION_SECRET is strong', !weakSecret(env.sessionSecret), 'critical', 'Use at least 32 random characters.'),
      check('encryption_secret', 'PRETIX_TOKEN_SECRET / encryption key is strong', !weakSecret(env.pretixTokenSecret), 'critical', 'This key protects Pretix tokens, SMTP passwords, contact data, and 2FA secrets.'),
      check('https_admin', 'Admin URL uses HTTPS', env.adminAppUrl.startsWith('https://'), 'critical', env.adminAppUrl),
      check('https_feedback', 'Feedback URL uses HTTPS', env.feedbackAppUrl.startsWith('https://'), 'critical', env.feedbackAppUrl),
      check('cors', 'CORS origin allowlist configured', env.nodeEnv !== 'production' || env.corsAllowedOrigins.length > 0, 'warning', env.corsAllowedOrigins.join(', ') || 'ADMIN_APP_URL and FEEDBACK_APP_URL are allowed by default.'),
      check('admin_2fa', 'Owner/Admin accounts use 2FA', Number(userStats.admins_without_2fa || 0) === 0, 'critical', `${userStats.admins_without_2fa || 0} owner/admin accounts without 2FA.`),
      check('smtp', 'SMTP configured for security mails', Boolean(smtpSettings?.enabled), 'warning', smtpSettings?.host || 'SMTP disabled.'),
      check('legacy_newsletter', 'No legacy plaintext newsletter emails', Number(legacyNewsletter.rows[0]?.count || 0) === 0, 'critical', `${legacyNewsletter.rows[0]?.count || 0} legacy rows still have plaintext email.`),
      check('legacy_webhooks', 'No legacy plaintext webhook secrets', Number(legacyWebhooks.rows[0]?.count || 0) === 0, 'critical', `${legacyWebhooks.rows[0]?.count || 0} webhook secrets should be rotated.`),
      check('legacy_low_notes', 'No legacy plaintext low-rating contact notes', Number(legacyLowNotes.rows[0]?.count || 0) === 0, 'critical', `${legacyLowNotes.rows[0]?.count || 0} legacy notes still contain plaintext.`),
      check('jobs', 'No failed background jobs', Number(jobStats.failed || 0) === 0, 'warning', `${jobStats.failed || 0} failed jobs.`)
    ];

    res.json({
      summary: {
        activeUsers: Number(userStats.active || 0),
        usersWith2fa: Number(userStats.users_with_2fa || 0),
        adminsWithout2fa: Number(userStats.admins_without_2fa || 0),
        failedJobs: Number(jobStats.failed || 0),
        openJobs: Number(jobStats.open || 0),
        activeFeedbackEvents: Number(publicEvents.rows[0]?.count || 0),
        activeWebhooks: Number(activeWebhooks.rows[0]?.count || 0),
        legacyNewsletterRows: Number(legacyNewsletter.rows[0]?.count || 0),
        legacyWebhookSecrets: Number(legacyWebhooks.rows[0]?.count || 0)
      },
      checks,
      recentAudit: recentAudit.rows
    });
  } catch (error) {
    next(error);
  }
});

securityRouter.get('/audit-log', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT al.*, u.email AS user_email, u.name AS user_name
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.organization_id = $1
       ORDER BY al.created_at DESC
       LIMIT 200`,
      [req.admin.organizationId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

securityRouter.get('/pii-vault', requireRole('event_manager'), async (req, res, next) => {
  try {
    const [summary, lowCases, newsletter] = await Promise.all([
      query(
        `SELECT
          (SELECT count(*)::int FROM low_rating_cases WHERE organization_id = $1 AND (contact_phone_encrypted IS NOT NULL OR contact_note_encrypted IS NOT NULL)) AS low_rating_contacts,
          (SELECT count(*)::int FROM newsletter_optins WHERE organization_id = $1) AS newsletter_contacts,
          (SELECT count(*)::int FROM newsletter_optins WHERE organization_id = $1 AND email IS NOT NULL) AS legacy_newsletter_plaintext,
          (SELECT count(*)::int FROM webhook_endpoints WHERE organization_id = $1 AND secret IS NOT NULL) AS legacy_webhook_secrets`,
        [req.admin.organizationId]
      ),
      query(
        `SELECT lrc.id, lrc.rating, lrc.status, lrc.created_at, lrc.event_id, e.name AS event_name,
                lrc.contact_phone_encrypted IS NOT NULL AS contact_phone_available,
                (lrc.contact_note_encrypted IS NOT NULL OR lrc.contact_note IS NOT NULL) AS contact_note_available
         FROM low_rating_cases lrc
         JOIN events e ON e.id = lrc.event_id
         WHERE lrc.organization_id = $1
           AND (lrc.contact_phone_encrypted IS NOT NULL OR lrc.contact_note_encrypted IS NOT NULL OR lrc.contact_note IS NOT NULL)
         ORDER BY lrc.created_at DESC
         LIMIT 100`,
        [req.admin.organizationId]
      ),
      query(
        `SELECT no.id, no.event_id, no.email_hash, no.email_domain, no.consent_given_at, no.source, e.name AS event_name,
                no.email_encrypted IS NOT NULL AS encrypted,
                no.email IS NOT NULL AS legacy_plaintext
         FROM newsletter_optins no
         LEFT JOIN events e ON e.id = no.event_id
         WHERE no.organization_id = $1
         ORDER BY no.consent_given_at DESC
         LIMIT 100`,
        [req.admin.organizationId]
      )
    ]);
    res.json({ summary: summary.rows[0] || {}, lowRatingCases: lowCases.rows, newsletterOptins: newsletter.rows });
  } catch (error) {
    next(error);
  }
});

securityRouter.post('/pii-vault/low-rating-cases/:id/reveal', async (req, res, next) => {
  try {
    const row = await ensureCaseAccess(req, req.params.id);
    const contactPhone = row.contact_phone_encrypted ? decryptSecret(row.contact_phone_encrypted) : null;
    const contactNote = row.contact_note_encrypted ? decryptSecret(row.contact_note_encrypted) : row.contact_note;
    await writeAudit({ query }, {
      organizationId: req.admin.organizationId,
      userId: req.admin.sub,
      action: 'pii.reveal_low_rating_contact',
      entityType: 'low_rating_case',
      entityId: row.id,
      metadata: { eventId: row.event_id, contactPhoneAvailable: Boolean(contactPhone), contactNoteAvailable: Boolean(contactNote) }
    });
    res.json({ contactPhone, contactNote });
  } catch (error) {
    next(error);
  }
});

securityRouter.delete('/pii-vault/low-rating-cases/:id/contact', async (req, res, next) => {
  try {
    const row = await ensureCaseAccess(req, req.params.id);
    await query(
      `UPDATE low_rating_cases
       SET contact_phone_encrypted = null,
           contact_note = null,
           contact_note_encrypted = null,
           updated_at = now()
       WHERE id = $1 AND organization_id = $2`,
      [row.id, req.admin.organizationId]
    );
    await writeAudit({ query }, {
      organizationId: req.admin.organizationId,
      userId: req.admin.sub,
      action: 'pii.delete_low_rating_contact',
      entityType: 'low_rating_case',
      entityId: row.id,
      metadata: { eventId: row.event_id }
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

securityRouter.post('/pii-vault/newsletter-optins/:id/reveal', requireRole('event_manager'), async (req, res, next) => {
  try {
    const row = (await query(
      `SELECT no.*, e.name AS event_name
       FROM newsletter_optins no
       LEFT JOIN events e ON e.id = no.event_id
       WHERE no.id = $1 AND no.organization_id = $2`,
      [req.params.id, req.admin.organizationId]
    )).rows[0];
    if (!row) throw httpError(404, 'Newsletter-Opt-in nicht gefunden.');
    if (row.event_id && !(await canAccessEvent({ query }, req.admin, row.event_id))) throw httpError(403, 'Keine Berechtigung fuer dieses Event.');
    await writeAudit({ query }, {
      organizationId: req.admin.organizationId,
      userId: req.admin.sub,
      action: 'pii.reveal_newsletter_email',
      entityType: 'newsletter_optin',
      entityId: row.id,
      metadata: { eventId: row.event_id, emailDomain: row.email_domain }
    });
    res.json({ email: row.email_encrypted ? decryptSecret(row.email_encrypted) : row.email });
  } catch (error) {
    next(error);
  }
});

securityRouter.delete('/pii-vault/newsletter-optins/:id', requireRole('event_manager'), async (req, res, next) => {
  try {
    const row = (await query(
      'SELECT id, event_id, email_domain FROM newsletter_optins WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.admin.organizationId]
    )).rows[0];
    if (!row) throw httpError(404, 'Newsletter-Opt-in nicht gefunden.');
    if (row.event_id && !(await canAccessEvent({ query }, req.admin, row.event_id))) throw httpError(403, 'Keine Berechtigung fuer dieses Event.');
    await query('DELETE FROM newsletter_optins WHERE id = $1 AND organization_id = $2', [row.id, req.admin.organizationId]);
    await writeAudit({ query }, {
      organizationId: req.admin.organizationId,
      userId: req.admin.sub,
      action: 'pii.delete_newsletter_email',
      entityType: 'newsletter_optin',
      entityId: row.id,
      metadata: { eventId: row.event_id, emailDomain: row.email_domain }
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

securityRouter.post('/pii-vault/cleanup-legacy', requireRole('owner'), async (req, res, next) => {
  try {
    const newsletter = await query(
      `UPDATE newsletter_optins
       SET email = null
       WHERE organization_id = $1 AND email_encrypted IS NOT NULL AND email IS NOT NULL
       RETURNING id`,
      [req.admin.organizationId]
    );
    await query(
      `UPDATE low_rating_cases
       SET contact_note = null
       WHERE organization_id = $1 AND contact_note IS NOT NULL`,
      [req.admin.organizationId]
    );
    await writeAudit({ query }, {
      organizationId: req.admin.organizationId,
      userId: req.admin.sub,
      action: 'pii.cleanup_legacy_plaintext',
      entityType: 'organization',
      entityId: req.admin.organizationId,
      metadata: { newsletterRows: newsletter.rowCount }
    });
    res.json({ ok: true, newsletterRows: newsletter.rowCount });
  } catch (error) {
    next(error);
  }
});
