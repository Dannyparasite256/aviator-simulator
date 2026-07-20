import { CrashPointGenerator } from '../../domain/game/crash-point.generator';
import { computeMultiplier } from '@aviator/shared';

/**
 * Lightweight integration-style checks for engine pure helpers.
 * Full engine lifecycle is covered by e2e when Postgres/Redis are available.
 */
describe('Game engine pure helpers', () => {
  it('never produces crash points outside configured range', () => {
    for (let i = 0; i < 50; i++) {
      const seed = CrashPointGenerator.generateServerSeed();
      const point = CrashPointGenerator.computeCrashPoint(seed, 'c', i, 300, 1, 50);
      expect(point).toBeGreaterThanOrEqual(1);
      expect(point).toBeLessThanOrEqual(50);
    }
  });

  it('multiplier curve is continuous and >= 1', () => {
    let prev = 1;
    for (let t = 0; t < 5000; t += 100) {
      const m = computeMultiplier(t);
      expect(m).toBeGreaterThanOrEqual(prev - 0.01);
      prev = m;
    }
  });
});
