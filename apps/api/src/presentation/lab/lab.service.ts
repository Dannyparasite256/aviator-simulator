import { Injectable } from '@nestjs/common';
import { StrategySimulator } from '../../application/lab/strategy-simulator';
import {
  BETTING_MYTHS,
  MonteCarloRequest,
  StrategyConfig,
  theoreticalEvPerUnit,
} from '@aviator/shared';
import { GameEngineService } from '../../application/game/game-engine.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class LabService {
  constructor(
    private readonly engine: GameEngineService,
    private readonly prisma: PrismaService,
  ) {}

  runStrategy(config: StrategyConfig) {
    const edge = config.houseEdgeBps ?? this.engine.getSettings().houseEdgeBps;
    return StrategySimulator.run({ ...config, houseEdgeBps: edge });
  }

  monteCarlo(req: MonteCarloRequest) {
    const edge = req.houseEdgeBps ?? this.engine.getSettings().houseEdgeBps;
    return StrategySimulator.monteCarlo({ ...req, houseEdgeBps: edge });
  }

  myths() {
    return {
      items: BETTING_MYTHS,
      note: 'Educational content for software-engineering / risk literacy demos',
    };
  }

  theoretical(cashOutAt: number, bet = 1) {
    const edge = this.engine.getSettings().houseEdgeBps;
    const evUnit = theoreticalEvPerUnit(cashOutAt, edge);
    return {
      cashOutAt,
      houseEdgeBps: edge,
      theoreticalRtp: 1 - edge / 10_000,
      evPerUnit: evUnit,
      evPerBet: evUnit * bet,
      note: 'Approximation under classic crash model with constant auto cash-out',
    };
  }

  async sessionReport(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const snaps = await this.prisma.bankrollSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const bets = await this.prisma.practiceBet.findMany({
      where: {
        userId,
        status: { in: ['CASHED_OUT', 'BUSTED'] },
        createdAt: user.sessionStartedAt
          ? { gte: user.sessionStartedAt }
          : undefined,
      },
    });
    const wins = bets.filter((b) => b.status === 'CASHED_OUT').length;
    const losses = bets.filter((b) => b.status === 'BUSTED').length;
    const bestCashOut = bets.reduce(
      (m, b) => Math.max(m, b.cashOutMultiplier != null ? Number(b.cashOutMultiplier) : 0),
      0,
    );
    return {
      sessionStartedAt: user.sessionStartedAt?.toISOString() ?? null,
      sessionProfit: Number(user.sessionProfit),
      sessionLossLimit: user.sessionLossLimit != null ? Number(user.sessionLossLimit) : null,
      sessionTimeLimitMin: user.sessionTimeLimitMin,
      bets: bets.length,
      wins,
      losses,
      bestCashOut,
      equity: snaps.map((s) => ({
        t: s.createdAt.toISOString(),
        bankroll: Number(s.bankroll),
        profit: Number(s.profit),
      })),
      myths: BETTING_MYTHS,
    };
  }
}
