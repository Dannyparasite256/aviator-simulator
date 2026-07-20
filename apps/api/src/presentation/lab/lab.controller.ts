import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { LabService } from './lab.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { StrategyType } from '@aviator/shared';

class StrategyDto {
  @IsIn(['flat', 'fixed_cashout', 'martingale', 'anti_martingale', 'percent_bankroll'])
  type!: StrategyType;
  @IsNumber() @Min(1) baseBet!: number;
  @IsNumber() @Min(1.01) cashOutAt!: number;
  @IsNumber() @Min(1) bankroll!: number;
  @IsNumber() @Min(1) @Max(50_000) rounds!: number;
  @IsOptional() @IsNumber() maxBet?: number;
  @IsOptional() @IsNumber() @Min(0.001) @Max(1) bankrollPercent?: number;
  @IsOptional() @IsNumber() houseEdgeBps?: number;
  @IsOptional() @IsString() seed?: string;
}

class MonteCarloDto {
  @IsNumber() @Min(1.01) cashOutAt!: number;
  @IsNumber() @Min(1) bet!: number;
  @IsNumber() @Min(1) bankroll!: number;
  @IsNumber() @Min(10) @Max(10_000) roundsPerPath!: number;
  @IsNumber() @Min(10) @Max(5000) paths!: number;
  @IsOptional() @IsNumber() houseEdgeBps?: number;
  @IsOptional() @IsString() seed?: string;
}

@ApiTags('lab')
@Controller('lab')
export class LabController {
  constructor(private readonly lab: LabService) {}

  @Post('strategy')
  @ApiOperation({ summary: 'Run virtual betting strategy simulation' })
  strategy(@Body() dto: StrategyDto) {
    return this.lab.runStrategy(dto);
  }

  @Post('monte-carlo')
  @ApiOperation({ summary: 'Monte Carlo ruin / EV simulation' })
  monteCarlo(@Body() dto: MonteCarloDto) {
    return this.lab.monteCarlo(dto);
  }

  @Get('myths')
  @ApiOperation({ summary: 'Betting myths vs math (education)' })
  myths() {
    return this.lab.myths();
  }

  @Get('theoretical')
  theoretical(@Query('cashOutAt') cashOutAt: string, @Query('bet') bet?: string) {
    return this.lab.theoretical(Number(cashOutAt) || 2, Number(bet) || 1);
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current session report + equity curve' })
  session(@CurrentUser() user: AuthUser) {
    return this.lab.sessionReport(user.id);
  }
}
