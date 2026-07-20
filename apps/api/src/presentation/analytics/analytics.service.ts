import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AppLogger } from '../../infrastructure/logging/app-logger.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async track(
    category: string,
    action: string,
    opts: { userId?: string; label?: string; metadata?: Record<string, unknown> } = {},
  ) {
    const row = await this.prisma.analyticsEvent.create({
      data: {
        category,
        action,
        label: opts.label,
        userId: opts.userId,
        metadata: (opts.metadata ?? {}) as object,
      },
    });
    this.logger.event(category, action, opts.metadata ?? {});
    return row;
  }

  async recent(limit = 100) {
    return this.prisma.analyticsEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}
