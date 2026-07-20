import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { RoundsService } from '../rounds/rounds.service';
import { EdgeScenario } from '@aviator/shared';

class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(30) countdownSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(30) waitingSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) minCrashMultiplier?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) maxCrashMultiplier?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(2000) houseEdgeBps?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(8) @Max(50) tickMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(30) @Max(144) targetFps?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) simulatedPlayersMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) simulatedPlayersMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() debugMode?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoRestart?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() practiceDefaultBet?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() minBet?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxBet?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxProfitPerBet?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowPartialCashOut?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() seedRotateEveryNRounds?: number;
  @ApiPropertyOptional() @IsOptional() @IsIn(['early', 'balanced', 'moon', 'mixed']) botPersonality?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['low', 'standard', 'high', 'long_tail']) edgeScenario?: EdgeScenario;
  @ApiPropertyOptional() @IsOptional() @IsNumber() growthRate?: number;
}

class ScenarioDto {
  @IsIn(['low', 'standard', 'high', 'long_tail'])
  scenario!: EdgeScenario;
}

class SimPlayerDto {
  @IsString() name!: string;
  @IsOptional() @IsInt() avatarHue?: number;
  @IsOptional() @IsString() personality?: string;
}

class UpdateSimPlayerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() avatarHue?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() personality?: string;
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly rounds: RoundsService,
  ) {}

  @Get('rounds/active')
  @ApiOperation({ summary: 'Current live round including crash point (admin only)' })
  activeRound() {
    return this.admin.getActiveRound();
  }

  @Get('rounds/next')
  @ApiOperation({
    summary: 'See current + next round crash points (admin forecast for testing only)',
  })
  nextRounds(@Query('count') count?: string) {
    return this.admin.getRoundForecast(Number(count) || 12);
  }

  @Get('metrics')
  metrics() {
    return this.admin.metrics();
  }

  @Get('settings')
  getSettings() {
    return this.admin.getSettings();
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.admin.updateSettings(dto as object, user.id);
  }

  @Post('settings/scenario')
  @ApiOperation({ summary: 'Apply edge scenario preset (low/standard/high/long_tail)' })
  scenario(@CurrentUser() user: AuthUser, @Body() dto: ScenarioDto) {
    return this.admin.applyScenario(dto.scenario, user.id);
  }

  @Get('rtp')
  @ApiOperation({ summary: 'Observed vs theoretical RTP report' })
  rtp(@Query('limit') limit?: string) {
    return this.admin.rtpReport(Number(limit) || 5000);
  }

  @Get('seeds')
  seeds() {
    return this.admin.getSeeds();
  }

  @Get('preview-crashes')
  preview(@Query('count') count?: string) {
    return this.admin.previewCrashPoints(Number(count) || 10);
  }

  @Get('logs/export')
  exportLogs(@Query('limit') limit?: string) {
    return this.admin.exportLogs(Number(limit) || 500);
  }

  @Get('fairness/export')
  @ApiOperation({ summary: 'Export fairness proofs CSV-ready JSON' })
  exportFairness(@Query('limit') limit?: string) {
    return this.admin.exportFairnessProofs(Number(limit) || 500);
  }

  @Get('sim-players')
  listSimPlayers() {
    return this.admin.listSimPlayers();
  }

  @Get('sim-players/live')
  liveSimPlayers() {
    return this.admin.liveSimPlayers();
  }

  @Post('sim-players')
  createSimPlayer(@Body() dto: SimPlayerDto) {
    return this.admin.createSimPlayer(dto);
  }

  @Patch('sim-players/:id')
  updateSimPlayer(@Param('id') id: string, @Body() dto: UpdateSimPlayerDto) {
    return this.admin.updateSimPlayer(id, dto);
  }

  @Delete('sim-players/:id')
  deleteSimPlayer(@Param('id') id: string) {
    return this.admin.deleteSimPlayer(id);
  }

  @Get('rounds/:id/replay')
  replay(@Param('id') id: string) {
    return this.rounds.replay(id);
  }
}
