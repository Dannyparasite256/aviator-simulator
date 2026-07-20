import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { GameEngineService } from '../../application/game/game-engine.service';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: GameEngineService,
  ) {}

  async me(userId: string) {
    const bets = await this.prisma.practiceBet.findMany({ where: { userId } });
    const totalPracticeBets = bets.length;
    const cashed = bets.filter((b) => b.status === 'CASHED_OUT' || b.cashedOut);
    const totalPracticeProfit = bets.reduce((s, b) => {
      if (b.profit != null) return s + Number(b.profit);
      if (b.status === 'BUSTED') return s - Number(b.amount);
      return s;
    }, 0);
    const bestMultiplier = cashed.reduce(
      (m, b) => Math.max(m, b.cashOutMultiplier != null ? Number(b.cashOutMultiplier) : 0),
      0,
    );
    const averageCashOut =
      cashed.length > 0
        ? cashed.reduce((s, b) => s + Number(b.cashOutMultiplier ?? 0), 0) / cashed.length
        : 0;
    const settled = bets.filter((b) => b.status === 'CASHED_OUT' || b.status === 'BUSTED');
    const winRate = settled.length > 0 ? cashed.length / settled.length : 0;
    const rounds = new Set(bets.map((b) => b.roundId).filter(Boolean)).size;

    return {
      totalRoundsPlayed: rounds,
      totalPracticeBets,
      totalPracticeProfit: Math.round(totalPracticeProfit * 100) / 100,
      bestMultiplier: Math.round(bestMultiplier * 100) / 100,
      averageCashOut: Math.round(averageCashOut * 100) / 100,
      winRate: Math.round(winRate * 1000) / 1000,
    };
  }

  async global() {
    const settings = this.engine.getSettings();
    const [totalRounds, agg, volume, activeUsers, settled] = await Promise.all([
      this.prisma.round.count({ where: { phase: 'CRASHED' } }),
      this.prisma.round.aggregate({
        where: { phase: 'CRASHED', crashPoint: { not: null } },
        _avg: { crashPoint: true },
        _max: { crashPoint: true },
        _min: { crashPoint: true },
      }),
      this.prisma.practiceBet.aggregate({ _sum: { amount: true } }),
      this.prisma.user.count(),
      this.prisma.practiceBet.findMany({
        where: { status: { in: ['CASHED_OUT', 'BUSTED'] } },
        select: { amount: true, profit: true, status: true },
        take: 50_000,
      }),
    ]);

    let observedRtp: number | null = null;
    if (settled.length > 0) {
      const stake = settled.reduce((s, b) => s + Number(b.amount), 0);
      const net = settled.reduce((s, b) => s + Number(b.profit ?? (b.status === 'BUSTED' ? -Number(b.amount) : 0)), 0);
      // RTP = (stake + net profit) / stake
      observedRtp = stake > 0 ? Math.round(((stake + net) / stake) * 10000) / 10000 : null;
    }

    return {
      totalRounds,
      averageCrashPoint: Number(agg._avg.crashPoint ?? 0),
      highestCrashPoint: Number(agg._max.crashPoint ?? 0),
      lowestCrashPoint: Number(agg._min.crashPoint ?? 0),
      totalPracticeVolume: Number(volume._sum.amount ?? 0),
      activeUsers,
      observedRtp,
      theoreticalRtp: 1 - settings.houseEdgeBps / 10_000,
    };
  }
}
