import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { LoggerModule } from './infrastructure/logging/logger.module';
import { AuthModule } from './presentation/auth/auth.module';
import { UsersModule } from './presentation/users/users.module';
import { GameModule } from './presentation/game/game.module';
import { RoundsModule } from './presentation/rounds/rounds.module';
import { StatsModule } from './presentation/stats/stats.module';
import { AdminModule } from './presentation/admin/admin.module';
import { AnalyticsModule } from './presentation/analytics/analytics.module';
import { HealthModule } from './presentation/health/health.module';
import { FairnessModule } from './presentation/fairness/fairness.module';
import { LabModule } from './presentation/lab/lab.module';
import { WalletModule } from './presentation/wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    LoggerModule,
    AuthModule,
    UsersModule,
    GameModule,
    RoundsModule,
    StatsModule,
    AdminModule,
    AnalyticsModule,
    HealthModule,
    FairnessModule,
    LabModule,
    WalletModule,
  ],
})
export class AppModule {}
