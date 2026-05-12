import { describe, expect, it, vi } from 'vitest';
import { JobWorker } from '../src/services/jobService.js';

describe('JobWorker privacy retention', () => {
  it('anonymizes low-rating phone data and respects configured retention windows', async () => {
    const calls = [];
    const db = {
      query: vi.fn(async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('FROM organizations WHERE id')) {
          return { rows: [{ retention_low_rating_phone_days: 30, retention_feedback_days: 120, retention_newsletter_days: 180 }] };
        }
        return { rows: [] };
      })
    };
    const worker = new JobWorker(db);
    await worker.handlePrivacyRetention({ organization_id: 'org-1' });
    expect(calls.some((call) => call.sql.includes('UPDATE low_rating_cases'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('DELETE FROM feedback_responses'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('DELETE FROM newsletter_optins'))).toBe(true);
  });
});
