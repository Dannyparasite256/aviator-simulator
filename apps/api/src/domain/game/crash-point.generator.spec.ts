import { CrashPointGenerator } from './crash-point.generator';

describe('CrashPointGenerator', () => {
  it('hashes seeds deterministically', () => {
    const seed = 'abc123';
    expect(CrashPointGenerator.hashSeed(seed)).toBe(CrashPointGenerator.hashSeed(seed));
    expect(CrashPointGenerator.hashSeed(seed)).toHaveLength(64);
  });

  it('computes deterministic crash points', () => {
    const a = CrashPointGenerator.computeCrashPoint('s', 'c', 1, 300, 1, 1000);
    const b = CrashPointGenerator.computeCrashPoint('s', 'c', 1, 300, 1, 1000);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(1000);
  });

  it('verify matches computeCrashPoint', () => {
    const v = CrashPointGenerator.verify('seed', 'client', 7, 300);
    expect(v.crashPoint).toBe(
      CrashPointGenerator.computeCrashPoint('seed', 'client', 7, 300),
    );
    expect(v.serverSeedHash).toBe(CrashPointGenerator.hashSeed('seed'));
  });

  it('higher edge tends to lower average over many samples', () => {
    const avg = (edge: number) => {
      let s = 0;
      for (let i = 0; i < 500; i++) {
        s += CrashPointGenerator.computeCrashPoint('master', 'c', i, edge, 1, 1000);
      }
      return s / 500;
    };
    expect(avg(500)).toBeLessThan(avg(100));
  });

  it('previews upcoming crash points', () => {
    const preview = CrashPointGenerator.previewUpcoming('seed', 'client', 0, 5, 300, 1, 100);
    expect(preview).toHaveLength(5);
    expect(preview[0].nonce).toBe(0);
  });

  it('matches deriveRoundServerSeed + compute for previews', () => {
    const master = 'master-seed-abc';
    const client = 'client';
    const nonce = 3;
    const derived = CrashPointGenerator.deriveRoundServerSeed(master, nonce);
    const expected = CrashPointGenerator.computeCrashPoint(derived, client, nonce, 300, 1, 1000);
    const preview = CrashPointGenerator.previewUpcoming(master, client, nonce, 1, 300, 1, 1000);
    expect(preview[0].crashPoint).toBe(expected);
    expect(preview[0].serverSeed).toBe(derived);
  });
});
