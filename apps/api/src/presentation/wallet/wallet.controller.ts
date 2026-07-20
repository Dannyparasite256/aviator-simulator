import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Role, WalletRequestStatus } from '@prisma/client';
import { WalletService } from './wallet.service';

class CreateWalletRequestDto {
  @IsIn(['DEPOSIT', 'WITHDRAW'])
  type!: 'DEPOSIT' | 'WITHDRAW';
  @IsString() currencyCode!: string;
  @IsNumber() @Min(0.00000001) @Max(1_000_000_000) amountCurrency!: number;
  @IsOptional() @IsString() note?: string;
}

class PreferredCurrencyDto {
  @IsString() currencyCode!: string;
}

class ReviewDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() adminNote?: string;
}

class PromoRedeemDto {
  @IsString() @MinLength(3) code!: string;
}

class CreatePromoDto {
  @IsString() @MinLength(3) code!: string;
  @IsNumber() @Min(1) bonusVc!: number;
  @IsOptional() @IsNumber() @Min(1) maxUses?: number;
}

class GrantCreditsDto {
  @IsString() userId!: string;
  @IsNumber() @Min(1) @Max(1_000_000) amountVc!: number;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('currencies')
  @ApiOperation({ summary: 'List virtual display currencies (simulation rates)' })
  currencies() {
    return this.wallet.listCurrencies();
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getWallet(@CurrentUser() user: AuthUser) {
    return this.wallet.getWallet(user.id);
  }

  @Patch('currency')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  setCurrency(@CurrentUser() user: AuthUser, @Body() dto: PreferredCurrencyDto) {
    return this.wallet.setPreferredCurrency(user.id, dto.currencyCode);
  }

  @Post('requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Virtual deposit/withdraw request — admin must approve (not real money)',
  })
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateWalletRequestDto) {
    return this.wallet.createRequest(user.id, dto);
  }

  @Get('requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  myRequests(@CurrentUser() user: AuthUser) {
    return this.wallet.myRequests(user.id);
  }

  @Post('requests/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.wallet.cancelRequest(user.id, id);
  }

  @Post('promo/redeem')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  redeem(@CurrentUser() user: AuthUser, @Body() dto: PromoRedeemDto) {
    return this.wallet.redeemPromo(user.id, dto.code);
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  notifications(@CurrentUser() user: AuthUser) {
    return this.wallet.notifications(user.id);
  }

  @Get('notifications/unread')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  unread(@CurrentUser() user: AuthUser) {
    return this.wallet.unreadCount(user.id);
  }

  @Post('notifications/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  markRead(@CurrentUser() user: AuthUser, @Body() body: { id?: string }) {
    return this.wallet.markRead(user.id, body?.id);
  }

  @Get('admin/requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  adminList(@Query('status') status?: WalletRequestStatus) {
    return this.wallet.adminList(status);
  }

  @Post('admin/requests/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  adminReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.wallet.adminReview(user.id, id, dto.decision, dto.adminNote);
  }

  @Get('admin/promos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  listPromos() {
    return this.wallet.listPromos();
  }

  @Post('admin/promos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  createPromo(@CurrentUser() user: AuthUser, @Body() dto: CreatePromoDto) {
    return this.wallet.createPromo(user.id, dto);
  }

  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: search users for credit grants' })
  adminUsers(@Query('q') q?: string) {
    return this.wallet.adminListUsers(q);
  }

  @Post('admin/grant')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: grant virtual credits directly' })
  adminGrant(@CurrentUser() user: AuthUser, @Body() dto: GrantCreditsDto) {
    return this.wallet.adminGrantCredits(user.id, dto.userId, dto.amountVc, dto.note);
  }
}
