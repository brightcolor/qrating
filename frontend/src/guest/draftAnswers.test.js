import { describe, expect, it } from 'vitest';
import { draftAnswers, draftHasContent, emptyAnswers, progressPayload } from './flow.js';

const questions = [
  { internal_name: 'musik', label: 'Wie war die Musik?' },
  { internal_name: 'getraenke', label: 'Und die Getränke?' }
];

const steps = [
  { id: 'rating', kind: 'rating' },
  { id: 'question:musik', kind: 'question', question: questions[0] }
];

describe('what a guest has said so far', () => {
  it('carries the stars, the answers and the free text', () => {
    const draft = draftAnswers({
      ...emptyAnswers(),
      rating: 4,
      answers: { musik: 'laut', getraenke: ['Bier', 'Wasser'] },
      commentPositive: '  Die Band  '
    }, questions);

    expect(draft).toMatchObject({
      rating: 4,
      answers: { musik: 'laut', getraenke: ['Bier', 'Wasser'] },
      commentPositive: 'Die Band',
      commentImprovement: '',
      newsletter: null
    });
  });

  it('leaves the contact details where they are', () => {
    const draft = draftAnswers({
      ...emptyAnswers(),
      rating: 2,
      contactPhone: '0151 1234567',
      contactNote: 'Bitte ruft mich an',
      newsletter: true,
      newsletterEmail: 'gast@example.com'
    }, questions);

    // Who never pressed send has not handed over a number or an address.
    const text = JSON.stringify(draft);
    expect(text).not.toContain('0151');
    expect(text).not.toContain('gast@example.com');
    expect(text).not.toContain('Bitte ruft mich an');
    // That the newsletter was said yes to is the answer itself, and it stays.
    expect(draft.newsletter).toBe(true);
  });

  it('keeps an answer that only the form knows the name of', () => {
    const draft = draftAnswers({ ...emptyAnswers(), answers: { musik: 'laut', fremd: 'x' } }, questions);

    expect(draft.answers).toEqual({ musik: 'laut' });
  });

  it('tells an empty visit from one that gave something', () => {
    expect(draftHasContent(draftAnswers(emptyAnswers(), questions))).toBe(false);
    expect(draftHasContent(draftAnswers({ ...emptyAnswers(), rating: 1 }, questions))).toBe(true);
    expect(draftHasContent(draftAnswers({ ...emptyAnswers(), commentImprovement: 'zu voll' }, questions))).toBe(true);
    expect(draftHasContent(draftAnswers({ ...emptyAnswers(), newsletter: false }, questions))).toBe(true);
    expect(draftHasContent(null)).toBe(false);
  });
});

describe('the report after a step', () => {
  it('stays as small as before while nothing was answered', () => {
    const payload = progressPayload({
      steps, index: 0, sessionKey: 'k', sourceType: 'dynamic', state: emptyAnswers(), questions
    });

    expect(payload.draft).toBeUndefined();
    expect(payload).toMatchObject({ sessionKey: 'k', step: 'rating', stepIndex: 0, stepsTotal: 2 });
  });

  it('takes the answers along once there are some', () => {
    const payload = progressPayload({
      steps, index: 1, sessionKey: 'k', sourceType: 'dynamic',
      state: { ...emptyAnswers(), rating: 5, answers: { musik: 'gut' } }, questions
    });

    expect(payload.draft).toMatchObject({ rating: 5, answers: { musik: 'gut' } });
  });

  it('sends no answers when nobody passed a state, as the funnel alone needs none', () => {
    const payload = progressPayload({ steps, index: 0, sessionKey: 'k' });

    expect(payload.draft).toBeUndefined();
  });
});
