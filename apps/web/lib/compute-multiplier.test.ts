import { describe, it, expect } from 'vitest';
import { computeMultiplier, elapsedMsForMultiplier } from '@aviator/shared';

describe('shared multiplier helpers', () => {
  it('starts near 1', () => {
    expect(computeMultiplier(0)).toBe(1);
  });

  it('grows monotonically', () => {
    expect(computeMultiplier(10_000)).toBeGreaterThan(computeMultiplier(1_000));
  });

  it('round-trips approximately', () => {
    const m = 3.5;
    const t = elapsedMsForMultiplier(m);
    expect(Math.abs(computeMultiplier(t) - m)).toBeLessThan(0.05);
  });
});
