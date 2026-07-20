import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PracticeService } from './practice.service';
import { BetSlot } from '@aviator/shared';

class PracticeBetDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(1)
  @Max(1_000_000)
  amount!: number;

  @ApiProperty({ example: 1, enum: [1, 2] })
  @IsNumber()
  @IsIn([1, 2])
  slot!: BetSlot;

  @ApiPropertyOptional({ example: 2.0 })
  @IsOptional()
  @IsNumber()
  @Min(1.01)
  @Max(10000)
  autoCashOutAt?: number;

  @ApiPropertyOptional({ description: 'Queue for next round if betting closed' })
  @IsOptional()
  @IsBoolean()
  queueIfClosed?: boolean;
}

class CashOutDto {
  @ApiProperty({ example: 1, enum: [1, 2] })
  @IsNumber()
  @IsIn([1, 2])
  slot!: BetSlot;

  @ApiPropertyOptional({ example: 1, description: '1 = full, 0.5 = half (partial)' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  fraction?: number;
}

class CancelDto {
  @ApiProperty({ example: 1, enum: [1, 2] })
  @IsNumber()
  @IsIn([1, 2])
  slot!: BetSlot;
}

@ApiTags('practice')
@Controller('practice')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Get('bets')
  @ApiOperation({ summary: 'Active/queued practice bets (dual slots)' })
  bets(@CurrentUser() user: AuthUser) {
    return this.practice.getActiveBets(user.id);
  }

  @Post('bet')
  @ApiOperation({ summary: 'Place practice bet (virtual credits only)' })
  bet(@CurrentUser() user: AuthUser, @Body() dto: PracticeBetDto) {
    return this.practice.placeBet(user.id, dto);
  }

  @Post('cashout')
  @ApiOperation({ summary: 'Cash out slot (optional partial fraction)' })
  cashout(@CurrentUser() user: AuthUser, @Body() dto: CashOutDto) {
    return this.practice.cashOut(user.id, dto.slot, dto.fraction ?? 1);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel bet during WAITING/COUNTDOWN or queued' })
  cancel(@CurrentUser() user: AuthUser, @Body() dto: CancelDto) {
    return this.practice.cancelBet(user.id, dto.slot);
  }

  /** Legacy query cashout for slot 1 */
  @Post('cashout-legacy')
  cashoutLegacy(@CurrentUser() user: AuthUser, @Query('slot') slot?: string) {
    return this.practice.cashOut(user.id, (Number(slot) === 2 ? 2 : 1) as BetSlot, 1);
  }
}
