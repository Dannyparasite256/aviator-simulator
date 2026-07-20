import {
  CrashPointGenerator,
} from '../../domain/game/crash-point.generator';
import {
  MonteCarloRequest,
  MonteCarloResult,
  StrategyConfig,
  StrategyRoundResult,
  StrategyRunResult,
  theoreticalEvPerUnit,
} from '@aviator/shared';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed?: string): number {
  if (!seed) return Date.now() % 1_000_000_000;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export class StrategySimulator {
  static run(config: StrategyConfig): StrategyRunResult {
    const edge = config.houseEdgeBps ?? 300;
    const serverSeed = config.seed ?? CrashPointGenerator.generateServerSeed();
    const clientSeed = 'strategy-lab-client';
    let bankroll = config.bankroll;
    let bet = config.baseBet;
    let peak = bankroll;
    let maxDrawdown = 0;
    let wins = 0;
    const equity: number[] = [bankroll];
    const sampleRounds: StrategyRoundResult[] = [];
    let ruined = false;

    for (let i = 0; i < config.rounds; i++) {
      if (bankroll < 1) {
        ruined = true;
        break;
      }

      if (config.type === 'percent_bankroll') {
        const pct = config.bankrollPercent ?? 0.02;
        bet = Math.max(1, Math.floor(bankroll * pct * 100) / 100);
      }

      const maxBet = config.maxBet ?? config.baseBet * 100;
      bet = Math.min(bet, maxBet, bankroll);

      const crash = CrashPointGenerator.computeCrashPoint(
        serverSeed,
        clientSeed,
        i,
        edge,
        1,
        1_000_000,
      );

      const target = config.cashOutAt;
      const success = crash >= target;
      let profit = 0;
      if (success) {
        profit = Math.round(bet * (target - 1) * 100) / 100;
        bankroll = Math.round((bankroll + profit) * 100) / 100;
        wins++;
        if (config.type === 'martingale') bet = config.baseBet;
        if (config.type === 'anti_martingale') {
          bet = Math.min(maxBet, Math.round(bet * 2 * 100) / 100);
        }
      } else {
        profit = -bet;
        bankroll = Math.round((bankroll - bet) * 100) / 100;
        if (config.type === 'martingale') {
          bet = Math.min(maxBet, Math.round(bet * 2 * 100) / 100);
        }
        if (config.type === 'anti_martingale') bet = config.baseBet;
      }

      peak = Math.max(peak, bankroll);
      maxDrawdown = Math.max(maxDrawdown, peak - bankroll);
      equity.push(bankroll);

      if (sampleRounds.length < 50 || i >= config.rounds - 10) {
        sampleRounds.push({
          round: i + 1,
          crashPoint: crash,
          bet,
          cashedOut: success,
          cashOutAt: success ? target : null,
          profit,
          bankroll,
        });
      }
    }

    return {
      config,
      finalBankroll: bankroll,
      netProfit: Math.round((bankroll - config.bankroll) * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      winRate: config.rounds > 0 ? wins / Math.min(config.rounds, equity.length - 1 || 1) : 0,
      roundsPlayed: equity.length - 1,
      ruined,
      equity: equity.filter((_, idx) => idx % Math.max(1, Math.floor(equity.length / 200)) === 0 || idx === equity.length - 1),
      sampleRounds,
      note: 'Virtual strategy simulation only — educational. Negative EV strategies lose long-term with house edge.',
    };
  }

  static monteCarlo(req: MonteCarloRequest): MonteCarloResult {
    const edge = req.houseEdgeBps ?? 300;
    const paths = Math.min(Math.max(req.paths, 10), 5000);
    const rounds = Math.min(Math.max(req.roundsPerPath, 10), 10_000);
    const rng = mulberry32(seedToInt(req.seed));
    const finals: number[] = [];
    let ruinCount = 0;
    let ddSum = 0;

    for (let p = 0; p < paths; p++) {
      let bankroll = req.bankroll;
      let peak = bankroll;
      let maxDd = 0;
      const serverSeed = CrashPointGenerator.generateServerSeed();
      // mix rng into nonce offset
      const nonceBase = Math.floor(rng() * 1_000_000);

      for (let i = 0; i < rounds; i++) {
        if (bankroll < req.bet) {
          ruinCount++;
          break;
        }
        const crash = CrashPointGenerator.computeCrashPoint(
          serverSeed,
          'mc-client',
          nonceBase + i,
          edge,
          1,
          1_000_000,
        );
        if (crash >= req.cashOutAt) {
          bankroll += req.bet * (req.cashOutAt - 1);
        } else {
          bankroll -= req.bet;
        }
        bankroll = Math.round(bankroll * 100) / 100;
        peak = Math.max(peak, bankroll);
        maxDd = Math.max(maxDd, peak - bankroll);
      }
      if (bankroll < req.bet && bankroll < req.bankroll) {
        // already counted if broke mid-path
      }
      finals.push(bankroll);
      ddSum += maxDd;
    }

    finals.sort((a, b) => a - b);
    const mean = finals.reduce((s, n) => s + n, 0) / finals.length;
    const median = finals[Math.floor(finals.length / 2)];

    return {
      paths,
      roundsPerPath: rounds,
      cashOutAt: req.cashOutAt,
      meanFinalBankroll: Math.round(mean * 100) / 100,
      medianFinalBankroll: Math.round(median * 100) / 100,
      ruinRate: Math.round((ruinCount / paths) * 1000) / 1000,
      avgMaxDrawdown: Math.round((ddSum / paths) * 100) / 100,
      theoreticalEvPerRound: Math.round(theoreticalEvPerUnit(req.cashOutAt, edge) * req.bet * 10000) / 10000,
      note: 'Monte Carlo on virtual crash distribution — educational only, not a prediction tool.',
    };
  }
}
