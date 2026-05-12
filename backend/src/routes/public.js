import express from 'express';
import rateLimit from 'express-rate-limit';
import Joi from 'joi';
import { query } from '../db/pool.js';
import { EventResolver } from '../services/eventResolver.js';
import { defaultTexts, defaultTextsByLanguage, loadResolvedTexts } from '../services/textService.js';
import { eventToPublic } from '../db/bootstrap.js';
import { hashValue } from '../utils/crypto.js';
import { env } from '../config/env.js';
import { WebhookService } from '../services/webhookService.js';
import { enqueueJob } from '../services/jobService.js';
import { encryptSecret } from '../utils/crypto.js';
import { getSiteContent } from '../services/siteContentService.js';

export const publicRouter = express.Router();

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
  message: { error: 'Es wurden zu viele Versuche erkannt. Bitte versuche es später erneut.' }
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

async function trackQrScan(event, sourceSlug, qrSource = null, sourceType = 'unknown') {
  const source = qrSource || await findQrSource(event, sourceSlug);
  await query(
    `UPDATE qr_sources
     SET scans_count = scans_count + 1, updated_at = now()
     WHERE id = $1`,
    [source?.id]
  ).catch(() => {});
  await query(
    `INSERT INTO qr_source_daily_stats (
      organization_id, event_id, qr_source_id, source_type, day, scans_count
    )
    VALUES ($1,$2,$3,$4,current_date,1)
    ON CONFLICT (organization_id, event_id, qr_source_id, source_type, day)
    DO UPDATE SET scans_count = qr_source_daily_stats.scans_count + 1, updated_at = now()`,
    [event.organization_id, event.id, source?.id || null, sourceSlug || sourceType]
  ).catch(() => {});
  return source;
}

async function trackQrFeedback(event, feedback, sourceSlug, qrSource = null, sourceType = 'unknown') {
  await query(
    `INSERT INTO qr_source_daily_stats (
      organization_id, event_id, qr_source_id, source_type, day, feedback_count, average_rating,
      newsletter_optins, low_ratings
    )
    VALUES ($1,$2,$3,$4,current_date,1,$5,$6,$7)
    ON CONFLICT (organization_id, event_id, qr_source_id, source_type, day)
    DO UPDATE SET
      feedback_count = qr_source_daily_stats.feedback_count + 1,
      average_rating = (
        (COALESCE(qr_source_daily_stats.average_rating, 0) * qr_source_daily_stats.feedback_count + $5)
        / NULLIF(qr_source_daily_stats.feedback_count + 1, 0)
      ),
      newsletter_optins = qr_source_daily_stats.newsletter_optins + $6,
      low_ratings = qr_source_daily_stats.low_ratings + $7,
      updated_at = now()`,
    [
      event.organization_id,
      event.id,
      qrSource?.id || null,
      sourceSlug || sourceType,
      feedback.rating,
      feedback.newsletter_optin ? 1 : 0,
      feedback.rating <= 2 ? 1 : 0
    ]
  ).catch(() => {});
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
    default_language: event.default_language
  };
  const requestedLanguage = language || organization.default_language || 'de';
  const texts = await loadResolvedTexts({ query }, event.organization_id, event.id, requestedLanguage, event);
  return { event: eventToPublic(event, organization, questions), texts };
}

publicRouter.get('/f/:organizationSlug/:sourceSlug?', async (req, res, next) => {
  try {
    const resolver = new EventResolver({ query });
    const resolved = await resolver.resolveCurrentEvent(req.params.organizationSlug, req.params.sourceSlug);
    if (resolved.status !== 'ok') {
      return res.status(404).json({ status: resolved.status, texts: systemTexts(req.query.lang), organization: resolved.organization });
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
    if (resolved.status !== 'ok') {
      return res.status(410).json({ status: resolved.status, texts: systemTexts(req.query.lang), event: resolved.event });
    }
    await trackQrScan(resolved.event, req.query.source, null, 'event_specific');
    res.json({ status: 'ok', ...(await publicPayload({ event: resolved.event }, await activeQuestions(resolved.event.id), req.query.lang)) });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/events/:eventToken/status', async (req, res, next) => {
  try {
    const resolver = new EventResolver({ query });
    res.json(await resolver.resolveEventByToken(req.params.eventToken));
  } catch (error) {
    next(error);
  }
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
  startedAt: Joi.date().iso().allow(null)
});

publicRouter.post('/events/:eventToken/feedback', feedbackLimiter, async (req, res, next) => {
  try {
    const { value, error } = feedbackSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.message });
    if (value.newsletterOptin && !value.newsletterEmail) {
      return res.status(400).json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
    }
    const resolver = new EventResolver({ query });
    const resolved = await resolver.resolveEventByToken(req.params.eventToken);
    if (resolved.status !== 'ok') return res.status(410).json({ error: 'Die Feedbackrunde ist nicht geöffnet.' });
    const event = resolved.event;
    const antiSpam = event.anti_spam_settings || {};
    const secondsSinceStart = value.startedAt ? (Date.now() - new Date(value.startedAt).getTime()) / 1000 : null;
    const honeypotHit = antiSpam.honeypot_enabled !== false && Boolean(value.honeypot);
    const tooFast = secondsSinceStart !== null && secondsSinceStart < Number(antiSpam.min_seconds ?? 3);
    const spamScore = (honeypotHit ? 80 : 0) + (tooFast ? 20 : 0);
    const qrSource = await findQrSource(event, value.sourceType);
    const response = await query(
      `INSERT INTO feedback_responses (
        organization_id, event_id, qr_source_id, resolved_event_id, source_type, rating, nps_score, comment_positive,
        comment_improvement, general_comment, newsletter_optin, contact_requested, contact_phone, contact_note, testimonial_allowed,
        user_agent_hash, ip_hash, spam_score, is_suspicious
      ) VALUES ($1,$2,$3,$2,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
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
        value.rating <= 2 && Boolean(value.contactRequested || value.contactPhone),
        null,
        null,
        value.testimonialAllowed,
        hashValue(req.headers['user-agent']),
        hashValue(req.ip),
        spamScore,
        spamScore >= 20
      ]
    );
    const feedback = response.rows[0];
    await trackQrFeedback(event, feedback, value.sourceType, qrSource, value.sourceType);
    const questions = await activeQuestions(event.id);
    for (const question of questions) {
      if (Object.prototype.hasOwnProperty.call(value.answers, question.internal_name)) {
        await query(
          'INSERT INTO feedback_answers (feedback_response_id, feedback_question_id, answer_value) VALUES ($1,$2,$3)',
          [feedback.id, question.id, JSON.stringify(value.answers[question.internal_name])]
        );
      }
    }
    const webhook = new WebhookService({ query });
    if (value.newsletterOptin) {
      await query(
        `INSERT INTO newsletter_optins (organization_id, event_id, feedback_response_id, email, consent_text, source)
         VALUES ($1,$2,$3,$4,$5,'feedback')`,
        [event.organization_id, event.id, feedback.id, value.newsletterEmail, defaultTexts.newsletter_label]
      );
      await webhook.dispatch(event.organization_id, 'newsletter.optin', {
        eventId: event.id,
        feedbackId: feedback.id,
        email: value.newsletterEmail,
        consentText: defaultTexts.newsletter_label,
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
            contact_phone_encrypted, contact_note, visitor_message, consent_text, retention_until
          )
          VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8, now() + interval '90 days')
          ON CONFLICT (feedback_response_id) DO UPDATE SET
            contact_phone_encrypted = EXCLUDED.contact_phone_encrypted,
            contact_note = EXCLUDED.contact_note,
            visitor_message = EXCLUDED.visitor_message,
            updated_at = now()`,
          [
            event.organization_id,
            event.id,
            feedback.id,
            feedback.rating,
            value.contactPhone ? encryptSecret(value.contactPhone) : null,
            value.contactNote || null,
            defaultTexts.low_rating_contact_text,
            'Besucher hat freiwillig eine Rueckrufnummer zur Klaerung einer niedrigen Bewertung hinterlassen.'
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
    res.status(201).json({ ok: true, message: defaultTexts.thank_text });
  } catch (error) {
    next(error);
  }
});
