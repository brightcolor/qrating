import { DateTime } from 'luxon';
import { httpError } from '../middleware/errors.js';
import { env } from '../config/env.js';
import { decryptSecret } from '../utils/crypto.js';
import { plainText } from '../utils/localized.js';
import { fetchService, openSecret } from '../utils/serviceErrors.js';
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

// One star is a star, not stars.
function stars(rating) {
  return `${rating} ${Number(rating) === 1 ? 'Stern' : 'Sterne'}`;
}

// A push travels over a notification service and lands on a lock screen, so it
// names no guest. The mail goes to a known mailbox and carries everything.
function lowRatingMessage(event, feedback) {
  const contactPhone = feedback.low_rating_case?.contact_phone_encrypted
    ? 'Rückrufnummer: im geschützten Low-Rating-Dashboard hinterlegt.'
    : null;
  const contactNote = feedback.low_rating_case?.contact_note_encrypted || feedback.low_rating_case?.contact_note
    ? 'Kontakt-Hinweis: im geschützten Low-Rating-Dashboard hinterlegt.'
    : null;
  return [
    `qrating: niedrige Bewertung (${stars(feedback.rating)})`,
    '',
    `Event: ${event.name}`,
    `Zeitpunkt: ${moment(feedback.submitted_at, event.event_timezone) || feedback.submitted_at}`,
    contactPhone,
    contactNote,
    '',
    'Die Einzelheiten stehen in der E-Mail und im Low-Rating-Dashboard.'
  ].filter(Boolean).join('\n');
}

// A stored secret that cannot be opened must not swallow the whole message.
function openStored(value, label) {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch (error) {
    console.error(`[notification] ${label} konnte nicht entschlüsselt werden: ${error.message}`);
    return 'liess sich mit dem aktuellen Schlüssel nicht öffnen. Die Angabe steht im Low-Rating-Dashboard.';
  }
}

// Times belong in the zone of the evening, written the way people read them.
function moment(value, zone) {
  if (!value) return null;
  const parsed = DateTime.fromJSDate(value instanceof Date ? value : new Date(value), { zone: 'utc' });
  if (!parsed.isValid) return null;
  return parsed.setZone(zone || 'Europe/Berlin').setLocale('de').toFormat("ccc, d. LLLL yyyy 'um' HH:mm");
}

function block(label, value) {
  const text = String(value ?? '').trim();
  return text ? `${label}:\n${text}` : null;
}

export function lowRatingDetailMessage(event, feedback) {
  const item = feedback.low_rating_case || {};
  const phone = openStored(item.contact_phone_encrypted, 'Die Rückrufnummer');
  const note = openStored(item.contact_note_encrypted, 'Das Anliegen');
  const zone = event.event_timezone || 'Europe/Berlin';
  const when = [moment(event.date_from, zone), plainText(event.location)].filter(Boolean).join(' · ');
  return [
    `Ein Gast hat ${stars(feedback.rating)} gegeben.`,
    '',
    `Event: ${event.name}`,
    when ? `Wann und wo: ${when}` : null,
    `Abgegeben: ${moment(feedback.submitted_at, zone) || feedback.submitted_at}`,
    '',
    phone ? `Rückrufnummer: ${phone}` : 'Rückruf: nicht gewünscht.',
    block('Anliegen', note),
    block('Was gut war', feedback.comment_positive),
    block('Was besser sein darf', feedback.comment_improvement),
    block('Weiterer Kommentar', feedback.general_comment),
    '',
    `Vorgang bearbeiten: ${env.adminAppUrl}/admin — Bereich Low-Rating`,
    'Diese Angaben stehen nur in dieser E-Mail und im Dashboard. Bitte entsprechend behandeln.'
  ].filter((line) => line !== null).join('\n');
}

function lowRatingTitle(event, feedback) {
  return `qrating: ${stars(feedback.rating)} für ${event.name}`;
}

function notificationEvent(event) {
  return {
    id: event.id,
    name: event.name,
    dateFrom: event.date_from,
    dateTo: event.date_to,
    location: plainText(event.location) || null
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
      const delivery = await this.sendChannel(channel, payload, { event, feedback })
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

  // `source` carries the unredacted rating. Only the mail branch reads it, so a
  // channel that was never meant to name a guest cannot start doing so by accident.
  async sendChannel(channel, payload, source = null) {
    const config = channel.config || {};
    const secret = channel.secret_encrypted ? openSecret(channel.secret_encrypted, 'Das gespeicherte Secret dieses Kanals') : null;
    const type = channel.channel_type;
    if (type === 'email') {
      const result = await this.smtpService.sendMail(channel.organization_id, {
        to: config.to || channel.user_email,
        subject: payload.title,
        text: source ? lowRatingDetailMessage(source.event, source.feedback) : payload.text
      });
      if (result?.skipped) {
        throw httpError(400, 'Der E-Mail-Versand ist nicht eingerichtet oder ausgeschaltet. Richte ihn unter SMTP ein und aktiviere ihn.');
      }
      return result;
    }
    if (['discord', 'slack', 'mattermost', 'teams', 'webhook'].includes(type)) {
      return this.sendWebhook(type, secret || config.url, payload);
    }
    if (type === 'telegram') {
      requireSetting(secret, 'Für Telegram fehlt der Bot-Token. Trage ihn im Feld „Secret / Token / Webhook-URL“ ein.');
      requireSetting(config.chatId, 'Für Telegram fehlt die Chat-ID. Trage sie im Feld „Config JSON“ ein, zum Beispiel {"chatId":"123456"}.');
      return this.postJson(type, `https://api.telegram.org/bot${secret}/sendMessage`, {
        chat_id: config.chatId,
        text: payload.text
      });
    }
    if (type === 'pushover') {
      requireSetting(secret, 'Für Pushover fehlt der App-Token. Trage ihn im Feld „Secret / Token / Webhook-URL“ ein.');
      requireSetting(config.userKey, 'Für Pushover fehlt der User-Key. Trage ihn im Feld „Config JSON“ ein, zum Beispiel {"userKey":"…"}.');
      return this.postForm(type, 'https://api.pushover.net/1/messages.json', {
        token: secret,
        user: config.userKey,
        title: payload.title,
        message: payload.text,
        priority: String(config.priority ?? 0)
      });
    }
    if (type === 'ntfy') {
      requireSetting(config.topicUrl, 'Für ntfy fehlt die Topic-Adresse. Trage sie im Feld „Config JSON“ ein, zum Beispiel {"topicUrl":"https://ntfy.sh/mein-topic"}.');
      const headers = {
        title: encodeHeaderText(payload.title),
        priority: String(config.priority || 'high')
      };
      if (secret) headers.authorization = `Bearer ${secret}`;
      return this.fetchChecked(type, config.topicUrl, { method: 'POST', headers, body: payload.text });
    }
    if (type === 'gotify') {
      requireSetting(secret, 'Für Gotify fehlt der App-Token. Trage ihn im Feld „Secret / Token / Webhook-URL“ ein.');
      requireSetting(config.url, 'Für Gotify fehlt die Server-Adresse. Trage sie im Feld „Config JSON“ ein, zum Beispiel {"url":"https://gotify.example.com"}.');
      let url;
      try {
        url = new URL('/message', String(config.url).replace(/\/$/, ''));
      } catch {
        throw httpError(400, 'Die Gotify-Adresse im Feld „Config JSON“ ist ungültig. Sie muss mit https:// beginnen.');
      }
      return this.postJson(type, url.toString(), {
        title: payload.title,
        message: payload.text,
        priority: Number(config.priority || 5)
      }, { 'x-gotify-key': secret });
    }
    throw httpError(400, `Den Kanaltyp „${type}“ kennt qrating nicht. Lege den Kanal mit einem der angebotenen Typen neu an.`);
  }

  async sendWebhook(type, url, payload) {
    requireSetting(url, 'Für diesen Kanal ist keine Webhook-URL hinterlegt. Trage sie im Feld „Secret / Token / Webhook-URL“ ein.');
    if (type === 'discord') {
      return this.postJson(type, url, { content: `**${payload.title}**\n${payload.text}` });
    }
    if (type === 'slack' || type === 'mattermost') {
      return this.postJson(type, url, { text: `*${payload.title}*\n${payload.text}` });
    }
    if (type === 'teams') {
      return this.postJson(type, url, { text: `**${payload.title}**\n\n${payload.text}` });
    }
    return this.postJson(type, url, { title: payload.title, text: payload.text, event: payload.event, feedback: payload.feedback });
  }

  async postJson(type, url, body, headers = {}) {
    return this.fetchChecked(type, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
  }

  async postForm(type, url, body) {
    return this.fetchChecked(type, url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString()
    });
  }

  async fetchChecked(type, url, options) {
    const service = channelServiceNames[type] || 'Der Empfänger der Benachrichtigung';
    const response = await fetchService(service, this.fetchImpl, url, options, {
      overrides: type === 'telegram' ? { 404: ['kennt den Bot-Token nicht', 'Prüfe den Token von @BotFather.'] } : {}
    });
    return { status: response.status };
  }
}

const channelServiceNames = {
  discord: 'Discord',
  slack: 'Slack',
  mattermost: 'Mattermost',
  teams: 'Microsoft Teams',
  telegram: 'Telegram',
  pushover: 'Pushover',
  ntfy: 'Der ntfy-Server',
  gotify: 'Der Gotify-Server',
  webhook: 'Der Webhook-Empfänger'
};

function requireSetting(value, message) {
  if (!value) throw httpError(400, message);
  return value;
}

// HTTP headers carry ASCII safely, so ntfy gets other titles as RFC 2047 encoded words.
export function encodeHeaderText(value) {
  const text = String(value ?? '');
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const words = [];
  let word = '';
  for (const char of text) {
    // 45 bytes become 60 base64 characters, which keeps each encoded word within 75 characters.
    if (word && Buffer.byteLength(word + char) > 45) {
      words.push(word);
      word = '';
    }
    word += char;
  }
  if (word) words.push(word);
  return words.map((part) => `=?UTF-8?B?${Buffer.from(part, 'utf8').toString('base64')}?=`).join(' ');
}
