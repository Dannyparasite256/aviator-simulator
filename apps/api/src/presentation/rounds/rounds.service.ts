import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class RoundsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(limit = 50, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.round.findMany({
        orderBy: { roundNumber: 'desc' },
        take: Math.min(limit, 100),
        skip: offset,
      }),
      this.prisma.round.count(),
    ]);
    return {
      total,
      items: items.map((r) => this.summary(r)),
    };
  }

  async get(id: string) {
    const round = await this.prisma.round.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!round) throw new NotFoundException('Round not found');
    return {
      ...this.summary(round),
      serverSeed: round.phase === 'CRASHED' ? round.serverSeed : null,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
      durationMs: round.durationMs,
      peakMultiplier: round.peakMultiplier != null ? Number(round.peakMultiplier) : null,
      events: round.events.map((e) => ({
        id: e.id,
        type: e.type,
        multiplier: e.multiplier != null ? Number(e.multiplier) : null,
        payload: e.payload as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async replay(id: string) {
    const detail = await this.get(id);
    if (detail.phase !== 'CRASHED' || detail.crashPoint == null) {
      throw new NotFoundException('Replay only available for completed rounds');
    }
    // Reconstruct tick samples for client-side replay (educational)
    const samples: Array<{ t: number; m: number }> = [];
    const { computeMultiplier, elapsedMsForMultiplier } = await import('@aviator/shared');
    const growthRate = 0.06;
    const totalMs = elapsedMsForMultiplier(detail.crashPoint, growthRate);
    const step = 16;
    for (let t = 0; t <= totalMs; t += step) {
      samples.push({ t, m: computeMultiplier(t, growthRate) });
    }
    samples.push({ t: totalMs, m: detail.crashPoint });
    return {
      round: detail,
      samples,
      note: 'Educational replay of simulated round — virtual practice only',
    };
  }

  private summary(r: {
    id: string;
    roundNumber: number;
    phase: string;
    crashPoint: { toString(): string } | null;
    startedAt: Date | null;
    crashedAt: Date | null;
    serverSeedHash: string;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      roundNumber: r.roundNumber,
      phase: r.phase,
      crashPoint: r.crashPoint != null ? Number(r.crashPoint) : null,
      startedAt: r.startedAt?.toISOString() ?? null,
      crashedAt: r.crashedAt?.toISOString() ?? null,
      serverSeedHash: r.serverSeedHash,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
