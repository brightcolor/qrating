import { describe, expect, it } from 'vitest';
import {
  callbacksFirst,
  choiceQuestions,
  distributionRows,
  durationLeft,
  eventPhase,
  filterVoices,
  formatAverage,
  formatDayTime,
  formatLongDate,
  formatWhen,
  funnelSteps,
  hourColumns,
  kpis,
  pickCurrentEvent,
  recentActivity,
  relativeTime,
  roundInfo,
  textAnswers,
  timelineModel,
  voiceCounts,
  voiceView
} from './model.js';

const zone = 'Europe/Berlin';
// Sa 19.09.2026, 21:00 in Berlin is 19:00 UTC.
const event = {
  status: 'active',
  feedback_enabled: true,
  event_timezone: zone,
  date_from: '2026-09-19T19:00:00Z',
  feedbackWindow: { feedbackStart: '2026-09-19T15:30:00Z', feedbackEnd: '2026-09-22T20:00:00Z' }
};

describe('dates as the admin area writes them', () => {
  it('writes weekday, date and time the German way, in the zone of the event', () => {
    expect(formatDayTime('2026-09-22T20:00:00Z', zone)).toBe('Di 22.09., 22:00');
    expect(formatWhen('2026-09-19T22:41:00Z', zone)).toBe('So 00:41');
    expect(formatLongDate('2026-09-19T19:00:00Z', zone)).toBe('Samstag, 19.09.2026, 21:00');
  });

  it('says how long is left in words', () => {
    expect(durationLeft(30 * 3_600_000)).toBe('noch 1 Tag');
    expect(durationLeft(50 * 3_600_000)).toBe('noch 2 Tage');
    expect(durationLeft(5 * 3_600_000)).toBe('noch 5 Stunden');
    expect(durationLeft(20 * 60_000)).toBe('noch 20 Minuten');
    expect(durationLeft(60_000)).toBe('noch 1 Minute');
  });

  it('says how long ago a vote came in', () => {
    const now = new Date('2026-09-21T12:00:00Z');
    expect(relativeTime('2026-09-21T11:56:00Z', now)).toBe('vor 4 Min.');
    expect(relativeTime('2026-09-21T10:00:00Z', now)).toBe('vor 2 Std.');
    expect(relativeTime('2026-09-18T12:00:00Z', now)).toBe('vor 3 Tagen');
    expect(relativeTime('2026-09-21T12:00:00Z', now)).toBe('gerade eben');
  });
});

describe('the state of a round', () => {
  it('is open between start and end, and says until when', () => {
    const round = roundInfo(event, new Date('2026-09-21T12:20:00Z'));

    expect(round.state).toBe('open');
    expect(round.label).toBe('Runde offen bis Di 22.09., 22:00');
    expect(round.short).toBe('Runde offen bis Di 22:00');
    expect(round.left).toBe('noch 1 Tag');
  });

  it('names the start of a round still to come', () => {
    const round = roundInfo(event, new Date('2026-09-18T12:00:00Z'));

    expect(round.state).toBe('before');
    expect(round.label).toBe('Runde startet Sa 19.09., 17:30');
  });

  it('says a round is over once its end has passed', () => {
    expect(roundInfo(event, new Date('2026-09-23T00:00:00Z')).state).toBe('after');
  });

  it('puts an archived event or one without feedback before the dates', () => {
    expect(roundInfo({ ...event, status: 'archived' }, new Date('2026-09-21T12:00:00Z')).short).toBe('Archiviert');
    expect(roundInfo({ ...event, feedback_enabled: false }, new Date('2026-09-21T12:00:00Z')).state).toBe('off');
  });

  it('opens the running round first, else the next one, else the latest', () => {
    const coming = { ...event, id: 'c', date_from: '2026-10-24T18:00:00Z', feedbackWindow: { feedbackStart: '2026-10-24T18:00:00Z', feedbackEnd: '2026-10-27T18:00:00Z' } };
    const past = { ...event, id: 'p', date_from: '2026-08-22T18:00:00Z', feedbackWindow: { feedbackStart: '2026-08-22T18:00:00Z', feedbackEnd: '2026-08-25T18:00:00Z' } };
    const running = { ...event, id: 'r' };
    const now = new Date('2026-09-21T12:00:00Z');

    expect(pickCurrentEvent([past, coming, running], now).id).toBe('r');
    expect(pickCurrentEvent([past, coming], now).id).toBe('c');
    expect(pickCurrentEvent([past], now).id).toBe('p');
    expect(pickCurrentEvent([], now)).toBe(null);
  });

  it('sorts events into running, coming and over', () => {
    expect(eventPhase(event, new Date('2026-09-21T12:00:00Z'))).toBe('live');
    expect(eventPhase(event, new Date('2026-09-01T12:00:00Z'))).toBe('soon');
    expect(eventPhase(event, new Date('2026-10-01T12:00:00Z'))).toBe('past');
  });
});

describe('the numbers of an evaluation', () => {
  const analytics = {
    summary: { total: 86, only_stars: 14, average_rating: '4.31', newsletter_optins: 27 },
    funnel: { sessions: 131, completed: 72, completionRate: 55, scanned: 212, scansBefore: 31, scansAfter: 0, scansCounted: true },
    cases: { open: 2, open_with_phone: 1 }
  };

  it('reads the numbers on top from the answer of the server', () => {
    expect(kpis(analytics)).toMatchObject({
      votes: 86, onlyStars: 14, average: '4,3', opened: 131, sent: 72, completion: 55,
      scans: 212, scansBefore: 31, newsletter: 27, openCases: 2, openWithPhone: 1
    });
  });

  it('writes an average with a comma and a dash when there is none', () => {
    expect(formatAverage('4.31')).toBe('4,3');
    expect(formatAverage(null)).toBe('–');
    expect(formatAverage(5)).toBe('5,0');
  });

  it('lists the stars from five to one, the fullest row as the longest bar', () => {
    const rows = distributionRows([{ rating: 5, count: 51 }, { rating: 1, count: 3 }, { rating: 4, count: 21 }]);

    expect(rows.map((row) => [row.stars, row.count])).toEqual([[5, 51], [4, 21], [3, 0], [2, 0], [1, 3]]);
    expect(rows[0].share).toBe(1);
  });

  it('keeps the night in columns and sums the rest as later', () => {
    const at = (iso, count) => ({ bucket: iso, count });
    const columns = hourColumns([
      at('2026-09-19T19:00:00Z', 3), at('2026-09-19T20:00:00Z', 6), at('2026-09-19T22:00:00Z', 15),
      at('2026-09-20T09:00:00Z', 4), at('2026-09-21T10:00:00Z', 7)
    ], { columns: 4, zone });

    expect(columns.map((column) => column.label)).toEqual(['21', '22', '23', '0', 'später']);
    expect(columns.map((column) => column.count)).toEqual([3, 6, 0, 15, 11]);
  });

  it('adds the sent forms as the last step of the way', () => {
    const { basis, steps } = funnelSteps({
      scanned: 212, sessions: 131, completed: 72, scansCounted: true,
      steps: [
        { kind: 'scan', reached: 212, dropped: 81 },
        { kind: 'rating', reached: 131, dropped: 20, label: 'Wie war es?' },
        { kind: 'question', reached: 78, dropped: 4, label: 'Wie war der Schluss?' }
      ]
    });

    expect(basis).toBe(212);
    expect(steps.map((step) => step.label)).toEqual(['QR-Code gescannt', 'Bewertung geöffnet', 'Wie war der Schluss?', 'Abgeschickt']);
    expect(steps.at(-1)).toMatchObject({ count: 72, percent: 34 });
  });

  it('starts the way at the opened form when the scans were not counted', () => {
    expect(funnelSteps({ scanned: 3, sessions: 9, completed: 4, scansCounted: false, steps: [{ kind: 'rating', reached: 9 }] }).basis).toBe(9);
  });
});

describe('the answers of the form', () => {
  it('counts the answers of every choice question, most chosen first', () => {
    const questions = choiceQuestions([
      { id: 'q1', label: 'Wie war der Schluss?', question_type: 'multiple_choice', answer_value: '"Gut"', count: 24 },
      { id: 'q1', label: 'Wie war der Schluss?', question_type: 'multiple_choice', answer_value: 'Ein richtig starkes Ende', count: 38 },
      { id: 'q2', label: 'Was hat gepasst?', question_type: 'checkboxes', answer_value: ['Musik', 'Licht'], count: 2 },
      { id: 'q2', label: 'Was hat gepasst?', question_type: 'checkboxes', answer_value: ['Musik'], count: 1 },
      { id: 'q3', label: 'Stärkster Moment', question_type: 'text_short', answer_value: 'Das Licht', count: 1 }
    ]);

    expect(questions.map((question) => question.label)).toEqual(['Wie war der Schluss?', 'Was hat gepasst?']);
    expect(questions[0].answers).toEqual([{ value: 'Ein richtig starkes Ende', count: 38 }, { value: 'Gut', count: 24 }]);
    expect(questions[1].answers).toEqual([{ value: 'Musik', count: 3 }, { value: 'Licht', count: 2 }]);
  });

  it('groups what guests wrote by question', () => {
    const groups = textAnswers([
      { id: 'a', rating: 5, texts: [{ label: 'Stärkster Moment', value: 'Das Licht' }] },
      { id: 'b', rating: 2, texts: [{ label: 'Stärkster Moment', value: 'Die Band' }, { label: 'Was ändern', value: 'Garderobe' }] }
    ]);

    expect(groups.map((group) => [group.label, group.answers.length])).toEqual([['Stärkster Moment', 2], ['Was ändern', 1]]);
  });
});

describe('the voices of the guests', () => {
  const voices = [
    { id: '1', rating: 5, completed: true, texts: [{ label: 'Stärkster Moment', value: 'Das Licht' }], submittedAt: '2026-09-21T11:56:00Z', source: 'Bändchen' },
    { id: '2', rating: 1, completed: true, texts: [{ label: 'Was ändern', value: 'Zu voll' }], caseOpen: true, submittedAt: '2026-09-21T11:20:00Z', sourceType: 'event_specific' },
    { id: '3', rating: 4, completed: false, texts: [], submittedAt: '2026-09-21T09:00:00Z', sourceType: 'dynamic' }
  ];

  it('counts each filter', () => {
    expect(voiceCounts(voices)).toEqual({ all: 3, text: 2, low: 1, callback: 1, stars: 1 });
    expect(filterVoices(voices, 'low').map((voice) => voice.id)).toEqual(['2']);
    expect(filterVoices(voices, 'unbekannt')).toHaveLength(3);
  });

  it('names where a vote came from and what it said first', () => {
    expect(voiceView(voices[0], zone)).toMatchObject({ place: 'Bändchen', kind: 'Stärkster Moment', text: 'Das Licht', when: 'Mo 13:56' });
    expect(voiceView(voices[1], zone).place).toBe('Eventlink');
    expect(voiceView(voices[2], zone)).toMatchObject({ place: 'QR-Code', kind: 'nur Sterne', text: null });
  });

  it('puts the open calls on top', () => {
    expect(callbacksFirst(voices).map((voice) => voice.id)).toEqual(['2', '1', '3']);
  });

  it('counts the last hour and gives the newest their age', () => {
    const activity = recentActivity(voices, new Date('2026-09-21T12:00:00Z'));

    expect(activity.lastHour).toBe(2);
    expect(activity.latest.map((item) => item.ago)).toEqual(['vor 4 Min.', 'vor 40 Min.', 'vor 3 Std.']);
  });
});

describe('the round as a line', () => {
  it('places the round, the event start and now along the line', () => {
    const line = timelineModel(event, [{ bucket: '2026-09-19T22:00:00Z', count: 15 }], new Date('2026-09-21T12:20:00Z'));

    expect(line.round.left).toBeGreaterThan(0);
    expect(line.round.left + line.round.width).toBeLessThan(100);
    expect(line.eventStart).toBeGreaterThan(line.round.left);
    expect(line.now).toBeGreaterThan(line.eventStart);
    expect(line.bars).toHaveLength(1);
    expect(line.days.map((day) => day.label)).toEqual(['So', 'Mo', 'Di', 'Mi']);
  });

  it('draws no line for an event without a round', () => {
    expect(timelineModel({ status: 'active' }, [])).toBe(null);
  });
});
