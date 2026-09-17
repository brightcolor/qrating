import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeWait, errorHandler, httpError } from '../src/middleware/errors.js';
import { openSecret, serviceRejected, serviceUnreachable, smtpFailure } from '../src/utils/serviceErrors.js';
import { PretixService } from '../src/services/pretixService.js';
import { NotificationService } from '../src/services/notificationService.js';
import { WebhookService } from '../src/services/webhookService.js';
import { SmtpService } from '../src/services/smtpService.js';

function fakeResponse() {
  const res = {
    headersSent: false,
    statusCode: 200,
    body: null,
    contentType: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    type(value) { this.contentType = value; return this; },
    send(payload) { this.body = payload; return this; }
  };
  return res;
}

function fakeRequest({ method = 'POST', accepts = 'json' } = {}) {
  return { method, path: '/admin/test', accepts: () => accepts };
}

function handle(error, request = fakeRequest()) {
  const res = fakeResponse();
  errorHandler(error, request, res, () => {});
  return res;
}

describe('error responses', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers unexpected failures with a readable message and a reference from the log', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = handle(new Error('relation "secret_table" does not exist'));

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain('Auf dem Server ist ein unerwarteter Fehler aufgetreten.');
    expect(res.body.error).toContain(`Fehlerkennung ${res.body.reference}`);
    expect(res.body.error).not.toContain('secret_table');
    expect(log.mock.calls[0][0]).toContain(res.body.reference);
  });

  it('keeps messages that were written for people', () => {
    const res = handle(httpError(404, 'Dieses Event gibt es nicht mehr.'));
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Dieses Event gibt es nicht mehr.' });
  });

  it('explains unreadable and oversized request bodies', () => {
    expect(handle(Object.assign(new Error('Unexpected token'), { type: 'entity.parse.failed', status: 400 })).body.error)
      .toBe('Die gesendeten Daten ließen sich nicht lesen. Lade die Seite neu und versuche es erneut.');
    const tooLarge = handle(Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 }));
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.body.error).toContain('höchstens 1 MB');
  });

  it('turns database conflicts into advice', () => {
    const res = handle(Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), { code: '23505' }));
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('schon vergeben');
    expect(res.body.error).not.toContain('users_email_key');
  });

  it('shows a page when a browser opens a link directly', () => {
    const res = handle(httpError(403, 'Für <b>dieses</b> Event fehlt die Berechtigung.'), fakeRequest({ method: 'GET', accepts: 'html' }));
    expect(res.statusCode).toBe(403);
    expect(res.contentType).toBe('html');
    expect(res.body).toContain('Das hat nicht geklappt');
    expect(res.body).toContain('Für &lt;b&gt;dieses&lt;/b&gt; Event fehlt die Berechtigung.');
  });

  it('names waiting times for rate limits', () => {
    expect(describeWait(60_000)).toBe('eine Minute');
    expect(describeWait(15 * 60_000)).toBe('15 Minuten');
    expect(describeWait(60 * 60_000)).toBe('eine Stunde');
    expect(describeWait(2 * 60 * 60_000)).toBe('2 Stunden');
  });
});

describe('errors of connected services', () => {
  it('explains network failures', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND tickets.invalid'), { code: 'ENOTFOUND' });
    const error = serviceUnreachable('Pretix', Object.assign(new TypeError('fetch failed'), { cause }));
    expect(error.status).toBe(502);
    expect(error.publicMessage).toBe('Pretix ist nicht erreichbar: der Servername wurde nicht gefunden. Prüfe die Adresse.');
    expect(serviceUnreachable('Discord', new TypeError('Failed to parse URL from nonsense')).status).toBe(400);
  });

  it('explains rejected requests with the status code', () => {
    expect(serviceRejected('Slack', 401).publicMessage)
      .toBe('Slack hat die Anmeldung abgelehnt (HTTP 401). Prüfe Token oder Zugangsdaten.');
    expect(serviceRejected('Der Webhook-Empfänger', 503).publicMessage)
      .toBe('Der Webhook-Empfänger meldet einen eigenen Fehler (HTTP 503). Bitte versuche es später erneut.');
  });

  it('explains mail server failures and keeps the server answer', () => {
    expect(smtpFailure(Object.assign(new Error('Invalid login'), { code: 'EAUTH' })).publicMessage)
      .toContain('Prüfe Benutzername und Passwort');
    const rejected = smtpFailure(Object.assign(new Error('Message failed'), {
      code: 'EMESSAGE',
      responseCode: 550,
      response: '550 5.7.1 Relaying denied'
    }));
    expect(rejected.publicMessage).toBe('Der Mailserver hat die Nachricht abgelehnt. Antwort des Mailservers: 550 5.7.1 Relaying denied');
  });

  it('asks to enter secrets again when they cannot be decrypted', () => {
    expect(() => openSecret('kaputt.kaputt.kaputt', 'Der gespeicherte Pretix-API-Token'))
      .toThrow('Der gespeicherte Pretix-API-Token lässt sich nicht entschlüsseln, vermutlich wurde PRETIX_TOKEN_SECRET geändert.');
  });

  it('reports Pretix connection problems in words', async () => {
    const connection = { api_token: 'token', base_url: 'https://tickets.example.test', pretix_organizer_slug: 'demo' };
    const offline = new PretixService({ query: vi.fn() }, vi.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    ));
    await expect(offline.testConnection(connection)).rejects.toThrow('Pretix ist nicht erreichbar: der Server hat die Verbindung abgelehnt.');

    const wrongToken = new PretixService({ query: vi.fn() }, vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(wrongToken.testConnection(connection)).rejects.toThrow('Pretix hat den API-Token abgelehnt (HTTP 401). Trage in der Verbindung einen gültigen Token ein.');
  });

  it('refuses channels that are missing settings or a mail server', async () => {
    const skippedMail = { sendMail: vi.fn().mockResolvedValue({ skipped: true, reason: 'smtp_disabled' }) };
    const service = new NotificationService({ query: vi.fn() }, { smtpService: skippedMail, fetchImpl: vi.fn() });
    const payload = { title: 'Test', text: 'Test' };

    await expect(service.sendChannel({ channel_type: 'email', config: {}, user_email: 'person@example.com' }, payload))
      .rejects.toThrow('Der E-Mail-Versand ist nicht eingerichtet oder ausgeschaltet.');
    await expect(service.sendChannel({ channel_type: 'telegram', config: {} }, payload))
      .rejects.toThrow('Für Telegram fehlt der Bot-Token.');
    await expect(service.sendWebhook('discord', '', payload))
      .rejects.toThrow('Für diesen Kanal ist keine Webhook-URL hinterlegt.');
  });

  it('stores a readable reason when a webhook endpoint fails', async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'hook-1', url: 'https://hooks.example.test/in', secret: null }] })
        .mockResolvedValue({ rows: [] })
    };
    const service = new WebhookService(db, vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await service.dispatch('org-1', 'feedback.created', {});

    const update = db.query.mock.calls.find(([sql]) => sql.includes('last_error = $2'));
    expect(update[1][1]).toBe('Der Webhook-Empfänger kennt die aufgerufene Adresse nicht (HTTP 404). Prüfe die URL.');
  });

  it('records a readable reason when the SMTP test fails', async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1', host: 'smtp.example.test', port: 465, from_email: 'team@example.test' }] })
        .mockResolvedValue({ rows: [] })
    };
    const mailer = {
      createTransport: () => ({
        verify: vi.fn().mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND smtp.example.test'), { code: 'EDNS' })),
        sendMail: vi.fn()
      })
    };
    const service = new SmtpService(db, mailer);

    await expect(service.testSettings('org-1')).rejects.toThrow('Der Mailserver wurde nicht gefunden.');
    const update = db.query.mock.calls.find(([sql]) => sql.includes('last_test_error = $2'));
    expect(update[1][1]).toBe('Der Mailserver wurde nicht gefunden. Prüfe den Servernamen in den SMTP-Einstellungen.');
  });
});
