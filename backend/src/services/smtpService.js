import nodemailer from 'nodemailer';
import { decryptSecret } from '../utils/crypto.js';

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
        pass: settings.password_encrypted ? decryptSecret(settings.password_encrypted) : ''
      } : undefined
    });
  }

  async sendMail(organizationId, message) {
    const result = await this.db.query('SELECT * FROM smtp_settings WHERE organization_id = $1 AND enabled = true', [organizationId]);
    const settings = result.rows[0];
    if (!settings) return { skipped: true, reason: 'smtp_disabled' };
    const transporter = this.createTransport(settings);
    return transporter.sendMail({
      from: settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email,
      replyTo: settings.reply_to || undefined,
      ...message
    });
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
      subject: `qrating: niedrige Bewertung fuer ${payload.eventName}`,
      text: [
        `Event: ${payload.eventName}`,
        `Bewertung: ${payload.rating} Sterne`,
        `Zeitpunkt: ${payload.submittedAt}`,
        '',
        'Oeffne das qrating Dashboard, um die Rueckmeldung einzuordnen.'
      ].join('\n')
    });
  }

  async testSettings(organizationId, to) {
    const settingsResult = await this.db.query('SELECT * FROM smtp_settings WHERE organization_id = $1', [organizationId]);
    const settings = settingsResult.rows[0];
    if (!settings) throw new Error('Keine SMTP-Einstellungen gespeichert.');
    const transporter = this.createTransport(settings);
    const recipient = to || settings.notification_email || settings.from_email;
    try {
      await transporter.verify();
      await transporter.sendMail({
        from: settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email,
        to: recipient,
        subject: 'qrating SMTP-Test',
        text: 'Diese Nachricht bestaetigt, dass qrating den konfigurierten SMTP-Server verwenden kann.'
      });
      await this.db.query(
        `UPDATE smtp_settings
         SET last_test_status = 'ok', last_test_error = null, last_test_at = now(), updated_at = now()
         WHERE organization_id = $1`,
        [organizationId]
      );
      return { ok: true, to: recipient };
    } catch (error) {
      await this.db.query(
        `UPDATE smtp_settings
         SET last_test_status = 'error', last_test_error = $2, last_test_at = now(), updated_at = now()
         WHERE organization_id = $1`,
        [organizationId, error.message]
      );
      throw error;
    }
  }
}

export { publicSettings };
