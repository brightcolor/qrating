import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { emailDomain, emailHash, publicEventStatus, publicOrganization } from '../src/utils/security.js';
import { decryptSecret, encryptSecret } from '../src/utils/crypto.js';
import { WebhookService } from '../src/services/webhookService.js';
import { env } from '../src/config/env.js';

describe('stored secrets', () => {
  const withTag = (payload, tag) => {
    const [iv, , encrypted] = payload.split('.');
    return `${iv}.${tag.toString('base64')}.${encrypted}`;
  };

  it('read back what was stored', () => {
    expect(decryptSecret(encryptSecret('Zugang für Pretix'))).toBe('Zugang für Pretix');
  });

  it('refuse a shortened authentication tag', () => {
    const payload = encryptSecret('Zugang für Pretix');
    const tag = Buffer.from(payload.split('.')[1], 'base64');

    expect(tag).toHaveLength(16);
    for (const length of [4, 8, 12]) {
      expect(() => decryptSecret(withTag(payload, tag.subarray(0, length))), `${length} Byte`).toThrow();
    }
  });

  it('keep reading values stored before the tag length was named', () => {
    const key = crypto.createHash('sha256').update(env.pretixTokenSecret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update('alter Wert', 'utf8'), cipher.final()]);
    const stored = `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;

    expect(decryptSecret(stored)).toBe('alter Wert');
  });
});

describe('security helpers', () => {
  it('sanitizes public event status payloads', () => {
    const event = publicEventStatus({
      id: 'event-1',
      name: 'Launch Night',
      event_feedback_token: 'secret-token',
      pretix_event_slug: 'internal-slug',
      raw_source_payload: { private: true },
      raw_settings_payload: { private: true },
      date_from: '2026-05-01T20:00:00Z',
      location: 'Main Hall',
      organization_name: 'qrating',
      organization_slug: 'qrating',
      primary_color: '#111111'
    });

    expect(event).toEqual(expect.objectContaining({
      name: 'Launch Night',
      location: 'Main Hall'
    }));
    expect(event.event_feedback_token).toBeUndefined();
    expect(event.pretix_event_slug).toBeUndefined();
    expect(event.raw_source_payload).toBeUndefined();
    expect(event.organization).toEqual(expect.objectContaining({ slug: 'qrating' }));
  });

  it('sanitizes public organization payloads', () => {
    const organization = publicOrganization({
      id: 'org-1',
      name: 'qrating',
      slug: 'qrating',
      default_feedback_window_days: 90,
      privacy_text: 'Privacy text'
    });

    expect(organization).toEqual(expect.objectContaining({ name: 'qrating', privacyText: 'Privacy text' }));
    expect(organization.id).toBeUndefined();
    expect(organization.default_feedback_window_days).toBeUndefined();
  });

  it('normalizes email hashes and domains without returning the raw email', () => {
    expect(emailHash(' PERSON@Example.COM ')).toBe(emailHash('person@example.com'));
    expect(emailDomain(' PERSON@Example.COM ')).toBe('example.com');
  });

  it('signs webhooks with encrypted secrets', async () => {
    const fetchImpl = async (url, options) => {
      expect(url).toBe('https://example.com/hook');
      expect(options.headers['x-qrating-signature']).toMatch(/^[a-f0-9]{64}$/);
      return { ok: true, status: 204 };
    };
    const db = { query: async () => ({ rows: [] }) };
    const service = new WebhookService(db, fetchImpl);
    await service.callEndpoint({
      id: 'hook-1',
      url: 'https://example.com/hook',
      secret: null,
      secret_encrypted: encryptSecret('shared-secret')
    }, 'feedback.created', { rating: 5 });
  });
});
