import express from 'express';
import rateLimit from 'express-rate-limit';
import Joi from 'joi';
import { query, withTransaction } from '../db/pool.js';
import { lowRatingGraceMinutes, openVoteFor, recordRating, turnsLow } from '../services/ratingService.js';
import { EventResolver, calculateFeedbackWindow } from '../services/eventResolver.js';
import { defaultTexts, defaultTextsByLanguage, loadResolvedTexts } from '../services/textService.js';
import { eventToPublic } from '../db/bootstrap.js';
import { hashValue } from '../utils/crypto.js';
import { env } from '../config/env.js';
import { WebhookService } from '../services/webhookService.js';
import { enqueueJob } from '../services/jobService.js';
import { NewsletterService } from '../services/newsletterService.js';
import { markCompleted, recordProgress } from '../services/guestSessionService.js';
import { upcomingFor, upcomingForOrganization } from '../services/upcomingService.js';
import { encryptSecret } from '../utils/crypto.js';
import { getSiteContent } from '../services/siteContentService.js';
import { creditFor, emailDomain, emailHash, publicEventStatus, publicOrganization } from '../utils/security.js';
import { describeWait } from '../middleware/errors.js';
import { verifyPreviewToken } from '../utils/previewLink.js';
import { privacyPage } from '../services/privacyService.js';

export const publicRouter = express.Router();

// Joi reports field problems in English; guests get a German sentence per field.
const feedbackFieldMessages = {
  rating: 'Bitte wähle eine Bewertung von 1 bis 5 Sternen.',
  npsScore: 'Bitte wähle für die Weiterempfehlung einen Wert von 0 bis 10.',
  commentPositive: 'Dein Kommentar ist zu lang. Bitte fasse dich kürzer (höchstens 3.000 Zeichen).',
  commentImprovement: 'Dein Kommentar ist zu lang. Bitte fasse dich kürzer (höchstens 3.000 Zeichen).',
  generalComment: 'Dein Kommentar ist zu lang. Bitte fasse dich kürzer (höchstens 3.000 Zeichen).',
  newsletterEmail: 'Bitte gib eine gültige E-Mail-Adresse ein, zum Beispiel name@example.de.',
  newsletterOptin: 'Die Angabe zum Newsletter ist ungültig. Lade die Seite neu und versuche es erneut.',
  contactPhone: 'Bitte gib eine gültige Telefonnummer ein. Erlaubt sind Ziffern, Leerzeichen und die Zeichen + ( ) - /.',
  contactNote: 'Dein Hinweis für den Rückruf ist zu lang. Bitte fasse dich kürzer (höchstens 500 Zeichen).',
  answers: 'Die Antworten auf die Zusatzfragen ließen sich nicht lesen. Lade die Seite neu und versuche es erneut.',
  startedAt: 'Das Formular ist nicht mehr aktuell. Lade die Seite neu und sende dein Feedback erneut.'
};

function feedbackValidationMessage(error) {
  const field = error.details?.[0]?.path?.[0];
  return feedbackFieldMessages[field]
    || 'Einige Angaben sind ungültig. Bitte prüfe deine Eingaben und sende das Feedback erneut.';
}

// What happens with the data of a guest, written from the settings of this organization.
publicRouter.get('/privacy/:slug', async (req, res, next) => {
  try {
    const organization = (await query('SELECT * FROM organizations WHERE slug = $1', [req.params.slug])).rows[0];
    if (!organization) {
      return res.status(404).json({
        status: 'organization_not_found',
        message: 'Zu dieser Adresse gibt es keine Datenschutzseite. Prüfe den Link oder den QR-Code.'
      });
    }
    const newsletter = await new NewsletterService({ query }).connectionFor(organization.id);
    const smtp = (await query(
      'SELECT host FROM smtp_settings WHERE organization_id = $1 AND enabled = true',
      [organization.id]
    )).rows[0];
    res.json({
      status: 'ok',
      credit: creditFor(organization),
      ...privacyPage(organization, {
        newsletter: newsletter ? { api_url: newsletter.api_url } : null,
        mailHost: smtp?.host || null
      })
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/site', async (req, res, next) => {
  try {
    const site = await getSiteContent({ query });
    res.json({
      content: site.content,
      adminAppUrl: env.adminAppUrl,
      feedbackAppUrl: env.feedbackAppUrl,
      updatedAt: site.updated_at
    });
  } catch (error) {
    next(error);
  }
});

function systemTexts(language) {
  return defaultTextsByLanguage[language] || defaultTexts;
}

const feedbackLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `Von diesem Anschluss kamen gerade sehr viele Bewertungen. Bitte warte ${describeWait(env.rateLimitWindowMs)} und sende dein Feedback dann erneut.` }
});

async function activeQuestions(eventId) {
  const result = await query(
    `SELECT q.id, q.question_type, q.internal_name, q.label, q.help_text, q.placeholder, q.required, q.sort_order,
            q.options, q.visibility_rules
     FROM feedback_questions q
     JOIN feedback_forms f ON f.id = q.feedback_form_id
     WHERE f.event_id = $1 AND f.active = true AND q.active = true
     ORDER BY q.sort_order`,
    [eventId]
  );
  return result.rows;
}

async function findQrSource(event, sourceSlug) {
  if (!sourceSlug) return null;
  const result = await query(
    `SELECT * FROM qr_sources
     WHERE organization_id = $1
       AND source_slug = $2
       AND active = true
       AND (event_id IS NULL OR event_id = $3)
     ORDER BY event_id NULLS LAST
     LIMIT 1`,
    [event.organization_id, sourceSlug, event.id]
  );
  return result.rows[0] || null;
}

// A scan belongs to the phase it happened in: before the round, inside it, or after it.
// Each phase keeps its own column, so someone who scanned the poster in the afternoon
// stays countable without looking like a guest of the running round.
const SCAN_PHASES = ['before', 'live', 'after'];

function scanFailed(error, phase) {
  // The guest page works either way, but a counter that quietly stays at zero
  // would make the whole view look like nobody ever scanned.
  console.warn(`Ein Scan (${phase}) liess sich nicht zaehlen: ${error.message}`);
}

async function trackQrScan(event, sourceSlug, qrSource = null, sourceType = 'unknown', phase = 'live') {
  // Before the round the tenant code knows the event people wait for; without one there is nothing to count on.
  if (!event?.id) return null;
  const round = SCAN_PHASES.includes(phase) ? phase : 'live';
  const source = qrSource || await findQrSource(event, sourceSlug);
  if (round === 'live') {
    // The counter on the source itself answers "how often did this spot bring someone
    // into a running round", so only those scans land there.
    await query(
      `UPDATE qr_sources
       SET scans_count = scans_count + 1, updated_at = now()
       WHERE id = $1`,
      [source?.id]
    ).catch((error) => scanFailed(error, round));
  }
  await query(
    `INSERT INTO qr_source_daily_stats (
      organization_id, event_id, qr_source_id, source_type, source_label, day,
      scans_count, scans_before, scans_after
    )
    VALUES ($1,$2,$3,$4,$5,current_date,$6,$7,$8)
    ON CONFLICT (organization_id, event_id, qr_source_id, source_type, day)
    DO UPDATE SET
      scans_count = qr_source_daily_stats.scans_count + EXCLUDED.scans_count,
      scans_before = qr_source_daily_stats.scans_before + EXCLUDED.scans_before,
      scans_after = qr_source_daily_stats.scans_after + EXCLUDED.scans_after,
      source_label = COALESCE(EXCLUDED.source_label, qr_source_daily_stats.source_label),
      updated_at = now()`,
    [
      event.organization_id,
      event.id,
      source?.id || null,
      sourceSlug || sourceType,
      // The counted day keeps the name of the spot, so it stays readable once the source is gone.
      source?.label || null,
      round === 'live' ? 1 : 0,
      round === 'before' ? 1 : 0,
      round === 'after' ? 1 : 0
    ]
  ).catch((error) => scanFailed(error, round));
  return source;
}

async function trackQrFeedback(event, feedback, sourceSlug, qrSource = null, sourceType = 'unknown') {
  await query(
    `INSERT INTO qr_source_daily_stats (
      organization_id, event_id, qr_source_id, source_type, source_label, day, feedback_count,
      average_rating, newsletter_optins, low_ratings
    )
    VALUES ($1,$2,$3,$4,$5,current_date,1,$6,$7,$8)
    ON CONFLICT (organization_id, event_id, qr_source_id, source_type, day)
    DO UPDATE SET
      feedback_count = qr_source_daily_stats.feedback_count + 1,
      average_rating = (
        (COALESCE(qr_source_daily_stats.average_rating, 0) * qr_source_daily_stats.feedback_count + $6)
        / NULLIF(qr_source_daily_stats.feedback_count + 1, 0)
      ),
      newsletter_optins = qr_source_daily_stats.newsletter_optins + $7,
      low_ratings = qr_source_daily_stats.low_ratings + $8,
      source_label = COALESCE(EXCLUDED.source_label, qr_source_daily_stats.source_label),
      updated_at = now()`,
    [
      event.organization_id,
      event.id,
      qrSource?.id || null,
      sourceSlug || sourceType,
      qrSource?.label || null,
      feedback.rating,
      feedback.newsletter_optin ? 1 : 0,
      feedback.rating <= 2 ? 1 : 0
    ]
  ).catch(() => {});
}

// A vote counted at the tap may change its stars before the form is sent, and only then
// says whether the guest wants the newsletter. Its day keeps the count it already has;
// the average, the low ratings and the sign-ups move with the change. The day is read
// from the vote itself, so a form sent after midnight still corrects the day of the tap.
async function adjustQrFeedback(event, { feedbackId, sourceSlug, qrSource, sourceType, oldRating, newRating, newsletter }) {
  if (Number(oldRating) === Number(newRating) && !newsletter) return;
  const low = (value) => (Number(value) >= 1 && Number(value) <= 2 ? 1 : 0);
  await query(
    `UPDATE qr_source_daily_stats SET
       average_rating = CASE WHEN feedback_count > 0
         THEN (COALESCE(average_rating, 0) * feedback_count - $6 + $7) / feedback_count
         ELSE average_rating END,
       low_ratings = GREATEST(low_ratings - $8 + $9, 0),
       newsletter_optins = newsletter_optins + $10,
       updated_at = now()
     WHERE organization_id = $1 AND event_id = $2 AND qr_source_id IS NOT DISTINCT FROM $3
       AND source_type = $4
       AND day = (SELECT submitted_at::date FROM feedback_responses WHERE id = $5)`,
    [
      event.organization_id, event.id, qrSource?.id || null, sourceSlug || sourceType, feedbackId,
      Number(oldRating), Number(newRating), low(oldRating), low(newRating), newsletter ? 1 : 0
    ]
  ).catch((error) => console.warn(`Die Zahlen der QR-Quelle liessen sich nicht nachfuehren: ${error.message}`));
}

async function publicPayload(resolveResult, questions = [], language = null) {
  const event = resolveResult.event;
  const organization = resolveResult.organization || {
    name: event.organization_name,
    slug: event.organization_slug,
    primary_color: event.primary_color,
    logo_url: event.logo_url,
    privacy_text: event.privacy_text,
    footer_text: event.footer_text,
    branding: event.branding,
    default_language: event.default_language,
    product_credit_enabled: event.product_credit_enabled,
    ticketshop_url: event.ticketshop_url
  };
  const requestedLanguage = language || organization.default_language || 'de';
  const texts = await loadResolvedTexts({ query }, event.organization_id, event.id, requestedLanguage, event);
  const upcoming = await upcomingFor({ query }, event, organization);
  return { event: eventToPublic(event, organization, questions), texts, upcoming };
}

publicRouter.get('/f/:organizationSlug/:sourceSlug?', async (req, res, next) => {
  try {
    const resolver = new EventResolver({ query });
    const resolved = await resolver.resolveCurrentEvent(req.params.organizationSlug, req.params.sourceSlug);
    if (resolved.status === 'not_yet') {
      const texts = await loadResolvedTexts(
        { query },
        resolved.organization.id,
        null,
        req.query.lang || resolved.organization.default_language || 'de',
        {}
      );
      // Somebody scanned before the round. It belongs to the event they are waiting for.
      await trackQrScan(resolved.upcoming?.[0], req.params.sourceSlug, resolved.qrSource, 'dynamic', 'before');
      return res.json({
        status: 'waiting',
        texts,
        organization: publicOrganization(resolved.organization),
        upcoming: await upcomingForOrganization({ query }, resolved.organization)
      });
    }
    if (resolved.status !== 'ok') {
      return res.status(404).json({
        status: resolved.status,
        texts: systemTexts(req.query.lang),
        organization: publicOrganization(resolved.organization)
      });
    }
    await trackQrScan(resolved.event, req.params.sourceSlug, resolved.qrSource, 'dynamic');
    res.json({ status: 'ok', ...(await publicPayload(resolved, await activeQuestions(resolved.event.id), req.query.lang)) });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/e/:eventToken', async (req, res, next) => {
  try {
    const resolver = new EventResolver({ query });
    const resolved = await resolver.resolveEventByToken(req.params.eventToken);
    // A signed preview link from the admin area shows the page while no feedback round runs.
    const preview = verifyPreviewToken(req.params.eventToken, req.query.preview);
    if (resolved.status !== 'ok') {
      if (preview && resolved.event) {
        return res.json({
          status: 'ok',
          preview: true,
          ...(await publicPayload({ event: resolved.event }, await activeQuestions(resolved.event.id), req.query.lang))
        });
      }
      const feedbackWindow = resolved.event ? calculateFeedbackWindow(resolved.event) : null;
      if (resolved.status === 'not_yet') {
        await trackQrScan(resolved.event, req.query.source, null, 'event_specific', 'before');
        return res.json({
          status: 'waiting',
          ...(await publicPayload({ event: resolved.event }, await activeQuestions(resolved.event.id), req.query.lang)),
          feedback: { opensAt: feedbackWindow?.feedbackStart?.toISO(), closesAt: feedbackWindow?.feedbackEnd?.toISO() }
        });
      }
      // The round is over and the page stays closed. The scan still says someone tried.
      await trackQrScan(resolved.event, req.query.source, null, 'event_specific', 'after');
      return res.status(410).json({
        status: resolved.status,
        texts: systemTexts(req.query.lang),
        event: publicEventStatus(resolved.event),
        feedback: feedbackWindow ? { opensAt: feedbackWindow.feedbackStart?.toISO(), closesAt: feedbackWindow.feedbackEnd?.toISO() } : null
      });
    }
    // A preview stays out of the scan statistics.
    if (!preview) await trackQrScan(resolved.event, req.query.source, null, 'event_specific');
    res.json({ status: 'ok', preview, ...(await publicPayload({ event: resolved.event }, await activeQuestions(resolved.event.id), req.query.lang)) });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/events/:eventToken/status', async (req, res, next) => {
  try {
    const resolver = new EventResolver({ query });
    const resolved = await resolver.resolveEventByToken(req.params.eventToken);
    res.json({ status: resolved.status, event: publicEventStatus(resolved.event) });
  } catch (error) {
    next(error);
  }
});

const progressLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: Math.max(env.rateLimitMax * 20, 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Von diesem Anschluss kamen gerade sehr viele Anfragen. Bitte lade die Seite in einem Moment neu.' }
});

// What a guest answered on the way. The shape is closed on purpose: a phone number, a
// note or a newsletter address never belongs to a form nobody sent, so even a page that
// offered them would have them dropped here. The privacy page says the same.
const draftSchema = Joi.object({
  rating: Joi.number().integer().min(0).max(5).default(0),
  answers: Joi.object().unknown(true).max(60).default({}),
  commentPositive: Joi.string().max(3000).allow('', null),
  commentImprovement: Joi.string().max(3000).allow('', null),
  newsletter: Joi.boolean().allow(null)
});

const progressSchema = Joi.object({
  sessionKey: Joi.string().max(64).required(),
  step: Joi.string().max(80).required(),
  stepKind: Joi.string().max(40).allow('', null),
  stepLabel: Joi.string().max(160).allow('', null),
  stepIndex: Joi.number().integer().min(0).max(200).default(0),
  stepsTotal: Joi.number().integer().min(1).max(200).default(1),
  sourceType: Joi.string().max(80).allow('', null),
  draft: draftSchema.allow(null)
});

const feedbackSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  npsScore: Joi.number().integer().min(0).max(10).allow(null),
  commentPositive: Joi.string().max(3000).allow('', null),
  commentImprovement: Joi.string().max(3000).allow('', null),
  generalComment: Joi.string().max(3000).allow('', null),
  newsletterOptin: Joi.boolean().default(false),
  newsletterEmail: Joi.string().email().allow('', null),
  contactRequested: Joi.boolean().default(false),
  contactPhone: Joi.string().max(80).pattern(/^[0-9+()\-\s/]*$/).allow('', null),
  contactNote: Joi.string().max(500).allow('', null),
  testimonialAllowed: Joi.boolean().default(false),
  sourceType: Joi.string().max(80).default('event_specific'),
  answers: Joi.object().unknown(true).default({}),
  honeypot: Joi.string().allow('', null),
  startedAt: Joi.date().iso().allow(null),
  sessionKey: Joi.string().max(64).allow('', null),
  language: Joi.string().max(10).allow('', null)
});

// Every step of the guest flow reports back here, so the admin area can see where people stop.
publicRouter.post('/events/:eventToken/progress', progressLimiter, async (req, res, next) => {
  try {
    const { value, error } = progressSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: 'Der Schritt konnte nicht vermerkt werden. Bitte lade die Seite neu.' });
    const resolver = new EventResolver({ query });
    const resolved = await resolver.resolveEventByToken(req.params.eventToken);
    // A closed event has no flow to follow, and the answer stays the same either way.
    if (resolved.status === 'ok' || resolved.status === 'not_yet') {
      const qrSource = await findQrSource(resolved.event, value.sourceType);
      await recordProgress({ query }, {
        event: resolved.event,
        qrSource,
        progress: value,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const ratingSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  sessionKey: Joi.string().max(64).required(),
  sourceType: Joi.string().max(80).default('event_specific'),
  language: Joi.string().max(10).allow('', null)
});

// A tap on a star is a vote, stored the moment it happens. A guest who stops right after
// it has been counted all the same: the smallest first step, taken seriously.
publicRouter.post('/events/:eventToken/rating', feedbackLimiter, async (req, res, next) => {
  try {
    const { value, error } = ratingSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: 'Die Sterne ließen sich nicht speichern. Tippe sie bitte noch einmal an.' });
    const resolved = await new EventResolver({ query }).resolveEventByToken(req.params.eventToken);
    if (resolved.status !== 'ok') {
      return res.status(410).json({ error: 'Die Bewertung für dieses Event ist gerade geschlossen. Deine Sterne konnten deshalb nicht gespeichert werden.' });
    }
    const event = resolved.event;
    const qrSource = await findQrSource(event, value.sourceType);
    const vote = await recordRating({
      event,
      rating: value.rating,
      sessionKey: value.sessionKey,
      sourceType: value.sourceType,
      qrSourceId: qrSource?.id || null,
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });
    if (vote.created) {
      await trackQrFeedback(event, { rating: vote.rating, newsletter_optin: false }, value.sourceType, qrSource, value.sourceType);
    } else if (!vote.completed && vote.previousRating !== vote.rating) {
      await adjustQrFeedback(event, {
        feedbackId: vote.id,
        sourceSlug: value.sourceType,
        qrSource,
        sourceType: value.sourceType,
        oldRating: vote.previousRating,
        newRating: vote.rating,
        newsletter: false
      });
    }
    // A low tap reaches the organizer even if the guest leaves now. The alert waits a while,
    // so a callback number left in the next minutes still travels with it.
    if (!vote.completed && turnsLow(vote.previousRating, vote.rating)) {
      await enqueueJob({ query }, event.organization_id, 'notification.low_rating', { eventId: event.id, feedbackId: vote.id }, {
        runAfter: new Date(Date.now() + lowRatingGraceMinutes * 60 * 1000)
      }).catch((jobError) => console.warn(`Die Meldung zur niedrigen Bewertung liess sich nicht einplanen: ${jobError.message}`));
    }
    res.status(vote.created ? 201 : 200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

publicRouter.post('/events/:eventToken/feedback', feedbackLimiter, async (req, res, next) => {
  try {
    const { value, error } = feedbackSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: feedbackValidationMessage(error) });
    if (value.newsletterOptin && !value.newsletterEmail) {
      return res.status(400).json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
    }
    const resolver = new EventResolver({ query });
    const resolved = await resolver.resolveEventByToken(req.params.eventToken);
    if (resolved.status !== 'ok') return res.status(410).json({ error: 'Die Bewertung für dieses Event ist gerade geschlossen. Dein Feedback konnte deshalb nicht gespeichert werden.' });
    const event = resolved.event;
    // The texts of the organization: the guest agreed to these words, so these are the ones that get stored.
    const texts = await loadResolvedTexts({ query }, event.organization_id, event.id, value.language || event.default_language || 'de', event);
    const antiSpam = event.anti_spam_settings || {};
    const secondsSinceStart = value.startedAt ? (Date.now() - new Date(value.startedAt).getTime()) / 1000 : null;
    const honeypotHit = antiSpam.honeypot_enabled !== false && Boolean(value.honeypot);
    const tooFast = secondsSinceStart !== null && secondsSinceStart < Number(antiSpam.min_seconds ?? 3);
    const spamScore = (honeypotHit ? 80 : 0) + (tooFast ? 20 : 0);
    const qrSource = await findQrSource(event, value.sourceType);
    const contactRequested = value.rating <= 2 && Boolean(value.contactRequested || value.contactPhone);
    // A tap on a star already stored the vote. The form completes that very row, so one
    // guest stays one rating; only a visit without a tap -- an older page, a lost request --
    // writes a new one as before.
    const { feedback, tapped } = await withTransaction(async (client) => {
      const vote = await openVoteFor(client, event, value.sessionKey);
      if (vote) {
        const updated = (await client.query(
          `UPDATE feedback_responses SET
             rating = $2, nps_score = $3, comment_positive = $4, comment_improvement = $5, general_comment = $6,
             newsletter_optin = $7, contact_requested = $8, testimonial_allowed = $9, spam_score = $10,
             is_suspicious = $11, qr_source_id = COALESCE(qr_source_id, $12), completed_at = now()
           WHERE id = $1 RETURNING *`,
          [
            vote.id, value.rating, value.npsScore, value.commentPositive, value.commentImprovement,
            value.generalComment, value.newsletterOptin, contactRequested, value.testimonialAllowed,
            spamScore, spamScore >= 20, qrSource?.id || null
          ]
        )).rows[0];
        return { feedback: updated, tapped: vote };
      }
      const inserted = (await client.query(
        `INSERT INTO feedback_responses (
          organization_id, event_id, qr_source_id, resolved_event_id, source_type, rating, nps_score, comment_positive,
          comment_improvement, general_comment, newsletter_optin, contact_requested, contact_phone, contact_note, testimonial_allowed,
          user_agent_hash, ip_hash, spam_score, is_suspicious, completed_at
        ) VALUES ($1,$2,$3,$2,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now()) RETURNING *`,
        [
          event.organization_id,
          event.id,
          qrSource?.id || null,
          value.sourceType,
          value.rating,
          value.npsScore,
          value.commentPositive,
          value.commentImprovement,
          value.generalComment,
          value.newsletterOptin,
          contactRequested,
          null,
          null,
          value.testimonialAllowed,
          hashValue(req.headers['user-agent']),
          hashValue(req.ip),
          spamScore,
          spamScore >= 20
        ]
      )).rows[0];
      return { feedback: inserted, tapped: null };
    });
    if (tapped) {
      // The tap counted this vote in the numbers of its QR source already.
      await adjustQrFeedback(event, {
        feedbackId: feedback.id,
        sourceSlug: value.sourceType,
        qrSource,
        sourceType: value.sourceType,
        oldRating: tapped.rating,
        newRating: feedback.rating,
        newsletter: feedback.newsletter_optin
      });
    } else {
      await trackQrFeedback(event, feedback, value.sourceType, qrSource, value.sourceType);
    }
    const questions = await activeQuestions(event.id);
    for (const question of questions) {
      if (Object.prototype.hasOwnProperty.call(value.answers, question.internal_name)) {
        await query(
          'INSERT INTO feedback_answers (feedback_response_id, feedback_question_id, answer_value) VALUES ($1,$2,$3)',
          [feedback.id, question.id, JSON.stringify(value.answers[question.internal_name])]
        );
      }
    }
    await markCompleted({ query }, {
      event,
      sessionKey: value.sessionKey,
      feedbackId: feedback.id,
      stepsTotal: questions.length + 3
    });
    const webhook = new WebhookService({ query });
    if (value.newsletterOptin) {
      const normalizedEmail = String(value.newsletterEmail || '').trim().toLowerCase();
      const optin = (await query(
        `INSERT INTO newsletter_optins (
          organization_id, event_id, feedback_response_id, email, email_encrypted, email_hash, email_domain,
          consent_text, source
        )
         VALUES ($1,$2,$3,null,$4,$5,$6,$7,'feedback')
         RETURNING id`,
        [
          event.organization_id,
          event.id,
          feedback.id,
          encryptSecret(normalizedEmail),
          emailHash(normalizedEmail),
          emailDomain(normalizedEmail),
          texts.newsletter_label
        ]
      )).rows[0];
      // The handover to the newsletter system runs in the background, so the guest waits for nothing.
      const newsletter = await new NewsletterService({ query }).connectionFor(event.organization_id);
      if (newsletter) {
        await enqueueJob({ query }, event.organization_id, 'newsletter.sync', { optinId: optin.id });
      }
      await webhook.dispatch(event.organization_id, 'newsletter.optin', {
        eventId: event.id,
        feedbackId: feedback.id,
        emailProvided: true,
        emailHash: emailHash(normalizedEmail),
        emailDomain: emailDomain(normalizedEmail),
        consentText: texts.newsletter_label,
        source: value.sourceType,
        consentGivenAt: feedback.submitted_at
      });
    }
    await webhook.dispatch(event.organization_id, 'feedback.created', {
      eventId: event.id,
      rating: feedback.rating,
      newsletterOptin: feedback.newsletter_optin,
      submittedAt: feedback.submitted_at
    });
    if (feedback.rating <= 2) {
      if (value.contactPhone || value.contactNote) {
        await query(
          `INSERT INTO low_rating_cases (
            organization_id, event_id, feedback_response_id, rating, status,
            contact_phone_encrypted, contact_note, contact_note_encrypted, visitor_message, consent_text, retention_until
          )
          VALUES ($1,$2,$3,$4,'open',$5,null,$6,$7,$8, now() + interval '90 days')
          ON CONFLICT (feedback_response_id) DO UPDATE SET
            contact_phone_encrypted = EXCLUDED.contact_phone_encrypted,
            contact_note = null,
            contact_note_encrypted = EXCLUDED.contact_note_encrypted,
            visitor_message = EXCLUDED.visitor_message,
            updated_at = now()`,
          [
            event.organization_id,
            event.id,
            feedback.id,
            feedback.rating,
            value.contactPhone ? encryptSecret(value.contactPhone) : null,
            value.contactNote ? encryptSecret(value.contactNote) : null,
            texts.low_rating_contact_text,
            'Besucher hat freiwillig eine Rückrufnummer zur Klärung einer niedrigen Bewertung hinterlassen.'
          ]
        );
      }
      await webhook.dispatch(event.organization_id, 'feedback.low_rating', {
        eventId: event.id,
        rating: feedback.rating,
        submittedAt: feedback.submitted_at,
        contactRequested: feedback.contact_requested,
        contactPhoneProvided: Boolean(value.contactPhone)
      });
      await enqueueJob({ query }, event.organization_id, 'notification.low_rating', {
        eventId: event.id,
        feedbackId: feedback.id
      }).catch(() => {});
    }
    res.status(201).json({ ok: true, message: texts.thank_text });
  } catch (error) {
    next(error);
  }
});
