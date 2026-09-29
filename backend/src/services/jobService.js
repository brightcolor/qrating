import { NotificationService } from './notificationService.js';
import { PretixService } from './pretixService.js';
import { buildEventReportPdf } from '../utils/pdf.js';
import { buildDownloadName } from '../utils/downloadName.js';
import { NewsletterService } from './newsletterService.js';
import { env } from '../config/env.js';
import { periodAllowed, phoneRetentionDays } from '../utils/retention.js';

export async function enqueueJob(db, organizationId, jobType, payload, options = {}) {
  const result = await db.query(
    `INSERT INTO background_jobs (organization_id, job_type, payload, max_attempts, run_after)
     VALUES ($1,$2,$3,$4,COALESCE($5, now()))
     RETURNING *`,
    [
      organizationId,
      jobType,
      JSON.stringify(payload || {}),
      options.maxAttempts || env.jobMaxAttempts,
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
      else if (job.job_type === 'newsletter.sync') await this.handleNewsletterSync(job.payload);
      else throw new Error(`Unbekannte Hintergrundaufgabe „${job.job_type}“. Sie stammt vermutlich aus einer anderen qrating-Version.`);
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
             run_after = CASE WHEN $2 = 'queued' THEN now() + ($4 * interval '1 minute') ELSE run_after END,
             updated_at = now()
         WHERE id = $1`,
        [job.id, failed ? 'failed' : 'queued', error.message, env.jobRetryMinutes]
      );
    }
  }

  async handleLowRating(payload) {
    const event = (await this.db.query('SELECT * FROM events WHERE id = $1', [payload.eventId])).rows[0];
    const feedback = (await this.db.query('SELECT * FROM feedback_responses WHERE id = $1', [payload.feedbackId])).rows[0];
    const lowCase = (await this.db.query('SELECT * FROM low_rating_cases WHERE feedback_response_id = $1', [payload.feedbackId])).rows[0];
    if (!event || !feedback) throw new Error('Die Benachrichtigung entfällt: Das Event oder das Feedback wurde inzwischen gelöscht.');
    const service = new NotificationService(this.db);
    await service.dispatchLowRating(event, { ...feedback, low_rating_case: lowCase || null });
  }

  async handleReportEmail(job) {
    const { eventId, userId } = job.payload;
    // The report covers an event of the organization that asked for it, and no other.
    const event = (await this.db.query('SELECT * FROM events WHERE id = $1 AND organization_id = $2', [eventId, job.organization_id])).rows[0];
    const user = (await this.db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
    if (!event || !user) throw new Error('Der Report entfällt: Das Event oder das Benutzerkonto wurde inzwischen gelöscht.');
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
    const comments = await this.db.query(`SELECT rating, comment_positive, comment_improvement, general_comment, submitted_at FROM feedback_responses WHERE event_id = $1 ORDER BY submitted_at DESC LIMIT $2`, [event.id, env.reportCommentsLimit]);
    const organization = (await this.db.query('SELECT name, primary_color FROM organizations WHERE id = $1', [event.organization_id])).rows[0];
    const pdf = buildEventReportPdf({ event, organization, summary: summary.rows[0], distribution: distribution.rows, timeline: timeline.rows, questionStats: questionStats.rows, comments: comments.rows });
    const notification = new NotificationService(this.db);
    const sent = await notification.smtpService.sendMail(event.organization_id, {
      to: user.email,
      subject: `qrating Report: ${event.name}`,
      text: `Anbei der aktuelle qrating Report für ${event.name}.`,
      attachments: [{ filename: buildDownloadName({ event, kind: 'Bericht', extension: 'pdf' }).name, content: pdf }]
    });
    if (sent?.skipped) {
      throw new Error('Der Report wurde nicht verschickt: Der E-Mail-Versand ist nicht eingerichtet oder ausgeschaltet. Richte ihn unter Einstellungen → Verbindungen ein.');
    }
  }

  async handleNewsletterSync(payload) {
    const newsletter = new NewsletterService(this.db);
    await newsletter.syncOptin(payload.optinId);
  }

  async handlePretixSync(payload) {
    const connection = (await this.db.query('SELECT * FROM pretix_connections WHERE id = $1', [payload.connectionId])).rows[0];
    if (!connection) throw new Error('Der Abgleich entfällt: Die Pretix-Verbindung wurde inzwischen gelöscht.');
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
       LIMIT $1`,
      [env.schedulerBatchSize]
    );
    for (const connection of connections.rows) {
      await enqueueJob(this.db, connection.organization_id, 'pretix.sync', { connectionId: connection.id }, { maxAttempts: env.pretixSyncMaxAttempts });
      await this.db.query(
        `UPDATE pretix_connections
         SET next_sync_at = now() + (sync_interval_minutes * interval '1 minute')
         WHERE id = $1`,
        [connection.id]
      );
    }

    // One deletion run per organization and interval. Any run counts, a finished one as well;
    // otherwise the next round of the planner starts a new run right after the last one ended.
    const organizations = await this.db.query(
      `SELECT id FROM organizations o
       WHERE NOT EXISTS (
         SELECT 1 FROM background_jobs bj
         WHERE bj.organization_id = o.id
           AND bj.job_type = 'privacy.retention'
           AND bj.created_at > now() - ($1 * interval '1 hour')
       )
       LIMIT $2`,
      [env.retentionIntervalHours, env.schedulerBatchSize]
    );
    for (const organization of organizations.rows) {
      await enqueueJob(this.db, organization.id, 'privacy.retention', {}, { maxAttempts: env.retentionJobMaxAttempts });
    }

    // Finished jobs leave the list after a while; failed ones stay for the look at what went wrong.
    await this.db.query(
      `DELETE FROM background_jobs WHERE status = 'done' AND updated_at < now() - ($1 * interval '1 day')`,
      [env.jobHistoryDays]
    );
  }

  async handlePrivacyRetention(job) {
    const org = (await this.db.query(
      `SELECT retention_low_rating_phone_days, retention_feedback_days, retention_newsletter_days
       FROM organizations WHERE id = $1`,
      [job.organization_id]
    )).rows[0];
    if (!org) return;

    // Each deletion runs for itself, so one that fails leaves the others their turn. A period
    // outside the bounds of the settings deletes nothing and says why; guessing a shorter one
    // would delete earlier than the privacy page promises.
    const failures = [];
    const periodOf = (value, subject) => {
      const days = Number(value);
      if (periodAllowed(days)) return days;
      failures.push(`Die Löschfrist für ${subject} steht auf „${value}“ und liegt außerhalb von ${env.retentionMinDays} bis ${env.retentionMaxDays} Tagen; korrigiere sie unter Einstellungen → Organisation.`);
      return null;
    };
    const step = async (run) => {
      try {
        await run();
      } catch (error) {
        failures.push(error.message);
      }
    };

    const phoneDays = periodOf(phoneRetentionDays(org), 'Rückrufnummern');
    if (phoneDays) {
      // A number goes when the period the privacy page named at the time it was left runs out
      // (retention_until), or earlier once the organization shortened its period since.
      await step(() => this.db.query(
        `UPDATE low_rating_cases
         SET contact_phone_encrypted = null,
             contact_note = null,
             contact_note_encrypted = null,
             internal_note = COALESCE(internal_note, '') || CASE WHEN internal_note IS NULL OR internal_note = '' THEN '' ELSE E'\n' END || 'Telefon-/Kontaktangaben automatisch nach Aufbewahrungsfrist gelöscht.',
             updated_at = now()
         WHERE organization_id = $1
           AND (
             contact_phone_encrypted IS NOT NULL
             OR contact_note_encrypted IS NOT NULL
             OR contact_note IS NOT NULL
           )
           AND (
             retention_until <= now()
             OR created_at < now() - ($2 * interval '1 day')
           )`,
        [job.organization_id, phoneDays]
      ));
    }
    const feedbackDays = org.retention_feedback_days ? periodOf(org.retention_feedback_days, 'Bewertungen') : null;
    if (feedbackDays) {
      // Visits of the guest page follow the feedback: same organization, same period.
      await step(() => this.db.query(
        `DELETE FROM guest_sessions
         WHERE organization_id = $1
           AND started_at < now() - ($2 * interval '1 day')`,
        [job.organization_id, feedbackDays]
      ));
      await step(() => this.db.query(
        `DELETE FROM feedback_responses
         WHERE organization_id = $1
           AND submitted_at < now() - ($2 * interval '1 day')`,
        [job.organization_id, feedbackDays]
      ));
    }
    const newsletterDays = org.retention_newsletter_days ? periodOf(org.retention_newsletter_days, 'Newsletter-Anmeldungen') : null;
    if (newsletterDays) {
      await step(() => this.db.query(
        `DELETE FROM newsletter_optins
         WHERE organization_id = $1
           AND consent_given_at < now() - ($2 * interval '1 day')`,
        [job.organization_id, newsletterDays]
      ));
    }
    if (failures.length) throw new Error(`Der Löschlauf ist nur teilweise gelaufen. ${failures.join(' ')}`);
  }
}
