import { describe, expect, it } from 'vitest';
import { getQuestionProfile, questionProfiles, questionTypes, toProfileQuestionRows } from '../src/services/questionProfiles.js';
import { defaultTextsByLanguage } from '../src/services/textService.js';

// Words that people write with ae/oe/ue although German spells them with umlauts.
const transliterated = /(fuer|ueber|koenn|moecht|moeg|muess|waehl|zurueck|rueck|gruess|schoen|oeffn|pruef|aender|loesch|hoer|fuehl|gemaess|strasse|erklaer|getraenk|naechst|bestaetig|gueltig|klaer|waer|wuerd|haett|duerf|spaet|frueh|gefaell|buehne|guenstig|uebung|kuerz|laeng|staend|atmosphaer|fuell|glueck)/i;

function profileTexts(profile) {
  return [
    profile.name,
    profile.summary,
    profile.badge,
    ...profile.questions.flatMap((item) => [item.label, item.helpText, item.placeholder, ...(item.options || [])])
  ].filter(Boolean);
}

describe('question profiles', () => {
  it('offers German templates for parties, festivals, birthdays and more', () => {
    const names = questionProfiles.map((profile) => profile.name);
    expect(names).toEqual(expect.arrayContaining([
      'Schnellfeedback',
      'Party & Club',
      'Festival',
      'Konzert',
      'Geburtstagsfeier',
      'Hochzeit',
      'Firmen- & Weihnachtsfeier',
      'Stadt- & Vereinsfest',
      'Konferenz & Messe',
      'Workshop & Seminar'
    ]));
    expect(getQuestionProfile('quick-vibe').questions.map((item) => item.internalName))
      .toEqual(['positive_tags', 'improvement_tags', 'favorite_moment']);
  });

  it('keeps every template usable on the guest page', () => {
    const ids = new Set();
    for (const profile of questionProfiles) {
      expect(ids.has(profile.id), profile.id).toBe(false);
      ids.add(profile.id);
      expect(profile.summary, profile.id).toBeTruthy();
      expect(profile.badge, profile.id).toBeTruthy();
      expect(profile.questions.length, profile.id).toBeGreaterThan(0);
      expect(profile.questions.length, profile.id).toBeLessThanOrEqual(6);

      const names = profile.questions.map((item) => item.internalName);
      expect(new Set(names).size, `${profile.id}: internal names repeat`).toBe(names.length);
      const orders = profile.questions.map((item) => item.sortOrder);
      expect(orders, `${profile.id}: sort order`).toEqual([...orders].sort((a, b) => a - b));

      for (const item of profile.questions) {
        expect(questionTypes, `${profile.id}/${item.internalName}`).toContain(item.questionType);
        if (['checkboxes', 'multiple_choice'].includes(item.questionType)) {
          expect(item.options?.length, `${profile.id}/${item.internalName} needs options`).toBeGreaterThan(1);
        }
        if (['positive_tags', 'improvement_tags'].includes(item.internalName)) {
          expect(item.questionType, `${profile.id}/${item.internalName}`).toBe('checkboxes');
        }
      }
    }
  });

  it('writes German texts with umlauts', () => {
    const texts = [
      ...questionProfiles.flatMap(profileTexts),
      ...Object.values(defaultTextsByLanguage.de)
    ];
    const offenders = texts.filter((text) => transliterated.test(text));
    expect(offenders).toEqual([]);
  });

  it('normalizes profile questions for database insertion', () => {
    const rows = toProfileQuestionRows([
      { internalName: 'mood', label: 'Mood', questionType: 'rating', sortOrder: 5 },
      { questionType: 'unknown', options: 'bad' }
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
      label: 'Frage 2',
      options: null
    });
  });
});

// Diese Vorlage trägt ihre Begründung im Aufbau. Bricht jemand eine der Regeln,
// soll ein Test das sagen und nicht erst die schiefe Auswertung nach dem Event.
describe('the template built on the research about remembered experiences', () => {
  const profile = questionProfiles.find((item) => item.id === 'geprueft-abend');
  const closed = profile.questions.filter((item) => item.questionType === 'multiple_choice');
  const names = profile.questions.map((item) => item.internalName);

  it('stands first, because it is the one to reach for', () => {
    expect(questionProfiles[0].id).toBe('geprueft-abend');
  });

  it('asks for the peak and the end, because memory keeps those two', () => {
    // Peak-end rule: an experience is judged by its most intense moment and its end,
    // hardly by its length.
    expect(names).toContain('staerkster_moment');
    expect(names).toContain('schluss');
  });

  it('does not walk the evening station by station', () => {
    // Music, entry and bar one by one is not how anybody remembers a night out,
    // and every such question costs care on all the answers that follow.
    for (const name of ['musik_passung', 'einlass_wartezeit', 'bar_wartezeit']) {
      expect(names).not.toContain(name);
    }
  });

  it('stays at three questions after the stars', () => {
    // The stars of the guest page are the overall measure and come first; this
    // template repeats nothing of them.
    expect(profile.questions.length).toBeLessThanOrEqual(3);
  });

  it('names every step of its scale, instead of leaving bare numbers', () => {
    expect(closed.length).toBeGreaterThan(0);
    for (const item of closed) {
      expect(item.options.length).toBeGreaterThanOrEqual(4);
      expect(item.options.length).toBeLessThanOrEqual(5);
      for (const option of item.options) {
        expect(option.trim()).not.toBe('');
        expect(option).not.toMatch(/^\d+$/);
      }
    }
    expect(profile.questions.some((item) => item.questionType === 'nps')).toBe(false);
  });

  it('asks about one thing per question and never for agreement', () => {
    for (const item of profile.questions) {
      expect(item.label).not.toMatch(/\bund\b.*\?/i);
    }
    const woerter = profile.questions.flatMap((item) => item.options || []).join(' ').toLowerCase();
    expect(woerter).not.toContain('stimme zu');
    expect(woerter).not.toContain('trifft zu');
  });

  it('puts the one tap first, so leaving early still leaves an answer', () => {
    expect(profile.questions[0].questionType).toBe('multiple_choice');
    const positionen = profile.questions.map((item) => item.questionType.startsWith('text_'));
    expect(positionen.slice(positionen.indexOf(true)).every(Boolean)).toBe(true);
  });

  it('forces no answer, because every forced one costs a finished form', () => {
    expect(profile.questions.some((item) => item.required)).toBe(false);
  });
});
