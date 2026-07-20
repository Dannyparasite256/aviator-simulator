import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

class SessionSettingsDto {
  @IsOptional() @IsNumber() @Min(0) sessionLossLimit?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(24 * 60) sessionTimeLimitMin?: number | null;
  @IsOptional() @IsNumber() @Min(1) minBet?: number;
  @IsOptional() @IsNumber() @Min(1) maxBet?: number;
}

class ClientSeedDto {
  @IsString() @MinLength(4) clientSeed!: string;
}

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user profile (virtual credits)' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Post('me/reset-credits')
  @ApiOperation({ summary: 'Reset virtual practice credits to 10,000' })
  resetCredits(@CurrentUser() user: AuthUser) {
    return this.users.setCredits(user.id, 10000);
  }

  @Post('me/session/reset')
  @ApiOperation({ summary: 'Start a fresh practice session counters' })
  resetSession(@CurrentUser() user: AuthUser) {
    return this.users.resetSession(user.id);
  }

  @Patch('me/session')
  @ApiOperation({ summary: 'Update session risk limits (virtual safety rails)' })
  updateSession(@CurrentUser() user: AuthUser, @Body() dto: SessionSettingsDto) {
    return this.users.updateSessionSettings(user.id, dto);
  }

  @Patch('me/client-seed')
  @ApiOperation({ summary: 'Set personal client seed (for fairness demos)' })
  clientSeed(@CurrentUser() user: AuthUser, @Body() dto: ClientSeedDto) {
    return this.users.setClientSeed(user.id, dto.clientSeed);
  }
}
