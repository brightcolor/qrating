import { describe, expect, it } from 'vitest';
import { progressShare } from './flow.js';

describe('the progress bar of the guest page', () => {
  const total = 6;
  const shares = Array.from({ length: total }, (_, index) => progressShare(index, total));

  it('stands at nothing before the first answer and is full once the form is sent', () => {
    expect(shares[0]).toBe(0);
    expect(progressShare(total - 1, total, true)).toBe(1);
  });

  it('moves fast early and slowly late', () => {
    const steps = shares.slice(1).map((share, index) => share - shares[index]);

    expect(steps[0]).toBeGreaterThan(steps.at(-1));
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]).toBeLessThan(steps[index - 1]);
    }
  });

  it('never runs behind even progress', () => {
    shares.forEach((share, index) => {
      expect(share).toBeGreaterThanOrEqual(index / total);
    });
  });

  it('never goes backwards and never leaves the bar', () => {
    for (let index = 1; index < shares.length; index += 1) {
      expect(shares[index]).toBeGreaterThan(shares[index - 1]);
    }
    expect(progressShare(99, total)).toBe(1);
    expect(progressShare(-3, total)).toBe(0);
    expect(progressShare(0, 0)).toBe(0);
  });
});
