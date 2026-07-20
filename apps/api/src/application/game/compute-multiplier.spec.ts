import { computeMultiplier, elapsedMsForMultiplier, theoreticalEvPerUnit } from '@aviator/shared';

describe('computeMultiplier', () => {
  it('starts at 1.0', () => {
    expect(computeMultiplier(0)).toBe(1);
  });

  it('increases over time', () => {
    expect(computeMultiplier(5000)).toBeGreaterThan(computeMultiplier(1000));
  });

  it('is inverse-compatible with elapsedMsForMultiplier', () => {
    const target = 2.5;
    const ms = elapsedMsForMultiplier(target);
    const m = computeMultiplier(ms);
    expect(Math.abs(m - target)).toBeLessThan(0.05);
  });

  it('respects growthRate', () => {
    expect(computeMultiplier(5000, 0.08)).toBeGreaterThan(computeMultiplier(5000, 0.04));
  });
});

describe('theoreticalEvPerUnit', () => {
  it('is negative with house edge for typical cash-outs', () => {
    expect(theoreticalEvPerUnit(2, 300)).toBeLessThan(0);
  });
});

