import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';
import { PublicUser } from '@aviator/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists. Try logging in.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        role: Role.USER,
        virtualCredits: 10000,
        clientSeed: `user-${Date.now().toString(36)}`,
        sessionStartedAt: new Date(),
      },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await this.storeRefreshHash(user.id, tokens.refreshToken);
    return { user: this.toPublic(user), tokens };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await this.storeRefreshHash(user.id, tokens.refreshToken);

    if (!user.sessionStartedAt) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { sessionStartedAt: new Date() },
      });
      user.sessionStartedAt = new Date();
    }

    return { user: this.toPublic(user), tokens };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify<{ sub: string; type: string }>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET', 'dev-refresh'),
      });
      if (payload.type !== 'refresh') throw new Error('not refresh');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user?.refreshTokenHash) throw new UnauthorizedException();
      const match = await bcrypt.compare(refreshToken, user.refreshTokenHash);
      if (!match) throw new UnauthorizedException();
      const tokens = await this.issueTokens(user.id, user.email, user.role);
      await this.storeRefreshHash(user.id, tokens.refreshToken);
      return { user: this.toPublic(user), tokens };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { ok: true };
  }

  toPublic(user: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
    virtualCredits: { toString(): string } | number;
    clientSeed?: string | null;
    preferredCurrency?: string | null;
    minBet?: { toString(): string } | number;
    maxBet?: { toString(): string } | number;
    maxProfitPerBet?: { toString(): string } | number;
    sessionLossLimit?: { toString(): string } | number | null;
    sessionTimeLimitMin?: number | null;
    sessionStartedAt?: Date | null;
    sessionProfit?: { toString(): string } | number;
    createdAt: Date;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      virtualCredits: Number(user.virtualCredits),
      preferredCurrency: user.preferredCurrency ?? 'USD',
      clientSeed: user.clientSeed ?? 'aviator-default-client',
      minBet: user.minBet != null ? Number(user.minBet) : 1,
      maxBet: user.maxBet != null ? Number(user.maxBet) : 100000,
      maxProfitPerBet: user.maxProfitPerBet != null ? Number(user.maxProfitPerBet) : 1000000,
      sessionLossLimit:
        user.sessionLossLimit != null ? Number(user.sessionLossLimit) : null,
      sessionTimeLimitMin: user.sessionTimeLimitMin ?? null,
      sessionStartedAt: user.sessionStartedAt?.toISOString() ?? null,
      sessionProfit: user.sessionProfit != null ? Number(user.sessionProfit) : 0,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async issueTokens(userId: string, email: string, role: Role) {
    const accessToken = await this.jwt.signAsync({
      sub: userId,
      email,
      role,
      type: 'access',
    });
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET', 'dev-refresh');
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: 'refresh' },
      {
        secret: refreshSecret,
        expiresIn: refreshExpires as `${number}d`,
      },
    );
    return { accessToken, refreshToken };
  }

  private async storeRefreshHash(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }
}
