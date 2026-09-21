import { describe, expect, it } from 'vitest';
import {
  isKnownType,
  makeKey,
  moveById,
  moveItem,
  needsOptions,
  optionProblems,
  questionPayload,
  questionProblems,
  questionSummary,
  unknownTypeOption
} from './formBuilderUtils.js';

const auswahl = { id: 'a', question_type: 'multiple_choice', required: true, active: true, options: ['Laut', 'Leise'] };

describe('what a collapsed card says about a question', () => {
  it('reads the stored question, so it can never claim an unsaved change', () => {
    expect(questionSummary(auswahl)).toBe('Einfachauswahl · Pflichtfrage · 2 Antworten');
  });

  it('names a hidden question as hidden', () => {
    expect(questionSummary({ question_type: 'text_long', active: false })).toBe('Lange Antwort · ausgeblendet');
  });

  it('counts a single answer in the singular', () => {
    expect(questionSummary({ question_type: 'checkboxes', options: ['Nur eine'] })).toContain('1 Antwort');
  });

  it('says plainly when it does not know the stored type', () => {
    // The dropdown would otherwise pick its first entry and the next save would
    // rewrite the question to a type nobody chose.
    const summary = questionSummary({ question_type: 'single_choice' });

    expect(summary).toContain('Unbekannte Antwortart');
    expect(summary).toContain('single_choice');
    expect(summary).toContain('zeigt sich als Lange Antwort');
  });

  it('offers an unknown type as an entry of its own, and only then', () => {
    expect(unknownTypeOption('single_choice')).toMatchObject({ value: 'single_choice' });
    expect(unknownTypeOption('multiple_choice')).toBe(null);
    expect(unknownTypeOption('')).toBe(null);
    expect(isKnownType('rating')).toBe(true);
    expect(isKnownType('single_choice')).toBe(false);
  });
});

describe('moving a question', () => {
  const liste = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('takes one entry to another place and leaves the rest in order', () => {
    expect(moveItem(liste, 2, 0).map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(moveItem(liste, 0, 1).map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('stays put at the ends instead of falling off the list', () => {
    expect(moveById(liste, 'a', 'up').map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(moveById(liste, 'c', 'down').map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('moves by the id of a question, the way the buttons do', () => {
    expect(moveById(liste, 'b', 'up').map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(moveById(liste, 'b', 'down').map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the list alone for a question it does not hold', () => {
    expect(moveById(liste, 'weg', 'up')).toEqual(liste);
  });

  it('never loses an entry', () => {
    for (const from of [0, 1, 2]) {
      for (const to of [-1, 0, 1, 2, 9]) {
        expect(moveItem(liste, from, to).map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
      }
    }
  });
});

describe('the answers of a choice question', () => {
  it('names an empty answer', () => {
    expect(optionProblems(['Laut', '   ', 'Leise']).join(' ')).toContain('leer');
  });

  it('names a duplicate by its own words', () => {
    const problems = optionProblems(['Laut', 'laut']).join(' ');

    // Upper and lower case look the same to a guest reading the list.
    expect(problems).toContain('laut');
    expect(problems).toContain('zweimal');
  });

  it('asks for at least two answers, because one is no choice', () => {
    expect(optionProblems(['Nur eine']).join(' ')).toContain('mindestens zwei');
    expect(optionProblems(['Laut', 'Leise'])).toEqual([]);
  });

  it('applies to exactly the two types that show a list', () => {
    expect(needsOptions('multiple_choice')).toBe(true);
    expect(needsOptions('checkboxes')).toBe(true);
    for (const type of ['text_short', 'text_long', 'yes_no', 'nps', 'rating']) {
      expect(needsOptions(type)).toBe(false);
    }
  });
});

describe('what the editor sends', () => {
  it('drops the answers of a type that shows no list', () => {
    const payload = questionPayload({ label: 'Wie war der Abend?', questionType: 'text_long', options: ['Alt', 'Übrig'] });

    expect(payload.options).toEqual([]);
    expect(payload.internalName).toBe('wie_war_der_abend');
  });

  it('keeps a key that was typed by hand', () => {
    expect(questionPayload({ label: 'Musik', internalName: 'sound_check', questionType: 'text_short' }).internalName).toBe('sound_check');
  });

  it('trims the answers and leaves out the empty ones', () => {
    expect(questionPayload({ label: 'Musik', questionType: 'checkboxes', options: ['  Techno ', '', 'House'] }).options).toEqual(['Techno', 'House']);
  });

  it('builds a key from umlauts that survives an export', () => {
    expect(makeKey('Wie fühlte sich die Größe an?')).toBe('wie_fuehlte_sich_die_groesse_an');
  });
});

describe('when a question may be saved', () => {
  it('refuses a question without a question', () => {
    expect(questionProblems({ label: '  ', questionType: 'text_long' }).join(' ')).toContain('leeres Feld');
  });

  it('passes a text question on its own', () => {
    expect(questionProblems({ label: 'Wie war die Musik?', questionType: 'text_long' })).toEqual([]);
  });

  it('carries the trouble of the answers up with it', () => {
    expect(questionProblems({ label: 'Wie war die Musik?', questionType: 'multiple_choice', options: ['Laut'] }).join(' '))
      .toContain('mindestens zwei');
  });
});
