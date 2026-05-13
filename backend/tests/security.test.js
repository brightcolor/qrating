import { describe, expect, it } from 'vitest';
import { emailDomain, emailHash, publicEventStatus, publicOrganization } from '../src/utils/security.js';
import { encryptSecret } from '../src/utils/crypto.js';
import { WebhookService } from '../src/services/webhookService.js';

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
