import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { calculateFeedbackWindow, isEventFeedbackOpen, rankCandidateEvents } from '../src/services/eventResolver.js';

function event(overrides = {}) {
  return {
    id: 'event-1',
    name: 'Test',
    date_from: '2026-09-05T18:00:00+02:00',
    date_to: null,
    event_timezone: 'Europe/Berlin',
    feedback_enabled: true,
    status: 'active',
    feedback_starts_mode: 'event_start',
    feedback_window_days: 3,
    feedback_window_hours: null,
    resolver_priority: 0,
    not_found_in_source: false,
    ...overrides
  };
}

describe('EventResolver window logic', () => {
  it('handles events without date_to', () => {
    const window = calculateFeedbackWindow(event({ feedback_window_days: 2 }));
    expect(window.feedbackEnd.toISO()).toContain('2026-09-07T18:00:00');
  });

  it('handles events with date_to', () => {
    const window = calculateFeedbackWindow(event({ date_to: '2026-09-05T23:59:00+02:00', feedback_window_days: 5 }));
    expect(window.feedbackEnd.toISO()).toContain('2026-09-10T23:59:00');
  });

  it('supports zero-day feedback windows', () => {
    const item = event({ date_to: '2026-09-05T23:00:00+02:00', feedback_window_days: 0 });
    expect(isEventFeedbackOpen(item, DateTime.fromISO('2026-09-05T22:00:00+02:00'))).toBe(true);
    expect(isEventFeedbackOpen(item, DateTime.fromISO('2026-09-06T00:01:00+02:00'))).toBe(false);
  });

  it('supports three-day feedback windows', () => {
    const item = event({ date_to: '2026-09-05T23:00:00+02:00', feedback_window_days: 3 });
    expect(isEventFeedbackOpen(item, DateTime.fromISO('2026-09-08T22:59:00+02:00'))).toBe(true);
  });

  it('honors event timezones', () => {
    const item = event({
      date_from: '2026-09-05T18:00:00-04:00',
      date_to: '2026-09-05T21:00:00-04:00',
      event_timezone: 'America/New_York',
      feedback_window_days: 1
    });
    expect(isEventFeedbackOpen(item, DateTime.fromISO('2026-09-06T20:00:00-04:00'))).toBe(true);
  });

  it('ranks running events before recently ended events', () => {
    const running = event({ id: 'running', date_from: '2026-09-05T18:00:00+02:00', date_to: '2026-09-05T23:00:00+02:00' });
    const ended = event({ id: 'ended', date_from: '2026-09-04T18:00:00+02:00', date_to: '2026-09-04T23:00:00+02:00', resolver_priority: 99 });
    const ranked = rankCandidateEvents([ended, running], DateTime.fromISO('2026-09-05T20:00:00+02:00'));
    expect(ranked[0].id).toBe('running');
  });

  it('uses resolver priority when multiple non-running events are open', () => {
    const a = event({ id: 'a', date_from: '2026-09-04T18:00:00+02:00', date_to: '2026-09-04T23:00:00+02:00', resolver_priority: 1 });
    const b = event({ id: 'b', date_from: '2026-09-03T18:00:00+02:00', date_to: '2026-09-03T23:00:00+02:00', resolver_priority: 10 });
    const ranked = rankCandidateEvents([a, b], DateTime.fromISO('2026-09-05T20:00:00+02:00'));
    expect(ranked[0].id).toBe('b');
  });

  it('returns no candidates when no event is open', () => {
    const ranked = rankCandidateEvents([event({ feedback_enabled: false })], DateTime.fromISO('2026-09-05T20:00:00+02:00'));
    expect(ranked).toHaveLength(0);
  });

  it('excludes disabled events and not-found Pretix events', () => {
    const disabled = event({ id: 'disabled', feedback_enabled: false });
    const missing = event({ id: 'missing', not_found_in_source: true });
    expect(rankCandidateEvents([disabled, missing], DateTime.fromISO('2026-09-05T20:00:00+02:00'))).toHaveLength(0);
  });

  it('supports sub-events as independent events', () => {
    const sub = event({ id: 'sub-12', pretix_subevent_id: 12, date_from: '2026-09-05T20:00:00+02:00' });
    expect(isEventFeedbackOpen(sub, DateTime.fromISO('2026-09-05T20:30:00+02:00'))).toBe(true);
  });
});
