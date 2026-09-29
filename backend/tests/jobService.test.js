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

  it('runs every deletion for itself, so one that fails leaves the others their turn', async () => {
    const calls = [];
    const db = {
      query: vi.fn(async (sql) => {
        calls.push(sql);
        if (sql.includes('FROM organizations WHERE id')) {
          return { rows: [{ retention_low_rating_phone_days: 30, retention_feedback_days: 120, retention_newsletter_days: 180 }] };
        }
        if (sql.includes('UPDATE low_rating_cases')) throw new Error('Die Tabelle der Rückrufe war gesperrt.');
        return { rows: [] };
      })
    };

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // The job result says in plain words what did not happen; the database text goes to the log.
      await expect(new JobWorker(db).handlePrivacyRetention({ organization_id: 'org-1' }))
        .rejects.toThrow('Der Löschlauf ist nur teilweise gelaufen. Die Rückrufnummern ließen sich nicht löschen; der nächste Lauf versucht es erneut.');
      expect(logged.mock.calls.flat().join(' ')).toContain('Die Tabelle der Rückrufe war gesperrt.');
    } finally {
      logged.mockRestore();
    }
    expect(calls.some((sql) => sql.includes('DELETE FROM feedback_responses'))).toBe(true);
    expect(calls.some((sql) => sql.includes('DELETE FROM newsletter_optins'))).toBe(true);
  });
});

describe('JobWorker report mail', () => {
  it('sends no report on an event of another organization than the one that asked', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        // The event exists, but in organization B; the job was asked for by organization A.
        if (sql.includes('FROM events WHERE id = $1 AND organization_id = $2')) {
          return { rows: params[1] === 'org-b' ? [{ id: params[0], organization_id: 'org-b', name: 'Fremdes Event' }] : [] };
        }
        if (sql.includes('FROM users WHERE id')) return { rows: [{ id: 'user-a', email: 'a@example.test' }] };
        return { rows: [] };
      })
    };

    await expect(new JobWorker(db).handleReportEmail({ organization_id: 'org-a', payload: { eventId: 'event-b', userId: 'user-a' } }))
      .rejects.toThrow('Der Report entfällt');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM feedback_responses'))).toBe(false);
  });
});
