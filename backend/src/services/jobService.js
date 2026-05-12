import { NotificationService } from './notificationService.js';
import { PretixService } from './pretixService.js';
import { buildEventReportPdf } from '../utils/pdf.js';
import { env } from '../config/env.js';

export async function enqueueJob(db, organizationId, jobType, payload, options = {}) {
  const result = await db.query(
    `INSERT INTO background_jobs (organization_id, job_type, payload, max_attempts, run_after)
     VALUES ($1,$2,$3,$4,COALESCE($5, now()))
     RETURNING *`,
    [
      organizationId,
      jobType,
      JSON.stringify(payload || {}),
      options.maxAttempts || 5,
      options.runAfter || null
    ]
  );
  return result.rows[0];
}

export class JobWorker {
  constructor(db, { intervalMs = 5000 } = {}) {
    this.db = db;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.running = false;
    this.lastScheduleAt = 0;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((error) => console.error(error)), this.intervalMs);
    this.tick().catch((error) => console.error(error));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.scheduleRecurringJobs();
      const job = await this.claimJob();
      if (job) await this.runJob(job);
    } finally {
      this.running = false;
    }
  }

  async claimJob() {
    const result = await this.db.query(
      `UPDATE background_jobs
       SET status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
       WHERE id = (
         SELECT id FROM background_jobs
         WHERE status = 'queued' AND run_after <= now()
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`
    );
    return result.rows[0] || null;
  }

  async runJob(job) {
    try {
      if (job.job_type === 'notification.low_rating') await this.handleLowRating(job.payload);
      else if (job.job_type === 'report.email') await this.handleReportEmail(job);
      else if (job.job_type === 'pretix.sync') await this.handlePretixSync(job.payload);
      else if (job.job_type === 'privacy.retention') await this.handlePrivacyRetention(job);
      else throw new Error(`Unknown job type: ${job.job_type}`);
      await this.db.query(
        `UPDATE background_jobs SET status = 'done', last_error = null, updated_at = now() WHERE id = $1`,
        [job.id]
      );
    } catch (error) {
      const failed = job.attempts >= job.max_attempts;
      await this.db.query(
        `UPDATE background_jobs
         SET status = $2,
             last_error = $3,
             run_after = CASE WHEN $2 = 'queued' THEN now() + interval '2 minutes' ELSE run_after END,
             updated_at = now()
         WHERE id = $1`,
        [job.id, failed ? 'failed' : 'queued', error.message]
      );
    }
  }

  async handleLowRating(payload) {
    const event = (await this.db.query('SELECT * FROM events WHERE id = $1', [payload.eventId])).rows[0];
    const feedback = (await this.db.query('SELECT * FROM feedback_responses WHERE id = $1', [payload.feedbackId])).rows[0];
    const lowCase = (await this.db.query('SELECT * FROM low_rating_cases WHERE feedback_response_id = $1', [payload.feedbackId])).rows[0];
    if (!event || !feedback) throw new Error('Event oder Feedback nicht gefunden.');
    const service = new NotificationService(this.db);
    await service.dispatchLowRating(event, { ...feedback, low_rating_case: lowCase || null });
  }

  async handleReportEmail(job) {
    const { eventId, userId } = job.payload;
    const event = (await this.db.query('SELECT * FROM events WHERE id = $1', [eventId])).rows[0];
    const user = (await this.db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
    if (!event || !user) throw new Error('Event oder User nicht gefunden.');
    const summary = await this.db.query(
      `SELECT count(*)::int AS total, round(avg(rating)::numeric, 2) AS average_rating,
              round(avg(nps_score)::numeric, 2) AS average_nps,
              count(*) FILTER (WHERE rating <= 2)::int AS low_ratings,
              count(*) FILTER (WHERE newsletter_optin)::int AS newsletter_optins
       FROM feedback_responses WHERE event_id = $1`,
      [event.id]
    );
    const distribution = await this.db.query('SELECT rating, count(*)::int AS count FROM feedback_responses WHERE event_id = $1 GROUP BY rating ORDER BY rating', [event.id]);
    const timeline = await this.db.query(`SELECT date_trunc('hour', submitted_at) AS bucket, count(*)::int AS count, round(avg(rating)::numeric, 2) AS average_rating FROM feedback_responses WHERE event_id = $1 GROUP BY bucket ORDER BY bucket`, [event.id]);
    const questionStats = await this.db.query(`SELECT q.label, q.question_type, fa.answer_value, count(*)::int AS count FROM feedback_answers fa JOIN feedback_questions q ON q.id = fa.feedback_question_id JOIN feedback_responses fr ON fr.id = fa.feedback_response_id WHERE fr.event_id = $1 AND q.show_in_dashboard = true GROUP BY q.label, q.question_type, fa.answer_value ORDER BY q.label, count DESC`, [event.id]);
    const comments = await this.db.query(`SELECT rating, comment_positive, comment_improvement, general_comment, submitted_at FROM feedback_responses WHERE event_id = $1 ORDER BY submitted_at DESC LIMIT 50`, [event.id]);
    const pdf = buildEventReportPdf({ event, summary: summary.rows[0], distribution: distribution.rows, timeline: timeline.rows, questionStats: questionStats.rows, comments: comments.rows });
    const notification = new NotificationService(this.db);
    await notification.smtpService.sendMail(event.organization_id, {
      to: user.email,
      subject: `qrating Report: ${event.name}`,
      text: `Anbei der aktuelle qrating Report fuer ${event.name}.`,
      attachments: [{ filename: 'qrating-report.pdf', content: pdf }]
    });
  }

  async handlePretixSync(payload) {
    const connection = (await this.db.query('SELECT * FROM pretix_connections WHERE id = $1', [payload.connectionId])).rows[0];
    if (!connection) throw new Error('Pretix-Verbindung nicht gefunden.');
    const service = new PretixService(this.db);
    await service.syncConnection(connection);
  }

  async scheduleRecurringJobs() {
    const now = Date.now();
    if (now - this.lastScheduleAt < env.pretixSchedulerIntervalMs) return;
    this.lastScheduleAt = now;

    const connections = await this.db.query(
      `SELECT id, organization_id
       FROM pretix_connections pc
       WHERE sync_enabled = true
         AND (next_sync_at IS NULL OR next_sync_at <= now())
         AND NOT EXISTS (
           SELECT 1 FROM background_jobs bj
           WHERE bj.job_type = 'pretix.sync'
             AND bj.status IN ('queued','running')
             AND (bj.payload->>'connectionId')::uuid = pc.id
         )
       LIMIT 20`
    );
    for (const connection of connections.rows) {
      await enqueueJob(this.db, connection.organization_id, 'pretix.sync', { connectionId: connection.id }, { maxAttempts: 3 });
      await this.db.query(
        `UPDATE pretix_connections
         SET next_sync_at = now() + (sync_interval_minutes * interval '1 minute')
         WHERE id = $1`,
        [connection.id]
      );
    }

    const organizations = await this.db.query(
      `SELECT id FROM organizations o
       WHERE NOT EXISTS (
         SELECT 1 FROM background_jobs bj
         WHERE bj.organization_id = o.id
           AND bj.job_type = 'privacy.retention'
           AND bj.status IN ('queued','running')
           AND bj.created_at > now() - interval '12 hours'
       )
       LIMIT 20`
    );
    for (const organization of organizations.rows) {
      await enqueueJob(this.db, organization.id, 'privacy.retention', {}, { maxAttempts: 2 });
    }
  }

  async handlePrivacyRetention(job) {
    const org = (await this.db.query(
      `SELECT retention_low_rating_phone_days, retention_feedback_days, retention_newsletter_days
       FROM organizations WHERE id = $1`,
      [job.organization_id]
    )).rows[0];
    if (!org) return;
    await this.db.query(
      `UPDATE low_rating_cases
       SET contact_phone_encrypted = null,
           contact_note = null,
           internal_note = COALESCE(internal_note, '') || CASE WHEN internal_note IS NULL OR internal_note = '' THEN '' ELSE E'\n' END || 'Telefon-/Kontaktangaben automatisch nach Aufbewahrungsfrist geloescht.',
           updated_at = now()
       WHERE organization_id = $1
         AND contact_phone_encrypted IS NOT NULL
         AND (
           retention_until <= now()
           OR created_at < now() - ($2 * interval '1 day')
         )`,
      [job.organization_id, Number(org.retention_low_rating_phone_days || 90)]
    );
    if (org.retention_feedback_days) {
      await this.db.query(
        `DELETE FROM feedback_responses
         WHERE organization_id = $1
           AND submitted_at < now() - ($2 * interval '1 day')`,
        [job.organization_id, Number(org.retention_feedback_days)]
      );
    }
    if (org.retention_newsletter_days) {
      await this.db.query(
        `DELETE FROM newsletter_optins
         WHERE organization_id = $1
           AND consent_given_at < now() - ($2 * interval '1 day')`,
        [job.organization_id, Number(org.retention_newsletter_days)]
      );
    }
  }
}
