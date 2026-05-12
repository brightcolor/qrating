import { describe, expect, it, vi } from 'vitest';
import { loadResolvedTexts } from '../src/services/textService.js';

describe('TextService multilingual fallback', () => {
  it('uses English system texts and overlays organization overrides', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ key: 'submit', value: 'Send it', event_id: null, language: 'en' }]
      })
    };
    const texts = await loadResolvedTexts(db, 'org-1', 'event-1', 'en', { name: 'Demo Night' });
    expect(texts.headline).toBe('How was your night at Demo Night?');
    expect(texts.submit).toBe('Send it');
  });
});
