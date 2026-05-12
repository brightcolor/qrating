import { describe, expect, it, vi } from 'vitest';
import { SmtpService } from '../src/services/smtpService.js';

describe('SmtpService', () => {
  it('does not expose encrypted passwords in public settings', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'smtp-1', organization_id: 'org-1', host: 'smtp.example.com', password_encrypted: 'secret' }]
      })
    };
    const service = new SmtpService(db);
    const settings = await service.getSettings('org-1');
    expect(settings.password_encrypted).toBeUndefined();
    expect(settings.has_password).toBe(true);
  });

  it('skips low-rating alerts when disabled', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const service = new SmtpService(db);
    await expect(service.sendLowRatingAlert('org-1', { eventName: 'Test', rating: 1 })).resolves.toEqual({
      skipped: true,
      reason: 'low_rating_alerts_disabled'
    });
  });
});
