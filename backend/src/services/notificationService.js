import { decryptSecret } from '../utils/crypto.js';
import { SmtpService } from './smtpService.js';

export const channelTypes = [
  'email',
  'discord',
  'slack',
  'mattermost',
  'teams',
  'telegram',
  'pushover',
  'ntfy',
  'gotify',
  'webhook'
];

export function publicChannel(row) {
  if (!row) return null;
  const { secret, secret_encrypted, ...safe } = row;
  return { ...safe, has_secret: Boolean(secret || secret_encrypted) };
}

function lowRatingMessage(event, feedback) {
  const contactPhone = feedback.low_rating_case?.contact_phone_encrypted
    ? 'Rueckrufnummer: im geschuetzten Low-Rating-Dashboard hinterlegt.'
    : null;
  const contactNote = feedback.low_rating_case?.contact_note_encrypted || feedback.low_rating_case?.contact_note
    ? 'Kontakt-Hinweis: im geschuetzten Low-Rating-Dashboard hinterlegt.'
    : null;
  return [
    `qrating: niedrige Bewertung (${feedback.rating} Sterne)`,
    '',
    `Event: ${event.name}`,
    `Zeitpunkt: ${feedback.submitted_at}`,
    contactPhone,
    contactNote,
    '',
    'Bitte zeitnah pruefen und empathisch nachfassen, falls eine Telefonnummer hinterlegt wurde.'
  ].filter(Boolean).join('\n');
}

function lowRatingTitle(event, feedback) {
  return `qrating: ${feedback.rating} Sterne fuer ${event.name}`;
}

function notificationEvent(event) {
  return {
    id: event.id,
    name: event.name,
    dateFrom: event.date_from,
    dateTo: event.date_to,
    location: event.location
  };
}

function notificationFeedback(feedback) {
  return {
    id: feedback.id,
    rating: feedback.rating,
    submittedAt: feedback.submitted_at,
    contactRequested: Boolean(feedback.contact_requested),
    contactPhoneProvided: Boolean(feedback.low_rating_case?.contact_phone_encrypted),
    contactNoteProvided: Boolean(feedback.low_rating_case?.contact_note_encrypted || feedback.low_rating_case?.contact_note)
  };
}

export class NotificationService {
  constructor(db, { fetchImpl = fetch, smtpService = null } = {}) {
    this.db = db;
    this.fetchImpl = fetchImpl;
    this.smtpService = smtpService || new SmtpService(db);
  }

  async listChannels(organizationId, userId = null) {
    const result = await this.db.query(
      `SELECT nc.*, u.name AS user_name, u.email AS user_email
       FROM notification_channels nc
       JOIN users u ON u.id = nc.user_id
       WHERE nc.organization_id = $1
         AND ($2::uuid IS NULL OR nc.user_id = $2)
       ORDER BY u.name, nc.created_at DESC`,
      [organizationId, userId]
    );
    return result.rows.map(publicChannel);
  }

  async dispatchLowRating(event, feedback) {
    const result = await this.db.query(
      `SELECT nc.*, u.email AS user_email, u.name AS user_name
       FROM user_event_assignments uea
       JOIN users u ON u.id = uea.user_id
       JOIN notification_channels nc ON nc.user_id = u.id
       WHERE uea.event_id = $1
         AND uea.organization_id = $2
         AND uea.notify_low_rating = true
         AND nc.enabled = true
         AND nc.min_rating >= $3`,
      [event.id, event.organization_id, feedback.rating]
    );
    const payload = {
      title: lowRatingTitle(event, feedback),
      text: lowRatingMessage(event, feedback),
      event: notificationEvent(event),
      feedback: notificationFeedback(feedback)
    };
    const deliveries = [];
    for (const channel of result.rows) {
      const deliveryResult = await this.db.query(
        `INSERT INTO notification_deliveries (
          organization_id, event_id, feedback_response_id, notification_channel_id, user_id, channel_type, status, attempts
        )
        VALUES ($1,$2,$3,$4,$5,$6,'queued',0)
        ON CONFLICT (feedback_response_id, notification_channel_id) DO NOTHING
        RETURNING *`,
        [event.organization_id, event.id, feedback.id, channel.id, channel.user_id, channel.channel_type]
      );
      if (!deliveryResult.rows.length) {
        deliveries.push({ channelId: channel.id, ok: true, skipped: true, reason: 'duplicate' });
        continue;
      }
      const delivery = await this.sendChannel(channel, payload)
        .then((response) => ({ channelId: channel.id, ok: true, response }))
        .catch((error) => ({ channelId: channel.id, ok: false, error: error.message }));
      deliveries.push(delivery);
      await this.db.query(
        `UPDATE notification_channels
         SET last_status = $1, last_error = $2, last_called_at = now(), updated_at = now()
         WHERE id = $3`,
        [delivery.ok ? 'ok' : 'error', delivery.ok ? null : delivery.error, channel.id]
      );
      await this.db.query(
        `UPDATE notification_deliveries
         SET status = $1, error = $2, attempts = attempts + 1, sent_at = CASE WHEN $1 = 'sent' THEN now() ELSE sent_at END, updated_at = now()
         WHERE id = $3`,
        [delivery.ok ? 'sent' : 'failed', delivery.ok ? null : delivery.error, deliveryResult.rows[0].id]
      );
    }
    return deliveries;
  }

  async sendChannel(channel, payload) {
    const config = channel.config || {};
    const secret = channel.secret_encrypted ? decryptSecret(channel.secret_encrypted) : null;
    if (channel.channel_type === 'email') {
      return this.smtpService.sendMail(channel.organization_id, {
        to: config.to || channel.user_email,
        subject: payload.title,
        text: payload.text
      });
    }
    if (['discord', 'slack', 'mattermost', 'teams', 'webhook'].includes(channel.channel_type)) {
      return this.sendWebhook(channel.channel_type, secret || config.url, payload);
    }
    if (channel.channel_type === 'telegram') {
      return this.postJson(`https://api.telegram.org/bot${secret}/sendMessage`, {
        chat_id: config.chatId,
        text: payload.text
      });
    }
    if (channel.channel_type === 'pushover') {
      return this.postForm('https://api.pushover.net/1/messages.json', {
        token: secret,
        user: config.userKey,
        title: payload.title,
        message: payload.text,
        priority: String(config.priority ?? 0)
      });
    }
    if (channel.channel_type === 'ntfy') {
      const headers = {
        title: payload.title,
        priority: String(config.priority || 'high')
      };
      if (secret) headers.authorization = `Bearer ${secret}`;
      return this.fetchChecked(config.topicUrl, { method: 'POST', headers, body: payload.text });
    }
    if (channel.channel_type === 'gotify') {
      const url = new URL('/message', config.url.replace(/\/$/, ''));
      return this.postJson(url.toString(), {
        title: payload.title,
        message: payload.text,
        priority: Number(config.priority || 5)
      }, { 'x-gotify-key': secret });
    }
    throw new Error(`Unbekannter Kanaltyp: ${channel.channel_type}`);
  }

  async sendWebhook(type, url, payload) {
    if (!url) throw new Error('Webhook-URL fehlt.');
    if (type === 'discord') {
      return this.postJson(url, { content: `**${payload.title}**\n${payload.text}` });
    }
    if (type === 'slack' || type === 'mattermost') {
      return this.postJson(url, { text: `*${payload.title}*\n${payload.text}` });
    }
    if (type === 'teams') {
      return this.postJson(url, { text: `**${payload.title}**\n\n${payload.text}` });
    }
    return this.postJson(url, { title: payload.title, text: payload.text, event: payload.event, feedback: payload.feedback });
  }

  async postJson(url, body, headers = {}) {
    return this.fetchChecked(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
  }

  async postForm(url, body) {
    return this.fetchChecked(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString()
    });
  }

  async fetchChecked(url, options) {
    const response = await this.fetchImpl(url, options);
    if (!response.ok) throw new Error(`Notification endpoint returned ${response.status}`);
    return { status: response.status };
  }
}
