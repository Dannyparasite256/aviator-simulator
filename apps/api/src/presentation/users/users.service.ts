import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Decimal } from '@prisma/client/runtime/library';
import { CrashPointGenerator } from '../../domain/game/crash-point.generator';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    return this.auth.toPublic(user);
  }

  async adjustCredits(userId: string, delta: number) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { virtualCredits: { increment: delta } },
    });
    return this.auth.toPublic(user);
  }

  async setCredits(userId: string, amount: number) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { virtualCredits: new Decimal(amount) },
    });
    return this.auth.toPublic(user);
  }

  async resetSession(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        sessionStartedAt: new Date(),
        sessionProfit: 0,
      },
    });
    return this.auth.toPublic(user);
  }

  async updateSessionSettings(
    userId: string,
    dto: {
      sessionLossLimit?: number | null;
      sessionTimeLimitMin?: number | null;
      minBet?: number;
      maxBet?: number;
    },
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        sessionLossLimit:
          dto.sessionLossLimit === undefined
            ? undefined
            : dto.sessionLossLimit === null
              ? null
              : new Decimal(dto.sessionLossLimit),
        sessionTimeLimitMin:
          dto.sessionTimeLimitMin === undefined ? undefined : dto.sessionTimeLimitMin,
        minBet: dto.minBet != null ? new Decimal(dto.minBet) : undefined,
        maxBet: dto.maxBet != null ? new Decimal(dto.maxBet) : undefined,
      },
    });
    return this.auth.toPublic(user);
  }

  async setClientSeed(userId: string, clientSeed: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { clientSeed: clientSeed.slice(0, 128) },
    });
    return this.auth.toPublic(user);
  }

  async rotateClientSeed(userId: string) {
    return this.setClientSeed(userId, CrashPointGenerator.generateClientSeed());
  }
}
