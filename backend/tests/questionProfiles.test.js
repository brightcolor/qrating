import { describe, expect, it } from 'vitest';
import { getQuestionProfile, questionProfiles, toProfileQuestionRows } from '../src/services/questionProfiles.js';

describe('question profiles', () => {
  it('provides usable built-in profiles with editable questions', () => {
    expect(questionProfiles.length).toBeGreaterThanOrEqual(5);
    const profile = getQuestionProfile('quick-vibe');
    expect(profile.name).toBe('Quick vibe check');
    expect(profile.questions.length).toBeGreaterThan(0);
  });

  it('normalizes profile questions for database insertion', () => {
    const rows = toProfileQuestionRows([
      { internalName: 'mood', label: 'Mood', questionType: 'rating', sortOrder: 5 },
      { label: 'Fallback', questionType: 'unknown', options: 'bad' }
    ]);

    expect(rows[0]).toMatchObject({
      questionType: 'rating',
      internalName: 'mood',
      label: 'Mood',
      sortOrder: 5,
      active: true,
      showInExport: true,
      anonymousAnswer: true
    });
    expect(rows[1]).toMatchObject({
      questionType: 'text_long',
      internalName: 'question_2',
      options: null
    });
  });
});
