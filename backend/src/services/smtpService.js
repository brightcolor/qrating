import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { httpError } from '../middleware/errors.js';
import { openSecret, smtpFailure } from '../utils/serviceErrors.js';

function publicSettings(row) {
  if (!row) return null;
  const { password_encrypted, ...safe } = row;
  return {
    ...safe,
    has_password: Boolean(password_encrypted)
  };
}

export class SmtpService {
  constructor(db, mailer = nodemailer) {
    this.db = db;
    this.mailer = mailer;
  }

  async getSettings(organizationId) {
    const result = await this.db.query('SELECT * FROM smtp_settings WHERE organization_id = $1', [organizationId]);
    return publicSettings(result.rows[0]);
  }

  createTransport(settings) {
    return this.mailer.createTransport({
      host: settings.host,
      port: Number(settings.port),
      secure: Boolean(settings.secure),
      auth: settings.username ? {
        user: settings.username,
        pass: settings.password_encrypted ? openSecret(settings.password_encrypted, 'Das gespeicherte SMTP-Passwort') : ''
      } : undefined
    });
  }

  // The mail server of the installation carries the mails that open an account. Whoever runs the
  // mail server of an organization could read those, so they never go that way. Without a server
  // of the installation they stay unsent, and the caller says what to do instead.
  systemMailReady() {
    return Boolean(env.systemSmtpHost && env.systemMailFrom);
  }

  async sendSystemMail(message) {
    if (!this.systemMailReady()) return { skipped: true, reason: 'system_smtp_missing' };
    const transporter = this.mailer.createTransport({
      host: env.systemSmtpHost,
      port: env.systemSmtpPort,
      secure: env.systemSmtpSecure === 'true',
      auth: env.systemSmtpUser ? { user: env.systemSmtpUser, pass: env.systemSmtpPassword } : undefined
    });
    try {
      return await transporter.sendMail({ from: env.systemMailFrom, ...message });
    } catch (error) {
      throw smtpFailure(error);
    }
  }

  async sendMail(organizationId, message) {
    const result = await this.db.query('SELECT * FROM smtp_settings WHERE organization_id = $1 AND enabled = true', [organizationId]);
    const settings = result.rows[0];
    if (!settings) return { skipped: true, reason: 'smtp_disabled' };
    const transporter = this.createTransport(settings);
    try {
      return await transporter.sendMail({
        from: settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email,
        replyTo: settings.reply_to || undefined,
        ...message
      });
    } catch (error) {
      throw smtpFailure(error);
    }
  }

  async sendLowRatingAlert(organizationId, payload) {
    const result = await this.db.query(
      'SELECT * FROM smtp_settings WHERE organization_id = $1 AND enabled = true AND low_rating_alerts_enabled = true',
      [organizationId]
    );
    const settings = result.rows[0];
    if (!settings?.notification_email) return { skipped: true, reason: 'low_rating_alerts_disabled' };
    return this.sendMail(organizationId, {
      to: settings.notification_email,
      subject: `qrating: niedrige Bewertung für ${payload.eventName}`,
      text: [
        `Event: ${payload.eventName}`,
        `Bewertung: ${payload.rating} Sterne`,
        `Zeitpunkt: ${payload.submittedAt}`,
        '',
        'Öffne das qrating Dashboard, um die Rückmeldung einzuordnen.'
      ].join('\n')
    });
  }

  async testSettings(organizationId, to) {
    const settingsResult = await this.db.query('SELECT * FROM smtp_settings WHERE organization_id = $1', [organizationId]);
    const settings = settingsResult.rows[0];
    if (!settings) throw httpError(400, 'Es sind noch keine SMTP-Einstellungen gespeichert. Trage den Mailserver ein und speichere, bevor du eine Testmail sendest.');
    const recipient = to || settings.notification_email || settings.from_email;
    if (!recipient) throw httpError(400, 'Für die Testmail fehlt eine Empfängeradresse. Trage eine Absender-E-Mail oder eine Admin-Benachrichtigung ein.');
    try {
      const transporter = this.createTransport(settings);
      await transporter.verify();
      await transporter.sendMail({
        from: settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email,
        to: recipient,
        subject: 'qrating SMTP-Test',
        text: 'Diese Nachricht bestätigt, dass qrating den konfigurierten SMTP-Server verwenden kann.'
      });
      await this.db.query(
        `UPDATE smtp_settings
         SET last_test_status = 'ok', last_test_error = null, last_test_at = now(), updated_at = now()
         WHERE organization_id = $1`,
        [organizationId]
      );
      return { ok: true, to: recipient };
    } catch (error) {
      const failure = smtpFailure(error);
      await this.db.query(
        `UPDATE smtp_settings
         SET last_test_status = 'error', last_test_error = $2, last_test_at = now(), updated_at = now()
         WHERE organization_id = $1`,
        [organizationId, failure.message]
      );
      throw failure;
    }
  }
}

export { publicSettings };
