import { describe, expect, it } from 'vitest';
import { countdownParts, countdownSegments } from './countdown.js';

const now = new Date('2026-09-18T12:00:00.000Z');

describe('the countdown until a round opens', () => {
  it('splits the wait into days, hours, minutes and seconds', () => {
    const target = new Date('2026-09-30T18:41:07.000Z');

    expect(countdownParts(target, now)).toMatchObject({ days: 12, hours: 6, minutes: 41, seconds: 7, done: false });
  });

  it('counts the last minute down to the second', () => {
    expect(countdownParts(new Date('2026-09-18T12:00:09.000Z'), now)).toMatchObject({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 9,
      done: false
    });
  });

  it('is done once the moment has come and stays done after it', () => {
    expect(countdownParts(now, now).done).toBe(true);
    expect(countdownParts(new Date('2026-09-18T11:59:00.000Z'), now)).toMatchObject({ total: 0, done: true });
  });

  it('reads the date as text, as a Date and as a number', () => {
    const target = '2026-09-18T12:01:00.000Z';

    expect(countdownParts(target, now).minutes).toBe(1);
    expect(countdownParts(new Date(target), now).minutes).toBe(1);
    expect(countdownParts(new Date(target).getTime(), now).minutes).toBe(1);
  });

  it('says nothing when there is no date to wait for', () => {
    expect(countdownParts(null, now)).toBeNull();
    expect(countdownParts('irgendwann', now)).toBeNull();
  });

  it('shows four segments while days are left and three afterwards', () => {
    const far = countdownSegments(countdownParts(new Date('2026-09-20T12:00:00.000Z'), now));
    const near = countdownSegments(countdownParts(new Date('2026-09-18T15:04:05.000Z'), now));

    expect(far.map((segment) => segment.key)).toEqual(['days', 'hours', 'minutes', 'seconds']);
    expect(near.map((segment) => segment.key)).toEqual(['hours', 'minutes', 'seconds']);
  });

  it('pads hours, minutes and seconds so the row keeps its width', () => {
    const segments = countdownSegments(countdownParts(new Date('2026-09-18T15:04:05.000Z'), now));

    expect(segments.map((segment) => segment.value)).toEqual(['03', '04', '05']);
  });

  it('counts days without a leading zero', () => {
    const segments = countdownSegments(countdownParts(new Date('2026-09-23T12:00:00.000Z'), now));

    expect(segments[0]).toMatchObject({ key: 'days', value: '5', label: 'Tage' });
  });

  it('names the segments in the language of the page', () => {
    const parts = countdownParts(new Date('2026-09-23T12:00:00.000Z'), now);

    expect(countdownSegments(parts, 'en').map((segment) => segment.label)).toEqual(['days', 'hrs', 'min', 'sec']);
  });

  it('shows nothing once the round is open', () => {
    expect(countdownSegments(countdownParts(now, now))).toEqual([]);
    expect(countdownSegments(null)).toEqual([]);
  });
});
