import express from 'express';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { canAccessEvent, hasRole, requireAdmin, requireRole } from '../middleware/auth.js';
import { httpError } from '../middleware/errors.js';
import { env } from '../config/env.js';
import { decryptSecret, encryptSecret, hashValue } from '../utils/crypto.js';
import { randomToken } from '../utils/crypto.js';
import { EventResolver, calculateFeedbackWindow } from '../services/eventResolver.js';
import { PretixService } from '../services/pretixService.js';
import { normalizeEventInput } from '../db/bootstrap.js';
import { toCsv, toXlsx } from '../utils/export.js';
import { defaultTexts, defaultTextsByLanguage } from '../services/textService.js';
import { buildEventReportPdf } from '../utils/pdf.js';
import { SmtpService } from '../services/smtpService.js';
import { NotificationService, publicChannel } from '../services/notificationService.js';
import { enqueueJob } from '../services/jobService.js';
import { getSiteContent, updateSiteContent } from '../services/siteContentService.js';
import {
  applyBillingOverride,
  effectiveBillingPlan,
  getBillingPlanById,
  getBillingOverview,
  updateBillingPlans
} from '../services/billingService.js';

export const adminRouter = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get('/site-content', async (req, res, next) => {
  try {
    const site = await getSiteContent({ query });
    res.json({ content: site.content, updatedAt: site.updated_at, updatedBy: site.updated_by });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/site-content', requireRole('admin'), async (req, res, next) => {
  try {
    const site = await updateSiteContent({ query }, req.body.content || req.body, req.admin.sub);
    res.json({ content: site.content, updatedAt: site.updated_at, updatedBy: site.updated_by });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/billing', requireRole('admin'), async (req, res, next) => {
  try {
    res.json(await getBillingOverview({ query }, req.admin.organizationId, req.admin.sub));
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/billing/override', requireRole('admin'), async (req, res, next) => {
  try {
    await applyBillingOverride({ query }, req.admin.organizationId, req.admin.sub, req.body);
    res.json(await getBillingOverview({ query }, req.admin.organizationId, req.admin.sub));
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/billing/plans', requireRole('admin'), async (req, res, next) => {
  try {
    await updateBillingPlans({ query }, req.admin.sub, req.body.plans || []);
    res.json(await getBillingOverview({ query }, req.admin.organizationId, req.admin.sub));
  } catch (error) {
    next(error);
  }
});

async function ensureEventAccess(req, eventId) {
  if (!(await canAccessEvent({ query }, req.admin, eventId))) {
    throw httpError(403, 'Keine Berechtigung fuer dieses Event.');
  }
}

async function currentPlanForRequest(req) {
  const org = (await query('SELECT * FROM organizations WHERE id = $1', [req.admin.organizationId])).rows[0];
  return getBillingPlanById({ query }, effectiveBillingPlan(org).plan);
}

async function ensurePlanFeature(req, feature, message) {
  const plan = await currentPlanForRequest(req);
  if (!plan.limits[feature]) throw httpError(402, message);
  return plan;
}

async function ensureActiveEventLimit(req) {
  const plan = await currentPlanForRequest(req);
  if (plan.limits.activeEvents === null) return plan;
  const count = Number((await query(
    `SELECT count(*)::int AS count
     FROM events
     WHERE organization_id = $1 AND status <> 'archived'`,
    [req.admin.organizationId]
  )).rows[0]?.count || 0);
  if (count >= plan.limits.activeEvents) {
    throw httpError(402, `Der ${plan.name}-Plan erlaubt maximal ${plan.limits.activeEvents} aktive Events. Bitte upgrade auf Pro oder Business.`);
  }
  return plan;
}

adminRouter.get('/dashboard', async (req, res, next) => {
  try {
    const org = (await query('SELECT * FROM organizations WHERE id = $1', [req.admin.organizationId])).rows[0];
    const resolver = new EventResolver({ query });
    const current = await resolver.resolveCurrentEvent(org.slug);
    const manager = hasRole(req.admin.role, 'event_manager');
    const currentEvent = !manager && current.event && !(await canAccessEvent({ query }, req.admin, current.event.id))
      ? null
      : current.event;
    const stats = manager
      ? await query(
        `SELECT count(*)::int AS feedback_count,
                round(avg(rating)::numeric, 2) AS average_rating,
                count(*) FILTER (WHERE newsletter_optin)::int AS newsletter_count
         FROM feedback_responses WHERE organization_id = $1`,
        [org.id]
      )
      : await query(
        `SELECT count(*)::int AS feedback_count,
                round(avg(rating)::numeric, 2) AS average_rating,
                count(*) FILTER (WHERE newsletter_optin)::int AS newsletter_count
         FROM feedback_responses fr
         WHERE fr.organization_id = $1
           AND EXISTS (SELECT 1 FROM user_event_assignments uea WHERE uea.event_id = fr.event_id AND uea.user_id = $2)`,
        [org.id, req.admin.sub]
      );
    const events = manager
      ? await query('SELECT * FROM events WHERE organization_id = $1 ORDER BY date_from DESC LIMIT 10', [org.id])
      : await query(
        `SELECT e.* FROM events e
         JOIN user_event_assignments uea ON uea.event_id = e.id
         WHERE e.organization_id = $1 AND uea.user_id = $2
         ORDER BY e.date_from DESC LIMIT 10`,
        [org.id, req.admin.sub]
      );
    res.json({
      organization: org,
      currentEvent,
      candidates: manager ? (current.candidates || []) : [],
      stats: stats.rows[0],
      events: events.rows,
      adminAppUrl: env.adminAppUrl,
      feedbackAppUrl: env.feedbackAppUrl
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events', async (req, res, next) => {
  try {
    const result = hasRole(req.admin.role, 'event_manager')
      ? await query('SELECT * FROM events WHERE organization_id = $1 ORDER BY date_from DESC', [req.admin.organizationId])
      : await query(
        `SELECT e.* FROM events e
         JOIN user_event_assignments uea ON uea.event_id = e.id
         WHERE e.organization_id = $1 AND uea.user_id = $2
         ORDER BY e.date_from DESC`,
        [req.admin.organizationId, req.admin.sub]
      );
    res.json(result.rows.map((event) => ({
      ...event,
      feedbackWindow: calculateFeedbackWindow(event),
      feedbackUrl: `${env.feedbackAppUrl}/e/${event.event_feedback_token}`
    })));
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/events', requireRole('event_manager'), async (req, res, next) => {
  try {
    await ensureActiveEventLimit(req);
    const organization = (await query('SELECT * FROM organizations WHERE id = $1', [req.admin.organizationId])).rows[0];
    const input = normalizeEventInput(req.body, organization);
    if (!input.name || !input.date_from) throw httpError(400, 'Eventname und Datum sind erforderlich.');
    const result = await query(
      `INSERT INTO events (
        organization_id, source, name, slug, event_feedback_token, date_from, date_to, event_timezone, location,
        image_url, image_alt, image_source, status, feedback_enabled, feedback_window_days, feedback_window_hours, feedback_starts_mode
      )
      VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $9 IS NULL THEN null ELSE 'manual' END, 'active', true, $11, $12, $13)
      RETURNING *`,
      [
        req.admin.organizationId,
        input.name,
        input.slug,
        randomToken(),
        input.date_from,
        input.date_to,
        input.event_timezone,
        input.location,
        input.image_url,
        input.image_alt,
        input.feedback_window_days,
        input.feedback_window_hours,
        input.feedback_starts_mode
      ]
    );
    const event = result.rows[0];
    await query(
      `INSERT INTO feedback_forms (organization_id, event_id, name, description, active)
       VALUES ($1, $2, 'Standardformular', 'Gesamtbewertung, Freitext und Newsletter', true)`,
      [req.admin.organizationId, event.id]
    );
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const event = (await query('SELECT * FROM events WHERE id = $1 AND organization_id = $2', [req.params.id, req.admin.organizationId])).rows[0];
    if (!event) throw httpError(404, 'Event nicht gefunden.');
    const forms = await query('SELECT * FROM feedback_forms WHERE event_id = $1 ORDER BY created_at', [event.id]);
    const questions = await query(
      `SELECT q.* FROM feedback_questions q
       JOIN feedback_forms f ON f.id = q.feedback_form_id
       WHERE f.event_id = $1 ORDER BY q.sort_order`,
      [event.id]
    );
    res.json({ event, forms: forms.rows, questions: questions.rows, feedbackWindow: calculateFeedbackWindow(event) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/assignments', async (req, res, next) => {
  try {
    if (!hasRole(req.admin.role, 'event_manager')) throw httpError(403, 'Keine Berechtigung fuer Event-Zuweisungen.');
    const result = await query(
      `SELECT u.id AS user_id, u.name, u.email, COALESCE(uea.notify_low_rating, false) AS notify_low_rating,
              uea.id IS NOT NULL AS assigned
       FROM users u
       LEFT JOIN user_event_assignments uea ON uea.user_id = u.id AND uea.event_id = $1
       WHERE u.organization_id = $2
       ORDER BY u.name`,
      [req.params.id, req.admin.organizationId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

adminRouter.put('/events/:id/assignments', async (req, res, next) => {
  try {
    if (!hasRole(req.admin.role, 'event_manager')) throw httpError(403, 'Keine Berechtigung fuer Event-Zuweisungen.');
    await ensurePlanFeature(req, 'teams', 'Event-Zuweisungen und Team-Management sind im Business-Plan enthalten.');
    const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];
    await query('DELETE FROM user_event_assignments WHERE event_id = $1 AND organization_id = $2', [req.params.id, req.admin.organizationId]);
    for (const assignment of assignments.filter((item) => item.assigned)) {
      await query(
        `INSERT INTO user_event_assignments (organization_id, user_id, event_id, notify_low_rating)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, event_id)
         DO UPDATE SET notify_low_rating = EXCLUDED.notify_low_rating, updated_at = now()`,
        [req.admin.organizationId, assignment.userId, req.params.id, assignment.notifyLowRating !== false]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/events/:id', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const result = await query(
      `UPDATE events SET
        name = COALESCE($3, name),
        location = COALESCE($4, location),
        date_from = COALESCE($5, date_from),
        date_to = $6,
        feedback_enabled = COALESCE($7, feedback_enabled),
        status = COALESCE($8, status),
        feedback_window_days = COALESCE($9, feedback_window_days),
        feedback_window_hours = $10,
        resolver_priority = COALESCE($11, resolver_priority),
        updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.admin.organizationId,
        req.body.name,
        req.body.location,
        req.body.dateFrom,
        req.body.dateTo ?? null,
        req.body.feedbackEnabled,
        req.body.status,
        req.body.feedbackWindowDays,
        req.body.feedbackWindowHours ?? null,
        req.body.resolverPriority
      ]
    );
    if (!result.rows[0]) throw httpError(404, 'Event nicht gefunden.');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/events/:id', requireRole('event_manager'), async (req, res, next) => {
  try {
    await query('DELETE FROM events WHERE id = $1 AND organization_id = $2', [req.params.id, req.admin.organizationId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/analytics', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const summary = await query(
      `SELECT count(*)::int AS total,
              round(avg(rating)::numeric, 2) AS average_rating,
              count(*) FILTER (WHERE newsletter_optin)::int AS newsletter_optins
       FROM feedback_responses WHERE event_id = $1`,
      [req.params.id]
    );
    const distribution = await query(
      `SELECT rating, count(*)::int AS count FROM feedback_responses
       WHERE event_id = $1 GROUP BY rating ORDER BY rating`,
      [req.params.id]
    );
    const comments = await query(
      `SELECT id, rating, comment_positive, comment_improvement, general_comment, newsletter_optin, submitted_at
       FROM feedback_responses WHERE event_id = $1 ORDER BY submitted_at DESC LIMIT 100`,
      [req.params.id]
    );
    const questionStats = await query(
      `SELECT q.id, q.internal_name, q.label, q.question_type, fa.answer_value, count(*)::int AS count
       FROM feedback_answers fa
       JOIN feedback_questions q ON q.id = fa.feedback_question_id
       JOIN feedback_responses fr ON fr.id = fa.feedback_response_id
       WHERE fr.event_id = $1 AND q.show_in_dashboard = true
       GROUP BY q.id, q.internal_name, q.label, q.question_type, fa.answer_value
       ORDER BY q.label, count DESC`,
      [req.params.id]
    );
    const timeline = await query(
      `SELECT date_trunc('hour', submitted_at) AS bucket, count(*)::int AS count, round(avg(rating)::numeric, 2) AS average_rating
       FROM feedback_responses
       WHERE event_id = $1
       GROUP BY bucket
       ORDER BY bucket`,
      [req.params.id]
    );
    res.json({
      summary: summary.rows[0],
      distribution: distribution.rows,
      comments: comments.rows,
      questionStats: questionStats.rows,
      timeline: timeline.rows
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/qr-analytics', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const bySource = await query(
      `SELECT COALESCE(qs.label, qds.source_type) AS label,
              COALESCE(qs.source_slug, qds.source_type) AS source_slug,
              sum(qds.scans_count)::int AS scans_count,
              sum(qds.feedback_count)::int AS feedback_count,
              round(avg(qds.average_rating)::numeric, 2) AS average_rating,
              sum(qds.newsletter_optins)::int AS newsletter_optins,
              sum(qds.low_ratings)::int AS low_ratings
       FROM qr_source_daily_stats qds
       LEFT JOIN qr_sources qs ON qs.id = qds.qr_source_id
       WHERE qds.event_id = $1
       GROUP BY qs.label, qs.source_slug, qds.source_type
       ORDER BY feedback_count DESC, scans_count DESC`,
      [req.params.id]
    );
    const timeline = await query(
      `SELECT day, sum(scans_count)::int AS scans_count, sum(feedback_count)::int AS feedback_count
       FROM qr_source_daily_stats
       WHERE event_id = $1
       GROUP BY day
       ORDER BY day`,
      [req.params.id]
    );
    res.json({ bySource: bySource.rows, timeline: timeline.rows });
  } catch (error) {
    next(error);
  }
});

async function exportRows(eventId) {
  const rows = await query(
    `SELECT fr.submitted_at, e.name AS event_name, fr.source_type, fr.rating, fr.nps_score,
            fr.comment_positive, fr.comment_improvement, fr.general_comment, fr.newsletter_optin,
            q.internal_name, q.label, fa.answer_value
     FROM feedback_responses fr
     JOIN events e ON e.id = fr.event_id
     LEFT JOIN feedback_answers fa ON fa.feedback_response_id = fr.id
     LEFT JOIN feedback_questions q ON q.id = fa.feedback_question_id AND q.show_in_export = true
     WHERE fr.event_id = $1 ORDER BY fr.submitted_at`,
    [eventId]
  );
  const grouped = new Map();
  for (const row of rows.rows) {
    const key = `${row.submitted_at.toISOString?.() || row.submitted_at}-${row.rating}-${row.general_comment || ''}`;
    if (!grouped.has(key)) grouped.set(key, {
      submitted_at: row.submitted_at,
      event_name: row.event_name,
      source_type: row.source_type,
      rating: row.rating,
      nps_score: row.nps_score,
      comment_positive: row.comment_positive,
      comment_improvement: row.comment_improvement,
      general_comment: row.general_comment,
      newsletter_optin: row.newsletter_optin
    });
    if (row.internal_name) grouped.get(key)[row.internal_name] = JSON.stringify(row.answer_value);
  }
  return [...grouped.values()];
}

adminRouter.get('/events/:id/export.csv', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const rows = await exportRows(req.params.id);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="qrating-feedback.csv"');
    res.send(toCsv(rows));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/export.xlsx', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const rows = await exportRows(req.params.id);
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', 'attachment; filename="qrating-feedback.xlsx"');
    res.send(toXlsx(rows));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/newsletter.csv', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const result = await query(
      `SELECT no.email, no.consent_text, no.consent_given_at, e.name AS event_name
       FROM newsletter_optins no
       LEFT JOIN events e ON e.id = no.event_id
       WHERE no.event_id = $1
       ORDER BY no.consent_given_at`,
      [req.params.id]
    );
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="qrating-newsletter.csv"');
    res.send(toCsv(result.rows));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/report.pdf', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const event = (await query('SELECT * FROM events WHERE id = $1 AND organization_id = $2', [req.params.id, req.admin.organizationId])).rows[0];
    if (!event) throw httpError(404, 'Event nicht gefunden.');
    const summaryResult = await query(
      `SELECT count(*)::int AS total,
              round(avg(rating)::numeric, 2) AS average_rating,
              round(avg(nps_score)::numeric, 2) AS average_nps,
              count(*) FILTER (WHERE rating <= 2)::int AS low_ratings,
              count(*) FILTER (WHERE newsletter_optin)::int AS newsletter_optins
       FROM feedback_responses WHERE event_id = $1`,
      [event.id]
    );
    const distribution = await query(
      `SELECT rating, count(*)::int AS count
       FROM feedback_responses
       WHERE event_id = $1
       GROUP BY rating
       ORDER BY rating`,
      [event.id]
    );
    const timeline = await query(
      `SELECT date_trunc('hour', submitted_at) AS bucket,
              count(*)::int AS count,
              round(avg(rating)::numeric, 2) AS average_rating
       FROM feedback_responses
       WHERE event_id = $1
       GROUP BY bucket
       ORDER BY bucket`,
      [event.id]
    );
    const questionStats = await query(
      `SELECT q.label, q.question_type, fa.answer_value, count(*)::int AS count
       FROM feedback_answers fa
       JOIN feedback_questions q ON q.id = fa.feedback_question_id
       JOIN feedback_responses fr ON fr.id = fa.feedback_response_id
       WHERE fr.event_id = $1 AND q.show_in_dashboard = true
       GROUP BY q.label, q.question_type, fa.answer_value
       ORDER BY q.label, count DESC`,
      [event.id]
    );
    const comments = await query(
      `SELECT rating, comment_positive, comment_improvement, general_comment, submitted_at
       FROM feedback_responses
       WHERE event_id = $1
       ORDER BY submitted_at DESC
       LIMIT 50`,
      [event.id]
    );
    const pdf = buildEventReportPdf({
      event,
      summary: summaryResult.rows[0],
      distribution: distribution.rows,
      timeline: timeline.rows,
      questionStats: questionStats.rows,
      comments: comments.rows
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'attachment; filename="qrating-report.pdf"');
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/events/:id/report-email', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const targetUserId = req.body.userId || req.admin.sub;
    if (!hasRole(req.admin.role, 'event_manager') && targetUserId !== req.admin.sub) {
      throw httpError(403, 'Reports duerfen nur an den eigenen Benutzer gesendet werden.');
    }
    const targetUser = (await query(
      'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
      [targetUserId, req.admin.organizationId]
    )).rows[0];
    if (!targetUser) throw httpError(404, 'Benutzer nicht gefunden.');
    const job = await enqueueJob({ query }, req.admin.organizationId, 'report.email', {
      eventId: req.params.id,
      userId: targetUserId
    });
    res.status(202).json({ ok: true, job });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/image-cache', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const result = await query(
      `SELECT * FROM event_image_cache
       WHERE event_id = $1
       ORDER BY created_at DESC, variant`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/events/:id/sync-image', requireRole('event_manager'), async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const event = (await query(
      `SELECT e.*, pc.api_token_encrypted, pc.base_url, pc.pretix_organizer_slug, pc.cache_event_images,
              pc.allowed_image_hosts, pc.preferred_image_settings_key, pc.image_key_candidates
       FROM events e
       JOIN pretix_connections pc ON pc.id = e.pretix_connection_id
       WHERE e.id = $1 AND e.organization_id = $2`,
      [req.params.id, req.admin.organizationId]
    )).rows[0];
    if (!event) throw httpError(404, 'Pretix-Event nicht gefunden.');
    const connection = {
      ...event,
      id: event.pretix_connection_id,
      organization_id: event.organization_id,
      api_token: decryptSecret(event.api_token_encrypted)
    };
    const service = new PretixService({ query });
    const image = await service.syncImageForEvent(connection, event, event.pretix_event_slug);
    res.json({ ok: true, image });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/qr', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const event = (await query('SELECT * FROM events WHERE id = $1 AND organization_id = $2', [req.params.id, req.admin.organizationId])).rows[0];
    if (!event) throw httpError(404, 'Event nicht gefunden.');
    const url = `${env.feedbackAppUrl}/e/${event.event_feedback_token}`;
    res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 1 }));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/qr-print', async (req, res, next) => {
  try {
    await ensureEventAccess(req, req.params.id);
    const event = (await query('SELECT * FROM events WHERE id = $1 AND organization_id = $2', [req.params.id, req.admin.organizationId])).rows[0];
    if (!event) throw httpError(404, 'Event nicht gefunden.');
    const url = `${env.feedbackAppUrl}/e/${event.event_feedback_token}`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
    res.type('html').send(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>QR ${event.name}</title><style>body{font-family:Arial,sans-serif;margin:0;padding:48px;text-align:center}.sheet{border:1px solid #ddd;padding:48px;max-width:640px;margin:auto}svg{width:320px;height:320px}h1{font-size:34px;margin:0 0 16px}p{font-size:18px;color:#555}</style></head><body><div class="sheet"><h1>${event.name}</h1>${svg}<p>Scannen, bewerten, fertig.</p><p>${url}</p></div><script>window.print()</script></body></html>`);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/organizations/:id/qr', async (req, res, next) => {
  try {
    const org = (await query('SELECT * FROM organizations WHERE id = $1 AND id = $2', [req.params.id, req.admin.organizationId])).rows[0];
    if (!org) throw httpError(404, 'Organisation nicht gefunden.');
    const url = `${env.feedbackAppUrl}/f/${org.slug}`;
    res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 1 }));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/forms', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM feedback_forms WHERE organization_id = $1 ORDER BY created_at DESC', [req.admin.organizationId]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/forms/:id', async (req, res, next) => {
  try {
    const form = (await query(
      'SELECT * FROM feedback_forms WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.admin.organizationId]
    )).rows[0];
    if (!form) throw httpError(404, 'Formular nicht gefunden.');
    const questions = await query(
      'SELECT * FROM feedback_questions WHERE feedback_form_id = $1 ORDER BY sort_order, created_at',
      [form.id]
    );
    res.json({ form, questions: questions.rows });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/forms', async (req, res, next) => {
  try {
    const plan = await currentPlanForRequest(req);
    if (plan.limits.templates !== null) {
      const count = Number((await query('SELECT count(*)::int AS count FROM feedback_forms WHERE organization_id = $1', [req.admin.organizationId])).rows[0]?.count || 0);
      if (count >= plan.limits.templates) throw httpError(402, `Der ${plan.name}-Plan enthaelt maximal ${plan.limits.templates} Formularvorlagen/Formulare.`);
    }
    const result = await query(
      `INSERT INTO feedback_forms (organization_id, event_id, name, description, is_template, active)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        req.admin.organizationId,
        req.body.eventId || null,
        req.body.name || 'Neues Formular',
        req.body.description || null,
        Boolean(req.body.isTemplate),
        req.body.active !== false
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/forms/:id', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE feedback_forms
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           active = COALESCE($5, active),
           updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [req.params.id, req.admin.organizationId, req.body.name, req.body.description, req.body.active]
    );
    if (!result.rows[0]) throw httpError(404, 'Formular nicht gefunden.');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/forms/:id/questions', async (req, res, next) => {
  try {
    const result = await query(
      `INSERT INTO feedback_questions (feedback_form_id, question_type, internal_name, label, help_text, placeholder, required, sort_order, options, visibility_rules)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.params.id,
        req.body.questionType || 'text_short',
        req.body.internalName,
        req.body.label,
        req.body.helpText || null,
        req.body.placeholder || null,
        Boolean(req.body.required),
        Number(req.body.sortOrder || 0),
        req.body.options ? JSON.stringify(req.body.options) : null,
        req.body.visibilityRules ? JSON.stringify(req.body.visibilityRules) : null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/forms/:id/questions/:questionId', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE feedback_questions SET
       label = COALESCE($3, label),
       active = COALESCE($4, active),
       required = COALESCE($5, required),
       sort_order = COALESCE($6, sort_order),
       question_type = COALESCE($7, question_type),
       internal_name = COALESCE($8, internal_name),
       help_text = $9,
       placeholder = $10,
       options = $11,
       visibility_rules = $12,
       show_in_export = COALESCE($13, show_in_export),
       show_in_dashboard = COALESCE($14, show_in_dashboard),
       updated_at = now()
       WHERE id = $2 AND feedback_form_id = $1 RETURNING *`,
      [
        req.params.id,
        req.params.questionId,
        req.body.label,
        req.body.active,
        req.body.required,
        req.body.sortOrder,
        req.body.questionType,
        req.body.internalName,
        req.body.helpText ?? null,
        req.body.placeholder ?? null,
        req.body.options ? JSON.stringify(req.body.options) : null,
        req.body.visibilityRules ? JSON.stringify(req.body.visibilityRules) : null,
        req.body.showInExport,
        req.body.showInDashboard
      ]
    );
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/forms/:id/questions/:questionId', async (req, res, next) => {
  try {
    await query('DELETE FROM feedback_questions WHERE id = $1 AND feedback_form_id = $2', [req.params.questionId, req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/forms/:id/duplicate', async (req, res, next) => {
  try {
    const form = (await query(
      'SELECT * FROM feedback_forms WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.admin.organizationId]
    )).rows[0];
    if (!form) throw httpError(404, 'Formular nicht gefunden.');
    const duplicated = (await query(
      `INSERT INTO feedback_forms (organization_id, event_id, name, description, is_template, active)
       VALUES ($1,$2,$3,$4,false,true) RETURNING *`,
      [req.admin.organizationId, req.body.eventId || form.event_id, `${form.name} Kopie`, form.description]
    )).rows[0];
    await query(
      `INSERT INTO feedback_questions (
        feedback_form_id, question_type, internal_name, label, help_text, placeholder, required, sort_order, active,
        category, privacy_relevant, show_in_export, show_in_dashboard, anonymous_answer, visibility_rules, options
      )
      SELECT $1, question_type, internal_name, label, help_text, placeholder, required, sort_order, active,
        category, privacy_relevant, show_in_export, show_in_dashboard, anonymous_answer, visibility_rules, options
      FROM feedback_questions WHERE feedback_form_id = $2`,
      [duplicated.id, form.id]
    );
    res.status(201).json(duplicated);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/text-templates', async (req, res, next) => {
  try {
    const language = defaultTextsByLanguage[req.query.language] ? req.query.language : 'de';
    const result = await query(
      `SELECT * FROM text_templates
       WHERE organization_id = $1 AND language = $2
       ORDER BY event_id NULLS FIRST, language, scope, key`,
      [req.admin.organizationId, language]
    );
    res.json({ defaults: defaultTextsByLanguage[language] || defaultTexts, templates: result.rows, language });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/text-templates', async (req, res, next) => {
  try {
    const result = await query(
      `INSERT INTO text_templates (organization_id, event_id, language, style, scope, key, value)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (organization_id, event_id, language, scope, key)
       DO UPDATE SET value = EXCLUDED.value, style = EXCLUDED.style, updated_at = now()
       RETURNING *`,
      [
        req.admin.organizationId,
        req.body.eventId || null,
        req.body.language || 'de',
        req.body.style || 'herzlich',
        req.body.scope || 'public',
        req.body.key,
        req.body.value
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/text-templates/:id', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE text_templates
       SET value = COALESCE($3, value), style = COALESCE($4, style), updated_at = now()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, req.admin.organizationId, req.body.value, req.body.style]
    );
    if (!result.rows[0]) throw httpError(404, 'Text nicht gefunden.');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/text-templates/reset', async (req, res, next) => {
  try {
    await query(
      `DELETE FROM text_templates
       WHERE organization_id = $1
         AND language = COALESCE($2, language)
         AND scope = COALESCE($3, scope)
         AND (event_id IS NOT DISTINCT FROM $4 OR $4 IS NULL)`,
      [req.admin.organizationId, req.body.language || null, req.body.scope || null, req.body.eventId || null]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/qr-sources', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT qs.*, e.name AS event_name
       FROM qr_sources qs
       LEFT JOIN events e ON e.id = qs.event_id
       WHERE qs.organization_id = $1
       ORDER BY qs.created_at DESC`,
      [req.admin.organizationId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/qr-sources', async (req, res, next) => {
  try {
    const result = await query(
      `INSERT INTO qr_sources (organization_id, event_id, source_slug, label, type, active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.admin.organizationId,
        req.body.eventId || null,
        req.body.sourceSlug,
        req.body.label,
        req.body.type || 'dynamic_organization',
        req.body.active !== false
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/qr-sources/:id', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE qr_sources
       SET label = COALESCE($3, label), active = COALESCE($4, active), updated_at = now()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, req.admin.organizationId, req.body.label, req.body.active]
    );
    if (!result.rows[0]) throw httpError(404, 'QR-Quelle nicht gefunden.');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/qr-sources/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM qr_sources WHERE id = $1 AND organization_id = $2', [req.params.id, req.admin.organizationId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/webhooks', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, url, events, active, last_status, last_error, last_called_at, created_at FROM webhook_endpoints WHERE organization_id = $1 ORDER BY created_at DESC',
      [req.admin.organizationId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/users', async (req, res, next) => {
  try {
    const result = hasRole(req.admin.role, 'event_manager')
      ? await query(
        `SELECT id, name, email, role, status, invited_at, invite_expires_at, last_login_at, created_at
         FROM users WHERE organization_id = $1 ORDER BY name`,
        [req.admin.organizationId]
      )
      : await query(
        `SELECT id, name, email, role, status, invited_at, invite_expires_at, last_login_at, created_at
         FROM users WHERE organization_id = $1 AND id = $2 ORDER BY name`,
        [req.admin.organizationId, req.admin.sub]
      );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/users/invite', requireRole('owner'), async (req, res, next) => {
  try {
    await ensurePlanFeature(req, 'teams', 'Team-Management ist im Business-Plan enthalten. Bitte upgrade oder setze einen Business-Override.');
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || email.split('@')[0] || 'Neuer User').trim();
    const role = req.body.role || 'support';
    const allowedRoles = ['support', 'analyst', 'event_manager', 'admin', 'owner'];
    if (!email.includes('@')) throw httpError(400, 'Eine gueltige E-Mail-Adresse ist erforderlich.');
    if (!allowedRoles.includes(role)) throw httpError(400, 'Unbekannte Rolle.');
    const token = randomToken(32);
    const passwordHash = await bcrypt.hash(randomToken(32), 12);
    const user = (await query(
      `INSERT INTO users (
        organization_id, name, email, password_hash, role, status, invite_token_hash, invite_expires_at, invited_at
      )
      VALUES ($1,$2,$3,$4,$5,'invited',$6,now() + interval '7 days',now())
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        status = 'invited',
        invite_token_hash = EXCLUDED.invite_token_hash,
        invite_expires_at = EXCLUDED.invite_expires_at,
        invited_at = now(),
        updated_at = now()
      RETURNING id, name, email, role, status, invite_expires_at`,
      [req.admin.organizationId, name, email, passwordHash, role, hashValue(token)]
    )).rows[0];
    const inviteUrl = `${env.adminAppUrl}/admin/accept-invite?token=${token}`;
    const smtp = new SmtpService({ query });
    const mail = await smtp.sendMail(req.admin.organizationId, {
      to: email,
      subject: 'Einladung zu qrating',
      text: `Du wurdest zu qrating eingeladen.\n\nEinladung abschliessen:\n${inviteUrl}\n\nDer Link ist 7 Tage gueltig.`
    }).catch((error) => ({ skipped: true, error: error.message }));
    res.status(201).json({ user, inviteUrl, mail });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/users/:id', requireRole('owner'), async (req, res, next) => {
  try {
    const allowedRoles = ['support', 'analyst', 'event_manager', 'admin', 'owner'];
    if (req.body.role && !allowedRoles.includes(req.body.role)) throw httpError(400, 'Unbekannte Rolle.');
    const allowedStatuses = ['invited', 'active', 'disabled'];
    if (req.body.status && !allowedStatuses.includes(req.body.status)) throw httpError(400, 'Unbekannter Benutzerstatus.');
    const result = await query(
      `UPDATE users
       SET name = COALESCE($3, name),
           role = COALESCE($4, role),
           status = COALESCE($5, status),
           updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, name, email, role, status, invited_at, invite_expires_at, last_login_at, created_at`,
      [req.params.id, req.admin.organizationId, req.body.name, req.body.role, req.body.status]
    );
    if (!result.rows[0]) throw httpError(404, 'Benutzer nicht gefunden.');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/branding', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, slug, logo_url, primary_color, footer_text, privacy_text,
              ticketshop_url, website_url, instagram_url, facebook_url, default_language,
              default_feedback_window_days, default_feedback_window_hours,
              default_feedback_start_mode, branding, anti_spam_settings,
              retention_low_rating_phone_days, retention_feedback_days, retention_newsletter_days,
              wallboard_settings
       FROM organizations WHERE id = $1`,
      [req.admin.organizationId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/branding', requireRole('event_manager'), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE organizations
       SET name = COALESCE($2, name),
           logo_url = COALESCE($3, logo_url),
           primary_color = COALESCE($4, primary_color),
           footer_text = COALESCE($5, footer_text),
           privacy_text = COALESCE($6, privacy_text),
           ticketshop_url = COALESCE($7, ticketshop_url),
           website_url = COALESCE($8, website_url),
           instagram_url = COALESCE($9, instagram_url),
           facebook_url = COALESCE($10, facebook_url),
           default_language = COALESCE($11, default_language),
           branding = COALESCE($12::jsonb, branding),
           retention_low_rating_phone_days = COALESCE($13, retention_low_rating_phone_days),
           retention_feedback_days = $14,
           retention_newsletter_days = $15,
           wallboard_settings = COALESCE($16::jsonb, wallboard_settings),
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, slug, logo_url, primary_color, footer_text, privacy_text,
         ticketshop_url, website_url, instagram_url, facebook_url, default_language, branding,
         retention_low_rating_phone_days, retention_feedback_days, retention_newsletter_days, wallboard_settings`,
      [
        req.admin.organizationId,
        req.body.name,
        req.body.logoUrl,
        req.body.primaryColor,
        req.body.footerText,
        req.body.privacyText,
        req.body.ticketshopUrl,
        req.body.websiteUrl,
        req.body.instagramUrl,
        req.body.facebookUrl,
        req.body.defaultLanguage,
        req.body.branding ? JSON.stringify(req.body.branding) : null,
        req.body.retentionLowRatingPhoneDays === undefined ? null : Number(req.body.retentionLowRatingPhoneDays),
        req.body.retentionFeedbackDays === undefined || req.body.retentionFeedbackDays === '' ? null : Number(req.body.retentionFeedbackDays),
        req.body.retentionNewsletterDays === undefined || req.body.retentionNewsletterDays === '' ? null : Number(req.body.retentionNewsletterDays),
        req.body.wallboardSettings ? JSON.stringify(req.body.wallboardSettings) : null
      ]
    );
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/anti-spam-settings', requireRole('event_manager'), async (req, res, next) => {
  try {
    const settings = {
      min_seconds: Number(req.body.minSeconds ?? 3),
      honeypot_enabled: req.body.honeypotEnabled !== false
    };
    const result = await query(
      `UPDATE organizations
       SET anti_spam_settings = $2::jsonb, updated_at = now()
       WHERE id = $1
       RETURNING anti_spam_settings`,
      [req.admin.organizationId, JSON.stringify(settings)]
    );
    res.json(result.rows[0].anti_spam_settings);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/notification-channels', async (req, res, next) => {
  try {
    const service = new NotificationService({ query });
    const userId = hasRole(req.admin.role, 'event_manager') ? null : req.admin.sub;
    res.json(await service.listChannels(req.admin.organizationId, userId));
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/notification-channels', async (req, res, next) => {
  try {
    const userId = req.body.userId || req.admin.sub;
    if (!hasRole(req.admin.role, 'event_manager') && userId !== req.admin.sub) {
      throw httpError(403, 'Du kannst nur eigene Benachrichtigungskanaele anlegen.');
    }
    const secretProvided = typeof req.body.secret === 'string' && req.body.secret.length > 0;
    const result = await query(
      `INSERT INTO notification_channels (
        organization_id, user_id, channel_type, label, enabled, min_rating, config, secret_encrypted
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        req.admin.organizationId,
        userId,
        req.body.channelType,
        req.body.label || req.body.channelType,
        req.body.enabled !== false,
        Number(req.body.minRating || 2),
        JSON.stringify(req.body.config || {}),
        secretProvided ? encryptSecret(req.body.secret) : null
      ]
    );
    res.status(201).json(publicChannel(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/notification-channels/:id', async (req, res, next) => {
  try {
    const secretProvided = typeof req.body.secret === 'string' && req.body.secret.length > 0;
    const result = await query(
      `UPDATE notification_channels
       SET label = COALESCE($3, label),
           enabled = COALESCE($4, enabled),
           min_rating = COALESCE($5, min_rating),
           config = COALESCE($6::jsonb, config),
           secret_encrypted = CASE WHEN $7::boolean THEN $8 ELSE secret_encrypted END,
           updated_at = now()
       WHERE id = $1 AND organization_id = $2 AND ($9::boolean OR user_id = $10)
       RETURNING *`,
      [
        req.params.id,
        req.admin.organizationId,
        req.body.label,
        req.body.enabled,
        req.body.minRating,
        req.body.config ? JSON.stringify(req.body.config) : null,
        secretProvided,
        secretProvided ? encryptSecret(req.body.secret) : null,
        hasRole(req.admin.role, 'event_manager'),
        req.admin.sub
      ]
    );
    if (!result.rows[0]) throw httpError(404, 'Benachrichtigungskanal nicht gefunden.');
    res.json(publicChannel(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/notification-channels/:id', async (req, res, next) => {
  try {
    await query(
      'DELETE FROM notification_channels WHERE id = $1 AND organization_id = $2 AND ($3::boolean OR user_id = $4)',
      [req.params.id, req.admin.organizationId, hasRole(req.admin.role, 'event_manager'), req.admin.sub]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/notification-channels/:id/test', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT nc.*, u.email AS user_email, u.name AS user_name
       FROM notification_channels nc
       JOIN users u ON u.id = nc.user_id
       WHERE nc.id = $1 AND nc.organization_id = $2 AND ($3::boolean OR nc.user_id = $4)`,
      [req.params.id, req.admin.organizationId, hasRole(req.admin.role, 'event_manager'), req.admin.sub]
    );
    const channel = result.rows[0];
    if (!channel) throw httpError(404, 'Benachrichtigungskanal nicht gefunden.');
    const service = new NotificationService({ query });
    await service.sendChannel(channel, {
      title: 'qrating Testbenachrichtigung',
      text: 'Das ist eine Testnachricht aus qrating.',
      event: { name: 'Testevent' },
      feedback: { rating: 2, submitted_at: new Date().toISOString() }
    });
    await query(
      `UPDATE notification_channels
       SET last_status = 'ok', last_error = null, last_called_at = now(), updated_at = now()
       WHERE id = $1`,
      [channel.id]
    );
    res.json({ ok: true });
  } catch (error) {
    await query(
      `UPDATE notification_channels
       SET last_status = 'error', last_error = $2, last_called_at = now(), updated_at = now()
       WHERE id = $1 AND organization_id = $3`,
      [req.params.id, error.message, req.admin.organizationId]
    ).catch(() => {});
    next(error);
  }
});

adminRouter.get('/low-rating-cases', async (req, res, next) => {
  try {
    const params = [req.admin.organizationId];
    const clauses = ['lrc.organization_id = $1'];
    if (req.query.eventId) {
      await ensureEventAccess(req, req.query.eventId);
      params.push(req.query.eventId);
      clauses.push(`lrc.event_id = $${params.length}`);
    }
    if (!hasRole(req.admin.role, 'event_manager')) {
      params.push(req.admin.sub);
      clauses.push(`EXISTS (
        SELECT 1 FROM user_event_assignments uea
        WHERE uea.event_id = lrc.event_id
          AND uea.user_id = $${params.length}
          AND uea.organization_id = lrc.organization_id
      )`);
    }
    const result = await query(
      `SELECT lrc.*, e.name AS event_name, e.date_from, u.name AS assigned_user_name,
              fr.comment_positive, fr.comment_improvement, fr.general_comment, fr.submitted_at
       FROM low_rating_cases lrc
       JOIN events e ON e.id = lrc.event_id
       LEFT JOIN users u ON u.id = lrc.assigned_user_id
       JOIN feedback_responses fr ON fr.id = lrc.feedback_response_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY CASE lrc.status WHEN 'open' THEN 0 WHEN 'contact_planned' THEN 1 ELSE 2 END, lrc.created_at DESC
       LIMIT 200`,
      params
    );
    res.json(result.rows.map((row) => ({
      ...row,
      contact_phone_encrypted: undefined,
      contactPhone: row.contact_phone_encrypted ? decryptSecret(row.contact_phone_encrypted) : null
    })));
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/low-rating-cases/:id', async (req, res, next) => {
  try {
    const current = (await query(
      'SELECT * FROM low_rating_cases WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.admin.organizationId]
    )).rows[0];
    if (!current) throw httpError(404, 'Low-Rating-Fall nicht gefunden.');
    await ensureEventAccess(req, current.event_id);
    const allowedStatuses = ['open', 'contact_planned', 'contacted', 'resolved', 'archived'];
    if (req.body.status && !allowedStatuses.includes(req.body.status)) throw httpError(400, 'Unbekannter Status.');
    const assignedUserId = hasRole(req.admin.role, 'event_manager')
      ? (req.body.assignedUserId ?? current.assigned_user_id)
      : current.assigned_user_id;
    const result = await query(
      `UPDATE low_rating_cases
       SET status = COALESCE($3, status),
           assigned_user_id = $4,
           internal_note = COALESCE($5, internal_note),
           resolved_at = CASE WHEN $3 = 'resolved' THEN now() ELSE resolved_at END,
           updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [req.params.id, req.admin.organizationId, req.body.status, assignedUserId, req.body.internalNote]
    );
    const row = result.rows[0];
    res.json({
      ...row,
      contact_phone_encrypted: undefined,
      contactPhone: row.contact_phone_encrypted ? decryptSecret(row.contact_phone_encrypted) : null
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/webhooks', async (req, res, next) => {
  try {
    const result = await query(
      `INSERT INTO webhook_endpoints (organization_id, url, secret, events, active)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, url, events, active, created_at`,
      [
        req.admin.organizationId,
        req.body.url,
        req.body.secret || null,
        JSON.stringify(req.body.events || ['feedback.created']),
        req.body.active !== false
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/operations', requireRole('event_manager'), async (req, res, next) => {
  try {
    const [jobs, failedJobs, pretix, lowCases, webhooks, smtp] = await Promise.all([
      query(
        `SELECT job_type, status, count(*)::int AS count
         FROM background_jobs
         WHERE organization_id = $1
         GROUP BY job_type, status
         ORDER BY job_type, status`,
        [req.admin.organizationId]
      ),
      query(
        `SELECT id, job_type, status, attempts, max_attempts, last_error, run_after, created_at
         FROM background_jobs
         WHERE organization_id = $1 AND status IN ('failed','queued','running')
         ORDER BY created_at DESC LIMIT 20`,
        [req.admin.organizationId]
      ),
      query(
        `SELECT id, base_url, pretix_organizer_slug, sync_enabled, sync_interval_minutes,
                last_sync_at, last_successful_sync_at, next_sync_at, last_sync_status, last_sync_error
         FROM pretix_connections
         WHERE organization_id = $1
         ORDER BY created_at DESC`,
        [req.admin.organizationId]
      ),
      query(
        `SELECT status, count(*)::int AS count
         FROM low_rating_cases
         WHERE organization_id = $1
         GROUP BY status`,
        [req.admin.organizationId]
      ),
      query(
        `SELECT id, url, events, active, last_status, last_error, last_called_at
         FROM webhook_endpoints
         WHERE organization_id = $1
         ORDER BY last_called_at DESC NULLS LAST LIMIT 10`,
        [req.admin.organizationId]
      ),
      query(
        `SELECT enabled, host, from_email, last_test_status, last_test_error, last_test_at
         FROM smtp_settings
         WHERE organization_id = $1`,
        [req.admin.organizationId]
      )
    ]);
    res.json({
      jobs: jobs.rows,
      recentJobs: failedJobs.rows,
      pretix: pretix.rows,
      lowRatingCases: lowCases.rows,
      webhooks: webhooks.rows,
      smtp: smtp.rows[0] || null
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/operations/run-retention', requireRole('owner'), async (req, res, next) => {
  try {
    const job = await enqueueJob({ query }, req.admin.organizationId, 'privacy.retention', {});
    res.status(202).json({ ok: true, job });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/webhooks/:id', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE webhook_endpoints
       SET url = COALESCE($3, url),
           events = COALESCE($4::jsonb, events),
           active = COALESCE($5, active),
           updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, url, events, active, last_status, last_error, last_called_at`,
      [
        req.params.id,
        req.admin.organizationId,
        req.body.url,
        req.body.events ? JSON.stringify(req.body.events) : null,
        req.body.active
      ]
    );
    if (!result.rows[0]) throw httpError(404, 'Webhook nicht gefunden.');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/smtp-settings', async (req, res, next) => {
  try {
    const smtp = new SmtpService({ query });
    res.json(await smtp.getSettings(req.admin.organizationId));
  } catch (error) {
    next(error);
  }
});

adminRouter.put('/smtp-settings', async (req, res, next) => {
  try {
    const passwordProvided = typeof req.body.password === 'string' && req.body.password.length > 0;
    const passwordEncrypted = passwordProvided ? encryptSecret(req.body.password) : null;
    const result = await query(
      `INSERT INTO smtp_settings (
        organization_id, host, port, secure, username, password_encrypted, from_email, from_name,
        reply_to, notification_email, low_rating_alerts_enabled, enabled
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (organization_id)
      DO UPDATE SET
        host = EXCLUDED.host,
        port = EXCLUDED.port,
        secure = EXCLUDED.secure,
        username = EXCLUDED.username,
        password_encrypted = CASE WHEN $13::boolean THEN EXCLUDED.password_encrypted ELSE smtp_settings.password_encrypted END,
        from_email = EXCLUDED.from_email,
        from_name = EXCLUDED.from_name,
        reply_to = EXCLUDED.reply_to,
        notification_email = EXCLUDED.notification_email,
        low_rating_alerts_enabled = EXCLUDED.low_rating_alerts_enabled,
        enabled = EXCLUDED.enabled,
        updated_at = now()
      RETURNING id, organization_id, host, port, secure, username, from_email, from_name, reply_to,
        notification_email, low_rating_alerts_enabled, enabled, last_test_status, last_test_error, last_test_at,
        created_at, updated_at, password_encrypted`,
      [
        req.admin.organizationId,
        req.body.host,
        Number(req.body.port || 587),
        Boolean(req.body.secure),
        req.body.username || null,
        passwordEncrypted,
        req.body.fromEmail,
        req.body.fromName || null,
        req.body.replyTo || null,
        req.body.notificationEmail || null,
        Boolean(req.body.lowRatingAlertsEnabled),
        Boolean(req.body.enabled),
        passwordProvided
      ]
    );
    const { password_encrypted, ...settings } = result.rows[0];
    res.json({ ...settings, has_password: Boolean(password_encrypted) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/smtp-settings/test', async (req, res, next) => {
  try {
    const smtp = new SmtpService({ query });
    res.json(await smtp.testSettings(req.admin.organizationId, req.body.to || null));
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/pretix-connections', async (req, res, next) => {
  try {
    const result = await query(
      `INSERT INTO pretix_connections (
        organization_id, base_url, pretix_organizer_slug, api_token_encrypted, import_live_only, ignore_testmode,
        import_public_only, import_subevents, import_event_images, cache_event_images, preferred_image_settings_key
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, organization_id, base_url, pretix_organizer_slug,
        sync_enabled, import_live_only, ignore_testmode, import_public_only, import_subevents, import_event_images,
        cache_event_images, preferred_image_settings_key, last_sync_at, last_sync_status, last_sync_error, next_sync_at`,
      [
        req.admin.organizationId,
        req.body.baseUrl,
        req.body.organizerSlug,
        encryptSecret(req.body.apiToken),
        Boolean(req.body.importLiveOnly),
        req.body.ignoreTestmode !== false,
        Boolean(req.body.importPublicOnly),
        req.body.importSubevents !== false,
        req.body.importEventImages !== false,
        Boolean(req.body.cacheEventImages),
        req.body.preferredImageSettingsKey || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/pretix-connections', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, organization_id, base_url, pretix_organizer_slug, sync_enabled, sync_interval_minutes,
              import_live_only, ignore_testmode, import_public_only, import_subevents, import_event_images,
              cache_event_images, preferred_image_settings_key, last_sync_at, last_successful_sync_at, next_sync_at,
              sync_interval_minutes, last_sync_status, last_sync_error
       FROM pretix_connections WHERE organization_id = $1 ORDER BY created_at DESC`,
      [req.admin.organizationId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/pretix-connections/:id', requireRole('event_manager'), async (req, res, next) => {
  try {
    const tokenProvided = typeof req.body.apiToken === 'string' && req.body.apiToken.length > 0;
    const result = await query(
      `UPDATE pretix_connections
       SET sync_enabled = COALESCE($3, sync_enabled),
           sync_interval_minutes = COALESCE($4, sync_interval_minutes),
           import_live_only = COALESCE($5, import_live_only),
           ignore_testmode = COALESCE($6, ignore_testmode),
           import_public_only = COALESCE($7, import_public_only),
           import_subevents = COALESCE($8, import_subevents),
           import_event_images = COALESCE($9, import_event_images),
           cache_event_images = COALESCE($10, cache_event_images),
           preferred_image_settings_key = COALESCE($11, preferred_image_settings_key),
           api_token_encrypted = CASE WHEN $12::boolean THEN $13 ELSE api_token_encrypted END,
           next_sync_at = CASE WHEN COALESCE($3, sync_enabled) THEN COALESCE(next_sync_at, now()) ELSE next_sync_at END,
           updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, organization_id, base_url, pretix_organizer_slug, sync_enabled, sync_interval_minutes,
         import_live_only, ignore_testmode, import_public_only, import_subevents, import_event_images,
         cache_event_images, preferred_image_settings_key, last_sync_at, last_successful_sync_at, next_sync_at,
         last_sync_status, last_sync_error`,
      [
        req.params.id,
        req.admin.organizationId,
        req.body.syncEnabled,
        req.body.syncIntervalMinutes,
        req.body.importLiveOnly,
        req.body.ignoreTestmode,
        req.body.importPublicOnly,
        req.body.importSubevents,
        req.body.importEventImages,
        req.body.cacheEventImages,
        req.body.preferredImageSettingsKey,
        tokenProvided,
        tokenProvided ? encryptSecret(req.body.apiToken) : null
      ]
    );
    if (!result.rows[0]) throw httpError(404, 'Pretix-Verbindung nicht gefunden.');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/pretix-connections/:id/test', async (req, res, next) => {
  try {
    const connection = (await query('SELECT * FROM pretix_connections WHERE id = $1 AND organization_id = $2', [req.params.id, req.admin.organizationId])).rows[0];
    if (!connection) throw httpError(404, 'Pretix-Verbindung nicht gefunden.');
    const service = new PretixService({ query });
    res.json(await service.testConnection(connection));
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/pretix-connections/:id/sync', async (req, res, next) => {
  try {
    const connection = (await query('SELECT * FROM pretix_connections WHERE id = $1 AND organization_id = $2', [req.params.id, req.admin.organizationId])).rows[0];
    if (!connection) throw httpError(404, 'Pretix-Verbindung nicht gefunden.');
    const service = new PretixService({ query });
    res.json(await service.syncConnection(connection));
  } catch (error) {
    await query('UPDATE pretix_connections SET last_sync_at = now(), last_sync_status = $1, last_sync_error = $2 WHERE id = $3', ['Fehler', error.message, req.params.id]).catch(() => {});
    next(error);
  }
});

adminRouter.get('/pretix-connections/:id/settings-debug/:eventSlug', async (req, res, next) => {
  try {
    const event = (await query(
      `SELECT id, name, detected_image_settings_key, pretix_event_image_url, raw_settings_payload, image_sync_error
       FROM events WHERE pretix_connection_id = $1 AND pretix_event_slug = $2 LIMIT 1`,
      [req.params.id, req.params.eventSlug]
    )).rows[0];
    res.json(event || {});
  } catch (error) {
    next(error);
  }
});
