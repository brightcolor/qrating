import { beforeEach, describe, expect, it } from 'vitest';
import {
  answerText,
  buildPayload,
  buildSteps,
  clearDraft,
  emptyAnswers,
  fillText,
  firstProblem,
  isAnswered,
  loadDraft,
  nextStepId,
  questionType,
  saveDraft,
  stepProblem
} from './flow.js';

const texts = {
  yes_label: 'Ja',
  no_label: 'Nein',
  nps_value: '{wert} von 10',
  stars_value: '{wert} von 5 Sternen'
};

function question(overrides) {
  return {
    id: overrides.internal_name,
    question_type: 'text_long',
    required: false,
    options: null,
    ...overrides
  };
}

const tagForm = [
  question({ internal_name: 'positive_tags', question_type: 'checkboxes', options: ['Musik', 'Licht'] }),
  question({ internal_name: 'improvement_tags', question_type: 'checkboxes', options: ['Einlass'] })
];

describe('guest flow', () => {
  it('asks one question per step and ends with the summary', () => {
    const steps = buildSteps(tagForm, 4);
    expect(steps.map((step) => step.id)).toEqual([
      'rating',
      'question:positive_tags',
      'question:improvement_tags',
      'newsletter',
      'summary'
    ]);
    expect(steps[1].detailField).toBe('commentPositive');
    expect(steps[2].detailField).toBe('commentImprovement');
  });

  it('offers the callback step for one and two stars', () => {
    expect(buildSteps(tagForm, 2).map((step) => step.id)).toContain('contact');
    expect(buildSteps(tagForm, 3).map((step) => step.id)).not.toContain('contact');
  });

  it('adds open questions only to forms without one', () => {
    const ratingsOnly = [question({ internal_name: 'music', question_type: 'rating' })];
    expect(buildSteps(ratingsOnly, 5).map((step) => step.id))
      .toEqual(['rating', 'question:music', 'comment:positive', 'comment:improvement', 'newsletter', 'summary']);

    const ownQuestion = [question({ internal_name: 'moment', question_type: 'text_long' })];
    expect(buildSteps(ownQuestion, 5).map((step) => step.id))
      .toEqual(['rating', 'question:moment', 'newsletter', 'summary']);
  });

  it('treats unknown question types as a long answer', () => {
    expect(questionType(question({ internal_name: 'x', question_type: 'slider' }))).toBe('text_long');
  });

  it('names the reason a step cannot be left', () => {
    const state = { ...emptyAnswers() };
    const [ratingStep] = buildSteps(tagForm, 0);
    expect(stepProblem(ratingStep, state)).toBe('required_hint');
    expect(stepProblem(ratingStep, { ...state, rating: 3 })).toBeNull();

    const steps = buildSteps(tagForm, 1);
    const contactStep = steps.find((step) => step.kind === 'contact');
    expect(stepProblem(contactStep, { ...state, contactPhone: 'ruf mich an' })).toBe('phone_invalid');
    expect(stepProblem(contactStep, { ...state, contactPhone: '+49 170 1234567' })).toBeNull();

    const newsletterStep = steps.find((step) => step.kind === 'newsletter');
    expect(stepProblem(newsletterStep, { ...state, newsletter: true, newsletterEmail: 'keine adresse' })).toBe('email_invalid');
    expect(stepProblem(newsletterStep, { ...state, newsletter: true, newsletterEmail: 'gast@example.de' })).toBeNull();
    expect(stepProblem(newsletterStep, { ...state, newsletter: false })).toBeNull();
  });

  it('keeps required questions from being skipped', () => {
    const steps = buildSteps([question({ internal_name: 'feeling', question_type: 'multiple_choice', options: ['Gut'], required: true })], 5);
    const state = { ...emptyAnswers(), rating: 5 };
    expect(firstProblem(steps, state)).toMatchObject({ problem: 'required_hint' });
    expect(firstProblem(steps, { ...state, answers: { feeling: 'Gut' } })).toBeNull();
  });

  it('counts a tag question as answered once a sentence is written', () => {
    const [, tagStep] = buildSteps(tagForm, 4);
    const state = { ...emptyAnswers(), rating: 4 };
    expect(isAnswered(tagStep, state)).toBe(false);
    expect(isAnswered(tagStep, { ...state, commentPositive: 'Die Band war stark.' })).toBe(true);
  });

  it('leads changes made in the summary back to it', () => {
    const steps = buildSteps(tagForm, 4);
    expect(nextStepId(steps, 'rating', { editing: false, rating: 4 })).toBe('question:positive_tags');
    expect(nextStepId(steps, 'question:positive_tags', { editing: true, rating: 4 })).toBe('summary');
    // A rating that drops to two stars offers the callback before the summary.
    expect(nextStepId(buildSteps(tagForm, 2), 'rating', { editing: true, rating: 2 })).toBe('contact');
  });

  it('writes answers, the NPS score and the comment fields into the payload', () => {
    const questions = [
      ...tagForm,
      question({ internal_name: 'recommendation_nps', question_type: 'nps' }),
      question({ internal_name: 'moment', question_type: 'text_long' })
    ];
    const payload = buildPayload({
      ...emptyAnswers(),
      rating: 2,
      answers: { positive_tags: ['Musik'], improvement_tags: [], recommendation_nps: 9, moment: '  Die Zugabe  ' },
      commentPositive: ' Starke Band ',
      contactPhone: ' +49 170 1234567 ',
      contactNote: 'Bitte anrufen',
      newsletter: true,
      newsletterEmail: ' gast@example.de '
    }, { questions, sourceType: 'bar', startedAt: '2026-09-17T18:00:00.000Z', language: 'en' });

    expect(payload).toMatchObject({
      // The language travels along, so the stored consent is the text the guest read.
      language: 'en',
      rating: 2,
      npsScore: 9,
      commentPositive: 'Starke Band',
      commentImprovement: '',
      newsletterOptin: true,
      newsletterEmail: 'gast@example.de',
      contactRequested: true,
      contactPhone: '+49 170 1234567',
      contactNote: 'Bitte anrufen',
      sourceType: 'bar'
    });
    expect(payload.answers).toEqual({ positive_tags: ['Musik'], recommendation_nps: 9, moment: '  Die Zugabe  ' });
  });

  it('sends contact details only with one or two stars', () => {
    const payload = buildPayload({
      ...emptyAnswers(),
      rating: 5,
      contactPhone: '+49 170 1234567',
      contactNote: 'Bitte anrufen',
      newsletter: false,
      newsletterEmail: 'gast@example.de'
    }, { questions: [], sourceType: 'event' });

    expect(payload).toMatchObject({ contactPhone: '', contactNote: '', contactRequested: false, newsletterEmail: '' });
  });

  it('writes answers in the words guests picked', () => {
    expect(answerText(question({ internal_name: 'a', question_type: 'checkboxes' }), ['Musik', 'Licht'], texts)).toBe('Musik, Licht');
    expect(answerText(question({ internal_name: 'b', question_type: 'yes_no' }), 'Ja', texts)).toBe('Ja');
    expect(answerText(question({ internal_name: 'c', question_type: 'nps' }), 9, texts)).toBe('9 von 10');
    expect(answerText(question({ internal_name: 'd', question_type: 'rating' }), 4, texts)).toBe('4 von 5 Sternen');
    expect(answerText(question({ internal_name: 'e' }), '', texts)).toBe('');
  });

  it('keeps unknown placeholders as they are', () => {
    expect(fillText('Frage {nummer} von {gesamt}', { nummer: 2, gesamt: 6 })).toBe('Frage 2 von 6');
    expect(fillText('Start am {datum}', {})).toBe('Start am {datum}');
  });
});

describe('draft storage', () => {
  beforeEach(() => {
    globalThis.sessionStorage = {
      store: new Map(),
      getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
      setItem(key, value) { this.store.set(key, String(value)); },
      removeItem(key) { this.store.delete(key); }
    };
  });

  it('brings answers back after a reload', () => {
    const state = { ...emptyAnswers(), rating: 4, answers: { positive_tags: ['Musik'] }, commentPositive: 'Stark' };
    saveDraft('token-1', { state, stepId: 'question:positive_tags', startedAt: '2026-09-17T18:00:00.000Z' });

    const draft = loadDraft('token-1');
    expect(draft.stepId).toBe('question:positive_tags');
    expect(draft.state).toMatchObject({ rating: 4, commentPositive: 'Stark', answers: { positive_tags: ['Musik'] } });
  });

  it('keeps phone numbers and email addresses out of storage', () => {
    saveDraft('token-2', {
      state: { ...emptyAnswers(), rating: 1, contactPhone: '+49 170 1234567', contactNote: 'Bitte anrufen', newsletterEmail: 'gast@example.de' },
      stepId: 'contact',
      startedAt: '2026-09-17T18:00:00.000Z'
    });

    expect(globalThis.sessionStorage.getItem('qrating:feedback:token-2')).not.toContain('1234567');
    expect(globalThis.sessionStorage.getItem('qrating:feedback:token-2')).not.toContain('gast@example.de');
    expect(loadDraft('token-2').state).toMatchObject({ contactPhone: '', contactNote: '', newsletterEmail: '' });
  });

  it('forgets drafts of earlier guests', () => {
    const start = Date.parse('2026-09-17T18:00:00.000Z');
    saveDraft('token-3', { state: { ...emptyAnswers(), rating: 5 }, stepId: 'rating', startedAt: null }, start);

    expect(loadDraft('token-3', start + 60_000)).not.toBeNull();
    expect(loadDraft('token-3', start + 3 * 60 * 60 * 1000)).toBeNull();

    clearDraft('token-3');
    expect(loadDraft('token-3', start)).toBeNull();
  });
});
