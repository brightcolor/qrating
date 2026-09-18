import { describe, expect, it, vi } from 'vitest';
import { encodeHeaderText, NotificationService, publicChannel } from '../src/services/notificationService.js';
import { encryptSecret } from '../src/utils/crypto.js';

describe('NotificationService', () => {
  it('does not expose encrypted channel secrets', () => {
    const publicData = publicChannel({ id: 'c1', label: 'Discord', secret: 'legacy', secret_encrypted: 'encrypted' });
    expect(publicData.secret).toBeUndefined();
    expect(publicData.secret_encrypted).toBeUndefined();
    expect(publicData.has_secret).toBe(true);
  });

  it('sends discord webhooks with low-rating content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const service = new NotificationService({ query: vi.fn() }, { fetchImpl });
    await service.sendWebhook('discord', 'https://discord.example/webhook', {
      title: 'Low rating',
      text: '2 Sterne',
      event: { name: 'Demo' },
      feedback: { rating: 2 }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://discord.example/webhook',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Low rating')
      })
    );
  });

  it('dispatches only to assigned channels returned by the query', async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'channel-1',
            organization_id: 'org-1',
            channel_type: 'email',
            config: { to: 'person@example.com' },
            user_email: 'fallback@example.com'
          }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 'delivery-1' }] })
        .mockResolvedValue({ rows: [] })
    };
    const smtpService = { sendMail: vi.fn().mockResolvedValue({ accepted: ['person@example.com'] }) };
    const service = new NotificationService(db, { smtpService });
    const result = await service.dispatchLowRating(
      { id: 'event-1', organization_id: 'org-1', name: 'Demo' },
      {
        id: 'feedback-1',
        rating: 1,
        submitted_at: '2026-01-01T12:00:00Z',
        low_rating_case: {
          contact_phone_encrypted: encryptSecret('+491234'),
          contact_note_encrypted: encryptSecret('Bitte anrufen')
        }
      }
    );
    expect(result[0].ok).toBe(true);
    const mail = smtpService.sendMail.mock.calls[0][1];
    // Die Mail geht an ein bekanntes Postfach und trägt alles.
    expect(mail.to).toBe('person@example.com');
    expect(mail.subject).toBe('qrating: 1 Stern für Demo');
    expect(mail.text).toContain('+491234');
    expect(mail.text).toContain('Bitte anrufen');
    expect(mail.text).toContain('1 Stern');
  });

  it('keeps the guest out of a push, which lands on a lock screen', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'channel-2',
            organization_id: 'org-1',
            channel_type: 'ntfy',
            config: { topicUrl: 'https://ntfy.example/topic' }
          }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 'delivery-2' }] })
        .mockResolvedValue({ rows: [] })
    };
    const service = new NotificationService(db, { fetchImpl });
    await service.dispatchLowRating(
      { id: 'event-1', organization_id: 'org-1', name: 'Demo' },
      {
        id: 'feedback-1',
        rating: 2,
        submitted_at: '2026-01-01T12:00:00Z',
        low_rating_case: {
          contact_phone_encrypted: encryptSecret('+491234'),
          contact_note: 'Bitte anrufen'
        }
      }
    );

    const body = fetchImpl.mock.calls[0][1].body;
    expect(body).not.toContain('+491234');
    expect(body).not.toContain('Bitte anrufen');
    expect(body).toContain('Low-Rating-Dashboard');
  });

  it('counts more than one in the plural', async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{ id: 'channel-1', organization_id: 'org-1', channel_type: 'email', config: { to: 'person@example.com' } }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 'delivery-1' }] })
        .mockResolvedValue({ rows: [] })
    };
    const smtpService = { sendMail: vi.fn().mockResolvedValue({ accepted: ['person@example.com'] }) };
    const service = new NotificationService(db, { smtpService });
    await service.dispatchLowRating(
      { id: 'event-1', organization_id: 'org-1', name: 'Demo' },
      { id: 'feedback-2', rating: 2, submitted_at: '2026-01-01T12:00:00Z' }
    );

    expect(smtpService.sendMail.mock.calls[0][1].subject).toBe('qrating: 2 Sterne für Demo');
  });

  it('sends ntfy titles with umlauts as encoded words', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const service = new NotificationService({ query: vi.fn() }, { fetchImpl });
    const title = 'qrating: 1 Sterne für Sommerfest Lübeck – Open Air am Hafen mit Feuerwerk 🎆';
    await service.sendChannel(
      { channel_type: 'ntfy', config: { topicUrl: 'https://ntfy.example/qrating' } },
      { title, text: 'Bitte prüfen.' }
    );

    const { title: header } = fetchImpl.mock.calls[0][1].headers;
    const words = header.split(' ');
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    expect(() => new Headers({ title: header })).not.toThrow();
    expect(words.length).toBeGreaterThan(1);
    expect(words.every((word) => word.length <= 75)).toBe(true);
    const decoded = Buffer.concat(words.map((word) => Buffer.from(word.match(/^=\?UTF-8\?B\?(.*)\?=$/)[1], 'base64')));
    expect(decoded.toString('utf8')).toBe(title);
  });

  it('keeps plain ASCII ntfy titles readable', () => {
    expect(encodeHeaderText('qrating: 2 Sterne')).toBe('qrating: 2 Sterne');
  });
});
