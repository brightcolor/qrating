import { describe, expect, it } from 'vitest';
import { toggleUpcoming, upcomingFull } from './upcomingChoice.js';

describe('picking upcoming events by hand', () => {
  it('adds and removes an event', () => {
    expect(toggleUpcoming(['a'], 'b', 3)).toEqual(['a', 'b']);
    expect(toggleUpcoming(['a', 'b'], 'a', 3)).toEqual(['b']);
  });

  it('takes no further event at the limit, and lets one go out', () => {
    expect(upcomingFull(['a', 'b'], 2)).toBe(true);
    expect(toggleUpcoming(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    expect(toggleUpcoming(['a', 'b'], 'b', 2)).toEqual(['a']);
  });

  it('knows no limit while the server has named none', () => {
    expect(upcomingFull(['a', 'b', 'c'], null)).toBe(false);
    expect(toggleUpcoming(['a', 'b', 'c'], 'd', null)).toEqual(['a', 'b', 'c', 'd']);
  });
});
