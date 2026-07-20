import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

class TrackDto {
  @IsString() category!: string;
  @IsString() action!: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('track')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Track client analytics event' })
  track(@CurrentUser() user: AuthUser, @Body() dto: TrackDto) {
    return this.analytics.track(dto.category, dto.action, {
      userId: user.id,
      label: dto.label,
      metadata: dto.metadata,
    });
  }

  @Get('recent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recent analytics events (admin)' })
  recent(@Query('limit') limit?: string) {
    return this.analytics.recent(Number(limit) || 100);
  }
}
