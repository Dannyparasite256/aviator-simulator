import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { GameEngineService } from '../../application/game/game-engine.service';
import { SimulatedPlayersService } from '../../application/game/simulated-players.service';
import { EdgeScenario, SimulationSettings, ServerMetrics } from '@aviator/shared';
import { AppLogger } from '../../infrastructure/logging/app-logger.service';

@Injectable()
export class AdminService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly engine: GameEngineService,
    private readonly simPlayers: SimulatedPlayersService,
    private readonly logger: AppLogger,
  ) {}

  getActiveRound() {
    // Admin sees full state including current crash point
    return this.engine.getAdminRoundForecast(1).current;
  }

  getRoundForecast(count = 12) {
    return this.engine.getAdminRoundForecast(count);
  }

  async metrics(): Promise<ServerMetrics> {
    const mem = process.memoryUsage();
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      /* ignore */
    }
    const dbLatencyMs = Date.now() - t0;
    const current = this.engine.getCurrentState();

    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      memoryRssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      memoryHeapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      activeConnections: this.engine.getConnectionCount(),
      currentRoundId: current?.id ?? null,
      currentPhase: current?.phase ?? null,
      ticksPerSecond: this.engine.getTicksPerSecond(),
      redisConnected: this.redis.isConnected,
      dbLatencyMs,
    };
  }

  getSettings() {
    return this.engine.getSettings();
  }

  async updateSettings(partial: Partial<SimulationSettings>, actorId: string) {
    const settings = await this.engine.updateSettings(partial, actorId);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'settings.update',
        resource: 'simulation_config',
        details: { ...partial } as object,
      },
    });
    this.logger.event('admin', 'settings_update', { actorId, partial });
    return settings;
  }

  async applyScenario(scenario: EdgeScenario, actorId: string) {
    const settings = await this.engine.applyScenario(scenario, actorId);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'settings.scenario',
        resource: 'simulation_config',
        details: { scenario },
      },
    });
    return settings;
  }

  getSeeds() {
    return {
      currentMasterSeedHash: this.engine.getMasterSeedHash(),
      masterSeed: this.engine.getMasterSeedForAdmin(),
      nextNonce: this.engine.getNextNonce(),
      roundClientSeed: this.engine.getRoundClientSeed(),
      note: 'Educational seed inspection for simulation audit only',
    };
  }

  previewCrashPoints(count = 10) {
    const forecast = this.engine.getAdminRoundForecast(count);
    return {
      current: forecast.current,
      next: forecast.next,
      items: forecast.upcoming,
      disclaimer: forecast.disclaimer,
    };
  }

  async rtpReport(limit = 5000) {
    const settings = this.engine.getSettings();
    const rounds = await this.prisma.round.findMany({
      where: { phase: 'CRASHED', crashPoint: { not: null } },
      orderBy: { roundNumber: 'desc' },
      take: limit,
      select: { crashPoint: true, roundNumber: true },
    });
    const bets = await this.prisma.practiceBet.findMany({
      where: { status: { in: ['CASHED_OUT', 'BUSTED'] } },
      take: limit,
      select: { amount: true, profit: true, status: true },
    });

    const avgCrash =
      rounds.length > 0
        ? rounds.reduce((s, r) => s + Number(r.crashPoint), 0) / rounds.length
        : 0;
    const stake = bets.reduce((s, b) => s + Number(b.amount), 0);
    const net = bets.reduce(
      (s, b) => s + Number(b.profit ?? (b.status === 'BUSTED' ? -Number(b.amount) : 0)),
      0,
    );
    const observedRtp = stake > 0 ? (stake + net) / stake : null;

    return {
      roundsSampled: rounds.length,
      betsSampled: bets.length,
      averageCrashPoint: Math.round(avgCrash * 100) / 100,
      houseEdgeBps: settings.houseEdgeBps,
      theoreticalRtp: 1 - settings.houseEdgeBps / 10_000,
      observedRtp: observedRtp != null ? Math.round(observedRtp * 10000) / 10000 : null,
      totalStake: stake,
      netPlayerProfit: Math.round(net * 100) / 100,
      edgeScenario: settings.edgeScenario,
      note: 'RTP is educational; small samples vary widely due to variance',
    };
  }

  async exportFairnessProofs(limit = 500) {
    const rounds = await this.prisma.round.findMany({
      where: { phase: 'CRASHED' },
      orderBy: { roundNumber: 'desc' },
      take: limit,
      select: {
        id: true,
        roundNumber: true,
        crashPoint: true,
        serverSeed: true,
        serverSeedHash: true,
        clientSeed: true,
        nonce: true,
        crashedAt: true,
      },
    });
    return {
      exportedAt: new Date().toISOString(),
      houseEdgeBps: this.engine.getSettings().houseEdgeBps,
      disclaimer: 'Fairness proof export — educational simulation audit only',
      rounds: rounds.map((r) => ({
        ...r,
        crashPoint: r.crashPoint != null ? Number(r.crashPoint) : null,
        crashedAt: r.crashedAt?.toISOString() ?? null,
      })),
    };
  }

  async listSimPlayers() {
    return this.prisma.simulatedPlayer.findMany({ orderBy: { name: 'asc' } });
  }

  async createSimPlayer(data: { name: string; avatarHue?: number; personality?: string }) {
    const p = await this.prisma.simulatedPlayer.create({
      data: {
        name: data.name,
        avatarHue: data.avatarHue ?? Math.floor(Math.random() * 360),
        personality: data.personality ?? 'mixed',
        active: true,
      },
    });
    await this.simPlayers.reload();
    return p;
  }

  async updateSimPlayer(
    id: string,
    data: { name?: string; avatarHue?: number; active?: boolean; personality?: string },
  ) {
    try {
      const p = await this.prisma.simulatedPlayer.update({ where: { id }, data });
      await this.simPlayers.reload();
      return p;
    } catch {
      throw new NotFoundException('Simulated player not found');
    }
  }

  async deleteSimPlayer(id: string) {
    await this.prisma.simulatedPlayer.delete({ where: { id } });
    await this.simPlayers.reload();
    return { ok: true };
  }

  async exportLogs(limit = 500) {
    const [audit, analytics, events] = await Promise.all([
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      this.prisma.analyticsEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      this.prisma.roundEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { round: { select: { roundNumber: true } } },
      }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      disclaimer: 'Simulation logs export — educational use only',
      audit,
      analytics,
      roundEvents: events,
    };
  }

  liveSimPlayers() {
    return this.simPlayers.getActive();
  }
}
